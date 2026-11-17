-- ═══════════════════════════════════════════════════════════════════════════
-- 0231 — VOS ENVIES (17 novembre 2026, la consultation en affiches)
--
-- « Permets-moi de créer mes envies », « c'est plutôt 3 groupes : rituel,
-- visio et/ou consultation privée », « crée des restrictions » (Yéman). La
-- direction écrit ses envies au Trône (Système › Besoins et règles › Vos
-- envies) dans un document, `mnd_envies` : ses envies, le groupe de chacune
-- et son rituel du catalogue, les restrictions, le rendez-vous des deux
-- parcours à part, le tarif des cheveux naturels. La consultation du site
-- (/consultation/) le lit et suit, sans redéploiement. Deux règles, rien
-- d'autre :
--
--   ① LE SITE LIT LES ENVIES. Une règle de lecture À ELLE, pour cette seule
--      clé : les règles permissives s'additionnent, et la liste blanche de
--      `docs_pub_read` (dernière définition : 0208) n'est PAS réécrite ici.
--      Une migration voisine qui la redéfinirait ne peut donc pas refermer
--      les envies, ni celle-ci refermer ce qu'une autre ouvre. Le document ne
--      porte aucune donnée de cliente : des noms d'envies, des groupes, des
--      identifiants de prestations, deux nombres.
--
--   ② SEULE LA DIRECTION L'ÉCRIT. Trois règles RESTRICTIVES à elles (créer,
--      modifier, retirer) : pour `mnd_envies`, il faut `est_direction()`
--      (souverain ou gérant, 0089). Même forme que 0208, sans toucher à
--      `cles_ecrites_par_la_direction()` (0209), pour la même raison. La
--      lecture n'est pas touchée.
--
-- LE DOCUMENT N'EST PAS POSÉ ICI : le premier poste de la direction qui
-- ouvre le Trône le pose depuis la semence (`ENVIES_DE_DEPART`, envies-pur).
-- Tant qu'il n'existe pas, le site lit la même semence.
--
-- La clé de service (les fonctions Edge) passe toujours : elle n'est pas
-- soumise à la RLS. Aucune table neuve, aucune donnée ne bouge, aucune table
-- `repli_` nécessaire. Rejouable : `drop … if exists`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0231⟩
-- ── ① LE SITE LIT LES ENVIES ──────────────────────────────────────────
drop policy if exists docs_envies_lire on public.documents;
create policy docs_envies_lire on public.documents for select to anon, authenticated
  using (key = 'mnd_envies');

-- ── ② SEULE LA DIRECTION LES ÉCRIT ───────────────────────────────────
drop policy if exists docs_envies_direction_creer on public.documents;
create policy docs_envies_direction_creer on public.documents
  as restrictive for insert to anon, authenticated
  with check (key <> 'mnd_envies' or public.est_direction());

drop policy if exists docs_envies_direction_modifier on public.documents;
create policy docs_envies_direction_modifier on public.documents
  as restrictive for update to anon, authenticated
  using (key <> 'mnd_envies' or public.est_direction())
  with check (key <> 'mnd_envies' or public.est_direction());

drop policy if exists docs_envies_direction_retirer on public.documents;
create policy docs_envies_direction_retirer on public.documents
  as restrictive for delete to anon, authenticated
  using (key <> 'mnd_envies' or public.est_direction());
-- ⟨/0231⟩


-- ── Contrôle ──────────────────────────────────────────────────────────
select policyname, permissive, cmd, roles
  from pg_policies
 where schemaname = 'public' and tablename = 'documents'
 order by permissive, policyname;
-- Le document est-il déjà amorcé ? (le premier Trône de la direction le pose)
select key, jsonb_array_length(data->'envies') as envies, updated_at
  from public.documents where key = 'mnd_envies';
