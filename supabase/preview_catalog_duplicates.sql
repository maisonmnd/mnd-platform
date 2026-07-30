-- ═══════════════════════════════════════════════════════════════════
-- APERÇU de la réparation du catalogue — NE MODIFIE RIEN
--
-- À lancer AVANT `fix_catalog_duplicates.sql`. Ce script ne contient
-- aucun `update`, aucun `delete`, aucun `insert` sur une table de
-- production : il ne fait que LIRE et remplir des tables temporaires,
-- puis afficher ce que la réparation FERAIT.
--
-- Supabase avertira « creates a table without enabling RLS » : ce sont
-- les `create temp table`, que son contrôle lit comme des créations de
-- tables ordinaires. Elles vivent dans la seule session, ne sont
-- joignables par aucune clé `anon`, et disparaissent à la fin.
-- → « Run without RLS ».
--
-- En revanche l'avertissement « destructive operations » NE DOIT PAS
-- apparaître ici : ce fichier n'écrit dans aucune table de production.
-- S'il apparaît, tu n'as pas collé le bon fichier — c'est le signal
-- d'arrêt le plus simple qui existe.
--
-- CE QU'IL FAUT REGARDER, DANS L'ORDRE :
--
--  ① ÉTAT ................ les compteurs, maintenant → après
--  ② ⚠ ARRÊT ............. s'il y a UNE seule ligne ici, ne lance pas
--                          la réparation : un identifiant Maison est
--                          introuvable, les rendez-vous partiraient vers
--                          une prestation qui n'existe pas.
--  ③ DÉJÀ FUSIONNÉ ....... paires dont la copie a déjà disparu (normal
--                          si la réparation a déjà tourné une fois)
--  ④ CONTRÔLE ............ la ligne rassurante : aucune référence morte
--  ⑤ CATÉGORIE À RENOMMER  « cat-X » → « X »
--  ⑥ PAIRE À FUSIONNER ... les 32 paires, avec le nombre de rendez-vous
--                          de chaque côté et les deux prix
--  ⑦ PRIX À TRANCHER ..... les paires dont les deux prix divergent
--  ⑧ ERP SANS ÉQUIVALENT . prestations `svc-…` qui ne sont PAS des
--                          doublons — l'ERP les a apportées seules, on
--                          les garde, la réparation n'y touche pas
--  ⑨ SANS CATÉGORIE APRÈS  ce qui restera orphelin — ne pas rattacher à
--                          la main sans lire `fix_missing_categories.sql`
--
-- ⚠ LA LISTE DES 32 PAIRES EST RECOPIÉE de `fix_catalog_duplicates.sql`.
--   Si tu en corriges une, corrige-la DANS LES DEUX FICHIERS.
-- ═══════════════════════════════════════════════════════════════════

-- ─── La table de correspondance, à l'identique du script de réparation
create temp table merge_map (dup text primary key, keep text not null) on commit drop;
insert into merge_map (dup, keep) values
  ('svc-ea30abf33e79', 'sv-rituel-mp1lproe'),
  ('svc-973745d278bf', 'sv-rituel-mpdgup11'),
  ('svc-0abbf4a27e33', 'sv-rituel-mpdj8t99'),
  ('svc-f58945b5b6b6', 'sv-rituel-mpdjbdm5'),
  ('svc-1da75f27bd85', 'sv-rituel-mpdji3sm'),
  ('svc-5f7f87acd432', 'sv-rituel-mpdjn3qx'),
  ('svc-b2b479c45e9f', 'sv-rituel-mpje726f'),
  ('svc-4c9010bea79b', 'sv-rituel-mpje7ji7'),
  ('svc-a8c39f2dabc2', 'sv-rituel-mpje8apm'),
  ('svc-cd851ab1d519', 'sv-rituel-mpskkhyn'),
  ('svc-c3cc3482da3a', 'sv-rituel-mq3ln93q'),
  ('svc-95ec38a471a6', 'sv-rituel-mpbpz23b'),
  ('svc-7a44ef230c5f', 'sv-rituel-mr6p76kx'),
  ('svc-b8ad274bfb7e', 'sv-rituel-mr3szmso'),
  ('svc-50ea8e39be1c', 'sv-rituel-mqkoqjub'),
  ('svc-5acab24afb63', 'sv-rituel-mqkoruz9'),
  ('svc-63772668b55e', 'sv-rituel-mpdikoo2'),
  ('svc-c88d8b8d7c46', 'sv-rituel-mq70mpw7'),
  ('svc-c3555f29716b', 'sv-yekpe-lumiere'),
  ('svc-2f41f1f90c0a', 'sv-dandan'),
  ('svc-ec45b063129b', 'sv-gbigbi-essentiel'),
  ('svc-ff7b5c80e1ec', 'sv-rituel-mpskliuh'),
  ('svc-cf634a87c3ad', 'sv-rituel-mq70pqmk'),
  ('svc-9170e7351b41', 'sv-rituel-mpl3brcs'),
  ('svc-f564b09d7731', 'sv-rituel-mpl2rty1'),
  ('svc-b5d33cc063eb', 'sv-alala'),
  ('svc-0bf3731a7095', 'sv-gbigbi-profond'),
  ('svc-5528eafbff27', 'sv-rituel-mpdjcyh0'),
  ('svc-8d1908479155', 'sv-rituel-mpf69yj3'),
  ('svc-67df51bf3142', 'sv-yekpe-sublimation'),
  ('svc-9c20227f4b41', 'sv-rituel-mq6vpu7d'),
  ('svc-65859c4a6bd7', 'sv-rituel-mpdj61e5');

