-- ═══════════════════════════════════════════════════════════════════
-- 0125 · LA MAISON RÉPOND SUR WHATSAPP · 9 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Se rejoue sans
-- danger. AVANT de coller les fonctions Edge (whatsapp-automate, puis
-- whatsapp-envoi, confirmation-rdv, demande-submit et whatsapp-webhook).
--
-- Maquette « Réserver sur WhatsApp », validée le 9 octobre 2026 : une
-- conversation à boutons et à listes qui propose de vraies places libres et
-- pose le rendez-vous au toucher « Je confirme ». Décisions de la direction
-- du même jour : un rendez-vous CONFIRMÉ, comme le site ; la parole sur un
-- rendez-vous ou au premier message d'un numéro inconnu, la nuit comprise ;
-- pas de modèle de langue ; un interrupteur éteint, essai, ouvert, livré en
-- ESSAI avec une liste VIDE (personne n'est servi tant que la direction n'a
-- pas saisi ses numéros).
--
--   1. fiches_du_numero : les fiches d'un numéro (par `phone` ET `phone2`,
--      et leur famille), rendues en UNE valeur jsonb. Plus de plafond de
--      mille lignes, et la maman et son enfant ne se confondent plus.
--      Réservée au serveur.
--   2. duree_du_rdv : la durée d'un rendez-vous posé, `dureeMin` d'abord
--      (elle se fige à la pose), sinon le catalogue, une heure au moins.
--      creneaux_occupes (0079) la lit désormais : le site et Ma Couronne
--      voient des créneaux pris plus justes.
--   3. pose_si_libre : LE VERROU. Une pose à la fois par maison et par jour ;
--      la même pose rejouée ne se refait pas ; la même personne déjà à cette
--      place, non plus ; le plafond de la Maison, les fauteuils, puis le
--      premier maître encore libre ; et le rendez-vous, la demande et la
--      ligne d'envoi dans la même transaction. Réservée au serveur.
--   4. Les juges purs du fil et du réglage : ils ne lisent aucune table.
--   5. UN SEUL BLOC : le banc les éprouve, dans les deux sens. Un seul cas
--      faux, et l'éditeur s'arrête là : la table, les politiques et les
--      gardes ne sont pas posées.
--   6. La table fils_automate, protégée dès sa naissance : l'état de chaque
--      conversation (`fil-<numéro>`, écrit par le serveur SEUL) et la main de
--      l'équipe (`main-<numéro>`). Temps réel ; PAS de trace (le panier ne
--      doit pas vivre douze mois). Les lignes immobiles depuis trente jours
--      s'effacent à chaque écriture du serveur ; la photo de nuit les garde
--      quatorze jours de plus (à dire dans la politique de confidentialité).
--   7. avance_le_fil et pause_le_fil, réservées au serveur. Les instants se
--      comparent en texte ISO, remis en forme : jamais par `::timestamptz`
--      sur une valeur écrite à la main.
--   8. La garde de mnd_auto_config : l'interrupteur est à la direction, une
--      écriture qui l'omet le garde, et il est toujours remis en forme.
--
-- RIEN NE S'ANNULE ICI : aucune de ces fonctions ne touche au statut d'un
-- rendez-vous déjà posé. L'annulation reste un geste de la Maison.
--
-- `numero_wa` et `numero_est_reserve` (0102), `is_staff()` (0003),
-- `est_direction()` (0089), `touch_updated_at` (0001), `creneaux_occupes`
-- (0079), `envois` (0043), `demandes` (0108) sont passés.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. LES FICHES D'UN NUMÉRO ──────────────────────────────────────
-- Le webhook lisait `clients` d'un seul select, puis rapprochait les numéros
-- avec un `find` : au-delà de mille fiches, une cliente connue passait pour
-- inconnue, et seule la première fiche d'un numéro était vue.
create index if not exists clients_numero_wa_phone
  on public.clients (public.numero_wa(data->>'phone'));
create index if not exists clients_numero_wa_phone2
  on public.clients (public.numero_wa(data->>'phone2'));
create index if not exists clients_famille
  on public.clients ((data->>'familyId'));
create index if not exists appointments_fiche
  on public.appointments ((data->>'clientId'));

