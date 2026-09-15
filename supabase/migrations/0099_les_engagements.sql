-- ═══════════════════════════════════════════════════════════════════
-- 0099 — LES ENGAGEMENTS · 15 septembre 2026
--
-- « Un prestataire menuisier veut me réaliser un devis immobilier pour le
-- salon de coiffure. Où stocker mes devis, mes validations et les avances
-- reçues avec signature et décharge. Réserve un espace pour télécharger la
-- carte d'identité » (Yéman). Maquette `public/maquette-les-engagements.html`,
-- validée.
--
-- TROIS TABLES, UN COMPARTIMENT :
--   · engagements            — le dossier : qui, pour quoi, sa pièce d'identité ;
--   · devis_recus            — ses propositions, dont une seule retenue ;
--   · versements_engagement  — l'argent et sa décharge.
--   · le compartiment `engagements` — les pièces, et la carte d'identité.
--
-- AUCUN ÉTAT DE L'ARGENT N'EST ÉCRIT. « Soldé », « reste à payer »,
-- « dépassement » se dérivent des devis et des versements, dans
-- `shared/engagements.ts`. Il n'y a donc rien ici qui puisse les contredire.
--
-- ══ QUI PEUT QUOI (décisions du 15 septembre) ══════════════════════════
--
--   · TOUT LE PERSONNEL lit les dossiers, SAISIT un devis reçu, PRÉVOIT un
--     versement, et RAPPORTE la photo d'une décharge revenue signée.
--   · LA DIRECTION SEULE retient un devis, verse, abandonne un dossier, et
--     touche à la pièce d'identité.
--
-- LES DÉCLENCHEURS RESTAURENT PLUTÔT QU'ILS NE REFUSENT — même choix qu'en
-- 0091, 0093 et 0098. Un refus ferait échouer toute la synchronisation de la
-- ligne et laisserait l'écran en rouge sans que personne comprenne ; une
-- restauration laisse passer ce qui est légitime et annule le reste.
--
-- `is_staff()` (0003), `est_direction()` (0089), `touch_updated_at()` et
-- `trace_le_geste()` (0092) sont passées.
-- ═══════════════════════════════════════════════════════════════════

