-- ═══════════════════════════════════════════════════════════════════
-- 0042 — LES CRÉNEAUX BLOQUÉS + LES EXCEPTIONS LISIBLES PAR LA RÉSERVATION
--        (0037 reste RÉSERVÉ au réarmement de clients_protege_tarif)
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Le calendrier de réservation ne savait s'interdire que ce que la semaine
-- type lui disait. Deux murs lui manquaient :
--
--   ① la table `blocages` — « pause de 12 h à 14 h », « ce maître est absent
--     jeudi » : des plages et des personnes, ce que ni la semaine type ni les
--     exceptions d'horaires ne savent dire ;
--   ② la lecture des EXCEPTIONS D'HORAIRES par les clientes — la fermeture
--     exceptionnelle saisie pour la paie doit AUSSI fermer la réservation en
--     ligne, sinon la maison a deux vérités. Le document existait, mais la
--     liste blanche `docs_pub_read` (0029) ne le laissait pas lire.
--
-- ⚠ À PASSER AVANT LA PROCHAINE PUBLICATION : les deux apps se lient à la
--   table `blocages` — sans elle, la pastille de synchro vire au rouge.
-- ═══════════════════════════════════════════════════════════════════

-- ① LA TABLE DES BLOCAGES ─────────────────────────────────────────────

create table if not exists public.blocages (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.blocages enable row level security;

drop policy if exists staff_all on public.blocages;
drop policy if exists pub_sel   on public.blocages;

-- Le personnel écrit ; TOUTE personne connectée lit. C'est voulu : la
-- réservation calcule ses créneaux côté cliente, et un mur invisible est un
-- mur qu'on propose de traverser. Le motif est rédigé pour être lu — jamais
-- de détail privé dedans (règle du registre, shared/blocages.ts).
create policy staff_all on public.blocages for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy pub_sel on public.blocages for select to anon, authenticated
  using (true);

create index if not exists blocages_date_idx on public.blocages ((data->>'date'));

-- Realtime — la leçon de 0034 : une table hors publication rend l'inter-postes
-- muet. On l'ajoute d'emblée, idempotent.
do $$
begin
  alter publication supabase_realtime add table public.blocages;
exception
  when duplicate_object then null;
end $$;

-- ② LES EXCEPTIONS D'HORAIRES ENTRENT DANS LA LISTE BLANCHE ──────────
-- Même geste que 0029 : on remplace la politique entière, avec UNE clé de
-- plus. Conséquence assumée : les clientes peuvent lire les exceptions —
-- dates, heures et notes. N'y écrire que ce qui peut se dire à une cliente
-- (« Fermeture exceptionnelle », pas les affaires de la maison).

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
    'mnd_horaires_exceptions'
  ]));

-- Contrôle : la table existe (zéro ligne — les blocages naîtront des gestes),
-- et la liste blanche compte bien ses douze clés.
select
  'blocages' as table_creee,
  (select count(*) from public.blocages) as lignes,
  (select cardinality(string_to_array(pg_get_expr(polqual, polrelid), ','))
     from pg_policy where polname = 'docs_pub_read') as cles_liste_blanche;
