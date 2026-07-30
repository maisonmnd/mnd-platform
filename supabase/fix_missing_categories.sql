-- ═══════════════════════════════════════════════════════════════════
-- CATÉGORIES MANQUANTES — restauration depuis la nomenclature du code
-- (SQL Editor → Run). Idempotent : rejouable sans dommage.
--
-- LE DIAGNOSTIC A CHANGÉ. Le script de réparation des doublons laissait
-- 4 prestations « sans catégorie » (gbeza : 3 shampoings · dodo :
-- Perfectodil 5%) avec pour consigne « à rattacher à la main ». C'était
-- la mauvaise consigne : `gbeza` et `dodo` NE SONT PAS des identifiants
-- morts. Ce sont deux catégories parfaitement légitimes de la Maison —
-- GBÈZÀ™ « Coiffure & style » et DÒDÒ™ « Gamme & produits » — déclarées
-- dans CATEGORIES_SEED (src/shared/catalog.ts).
--
-- Les prestations sont donc bien rangées. Ce sont les deux LIGNES DE
-- CATÉGORIE qui manquent dans `catalog_categories` : une réinitialisation
-- a réécrit la table avec un jeu incomplet. Rattacher les prestations à
-- la main aurait déplacé 4 prestations correctes pour contourner deux
-- lignes absentes.
--
-- CE QUE FAIT CE SCRIPT : il réinsère les 7 catégories de la
-- nomenclature, `on conflict do nothing`. Les catégories déjà en base ne
-- sont PAS touchées — un libellé que la Maison aurait modifié depuis est
-- conservé. Seules les absentes sont recréées.
--
-- ⚠ VISIBILITÉ : les catégories restaurées arrivent avec `enabled: true`,
--   comme le déclare la nomenclature. Les 4 prestations concernées
--   redeviendront donc visibles côté front (Vitrine / Ma Couronne), sous
--   réserve de `vitrineConfig` qui filtre par-dessus. Si tu préfères les
--   restaurer éteintes, remplace `true` par `false` à la ligne marquée
--   « ← interrupteur » ; l'interrupteur se repose ensuite au Catalogue.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Qui est là AVANT (pour dire, à la fin, ce qui a été restauré) ──
create temp table avant on commit drop as
select id from public.catalog_categories;

-- ─── La nomenclature de la Maison, telle qu'elle est dans le code ───
create temp table seed_cats (id text primary key, fon text, label text, ordre int) on commit drop;
insert into seed_cats (id, fon, label, ordre) values
  ('doto',   'ÐÓTÓ™',   'Consultation & conseil', 0),
  ('vekpe',  'VÈKPÈ™',  'Création de couronne',   1),
  ('sinsin', 'SÍNSIN™', 'Entretien & resserrage', 2),
  ('finfin', 'FÍNFÍN™', 'Soin profond & rituel',  3),
  ('gbeza',  'GBÈZÀ™',  'Coiffure & style',       4),
  ('agbo',   'ÀGBÓ™',   'Restauration & SOS',     5),
  ('dodo',   'DÒDÒ™',   'Gamme & produits',       6);

-- ─── Restauration des seules absentes ──────────────────────────────
-- `catalog_categories` est globale à la Maison (pas de branche) : voir
-- `global_scoped` dans migrations/0001_init.sql → branch_id reste null.
insert into public.catalog_categories (id, branch_id, data)
select s.id, null,
       jsonb_build_object('id',      s.id,
                          'fon',     s.fon,
                          'label',   s.label,
                          'enabled', true,          -- ← interrupteur
                          'order',   s.ordre)
from seed_cats s
on conflict (id) do nothing;

-- ═══ RAPPORT ═══════════════════════════════════════════════════════
-- Un seul tableau : l'éditeur SQL n'affiche que la dernière requête.
select rubrique, detail
from (
  -- ① Les 7 de la nomenclature, et ce qui vient de leur arriver
  select 1 as bloc, s.ordre::bigint as rang,
         case when a.id is null then '✔ RESTAURÉE' else 'déjà présente' end as rubrique,
         s.fon || '  « ' || s.label || ' »  (' || s.id || ')' as detail
  from seed_cats s
  left join avant a on a.id = s.id

  -- ② Catégories en base qui ne sont PAS dans la nomenclature : des
  --    ajouts propres à la Maison. On n'y touche pas, on les signale.
  union all
  select 2, row_number() over (order by c.id), 'HORS NOMENCLATURE — intacte',
         coalesce(c.data->>'fon', '(sans nom fon)') || '  « '
      || coalesce(c.data->>'label', '(sans libellé)') || ' »  (' || c.id || ')'
  from public.catalog_categories c
  where not exists (select 1 from seed_cats s where s.id = c.id)

  -- ③ Reste-t-il une prestation orpheline ? Après ce script, ce bloc
  --    doit être VIDE. S'il rend une ligne, la catégorie citée n'est ni
  --    dans la nomenclature ni en base — là seulement il faut trancher
  --    à la main au Catalogue.
  union all
  select 3, row_number() over (order by s.data->>'categoryId'),
         '⚠ ENCORE SANS CATÉGORIE',
         coalesce(s.data->>'categoryId', '(vide)') || ' — ' || count(*) || ' : '
      || string_agg(coalesce(s.data->>'name', '(sans nom)'), ' · ')
  from public.catalog_services s
  where not exists (select 1 from public.catalog_categories c
                    where c.id = s.data->>'categoryId')
  group by s.data->>'categoryId'

  -- ④ La ligne rassurante
  union all
  select 4, 0::bigint, 'CONTRÔLE',
         'toute prestation du catalogue pointe désormais vers une catégorie qui existe.'
  where not exists (select 1 from public.catalog_services s
                    where not exists (select 1 from public.catalog_categories c
                                      where c.id = s.data->>'categoryId'))

  -- ⑤ Ce qui redevient rangé : combien de prestations par catégorie
  --    restaurée. C'est la vérification utile côté métier.
  union all
  select 5, row_number() over (order by s.data->>'categoryId'), 'RANGÉE DANS UNE RESTAURÉE',
         (s.data->>'categoryId') || ' — ' || count(*) || ' : '
      || string_agg(coalesce(s.data->>'name', '(sans nom)'), ' · ')
  from public.catalog_services s
  where s.data->>'categoryId' in (select sc.id from seed_cats sc
                                  where not exists (select 1 from avant a where a.id = sc.id))
  group by s.data->>'categoryId'
) t
order by bloc, rang;
