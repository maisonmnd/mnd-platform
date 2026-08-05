-- ═══════════════════════════════════════════════════════════════════
-- 0023 — LE REPLI DES LONGUEURS, catalogue entier
--        (à coller dans Supabase → SQL Editor). EN DEUX TEMPS.
--
-- REMPLACE le 0022, qui ne traitait que Les Soins. Celui-ci fait la même
-- chose pour toutes les familles, et respecte les prix déjà saisis à la main.
--
-- ── CE QU'IL FAIT ────────────────────────────────────────────────
-- Partout dans le catalogue, une même prestation existe en trois exemplaires :
-- « … · Court », « … · Mi-Long », « … · Long ou haute densité ». KLƆKLƆ™,
-- YÈKPÈ™ Couleur, GBÌGBÌ™, les Vanilles, le Prélude — le motif traverse tout.
--
-- Chaque famille se replie sur UNE prestation qui porte ses trois prix et ses
-- trois durées. LE BARÈME NE SE SAISIT PAS : il se lit sur les variantes
-- elles-mêmes. Chacune donne son prix et sa durée sous sa propre longueur.
--
-- Ce qui a été écrit à la main l'emporte, et se récolte sur TOUTE la famille :
-- les prix corrigés de DÀNDÀN sont posés sur sa variante Court alors que la
-- survivante est la Mi-Long — ne lire que la survivante aurait effacé la
-- correction et rétabli les prix de l'ancien catalogue.
--
-- ── POURQUOI C'EST NEUTRE ────────────────────────────────────────
-- Un rendez-vous sans prix figé se relit au catalogue ; avec un prix figé, il
-- ne le lit plus. Le relevé du 5 août l'a montré : TOUS les rituels concernés
-- portent leur prix d'origine. Par précaution, le script fige quand même ceux
-- qui n'en auraient pas, avant d'y toucher. Le transfert ne peut alors pas
-- déplacer un franc.
--
-- ── LA LIMITE, DITE FRANCHEMENT ──────────────────────────────────
-- Un rendez-vous ne porte QU'UNE longueur — c'est la tête de la cliente ce
-- jour-là. Or l'ancien catalogue mêlait les étiquettes : un « KLƆKLƆ Court »
-- voisine presque toujours avec un « GBÌGBÌ Mi-Long » dans la même visite.
-- Ces étiquettes ne décrivaient pas la tête, elles nommaient la seule variante
-- que la Maison vendait de chaque geste.
--
-- Le script pose donc la longueur MAJORITAIRE du rituel. Sur l'histoire, c'est
-- une approximation — assumée, sans conséquence, puisque le montant est figé
-- et que la longueur n'y fait plus que décrire. Sur les rituels à venir, elle
-- se choisit à la réservation et devient exacte.
--
-- ── CE QUI N'EST PAS TOUCHÉ ──────────────────────────────────────
--   · les familles qui n'ont QU'UNE variante — replier ne gagne rien, et le
--     suffixe peut vouloir dire autre chose (« Tresses Jumbo · Épaules ») ;
--   · les suffixes hors des trois longueurs connues ;
--   · les doublons dans un rituel : une prestation citée deux fois le reste.
--     Les dédoublonner changerait le total.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU — ne modifie RIEN. À lire avant l'étape 2. ───
with variante as (
  select s.id,
         s.data ->> 'name'                                       as nom,
         s.data ->> 'categoryId'                                 as cat,
         (s.data ->> 'priceXof')::numeric                        as prix,
         (s.data ->> 'durationMin')::numeric                     as duree,
         regexp_replace(s.data ->> 'name',
           ' · (Court|Mi-Long|Long ou haute densité)$', '')       as famille,
         case
           when s.data ->> 'name' like '% · Court'                 then 'court'
           when s.data ->> 'name' like '% · Mi-Long'               then 'mi-long'
           when s.data ->> 'name' like '% · Long ou haute densité' then 'long'
         end                                                     as longueur
  from public.catalog_services s
  where s.data ->> 'name' ~ ' · (Court|Mi-Long|Long ou haute densité)$'
),
famille_pliable as (
  select famille from variante group by famille having count(*) > 1
),
survivante as (
  select distinct on (v.famille) v.famille, v.id, v.nom
  from variante v
  join famille_pliable f on f.famille = v.famille
  order by v.famille,
           (select count(*) from public.appointments a where a.data -> 'serviceIds' ? v.id) desc,
           v.id
)
select v.famille,
       v.nom,
       v.longueur,
       v.prix,
       v.duree,
       case when s.id = v.id then '◆ SURVIVANTE' else 'repliée sur ' || s.nom end as sort,
       (select count(*) from public.appointments a
          where a.data -> 'serviceIds' ? v.id)                   as rendez_vous,
       (select count(*) from public.appointments a
          where a.data -> 'serviceIds' ? v.id
            and a.data ->> 'priceXof' is null)                   as dont_sans_prix_fige
