-- ═══════════════════════════════════════════════════════════════════
-- 0014 — VÈKPÈ™ Nano sert désormais aussi le calibre Galaxy
--        (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- Au-delà de 600 locks, la couronne existe — une cliente en porte 700 — mais
-- aucune création ne la servait : le filtre par calibre la faisait disparaître
-- de la Caisse, de Ma Couronne et de la modale de rendez-vous. Une création de
-- 770 000 F était impossible à vendre.
--
-- Plutôt qu'une sixième ligne au catalogue, la ligne Nano reçoit un second
-- plancher. Le prix reste au lock (1 100 F), et le plancher Galaxy prend le
-- relais là où le Nano s'arrête : 600 × 1 100 = 660 000 F. Aucune rupture de
-- prix au passage de la frontière ; à 700 locks, la création vaut 770 000 F.
--
-- Le code lit les calibres servis dans les clés de `priceFloors` : deux
-- planchers = deux calibres servis, et pas les autres. La ligne Nano ne sera
-- donc pas proposée à une cliente Jumbo.
-- ═══════════════════════════════════════════════════════════════════

update public.catalog_services
set data = jsonb_set(data, '{priceFloors}', '{"cal-nano":500000,"cal-galaxy":660000}'::jsonb)
where id = 'sv-atl-i-nan';

-- Vérification : la ligne doit porter les deux planchers.
select id,
       data->>'name'        as prestation,
       data->>'ratePerLock' as tarif_au_lock,
       data->'priceFloors'  as planchers
from public.catalog_services
where id = 'sv-atl-i-nan';
