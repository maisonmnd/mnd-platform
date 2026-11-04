-- ══ LES PLACES LIMITÉES : L'OFFRE, ET LE RITUEL SÓWÀ™ SANS REMISE · 4 novembre 2026 ══
-- La décision de Yéman (maquette « Places limitées », AhFRNqiggFoaiR725iKSQe,
-- « construis ») : −15 % sur les shampoings, lavages et soins ; du mardi au
-- vendredi, jamais le samedi ; seulement un jour vide ; trois places par jour,
-- décomptées ; les jours vides des 14 jours à venir ; une seule remise.
--
-- CE FICHIER FAIT DEUX CHOSES, ET RIEN D'AUTRE :
--   1. il AJOUTE au tableau `mnd_offers` l'offre `of-places-limitees` (code
--      PLACES15), si aucune offre ne porte déjà cet identifiant ou ce code.
--      Ses gestes sont ceux de « Le mercredi de la Maison » (of-mercredi15),
--      les 18 shampoings, lavages et soins du 4 novembre 2026. Jours, places,
--      horizon, pourcentage et allumage sont des RÉGLAGES de l'offre, que la
--      Maison change dans Système › Paramètres ; rien ne les fige ailleurs ;
--   2. il pose `sansRemise: true` sur le Rituel Sówà™ (1740l5ysxj) : « aucune
--      remise », d'aucune sorte, famille comprise.
-- Il n'allume rien d'autre et ne touche pas of-mercredi15, qui reste éteinte
-- (coupe_mercredi15_20261104.sql).
--
-- À PASSER APRÈS la migration 0154 et APRÈS la publication du site, de
-- demande-submit, du Trône et de Ma Couronne : l'offre ne vaut qu'avec la
-- garde en base et les portes qui comptent les places.
--
-- REJOUABLE : les copies de repli ne se refont pas si elles existent, l'offre
-- ne s'ajoute qu'une fois, et le Sówà ne se réécrit que s'il n'est pas déjà
-- marqué. Les tables de repli reçoivent RLS aussitôt (règle des tables repli_).

create table if not exists public.repli_mnd_offers_20261104_places as
  select * from public.documents where key = 'mnd_offers';
alter table public.repli_mnd_offers_20261104_places enable row level security;

create table if not exists public.repli_catalog_services_20261104_sowa as
  select * from public.catalog_services where id = '1740l5ysxj';
alter table public.repli_catalog_services_20261104_sowa enable row level security;

-- 1. L'OFFRE « PLACES LIMITÉES ».
with gestes as (
  select coalesce((
    select e->'serviceIds'
      from public.documents d
     cross join lateral jsonb_array_elements(d.data) e
     where d.key = 'mnd_offers'
       and jsonb_typeof(d.data) = 'array'
       and e->>'id' = 'of-mercredi15'
       and jsonb_typeof(e->'serviceIds') = 'array'
     limit 1
  ), '[]'::jsonb) as ids
),
offre as (
  select jsonb_build_object(
    'id', 'of-places-limitees',
    'branchId', 'br-40r6u6frno',
    'title', 'Places limitées',
    'tag', 'Du mardi au vendredi',
    'deal', '−15 %',
    'sub', '−15 % sur vos shampoings, lavages et soins, un jour encore libre du mardi au vendredi. Places limitées.',
    'audience', 'Tous',
    'days', '["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"]'::jsonb,
    'joursDeLaVenue', '["Mar","Mer","Jeu","Ven"]'::jsonb,
    'heureDebut', '00h',
    'heureFin', '22h',
    'active', true,
    'du', '2026-11-05',
    'code', 'PLACES15',
    'discountPct', 15,
    'serviceIds', gestes.ids,
    'placesParJour', 3,
    'jourVideSeulement', true,
    'horizonJours', 14,
    'vitrine', true,
    'parcours', 'entretien',
    'bouton', 'Voir les jours ouverts',
    'conditions', 'Sur les shampoings, lavages et soins d’un rendez-vous du mardi au vendredi, un jour où personne n’a encore réservé. Places limitées chaque jour : le décompte se lit sur le calendrier, et une place prise est gardée. La remise se pose d’elle-même avec la place, sans code. Une seule remise : hors prix convenus, abonnements, remise famille et autre code. Le total s’arrondit au millier supérieur.'
  ) as o
    from gestes
)
update public.documents d
   set data = coalesce(d.data, '[]'::jsonb) || jsonb_build_array(offre.o),
       updated_at = now()
  from offre
 where d.key = 'mnd_offers'
   and jsonb_typeof(coalesce(d.data, '[]'::jsonb)) = 'array'
   and not exists (
     select 1 from jsonb_array_elements(coalesce(d.data, '[]'::jsonb)) e
      where e->>'id' = 'of-places-limitees'
         or upper(regexp_replace(coalesce(e->>'code', ''), '\s+', '', 'g')) = 'PLACES15'
   );

-- 2. LE RITUEL SÓWÀ™ NE PREND AUCUNE REMISE.
update public.catalog_services
   set data = data || '{"sansRemise": true}'::jsonb
 where id = '1740l5ysxj'
   and coalesce(data->>'sansRemise', '') <> 'true';

-- Ce qui est en base après coup : l'offre (18 gestes attendus), ses réglages,
-- le mercredi toujours éteint, le Sówà marqué, et les copies de repli.
select e->>'code' as code,
       e->>'title' as titre,
       e->>'active' as allumee,
       e->'joursDeLaVenue' as jours_de_la_venue,
       e->>'placesParJour' as places_par_jour,
       e->>'jourVideSeulement' as jour_vide_seulement,
       e->>'horizonJours' as horizon,
       e->>'discountPct' as remise,
       jsonb_array_length(e->'serviceIds') as prestations,
       (select x->>'active' from jsonb_array_elements(d.data) x where x->>'id' = 'of-mercredi15') as mercredi_allume,
       (select s.data->>'sansRemise' from public.catalog_services s where s.id = '1740l5ysxj') as sowa_sans_remise,
       (select count(*) from public.repli_mnd_offers_20261104_places) as offres_en_repli,
       (select count(*) from public.repli_catalog_services_20261104_sowa) as sowa_en_repli
  from public.documents d, jsonb_array_elements(d.data) e
 where d.key = 'mnd_offers' and e->>'id' = 'of-places-limitees';
