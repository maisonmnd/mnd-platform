-- =====================================================================
-- Maison MND — ROLLBACK D'URGENCE : ré-ouvre l'accès (politiques « dev_all »).
-- ---------------------------------------------------------------------
-- À coller dans Supabase → SQL Editor → Run UNIQUEMENT si le durcissement RLS
-- (0006) casse une app en production et qu'il faut rétablir le service tout de
-- suite. Cela remet la base en ACCÈS OUVERT (anon + authenticated) — état de
-- développement. À n'utiliser que le temps de diagnostiquer, puis re-durcir.
-- =====================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients','appointments','invoices','expenses','budgets','cashboxes',
    'branches','personas','catalog_categories','catalog_services',
    'catalog_products','expense_categories','consultations_queue','documents',
    'team','campaigns','plans','subscribers','formations','apprenants',
    'certifications','consult_forms','client_sessions'
  ] loop
    -- Retire les politiques durcies éventuelles
    execute format('drop policy if exists pub_read on public.%I;', t);
    execute format('drop policy if exists staff_write on public.%I;', t);
    execute format('drop policy if exists staff_all on public.%I;', t);
    execute format('drop policy if exists own_sel on public.%I;', t);
    execute format('drop policy if exists own_ins on public.%I;', t);
    execute format('drop policy if exists own_upd on public.%I;', t);
    execute format('drop policy if exists own_del on public.%I;', t);
    execute format('drop policy if exists cli_sel on public.%I;', t);
    execute format('drop policy if exists cli_ins on public.%I;', t);
    execute format('drop policy if exists cli_upd on public.%I;', t);
    execute format('drop policy if exists cli_del on public.%I;', t);
    execute format('drop policy if exists cq_submit on public.%I;', t);
    execute format('drop policy if exists cq_staff on public.%I;', t);
    execute format('drop policy if exists docs_pub_read on public.%I;', t);
    execute format('drop policy if exists docs_staff_all on public.%I;', t);
    -- Rétablit l'accès ouvert
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all on public.%I;', t);
    execute format(
      'create policy dev_all on public.%I for all to anon, authenticated using (true) with check (true);', t);
  end loop;
end $$;
