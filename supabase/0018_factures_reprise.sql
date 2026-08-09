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
-- ── LE NET SE CALCULE COMME `apptNetXof`, PAS AUTREMENT ──────────
-- Trois mécanismes sont nés APRÈS la première écriture de ce fichier ; les
-- ignorer casserait l'invariant ci-dessus :
--   · le FORFAIT PONCTUEL (`forfait.totalXof`) FAIT FOI — ni le pourcentage ni
--     la remise en CFA ne s'y ajoutent (on ne remise pas un prix négocié) ;
--   · le PRIX PAR LONGUEUR (`prixParLongueur[longueur]`) l'emporte sur le prix
--     de repli du catalogue, quand le rituel ne porte pas de prix figé ;
--   · le JOURNAL DES VERSEMENTS (`payments[]`) fait foi sur `paidXof` dès qu'il
--     existe — c'est lui qui dit si la pièce est soldée.
--
-- ── L'ACOMPTE NE S'ENCAISSE QU'UNE FOIS ──────────────────────────
-- Un acompte confirmé compte DÉJÀ au registre des encaissements par lui-même
-- (`buildReceipts` ③). Une facture payée qui le contiendrait sans le déclarer
-- créditerait la caisse deux fois du même argent : `depositCreditXof` le retire
-- de la caisse SANS toucher au total de la pièce — le CA reste juste.
--
-- ── CE QUI EST ÉCARTÉ ────────────────────────────────────────────
--   · les séances 2..N d'une série — elles valent 0, déjà réglées par la 1ʳᵉ ;
--   · les rituels couverts par un abonnement ou un forfait — déjà payés ;
--   · tout rituel dont le net tombe à 0 — il n'y a rien à facturer ;
--   · ceux dont aucune prestation n'est retrouvée au catalogue (pas de lignes) ;
--   · ceux datés du FUTUR — une pièce comptable à venir est irrecevable.
--
-- ── SÉRIE DÉDIÉE ─────────────────────────────────────────────────
-- Les numéros vont de MND-R-0001 à MND-R-0369 : une série distincte de celle
-- du comptoir, pour qu'aucune facture de reprise ne se confonde avec une pièce
-- émise par Le Trône, ni ne consomme un numéro de la série vivante.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU — ne modifie RIEN. À lire avant l'étape 2. ───
-- Le même calcul que l'étape 2, plus le compte de ce qui est écarté et des
-- pièges. Les cinq dernières colonnes doivent être lues AVANT de continuer.
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
         -- Prix de la prestation POUR CE RITUEL : la longueur travaillée
         -- l'emporte sur le prix de repli du catalogue (`svcPriceForAppt`).
         (select coalesce(sum(coalesce(
                   nullif(s.data -> 'prixParLongueur' ->> (c.data ->> 'longueur'), '')::numeric,
                   (s.data ->> 'priceXof')::numeric)), 0)
            from jsonb_array_elements_text(coalesce(c.data -> 'serviceIds', '[]'::jsonb)) sid
            join public.catalog_services s on s.id = sid) as somme_lignes,
         (select count(*)
            from jsonb_array_elements_text(coalesce(c.data -> 'serviceIds', '[]'::jsonb)) sid
            join public.catalog_services s on s.id = sid) as n_lignes
  from cible c
),
brut as (
  select k.*,
         coalesce(nullif(k.data ->> 'priceXof', '')::numeric, k.somme_lignes) as brut
  from calc k
),
net as (
  select b.*,
         -- `apptNetXof` : le forfait ponctuel fait foi, sinon % puis CFA.
         case when b.data ? 'forfait'
              then greatest(0, round((b.data -> 'forfait' ->> 'totalXof')::numeric))
              else greatest(0, round(b.brut * (1 - coalesce(nullif(b.data ->> 'discountPct', '')::numeric, 0) / 100))
                              - coalesce(nullif(b.data ->> 'discountXof', '')::numeric, 0))
         end as net_xof
  from brut b
)
select count(*) filter (where net_xof > 0 and n_lignes > 0
                          and n.data ->> 'date' <= to_char(now(), 'YYYY-MM-DD'))  as factures_a_creer,
       sum(net_xof) filter (where net_xof > 0 and n_lignes > 0
                              and n.data ->> 'date' <= to_char(now(), 'YYYY-MM-DD')) as chiffre_couvert,
       count(*) filter (where net_xof > 0 and n_lignes > 0 and somme_lignes > net_xof) as avec_remise_de_reprise,
       count(*) filter (where net_xof > 0 and n_lignes > 0 and somme_lignes < net_xof) as avec_ligne_d_ajustement,
       count(*) filter (where net_xof > 0 and n_lignes > 0 and somme_lignes = net_xof) as sans_ajustement,
       min(n.data ->> 'date') filter (where net_xof > 0 and n_lignes > 0)          as du,
       max(n.data ->> 'date') filter (where net_xof > 0 and n_lignes > 0
                                        and n.data ->> 'date' <= to_char(now(), 'YYYY-MM-DD')) as au,
       -- ── CE QUI EST ÉCARTÉ, et pourquoi ──
       count(*) filter (where net_xof = 0)                                        as ecarte_net_zero,
       count(*) filter (where net_xof > 0 and n_lignes = 0)                       as ecarte_sans_lignes,
       count(*) filter (where net_xof > 0 and n_lignes > 0
                          and n.data ->> 'date' > to_char(now(), 'YYYY-MM-DD'))    as ecarte_date_future,
       -- ── LES PIÈGES : combien de lignes dépendent des correctifs ──
       count(*) filter (where net_xof > 0 and n_lignes > 0 and n.data ? 'forfait') as dont_forfait,
       count(*) filter (where net_xof > 0 and n_lignes > 0
                          and jsonb_array_length(coalesce(n.data -> 'payments', '[]'::jsonb)) > 0) as dont_journal,
       count(*) filter (where net_xof > 0 and n_lignes > 0
                          and coalesce((n.data ->> 'depositConfirmed')::boolean, false))           as dont_acompte,
       count(*) filter (where net_xof > 0 and n_lignes > 0
                          and n.data ? 'longueur' and not (n.data ? 'priceXof'))   as dont_longueur,
       (select count(*) from public.invoices where id like 'inv-rep-%')            as deja_creees
