-- ═══════════════════════════════════════════════════════════════════
-- ⚠ REMPLACÉ PAR 0023_repli_longueurs_catalogue.sql — 5 août 2026
--
-- Ce script ne traitait que Les Soins. Le motif des longueurs traverse tout
-- le catalogue (KLƆKLƆ™, YÈKPÈ™ Couleur, GBÌGBÌ™, les Vanilles, le Prélude) :
-- le 0023 fait la même chose pour toutes les familles, lit le barème sur les
-- variantes au lieu de le faire saisir, et respecte les prix déjà écrits à la
-- main. NE PAS EXÉCUTER CELUI-CI. Conservé pour l'historique.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 0022 — Un seul soin par geste : les variantes de longueur se replient
--        (à coller dans Supabase → SQL Editor). EN DEUX TEMPS.
--
-- Chaque soin existait en trois prestations — Court, Mi-Long, Long — soit
-- dix-huit lignes pour trois gestes. Une prestation porte désormais ses trois
-- prix (`prixParLongueur`) et ses trois durées : une seule suffit.
--
-- ── CE QUI COMMANDE TOUT : LE PRIX D'ORIGINE FAIT FOI ────────────
-- Un rendez-vous sans prix figé se relit AU CATALOGUE. Le transférer le ferait
-- donc relire à travers les prix par longueur de la survivante — et si ces
-- prix ne sont pas exactement ceux qu'il a portés, le chiffre d'affaires de
-- mai et juin bougerait sans que rien ne le dise.
--
-- CHAQUE rendez-vous repris voit donc son total FIGÉ d'abord, à la valeur
-- qu'il porte aujourd'hui, avant que quoi que ce soit ne le touche. C'est
-- rigoureusement neutre — c'est déjà le montant que Le Trône lui calcule — et
-- cela le rend définitivement sourd au catalogue. Le transfert ne peut alors
-- plus déplacer un franc, que les prix par longueur soient justes, faux ou
-- provisoires.
--
-- La longueur reste posée sur chaque rituel : elle dit ce qui a été travaillé,
-- elle ne commande plus le montant. Et les prix par longueur ne concernent
-- plus que les réservations À VENIR — celles qu'on corrigera au Catalogue.
--
-- Pour qu'un rituel à venir reprenne le tarif du jour une fois les vrais prix
-- posés : l'ouvrir au Carnet et cocher « recalculer au tarif du jour ».
--
-- ── LA CARTOGRAPHIE SE DÉDUIT, ELLE NE S'ÉCRIT PAS ───────────────
-- Aucun identifiant n'est écrit en dur. Pour chaque soin :
--   · la SURVIVANTE est celle qui porte déjà des prix par longueur ;
--   · les VARIANTES sont ses sœurs de même nom, suffixe de longueur en moins ;
--   · la longueur d'une variante se lit dans son suffixe.
-- Si un nom ne suit pas la forme « … · Court / Mi-Long / Long ou haute densité »,
-- il n'entre dans aucune correspondance — l'étape 1 le montre, et rien ne se
-- fait à l'aveugle.
--
-- ── LES RITUELS A DEUX LONGUEURS ─────────────────────────────────
-- (leur cas se resout de lui-meme depuis que TOUS les totaux sont figes)
-- Trois rendez-vous combinent une purification Court et une hydratation
-- Mi-Long. Une tete n'a pourtant qu'une longueur ce jour-la : ce ne sont pas
-- deux longueurs, c'est une reservation qui a pique deux variantes
-- incoherentes dans l'ancien catalogue.
--
-- Sous une longueur unique, l'un des deux gestes change forcement de prix —
-- 20 000 + 22 000 devient 20 000 + 15 000. On FIGE donc leur total AVANT de
-- les transferer : la longueur redevient descriptive, et plus aucun choix ne
-- peut deplacer un franc. La longueur posee est celle du geste DOMINANT (la
-- variante la plus chere du rituel) ; elle se corrige ensuite au Carnet d'un
-- clic, sans que le montant bouge, puisqu'il est fige.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU — ne modifie RIEN. À lire avant l'étape 2. ───
with soin as (
  select s.id,
         s.data ->> 'name'                                  as nom,
         (s.data ->> 'priceXof')::numeric                    as prix,
         regexp_replace(s.data ->> 'name',
           ' · (Court|Mi-Long|Long ou haute densité)$', '')  as famille,
         case
           when s.data ->> 'name' like '% · Court'                  then 'court'
           when s.data ->> 'name' like '% · Mi-Long'                then 'mi-long'
           when s.data ->> 'name' like '% · Long ou haute densité'  then 'long'
         end                                                 as longueur,
         coalesce(jsonb_typeof(s.data -> 'prixParLongueur') = 'object', false)
           and (select count(*) from jsonb_object_keys(coalesce(s.data -> 'prixParLongueur', '{}'::jsonb))) > 0
                                                             as porte_les_prix
  from public.catalog_services s
  where s.data ->> 'categoryId' = 'cat-soins'
),
survivante as (
  select distinct on (famille) famille, id, nom from soin where porte_les_prix order by famille, id
)
select k.famille,
       k.nom,
       k.longueur,
       k.prix,
       case when k.porte_les_prix then '◆ SURVIVANTE'
            when v.id is null     then '? aucune survivante pour cette famille'
            when k.longueur is null then '? suffixe de longueur illisible — laissée en place'
            else 'transférée vers ' || v.nom end             as sort,
       (select count(*) from public.appointments a
          where a.data -> 'serviceIds' ? k.id)               as rendez_vous,
       (select count(*) from public.appointments a
          where a.data -> 'serviceIds' ? k.id
            and a.data ->> 'priceXof' is null)               as dont_sans_prix_fige
