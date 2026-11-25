-- ═══════════════════════════════════════════════════════════════════════════
-- 0245 — LE CONTRÔLE SÓWÀ À J+7, POSÉ TOUT SEUL (25 novembre 2026)
--
-- « Pour un rituel Sówà, il faut toujours prendre un rendez-vous automatique
-- offert Sówà 7 jours plus tard avec la personne pour son suivi » (Yéman).
--
-- Toutes les dix minutes (pg_cron `pose-les-controles-sowa`), pour chaque
-- Rituel Sówà™ FERME (confirmé ou honoré ; une place en attente du oui de la
-- cliente attend ce oui), la Maison pose « Sówà™ · Le Contrôle à J+7 »
-- (`sv-sowa-controle`, 0 F, 45 min) sept jours plus tard, À LA MÊME HEURE,
-- chez Team, pour la même cliente. Quel que soit le chemin du rituel : le
-- Trône, le site, WhatsApp, Ma Couronne. Le contrôle porte `controleDe` (le
-- rituel) et `controlePourLe` (le jour du rituel quand il a été posé).
--
-- Une écriture du serveur, sans session : comme le comptoir, elle pose ce
-- qu'elle veut (`une_place_en_ligne` ne juge que les clientes) ; l'heure
-- d'ouverture (`pas_avant_l_ouverture`) vaut toujours. Le rendez-vous posé
-- part ensuite comme tout rendez-vous : la confirmation (`confirmation-rdv`),
-- la veille (`rappels_j1`).
--
-- JAMAIS DEUX : pas de contrôle si le rituel en a déjà un (même annulé : une
-- annulation de la Maison se respecte), ni si la cliente a déjà un contrôle
-- Sówà vivant entre le lendemain du rituel et trois semaines après (un
-- contrôle posé à la main compte). Pas de contrôle pour une fiche d'essai, ni
-- pour un rituel dont le septième jour est déjà passé.
--
-- LE CONTRÔLE SUIT SON RITUEL, tant que personne ne l'a touché (toujours
-- « confirmé », toujours au septième jour du rituel tel qu'il était) : le
-- rituel déplacé, le contrôle se déplace ; le rituel annulé, le contrôle
-- s'annule. Un contrôle déplacé ou retouché à la main ne bouge plus.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.pose_les_controles_sowa()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Le Rituel Sówà™ et son contrôle, au catalogue.
  rituel_sowa   constant text := '1740l5ysxj';
  le_controle   constant text := 'sv-sowa-controle';
  aujourdhui    date := (now() at time zone 'Africa/Porto-Novo')::date;
  maintenant    text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  r             record;
  c             record;
  cible         date;
  poses         integer := 0;
