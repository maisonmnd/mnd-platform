-- ═══════════════════════════════════════════════════════════════════
-- 0116 — LE SECRÉTARIAT · 6 octobre 2026
--
-- « Can I have an editor for documents on the Trône? » (Yéman). Maquette
-- « Le secrétariat », validée ; choix au sélecteur : chacun ne pose que sa
-- signature, pas d'assistant, modèles juridiques à faire relire, lettres
-- personnelles visibles de Yéman et Brice.
--
-- UNE TABLE, QUATRE GENRES DE LIGNES (data->>'genre') :
--   piece        un document écrit (lettre, attestation, contrat…) ;
--   entreprise   une entreprise créée à l'instant (nom, mentions, tampon,
--                signature de son signataire) ;
--   signataire   la fiche de qui signe (son compte, son nom, sa qualité) ;
--   profil       les coordonnées personnelles d'une lettre personnelle.
--
-- LA RÈGLE DE LA BASE, pas seulement de l'écran :
--   - une ligne PERSONNELLE (data->>'entite' = 'perso') ne se lit et ne
--     s'écrit que par la direction ; les autres lignes, par le personnel ;
--   - un document SIGNÉ ne se modifie plus : seule la direction peut y
--     toucher, pour l'annuler ;
--   - chacun ne pose que SA signature (sig:<son compte>), la base le
--     vérifie à chaque écriture ;
--   - seule la direction efface.
--
-- DEUX COMPARTIMENTS :
--   signatures   PRIVÉ, chacun ne lit, ne dépose et ne retire que SA
--                signature (dossier = son identifiant de compte) ;
--   (les documents signés ne sont pas stockés en PDF : ils gardent en eux
--    l'image de chaque signature posée, et le PDF se refait à l'identique.)
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.secretariat (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists secretariat_branch_idx on public.secretariat (branch_id);
create index if not exists secretariat_genre_idx on public.secretariat ((data->>'genre'));

drop trigger if exists secretariat_touch on public.secretariat;
create trigger secretariat_touch before update on public.secretariat
  for each row execute function public.touch_updated_at();

alter table public.secretariat enable row level security;

drop policy if exists secretariat_lire on public.secretariat;
create policy secretariat_lire on public.secretariat for select to authenticated
  using (public.is_staff() and (coalesce(data->>'entite', '') <> 'perso' or public.est_direction()));

drop policy if exists secretariat_ecrire on public.secretariat;
create policy secretariat_ecrire on public.secretariat for insert to authenticated
  with check (public.is_staff() and (coalesce(data->>'entite', '') <> 'perso' or public.est_direction()));

drop policy if exists secretariat_modifier on public.secretariat;
create policy secretariat_modifier on public.secretariat for update to authenticated
  using (public.is_staff() and (coalesce(data->>'entite', '') <> 'perso' or public.est_direction()))
  with check (public.is_staff() and (coalesce(data->>'entite', '') <> 'perso' or public.est_direction()));

drop policy if exists secretariat_effacer on public.secretariat;
create policy secretariat_effacer on public.secretariat for delete to authenticated
  using (public.est_direction());

-- Signé, c'est figé : seule la direction touche à un document signé.
create or replace function public.secretariat_garde_le_signe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.data->>'genre' = 'piece' and old.data->>'etat' = 'signe'
     and new.data is distinct from old.data and not public.est_direction() then
    raise exception 'Un document signé ne se modifie plus.';
  end if;
  return new;
end $$;

drop trigger if exists secretariat_garde_le_signe on public.secretariat;
create trigger secretariat_garde_le_signe before update on public.secretariat
  for each row execute function public.secretariat_garde_le_signe();

-- CHACUN NE POSE QUE SA SIGNATURE, et la base le tient, pas seulement
-- l'écran. Une signature NEUVE (une image qui n'était pas là avant, au même
-- endroit) doit porter la clé du compte qui écrit (sig:<son compte>) et
-- dire qu'il l'a posée lui-même. Seule exception : la signature d'une
-- entreprise créée à l'instant (sig:entreprise), posée par la direction.
-- Sur un upsert, l'ancienne ligne se relit dans la table.
create or replace function public.secretariat_garde_les_signatures() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  avant jsonb;
  pose jsonb;
  moi text := coalesce(auth.uid()::text, '');
begin
  if new.data->>'genre' is distinct from 'piece' then return new; end if;
  if tg_op = 'UPDATE' then
    avant := old.data;
  else
    select s.data into avant from public.secretariat s where s.id = new.id;
  end if;
  for pose in select * from jsonb_array_elements(coalesce(new.data->'poses', '[]'::jsonb)) loop
    if pose ? 'image' and pose->>'cle' like 'sig:%'
       and not exists (
         select 1 from jsonb_array_elements(coalesce(avant->'poses', '[]'::jsonb)) a
         where a->>'cle' = pose->>'cle' and a->>'image' = pose->>'image'
       ) then
      if not (
        (moi <> '' and pose->>'cle' = 'sig:' || moi and pose->>'signePar' = moi)
        or (pose->>'cle' = 'sig:entreprise' and public.est_direction())
      ) then
        raise exception 'Chacun ne pose que sa propre signature.';
      end if;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists secretariat_garde_les_signatures on public.secretariat;
create trigger secretariat_garde_les_signatures before insert or update on public.secretariat
  for each row execute function public.secretariat_garde_les_signatures();

do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'secretariat') then
    alter publication supabase_realtime add table public.secretariat;
  end if;
end $$;

-- ── LE COMPARTIMENT DES SIGNATURES : à chacun la sienne ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signatures', 'signatures', false, 2097152, array['image/png'])
on conflict (id) do nothing;

drop policy if exists signatures_lire on storage.objects;
create policy signatures_lire on storage.objects for select to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists signatures_deposer on storage.objects;
create policy signatures_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists signatures_remplacer on storage.objects;
create policy signatures_remplacer on storage.objects for update to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists signatures_retirer on storage.objects;
create policy signatures_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'signatures' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── LE CONTRÔLE ────────────────────────────────────────────────────
-- Attendu : la table « protégée » avec 4 politiques et le temps réel ;
-- le compartiment « signatures » fermé au public ; 4 politiques du compartiment ;
-- 2 gardes (le signé figé, chacun sa signature).
select
  'secretariat' as table_neuve,
  case when c.relrowsecurity then 'protégée' else 'OUVERTE' end as rls,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'secretariat') as politiques,
  exists (select 1 from pg_publication_tables r where r.pubname = 'supabase_realtime' and r.tablename = 'secretariat') as temps_reel,
  (select public from storage.buckets where id = 'signatures') as signatures_ouvertes_au_public,
  (select count(*) from pg_policies p where p.schemaname = 'storage' and p.policyname like 'signatures_%') as politiques_des_signatures,
  (select count(*) from pg_trigger t where t.tgrelid = c.oid and t.tgname like 'secretariat_garde%') as gardes
from pg_class c
where c.relname = 'secretariat' and c.relnamespace = 'public'::regnamespace;
