-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC DE 0174 · LA GARDE DE LA FICHE D'ESSAI · 7 novembre 2026
--
-- À jouer AVANT 0174, d'un seul tenant, dans l'éditeur SQL. Tout est ANNULÉ
-- par l'exception finale : la migration, la ligne d'essai, chaque écriture.
-- Chaque écriture tentée est aussi annulée sur-le-champ (un sous-bloc qui
-- lève l'exception « ZZ174 » après avoir relu sa ligne).
--
-- Il pose UNE fiche d'essai (id inventé, jamais une fiche réelle lue ou
-- écrite) au nom d'un compte de cliente INVENTÉ, puis se fait passer, comme
-- PostgREST, pour la CLIENTE (rôle `authenticated`), un compte de l'ÉQUIPE (le
-- premier de `staff`) et le SERVEUR (`service_role`). Pour chacun, AVANT puis
-- APRÈS la migration, il tente :
--   ① de POSER `essai` sur une fiche qui ne l'a pas ;
--   ② de RETIRER `essai` d'une fiche qui l'a ;
--   ③ de CRÉER une fiche qui porte déjà `essai` ;
--   ④ d'écrire un autre champ de la fiche (le reste doit passer).
--
-- CE QU'IL DIT, dans « ESSAI 0174 : … » : la cliente ne pose ni ne retire
-- plus `essai`, ni à la modification ni à la création, et écrit le reste ;
-- l'équipe et le serveur écrivent comme avant ; TIENT, ou NE TIENT PAS.
-- ═══════════════════════════════════════════════════════════════════════════

create function pg_temp.essai_0174_vu_par(p_qui text, p_uid uuid, p_a uuid, p_b uuid, p_c uuid) returns jsonb
language plpgsql as $f$
declare
  d jsonb; n int;
  v_pose text; v_retire text; v_cree text; v_reste text;
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
    -- La cliente est son propre compte (sa fiche porte son identifiant) : A pour poser,
    -- B (fiche d'essai) pour retirer et pour le reste, C (aucune fiche) pour créer.
    perform set_config('request.jwt.claim.sub', (case when p_qui = 'cliente' then p_a else p_uid end)::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', case when p_qui = 'cliente' then p_a else p_uid end, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;

  -- ① Poser `essai` sur la fiche qui ne l'a pas.
  begin
    update public.clients set data = data || '{"essai":true,"essai0174":"oui"}'::jsonb where id = p_a::text;
    get diagnostics n = row_count;
    select data into d from public.clients where id = p_a::text;
    raise exception using errcode = 'ZZ174', message = n::text || ' ligne, '
      || case when d ? 'essai' then 'marque posee' else 'marque refusee' end || ', '
      || case when d->>'essai0174' = 'oui' then 'le reste ecrit' else 'le reste perdu' end;
  exception when others then
    v_pose := case when sqlstate = 'ZZ174' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ② Retirer `essai` de la fiche qui l'a.
  if p_qui = 'cliente' then
    perform set_config('request.jwt.claim.sub', p_b::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_b, 'role', 'authenticated')::text, true);
  end if;
  begin
    update public.clients set data = (data - 'essai') || '{"essai0174":"oui"}'::jsonb where id = p_b::text;
    get diagnostics n = row_count;
    select data into d from public.clients where id = p_b::text;
    raise exception using errcode = 'ZZ174', message = n::text || ' ligne, '
      || case when d ? 'essai' then 'marque gardee' else 'marque retiree' end || ', '
      || case when d->>'essai0174' = 'oui' then 'le reste ecrit' else 'le reste perdu' end;
  exception when others then
    v_retire := case when sqlstate = 'ZZ174' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ③ Créer une fiche qui porte déjà `essai`.
  if p_qui = 'cliente' then
    perform set_config('request.jwt.claim.sub', p_c::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_c, 'role', 'authenticated')::text, true);
  end if;
  begin
    insert into public.clients (id, branch_id, data)
      values (case when p_qui = 'cliente' then p_c::text else 'essai-0174-c' end, nullif(current_setting('essai_0174.branche', true), ''),
              jsonb_build_object('id', case when p_qui = 'cliente' then p_c::text else 'essai-0174-c' end, 'name', 'Essai 0174 C', 'essai', true));
    get diagnostics n = row_count;
    select data into d from public.clients where id = case when p_qui = 'cliente' then p_c::text else 'essai-0174-c' end;
    raise exception using errcode = 'ZZ174', message = n::text || ' ligne, ' || case when d ? 'essai' then 'marque posee' else 'marque refusee' end;
  exception when others then
    v_cree := case when sqlstate = 'ZZ174' then sqlerrm else 'refus ' || sqlstate end;
  end;

  -- ④ Écrire un autre champ de la fiche d'essai : passe comme avant.
  if p_qui = 'cliente' then
    perform set_config('request.jwt.claim.sub', p_b::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_b, 'role', 'authenticated')::text, true);
  end if;
  begin
    update public.clients set data = data || '{"note":"essai0174"}'::jsonb where id = p_b::text;
    get diagnostics n = row_count;
    select data into d from public.clients where id = p_b::text;
    raise exception using errcode = 'ZZ174', message = n::text || ' ligne, note ' || coalesce(d->>'note', 'absente') || ', essai ' || coalesce(d->>'essai', 'absent');
  exception when others then
    v_reste := case when sqlstate = 'ZZ174' then sqlerrm else 'refus ' || sqlstate end;
  end;

  execute format('set local role %I', v_role);
  perform set_config('request.jwt.claims', v_claims, true);
  perform set_config('request.jwt.claim.sub', v_sub, true);
  return jsonb_build_object('pose', v_pose, 'retire', v_retire, 'cree', v_cree, 'reste', v_reste);
