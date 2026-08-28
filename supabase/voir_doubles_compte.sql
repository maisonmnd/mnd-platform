-- ═══════════════════════════════════════════════════════════════════════
-- LE DOUBLE COMPTAGE DU COMPTE — 28 août 2026
--
-- « Pourquoi Ahmed au lieu de devoir 242 000 F il doit 484 000 F ? C'est le
-- double. Ça fait ça pour tous les comptes » (Yéman).
--
-- Le rituel et sa facture disent LA MÊME DETTE. La règle « le rituel fait
-- foi » ne reconnaissait le lien que d'un côté (`Appointment.invoiceId`) ;
-- elle lit maintenant aussi l'autre (`Invoice.apptId`). Ces requêtes disent
-- si c'était bien la cause chez vous, ou s'il reste des pièces ORPHELINES,
-- liées ni d'un côté ni de l'autre.
--
-- CES REQUÊTES NE MODIFIENT RIEN. Elles lisent, elles comptent.
-- ═══════════════════════════════════════════════════════════════════════

-- ① COMMENT LES PIÈCES SONT LIÉES, en un coup d'œil.
--    « rituel→pièce » = le correctif d'origine · « pièce→rituel » = celui du
--    28 août · « orpheline » = liée d'aucun côté, et c'est ce qui resterait
--    à réparer.
select
  case
    when a.id is not null then 'rituel → pièce'
    when i.data->>'apptId' is not null then 'pièce → rituel'
    else 'orpheline'
  end                                   as lien,
  count(*)                              as combien,
  sum((i.data->>'priceXof')::numeric)   as montant_indicatif
from public.invoices i
left join public.appointments a on a.data->>'invoiceId' = i.id
where i.data->>'kind' = 'facture'
group by 1
order by 2 desc;

-- ② LES PIÈCES ORPHELINES qui pourraient encore doubler un compte :
--    une facture non liée, dont la même tête a un rituel LE MÊME JOUR.
--    Si cette liste est vide, le correctif suffit.
select
  i.data->>'number'      as piece,
  i.data->>'date'        as le_jour,
  c.data->>'name'        as tete,
  a.id                   as rituel_du_meme_jour,
  a.data->>'time'        as heure
from public.invoices i
join public.clients c on c.id = i.data->>'clientId'
join public.appointments a
  on a.data->>'clientId' = i.data->>'clientId'
 and a.data->>'date'     = i.data->>'date'
 and a.data->>'status'  <> 'annulé'
where i.data->>'kind' = 'facture'
  and i.data->>'apptId' is null
  and not exists (
    select 1 from public.appointments x where x.data->>'invoiceId' = i.id
  )
order by i.data->>'date' desc
limit 100;

-- ③ LE COMPTE D'UNE TÊTE, pièce par pièce — pour vérifier un cas précis.
--    Remplacer le nom entre guillemets.
select
  'rituel'            as nature,
  a.data->>'date'     as le_jour,
  a.id                as piece,
  a.data->>'invoiceId' as lie_a,
  a.data->>'status'   as etat
from public.appointments a
join public.clients c on c.id = a.data->>'clientId'
where c.data->>'name' ilike '%Ahmed%'
union all
select
  'facture',
  i.data->>'date',
  i.data->>'number',
  i.data->>'apptId',
  i.data->>'status'
from public.invoices i
join public.clients c on c.id = i.data->>'clientId'
where c.data->>'name' ilike '%Ahmed%'
order by le_jour desc, nature;

-- ═══════════════════════════════════════════════════════════════════════
-- SI ② REND DES LIGNES, dites-le-moi : il faudra rattacher ces pièces à
-- leur rituel. Cela se fait par une mise à jour ciblée, que je préparerai
-- et que vous relirez avant de la passer — on ne relie pas de l'argent à
-- l'aveugle.
-- ═══════════════════════════════════════════════════════════════════════
