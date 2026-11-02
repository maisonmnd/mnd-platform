-- Le prix des rendez-vous d'E. et N. du 31 octobre 2026 — 2 novembre 2026.
-- Les deux rendez-vous gardaient le prix posé à la prise (12 000 F), qui
-- l'emporte sur les gestes : la facture aurait affiché une remise de 18 000 F.
-- Consigne de Yéman : 30 000 F par enfant (lavage 5 000 + main d'œuvre 10 000
-- + mèches 15 000). Copie de repli de l'état d'avant. Rejouable.
create table if not exists public.repli_prix_rdv_fulani_20261102 as
  select id, data, updated_at from public.appointments where id in ('xtz1w8zu1t', 'j9iy5j0zef');
alter table public.repli_prix_rdv_fulani_20261102 enable row level security;

update public.appointments
   set data = jsonb_set(data, '{priceXof}', '30000'::jsonb), updated_at = now()
 where id in ('xtz1w8zu1t', 'j9iy5j0zef')
   and data->>'status' <> 'honoré';

select id, data->>'priceXof' as prix, data->'serviceIds' as services, data->>'status' as statut
  from public.appointments where id in ('xtz1w8zu1t', 'j9iy5j0zef');
