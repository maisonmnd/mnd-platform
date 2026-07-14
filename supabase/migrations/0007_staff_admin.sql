-- =====================================================================
-- Maison MND — Administration du personnel (écran « Accès & personnel »).
-- ---------------------------------------------------------------------
-- Fonctions SECURITY DEFINER permettant au SOUVERAIN, depuis Le Trône :
--   • lister les comptes connectés pas encore rattachés au personnel,
--   • autoriser un compte (le rattacher, avec un rôle),
--   • révoquer un accès.
-- Elles lisent `auth.users` (interdit au client ordinaire) mais se gardent
-- elles-mêmes : tout est refusé si l'appelant n'est pas souverain.
-- Idempotent.  (= migrations/0007_staff_admin.sql)
-- =====================================================================

-- Rubriques par défaut selon le rôle (le souverain a tout).
create or replace function public.default_rubrics(p_role text) returns text[]
language sql immutable as $$
  select case p_role
    when 'souverain' then array['pilotage','clients','vente','finances','equipe','academie','systeme']
    when 'gerant'    then array['pilotage','clients','vente','finances','equipe','academie']
    else array['clients','vente']            -- maitre
  end;
$$;

-- Comptes connectés NON encore rattachés au personnel (souverain uniquement).
create or replace function public.list_pending_staff()
returns table(user_id uuid, email text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select u.id, u.email, u.created_at
  from auth.users u
  where public.is_souverain()
    and not exists (select 1 from public.staff s where s.user_id = u.id)
  order by u.created_at desc;
$$;

-- Personnel rattaché, avec e-mail (souverain uniquement).
create or replace function public.list_staff_full()
returns table(user_id uuid, email text, name text, role text, rubrics text[], created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.user_id, u.email, s.name, s.role, s.rubrics, s.created_at
  from public.staff s
  join auth.users u on u.id = s.user_id
  where public.is_souverain()
  order by s.created_at;
$$;

-- Autoriser (rattacher) un compte — rôle imposé, rubriques dérivées du rôle.
create or replace function public.authorize_staff(target uuid, display_name text, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_souverain() then
    raise exception 'Réservé au souverain.';
  end if;
  if new_role not in ('souverain','gerant','maitre') then
    raise exception 'Rôle invalide (souverain | gerant | maitre).';
  end if;
  if not exists (select 1 from auth.users where id = target) then
    raise exception 'Ce compte n''existe pas.';
  end if;
  insert into public.staff(user_id, name, role, rubrics)
  values (target, nullif(display_name, ''), new_role, public.default_rubrics(new_role))
  on conflict (user_id) do update
    set name = coalesce(nullif(excluded.name, ''), public.staff.name),
        role = excluded.role,
        rubrics = excluded.rubrics;
  insert into public.staff_branches(user_id, branch_id)
    select target, b.id from public.branches b
  on conflict do nothing;
end $$;

-- Révoquer l'accès — protège l'appelant et le dernier souverain.
create or replace function public.revoke_staff(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_souverain() then
    raise exception 'Réservé au souverain.';
  end if;
  if target = auth.uid() then
    raise exception 'Vous ne pouvez pas retirer votre propre accès.';
  end if;
  if (select role from public.staff where user_id = target) = 'souverain'
     and (select count(*) from public.staff where role = 'souverain') <= 1 then
    raise exception 'Impossible de retirer le dernier souverain.';
  end if;
  delete from public.staff_branches where user_id = target;
  delete from public.staff where user_id = target;
end $$;

-- Exécution réservée aux sessions authentifiées (la garde interne fait le reste).
grant execute on function public.list_pending_staff()               to authenticated;
grant execute on function public.list_staff_full()                  to authenticated;
grant execute on function public.authorize_staff(uuid, text, text)  to authenticated;
grant execute on function public.revoke_staff(uuid)                 to authenticated;
