-- ═══════════════════════════════════════════════════════════════════
-- 0206 — LES ENVOIS PROGRAMMÉS · 13 novembre 2026
--        (à passer telle quelle. RIEN À DÉCOMMENTER.)
--
-- « Programmer un WhatsApp » remplace « Appel reçu » (maquette
-- public/maquette-les-envois-programmes.html, validée le 13 novembre 2026,
-- « construis »). Un envoi programmé est une ligne de la table `envois`
-- (type `programme`), dans `data jsonb` comme toutes les autres : AUCUNE
-- table ni colonne neuve n'est nécessaire.
--
-- Ce qui manque : la pièce jointe. Un fichier de l'appareil (une photo, un
-- PDF, un document) doit attendre l'heure dite quelque part ; une pièce du
-- Trône (sa facture, son reçu) est TIRÉE au moment d'envoyer par un Trône
-- ouvert et rangée au même endroit. Le facteur (`envois-partent`, clé
-- service) la relit, la dépose chez Meta (jamais un lien public), puis la
-- retire ; pour Opale (un message privé, WhatsApp Web), il en signe un lien
-- de vingt-quatre heures dans sa consigne.
--
-- ── LE COMPARTIMENT, PRIVÉ ───────────────────────────────────────
-- La règle de 0059 (le fil) : `public = false`, rien ne se sert sans jeton
-- signé, le personnel seul dépose, lit, remplace et retire. Seize mégaoctets :
-- ce que WhatsApp accepte pour une vidéo ou un document qui passe par le
-- serveur ; une photo se borne à cinq au Trône (la règle de Meta).
--
-- Numérotée 0206 : 0203 est passée, 0204 est tenue par le lot D (les
-- pannes dites), 0205 réservée au lot C.
-- ═══════════════════════════════════════════════════════════════════

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'envois-programmes',
  'envois-programmes',
  false,
  16777216,
  array[
    'image/jpeg', 'image/png', 'application/pdf', 'video/mp4', 'text/plain',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists envois_programmes_lire on storage.objects;
create policy envois_programmes_lire on storage.objects for select to authenticated
  using (bucket_id = 'envois-programmes' and public.is_staff());

drop policy if exists envois_programmes_deposer on storage.objects;
create policy envois_programmes_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'envois-programmes' and public.is_staff());

drop policy if exists envois_programmes_remplacer on storage.objects;
create policy envois_programmes_remplacer on storage.objects for update to authenticated
  using (bucket_id = 'envois-programmes' and public.is_staff())
  with check (bucket_id = 'envois-programmes' and public.is_staff());

drop policy if exists envois_programmes_retirer on storage.objects;
create policy envois_programmes_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'envois-programmes' and public.is_staff());

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lancer juste après.
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from storage.buckets where id = 'envois-programmes')        as compartiment,
  (select public from storage.buckets where id = 'envois-programmes')          as ouvert_au_public,
  (select file_size_limit from storage.buckets where id = 'envois-programmes') as taille_max,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'envois\_programmes\_%')                             as politiques;
--  Attendu : 1 · false · 16777216 · 4
--  `ouvert_au_public` DOIT dire false : un compartiment public rendrait chaque
--  pièce lisible par son adresse, sans jeton ni session.
