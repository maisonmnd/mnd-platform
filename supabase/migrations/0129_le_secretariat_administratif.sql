-- ═══════════════════════════════════════════════════════════════════
-- 0129 — LE SECRÉTARIAT ADMINISTRATIF · 14 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc.
--
-- Maquette TChByryYz3fpTZQ7RELK6x validée (« construis »), avec ses quatre
-- choix : un rôle « Secrétariat », le courrier en photo et au classeur, les
-- rappels dans À faire et en notification, tout en une mise en ligne.
--
-- SIX GENRES NEUFS dans la table `secretariat` (0116) :
--   courrier   ce qui arrive et ce qui part (A-2026-001, D-2026-001) ;
--   echeance   une date à tenir, qui peut revenir ;
--   contrat    un contrat ou un abonnement ;
--   demarche   un dossier en cours et ses étapes ;
--   contact    l'annuaire ;
--   cloture    une année close (les archives).
--
-- LE RÔLE « SECRÉTARIAT », tenu par la base et non par l'écran :
--   - la table `secretariat_titulaires`, que la direction seule remplit
--     (Système › Accès & rôles) ;
--   - `tient_le_secretariat()` : la direction, ou un titulaire ;
--   - échéances, contrats, démarches, clôtures : vus de qui tient le
--     secrétariat seulement ;
--   - courrier : qui tient le secrétariat, ET la personne à qui il est
--     confié (elle le lit et le marque répondu ; elle n'en crée pas) ;
--   - contacts : lus de tout le personnel, écrits par qui tient le
--     secrétariat ;
--   - clore une année : la direction ; un courrier ou une démarche d'une
--     année close ne bouge plus, sauf pour la direction ;
--   - le privé (prive: true) reste à la direction, comme en 0122 ;
--   - le genre d'une ligne ne change jamais.
--   Les genres d'avant (documents, entreprises, signataires, profils,
--   mentions, bourse) gardent leur règle de 0116 et 0122.
--
-- UN COMPARTIMENT PRIVÉ `secretariat` : photos du courrier, contrats signés,
-- reçus. Un fichier se lit si sa ligne se lit (premier dossier = id de la
-- ligne) ; qui tient le secrétariat dépose ; la direction seule retire.
--
-- UNE FONCTION `secretariat_equipe()` : le nom de chaque compte du
-- personnel, et s'il tient le secrétariat, pour dire à qui une ligne est
-- confiée. Personnel seulement.
-- ═══════════════════════════════════════════════════════════════════

-- ── LES TITULAIRES DU SECRÉTARIAT ──────────────────────────────────
create table if not exists public.secretariat_titulaires (
  user_id uuid primary key references auth.users(id) on delete cascade,
  donne_par uuid,
  donne_le timestamptz not null default now()
);
alter table public.secretariat_titulaires enable row level security;
drop policy if exists sec_titulaires_lire on public.secretariat_titulaires;
create policy sec_titulaires_lire on public.secretariat_titulaires for select to authenticated
  using (public.is_staff());
drop policy if exists sec_titulaires_donner on public.secretariat_titulaires;
create policy sec_titulaires_donner on public.secretariat_titulaires for insert to authenticated
  with check (public.est_direction());
drop policy if exists sec_titulaires_retirer on public.secretariat_titulaires;
create policy sec_titulaires_retirer on public.secretariat_titulaires for delete to authenticated
  using (public.est_direction());

create or replace function public.tient_le_secretariat() returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_direction()
      or exists (select 1 from public.secretariat_titulaires t where t.user_id = auth.uid());
$$;

create or replace function public.secretariat_equipe() returns table (user_id uuid, nom text, tient boolean)
language sql stable security definer set search_path = public as $$
  select s.user_id, coalesce(nullif(trim(s.name), ''), split_part(u.email, '@', 1), 'Compte sans nom'),
         s.role in ('souverain', 'gerant') or exists (select 1 from public.secretariat_titulaires t where t.user_id = s.user_id)
  from public.staff s left join auth.users u on u.id = s.user_id
  where public.is_staff()
  order by 2;
$$;
revoke all on function public.secretariat_equipe() from public, anon;
grant execute on function public.secretariat_equipe() to authenticated;

-- ── LES RÈGLES DE LA TABLE, GENRE PAR GENRE ────────────────────────
-- Première ligne : le privé, mot pour mot de 0122. Seconde : le genre.
drop policy if exists secretariat_lire on public.secretariat;
create policy secretariat_lire on public.secretariat for select to authenticated
  using (public.is_staff()
    and ((coalesce(data->>'entite', '') <> 'perso' and coalesce(data->>'prive', '') <> 'true') or public.est_direction())
    and (case
      when data->>'genre' in ('echeance', 'contrat', 'demarche', 'cloture') then public.tient_le_secretariat()
      when data->>'genre' = 'courrier' then public.tient_le_secretariat() or data->>'traitePar' = auth.uid()::text
      else true
    end));
drop policy if exists secretariat_ecrire on public.secretariat;
create policy secretariat_ecrire on public.secretariat for insert to authenticated
  with check (public.is_staff()
    and ((coalesce(data->>'entite', '') <> 'perso' and coalesce(data->>'prive', '') <> 'true') or public.est_direction())
    and (case
      when data->>'genre' = 'cloture' then public.est_direction()
      when data->>'genre' in ('echeance', 'contrat', 'demarche', 'contact') then public.tient_le_secretariat()
      -- Le courrier confié passe par un upsert : la garde plus bas refuse
      -- qu'une personne qui ne tient pas le secrétariat en CRÉE un.
      when data->>'genre' = 'courrier' then public.tient_le_secretariat() or data->>'traitePar' = auth.uid()::text
      else true
    end));
