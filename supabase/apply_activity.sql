-- =====================================================================
-- Maison MND — table de suivi d'activité des clientes (Ma Couronne).
-- À coller dans SQL Editor → Run. Idempotent. (= migrations/0005_activity.sql)
-- =====================================================================

create table if not exists public.client_sessions (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists client_sessions_branch_idx on public.client_sessions (branch_id);

drop trigger if exists client_sessions_touch on public.client_sessions;
create trigger client_sessions_touch before update on public.client_sessions
  for each row execute function public.touch_updated_at();

alter table public.client_sessions enable row level security;
drop policy if exists dev_all on public.client_sessions;
create policy dev_all on public.client_sessions for all to anon, authenticated using (true) with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'client_sessions'
  ) then
    alter publication supabase_realtime add table public.client_sessions;
  end if;
end $$;
