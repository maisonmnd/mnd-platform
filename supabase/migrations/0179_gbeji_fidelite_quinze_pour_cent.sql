-- ═══════════════════════════════════════════════════════════════════════
-- 0179 · GBÈJÍ™ FIDÉLITÉ À 15 % · 7 novembre 2026
--        Se rejoue sans danger (le résultat est le même à chaque fois).
--
-- « Je tranche pour 15 %. » (Yéman.) La remise de fidélité valait 20 % dans le
-- champ et 15 % dans la description : elle vaut 15 %. La description dit
-- désormais la composition posée par la 0178 (KLƆKLƆ™ Essentiel et SÍNSIN™
-- Signature, La Reprise Longue Durée), sans tiret long.
-- Prix pour une cliente : la somme de ses deux prestations à son prix, moins
-- 15 % (Medium ou Mini 28 050 F, Micro 36 550 F).
-- ═══════════════════════════════════════════════════════════════════════

update public.catalog_services
   set data = data || jsonb_build_object(
         'forfaitRemisePct', 15,
         'description', 'La constance récompensée : dès votre troisième venue, le lavage KLƆKLƆ™ Essentiel et la Reprise Longue Durée SÍNSIN™ Signature pris ensemble valent 15 % de moins, à votre prix, quel que soit votre calibre.')
 where id = 'sv-forfait-gbeji-fidelite';
