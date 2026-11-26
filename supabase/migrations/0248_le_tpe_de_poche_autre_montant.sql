-- ═══════════════════════════════════════════════════════════════════
-- 0248 — LE TPE DE POCHE, LOT 2b : « AUTRE MONTANT » (26 novembre 2026)
--
-- « Construis le lot 2b » (Yéman). La maquette RsVNQvgB… : « Autre montant
-- sert à un produit de la Gamme ou à un acompte, avec un motif », pour une
-- cliente de passage.
--
-- Le téléphone PRÉPARE un autre montant (`tpe_autres`, « en-cours ») sous les
-- plafonds du TPE, puis la cliente paie dans la fenêtre KkiaPay (mobile money
-- ou carte), avec l'identifiant de cette ligne pour référence. Payé, KkiaPay
-- le confirme à la fonction, qui inscrit la transaction au registre
-- `payments` (comme kkiapay-tpe) : RIEN sur une pièce, un rendez-vous ou une
-- caisse. Au comptoir, la direction encaisse la vente (la Gamme) ou
-- l'acompte, et choisit ce paiement dans « C'est son paiement ».
--
-- SEULE LA FONCTION `tpe-de-poche` ÉCRIT (clé de service) ; la direction lit.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.tpe_autres (
  id text primary key,                         -- 'tpa-<instant>-<hasard>', la référence donnée à KkiaPay
  branch_id text not null,
  membre_id text not null,
  nom text not null,                           -- l'employée
  montant_xof integer not null check (montant_xof > 0),
  motif text not null check (motif in ('gamme', 'acompte', 'autre')),
  precision text,                              -- ce qu'elle a vendu, ou pour qui (court)
  cree_le timestamptz not null default now(),
  statut text not null default 'en-cours' check (statut in ('en-cours', 'payee', 'abandonnee')),
  transaction_id text,                         -- la transaction KkiaPay, une fois confirmée
  paye_le timestamptz,
  frais_xof integer
);

create unique index if not exists tpe_autres_une_transaction
  on public.tpe_autres (transaction_id) where transaction_id is not null;
create index if not exists tpe_autres_du_jour
  on public.tpe_autres (branch_id, cree_le);

alter table public.tpe_autres enable row level security;

drop policy if exists direction_lit on public.tpe_autres;
create policy direction_lit on public.tpe_autres for select to authenticated
  using (public.est_direction());

select 'tpe_autres prête' as etat;
