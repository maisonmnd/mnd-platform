-- ═══════════════════════════════════════════════════════════════════
-- 0088 — LE MANUEL DES FORMATRICES · 13 septembre 2026
--
-- « Je veux bien que la formatrice voie le plan de sa séance en
-- remplissant sa fiche. Je veux également ranger ce contenu dans la base
-- privée de Supabase, pas dans le code » (Yéman).
--
-- POURQUOI DANS LA BASE, ET PAS DANS LE CODE. Le dépôt du Trône est
-- public, et le site aussi : tout ce qui est écrit dans le code se lit
-- par n'importe qui. Le manuel, lui, est la méthode de la Maison, celle
-- qui se transmet sous licence. Il ne vit donc qu'ici, derrière la
-- connexion du personnel, et n'arrive dans la base que par l'import que
-- la Maison fait elle-même depuis l'Académie.
--
-- UNE LIGNE PAR FORMATION (`id` = l'identifiant du parcours : fondation,
-- affirmation, oeuvre, initiation, praticien, maitre, resserrage,
-- laboratoire, referentiel). Toutes ses séances vivent dans `data`.
--
-- PERSONNEL SEULEMENT. Aucune politique pour la clé publique : Ma
-- Couronne, la Consultation et un visiteur du site n'y lisent rien.
--
-- ⚠ À PASSER AVANT D'IMPORTER LE MANUEL.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.manuel_formatrices (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.manuel_formatrices enable row level security;

drop policy if exists staff_all on public.manuel_formatrices;

create policy staff_all on public.manuel_formatrices for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

drop trigger if exists manuel_formatrices_touch on public.manuel_formatrices;

create trigger manuel_formatrices_touch before update on public.manuel_formatrices
  for each row execute function public.touch_updated_at();

-- LE FIL EN DIRECT (leçon de 0087) : une table que Realtime n'écoute pas
-- ne se met à jour sur les autres postes qu'au retour sur l'onglet. Un
-- manuel importé au bureau doit paraître tout de suite au fauteuil.
do $$
begin
  alter publication supabase_realtime add table public.manuel_formatrices;
exception when duplicate_object then null;
end $$;
