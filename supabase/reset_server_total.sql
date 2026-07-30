-- ═══════════════════════════════════════════════════════════════════
-- ⚠ LOGICIEL NEUF — EFFACEMENT TOTAL CÔTÉ SERVEUR, puis PREUVE.
-- (SQL Editor → Run)
--
-- EFFACE TOUT : rendez-vous, clientes, factures, devis, chiffre
-- d'affaires, paiements KkiaPay, avoirs, coffre, caisses, dépenses,
-- catalogue, personnel, Académie, paie, réglages, marque — ET LA BRANCHE
-- « LA MAISON MND ».
--
-- ─── L'ORDRE COMPTE. LE VOICI, CORRIGÉ PAR L'EXPÉRIENCE. ───────────
--  1. Exporter la sauvegarde JSON (app → Système · Paramètres).
--  2. DANS L'APP : Système · Paramètres → « Réinitialisation totale ».
--  3. PUIS CE SCRIPT.
--
-- POURQUOI L'APP D'ABORD. Le 30-07-2026, un premier passage SQL a bien
-- vidé `clients` — et 160 clientes sont revenues, portant encore
-- `br-v74o4herft`. À l'hydratation, une table serveur VIDE est traitée
-- comme une maison neuve à amorcer : la synchro POUSSE alors le contenu du
-- navigateur vers le serveur (shared/sync.ts, branche `else`). Tant que le
-- cache d'un navigateur est plein, il RÉ-ALIMENTE le serveur, et aucun
-- effacement SQL ne tient.
--
-- La « Réinitialisation totale » de l'app est le seul geste qui coupe
-- cette boucle : elle vide le serveur, PUIS purge le localStorage, PUIS
-- pose le drapeau « Maison à blanc » qui empêche les semences de
-- repeupler. Après elle, plus rien ne pousse.
--
-- Ce script vient ENSUITE finir le travail sur ce que l'app ne connaît
-- pas : la famille `import_*`, `push_reminders`, les compteurs de débit,
-- les branches. Aucune de ces tables n'a de magasin local — rien ne peut
-- donc les ressusciter.
--
-- ⚠ À FAIRE SUR CHAQUE APPAREIL qui a ouvert Le Trône (comptoir,
-- téléphone, second navigateur). Un seul cache oublié suffit à tout
-- ramener. Si un doute subsiste, sur l'appareil concerné : F12 → console →
--     Object.keys(localStorage).filter(k=>k.startsWith('mnd_'))
--       .forEach(k=>localStorage.removeItem(k)); location.reload();
--
-- ─── CE QUI SURVIT, ET C'EST VOULU ─────────────────────────────────
--   · `staff`, `staff_branches` — tes comptes d'ACCÈS. On n'y touche pas.
--   · les tables de plomberie (`tunnel_rate_limit`…) — pas des données.
--   · la famille `import_*` — la ZONE D'ATTERRISSAGE de la migration de
--     l'ancien ERP, invisible dans l'app. Relevée au premier passage :
--     import_appointments 385, import_clients 166,
--     import_catalog_services 56, import_invoices 35. Les 385 sont
--     exactement les rendez-vous orphelins de `br-xrnyd4nh7x` : c'est de
--     là qu'ils venaient. Drapeau `froid` à `true` pour tout effacer.
--
-- ─── LA BRANCHE SE RECRÉE TOUTE SEULE ──────────────────────────────
-- Effacer `branches` ne casse rien. `useBranch()` retombe sur
-- DEFAULT_BRANCHES, et `mnd_branches` est dans BLANK_KEEP : sa semence
-- survit au mode « Maison à blanc ». Au rechargement de l'étape 3, l'app
-- crée d'elle-même une branche neutre — « Ma Maison », id `maison`, sans
-- ville, sans maître — et la pousse au serveur. « LA MAISON MND »
-- disparaît ; tu renommes la neuve depuis Système · Branches.
--
-- TES CLÉS KKIAPAY NE SONT PAS DANS LES TABLES : elles vivent dans les
-- secrets des Edge Functions et dans `.env`. Rien ici ne les touche.
-- ═══════════════════════════════════════════════════════════════════

-- ─── LES DRAPEAUX ──────────────────────────────────────────────────
create temp table go on commit drop as
select true as branche,  -- effacer les branches (voir la liste ci-dessous)
       true as froid;    -- effacer AUSSI toute la famille `import_*`, dernière
                         -- trace de l'ancien ERP. Irréversible.

