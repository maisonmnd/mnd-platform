-- ═══════════════════════════════════════════════════════════════════
-- LA PORTE ORPHELINE — 5 septembre 2026
--
-- « Nouvelle connexion mais la maison ne me laisse pas entrer sur Ma Couronne.
--   J'ai même supprimé dans Supabase authentification mais je n'arrive
--   toujours pas à entrer avec certaines adresses que j'ai utilisées dans le
--   passé et que j'ai supprimées » (Yéman).
--
-- LA FICHE SURVIT AU COMPTE, ET GARDE SON `authUserId`. Supprimer un compte
-- dans Supabase Authentication ne touche pas à `public.clients` : la fiche
-- continue de porter l'identifiant d'un compte QUI N'EXISTE PLUS.
--
-- `adopter_ma_fiche` lisait cet identifiant comme la preuve qu'une AUTRE
-- personne tenait déjà cette adresse :
--
--   ② « fiche à mon adresse, sans compte » → manquée, `authUserId` n'est pas vide
--   ③ « fiche à mon adresse, au compte d'un autre » → touchée → `occupee`
--
-- et l'échappatoire de ③ (adresse confirmée, donc c'est moi) ne joue pas au
-- moment de la première visite : l'adresse vient d'être saisie, la boîte aux
-- lettres n'a encore rien prouvé. D'où l'écran bleu « cette adresse a déjà son
-- espace », devant une porte que plus personne ne franchit.
--
-- UN LIEN VERS UN COMPTE SUPPRIMÉ N'EST PAS LA PORTE D'UN AUTRE, c'est une
-- porte qui n'existe plus. La fiche est alors ORPHELINE, et elle se rend à qui
-- porte son adresse — exactement comme une fiche sans compte.
--
-- CE QUI NE CHANGE PAS : un `authUserId` qui pointe vers un compte VIVANT tient
-- toujours le mur. C'est le cas du 14 août (une adresse tapée à la main ne
-- reprend pas la couronne d'une autre), et il n'est pas question de l'ouvrir.
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
  v_confirme boolean := false;
  v_fiche public.clients%rowtype;
  v_proprietaire text;
  v_vivant boolean;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;

  -- ⓪ UN COMPTE DE LA MAISON N'OUVRE PAS MA COURONNE (14 août) : le Trône est
  --    sa porte.
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

  -- ③ Mon adresse est portée par une fiche liée à un AUTRE identifiant.
  select * into v_fiche from public.clients
    where lower(trim(coalesce(data->>'email', ''))) = v_mail
      and coalesce(data->>'authUserId', '') not in ('', v_uid)
      and coalesce((data->>'archived')::boolean, false) = false
    order by updated_at desc
    limit 1;

  if v_fiche.id is not null then
    v_proprietaire := v_fiche.data->>'authUserId';

    -- ③-a CE COMPTE EXISTE-T-IL ENCORE ? Un identifiant qui ne désigne plus
    --     personne n'est pas la porte d'un autre : c'est une porte disparue.
    --     La fiche est orpheline, et se rend à qui porte son adresse. Le test
    --     tient aussi quand l'identifiant n'est pas un UUID (données d'un ERP
    --     antérieur) : il ne sera alors dans `auth.users` en aucun cas, et
    --     la fiche est orpheline pour la même raison.
    begin
      select exists (select 1 from auth.users u where u.id = v_proprietaire::uuid)
        into v_vivant;
    exception when others then
      v_vivant := false;
    end;

    if not coalesce(v_vivant, false) then
      update public.clients
        set data = data || jsonb_build_object('authUserId', v_uid), updated_at = now()
        where id = v_fiche.id;
      return jsonb_build_object('statut', 'adoptee', 'ficheId', v_fiche.id, 'motif', 'orpheline');
    end if;

    -- ③-b LE COMPTE EST VIVANT. La preuve vient de la boîte aux lettres, pas
    --     du formulaire : une adresse confirmée a été ouverte par sa
    --     propriétaire, l'autre porte est donc la sienne aussi.
    select (u.email_confirmed_at is not null) into v_confirme
      from auth.users u where u.id = auth.uid();

    if coalesce(v_confirme, false) then
      update public.clients
        set data = data || jsonb_build_object('authUserId', v_uid), updated_at = now()
        where id = v_fiche.id;
      return jsonb_build_object('statut', 'reprise', 'ficheId', v_fiche.id);
    end if;

    -- NON CONFIRMÉE, ET LE COMPTE D'EN FACE EXISTE : le mur tient.
    return jsonb_build_object('statut', 'occupee');
  end if;

  return jsonb_build_object('statut', 'aucune');
end;
$$;

revoke all on function public.adopter_ma_fiche() from public;
grant execute on function public.adopter_ma_fiche() to authenticated;

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
-- Combien de fiches portent un lien vers un compte qui n'existe plus.
-- Elles ne sont PAS corrigées ici : chacune se rendra d'elle-même à la
-- première visite de celle qui porte son adresse. Ce chiffre dit seulement
-- combien de portes étaient closes pour rien.
select count(*) as fiches_orphelines
  from public.clients c
 where coalesce(c.data->>'authUserId', '') <> ''
   and coalesce((c.data->>'archived')::boolean, false) = false
   and not exists (
     select 1 from auth.users u
      where u.id::text = c.data->>'authUserId'
   );
