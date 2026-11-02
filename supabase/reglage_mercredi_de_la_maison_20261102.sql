-- Le mercredi de la Maison — 2 novembre 2026, maquette « Remplir les fauteuils »
-- validée par Yéman (« construis »), arbitrages 3 et 4 tranchés ce jour :
-- −15 % sur le rituel posé un MERCREDI, code MERCREDI15, jusqu'au 31 décembre
-- 2026, hors formules et abonnements, ne s'ajoute à aucun autre code, partout
-- (le site, Ma Couronne, le comptoir du Trône qui l'applique).
--
-- Ce fichier AJOUTE l'offre au tableau `documents.data` de la clé `mnd_offers`.
-- Il ne touche à aucune autre offre (RENTREE10 et ROSE15 restent telles quelles).
--
-- REJOUABLE : la copie de repli ne se refait pas si elle existe, et l'offre ne
-- s'ajoute pas si une offre au code MERCREDI15 existe déjà (quelle que soit sa
-- casse). Rejouer ce fichier ne change donc rien la seconde fois.
--
-- LE CHAMP NEUF `joursDeLaVenue` (['Mer']) dit le jour où la cliente VIENT :
-- l'offre ne vaut que pour un rendez-vous dont la date tombe un mercredi, du 4
-- novembre au 31 décembre 2026 (saison lue sur la date du rendez-vous). `days`
-- (les sept jours) reste le jour d'AFFICHAGE : la carte se voit tous les jours.
-- Le code du Trône qui lit ce champ part avec le même commit (offres-pur.ts,
-- demande-submit) : poser cette ligne AVANT la publication du Trône et de la
-- fonction demande-submit ferait courir MERCREDI15 comme une offre ordinaire,
-- tous les jours. La publier d'abord, ce fichier ensuite.
--
-- LES PRESTATIONS COUVERTES (`serviceIds`) : les prestations non archivées du
-- catalogue, moins
--   · les compositions (forfaits, formules de venue GBÈJÍ™ et Le Moment,
--     abonnements, suites, cures composées) : 17 fiches qui portent `includes` ;
--   · les paquets vendus en plusieurs séances sans composition : Cure GBÌGBÌ™
--     Profond × 3, FÍNFÍN™ × GBÈJÍ™ + 6 mois, VÍVÍVÓ™ Cure de trois, Pack
--     Autonomie ;
--   · l'Académie (ce n'est pas un rituel, et elle a son offre, CURSUS10) ;
--   · les créations VÈKPÈ™ (six adultes, au prix du calibre, et VÈKPÈ™ Kids) :
--     elles ont leur offre (la consultation déduite) et un −15 % sur une
--     création se décide nommément ; un clic dans l'éditeur des offres les
--     ajoute si la Maison le veut ;
--   · la Prestation sur mesure (sur devis : rien à déduire) et l'Option Tout
--     inclus (elle vend des mèches, un produit).
-- Soit 61 prestations, listées ci-dessous avec leur nom. Une fiche archivée
-- entre-temps tombe d'elle-même (filtre `archived`).
--
-- La table de repli reçoit RLS aussitôt (règle des tables repli_).

create table if not exists public.repli_mnd_offers_20261102 as
  select * from public.documents where key = 'mnd_offers';
alter table public.repli_mnd_offers_20261102 enable row level security;

