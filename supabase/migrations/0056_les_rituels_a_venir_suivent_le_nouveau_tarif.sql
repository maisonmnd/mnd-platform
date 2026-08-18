-- ═══════════════════════════════════════════════════════════════════
-- 0056 — LES RITUELS À VENIR SUIVENT LE NOUVEAU TARIF
--        (à coller tel quel. RIEN À DÉCOMMENTER.)
--
-- ⚠ FERME TOUS LES ONGLETS DU TRÔNE ET DE MA COURONNE AVANT DE LANCER.
--
-- ── POURQUOI ─────────────────────────────────────────────────────
-- Le 0054 a figé `priceXof` sur les rituels touchés par le glissement KLƆKLƆ™,
-- pour que l'argent du PASSÉ ne se réécrive pas. C'était juste pour les 141
-- honorés. Ça ne l'est pas pour ceux qui n'ont pas encore eu lieu : ils
-- annonceraient « Signature » et factureraient le prix du Prestige.
--
-- Décision de Yéman, 17 août : la cliente paie le geste qu'elle REÇOIT. Le gel
-- saute sur les rituels CONFIRMÉS ET À VENIR ; le prix se relira au catalogue
-- le jour de la venue.
--
-- ── CE QUI N'EST PAS TOUCHÉ ──────────────────────────────────────
--   · les 141 rituels HONORÉS — leur gel est ce qui protège la Synthèse ;
--   · le rituel ANNULÉ ;
--   · tout rituel confirmé dont la DATE EST PASSÉE : il n'est plus « à venir »,
--     et le retarifer réécrirait un chiffre déjà annoncé sans qu'on l'ait
--     décidé. S'il en reste, l'aperçu le dit — à trancher séparément.
--
-- ── EFFET DE BORD ASSUMÉ ─────────────────────────────────────────
-- Un rituel dégelé relit TOUTES ses prestations au catalogue du jour, pas
-- seulement le KLƆKLƆ™. Si un autre prix a bougé depuis la réservation, il
-- suivra aussi. C'est le comportement normal d'un rendez-vous non gelé.
-- ═══════════════════════════════════════════════════════════════════

-- ── APERÇU — ne modifie rien. Lis-le avant. ──────────────────────
select a.data ->> 'status'                                              as statut,
       case when (a.data ->> 'date')::date >= current_date
            then 'à venir' else 'date passée' end                       as horizon,
       count(*)                                                         as rituels,
       count(*) filter (where not (r.data ? 'priceXof'))                as gel_pose_par_0054,
       count(*) filter (where r.data ? 'priceXof')                      as gel_anterieur,
       sum((a.data ->> 'priceXof')::numeric)                            as somme_gelee
from public.appointments a
  join public.repli_0054_appointments r on r.id = a.id
where a.data ? 'priceXof'
group by 1, 2
order by 1, 2;
--  `gel_pose_par_0054` : le repli n'avait pas de prix, c'est moi qui l'ai posé.
--  `gel_anterieur`     : le prix existait AVANT — il vient de la réservation.
--  Les deux sautent ici : Yéman a tranché sur les rituels à venir, pas sur
--  l'origine du gel. Le repli 0056 permet de revenir en arrière.


begin;

create table if not exists public.repli_0056_appointments
  (like public.appointments including all);
alter table public.repli_0056_appointments enable row level security;

insert into public.repli_0056_appointments
select a.* from public.appointments a
where a.id in (select id from public.repli_0054_appointments)
  and a.data ? 'priceXof'
  and a.data ->> 'status' = 'confirmé'
  and (a.data ->> 'date')::date >= current_date
on conflict (id) do nothing;

update public.appointments a
set data = a.data - 'priceXof'
where a.id in (select id from public.repli_0054_appointments)
  and a.data ? 'priceXof'
  and a.data ->> 'status' = 'confirmé'
  and (a.data ->> 'date')::date >= current_date;

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLE — puis À NOUVEAU après Ctrl+Maj+R sur Le Trône.
-- ═══════════════════════════════════════════════════════════════════

-- ① CE QUI A ÉTÉ DÉGELÉ, et ce qui reste gelé à bon droit.
select a.data ->> 'status'                                    as statut,
       count(*)                                               as rituels,
       count(*) filter (where a.data ? 'priceXof')            as encore_geles,
       count(*) filter (where not (a.data ? 'priceXof'))      as degeles,
       sum((a.data ->> 'priceXof')::numeric)                  as somme_encore_gelee
from public.appointments a
where a.id in (select id from public.repli_0054_appointments)
group by 1 order by 1;
--  Attendu : `honoré` entièrement gelé (141, 6 146 200 F) — c'est lui qui
--  protège la Synthèse. `confirmé` entièrement dégelé. `annulé` inchangé.

-- ② CE QU'ELLES PAIERONT — l'ancien prix annoncé contre le nouveau, rituel
--    par rituel. La différence est ce que la Maison renonce à demander.
select r.data ->> 'date'                                      as jour,
       (r.data ->> 'priceXof')::int                           as ancien_prix,
       (select coalesce(sum(coalesce(
          (s.data -> 'prixParLongueur' ->> (a.data ->> 'longueur'))::numeric,
          (s.data ->> 'priceXof')::numeric, 0)), 0)
        from jsonb_array_elements_text(coalesce(a.data -> 'serviceIds','[]'::jsonb)) sid
        join public.catalog_services s on s.id = sid)::int    as nouveau_prix,
       (select coalesce(sum(coalesce(
          (s.data -> 'prixParLongueur' ->> (a.data ->> 'longueur'))::numeric,
          (s.data ->> 'priceXof')::numeric, 0)), 0)
        from jsonb_array_elements_text(coalesce(a.data -> 'serviceIds','[]'::jsonb)) sid
        join public.catalog_services s on s.id = sid)::int
       - (r.data ->> 'priceXof')::int                         as ecart
from public.appointments a
  join public.repli_0056_appointments r on r.id = a.id
order by 1;

-- ── ROLLBACK ─────────────────────────────────────────────────────
-- begin;
-- insert into public.appointments select * from public.repli_0056_appointments
-- on conflict (id) do update set data = excluded.data;
-- commit;
