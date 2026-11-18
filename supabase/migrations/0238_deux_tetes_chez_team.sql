-- ═══════════════════════════════════════════════════════════════════════════
-- 0238 · DEUX TÊTES CHEZ TEAM · 18 novembre 2026
--
-- « On peut mettre deux personnes aux mêmes horaires… tant qu'une personne a
-- moins de 150 locks et l'autre a 400 locks. Mais on ne peut pas prendre deux
-- personnes qui ont 400 locks simultanément » (Yéman). Au sélecteur, le même
-- jour : l'une des deux sous 150 locks ; une fiche sans nombre de locks compte
-- comme une petite tête ; tous les rituels de Team ; le samedi comme en
-- semaine (0237). Un autre maître ne reçoit toujours qu'une cliente à la fois,
-- et les places du jour (`places_en_ligne`, 0152/0237) restent le plafond :
-- deux têtes ensemble prennent les deux places.
--
-- UNE TÊTE LOURDE : 150 locks ou plus, lus sur sa fiche (`clients.lockCount`)
-- ou annoncés sur le rendez-vous (`locksAnnonces` : le calibre dit sur le
-- site, le nombre dit à Opale). L'un ou l'autre suffit.
--
-- CE QUI CHANGE :
--   · `locks_lourds`, `tete_lourde` : nouvelles, fermées aux clientes ;
--   · `creneaux_occupes` : une colonne de plus, `lourde` (oui ou non, jamais
--     le nombre ni la fiche) ; supprimée puis recréée (son type de retour
--     change), ses droits reposés tels qu'en base ;
--   · `pose_si_libre`, `deplace_si_libre`, `une_place_en_ligne` : la règle du
--     maître, et rien d'autre. Le reste est leur définition en base, relue le
--     18 novembre 2026, caractère pour caractère.
-- Le miroir TypeScript : `bloqueLaVenue`, `MAITRE_QUI_PARTAGE`,
-- `SEUIL_TETE_LOURDE`, `DEUX_TETES_AU_PLUS` (src/shared/agenda-pur.ts).
--
-- Rejouable : `create or replace`, `drop … if exists`.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- 150 locks ou plus, écrits en nombre ; tout le reste (vide, illisible) : non.
create or replace function public.locks_lourds(p text)
returns boolean
language sql immutable set search_path = public as $$
  select case when btrim(coalesce(p, '')) ~ '^\d+(\.\d+)?$'
              then btrim(p)::numeric >= 150 else false end;
$$;

-- La tête d'un rendez-vous : les locks annoncés, ou ceux de sa fiche.
create or replace function public.tete_lourde(p_data jsonb)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.locks_lourds(p_data->>'locksAnnonces')
      or coalesce((select public.locks_lourds(c.data->>'lockCount')
                     from public.clients c
                    where btrim(coalesce(p_data->>'clientId', '')) <> ''
                      and c.id = btrim(p_data->>'clientId')), false);
$$;

revoke all on function public.locks_lourds(text) from public, anon, authenticated;
revoke all on function public.tete_lourde(jsonb) from public, anon, authenticated;
grant execute on function public.locks_lourds(text) to service_role;
grant execute on function public.tete_lourde(jsonb) to service_role;

-- LES CRÉNEAUX PRIS, et si la tête y est lourde : jamais qui, jamais combien.
drop function if exists public.creneaux_occupes(text, text, text);
create function public.creneaux_occupes(p_branch text, p_du text, p_au text)
 returns table(jour text, maitre text, debut text, duree integer, lourde boolean)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    a.data->>'date'                  as jour,
    coalesce(a.data->>'master', '')  as maitre,
    coalesce(a.data->>'time', '')    as debut,
    public.duree_du_rdv(a.data)      as duree,
    public.tete_lourde(a.data)       as lourde
  from public.appointments a
  where a.data->>'branchId' = p_branch
    and a.data->>'date' >= p_du
    and a.data->>'date' <= p_au
    and coalesce(a.data->>'status', '') <> 'annulé'
    and coalesce(a.data->>'time', '') <> '';
