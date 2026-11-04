-- ══ MERCREDI15 COUPÉ EN ATTENDANT LA NOUVELLE RÈGLE · 4 novembre 2026 ═══
-- Yéman, le 4 novembre 2026 : jamais deux remises (prix convenus,
-- abonnement, remise déjà là), et la remise de 15 % ne vaut plus qu'un jour
-- OUVRÉ SANS AUCUN RENDEZ-VOUS à 9 h, pour les trois premiers rendez-vous
-- du jour même. L'offre « Le mercredi de la Maison » (of-mercredi15), telle
-- qu'elle est, ferait l'inverse : elle s'éteint (active = false) jusqu'à ce
-- que la nouvelle règle soit construite, éprouvée et en ligne. Tous les
-- moteurs (comptoir, Caisse, site, Ma Couronne, demande-submit) lisent
-- `active` : plus rien ne pose ni n'affiche ce code. Le document d'avant est
-- gardé dans une table de repli, sous RLS. À passer UNE fois.

create table if not exists public.repli_mnd_offers_20261104_coupe as
  select * from public.documents where key = 'mnd_offers';
alter table public.repli_mnd_offers_20261104_coupe enable row level security;

update public.documents
   set data = (select jsonb_agg(case when o->>'id' = 'of-mercredi15' then jsonb_set(o, '{active}', 'false') else o end order by i)
                 from jsonb_array_elements(data) with ordinality as t(o, i)),
       updated_at = now()
 where key = 'mnd_offers'
   and jsonb_typeof(data) = 'array';
