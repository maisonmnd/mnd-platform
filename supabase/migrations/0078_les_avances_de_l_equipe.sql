-- ═══════════════════════════════════════════════════════════════════
-- 0078 — LES AVANCES DE L'ÉQUIPE.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- « J'ai un staff qui préfinance des dépenses personnelles pour moi et je le
-- règle à la fin du mois. Aujourd'hui il enregistre les dépenses sur des bouts
-- de papier et parfois il oublie les dates et invente des choses. » (Yéman,
-- 31 août 2026)
--
-- Les DÉPENSES avancées vivent déjà dans `expenses` : un simple drapeau
-- `avancee` dans leur `data` suffit, aucune table à créer pour elles. Ce qui
-- manquait, c'est le REMBOURSEMENT — le jour où la Maison rend l'argent, et où
-- un tiroir se vide vraiment.
--
-- POURQUOI UNE TABLE À PART. On aurait pu inscrire le remboursement comme une
-- dépense de plus : ce serait compter la charge deux fois, une fois à l'achat
-- et une fois au remboursement. Le résultat du mois s'en trouverait faux. Un
-- remboursement n'est pas une charge, c'est une dette qui s'éteint.
--
-- RÉSERVÉE AU PERSONNEL. Elle porte des noms de l'équipe et des montants dus ;
-- aucune cliente n'a à la lire. Même régime que `expenses`.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.avances_remboursements (
  id         text primary key,
  branch_id  text,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists avances_remboursements_branche
  on public.avances_remboursements (branch_id);

alter table public.avances_remboursements enable row level security;

drop policy if exists dev_all on public.avances_remboursements;
drop policy if exists staff_all on public.avances_remboursements;

-- Le personnel écrit et lit ; personne d'autre n'entre.
create policy staff_all on public.avances_remboursements
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'avances_remboursements') as table_creee,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'avances_remboursements')    as regles_posees;

-- ═══════════════════════════════════════════════════════════════════
-- Attendu : table_creee = 1, regles_posees = 1.
-- ═══════════════════════════════════════════════════════════════════
