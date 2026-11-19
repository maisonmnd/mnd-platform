-- ═══════════════════════════════════════════════════════════════════════════
-- 0239 · À REPROGRAMMER, ET JAMAIS SANS RENDEZ-VOUS · 19 novembre 2026
--
-- « Quand elle a déjà dit qu'elle a une contrainte… il ne peut plus rester en
-- confirmé en attendant une nouvelle date, ni annuler, mais il faut libérer
-- la place » ; « Il ne faut pas la laisser sans rendez-vous. Il faut tout
-- faire pour l'accommoder » (Yéman). Maquette 7YX7UtCFusPMJdrjJtfcQr.
--
-- Un rendez-vous À REPROGRAMMER porte le statut technique « annulé » et la
-- marque `aReprogrammerDepuis` (le précédent de `placeLibereeLe`) : sa place
-- est rendue partout sans rien changer d'autre. Ce lot ajoute :
--   · `reprend_si_libre` : la reprise sous verrou, à une nouvelle date (le
--     toucher d'un bouton d'Opale), avec la règle des places, ou au-delà des
--     fauteuils (`p_au_dela`) quand rien n'est libre dans l'heure ;
--   · `pose_si_libre` : une pose d'Opale marquée `auDelaDesPlaces` passe les
--     plafonds et les fauteuils, jamais deux têtes lourdes chez Team. Le reste
--     est 0238 mot pour mot.
-- Fermées aux clientes (service_role seul).
--
-- Rejouable : `create or replace`.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

