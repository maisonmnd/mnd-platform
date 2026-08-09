-- ═══════════════════════════════════════════════════════════════════
-- AUDIT DE LA SYNCHRO — pourquoi la pastille est rouge
-- (à coller dans Supabase → SQL Editor → Run). LECTURE SEULE : n'écrit rien,
-- ne crée rien, ne supprime rien. Relançable autant qu'on veut.
--
-- CE QUE LA PASTILLE NE DIT PAS. Elle nomme les tables en échec, et c'était
-- déjà un progrès (6 août). Mais un nom ne dit pas la CAUSE, et les causes
-- possibles n'ont rien à voir entre elles :
--
--   · la table n'existe pas en base — une migration jamais collée ;
--   · elle existe mais lui manque une colonne (`branch_id`, `data`) : chaque
--     poussée part avec les trois champs et le serveur refuse la ligne ;
--   · elle n'a AUCUNE politique RLS : sous RLS activée, aucune politique =
--     tout est refusé, et le refus ressemble à une panne ;
--   · elle a une politique, mais qui ne couvre pas ce compte-là ;
--   · elle n'est pas dans la publication Realtime : les autres postes ne
--     voient pas les changements (la pastille reste verte, et pourtant).
--
-- Un refus de DROIT n'allume pas le rouge — `sync.ts` le met de côté
-- (`estRefusDeDroit`). Le rouge dit donc : table absente, colonne absente,
-- contrainte violée, ou réseau. Les trois premières se lisent ici.
--
-- ⚠ À exécuter avec le compte qui voit le rouge, si possible : la dernière
--    section teste ce que CE compte peut réellement lire.
-- ═══════════════════════════════════════════════════════════════════

-- La liste des 33 tables que l'application lie (bindCollection) — tenue à la
-- main, à corriger si une table est ajoutée côté code.
create temporary table _liees (nom text primary key) on commit drop;
insert into _liees (nom) values
  ('academy_applications'), ('academy_enrollments'), ('appointments'),
  ('attendance'), ('branches'), ('budgets'), ('campaigns'), ('cashboxes'),
  ('catalog_categories'), ('catalog_products'), ('catalog_services'),
  ('certifications'), ('client_sessions'), ('clients'), ('coffre_movements'),
  ('consult_forms'), ('consultations_queue'), ('credit_movements'),
  ('expense_categories'), ('expenses'), ('families'), ('formations'),
  ('invoices'), ('leave_requests'), ('payments'), ('payroll_runs'),
  ('personas'), ('plans'), ('salary_advances'), ('subscribers'),
  ('team'), ('tips'), ('apprenants');

-- ── ① LE TABLEAU D'ENSEMBLE ───────────────────────────────────────
-- Une ligne par table liée. Lire la colonne `verdict` en premier : tout ce qui
-- n'est pas « ok » est une cause possible du rouge.
select
  l.nom,
  (c.oid is not null)                                    as existe,
  coalesce(c.relrowsecurity, false)                      as rls_active,
  coalesce(pol.n, 0)                                     as politiques,
  (col.a is not null)                                    as a_data,
  (col.b is not null)                                    as a_branch_id,
  (col.u is not null)                                    as a_updated_at,
  (pt.tablename is not null)                             as realtime,
  case
    when c.oid is null                     then 'TABLE ABSENTE — une migration n''a pas été collée'
    when col.a is null                     then 'COLONNE data ABSENTE — toute écriture sera refusée'
    when col.b is null                     then 'COLONNE branch_id ABSENTE — toute écriture sera refusée'
    when c.relrowsecurity and coalesce(pol.n, 0) = 0
                                           then 'RLS ACTIVE SANS AUCUNE POLITIQUE — tout est refusé'
    when col.u is null                     then 'colonne updated_at absente (sans gravité immédiate)'
    when pt.tablename is null              then 'hors Realtime — les autres postes ne verront pas les changements'
    else 'ok'
  end                                                     as verdict
from _liees l
left join pg_class c
  on c.relname = l.nom
 and c.relnamespace = 'public'::regnamespace
 and c.relkind = 'r'
left join lateral (
  select count(*)::int as n from pg_policy p where p.polrelid = c.oid
) pol on true
left join lateral (
  select
    max(case when a.attname = 'data'       then 1 end) as a,
    max(case when a.attname = 'branch_id'  then 1 end) as b,
    max(case when a.attname = 'updated_at' then 1 end) as u
  from pg_attribute a
  where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
) col on true
left join pg_publication_tables pt
  on pt.pubname = 'supabase_realtime'
 and pt.schemaname = 'public'
 and pt.tablename = l.nom
order by (case when c.oid is null then 0 else 1 end), l.nom;

-- ── ② LES POLITIQUES, EN CLAIR ────────────────────────────────────
-- Qui a le droit de quoi, table par table. Une table liée absente de ce
-- résultat ET dont la RLS est active (voir ①) refuse absolument tout.
select
  c.relname                        as la_table,
  p.polname                        as politique,
  case p.polcmd
    when 'r' then 'lecture' when 'a' then 'insertion'
    when 'w' then 'mise à jour' when 'd' then 'suppression' else 'tout'
  end                              as sur,
  pg_get_expr(p.polqual, p.polrelid)      as condition_de_lecture,
  pg_get_expr(p.polwithcheck, p.polrelid) as condition_d_ecriture
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname in (select nom from _liees)
order by 1, 2;

-- ── ③ CE QUE CE COMPTE-CI EST ─────────────────────────────────────
-- Beaucoup de « pannes » sont en réalité un compte qui n'est pas du personnel :
-- ses écritures sont refusées, légitimement. Si `est_personnel` est faux depuis
-- Le Trône, le problème est là et nulle part ailleurs.
select
  auth.uid()                                      as utilisateur,
  public.is_staff()                               as est_personnel,
  (select count(*) from public.staff)             as membres_du_personnel,
  (select count(*) from public.branches)          as branches_en_base;

-- ── ④ CE QUE LE SERVEUR PORTE VRAIMENT ────────────────────────────
-- Le compte de lignes VU PAR CE COMPTE. Un zéro ici sur une table qui devrait
-- être pleine n'est pas forcément un vide : c'est peut-être la RLS qui filtre
-- en silence — le cas le plus traître, parce qu'il ne rend aucune erreur.
do $$
declare t text; n bigint; sortie text := '';
begin
  for t in select nom from _liees order by 1 loop
    if to_regclass('public.' || t) is null then
      sortie := sortie || format('%-24s ABSENTE%s', t, chr(10));
    else
      execute format('select count(*) from public.%I', t) into n;
      sortie := sortie || format('%-24s %s%s', t, n, chr(10));
    end if;
  end loop;
  raise notice E'\n--- lignes visibles par ce compte ---\n%', sortie;
end $$;

-- ── ⑤ LA LISTE BLANCHE DES DOCUMENTS ──────────────────────────────
-- Les singletons (paramètres, barèmes, Cercle…) vivent tous dans `documents`.
-- Une clé absente de `docs_pub_read` est INVISIBLE aux clientes — sans erreur,
-- sans rouge : leur écran garde la valeur par défaut du code et l'affiche
-- comme si c'était la vérité de la Maison. Voir 0011 et 0028.
select pg_get_expr(p.polqual, p.polrelid) as cles_lisibles_par_une_cliente
from pg_policy p join pg_class c on c.oid = p.polrelid
where c.relname = 'documents' and p.polname = 'docs_pub_read';

select key, (data is not null) as porte_une_valeur, updated_at
from public.documents
order by key;
