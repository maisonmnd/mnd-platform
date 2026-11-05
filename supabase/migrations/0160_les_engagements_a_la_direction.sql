-- ═══════════════════════════════════════════════════════════════════════════
-- 0160 · LES ENGAGEMENTS DE CHAQUE MOIS, À LA DIRECTION · 5 novembre 2026
--
-- « Direction seule » (Yéman, 5 novembre 2026, au sélecteur). Les engagements
-- de chaque mois (le loyer, internet, l'électricité, les abonnements : le
-- train de vie de la Maison) vivent dans `documents`, ligne de clé
-- `mnd_engagements_du_mois` (src/shared/engagements-du-mois.ts). Jusqu'ici
-- tout le personnel pouvait la lire et l'écrire, comme les dépenses
-- (`docs_staff_lire`, `docs_staff_creer`, `docs_staff_modifier`,
-- `docs_staff_retirer`, 0130) ; l'écran ne la montrait qu'à la direction,
-- mais une règle tenue par l'écran seul se contourne par la base.
--
-- DÉSORMAIS, cette ligne se lit, se crée, se modifie et s'efface par la
-- DIRECTION SEULE : souverain ET gérant, `est_direction()` (0089), la même
-- règle que « + Dépense ».
--
-- RIEN NE CHANGE POUR LES AUTRES CLÉS, et c'est la forme même de la règle :
-- aucune règle existante n'est retirée ni réécrite. On AJOUTE une règle
-- RESTRICTIVE, que PostgreSQL exige EN PLUS des règles permissives
-- d'aujourd'hui (les quatre `docs_staff_*` de 0130, `docs_pub_read` de 0127,
-- `docs_douze_lunes_read` de 0124). Pour toute autre clé elle est vraie : elle
-- ne retire rien. Pour la clé des engagements, elle exige la direction, quelle
-- que soit la règle permissive qui ouvrirait la porte, aujourd'hui ou demain.
-- Le canal en direct (`postgres_changes`, 0095) lit avec la même règle : un
-- compte de l'équipe ne reçoit plus la ligne.
--
-- La liste tient dans une fonction, comme `cles_rh_privees()` (0130) : une
-- clé de plus pour la direction s'y ajoutera, sans toucher à la règle.
--
-- La clé de service (Grenat, les fonctions Edge) passe toujours : elle n'est
-- pas soumise à la RLS. Aucune table neuve, aucune table `repli_`, aucune
-- donnée ne bouge. Rejouable : `create or replace`, `drop … if exists`.
-- `est_direction()` vient de 0089 (déjà passée). Essai à blanc :
-- supabase/essai_0160_a_blanc.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0160⟩
create or replace function public.cles_de_la_direction() returns text[]
language sql immutable as $$
  select array['mnd_engagements_du_mois']::text[]
$$;

drop policy if exists docs_direction_seule on public.documents;
create policy docs_direction_seule on public.documents
  as restrictive
  for all
  to anon, authenticated
  using (not (key = any(public.cles_de_la_direction())) or public.est_direction())
  with check (not (key = any(public.cles_de_la_direction())) or public.est_direction());
-- ⟨/0160⟩


-- ── Contrôle ──────────────────────────────────────────────────────────
-- Les règles de `documents` : les permissives d'avant, inchangées, et la
-- restrictive de la direction.
select policyname, permissive, cmd, roles
  from pg_policies
 where schemaname = 'public' and tablename = 'documents'
 order by permissive, policyname;
select public.cles_de_la_direction() as cles_de_la_direction;
