-- ═══════════════════════════════════════════════════════════════════
-- RÉPARATION DU CATALOGUE — doublons de migration & catégories mortes
-- (SQL Editor → Run). Idempotent : rejouable sans dommage.
--
-- À LANCER D'ABORD : `preview_catalog_duplicates.sql`, qui montre tout
-- ce que ce script ferait SANS RIEN MODIFIER. Si son bloc « ⚠ ARRÊT »
-- rend une seule ligne, ne lance pas celui-ci.
--
-- DEUX DÉGÂTS, tous deux nés de la migration de l'ancien ERP (26-07) :
--
--  ① 32 prestations en DOUBLE. Le rapprochement par nom a échoué sur
--     celles-ci : la migration en a recréé une copie sous un identifiant
--     `svc-…` à côté de celle de la Maison (`sv-rituel-…`, `sv-dandan`…).
--     Les rendez-vous se sont répartis entre les deux, coupant en deux
--     l'historique et le chiffre de chaque prestation.
--
--  ② 52 prestations rangées dans une catégorie QUI N'EXISTE PLUS
--     (`cat-gbeji` au lieu de `gbeji`…). Les réinitialisations ont
--     renommé les catégories ; les prestations de la Maison ont gardé
--     l'ancien identifiant.
--
-- CE QU'ON GARDE : la prestation de la MAISON, jamais la copie. Elle
-- porte la description, le palier, l'interrupteur « suit le modèle », et
-- son identifiant est celui qu'invoquent les exemptions de prix du code
-- (FIXED_PRICE_SERVICE_IDS). La copie disparaît, ses rendez-vous sont
-- reversés à l'originale.
--
-- CE QU'ON NE TOUCHE PAS : les PRIX. Onze paires divergeaient au relevé
-- du 29-07 (la copie portait le prix des anciennes factures) — trancher
-- est une décision de la Maison, pas une réparation technique. Le prix
-- des deux côtés est PHOTOGRAPHIÉ avant la suppression de la copie et
-- restitué dans le RAPPORT FINAL, bloc « PRIX À TRANCHER ». Sans cette
-- photographie l'information partirait avec la copie.
--
-- NON FUSIONNÉ À DESSEIN : « SÍNSIN™ La Reprise Réveil Frontal » et
-- « … Réveil Frontal + » — deux prestations distinctes que seul le « + »
-- sépare.
-- ═══════════════════════════════════════════════════════════════════

-- ─── ÉTAT AVANT ────────────────────────────────────────────────────
-- Relevé, PAS affiché ici : l'éditeur SQL ne montre que le résultat de
-- la dernière requête. Tout est restitué dans le RAPPORT FINAL.
create temp table etat_avant on commit drop as
select (select count(*) from public.catalog_services)                       as prestations,
       (select count(*) from public.catalog_services where id like 'svc-%') as copies,
       (select count(*) from public.catalog_services s
          where not exists (select 1 from public.catalog_categories c
                            where c.id = s.data->>'categoryId'))            as cat_morte;

-- ─── DÉGÂT ② — CATÉGORIES MORTES : « cat-X » → « X » quand X existe ─
-- Traité en premier : indépendant de la fusion, et une prestation bien
-- rangée est plus facile à relire au Catalogue si la suite doit être
-- vérifiée à la main.
update public.catalog_services s
set data = jsonb_set(s.data, '{categoryId}', to_jsonb(substring(s.data->>'categoryId' from 5)))
where s.data->>'categoryId' like 'cat-%'
  and exists (select 1 from public.catalog_categories c
              where c.id = substring(s.data->>'categoryId' from 5));

