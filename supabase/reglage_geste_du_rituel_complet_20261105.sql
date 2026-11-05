-- Le geste du rituel complet : 5 novembre 2026.
-- « Les clientes comme V. A. auront des remises automatiques quand elles
-- font tout le service : le shampoing et la reprise » (Yéman). Au sélecteur :
-- celles que je coche ; 5 000 F, toujours ; avec SÍNSIN™ Essentiel et
-- Signature.
--
-- Ce qui change, et rien d'autre : le shampoing KLƆKLƆ™ Essentiel
-- (sv-plt-05-ess-c) reçoit un troisième geste de la Maison, en francs et
-- réservé aux fiches cochées (`Client.remiseDuRituelComplet`) :
--   { serviceIds: [SÍNSIN™ Essentiel, SÍNSIN™ Signature], xof: 5000, fichesCochees: true }.
-- Ses deux gestes d'avant (50 % avec la coloration, 100 % avec le forfait
-- GBÈJÍ™ Fidélité aux calibres fins) restent tels quels ; le plus généreux
-- gagne, comme toujours.
--
-- REJOUABLE : le geste ne s'ajoute que s'il n'y est pas déjà ; la copie de
-- repli ne se refait pas et reçoit RLS aussitôt (règle des tables repli_).

create table if not exists public.repli_geste_du_rituel_complet_20261105 as
  select id, data, updated_at
    from public.catalog_services
   where id = 'sv-plt-05-ess-c';
alter table public.repli_geste_du_rituel_complet_20261105 enable row level security;

update public.catalog_services
   set data = jsonb_set(
                data, '{offertAvec}',
                data->'offertAvec' || jsonb_build_array(jsonb_build_object(
                  'serviceIds', jsonb_build_array('sv-atl-ii-e', 'sv-atl-ii-l'),
                  'xof', 5000,
                  'fichesCochees', true))),
       updated_at = now()
 where id = 'sv-plt-05-ess-c'
   and jsonb_typeof(data->'offertAvec') = 'array'
   and not exists (
     select 1 from jsonb_array_elements(data->'offertAvec') g
      where coalesce((g->>'fichesCochees')::boolean, false));

-- Ce qui se lit après.
select id, data->>'name' as nom, jsonb_array_length(data->'offertAvec') as gestes, data->'offertAvec' as offert_avec
  from public.catalog_services
 where id = 'sv-plt-05-ess-c';
