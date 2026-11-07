-- ═══════════════════════════════════════════════════════════════════════
-- 0180 · GBÈJÍ™ FIDÉLITÉ REMISE À 20 % · 7 novembre 2026
--        Se rejoue sans danger (le résultat est le même à chaque fois).
--
-- « Remets à 20 %. » (Yéman, après la 0179 qui l'avait posée à 15 %.)
-- La remise de fidélité vaut 20 %, et la description le dit.
-- Prix pour une cliente : la somme de ses deux prestations à son prix, moins
-- 20 % (Medium ou Mini 26 400 F ; Micro, lavage mi-long : 36 000 F).
-- ═══════════════════════════════════════════════════════════════════════

update public.catalog_services
   set data = data || jsonb_build_object(
         'forfaitRemisePct', 20,
         'description', 'La constance récompensée : dès votre troisième venue, le lavage KLƆKLƆ™ Essentiel et la Reprise Longue Durée SÍNSIN™ Signature pris ensemble valent 20 % de moins, à votre prix, quel que soit votre calibre.')
 where id = 'sv-forfait-gbeji-fidelite';
