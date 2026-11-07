-- ═══════════════════════════════════════════════════════════════════════
-- 0177 · GBÈJÍ™ EXPRESS · LAVAGE ET RETOUCHE · 7 novembre 2026
--        Se rejoue sans danger (on conflict do nothing).
--
-- « Marie-Gisèle veut ses prochains 6 RDV dans le Trône […] une séance
-- complète KLƆKLƆ et SÍNSIN alterner avec une formule lavage et retouche
-- express. Il faut créer ses services d'abord. » « Un lavage et une reprise
-- ont un nom à MND » : la séance complète existe déjà (GBÈJÍ™ Signature · la
-- venue d'entretien : KLƆKLƆ Essentiel + SÍNSIN Signature, la sortie soignée
-- comprise). Reste la version express : le lavage et la retouche des contours
-- et des racines, POUR TOUTES LES CLIENTES (décision de Yéman), au prix de la
-- carte, comme les autres venues GBÈJÍ™ (priceXof 0, forfaitRemisePct 0).
-- Nom choisi par Yéman au sélecteur : « GBÈJÍ™ Express · lavage et retouche ».
-- ═══════════════════════════════════════════════════════════════════════

insert into public.catalog_services (id, branch_id, data) values
  ('sv-venue-gbeji-exp', null, '{
    "id": "sv-venue-gbeji-exp",
    "code": "ATL·II·VEN·X",
    "name": "GBÈJÍ™ Express · lavage et retouche",
    "order": 3,
    "master": "",
    "palier": "Élévation",
    "includes": [
      {"serviceId": "sv-plt-05-ess-c"},
      {"serviceId": "sv-retouches-post-reprise"}
    ],
    "priceXof": 0,
    "sessions": 1,
    "hidePrice": false,
    "priceMode": "fixe",
    "categoryId": "cat-venue",
    "palierPose": true,
    "description": "Le lavage KLƆKLƆ™ Essentiel et la retouche des contours et des racines, entre deux reprises complètes. Au prix de la carte.",
    "durationMin": 50,
    "durationMaxMin": 90,
    "forfaitRemisePct": 0
  }'::jsonb)
on conflict (id) do nothing;
