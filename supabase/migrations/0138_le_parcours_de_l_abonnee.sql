-- ═══════════════════════════════════════════════════════════════════
-- 0138 · LE PARCOURS DE L'ABONNÉE, CÔTÉ SERVEUR — 20 octobre 2026
--        À coller dans Supabase › SQL Editor, puis Run. Se rejoue sans
--        danger (tout est « create or replace » ou « drop if exists »).
--
-- « Repenser entièrement l'expérience des clients abonnés… distinct,
-- transparent, fiable, pour les clientes comme pour l'administration »
-- (Yéman). Maquette L0 validée le 20 octobre 2026 ; le juge unique vit dans
-- `src/shared/abonnee-pur.ts`, et ce que le serveur en a besoin y est
-- RECOPIÉ ici, chaque copie bornée par `-- ── DEBUT <nom>` et `-- ── FIN
-- <nom>`, éprouvée contre l'original sur les mêmes cas
-- (scripts/verifie-le-serveur-de-l-abonnee).
--
-- CE QUE CETTE MIGRATION POSE :
--   ⓪ les outils du juge, recopiés (abo_*), que personne n'appelle de dehors ;
--   ① la référence ABO et le numéro de pièce, tirés côté serveur avec la
--      même règle que le comptoir (prochaineReferenceAbo, nextInvoiceNumber) ;
--   ② `souscrire_a_une_formule`, 5e version : deux formules en même temps,
--      la référence, l'échéancier sans dimanche, le Foyer, la lune qui
--      commence au règlement ;
--   ③ `verse_sur_l_abonnement` : LE seul chemin de l'argent d'un contrat,
--      au contrat ET à sa pièce, sous le même identifiant ;
--   ④ `reserver_une_seance_incluse` : la séance de sa formule, couverte
--      d'office par le serveur, crédit vérifié sous verrou ;
--   ⑤ `annuler_une_seance` et `deplacer_une_seance`, côté cliente ;
--   ⑥ `renoncer_a_la_formule` : une formule retenue qu'elle ne veut plus ;
--   ⑦ la garde 0074 étendue aux champs de la couverture et aux faits de la
--      séance ; une cliente n'écrit plus jamais un contrat ;
--   ⑧ `subscribers` passe sous la trace de la base (0092).
--
-- RIEN N'EST EFFACÉ, RIEN N'EST RÉÉCRIT : aucune ligne existante ne change
-- en collant ce fichier. Seules les écritures À VENIR suivent ces règles.
-- ═══════════════════════════════════════════════════════════════════


-- ══ ⓪ LES OUTILS DU JUGE ═════════════════════════════════════════════
-- Ils lisent, ne décident de rien seuls, et ne s'ouvrent à personne : les
-- fonctions ②…⑥ (definer) les appellent. Le jour leur est toujours PASSÉ.

-- LE JOUR ET L'INSTANT DE COTONOU. Le banc les fige par deux réglages de
-- session (`mnd.jour_du_banc`, `mnd.instant_du_banc`) qu'aucune cliente ne
-- peut poser : PostgREST n'ouvre aucun `set` à personne.
create or replace function public.abo_aujourdhui() returns date
language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('mnd.jour_du_banc', true), '')::date,
                  (now() at time zone 'Africa/Porto-Novo')::date);
$$;

create or replace function public.abo_maintenant() returns timestamptz
language sql stable set search_path = public as $$
  select coalesce(nullif(current_setting('mnd.instant_du_banc', true), '')::timestamptz, now());
$$;

