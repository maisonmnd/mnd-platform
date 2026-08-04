-- ═══════════════════════════════════════════════════════════════════
-- 0018 — Factures de reprise : une pièce comptable par rituel honoré
--        (à coller dans Supabase → SQL Editor). EN DEUX TEMPS.
--
-- 369 rendez-vous honorés n'ont aucune facture. Ce n'est pas une perte :
-- l'ancien ERP ne facturait pas les prestations, il enregistrait des rituels et
-- des paiements. Le chiffre d'affaires est donc juste — ce sont les documents
-- qui manquent, et avec eux la possibilité de rééditer un reçu.
--
-- ── L'INVARIANT QUI COMMANDE TOUT ────────────────────────────────
-- Ces rituels comptent aujourd'hui PAR LE CARNET. Dès qu'une facture leur est
-- rattachée, ils comptent PAR ELLE. Si un seul montant diffère, le chiffre
-- d'affaires bouge — et sur 369 lignes, personne ne saurait plus quel chiffre
-- est le vrai. Le 4 août, rattacher 7 factures de ventes annexes a fait perdre
-- 330 000 F en un clic : la démonstration est faite.
--
-- Chaque facture est donc construite pour valoir EXACTEMENT le net du rendez-
-- vous : les prestations en lignes détaillées au prix catalogue, puis une
-- « remise de reprise » qui ramène le total au franc près. Quand le rituel vaut
-- plus que ses lignes (prix figé plus haut), une ligne d'ajustement complète.
--
-- ── CE QUI EST ÉCARTÉ ────────────────────────────────────────────
--   · les séances 2..N d'une série — elles valent 0, déjà réglées par la 1ʳᵉ ;
--   · les rituels couverts par un abonnement ou un forfait — déjà payés ;
--   · tout rituel dont le net tombe à 0 — il n'y a rien à facturer.
--
-- ── SÉRIE DÉDIÉE ─────────────────────────────────────────────────
-- Les numéros vont de MND-R-0001 à MND-R-0369 : une série distincte de celle
-- du comptoir, pour qu'aucune facture de reprise ne se confonde avec une pièce
-- émise par Le Trône, ni ne consomme un numéro de la série vivante.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU — ne modifie RIEN. À lire avant l'étape 2. ───
with cible as (
  select a.id, a.branch_id, a.data
  from public.appointments a
  where a.data ->> 'status' = 'honoré'
    and coalesce(a.data ->> 'invoiceId', '') = ''
    and coalesce(nullif(a.data ->> 'seriesIndex', '')::int, 1) <= 1
    and coalesce((a.data ->> 'coveredBySub')::boolean, false) = false
),
calc as (
  select c.*,
         (select coalesce(sum((s.data ->> 'priceXof')::numeric), 0)
            from jsonb_array_elements_text(coalesce(c.data -> 'serviceIds', '[]'::jsonb)) sid
            join public.catalog_services s on s.id = sid) as somme_lignes,
         coalesce(nullif(c.data ->> 'priceXof', '')::numeric,
                  (select coalesce(sum((s.data ->> 'priceXof')::numeric), 0)
                     from jsonb_array_elements_text(coalesce(c.data -> 'serviceIds', '[]'::jsonb)) sid
                     join public.catalog_services s on s.id = sid)) as brut
  from cible c
),
net as (
  select k.*,
         greatest(0, round(k.brut * (1 - coalesce(nullif(k.data ->> 'discountPct', '')::numeric, 0) / 100))
                   - coalesce(nullif(k.data ->> 'discountXof', '')::numeric, 0)) as net_xof
  from calc k
)
select count(*)                                            as factures_a_creer,
       sum(net_xof)                                         as chiffre_couvert,
       count(*) filter (where somme_lignes > net_xof)       as avec_remise_de_reprise,
       count(*) filter (where somme_lignes < net_xof)       as avec_ligne_d_ajustement,
       count(*) filter (where somme_lignes = net_xof)       as sans_ajustement,
       min(n.data ->> 'date')                               as du,
       max(n.data ->> 'date')                               as au
from net n
where net_xof > 0;


-- ══════════════════════════════════════════════════════════════════
-- ── ÉTAPE 2 · CRÉATION. Décommenter le bloc et l'exécuter. ───────
--
-- Tout se fait dans UNE transaction : si quoi que ce soit échoue, rien n'est
-- écrit. Le rollback est fourni en fin de fichier.
-- ══════════════════════════════════════════════════════════════════