-- ── LES TROIS TABLES ─────────────────────────────────────────────────
create table if not exists public.engagements (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.devis_recus (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.versements_engagement (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.engagements           enable row level security;
alter table public.devis_recus           enable row level security;
alter table public.versements_engagement enable row level security;

create index if not exists devis_recus_dossier on public.devis_recus ((data->>'engagementId'));
create index if not exists versements_engagement_dossier on public.versements_engagement ((data->>'engagementId'));

-- ── LES POLITIQUES ───────────────────────────────────────────────────
-- Le personnel lit et écrit ; les déclencheurs ci-dessous décident de ce
-- qui, dans une écriture, est réellement permis. Effacer est un geste de la
-- direction : un devis écarté est une preuve, une décharge aussi.
do $$
declare t text;
begin
  foreach t in array array['engagements', 'devis_recus', 'versements_engagement'] loop
    execute format('drop policy if exists eng_lu on public.%I', t);
    execute format('drop policy if exists eng_ecrit on public.%I', t);
    execute format('drop policy if exists eng_modifie on public.%I', t);
    execute format('drop policy if exists eng_efface on public.%I', t);
    execute format('create policy eng_lu on public.%I for select to authenticated using (public.is_staff())', t);
    execute format('create policy eng_ecrit on public.%I for insert to authenticated with check (public.is_staff())', t);
    execute format('create policy eng_modifie on public.%I for update to authenticated using (public.is_staff()) with check (public.is_staff())', t);
    execute format('create policy eng_efface on public.%I for delete to authenticated using (public.est_direction())', t);
  end loop;
end $$;

-- ── ① LE DOSSIER : la pièce d'identité et l'abandon sont à la direction ──
create or replace function public.engagement_garde() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.est_direction() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.data := new.data - 'identite' - 'abandonneLe';
    return new;
  end if;
  -- Le numéro est posé à la création, jamais réécrit.
  if (old.data ? 'numero') then
    new.data := jsonb_set(new.data, '{numero}', old.data -> 'numero', true);
  end if;
  if (old.data ? 'identite') then
    new.data := jsonb_set(new.data, '{identite}', old.data -> 'identite', true);
  else
    new.data := new.data - 'identite';
  end if;
  if (old.data ? 'abandonneLe') then
    new.data := jsonb_set(new.data, '{abandonneLe}', old.data -> 'abandonneLe', true);
  else
    new.data := new.data - 'abandonneLe';
  end if;
  return new;
end;
$$;

drop trigger if exists engagements_garde on public.engagements;
create trigger engagements_garde before insert or update on public.engagements
  for each row execute function public.engagement_garde();

-- ── ② LE DEVIS : retenir est à la direction, un retenu ne change plus ───
create or replace function public.devis_recu_garde() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fige text;
begin
  if tg_op = 'INSERT' then
    -- Le comptoir SAISIT un devis reçu ; il ne l'arrive jamais « retenu ».
    if not public.est_direction() then
      new.data := jsonb_set(new.data - 'retenuLe' - 'retenuPar', '{etat}', '"recu"', true);
    end if;
    return new;
  end if;

  -- UN DEVIS RETENU NE CHANGE PLUS DE MONTANT, pour personne. Un prix qui
  -- bouge se dit par un AVENANT — un devis de plus dans le dossier — et non
  -- par une réécriture silencieuse du oui déjà donné.
  if old.data->>'etat' = 'retenu' and (old.data ? 'montantXof') then
    new.data := jsonb_set(new.data, '{montantXof}', old.data -> 'montantXof', true);
  end if;

  if not public.est_direction() then
    foreach fige in array array['etat', 'retenuLe', 'retenuPar'] loop
      if (old.data ? fige) then
        new.data := jsonb_set(new.data, array[fige], old.data -> fige, true);
      else
        new.data := new.data - fige;
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists devis_recus_garde on public.devis_recus;
create trigger devis_recus_garde before insert or update on public.devis_recus
  for each row execute function public.devis_recu_garde();

-- ── ③ LE VERSEMENT : verser est à la direction, une décharge ne se réécrit pas ──
create or replace function public.versement_engagement_garde() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fige text;
begin
  if tg_op = 'INSERT' then
    -- Le comptoir PRÉVOIT un versement ; il ne le déclare jamais versé.
    if not public.est_direction() then
      new.data := new.data - 'verseLe' - 'versePar' - 'expenseId' - 'cashbox' - 'method';
    end if;
    return new;
  end if;

  -- UNE DÉCHARGE POSÉE NE SE RÉÉCRIT PAS, pour personne. Une signature
  -- remplacée après coup ne prouverait plus rien. Pour la refaire, la
  -- direction efface le versement et le repose — et la trace le dit.
  if (old.data ? 'decharge') and old.data->'decharge' <> 'null'::jsonb then
    new.data := jsonb_set(new.data, '{decharge}', old.data -> 'decharge', true);
  end if;

  if not public.est_direction() then
    foreach fige in array array['verseLe', 'versePar', 'expenseId', 'cashbox', 'method'] loop
      if (old.data ? fige) then
        new.data := jsonb_set(new.data, array[fige], old.data -> fige, true);
      else
        new.data := new.data - fige;
      end if;
    end loop;
    -- Le montant d'un versement DÉJÀ PARTI ne se corrige qu'à la direction.
    if nullif(old.data->>'verseLe', '') is not null and (old.data ? 'montantXof') then
      new.data := jsonb_set(new.data, '{montantXof}', old.data -> 'montantXof', true);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists versements_engagement_garde on public.versements_engagement;
create trigger versements_engagement_garde before insert or update on public.versements_engagement
  for each row execute function public.versement_engagement_garde();

-- ── L'HORODATAGE, LE DIRECT, LA TRACE ───────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['engagements', 'devis_recus', 'versements_engagement'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.touch_updated_at()', t || '_touch', t);

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;

    -- QUI A RETENU, QUI A VERSÉ, QUI A CORRIGÉ : signé par la base (0092).
    if exists (select 1 from pg_proc where proname = 'trace_le_geste') then
      execute format('drop trigger if exists trace_le_geste on public.%I', t);
      execute format('create trigger trace_le_geste after insert or update or delete on public.%I for each row execute function public.trace_le_geste()', t);
    end if;
  end loop;
end $$;

-- ══ LE COMPARTIMENT ═════════════════════════════════════════════════
-- PRIVÉ. Dix mégaoctets par pièce : un devis scanné, une photo de décharge,
-- une carte d'identité — rien de ce qu'on range ici n'a besoin de plus.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'engagements', 'engagements', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do nothing;

-- ══ LA RÈGLE VIT DANS LE CHEMIN ═════════════════════════════════════
-- `<branche>/identite/<engagement>/…` — la direction seule ;
-- `<branche>/pieces/<engagement>/…`   — tout le personnel.
-- Le deuxième segment du chemin décide. C'est la BASE qui refuse une adresse
-- signée à qui n'a pas le droit : l'écran ne tient pas cette porte-là.
drop policy if exists engagements_lire on storage.objects;
create policy engagements_lire on storage.objects for select to authenticated
  using (
    bucket_id = 'engagements'
    and (
      public.est_direction()
      or ((storage.foldername(name))[2] = 'pieces' and public.is_staff())
    )
  );

drop policy if exists engagements_deposer on storage.objects;
create policy engagements_deposer on storage.objects for insert to authenticated
  with check (
    bucket_id = 'engagements'
    and (
      public.est_direction()
      or ((storage.foldername(name))[2] = 'pieces' and public.is_staff())
    )
  );

-- UNE PIÈCE DÉPOSÉE NE SE REMPLACE PAS : une décharge photographiée qu'on
-- pourrait écraser ne prouverait plus rien.
drop policy if exists engagements_remplacer on storage.objects;
create policy engagements_remplacer on storage.objects for update to authenticated
  using (bucket_id = 'engagements' and public.est_direction())
  with check (bucket_id = 'engagements' and public.est_direction());

-- EFFACER EST À LA DIRECTION, et c'est elle qui efface la pièce d'identité
-- un an après la fermeture du dossier (`identiteAEffacer`), par l'API de
-- stockage — qui retire réellement le fichier, là où effacer la seule ligne
-- en base laisserait les octets derrière.
drop policy if exists engagements_retirer on storage.objects;
create policy engagements_retirer on storage.objects for delete to authenticated
  using (bucket_id = 'engagements' and public.est_direction());

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select tablename as table_creee
from pg_tables
where schemaname = 'public'
  and tablename in ('engagements', 'devis_recus', 'versements_engagement')
order by tablename;

select id as compartiment, public as ouvert_au_public, file_size_limit as taille_max
from storage.buckets where id = 'engagements';

select policyname as politique_du_coffre
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'engagements_%'
order by policyname;
