-- ═══════════════════════════════════════════════════════════════════════
-- 0194 · LE MOMENT CUIR CHEVELU EN QUATRE VENUES · 7 novembre 2026
--        ÉCRITE, NON APPLIQUÉE. Se rejoue sans danger (le résultat est le
--        même à chaque fois). Ne touche QUE sv-le-moment-cuir-chevelu :
--        « Le Moment Signature » (sv-le-moment) reste à trois venues.
--
-- « Il faut mettre 4 venues au total. Changer le Moment en 4 venues » puis
-- « Les 4 venues sont sur le Moment cuir chevelu uniquement » et « avec 4
-- reprises de racines et 2 sublimations » (Yéman).
--
-- Le catalogue dit ici la même chose que le plan : chaque ligne de `includes`
-- porte la venue qui la consomme (`venue`, 1 à 4 : l'écran l'affiche, rien
-- d'autre ne la lit : ni le prix, ni la pose des séances, ni la facture).
-- `afterWeeks` GARDE ses valeurs d'avant (0 / 8 / 12 semaines), c'est le guide
-- de la répartition. AUCUN service existant n'est retiré.
--
--   venue 1 · le jour J      lavage KLƆKLƆ™ Signature, reprise SÍNSIN™
--                            Signature, WÈWÈ™ Détox & Purification (déjà là),
--                            + Sublimation (NOUVELLE)
--   venue 2 · +4 semaines    lavage KLƆKLƆ™ Signature (NOUVEAU),
--                            reprise SÍNSIN™ Signature (NOUVELLE)
--   venue 3 · +8 semaines    lavage KLƆKLƆ™ Signature et Retouches post
--                            reprise (déjà là), + reprise SÍNSIN™ Signature
--                            (NOUVELLE), + Sublimation (NOUVELLE)
--   venue 4 · +12 semaines   KLƆKLƆ™ Essentiel OFFERT, DÀNDÀN™, SÍNSIN™
--                            Signature (déjà là : la 4e reprise)
--   Total : 4 reprises SÍNSIN™ Signature, 2 sublimations.
--
-- ATTENTION : la composition du Moment cuir chevelu GRANDIT (6 lignes de
-- plus). Son prix de catalogue, composé de ses lignes, monte avec elle : à
-- valider avec Yéman avant de lancer. Les plans déjà posés ne bougent pas
-- (chaque rendez-vous porte son prix figé).
-- ═══════════════════════════════════════════════════════════════════════

do $bloc$
declare
  nouveau jsonb := '[
    {"serviceId": "sv-plt-05-sig-c", "venue": 1},
    {"serviceId": "sv-atl-ii-l", "venue": 1},
    {"serviceId": "sv-plt-20-c", "venue": 1},
    {"serviceId": "sv-gbeji-sublimation", "venue": 1},
    {"serviceId": "sv-plt-05-sig-c", "afterWeeks": 4, "venue": 2},
    {"serviceId": "sv-atl-ii-l", "afterWeeks": 4, "venue": 2},
    {"serviceId": "sv-plt-05-sig-c", "afterWeeks": 8, "venue": 3},
    {"serviceId": "sv-retouches-post-reprise", "afterWeeks": 8, "venue": 3},
    {"serviceId": "sv-atl-ii-l", "afterWeeks": 8, "venue": 3},
    {"serviceId": "sv-gbeji-sublimation", "afterWeeks": 8, "venue": 3},
    {"offert": true, "serviceId": "sv-plt-05-ess-c", "afterWeeks": 12, "venue": 4},
    {"serviceId": "sv-plt-10-m", "afterWeeks": 12, "venue": 4},
    {"serviceId": "sv-atl-ii-l", "afterWeeks": 12, "venue": 4}
  ]'::jsonb;
  avant jsonb;
  reprises int;
  sublimations int;
begin
  select data->'includes' into avant from public.catalog_services where id = 'sv-le-moment-cuir-chevelu';
  if not found then
    raise exception '0194 : sv-le-moment-cuir-chevelu est introuvable (0192 d''abord)';
  end if;

  -- Rien d'existant n'est retiré : chaque ligne d'avant (service, offert, délai) se retrouve dans la nouvelle liste.
  if exists (
    select 1 from jsonb_array_elements(coalesce(avant, '[]'::jsonb)) a(l)
    where not exists (
      select 1 from jsonb_array_elements(nouveau) n(l)
      where n.l->>'serviceId' = a.l->>'serviceId'
        and coalesce((n.l->>'afterWeeks')::int, 0) = coalesce((a.l->>'afterWeeks')::int, 0)
        and coalesce((n.l->>'offert')::boolean, false) = coalesce((a.l->>'offert')::boolean, false)
    )
  ) then
    raise exception '0194 : la composition actuelle du Moment cuir chevelu a une ligne que la nouvelle liste retirerait ; rien n''est écrit';
  end if;

  select count(*) filter (where e.l->>'serviceId' = 'sv-atl-ii-l'),
         count(*) filter (where e.l->>'serviceId' = 'sv-gbeji-sublimation')
    into reprises, sublimations from jsonb_array_elements(nouveau) e(l);
  if reprises <> 4 or sublimations <> 2 then
    raise exception '0194 : le plan doit compter 4 reprises et 2 sublimations (%, %)', reprises, sublimations;
  end if;

  update public.catalog_services
     set data = jsonb_set(data, '{includes}', nouveau)
   where id = 'sv-le-moment-cuir-chevelu' and data->'includes' is distinct from nouveau;
end
$bloc$;
