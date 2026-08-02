-- ═══════════════════════════════════════════════════════════════════
-- TOUTES LES DONNÉES — EFFACEMENT DÉFINITIF ET VERROUILLÉ.
-- Une seule exécution. Analytics, Bilan, Synthèse et Caisse tombent à
-- zéro, et rien ne peut les repeupler.
-- (SQL Editor → Run · « Run without RLS »)
--
-- Ce fichier REMPLACE `catalogue_efface_definitif.sql` : même mécanique,
-- étendue du catalogue à l'ensemble des tables de données.
--
-- ─── CE QUI EST EFFACÉ ─────────────────────────────────────────────
-- Toute table du schéma `public` portant une colonne `id` — donc les
-- rendez-vous, clientes, factures, dépenses, paiements, avoirs, coffre,
-- caisses, pourboires, Académie, paie, catalogue… Analytics et la
-- Synthèse ne calculent QUE là-dessus : ils afficheront zéro.
--
-- ─── CE QUI SURVIT, ET C'EST VOULU ─────────────────────────────────
--   · `staff`, `staff_branches` — tes comptes d'accès.
--   · `branches`               — MND HOME, sinon l'app n'a plus de maison.
--   · `documents`              — tes RÉGLAGES (horaires, marque, Vitrine,
--     taux de points). Une ligne = un réglage, pas une donnée métier :
--     rien de tout cela n'entre dans un chiffre.
--
-- ─── POURQUOI ÇA TIENDRA, CETTE FOIS ───────────────────────────────
-- L'identifiant de chaque ligne effacée devient une PIERRE TOMBALE, et un
-- déclencheur refuse silencieusement toute tentative de la réinsérer. Un
-- navigateur resté ouvert avec l'ancien cache peut pousser ce qu'il veut :
-- la base n'écrit rien. Il croit avoir réussi, il ne s'est rien passé.
--
-- Silencieusement — `return null` — et non par une erreur : une exception
-- ferait échouer toute la synchro de l'app et allumerait une alerte au
-- comptoir pour un geste qu'on veut simplement ignorer.
--
-- ─── ⚠ AVANT DE RÉ-IMPORTER DEPUIS L'ANCIEN ERP ────────────────────
-- Lance `import_1_avant.sql` : il lève ces verrous. Sans lui, ton import
-- annoncerait « lignes insérées » et la base n'en garderait aucune.
-- Ce que tu créeras à la main dans l'app porte des identifiants NEUFS :
-- aucun verrou ne les concerne.
-- ═══════════════════════════════════════════════════════════════════

-- ─── LES PIERRES TOMBALES, PAR TABLE ───────────────────────────────
-- Clé composée (table, id) : deux tables peuvent porter le même
-- identifiant sans que l'une bloque l'autre.
create table if not exists public.data_tombstones (
  t       text not null,
  id      text not null,
  pose_le timestamptz not null default now(),
  primary key (t, id)
);
alter table public.data_tombstones enable row level security;
-- Aucune politique : invisible aux clés `anon` et `authenticated`.

-- ─── LE DÉCLENCHEUR, COMMUN À TOUTES LES TABLES ────────────────────
create or replace function public.refuse_resurrection()
returns trigger language plpgsql security definer as $$
begin
  if exists (select 1 from public.data_tombstones d
             where d.t = tg_table_name and d.id = new.id) then
    return null;
  end if;
  return new;
end $$;

-- ─── LE BALAYAGE ───────────────────────────────────────────────────
create table if not exists public.data_tombstones_log (
  t text primary key, efface bigint, fait_le timestamptz not null default now()
);
truncate public.data_tombstones_log;

do $$
declare r record; c bigint;
begin
  for r in
    select cl.relname from pg_class cl
    join pg_namespace ns on ns.oid = cl.relnamespace
    where ns.nspname = 'public' and cl.relkind = 'r'
      -- ce qui survit
      and cl.relname not in ('staff', 'staff_branches', 'branches', 'documents',
                             'data_tombstones', 'data_tombstones_log', 'catalog_tombstones')
      and cl.relname not like '%rate_limit%'
      -- seules les tables à identifiant : `documents` (clé `key`) est donc hors jeu
      and exists (select 1 from information_schema.columns co
                  where co.table_schema = 'public' and co.table_name = cl.relname
                    and co.column_name = 'id')
    order by cl.relname
  loop
    execute format('select count(*) from public.%I', r.relname) into c;

    -- ① la trace de ce qui existait
    execute format(
      'insert into public.data_tombstones (t, id) select %L, id::text from public.%I
       on conflict (t, id) do nothing', r.relname, r.relname);

    -- ② le refus de le voir revenir
    execute format('drop trigger if exists no_resurrect on public.%I', r.relname);
    execute format(
      'create trigger no_resurrect before insert on public.%I
       for each row execute function public.refuse_resurrection()', r.relname);

    -- ③ l'effacement
    execute format('delete from public.%I', r.relname);

    insert into public.data_tombstones_log (t, efface) values (r.relname, c);
  end loop;
end $$;

-- ═══ RAPPORT ═══════════════════════════════════════════════════════
select rubrique, detail from (
  select 1 as bloc, 0::bigint as rang,
         case when (select coalesce(sum(efface), 0) from public.data_tombstones_log) >= 0
              then '✔ DONNÉES EFFACÉES ET VERROUILLÉES' end as rubrique,
         (select coalesce(sum(efface), 0) from public.data_tombstones_log)
         || ' ligne(s) effacées sur '
         || (select count(*) from public.data_tombstones_log) || ' table(s). '
         || 'Analytics, Bilan et Synthèse afficheront zéro. Recharge Le Trône : le serveur fait foi, ton navigateur s''alignera dessus.' as detail

  union all
  select 2, row_number() over (order by efface desc, t), 'VIDÉ ET VERROUILLÉ',
         t || ' · ' || efface || ' ligne(s)'
  from public.data_tombstones_log where efface > 0

  union all
  select 3, 0::bigint, 'PIERRES TOMBALES',
         (select count(*) from public.data_tombstones) || ' identifiant(s) désormais refusés à l''insertion, sur '
      || (select count(distinct t) from public.data_tombstones) || ' table(s).'

  union all
  select 4, 0::bigint, 'CONSERVÉ',
         'staff & staff_branches (tes accès) · branches ('
      || coalesce((select string_agg(coalesce(b.data->>'name','?'), ' · ') from public.branches b), 'aucune')
      || ') · documents (' || (select count(*) from public.documents) || ' réglages)'

  union all
  select 5, 0::bigint, '⚠ AVANT UN IMPORT',
         'Lance `import_1_avant.sql` pour lever ces verrous, sinon l''import n''écrira rien — sans erreur.'
) t order by bloc, rang;
