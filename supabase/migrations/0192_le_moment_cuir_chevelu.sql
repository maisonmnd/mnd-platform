-- ═══════════════════════════════════════════════════════════════════════
-- 0192 · LE MOMENT · CUIR CHEVELU · 7 novembre 2026
--        Se rejoue sans danger (on conflict do nothing).
--
-- « Marie-Gisèle a beaucoup de souci de cheveux avec son cuir chevelu, des
-- démangeaisons, maintenant elle veut prendre Le Moment, comment lui adapter
-- cette formule ? » puis « Crée alors cette formule. » (Yéman.)
--
-- Même programme que « Le Moment · le soin et le temps » (trois venues : le
-- jour J, +8 semaines, +12 semaines, une remise de 20 % sur l'ensemble), avec
-- deux changements pour un cuir chevelu irrité :
--   · la Sublimation (renfort de la fibre) cède la place à WÈWÈ™ · Détox &
--     Purification à la première venue ;
--   · le VÍVÍVÓ™ offert (ail noir, gingembre, cannelle, massage) est retiré
--     de la deuxième venue.
-- Aucune promesse de soin : la Maison ne soigne pas, elle adapte ses gestes.
-- ═══════════════════════════════════════════════════════════════════════

insert into public.catalog_services (id, branch_id, data) values
  ('sv-le-moment-cuir-chevelu', null, '{
    "id": "sv-le-moment-cuir-chevelu",
    "code": "ATL·II·VEN·MC",
    "name": "Le Moment · cuir chevelu",
    "order": 4,
    "master": "",
    "palier": "Élévation",
    "includes": [
      {"serviceId": "sv-plt-05-sig-c"},
      {"serviceId": "sv-atl-ii-l"},
      {"serviceId": "sv-plt-20-c"},
      {"serviceId": "sv-plt-05-sig-c", "afterWeeks": 8},
      {"serviceId": "sv-retouches-post-reprise", "afterWeeks": 8},
      {"offert": true, "serviceId": "sv-plt-05-ess-c", "afterWeeks": 12},
      {"serviceId": "sv-plt-10-m", "afterWeeks": 12},
      {"serviceId": "sv-atl-ii-l", "afterWeeks": 12}
    ],
    "priceXof": 0,
    "sessions": 1,
    "hidePrice": false,
    "priceMode": "fixe",
    "categoryId": "cat-venue",
    "palierPose": true,
    "description": "Le Moment pour un cuir chevelu sensible : KLƆKLƆ™ Signature, SÍNSIN™ Signature et WÈWÈ™ Détox & Purification, sans horloge, sur un créneau dédié, puis la reprise à 8 et à 12 semaines. Sans le VÍVÍVÓ™ tant que le cuir chevelu est irrité.",
    "durationMin": 240,
    "durationMaxMin": 360,
    "forfaitRemisePct": 20
  }'::jsonb)
on conflict (id) do nothing;