from variante v
join survivante s on s.famille = v.famille
order by v.famille, v.prix;

-- Ce qui reste HORS du repli : familles à une seule variante. Elles gardent
-- leur suffixe. Rien à faire, sauf si l'une d'elles te surprend.
with variante as (
  select regexp_replace(s.data ->> 'name',
           ' · (Court|Mi-Long|Long ou haute densité)$', '') as famille,
         s.data ->> 'name' as nom
  from public.catalog_services s
  where s.data ->> 'name' ~ ' · (Court|Mi-Long|Long ou haute densité)$'
)
select famille, min(nom) as seule_variante
from variante group by famille having count(*) = 1 order by 1;


-- ══════════════════════════════════════════════════════════════════
-- ── ÉTAPE 2 · LE REPLI. Décommenter et exécuter d'un bloc. ───────
-- Ferme d'abord tous les onglets du Trône. Une seule transaction.
-- ══════════════════════════════════════════════════════════════════

-- begin;
--
-- create table if not exists public.repli_0023_services
--   (like public.catalog_services including all);
-- create table if not exists public.repli_0023_appointments
--   (like public.appointments including all);
-- -- RLS sans politique : ces sauvegardes portent des noms de clientes, et une
-- -- table du schéma `public` est servie par l'API dès sa création.
-- alter table public.repli_0023_services     enable row level security;
-- alter table public.repli_0023_appointments enable row level security;
--
-- create temporary table variante on commit drop as
-- select s.id,
--        s.data ->> 'name'                                       as nom,
--        (s.data ->> 'priceXof')::numeric                        as prix,
--        (s.data ->> 'durationMin')::numeric                     as duree,
--        regexp_replace(s.data ->> 'name',
--          ' · (Court|Mi-Long|Long ou haute densité)$', '')       as famille,
--        case
--          when s.data ->> 'name' like '% · Court'                 then 'court'
--          when s.data ->> 'name' like '% · Mi-Long'               then 'mi-long'
--          when s.data ->> 'name' like '% · Long ou haute densité' then 'long'
--        end                                                     as longueur
-- from public.catalog_services s
-- where s.data ->> 'name' ~ ' · (Court|Mi-Long|Long ou haute densité)$';
--
-- create temporary table survivante on commit drop as
-- select distinct on (v.famille) v.famille, v.id
-- from variante v
-- where v.famille in (select famille from variante group by famille having count(*) > 1)
-- order by v.famille,
--          (select count(*) from public.appointments a where a.data -> 'serviceIds' ? v.id) desc,
--          v.id;
--
-- create temporary table corresp on commit drop as
-- select v.id as ancien, s.id as nouveau, v.longueur
-- from variante v join survivante s on s.famille = v.famille
-- where v.id <> s.id;
--
-- -- ① LE BARÈME SE LIT SUR LES VARIANTES. Chacune donne son prix et sa durée
-- --    sous sa propre longueur — y compris la survivante, qui apporte la sienne.
-- create temporary table bareme on commit drop as
-- select v.famille,
--        jsonb_object_agg(v.longueur, v.prix)  as prix_map,
--        jsonb_object_agg(v.longueur, v.duree) as duree_map
-- from (select distinct on (famille, longueur) famille, longueur, prix, duree
--         from variante order by famille, longueur, prix desc) v
-- where v.famille in (select famille from survivante)
-- group by v.famille;
--
-- -- ①b CE QUI A ÉTÉ SAISI À LA MAIN L'EMPORTE — et se récolte sur TOUTE la
-- --     famille, pas sur la seule survivante. Les prix corrigés de DÀNDÀN sont
-- --     posés sur sa variante Court, alors que la survivante est la Mi-Long :
-- --     ne lire que la survivante aurait effacé la correction et rétabli les
-- --     prix de l'ancien catalogue. Ce qui est mesuré cède au su.
-- create temporary table manuel on commit drop as
-- select v.famille,
--        coalesce(jsonb_object_agg(e.key, e.value)
--                 filter (where e.champ = 'prix'),  '{}'::jsonb) as prix_manuel,
--        coalesce(jsonb_object_agg(e.key, e.value)
--                 filter (where e.champ = 'duree'), '{}'::jsonb) as duree_manuel
-- from variante v
-- join public.catalog_services s on s.id = v.id
-- cross join lateral (
--   select 'prix' as champ, key, value from jsonb_each(coalesce(s.data -> 'prixParLongueur', '{}'::jsonb))
--   union all
--   select 'duree', key, value from jsonb_each(coalesce(s.data -> 'dureeParLongueur', '{}'::jsonb))
-- ) e
-- group by v.famille;
--
-- -- ② Sauvegarde des rendez-vous touchés, ENTIERS.
-- create temporary table touche on commit drop as
-- select a.id,
--        (select jsonb_agg(to_jsonb(coalesce(c.nouveau, e.v)) order by e.ord)
--           from jsonb_array_elements_text(a.data -> 'serviceIds') with ordinality e(v, ord)
--           left join corresp c on c.ancien = e.v)                as nouveaux,
--        -- LA LONGUEUR MAJORITAIRE du rituel : celle que portent le plus de ses
--        -- lignes repliées ; à égalité, la plus chère. Approximation assumée
--        -- sur l'histoire, exacte sur ce qui se réservera désormais.
--        (select c.longueur
--           from jsonb_array_elements_text(a.data -> 'serviceIds') e(v)
--           join corresp c on c.ancien = e.v
--           join public.catalog_services s on s.id = e.v
--           group by c.longueur
--           order by count(*) desc, sum((s.data ->> 'priceXof')::numeric) desc, c.longueur
--           limit 1)                                              as longueur
-- from public.appointments a
-- where exists (select 1 from jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) e(v)
--                 join corresp c on c.ancien = e.v);
--
-- insert into public.repli_0023_appointments
-- select * from public.appointments where id in (select id from touche)
-- on conflict (id) do nothing;
--
-- -- ③ LE PRIX D'ORIGINE FAIT FOI. On fige avant de toucher quoi que ce soit :
-- --    un rituel figé ne lit plus le catalogue, donc rien de ce qui suit ne
-- --    peut déplacer son montant. Les rituels déjà figés ne sont pas retouchés.
-- update public.appointments a
-- set data = jsonb_set(a.data, '{priceXof}', to_jsonb((
--       select coalesce(sum((s.data ->> 'priceXof')::numeric), 0)
--       from jsonb_array_elements_text(a.data -> 'serviceIds') sid
--       join public.catalog_services s on s.id = sid)))
-- from touche t
-- where t.id = a.id and a.data ->> 'priceXof' is null;
--
-- -- ④ Le transfert, avec la longueur.
-- update public.appointments a
-- set data = jsonb_set(jsonb_set(a.data, '{serviceIds}', t.nouveaux),
--                      '{longueur}', to_jsonb(t.longueur))
-- from touche t
-- where t.id = a.id and t.longueur is not null;
--
-- -- ⑤ La composition des forfaits et les formules d'abonnement suivent — une
-- --    ligne qui désigne une variante effacée perdrait sa séance en silence.
-- update public.catalog_services f
-- set data = jsonb_set(f.data, '{includes}', (
--       select jsonb_agg(case when c.nouveau is null then inc
--                             else jsonb_set(inc, '{serviceId}', to_jsonb(c.nouveau)) end)
--       from jsonb_array_elements(f.data -> 'includes') inc
--       left join corresp c on c.ancien = inc ->> 'serviceId'))
-- where exists (select 1 from jsonb_array_elements(coalesce(f.data -> 'includes', '[]'::jsonb)) inc
--                 join corresp c on c.ancien = inc ->> 'serviceId');
--
-- update public.plans p
-- set data = jsonb_set(p.data, '{included}', (
--       select jsonb_agg(case when c.nouveau is null then inc
--                             else jsonb_set(inc, '{serviceId}', to_jsonb(c.nouveau)) end)
--       from jsonb_array_elements(p.data -> 'included') inc
--       left join corresp c on c.ancien = inc ->> 'serviceId'))
-- where exists (select 1 from jsonb_array_elements(coalesce(p.data -> 'included', '[]'::jsonb)) inc
--                 join corresp c on c.ancien = inc ->> 'serviceId');
--
-- -- ⑥ La survivante reçoit le barème, perd son suffixe, et retrouve un prix
-- --    de repli — le plus bas des trois, celui qu'annonce la Vitrine (« dès »).
-- update public.catalog_services s
-- set data = s.data
--          || jsonb_build_object(
--               'prixParLongueur',  b.prix_map  || coalesce(m.prix_manuel,  '{}'::jsonb),
--               'dureeParLongueur', b.duree_map || coalesce(m.duree_manuel, '{}'::jsonb),
--               'name', regexp_replace(s.data ->> 'name',
--                         ' · (Court|Mi-Long|Long ou haute densité)$', ''))
-- from survivante v
-- join bareme b on b.famille = v.famille
-- left join manuel m on m.famille = v.famille
-- where s.id = v.id;
--
-- update public.catalog_services s
-- set data = jsonb_set(s.data, '{priceXof}', to_jsonb((
--       select min(x.value::numeric)
--       from jsonb_each_text(s.data -> 'prixParLongueur') x
--       where x.value::numeric > 0)))
-- where s.id in (select id from survivante)
--   and (select min(x.value::numeric) from jsonb_each_text(s.data -> 'prixParLongueur') x
--          where x.value::numeric > 0) is not null;
--
-- -- ⑦ Les variantes partent — seulement celles que plus rien ne retient.
-- insert into public.repli_0023_services
-- select * from public.catalog_services s
-- where s.id in (select ancien from corresp)
--   and not exists (select 1 from public.appointments a where a.data -> 'serviceIds' ? s.id)
--   and not exists (select 1 from public.catalog_services f,
--                          jsonb_array_elements(coalesce(f.data -> 'includes', '[]'::jsonb)) inc
--                    where inc ->> 'serviceId' = s.id)
--   and not exists (select 1 from public.plans p,
--                          jsonb_array_elements(coalesce(p.data -> 'included', '[]'::jsonb)) inc
--                    where inc ->> 'serviceId' = s.id)
--   and not exists (select 1 from public.documents d
--                    where d.key = 'mnd_offers' and d.data::text like '%' || s.id || '%')
-- on conflict (id) do nothing;
--
-- delete from public.catalog_services where id in (select id from public.repli_0023_services);
--
-- -- ⑧ TATIANA MAMA, 18 juin — la seule correction nommée. Son rituel était
-- --    réservé sur la variante Mi-Long, mais c'est un LONG qui lui est facturé,
-- --    28 000 F. Son prix étant figé, corriger la longueur ne déplace rien.
-- update public.appointments a
-- set data = jsonb_set(a.data, '{longueur}', '"long"')
-- where a.data ->> 'date' = '2026-06-18'
--   and a.data ->> 'clientName' = 'Tatiana Mama';
--
-- commit;


