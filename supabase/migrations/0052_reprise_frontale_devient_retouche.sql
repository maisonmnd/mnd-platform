-- ═══════════════════════════════════════════════════════════════════
-- 0052 — LA REPRISE FRONTALE DEVIENT « RETOUCHES POST REPRISE »
--        (à coller dans Supabase → SQL Editor). EN DEUX TEMPS.
--
-- ── CE QU'IL FAIT ────────────────────────────────────────────────
-- Trois prestations disaient le même geste :
--   · La Reprise Frontale · Essentielle   sv-plt-55-e            4 000 F fixe
--   · La Reprise Frontale · Élaborée      sv-plt-55-l           15 000 F fixe
--   · Retouches Post Reprise              sv-retouches-post-reprise
--                                          par calibre — Jumbo/Mini 4 000,
--                                          Medium 5 000, Nano 12 000,
--                                          Micro/Pico 15 000
--
-- Les deux premières portent l'histoire, la troisième porte le barème. Tout
-- se replie sur la troisième :
--   ① les RENDEZ-VOUS changent de prestation (serviceIds) ;
--   ② les FACTURES et DEVIS changent le libellé de leurs lignes ;
--   ③ les deux fiches Reprise Frontale sont SUPPRIMÉES du catalogue.
--
-- ── POURQUOI PAS UN FRANC NE BOUGE ───────────────────────────────
-- DÉCISION DE YÉMAN, 16 août : les montants déjà facturés RESTENT. Une
-- facture atteste ce qui a été payé ; elle ne se recalcule pas.
--
-- Deux mécaniques auraient pu les déplacer, les deux sont neutralisées :
--   · une LIGNE DE FACTURE porte son montant en propre (`unitXof`) — on ne
--     touche qu'au `label`, jamais au chiffre ;
--   · un RENDEZ-VOUS sans prix figé se relit AU CATALOGUE. Repointé tel quel
--     vers une prestation à 4 000 F, un rituel Élaborée à 15 000 F se serait
--     mis à valoir 4 000 F — dans la Synthèse, les bilans et la caisse.
--     L'étape 2 FIGE donc d'abord le prix d'aujourd'hui sur chaque rituel
--     concerné qui n'en porte pas, AVANT de le repointer.
--
-- Conséquence assumée : un rituel À VENIR garde lui aussi son prix d'alors.
-- Pour qu'il suive le barème par calibre, effacer son `priceXof` à la main
-- (ou rouvrir puis réenregistrer le rendez-vous au Trône).
--
-- ── CE QUI N'EST PAS TOUCHÉ ──────────────────────────────────────
--   · aucun forfait ne contient ces deux prestations (vérifié le 16 août) ;
--   · aucun geste de la Maison (`offertAvec`) ne les cite ;
--   · aucun abonnement (`plans`) ne les inclut ;
--   · les prix convenus par cliente (`prixFixes`) sont gardés tels quels —
--     l'aperçu ci-dessous les compte, à reporter à la main si tu en as.
--
-- ── À SAVOIR AVANT DE LANCER ─────────────────────────────────────
-- « Retouches Post Reprise » est AUJOURD'HUI MASQUÉE à la Vitrine
-- (`hiddenServices`). Après ce script, toute l'histoire pointera donc vers
-- une prestation que les clientes ne voient pas. Si elle doit se réserver,
-- rallume son interrupteur dans Vitrine client → la régie — ou décommente
-- la ligne prévue à l'étape 2.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU — ne modifie RIEN. À lire avant l'étape 2. ───