-- L'instant comme l'écrit le navigateur (`toISOString`).
create or replace function public.abo_iso(t timestamptz) returns text
language sql immutable set search_path = public as $$
  select to_char(t at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- ── DEBUT abo_date (estIso)
-- Une date AAAA-MM-JJ lisible, sinon rien.
create or replace function public.abo_date(t text) returns date
language plpgsql immutable set search_path = public as $$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return t::date;
exception when others then
  return null;
end $$;
-- ── FIN abo_date

-- Un nombre écrit dans le jsonb, sinon rien.
create or replace function public.abo_num(v jsonb) returns numeric
language sql immutable set search_path = public as $$
  select case jsonb_typeof(v)
    when 'number' then (v #>> '{}')::numeric
    when 'string' then case when btrim(v #>> '{}') ~ '^-?\d+(\.\d+)?$' then btrim(v #>> '{}')::numeric end
  end;
$$;

-- Vrai au sens du navigateur : ni absent, ni null, ni false, ni "", ni 0.
create or replace function public.abo_vrai(v jsonb) returns boolean
language sql immutable set search_path = public as $$
  select v is not null and jsonb_typeof(v) <> 'null'
     and v <> 'false'::jsonb and v <> '""'::jsonb and not (jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric = 0);
$$;

-- ── DEBUT abo_jour_ouvre (jourOuvre)
-- LE DIMANCHE PASSE AU LUNDI : la porte de la Maison est close le dimanche.
create or replace function public.abo_jour_ouvre(d date) returns date
language sql immutable set search_path = public as $$
  select case when d is not null and extract(isodow from d) = 7 then d + 1 else d end;
$$;
-- ── FIN abo_jour_ouvre

-- ── DEBUT abo_vie_du_contrat (debutDuContratLu, finDuContratLu, dansLaVie, estUnPaquet)
create or replace function public.abo_debut(s jsonb) returns date
language sql immutable set search_path = public as $$
  select coalesce(public.abo_date(s->>'startIso'), public.abo_date(s->>'sinceIso'), date '0001-01-01');
$$;

create or replace function public.abo_fin(s jsonb) returns date
language sql immutable set search_path = public as $$
  select public.abo_date(s->>'expiresIso');
$$;

-- Rien avant la signature ; le dernier jour vendu en fait partie.
create or replace function public.abo_dans_la_vie(s jsonb, d date) returns boolean
language sql immutable set search_path = public as $$
  select d is not null and d >= public.abo_debut(s) and (public.abo_fin(s) is null or d <= public.abo_fin(s));
$$;

create or replace function public.abo_est_un_paquet(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p->>'mode', '') = 'pack';
$$;
-- ── FIN abo_vie_du_contrat

-- ── DEBUT abo_lunes (dureeDeLaLune, luneDeLaDate, prochaineIsoApresReglement)
create or replace function public.abo_duree_de_la_lune(s jsonb) returns int
language sql immutable set search_path = public as $$
  select case s->>'cycle' when 'annuel' then 365 when 'semestriel' then 180 else 30 end;
$$;

-- LA LUNE QUI CONTIENT CETTE DATE, [du, au). Le jour, pas l'échéance,
-- choisit la lune.
create or replace function public.abo_lune_de_la_date(s jsonb, d date) returns daterange
language plpgsql immutable set search_path = public as $$
declare
  v_n     date := public.abo_date(s->>'nextIso');
  v_l     int  := public.abo_duree_de_la_lune(s);
  v_ancre date;
  v_du    date;
begin
  if v_n is null or d is null then
    return null;
  end if;
  v_ancre := v_n - v_l;
  v_du := v_ancre + (floor((d - v_ancre)::numeric / v_l) * v_l)::int;
  return daterange(v_du, v_du + v_l, '[)');
end $$;

-- LA LUNE QUI SUIT UN RÈGLEMENT : réglée d'avance, elle prolonge la lune en
-- cours ; réglée en pause, elle commence le jour du règlement.
create or replace function public.abo_prochaine_iso_apres_reglement(s jsonb, j date) returns date
language sql immutable set search_path = public as $$
  select (case when public.abo_date(s->>'nextIso') is not null and public.abo_date(s->>'nextIso') > j
               then public.abo_date(s->>'nextIso') else j end) + public.abo_duree_de_la_lune(s);
$$;
-- ── FIN abo_lunes

-- ── DEBUT abo_inclus (soinDeLaLune, inclusALaDate)
create or replace function public.abo_soin_de_la_lune(p jsonb, depuis text, d date) returns text
language plpgsql immutable set search_path = public as $$
declare
  v_soins jsonb := case when jsonb_typeof(p->'soinsDeLaLune') = 'array' then p->'soinsDeLaLune' else '[]'::jsonb end;
  v_n     int   := jsonb_array_length(case when jsonb_typeof(p->'soinsDeLaLune') = 'array' then p->'soinsDeLaLune' else '[]'::jsonb end);
  v_dep   date  := public.abo_date(depuis);
begin
  if v_n = 0 or d is null then
    return null;
  end if;
  if coalesce(depuis, '') = '' or (v_dep is not null and d < v_dep) then
    return v_soins->>0;
  end if;
  if v_dep is null then
    return null;
  end if;
  return v_soins->>((floor((d - v_dep)::numeric / 30))::int % v_n);
end $$;

-- LE CONTENU VENDU À CETTE DATE : ses quotas à elle, sinon ceux de la
-- formule, et le soin de la lune du moment.
create or replace function public.abo_inclus_a_la_date(s jsonb, p jsonb, d date) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  v_base jsonb := case when jsonb_typeof(s->'inclusPropres') = 'array' then s->'inclusPropres'
                       when p is not null and jsonb_typeof(p->'included') = 'array' then p->'included'
                       else '[]'::jsonb end;
  v_soin text;
begin
  if p is not null then
    v_soin := public.abo_soin_de_la_lune(p, coalesce(s->>'sinceIso', s->>'startIso'), d);
  end if;
  if v_soin is not null and not exists (select 1 from jsonb_array_elements(v_base) i where i->>'serviceId' = v_soin) then
    v_base := v_base || jsonb_build_array(jsonb_build_object('serviceId', v_soin, 'qty', 1));
  end if;
  return v_base;
end $$;
-- ── FIN abo_inclus

-- ── DEBUT abo_seance (instantDe, etatDeLaSeance, prendUnCredit)
-- Un instant ISO ; sans fuseau, l'heure de Cotonou (UTC+1, sans heure d'été).
create or replace function public.abo_instant(t text) returns timestamptz
language plpgsql immutable set search_path = public as $$
declare
  v text;
begin
  if t is null or t = '' then
    return null;
  end if;
  v := case when length(t) <= 10 then t || 'T00:00:00' else t end;
  if v !~ '([zZ]|[+-]\d{2}:?\d{2})$' then
    v := v || '+01:00';
  end if;
  return v::timestamptz;
exception when others then
  return null;
end $$;

create or replace function public.abo_debut_de_la_seance(a jsonb) returns timestamptz
language plpgsql immutable set search_path = public as $$
declare
  h text[] := regexp_match(coalesce(a->>'time', ''), '^(\d{1,2}):(\d{2})$');
begin
  return public.abo_instant(coalesce(a->>'date', '') || 'T'
    || case when h is null then '00:00' else lpad(h[1], 2, '0') || ':' || h[2] end || ':00');
end $$;

-- L'ÉTAT D'UNE SÉANCE, lu sur les faits. Annulée à moins de 24 h par la
-- cliente, ou absente : « manquée », comptée.
create or replace function public.abo_etat_de_la_seance(a jsonb, jour date) returns text
language plpgsql immutable set search_path = public as $$
declare
  v_st     text := a->>'status';
  v_heures numeric;
begin
  if v_st = 'honoré' then
    return 'faite';
  end if;
  if public.abo_vrai(a->'absente') then
    return 'manquee';
  end if;
  if v_st = 'annulé' then
    -- UNE PROPOSITION REFUSÉE N'EST PAS UNE ANNULATION.
    if public.abo_vrai(a->'proposeeLe') and not public.abo_vrai(a->'confirmeeParLaClienteLe') then
      return 'annulee';
    end if;
    if a->>'annuleePar' = 'maison' or not public.abo_vrai(a->'annuleeLe') then
      return 'annulee';
    end if;
    v_heures := extract(epoch from (public.abo_debut_de_la_seance(a) - public.abo_instant(a->>'annuleeLe'))) / 3600;
    return case when v_heures is not null and v_heures < 24 then 'manquee' else 'annulee' end;
  end if;
  if coalesce(a->>'date', '') < jour::text then
    return 'a-cloturer';
  end if;
  if public.abo_vrai(a->'proposeeLe') and v_st = 'en attente' and not public.abo_vrai(a->'confirmeeParLaClienteLe') then
    return 'proposee';
  end if;
  return case when v_st = 'en attente' then 'a-confirmer' else 'confirmee' end;
end $$;

-- Cet état prend-il un crédit ? Tout sauf l'annulée et la manquée rendue.
create or replace function public.abo_prend_un_credit(a jsonb, jour date) returns boolean
language sql immutable set search_path = public as $$
  select e <> 'annulee' and not (e = 'manquee' and public.abo_vrai(a->'rendue'))
    from (select public.abo_etat_de_la_seance(a, jour) as e) x;
$$;
-- ── FIN abo_seance

-- ── DEBUT abo_attribution (contratDeLaSeance, compteLaSeance)
-- À QUEL CONTRAT APPARTIENT CETTE SÉANCE ? Celui que nomme `subId`, et lui
-- seul ; sans lien, le plus récent en vie ce jour-là qui porte l'une de ses
-- prestations, sinon le plus récent en vie.
create or replace function public.abo_contrat_de_la_seance(a jsonb) returns text
language plpgsql stable set search_path = public as $$
declare
  v_jour date := public.abo_date(a->>'date');
  v_id   text;
begin
  if coalesce(a->>'subId', '') <> '' then
    select s.id into v_id from public.subscribers s
     where s.id = a->>'subId' and s.data->>'clientId' = a->>'clientId';
    return v_id;
  end if;
  if v_jour is null then
    return null;
  end if;
  select s.id into v_id
    from public.subscribers s
    left join public.plans p on p.id = s.data->>'planId'
   where s.data->>'clientId' = a->>'clientId'
     and public.abo_dans_la_vie(s.data, v_jour)
   order by (exists (
              select 1 from jsonb_array_elements(public.abo_inclus_a_la_date(s.data, p.data, v_jour)) i
               where jsonb_typeof(a->'serviceIds') = 'array' and a->'serviceIds' ? (i->>'serviceId'))) desc,
            public.abo_debut(s.data) desc, s.id
   limit 1;
  return v_id;
end $$;

-- CETTE SÉANCE PREND-ELLE UN CRÉDIT DE CE CONTRAT ? Couverte, pas par un
-- forfait, rattachée à lui, dans sa vie, pas après sa résiliation, et son
-- état prend un crédit.
create or replace function public.abo_compte(a jsonb, s_id text, s jsonb, jour date) returns boolean
language sql stable set search_path = public as $$
  select public.abo_vrai(a->'coveredBySub')
     and coalesce(a->>'coverKind', '') <> 'forfait'
     and public.abo_dans_la_vie(s, public.abo_date(a->>'date'))
     and public.abo_contrat_de_la_seance(a) = s_id
     and not (public.abo_vrai(s->'resilieeLe') and coalesce(a->>'date', '') > (s->>'resilieeLe'))
     and public.abo_prend_un_credit(a, jour);
$$;

-- Les séances qui comptent sur ce contrat, pour une prestation, dans une
-- fenêtre [du, au) (sans borne : toute la vie), hors celle que l'on déplace.
create or replace function public.abo_seances_comptees(
  p_sub_id text, p_jour date, p_service text, p_du date, p_au date, p_sauf text
) returns int
language sql stable set search_path = public as $$
  select count(*)::int
    from public.subscribers s
    join public.appointments a on a.data->>'clientId' = s.data->>'clientId'
   where s.id = p_sub_id
     and (p_sauf is null or a.id <> p_sauf)
     and (p_service is null or (jsonb_typeof(a.data->'serviceIds') = 'array' and a.data->'serviceIds' ? p_service))
     and (p_du is null or coalesce(a.data->>'date', '') >= p_du::text)
     and (p_au is null or coalesce(a.data->>'date', '') < p_au::text)
     and public.abo_compte(a.data, s.id, s.data, p_jour);
$$;
-- ── FIN abo_attribution

-- ── DEBUT abo_argent (versementsDuContrat, prixParDefaut, echeancesDeBase, retard d'argentDuContrat)
-- LE VERSÉ : ses versements à elle et ceux de sa pièce, réunis par
-- identifiant. Le contrat d'abord : à identifiant égal, c'est son montant.
create or replace function public.abo_verse(s jsonb) returns numeric
language sql stable set search_path = public as $$
  select coalesce(sum(m), 0)
    from (
      select distinct on (vid) vid, m
        from (
          select p->>'id' as vid, coalesce(public.abo_num(p->'amountXof'), 0) as m, 0 as o
            from jsonb_array_elements(case when jsonb_typeof(s->'payments') = 'array' then s->'payments' else '[]'::jsonb end) p
           where coalesce(p->>'id', '') <> ''
          union all
          select p->>'id', coalesce(public.abo_num(p->'amountXof'), 0), 1
            from public.invoices i,
                 jsonb_array_elements(case when jsonb_typeof(i.data->'payments') = 'array' then i.data->'payments' else '[]'::jsonb end) p
           where i.id = s->>'invoiceId' and coalesce(p->>'id', '') <> ''
        ) x
       order by vid, o
    ) y;
$$;

-- LE PRIX VENDU : le prix convenu, sinon le prix du paquet, sinon celui de
-- la formule.
create or replace function public.abo_prix(s jsonb, p jsonb) returns numeric
language sql immutable set search_path = public as $$
  select coalesce(public.abo_num(s->'prixConvenuXof'),
                  case when public.abo_est_un_paquet(p) then public.abo_num(s->'priceXof') end,
                  public.abo_num(p->'priceXof'), 0);
$$;

-- L'échéancier qui fait foi : celui du contrat, sinon, pour un paquet, son
-- prix entier attendu à la signature.
create or replace function public.abo_echeances_de_base(s jsonb, p jsonb, prix numeric) returns jsonb
language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(s->'echeances') = 'array' and jsonb_array_length(s->'echeances') > 0 then s->'echeances'
    when public.abo_est_un_paquet(p) and prix > 0
      then jsonb_build_array(jsonb_build_object('numero', 1, 'dueIso', public.abo_debut(s)::text, 'amountXof', prix))
    else '[]'::jsonb end;
$$;

-- LE RETARD, EN JOURS : la plus vieille échéance échue LA VEILLE ou avant
-- (le jour même se lit « à régler aujourd'hui »), jugée le lundi quand elle
-- est écrite un dimanche. Une retenue, une résiliée, une effacée : aucun.
create or replace function public.abo_retard_jours(s jsonb, p jsonb, jour date, etat text) returns int
language plpgsql stable set search_path = public as $$
declare
  v_reserve numeric;
  e         jsonb;
  v_m       numeric;
  v_pris    numeric;
  v_due     date;
  v_max     int := 0;
begin
  if etat in ('resiliee', 'effacee', 'retenue') then
    return 0;
  end if;
  v_reserve := greatest(0, public.abo_verse(s));
  for e in
    select x from jsonb_array_elements(public.abo_echeances_de_base(s, p, public.abo_prix(s, p))) x
     order by public.abo_num(x->'numero')
  loop
    v_m := coalesce(public.abo_num(e->'amountXof'), 0);
    v_pris := least(v_reserve, v_m);
    v_reserve := v_reserve - v_pris;
    v_due := public.abo_jour_ouvre(public.abo_date(e->>'dueIso'));
    if v_m - v_pris <> 0 and v_due is not null and v_due < jour then
      v_max := greatest(v_max, jour - v_due);
    end if;
  end loop;
  return v_max;
end $$;
-- ── FIN abo_argent

-- ── DEBUT abo_etat_de_la_formule (etatDeLaFormule)
-- L'ÉTAT D'UNE FORMULE, LU ET NON STOCKÉ. L'ordre des questions est la
-- définition : résiliée › effacée › terminée › retenue › en pause ›
-- épuisée › en cours. `exhausted`, `risk`, `new` ne décident de rien.
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
  v_s      record;
  v_p      jsonb;
  v_etat   text;
  v_n      date;
  v_lune   daterange;
  v_ligne  jsonb;
  v_q      numeric;
begin
  select s.id, s.data into v_s from public.subscribers s where s.id = p_sub_id;
  if v_s.id is null then
    return 'contrat_introuvable';
  end if;
  select pl.data into v_p from public.plans pl where pl.id = v_s.data->>'planId';
  v_etat := public.abo_etat_de_la_formule(v_s.id, v_s.data, v_p, p_jour)->>'etat';

  -- DÉPLACER LA DERNIÈRE SÉANCE D'UN PAQUET : il est épuisé par elle-même,
  -- elle doit pouvoir changer de jour sur son propre contrat.
  if v_etat <> 'en-cours' and not (
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
  if public.abo_vrai(v_s.data->'resilieeLe') and p_date::text > (v_s.data->>'resilieeLe') then
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

-- Ce qui reste de cette prestation sur ce contrat, dans la fenêtre de la
-- date (`null` : sans limite).
create or replace function public.abo_disponibles(p_sub_id text, p_service text, p_date date, p_jour date) returns int
language plpgsql stable set search_path = public as $$
declare
  v_s     record;
  v_p     jsonb;
  v_lune  daterange;
  v_q     numeric;
begin
  select s.id, s.data into v_s from public.subscribers s where s.id = p_sub_id;
  if v_s.id is null then
    return null;
  end if;
  select pl.data into v_p from public.plans pl where pl.id = v_s.data->>'planId';
  if not public.abo_est_un_paquet(v_p) then
    v_lune := public.abo_lune_de_la_date(v_s.data, p_date);
  end if;
  select public.abo_num(x->'qty') into v_q
    from jsonb_array_elements(public.abo_inclus_a_la_date(v_s.data, v_p, p_date)) x
   where x->>'serviceId' = p_service limit 1;
  if v_q is null then
    return null;
  end if;
  return greatest(0, v_q - public.abo_seances_comptees(v_s.id, p_jour, p_service, lower(v_lune), upper(v_lune), null))::int;
end $$;

-- ── DEBUT abo_prix_du_foyer (prixDuFoyer)
-- LE PRIX DU FOYER pour la deuxième ou la troisième tête : −15 %, sans que
-- l'avantage total de la tête dépasse 25 % sous la valeur à la carte.
-- Arrondi au 500 F SUPÉRIEUR. Rend le prix de la tête si le Foyer n'ajoute
-- rien.
create or replace function public.abo_prix_du_foyer(prix numeric, valeur numeric) returns numeric
language plpgsql immutable set search_path = public as $$
declare
  v_sien  numeric;
  v_total numeric;
begin
  if not (coalesce(valeur, 0) > 0) or not (coalesce(prix, 0) > 0) then
    return prix;
  end if;
  v_sien := greatest(0, 1 - prix / valeur);
  v_total := least(v_sien + 0.15, 0.25);
  if v_total <= v_sien + 0.000000001 then
    return prix;
  end if;
  return least(prix, ceil(valeur * (1 - v_total) / 500) * 500);
end $$;
-- ── FIN abo_prix_du_foyer

-- LA VALEUR À LA CARTE, RELUE DANS LA FORMULE. Le serveur ne sait pas
-- refaire le Juste Prix d'une tête ; il relit ce que la formule annonce
-- d'elle-même : sur un carnet, les séances vendues pour les séances payées
-- (« six venues, la sixième offerte » : 140 000 F × 6 / 5 = 168 000 F) ;
-- sinon son avantage écrit (`discountPct`). Sans avantage écrit : son prix.
create or replace function public.abo_valeur_a_la_carte(prix numeric, p jsonb) returns numeric
language plpgsql immutable set search_path = public as $$
declare
  v_pct    numeric := least(greatest(coalesce(public.abo_num(p->'discountPct'), 0), 0), 99);
  v_q      numeric;
  v_payees numeric;
begin
  if v_pct <= 0 or not (coalesce(prix, 0) > 0) then
    return prix;
  end if;
  select max(public.abo_num(i->'qty')) into v_q
    from jsonb_array_elements(case when jsonb_typeof(p->'included') = 'array' then p->'included' else '[]'::jsonb end) i;
  if v_q is not null and v_q > 0 then
    v_payees := v_q * (1 - v_pct / 100);
    if abs(v_payees - round(v_payees)) <= 0.05 and round(v_payees) between 1 and v_q then
      return prix * v_q / round(v_payees);
    end if;
  end if;
  return prix / (1 - v_pct / 100);
end $$;

-- LE RANG DE LA TÊTE DANS SON FOYER : 1 + les AUTRES têtes du même foyer
-- qui portent une formule qui court (retenue, en cours, en pause, épuisée).
create or replace function public.abo_rang_dans_le_foyer(p_tete text, p_jour date) returns int
language sql stable set search_path = public as $$
  select 1 + count(distinct c.id)::int
    from public.clients moi
    join public.clients c
      on c.data->>'familyId' = moi.data->>'familyId' and c.id <> moi.id
    join public.subscribers s on s.data->>'clientId' = c.id
    left join public.plans p on p.id = s.data->>'planId'
   where moi.id = p_tete
     and coalesce(moi.data->>'familyId', '') <> ''
     and public.abo_etat_de_la_formule(s.id, s.data, p.data, p_jour)->>'etat' in ('retenue', 'en-cours', 'en-pause', 'epuisee');
$$;

-- Les outils du juge ne s'ouvrent à personne de dehors. Seul `abo_iso`
-- reste ouvert : la garde (⑦) l'appelle avec les droits de qui écrit.
do $$
declare
  f text;
begin
  foreach f in array array[
    'abo_aujourdhui()', 'abo_maintenant()', 'abo_date(text)', 'abo_num(jsonb)', 'abo_vrai(jsonb)',
    'abo_jour_ouvre(date)', 'abo_debut(jsonb)', 'abo_fin(jsonb)', 'abo_dans_la_vie(jsonb, date)', 'abo_est_un_paquet(jsonb)',
    'abo_duree_de_la_lune(jsonb)', 'abo_lune_de_la_date(jsonb, date)', 'abo_prochaine_iso_apres_reglement(jsonb, date)',
    'abo_soin_de_la_lune(jsonb, text, date)', 'abo_inclus_a_la_date(jsonb, jsonb, date)', 'abo_instant(text)',
    'abo_debut_de_la_seance(jsonb)', 'abo_etat_de_la_seance(jsonb, date)', 'abo_prend_un_credit(jsonb, date)',
    'abo_contrat_de_la_seance(jsonb)', 'abo_compte(jsonb, text, jsonb, date)',
    'abo_seances_comptees(text, date, text, date, date, text)', 'abo_verse(jsonb)', 'abo_prix(jsonb, jsonb)',
    'abo_echeances_de_base(jsonb, jsonb, numeric)', 'abo_retard_jours(jsonb, jsonb, date, text)',
    'abo_etat_de_la_formule(text, jsonb, jsonb, date)', 'abo_peut_porter(text, text, date, date, text)',
    'abo_disponibles(text, text, date, date)', 'abo_prix_du_foyer(numeric, numeric)',
    'abo_valeur_a_la_carte(numeric, jsonb)', 'abo_rang_dans_le_foyer(text, date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;


-- ══ ① LA RÉFÉRENCE DU CONTRAT ET LE NUMÉRO DE LA PIÈCE ═════════════════
-- La même règle qu'au comptoir (`prochaineReferenceAbo`, `nextInvoiceNumber`) :
-- le plus grand numéro de l'année plus un, jamais un numéro déjà pris, toutes
-- branches confondues. Sous verrou : deux souscriptions au même instant ne
-- tirent pas le même. Résiduel accepté, comme entre deux postes du Trône :
-- un comptoir HORS LIGNE qui n'a pas encore vu le dernier numéro.

-- ── DEBUT abo_numeros (prochaineReferenceAbo, nextInvoiceNumber)
create or replace function public.abo_prochaine_reference(p_annee int) returns text
language plpgsql volatile set search_path = public as $$
declare
  v_max int;
  v_n   int;
  v_ref text;
begin
  perform pg_advisory_xact_lock(hashtext('abo-reference'));
  select coalesce(max((substring(s.data->>'reference' from '^ABO-' || p_annee || '-(\d+)$'))::int), 0)
    into v_max from public.subscribers s;
  v_n := v_max + 1;
  loop
    v_ref := 'ABO-' || p_annee || '-' || case when length(v_n::text) >= 3 then v_n::text else lpad(v_n::text, 3, '0') end;
    exit when not exists (select 1 from public.subscribers s where s.data->>'reference' = v_ref);
    v_n := v_n + 1;
  end loop;
  return v_ref;
end $$;

create or replace function public.abo_prochain_numero_de_piece(p_serie text, p_annee int) returns text
language plpgsql volatile set search_path = public as $$
declare
  v_max int;
  v_n   int;
  v_num text;
begin
  perform pg_advisory_xact_lock(hashtext('piece-numero'), hashtext(p_serie));
  select coalesce(max((substring(i.data->>'number' from '^' || p_serie || '-' || p_annee || '-(\d+)$'))::int), 0)
    into v_max from public.invoices i;
  v_n := v_max + 1;
  loop
    v_num := p_serie || '-' || p_annee || '-' || case when length(v_n::text) >= 4 then v_n::text else lpad(v_n::text, 4, '0') end;
    exit when not exists (select 1 from public.invoices i where i.data->>'number' = v_num);
    v_n := v_n + 1;
  end loop;
  return v_num;
end $$;
-- ── FIN abo_numeros

revoke all on function public.abo_prochaine_reference(int) from public, anon, authenticated;
revoke all on function public.abo_prochain_numero_de_piece(text, int) from public, anon, authenticated;


-- ══ ② LA SOUSCRIPTION EN LIGNE, 5e VERSION ═══════════════════════════
-- Ce qui change depuis 0127 :
--   · DEUX FORMULES EN MÊME TEMPS (tranché au sélecteur le 20 octobre
--     2026) : une formule qui court ne refuse plus rien. Refusent encore la
--     formule fermée, « une fois par tête » (une retenue effacée, jamais
--     réglée, ne compte pas) et Les Premières Lunes hors de leurs 30 jours ;
--   · la RÉFÉRENCE ABO, posée ici comme au comptoir ;
--   · l'échéancier J, J+30, J+60 sans dimanche (porte close : le lundi) ;
--   · LE FOYER (décision 12) : −15 % pour la deuxième et la troisième tête,
--     jamais plus de 25 % sous la valeur à la carte, écrit comme un prix
--     convenu avec son motif, comme au comptoir ;
--   · Chaque Lune : `nextIso` = le jour de la signature (la lune commence au
--     RÈGLEMENT) ; un paquet : `nextIso` = sa fin, comme au comptoir ;
--   · `p_tete` : la tête pour qui elle souscrit (elle-même, ou l'enfant
--     qu'elle porte, `est_ma_tete`). Facultatif : sans lui, elle-même.
-- Le prix se relit toujours dans la grille, jamais reçu.
drop function if exists public.souscrire_a_une_formule(text, int, text, text);

create or replace function public.souscrire_a_une_formule(
  p_plan_id  text,
  p_parts    int default 1,
  p_band_id  text default null,
  p_longueur text default null,
  p_tete     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    text := (auth.uid())::text;
  v_fiche  public.clients%rowtype;
  v_tete   public.clients%rowtype;
  v_plan   public.plans%rowtype;
  v_prix   numeric;
  v_avant  numeric;
  v_seuil2 numeric;
  v_seuil3 numeric;
  v_jours  int;
  v_base   numeric;
  v_reste  numeric;
  v_ech    jsonb := '[]'::jsonb;
  v_id     text;
  v_ref    text;
  v_today  date := public.abo_aujourdhui();
  v_mois   numeric;
  v_ecrit  numeric;
  v_coef   numeric;
  v_supp   numeric := 0;
  v_une    text;
  v_rang   int := 1;
  v_motif  text;
  v_pack   boolean;
  refus    text;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;

  select * into v_fiche from public.clients
   where id = v_uid or data->>'authUserId' = v_uid
   order by (data->>'authUserId' = v_uid) desc
   limit 1;
  if v_fiche.id is null then
    return jsonb_build_object('ok', false, 'erreur', 'aucune_fiche', 'raison', 'aucune_fiche');
  end if;

  -- LA TÊTE : elle-même, ou une tête qu'elle porte.
  if coalesce(p_tete, '') = '' or p_tete = v_fiche.id then
    v_tete := v_fiche;
  else
    if not public.est_ma_tete(p_tete) then
      return jsonb_build_object('ok', false, 'erreur', 'tete_refusee', 'raison', 'tete_refusee');
    end if;
    select * into v_tete from public.clients where id = p_tete;
    if v_tete.id is null then
      return jsonb_build_object('ok', false, 'erreur', 'tete_refusee', 'raison', 'tete_refusee');
    end if;
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan.id is null then
    return jsonb_build_object('ok', false, 'erreur', 'formule_inconnue', 'raison', 'formule_inconnue');
  end if;
  v_pack := coalesce(v_plan.data->>'mode', '') = 'pack';

  -- FERMÉE À LA VENTE : non, sauf la reprise unique d'une formule fermée par
  -- la bascule de janvier, que la tête tenait avant (inchangé depuis 0127).
  if coalesce((v_plan.data->>'fermee')::boolean, false) then
    if not (
      coalesce((v_plan.data->>'fermeeParLaBascule')::boolean, false)
      and exists (select 1 from public.subscribers s
                   where s.data->>'clientId' = v_tete.id and s.data->>'planId' = v_plan.id
                     and coalesce(s.data->>'startIso', s.data->>'sinceIso', '') <> ''
                     and coalesce(s.data->>'startIso', s.data->>'sinceIso') < '2027-01-01')
      and not exists (select 1 from public.subscribers s
                   where s.data->>'clientId' = v_tete.id and s.data->>'planId' = v_plan.id
                     and coalesce(s.data->>'startIso', s.data->>'sinceIso', '') >= '2027-01-01')
    ) then
      return jsonb_build_object('ok', false, 'erreur', 'formule_fermee', 'raison', 'formule_fermee');
    end if;
  end if;

  -- UNE FOIS PAR TÊTE : tout contrat compte, même fini, sauf une retenue
  -- effacée (jamais réglée).
  v_une := nullif(v_plan.data->>'uneFoisParTete', '');
  if v_une is not null and exists (
    select 1 from public.subscribers s
      join public.plans p on p.id = s.data->>'planId'
     where s.data->>'clientId' = v_tete.id and p.data->>'uneFoisParTete' = v_une
       and public.abo_etat_de_la_formule(s.id, s.data, p.data, v_today)->>'etat' <> 'effacee'
  ) then
    return jsonb_build_object('ok', false, 'erreur', 'deja_prise', 'raison', 'deja_prise');
  end if;

  -- LES PREMIÈRES LUNES : dans les 30 jours d'une création honorée à la Maison.
  if v_une = 'premieres-lunes' and not exists (
    select 1 from public.appointments a
     where a.data->>'clientId' = v_tete.id
       and a.data->>'status' = 'honoré'
       and public.abo_date(a.data->>'date') >= v_today - 30
       and exists (select 1 from jsonb_array_elements_text(coalesce(a.data->'serviceIds', '[]'::jsonb)) sid
                     join public.catalog_services cs on cs.id = sid
                    where cs.data->>'categoryId' = 'atl-i-vekpe')
  ) then
    return jsonb_build_object('ok', false, 'erreur', 'apres_une_creation', 'raison', 'apres_une_creation');
  end if;

  v_prix := greatest(0, round(coalesce((v_plan.data->>'priceXof')::numeric, 0)));

  -- LE CALIBRE (inchangé depuis la 0082). La case écrite passe devant le calcul.
  if p_band_id is not null and p_band_id <> '' then
    v_ecrit := (v_plan.data->'prixParCalibre'->>p_band_id)::numeric;
    if v_ecrit is not null then
      v_prix := greatest(0, round(v_ecrit));
    elsif coalesce((v_plan.data->>'suitLeCalibre')::boolean, false) then
      select (b.value->>'coef')::numeric into v_coef
        from public.documents d,
             lateral jsonb_array_elements(coalesce(d.data->'abonnements', '[]'::jsonb)) b
       where d.key = 'mnd_model_band_sets' and b.value->>'id' = p_band_id
       limit 1;
      if v_coef is null then
        select (b.value->>'coef')::numeric into v_coef
          from public.documents d,
               lateral jsonb_array_elements(coalesce(d.data, '[]'::jsonb)) b
         where d.key = 'mnd_model_bands' and b.value->>'id' = p_band_id
         limit 1;
      end if;
      if v_coef is not null and v_coef > 0 then
        v_prix := public.mnd_arrondi_500(v_prix * v_coef);
      end if;
    end if;
  end if;

  if p_longueur is not null and p_longueur <> '' then
    v_supp := greatest(0, round(coalesce((v_plan.data->'supplementLongueur'->>p_longueur)::numeric, 0)));
  end if;
  v_prix := v_prix + v_supp;

  if v_prix <= 0 then
    return jsonb_build_object('ok', false, 'erreur', 'prix_absent', 'raison', 'prix_absent');
  end if;

  -- LE FOYER (décision 12) : la deuxième ou la troisième tête.
  v_avant := v_prix;
  v_rang := public.abo_rang_dans_le_foyer(v_tete.id, v_today);
  if v_rang in (2, 3) then
    v_prix := public.abo_prix_du_foyer(v_prix, public.abo_valeur_a_la_carte(v_prix, v_plan.data));
  end if;

  -- EN 1, 2 OU 3 FOIS : deux fois dès 100 000 F, trois fois dès 200 000 F.
  if p_parts not in (1, 2, 3) then
    return jsonb_build_object('ok', false, 'erreur', 'decoupe_refusee', 'raison', 'decoupe_refusee');
  end if;
  select coalesce((d.data->>'seuilDeuxFoisXof')::numeric, 100000),
         coalesce((d.data->>'seuilTroisFoisXof')::numeric, 200000)
    into v_seuil2, v_seuil3
    from public.documents d where d.key = 'mnd_vitrine_config';
  v_seuil2 := coalesce(v_seuil2, 100000);
  v_seuil3 := coalesce(v_seuil3, 200000);
  if p_parts = 2 and v_prix < v_seuil2 then
    return jsonb_build_object('ok', false, 'erreur', 'seuil_non_atteint', 'raison', 'seuil_non_atteint', 'seuil', v_seuil2);
  end if;
  if p_parts = 3 and v_prix < v_seuil3 then
    return jsonb_build_object('ok', false, 'erreur', 'seuil_non_atteint', 'raison', 'seuil_non_atteint', 'seuil', v_seuil3);
  end if;

  -- L'ÉCHÉANCIER, SANS DIMANCHE : une date qui tomberait un dimanche
  -- s'écrit le lundi.
  if p_parts > 1 then
    v_base  := floor(v_prix / p_parts);
    v_reste := v_prix - v_base * p_parts;
    v_ech := jsonb_build_array(
      jsonb_build_object('numero', 1, 'dueIso', public.abo_jour_ouvre(v_today)::text, 'amountXof', v_base + v_reste),
      jsonb_build_object('numero', 2, 'dueIso', public.abo_jour_ouvre(v_today + 30)::text, 'amountXof', v_base)
    );
    if p_parts = 3 then
      v_ech := v_ech || jsonb_build_array(
        jsonb_build_object('numero', 3, 'dueIso', public.abo_jour_ouvre(v_today + 60)::text, 'amountXof', v_base));
    end if;
  end if;

  v_jours := coalesce((v_plan.data->>'validityDays')::int, 365);
  v_mois  := greatest(1, round(v_jours::numeric / 30));

  v_motif := case
    when coalesce((v_plan.data->>'fermee')::boolean, false) then 'Son renouvellement, à l’ancien prix (bascule de janvier 2027)'
    when v_prix < v_avant then 'Le Foyer · ' || case when v_rang = 2 then 'deuxième' else 'troisième' end || ' tête (−15 %, plafond 25 %)'
    when p_band_id is not null and p_band_id <> '' then 'Calibre déclaré à la souscription en ligne'
    else null end;

  v_id := 'ab-' || replace(gen_random_uuid()::text, '-', '');
  v_ref := public.abo_prochaine_reference(extract(year from v_today)::int);

  insert into public.subscribers (id, branch_id, data, updated_at)
  values (
    v_id,
    coalesce(v_tete.branch_id, v_fiche.branch_id),
    jsonb_strip_nulls(jsonb_build_object(
      'id', v_id,
      'branchId', coalesce(v_tete.branch_id, v_fiche.branch_id),
      'clientId', v_tete.id,
      'name', coalesce(v_tete.data->>'name', 'Cliente'),
      'planId', v_plan.id,
      'reference', v_ref,
      'cycle', 'mensuel',
      'slot', 'Créneau à réserver',
      -- LA LUNE COMMENCE AU RÈGLEMENT ; le paquet porte sa fin, comme au comptoir.
      'nextIso', case when v_pack then (v_today + v_jours)::text else v_today::text end,
      'sinceIso', v_today::text,
      'since', 'ce mois',
      'status', 'new',
      'payments', '[]'::jsonb,
      'mrrXof', case when v_pack then round(v_prix / v_mois) else v_prix end,
      'echeances', case when p_parts > 1 then v_ech else null end,
      'startIso', case when v_pack then v_today::text else null end,
      'expiresIso', case when v_pack then (v_today + v_jours)::text else null end,
      'priceXof', case when v_pack then v_prix else null end,
      'prixConvenuXof', v_prix,
      'calibreVendu', nullif(coalesce(p_band_id, ''), ''),
      'longueurVendue', nullif(coalesce(p_longueur, ''), ''),
      'motifConvenu', v_motif,
      'origine', 'couronne'
    )),
    now()
  );

  return jsonb_build_object(
    'ok', true, 'subId', v_id, 'reference', v_ref, 'totalXof', v_prix, 'parts', p_parts,
    'premiereXof', case when p_parts > 1 then v_base + v_reste else v_prix end,
    'echeances', v_ech,
    'foyerXof', v_avant - v_prix,
    'retenueJusquau', public.abo_jour_ouvre(v_today + 7)::text
  );
end;
$$;

revoke all on function public.souscrire_a_une_formule(text, int, text, text, text) from public, anon;
grant execute on function public.souscrire_a_une_formule(text, int, text, text, text) to authenticated;


-- ══ ③ LE SEUL CHEMIN DE L'ARGENT D'UN CONTRAT ════════════════════════
-- « Le contrat fait foi, la pièce suit » (décision 6). KkiaPay écrivait le
-- contrat seul, MND PAY la pièce seule, le comptoir les deux : l'écran
-- disait « en retard » pour un argent reçu, et le chiffre du mois comptait
-- deux fois le même billet. Désormais UN versement s'écrit ICI, au contrat
-- ET à sa pièce, sous le même identifiant, dans la même transaction.
--
--   · IDEMPOTENT : un identifiant déjà inscrit des deux côtés ne réécrit
--     rien ; inscrit d'un seul côté (un chemin d'avant), il est complété de
--     l'autre.
--   · LA PIÈCE NAÎT AU PREMIER VERSEMENT : une par paquet, au total de la
--     formule ; une par lune pour une Chaque Lune (une pièce soldée en
--     appelle une neuve).
--   · LA LUNE AVANCE AU RÈGLEMENT : chaque lune entière versée la prolonge
--     (réglée d'avance) ou la fait partir du jour du règlement (en pause).
--   · Ouverte au personnel et aux fonctions du serveur, jamais à une cliente.
--
-- `p_versement` : { id, montantXof, date?, moyen?, cashbox?, encaissePar?,
-- note?, source? ('comptoir' | 'en-ligne' | 'lien' | 'mnd-pay') }.
create or replace function public.verse_sur_l_abonnement(p_sub_id text, p_versement jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_claims    jsonb;
  v_role      text := '';
  v_sub       public.subscribers%rowtype;
  v_plan      jsonb;
  v_piece     public.invoices%rowtype;
  v_id        text := btrim(coalesce(p_versement->>'id', ''));
  v_montant   numeric := round(coalesce(public.abo_num(p_versement->'montantXof'), 0));
  v_jour      date := coalesce(public.abo_date(p_versement->>'date'), public.abo_aujourdhui());
  v_moyen     text := coalesce(nullif(btrim(p_versement->>'moyen'), ''), 'Espèces');
  v_caisse    text := nullif(btrim(coalesce(p_versement->>'cashbox', '')), '');
  v_par       text := nullif(btrim(coalesce(p_versement->>'encaissePar', '')), '');
  v_note      text := coalesce(nullif(btrim(p_versement->>'note'), ''), 'Abonnement');
  v_pack      boolean;
  v_prix      numeric;
  v_nom       text;
  v_total     numeric;
  v_sur_c     boolean;
  v_sur_p     boolean := false;
  v_neuve     boolean := false;
  v_suite     date;
  v_lunes     int;
  v_payes     jsonb;
  v_ligne_p   jsonb;
  v_detail    text;
  v_maj       jsonb := '{}'::jsonb;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_role := coalesce(v_claims->>'role', '');
  exception when others then
    v_claims := '{}'::jsonb;
  end;
  -- Le personnel, un service de la Maison, ou la base elle-même (éditeur SQL).
  if not (v_claims is null or v_role = 'service_role' or public.is_staff()) then
    return jsonb_build_object('ok', false, 'raison', 'reserve_au_personnel');
  end if;
  if v_id = '' then
    return jsonb_build_object('ok', false, 'raison', 'versement_sans_identifiant');
  end if;
  if v_montant <= 0 then
    return jsonb_build_object('ok', false, 'raison', 'montant_invalide');
  end if;
  if v_montant > 5000000 then
    return jsonb_build_object('ok', false, 'raison', 'montant_hors_plafond');
  end if;

  select * into v_sub from public.subscribers where id = p_sub_id for update;
  if v_sub.id is null then
    return jsonb_build_object('ok', false, 'raison', 'contrat_introuvable');
  end if;
  select p.data into v_plan from public.plans p where p.id = v_sub.data->>'planId';
  v_pack := public.abo_est_un_paquet(v_plan);
  v_prix := public.abo_prix(v_sub.data, v_plan);
  v_nom := coalesce(v_plan->>'name', 'Abonnement');

  v_sur_c := exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(v_sub.data->'payments') = 'array' then v_sub.data->'payments' else '[]'::jsonb end) x
     where x->>'id' = v_id);

  if coalesce(v_sub.data->>'invoiceId', '') <> '' then
    select * into v_piece from public.invoices where id = v_sub.data->>'invoiceId' for update;
  end if;
  if v_piece.id is not null then
    v_sur_p := exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(v_piece.data->'payments') = 'array' then v_piece.data->'payments' else '[]'::jsonb end) x
       where x->>'id' = v_id);
  end if;

  if v_sur_c and v_sur_p then
    return jsonb_build_object('ok', true, 'dejaVerse', true, 'pieceId', v_piece.id);
  end if;

  -- LA PIÈCE : celle du contrat, ou une neuve. Une Chaque Lune dont la pièce
  -- est soldée en ouvre une pour la lune suivante.
  if not v_sur_p then
    if v_piece.id is not null and not v_pack then
      select coalesce(sum(coalesce(public.abo_num(l->'unitXof'), 0) * coalesce(public.abo_num(l->'qty'), 1)), 0)
        into v_total
        from jsonb_array_elements(case when jsonb_typeof(v_piece.data->'lines') = 'array' then v_piece.data->'lines' else '[]'::jsonb end) l;
      if (select coalesce(sum(coalesce(public.abo_num(x->'amountXof'), 0)), 0)
            from jsonb_array_elements(case when jsonb_typeof(v_piece.data->'payments') = 'array' then v_piece.data->'payments' else '[]'::jsonb end) x)
         >= v_total then
        v_piece := null;
      end if;
    end if;

    if v_piece.id is null then
      v_neuve := true;
      v_total := case when v_pack
        then v_prix + coalesce(public.abo_num(v_sub.data->'couleur'->'supplementXof'), 0)
        else v_prix end;
      select string_agg(
               case when public.abo_num(i->'qty') is null then coalesce(cs.data->>'name', i->>'serviceId') || ' (à volonté)'
                    else (public.abo_num(i->'qty'))::int || ' × ' || coalesce(cs.data->>'name', i->>'serviceId') end,
               ' · ')
        into v_detail
        from jsonb_array_elements(public.abo_inclus_a_la_date(v_sub.data, v_plan, v_jour)) i
        left join public.catalog_services cs on cs.id = i->>'serviceId';
      v_piece.id := 'inv-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
      v_piece.branch_id := coalesce(v_sub.branch_id, v_sub.data->>'branchId');
      v_piece.data := jsonb_strip_nulls(jsonb_build_object(
        'id', v_piece.id,
        'branchId', v_piece.branch_id,
        'kind', 'facture',
        'number', public.abo_prochain_numero_de_piece('MND', extract(year from public.abo_aujourdhui())::int),
        'clientId', v_sub.data->>'clientId',
        'clientName', v_sub.data->>'name',
        'date', case when v_pack then coalesce(public.abo_date(v_sub.data->>'sinceIso'), v_jour)::text else v_jour::text end,
        'lines', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'id', 'il-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
          'label', v_nom, 'qty', 1, 'unitXof', v_total, 'discountPct', 0, 'detail', v_detail))),
        'globalDiscountPct', 0,
        'theme', 'Aube',
        'status', 'envoyée',
        'creeeLe', public.abo_iso(public.abo_maintenant()),
        'note', 'Abonnement · ' || v_nom
                || coalesce(' · ' || nullif(v_sub.data->>'reference', ''), '')
                || case when jsonb_typeof(v_sub.data->'echeances') = 'array' and jsonb_array_length(v_sub.data->'echeances') > 1
                        then ' · réglable en ' || jsonb_array_length(v_sub.data->'echeances') || ' fois' else '' end,
        'subId', v_sub.id,
        'payments', '[]'::jsonb
      ));
    end if;

    -- LE VERSEMENT DE LA PIÈCE : ce que lit le journal de caisse.
    v_ligne_p := jsonb_strip_nulls(jsonb_build_object(
      'id', v_id, 'date', v_jour::text, 'amountXof', v_montant, 'method', v_moyen,
      'cashbox', v_caisse, 'note', v_note,
      'time', to_char(public.abo_maintenant() at time zone 'Africa/Porto-Novo', 'HH24:MI'),
      'encaissePar', v_par));
    v_payes := case when jsonb_typeof(v_piece.data->'payments') = 'array' then v_piece.data->'payments' else '[]'::jsonb end
               || jsonb_build_array(v_ligne_p);
    if v_neuve then
      insert into public.invoices (id, branch_id, data, updated_at)
      values (v_piece.id, v_piece.branch_id,
              v_piece.data || jsonb_build_object('payments', v_payes, 'payment', v_moyen)
                           || case when v_caisse is not null then jsonb_build_object('cashbox', v_caisse) else '{}'::jsonb end,
              now());
    else
      update public.invoices
         set data = data || jsonb_build_object('payments', v_payes), updated_at = now()
       where id = v_piece.id;
    end if;
  end if;

  -- LE CONTRAT : le versement, l'état, la pièce, et la lune qui avance.
  if not v_sur_c then
    v_maj := v_maj || jsonb_build_object('payments',
      case when jsonb_typeof(v_sub.data->'payments') = 'array' then v_sub.data->'payments' else '[]'::jsonb end
      || jsonb_build_array(jsonb_build_object('id', v_id, 'amountXof', v_montant, 'date', v_jour::text, 'method', v_moyen)));
    if not v_pack and v_prix > 0 then
      v_lunes := floor((v_montant + 1) / v_prix);
      v_suite := null;
      for i in 1 .. least(v_lunes, 24) loop
        v_suite := public.abo_prochaine_iso_apres_reglement(
          v_sub.data || case when v_suite is null then '{}'::jsonb else jsonb_build_object('nextIso', v_suite::text) end, v_jour);
      end loop;
      if v_suite is not null then
        v_maj := v_maj || jsonb_build_object('nextIso', v_suite::text);
      end if;
    end if;
  end if;
  if coalesce(v_sub.data->>'status', '') <> 'churn' then
    v_maj := v_maj || jsonb_build_object('status', 'active');
  end if;
  v_maj := v_maj || jsonb_build_object('invoiceId', v_piece.id);
  update public.subscribers set data = data || v_maj, updated_at = now() where id = v_sub.id;

  return jsonb_build_object('ok', true, 'dejaVerse', false, 'pieceId', v_piece.id, 'pieceNeuve', v_neuve,
                            'nextIso', v_maj->>'nextIso');
end;
$$;

revoke all on function public.verse_sur_l_abonnement(text, jsonb) from public, anon;
grant execute on function public.verse_sur_l_abonnement(text, jsonb) to authenticated, service_role;


-- ══ LA PLACE, SOUS LE VERROU DE LA POSE ═══════════════════════════════
-- La règle de `pose_si_libre` (0125) pour UN maître : le plafond de la
-- Maison, les fauteuils, le plafond et l'agenda du maître, et la même tête
-- déjà à cette heure. L'appelant tient le verrou (« pose », branche:jour),
-- le même que l'automate WhatsApp : les deux chemins se rangent l'un
-- derrière l'autre. `p_sauf` : le rendez-vous que l'on déplace.
create or replace function public.abo_place_libre(
  p_branche text, p_jour text, p_heure text, p_duree int, p_maitre text, p_client text, p_sauf text
) returns text
language plpgsql stable set search_path = public as $$
declare
  v_debut      int := public.minutes_de_l_heure(p_heure);
  v_cap_maison int;
  v_cap_maitre int;
  v_sieges     int;
begin
  if exists (
    select 1 from public.appointments a
     where a.data->>'branchId' = p_branche and a.data->>'date' = p_jour and a.data->>'time' = p_heure
       and coalesce(a.data->>'status', '') <> 'annulé' and a.data->>'clientId' = p_client
       and (p_sauf is null or a.id <> p_sauf)) then
    return 'deja_pose';
  end if;

  select case when btrim(coalesce(d.data->>'maxRdvParJourMaison', '')) ~ '^\d{1,4}(\.\d+)?$'
              then floor(btrim(d.data->>'maxRdvParJourMaison')::numeric)::int else 0 end,
         case when btrim(coalesce(d.data->>'maxRdvParJourMaitre', '')) ~ '^\d{1,4}(\.\d+)?$'
              then floor(btrim(d.data->>'maxRdvParJourMaitre')::numeric)::int else 0 end
    into v_cap_maison, v_cap_maitre
    from public.documents d where d.key = 'mnd_settings';
  select case when btrim(coalesce(b.data->>'seats', '')) ~ '^\d{1,4}(\.\d+)?$'
              then floor(btrim(b.data->>'seats')::numeric)::int else 0 end
    into v_sieges
    from public.branches b where b.id = p_branche;

  if coalesce(v_cap_maison, 0) > 0 and (
       select count(*) from public.appointments a
        where a.data->>'branchId' = p_branche and a.data->>'date' = p_jour
          and coalesce(a.data->>'status', '') <> 'annulé' and coalesce(a.data->>'time', '') <> ''
          and (p_sauf is null or a.id <> p_sauf)
     ) >= v_cap_maison then
    return 'creneau_plafond';
  end if;
  if coalesce(v_sieges, 0) > 0 and (
       select count(*) from public.appointments a
        where a.data->>'branchId' = p_branche and a.data->>'date' = p_jour
          and coalesce(a.data->>'status', '') <> 'annulé'
          and public.minutes_de_l_heure(a.data->>'time') is not null
          and (p_sauf is null or a.id <> p_sauf)
          and v_debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
          and v_debut + p_duree > public.minutes_de_l_heure(a.data->>'time')
     ) >= v_sieges then
    return 'creneau_pris';
  end if;
  if coalesce(v_cap_maitre, 0) > 0 and (
       select count(*) from public.appointments a
        where a.data->>'branchId' = p_branche and a.data->>'date' = p_jour
          and coalesce(a.data->>'status', '') <> 'annulé' and coalesce(a.data->>'time', '') <> ''
          and coalesce(a.data->>'master', '') = coalesce(p_maitre, '')
          and (p_sauf is null or a.id <> p_sauf)
     ) >= v_cap_maitre then
    return 'creneau_pris';
  end if;
  if exists (
       select 1 from public.appointments a
        where a.data->>'branchId' = p_branche and a.data->>'date' = p_jour
          and coalesce(a.data->>'status', '') <> 'annulé'
          and coalesce(a.data->>'master', '') = coalesce(p_maitre, '')
          and public.minutes_de_l_heure(a.data->>'time') is not null
          and (p_sauf is null or a.id <> p_sauf)
          and v_debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
          and v_debut + p_duree > public.minutes_de_l_heure(a.data->>'time')) then
    return 'creneau_pris';
  end if;
  return null;
end $$;

revoke all on function public.abo_place_libre(text, text, text, int, text, text, text) from public, anon, authenticated;


-- ══ ④ RÉSERVER UNE SÉANCE DE SA FORMULE ══════════════════════════════
-- « Une séance incluse réservée en ligne est couverte d'office par le
-- serveur : 0 F, sans acompte, crédit vérifié sous verrou ; le comptoir
-- peut décocher » (décision 2). Ma Couronne ne pose plus jamais elle-même
-- la couverture : elle demande, le serveur juge et écrit.
--
-- Sous le verrou du contrat (FOR UPDATE) et celui de la pose : la formule
-- est à elle, en cours, sans retard au-delà de la grâce, la date est dans
-- sa vie et sur une lune réglée, il reste un crédit, la place est libre.
-- Les extras (`p_extras`, hors formule) voyagent avec la séance : le
-- comptoir les chiffre au fauteuil ; rien n'est demandé d'avance.
create or replace function public.reserver_une_seance_incluse(
  p_sub_id     text,
  p_service_id text,
  p_date       text,
  p_time       text,
  p_extras     text[] default '{}',
  p_client_id  text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid     text := (auth.uid())::text;
  v_sub     public.subscribers%rowtype;
  v_tete    public.clients%rowtype;
  v_jour    date := public.abo_aujourdhui();
  v_quand   date := public.abo_date(p_date);
  v_raison  text;
  v_extras  text[];
  v_maitre  text;
  v_duree   int;
  v_branche text;
  v_id      text;
  v_rdv     jsonb;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;
  if v_quand is null or coalesce(p_time, '') !~ '^\d{2}:\d{2}$' or coalesce(p_service_id, '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'creneau_invalide');
  end if;
  if v_quand < v_jour or (v_quand = v_jour
       and p_time <= to_char(public.abo_maintenant() at time zone 'Africa/Porto-Novo', 'HH24:MI')) then
    return jsonb_build_object('ok', false, 'raison', 'creneau_passe');
  end if;
  if v_quand > v_jour + 90 then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_fenetre');
  end if;

  select * into v_sub from public.subscribers where id = p_sub_id for update;
  if v_sub.id is null then
    return jsonb_build_object('ok', false, 'raison', 'contrat_introuvable');
  end if;
  if not public.est_ma_tete(v_sub.data->>'clientId') then
    return jsonb_build_object('ok', false, 'raison', 'pas_votre_contrat');
  end if;
  if coalesce(p_client_id, '') <> '' and p_client_id <> v_sub.data->>'clientId' then
    return jsonb_build_object('ok', false, 'raison', 'tete_refusee');
  end if;
  select * into v_tete from public.clients where id = v_sub.data->>'clientId';

  v_raison := public.abo_peut_porter(v_sub.id, p_service_id, v_quand, v_jour, null);
  if v_raison is not null then
    return jsonb_build_object('ok', false, 'raison', v_raison);
  end if;

  select coalesce(array_agg(distinct e), '{}') into v_extras
    from unnest(coalesce(p_extras, '{}')) e
   where e <> p_service_id and exists (select 1 from public.catalog_services cs where cs.id = e);

  v_maitre := coalesce((select cs.data->>'master' from public.catalog_services cs where cs.id = p_service_id), '');
  v_duree := public.duree_du_rdv(jsonb_build_object('serviceIds', to_jsonb(array[p_service_id] || v_extras)));
  v_branche := coalesce(v_sub.branch_id, v_sub.data->>'branchId', v_tete.branch_id);

  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(v_branche || ':' || p_date));
  v_raison := public.abo_place_libre(v_branche, p_date, p_time, v_duree, v_maitre, v_sub.data->>'clientId', null);
  if v_raison is not null then
    return jsonb_build_object('ok', false, 'raison', v_raison);
  end if;

  v_id := 'rdv-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_rdv := jsonb_strip_nulls(jsonb_build_object(
    'id', v_id,
    'branchId', v_branche,
    'clientId', v_sub.data->>'clientId',
    'clientName', coalesce(v_tete.data->>'name', v_sub.data->>'name'),
    'serviceIds', to_jsonb(array[p_service_id] || v_extras),
    'date', p_date,
    'time', p_time,
    'master', v_maitre,
    'dureeMin', v_duree,
    'status', 'confirmé',
    'coveredBySub', true,
    'subId', v_sub.id,
    'coverKind', 'abonnement',
    'coverServiceId', p_service_id,
    'source', 'couronne',
    'creeLe', public.abo_iso(public.abo_maintenant())
  )) || case when cardinality(v_extras) = 0
              then jsonb_build_object('priceXof', 0, 'depositXof', 0)
              else jsonb_build_object('extrasHorsFormule', to_jsonb(v_extras)) end;

  insert into public.appointments (id, branch_id, data) values (v_id, v_branche, v_rdv);

  return jsonb_build_object('ok', true, 'apptId', v_id, 'etat', 'confirmee',
    'disponiblesApres', public.abo_disponibles(v_sub.id, p_service_id, v_quand, v_jour));
end;
$$;

revoke all on function public.reserver_une_seance_incluse(text, text, text, text, text[], text) from public, anon;
grant execute on function public.reserver_une_seance_incluse(text, text, text, text, text[], text) to authenticated;


-- ══ ⑤ ANNULER, DÉPLACER — CÔTÉ CLIENTE ═══════════════════════════════
-- L'heure de l'annulation est celle du SERVEUR, et c'est elle que le juge
-- lit (décision 3 : à moins de 24 h, la séance est comptée, « Manquée »).
-- Une proposition de la Maison qu'elle refuse revient à la formule.
create or replace function public.annuler_une_seance(p_appt_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  text := (auth.uid())::text;
  v_a    public.appointments%rowtype;
  v_jour date := public.abo_aujourdhui();
  v_neuf jsonb;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;
  select * into v_a from public.appointments where id = p_appt_id for update;
  if v_a.id is null then
    return jsonb_build_object('ok', false, 'raison', 'rendez_vous_introuvable');
  end if;
  if not public.est_ma_tete(v_a.data->>'clientId') then
    return jsonb_build_object('ok', false, 'raison', 'pas_votre_rendez_vous');
  end if;
  if v_a.data->>'status' = 'annulé' then
    return jsonb_build_object('ok', true, 'dejaAnnulee', true,
      'compteeCommeManquee', public.abo_vrai(v_a.data->'coveredBySub') and public.abo_etat_de_la_seance(v_a.data, v_jour) = 'manquee');
  end if;
  if v_a.data->>'status' = 'honoré' then
    return jsonb_build_object('ok', false, 'raison', 'deja_faite');
  end if;
  if coalesce(v_a.data->>'date', '') < v_jour::text then
    return jsonb_build_object('ok', false, 'raison', 'passee');
  end if;
  v_neuf := v_a.data || jsonb_build_object('status', 'annulé',
    'annuleeLe', public.abo_iso(public.abo_maintenant()), 'annuleePar', 'cliente');
  update public.appointments set data = v_neuf, updated_at = now() where id = v_a.id;
  return jsonb_build_object('ok', true,
    'compteeCommeManquee', public.abo_vrai(v_neuf->'coveredBySub') and public.abo_etat_de_la_seance(v_neuf, v_jour) = 'manquee');
end;
$$;

revoke all on function public.annuler_une_seance(text) from public, anon;
grant execute on function public.annuler_une_seance(text) to authenticated;

-- DÉPLACER : la nouvelle date doit tenir dans la vie du contrat, sur une
-- lune réglée et dans son quota (la séance ne se compte pas contre
-- elle-même), et la place doit être libre. Le rendez-vous repasse « en
-- attente » : la Maison le reconfirme.
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


-- ══ ⑥ RENONCER À UNE FORMULE RETENUE ═════════════════════════════════
-- « Régler / Renoncer » (décision 7) : une formule prise en ligne et jamais
-- réglée s'efface le jour où elle renonce, rien n'est dû.
create or replace function public.renoncer_a_la_formule(p_sub_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  text := (auth.uid())::text;
  v_sub  public.subscribers%rowtype;
  v_plan jsonb;
  v_jour date := public.abo_aujourdhui();
  v_etat text;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;
  select * into v_sub from public.subscribers where id = p_sub_id for update;
  if v_sub.id is null then
    return jsonb_build_object('ok', false, 'raison', 'contrat_introuvable');
  end if;
  if not public.est_ma_tete(v_sub.data->>'clientId') then
    return jsonb_build_object('ok', false, 'raison', 'pas_votre_contrat');
  end if;
  select p.data into v_plan from public.plans p where p.id = v_sub.data->>'planId';
  v_etat := public.abo_etat_de_la_formule(v_sub.id, v_sub.data, v_plan, v_jour)->>'etat';
  if v_etat = 'effacee' then
    return jsonb_build_object('ok', true, 'dejaEffacee', true);
  end if;
  if v_etat <> 'retenue' then
    return jsonb_build_object('ok', false, 'raison', 'pas_retenue');
  end if;
  update public.subscribers
     set data = data || jsonb_build_object('renonceeLe', v_jour::text), updated_at = now()
   where id = v_sub.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.renoncer_a_la_formule(text) from public, anon;
grant execute on function public.renoncer_a_la_formule(text) to authenticated;


-- ══ ⑦ LA GARDE ÉTENDUE ════════════════════════════════════════════════
-- QUI ÉCRIT ? Le personnel, un service de la Maison, ou une fonction du
-- serveur (definer) : à plein droit. Une cliente qui écrit SA ligne
-- directement (Ma Couronne, par la couche de synchro) : sous garde.
--
-- POURQUOI `current_user` : 0074 ne regardait que le jeton. Or une fonction
-- definer appelée par une cliente porte le jeton de la cliente : la garde
-- aurait arraché la couverture que `reserver_une_seance_incluse` venait de
-- poser. La garde tourne donc avec les droits de QUI ÉCRIT (invoker) : une
-- écriture directe se fait sous le rôle `authenticated`, celle d'une
-- fonction du serveur sous le rôle de son propriétaire.
create or replace function public.ecriture_de_la_maison() returns boolean
language plpgsql stable security invoker set search_path = public as $$
declare
  v_role text := '';
begin
  begin
    v_role := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '');
  exception when others then
    v_role := '';
  end;
  return v_role = 'service_role' or current_user not in ('authenticated', 'anon') or public.is_staff();
end $$;

create or replace function public.garde_argent_cliente() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  cle text;
begin
  if public.ecriture_de_la_maison() then
    return new;                       -- comptoir, serveur, fonction du serveur : plein droit
  end if;

  if tg_table_name = 'appointments' then
    if tg_op = 'INSERT' then
      -- Création cliente : jamais de confirmation ni d'encaissé (0074), et
      -- jamais la couverture d'une formule ni les faits de la séance : seul
      -- `reserver_une_seance_incluse` les pose. Le prix figé et l'acompte
      -- DEMANDÉ restent (Booking).
      foreach cle in array array['depositConfirmed', 'depositConfirmedAt', 'paidXof',
                                 'coveredBySub', 'subId', 'coverKind', 'coverServiceId',
                                 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe',
                                 'confirmeeParLaClienteLe'] loop
        new.data := new.data - cle;
      end loop;
      if new.data->>'status' = 'annulé' then
        new.data := new.data || jsonb_build_object('annuleeLe', public.abo_iso(now()), 'annuleePar', 'cliente');
      end if;
    else
      -- Modif cliente : chaque champ protégé retombe sur sa valeur d'AVANT.
      foreach cle in array array['depositConfirmed', 'depositConfirmedAt', 'depositXof', 'paidXof',
                                 'coveredBySub', 'subId', 'coverKind', 'coverServiceId', 'priceXof',
                                 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe'] loop
        new.data := new.data - cle;
        if old.data ? cle then
          new.data := jsonb_set(new.data, array[cle], old.data -> cle);
        end if;
      end loop;
      -- Accepter une proposition : l'heure est celle du serveur, et ce qui
      -- est posé ne se retire plus.
      if old.data ? 'confirmeeParLaClienteLe' then
        new.data := jsonb_set(new.data, '{confirmeeParLaClienteLe}', old.data -> 'confirmeeParLaClienteLe');
      elsif new.data ? 'confirmeeParLaClienteLe' then
        new.data := jsonb_set(new.data, '{confirmeeParLaClienteLe}', to_jsonb(public.abo_iso(now())));
      end if;
      -- « Faite » se pose au comptoir, jamais par elle.
      if new.data->>'status' = 'honoré' and coalesce(old.data->>'status', '') <> 'honoré' then
        new.data := jsonb_set(new.data, '{status}', coalesce(old.data -> 'status', '"en attente"'::jsonb));
      end if;
      -- SON ANNULATION EST DATÉE PAR LE SERVEUR : c'est cette heure que le
      -- juge compare à celle de la séance (décision 3).
      if new.data->>'status' = 'annulé' and coalesce(old.data->>'status', '') <> 'annulé' then
        new.data := new.data || jsonb_build_object('annuleeLe', public.abo_iso(now()), 'annuleePar', 'cliente');
      end if;
    end if;

  elsif tg_table_name = 'invoices' then
    -- Une cliente ne déclare pas une facture « payée » (réservé au comptoir).
    if coalesce(new.data ->> 'status', '') = 'payée' then
      if tg_op = 'UPDATE' and (old.data ? 'status') then
        new.data := jsonb_set(new.data, '{status}', old.data -> 'status');
      else
        new.data := jsonb_set(new.data, '{status}', '"envoyée"'::jsonb);
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists garde_argent_cliente_biu on public.appointments;
create trigger garde_argent_cliente_biu
  before insert or update on public.appointments
  for each row execute function public.garde_argent_cliente();

drop trigger if exists garde_argent_cliente_biu on public.invoices;
create trigger garde_argent_cliente_biu
  before insert or update on public.invoices
  for each row execute function public.garde_argent_cliente();

-- UNE CLIENTE N'ÉCRIT JAMAIS UN CONTRAT. La RLS le refuse déjà (0076,
-- lecture seule) ; ceci le refuse encore si une politique s'ouvrait un jour
-- par mégarde. Seules les fonctions du serveur l'écrivent pour elle.
create or replace function public.garde_contrat_cliente() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  if public.ecriture_de_la_maison() then
    return coalesce(new, old);
  end if;
  raise exception 'Un contrat ne s''écrit qu''au comptoir ou par le serveur.';
end $$;

drop trigger if exists garde_contrat_cliente_biud on public.subscribers;
create trigger garde_contrat_cliente_biud
  before insert or update or delete on public.subscribers
  for each row execute function public.garde_contrat_cliente();


-- ══ ⑧ LA TRACE DES CONTRATS ══════════════════════════════════════════
-- Vente, prix revu, dates, résiliation datée, prolongation, versement :
-- chaque geste sur un contrat se signe par la base (0092).
do $$
begin
  if to_regclass('public.subscribers') is not null then
    execute 'drop trigger if exists trace_le_geste on public.subscribers';
    execute 'create trigger trace_le_geste after insert or update or delete on public.subscribers '
         || 'for each row execute function public.trace_le_geste()';
  end if;
end $$;


-- ── CONTRÔLE — LECTURE SEULE ───────────────────────────────────────
-- Attendu : une seule souscription (à cinq arguments), les quatre gestes de
-- la cliente et le chemin de l'argent présents, la garde en invoker, et la
-- trace sur les contrats.
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'souscrire_a_une_formule') as souscriptions,
  (select pronargs from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'souscrire_a_une_formule' limit 1) as arguments,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('verse_sur_l_abonnement', 'reserver_une_seance_incluse',
      'annuler_une_seance', 'deplacer_une_seance', 'renoncer_a_la_formule')) as gestes,
  (select not prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'garde_argent_cliente') as garde_invoker,
  (select count(*) from pg_trigger t where t.tgrelid = 'public.subscribers'::regclass
    and t.tgname in ('trace_le_geste', 'garde_contrat_cliente_biud')) as gardes_du_contrat;
