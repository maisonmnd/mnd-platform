-- =====================================================================
-- Maison MND — Web Push (notifications téléphone Ma Couronne).
-- À coller dans Supabase → SQL Editor → Run. Idempotent.
-- =====================================================================

-- Un abonnement Web Push par appareil, rattaché à la cliente (auth.uid()).
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  client_id  uuid not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_sub_client_idx on public.push_subscriptions (client_id);

alter table public.push_subscriptions enable row level security;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- La cliente gère ses propres abonnements ; le personnel peut lire (is_staff existe déjà).
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (client_id = auth.uid() or public.is_staff())
  with check (client_id = auth.uid() or public.is_staff());

-- Journal des rappels déjà envoyés (évite les doublons). Réservé au service (fonction Edge).
create table if not exists public.push_reminders (
  appointment_id text not null,
  kind           text not null,   -- 'j-1' | 'h-2'
  sent_at        timestamptz not null default now(),
  primary key (appointment_id, kind)
);
alter table public.push_reminders enable row level security;  -- aucune policy → service_role uniquement

-- =====================================================================
-- Rappels planifiés — appelle la fonction Edge toutes les heures via pg_cron.
-- Remplacez <PROJECT_REF> et <CRON_SECRET> (le même que le secret de la fonction).
-- =====================================================================
-- create extension if not exists pg_cron;
-- create extension if not exists pg_net;
--
-- select cron.schedule('mnd-push-rappels', '0 * * * *', $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/push-notify',
--     headers := jsonb_build_object(
--       'Content-Type','application/json',
--       'Authorization','Bearer <PUBLISHABLE_KEY>',   -- requis par la passerelle
--       'x-cron-secret','<CRON_SECRET>'
--     ),
--     body    := jsonb_build_object('mode','reminders')
--   );
-- $$);
