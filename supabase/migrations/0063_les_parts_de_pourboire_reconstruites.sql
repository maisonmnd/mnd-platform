-- ═══════════════════════════════════════════════════════════════════
-- 0063 — LES PARTS DE POURBOIRE, RECONSTRUITES PAR LE SERVEUR · 19 août 2026
--
-- « Ça ne marche toujours pas — peux-tu le faire toi-même ? »
--
-- Le bouton de l'écran a été bloqué deux fois par le garde-fou des
-- suppressions de masse (réparé depuis, build 20260819141216) ; entre-temps
-- les tentatives ont pu laisser un état mêlé : les VIEILLES parts sans lien
-- (doublons des encaissements refaits du 11 et du 14 août) plus,
-- éventuellement, une génération de parts déjà liées. Ici, LE SERVEUR fait
-- tout, une fois pour toutes :
--
--   ① les parts SANS facture liée s'effacent — chez chacun ;
--   ② chaque facture à pourboire qui n'a PAS encore ses parts liées est
--      repartagée entre l'équipe de sa branche, selon la part de chacun
--      (partPourboire, 1 par défaut, 0 = écarté), en francs entiers dont la
--      somme fait EXACTEMENT le pourboire (méthode du plus fort reste) ;
--   ③ une facture qui a déjà ses parts liées n'est PAS retouchée.
--
-- Identifiants déterministes (tp-r-<facture>-<fiche>) : relancer ce script
-- ne double jamais rien. Le temps réel portera le résultat à chaque poste.
-- ═══════════════════════════════════════════════════════════════════

-- ① Les orphelines s'en vont — elles ne peuvent être rattachées à rien.
delete from public.tips
where data ->> 'invoiceId' is null;

-- ② Le repartage, calculé par le serveur.
with pieces as (
  select
    i.id,
    i.branch_id,
    (i.data ->> 'tipXof')::numeric as tip,
    coalesce(
      nullif(i.data ->> 'clientName', ''),
      (select c.data ->> 'name' from public.clients c where c.id = i.data ->> 'clientId')
    ) as cliente,
    coalesce(i.data -> 'payments' -> 0 ->> 'date', i.data ->> 'date') as jour
  from public.invoices i
  where i.data ->> 'kind' = 'facture'
    and coalesce((i.data ->> 'tipXof')::numeric, 0) > 0
    -- ③ déjà repartagée = intouchée
    and not exists (select 1 from public.tips t where t.data ->> 'invoiceId' = i.id)
),
membres as (
  select
    m.id as staff_id,
    m.branch_id,
    coalesce(nullif(m.data ->> 'partPourboire', '')::numeric, 1) as part
  from public.team m
  where coalesce(nullif(m.data ->> 'partPourboire', '')::numeric, 1) > 0
),
calcul as (
  select
    p.id as inv_id, p.tip, p.cliente, p.jour,
    m.staff_id, m.part,
    floor(p.tip * m.part / sum(m.part) over (partition by p.id)) as bas,
    p.tip * m.part / sum(m.part) over (partition by p.id)
      - floor(p.tip * m.part / sum(m.part) over (partition by p.id)) as reste
  from pieces p
  join membres m on m.branch_id = p.branch_id
),
avec_rang as (
  select c.*,
    row_number() over (partition by c.inv_id order by c.reste desc, c.staff_id) as rang,
    c.tip - sum(c.bas) over (partition by c.inv_id) as manque
  from calcul c
),
parts as (
  select inv_id, tip, cliente, jour, staff_id,
    (bas + case when rang <= manque then 1 else 0 end)::int as montant
  from avec_rang
)
insert into public.tips (id, branch_id, data)
select
  'tp-r-' || inv_id || '-' || staff_id,
  null,
  jsonb_build_object(
    'id', 'tp-r-' || inv_id || '-' || staff_id,
    'staffId', staff_id,
    'amountXof', montant,
    'date', jour,
    'note', cliente,
    'invoiceId', inv_id
  )
from parts
where montant > 0
on conflict (id) do nothing;

-- ── LES CONTRÔLES — chacun peut échouer ─────────────────────────────
-- A. Plus AUCUNE part sans facture : attendu 0.
select count(*) as orphelines_restantes
from public.tips where data ->> 'invoiceId' is null;

-- B. Chaque facture à pourboire a ses parts, et leur somme FAIT le pourboire.
--    Attendu : une ligne par facture, ecart = 0 partout.
select
  i.data ->> 'number' as facture,
  (i.data ->> 'tipXof')::numeric as pourboire,
  coalesce(sum((t.data ->> 'amountXof')::numeric), 0) as somme_des_parts,
  (i.data ->> 'tipXof')::numeric - coalesce(sum((t.data ->> 'amountXof')::numeric), 0) as ecart
from public.invoices i
left join public.tips t on t.data ->> 'invoiceId' = i.id
where i.data ->> 'kind' = 'facture' and coalesce((i.data ->> 'tipXof')::numeric, 0) > 0
group by i.id, i.data
order by i.data ->> 'number';

-- C. Ce que chacun touche, ligne à ligne — la vérité de « Mon mois ».
select
  coalesce(m.data ->> 'name', t.data ->> 'staffId') as membre,
  t.data ->> 'date' as jour,
  t.data ->> 'note' as de_la_part_de,
  (t.data ->> 'amountXof')::numeric as part
from public.tips t
left join public.team m on m.id = t.data ->> 'staffId'
order by 1, 2;
