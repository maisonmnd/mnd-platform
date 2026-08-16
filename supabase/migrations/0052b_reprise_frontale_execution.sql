-- ═══════════════════════════════════════════════════════════════════
-- 0052b — L'EXÉCUTION du repli de la Reprise Frontale.
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. RIEN À
-- DÉCOMMENTER : c'est tout le propos de ce fichier. Le 16 août, l'étape 2
-- du 0052 a été lancée avec son `commit;` resté commenté — Postgres a donc
-- annulé la transaction à la fermeture, et « Success. No rows returned »
-- annonçait un succès qui n'avait rien écrit.
--
-- Le raisonnement, les aperçus, les contrôles et le rollback vivent dans
-- `0052_reprise_frontale_devient_retouche.sql`. Ce fichier-ci ne porte que
-- le geste.
--
-- FERME D'ABORD TOUS LES ONGLETS du Trône et de Ma Couronne : un onglet
-- ouvert rejoue sa copie froide et défait le travail.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── Les tables de secours — le seul retour en arrière ────────────
create table if not exists public.repli_0052_appointments
  (like public.appointments including all);
alter table public.repli_0052_appointments enable row level security;
create table if not exists public.repli_0052_invoices
  (like public.invoices including all);
alter table public.repli_0052_invoices enable row level security;
create table if not exists public.repli_0052_services
  (like public.catalog_services including all);
alter table public.repli_0052_services enable row level security;

insert into public.repli_0052_appointments
select * from public.appointments a
where a.data -> 'serviceIds' ?| array['sv-plt-55-e', 'sv-plt-55-l']
on conflict (id) do nothing;

insert into public.repli_0052_invoices
select * from public.invoices i
where exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines', '[]'::jsonb)) l
               where l ->> 'label' like '%La Reprise Frontale · Essentielle%'
                  or l ->> 'label' like '%La Reprise Frontale · Élaborée%')
on conflict (id) do nothing;

insert into public.repli_0052_services
select * from public.catalog_services where id in ('sv-plt-55-e', 'sv-plt-55-l')
on conflict (id) do nothing;

-- ── ① LE PRIX SE FIGE AVANT LE REPLI ─────────────────────────────
-- Sans cela, un Élaborée à 15 000 F se relirait 4 000 F au catalogue.
update public.appointments a
set data = a.data || jsonb_build_object('priceXof',
      (select coalesce(sum(coalesce(
         (s.data -> 'prixParLongueur' ->> (a.data ->> 'longueur'))::numeric,
         (s.data ->> 'priceXof')::numeric, 0)), 0)
       from jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
       join public.catalog_services s on s.id = sid))
where a.data -> 'serviceIds' ?| array['sv-plt-55-e', 'sv-plt-55-l']
  and not (a.data ? 'priceXof');

-- ── ② LES RENDEZ-VOUS CHANGENT DE PRESTATION ─────────────────────
-- Élément par élément : la liste garde sa longueur et son ordre, donc
-- `mains` (tableau parallèle) reste aligné sur les bonnes prestations.
update public.appointments a
set data = jsonb_set(a.data, '{serviceIds}', (
      select jsonb_agg(case when sid in ('sv-plt-55-e', 'sv-plt-55-l')
                            then 'sv-retouches-post-reprise' else sid end
                       order by ord)
      from jsonb_array_elements_text(a.data -> 'serviceIds') with ordinality t(sid, ord)))
where a.data -> 'serviceIds' ?| array['sv-plt-55-e', 'sv-plt-55-l'];

-- ── ③ LES PIÈCES CHANGENT DE LIBELLÉ ─────────────────────────────
-- Le montant de la ligne ne bouge pas. `replace` et non une égalité : un
-- libellé composite (« A + B », « Règlement · B ») porte le nom au milieu.
update public.invoices i
set data = jsonb_set(i.data, '{lines}', (
      select jsonb_agg(
        case when l ->> 'label' like '%La Reprise Frontale · Essentielle%'
               or l ->> 'label' like '%La Reprise Frontale · Élaborée%'
             then jsonb_set(l, '{label}', to_jsonb(
                   replace(replace(l ->> 'label',
                     'La Reprise Frontale · Essentielle', 'Retouches Post Reprise'),
                     'La Reprise Frontale · Élaborée',    'Retouches Post Reprise')))
             else l end
        order by ord)
      from jsonb_array_elements(i.data -> 'lines') with ordinality t(l, ord)))
where exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines', '[]'::jsonb)) l
               where l ->> 'label' like '%La Reprise Frontale · Essentielle%'
                  or l ->> 'label' like '%La Reprise Frontale · Élaborée%');

-- ── ④ LES DEUX FICHES SORTENT DU CATALOGUE ───────────────────────
delete from public.catalog_services where id in ('sv-plt-55-e', 'sv-plt-55-l');

-- LES PIERRES TOMBALES — sans elles, le Trône re-crée les prestations de
-- départ qu'il ne trouve plus, à la prochaine ouverture de l'écran.
insert into public.documents (key, data)
select 'mnd_removed_services',
       coalesce((select data from public.documents where key = 'mnd_removed_services'), '[]'::jsonb)
       || '["sv-plt-55-e","sv-plt-55-l"]'::jsonb
on conflict (key) do update set data = excluded.data;

-- ── ⑤ LE MÉNAGE DES MASQUES ──────────────────────────────────────
-- Deux identifiants qui n'existent plus n'ont rien à faire dans la liste
-- des prestations masquées.
update public.documents
set data = jsonb_set(data, '{hiddenServices}', (
      select coalesce(jsonb_agg(x), '[]'::jsonb)
      from jsonb_array_elements(data -> 'hiddenServices') x
      where x #>> '{}' not in ('sv-plt-55-e', 'sv-plt-55-l')))
where key = 'mnd_vitrine_config' and data ? 'hiddenServices';

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLE IMMÉDIAT — à lancer juste après. Les trois comptes à ZÉRO.
-- ═══════════════════════════════════════════════════════════════════
select (select count(*) from public.appointments a
         where a.data -> 'serviceIds' ?| array['sv-plt-55-e','sv-plt-55-l'])   as rdv_restants,
       (select count(*) from public.catalog_services
         where id in ('sv-plt-55-e','sv-plt-55-l'))                            as fiches_restantes,
       (select count(*) from public.invoices i,
               jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
         where l ->> 'label' like '%La Reprise Frontale%')                     as lignes_restantes;

-- Ce qui a été repris, pièce par pièce — les cinq factures doivent dire
-- « Retouches Post Reprise » et garder leur montant (15 000 ×3, 4 000 ×2).
select i.data ->> 'number' as piece, i.data ->> 'date' as jour,
       l ->> 'label' as ligne, (l ->> 'unitXof')::numeric as montant
from public.invoices i, jsonb_array_elements(coalesce(i.data -> 'lines', '[]'::jsonb)) l
where i.id in (select id from public.repli_0052_invoices)
  and l ->> 'label' = 'Retouches Post Reprise'
order by 2;
