-- ═══════════════════════════════════════════════════════════════════
-- 0010 — Comptes familles & avoirs (à coller dans Supabase → SQL Editor →
-- Run). Idempotent, autonome.
--
-- Deux tables collection (une ligne par entité — jamais un document LWW) :
--   • families         — les comptes familles (regroupent des clientes)
--   • credit_movements — les mouvements d'avoir (dépôt / usage / remboursement)
-- RLS personnel uniquement, comme les autres tables métier.
-- ═══════════════════════════════════════════════════════════════════

-- Fonction de déclencheur — créée ici pour rendre le script AUTONOME.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 1) Comptes familles.
create table if not exists public.families (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists families_branch_idx on public.families (branch_id);
drop trigger if exists families_touch on public.families;
create trigger families_touch before update on public.families
  for each row execute function public.touch_updated_at();
alter table public.families enable row level security;
drop policy if exists staff_all on public.families;
create policy staff_all on public.families for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 2) Mouvements d'avoir.
create table if not exists public.credit_movements (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists credit_movements_branch_idx on public.credit_movements (branch_id);
drop trigger if exists credit_movements_touch on public.credit_movements;
create trigger credit_movements_touch before update on public.credit_movements
  for each row execute function public.touch_updated_at();
alter table public.credit_movements enable row level security;
drop policy if exists staff_all on public.credit_movements;
create policy staff_all on public.credit_movements for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 3) Realtime pour les deux tables.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'families') then
    execute 'alter publication supabase_realtime add table public.families';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'credit_movements') then
    execute 'alter publication supabase_realtime add table public.credit_movements';
  end if;
end $$;

-- Vérification : les deux tables existent et sont vides au départ.
select 'families' as table_ok, count(*) as lignes from public.families
union all
select 'credit_movements', count(*) from public.credit_movements;
