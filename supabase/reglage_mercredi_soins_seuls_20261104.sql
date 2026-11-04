-- Le mercredi de la Maison, sur les shampoings, lavages et soins seuls : 4 novembre 2026.
-- « Quand on remplit le fauteuil, la remise de 15 % est pour les shampoings, le
-- lavage et les soins uniquement » (Yéman, 4 novembre 2026), puis au sélecteur :
-- aucun geste Kids, toute la réparation (GBÌGBÌ™ Protéiné, les FÍNFÍN™,
-- ÀLÀLÀ™), le soin 2 en 1 WÈWÈ™ + DÀNDÀN™ aussi, et les rendez-vous déjà
-- réservés avec MERCREDI15 honorés tels quels.
--
-- Ce fichier REMPLACE, dans l'offre au code MERCREDI15 du tableau `mnd_offers`,
-- la liste des prestations couvertes (61, posées le 2 novembre 2026 par
-- reglage_mercredi_de_la_maison_20261102.sql) par les 18 ci-dessous, et ses deux
-- phrases lues par la cliente (`sub`, `conditions`). Rien d'autre ne bouge :
-- ni son jour (le mercredi de la venue), ni sa saison (4 novembre au
-- 31 décembre 2026), ni ses 15 %, ni les autres offres, ni leur ordre.
--
-- LE CODE NE CHANGE PAS : la remise se pose ligne à ligne sur les seules
-- prestations que l'offre couvre (offres-pur, `lignesDuCode`), aux quatre
-- portes (le site, Ma Couronne, la fenêtre du rendez-vous, la Caisse) et dans
-- demande-submit. Une reprise SÍNSIN™ posée un mercredi garde donc son prix,
-- et un mercredi sans aucun de ces gestes ne pose plus le code.
--
-- LES RENDEZ-VOUS DÉJÀ RÉSERVÉS gardent leurs remises de ligne gravées : la
-- Caisse lit celles du rendez-vous (il porte déjà son code), et une
-- réouverture garde comme remise de la main un −15 % sur une ligne que l'offre
-- ne couvre plus (`remisesDeLaMainSeules`).
--
-- REJOUABLE : la copie de repli ne se refait pas si elle existe, et l'offre ne
-- se réécrit que si sa liste ou ses phrases diffèrent encore. Une fiche
-- archivée entre-temps tombe d'elle-même (filtre `archived`).
--
-- La table de repli reçoit RLS aussitôt (règle des tables repli_). À poser
-- AVANT la publication du site public : il écrit la carte de l'offre à la
-- construction.

create table if not exists public.repli_mnd_offers_20261104 as
  select * from public.documents where key = 'mnd_offers';
alter table public.repli_mnd_offers_20261104 enable row level security;

with neuf as (
  select (
    select coalesce(jsonb_agg(s.id order by s.id), '[]'::jsonb)
      from public.catalog_services s
     where s.id in (
       -- Les shampoings et lavages
       'sv-dds-shp-e',              -- KLƆKLƆ™ avec votre produit · shampoing apporté
       'sv-plt-05-ess-c',           -- KLƆKLƆ™ Essentiel · Le Souffle
       'sv-plt-05-pre-c',           -- KLƆKLƆ™ Prestige · La Dépose
       'sv-plt-05-sig-c',           -- KLƆKLƆ™ Signature · L’Ancrage
       -- Les soins
       'sv-dds-dec',                -- WÈWÈ™ avec votre produit · décapant apporté
       'sv-dds-soi-c',              -- WÈWÈ™ avec votre produit · masque ou huile apportés
       'sv-plt-10-l',               -- DÀNDÀN™ Léger · L’hydratation douce
       'sv-plt-10-m',               -- DÀNDÀN™ · L’hydratation aux sept huiles
       'sv-plt-20-c',               -- WÈWÈ™ · Détox & Purification
       'sv-plt-30-c',               -- VÍVÍVÓ™ · Le Vivifiant
       'sv-plt-40-m',               -- GBÌGBÌ™ · Le Renfort
       'sv-forfait-sv-plt-60-wd-c', -- WÈWÈ™ + DÀNDÀN™ · le soin 2 en 1
       -- Les soins de réparation
       'sv-atl-iv-gbp-prot',        -- GBÌGBÌ™ Protéiné · Le Soin Reconstructeur post-technique
       'sv-finfin-legere',          -- FÍNFÍN™ Légère · La Réparation Douce
       'sv-atl-iv-gbe-c',           -- FÍNFÍN™ Essentiel · La Reconstruction
       'sv-atl-iv-gbp-c',           -- FÍNFÍN™ Profond · La Reconstruction Intensive
       'sv-plt-50-ret-r-c',         -- FÍNFÍN™ · La Retouche
       'sv-atl-iv-ala-c'            -- ÀLÀLÀ™ · La Grande Renaissance
     )
       and coalesce((s.data->>'archived')::boolean, false) = false
  ) as ids,
  jsonb_build_object(
    'sub', 'Venez un mercredi : −15 % sur vos shampoings, lavages et soins, le jour le plus calme de la Maison.',
    'conditions', 'Sur les shampoings, lavages et soins d’un rendez-vous posé un mercredi, à la Maison, soins de réparation compris ; les autres gestes gardent leur prix. Hors gestes Kids, formules, abonnements et cures. Ne s’ajoute à aucun autre code, et le total s’arrondit au millier supérieur.'
  ) as mots
)
update public.documents d
   set data = (
         select jsonb_agg(
                  case when upper(coalesce(t.e->>'code', '')) = 'MERCREDI15'
                       then t.e || neuf.mots || jsonb_build_object('serviceIds', neuf.ids)
                       else t.e end
                  order by t.n)
           from jsonb_array_elements(d.data) with ordinality as t(e, n)
       ),
       updated_at = now()
  from neuf
 where d.key = 'mnd_offers'
   and jsonb_typeof(d.data) = 'array'
   and exists (
     select 1 from jsonb_array_elements(d.data) e
      where upper(coalesce(e->>'code', '')) = 'MERCREDI15'
        and ((e->'serviceIds') is distinct from neuf.ids or not (e @> neuf.mots))
   );

-- Ce qui est en base après coup : l'offre, ses 18 prestations (moins une fiche
-- archivée entre-temps), ses phrases, le nombre d'offres, et la copie de repli.
select e->>'code' as code,
       e->'joursDeLaVenue' as jours_de_la_venue,
       e->>'du' as du, e->>'au' as au,
       e->>'discountPct' as remise,
       jsonb_array_length(e->'serviceIds') as prestations,
       e->>'sub' as phrase,
       (select count(*) from jsonb_array_elements(d.data)) as offres_en_tout,
       (select count(*) from public.repli_mnd_offers_20261104) as lignes_en_repli
  from public.documents d, jsonb_array_elements(d.data) e
 where d.key = 'mnd_offers' and upper(coalesce(e->>'code', '')) = 'MERCREDI15';
