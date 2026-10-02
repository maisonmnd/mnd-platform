-- ═══════════════════════════════════════════════════════════════════
-- 0112 — LES CARTES CADEAUX (à coller dans Supabase → SQL Editor).
--        2 octobre 2026, maquette « La carte cadeau en ligne » validée.
--        UN SEUL TEMPS.
--
-- « Sur le site j'aimerais brancher KkiaPay pour offrir les cartes
-- cadeaux » (Yéman). Le site dépose une COMMANDE à régler ; KkiaPay
-- encaisse ; la fonction `kkiapay-verify` (ou son filet `kkiapay-webhook`)
-- relit le montant SUR CETTE LIGNE, contrôle le paiement, tire le code et
-- pose l'avoir. Le Trône lit le registre et rattache la carte à la fiche
-- de la bénéficiaire à sa première visite.
--
-- ① LE DÉPÔT EST OUVERT, MAIS ÉTROIT. Un visiteur ne dépose qu'une commande
--   « à régler », SANS code, sans paiement, sans avoir, et pour un montant
--   entre 5 000 et 500 000 F. Il ne relit RIEN : un registre de cartes
--   lisible serait une liste de codes à dépenser offerte au premier venu.
-- ② LE PERSONNEL lit et tient le registre.
-- ③ CE QUI A ÉTÉ PAYÉ RESTE CE QUI A ÉTÉ PAYÉ : une fois posés, le montant,
--   la transaction, la date, la caisse et l'avoir ne se réécrivent plus
--   depuis un écran (le déclencheur restaure, comme en 0093). Le serveur
--   (`auth.uid()` vide) garde la main.
-- ④ UN CODE N'EXISTE QU'UNE FOIS.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.cartes_cadeaux (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.cartes_cadeaux enable row level security;

-- ④
create unique index if not exists cartes_cadeaux_code_unique
  on public.cartes_cadeaux ((data->>'code')) where data->>'code' is not null;

drop policy if exists dev_all on public.cartes_cadeaux;
drop policy if exists cc_depot on public.cartes_cadeaux;
drop policy if exists cc_maison on public.cartes_cadeaux;

-- ①
create policy cc_depot on public.cartes_cadeaux for insert to anon, authenticated
  with check (
    data->>'statut' = 'a-regler'
    and data->>'code' is null
    and data->>'transactionId' is null
    and data->>'payeLe' is null
    and data->>'creditId' is null
    and data->>'clientId' is null
    and data->>'objet' in ('montant', 'geste')
    and (
      data->>'objet' = 'geste'
      or (jsonb_typeof(data->'montantXof') = 'number'
          and (data->>'montantXof')::numeric between 5000 and 500000)
    )
  );

-- ②
create policy cc_maison on public.cartes_cadeaux for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- ③
create or replace function public.carte_cadeau_tient_son_paiement() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fige text;
begin
  if auth.uid() is null then return new; end if;
  foreach fige in array array['montantXof', 'transactionId', 'payeLe', 'cashbox', 'methode', 'creditId'] loop
    if (old.data ? fige) and (old.data->>'statut') <> 'a-regler' then
      new.data := jsonb_set(new.data, array[fige], old.data -> fige, true);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists carte_cadeau_tient_son_paiement on public.cartes_cadeaux;
create trigger carte_cadeau_tient_son_paiement
  before update on public.cartes_cadeaux
  for each row execute function public.carte_cadeau_tient_son_paiement();

-- L'horodatage, le direct, la trace : comme les autres tables (0099).
drop trigger if exists cartes_cadeaux_touch on public.cartes_cadeaux;
create trigger cartes_cadeaux_touch before update on public.cartes_cadeaux
  for each row execute function public.touch_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cartes_cadeaux'
  ) then
    alter publication supabase_realtime add table public.cartes_cadeaux;
  end if;
  if exists (select 1 from pg_proc where proname = 'trace_le_geste') then
    drop trigger if exists trace_le_geste on public.cartes_cadeaux;
    create trigger trace_le_geste after insert or update or delete on public.cartes_cadeaux
      for each row execute function public.trace_le_geste();
  end if;
end $$;

-- ── CONTRÔLE, en lignes de résultat ────────────────────────────────
select 'table' as quoi, tablename as nom from pg_tables
where schemaname = 'public' and tablename = 'cartes_cadeaux'
union all
select 'protection', case when relrowsecurity then 'RLS active' else 'RLS ABSENTE' end
from pg_class where oid = 'public.cartes_cadeaux'::regclass
union all
select 'politique', policyname from pg_policies
where schemaname = 'public' and tablename = 'cartes_cadeaux'
union all
select 'direct', tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'cartes_cadeaux';
