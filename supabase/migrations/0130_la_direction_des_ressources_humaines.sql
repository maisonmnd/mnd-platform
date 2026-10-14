-- ═══════════════════════════════════════════════════════════════════
-- 0130 — LA DIRECTION DES RESSOURCES HUMAINES · 14 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc.
--
-- Maquette QLU1EoT6EtJRgD8ukdkCVB validée (« construis »), avec ses quatre
-- choix : la direction seule tient les ressources humaines, chaque employée
-- a son espace complet, la grille des compétences avertit l'agenda, tout en
-- une mise en ligne.
--
-- « LA DIRECTION SEULE » SE DIT ICI `is_souverain()`, comme la paie depuis
-- 0013 (« Y. et B. »). `est_direction()` compte aussi le gérant : il garde ce
-- qu'il avait (corriger un pointage), il ne lit pas les dossiers.
--
-- QUATRE FUITES RELEVÉES DANS LE CODE, FERMÉES ICI (et à l'écran) :
--   ① le salaire de base s'affichait dans la liste de l'équipe (écran) ;
--   ② « la paie attend votre oui » partait à tout le personnel (fonction) ;
--   ③ les fiches de l'équipe, salaires compris, se lisaient par tout compte
--      du personnel : les champs privés passent dans `team_dossiers`, et les
--      primes, retenues et confirmations de paie (`documents`) au souverain ;
--   ④ le pointage d'une autre se modifiait par n'importe quel compte : chacune
--      écrit le sien (est_ma_fiche, 0090), la direction corrige.
--
-- LE LIEN COMPTE ↔ FICHE est celui de 0090 : `est_ma_fiche(fiche)` compare
-- l'adresse de connexion (compteMail, sinon email) à celle de la session.
-- Une fiche sans adresse ne pointe plus et ne voit pas son espace : l'écran
-- le dit, et la direction pose l'adresse.
-- ═══════════════════════════════════════════════════════════════════


-- ── ① LES CHAMPS PRIVÉS D'UNE FICHE ──────────────────────────────────
-- Une seule liste, lue par la garde de `team` et par la reprise. La même
-- vit côté Trône (CHAMPS_DU_DOSSIER, equipe/data.ts) : le banc les compare.
create or replace function public.champs_du_dossier() returns text[]
language sql immutable as $$
  select array[
    'salaireXof', 'commPrestaXof', 'commProduitXof', 'primeXof',
    'cnssNum', 'ifu', 'contractType', 'paiement',
    'commissionPct', 'commissionTauxPct', 'commissionne', 'grille',
    'retenuesCompteCourant', 'evaluations',
    'satisfaction', 'wellbeing', 'charge', 'risk', 'riskDrivers', 'nextStep', 'recognition',
    'finContrat', 'finEssai', 'aptitude', 'urgence', 'integration', 'depart'
  ]::text[]
$$;

create table if not exists public.team_dossiers (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists team_dossiers_touch on public.team_dossiers;
create trigger team_dossiers_touch before update on public.team_dossiers
  for each row execute function public.touch_updated_at();

alter table public.team_dossiers enable row level security;
drop policy if exists dossier_lire on public.team_dossiers;
create policy dossier_lire on public.team_dossiers for select to authenticated
  using (public.is_souverain() or public.est_ma_fiche(id));
drop policy if exists dossier_creer on public.team_dossiers;
create policy dossier_creer on public.team_dossiers for insert to authenticated
  with check (public.is_souverain());
drop policy if exists dossier_modifier on public.team_dossiers;
create policy dossier_modifier on public.team_dossiers for update to authenticated
  using (public.is_souverain()) with check (public.is_souverain());
drop policy if exists dossier_retirer on public.team_dossiers;
create policy dossier_retirer on public.team_dossiers for delete to authenticated
  using (public.is_souverain());


-- ── ② LA GARDE DE `team` ────────────────────────────────────────────
-- Les champs privés n'y vivent plus. Un vieux Trône encore ouvert peut en
-- envoyer : écrits par le souverain (ou par le serveur), ils passent dans le
-- dossier ; écrits par un autre compte, ils tombent. Puis la garde d'avant
-- (0091, 0109) : hors direction, les adresses et l'accès ne bougent pas.
create or replace function public.team_garde_la_paie() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cle text;
  prives jsonb;
begin
  if new.data ?| public.champs_du_dossier() then
    if auth.uid() is null or public.is_souverain() then
      select coalesce(jsonb_object_agg(k, new.data -> k), '{}'::jsonb) into prives
        from unnest(public.champs_du_dossier()) as k
       where new.data ? k;
      insert into public.team_dossiers as d (id, branch_id, data)
        values (new.id, new.branch_id,
                jsonb_build_object('id', new.id, 'branchId', new.data -> 'branchId') || prives)
        on conflict (id) do update set data = d.data || excluded.data;
    end if;
    new.data := new.data - public.champs_du_dossier();
  end if;

  if auth.uid() is null or public.est_direction() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    foreach cle in array array['email', 'compteMail', 'roleDAcces', 'inviteeLe'] loop
      if old.data ? cle then
        new.data := jsonb_set(new.data, array[cle], old.data -> cle, true);
      else
        new.data := new.data - cle;
      end if;
    end loop;
  else
    new.data := new.data - 'roleDAcces' - 'inviteeLe';
  end if;
  return new;
end $$;

-- Une fiche effacée (créée par erreur) emporte son dossier.
create or replace function public.team_emporte_son_dossier() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.team_dossiers where id = old.id;
  return old;
end $$;
drop trigger if exists team_emporte_son_dossier_ad on public.team;
create trigger team_emporte_son_dossier_ad after delete on public.team
  for each row execute function public.team_emporte_son_dossier();


-- ── ③ LA REPRISE : CE QUI EST DÉJÀ ÉCRIT PASSE DANS LES DOSSIERS ─────
-- La garde ci-dessus fait le travail : on réécrit les fiches qui portent
-- encore un champ privé (le SQL Editor n'a pas de session, donc il déplace).
update public.team set data = data where data ?| public.champs_du_dossier();


-- ── ④ LES DOCUMENTS DE LA PAIE : AU SOUVERAIN ────────────────────────
-- `docs_staff_all` (0006) ouvrait tout `documents` à tout le personnel. Elle
-- devient quatre règles : rien ne change pour les autres clés.
--   · privées (lues et écrites par le souverain seul) : primes, retenues,
--     ajustements et confirmations de paie ;
--   · écrites par le souverain, lues du personnel : le planning, les
--     réglages des RH, les listes d'intégration.
create or replace function public.cles_rh_privees() returns text[]
language sql immutable as $$
  select array['mnd_paie_overrides', 'mnd_primes', 'mnd_paie_confirm', 'mnd_retenues']::text[]
$$;
create or replace function public.cles_rh_du_souverain() returns text[]
language sql immutable as $$
  select array['mnd_planning', 'mnd_rh_reglages', 'mnd_integration']::text[]
$$;

drop policy if exists docs_staff_all on public.documents;
drop policy if exists docs_staff_lire on public.documents;
create policy docs_staff_lire on public.documents for select to authenticated
  using (public.is_staff() and (not (key = any(public.cles_rh_privees())) or public.is_souverain()));
drop policy if exists docs_staff_creer on public.documents;
create policy docs_staff_creer on public.documents for insert to authenticated
  with check (public.is_staff()
    and (not (key = any(public.cles_rh_privees() || public.cles_rh_du_souverain())) or public.is_souverain()));
drop policy if exists docs_staff_modifier on public.documents;
create policy docs_staff_modifier on public.documents for update to authenticated
  using (public.is_staff()
    and (not (key = any(public.cles_rh_privees() || public.cles_rh_du_souverain())) or public.is_souverain()))
  with check (public.is_staff()
    and (not (key = any(public.cles_rh_privees() || public.cles_rh_du_souverain())) or public.is_souverain()));
drop policy if exists docs_staff_retirer on public.documents;
create policy docs_staff_retirer on public.documents for delete to authenticated
  using (public.is_staff()
    and (not (key = any(public.cles_rh_privees() || public.cles_rh_du_souverain())) or public.is_souverain()));


-- ── ⑤ LE REGISTRE DES RESSOURCES HUMAINES ────────────────────────────
-- Une table, des genres : poste, candidature, entretien, sanction, piece,
-- accident, formation. Le souverain lit et écrit tout ; la personne lit ce
-- qui la concerne quand c'est partagé avec elle (un entretien signé, une
-- sanction remise, une pièce de son dossier).
create table if not exists public.rh (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists rh_touch on public.rh;
create trigger rh_touch before update on public.rh
  for each row execute function public.touch_updated_at();
alter table public.rh enable row level security;
drop policy if exists rh_lire on public.rh;
create policy rh_lire on public.rh for select to authenticated
  using (public.is_souverain()
    or (coalesce(data ->> 'partage', '') = 'true' and public.est_ma_fiche(data ->> 'staffId')));
drop policy if exists rh_ecrire on public.rh;
create policy rh_ecrire on public.rh for insert to authenticated with check (public.is_souverain());
drop policy if exists rh_modifier on public.rh;
create policy rh_modifier on public.rh for update to authenticated
  using (public.is_souverain()) with check (public.is_souverain());
drop policy if exists rh_retirer on public.rh;
create policy rh_retirer on public.rh for delete to authenticated using (public.is_souverain());


-- ── ⑥ LES BULLETINS, À CHACUNE LE SIEN ───────────────────────────────
-- Les runs de paie restent au souverain (0013). Au passage « payé », chaque
-- ligne devient un bulletin que sa titulaire lit dans son espace.
create table if not exists public.bulletins (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists bulletins_touch on public.bulletins;
create trigger bulletins_touch before update on public.bulletins
  for each row execute function public.touch_updated_at();
alter table public.bulletins enable row level security;
drop policy if exists bulletins_lire on public.bulletins;
create policy bulletins_lire on public.bulletins for select to authenticated
  using (public.is_souverain() or public.est_ma_fiche(data ->> 'employeeId'));
drop policy if exists bulletins_ecrire on public.bulletins;
create policy bulletins_ecrire on public.bulletins for insert to authenticated with check (public.is_souverain());
drop policy if exists bulletins_modifier on public.bulletins;
create policy bulletins_modifier on public.bulletins for update to authenticated
  using (public.is_souverain()) with check (public.is_souverain());
drop policy if exists bulletins_retirer on public.bulletins;
create policy bulletins_retirer on public.bulletins for delete to authenticated using (public.is_souverain());


-- ── ⑦ LES CONGÉS : ELLE DEMANDE, LA DIRECTION DÉCIDE ─────────────────
-- Jusqu'ici au souverain seul (0013). Elle lit les siens, en demande, et
-- retire une demande pas encore tranchée. Une décision reste au souverain.
drop policy if exists staff_all on public.leave_requests;
drop policy if exists conges_lire on public.leave_requests;
create policy conges_lire on public.leave_requests for select to authenticated
  using (public.is_souverain() or public.est_ma_fiche(data ->> 'employeeId'));
drop policy if exists conges_demander on public.leave_requests;
create policy conges_demander on public.leave_requests for insert to authenticated
  with check (public.is_souverain()
    or (public.est_ma_fiche(data ->> 'employeeId')
        and data ->> 'status' = 'demande' and coalesce(data ->> 'decidedBy', '') = ''));
drop policy if exists conges_modifier on public.leave_requests;
create policy conges_modifier on public.leave_requests for update to authenticated
  using (public.is_souverain()
    or (public.est_ma_fiche(data ->> 'employeeId') and data ->> 'status' = 'demande'))
  with check (public.is_souverain()
    or (public.est_ma_fiche(data ->> 'employeeId')
        and data ->> 'status' = 'demande' and coalesce(data ->> 'decidedBy', '') = ''));
drop policy if exists conges_retirer on public.leave_requests;
create policy conges_retirer on public.leave_requests for delete to authenticated
  using (public.is_souverain()
    or (public.est_ma_fiche(data ->> 'employeeId') and data ->> 'status' = 'demande'));


-- ── ⑧ LE POINTAGE : CHACUNE LE SIEN ──────────────────────────────────
-- 0026 l'ouvrait à tout le personnel faute de savoir quel compte est quelle
-- fiche. est_ma_fiche le sait. La direction (gérant compris) corrige.
drop policy if exists staff_all on public.attendance;
drop policy if exists pointage_lire on public.attendance;
create policy pointage_lire on public.attendance for select to authenticated
  using (public.is_staff());
drop policy if exists pointage_creer on public.attendance;
create policy pointage_creer on public.attendance for insert to authenticated
  with check (public.est_direction() or public.est_ma_fiche(data ->> 'employeeId'));
drop policy if exists pointage_modifier on public.attendance;
create policy pointage_modifier on public.attendance for update to authenticated
  using (public.est_direction() or public.est_ma_fiche(data ->> 'employeeId'))
  with check (public.est_direction() or public.est_ma_fiche(data ->> 'employeeId'));
drop policy if exists pointage_retirer on public.attendance;
create policy pointage_retirer on public.attendance for delete to authenticated
  using (public.est_direction());


-- ── ⑨ SON PRÊT, LU PAR ELLE ──────────────────────────────────────────
-- Les prêts restent au souverain (0038) ; la personne lit les lignes qui
-- portent sa fiche.
drop policy if exists prets_lire_les_siens on public.prets_associes;
create policy prets_lire_les_siens on public.prets_associes for select to authenticated
  using (public.est_ma_fiche(data ->> 'personneId'));


-- ── ⑩ LE COMPARTIMENT DES DOSSIERS ───────────────────────────────────
-- Privé. `<fiche>/direction/…` pour le souverain seul ; `<fiche>/partage/…`
-- lisible aussi par la personne (son contrat signé, son règlement…).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rh', 'rh', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rh_fichiers_lire on storage.objects;
create policy rh_fichiers_lire on storage.objects for select to authenticated
  using (bucket_id = 'rh' and (public.is_souverain()
    or ((storage.foldername(name))[2] = 'partage' and public.est_ma_fiche((storage.foldername(name))[1]))));
drop policy if exists rh_fichiers_deposer on storage.objects;
create policy rh_fichiers_deposer on storage.objects for insert to authenticated
  with check (bucket_id = 'rh' and public.is_souverain());
drop policy if exists rh_fichiers_remplacer on storage.objects;
create policy rh_fichiers_remplacer on storage.objects for update to authenticated
  using (bucket_id = 'rh' and public.is_souverain())
  with check (bucket_id = 'rh' and public.is_souverain());
drop policy if exists rh_fichiers_retirer on storage.objects;
create policy rh_fichiers_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'rh' and public.is_souverain());


-- ── ⑪ LE DIRECT : LES TROIS TABLES NEUVES ────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['team_dossiers', 'rh', 'bulletins'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;


-- ── LE CONTRÔLE ────────────────────────────────────────────────────
-- Attendu : dossiers « protégée », 4 ; fiches sans champ privé 0 ;
-- documents 4 règles, plus de docs_staff_all ; rh et bulletins protégées ;
-- congés 4 ; pointage 4 ; prêt lu par elle true ; compartiment fermé, 4 ;
-- direct 3.
select
  (select case when c.relrowsecurity then 'protégée' else 'OUVERTE' end from pg_class c
     where c.relname = 'team_dossiers' and c.relnamespace = 'public'::regnamespace) as dossiers,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'team_dossiers') as regles_dossiers,
  (select count(*) from public.team t where t.data ?| public.champs_du_dossier()) as fiches_avec_champ_prive,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'documents'
     and p.policyname like 'docs_staff_%') as regles_documents,
  not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'documents'
     and p.policyname = 'docs_staff_all') as ancienne_regle_partie,
  (select string_agg(c.relname || case when c.relrowsecurity then ' protégée' else ' OUVERTE' end, ', ' order by c.relname)
     from pg_class c where c.relname in ('rh', 'bulletins') and c.relnamespace = 'public'::regnamespace) as registres,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'leave_requests'
     and p.policyname like 'conges_%') as regles_conges,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'attendance'
     and p.policyname like 'pointage_%') as regles_pointage,
  exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = 'prets_associes'
     and p.policyname = 'prets_lire_les_siens') as pret_lu_par_elle,
  (select public from storage.buckets where id = 'rh') as compartiment_ouvert_au_public,
  (select count(*) from pg_policies p where p.schemaname = 'storage' and p.policyname like 'rh_fichiers_%') as regles_compartiment,
  (select count(*) from pg_publication_tables r where r.pubname = 'supabase_realtime'
     and r.tablename in ('team_dossiers', 'rh', 'bulletins')) as direct;
