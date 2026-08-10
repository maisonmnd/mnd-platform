-- ═══════════════════════════════════════════════════════════════════
-- RÉPARATION v4 — LA BRANCHE FANTÔME « maison » : le déclencheur caché
--         Supabase → SQL Editor, onglets des apps fermés. Relançable.
--
-- ACQUIS des passages précédents (commités) : les déclarations d'enfants et
-- le lien du personnel sont DÉJÀ sur la vraie branche. Restent : 3 fiches
-- clientes dont la colonne `branch_id` REVIENT à « maison » à chaque UPDATE
-- — la signature d'un DÉCLENCHEUR posé hors de nos migrations (les nôtres ne
-- font que toucher `updated_at`) — et la ligne fantôme elle-même.
--
-- La v4 : ① inventorie TOUS les déclencheurs non standards (dans le rapport,
-- source comprise) ; ② RETIRE ceux de `clients` — aucun n'est légitime, et
-- celui-ci vient de faire échouer trois réparations ; ③ déplace les fiches ;
-- ④ vérifie table par table (comptage seul — les tables hors patron passent) ;
-- ⑤ retire la fantôme champ libre.
-- ═══════════════════════════════════════════════════════════════════

create temp table if not exists _rapport (etape text, tbl text, detail text);
truncate _rapport;

do $$
declare t record; cible text; n bigint;
begin
  select id into cible from public.branches where id <> 'maison' order by id limit 1;
  if cible is null then
    insert into _rapport values ('ABANDON', '—', 'aucune branche réelle');
    return;
  end if;

  -- ① L'inventaire : tout déclencheur qui n'est pas un simple horodatage.
  for t in
    select c.relname as table_, tr.tgname, p.proname,
           left(pg_get_functiondef(p.oid), 400) as src
      from pg_trigger tr
      join pg_class c on c.oid = tr.tgrelid
      join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
      join pg_proc p on p.oid = tr.tgfoid
     where not tr.tgisinternal and p.proname <> 'touch_updated_at'
  loop
    insert into _rapport values ('DÉCLENCHEUR', t.table_, t.tgname || ' → ' || t.proname || ' · ' || t.src);
  end loop;

  -- ② Ceux de `clients` se retirent : rien de légitime ne vit là, et l'un
  --    d'eux réécrit branch_id — il a fait échouer trois réparations.
  for t in
    select tr.tgname
      from pg_trigger tr
      join pg_class c on c.oid = tr.tgrelid
      join pg_namespace ns on ns.oid = c.relnamespace and ns.nspname = 'public'
      join pg_proc p on p.oid = tr.tgfoid
     where c.relname = 'clients' and not tr.tgisinternal and p.proname <> 'touch_updated_at'
  loop
    execute format('drop trigger %I on public.clients', t.tgname);
    insert into _rapport values ('RETIRÉ', 'clients', 'déclencheur ' || t.tgname);
  end loop;

  -- ③ Les fiches captives déménagent — enfin sans gardien.
  update public.clients
     set branch_id = cible,
         data = case when data ? 'branchId' then jsonb_set(data, '{branchId}', to_jsonb(cible)) else data end,
         updated_at = now()
   where branch_id = 'maison';
  get diagnostics n = row_count;
  insert into _rapport values ('déménagé', 'clients', n || ' ligne(s) → ' || cible);

  -- ④ Vérification globale, COMPTAGE SEUL — les tables hors patron passent.
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables it
        on it.table_schema = 'public' and it.table_name = c.table_name
       and it.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'branch_id'
       and c.table_name <> 'branches'
  loop
    execute format('select count(*) from public.%I where branch_id = ''maison''', t.table_name) into n;
    if n > 0 then insert into _rapport values ('RESTE', t.table_name, n || ' ligne(s)'); end if;
  end loop;

  -- ⑤ La fantôme ne part que champ libre.
  if not exists (select 1 from _rapport where etape = 'RESTE') then
    delete from public.branches where id = 'maison';
    insert into _rapport values ('SUPPRIMÉE', 'branches', 'la fantôme « maison » est retirée');
  else
    insert into _rapport values ('CONSERVÉE', 'branches', 'voir les lignes RESTE');
  end if;
end $$;

select * from _rapport
union all
select 'branche restante', id, data->>'name' from public.branches
order by 1, 2;
