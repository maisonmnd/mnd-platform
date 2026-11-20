-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC DE 0240 · LE PETIT SERVICE PARTAGE L'HEURE
-- 20 novembre 2026
--
-- À jouer APRÈS 0240, d'un seul tenant. Tout est ANNULÉ par l'exception
-- finale : aucune écriture ne reste. Sur un jour vide et lointain (mardi
-- 23 février 2027, une place en ligne : le Planning est vide), chez la
-- branche qui porte Team, la scène du 20 novembre rejouée par les VRAIES
-- fonctions de la base :
--   1. un lavage et une coiffure d'une heure à 17 h (tête lourde), posés au
--      comptoir ;
--   2. Opale pose une reprise de 2 h 30 (tête lourde) à 16 h : TIENT ;
--   3. une troisième venue à 17 h, sur les deux : refusée (deux au plus chez
--      Team) ;
--   4. le voisin de 17 h passe à 1 h 30 (deux grosses têtes) : 16 h refusée ;
--   5. un déplacement de 13 h à 16 h, à côté du petit service : TIENT ;
--   6. la reprise d'un rendez-vous à reprogrammer à 16 h : TIENT ;
--   7. le garde, pour une cliente connectée : 16 h acceptée à côté du petit
--      service, refusée à côté d'un soin d'une heure et demie.
-- Entre deux scènes, les rendez-vous d'essai s'annulent (un annulé ne prend
-- aucune place) : rien ne s'efface.
-- CE QU'IL DIT, dans le message final « ESSAI 0240 : … » : TIENT, ou NE
-- TIENT PAS et pourquoi. Aucun nom, aucun numéro : des rendez-vous d'essai.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  b      text;
  j      text := '2027-02-23';
  r      jsonb;
  vu     timestamptz;
  places int;
  dit    text := '';
  manque text[] := array[]::text[];
  rdv    jsonb;
