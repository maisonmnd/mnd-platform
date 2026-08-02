-- ═══════════════════════════════════════════════════════════════════
-- REMISE À BLANC DES MOUVEMENTS — le logiciel redevient neuf, mais la
-- Maison garde ce qu'elle est : ses clientes, son catalogue, ses maisons.
-- (SQL Editor → Run · « Run without RLS »)
--
-- À lancer si la reprise depuis l'ancien ERP ne te satisfait pas. Rejouable
-- autant de fois que nécessaire.
--
-- ─── CE QUI EST EFFACÉ — tout ce qui fait un chiffre ───────────────
--   rendez-vous · factures et devis · dépenses · budgets · paiements
--   Mobile Money · avoirs des clientes et des familles · mouvements du
--   coffre · pourboires · abonnements souscrits · historique des points ·
--   sessions d'activité.
--   Après : Tableau de bord, Analytics, Synthèse, Bilan et Caisse
--   affichent zéro. Le Carnet et le Calendrier sont vides.
--
-- ─── CE QUI SURVIT, ET C'EST LE BUT ───────────────────────────────
--   · `clients`, `families`, `personas` — LE CRM. Fiches, téléphones,
--     e-mails, anniversaires, calibres, comptes famille, Juste Prix.
--   · `catalog_categories`, `catalog_services`, `catalog_products` — LE
--     CATALOGUE v6 et LES MAISONS : chaque catégorie garde sa `maison`,
--     donc la séparation Atelier MND™ / Studio ACƆ™ tient.
--   · `plans` — les FORMULES d'abonnement (du catalogue, pas de l'argent).
--     Seules les souscriptions partent.
--   · `expense_categories`, `cashboxes` — la structure comptable. Les
--     caisses restent, mais leur fonds de caisse est remis à zéro : un
--     solde d'ouverture est de l'argent, pas un réglage.
--   · `branches`, `documents`, `staff` — la Maison, les réglages, les accès.
--
-- ─── DEUX POINTS QUI SE DISCUTENT, ET QUE JE SIGNALE ──────────────
--   ① Les POINTS DE FIDÉLITÉ des clientes sont remis à zéro. Ils ont été
--      gagnés sur des rituels qui n'existent plus : les garder ferait un
--      solde sans contrepartie. Pour les conserver, commente le bloc ⑤.
--   ② AUCUNE PIERRE TOMBALE n'est posée — contrairement à l'effacement
--      total. C'est délibéré : les tombales bloqueraient un futur ré-import
--      portant les mêmes identifiants, et le but ici est justement de
--      pouvoir recommencer. Le risque qu'un vieil onglet repousse son cache
--      est déjà couvert : depuis le 30-07-2026, l'app considère une table
--      serveur vide comme la vérité et s'aligne dessus (voir shared/sync.ts).
-- ═══════════════════════════════════════════════════════════════════

-- ─── ① LES TABLES DE MOUVEMENT ─────────────────────────────────────
-- Boucle défensive : une table absente du schéma est ignorée au lieu de
-- faire échouer tout le script. Le schéma bouge, ce fichier doit survivre.
do $$
declare
  cibles text[] := array[
    'appointments',        -- le carnet
    'invoices',            -- factures ET devis
    'expenses',            -- dépenses
    'budgets',             -- budgets par catégorie
    'payments',            -- transactions Mobile Money / carte
    'credit_movements',    -- avoirs clientes et familles
    'coffre_movements',    -- dépôts et virements du coffre
    'tips',               -- pourboires
    'subscribers',         -- abonnements SOUSCRITS (les formules restent)
    'client_sessions'      -- traces d'activité des clientes
  ];
  t text;
  n bigint;
begin
  foreach t in array cibles loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice 'table absente, ignorée : %', t;
      continue;
    end if;
    execute format('select count(*) from public.%I', t) into n;
    execute format('delete from public.%I', t);
    raise notice 'vidée : % (% ligne(s))', t, n;
  end loop;
end $$;

-- ─── ② LE FONDS DE CAISSE ──────────────────────────────────────────
-- La caisse est une structure ; son solde d'ouverture est de l'argent.
-- On garde la première, on remet le second à zéro.
update public.cashboxes
set data = jsonb_set(data, '{openingXof}', '0'::jsonb)
where data ? 'openingXof' and (data->>'openingXof') <> '0';

-- ─── ③ LES RÈGLEMENTS DE L'ACADÉMIE ────────────────────────────────
-- Les apprenants sont des personnes : on les garde. Leurs règlements sont
-- du chiffre d'affaires : ils partent. (Le Tableau de bord les compte.)
-- Enveloppé : Postgres résout le nom de table à l'analyse, donc un simple
-- `where to_regclass(...) is not null` ne protège de rien — la requête échoue
-- avant d'évaluer sa condition si la table n'existe pas.
do $$
begin
  if to_regclass('public.apprenants') is not null then
    execute $q$ update public.apprenants set data = data - 'payments' where data ? 'payments' $q$;
  end if;
end $$;

-- ─── ④ LES DOCUMENTS QUI PORTENT DU MOUVEMENT ──────────────────────
-- `documents` est la table des RÉGLAGES et survit — sauf ces deux clés,
-- qui n'y sont pas des réglages mais de l'historique.
delete from public.documents where key in (
  'mnd_points_history',   -- historique des points de fidélité
  'mnd_reminders_sent'    -- rappels déjà envoyés (rattachés à des RDV disparus)
);

-- ─── ⑤ LES POINTS DE FIDÉLITÉ DES FICHES ───────────────────────────
-- Commente ce bloc pour conserver les soldes de points.
update public.clients
set data = jsonb_set(data, '{loyaltyPoints}', '0'::jsonb)
where data ? 'loyaltyPoints' and (data->>'loyaltyPoints') <> '0';

-- ═══ CE QU'IL RESTE — le contrôle ══════════════════════════════════
select rubrique, detail from (
  select 1 as n, 'CE QUI SURVIT' as rubrique,
         'clientes ' || (select count(*) from public.clients)
      || ' · familles ' || (select count(*) from public.families)
      || ' · personas ' || (select count(*) from public.personas)
      || ' · catégories ' || (select count(*) from public.catalog_categories)
      || ' · prestations ' || (select count(*) from public.catalog_services)
      || ' · produits ' || (select count(*) from public.catalog_products)
      || ' · branches ' || (select count(*) from public.branches) as detail

  union all
  select 2, 'LES MAISONS',
         coalesce((select string_agg(m || ' × ' || c, '   |   ')
                   from (select coalesce(data->>'maison', 'plateau') as m, count(*) as c
                         from public.catalog_categories group by 1) x), 'aucune catégorie')

  union all
  select 3, 'CE QUI EST À ZÉRO',
         'rendez-vous ' || (select count(*) from public.appointments)
      || ' · factures ' || (select count(*) from public.invoices)
      || ' · dépenses ' || (select count(*) from public.expenses)
      || ' · paiements ' || (select count(*) from public.payments)
      || ' · avoirs ' || (select count(*) from public.credit_movements)
      || ' · coffre ' || (select count(*) from public.coffre_movements)

  union all
  select 9, 'VERDICT',
         case when (select count(*) from public.appointments) = 0
                   and (select count(*) from public.invoices) = 0
                   and (select count(*) from public.expenses) = 0
                   and (select count(*) from public.clients) > 0
                   and (select count(*) from public.catalog_services) > 0
              then '✔ Logiciel neuf — le CRM et le catalogue sont intacts, tout chiffre est à zéro.'
              else '⚠ Reprends les rubriques ci-dessus.' end
) t order by n;
