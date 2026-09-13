-- ═══════════════════════════════════════════════════════════════════
-- 0092 — LA TRACE DE LA BASE · 13 septembre 2026
--
-- « J'ai des employés qui font des rendez-vous et des factures, et à la fin
-- de la journée ils disent que ce n'est pas eux. Quand je clique un
-- rendez-vous, je dois retrouver quand il a été créé, par qui, comment il a
-- été tamponné, tout » (Yéman). Maquette « La vie d'un rendez-vous » validée.
--
-- POURQUOI LE JOURNAL DES GESTES (0070) NE SUFFISAIT PAS. Il est écrit PAR
-- L'APPLICATION : le nom vient de l'écran, n'importe quel compte connecté
-- peut y déposer une ligne, une ligne se perd en silence hors ligne, et
-- trois corrections rapprochées n'en font qu'une. Face à « ce n'est pas
-- moi », ce n'est pas une preuve.
--
-- ICI, C'EST LA BASE QUI SIGNE. Un déclencheur, dans la MÊME opération que
-- l'écriture : pas de pièce sans trace. Il retient :
--   · qui : le compte connecté (auth.uid), son e-mail, le nom de sa fiche ;
--   · quand : l'heure du serveur, jamais celle de l'appareil ;
--   · par où : Le Trône, Ma Couronne, un visiteur, un service, la base ;
--   · sur quoi : l'appareil (en-tête du navigateur), sans adresse réseau ;
--   · quoi : la pièce entière à la création et à la suppression, et pour une
--     modification les champs qui ont changé, avec un contexte de lecture
--     (statut, date, numéro, nom) pour que la ligne se comprenne seule.
--
-- ARBITRAGES : chacun son compte · lecture par le souverain et le gérant ·
-- rendez-vous, factures et encaissements, fiches clientes, dépenses et
-- caisses · l'appareil seulement · douze mois de garde.
--
-- PERSONNE N'ÉCRIT CETTE TABLE À LA MAIN, NI NE LA RETOUCHE. Aucune
-- politique d'écriture, droits retirés ; seul le déclencheur (definer) y
-- insère, seule la purge de nuit y efface, au-delà de douze mois.
--
-- Rien d'avant cette migration ne se reconstitue.
-- `est_direction()` vient de 0089 (déjà passée).
-- ═══════════════════════════════════════════════════════════════════

-- ── ① LE REGISTRE ─────────────────────────────────────────────────
create table if not exists public.traces (
  id          bigserial primary key,
  fait_le     timestamptz not null default now(),
  table_name  text not null,
  piece_id    text not null,
  branch_id   text,
  operation   text not null check (operation in ('pose', 'modifie', 'efface')),
  compte      uuid,
  compte_mail text,
  compte_nom  text,
  porte       text not null,
  appareil    text,
  avant       jsonb,
  apres       jsonb
);

create index if not exists traces_piece_idx  on public.traces (table_name, piece_id, fait_le);
create index if not exists traces_quand_idx  on public.traces (fait_le desc);
create index if not exists traces_compte_idx on public.traces (compte, fait_le desc);

alter table public.traces enable row level security;

drop policy if exists traces_lecture on public.traces;
create policy traces_lecture on public.traces for select to authenticated
  using (public.est_direction());

-- Pas de politique d'écriture : la RLS refuse. Et les droits eux-mêmes tombent.
revoke insert, update, delete, truncate on public.traces from anon, authenticated;

