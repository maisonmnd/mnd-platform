-- ═══════════════════════════════════════════════════════════════════════════
-- 0204 · LES PANNES DITES · 12 novembre 2026 (le choix du moyen, lot D)
--
-- « Une panne de MTN ou de FedaPay dite une seule fois à la direction, et
-- inscrite dans La journée » (Yéman, « Oui » au lot D de la maquette « Le
-- choix du moyen », DnRyTv95VLvgXosuEBzDF4).
--
-- POURQUOI UNE TABLE ET DEUX FONCTIONS. Jusqu'ici la panne ne vivait que sur
-- l'appareil (localStorage, lot A) : deux postes la voyaient chacun de leur
-- côté, et la direction jamais. Elle s'inscrit désormais en base, UNE LIGNE
-- PAR ÉPISODE. Le personnel ne l'écrit jamais lui-même (aucun droit
-- d'écriture) : il appelle
--   · `vois_une_panne(prestataire, branche, source)` : un échec vu (une
--     lecture muette, ou une vraie demande sans réponse). Il prolonge
--     l'épisode ouvert si son dernier échec date de moins de dix minutes (la
--     règle d'`echecSuivant`, src/shared/choix-du-moyen-pur.ts) ; sinon il le
--     clôt à son dernier échec (« silence ») et en ouvre un neuf ;
--   · `une_demande_repasse(prestataire, branche)` : une vraie demande est
--     passée, l'épisode ouvert finit maintenant (« demande »).
-- L'HEURE est celle du serveur (clock_timestamp(), prise après le verrou),
-- jamais celle d'un poste : deux horloges ne se contredisent pas. UN VERROU
-- par prestataire et par maison (pg_advisory_xact_lock) et UN INDEX UNIQUE
-- (un seul épisode ouvert par prestataire et par maison) tiennent la porte :
-- deux postes qui voient la même panne à la même seconde font une seule
-- ligne.
--
-- CE QUI NE S'INSCRIT JAMAIS : « hors ligne » (le poste sans réseau
-- n'arrive pas jusqu'ici, et le Trône ne l'envoie pas :
-- src/shared/pannes-dites-pur.ts) ; un moyen FERMÉ, que la fonction relit
-- elle-même, quoi que dise le poste : MTN dont le règlement n'est pas ouvert
-- (`collecte_mtn_reglage.ouverte`, 0200), FedaPay éteint dans Paramètres
-- (`mnd_settings.mndPay.actif`). Elle répond alors « ferme », sans ligne.
--
-- LA DIRECTION PRÉVENUE UNE FOIS PAR ÉPISODE (le modèle de 0164 et 0165) :
-- le déclencheur `pannes_des_moyens_previent`, au premier moment où
-- l'épisode est CONFIRMÉ (une vraie demande, ou une deuxième vue : une
-- lecture muette d'une seule minute ne réveille personne), prend sa ligne au
-- journal `pannes_prevenues` (une par épisode, `on conflict do nothing`),
-- puis `push-notify` to-staff pour chaque souverain et chaque gérant. Une
-- panne qui revient moins d'une heure après la dernière notification du même
-- prestataire, dans la même maison, ne se redit pas (« deja-dit ») : La
-- journée la compte. Jamais la panne d'une notification ne refuse
-- l'inscription (`exception when others`).
-- LE TEXTE est celui de `notificationDeLaPanne` (src/shared/pannes-dites-pur.ts),
-- l'heure dite à Porto-Novo ; le banc verifie-les-pannes-dites compare les deux.
--
-- LA JOURNÉE : la fonction `cloture-du-jour` (15 h, 19 h) lit les épisodes
-- du jour (clé service) et les dit ; l'écran les lit (lecture du personnel).
--
-- Rejouable : `if not exists`, `create or replace`, `drop … if exists`.
-- `appelle_fonction_edge` vient de 0069, `is_staff` de 0006, `est_direction`
-- de 0089, `collecte_mtn_reglage` de 0200.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. LES ÉPISODES ─────────────────────────────────────────────────────
create table if not exists public.pannes_des_moyens (
  id           uuid primary key default gen_random_uuid(),
  prestataire  text not null check (prestataire in ('mtn', 'fedapay')),
  branch_id    text not null,
  debut        timestamptz not null,
  derniere_vue timestamptz not null,
  -- La fin : une demande repassée (« demande »), ou le dernier échec d'un
  -- épisode resté muet dix minutes (« silence »).
  fin          timestamptz,
  fin_par      text check (fin_par is null or fin_par in ('demande', 'silence')),
  vues         integer not null default 1 check (vues >= 1),
  par_demande  boolean not null default false,
  -- Les comptes du personnel qui l'ont vue (jamais une cliente).
  vue_par      uuid[] not null default '{}'::uuid[],
  constraint pannes_des_moyens_vue_apres_debut check (derniere_vue >= debut),
  constraint pannes_des_moyens_fin_apres_debut check (fin is null or fin >= debut),
  constraint pannes_des_moyens_fin_et_sa_raison check ((fin is null) = (fin_par is null))
);
-- Un seul épisode ouvert par prestataire et par maison.
create unique index if not exists pannes_des_moyens_une_ouverte on public.pannes_des_moyens (prestataire, branch_id) where fin is null;
create index if not exists pannes_des_moyens_debut_idx on public.pannes_des_moyens (debut);