from net n;


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
--          -- Le prix de la longueur travaillée l'emporte sur le prix de repli
--          -- (`svcPriceForAppt`). La MÊME expression sert aux lignes ci-dessous :
--          -- sans quoi la somme des lignes ne vaudrait pas `somme_lignes` et la
--          -- remise de reprise tomberait à côté.
--          (select coalesce(sum(coalesce(
--                    nullif(s.data -> 'prixParLongueur' ->> (c.data ->> 'longueur'), '')::numeric,
--                    (s.data ->> 'priceXof')::numeric)), 0)
--             from jsonb_array_elements_text(coalesce(c.data -> 'serviceIds', '[]'::jsonb)) sid
--             join public.catalog_services s on s.id = sid) as somme_lignes,
--          (select jsonb_agg(jsonb_build_object(
--                    'id',          'l-' || c.id || '-' || t.ord,
--                    'label',       s.data ->> 'name',
--                    'qty',         1,
--                    'unitXof',     coalesce(
--                                     nullif(s.data -> 'prixParLongueur' ->> (c.data ->> 'longueur'), '')::numeric,
--                                     (s.data ->> 'priceXof')::numeric),
--                    'discountPct', 0) order by t.ord)
--             from jsonb_array_elements_text(coalesce(c.data -> 'serviceIds', '[]'::jsonb))
--                    with ordinality as t(sid, ord)
--             join public.catalog_services s on s.id = t.sid) as lignes
--   from cible c
-- ),
-- brut as (
--   select k.*,
--          coalesce(nullif(k.data ->> 'priceXof', '')::numeric, k.somme_lignes) as brut
--   from calc k
--   where k.lignes is not null
-- ),
-- net as (
--   select b.*,
--          -- `apptNetXof` a l'identique : UN FORFAIT PONCTUEL FAIT FOI et
--          -- remplace tout le calcul — on ne remise pas un prix deja negocie.
--          case when b.data ? 'forfait'
--               then greatest(0, round((b.data -> 'forfait' ->> 'totalXof')::numeric))
--               else greatest(0, round(b.brut * (1 - coalesce(nullif(b.data ->> 'discountPct', '')::numeric, 0) / 100))
--                               - coalesce(nullif(b.data ->> 'discountXof', '')::numeric, 0))
--          end as net_xof,
--          -- CE QUI A REELLEMENT ETE ENCAISSE : le regle du rendez-vous, acompte
--          -- confirme compris. C'est lui qui decide du statut de la piece.
--          -- `apptPaidXof` : le JOURNAL fait foi des qu'il existe ; `paidXof`
--          -- n'est que le repli des rendez-vous d'avant le journal.
--          (case when jsonb_array_length(coalesce(b.data -> 'payments', '[]'::jsonb)) > 0
--                then (select coalesce(sum((p ->> 'amountXof')::numeric), 0)
--                        from jsonb_array_elements(b.data -> 'payments') p)
--                else coalesce(nullif(b.data ->> 'paidXof', '')::numeric, 0) end)
--          + case when coalesce((b.data ->> 'depositConfirmed')::boolean, false)
--                 then coalesce(nullif(b.data ->> 'depositXof', '')::numeric, 0) else 0 end as regle,
--          -- L'ACOMPTE CONFIRME COMPTE DEJA EN CAISSE PAR LUI-MEME. Le declarer
--          -- ici l'empeche d'etre encaisse une seconde fois par la piece, sans
--          -- rien retrancher a son total : le chiffre d'affaires ne bouge pas.
--          case when coalesce((b.data ->> 'depositConfirmed')::boolean, false)
--               then coalesce(nullif(b.data ->> 'depositXof', '')::numeric, 0) else 0 end as acompte
--   from brut b
-- ),
-- pret as (
--   select n.*,
--          row_number() over (order by n.data ->> 'date', n.id) as rang
--   from net n
--   where n.net_xof > 0
--     -- Un rituel date du FUTUR n'a pas eu lieu : une piece comptable a une
--     -- date a venir est irrecevable. Un cas connu, prepaye en juillet pour le
--     -- 8 aout — a corriger au Carnet, pas ici. (Depot public : pas de nom.)
--     and n.data ->> 'date' <= to_char(now(), 'YYYY-MM-DD')
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
--            -- (prix figé au-dessus du catalogue, ou forfait négocié plus haut) :
--            -- sans elle, le total ne pourrait pas atteindre le net.
--            'lines',     case when p.net_xof > p.somme_lignes
--                              then p.lignes || jsonb_build_array(jsonb_build_object(
--                                     'id', 'l-' || p.id || '-adj', 'label', 'Ajustement de reprise',
--                                     'qty', 1, 'unitXof', p.net_xof - p.somme_lignes, 'discountPct', 0))
--                              else p.lignes end,
--            'globalDiscountPct', 0,
--            -- …et remise quand il vaut MOINS : le total redescend au net.
--            'globalDiscountXof', greatest(0, p.somme_lignes - p.net_xof),
--            'theme',     'Aube',
--            -- LE STATUT DIT LA VERITE. Solde -> payee, elle compte au chiffre.
--            -- Non solde -> envoyee, elle rejoint tes impayes et cesse de
--            -- compter. Ce n'est PAS une perte : ces sommes n'etaient jamais
--            -- entrees en caisse, et le carnet les comptait quand meme.
--            'status',    case when p.regle >= p.net_xof then 'payée' else 'envoyée' end,
--            'note',      'Pièce de reprise — rituel honoré avant la mise en service du Trône.'
--          ) || case when coalesce(p.data ->> 'clientId', '') = ''
--                    then jsonb_build_object('clientName', coalesce(p.data ->> 'clientName', 'Cliente de passage'))
--                    else '{}'::jsonb end
--            || case when p.acompte > 0
--                    then jsonb_build_object('depositCreditXof', least(p.acompte, p.net_xof))
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
