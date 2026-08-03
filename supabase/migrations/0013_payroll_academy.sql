-- ═══════════════════════════════════════════════════════════════════
-- 0013 — Les six tables manquantes : paie, temps, congés, Académie
--        (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- L'application les lie depuis longtemps côté client —
--   equipe/payroll.ts : salary_advances, attendance, leave_requests, payroll_runs
--   equipe/academy.ts : academy_applications, academy_enrollments
-- — mais AUCUN script du dépôt ne les créait. Deux migrations les citent même
-- en commentaire comme modèle de référence (0008 ligne 11, 0009 ligne 23) : le
-- dépôt les tenait pour acquises sans jamais les écrire.
--
-- Conséquence si elles n'existent pas en base : l'hydratation échoue en
-- silence (sync.ts capture l'erreur et rend la main), la paie ne vit que dans
-- le navigateur, et une purge du cache l'emporte. Conséquence si elles ont été
-- créées à la main : leurs règles d'accès sont inconnues du dépôt, donc ni
-- reproductibles ni auditables. Cette migration tranche les deux cas.
--
-- ACCÈS — DEUX RÉGIMES, décidés par la Maison le 3 août 2026.
--   · PAIE (avances, pointages, congés, bulletins) : le SOUVERAIN seul, via
--     public.is_souverain(). C'est ce que l'écran Accès promet déjà à
--     l'utilisatrice ; jusqu'ici aucune règle serveur ne le tenait.
--   · ACADÉMIE (candidatures, inscriptions) : tout le personnel, comme les
--     autres tables métier — ce sont des données de formation, pas de salaire.
--
-- Conséquence à connaître : un membre du personnel qui n'est pas souverain ne
-- verra plus rien arriver sur les quatre tables de paie, et ses écritures y
-- seront refusées. C'est l'effet recherché, mais il change ce que voit une
-- gérante non souveraine.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Les six tables, au contrat standard des collections.
create table if not exists public.salary_advances (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.attendance (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.leave_requests (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.payroll_runs (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.academy_applications (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.academy_enrollments (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2) Index de branche, horodatage, RLS et Realtime.
--    La garde diffère : souverain pour la paie, personnel pour l'Académie.
do $$
declare t text;
declare garde text;
begin
  foreach t in array array[
    'salary_advances', 'attendance', 'leave_requests',
    'payroll_runs', 'academy_applications', 'academy_enrollments'
  ] loop
    garde := case
      when t in ('salary_advances', 'attendance', 'leave_requests', 'payroll_runs')
        then 'public.is_souverain()'
      else 'public.is_staff()'
    end;
    execute format('create index if not exists %I on public.%I (branch_id);', t || '_branch_idx', t);

    execute format('drop trigger if exists %I on public.%I;', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at();',
      t || '_touch', t);

    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists staff_all on public.%I;', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated using (%s) with check (%s);',
      t, garde, garde);

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- 3) Vérification — les six doivent apparaître, chacune avec sa policy.
select c.relname as table_ok,
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
       (select pg_get_expr(p.polqual, p.polrelid) from pg_policy p
         where p.polrelid = c.oid and p.polname = 'staff_all') as garde
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('salary_advances', 'attendance', 'leave_requests',
                    'payroll_runs', 'academy_applications', 'academy_enrollments')
order by 1;