-- ── CONTRÔLES après l'étape 2 ─────────────────────────────────────
--
-- A. LE TOTAL DE CHAQUE RITUEL REPRIS EST INCHANGÉ. Doit rendre ZÉRO ligne.
-- select b.id, b.data ->> 'date' as date,
--        coalesce(nullif(b.data ->> 'priceXof', '')::numeric,
--          (select coalesce(sum((s.data ->> 'priceXof')::numeric), 0)
--             from jsonb_array_elements_text(b.data -> 'serviceIds') sid
--             join (select id, data from public.catalog_services
--                   union all select id, data from public.repli_0023_services) s on s.id = sid)) as avant,
--        (a.data ->> 'priceXof')::numeric as apres
-- from public.repli_0023_appointments b
-- join public.appointments a on a.id = b.id
-- where coalesce(nullif(b.data ->> 'priceXof', '')::numeric,
--         (select coalesce(sum((s.data ->> 'priceXof')::numeric), 0)
--            from jsonb_array_elements_text(b.data -> 'serviceIds') sid
--            join (select id, data from public.catalog_services
--                  union all select id, data from public.repli_0023_services) s on s.id = sid))
--    is distinct from (a.data ->> 'priceXof')::numeric;
--
-- B. Aucun rendez-vous ne pointe vers une prestation disparue. ZÉRO ligne.
-- select a.id, sid as prestation_inconnue
-- from public.appointments a,
--      jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
-- left join public.catalog_services s on s.id = sid
-- where s.id is null;
--
-- C. Le catalogue replié — une ligne par geste, son barème, son repli.
-- select s.data ->> 'name'            as prestation,
--        (s.data ->> 'priceXof')::numeric as repli,
--        s.data -> 'prixParLongueur'  as prix_par_longueur,
--        s.data -> 'dureeParLongueur' as duree_par_longueur
-- from public.catalog_services s
-- where s.data -> 'prixParLongueur' is not null
-- order by 1;
--
-- D. Puis dans Le Trône, après rechargement (Ctrl+Maj+R) :
--      Synthèse → Chiffre par maison : les totaux de CHAQUE mois inchangés.
--    Tous les rituels repris étant figés, aucun montant ne peut avoir bougé.


-- ── ROLLBACK — remet tout en place ───────────────────────────────
--
-- begin;
-- update public.appointments a set data = b.data
-- from public.repli_0023_appointments b where b.id = a.id;
-- insert into public.catalog_services select * from public.repli_0023_services
-- on conflict (id) do nothing;
-- commit;
-- -- NOTE : le rollback rend les rendez-vous et les variantes. Le barème et le
-- -- nom des survivantes restent repliés — sans effet sur les chiffres, et
-- -- réversibles à la main au Catalogue.


-- ── QUAND TOUT EST VÉRIFIÉ ───────────────────────────────────────
-- drop table public.repli_0023_services;
-- drop table public.repli_0023_appointments;
