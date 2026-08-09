-- ═══════════════════════════════════════════════════════════════════
-- 0031 — LES PRÉPARATIONS DU LABORATOIRE
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Une préparation est une formule composée POUR UNE CLIENTE, selon son besoin :
-- ses ingrédients (fiches d'inventaire liées), ses quantités, son prix. La
-- fabrication consomme le stock par le journal des mouvements (type
-- `fabrication`, référence `prep:<id>`) — aucune table de plus pour cela, le
-- journal du 0030 suffit.
--
-- RÉSERVÉE AU PERSONNEL, comme tout l'inventaire : la préparation porte des
-- quantités d'ingrédients et un lien vers des fiches à prix d'achat. Le jour où
-- Ma Couronne devra montrer à la cliente « sa » préparation, on ouvrira une
-- lecture ciblée — pas avant.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.lab_preparations (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.lab_preparations enable row level security;

drop policy if exists dev_all   on public.lab_preparations;
drop policy if exists staff_all on public.lab_preparations;
create policy staff_all on public.lab_preparations for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

create index if not exists lab_preparations_client_idx
  on public.lab_preparations ((data->>'clientId'));

-- Contrôle : la table existe, zéro ligne — elles naîtront au Laboratoire.
select 'lab_preparations' as table_creee, count(*) as lignes from public.lab_preparations;
