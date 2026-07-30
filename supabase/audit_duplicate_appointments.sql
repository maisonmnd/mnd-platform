-- ═══════════════════════════════════════════════════════════════════
-- RENDEZ-VOUS EN DOUBLE — audit décisionnel. LECTURE SEULE.
-- (SQL Editor → Run · « Run without RLS » : les tables temporaires.)
--
-- POURQUOI ÇA COMPTE PLUS QUE L'AFFICHAGE. Un rendez-vous « honoré »
-- dupliqué n'est pas seulement une ligne en trop au Catalogue :
--   · il compte DEUX FOIS dans la recette du jour, le Bilan mensuel,
--     Analytics et la Synthèse ;
--   · il compte DEUX FOIS dans les commissions du maître (Paie) ;
--   · il gonfle la dépense à vie de la cliente (Clientes).
-- Tant qu'il est là, tous ces chiffres sont faux vers le haut.
--
-- CE FICHIER NE SUPPRIME RIEN. Il range les doublons en deux tas :
--   · TRANCHABLE — un seul des deux porte une facture. L'autre est
--     presque sûrement l'artefact d'import : rien ne s'y accroche.
--   · À REGARDER — les deux portent une facture, ou aucun. Là, seule la
--     Maison sait si la cliente est passée une ou deux fois.
--
-- `updated_at` est le meilleur indice : les lignes nées du même import
-- portent le même horodatage, à la seconde près.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Les rendez-vous à plat, avec leur clé d'identité ──────────────
create temp table k on commit drop as
select a.id,
       a.updated_at,
       coalesce(a.data->>'clientId', a.data->>'clientName', '?') as qui,
       coalesce(a.data->>'date', '?')                            as jour,
       coalesce(a.data->>'time', '')                             as heure,
       coalesce(a.data->>'status', '')                           as statut,
       coalesce(a.data->>'master', '—')                          as maitre,
       nullif(a.data->>'invoiceId', '')                          as facture,
       coalesce((select string_agg(v, ',' order by v)
                 from jsonb_array_elements_text(a.data->'serviceIds') t(v)), '') as presta
from public.appointments a
where jsonb_typeof(a.data->'serviceIds') = 'array';

-- ─── Le brut catalogue de chaque rendez-vous (ORDRE DE GRANDEUR) ───
-- Somme des prix catalogue des prestations. Ce n'est PAS le net encaissé
-- (ni remise, ni barème modèle) — juste de quoi mesurer l'enjeu.
create temp table brut on commit drop as
select z.id, coalesce(sum(nullif(s.data->>'priceXof', '')::numeric), 0) as brut
from (select a.id, a.data->'serviceIds' as ids
      from public.appointments a
      where jsonb_typeof(a.data->'serviceIds') = 'array') z
cross join lateral jsonb_array_elements_text(z.ids) t(v)
left join public.catalog_services s on s.id = t.v
group by z.id;

-- ─── Les groupes en double ─────────────────────────────────────────
create temp table grp on commit drop as
select qui, jour, heure, presta, count(*) as n,
       count(facture)                                as avec_facture,
       count(*) filter (where statut = 'honoré')     as honores
from k
group by qui, jour, heure, presta
having count(*) > 1;

-- ═══ RAPPORT ═══════════════════════════════════════════════════════
select rubrique, detail
from (
  -- ① L'enjeu — les lignes
  select 1 as bloc, 0::bigint as rang, 'ENJEU — LIGNES' as rubrique,
         (select count(*) from grp) || ' groupe(s) en double · '
      || (select coalesce(sum(n - 1), 0) from grp) || ' ligne(s) en trop, dont '
      || (select coalesce(sum(greatest(honores - 1, 0)), 0) from grp)
      || ' honorée(s) — ce sont celles-là qui faussent recettes, commissions et dépense à vie' as detail

  -- ① bis L'enjeu — l'ordre de grandeur en argent
  union all
  select 1, 1::bigint, 'ENJEU — MONTANT (ordre de grandeur)',
         '~' || coalesce(round(sum(b.brut)), 0)
      || ' F de brut catalogue portés par les lignes HONORÉES des groupes en double.'
      || ' Environ la moitié est en trop. Ce n''est pas le net encaissé : ni remise, ni barème modèle.'
  from grp g
  join k k2 on k2.qui = g.qui and k2.jour = g.jour and k2.heure = g.heure and k2.presta = g.presta
  join brut b on b.id = k2.id
  where k2.statut = 'honoré'

  -- ② TRANCHABLE : un seul des deux porte une facture
  union all
  select 2, row_number() over (order by g.jour desc, g.qui),
         '✔ TRANCHABLE — garder la ligne facturée',
         g.jour || ' ' || g.heure || ' · ' || g.qui || ' · ' || g.n || ' lignes · '
      || string_agg(k2.id || '[' || k2.statut
                    || case when k2.facture is null then ' SANS FACTURE' else ' facture ' || k2.facture end
                    || ' · ' || k2.maitre || ' · ' || to_char(k2.updated_at, 'DD/MM HH24:MI:SS') || ']',
                    '  ↔  ' order by k2.facture nulls last)
  from grp g
  join k k2 on k2.qui = g.qui and k2.jour = g.jour and k2.heure = g.heure and k2.presta = g.presta
  where g.avec_facture = 1 and g.n = 2
  group by g.jour, g.heure, g.qui, g.n

  -- ③ À REGARDER : les deux facturés, ou aucun des deux
  union all
  select 3, row_number() over (order by g.jour desc, g.qui),
         '⚠ À REGARDER — la Maison doit trancher',
         g.jour || ' ' || g.heure || ' · ' || g.qui || ' · ' || g.n || ' lignes · '
      || case when g.avec_facture = 0 then 'AUCUNE facture' else g.avec_facture || ' factures' end
      || ' · ' || string_agg(k2.id || '[' || k2.statut || ' · ' || k2.maitre
                             || ' · ' || to_char(k2.updated_at, 'DD/MM HH24:MI:SS') || ']',
                             '  ↔  ' order by k2.id)
  from grp g
  join k k2 on k2.qui = g.qui and k2.jour = g.jour and k2.heure = g.heure and k2.presta = g.presta
  where not (g.avec_facture = 1 and g.n = 2)
  group by g.jour, g.heure, g.qui, g.n, g.avec_facture

  -- ④ L'indice d'import : les horodatages qui reviennent
  union all
  select 4, row_number() over (order by count(*) desc),
         'NÉES DU MÊME GESTE — horodatage partagé',
         to_char(k2.updated_at, 'DD/MM/YYYY HH24:MI:SS') || ' · ' || count(*) || ' rendez-vous'
  from k k2
  join grp g on g.qui = k2.qui and g.jour = k2.jour and g.heure = k2.heure and g.presta = k2.presta
  group by k2.updated_at
  having count(*) > 1

  -- ⑤ Rien à signaler
  union all
  select 5, 0::bigint, 'CONTRÔLE', 'aucun rendez-vous en double.'
  where not exists (select 1 from grp)
) t
order by bloc, rang;