-- ─── Qui porte quoi : une ligne par (rendez-vous, prestation) ───────
-- Le filtre `jsonb_typeof … = 'array'` est dans une sous-requête, PAS
-- dans le `where` du dessus : un rendez-vous dont `serviceIds` ne serait
-- pas un tableau ferait échouer la fonction avant que le filtre ne joue.
create temp table rdv_lignes on commit drop as
select z.id as rdv_id, t.v as service_id
from (select a.id, a.data->'serviceIds' as ids
      from public.appointments a
      where jsonb_typeof(a.data->'serviceIds') = 'array') z
cross join lateral jsonb_array_elements_text(z.ids) t(v);

create temp table rdv_counts on commit drop as
select service_id, count(distinct rdv_id) as rdv from rdv_lignes group by 1;

-- ─── La catégorie de chaque prestation, telle qu'elle SERA ──────────
create temp table projection on commit drop as
select s.id,
       coalesce(s.data->>'name', '(sans nom)') as nom,
       s.data->>'categoryId'                  as cat_actuelle,
       case when s.data->>'categoryId' like 'cat-%'
                 and exists (select 1 from public.catalog_categories c
                             where c.id = substring(s.data->>'categoryId' from 5))
            then substring(s.data->>'categoryId' from 5)
            else s.data->>'categoryId' end    as cat_projetee
from public.catalog_services s;

-- ─── Les compteurs, avant / après ──────────────────────────────────
create temp table chiffres on commit drop as
select
  (select count(*) from public.catalog_services)                       as prestations,
  (select count(*) from public.catalog_services where id like 'svc-%') as copies_svc,
  (select count(*) from merge_map m
     join public.catalog_services s on s.id = m.dup)                   as dups_presents,
  (select count(*) from public.catalog_services s
     where not exists (select 1 from public.catalog_categories c
                       where c.id = s.data->>'categoryId'))            as cat_morte,
  (select count(*) from projection p
     where not exists (select 1 from public.catalog_categories c
                       where c.id = p.cat_projetee)
       and not exists (select 1 from merge_map m where m.dup = p.id))  as cat_morte_apres,
  (select count(*) from projection p
     where p.cat_projetee <> p.cat_actuelle)                           as cat_a_renommer,
  (select count(distinct l.rdv_id) from rdv_lignes l
     join merge_map m on m.dup = l.service_id)                         as rdv_a_reecrire;

