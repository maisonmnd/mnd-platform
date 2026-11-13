-- ═══════════════════════════════════════════════════════════════════════════
-- 0207 — LA CONSULTATION OUVERTE (13 novembre 2026, la Consultation, lot 2)
--
-- « Construis le reste des lots » (Yéman), après la maquette « La
-- Consultation MND ». La consultation gratuite du site (/consultation/) lit
-- les besoins de la cliente dans le document `mnd_besoins`, que le Trône
-- règle (Système › Besoins et règles, lot 1). Deux changements, rien d'autre :
--
--   ① LE SITE LIT LES BESOINS. `mnd_besoins` rejoint la liste blanche de
--      `docs_pub_read` (dernière définition : 0127). Le document ne porte
--      aucune donnée de cliente : des mots, des points, des identifiants de
--      prestations, des seuils. La liste d'avant est recopiée telle quelle.
--
--   ② SEULE LA DIRECTION L'ÉCRIT. Trois règles RESTRICTIVES (créer,
--      modifier, retirer) : pour `mnd_besoins`, il faut `est_direction()`
--      (souverain ou gérant, 0089). La lecture n'est pas touchée : une
--      restrictive « for all » aurait aussi fermé la lecture à l'équipe et
--      au site. Même forme que `docs_direction_seule` (0160).
--
-- La clé de service (les fonctions Edge) passe toujours : elle n'est pas
-- soumise à la RLS. Aucune table neuve, aucune donnée ne bouge, aucune table
-- `repli_` nécessaire. Rejouable : `create or replace`, `drop … if exists`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0207⟩
-- ── ① LE SITE LIT LES BESOINS ─────────────────────────────────────────
drop policy if exists docs_pub_read on public.documents;
create policy docs_pub_read on public.documents for select to anon, authenticated
  using (key = any(array[
    'mnd_settings',
    'mnd_brand',
    'mnd_offers',
    'mnd_cercle_tiers',
    'mnd_points_rate',
    'mnd_crown_styles',
    'mnd_couronne_compose',
    'mnd_vitrine_config',
    'mnd_model_bands',
    'mnd_model_band_sets',
    'mnd_cercle_seuil',
    'mnd_horaires_exceptions',
    'mnd_avis_google',
    'mnd_site_publie',
    'mnd_cercle_actif',
    'mnd_foyer_actif',
    -- 0207 :
    'mnd_besoins'
  ]));

-- ── ② SEULE LA DIRECTION L'ÉCRIT ─────────────────────────────────────
create or replace function public.cles_ecrites_par_la_direction() returns text[]
language sql immutable as $$
  select array['mnd_besoins']::text[]
$$;

drop policy if exists docs_ecrits_par_la_direction_creer on public.documents;
create policy docs_ecrits_par_la_direction_creer on public.documents
  as restrictive for insert to anon, authenticated
  with check (not (key = any(public.cles_ecrites_par_la_direction())) or public.est_direction());

drop policy if exists docs_ecrits_par_la_direction_modifier on public.documents;
create policy docs_ecrits_par_la_direction_modifier on public.documents
  as restrictive for update to anon, authenticated
  using (not (key = any(public.cles_ecrites_par_la_direction())) or public.est_direction())
  with check (not (key = any(public.cles_ecrites_par_la_direction())) or public.est_direction());

drop policy if exists docs_ecrits_par_la_direction_retirer on public.documents;
create policy docs_ecrits_par_la_direction_retirer on public.documents
  as restrictive for delete to anon, authenticated
  using (not (key = any(public.cles_ecrites_par_la_direction())) or public.est_direction());
-- ⟨/0207⟩


-- ── Contrôle ──────────────────────────────────────────────────────────
select policyname, permissive, cmd, roles
  from pg_policies
 where schemaname = 'public' and tablename = 'documents'
 order by permissive, policyname;
-- Le document est-il déjà amorcé ? (le premier Trône ouvert le pose)
select key, jsonb_array_length(data->'besoins') as besoins, updated_at
  from public.documents where key = 'mnd_besoins';
