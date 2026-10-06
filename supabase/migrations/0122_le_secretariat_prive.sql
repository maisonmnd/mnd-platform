-- ═══════════════════════════════════════════════════════════════════
-- 0122 — LE PRIVÉ DU SECRÉTARIAT · 7 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc.
--
-- Le dossier de bourse scolaire (onglet « Bourse » du Secrétariat) prépare
-- des pièces au nom de NYM SARL et de M. Thomas BOYA : une attestation qui
-- dit un salaire, des noms et dates de naissance d'enfants. Une pièce
-- d'entreprise se lisait de tout le personnel (0116) ; seule une lettre
-- personnelle était réservée à la direction. Désormais, une ligne marquée
-- `prive: true` l'est aussi, quelle que soit son entité.
--
-- Le reste de 0116 ne change pas : signé figé, chacun sa signature,
-- effacer réservé à la direction.
-- ═══════════════════════════════════════════════════════════════════

do $bloc$
begin
  drop policy if exists secretariat_lire on public.secretariat;
  create policy secretariat_lire on public.secretariat for select to authenticated
    using (public.is_staff() and ((coalesce(data->>'entite', '') <> 'perso' and coalesce(data->>'prive', '') <> 'true') or public.est_direction()));

  drop policy if exists secretariat_ecrire on public.secretariat;
  create policy secretariat_ecrire on public.secretariat for insert to authenticated
    with check (public.is_staff() and ((coalesce(data->>'entite', '') <> 'perso' and coalesce(data->>'prive', '') <> 'true') or public.est_direction()));

  drop policy if exists secretariat_modifier on public.secretariat;
  create policy secretariat_modifier on public.secretariat for update to authenticated
    using (public.is_staff() and ((coalesce(data->>'entite', '') <> 'perso' and coalesce(data->>'prive', '') <> 'true') or public.est_direction()))
    with check (public.is_staff() and ((coalesce(data->>'entite', '') <> 'perso' and coalesce(data->>'prive', '') <> 'true') or public.est_direction()));
end
$bloc$;

-- Le contrôle : trois politiques qui parlent du privé.
select policyname, cmd,
       (coalesce(qual, '') || coalesce(with_check, '')) like '%prive%' as garde_le_prive
from pg_policies where schemaname = 'public' and tablename = 'secretariat' order by policyname;
