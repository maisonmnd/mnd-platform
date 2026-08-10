-- ═══════════════════════════════════════════════════════════════════
-- RÉPARATION v3 — LA BRANCHE FANTÔME « maison » (10 août 2026, soir)
--
-- ⚠ AVANT DE COLLER : FERMEZ les onglets du Trône et de Ma Couronne (tous les
--   postes, le téléphone aussi). La v2 a vu ses lignes REVENIR pendant la
--   réparation — très probablement une poussée locale d'un poste ouvert qui a
--   réécrit son cache par-dessus l'UPDATE. Portes fermées, rien ne repousse.
--
-- Ce que fait la v3 :
--   ① `staff_branches` (table hors patron, sans colonne `data`) se répare
--     à part — c'était l'ÉCHEC de la v2 ;
--   ② le balayage général repasse TROIS fois, et rapporte chaque passe ;
--   ③ si des lignes résistent encore, elles sont MONTRÉES (id + branches)
--     au lieu d'un simple compte ;
--   ④ la fantôme n'est retirée que champ libre.
-- ═══════════════════════════════════════════════════════════════════

create temp table if not exists _rapport (etape text, tbl text, detail text);
truncate _rapport;

-- ① La table hors patron : elle n'a que (user_id, branch_id) — clé primaire
--    sur la paire. Un utilisateur DÉJÀ lié à la vraie branche ne se déplace
--    pas (collision de clé — c'est ce qui a fait dérailler la v3 entière,
--    transaction comprise) : son lien fantôme se SUPPRIME. Les autres se
--    déplacent.
delete from public.staff_branches sb
 where sb.branch_id = 'maison'
   and exists (select 1 from public.staff_branches sb2
                where sb2.user_id = sb.user_id and sb2.branch_id <> 'maison');
update public.staff_branches set branch_id = b.id
  from (select id from public.branches where id <> 'maison' order by id limit 1) b
 where staff_branches.branch_id = 'maison';

do $$
declare t record; cible text; n bigint; passe int;
begin
  select id into cible from public.branches where id <> 'maison' order by id limit 1;
  if cible is null then
    insert into _rapport values ('ABANDON', '—', 'aucune branche réelle');
    return;
  end if;

  -- ② Trois passes : si une poussée concurrente réécrit entre deux, la
  --    suivante la rattrape — et le rapport montre si ça se reproduit.
  for passe in 1..3 loop
    for t in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables it
          on it.table_schema = 'public' and it.table_name = c.table_name
         and it.table_type = 'BASE TABLE'
       where c.table_schema = 'public' and c.column_name = 'branch_id'
         and c.table_name not in ('branches', 'staff_branches')
    loop
      begin
        execute format(
          'update public.%I set branch_id = %L,
                  data = case when data ? ''branchId'' then jsonb_set(data, ''{branchId}'', to_jsonb(%L::text)) else data end,
                  updated_at = now()
            where branch_id = ''maison''',
          t.table_name, cible, cible);
        get diagnostics n = row_count;
        if n > 0 then
          insert into _rapport values ('passe ' || passe, t.table_name, n || ' ligne(s) déplacée(s)');
        end if;
      exception when others then
        insert into _rapport values ('ÉCHEC passe ' || passe, t.table_name, sqlerrm);
      end;
    end loop;
  end loop;

  -- ③ Ce qui résiste encore : MONTRÉ, pas seulement compté.
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
      execute format(
        'insert into _rapport
           select ''RÉSISTE'', %L, id || '' · data.branchId='' || coalesce(data->>''branchId'', ''—'')
             from public.%I where branch_id = ''maison''',
        t.table_name, t.table_name);
    exception when others then
      -- staff_branches n'a pas de data : montrer l'identifiant seul.
      begin
        execute format(
          'insert into _rapport select ''RÉSISTE'', %L, user_id::text from public.%I where branch_id = ''maison''',
          t.table_name, t.table_name);
      exception when others then null;
      end;
    end;
  end loop;

  -- ④ La fantôme ne part que champ libre.
  if not exists (select 1 from _rapport where etape like 'RÉSISTE%' or etape like 'ÉCHEC%') then
    delete from public.branches where id = 'maison';
    insert into _rapport values ('SUPPRIMÉE', 'branches', 'la fantôme « maison » est retirée');
  else
    insert into _rapport values ('CONSERVÉE', 'branches', 'voir les lignes RÉSISTE / ÉCHEC');
  end if;
end $$;

select * from _rapport
union all
select 'branche restante', id, data->>'name' from public.branches
order by 1, 2;
