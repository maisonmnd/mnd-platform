-- ═══════════════════════════════════════════════════════════════════
-- 0134 · LA TRACE DES CHÈQUES ET DES CARTES — 18 octobre 2026
--
-- « Pour les chèques renseigner banque + numéro chèque ou une photo du
-- chèque avant validation » (Yéman), maquette « Chèque et carte » validée.
-- La banque, le numéro et le n° d'autorisation vivent sur le versement de
-- la pièce (aucune table neuve). Seule la PHOTO a besoin d'un lieu : un
-- compartiment PRIVÉ, car un chèque porte un numéro de compte.
--
-- LA RÈGLE VIT DANS LE CHEMIN, comme au coffre des engagements (0099) :
--   `<branche>/<compte>/<jeton>.jpg` — le second segment est l'identifiant du
--   compte qui a pris la photo. Sa décision : la direction voit toutes les
--   photos, et chacune voit les siennes. C'est la BASE qui refuse une adresse
--   signée à qui n'a pas le droit : l'écran ne tient pas cette porte-là.
--
-- `is_staff()` (0003) et `est_direction()` (0089) existent déjà.
-- À coller UNE fois dans Supabase › SQL Editor. Rejouable sans dégât.
-- ═══════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'traces-privees', 'traces-privees', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do nothing;

-- DÉPOSER : le personnel, et seulement dans SON dossier.
drop policy if exists traces_deposer on storage.objects;
create policy traces_deposer on storage.objects for insert to authenticated
  with check (
    bucket_id = 'traces-privees'
    and public.is_staff()
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- LIRE : la direction, et qui a pris la photo.
drop policy if exists traces_lire on storage.objects;
create policy traces_lire on storage.objects for select to authenticated
  using (
    bucket_id = 'traces-privees'
    and (
      public.est_direction()
      or (public.is_staff() and (storage.foldername(name))[2] = auth.uid()::text)
    )
  );

-- UNE PHOTO NE SE REMPLACE PAS : la preuve d'un chèque qu'on pourrait écraser
-- ne prouverait plus rien. Effacer reste à la direction.
drop policy if exists traces_remplacer on storage.objects;
create policy traces_remplacer on storage.objects for update to authenticated
  using (bucket_id = 'traces-privees' and public.est_direction())
  with check (bucket_id = 'traces-privees' and public.est_direction());

drop policy if exists traces_retirer on storage.objects;
create policy traces_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'traces-privees' and public.est_direction());

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select id as compartiment, public as ouvert_au_public, file_size_limit as taille_max
from storage.buckets where id = 'traces-privees';

select policyname as politique
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'traces_%'
order by policyname;
