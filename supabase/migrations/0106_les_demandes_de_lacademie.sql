-- ═══════════════════════════════════════════════════════════════════
-- 0106 — LES DEMANDES DE L'ACADÉMIE · 17 septembre 2026
--
-- « Il nous faut absolument un site pour informer le monde entier que nous
-- faisons des formations à MND Académie, et il faut réserver massivement » ;
-- « brancher un paiement avec KkiaPay aussi quand le client choisit de
-- réserver un parcours à MND Académie » (Yéman). Maquette
-- `public/maquette-lacademie-au-monde.html`, validée.
--
-- UNE SEULE TABLE, ET C'EST LA FILE. Le site public y dépose une demande
-- sans compte ; le Suivi de l'Académie la lit, rappelle, et en fait une
-- candidature. Le modèle est celui de `consultations_queue` (0006), éprouvé
-- depuis des mois : dépôt ouvert, lecture réservée.
--
-- L'ACOMPTE ATTENDU EST ÉCRIT À LA CRÉATION, AVANT TOUT PAIEMENT
-- (`data->>'acompteXof'`). C'est LUI que `kkiapay-verify` relit pour contrôler
-- ce qui a été payé : le montant attendu vient du serveur, jamais du corps de
-- la requête. Sans cette règle, une inscription à 450 000 F se validerait avec
-- un paiement de 100 F — la faute exacte corrigée le 24 août sur les
-- rendez-vous.
--
-- CE QUI EST PERSONNEL : un nom, un téléphone, une ville. Rien de plus n'est
-- demandé, et rien n'est public : seul le personnel lit cette table. Le dépôt,
-- lui, est ouvert — c'est le propre d'un formulaire public.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.academie_demandes (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.academie_demandes enable row level security;

create index if not exists academie_demandes_parcours on public.academie_demandes ((data->>'parcoursId'));

-- ── LE DÉPÔT EST OUVERT, LA LECTURE NE L'EST PAS ────────────────────
-- Un visiteur dépose sa demande et ne peut RIEN relire : ni la sienne, ni
-- celle d'une autre. Une file publique qu'on peut lire est un fichier de
-- prospects offert au premier venu.
drop policy if exists dev_all on public.academie_demandes;
drop policy if exists acad_dem_depot on public.academie_demandes;
drop policy if exists acad_dem_maison on public.academie_demandes;

create policy acad_dem_depot on public.academie_demandes for insert to anon, authenticated
  with check (true);

create policy acad_dem_maison on public.academie_demandes for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- Le mouchard d'horodatage, comme les autres tables (0001).
drop trigger if exists academie_demandes_touch on public.academie_demandes;
create trigger academie_demandes_touch before update on public.academie_demandes
  for each row execute function public.touch_updated_at();

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select tablename as table_creee
from pg_tables where schemaname = 'public' and tablename = 'academie_demandes';

select policyname as politique, cmd as commande, roles
from pg_policies
where schemaname = 'public' and tablename = 'academie_demandes'
order by policyname;
