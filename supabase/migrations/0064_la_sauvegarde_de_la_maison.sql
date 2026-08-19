-- ═══════════════════════════════════════════════════════════════════
-- 0064 — LA SAUVEGARDE DE LA MAISON · 19 août 2026
--
-- Le manque le plus grave de l'audit du jour : aucune photographie
-- restaurable de la base. Les formulaires de consultation ont disparu le
-- 30 juillet et personne ne l'a su pendant trois semaines — avec une
-- sauvegarde datée, on aurait su, et on aurait restauré.
--
-- LA RÈGLE : la fonction NE CONNAÎT AUCUN NOM DE TABLE. Elle découvre les
-- tables du schéma public à l'exécution (information_schema) : une table
-- née demain entre dans la sauvegarde de demain sans qu'on y pense. C'est
-- la leçon des règles qui reconnaissent par le nom : elles cassent en
-- silence.
--
-- SOUVERAIN SEULEMENT : la photographie contient toute la Maison —
-- clientes, téléphones, factures, paie. `security definer` lit tout ;
-- la garde `is_souverain()` décide qui peut demander.
--
-- CE QU'ELLE NE PORTE PAS : les fichiers du compartiment de stockage
-- (captures jointes au Fil) — ce sont des fichiers, pas des lignes ; ils se
-- sauvegardent à part si un jour le besoin se présente.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.sauvegarde_maison()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tables jsonb := '{}'::jsonb;
  lignes_total bigint := 0;
  t record;
  contenu jsonb;
  n bigint;
begin
  /* Deux mains seulement : le souverain (bouton des Paramètres), et la clé
     service (le réveil de nuit qui dépose au coffre de stockage). */
  if not (
    public.is_souverain()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
  ) then
    raise exception 'Réservé au souverain — la sauvegarde porte toute la Maison.';
  end if;

  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb), count(*) from %I x', t.table_name)
      into contenu, n;
    tables := tables || jsonb_build_object(t.table_name, contenu);
    lignes_total := lignes_total + n;
  end loop;

  return jsonb_build_object(
    'maison', 'MND',
    'prise_le', now(),
    'lignes', lignes_total,
    'nb_tables', (select count(*) from information_schema.tables
                  where table_schema = 'public' and table_type = 'BASE TABLE'),
    'tables', tables
  );
end;
$$;

grant execute on function public.sauvegarde_maison() to authenticated;

-- ── LE COFFRE DES SAUVEGARDES DE NUIT ────────────────────────────────
-- Compartiment PRIVÉ : la fonction planifiée y dépose une photographie
-- par nuit (clé service — aucune politique d'écriture nécessaire pour
-- elle) ; seul le souverain peut les lire depuis les Paramètres.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sauvegardes', 'sauvegardes', false, 52428800, array['application/json'])
on conflict (id) do nothing;

drop policy if exists sauvegardes_lecture on storage.objects;
create policy sauvegardes_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'sauvegardes' and public.is_souverain());

-- ── LE CONTRÔLE — attendu : fonctions = 1, et la liste des tables couvertes ──
select count(*) as fonctions from pg_proc where proname = 'sauvegarde_maison';
select count(*) as tables_couvertes
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE';
