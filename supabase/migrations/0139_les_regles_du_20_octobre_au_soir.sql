-- ═══════════════════════════════════════════════════════════════════
-- 0139 · LE PARCOURS DE L'ABONNÉE, LES RÈGLES DU 20 OCTOBRE AU SOIR
--        À coller dans Supabase › SQL Editor, puis Run, APRÈS la 0138.
--        Se rejoue sans danger (tout est « create or replace »).
--
-- Tranché par Yéman au sélecteur le 20 octobre 2026, et sa réponse à la
-- sonde (L1). Le juge unique (`src/shared/abonnee-pur.ts`) porte ces règles ;
-- ce que le serveur en a besoin y est recopié, borné par `-- ── DEBUT` et
-- `-- ── FIN`, éprouvé contre l'original (scripts/verifie-le-serveur-de-l-abonnee,
-- qui pose la 0138 puis cette 0139).
--
--   ① DÉPLACER À MOINS DE 24 H, PAS EN LIGNE : la séance d'une formule ne se
--      déplace plus depuis Ma Couronne à moins de 24 h de son début ; la
--      Maison décide, et peut la déplacer sans la compter. L'annulation, elle,
--      reste possible, et se compte (décision 3).
--   ② LA CHAQUE LUNE RÉSILIÉE ne rend rien : la lune déjà réglée court
--      jusqu'à son terme, et ses séances incluses restent réservables
--      jusque-là. Un paquet s'arrête toujours le jour de sa résiliation.
--   ③ UN PAQUET SANS ÉCHÉANCIER (les contrats d'avant) n'a aucune date due :
--      son reste est « à convenir avec la Maison », jamais en retard ; la
--      porte des réservations ne se ferme plus sur un retard qu'il n'a pas.
--   ④ L'ANCIEN CARNET « exhausted » (cinq contrats de l'ancien ERP) est
--      épuisé pour de bon : plus aucune séance incluse sur lui. Il ne change
--      aucun autre état (une résiliée, une terminée le restent).
--
-- Le reste dû d'une résiliation (le consommé au-delà du réglé, dû le jour de
-- la résiliation) se relance par `relances-factures` : rien à changer ici,
-- `verse_sur_l_abonnement` reçoit déjà son règlement.
--
-- RIEN N'EST EFFACÉ, RIEN N'EST RÉÉCRIT : aucune ligne ne change en collant
-- ce fichier. Seules des fonctions sont remplacées, mêmes signatures.
-- ═══════════════════════════════════════════════════════════════════


-- ══ ② LE DERNIER JOUR D'UNE FORMULE RÉSILIÉE ═════════════════════════
-- ── DEBUT abo_resiliee (dernierJourDeLaResiliee)
-- LE DERNIER JOUR QUI COMPTE D'UNE FORMULE RÉSILIÉE (tranché au sélecteur le
-- 20 octobre 2026). Un paquet s'arrête le jour de sa résiliation. Une Chaque
-- Lune ne rend rien : la lune déjà réglée qui contient ce jour court jusqu'à
-- son terme (sans dépasser la fin vendue) ; une lune non réglée s'arrête le
-- jour même. Rien : pas de résiliation datée.
create or replace function public.abo_dernier_jour_de_la_resiliee(s jsonb, p jsonb) returns date
language plpgsql immutable set search_path = public as $$
declare
  v_le      date := public.abo_date(s->>'resilieeLe');
  v_n       date := public.abo_date(s->>'nextIso');
  v_lune    daterange;
  v_dernier date;
  v_fin     date;
begin
  if v_le is null then
    return null;
  end if;
  if coalesce(p->>'mode', '') <> 'cycle' or v_n is null or v_le >= v_n then
    return v_le;
  end if;
  v_lune := public.abo_lune_de_la_date(s, v_le);
  if v_lune is null then
    return v_le;
  end if;
  v_dernier := upper(v_lune) - 1;
  v_fin := public.abo_fin(s);
  if v_fin is not null and v_fin < v_dernier then
    return greatest(v_fin, v_le);
  end if;
  return v_dernier;
end $$;
-- ── FIN abo_resiliee


