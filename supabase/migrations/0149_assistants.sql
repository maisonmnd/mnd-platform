-- ═══════════════════════════════════════════════════════════════════════════
-- 0149 · LES ASSISTANTS RELIÉS, LEURS TABLES · 31 octobre 2026
--
-- Maquette TtHPKpjCqovrn8nookJ7eu (public/maquette-assistants-relies.html),
-- huit choix tranchés au sélecteur. Chaque personne de la direction a SON
-- assistant (Opale pour Yéman, Onyx pour Brice) : une session de Claude Code
-- sur son ordinateur, qui lit le WhatsApp Web de son téléphone. Les assistants
-- ne se parlent jamais entre machines : ils se parlent par le Trône.
--
--   1. `assistants` : le registre. Nom, porteur (team, compte), appareil,
--      EMPREINTE du jeton d'appareil (jamais le jeton), dernier passage,
--      depuis quand la série tient, état (contrôles, empêchement, compteur).
--      Lecture par les souverains ; écriture par la fonction `assistants-maison`
--      seule (clé service).
--   2. `assistants_relais` : ce qu'un assistant dit à l'autre. Un genre fermé,
--      la clé du numéro, la fiche, le rendez-vous, et UN SEUL champ libre de
--      cent caractères que la fonction refuse s'il contient des guillemets, un
--      numéro ou un mot hors des faits de la Maison. Jamais un message privé.
--      Lecture, retouche et effacement par les souverains ; dépôt par la
--      fonction seule.
--   3. `assistants_decisions` : ce qu'un assistant laisse à son porteur
--      (une réponse à envoyer, une place tenue à confirmer, une note, une
--      question d'argent, un cercle). Le porteur seul la lit et la tranche
--      (écran « Les assistants », téléphone ou ordinateur) ; dépôt par la
--      fonction seule.
--   4. `assistants_prises` : les clés d'une pose (une par cliente et par jour,
--      tous assistants confondus ; une par geste, pour qu'un message rejoué ne
--      pose rien deux fois). Service seule : aucune politique.
--
-- Numérotée 0149 : 0148 est prise par « le contenu de la ligne en tableau ».
-- `touch_updated_at` (0001) et `is_souverain()` (0003) sont passées.
-- Les contraintes `check` sur `genre` recopient GENRES_DE_RELAIS et
-- GENRES_DE_DECISION de src/shared/assistants-pur.ts : le banc
-- `verifie-les-assistants` tient les deux listes ensemble.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. LE REGISTRE DES ASSISTANTS ─────────────────────────────────────
create table if not exists public.assistants (
  id              text primary key,
  nom             text not null,
  porteur_team_id text,
  porteur_user_id uuid,
  appareil        text,
  empreinte       text unique,
  jeton_pose_le   timestamptz,
  vu_le           timestamptz,
  eveille_depuis  timestamptz,
  etat            jsonb not null default '{}'::jsonb,
  branch_id       text,
  cree_le         timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.assistants enable row level security;

drop trigger if exists assistants_touch on public.assistants;
create trigger assistants_touch before update on public.assistants
  for each row execute function public.touch_updated_at();

-- Les souverains lisent ; personne n'écrit par la clé publique : la fonction
-- écrit avec la clé service (aucune autre politique, la RLS refuse le reste).
drop policy if exists assistants_lire on public.assistants;
create policy assistants_lire on public.assistants for select to authenticated
  using (public.is_souverain());


-- ── 2. LES RELAIS ENTRE ASSISTANTS ────────────────────────────────────
create table if not exists public.assistants_relais (
  id         text primary key,
  de         text not null references public.assistants(id),
  pour       text not null references public.assistants(id),
  genre      text not null,
  numero_cle text,
  client_id  text,
  rdv_id     text,
  mot        text,
  quand      timestamptz not null default now(),
  perime_le  timestamptz,
  lu_le      timestamptz,
  traite_le  timestamptz,
  branch_id  text,
  updated_at timestamptz not null default now(),
  constraint assistants_relais_pas_a_soi check (de <> pour),
  constraint assistants_relais_mot_court check (mot is null or length(mot) <= 100),
  constraint assistants_relais_genre check (genre in (
    'rdv-pose-pour-toi', 'rdv-deplace', 'rdv-annule',
    'place-tenue', 'place-confirmee', 'place-refusee',
    'fil-ouvert', 'hermine-a-prevenir', 'envie-lue', 'argent-a-trancher', 'assistant-endormi'))
);
alter table public.assistants_relais enable row level security;

create index if not exists assistants_relais_pour_idx on public.assistants_relais (pour, traite_le, quand);
create index if not exists assistants_relais_quand_idx on public.assistants_relais (quand desc);

drop trigger if exists assistants_relais_touch on public.assistants_relais;
create trigger assistants_relais_touch before update on public.assistants_relais
  for each row execute function public.touch_updated_at();

drop policy if exists assistants_relais_lire on public.assistants_relais;
create policy assistants_relais_lire on public.assistants_relais for select to authenticated
  using (public.is_souverain());
drop policy if exists assistants_relais_retoucher on public.assistants_relais;
create policy assistants_relais_retoucher on public.assistants_relais for update to authenticated
  using (public.is_souverain()) with check (public.is_souverain());
drop policy if exists assistants_relais_effacer on public.assistants_relais;
create policy assistants_relais_effacer on public.assistants_relais for delete to authenticated
  using (public.is_souverain());
-- Pas de politique INSERT : le dépôt est à la fonction seule.


-- ── 3. LES DÉCISIONS LAISSÉES AU PORTEUR ──────────────────────────────
create table if not exists public.assistants_decisions (
  id             text primary key,
  assistant      text not null references public.assistants(id),
  genre          text not null,
  numero_cle     text,
  client_id      text,
  rdv_id         text,
  resume         text not null,
  proposition    text,
  choix          jsonb not null default '[]'::jsonb,
  echeance       timestamptz,
  tranchee       text,
  tranchee_le    timestamptz,
  tranchee_par   text,
  texte_modifie  text,
  executee_le    timestamptz,
  branch_id      text,
  cree_le        timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint assistants_decisions_resume_court check (length(resume) <= 160),
  constraint assistants_decisions_genre check (genre in ('reponse', 'place-tenue', 'note', 'argent', 'cercle'))
);
alter table public.assistants_decisions enable row level security;

create index if not exists assistants_decisions_assistant_idx on public.assistants_decisions (assistant, tranchee, cree_le);
create index if not exists assistants_decisions_rdv_idx on public.assistants_decisions (rdv_id);

drop trigger if exists assistants_decisions_touch on public.assistants_decisions;
create trigger assistants_decisions_touch before update on public.assistants_decisions
  for each row execute function public.touch_updated_at();

-- Le porteur seul : celui dont le compte porte l'assistant qui a laissé la
-- décision. L'autre souverain ne la voit pas (c'est un fil privé qui attend).
drop policy if exists assistants_decisions_lire on public.assistants_decisions;
create policy assistants_decisions_lire on public.assistants_decisions for select to authenticated
  using (exists (select 1 from public.assistants a where a.id = assistant and a.porteur_user_id = auth.uid()));