-- Les fiches non archivées dont `phone` ou `phone2` est ce numéro, celles
-- trouvées par `phone` d'abord ; puis leur famille (un enfant sans numéro à
-- lui). Huit au plus : la liste « Pour qui ? » de WhatsApp en tient dix,
-- avec « Une autre personne » et « Parler à la Maison ». Chaque fiche porte
-- sa dernière venue honorée (« La même chose ? »), sa date de naissance (une
-- mineure n'est jamais prise pour celle qui écrit) et son prochain
-- rendez-vous.
create or replace function public.fiches_du_numero(n text) returns jsonb
language sql stable security definer set search_path = public as $$
  with num as (select public.numero_wa(n) as v),
  trouvees as (
    select c.id, c.data,
           public.numero_wa(c.data->>'phone') = (select v from num) as par_phone,
           false as par_famille
      from public.clients c
     where length((select v from num)) >= 8
       and (public.numero_wa(c.data->>'phone') = (select v from num)
            or public.numero_wa(c.data->>'phone2') = (select v from num))
       and coalesce(c.data->>'archived', '') <> 'true'
  ),
  familles as (
    select distinct t.data->>'familyId' as fam
      from trouvees t
     where coalesce(t.data->>'familyId', '') <> ''
  ),
  famille as (
    select c.id, c.data, false as par_phone, true as par_famille
      from public.clients c
      join familles f on f.fam = c.data->>'familyId'
     where coalesce(c.data->>'archived', '') <> 'true'
       and not exists (select 1 from trouvees t where t.id = c.id)
  ),
  rangees as (
    select x.id, x.data, x.par_phone, x.par_famille,
           row_number() over (order by x.par_phone desc, x.par_famille, x.id) as rang
      from (select * from trouvees union all select * from famille) x
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', r.id,
           'nom', coalesce(r.data->>'name', ''),
           'civilite', case when r.data->>'civilite' in ('madame', 'mademoiselle', 'monsieur') then r.data->>'civilite' end,
           'auMasculin', case when r.data->>'auMasculin' = 'true' then true end,
           'branchId', nullif(r.data->>'branchId', ''),
           'familyId', nullif(r.data->>'familyId', ''),
           'naissance', nullif(r.data->>'birthday', ''),
           'parPhone', r.par_phone,
           'parFamille', case when r.par_famille then true end,
           'numeros', (select coalesce(jsonb_agg(distinct public.numero_wa(tel.x)), '[]'::jsonb)
                         from unnest(array[r.data->>'phone', r.data->>'phone2']) as tel(x)
                        where public.numero_wa(tel.x) <> ''),
           'derniereVenue', (select jsonb_build_object(
                                      'date', a.data->>'date',
                                      'serviceIds', case when jsonb_typeof(a.data->'serviceIds') = 'array'
                                                         then a.data->'serviceIds' else '[]'::jsonb end)
                               from public.appointments a
                              where a.data->>'clientId' = r.id
                                and a.data->>'status' = 'honoré'
                              order by a.data->>'date' desc, coalesce(a.data->>'time', '') desc
                              limit 1),
           -- SON PROCHAIN RENDEZ-VOUS (relecture du 9 octobre 2026), confirmé
           -- ou en attente, d'aujourd'hui (à Cotonou) ou plus tard : elle en
           -- a déjà un, l'automate laisse la Maison répondre. Pas pour la
           -- famille trouvée sans ce numéro.
           'prochainRdv', case when not r.par_famille then (select jsonb_build_object(
                                      'date', a.data->>'date',
                                      'time', coalesce(a.data->>'time', ''))
                               from public.appointments a
                              where a.data->>'clientId' = r.id
                                and coalesce(a.data->>'status', '') in ('confirmé', 'en attente')
                                and a.data->>'date' >= to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD')
                              order by a.data->>'date', coalesce(a.data->>'time', '')
                              limit 1) end
         )) order by r.rang), '[]'::jsonb)
    from rangees r
   where r.rang <= 8;
$$;

-- ELLE DIT QUI PORTE UN NUMÉRO : la clé publique n'a pas à le savoir, ni le
-- Trône (il a ses fiches). Le serveur seul.
revoke all on function public.fiches_du_numero(text) from public, anon, authenticated;
grant execute on function public.fiches_du_numero(text) to service_role;


