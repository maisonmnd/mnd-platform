-- ═══════════════════════════════════════════════════════════════════
-- 0054 — LES KLƆKLƆ™ GLISSENT D'UN CRAN
--        (à coller tel quel dans Supabase → SQL Editor. RIEN À
--         DÉCOMMENTER — motif du 0052b.)
--
-- ── CE QU'IL FAIT ────────────────────────────────────────────────
--   « La Dépose »   (Prestige, 18 000)  →  « L'Ancrage »  (Signature, 12 000)
--   « L'Ancrage »   (Signature, 12 000) →  « Le Souffle » (Essentiel,  8 000)
--
-- D'UN SEUL MOUVEMENT, jamais en deux temps : appliqué l'un après l'autre, un
-- Prestige deviendrait Signature puis Essentiel — deux crans au lieu d'un. Tout
-- passe donc par UN SEUL `case`, évalué une fois par ligne.
--
-- Sur LES DEUX SURFACES, sinon le repli ne tient pas : les rendez-vous ET les
-- pièces. Le carnet qui dirait Signature quand la facture dit Essentiel serait
-- réécrit à l'ancien au premier réenregistrement du rituel
-- (`alignerFacturesDuRituel`).
--
-- ── L'ARGENT — décision de Yéman, 17 août ────────────────────────
-- PIÈCE PAYÉE : elle atteste ce qui est entré. Seul le NOM change ; ni le
-- montant de la ligne, ni le total, ni le chiffre d'affaires ne bougent.
-- PIÈCE ENVOYÉE OU BROUILLON : rien n'est entré, c'est une réclamation — elle
-- doit demander le juste prix. La ligne prend donc le prix catalogue du
-- nouveau nom (repli « court » ; une pièce à la longueur près se reconforme
-- au réenregistrement du rituel).
-- RENDEZ-VOUS : ceux qui portent déjà leur prix ne bougent pas ; ceux qui le
-- relisent au catalogue et qui sont HONORÉS ou FACTURÉS se le FIGENT AVANT le
-- repli — sans quoi un rituel Prestige à 18 000 F se relirait 8 000 F et la
-- Synthèse perdrait la différence. Les rituels À VENIR, eux, suivent le
-- nouveau tarif : c'est bien ce geste-là qu'elle recevra.
--
-- ── CE QUI N'EST PAS TOUCHÉ ──────────────────────────────────────
--   · les trois fiches du catalogue restent en place — rien n'est supprimé ;
--   · aucune composition de forfait ne cite Signature ni Prestige (vérifié le
--     17 août : les deux forfaits concernés pointent déjà l'Essentiel) ;
--   · les libellés composites (« A + B », « Règlement · … ») sont réécrits eux
--     aussi : le remplacement porte sur le TEXTE, où qu'il soit dans la ligne.
-- ═══════════════════════════════════════════════════════════════════

-- ── APERÇU — ne modifie RIEN. À lire d'abord. ────────────────────
select 'rendez-vous' as surface,
       count(*) filter (where a.data -> 'serviceIds' ? 'sv-plt-05-pre-c')            as prestige,
       count(*) filter (where a.data -> 'serviceIds' ? 'sv-plt-05-sig-c')            as signature,
       count(*) filter (where a.data ->> 'status' = 'honoré')                        as dont_honores,
       count(*) filter (where not (a.data ? 'priceXof'))                             as sans_prix_fige
from public.appointments a
where a.data -> 'serviceIds' ?| array['sv-plt-05-sig-c', 'sv-plt-05-pre-c'];

select i.data ->> 'status'                                   as statut,
       count(distinct i.id)                                  as pieces,
       count(*) filter (where l ->> 'label' like '%Ancrage%') as lignes_ancrage,
       count(*) filter (where l ->> 'label' like '%Dépose%')  as lignes_depose,
       sum((l ->> 'unitXof')::numeric)                        as montant_des_lignes
from public.invoices i, jsonb_array_elements(coalesce(i.data -> 'lines', '[]'::jsonb)) l
where l ->> 'label' like '%Ancrage%' or l ->> 'label' like '%Dépose%'
group by 1 order by 1;


-- ═══════════════════════════════════════════════════════════════════
-- LE REPLI. Ferme d'abord tous les onglets du Trône et de Ma Couronne.
-- ═══════════════════════════════════════════════════════════════════

begin;

create table if not exists public.repli_0054_appointments
  (like public.appointments including all);
alter table public.repli_0054_appointments enable row level security;
create table if not exists public.repli_0054_invoices
  (like public.invoices including all);
alter table public.repli_0054_invoices enable row level security;

insert into public.repli_0054_appointments
select * from public.appointments a
where a.data -> 'serviceIds' ?| array['sv-plt-05-sig-c', 'sv-plt-05-pre-c']
on conflict (id) do nothing;

insert into public.repli_0054_invoices
select * from public.invoices i
where exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines', '[]'::jsonb)) l
               where l ->> 'label' like '%Ancrage%' or l ->> 'label' like '%Dépose%')
