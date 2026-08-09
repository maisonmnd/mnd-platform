-- ═══════════════════════════════════════════════════════════════════
-- AUDIT — ce que la divergence des barèmes VÈKPÈ™ a réellement coûté
-- (Supabase → SQL Editor → Run). LECTURE SEULE : n'écrit rien.
--
-- CE QU'ON SAIT. `mnd_model_band_sets` n'était pas dans la liste blanche
-- `docs_pub_read` (réparé par 0029) : Ma Couronne ne pouvait pas le lire et
-- retombait sur le défaut du code, VEKPE_BANDS_SEED. Le serveur porte une valeur
-- écrite le 3 août. Deux calibres divergent :
--
--     calibre   coef serveur   coef seed      durCoef serveur   durCoef seed
--     Jumbo     0,8            0,53           0,8               0,74
--     Medium    1,47           1              1,8               1
--     (Mini, Micro, Nano, Galaxy : identiques)
--
-- CE QUE LA LECTURE DU CODE ÉTABLIT (shared/pricing.ts) — et qui déplace le
-- soupçon d'un endroit à un autre :
--
--   · LE PRIX. `personalPriceXof` n'utilise `bande.coef` qu'en DERNIER RECOURS
--     (ligne 370-377). Une prestation qui porte un `ratePerLock` — c'est le cas
--     des créations VÈKPÈ™, 1 100 F le lock — se tarife AVANT cela, par le
--     comptage ou par le plancher de son calibre. Le coefficient est alors
--     INERTE : il ne touche pas le montant. Ce qui compte, c'est l'IDENTITÉ de
--     la tranche (`cal-medium`…), pas son coefficient — donc les `maxLocks`.
--
--   · LA DURÉE. `personalDurationMin` (ligne 381-389) applique `bande.durCoef`
--     TOUJOURS, quel que soit le mode de tarif. Et c'est là que l'écart est
--     énorme : Medium à 1,8 contre 1,0 au seed. Une création Medium réservée en
--     ligne a donc bloqué le fauteuil pour la durée NOMINALE au lieu de 1,8 fois
--     celle-ci — presque moitié moins de temps que nécessaire. Le créneau
--     suivant pouvait être vendu sur un fauteuil encore occupé.
--
-- LA CONCLUSION PROBABLE EST DONC : pas d'argent perdu, mais des JOURNÉES
-- SOUS-RÉSERVÉES depuis le 3 août. Les deux sections ① et ② le confirment ou
-- l'infirment ; ③ liste les rendez-vous concernés.
--
-- (Ce fil recoupe le chantier « restrictions du calendrier » du 8 août, qui
--  demandait précisément : vérifier QUELLE durée le tunnel passe à `durationMin`.)
-- ═══════════════════════════════════════════════════════════════════

-- ── ① LES BORNES ONT-ELLES BOUGÉ ? ────────────────────────────────
-- LA SEULE QUESTION QUI ENGAGE DE L'ARGENT. Si `maxLocks` diffère du seed, une
-- cliente n'était pas seulement mal coefficientée : elle tombait dans une AUTRE
-- TRANCHE, donc sur un autre plancher `priceFloors` — et là, le prix bouge.
-- Tout « identique » ici = le prix n'a pas été touché.
select
  b ->> 'id'                        as bande,
  b ->> 'name'                      as calibre,
  (b ->> 'maxLocks')::int           as maxlocks_serveur,
  s.maxlocks_seed,
  case
    when (b ->> 'maxLocks') is null and s.maxlocks_seed is null then 'identique'
    when (b ->> 'maxLocks')::int is distinct from s.maxlocks_seed
      then '⚠ BORNE DIFFÉRENTE — la cliente changeait de tranche, le PRIX a bougé'
    else 'identique'
  end                               as verdict_bornes
from public.documents d
cross join lateral jsonb_array_elements(d.data -> 'atl-i-vekpe') as b
left join (values
  ('Jumbo', 100), ('Medium', 180), ('Mini', 250),
  ('Micro', 400), ('Nano', 600), ('Galaxy', null)
) as s(nom, maxlocks_seed) on s.nom = b ->> 'name'
where d.key = 'mnd_model_band_sets';