-- begin;
--
-- with cible as (
--   select a.id, a.branch_id, a.data
--   from public.appointments a
--   where a.data ->> 'status' = 'honoré'
--     and coalesce(a.data ->> 'invoiceId', '') = ''
--     and coalesce(nullif(a.data ->> 'seriesIndex', '')::int, 1) <= 1
--     and coalesce((a.data ->> 'coveredBySub')::boolean, false) = false
-- ),
-- calc as (
--   select c.*,
--          (select coalesce(sum((s.data ->> 'priceXof')::numeric), 0)
--             from jsonb_array_elements_text(coalesce(c.data -> 'serviceIds', '[]'::jsonb)) sid
--             join public.catalog_services s on s.id = sid) as somme_lignes,
--          coalesce(nullif(c.data ->> 'priceXof', '')::numeric,
--                   (select coalesce(sum((s.data ->> 'priceXof')::numeric), 0)
--                      from jsonb_array_elements_text(coalesce(c.data -> 'serviceIds', '[]'::jsonb)) sid
--                      join public.catalog_services s on s.id = sid)) as brut,
--          (select jsonb_agg(jsonb_build_object(
--                    'id',          'l-' || c.id || '-' || t.ord,
--                    'label',       s.data ->> 'name',
--                    'qty',         1,
--                    'unitXof',     (s.data ->> 'priceXof')::numeric,
--                    'discountPct', 0) order by t.ord)
--             from jsonb_array_elements_text(coalesce(c.data -> 'serviceIds', '[]'::jsonb))
--                    with ordinality as t(sid, ord)
--             join public.catalog_services s on s.id = t.sid) as lignes
--   from cible c
-- ),
-- net as (
--   select k.*,
--          greatest(0, round(k.brut * (1 - coalesce(nullif(k.data ->> 'discountPct', '')::numeric, 0) / 100))
--                    - coalesce(nullif(k.data ->> 'discountXof', '')::numeric, 0)) as net_xof
--   from calc k
--   where k.lignes is not null
-- ),
-- pret as (
--   select n.*,
--          row_number() over (order by n.data ->> 'date', n.id) as rang
--   from net n
--   where n.net_xof > 0
-- ),
-- cree as (
--   insert into public.invoices (id, branch_id, data)
--   select 'inv-rep-' || p.id,
--          p.branch_id,
--          jsonb_build_object(
--            'id',        'inv-rep-' || p.id,
--            'branchId',  p.branch_id,
--            'kind',      'facture',
--            'number',    'MND-R-' || lpad(p.rang::text, 4, '0'),
--            'clientId',  coalesce(p.data ->> 'clientId', ''),
--            'date',      p.data ->> 'date',
--            -- Ligne d'ajustement quand le rituel vaut PLUS que ses lignes
--            -- (prix figé au-dessus du catalogue) : sans elle, le total ne
--            -- pourrait pas atteindre le net.
--            'lines',     case when p.net_xof > p.somme_lignes
--                              then p.lignes || jsonb_build_array(jsonb_build_object(
--                                     'id', 'l-' || p.id || '-adj', 'label', 'Ajustement de reprise',
--                                     'qty', 1, 'unitXof', p.net_xof - p.somme_lignes, 'discountPct', 0))
--                              else p.lignes end,
--            'globalDiscountPct', 0,
--            -- …et remise quand il vaut MOINS : le total redescend au net.
--            'globalDiscountXof', greatest(0, p.somme_lignes - p.net_xof),
--            'theme',     'Aube',
--            'status',    'payée',
--            'note',      'Pièce de reprise — rituel honoré avant la mise en service du Trône.'
--          ) || case when coalesce(p.data ->> 'clientId', '') = ''
--                    then jsonb_build_object('clientName', coalesce(p.data ->> 'clientName', 'Cliente de passage'))
--                    else '{}'::jsonb end
--   from pret p
--   returning id
-- )
-- update public.appointments a
-- set data = jsonb_set(a.data, '{invoiceId}', to_jsonb('inv-rep-' || a.id))
-- where 'inv-rep-' || a.id in (select id from cree);
--
-- commit;


-- ── VÉRIFICATION après l'étape 2 ─────────────────────────────────
-- Les deux totaux doivent être IDENTIQUES au franc près.
--
-- select
--   (select count(*) from public.invoices where id like 'inv-rep-%')            as factures_creees,
--   (select coalesce(sum(
--             greatest(0, round((select coalesce(sum((l ->> 'qty')::numeric * (l ->> 'unitXof')::numeric
--                                  * (1 - coalesce((l ->> 'discountPct')::numeric, 0) / 100)), 0)
--                                 from jsonb_array_elements(i.data -> 'lines') l))
--                       - coalesce(nullif(i.data ->> 'globalDiscountXof', '')::numeric, 0))), 0)
--      from public.invoices i where i.id like 'inv-rep-%')                       as total_des_factures;


-- ── ROLLBACK — défait entièrement l'étape 2 ──────────────────────
--
-- begin;
-- update public.appointments a
-- set data = a.data - 'invoiceId'
-- where a.data ->> 'invoiceId' like 'inv-rep-%';
-- delete from public.invoices where id like 'inv-rep-%';
-- commit;
