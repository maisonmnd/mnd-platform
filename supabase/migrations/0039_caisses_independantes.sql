-- ═══════════════════════════════════════════════════════════════════
-- 0039 — LES CAISSES INDÉPENDANTES DEVIENNENT UN REGISTRE
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- 0038 posait DEUX caisses écrites en dur — Succession et Devises. Une
-- limite arbitraire : une maison peut tenir une caisse par héritage, par
-- projet, par personne. Une caisse se crée désormais, se nomme, porte sa
-- devise, et emporte son registre.
--
--   caisses_indep             — la définition (nom, devise, à quoi elle sert)
--   caisses_indep_mouvements  — les entrées / sorties, rattachées par caisseId
--
-- CE QUI NE CHANGE PAS : réservé au SOUVERAIN, et ces caisses ne participent
-- à AUCUN calcul MND. L'étanchéité reste structurelle.
--
-- LA REPRISE EST INCLUSE ET IDEMPOTENTE : ce qui aurait déjà été saisi dans
-- `caisse_succession` et `caisse_devises` est repris ici, avec des
-- identifiants déterministes (`cxi-…`, `cxim-…`). Une caisse « Devises » qui
-- portait plusieurs monnaies se scinde en UNE CAISSE PAR DEVISE — c'est plus
-- juste : un solde ne se compte que dans sa propre monnaie.
--
-- LES DEUX ANCIENNES TABLES NE SONT PAS SUPPRIMÉES : elles sont le retour en
-- arrière, comme les `repli_0023_`. Les vider viendra plus tard, à froid.
--
-- ⚠ À PASSER AVANT LA PROCHAINE PUBLICATION : Le Trône se lie aux deux
--   nouvelles tables — sans elles, la pastille de synchro vire au rouge.
-- ═══════════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['caisses_indep', 'caisses_indep_mouvements'] loop
    execute format('
      create table if not exists public.%I (
        id         text primary key,
        branch_id  text,
        data       jsonb not null,
        updated_at timestamptz not null default now()
      )', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists souverain_all on public.%I', t);
    execute format('
      create policy souverain_all on public.%I for all to authenticated
        using (public.is_souverain()) with check (public.is_souverain())', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
    end;
  end loop;
end $$;

-- Index de rattachement : un registre se lit toujours caisse par caisse.
create index if not exists caisses_indep_mvts_caisse_idx
  on public.caisses_indep_mouvements ((data->>'caisseId'));

-- ── LA REPRISE ─────────────────────────────────────────────────────────────
-- ① Une caisse « Succession » par branche qui en portait des mouvements.
insert into public.caisses_indep (id, branch_id, data)
select distinct
       'cxi-' || s.branch_id || '-succession',
       s.branch_id,
       jsonb_build_object(
         'id', 'cxi-' || s.branch_id || '-succession',
         'branchId', s.branch_id,
         'nom', 'Succession',
         'dit', 'Registre autonome — hors de tout total MND.',
         'ordre', 1
       )
from public.caisse_succession s
where s.branch_id is not null
on conflict (id) do nothing;

-- ② Une caisse PAR DEVISE réellement mouvementée.
insert into public.caisses_indep (id, branch_id, data)
select distinct
       'cxi-' || d.branch_id || '-' || lower(d.data->>'devise'),
       d.branch_id,
       jsonb_build_object(
         'id', 'cxi-' || d.branch_id || '-' || lower(d.data->>'devise'),
         'branchId', d.branch_id,
         'nom', 'Devises · ' || (d.data->>'devise'),
         'devise', d.data->>'devise',
         'dit', 'Billets étrangers — le solde se compte dans sa monnaie.',
         'ordre', 2
       )
from public.caisse_devises d
where d.branch_id is not null and coalesce(d.data->>'devise','') <> ''
on conflict (id) do nothing;

-- ③ Les mouvements de Succession.
insert into public.caisses_indep_mouvements (id, branch_id, data)
select 'cxim-' || s.id, s.branch_id,
       jsonb_build_object(
         'id', 'cxim-' || s.id,
         'branchId', s.branch_id,
         'caisseId', 'cxi-' || s.branch_id || '-succession',
         'date', s.data->>'date',
         'sens', s.data->>'sens',
         'label', coalesce(s.data->>'label', 'Mouvement'),
         'montant', coalesce((s.data->>'amountXof')::numeric, 0)
       )
from public.caisse_succession s
where s.branch_id is not null
on conflict (id) do nothing;

-- ④ Les mouvements de devises — le taux suit, la contre-valeur reste indicative.
insert into public.caisses_indep_mouvements (id, branch_id, data)
select 'cxim-' || d.id, d.branch_id,
       jsonb_build_object(
         'id', 'cxim-' || d.id,
         'branchId', d.branch_id,
         'caisseId', 'cxi-' || d.branch_id || '-' || lower(d.data->>'devise'),
         'date', d.data->>'date',
         'sens', d.data->>'sens',
         'label', coalesce(d.data->>'label', 'Mouvement'),
         'montant', coalesce((d.data->>'montantDevise')::numeric, 0),
         'taux', coalesce((d.data->>'taux')::numeric, 0)
       )
from public.caisse_devises d
where d.branch_id is not null and coalesce(d.data->>'devise','') <> ''
on conflict (id) do nothing;

-- Contrôle : ce qui existait est repris, au nombre près.
select 'caisses créées'            as quoi, count(*)::text as valeur from public.caisses_indep
union all
select 'mouvements repris',              count(*)::text from public.caisses_indep_mouvements
union all
select 'ancienne caisse_succession',     count(*)::text from public.caisse_succession
union all
select 'ancienne caisse_devises',        count(*)::text from public.caisse_devises;
