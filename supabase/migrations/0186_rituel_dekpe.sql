-- 0186 · RITUEL DEKPE · 7 novembre 2026
--
-- « Non, je préfère rituel dekpe », « dekpe comme le slogan », « jamais le D
-- avec la barre » (Y.) : le mot s'écrit avec un D ordinaire, jamais Ɖ ni ɖ. La
-- catégorie née en 0185 (Express et Fidélité, hors de la venue) s'appelle
-- « Rituel Dekpe ». « Endekpe Fidélité, et Dekpe Express » : les deux
-- services prennent ces noms à la place de « GBÈJÍ™ » ; le reste de leur nom
-- (« 20 % · lavage… », « lavage et retouche ») ne change pas.
--
-- Rejouable (il a déjà passé une première fois avec le D barré, corrigé ici).
-- Réversible : remettre « GBÈJÍ™ » devant les deux noms.

update public.catalog_categories
   set data = data || jsonb_build_object('fon', 'Dekpe', 'label', 'Rituel Dekpe'),
       updated_at = now()
 where id = 'cat-entre-deux';

update public.catalog_services
   set data = jsonb_set(data, '{name}', to_jsonb(regexp_replace(data->>'name', '^GBÈJÍ™ ', 'Endekpe ')) ),
       updated_at = now()
 where id = 'sv-forfait-gbeji-fidelite' and data->>'name' like 'GBÈJÍ™ %';

update public.catalog_services
   set data = jsonb_set(data, '{name}', to_jsonb(regexp_replace(data->>'name', '^GBÈJÍ™ ', 'Dekpe '))),
       updated_at = now()
 where id = 'sv-venue-gbeji-exp' and data->>'name' like 'GBÈJÍ™ %';
