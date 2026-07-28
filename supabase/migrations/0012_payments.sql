-- ═══════════════════════════════════════════════════════════════════
-- 0012 — Paiements en ligne (KkiaPay) : registre des transactions
-- (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- Une ligne par TRANSACTION. C'est de l'argent : collection, jamais un
-- document LWW — même contrat que tips / coffre_movements.
--
-- LA CLÉ PRIMAIRE EST L'IDENTIFIANT DE TRANSACTION KKIAPAY. C'est ce qui rend
-- l'encaissement idempotent : KkiaPay réessaie son webhook 5 fois de suite,
-- et la fonction de vérification peut être appelée en même temps par la
-- cliente — un `on conflict do nothing` suffit alors à garantir qu'un
-- paiement n'est enregistré (ni recrédité, ni recommissionné) qu'une fois.
--
-- ÉCRITURE : réservée au serveur (fonctions Edge, clé de service — la RLS ne
-- s'y applique pas). Aucune policy d'insertion n'est donnée au rôle
-- `authenticated` : une cliente ne doit JAMAIS pouvoir déclarer elle-même
-- qu'elle a payé. Le personnel lit (et corrige au besoin).
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- 1) Table collection standard.
create table if not exists public.payments (
  id text primary key,           -- transactionId KkiaPay
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists payments_branch_idx on public.payments (branch_id);
-- Retrouver le paiement d'une réservation (partnerId = id du rendez-vous).
create index if not exists payments_partner_idx on public.payments ((data->>'partnerId'));

drop trigger if exists payments_touch on public.payments;
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- 2) RLS : le personnel voit tout ; personne d'autre n'écrit.
alter table public.payments enable row level security;
drop policy if exists staff_all on public.payments;
create policy staff_all on public.payments for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- 3) Realtime — le Trône voit le paiement tomber pendant que la cliente est
--    encore à l'écran de confirmation.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'payments'
  ) then
    execute 'alter publication supabase_realtime add table public.payments';
  end if;
end $$;

-- Vérification : la table existe et est vide au départ.
select 'payments' as table_ok, count(*) as lignes from public.payments;
