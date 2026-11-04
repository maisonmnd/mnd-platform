-- ═══════════════════════════════════════════════════════════════════════════
-- 0154 · LES PLACES LIMITÉES — 4 novembre 2026
--
-- La décision de Yéman (maquette « Places limitées », AhFRNqiggFoaiR725iKSQe,
-- « construis ») : −15 % sur les shampoings, lavages et soins ; du mardi au
-- vendredi, jamais le samedi ; seulement un JOUR VIDE (aucun autre rendez-vous
-- ce jour-là) ; trois places par jour, décomptées (« Remise : il reste 3
-- places », « il reste 2 places », « il reste une place »), puis plus rien,
-- sur aucune porte ; une réservation au plein tarif ce jour-là FERME les
-- places restantes ; une place déjà prise est GARDÉE ; les jours vides des 14
-- jours à venir ; jamais pour une tête aux prix convenus, abonnée, ni qui a
-- déjà une remise (« une seule remise »). Les jours, le nombre de places,
-- l'horizon, le pourcentage et l'allumage sont des RÉGLAGES de l'offre
-- (`mnd_offers` : `joursDeLaVenue`, `placesParJour`, `horizonJours`,
-- `discountPct`, `active`), jamais des constantes : rien ici ne les suppose.
--
--   0. `code_d_offre_normalise` : `codeNormalise` (offres-pur), en SQL.
--   1. `places_de_l_offre(offre, branche, jour, aujourd'hui, sauf)` : LA RÈGLE
--      UNIQUE, le miroir exact de `placesRestantes` + `occupationDuJour`
--      (src/shared/offres-pur.ts). `null` : l'offre ne concerne pas ce jour ;
--      `0` : le jour est pris ; sinon, le nombre à dire. Interne : seules les
--      fonctions ci-dessous la lisent, en propriétaire.
--   2. `places_de_la_remise(branche, début, fin)` : la même, jour par jour,
--      pour les portes clientes (le site, Ma Couronne). Elle rend (jour,
--      offre, places) et RIEN d'autre : aucun nom, aucun identifiant de
--      rendez-vous. Soixante jours au plus.
--   3. `une_seule_remise(numéro, jour)` : ce que les fiches d'un numéro portent
--      déjà (prix convenus, abonnement vivant à ce jour, remise famille).
--      Réservée au serveur (demande-submit) : elle ne rend que trois oui/non.
--   4. `garde_des_places_limitees` : la garde en base. Une écriture qui prend
--      NOUVELLEMENT une place (une ligne nouvelle portant l'offre, une date
--      changée, une ligne qui renaît) est refusée s'il ne reste aucune place :
--      `PLACES_LIMITEES`. Un verrou par maison et par jour départage deux
--      clientes sur la dernière place. Une place tenue (même offre, même jour
--      que la ligne d'avant) ne se rejuge jamais.
--
-- QUI LA GARDE ARRÊTE, ET POURQUOI `is_staff()` SEUL. `ecriture_de_la_maison()`
-- (0138) rend vrai pour le personnel, mais AUSSI pour le rôle de service et
-- pour toute fonction du serveur : c'est le bon juge de l'argent (une fonction
-- du serveur pose une couverture à bon droit), et le mauvais ici, puisque
-- `demande-submit` et `pose_si_libre` écrivent justement sous le rôle de
-- service. La décision dit : la cliente (Ma Couronne) et les fonctions du
-- serveur (le site, WhatsApp) sont gardées ; le comptoir du Trône décide. Le
-- comptoir, c'est une session du personnel (`is_staff()`, sur le jeton) ;
-- tout le reste passe la garde, la console SQL comprise.
--
-- Le Trône, la Caisse et Ma Couronne comptent avec la même règle en
-- TypeScript (`placesRestantes`, `occupationDuJour`, `offreDuJourDeLaVenue`) ;
-- le banc `verifie-les-places-au-site` confronte ce fichier à ce miroir, à la
-- lettre, et `verifie-les-places-limitees` éprouve le miroir.
--
-- Prérequis : 0138 (`abo_num`, `abo_vrai`, `abo_debut`,
-- `abo_etat_de_la_formule`), 0102 (`numero_wa`), 0003 (`is_staff`).
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 0. LE CODE D'UNE OFFRE, NORMALISÉ ────────────────────────────────────
-- « rentree 10 », « Rentree10 » et « RENTREE10 » désignent la même offre :
-- les blancs ôtés, en majuscules, seize signes au plus (CODE_MAX).
create or replace function public.code_d_offre_normalise(v text) returns text
language sql immutable set search_path = public as $$
  select left(upper(regexp_replace(coalesce(v, ''), '\s+', '', 'g')), 16)
$$;


-- ── 1. LES PLACES D'UNE OFFRE, UN JOUR : LA RÈGLE UNIQUE ─────────────────
create or replace function public.places_de_l_offre(
  o            jsonb,
  p_branch     text,
  p_jour       date,
  p_aujourdhui date,
  p_sauf       text default null
) returns int
language plpgsql stable set search_path = public as $$
declare
  j        text;
  places   numeric;
  horizon  numeric;
  jours    jsonb;
  id_offre text;
  code     text;
  prises   int;
  autres   int;
begin
  -- `null` : l'offre ne concerne pas ce jour. Éteinte, sans places, illisible.
  if o is null or jsonb_typeof(o) <> 'object' or p_jour is null or p_aujourdhui is null then
    return null;
  end if;
  if not public.abo_vrai(o->'active') then
    return null;
  end if;
  places := floor(coalesce(public.abo_num(o->'placesParJour'), 0));
  if places <= 0 then
    return null;
  end if;
  j := to_char(p_jour, 'YYYY-MM-DD');

  -- LA VENUE TOMBE-T-ELLE BIEN (`laVenueTombeBien`) : un de ses jours, lundi
  -- d'abord, et sa saison lue sur la date de la venue. Sans jours de la venue,
  -- elle garde la règle d'hier : rien ne la borne ici.
  jours := case when jsonb_typeof(o->'joursDeLaVenue') = 'array' then o->'joursDeLaVenue' else '[]'::jsonb end;
  if jsonb_array_length(jours) > 0 then
    if not (jours ? (array['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'])[extract(isodow from p_jour)::int]) then
      return null;
    end if;
    if coalesce(o->>'du', '') <> '' and j collate "C" < (o->>'du') collate "C" then
      return null;
    end if;
    if coalesce(o->>'au', '') <> '' and j collate "C" > (o->>'au') collate "C" then
      return null;
    end if;
  end if;

  -- Jamais un jour passé ; jamais au-delà de l'horizon (compté depuis
  -- aujourd'hui, à Cotonou, par l'appelant).
  if p_jour < p_aujourdhui then
    return null;
  end if;
  horizon := floor(coalesce(public.abo_num(o->'horizonJours'), 0));
  if horizon > 0 and (p_jour - p_aujourdhui) > horizon then
    return null;
  end if;

  -- L'OCCUPATION DU JOUR (`occupationDuJour`) : les rendez-vous non annulés
  -- de la maison ce jour-là, celui qu'on relit ôté. Une place prise porte
  -- l'identifiant de l'offre, ou à défaut son code ; tout autre rendez-vous
  -- occupe le jour. Un rendez-vous sans maison compte pour toutes.
  id_offre := coalesce(o->>'id', '');
  code := public.code_d_offre_normalise(o->>'code');
  select count(*) filter (where x.sienne), count(*) filter (where not x.sienne)
    into prises, autres
    from (
      select (id_offre <> '' and coalesce(a.data->>'offreId', '') = id_offre)
          or (code <> '' and public.code_d_offre_normalise(a.data->>'codeOffre') = code) as sienne
        from public.appointments a
       where left(coalesce(a.data->>'date', ''), 10) = j
         and coalesce(a.data->>'status', '') <> 'annulé'
         and (coalesce(p_sauf, '') = '' or a.id <> p_sauf)
         and (coalesce(p_branch, '') = '' or coalesce(a.data->>'branchId', '') in ('', p_branch))
    ) x;

  -- SEULEMENT UN JOUR VIDE : un rendez-vous au plein tarif ferme le jour.
  if public.abo_vrai(o->'jourVideSeulement') and coalesce(autres, 0) > 0 then
    return 0;
  end if;
  return greatest(0, places - coalesce(prises, 0))::int;
