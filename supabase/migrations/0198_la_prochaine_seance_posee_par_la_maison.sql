-- ═══════════════════════════════════════════════════════════════════════
-- 0198 — La prochaine séance de l'abonnée, posée par la Maison depuis WhatsApp
-- 8 novembre 2026, lot 4 de l'abonnement refait.
--
-- « Merci, Awa. Votre prochaine séance : samedi 23 janvier 2027 à 9 h ? »
-- part de la salle d'attente quand sa séance de formule est marquée faite ;
-- « Oui, je réserve » revient au webhook WhatsApp, qui pose la place pour
-- elle. La fonction de Ma Couronne, `reserver_une_seance_incluse` (0138),
-- exige la connexion de la cliente (`auth.uid()`, `est_ma_tete`) : le serveur
-- de la Maison, lui, n'a pas de compte. Celle-ci est sa JUMELLE pour la
-- Maison : les mêmes juges, dans le même ordre, sous les mêmes verrous
-- (`abo_peut_porter` : la formule en cours, la date dans sa vie et sur une
-- lune réglée, un crédit libre ; `abo_place_libre` sous le verrou de la pose :
-- la place libre aux fauteuils, le maître libre), la même séance écrite
-- (couverte, 0 F, sans acompte). Ce qui change : la tête se nomme
-- (`p_client_id`, qui doit être celle du contrat), et la source dit d'où
-- vient le geste (`whatsapp` par défaut). Le webhook ne l'appelle qu'après
-- avoir vérifié que le bouton vient du numéro à qui le message est parti.
--
-- LA CONFIRMATION SE DIT DANS LA CONVERSATION (11 novembre 2026), comme pour
-- l'automate (`pose_si_libre`, 0125 puis 0168) : `p_envoi` est la ligne
-- `conf-<rdv>-whatsapp`, posée « en cours » AVEC la séance, sous le même
-- verrou. Elle tait le modèle de `confirmation-rdv` (une séance, une seule
-- confirmation) ; le webhook la passe « envoyé » quand sa phrase est partie,
-- « échec » sinon, et le modèle reprend alors la main.
--
-- RÉSERVÉE AU SERVICE : aucune session (anon, authenticated) ne peut
-- l'appeler. Rien d'autre ne change : 0138 et ses gardes restent telles
-- quelles. Rejouable (create or replace). Dépend de 0138 (abo_*), 0125
-- (duree_du_rdv), 0167 (le déclencheur `pas_avant_l_ouverture` sur
-- appointments joue à l'insertion, comme pour toute pose).
-- ═══════════════════════════════════════════════════════════════════════

-- Le premier jet (six paramètres, jamais appliqué) ne doit pas rester à côté.
drop function if exists public.reserver_une_seance_incluse_par_la_maison(text, text, text, text, text, text);

create or replace function public.reserver_une_seance_incluse_par_la_maison(
  p_client_id  text,
  p_sub_id     text,
  p_service_id text,
  p_date       text,
  p_time       text,
  p_source     text default 'whatsapp',
  p_envoi      jsonb default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_sub     public.subscribers%rowtype;
  v_tete    public.clients%rowtype;
  v_jour    date := public.abo_aujourdhui();
  v_quand   date := public.abo_date(p_date);
  v_raison  text;
  v_maitre  text;
  v_duree   int;
  v_branche text;
  v_source  text := case when coalesce(p_source, '') in ('whatsapp', 'trone', 'assistant') then p_source else 'whatsapp' end;
  v_id      text;
  v_rdv     jsonb;
begin
  if coalesce(p_client_id, '') = '' or coalesce(p_sub_id, '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'tete_refusee');
  end if;
  if v_quand is null or coalesce(p_time, '') !~ '^\d{2}:\d{2}$' or coalesce(p_service_id, '') = '' then
    return jsonb_build_object('ok', false, 'raison', 'creneau_invalide');
  end if;
  if v_quand < v_jour or (v_quand = v_jour
       and p_time <= to_char(public.abo_maintenant() at time zone 'Africa/Porto-Novo', 'HH24:MI')) then
    return jsonb_build_object('ok', false, 'raison', 'creneau_passe');
  end if;
  if v_quand > v_jour + 90 then
    return jsonb_build_object('ok', false, 'raison', 'creneau_hors_fenetre');
  end if;

  select * into v_sub from public.subscribers where id = p_sub_id for update;
  if v_sub.id is null then
    return jsonb_build_object('ok', false, 'raison', 'contrat_introuvable');
  end if;
  -- LA TÊTE NOMMÉE DOIT ÊTRE CELLE DU CONTRAT : le webhook a déjà vérifié que
  -- le bouton vient du numéro à qui le message est parti ; le serveur
  -- revérifie le lien entre la tête et la formule.
  if p_client_id <> coalesce(v_sub.data->>'clientId', '') then
    return jsonb_build_object('ok', false, 'raison', 'tete_refusee');
  end if;
  select * into v_tete from public.clients where id = v_sub.data->>'clientId';

  v_raison := public.abo_peut_porter(v_sub.id, p_service_id, v_quand, v_jour, null);
  if v_raison is not null then
    return jsonb_build_object('ok', false, 'raison', v_raison);
  end if;

  v_maitre := coalesce((select cs.data->>'master' from public.catalog_services cs where cs.id = p_service_id), '');
  v_duree := public.duree_du_rdv(jsonb_build_object('serviceIds', to_jsonb(array[p_service_id])));
  v_branche := coalesce(v_sub.branch_id, v_sub.data->>'branchId', v_tete.branch_id);

  perform pg_advisory_xact_lock(hashtext('pose'), hashtext(v_branche || ':' || p_date));
  v_raison := public.abo_place_libre(v_branche, p_date, p_time, v_duree, v_maitre, v_sub.data->>'clientId', null);
  if v_raison is not null then
    return jsonb_build_object('ok', false, 'raison', v_raison);
  end if;

  v_id := 'rdv-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_rdv := jsonb_strip_nulls(jsonb_build_object(
    'id', v_id,
    'branchId', v_branche,
    'clientId', v_sub.data->>'clientId',
    'clientName', coalesce(v_tete.data->>'name', v_sub.data->>'name'),
    'serviceIds', to_jsonb(array[p_service_id]),
    'date', p_date,
    'time', p_time,
    'master', v_maitre,
    'dureeMin', v_duree,
    'status', 'confirmé',
    'coveredBySub', true,
    'subId', v_sub.id,
    'coverKind', 'abonnement',
    'coverServiceId', p_service_id,
    'source', v_source,
    'poseeParLaMaison', jsonb_build_object('le', public.abo_iso(public.abo_maintenant()), 'par', 'prochaine-seance'),
    'creeLe', public.abo_iso(public.abo_maintenant()),
    'priceXof', 0,
    'depositXof', 0
  ));

  insert into public.appointments (id, branch_id, data) values (v_id, v_branche, v_rdv);

  -- LA LIGNE QUI TAIT LE MODÈLE DE CONFIRMATION : son identifiant est
  -- toujours conf-<rdv>-whatsapp (celui que lit confirmation-rdv).
  if p_envoi is not null and jsonb_typeof(p_envoi) = 'object' then
    insert into public.envois (id, branch_id, data)
    values ('conf-' || v_id || '-whatsapp',
            coalesce(nullif(p_envoi->>'branchId', ''), v_branche),
            p_envoi || jsonb_build_object('id', 'conf-' || v_id || '-whatsapp', 'apptId', v_id))
    on conflict (id) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'apptId', v_id, 'etat', 'confirmee',
    'disponiblesApres', public.abo_disponibles(v_sub.id, p_service_id, v_quand, v_jour));
end;
$$;

revoke all on function public.reserver_une_seance_incluse_par_la_maison(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.reserver_une_seance_incluse_par_la_maison(text, text, text, text, text, text, jsonb) to service_role;

-- ── Vérification : une fonction, au service seul ───────────────────────
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reserver_une_seance_incluse_par_la_maison') as fonctions,
  has_function_privilege('service_role', 'public.reserver_une_seance_incluse_par_la_maison(text, text, text, text, text, text, jsonb)', 'execute') as service_execute,
  has_function_privilege('authenticated', 'public.reserver_une_seance_incluse_par_la_maison(text, text, text, text, text, text, jsonb)', 'execute') as authenticated_execute,
  has_function_privilege('anon', 'public.reserver_une_seance_incluse_par_la_maison(text, text, text, text, text, text, jsonb)', 'execute') as anon_execute;
