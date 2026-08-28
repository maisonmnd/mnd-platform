-- ═══════════════════════════════════════════════════════════════════════
-- RETROUVER LES ABONNEMENTS — 28 août 2026
--
-- « Peux-tu retrouver les abonnements que j'avais auparavant ? » (Yéman).
-- Rien n'est supprimé par Le Trône : « Résilier » ne fait que basculer le
-- statut à `churn`, et l'écran ne lisait que les non-résiliés. Deux choses
-- pouvaient donc les cacher : ce statut, ou une AUTRE BRANCHE que celle
-- affichée en haut de l'écran.
--
-- CES REQUÊTES NE MODIFIENT RIEN. Elles lisent, elles comptent, elles
-- montrent. Aucune n'écrit une ligne.
-- ═══════════════════════════════════════════════════════════════════════

-- ① LE COMPTE, D'UN COUP D'ŒIL — combien, où, dans quel état.
select
  branch_id                             as branche,
  coalesce(data->>'status', 'sans statut') as statut,
  count(*)                              as combien,
  sum((data->>'mrrXof')::numeric)       as mrr_total
from public.subscribers
group by 1, 2
order by 1, 2;

-- ② LA LISTE ENTIÈRE, résiliés compris, la plus récente d'abord.
--    C'est ici qu'on retrouve ce que l'écran ne montrait plus.
select
  s.data->>'name'                       as tete,
  coalesce(p.data->>'name', '(formule retirée)') as formule,
  s.data->>'status'                     as statut,
  s.data->>'sinceIso'                   as abonnee_depuis,
  s.data->>'nextIso'                    as prochaine_echeance,
  (s.data->>'mrrXof')::numeric          as mrr,
  jsonb_array_length(coalesce(s.data->'payments', '[]'::jsonb)) as reglements,
  s.branch_id                           as branche,
  s.updated_at                          as derniere_ecriture
from public.subscribers s
left join public.plans p on p.id = s.data->>'planId'
order by s.updated_at desc;

-- ③ LES SEULS RÉSILIÉS — ceux que l'écran cachait.
--    Depuis le 28 août, ils vivent aussi dans « Les partis », sous le
--    tableau des abonnés, avec un bouton « Reprendre l'abonnement ».
select
  s.data->>'name'              as tete,
  coalesce(p.data->>'name', '(formule retirée)') as formule,
  (s.data->>'mrrXof')::numeric as mrr_d_alors,
  s.data->>'sinceIso'          as abonnee_depuis,
  s.updated_at                 as resilie_le,
  s.branch_id                  as branche
from public.subscribers s
left join public.plans p on p.id = s.data->>'planId'
where s.data->>'status' = 'churn'
order by s.updated_at desc;

-- ④ LES BRANCHES, pour vérifier qu'on regarde la bonne.
--    Un abonnement posé sur une autre branche est invisible depuis celle-ci.
select b.id, b.data->>'city' as ville, count(s.id) as abonnements
from public.branches b
left join public.subscribers s on s.branch_id = b.id
group by 1, 2
order by 3 desc;

-- ⑤ LES FORMULES, si le tableau paraît vide alors que les têtes existent.
select id, data->>'name' as formule, (data->>'priceXof')::numeric as prix, branch_id
from public.plans
order by (data->>'priceXof')::numeric desc;

-- ═══════════════════════════════════════════════════════════════════════
-- SI ② NE REND AUCUNE LIGNE, alors la table est vraiment vide et il ne
-- s'agit plus d'un filtre d'affichage. Dans ce cas, et SEULEMENT dans ce
-- cas, regardez si une sauvegarde en porte encore la trace :
--
--   select table_name from information_schema.tables
--   where table_schema = 'public' and table_name ilike '%subscriber%';
--
-- Ne créez ni ne restaurez rien sans me le dire : une table de repli
-- ad-hoc doit recevoir sa RLS dans le même geste, sinon la clé anon
-- publique la lit.
-- ═══════════════════════════════════════════════════════════════════════
