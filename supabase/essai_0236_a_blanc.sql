-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC DE 0236 · LES MODÈLES CHEZ META GARDENT LEURS DEUX FORMES
-- 18 novembre 2026
--
-- À jouer APRÈS 0236, d'un seul tenant. Tout est ANNULÉ par l'exception
-- finale : aucune écriture ne reste, rien ne part au temps réel (rien n'est
-- validé). Sur la VRAIE ligne `mnd_modeles_meta`, trois écrivains :
--   1. un Trône d'avant le 18 novembre note un modèle d'essai « approuvé »
--      dans l'ancienne forme (`modeles` en objet, sans liste) ;
--   2. une fonction `modeles-meta` d'avant relit chez Meta (la liste seule,
--      sans notes, un `lusLe` plus récent) ;
--   3. le Trône d'aujourd'hui retire la note (« à déposer ») : toutes ses
--      notes moins celle-là, avec la liste qu'il a lue.
-- CE QU'IL DIT, dans le message final « ESSAI 0236 : … » : après chacun, la
-- liste de Meta est toujours là et `rdv_a_confirmer` s'y lit APPROVED ; la
-- note d'essai est là après 1 et 2, partie après 3 ; TIENT, ou NE TIENT PAS
-- et pourquoi. Aucun nom de cliente : le document ne parle que de modèles.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  avant   jsonb;
  apres   jsonb;
  liste   jsonb;
  manque  text[] := array[]::text[];
  attente boolean;
  dit     text := '';
begin
  select d.data into avant from public.documents d where d.key = 'mnd_modeles_meta';
  if avant is null then
    raise exception 'ESSAI 0236 : NE TIENT PAS, la ligne mnd_modeles_meta est absente';
  end if;
  if not exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
                  where c.relname = 'documents' and t.tgname = 'modeles_meta_gardent_leurs_deux_formes' and not t.tgisinternal) then
    raise exception 'ESSAI 0236 : NE TIENT PAS, la garde n est pas posee (passez 0236 d abord)';
  end if;
  liste := case when jsonb_typeof(avant->'modeles') = 'array' then avant->'modeles' else '[]'::jsonb end;

  -- 1. L'ancien Trône note un modèle d'essai, dans l'ancienne forme.
  update public.documents set data = jsonb_build_object(
    'modeles', jsonb_build_object('essai_de_la_garde_0236', jsonb_build_object('etat', 'approuve', 'le', '2026-11-18T12:00:00.000Z', 'parQui', 'essai')),
    'parQui', 'essai', 'le', '2026-11-18T12:00:00.000Z')
  where key = 'mnd_modeles_meta';
  select d.data into apres from public.documents d where d.key = 'mnd_modeles_meta';
  attente := exists (select 1 from jsonb_array_elements(case when jsonb_typeof(apres->'modeles') = 'array' then apres->'modeles' else '[]'::jsonb end) m
                      where m->>'nom' = 'rdv_a_confirmer' and m->>'etat' = 'APPROVED');
  if not attente then manque := manque || 'apres 1, rdv_a_confirmer n est plus APPROVED'; end if;
  if coalesce(apres->'notes'->'essai_de_la_garde_0236'->>'etat', '') <> 'approuve' then manque := manque || 'apres 1, la note n est pas la'; end if;
  dit := dit || format('1: liste %s, attente %s, note %s ; ', jsonb_array_length(coalesce(apres->'modeles', '[]'::jsonb)), attente, apres->'notes'->'essai_de_la_garde_0236'->>'etat');

  -- 2. L'ancienne fonction relit chez Meta : la liste seule, plus récente.
  update public.documents set data = jsonb_build_object('lusLe', '2999-01-01T00:00:00.000Z', 'modeles', liste, 'version', 'essai 0236')
  where key = 'mnd_modeles_meta';
  select d.data into apres from public.documents d where d.key = 'mnd_modeles_meta';
  attente := exists (select 1 from jsonb_array_elements(case when jsonb_typeof(apres->'modeles') = 'array' then apres->'modeles' else '[]'::jsonb end) m
                      where m->>'nom' = 'rdv_a_confirmer' and m->>'etat' = 'APPROVED');
  if not attente then manque := manque || 'apres 2, rdv_a_confirmer n est plus APPROVED'; end if;
  if coalesce(apres->'notes'->'essai_de_la_garde_0236'->>'etat', '') <> 'approuve' then manque := manque || 'apres 2, la relecture a efface la note'; end if;
  dit := dit || format('2: liste %s, attente %s, note %s ; ', jsonb_array_length(coalesce(apres->'modeles', '[]'::jsonb)), attente, apres->'notes'->'essai_de_la_garde_0236'->>'etat');

  -- 3. Le Trône d'aujourd'hui retire la note : toutes ses notes moins celle-là, la liste lue.
  update public.documents set data = (apres - 'notes') || jsonb_build_object('notes', (apres->'notes') - 'essai_de_la_garde_0236', 'parQui', 'essai', 'le', '2026-11-18T12:05:00.000Z')
  where key = 'mnd_modeles_meta';
  select d.data into apres from public.documents d where d.key = 'mnd_modeles_meta';
  attente := exists (select 1 from jsonb_array_elements(case when jsonb_typeof(apres->'modeles') = 'array' then apres->'modeles' else '[]'::jsonb end) m
                      where m->>'nom' = 'rdv_a_confirmer' and m->>'etat' = 'APPROVED');
  if not attente then manque := manque || 'apres 3, rdv_a_confirmer n est plus APPROVED'; end if;
  if (apres->'notes'->'essai_de_la_garde_0236') is not null then manque := manque || 'apres 3, la note retiree est revenue'; end if;
  dit := dit || format('3: liste %s, attente %s, note %s', jsonb_array_length(coalesce(apres->'modeles', '[]'::jsonb)), attente, coalesce(apres->'notes'->'essai_de_la_garde_0236'->>'etat', 'retiree'));

  raise exception 'ESSAI 0236 : % (%). Tout est annule.',
    case when cardinality(manque) = 0 then 'TIENT' else 'NE TIENT PAS : ' || array_to_string(manque, ' ; ') end, dit;
end $$;
