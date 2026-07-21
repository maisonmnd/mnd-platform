-- ═══════════════════════════════════════════════════════════════════
-- 0009 — Coffre-fort : registre d'épargne verrouillé (à coller dans
-- Supabase → SQL Editor → Run). Idempotent.
--
-- Une ligne par MOUVEMENT (dépôt ou virement bancaire). C'est de l'argent :
-- on ne passe JAMAIS par un document LWW (qui perdrait un dépôt en cas de
-- synchronisation croisée) — même contrat de collection que `tips`.
-- Aucune dépense n'est possible depuis le coffre : la seule sortie est un
-- virement bancaire, matérialisé par un mouvement kind='virement'.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Table collection standard (même contrat que tips / salary_advances).
create table if not exists public.coffre_movements (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists coffre_movements_branch_idx on public.coffre_movements (branch_id);

drop trigger if exists coffre_movements_touch on public.coffre_movements;
create trigger coffre_movements_touch before update on public.coffre_movements
  for each row execute function public.touch_updated_at();

-- 2) RLS : personnel uniquement (comme les tables métier).
alter table public.coffre_movements enable row level security;
drop policy if exists staff_all on public.coffre_movements;
create policy staff_all on public.coffre_movements for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 3) Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'coffre_movements'
  ) then
    execute 'alter publication supabase_realtime add table public.coffre_movements';
  end if;
end $$;

-- Vérification : la table existe et est vide au départ.
select 'coffre_movements' as table_ok, count(*) as lignes from public.coffre_movements;