$function$;
revoke all on function public.creneaux_occupes(text, text, text) from public;
grant execute on function public.creneaux_occupes(text, text, text) to anon, authenticated, service_role;

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
  -- DEUX TÊTES CHEZ TEAM (0238) : un maître seul à cette heure d'abord ;
  -- sinon Team, qui reçoit une seconde tête quand l'une des deux est sous
  -- 150 locks (`bloqueLaVenue`, DEUX_TETES_AU_PLUS, agenda-pur).
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

create or replace function public.deplace_si_libre(p_id text, p_date text, p_time text, p_vu timestamp with time zone, p_sans_remise boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rdv        record;
  d          jsonb;
  branche    text;
  maitre     text;
  aujourdhui text := to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD');
  borne      text := to_char(date_trunc('month', now() at time zone 'Africa/Porto-Novo') + interval '4 months' - interval '1 day', 'YYYY-MM-DD');
  maintenant text := public.abo_iso(now());
  debut      int;
  duree      int;
  faits      int;
  cap_maison int;
  cap_maitre int;
  sieges     int;
  chez_lui        int;
  lourde_chez_lui boolean;
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

  -- LE VERROU DES POSES, pour le jour d'arrivée ; puis la ligne, relue sous lui.
  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || p_date));
  select a.id, a.data, a.updated_at into rdv from public.appointments a where a.id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'introuvable');
  end if;
  if p_vu is null or rdv.updated_at is distinct from p_vu then
    return jsonb_build_object('ok', false, 'raison', 'modifie');
  end if;
  d := rdv.data;
  if coalesce(d->>'status', '') = 'annulé' then
    return jsonb_build_object('ok', false, 'raison', 'annule');
  end if;
  if coalesce(d->>'status', '') not in ('confirmé', 'en attente') then
    return jsonb_build_object('ok', false, 'raison', 'passe');
  end if;
  if coalesce(d->>'date', '') = p_date and coalesce(d->>'time', '') = p_time then
    return jsonb_build_object('ok', false, 'raison', 'meme_place');
  end if;

  -- DEUX FOIS AU PLUS DEPUIS LE SITE (DEPLACEMENTS_AU_PLUS). Un rendez-vous
  -- déplacé avant que le compte existe en compte un.
  faits := greatest(
    case when btrim(coalesce(d->>'deplacements', '')) ~ '^\d{1,3}$' then btrim(d->>'deplacements')::int else 0 end,
    case when btrim(coalesce(d->>'deplaceLe', '')) <> '' and coalesce(d->>'deplacePar', '') = 'site' then 1 else 0 end);
  if faits >= 2 then
    return jsonb_build_object('ok', false, 'raison', 'trop_de_deplacements');
  end if;

  debut := public.minutes_de_l_heure(p_time);
  if debut is null or debut < 510 then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_ouverture');
  end if;
  if p_date <= aujourdhui or p_date > borne then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_fenetre');
  end if;
  duree  := public.duree_du_rdv(d);
  maitre := coalesce(d->>'master', '');

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

  -- Le plafond de la Maison, sans lui.
  if cap_maison > 0 and (
       select count(*) from public.appointments a
        where a.id <> p_id
          and a.data->>'branchId' = branche
          and a.data->>'date' = p_date
          and coalesce(a.data->>'status', '') <> 'annulé'
          and coalesce(a.data->>'time', '') <> ''
     ) >= cap_maison then
    return jsonb_build_object('ok', false, 'raison', 'creneau_plafond');
  end if;
  -- Les places en ligne de cette heure, sans lui.
  if (select count(*) from public.appointments a
       where a.id <> p_id
         and a.data->>'branchId' = branche
         and a.data->>'date' = p_date
         and coalesce(a.data->>'status', '') <> 'annulé'
         and public.minutes_de_l_heure(a.data->>'time') is not null
         and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
         and debut + duree > public.minutes_de_l_heure(a.data->>'time')
     ) >= sieges then
    return jsonb_build_object('ok', false, 'raison', 'creneau_pris', 'detail', 'fauteuils');
  end if;
  -- SON maître : son plafond du jour, et sa place à cette heure, sans lui.
  if cap_maitre > 0 and (
       select count(*) from public.appointments a
        where a.id <> p_id
          and a.data->>'branchId' = branche
          and a.data->>'date' = p_date
          and coalesce(a.data->>'status', '') <> 'annulé'
          and coalesce(a.data->>'time', '') <> ''
          and coalesce(a.data->>'master', '') = maitre
     ) >= cap_maitre then
    return jsonb_build_object('ok', false, 'raison', 'creneau_plafond');
  end if;
  -- DEUX TÊTES CHEZ TEAM (0238) : Team reçoit une seconde tête quand l'une
  -- des deux est sous 150 locks ; tout autre maître, une à la fois.
  select count(*)::int, coalesce(bool_or(public.tete_lourde(a.data)), false)
    into chez_lui, lourde_chez_lui
    from public.appointments a
   where a.id <> p_id
     and a.data->>'branchId' = branche
     and a.data->>'date' = p_date
     and coalesce(a.data->>'status', '') <> 'annulé'
     and coalesce(a.data->>'master', '') = maitre
     and public.minutes_de_l_heure(a.data->>'time') is not null
     and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
     and debut + duree > public.minutes_de_l_heure(a.data->>'time');
  if chez_lui > 0
     and not (maitre = 'Team' and chez_lui < 2 and not (public.tete_lourde(d) and lourde_chez_lui)) then
    return jsonb_build_object('ok', false, 'raison', 'creneau_pris');
  end if;

  -- ÉCRIRE. La remise qui ne suit pas tombe ici, avec le déplacement.
  d := (d - 'autreMomentDemandeLe') || jsonb_build_object(
         'date', p_date, 'time', p_time, 'deplaceLe', maintenant, 'deplacePar', 'site',
         'deplaceDe', jsonb_build_object('date', d->>'date', 'time', d->>'time'),
         'deplacements', faits + 1);
  if coalesce(p_sans_remise, false) and d ? 'remisesLignes' then
    d := (d - 'remisesLignes' - 'placeLimitee') || jsonb_build_object(
           'remiseRetireeLe', maintenant,
           'note', concat_ws(' · ', nullif(btrim(coalesce(d->>'note', '')), ''),
                             'Remise non reportée : le rendez-vous a changé de jour'));
    update public.demandes x set data = x.data - 'codeApplique' where x.data->>'apptId' = p_id;
  end if;
  update public.appointments set data = d where id = p_id;
  return jsonb_build_object('ok', true, 'verdict', 'deplace', 'deplacements', faits + 1,
                            'sansRemise', coalesce(p_sans_remise, false) and rdv.data ? 'remisesLignes');
