-- ═══════════════════════════════════════════════════════════════════════════
-- 0157 · LES POURBOIRES DE L'ÉQUIPE — 5 novembre 2026
--
-- « Je veux voir le tableau clair des pourboires des employés. Ils ont besoin
-- de savoir combien ils gagnent au fur et à mesure » (Yéman, 4 novembre
-- 2026). Maquette 2e4ZNFxyREv6mxG4vakuh5 validée ; son choix : UNE
-- NOTIFICATION SUR LE TÉLÉPHONE DE CHACUN À CHAQUE POURBOIRE, sa part seule,
-- « +1 000 F de pourboire · Ranti », la cliente par son prénom, jamais le
-- montant de la pièce ni le nom entier.
--
-- POURQUOI UN DÉCLENCHEUR, ET PAS UN APPEL DU TRÔNE. Quatre chemins écrivent
-- des parts : « Encaisser le rituel », la Caisse, le repartage du registre
-- (Encaissements) et le règlement en ligne. Un poste hors ligne les écrit plus
-- tard, quand la file d'attente se vide. Seule la base voit passer CHAQUE
-- part, une fois, au moment où elle entre : `after insert` sur `tips` (un
-- upsert d'une ligne déjà là est un `update`, il ne déclenche rien). Et la
-- base parle avec la clé service : celle ou celui qui encaisse n'a pas à
-- être souverain pour que l'équipe soit prévenue.
--
-- CE QUI PART : la fonction `push-notify`, mode `to-staff` (31 octobre 2026,
-- les assistants reliés), par `appelle_fonction_edge` (0069, Vault). Le
-- compte se retrouve comme `est_ma_fiche` (0090) : l'adresse de la fiche
-- (`compteMail`, sinon `email`) = l'adresse du compte, et le compte doit être
-- du personnel. Le texte est écrit ICI, d'après les seules colonnes de la
-- ligne : rien de ce qu'un écran envoie ne passe sur un téléphone.
--
-- LES GARDES :
--   · jamais la panne d'une notification ne refuse un pourboire : tout le
--     corps est sous `exception when others` ;
--   · une part ne se dit qu'une fois (journal `pourboires_prevenus`, clé =
--     l'identifiant de la part) ;
--   · le jour DE LA PART juge, jamais l'heure de l'écriture : une part datée
--     de plus de deux jours (un repartage du registre, une reprise) ne
--     sonne pas ;
--   · cinq notifications au plus par personne en dix minutes : une écriture
--     en masse ne fait pas vibrer un téléphone en boucle.
--
-- LE TEXTE est celui de src/shared/pourboires-de-l-equipe-pur.ts
-- (`notificationDuPourboire`, `prenomDeLaCliente`, `francsDits`, `MOIS_DITS`) ;
-- le banc verifie-les-pourboires-de-l-equipe compare les deux au mot près.
--
-- Rejouable : `if not exists`, `create or replace`, `drop … if exists`.
-- `est_direction()` vient de 0089 ; `appelle_fonction_edge(nom, corps)` de 0069.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. LE JOURNAL : une part, une seule notification ───────────────────
create table if not exists public.pourboires_prevenus (
  tip_id     text primary key,
  staff_id   text not null,
  prevenu_le timestamptz not null default now(),
  -- 'parti' · 'sans-adresse' · 'sans-compte' · 'ancien' · 'tempere' · 'refuse : …'
  issue      text not null default 'parti'
);
alter table public.pourboires_prevenus enable row level security;
create index if not exists pourboires_prevenus_staff_idx on public.pourboires_prevenus (staff_id, prevenu_le);
drop policy if exists pourboires_prevenus_lire on public.pourboires_prevenus;
create policy pourboires_prevenus_lire on public.pourboires_prevenus for select to authenticated
  using (public.est_direction());
-- Personne n'y écrit que le déclencheur (security definer).
revoke insert, update, delete, truncate on public.pourboires_prevenus from anon, authenticated;


-- ── 2. LES MOTS : le prénom de la cliente, les francs, le mois ─────────
-- ⟨prenom-de-la-cliente⟩ : la règle de `prenomDeLaCliente` (le premier mot du
-- nom, civilité sautée ; rien si ce n'est pas un prénom).
create or replace function public.prenom_de_la_cliente(nom text) returns text
language plpgsql immutable set search_path = public as $$
declare
  mots text[];
  p text;
begin
  mots := regexp_split_to_array(trim(coalesce(nom, '')), '\s+');
  if mots is null or coalesce(array_length(mots, 1), 0) = 0 or mots[1] = '' then
    return '';
  end if;
  while array_length(mots, 1) > 1 and mots[1] ~* '^(m\.?|mr\.?|mme\.?|mlle\.?|madame|mademoiselle|monsieur|dr\.?)$' loop
    mots := mots[2:array_length(mots, 1)];
  end loop;
  p := mots[1];
  if p = '' or char_length(p) > 30 or p ~ '[0-9@+/_:;]' or p ~ '^[[:punct:]]+$' then
    return '';
  end if;
  return p;
end;
$$;

-- « 1 000 F » : l'espace fine insécable (U+202F) de fr-FR, comme le Trône.
create or replace function public.francs_dits(n bigint) returns text
language sql immutable as $$
  select replace(to_char(n, 'FM999,999,999,990'), ',', chr(8239)) || ' F'
$$;

-- ⟨mois-dits⟩ : « novembre 2026 », l'année toujours.
create or replace function public.mois_dit(jour date) returns text
language sql immutable as $$
  select (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'])[extract(month from jour)::int]
    || ' ' || extract(year from jour)::int::text
$$;


-- ── 3. LE DÉCLENCHEUR ──────────────────────────────────────────────────
create or replace function public.previens_du_pourboire() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  part bigint;
  jour date;
  aujourdhui date := (now() at time zone 'Africa/Porto-Novo')::date;
  personne text := new.data ->> 'staffId';
  adresse text;
  compte uuid;
  prenom text;
  total bigint;
  titre text;
  corps text;
begin
  begin
    part := round((new.data ->> 'amountXof')::numeric);
    if personne is null or personne = '' or part is null or part <= 0 then
      return new;
    end if;
    jour := left(new.data ->> 'date', 10)::date;

    -- Une part, une seule fois : la ligne du journal se prend d'abord.
    insert into public.pourboires_prevenus (tip_id, staff_id) values (new.id, personne)
      on conflict (tip_id) do nothing;
    if not found then
      return new;
    end if;

    -- Le jour de la part juge : au-delà de deux jours, elle ne sonne pas.
    if jour < aujourdhui - 2 or jour > aujourdhui + 1 then
      update public.pourboires_prevenus set issue = 'ancien' where tip_id = new.id;
      return new;
    end if;

    -- Cinq au plus par personne en dix minutes.
    if (select count(*) from public.pourboires_prevenus
         where staff_id = personne and issue = 'parti' and tip_id <> new.id
           and prevenu_le > now() - interval '10 minutes') >= 5 then
      update public.pourboires_prevenus set issue = 'tempere' where tip_id = new.id;
      return new;
    end if;

    -- Son compte : l'adresse de sa fiche, comme est_ma_fiche (0090).
    select lower(coalesce(nullif(trim(t.data ->> 'compteMail'), ''), trim(t.data ->> 'email')))
      into adresse from public.team t where t.id = personne;
    if coalesce(adresse, '') = '' then
      update public.pourboires_prevenus set issue = 'sans-adresse' where tip_id = new.id;
      return new;
    end if;
    select u.id into compte from auth.users u where lower(u.email) = adresse limit 1;
    if compte is null or not exists (select 1 from public.staff s where s.user_id = compte) then
      update public.pourboires_prevenus set issue = 'sans-compte' where tip_id = new.id;
      return new;
    end if;

    -- ⟨notification-du-pourboire⟩ : sa part et le prénom ; son total du mois.
    prenom := public.prenom_de_la_cliente(new.data ->> 'note');
    select coalesce(sum(round((x.data ->> 'amountXof')::numeric)), 0)::bigint into total
      from public.tips x
     where x.data ->> 'staffId' = personne
       and left(x.data ->> 'date', 7) = to_char(jour, 'YYYY-MM')
       and coalesce((x.data ->> 'amountXof')::numeric, 0) > 0;
    titre := '+' || public.francs_dits(part) || ' de pourboire' || case when prenom <> '' then ' · ' || prenom else '' end;
    corps := 'Tes pourboires de ' || public.mois_dit(jour) || ' : ' || public.francs_dits(total) || '.';

    begin
      perform public.appelle_fonction_edge('push-notify', jsonb_build_object(
        'mode', 'to-staff',
        'userId', compte::text,
        'title', titre,
        'body', corps,
        'url', '/trone/#/mon-mois',
        'tag', 'mnd-pourboire'
      ));
    exception when others then
      update public.pourboires_prevenus set issue = 'refuse : ' || left(sqlerrm, 120) where tip_id = new.id;
    end;
  exception when others then
    -- Jamais un pourboire refusé pour une notification.
    raise warning 'pourboire % : la notification ne part pas (%)', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists tips_previent on public.tips;
create trigger tips_previent after insert on public.tips
  for each row execute function public.previens_du_pourboire();


-- ── Contrôle ──────────────────────────────────────────────────────────
select c.relname, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'pourboires_prevenus';
select tgname from pg_trigger where tgrelid = 'public.tips'::regclass and tgname = 'tips_previent';
select public.prenom_de_la_cliente('Mme Ranti Exemple') as prenom, public.francs_dits(1000) as francs, public.mois_dit('2026-11-04') as mois;
