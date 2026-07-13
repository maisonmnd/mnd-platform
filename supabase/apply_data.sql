-- =====================================================================
-- Maison MND — câblage complet des données (à coller dans SQL Editor → Run).
-- Ajoute les tables des magasins encore locaux : équipe, marketing, abonnements,
-- académie, formulaires de consultation. Même forme JSONB, RLS dev, Realtime.
-- Idempotent.  (= migrations/0004_data_wiring.sql)
-- =====================================================================

do $$
declare
  new_tables text[] := array[
    'team', 'campaigns', 'plans', 'subscribers',
    'formations', 'apprenants', 'certifications', 'consult_forms'
  ];
  t text;
begin
  foreach t in array new_tables loop
    execute format($f$
      create table if not exists public.%I (
        id text primary key,
        branch_id text,
        data jsonb not null,
        updated_at timestamptz not null default now()
      );
    $f$, t);
    execute format('create index if not exists %I on public.%I (branch_id);', t || '_branch_idx', t);

    -- updated_at auto (la fonction public.touch_updated_at existe déjà)
    execute format('drop trigger if exists %I on public.%I;', t || '_touch', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.touch_updated_at();',
      t || '_touch', t
    );

    -- RLS dev permissive (⚠ à durcir avec l'auth, comme les autres tables)
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all on public.%I;', t);
    execute format(
      'create policy dev_all on public.%I for all to anon, authenticated using (true) with check (true);', t
    );

    -- Realtime
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
