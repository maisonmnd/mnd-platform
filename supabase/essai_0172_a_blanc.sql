-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC DE 0172 · RÉGLER AVANT ET APRÈS · 7 novembre 2026
--
-- À jouer AVANT 0172, d'un seul tenant, dans l'éditeur SQL. Tout est ANNULÉ
-- par l'exception finale : la migration, les lignes d'essai, chaque écriture.
-- Chaque écriture tentée est aussi annulée sur-le-champ (un sous-bloc qui
-- lève l'exception « ZZ172 » après avoir relu sa ligne) : rien ne bouge,
-- même entre deux mesures.
--
-- Comment il s'y prend. Il pose deux rendez-vous d'essai dans quarante jours
-- (le premier réglé d'avance : un versement kkia-… et son lien ; le second
-- sans argent), au nom d'un compte de cliente INVENTÉ : aucun compte réel,
-- aucune fiche réelle n'est lue ni écrite. Puis il se fait passer, comme
-- PostgREST, pour :
--   · la CLIENTE (le rôle `authenticated`, le `sub` du compte inventé) ;
--   · un compte de l'ÉQUIPE (le premier de `staff`) ;
--   · le SERVEUR (le rôle `service_role`, celui des fonctions).
-- Pour chacun, AVANT puis APRÈS la migration, il tente :
--   ① de RETIRER le versement et le lien du rendez-vous réglé d'avance (le
--      téléphone qui renvoie une ligne en retard), avec une clé neutre ;
--   ② de FORGER un versement « kkia-… » et un lien sur l'autre ;
--   ③ d'ANNULER lui-même le rendez-vous réglé d'avance ;
--   ④ d'annuler celui qui ne porte aucun argent (comme avant) ;
--   ⑤ la cliente seulement : `annuler_une_seance` sur les deux ;
--   ⑥ de CRÉER un rendez-vous qui porte déjà un versement et un lien ;
--   ⑦ ce que 0138 et 0171 gardaient déjà (`paidXof`, `priceXof`,
--      `depositConfirmed`, `termineParElle`).
--
-- CE QU'IL DIT, dans le message d'erreur final « ESSAI 0172 : … » :
--   · la cliente n'efface plus et ne forge plus le versement ni le lien, à la
--     modification comme à la création ; le reste de sa ligne s'écrit encore ;
--   · elle n'annule plus elle-même un rendez-vous réglé d'avance (ni par sa
--     ligne, ni par `annuler_une_seance`, qui dit « regle_d_avance ») ; elle
--     annule l'autre comme avant, à l'heure du serveur ;
--   · l'équipe et le serveur écrivent comme avant, à plein droit ;
--   · ce que 0138 et 0171 gardaient répond mot pour mot comme avant ;
--   · TIENT, ou NE TIENT PAS et pourquoi.
-- Aucun nom : les comptes sont dits par leur rôle. Rejoué APRÈS 0172, il
-- tient encore ; « avant » montre alors la cliente déjà gardée.
-- Éprouvé le 7 novembre 2026 sur PostgreSQL (PGlite) avec une maquette des
-- règles de 0045, de la garde de 0171 et d'`annuler_une_seance` (0138) :
-- TIENT, rien ne reste ; et une 0172 qui oublierait une clé ou le refus le
-- fait dire NE TIENT PAS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. LA MESURE : ce qu'un compte parvient à écrire ─────────────────────
create function pg_temp.essai_0172_vu_par(p_qui text, p_uid uuid) returns jsonb
language plpgsql as $f$
declare
  FORGE constant jsonb := '{"payments":[{"id":"kkia-essai-0172-faux","amountXof":12000,"date":"2026-11-07"}],"lienDeReglement":{"jeton":"essai0172forgee","depuisLaCouronne":{"quand":"avance","le":"2026-11-07T08:00:00.000Z"}},"essai0172":"oui"}'::jsonb;
  d jsonb; n int; r jsonb;
  v_retire text; v_forge text; v_annule text; v_libre text; v_rpc text; v_cree text; v_garde text;
  -- Ce qu'on rendra en sortant : le rôle de l'éditeur et son jeton, tels quels.
  v_role text := current_user;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  if p_qui = 'serveur' then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    begin
      set local role service_role;
    exception when others then
      perform set_config('request.jwt.claims', v_claims, true);
      perform set_config('request.jwt.claim.sub', v_sub, true);
      return jsonb_build_object('indisponible', sqlstate);
    end;
  else
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;

  -- ① Retirer le versement et le lien du rendez-vous réglé d'avance.
  begin
    update public.appointments set data = (data - 'payments' - 'lienDeReglement') || '{"essai0172":"oui"}'::jsonb where id = 'essai-0172-a';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0172-a';
    raise exception using errcode = 'ZZ172', message = n::text || ' ligne, '
      || case when d ? 'payments' then 'versement garde' else 'versement retire' end || ', '
      || case when d ? 'lienDeReglement' then 'lien garde' else 'lien retire' end || ', '
      || case when d->>'essai0172' = 'oui' then 'le reste ecrit' else 'le reste perdu' end;
  exception when others then
    v_retire := case when sqlstate = 'ZZ172' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ② Forger un versement en ligne et un lien sur un rendez-vous qui n'en porte pas.
  begin
    update public.appointments set data = data || FORGE where id = 'essai-0172-b';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0172-b';
    raise exception using errcode = 'ZZ172', message = n::text || ' ligne, '
      || case when d ? 'payments' then 'versement pose' else 'versement refuse' end || ', '
      || case when d ? 'lienDeReglement' then 'lien pose' else 'lien refuse' end || ', '
      || case when d->>'essai0172' = 'oui' then 'le reste ecrit' else 'le reste perdu' end;
  exception when others then
    v_forge := case when sqlstate = 'ZZ172' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ③ Annuler lui-même le rendez-vous réglé d'avance, par sa ligne.
  begin
    update public.appointments set data = data || '{"status":"annulé"}'::jsonb where id = 'essai-0172-a';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0172-a';
    raise exception using errcode = 'ZZ172', message = n::text || ' ligne, status ' || coalesce(d->>'status', 'absent');
  exception when others then
    v_annule := case when sqlstate = 'ZZ172' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ④ Annuler celui qui ne porte aucun argent : comme avant.
  begin
    update public.appointments set data = data || '{"status":"annulé"}'::jsonb where id = 'essai-0172-b';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0172-b';
    raise exception using errcode = 'ZZ172', message = n::text || ' ligne, status ' || coalesce(d->>'status', 'absent') || ', annulee par ' || coalesce(d->>'annuleePar', 'personne')
      || case when d ? 'annuleeLe' then ', datee' else ', sans date' end;
  exception when others then
    v_libre := case when sqlstate = 'ZZ172' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ⑤ La fonction de Ma Couronne, `annuler_une_seance` : la cliente seulement.
  if p_qui = 'cliente' then
    begin
      r := public.annuler_une_seance('essai-0172-a');
      v_rpc := 'regle ' || coalesce(r->>'raison', case when coalesce((r->>'ok')::boolean, false) then 'annule' else '?' end);
      r := public.annuler_une_seance('essai-0172-b');
      raise exception using errcode = 'ZZ172', message = v_rpc || ', libre ' || coalesce(r->>'raison', case when coalesce((r->>'ok')::boolean, false) then 'annule' else '?' end);
    exception when others then
      v_rpc := case when sqlstate = 'ZZ172' then sqlerrm else 'refus ' || sqlstate end;
    end;
  else
    v_rpc := 'sans objet';
  end if;

  -- ⑥ Créer un rendez-vous qui porte déjà un versement et un lien (annulé
  --    d'emblée : il ne prend aucune place, les règles des places ne s'en mêlent pas).
  begin
    insert into public.appointments (id, branch_id, data)
      select 'essai-0172-c', a.branch_id, (a.data || FORGE) || '{"id":"essai-0172-c","status":"annulé"}'::jsonb
        from public.appointments a where a.id = 'essai-0172-b';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0172-c';
    raise exception using errcode = 'ZZ172', message = n::text || ' ligne, '
      || case when d ? 'payments' then 'versement pose' else 'versement refuse' end || ', '
      || case when d ? 'lienDeReglement' then 'lien pose' else 'lien refuse' end;
  exception when others then
    v_cree := case when sqlstate = 'ZZ172' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ⑦ Ce que 0138 et 0171 gardaient déjà : rien n'y change.
  begin
    update public.appointments set data = data || '{"paidXof":999,"priceXof":1,"depositConfirmed":true,"termineParElle":{"le":"2026-11-07T09:00:00.000Z","par":"site"}}'::jsonb where id = 'essai-0172-b';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0172-b';
    raise exception using errcode = 'ZZ172', message = n::text || ' ligne, paidXof ' || coalesce(d->>'paidXof', 'absent') || ', priceXof ' || coalesce(d->>'priceXof', 'absent')
      || ', depositConfirmed ' || coalesce(d->>'depositConfirmed', 'absent') || ', ' || case when d ? 'termineParElle' then 'termine pose' else 'termine refuse' end;
  exception when others then
    v_garde := case when sqlstate = 'ZZ172' then sqlerrm else 'refus ' || sqlstate end;
  end;

  execute format('set local role %I', v_role);
  perform set_config('request.jwt.claims', v_claims, true);
  perform set_config('request.jwt.claim.sub', v_sub, true);
  return jsonb_build_object('retire', v_retire, 'forge', v_forge, 'annule', v_annule, 'libre', v_libre, 'rpc', v_rpc, 'cree', v_cree, 'garde', v_garde);