-- ══ ③ L'ÉCHÉANCIER DE BASE : CELUI DU CONTRAT, ET LUI SEUL ══════════
-- ── DEBUT abo_argent (abo_echeances_de_base, règle du 20 octobre au soir)
-- L'échéancier qui fait foi : celui du contrat, et lui seul. Un paquet sans
-- échéancier (les contrats d'avant) n'a aucune date due : son reste est « à
-- convenir avec la Maison », jamais en retard (tranché par Yéman le 20
-- octobre 2026). `p` et `prix` restent dans la signature, inutilisés.
create or replace function public.abo_echeances_de_base(s jsonb, p jsonb, prix numeric) returns jsonb
language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(s->'echeances') = 'array' and jsonb_array_length(s->'echeances') > 0 then s->'echeances'
    else '[]'::jsonb end;
$$;
-- ── FIN abo_argent


-- ══ ② LA SÉANCE QUI COMPTE : JUSQU'AU DERNIER JOUR DE LA RÉSILIATION ═
-- ── DEBUT abo_attribution (abo_compte, règle du 20 octobre au soir)
-- CETTE SÉANCE PREND-ELLE UN CRÉDIT DE CE CONTRAT ? Couverte, pas par un
-- forfait, rattachée à lui, dans sa vie, pas après le dernier jour de sa
-- résiliation (la lune réglée d'une Chaque Lune résiliée compte encore), et
-- son état prend un crédit.
create or replace function public.abo_compte(a jsonb, s_id text, s jsonb, jour date) returns boolean
language sql stable set search_path = public as $$
  select public.abo_vrai(a->'coveredBySub')
     and coalesce(a->>'coverKind', '') <> 'forfait'
     and public.abo_dans_la_vie(s, public.abo_date(a->>'date'))
     and public.abo_contrat_de_la_seance(a) = s_id
     and not coalesce(coalesce(a->>'date', '') > public.abo_dernier_jour_de_la_resiliee(
           s, (select pl.data from public.plans pl where pl.id = s->>'planId'))::text, false)
     and public.abo_prend_un_credit(a, jour);
$$;
-- ── FIN abo_attribution


-- ══ ④ L'ÉTAT D'UNE FORMULE : L'ANCIEN CARNET ÉPUISÉ ══════════════════
-- ── DEBUT abo_etat_de_la_formule (etatDeLaFormule)
-- L'ÉTAT D'UNE FORMULE, LU ET NON STOCKÉ. L'ordre des questions est la
-- définition : résiliée › effacée › terminée › retenue › en pause ›
-- épuisée › en cours. `risk` et `new` ne décident de rien ; `exhausted` (l'ancien
-- ERP) dit épuisée, après tout le reste.
create or replace function public.abo_etat_de_la_formule(s_id text, s jsonb, p jsonb, jour date) returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_jusquau  date;
  v_fin      date;
  v_n        date;
  l          jsonb;
  v_q        numeric;
  v_bornees  int := 0;
  v_epuisees int := 0;
begin
  if public.abo_vrai(s->'resilieeLe') then
    if (s->>'resilieeLe') <= jour::text then
      return jsonb_build_object('etat', 'resiliee');
    end if;
  elsif s->>'status' = 'churn' then
    return jsonb_build_object('etat', 'resiliee');
  end if;

  -- LA RETENUE : prise en ligne, rien de réglé. Sept jours, le dernier au
  -- lundi s'il tombe un dimanche, puis elle s'efface le lendemain.
  if s->>'origine' = 'couronne' and public.abo_verse(s) <= 0 then
    if public.abo_vrai(s->'renonceeLe') and (s->>'renonceeLe') <= jour::text then
      return jsonb_build_object('etat', 'effacee', 'effaceeLe', s->>'renonceeLe');
    end if;
    v_jusquau := public.abo_jour_ouvre(public.abo_debut(s) + 7);
    if jour > v_jusquau then
      return jsonb_build_object('etat', 'effacee', 'effaceeLe', (v_jusquau + 1)::text, 'retenueJusquau', v_jusquau::text);
    end if;
    return jsonb_build_object('etat', 'retenue', 'retenueJusquau', v_jusquau::text);
  end if;

  v_fin := public.abo_fin(s);
  if v_fin is not null and v_fin < jour then
    return jsonb_build_object('etat', 'terminee');
  end if;

  if jsonb_typeof(s->'suspendue') = 'object'
     and (s->'suspendue'->>'du') <= jour::text and jour::text <= (s->'suspendue'->>'au') then
    return jsonb_build_object('etat', 'en-pause', 'pause', jsonb_build_object('genre', 'suspension') || (s->'suspendue'));
  end if;

  -- UNE LUNE NON RÉGLÉE MET LA FORMULE EN PAUSE le jour même de son
  -- échéance (le lundi si elle tombe un dimanche), jamais de dette.
  if not public.abo_est_un_paquet(p) then
    v_n := public.abo_date(s->>'nextIso');
    if v_n is not null and jour >= public.abo_jour_ouvre(v_n) then
      return jsonb_build_object('etat', 'en-pause',
        'pause', jsonb_build_object('genre', 'lune', 'depuisIso', public.abo_jour_ouvre(v_n)::text));
    end if;
  end if;

  -- LE CARNET QUE L'ANCIEN ERP A DIT ÉPUISÉ (`exhausted`) L'EST POUR DE BON :
  -- ses séances ont été prises hors de la vue du compte. Plus aucun crédit.
  if s->>'status' = 'exhausted' then
    return jsonb_build_object('etat', 'epuisee', 'epuiseeParLAncienCarnet', true);
  end if;

  -- ÉPUISÉE : toutes ses séances bornées sont prises. Elle ne bloque rien.
  if public.abo_est_un_paquet(p) then
    for l in select x from jsonb_array_elements(public.abo_inclus_a_la_date(s, p, jour)) x loop
      v_q := public.abo_num(l->'qty');
      if v_q is not null then
        v_bornees := v_bornees + 1;
        if v_q - public.abo_seances_comptees(s_id, jour, l->>'serviceId', null, null, null) <= 0 then
          v_epuisees := v_epuisees + 1;
        end if;
      end if;
    end loop;
    if v_bornees > 0 and v_bornees = v_epuisees then
      return jsonb_build_object('etat', 'epuisee');
    end if;
  end if;
  return jsonb_build_object('etat', 'en-cours');
end $$;
-- ── FIN abo_etat_de_la_formule


-- ══ ② PEUT PORTER : LA CHAQUE LUNE RÉSILIÉE QUI COURT ENCORE ═════════
-- ── DEBUT abo_peut_porter (peutPorter)
-- CE CONTRAT PEUT-IL PORTER CETTE PRESTATION CE JOUR-LÀ ? Rend la raison du
-- refus, ou rien. En cours au jour, sans retard au-delà de la grâce (7
-- jours), en vie ce jour-là, sur une lune déjà réglée, et avec un crédit
-- libre dans la fenêtre de ce jour. `p_sauf` : la séance que l'on déplace.
create or replace function public.abo_peut_porter(
  p_sub_id text, p_service text, p_date date, p_jour date, p_sauf text
) returns text
language plpgsql stable set search_path = public as $$
declare
  v_s       record;
  v_p       jsonb;
  v_etat    text;
  v_n       date;
  v_lune    daterange;
  v_ligne   jsonb;
  v_q       numeric;
  v_dernier date;
  v_court   boolean;
begin
  select s.id, s.data into v_s from public.subscribers s where s.id = p_sub_id;
  if v_s.id is null then
    return 'contrat_introuvable';
  end if;
  select pl.data into v_p from public.plans pl where pl.id = v_s.data->>'planId';
  v_etat := public.abo_etat_de_la_formule(v_s.id, v_s.data, v_p, p_jour)->>'etat';
  -- RÉSILIÉE, ELLE COURT ENCORE : la lune réglée d'une Chaque Lune.
  v_dernier := public.abo_dernier_jour_de_la_resiliee(v_s.data, v_p);
  v_court := v_etat = 'resiliee' and v_dernier is not null
             and v_dernier > public.abo_date(v_s.data->>'resilieeLe') and v_dernier >= p_jour;

  -- DÉPLACER LA DERNIÈRE SÉANCE D'UN PAQUET : il est épuisé par elle-même,
  -- elle doit pouvoir changer de jour sur son propre contrat.
  if v_etat <> 'en-cours' and not v_court and not (
       v_etat = 'epuisee' and p_sauf is not null
       and exists (select 1 from public.appointments a
                    where a.id = p_sauf and public.abo_compte(a.data, v_s.id, v_s.data, p_jour))) then
    return case v_etat when 'en-pause' then 'pause' else v_etat end;
  end if;
  if v_etat = 'en-cours' and public.abo_retard_jours(v_s.data, v_p, p_jour, v_etat) > 7 then
    return 'retard';
  end if;
  if not public.abo_dans_la_vie(v_s.data, p_date) then
    return 'hors_de_sa_vie';
  end if;
  if v_dernier is not null and p_date > v_dernier then
    return 'resiliee';
  end if;
  if jsonb_typeof(v_s.data->'suspendue') = 'object'
     and (v_s.data->'suspendue'->>'du') <= p_date::text and p_date::text <= (v_s.data->'suspendue'->>'au') then
    return 'pause';
  end if;
  if not public.abo_est_un_paquet(v_p) then
    v_n := public.abo_date(v_s.data->>'nextIso');
    if v_n is null or p_date >= v_n then
      return 'lune_non_reglee';
    end if;
    v_lune := public.abo_lune_de_la_date(v_s.data, p_date);
  end if;
  select x into v_ligne
    from jsonb_array_elements(public.abo_inclus_a_la_date(v_s.data, v_p, p_date)) x
   where x->>'serviceId' = p_service
   limit 1;
  if v_ligne is null then
    return 'hors_formule';
  end if;
  v_q := public.abo_num(v_ligne->'qty');
  if v_q is null then
    return null;
  end if;
  if public.abo_seances_comptees(v_s.id, p_jour, p_service, lower(v_lune), upper(v_lune), p_sauf) >= v_q then
    return 'quota';
  end if;
  return null;
end $$;
-- ── FIN abo_peut_porter


-- ══ ① DÉPLACER, CÔTÉ CLIENTE, PAS À MOINS DE 24 H ═══════════════════
-- DÉPLACER : la nouvelle date doit tenir dans la vie du contrat, sur une
-- lune réglée et dans son quota (la séance ne se compte pas contre
-- elle-même), et la place doit être libre. Le rendez-vous repasse « en
-- attente » : la Maison le reconfirme. La séance d'une formule ne se
-- déplace plus d'ici à moins de 24 h de son début : la Maison décide.
create or replace function public.deplacer_une_seance(p_appt_id text, p_date text, p_time text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     text := (auth.uid())::text;
  v_a       public.appointments%rowtype;
  v_jour    date := public.abo_aujourdhui();
  v_quand   date := public.abo_date(p_date);
  v_s_id    text;
  v_service text;
  v_raison  text;
  v_branche text;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;
  if v_quand is null or coalesce(p_time, '') !~ '^\d{2}:\d{2}$' then
    return jsonb_build_object('ok', false, 'raison', 'creneau_invalide');
  end if;
  if v_quand < v_jour or (v_quand = v_jour
       and p_time <= to_char(public.abo_maintenant() at time zone 'Africa/Porto-Novo', 'HH24:MI')) then
    return jsonb_build_object('ok', false, 'raison', 'creneau_passe');
  end if;
  if v_quand > v_jour + 90 then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_fenetre');
  end if;

  select * into v_a from public.appointments where id = p_appt_id for update;
  if v_a.id is null then
    return jsonb_build_object('ok', false, 'raison', 'rendez_vous_introuvable');
  end if;
  if not public.est_ma_tete(v_a.data->>'clientId') then
    return jsonb_build_object('ok', false, 'raison', 'pas_votre_rendez_vous');
  end if;
  if v_a.data->>'status' = 'annulé' then
    return jsonb_build_object('ok', false, 'raison', 'deja_annulee');
  end if;
  if v_a.data->>'status' = 'honoré' then
    return jsonb_build_object('ok', false, 'raison', 'deja_faite');
  end if;
  if coalesce(v_a.data->>'date', '') < v_jour::text then
    return jsonb_build_object('ok', false, 'raison', 'passee');
  end if;

  -- LA SÉANCE D'UNE FORMULE : la nouvelle date passe par le même juge.
  if public.abo_vrai(v_a.data->'coveredBySub') and coalesce(v_a.data->>'coverKind', '') <> 'forfait' then
    -- À MOINS DE 24 H, PAS EN LIGNE : la Maison décide, et elle peut la
    -- déplacer sans la compter (tranché au sélecteur le 20 octobre 2026).
    -- L'annulation, elle, reste possible, et se compte.
    if extract(epoch from (public.abo_debut_de_la_seance(v_a.data) - public.abo_maintenant())) / 3600 < 24 then
      return jsonb_build_object('ok', false, 'raison', 'moins_de_24_h');
    end if;
    v_s_id := public.abo_contrat_de_la_seance(v_a.data);
    if v_s_id is not null then
      perform 1 from public.subscribers where id = v_s_id for update;
      v_service := coalesce(nullif(v_a.data->>'coverServiceId', ''), v_a.data->'serviceIds'->>0);
      v_raison := public.abo_peut_porter(v_s_id, v_service, v_quand, v_jour, v_a.id);
      if v_raison is not null then
        return jsonb_build_object('ok', false, 'raison', v_raison);
      end if;
    end if;
  end if;

  v_branche := coalesce(v_a.branch_id, v_a.data->>'branchId');
  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(v_branche || ':' || p_date));
  v_raison := public.abo_place_libre(v_branche, p_date, p_time, public.duree_du_rdv(v_a.data),
                                     coalesce(v_a.data->>'master', ''), v_a.data->>'clientId', v_a.id);
  if v_raison is not null then
    return jsonb_build_object('ok', false, 'raison', v_raison);
  end if;

  update public.appointments
     set data = data || jsonb_build_object(
           'date', p_date, 'time', p_time, 'status', 'en attente',
           'deplaceeLe', public.abo_iso(public.abo_maintenant()),
           'deplaceeDe', jsonb_build_object('date', v_a.data->>'date', 'time', v_a.data->>'time')),
         updated_at = now()
   where id = v_a.id;
  return jsonb_build_object('ok', true, 'compteeCommeManquee', false, 'etat', 'a-confirmer');
end;
$$;

revoke all on function public.deplacer_une_seance(text, text, text) from public, anon;
grant execute on function public.deplacer_une_seance(text, text, text) to authenticated;


-- ══ LES OUTILS DU JUGE NE S'OUVRENT À PERSONNE ═══════════════════════
-- Les fonctions ②…⑥ de la 0138 (definer) les appellent ; personne d'autre.
do $$
declare
  f text;
begin
  foreach f in array array[
    'abo_dernier_jour_de_la_resiliee(jsonb, jsonb)', 'abo_echeances_de_base(jsonb, jsonb, numeric)',
    'abo_compte(jsonb, text, jsonb, date)', 'abo_etat_de_la_formule(text, jsonb, jsonb, date)',
    'abo_peut_porter(text, text, date, date, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;


-- ── CONTRÔLE, LECTURE SEULE ───────────────────────────────────────
-- Attendu : les quatre règles posées (true partout), et la souscription de
-- la 0138 intacte (une seule, à cinq arguments).
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'abo_dernier_jour_de_la_resiliee') = 1 as lune_resiliee,
  (select bool_and(position('moins_de_24_h' in p.prosrc) > 0) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'deplacer_une_seance') as deplacer_24_h,
  (select bool_and(position('''numero'', 1' in p.prosrc) = 0) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'abo_echeances_de_base') as sans_echeancier,
  (select bool_and(position('exhausted' in p.prosrc) > 0) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'abo_etat_de_la_formule') as ancien_carnet,
  (select bool_and(position('abo_dernier_jour_de_la_resiliee' in p.prosrc) > 0) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('abo_compte', 'abo_peut_porter')) as coupe_de_la_resiliation,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'souscrire_a_une_formule') as souscriptions;
