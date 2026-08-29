-- ═══════════════════════════════════════════════════════════════════
-- CE QUI DESCEND À CHAQUE OUVERTURE — 29 août 2026. LECTURE SEULE.
--
-- Le premier relevé a écarté deux suspects : la base pèse 71 Mo sur 500
-- accordés, et le coffre de fichiers 2,7 Mo sur 1 Go. NI L'UN NI L'AUTRE NE
-- DÉPASSE. Ce qui dépasse est donc le TRAFIC SORTANT (5 Go par mois).
--
-- Or la synchronisation lit `select id, data` sur CHAQUE table liée, SANS
-- limite ni filtre, à chaque chargement de page. Cette requête dit combien
-- pèse ce téléchargement — et donc combien d'ouvertures tiennent dans le mois.
--
-- ⚠ POIDS SUR DISQUE ≠ POIDS TRANSMIS. `clients` occupe 6,4 Mo de disque,
--   mais une table réécrite à chaque synchronisation traîne des lignes mortes
--   qui ne descendent JAMAIS chez la cliente. On mesure donc ici la taille
--   RÉELLE des données (`pg_column_size`), la seule qui voyage.
-- ═══════════════════════════════════════════════════════════════════

with liees as (
  -- Les tables que les applications synchronisent (bindCollection).
  select unnest(array[
    'academy_applications','academy_enrollments','achats_commandes','achats_lignes',
    'appointments','apprenants','attendance','bilans','blocages','branches','budgets',
    'caisses_indep','caisses_indep_mouvements','campaigns','cashboxes','catalog_categories',
    'catalog_products','catalog_services','certifications','client_sessions','clients',
    'coffre_movements','consommations','consult_forms','consultations_queue',
    'credit_movements','demandes_formule','enfants_declares','envois','expense_categories',
    'expenses','families','fil_messages','formations','fournisseurs','invoices',
    'lab_formules','lab_preparations','leave_requests','motifs_foyer','objectifs_coffre',
    'partage_config','payments','payroll_runs','personas','plans','prelevements',
    'prets_associes','salary_advances','stock_mouvements','stock_produits','subscribers',
    'team','tips','transferts_caisse'
  ]) as t
),
mesure as (
  select
    l.t as la_table,
    (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = l.t and c.relkind = 'r') as existe
  from liees l
),
poids as (
  select
    m.la_table,
    (xpath('/row/n/text()',
      query_to_xml(format(
        'select coalesce(sum(pg_column_size(data)),0) + coalesce(sum(pg_column_size(id)),0) as n from public.%I',
        m.la_table), false, true, '')))[1]::text::bigint as octets,
    (xpath('/row/n/text()',
      query_to_xml(format('select count(*) as n from public.%I', m.la_table), false, true, '')
      ))[1]::text::bigint as lignes
  from mesure m
  where m.existe = 1
)
select
  la_table,
  lignes,
  pg_size_pretty(octets)                                        as descend,
  round(100.0 * octets / nullif(sum(octets) over (), 0), 1)      as pct_du_total,
  pg_size_pretty(sum(octets) over ())                            as total_par_ouverture,
  -- Combien d'ouvertures de page tiennent dans les 5 Go du mois.
  (5::bigint * 1024 * 1024 * 1024) / nullif(sum(octets) over (), 0) as ouvertures_par_mois
from poids
where octets > 0
order by octets desc
limit 25;

-- ═══════════════════════════════════════════════════════════════════
-- LA COLONNE QUI DÉCIDE : `total_par_ouverture` (le même chiffre sur toutes
-- les lignes) et `ouvertures_par_mois`. Si ce dernier tombe sous quelques
-- centaines, le compte est fait — un salon qui ouvre l'application plusieurs
-- fois par jour sur plusieurs postes, plus les clientes, épuise le mois.
--
-- RENVOYEZ-MOI CE TABLEAU. Je saurai alors quoi alléger en premier, et si la
-- synchronisation doit cesser de tout retélécharger à chaque fois.
-- ═══════════════════════════════════════════════════════════════════