with gestes as (
  select coalesce(jsonb_agg(s.id order by s.id), '[]'::jsonb) as ids
    from public.catalog_services s
   where s.id in (
     -- La Lumière (couleur)
     'sv-atl-iii-cou-c',          -- YÈKPÈ™ Couleur · La Révélation Végétale
     'sv-atl-iii-cou-l',          -- YÈKPÈ™ Couleur
     'sv-atl-iii-ecl-c',          -- YÈKPÈ™ Éclat · Le Raviveur de Couleur · Court
     'sv-atl-iii-lum-c',          -- YÈKPÈ™ Lumière · La Brillance Signature
     'sv-dds-col-c',              -- YÈKPÈ™ avec votre couleur · couleur apportée
     -- La Renaissance (réparation)
     'sv-atl-iv-ala-c',           -- ÀLÀLÀ™ · La Grande Renaissance
     'sv-atl-iv-gbe-c',           -- FÍNFÍN™ Essentiel · La Reconstruction
     'sv-atl-iv-gbp-c',           -- FÍNFÍN™ Profond · La Reconstruction Intensive
     'sv-atl-iv-gbp-prot',        -- GBÌGBÌ™ Protéiné · Le Soin Reconstructeur post-technique
     'sv-finfin-legere',          -- FÍNFÍN™ Légère · La Réparation Douce
     'sv-plt-50-ret-r-c',         -- FÍNFÍN™ · La Retouche
     -- Le Dénouement
     'sv-plt-45-int',             -- GBÀTÀ™ Intégral · Le Défaisage
     'sv-plt-45-std',             -- GBÀTÀ™ Essentiel · Le Défaisage
     -- Les lavages rituels
     'sv-dds-shp-e',              -- KLƆKLƆ™ avec votre produit · shampoing apporté
     'sv-plt-05-ess-c',           -- KLƆKLƆ™ Essentiel · Le Souffle
     'sv-plt-05-pre-c',           -- KLƆKLƆ™ Prestige · La Dépose
     'sv-plt-05-sig-c',           -- KLƆKLƆ™ Signature · L’Ancrage
     -- MND Kids (hors compositions et hors création)
     'sv-kids-gbigbi',            -- GBÌGBÌ™ Kids · Le Renfort
     'sv-kids-kloklo',            -- KLƆKLƆ™ Kids · Le Souffle
     'sv-kids-retouche',          -- La Retouche (Kids)
     'sv-kids-sinsin',            -- SÍNSIN™ Kids · La Reprise
     'sv-kids-yekpe',             -- GBÌGBÌ™ Kids · L’Éclat
     -- Les soins
     'sv-dds-dec',                -- WÈWÈ™ avec votre produit · décapant apporté
     'sv-dds-soi-c',              -- WÈWÈ™ avec votre produit · masque ou huile apportés
     'sv-plt-10-l',               -- DÀNDÀN™ Léger · L’hydratation douce
     'sv-plt-10-m',               -- DÀNDÀN™ · L’hydratation aux sept huiles
     'sv-plt-20-c',               -- WÈWÈ™ · Détox & Purification
     'sv-plt-30-c',               -- VÍVÍVÓ™ · Le Vivifiant
     'sv-plt-40-m',               -- GBÌGBÌ™ · Le Renfort
     -- La Maison pour vous seule
     'sv-souv-1h',                -- Portes closes · une heure
     'sv-souv-2h',                -- Portes closes · deux heures
     'sv-souv-crea',              -- Portes closes · la Création
     'sv-souv-rep',               -- Portes closes · la Réparation intensive
     -- Les sorties signature
     'sv-plt-50-eve-c',           -- La sortie de grand jour · coiffure exception
     'sv-plt-50-sty-e',           -- La sortie soignée · coiffure quotidien
     'sv-plt-50-sty-s',           -- La sortie Signature · coiffure élaborée
     -- La Transformation
     'sv-atl-iii-sub-c',          -- La Transformation · décoloration et oxydation
     -- Le Regard (consultations)
     'sv-koko-bilan',             -- KÒKÒ™ Bilan · la lecture de votre couronne
     'sv-koko-ori',               -- KÒKÒ™ Origine · Première couronne
     'sv-koko-sui',               -- KÒKÒ™ Accueil · pour des locks nées ailleurs
     'svc-doto-conseil',          -- KÒKÒ™ Conseil · enfant, cheveu naturel
     -- Beauté et bien-être
     'sv-plt-70-man-c',           -- Pendant le rituel · manucure
     'sv-plt-70-par',             -- Pendant le rituel · manucure et pédicure
     'sv-plt-70-ped-c',           -- Pendant le rituel · pédicure
     'x0ci24g7ya',                -- Contour & Finitions MND
     -- Le Cheveu Naturel Libre, Les Grands Jours
     'sv-stu-b-cpf-c',            -- RÉVÉLER · Coupe et forme
     'sv-stu-b-eve-c',            -- RÉVÉLER · Éveil
     'sv-stu-c-eve-c',            -- CÉLÉBRER · Coiffure d’événement
     'sv-stu-c-sik-1-c',          -- CÉLÉBRER · Le Grand Jour Essentiel
     'sv-stu-c-sik-2-c',          -- CÉLÉBRER · Le Grand Jour Signature
     -- Prélude, démontage, essais
     'sv-sup-01',                 -- Prélude Express · cheveu prêt à travailler
     'sv-sup-02-l',               -- Prélude Complet · cheveux lisses, bouclés 3A à 3C
     'sv-sup-03-c',               -- Prélude Intensif · très emmêlé, transition, cheveu lisse
     'sv-sup-20-c',               -- Démontage ancienne coiffure
     'sv-sup-30',                 -- VÈKPÈ™ L’Essai · essai de calibre
     'sv-sup-40',                 -- Supplément longueur XXL
     'sv-sup-50',                 -- Option Nuage · sans nœud
     -- Les reprises de racines
     'sv-atl-ii-e',               -- SÍNSIN™ Essentiel · La Reprise
     'sv-atl-ii-l',               -- SÍNSIN™ Signature · La Reprise Longue Durée
     'sv-gbeji-sublimation',      -- Sublimation · Le Renfort Durable
     'sv-retouches-post-reprise'  -- La Retouche · contours et racines
   )
     and coalesce((s.data->>'archived')::boolean, false) = false
), offre as (
  select jsonb_build_object(
    'id', 'of-mercredi15',
    'branchId', 'br-40r6u6frno',
    'title', 'Le mercredi de la Maison',
    'tag', 'Le mercredi',
    'deal', '−15 %',
    'sub', 'Venez un mercredi : −15 % sur votre rituel, le jour le plus calme de la Maison.',
    'audience', 'Tous',
    'days', '["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"]'::jsonb,
    'joursDeLaVenue', '["Mer"]'::jsonb,
    'heureDebut', '00h',
    'heureFin', '22h',
    'active', true,
    'du', '2026-11-04',
    'au', '2026-12-31',
    'code', 'MERCREDI15',
    'discountPct', 15,
    'serviceIds', gestes.ids,
    'parcours', 'entretien',
    'bouton', 'Réserver un mercredi',
    'conditions', 'Sur le rituel d’un rendez-vous posé un mercredi, à la Maison. Hors formules, forfaits, abonnements et créations. Ne s’ajoute à aucun autre code, et le total s’arrondit au millier supérieur.'
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
      where upper(coalesce(e->>'code', '')) = 'MERCREDI15'
   );

-- Ce qui est en base après coup : l'offre, ses 61 prestations (moins une
-- fiche archivée entre-temps), et la copie de repli.
select e->>'code' as code,
       e->>'title' as titre,
       e->'joursDeLaVenue' as jours_de_la_venue,
       e->>'du' as du, e->>'au' as au,
       e->>'discountPct' as remise,
       jsonb_array_length(e->'serviceIds') as prestations,
       (select count(*) from jsonb_array_elements(d.data)) as offres_en_tout,
       (select count(*) from public.repli_mnd_offers_20261102) as lignes_en_repli
  from public.documents d, jsonb_array_elements(d.data) e
 where d.key = 'mnd_offers' and upper(coalesce(e->>'code', '')) = 'MERCREDI15';
