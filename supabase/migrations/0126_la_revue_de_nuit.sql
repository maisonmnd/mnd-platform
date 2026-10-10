-- ═══════════════════════════════════════════════════════════════════
-- 0126 · LA REVUE DE NUIT · 10 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Se rejoue sans
-- danger : chaque politique, fonction et déclencheur est remplacé, chaque
-- index ne se pose qu'une fois, et le seul nettoyage de données (⑨) ne
-- touche que les lignes qui en ont encore besoin. AVANT de recoller les
-- fonctions Edge de la même revue (kkiapay-verify, kkiapay-webhook, puis
-- les autres).
--
-- La revue de code de la nuit du 9 au 10 octobre a trouvé, côté base :
--   ① cc_depot : un dépôt anonyme « geste » pouvait porter un montant libre
--     (100 F réglés, « Création complète » offerte), et aucun dépôt n'avait
--     de borne de taille. Le geste naît SANS montant, le montant reste entre
--     5 000 et 500 000 F, l'identifiant a la forme du site, la ligne pèse
--     moins de 4 000 signes.
--   ② Une transaction KkiaPay ne règle qu'UNE carte : index unique sur
--     `transactionId`, posé seulement si la table n'a pas déjà de doublon
--     (le contrôle les compte, la Maison les relit).
--   ③ Secrétariat : « chacun sa signature » se contournait en passant la
--     pièce par un autre genre. La garde ne fait plus confiance à une
--     ancienne ligne qui n'était pas une pièce, et garde aussi la pièce qui
--     change de genre.
--   ④ emprunts, entrees_hors_activite, messages_wa : leur `updated_at` ne
--     bougeait jamais. L'arbitrage hors ligne (sync.ts) le lit comme l'heure
--     du serveur : un geste d'un autre poste s'écrasait sans conflit.
--   ⑤ Les fils de l'équipe ne se rangent plus à CHAQUE écriture d'une fiche
--     de l'équipe ou d'un fournisseur : seulement à une entrée ou à un
--     changement de numéro, et pour CE numéro.
--   ⑥ appels_wa : « appel_ecrit » (for all) laissait tout le personnel
--     effacer ; l'effacement revient à la direction seule.
--   ⑦ tete_du_numero, tiroir_du_numero, numero_est_reserve : une cliente
--     connectée à Ma Couronne pouvait demander si un numéro est celui d'une
--     employée. Elles répondent « clientes » à tout compte qui n'est pas du
--     personnel. Le grant reste : whatsapp-envoi interroge la porte avec le
--     jeton de l'appelant, et un refus d'exécution l'ouvrirait.
--   ⑧ messages_wa : une clé d'unicité d'envoi (`cleUnique`) n'existe qu'une
--     fois (lot synchro ; whatsapp-envoi la réserve déjà par l'identifiant).
--   ⑨ blocages : le motif d'un blocage posé par un rendez-vous ne garde plus
--     le nom de la cliente (lot clients-coeur, constat 104).
--
-- `is_staff()` (0003), `est_direction()` (0089), `touch_updated_at()`
-- (0001), `numero_wa` (0102) et les tables visées sont passés.
-- ═══════════════════════════════════════════════════════════════════


-- ── ① LE DÉPÔT D'UNE CARTE CADEAU ──────────────────────────────────
drop policy if exists cc_depot on public.cartes_cadeaux;
create policy cc_depot on public.cartes_cadeaux for insert to anon, authenticated
  with check (
    id ~ '^cc-[a-z0-9]{8,32}$'
    and length(data::text) < 4000
    and data->>'statut' = 'a-regler'
    and data->>'code' is null
    and data->>'transactionId' is null
    and data->>'payeLe' is null
    and data->>'creditId' is null
    and data->>'clientId' is null
    and (
      (data->>'objet' = 'geste' and data->'montantXof' is null)
      or (data->>'objet' = 'montant'
          and jsonb_typeof(data->'montantXof') = 'number'
          and (data->>'montantXof')::numeric between 5000 and 500000)
    )
  );


-- ── ② UNE TRANSACTION, UNE CARTE ───────────────────────────────────
-- Posé seulement sans doublon : un index refusé ferait tomber toute la
-- migration. S'il en reste, le contrôle ② les compte.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'cartes_cadeaux_transaction_unique')
     and not exists (
       select 1 from public.cartes_cadeaux
        where data->>'transactionId' is not null
        group by data->>'transactionId' having count(*) > 1
     ) then
    create unique index cartes_cadeaux_transaction_unique
      on public.cartes_cadeaux ((data->>'transactionId')) where data->>'transactionId' is not null;
  end if;
end $$;


-- ── ③ CHACUN SA SIGNATURE, QUEL QUE SOIT LE GENRE ──────────────────
-- Avant : une ligne qui n'était pas une pièce sortait d'emblée. On posait
-- une signature volée sur une ligne « entreprise », puis on la repassait en
-- pièce : la signature était déjà « là avant », rien ne criait. Désormais :
--   · une ancienne ligne qui n'était pas une pièce ne prouve rien ;
--   · une pièce qui change de genre garde ses poses sous la même règle.
create or replace function public.secretariat_garde_les_signatures() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  avant jsonb;
  pose jsonb;
  moi text := coalesce(auth.uid()::text, '');
begin
  if tg_op = 'UPDATE' then
    avant := old.data;
  else
    select s.data into avant from public.secretariat s where s.id = new.id;
  end if;
  if new.data->>'genre' is distinct from 'piece'
     and (avant is null or avant->>'genre' is distinct from 'piece') then
    return new;
  end if;
  if avant is not null and avant->>'genre' is distinct from 'piece' then
    avant := null;
  end if;
  for pose in select * from jsonb_array_elements(coalesce(new.data->'poses', '[]'::jsonb)) loop
    if pose ? 'image' and pose->>'cle' like 'sig:%'
       and not exists (
         select 1 from jsonb_array_elements(coalesce(avant->'poses', '[]'::jsonb)) a
         where a->>'cle' = pose->>'cle' and a->>'image' = pose->>'image'
       ) then
      if not (
        (moi <> '' and pose->>'cle' = 'sig:' || moi and pose->>'signePar' = moi)
        or (pose->>'cle' = 'sig:entreprise' and public.est_direction())
      ) then
        raise exception 'Chacun ne pose que sa propre signature.';
      end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists secretariat_garde_les_signatures on public.secretariat;
create trigger secretariat_garde_les_signatures before insert or update on public.secretariat
  for each row execute function public.secretariat_garde_les_signatures();


-- ── ④ L'HEURE DU SERVEUR BOUGE À CHAQUE ÉCRITURE ───────────────────
do $$
declare t text;
begin
  foreach t in array array['entrees_hors_activite', 'emprunts', 'messages_wa'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);
  end loop;
end $$;


-- ── ⑤ LES FILS SE RANGENT À UNE ENTRÉE OU À UN NOUVEAU NUMÉRO ──────
-- range_les_fils (0102) balayait tout messages_wa, trois requêtes par
-- message, à chaque écriture d'une fiche : réordonner l'équipe en faisait
-- autant de balayages que de fiches, dans une seule instruction. On ne
-- balaie plus que le numéro de la ligne écrite, et seulement s'il est
-- neuf. Le répertoire des prestataires (un seul document) garde le
-- balayage entier, mais seulement quand il a vraiment changé.
create or replace function public.range_les_fils_du_numero() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  num text := public.numero_wa(case when tg_table_name = 'fournisseurs'
                                    then new.data->>'telephone' else new.data->>'phone' end);
begin
  if coalesce(num, '') = '' or public.tiroir_du_numero(num) = 'clientes' then
    return null;
  end if;
  update public.messages_wa
     set data = data
   where coalesce(data->>'tiroir', 'clientes') = 'clientes'
     and public.numero_wa(data->>'numero') = num;
  return null;
end;
$$;

revoke execute on function public.range_les_fils_du_numero() from public, anon, authenticated;

drop trigger if exists team_range_les_fils on public.team;
drop trigger if exists team_range_les_fils_entree on public.team;
create trigger team_range_les_fils_entree after insert on public.team
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.range_les_fils_du_numero();
create trigger team_range_les_fils after update of data on public.team
  for each row
  when (pg_trigger_depth() = 0 and old.data->>'phone' is distinct from new.data->>'phone')
  execute function public.range_les_fils_du_numero();

drop trigger if exists fournisseurs_range_les_fils on public.fournisseurs;
drop trigger if exists fournisseurs_range_les_fils_entree on public.fournisseurs;
create trigger fournisseurs_range_les_fils_entree after insert on public.fournisseurs
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.range_les_fils_du_numero();
create trigger fournisseurs_range_les_fils after update of data on public.fournisseurs
  for each row
  when (pg_trigger_depth() = 0 and old.data->>'telephone' is distinct from new.data->>'telephone')
  execute function public.range_les_fils_du_numero();

drop trigger if exists documents_range_les_fils on public.documents;
drop trigger if exists documents_range_les_fils_entree on public.documents;
create trigger documents_range_les_fils_entree after insert on public.documents
  for each row
  when (new.key = 'mnd_prestataires' and pg_trigger_depth() = 0)
  execute function public.range_les_fils();
create trigger documents_range_les_fils after update of data on public.documents
  for each row
  when (new.key = 'mnd_prestataires' and pg_trigger_depth() = 0 and old.data is distinct from new.data)
  execute function public.range_les_fils();


-- ── ⑥ LE JOURNAL DES APPELS : LA DIRECTION SEULE EFFACE ────────────
-- Une politique « for all » couvre aussi l'effacement, et les politiques
-- permissives s'additionnent : appel_efface (direction) ne restreignait
-- rien. On sépare : le personnel pose et met à jour, la direction efface.
drop policy if exists appel_ecrit on public.appels_wa;
drop policy if exists appel_insere on public.appels_wa;
drop policy if exists appel_modifie on public.appels_wa;
create policy appel_insere on public.appels_wa for insert to authenticated
  with check (public.is_staff());
create policy appel_modifie on public.appels_wa for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists appel_efface on public.appels_wa;
create policy appel_efface on public.appels_wa for delete to authenticated
  using (public.est_direction());


-- ── ⑦ À QUI EST CE NUMÉRO : LE PERSONNEL ET LE SERVEUR SEULS ───────
-- Le corps de 0102, précédé d'une garde : un compte connecté qui n'est
-- pas du personnel (une cliente de Ma Couronne) reçoit « clientes », comme
-- pour tout numéro inconnu. Le serveur (sans compte) et le personnel
-- lisent la vraie réponse. tiroir_du_numero passe par ici.
create or replace function public.tete_du_numero(n text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  num text := public.numero_wa(n);
  r record;
begin
  if auth.uid() is not null and not public.is_staff() then
    return jsonb_build_object('tiroir', 'clientes');
  end if;
  if num = '' then return jsonb_build_object('tiroir', 'clientes'); end if;

  select t.id, t.branch_id into r
    from public.team t
   where public.numero_wa(t.data->>'phone') = num
   limit 1;
  if found then
    return jsonb_build_object('tiroir', 'equipe', 'staffId', r.id, 'branchId', r.branch_id);
  end if;

  select p->>'id' as id, p->>'branchId' as branch_id into r
    from public.documents d,
         jsonb_array_elements(case when jsonb_typeof(d.data) = 'array' then d.data else '[]'::jsonb end) p
   where d.key = 'mnd_prestataires'
     and coalesce((p->>'archived')::boolean, false) = false
     and public.numero_wa(p->>'phone') = num
   limit 1;
  if found then
    return jsonb_build_object('tiroir', 'prestataires', 'prestataireId', r.id, 'branchId', r.branch_id);
  end if;

  select f.id, f.branch_id into r
    from public.fournisseurs f
   where public.numero_wa(f.data->>'telephone') = num
   limit 1;
  if found then
    return jsonb_build_object('tiroir', 'prestataires', 'fournisseurId', r.id, 'branchId', r.branch_id);
  end if;

  return jsonb_build_object('tiroir', 'clientes');
end;
$$;

create or replace function public.numero_est_reserve(n text) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or public.is_staff())
     and (public.tiroir_du_numero(n) <> 'clientes'
          or exists (
            select 1 from public.messages_wa m
             where m.data->>'numero' = public.numero_wa(n)
               and coalesce(m.data->>'tiroir', 'clientes') <> 'clientes'
          ));
$$;

revoke execute on function public.tete_du_numero(text) from public, anon;
revoke execute on function public.tiroir_du_numero(text) from public, anon;
revoke execute on function public.numero_est_reserve(text) from public, anon;
grant execute on function public.tete_du_numero(text) to authenticated, service_role;
grant execute on function public.tiroir_du_numero(text) to authenticated, service_role;
grant execute on function public.numero_est_reserve(text) to authenticated, service_role;


-- ── ⑧ UNE CLÉ D'UNICITÉ D'ENVOI N'EXISTE QU'UNE FOIS ───────────────
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'messages_wa_cle_unique')
     and not exists (
       select 1 from public.messages_wa
        where data ? 'cleUnique'
        group by data->>'cleUnique' having count(*) > 1
     ) then
    create unique index messages_wa_cle_unique
      on public.messages_wa ((data->>'cleUnique')) where data ? 'cleUnique';
  end if;
