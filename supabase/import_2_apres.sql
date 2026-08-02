-- ═══════════════════════════════════════════════════════════════════
-- APRÈS L'IMPORT — le contrôle complet. LECTURE SEULE, rejouable.
-- (SQL Editor → Run)
--
-- Vérifie une à une les six règles d'`import_1_avant.sql` sur tes données
-- réelles. Chaque contrôle vient d'un dégât qui a coûté une semaine en
-- juillet 2026 — et qu'aucun écran n'avait signalé, parce qu'un chiffre
-- faux ne lève jamais d'erreur.
--
-- Un bloc VERT (✔) = rien à faire. Un bloc ROUGE (⚠) donne les lignes.
-- Rien n'est modifié : `import_3_reparer.sql` corrige ce qui est
-- réparable sans deviner.
-- ═══════════════════════════════════════════════════════════════════

with
branches_ok as (select id from public.branches),

-- ① BRANCHE — data->>'branchId' pointe-t-il vers une branche existante ?
b_data as (
  select 'appointments' as t, coalesce(data->>'branchId','(absent)') as v, count(*) as n from public.appointments
   where data->>'branchId' is null or data->>'branchId' not in (select id from branches_ok) group by 1,2
  union all select 'clients', coalesce(data->>'branchId','(absent)'), count(*) from public.clients
   where data->>'branchId' is null or data->>'branchId' not in (select id from branches_ok) group by 1,2
  union all select 'invoices', coalesce(data->>'branchId','(absent)'), count(*) from public.invoices
   where data->>'branchId' is null or data->>'branchId' not in (select id from branches_ok) group by 1,2
  union all select 'expenses', coalesce(data->>'branchId','(absent)'), count(*) from public.expenses
   where data->>'branchId' is null or data->>'branchId' not in (select id from branches_ok) group by 1,2
),

-- ① bis — le `data` et la COLONNE disent-ils la même chose ?
b_col as (
  select 'appointments' as t, count(*) as n from public.appointments
   where coalesce(data->>'branchId','~') <> coalesce(branch_id,'~')
  union all select 'clients', count(*) from public.clients
   where coalesce(data->>'branchId','~') <> coalesce(branch_id,'~')
  union all select 'invoices', count(*) from public.invoices
   where coalesce(data->>'branchId','~') <> coalesce(branch_id,'~')
  union all select 'expenses', count(*) from public.expenses
   where coalesce(data->>'branchId','~') <> coalesce(branch_id,'~')
),

-- ② DATES — un jour ISO nu, rien d'autre
dates_ko as (
  select 'appointments' as t, coalesce(data->>'date','(absente)') as v, count(*) as n from public.appointments
   where data->>'date' is null or data->>'date' !~ '^\d{4}-\d{2}-\d{2}$' group by 1,2
  union all select 'invoices', coalesce(data->>'date','(absente)'), count(*) from public.invoices
   where data->>'date' is null or data->>'date' !~ '^\d{4}-\d{2}-\d{2}$' group by 1,2
  union all select 'expenses', coalesce(data->>'date','(absente)'), count(*) from public.expenses
   where data->>'date' is null or data->>'date' !~ '^\d{4}-\d{2}-\d{2}$' group by 1,2
),

-- ③ CATÉGORIES — toute prestation pointe-t-elle vers une catégorie réelle ?
cat_ko as (
  select coalesce(s.data->>'categoryId','(absente)') as v, count(*) as n,
         string_agg(coalesce(s.data->>'name','?'), ' · ') as lesquelles
  from public.catalog_services s
  where not exists (select 1 from public.catalog_categories c where c.id = s.data->>'categoryId')
  group by 1
),

-- ④ DOUBLONS — même nom, deux identifiants
dup as (
  select lower(btrim(data->>'name')) as nom, count(*) as n,
         string_agg(id, ' ↔ ' order by id) as ids
  from public.catalog_services
  where coalesce(btrim(data->>'name'),'') <> ''
  group by 1 having count(*) > 1
),

-- ⑤ RENDEZ-VOUS — tableau bien formé, prestations connues, sans répétition
rdv_forme as (
  select count(*) as n from public.appointments
  where jsonb_typeof(data->'serviceIds') is distinct from 'array'
),
rdv_repet as (
  select count(*) as n from public.appointments a
  where jsonb_typeof(a.data->'serviceIds') = 'array'
    and (select count(*) from jsonb_array_elements_text(a.data->'serviceIds'))
      > (select count(distinct v) from jsonb_array_elements_text(a.data->'serviceIds') t(v))
),
rdv_inconnu as (
  select count(distinct t.v) as n, string_agg(distinct t.v, ' · ') as ids
  from public.appointments a
  cross join lateral jsonb_array_elements_text(a.data->'serviceIds') t(v)
  where jsonb_typeof(a.data->'serviceIds') = 'array'
    and not exists (select 1 from public.catalog_services s where s.id = t.v)
),

