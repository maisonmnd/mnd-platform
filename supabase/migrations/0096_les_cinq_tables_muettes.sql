-- ═══════════════════════════════════════════════════════════════════
-- 0096 — LES CINQ TABLES MUETTES · 14 septembre 2026
--
-- Suite de 0095. En croisant ce que la base PUBLIE avec ce que le Trône
-- ÉCOUTE, cinq tables manquaient — écoutées depuis toujours, publiées jamais.
-- Leurs canaux ne pouvaient donc pas réussir : ils échouaient, se
-- relançaient, échouaient encore, et c'est ce qui reste de la pastille cuivre
-- après le regroupement des documents.
--
-- POURQUOI CELLES-LÀ, ET PERSONNE NE L'AVAIT VU. Chacune est née dans une
-- migration qui a créé sa table, posé sa RLS, ses index — et oublié la
-- publication. La ligne se copie d'une migration à l'autre, et cinq fois sur
-- soixante-deux elle n'a pas été copiée. Rien ne le signalait : jusqu'au
-- 14 septembre, `subscribe()` ne rendait son verdict à personne, et un canal
-- refusé se taisait.
--
--   · avances_remboursements  (0078) — les remboursements d'avances de l'équipe
--   · demandes_formule        (0076) — ce qu'une cliente demande depuis Ma Couronne
--   · emprunts                (0085) — ce que la Maison doit
--   · entrees_hors_activite   (0084) — les entrées qui ne viennent pas du fauteuil
--   · motifs_foyer            (0051) — les motifs de dépense du foyer
--
-- CE QUE CELA COÛTAIT : une avance remboursée au comptoir, une demande de
-- formule déposée par une cliente, un emprunt saisi par la direction ne
-- paraissaient sur les autres postes qu'au rechargement, ou au filet d'une
-- minute. Rien n'était perdu — l'écriture passait toujours — mais tout
-- arrivait en retard, et le retard est la panne la plus difficile à nommer.
--
-- LA RLS NE BOUGE PAS. Publier une table ne l'ouvre à personne : Realtime
-- applique les mêmes politiques que la lecture.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  t text;
  manquantes text[] := array[
    'avances_remboursements',
    'demandes_formule',
    'emprunts',
    'entrees_hors_activite',
    'motifs_foyer'
  ];
begin
  foreach t in array manquantes loop
    /* UNE TABLE ABSENTE NE FAIT PAS ÉCHOUER LA MIGRATION. Elle se dit, et
       l'on continue : arrêter tout parce qu'une table d'un autre chantier
       n'existe pas encore laisserait les quatre autres muettes. */
    if not exists (
      select 1 from pg_tables where schemaname = 'public' and tablename = t
    ) then
      raise notice '% n''existe pas dans cette base — passée.', t;
    elsif exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      raise notice '% y était déjà.', t;
    else
      execute format('alter publication supabase_realtime add table public.%I;', t);
      raise notice '% ajoutée au direct.', t;
    end if;
  end loop;
end $$;

-- ── CONTRÔLE ───────────────────────────────────────────────────────
-- Les cinq doivent paraître. Si l'une manque, c'est qu'elle n'existe pas
-- dans cette base, et le message ci-dessus l'aura nommée.
select tablename as publiee_en_direct
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
  and tablename in (
    'avances_remboursements', 'demandes_formule', 'emprunts',
    'entrees_hors_activite', 'motifs_foyer'
  )
order by tablename;
