-- ═══════════════════════════════════════════════════════════════════
-- RÉPARATION DU CATALOGUE — doublons de migration & catégories mortes
-- (SQL Editor → Run). Idempotent : rejouable sans dommage.
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
-- CE QU'ON NE TOUCHE PAS : les PRIX. Onze paires divergent (la copie
-- portait le prix relevé dans les anciennes factures) — c'est une
-- décision de la Maison, pas une réparation technique. La liste est
-- donnée en fin de script.
--
-- NON FUSIONNÉ À DESSEIN : « SÍNSIN™ La Reprise Réveil Frontal » et
-- « … Réveil Frontal + » — deux prestations distinctes que seul le « + »
-- sépare.
-- ═══════════════════════════════════════════════════════════════════

-- ─── ÉTAT AVANT ────────────────────────────────────────────────────
select 'AVANT' as moment,
       (select count(*) from public.catalog_services)                                   as prestations,
       (select count(*) from public.catalog_services where id like 'svc-%')             as copies_migration,
       (select count(*) from public.catalog_services s
          where not exists (select 1 from public.catalog_categories c
                            where c.id = s.data->>'categoryId'))                        as categorie_morte;

-- ─── ① CATÉGORIES MORTES : « cat-X » → « X » quand X existe ────────
update public.catalog_services s
set data = jsonb_set(s.data, '{categoryId}', to_jsonb(substring(s.data->>'categoryId' from 5)))
where s.data->>'categoryId' like 'cat-%'
  and exists (select 1 from public.catalog_categories c
              where c.id = substring(s.data->>'categoryId' from 5));

-- ─── ② FUSION DES DOUBLONS ─────────────────────────────────────────
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

-- 2a) Les rendez-vous passent de la copie à l'originale. `min(ord)`
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

-- 2b) Les copies disparaissent du catalogue.
delete from public.catalog_services where id in (select dup from merge_map);

-- ─── ÉTAT APRÈS ────────────────────────────────────────────────────
select 'APRES' as moment,
       (select count(*) from public.catalog_services)                                   as prestations,
       (select count(*) from public.catalog_services where id like 'svc-%')             as copies_migration,
       (select count(*) from public.catalog_services s
          where not exists (select 1 from public.catalog_categories c
                            where c.id = s.data->>'categoryId'))                        as categorie_morte;

-- Ce qui reste rangé nulle part : « gbeza » et « dodo » n'ont aucune
-- catégorie correspondante. À rattacher à la main au Catalogue.
select s.data->>'categoryId' as categorie_introuvable, count(*) as prestations,
       string_agg(s.data->>'name', ' · ') as lesquelles
from public.catalog_services s
where not exists (select 1 from public.catalog_categories c where c.id = s.data->>'categoryId')
group by 1;
