-- ═══════════════════════════════════════════════════════════════════
-- 0032 — LA BIBLIOTHÈQUE DES FORMULES MAÎTRES
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Cette migration ne crée que la STRUCTURE — elle est committable, elle ne
-- contient aucune formule. Les formules réelles de l'Atelier sont un secret de
-- fabrique : elles s'insèrent par le fichier LOCAL et GITIGNORÉ
-- `supabase/import_formules_maitres.sql`, à coller juste après celle-ci.
--
-- RÉSERVÉE AU PERSONNEL : le dépôt est public et le bundle JS se télécharge
-- sans compte — une formule écrite ailleurs qu'en base serait publique. Ici,
-- elle n'atteint un navigateur qu'après une connexion du personnel.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.lab_formules (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.lab_formules enable row level security;

drop policy if exists dev_all   on public.lab_formules;
drop policy if exists staff_all on public.lab_formules;
create policy staff_all on public.lab_formules for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Contrôle : la table existe. Zéro ligne tant que l'import local n'est pas
-- passé ; quatorze après.
select 'lab_formules' as table_creee, count(*) as lignes from public.lab_formules;
