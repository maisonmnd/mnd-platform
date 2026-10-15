-- ═══════════════════════════════════════════════════════════════════
-- 0131 — LA RELÈVE MND ET L'ANNÉE PRÉPARATOIRE · 15 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc.
--
-- Maquette DPakEb4g… validée (« construis »), choix cochés : un apprentissage
-- de deux ou trois ans, « La Relève MND », sur le site de l'Académie. Le
-- questionnaire du site dépose un dossier dans une BOÎTE :
--   · le public y ÉCRIT une ligne et ne relit jamais rien (comme 0106) : une
--     boîte de candidatures qu'on pourrait relire serait un fichier de
--     jeunes femmes, avec leur date de naissance et leur numéro, offert au
--     premier venu ;
--   · la DIRECTION SEULE (`is_souverain()`, comme la paie et les RH, 0130)
--     la lit et l'efface : le Trône copie chaque dossier dans le registre
--     des RH (table `rh`, déjà réservée à la direction), puis vide la boîte ;
--   · personne ne réécrit un dossier : aucune règle de mise à jour.
--
-- LA GARDE DE LA BASE est plus large que celle de l'écran (shared/releve-pur) :
-- elle refuse ce qui n'est pas un dossier (taille, prénom, nom, date, numéro,
-- CEP au moins, lettre de 120 à 520 mots, consentement coché), deux dépôts du
-- même numéro en vingt-quatre heures, et une boîte qui déborderait (400).
-- Elle ne regarde ni l'âge ni le sexe (Code du travail, art. 4).
--
-- L'ANNÉE PRÉPARATOIRE (maquette Ak2z4MUF…, « construis » du même jour) a sa
-- propre boîte, `preparatoire_inscriptions` (④ à ⑥) : des MINEURES, inscrites
-- par leurs parents. Le public dépose, ne relit rien ; la direction seule lit,
-- suit (mise à jour du suivi) et efface.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.releve_candidatures (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.releve_candidatures enable row level security;

-- ── ① CE QU'EST UN DOSSIER ─────────────────────────────────────────
create or replace function public.releve_dossier_valide(d jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(d) = 'object'
    and octet_length(d::text) <= 24000
    and length(btrim(coalesce(d->>'prenom', ''))) between 1 and 60
    and length(btrim(coalesce(d->>'nom', ''))) between 1 and 60
    and coalesce(d->>'naissance', '') ~ '^\d{4}-\d{2}-\d{2}$'
    and length(regexp_replace(coalesce(d->>'telephone', ''), '\D', '', 'g')) between 8 and 15
    and coalesce(d->>'diplome', '') not in ('', 'Aucun')
    and coalesce(array_length(regexp_split_to_array(btrim(coalesce(d->>'lettre', '')), '\s+'), 1), 0) between 120 and 520
    and coalesce(d->'engagements'->'garde', 'false'::jsonb) = 'true'::jsonb
$$;

-- ── ② QUI ÉCRIT, QUI LIT ───────────────────────────────────────────
drop policy if exists releve_deposer on public.releve_candidatures;
create policy releve_deposer on public.releve_candidatures for insert to anon, authenticated
  with check (public.releve_dossier_valide(data));
drop policy if exists releve_lire on public.releve_candidatures;
create policy releve_lire on public.releve_candidatures for select to authenticated
  using (public.is_souverain());
drop policy if exists releve_retirer on public.releve_candidatures;
create policy releve_retirer on public.releve_candidatures for delete to authenticated
  using (public.is_souverain());

-- ── ③ LE DÉBIT : deux dépôts du même numéro par jour, 400 dans la boîte ──
-- `security definer` : la garde compte des lignes que le public ne voit pas.
create or replace function public.releve_garde_le_debit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tel text := right(regexp_replace(coalesce(new.data->>'telephone', ''), '\D', '', 'g'), 8);
  n   integer;
begin
  new.created_at := now();
  select count(*) into n from public.releve_candidatures
   where right(regexp_replace(coalesce(data->>'telephone', ''), '\D', '', 'g'), 8) = tel
     and created_at > now() - interval '1 day';
  if n >= 2 then
    raise exception 'releve : ce numero a deja depose aujourd hui' using errcode = 'P0001';
  end if;
  select count(*) into n from public.releve_candidatures;
  if n >= 400 then
    raise exception 'releve : la boite est pleine, la Maison la vide' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists releve_garde_le_debit on public.releve_candidatures;
create trigger releve_garde_le_debit before insert on public.releve_candidatures
  for each row execute function public.releve_garde_le_debit();

-- ── ④ L'ANNÉE PRÉPARATOIRE : LA BOÎTE ───────────────────────────────
create table if not exists public.preparatoire_inscriptions (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.preparatoire_inscriptions enable row level security;

create or replace function public.preparatoire_inscription_valide(d jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(d) = 'object'
    and octet_length(d::text) <= 12000
    and length(btrim(coalesce(d->'parent'->>'nom', ''))) between 1 and 80
    and length(regexp_replace(coalesce(d->'parent'->>'telephone', ''), '\D', '', 'g')) between 8 and 15
    and length(btrim(coalesce(d->'jeune'->>'prenom', ''))) between 1 and 60
    and length(btrim(coalesce(d->'jeune'->>'nom', ''))) between 1 and 60
    and coalesce(d->'jeune'->>'naissance', '') ~ '^\d{4}-\d{2}-\d{2}$'
    and length(btrim(coalesce(d->>'pourquoi', ''))) between 40 and 1500
    and coalesce(d->'consentement', 'false'::jsonb) = 'true'::jsonb
$$;

-- ── ⑤ QUI ÉCRIT, QUI LIT, QUI SUIT ──────────────────────────────────
drop policy if exists prep_deposer on public.preparatoire_inscriptions;
create policy prep_deposer on public.preparatoire_inscriptions for insert to anon, authenticated
  with check (public.preparatoire_inscription_valide(data));
drop policy if exists prep_lire on public.preparatoire_inscriptions;
create policy prep_lire on public.preparatoire_inscriptions for select to authenticated
  using (public.is_souverain());
drop policy if exists prep_suivre on public.preparatoire_inscriptions;
create policy prep_suivre on public.preparatoire_inscriptions for update to authenticated
  using (public.is_souverain()) with check (public.is_souverain());
drop policy if exists prep_retirer on public.preparatoire_inscriptions;
create policy prep_retirer on public.preparatoire_inscriptions for delete to authenticated
  using (public.is_souverain());

-- ── ⑥ LE DÉBIT : deux demandes du même numéro par jour, 300 dans la boîte ──
create or replace function public.preparatoire_garde_le_debit() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tel text := right(regexp_replace(coalesce(new.data->'parent'->>'telephone', ''), '\D', '', 'g'), 8);
  n   integer;
begin
  new.created_at := now();
  select count(*) into n from public.preparatoire_inscriptions
   where right(regexp_replace(coalesce(data->'parent'->>'telephone', ''), '\D', '', 'g'), 8) = tel
     and created_at > now() - interval '1 day';
  if n >= 2 then
    raise exception 'preparatoire : ce numero a deja depose aujourd hui' using errcode = 'P0001';
  end if;
  select count(*) into n from public.preparatoire_inscriptions;
  if n >= 300 then
    raise exception 'preparatoire : la boite est pleine, l Academie la vide' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists preparatoire_garde_le_debit on public.preparatoire_inscriptions;
create trigger preparatoire_garde_le_debit before insert on public.preparatoire_inscriptions
  for each row execute function public.preparatoire_garde_le_debit();

-- ── CONTRÔLE : ce que la base dit d'elle-même ──────────────────────
select
  (select c.relrowsecurity from pg_class c where c.relname = 'releve_candidatures' and c.relnamespace = 'public'::regnamespace) as boite_protegee,
  (select string_agg(p.policyname || ' (' || p.cmd || ')', ', ' order by p.policyname) from pg_policies p
     where p.schemaname = 'public' and p.tablename = 'releve_candidatures') as regles,
  not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'releve_candidatures'
     and p.cmd in ('SELECT', 'UPDATE', 'ALL') and 'anon' = any(p.roles)) as public_ne_relit_rien,
  exists (select 1 from pg_trigger t where t.tgname = 'releve_garde_le_debit') as garde_du_debit,
  (select c.relrowsecurity from pg_class c where c.relname = 'preparatoire_inscriptions' and c.relnamespace = 'public'::regnamespace) as preparatoire_protegee,
  not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'preparatoire_inscriptions'
     and p.cmd in ('SELECT', 'UPDATE', 'ALL') and 'anon' = any(p.roles)) as mineures_jamais_relues,
  exists (select 1 from pg_trigger t where t.tgname = 'preparatoire_garde_le_debit') as garde_preparatoire;
