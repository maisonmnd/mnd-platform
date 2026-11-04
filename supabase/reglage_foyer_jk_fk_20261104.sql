-- Le foyer de J. K. et F. K., deux sœurs qui viennent toujours ensemble :
-- 4 novembre 2026, le parcours du foyer (maquette validée, « construis »).
-- « F. and J. always come together, they are sisters. Must find a way to keep
-- their appointment under one canal. Everything the same » (Yéman ; prénoms
-- réduits aux initiales : le dépôt est public).
--
-- CE QUE CE FICHIER ÉCRIT, et rien d'autre :
--   1. un `foyerId` commun sur les deux rendez-vous du mardi 22 décembre 2026
--      à 10 h : i4gg2fee0t (J. K., KLƆKLƆ™ Essentiel + SÍNSIN™ Essentiel) et
--      ni8vhz0g87 (F. K., 9 ans, KLƆKLƆ™ Kids + SÍNSIN™ Kids). Posés à part le
--      3 et le 4 novembre 2026, ils deviennent un rendez-vous du foyer : un
--      geste les déplace ensemble, l'annulation demande « les deux, ou
--      seulement elle ? ». Leurs gestes, leurs prix, leurs remises famille et
--      leur maître ne bougent pas.
--   2. la case « Elles viennent toujours ensemble » (`toujoursEnsemble`) sur
--      leur compte famille fam-3hh0id5nbu : leurs rendez-vous suivants se
--      posent ensemble, au Trône.
--
-- LES COPIES DE REPLI D'ABORD, avec RLS aussitôt (règle des tables repli_).
-- REJOUABLE : une copie de repli ne se refait pas si elle existe ; le foyer
-- ne se pose que si les DEUX rendez-vous sont encore vivants, à ce jour et à
-- cette heure (l'un déplacé ou annulé entre-temps : rien ne s'écrit), et
-- seulement s'il n'est pas déjà posé ; la case ne se coche qu'une fois.
-- À NE PAS EXÉCUTER à la main : c'est l'agent de mise en ligne qui le passe.

create table if not exists public.repli_foyer_rdv_20261104 as
  select id, branch_id, data, updated_at from public.appointments
   where id in ('i4gg2fee0t', 'ni8vhz0g87');
alter table public.repli_foyer_rdv_20261104 enable row level security;

create table if not exists public.repli_foyer_famille_20261104 as
  select id, branch_id, data, updated_at from public.families
   where id = 'fam-3hh0id5nbu';
alter table public.repli_foyer_famille_20261104 enable row level security;

-- 1. Le foyer commun, sur les deux à la fois ou sur aucune.
with deux as (
  select count(*) = 2 as vivantes
    from public.appointments
   where id in ('i4gg2fee0t', 'ni8vhz0g87')
     and data->>'date' = '2026-12-22'
     and data->>'time' = '10:00'
     and coalesce(data->>'status', '') not in ('annulé', 'honoré')
)
update public.appointments
   set data = data || jsonb_build_object('foyerId', 'fo-jk-fk-20261222'),
       updated_at = now()
 where id in ('i4gg2fee0t', 'ni8vhz0g87')
   and (select vivantes from deux)
   and coalesce(data->>'foyerId', '') <> 'fo-jk-fk-20261222';

-- 2. La case du compte famille.
update public.families
   set data = data || jsonb_build_object('toujoursEnsemble', true),
       updated_at = now()
 where id = 'fam-3hh0id5nbu'
   and coalesce(data->>'toujoursEnsemble', 'false') <> 'true';

-- Contrôle : deux lignes au même foyer, et la case cochée.
select id, data->>'date' as jour, data->>'time' as heure, data->>'master' as maitre,
       data->>'status' as statut, data->>'foyerId' as foyer
  from public.appointments where id in ('i4gg2fee0t', 'ni8vhz0g87')
union all
select id, null, null, null, null, data->>'toujoursEnsemble'
  from public.families where id = 'fam-3hh0id5nbu';
