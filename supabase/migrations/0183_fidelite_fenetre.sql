-- ═══════════════════════════════════════════════════════════════════════
-- 0183 · GBÈJÍ™ FIDÉLITÉ, SA FENÊTRE DE 4 À 6 SEMAINES · 7 novembre 2026
--        Se rejoue sans danger (le résultat est le même à chaque fois).
--
-- « Fidélité n'est disponible pour un client uniquement entre 4 et 6
-- semaines de sa dernière venue. Mais au-delà des 6 semaines ce service
-- n'est plus disponible. » (Yéman, 7 novembre 2026.)
--
-- Une seule ligne, un seul champ : `fenetreApresVenue` sur
-- `sv-forfait-gbeji-fidelite`. Le pack ne se propose à une cliente que si le
-- rendez-vous choisi tombe de 28 jours (inclus) à 42 jours (inclus) après sa
-- dernière venue honorée ; sans venue, jamais. Les juges sont
-- `dansLaFenetreDeVenue` (src/shared/catalogue-pur.ts), appelé par
-- `estProposable` (Ma Couronne, Trône) et par `laPlaceTient`
-- (demande-submit, whatsapp-automate). Au Trône, la Maison est prévenue, pas
-- empêchée. Rien d'autre ne change : ni le prix, ni la remise de 20 %, ni le
-- nom, ni la composition.
--
-- Une ligne absente ne crée rien (UPDATE seulement). Retirer la règle :
--   update public.catalog_services set data = data - 'fenetreApresVenue'
--    where id = 'sv-forfait-gbeji-fidelite';
-- ═══════════════════════════════════════════════════════════════════════

update public.catalog_services
   set data = data || '{"fenetreApresVenue": {"deSemaines": 4, "aSemaines": 6}}'::jsonb
 where id = 'sv-forfait-gbeji-fidelite';
