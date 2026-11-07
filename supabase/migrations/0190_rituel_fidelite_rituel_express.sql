-- 0190 · RITUEL FIDÉLITÉ ET RITUEL EXPRESS · 7 novembre 2026
--
-- « Change plutôt Rituel Fidélité et Rituel Express » (Y.) : les deux
-- services prennent « Rituel » devant leur nom, à la place du mot fon
-- (0187 à 0189). Le reste de chaque nom (« 20 % · lavage… », « lavage et
-- retouche ») ne change pas. La catégorie garde son nom.
-- Rejouable, réversible (remettre le mot fon devant).

update public.catalog_services
   set data = jsonb_set(data, '{name}', to_jsonb(regexp_replace(data->>'name', '^[^ ]+ (Fidélité|Express)', 'Rituel \1'))),
       updated_at = now()
 where id in ('sv-forfait-gbeji-fidelite', 'sv-venue-gbeji-exp')
   and data->>'name' !~ '^Rituel ';
