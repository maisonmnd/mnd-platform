-- ═══════════════════════════════════════════════════════════════════
-- DATES DE LA MIGRATION — remettre un JOUR là où l'ERP a mis un horodatage
-- (SQL Editor → Run · « Run without RLS »). Idempotent.
--
-- LE CONTRAT DE LA MAISON : le champ `date` d'un rendez-vous, d'une facture
-- ou d'une dépense contient un JOUR NU — `2026-07-30`. Rien d'autre.
--
-- RÉSULTAT DE L'EXÉCUTION DU 30-07-2026 : la normalisation n'a RIEN eu à
-- faire. 792 rendez-vous, 340 factures, 12 dépenses — toutes les dates
-- étaient déjà des jours nus, zéro horodatage, zéro date illisible. Le
-- « Invalid Date » du Catalogue venait d'ailleurs : la date y était formatée
-- DEUX FOIS (corrigé dans routes/vente/Catalogue.tsx). Ce fichier reste
-- utile pour ses deux blocs d'audit, ③ et ④, et comme garde-fou si un
-- prochain import réintroduit des horodatages.
--
-- POURQUOI LE FORMAT COMPTE, si jamais ça se reproduit : une quarantaine
-- d'écrans comparent la date au caractère près (`a.date === iso`) —
-- Calendrier, Tableau de bord, recette du jour, Notifications,
-- disponibilité des maîtres. Pour tous ceux-là, un rendez-vous horodaté
-- N'EXISTE PAS : il ne s'affiche nulle part, ne compte dans aucun total du
-- jour, ne déclenche aucun rappel. Remettre la donnée d'aplomb vaut
-- toujours mieux que rustiner les 40 comparaisons.
--
-- CE QUI EST MODIFIÉ : `date` tronquée à son jour, sur `appointments`,
-- `invoices` et `expenses`. Et SEULEMENT si les 10 premiers caractères
-- forment un jour ISO valide — sinon on ne devine pas, on le signale.
--
-- L'HEURE N'EST PAS PERDUE : si `time` est vide et que l'horodatage porte
-- une heure, elle est recopiée dans `time`, telle qu'écrite par l'ERP (pas
-- de conversion de fuseau — convertir serait deviner).
--
-- CE QUI N'EST PAS MODIFIÉ : les doublons de rendez-vous. Le rapport les
-- liste, il n'en supprime aucun — voir le bloc ③.
-- ═══════════════════════════════════════════════════════════════════

-- ─── ÉTAT AVANT ────────────────────────────────────────────────────
create temp table avant on commit drop as
select 'appointments' as t,
       count(*) filter (where length(data->>'date') = 10)  as jours,
       count(*) filter (where length(data->>'date') > 10)  as horodatages,
       count(*) filter (where data->>'date' is null)       as sans_date
from public.appointments
union all select 'invoices',
       count(*) filter (where length(data->>'date') = 10),
       count(*) filter (where length(data->>'date') > 10),
       count(*) filter (where data->>'date' is null)
from public.invoices
union all select 'expenses',
       count(*) filter (where length(data->>'date') = 10),
       count(*) filter (where length(data->>'date') > 10),
       count(*) filter (where data->>'date' is null)
from public.expenses;

-- ─── ① L'HEURE D'ABORD (avant de tronquer, sinon elle part) ─────────
-- Uniquement les rendez-vous : seuls eux portent `time`.
update public.appointments a
set data = jsonb_set(a.data, '{time}', to_jsonb(substring(a.data->>'date' from 12 for 5)))
where length(a.data->>'date') > 10
  and left(a.data->>'date', 10) ~ '^\d{4}-\d{2}-\d{2}$'
  and substring(a.data->>'date' from 12 for 5) ~ '^\d{2}:\d{2}$'
  and coalesce(a.data->>'time', '') = '';

-- ─── ② PUIS LE JOUR ────────────────────────────────────────────────
update public.appointments
set data = jsonb_set(data, '{date}', to_jsonb(left(data->>'date', 10)))
where length(data->>'date') > 10
  and left(data->>'date', 10) ~ '^\d{4}-\d{2}-\d{2}$';

update public.invoices
set data = jsonb_set(data, '{date}', to_jsonb(left(data->>'date', 10)))
where length(data->>'date') > 10
  and left(data->>'date', 10) ~ '^\d{4}-\d{2}-\d{2}$';

update public.expenses
set data = jsonb_set(data, '{date}', to_jsonb(left(data->>'date', 10)))
where length(data->>'date') > 10
  and left(data->>'date', 10) ~ '^\d{4}-\d{2}-\d{2}$';

