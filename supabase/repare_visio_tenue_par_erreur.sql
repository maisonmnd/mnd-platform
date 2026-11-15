-- Réparation ponctuelle (15 novembre 2026) : une visio réservée pour le mardi
-- 17 novembre a été marquée « tenue », avec un résumé, le 14 au soir, pendant
-- les essais de la file B. Elle n'a pas encore eu lieu : elle redevient
-- « réservée » et perd ce résumé (la cliente l'aurait vu à la fin de la visio,
-- et le bouton « Envoyer le lien » ne s'affichait plus).
--
-- Sans effet si on la relance : elle ne touche que cette visio, et seulement
-- tant qu'elle porte encore ce résumé-là.

update public.visios
   set statut = 'réservée',
       resume = null,
       maj_le = now()
 where id = 'vz-rlzoumg2lkce'
   and statut = 'tenue'
   and resume ->> 'le' = '2026-11-14T22:47:29.908Z'
returning id, debut, statut, resume;