begin
  -- ── ① Poser les contrôles qui manquent ──────────────────────────────
  for r in
    select a.id, a.branch_id, a.data
      from public.appointments a
     where a.data->'serviceIds' ? rituel_sowa
       and coalesce(a.data->>'status', '') in ('confirmé', 'honoré')
       and coalesce(a.data->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
       and coalesce(a.data->>'time', '') ~ '^\d{1,2}:\d{2}'
       and coalesce(a.data->>'clientId', '') <> ''
       and coalesce(a.data->>'essai', '') <> 'true'
       -- Une place en attente du oui de la cliente attend ce oui.
       and not (a.data ? 'attenduJusquAu' and coalesce(a.data->>'confirmeeParLaClienteLe', '') = ''
                and coalesce(a.data->>'status', '') = 'confirmé')
       and (a.data->>'date')::date + 7 >= aujourdhui
       and not exists (select 1 from public.appointments k where k.data->>'controleDe' = a.id)
       and not exists (
         select 1 from public.appointments k
          where k.data->>'clientId' = a.data->>'clientId'
            and k.data->'serviceIds' ? le_controle
            and coalesce(k.data->>'status', '') <> 'annulé'
            and coalesce(k.data->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
            and (k.data->>'date')::date between (a.data->>'date')::date + 1 and (a.data->>'date')::date + 21)
       and not exists (
         select 1 from public.clients cl
          where cl.id = a.data->>'clientId' and coalesce(cl.data->>'essai', '') = 'true')
  loop
    cible := (r.data->>'date')::date + 7;
    begin
      insert into public.appointments (id, branch_id, data)
      values (
        'ctl-' || r.id,
        coalesce(r.branch_id, r.data->>'branchId'),
        jsonb_strip_nulls(jsonb_build_object(
          'id', 'ctl-' || r.id,
          'branchId', r.data->>'branchId',
          'clientId', r.data->>'clientId',
          'clientName', r.data->'clientName',
          'serviceIds', jsonb_build_array(le_controle),
          'date', to_char(cible, 'YYYY-MM-DD'),
          'time', r.data->>'time',
          'master', 'Team',
          'status', 'confirmé',
          'priceXof', 0,
          'dureeMin', 45,
          'source', 'trone',
          'creeLe', maintenant,
          'poseePar', 'la Maison : le contrôle Sówà à J+7',
          'controleDe', r.id,
          'controlePourLe', r.data->>'date')))
      on conflict (id) do nothing;
      if found then poses := poses + 1; end if;
    exception when others then
      raise warning 'contrôle Sówà du rituel % non posé : %', r.id, sqlerrm;
    end;
  end loop;

  -- ── ② Le contrôle suit son rituel, tant que personne ne l'a touché ──
  for c in
    select k.id, k.data as controle, a.data as rituel
      from public.appointments k
      join public.appointments a on a.id = k.data->>'controleDe'
     where coalesce(k.data->>'status', '') = 'confirmé'
       and coalesce(k.data->>'controlePourLe', '') ~ '^\d{4}-\d{2}-\d{2}$'
       and coalesce(k.data->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
       -- Personne ne l'a touché : toujours au septième jour du rituel tel qu'il était.
       and (k.data->>'date')::date = (k.data->>'controlePourLe')::date + 7
       and (k.data->>'date')::date >= aujourdhui
       and (coalesce(a.data->>'status', '') = 'annulé'
            or coalesce(a.data->>'date', '') <> k.data->>'controlePourLe'
            or coalesce(a.data->>'time', '') <> coalesce(k.data->>'time', ''))
  loop
    begin
      if coalesce(c.rituel->>'status', '') = 'annulé' then
        update public.appointments
           set data = data || jsonb_build_object('status', 'annulé', 'annuleLe', maintenant,
                                                 'raisonAnnulation', 'le Rituel Sówà a été annulé'),
               updated_at = now()
         where id = c.id;
      elsif coalesce(c.rituel->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
            and (c.rituel->>'date')::date + 7 >= aujourdhui then
        update public.appointments
           set data = data || jsonb_build_object(
                 'date', to_char((c.rituel->>'date')::date + 7, 'YYYY-MM-DD'),
                 'time', c.rituel->>'time',
                 'controlePourLe', c.rituel->>'date'),
               updated_at = now()
         where id = c.id;
      end if;
    exception when others then
      raise warning 'contrôle Sówà % non réaligné : %', c.id, sqlerrm;
    end;
  end loop;

  return poses;
end;
$$;

revoke all on function public.pose_les_controles_sowa() from public, anon, authenticated;

-- ── La tâche : toutes les dix minutes ─────────────────────────────────
do $$
begin
  if exists (select 1 from cron.job where jobname = 'pose-les-controles-sowa') then
    perform cron.unschedule('pose-les-controles-sowa');
  end if;
  perform cron.schedule('pose-les-controles-sowa', '*/10 * * * *', 'select public.pose_les_controles_sowa();');
end;
$$;

-- ── Un premier passage tout de suite, et ce qu'il a posé ──────────────
select public.pose_les_controles_sowa() as controles_poses,
       (select count(*) from public.appointments where data->>'controleDe' is not null) as controles_en_base,
       (select jobname from cron.job where jobname = 'pose-les-controles-sowa') as tache;
