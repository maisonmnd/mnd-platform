-- 0183 · ARCHIVER « GBÈJÍ™ TRIMESTRIEL · LE CYCLE DE VIE, 3 MOIS » · 7 novembre 2026
--
-- « Annuler dans Catalogue Abonnement : GBÈJÍ™ Trimestriel · Le Cycle de
-- Vie, 3 mois » (Y.). La nouvelle grille le retirait en janvier (« remplacé
-- par les Carnets en lunes », nouvelle-grille-pur.ts) ; la Maison le retire
-- aujourd'hui.
--
-- ARCHIVÉE, JAMAIS SUPPRIMÉE (`estArchivee`, catalog.ts) : masquée au comptoir,
-- dans Ma Couronne, sur la carte et sur le site, mais l'historique la lit
-- toujours par son identifiant. Au moment de l'écriture, aucun rendez-vous,
-- aucun abonné et aucune facture ne la portent. Réversible : remettre
-- `archived` à faux.
--
-- Une seule ligne, rejouable (sans effet si déjà archivée).

update public.catalog_services
   set data = data || jsonb_build_object('archived', true, 'archivedLe', '2026-11-07'),
       updated_at = now()
 where id = 'sv-forfait-sv-fft-ii-01'
   and coalesce(data->>'archived', '') <> 'true';