-- ── 2. LA DURÉE D'UN RENDEZ-VOUS POSÉ ──────────────────────────────
-- L'heure écrite « HH:MM », en minutes depuis minuit ; illisible : null
-- (une heure absente n'occupe pas minuit).
create or replace function public.minutes_de_l_heure(t text) returns int
language sql immutable set search_path = public as $$
  select case when coalesce(t, '') ~ '^\s*\d{1,2}:\d{2}'
              then split_part(btrim(t), ':', 1)::int * 60 + left(split_part(btrim(t), ':', 2), 2)::int
         end;
$$;

-- `dureeMin` d'abord : LA DURÉE SE FIGE À LA POSE (1er septembre 2026), un
-- calibre Micro dure plus longtemps que le catalogue ne le dit. Absente,
-- le calcul de 0079, inchangé : la somme du catalogue, une prestation
-- inconnue valant une heure, une heure au moins.
create or replace function public.duree_du_rdv(a jsonb) returns int
language plpgsql stable set search_path = public as $$
declare
  ecrite text := btrim(coalesce(a->>'dureeMin', ''));
  total int;
begin
  if ecrite ~ '^\d{1,6}(\.\d+)?$' then
    if ecrite::numeric >= 1 then
      return least(1440, round(ecrite::numeric))::int;
    end if;
  end if;
  select sum(case when btrim(coalesce(s.data->>'durationMin', '')) ~ '^\d{1,6}$'
                  then btrim(s.data->>'durationMin')::int else 60 end)::int
    into total
    from jsonb_array_elements_text(case when jsonb_typeof(a->'serviceIds') = 'array'
                                        then a->'serviceIds' else '[]'::jsonb end) as sid(value)
    left join public.catalog_services s on s.id = sid.value;
  return greatest(60, coalesce(total, 60));
end $$;

revoke all on function public.minutes_de_l_heure(text) from public, anon;
revoke all on function public.duree_du_rdv(jsonb) from public, anon;
grant execute on function public.minutes_de_l_heure(text) to authenticated, service_role;
grant execute on function public.duree_du_rdv(jsonb) to authenticated, service_role;

-- La même fonction que 0079, même signature, même sortie : seule la durée
-- change de source. Toujours sans un nom, sans une prestation.
create or replace function public.creneaux_occupes(
  p_branch text,
  p_du     text,
  p_au     text
)
returns table (jour text, maitre text, debut text, duree int)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.data->>'date'                  as jour,
    coalesce(a.data->>'master', '')  as maitre,
    coalesce(a.data->>'time', '')    as debut,
    public.duree_du_rdv(a.data)      as duree
  from public.appointments a
  where a.data->>'branchId' = p_branch
    and a.data->>'date' >= p_du
    and a.data->>'date' <= p_au
    and coalesce(a.data->>'status', '') <> 'annulé'
    and coalesce(a.data->>'time', '') <> '';
$$;

revoke all on function public.creneaux_occupes(text, text, text) from public;
grant execute on function public.creneaux_occupes(text, text, text) to anon, authenticated, service_role;


-- ── 3. LE VERROU : POSER SI C'EST LIBRE ────────────────────────────
-- Aucun verrou ni contrainte n'empêchait deux réservations au même instant :
-- le serveur contrôlait la place, puis insérait. Ici le contrôle et
-- l'écriture se font sous le même verrou, par maison et par jour.
--
-- `p_maitres` : les maîtres libres à cette heure, dans l'ordre où la Maison
-- les veut (le juge du serveur, `laPlaceTient`). On prend le PREMIER encore
-- libre, jamais `maitres[0]` sans regarder.
--
-- Rend { ok, verdict : pose | deja | deja_pose, id, master } ou
-- { ok: false, raison : creneau_invalide | creneau_hors_fenetre |
-- creneau_plafond | creneau_pris }.
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

  select case when btrim(coalesce(b.data->>'seats', '')) ~ '^\d{1,4}(\.\d+)?$'
              then floor(btrim(b.data->>'seats')::numeric)::int else 0 end
    into sieges
    from public.branches b
   where b.id = branche;
  sieges := coalesce(sieges, 0);

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


-- ── 4. LES JUGES PURS DU FIL ET DU RÉGLAGE ─────────────────────────
-- L'instant écrit comme JavaScript l'écrit (toISOString) :
-- 2026-10-09T20:00:00.000Z. Une autre forme : null. Deux instants ainsi
-- remis en forme se comparent en texte sans se tromper.
create or replace function public.iso_du_fil(t text) returns text
language sql immutable set search_path = public as $$
  select case when coalesce(t, '') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$'
              then substr(t, 1, 19) || '.'
                   || left(rpad(coalesce(substring(t from '\.(\d+)Z$'), ''), 3, '0'), 3) || 'Z'
         end;
$$;

create or replace function public.iso_de_l_instant(t timestamptz) returns text
language sql stable set search_path = public as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- LA MAIN DE L'ÉQUIPE TIENT-ELLE ? Posée, pas encore échue, pas rendue
-- depuis. La même règle que `pauseActive` (shared/automate-wa).
create or replace function public.pause_du_fil_active(main jsonb, maintenant text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(
    jsonb_typeof(main) = 'object'
    and public.iso_du_fil(main->>'pauseLe') is not null
    and public.iso_du_fil(main->>'jusqua') > public.iso_du_fil(maintenant)
    and not coalesce(public.iso_du_fil(main->>'rendueLe') >= public.iso_du_fil(main->>'pauseLe'), false),
    false);
$$;

-- CE QU'UN POSTE ÉCRIT SUR LA MAIN : quatre champs, pas un de plus. Rien
-- dans l'avenir (une horloge de poste en avance ne prolonge rien), 72 heures
-- au plus, et `par` posé par la base depuis la session, jamais déclaré par
-- l'écran.
create or replace function public.main_du_fil_nette(ancien jsonb, neuf jsonb, num text, par text, maintenant timestamptz)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  ici      text := public.iso_de_l_instant(maintenant);
  borne    text := public.iso_de_l_instant(maintenant + interval '72 hours');
  a        jsonb := case when jsonb_typeof(ancien) = 'object' then ancien else '{}'::jsonb end;
  n        jsonb := case when jsonb_typeof(neuf) = 'object' then neuf else '{}'::jsonb end;
  pause_le text;
  jusqua   text;
  rendue   text;
  motif    text;
begin
  pause_le := coalesce(public.iso_du_fil(n->>'pauseLe'), public.iso_du_fil(a->>'pauseLe'));
  jusqua   := coalesce(public.iso_du_fil(n->>'jusqua'), public.iso_du_fil(a->>'jusqua'));
  rendue   := coalesce(public.iso_du_fil(n->>'rendueLe'), public.iso_du_fil(a->>'rendueLe'));
  motif    := nullif(left(btrim(coalesce(n->>'motif', a->>'motif', '')), 40), '');
  if pause_le > ici then pause_le := ici; end if;
  if rendue > ici then rendue := ici; end if;
  if pause_le is null then
    jusqua := null;
  elsif jusqua is null or jusqua > borne then
    jusqua := borne;
  end if;
  -- SON IDENTIFIANT DANS `data` : la synchro du Trône fait de `data` l'objet
  -- du magasin ; une ligne sans son `id` y arrivait sans nom, et la poussée
  -- suivante d'un poste l'effaçait du serveur (la pause disparaissait).
  return jsonb_strip_nulls(jsonb_build_object(
    'id',       'main-' || num,
    'numero',   num,
    'pauseLe',  pause_le,
    'jusqua',   jusqua,
    'motif',    motif,
    'rendueLe', rendue,
    'par',      coalesce(nullif(left(btrim(coalesce(par, '')), 80), ''), nullif(a->>'par', ''))
  ));
end $$;

-- LE RÉGLAGE, REMIS EN FORME. La même règle que `reglageDeLAutomate`
-- (shared/automate-wa), plus la réduction des numéros (`numero_wa`) : ce que
-- la direction tape, « 01 97 … », devient ce que Meta envoie.
create or replace function public.reglage_automate_net(r jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  mode    text;
  numeros jsonb;
  horizon int := 14;
  heures  int := 24;
  brut    text;
begin
  if r is null or jsonb_typeof(r) <> 'object' then
    return jsonb_build_object('mode', 'essai', 'numerosEssai', '[]'::jsonb, 'horizonJours', 14, 'pauseHeures', 24);
  end if;
  mode := case when r->>'mode' in ('eteint', 'essai', 'ouvert') then r->>'mode' else 'essai' end;
  select coalesce(jsonb_agg(t.n order by t.premier), '[]'::jsonb)
    into numeros
    from (select s.n, min(s.pos) as premier
            from (select public.numero_wa(e.v) as n, e.pos
                    from jsonb_array_elements_text(case when jsonb_typeof(r->'numerosEssai') = 'array'
                                                        then r->'numerosEssai' else '[]'::jsonb end)
                         with ordinality as e(v, pos)) s
           where length(s.n) >= 8
           group by s.n
           order by min(s.pos)
           limit 20) t;
  brut := btrim(coalesce(r->>'horizonJours', ''));
  if brut ~ '^-?\d{1,6}(\.\d+)?$' then
    horizon := least(30, greatest(7, round(brut::numeric)::int));
  end if;
  brut := btrim(coalesce(r->>'pauseHeures', ''));
  if brut ~ '^-?\d{1,6}(\.\d+)?$' then
    heures := least(72, greatest(1, round(brut::numeric)::int));
  end if;
  return jsonb_build_object('mode', mode, 'numerosEssai', numeros, 'horizonJours', horizon, 'pauseHeures', heures);
end $$;


-- ── 5. UN SEUL BLOC : LE BANC ──────────────────────────────────────
-- Il dit ce qui est PROMIS, écrit à la main : un cas « passe » rend ce qu'on
-- lui donne, un cas « refuse » rend ce qu'il annonce à la place. Un banc qui
-- n'éprouve qu'un sens arrête tout lui aussi. Il n'écrit dans aucune table.
do $banc$
declare
  ici    timestamptz := '2026-10-09T20:00:00Z';
  cas    record;
  echecs text[] := '{}';
  passes int := 0;
  refuses int := 0;
begin
  for cas in
    select * from (values
      -- La durée d'un rendez-vous posé.
      ('passe'::text, 'la durée figée à la pose est lue d''abord'::text,
        to_jsonb(public.duree_du_rdv('{"dureeMin": 75, "serviceIds": ["banc-0125-a"]}'::jsonb)), '75'::jsonb),
      ('passe', 'une durée figée écrite en texte est lue',
        to_jsonb(public.duree_du_rdv('{"dureeMin": "90"}'::jsonb)), '90'::jsonb),
      ('refuse', 'une durée figée à zéro retombe sur le catalogue (deux inconnues : deux heures)',
        to_jsonb(public.duree_du_rdv('{"dureeMin": 0, "serviceIds": ["banc-0125-a", "banc-0125-b"]}'::jsonb)), '120'::jsonb),
      ('refuse', 'une durée illisible retombe sur une heure',
        to_jsonb(public.duree_du_rdv('{"dureeMin": "longtemps"}'::jsonb)), '60'::jsonb),
      ('refuse', 'des prestations qui ne sont pas une liste : une heure',
        to_jsonb(public.duree_du_rdv('{"serviceIds": "banc-0125-a"}'::jsonb)), '60'::jsonb),
      -- L'heure en minutes.
      ('passe', '09:30 vaut 570 minutes',
        to_jsonb(public.minutes_de_l_heure('09:30')), '570'::jsonb),
      ('refuse', 'une heure illisible n''occupe pas minuit',
        to_jsonb(public.minutes_de_l_heure('midi')), null::jsonb),
      -- Les instants.
      ('passe', 'un instant de JavaScript reste tel quel',
        to_jsonb(public.iso_du_fil('2026-10-09T20:00:00.000Z')), '"2026-10-09T20:00:00.000Z"'::jsonb),
      ('refuse', 'un instant sans millièmes est remis en forme',
        to_jsonb(public.iso_du_fil('2026-10-09T20:00:00Z')), '"2026-10-09T20:00:00.000Z"'::jsonb),
      ('refuse', 'une date écrite à la main n''est pas un instant',
        to_jsonb(public.iso_du_fil('2026-10-09 20:00')), null::jsonb),
      -- La main de l'équipe.
      ('passe', 'une main posée il y a une heure tient',
        to_jsonb(public.pause_du_fil_active('{"pauseLe": "2026-10-09T19:00:00.000Z", "jusqua": "2026-10-10T19:00:00.000Z"}'::jsonb, '2026-10-09T20:00:00.000Z')),
        'true'::jsonb),
      ('refuse', 'une main rendue depuis ne tient plus',
        to_jsonb(public.pause_du_fil_active('{"pauseLe": "2026-10-09T19:00:00.000Z", "jusqua": "2026-10-10T19:00:00.000Z", "rendueLe": "2026-10-09T19:30:00.000Z"}'::jsonb, '2026-10-09T20:00:00.000Z')),
        'false'::jsonb),
      ('refuse', 'une main échue ne tient plus',
        to_jsonb(public.pause_du_fil_active('{"pauseLe": "2026-10-08T10:00:00.000Z", "jusqua": "2026-10-09T10:00:00.000Z"}'::jsonb, '2026-10-09T20:00:00.000Z')),
        'false'::jsonb),
      ('refuse', 'sans ligne, pas de main',
        to_jsonb(public.pause_du_fil_active(null, '2026-10-09T20:00:00.000Z')), 'false'::jsonb),
      ('passe', 'la main posée par un poste garde ses quatre champs, et la base signe',
        public.main_du_fil_nette(null,
          '{"pauseLe": "2026-10-09T19:00:00.000Z", "jusqua": "2026-10-10T19:00:00.000Z", "motif": "frappe"}'::jsonb,
          '2290197000000', 'direction@maison.test', ici),
        '{"id": "main-2290197000000", "numero": "2290197000000", "pauseLe": "2026-10-09T19:00:00.000Z", "jusqua": "2026-10-10T19:00:00.000Z", "motif": "frappe", "par": "direction@maison.test"}'::jsonb),
      ('refuse', 'une main de trente jours est ramenée à 72 heures',
        public.main_du_fil_nette(null,
          '{"pauseLe": "2026-10-09T19:00:00.000Z", "jusqua": "2026-11-08T19:00:00.000Z", "motif": "frappe"}'::jsonb,
          '2290197000000', 'direction@maison.test', ici),
        '{"id": "main-2290197000000", "numero": "2290197000000", "pauseLe": "2026-10-09T19:00:00.000Z", "jusqua": "2026-10-12T20:00:00.000Z", "motif": "frappe", "par": "direction@maison.test"}'::jsonb),
      ('refuse', 'un poste ne glisse ni étape ni signature dans la main',
        public.main_du_fil_nette('{"par": "ancienne@maison.test"}'::jsonb,
          '{"pauseLe": "2026-10-09T19:00:00.000Z", "jusqua": "2026-10-10T19:00:00.000Z", "etape": "recap", "par": "pirate", "panier": {"date": "2026-10-17"}}'::jsonb,
          '2290197000000', 'direction@maison.test', ici),
        '{"id": "main-2290197000000", "numero": "2290197000000", "pauseLe": "2026-10-09T19:00:00.000Z", "jusqua": "2026-10-10T19:00:00.000Z", "par": "direction@maison.test"}'::jsonb),
      ('refuse', 'une main posée dans l''avenir part de maintenant',
        public.main_du_fil_nette(null,
          '{"pauseLe": "2026-10-11T08:00:00.000Z", "jusqua": "2026-10-11T09:00:00.000Z"}'::jsonb,
          '2290197000000', null, ici),
        '{"id": "main-2290197000000", "numero": "2290197000000", "pauseLe": "2026-10-09T20:00:00.000Z", "jusqua": "2026-10-11T09:00:00.000Z"}'::jsonb),
      -- Le réglage.
      ('passe', 'un réglage déjà en forme reste tel quel',
        public.reglage_automate_net('{"mode": "ouvert", "numerosEssai": ["2290197000000", "33612345678"], "horizonJours": 21, "pauseHeures": 12}'::jsonb),
        '{"mode": "ouvert", "numerosEssai": ["2290197000000", "33612345678"], "horizonJours": 21, "pauseHeures": 12}'::jsonb),
      ('refuse', 'un réglage abîmé est remis en forme : essai, numéros réduits et uniques, bornes',
        public.reglage_automate_net('{"mode": "robot", "numerosEssai": ["01 97 00 00 00", "+229 01 97 00 00 00", "12", null], "horizonJours": 99, "pauseHeures": 0}'::jsonb),
        '{"mode": "essai", "numerosEssai": ["2290197000000"], "horizonJours": 30, "pauseHeures": 1}'::jsonb),
      ('refuse', 'un réglage vide vaut la valeur livrée : essai, personne',
        public.reglage_automate_net('{}'::jsonb),
        '{"mode": "essai", "numerosEssai": [], "horizonJours": 14, "pauseHeures": 24}'::jsonb)
    ) as banc(sens, nom, obtenu, attendu)
  loop
    if cas.sens = 'passe' then passes := passes + 1;
    elsif cas.sens = 'refuse' then refuses := refuses + 1;
    else
      echecs := echecs || format('%s : sens inconnu', cas.nom);
      continue;
    end if;
    if cas.obtenu is distinct from cas.attendu then
      echecs := echecs || format('%s : attendu %s, obtenu %s', cas.nom, coalesce(cas.attendu::text, 'null'), coalesce(cas.obtenu::text, 'null'));
    end if;
  end loop;

  if passes = 0 or refuses = 0 then
    raise exception 'Le banc doit éprouver les deux sens (passe : %, refuse : %). Rien n''est changé.', passes, refuses;
  end if;
  if cardinality(echecs) > 0 then
    raise exception 'Les juges ne tiennent pas (% cas sur %). Rien n''est changé. %',
      cardinality(echecs), passes + refuses, array_to_string(echecs, ' | ');
  end if;
  raise notice 'Banc de 0125 : % cas passent, % sont corrigés, comme promis.', passes, refuses;
end
$banc$;


-- ── 6. LA TABLE DES FILS, PROTÉGÉE DÈS SA NAISSANCE ────────────────
create table if not exists public.fils_automate (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.fils_automate enable row level security;

create index if not exists fils_automate_numero on public.fils_automate ((data->>'numero'));
create index if not exists fils_automate_age on public.fils_automate (updated_at);

drop trigger if exists fils_automate_touch on public.fils_automate;
create trigger fils_automate_touch before update on public.fils_automate
  for each row execute function public.touch_updated_at();

-- LA PORTE : le personnel lit les fils des clientes, la direction tous (un
-- numéro de l'équipe sert en essai). Rien pour la clé publique. Seule la
-- direction efface ; un effacement venu d'un autre poste ne touche rien,
-- sans erreur.
drop policy if exists fils_automate_lire on public.fils_automate;
create policy fils_automate_lire on public.fils_automate for select to authenticated
  using (public.est_direction()
         or (public.is_staff() and not public.numero_est_reserve(data->>'numero')));

drop policy if exists fils_automate_poser on public.fils_automate;
create policy fils_automate_poser on public.fils_automate for insert to authenticated
  with check (public.est_direction()
              or (public.is_staff() and not public.numero_est_reserve(data->>'numero')));

drop policy if exists fils_automate_retoucher on public.fils_automate;
create policy fils_automate_retoucher on public.fils_automate for update to authenticated
  using (public.est_direction()
         or (public.is_staff() and not public.numero_est_reserve(data->>'numero')))
  with check (public.est_direction()
              or (public.is_staff() and not public.numero_est_reserve(data->>'numero')));

drop policy if exists fils_automate_effacer on public.fils_automate;
create policy fils_automate_effacer on public.fils_automate for delete to authenticated
  using (public.est_direction());

-- LA GARDE. Un poste du Trône n'écrit que la main de l'équipe :
--   · une ligne `fil-` venue d'un poste est IGNORÉE, sans refus (un refus
--     mettrait la table hors de portée du poste, sync.ts) ;
--   · une ligne `main-` ne garde que pauseLe, jusqua, motif et rendueLe,
--     72 heures au plus, et `par` vient de la session ;
--   · elle prend le même verrou que le serveur : un tour de l'automate déjà
--     lancé voit la pause, ou finit avant elle.
-- Le serveur (clé de service) et l'éditeur SQL passent.
create or replace function public.fils_automate_garde() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  num text;
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.id not like 'main-%' then
    return null;
  end if;
  num := public.numero_wa(substr(new.id, 6));
  if length(num) < 8 or new.id <> 'main-' || num then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('fil'), hashtext(num));
  if tg_op = 'UPDATE' then
    new.branch_id := coalesce(new.branch_id, old.branch_id);
    new.data := public.main_du_fil_nette(old.data, new.data, num, auth.jwt()->>'email', now());
  else
    new.data := public.main_du_fil_nette(null, new.data, num, auth.jwt()->>'email', now());
  end if;
  return new;
end $$;

drop trigger if exists fils_automate_garde on public.fils_automate;
create trigger fils_automate_garde before insert or update on public.fils_automate
  for each row execute function public.fils_automate_garde();

-- LE TEMPS RÉEL, ET PAS DE TRACE : la trace (0092) garde tout douze mois.
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'fils_automate') then
    alter publication supabase_realtime add table public.fils_automate;
  end if;
end $$;
drop trigger if exists trace_le_geste on public.fils_automate;


-- ── 7. LE FIL AVANCE, LA MAIN SE POSE ──────────────────────────────
-- AVANCE_LE_FIL n'écrit l'état que si sa version n'a pas bougé depuis la
-- lecture, et qu'aucune main de l'équipe ne tient le fil. Rend la nouvelle
-- version, ou null : un tour déjà lancé se tait. Les lignes immobiles
-- depuis trente jours s'effacent au passage.
create or replace function public.avance_le_fil(p_numero text, p_version int, p_data jsonb, p_branch text default null)
returns int language plpgsql volatile security definer set search_path = public as $$
declare
  num       text := public.numero_wa(p_numero);
  ici       text := public.iso_de_l_instant(now());
  la_main   jsonb;
  actuelle  int;
begin
  if length(num) < 8 or p_data is null or jsonb_typeof(p_data) <> 'object' then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('fil'), hashtext(num));
  select f.data into la_main from public.fils_automate f where f.id = 'main-' || num;
  if public.pause_du_fil_active(la_main, ici) then
    return null;
  end if;
  select case when coalesce(f.data->>'version', '') ~ '^\d{1,9}$' then (f.data->>'version')::int else 0 end
    into actuelle
    from public.fils_automate f
   where f.id = 'fil-' || num;
  actuelle := coalesce(actuelle, 0);
  if p_version is null or actuelle <> p_version then
    return null;
  end if;
  insert into public.fils_automate (id, branch_id, data)
  values ('fil-' || num, nullif(p_branch, ''), p_data || jsonb_build_object('id', 'fil-' || num, 'numero', num, 'version', actuelle + 1))
  on conflict (id) do update
    set data = excluded.data,
        branch_id = coalesce(excluded.branch_id, public.fils_automate.branch_id);
  delete from public.fils_automate where updated_at < now() - interval '30 days';
  return actuelle + 1;
end $$;

-- PAUSE_LE_FIL : la seconde sécurité. Un message de l'équipe parti par
-- whatsapp-envoi met le fil en pause, même si l'écran a perdu sa connexion,
-- et même sur un fil que l'automate n'a jamais touché : il ne coupe jamais
-- une conversation humaine. La durée est lue dans le réglage (24 h).
create or replace function public.pause_le_fil(p_numero text, p_par text default null, p_motif text default 'envoi-equipe')
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  num    text := public.numero_wa(p_numero);
  heures int := 24;
  brut   text;
  ligne  jsonb;
begin
  if length(num) < 8 then
    return null;
  end if;
  select btrim(coalesce(d.data->'automateWa'->>'pauseHeures', '')) into brut
    from public.documents d where d.key = 'mnd_auto_config';
  if coalesce(brut, '') ~ '^\d{1,3}$' then
    heures := least(72, greatest(1, brut::int));
  end if;
  perform pg_advisory_xact_lock(hashtext('fil'), hashtext(num));
  ligne := jsonb_strip_nulls(jsonb_build_object(
    'id',      'main-' || num,
    'numero',  num,
    'pauseLe', public.iso_de_l_instant(now()),
    'jusqua',  public.iso_de_l_instant(now() + make_interval(hours => heures)),
    'motif',   left(coalesce(nullif(btrim(p_motif), ''), 'envoi-equipe'), 40),
    'par',     nullif(left(btrim(coalesce(p_par, '')), 80), '')));
  insert into public.fils_automate (id, data)
  values ('main-' || num, ligne)
  on conflict (id) do update set data = excluded.data;
  delete from public.fils_automate where updated_at < now() - interval '30 days';
  return ligne;
end $$;

revoke all on function public.avance_le_fil(text, int, jsonb, text) from public, anon, authenticated;
revoke all on function public.pause_le_fil(text, text, text) from public, anon, authenticated;
grant execute on function public.avance_le_fil(text, int, jsonb, text) to service_role;
grant execute on function public.pause_le_fil(text, text, text) to service_role;


-- ── 8. L'INTERRUPTEUR EST À LA DIRECTION ───────────────────────────
-- `mnd_auto_config` s'écrit par tout le personnel (0006), et le Trône réécrit
-- le document entier : une retouche du lien d'avis effaçait les autres
-- réglages qu'elle ne portait pas. Ici :
--   · une écriture qui OMET `automateWa` le garde ;
--   · hors direction, `automateWa` reprend sa valeur d'avant ;
--   · il est toujours remis en forme (reglage_automate_net).
-- La synchro écrit par upsert : à l'INSERT d'un document qui existe déjà, on
-- laisse faire, l'UPDATE juge avec la ligne en base.
create or replace function public.auto_config_garde_l_automate() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  avant jsonb;
begin
  if new.key is distinct from 'mnd_auto_config' or new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.documents d where d.key = new.key) then
      return new;
    end if;
    avant := null;
  else
    avant := case when jsonb_typeof(old.data) = 'object' then old.data end;
  end if;

  if not (new.data ? 'automateWa') and avant is not null and (avant ? 'automateWa') then
    new.data := new.data || jsonb_build_object('automateWa', avant->'automateWa');
  end if;

  if auth.uid() is not null and not public.est_direction() then
    new.data := new.data - 'automateWa';
    if avant is not null and (avant ? 'automateWa') then
      new.data := new.data || jsonb_build_object('automateWa', avant->'automateWa');
    end if;
  end if;

  if new.data ? 'automateWa' then
    if jsonb_typeof(new.data->'automateWa') = 'object' then
      new.data := jsonb_set(new.data, '{automateWa}', public.reglage_automate_net(new.data->'automateWa'));
    else
      new.data := new.data - 'automateWa';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists auto_config_garde_l_automate on public.documents;
