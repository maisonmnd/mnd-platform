-- ═══════════════════════════════════════════════════════════════════
-- 0080 — LA PORTE SE REFERME, DÉFINITIVEMENT.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- « À chaque fois qu'un nouveau compte se crée sur Ma Couronne ça vient au
--   Trône comme demande de permission. Il faut régler de façon définitive »
--   (Yéman, 31 août 2026).
--
-- LA 0075 AVAIT POSÉ LA MARQUE, MAIS L'APPLICATION NE LA POSAIT PAS TOUJOURS.
-- Ma Couronne marquait « couronne » APRÈS le verdict du serveur, et sortait
-- avant d'y arriver dès que le verdict était `staff` OU `occupee`. Un compte
-- bloqué par l'écran bleu n'était donc jamais marqué, n'obtenait jamais de
-- fiche — et remontait au Trône comme candidature, indéfiniment. Les deux
-- écrans que Yéman a montrés sont la même faute, vue des deux côtés.
--
-- L'APPLICATION EST CORRIGÉE ; CETTE MIGRATION S'OCCUPE DU PASSÉ ET DU DERNIER
-- RECOURS :
--
--   ① `ecarter_du_personnel(uid)` — le souverain écarte à la main un compte
--      qui n'a rien à faire dans la file. La marque « couronne » est posée
--      côté serveur : le compte disparaît de la liste et n'y revient jamais,
--      même s'il n'ouvre plus jamais Ma Couronne.
--
--      ÉCARTER N'EST PAS SUPPRIMER. Le compte existe toujours, sa cliente
--      peut entrer sur Ma Couronne demain. On ne détruit pas un compte
--      d'authentification depuis un écran de gestion : ce geste-là ne se
--      rattrape pas.
--
--   ② Le rattrapage du passé : tout compte qui porte DÉJÀ une fiche cliente
--      est marqué « couronne » d'office. Il n'a jamais été une candidature.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① ÉCARTER UN COMPTE DE LA FILE ─────────────────────────────────
create or replace function public.ecarter_du_personnel(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff boolean;
begin
  -- SEUL LE SOUVERAIN ÉCARTE. La fonction écrit dans `auth.users` : elle ne
  -- s'ouvre à personne d'autre, et surtout pas au compte lui-même.
  if not public.is_souverain() then
    raise exception 'Réservé au souverain.';
  end if;

  -- ON N'ÉCARTE PAS QUELQU'UN QUI TRAVAILLE ICI. Marquer « couronne » un
  -- membre du personnel le ferait disparaître de la file sans lui retirer son
  -- accès : une porte ouverte que plus aucun écran ne montre.
  select exists (select 1 from public.staff s where s.user_id = target) into v_staff;
  if v_staff then
    raise exception 'Ce compte fait partie du personnel. Retirez son accès depuis sa fiche.';
  end if;

  update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                             || jsonb_build_object('origine', 'couronne')
    where id = target;

  if not found then
    raise exception 'Compte introuvable.';
  end if;

  return jsonb_build_object('statut', 'ecarte');
end;
$$;

revoke all on function public.ecarter_du_personnel(uuid) from public;
grant execute on function public.ecarter_du_personnel(uuid) to authenticated;

comment on function public.ecarter_du_personnel(uuid) is
  'Marque un compte comme venant de Ma Couronne : il quitte la file des candidatures du Trône. '
  'Souverain uniquement. N''ouvre aucun droit et ne supprime rien.';

-- ── ② LE PASSÉ SE RANGE TOUT SEUL ──────────────────────────────────
-- Un compte qui porte une fiche cliente n'a jamais été une candidature. On le
-- marque une fois pour toutes, plutôt que d'attendre qu'il rouvre Ma Couronne.
update auth.users u
  set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
                           || jsonb_build_object('origine', 'couronne')
where coalesce(u.raw_user_meta_data->>'origine', '') = ''
  and not exists (select 1 from public.staff s where s.user_id = u.id)
  and exists (
    select 1 from public.clients c
    where c.id = u.id::text or c.data->>'authUserId' = u.id::text
  );

-- ── CONTRÔLE — LECTURE SEULE ───────────────────────────────────────
-- `restants` = comptes encore dans la file : ni personnel, ni marqués, ni
-- porteurs d'une fiche. Ce sont ceux à écarter d'un clic, ou de vraies
-- candidatures.
select
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ecarter_du_personnel') as fonction_posee,
  (select count(*) from auth.users u
   where coalesce(u.raw_user_meta_data->>'origine', '') = 'couronne') as marques_couronne,
  (select count(*) from auth.users u
   where coalesce(u.raw_user_meta_data->>'origine', '') = ''
     and not exists (select 1 from public.staff s where s.user_id = u.id)
     and not exists (
       select 1 from public.clients c
       where c.id = u.id::text or c.data->>'authUserId' = u.id::text
     )) as restants;
