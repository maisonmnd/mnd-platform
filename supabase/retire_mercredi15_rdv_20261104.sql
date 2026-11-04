-- ══ RETIRER MERCREDI15 D'UN RDV DÉJÀ PRIS · 4 novembre 2026 ═════════════
-- « Retirer la remise » (Yéman, au sélecteur) : la remise du mercredi ne
-- s'ajoute jamais à des prix convenus, et elle ne vaut plus qu'un jour sans
-- rendez-vous (règle « une seule remise »). Le RDV du mardi 23 décembre 2026
-- réservé avec MERCREDI15 repasse à son prix convenu, sans remise : le code,
-- l'offre et les remises de ses lignes s'effacent ; son prix figé reste.
-- La ligne d'avant est gardée dans une table de repli, sous RLS.
-- À passer UNE fois. NE PAS RELANCER.

create table if not exists public.repli_rdv_mercredi15_20261104 as
  select * from public.appointments where id = 'aykmyv5vaw';
alter table public.repli_rdv_mercredi15_20261104 enable row level security;

update public.appointments
   set data = data - 'codeOffre' - 'offreId' - 'remisesLignes',
       updated_at = now()
 where id = 'aykmyv5vaw'
   and data->>'codeOffre' = 'MERCREDI15';
