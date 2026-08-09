-- ═══════════════════════════════════════════════════════════════════
-- 0034 — LE TEMPS RÉEL OUBLIÉ
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Les migrations 0028 et 0030 à 0032 ont créé neuf tables sans les inscrire à
-- la publication Realtime — contrairement à toutes les migrations de données
-- d'avant (0004, 0005, 0008, 0009…). L'abonnement `postgres_changes` de
-- l'application était donc MUET sur ces tables : deux postes ne se voyaient
-- qu'au refetch de focus, avec une fenêtre où le journal local périmé laissait
-- passer une DOUBLE consommation (l'idempotence par référence lit le journal
-- local), et où le miroir de la vitrine se recalculait sans les mouvements de
-- l'autre poste.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare t text;
begin
  foreach t in array array[
    'enfants_declares',
    'fournisseurs', 'stock_produits', 'stock_mouvements',
    'achats_commandes', 'achats_lignes', 'consommations',
    'lab_preparations', 'lab_formules'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;

-- Contrôle : les neuf tables doivent apparaître.
select tablename
  from pg_publication_tables
 where pubname = 'supabase_realtime' and schemaname = 'public'
   and tablename in ('enfants_declares','fournisseurs','stock_produits','stock_mouvements',
                     'achats_commandes','achats_lignes','consommations','lab_preparations','lab_formules')
 order by 1;
