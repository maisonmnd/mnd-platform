-- ═══════════════════════════════════════════════════════════════════
-- DOUBLONS — LE DÉTAIL, LIGNE PAR LIGNE. LECTURE SEULE.
-- (SQL Editor → Run · « Run without RLS »)
--
-- L'audit précédent groupait, donc tronquait. Ici : UNE LIGNE PAR
-- RENDEZ-VOUS, en texte court, pour qu'on puisse décider sans deviner.
--
-- L'INDICE QUI TRANCHE : le préfixe de l'identifiant.
--   `appt-imp-…` → écrit par la MIGRATION de l'ancien ERP
--   `ap-…`       → écrit par l'APPLICATION, au fauteuil
-- Quand un groupe associe un `appt-imp-…` et un `ap-…`, la ligne d'import
-- est le doublon : la Maison a saisi le rendez-vous, l'import l'a recopié.
-- Le doute ne porte que sur les groupes de DEUX lignes d'import.
--
-- LES FACTURES AUSSI. Un rendez-vous dupliqué peut traîner une facture
-- dupliquée, et une facture payée compte dans la recette TOUTE SEULE,
-- sans son rendez-vous. Supprimer le rendez-vous sans regarder la facture
-- ne corrigerait qu'une moitié du faux. Bloc ③.
-- ═══════════════════════════════════════════════════════════════════

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

create temp table brut on commit drop as
select z.id, coalesce(sum(nullif(s.data->>'priceXof', '')::numeric), 0) as brut
from (select a.id, a.data->'serviceIds' as ids
      from public.appointments a
      where jsonb_typeof(a.data->'serviceIds') = 'array') z
cross join lateral jsonb_array_elements_text(z.ids) t(v)
left join public.catalog_services s on s.id = t.v
group by z.id;

create temp table grp on commit drop as
select qui, jour, heure, presta, count(*) as n, count(facture) as avec_facture
from k group by qui, jour, heure, presta having count(*) > 1;

create temp table lignes on commit drop as
select dense_rank() over (order by g.jour, g.heure, g.qui) as g_no,
       k2.id, k2.statut, k2.facture, k2.maitre, k2.updated_at,
       round(b.brut) as brut,
       case when k2.id like 'appt-imp-%' then 'IMPORT'
            when k2.id like 'ap-%'       then 'APP'
            else 'AUTRE' end as origine
from grp g
join k k2 on k2.qui = g.qui and k2.jour = g.jour and k2.heure = g.heure and k2.presta = g.presta
join brut b on b.id = k2.id;

-- ═══ RAPPORT ═══════════════════════════════════════════════════════
select rubrique, detail
from (
  -- ① Une ligne par rendez-vous, texte court : rien ne sera tronqué.
  select 1 as bloc, (l.g_no * 10 + row_number() over (partition by l.g_no order by l.origine, l.id))::bigint as rang,
         ('G' || l.g_no || ' · ' || l.origine) as rubrique,
         l.id || ' · ' || l.statut
      || ' · ' || coalesce('fac ' || l.facture, 'sans facture')
      || ' · ' || l.maitre
      || ' · ' || to_char(l.updated_at, 'DD/MM HH24:MI')
      || ' · ' || l.brut || ' F' as detail
  from lignes l

  -- ② Le verdict par groupe, une ligne chacun.
  union all
  select 2, l.g_no::bigint,
         case when count(*) filter (where l.origine = 'IMPORT') = 1
               and count(*) filter (where l.origine = 'APP')    = 1
              then '✔ G' || l.g_no || ' — SUPPRIMER LA LIGNE IMPORT'
              else '⚠ G' || l.g_no || ' — À TRANCHER À LA MAIN' end,
         count(*) || ' lignes · origines ' || string_agg(distinct l.origine, '+')
      || ' · ' || count(l.facture) || ' facture(s)'
      || ' · honorées ' || count(*) filter (where l.statut = 'honoré')
  from lignes l
  group by l.g_no

  -- ③ FACTURES EN DOUBLE — même numéro. Un numéro de facture est unique
  --    par nature : deux lignes qui le partagent sont un doublon d'import.
  union all
  select 3, row_number() over (order by min(i.data->>'date') desc),
         '⚠ FACTURE EN DOUBLE — même numéro',
         coalesce(i.data->>'number', '(sans numéro)') || ' · ' || count(*) || ' lignes · '
      || string_agg(i.id || '[' || coalesce(i.data->>'status', '?') || ']', ' ↔ ' order by i.id)
  from public.invoices i
  where nullif(i.data->>'number', '') is not null
  group by i.data->>'number'
  having count(*) > 1

  -- ④ Factures citées par les rendez-vous en double : à ne pas oublier.
  union all
  select 4, row_number() over (order by l.g_no),
         'FACTURE ACCROCHÉE À UN DOUBLON',
         'G' || l.g_no || ' · ' || l.facture || ' · '
      || coalesce((select coalesce(i.data->>'number','(sans n°)') || ' / ' || coalesce(i.data->>'status','?')
                   from public.invoices i where i.id = l.facture), 'FACTURE INTROUVABLE')
  from lignes l
  where l.facture is not null

  -- ⑤ Rien à signaler
  union all
  select 5, 0::bigint, 'CONTRÔLE', 'aucun doublon.'
  where not exists (select 1 from grp)
) t
order by bloc, rang;
