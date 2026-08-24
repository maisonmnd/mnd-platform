-- =====================================================================
-- Maison MND — Fermer l'écriture directe de la table `staff` (à coller dans
-- SQL Editor → Run). À APPLIQUER UNE FOIS en production.
--
-- LA FAILLE (audit du 24 août 2026). La policy `staff_self_write` de 0003_auth
-- autorisait `for all to authenticated` avec `check (user_id = auth.uid() or
-- is_souverain())` : le CHECK ne validait QUE `user_id`, jamais `role` ni
-- `rubrics`. N'importe quel compte authentifié (une cliente Ma Couronne inscrite
-- par e-mail ou Google sur le MÊME projet), avec la seule clé anon du bundle
-- public, pouvait INSÉRER sa propre ligne `staff` en `role = 'souverain'` avec
-- toutes les rubriques — le CHECK passait. Escalade de privilège totale :
-- lecture/écriture de clients, factures, paie, coffre, et `sauvegarde_maison()`.
-- Idem `staffb_self_write` pour s'attribuer toutes les branches.
--
-- LE FLUX LÉGITIME N'A JAMAIS EU BESOIN DE CETTE POLICY. L'entrée dans `staff`
-- passe par des fonctions SECURITY DEFINER qui CONTOURNENT la RLS :
--   • provision_first_staff (0003) — le fondateur, seulement si la table est vide ;
--   • authorize_staff / revoke_staff (0007) — gardées `is_souverain()`.
-- On peut donc réserver l'écriture DIRECTE au souverain sans rien casser.
--
-- Idempotent : réexécutable sans dommage.
-- =====================================================================

-- ---------- La lecture reste inchangée (soi-même, ou le souverain voit tout).
-- (staff_self_read / staffb_self_read de 0003 conviennent ; rien à refaire.)

-- ---------- L'écriture DIRECTE devient réservée au souverain ----------
-- Le fondateur et l'autorisation passent par les RPC SECURITY DEFINER, qui ne
-- sont pas soumises à ces policies : aucune écriture directe n'est nécessaire au
-- fonctionnement. Un non-souverain ne peut donc plus s'inscrire lui-même.
drop policy if exists staff_self_write on public.staff;
create policy staff_admin_write on public.staff for all to authenticated
  using (public.is_souverain())
  with check (public.is_souverain());

drop policy if exists staffb_self_write on public.staff_branches;
create policy staffb_admin_write on public.staff_branches for all to authenticated
  using (public.is_souverain())
  with check (public.is_souverain());

-- ---------- Filet en plus de la policy (défense en profondeur) ----------
-- Un déclencheur refuse toute écriture de `staff` par un non-souverain, même si
-- une migration future rouvrait par erreur l'écriture directe. Il LAISSE PASSER
-- deux cas légitimes, pour ne pas casser l'amorçage :
--   • table vide  → c'est le fondateur (provision_first_staff) ;
--   • appelant souverain → il administre (authorize_staff, geste manuel).
-- En BEFORE INSERT/UPDATE, la nouvelle ligne n'est pas encore comptée : `count`
-- reflète l'état AVANT, donc le tout premier insert voit bien 0.
create or replace function public.staff_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.staff) = 0 then
    return new;                    -- amorçage du fondateur
  end if;
  if public.is_souverain() then
    return new;                    -- le souverain administre
  end if;
  raise exception 'Écriture de la table staff réservée au souverain.';
end $$;

drop trigger if exists staff_guard_biu on public.staff;
create trigger staff_guard_biu
  before insert or update on public.staff
  for each row execute function public.staff_guard();

-- NOTE — provision_first_staff (0003) reste ouverte à `authenticated` et
-- s'auto-attribue souverain SI la table est vide. Inerte en régime normal, mais
-- si `staff` était un jour purgée, le prochain appelant deviendrait souverain.
-- Durcissement possible (hors de cette migration) : réserver l'amorçage à un
-- geste hors-ligne (SQL Editor) plutôt qu'à un RPC ouvert.
