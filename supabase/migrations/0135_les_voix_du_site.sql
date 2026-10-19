-- ═══════════════════════════════════════════════════════════════════
-- 0135 · LES VOIX DU SITE — 19 octobre 2026
--
-- « Je veux construire ce système sur le site maisonmnd.com » (Yéman,
-- devant le message vocal de FedaPay), maquette HR7V2tMu… validée : une
-- visiteuse laisse un message vocal sur la page Contact ou « Être
-- rappelée » ; il arrive dans Les demandes du Trône.
--
-- La voix vit dans un compartiment PRIVÉ. Seule la fonction `demande-submit`
-- y dépose (avec la clé de service : aucune politique d'écriture n'est
-- donnée au navigateur, une file publique qu'on peut écrire est une file
-- qu'on peut remplir). Le personnel l'écoute par une adresse signée, comme
-- il lit la demande elle-même (`demandes_maison`, 0108) ; l'écran ne la
-- montre qu'à qui ouvre Les demandes. Effacer reste à la direction : c'est
-- ce que fait le Trône à 90 jours (sa décision), avec la fonction.
--
-- `is_staff()` (0003) et `est_direction()` (0089) existent déjà.
-- À coller UNE fois dans Supabase › SQL Editor. Rejouable sans dégât.
-- ═══════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'voix-du-site', 'voix-du-site', false, 3500000,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do nothing;

-- ÉCOUTER : le personnel connecté.
drop policy if exists voix_ecouter on storage.objects;
create policy voix_ecouter on storage.objects for select to authenticated
  using (bucket_id = 'voix-du-site' and public.is_staff());

-- EFFACER : la direction (les voix de plus de 90 jours, ou à la main).
drop policy if exists voix_effacer on storage.objects;
create policy voix_effacer on storage.objects for delete to authenticated
  using (bucket_id = 'voix-du-site' and public.est_direction());

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select id as compartiment, public as ouvert_au_public, file_size_limit as taille_max
from storage.buckets where id = 'voix-du-site';
select policyname as politique, cmd as commande
from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'voix_%'
order by policyname;
