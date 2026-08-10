-- ═══════════════════════════════════════════════════════════════════
-- RÉPARATION v2 — LA BRANCHE FANTÔME « maison » (10 août 2026, soir)
--         Supabase → SQL Editor. Relançable ; TOUT s'affiche en résultat
--         (la v1 parlait en NOTICE — invisibles dans l'éditeur).
--
-- `branches` porte deux lignes : la vraie (L'atelier MND) et la semence du
-- code (`maison`). Ce script déménage tout ce qui vit sur la fantôme vers la
-- branche réelle, TABLE PAR TABLE en notant échecs et restes, puis retire la
-- fantôme si plus rien ne la référence. Le rapport final dit tout.
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

  -- ① Le déménagement, table par table — échecs notés, jamais silencieux.
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables it
        on it.table_schema = 'public' and it.table_name = c.table_name
       and it.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'branch_id'
       and c.table_name <> 'branches'
  loop
    begin
      execute format('select count(*) from public.%I where branch_id = ''maison''', t.table_name) into n;
      if n > 0 then
        execute format(
          'update public.%I set branch_id = %L,
                  data = case when data ? ''branchId'' then jsonb_set(data, ''{branchId}'', to_jsonb(%L::text)) else data end,
                  updated_at = now()
            where branch_id = ''maison''',
          t.table_name, cible, cible);
        insert into _rapport values ('déménagé', t.table_name, n || ' ligne(s) → ' || cible);
      end if;
    exception when others then
      insert into _rapport values ('ÉCHEC', t.table_name, sqlerrm);
    end;
  end loop;

  -- ② Ce qui RESTE sur la fantôme après le passage.
  for t in
    select c.table_name
      from information_schema.columns c
      join information_schema.tables it
        on it.table_schema = 'public' and it.table_name = c.table_name
       and it.table_type = 'BASE TABLE'
     where c.table_schema = 'public' and c.column_name = 'branch_id'
       and c.table_name <> 'branches'
  loop
    begin
      execute format('select count(*) from public.%I where branch_id = ''maison''', t.table_name) into n;
      if n > 0 then insert into _rapport values ('RESTE', t.table_name, n || ' ligne(s)'); end if;
    exception when others then
      insert into _rapport values ('ÉCHEC (compte)', t.table_name, sqlerrm);
    end;
  end loop;

  -- ③ La fantôme ne part que si le champ est libre.
  if not exists (select 1 from _rapport where etape in ('RESTE', 'ÉCHEC', 'ÉCHEC (compte)')) then
    begin
      delete from public.branches where id = 'maison';
      insert into _rapport values ('SUPPRIMÉE', 'branches', 'la fantôme « maison » est retirée');
    exception when others then
      insert into _rapport values ('ÉCHEC (suppression)', 'branches', sqlerrm);
    end;
  else
    insert into _rapport values ('CONSERVÉE', 'branches', 'des restes ou des échecs ci-dessus la retiennent');
  end if;
end $$;

-- ── LE RAPPORT, puis l'état des branches ──
select * from _rapport
union all
select 'branche restante', id, data->>'name' from public.branches
order by 1;
