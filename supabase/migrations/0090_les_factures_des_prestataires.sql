-- ═══════════════════════════════════════════════════════════════════
-- 0090 — LES FACTURES DES PRESTATAIRES · 13 septembre 2026
--
-- « J'aimerais que les employés du salon me remplissent une facture en
-- tant que prestataire tous les mois » (Yéman).
--
-- UNE FACTURE PORTE UN IFU, UN TÉLÉPHONE, UN E-MAIL ET CE QU'UNE PERSONNE
-- GAGNE. Elle ne se lit donc pas par tout le personnel : chacune lit et
-- écrit LA SIENNE ; la direction (souverain, gérant) lit tout, écrit les
-- prix, accepte ou refuse.
--
-- LA RÈGLE VIT ICI, PAS SEULEMENT À L'ÉCRAN :
--   · lire : la direction, ou l'autrice de la facture ;
--   · créer et modifier : la direction, ou l'autrice, sur SA fiche, tant que
--     la facture est en brouillon, soumise ou refusée, et sans jamais la
--     déclarer acceptée ou refusée elle-même ;
--   · effacer : la direction seule.
--
-- SA FICHE, C'EST L'ADRESSE DE SON COMPTE. `est_ma_fiche()` compare l'e-mail
-- du compte connecté à celui de la fiche du personnel (`compteMail`, sinon
-- `email`), comme « Mon mois ». Sans cette garde, une personne pourrait
-- écrire une facture au nom d'une autre. L'identifiant est imposé
-- (`fp-<mois>-<fiche>`) : personne ne peut occuper la place d'une autre.
--
-- `est_direction()` vient de 0089 (déjà passée).
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.factures_prestataires (
  id         text primary key,
  branch_id  text,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.factures_prestataires enable row level security;

create or replace function public.est_ma_fiche(fiche text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team t
    where t.id = fiche
      and lower(coalesce(nullif(trim(t.data->>'compteMail'), ''), trim(t.data->>'email')))
        = lower(auth.jwt() ->> 'email')
  );
$$;

drop policy if exists facture_lue      on public.factures_prestataires;
drop policy if exists facture_creee    on public.factures_prestataires;
drop policy if exists facture_modifiee on public.factures_prestataires;
drop policy if exists facture_effacee  on public.factures_prestataires;

create policy facture_lue on public.factures_prestataires for select to authenticated
  using (
    public.est_direction()
    or (data->>'auteurId' = (auth.uid())::text and public.est_ma_fiche(data->>'staffId'))
  );

create policy facture_creee on public.factures_prestataires for insert to authenticated
  with check (
    public.est_direction()
    or (public.is_staff()
        and id = 'fp-' || (data->>'mois') || '-' || (data->>'staffId')
        and data->>'auteurId' = (auth.uid())::text
        and public.est_ma_fiche(data->>'staffId')
        and data->>'etat' in ('brouillon', 'soumise'))
  );

create policy facture_modifiee on public.factures_prestataires for update to authenticated
  using (
    public.est_direction()
    or (data->>'auteurId' = (auth.uid())::text
        and public.est_ma_fiche(data->>'staffId')
        and data->>'etat' in ('brouillon', 'soumise', 'refusee'))
  )
  with check (
    public.est_direction()
    or (public.is_staff()
        and id = 'fp-' || (data->>'mois') || '-' || (data->>'staffId')
        and data->>'auteurId' = (auth.uid())::text
        and public.est_ma_fiche(data->>'staffId')
        and data->>'etat' in ('brouillon', 'soumise'))
  );

create policy facture_effacee on public.factures_prestataires for delete to authenticated
  using (public.est_direction());

drop trigger if exists factures_prestataires_touch on public.factures_prestataires;

create trigger factures_prestataires_touch before update on public.factures_prestataires
  for each row execute function public.touch_updated_at();

-- LE FIL EN DIRECT (leçon de 0087) : une facture soumise doit paraître tout
-- de suite dans la paie, et une facture acceptée dans « Mon mois ».
do $$
begin
  alter publication supabase_realtime add table public.factures_prestataires;
exception when duplicate_object then null;
end $$;