end $f$;


-- ── 1. AVANT 0174 : les fiches d'essai, puis les mesures ─────────────────
do $avant$
declare
  v_a uuid := gen_random_uuid();                  -- trois comptes INVENTÉS : aucune fiche, aucun compte réel
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
  v_equipe uuid;
  v_branche public.clients.branch_id%type;
begin
  select user_id into v_equipe from public.staff order by created_at limit 1;
  select branch_id into v_branche from public.clients where branch_id is not null order by updated_at desc limit 1;
  -- Écrites par l'éditeur (la Maison) : la garde les laisse passer telles quelles.
  perform set_config('essai_0174.branche', coalesce(v_branche, ''), false);
  insert into public.clients (id, branch_id, data) values (v_a::text, v_branche,
    jsonb_build_object('id', v_a::text, 'name', 'Essai 0174 A'));
  insert into public.clients (id, branch_id, data) values (v_b::text, v_branche,
    jsonb_build_object('id', v_b::text, 'name', 'Essai 0174 B', 'essai', true));

  perform set_config('essai_0174.cliente_avant', pg_temp.essai_0174_vu_par('cliente', null, v_a, v_b, v_c)::text, false);
  perform set_config('essai_0174.equipe_avant', case when v_equipe is null then '' else pg_temp.essai_0174_vu_par('equipe', v_equipe, v_a, v_b, v_c)::text end, false);
  perform set_config('essai_0174.serveur_avant', pg_temp.essai_0174_vu_par('serveur', null, v_a, v_b, v_c)::text, false);
  perform set_config('essai_0174.ids', v_a::text || ',' || v_b::text || ',' || v_c::text, false);
  perform set_config('essai_0174.equipe', coalesce(v_equipe::text, ''), false);
end $avant$;