-- ─── QUELLE(S) BRANCHE(S) GARDER ───────────────────────────────────
-- Par IDENTIFIANT, jamais par nom : « MND HOME » s'écrit en capitales en
-- base, et une casse ou un espace de trop ne doit pas décider du sort
-- d'une branche. Relevé le 30-07-2026 :
--     br-40r6u6frno  MND HOME        ← on garde
--     br-v74o4herft  LA MAISON MND   ← part avec toute son histoire
-- Pour n'en garder AUCUNE : commente la ligne `insert`. L'app recréera
-- d'elle-même « Ma Maison » au rechargement de l'étape 3.
--
-- Les DONNÉES sont effacées dans tous les cas, quelle que soit leur
-- branche : garder une branche garde le CONTENANT, jamais le contenu.
create temp table garder_branche (id text primary key) on commit drop;
insert into garder_branche (id) values ('br-40r6u6frno');

-- ─── CE QUI SURVIT — LA LOGIQUE EST INVERSÉE ───────────────────────
-- On ne liste PLUS ce qu'il faut effacer : on liste ce qu'il faut GARDER,
-- et tout le reste du schéma `public` est vidé.
--
-- Pourquoi. Le premier passage a listé 32 tables prises du code de l'app
-- et en a laissé six debout, que rien dans le dépôt ne mentionnait :
-- `push_reminders` (53 lignes, une vraie table de l'app) et la famille
-- `import_*` (appointments 385, clients 166, catalog_services 56,
-- invoices 35…), zone d'atterrissage de la migration de l'ancien ERP.
-- Une liste écrite à la main vieillit toujours plus vite que le schéma —
-- `payments` l'avait déjà prouvé. Une liste de ce qui SURVIT, elle, est
-- courte, stable, et ne peut rien oublier.
--
-- Comparaison en `like`, donc les motifs acceptent `%`.
-- TROIS TABLES SURVIVENT, PAS UNE DE PLUS.
create temp table garder_table (motif text primary key) on commit drop;
insert into garder_table (motif) values
  ('staff'),           -- comptes d'ACCÈS
  ('staff_branches'),  -- idem
  ('branches');        -- traitée à part, plus bas
-- Les compteurs de limitation de débit (`edge_rate_limits`,
-- `tunnel_rate_limit`) sont VOLONTAIREMENT vidés eux aussi : ce sont des
-- compteurs de fenêtre glissante, pas des données. Les remettre à zéro
-- n'ouvre aucune brèche — la limite repart simplement d'une fenêtre neuve.

-- La famille `import_*` n'est gardée QUE si le drapeau `froid` est à false.
insert into garder_table (motif)
select 'import\_%' where not (select froid from go);

-- ─── L'EFFACEMENT ──────────────────────────────────────────────────
-- On parcourt le catalogue de Postgres : aucune table ne peut échapper,
-- même créée après l'écriture de ce fichier. `relkind = 'r'` → tables
-- ordinaires seulement, ni vues ni séquences.
create temp table efface (t text primary key, n bigint) on commit drop;
do $$
declare r record; c bigint;
begin
  for r in
    select cl.relname from pg_class cl
    join pg_namespace ns on ns.oid = cl.relnamespace
    where ns.nspname = 'public' and cl.relkind = 'r'
    order by cl.relname
  loop
    if exists (select 1 from garder_table g where r.relname like g.motif) then
      continue;
    end if;
    execute format('select count(*) from public.%I', r.relname) into c;
    execute format('delete from public.%I', r.relname);
    insert into efface values (r.relname, c);
  end loop;

  /* Les branches NON listées dans `garder_branche` partent. */
  if (select branche from go) and to_regclass('public.branches') is not null then
    delete from public.branches b
    where not exists (select 1 from garder_branche g where g.id = b.id);

    /* LE SIÈGE. « LA MAISON MND » portait `flagship` ; MND HOME non. La
       suppression par l'écran promeut la première branche restante — un
       `delete` en SQL, lui, ne promeut personne, et la Maison se
       retrouverait sans siège. On promeut donc s'il n'en reste aucun. */
    if exists (select 1 from public.branches)
       and not exists (select 1 from public.branches where data->'flagship' = 'true'::jsonb) then
      update public.branches
      set data = jsonb_set(data, '{flagship}', 'true'::jsonb)
      where id = (select id from public.branches order by id limit 1);
    end if;

    /* `staff_branches` : la RLS ne s'en sert PAS (elle passe par
       `is_staff()`), donc aucun accès n'est en jeu. Mais laisser des lignes
       pointant vers une branche effacée, c'est refabriquer exactement le
       dégât qu'on vient de passer la semaine à réparer. On nettoie, puis on
       rattache chaque membre du personnel aux branches restantes. */
    if to_regclass('public.staff_branches') is not null then
      delete from public.staff_branches sb
      where not exists (select 1 from public.branches b where b.id = sb.branch_id);
      insert into public.staff_branches (user_id, branch_id)
      select s.user_id, b.id from public.staff s cross join public.branches b
      on conflict do nothing;
    end if;
  end if;

end $$;

-- ─── LE COMPTE DE TOUTES LES TABLES ────────────────────────────────
-- On interroge le catalogue de Postgres, jamais une liste écrite à la
-- main : une table oubliée par `cible` se verra ici.
create temp table etat (t text, n bigint) on commit drop;
do $$
declare r record; c bigint;
begin
  for r in
    select c.relname from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format('select count(*) from public.%I', r.relname) into c;
    insert into etat values (r.relname, c);
  end loop;
end $$;

-- ═══ RAPPORT ═══════════════════════════════════════════════════════
select rubrique, detail
from (
  /* Le verdict ne juge QUE ce qui n'était pas volontairement gardé : une
     table encore peuplée qui ne correspond à aucun motif de survie est un
     oubli, et c'est la seule chose qui doit faire échouer le contrôle. */
  select 1 as bloc, 0::bigint as rang, 'VERDICT' as rubrique,
         case when (select count(*) from etat e
                    where e.n > 0
                      and not exists (select 1 from garder_table g where e.t like g.motif)) = 0
              then '✔ SERVEUR NEUF — plus aucune donnée métier. Va maintenant faire l''étape 3 dans l''app.'
              else '⚠ IL RESTE DES LIGNES HORS LISTE DE SURVIE — voir « ENCORE PEUPLÉ ».' end as detail

  union all
  select 2, 0::bigint, '⚠ SI TU N''AS PAS ENCORE FAIT LA RÉINITIALISATION DE L''APP',
         'Fais-la MAINTENANT (Système · Paramètres), sur chaque appareil, sinon un cache plein repoussera tout au serveur — c''est ainsi que 160 clientes sont revenues. Puis relance ce script pour vérifier.'

  union all
  select 2, 1::bigint, 'BRANCHE(S) RESTANTE(S)',
         coalesce(string_agg(coalesce(b.data->>'name', '(sans nom)') || ' [' || b.id || ']', ' · ' order by b.id),
                  'aucune — l''app recréera « Ma Maison » à l''étape 3')
  from public.branches b

  union all
  select 3, row_number() over (order by e.n desc, e.t), 'ENCORE PEUPLÉ',
         e.t || ' · ' || e.n || ' ligne(s)'
      || case when e.t in ('staff', 'staff_branches') then '  ← tes comptes d''accès, conservés'
              when e.t = 'branches' then '  ← branche(s) gardée(s) — voir « BRANCHE(S) RESTANTE(S) »'
              when e.t like 'import@_%' escape '@' then '  ← zone d''atterrissage de la migration (drapeau `froid`)'
              when e.t like '%rate_limit%' then '  ← plomberie'
              else '  ← ⚠ OUBLI : hors liste de survie et pourtant peuplée' end
  from etat e where e.n > 0

  /* Ce qui vient d'être vidé, et combien pesait chaque table. C'est la
     trace de l'opération : sans elle, « serveur neuf » n'est qu'un mot. */
  union all
  select 4, row_number() over (order by f.n desc, f.t), 'VIDÉ',
         f.t || ' · ' || f.n || ' ligne(s) effacée(s)'
  from efface f where f.n > 0

  union all
  select 5, 0::bigint, 'DÉJÀ VIDES',
         count(*) || ' table(s) : ' || string_agg(f.t, ' · ' order by f.t)
  from efface f where f.n = 0
  having count(*) > 0
) t
order by bloc, rang;
