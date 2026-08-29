-- ═══════════════════════════════════════════════════════════════════
-- 0076 — MA COURONNE VOIT ENFIN LES FORMULES.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- « Dans Ma Couronne toujours rien n'apparaît » (Yéman, 29 août).
--
-- LA CAUSE N'ÉTAIT DANS AUCUN ÉCRAN. `plans` et `subscribers` sont rangées
-- depuis 0006 parmi les tables RÉSERVÉES AU PERSONNEL. Une cliente connectée
-- à Ma Couronne ne peut donc lire NI les formules de la Maison, NI son propre
-- abonnement : la RLS lui rend une liste vide, et l'application affiche
-- honnêtement ce qu'elle reçoit, c'est-à-dire rien.
--
-- L'onglet « Ma formule » n'a JAMAIS rien montré à personne. La carte du
-- comptoir (`carte.html`), qui lit sans compte, était vide pour la même
-- raison. Les corrections d'hier — les orphelines sans moment du parcours, le
-- masque de la vitrine — étaient de vrais défauts, mais aucun n'était celui-ci.
--
-- TROIS TABLES, TROIS RÉGIMES DIFFÉRENTS, et la différence est le sujet :
--
--   ① `plans` — L'OFFRE PUBLIQUE. Une formule ne porte le nom de personne :
--      un nom, une promesse, un prix, des avantages. C'est exactement ce
--      qu'on affiche déjà sur le comptoir et dans la vitrine. Même régime que
--      `catalog_services` : tout le monde lit, seul le personnel écrit.
--
--   ② `subscribers` — L'ARGENT ET LES TÊTES. Y vivent le prix convenu, son
--      motif, les règlements, l'échéancier. Lecture réservée à CE QUI EST À
--      ELLE (`est_ma_tete`), et LECTURE SEULE : une cliente qui pourrait
--      écrire dans cette table s'offrirait l'abonnement de son choix.
--
--   ③ `demandes_formule` — elle pouvait déposer sa demande sans jamais la
--      RELIRE : aucune politique de lecture ne la lui rendait. Elle cliquait,
--      l'écran ne changeait pas, elle recliquait.
--
-- ⚠ CE QUE CELA REND VISIBLE. Le masque de la vitrine (`hiddenPlans`) est un
--   choix D'AFFICHAGE, pas un secret : une formule masquée reste lisible par
--   l'API, comme l'est déjà une prestation masquée. Ne mettez donc jamais dans
--   une formule ce que vous ne diriez pas au comptoir.
--   Et le MOTIF d'un prix convenu devient lisible par la tête concernée :
--   écrivez-le comme une phrase qu'elle peut lire.
-- ═══════════════════════════════════════════════════════════════════

-- ── ⓪ « MA TÊTE » RECONNAÎT LA FICHE ADOPTÉE ──────────────────────
--    `est_ma_tete` ne comparait qu'à l'identifiant de la fiche. Depuis
--    l'adoption (0045), une cliente reconnue GARDE l'identifiant de son
--    ancienne fiche et son compte s'inscrit dans `authUserId` : elle n'était
--    donc plus « sa propre tête » aux yeux de la base. Ses rendez-vous et ses
--    pièces lui échappaient déjà en silence ; son abonnement aurait suivi.
create or replace function public.est_ma_tete(cible text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- moi-même, par l'identifiant de ma fiche
    cible = (auth.uid())::text
    -- ou par mon COMPTE, quand ma fiche a été adoptée (0045)
    or exists (
      select 1 from public.clients moi
      where moi.id = cible
        and moi.data->>'authUserId' = (auth.uid())::text
    )
    -- ou un mineur de la famille dont je suis le parent payeur
    or exists (
      select 1
      from public.clients enfant
      join public.families f
        on f.id = enfant.data->>'familyId'
      where enfant.id = cible
        and (
          f.data->>'payerClientId' = (auth.uid())::text
          or exists (
            select 1 from public.clients parent
            where parent.id = f.data->>'payerClientId'
              and parent.data->>'authUserId' = (auth.uid())::text
          )
        )
        -- `nullif` AVANT le cast : une date vide ('') ferait échouer la
        -- conversion, et une erreur DANS UNE POLITIQUE bloque la lecture de
        -- toute la table — pour tout le monde, d'un coup.
        and nullif(enfant.data->>'birthday', '') is not null
        and (nullif(enfant.data->>'birthday', ''))::date > (current_date - interval '18 years')
        and coalesce((enfant.data->>'archived')::boolean, false) = false
    );
$$;

revoke all on function public.est_ma_tete(text) from public;
grant execute on function public.est_ma_tete(text) to authenticated;

-- ── ① `plans` — L'OFFRE PUBLIQUE ──────────────────────────────────
alter table public.plans enable row level security;
drop policy if exists staff_all on public.plans;
drop policy if exists dev_all on public.plans;
drop policy if exists pub_read on public.plans;
drop policy if exists staff_write on public.plans;

-- Tout le monde lit — y compris la carte du comptoir, qui n'a aucun compte.
create policy pub_read on public.plans
  for select to anon, authenticated using (true);
-- Seul le personnel écrit.
create policy staff_write on public.plans
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── ② `subscribers` — SON ABONNEMENT, EN LECTURE SEULE ────────────
alter table public.subscribers enable row level security;
drop policy if exists staff_all on public.subscribers;
drop policy if exists dev_all on public.subscribers;
drop policy if exists abo_sel on public.subscribers;
drop policy if exists abo_staff on public.subscribers;

-- Elle LIT ce qui est à elle (et aux têtes qu'elle porte). Rien de plus.
create policy abo_sel on public.subscribers
  for select to authenticated
  using (public.is_staff() or public.est_ma_tete(coalesce(data->>'clientId', '')));
-- L'écriture reste ENTIÈREMENT au personnel : signer, encaisser, résilier
-- sont des gestes du comptoir. Sans cette borne, une cliente s'offrirait
-- l'abonnement de son choix, au prix de son choix.
create policy abo_staff on public.subscribers
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ── ③ `demandes_formule` — ELLE RELIT SA PROPRE DEMANDE ───────────
alter table public.demandes_formule enable row level security;
drop policy if exists df_sel on public.demandes_formule;

create policy df_sel on public.demandes_formule
  for select to authenticated
  using (public.is_staff() or public.est_ma_tete(coalesce(data->>'clientId', '')));
-- `df_submit` (dépôt) et `df_staff` (tout au personnel) restent tels quels :
-- elle dépose et relit, la Maison seule tranche.

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
select tablename, policyname, cmd, roles
  from pg_policies
 where schemaname = 'public'
   and tablename in ('plans', 'subscribers', 'demandes_formule')
 order by tablename, policyname;

-- ═══════════════════════════════════════════════════════════════════
-- APRÈS AVOIR PASSÉ CECI : rechargez Ma Couronne. Les formules doivent
-- paraître dans « Nos abonnements » et dans « Ma formule », et la carte du
-- comptoir doit les afficher elle aussi.
-- ═══════════════════════════════════════════════════════════════════