drop policy if exists assistants_decisions_trancher on public.assistants_decisions;
create policy assistants_decisions_trancher on public.assistants_decisions for update to authenticated
  using (exists (select 1 from public.assistants a where a.id = assistant and a.porteur_user_id = auth.uid()))
  with check (exists (select 1 from public.assistants a where a.id = assistant and a.porteur_user_id = auth.uid()));
-- Pas de politique INSERT ni DELETE : le dépôt est à la fonction seule.


-- ── 4. LES PRISES (service seule) ─────────────────────────────────────
create table if not exists public.assistants_prises (
  cle       text primary key,
  assistant text not null,
  rdv_id    text,
  quand     timestamptz not null default now()
);
alter table public.assistants_prises enable row level security;
create index if not exists assistants_prises_quand_idx on public.assistants_prises (quand);
-- Aucune politique : la clé publique ne lit ni n'écrit ; la fonction seule.


-- ── 5. L'AMORCE : OPALE ET ONYX ───────────────────────────────────────
-- Opale porte déjà son empreinte (le jeton vit dans reglages.json de son
-- dossier, nulle part ailleurs : une empreinte ne se remonte pas). Onyx naît
-- sans jeton : Brice le reçoit depuis l'écran « Les assistants », sur son
-- poste, après son oui. La branche : la vedette, sinon la seule active.
insert into public.assistants (id, nom, porteur_team_id, porteur_user_id, appareil, empreinte, jeton_pose_le, branch_id)
values
  ('opale', 'Opale', 'st-5qduae5jef', 'a3b6398c-f657-4f40-ba97-0c203ff12c5f', 'l''ordinateur de Yéman',
   'ea99abc29efac82eaa16c7179449dc50454af41331a06299403f395207b06b47', now(),
   coalesce((select b.id from public.branches b where b.data->>'flagship' = 'true' order by b.id limit 1),
            (select b.id from public.branches b where coalesce(b.data->>'status', 'active') = 'active' order by b.id limit 1))),
  ('onyx', 'Onyx', 'st-d4t24p6inh', null, 'le Mac de Brice', null, null,
   coalesce((select b.id from public.branches b where b.data->>'flagship' = 'true' order by b.id limit 1),
            (select b.id from public.branches b where coalesce(b.data->>'status', 'active') = 'active' order by b.id limit 1)))
