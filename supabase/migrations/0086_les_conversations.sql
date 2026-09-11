-- ═══════════════════════════════════════════════════════════════════
-- 0086 — LES CONVERSATIONS · 11 septembre 2026
--
-- « Comment je réussis à construire les conversations WhatsApp dans le
-- trône ? » (Yéman). Maquette `maquette-les-conversations.html`, validée.
--
-- Le Trône parlait sans entendre : trois modèles partaient seuls, la
-- cloche ouvrait des brouillons, et rien ne revenait. Ce qu'une cliente
-- répondait vivait dans un téléphone, pas dans la Maison.
--
-- CETTE TABLE EST LA MÉMOIRE DE CE QUI SE DIT. Une ligne par message,
-- reçu ou envoyé, avec l'identifiant que Meta lui donne : le webhook
-- peut être rappelé dix fois pour le même message, il ne s'écrira
-- qu'une (`id` = `wa-<id Meta>`).
--
-- PERSONNEL SEULEMENT, et c'est plus sérieux ici qu'ailleurs. Une ligne
-- de cette table porte les mots exacts d'une cliente : ce qu'elle
-- demande, ce qu'elle refuse, ce qu'elle confie. Cela ne regarde ni la
-- clé publique, ni Ma Couronne, ni quiconque hors de la Maison.
--
-- LE FIL PRIVÉ EST DANS LA DONNÉE, PAS DANS LA POLITIQUE. La Maison a
-- choisi « tout le personnel, sauf ce que je marque privé » : le drapeau
-- vit dans `data`, et le Trône le tient. Le poser en RLS demanderait de
-- connaître ici la notion de propriétaire d'un fil, que la Maison n'a
-- pas encore ; mieux vaut une règle simple et vraie qu'une règle
-- compliquée qu'on croit vraie.
--
-- ⚠ À PASSER AVANT LA PROCHAINE PUBLICATION.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.messages_wa (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.messages_wa enable row level security;

drop policy if exists staff_all on public.messages_wa;

create policy staff_all on public.messages_wa for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- LE FIL SE LIT PAR TÊTE ET PAR DATE, toujours. Sans cet index, chaque
-- ouverture de conversation relirait toute la table : c'est supportable
-- à trois cents messages, plus du tout à trente mille, et une lenteur
-- qui s'installe ne se remarque jamais le jour où on l'a créée.
create index if not exists messages_wa_tete_date
  on public.messages_wa ((data->>'clientId'), (data->>'quand'));

-- ET PAR NUMÉRO, pour les fils sans fiche : une cliente inconnue n'a pas
-- d'identifiant, seulement un numéro.
create index if not exists messages_wa_numero
  on public.messages_wa ((data->>'numero'));
