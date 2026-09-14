-- ═══════════════════════════════════════════════════════════════════
-- 0095 — LES DOCUMENTS EN DIRECT · 14 septembre 2026
--
-- « Le bouton vert et le bouton rouge se suivent chaque seconde. Ils
-- n'arrêtent pas » (Yéman).
--
-- LA TABLE `documents` N'A JAMAIS ÉTÉ PUBLIÉE. Elle est née en 0001 et aucune
-- migration ne l'a jamais ajoutée à `supabase_realtime` — contrairement aux
-- soixante et une tables de collections, ajoutées au fil des migrations qui
-- les créaient.
--
-- CE QUE CELA COÛTAIT, ET DEPUIS LE DÉBUT : les 57 magasins de réglages de la
-- Maison — les horaires du salon, la grille des commissions, les paramètres de
-- paie, la vitrine, les protocoles, la matrice des accès — ne recevaient
-- AUCUN changement en direct. Un réglage modifié sur la tablette du salon
-- n'atteignait le téléphone du soir qu'au prochain chargement, ou au filet
-- d'une minute. Personne ne l'a jamais nommé parce que chacun de ces 57 canaux
-- échouait EN SILENCE : `subscribe()` ne rendait son verdict à personne.
--
-- ET C'EST CE QUI FAISAIT BATTRE LA PASTILLE. Depuis le regroupement des 57
-- canaux en un seul (14 septembre), l'échec n'est plus silencieux : le canal
-- tombe, se relève, retombe, et le comptoir voit un clignotant. La pastille ne
-- mentait pas — elle disait enfin quelque chose de vrai qui durait depuis des
-- mois.
--
-- LA RLS NE BOUGE PAS. Publier une table ne l'ouvre à personne : Realtime
-- applique les mêmes politiques que la lecture. Un poste ne reçoit que les
-- documents qu'il aurait pu lire de toute façon.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
    raise notice 'documents ajoutée au direct.';
  else
    raise notice 'documents y était déjà — rien à faire.';
  end if;
end $$;

-- ── CONTRÔLE ───────────────────────────────────────────────────────
-- `documents` doit paraître dans cette liste. Elle sert aussi à préparer le
-- second temps du chantier du direct : un seul canal pour toute la Maison,
-- qui écouterait le schéma et distribuerait par le nom de la table. Pour
-- l'écrire, il faut savoir exactement ce qui est publié.
select tablename as publiee_en_direct
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
order by tablename;
