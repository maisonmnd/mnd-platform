-- ═══════════════════════════════════════════════════════════════════
-- 0019 — ÉTAPE 3 : le plateau technique se range dans les ateliers
--        (à coller dans Supabase → SQL Editor). EN DEUX TEMPS.
--
-- Le plateau contenait des gestes qui appartiennent à un atelier — les lavages,
-- les soins, les stylings, les retouches — mêlés à ce qui sert réellement les
-- deux maisons. Chacun rejoint sa place, en familles sous son atelier.
--
-- ── CE QUI COMMANDE TOUT ─────────────────────────────────────────
-- Un rendez-vous ne stocke ni la maison ni la catégorie de ses prestations,
-- seulement leurs identifiants. La ventilation se recalcule à chaque affichage
-- depuis le catalogue courant : déplacer une prestation RECLASSE TOUT
-- L'HISTORIQUE. C'est voulu, et c'est pourquoi les chiffres d'avant ont été
-- relevés dans docs/reference_maisons_avant_restructuration.md.
--
-- ── PAS DE DUPLICATION ───────────────────────────────────────────
-- Mesure du 5 août : sur les 8 familles du plateau, la colonne « vendue dans
-- une visite Studio seule » est à ZÉRO partout — 67 usages pour GBÌGBÌ™, 36
-- pour les stylings, tous côté Atelier. Dupliquer par maison aurait doublé le
-- catalogue contre un risque inexistant. Tout part à l'Atelier MND™.
--
-- ── CE QUI RESTE AU PLATEAU ──────────────────────────────────────
-- PLT·70 · SOINS ANNEXES — beauté et bien-être ne sont ni des locks ni du
-- cheveu libre. Ils servent les deux maisons sans appartenir à aucune : c'est
-- exactement ce pour quoi le plateau existe. La catégorie reste donc en place,
-- et le seau « Plateau seul » de la Synthèse continuera de la refléter.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU — ne modifie RIEN ────────────────────────────
select coalesce(c.data ->> 'code', c.id)   as categorie_actuelle,
       c.data ->> 'fon'                     as nom,
       count(s.id)                          as prestations,
       case
         when c.id = 'plt-05' then 'famille Lavages · GBÈJÍ™'
         when c.id in ('plt-10','plt-20','plt-30','plt-40') then 'famille Soins · GBÈJÍ™'
         when c.id = 'plt-45' then 'famille Le Défaisage · FÍNFÍN™'
         when c.id = 'plt-55' then 'à plat · GBÈJÍ™'
         when c.id = 'plt-70' then '— reste au plateau'
         when c.id = 'plt-50' then 'stylings → GBÈJÍ™ · retouches → VÈKPÈ™ et FÍNFÍN™'
         when c.id = 'plt-60' then 'WÈWÈ+DÀNDÀN → Soins · Couleur+Lumière → YÈKPÈ™'
         when c.id = 'dds'    then 'AFA·KLO → Lavages · AFA·WEW → Soins · AFA·YEK → YÈKPÈ™'
         else '?'
       end                                  as destination
from public.catalog_categories c
left join public.catalog_services s on s.data ->> 'categoryId' = c.id
where c.id in ('plt-05','plt-10','plt-20','plt-30','plt-40','plt-45',
               'plt-50','plt-55','plt-60','plt-70','dds')
group by c.id, c.data
order by 1;

-- Contrôle : une prestation PLT·60 qui ne serait ni WD ni CL n'a pas de
-- destination. Cette requête doit rendre ZÉRO ligne.
select data ->> 'code' as code_sans_destination, data ->> 'name' as nom
from public.catalog_services
where data ->> 'categoryId' = 'plt-60'
  and data ->> 'code' not like 'PLT·60·WD%'
  and data ->> 'code' not like 'PLT·60·CL%';


-- ══════════════════════════════════════════════════════════════════
-- ── ÉTAPE 2 · LE RANGEMENT. Décommenter et exécuter. ─────────────
-- Une seule transaction : si quoi que ce soit échoue, rien n'est écrit.
-- ══════════════════════════════════════════════════════════════════

