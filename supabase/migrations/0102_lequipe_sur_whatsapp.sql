-- ═══════════════════════════════════════════════════════════════════
-- 0102 — L'ÉQUIPE SUR WHATSAPP · 15 septembre 2026
--
-- « How can this be done and arrive directly on the trone with employees
-- and prestataires » (Yéman). Maquette
-- `public/maquette-lequipe-sur-whatsapp.html`, validée.
--
-- LE NUMÉRO DE LA MAISON NE CONNAISSAIT QUE LES CLIENTES. Une maître qui
-- écrit, un menuisier qui envoie son devis : leurs fils tombaient « sans
-- fiche », lisibles par tout le personnel comme n'importe quelle cliente.
-- Or on y parlera de salaire, d'absence, d'argent versé.
--
-- CETTE MIGRATION FAIT DEUX CHOSES, ET LA SECONDE PASSE AVANT TOUT ENVOI :
--
--   ① ELLE RECONNAÎT. Un déclencheur range chaque message dans son TIROIR
--      (`data.tiroir`) en cherchant le numéro dans l'équipe (`team`), le
--      répertoire des prestataires (`documents · mnd_prestataires`) et les
--      fournisseurs. L'équipe d'abord : une employée qui est aussi cliente
--      va dans Équipe (décision du 15 septembre). Les messages d'avant sont
--      rangés une fois ; et quand une personne entre dans l'équipe, ses
--      messages anciens la rejoignent (déclencheurs sur `team`, sur le
--      répertoire, sur `fournisseurs`).
--
--   ② ELLE FERME LA PORTE. Les fils de l'équipe et des prestataires ne se
--      lisent qu'à la direction (souveraine et gérante — `est_direction()`,
--      0089). Le personnel continue de lire les clientes, comme avant.
--      Un bulletin envoyé par le Trône n'est donc jamais lisible par les
--      collègues. Aucune fiche n'est créée, jamais : un numéro inconnu reste
--      inconnu.
--
-- UN NUMÉRO QUI A ÉTÉ DE L'ÉQUIPE LE RESTE. Une personne qui quitte la
-- Maison et revient comme cliente garde un fil réservé : ce qu'elle a reçu
-- comme employée (ses bulletins) ne doit pas s'ouvrir au personnel le jour
-- où sa fiche disparaît de l'équipe. C'est le sens de `deja_reserve`.
--
-- LES POLITIQUES CACHENT, ELLES NE REFUSENT PAS : une ligne qu'on n'a pas le
-- droit de lire n'existe pas pour ce compte, et la synchronisation ne voit
-- aucune erreur (un refus, lui, mettrait la table hors de portée du poste).
--
-- LE COMPARTIMENT `whatsapp` reçoit ce que les gens envoient (photos, PDF,
-- vocaux) : le fil ne gardait que les mots « une photo », et le fichier se
-- perdait chez Meta. Privé, écrit par le webhook seul (clé de service), lu
-- par le personnel pour les clientes, par la direction pour le reste. Le
-- devis d'un prestataire va, lui, dans le coffre des engagements (0099),
-- rangé dans son dossier : c'est là qu'on le lit.
--
-- `is_staff()` (0003), `est_direction()` (0089), `messages_wa` (0086),
-- `team` (0004), `documents` (0001), `fournisseurs` (0030), le coffre
-- `engagements` (0099) sont passés. 0101 est passée le 15 septembre.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① LE NUMÉRO, RÉDUIT COMME PARTOUT ───────────────────────────────
-- MÊME RÈGLE que `numeroWa` (shared/conversations.ts) et que les deux
-- fonctions Edge. Quatre copies d'une règle de six lignes, et c'est voulu :
-- ni la base ni une fonction Edge n'importent rien du dépôt. Si l'une
-- divergeait, un numéro tomberait « sans fiche » à côté de sa propre tête.
create or replace function public.numero_wa(brut text) returns text
language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(brut, ''), '\D', '', 'g');
begin
  if d = '' then return ''; end if;
  if d like '00229%' then return substr(d, 3); end if;
  if d like '229%' then return d; end if;
  if length(d) = 10 and d like '01%' then return '229' || d; end if;
  if length(d) = 8 then return '22901' || d; end if;
  return d;
end;
$$;

