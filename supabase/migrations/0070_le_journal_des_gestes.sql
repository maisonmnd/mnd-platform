-- ═══════════════════════════════════════════════════════════════════
-- 0070 — LE JOURNAL DES GESTES · 21 août 2026
--
-- « Je dois tracker systématiquement qui fait quoi et quand sur Le Trône. »
--
-- Née d'une question restée sans réponse : QUI a créé le rendez-vous de
-- Diane C. du 18 août ? La base ne pouvait pas le dire — quatre colonnes par
-- table (id, branch_id, data, updated_at), aucun champ d'auteur nulle part, et
-- `updated_at` qui ne parle que de la DERNIÈRE écriture.
--
-- Ce journal commence à zéro. Rien d'avant ne sera retrouvé : cette
-- information n'a jamais été écrite, donc elle n'existe pas. Prétendre la
-- reconstituer serait pire que le silence.
--
-- ARBITRAGES DE LA MAISON (maquette validée le 21 août) :
--   • lecture réservée aux SOUVERAINS — un journal public change le climat
--     d'une maison ;
--   • garde de DOUZE MOIS glissants, purgés avec le cliché de nuit ;
--   • on journalise CE QU'UNE MAIN TOUCHE, pas la mécanique interne ;
--   • les gestes venus de Ma Couronne sont inscrits sous leur porte d'entrée.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① LE REGISTRE — en AJOUT SEUL ──────────────────────────────────
-- Un registre qu'on peut retoucher ne prouve rien : ni update ni delete ne
-- sont accordés à quiconque, souverain compris. Seule la purge d'ancienneté
-- (fonction definer, ⑤) efface, et seulement au-delà de douze mois.
create table if not exists public.journal_gestes (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists journal_gestes_branch_idx on public.journal_gestes (branch_id);
/* Le journal se lit TOUJOURS du plus récent au plus ancien, par mois : c'est
   l'index qui rend l'écran instantané quand la table aura cent mille lignes. */
create index if not exists journal_gestes_quand_idx
  on public.journal_gestes ((data ->> 'quand') desc);

alter table public.journal_gestes enable row level security;

-- Lecture : souverains seulement.
drop policy if exists journal_gestes_lecture on public.journal_gestes;
create policy journal_gestes_lecture on public.journal_gestes
  for select to authenticated using (public.is_souverain());

-- Écriture : tout compte connecté peut DÉPOSER une ligne (c'est le personnel
-- qui travaille), mais personne ne peut en reprendre une.
drop policy if exists journal_gestes_depot on public.journal_gestes;
create policy journal_gestes_depot on public.journal_gestes
  for insert to authenticated with check (true);

-- Pas de politique UPDATE, pas de politique DELETE : RLS refuse par défaut.
revoke update, delete on public.journal_gestes from anon, authenticated;

-- ── ② LE TEMPS RÉEL N'A RIEN À FAIRE ICI ───────────────────────────
-- Le journal ne se regarde pas vivre : l'écran le lit à l'ouverture. Le
-- diffuser à chaque ligne réveillerait tous les postes des centaines de fois
-- par jour, pour une information que personne n'attend dans l'instant.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'journal_gestes'
  ) then
    alter publication supabase_realtime drop table public.journal_gestes;
  end if;
end $$;

-- ── ③ LE JOURNAL N'ENTRE PAS DANS LE CLICHÉ DE NUIT ────────────────
-- `_photographie_maison()` découvre les tables toute seule — le journal y
-- serait donc entré d'office, et une sauvegarde de 3,4 Mo aurait doublé en
-- quelques semaines pour recopier chaque nuit une trace qu'on garde déjà.
-- On l'exclut comme on exclut déjà les clichés eux-mêmes.
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
      and table_name not in ('sauvegardes_nuit', 'journal_gestes')
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
                    and table_name not in ('sauvegardes_nuit', 'journal_gestes')),
    'tables', tables
  );
end;
$$;

-- ── ④ LA PURGE DES DOUZE MOIS, ATTELÉE AU GESTE DE NUIT ────────────
-- Aucun cron nouveau à poser : le job `sauvegarde-nuit` de 02:00 tourne déjà
-- et il est éprouvé. Il prend le cliché, puis balaie le journal.
create or replace function public.sauvegarde_nuit_sql()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  gardes int;
  vieux int;
begin
  insert into public.sauvegardes_nuit (jour, cliche)
  values (current_date, public._photographie_maison())
  on conflict (jour) do update set cliche = excluded.cliche, prise_le = now();

  delete from public.sauvegardes_nuit where jour < current_date - 14;
  select count(*) into gardes from public.sauvegardes_nuit;

  /* Douze mois glissants — assez pour couvrir un exercice entier et toute
     question qui se pose vraiment. La comparaison porte sur le texte ISO de
     `quand`, qui se trie comme une date parce qu'il en est une. */
  with efface as (
    delete from public.journal_gestes
    where (data ->> 'quand') < to_char(now() - interval '12 months', 'YYYY-MM-DD"T"HH24:MI:SS')
    returning 1
  )
  select count(*) into vieux from efface;

  return 'cliché du ' || current_date || ' rangé — ' || gardes || ' au coffre'
    || case when vieux > 0 then ' · ' || vieux || ' geste(s) de plus d''un an effacé(s)' else '' end;
end;
$$;

revoke execute on function public.sauvegarde_nuit_sql() from public, anon, authenticated;

-- ── LE CONTRÔLE ────────────────────────────────────────────────────
-- Attendu : « registre prêt · en ajout seul », puis « lecture souveraine ».
select
  'journal_gestes' as table_du_journal,
  case when exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'journal_gestes'
  ) then 'registre prêt' else 'MANQUANT' end as etat,
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'journal_gestes' and cmd = 'SELECT') as politiques_lecture,
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'journal_gestes' and cmd in ('UPDATE', 'DELETE')) as politiques_de_retouche,
  (select count(*) from public.journal_gestes) as gestes_inscrits;
