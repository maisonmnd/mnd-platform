-- ═══════════════════════════════════════════════════════════════════
-- 0048 — LE LIEN DE FAMILLE SE RÉPARE À CHAQUE ENTRÉE DANS L'APP.
--        (à coller dans Supabase → SQL Editor, après la 0047). UN SEUL TEMPS.
--
-- LE PIÈGE DE FOND, VU DEUX FOIS LE MÊME JOUR (Valerie, 14 août) : un
-- téléphone rejoue au démarrage ses écritures en attente — des copies
-- FROIDES de la fiche, prises avant que le serveur ne pose `familyId`.
-- Chaque rejeu efface le lien. La soudure du matin l'a reposé ; une vieille
-- copie l'a effacé de nouveau ; les enfants ont re-disparu de Ma Couronne.
--
-- Réparer à la main perd d'avance contre une file d'attente qui rejoue.
-- Donc le serveur répare AU MÊME RYTHME : `adopter_ma_fiche` — que l'app
-- appelle À CHAQUE ENTRÉE (0045) — apprend à recoudre le lien au passage :
-- une fiche sans `familyId` mais PAYEUSE d'une famille le retrouve, là,
-- à la seconde où l'app s'ouvre. L'application, de son côté, n'exige plus
-- le lien (tetesPortees regarde aussi la famille dont on est payeur).
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
  v_fam_id text;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;

  -- ⓪ UN COMPTE DE LA MAISON N'OUVRE PAS MA COURONNE : le Trône est sa porte.
  if public.is_staff() then
    return jsonb_build_object('statut', 'staff');
  end if;

  -- ① Ma fiche existe déjà — née de mon compte, ou adoptée un jour passé.
  select * into v_fiche from public.clients
    where data->>'authUserId' = v_uid or id = v_uid
    order by (data->>'authUserId' = v_uid) desc
    limit 1;
  if v_fiche.id is not null then
    -- LA RECOUTURE (0048) : une copie froide du téléphone a pu effacer le
    -- lien de famille. La famille dont je suis PAYEUR me le rend — ici même,
    -- à chaque ouverture de l'app, au même rythme que ce qui l'efface.
    if coalesce(v_fiche.data->>'familyId', '') = '' then
      select id into v_fam_id from public.families
        where data->>'payerClientId' = v_fiche.id
        order by updated_at asc
        limit 1;
      if v_fam_id is not null then
        update public.clients
          set data = data || jsonb_build_object('familyId', v_fam_id), updated_at = now()
          where id = v_fiche.id;
      end if;
    end if;
    return jsonb_build_object('statut', 'ok', 'ficheId', v_fiche.id);
  end if;

  if v_mail = '' then
    return jsonb_build_object('statut', 'aucune');
  end if;

  -- ② Une fiche de la maison porte mon adresse, SANS compte : je l'adopte.
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
-- Combien de fiches sont PAYEUSES d'une famille sans porter le lien ?
-- (au moment de coller : 1 attendu si la copie froide a encore frappé,
--  0 si le lien tient — dans les deux cas, la recouture veille désormais)
select count(*) as fiches_payeuses_sans_lien
  from public.clients c
  join public.families f on f.data->>'payerClientId' = c.id
 where coalesce(c.data->>'familyId', '') = '';