create or replace function public.pose_si_libre(p_rdv jsonb, p_maitres text[], p_demande jsonb DEFAULT NULL::jsonb, p_envoi jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rdv_id     text := btrim(coalesce(p_rdv->>'id', ''));
  branche    text := btrim(coalesce(p_rdv->>'branchId', ''));
  jour       text := coalesce(p_rdv->>'date', '');
  heure      text := coalesce(p_rdv->>'time', '');
  cid        text := btrim(coalesce(p_rdv->>'clientId', ''));
  num        text := public.numero_wa(coalesce(p_demande->>'telephone', p_envoi->>'numero', ''));
  -- LA CLÉ DU NUMÉRO QUI POSE (0222) : écrite par demande-submit sur le
  -- rendez-vous du site ; vide pour les autres portes, qui n'ont pas de plafond.
  cle        text := btrim(coalesce(p_rdv->>'cleDuNumero', ''));
  aujourdhui text := to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD');
  borne      text := to_char(date_trunc('month', now() at time zone 'Africa/Porto-Novo') + interval '4 months' - interval '1 day', 'YYYY-MM-DD');
  debut      int;
  duree      int;
  cap_maison int;
  cap_maitre int;
  sieges     int;
  maitres    text[] := coalesce(p_maitres, array[]::text[]);
  m          text;
  choisi     text;
  deja       record;
  poses_du_jour int;
  en_attente    int;
  -- DEUX TÊTES CHEZ TEAM (0238) : la venue, et ce que Team tient déjà à cette heure.
  lourde_venue    boolean := public.tete_lourde(p_rdv);
  chez_lui        int;
  lourde_chez_lui boolean;
  partage         text;
  -- ELLE NE REPART JAMAIS SANS RENDEZ-VOUS (0239) : une pose d'Opale marquée
  -- « au-delà des fauteuils » passe les plafonds et les fauteuils ; jamais
  -- deux têtes lourdes ensemble chez Team.
  au_dela         boolean := coalesce(p_rdv->>'auDelaDesPlaces', '') = 'true'
                             and coalesce(p_rdv->>'source', '') = 'whatsapp'
                             and coalesce(p_rdv->>'poseePar', '') = 'Opale';
begin
  if p_rdv is null or jsonb_typeof(p_rdv) <> 'object'
     or rdv_id !~ '^rdv-' or branche = ''
     or jour !~ '^\d{4}-\d{2}-\d{2}$' or heure !~ '^\d{2}:\d{2}$'
     or coalesce(p_rdv->>'status', '') not in ('confirmé', 'en attente') then
    return jsonb_build_object('ok', false, 'raison', 'creneau_invalide');
  end if;
  -- Jamais après le dernier jour du troisième mois qui suit (ce mois et les
  -- trois suivants), comptés à Cotonou. Jamais le jour même, SAUF pour le site
  -- (source 'site', 0203) et pour Ma Couronne (source 'couronne', 0222 : elle
  -- propose le jour même depuis toujours, et pose désormais par ce verrou), à
  -- une heure pas encore commencée à Porto-Novo ; et pour Opale sur WhatsApp
  -- (source 'whatsapp', poseePar 'Opale', 0213, gardée telle quelle) à une
  -- heure qui commence dans vingt-cinq minutes au moins.
  if jour < aujourdhui or jour > borne
     or (jour = aujourdhui and not (
           (coalesce(p_rdv->>'source', '') in ('site', 'couronne')
            and coalesce(public.minutes_de_l_heure(heure), -1)
                > (extract(hour from now() at time zone 'Africa/Porto-Novo') * 60
                   + extract(minute from now() at time zone 'Africa/Porto-Novo'))::int)
           or (coalesce(p_rdv->>'source', '') = 'whatsapp'
            and coalesce(p_rdv->>'poseePar', '') = 'Opale'
            and coalesce(public.minutes_de_l_heure(heure), -1)
                >= (extract(hour from now() at time zone 'Africa/Porto-Novo') * 60
                    + extract(minute from now() at time zone 'Africa/Porto-Novo'))::int + 25))) then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_fenetre');
  end if;
  debut := public.minutes_de_l_heure(heure);
  -- LE PREMIER RENDEZ-VOUS DU JOUR, 08:30 (0222) : aucune porte en ligne ne
  -- pose avant, quoi que dise l'écran qui appelle (PREMIER_RENDEZ_VOUS_MIN).
  if debut is null or debut < 510 then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_ouverture');
  end if;
  duree := public.duree_du_rdv(p_rdv);

  -- LE VERROU DU NUMÉRO D'ABORD (0222), puis celui du jour : toujours dans cet
  -- ordre, deux poses du même numéro sur deux jours ne se croisent pas.
  if cle <> '' then
    perform pg_advisory_xact_lock(hashtext('pose-numero'), hashtext(cle));
  end if;
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

  -- LE PLAFOND D'UN NUMÉRO (0222) : cinq places posées en vingt-quatre
  -- heures, confirmées ou non ; trois tenues sans son oui, quand celle-ci
  -- naît en attente. Les mêmes nombres que rendez-vous-en-attente-pur
  -- (POSES_PAR_NUMERO_ET_PAR_JOUR, EN_ATTENTE_PAR_NUMERO).
  if cle <> '' then
    select count(*) filter (where a.data->>'creeLe' >= public.abo_iso(now() - interval '24 hours')),
           count(*) filter (where public.rdv_en_attente(a.data) and a.data->>'attenduJusquAu' > public.abo_iso(now()))
      into poses_du_jour, en_attente
      from public.appointments a
     where a.data->>'cleDuNumero' = cle;
    if coalesce(poses_du_jour, 0) >= 5 then
      return jsonb_build_object('ok', false, 'raison', 'trop_de_demandes');
    end if;
    if btrim(coalesce(p_rdv->>'attenduJusquAu', '')) <> '' and coalesce(en_attente, 0) >= 3 then
      return jsonb_build_object('ok', false, 'raison', 'trop_en_attente');
    end if;
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
  if not au_dela and cap_maison > 0 and (
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
  if not au_dela and sieges > 0 and (
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
  -- DEUX TÊTES CHEZ TEAM (0238) : un maître seul à cette heure d'abord ;
  -- sinon Team, qui reçoit une seconde tête quand l'une des deux est sous
  -- 150 locks (`bloqueLaVenue`, DEUX_TETES_AU_PLUS, agenda-pur).
  if cardinality(maitres) = 0 then
    maitres := array[''];
  end if;
  foreach m in array maitres loop
    m := coalesce(m, '');
    if au_dela then
      select coalesce(bool_or(public.tete_lourde(a.data)), false)
        into lourde_chez_lui
        from public.appointments a
       where a.data->>'branchId' = branche
         and a.data->>'date' = jour
         and coalesce(a.data->>'status', '') <> 'annulé'
         and coalesce(a.data->>'master', '') = m
         and public.minutes_de_l_heure(a.data->>'time') is not null
         and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
         and debut + duree > public.minutes_de_l_heure(a.data->>'time');
      if not (m = 'Team' and lourde_venue and lourde_chez_lui) then
        choisi := m;
        exit;
      end if;
      continue;
    end if;
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
    select count(*)::int, coalesce(bool_or(public.tete_lourde(a.data)), false)
      into chez_lui, lourde_chez_lui
      from public.appointments a
     where a.data->>'branchId' = branche
       and a.data->>'date' = jour
       and coalesce(a.data->>'status', '') <> 'annulé'
       and coalesce(a.data->>'master', '') = m
       and public.minutes_de_l_heure(a.data->>'time') is not null
       and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
       and debut + duree > public.minutes_de_l_heure(a.data->>'time');
    if chez_lui = 0 then
      choisi := m;
      exit;
    end if;
    if partage is null and m = 'Team' and chez_lui < 2 and not (lourde_venue and lourde_chez_lui) then
      partage := m;
    end if;
  end loop;
  choisi := coalesce(choisi, partage);
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
end $function$;

-- LA REPRISE D'UN RENDEZ-VOUS À REPROGRAMMER, SOUS VERROU. Le même verrou que
-- la pose et le garde, par maison et par jour d'arrivée. Le rendez-vous doit
-- être à reprogrammer (statut technique « annulé » et sa marque) ; il reprend
-- la date, l'heure et le maître, redevient confirmé, et ses marques de report
-- tombent. Sans `p_au_dela`, la règle des places (plafonds, fauteuils, deux
-- têtes chez Team, un maître seul d'abord) ; avec, au-delà des fauteuils,
-- chez le premier maître donné qui ne mettrait pas deux têtes lourdes ensemble
-- chez Team ; la note le dit à l'équipe.
create or replace function public.reprend_si_libre(
  p_id text, p_date text, p_time text, p_maitres text[], p_au_dela boolean, p_par text, p_vu timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rdv        record;
  d          jsonb;
  branche    text;
  aujourdhui text := to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD');
  borne      text := to_char(date_trunc('month', now() at time zone 'Africa/Porto-Novo') + interval '4 months' - interval '1 day', 'YYYY-MM-DD');
  maintenant text := public.abo_iso(now());
  debut      int;
  duree      int;
  cap_maison int;
  cap_maitre int;
  sieges     int;
  maitres    text[] := coalesce(p_maitres, array[]::text[]);
  au_dela    boolean := coalesce(p_au_dela, false);
  m          text;
  choisi     text;
  partage    text;
  chez_lui        int;
  lourde_chez_lui boolean;
  lourde_venue    boolean;
begin
  if btrim(coalesce(p_id, '')) = ''
     or coalesce(p_date, '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_time, '') !~ '^\d{2}:\d{2}$' then
    return jsonb_build_object('ok', false, 'raison', 'creneau_invalide');
  end if;
  select a.id, a.branch_id, a.data into rdv from public.appointments a where a.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'introuvable');
  end if;
  branche := btrim(coalesce(nullif(rdv.data->>'branchId', ''), rdv.branch_id, ''));

  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || p_date));
  select a.id, a.data, a.updated_at into rdv from public.appointments a where a.id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'introuvable');
  end if;
  if p_vu is not null and rdv.updated_at is distinct from p_vu then
    return jsonb_build_object('ok', false, 'raison', 'modifie');
  end if;
  d := rdv.data;

  -- UN SECOND TOUCHER : déjà repris à cette place, rien de plus.
  if coalesce(d->>'status', '') in ('confirmé', 'en attente')
     and coalesce(d->>'date', '') = p_date and coalesce(d->>'time', '') = p_time then
    return jsonb_build_object('ok', true, 'verdict', 'deja', 'master', coalesce(d->>'master', ''));
  end if;
  if not (coalesce(d->>'status', '') = 'annulé' and btrim(coalesce(d->>'aReprogrammerDepuis', '')) <> '') then
    return jsonb_build_object('ok', false, 'raison', 'pas_a_reprogrammer');
  end if;

  -- La fenêtre : jamais avant 08:30 ; le jour même, une heure qui commence
  -- dans vingt-cinq minutes au moins (la règle d'Opale, 0213) ; jusqu'au
  -- dernier jour du troisième mois qui suit.
  debut := public.minutes_de_l_heure(p_time);
  if debut is null or debut < 510 then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_ouverture');
  end if;
  if p_date < aujourdhui or p_date > borne
     or (p_date = aujourdhui and debut < (extract(hour from now() at time zone 'Africa/Porto-Novo') * 60
                                          + extract(minute from now() at time zone 'Africa/Porto-Novo'))::int + 25) then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_fenetre');
  end if;
  duree := public.duree_du_rdv(d);
  lourde_venue := public.tete_lourde(d);
  if cardinality(maitres) = 0 then
    maitres := array[coalesce(d->>'master', '')];
  end if;

  if not au_dela then
    select case when btrim(coalesce(s.data->>'maxRdvParJourMaison', '')) ~ '^\d{1,4}(\.\d+)?$'
                then floor(btrim(s.data->>'maxRdvParJourMaison')::numeric)::int else 0 end,
           case when btrim(coalesce(s.data->>'maxRdvParJourMaitre', '')) ~ '^\d{1,4}(\.\d+)?$'
                then floor(btrim(s.data->>'maxRdvParJourMaitre')::numeric)::int else 0 end
      into cap_maison, cap_maitre
      from public.documents s
     where s.key = 'mnd_settings';
    cap_maison := coalesce(cap_maison, 0);
    cap_maitre := coalesce(cap_maitre, 0);
    begin
      sieges := public.places_en_ligne(branche, p_date::date);
    exception when others then
      sieges := null;
    end;
    sieges := greatest(1, coalesce(sieges, 1));
    if cap_maison > 0 and (
         select count(*) from public.appointments a
          where a.id <> p_id and a.data->>'branchId' = branche and a.data->>'date' = p_date
            and coalesce(a.data->>'status', '') <> 'annulé' and coalesce(a.data->>'time', '') <> ''
       ) >= cap_maison then
      return jsonb_build_object('ok', false, 'raison', 'creneau_plafond');
    end if;
    if (select count(*) from public.appointments a
         where a.id <> p_id and a.data->>'branchId' = branche and a.data->>'date' = p_date
           and coalesce(a.data->>'status', '') <> 'annulé'
           and public.minutes_de_l_heure(a.data->>'time') is not null
           and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
           and debut + duree > public.minutes_de_l_heure(a.data->>'time')
       ) >= sieges then
      return jsonb_build_object('ok', false, 'raison', 'creneau_pris', 'detail', 'fauteuils');
    end if;
  end if;

  foreach m in array maitres loop
    m := coalesce(m, '');
    select count(*)::int, coalesce(bool_or(public.tete_lourde(a.data)), false)
      into chez_lui, lourde_chez_lui
      from public.appointments a
     where a.id <> p_id
       and a.data->>'branchId' = branche
       and a.data->>'date' = p_date
       and coalesce(a.data->>'status', '') <> 'annulé'
       and coalesce(a.data->>'master', '') = m
       and public.minutes_de_l_heure(a.data->>'time') is not null
       and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
       and debut + duree > public.minutes_de_l_heure(a.data->>'time');
    if au_dela then
      -- Au-delà des fauteuils : jamais deux têtes lourdes ensemble chez Team.
      if not (m = 'Team' and lourde_venue and lourde_chez_lui) then
        choisi := m;
        exit;
      end if;
      continue;
    end if;
    if cap_maitre > 0 and (
         select count(*) from public.appointments a
          where a.id <> p_id and a.data->>'branchId' = branche and a.data->>'date' = p_date
            and coalesce(a.data->>'status', '') <> 'annulé' and coalesce(a.data->>'time', '') <> ''
            and coalesce(a.data->>'master', '') = m
       ) >= cap_maitre then
      continue;
    end if;
    if chez_lui = 0 then
      choisi := m;
      exit;
    end if;
    if partage is null and m = 'Team' and chez_lui < 2 and not (lourde_venue and lourde_chez_lui) then
      partage := m;
    end if;
  end loop;
  choisi := coalesce(choisi, partage);
  if choisi is null then
    return jsonb_build_object('ok', false, 'raison', 'creneau_pris');
  end if;

  -- ÉCRIRE. Les marques du report tombent ; la place d'avant est gardée en
  -- mémoire (`reprogrammeDe`) ; son toucher vaut son oui.
  d := (d - 'aReprogrammerDepuis' - 'aReprogrammerPar' - 'placesProposees' - 'relanceDuReportLe' - 'annuleeLe')
       || jsonb_build_object(
            'status', 'confirmé', 'date', p_date, 'time', p_time, 'master', choisi,
            'reprogrammeLe', maintenant,
            'reprogrammePar', coalesce(nullif(btrim(coalesce(p_par, '')), ''), 'whatsapp'),
            'reprogrammeDe', jsonb_build_object('date', d->>'date', 'time', d->>'time'),
            'confirmeeParLaClienteLe', maintenant);
  if au_dela then
    d := d || jsonb_build_object(
           'auDelaDesPlaces', true,
           'note', concat_ws(' · ', nullif(btrim(coalesce(d->>'note', '')), ''),
                             'Posé au-delà des fauteuils : la Maison est pleine à cette heure, à organiser'));
  end if;
  begin
    update public.appointments set data = d where id = p_id;
  exception when others then
    -- Une remise à places limitées qui ne suit pas (le garde des places
    -- limitées) : la reprise ne se fait pas, la conversation le dit.
    return jsonb_build_object('ok', false, 'raison', 'places_limitees');
  end;
  return jsonb_build_object('ok', true, 'verdict', 'repris', 'master', choisi, 'auDela', au_dela);
end $function$;

revoke all on function public.reprend_si_libre(text, text, text, text[], boolean, text, timestamptz) from public, anon, authenticated;
grant execute on function public.reprend_si_libre(text, text, text, text[], boolean, text, timestamptz) to service_role;

-- Les droits de la pose, tels qu'en base.
revoke all on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) to service_role;

commit;