end $$;

revoke all on function public.places_de_l_offre(jsonb, text, date, date, text) from public, anon, authenticated;


-- ── 2. LES PLACES DE LA REMISE, JOUR PAR JOUR, POUR LES PORTES CLIENTES ──
-- Une ligne par jour et par offre ACTIVE à places de cette maison (ou sans
-- maison) qui concerne ce jour ; `places = 0` dit le jour pris. Aucune ligne
-- pour un jour que l'offre ne concerne pas. Aujourd'hui se compte à Cotonou.
create or replace function public.places_de_la_remise(p_branch text, p_debut date, p_fin date)
returns table (jour text, offre text, places int)
language sql stable security definer set search_path = public as $$
  with les_offres as (
    select x as o
      from public.documents d
     cross join lateral jsonb_array_elements(case when jsonb_typeof(d.data) = 'array' then d.data else '[]'::jsonb end) x
     where d.key = 'mnd_offers'
       and jsonb_typeof(x) = 'object'
       and coalesce(x->>'id', '') <> ''
       and coalesce(nullif(x->>'branchId', ''), p_branch) = p_branch
  ),
  les_jours as (
    select g::date as j
      from generate_series(p_debut::timestamp, least(p_fin, p_debut + 59)::timestamp, interval '1 day') g
     where p_branch is not null and p_debut is not null and p_fin is not null
  ),
  le_jour_de_cotonou as (
    select (now() at time zone 'Africa/Porto-Novo')::date as a
  )
  select to_char(lj.j, 'YYYY-MM-DD'), lo.o->>'id', n.restantes
    from les_jours lj
   cross join les_offres lo
   cross join le_jour_de_cotonou c
   cross join lateral (select public.places_de_l_offre(lo.o, p_branch, lj.j, c.a) as restantes) n
   where n.restantes is not null
   order by 1, 2
