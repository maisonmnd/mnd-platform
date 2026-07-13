-- =====================================================================
-- Maison MND — script consolidé à coller dans Supabase → SQL Editor → Run.
-- Regroupe : 0001_init.sql + 0002_rls_dev.sql + activation Realtime.
-- Idempotent : peut être ré-exécuté sans dommage.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------- Tables (une ligne = un enregistrement, charge dans data jsonb) ----------
do $$
declare
  all_tables text[] := array[
    'clients','appointments','invoices','expenses','budgets','cashboxes',
    'branches','personas','catalog_categories','catalog_services',
    'catalog_products','expense_categories','consultations_queue'
  ];
  t text;
begin
  foreach t in array all_tables loop
    execute format($f$
      create table if not exists public.%I (
        id text primary key,
        branch_id text,
        data jsonb not null,
        updated_at timestamptz not null default now()
      );
    $f$, t);
    execute format('create index if not exists %I on public.%I (branch_id);', t || '_branch_idx', t);
  end loop;
end $$;

create table if not exists public.documents (
  key text primary key,
  data jsonb,
  updated_at timestamptz not null default now()
);

-- ---------- updated_at automatique ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'clients','appointments','invoices','expenses','budgets','cashboxes',
    'branches','personas','catalog_categories','catalog_services',
    'catalog_products','expense_categories','consultations_queue','documents'
  ] loop
    execute format('drop trigger if exists %I on public.%I;', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at();',
      t || '_touch', t
    );
  end loop;
end $$;

-- ---------- RLS : POLITIQUES DE DÉVELOPPEMENT (permissives) ⚠ à durcir avant prod ----------
do $$
declare t text;
begin
  foreach t in array array[
    'clients','appointments','invoices','expenses','budgets','cashboxes',
    'branches','personas','catalog_categories','catalog_services',
    'catalog_products','expense_categories','consultations_queue','documents'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all on public.%I;', t);
    execute format(
      'create policy dev_all on public.%I for all to anon, authenticated using (true) with check (true);',
      t
    );
  end loop;
end $$;

-- ---------- Realtime : publier les tables (avec garde anti-doublon) ----------
do $$
declare t text;
begin
  foreach t in array array[
    'clients','appointments','invoices','expenses','budgets','cashboxes',
    'branches','personas','catalog_categories','catalog_services',
    'catalog_products','expense_categories','consultations_queue','documents'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