-- ── 2. LA MIGRATION 0174, à l'identique ──────────────────────────────────
-- ⟨0174⟩
-- La garde de 0172, mot pour mot, avec la branche des fiches `clients`.
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

  elsif tg_table_name = 'clients' then
    -- LA FICHE D'ESSAI (0174) : `essai` est la marque de la Maison. À la
    -- création, une cliente ne se la pose pas ; à la modification, elle ne la
    -- pose ni ne la retire (la valeur d'AVANT revient, absente le reste).
    new.data := new.data - 'essai';
    if tg_op = 'UPDATE' and (old.data ? 'essai') then
      new.data := jsonb_set(new.data, '{essai}', old.data -> 'essai');
    end if;
  end if;

  return new;
end $$;

-- Le même déclencheur qu'aux rendez-vous et aux pièces (0138), sur les fiches.
drop trigger if exists garde_argent_cliente_biu on public.clients;
create trigger garde_argent_cliente_biu
  before insert or update on public.clients
  for each row execute function public.garde_argent_cliente();
-- ⟨/0174⟩


-- ── 3. APRÈS 0174 : les mêmes mesures, puis le verdict, puis tout est annulé ──
do $essai$
declare
  v_a uuid := split_part(current_setting('essai_0174.ids'), ',', 1)::uuid;
  v_b uuid := split_part(current_setting('essai_0174.ids'), ',', 2)::uuid;
  v_c uuid := split_part(current_setting('essai_0174.ids'), ',', 3)::uuid;
  v_equipe text := current_setting('essai_0174.equipe');
  c_avant jsonb := current_setting('essai_0174.cliente_avant')::jsonb;
  e_avant text := current_setting('essai_0174.equipe_avant');
  s_avant jsonb := current_setting('essai_0174.serveur_avant')::jsonb;
  c_apres jsonb; e_apres jsonb; s_apres jsonb;
  v_ok boolean;
  v_dit text;
begin
  c_apres := pg_temp.essai_0174_vu_par('cliente', null, v_a, v_b, v_c);
  e_apres := case when v_equipe = '' then null else pg_temp.essai_0174_vu_par('equipe', v_equipe::uuid, v_a, v_b, v_c) end;
  s_apres := pg_temp.essai_0174_vu_par('serveur', null, v_a, v_b, v_c);

  v_ok := (c_apres->>'pose') = '1 ligne, marque refusee, le reste ecrit'
      and (c_apres->>'retire') = '1 ligne, marque gardee, le reste ecrit'
      and (c_apres->>'cree') = '1 ligne, marque refusee'
      and (c_apres->>'reste') = '1 ligne, note essai0174, essai true'
      and (e_apres is null or ((e_apres->>'pose') = '1 ligne, marque posee, le reste ecrit' and (e_apres->>'retire') = '1 ligne, marque retiree, le reste ecrit' and (e_apres->>'cree') = '1 ligne, marque posee'))
      and (s_apres ? 'indisponible' or ((s_apres->>'pose') = '1 ligne, marque posee, le reste ecrit' and (s_apres->>'retire') = '1 ligne, marque retiree, le reste ecrit' and (s_apres->>'cree') = '1 ligne, marque posee'));

  v_dit := 'cliente : poser avant [' || (c_avant->>'pose') || '] apres [' || (c_apres->>'pose') || '] ; retirer avant [' || (c_avant->>'retire') || '] apres [' || (c_apres->>'retire') || '] ; creer avant [' || (c_avant->>'cree') || '] apres [' || (c_apres->>'cree') || '] ; reste apres [' || (c_apres->>'reste') || ']'
    || ' | equipe : poser avant [' || coalesce((nullif(e_avant, '')::jsonb)->>'pose', 'sans objet') || '] apres [' || coalesce(e_apres->>'pose', 'sans objet') || '] ; retirer apres [' || coalesce(e_apres->>'retire', 'sans objet') || ']'
    || ' | serveur : poser apres [' || coalesce(s_apres->>'pose', s_apres->>'indisponible', '?') || '] ; retirer apres [' || coalesce(s_apres->>'retire', s_apres->>'indisponible', '?') || ']';

  -- Tout est annulé : l'exception défait la migration, les fiches d'essai, chaque écriture.
  raise exception 'ESSAI 0174 : % | %', case when v_ok then 'TIENT' else 'NE TIENT PAS' end, v_dit;
end $essai$;