drop policy if exists secretariat_modifier on public.secretariat;
create policy secretariat_modifier on public.secretariat for update to authenticated
  using (public.is_staff()
    and ((coalesce(data->>'entite', '') <> 'perso' and coalesce(data->>'prive', '') <> 'true') or public.est_direction())
    and (case
      when data->>'genre' = 'cloture' then public.est_direction()
      when data->>'genre' in ('echeance', 'contrat', 'demarche', 'contact') then public.tient_le_secretariat()
      when data->>'genre' = 'courrier' then public.tient_le_secretariat() or data->>'traitePar' = auth.uid()::text
      else true
    end))
  with check (public.is_staff()
    and ((coalesce(data->>'entite', '') <> 'perso' and coalesce(data->>'prive', '') <> 'true') or public.est_direction())
    and (case
      when data->>'genre' = 'cloture' then public.est_direction()
      when data->>'genre' in ('echeance', 'contrat', 'demarche', 'contact') then public.tient_le_secretariat()
      when data->>'genre' = 'courrier' then public.tient_le_secretariat() or data->>'traitePar' = auth.uid()::text
      else true
    end));

-- ── LES GARDES ─────────────────────────────────────────────────────
-- Un courrier NEUF ne s'enregistre que par qui tient le secrétariat ; le
-- genre d'une ligne ne change jamais ; une année close ne bouge plus.
-- Sur un upsert, l'ancienne ligne se relit dans la table (comme en 0116).
create or replace function public.secretariat_garde_l_administratif() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  avant jsonb;
  annee int;
begin
  if tg_op = 'INSERT' then
    select s.data into avant from public.secretariat s where s.id = new.id;
    if avant is null then
      if new.data->>'genre' = 'courrier' and not public.tient_le_secretariat() then
        raise exception 'Seul le secrétariat enregistre un courrier.';
      end if;
      return new;
    end if;
  else
    avant := old.data;
  end if;
  if tg_op <> 'DELETE' and avant->>'genre' is distinct from new.data->>'genre' then
    raise exception 'Le genre d''une ligne du secrétariat ne change pas.';
  end if;
  if tg_op = 'DELETE' or new.data is distinct from avant then
    annee := case
      when avant->>'genre' = 'courrier' and avant->>'date' ~ '^[0-9]{4}-' then left(avant->>'date', 4)::int
      when avant->>'genre' = 'demarche' and avant->>'termineeLe' ~ '^[0-9]{4}-' then left(avant->>'termineeLe', 4)::int
    end;
    if annee is not null and not public.est_direction() and exists (
      select 1 from public.secretariat c
      where c.data->>'genre' = 'cloture' and c.data->>'annee' = annee::text
    ) then
      raise exception 'L''année % est close : seule la direction y touche.', annee;
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists secretariat_garde_l_administratif on public.secretariat;
create trigger secretariat_garde_l_administratif before insert or update or delete on public.secretariat
  for each row execute function public.secretariat_garde_l_administratif();

-- ── LE COMPARTIMENT DU SECRÉTARIAT ─────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('secretariat', 'secretariat', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
drop policy if exists sec_fichiers_lire on storage.objects;
create policy sec_fichiers_lire on storage.objects for select to authenticated
  using (bucket_id = 'secretariat'
    and exists (select 1 from public.secretariat s where s.id = (storage.foldername(name))[1]));
drop policy if exists sec_fichiers_deposer on storage.objects;
create policy sec_fichiers_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'secretariat' and public.tient_le_secretariat());
drop policy if exists sec_fichiers_remplacer on storage.objects;
create policy sec_fichiers_remplacer on storage.objects for update to authenticated
  using (bucket_id = 'secretariat' and public.tient_le_secretariat())
  with check (bucket_id = 'secretariat' and public.tient_le_secretariat());
drop policy if exists sec_fichiers_retirer on storage.objects;
create policy sec_fichiers_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'secretariat' and public.est_direction());

-- ── LE CONTRÔLE ────────────────────────────────────────────────────
-- Attendu : titulaires « protégée », 3 politiques ; 3 politiques du
-- secrétariat qui parlent du rôle ; la garde administrative posée ; le
-- compartiment fermé au public, 4 politiques ; les deux fonctions.
select
  (select case when c.relrowsecurity then 'protégée' else 'OUVERTE' end from pg_class c
     where c.relname = 'secretariat_titulaires' and c.relnamespace = 'public'::regnamespace) as titulaires,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'secretariat_titulaires') as politiques_titulaires,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'secretariat'
     and (coalesce(p.qual, '') || coalesce(p.with_check, '')) like '%tient_le_secretariat%') as politiques_du_role,
  exists (select 1 from pg_trigger t where t.tgrelid = 'public.secretariat'::regclass
     and t.tgname = 'secretariat_garde_l_administratif') as garde_posee,
  (select public from storage.buckets where id = 'secretariat') as compartiment_ouvert_au_public,
  (select count(*) from pg_policies p where p.schemaname = 'storage' and p.policyname like 'sec_fichiers_%') as politiques_du_compartiment,
  (select count(*) from pg_proc where proname in ('tient_le_secretariat', 'secretariat_equipe')
     and pronamespace = 'public'::regnamespace) as fonctions;
