-- =====================================================================
-- Maison MND — DURCISSEMENT RLS (à coller dans Supabase → SQL Editor → Run).
-- Copie de migrations/0006_rls_prod.sql.
--
-- AVANT DE LANCER — vérifiez que votre compte est bien « personnel » :
--     select count(*) from public.staff;      -- doit être >= 1
--
-- Si c'est 0 (rare), inscrivez votre compte fondateur en remplaçant l'e-mail,
-- puis relancez le script principal :
--
--   insert into public.staff(user_id, name, role, rubrics)
--   select id, 'Fondateur', 'souverain',
--          array['pilotage','clients','vente','finances','equipe','academie','systeme']
--   from auth.users where email = 'VOTRE_EMAIL_ICI'
--   on conflict (user_id) do nothing;
--
--   insert into public.staff_branches(user_id, branch_id)
--   select u.id, b.id from auth.users u cross join public.branches b
--   where u.email = 'VOTRE_EMAIL_ICI'
--   on conflict do nothing;
--
-- ---------------------------------------------------------------------
-- Maison MND — Row-Level Security de PRODUCTION (durcissement).
-- ---------------------------------------------------------------------
-- Remplace les politiques « dev_all » (tout ouvert) par des règles par rôle,
-- en s'appuyant sur le modèle personnel déjà en place (migration 0003_auth) :
--   • is_staff()      → l'utilisateur est un membre du personnel (table staff)
--   • auth.uid()      → l'identifiant Supabase de l'utilisateur connecté
--
-- Rappel du modèle de données : chaque cliente Ma Couronne a un compte Supabase,
-- et sa fiche `clients` porte  id = auth.uid().  Ses rendez-vous / factures /
-- sessions portent  data->>'clientId' = auth.uid().
--
-- RÉSUMÉ DES ACCÈS :
--   Personnel (Trône, connecté)      → tout, en lecture et écriture.
--   Cliente (Ma Couronne, connectée) → SA fiche, SES RDV, SES commandes, SA présence.
--   Public / anonyme                 → catalogue, branches, config publique en
--                                       lecture ; dépôt d'une demande de consultation.
--   Tout le reste (finances, équipe, dossiers…) → personnel uniquement.
--
-- ⚠ PRÉREQUIS : au moins un membre dans public.staff (le fondateur est provisionné
--   au premier login du Trône). Le bloc de garde ci-dessous ARRÊTE le script si la
--   table est vide, pour éviter de vous verrouiller dehors.
--
-- Idempotent : réexécutable sans risque. Réversible : voir rollback_to_dev_rls.sql.
-- =====================================================================

-- ---------- Garde anti-verrouillage ----------
do $$
begin
  if (select count(*) from public.staff) = 0 then
    raise exception
      'RLS non durcie : public.staff est vide. Connectez-vous d''abord au Trône '
      '(le fondateur est provisionné automatiquement), ou insérez votre compte '
      '(voir en-tête de apply_rls_prod.sql), puis relancez.';
  end if;
end $$;

-- is_staff() est défini en 0003 (security definer). On le recrée par sûreté.
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

do $$
declare
  -- Config/référentiel non sensible : lecture publique, écriture personnel.
  public_read text[] := array[
    'branches', 'personas',
    'catalog_categories', 'catalog_services', 'catalog_products'
  ];
  -- Données personnelles/back-office : personnel uniquement.
  staff_only text[] := array[
    'team', 'campaigns', 'plans', 'subscribers',
    'formations', 'apprenants', 'certifications', 'consult_forms',
    'expenses', 'budgets', 'cashboxes', 'expense_categories'
  ];
  -- Appartenant à la cliente via data->>'clientId' : elle voit/écrit les siens ;
  -- le personnel voit/écrit tout.
  owned_by_data text[] := array['appointments', 'invoices', 'client_sessions'];
  t text;
