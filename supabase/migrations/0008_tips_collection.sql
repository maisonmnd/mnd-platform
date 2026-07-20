-- ═══════════════════════════════════════════════════════════════════
-- 0008 — Pourboires : du document unique à la collection (à coller dans
-- Supabase → SQL Editor → Run). Idempotent.
--
-- L'ancienne forme (documents, clé mnd_tips : un objet {staffId: [pourboires]})
-- était en dernier-écrivain-gagnant : deux caisses enregistrant dans la même
-- fenêtre de synchronisation s'écrasaient — un pourboire perdu en silence.
-- Une ligne par pourboire (upsert par id) supprime l'écrasement croisé.
-- ═══════════════════════════════════════════════════════════════════

-- 1) Table collection standard (même contrat que salary_advances).
create table if not exists public.tips (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists tips_branch_idx on public.tips (branch_id);

drop trigger if exists tips_touch on public.tips;
create trigger tips_touch before update on public.tips
  for each row execute function public.touch_updated_at();

-- 2) RLS : personnel uniquement (comme les tables métier).
alter table public.tips enable row level security;
drop policy if exists staff_all on public.tips;
create policy staff_all on public.tips for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 3) Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tips'
  ) then
    execute 'alter publication supabase_realtime add table public.tips';
  end if;
end $$;

-- 4) Reprise des pourboires existants : chaque entrée du document hérité
--    devient une ligne (le staffId, clé de l'objet, entre dans la ligne).
--    Idempotent : un id déjà migré n'est pas retouché.
insert into public.tips (id, branch_id, data)
select t.tip->>'id',
       null,
       t.tip || jsonb_build_object('staffId', t.staff_id)
from (
  select e.key as staff_id, jsonb_array_elements(e.value) as tip
  from public.documents d, jsonb_each(d.data) e
  where d.key = 'mnd_tips'
    and jsonb_typeof(d.data) = 'object'
    and jsonb_typeof(e.value) = 'array'
) t
where coalesce(t.tip->>'id', '') <> ''
on conflict (id) do nothing;

-- (Le document mnd_tips est conservé tel quel, en copie de sauvegarde figée —
--  plus aucun code ne le lit ni ne l'écrit.)

-- Vérification : lignes migrées + total.
select 'tips' as table_ok, count(*) as lignes from public.tips;