on conflict (id) do nothing;

-- ① LE PRIX SE FIGE AVANT LE REPLI, sur les rituels dont l'argent est fait.
update public.appointments a
set data = a.data || jsonb_build_object('priceXof',
      (select coalesce(sum(coalesce(
         (s.data -> 'prixParLongueur' ->> (a.data ->> 'longueur'))::numeric,
         (s.data ->> 'priceXof')::numeric, 0)), 0)
       from jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
       join public.catalog_services s on s.id = sid))
where a.data -> 'serviceIds' ?| array['sv-plt-05-sig-c', 'sv-plt-05-pre-c']
  and not (a.data ? 'priceXof')
  and (a.data ->> 'status' = 'honoré' or a.data ? 'invoiceId');

-- ② LES RENDEZ-VOUS GLISSENT — élément par élément, ordre et longueur de la
--    liste préservés (le tableau `mains` lui est parallèle).
update public.appointments a
set data = jsonb_set(a.data, '{serviceIds}', (
      select jsonb_agg(
        case sid
          when 'sv-plt-05-pre-c' then 'sv-plt-05-sig-c'
          when 'sv-plt-05-sig-c' then 'sv-plt-05-ess-c'
          else sid
        end order by ord)
      from jsonb_array_elements_text(a.data -> 'serviceIds') with ordinality t(sid, ord)))
where a.data -> 'serviceIds' ?| array['sv-plt-05-sig-c', 'sv-plt-05-pre-c'];

-- ③ LES PIÈCES — le NOM partout, le MONTANT seulement sur ce qui n'est pas payé.
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
where exists (select 1 from jsonb_array_elements(coalesce(i.data -> 'lines', '[]'::jsonb)) l
               where l ->> 'label' like '%Ancrage%' or l ->> 'label' like '%Dépose%');

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLES — à lancer juste après.
-- ═══════════════════════════════════════════════════════════════════

-- A. Plus aucune trace des deux anciens. ZÉRO partout.
select (select count(*) from public.appointments a
         where a.data -> 'serviceIds' ?| array['sv-plt-05-sig-c','sv-plt-05-pre-c'])  as rdv_restants,
       (select count(*) from public.invoices i,
               jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
         where l ->> 'label' like '%Dépose%')                                          as lignes_depose,
       (select count(*) from public.invoices i,
               jsonb_array_elements(coalesce(i.data -> 'lines','[]'::jsonb)) l
         where l ->> 'label' like '%Ancrage%'
           and i.data ->> 'status' <> 'payée')                                         as ancrage_non_payees;
--    `ancrage_non_payees` doit être ZÉRO : sur une pièce NON payée, l'Ancrage
--    ne peut venir que d'une Dépose repliée, et elle porte alors 12 000 F.

-- B. L'ARGENT REÇU N'A PAS BOUGÉ — total des pièces PAYÉES touchées,
--    avant et après. Les deux nombres doivent être ÉGAUX.
select (select sum((l ->> 'unitXof')::numeric * (l ->> 'qty')::numeric)
          from public.repli_0054_invoices i, jsonb_array_elements(i.data -> 'lines') l
         where i.data ->> 'status' = 'payée')                                          as avant,
       (select sum((l ->> 'unitXof')::numeric * (l ->> 'qty')::numeric)
          from public.invoices i, jsonb_array_elements(i.data -> 'lines') l
         where i.id in (select id from public.repli_0054_invoices)
           and i.data ->> 'status' = 'payée')                                          as apres;

-- C. Aucun rendez-vous ne pointe vers une prestation disparue. ZÉRO ligne.
select a.id, sid as prestation_inconnue
from public.appointments a,
     jsonb_array_elements_text(coalesce(a.data -> 'serviceIds', '[]'::jsonb)) sid
left join public.catalog_services s on s.id = sid
where s.id is null;

-- D. Puis dans Le Trône, après rechargement (Ctrl+Maj+R) :
--    Synthèse → Chiffre par maison : tous les mois INCHANGÉS.


-- ── ROLLBACK — remet tout en place ───────────────────────────────
-- begin;
-- insert into public.appointments select * from public.repli_0054_appointments
-- on conflict (id) do update set data = excluded.data;
-- insert into public.invoices select * from public.repli_0054_invoices
-- on conflict (id) do update set data = excluded.data;
-- commit;

-- ── QUAND TOUT EST VÉRIFIÉ ───────────────────────────────────────
-- drop table public.repli_0054_appointments;
-- drop table public.repli_0054_invoices;