begin
  ----------------------------------------------------------------------
  -- 1) Référentiel public : lecture anon+auth, écriture personnel
  ----------------------------------------------------------------------
  foreach t in array public_read loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all on public.%I;', t);
    execute format('drop policy if exists pub_read on public.%I;', t);
    execute format('drop policy if exists staff_write on public.%I;', t);
    execute format(
      'create policy pub_read on public.%I for select to anon, authenticated using (true);', t);
    execute format(
      'create policy staff_write on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff());', t);
  end loop;

  ----------------------------------------------------------------------
  -- 2) Tables personnel uniquement
  ----------------------------------------------------------------------
  foreach t in array staff_only loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all on public.%I;', t);
    execute format('drop policy if exists staff_all on public.%I;', t);
    execute format(
      'create policy staff_all on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff());', t);
  end loop;

  ----------------------------------------------------------------------
  -- 3) Tables appartenant à la cliente (par data->>'clientId')
  ----------------------------------------------------------------------
  foreach t in array owned_by_data loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists dev_all on public.%I;', t);
    execute format('drop policy if exists own_sel on public.%I;', t);
    execute format('drop policy if exists own_ins on public.%I;', t);
    execute format('drop policy if exists own_upd on public.%I;', t);
    execute format('drop policy if exists own_del on public.%I;', t);
    execute format($p$create policy own_sel on public.%I for select to authenticated
      using (public.is_staff() or data->>'clientId' = (auth.uid())::text);$p$, t);
    execute format($p$create policy own_ins on public.%I for insert to authenticated
      with check (public.is_staff() or data->>'clientId' = (auth.uid())::text);$p$, t);
    execute format($p$create policy own_upd on public.%I for update to authenticated
      using (public.is_staff() or data->>'clientId' = (auth.uid())::text)
      with check (public.is_staff() or data->>'clientId' = (auth.uid())::text);$p$, t);
    execute format($p$create policy own_del on public.%I for delete to authenticated
      using (public.is_staff() or data->>'clientId' = (auth.uid())::text);$p$, t);
  end loop;
end $$;

----------------------------------------------------------------------
-- 4) clients : la cliente possède SA fiche (id = auth.uid()) ; personnel = tout.
--    Suppression réservée au personnel.
----------------------------------------------------------------------
alter table public.clients enable row level security;
drop policy if exists dev_all on public.clients;
drop policy if exists cli_sel on public.clients;
drop policy if exists cli_ins on public.clients;
drop policy if exists cli_upd on public.clients;
drop policy if exists cli_del on public.clients;
create policy cli_sel on public.clients for select to authenticated
  using (public.is_staff() or id = (auth.uid())::text);
create policy cli_ins on public.clients for insert to authenticated
  with check (public.is_staff() or id = (auth.uid())::text);
create policy cli_upd on public.clients for update to authenticated
  using (public.is_staff() or id = (auth.uid())::text)
  with check (public.is_staff() or id = (auth.uid())::text);
create policy cli_del on public.clients for delete to authenticated
  using (public.is_staff());

----------------------------------------------------------------------
-- 5) consultations_queue : dépôt public (tunnel La Consultation), lecture/gestion
--    par le personnel.
----------------------------------------------------------------------
alter table public.consultations_queue enable row level security;
drop policy if exists dev_all on public.consultations_queue;
drop policy if exists cq_submit on public.consultations_queue;
drop policy if exists cq_staff on public.consultations_queue;
create policy cq_submit on public.consultations_queue for insert to anon, authenticated
  with check (true);
create policy cq_staff on public.consultations_queue for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

----------------------------------------------------------------------
-- 6) documents (singletons) : config publique en lecture pour les apps clientes,
--    tout le reste (codes d'accès, avances, dossiers, automatisations…) personnel.
----------------------------------------------------------------------
alter table public.documents enable row level security;
drop policy if exists dev_all on public.documents;
drop policy if exists docs_pub_read on public.documents;
drop policy if exists docs_staff_all on public.documents;
create policy docs_pub_read on public.documents for select to anon, authenticated
  using (key = any(array[
    'mnd_settings', 'mnd_brand', 'mnd_offers', 'mnd_cercle_tiers',
    'mnd_points_rate', 'mnd_crown_styles', 'mnd_couronne_compose', 'mnd_vitrine_config'
  ]));
create policy docs_staff_all on public.documents for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- =====================================================================
-- Fin. Vérifs rapides (facultatif) :
--   select tablename, count(*) from pg_policies where schemaname='public' group by 1 order by 1;
--   select count(*) as staff from public.staff;
-- =====================================================================
