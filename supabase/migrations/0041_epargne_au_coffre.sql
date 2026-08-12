-- ═══════════════════════════════════════════════════════════════════
-- 0041 — L'ÉPARGNE DU PARTAGE VIT AU COFFRE-FORT, EN UNE SEULE ÉTAPE
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- 0038 avait donné aux Réserves leur propre table, et 0040 un virement pour
-- les porter au Coffre-fort. Deux registres pour une même notion, et TROIS
-- gestes pour une seule décision : inscrire la dotation, la verser, la relire
-- à deux endroits. Trois gestes pour une décision finissent par ne pas être
-- faits, et deux registres par dire deux chiffres.
--
-- Les deux enveloppes ne sont donc plus un registre : ce sont une ÉTIQUETTE
-- sur les lignes du coffre (`origine = 'reserve'`, `enveloppe`). Mettre de
-- côté, c'est déposer au coffre — l'argent est à l'abri au moment même où on
-- décide de l'épargner.
--
-- LA REPRISE EST INCLUSE ET IDEMPOTENTE. Les identifiants sont CONSERVÉS tels
-- quels : une dotation mensuelle porte déjà `dot-<enveloppe>-<mois>`, qui est
-- exactement la clé que l'écran recalcule — la garder évite qu'une dotation
-- déjà inscrite soit proposée une seconde fois.
--
--   dotation → dépôt au coffre    ·    retrait → virement (seule sortie)
--
-- `reserves_mouvements` N'EST PAS SUPPRIMÉE : elle est le retour en arrière,
-- comme les `repli_0023_`. Le code ne s'y lie plus.
--
-- ⚠ À PASSER AVANT LA PROCHAINE PUBLICATION : sans elle, une épargne déjà
--   inscrite resterait dans l'ancienne table, invisible à l'écran.
-- ═══════════════════════════════════════════════════════════════════

-- Les lignes APPARIÉES (`ref` non nul) sont IGNORÉES à dessein : c'étaient les
-- versements du 11 août, dont le retrait de réserve avait pour jumeau un dépôt
-- DÉJÀ présent au coffre. Les reprendre créerait un virement qui annulerait ce
-- dépôt — l'argent disparaîtrait. Le contrôle en fin de script les compte.
insert into public.coffre_movements (id, branch_id, data)
select r.id,
       r.branch_id,
       jsonb_build_object(
         'id', r.id,
         'branchId', coalesce(r.data->>'branchId', r.branch_id),
         'kind', case when r.data->>'sens' = 'dotation' then 'depot' else 'virement' end,
         'amountXof', coalesce((r.data->>'amountXof')::numeric, 0),
         'date', r.data->>'date',
         'note', coalesce(
                   nullif(r.data->>'note', ''),
                   'Réserve · ' || case r.data->>'enveloppe'
                                     when 'reinvestissement' then 'Réinvestissement'
                                     else 'Fiscale & imprévus' end),
         'origine', 'reserve',
         'enveloppe', r.data->>'enveloppe'
       )
from public.reserves_mouvements r
where coalesce(r.data->>'ref', '') = ''
  and coalesce((r.data->>'amountXof')::numeric, 0) > 0
on conflict (id) do nothing;

-- Les dépôts issus du virement du 11 août n'avaient pas encore d'enveloppe
-- (elle n'existait pas comme étiquette). On la leur pose d'après leur jumeau,
-- pour qu'ils se rangent dans la bonne colonne. Idempotent.
update public.coffre_movements c
set data = c.data || jsonb_build_object('enveloppe', r.data->>'enveloppe')
from public.reserves_mouvements r
where c.data->>'origine' = 'reserve'
  and coalesce(c.data->>'enveloppe', '') = ''
  and coalesce(r.data->>'ref', '') <> ''
  and c.data->>'ref' = r.data->>'ref';

-- Contrôle : ce qui a été repris, et ce qui a été laissé de côté à dessein.
select 'réserves reprises au coffre' as quoi,
       count(*)::text as valeur
from public.coffre_movements where data->>'origine' = 'reserve'
union all
select 'dont réinvestissement',
       count(*)::text
from public.coffre_movements
where data->>'origine' = 'reserve' and data->>'enveloppe' = 'reinvestissement'
union all
select 'dont fiscale & imprévus',
       count(*)::text
from public.coffre_movements
where data->>'origine' = 'reserve' and data->>'enveloppe' = 'fiscale'
union all
select 'anciennes lignes appariées, ignorées (déjà au coffre)',
       count(*)::text
from public.reserves_mouvements where coalesce(data->>'ref','') <> ''
union all
select 'ancienne table reserves_mouvements (conservée)',
       count(*)::text
from public.reserves_mouvements;
