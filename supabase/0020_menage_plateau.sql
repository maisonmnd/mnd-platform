-- ═══════════════════════════════════════════════════════════════════
-- 0020 — MÉNAGE : les catégories du plateau vidées par l'étape 3
--        (à coller dans Supabase → SQL Editor). EN DEUX TEMPS.
--
-- Le script 0019 a sorti les prestations du plateau vers leurs ateliers. Les
-- catégories, elles, sont restées : dix coquilles à « 0 élément » sous LE
-- PLATEAU TECHNIQUE. Elles ne servent plus rien et brouillent la lecture.
--
-- ── POURQUOI EN BASE ET NON À L'ÉCRAN ────────────────────────────
-- Le Trône refuse de propager un effacement de ≥ 10 lignes valant ≥ 25 % d'une
-- table : c'est le garde-fou posé après l'incident du 23 juillet (28 prestations
-- effacées d'un geste local). Dix suppressions au Catalogue tomberaient dedans.
-- On passe donc par la base, et l'écran se remet à jour au rechargement.
--
-- ── CE QUI COMMANDE LE CHOIX ─────────────────────────────────────
-- Une catégorie n'est supprimée que si QUATRE choses sont vraies : aucune
-- prestation, aucun produit, aucune famille rangée dessous, et aucun forfait
-- qui la désigne dans sa composition (« selon le calibre »). Un forfait qui
-- pointe vers une catégorie disparue perdrait sa séance EN SILENCE.
--
-- À FAÇON (`dds`) est dans les candidates SANS l'être d'office : le 0019 n'en a
-- sorti que KLƆKLƆ, WÈWÈ et YÈKPÈ. Si la quatrième prestation ou les six
-- anciennes désactivées y sont restées, l'étape 2 la laisse en place.
--
-- PLT·70 · SOINS ANNEXES n'est pas candidate : elle est le plateau.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU — ne modifie RIEN. À lire avant l'étape 2. ───
with candidate as (
  select c.id, c.data
  from public.catalog_categories c
  where (c.id like 'plt-%' or c.id = 'dds')
    and c.id <> 'plt-70'
)
select coalesce(k.data ->> 'code', k.id)                     as code,
       k.data ->> 'fon'                                       as nom,
       (select count(*) from public.catalog_services s
          where s.data ->> 'categoryId' = k.id)               as prestations,
       (select count(*) from public.catalog_products p
          where p.data ->> 'categoryId' = k.id)               as produits,
       (select count(*) from public.catalog_categories f
          where f.data ->> 'parentId' = k.id)                 as familles,
       (select count(*) from public.catalog_services s,
               jsonb_array_elements(coalesce(s.data -> 'includes', '[]'::jsonb)) inc
          where inc ->> 'categoryId' = k.id)                  as forfaits_qui_la_visent,
       case when (select count(*) from public.catalog_services s
                    where s.data ->> 'categoryId' = k.id) = 0
             and (select count(*) from public.catalog_products p
                    where p.data ->> 'categoryId' = k.id) = 0
             and (select count(*) from public.catalog_categories f
                    where f.data ->> 'parentId' = k.id) = 0
             and (select count(*) from public.catalog_services s,
                         jsonb_array_elements(coalesce(s.data -> 'includes', '[]'::jsonb)) inc
                    where inc ->> 'categoryId' = k.id) = 0
            then 'SUPPRIMÉE'
            else '— conservée' end                            as sort
from candidate k
order by 1;


-- ══════════════════════════════════════════════════════════════════
-- ── ÉTAPE 2 · LA SUPPRESSION. Décommenter et exécuter. ───────────
--
-- Ferme d'abord tous les onglets du Trône : un onglet resté ouvert garde les
-- catégories dans son cache. Il ne les recréera pas — il ne les verra
-- simplement disparaître qu'au rechargement.
--
-- Les lignes retirées sont d'abord COPIÉES dans une table de secours. C'est
-- elle qui rend le rollback possible sans réécrire les données à la main.
-- ══════════════════════════════════════════════════════════════════

-- begin;
--
-- create table if not exists public.menage_0020_secours
--   (like public.catalog_categories including all);
-- -- RLS ACTIVÉE SANS AUCUNE POLITIQUE : une table du schéma `public` est servie
-- -- par l'API dès sa création. Sans ce verrou, la sauvegarde serait lisible par
-- -- n'importe quelle clé anonyme. L'éditeur SQL, lui, passe outre.
-- alter table public.menage_0020_secours enable row level security;
--
-- with candidate as (
--   select c.id
--   from public.catalog_categories c
--   where (c.id like 'plt-%' or c.id = 'dds')
--     and c.id <> 'plt-70'
-- ),
-- vides as (
--   select k.id from candidate k
--   where not exists (select 1 from public.catalog_services s
--                       where s.data ->> 'categoryId' = k.id)
--     and not exists (select 1 from public.catalog_products p
--                       where p.data ->> 'categoryId' = k.id)
--     and not exists (select 1 from public.catalog_categories f
--                       where f.data ->> 'parentId' = k.id)
--     and not exists (select 1 from public.catalog_services s,
--                            jsonb_array_elements(coalesce(s.data -> 'includes', '[]'::jsonb)) inc
--                       where inc ->> 'categoryId' = k.id)
-- )
-- insert into public.menage_0020_secours
-- select * from public.catalog_categories where id in (select id from vides);
--
-- delete from public.catalog_categories
-- where id in (select id from public.menage_0020_secours);
--
-- commit;


-- ── CONTRÔLES après l'étape 2 ─────────────────────────────────────
--
-- A. Ce qui a été retiré, et ce qui reste au plateau.
-- select 'retirée' as etat, coalesce(data ->> 'code', id) as code, data ->> 'fon' as nom
-- from public.menage_0020_secours
-- union all
-- select 'reste', coalesce(data ->> 'code', id), data ->> 'fon'
-- from public.catalog_categories
-- where (id like 'plt-%' or id = 'dds')
-- order by 1 desc, 2;
--
-- B. Aucune prestation orpheline — toute catégorie citée doit exister.
--    Doit rendre ZÉRO ligne.
-- select s.data ->> 'categoryId' as categorie_inconnue, count(*)
-- from public.catalog_services s
-- left join public.catalog_categories c on c.id = s.data ->> 'categoryId'
-- where c.id is null group by 1;
--
-- C. Puis dans Le Trône, après rechargement (Ctrl+Maj+R) :
--      Catalogue → LE PLATEAU TECHNIQUE ne montre plus que SOINS ANNEXES
--                  (et À FAÇON si elle a gardé des prestations)
--      Synthèse → Chiffre par maison, JUILLET : les trois totaux INCHANGÉS.
--    Une catégorie vide n'ayant jamais porté de chiffre, aucun montant ne doit
--    bouger. S'il bouge, c'est qu'une prestation était encore rattachée.


-- ── ROLLBACK — remet tout en place ───────────────────────────────
--
-- begin;
-- insert into public.catalog_categories
-- select * from public.menage_0020_secours
-- on conflict (id) do nothing;
-- drop table public.menage_0020_secours;
-- commit;


-- ── QUAND TOUT EST VÉRIFIÉ, la table de secours peut partir ──────
-- Ne la supprime qu'après avoir contrôlé l'écran : elle est le seul moyen de
-- revenir en arrière.
--
-- drop table public.menage_0020_secours;
