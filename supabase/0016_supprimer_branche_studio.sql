-- ═══════════════════════════════════════════════════════════════════
-- 0016 — Retirer la branche STUDIO MND, créée par erreur
--        (à coller dans Supabase → SQL Editor → Run). En TROIS temps.
--
-- Le Studio n'est pas une branche : les deux maisons partagent un local, une
-- caisse et un plateau technique, et c'est la catégorie du catalogue qui les
-- sépare — le filtre du Carnet et la ventilation de la Synthèse s'appuient
-- là-dessus. La branche STUDIO MND est un vestige : tant qu'elle existe, une
-- bascule involontaire rend invisibles les clientes et les rendez-vous qui y
-- sont saisis, et coupe les chiffres en deux sans prévenir.
--
-- On ne supprime PAS à l'aveugle : la première requête dit ce qui y est
-- rattaché. Si tout est à zéro, la suppression est sans conséquence. Sinon,
-- l'étape 2 rapatrie ces enregistrements sur ATELIER MND avant de retirer la
-- branche — rien n'est perdu, tout redevient visible.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · Que porte cette branche ? (à lire avant d'aller plus loin) ──
with studio as (
  select id from public.branches
  where lower(data ->> 'name') like '%studio%'
)
select 'branche'      as objet, (select count(*) from studio)                                          as nombre
union all select 'clientes',     (select count(*) from public.clients       c where c.branch_id in (select id from studio))
union all select 'rendez-vous',  (select count(*) from public.appointments  a where a.branch_id in (select id from studio))
union all select 'factures',     (select count(*) from public.invoices      i where i.branch_id in (select id from studio))
union all select 'dépenses',     (select count(*) from public.expenses      e where e.branch_id in (select id from studio))
union all select 'caisses',      (select count(*) from public.cashboxes     b where b.branch_id in (select id from studio));

-- ── ÉTAPE 2 · Rapatrier sur ATELIER MND ───────────────────────────
-- À n'exécuter que si l'étape 1 a montré autre chose que des zéros.
-- Remplace 'ID_ATELIER' par l'identifiant réel donné par cette requête :
--     select id, data ->> 'name' from public.branches order by 2;
--
-- do $$
-- declare cible text := 'ID_ATELIER';
-- declare studio text;
-- begin
--   select id into studio from public.branches where lower(data ->> 'name') like '%studio%' limit 1;
--   if studio is null then raise notice 'Aucune branche Studio — rien à faire.'; return; end if;
--   update public.clients      set branch_id = cible, data = jsonb_set(data, '{branchId}', to_jsonb(cible)) where branch_id = studio;
--   update public.appointments set branch_id = cible, data = jsonb_set(data, '{branchId}', to_jsonb(cible)) where branch_id = studio;
--   update public.invoices     set branch_id = cible, data = jsonb_set(data, '{branchId}', to_jsonb(cible)) where branch_id = studio;
--   update public.expenses     set branch_id = cible, data = jsonb_set(data, '{branchId}', to_jsonb(cible)) where branch_id = studio;
--   update public.cashboxes    set branch_id = cible, data = jsonb_set(data, '{branchId}', to_jsonb(cible)) where branch_id = studio;
-- end $$;

-- ── ÉTAPE 3 · Retirer la branche ──────────────────────────────────
-- Le garde-fou refuse la suppression tant que quelque chose y est encore
-- rattaché : mieux vaut un message qu'une donnée devenue invisible.
do $$
declare studio text;
declare restants int;
begin
  select id into studio from public.branches where lower(data ->> 'name') like '%studio%' limit 1;
  if studio is null then raise notice 'Aucune branche Studio — rien a supprimer.'; return; end if;

  select (select count(*) from public.clients      where branch_id = studio)
       + (select count(*) from public.appointments where branch_id = studio)
       + (select count(*) from public.invoices     where branch_id = studio)
       + (select count(*) from public.expenses     where branch_id = studio)
       + (select count(*) from public.cashboxes    where branch_id = studio)
    into restants;

  if restants > 0 then
    raise exception 'La branche Studio porte encore % enregistrement(s). Executez l''etape 2 avant.', restants;
  end if;

  delete from public.branches where id = studio;
  raise notice 'Branche Studio supprimee.';
end $$;

-- ── Vérification ──────────────────────────────────────────────────
select id, data ->> 'name' as branche from public.branches order by 2;
