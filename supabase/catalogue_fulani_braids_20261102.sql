-- Fulani Braids · Kids et ses mèches — 2 novembre 2026, demande de Yéman pour
-- la facture d'E. et N. (rituel du 31 octobre 2026) : « créer un bon service
-- autour de ça pour que leur maman comprenne », avec « l'achat de la mèche et
-- la main d'œuvre », et « pouvoir mettre les prix de revente des mèches ».
-- Deux fiches neuves, prix à zéro : Yéman les remplit elle-même dans
-- Le Trône › Catalogue. Rejouable : une fiche déjà là n'est jamais réécrite
-- (ses prix remplis restent).
insert into public.catalog_services (id, branch_id, data)
values ('sv-fulani-braids-kids', null, jsonb_build_object(
  'id', 'sv-fulani-braids-kids',
  'code', 'STU·A·FUL·K',
  'name', 'Fulani Braids · Kids · main d''œuvre',
  'order', 108,
  'master', '',
  'palier', 'Fondation',
  'archived', false,
  'priceXof', 0,
  'sessions', 1,
  'hidePrice', false,
  'priceMode', 'fixe',
  'categoryId', '4z5icbhka0',
  'description', 'Tresses Fulani pour enfant : nattes collées sur le devant et le dessus, tresses libres derrière, posées par Hermine, notre tresseuse. C''est la main d''œuvre ; les mèches se facturent à part, au prix de la Maison.',
  'durationMin', 240))
on conflict (id) do nothing;

insert into public.catalog_products (id, branch_id, data)
values ('pr-meches-fulani-braids', null, jsonb_build_object(
  'id', 'pr-meches-fulani-braids',
  'name', 'Mèches · Fulani Braids',
  'order', 17,
  'stock', 0,
  'priceXof', 0,
  'categoryId', 'meches'))
on conflict (id) do nothing;

select s.id, s.data->>'name' as nom, s.data->>'priceXof' as prix from public.catalog_services s where s.id = 'sv-fulani-braids-kids'
union all
select p.id, p.data->>'name', p.data->>'priceXof' from public.catalog_products p where p.id = 'pr-meches-fulani-braids';
