-- ═══════════════════════════════════════════════════════════════════
-- 0053 — VÈKPÈ™ CRÉATION PICO ET GALAXY · LA COURONNE KPÒKPÒ™
--        (à coller tel quel dans Supabase → SQL Editor, puis Run.
--         RIEN À DÉCOMMENTER.)
--
-- ── CE QU'IL FAIT ────────────────────────────────────────────────
-- ① Il crée le DERNIER degré de l'échelle des Créations. Elle s'arrêtait au
--    Nano (351–450 locks) : au-delà, une couronne Pico ou Galaxy n'avait
--    AUCUNE création à réserver — `estProposable` ne lui proposait rien, et
--    le tunnel de Ma Couronne restait muet devant elle.
--
--      Jumbo    50–100     80 000 → 120 000
--      Medium     –150    150 000 → 200 000
--      Mini    150–250    275 000 → 375 000
--      Micro   251–350    350 000 → 475 000
--      Nano    351–450    525 000 → 600 000
--      PICO ET GALAXY, dès 451   750 000 · 800 000 · 850 000   ← ce script
--
--    Prix DONNÉS PAR YÉMAN, par longueur : court 750 000, mi-long 800 000,
--    long 850 000. Le prix de repli (celui qu'annonce la Vitrine quand la
--    longueur n'est pas connue) est le court, comme sur toute l'échelle.
--
-- ② Il répare une ÉTIQUETTE DE CALIBRE. « VÈKPÈ™ Création Nano » dit dans sa
--    description « 351 à 450 locks » — le calibre Nano — mais elle est
--    étiquetée `cal-galaxy`. Conséquence vécue : une tête NANO ne se voyait
--    proposer aucune création, et une tête GALAXY se voyait proposer celle du
--    Nano. Sans ce correctif, la nouvelle fiche AGGRAVERAIT le désordre : une
--    Galaxy en verrait deux. Pour ne PAS y toucher, retire simplement l'ordre
--    ② de ce script avant de lancer.
--
-- ── CE QUI RESTE À TA MAIN ───────────────────────────────────────
-- · La DURÉE et le NOMBRE DE SÉANCES sont extrapolés de l'échelle (Micro 2
--   jours / 600 min, Nano 3 séances / 720 min) : ici 3 séances, 12 h à 16 h.
--   Ils se corrigent en deux gestes au Catalogue.
-- · Le sous-titre « La Couronne KPÒKPÒ™ » est désormais porté par DEUX fiches
--   — le Nano le portait déjà, et sa description dit encore « le sommet de la
--   création MND », ce qui n'est plus vrai. À renommer au Catalogue si tu veux
--   que le sommet ne se dise qu'une fois.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── ① LE DERNIER DEGRÉ ───────────────────────────────────────────
insert into public.catalog_services (id, branch_id, data)
values (
  'sv-atl-i-pic',
  null,
  jsonb_build_object(
    'id',            'sv-atl-i-pic',
    'categoryId',    'atl-i-vekpe',
    'name',          'VÈKPÈ™ Création Pico et Galaxy · La Couronne KPÒKPÒ™',
    'code',          'ATL·I·PIC',
    'palier',        'Souveraineté',
    'master',        '',
    'order',         8,
    'sessions',      3,
    'durationMin',   720,
    'durationMaxMin', 960,
    'priceMode',     'fixe',
    'hidePrice',     false,
    'priceXof',      750000,
    'prixParLongueur', jsonb_build_object('court', 750000, 'mi-long', 800000, 'long', 850000),
    'bandIds',       jsonb_build_array('cal-pico', 'cal-galaxy'),
    'description',   'La Création à partir de 451 locks — Pico et Galaxy réunis, le degré le plus fin que la Maison pose. Trois séances de travail, lock par lock, sur diagnostic KÒKÒ™ Origine et engagement d''entretien validé avant la pose. Inclus : DÀNDÀN™ + GBÌGBÌ™ post pose, 1 SÍNSIN™ Essentielle offerte à 6 semaines, coiffure signature de sortie, huile Kòfí™ 100 ml.'
  )
)
on conflict (id) do update set data = excluded.data;

-- ── ② L'ÉTIQUETTE DU NANO REMISE SUR SON CALIBRE ─────────────────
-- Sa description dit « 351 à 450 locks » : c'est le calibre Nano, pas Galaxy.
update public.catalog_services
set data = jsonb_set(data, '{bandIds}', jsonb_build_array('cal-nano'))
where id = 'sv-atl-i-nan';

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLE — l'échelle entière, chaque degré sur son calibre.
-- ═══════════════════════════════════════════════════════════════════
select data ->> 'name'                                    as prestation,
       data ->> 'code'                                    as code,
       data -> 'bandIds'                                  as calibres,
       (data ->> 'priceXof')::numeric                     as repli,
       data -> 'prixParLongueur' ->> 'court'              as court,
       data -> 'prixParLongueur' ->> 'mi-long'            as mi_long,
       data -> 'prixParLongueur' ->> 'long'               as long_haute_densite
from public.catalog_services
where data ->> 'categoryId' = 'atl-i-vekpe'
  and data -> 'includes' is null
order by (data ->> 'order')::numeric;

-- Chaque calibre a-t-il SA création, une seule ? (7 lignes, aucune à 0 ni à 2)
select b.calibre,
       count(s.id) as creations
from (values ('cal-jumbo'), ('cal-medium'), ('cal-mini'), ('cal-micro'),
             ('cal-nano'), ('cal-pico'), ('cal-galaxy')) as b(calibre)
left join public.catalog_services s
  on s.data ->> 'categoryId' = 'atl-i-vekpe'
 and s.data -> 'includes' is null
 and s.data -> 'bandIds' ? b.calibre
group by 1
order by 2, 1;
