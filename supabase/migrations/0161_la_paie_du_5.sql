-- ═══════════════════════════════════════════════════════════════════════════
-- 0161 · LA PAIE DU 5, LOT 1 · 5 novembre 2026
--
-- « Comment je peux automatiser les paiements tous les 5 du mois ? » (Yéman,
-- 5 novembre 2026). Maquette VomoheW35Pi3E5CnhfjTvq validée, puis
-- « construis la paie ». Le 1er, chaque bulletin est déposé dans Mon espace ;
-- chacun le confirme ou signale une erreur jusqu'au 5 à 12 h ; Yéman ou Brice
-- valide ; la paie part le 5 à 18 h (un 5 dimanche passe au lundi 6).
--
-- CE QUE CE SCRIPT FAIT, ET RIEN D'AUTRE :
--
--   ① LE NUMÉRO MOBILE MONEY EST PRIVÉ. La fiche porte désormais
--      `mobileMoney` (numéro, opérateur MTN ou Moov, date du dernier
--      changement, revalidation). Il rejoint les champs du dossier
--      (`champs_du_dossier()`, 0130) : il vit dans `team_dossiers`, que le
--      souverain lit et que chacune lit pour elle seule. La liste est la même
--      que CHAMPS_DU_DOSSIER (src/apps/trone/routes/equipe/data.ts) : le banc
--      verifie-la-direction-des-rh les compare.
--
--   ② LES RÉPONSES AUX BULLETINS. La table `paie_confirmations` : une ligne
--      par bulletin (même identifiant que lui, `<run>:<fiche>`), écrite par
--      la personne depuis Mon espace (« Je confirme mon bulletin », « Je
--      signale une erreur » avec un mot). Elle lit et écrit LA SIENNE
--      (`est_ma_fiche`, 0090) ; le souverain lit tout et seul efface. Les
--      runs de paie restent au souverain (0013) : une réponse ne touche ni un
--      montant, ni une validation.
--
-- Aucune donnée ne bouge : aucune ligne existante n'est réécrite, donc aucune
-- table `repli_`. Le Trône range `mobileMoney` dans le dossier dès son
-- écriture (la façade `staffStore`) ; la garde de `team` (0130) l'y
-- range aussi si un écran l'envoyait par la fiche publique.
--
-- Rejouable : `create or replace`, `if not exists`, `drop … if exists`.
-- Dépend de 0013 (`touch_updated_at`), 0090 (`est_ma_fiche`), 0130
-- (`team_dossiers`, `team_garde_la_paie`). Aucun paiement, aucun envoi.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── ① LES CHAMPS PRIVÉS D'UNE FICHE, `mobileMoney` compris ─────────────
create or replace function public.champs_du_dossier() returns text[]
language sql immutable as $$
  select array[
    'salaireXof', 'commPrestaXof', 'commProduitXof', 'primeXof',
    'cnssNum', 'ifu', 'contractType', 'paiement',
    'commissionPct', 'commissionTauxPct', 'commissionne', 'grille',
    'retenuesCompteCourant', 'evaluations',
    'satisfaction', 'wellbeing', 'charge', 'risk', 'riskDrivers', 'nextStep', 'recognition',
    'finContrat', 'finEssai', 'aptitude', 'urgence', 'integration', 'depart',
    'mobileMoney'
  ]::text[]
$$;


-- ── ② LES RÉPONSES AUX BULLETINS ──────────────────────────────────────
create table if not exists public.paie_confirmations (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
drop trigger if exists paie_confirmations_touch on public.paie_confirmations;
create trigger paie_confirmations_touch before update on public.paie_confirmations
  for each row execute function public.touch_updated_at();

alter table public.paie_confirmations enable row level security;

-- Ce qu'une réponse a le droit de dire : sa fiche, son bulletin (l'identifiant
-- `<run>:<fiche>` du bulletin), confirmé ou erreur, un mot court.
create or replace function public.reponse_de_paie_valable(p_id text, p_data jsonb) returns boolean
language sql immutable as $$
  select coalesce(p_data ->> 'etat', '') in ('confirme', 'erreur')
     and p_id = coalesce(p_data ->> 'runId', '') || ':' || coalesce(p_data ->> 'employeeId', '')
     and length(coalesce(p_data ->> 'mot', '')) <= 500
$$;

drop policy if exists paie_confirmations_lire on public.paie_confirmations;
create policy paie_confirmations_lire on public.paie_confirmations for select to authenticated
  using (public.is_souverain() or public.est_ma_fiche(data ->> 'employeeId'));
drop policy if exists paie_confirmations_repondre on public.paie_confirmations;
create policy paie_confirmations_repondre on public.paie_confirmations for insert to authenticated
  with check (public.is_souverain()
    or (public.est_ma_fiche(data ->> 'employeeId') and public.reponse_de_paie_valable(id, data)));
drop policy if exists paie_confirmations_modifier on public.paie_confirmations;
create policy paie_confirmations_modifier on public.paie_confirmations for update to authenticated
  using (public.is_souverain() or public.est_ma_fiche(data ->> 'employeeId'))
  with check (public.is_souverain()
    or (public.est_ma_fiche(data ->> 'employeeId') and public.reponse_de_paie_valable(id, data)));
drop policy if exists paie_confirmations_retirer on public.paie_confirmations;
create policy paie_confirmations_retirer on public.paie_confirmations for delete to authenticated
  using (public.is_souverain());

do $$
begin
  begin
    alter publication supabase_realtime add table public.paie_confirmations;
  exception when duplicate_object then null;
  end;
end $$;


-- ── LE CONTRÔLE ────────────────────────────────────────────────────────
-- Attendu : mobileMoney privé true ; fiches publiques avec un numéro 0 ;
-- réponses protégées, 4 règles ; direct 1.
select
  'mobileMoney' = any(public.champs_du_dossier()) as numero_prive,
  (select count(*) from public.team t where t.data ? 'mobileMoney') as fiches_publiques_avec_numero,
  (select case when c.relrowsecurity then 'protégée' else 'OUVERTE' end from pg_class c
     where c.relname = 'paie_confirmations' and c.relnamespace = 'public'::regnamespace) as reponses,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'paie_confirmations') as regles_reponses,
  (select count(*) from pg_publication_tables r where r.pubname = 'supabase_realtime'
     and r.tablename = 'paie_confirmations') as direct;


-- ── RETOUR EN ARRIÈRE ──────────────────────────────────────────────────
-- La liste des champs privés reprend celle de 0130 (sans 'mobileMoney') ;
-- la table des réponses part.
-- create or replace function public.champs_du_dossier() … (la liste de 0130)
-- drop table if exists public.paie_confirmations;
-- drop function if exists public.reponse_de_paie_valable(text, jsonb);
