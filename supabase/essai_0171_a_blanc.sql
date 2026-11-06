-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC DE 0171 · LA GARDE DE « TERMINER ET RÉGLER » · 6 novembre 2026
--
-- À jouer AVANT 0171, d'un seul tenant, dans l'éditeur SQL. Tout est ANNULÉ
-- par l'exception finale : la migration, les lignes d'essai, chaque écriture.
-- Chaque écriture tentée est aussi annulée sur-le-champ (un sous-bloc qui
-- lève l'exception « ZZ171 » après avoir relu sa ligne) : rien ne bouge,
-- même entre deux mesures.
--
-- Comment il s'y prend. Il pose trois lignes d'essai (deux rendez-vous d'hier
-- et une facture, au nom d'un compte de cliente INVENTÉ : aucun compte réel,
-- aucune fiche réelle n'est lue ni écrite), puis il se fait passer, comme
-- PostgREST, pour :
--   · la CLIENTE (le rôle `authenticated`, le `sub` du compte inventé) ;
--   · un compte de l'ÉQUIPE (le premier de `staff`) ;
--   · le SERVEUR (le rôle `service_role`, celui des fonctions).
-- Pour chacun, AVANT puis APRÈS la migration, il tente :
--   ① de POSER `termineParElle` et `honoreAuReglement` sur un rendez-vous qui
--      ne les porte pas (avec une clé neutre, pour voir que l'écriture passe) ;
--   ② de les RETIRER d'un rendez-vous où la Maison les a posées (le téléphone
--      qui renvoie une ligne en retard) ;
--   ③ de CRÉER un rendez-vous qui les porte déjà ;
--   ④ ce que 0138 gardait déjà (`paidXof`, `priceXof`, `depositConfirmed`,
--      « honoré », une facture « payée ») et son annulation datée.
--
-- CE QU'IL DIT, dans le message d'erreur final « ESSAI 0171 : … » :
--   · la cliente ne pose plus et ne retire plus les deux marques, à la
--     modification comme à la création ; le reste de sa ligne s'écrit encore ;
--   · l'équipe et le serveur les posent et les retirent comme avant ;
--   · tout ce que 0138 gardait répond mot pour mot comme avant ;
--   · TIENT, ou NE TIENT PAS et pourquoi.
-- Aucun nom : les comptes sont dits par leur rôle. Rejoué APRÈS 0171, il
-- tient encore ; « avant » montre alors la cliente déjà sans les marques.
-- Éprouvé le 6 novembre 2026 sur PostgreSQL (PGlite) avec une maquette des
-- règles de 0045 et de la garde de 0138 : TIENT, rien ne reste ; et une 0171
-- qui oublierait une des deux marques le fait dire NE TIENT PAS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. LA MESURE : ce qu'un compte parvient à écrire ─────────────────────
create function pg_temp.essai_0171_vu_par(p_qui text, p_uid uuid) returns jsonb
language plpgsql as $f$
declare
  MARQUES constant jsonb := '{"termineParElle":{"le":"2026-11-06T09:00:00.000Z","par":"site"},"honoreAuReglement":{"le":"2026-11-06T09:05:00.000Z"},"essai0171":"oui"}'::jsonb;
  d jsonb; n int;
  v_pose text; v_retire text; v_cree text; v_garde text; v_annule text; v_facture text;
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

  -- ① Poser les deux marques sur un rendez-vous qui ne les porte pas.
  begin
    update public.appointments set data = data || MARQUES where id = 'essai-0171-a';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0171-a';
    raise exception using errcode = 'ZZ171', message = n::text || ' ligne, '
      || case when d ? 'termineParElle' then 'termine pose' else 'termine refuse' end || ', '
      || case when d ? 'honoreAuReglement' then 'honneur pose' else 'honneur refuse' end || ', '
      || case when d->>'essai0171' = 'oui' then 'le reste ecrit' else 'le reste perdu' end;
  exception when others then
    v_pose := case when sqlstate = 'ZZ171' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ② Les retirer d'un rendez-vous où la Maison les a posées.
  begin
    update public.appointments set data = (data - 'termineParElle' - 'honoreAuReglement') || '{"essai0171":"oui"}'::jsonb where id = 'essai-0171-b';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0171-b';
    raise exception using errcode = 'ZZ171', message = n::text || ' ligne, '
      || case when d ? 'termineParElle' then 'termine garde' else 'termine retire' end || ', '
      || case when d ? 'honoreAuReglement' then 'honneur garde' else 'honneur retire' end || ', '
      || case when d->>'essai0171' = 'oui' then 'le reste ecrit' else 'le reste perdu' end;
  exception when others then
    v_retire := case when sqlstate = 'ZZ171' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ③ Créer un rendez-vous qui les porte déjà (annulé d'emblée : il ne prend
  --    aucune place, les règles des places ne s'en mêlent pas).
  begin
    insert into public.appointments (id, branch_id, data)
      select 'essai-0171-c', a.branch_id, (a.data || MARQUES) || '{"id":"essai-0171-c","status":"annulé"}'::jsonb
        from public.appointments a where a.id = 'essai-0171-a';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0171-c';
    raise exception using errcode = 'ZZ171', message = n::text || ' ligne, '
      || case when d ? 'termineParElle' then 'termine pose' else 'termine refuse' end || ', '
      || case when d ? 'honoreAuReglement' then 'honneur pose' else 'honneur refuse' end;
  exception when others then
    v_cree := case when sqlstate = 'ZZ171' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ④ Ce que 0138 gardait déjà : rien n'y change.
  begin
    update public.appointments set data = data || '{"paidXof":999,"priceXof":1,"depositConfirmed":true,"status":"honoré"}'::jsonb where id = 'essai-0171-a';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0171-a';
    raise exception using errcode = 'ZZ171', message = n::text || ' ligne, paidXof ' || coalesce(d->>'paidXof', 'absent') || ', priceXof ' || coalesce(d->>'priceXof', 'absent')
      || ', depositConfirmed ' || coalesce(d->>'depositConfirmed', 'absent') || ', status ' || coalesce(d->>'status', 'absent');
  exception when others then
    v_garde := case when sqlstate = 'ZZ171' then sqlerrm else 'refus ' || sqlstate end;
  end;
  begin
    update public.appointments set data = data || '{"status":"annulé"}'::jsonb where id = 'essai-0171-a';
    get diagnostics n = row_count;
    select data into d from public.appointments where id = 'essai-0171-a';
    raise exception using errcode = 'ZZ171', message = n::text || ' ligne, status ' || coalesce(d->>'status', 'absent') || ', annulee par ' || coalesce(d->>'annuleePar', 'personne')
      || case when d ? 'annuleeLe' then ', datee' else ', sans date' end;
  exception when others then
    v_annule := case when sqlstate = 'ZZ171' then sqlerrm else 'refus ' || sqlstate end;
  end;
  begin
    update public.invoices set data = data || '{"status":"payée"}'::jsonb where id = 'essai-0171-f';
    get diagnostics n = row_count;
    select data into d from public.invoices where id = 'essai-0171-f';
    raise exception using errcode = 'ZZ171', message = n::text || ' ligne, status ' || coalesce(d->>'status', 'absent');
  exception when others then
    v_facture := case when sqlstate = 'ZZ171' then sqlerrm else 'refus ' || sqlstate end;
  end;

  execute format('set local role %I', v_role);
  perform set_config('request.jwt.claims', v_claims, true);
  perform set_config('request.jwt.claim.sub', v_sub, true);
  return jsonb_build_object('pose', v_pose, 'retire', v_retire, 'cree', v_cree, 'garde', v_garde, 'annule', v_annule, 'facture', v_facture);
end $f$;


-- ── 1. AVANT 0171 : les lignes d'essai, puis les mesures ─────────────────
do $avant$
declare
  v_cliente uuid := gen_random_uuid();            -- un compte INVENTÉ : aucune fiche, aucun compte réel
  v_equipe uuid;
  v_branche public.appointments.branch_id%type;
  v_hier text := to_char((now() at time zone 'UTC')::date - 1, 'YYYY-MM-DD');
  v_rdv jsonb;
begin
  select user_id into v_equipe from public.staff order by created_at limit 1;
  select branch_id into v_branche from public.appointments where branch_id is not null order by updated_at desc limit 1;
  v_rdv := jsonb_build_object('id', 'essai-0171-a', 'clientId', v_cliente::text, 'clientName', 'Essai 0171', 'date', v_hier, 'time', '10:00',
                              'status', 'confirmé', 'priceXof', 12000, 'essai', true);
  -- Écrites par l'éditeur (la Maison) : la garde les laisse passer telles quelles.
  insert into public.appointments (id, branch_id, data) values ('essai-0171-a', v_branche, v_rdv);
  insert into public.appointments (id, branch_id, data) values ('essai-0171-b', v_branche,
    v_rdv || '{"id":"essai-0171-b","termineParElle":{"le":"2026-11-06T09:00:00.000Z","par":"site"},"honoreAuReglement":{"le":"2026-11-06T09:05:00.000Z"}}'::jsonb);
  insert into public.invoices (id, branch_id, data) values ('essai-0171-f', v_branche,
    jsonb_build_object('id', 'essai-0171-f', 'clientId', v_cliente::text, 'kind', 'facture', 'status', 'envoyée', 'apptId', 'essai-0171-a', 'lines', '[]'::jsonb, 'essai', true));

  perform set_config('essai_0171.cliente', v_cliente::text, false);
  perform set_config('essai_0171.equipe', coalesce(v_equipe::text, ''), false);
  perform set_config('essai_0171.cliente_avant', pg_temp.essai_0171_vu_par('cliente', v_cliente)::text, false);
  -- Un compte absent ne se mesure pas.
  perform set_config('essai_0171.equipe_avant', case when v_equipe is null then '' else pg_temp.essai_0171_vu_par('equipe', v_equipe)::text end, false);
  perform set_config('essai_0171.serveur_avant', pg_temp.essai_0171_vu_par('serveur', null)::text, false);
end $avant$;


-- ── 2. LA MIGRATION 0171, à l'identique ──────────────────────────────────
-- ⟨0171⟩
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
      -- DEMANDÉ restent (Booking). Ni terminé ni réglé à la naissance (0171).
      foreach cle in array array['depositConfirmed', 'depositConfirmedAt', 'paidXof',
                                 'coveredBySub', 'subId', 'coverKind', 'coverServiceId',
                                 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe',
                                 'confirmeeParLaClienteLe',
                                 'termineParElle', 'honoreAuReglement'] loop
        new.data := new.data - cle;
      end loop;
      if new.data->>'status' = 'annulé' then
        new.data := new.data || jsonb_build_object('annuleeLe', public.abo_iso(now()), 'annuleePar', 'cliente');
      end if;
    else
      -- Modif cliente : chaque champ protégé retombe sur sa valeur d'AVANT.
      -- `termineParElle` et `honoreAuReglement` (0171) : les marques de
      -- « Terminer et régler » ne se posent ni ne se retirent par elle.
      foreach cle in array array['depositConfirmed', 'depositConfirmedAt', 'depositXof', 'paidXof',
                                 'coveredBySub', 'subId', 'coverKind', 'coverServiceId', 'priceXof',
                                 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe',
                                 'termineParElle', 'honoreAuReglement'] loop
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
-- ⟨/0171⟩


-- ── 3. APRÈS 0171 : les mêmes mesures, comparées ─────────────────────────
do $essai$
declare
  v_cliente uuid := current_setting('essai_0171.cliente')::uuid;
  v_equipe uuid := nullif(current_setting('essai_0171.equipe'), '')::uuid;
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
    av := nullif(current_setting('essai_0171.' || qui || '_avant'), '')::jsonb;
    ap := pg_temp.essai_0171_vu_par(qui, case qui when 'cliente' then v_cliente when 'equipe' then v_equipe end);
    if ap ? 'indisponible' then
      r := r || qui || ' : non mesure, le role ne se prend pas d ici (' || (ap ->> 'indisponible') || ') | ';
      continue;
    end if;

    r := r || qui || ' : poser avant [' || coalesce(av ->> 'pose', '?') || '] apres [' || coalesce(ap ->> 'pose', '?')
      || '] ; retirer avant [' || coalesce(av ->> 'retire', '?') || '] apres [' || coalesce(ap ->> 'retire', '?')
      || '] ; creer avant [' || coalesce(av ->> 'cree', '?') || '] apres [' || coalesce(ap ->> 'cree', '?') || ']';

    -- Ce que 0138 gardait déjà : mot pour mot comme avant, pour chacun.
    foreach k in array array['garde', 'annule', 'facture'] loop
      if (av ->> k) is distinct from (ap ->> k) then
        fautes := fautes || qui || ' : « ' || k || ' » a change (' || coalesce(av ->> k, '?') || ' > ' || coalesce(ap ->> k, '?') || '); ';
      end if;
    end loop;
    r := r || ' ; le reste de 0138 [' || coalesce(ap ->> 'garde', '?') || ' ; ' || coalesce(ap ->> 'annule', '?') || ' ; facture ' || coalesce(ap ->> 'facture', '?') || '] | ';

    if qui = 'cliente' then
      -- Elle ne pose ni ne retire les marques ; le reste de sa ligne s'écrit.
      if (ap ->> 'pose') is distinct from '1 ligne, termine refuse, honneur refuse, le reste ecrit' then
        fautes := fautes || 'la cliente pose encore une marque, ou n ecrit plus sa ligne; ';
      end if;
      if (ap ->> 'retire') is distinct from '1 ligne, termine garde, honneur garde, le reste ecrit' then
        fautes := fautes || 'la cliente retire encore une marque, ou n ecrit plus sa ligne; ';
      end if;
      -- À la création : les marques retirées, ou la création refusée par une autre règle (comme avant).
      if (ap ->> 'cree') is distinct from '1 ligne, termine refuse, honneur refuse'
         and not ((ap ->> 'cree') like 'refus%' and (ap ->> 'cree') is not distinct from (av ->> 'cree')) then
        fautes := fautes || 'la cliente cree un rendez-vous deja termine ou regle; ';
      end if;
    else
      -- La Maison : comme avant, à plein droit.
      if (ap ->> 'pose') is distinct from '1 ligne, termine pose, honneur pose, le reste ecrit'
         or (ap ->> 'retire') is distinct from '1 ligne, termine retire, honneur retire, le reste ecrit'
         or (ap ->> 'cree') is distinct from '1 ligne, termine pose, honneur pose' then
        fautes := fautes || qui || ' ne pose ou ne retire plus les marques; ';
      end if;
      foreach k in array array['pose', 'retire', 'cree'] loop
        if (av ->> k) is distinct from (ap ->> k) then
          fautes := fautes || qui || ' : « ' || k || ' » a change; ';
        end if;
      end loop;
    end if;
  end loop;

  raise exception 'ESSAI 0171 : % | %', case when fautes = '' then 'TIENT' else 'NE TIENT PAS : ' || left(fautes, -2) end, rtrim(r, ' |');
end $essai$;
