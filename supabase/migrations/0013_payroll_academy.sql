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
-- ACCÈS. Le personnel lit et écrit — comme toutes les tables métier. L'écran
-- Accès annonce que la paie est réservée au souverain « côté serveur » ; ce
-- n'est PAS ce que fait cette migration, et il ne faut pas le laisser croire :
-- `is_staff()` reste la règle, identique à tips, coffre et salaires documents.
-- Restreindre la paie au souverain se ferait en remplaçant `public.is_staff()`
-- par `public.is_souverain()` sur les quatre tables de paie ci-dessous — c'est
-- une décision de la Maison, pas une correction technique, donc elle n'est pas
-- prise ici.
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

-- 2) Index de branche, horodatage, RLS et Realtime — identiques pour les six.
do $$
declare t text;
begin
  foreach t in array array[
    'salary_advances', 'attendance', 'leave_requests',
    'payroll_runs', 'academy_applications', 'academy_enrollments'
  ] loop
    execute format('create index if not exists %I on public.%I (branch_id);', t || '_branch_idx', t);

    execute format('drop trigger if exists %I on public.%I;', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at();',
      t || '_touch', t);

    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists staff_all on public.%I;', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff());',
      t);

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
       (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('salary_advances', 'attendance', 'leave_requests',
                    'payroll_runs', 'academy_applications', 'academy_enrollments')
order by 1;
