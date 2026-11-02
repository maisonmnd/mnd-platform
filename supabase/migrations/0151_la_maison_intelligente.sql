-- ═══════════════════════════════════════════════════════════════════════════
-- 0151 · LA MAISON INTELLIGENTE, LE SOCLE · 2 novembre 2026
--
-- Maquette CrtJrZzF8E6K39dbPeHwwt (public/maquette-la-maison-intelligente.html),
-- v4, quatre choix tranchés au sélecteur et le « construis » de Yéman.
-- Dix professionnels reliés par le Trône ; ce fichier pose leur socle :
--
--   1. Le REGISTRE des dix : les huit nouveaux entrent dans `assistants`
--      (sans jeton : seuls ceux qui passent par la ligne de commande en
--      reçoivent un). Le mode « Je suis loin » vit dans deux colonnes à part,
--      `loin_depuis` et `loin_par` : un passage réécrit `etat`, jamais elles.
--   2. Les RELAIS : deux genres de plus pour tous, `signal` et `a-faire`.
--   3. Les CARTES : cinq genres de plus (`rdv`, `depense`, `publication`,
--      `planning`, `acces`) ; `faits` (ce que le Trône exécute) ; `prive`
--      (le nom du contact et son message, pour le porteur seul : la RLS de
--      0149 ne laisse lire une carte qu'au porteur), effacé dès la décision
--      par la fonction et au plus tard après sept jours par la tâche de nuit.
--   4. Les BILANS du matin : ce que chaque professionnel dépose avant
--      6 h 45, des compteurs seulement.
--   5. Le CONSEIL DU MATIN : la page que Saphir écrit à 7 h (Cotonou).
--   6. Les tâches : l'effacement du privé (3 h 17 UTC) et Saphir (6 h UTC,
--      7 h à Cotonou), par `appelle_fonction_edge` (0069).
--   7. Ce que Saphir lit des tâches de la nuit (`cron.job_run_details`) : une
--      fonction de la clé service, jamais ouverte au public.
--
-- Les contraintes `check` sur `genre` recopient GENRES_DE_RELAIS et
-- GENRES_DE_DECISION de src/shared/assistants-pur.ts : le banc
-- `verifie-les-assistants` tient les listes ensemble (il lit la DERNIÈRE
-- migration qui les pose).
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. LE REGISTRE DES DIX ────────────────────────────────────────────
alter table public.assistants add column if not exists loin_depuis timestamptz;
alter table public.assistants add column if not exists loin_par    text;

-- Porteurs : Yéman (st-5qduae5jef) et Brice (st-d4t24p6inh). Leur compte
-- (porteur_user_id) se lit sur les lignes d'Opale et d'Onyx (0149 et le jeton
-- donné depuis le compte de Brice) : aucun identifiant de compte écrit ici.
-- Saphir rend compte aux deux : pas de porteur unique. Cristal est à part :
-- sa ligne dit qu'il existe, rien ne passe par lui.
with p as (
  select (select porteur_user_id from public.assistants where id = 'opale') as yeman,
         (select porteur_user_id from public.assistants where id = 'onyx')  as brice
)
insert into public.assistants (id, nom, porteur_team_id, porteur_user_id, appareil)
select v.id, v.nom, v.team, case v.qui when 'yeman' then p.yeman when 'brice' then p.brice end, v.appareil
  from p, (values
    ('saphir',  'Saphir',  null,            null,    'une fonction du Trône, à 7 h'),
    ('perle',   'Perle',   'st-5qduae5jef', 'yeman', 'les fonctions du WhatsApp de la Maison'),
    ('ambre',   'Ambre',   'st-5qduae5jef', 'yeman', 'la machine de la Maison'),
    ('grenat',  'Grenat',  'st-5qduae5jef', 'yeman', 'une fonction du Trône'),
    ('jade',    'Jade',    'st-d4t24p6inh', 'brice', 'une fonction du Trône'),
    ('topaze',  'Topaze',  'st-d4t24p6inh', 'brice', 'une fonction du Trône'),
    ('jaspe',   'Jaspe',   'st-5qduae5jef', 'yeman', 'la machine de la Maison'),
    ('cristal', 'Cristal', 'st-5qduae5jef', 'yeman', 'l''ordinateur de Yéman, à part')
  ) as v(id, nom, team, qui, appareil)
on conflict (id) do nothing;


-- ── 2. LES RELAIS : deux genres pour tous ─────────────────────────────
alter table public.assistants_relais drop constraint if exists assistants_relais_genre;
alter table public.assistants_relais add constraint assistants_relais_genre check (genre in (
  'rdv-pose-pour-toi', 'rdv-deplace', 'rdv-annule',
  'place-tenue', 'place-confirmee', 'place-refusee',
  'fil-ouvert', 'hermine-a-prevenir', 'envie-lue', 'argent-a-trancher', 'assistant-endormi',
  'signal', 'a-faire'));


