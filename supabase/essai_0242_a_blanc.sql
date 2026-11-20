-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC DE 0242 · UN PETIT SERVICE PARTAGE UNE PLACE, AVEC UN SEUL
-- VOISIN · 20 novembre 2026, au soir
--
-- À jouer APRÈS 0242, d'un seul tenant. Tout est ANNULÉ par l'exception
-- finale : aucune écriture ne reste. Sur un jour vide et lointain (mardi
-- 23 février 2027, une place en ligne), chez la branche qui porte Team :
--   1. la scène du 20 novembre : un lavage-coiffure d'une heure à 17 h, une
--      reprise de 2 h 30 à 16 h posée par Opale : TIENT (la paire prend une
--      place) ;
--   2. deux soins d'une heure et demie à 12 h 30 (Team et Expert), un
--      lavage d'une heure à 13 h : REFUSÉ (la paire et le second soin
--      prennent deux places ; 0240 le laissait passer) ;
--   3. le même lavage par le garde, pour une cliente connectée : refusé.
-- Entre deux scènes, les rendez-vous d'essai s'annulent (un annulé ne prend
-- aucune place) : rien ne s'efface. Aucun nom, aucun numéro.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  b      text;
  j      text := '2027-02-23';
  r      jsonb;
  places int;
  dit    text := '';
  manque text[] := array[]::text[];
  rdv    jsonb;
begin
  select br.id into b from public.branches br
   where jsonb_typeof(br.data->'masters') = 'array' and br.data->'masters' ? 'Team'
   order by coalesce(br.data->>'flagship', '') = 'true' desc limit 1;
  if b is null then
    raise exception 'ESSAI 0242 : NE TIENT PAS, aucune branche ne porte Team';
  end if;
  if not exists (select 1 from pg_proc where proname = 'places_prises') then
    raise exception 'ESSAI 0242 : NE TIENT PAS, places_prises est absente (passez 0242 d abord)';
  end if;
  if exists (select 1 from public.appointments a where a.data->>'date' = j and a.data->>'branchId' = b and coalesce(a.data->>'status', '') <> 'annulé') then
    raise exception 'ESSAI 0242 : NE TIENT PAS, le jour d essai % n est pas vide', j;
  end if;
  places := public.places_en_ligne(b, j::date);
  dit := dit || format('places du jour %s ; ', places);
  rdv := jsonb_build_object('branchId', b, 'date', j, 'master', 'Team', 'status', 'confirmé', 'clientId', '', 'serviceIds', '[]'::jsonb);

  -- 1. La scène du 20 novembre.
  insert into public.appointments (id, branch_id, data)
  values ('essai-0242-x', b, rdv || jsonb_build_object('id', 'essai-0242-x', 'time', '17:00', 'dureeMin', 60, 'locksAnnonces', '505', 'source', 'trone'));
  r := public.pose_si_libre(rdv || jsonb_build_object('id', 'rdv-essai-0242-a', 'time', '16:00', 'dureeMin', 150, 'locksAnnonces', '358', 'source', 'whatsapp', 'poseePar', 'Opale'), array['Team']);
  if coalesce(r->>'ok', '') <> 'true' then manque := manque || ('1 refusee : ' || r::text); end if;
  dit := dit || format('1: %s ; ', r->>'ok');
  update public.appointments set data = data || '{"status": "annulé"}'::jsonb where id in ('essai-0242-x', 'rdv-essai-0242-a');

  -- 2. Deux soins d'une heure et demie à 12 h 30, un lavage d'une heure à 13 h.
  insert into public.appointments (id, branch_id, data)
  values ('essai-0242-t', b, rdv || jsonb_build_object('id', 'essai-0242-t', 'time', '12:30', 'dureeMin', 90, 'source', 'trone')),
         ('essai-0242-e', b, rdv || jsonb_build_object('id', 'essai-0242-e', 'time', '12:30', 'dureeMin', 90, 'master', 'Expert', 'source', 'trone'));
  r := public.pose_si_libre(rdv || jsonb_build_object('id', 'rdv-essai-0242-b', 'time', '13:00', 'dureeMin', 60, 'source', 'whatsapp', 'poseePar', 'Opale'), array['Team']);
  if coalesce(r->>'ok', '') = 'true' then manque := manque || '2 : une troisieme cliente posee dans deux places pleines'::text; end if;
  dit := dit || format('2: %s %s ; ', r->>'ok', coalesce(r->>'raison', ''));

  -- 3. Le même lavage, par le garde, pour une cliente connectée.
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-8000-000000000242', 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000242', true);
  if auth.uid() is null or public.is_staff() then
    manque := manque || '3 : la cliente d essai n est pas lue comme une cliente'::text;
  else
    begin
      insert into public.appointments (id, branch_id, data)
      values ('essai-0242-w', b, rdv || jsonb_build_object('id', 'essai-0242-w', 'time', '13:00', 'dureeMin', 60, 'source', 'couronne'));
      manque := manque || '3 : le garde accepte une troisieme cliente'::text;
    exception when others then
      dit := dit || format('3: refusee (%s)', sqlerrm);
    end;
  end if;

  raise exception 'ESSAI 0242 : % (%). Tout est annule.',
    case when cardinality(manque) = 0 then 'TIENT' else 'NE TIENT PAS : ' || array_to_string(manque, ' ; ') end, dit;
end $$;
