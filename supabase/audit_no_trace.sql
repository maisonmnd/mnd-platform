-- ═══════════════════════════════════════════════════════════════════
-- « JE NE VEUX AUCUNE TRACE » — la vérification. LECTURE SEULE.
-- (SQL Editor → Run)
--
-- Trois questions, trois réponses :
--   ① Reste-t-il UN SEUL rendez-vous, où que ce soit ?
--   ② Reste-t-il quelque chose dans une table, quelle qu'elle soit ?
--   ③ Reste-t-il une TRACE des anciennes maisons — pas seulement des
--      lignes, mais leur NOM ou leur IDENTIFIANT enfoui dans un `data` ?
--
-- La question ③ est la seule qui compte vraiment. Une table peut être
-- vide et un identifiant mort continuer de vivre ailleurs : c'est
-- exactement ce qui s'est passé avec `br-xrnyd4nh7x`, cité par 385
-- rendez-vous alors que la branche n'existait plus. On cherche donc les
-- marqueurs dans le TEXTE de tous les `data` du schéma.
--
-- Ce script ne modifie rien. Il peut être relancé autant que voulu.
-- ═══════════════════════════════════════════════════════════════════

-- ─── LES MARQUEURS TRAQUÉS ─────────────────────────────────────────
-- Identifiants et noms des maisons à faire disparaître. `"maison"` est
-- entre guillemets JSON à dessein : c'est l'id de la branche par défaut
-- (« Ma Maison »), et le chercher nu ferait sonner le mot « maison » dans
-- n'importe quelle description.
create temp table marqueur (m text primary key, quoi text) on commit drop;
insert into marqueur (m, quoi) values
  ('br-v74o4herft',    'LA MAISON MND — identifiant'),
  ('LA MAISON MND',    'LA MAISON MND — nom'),
  ('br-xrnyd4nh7x',    'branche disparue de la migration'),
  ('cotonou-flagship', 'branche de test'),
  ('br-test-kkiapay',  'branche de test KkiaPay'),
  ('"maison"',         'Ma Maison — identifiant par défaut'),
  ('Ma Maison',        'Ma Maison — nom');

-- ─── LE COMPTE DE TOUTES LES TABLES ────────────────────────────────
create temp table etat (t text, n bigint) on commit drop;
do $$
declare r record; c bigint;
begin
  for r in
    select cl.relname from pg_class cl
    join pg_namespace ns on ns.oid = cl.relnamespace
    where ns.nspname = 'public' and cl.relkind = 'r'
    order by cl.relname
  loop
    execute format('select count(*) from public.%I', r.relname) into c;
    insert into etat values (r.relname, c);
  end loop;
end $$;

-- ─── LA CHASSE AUX TRACES ──────────────────────────────────────────
-- Toute table portant une colonne `data` est fouillée en TEXTE. C'est
-- lent et brutal — sur des tables vides, c'est instantané, et c'est
-- précisément le cas qu'on espère.
create temp table trace (t text, m text, quoi text, n bigint) on commit drop;
do $$
declare r record; mk record; c bigint;
begin
  for r in
    select cl.relname from pg_class cl
    join pg_namespace ns on ns.oid = cl.relnamespace
    where ns.nspname = 'public' and cl.relkind = 'r'
      and exists (select 1 from information_schema.columns co
                  where co.table_schema = 'public'
                    and co.table_name = cl.relname
                    and co.column_name = 'data')
    order by cl.relname
  loop
    for mk in select m, quoi from marqueur loop
      execute format('select count(*) from public.%I where data::text ilike %L',
                     r.relname, '%' || mk.m || '%') into c;
      if c > 0 then insert into trace values (r.relname, mk.m, mk.quoi, c); end if;
    end loop;
  end loop;
end $$;

