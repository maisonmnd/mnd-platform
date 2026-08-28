-- ═══════════════════════════════════════════════════════════════════════
-- LES DEMANDES DE FORMULE — Ma Couronne → Le Trône, 28 août 2026
--
-- « Build an interactive way for the clients to purchase and follow their
-- packs and memberships » (Yéman). Le bouton de la cliente n'achète rien :
-- il DEMANDE. La demande atterrit dans cette table, Yéman confirme au Trône,
-- et l'abonnement naît de son geste à lui.
--
-- À PASSER UNE SEULE FOIS. Tant qu'elle n'est pas passée, le bouton
-- « Je veux cette formule » écrit en local sans jamais remonter : la cliente
-- croit avoir demandé, et la Maison ne voit rien.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.demandes_formule (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists demandes_formule_branch_idx
  on public.demandes_formule (branch_id);

drop trigger if exists demandes_formule_touch on public.demandes_formule;
create trigger demandes_formule_touch
  before update on public.demandes_formule
  for each row execute function public.touch_updated_at();

-- ── LA RLS DANS LE MÊME GESTE ────────────────────────────────────────
-- Le dépôt public est le POINT DE LA TABLE : c'est une cliente non
-- authentifiée qui écrit depuis Ma Couronne, exactement comme le tunnel de
-- La Consultation. Mais elle ne LIT rien : sans la règle de lecture réservée
-- au personnel, la clé anon — qui est publique, et qui a déjà fuité le
-- 2 août — rendrait la liste des demandes de toutes les clientes, avec leurs
-- noms. Une table de dépôt s'écrit par tous et se lit par la Maison seule.
alter table public.demandes_formule enable row level security;

drop policy if exists dev_all on public.demandes_formule;
drop policy if exists df_submit on public.demandes_formule;
drop policy if exists df_staff on public.demandes_formule;

-- La cliente dépose sa demande, et rien d'autre.
create policy df_submit on public.demandes_formule for insert to anon, authenticated
  with check (true);

-- La Maison lit, classe, retire.
create policy df_staff on public.demandes_formule for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ── VÉRIFICATION ─────────────────────────────────────────────────────
-- Doit rendre trois lignes : la table, et ses deux règles.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'demandes_formule') as table_creee,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'demandes_formule')    as regles_posees;
