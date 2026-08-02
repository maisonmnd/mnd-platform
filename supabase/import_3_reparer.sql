-- ═══════════════════════════════════════════════════════════════════
-- APRÈS L'IMPORT — les réparations qui ne demandent PAS de deviner.
-- (SQL Editor → Run) · Idempotent, rejouable sans dommage.
--
-- Ne lance ceci que si `import_2_apres.sql` a signalé quelque chose.
--
-- CE QUI EST RÉPARÉ AUTOMATIQUEMENT — parce qu'il n'y a qu'une réponse
-- possible :
--   ① la colonne `branch_id` est réalignée sur `data->>'branchId'`. Le
--      `data` fait foi : c'est ce que l'app écrit. La colonne n'en est
--      que la copie, lue par la sécurité RLS.
--   ② les dates horodatées (2026-07-30T09:00:00Z) sont tronquées à leur
--      jour, l'heure étant d'abord recopiée dans `time` si celui-ci est
--      vide — pour ne pas la perdre.
--
-- CE QUI N'EST PAS RÉPARÉ, ET POURQUOI :
--   · une branche INTROUVABLE — seule la Maison sait à quelle branche
--     rattacher ces lignes. Deviner, c'est déplacer de l'argent.
--   · une catégorie manquante — il faut la créer, ou choisir laquelle.
--   · deux fiches pour une même prestation — fusionner suppose de savoir
--     laquelle garde l'historique. C'est la décision qui a coûté le plus
--     cher en juillet ; elle ne s'automatise pas.
--   · un prix non numérique — la valeur écrite est peut-être « 15 000 F »
--     ou « sur devis ». On ne l'interprète pas à ta place.
-- ═══════════════════════════════════════════════════════════════════

-- ─── ① LA COLONNE SUIT LE DATA ─────────────────────────────────────
update public.appointments set branch_id = data->>'branchId'
 where coalesce(data->>'branchId','~') <> coalesce(branch_id,'~');
update public.clients set branch_id = data->>'branchId'
 where coalesce(data->>'branchId','~') <> coalesce(branch_id,'~');
update public.invoices set branch_id = data->>'branchId'
 where coalesce(data->>'branchId','~') <> coalesce(branch_id,'~');
update public.expenses set branch_id = data->>'branchId'
 where coalesce(data->>'branchId','~') <> coalesce(branch_id,'~');

-- ─── ② L'HEURE D'ABORD, LE JOUR ENSUITE ────────────────────────────
-- L'ordre compte : tronquer avant de recopier l'heure la perdrait.
update public.appointments
set data = jsonb_set(data, '{time}', to_jsonb(substring(data->>'date' from 12 for 5)))
where length(data->>'date') > 10
  and left(data->>'date', 10) ~ '^\d{4}-\d{2}-\d{2}$'
  and substring(data->>'date' from 12 for 5) ~ '^\d{2}:\d{2}$'
  and coalesce(data->>'time', '') = '';

update public.appointments set data = jsonb_set(data, '{date}', to_jsonb(left(data->>'date',10)))
 where length(data->>'date') > 10 and left(data->>'date',10) ~ '^\d{4}-\d{2}-\d{2}$';
update public.invoices set data = jsonb_set(data, '{date}', to_jsonb(left(data->>'date',10)))
 where length(data->>'date') > 10 and left(data->>'date',10) ~ '^\d{4}-\d{2}-\d{2}$';
update public.expenses set data = jsonb_set(data, '{date}', to_jsonb(left(data->>'date',10)))
 where length(data->>'date') > 10 and left(data->>'date',10) ~ '^\d{4}-\d{2}-\d{2}$';

-- ═══ CE QU'IL RESTE À TRANCHER À LA MAIN ═══════════════════════════
select rubrique, detail from (
  select 1 as bloc, 0::bigint as rang, '✔ RÉPARÉ AUTOMATIQUEMENT' as rubrique,
         'La colonne `branch_id` suit désormais `data->>''branchId''` partout, et les dates horodatées sont devenues des jours (heure sauvegardée dans `time` quand il était vide).' as detail

  union all
  select 2, row_number() over (order by t, v), '⚠ À RATTACHER À LA MAIN — branche introuvable',
         t || ' · branchId « ' || v || ' » × ' || n
  from (
    select 'appointments' as t, coalesce(data->>'branchId','(absent)') as v, count(*) as n from public.appointments
     where data->>'branchId' is null or not exists (select 1 from public.branches b where b.id = data->>'branchId') group by 1,2
    union all select 'clients', coalesce(data->>'branchId','(absent)'), count(*) from public.clients
     where data->>'branchId' is null or not exists (select 1 from public.branches b where b.id = data->>'branchId') group by 1,2
    union all select 'invoices', coalesce(data->>'branchId','(absent)'), count(*) from public.invoices
     where data->>'branchId' is null or not exists (select 1 from public.branches b where b.id = data->>'branchId') group by 1,2
  ) x

  union all
  select 3, row_number() over (order by v), '⚠ CATÉGORIE À CRÉER OU À CHOISIR',
         '« ' || v || ' » × ' || n || ' : ' || left(noms, 140)
  from (
    select coalesce(s.data->>'categoryId','(absente)') as v, count(*) as n,
           string_agg(coalesce(s.data->>'name','?'), ' · ') as noms
    from public.catalog_services s
    where not exists (select 1 from public.catalog_categories c where c.id = s.data->>'categoryId')
    group by 1
  ) y

  union all
  select 4, row_number() over (order by nom), '⚠ DEUX FICHES POUR UNE MÊME PRESTATION',
         nom || ' → ' || ids
  from (
    select lower(btrim(data->>'name')) as nom, string_agg(id, ' ↔ ' order by id) as ids
    from public.catalog_services where coalesce(btrim(data->>'name'),'') <> ''
    group by 1 having count(*) > 1
  ) z

  union all
  select 5, 0::bigint, 'ENSUITE',
         'Relance `import_2_apres.sql` : il doit afficher ✔✔ IMPORT SAIN. Puis recharge Le Trône — le serveur fait foi, ton catalogue apparaîtra tel qu''il est en base.'
) t order by bloc, rang;

-- Le verrou anti-résurrection reste LEVÉ après un import (import_1_avant
-- l'a retiré). Pour le reposer sur le nouveau catalogue — et empêcher un
-- vieux cache de le polluer — relance `catalogue_efface_definitif.sql`
-- APRÈS avoir vidé ce que tu veux voir disparaître, jamais avant.
