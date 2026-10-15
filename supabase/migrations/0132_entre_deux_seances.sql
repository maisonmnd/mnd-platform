-- ═══════════════════════════════════════════════════════════════════
-- 0132 — ENTRE DEUX SÉANCES · 15 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc.
--
-- Maquette EfhgzxjA… validée (« construis »). Entre deux rendez-vous, une
-- cliente signale ce qui arrive à ses cheveux (sèches, cassantes, inégales,
-- ça gratte…) depuis Ma Couronne ; la Maison le voit au Trône, rangé par
-- urgence, et répond.
--
--   · `signalements` : la cliente (et son foyer, `est_ma_tete`, 0028) ÉCRIT
--     les siens et les relit ; le personnel lit tout et les traite. Elle ne
--     marque jamais un souci « traité » : seule la Maison le fait. Personne
--     d'autre ne lit la ligne d'une cliente.
--   · `entre_deux_reponses` : les réponses de la Maison, une par souci. Ce
--     sont des conseils publics : tout le monde les lit, la DIRECTION SEULE
--     (`is_souverain()`) les écrit et les valide.
--   · le compartiment privé `entre-deux` : la photo facultative, rangée sous
--     le dossier de la cliente ; elle et le personnel la voient, personne
--     d'autre.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'est_ma_tete') then
    raise exception 'est_ma_tete() est absente : passez d’abord 0028_comptes_enfants.sql';
  end if;
end $$;

-- ── ① LES SIGNALEMENTS ──────────────────────────────────────────────
create table if not exists public.signalements (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists signalements_touch on public.signalements;
create trigger signalements_touch before update on public.signalements
  for each row execute function public.touch_updated_at();
alter table public.signalements enable row level security;

-- Ce qu'une cliente peut déposer : sa ligne, ouverte (ou « tout va bien »),
-- depuis Ma Couronne, d'une taille raisonnable.
create or replace function public.signalement_de_cliente_valide(d jsonb) returns boolean
language sql stable as $$
  select jsonb_typeof(d) = 'object'
    and octet_length(d::text) <= 8000
    and public.est_ma_tete(d->>'clientId')
    and coalesce(d->>'canal', '') = 'couronne'
    and jsonb_typeof(coalesce(d->'soucis', '[]'::jsonb)) = 'array'
    and length(coalesce(d->>'texte', '')) <= 1000
    and (coalesce(d->>'etat', '') = 'ouvert' or coalesce(d->'bien', 'false'::jsonb) = 'true'::jsonb)
    and d->>'traiteLe' is null and d->>'traitePar' is null
$$;

drop policy if exists sig_lire on public.signalements;
create policy sig_lire on public.signalements for select to authenticated
  using (public.is_staff() or public.est_ma_tete(data->>'clientId'));
drop policy if exists sig_deposer on public.signalements;
create policy sig_deposer on public.signalements for insert to authenticated
  with check (public.is_staff() or public.signalement_de_cliente_valide(data));
drop policy if exists sig_traiter on public.signalements;
create policy sig_traiter on public.signalements for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists sig_retirer on public.signalements;
create policy sig_retirer on public.signalements for delete to authenticated
  using (public.is_staff());

-- Dix signalements par cliente et par jour au plus : au-delà, c'est un doigt
-- qui reste appuyé, pas une couronne qui souffre.
create or replace function public.signalements_garde_le_debit() returns trigger
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.is_staff() then return new; end if;
  select count(*) into n from public.signalements
   where data->>'clientId' = new.data->>'clientId' and updated_at > now() - interval '1 day';
  if n >= 10 then
    raise exception 'signalements : dix aujourd hui, la Maison vous rappelle' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists signalements_garde_le_debit on public.signalements;
create trigger signalements_garde_le_debit before insert on public.signalements
  for each row execute function public.signalements_garde_le_debit();

-- ── ② LES RÉPONSES DE LA MAISON ─────────────────────────────────────
create table if not exists public.entre_deux_reponses (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists entre_deux_reponses_touch on public.entre_deux_reponses;
create trigger entre_deux_reponses_touch before update on public.entre_deux_reponses
  for each row execute function public.touch_updated_at();
alter table public.entre_deux_reponses enable row level security;
drop policy if exists rep_lire on public.entre_deux_reponses;
create policy rep_lire on public.entre_deux_reponses for select to anon, authenticated using (true);
drop policy if exists rep_ecrire on public.entre_deux_reponses;
create policy rep_ecrire on public.entre_deux_reponses for insert to authenticated with check (public.is_souverain());
drop policy if exists rep_valider on public.entre_deux_reponses;
create policy rep_valider on public.entre_deux_reponses for update to authenticated
  using (public.is_souverain()) with check (public.is_souverain());
drop policy if exists rep_retirer on public.entre_deux_reponses;
create policy rep_retirer on public.entre_deux_reponses for delete to authenticated using (public.is_souverain());

-- ── ③ LA PHOTO, DANS UN COMPARTIMENT PRIVÉ ──────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entre-deux', 'entre-deux', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists entre_deux_photo_lire on storage.objects;
create policy entre_deux_photo_lire on storage.objects for select to authenticated
  using (bucket_id = 'entre-deux' and (public.is_staff() or public.est_ma_tete((storage.foldername(name))[1])));
drop policy if exists entre_deux_photo_deposer on storage.objects;
create policy entre_deux_photo_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'entre-deux' and (public.is_staff() or public.est_ma_tete((storage.foldername(name))[1])));
drop policy if exists entre_deux_photo_retirer on storage.objects;
create policy entre_deux_photo_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'entre-deux' and public.is_staff());

-- ── ④ LE DIRECT : la file du Trône se met à jour seule ──────────────
do $$
declare t text;
begin
  foreach t in array array['signalements', 'entre_deux_reponses'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ── CONTRÔLE ─────────────────────────────────────────────────────────
-- Attendu : true, 4, true, true, 4, false, 3, 2.
select
  (select c.relrowsecurity from pg_class c where c.relname = 'signalements' and c.relnamespace = 'public'::regnamespace) as signalements_proteges,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'signalements') as regles_signalements,
  exists (select 1 from pg_trigger t where t.tgname = 'signalements_garde_le_debit') as garde_du_debit,
  (select c.relrowsecurity from pg_class c where c.relname = 'entre_deux_reponses' and c.relnamespace = 'public'::regnamespace) as reponses_protegees,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'entre_deux_reponses') as regles_reponses,
  (select public from storage.buckets where id = 'entre-deux') as compartiment_ouvert_au_public,
  (select count(*) from pg_policies p where p.schemaname = 'storage' and p.policyname like 'entre_deux_photo_%') as regles_photo,
  (select count(*) from pg_publication_tables r where r.pubname = 'supabase_realtime'
     and r.tablename in ('signalements', 'entre_deux_reponses')) as direct;