-- ── ② UNE VALEUR TROP LONGUE NE GONFLE PAS LA TRACE ──────────────
create or replace function public.trace_allege(d jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case
    when d is null or jsonb_typeof(d) <> 'object' then d
    else coalesce((
      select jsonb_object_agg(e.key,
        case when length(e.value::text) > 20000 then to_jsonb('(trop long pour la trace)'::text) else e.value end)
      from jsonb_each(d) e
    ), '{}'::jsonb)
  end;
$$;

-- ── ③ LE DÉCLENCHEUR QUI SIGNE ────────────────────────────────────
create or replace function public.trace_le_geste() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_o        jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) -> 'data' end;
  v_n        jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) -> 'data' end;
  v_id       text  := coalesce(case when tg_op <> 'DELETE' then to_jsonb(new) ->> 'id' end, to_jsonb(old) ->> 'id');
  v_branche  text  := coalesce(case when tg_op <> 'DELETE' then to_jsonb(new) ->> 'branch_id' end, to_jsonb(old) ->> 'branch_id');
  v_uid      uuid  := auth.uid();
  v_claims   jsonb;
  v_role     text  := '';
  v_mail     text;
  v_nom      text;
  v_porte    text;
  v_appareil text;
  v_avant    jsonb;
  v_apres    jsonb;
  v_op       text;
  v_contexte text[] := array['status', 'number', 'clientName', 'date', 'time', 'kind', 'label', 'name',
                             'amountXof', 'serviceIds', 'apptId', 'invoiceId', 'master', 'category'];
