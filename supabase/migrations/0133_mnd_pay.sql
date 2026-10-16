-- ═══════════════════════════════════════════════════════════════════
-- 0133 — MND PAY · 16 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc,
-- rejouable sans dommage.
--
-- Maquette UigU1Rr5… validée (« construis ») : une seule caisse, et le
-- paiement qui se confirme tout seul. La caissière DEMANDE (mobile money au
-- téléphone de la cliente, ou QR / lien pour la carte) ; FedaPay CONFIRME ;
-- le Trône le voit tomber à l'instant.
--
--   · `mnd_pay` : une ligne par DEMANDE de paiement. Elle naît dans la
--     fonction `mnd-pay` (clé de service) et ne change d'état que par elle
--     ou par `mnd-pay-webhook`, qui redemande chaque fois la vérité à FedaPay.
--     LE PERSONNEL LIT, PERSONNE N'ÉCRIT : aucune politique d'écriture n'est
--     donnée au rôle `authenticated`. Une caissière ne peut pas déclarer
--     « payé » à la place du prestataire, et une cliente encore moins.
--   · Realtime : la ligne qui passe « payée » se voit au comptoir pendant que
--     la cliente range son téléphone.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'is_staff') then
    raise exception 'is_staff() est absente : passez d’abord 0003_auth.sql';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'touch_updated_at') then
    raise exception 'touch_updated_at() est absente : passez d’abord 0012_payments.sql';
  end if;
end $$;

-- ── ① LES DEMANDES ──────────────────────────────────────────────────
create table if not exists public.mnd_pay (
  id         text primary key,          -- « mp-… », donné par la fonction
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists mnd_pay_branch_idx on public.mnd_pay (branch_id);
-- Le webhook retrouve la demande par l'identifiant de transaction FedaPay.
create index if not exists mnd_pay_fedapay_idx on public.mnd_pay ((data->>'fedapayId'));
-- Le comptoir retrouve les demandes d'une pièce.
create index if not exists mnd_pay_piece_idx on public.mnd_pay ((data->>'pieceId'));

drop trigger if exists mnd_pay_touch on public.mnd_pay;
create trigger mnd_pay_touch before update on public.mnd_pay
  for each row execute function public.touch_updated_at();

-- ── ② LE PERSONNEL LIT, PERSONNE N'ÉCRIT ─────────────────────────────
alter table public.mnd_pay enable row level security;
drop policy if exists staff_all on public.mnd_pay;
drop policy if exists staff_lit on public.mnd_pay;
create policy staff_lit on public.mnd_pay for select to authenticated
  using (public.is_staff());

-- ── ③ REALTIME ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mnd_pay'
  ) then
    execute 'alter publication supabase_realtime add table public.mnd_pay';
  end if;
end $$;

-- ── CONTRÔLE ────────────────────────────────────────────────────────
-- Doit rendre : table true · rls true · politiques 1 (lecture seule) · realtime true
select
  to_regclass('public.mnd_pay') is not null                                   as table_mnd_pay,
  (select relrowsecurity from pg_class where oid = 'public.mnd_pay'::regclass) as rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'mnd_pay') as politiques,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'mnd_pay' and cmd <> 'SELECT') as politiques_d_ecriture,
  exists (select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mnd_pay') as realtime;