$$;

revoke all on function public.places_de_la_remise(text, date, date) from public;
grant execute on function public.places_de_la_remise(text, date, date) to anon, authenticated, service_role;


-- ── 3. UNE SEULE REMISE : CE QUE LES FICHES D'UN NUMÉRO PORTENT DÉJÀ ─────
-- « Quand il y a déjà des prix convenus, des abonnements ou des remises, il ne
-- faut pas refaire une remise, quelle que soit sa nature » (Yéman, 4 novembre
-- 2026). Les fiches non archivées dont `phone` ou `phone2` est ce numéro :
--   · prixConvenus : un prix convenu de plus de zéro franc (`comptePrixConvenus`) ;
--   · abonnee : un contrat vivant à ce jour (commencé, ni résilié, ni effacé,
--     ni terminé : le juge de 0138) ;
--   · famille : un compte famille dont la remise vaut plus de zéro
--     (`remiseFamillePct`, règle du foyer : le taux posé, sinon le barème).
create or replace function public.une_seule_remise(p_numero text, p_date date)
returns jsonb
language sql stable security definer set search_path = public as $$
  with num as (
    select public.numero_wa(p_numero) as v
  ),
  fiches as (
    select c.id, c.data
      from public.clients c
     where length((select v from num)) >= 8
       and (public.numero_wa(c.data->>'phone') = (select v from num)
            or public.numero_wa(c.data->>'phone2') = (select v from num))
       and coalesce(c.data->>'archived', '') <> 'true'
  ),
  le_jour as (
    select coalesce(p_date, (now() at time zone 'Africa/Porto-Novo')::date) as d
  ),
  foyers as (
    select fa.id, fa.data
      from public.families fa
     where fa.id in (select f.data->>'familyId' from fiches f where coalesce(f.data->>'familyId', '') <> '')
  )
  select jsonb_build_object(
    'prixConvenus', exists (
      select 1
        from fiches f
       cross join lateral jsonb_each(case when jsonb_typeof(f.data->'prixFixes') = 'object'
                                          then f.data->'prixFixes' else '{}'::jsonb end) e
       where jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0),
    'abonnee', exists (
      select 1
        from public.subscribers s
       cross join le_jour lj
       where s.data->>'clientId' in (select f.id from fiches f)
         and lj.d >= public.abo_debut(s.data)
         and coalesce(public.abo_etat_de_la_formule(
               s.id, s.data, (select p.data from public.plans p where p.id = s.data->>'planId'), lj.d)->>'etat', '')
             not in ('resiliee', 'effacee', 'terminee')),
    'famille', exists (
      select 1
        from foyers fo
       where round(case
               when jsonb_typeof(fo.data->'remisePct') = 'number' then (fo.data->>'remisePct')::numeric
               when jsonb_typeof(fo.data->'remisePct') = 'null' then 0
               when jsonb_typeof(fo.data->'remisePct') = 'string' and btrim(fo.data->>'remisePct') = '' then 0
               when jsonb_typeof(fo.data->'remisePct') = 'string' and btrim(fo.data->>'remisePct') ~ '^-?\d+(\.\d+)?$'
                 then btrim(fo.data->>'remisePct')::numeric
               else (select case when k.n >= 3 then 15 when k.n = 2 then 10 else 0 end
                       from (select count(*) as n
                               from (select c.id
                                       from public.clients c
                                      where c.data->>'familyId' = fo.id
                                        and coalesce(c.data->>'archived', '') <> 'true'
                                     union
                                     select fo.data->>'payerClientId'
                                      where coalesce(fo.data->>'payerClientId', '') <> '') t) k)
             end) > 0)
  )
