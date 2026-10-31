-- ═══════════════════════════════════════════════════════════════════
-- 0147 · LES PIÈCES DES CLIENTES — 31 octobre 2026
--
-- Passée par l'agent mise-en-ligne (scripts/mise-en-ligne.mjs sql), au
-- commit du chantier « Avant le fauteuil ». Un seul bloc, rejouable sans
-- dommage.
--
-- « N'oublie pas de me faire un résumé de ce que je dois savoir avant un
-- RDV d'un client. Credo vient le 13 novembre, il faut que je me souvienne
-- de relire notre conversation. » (Yéman, 31 octobre 2026). Choix 5 de la
-- maquette Jx3pJY3ZkzWkr9a9RXUFf3, tranché au sélecteur le même jour : une
-- photo ou une vidéo reçue de la cliente est enregistrée dans un coffre et
-- attachée au rendez-vous ; un lien Facebook, TikTok ou Instagram est gardé
-- comme lien, avec son titre, jamais copié.
--
--   · le compartiment PRIVÉ `pieces-des-clientes` : 60 Mo par pièce (une
--     vidéo WhatsApp de modèle de coiffure), images et vidéos seulement
--     (JPEG, PNG, WebP, HEIC de l'iPhone, MP4, QuickTime).
--   · le personnel connecté VOIT (adresse signée depuis le Trône) et
--     DÉPOSE : Opale, depuis le WhatsApp Web de la direction, et la main au
--     Trône attachent les pièces au rendez-vous. Ce n'est pas une file
--     publique : seul un compte du personnel écrit.
--   · la direction seule EFFACE.
--
-- RIEN D'AUTRE EN BASE. La pièce elle-même s'attache au rendez-vous, dans
-- `appointments.data.pieces` (un tableau : id, kind, titre, quand, url ou
-- chemin dans ce coffre, origine), type `PieceEnvoyee` de
-- `src/shared/avant-le-fauteuil-pur.ts`. Aucune table nouvelle.
--
-- `is_staff()` (0003) et `est_direction()` (0089) existent déjà.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'is_staff') then
    raise exception 'is_staff() est absente : passez d’abord 0003_auth.sql';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'est_direction') then
    raise exception 'est_direction() est absente : passez d’abord 0089';
  end if;
end $$;

-- ── ① LE COFFRE DES PIÈCES ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pieces-des-clientes', 'pieces-des-clientes', false, 60000000,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4', 'video/quicktime']
)
on conflict (id) do nothing;

-- ── ② LES DROITS ────────────────────────────────────────────────────
-- VOIR : le personnel connecté (adresse signée depuis le Trône).
drop policy if exists pieces_des_clientes_voir on storage.objects;
create policy pieces_des_clientes_voir on storage.objects for select to authenticated
  using (bucket_id = 'pieces-des-clientes' and public.is_staff());

-- DÉPOSER : le personnel connecté (Opale depuis le WhatsApp Web de la
-- direction, la main au Trône). Jamais l'anonyme : une file qu'on peut
-- remplir est une file qu'on remplit.
drop policy if exists pieces_des_clientes_deposer on storage.objects;
create policy pieces_des_clientes_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'pieces-des-clientes' and public.is_staff());

-- EFFACER : la direction seule.
drop policy if exists pieces_des_clientes_effacer on storage.objects;
create policy pieces_des_clientes_effacer on storage.objects for delete to authenticated
  using (bucket_id = 'pieces-des-clientes' and public.est_direction());

-- ── CONTRÔLE ────────────────────────────────────────────────────────
-- Doit rendre : le coffre fermé au public (60 000 000 octets, six types),
-- et trois politiques pieces_des_clientes_* (SELECT, INSERT, DELETE).
select id as compartiment, public as ouvert_au_public, file_size_limit as taille_max, allowed_mime_types as types
from storage.buckets where id = 'pieces-des-clientes';
select policyname as politique, cmd as commande
from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'pieces_des_clientes_%'
order by policyname;
