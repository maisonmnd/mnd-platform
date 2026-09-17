-- ═══════════════════════════════════════════════════════════════════
-- 0108 — LES DEMANDES DU SITE · 17 septembre 2026
--
-- « On choisit nos couleurs de la charte : cuivre. Construis » (Yéman) : le
-- site révélateur se construit. Sa porte d'entrée est une DEMANDE sans compte,
-- prospect ou rendez-vous, et la relecture de l'audit a fixé la règle : plus
-- aucun dépôt anonyme direct. La ligne est écrite par la fonction Edge
-- `demande-submit` avec le service role, après la limite de débit de 0007,
-- la normalisation du téléphone et le refus des doublons ; le navigateur n'a
-- AUCUNE politique sur cette table, ni lecture ni écriture. Le personnel la
-- lit et la fait vivre depuis l'écran « Les demandes » du Trône.
--
-- UNE SEULE TABLE À GENRE (prospect, rdv), pas une par formulaire : le
-- Trône en fait des fiches clientes au segment Prospect, avec leur
-- provenance (page, campagne, consentement), et il n'y a qu'une vérité.
--
-- CE QUI EST PERSONNEL : un prénom, un téléphone, parfois un e-mail et un
-- mot. Lecture réservée au personnel, comme `academie_demandes`.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.demandes (
  id         text primary key,
  genre      text not null check (genre in ('prospect', 'rdv')),
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.demandes enable row level security;

create index if not exists demandes_genre on public.demandes (genre);
create index if not exists demandes_telephone on public.demandes ((data->>'telephone'));
create index if not exists demandes_statut on public.demandes ((data->>'statut'));

drop policy if exists dev_all on public.demandes;
drop policy if exists demandes_maison on public.demandes;

-- Le personnel seul : lire, rappeler, convertir, écarter.
create policy demandes_maison on public.demandes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- Aucune politique pour anon, et c'est le point : le dépôt passe par la
-- fonction Edge (service role), jamais par la clé publique du bundle.

drop trigger if exists demandes_touch on public.demandes;
create trigger demandes_touch before update on public.demandes
  for each row execute function public.touch_updated_at();

-- ── LES AVIS GOOGLE, TELS QUELS ─────────────────────────────────────
-- « Insérer les avis Google » (Yéman). Le site ne les invente pas et ne les
-- demande pas à Google depuis le navigateur (la clé serait publique) : la
-- fonction Edge `avis-google` les relit chez Google et les pose dans le
-- document `mnd_avis_google`, que le site lit sans compte. La liste blanche
-- de 0042 gagne cette seule clé. (Elle porte toujours `mnd_settings`, et ses
-- empreintes de codes d'écran : à scinder dans un chantier à part, voir
-- REPRENDRE, avant toute autre ouverture.)
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
    -- 0108 :
    'mnd_avis_google'
  ]));

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select policyname as politique, cmd as commande, roles
from pg_policies
where schemaname = 'public' and tablename = 'demandes'
order by policyname;

select
  p.polname as policy_ok,
  pg_get_expr(p.polqual, p.polrelid) like '%mnd_avis_google%' as avis_google_lisibles
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname = 'documents' and p.polname = 'docs_pub_read';
