-- ═══════════════════════════════════════════════════════════════════
-- 0015 — Trois protections que le navigateur ne peut pas tenir
--        (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- Le Trône est une application statique : tout ce qu'elle vérifie, elle le
-- vérifie chez le visiteur, et un visiteur peut écrire directement à la base
-- avec la clé publique du site. Trois règles de la Maison ne tenaient donc que
-- sur la bonne volonté. Elles passent ici du côté serveur, seul endroit où une
-- règle est réellement une règle.
--
--   ① Une cliente ne peut plus réécrire son propre nombre de locks, son
--      coefficient de prix, ni sa branche. Elle pouvait se poser priceCoef 0,1
--      et la CAISSE elle-même encaissait 5 500 F au lieu de 55 000.
--   ② Un avoir ne peut plus être dépensé deux fois. Deux comptoirs qui
--      consommaient le même crédit dans la même minute écrivaient chacun leur
--      usage : 150 000 F de crédit réglaient 300 000 F de prestations, et le
--      solde affiché restait à 0, parfaitement rassurant.
--   ③ Toute modification d'une facture PAYÉE laisse désormais une trace datée.
--      Prix, quantités, remises, date, statut : tout était réinscriptible sans
--      qu'aucun écran ne puisse le détecter après coup.
--
-- Aucune de ces protections ne bloque le personnel dans son travail normal :
-- ① ne s'applique qu'aux non-membres du personnel, ② refuse une écriture qui
-- créait de l'argent, ③ n'interdit rien — elle enregistre.
-- ═══════════════════════════════════════════════════════════════════

-- ── ① La cliente ne réécrit pas ses propres paramètres de prix ─────
create or replace function public.clients_protege_tarif()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Le personnel garde la main : c'est lui qui compte les locks au fauteuil.
  if public.is_staff() then return new; end if;

  -- Pour tout autre écrivain, les trois champs sensibles sont réimposés depuis
  -- la ligne existante. On les retire d'abord, puis on remet ceux qui étaient
  -- réellement présents (jsonb_strip_nulls écarte les champs absents).
  new.data := (new.data - 'lockCount' - 'priceCoef')
              || jsonb_strip_nulls(jsonb_build_object(
                   'lockCount', old.data -> 'lockCount',
                   'priceCoef', old.data -> 'priceCoef'));
  new.branch_id := old.branch_id;
  return new;
end $$;

drop trigger if exists clients_protege_tarif on public.clients;
create trigger clients_protege_tarif
  before update on public.clients
  for each row execute function public.clients_protege_tarif();

-- ── ② Un avoir ne se dépense qu'une fois ──────────────────────────
create or replace function public.avoir_solde_suffisant()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  solde bigint;
  demande bigint;
begin
  if coalesce(new.data ->> 'kind', '') <> 'usage' then return new; end if;
  demande := coalesce((new.data ->> 'amountXof')::bigint, 0);
  if demande <= 0 then return new; end if;

  -- Solde du porteur, calculé À CET INSTANT et côté serveur : c'est ce que le
  -- navigateur ne pouvait pas faire, puisqu'il lisait sa copie locale.
  select coalesce(sum(
           case m.data ->> 'kind'
             when 'depot' then  (m.data ->> 'amountXof')::bigint
             else              -(m.data ->> 'amountXof')::bigint
           end), 0)
    into solde
  from public.credit_movements m
  where m.data ->> 'holderType' = new.data ->> 'holderType'
    and m.data ->> 'holderId'   = new.data ->> 'holderId'
    and m.id <> new.id;

  if demande > solde then
    raise exception
      'Avoir insuffisant : le solde de ce compte est de % F, l''écriture en demande % F.',
      solde, demande;
  end if;
  return new;
end $$;

drop trigger if exists avoir_solde_suffisant on public.credit_movements;
create trigger avoir_solde_suffisant
  before insert or update on public.credit_movements
  for each row execute function public.avoir_solde_suffisant();

-- ── ③ Une facture payée ne se modifie plus sans laisser de trace ──
create table if not exists public.invoice_audit (
  id bigserial primary key,
  invoice_id text not null,
  branch_id text,
  numero text,
  auteur uuid,
  fait_le timestamptz not null default now(),
  avant jsonb not null,
  apres jsonb not null
);
create index if not exists invoice_audit_invoice_idx on public.invoice_audit (invoice_id);

alter table public.invoice_audit enable row level security;
drop policy if exists staff_read on public.invoice_audit;
create policy staff_read on public.invoice_audit for select to authenticated
  using (public.is_staff());
-- Personne n'écrit ce journal à la main : seul le déclencheur y touche.

create or replace function public.invoice_trace_modif()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (old.data ->> 'status') = 'payée' and new.data is distinct from old.data then
    insert into public.invoice_audit (invoice_id, branch_id, numero, auteur, avant, apres)
    values (old.id, old.branch_id, old.data ->> 'number', auth.uid(), old.data, new.data);
  end if;
  return new;
end $$;

drop trigger if exists invoice_trace_modif on public.invoices;
create trigger invoice_trace_modif
  before update on public.invoices
  for each row execute function public.invoice_trace_modif();

-- ── Vérification ──────────────────────────────────────────────────
select tgname as declencheur, c.relname as sur_table
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and tgname in ('clients_protege_tarif', 'avoir_solde_suffisant', 'invoice_trace_modif')
order by 2, 1;
