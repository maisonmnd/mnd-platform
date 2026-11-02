-- ═══════════════════════════════════════════════════════════════════════════
-- 0152 · LE SECOND FAUTEUIL EN LIGNE, DU MARDI AU VENDREDI — 2 novembre 2026
--
-- « Remplir les fauteuils » (maquette validée, « construis ») : du 7 septembre
-- au 1er novembre 2026, les deux fauteuils sont occupés 22 % du temps le
-- mardi, 11 % le mercredi, 19 % le jeudi, 25 % le vendredi, 56 % le samedi.
-- En ligne, un rituel posé à 14 h fermait 14 h même quand le second fauteuil
-- était libre (0140, une seule réservation en ligne à la fois).
--
-- L'ARBITRAGE DE YÉMAN, le 2 novembre 2026 : du mardi au vendredi, les jours
-- où le planning de l'équipe met DEUX personnes au fauteuil, une porte en
-- ligne (Ma Couronne, le site) peut prendre le second fauteuil. Le samedi
-- garde un fauteuil en ligne, le second au comptoir. Sans planning à deux ce
-- jour-là, la règle de 0140 revient seule. Jamais plus que les fauteuils de
-- la branche. Le comptoir garde la main : le personnel pose ce qu'il veut.
--
--   1. `places_en_ligne(branche, jour)` : LA SOURCE UNIQUE. Elle lit le
--      planning (`documents.mnd_planning`, écrit par la direction, 0130) et
--      les fauteuils de la branche (`branches.data.seats`) ; elle rend 1 ou 2,
--      rien d'autre. Réservée au serveur : les fonctions ci-dessous la lisent
--      en propriétaire.
--   2. `places_en_ligne_du(branche, début, fin)` : la même, jour par jour,
--      pour les portes clientes (anon, authenticated). Elle rend (jour,
--      places) et RIEN d'autre : aucun nom, aucun identifiant de l'équipe,
--      aucun statut du planning.
--   3. `pose_si_libre` (le site, WhatsApp, l'Assistant Maison) : `sieges := 1`
--      devient les places du jour du rendez-vous. Le reste du verrou est celui
--      de 0140, mot pour mot (la définition EN LIGNE, relue le 2 novembre 2026,
--      est identique au texte de 0140). Les maîtres restent jugés un par un :
--      le second fauteuil s'ouvre, il ne se double pas, et un SÍNSIN n'y est
--      proposé qu'avec Team (`p_maitres`, place-du-serveur).
--   4. `une_place_en_ligne` (le garde des écritures des clientes, Ma
--      Couronne) : un rituel ne chevauche jamais plus de rituels que les
--      places du jour n'en laissent ; et sur le second fauteuil, jamais le
--      maître déjà au fauteuil à cette heure, jamais un SÍNSIN hors de Team.
--      Avec une place, la règle de 0140 est inchangée : tout chevauchement
--      refuse.
--
-- Le planning : `semaines` par lundi (« AAAA-MM-JJ »), puis par fiche, sept
-- cases lundi d'abord ; `modele` est la semaine type. Une case vide passe au
-- modèle (la règle de `statutDuJour`, src/shared/rh-pur.ts). Seule compte une
-- fiche de `team` de CETTE branche, pas encore partie ce jour-là
-- (`archiveeLe`). Le miroir TypeScript est `placesEnLigneDuJour`
-- (src/shared/agenda-pur.ts) ; le banc `verifie-le-second-fauteuil` les
-- confronte.
--
-- WhatsApp garde ses PROPOSITIONS à une place (place-du-serveur, inchangé) ;
-- la base, elle, autorise la seconde à qui la demande.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. LES PLACES EN LIGNE D'UN JOUR : LA SOURCE UNIQUE ──────────────────
create or replace function public.places_en_ligne(p_branch text, p_date date)
returns int
language sql stable security definer set search_path = public as $$
  with le_jour as (
    -- Lundi = 0 … dimanche = 6, comme les cases du planning.
    select extract(isodow from p_date)::int - 1 as i,
           to_char(p_date - (extract(isodow from p_date)::int - 1), 'YYYY-MM-DD') as lundi,
           to_char(p_date, 'YYYY-MM-DD') as iso
  ),
  le_planning as (
    select coalesce((select d.data from public.documents d where d.key = 'mnd_planning'), '{}'::jsonb) as p
  ),
  au_fauteuil as (
    -- Les fiches de la branche, présentes ce jour-là, « fauteuil » au planning :
    -- la case de la semaine si elle est écrite, sinon celle du modèle. Ce qui
    -- n'est pas une liste de textes ne se lit pas.
    select count(*)::int as n
      from public.team t
      cross join le_jour j
      cross join le_planning pl
      cross join lateral (
        select pl.p -> 'semaines' -> j.lundi -> t.id as semaine,
               pl.p -> 'modele' -> t.id as modele
      ) c
     where coalesce(nullif(t.data ->> 'branchId', ''), t.branch_id, '') = p_branch
       and (coalesce(t.data ->> 'archiveeLe', '') = ''
            or (t.data ->> 'archiveeLe') collate "C" > j.iso collate "C")
       and coalesce(
             nullif(case when jsonb_typeof(c.semaine) = 'array' and jsonb_typeof(c.semaine -> j.i) = 'string'
                         then c.semaine ->> j.i end, ''),
             nullif(case when jsonb_typeof(c.modele) = 'array' and jsonb_typeof(c.modele -> j.i) = 'string'
                         then c.modele ->> j.i end, '')
           ) = 'fauteuil'
  ),
  les_fauteuils as (
    -- Les fauteuils de la branche, lus comme le verrou les lisait (0125).
    select coalesce((
      select case when btrim(coalesce(b.data ->> 'seats', '')) ~ '^\d{1,4}(\.\d+)?$'
                  then floor(btrim(b.data ->> 'seats')::numeric)::int else 0 end
        from public.branches b
       where b.id = p_branch), 0) as n
  )
  select case
           when p_branch is null or p_date is null then 1
           -- Le second fauteuil : mardi (1) à vendredi (4), deux au fauteuil,
           -- deux fauteuils au moins. Jamais un troisième : un autre arbitrage.
           when (select i from le_jour) between 1 and 4
            and (select n from au_fauteuil) >= 2
            and (select n from les_fauteuils) >= 2
           then 2
           -- Le samedi, sans planning à deux, ou une branche à un fauteuil.
           else 1
         end
$$;

revoke all on function public.places_en_ligne(text, date) from public, anon, authenticated;
grant execute on function public.places_en_ligne(text, date) to service_role;


-- ── 2. LA MÊME, JOUR PAR JOUR, POUR LES PORTES CLIENTES ──────────────────
-- Quatre cents jours au plus : Ma Couronne lit six mois d'un coup (un cycle
-- se pose loin devant), une fenêtre plus large ne rend rien de plus.
create or replace function public.places_en_ligne_du(p_branch text, p_debut date, p_fin date)
returns table (jour text, places int)
language sql stable security definer set search_path = public as $$
  select to_char(d::date, 'YYYY-MM-DD'), public.places_en_ligne(p_branch, d::date)
    from generate_series(p_debut::timestamp, least(p_fin, p_debut + 399)::timestamp, interval '1 day') d
   where p_branch is not null and p_debut is not null and p_fin is not null
   order by 1