end $f$;


-- ── 1. AVANT 0172 : les lignes d'essai, puis les mesures ─────────────────
do $avant$
declare
  v_cliente uuid := gen_random_uuid();            -- un compte INVENTÉ : aucune fiche, aucun compte réel
  v_equipe uuid;
  v_branche public.appointments.branch_id%type;
  v_futur text := to_char((now() at time zone 'UTC')::date + 40, 'YYYY-MM-DD');
  v_jour text := to_char((now() at time zone 'UTC')::date, 'YYYY-MM-DD');
  v_rdv jsonb;
begin
  select user_id into v_equipe from public.staff order by created_at limit 1;
  select branch_id into v_branche from public.appointments where branch_id is not null order by updated_at desc limit 1;
  v_rdv := jsonb_build_object('id', 'essai-0172-b', 'clientId', v_cliente::text, 'clientName', 'Essai 0172', 'date', v_futur, 'time', '15:00',
                              'status', 'confirmé', 'priceXof', 12000, 'essai', true);
  -- Écrites par l'éditeur (la Maison) : la garde les laisse passer telles quelles.
  insert into public.appointments (id, branch_id, data) values ('essai-0172-b', v_branche, v_rdv);
  insert into public.appointments (id, branch_id, data) values ('essai-0172-a', v_branche,
    v_rdv || jsonb_build_object('id', 'essai-0172-a', 'paidXof', 12000,
      'payments', jsonb_build_array(jsonb_build_object('id', 'kkia-essai-0172', 'amountXof', 12000, 'date', v_jour, 'method', 'KkiaPay', 'cashbox', 'KkiaPay')),
      'lienDeReglement', jsonb_build_object('jeton', 'essai0172jetona', 'creeLe', v_jour || 'T08:00:00.000Z',
        'depuisLaCouronne', jsonb_build_object('quand', 'avance', 'le', v_jour || 'T08:00:00.000Z'))));

  perform set_config('essai_0172.cliente', v_cliente::text, false);
  perform set_config('essai_0172.equipe', coalesce(v_equipe::text, ''), false);
  perform set_config('essai_0172.cliente_avant', pg_temp.essai_0172_vu_par('cliente', v_cliente)::text, false);
  -- Un compte absent ne se mesure pas.
  perform set_config('essai_0172.equipe_avant', case when v_equipe is null then '' else pg_temp.essai_0172_vu_par('equipe', v_equipe)::text end, false);
  perform set_config('essai_0172.serveur_avant', pg_temp.essai_0172_vu_par('serveur', null)::text, false);
