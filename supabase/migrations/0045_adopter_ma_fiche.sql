-- ═══════════════════════════════════════════════════════════════════
-- 0045 — L'ADOPTION DE SA FICHE PASSE PAR LE SERVEUR.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- LA RACINE DES DOUBLONS (Merine le 12 août, Valerie le 14) : la RLS ne
-- montre à une cliente QUE ses propres têtes (`cli_sel`, 0036) — l'adoption
-- par adresse, côté téléphone, était donc AVEUGLE : la fiche de la maison
-- qui porte son e-mail lui est invisible tant qu'elle ne lui appartient pas.
-- L'application, ne la voyant pas, créait une fiche neuve : vide, sans
-- famille, sans enfants — pendant que la vraie couronne dormait à côté.
--
-- Le juge passe donc côté serveur (security definer, comme
-- `rattacher_enfant`). L'ADRESSE VIENT DU JETON DE SESSION — jamais d'un
-- champ saisi : on n'adopte que ce que la connexion prouve. Trois verdicts :
--   · adoptee — une fiche de la maison porte mon adresse et n'a pas de
--     compte : elle devient la mienne, une fois pour toutes ;
--   · occupee — mon adresse est portée par la fiche d'un AUTRE compte
--     (mot de passe d'un côté, Google de l'autre) : PAS de doublon —
--     l'application raccompagne vers la première porte ;
--   · ok / aucune — ma fiche existe déjà / rien à adopter, elle naîtra.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.adopter_ma_fiche()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := (auth.uid())::text;
  v_mail text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  v_fiche public.clients%rowtype;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;

  -- ⓪ UN COMPTE DE LA MAISON N'OUVRE PAS MA COURONNE (14 août, demande de
  --    Yéman) : le Trône est sa porte. Sans ce mur, l'admin qui se connectait
  --    à Ma Couronne s'y fabriquait une fiche cliente — et son adresse aurait
  --    même pu ADOPTER une vraie fiche du carnet.
  if public.is_staff() then
    return jsonb_build_object('statut', 'staff');
  end if;

  -- ① Ma fiche existe déjà — née de mon compte, ou adoptée un jour passé.
  select * into v_fiche from public.clients
    where data->>'authUserId' = v_uid or id = v_uid
    order by (data->>'authUserId' = v_uid) desc
    limit 1;
  if v_fiche.id is not null then
    return jsonb_build_object('statut', 'ok', 'ficheId', v_fiche.id);
  end if;

  if v_mail = '' then
    return jsonb_build_object('statut', 'aucune');
  end if;

  -- ② Une fiche de la maison porte mon adresse, SANS compte : je l'adopte.
  --    La plus récemment vivante d'abord, jamais une archivée.
  select * into v_fiche from public.clients
    where lower(trim(coalesce(data->>'email', ''))) = v_mail
      and coalesce(data->>'authUserId', '') = ''
      and coalesce((data->>'archived')::boolean, false) = false
    order by updated_at desc
    limit 1;
  if v_fiche.id is not null then
    update public.clients
      set data = data || jsonb_build_object('authUserId', v_uid), updated_at = now()
      where id = v_fiche.id;
    return jsonb_build_object('statut', 'adoptee', 'ficheId', v_fiche.id);
  end if;

  -- ③ Mon adresse est déjà portée par la fiche d'un AUTRE compte : la porte
  --    est ouverte ailleurs. On ne crée rien — l'application le dit.
  if exists (
    select 1 from public.clients
    where lower(trim(coalesce(data->>'email', ''))) = v_mail
      and coalesce(data->>'authUserId', '') not in ('', v_uid)
  ) then
    return jsonb_build_object('statut', 'occupee');
  end if;

  return jsonb_build_object('statut', 'aucune');
end;
$$;

revoke all on function public.adopter_ma_fiche() from public;
grant execute on function public.adopter_ma_fiche() to authenticated;

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
select proname as fonction, prosecdef as security_definer
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'adopter_ma_fiche';