-- ⑥ PRIX — numérique
prix_ko as (
  select count(*) as n from public.catalog_services
  where data->>'priceXof' is not null
    and data->>'priceXof' !~ '^-?\d+(\.\d+)?$'
)

select rubrique, detail from (
  select 0 as bloc, 0::bigint as rang, 'VOLUME IMPORTÉ' as rubrique,
         'prestations ' || (select count(*) from public.catalog_services)
      || ' · catégories ' || (select count(*) from public.catalog_categories)
      || ' · clientes ' || (select count(*) from public.clients)
      || ' · rendez-vous ' || (select count(*) from public.appointments)
      || ' · factures ' || (select count(*) from public.invoices) as detail

  union all select 1, 0::bigint,
    case when not exists (select 1 from b_data) then '✔ ① BRANCHE — tout est rattaché'
         else '⚠ ① BRANCHE INTROUVABLE' end,
    coalesce((select string_agg(t || ' · ' || v || ' × ' || n, '   |   ') from b_data),
             'Chaque ligne pointe vers une branche qui existe.')

  union all select 1, 1::bigint,
    case when not exists (select 1 from b_col where n > 0) then '✔ ① bis — data et colonne concordent'
         else '⚠ ① bis — DÉSACCORD data / colonne branch_id' end,
    coalesce((select string_agg(t || ' × ' || n, '   |   ') from b_col where n > 0),
             'L''app et la sécurité voient la même chose.')

  union all select 2, 0::bigint,
    case when not exists (select 1 from dates_ko) then '✔ ② DATES — jours ISO partout'
         else '⚠ ② DATE ILLISIBLE OU HORODATÉE' end,
    coalesce((select string_agg(t || ' · « ' || v || ' » × ' || n, '   |   ') from dates_ko),
             'Toutes les dates sont des jours nus — les écrans du jour les verront.')

  union all select 3, 0::bigint,
    case when not exists (select 1 from cat_ko) then '✔ ③ CATÉGORIES — toutes rattachées'
         else '⚠ ③ PRESTATION SANS CATÉGORIE RÉELLE' end,
    coalesce((select string_agg('« ' || v || ' » × ' || n || ' : ' || left(lesquelles, 120), '   |   ') from cat_ko),
             'Aucune prestation n''ira dans « À RECLASSER ».')

  union all select 4, 0::bigint,
    case when not exists (select 1 from dup) then '✔ ④ AUCUN DOUBLON DE NOM'
         else '⚠ ④ DEUX FICHES POUR LA MÊME PRESTATION' end,
    coalesce((select string_agg(nom || ' → ' || ids, '   |   ') from dup),
             'Chaque prestation n''existe qu''une fois : historique et chiffre resteront entiers.')

  union all select 5, 0::bigint,
    case when (select n from rdv_forme) = 0 and (select n from rdv_repet) = 0
              and coalesce((select n from rdv_inconnu),0) = 0
         then '✔ ⑤ RENDEZ-VOUS — bien formés'
         else '⚠ ⑤ RENDEZ-VOUS MAL FORMÉS' end,
    'serviceIds non-tableau : ' || (select n from rdv_forme)
      || ' · rituels avec une prestation répétée : ' || (select n from rdv_repet)
      || ' · prestations citées mais inexistantes : ' || coalesce((select n from rdv_inconnu),0)
      || coalesce((select ' → ' || left(ids,120) from rdv_inconnu where n > 0), '')

  union all select 6, 0::bigint,
    case when (select n from prix_ko) = 0 then '✔ ⑥ PRIX — numériques'
         else '⚠ ⑥ PRIX NON NUMÉRIQUE' end,
    (select n from prix_ko) || ' prestation(s) dont `priceXof` n''est pas un nombre.'

  union all select 9, 0::bigint,
    case when not exists (select 1 from b_data) and not exists (select 1 from b_col where n > 0)
              and not exists (select 1 from dates_ko) and not exists (select 1 from cat_ko)
              and not exists (select 1 from dup) and (select n from rdv_forme) = 0
              and (select n from rdv_repet) = 0 and coalesce((select n from rdv_inconnu),0) = 0
              and (select n from prix_ko) = 0
         then '✔✔ IMPORT SAIN — rien à reprendre'
         else '⚠ REPRENDS LES BLOCS MARQUÉS ⚠' end,
    'Les contrôles ci-dessus couvrent les six dégâts de juillet 2026. `import_3_reparer.sql` corrige ce qui se corrige sans deviner : la colonne branch_id, et les dates horodatées.'
) t order by bloc, rang;