end $avant$;


-- ── 2. LA MIGRATION 0172, à l'identique ──────────────────────────────────
-- ⟨0172⟩
-- ① L'argent versé sur le rendez-vous lui-même, sans l'acompte.
create or replace function public.argent_verse_sur_le_rdv(d jsonb) returns numeric
language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(d->'payments') = 'array' and jsonb_array_length(d->'payments') > 0
      then coalesce((select sum(coalesce(public.abo_num(v->'amountXof'), 0)) from jsonb_array_elements(d->'payments') v), 0)
    else coalesce(public.abo_num(d->'paidXof'), 0)
  end;
$$;

grant execute on function public.argent_verse_sur_le_rdv(jsonb) to anon, authenticated, service_role;

-- ② La garde de 0171, et ce que « Régler avant et après » pose.
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
      -- DEMANDÉ restent (Booking). Ni terminé ni réglé à la naissance (0171),
      -- ni versement ni lien de règlement (0172).
      foreach cle in array array['depositConfirmed', 'depositConfirmedAt', 'paidXof',
                                 'coveredBySub', 'subId', 'coverKind', 'coverServiceId',
                                 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe',
                                 'confirmeeParLaClienteLe',
                                 'termineParElle', 'honoreAuReglement',
                                 'payments', 'lienDeReglement', 'lienDuFoyer'] loop
        new.data := new.data - cle;
      end loop;
      if new.data->>'status' = 'annulé' then
        new.data := new.data || jsonb_build_object('annuleeLe', public.abo_iso(now()), 'annuleePar', 'cliente');
      end if;
    else
      -- Modif cliente : chaque champ protégé retombe sur sa valeur d'AVANT.
      -- `termineParElle` et `honoreAuReglement` (0171) : les marques de
      -- « Terminer et régler » ne se posent ni ne se retirent par elle.
      -- `payments`, `lienDeReglement`, `lienDuFoyer` (0172) : le versement et
      -- le lien que le serveur a posés ne s'effacent ni ne se forgent.
      foreach cle in array array['depositConfirmed', 'depositConfirmedAt', 'depositXof', 'paidXof',
                                 'coveredBySub', 'subId', 'coverKind', 'coverServiceId', 'priceXof',
                                 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe',
                                 'termineParElle', 'honoreAuReglement',
                                 'payments', 'lienDeReglement', 'lienDuFoyer'] loop
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
      -- RÉGLÉ D'AVANCE, IL NE S'ANNULE PAS PAR ELLE (0172) : de l'argent versé
      -- sur le rendez-vous, et son statut reste celui d'avant. Elle écrit à la
      -- Maison, qui annule au Trône et décide du règlement.
      if new.data->>'status' = 'annulé' and coalesce(old.data->>'status', '') <> 'annulé'
         and round(public.argent_verse_sur_le_rdv(old.data)) > 0 then
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

