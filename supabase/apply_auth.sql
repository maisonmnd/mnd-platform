-- =====================================================================
-- Maison MND — Authentification & personnel (à coller dans SQL Editor → Run).
-- Identique à migrations/0003_auth.sql. Idempotent.
--
-- Modèle : chaque membre du personnel = une ligne `staff` liée à `auth.users`,
-- avec un rôle (souverain / gérant / maître) et les rubriques ERP accessibles ;
-- ses branches dans `staff_branches`. Le souverain voit toutes les branches.
-- =====================================================================

create table if not exists public.staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  name       text,
  role       text not null default 'maitre',   -- souverain | gerant | maitre
  rubrics    text[] not null default '{}',      -- pilotage, clients, vente, finances, equipe, academie, systeme
  created_at timestamptz not null default now()
);

create table if not exists public.staff_branches (
  user_id   uuid references auth.users(id) on delete cascade,
  branch_id text not null,
  primary key (user_id, branch_id)
);

-- ---------- Helpers RLS (pour le durcissement à venir) ----------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid());
$$;

-- SECURITY DEFINER : lit `staff` en contournant la RLS, ce qui évite la
-- récursion infinie quand une politique DE `staff` doit tester le rôle.
create or replace function public.is_souverain() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff where user_id = auth.uid() and role = 'souverain');
$$;

create or replace function public.has_rubric(rubric text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff
    where user_id = auth.uid() and (role = 'souverain' or rubric = any(rubrics))
  );
$$;

create or replace function public.can_see_branch(b text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff s
    left join public.staff_branches sb on sb.user_id = s.user_id
    where s.user_id = auth.uid()
      and (s.role = 'souverain' or sb.branch_id = b)
  );
$$;

-- ---------- Amorçage du fondateur ----------
-- Le tout premier compte devient « souverain » avec toutes les rubriques.
-- Appelé par l'app juste après l'inscription initiale ; no-op ensuite.
create or replace function public.provision_first_staff(display_name text)
returns text language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.staff) = 0 then
    insert into public.staff(user_id, name, role, rubrics)
    values (auth.uid(), coalesce(nullif(display_name, ''), 'Fondateur'), 'souverain',
      array['pilotage','clients','vente','finances','equipe','academie','systeme']);
    insert into public.staff_branches(user_id, branch_id)
      select auth.uid(), b.id from public.branches b
      on conflict do nothing;
    return 'founder';
  end if;
  return 'exists';
end $$;
grant execute on function public.provision_first_staff(text) to authenticated;

-- ---------- RLS ----------
-- `staff` : chacun lit/écrit sa propre ligne ; le souverain lit tout le personnel.
-- `staff_branches` : idem. (Politiques prudentes dès maintenant — l'auth est réelle
--  ici, contrairement aux tables de données encore en dev-permissif.)
alter table public.staff enable row level security;
alter table public.staff_branches enable row level security;

drop policy if exists staff_self_read on public.staff;
create policy staff_self_read on public.staff for select to authenticated
  using (user_id = auth.uid() or public.is_souverain());

-- ÉCRITURE DIRECTE RÉSERVÉE AU SOUVERAIN — 24 août 2026. `for all` avec un CHECK
-- qui ne validait que `user_id` laissait tout compte authentifié s'inscrire en
-- souverain (voir migrations/0073). Le fondateur et l'autorisation passent par
-- les RPC SECURITY DEFINER (provision_first_staff, authorize_staff), qui
-- contournent la RLS : aucune écriture directe n'est nécessaire au flux.
drop policy if exists staff_self_write on public.staff;
drop policy if exists staff_admin_write on public.staff;
create policy staff_admin_write on public.staff for all to authenticated
  using (public.is_souverain())
  with check (public.is_souverain());

drop policy if exists staffb_self_read on public.staff_branches;
create policy staffb_self_read on public.staff_branches for select to authenticated
  using (user_id = auth.uid() or public.is_souverain());

drop policy if exists staffb_self_write on public.staff_branches;
drop policy if exists staffb_admin_write on public.staff_branches;
create policy staffb_admin_write on public.staff_branches for all to authenticated
  using (public.is_souverain())
  with check (public.is_souverain());

-- Filet en plus de la policy : refuse toute écriture de `staff` par un
-- non-souverain, même si une migration future rouvrait l'écriture directe.
-- Laisse passer l'amorçage (table vide → fondateur) et le souverain.
create or replace function public.staff_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.staff) = 0 then return new; end if;
  if public.is_souverain() then return new; end if;
  raise exception 'Écriture de la table staff réservée au souverain.';
end $$;

drop trigger if exists staff_guard_biu on public.staff;
create trigger staff_guard_biu
  before insert or update on public.staff
  for each row execute function public.staff_guard();