-- ─── Les rendez-vous, à plat : une clé par (cliente, jour, heure, prestations)
create temp table rdv_cles on commit drop as
select a.id,
       coalesce(a.data->>'clientId', a.data->>'clientName', '?') as qui,
       a.data->>'date'   as jour,
       coalesce(a.data->>'time', '')   as heure,
       coalesce(a.data->>'status', '') as statut,
       coalesce((select string_agg(v, ',' order by v)
                 from jsonb_array_elements_text(a.data->'serviceIds') t(v)), '') as presta
from public.appointments a
where jsonb_typeof(a.data->'serviceIds') = 'array';

-- ═══ RAPPORT ═══════════════════════════════════════════════════════
select rubrique, detail
from (
  -- ① Les compteurs, avant → après
  select 1 as bloc, row_number() over (order by v.t) as rang,
         'DATES — AVANT → APRÈS' as rubrique,
         v.t || ' : jours ' || v.jours || ' → ' || n.jours
             || ' · horodatages ' || v.horodatages || ' → ' || n.horodatages
             || ' · sans date ' || v.sans_date as detail
  from avant v
  join (select 'appointments' as t,
               count(*) filter (where length(data->>'date') = 10) as jours,
               count(*) filter (where length(data->>'date') > 10) as horodatages
        from public.appointments
        union all select 'invoices',
               count(*) filter (where length(data->>'date') = 10),
               count(*) filter (where length(data->>'date') > 10)
        from public.invoices
        union all select 'expenses',
               count(*) filter (where length(data->>'date') = 10),
               count(*) filter (where length(data->>'date') > 10)
        from public.expenses) n on n.t = v.t

  -- ② Ce qu'on a REFUSÉ de deviner : une date qui ne commence pas par un
  --    jour ISO. S'il y a des lignes ici, il faut les regarder à la main.
  union all
  select 2, row_number() over (order by x.t, x.valeur), '⚠ DATE ILLISIBLE — à voir à la main',
         x.t || ' · ' || x.valeur || ' × ' || x.n
  from (
    select 'appointments' as t, data->>'date' as valeur, count(*) as n from public.appointments
     where data->>'date' is not null and left(data->>'date',10) !~ '^\d{4}-\d{2}-\d{2}$' group by 1,2
    union all
    select 'invoices', data->>'date', count(*) from public.invoices
     where data->>'date' is not null and left(data->>'date',10) !~ '^\d{4}-\d{2}-\d{2}$' group by 1,2
    union all
    select 'expenses', data->>'date', count(*) from public.expenses
     where data->>'date' is not null and left(data->>'date',10) !~ '^\d{4}-\d{2}-\d{2}$' group by 1,2
  ) x

  -- ③ RENDEZ-VOUS EN DOUBLE — même cliente, même jour, même heure, mêmes
  --    prestations. RIEN N'EST SUPPRIMÉ : c'est une liste à trancher. Deux
  --    lignes identiques peuvent être un vrai doublon d'import… ou deux
  --    passages réels le même jour. Seule la Maison sait.
  union all
  select 3, row_number() over (order by k.jour desc, k.qui), 'RENDEZ-VOUS EN DOUBLE',
         k.jour || ' ' || k.heure || ' · ' || k.qui || ' · ' || count(*) || ' fois'
      || ' · statuts ' || string_agg(distinct k.statut, '/')
      || ' · ids ' || string_agg(k.id, ' ')
  from rdv_cles k
  group by k.qui, k.jour, k.heure, k.presta
  having count(*) > 1

  -- ④ Une même prestation inscrite DEUX FOIS dans un seul rituel. C'est ce
  --    qui faisait apparaître la prestation en double au Catalogue. Le code
  --    ne compte plus qu'une fois (Catalogue.tsx), mais la donnée reste
  --    bancale : à nettoyer au rendez-vous.
  union all
  select 4, row_number() over (order by a.id), 'PRESTATION EN DOUBLE DANS UN RITUEL',
         coalesce(a.data->>'date','?') || ' · ' || coalesce(a.data->>'clientName', a.data->>'clientId', '?')
      || ' · ' || a.id
  from public.appointments a
  where jsonb_typeof(a.data->'serviceIds') = 'array'
    and (select count(*) from jsonb_array_elements_text(a.data->'serviceIds')) >
        (select count(distinct v) from jsonb_array_elements_text(a.data->'serviceIds') t(v))

  -- ⑤ La ligne rassurante
  union all
  select 5, 0::bigint, 'CONTRÔLE',
         'toutes les dates lisibles sont désormais des jours nus — les écrans qui comparent au jour près revoient ces lignes.'
  where not exists (
    select 1 from public.appointments where length(data->>'date') > 10
    union all select 1 from public.invoices where length(data->>'date') > 10
    union all select 1 from public.expenses where length(data->>'date') > 10)
) t
order by bloc, rang;
