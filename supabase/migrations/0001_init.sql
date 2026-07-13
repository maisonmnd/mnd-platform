-- =====================================================================
-- Maison MND — schéma initial de la plateforme (Le Trône + surfaces sœurs)
-- ---------------------------------------------------------------------
-- Stratégie : une ligne = un enregistrement, la charge utile complète dans
-- `data jsonb` (mêmes formes camelCase que le front, aucune traduction).
-- `branch_id` est extrait en colonne réelle pour l'indexation et la RLS.
-- Les singletons (paramètres, marque, vitrine, compose) vivent dans `documents`.
-- =====================================================================

-- Extensions utiles (uuid non requis : les ids viennent du client via uid()).
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Collections (une table par magasin de collection du front)
-- ---------------------------------------------------------------------
do $$
declare
  -- tables portant une branche (filtrées et sécurisées par branch_id)
  branch_scoped text[] := array[
    'clients', 'appointments', 'invoices', 'expenses', 'budgets', 'cashboxes'
  ];
  -- tables globales à la Maison (pas de branche propre)
  global_scoped text[] := array[
    'branches', 'personas', 'catalog_categories', 'catalog_services',
    'catalog_products', 'expense_categories', 'consultations_queue'
  ];
  t text;
begin
  foreach t in array (branch_scoped || global_scoped) loop
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

-- ---------------------------------------------------------------------
-- Singletons — un document par clé (mnd_settings, mnd_brand, mnd_vitrine_config,
-- mnd_couronne_compose). `data` peut être null (compose au repos).
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  key text primary key,
  data jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- `updated_at` auto sur chaque écriture
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare
  t text;
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
