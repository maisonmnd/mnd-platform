-- ═══════════════════════════════════════════════════════════════════
-- 0114 · L'ÉDITEUR DU SITE — 4 octobre 2026
--
-- « L'éditeur des textes et photos du site » (Yéman), maquette validée :
-- les retouches s'écrivent au Trône, Brice et Yéman seuls les publient, le
-- site se refabrique avec elles.
--
--   1. `mnd_site_publie` (les retouches PUBLIÉES) devient lisible sans compte :
--      le générateur du site la lit avec la clef publique, comme les offres.
--      Ce qu'elle porte est déjà en ligne, sur les pages. Le BROUILLON
--      (`mnd_site_brouillon`) reste au personnel, comme tout document.
--   2. Seule la direction écrit `mnd_site_publie` (Brice et Yéman).
--   3. Le compartiment `site` : les photos du site, lisibles de tous (elles
--      sont sur les pages), déposées par la direction seule.
--
-- À coller dans Supabase › SQL Editor, puis Run. Se rejoue sans danger.
-- ═══════════════════════════════════════════════════════════════════

-- 1. La liste blanche de 0108, plus une clé.
drop policy if exists docs_pub_read on public.documents;
create policy docs_pub_read on public.documents for select to anon, authenticated
  using (key = any(array[
    'mnd_settings',
    'mnd_brand',
    'mnd_offers',
    'mnd_cercle_tiers',
    'mnd_points_rate',
    'mnd_crown_styles',
    'mnd_couronne_compose',
    'mnd_vitrine_config',
    'mnd_model_bands',
    'mnd_model_band_sets',
    'mnd_cercle_seuil',
    'mnd_horaires_exceptions',
    'mnd_avis_google',
    -- 0114 :
    'mnd_site_publie'
  ]));

-- 2. Publier est à la direction.
create or replace function public.site_publie_par_la_direction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.key = 'mnd_site_publie' and auth.uid() is not null and not public.est_direction() then
    raise exception 'Seuls Brice et Yéman publient le site.';
  end if;
  return new;
end $$;

drop trigger if exists site_publie_par_la_direction on public.documents;
create trigger site_publie_par_la_direction
  before insert or update on public.documents
  for each row execute function public.site_publie_par_la_direction();

-- 3. Les photos du site.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists site_photos_lire on storage.objects;
create policy site_photos_lire on storage.objects for select to anon, authenticated
  using (bucket_id = 'site');

drop policy if exists site_photos_deposer on storage.objects;
create policy site_photos_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'site' and public.est_direction());

drop policy if exists site_photos_remplacer on storage.objects;
create policy site_photos_remplacer on storage.objects for update to authenticated
  using (bucket_id = 'site' and public.est_direction())
  with check (bucket_id = 'site' and public.est_direction());

drop policy if exists site_photos_retirer on storage.objects;
create policy site_photos_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'site' and public.est_direction());

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select 'mnd_site_publie lisible' as quoi,
       exists (select 1 from pg_policies where policyname = 'docs_pub_read'
               and qual like '%mnd_site_publie%') as ok
union all
select 'compartiment site', exists (select 1 from storage.buckets where id = 'site' and public)
union all
select 'publier : direction', exists (select 1 from pg_trigger where tgname = 'site_publie_par_la_direction');
