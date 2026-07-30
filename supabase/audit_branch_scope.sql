-- ═══════════════════════════════════════════════════════════════════
-- PÉRIMÈTRE DE BRANCHE — pourquoi « Toutes les branches » ne donne pas la
-- même chose que « LA MAISON MND ». LECTURE SEULE.
-- (SQL Editor → Run)
--
-- CE QUE FAIT L'APP. Sur Analytics, le sélecteur de périmètre ne filtre
-- RIEN quand il est sur « toutes » :
--     scope === 'toutes' ? true : i.branchId === scope
-- Alors que « LA MAISON MND » ne garde que les lignes dont `branchId` vaut
-- exactement l'identifiant de cette branche.
--
-- CONSÉQUENCE. Avec une seule branche, les deux onglets devraient donner
-- le MÊME chiffre. S'ils diffèrent, c'est qu'il existe des lignes
-- rattachées à AUCUNE branche, ou à une branche qui n'existe plus —
-- typiquement ce que la migration de l'ancien ERP a déposé. Ces lignes
-- n'apparaissent que sous « toutes ».
--
-- DEUX ENDROITS PORTENT LA BRANCHE, et ils doivent s'accorder :
--   · `data->>'branchId'` — ce que lit l'APPLICATION ;
--   · la colonne `branch_id` — ce que lit la SÉCURITÉ (RLS) et ce que le
--     sync recopie (`rowOf` dans shared/sync.ts).
-- S'ils divergent, une ligne peut être comptée à l'écran mais invisible à
-- une autre porte, ou l'inverse. Le bloc ④ le vérifie.
--
-- RIEN N'EST MODIFIÉ ICI. Une fois qu'on saura ce qui traîne, le
-- rattachement se décidera ligne par ligne.
-- ═══════════════════════════════════════════════════════════════════

-- ─── Les branches qui existent vraiment ────────────────────────────
create temp table vraies on commit drop as
select b.id, coalesce(b.data->>'name', '(sans nom)') as nom from public.branches b;

-- ─── La branche portée par chaque ligne, table par table ───────────
create temp table porte on commit drop as
select 'appointments' as t, a.id, a.data->>'branchId' as b_data, a.branch_id as b_col from public.appointments a
union all select 'invoices',  i.id, i.data->>'branchId', i.branch_id from public.invoices i
union all select 'clients',   c.id, c.data->>'branchId', c.branch_id from public.clients c
union all select 'expenses',  e.id, e.data->>'branchId', e.branch_id from public.expenses e;

-- ─── Ce que pèsent les rendez-vous, en brut catalogue ──────────────
-- Ordre de grandeur seulement : ni remise, ni barème modèle.
create temp table poids on commit drop as
select z.id, coalesce(sum(nullif(s.data->>'priceXof', '')::numeric), 0) as brut
from (select a.id, a.data->'serviceIds' as ids
      from public.appointments a
      where jsonb_typeof(a.data->'serviceIds') = 'array') z
cross join lateral jsonb_array_elements_text(z.ids) t(v)
left join public.catalog_services s on s.id = t.v
group by z.id;

-- ═══ RAPPORT ═══════════════════════════════════════════════════════
select rubrique, detail
from (
  -- ① Les branches de la Maison
  select 1 as bloc, row_number() over (order by v.id) as rang,
         'BRANCHE RÉELLE' as rubrique,
         v.id || ' — ' || v.nom as detail
  from vraies v

  -- ② Qui porte quoi. « ORPHELINE » = branchId qui ne correspond à aucune
  --    branche existante ; c'est l'écart entre les deux onglets.
  union all
  select 2, row_number() over (order by p.t, coalesce(p.b_data, '')),
         case when p.b_data is null then '⚠ SANS BRANCHE'
              when not exists (select 1 from vraies v where v.id = p.b_data) then '⚠ BRANCHE ORPHELINE'
              else 'rattachée' end,
         p.t || ' · ' || coalesce(p.b_data, '(absent)') || ' × ' || count(*)
  from porte p
  group by p.t, p.b_data

  -- ③ Ce que les lignes hors branche pèsent dans Analytics
  union all
  select 3, 0::bigint, 'POIDS DES RENDEZ-VOUS HORS BRANCHE',
         count(*) || ' rendez-vous · ~' || coalesce(round(sum(w.brut)), 0)
      || ' F de brut catalogue — visibles sous « Toutes les branches », absents de « LA MAISON MND »'
  from public.appointments a
  join poids w on w.id = a.id
  where a.data->>'branchId' is null
     or not exists (select 1 from vraies v where v.id = a.data->>'branchId')
  having count(*) > 0

  -- ④ `data->>'branchId'` contre la colonne `branch_id` : ils doivent
  --    dire la même chose. Sinon l'app et la sécurité ne voient pas la
  --    même table.
  union all
  select 4, row_number() over (order by p.t), '⚠ DÉSACCORD data / colonne',
         p.t || ' · ' || count(*) || ' ligne(s) — data dit '
      || coalesce(min(p.b_data), '(absent)') || ', la colonne dit '
      || coalesce(min(p.b_col), '(absent)')
  from porte p
  where coalesce(p.b_data, '~') <> coalesce(p.b_col, '~')
  group by p.t

  -- ⑤ Les lignes rassurantes
  union all
  select 5, 0::bigint, 'CONTRÔLE — périmètre',
         'toute ligne est rattachée à une branche existante : les deux onglets d''Analytics doivent donner le même chiffre.'
  where not exists (
    select 1 from porte p
    where p.b_data is null
       or not exists (select 1 from vraies v where v.id = p.b_data))

  union all
  select 5, 1::bigint, 'CONTRÔLE — data / colonne',
         'data->>''branchId'' et la colonne branch_id concordent partout.'
  where not exists (
    select 1 from porte p where coalesce(p.b_data, '~') <> coalesce(p.b_col, '~'))
) t
order by bloc, rang;
