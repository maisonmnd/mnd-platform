-- ═══════════════════════════════════════════════════════════════════
-- AVANT D'IMPORTER DEPUIS L'ANCIEN ERP — lever le verrou, et connaître
-- les règles que la Maison attend.
-- (SQL Editor → Run)
--
-- ⚠ LE PIÈGE QUE CE SCRIPT DÉSAMORCE. `catalogue_efface_definitif.sql` a
-- posé un déclencheur qui REFUSE SILENCIEUSEMENT toute ré-insertion d'un
-- identifiant du catalogue effacé. C'est ce qui empêche un vieux
-- navigateur de le ressusciter — mais ça bloquerait aussi un import
-- volontaire qui réutilise les mêmes identifiants, SANS AUCUNE ERREUR :
-- l'import annoncerait « 94 lignes insérées », la base n'en garderait
-- aucune. Ce script lève le verrou.
--
-- Le lever est sans danger maintenant : l'app déployée considère le
-- serveur comme la vérité (elle ne pousse plus son cache sur une table
-- vide), donc plus rien ne peut repeupler la base toute seule.
-- ═══════════════════════════════════════════════════════════════════

-- On retire le déclencheur PARTOUT où il a été posé, sans liste écrite à
-- la main : `donnees_efface_definitif.sql` en pose un par table de
-- données, et cette liste grandit avec le schéma.
do $$
declare r record;
begin
  for r in
    select cl.relname from pg_class cl
    join pg_namespace ns on ns.oid = cl.relnamespace
    join pg_trigger tg on tg.tgrelid = cl.oid
    where ns.nspname = 'public' and tg.tgname = 'no_resurrect' and not tg.tgisinternal
  loop
    execute format('drop trigger if exists no_resurrect on public.%I', r.relname);
    raise notice 'verrou levé : %', r.relname;
  end loop;
end $$;

-- Les pierres tombales sont CONSERVÉES : sans déclencheur elles ne gênent
-- plus rien, et elles gardent la trace de ce qui a été effacé le
-- 30-07-2026. Pour les effacer aussi :
--   truncate public.data_tombstones;  truncate public.catalog_tombstones;

-- ═══ CE QUE TON IMPORT DOIT RESPECTER ══════════════════════════════
-- Chaque règle ci-dessous vient d'un dégât réel de juillet 2026.
select regle, detail
from (
  select 1 as n, 'LA BRANCHE' as regle,
         'Toute ligne de clients, appointments, invoices, expenses doit porter '
      || coalesce((select string_agg('branchId = ' || b.id || ' (' || coalesce(b.data->>'name','?') || ')', ' ou ') from public.branches b),
                  'AUCUNE BRANCHE — crées-en une d''abord')
      || '. Et DEUX endroits doivent le dire : `data->>''branchId''` ET la colonne `branch_id`. '
      || 'L''app lit le premier, la sécurité RLS lit la seconde. En juillet, 385 rendez-vous pointaient vers une branche supprimée : invisibles partout sauf dans Analytics.' as detail

  union all
  select 2, 'LES DATES',
         'Un JOUR NU — 2026-07-30 — jamais un horodatage. Une quarantaine d''écrans comparent la date au caractère près (a.date === iso) : Calendrier, Tableau de bord, recette du jour, Notifications. Un rendez-vous horodaté n''y existe pas.'

  union all
  select 3, 'LES CATÉGORIES AVANT LES PRESTATIONS',
         'Importe `catalog_categories` EN PREMIER. Une prestation dont la catégorie n''existe pas atterrit dans « À RECLASSER » au Catalogue. En juillet, 52 prestations y sont restées un mois.'

  union all
  select 4, 'UN SEUL IDENTIFIANT PAR PRESTATION',
         'Si l''ERP et la Maison ont chacun leur identifiant pour la même prestation, tu obtiens deux fiches : les rendez-vous se répartissent entre elles et coupent en deux l''historique ET le chiffre. C''est le dégât n°1 de juillet — 32 paires à fusionner à la main.'

  union all
  select 5, 'LES RENDEZ-VOUS',
         '`data->>''serviceIds''` doit être un TABLEAU JSON (["sv-a","sv-b"]), sans répétition : une prestation inscrite deux fois dans un rituel est comptée deux fois dans le chiffre. `status` parmi confirmé / honoré / annulé. `priceXof` numérique, jamais une chaîne.'

  union all
  select 6, 'APRÈS L''IMPORT',
         'Lance `import_2_apres.sql` : il vérifie ces six règles sur tes données réelles et te dit ce qui cloche, ligne par ligne, avant que tu ne t''en aperçoives dans un chiffre faux.'
) t
order by n;
