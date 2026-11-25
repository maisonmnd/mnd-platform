-- ═══════════════════════════════════════════════════════════════════════════
-- 0244 — LES FICHES DE PROCÉDURE (25 novembre 2026)
--
-- « Crée une fiche de procédure par soin du catalogue, en commençant par le
-- Rituel SOWA… L'équipe doit pouvoir consulter la version validée sans
-- quitter le rendez-vous » (Yéman). Les fiches vivent dans un document,
-- `mnd_fiches_de_procedure` : une fiche par prestation, son brouillon et sa
-- version validée (numéro, date, nom de qui a validé). Le Trône les lit dans
-- la fenêtre du rendez-vous (« Voir le protocole ») et les écrit au
-- Catalogue (« Les fiches de procédure »).
--
-- UNE SEULE RÈGLE : SEULE LA DIRECTION L'ÉCRIT. Une fiche validée dit
-- comment se rend un soin (un produit, un temps de pose) : un poste de
-- l'équipe ne doit pouvoir ni la corriger ni en valider une, même par un
-- Trône resté ouvert sur une ancienne version. Trois règles RESTRICTIVES à
-- elles (créer, modifier, retirer) : pour cette clé, il faut
-- `est_direction()` (souverain ou gérant, 0089). Même forme que 0231, sans
-- toucher à `cles_ecrites_par_la_direction()` (0209) : une migration voisine
-- qui la redéfinirait ne peut pas rouvrir les fiches.
--
-- LA LECTURE N'EST PAS TOUCHÉE : `docs_staff_all` (0006) la donne à toute
-- l'équipe, et la clé n'est PAS dans la liste blanche de `docs_pub_read` :
-- ni le site ni Ma Couronne ne la lisent.
--
-- LE DOCUMENT N'EST PAS POSÉ ICI : le premier poste de la direction qui
-- ouvre le Trône le pose depuis la semence (`FICHES_DE_DEPART`,
-- fiches-de-procedure-pur : la fiche Sówà, en brouillon). Un poste de
-- l'équipe qui s'ouvre avant elle essuie un refus, sans conséquence : il lit
-- la semence, où rien n'est validé, donc rien ne s'affiche.
--
-- La clé de service (les fonctions Edge) passe toujours : elle n'est pas
-- soumise à la RLS. Aucune table neuve, aucune donnée ne bouge, aucune table
-- `repli_` nécessaire. Rejouable : `drop … if exists`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0244⟩
drop policy if exists docs_fiches_de_procedure_direction_creer on public.documents;
create policy docs_fiches_de_procedure_direction_creer on public.documents
  as restrictive for insert to anon, authenticated
  with check (key <> 'mnd_fiches_de_procedure' or public.est_direction());

drop policy if exists docs_fiches_de_procedure_direction_modifier on public.documents;
create policy docs_fiches_de_procedure_direction_modifier on public.documents
  as restrictive for update to anon, authenticated
  using (key <> 'mnd_fiches_de_procedure' or public.est_direction())
  with check (key <> 'mnd_fiches_de_procedure' or public.est_direction());

drop policy if exists docs_fiches_de_procedure_direction_retirer on public.documents;
create policy docs_fiches_de_procedure_direction_retirer on public.documents
  as restrictive for delete to anon, authenticated
  using (key <> 'mnd_fiches_de_procedure' or public.est_direction());
-- ⟨/0244⟩


-- ── Contrôle ──────────────────────────────────────────────────────────
select policyname, permissive, cmd, roles
  from pg_policies
 where schemaname = 'public' and tablename = 'documents'
   and policyname like 'docs_fiches_de_procedure%'
 order by policyname;
-- Le document est-il déjà amorcé ? (le premier Trône de la direction le pose)
select key, (select count(*) from jsonb_object_keys(data)) as fiches, updated_at
  from public.documents where key = 'mnd_fiches_de_procedure';
