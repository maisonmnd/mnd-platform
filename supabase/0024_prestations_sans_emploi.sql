-- ═══════════════════════════════════════════════════════════════════
-- 0024 — Les prestations sans emploi
--        (à coller dans Supabase → SQL Editor). EN DEUX TEMPS.
--
-- ── À LANCER APRÈS LE 0023, JAMAIS AVANT ─────────────────────────
-- Le repli des longueurs lit son barème SUR les variantes : « … · Long » à
-- 28 000 F est ce qui donne au geste son prix de Long. La plupart n'ont jamais
-- été réservées — les effacer d'abord, c'est perdre le barème avant de l'avoir
-- récolté. Le 0023 supprime lui-même celles qu'il a repliées.
--
-- ── LA RÈGLE, INCHANGÉE DEPUIS LE DÉBUT ──────────────────────────
-- Une prestation jamais réservée se supprime. Une prestation qui porte de
-- l'histoire ne se supprime jamais : un rendez-vous ne garde que l'identifiant
-- de ses prestations, et l'effacer ferait perdre au rituel sa maison et son
-- prix. Le 4 août, rattacher sept factures a fait disparaître 330 000 F en un
-- clic — la démonstration a coûté assez cher pour ne pas la refaire.
--
-- Quatre endroits sont interrogés, pas un :
--   · les RENDEZ-VOUS      (appointments → serviceIds), annulés compris ;
--   · la composition d'un FORFAIT   (catalog_services → includes[].serviceId) ;
--   · les prestations d'un ABONNEMENT (plans → included[].serviceId) ;
--   · une offre du CERCLE  (documents `mnd_offers`).
--
-- ── CE QUE « SANS EMPLOI » NE VEUT PAS DIRE ──────────────────────
-- Jamais réservée ≠ dont tu ne veux pas. Une prestation neuve, encore visible
-- aux clientes, n'a simplement pas encore trouvé preneuse. L'aperçu montre la
-- colonne `visible` : ce qui y est vrai disparaîtra AUSSI de la Vitrine et de
-- Ma Couronne. Lis-la avant de lancer.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU — ne modifie RIEN. À lire avant l'étape 2. ───
select coalesce(c.data ->> 'fon', '— hors catégorie')     as famille,
       s.data ->> 'name'                                   as prestation,
       s.data ->> 'code'                                   as code,
       (s.data ->> 'priceXof')::numeric                    as prix,
       coalesce((s.data ->> 'enabled')::boolean, true)     as visible,
       case when coalesce((s.data ->> 'enabled')::boolean, true)
            then '⚠ encore proposée aux clientes' else 'déjà masquée' end as remarque
from public.catalog_services s
left join public.catalog_categories c on c.id = s.data ->> 'categoryId'
where not exists (select 1 from public.appointments a
                    where a.data -> 'serviceIds' ? s.id)
  and not exists (select 1 from public.catalog_services f,
                         jsonb_array_elements(coalesce(f.data -> 'includes', '[]'::jsonb)) inc
                   where inc ->> 'serviceId' = s.id)
  and not exists (select 1 from public.plans p,
                         jsonb_array_elements(coalesce(p.data -> 'included', '[]'::jsonb)) inc
                   where inc ->> 'serviceId' = s.id)
  and not exists (select 1 from public.documents d
                   where d.key = 'mnd_offers' and d.data::text like '%' || s.id || '%')
order by 5 desc, 1, 2;

-- Le compte, pour savoir de quelle taille on parle.
select count(*) filter (where coalesce((s.data ->> 'enabled')::boolean, true))     as encore_proposees,
       count(*) filter (where not coalesce((s.data ->> 'enabled')::boolean, true)) as deja_masquees,
       count(*)                                                                    as total
from public.catalog_services s
where not exists (select 1 from public.appointments a where a.data -> 'serviceIds' ? s.id)
  and not exists (select 1 from public.catalog_services f,
                         jsonb_array_elements(coalesce(f.data -> 'includes', '[]'::jsonb)) inc
                   where inc ->> 'serviceId' = s.id)
  and not exists (select 1 from public.plans p,
                         jsonb_array_elements(coalesce(p.data -> 'included', '[]'::jsonb)) inc
                   where inc ->> 'serviceId' = s.id)
  and not exists (select 1 from public.documents d
                   where d.key = 'mnd_offers' and d.data::text like '%' || s.id || '%');


