-- ═══════════════════════════════════════════════════════════════════
-- 0117 — LES PAPIERS DE LA MAISON · 6 octobre 2026
--
-- « Je veux stocker des documents dans le Trône : mon IFU, le RCCM, les
-- certificats de résidence, la carte d'identité de chaque entreprise »
-- (Yéman). Maquette « Les papiers de la Maison » validée ; choix au
-- sélecteur : papiers d'une personne vus de Yéman et Brice, marque
-- obligatoire sur les copies d'une personne, champ « Original », alerte
-- 30 jours (60 pour un passeport).
--
-- UNE TABLE, DEUX GENRES DE LIGNES (data->>'genre') :
--   papier    une pièce : titulaire, type, numéro, dates, pages, versions,
--             journal des ouvertures et des remises ;
--   personne  un titulaire qui n'est pas une entreprise (Yéman, Brice…).
--
-- LA RÈGLE DE LA BASE, pas seulement de l'écran : la DIRECTION SEULE lit,
-- écrit et efface, dans la table comme dans le compartiment des fichiers.
-- Le personnel ne voit rien. Chaque modification passe par la trace (0092).
--
-- UN COMPARTIMENT PRIVÉ, `papiers` : 10 Mo par fichier, PDF et images.
-- Un fichier ne s'ouvre que par un lien signé qui expire en une minute.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.papiers (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists papiers_genre_idx on public.papiers ((data->>'genre'));

drop trigger if exists papiers_touch on public.papiers;
create trigger papiers_touch before update on public.papiers
  for each row execute function public.touch_updated_at();

alter table public.papiers enable row level security;

drop policy if exists papiers_lire on public.papiers;
create policy papiers_lire on public.papiers for select to authenticated
  using (public.est_direction());

drop policy if exists papiers_ecrire on public.papiers;
create policy papiers_ecrire on public.papiers for insert to authenticated
  with check (public.est_direction());

drop policy if exists papiers_modifier on public.papiers;
create policy papiers_modifier on public.papiers for update to authenticated
  using (public.est_direction())
  with check (public.est_direction());

drop policy if exists papiers_effacer on public.papiers;
create policy papiers_effacer on public.papiers for delete to authenticated
  using (public.est_direction());

-- La trace de la base : qui a posé, modifié, effacé une pièce.
do $$
begin
  if to_regprocedure('public.trace_le_geste()') is not null then
    drop trigger if exists trace_le_geste on public.papiers;
    create trigger trace_le_geste after insert or update or delete on public.papiers
      for each row execute function public.trace_le_geste();
  end if;
end $$;

-- ── LE COMPARTIMENT DES FICHIERS : la direction seule ───────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('papiers', 'papiers', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists papiers_fichiers_lire on storage.objects;
create policy papiers_fichiers_lire on storage.objects for select to authenticated
  using (bucket_id = 'papiers' and public.est_direction());

drop policy if exists papiers_fichiers_deposer on storage.objects;
create policy papiers_fichiers_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'papiers' and public.est_direction());

drop policy if exists papiers_fichiers_remplacer on storage.objects;
create policy papiers_fichiers_remplacer on storage.objects for update to authenticated
  using (bucket_id = 'papiers' and public.est_direction())
  with check (bucket_id = 'papiers' and public.est_direction());

drop policy if exists papiers_fichiers_retirer on storage.objects;
create policy papiers_fichiers_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'papiers' and public.est_direction());

-- ── LE CONTRÔLE ────────────────────────────────────────────────────
-- Attendu : protégée, 4 politiques, tracée, compartiment fermé au public,
-- 4 politiques du compartiment.
select
  'papiers' as table_neuve,
  case when c.relrowsecurity then 'protégée' else 'OUVERTE' end as rls,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'papiers') as politiques,
  exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'trace_le_geste') as tracee,
  (select public from storage.buckets where id = 'papiers') as papiers_ouverts_au_public,
  (select count(*) from pg_policies p where p.schemaname = 'storage' and p.policyname like 'papiers_fichiers_%') as politiques_du_compartiment
from pg_class c
where c.relname = 'papiers' and c.relnamespace = 'public'::regnamespace;
