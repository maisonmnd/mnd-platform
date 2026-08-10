-- ═══════════════════════════════════════════════════════════════════
-- 0035 — LE REGISTRE DES BILANS DE SÉANCE (Le Carnet de Suivi)
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Le bilan n'était qu'une papeterie : pré-rempli par l'URL, imprimé, oublié.
-- Cette table lui donne une mémoire : la maison l'écrit depuis la fiche
-- cliente, la cliente lit LES SIENS sur Ma Couronne, et le prochain bilan se
-- pré-remplit du précédent.
--
-- ⚠ À PASSER AVANT LA PROCHAINE PUBLICATION : les deux apps se lient à cette
--   table — sans elle, la pastille de synchro vire au rouge.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.bilans (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.bilans enable row level security;

drop policy if exists staff_all on public.bilans;
drop policy if exists own_sel   on public.bilans;

-- Le patron des rendez-vous et des factures : la cliente LIT les siens,
-- le personnel fait tout. Elle n'écrit jamais — un bilan est un geste de la
-- maison, pas une auto-évaluation.
create policy staff_all on public.bilans for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy own_sel on public.bilans for select to authenticated
  using (data->>'clientId' = (auth.uid())::text);

create index if not exists bilans_client_idx on public.bilans ((data->>'clientId'));

-- Realtime — la leçon de 0034 : une table hors publication rend l'inter-postes
-- muet. On l'ajoute d'emblée, idempotent.
do $$
begin
  alter publication supabase_realtime add table public.bilans;
exception
  when duplicate_object then null;
end $$;

-- Contrôle : la table existe, zéro ligne — les bilans naîtront des remises.
select 'bilans' as table_creee, count(*) as lignes from public.bilans;
