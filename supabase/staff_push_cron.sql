-- =====================================================================
-- Maison MND — Alertes PERSONNEL planifiées : « Rendez-vous dans moins d'1h ».
-- Appelle la fonction Edge push-notify en mode 'staff-cron' toutes les 15 min.
-- La fonction ne pousse chaque RDV qu'UNE fois (journal push_reminders, kind 'staff-h1').
--
-- PRÉREQUIS :
--   • La fonction Edge push-notify est déployée AVEC le mode 'staff-cron'
--     (voir supabase/functions/push-notify/index.ts).
--   • Le personnel a activé les notifications sur son appareil (cloche du Trône).
--   • Extensions pg_cron + pg_net activées (déjà le cas si les rappels clientes tournent).
--
-- À FAIRE : remplacez <CRON_SECRET> par le MÊME secret que celui de la fonction
--           (le même que celui utilisé pour le cron des rappels clientes).
--
-- À coller dans Supabase → SQL Editor → Run. Idempotent (désinscrit l'ancien d'abord).
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Désinscription si déjà planifié (évite les doublons de planification).
select cron.unschedule('mnd-staff-rdv-1h')
where exists (select 1 from cron.job where jobname = 'mnd-staff-rdv-1h');

-- Toutes les 15 minutes : pousse au personnel les RDV qui commencent dans ≤ 1h.
select cron.schedule('mnd-staff-rdv-1h', '*/15 * * * *', $$
  select net.http_post(
    url     := 'https://rxjarbxjiogijmkywfsr.supabase.co/functions/v1/push-notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_wgRDrsUY19mEyCdBkxAwmA_o6wECp0R',  -- requis par la passerelle
      'x-cron-secret', '<CRON_SECRET>'                                            -- MÊME secret que la fonction
    ),
    body    := jsonb_build_object('mode', 'staff-cron')
  );
$$);

-- Vérif (facultatif) : liste des tâches planifiées.
-- select jobid, jobname, schedule, active from cron.job order by jobid;