begin
  select br.id into b from public.branches br
   where jsonb_typeof(br.data->'masters') = 'array' and br.data->'masters' ? 'Team'
   order by coalesce(br.data->>'flagship', '') = 'true' desc limit 1;
  if b is null then
    raise exception 'ESSAI 0240 : NE TIENT PAS, aucune branche ne porte Team';
  end if;
  if not exists (select 1 from pg_proc where proname = 'petit_service') then
    raise exception 'ESSAI 0240 : NE TIENT PAS, petit_service est absente (passez 0240 d abord)';
  end if;
  if exists (select 1 from public.appointments a where a.data->>'date' = j and a.data->>'branchId' = b) then
    raise exception 'ESSAI 0240 : NE TIENT PAS, le jour d essai % n est pas vide', j;
  end if;
  places := public.places_en_ligne(b, j::date);
  dit := dit || format('places du jour %s ; ', places);

  rdv := jsonb_build_object('branchId', b, 'date', j, 'master', 'Team', 'status', 'confirmé', 'clientId', '', 'serviceIds', '[]'::jsonb);

  -- 1. Le petit service de 17 h, posé au comptoir.
  insert into public.appointments (id, branch_id, data)
  values ('essai-0240-x', b, rdv || jsonb_build_object('id', 'essai-0240-x', 'time', '17:00', 'dureeMin', 60, 'locksAnnonces', '505', 'source', 'trone'));

  -- 2. Opale pose une reprise de 2 h 30 à 16 h.
  r := public.pose_si_libre(rdv || jsonb_build_object('id', 'rdv-essai-0240-a', 'time', '16:00', 'dureeMin', 150, 'locksAnnonces', '358', 'source', 'whatsapp', 'poseePar', 'Opale'), array['Team']);
  if coalesce(r->>'ok', '') <> 'true' or coalesce(r->>'master', '') <> 'Team' then manque := manque || ('2 refusee : ' || r::text); end if;
  dit := dit || format('2: %s ; ', r->>'ok');

  -- 3. Une troisième venue à 17 h, sur la reprise et le petit service : jamais
  --    trois chez Team.
  r := public.pose_si_libre(rdv || jsonb_build_object('id', 'rdv-essai-0240-b', 'time', '17:00', 'dureeMin', 60, 'source', 'whatsapp', 'poseePar', 'Opale'), array['Team']);
  if coalesce(r->>'ok', '') = 'true' then manque := manque || '3 : une troisieme chez Team a ete posee'::text; end if;
  dit := dit || format('3: %s %s ; ', r->>'ok', r->>'raison');
  update public.appointments set data = data || '{"status": "annulé"}'::jsonb where id in ('rdv-essai-0240-a', 'rdv-essai-0240-b');

  -- 4. Deux grosses têtes : le voisin passe à 1 h 30.
  update public.appointments set data = data || jsonb_build_object('dureeMin', 90) where id = 'essai-0240-x';
  r := public.pose_si_libre(rdv || jsonb_build_object('id', 'rdv-essai-0240-c', 'time', '16:00', 'dureeMin', 150, 'locksAnnonces', '358', 'source', 'whatsapp', 'poseePar', 'Opale'), array['Team']);
  if coalesce(r->>'ok', '') = 'true' then manque := manque || '4 : deux grosses tetes posees ensemble'::text; end if;
  dit := dit || format('4: %s %s ; ', r->>'ok', r->>'raison');
  update public.appointments set data = data || '{"status": "annulé"}'::jsonb where id = 'rdv-essai-0240-c';
  update public.appointments set data = data || jsonb_build_object('dureeMin', 60) where id = 'essai-0240-x';

  -- 5. Un déplacement de 13 h à 16 h, à côté du petit service.
  insert into public.appointments (id, branch_id, data)
  values ('essai-0240-y', b, rdv || jsonb_build_object('id', 'essai-0240-y', 'time', '13:00', 'dureeMin', 150, 'locksAnnonces', '358', 'source', 'trone'));
  select a.updated_at into vu from public.appointments a where a.id = 'essai-0240-y';
  r := public.deplace_si_libre('essai-0240-y', j, '16:00', vu, false);
  if coalesce(r->>'ok', '') <> 'true' then manque := manque || ('5 refuse : ' || r::text); end if;
  dit := dit || format('5: %s %s ; ', r->>'ok', coalesce(r->>'raison', ''));
  update public.appointments set data = data || '{"status": "annulé"}'::jsonb where id = 'essai-0240-y';

  -- 6. La reprise d'un rendez-vous à reprogrammer, à 16 h.
  insert into public.appointments (id, branch_id, data)
  values ('essai-0240-z', b, rdv || jsonb_build_object('id', 'essai-0240-z', 'time', '10:00', 'dureeMin', 150, 'locksAnnonces', '358', 'source', 'trone',
                                                        'status', 'annulé', 'aReprogrammerDepuis', public.abo_iso(now()), 'aReprogrammerPar', 'opale'));
  r := public.reprend_si_libre('essai-0240-z', j, '16:00', array['Team'], false, 'opale', null);
  if coalesce(r->>'ok', '') <> 'true' then manque := manque || ('6 refusee : ' || r::text); end if;
  dit := dit || format('6: %s %s ; ', r->>'ok', coalesce(r->>'raison', ''));
  update public.appointments set data = data || '{"status": "annulé"}'::jsonb where id = 'essai-0240-z';

  -- 7. Le garde, pour une cliente connectée (ni personnel, ni serveur).
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000000240', 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000240', true);
  if auth.uid() is null or public.is_staff() then
    manque := manque || '7 : la cliente d essai n est pas lue comme une cliente'::text;
  else
    begin
      insert into public.appointments (id, branch_id, data)
      values ('essai-0240-w', b, rdv || jsonb_build_object('id', 'essai-0240-w', 'time', '16:00', 'dureeMin', 150, 'locksAnnonces', '358', 'source', 'couronne'));
      dit := dit || '7a: acceptee ; ';
    exception when others then
      manque := manque || ('7a refusee : ' || sqlerrm);
    end;
    update public.appointments set data = data || '{"status": "annulé"}'::jsonb where id = 'essai-0240-w';
    update public.appointments set data = data || jsonb_build_object('dureeMin', 90) where id = 'essai-0240-x';
    begin
      insert into public.appointments (id, branch_id, data)
      values ('essai-0240-v', b, rdv || jsonb_build_object('id', 'essai-0240-v', 'time', '16:00', 'dureeMin', 150, 'locksAnnonces', '358', 'source', 'couronne'));
      manque := manque || '7b : deux grosses tetes acceptees par le garde'::text;
    exception when others then
      dit := dit || format('7b: refusee (%s)', sqlerrm);
    end;
  end if;

  raise exception 'ESSAI 0240 : % (%). Tout est annule.',
    case when cardinality(manque) = 0 then 'TIENT' else 'NE TIENT PAS : ' || array_to_string(manque, ' ; ') end, dit;
end $$;
