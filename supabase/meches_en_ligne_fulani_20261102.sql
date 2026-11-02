-- Les mèches des Fulani braids en ligne de la facture — 2 novembre 2026.
-- La facture d'un rituel honoré ne porte que ses prestations (la Gamme ne s'y
-- grave qu'à l'encaissement) : pour que la maman d'E. et N. lise les mèches à
-- part dès la facture, avec le même total partout (rendez-vous, facture,
-- encaissement), les mèches deviennent une ligne de prestation à 15 000 F.
-- La Gamme posée plus tôt sur les deux rendez-vous est retirée (sinon elle se
-- redemanderait à l'encaissement). Rejouable.
insert into public.catalog_services (id, branch_id, data)
values ('sv-meches-fulani-braids', null, jsonb_build_object(
  'id', 'sv-meches-fulani-braids',
  'code', 'STU·A·FUL·M',
  'name', 'Mèches · Fulani Braids · achat',
  'order', 109,
  'master', '',
  'palier', 'Fondation',
  'archived', false,
  'priceXof', 15000,
  'sessions', 1,
  'hidePrice', false,
  'priceMode', 'fixe',
  'categoryId', '4z5icbhka0',
  'description', 'Les mèches achetées pour la coiffure Fulani, facturées à part de la main d''œuvre.',
  'durationMin', 0))
on conflict (id) do nothing;

update public.appointments
   set data = (data - 'gamme')
     || jsonb_build_object('serviceIds', jsonb_build_array('sv-kids-kloklo', 'sv-fulani-braids-kids', 'sv-meches-fulani-braids')),
       updated_at = now()
 where id in ('xtz1w8zu1t', 'j9iy5j0zef')
   and data->>'status' <> 'honoré';

select id, data->'serviceIds' as services, data->'gamme' as gamme, data->>'status' as statut
  from public.appointments where id in ('xtz1w8zu1t', 'j9iy5j0zef');
