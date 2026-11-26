-- ═══════════════════════════════════════════════════════════════════
-- 0252 — LA LISTE D'ATTENTE D'UN JOUR PLEIN (26 novembre 2026)
--
-- Audit du Trône, point B3, « Remplir la semaine et les fins d'après-midi »,
-- validé par Yéman (« construis ») : quand un jour est plein, la cliente
-- demande à être prévenue (« Prévenez-moi si une place se libère ce
-- jour-là », sur le site et dans Ma Couronne) ; une place libérée se propose
-- d'abord à la première de la file, par la main de l'équipe (lot 1).
--
-- LA FORME DE LA MAISON : (id, branch_id, data jsonb, updated_at). Ce que
-- porte `data` : le jour attendu, le prénom, le téléphone (E.164), la fiche
-- quand elle vient de Ma Couronne, les gestes voulus, la durée vue, le rang
-- (`creeLe`), l'état (attend, proposee, prise, pas-interessee, sans-reponse)
-- et les gestes de l'équipe. CE QUI EST PERSONNEL : un prénom et un numéro.
--
-- QUI ÉCRIT : la demande d'une cliente passe par la fonction `demande-submit`
-- (`{ prevenir: 'place' }`, service role, après sa limite de débit et la
-- relecture ⟨liste-d-attente⟩) ; AUCUNE politique pour anon, et aucune
-- écriture d'une cliente connectée : le navigateur d'une cliente n'y a aucun
-- droit, ni lecture ni écriture. Le personnel la lit et y note ses gestes
-- (la même règle que `demandes`, 0108 : `is_staff()`), le Trône filtre par
-- branche.
--
-- Rejouable : la table et ses index ne se créent que s'ils manquent ; la
-- règle et le déclencheur se reposent. Rien d'existant n'est touché.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.liste_d_attente (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.liste_d_attente enable row level security;

create index if not exists liste_d_attente_jour on public.liste_d_attente ((data->>'jour'));
create index if not exists liste_d_attente_telephone on public.liste_d_attente ((data->>'telephone'));

drop policy if exists dev_all on public.liste_d_attente;
drop policy if exists liste_d_attente_maison on public.liste_d_attente;

-- Le personnel seul : lire la file, noter « proposée », « prise »,
-- « pas intéressée », « pas de réponse ».
create policy liste_d_attente_maison on public.liste_d_attente for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- Aucune politique pour anon, ni pour une cliente : la demande passe par la
-- fonction Edge (service role), jamais par la clé publique du bundle.

drop trigger if exists liste_d_attente_touch on public.liste_d_attente;
create trigger liste_d_attente_touch before update on public.liste_d_attente
  for each row execute function public.touch_updated_at();

-- ── RELECTURE ──────────────────────────────────────────────────────
select
  (select relrowsecurity from pg_class where oid = 'public.liste_d_attente'::regclass) as rls_allumee,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'liste_d_attente') as politiques,
  (select string_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ','), ' ; ')
     from pg_policies where schemaname = 'public' and tablename = 'liste_d_attente') as detail,
  (select count(*) from public.liste_d_attente) as demandes_en_base;
