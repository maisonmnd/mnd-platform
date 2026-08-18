-- ═══════════════════════════════════════════════════════════════════
-- 0057 — RETOUR À L'ÉTAT D'AVANT
--        (à coller tel quel. RIEN À DÉCOMMENTER.)
--
-- ⚠ FERME TOUS LES ONGLETS DU TRÔNE ET DE MA COURONNE AVANT DE LANCER.
--
-- Demande de Yéman, 17 août : tout remettre comme c'était avant sa requête.
-- Ce fichier annule 0054, 0054c, 0054d, 0055 et 0056 d'un seul mouvement.
--
-- ── COMMENT ──────────────────────────────────────────────────────
-- Toutes ces migrations n'ont jamais écrit QUE la colonne `data` — jamais
-- `id`, jamais `branch_id`, jamais rien d'autre. Le retour consiste donc à
-- reposer `data` telle que la photo la plus ANCIENNE l'a gardée :
--
--   `repli_0054_appointments`     → l'état des 150 rituels avant tout
--   `repli_0054_invoices`         → l'état des 131 pièces avant tout
--   `repli_0055_catalog_services` → la fiche du module avant sa grille
--
-- Les photos plus récentes (`repli_0054c_*`, `repli_0054d_*`, `repli_0056_*`)
-- ne servent pas ici : elles décrivent des états INTERMÉDIAIRES. Repartir de
-- la plus ancienne annule toute la chaîne d'un coup, sans la rejouer à
-- l'envers — et sans risque de s'arrêter au milieu.
--
-- ── CE QUE TU REVERRAS APRÈS ─────────────────────────────────────
--   · « KLƆKLƆ™ Prestige · « La Dépose » » sur 18 lignes de facture ;
--   · « KLƆKLƆ™ Signature · « L'Ancrage » » sur 111 lignes ;
--   · les rituels repointés sur Prestige et Signature ;
--   · les prix des pièces NON payées revenus à ce qu'ils étaient ;
--   · les gels de prix comme ils étaient (ni posés par moi, ni retirés) ;
--   · « GBÌGBÌ™ Module · Le Soin Reconstruction » à 15 000 F sans grille.
--
-- ── CE QUE ÇA NE PEUT PAS DEVINER ────────────────────────────────
-- Si une pièce ou un rituel a été modifié à la main DEPUIS les migrations,
-- ce retour l'écrase aussi. L'aperçu compte les lignes concernées avant
-- d'agir — et `repli_0057_*` garde l'état actuel, donc ce fichier est lui
-- aussi réversible.
-- ═══════════════════════════════════════════════════════════════════

-- ── APERÇU — ne modifie rien. Combien de lignes vont bouger. ─────
select 'rendez-vous' as surface,
       count(*)                                                as photographies,
       count(*) filter (where a.id is null)                    as disparus_depuis,
       count(*) filter (where a.data is distinct from r.data)  as a_remettre
from public.repli_0054_appointments r
  left join public.appointments a on a.id = r.id
union all
select 'pièces',
       count(*), count(*) filter (where i.id is null),
       count(*) filter (where i.data is distinct from r.data)
from public.repli_0054_invoices r
  left join public.invoices i on i.id = r.id
union all
select 'catalogue',
       count(*), count(*) filter (where s.id is null),
       count(*) filter (where s.data is distinct from r.data)
from public.repli_0055_catalog_services r
  left join public.catalog_services s on s.id = r.id;
--  `disparus_depuis` doit valoir 0. S'il ne vaut pas 0, une fiche a été
--  supprimée depuis — dis-le moi AVANT de lancer la suite, ce fichier ne la
--  ressuscite pas volontairement.


begin;

-- La photo de l'état ACTUEL, pour que ce retour soit lui aussi réversible.
create table if not exists public.repli_0057_appointments
  (like public.appointments including all);
alter table public.repli_0057_appointments enable row level security;
create table if not exists public.repli_0057_invoices
  (like public.invoices including all);
