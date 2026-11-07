-- ═══════════════════════════════════════════════════════════════════════
-- 0193 · LES DEUX « LE MOMENT » SE DISTINGUENT · 7 novembre 2026
--        Se rejoue sans danger (le résultat est le même à chaque fois).
--
-- « Les deux Moment s'appellent Le Moment. Besoin d'une distinction. »
-- (Yéman.) Choix au sélecteur : renommer les deux.
--   · sv-le-moment              : « Le Moment · le soin et le temps » devient
--                                 « Le Moment Signature » ;
--   · sv-le-moment-cuir-chevelu : « Le Moment · cuir chevelu » devient
--                                 « Le Moment Cuir chevelu ».
-- Rien d'autre ne change (composition, prix, remise, catégorie).
-- ═══════════════════════════════════════════════════════════════════════

update public.catalog_services
   set data = data || jsonb_build_object('name', 'Le Moment Signature')
 where id = 'sv-le-moment';

update public.catalog_services
   set data = data || jsonb_build_object('name', 'Le Moment Cuir chevelu')
 where id = 'sv-le-moment-cuir-chevelu';
