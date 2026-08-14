-- ═══════════════════════════════════════════════════════════════════
-- 0051 — LES MOTIFS DU FOYER (registre éditable)
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Les motifs des retraits du foyer — Maison, École, Santé… — vivaient
-- FIGÉS dans le code : en ajouter un demandait une publication. Ils
-- deviennent un registre que la Maison tient elle-même (un motif, ses
-- sous-motifs), partagé par les retraits du foyer ET les mouvements des
-- caisses indépendantes — une seule liste pour toute la maison.
--
-- ⚠ SANS CETTE TABLE, la pastille de synchro vire au rouge : Le Trône s'y
--   lie déjà (`bindCollection(motifsFoyerStore, 'motifs_foyer')`).
--
-- Le foyer est l'affaire du couple : comme les prélèvements et les prêts,
-- ce registre est réservé au SOUVERAIN.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.motifs_foyer (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.motifs_foyer enable row level security;

drop policy if exists staff_all on public.motifs_foyer;
drop policy if exists souverain_all on public.motifs_foyer;

create policy souverain_all on public.motifs_foyer for all to authenticated
  using (public.is_souverain()) with check (public.is_souverain());

-- Le tampon d'horodatage, comme partout ailleurs.
drop trigger if exists motifs_foyer_touch on public.motifs_foyer;
create trigger motifs_foyer_touch before update on public.motifs_foyer
  for each row execute function public.touch_updated_at();

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
select polname as politique, polcmd as commande
  from pg_policy
 where polrelid = 'public.motifs_foyer'::regclass
 order by 1;