from soin k
left join survivante v on v.famille = k.famille
order by k.famille, k.longueur nulls first;

-- CONTRÔLE · les rendez-vous qui combinent DEUX longueurs différentes.
-- Trois attendus. Chacun verra son total FIGÉ avant transfert : la longueur
-- posée devient descriptive et se corrige au Carnet sans déplacer un franc.
with soin as (
  select s.id,
         case
           when s.data ->> 'name' like '% · Court'                  then 'court'
           when s.data ->> 'name' like '% · Mi-Long'                then 'mi-long'
           when s.data ->> 'name' like '% · Long ou haute densité'  then 'long'
         end as longueur
  from public.catalog_services s
  where s.data ->> 'categoryId' = 'cat-soins'
)
select a.id, a.data ->> 'date' as date, a.data ->> 'clientName' as cliente,
       array_agg(distinct k.longueur) as longueurs_melangees
from public.appointments a
join jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) e(v) on true
join soin k on k.id = e.v and k.longueur is not null
group by a.id, a.data
having count(distinct k.longueur) > 1;


-- ══════════════════════════════════════════════════════════════════
-- ── ÉTAPE 2 · LE REPLI. Décommenter et exécuter d'un bloc. ───────
--
-- Ferme d'abord tous les onglets du Trône.
--
-- Une seule transaction. Les rendez-vous touchés sont sauvegardés ENTIERS
-- avant modification : le rollback les rend tels qu'ils étaient.
-- ══════════════════════════════════════════════════════════════════

