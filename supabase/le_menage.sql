-- ═══════════════════════════════════════════════════════════════════
-- LE MÉNAGE — 29 août 2026.
--
-- ⚠ CE FICHIER EST EN DEUX PARTIES. La première LIT, la seconde EFFACE.
--   Passez la première, regardez, et ne passez la seconde que si ce qu'elle
--   dit vous va. On ne supprime rien à l'aveugle dans une base de production.
--
-- CE MÉNAGE NE TOUCHE PAS AU QUOTA. Le quota dépassé est celui du TRAFIC
-- SORTANT ; ce qui suit rend de l'ESPACE DISQUE, et l'espace disque n'est pas
-- en dépassement (71 Mo sur 500 accordés). Le seul geste qui corrige le trafic
-- est le bouton « Le poids des photos », dans Le Trône → Paramètres.
--
-- On fait donc ceci pour la propreté, pas pour l'urgence.
-- ═══════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  PARTIE ① — REGARDER. Lecture seule, rien n'est modifié.      ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- Ce que contiennent les tables de repli, et ce qu'elles pèsent.
-- Elles sont nées de réparations passées (migrations 0023, 0054, 0057) et
-- personne ne les a retirées. Si une seule porte encore quelque chose que
-- vous voulez garder, NE PASSEZ PAS la partie ②.
select
  c.relname                                     as la_table,
  pg_size_pretty(pg_total_relation_size(c.oid)) as poids,
  c.relrowsecurity                              as rls_posee,
  (xpath('/row/n/text()', query_to_xml(
    format('select count(*) as n from public.%I', c.relname), false, true, '')
  ))[1]::text::bigint                           as lignes
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and (c.relname like 'repli\_%' or c.relname like 'backup\_%' or c.relname like 'copie\_%')
order by pg_total_relation_size(c.oid) desc;


-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  PARTIE ② — EFFACER. À ne passer qu'après avoir lu la ①.      ║
-- ║  Ces tables ne sont lues par AUCUN écran : rien ne les         ║
-- ║  synchronise, rien ne les affiche. Elles ne servent qu'à       ║
-- ║  revenir en arrière sur des migrations depuis longtemps        ║
-- ║  passées et vérifiées.                                        ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- Décommentez les lignes ci-dessous (retirez les deux tirets) pour effacer.
-- Faites-le seulement si la partie ① ne vous a rien montré que vous vouliez
-- garder. Une sauvegarde de la Maison la veille au soir ne coûte rien.

-- drop table if exists public.repli_0023_services;
-- drop table if exists public.repli_0054_invoices;
-- drop table if exists public.repli_0054c_invoices;
-- drop table if exists public.repli_0054d_invoices;
-- drop table if exists public.repli_0054_appointments;
-- drop table if exists public.repli_0057_invoices;
-- drop table if exists public.repli_0057_appointments;
-- drop table if exists public.repli_reprise_foyer;


-- ╔═══════════════════════════════════════════════════════════════╗
-- ║  PARTIE ③ — RÉCUPÉRER LA PLACE DES LIGNES MORTES.             ║
-- ║  Sans danger : `vacuum` ne supprime aucune donnée vivante.     ║
-- ╚═══════════════════════════════════════════════════════════════╝

-- Chaque écriture crée une nouvelle version de ligne et laisse l'ancienne
-- derrière elle. `clients` occupe 6,4 Mo de disque pour 2,9 Mo de données
-- réelles, et `sauvegardes_nuit` 37 Mo parce qu'elle se réécrit chaque nuit.
--
-- ⚠ `vacuum` ne peut pas tourner dans un bloc de transaction : passez CHAQUE
--   ligne SÉPARÉMENT (sélectionnez-la seule, puis Run), sinon Supabase refuse.

-- vacuum (analyze) public.sauvegardes_nuit;
-- vacuum (analyze) public.clients;
-- vacuum (analyze) public.invoices;
-- vacuum (analyze) public.appointments;
-- vacuum (analyze) public.journal_gestes;

-- `vacuum full` rendrait la place AU SYSTÈME et non seulement à la table,
-- mais il VERROUILLE la table pendant qu'il travaille : personne ne peut ni
-- lire ni écrire. Sur `sauvegardes_nuit`, que rien ne lit, c'est sans risque.
-- Sur `clients`, faites-le salon fermé.

-- vacuum full public.sauvegardes_nuit;


-- ═══════════════════════════════════════════════════════════════════
-- APRÈS LE MÉNAGE, repassez la mesure du poids pour voir ce qui a été rendu.
-- Attendu : environ 40 Mo sur les 71, sans qu'une seule donnée vivante
-- ait bougé.
-- ═══════════════════════════════════════════════════════════════════
