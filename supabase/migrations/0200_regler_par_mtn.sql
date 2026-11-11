-- ═══════════════════════════════════════════════════════════════════════════
-- 0200 · RÉGLER PAR MTN, LOT B · 11 novembre 2026
--
-- Maquette « Régler par MTN, QR » (AdAaYXGStQetsXHFkZzUW5), « construis » de
-- Yéman le 11 novembre 2026. La cliente tape son numéro MTN (au comptoir, par
-- le QR, ou sur la page « Régler » de son rendez-vous) ; le serveur (fonction
-- `collecte-mtn`) demande le JUSTE RESTE, calculé par lui, à MTN (Collection,
-- Request to Pay), par le relais de la Maison ; elle valide sur son téléphone ;
-- le rendez-vous se règle quand MTN dit « réussi », jamais avant.
--
-- ① LE REGISTRE DES DEMANDES. Une ligne par demande, sa référence (le
--    X-Reference-Id de MTN, un UUID) écrite AVANT l'appel. Lu par la direction
--    seule ; écrit par le serveur seul (clé de service). Idempotent par la
--    référence (clé primaire) : une demande ne se pose qu'une fois.
-- ② L'INTERRUPTEUR. Une seule ligne, FERMÉE à la pose : aucune cliente ne peut
--    rien demander tant que la direction ne l'a pas ouverte, et le serveur ne
--    l'ouvre qu'après un essai de 100 F REÇU par MTN (fonction, action
--    `interrupteur`). `rappel` : le serveur donne à MTN l'adresse de rappel
--    déclarée (…/mtn-momo-rappel/collection) ; à éteindre ici si MTN la refuse.
-- ③ LE PASSAGE. Toutes les 2 minutes, la base regarde s'il y a une demande
--    vivante, ou un règlement reçu pas encore posé ; alors seulement elle
--    appelle `collecte-mtn`, qui RELIT MTN. Rien n'est jamais marqué réglé
--    sans la réponse « SUCCESSFUL » de MTN.
--
-- REJOUABLE : create if not exists, politiques et passage remplacés.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① LE REGISTRE ────────────────────────────────────────────────────────
create table if not exists public.collectes_mtn (
  reference       uuid primary key,
  genre           text not null check (genre in ('reglement', 'essai')),
  origine         text not null check (origine in ('lien', 'comptoir', 'essai')),
  rdv_id          text,
  piece_id        text,
  branch_id       text,
  msisdn          text not null check (msisdn ~ '^22901[0-9]{8}$'),
  montant_xof     integer not null check (montant_xof between 1 and 2000000),
  reste_xof       integer not null default 0 check (reste_xof >= 0),
  pourboire_xof   integer not null default 0 check (pourboire_xof between 0 and 100000),
  frais_xof       integer check (frais_xof is null or frais_xof >= 0),
  etat            text not null default 'demande'
                  check (etat in ('demande', 'attente', 'sans-reponse', 'recu', 'refuse')),
  demande_par     text not null check (char_length(demande_par) between 1 and 80),
  demande_le      timestamptz not null default now(),
  relu_le         timestamptz,
  repondu_le      timestamptz,
  transaction_mtn text,
  raison          text,
  tentatives      integer not null default 0,
  pose_le         timestamptz,
  a_rapprocher    text,
  updated_at      timestamptz not null default now(),
  constraint collectes_mtn_genre check (
    (genre = 'reglement' and origine in ('lien', 'comptoir') and rdv_id is not null and piece_id is not null
      and reste_xof >= 1 and montant_xof = reste_xof + pourboire_xof)
    or (genre = 'essai' and origine = 'essai' and rdv_id is null and piece_id is null and montant_xof <= 500
      and reste_xof = 0 and pourboire_xof = 0)
  )
);

create index if not exists collectes_mtn_vivantes
  on public.collectes_mtn (etat, demande_le)
  where etat in ('demande', 'attente', 'sans-reponse');
create index if not exists collectes_mtn_a_poser
  on public.collectes_mtn (repondu_le)
  where etat = 'recu' and pose_le is null and a_rapprocher is null;
create index if not exists collectes_mtn_par_rdv on public.collectes_mtn (rdv_id, demande_le desc);
create index if not exists collectes_mtn_du_jour on public.collectes_mtn (demande_le desc);

alter table public.collectes_mtn enable row level security;
drop policy if exists direction_lit on public.collectes_mtn;
create policy direction_lit on public.collectes_mtn for select to authenticated
  using (public.est_direction());
-- Aucun droit pour l'équipe ni le public, sinon lire (sous la politique).
revoke all on public.collectes_mtn from anon, authenticated;
grant select on public.collectes_mtn to authenticated;

-- ── ② L'INTERRUPTEUR, FERMÉ ──────────────────────────────────────────────
create table if not exists public.collecte_mtn_reglage (
  id          smallint primary key default 1 check (id = 1),
  ouverte     boolean not null default false,
  rappel      boolean not null default true,
  change_par  text,
  change_le   timestamptz,
  updated_at  timestamptz not null default now()
);
insert into public.collecte_mtn_reglage (id) values (1) on conflict (id) do nothing;

alter table public.collecte_mtn_reglage enable row level security;
drop policy if exists direction_lit on public.collecte_mtn_reglage;
create policy direction_lit on public.collecte_mtn_reglage for select to authenticated
  using (public.est_direction());
revoke all on public.collecte_mtn_reglage from anon, authenticated;
grant select on public.collecte_mtn_reglage to authenticated;

-- ── ③ LE PASSAGE, TOUTES LES 2 MINUTES ───────────────────────────────────
create or replace function public.passe_la_collecte_mtn_sql()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.collectes_mtn
     where etat in ('demande', 'attente', 'sans-reponse')
        or (etat = 'recu' and genre = 'reglement' and pose_le is null and a_rapprocher is null)
  ) then
    return 'rien à faire';
  end if;
  perform public.appelle_fonction_edge('collecte-mtn', '{"source":"cron"}'::jsonb);
  return 'collecte-mtn appelée';
end $$;
revoke execute on function public.passe_la_collecte_mtn_sql() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'collecte-par-mtn';
select cron.schedule('collecte-par-mtn', '*/2 * * * *', $$select public.passe_la_collecte_mtn_sql();$$);

-- ── Contrôle ─────────────────────────────────────────────────────────────
-- Attendu : rls true true ; lecture_direction 1 1 ; ecritures_equipe false
-- false ; ouverte false ; passage 1 ; demandes 0.
select
  (select relrowsecurity from pg_class where oid = 'public.collectes_mtn'::regclass) as rls_registre,
  (select relrowsecurity from pg_class where oid = 'public.collecte_mtn_reglage'::regclass) as rls_reglage,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'collectes_mtn' and cmd = 'SELECT') as lecture_direction_registre,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'collecte_mtn_reglage' and cmd = 'SELECT') as lecture_direction_reglage,
  has_table_privilege('authenticated', 'public.collectes_mtn', 'INSERT') as ecritures_equipe_registre,
  has_table_privilege('authenticated', 'public.collecte_mtn_reglage', 'UPDATE') as ecritures_equipe_reglage,
  (select ouverte from public.collecte_mtn_reglage where id = 1) as ouverte,
  (select count(*) from cron.job where jobname = 'collecte-par-mtn') as passage,
  (select count(*) from public.collectes_mtn) as demandes;