begin
  if tg_op = 'UPDATE' and v_n is not distinct from v_o then
    return null;                                   -- une écriture sans changement n'est pas un geste
  end if;

  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_role := coalesce(v_claims ->> 'role', '');
    v_mail := nullif(v_claims ->> 'email', '');
  exception when others then
    v_claims := null;
  end;

  begin
    v_appareil := left(nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent', 300);
  exception when others then
    v_appareil := null;
  end;

  if v_uid is not null and public.is_staff() then
    v_porte := 'trone';
    select coalesce(
      (select nullif(trim(t.data ->> 'name'), '') from public.team t
        where v_mail is not null
          and lower(coalesce(nullif(trim(t.data ->> 'compteMail'), ''), trim(t.data ->> 'email'))) = lower(v_mail)
        limit 1),
      (select nullif(trim(s.name), '') from public.staff s where s.user_id = v_uid limit 1),
      v_mail,
      'Compte du personnel'
    ) into v_nom;
  elsif v_uid is not null then
    v_porte := 'couronne';
    v_nom := 'Une cliente';
  elsif v_role = 'anon' then
    v_porte := 'visiteur';
    v_nom := 'Un visiteur du site';
  elsif v_role = 'service_role' then
    v_porte := 'serveur';
    v_nom := 'Un service de la Maison';
  else
    v_porte := 'base';
    v_nom := 'La base';
  end if;

  if tg_op = 'INSERT' then
    v_op := 'pose';
    v_apres := v_n;
  elsif tg_op = 'DELETE' then
    v_op := 'efface';
    v_avant := v_o;
  else
    v_op := 'modifie';
    if jsonb_typeof(v_o) = 'object' and jsonb_typeof(v_n) = 'object' then
      select coalesce(jsonb_object_agg(c.k, v_o -> c.k) filter (where v_o ? c.k), '{}'::jsonb),
             coalesce(jsonb_object_agg(c.k, v_n -> c.k) filter (where v_n ? c.k), '{}'::jsonb)
        into v_avant, v_apres
        from (select jsonb_object_keys(v_o) as k union select jsonb_object_keys(v_n)) c
       where (v_o -> c.k) is distinct from (v_n -> c.k);
      -- Le contexte de lecture : la ligne se comprend sans rouvrir la pièce.
      select v_avant || coalesce(jsonb_object_agg(x.k, v_o -> x.k) filter (where v_o ? x.k), '{}'::jsonb),
             v_apres || coalesce(jsonb_object_agg(x.k, v_n -> x.k) filter (where v_n ? x.k), '{}'::jsonb)
        into v_avant, v_apres
        from unnest(v_contexte) as x(k);
    else
      v_avant := v_o;
      v_apres := v_n;
    end if;
  end if;

  insert into public.traces
    (table_name, piece_id, branch_id, operation, compte, compte_mail, compte_nom, porte, appareil, avant, apres)
  values
    (tg_table_name, coalesce(v_id, '?'), v_branche, v_op, v_uid, v_mail, v_nom, v_porte, v_appareil,
     public.trace_allege(v_avant), public.trace_allege(v_apres));

  return null;
end $$;

-- ── ④ LES PIÈCES TRACÉES ──────────────────────────────────────────
-- Une table absente de cette base est sautée plutôt que de faire échouer
-- toute la migration.
do $$
declare
  t text;
begin
  foreach t in array array[
    'appointments',                                   -- les rendez-vous
    'invoices', 'payments', 'credit_movements',       -- factures, paiements en ligne, avoirs
    'clients',                                        -- les fiches clientes
    'expenses', 'cashboxes', 'transferts_caisse',     -- dépenses et caisses
    'coffre_movements', 'entrees_hors_activite'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trace_le_geste on public.%I', t);
      execute format(
        'create trigger trace_le_geste after insert or update or delete on public.%I '
        || 'for each row execute function public.trace_le_geste()', t);
    end if;
  end loop;
end $$;

-- ── ⑤ LA TRACE N'ENTRE PAS DANS LE CLICHÉ DE NUIT ─────────────────
-- Reprise de 0070 à l'identique, `traces` ajoutée aux exclusions.
create or replace function public._photographie_maison()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tables jsonb := '{}'::jsonb;
  lignes_total bigint := 0;
  t record;
  contenu jsonb;
  n bigint;
begin
  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
      and table_name not in ('sauvegardes_nuit', 'journal_gestes', 'traces')
    order by table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb), count(*) from %I x', t.table_name)
      into contenu, n;
    tables := tables || jsonb_build_object(t.table_name, contenu);
    lignes_total := lignes_total + n;
  end loop;

  return jsonb_build_object(
    'maison', 'MND',
    'prise_le', now(),
    'lignes', lignes_total,
    'nb_tables', (select count(*) from information_schema.tables
                  where table_schema = 'public' and table_type = 'BASE TABLE'
                    and table_name not in ('sauvegardes_nuit', 'journal_gestes', 'traces')),
    'tables', tables
  );
end;
$$;

-- ── ⑥ LA PURGE DES DOUZE MOIS, ATTELÉE AU GESTE DE NUIT ───────────
-- Reprise de 0070 à l'identique, la purge des traces ajoutée.
create or replace function public.sauvegarde_nuit_sql()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  gardes int;
  vieux int;
  vieilles int;
begin
  insert into public.sauvegardes_nuit (jour, cliche)
  values (current_date, public._photographie_maison())
  on conflict (jour) do update set cliche = excluded.cliche, prise_le = now();

  delete from public.sauvegardes_nuit where jour < current_date - 14;
  select count(*) into gardes from public.sauvegardes_nuit;

  with efface as (
    delete from public.journal_gestes
    where (data ->> 'quand') < to_char(now() - interval '12 months', 'YYYY-MM-DD"T"HH24:MI:SS')
    returning 1
  )
  select count(*) into vieux from efface;

  with efface_traces as (
    delete from public.traces
    where fait_le < now() - interval '12 months'
    returning 1
  )
  select count(*) into vieilles from efface_traces;

  return 'cliché du ' || current_date || ' rangé — ' || gardes || ' au coffre'
    || case when vieux > 0 then ' · ' || vieux || ' geste(s) de plus d''un an effacé(s)' else '' end
    || case when vieilles > 0 then ' · ' || vieilles || ' trace(s) de plus d''un an effacée(s)' else '' end;
end;
$$;

revoke execute on function public.sauvegarde_nuit_sql() from public, anon, authenticated;

-- ── LE CONTRÔLE ────────────────────────────────────────────────────
-- Attendu : une ligne par table tracée, et « lecture direction ».
select c.relname as table_tracee, t.tgname as declencheur
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal and t.tgname = 'trace_le_geste'
order by 1;
