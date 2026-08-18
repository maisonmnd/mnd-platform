-- ═══════════════════════════════════════════════════════════════════
-- 0059 — LES PIÈCES JOINTES DU FIL
--        (à coller tel quel. RIEN À DÉCOMMENTER.)
--
-- « Je fais des screenshots et je veux pouvoir joindre les fichiers aux
-- membres de l'équipe » (Yéman, 18 août 2026).
--
-- ── CE QUE ÇA REVIENT DÉFAIRE, ET POURQUOI C'EST ACCEPTÉ ─────────
-- La maquette du Fil excluait les fichiers joints, et Yéman l'avait confirmé le
-- matin même. La raison tenait en une ligne : une capture d'écran du Trône
-- porte des noms de clientes, des montants, parfois un téléphone — et un
-- fichier se télécharge, se transfère, survit à la conversation.
--
-- L'usage a tranché : elle capture pour MONTRER quelque chose à son équipe, et
-- refuser reviendrait à la renvoyer vers WhatsApp, où ces mêmes captures
-- sortiraient de la Maison pour de bon. Mieux vaut un dépôt fermé ici qu'un
-- envoi ouvert ailleurs.
--
-- ── LA SEULE FAÇON QUI NE ROUVRE PAS LA FUITE DU 2 AOÛT ──────────
-- Un compartiment PRIVÉ (`public = false`) : aucune adresse ne le sert
-- librement, chaque fichier se lit par un jeton signé, de courte durée, remis
-- au seul personnel connecté. Et JAMAIS le dépôt GitHub, qui est public.
--
-- La porte est la même que pour les factures : `is_staff()`. Ce que la Maison
-- garde derrière une porte, elle le garde derrière LA MÊME.
-- ═══════════════════════════════════════════════════════════════════

begin;

-- ── LE COMPARTIMENT ──────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fil',
  'fil',
  false,                                   -- privé : rien ne se sert sans jeton
  10485760,                                -- 10 Mo : une capture, pas une vidéo
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── LES DROITS ───────────────────────────────────────────────────
-- Le personnel dépose, lit, remplace et retire. Personne d'autre n'entre.
drop policy if exists fil_lire on storage.objects;
create policy fil_lire on storage.objects for select to authenticated
  using (bucket_id = 'fil' and public.is_staff());

drop policy if exists fil_deposer on storage.objects;
create policy fil_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'fil' and public.is_staff());

drop policy if exists fil_remplacer on storage.objects;
create policy fil_remplacer on storage.objects for update to authenticated
  using (bucket_id = 'fil' and public.is_staff())
  with check (bucket_id = 'fil' and public.is_staff());

drop policy if exists fil_retirer on storage.objects;
create policy fil_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'fil' and public.is_staff());

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLE — à lancer juste après.
-- ═══════════════════════════════════════════════════════════════════
select
  (select count(*) from storage.buckets where id = 'fil')                    as compartiment,
  (select public from storage.buckets where id = 'fil')                      as ouvert_au_public,
  (select file_size_limit from storage.buckets where id = 'fil')             as taille_max,
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'fil\_%')                                          as politiques;
--  Attendu : 1 · false · 10485760 · 4
--  `ouvert_au_public` DOIT dire false. S'il dit true, arrête-toi et dis-le-moi :
--  un compartiment public rendrait chaque capture lisible par son adresse, sans
--  jeton ni session — exactement la fuite du 2 août, en pire.
