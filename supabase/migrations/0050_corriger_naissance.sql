-- ═══════════════════════════════════════════════════════════════════
-- 0050 — LA NAISSANCE D'UN ENFANT SE CORRIGE DEPUIS MA COURONNE.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Une date de naissance mal saisie au rattachement fausse l'âge affiché —
-- et c'est elle qui commande l'accès du parent. Or la RLS (à raison)
-- n'autorise une cliente qu'à écrire SA fiche : la correction passe donc
-- par le serveur, comme le rattachement (0044/0046).
--
-- Les gardes : la tête doit être UN MINEUR QUE LE PARENT PORTE (le juge
-- est_ma_tete tranche — famille, payeur, minorité) ; et la date corrigée
-- doit LAISSER l'enfant mineur — une date qui le rend majeur détache la
-- fiche, ce passage-là se fait au salon, pas d'un doigt sur un téléphone.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.corriger_naissance_enfant(
  p_enfant text,
  p_naissance date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := (auth.uid())::text;
  v_enfant public.clients%rowtype;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;
  if p_naissance is null then
    raise exception 'Il manque la date de naissance.';
  end if;
  if p_naissance > current_date then
    raise exception 'Cette date est dans l''avenir.';
  end if;

  select * into v_enfant from public.clients where id = p_enfant;
  if v_enfant.id is null then
    raise exception 'Fiche introuvable.';
  end if;

  -- Sa propre fiche n'est pas celle d'un enfant.
  if v_enfant.id = v_uid or v_enfant.data->>'authUserId' = v_uid then
    raise exception 'Cette fiche est la vôtre — pas celle d''un enfant.';
  end if;

  -- Un mineur que je porte — le juge de la maison tranche.
  if not public.est_ma_tete(p_enfant) then
    raise exception 'Cette tête n''est pas sur votre compte.';
  end if;

  -- La correction doit LAISSER l'enfant mineur.
  if p_naissance <= (current_date - interval '18 years') then
    raise exception 'Cette date en ferait une personne majeure — passez au salon pour ce changement.';
  end if;

  update public.clients
    set data = data || jsonb_build_object('birthday', to_char(p_naissance, 'YYYY-MM-DD')),
        updated_at = now()
    where id = p_enfant;

  return jsonb_build_object('statut', 'ok', 'naissance', to_char(p_naissance, 'YYYY-MM-DD'));
end;
$$;

revoke all on function public.corriger_naissance_enfant(text, date) from public;
grant execute on function public.corriger_naissance_enfant(text, date) to authenticated;

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
select proname as fonction, prosecdef as security_definer
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'corriger_naissance_enfant';
