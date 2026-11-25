-- ═══════════════════════════════════════════════════════════════════
-- 0246 — LE TPE DE POCHE (25 novembre 2026)
--
-- « Create a terminal of payment for the Trône, a TPE, and I can give the
-- access to certain employees to activate it on their phone and collect
-- payment from customers » (Yéman). Maquette RsVNQvgB85ZvDVjaKuMrqP, puis
-- « Construire le lot 1 maintenant » au sélecteur.
--
-- Une ligne par membre de l'équipe et par branche. La direction l'autorise
-- (« Peut encaisser »), un téléphone s'y lie par un code d'activation valable
-- dix minutes, « Couper » l'arrête. Aucun jeton n'est gardé en clair : leur
-- empreinte SHA-256 seulement (`appareil_empreinte`, `activation_empreinte`).
--
-- SEULE LA FONCTION `tpe-de-poche` ÉCRIT (clé de service) : aucune politique
-- d'écriture n'est posée, la table refuse donc toute écriture d'un compte.
-- La direction la lit (`est_direction`, 0089) pour l'écran du Trône.
-- L'argent ne passe jamais par ici : le téléphone ouvre la page « Régler »
-- du rendez-vous, et `regler-la-seance` / `collecte-mtn` l'inscrivent à la
-- confirmation de KkiaPay ou de MTN, comme avant.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.tpe_de_poche (
  id text primary key,                         -- '<branche>:<membre de l'équipe>'
  branch_id text not null,
  membre_id text not null,
  nom text not null,
  autorise boolean not null default false,
  appareil_empreinte text,                     -- SHA-256 du jeton du téléphone
  appareil_nom text,
  active_le timestamptz,
  coupe_le timestamptz,
  activation_empreinte text,                   -- SHA-256 du code à huit signes
  activation_expire_le timestamptz,
  derniere_vue_le timestamptz,
  modifie_le timestamptz not null default now(),
  modifie_par text
);

create unique index if not exists tpe_de_poche_appareil
  on public.tpe_de_poche (appareil_empreinte) where appareil_empreinte is not null;
create unique index if not exists tpe_de_poche_activation
  on public.tpe_de_poche (activation_empreinte) where activation_empreinte is not null;

alter table public.tpe_de_poche enable row level security;

drop policy if exists direction_lit on public.tpe_de_poche;
create policy direction_lit on public.tpe_de_poche for select to authenticated
  using (public.est_direction());

select 'tpe_de_poche prête' as etat;
