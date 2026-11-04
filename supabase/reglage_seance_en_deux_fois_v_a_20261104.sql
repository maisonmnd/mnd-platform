-- Une séance en deux fois : 4 novembre 2026, au soir.
-- « J'ai une cliente, V. A., qui est venue aujourd'hui, mais elle va faire sa
-- séance en 2 fois. Elle a fait une partie de sa séance, le shampoing,
-- aujourd'hui, et elle finalise demain sur un rendez-vous à 8 h 30 [...] Elle
-- ne peut pas être clôturée aujourd'hui. Elle sera sur les recettes de
-- demain » (Yéman). Au sélecteur : un seul rendez-vous demain 8 h 30, aucun
-- message, le rendez-vous du 10 novembre retiré.
--
-- Ce qui change, et rien d'autre :
--   RDV rdv-cafbf008-… (V. A., KLƆKLƆ™ Essentiel + SÍNSIN™ Signature, Team,
--     pas encore honoré ni encaissé) : du mercredi 4 novembre 2026 à 14 h au
--     jeudi 5 novembre 2026 à 8 h 30, mêmes gestes, même maître. Il se
--     termine et s'encaisse demain : une facture, la recette du 5 novembre.
--     Aucun message : `sansConfirmation` (confirmation-rdv ne le confirme
--     pas) et `confirmeeParLaClienteLe` (le rappel de la veille et Perle se
--     taisent : elle l'a dit au comptoir).
--   RDV ap-mb1csazio3 (sa reprise du mardi 10 novembre 2026 à 11 h, mêmes
--     gestes) : annulé par la Maison, sans message ; le prochain se
--     proposera demain, à l'encaissement.
--
-- REJOUABLE : chaque ligne ne change que si elle porte encore l'état lu le
-- 4 novembre 2026 à 21 h 30 ; la copie de repli ne se refait pas et reçoit RLS
-- aussitôt (règle des tables repli_). Le déclencheur trace_le_geste garde la
-- trace.

create table if not exists public.repli_seance_en_deux_fois_20261104 as
  select id, branch_id, data, updated_at
    from public.appointments
   where id in ('rdv-cafbf008-2856-4e4a-9ccd-1fcd7239dc98', 'ap-mb1csazio3');
alter table public.repli_seance_en_deux_fois_20261104 enable row level security;

-- La séance d'aujourd'hui finit demain à 8 h 30.
update public.appointments
   set data = data || jsonb_build_object(
                'date', '2026-11-05',
                'time', '08:30',
                'sansConfirmation', true,
                'confirmeeParLaClienteLe', public.abo_iso(now()),
                'note', coalesce(nullif(data->>'note', '') || ' · ', '') || 'Séance en deux fois : shampoing fait le mercredi 4 novembre 2026 ; finie et encaissée le jeudi 5 novembre 2026 à 8 h 30 (Yéman). Aucun message.'),
       updated_at = now()
 where id = 'rdv-cafbf008-2856-4e4a-9ccd-1fcd7239dc98'
   and data->>'date' = '2026-11-04'
   and data->>'time' = '14:00'
   and data->>'status' = 'confirmé'
   and coalesce(data->>'invoiceId', '') = '';

-- Sa reprise du 10 novembre est retirée.
update public.appointments
   set data = data || jsonb_build_object(
                'status', 'annulé',
                'annuleeLe', public.abo_iso(now()),
                'annuleePar', 'maison',
                'note', coalesce(data->>'note', '') || ' · Retiré le 4 novembre 2026 : sa séance se finit le 5 novembre 2026, le prochain se proposera à l''encaissement.'),
       updated_at = now()
 where id = 'ap-mb1csazio3'
   and data->>'date' = '2026-11-10'
   and data->>'status' = 'confirmé';

-- Ce qui se lit après.
select id, data->>'date' as jour, data->>'time' as heure, data->>'status' as statut,
       data->>'sansConfirmation' as sans_confirmation, data->>'confirmeeParLaClienteLe' as confirmee
  from public.appointments
 where id in ('rdv-cafbf008-2856-4e4a-9ccd-1fcd7239dc98', 'ap-mb1csazio3')
 order by 2;
