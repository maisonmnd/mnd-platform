-- ═══════════════════════════════════════════════════════════════════
-- SUPPRIMER LES TABLES `import_*` — la zone d'atterrissage de l'ancien ERP.
-- (SQL Editor → Run)
--
-- Elles ont été VIDÉES par reset_server_total.sql ; il ne reste que des
-- coquilles. Ce script les fait disparaître du schéma.
--
-- POURQUOI C'EST SANS RISQUE. Aucune ligne de code ne les interroge : une
-- recherche sur tout le dépôt ne trouve que deux COMMENTAIRES
-- (shared/agenda.ts, apps/trone/houseReset.ts), corrigés dans le même
-- geste que ce fichier. Ces tables n'ont jamais été des tables de l'app —
-- elles ont été créées à la main pour recevoir la migration, et le travail
-- est fini. La copie de référence vit dans l'autre ERP.
--
-- ─── LE GARDE-FOU ──────────────────────────────────────────────────
-- Une table `import_*` qui contiendrait ENCORE des lignes n'est PAS
-- supprimée : elle est signalée, et rien d'autre. On ne fait pas
-- disparaître de la donnée d'un `drop table` sans l'avoir vue partir d'un
-- `delete` d'abord. Si le rapport dit « REFUSÉE », c'est que le reset
-- n'était pas complet — relance-le avant de revenir ici.
-- ═══════════════════════════════════════════════════════════════════

-- ─── L'INVENTAIRE ──────────────────────────────────────────────────
-- `like 'import@_%' escape '@'` : sans l'échappement, `_` est un joker qui
-- filerait aussi sur « importX… ». Ici on veut le tiret bas littéral.
create temp table cible (t text primary key, n bigint) on commit drop;
do $$
declare r record; c bigint;
begin
  for r in
    select cl.relname from pg_class cl
    join pg_namespace ns on ns.oid = cl.relnamespace
    where ns.nspname = 'public' and cl.relkind = 'r'
      and cl.relname like 'import@_%' escape '@'
    order by cl.relname
  loop
    execute format('select count(*) from public.%I', r.relname) into c;
    insert into cible values (r.relname, c);
  end loop;
end $$;

-- ─── LA SUPPRESSION, LES VIDES SEULEMENT ───────────────────────────
create temp table fait (t text primary key, n bigint, verdict text) on commit drop;
do $$
declare r record;
begin
  for r in select t, n from cible order by t loop
    if r.n > 0 then
      insert into fait values (r.t, r.n, '⚠ REFUSÉE — encore peuplée, on ne la supprime pas');
    else
      execute format('drop table public.%I', r.t);
      insert into fait values (r.t, 0, '✔ SUPPRIMÉE');
    end if;
  end loop;
end $$;

-- ═══ RAPPORT ═══════════════════════════════════════════════════════
select rubrique, detail
from (
  select 1 as bloc, 0::bigint as rang,
         case when not exists (select 1 from cible) then '◻ RIEN À FAIRE'
              when exists (select 1 from fait where n > 0) then '⚠ CERTAINES ONT ÉTÉ REFUSÉES'
              else '✔ TABLES import_* SUPPRIMÉES' end as rubrique,
         case when not exists (select 1 from cible)
                then 'Aucune table `import_*` dans le schéma — c''est déjà fait.'
              when exists (select 1 from fait where n > 0)
                then 'Une table encore peuplée n''a pas été touchée : relance reset_server_total.sql, puis reviens.'
              else (select count(*)::text from fait) || ' table(s) retirée(s) du schéma. La zone d''atterrissage de la migration n''existe plus.' end as detail

  union all
  select 2, row_number() over (order by f.t), f.verdict, f.t
  from fait f

  -- Ce qui reste du schéma, pour vérifier qu'on n'a touché que l'import.
  union all
  select 3, 0::bigint, 'TABLES RESTANTES',
         count(*) || ' : ' || string_agg(cl.relname, ' · ' order by cl.relname)
  from pg_class cl
  join pg_namespace ns on ns.oid = cl.relnamespace
  where ns.nspname = 'public' and cl.relkind = 'r'
) t
order by bloc, rang;
