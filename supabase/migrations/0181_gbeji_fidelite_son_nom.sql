-- ═══════════════════════════════════════════════════════════════════════
-- 0181 · GBÈJÍ™ FIDÉLITÉ, SON NOM DIT SA COMPOSITION · 7 novembre 2026
--        Se rejoue sans danger (le résultat est le même à chaque fois).
--
-- « Écrire lavage KLƆKLƆ Essentiel + reprise SINSIN longue durée. » (Yéman.)
-- Le nom portait l'ancienne composition (« Reprise & Shampoing Signature »).
-- Il dit désormais ce que le pack contient. Rien d'autre ne change.
-- ═══════════════════════════════════════════════════════════════════════

update public.catalog_services
   set data = data || jsonb_build_object(
         'name', 'GBÈJÍ™ Fidélité · lavage KLƆKLƆ™ Essentiel + reprise SÍNSIN™ longue durée')
 where id = 'sv-forfait-gbeji-fidelite';
