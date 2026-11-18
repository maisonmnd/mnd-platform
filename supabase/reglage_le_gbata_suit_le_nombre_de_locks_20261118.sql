-- Le rituel GBÀTÀ™ Essentiel se paie selon le nombre de locks : 18 novembre 2026.
-- « Quand on choisit cheveux libres, donne le prix du rituel de Gbata selon le
-- nombre de locks, pas besoin de visio ou consultation privée » (Yéman, la
-- consultation en affiches, 17 novembre 2026), puis au sélecteur : « Selon le
-- nombre de locks ».
--
-- Ce qui change, et rien d'autre, sur GBÀTÀ™ Essentiel · Le Défaisage
-- (`sv-plt-45-std`, atelier `cat-defaisage`) :
--
--   ① « SUIT LE MODÈLE » S'ALLUME (`scalesWithModel: true`). Son prix et sa
--      durée suivent désormais le barème de la Maison (`mnd_model_bands`) comme
--      toute prestation qui suit le modèle (shared/pricing.ts, `suitLeModeleRegle`,
--      `personalDurationMin`) : au Trône, à la Caisse, sur le site et au serveur.
--      Lu en ligne le 18 novembre 2026 (prix de base 80 000 F, 300 min) :
--      jusqu'à 80 locks ×0,8 (64 000 F, 240 min) ; 81 à 150 ×0,8 (64 000 F,
--      300 min) ; 151 à 250 ×1 (80 000 F, 420 min) ; 251 à 350 ×1,2 (96 000 F,
--      570 min) ; 351 à 450 ×1,4 (112 000 F, 720 min) ; 451 à 550 ×1,6
--      (128 000 F, 780 min) ; au-delà ×1,8 (144 000 F, 840 min). Une tête dont
--      le rituel ne tient plus dans une journée de la Maison (premier rendez-vous
--      08:30) ne le réserve pas en ligne : le site lui propose la visio et/ou la
--      consultation privée.
--
--   ② « CONSULTATION AVANT » SE DÉCOCHE (`consultationAvant: false`). Tant
--      qu'elle était cochée, le serveur refusait la réservation en ligne
--      (`consultation_requise`) et « Cheveux libres » passait par la visio.
--
-- GBÀTÀ™ Intégral (`sv-plt-45-int`) ne bouge pas : il garde son prix fixe et
-- sa consultation avant. Aucune autre prestation ne bouge.
--
-- À SAVOIR. Sa fourchette (`priceToXof`, 120 000 F) reste écrite ; avec le
-- barème, c'est le prix de base multiplié par le coefficient du calibre qui
-- compte. Les rendez-vous déjà posés gardent leur prix et leur durée gravés.
--
-- À PASSER avec la publication du site et du Trône (avant ou après : le site
-- lit le catalogue en vif). REJOUABLE : la copie de repli ne se refait pas et
-- reçoit RLS aussitôt (règle des tables repli_) ; rejoué, l'update ne trouve
-- plus rien à changer.

create table if not exists public.repli_le_gbata_suit_le_nombre_de_locks_20261118 as
  select id, data, updated_at
    from public.catalog_services
   where id = 'sv-plt-45-std';
alter table public.repli_le_gbata_suit_le_nombre_de_locks_20261118 enable row level security;

update public.catalog_services
   set data = data || jsonb_build_object('scalesWithModel', true, 'consultationAvant', false),
       updated_at = now()
 where id = 'sv-plt-45-std'
   and (coalesce((data->>'scalesWithModel')::boolean, false) = false
        or coalesce((data->>'consultationAvant')::boolean, false) = true);

-- Ce qui se lit après. Attendu : une ligne, suit_le_modele = true,
-- consultation_avant = false ; l'Intégral inchangé (suit_le_modele vide,
-- consultation_avant = true).
select id,
       data->>'name'                          as nom,
       (data->>'scalesWithModel')::boolean    as suit_le_modele,
       (data->>'consultationAvant')::boolean  as consultation_avant,
       (data->>'priceXof')::int               as prix_de_base,
       data->>'priceMode'                     as mode_du_prix,
       (data->>'durationMin')::int            as duree_de_base
  from public.catalog_services
 where id in ('sv-plt-45-std', 'sv-plt-45-int')
 order by id desc;
