-- Prix des Fulani Braids · Kids — 2 novembre 2026, consigne de Yéman pour E. et
-- N. (rituel du 31 octobre 2026) : « le total de leur facture doit faire
-- 30 000 F par personne avec les mèches bien mises à part à 15 000 F ».
-- Lavage KLƆKLƆ Kids 5 000 F (déjà au catalogue) + main d'œuvre 10 000 F +
-- mèches 15 000 F (revente) = 30 000 F par enfant.
-- Rejouable : copie de repli des deux lignes avant, puis le même prix.
create table if not exists public.repli_prix_fulani_20261102 as
  select 'service' as genre, id, data from public.catalog_services where id = 'sv-fulani-braids-kids'
  union all
  select 'produit', id, data from public.catalog_products where id = 'pr-meches-fulani-braids';
alter table public.repli_prix_fulani_20261102 enable row level security;

update public.catalog_services set data = jsonb_set(data, '{priceXof}', '10000'::jsonb)
 where id = 'sv-fulani-braids-kids';
update public.catalog_products set data = jsonb_set(data, '{priceXof}', '15000'::jsonb)
 where id = 'pr-meches-fulani-braids';

select s.id, s.data->>'priceXof' as prix from public.catalog_services s where s.id = 'sv-fulani-braids-kids'
union all
select p.id, p.data->>'priceXof' from public.catalog_products p where p.id = 'pr-meches-fulani-braids';
