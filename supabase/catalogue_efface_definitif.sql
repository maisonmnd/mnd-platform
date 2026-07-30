-- ═══════════════════════════════════════════════════════════════════
-- CATALOGUE — EFFACEMENT DÉFINITIF. Une seule exécution, rien d'autre à
-- faire ensuite. Aucun navigateur ne pourra le ramener.
-- (SQL Editor → Run · « Run without RLS »)
--
-- POURQUOI LES EFFACEMENTS PRÉCÉDENTS N'ONT PAS TENU. Vider la table ne
-- suffisait pas : le premier onglet du Trône qui se rechargeait trouvait
-- une base vide, la prenait pour une maison neuve à amorcer, et lui
-- renvoyait le catalogue qu'il gardait en cache. On effaçait 88
-- prestations, il en remontait 81. Corrigé dans l'app (le serveur fait
-- foi désormais), mais un appareil qui n'a pas encore reçu la mise à jour
-- referait le coup. D'où ce verrou, qui ne dépend d'aucun navigateur.
--
-- CE QUE FAIT CE SCRIPT :
--   ① il inscrit l'identifiant de CHAQUE ligne du catalogue actuel dans
--      une liste de PIERRES TOMBALES ;
--   ② il pose un déclencheur qui REFUSE SILENCIEUSEMENT toute ré-insertion
--      d'un de ces identifiants ;
--   ③ il vide le catalogue.
--
-- CE QUE ÇA CHANGE POUR TOI : plus rien à faire. Un vieux navigateur peut
-- pousser ce qu'il veut, la base l'ignore. Les prestations que tu créeras
-- toi-même portent des identifiants NEUFS : elles s'enregistrent
-- normalement. Le verrou ne bloque que le passé.
--
-- POUR LE LEVER UN JOUR (par exemple pour ré-importer l'ancien
-- catalogue), la dernière section du fichier donne les deux lignes.
-- ═══════════════════════════════════════════════════════════════════

-- ─── ① LES PIERRES TOMBALES ────────────────────────────────────────
create table if not exists public.catalog_tombstones (
  id      text primary key,
  quoi    text,
  pose_le timestamptz not null default now()
);
alter table public.catalog_tombstones enable row level security;
-- Aucune politique : la table est invisible aux clés `anon` et
-- `authenticated`. Seul le serveur (et cet éditeur) la voit.

insert into public.catalog_tombstones (id, quoi)
select id, 'prestation' from public.catalog_services
union all
select id, 'catégorie'  from public.catalog_categories
union all
select id, 'produit'    from public.catalog_products
on conflict (id) do nothing;

-- ─── ② LE DÉCLENCHEUR ──────────────────────────────────────────────
-- `return null` dans un trigger BEFORE INSERT annule la ligne SANS lever
-- d'erreur : le navigateur croit avoir réussi, la base n'écrit rien. Une
-- exception, elle, ferait échouer toute la synchro de l'app et afficherait
-- une pastille rouge au comptoir pour un geste qu'on veut simplement
-- ignorer.
create or replace function public.refuse_catalogue_ressuscite()
returns trigger language plpgsql security definer as $$
begin
  if exists (select 1 from public.catalog_tombstones t where t.id = new.id) then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists no_resurrect on public.catalog_services;
create trigger no_resurrect before insert on public.catalog_services
  for each row execute function public.refuse_catalogue_ressuscite();

drop trigger if exists no_resurrect on public.catalog_categories;
create trigger no_resurrect before insert on public.catalog_categories
  for each row execute function public.refuse_catalogue_ressuscite();

drop trigger if exists no_resurrect on public.catalog_products;
create trigger no_resurrect before insert on public.catalog_products
  for each row execute function public.refuse_catalogue_ressuscite();

-- ─── ③ L'EFFACEMENT ────────────────────────────────────────────────
delete from public.catalog_services;
delete from public.catalog_categories;
delete from public.catalog_products;

-- ═══ RAPPORT ═══════════════════════════════════════════════════════
select rubrique, detail
from (
  select 1 as bloc, 0::bigint as rang,
         case when (select count(*) from public.catalog_services)
                 + (select count(*) from public.catalog_categories)
                 + (select count(*) from public.catalog_products) = 0
              then '✔ CATALOGUE VIDE, ET VERROUILLÉ'
              else '⚠ IL RESTE DES LIGNES' end as rubrique,
         'Plus rien à faire. Recharge Le Trône quand tu veux : le catalogue restera vide, même depuis un appareil qui n''a pas la mise à jour.' as detail

  union all
  select 2, 0::bigint, 'PIERRES TOMBALES POSÉES',
         count(*) || ' identifiant(s) désormais refusés à l''insertion : '
      || count(*) filter (where quoi = 'prestation') || ' prestations · '
      || count(*) filter (where quoi = 'catégorie')  || ' catégories · '
      || count(*) filter (where quoi = 'produit')    || ' produits'
  from public.catalog_tombstones

  union all
  select 3, 0::bigint, 'ÉTAT DU CATALOGUE',
         'prestations ' || (select count(*) from public.catalog_services)
      || ' · catégories ' || (select count(*) from public.catalog_categories)
      || ' · produits '   || (select count(*) from public.catalog_products)

  union all
  select 4, 0::bigint, 'CE QUE TU POURRAS CRÉER',
         'Toute prestation créée depuis le Catalogue reçoit un identifiant neuf : elle s''enregistre normalement. Le verrou ne refuse que les identifiants listés ci-dessus.'
) t
order by bloc, rang;

-- ─── POUR LEVER LE VERROU UN JOUR ──────────────────────────────────
-- (par exemple pour ré-importer volontairement l'ancien catalogue)
--
--   drop trigger if exists no_resurrect on public.catalog_services;
--   drop trigger if exists no_resurrect on public.catalog_categories;
--   drop trigger if exists no_resurrect on public.catalog_products;
--   -- et, si tu veux repartir de zéro sur les tombales :
--   -- truncate public.catalog_tombstones;
