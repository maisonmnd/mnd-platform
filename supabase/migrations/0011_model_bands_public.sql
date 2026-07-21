-- ═══════════════════════════════════════════════════════════════════
-- 0011 — Barème des modèles lisible par les clientes (à coller dans
-- Supabase → SQL Editor → Run). Idempotent.
--
-- Ma Couronne doit lire le document `mnd_model_bands` pour afficher à chaque
-- cliente SON prix (modèle × Juste Prix). On l'ajoute à la liste blanche de
-- lecture publique des documents — c'est une grille tarifaire, rien de privé.
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists docs_pub_read on public.documents;
create policy docs_pub_read on public.documents for select to anon, authenticated
  using (key = any(array[
    'mnd_settings', 'mnd_brand', 'mnd_offers', 'mnd_cercle_tiers',
    'mnd_points_rate', 'mnd_crown_styles', 'mnd_couronne_compose', 'mnd_vitrine_config',
    'mnd_model_bands'
  ]));

-- Vérification : la policy expose bien 9 clés.
select polname as policy_ok from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname = 'documents' and p.polname = 'docs_pub_read';