alter table public.repli_0057_invoices enable row level security;
create table if not exists public.repli_0057_catalog_services
  (like public.catalog_services including all);
alter table public.repli_0057_catalog_services enable row level security;

insert into public.repli_0057_appointments
select a.* from public.appointments a
where a.id in (select id from public.repli_0054_appointments)
on conflict (id) do nothing;

insert into public.repli_0057_invoices
select i.* from public.invoices i
where i.id in (select id from public.repli_0054_invoices)
on conflict (id) do nothing;

insert into public.repli_0057_catalog_services
select s.* from public.catalog_services s
where s.id in (select id from public.repli_0055_catalog_services)
on conflict (id) do nothing;

-- ① LES RITUELS REVIENNENT — serviceIds ET gels de prix, d'un seul geste :
--    `data` entière reprend la valeur photographiée avant le 0054.
update public.appointments a
set data = r.data
from public.repli_0054_appointments r
where r.id = a.id
  and a.data is distinct from r.data;

-- ② LES PIÈCES REVIENNENT — libellés ET montants.
update public.invoices i
set data = r.data
from public.repli_0054_invoices r
where r.id = i.id
  and i.data is distinct from r.data;

-- ③ LE MODULE PERD SA GRILLE PAR LONGUEUR.
update public.catalog_services s
set data = r.data
from public.repli_0055_catalog_services r
where r.id = s.id
  and s.data is distinct from r.data;

commit;


-- ═══════════════════════════════════════════════════════════════════
-- CONTRÔLE — puis À NOUVEAU après Ctrl+Maj+R sur Le Trône.
-- ═══════════════════════════════════════════════════════════════════

-- ① RIEN NE DIFFÈRE PLUS DE LA PHOTO. Les trois doivent valoir ZÉRO.
select
  (select count(*) from public.repli_0054_appointments r
     join public.appointments a on a.id = r.id
    where a.data is distinct from r.data)                     as rituels_differents,
  (select count(*) from public.repli_0054_invoices r
     join public.invoices i on i.id = r.id
    where i.data is distinct from r.data)                     as pieces_differentes,
  (select count(*) from public.repli_0055_catalog_services r
     join public.catalog_services s on s.id = r.id
    where s.data is distinct from r.data)                     as fiches_differentes;

-- ② LES CHIFFRES D'ORIGINE SONT REVENUS.
select
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data->'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Dépose%')                      as lignes_depose,
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data->'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Ancrage%')                     as lignes_ancrage,
  (select count(*) from public.invoices i,
          jsonb_array_elements(coalesce(i.data->'lines','[]'::jsonb)) l
    where l ->> 'label' like '%Souffle%')                     as lignes_souffle,
  (select count(*) from public.appointments a
    where a.data->'serviceIds' ? 'sv-plt-05-pre-c')           as rdv_prestige,
  (select count(*) from public.appointments a
    where a.data->'serviceIds' ? 'sv-plt-05-sig-c')           as rdv_signature,
  (select count(*) from public.appointments a
    where a.data->'serviceIds' ? 'sv-plt-05-ess-c')           as rdv_essentiel;
--  Attendu : 18 · 111 · 147 · 18 · 132 · 184.

-- ③ LE MODULE N'A PLUS DE GRILLE. `grille` doit être vide (null).
select id, data ->> 'name' as nom, (data ->> 'priceXof')::int as prix,
       data -> 'prixParLongueur' as grille
from public.catalog_services where id = 'sv-plt-40-m';
--  Attendu : 15000, grille null.


-- ── SI TU VEUX REVENIR SUR CE RETOUR ─────────────────────────────
-- begin;
-- update public.appointments a set data = r.data
--   from public.repli_0057_appointments r where r.id = a.id;
-- update public.invoices i set data = r.data
--   from public.repli_0057_invoices r where r.id = i.id;
-- update public.catalog_services s set data = r.data
--   from public.repli_0057_catalog_services r where r.id = s.id;
-- commit;