-- A. Les rendez-vous concernés, et ce qu'ils valent aujourd'hui.
with cible as (select unnest(array['sv-plt-55-e', 'sv-plt-55-l']) as id)
select a.data ->> 'date'                                    as jour,
       a.data ->> 'clientName'                              as tete,
       a.data ->> 'status'                                  as statut,
       case when a.data ? 'priceXof' then 'prix figé' else 'relu au catalogue' end as prix,
       coalesce((a.data ->> 'priceXof')::numeric,
                (select coalesce(sum(coalesce(
                   (s.data -> 'prixParLongueur' ->> (a.data ->> 'longueur'))::numeric,
                   (s.data ->> 'priceXof')::numeric, 0)), 0)
                 from jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
                 join public.catalog_services s on s.id = sid)) as vaut_aujourdhui,
       a.data -> 'serviceIds'                               as prestations
from public.appointments a
where exists (select 1 from cible c where a.data -> 'serviceIds' ? c.id)
order by 1;

-- B. Le compte, par prestation et par statut.
select case when a.data -> 'serviceIds' ? 'sv-plt-55-e' then 'Essentielle' else 'Élaborée' end as prestation,
       a.data ->> 'status'                                  as statut,
       count(*)                                             as rituels,
       count(*) filter (where a.data ? 'priceXof')          as deja_figes
from public.appointments a
where a.data -> 'serviceIds' ?| array['sv-plt-55-e', 'sv-plt-55-l']
group by 1, 2 order by 1, 2;

-- C. Un rituel porte-t-il LES DEUX ? (le repli y écrirait deux fois la même
--    prestation — le total ne bougerait pas, mais la ligne se lirait deux fois)
select count(*) as rituels_portant_les_deux
from public.appointments a
where a.data -> 'serviceIds' ? 'sv-plt-55-e'
  and a.data -> 'serviceIds' ? 'sv-plt-55-l';

-- D. Les lignes de facture qui portent l'un des deux noms.
select i.data ->> 'number' as piece, i.data ->> 'kind' as nature,
       i.data ->> 'date' as jour, i.data ->> 'status' as statut,
       l ->> 'label' as ligne, (l ->> 'unitXof')::numeric as montant
from public.invoices i, jsonb_array_elements(coalesce(i.data -> 'lines', '[]'::jsonb)) l
where l ->> 'label' like '%La Reprise Frontale · Essentielle%'
   or l ->> 'label' like '%La Reprise Frontale · Élaborée%'
order by 3;