-- ─── DÉGÂT ① — FUSION DES DOUBLONS ────────────────────────────────
-- Table de correspondance EXPLICITE : chaque ligne a été relevée et
-- vérifiée une à une. Pas de rapprochement automatique ici — sur des
-- données de production, une règle qui « devine » finit toujours par
-- fusionner deux prestations qui n'avaient rien à voir.
create temp table merge_map (dup text primary key, keep text not null) on commit drop;
insert into merge_map (dup, keep) values
  ('svc-ea30abf33e79', 'sv-rituel-mp1lproe'),
  ('svc-973745d278bf', 'sv-rituel-mpdgup11'),
  ('svc-0abbf4a27e33', 'sv-rituel-mpdj8t99'),
  ('svc-f58945b5b6b6', 'sv-rituel-mpdjbdm5'),
  ('svc-1da75f27bd85', 'sv-rituel-mpdji3sm'),
  ('svc-5f7f87acd432', 'sv-rituel-mpdjn3qx'),
  ('svc-b2b479c45e9f', 'sv-rituel-mpje726f'),
  ('svc-4c9010bea79b', 'sv-rituel-mpje7ji7'),
  ('svc-a8c39f2dabc2', 'sv-rituel-mpje8apm'),
  ('svc-cd851ab1d519', 'sv-rituel-mpskkhyn'),
  ('svc-c3cc3482da3a', 'sv-rituel-mq3ln93q'),
  ('svc-95ec38a471a6', 'sv-rituel-mpbpz23b'),
  ('svc-7a44ef230c5f', 'sv-rituel-mr6p76kx'),
  ('svc-b8ad274bfb7e', 'sv-rituel-mr3szmso'),
  ('svc-50ea8e39be1c', 'sv-rituel-mqkoqjub'),
  ('svc-5acab24afb63', 'sv-rituel-mqkoruz9'),
  ('svc-63772668b55e', 'sv-rituel-mpdikoo2'),
  ('svc-c88d8b8d7c46', 'sv-rituel-mq70mpw7'),
  ('svc-c3555f29716b', 'sv-yekpe-lumiere'),
  ('svc-2f41f1f90c0a', 'sv-dandan'),
  ('svc-ec45b063129b', 'sv-gbigbi-essentiel'),
  ('svc-ff7b5c80e1ec', 'sv-rituel-mpskliuh'),
  ('svc-cf634a87c3ad', 'sv-rituel-mq70pqmk'),
  ('svc-9170e7351b41', 'sv-rituel-mpl3brcs'),
  ('svc-f564b09d7731', 'sv-rituel-mpl2rty1'),
  ('svc-b5d33cc063eb', 'sv-alala'),
  ('svc-0bf3731a7095', 'sv-gbigbi-profond'),
  ('svc-5528eafbff27', 'sv-rituel-mpdjcyh0'),
  ('svc-8d1908479155', 'sv-rituel-mpf69yj3'),
  ('svc-67df51bf3142', 'sv-yekpe-sublimation'),
  ('svc-9c20227f4b41', 'sv-rituel-mq6vpu7d'),
  ('svc-65859c4a6bd7', 'sv-rituel-mpdj61e5');

-- a) LE PRIX DES PAIRES, RELEVÉ AVANT QUE LA COPIE DISPARAISSE.
--     Rien n'est modifié : on photographie. Le prix de la copie est celui
--     qu'a relevé la migration dans les anciennes factures ; celui de la
--     Maison est celui du Catalogue. Trancher est une décision de la
--     Maison — la liste est en fin de script.
--     Sur une seconde exécution, les copies n'existent plus : la jointure
--     ne rend rien et le rapport annonce zéro divergence. C'est normal.
--     `nullif` : un priceXof absent OU vide devient null, jamais une
--     erreur de conversion. La sentinelle -1 fait qu'« un prix contre
--     rien » compte comme une divergence — c'est bien ce qu'on veut voir.
create temp table prix_divergents on commit drop as
select d.data->>'name'                        as prestation,
       m.keep                                 as id_maison,
       nullif(k.data->>'priceXof', '')::numeric as prix_maison,
       nullif(d.data->>'priceXof', '')::numeric as prix_copie
