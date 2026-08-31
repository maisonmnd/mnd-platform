-- ═══════════════════════════════════════════════════════════════════════════
-- 0079 · LES CRÉNEAUX OCCUPÉS, SANS DIRE QUI LES OCCUPE — 31 août 2026
--
-- « Le salon est libre à 13h et 16h pourtant il y a déjà 2 RDV à ces
--   horaires » (Yéman).
--
-- LA CAUSE EST DANS LA RLS, ET ELLE EST JUSTE. `appointments` est en
-- `owned_by_data` (migration 0006) : une cliente ne lit QUE ses propres
-- rendez-vous. Ma Couronne calculait donc ses créneaux contre un agenda vide,
-- et proposait des heures déjà prises. Ouvrir la table entière aux clientes
-- réglerait l'affichage en donnant à chacune les noms, les prestations et les
-- prix de toutes les autres. Jamais.
--
-- ON NE DONNE QUE LA FORME DU MUR, PAS CE QU'IL Y A DERRIÈRE : un jour, un
-- maître, une heure de départ, une durée. Aucun nom, aucune prestation, aucun
-- montant, aucun identifiant de cliente. De quoi dessiner un calendrier
-- honnête, et rien de plus.
--
-- SECURITY DEFINER parce que c'est le seul moyen de lire par-dessus la RLS ;
-- `search_path` figé, et la fonction ne prend en paramètre qu'une branche et
-- deux dates, donc rien à injecter.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.creneaux_occupes(
  p_branch text,
  p_du     text,
  p_au     text
)
returns table (jour text, maitre text, debut text, duree int)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.data->>'date'                  as jour,
    coalesce(a.data->>'master', '')  as maitre,
    coalesce(a.data->>'time', '')    as debut,
    -- LA DURÉE SE CALCULE ICI, sur le catalogue du jour, exactement comme le
    -- fait le Trône. La renvoyer évite d'avoir à dire QUELLES prestations
    -- composent le rendez-vous — c'est le seul chiffre dont le calendrier a
    -- besoin, et il ne raconte rien de la personne.
    greatest(60, coalesce((
      select sum(coalesce((s.data->>'durationMin')::int, 60))::int
      from jsonb_array_elements_text(coalesce(a.data->'serviceIds', '[]'::jsonb)) sid
      left join public.catalog_services s on s.id = sid.value
    ), 60))::int                     as duree
  from public.appointments a
  where a.data->>'branchId' = p_branch
    and a.data->>'date' >= p_du
    and a.data->>'date' <= p_au
    -- Un rendez-vous annulé ne bloque plus personne.
    and coalesce(a.data->>'status', '') <> 'annulé'
    -- Une heure vide ne dessine aucun mur : on l'écarte plutôt que de la
    -- laisser occuper minuit.
    and coalesce(a.data->>'time', '') <> '';
$$;

revoke all on function public.creneaux_occupes(text, text, text) from public;
grant execute on function public.creneaux_occupes(text, text, text) to anon, authenticated;

comment on function public.creneaux_occupes(text, text, text) is
  'Créneaux occupés d''une branche entre deux dates : jour, maître, heure, durée. '
  'Aucune donnée personnelle. Sert à Ma Couronne pour ne pas proposer une heure déjà prise.';

-- ── Contrôle ───────────────────────────────────────────────────────────────
-- Doit renvoyer les rendez-vous du jour, sans un seul nom de cliente.
-- select * from public.creneaux_occupes('<branche>', '2026-08-31', '2026-08-31');
select
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'creneaux_occupes') as fonction_posee,
  (select count(*) from information_schema.role_routine_grants
   where routine_name = 'creneaux_occupes' and grantee in ('anon', 'authenticated')) as droits;