-- begin;
--
-- create table if not exists public.menage_0022_services
--   (like public.catalog_services including all);
-- create table if not exists public.menage_0022_appointments
--   (like public.appointments including all);
-- -- RLS sans politique : une table du schéma `public` est servie par l'API dès
-- -- sa création. Ces sauvegardes portent des noms de clientes.
-- alter table public.menage_0022_services     enable row level security;
-- alter table public.menage_0022_appointments enable row level security;
--
-- create temporary table corresp on commit drop as
-- with soin as (
--   select s.id, s.data ->> 'name' as nom,
--          regexp_replace(s.data ->> 'name',
--            ' · (Court|Mi-Long|Long ou haute densité)$', '') as famille,
--          case
--            when s.data ->> 'name' like '% · Court'                  then 'court'
--            when s.data ->> 'name' like '% · Mi-Long'                then 'mi-long'
--            when s.data ->> 'name' like '% · Long ou haute densité'  then 'long'
--          end as longueur,
--          coalesce(jsonb_typeof(s.data -> 'prixParLongueur') = 'object', false)
--            and (select count(*) from jsonb_object_keys(coalesce(s.data -> 'prixParLongueur', '{}'::jsonb))) > 0
--            as porte_les_prix
--   from public.catalog_services s
--   where s.data ->> 'categoryId' = 'cat-soins'
-- ),
-- survivante as (
--   select distinct on (famille) famille, id from soin where porte_les_prix order by famille, id
-- )
-- select k.id as ancien, v.id as nouveau, k.longueur
-- from soin k
-- join survivante v on v.famille = k.famille
-- where not k.porte_les_prix and k.longueur is not null and v.id <> k.id;
--
-- -- ① Les rendez-vous : sauvegarde entière, puis transfert AVEC la longueur.
-- create temporary table touche on commit drop as
-- select a.id,
--        (select jsonb_agg(to_jsonb(coalesce(c.nouveau, e.v)) order by e.ord)
--           from jsonb_array_elements_text(a.data -> 'serviceIds') with ordinality e(v, ord)
--           left join corresp c on c.ancien = e.v)                       as nouveaux,
--        -- LA LONGUEUR DU GESTE DOMINANT : la variante la plus chere du rituel.
--        -- Sur un rituel a une seule longueur, c'est evidemment celle-la.
--        (select c.longueur
--           from jsonb_array_elements_text(a.data -> 'serviceIds') e(v)
--           join corresp c on c.ancien = e.v
--           join public.catalog_services s on s.id = e.v
--           order by (s.data ->> 'priceXof')::numeric desc, c.longueur
--           limit 1)                                                     as longueur,
--        (select count(distinct c.longueur)
--           from jsonb_array_elements_text(a.data -> 'serviceIds') e(v)
--           join corresp c on c.ancien = e.v)                            as nb_longueurs
-- from public.appointments a
-- where exists (select 1 from jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) e(v)
--                 join corresp c on c.ancien = e.v);
--
-- insert into public.menage_0022_appointments
-- select * from public.appointments where id in (select id from touche)
-- on conflict (id) do nothing;
--
-- -- ⓪ LE PRIX D'ORIGINE EST FIGE, sur TOUS les rituels repris.
-- --    Lu sur les variantes d'origine : c'est exactement le montant que Le
-- --    Trone leur calcule aujourd'hui, donc l'operation ne deplace rien. Une
-- --    fois fige, ni le transfert ni un prix par longueur errone ne peuvent
-- --    plus toucher ce rituel. Les rituels deja figes ne sont pas retouches —
-- --    leur prix d'origine est plus ancien et plus vrai que tout calcul.
-- update public.appointments a
-- set data = jsonb_set(a.data, '{priceXof}', to_jsonb((
--       select coalesce(sum((s.data ->> 'priceXof')::numeric), 0)
--       from jsonb_array_elements_text(a.data -> 'serviceIds') sid
--       join public.catalog_services s on s.id = sid)))
-- from touche t
-- where t.id = a.id and a.data ->> 'priceXof' is null;
--
-- update public.appointments a
-- set data = jsonb_set(jsonb_set(a.data, '{serviceIds}', t.nouveaux),
--                      '{longueur}', to_jsonb(t.longueur))
-- from touche t
-- where t.id = a.id;
--
-- -- ② La composition des forfaits suit — une ligne qui désigne une variante
-- --    désignerait sinon une prestation effacée, et la séance disparaîtrait
-- --    du forfait en silence.
-- update public.catalog_services f
-- set data = jsonb_set(f.data, '{includes}', (
--       select jsonb_agg(case when c.nouveau is null then inc
--                             else jsonb_set(inc, '{serviceId}', to_jsonb(c.nouveau)) end)
--       from jsonb_array_elements(f.data -> 'includes') inc
--       left join corresp c on c.ancien = inc ->> 'serviceId'))
-- where exists (select 1 from jsonb_array_elements(coalesce(f.data -> 'includes', '[]'::jsonb)) inc
--                 join corresp c on c.ancien = inc ->> 'serviceId');
--
-- -- ③ Les formules d'abonnement, de même.
-- update public.plans p
-- set data = jsonb_set(p.data, '{included}', (
--       select jsonb_agg(case when c.nouveau is null then inc
--                             else jsonb_set(inc, '{serviceId}', to_jsonb(c.nouveau)) end)
--       from jsonb_array_elements(p.data -> 'included') inc
--       left join corresp c on c.ancien = inc ->> 'serviceId'))
-- where exists (select 1 from jsonb_array_elements(coalesce(p.data -> 'included', '[]'::jsonb)) inc
--                 join corresp c on c.ancien = inc ->> 'serviceId');
--
-- -- ④ LE PRIX DE REPLI de la survivante. Il est à 0 F : c'est lui qui sort
-- --    partout où la longueur n'est pas connue — la Vitrine, Ma Couronne, la
-- --    valorisation d'un forfait. On y met le prix du Court.
-- update public.catalog_services s
-- set data = jsonb_set(s.data, '{priceXof}', s.data -> 'prixParLongueur' -> 'court')
-- where s.data ->> 'categoryId' = 'cat-soins'
--   and (s.data -> 'prixParLongueur' -> 'court') is not null
--   and coalesce((s.data ->> 'priceXof')::numeric, 0) = 0;
--
-- -- ⑤ La survivante perd son suffixe : elle ne couvre plus une longueur, elle
-- --    les couvre toutes.
-- update public.catalog_services s
-- set data = jsonb_set(s.data, '{name}',
--       to_jsonb(regexp_replace(s.data ->> 'name',
--         ' · (Court|Mi-Long|Long ou haute densité)$', '')))
-- where s.data ->> 'categoryId' = 'cat-soins'
--   and jsonb_typeof(s.data -> 'prixParLongueur') = 'object'
--   and s.data ->> 'name' ~ ' · (Court|Mi-Long|Long ou haute densité)$';
--
-- -- ⑥ Les variantes partent — mais SEULEMENT celles que plus rien ne retient.
-- --    Le filtre reste : si quoi que ce soit pointe encore vers l'une d'elles,
-- --    elle survit plutot que de laisser une reference dans le vide.
-- insert into public.menage_0022_services
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
-- delete from public.catalog_services where id in (select id from public.menage_0022_services);
--
-- -- ⑦ TATIANA MAMA, 18 juin — la seule correction nommee de ce script.
-- --    Son rituel etait reserve sur la variante Mi-Long, mais c'est un LONG
-- --    qui lui est facture : 28 000 F, le prix du Long. Le transfert lui aurait
-- --    pose « mi-long » puisqu'il lit le nom de la variante d'origine. Son prix
-- --    etant fige, la longueur ne fait que decrire — la corriger ne deplace
-- --    rien, elle rend seulement le rituel conforme a ce qu'il a ete.
-- update public.appointments a
-- set data = jsonb_set(a.data, '{longueur}', '"long"')
-- where a.data ->> 'date' = '2026-06-18'
--   and a.data ->> 'clientName' = 'Tatiana M.'
--   and a.data ->> 'longueur' = 'mi-long';
--
-- commit;


