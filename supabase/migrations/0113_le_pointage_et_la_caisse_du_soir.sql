-- ═══════════════════════════════════════════════════════════════════
-- 0113 — LE POINTAGE DU JOUR ET LA CAISSE DU SOIR · 3 octobre 2026
--
-- « Comment pointer les revenus du jour ? et faciliter le contrôle des
-- caisses ? » Maquette « Le pointage du jour », validée.
--
-- DEUX TABLES, PROTÉGÉES DÈS LEUR NAISSANCE :
--
--   pointages        une ligne du registre reconnue comme réellement reçue
--                    (relevé MTN ou à la main). Son id EST celui de la ligne :
--                    pointer deux fois réécrit, ne double jamais.
--
--   clotures_caisse  le comptage d'un tiroir, un soir. Attendu, compté,
--                    écart, note, billetage, versement au coffre.
--
-- LES GARDES DE LA BASE, pas seulement de l'écran :
--   - le personnel lit, pointe et clôture ;
--   - l'écart se RECALCULE ici (compté − attendu) : un écran ne peut pas
--     écrire « juste » sur un tiroir qui ne l'est pas ;
--   - la DÉCISION sur un écart (accepté / repris) n'appartient qu'au
--     souverain ; écrite par un autre, elle est retirée ;
--   - une clôture ne s'efface pas, et ne se réécrit pas : seul le souverain
--     y touche, et seulement pour y poser sa décision. Une reprise est une
--     clôture de plus.
-- ═══════════════════════════════════════════════════════════════════

-- ── LES POINTAGES ──────────────────────────────────────────────────
create table if not exists public.pointages (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists pointages_branch_idx on public.pointages (branch_id);

drop trigger if exists pointages_touch on public.pointages;
create trigger pointages_touch before update on public.pointages
  for each row execute function public.touch_updated_at();

alter table public.pointages enable row level security;

drop policy if exists pointages_staff on public.pointages;
create policy pointages_staff on public.pointages
  for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ── LES CLÔTURES ───────────────────────────────────────────────────
create table if not exists public.clotures_caisse (
  id text primary key,
  branch_id text,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists clotures_caisse_branch_idx on public.clotures_caisse (branch_id);

drop trigger if exists clotures_caisse_touch on public.clotures_caisse;
create trigger clotures_caisse_touch before update on public.clotures_caisse
  for each row execute function public.touch_updated_at();

alter table public.clotures_caisse enable row level security;

drop policy if exists clotures_lire on public.clotures_caisse;
create policy clotures_lire on public.clotures_caisse
  for select to authenticated using (public.is_staff());

drop policy if exists clotures_compter on public.clotures_caisse;
create policy clotures_compter on public.clotures_caisse
  for insert to authenticated with check (public.is_staff());

drop policy if exists clotures_decider on public.clotures_caisse;
create policy clotures_decider on public.clotures_caisse
  for update to authenticated
  using (public.is_souverain()) with check (public.is_souverain());

drop policy if exists clotures_effacer on public.clotures_caisse;
create policy clotures_effacer on public.clotures_caisse
  for delete to authenticated using (public.is_souverain());

-- L'écart se recalcule, la décision n'est qu'au souverain, et un souverain
-- qui décide ne réécrit pas les chiffres du comptage.
create or replace function public.cloture_tient_ses_chiffres()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  compte numeric := coalesce((new.data->>'compteXof')::numeric, 0);
  attendu numeric := coalesce((new.data->>'attenduXof')::numeric, 0);
begin
  if tg_op = 'INSERT' then
    new.data := jsonb_set(new.data, '{ecartXof}', to_jsonb(compte - attendu));
    if auth.uid() is not null and not public.is_souverain() then
      new.data := new.data - 'validation';
    end if;
    return new;
  end if;
  -- UPDATE (souverain seul, par la politique) : seule la décision change.
  new.data := old.data || jsonb_build_object('validation', new.data->'validation');
  if new.data->'validation' is null or jsonb_typeof(new.data->'validation') = 'null' then
    new.data := new.data - 'validation';
  end if;
  return new;
end;
$$;

drop trigger if exists cloture_tient_ses_chiffres on public.clotures_caisse;
create trigger cloture_tient_ses_chiffres before insert or update on public.clotures_caisse
  for each row execute function public.cloture_tient_ses_chiffres();

-- ── LE TEMPS RÉEL ET LA TRACE ──────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pointages') then
    alter publication supabase_realtime add table public.pointages;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clotures_caisse') then
    alter publication supabase_realtime add table public.clotures_caisse;
  end if;
  if exists (select 1 from pg_proc where proname = 'trace_le_geste') then
    drop trigger if exists trace_le_geste on public.pointages;
    create trigger trace_le_geste after insert or update or delete on public.pointages
      for each row execute function public.trace_le_geste();
    drop trigger if exists trace_le_geste on public.clotures_caisse;
    create trigger trace_le_geste after insert or update or delete on public.clotures_caisse
      for each row execute function public.trace_le_geste();
  end if;
end $$;

-- ── LE CONTRÔLE ────────────────────────────────────────────────────
-- Attendu : deux tables prêtes, RLS active sur les deux, 1 + 4 politiques.
select
  t.table_name as table_neuve,
  case when c.relrowsecurity then 'protégée' else 'OUVERTE' end as rls,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = t.table_name) as politiques
from information_schema.tables t
join pg_class c on c.relname = t.table_name and c.relnamespace = 'public'::regnamespace
where t.table_schema = 'public' and t.table_name in ('pointages', 'clotures_caisse')
order by t.table_name;