create trigger auto_config_garde_l_automate before insert or update on public.documents
  for each row
  when (new.key = 'mnd_auto_config')
  execute function public.auto_config_garde_l_automate();


-- ── LE CONTRÔLE, en lignes de résultat (l'éditeur n'affiche pas les NOTICE)
-- Attendu : « en place » ou « oui » partout ; la ligne 12 dit la valeur
-- livrée tant que la direction n'a rien réglé.
select n, quoi, etat from (
  select 1 as n, 'fiches_du_numero, réservée au serveur' as quoi,
         case when to_regprocedure('public.fiches_du_numero(text)') is null then 'ABSENTE'
              when has_function_privilege('anon', 'public.fiches_du_numero(text)', 'execute')
                or has_function_privilege('authenticated', 'public.fiches_du_numero(text)', 'execute') then 'OUVERTE AU PUBLIC'
              when has_function_privilege('service_role', 'public.fiches_du_numero(text)', 'execute') then 'en place'
              else 'FERMÉE AU SERVEUR' end as etat
  union all
  select 2, 'index des numéros (phone, phone2)',
         (select count(*) from pg_indexes where schemaname = 'public'
            and indexname in ('clients_numero_wa_phone', 'clients_numero_wa_phone2'))::text || ' sur 2'
  union all
  select 3, 'creneaux_occupes lit la durée figée',
         case when pg_get_functiondef('public.creneaux_occupes(text,text,text)'::regprocedure) like '%duree_du_rdv(a.data)%'
              then 'oui' else 'NON' end
  union all
  select 4, 'pose_si_libre : sous verrou, réservée au serveur',
         case when to_regprocedure('public.pose_si_libre(jsonb,text[],jsonb,jsonb)') is null then 'ABSENTE'
              when pg_get_functiondef('public.pose_si_libre(jsonb,text[],jsonb,jsonb)'::regprocedure) not like '%pg_advisory_xact_lock%' then 'SANS VERROU'
              when has_function_privilege('anon', 'public.pose_si_libre(jsonb,text[],jsonb,jsonb)', 'execute')
                or has_function_privilege('authenticated', 'public.pose_si_libre(jsonb,text[],jsonb,jsonb)', 'execute') then 'OUVERTE AU PUBLIC'
              else 'en place' end
  union all
  select 5, 'fils_automate : RLS',
         case when (select relrowsecurity from pg_class where oid = 'public.fils_automate'::regclass)
              then 'protégée' else 'OUVERTE' end
  union all
  select 6, 'fils_automate : politiques',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'fils_automate')::text || ' sur 4'
  union all
  select 7, 'fils_automate : temps réel',
         case when exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                             and schemaname = 'public' and tablename = 'fils_automate')
              then 'oui' else 'NON' end
  union all
  select 8, 'fils_automate : sans trace',
         case when exists (select 1 from pg_trigger where tgrelid = 'public.fils_automate'::regclass
                             and tgname = 'trace_le_geste')
              then 'TRACÉE' else 'oui' end
  union all
  select 9, 'fils_automate : garde des postes',
         case when exists (select 1 from pg_trigger where tgrelid = 'public.fils_automate'::regclass
                             and tgname = 'fils_automate_garde' and tgenabled <> 'D')
              then 'en place' else 'ABSENTE' end
  union all
  select 10, 'avance_le_fil et pause_le_fil, réservées au serveur',
         case when to_regprocedure('public.avance_le_fil(text,int,jsonb,text)') is null
                or to_regprocedure('public.pause_le_fil(text,text,text)') is null then 'ABSENTES'
              when has_function_privilege('authenticated', 'public.avance_le_fil(text,int,jsonb,text)', 'execute')
                or has_function_privilege('authenticated', 'public.pause_le_fil(text,text,text)', 'execute')
                or has_function_privilege('anon', 'public.avance_le_fil(text,int,jsonb,text)', 'execute')
                or has_function_privilege('anon', 'public.pause_le_fil(text,text,text)', 'execute') then 'OUVERTES AU PUBLIC'
              else 'en place' end
  union all
  select 11, 'garde de mnd_auto_config',
         case when exists (select 1 from pg_trigger where tgrelid = 'public.documents'::regclass
                             and tgname = 'auto_config_garde_l_automate' and tgenabled <> 'D')
              then 'en place' else 'ABSENTE' end
  union all
  select 12, 'la réponse automatique',
         coalesce((select 'mode ' || coalesce(d.data->'automateWa'->>'mode', '?') || ' · '
                          || case when jsonb_typeof(d.data->'automateWa'->'numerosEssai') = 'array'
                                  then jsonb_array_length(d.data->'automateWa'->'numerosEssai') else 0 end::text
                          || ' numéro(s) d''essai'
                     from public.documents d
                    where d.key = 'mnd_auto_config' and d.data ? 'automateWa'),
                  'valeur livrée : essai, aucun numéro, personne n''est servi')
  union all
  select 13, 'fils en mémoire',
         (select count(*) from public.fils_automate)::text
) as controle
order by n;