-- ── CONTRÔLES après l'étape 2 ─────────────────────────────────────
--
-- A. LE CHIFFRE N'A PAS BOUGÉ. C'est le seul contrôle qui compte : pour chaque
--    rendez-vous repris, le total relu doit égaler celui d'avant. Zéro ligne.
-- select b.id, b.data ->> 'date' as date,
--        (select coalesce(sum((s.data ->> 'priceXof')::numeric), 0)
--           from jsonb_array_elements_text(b.data -> 'serviceIds') sid
--           join public.menage_0022_services s on s.id = sid) as avant_variantes,
--        (select coalesce(sum(
--                  coalesce((s.data -> 'prixParLongueur' ->> (a.data ->> 'longueur'))::numeric,
--                           (s.data ->> 'priceXof')::numeric)), 0)
--           from jsonb_array_elements_text(a.data -> 'serviceIds') sid
--           join public.catalog_services s on s.id = sid)      as apres
-- from public.menage_0022_appointments b
-- join public.appointments a on a.id = b.id
-- where b.data ->> 'priceXof' is null
--   and (select coalesce(sum((s.data ->> 'priceXof')::numeric), 0)
--          from jsonb_array_elements_text(b.data -> 'serviceIds') sid
--          join public.menage_0022_services s on s.id = sid)
--    <> (select coalesce(sum(
--                 coalesce((s.data -> 'prixParLongueur' ->> (a.data ->> 'longueur'))::numeric,
--                          (s.data ->> 'priceXof')::numeric)), 0)
--          from jsonb_array_elements_text(a.data -> 'serviceIds') sid
--          join public.catalog_services s on s.id = sid);
--
-- B. Aucun rendez-vous ne pointe vers une prestation disparue. Zéro ligne.
-- select a.id, sid as prestation_inconnue
-- from public.appointments a,
--      jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
-- left join public.catalog_services s on s.id = sid
-- where s.id is null;
--
-- C. Ce qui reste dans Les Soins, et ce qui a été repris.
-- select s.data ->> 'name' as prestation,
--        (s.data ->> 'priceXof')::numeric as repli,
--        s.data -> 'prixParLongueur'      as par_longueur,
--        (select count(*) from public.appointments a where a.data -> 'serviceIds' ? s.id) as rendez_vous
-- from public.catalog_services s
-- where s.data ->> 'categoryId' = 'cat-soins'
-- order by 1;
--
-- D. Puis dans Le Trône, après rechargement (Ctrl+Maj+R) :
--      Synthèse → Chiffre par maison, JUILLET : les trois totaux INCHANGÉS.
--    Si un montant bouge, le rollback est plus bas.


-- ── ROLLBACK — remet tout en place ───────────────────────────────
--
-- begin;
-- -- Les rendez-vous repris redeviennent ce qu'ils étaient, à la lettre.
-- update public.appointments a set data = b.data
-- from public.menage_0022_appointments b where b.id = a.id;
-- insert into public.catalog_services select * from public.menage_0022_services
-- on conflict (id) do nothing;
-- commit;
-- -- NOTE : le rollback ne défait ni le renommage de la survivante ni son prix
-- -- de repli — deux gestes sans conséquence sur les chiffres, à refaire à la
-- -- main au Catalogue si besoin.


-- ── QUAND TOUT EST VÉRIFIÉ, les sauvegardes peuvent partir ───────
-- drop table public.menage_0022_services;
-- drop table public.menage_0022_appointments;
