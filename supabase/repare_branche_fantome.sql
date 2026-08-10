-- ═══════════════════════════════════════════════════════════════════
-- RÉPARATION — LA BRANCHE FANTÔME « maison » (10 août 2026, soir)
--         Supabase → SQL Editor. Relançable ; aperçu d'abord.
--
-- La table `branches` portait DEUX lignes : la vraie (L'atelier MND) et la
-- semence par défaut du code (`maison` · « Ma Maison »), résidu de l'incident
-- du 8 août. Les fiches nées d'un téléphone froid se rangeaient sur la
-- fantôme — et `repare_branches_orphelines.sql` ne les voyait pas : leur
-- branche EXISTAIT. Ce script-ci :
--   ① balaie TOUTES les tables à `branch_id` et déplace ce qui vit sur
--     `maison` vers la première branche réelle (≠ maison) ;
--   ② retire la ligne fantôme — plus rien ne pourra s'y ranger.
-- Le code, lui, est déjà corrigé : une fiche n'attend plus que la première
-- lecture des branches, et se réaligne si sa branche est inconnue.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAPE 1 · APERÇU — ce qui vit sur la fantôme, table par table ──
do $$
declare t record; n bigint;
begin
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'branch_id'
       and table_name <> 'branches'
  loop
    execute format('select count(*) from public.%I where branch_id = ''maison''', t.table_name) into n;
    if n > 0 then raise notice 'sur la fantôme : % — % ligne(s)', t.table_name, n; end if;
  end loop;
end $$;

-- ── ÉTAPE 2 · ÉCRITURE — tout déménage, puis la fantôme disparaît ──
do $$
declare t record; cible text;
begin
  select id into cible from public.branches where id <> 'maison' order by id limit 1;
  if cible is null then
    raise exception 'Aucune branche réelle — rien n''est touché.';
  end if;

  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'branch_id'
       and table_name <> 'branches'
  loop
    begin
      execute format(
        'update public.%I set branch_id = %L,
                data = case when data ? ''branchId'' then jsonb_set(data, ''{branchId}'', to_jsonb(%L::text)) else data end,
                updated_at = now()
          where branch_id = ''maison''',
        t.table_name, cible, cible);
    exception when others then
      raise notice 'table % sautée : %', t.table_name, sqlerrm;
    end;
  end loop;
end $$;

-- La fantôme ne part que si plus rien ne la référence.
do $$
declare t record; n bigint; total bigint := 0;
begin
  for t in
    select table_name from information_schema.columns
     where table_schema = 'public' and column_name = 'branch_id'
       and table_name <> 'branches'
  loop
    execute format('select count(*) from public.%I where branch_id = ''maison''', t.table_name) into n;
    total := total + n;
  end loop;
  if total = 0 then
    delete from public.branches where id = 'maison';
    raise notice 'Branche fantôme « maison » retirée.';
  else
    raise notice 'ENCORE % ligne(s) sur la fantôme — elle reste, relancez l''aperçu.', total;
  end if;
end $$;

-- ── CONTRÔLE — une seule branche, plus rien sur « maison » ──
select id, data->>'name' as nom from public.branches;