end $function$;

create or replace function public.une_place_en_ligne()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  branche     text := btrim(coalesce(new.data->>'branchId', new.branch_id, ''));
  jour        text := coalesce(new.data->>'date', '');
  debut       int  := public.minutes_de_l_heure(new.data->>'time');
  maitre      text := coalesce(new.data->>'master', '');
  duree       int;
  places      int;
  dessous     int;
  meme_maitre boolean;
  chez_lui        int;
  lourde_chez_lui boolean;
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
  select count(*)::int, coalesce(bool_or(coalesce(a.data->>'master', '') = maitre), false),
         (count(*) filter (where coalesce(a.data->>'master', '') = maitre))::int,
         coalesce(bool_or(coalesce(a.data->>'master', '') = maitre and public.tete_lourde(a.data)), false)
    into dessous, meme_maitre, chez_lui, lourde_chez_lui
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
  -- au fauteuil à cette heure. SAUF TEAM (0238, deux têtes chez Team) : une
  -- seconde tête quand l'une des deux est sous 150 locks.
  if dessous > 0 and meme_maitre
     and not (maitre = 'Team' and chez_lui < 2 and not (public.tete_lourde(new.data) and lourde_chez_lui)) then
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
end $function$;

-- Les droits, tels qu'en base avant ce lot.
revoke all on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.pose_si_libre(jsonb, text[], jsonb, jsonb) to service_role;
revoke all on function public.deplace_si_libre(text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.deplace_si_libre(text, text, text, timestamptz, boolean) to service_role;
revoke all on function public.une_place_en_ligne() from public, anon, authenticated;
grant execute on function public.une_place_en_ligne() to service_role;

commit;
