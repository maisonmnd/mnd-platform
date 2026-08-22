-- ═══════════════════════════════════════════════════════════════════
-- 0071 — LES OBJECTIFS DU COFFRE · 22 août 2026
--
-- « Comment gérer les objectifs des économies (voyages, investissements,
-- divers, scolarité…) ? »
--
-- Le coffre était UN SEUL TAS — comme la caisse avant « L'argent a un nom ».
-- Il recevait, il gardait, mais il ne savait pas dire POUR QUOI. Chaque dépôt
-- peut désormais désigner un objectif ; ce qui n'en désigne aucun reste
-- visible sous « non fléché », et c'est un état normal : cet argent-là est
-- disponible, il n'est pas égaré.
--
-- LE FLÉCHAGE EST UNE LECTURE, JAMAIS UNE SERRURE. Le coffre garde un seul
-- solde réel, et un virement peut toujours partir quel que soit l'objectif
-- qu'il traverse. Rien ici n'enferme de l'argent.
--
-- La progression ne s'écrit pas : elle se calcule depuis les mouvements
-- fléchés (`recuParObjectif`). Un compteur écrit dériverait de la réalité au
-- premier écran oublié — même règle que le suivi des abonnements et que le
-- registre des encaissements.
--
-- `coffre_movements.data->>'objectifId'` porte le lien côté mouvement : c'est
-- du JSON, aucune colonne à ajouter là-bas.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.objectifs_coffre (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists objectifs_coffre_branch_idx on public.objectifs_coffre (branch_id);

drop trigger if exists objectifs_coffre_touch on public.objectifs_coffre;
create trigger objectifs_coffre_touch before update on public.objectifs_coffre
  for each row execute function public.touch_updated_at();

alter table public.objectifs_coffre enable row level security;

-- Le coffre est l'affaire des souverains : ses mouvements le sont déjà, ses
-- objectifs le sont aussi. Un objectif dit ce que la Maison prépare — une
-- scolarité, un investissement — et cela ne se lit pas au comptoir.
drop policy if exists objectifs_coffre_souverain on public.objectifs_coffre;
create policy objectifs_coffre_souverain on public.objectifs_coffre
  for all to authenticated
  using (public.is_souverain()) with check (public.is_souverain());

-- Temps réel : un objectif posé sur un poste paraît sur les autres, comme le
-- reste de la Maison. Le volume est dérisoire — quelques lignes par an.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'objectifs_coffre'
  ) then
    alter publication supabase_realtime add table public.objectifs_coffre;
  end if;
end $$;

-- ── LE CONTRÔLE ────────────────────────────────────────────────────
-- Attendu : « table prête », 1 politique, 0 objectif (la Maison n'en a pas
-- encore posé — ils se créent depuis le Coffre-fort).
select
  'objectifs_coffre' as table_des_objectifs,
  case when exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'objectifs_coffre'
  ) then 'table prête' else 'MANQUANTE' end as etat,
  (select count(*) from pg_policies
   where schemaname = 'public' and tablename = 'objectifs_coffre') as politiques,
  (select count(*) from public.objectifs_coffre) as objectifs_poses;
