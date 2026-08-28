-- ═══════════════════════════════════════════════════════════════════
-- QUI ATTEND, ET POURQUOI — 28 août 2026. LECTURE SEULE.
--
-- À passer AVANT 0075, pour voir l'état réel, et APRÈS, pour vérifier.
-- Ces requêtes ne modifient rien.
-- ═══════════════════════════════════════════════════════════════════

-- ① LES COMPTES QUI ATTENNENT, ET CE QUI LES RANGERAIT.
--    « cliente » = elle a une fiche, ou sa porte est marquée Ma Couronne.
--    « à vérifier » = ni l'un ni l'autre : c'est là que l'adresse décide.
select
  u.email,
  u.created_at::date                                as inscrit_le,
  (u.email_confirmed_at is not null)                as adresse_confirmee,
  coalesce(u.raw_user_meta_data->>'origine', '—')   as porte_marquee,
  exists (
    select 1 from public.clients c
    where c.id = u.id::text or c.data->>'authUserId' = u.id::text
  )                                                 as a_une_fiche,
  case
    when u.raw_user_meta_data->>'origine' = 'couronne' then 'cliente'
    when exists (select 1 from public.clients c
                 where c.id = u.id::text or c.data->>'authUserId' = u.id::text) then 'cliente'
    else 'à vérifier'
  end                                               as verdict
from auth.users u
where not exists (select 1 from public.staff s where s.user_id = u.id)
order by u.created_at desc;

-- ② LES ADRESSES PORTÉES PAR PLUSIEURS COMPTES — la cause du mur
--    « cette adresse a déjà son espace ». Une ligne ici = une cliente qui
--    peut se retrouver dehors devant sa propre couronne.
--    `confirmes` dit combien de ces comptes ont prouvé l'adresse : après
--    0075, celui-là reprend la fiche au lieu d'être barré.
select
  lower(trim(u.email))                                              as adresse,
  count(*)                                                          as comptes,
  count(*) filter (where u.email_confirmed_at is not null)          as confirmes,
  string_agg(coalesce(u.raw_user_meta_data->>'origine', '—'), ', ') as portes
from auth.users u
where u.email is not null and trim(u.email) <> ''
group by 1
having count(*) > 1
order by comptes desc, adresse;

-- ③ LE CAS D'UNE CLIENTE PRÉCISE — remplacer l'adresse entre guillemets.
--    Dit à quel compte sa fiche est attachée, et si son autre compte a
--    confirmé son adresse (donc s'il reprendra la fiche après 0075).
select
  c.id                                   as fiche,
  c.data->>'name'                        as tete,
  c.data->>'authUserId'                  as fiche_attachee_au_compte,
  u.id::text                             as compte,
  (u.email_confirmed_at is not null)     as adresse_confirmee,
  u.created_at::date                     as compte_cree_le,
  (c.data->>'authUserId' = u.id::text)   as ce_compte_la_porte
from auth.users u
left join public.clients c
  on lower(trim(coalesce(c.data->>'email', ''))) = lower(trim(u.email))
where lower(trim(u.email)) = lower(trim('ADRESSE-DE-LA-CLIENTE'))
order by u.created_at;

-- ═══════════════════════════════════════════════════════════════════
-- ③ ne rend rien ? L'adresse de la fiche diffère de celle du compte.
-- Dites-le-moi, je prépare la requête qui les rapproche — et vous la
-- relirez avant de la passer.
-- ═══════════════════════════════════════════════════════════════════
