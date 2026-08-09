-- ═══════════════════════════════════════════════════════════════════
-- 0030 — STOCK & ACHATS
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Six tables : les fournisseurs, les fiches d'inventaire, le journal des
-- mouvements, les bons de commande et leurs lignes, et les recettes de
-- consommation des services.
--
-- ── POURQUOI CES TABLES SONT RÉSERVÉES AU PERSONNEL ──────────────────
-- `catalog_products` est la vitrine : Ma Couronne la lit, une cliente connectée
-- peut donc lire chacune de ses lignes. Le prix d'ACHAT et la marge n'ont rien
-- à y faire — et la RLS ne sait pas cacher un champ à l'intérieur du JSON.
-- L'inventaire vit donc ici, sous `is_staff()` seul, et une fiche REVENTE
-- pointe vers sa fiche Gamme qui garde le prix de vente.
--
-- ── LE STOCK NE SE STOCKE PAS ────────────────────────────────────────
-- Aucune colonne « stock actuel » : la quantité en rayon est la somme des
-- mouvements du journal, recalculée à l'affichage. L'inventaire initial est
-- lui-même un mouvement. Le champ `stock` de `catalog_products` devient un
-- simple MIROIR pour la vitrine, réécrit par l'application à chaque mouvement.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'fournisseurs', 'stock_produits', 'stock_mouvements',
    'achats_commandes', 'achats_lignes', 'consommations'
  ] loop
    execute format($q$
      create table if not exists public.%I (
        id         text primary key,
        branch_id  text,
        data       jsonb not null,
        updated_at timestamptz not null default now()
      );
    $q$, t);
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all   on public.%I;', t);
    execute format('drop policy if exists staff_all on public.%I;', t);
    -- Le personnel seul, pour tout : une cliente ne lit jamais un prix d'achat,
    -- un seuil, ni un bon de commande.
    execute format($q$
      create policy staff_all on public.%I for all to authenticated
        using (public.is_staff()) with check (public.is_staff());
    $q$, t);
  end loop;
end $$;

-- Les chemins que l'application parcourt sans cesse.
create index if not exists stock_mouvements_produit_idx on public.stock_mouvements ((data->>'produitId'));
create index if not exists stock_mouvements_ref_idx     on public.stock_mouvements ((data->>'reference'));
create index if not exists achats_lignes_commande_idx   on public.achats_lignes ((data->>'commandeId'));
create index if not exists consommations_service_idx    on public.consommations ((data->>'serviceId'));

-- Contrôle : six tables, zéro ligne chacune — elles se remplissent depuis
-- Le Trône (bouton « Reprendre la Gamme », puis la vie du salon).
select 'fournisseurs'     as table_creee, count(*) as lignes from public.fournisseurs
union all select 'stock_produits',   count(*) from public.stock_produits
union all select 'stock_mouvements', count(*) from public.stock_mouvements
union all select 'achats_commandes', count(*) from public.achats_commandes
union all select 'achats_lignes',    count(*) from public.achats_lignes
union all select 'consommations',    count(*) from public.consommations
order by 1;
