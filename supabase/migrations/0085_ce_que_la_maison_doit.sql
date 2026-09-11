-- ═══════════════════════════════════════════════════════════════════
-- 0085 — CE QUE LA MAISON DOIT · 11 septembre 2026
--
-- Le miroir de 0084. « Les prêts » disait ce qu'on doit à la Maison ;
-- il ne savait pas dire ce que la Maison doit, elle.
--
-- RENDRE N'EST PAS DÉPENSER. Rembourser un emprunt n'appauvrit pas la
-- Maison du montant rendu : cet argent n'était pas à elle. Seul le prix
-- de l'argent, l'intérêt, est une charge — et il part dans les dépenses
-- sous « Frais bancaires · Intérêts d'emprunt ». Le principal, lui,
-- sort du tiroir par une SORTIE hors activité : la caisse baisse, le
-- résultat ne bouge pas.
--
-- Une ligne d'ici porte l'emprunt lui-même : qui a prêté, combien est
-- entré, combien il faut rendre, en combien de fois, et quelles
-- échéances sont déjà rendues. L'échéancier ne se stocke pas — il se
-- recalcule depuis ces cinq nombres (`echeancesDeLEmprunt`), et la
-- dernière échéance absorbe l'arrondi pour que la somme des principaux
-- fasse EXACTEMENT le montant reçu.
--
-- ⚠ À PASSER AVANT LA PROCHAINE PUBLICATION : Le Trône se lie à cette
--   table — sans elle, la pastille de synchro vire au rouge.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.emprunts (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.emprunts enable row level security;

drop policy if exists staff_all on public.emprunts;

-- PERSONNEL SEULEMENT. Une ligne d'ici nomme le prêteur de la Maison et
-- ce qu'elle lui doit encore : cela ne regarde ni les clientes ni la
-- clé publique.
create policy staff_all on public.emprunts for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
