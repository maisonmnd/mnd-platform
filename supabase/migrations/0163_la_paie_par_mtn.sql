-- ═══════════════════════════════════════════════════════════════════════════
-- 0163 · LA PAIE PAR MTN, LOT 2 · 5 novembre 2026
--
-- Maquette 6bNGeh7nyABotDAXppWRoX (version 3), validée par Yéman le
-- 5 novembre 2026 (« construis »). Le 5 à 18 h, après le toucher de la
-- direction, le Trône confie chaque net au serveur (fonction `paie-mtn`),
-- qui l'envoie par l'API MTN (Disbursement), par le relais de la Maison,
-- depuis le compte de paie MTN. Un test de 100 F à chacun se fait avant.
--
-- ① LE REGISTRE DES ENVOIS. Une ligne par envoi, sa référence (le
--    X-Reference-Id de MTN, un UUID) donnée AVANT le départ. Un seul envoi
--    vivant par bulletin, et par personne dans un test (index uniques) :
--    une ligne de paie ne part jamais deux fois. Lu par la direction seule ;
--    écrit par le serveur seul (clé de service).
-- ② LE PASSAGE. Toutes les 10 minutes, la base regarde s'il y a un envoi
--    dû ou une réponse attendue ; alors seulement elle appelle `paie-mtn`.
--
-- Rien ne part sans une ligne écrite par le serveur après le toucher de la
-- direction : la base ne crée jamais d'envoi elle-même.
--
-- REJOUABLE : create if not exists, politiques et passage remplacés.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① LE REGISTRE ────────────────────────────────────────────────────────
create table if not exists public.paie_envois_mtn (
  reference       uuid primary key,
  genre           text not null check (genre in ('paie', 'essai')),
  run_id          text,
  periode         text check (periode is null or periode ~ '^[0-9]{4}-[0-9]{2}$'),
  essai_id        text,
  employee_id     text not null,
  nom             text not null check (char_length(nom) between 1 and 120),
  msisdn          text not null check (msisdn ~ '^22901[0-9]{8}$'),
  montant_xof     integer not null check (montant_xof between 1 and 2000000),
  etat            text not null default 'programme'
                  check (etat in ('programme', 'envoi', 'envoye', 'sans-reponse', 'recu', 'refuse', 'annule')),
  part_a          timestamptz not null,
  programme_par   text not null,
  programme_le    timestamptz not null default now(),
  envoye_le       timestamptz,
  repondu_le      timestamptz,
  transaction_mtn text,
  raison          text,
  remplace        uuid references public.paie_envois_mtn (reference),
  note            text,
  tentatives      integer not null default 0,
  annule_par      text,
  annule_le       timestamptz,
  updated_at      timestamptz not null default now(),
  constraint paie_envois_mtn_genre check (
    (genre = 'paie' and run_id is not null and periode is not null and essai_id is null)
    or (genre = 'essai' and essai_id is not null and montant_xof <= 500)
  )
);

create unique index if not exists paie_envois_mtn_un_par_bulletin
  on public.paie_envois_mtn (run_id, employee_id)
  where genre = 'paie' and etat not in ('refuse', 'annule');
create unique index if not exists paie_envois_mtn_un_par_essai
  on public.paie_envois_mtn (essai_id, employee_id)
  where genre = 'essai' and etat not in ('refuse', 'annule');
create index if not exists paie_envois_mtn_a_faire
  on public.paie_envois_mtn (etat, part_a)
  where etat in ('programme', 'envoi', 'envoye', 'sans-reponse');

alter table public.paie_envois_mtn enable row level security;
drop policy if exists direction_lit on public.paie_envois_mtn;
create policy direction_lit on public.paie_envois_mtn for select to authenticated
  using (public.est_direction());
revoke insert, update, delete, truncate on public.paie_envois_mtn from anon, authenticated;

-- ── ② LE PASSAGE, TOUTES LES 10 MINUTES ──────────────────────────────────
create or replace function public.passe_la_paie_mtn_sql()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.paie_envois_mtn
     where (etat = 'programme' and part_a <= now())
        or etat in ('envoi', 'envoye', 'sans-reponse')
  ) then
    return 'rien à faire';
  end if;
  perform public.appelle_fonction_edge('paie-mtn', '{"source":"cron"}'::jsonb);
  return 'paie-mtn appelée';
end $$;
revoke execute on function public.passe_la_paie_mtn_sql() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'paie-par-mtn';
select cron.schedule('paie-par-mtn', '*/10 * * * *', $$select public.passe_la_paie_mtn_sql();$$);

-- ── Contrôle ─────────────────────────────────────────────────────────────
-- Attendu : rls true ; lecture_direction 1 ; ecritures_equipe false ;
-- passage 1 ; envois 0 (rien n'est programmé à la pose).
select
  (select relrowsecurity from pg_class where oid = 'public.paie_envois_mtn'::regclass) as rls,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'paie_envois_mtn' and cmd = 'SELECT') as lecture_direction,
  has_table_privilege('authenticated', 'public.paie_envois_mtn', 'INSERT') as ecritures_equipe,
  (select count(*) from cron.job where jobname = 'paie-par-mtn') as passage,
  (select count(*) from public.paie_envois_mtn) as envois;
