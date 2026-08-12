-- ═══════════════════════════════════════════════════════════════════
-- 0040 — LES VERSEMENTS DES RÉSERVES SONT RÉSERVÉS AU SOUVERAIN
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- Salon & Foyer peut désormais VERSER une réserve au Coffre-fort : le montant
-- sort de la réserve et entre au coffre, les deux écritures portant la même
-- référence. Mais `coffre_movements` est lisible par TOUT le personnel ayant
-- le domaine Finances (0009), alors que l'épargne du Partage est l'affaire du
-- couple — comme la paie et comme le reste de Salon & Foyer.
--
-- On ne ferme donc pas le coffre : on ferme LES SEULES LIGNES qui viennent
-- des Réserves (`data->>'origine' = 'reserve'`). Les dépôts ordinaires et les
-- virements bancaires restent visibles du personnel, exactement comme avant.
--
-- CONSÉQUENCE À CONNAÎTRE : le solde du Coffre-fort affiché à un gérant sera
-- PLUS BAS que celui du souverain — il ne voit pas ces lignes. Ce n'est pas
-- une panne, c'est la portée de son regard. L'écran Salon & Foyer le dit au
-- souverain, qui est le seul à pouvoir agir dessus.
-- ═══════════════════════════════════════════════════════════════════

alter table public.coffre_movements enable row level security;

drop policy if exists staff_all on public.coffre_movements;

-- Le personnel garde TOUT le coffre, sauf ce qui vient des Réserves ; le
-- souverain voit et écrit tout. Le `with check` porte la même règle : sans
-- lui, un compte non souverain pourrait ÉCRIRE une ligne qu'il ne peut pas
-- relire — elle disparaîtrait sous ses yeux à la synchronisation suivante.
create policy staff_all on public.coffre_movements for all to authenticated
  using (
    public.is_staff()
    and (coalesce(data->>'origine', '') <> 'reserve' or public.is_souverain())
  )
  with check (
    public.is_staff()
    and (coalesce(data->>'origine', '') <> 'reserve' or public.is_souverain())
  );

-- Contrôle : la politique est en place, et voici ce que porte le coffre.
select 'coffre — lignes ordinaires' as quoi,
       count(*) filter (where coalesce(data->>'origine','') <> 'reserve')::text as valeur
from public.coffre_movements
union all
select 'coffre — venant des Réserves (souverain seul)',
       count(*) filter (where data->>'origine' = 'reserve')::text
from public.coffre_movements;
