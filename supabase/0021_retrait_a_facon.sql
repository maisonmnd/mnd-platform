-- ═══════════════════════════════════════════════════════════════════
-- 0021 — Retrait d'À FAÇON et de ses six « Droit de service »
--        (à coller dans Supabase → SQL Editor). EN DEUX TEMPS.
--
-- La catégorie a été refaite : quatre prestations à façon vivent désormais sous
-- leur atelier. Les six anciennes sont restées dans `dds`, désactivées. Le
-- Catalogue les marque « Jamais réservée » — aucun rendez-vous ne les porte.
--
-- ── CE QUE LE BADGE NE VOIT PAS ──────────────────────────────────
-- Le badge de l'écran ne compte que les RENDEZ-VOUS. Un identifiant de
-- prestation se cache dans trois autres endroits, et l'un d'eux suffirait à
-- rendre l'effacement dangereux :
--   · la composition d'un FORFAIT       (catalog_services → includes[].serviceId)
--   · les prestations d'un ABONNEMENT   (plans → included[].serviceId)
--   · une offre du CERCLE               (documents `mnd_offers`)
-- L'étape 1 les interroge tous les quatre. On n'efface que sur du zéro mesuré.
--
-- Les rendez-vous ANNULÉS sont comptés eux aussi : le badge les ignore — à
-- juste titre, ils ne portent pas de chiffre — mais un identifiant effacé y
-- laisserait quand même une ligne muette au Carnet.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU — ne modifie RIEN. À lire avant l'étape 2. ───
with cible as (
  select s.id, s.data
  from public.catalog_services s
  where s.data ->> 'categoryId' = 'dds'
)
select k.data ->> 'code'                                     as code,
       k.data ->> 'name'                                      as prestation,
       coalesce((k.data ->> 'enabled')::boolean, true)         as active,
       (select count(*) from public.appointments a
          where a.data -> 'serviceIds' ? k.id)                 as rendez_vous,
       (select count(*) from public.catalog_services f,
               jsonb_array_elements(coalesce(f.data -> 'includes', '[]'::jsonb)) inc
          where inc ->> 'serviceId' = k.id)                    as forfaits,
       (select count(*) from public.plans p,
               jsonb_array_elements(coalesce(p.data -> 'included', '[]'::jsonb)) inc
          where inc ->> 'serviceId' = k.id)                    as abonnements,
       (select count(*) from public.documents d
          where d.key = 'mnd_offers' and d.data::text like '%' || k.id || '%') as offres
from cible k
order by 1;


-- ══════════════════════════════════════════════════════════════════
-- ── ÉTAPE 2 · LE RETRAIT. Décommenter et exécuter. ───────────────
--
-- Ferme d'abord tous les onglets du Trône.
--
-- N'efface QUE ce que l'étape 1 montre à zéro partout. Une prestation citée
-- quelque part reste en place, et la catégorie avec elle : le `delete` de la
-- catégorie ne passe que si plus rien n'y est rattaché.
-- ══════════════════════════════════════════════════════════════════

-- begin;
--
-- create table if not exists public.menage_0021_services
--   (like public.catalog_services including all);
-- create table if not exists public.menage_0021_categories
--   (like public.catalog_categories including all);
-- -- RLS ACTIVÉE SANS POLITIQUE : une table du schéma `public` est servie par
-- -- l'API dès sa création. Sans ce verrou, la sauvegarde serait lisible par
-- -- n'importe quelle clé anonyme. L'éditeur SQL, lui, passe outre.
-- alter table public.menage_0021_services   enable row level security;
-- alter table public.menage_0021_categories enable row level security;
--
-- with cible as (
--   select s.id from public.catalog_services s
--   where s.data ->> 'categoryId' = 'dds'
-- ),
-- libres as (
--   select k.id from cible k
--   where not exists (select 1 from public.appointments a
--                       where a.data -> 'serviceIds' ? k.id)
--     and not exists (select 1 from public.catalog_services f,
--                            jsonb_array_elements(coalesce(f.data -> 'includes', '[]'::jsonb)) inc
--                       where inc ->> 'serviceId' = k.id)
--     and not exists (select 1 from public.plans p,
--                            jsonb_array_elements(coalesce(p.data -> 'included', '[]'::jsonb)) inc
--                       where inc ->> 'serviceId' = k.id)
--     and not exists (select 1 from public.documents d
--                       where d.key = 'mnd_offers' and d.data::text like '%' || k.id || '%')
-- )
-- insert into public.menage_0021_services
-- select * from public.catalog_services where id in (select id from libres)
-- on conflict (id) do nothing;
--
-- delete from public.catalog_services
-- where id in (select id from public.menage_0021_services);
--
-- -- La catégorie ne part que si elle est VIDE — sinon elle reste, et une
-- -- prestation retenue garde un toit.
-- insert into public.menage_0021_categories
-- select * from public.catalog_categories c
-- where c.id = 'dds'
--   and not exists (select 1 from public.catalog_services s where s.data ->> 'categoryId' = c.id)
--   and not exists (select 1 from public.catalog_products p where p.data ->> 'categoryId' = c.id)
--   and not exists (select 1 from public.catalog_categories f where f.data ->> 'parentId' = c.id)
--   and not exists (select 1 from public.catalog_services s,
--                          jsonb_array_elements(coalesce(s.data -> 'includes', '[]'::jsonb)) inc
--                     where inc ->> 'categoryId' = c.id)
-- on conflict (id) do nothing;
--
-- delete from public.catalog_categories
-- where id in (select id from public.menage_0021_categories);
--
-- commit;


-- ── CONTRÔLES après l'étape 2 ─────────────────────────────────────
--
-- A. Ce qui a été retiré.
-- select 'prestation' as quoi, data ->> 'code' as code, data ->> 'name' as nom
-- from public.menage_0021_services
-- union all
-- select 'catégorie', coalesce(data ->> 'code', id), data ->> 'fon'
-- from public.menage_0021_categories
-- order by 1, 2;
--
-- B. Aucune prestation orpheline. Doit rendre ZÉRO ligne.
-- select s.data ->> 'categoryId' as categorie_inconnue, count(*)
-- from public.catalog_services s
-- left join public.catalog_categories c on c.id = s.data ->> 'categoryId'
-- where c.id is null group by 1;
--
-- C. Aucun rendez-vous ne pointe vers une prestation disparue.
--    Doit rendre ZÉRO ligne.
-- select a.id, sid as prestation_inconnue
-- from public.appointments a,
--      jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
-- left join public.catalog_services s on s.id = sid
-- where s.id is null;
--
-- D. Puis dans Le Trône, après rechargement (Ctrl+Maj+R) :
--      Catalogue → À FAÇON a disparu
--      Synthèse  → Chiffre par maison, JUILLET : les trois totaux INCHANGÉS.
--    Une prestation jamais réservée n'a jamais porté de chiffre.


-- ── ROLLBACK — remet tout en place ───────────────────────────────
--
-- begin;
-- insert into public.catalog_categories select * from public.menage_0021_categories
-- on conflict (id) do nothing;
-- insert into public.catalog_services   select * from public.menage_0021_services
-- on conflict (id) do nothing;
-- commit;


-- ── QUAND TOUT EST VÉRIFIÉ, les sauvegardes peuvent partir ───────
-- drop table public.menage_0021_services;
-- drop table public.menage_0021_categories;