-- ── ② À QUI EST CE NUMÉRO ────────────────────────────────────────────
-- L'ÉQUIPE D'ABORD, puis le répertoire des prestataires, puis les
-- fournisseurs. Rend un objet : le tiroir, et l'identifiant de la fiche.
-- SECURITY DEFINER : la fonction lit `team` et `documents` sans leur RLS,
-- parce que c'est la BASE qui range, pas le compte qui écrit.
create or replace function public.tete_du_numero(n text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  num text := public.numero_wa(n);
  r record;
begin
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

-- Le tiroir seul, pour les politiques de lecture.
create or replace function public.tiroir_du_numero(n text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(public.tete_du_numero(n)->>'tiroir', 'clientes');
$$;

-- UN NUMÉRO EST RÉSERVÉ s'il est de l'équipe ou d'un prestataire
-- aujourd'hui, OU s'il l'a été : un fil dont une ligne porte un tiroir
-- réservé le reste. C'est ce que lit le compartiment des pièces reçues.
create or replace function public.numero_est_reserve(n text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.tiroir_du_numero(n) <> 'clientes'
      or exists (
        select 1 from public.messages_wa m
         where m.data->>'numero' = public.numero_wa(n)
           and coalesce(m.data->>'tiroir', 'clientes') <> 'clientes'
      );
$$;

-- CES FONCTIONS DISENT SI UN NUMÉRO EST CELUI D'UNE EMPLOYÉE : la clé
-- publique n'a pas à le savoir.
revoke execute on function public.tete_du_numero(text) from public, anon;
revoke execute on function public.tiroir_du_numero(text) from public, anon;
revoke execute on function public.numero_est_reserve(text) from public, anon;
grant execute on function public.tete_du_numero(text) to authenticated, service_role;
grant execute on function public.tiroir_du_numero(text) to authenticated, service_role;
grant execute on function public.numero_est_reserve(text) to authenticated, service_role;

-- ── ③ CHAQUE MESSAGE SE RANGE À L'ÉCRITURE ───────────────────────────
-- Avant l'insertion ou la mise à jour, quelle qu'en soit la main : le
-- webhook, la fonction d'envoi, ou le Trône. Une ligne ne redescend jamais
-- d'un tiroir réservé vers les clientes (voir l'en-tête).
create or replace function public.messages_wa_range() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  num  text  := public.numero_wa(new.data->>'numero');
  tete jsonb := public.tete_du_numero(num);
  avant text := coalesce(new.data->>'tiroir', 'clientes');
  deja  text;
begin
  if tete->>'tiroir' = 'clientes' then
    if avant <> 'clientes' then
      -- La fiche a disparu, la ligne garde son tiroir : rien à faire.
      return new;
    end if;
    -- Une autre ligne de ce numéro est-elle réservée ? Alors celle-ci aussi.
    select m.data->>'tiroir' into deja
      from public.messages_wa m
     where m.data->>'numero' = num
       and coalesce(m.data->>'tiroir', 'clientes') <> 'clientes'
       and m.id <> new.id
     limit 1;
    if deja is not null then
      new.data := new.data || jsonb_build_object('tiroir', deja);
    end if;
    return new;
  end if;

  new.data := (new.data - 'staffId' - 'prestataireId' - 'fournisseurId')
    || jsonb_strip_nulls(jsonb_build_object(
         'tiroir',        tete->'tiroir',
         'staffId',       tete->'staffId',
         'prestataireId', tete->'prestataireId',
         'fournisseurId', tete->'fournisseurId'));
  -- LA BRANCHE SE LIT SUR LA FICHE : un message reçu ne sait pas de quelle
  -- maison il relève. On ne la pose que si personne ne l'a posée.
  if new.branch_id is null and (tete ? 'branchId') and tete->>'branchId' is not null then
    new.branch_id := tete->>'branchId';
    new.data := new.data || jsonb_build_object('branchId', tete->'branchId');
  end if;
  return new;
end;
$$;

drop trigger if exists messages_wa_range on public.messages_wa;
create trigger messages_wa_range before insert or update on public.messages_wa
  for each row execute function public.messages_wa_range();

-- ── ④ LA PORTE ──────────────────────────────────────────────────────
-- Deux politiques remplacent `staff_all` (0086). Le personnel lit et écrit
-- les fils des clientes ; la direction lit et écrit tout. Une ligne réservée
-- n'existe pas pour un compte du personnel — ni en lecture, ni en direct.
drop policy if exists staff_all on public.messages_wa;
drop policy if exists staff_clientes on public.messages_wa;
drop policy if exists direction_tout on public.messages_wa;

create policy staff_clientes on public.messages_wa for all to authenticated
  using (public.is_staff() and coalesce(data->>'tiroir', 'clientes') = 'clientes')
  with check (public.is_staff() and coalesce(data->>'tiroir', 'clientes') = 'clientes');

create policy direction_tout on public.messages_wa for all to authenticated
  using (public.est_direction())
  with check (public.est_direction());

-- Le tiroir se lit dans les politiques : il lui faut son index.
create index if not exists messages_wa_tiroir
  on public.messages_wa ((coalesce(data->>'tiroir', 'clientes')));

-- ── ⑤ LES MESSAGES D'AVANT REJOIGNENT LEUR TIROIR ───────────────────
-- Une mise à jour sans changement suffit : le déclencheur recalcule. Seules
-- les lignes concernées sont touchées ; la trace (0097) garde le geste,
-- et c'est juste — la lecture de ces lignes vient de changer de mains.
update public.messages_wa
   set data = data
 where coalesce(data->>'tiroir', 'clientes') = 'clientes'
   and public.tiroir_du_numero(data->>'numero') <> 'clientes';

-- ── ⑥ QUAND UNE PERSONNE ENTRE, SES MESSAGES LA REJOIGNENT ──────────
-- Le balayage ne touche que ce qui doit changer ; à quelques centaines de
-- messages il ne coûte rien, et il ne se produit qu'à une entrée ou à un
-- changement de numéro.
create or replace function public.range_les_fils() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.messages_wa
     set data = data
   where coalesce(data->>'tiroir', 'clientes') = 'clientes'
     and public.tiroir_du_numero(data->>'numero') <> 'clientes';
  return null;
end;
$$;

drop trigger if exists team_range_les_fils on public.team;
create trigger team_range_les_fils after insert or update of data on public.team
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.range_les_fils();

drop trigger if exists fournisseurs_range_les_fils on public.fournisseurs;
create trigger fournisseurs_range_les_fils after insert or update of data on public.fournisseurs
  for each row
  when (pg_trigger_depth() = 0)
  execute function public.range_les_fils();

drop trigger if exists documents_range_les_fils on public.documents;
create trigger documents_range_les_fils after insert or update of data on public.documents
  for each row
  when (new.key = 'mnd_prestataires' and pg_trigger_depth() = 0)
  execute function public.range_les_fils();

-- ══ ⑦ LE COMPARTIMENT DES PIÈCES REÇUES ═════════════════════════════
-- PRIVÉ. Seize mégaoctets : le plafond de Meta pour un vocal ou une vidéo ;
-- un document plus lourd reste chez Meta, et le fil le dit. Les genres
-- sont ceux que WhatsApp sait envoyer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'whatsapp', 'whatsapp', false, 16777216,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
    'video/mp4', 'video/3gpp'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- LA RÈGLE VIT DANS LE CHEMIN : `<numéro>/<message>-<nom>`. Le premier
-- segment dit à qui l'on parle, et la base décide avec `numero_est_reserve`.
-- Personne ne dépose depuis le Trône : le webhook seul écrit, par la clé de
-- service, qui ne passe pas par ces politiques.
drop policy if exists whatsapp_lire on storage.objects;
create policy whatsapp_lire on storage.objects for select to authenticated
  using (
    bucket_id = 'whatsapp'
    and (
      public.est_direction()
      or (public.is_staff() and not public.numero_est_reserve((storage.foldername(name))[1]))
    )
  );

drop policy if exists whatsapp_retirer on storage.objects;
create policy whatsapp_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'whatsapp' and public.est_direction());

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('numero_wa', 'tete_du_numero', 'tiroir_du_numero', 'numero_est_reserve', 'messages_wa_range', 'range_les_fils'))
    as fonctions_posees,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'messages_wa') as politiques_messages,
  (select count(*) from public.messages_wa where coalesce(data->>'tiroir', 'clientes') <> 'clientes') as lignes_reservees,
  (select public from storage.buckets where id = 'whatsapp') as compartiment_ouvert_au_public,
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'whatsapp\_%') as politiques_du_compartiment;
--  Attendu : 6 · 2 · (le nombre de messages de l'équipe et des prestataires) · false · 2
--  `compartiment_ouvert_au_public` DOIT dire false.
