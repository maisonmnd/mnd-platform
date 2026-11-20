-- ══ LA SÉANCE ANNIVERSAIRE OFFERTE PAR ERREUR, RETIRÉE · 20 novembre 2026 ══
-- « Je voulais mettre à jour le profil […] au lieu d'Enregistrer ses
-- coordonnées, j'ai appuyé le bouton Offrir une séance d'anniversaire […] la
-- séance que je lui ai offerte, il faut la remettre à sa place » (Yéman).
--
-- Le geste de 14 h 18 (heure de Cotonou) n'a rien envoyé : aucune fiche de
-- cette adresse n'a d'abonnement aux notifications, et le bouton n'envoie ni
-- e-mail ni WhatsApp. Il n'a écrit qu'une chose : birthdayGiftAt = 2026-11-20
-- sur la fiche me0s1upcpw. On retire ce champ, et rien d'autre ; le nom, la
-- date de naissance et l'autorisation signée ne bougent pas.
--
-- Garde : seulement si la marque est encore celle du 20 novembre. La fiche
-- d'avant est gardée dans une table de repli, sous RLS.
-- À passer UNE fois. NE PAS RELANCER.

create table if not exists public.repli_cadeau_anniversaire_20261120 as
  select id, data, updated_at from public.clients where id = 'me0s1upcpw';
alter table public.repli_cadeau_anniversaire_20261120 enable row level security;

update public.clients
   set data = data - 'birthdayGiftAt',
       updated_at = now()
 where id = 'me0s1upcpw'
   and data->>'birthdayGiftAt' = '2026-11-20'
returning id, data->>'birthdayGiftAt' as cadeau;
