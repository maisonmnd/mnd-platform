-- ═══════════════════════════════════════════════════════════════════════════
-- 0140 · UNE SEULE RÉSERVATION EN LIGNE À LA FOIS — 24 octobre 2026
--
-- « P. L. avait un rendez-vous à 14 h, elle a 500 et quelques locks.
--   Comment se fait-il que C. O. a réussi à prendre rendez-vous à la même
--   heure ? Elle a 500 locks également. J'ai vraiment besoin que ça ne se
--   reproduise plus » (Yéman, samedi 24 octobre 2026).
--
-- LA CAUSE : Ma Couronne ne comptait que les rituels de SON maître (« Team »
-- d'un côté, aucun maître de l'autre), et pas les fauteuils ; elle écrivait
-- directement dans la table, sans verrou. Le site et WhatsApp passaient par
-- `pose_si_libre`, mais deux fauteuils y laissaient deux têtes à la même
-- heure.
--
-- LA RÈGLE, choisie au sélecteur : en ligne (Ma Couronne, le site, WhatsApp),
-- un rituel ne chevauche JAMAIS un rituel déjà inscrit, quel qu'en soit le
-- maître. Le Trône garde la main : le personnel pose ce qu'il veut.
--
--   1. `pose_si_libre` (site, WhatsApp) : une place au lieu des fauteuils.
--      Le reste du verrou est celui de 0125, mot pour mot.
--   2. `une_place_en_ligne` : un garde AVANT écriture sur `appointments`,
--      pour toute session de cliente (pas le personnel, pas le serveur, qui
--      juge déjà sous verrou). Sous le même verrou que `pose_si_libre` (par
--      maison et par jour), il refuse `creneau_pris` quand l'heure chevauche
--      un rituel non annulé, à la création, ou quand elle change de jour ou
--      d'heure (une séance déplacée), ou quand un rituel annulé revit. Il
--      tient aussi les vieilles versions de Ma Couronne restées sur les
--      téléphones.
--
-- Les durées : `duree_du_rdv` (0125), la durée figée à la pose d'abord.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. LE VERROU DU SITE ET DE WHATSAPP : UNE PLACE ──────────────────
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

  -- UNE SEULE RÉSERVATION EN LIGNE À LA FOIS (0140, 24 octobre 2026) : ce
  -- verrou ne sert que les portes en ligne, le site et WhatsApp. Un rituel
  -- n'y chevauche jamais un autre, quels que soient les fauteuils de la
  -- branche : ils restent au comptoir, posés à la main.
  sieges := 1;

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


-- ── 2. LE GARDE DES RÉSERVATIONS DES CLIENTES ────────────────────────
create or replace function public.une_place_en_ligne() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  branche text := btrim(coalesce(new.data->>'branchId', new.branch_id, ''));
  jour    text := coalesce(new.data->>'date', '');
  debut   int  := public.minutes_de_l_heure(new.data->>'time');
  duree   int;
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
  if exists (
       select 1 from public.appointments a
        where a.id <> new.id
          and a.data->>'branchId' = branche
          and a.data->>'date' = jour
          and coalesce(a.data->>'status', '') <> 'annulé'
          and public.minutes_de_l_heure(a.data->>'time') is not null
          and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
          and debut + duree > public.minutes_de_l_heure(a.data->>'time')
     ) then
    raise exception 'creneau_pris'
      using errcode = 'P0001',
            hint = 'Une seule réservation en ligne à la fois : cette heure chevauche un rituel déjà inscrit.';
  end if;
  return new;
end $$;

revoke all on function public.une_place_en_ligne() from public, anon, authenticated;

drop trigger if exists une_place_en_ligne on public.appointments;
create trigger une_place_en_ligne
  before insert or update on public.appointments
  for each row execute function public.une_place_en_ligne();


-- ── Contrôle ───────────────────────────────────────────────────────────────
-- Trois « oui » attendus : le verrou à une place, le garde posé, son déclencheur.
select
  (select position('sieges := 1;' in pg_get_functiondef('public.pose_si_libre(jsonb, text[], jsonb, jsonb)'::regprocedure)) > 0) as verrou_a_une_place,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'une_place_en_ligne') = 1 as garde_pose,
  (select count(*) from pg_trigger where tgname = 'une_place_en_ligne' and not tgisinternal) = 1 as declencheur_pose;