$$;

revoke all on function public.places_en_ligne_du(text, date, date) from public;
grant execute on function public.places_en_ligne_du(text, date, date) to anon, authenticated, service_role;


-- ── 3. LE VERROU DU SITE ET DE WHATSAPP : LES PLACES DU JOUR ─────────────
create or replace function public.pose_si_libre(
  p_rdv     jsonb,
  p_maitres text[],
  p_demande jsonb default null,
  p_envoi   jsonb default null
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  rdv_id     text := btrim(coalesce(p_rdv->>'id', ''));
  branche    text := btrim(coalesce(p_rdv->>'branchId', ''));
  jour       text := coalesce(p_rdv->>'date', '');
  heure      text := coalesce(p_rdv->>'time', '');
  cid        text := btrim(coalesce(p_rdv->>'clientId', ''));
  num        text := public.numero_wa(coalesce(p_demande->>'telephone', p_envoi->>'numero', ''));
  aujourdhui text := to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD');
  dans90     text := to_char((now() at time zone 'Africa/Porto-Novo') + interval '90 days', 'YYYY-MM-DD');
  debut      int;
  duree      int;
  cap_maison int;
  cap_maitre int;
  sieges     int;
  maitres    text[] := coalesce(p_maitres, array[]::text[]);
  m          text;
  choisi     text;
  deja       record;
begin
  if p_rdv is null or jsonb_typeof(p_rdv) <> 'object'
     or rdv_id !~ '^rdv-' or branche = ''
     or jour !~ '^\d{4}-\d{2}-\d{2}$' or heure !~ '^\d{2}:\d{2}$'
     or coalesce(p_rdv->>'status', '') not in ('confirmé', 'en attente') then
    return jsonb_build_object('ok', false, 'raison', 'creneau_invalide');
  end if;
  -- Jamais le jour même, jamais au-delà de 90 jours, comptés à Cotonou.
  if jour <= aujourdhui or jour > dans90 then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_fenetre');
  end if;
  debut := public.minutes_de_l_heure(heure);
  duree := public.duree_du_rdv(p_rdv);

  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || jour));

  -- LA MÊME POSE, REJOUÉE (une seconde livraison de Meta) : rien de plus.
  select a.id, coalesce(a.data->>'master', '') as maitre into deja
    from public.appointments a
   where a.id = rdv_id;
  if found then
    return jsonb_build_object('ok', true, 'verdict', 'deja', 'id', deja.id, 'master', deja.maitre);
  end if;

  -- LA MÊME PERSONNE, DÉJÀ À CETTE PLACE : la fiche, ou pour une inconnue
  -- son numéro (sa demande, ou une fiche qui le porte). Une autre fiche du
  -- même numéro (son enfant) peut venir à la même heure.
  select a.id, coalesce(a.data->>'master', '') as maitre into deja
    from public.appointments a
   where a.data->>'branchId' = branche
     and a.data->>'date' = jour
     and a.data->>'time' = heure
     and coalesce(a.data->>'status', '') <> 'annulé'
     and ((cid <> '' and a.data->>'clientId' = cid)
       or (cid = '' and length(num) >= 8 and (
             exists (select 1 from public.demandes d
                      where d.data->>'apptId' = a.id
                        and public.numero_wa(d.data->>'telephone') = num)
          or exists (select 1 from public.clients c
                      where c.id = a.data->>'clientId'
                        and (public.numero_wa(c.data->>'phone') = num
                             or public.numero_wa(c.data->>'phone2') = num)))))
   limit 1;
  if found then
    return jsonb_build_object('ok', true, 'verdict', 'deja_pose', 'id', deja.id, 'master', deja.maitre);
  end if;

  select case when btrim(coalesce(d.data->>'maxRdvParJourMaison', '')) ~ '^\d{1,4}(\.\d+)?$'
              then floor(btrim(d.data->>'maxRdvParJourMaison')::numeric)::int else 0 end,
         case when btrim(coalesce(d.data->>'maxRdvParJourMaitre', '')) ~ '^\d{1,4}(\.\d+)?$'
              then floor(btrim(d.data->>'maxRdvParJourMaitre')::numeric)::int else 0 end
    into cap_maison, cap_maitre
    from public.documents d
   where d.key = 'mnd_settings';
  cap_maison := coalesce(cap_maison, 0);
  cap_maitre := coalesce(cap_maitre, 0);

  -- LE SECOND FAUTEUIL EN LIGNE (0152, 2 novembre 2026) : ce verrou ne sert
  -- que les portes en ligne. Un rituel n'y chevauche jamais plus de rituels
  -- que les places du jour n'en laissent : une le samedi et sans planning à
  -- deux (la règle de 0140), deux du mardi au vendredi quand deux personnes
  -- sont au fauteuil. Une date qui ne se lit pas garde une place.
  begin
    sieges := public.places_en_ligne(branche, jour::date);
  exception when others then
    sieges := null;
  end;
  sieges := greatest(1, coalesce(sieges, 1));

  -- LE PLAFOND DE LA MAISON : ses rendez-vous du jour, tous maîtres confondus
  -- (la règle de `creneauxLibres`, agenda-pur). 0 = illimité.
  if cap_maison > 0 and (
       select count(*) from public.appointments a
        where a.data->>'branchId' = branche
          and a.data->>'date' = jour
          and coalesce(a.data->>'status', '') <> 'annulé'
          and coalesce(a.data->>'time', '') <> ''
     ) >= cap_maison then
    return jsonb_build_object('ok', false, 'raison', 'creneau_plafond');
  end if;

  -- LES FAUTEUILS : les rituels qui chevauchent cette heure, tous maîtres
  -- confondus. Le maître peut être libre, la Maison pleine. 0 = illimité.
  if sieges > 0 and (
       select count(*) from public.appointments a
        where a.data->>'branchId' = branche
          and a.data->>'date' = jour
          and coalesce(a.data->>'status', '') <> 'annulé'
          and public.minutes_de_l_heure(a.data->>'time') is not null
          and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
          and debut + duree > public.minutes_de_l_heure(a.data->>'time')
     ) >= sieges then
    return jsonb_build_object('ok', false, 'raison', 'creneau_pris', 'detail', 'fauteuils');
  end if;

  -- LE PREMIER MAÎTRE ENCORE LIBRE, dans l'ordre donné. Sans maître donné,
  -- le libellé vide, comme une branche qui n'en déclare aucun.
  if cardinality(maitres) = 0 then
    maitres := array[''];
  end if;
  foreach m in array maitres loop
    m := coalesce(m, '');
    if cap_maitre > 0 and (
         select count(*) from public.appointments a
          where a.data->>'branchId' = branche
            and a.data->>'date' = jour
            and coalesce(a.data->>'status', '') <> 'annulé'
            and coalesce(a.data->>'time', '') <> ''
            and coalesce(a.data->>'master', '') = m
       ) >= cap_maitre then
      continue;
    end if;
    if not exists (
         select 1 from public.appointments a
          where a.data->>'branchId' = branche
            and a.data->>'date' = jour
            and coalesce(a.data->>'status', '') <> 'annulé'
            and coalesce(a.data->>'master', '') = m
            and public.minutes_de_l_heure(a.data->>'time') is not null
            and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
            and debut + duree > public.minutes_de_l_heure(a.data->>'time')
       ) then
      choisi := m;
      exit;
    end if;
  end loop;
  if choisi is null then
    return jsonb_build_object('ok', false, 'raison', 'creneau_pris');
  end if;

  -- ÉCRIRE, TOUT ENSEMBLE. La durée est figée sur le rendez-vous.
  insert into public.appointments (id, branch_id, data)
  values (rdv_id, branche,
          p_rdv || jsonb_build_object('id', rdv_id, 'branchId', branche, 'master', choisi, 'dureeMin', duree));

  if p_demande is not null and jsonb_typeof(p_demande) = 'object' and btrim(coalesce(p_demande->>'id', '')) <> '' then
    insert into public.demandes (id, genre, branch_id, data)
    values (btrim(p_demande->>'id'),
            case when p_demande->>'genre' = 'prospect' then 'prospect' else 'rdv' end,
            coalesce(nullif(p_demande->>'branchId', ''), branche),
            p_demande || jsonb_build_object('id', btrim(p_demande->>'id'), 'apptId', rdv_id))
    on conflict (id) do nothing;
  end if;

  -- LA LIGNE D'ENVOI VERROUILLE `confirmation-rdv` (statut « en cours ») :
  -- le modèle payant ne part pas en double de la confirmation dite dans la
  -- conversation. Son identifiant est toujours conf-<rdv>-whatsapp.
  if p_envoi is not null and jsonb_typeof(p_envoi) = 'object' then
    insert into public.envois (id, branch_id, data)
    values ('conf-' || rdv_id || '-whatsapp',
            coalesce(nullif(p_envoi->>'branchId', ''), branche),
            p_envoi || jsonb_build_object('id', 'conf-' || rdv_id || '-whatsapp', 'apptId', rdv_id))
    on conflict (id) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'verdict', 'pose', 'id', rdv_id, 'master', choisi, 'dureeMin', duree);
