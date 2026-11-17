-- La décoloration se réserve directement : 17 novembre 2026.
-- « Non la décoloration fait partie du process de la coloration, ça se réserve
-- directement. » (Yéman, la consultation en affiches.)
--
-- La Transformation · décoloration et oxydation (`sv-atl-iii-sub-c`) était
-- tenue à l'écart par trois réglages EN LIGNE. Ce fichier les lève, pour elle
-- seule :
--
--   ① SON SEUIL. Le document `mnd_besoins` (Système › Besoins et règles ›
--      Seuils et preuves) ne la comptait pas parmi les prestations courantes,
--      « sans seuil » : palier II, vingt points demandés. Elle rejoint la liste.
--
--   ② LA GARDE « PEAU ». Le même document l'écartait dès qu'un besoin à garde
--      médicale était coché (`ecartesParLaPeau`). Elle en sort. Le détox, le
--      décapant et Le Moment Cuir chevelu y RESTENT : la garde n'est touchée
--      pour aucune autre prestation.
--
--   ③ LA CASE DU SITE. La régie de la Vitrine (« Sur le site public ») la
--      décochait : `mnd_vitrine_config`, `siteMasques.services`. Elle est
--      recochée. Aucun autre masque ne bouge, ni ceux de la carte du comptoir
--      ni ceux de Ma Couronne (elle n'y était pas masquée).
--
-- La semence du Trône (shared/besoins-pur.ts) dit la même chose depuis ce
-- jour ; elle ne sert qu'à un document absent. Le document existe : c'est lui
-- que ce fichier change.
--
-- CE QUE CE FICHIER NE FAIT PAS. Il n'ouvre pas à lui seul la réservation en
-- ligne : le juge des places (`demande-submit`, `reservableSurLeSite`) ne
-- laisse passer que deux ateliers, l'Entretien et la Coloration, et la
-- décoloration vit depuis la nouvelle grille du 10 octobre 2026 dans un
-- atelier à elle (`cat-transformation`). Tant que le juge ne lit pas cet
-- atelier, le Trône (Vos envies) la dit « pas d'un atelier qui se réserve en
-- ligne », et le site passe par la visio.
--
-- À PASSER avant ou après la publication du Trône : l'ordre ne compte pas.
-- Si un poste réécrit la Vitrine dans la minute (régie ouverte), relancer.
--
-- REJOUABLE : rejoué, il ne trouve plus rien à changer et ne change rien.

-- ① et ② : le seuil et la garde « peau », dans `mnd_besoins`.
update public.documents d
   set data = d.data
         || jsonb_build_object(
              'sansSeuil',
              case when d.data->'sansSeuil' @> '["sv-atl-iii-sub-c"]'::jsonb
                   then d.data->'sansSeuil'
                   else d.data->'sansSeuil' || '["sv-atl-iii-sub-c"]'::jsonb end,
              'ecartesParLaPeau',
              coalesce((select jsonb_agg(e order by ord)
                          from jsonb_array_elements(d.data->'ecartesParLaPeau') with ordinality as t(e, ord)
                         where e <> '"sv-atl-iii-sub-c"'::jsonb), '[]'::jsonb),
              'modifieLe', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'modifiePar', 'réglage du 17 novembre 2026 (la décoloration se réserve directement)'),
       updated_at = now()
 where d.key = 'mnd_besoins'
   and jsonb_typeof(d.data->'sansSeuil') = 'array'
   and jsonb_typeof(d.data->'ecartesParLaPeau') = 'array'
   and (not (d.data->'sansSeuil' @> '["sv-atl-iii-sub-c"]'::jsonb)
        or d.data->'ecartesParLaPeau' @> '["sv-atl-iii-sub-c"]'::jsonb);

-- ③ : la case du site, dans `mnd_vitrine_config`.
update public.documents d
   set data = jsonb_set(
         d.data,
         '{siteMasques,services}',
         coalesce((select jsonb_agg(e order by ord)
                     from jsonb_array_elements(d.data->'siteMasques'->'services') with ordinality as t(e, ord)
                    where e <> '"sv-atl-iii-sub-c"'::jsonb), '[]'::jsonb)),
       updated_at = now()
 where d.key = 'mnd_vitrine_config'
   and jsonb_typeof(d.data->'siteMasques'->'services') = 'array'
   and d.data->'siteMasques'->'services' @> '["sv-atl-iii-sub-c"]'::jsonb;

-- Ce qui est en base après coup. Attendu : sans seuil = oui ; écartée par la
-- garde = non ; ce que la garde écarte encore = le détox, le décapant, le
-- 2 en 1 et Le Moment Cuir chevelu ; décochée pour le site = non.
select d.data->'sansSeuil' @> '["sv-atl-iii-sub-c"]'::jsonb        as decoloration_sans_seuil,
       d.data->'ecartesParLaPeau' @> '["sv-atl-iii-sub-c"]'::jsonb as decoloration_ecartee_par_la_garde,
       d.data->'ecartesParLaPeau'                                   as la_garde_ecarte_encore,
       d.data->>'modifiePar'                                        as signe
  from public.documents d where d.key = 'mnd_besoins';
select d.data->'siteMasques'->'services' @> '["sv-atl-iii-sub-c"]'::jsonb as decoloration_decochee_pour_le_site,
       jsonb_array_length(d.data->'siteMasques'->'services')              as gestes_decoches_pour_le_site
  from public.documents d where d.key = 'mnd_vitrine_config';