-- begin;
--
-- -- 1) Les cinq familles, sous leur atelier.
-- insert into public.catalog_categories (id, branch_id, data)
-- select v.id,
--        (select branch_id from public.catalog_categories where id = v.parent),
--        jsonb_build_object('id', v.id, 'code', v.code, 'fon', v.fon,
--                           'label', v.label, 'parentId', v.parent,
--                           'enabled', true, 'order', v.ord)
-- from (values
--   ('cat-lavages',   'ATL·II·KLO', 'KLƆKLƆ™',    'Les lavages rituels',  'atl-ii-gbeji',  91),
--   ('cat-soins',     'ATL·II·SOI', 'Les Soins',  'Hydrater, purifier, reconstruire', 'atl-ii-gbeji', 92),
--   ('cat-styling',   'ATL·II·STY', 'Styling & Coiffures', 'Les sorties signature', 'atl-ii-gbeji', 93),
--   ('cat-ret-crea',  'ATL·I·RET',  'Retouches',  'Après une création',   'atl-i-vekpe',   91),
--   ('cat-ret-rest',  'ATL·IV·RET', 'Retouches',  'Après une restauration','atl-iv-finfin', 91),
--   ('cat-defaisage', 'ATL·IV·GBA', 'GBÀTÀ™',     'Le Défaisage',         'atl-iv-finfin', 92)
-- ) as v(id, code, fon, label, parent, ord)
-- on conflict (id) do nothing;
--
-- -- 2) Les catégories entières qui basculent.
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"cat-lavages"')
-- where data ->> 'categoryId' = 'plt-05';
--
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"cat-soins"')
-- where data ->> 'categoryId' in ('plt-10', 'plt-20', 'plt-30', 'plt-40');
--
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"cat-defaisage"')
-- where data ->> 'categoryId' = 'plt-45';
--
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"atl-ii-gbeji"')
-- where data ->> 'categoryId' = 'plt-55';
--
-- -- 3) PLT·50 se scinde : les sorties d'un côté, les retouches de l'autre.
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"cat-styling"')
-- where data ->> 'categoryId' = 'plt-50'
--   and (data ->> 'code' like 'PLT·50·STY%' or data ->> 'code' like 'PLT·50·EVE%');
--
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"cat-ret-crea"')
-- where data ->> 'code' like 'PLT·50·RET·C%';
--
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"cat-ret-rest"')
-- where data ->> 'code' like 'PLT·50·RET·R%';
--
-- -- 4) Les combinaisons rejoignent leur geste dominant, pas une famille commune :
-- --    c'est ce qui les rend comparables aux prestations qu'elles associent.
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"cat-soins"')
-- where data ->> 'code' like 'PLT·60·WD%';
--
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"atl-iii-yekpe"')
-- where data ->> 'code' like 'PLT·60·CL%';
--
-- -- 5) L'à façon suit le rituel dont il exécute le geste.
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"cat-lavages"')
-- where data ->> 'code' = 'AFA·KLO';
--
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"cat-soins"')
-- where data ->> 'code' like 'AFA·WEW%';
--
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"atl-iii-yekpe"')
-- where data ->> 'code' = 'AFA·YEK';
--
-- commit;


-- ── CONTRÔLES après l'étape 2 ─────────────────────────────────────
--
-- A. Plus aucune prestation dans les catégories vidées. Doit rendre ZÉRO.
-- select data ->> 'categoryId' as reste, count(*)
-- from public.catalog_services
-- where data ->> 'categoryId' in ('plt-05','plt-10','plt-20','plt-30','plt-40',
--                                 'plt-45','plt-50','plt-55','plt-60','dds')
-- group by 1;
--
-- B. Aucune prestation orpheline — toute catégorie citée doit exister.
-- select s.data ->> 'categoryId' as categorie_inconnue, count(*)
-- from public.catalog_services s
-- left join public.catalog_categories c on c.id = s.data ->> 'categoryId'
-- where c.id is null group by 1;
--
-- C. Puis dans Le Trône, Synthèse → Chiffre par maison, sur JUILLET :
--      Plateau seul  doit tomber à ce que porte PLT·70 seul
--      Atelier MND™  ≈ 2 368 000 F   (2 228 033 + les 140 500 du plateau)
--      Studio ACƆ™   inchangé à 47 667 F
--      total ventilé inchangé : 2 416 200 F
--    Un total qui bouge = une prestation perdue ou dupliquée.


-- ── ROLLBACK — défait entièrement l'étape 2 ──────────────────────
-- Chaque prestation retourne à sa catégorie d'origine, les familles créées
-- sont supprimées. Les codes n'ayant pas changé, ils suffisent à les retrouver.
--
-- begin;
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"plt-05"')  where data ->> 'code' like 'PLT·05%';
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"plt-10"')  where data ->> 'code' like 'PLT·10%';
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"plt-20"')  where data ->> 'code' like 'PLT·20%';
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"plt-30"')  where data ->> 'code' like 'PLT·30%';
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"plt-40"')  where data ->> 'code' like 'PLT·40%';
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"plt-45"')  where data ->> 'code' like 'PLT·45%';
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"plt-50"')  where data ->> 'code' like 'PLT·50%';
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"plt-55"')  where data ->> 'code' like 'PLT·55%';
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"plt-60"')  where data ->> 'code' like 'PLT·60%';
-- update public.catalog_services set data = jsonb_set(data, '{categoryId}', '"dds"')     where data ->> 'code' like 'AFA·%';
-- delete from public.catalog_categories
-- where id in ('cat-lavages','cat-soins','cat-styling','cat-ret-crea','cat-ret-rest','cat-defaisage');
-- commit;