-- E. Des prix convenus par cliente sur ces deux prestations ? (à reporter
--    à la main sur `sv-retouches-post-reprise` — le script n'y touche pas)
select c.data ->> 'name' as cliente,
       c.data -> 'prixFixes' -> 'sv-plt-55-e' as prix_essentielle,
       c.data -> 'prixFixes' -> 'sv-plt-55-l' as prix_elaboree
from public.clients c
where c.data -> 'prixFixes' ?| array['sv-plt-55-e', 'sv-plt-55-l'];


-- ══════════════════════════════════════════════════════════════════
-- ── ÉTAPE 2 · LE REPLI. Décommenter et exécuter d'un bloc. ───────
-- Ferme d'abord tous les onglets du Trône et de Ma Couronne : un onglet
-- ouvert rejoue sa copie froide et défait le travail.
-- ══════════════════════════════════════════════════════════════════

-- begin;
--
-- -- Les tables de secours — le seul retour en arrière.
-- create table if not exists public.repli_0052_appointments
--   (like public.appointments including all);
-- alter table public.repli_0052_appointments enable row level security;
-- create table if not exists public.repli_0052_invoices
--   (like public.invoices including all);
-- alter table public.repli_0052_invoices enable row level security;
-- create table if not exists public.repli_0052_services
--   (like public.catalog_services including all);
-- alter table public.repli_0052_services enable row level security;
--
-- insert into public.repli_0052_appointments
-- select * from public.appointments a
-- where a.data -> 'serviceIds' ?| array['sv-plt-55-e', 'sv-plt-55-l']
-- on conflict (id) do nothing;
--
-- insert into public.repli_0052_invoices
-- select * from public.invoices i
-- where exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines', '[]'::jsonb)) l
--                where l ->> 'label' like '%La Reprise Frontale · Essentielle%'
--                   or l ->> 'label' like '%La Reprise Frontale · Élaborée%')
-- on conflict (id) do nothing;
--
-- insert into public.repli_0052_services
-- select * from public.catalog_services where id in ('sv-plt-55-e', 'sv-plt-55-l')
-- on conflict (id) do nothing;
--
-- -- ① LE PRIX SE FIGE AVANT LE REPLI — sur les rituels qui n'en portent pas.
-- --    Sans cela, un Élaborée à 15 000 F se relirait à 4 000 F au catalogue.
-- update public.appointments a
-- set data = a.data || jsonb_build_object('priceXof',
--       (select coalesce(sum(coalesce(
--          (s.data -> 'prixParLongueur' ->> (a.data ->> 'longueur'))::numeric,
--          (s.data ->> 'priceXof')::numeric, 0)), 0)
--        from jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
--        join public.catalog_services s on s.id = sid))
-- where a.data -> 'serviceIds' ?| array['sv-plt-55-e', 'sv-plt-55-l']
--   and not (a.data ? 'priceXof');
--
-- -- ② LES RENDEZ-VOUS CHANGENT DE PRESTATION. Élément par élément : la liste
-- --    garde sa longueur et son ordre, donc `mains` (tableau parallèle) reste
-- --    aligné sur les bonnes prestations.
-- update public.appointments a
-- set data = jsonb_set(a.data, '{serviceIds}', (
--       select jsonb_agg(case when sid in ('sv-plt-55-e', 'sv-plt-55-l')
--                             then 'sv-retouches-post-reprise' else sid end
--                        order by ord)
--       from jsonb_array_elements_text(a.data -> 'serviceIds') with ordinality t(sid, ord)))
-- where a.data -> 'serviceIds' ?| array['sv-plt-55-e', 'sv-plt-55-l'];
--
-- -- ③ LES PIÈCES CHANGENT DE LIBELLÉ — le montant de la ligne ne bouge pas.
-- --    `replace` et non une égalité : un libellé composite (« A + B »,
-- --    « Règlement · B ») porte le nom au milieu d'une phrase.
-- update public.invoices i
-- set data = jsonb_set(i.data, '{lines}', (
--       select jsonb_agg(
--         case when l ->> 'label' like '%La Reprise Frontale · Essentielle%'
--                or l ->> 'label' like '%La Reprise Frontale · Élaborée%'
--              then jsonb_set(l, '{label}', to_jsonb(
--                    replace(replace(l ->> 'label',
--                      'La Reprise Frontale · Essentielle', 'Retouches Post Reprise'),
--                      'La Reprise Frontale · Élaborée',    'Retouches Post Reprise')))
--              else l end
--         order by ord)
--       from jsonb_array_elements(i.data -> 'lines') with ordinality t(l, ord)))
-- where exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines', '[]'::jsonb)) l
--                where l ->> 'label' like '%La Reprise Frontale · Essentielle%'
--                   or l ->> 'label' like '%La Reprise Frontale · Élaborée%');
--
-- -- ④ LES DEUX FICHES SORTENT DU CATALOGUE.
-- delete from public.catalog_services where id in ('sv-plt-55-e', 'sv-plt-55-l');
--
-- -- LES PIERRES TOMBALES. Le Trône re-crée les prestations de départ qu'il ne
-- -- trouve plus ; sans cette inscription, elles reviendraient à la prochaine
-- -- ouverture de l'écran.
-- insert into public.documents (key, data)
-- select 'mnd_removed_services',
--        coalesce((select data from public.documents where key = 'mnd_removed_services'), '[]'::jsonb)
--        || '["sv-plt-55-e","sv-plt-55-l"]'::jsonb
-- on conflict (key) do update set data = excluded.data;
--
-- -- ⑤ LE MÉNAGE DES MASQUES — deux identifiants qui n'existent plus n'ont
-- --    rien à faire dans la liste des prestations masquées.
-- update public.documents
-- set data = jsonb_set(data, '{hiddenServices}', (
--       select coalesce(jsonb_agg(x), '[]'::jsonb)
--       from jsonb_array_elements(data -> 'hiddenServices') x
--       where x #>> '{}' not in ('sv-plt-55-e', 'sv-plt-55-l')))
-- where key = 'mnd_vitrine_config' and data ? 'hiddenServices';
--
-- -- ⑥ FACULTATIF — rallumer « Retouches Post Reprise » pour les clientes.
-- --    Elle est masquée aujourd'hui : sans cette ligne, l'histoire pointera
-- --    vers une prestation invisible à la Vitrine et à Ma Couronne.
-- -- update public.documents
-- -- set data = jsonb_set(data, '{hiddenServices}', (
-- --       select coalesce(jsonb_agg(x), '[]'::jsonb)
-- --       from jsonb_array_elements(data -> 'hiddenServices') x
-- --       where x #>> '{}' <> 'sv-retouches-post-reprise'))
-- -- where key = 'mnd_vitrine_config' and data ? 'hiddenServices';
--
-- commit;


-- ── CONTRÔLES après l'étape 2 ─────────────────────────────────────
--
-- A. Plus aucune trace des deux identifiants. ZÉRO partout.
-- select (select count(*) from public.appointments a
--          where a.data -> 'serviceIds' ?| array['sv-plt-55-e','sv-plt-55-l'])   as rdv_restants,
--        (select count(*) from public.catalog_services
--          where id in ('sv-plt-55-e','sv-plt-55-l'))                            as fiches_restantes,
--        (select count(*) from public.invoices i,
--                jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
--          where l ->> 'label' like '%La Reprise Frontale%')                     as lignes_restantes;
--
-- B. Aucun rendez-vous ne pointe vers une prestation disparue. ZÉRO ligne.
-- select a.id, sid as prestation_inconnue
-- from public.appointments a,
--      jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
-- left join public.catalog_services s on s.id = sid
-- where s.id is null;
--
-- C. L'ARGENT N'A PAS BOUGÉ — le total des rituels repliés, avant et après.
-- select (select sum((data ->> 'priceXof')::numeric) from public.repli_0052_appointments
--          where data ? 'priceXof')                                             as avant_deja_figes,
--        (select sum((a.data ->> 'priceXof')::numeric) from public.appointments a
--          where a.id in (select id from public.repli_0052_appointments))        as apres_tous_figes;
--    Le second doit être ÉGAL ou SUPÉRIEUR au premier — supérieur parce que
--    les rituels sans prix figé en ont reçu un, égal à ce qu'ils valaient.
--
-- D. Puis dans Le Trône, après rechargement (Ctrl+Maj+R) :
--      Synthèse → Chiffre par maison : tous les mois INCHANGÉS.
--      Catalogue → « Retouches Post Reprise » porte désormais les honorés et
--      le chiffre des deux Reprise Frontale réunies.


-- ── ROLLBACK — remet tout en place ───────────────────────────────
--
-- begin;
-- insert into public.catalog_services select * from public.repli_0052_services
-- on conflict (id) do update set data = excluded.data;
-- insert into public.appointments select * from public.repli_0052_appointments
-- on conflict (id) do update set data = excluded.data;
-- insert into public.invoices select * from public.repli_0052_invoices
-- on conflict (id) do update set data = excluded.data;
-- update public.documents set data = (
--   select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(data) x
--   where x #>> '{}' not in ('sv-plt-55-e','sv-plt-55-l'))
-- where key = 'mnd_removed_services';
-- commit;


-- ── QUAND TOUT EST VÉRIFIÉ ───────────────────────────────────────
-- drop table public.repli_0052_appointments;
-- drop table public.repli_0052_invoices;
-- drop table public.repli_0052_services;
