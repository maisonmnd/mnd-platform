-- ═══════════════════════════════════════════════════════════════════════════
-- 0156 · LA CLÔTURE DE GRENAT — 4 novembre 2026
--
-- « Tous les jours à 15 h et à 19 h, qu'Opale clôture toutes les factures,
-- qu'elles soient terminées, envoyées aux clients, et qu'on puisse faire la
-- caisse du jour. Crée un système clair où il n'y a pas d'erreur sur les RDV
-- et sur les factures » (Yéman). Maquette 9KCMgAb1qksSVcEXDiKaHE validée
-- (« construis ») : c'est GRENAT (le professionnel de l'argent, au registre
-- `assistants` depuis 0151) qui porte la clôture ; la règle vit dans
-- src/shared/cloture-du-jour-pur.ts, recopiée dans la fonction
-- `cloture-du-jour`.
--
--   1. `clotures_de_grenat` : le compte rendu de chaque passage (15 h, 19 h,
--      le mot du matin), écrit par la fonction seule (clé service). Le
--      personnel le lit : l'écran « La journée » dit le dernier passage.
--   2. `cloture_decisions` : ce que la DIRECTION tranche (une pièce payée
--      effacée, un constat à revoir). Lue par le personnel, écrite par le
--      souverain seul ; rien ne s'efface.
--   3. LA GARDE : une facture PAYÉE ne s'efface que par la direction
--      (souverain : Yéman ou Brice). Un compte du personnel qui n'est pas
--      souverain est refusé en base, quel que soit l'écran. Le rôle de
--      service et la console passent : la trace (0092) les signe, et Grenat
--      signale tout effacement d'une pièce payée.
--   4. `efface_la_piece_payee(id, motif)` : le geste de la direction depuis
--      Factures. Le motif est OBLIGATOIRE ; il s'écrit sur la pièce juste
--      avant l'effacement, dans la même transaction : la trace « efface » le
--      porte donc dans `avant`, et Grenat le lit.
--   5. Les crons : chaque heure du salon de 8 h à 23 h (7 h à 22 h UTC), la
--      fonction ne travaille qu'aux heures réglées (`mnd_settings.cloture.
--      heures`, défaut 15 et 19 : 14 h et 18 h UTC) ; et le mot du matin à
--      5 h 45 UTC (6 h 45 à Cotonou), qui relit la veille entière pour le
--      Conseil de Saphir (7 h) : un rendez-vous fini après 19 h s'y relit.
--
-- Rejouable : `if not exists`, `create or replace`, `drop … if exists`.
-- `is_staff()` et `is_souverain()` viennent de 0003 ; `touch_updated_at()`
-- de 0001 ; `appelle_fonction_edge(nom, corps)` de 0069.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. LE COMPTE RENDU DE GRENAT ──────────────────────────────────────
create table if not exists public.clotures_de_grenat (
  id         text primary key,                 -- « <branche>|<jour>|<moment> »
  branch_id  text,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.clotures_de_grenat enable row level security;
create index if not exists clotures_de_grenat_jour_idx on public.clotures_de_grenat ((data ->> 'jour'));

drop trigger if exists clotures_de_grenat_touch on public.clotures_de_grenat;
create trigger clotures_de_grenat_touch before update on public.clotures_de_grenat
  for each row execute function public.touch_updated_at();

drop policy if exists clotures_de_grenat_lire on public.clotures_de_grenat;
create policy clotures_de_grenat_lire on public.clotures_de_grenat for select to authenticated
  using (public.is_staff());
-- Aucune écriture par la clé publique : la fonction `cloture-du-jour` écrit.
revoke insert, update, delete, truncate on public.clotures_de_grenat from anon, authenticated;


-- ── 2. CE QUE LA DIRECTION TRANCHE ────────────────────────────────────
create table if not exists public.cloture_decisions (
  id         text primary key,                 -- « <branche>|<clé du constat> »
  branch_id  text,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.cloture_decisions enable row level security;

drop trigger if exists cloture_decisions_touch on public.cloture_decisions;
create trigger cloture_decisions_touch before update on public.cloture_decisions
  for each row execute function public.touch_updated_at();

drop policy if exists cloture_decisions_lire on public.cloture_decisions;
create policy cloture_decisions_lire on public.cloture_decisions for select to authenticated
  using (public.is_staff());
drop policy if exists cloture_decisions_ecrire on public.cloture_decisions;
create policy cloture_decisions_ecrire on public.cloture_decisions for insert to authenticated
  with check (public.is_souverain());
drop policy if exists cloture_decisions_reprendre on public.cloture_decisions;
create policy cloture_decisions_reprendre on public.cloture_decisions for update to authenticated
  using (public.is_souverain()) with check (public.is_souverain());
-- Pas de politique de suppression : une décision ne s'efface pas.
revoke delete, truncate on public.cloture_decisions from anon, authenticated;

-- Les décisions et les comptes rendus arrivent sur les postes ouverts.
do $$
declare
  t text;
begin
  foreach t in array array['clotures_de_grenat', 'cloture_decisions'] loop
    if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
       and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ── 3. LA GARDE : UNE FACTURE PAYÉE NE S'EFFACE QUE PAR LA DIRECTION ──
-- Payée : elle se dit « payée », ou un versement de plus de zéro y est entré.
create or replace function public.piece_a_de_l_argent(d jsonb) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(d ->> 'status', '') = 'payée'
      or exists (
        select 1
          from jsonb_array_elements(case when jsonb_typeof(d -> 'payments') = 'array' then d -> 'payments' else '[]'::jsonb end) v
         where case when (v ->> 'amountXof') ~ '^-?[0-9]+(\.[0-9]+)?$' then (v ->> 'amountXof')::numeric else 0 end > 0
      );
$$;

create or replace function public.garde_des_pieces_payees() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Un compte du personnel qui n'est pas souverain : refusé. Le message dit la
  -- règle ; il n'emploie pas « permission denied », que le Trône lirait comme
  -- une table hors de portée (sync.ts, estRefusDeDroit).
  if public.piece_a_de_l_argent(old.data) and public.is_staff() and not public.is_souverain() then
    raise exception 'PIECE_PAYEE : une facture payée ne s’efface que par la direction, avec un motif écrit (%)',
      coalesce(old.data ->> 'number', old.id)
      using errcode = 'P0001';
  end if;
  return old;
end $$;

drop trigger if exists garde_des_pieces_payees on public.invoices;
create trigger garde_des_pieces_payees
  before delete on public.invoices
  for each row execute function public.garde_des_pieces_payees();


-- ── 4. LE GESTE DE LA DIRECTION : EFFACER AVEC SON MOTIF ──────────────
create or replace function public.efface_la_piece_payee(p_id text, p_motif text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_data jsonb;
  v_nom  text;
begin
  if not public.is_souverain() then
    raise exception 'PIECE_PAYEE : la direction seule efface une facture payée' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_motif, ''))) < 3 then
    raise exception 'PIECE_PAYEE : le motif est obligatoire' using errcode = 'P0001';
  end if;
  select data into v_data from public.invoices where id = p_id for update;
  if v_data is null then
    return jsonb_build_object('ok', false, 'motif', 'introuvable');
  end if;
  select coalesce(nullif(trim(name), ''), 'La direction') into v_nom from public.staff where user_id = auth.uid() limit 1;
  -- Le motif sur la pièce, puis l'effacement : la trace « efface » le porte.
  update public.invoices
     set data = v_data || jsonb_build_object('effacement', jsonb_build_object(
           'motif', left(trim(p_motif), 300), 'par', coalesce(v_nom, 'La direction'), 'le', now()))
   where id = p_id;
  delete from public.invoices where id = p_id;
  return jsonb_build_object('ok', true, 'numero', v_data ->> 'number');
end $$;
revoke execute on function public.efface_la_piece_payee(text, text) from public, anon;
grant execute on function public.efface_la_piece_payee(text, text) to authenticated;


-- ── 5. LES PASSAGES DE GRENAT ─────────────────────────────────────────
select cron.unschedule(jobid) from cron.job
 where jobname in ('cloture-de-grenat', 'cloture-de-grenat-matin');

-- Chaque heure de 8 h à 23 h à Cotonou : la fonction ne travaille qu'aux
-- heures réglées (15 h et 19 h par défaut), une fois par heure et par jour.
select cron.schedule('cloture-de-grenat', '0 7-22 * * *',
  $$select public.appelle_fonction_edge('cloture-du-jour', '{"source":"cron"}'::jsonb);$$);
-- 5 h 45 UTC = 6 h 45 à Cotonou : la veille relue pour le Conseil de 7 h.
select cron.schedule('cloture-de-grenat-matin', '45 5 * * *',
  $$select public.appelle_fonction_edge('cloture-du-jour', '{"source":"cron","moment":"matin"}'::jsonb);$$);


-- ── Contrôle ──────────────────────────────────────────────────────────
select c.relname, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('clotures_de_grenat', 'cloture_decisions');
select tgname from pg_trigger where tgrelid = 'public.invoices'::regclass and tgname = 'garde_des_pieces_payees';
select jobname, schedule, active from cron.job where jobname in ('cloture-de-grenat', 'cloture-de-grenat-matin');

-- ══ ESSAI À BLANC (5 novembre 2026) : tout est ANNULÉ par l'exception finale. ══
do $essai$
declare r text := ''; n int; id_piece text;
begin
  select count(*) into n from public.clotures_de_grenat; r := r || 'comptes rendus: ' || n || '; ';
  select count(*) into n from public.cloture_decisions; r := r || 'decisions: ' || n || '; ';
  select count(*) into n from cron.job where jobname like 'cloture-de-grenat%'; r := r || 'crons: ' || n || '; ';
  update public.invoices set data = data where id = 'inv-6leeyad2x3'; r := r || 'ecriture d une piece payee: passe; ';
  update public.appointments set data = data where id = '9jq84t6z4t'; r := r || 'ecriture d un rdv: passe; ';
  select id into id_piece from public.invoices where data->>'status' = 'payée' order by updated_at desc limit 1;
  begin
    delete from public.invoices where id = id_piece; r := r || 'effacement par le serveur: passe; ';
  exception when others then r := r || 'effacement par le serveur: refuse (' || left(sqlerrm, 60) || '); ';
  end;
  raise exception 'ESSAI_0156_A_BLANC: %', r;
end $essai$;
