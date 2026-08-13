-- ═══════════════════════════════════════════════════════════════════
-- 0044 — LE RATTACHEMENT DIRECT DES ENFANTS, CÔTÉ SERVEUR.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Décision du 13 août : la cliente rattache ses enfants SANS validation.
-- Or la RLS (à raison) n'autorise une cliente qu'à écrire SA fiche : les
-- enfants créés depuis son téléphone restaient locaux, puis disparaissaient
-- à la première relecture du serveur (constaté sur le compte de test).
-- Le rattachement passe donc par une FONCTION SERVEUR (security definer),
-- comme `provision_first_staff` : le serveur vérifie et écrit lui-même.
--
-- La sécurité qui motivait la validation TIENT : la fonction ne peut que
-- CRÉER une tête neuve. Une tête déjà au carnet (même nom, même naissance)
-- redevient une demande que la Maison arbitre — on ne s'annexe pas la fiche
-- d'une autre.
--
-- AU PASSAGE, UN BUG LATENT SE RÉPARE : `est_ma_tete` (0036) comparait le
-- parent payeur à auth.uid() directement — vrai pour une fiche née en ligne
-- (id = uid), FAUX pour une fiche ADOPTÉE par son adresse (le compte vit
-- dans data->>'authUserId', l'id reste celui de la maison — Merine). Sans
-- cette réparation, une adoptée ne pouvait ni voir ni réserver pour ses
-- enfants. Le juge apprend l'adoption.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① LE JUGE, CONSCIENT DE L'ADOPTION ─────────────────────────────
create or replace function public.est_ma_tete(cible text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- moi-même : la fiche née de mon compte…
    cible = (auth.uid())::text
    -- …ou la fiche de la maison que mon compte a ADOPTÉE par son adresse
    or exists (
      select 1 from public.clients moi
      where moi.id = cible
        and moi.data->>'authUserId' = (auth.uid())::text
    )
    -- ou un mineur de la famille dont je suis le parent payeur
    or exists (
      select 1
      from public.clients enfant
      join public.families f
        on f.id = enfant.data->>'familyId'
      join public.clients parent
        on parent.id = f.data->>'payerClientId'
      where enfant.id = cible
        and (parent.id = (auth.uid())::text
             or parent.data->>'authUserId' = (auth.uid())::text)
        and nullif(enfant.data->>'birthday', '') is not null
        and (nullif(enfant.data->>'birthday', ''))::date > (current_date - interval '18 years')
        and coalesce((enfant.data->>'archived')::boolean, false) = false
    );
$$;

revoke all on function public.est_ma_tete(text) from public;
grant execute on function public.est_ma_tete(text) to authenticated;

-- ── ② LE RATTACHEMENT — le serveur vérifie et écrit lui-même ───────
create or replace function public.rattacher_enfant(
  p_prenom text,
  p_nom text,
  p_naissance date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := (auth.uid())::text;
  v_parent public.clients%rowtype;
  v_nom_complet text;
  v_family_id text;
  v_fam public.families%rowtype;
  v_enfant_id text;
  v_dec_id text;
  v_deja boolean;
  v_patronyme text;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;

  -- La fiche du parent : l'adoptée d'abord (le compte inscrit dessus), sinon
  -- celle née du compte lui-même.
  select * into v_parent from public.clients
    where data->>'authUserId' = v_uid or id = v_uid
    order by (data->>'authUserId' = v_uid) desc
    limit 1;
  if v_parent.id is null then
    raise exception 'Fiche du parent introuvable — ouvrez d''abord votre profil.';
  end if;

  if p_prenom is null or btrim(p_prenom) = '' then raise exception 'Il manque son prénom.'; end if;
  if p_nom is null or btrim(p_nom) = '' then raise exception 'Il manque son nom de famille.'; end if;
  if p_naissance is null then raise exception 'Il manque sa date de naissance.'; end if;
  if p_naissance > current_date then raise exception 'Cette date est dans l''avenir.'; end if;
  -- La minorité se prouve — et un majeur ouvre son propre compte.
  if p_naissance <= (current_date - interval '18 years') then
    raise exception 'Cette personne est majeure — elle peut ouvrir son propre compte.';
  end if;

  v_nom_complet := regexp_replace(btrim(p_prenom) || ' ' || btrim(p_nom), '\s+', ' ', 'g');
  v_dec_id := 'dec-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

  -- Une tête DÉJÀ au carnet ne s'annexe pas : demande que la Maison arbitre.
  select exists (
    select 1 from public.clients c
    where coalesce((c.data->>'archived')::boolean, false) = false
      and c.branch_id is not distinct from v_parent.branch_id
      and lower(regexp_replace(btrim(c.data->>'name'), '\s+', ' ', 'g')) = lower(v_nom_complet)
      and c.data->>'birthday' = to_char(p_naissance, 'YYYY-MM-DD')
  ) into v_deja;

  if v_deja then
    insert into public.enfants_declares (id, branch_id, data, updated_at)
    values (v_dec_id, v_parent.branch_id, jsonb_build_object(
      'id', v_dec_id,
      'branchId', v_parent.branch_id,
      'clientId', v_parent.id,
      'prenom', btrim(p_prenom),
      'nom', btrim(p_nom),
      'birthday', to_char(p_naissance, 'YYYY-MM-DD'),
      'declareLe', to_char(current_date, 'YYYY-MM-DD'),
      'statut', 'en attente'
    ), now());
    return jsonb_build_object('statut', 'attente');
  end if;

  -- Le compte famille du parent : le sien, sinon on l'ouvre — payeur = parent.
  v_family_id := nullif(v_parent.data->>'familyId', '');
  if v_family_id is not null then
    select * into v_fam from public.families where id = v_family_id;
  end if;
  if v_family_id is null or v_fam.id is null then
    v_family_id := 'fam-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    v_patronyme := coalesce(nullif(regexp_replace(btrim(v_parent.data->>'name'), '^.*\s', ''), ''), btrim(v_parent.data->>'name'));
    insert into public.families (id, branch_id, data, updated_at)
    values (v_family_id, v_parent.branch_id, jsonb_build_object(
      'id', v_family_id,
      'branchId', v_parent.branch_id,
      'name', 'Famille ' || v_patronyme,
      'payerClientId', v_parent.id
    ), now());
    update public.clients
      set data = data || jsonb_build_object('familyId', v_family_id), updated_at = now()
      where id = v_parent.id;
  elsif coalesce(v_fam.data->>'payerClientId', '') = '' then
    -- Une famille sans payeur ne porte personne : le parent qui rattache l'est.
    update public.families
      set data = data || jsonb_build_object('payerClientId', v_parent.id), updated_at = now()
      where id = v_family_id;
  end if;

  -- La tête naît — même forme que la validation du Trône.
  v_enfant_id := 'enf-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
  insert into public.clients (id, branch_id, data, updated_at)
  values (v_enfant_id, v_parent.branch_id, jsonb_build_object(
    'id', v_enfant_id,
    'branchId', v_parent.branch_id,
    'name', v_nom_complet,
    'phone', '',
    'city', coalesce(v_parent.data->>'city', ''),
    'persona', coalesce(v_parent.data->>'persona', ''),
    'since', to_char(current_date, 'YYYY-MM-DD'),
    'birthday', to_char(p_naissance, 'YYYY-MM-DD'),
    'familyId', v_family_id,
    'segments', jsonb_build_array('Enfant'),
    'priceCoef', coalesce((v_parent.data->>'priceCoef')::numeric, 1),
    'loyaltyPoints', 0
  ), now());

  -- Le journal : la Maison lit ce qui s'est rattaché, sans avoir à valider.
  insert into public.enfants_declares (id, branch_id, data, updated_at)
  values (v_dec_id, v_parent.branch_id, jsonb_build_object(
    'id', v_dec_id,
    'branchId', v_parent.branch_id,
    'clientId', v_parent.id,
    'prenom', btrim(p_prenom),
    'nom', btrim(p_nom),
    'birthday', to_char(p_naissance, 'YYYY-MM-DD'),
    'declareLe', to_char(current_date, 'YYYY-MM-DD'),
    'statut', 'accepté',
    'clientCreeId', v_enfant_id,
    'traiteLe', to_char(current_date, 'YYYY-MM-DD')
  ), now());

  return jsonb_build_object(
    'statut', 'cree',
    'enfantId', v_enfant_id,
    'familyId', v_family_id,
    'nom', v_nom_complet
  );
end;
$$;

revoke all on function public.rattacher_enfant(text, text, date) from public;
grant execute on function public.rattacher_enfant(text, text, date) to authenticated;

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
select proname as fonction, prosecdef as security_definer
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname in ('est_ma_tete', 'rattacher_enfant')
 order by 1;
