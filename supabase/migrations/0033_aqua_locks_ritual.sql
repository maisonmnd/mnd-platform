-- ═══════════════════════════════════════════════════════════════════
-- 0033 — AQUA LOCKS RITUAL™ ENTRE AU CATALOGUE
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Le soin signature devient une prestation réservable : un seul geste au
-- Catalogue, trois prix et deux durées selon la longueur travaillée — le
-- patron du 0023, jamais trois lignes pour un même soin.
--
--   Court (locks < 20 cm)          15 000 F · 90 min
--   Mi-Long (20 à 40 cm)           20 000 F · 90 min
--   Long ou haute densité (> 40)   28 000 F · 105 min
--
-- La longueur se choisit à la RÉSERVATION et se fige sur le rendez-vous.
-- Pas d'indexation au calibre : un prix par longueur est un prix SAISI,
-- il sort au franc près. Le protocole du soin, lui, vit au Laboratoire
-- (formule AQUA-LR) — ceci n'est que la porte du calendrier.
--
-- Ce fichier ne porte AUCUN secret : ces tarifs s'affichent aux clientes.
-- `on conflict do nothing` : re-coller ne touche pas à vos réglages.
-- ═══════════════════════════════════════════════════════════════════

insert into public.catalog_services (id, branch_id, data) values
  ('aqua-locks-ritual', null, '{
    "id": "aqua-locks-ritual",
    "categoryId": "plt-10",
    "name": "AQUA LOCKS RITUAL™ · Le Soin Ultra-Hydratant",
    "palier": "Souveraineté",
    "priceXof": 15000,
    "hidePrice": false,
    "sessions": 1,
    "durationMin": 90,
    "order": 9999,
    "prixParLongueur": { "court": 15000, "mi-long": 20000, "long": 28000 },
    "dureeParLongueur": { "court": 90, "mi-long": 90, "long": 105 }
  }'::jsonb)
on conflict (id) do nothing;

-- Contrôle ① : la prestation, ses prix et ses durées.
select data->>'name'                 as prestation,
       data->'prixParLongueur'      as prix,
       data->'dureeParLongueur'     as durees
  from public.catalog_services where id = 'aqua-locks-ritual';

-- Contrôle ② : sa catégorie existe bien (DÀNDÀN™ · Le Soin Hydratant).
-- Si cette ligne revient VIDE, dites-le — on la rangera ailleurs.
select id, data->>'fon' as atelier, data->>'label' as nom
  from public.catalog_categories where id = 'plt-10';
