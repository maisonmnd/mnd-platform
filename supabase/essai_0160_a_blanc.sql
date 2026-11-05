-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC DE 0160 · LES ENGAGEMENTS À LA DIRECTION · 5 novembre 2026
--
-- À jouer AVANT 0160, d'un seul tenant, dans l'éditeur SQL. Tout est ANNULÉ
-- par l'exception finale : la migration, la ligne d'essai, chaque écriture.
-- Chaque écriture tentée est aussi annulée sur-le-champ (un sous-bloc qui
-- lève l'exception « ZZ160 » après avoir compté ses lignes) : rien ne bouge,
-- même entre deux mesures.
--
-- Comment il s'y prend, en se faisant passer pour un compte (le rôle
-- `authenticated` et le `sub` du jeton, comme PostgREST) :
--   1. AVANT 0160 : pour un compte de l'équipe (ni souverain ni gérant), pour
--      un souverain, pour un gérant s'il y en a un, et pour la clé publique
--      (`anon`), il note, clé par clé de `documents`, s'il lit la ligne et
--      s'il peut l'écrire ; puis, sur la ligne des engagements, s'il peut la
--      réécrire comme le Trône (insert … on conflict do update) et l'effacer,
--      et s'il peut créer une clé neuve. Les règles permissives sont notées.
--   2. LA MIGRATION 0160, recopiée à l'identique (le banc compare).
--   3. APRÈS : les mêmes mesures, comparées.
--
-- CE QU'IL DIT, dans le message d'erreur final « ESSAI 0160 : … » :
--   · l'équipe ne lit plus la ligne, ne l'écrit plus, ne l'efface plus ;
--   · le souverain (et le gérant) la lit et l'écrit toujours ;
--   · pour TOUTES les autres clés, chaque compte lit et écrit exactement comme
--     avant (le nombre de clés identiques, et les écarts s'il y en a) ;
--   · les règles permissives sont celles d'avant, la restrictive est posée ;
--   · TIENT, ou NE TIENT PAS et pourquoi.
-- Aucun nom : les comptes sont dits par leur rôle. Rejoué APRÈS 0160, il
-- tient encore ; « avant » montre alors l'équipe déjà sans la ligne.
-- Éprouvé le 5 novembre 2026 sur PostgreSQL (PGlite) avec une maquette des
-- règles de 0130 : TIENT, rien ne reste ; et une 0160 qui réserverait aussi
-- `mnd_porteurs` le fait dire NE TIENT PAS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. LA MESURE : ce qu'un compte lit et écrit dans `documents` ─────────
create function pg_temp.essai_0160_vu_par(p_uid uuid, p_cles text[]) returns jsonb
language plpgsql as $f$
declare
  v_cles jsonb := '{}'::jsonb;
  k text; lu boolean; n int; issue text;
  v_upsert text; v_efface text; v_neuve text;
  -- Ce qu'on rendra en sortant : le rôle de l'éditeur et son jeton, tels quels.
  v_role text := current_user;
  v_claims text := coalesce(current_setting('request.jwt.claims', true), '');
  v_sub text := coalesce(current_setting('request.jwt.claim.sub', true), '');
begin
  if p_uid is null then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
  else
    perform set_config('request.jwt.claim.sub', p_uid::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    set local role authenticated;
  end if;

  foreach k in array p_cles loop
    select exists (select 1 from public.documents d where d.key = k) into lu;
    begin
      update public.documents set data = data where key = k;
      get diagnostics n = row_count;
      raise exception using errcode = 'ZZ160', message = n::text;
    exception when others then
      issue := case when sqlstate = 'ZZ160' then sqlerrm else 'refus ' || sqlstate end;
    end;
    v_cles := v_cles || jsonb_build_object(k, case when lu then 'lit' else 'ne lit pas' end || ', ecrit ' || issue);
  end loop;

  begin
    insert into public.documents as d (key, data) values ('mnd_engagements_du_mois', '[]'::jsonb)
      on conflict (key) do update set data = d.data;
    raise exception using errcode = 'ZZ160', message = 'passe';
  exception when others then
    v_upsert := case when sqlstate = 'ZZ160' then sqlerrm else 'refus ' || sqlstate end;
  end;
  begin
    delete from public.documents where key = 'mnd_engagements_du_mois';
    get diagnostics n = row_count;
    raise exception using errcode = 'ZZ160', message = n::text;
  exception when others then
    v_efface := case when sqlstate = 'ZZ160' then sqlerrm else 'refus ' || sqlstate end;
  end;
  begin
    insert into public.documents (key, data) values ('essai_0160_cle_neuve', '{}'::jsonb);
    raise exception using errcode = 'ZZ160', message = 'passe';
  exception when others then
    v_neuve := case when sqlstate = 'ZZ160' then sqlerrm else 'refus ' || sqlstate end;
  end;

  execute format('set local role %I', v_role);
  perform set_config('request.jwt.claims', v_claims, true);
  perform set_config('request.jwt.claim.sub', v_sub, true);
  return jsonb_build_object('cles', v_cles, 'upsert', v_upsert, 'efface', v_efface, 'neuve', v_neuve);
end $f$;


-- ── 1. AVANT 0160 ─────────────────────────────────────────────────────────
do $avant$
declare
  v_cles text[];
  v_equipe uuid; v_souverain uuid; v_gerant uuid;
begin
  -- La ligne des engagements existe pour l'essai (annulée à la fin si elle est neuve).
  insert into public.documents (key, data) values ('mnd_engagements_du_mois', '[]'::jsonb) on conflict (key) do nothing;
  select array_agg(key order by key) into v_cles from public.documents;
  select user_id into v_equipe from public.staff where role not in ('souverain', 'gerant') order by created_at limit 1;
  select user_id into v_souverain from public.staff where role = 'souverain' order by created_at limit 1;
  select user_id into v_gerant from public.staff where role = 'gerant' order by created_at limit 1;
  perform set_config('essai_0160.cles', v_cles::text, false);
  perform set_config('essai_0160.equipe', coalesce(v_equipe::text, ''), false);
  perform set_config('essai_0160.souverain', coalesce(v_souverain::text, ''), false);
  perform set_config('essai_0160.gerant', coalesce(v_gerant::text, ''), false);
  -- Un compte absent ne se mesure pas (un `null` serait la clé publique).
  perform set_config('essai_0160.equipe_avant', case when v_equipe is null then '' else pg_temp.essai_0160_vu_par(v_equipe, v_cles)::text end, false);
  perform set_config('essai_0160.souverain_avant', case when v_souverain is null then '' else pg_temp.essai_0160_vu_par(v_souverain, v_cles)::text end, false);
  perform set_config('essai_0160.gerant_avant', case when v_gerant is null then '' else pg_temp.essai_0160_vu_par(v_gerant, v_cles)::text end, false);
  perform set_config('essai_0160.anon_avant', pg_temp.essai_0160_vu_par(null, v_cles)::text, false);
  perform set_config('essai_0160.regles_avant', coalesce((
    select string_agg(policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, ''), ' | ' order by policyname)
      from pg_policies where schemaname = 'public' and tablename = 'documents' and permissive = 'PERMISSIVE'), ''), false);
end $avant$;


-- ── 2. LA MIGRATION 0160, à l'identique ──────────────────────────────────
-- ⟨0160⟩
create or replace function public.cles_de_la_direction() returns text[]
language sql immutable as $$
  select array['mnd_engagements_du_mois']::text[]
$$;

drop policy if exists docs_direction_seule on public.documents;
create policy docs_direction_seule on public.documents
  as restrictive
  for all
  to anon, authenticated
  using (not (key = any(public.cles_de_la_direction())) or public.est_direction())
  with check (not (key = any(public.cles_de_la_direction())) or public.est_direction());
-- ⟨/0160⟩


-- ── 3. APRÈS 0160 : les mêmes mesures, comparées ─────────────────────────
do $essai$
declare
  ENG constant text := 'mnd_engagements_du_mois';
  v_cles text[] := current_setting('essai_0160.cles')::text[];
  v_equipe uuid := nullif(current_setting('essai_0160.equipe'), '')::uuid;
  v_souverain uuid := nullif(current_setting('essai_0160.souverain'), '')::uuid;
  v_gerant uuid := nullif(current_setting('essai_0160.gerant'), '')::uuid;
  av jsonb; ap jsonb;
  qui text; uid uuid;
  k text; pareilles int; ecarts text;
  r text := '';
  fautes text := '';
  regles_apres text;
  n int;
begin
  foreach qui in array array['equipe', 'souverain', 'gerant', 'anon'] loop
    uid := case qui when 'equipe' then v_equipe when 'souverain' then v_souverain when 'gerant' then v_gerant end;
    if qui <> 'anon' and uid is null then
      r := r || qui || ' : aucun compte a essayer | ';
      if qui in ('equipe', 'souverain') then fautes := fautes || 'aucun compte ' || qui || '; '; end if;
      continue;
    end if;
    av := nullif(current_setting('essai_0160.' || qui || '_avant'), '')::jsonb;
    ap := pg_temp.essai_0160_vu_par(uid, v_cles);

    -- Toutes les autres clés : exactement comme avant.
    pareilles := 0; ecarts := '';
    foreach k in array v_cles loop
      continue when k = ENG;
      if (av -> 'cles' ->> k) is not distinct from (ap -> 'cles' ->> k) then
        pareilles := pareilles + 1;
      else
        ecarts := ecarts || k || ' (' || coalesce(av -> 'cles' ->> k, '?') || ' > ' || coalesce(ap -> 'cles' ->> k, '?') || ') ';
      end if;
    end loop;
    if (av ->> 'neuve') is distinct from (ap ->> 'neuve') then
      ecarts := ecarts || 'cle neuve (' || coalesce(av ->> 'neuve', '?') || ' > ' || coalesce(ap ->> 'neuve', '?') || ') ';
    end if;

    r := r || qui || ' : engagements avant [' || coalesce(av -> 'cles' ->> ENG, '?') || ', reecrit ' || coalesce(av ->> 'upsert', '?') || ', efface ' || coalesce(av ->> 'efface', '?')
      || '] apres [' || coalesce(ap -> 'cles' ->> ENG, '?') || ', reecrit ' || coalesce(ap ->> 'upsert', '?') || ', efface ' || coalesce(ap ->> 'efface', '?')
      || '] ; autres cles ' || pareilles || ' sur ' || (cardinality(v_cles) - 1) || ' identiques'
      || case when ecarts <> '' then ', ECARTS : ' || ecarts else '' end || ' | ';
    if ecarts <> '' then fautes := fautes || qui || ' : une autre cle a change; '; end if;

    -- La ligne des engagements : la direction seule.
    if qui in ('souverain', 'gerant') then
      if (ap -> 'cles' ->> ENG) <> 'lit, ecrit 1' or (ap ->> 'upsert') <> 'passe' or (ap ->> 'efface') <> '1' then
        fautes := fautes || qui || ' ne lit ou n ecrit plus les engagements; ';
      end if;
    else
      if (ap -> 'cles' ->> ENG) <> 'ne lit pas, ecrit 0' or (ap ->> 'upsert') not like 'refus%' or (ap ->> 'efface') <> '0' then
        fautes := fautes || qui || ' lit, ecrit ou efface encore les engagements; ';
      end if;
    end if;
  end loop;

  select coalesce(string_agg(policyname || ' ' || cmd || ' ' || array_to_string(roles, ',') || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, ''), ' | ' order by policyname), '')
    into regles_apres
    from pg_policies where schemaname = 'public' and tablename = 'documents' and permissive = 'PERMISSIVE';
  if regles_apres is distinct from current_setting('essai_0160.regles_avant') then
    fautes := fautes || 'une regle permissive a change; ';
  end if;
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'documents' and policyname = 'docs_direction_seule' and permissive = 'RESTRICTIVE';
  r := r || 'regles permissives ' || case when regles_apres = current_setting('essai_0160.regles_avant') then 'inchangees' else 'CHANGEES' end
    || ', restrictive de la direction ' || case when n = 1 then 'posee' else 'ABSENTE' end || ' | ';
  if n <> 1 then fautes := fautes || 'la regle restrictive manque; '; end if;

  raise exception 'ESSAI 0160 : % | %', case when fautes = '' then 'TIENT' else 'NE TIENT PAS : ' || left(fautes, -2) end, rtrim(r, ' |');
end $essai$;
