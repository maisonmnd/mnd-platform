-- ═══════════════════════════════════════════════════════════════════
-- 0087 — LE FIL EN DIRECT · 11 septembre 2026, le soir
--
-- « Rien n'est venu. L'écran est toujours vide » (Yéman).
--
-- MA FAUTE, ET ELLE EST NETTE. Toutes les tables de la Maison s'ajoutent
-- à la publication `supabase_realtime` dans la migration qui les crée —
-- 0004 le fait en boucle, 0005 pour `client_sessions`, 0008 pour `tips`.
-- La 0086 ne l'a pas fait. La table existait, les politiques étaient
-- justes, et pourtant aucun message n'arrivait à l'écran : le Trône
-- écoute un canal Postgres Changes qui ne diffusait rien pour elle.
--
-- CE QUE ÇA A COÛTÉ : rien de perdu, tout d'invisible. Les lignes
-- écrites par le webhook attendaient sagement dans la table, et un
-- simple rechargement de page les aurait montrées (`refetch` au focus).
-- C'est le pire genre de panne : elle ressemble à « rien n'est arrivé »
-- alors qu'elle veut dire « rien ne s'annonce ».
--
-- UNE CONVERSATION SE LIT EN DIRECT OU NE SE LIT PAS. Une cliente qui
-- écrit pendant qu'on a l'écran ouvert doit paraître sans qu'on pense à
-- rafraîchir ; sinon la Maison répondra toujours avec une heure de
-- retard, et cessera d'ouvrir la page.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages_wa'
  ) then
    execute 'alter publication supabase_realtime add table public.messages_wa';
  end if;
end $$;

-- LES DEUX TABLES DU CHANTIER DE CE MATIN, CONTRÔLÉES AU PASSAGE.
-- Elles ne servent pas le temps réel de la même façon (on ne regarde pas
-- un emprunt se rembourser sous ses yeux), mais deux postes ouverts sur
-- Les Prêts doivent voir le même solde. Même oubli, même réparation.
do $$
declare t text;
begin
  foreach t in array array['entrees_hors_activite', 'emprunts'] loop
    if exists (select 1 from information_schema.tables
               where table_schema = 'public' and table_name = t)
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
