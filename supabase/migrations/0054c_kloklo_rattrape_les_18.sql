-- ═══════════════════════════════════════════════════════════════════
-- 0054c — LE RATTRAPAGE DES 18
--         (à coller tel quel. RIEN À DÉCOMMENTER.)
--
-- ⚠ FERME TOUS LES ONGLETS DU TRÔNE ET DE MA COURONNE AVANT DE LANCER.
--   C'est un onglet ouvert qui a causé ceci : après le 0054, l'app a repoussé
--   son cache local — l'état d'AVANT — par-dessus 18 rendez-vous et 18 pièces.
--   Diagnostic fait : 18 revenus en arrière, 0 jamais vus.
--
-- ── POURQUOI ON NE RELANCE PAS LE 0054 ───────────────────────────
-- Le 0054 fait glisser tout ce qui porte un ancien nom. Or 111 lignes portent
-- aujourd'hui « L'Ancrage » LÉGITIMEMENT — elles viennent de « La Dépose ».
-- Les reprendre les ferait descendre un SECOND cran, en Souffle. Même piège
-- côté rituels : 18 pointent `sv-plt-05-sig-c` parce qu'ils ont reculé, mais
-- d'autres le pointent parce qu'ils ont bien glissé. Le nom seul ne permet pas
-- de les distinguer.
--
-- ── CE QUI LES DISTINGUE ─────────────────────────────────────────
-- `repli_0054` est la photo d'AVANT, prise dans la transaction. Une ligne
-- REVENUE EN ARRIÈRE est, au bit près, identique à sa photo. Une ligne qui a
-- BIEN GLISSÉ en diffère. La garde est donc l'égalité stricte avec le repli —
-- pas le nom. C'est ce qui rend ce fichier REJOUABLE sans risque : une fois
-- réparée, une ligne diffère de sa photo et n'est plus jamais reprise.
-- ═══════════════════════════════════════════════════════════════════

-- ── AVANT — les 18 de chaque côté, et rien d'autre. ──────────────
select
  (select count(*) from public.appointments a
     join public.repli_0054_appointments r on r.id = a.id
    where a.data -> 'serviceIds' ?| array['sv-plt-05-sig-c','sv-plt-05-pre-c']
      and a.data -> 'serviceIds' = r.data -> 'serviceIds')                  as rdv_a_reparer,
  (select count(*) from public.invoices i
     join public.repli_0054_invoices r on r.id = i.id
    where i.data -> 'lines' = r.data -> 'lines'
      and exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
                   where l ->> 'label' like '%Ancrage%' or l ->> 'label' like '%Dépose%')) as pieces_a_reparer;
--  Attendu : 18 et 18. Si c'est moins, quelqu'un a rouvert un onglet — ferme
--  tout et relance cette requête avant d'aller plus loin.


begin;

-- La photo de l'état ABÎMÉ, avant de le corriger. On ne réécrit jamais sans
-- filet, même pour réparer.
create table if not exists public.repli_0054c_appointments
  (like public.appointments including all);
alter table public.repli_0054c_appointments enable row level security;
create table if not exists public.repli_0054c_invoices
  (like public.invoices including all);
alter table public.repli_0054c_invoices enable row level security;

insert into public.repli_0054c_appointments
select a.* from public.appointments a
  join public.repli_0054_appointments r on r.id = a.id
where a.data -> 'serviceIds' ?| array['sv-plt-05-sig-c','sv-plt-05-pre-c']
  and a.data -> 'serviceIds' = r.data -> 'serviceIds'
on conflict (id) do nothing;

insert into public.repli_0054c_invoices
select i.* from public.invoices i
  join public.repli_0054_invoices r on r.id = i.id
where i.data -> 'lines' = r.data -> 'lines'
  and exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
               where l ->> 'label' like '%Ancrage%' or l ->> 'label' like '%Dépose%')
on conflict (id) do nothing;

-- ① LE PRIX SE FIGE D'ABORD — le recul a pu emporter le gel avec le reste.
--    Le catalogue PLT·05 n'a pas bougé : le gel recalculé donne les mêmes
--    montants qu'au 0054.
update public.appointments a
set data = a.data || jsonb_build_object('priceXof',
      (select coalesce(sum(coalesce(
         (s.data -> 'prixParLongueur' ->> (a.data ->> 'longueur'))::numeric,
         (s.data ->> 'priceXof')::numeric, 0)), 0)
       from jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
       join public.catalog_services s on s.id = sid))
