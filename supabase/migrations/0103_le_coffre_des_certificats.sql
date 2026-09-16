-- ═══════════════════════════════════════════════════════════════════
-- 0103 — LE COFFRE DES CERTIFICATS · 16 septembre 2026
--
-- « Me permettre de sauvegarder le certificat » (Yéman). Le certificat de
-- l'Académie se dessine en PDF sur le poste, et la MÊME copie se dépose ici,
-- au dossier de l'apprenant, où le Suivi de l'Académie la retrouve.
--
-- UN COMPARTIMENT PRIVÉ, un dossier par inscription, un fichier par numéro :
--   `<inscription>/<numéro>.pdf`
-- Le personnel dépose, relit et REMPLACE : un certificat rouvert pour
-- corriger une faute est le même papier, sous le même numéro, et deux copies
-- qui se contredisent ne prouveraient rien. La direction seule efface.
-- Aucune adresse publique : un lien signé d'une heure, redemandé à chaque
-- lecture (`shared/certificats-coffre.ts`).
--
-- PRIVÉ, cinq mégaoctets, PDF seulement : un certificat avec sa photo pèse
-- quelques centaines de kilooctets.
-- ═══════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('certificats', 'certificats', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

drop policy if exists certificats_lire on storage.objects;
create policy certificats_lire on storage.objects for select to authenticated
  using (bucket_id = 'certificats' and (public.is_staff() or public.est_direction()));

drop policy if exists certificats_deposer on storage.objects;
create policy certificats_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'certificats' and (public.is_staff() or public.est_direction()));

-- REMPLACER EST PERMIS AU PERSONNEL : même numéro, même papier, corrigé.
drop policy if exists certificats_remplacer on storage.objects;
create policy certificats_remplacer on storage.objects for update to authenticated
  using (bucket_id = 'certificats' and (public.is_staff() or public.est_direction()))
  with check (bucket_id = 'certificats' and (public.is_staff() or public.est_direction()));

drop policy if exists certificats_retirer on storage.objects;
create policy certificats_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'certificats' and public.est_direction());

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select id as compartiment, public as ouvert_au_public, file_size_limit as taille_max
from storage.buckets where id = 'certificats';

select policyname as politique_du_coffre
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'certificats_%'
order by policyname;
