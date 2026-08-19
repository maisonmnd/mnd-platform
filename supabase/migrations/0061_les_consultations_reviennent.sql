-- ═══════════════════════════════════════════════════════════════════
-- 0061 — LES CONSULTATIONS REVIENNENT · 19 août 2026
--
-- « Il y avait quelques consultations que nous avons créées ensemble.
--   J'aimerais les retrouver et voir lesquelles remettre dans l'ERP. »
--
-- Les trois consultations ÐÓTÓ™ ont quitté le catalogue le 30 juillet,
-- quand les semences automatiques ont été débranchées (l'incident des 94
-- prestations recréées seules), et l'import v6 ne les a pas reprises.
--
-- DÉCISION DE YÉMAN (19 août) : en remettre DEUX, dans l'atelier KÒKÒ™
-- (Le Diagnostic — la maison des consultations du v6). La troisième,
-- « Réparation & Amélioration », N'EST PAS recréée : « elle est devenue
-- le KÒKÒ Suivi · Diagnostic Locks Externes » — la recréer ferait deux
-- portes pour le même geste.
--
-- Idempotent : `on conflict do nothing` — les identifiants d'origine sont
-- gardés (svc-doto-*), pour que l'histoire des rendez-vous qui les
-- portaient les retrouve. `order` 8 et 9 : en queue de l'atelier, la
-- Maison les remonte du Catalogue si elle veut.
-- ═══════════════════════════════════════════════════════════════════

insert into public.catalog_services (id, branch_id, data) values
  ('svc-doto-conseil', null, '{
    "id": "svc-doto-conseil",
    "categoryId": "koko",
    "name": "Consultation Conseil & Diagnostic",
    "description": "Un temps d’écoute et de conseil : routine, entretien à la maison, produits — pour que votre couronne tienne, entre deux passages au fauteuil.",
    "palier": "Fondation",
    "priceXof": 5000,
    "hidePrice": false,
    "priceMode": "fixe",
    "sessions": 1,
    "master": "",
    "durationMin": 30,
    "order": 8,
    "temps": [0, 0, 0, 0]
  }'::jsonb),
  ('svc-doto-creation', null, '{
    "id": "svc-doto-creation",
    "categoryId": "koko",
    "name": "Consultation Création — Première couronne",
    "description": "Le premier rendez-vous : lecture du cheveu et du cuir chevelu, choix de la méthode et projection de votre future couronne. Le point de départ de toute création.",
    "palier": "Fondation",
    "priceXof": 10000,
    "hidePrice": false,
    "priceMode": "fixe",
    "sessions": 1,
    "master": "",
    "durationMin": 45,
    "order": 9,
    "temps": [0, 0, 0, 0]
  }'::jsonb)
on conflict (id) do nothing;

-- ── LE CONTRÔLE — un compte qui PEUT échouer ────────────────────────
-- Attendu : revenus = 2 (ou 1/0 si un id existait déjà — le dire),
-- et l'atelier koko les liste par leur nom.
select
  (select count(*) from public.catalog_services
    where id in ('svc-doto-conseil', 'svc-doto-creation')) as revenus,
  (select count(*) from public.catalog_services
    where data ->> 'categoryId' = 'koko') as tout_koko;

select id, data ->> 'name' as nom, data ->> 'priceXof' as prix
from public.catalog_services
where id in ('svc-doto-conseil', 'svc-doto-creation');
