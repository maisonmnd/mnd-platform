-- ═══════════════════════════════════════════════════════════════════
-- 0055 — LE MODULE DE RECONSTRUCTION RETROUVE SA LONGUEUR
--        (à coller tel quel. RIEN À DÉCOMMENTER.)
--
-- « GBÌGBÌ™ Module · Le Soin Reconstruction » (sv-plt-40-m) se vend à
-- 15 000 F quelle que soit la tête. Un module qui referme la fibre sur une
-- longueur ne demande pas le même temps ni la même matière que sur un carré :
-- il lui manquait sa grille.
--
--   Court ................. 15 000 F   ← le prix d'aujourd'hui, en plancher
--   Mi-Long ............... 20 000 F
--   Long / haute densité .. 25 000 F
--
-- Décision de Yéman, 17 août : garder le prix d'aujourd'hui en plancher —
-- même règle que pour l'atelier VÈKPÈ™. Aucune cliente ne paie plus cher
-- qu'hier pour la longueur qu'elle avait hier.
--
-- ── CE QUE ÇA CHANGE DANS LE MOTEUR ──────────────────────────────
-- Une grille par longueur est un prix ÉCRIT, pas un calcul : elle neutralise
-- le coefficient de tranche (`personalPriceXof`) et sort au franc près, sans
-- arrondi au 500 F. Le Juste Prix personnel, lui, continue de s'appliquer —
-- c'est un accord par CLIENTE, pas une taille.
--
-- ── CE QUI NE BOUGE PAS ──────────────────────────────────────────
-- Aucune facture, aucun rendez-vous. Un rituel passé fige sa longueur et,
-- quand il est honoré, son prix : relire mars ne le retarife pas.
-- `priceXof` reste 15 000 — c'est le repli quand la longueur est inconnue.
-- ═══════════════════════════════════════════════════════════════════

-- ── AVANT — ce que la fiche dit aujourd'hui. ─────────────────────
select id, data ->> 'name' as nom, data ->> 'priceXof' as prix,
       data -> 'prixParLongueur' as grille
from public.catalog_services where id = 'sv-plt-40-m';

begin;

create table if not exists public.repli_0055_catalog_services
  (like public.catalog_services including all);
alter table public.repli_0055_catalog_services enable row level security;

insert into public.repli_0055_catalog_services
select * from public.catalog_services where id = 'sv-plt-40-m'
on conflict (id) do nothing;

update public.catalog_services
set data = data || jsonb_build_object(
      'prixParLongueur', jsonb_build_object(
        'court',   15000,
        'mi-long', 20000,
        'long',    25000))
where id = 'sv-plt-40-m';

commit;

-- ── APRÈS — la grille doit être là, et le prix de repli inchangé. ─
select id, data ->> 'name'                          as nom,
       (data ->> 'priceXof')::int                   as repli,
       (data -> 'prixParLongueur' ->> 'court')::int as court,
       (data -> 'prixParLongueur' ->> 'mi-long')::int as mi_long,
       (data -> 'prixParLongueur' ->> 'long')::int  as long
from public.catalog_services where id = 'sv-plt-40-m';
--  Attendu : 15000 | 15000 | 20000 | 25000

-- ── LES VOISINS DE LA MAISON GBÌGBÌ™, pour mémoire ───────────────
--  Ils gardent leur prix : tu ne m'as demandé que le Module.
select id, data ->> 'name' as nom, (data ->> 'priceXof')::int as prix,
       data -> 'prixParLongueur' as grille
from public.catalog_services
where data ->> 'name' ilike '%GB%GB%' or data ->> 'name' ilike '%reconstruct%'
order by id;

-- ── ROLLBACK ─────────────────────────────────────────────────────
-- begin;
-- insert into public.catalog_services select * from public.repli_0055_catalog_services
-- on conflict (id) do update set data = excluded.data;
-- commit;

-- ── QUAND C'EST VÉRIFIÉ ──────────────────────────────────────────
-- drop table public.repli_0055_catalog_services;