-- ═══ CE QUE LA RÉPARATION FERAIT ═══════════════════════════════════
-- Un seul tableau : l'éditeur SQL n'affiche que le résultat de la
-- dernière requête.
select rubrique, detail
from (
  -- ① ─────────────────────────────────────────────────────────────
  select 1 as bloc, 0::bigint as rang, 'ÉTAT — MAINTENANT → APRÈS' as rubrique,
         'prestations ' || c.prestations || ' → ' || (c.prestations - c.dups_presents)
      || ' · copies svc- ' || c.copies_svc || ' → ' || (c.copies_svc - c.dups_presents)
      || ' · catégorie morte ' || c.cat_morte || ' → ' || c.cat_morte_apres
      || ' · catégories renommées ' || c.cat_a_renommer
      || ' · rendez-vous réécrits ' || c.rdv_a_reecrire as detail
  from chiffres c

  -- ② ── Le seul motif de ne PAS lancer la réparation ──────────────
  union all
  select 2, row_number() over (order by m.keep), '⚠ ARRÊT — ID MAISON INTROUVABLE',
         'la paire ' || m.dup || ' → ' || m.keep
      || ' enverrait les rendez-vous vers une prestation qui n''existe pas'
  from merge_map m
  where not exists (select 1 from public.catalog_services s where s.id = m.keep)

  -- ③ ── Normal si la réparation a déjà tourné ─────────────────────
  union all
  select 3, 0::bigint, 'DÉJÀ FUSIONNÉ',
         count(*) || ' paire(s) sur 32 : la copie a déjà disparu et la '
      || 'prestation Maison est là. Rien à refaire pour celles-là.'
  from merge_map m
  where not exists (select 1 from public.catalog_services s where s.id = m.dup)
    and exists     (select 1 from public.catalog_services s where s.id = m.keep)
  having count(*) > 0

  -- ④ ── La ligne rassurante ───────────────────────────────────────
  union all
  select 4, 0::bigint, 'CONTRÔLE',
         'aucune référence morte : pour chaque paire, la prestation Maison existe bien.'
  where not exists (select 1 from merge_map m
                    where not exists (select 1 from public.catalog_services s
                                      where s.id = m.keep))

  -- ⑤ ─────────────────────────────────────────────────────────────
  union all
  select 5, row_number() over (order by p.cat_actuelle), 'CATÉGORIE À RENOMMER',
         p.cat_actuelle || ' → ' || p.cat_projetee || ' · ' || count(*) || ' prestation(s)'
  from projection p
  where p.cat_projetee <> p.cat_actuelle
  group by p.cat_actuelle, p.cat_projetee

  -- ⑥ ── Les 32 paires. `coalesce(…, 'aucun')` partout : concaténer un
  --      null en SQL rend null, et la ligne disparaîtrait en silence.
  union all
  select 6, row_number() over (order by k.data->>'name'), 'PAIRE À FUSIONNER',
         coalesce(k.data->>'name', '(nom inconnu)')
      || ' · rdv ' || coalesce(rk.rdv, 0) || ' (Maison) + ' || coalesce(rd.rdv, 0)
      || ' (copie) → ' || (coalesce(rk.rdv, 0) + coalesce(rd.rdv, 0))
      || ' · prix ' || coalesce(nullif(k.data->>'priceXof', ''), 'aucun')
      || ' / '      || coalesce(nullif(d.data->>'priceXof', ''), 'aucun')
      || case when coalesce(d.data->>'name', '') <> coalesce(k.data->>'name', '')
              then ' · ⚠ copie nommée « ' || coalesce(d.data->>'name', '(sans nom)') || ' »'
              else '' end
  from merge_map m
  join public.catalog_services k on k.id = m.keep
  join public.catalog_services d on d.id = m.dup
  left join rdv_counts rk on rk.service_id = m.keep
  left join rdv_counts rd on rd.service_id = m.dup

  -- ⑦ ─────────────────────────────────────────────────────────────
  union all
  select 7, row_number() over (order by k.data->>'name'), 'PRIX À TRANCHER',
         coalesce(k.data->>'name', '(nom inconnu)')
      || ' — Maison ' || coalesce(nullif(k.data->>'priceXof', ''), 'aucun')
      || ' F · copie ' || coalesce(nullif(d.data->>'priceXof', ''), 'aucun')
      || ' F  (' || m.keep || ')'
  from merge_map m
  join public.catalog_services k on k.id = m.keep
  join public.catalog_services d on d.id = m.dup
  where coalesce(nullif(k.data->>'priceXof', '')::numeric, -1)
     <> coalesce(nullif(d.data->>'priceXof', '')::numeric, -1)

  -- ⑧ ── Pas des doublons : l'ERP les a apportées seules ───────────
  union all
  select 8, row_number() over (order by s.data->>'name'), 'ERP SANS ÉQUIVALENT — À GARDER',
         coalesce(s.data->>'name', '(sans nom)') || '  (' || s.id || ')'
  from public.catalog_services s
  where s.id like 'svc-%'
    and not exists (select 1 from merge_map m where m.dup = s.id)

  -- ⑨ ─────────────────────────────────────────────────────────────
  union all
  select 9, row_number() over (order by p.cat_projetee), 'SANS CATÉGORIE APRÈS — voir fix_missing_categories.sql',
         coalesce(p.cat_projetee, '(vide)') || ' — ' || count(*) || ' : '
                                            || string_agg(p.nom, ' · ')
  from projection p
  where not exists (select 1 from public.catalog_categories c where c.id = p.cat_projetee)
    and not exists (select 1 from merge_map m where m.dup = p.id)
  group by p.cat_projetee
) t
order by bloc, rang;
