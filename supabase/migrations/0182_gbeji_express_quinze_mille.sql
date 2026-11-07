-- ═══════════════════════════════════════════════════════════════════════
-- 0182 · GBÈJÍ™ EXPRESS À 15 000 F · 7 novembre 2026
--        Se rejoue sans danger (le résultat est le même à chaque fois).
--
-- « Express 15000. » (Yéman.) Le pack « GBÈJÍ™ Express · lavage et retouche »
-- (0177) était au prix de la carte (priceXof 0, somme de ses deux prestations
-- à leur prix). Il a désormais un prix annoncé : 15 000 F, le même pour toutes
-- les clientes, quel que soit le calibre ou la longueur. Sa durée, ses deux
-- prestations et sa catégorie ne changent pas.
-- ═══════════════════════════════════════════════════════════════════════

update public.catalog_services
   set data = data || jsonb_build_object(
         'priceXof', 15000,
         'description', 'Le lavage KLƆKLƆ™ Essentiel et la retouche des contours et des racines, entre deux reprises complètes. 15 000 F.')
 where id = 'sv-venue-gbeji-exp';
