-- ═══════════════════════════════════════════════════════════════════
-- 0247 — LE TPE DE POCHE, LOT 2 : LES ESPÈCES (26 novembre 2026)
--
-- « Construis le lot 2 de la TPE » (Yéman). Les espèces de la maquette
-- RsVNQvgB… : fermées par défaut, ouvertes par la direction, membre par
-- membre (`tpe_de_poche.especes`).
--
-- L'employée DÉCLARE les billets reçus pour une séance (`tpe_especes`,
-- « à remettre ») : ce n'est pas encore l'argent de la Maison, rien ne
-- s'inscrit sur la pièce. Le soir, la direction les reçoit au Trône et les
-- encaisse par son écran d'encaissement habituel (« reçue »), ou dit
-- « pas reçu » (« refusee »). Une seule déclaration en attente par séance.
--
-- SEULE LA FONCTION `tpe-de-poche` ÉCRIT (clé de service), comme pour la
-- table du lot 1 (0246) : aucune politique d'écriture, la direction lit.
-- ═══════════════════════════════════════════════════════════════════

alter table public.tpe_de_poche add column if not exists especes boolean not null default false;

create table if not exists public.tpe_especes (
  id text primary key,                         -- 'esp-<rendez-vous>-<instant>'
  branch_id text not null,
  membre_id text not null,
  nom text not null,                           -- l'employée, telle que la direction l'a nommée
  rdv_id text not null,
  piece_id text not null,
  montant_xof integer not null check (montant_xof > 0),
  prenom text,                                 -- le prénom d'usage de la cliente, rien d'autre
  prestations text,
  declare_le timestamptz not null default now(),
  statut text not null default 'a-remettre' check (statut in ('a-remettre', 'recue', 'refusee')),
  traite_le timestamptz,
  traite_par text,
  encaissement_id text
);

create unique index if not exists tpe_especes_une_par_seance
  on public.tpe_especes (rdv_id) where statut = 'a-remettre';
create index if not exists tpe_especes_du_jour
  on public.tpe_especes (branch_id, declare_le);

alter table public.tpe_especes enable row level security;

drop policy if exists direction_lit on public.tpe_especes;
create policy direction_lit on public.tpe_especes for select to authenticated
  using (public.est_direction());

select 'tpe_especes prête' as etat,
       (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'tpe_de_poche' and column_name = 'especes') as colonne_especes;
