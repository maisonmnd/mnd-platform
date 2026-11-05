-- ═══════════════════════════════════════════════════════════════════════════
-- 0162 · UNE CONSIGNE AUX ASSISTANTS, LOT 1 · 5 novembre 2026
--
-- Maquette 2AqfEEiPvpdfUUkXzs2XUC (public/maquette-consigne-aux-assistants.html),
-- validée par Yéman le 5 novembre 2026 (« construis »). La direction écrit ou
-- dicte une consigne à l'assistant de son choix, en haut de Direction › Les
-- assistants ; l'assistant la lit (`consigne.lire` de la fonction
-- `assistants-maison`), fait seul ce qui est sûr dans son domaine, répond au
-- même endroit (`consigne.repondre`) ou la passe à l'assistant concerné
-- (`consigne.passer`). Ce qui touche à un message, à l'argent ou à un
-- effacement revient en carte (`assistants_decisions`), et la direction est
-- prévenue sur son téléphone : seulement là.
--
--   1. `assistants_consignes` : une ligne par consigne. Qui l'a écrite (son
--      nom, figé, et son compte), pour quel assistant, le texte, le statut,
--      la réponse, de quoi défaire (les gestes faits seuls, rendus par la
--      fonction), la carte liée, les heures (écrite, lue, faite, passée,
--      notifiée, défaite). LA DIRECTION SOUVERAINE lit, écrit et retouche
--      (Défaire, depuis l'écran) ; la fonction lit et répond avec la clé
--      service, à la place de l'assistant reconnu par son jeton. Aucune
--      politique d'effacement.
--   2. `assistants.guette_le` : la dernière fois que le guetteur du PC a
--      regardé (toutes les 60 secondes). Colonne à part : un passage réécrit
--      `etat`, jamais elle. L'écran dit « Opale veille, vue à l'instant ».
--
-- PAS DE REALTIME : les tables voisines (`assistants`, `assistants_relais`,
-- `assistants_decisions`) n'en ont pas ; l'écran relit la table.
-- Numérotée 0162 : 0160 est passée (les engagements à la direction), 0161 est
-- tenue par la paie du 5, 0158 par « ce qui va partir ».
-- `touch_updated_at` (0001) et `is_souverain()` (0003) sont passées ; 0149 et
-- 0151 aussi (le registre des dix, les cartes).
-- La contrainte `assistants_consignes_statut` recopie STATUTS_DE_CONSIGNE de
-- src/shared/consignes-pur.ts : le banc `verifie-les-consignes` tient les deux
-- listes ensemble.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. LES CONSIGNES ──────────────────────────────────────────────────
create table if not exists public.assistants_consignes (
  id           text primary key,
  de           text not null,
  de_user_id   uuid not null,
  pour         text not null references public.assistants(id),
  texte        text not null,
  statut       text not null default 'envoyee',
  reponse      text,
  defaire      jsonb,
  decision_id  text references public.assistants_decisions(id) on delete set null,
  ecrite_le    timestamptz not null default now(),
  lue_le       timestamptz,
  faite_le     timestamptz,
  passee_de    text,
  passee_le    timestamptz,
  passee_mot   text,
  notifie_le   timestamptz,
  defaite_le   timestamptz,
  defaite_par  text,
  branch_id    text,
  updated_at   timestamptz not null default now(),
  constraint assistants_consignes_statut check (statut in (
    'envoyee', 'lue', 'faite', 'oui-attendu', 'passee', 'en-attente')),
  constraint assistants_consignes_texte_court check (length(texte) between 1 and 1000),
  constraint assistants_consignes_reponse_courte check (reponse is null or length(reponse) <= 600),
  constraint assistants_consignes_mot_court check (passee_mot is null or length(passee_mot) <= 200),
  constraint assistants_consignes_defaire_liste check (defaire is null or jsonb_typeof(defaire) = 'array')
);
alter table public.assistants_consignes enable row level security;

create index if not exists assistants_consignes_pour_idx on public.assistants_consignes (pour, statut, ecrite_le);
create index if not exists assistants_consignes_ecrite_idx on public.assistants_consignes (ecrite_le desc);

drop trigger if exists assistants_consignes_touch on public.assistants_consignes;
create trigger assistants_consignes_touch before update on public.assistants_consignes
  for each row execute function public.touch_updated_at();

-- La direction souveraine lit tout le fil (Yéman et Brice voient les
-- consignes l'un de l'autre, chacune au nom de qui l'a écrite).
drop policy if exists assistants_consignes_lire on public.assistants_consignes;
create policy assistants_consignes_lire on public.assistants_consignes for select to authenticated
  using (public.is_souverain());

-- Écrire : à son propre nom, une consigne neuve (« envoyée »), rien de ce que
-- seul l'assistant remplit.
drop policy if exists assistants_consignes_ecrire on public.assistants_consignes;
create policy assistants_consignes_ecrire on public.assistants_consignes for insert to authenticated
  with check (
    public.is_souverain()
    and de_user_id = auth.uid()
    and statut = 'envoyee'
    and reponse is null and defaire is null and decision_id is null
    and lue_le is null and faite_le is null and passee_de is null and notifie_le is null and defaite_le is null);

-- Retoucher : Défaire (defaite_le, defaite_par), depuis l'écran.
drop policy if exists assistants_consignes_retoucher on public.assistants_consignes;
create policy assistants_consignes_retoucher on public.assistants_consignes for update to authenticated
  using (public.is_souverain()) with check (public.is_souverain());
-- Pas de politique DELETE : une consigne ne s'efface pas.


-- ── 2. LE GUETTEUR DU PC ──────────────────────────────────────────────
alter table public.assistants add column if not exists guette_le timestamptz;


-- ── LE CONTRÔLE ────────────────────────────────────────────────────────
-- Attendu : protégée · 3 politiques sans DELETE · guette_le présente · 0 consigne au départ.
select n, quoi, etat from (
  select 1 as n, 'assistants_consignes : RLS' as quoi,
         case when (select relrowsecurity from pg_class where oid = 'public.assistants_consignes'::regclass) then 'protégée' else 'OUVERTE' end as etat
  union all
  select 2, 'assistants_consignes : politiques (3 attendues : lire, écrire, retoucher ; jamais DELETE)',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'assistants_consignes')::text
         || case when exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'assistants_consignes' and cmd = 'DELETE') then ' · DELETE OUVERT' else '' end
  union all
  select 3, 'assistants.guette_le',
         case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'assistants' and column_name = 'guette_le')
              then 'présente' else 'ABSENTE' end
  union all
  select 4, 'consignes au départ',
         (select count(*) from public.assistants_consignes)::text
) as controle
order by n;
