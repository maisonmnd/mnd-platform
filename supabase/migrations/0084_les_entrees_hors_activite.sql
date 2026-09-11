-- ═══════════════════════════════════════════════════════════════════
-- 0084 — LES ENTRÉES HORS ACTIVITÉ · 11 septembre 2026
--
-- « Comment gérer les revenus qui sont hors activité, les entrées de
-- fonds hors activité ? » (Yéman).
--
-- L'argent qui entre sans venir d'un rituel : un apport du souverain,
-- un prêt reçu, un remboursement, la vente d'un vieux matériel.
-- Jusqu'ici la Maison ne savait pas le recevoir — « Les prêts » ne
-- couvre que ce qu'elle PRÊTE, et le registre des encaissements ne lit
-- que des rituels, des factures, des formations et des abonnements.
--
-- UN APPORT N'EST PAS UN GAIN : rien de ce qui entre ici ne touche au
-- chiffre d'affaires ni au résultat. MAIS L'ARGENT EST BIEN LÀ : il
-- garnit une caisse nommée, se voit au registre, et une dépense peut le
-- désigner comme source.
--
-- ⚠ À PASSER AVANT LA PROCHAINE PUBLICATION : Le Trône se lie à cette
--   table — sans elle, la pastille de synchro vire au rouge.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.entrees_hors_activite (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.entrees_hors_activite enable row level security;

drop policy if exists staff_all on public.entrees_hors_activite;

-- PERSONNEL SEULEMENT. Une ligne d'ici nomme qui a prêté de l'argent à
-- la Maison, ou ce que le souverain y a mis de sa poche : cela ne
-- regarde ni les clientes ni la clé publique.
create policy staff_all on public.entrees_hors_activite for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