alter table public.pannes_des_moyens enable row level security;
drop policy if exists pannes_des_moyens_lire on public.pannes_des_moyens;
create policy pannes_des_moyens_lire on public.pannes_des_moyens for select to authenticated
  using (public.is_staff());
-- Personne n'y écrit que les deux fonctions ci-dessous (security definer).
revoke all on public.pannes_des_moyens from anon, authenticated;
grant select on public.pannes_des_moyens to authenticated;

-- ── 2. LE JOURNAL : un épisode, une seule notification ─────────────────
create table if not exists public.pannes_prevenues (
  episode    uuid primary key references public.pannes_des_moyens (id),
  prevenu_le timestamptz not null default now(),
  -- 'parti' · 'deja-dit' · 'sans-direction' · 'refuse : …'
  issue      text not null default 'parti',
  envois     integer not null default 0
);
alter table public.pannes_prevenues enable row level security;
drop policy if exists pannes_prevenues_lire on public.pannes_prevenues;
create policy pannes_prevenues_lire on public.pannes_prevenues for select to authenticated
  using (public.est_direction());
revoke all on public.pannes_prevenues from anon, authenticated;
grant select on public.pannes_prevenues to authenticated;

-- ── 3. UN MOYEN FERMÉ N'EST PAS EN PANNE ───────────────────────────────
-- MTN : l'interrupteur de la direction (0200 ; sans sa ligne, fermé, comme
-- `leReglage` de collecte-mtn). FedaPay : allumé dans Paramètres.
create or replace function public.le_moyen_est_ferme(p_prestataire text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  if p_prestataire = 'mtn' then
    if to_regclass('public.collecte_mtn_reglage') is null then
      return true;
    end if;
    return not coalesce((select r.ouverte from public.collecte_mtn_reglage r where r.id = 1), false);
  end if;
  if p_prestataire = 'fedapay' then
    return coalesce((select d.data #>> '{mndPay,actif}' from public.documents d where d.key = 'mnd_settings'), '') <> 'true';
  end if;
  return true;
end;
$$;
revoke execute on function public.le_moyen_est_ferme(text) from public, anon, authenticated;

-- ── 4. UN ÉCHEC VU ─────────────────────────────────────────────────────
create or replace function public.vois_une_panne(p_prestataire text, p_branche text, p_source text default 'lecture')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_maintenant timestamptz;
  v_ouverte public.pannes_des_moyens%rowtype;
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if not public.is_staff() then
    raise exception 'RESERVE_AU_PERSONNEL' using errcode = '42501';
  end if;
  if p_prestataire is null or p_prestataire not in ('mtn', 'fedapay') then
    raise exception 'PRESTATAIRE_INCONNU' using errcode = '22023';
  end if;
  if p_source is null or p_source not in ('lecture', 'demande') then
    raise exception 'SOURCE_INCONNUE' using errcode = '22023';
  end if;
  if p_branche is null or not exists (select 1 from public.branches b where b.id = p_branche) then
    raise exception 'MAISON_INCONNUE' using errcode = '22023';
  end if;
  -- Fermé n'est pas en panne : rien ne s'inscrit.
  if public.le_moyen_est_ferme(p_prestataire) then
    return jsonb_build_object('ok', false, 'motif', 'ferme');
  end if;

  perform pg_advisory_xact_lock(hashtext('pannes_des_moyens|' || p_prestataire || '|' || p_branche));
  v_maintenant := clock_timestamp();

  select * into v_ouverte from public.pannes_des_moyens
   where prestataire = p_prestataire and branch_id = p_branche and fin is null
   for update;

  -- ⟨episode-de-la-panne⟩ : le même épisode tant que les échecs se suivent à moins de dix minutes.
  if found and v_maintenant - v_ouverte.derniere_vue < interval '10 minutes' then
    update public.pannes_des_moyens set
      derniere_vue = greatest(derniere_vue, v_maintenant),
      vues = vues + 1,
      par_demande = par_demande or p_source = 'demande',
      vue_par = case when v_uid is null or v_uid = any(vue_par) then vue_par else vue_par || v_uid end
    where id = v_ouverte.id;
    return jsonb_build_object('ok', true, 'episode', v_ouverte.id, 'neuf', false);
  end if;

  if found then
    -- Muet depuis dix minutes : l'épisode a fini à son dernier échec.
    update public.pannes_des_moyens set fin = derniere_vue, fin_par = 'silence' where id = v_ouverte.id;
  end if;

  insert into public.pannes_des_moyens (prestataire, branch_id, debut, derniere_vue, par_demande, vue_par)
  values (p_prestataire, p_branche, v_maintenant, v_maintenant, p_source = 'demande',
          case when v_uid is null then '{}'::uuid[] else array[v_uid] end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'episode', v_id, 'neuf', true);
end;
$$;
revoke execute on function public.vois_une_panne(text, text, text) from public, anon;
grant execute on function public.vois_une_panne(text, text, text) to authenticated;

-- ── 5. UNE DEMANDE REPASSE : l'épisode ouvert finit ────────────────────
create or replace function public.une_demande_repasse(p_prestataire text, p_branche text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_maintenant timestamptz;
  v_ouverte public.pannes_des_moyens%rowtype;
begin
  if not public.is_staff() then
    raise exception 'RESERVE_AU_PERSONNEL' using errcode = '42501';
  end if;
  if p_prestataire is null or p_prestataire not in ('mtn', 'fedapay') then
    raise exception 'PRESTATAIRE_INCONNU' using errcode = '22023';
  end if;
  if p_branche is null or not exists (select 1 from public.branches b where b.id = p_branche) then
    raise exception 'MAISON_INCONNUE' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('pannes_des_moyens|' || p_prestataire || '|' || p_branche));
  v_maintenant := clock_timestamp();

  select * into v_ouverte from public.pannes_des_moyens
   where prestataire = p_prestataire and branch_id = p_branche and fin is null
   for update;
  if not found then
    return jsonb_build_object('ok', true, 'fini', null);
  end if;

  if v_maintenant - v_ouverte.derniere_vue < interval '10 minutes' then
    update public.pannes_des_moyens set fin = greatest(v_maintenant, debut), fin_par = 'demande' where id = v_ouverte.id;
  else
    -- Déjà muette depuis dix minutes : elle avait fini à son dernier échec.
    update public.pannes_des_moyens set fin = derniere_vue, fin_par = 'silence' where id = v_ouverte.id;
  end if;
  return jsonb_build_object('ok', true, 'fini', v_ouverte.id);
end;
$$;
revoke execute on function public.une_demande_repasse(text, text) from public, anon;
grant execute on function public.une_demande_repasse(text, text) to authenticated;

-- ── 6. LA DIRECTION PRÉVENUE, UNE FOIS ─────────────────────────────────
create or replace function public.previens_de_la_panne() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  nom text;
  titre text;
  corps text;
  compte record;
  n integer := 0;
begin
  begin
    -- Confirmée : une vraie demande, ou une deuxième vue ; encore ouverte.
    if not (new.par_demande or new.vues >= 2) or new.fin is not null then
      return new;
    end if;

    -- Un épisode, une seule notification : la ligne du journal se prend d'abord.
    insert into public.pannes_prevenues (episode) values (new.id)
      on conflict (episode) do nothing;
    if not found then
      return new;
    end if;

    -- Revenue moins d'une heure après la dernière notification : déjà dite.
    if exists (
      select 1 from public.pannes_prevenues j
        join public.pannes_des_moyens p on p.id = j.episode
       where p.prestataire = new.prestataire and p.branch_id = new.branch_id and p.id <> new.id
         and j.issue = 'parti' and j.prevenu_le > now() - interval '60 minutes'
    ) then
      update public.pannes_prevenues set issue = 'deja-dit' where episode = new.id;
      return new;
    end if;

    -- ⟨notification-de-la-panne⟩ : « MTN ne répond pas »
    nom := case new.prestataire when 'mtn' then 'MTN' else 'FedaPay' end;
    titre := nom || ' ne répond pas';
    corps := 'Depuis ' || to_char(new.debut at time zone 'Africa/Porto-Novo', 'FMHH24 "h" MI')
      || ', le Trône propose un autre moyen à la caisse. La fin de la panne s’inscrira dans La journée.';

    -- La direction : chaque souverain et chaque gérant.
    for compte in select s.user_id from public.staff s where s.role in ('souverain', 'gerant') loop
      begin
        perform public.appelle_fonction_edge('push-notify', jsonb_build_object(
          'mode', 'to-staff',
          'userId', compte.user_id::text,
          'title', titre,
          'body', corps,
          'url', '/trone/#/la-journee',
          'tag', 'mnd-panne'
        ));
        n := n + 1;
      exception when others then
        update public.pannes_prevenues set issue = 'refuse : ' || left(sqlerrm, 120) where episode = new.id;
      end;
    end loop;
    if n = 0 then
      update public.pannes_prevenues set issue = 'sans-direction' where episode = new.id and issue = 'parti';
    else
      update public.pannes_prevenues set envois = n where episode = new.id;
    end if;
  exception when others then
    -- Jamais une panne refusée pour une notification.
    raise warning 'panne % : la direction n''est pas prévenue (%)', new.id, sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.previens_de_la_panne() from public, anon, authenticated;

drop trigger if exists pannes_des_moyens_previent on public.pannes_des_moyens;
create trigger pannes_des_moyens_previent after insert or update of vues, par_demande on public.pannes_des_moyens
  for each row execute function public.previens_de_la_panne();

-- ── Contrôle ──────────────────────────────────────────────────────────
-- Attendu : rls_pannes true ; rls_journal true ; ecriture_directe false ;
-- declencheur 1 ; maisons 1 ou plus ; mtn_ferme et fedapay_ferme comme le
-- Trône les montre ; episodes 0 et prevenues 0 au premier passage.
select
  (select relrowsecurity from pg_class where oid = 'public.pannes_des_moyens'::regclass) as rls_pannes,
  (select relrowsecurity from pg_class where oid = 'public.pannes_prevenues'::regclass) as rls_journal,
  has_table_privilege('authenticated', 'public.pannes_des_moyens', 'INSERT') as ecriture_directe,
  (select count(*) from pg_trigger where tgrelid = 'public.pannes_des_moyens'::regclass and tgname = 'pannes_des_moyens_previent') as declencheur,
  (select count(*) from public.branches) as maisons,
  public.le_moyen_est_ferme('mtn') as mtn_ferme,
  public.le_moyen_est_ferme('fedapay') as fedapay_ferme,
  (select count(*) from public.pannes_des_moyens) as episodes,
  (select count(*) from public.pannes_prevenues) as prevenues;
