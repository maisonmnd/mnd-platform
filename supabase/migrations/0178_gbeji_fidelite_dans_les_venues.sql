-- ═══════════════════════════════════════════════════════════════════════
-- 0178 · GBÈJÍ™ FIDÉLITÉ DANS LES VENUES · 7 novembre 2026
--        Se rejoue sans danger (le résultat est le même à chaque fois).
--
-- « GBÈJÍ™ Fidélité c'est le lavage et le SÍNSIN. Il faut l'emménager dans le
-- catalogue. » Puis : « GBÈJÍ™ Fidélité c'est KLƆKLƆ Essentiel et Reprise
-- Longue Durée. » (Yéman.)
--
-- La ligne `sv-forfait-gbeji-fidelite` existait, mais rangée à part (catégorie
-- « atl-ii-gbeji ») et composée de KLƆKLƆ Signature (L'Ancrage). Elle devient
-- ce que Yéman dit : KLƆKLƆ™ Essentiel · Le Souffle (sv-plt-05-ess-c) et
-- SÍNSIN™ Signature · La Reprise Longue Durée (sv-atl-ii-l), rangée avec les
-- autres venues GBÈJÍ™ (cat-venue). Durée : 20 + 150 minutes.
-- NE CHANGE PAS : le prix (au prix de la carte, priceXof 0), la remise de
-- fidélité (forfaitRemisePct) et son texte : à confirmer par Yéman.
-- ═══════════════════════════════════════════════════════════════════════

update public.catalog_services
   set data = data || '{
         "includes": [
           {"serviceId": "sv-plt-05-ess-c"},
           {"serviceId": "sv-atl-ii-l"}
         ],
         "categoryId": "cat-venue",
         "durationMin": 170
       }'::jsonb
 where id = 'sv-forfait-gbeji-fidelite';
