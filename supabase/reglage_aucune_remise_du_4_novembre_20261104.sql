-- Aucune remise le mercredi 4 novembre 2026, jour chargé : 4 novembre 2026.
-- « Tu as conservé la remise sur tous les shampoings d'aujourd'hui. Ce n'était
-- pas ce qui était prévu. Modifie toutes les factures de ce jour » (Yéman),
-- puis au sélecteur : « il y avait plusieurs RDV, pas de remises les jours
-- occupés » ; la facture payée corrigée, 2 000 F restent dus, aucun message ne
-- part (la Maison le lui dit) ; les deux remises à la main de K. A. retirées ;
-- tout le −15 % de D. D. retiré.
--
-- Ce qui change, et rien d'autre :
--   F-2026-0769 (A. M. G. P., payée 45 000 F en espèces) : son KLƆKLƆ™
--     Signature perd le −15 % ; total 47 000 F, reste 2 000 F ; relances en
--     pause, pour qu'aucun rappel WhatsApp ne parte demain à 10 h.
--   RDV p0d9vhe9z8 (A. M. G. P., honoré) : sans MERCREDI15, prix figé à
--     47 000 F, celui de la facture ; payé 45 000 F, le Carnet dit 2 000 F.
--   RDV 9jq84t6z4t (R. S. A.), ap-f43y28ghwr (K. A.), vbwz3npbw2 (D. D.),
--     pas encore encaissés : sans code, sans remise de ligne, sans prix figé :
--     ils se lisent au tarif de leur tête, comme tout rendez-vous pas encore
--     honoré (apptTotalXof).
-- La remise de 8 000 F sur la Sublimation d'A. M. G. P. reste : c'est le prix
-- de la sublimation légère (« 20 minutes »), pas une offre.
--
-- REJOUABLE : chaque ligne ne change que si elle porte encore l'état lu le
-- 4 novembre 2026 à 17 h 40 (un encaissement fait entre-temps n'est pas
-- écrasé) ; la copie de repli ne se refait pas et reçoit RLS aussitôt (règle
-- des tables repli_). Les déclencheurs gardent la trace : invoice_audit pour
-- la facture payée, trace_le_geste pour les rendez-vous.

create table if not exists public.repli_remises_du_20261104 as
  select 'appointments'::text as quelle, id, branch_id, data, updated_at
    from public.appointments
   where id in ('p0d9vhe9z8', '9jq84t6z4t', 'ap-f43y28ghwr', 'vbwz3npbw2')
  union all
  select 'invoices'::text, id, branch_id, data, updated_at
    from public.invoices
   where id = 'inv-fq3jfqi5k3';
alter table public.repli_remises_du_20261104 enable row level security;

-- La facture payée : la ligne du shampoing sans −15 %, les relances en pause.
update public.invoices
   set data = jsonb_set(data, '{lines}', (
                select jsonb_agg(case when l->>'id' = 'il-qo4wtci5k1'
                                      then jsonb_set(l, '{discountPct}', '0'::jsonb)
                                      else l end order by o)
                  from jsonb_array_elements(data->'lines') with ordinality as t(l, o)))
              || jsonb_build_object('relancesPause', jsonb_build_object('le', public.abo_iso(now()), 'par', 'Yéman'))
 where id = 'inv-fq3jfqi5k3'
   and exists (select 1 from jsonb_array_elements(data->'lines') l
                where l->>'id' = 'il-qo4wtci5k1' and (l->>'discountPct')::numeric = 15);

-- Son rendez-vous honoré : le prix de la facture.
update public.appointments
   set data = (data - 'codeOffre' - 'offreId')
              || jsonb_build_object('remisesLignes', jsonb_build_array(null, null, jsonb_build_object('xof', 8000)),
                                    'priceXof', 47000)
 where id = 'p0d9vhe9z8'
   and data->>'codeOffre' = 'MERCREDI15'
   and (data->>'priceXof')::numeric = 45000;

-- R. S. A. : MERCREDI15 sur son KLƆKLƆ™ Essentiel.
update public.appointments
   set data = data - 'codeOffre' - 'offreId' - 'remisesLignes' - 'priceXof'
 where id = '9jq84t6z4t'
   and data->>'codeOffre' = 'MERCREDI15'
   and (data->>'priceXof')::numeric = 51000
   and data->>'status' <> 'honoré';

-- K. A. : 5 000 F et 1 000 F posés à la main.
update public.appointments
   set data = data - 'remisesLignes'
 where id = 'ap-f43y28ghwr'
   and data->'remisesLignes' = '[{"xof": 5000}, {"xof": 1000}]'::jsonb
   and data->>'status' <> 'honoré';

-- D. D. : −15 % sur tout, réservé sur Ma Couronne le 3 novembre 2026.
update public.appointments
   set data = data - 'codeOffre' - 'offreId' - 'remisesLignes' - 'priceXof'
 where id = 'vbwz3npbw2'
   and data->>'codeOffre' = 'MERCREDI15'
   and (data->>'priceXof')::numeric = 34000
   and data->>'status' <> 'honoré';