end $$;


-- ── ⑨ LE MOTIF D'UN BLOCAGE NE NOMME PLUS LA CLIENTE ───────────────
-- Les écrans n'écrivent plus que « rdv:<id> · Salon Souverain » (lot
-- clients-coeur, constat 104) ; les motifs déjà écrits perdent ce qui
-- suivait la virgule. Une ligne nettoyée ne correspond plus au filtre :
-- rejouer ne change rien.
update public.blocages
   set data = jsonb_set(data, '{motif}', to_jsonb(regexp_replace(data->>'motif', '^(rdv:\S+ · Salon Souverain),.*$', '\1'))),
       updated_at = now()
 where data->>'motif' ~ '^rdv:\S+ · Salon Souverain,';


-- ── LE CONTRÔLE, en lignes de résultat (l'éditeur n'affiche pas les NOTICE)
-- Attendu : « en place » ou « oui » partout ; les lignes 3, 11 et 12
-- comptent ce que la Maison relit (0 attendu pour 11).
select n, quoi, etat from (
  select 1 as n, 'cc_depot : geste sans montant, montant borné, taille bornée' as quoi,
         case when not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cartes_cadeaux' and policyname = 'cc_depot') then 'ABSENTE'
              when (select with_check from pg_policies where schemaname = 'public' and tablename = 'cartes_cadeaux' and policyname = 'cc_depot')
                   like '%length((data)::text) < 4000%geste%montantXof''::text) IS NULL%'
              then 'en place' else 'ANCIENNE' end as etat
  union all
  select 2, 'une transaction, une carte (index unique)',
         case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'cartes_cadeaux_transaction_unique') then 'en place'
              else 'NON POSÉ : ' || (select count(*) from (select 1 from public.cartes_cadeaux where data->>'transactionId' is not null
                                      group by data->>'transactionId' having count(*) > 1) d)::text || ' transaction(s) en double, à relire' end
  union all
  select 3, 'cartes « geste » déjà réglées par KkiaPay (à relire)',
         (select count(*) from public.cartes_cadeaux where data->>'objet' = 'geste' and data->>'methode' = 'KkiaPay')::text
  union all
  select 4, 'secrétariat : la garde ne croit plus un autre genre',
         case when pg_get_functiondef('public.secretariat_garde_les_signatures()'::regprocedure) like '%avant := null%'
              then 'en place' else 'ANCIENNE' end
  union all
  select 5, 'heure du serveur : emprunts, hors activité, messages',
         (select count(*) from pg_trigger where not tgisinternal and tgname in ('entrees_hors_activite_touch', 'emprunts_touch', 'messages_wa_touch'))::text || ' sur 3'
  union all
  select 6, 'fils rangés à une entrée ou un nouveau numéro',
         case when (select count(*) from pg_trigger where not tgisinternal and tgname in
                      ('team_range_les_fils', 'team_range_les_fils_entree', 'fournisseurs_range_les_fils',
                       'fournisseurs_range_les_fils_entree', 'documents_range_les_fils', 'documents_range_les_fils_entree')) = 6
               and pg_get_triggerdef((select oid from pg_trigger where tgname = 'team_range_les_fils' and tgrelid = 'public.team'::regclass)) like '%phone%'
              then 'en place' else 'INCOMPLET' end
  union all
  select 7, 'appels_wa : la direction seule efface',
         case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'appels_wa' and cmd = 'ALL') then 'FOR ALL ENCORE'
              when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'appels_wa'
                      and policyname in ('appel_lu', 'appel_insere', 'appel_modifie', 'appel_efface')) = 4 then 'en place'
              else 'INCOMPLET' end
  union all
  select 8, 'tete_du_numero : rien pour une cliente',
         case when pg_get_functiondef('public.tete_du_numero(text)'::regprocedure) like '%not public.is_staff()%' then 'en place' else 'OUVERTE' end
  union all
  select 9, 'numero_est_reserve : rien pour une cliente',
         case when pg_get_functiondef('public.numero_est_reserve(text)'::regprocedure) like '%public.is_staff()%' then 'en place' else 'OUVERTE' end
  union all
  select 10, 'messages_wa : une clé d''unicité, une ligne',
         case when exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'messages_wa_cle_unique') then 'en place'
              else 'NON POSÉ : clés en double, à relire' end
  union all
  select 11, 'blocages dont le motif nomme encore la cliente',
         (select count(*) from public.blocages where data->>'motif' ~ '^rdv:\S+ · Salon Souverain,')::text
  union all
  select 12, 'transactions KkiaPay portées par plus d''une carte',
         (select count(*) from (select 1 from public.cartes_cadeaux where data->>'transactionId' is not null
                                 group by data->>'transactionId' having count(*) > 1) d)::text
) as controle
order by n;
