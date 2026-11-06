-- ═══════════════════════════════════════════════════════════════════════
-- 0170 · L'ATTENTION · 6 novembre 2026
--        À coller dans Supabase › SQL Editor, puis Run, APRÈS la 0169.
--        Se rejoue sans danger (« if not exists », « create or replace »).
--
-- « Les gens qui ont des abonnements ont une petite surprise à chaque fois,
-- même une toute petite surprise qu'ils veulent découvrir […] parce qu'ils
-- nous font confiance, plus que toutes les autres personnes. » (Yéman.)
-- Maquette public/maquette-l-abonnement-refait.html, « construis les 2 lots »
-- le 6 novembre 2026. Les règles vivent dans src/shared/attentions-pur.ts.
--
-- ① TROIS TABLES, À LA MAISON SEULE (lecture et écriture `is_staff()`) :
--    · attention_articles : la boutique des attentions (à boire, à goûter,
--      le présent ; offert, à la carte, sceau d'or ; la réserve) ;
--    · attention_paniers  : un panier par séance de formule, son identifiant
--      est celui du rendez-vous ; proposé, validé, « Arrivée », « Remise » ;
--    · attention_reglages : le programme par formule, la collection de
--      cartes, le coût visé.
--    Rien ne s'efface : un article se retire (`retire`), un panier reste.
--
-- ② LA SURPRISE SE GARDE ICI. Aucune cliente ne lit ces tables. Ma Couronne
--    appelle `mes_attentions(p_client_id)`, qui ne rend que SES paniers
--    VALIDÉS (elle, ou une tête qu'elle porte : `est_ma_tete`), et pour
--    chacun le strict nécessaire :
--      · remis : ce qu'elle a reçu (les noms figés à la remise) et le mot ;
--      · le prochain à venir : « scellée », sa date et l'indice du présent,
--        jamais le présent lui-même ;
--      · les suivants : « à venir », sans indice.
--    Le panier d'une séance annulée, ou passée sans remise, ne se montre pas.
--    Jumeau éprouvé : `ceQuElleLit` (attentions-pur.ts).
--
-- Dépend de : is_staff() (0003), touch_updated_at() (0001), est_ma_tete()
-- (0076), abo_aujourdhui() (0138).
-- ═══════════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['attention_articles', 'attention_paniers', 'attention_reglages'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id         text primary key,
        branch_id  text,
        data       jsonb not null default '{}'::jsonb,
        updated_at timestamptz not null default now()
      )$f$, t);
    execute format('alter table public.%1$I enable row level security', t);
    execute format('drop trigger if exists %1$s_touch on public.%1$I', t);
    execute format('create trigger %1$s_touch before update on public.%1$I for each row execute function public.touch_updated_at()', t);
    execute format('drop policy if exists %1$s_lire on public.%1$I', t);
    execute format('create policy %1$s_lire on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('drop policy if exists %1$s_ecrire on public.%1$I', t);
    execute format('create policy %1$s_ecrire on public.%1$I for insert to authenticated with check (public.is_staff())', t);
    execute format('drop policy if exists %1$s_reprendre on public.%1$I', t);
    execute format('create policy %1$s_reprendre on public.%1$I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    -- Pas de politique de suppression, et aucun droit d'effacer : on retire
    -- tout, puis on ne rend à une session que lire, écrire et reprendre.
    execute format('revoke all on public.%1$I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%1$I to authenticated', t);
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

create index if not exists attention_paniers_cliente on public.attention_paniers ((data->>'clientId'));

-- ── DEBUT mes_attentions
create or replace function public.mes_attentions(p_client_id text default null)
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_uid  text := (auth.uid())::text;
  v_jour text := public.abo_aujourdhui()::text;
  v_out  jsonb;
begin
  if v_uid is null then raise exception 'Connexion requise.'; end if;
  with siens as (
    select p.data as d, (p.data ? 'remiseLe') as remis
      from public.attention_paniers p
     where p.data->>'etat' = 'valide'
       and (p_client_id is null or p.data->>'clientId' = p_client_id)
       and public.est_ma_tete(coalesce(p.data->>'clientId', ''))
       and ((p.data ? 'remiseLe') or coalesce(p.data->>'date', '') >= v_jour)
       and not exists (select 1 from public.appointments a where a.id = p.id and a.data->>'status' = 'annulé')
  ), ranges as (
    select d, remis,
           row_number() over (partition by d->>'clientId', remis order by d->>'date', d->>'time') as n
      from siens
  ), lus as (
    select d->>'date' as jour, d->>'time' as heure,
           jsonb_build_object('apptId', d->>'apptId', 'clientId', d->>'clientId', 'date', d->>'date', 'rang', d->'rang', 'total', d->'total',
                              'or', coalesce((d->>'or')::boolean, false))
           || case
                when remis then jsonb_build_object('etat', 'recue', 'mot', coalesce(d->>'mot', ''), 'recu', coalesce(d->'recu', '{}'::jsonb))
                when n = 1 then jsonb_build_object('etat', 'scellee', 'arrivee', (d ? 'arriveeLe'))
                  || coalesce((select jsonb_build_object('indice', btrim(a.data->>'indice'))
                                 from public.attention_articles a
                                where a.id = d->>'present' and btrim(coalesce(a.data->>'indice', '')) <> ''), '{}'::jsonb)
                else jsonb_build_object('etat', 'a-venir')
              end as lu
      from ranges
  )
  select coalesce(jsonb_agg(lu order by jour, heure), '[]'::jsonb) into v_out from lus;
  return jsonb_build_object('ok', true, 'attentions', v_out);
end; $$;
revoke all on function public.mes_attentions(text) from public, anon;
grant execute on function public.mes_attentions(text) to authenticated;
-- ── FIN mes_attentions


-- ── CONTRÔLE, LECTURE SEULE ───────────────────────────────────────
-- Attendu : 3 tables sous RLS, 9 politiques, 3 tables publiées, aucune
-- politique ouverte à une cliente, la fonction posée, fermée à `anon`.
select
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('attention_articles', 'attention_paniers', 'attention_reglages') and c.relrowsecurity) as tables_sous_rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('attention_articles', 'attention_paniers', 'attention_reglages')) as politiques,
  (select count(*) from pg_policies where schemaname = 'public' and tablename in ('attention_articles', 'attention_paniers', 'attention_reglages')
      and position('is_staff()' in coalesce(qual, '') || coalesce(with_check, '')) = 0) as politiques_hors_maison,
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('attention_articles', 'attention_paniers', 'attention_reglages')) as tables_publiees,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'mes_attentions') as fonction,
  has_function_privilege('anon', 'public.mes_attentions(text)', 'execute') as ouverte_a_anon;

-- RETOUR EN ARRIÈRE (à la main, seulement si rien n'a été remis) :
--   drop function if exists public.mes_attentions(text);
--   drop table if exists public.attention_paniers, public.attention_articles, public.attention_reglages;