from merge_map m
join public.catalog_services k on k.id = m.keep
join public.catalog_services d on d.id = m.dup
where coalesce(nullif(k.data->>'priceXof', '')::numeric, -1)
   <> coalesce(nullif(d.data->>'priceXof', '')::numeric, -1);

-- PRÉ-VOL (facultatif, rien n'est modifié) : pour avoir la liste EN MAIN
-- avant toute suppression, surligner de « create temp table merge_map »
-- jusqu'ici, décommenter la ligne ci-dessous, et Run. Les trois requêtes
-- surlignées ne font que lire et remplir des tables temporaires.
-- select * from prix_divergents order by prestation;

-- b) Les rendez-vous passent de la copie à l'originale. `min(ord)`
--     conserve l'ORDRE des prestations du rituel et fond en une seule
--     entrée le cas où un rendez-vous portait les deux.
update public.appointments a
set data = jsonb_set(a.data, '{serviceIds}',
      (select coalesce(jsonb_agg(x.v order by x.ord), '[]'::jsonb)
       from (
         select coalesce(m.keep, e.value) as v, min(e.ord) as ord
         from jsonb_array_elements_text(a.data->'serviceIds') with ordinality e(value, ord)
         left join merge_map m on m.dup = e.value
         group by 1
       ) x))
where exists (
  select 1 from jsonb_array_elements_text(a.data->'serviceIds') t(v)
  join merge_map m on m.dup = t.v
);

-- c) Les copies disparaissent du catalogue.
delete from public.catalog_services where id in (select dup from merge_map);

-- ═══ RAPPORT FINAL ═════════════════════════════════════════════════
-- Un seul tableau, parce que l'éditeur SQL n'affiche que le résultat de
-- la dernière requête. Trois blocs :
--   ① ÉTAT             — les compteurs, avant → après
--   ② PRIX À TRANCHER  — les paires dont les deux prix divergeaient
--   ③ SANS CATÉGORIE   — voir `fix_missing_categories.sql` : ce ne sont
--                        pas des identifiants morts, ce sont les LIGNES
--                        de catégorie qui manquent en base.
select rubrique, detail
from (
  select 1 as bloc, 0::bigint as rang, 'ÉTAT' as rubrique,
         'prestations ' || v.prestations || ' → ' || a.prestations
      || ' · copies svc- ' || v.copies    || ' → ' || a.copies
      || ' · catégorie morte ' || v.cat_morte || ' → ' || a.cat_morte as detail
  from etat_avant v,
       (select (select count(*) from public.catalog_services)                       as prestations,
               (select count(*) from public.catalog_services where id like 'svc-%') as copies,
               (select count(*) from public.catalog_services s
                  where not exists (select 1 from public.catalog_categories c
                                    where c.id = s.data->>'categoryId'))            as cat_morte) a

  union all
  -- `coalesce(…::text, 'aucun')` : sans lui, un prix null viderait TOUTE
  -- la ligne (en SQL, concaténer null rend null) — la paire disparaîtrait
  -- du rapport, silencieusement, et c'est justement celle qu'il faut voir.
  select 2, row_number() over (order by p.prestation), 'PRIX À TRANCHER',
         p.prestation || ' — Maison ' || coalesce(p.prix_maison::text, 'aucun')
                      || ' F · copie ' || coalesce(p.prix_copie::text, 'aucun')
                      || ' F  (' || p.id_maison || ')'
  from prix_divergents p

  union all
  select 3, row_number() over (order by s.data->>'categoryId'), 'SANS CATÉGORIE',
         (s.data->>'categoryId') || ' — ' || count(*) || ' : '
                                 || string_agg(s.data->>'name', ' · ')
  from public.catalog_services s
  where not exists (select 1 from public.catalog_categories c
                    where c.id = s.data->>'categoryId')
  group by s.data->>'categoryId'
) t
order by bloc, rang;
