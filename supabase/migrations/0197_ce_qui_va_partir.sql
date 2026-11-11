-- ═══════════════════════════════════════════════════════════════════════════
-- 0197 · CE QUI VA PARTIR — 5 novembre 2026 (écrite 0158 ce jour-là ; renumérotée
-- 0197 le 8 novembre 2026 à la reprise du chantier : 0158 avait été pris entre-temps)
--
-- « Est-ce possible d'avoir tous les modèles Meta qui doivent partir pour le
-- Trône, quelque part dans le Trône, pour qu'on puisse contrôler chaque
-- message qui part, à qui, et qu'on puisse arrêter le message au besoin ? »,
-- puis « est-ce possible de mettre des modèles en pause et que ça marche
-- également sur Meta ? » (Yéman, 4 novembre 2026). Maquette « Ce qui va
-- partir » (v3) validée : « Ne pas envoyer » à la DIRECTION SEULE (souverain
-- ou gérant, `est_direction()`), un interrupteur « En service / En pause »
-- par modèle, direction seule aussi.
--
--   1. `envois_arretes` : un message arrêté d'avance, par sa clé
--      (`rappel-j1:<rdv>`, `garder:<rdv>`, `relance:<pièce>:<rang>`…, la règle
--      `cleDuMessage` de src/shared/arret-d-avance-pur.ts). « Remettre » pose
--      `remisLe` : rien ne s'efface, on sait toujours qui a arrêté quoi.
--   2. `modeles_en_pause` : un modèle Meta en pause CHEZ NOUS (Meta ne permet
--      pas à une entreprise de mettre elle-même un modèle en pause). La porte
--      d'Opale le refuse partout. Opale y écrit aussi, par la clé service,
--      quand un modèle revient « non remis » cinq fois de suite.
--   Les deux : lues par le personnel (l'onglet « À venir » et « Les modèles
--   Meta »), écrites par la direction seule, jamais effacées ; au temps réel.
--   Le facteur `envois-partent` et chaque fonction qui dépose les lisent avec
--   la clé service.
--
-- Rejouable : `if not exists`, `create or replace`, `drop … if exists`.
-- `is_staff()` vient de 0003, `est_direction()` de 0089, `touch_updated_at()`
-- de 0001.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. LES MESSAGES ARRÊTÉS D'AVANCE ──────────────────────────────────────
create table if not exists public.envois_arretes (
  id         text primary key,                 -- la clé du message
  branch_id  text,
  data       jsonb not null default '{}'::jsonb, -- { cle, arreteLe, arretePar, remisLe?, remisPar?, quoi? }
  updated_at timestamptz not null default now()
);
alter table public.envois_arretes enable row level security;

drop trigger if exists envois_arretes_touch on public.envois_arretes;
create trigger envois_arretes_touch before update on public.envois_arretes
  for each row execute function public.touch_updated_at();

drop policy if exists envois_arretes_lire on public.envois_arretes;
create policy envois_arretes_lire on public.envois_arretes for select to authenticated
  using (public.is_staff());
drop policy if exists envois_arretes_ecrire on public.envois_arretes;
create policy envois_arretes_ecrire on public.envois_arretes for insert to authenticated
  with check (public.est_direction());
drop policy if exists envois_arretes_reprendre on public.envois_arretes;
create policy envois_arretes_reprendre on public.envois_arretes for update to authenticated
  using (public.est_direction()) with check (public.est_direction());
-- Pas de politique de suppression : un arrêt se remet, il ne s'efface pas.
revoke delete, truncate on public.envois_arretes from anon, authenticated;


-- ── 2. LES MODÈLES EN PAUSE ───────────────────────────────────────────────
create table if not exists public.modeles_en_pause (
  id         text primary key,                 -- le nom du modèle chez Meta
  branch_id  text,
  data       jsonb not null default '{}'::jsonb, -- { modele, enPause, par, le, motif?, parOpale?, reprisPar?, reprisLe? }
  updated_at timestamptz not null default now()
);
alter table public.modeles_en_pause enable row level security;

drop trigger if exists modeles_en_pause_touch on public.modeles_en_pause;
create trigger modeles_en_pause_touch before update on public.modeles_en_pause
  for each row execute function public.touch_updated_at();

drop policy if exists modeles_en_pause_lire on public.modeles_en_pause;
create policy modeles_en_pause_lire on public.modeles_en_pause for select to authenticated
  using (public.is_staff());
drop policy if exists modeles_en_pause_ecrire on public.modeles_en_pause;
create policy modeles_en_pause_ecrire on public.modeles_en_pause for insert to authenticated
  with check (public.est_direction());
drop policy if exists modeles_en_pause_reprendre on public.modeles_en_pause;
create policy modeles_en_pause_reprendre on public.modeles_en_pause for update to authenticated
  using (public.est_direction()) with check (public.est_direction());
revoke delete, truncate on public.modeles_en_pause from anon, authenticated;


-- ── 3. AU TEMPS RÉEL : un arrêt posé sur un poste se voit sur les autres ──
do $$
declare
  t text;
begin
  foreach t in array array['envois_arretes', 'modeles_en_pause'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
