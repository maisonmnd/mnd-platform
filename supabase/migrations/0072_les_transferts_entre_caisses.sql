-- ═══════════════════════════════════════════════════════════════════
-- 0072 — LES TRANSFERTS ENTRE CAISSES · 22 août 2026
--
-- « Je peux faire des transferts ? » Non — et c'était un manque.
--
-- Déplacer 50 000 F de la Caisse Principale vers le Tiroir EUR n'existait
-- pas. On ne pouvait le faire qu'en trichant : une fausse dépense d'un côté,
-- un faux encaissement de l'autre. Deux comptes salis pour un seul geste, et
-- deux lignes qui mentent chacune sur ce qu'elles sont.
--
-- UN TRANSFERT EST UNE SEULE ÉCRITURE À DEUX BOUTS : la caisse de départ
-- baisse, celle d'arrivée monte, du même mouvement. Rien n'est créé, rien
-- n'est détruit — c'est ce qui le distingue d'une dépense, et c'est pourquoi
-- il ne doit apparaître NI dans les dépenses NI dans les encaissements.
--
-- ENTRE DEUX DEVISES, ce qui arrive n'est pas ce qui part : `recuXof` porte
-- le montant reçu, dans la devise de la caisse d'arrivée. Le convertir à la
-- lecture, au taux d'un autre jour, réécrirait l'histoire — même règle que le
-- prix figé d'un rituel.
--
-- Le retour du coffre vers une caisse, lui, ne demande aucune table : il
-- s'écrit dans `coffre_movements` avec le genre « retrait » (JSON).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.transferts_caisse (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists transferts_caisse_branch_idx on public.transferts_caisse (branch_id);

drop trigger if exists transferts_caisse_touch on public.transferts_caisse;
create trigger transferts_caisse_touch before update on public.transferts_caisse
  for each row execute function public.touch_updated_at();

alter table public.transferts_caisse enable row level security;

-- Le personnel qui tient une caisse doit pouvoir déplacer ce qu'elle contient.
-- La lecture suit la même règle que les dépenses : c'est de la trésorerie du
-- comptoir, pas un secret de souverain.
drop policy if exists transferts_caisse_staff on public.transferts_caisse;
create policy transferts_caisse_staff on public.transferts_caisse
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transferts_caisse'
  ) then
    alter publication supabase_realtime add table public.transferts_caisse;
  end if;
end $$;

-- ── LE CONTRÔLE ────────────────────────────────────────────────────
-- Attendu : « table prête », 1 politique, 0 transfert.
select
  'transferts_caisse' as table_des_transferts,
  case when exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'transferts_caisse'
  ) then 'table prête' else 'MANQUANTE' end as etat,
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'transferts_caisse') as politiques,
  (select count(*) from public.transferts_caisse) as transferts;
