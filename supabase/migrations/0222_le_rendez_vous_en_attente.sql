-- ═══════════════════════════════════════════════════════════════════════════
-- 0222 · LE RENDEZ-VOUS EN ATTENTE · 17 novembre 2026
--
-- Tranché au sélecteur par Yéman le 17 novembre 2026 (arbitrage B de « La
-- consultation en affiches ») : un rendez-vous pris sur le site naît EN
-- ATTENTE ; il se confirme par sa réponse « Je confirme » sur WhatsApp, plus
-- l'acompte en ligne quand la prestation en porte un ; sans réponse sous deux
-- heures, la place se libère. La règle est écrite dans
-- `src/shared/rendez-vous-en-attente-pur.ts` ; ce fichier la tient en base.
--
-- CE QU'IL POSE :
--   1. `debit_permis` : la limite de débit d'une porte publique, comptée ET
--      écrite sous un même verrou ;
--   2. `rdv_en_attente` : le juge, le même que `estEnAttente` ;
--   3. `plafond_des_poses` : ce qu'un numéro a posé depuis vingt-quatre
--      heures, et ce qu'il tient encore sans l'avoir confirmé ;
--   4. `pose_si_libre` : le texte de 0203, avec quatre ajouts et rien d'autre.
--      Aucune porte en ligne ne pose avant 08:30 (le premier rendez-vous du
--      jour, 16 novembre 2026 : la base ne jugeait pas l'heure). Le jour même
--      passe aussi pour Ma Couronne, qui pose désormais par ce verrou. Le plafond
--      d'un numéro se rejoue sous verrou, un verrou par numéro pris AVANT
--      celui du jour. Et le rendez-vous garde la clé du numéro qui l'a pris
--      (`cleDuNumero`), pour que le plafond se compte sans relire les demandes ;
--   5. `libere_les_places_en_attente` et son cron, toutes les cinq minutes :
--      une place dont l'échéance est passée sans son oui (ni son acompte)
--      passe « annulé », `placeLibereeLe` le dit au Carnet, et le code d'une
--      offre qu'elle portait ne compte pas pour une fois.
--
-- AVANT DE PASSER CE FICHIER : la base doit porter le `pose_si_libre` de 0213
-- (pg_get_functiondef : « coalesce(p_rdv->>'poseePar', '') = 'Opale' »). Le
-- texte ci-dessous part de 0213 : le jour même d'Opale y est gardé.
-- Les rendez-vous d'avant ne changent pas : aucun ne porte `attenduJusquAu`.
--
-- Rejouable : `create or replace`, `if not exists`, le cron retiré puis reposé.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. LA LIMITE DE DÉBIT, SOUS VERROU ─────────────────────────────────────
-- `p_cle` : l'adresse, ou la clé d'un numéro. Vrai : le passage est permis,
-- et il est compté. Faux : le plafond est atteint, rien ne s'écrit.
create or replace function public.debit_permis(p_seau text, p_cle text, p_plafond int, p_minutes int)
returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare
  seau text := btrim(coalesce(p_seau, ''));
  cle  text := btrim(coalesce(p_cle, ''));
begin
  if seau = '' or cle = '' or coalesce(p_plafond, 0) <= 0 or coalesce(p_minutes, 0) <= 0 then
    return true;
  end if;
  perform pg_advisory_xact_lock(hashtext('debit:' || seau), hashtext(cle));
  if (select count(*) from public.edge_rate_limits l
       where l.bucket = seau and l.ip = cle
         and l.at >= now() - make_interval(mins => p_minutes)) >= p_plafond then
    return false;
  end if;
  insert into public.edge_rate_limits (bucket, ip) values (seau, cle);
  return true;
end $$;

revoke all on function public.debit_permis(text, text, int, int) from public, anon, authenticated;
grant execute on function public.debit_permis(text, text, int, int) to service_role;


-- ── 2. LE JUGE : EN ATTENTE, OU FERME ──────────────────────────────────────
-- Le même que `estEnAttente` (rendez-vous-en-attente-pur) : née d'une porte en
-- ligne (`attenduJusquAu`), tenue (« confirmé »), et pas encore ferme. FERME :
-- son oui, et l'acompte reçu quand le rendez-vous en porte un.
create or replace function public.rdv_en_attente(a jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(a->>'status', '') = 'confirmé'
     and btrim(coalesce(a->>'attenduJusquAu', '')) <> ''
     and not (
           btrim(coalesce(a->>'confirmeeParLaClienteLe', '')) <> ''
       and (   (case when btrim(coalesce(a->>'depositXof', '')) ~ '^\d{1,12}(\.\d+)?$'
                     then round(btrim(a->>'depositXof')::numeric) else 0 end) <= 0
            or coalesce(a->>'depositConfirmed', '') = 'true'));
$$;

revoke all on function public.rdv_en_attente(jsonb) from public, anon;
grant execute on function public.rdv_en_attente(jsonb) to authenticated, service_role;

-- Le plafond et la libération lisent par ces deux marques.
create index if not exists appointments_cle_du_numero
  on public.appointments ((data->>'cleDuNumero')) where data ? 'cleDuNumero';
create index if not exists appointments_attendu_jusqu_au
  on public.appointments ((data->>'attenduJusquAu')) where data ? 'attenduJusquAu';


-- ── 3. CE QU'UN NUMÉRO A POSÉ, ET CE QU'IL TIENT SANS L'AVOIR CONFIRMÉ ─────
-- Lu par demande-submit AVANT d'écrire quoi que ce soit (une demande refusée
-- ne laisse ni ligne, ni fil, ni sonnerie) ; `pose_si_libre` le rejoue sous
-- verrou. Les plafonds eux-mêmes sont ceux de rendez-vous-en-attente-pur.
create or replace function public.plafond_des_poses(p_cle text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'posesDuJour', count(*) filter (where a.data->>'creeLe' >= public.abo_iso(now() - interval '24 hours')),
    'enAttente',   count(*) filter (where public.rdv_en_attente(a.data) and a.data->>'attenduJusquAu' > public.abo_iso(now())))
    from public.appointments a
   where btrim(coalesce(p_cle, '')) <> ''
     and a.data->>'cleDuNumero' = btrim(p_cle);
$$;

revoke all on function public.plafond_des_poses(text) from public, anon, authenticated;
grant execute on function public.plafond_des_poses(text) to service_role;


-- ── 4. LE VERROU DES PORTES EN LIGNE : 08:30, ET LE PLAFOND D'UN NUMÉRO ────
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


-- ── 5. LA PLACE SE LIBÈRE SEULE ────────────────────────────────────────────
-- Une place née en attente, dont l'échéance est passée sans que le
-- rendez-vous soit ferme. Elle passe « annulé » : ni elle ni la Maison n'ont
-- annulé (`annuleePar` reste vide), `placeLibereeLe` le dit au Carnet. Le code
-- d'une offre qu'elle portait ne compte pas pour une fois (`codeApplique`
-- retiré de sa demande). Rend le nombre de places libérées.
create or replace function public.libere_les_places_en_attente() returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  maintenant text := public.abo_iso(now());
  r record;
  n int := 0;
begin
  for r in
    select a.id, a.data
      from public.appointments a
     where a.data ? 'attenduJusquAu'
       and public.rdv_en_attente(a.data)
       and a.data->>'attenduJusquAu' <= maintenant
     for update skip locked
  loop
    update public.appointments
       set data = r.data || jsonb_build_object(
             'status', 'annulé', 'annuleeLe', maintenant, 'placeLibereeLe', maintenant,
             'note', concat_ws(' · ', nullif(btrim(coalesce(r.data->>'note', '')), ''),
                               'Place libérée : pas de confirmation sous deux heures'))
     where id = r.id;
    update public.demandes d
       set data = (d.data - 'codeApplique') || jsonb_build_object('placeLibereeLe', maintenant)
     where d.data->>'apptId' = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.libere_les_places_en_attente() from public, anon, authenticated;
grant execute on function public.libere_les_places_en_attente() to service_role;

-- Toutes les cinq minutes : une place se libère entre deux heures et deux
-- heures cinq après sa pose. Tant que la ligne n'est pas passée, la place
-- reste la sienne (un « Je confirme » de la dernière minute tient).
select cron.unschedule(jobid) from cron.job where jobname = 'libere-les-places-en-attente';
select cron.schedule('libere-les-places-en-attente', '*/5 * * * *',
  $$select public.libere_les_places_en_attente();$$);


-- ── Contrôle ───────────────────────────────────────────────────────────────
-- Sept « oui » attendus, puis le cron.
select
  (select position('debut < 510' in pg_get_functiondef('public.pose_si_libre(jsonb, text[], jsonb, jsonb)'::regprocedure)) > 0) as pas_avant_08_30,
  (select position('coalesce(p_rdv->>''poseePar'', '''') = ''Opale''' in pg_get_functiondef('public.pose_si_libre(jsonb, text[], jsonb, jsonb)'::regprocedure)) > 0) as opale_le_jour_meme,
  (select position('hashtext(''pose-numero'')' in pg_get_functiondef('public.pose_si_libre(jsonb, text[], jsonb, jsonb)'::regprocedure)) > 0) as verrou_du_numero,
  (select position('trop_en_attente' in pg_get_functiondef('public.pose_si_libre(jsonb, text[], jsonb, jsonb)'::regprocedure)) > 0) as plafond_du_numero,
  (select position('coalesce(p_rdv->>''source'', '''') in (''site'', ''couronne'')' in pg_get_functiondef('public.pose_si_libre(jsonb, text[], jsonb, jsonb)'::regprocedure)) > 0) as le_jour_meme_au_site_et_a_la_couronne,
  not has_function_privilege('anon', 'public.pose_si_libre(jsonb, text[], jsonb, jsonb)', 'execute') as verrou_au_serveur,
  not has_function_privilege('anon', 'public.debit_permis(text, text, int, int)', 'execute') as debit_au_serveur;
select jobname, schedule, active from cron.job where jobname = 'libere-les-places-en-attente';
