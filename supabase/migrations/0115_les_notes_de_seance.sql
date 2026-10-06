-- ═══════════════════════════════════════════════════════════════════
-- 0115 — LES NOTES DE SÉANCE · 4 octobre 2026
--
-- « Un assistant qui fait les résumés des bilans… une section au niveau du
-- rendez-vous » (Yéman). Maquette « Le bilan de la séance », validée.
--
-- UNE TABLE, RÉSERVÉE AU PERSONNEL, DÈS SA NAISSANCE.
--
--   notes_de_seance   ce que le maître a vu (nature du cheveu, cases), ce
--                     qu'il attend du bilan, et le brouillon de l'assistant.
--                     Une ligne par séance : son id est `nds-<id du RDV>`.
--
-- POURQUOI PAS DANS LE RENDEZ-VOUS : la cliente lit ses rendez-vous dans
-- Ma Couronne (0035). « Elle se lave trop souvent avec un shampoing du
-- commerce » y serait lisible par elle, mot pour mot. La note ne la
-- rejoint que transformée en bilan, relu et signé (table `bilans`).
--
-- La cliente n'a AUCUNE politique ici : ni lecture, ni écriture.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.notes_de_seance (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists notes_de_seance_branch_idx on public.notes_de_seance (branch_id);
create index if not exists notes_de_seance_client_idx on public.notes_de_seance ((data->>'clientId'));

drop trigger if exists notes_de_seance_touch on public.notes_de_seance;
create trigger notes_de_seance_touch before update on public.notes_de_seance
  for each row execute function public.touch_updated_at();

alter table public.notes_de_seance enable row level security;

drop policy if exists notes_de_seance_staff on public.notes_de_seance;
create policy notes_de_seance_staff on public.notes_de_seance
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes_de_seance') then
    alter publication supabase_realtime add table public.notes_de_seance;
  end if;
end $$;

-- ── LE CONTRÔLE ────────────────────────────────────────────────────
-- Attendu : une ligne, « protégée », 1 politique, publiée en temps réel.
select
  t.table_name as table_neuve,
  case when c.relrowsecurity then 'protégée' else 'OUVERTE' end as rls,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name) as politiques,
  exists (select 1 from pg_publication_tables r
    where r.pubname = 'supabase_realtime' and r.schemaname = 'public' and r.tablename = t.table_name) as temps_reel
from information_schema.tables t
join pg_class c on c.relname = t.table_name and c.relnamespace = 'public'::regnamespace
where t.table_schema = 'public' and t.table_name = 'notes_de_seance';