-- ③ Annuler côté cliente (0138), et le refus d'un rendez-vous réglé d'avance.
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
  -- RÉGLÉ D'AVANCE, IL NE S'ANNULE PAS PAR ELLE (0172).
  if round(public.argent_verse_sur_le_rdv(v_a.data)) > 0 then
    return jsonb_build_object('ok', false, 'raison', 'regle_d_avance');
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
-- ⟨/0172⟩


-- ── 3. APRÈS 0172 : les mêmes mesures, comparées ─────────────────────────
do $essai$
declare
  v_cliente uuid := current_setting('essai_0172.cliente')::uuid;
  v_equipe uuid := nullif(current_setting('essai_0172.equipe'), '')::uuid;
  av jsonb; ap jsonb;
  qui text; k text;
  r text := '';
  fautes text := '';
begin
  foreach qui in array array['cliente', 'equipe', 'serveur'] loop
    if qui = 'equipe' and v_equipe is null then
      r := r || 'equipe : aucun compte a essayer | ';
      fautes := fautes || 'aucun compte de l equipe; ';
      continue;
    end if;
    av := nullif(current_setting('essai_0172.' || qui || '_avant'), '')::jsonb;
    ap := pg_temp.essai_0172_vu_par(qui, case qui when 'cliente' then v_cliente when 'equipe' then v_equipe end);
    if ap ? 'indisponible' then
      r := r || qui || ' : non mesure, le role ne se prend pas d ici (' || (ap ->> 'indisponible') || ') | ';
      continue;
    end if;

    r := r || qui || ' : retirer avant [' || coalesce(av ->> 'retire', '?') || '] apres [' || coalesce(ap ->> 'retire', '?')
      || '] ; forger avant [' || coalesce(av ->> 'forge', '?') || '] apres [' || coalesce(ap ->> 'forge', '?')
      || '] ; annuler regle avant [' || coalesce(av ->> 'annule', '?') || '] apres [' || coalesce(ap ->> 'annule', '?')
      || '] ; creer avant [' || coalesce(av ->> 'cree', '?') || '] apres [' || coalesce(ap ->> 'cree', '?') || ']'
      || case when qui = 'cliente' then ' ; annuler_une_seance avant [' || coalesce(av ->> 'rpc', '?') || '] apres [' || coalesce(ap ->> 'rpc', '?') || ']' else '' end;

    -- Ce qui ne change pas, pour chacun : l'annulation sans argent, et ce que 0138 et 0171 gardaient.
    foreach k in array array['libre', 'garde'] loop
      if (av ->> k) is distinct from (ap ->> k) then
        fautes := fautes || qui || ' : « ' || k || ' » a change (' || coalesce(av ->> k, '?') || ' > ' || coalesce(ap ->> k, '?') || '); ';
      end if;
    end loop;
    r := r || ' ; comme avant [' || coalesce(ap ->> 'libre', '?') || ' ; ' || coalesce(ap ->> 'garde', '?') || '] | ';

    if qui = 'cliente' then
      if (ap ->> 'retire') is distinct from '1 ligne, versement garde, lien garde, le reste ecrit' then
        fautes := fautes || 'la cliente efface encore le versement ou le lien, ou n ecrit plus sa ligne; ';
      end if;
      if (ap ->> 'forge') is distinct from '1 ligne, versement refuse, lien refuse, le reste ecrit' then
        fautes := fautes || 'la cliente forge encore un versement ou un lien, ou n ecrit plus sa ligne; ';
      end if;
      if (ap ->> 'annule') is distinct from '1 ligne, status confirmé' then
        fautes := fautes || 'la cliente annule encore elle-meme un rendez-vous regle d avance; ';
      end if;
      if (ap ->> 'rpc') is distinct from 'regle regle_d_avance, libre annule' then
        fautes := fautes || 'annuler_une_seance annule encore un rendez-vous regle d avance, ou n annule plus les autres; ';
      end if;
      -- À la création : versement et lien retirés, ou la création refusée par une autre règle (comme avant).
      if (ap ->> 'cree') is distinct from '1 ligne, versement refuse, lien refuse'
         and not ((ap ->> 'cree') like 'refus%' and (ap ->> 'cree') is not distinct from (av ->> 'cree')) then
        fautes := fautes || 'la cliente cree un rendez-vous deja regle; ';
      end if;
    else
      -- La Maison : comme avant, à plein droit.
      if (ap ->> 'retire') is distinct from '1 ligne, versement retire, lien retire, le reste ecrit'
         or (ap ->> 'forge') is distinct from '1 ligne, versement pose, lien pose, le reste ecrit'
         or (ap ->> 'annule') is distinct from '1 ligne, status annulé'
         or (ap ->> 'cree') is distinct from '1 ligne, versement pose, lien pose' then
        fautes := fautes || qui || ' n ecrit plus a plein droit; ';
      end if;
      foreach k in array array['retire', 'forge', 'annule', 'cree'] loop
        if (av ->> k) is distinct from (ap ->> k) then
          fautes := fautes || qui || ' : « ' || k || ' » a change; ';
        end if;
      end loop;
    end if;
  end loop;

  raise exception 'ESSAI 0172 : % | %', case when fautes = '' then 'TIENT' else 'NE TIENT PAS : ' || left(fautes, -2) end, rtrim(r, ' |');
end $essai$;