-- ─── ET DANS LA COLONNE `branch_id`, qui vit à côté du `data` ──────
-- DEUX FAUX POSITIFS CORRIGÉS, tous deux vus au premier passage :
--
--  · `branches` est EXCLUE. Elle porte elle aussi une colonne `branch_id`
--    (toutes les tables de collection l'ont, voir 0001_init) et celle-ci
--    est nulle par nature : une branche ne pointe pas vers une branche.
--    L'audit dénonçait MND HOME, sa propre cible.
--
--  · un `branch_id` NUL n'est plus une anomalie. Les tables GLOBALES à la
--    Maison — catalogue, personas, catégories de dépense — n'ont pas de
--    branche, et c'est normal. La seule vraie anomalie est de pointer vers
--    une branche QUI N'EXISTE PAS.
create temp table trace_col (t text, valeur text, n bigint) on commit drop;
do $$
declare r record;
begin
  for r in
    select cl.relname from pg_class cl
    join pg_namespace ns on ns.oid = cl.relnamespace
    where ns.nspname = 'public' and cl.relkind = 'r'
      and cl.relname <> 'branches'
      and exists (select 1 from information_schema.columns co
                  where co.table_schema = 'public'
                    and co.table_name = cl.relname
                    and co.column_name = 'branch_id')
    order by cl.relname
  loop
    execute format($q$
      insert into trace_col
      select %L, branch_id, count(*)
      from public.%I
      where branch_id is not null
        and not exists (select 1 from public.branches b where b.id = branch_id)
      group by 2 $q$, r.relname, r.relname);
  end loop;
end $$;

-- ═══ RAPPORT ═══════════════════════════════════════════════════════
select rubrique, detail
from (
  -- ① LA question
  select 1 as bloc, row_number() over (order by e.t) as rang,
         'RENDEZ-VOUS' as rubrique,
         e.t || ' · ' || e.n || case when e.n = 0 then ' — AUCUN' else ' ← IL EN RESTE' end as detail
  from etat e where e.t like '%appointment%'

  -- ② Le verdict global
  union all
  select 2, 0::bigint,
         case when not exists (select 1 from trace)
               and not exists (select 1 from trace_col)
              then '✔ AUCUNE TRACE'
              else '⚠ DES TRACES SUBSISTENT' end,
         case when not exists (select 1 from trace) and not exists (select 1 from trace_col)
              then 'Aucun identifiant ni nom des anciennes maisons ne subsiste nulle part, et aucune ligne ne pointe vers une branche inexistante.'
              else 'Voir les blocs « TRACE » ci-dessous : le nom ou l''identifiant d''une ancienne maison vit encore dans une donnée.' end

  -- ③ Les traces dans les `data`
  union all
  select 3, row_number() over (order by tr.n desc, tr.t), '⚠ TRACE DANS UN DATA',
         tr.t || ' · ' || tr.n || ' ligne(s) contiennent « ' || tr.m || ' » — ' || tr.quoi
  from trace tr

  -- ④ Les lignes pointant vers une branche qui n'existe pas
  union all
  select 4, row_number() over (order by tc.n desc, tc.t), '⚠ BRANCHE INEXISTANTE (colonne)',
         tc.t || ' · branch_id = ' || tc.valeur || ' × ' || tc.n
  from trace_col tc

  -- ⑤ Ce qui reste peuplé, avec la raison quand elle est légitime.
  union all
  select 5, row_number() over (order by e.n desc, e.t), 'ENCORE PEUPLÉ',
         e.t || ' · ' || e.n || ' ligne(s)'
      || case
           when e.t in ('staff', 'staff_branches') then '  ← comptes d''ACCÈS, conservés'
           when e.t = 'branches' then '  ← la branche de la Maison'
           /* `documents` n'est PAS une table de données : une ligne = un
              RÉGLAGE (horaires, marque, Vitrine, taux de points, paliers).
              L'effacement les vide ; l'app les recrée à ses valeurs par
              défaut au rechargement — voir HOUSE_BLANK dans store.ts. */
           when e.t = 'documents' then '  ← RÉGLAGES, pas des données : horaires, marque, Vitrine… recréés par défaut'
           when e.t like '%rate_limit%' then '  ← compteurs de débit, transitoires'
           else '  ← ⚠ à regarder' end
  from etat e where e.n > 0

  -- ⑥ La branche debout
  union all
  select 6, 0::bigint, 'BRANCHE(S)',
         coalesce((select string_agg(coalesce(b.data->>'name', '(sans nom)') || ' [' || b.id || ']', ' · ' order by b.id)
                   from public.branches b), 'aucune')

  union all
  select 7, 0::bigint, 'TABLES À ZÉRO',
         count(*) || ' : ' || string_agg(e.t, ' · ' order by e.t)
  from etat e where e.n = 0
  having count(*) > 0
) t
order by bloc, rang;
