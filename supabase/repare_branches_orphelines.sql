-- ═══════════════════════════════════════════════════════════════════
-- RÉPARATION — les fiches nées sur une branche FANTÔME (10 août 2026)
--         Supabase → SQL Editor. Relançable : ne touche que les orphelines.
--
-- L'inscription Ma Couronne d'un téléphone pas encore hydraté rangeait la
-- fiche (et ses déclarations d'enfants) sur la branche PAR DÉFAUT DU CODE —
-- pas sur la vraie. Le Trône filtre par la vraie : la cliente et sa demande
-- d'enfant étaient en base, mais invisibles. Le code est corrigé (la fiche
-- attend désormais la première lecture des branches) ; ce script répare les
-- lignes déjà mal classées.
--
-- HYPOTHÈSE ASSUMÉE : la Maison n'a qu'UNE branche réelle. Si un jour il y en
-- a plusieurs, ce script ne doit plus servir tel quel.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU, lecture seule — qui est mal classé, et où il ira ──
select 'branche réelle (cible)' as quoi, id, data->>'name' as nom
  from public.branches;

select 'clients orphelins' as registre, id, branch_id as branche_fantome,
       data->>'branchId' as branche_dans_data
  from public.clients c
 where c.branch_id is null
    or not exists (select 1 from public.branches b where b.id = c.branch_id);

select 'déclarations orphelines' as registre, id, branch_id as branche_fantome,
       data->>'statut' as statut
  from public.enfants_declares e
 where e.branch_id is null
    or not exists (select 1 from public.branches b where b.id = e.branch_id);

-- ── ÉTAPE 2 · ÉCRITURE — tout orphelin rejoint la branche réelle ──
-- (updated_at bouge : les postes ouverts reçoivent la correction en Realtime.)
with cible as (select id from public.branches limit 1)
update public.clients c
   set branch_id  = cible.id,
       data       = jsonb_set(c.data, '{branchId}', to_jsonb(cible.id)),
       updated_at = now()
  from cible
 where c.branch_id is null
    or not exists (select 1 from public.branches b where b.id = c.branch_id);

with cible as (select id from public.branches limit 1)
update public.enfants_declares e
   set branch_id  = cible.id,
       data       = jsonb_set(e.data, '{branchId}', to_jsonb(cible.id)),
       updated_at = now()
  from cible
 where e.branch_id is null
    or not exists (select 1 from public.branches b where b.id = e.branch_id);

-- ── CONTRÔLE — plus aucun orphelin ──
select
  (select count(*) from public.clients c
    where c.branch_id is null
       or not exists (select 1 from public.branches b where b.id = c.branch_id)) as clients_orphelins,
  (select count(*) from public.enfants_declares e
    where e.branch_id is null
       or not exists (select 1 from public.branches b where b.id = e.branch_id)) as declarations_orphelines;