end $$;

revoke all on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) to service_role;


-- ── 4. LE GARDE DES RÉSERVATIONS DES CLIENTES : LES PLACES DU JOUR ───────
create or replace function public.une_place_en_ligne() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  branche     text := btrim(coalesce(new.data->>'branchId', new.branch_id, ''));
  jour        text := coalesce(new.data->>'date', '');
  debut       int  := public.minutes_de_l_heure(new.data->>'time');
  maitre      text := coalesce(new.data->>'master', '');
  duree       int;
  places      int;
  dessous     int;
  meme_maitre boolean;
begin
  -- Le personnel (le Trône) pose à la main ce qu'il veut ; le serveur
  -- (sans session) juge déjà sous verrou, dans `pose_si_libre`.
  if auth.uid() is null or public.is_staff() then
    return new;
  end if;
  -- Un rituel annulé, ou sans heure, ne prend aucune place.
  if coalesce(new.data->>'status', '') = 'annulé' or debut is null or branche = '' or jour = '' then
    return new;
  end if;
  -- Une écriture qui ne change ni le jour ni l'heure d'un rituel vivant
  -- (une note, une annulation, une synchronisation) ne se rejuge pas.
  if tg_op = 'UPDATE'
     and coalesce(old.data->>'date', '') = jour
     and coalesce(old.data->>'time', '') = coalesce(new.data->>'time', '')
     and coalesce(old.data->>'status', '') <> 'annulé' then
    return new;
  end if;
  duree := public.duree_du_rdv(new.data);
  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || jour));

  -- LES PLACES DU JOUR (0152, 2 novembre 2026) : une, ou deux du mardi au
  -- vendredi quand le planning met deux personnes au fauteuil. Une date qui
  -- ne se lit pas garde une place, la règle de 0140.
  begin
    places := public.places_en_ligne(branche, jour::date);
  exception when others then
    places := null;
  end;
  places := greatest(1, coalesce(places, 1));

  -- Les rituels non annulés qui chevauchent cette heure, sauf lui-même ; et
  -- parmi eux, un du même maître (le libellé vide compte comme un maître).
  select count(*)::int, coalesce(bool_or(coalesce(a.data->>'master', '') = maitre), false)
    into dessous, meme_maitre
    from public.appointments a
   where a.id <> new.id
     and a.data->>'branchId' = branche
     and a.data->>'date' = jour
     and coalesce(a.data->>'status', '') <> 'annulé'
     and public.minutes_de_l_heure(a.data->>'time') is not null
     and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
     and debut + duree > public.minutes_de_l_heure(a.data->>'time');

  if dessous >= places then
    raise exception 'creneau_pris'
      using errcode = 'P0001',
            hint = 'Les places en ligne de cette heure sont prises : un rituel déjà inscrit la chevauche.';
  end if;

  -- LE SECOND FAUTEUIL S'OUVRE, IL NE SE DOUBLE PAS : jamais le maître déjà
  -- au fauteuil à cette heure.
  if dessous > 0 and meme_maitre then
    raise exception 'creneau_pris'
      using errcode = 'P0001',
            hint = 'Ce maître est déjà au fauteuil à cette heure : le second fauteuil va à l''autre.';
  end if;

  -- LES SÍNSIN CHEZ TEAM (24 octobre 2026), sur le second fauteuil aussi :
  -- un rituel qui porte un SÍNSIN (reconnu à son nom, accents confondus,
  -- comme `estUnSinsin`) ne prend la seconde place qu'avec Team, quand la
  -- branche porte Team.
  if dessous > 0 and maitre <> 'Team'
     and exists (
       select 1 from public.catalog_services s
        where s.id in (select jsonb_array_elements_text(
                         case when jsonb_typeof(new.data->'serviceIds') = 'array'
                              then new.data->'serviceIds' else '[]'::jsonb end))
          and lower(translate(coalesce(s.data->>'name', ''), 'ÍÌÎÏíìîïÑñ', 'IIIIiiiiNn')) like '%sinsin%')
     and exists (
       select 1 from public.branches b
        where b.id = branche
          and jsonb_typeof(b.data->'masters') = 'array'
          and b.data->'masters' ? 'Team') then
    raise exception 'creneau_pris'
      using errcode = 'P0001',
            hint = 'Un SÍNSIN va chez Team : le second fauteuil de cette heure n''est pas le sien.';
  end if;
  return new;
