-- ═══════════════════════════════════════════════════════════════════
-- AUDIT — LA SAISIE AU FIL DE L'EAU (liaisons ingrédients & recettes)
--         Lecture seule, relançable à volonté. Supabase → SQL Editor.
--
-- Le module Stock & Achats et le Laboratoire sont construits ; ce qui reste
-- est de la DONNÉE, à saisir au fil de l'eau. Cet audit dit exactement où
-- l'on en est, en trois listes à trancher :
--   ① les compteurs — où en est la saisie ;
--   ② les ingrédients des formules maîtres encore À RELIER à une fiche
--      d'inventaire — tant qu'ils ne le sont pas, ils sont réputés
--      disponibles et la fabrication ne décompte RIEN de la réserve ;
--   ③ les services travaillés ces 90 derniers jours SANS recette — leur
--      coût matière vaut 0, la marge affichée ment d'autant ;
--   ④ les fiches qui freinent l'onglet Achats (prix d'achat à zéro,
--      fournisseur absent — le réappro ne sait pas les grouper).
--
-- Ces tables sont sous is_staff() : lancer avec un compte du personnel.
-- Aucune donnée dans ce fichier — il ne fait que demander. La saisie
-- elle-même se fait à l'écran : Stock & Achats → Inventaire / Recettes,
-- et Laboratoire → La réserve (lier, délier, créer la fiche).
-- ═══════════════════════════════════════════════════════════════════

-- ① Vue d'ensemble — les compteurs de la saisie
select 'fiches d''inventaire' as registre, data->>'famille' as detail, count(*) as lignes
  from public.stock_produits
 group by 2
union all
select 'fournisseurs', null, count(*) from public.fournisseurs
union all
select 'recettes (lignes service → produit)', null, count(*) from public.consommations
union all
select 'mouvements au journal', null, count(*) from public.stock_mouvements
union all
select 'formules maîtres', null, count(*) from public.lab_formules
 order by 1, 2;

-- ② Les ingrédients des formules maîtres — liés, ou à relier
--    La liaison se lit sur la fiche d'inventaire (`labIngredient` = nom
--    canonique du codebook). Une fiche par ingrédient, un ingrédient par
--    fiche — relier depuis Laboratoire → La réserve.
with ingredients as (
  select distinct i->>'nom' as nom
    from public.lab_formules f,
         jsonb_array_elements(f.data->'ingredients') i
   where coalesce(i->>'nom', '') <> ''
), liaisons as (
  select data->>'labIngredient' as nom,
         data->>'nom'  as fiche,
         data->>'code' as code
    from public.stock_produits
   where coalesce((data->>'actif')::boolean, true)
     and coalesce(data->>'labIngredient', '') <> ''
)
select i.nom as ingredient,
       l.fiche,
       l.code,
       case when l.nom is not null then 'liée'
            else 'À RELIER — réputé disponible, la fabrication ne décompte rien'
       end as verdict
  from ingredients i
  left join liaisons l on l.nom = i.nom
 order by (l.nom is not null), i.nom;

-- ③ Les services travaillés (90 jours) sans recette — les plus fréquents
--    d'abord : c'est l'ordre de saisie qui rapporte le plus vite.
with usages as (
  select s.value as service_id, count(*) as rituels
    from public.appointments a,
         jsonb_array_elements_text(a.data->'serviceIds') s
   where coalesce(a.data->>'status', '') <> 'annulé'
     and (a.data->>'date') >= to_char(current_date - interval '90 days', 'YYYY-MM-DD')
   group by 1
), recettes as (
  select data->>'serviceId' as service_id, count(*) as lignes
    from public.consommations
   group by 1
)
select coalesce(sv.data->>'name', u.service_id) as service,
       u.rituels as rituels_90j,
       coalesce(r.lignes, 0) as lignes_de_recette,
       case when coalesce(r.lignes, 0) > 0 then 'recette posée'
            else 'SANS RECETTE — coût matière 0, rien ne se décompte'
       end as verdict
  from usages u
  left join recettes r  on r.service_id = u.service_id
  left join public.catalog_services sv on sv.id = u.service_id
 order by (coalesce(r.lignes, 0) > 0), u.rituels desc;

-- ④ Les fiches qui freinent les Achats
select data->>'code' as code,
       data->>'nom' as fiche,
       data->>'famille' as famille,
       case when coalesce((data->>'prixAchatXof')::numeric, 0) <= 0
            then 'prix d''achat à saisir' end as prix,
       case when coalesce(data->>'fournisseurId', '') = ''
            then 'fournisseur à désigner' end as fournisseur
  from public.stock_produits
 where coalesce((data->>'actif')::boolean, true)
   and (coalesce((data->>'prixAchatXof')::numeric, 0) <= 0
        or coalesce(data->>'fournisseurId', '') = '')
 order by 3, 1;
