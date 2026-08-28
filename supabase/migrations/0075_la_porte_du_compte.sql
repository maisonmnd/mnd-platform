-- ═══════════════════════════════════════════════════════════════════
-- 0075 — LA PORTE DU COMPTE.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Deux plaies de la même racine : le serveur ne savait pas D'OÙ venait un
-- compte, et refusait donc à la fois trop et pas assez.
--
--   ① LE TRÔNE PROPOSAIT D'AUTORISER SES CLIENTES. `list_pending_staff`
--      rend tout compte absent de `staff` : une inscrite de Ma Couronne y
--      arrivait, avec un bouton « Autoriser » à portée de clic — et ce clic
--      lui ouvrait la paie, le coffre et les fiches de toutes les autres.
--      L'écran devinait en cherchant une fiche du même identifiant ; une
--      inscrite de la veille n'en a pas encore, et une ADOPTÉE (0045) garde
--      celui de son ancienne fiche. Les deux retombaient du mauvais côté.
--      La fonction rend maintenant la porte d'origine et l'existence d'une
--      fiche. Elle ne cache personne : elle dit ce qu'elle sait, l'écran range.
--
--   ② UNE CLIENTE RESTAIT DEHORS, DEVANT SA PROPRE COURONNE. Au verdict
--      « occupee », l'application affiche « cette adresse a déjà son espace »
--      et raccompagne vers « la porte utilisée la première fois » — sans dire
--      laquelle. Une cliente qui s'était inscrite par mot de passe puis
--      revenait par Google (ou l'inverse) n'avait plus aucun moyen d'entrer.
--
--      LE MUR AVAIT SA RAISON (14 août) : une adresse NON CONFIRMÉE peut être
--      tapée par n'importe qui, et adopter la fiche d'une autre. Mais quand
--      MON adresse est CONFIRMÉE, la preuve est faite — Supabase n'admet
--      qu'un seul compte confirmé par adresse, l'autre porte est donc la
--      mienne aussi. La fiche me revient au lieu de me barrer le passage.
--      Adresse non confirmée : le mur tient, exactement comme avant.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① LES COMPTES EN ATTENTE DISENT LEUR PORTE ─────────────────────
-- Le type de retour change : Postgres exige de retirer l'ancienne d'abord.
drop function if exists public.list_pending_staff();

create or replace function public.list_pending_staff()
returns table(user_id uuid, email text, created_at timestamptz, origine text, a_fiche boolean)
language sql stable security definer set search_path = public as $$
  select
    u.id,
    u.email,
    u.created_at,
    -- La marque posée à la porte franchie. Elle n'est PAS un droit : elle
    -- oriente une liste. Seul `authorize_staff` ouvre un accès, et il reste
    -- réservé au souverain — un compte peut donc l'écrire lui-même sans
    -- qu'aucune porte ne s'ouvre.
    u.raw_user_meta_data->>'origine' as origine,
    -- LES DEUX FAÇONS D'ÊTRE SA FICHE : née de son compte (l'identifiant),
    -- ou adoptée depuis 0045 (`authUserId`). Ne lire que la première
    -- renvoyait toutes les adoptées dans la file du Trône.
    exists (
      select 1 from public.clients c
      where c.id = u.id::text or c.data->>'authUserId' = u.id::text
    ) as a_fiche
  from auth.users u
  where public.is_souverain()
    and not exists (select 1 from public.staff s where s.user_id = u.id)
  order by u.created_at desc;
$$;

grant execute on function public.list_pending_staff() to authenticated;

-- ── ② L'ADRESSE CONFIRMÉE REPREND SA FICHE ─────────────────────────
create or replace function public.adopter_ma_fiche()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := (auth.uid())::text;
  v_mail text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  v_confirme boolean := false;
  v_fiche public.clients%rowtype;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;

  -- ⓪ UN COMPTE DE LA MAISON N'OUVRE PAS MA COURONNE (14 août) : le Trône est
  --    sa porte. Sans ce mur, l'admin qui s'y connectait se fabriquait une
  --    fiche cliente — et son adresse aurait pu ADOPTER une vraie fiche.
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

  -- ③ Mon adresse est portée par la fiche d'un AUTRE compte.
  select * into v_fiche from public.clients
    where lower(trim(coalesce(data->>'email', ''))) = v_mail
      and coalesce(data->>'authUserId', '') not in ('', v_uid)
      and coalesce((data->>'archived')::boolean, false) = false
    order by updated_at desc
    limit 1;

  if v_fiche.id is not null then
    -- LA PREUVE VIENT DE LA BOÎTE AUX LETTRES, PAS DU FORMULAIRE. Une adresse
    -- confirmée a été ouverte par sa propriétaire : Supabase n'admet qu'un
    -- seul compte confirmé par adresse, l'autre porte est donc la sienne
    -- aussi (mot de passe d'un côté, Google de l'autre). La fiche la suit.
    select (u.email_confirmed_at is not null) into v_confirme
      from auth.users u where u.id = auth.uid();

    if coalesce(v_confirme, false) then
      update public.clients
        set data = data || jsonb_build_object('authUserId', v_uid), updated_at = now()
        where id = v_fiche.id;
      return jsonb_build_object('statut', 'reprise', 'ficheId', v_fiche.id);
    end if;

    -- NON CONFIRMÉE : le mur tient. C'est très exactement le cas du 14 août —
    -- une adresse tapée à la main, jamais ouverte, ne reprend rien.
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
   and proname in ('adopter_ma_fiche', 'list_pending_staff')
 order by proname;
