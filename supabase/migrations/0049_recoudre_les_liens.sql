-- ═══════════════════════════════════════════════════════════════════
-- 0049 — RECOUDRE TOUS LES LIENS PERDUS, UNE FOIS.
--        (à coller dans Supabase → SQL Editor, après la 0048). UN SEUL TEMPS.
--
-- Le contrôle de la 0048 a montré QUATRE fiches payeuses sans lien : le
-- rejeu des copies froides a frappé plus large que le seul cas du jour.
-- La 0048 recoud AU FIL DE L'EAU — à l'ouverture de l'app par la personne
-- concernée. Celles qui ne l'ouvrent pas resteraient décousues, et tout ce
-- qui lit encore `familyId` sur la fiche (avoir du compte, remise famille,
-- regroupements de Finances) les verrait seules.
--
-- Un seul geste, GÉNÉRIQUE, sans aucune donnée nominative : toute fiche
-- payeuse d'une famille qui ne porte pas le lien le retrouve — la plus
-- ancienne de ses familles d'abord, même règle que 0046 et 0048.
-- Idempotent : re-coller ne change rien de plus.
-- ═══════════════════════════════════════════════════════════════════

with a_recoudre as (
  select c.id as client_id,
         (select f.id from public.families f
           where f.data->>'payerClientId' = c.id
           order by f.updated_at asc
           limit 1) as fam_id
  from public.clients c
  where coalesce(c.data->>'familyId', '') = ''
    and exists (select 1 from public.families f where f.data->>'payerClientId' = c.id)
)
update public.clients c
   set data = data || jsonb_build_object('familyId', r.fam_id),
       updated_at = now()
  from a_recoudre r
 where c.id = r.client_id
   and r.fam_id is not null;

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
-- 0 attendu : plus aucune fiche payeuse sans son lien.
select count(*) as fiches_payeuses_sans_lien
  from public.clients c
  join public.families f on f.data->>'payerClientId' = c.id
 where coalesce(c.data->>'familyId', '') = '';
