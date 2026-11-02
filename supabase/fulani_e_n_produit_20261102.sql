-- E. et N. du 31 octobre 2026, choix de Yéman du 2 novembre 2026 :
--  1. la prestation des tresses ne dit plus « main d'œuvre » ni le nom de la
--     tresseuse : « Fulani Braids · Kids » ;
--  2. les mèches sont une VENTE DU PRODUIT « Mèches · Fulani Braids » à son
--     prix de revente (15 000 F, Catalogue › Produits › Mèches), hors rituel et
--     hors commissions : elles reviennent dans la Gamme des deux rendez-vous, le
--     rituel vaut 15 000 F (lavage 5 000 + tresses 10 000). La prestation
--     « Mèches · Fulani Braids · achat » est rangée (archivée).
-- (Le nom des deux fiches se change au Trône, jamais dans un fichier public.)
-- Copies de repli de l'état d'avant. Rejouable.
create table if not exists public.repli_fulani_produit_20261102 as
  select 'service' as genre, id, data from public.catalog_services where id in ('sv-fulani-braids-kids', 'sv-meches-fulani-braids')
  union all
  select 'rdv', id, data from public.appointments where id in ('xtz1w8zu1t', 'j9iy5j0zef');
alter table public.repli_fulani_produit_20261102 enable row level security;

update public.catalog_services
   set data = data || jsonb_build_object(
     'name', 'Fulani Braids · Kids',
     'description', 'Tresses Fulani pour enfant : nattes collées sur le devant et le dessus, tresses libres derrière. Les mèches se vendent à part, au prix de la Maison.')
 where id = 'sv-fulani-braids-kids';
update public.catalog_services set data = jsonb_set(data, '{archived}', 'true'::jsonb)
 where id = 'sv-meches-fulani-braids';

update public.appointments
   set data = data
     || jsonb_build_object('serviceIds', jsonb_build_array('sv-kids-kloklo', 'sv-fulani-braids-kids'))
     || jsonb_build_object('priceXof', 15000)
     || jsonb_build_object('gamme', jsonb_build_array(jsonb_build_object('id', 'pr-meches-fulani-braids', 'qty', 1, 'prixXof', 15000)))
     || jsonb_build_object('note', 'Lavage, Fulani braids, mèches à part (15 000 F).'),
       updated_at = now()
 where id in ('xtz1w8zu1t', 'j9iy5j0zef')
   and data->>'status' <> 'honoré';

select 'service' as genre, id, (data->>'name') || ' · archivé ' || coalesce(data->>'archived', 'false') as quoi, data->>'priceXof' as prix
  from public.catalog_services where id in ('sv-kids-kloklo', 'sv-fulani-braids-kids', 'sv-meches-fulani-braids')
union all
select 'rdv', id, (data->>'status') || ' · ' || (data->'serviceIds')::text || ' · gamme ' || coalesce((data->'gamme')::text, '-'), data->>'priceXof'
  from public.appointments where id in ('xtz1w8zu1t', 'j9iy5j0zef');
