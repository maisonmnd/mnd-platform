-- 0146 · LE FÍNFÍN™ LÉGÈRE À 20 000 F — 31 octobre 2026
--
-- Demande de la direction : « change le prix de Finfin réparation léger à
-- 20000F à partir d'aujourd'hui ». La prestation sv-finfin-legere
-- (« FÍNFÍN™ Légère · La Réparation Douce ») passe de 15 000 F à 20 000 F au
-- catalogue. Le Trône, le site (réservation) et l'automate WhatsApp lisent le
-- catalogue en direct : rien à republier.
--
-- Les 43 rendez-vous passés portent leur prix enregistré et n'en bougent pas.
-- Les trois déjà posés à partir d'aujourd'hui, au prix d'avant, passent à
-- +5 000 F (choix de la direction au sélecteur, 31 oct. 2026). Aucun n'a de
-- facture ni de paiement :
--   mk125lnzmz  31 oct. 2026  24 000 → 29 000 F
--   y302u7fm9r  14 nov. 2026  65 000 → 70 000 F
--   o1hrc3q1eu   5 déc. 2026  60 000 → 65 000 F
--
-- Repli d'abord, RLS comprise (règle de la Maison). Chaque mise à jour exige
-- l'ancien prix : repassé, le fichier ne touche plus rien. `updated_at`
-- avance pour que les postes relisent.

create table if not exists public.repli_0146_finfin_legere as
  select 'catalog_services'::text as source, id, branch_id, data, updated_at
  from public.catalog_services where id = 'sv-finfin-legere'
  union all
  select 'appointments', id, branch_id, data, updated_at
  from public.appointments where id in ('mk125lnzmz', 'y302u7fm9r', 'o1hrc3q1eu');
alter table public.repli_0146_finfin_legere enable row level security;

update public.catalog_services
set data = jsonb_set(data, '{priceXof}', to_jsonb(20000)), updated_at = now()
where id = 'sv-finfin-legere' and (data->>'priceXof')::numeric = 15000;

update public.appointments a
set data = jsonb_set(a.data, '{priceXof}', to_jsonb(v.nouveau)), updated_at = now()
from (values ('mk125lnzmz', 24000, 29000),
             ('y302u7fm9r', 65000, 70000),
             ('o1hrc3q1eu', 60000, 65000)) as v(id, ancien, nouveau)
where a.id = v.id and (a.data->>'priceXof')::numeric = v.ancien;

-- Relecture :
-- select id, data->>'priceXof' from catalog_services where id = 'sv-finfin-legere';
-- select id, data->>'priceXof' from appointments where id in ('mk125lnzmz', 'y302u7fm9r', 'o1hrc3q1eu');
--
-- Retour en arrière :
-- update public.catalog_services c set data = r.data, updated_at = now()
--   from public.repli_0146_finfin_legere r where r.source = 'catalog_services' and c.id = r.id;
-- update public.appointments a set data = r.data, updated_at = now()
--   from public.repli_0146_finfin_legere r where r.source = 'appointments' and a.id = r.id;
