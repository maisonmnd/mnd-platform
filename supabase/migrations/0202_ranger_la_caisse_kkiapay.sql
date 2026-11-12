-- RANGER LA CAISSE KKIAPAY (12 novembre 2026, choix de Y. au sélecteur).
-- Des lignes d'avant octobre étaient rangées dans la caisse KkiaPay, qui ne
-- reçoit que des paiements KkiaPay et ne paie rien :
--   - les versements en espèces (avril-septembre 2026) vont dans « Real Money » ;
--   - le versement MTN MoMo du 1er septembre 2026 va dans « ACIA1 » ;
--   - la dépense du 13 septembre 2026 passe sur « Real Money » ;
--   - les six factures liées à ces versements prennent la même caisse.
-- Seuls bougent les versements qui portent la caisse KkiaPay : la copie d'un
-- même versement notée « Avoir », sans caisse, sur sa facture n'est pas
-- touchée. Deux factures sans versement gardent leur caisse (moyen inconnu).
-- Copie de sauvegarde d'abord (repli_, RLS posée, aucune lecture publique).

create table if not exists public.repli_caisse_kkiapay_20261112 as
  select 'invoices'::text as t, i.id::text as id, i.data, now() as copie_le
    from public.invoices i
   where i.id in ('inv-syjqdem0p8', 'inv-wxmlb74rwz', 'inv-6la2fpbgry', 'inv-hn611y9m58', 'inv-dc8cnc9203', 'inv-fwyfi6qwyb', 'inv-fzc4gnksaq')
      or exists (select 1 from jsonb_array_elements(coalesce(i.data->'payments', '[]')) x
                  where x->>'cashbox' = 'KkiaPay' and coalesce(x->>'method', '') !~* '^kkiapay' and coalesce(x->>'date', '') < '2026-10-01')
  union all
  select 'appointments', a.id::text, a.data, now()
    from public.appointments a
   where exists (select 1 from jsonb_array_elements(coalesce(a.data->'payments', '[]')) x
                  where x->>'cashbox' = 'KkiaPay' and coalesce(x->>'method', '') !~* '^kkiapay' and coalesce(x->>'date', '') < '2026-10-01')
  union all
  select 'expenses', e.id::text, e.data, now()
    from public.expenses e
   where e.id = 'zzmqg4czzc';
alter table public.repli_caisse_kkiapay_20261112 enable row level security;

-- La caisse de chaque versement mal rangé : espèces → Real Money, MTN MoMo → ACIA1.
create or replace function pg_temp.caisse_rangee(x jsonb) returns jsonb language sql immutable as $$
  select case
    when x->>'cashbox' = 'KkiaPay' and coalesce(x->>'date', '') < '2026-10-01' and coalesce(x->>'method', '') ~* 'esp[eè]ces|cash|liquide'
      then x || jsonb_build_object('cashbox', 'Real Money')
    when x->>'cashbox' = 'KkiaPay' and coalesce(x->>'date', '') < '2026-10-01' and coalesce(x->>'method', '') ~* 'mtn|momo'
      then x || jsonb_build_object('cashbox', 'ACIA1')
    else x end
$$;

update public.invoices i
   set data = jsonb_set(i.data, '{payments}', (
         select coalesce(jsonb_agg(pg_temp.caisse_rangee(x) order by o), '[]'::jsonb)
           from jsonb_array_elements(i.data->'payments') with ordinality as v(x, o)))
 where exists (select 1 from jsonb_array_elements(coalesce(i.data->'payments', '[]')) x
                where x->>'cashbox' = 'KkiaPay' and coalesce(x->>'method', '') !~* '^kkiapay' and coalesce(x->>'date', '') < '2026-10-01');

update public.appointments a
   set data = jsonb_set(a.data, '{payments}', (
         select coalesce(jsonb_agg(pg_temp.caisse_rangee(x) order by o), '[]'::jsonb)
           from jsonb_array_elements(a.data->'payments') with ordinality as v(x, o)))
 where exists (select 1 from jsonb_array_elements(coalesce(a.data->'payments', '[]')) x
                where x->>'cashbox' = 'KkiaPay' and coalesce(x->>'method', '') !~* '^kkiapay' and coalesce(x->>'date', '') < '2026-10-01');

update public.invoices
   set data = data || jsonb_build_object('cashbox', 'Real Money')
 where id in ('inv-syjqdem0p8', 'inv-wxmlb74rwz', 'inv-6la2fpbgry', 'inv-hn611y9m58', 'inv-dc8cnc9203')
   and data->>'cashbox' = 'KkiaPay';
update public.invoices
   set data = data || jsonb_build_object('cashbox', 'ACIA1')
 where id = 'inv-fwyfi6qwyb' and data->>'cashbox' = 'KkiaPay';

update public.expenses
   set data = data || jsonb_build_object('cashbox', 'Real Money')
 where id = 'zzmqg4czzc' and data->>'cashbox' = 'KkiaPay';

-- Contrôle : ce qui reste dans la caisse KkiaPay sans être du KkiaPay, avant octobre (attendu : 0).
select (select count(*) from public.invoices i, jsonb_array_elements(coalesce(i.data->'payments', '[]')) x
         where x->>'cashbox' = 'KkiaPay' and coalesce(x->>'method', '') !~* '^kkiapay' and coalesce(x->>'date', '') < '2026-10-01')
     + (select count(*) from public.appointments a, jsonb_array_elements(coalesce(a.data->'payments', '[]')) x
         where x->>'cashbox' = 'KkiaPay' and coalesce(x->>'method', '') !~* '^kkiapay' and coalesce(x->>'date', '') < '2026-10-01')
     + (select count(*) from public.expenses where data->>'cashbox' = 'KkiaPay' and coalesce(data->>'date', '') < '2026-10-01') as reste,
       (select count(*) from public.repli_caisse_kkiapay_20261112) as copies;