from public.repli_0054_appointments r
where r.id = a.id
  and a.data -> 'serviceIds' ?| array['sv-plt-05-sig-c','sv-plt-05-pre-c']
  and a.data -> 'serviceIds' = r.data -> 'serviceIds'
  and not (a.data ? 'priceXof')
  and (a.data ->> 'status' = 'honoré' or a.data ? 'invoiceId');

-- ② LES RENDEZ-VOUS REVENUS EN ARRIÈRE REGLISSENT. Un seul cran, garde
--    d'égalité avec la photo — un rituel déjà glissé en diffère et sort.
update public.appointments a
set data = jsonb_set(a.data, '{serviceIds}', (
      select jsonb_agg(
        case sid
          when 'sv-plt-05-pre-c' then 'sv-plt-05-sig-c'
          when 'sv-plt-05-sig-c' then 'sv-plt-05-ess-c'
          else sid
        end order by ord)
      from jsonb_array_elements_text(a.data -> 'serviceIds') with ordinality t(sid, ord)))
from public.repli_0054_appointments r
where r.id = a.id
  and a.data -> 'serviceIds' ?| array['sv-plt-05-sig-c','sv-plt-05-pre-c']
  and a.data -> 'serviceIds' = r.data -> 'serviceIds';

-- ③ LES PIÈCES REVENUES EN ARRIÈRE. Même règle d'argent qu'au 0054 :
--    payée → le NOM seul ; non payée → le prix du nouveau nom.
update public.invoices i
set data = jsonb_set(i.data, '{lines}', (
      select jsonb_agg(
        case
          when l ->> 'label' like '%Dépose%' then
            jsonb_set(
              case when i.data ->> 'status' = 'payée' then l
                   else jsonb_set(l, '{unitXof}', to_jsonb(12000)) end,
              '{label}',
              to_jsonb(replace(l ->> 'label',
                'KLƆKLƆ™ Prestige · Le Shampoing « La Dépose »',
                'KLƆKLƆ™ Signature · Le Shampoing « L’Ancrage »')))
          when l ->> 'label' like '%Ancrage%' then
            jsonb_set(
              case when i.data ->> 'status' = 'payée' then l
                   else jsonb_set(l, '{unitXof}', to_jsonb(8000)) end,
              '{label}',
              to_jsonb(replace(l ->> 'label',
                'KLƆKLƆ™ Signature · Le Shampoing « L’Ancrage »',
                'KLƆKLƆ™ Essentiel · Le Shampoing « Le Souffle »')))
          else l
        end order by ord)
      from jsonb_array_elements(i.data -> 'lines') with ordinality t(l, ord)))
from public.repli_0054_invoices r
where r.id = i.id
  and i.data -> 'lines' = r.data -> 'lines'
  and exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
               where l ->> 'label' like '%Ancrage%' or l ->> 'label' like '%Dépose%');

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLE. Ne rouvre Le Trône qu'APRÈS avoir lu ces quatre nombres.
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data->'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Dépose%')                                    as reste_depose,
  (select count(*) from public.appointments a
    where a.data->'serviceIds' ?| array['sv-plt-05-sig-c','sv-plt-05-pre-c']) as reste_ancien_rdv,
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data->'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Souffle%')                                   as lignes_souffle,
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data->'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Ancrage%')                                   as lignes_ancrage;
--  Attendu : 0 · 0 · 165 (147 + 18) · 111 ou 129 selon ce qui a reculé.
--  Les deux PREMIERS sont ce qui compte : ZÉRO des deux côtés.

-- L'ARGENT REÇU N'A TOUJOURS PAS BOUGÉ. `ecart` doit valoir 0.
select
  coalesce((select sum((l ->> 'unitXof')::numeric * coalesce((l ->> 'qty')::numeric, 1))
     from public.repli_0054_invoices i, jsonb_array_elements(i.data -> 'lines') l
    where i.data ->> 'status' = 'payée'), 0)                                as avant,
  coalesce((select sum((l ->> 'unitXof')::numeric * coalesce((l ->> 'qty')::numeric, 1))
     from public.invoices i, jsonb_array_elements(i.data -> 'lines') l
    where i.id in (select id from public.repli_0054_invoices)
      and i.data ->> 'status' = 'payée'), 0)                                as apres;
--  Attendu : 6820300 et 6820300.

-- Puis SEULEMENT : rouvre Le Trône en Ctrl+Maj+R et relance ce contrôle une
-- dernière fois. Les quatre nombres doivent redire la même chose.

-- ── ROLLBACK du rattrapage seul ──────────────────────────────────
-- begin;
-- insert into public.appointments select * from public.repli_0054c_appointments
-- on conflict (id) do update set data = excluded.data;
-- insert into public.invoices select * from public.repli_0054c_invoices
-- on conflict (id) do update set data = excluded.data;
-- commit;
