-- =====================================================================
-- Row-Level Security — POLITIQUES DE DÉVELOPPEMENT (permissives)
-- ---------------------------------------------------------------------
-- ⚠ AVERTISSEMENT : ces politiques autorisent tout accès (anon + authenticated).
-- Elles rendent la base pleinement fonctionnelle AVANT la mise en place de
-- l'authentification, pour une base pré-production que vous contrôlez.
-- NE PAS déployer telles quelles en production.
--
-- Étape suivante (jalon « auth ») : remplacer par des politiques par rôle et
-- par branche — un gabarit commenté est fourni en bas de ce fichier.
-- =====================================================================

do $$
declare
  t text;
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

-- ---------------------------------------------------------------------
-- GABARIT DE PRODUCTION (à activer quand l'auth + une table `staff` existent).
-- Suppose : chaque utilisateur authentifié est rattaché à une ou plusieurs
-- branches via une table `public.staff_branches (user_id uuid, branch_id text)`,
-- et un rôle « souverain » voit toutes les branches.
-- ---------------------------------------------------------------------
--
-- create table public.staff_branches (
--   user_id uuid references auth.users(id) on delete cascade,
--   branch_id text not null,
--   role text not null default 'maitre',
--   primary key (user_id, branch_id)
-- );
--
-- create or replace function public.can_see_branch(b text) returns boolean
-- language sql stable security definer as $$
--   select exists (
--     select 1 from public.staff_branches sb
--     where sb.user_id = auth.uid()
--       and (sb.branch_id = b or sb.role = 'souverain')
--   );
-- $$;
--
-- -- Exemple pour une table branch-scoped :
-- drop policy if exists dev_all on public.clients;
-- create policy branch_read on public.clients for select to authenticated
--   using (can_see_branch(branch_id));
-- create policy branch_write on public.clients for all to authenticated
--   using (can_see_branch(branch_id)) with check (can_see_branch(branch_id));
