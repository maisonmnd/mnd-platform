-- Les rendez-vous d'E. et N. du 31 octobre 2026 aux gestes réellement faits —
-- 2 novembre 2026, consigne de Yéman : lavage, Fulani braids (main d'œuvre) et
-- mèches à part, 30 000 F par enfant. Les prestations du rendez-vous
-- deviennent le lavage KLƆKLƆ Kids (5 000 F) et Fulani Braids · Kids
-- (10 000 F) ; les mèches (15 000 F) entrent dans la Gamme du rendez-vous.
-- Copie de repli des deux lignes avant. Rejouable : réécrit la même chose.
create table if not exists public.repli_rdv_fulani_20261102 as
  select id, data, updated_at from public.appointments where id in ('xtz1w8zu1t', 'j9iy5j0zef');
alter table public.repli_rdv_fulani_20261102 enable row level security;

update public.appointments
   set data = data
     || jsonb_build_object('serviceIds', jsonb_build_array('sv-kids-kloklo', 'sv-fulani-braids-kids'))
     || jsonb_build_object('gamme', jsonb_build_array(jsonb_build_object('id', 'pr-meches-fulani-braids', 'qty', 1, 'prixXof', 15000)))
     || jsonb_build_object('note', 'Lavage, Fulani braids posées par Hermine, mèches à part (15 000 F).'),
       updated_at = now()
 where id in ('xtz1w8zu1t', 'j9iy5j0zef')
   and data->>'status' <> 'honoré';

select id, data->'serviceIds' as services, data->'gamme' as gamme, data->>'status' as statut
  from public.appointments where id in ('xtz1w8zu1t', 'j9iy5j0zef');
