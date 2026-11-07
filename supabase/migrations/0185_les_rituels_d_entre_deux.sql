-- 0185 · LES RITUELS D'ENTRE-DEUX · 7 novembre 2026
--
-- « Les venues, c'est trois : les deux autres seront reclassés » (Y.), puis
-- « un nom avec rituel ». La catégorie « La venue » (cat-venue) garde ses
-- trois services, GBÈJÍ™ Essentiel, GBÈJÍ™ Signature et Le Moment. GBÈJÍ™
-- Express (lavage et retouche) et GBÈJÍ™ Fidélité (lavage et reprise) ne
-- jouent pas le même rôle : ils passent dans une catégorie neuve, sous « La
-- Vie » (atl-ii-gbeji), « Les rituels d'entre-deux ».
--
-- Deux lignes de services déplacées (leur identifiant, leur prix, leur
-- composition ne changent pas : seul `categoryId` change), une catégorie née.
-- Rejouable : la catégorie ne se réécrit pas, le déplacement ne change rien
-- une seconde fois. Réversible : remettre `categoryId` à « cat-venue ».

insert into public.catalog_categories (id, branch_id, data, updated_at)
select 'cat-entre-deux', c.branch_id,
       jsonb_build_object(
         'id', 'cat-entre-deux',
         'fon', 'L’entre-deux',
         'code', 'ATL·II·ENT',
         'label', 'Les rituels d’entre-deux',
         'order', 2,
         'maison', 'atelier',
         'enabled', true,
         'parentId', 'atl-ii-gbeji'
       ),
       now()
  from public.catalog_categories c
 where c.id = 'cat-venue'
on conflict (id) do nothing;

update public.catalog_services
   set data = data || jsonb_build_object('categoryId', 'cat-entre-deux'),
       updated_at = now()
 where id in ('sv-venue-gbeji-exp', 'sv-forfait-gbeji-fidelite')
   and coalesce(data->>'categoryId', '') <> 'cat-entre-deux';