-- ── ② LES CRÉATIONS SE TARIFENT-ELLES BIEN AU LOCK ? ──────────────
-- `ratePerLock` posé (ou `priceFloors` seuls) ⇒ le coefficient est inerte pour
-- le prix. Une création SANS ni l'un ni l'autre retomberait sur `base × coef` :
-- celle-là aurait bien été mal chiffrée.
select
  s.data ->> 'name'                                   as prestation,
  coalesce(s.data ->> 'tarifMode', '(automatique)')   as mode_de_tarif,
  (s.data ->> 'ratePerLock')                          as tarif_au_lock,
  (s.data -> 'priceFloors' is not null)               as a_une_grille_par_calibre,
  (s.data ->> 'durationMin')::int                     as duree_nominale_min,
  case
    when (s.data ->> 'ratePerLock') is not null
      or  s.data -> 'priceFloors' is not null
      then 'prix NON touché — seule la DURÉE a été sous-estimée'
    else '⚠ PRIX AU COEFFICIENT — le montant annoncé en ligne était faux'
  end                                                 as verdict_prix
from public.catalog_services s
where s.data ->> 'categoryId' = 'atl-i-vekpe'
order by 1;

-- ── ③ LES RENDEZ-VOUS SOUS-RÉSERVÉS ───────────────────────────────
-- Créations VÈKPÈ™ réservées EN LIGNE (`source = 'couronne'`) par une cliente
-- Jumbo (≤ 100 locks) ou Medium (101–180) depuis le 3 août — les deux seuls
-- calibres touchés. `duree_reservee` est ce que le tunnel a bloqué (seed) ;
-- `duree_reelle` ce qu'il aurait fallu (serveur). L'écart est du fauteuil vendu
-- deux fois.
--
-- Le 3 août 14 h 42 est l'écriture du barème serveur : avant, rien à diverger.
with bande as (
  select
    b ->> 'name'              as calibre,
    (b ->> 'maxLocks')::int   as maxlocks,
    (b ->> 'durCoef')::numeric as durcoef_serveur
  from public.documents d
  cross join lateral jsonb_array_elements(d.data -> 'atl-i-vekpe') as b
  where d.key = 'mnd_model_band_sets'
),
seed as (
  select * from (values ('Jumbo', 0.74), ('Medium', 1.0)) as t(calibre, durcoef_seed)
)
select
  a.id                                        as rendez_vous,
  a.data ->> 'date'                           as jour,
  a.data ->> 'time'                           as heure,
  a.data ->> 'status'                         as statut,
  c.data ->> 'name'                           as cliente,
  (c.data ->> 'lockCount')::int               as locks,
  bd.calibre,
  sum((s.data ->> 'durationMin')::int)        as duree_nominale,
  round(sum((s.data ->> 'durationMin')::int) * sd.durcoef_seed)     as duree_reservee,
  round(sum((s.data ->> 'durationMin')::int) * bd.durcoef_serveur)  as duree_reelle,
  round(sum((s.data ->> 'durationMin')::int)
        * (bd.durcoef_serveur - sd.durcoef_seed))                   as minutes_manquantes
from public.appointments a
join public.clients c on c.id = a.data ->> 'clientId'
join lateral jsonb_array_elements_text(a.data -> 'serviceIds') sid on true
join public.catalog_services s on s.id = sid
join bande bd
  on bd.calibre = case when (c.data ->> 'lockCount')::int <= 100 then 'Jumbo' else 'Medium' end
join seed sd on sd.calibre = bd.calibre
where a.data ->> 'source' = 'couronne'
  and a.data ->> 'status' <> 'annulé'
  and s.data ->> 'categoryId' = 'atl-i-vekpe'
  and (c.data ->> 'lockCount') ~ '^[0-9]+$'
  and (c.data ->> 'lockCount')::int <= 180
  and a.updated_at >= timestamptz '2026-08-03 14:42:00+00'
group by a.id, a.data, c.data, bd.calibre, bd.durcoef_serveur, sd.durcoef_seed
order by a.data ->> 'date';

-- ── ④ EN UNE LIGNE ────────────────────────────────────────────────
-- Zéro ici = personne n'a réservé de création VÈKPÈ™ en ligne dans ce calibre
-- depuis le 3 août, et il n'y a rien à rattraper.
select
  count(*)                as rendez_vous_sous_reserves,
  count(distinct jour)    as journees_touchees
from (
  select distinct a.id, a.data ->> 'date' as jour
  from public.appointments a
  join public.clients c on c.id = a.data ->> 'clientId'
  join lateral jsonb_array_elements_text(a.data -> 'serviceIds') sid on true
  join public.catalog_services s on s.id = sid
  where a.data ->> 'source' = 'couronne'
    and a.data ->> 'status' <> 'annulé'
    and s.data ->> 'categoryId' = 'atl-i-vekpe'
    and (c.data ->> 'lockCount') ~ '^[0-9]+$'
    and (c.data ->> 'lockCount')::int <= 180
    and a.updated_at >= timestamptz '2026-08-03 14:42:00+00'
) x;