end $$;

revoke all on function public.une_place_en_ligne() from public, anon, authenticated;

-- Le déclencheur de 0140 reste posé : il appelle la fonction par son nom.


-- ── Contrôle ───────────────────────────────────────────────────────────────
-- Huit « oui » attendus : le verrou et le garde au jour, le déclencheur, la
-- porte des clientes ouverte et le jour gardé au serveur, la porte qui ne
-- rend que deux colonnes, jamais plus de deux places, et le samedi à une.
select
  (select position('sieges := 1;' in pg_get_functiondef('public.pose_si_libre(jsonb, text[], jsonb, jsonb)'::regprocedure)) = 0
      and position('public.places_en_ligne(branche, jour::date)' in pg_get_functiondef('public.pose_si_libre(jsonb, text[], jsonb, jsonb)'::regprocedure)) > 0) as verrou_au_jour,
  (select position('public.places_en_ligne(branche, jour::date)' in pg_get_functiondef('public.une_place_en_ligne()'::regprocedure)) > 0) as garde_au_jour,
  (select count(*) from pg_trigger where tgname = 'une_place_en_ligne' and not tgisinternal) = 1 as declencheur_pose,
  has_function_privilege('anon', 'public.places_en_ligne_du(text, date, date)', 'execute') as porte_des_clientes,
  not has_function_privilege('anon', 'public.places_en_ligne(text, date)', 'execute') as jour_au_serveur,
  (select pg_get_function_result('public.places_en_ligne_du(text, date, date)'::regprocedure) = 'TABLE(jour text, places integer)') as deux_colonnes,
  (select coalesce(bool_and(p.places between 1 and 2), true)
     from public.branches b, public.places_en_ligne_du(b.id, current_date, current_date + 120) p) as jamais_plus_de_deux,
  (select coalesce(bool_and(p.places = 1), true)
     from public.branches b, public.places_en_ligne_du(b.id, current_date, current_date + 120) p
    where extract(isodow from p.jour::date) not between 2 and 5) as samedi_a_un;