-- ── 3. LES CARTES DE TOUS LES GENRES ──────────────────────────────────
alter table public.assistants_decisions drop constraint if exists assistants_decisions_genre;
alter table public.assistants_decisions add constraint assistants_decisions_genre check (genre in (
  'reponse', 'place-tenue', 'note', 'argent', 'cercle',
  'rdv', 'depense', 'publication', 'planning', 'acces'));

alter table public.assistants_decisions add column if not exists faits           jsonb;
alter table public.assistants_decisions add column if not exists prive           jsonb;
alter table public.assistants_decisions add column if not exists prive_efface_le timestamptz;

alter table public.assistants_decisions drop constraint if exists assistants_decisions_prive_court;
alter table public.assistants_decisions add constraint assistants_decisions_prive_court check (
  prive is null or (
    jsonb_typeof(prive) = 'object'
    and coalesce(length(prive->>'contact'), 0) <= 60
    and coalesce(length(prive->>'message'), 0) <= 1200));

create index if not exists assistants_decisions_prive_idx on public.assistants_decisions (cree_le) where prive is not null;


-- ── 4. LES BILANS DU MATIN ────────────────────────────────────────────
create table if not exists public.assistants_bilans (
  id         text primary key,             -- « <assistant>:<jour> » : un bilan par jour
  assistant  text not null references public.assistants(id),
  jour       date not null,
  comptes    jsonb not null default '{}'::jsonb,
  mot        text,
  cree_le    timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assistants_bilans_mot_court check (mot is null or length(mot) <= 100)
);
alter table public.assistants_bilans enable row level security;
create index if not exists assistants_bilans_jour_idx on public.assistants_bilans (jour desc);

drop trigger if exists assistants_bilans_touch on public.assistants_bilans;
create trigger assistants_bilans_touch before update on public.assistants_bilans
  for each row execute function public.touch_updated_at();

drop policy if exists assistants_bilans_lire on public.assistants_bilans;
create policy assistants_bilans_lire on public.assistants_bilans for select to authenticated
  using (public.is_souverain());
-- Pas d'écriture par la clé publique : la fonction `assistants-maison` dépose.


-- ── 5. LE CONSEIL DU MATIN ────────────────────────────────────────────
create table if not exists public.conseil_du_matin (
  jour       date primary key,
  page       jsonb not null,
  version    text,
  ecrit_le   timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.conseil_du_matin enable row level security;

drop trigger if exists conseil_du_matin_touch on public.conseil_du_matin;
create trigger conseil_du_matin_touch before update on public.conseil_du_matin
  for each row execute function public.touch_updated_at();

drop policy if exists conseil_du_matin_lire on public.conseil_du_matin;
create policy conseil_du_matin_lire on public.conseil_du_matin for select to authenticated
  using (public.is_souverain());
-- Écrit par la fonction `conseil-du-matin` seule (clé service).


-- ── 6. LES TÂCHES ─────────────────────────────────────────────────────
-- Le privé des cartes, effacé au plus tard sept jours après leur naissance.
create or replace function public.efface_le_prive_des_cartes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.assistants_decisions
     set prive = null, prive_efface_le = now()
   where prive is not null
     and (tranchee is not null or cree_le < now() - interval '7 days');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.efface_le_prive_des_cartes() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job
 where command ilike '%efface_le_prive_des_cartes%' or command ilike '%conseil-du-matin%';

select cron.schedule('efface-le-prive-des-cartes', '17 3 * * *', $$select public.efface_le_prive_des_cartes();$$);
-- 6 h UTC = 7 h à Cotonou : Saphir écrit le Conseil du matin.
select cron.schedule('conseil-du-matin', '0 6 * * *', $$select public.appelle_fonction_edge('conseil-du-matin', '{"source":"cron"}'::jsonb);$$);


-- ── 7. CE QUE SAPHIR LIT DE LA NUIT ───────────────────────────────────
-- Les tâches qui ont échoué depuis `depuis` : leur nom, le nombre d'échecs,
-- le dernier message (court). Clé service seule.
create or replace function public.conseil_taches_en_echec(depuis timestamptz)
returns table (tache text, echecs integer, dernier text, derniere_le timestamptz)
language sql
security definer
set search_path = public, cron
as $$
  select coalesce(j.jobname, 'tâche ' || d.jobid::text) as tache,
         count(*)::integer as echecs,
         left(max(d.return_message), 120) as dernier,
         max(d.start_time) as derniere_le
    from cron.job_run_details d
    left join cron.job j on j.jobid = d.jobid
   where d.start_time >= depuis
     and d.status not in ('succeeded', 'running', 'starting')
   group by 1
   order by 4 desc
   limit 20;
$$;
revoke execute on function public.conseil_taches_en_echec(timestamptz) from public, anon, authenticated;


-- ── Contrôle ──────────────────────────────────────────────────────────
select id, nom, porteur_team_id, loin_depuis from public.assistants order by id;
select jobname, schedule, active from cron.job
 where jobname in ('efface-le-prive-des-cartes', 'conseil-du-matin');
