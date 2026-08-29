-- ═══════════════════════════════════════════════════════════════════
-- CE QUI PÈSE — 29 août 2026. LECTURE SEULE, rien n'est modifié.
--
-- « Organization exceeded its quota in the previous billing cycle. Projects
-- will be restricted from 23 Sep, 2026. » On mesure AVANT de couper : effacer
-- au jugé, c'est perdre ce qui servait et garder ce qui pesait.
--
-- UNE SEULE REQUÊTE, UN SEUL RÉSULTAT. Le SQL Editor n'affiche que le dernier
-- jeu de lignes : dix requêtes à la suite n'en montrent qu'une. Tout tient
-- donc ici, en un seul tableau, du plus lourd au plus léger.
--
-- Le plan gratuit accorde environ : 500 Mo de base, 1 Go de fichiers,
-- 5 Go de trafic sortant, 500 000 appels de fonctions par mois.
-- ═══════════════════════════════════════════════════════════════════

with
-- ① Le poids total de la base, en un chiffre.
base as (
  select 'BASE' as quoi, 'la base entière' as detail,
         pg_database_size(current_database()) as octets, null::bigint as combien
),
-- ② Les tables, de la plus lourde à la plus légère.
tables as (
  select 'table' as quoi, c.relname::text as detail,
         pg_total_relation_size(c.oid) as octets, c.reltuples::bigint as combien
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
),
-- ③ Les compartiments de fichiers. `sauvegardes` est le suspect principal :
--    une photographie de TOUTE la base par nuit, gardée soixante nuits.
coffres as (
  select 'FICHIERS' as quoi, o.bucket_id::text as detail,
         sum(coalesce((o.metadata->>'size')::bigint, 0)) as octets,
         count(*)::bigint as combien
  from storage.objects o
  group by o.bucket_id
),
-- ④ Ce que pèse UNE nuit — c'est ce chiffre qui dit combien on peut en garder.
une_nuit as (
  select 'une nuit' as quoi,
         coalesce(max(o.name), 'aucun cliché')::text as detail,
         coalesce(max(coalesce((o.metadata->>'size')::bigint, 0)), 0) as octets,
         count(*)::bigint as combien
  from storage.objects o
  where o.bucket_id = 'sauvegardes'
)
select
  quoi                                   as nature,
  detail,
  pg_size_pretty(octets)                 as poids,
  combien                                as lignes_ou_fichiers,
  round(100.0 * octets
        / nullif((select octets from base), 0), 1) as pct_de_la_base
from (
  select * from base
  union all select * from coffres
  union all select * from une_nuit
  union all select * from tables
) tout
where octets > 0
order by
  case quoi when 'BASE' then 0 when 'FICHIERS' then 1 when 'une nuit' then 2 else 3 end,
  octets desc
limit 40;

-- ═══════════════════════════════════════════════════════════════════
-- RENVOYEZ-MOI CE TABLEAU ENTIER. Je vous dirai précisément quoi couper, et
-- vous relirez chaque geste avant de le passer. On ne supprime rien à
-- l'aveugle dans une base de production.
--
-- DÉJÀ SU : `envois` est vide (0 ligne). Ce n'est donc pas le journal des
-- messages qui pèse — et cela dit au passage que les crons de rappel et de
-- confirmation n'ont encore rien envoyé.
-- ═══════════════════════════════════════════════════════════════════
