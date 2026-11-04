-- ══ TOUTES LES REMISES D'AUJOURD'HUI ANNULÉES · 4 novembre 2026 ═════════
-- « Débrouille-toi pour que toutes les remises d'aujourd'hui soient annulées
-- et que les clients payent le tarif plein », puis, au sélecteur : « Retire
-- la remise, réouvre son règlement et je le ferai. Quand c'est fini,
-- n'envoie rien à la cliente » (Yéman).
--
-- La seule remise restée sur une pièce du jour : 8 000 F sur la Sublimation
-- de la facture F-2026-0769 (RDV p0d9vhe9z8), déjà réglée 45 000 F en
-- espèces. Au tarif plein, 55 000 F : il reste 10 000 F.
--   · la ligne perd sa remise ; la facture revient « envoyée » (le reste se
--     lit des paiements) ; ses RELANCES sont mises en pause : aucun WhatsApp
--     ne part vers la cliente, Yéman règle elle-même ;
--   · le RDV perd la remise de sa ligne et prend le prix plein, 55 000 F.
-- Les lignes d'avant sont gardées dans une table de repli, sous RLS.
-- À passer UNE fois. NE PAS RELANCER.

create table if not exists public.repli_tarif_plein_20261104 as
  select 'invoices'::text as table_source, id, data from public.invoices where id = 'inv-fq3jfqi5k3'
  union all
  select 'appointments'::text, id, data from public.appointments where id = 'p0d9vhe9z8';
alter table public.repli_tarif_plein_20261104 enable row level security;

update public.invoices
   set data = jsonb_set(
                jsonb_set(data, '{lines}',
                  (select jsonb_agg(case when l->>'id' = 'il-qj5jrsi5k1' then l - 'discountXof' else l end order by o)
                     from jsonb_array_elements(data->'lines') with ordinality as t(l, o))),
                '{status}', '"envoyée"')
              || jsonb_build_object('relancesPause', jsonb_build_object('le', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'par', 'Opale, à la demande de Yéman')),
       updated_at = now()
 where id = 'inv-fq3jfqi5k3'
   and data->>'number' = 'F-2026-0769';

update public.appointments
   set data = (data - 'remisesLignes') || jsonb_build_object('priceXof', 55000),
       updated_at = now()
 where id = 'p0d9vhe9z8';
