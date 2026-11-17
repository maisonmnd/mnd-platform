-- ═══════════════════════════════════════════════════════════════════════════
-- 0223 · DÉPLACER SOUS LE VERROU DES PLACES · 17 novembre 2026
--
-- Déplacer son rendez-vous depuis le site (7 novembre 2026) se fait désormais
-- comme une pose : sous le verrou des places, et compté.
--
-- `deplace_si_libre` écrit le déplacement SOUS LE MÊME VERROU que les poses
-- (une maison, un jour : celui de l'arrivée) et rejoue, sous ce verrou, ce que
-- demande-submit a jugé sur son instantané :
--   · la ligne n'a pas bougé depuis qu'elle a été lue (`p_vu`), sinon « modifie » ;
--   · le rendez-vous se déplace encore (confirmé ou en attente), deux fois au
--     plus depuis le site (`deplacements`, DEPLACEMENTS_AU_PLUS) ;
--   · jamais avant 08:30, jamais aujourd'hui ni avant, jamais après la borne ;
--   · le plafond de la Maison, les places en ligne et SON maître, lui-même
--     retiré du compte ;
--   · `p_sans_remise` : la remise ne suit pas un autre jour (la place limitée
--     d'un jour, le mercredi de la Maison déplacé à un samedi) : ses lignes
--     tombent, la note le dit, et le code ne compte plus pour une fois.
-- Jamais un autre maître, une autre durée, un autre soin, un autre statut.
--
-- Les murs posés à la main restent jugés par demande-submit, comme pour une
-- pose : la base ne les lit pas.
--
-- Rejouable : `create or replace`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.deplace_si_libre(
  p_id          text,
  p_date        text,
  p_time        text,
  p_vu          timestamptz,
  p_sans_remise boolean default false
) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  rdv        record;
  d          jsonb;
  branche    text;
  maitre     text;
  aujourdhui text := to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD');
  borne      text := to_char(date_trunc('month', now() at time zone 'Africa/Porto-Novo') + interval '4 months' - interval '1 day', 'YYYY-MM-DD');
  maintenant text := public.abo_iso(now());
  debut      int;
  duree      int;
  faits      int;
  cap_maison int;
  cap_maitre int;
  sieges     int;
begin
  if btrim(coalesce(p_id, '')) = ''
     or coalesce(p_date, '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_time, '') !~ '^\d{2}:\d{2}$' then
    return jsonb_build_object('ok', false, 'raison', 'creneau_invalide');
  end if;
  select a.id, a.branch_id, a.data into rdv from public.appointments a where a.id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'introuvable');
  end if;
  branche := btrim(coalesce(nullif(rdv.data->>'branchId', ''), rdv.branch_id, ''));

  -- LE VERROU DES POSES, pour le jour d'arrivée ; puis la ligne, relue sous lui.
  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(branche || ':' || p_date));
  select a.id, a.data, a.updated_at into rdv from public.appointments a where a.id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'raison', 'introuvable');
  end if;
  if p_vu is null or rdv.updated_at is distinct from p_vu then
    return jsonb_build_object('ok', false, 'raison', 'modifie');
  end if;
  d := rdv.data;
  if coalesce(d->>'status', '') = 'annulé' then
    return jsonb_build_object('ok', false, 'raison', 'annule');
  end if;
  if coalesce(d->>'status', '') not in ('confirmé', 'en attente') then
    return jsonb_build_object('ok', false, 'raison', 'passe');
  end if;
  if coalesce(d->>'date', '') = p_date and coalesce(d->>'time', '') = p_time then
    return jsonb_build_object('ok', false, 'raison', 'meme_place');
  end if;

  -- DEUX FOIS AU PLUS DEPUIS LE SITE (DEPLACEMENTS_AU_PLUS). Un rendez-vous
  -- déplacé avant que le compte existe en compte un.
  faits := greatest(
    case when btrim(coalesce(d->>'deplacements', '')) ~ '^\d{1,3}$' then btrim(d->>'deplacements')::int else 0 end,
    case when btrim(coalesce(d->>'deplaceLe', '')) <> '' and coalesce(d->>'deplacePar', '') = 'site' then 1 else 0 end);
  if faits >= 2 then
    return jsonb_build_object('ok', false, 'raison', 'trop_de_deplacements');
  end if;

  debut := public.minutes_de_l_heure(p_time);
  if debut is null or debut < 510 then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_ouverture');
  end if;
  if p_date <= aujourdhui or p_date > borne then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_fenetre');
  end if;
  duree  := public.duree_du_rdv(d);
  maitre := coalesce(d->>'master', '');

  select case when btrim(coalesce(s.data->>'maxRdvParJourMaison', '')) ~ '^\d{1,4}(\.\d+)?$'
              then floor(btrim(s.data->>'maxRdvParJourMaison')::numeric)::int else 0 end,
         case when btrim(coalesce(s.data->>'maxRdvParJourMaitre', '')) ~ '^\d{1,4}(\.\d+)?$'
              then floor(btrim(s.data->>'maxRdvParJourMaitre')::numeric)::int else 0 end
    into cap_maison, cap_maitre
    from public.documents s
   where s.key = 'mnd_settings';
  cap_maison := coalesce(cap_maison, 0);
  cap_maitre := coalesce(cap_maitre, 0);
  begin
    sieges := public.places_en_ligne(branche, p_date::date);
  exception when others then
    sieges := null;
  end;
  sieges := greatest(1, coalesce(sieges, 1));

  -- Le plafond de la Maison, sans lui.
  if cap_maison > 0 and (
       select count(*) from public.appointments a
        where a.id <> p_id
          and a.data->>'branchId' = branche
          and a.data->>'date' = p_date
          and coalesce(a.data->>'status', '') <> 'annulé'
          and coalesce(a.data->>'time', '') <> ''
     ) >= cap_maison then
    return jsonb_build_object('ok', false, 'raison', 'creneau_plafond');
  end if;
  -- Les places en ligne de cette heure, sans lui.
  if (select count(*) from public.appointments a
       where a.id <> p_id
         and a.data->>'branchId' = branche
         and a.data->>'date' = p_date
         and coalesce(a.data->>'status', '') <> 'annulé'
         and public.minutes_de_l_heure(a.data->>'time') is not null
         and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
         and debut + duree > public.minutes_de_l_heure(a.data->>'time')
     ) >= sieges then
    return jsonb_build_object('ok', false, 'raison', 'creneau_pris', 'detail', 'fauteuils');
  end if;
  -- SON maître : son plafond du jour, et sa place à cette heure, sans lui.
  if cap_maitre > 0 and (
       select count(*) from public.appointments a
        where a.id <> p_id
          and a.data->>'branchId' = branche
          and a.data->>'date' = p_date
          and coalesce(a.data->>'status', '') <> 'annulé'
          and coalesce(a.data->>'time', '') <> ''
          and coalesce(a.data->>'master', '') = maitre
     ) >= cap_maitre then
    return jsonb_build_object('ok', false, 'raison', 'creneau_plafond');
  end if;
  if exists (
       select 1 from public.appointments a
        where a.id <> p_id
          and a.data->>'branchId' = branche
          and a.data->>'date' = p_date
          and coalesce(a.data->>'status', '') <> 'annulé'
          and coalesce(a.data->>'master', '') = maitre
          and public.minutes_de_l_heure(a.data->>'time') is not null
          and debut < public.minutes_de_l_heure(a.data->>'time') + public.duree_du_rdv(a.data)
          and debut + duree > public.minutes_de_l_heure(a.data->>'time')
     ) then
    return jsonb_build_object('ok', false, 'raison', 'creneau_pris');
  end if;

  -- ÉCRIRE. La remise qui ne suit pas tombe ici, avec le déplacement.
  d := (d - 'autreMomentDemandeLe') || jsonb_build_object(
         'date', p_date, 'time', p_time, 'deplaceLe', maintenant, 'deplacePar', 'site',
         'deplaceDe', jsonb_build_object('date', d->>'date', 'time', d->>'time'),
         'deplacements', faits + 1);
  if coalesce(p_sans_remise, false) and d ? 'remisesLignes' then
    d := (d - 'remisesLignes' - 'placeLimitee') || jsonb_build_object(
           'remiseRetireeLe', maintenant,
           'note', concat_ws(' · ', nullif(btrim(coalesce(d->>'note', '')), ''),
                             'Remise non reportée : le rendez-vous a changé de jour'));
    update public.demandes x set data = x.data - 'codeApplique' where x.data->>'apptId' = p_id;
  end if;
  update public.appointments set data = d where id = p_id;
  return jsonb_build_object('ok', true, 'verdict', 'deplace', 'deplacements', faits + 1,
                            'sansRemise', coalesce(p_sans_remise, false) and rdv.data ? 'remisesLignes');
end $$;

revoke all on function public.deplace_si_libre(text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.deplace_si_libre(text, text, text, timestamptz, boolean) to service_role;


-- ── Contrôle ───────────────────────────────────────────────────────────────
-- Trois « oui » attendus.
select
  (select position('hashtext(''pose'')' in pg_get_functiondef('public.deplace_si_libre(text, text, text, timestamptz, boolean)'::regprocedure)) > 0) as sous_le_verrou_des_poses,
  (select position('trop_de_deplacements' in pg_get_functiondef('public.deplace_si_libre(text, text, text, timestamptz, boolean)'::regprocedure)) > 0) as deux_fois_au_plus,
  not has_function_privilege('anon', 'public.deplace_si_libre(text, text, text, timestamptz, boolean)', 'execute') as verrou_au_serveur;
