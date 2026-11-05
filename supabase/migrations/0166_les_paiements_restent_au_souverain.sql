-- ═══════════════════════════════════════════════════════════════════════════
-- 0166 · LES PAIEMENTS RESTENT AU SOUVERAIN · 6 novembre 2026
--
-- L'écran « Les paiements » (Équipe › Ressources humaines, /paiements, lot A)
-- garde deux lignes neuves dans `documents` :
--   · `mnd_les_paiements`      : le registre du mois (pourboires remis, dates
--                                de paie des prestataires et des entreprises) ;
--   · `mnd_paiements_factures` : les factures des entreprises payées par MTN.
-- Elles disent qui touche quoi : elles se lisent et s'écrivent comme la paie,
-- par le SOUVERAIN seul.
--
-- La règle existe déjà (0130) : les politiques `docs_staff_*` refusent toute
-- clé de `cles_rh_privees()` à qui n'est pas souverain. On AJOUTE les deux
-- clés à la liste ; aucune politique n'est retirée ni réécrite, aucune donnée
-- ne bouge. La clé de service (fonctions Edge) passe toujours.
-- Rejouable : `create or replace`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.cles_rh_privees() returns text[]
language sql immutable as $$
  select array['mnd_paie_overrides', 'mnd_primes', 'mnd_paie_confirm', 'mnd_retenues',
               'mnd_les_paiements', 'mnd_paiements_factures']::text[]
$$;
