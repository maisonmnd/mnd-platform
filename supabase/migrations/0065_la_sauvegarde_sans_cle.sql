-- ═══════════════════════════════════════════════════════════════════
-- 0065 — LA SAUVEGARDE SANS CLÉ · 20 août 2026
--
-- La voie par fonction Edge exigeait de coller la clé service dans
-- l'en-tête du cron — et chaque tir finissait en 401 : un caractère de
-- travers suffit, et personne ne le voit. On supprime la clé de
-- l'équation : LA BASE SE PHOTOGRAPHIE ELLE-MÊME. Le cron exécute une
-- ligne de SQL en interne (type « SQL Snippet ») — aucun HTTP, aucun
-- en-tête, rien à coller.
--
-- Le cliché se range dans la table `sauvegardes_nuit` — un par jour,
-- QUATORZE jours de garde (la base entière tient dans chaque cliché ;
-- au-delà, le coffre pèserait plus que la maison). La mémoire longue,
-- c'est le bouton des Paramètres : une photographie téléchargée chaque
-- semaine et rangée hors de Supabase (Drive, clé USB).
--
-- L'ŒUF ET LA POULE, évité : la photographie EXCLUT la table des clichés
-- elle-même — sinon chaque cliché contiendrait les précédents, et le
-- coffre gonflerait en boule de neige.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① L'appareil photo interne — la boucle, sans garde ──────────────
-- Réservé aux fonctions d'ici : execute révoqué de tous les rôles clients.
create or replace function public._photographie_maison()
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
  for t in
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
      and table_name <> 'sauvegardes_nuit'  -- jamais les clichés dans le cliché
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
                  where table_schema = 'public' and table_type = 'BASE TABLE'
                    and table_name <> 'sauvegardes_nuit'),
    'tables', tables
  );
end;
$$;

revoke execute on function public._photographie_maison() from public, anon, authenticated;

-- ── ② La porte souveraine (le bouton des Paramètres) — inchangée de face,
--       elle réutilise l'appareil photo ────────────────────────────────
create or replace function public.sauvegarde_maison()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    public.is_souverain()
    or coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role'
  ) then
    raise exception 'Réservé au souverain — la sauvegarde porte toute la Maison.';
  end if;
  return public._photographie_maison();
end;
$$;

grant execute on function public.sauvegarde_maison() to authenticated;

-- ── ③ Le coffre des clichés ─────────────────────────────────────────
create table if not exists public.sauvegardes_nuit (
  jour date primary key,
  prise_le timestamptz not null default now(),
  cliche jsonb not null
);
alter table public.sauvegardes_nuit enable row level security;
drop policy if exists sauvegardes_nuit_lecture on public.sauvegardes_nuit;
create policy sauvegardes_nuit_lecture on public.sauvegardes_nuit
  for select to authenticated using (public.is_souverain());
-- Aucune politique d'écriture : seule la fonction ci-dessous (definer) écrit.

-- ── ④ Le geste de nuit — UNE ligne de SQL pour le cron ──────────────
-- Le cron de Supabase exécute en interne (rôle postgres) : aucun rôle
-- client n'a le droit d'appeler ceci.
create or replace function public.sauvegarde_nuit_sql()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  gardes int;
begin
  insert into public.sauvegardes_nuit (jour, cliche)
  values (current_date, public._photographie_maison())
  on conflict (jour) do update set cliche = excluded.cliche, prise_le = now();

  delete from public.sauvegardes_nuit where jour < current_date - 14;
  select count(*) into gardes from public.sauvegardes_nuit;
  return 'cliché du ' || current_date || ' rangé — ' || gardes || ' au coffre';
end;
$$;

revoke execute on function public.sauvegarde_nuit_sql() from public, anon, authenticated;

-- ── LE CONTRÔLE — il PREND le premier cliché, tout de suite ─────────
-- Attendu : « cliché du 2026-08-20 rangé — 1 au coffre », puis la ligne
-- du cliché avec son poids et son nombre de lignes.
select public.sauvegarde_nuit_sql() as verdict;

select jour, prise_le,
       pg_size_pretty(pg_column_size(cliche)::bigint) as poids,
       cliche ->> 'lignes' as lignes,
       cliche ->> 'nb_tables' as tables
from public.sauvegardes_nuit
order by jour desc;
