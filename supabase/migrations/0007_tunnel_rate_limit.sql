-- ═══════════════════════════════════════════════════════════════════
-- 0007 — Limite de débit du tunnel public (à coller dans Supabase → SQL Editor).
--
-- Une seule limite (par IP, fenêtre glissante) couvre les deux portes publiques :
--   • l'alerte du personnel (push-notify, mode 'staff') ;
--   • le dépôt d'une consultation (push-notify, mode 'tunnel-submit').
-- Le tunnel passe désormais par la fonction Edge, qui applique la limite PUIS
-- insère la consultation avec le service role : l'INSERT anonyme direct sur
-- consultations_queue se ferme (cq_submit). Prérequis : redéployer la fonction
-- push-notify (mode tunnel-submit) AVANT ou en même temps que cette migration.
-- ═══════════════════════════════════════════════════════════════════

-- Journal de débit lu/écrit uniquement par la fonction Edge (service role).
create table if not exists public.edge_rate_limits (
  id bigint generated always as identity primary key,
  bucket text not null,
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists edge_rate_limits_idx on public.edge_rate_limits (bucket, ip, at desc);
alter table public.edge_rate_limits enable row level security;
-- Aucune policy : ni anon ni authenticated n'y accèdent — service role seulement.

-- Fermer le dépôt anonyme direct : le tunnel passe par la fonction Edge.
drop policy if exists cq_submit on public.consultations_queue;

-- Vérification : la policy anonyme a disparu, la table de débit existe.
select polname from pg_policy where polrelid = 'public.consultations_queue'::regclass;
select 'edge_rate_limits' as table_ok, count(*) from public.edge_rate_limits;
