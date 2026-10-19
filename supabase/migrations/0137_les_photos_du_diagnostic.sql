-- ═══════════════════════════════════════════════════════════════════
-- 0137 · LES PHOTOS DU DIAGNOSTIC — 19 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Un seul bloc,
-- rejouable sans dommage. AVANT de coller la fonction `diagnostic-locks`.
--
-- Décisions de Yéman (14 octobre, confirmées le 19) : une cliente envoie
-- une à quatre photos de ses locks depuis La Consultation (payée) ou Ma
-- Couronne ; Claude les lit ; elle voit sa lecture tout de suite ; un
-- maître (la direction ou l'Atelier) la relit dans la journée au Trône ;
-- les photos s'effacent à 90 jours ; le diagnostic reste FERMÉ aux clientes
-- tant que la direction ne l'allume pas ; la table « observation → rituel
-- → produit » se corrige par la direction seule.
--
--   · le compartiment PRIVÉ `photos-du-diagnostic` : seule la fonction y
--     dépose (clé de service) ; AUCUNE politique d'écriture n'est donnée au
--     navigateur (une file qu'on peut remplir est une file qu'on remplit).
--     Le personnel voit les photos par une adresse signée ; la direction
--     seule efface (et la fonction, à 90 jours).
--   · `diagnostics` : une ligne par lecture, écrite par la fonction seule.
--     Le personnel lit et met à jour (la relecture : confirmer, corriger) ;
--     la direction efface. La cliente ne lit RIEN par la table : la
--     fonction lui rend sa lecture (geste « lire »).
--   · Realtime sur `diagnostics` : une lecture arrive au Trône à l'instant.
--   · Deux gardes sur `documents` : la table `mnd_diagnostic_table` et
--     l'interrupteur `mnd_auto_config.diagnosticPhoto` sont à la direction.
--
-- `is_staff()` (0003) et `est_direction()` (0089) existent déjà.
-- ═══════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'is_staff') then
    raise exception 'is_staff() est absente : passez d’abord 0003_auth.sql';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'est_direction') then
    raise exception 'est_direction() est absente : passez d’abord 0089';
  end if;
end $$;

-- ── ① LE COFFRE DES PHOTOS ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos-du-diagnostic', 'photos-du-diagnostic', false, 4000000,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- VOIR : le personnel connecté (adresse signée depuis le Trône).
drop policy if exists diagnostic_photos_voir on storage.objects;
create policy diagnostic_photos_voir on storage.objects for select to authenticated
  using (bucket_id = 'photos-du-diagnostic' and public.is_staff());

-- EFFACER : la direction (la fonction efface à 90 jours avec la clé de service).
drop policy if exists diagnostic_photos_effacer on storage.objects;
create policy diagnostic_photos_effacer on storage.objects for delete to authenticated
  using (bucket_id = 'photos-du-diagnostic' and public.est_direction());

-- ── ② LES DIAGNOSTICS ───────────────────────────────────────────────
create table if not exists public.diagnostics (
  id          text primary key,                       -- « diag-… », donné par la fonction
  branch_id   text,
  client_id   text,                                   -- la fiche, quand la lecture vient de Ma Couronne
  source      text not null check (source in ('consultation', 'couronne')),
  data        jsonb not null default '{}'::jsonb,     -- lecture, recommandation, texte, photos, correction…
  etat        text not null default 'a-relire' check (etat in ('a-relire', 'relu', 'ferme')),
  cree_le     timestamptz not null default now(),
  relu_par    uuid,                                   -- le compte qui a relu (jamais montré à la cliente)
  relu_le     timestamptz
);
create index if not exists diagnostics_etat_idx on public.diagnostics (etat, cree_le desc);
create index if not exists diagnostics_client_idx on public.diagnostics (client_id);
create index if not exists diagnostics_consultation_idx on public.diagnostics ((data->>'consultationId'));

-- ── ③ LES DROITS ────────────────────────────────────────────────────
alter table public.diagnostics enable row level security;

drop policy if exists diagnostics_lire on public.diagnostics;
drop policy if exists diagnostics_relire on public.diagnostics;
drop policy if exists diagnostics_effacer on public.diagnostics;
create policy diagnostics_lire on public.diagnostics for select to authenticated
  using (public.is_staff());
-- La relecture : confirmer, corriger. Le personnel seul ; aucune insertion
-- par le navigateur, la fonction seule crée une ligne.
create policy diagnostics_relire on public.diagnostics for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy diagnostics_effacer on public.diagnostics for delete to authenticated
  using (public.est_direction());

-- ── ④ REALTIME ──────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'diagnostics'
  ) then
    execute 'alter publication supabase_realtime add table public.diagnostics';
  end if;
end $$;

-- ── ⑤ LA TABLE ET L'INTERRUPTEUR SONT À LA DIRECTION ────────────────
-- `documents` s'écrit par tout le personnel (0006). La table « observation
-- → rituel → produit » (`mnd_diagnostic_table`) ne s'écrit que par la
-- direction : hors direction, l'écriture est refusée. Dans
-- `mnd_auto_config`, `diagnosticPhoto` (l'interrupteur) suit la même règle
-- que `automateWa` (0125) : une écriture qui l'omet le garde, hors direction
-- il reprend sa valeur d'avant, et il n'est jamais autre chose qu'un booléen.
create or replace function public.documents_garde_le_diagnostic() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  avant jsonb;
begin
  if new.key = 'mnd_diagnostic_table' then
    if auth.uid() is not null and not public.est_direction() then
      raise exception 'la table du diagnostic appartient à la direction' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.key is distinct from 'mnd_auto_config' or new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if exists (select 1 from public.documents d where d.key = new.key) then
      return new;
    end if;
    avant := null;
  else
    avant := case when jsonb_typeof(old.data) = 'object' then old.data end;
  end if;
  if not (new.data ? 'diagnosticPhoto') and avant is not null and (avant ? 'diagnosticPhoto') then
    new.data := new.data || jsonb_build_object('diagnosticPhoto', avant->'diagnosticPhoto');
  end if;
  if auth.uid() is not null and not public.est_direction() then
    new.data := new.data - 'diagnosticPhoto';
    if avant is not null and (avant ? 'diagnosticPhoto') then
      new.data := new.data || jsonb_build_object('diagnosticPhoto', avant->'diagnosticPhoto');
    end if;
  end if;
  if (new.data ? 'diagnosticPhoto') and jsonb_typeof(new.data->'diagnosticPhoto') <> 'boolean' then
    new.data := new.data - 'diagnosticPhoto';
  end if;
  return new;
end $$;

drop trigger if exists documents_garde_le_diagnostic on public.documents;
create trigger documents_garde_le_diagnostic before insert or update on public.documents
  for each row execute function public.documents_garde_le_diagnostic();

-- ── CONTRÔLE ────────────────────────────────────────────────────────
-- Doit rendre : le coffre fermé au public (4 000 000 octets), deux
-- politiques diagnostic_photos_*, et la table avec rls true, 3 politiques,
-- realtime true.
select id as compartiment, public as ouvert_au_public, file_size_limit as taille_max
from storage.buckets where id = 'photos-du-diagnostic';
select policyname as politique, cmd as commande
from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'diagnostic_photos_%'
order by policyname;
select
  c.relname                                                                  as table_,
  c.relrowsecurity                                                           as rls,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as politiques,
  exists (select 1 from pg_publication_tables r
          where r.pubname = 'supabase_realtime' and r.schemaname = 'public' and r.tablename = c.relname) as realtime
from pg_class c
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where c.relname = 'diagnostics';