on conflict (id) do nothing;


-- ── LE CONTRÔLE ────────────────────────────────────────────────────────
-- Attendu : quatre tables « protégée », 1 · 3 · 2 · 0 politiques, deux assistants, Opale avec son empreinte.
select n, quoi, etat from (
  select 1 as n, 'assistants : RLS' as quoi,
         case when (select relrowsecurity from pg_class where oid = 'public.assistants'::regclass) then 'protégée' else 'OUVERTE' end as etat
  union all
  select 2, 'assistants : politiques (1 attendue, lecture souveraine)',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'assistants')::text
  union all
  select 3, 'assistants_relais : RLS',
         case when (select relrowsecurity from pg_class where oid = 'public.assistants_relais'::regclass) then 'protégée' else 'OUVERTE' end
  union all
  select 4, 'assistants_relais : politiques (3 attendues, jamais insert)',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'assistants_relais')::text
         || case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'assistants_relais' and cmd = 'INSERT') then ' · INSERT OUVERT' else '' end
  union all
  select 5, 'assistants_decisions : RLS',
         case when (select relrowsecurity from pg_class where oid = 'public.assistants_decisions'::regclass) then 'protégée' else 'OUVERTE' end
  union all
  select 6, 'assistants_decisions : politiques (2 attendues, porteur seul)',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'assistants_decisions')::text
  union all
  select 7, 'assistants_prises : RLS sans politique',
         case when (select relrowsecurity from pg_class where oid = 'public.assistants_prises'::regclass)
                   and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'assistants_prises') = 0
              then 'protégée' else 'OUVERTE' end
  union all
  select 8, 'assistants amorcés',
         (select count(*) from public.assistants where id in ('opale', 'onyx'))::text || ' sur 2'
  union all
  select 9, 'Opale reliée (empreinte), Onyx sans jeton',
         case when exists (select 1 from public.assistants where id = 'opale' and empreinte is not null)
                   and exists (select 1 from public.assistants where id = 'onyx' and empreinte is null)
              then 'oui' else 'NON' end
  union all
  select 10, 'branche des assistants',
         coalesce((select a.branch_id from public.assistants a where a.id = 'opale'), 'AUCUNE')
) as controle
order by n;