$$;

revoke all on function public.une_seule_remise(text, date) from public, anon, authenticated;
grant execute on function public.une_seule_remise(text, date) to service_role;


-- ── 4. LA GARDE DES PLACES LIMITÉES ──────────────────────────────────────
create or replace function public.garde_des_places_limitees() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  branche text := btrim(coalesce(nullif(new.data->>'branchId', ''), new.branch_id, ''));
  jour    text := left(coalesce(new.data->>'date', ''), 10);
  id_offre text := coalesce(new.data->>'offreId', '');
  code    text := public.code_d_offre_normalise(new.data->>'codeOffre');
  le_jour date;
  o       jsonb;
  reste   int;
begin
  -- Une ligne sans offre, ou annulée, ne prend aucune place.
  if (id_offre = '' and code = '') or coalesce(new.data->>'status', '') = 'annulé' then
    return new;
  end if;
  -- LE COMPTOIR DU TRÔNE DÉCIDE : une session du personnel pose ce qu'elle
  -- veut. La cliente (Ma Couronne) et les fonctions du serveur (le site,
  -- WhatsApp, sous le rôle de service) sont gardées.
  if public.is_staff() then
    return new;
  end if;

  -- L'offre à places que la ligne porte : son identifiant, sinon son code.
  -- Allumée ou non : une offre éteinte ne donne plus de place.
  select x into o
    from public.documents d
   cross join lateral jsonb_array_elements(case when jsonb_typeof(d.data) = 'array' then d.data else '[]'::jsonb end) x
   where d.key = 'mnd_offers'
     and jsonb_typeof(x) = 'object'
     and floor(coalesce(public.abo_num(x->'placesParJour'), 0)) > 0
     and ((id_offre <> '' and coalesce(x->>'id', '') = id_offre)
          or (code <> '' and public.code_d_offre_normalise(x->>'code') = code))
   limit 1;
  if o is null then
    return new;
  end if;

  -- UNE PLACE TENUE NE SE REJUGE JAMAIS : la ligne d'avant, vivante, portait
  -- déjà cette offre le même jour (une note, un paiement, une synchronisation,
  -- une confirmation : rien de tout cela ne reprend la place).
  if tg_op = 'UPDATE'
     and coalesce(old.data->>'status', '') <> 'annulé'
     and left(coalesce(old.data->>'date', ''), 10) = jour
     and ((coalesce(o->>'id', '') <> '' and coalesce(old.data->>'offreId', '') = o->>'id')
          or (public.code_d_offre_normalise(o->>'code') <> ''
              and public.code_d_offre_normalise(old.data->>'codeOffre') = public.code_d_offre_normalise(o->>'code'))) then
    return new;
  end if;

  -- LA DERNIÈRE PLACE SE DÉPARTAGE SOUS VERROU : le même que la pose
  -- (`pose_si_libre`) et la garde des créneaux (`une_place_en_ligne`), par
  -- maison et par jour. Le second attend, puis compte la place du premier.
  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || jour));
  le_jour := public.abo_date(jour);
  reste := case when le_jour is null then null
                else public.places_de_l_offre(o, branche, le_jour, (now() at time zone 'Africa/Porto-Novo')::date, new.id) end;
  if coalesce(reste, 0) <= 0 then
    raise exception 'PLACES_LIMITEES: plus aucune place à la remise le %', jour
      using errcode = 'P0001',
            hint = 'Les places de ce jour sont prises, le jour n''est plus vide, ou l''offre ne le concerne pas : la remise ne se pose pas.';
  end if;
  return new;