-- ══════════════════════════════════════════════════════════════════
-- ── ÉTAPE 2 · LA SUPPRESSION. Décommenter et exécuter d'un bloc. ─
-- Ferme d'abord tous les onglets du Trône.
--
-- POUR NE RETIRER QUE LES DÉJÀ MASQUÉES, décommente aussi la ligne marquée
-- « PRUDENCE » : ce qui reste proposé aux clientes sera alors épargné.
-- ══════════════════════════════════════════════════════════════════

-- begin;
--
-- create table if not exists public.repli_0024_services
--   (like public.catalog_services including all);
-- alter table public.repli_0024_services enable row level security;
--
-- insert into public.repli_0024_services
-- select * from public.catalog_services s
-- where not exists (select 1 from public.appointments a
--                     where a.data -> 'serviceIds' ? s.id)
--   and not exists (select 1 from public.catalog_services f,
--                          jsonb_array_elements(coalesce(f.data -> 'includes', '[]'::jsonb)) inc
--                    where inc ->> 'serviceId' = s.id)
--   and not exists (select 1 from public.plans p,
--                          jsonb_array_elements(coalesce(p.data -> 'included', '[]'::jsonb)) inc
--                    where inc ->> 'serviceId' = s.id)
--   and not exists (select 1 from public.documents d
--                    where d.key = 'mnd_offers' and d.data::text like '%' || s.id || '%')
-- --  and not coalesce((s.data ->> 'enabled')::boolean, true)   -- PRUDENCE
-- on conflict (id) do nothing;
--
-- delete from public.catalog_services where id in (select id from public.repli_0024_services);
--
-- -- LES PIERRES TOMBALES. Le Trône re-crée les prestations de départ qu'il ne
-- -- trouve plus ; sans cette inscription, une partie reviendrait à la prochaine
-- -- ouverture de l'écran — « je supprime, ça revient ». Le document est réécrit
-- -- avec l'ancienne liste PLUS les identifiants retirés.
-- insert into public.documents (key, data)
-- select 'mnd_removed_services',
--        coalesce((select data from public.documents where key = 'mnd_removed_services'), '[]'::jsonb)
--        || (select coalesce(jsonb_agg(to_jsonb(id)), '[]'::jsonb) from public.repli_0024_services)
-- on conflict (key) do update set data = excluded.data;
--
-- commit;


-- ── CONTRÔLES après l'étape 2 ─────────────────────────────────────
--
-- A. Aucun rendez-vous ne pointe vers une prestation disparue. ZÉRO ligne.
-- select a.id, sid as prestation_inconnue
-- from public.appointments a,
--      jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
-- left join public.catalog_services s on s.id = sid
-- where s.id is null;
--
-- B. Ce qui a été retiré.
-- select data ->> 'name' as prestation, data ->> 'code' as code,
--        (data ->> 'priceXof')::numeric as prix
-- from public.repli_0024_services order by 1;
--
-- C. Puis dans Le Trône, après rechargement (Ctrl+Maj+R) :
--      Synthèse → Chiffre par maison : tous les mois INCHANGÉS.
--    Une prestation jamais réservée n'a jamais porté un franc. Si un montant
--    bouge, c'est qu'une référence a été manquée — le rollback est plus bas.


-- ── ROLLBACK — remet tout en place ───────────────────────────────
--
-- begin;
-- insert into public.catalog_services select * from public.repli_0024_services
-- on conflict (id) do nothing;
-- update public.documents set data = (
--   select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(data) x
--   where x #>> '{}' not in (select id from public.repli_0024_services))
-- where key = 'mnd_removed_services';
-- commit;


-- ── QUAND TOUT EST VÉRIFIÉ ───────────────────────────────────────
-- drop table public.repli_0024_services;
