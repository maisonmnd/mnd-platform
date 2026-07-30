-- ═══════════════════════════════════════════════════════════════════
-- LOGICIEL NEUF — balayage final et PREUVE que plus rien ne reste.
-- (SQL Editor → Run)
--
-- À LANCER APRÈS la « Réinitialisation totale » de l'app
-- (Système · Paramètres). Elle fait le gros du travail — et elle seule
-- sait poser le drapeau « Maison à blanc » en local, sans quoi les
-- SEMENCES du code repeuplent catalogue et personas au rechargement.
-- Vider le serveur en SQL ne suffit donc jamais à lui seul.
--
-- CE FICHIER FAIT DEUX CHOSES :
--   ① il balaie ce que la réinitialisation de l'app ne pouvait pas
--      atteindre — voir les deux drapeaux ci-dessous ;
--   ② il COMPTE toutes les tables et te montre, table par table, ce qui
--      reste. C'est la preuve que la Maison est neuve, pas une promesse.
--
-- CE QUI RESTE DEBOUT, ET C'EST VOULU :
--   · `branches`  — Le Trône ne démarre pas sans au moins une branche.
--   · `staff`, `staff_branches` — les comptes d'ACCÈS. Les effacer, et
--     plus personne ne se reconnecte, toi compris.
--   · les tables de plomberie (`tunnel_rate_limit`…) : pas des données.
--
-- TES CLÉS KKIAPAY NE SONT PAS ICI. Elles vivent dans les secrets des
-- Edge Functions et dans `.env` — aucune remise à zéro de données ne les
-- touche. Le tunnel de paiement fonctionnera dès la première facture.
-- ═══════════════════════════════════════════════════════════════════

-- ─── LES DEUX DRAPEAUX ─────────────────────────────────────────────
-- `payments` : à `true` si tu n'as pas encore déployé le correctif de
--   houseReset.ts. Avant lui, la réinitialisation de l'app laissait les
--   paiements KkiaPay au serveur.
-- `froid` : la sauvegarde FROIDE des rendez-vous importés
--   (`import_appointments`). C'est la DERNIÈRE trace de l'ancien ERP.
--   `false` la garde — un filet invisible dans l'app. `true` l'efface,
--   et alors il ne reste vraiment plus rien. Irréversible.
create temp table go on commit drop as
select true as payments,
       false as froid;

-- ─── ① BALAYAGE ────────────────────────────────────────────────────
do $$
begin
  if (select payments from go) and to_regclass('public.payments') is not null then
    delete from public.payments;
  end if;
  if (select froid from go) and to_regclass('public.import_appointments') is not null then
    delete from public.import_appointments;
  end if;
end $$;

-- ─── ② LE COMPTE DE TOUTES LES TABLES ──────────────────────────────
-- On interroge le catalogue de Postgres : aucune liste écrite à la main ne
-- peut mentir ou vieillir. Une table oubliée se verra ici.
create temp table etat on commit drop (t text, n bigint);
do $$
declare r record; c bigint;
begin
  for r in
    select c.relname
    from pg_class c
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
  select 1 as bloc, 0::bigint as rang, 'VERDICT' as rubrique,
         case when (select count(*) from etat e
                    where e.n > 0
                      and e.t not in ('branches', 'staff', 'staff_branches')
                      and e.t not like '%rate_limit%'
                      and not ((select not froid from go) and e.t = 'import_appointments')) = 0
              then '✔ LOGICIEL NEUF — plus aucune donnée métier au serveur.'
              else '⚠ IL RESTE DES LIGNES — voir le bloc « ENCORE PEUPLÉ » ci-dessous.' end as detail

  union all
  select 2, row_number() over (order by e.n desc, e.t), 'ENCORE PEUPLÉ',
         e.t || ' · ' || e.n || ' ligne(s)'
      || case when e.t in ('branches', 'staff', 'staff_branches') then '  ← conservé à dessein'
              when e.t = 'import_appointments' then '  ← sauvegarde froide (drapeau `froid`)'
              when e.t like '%rate_limit%' then '  ← plomberie'
              else '  ← À VOIR : cette table n''est pas dans la liste de houseReset.ts' end
  from etat e where e.n > 0

  union all
  select 3, 0::bigint, 'VIDES',
         count(*) || ' table(s) à zéro : ' || string_agg(e.t, ' · ' order by e.t)
  from etat e where e.n = 0
  having count(*) > 0

  union all
  select 4, 0::bigint, 'RAPPEL',
         'Si le carnet ou le catalogue se repeuplent au rechargement, c''est que le drapeau « Maison à blanc » n''est pas posé : repasse par Système · Paramètres → Réinitialisation totale, qui purge aussi le cache du navigateur.'
) t
order by bloc, rang;