end $$;

revoke all on function public.garde_des_places_limitees() from public, anon, authenticated;

drop trigger if exists places_limitees on public.appointments;
create trigger places_limitees
  before insert or update on public.appointments
  for each row execute function public.garde_des_places_limitees();


-- ── Contrôle ───────────────────────────────────────────────────────────────
-- Huit « oui » attendus : la porte des clientes ouverte et à trois colonnes,
-- la règle et le juge des remises gardés au serveur, la garde et son
-- déclencheur posés, la garde au verrou de la pose, et jamais plus de places
-- qu'un réglage n'en donne.
select
  has_function_privilege('anon', 'public.places_de_la_remise(text, date, date)', 'execute') as porte_des_clientes,
  (select pg_get_function_result('public.places_de_la_remise(text, date, date)'::regprocedure)
     = 'TABLE(jour text, offre text, places integer)') as trois_colonnes,
  not has_function_privilege('anon', 'public.places_de_l_offre(jsonb, text, date, date, text)', 'execute') as regle_au_serveur,
  not has_function_privilege('anon', 'public.une_seule_remise(text, date)', 'execute')
    and not has_function_privilege('authenticated', 'public.une_seule_remise(text, date)', 'execute') as remises_au_serveur,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'garde_des_places_limitees') = 1 as garde_posee,
  (select count(*) from pg_trigger where tgname = 'places_limitees' and not tgisinternal) = 1 as declencheur_pose,
  (select position('pg_advisory_xact_lock(hashtext(''pose'')' in pg_get_functiondef('public.garde_des_places_limitees()'::regprocedure)) > 0) as garde_au_verrou,
  (select coalesce(bool_and(p.places >= 0 and p.places <= floor(coalesce(public.abo_num(x->'placesParJour'), 0))), true)
     from public.branches b
    cross join lateral public.places_de_la_remise(b.id, current_date, current_date + 59) p
     join public.documents d on d.key = 'mnd_offers'
    cross join lateral jsonb_array_elements(d.data) x
    where x->>'id' = p.offre) as jamais_plus_qu_un_reglage;
