-- ═══════════════════════════════════════════════════════════════════
-- 0142 · LES DERNIERS RENDEZ-VOUS À LEUR PLACE · 28 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase › SQL Editor, puis Run. Un seul bloc :
-- tout passe, ou rien ne change.
--
-- Après la réparation 0141, la sonde « la suite des documents sans RDV » a
-- montré ce qui restait. Décisions de la direction (28 oct., au sélecteur) :
--   ① J.-L. K. : son rendez-vous du 18 juillet 2026 pointe une fiche qui
--      n'existe pas ; il revient à sa fiche, celle de sa facture ;
--   ② S.-D. L. : son rendez-vous, resté « confirmé » au 26 août 2026, prend
--      la date de sa facture (6 septembre 2026) et passe honoré ;
--   ③ trois factures de reprise sans aucun rendez-vous (E. A. et E. A. le
--      19 décembre 2025, R. S. A. le 19 mars 2026) : le rendez-vous est
--      recréé depuis la facture, honoré, comme ceux de 2025 dans le 0141 ;
--   ④ E. A. : sa facture du 18 décembre 2025 rejoint le rendez-vous de ce
--      jour-là, s'il n'a pas déjà la sienne ;
--   ⑤ les deux rendez-vous recréés par le 0141 sans prestation reconnue
--      (factures MND-2026-0056 et MND-2026-0122) reçoivent leurs
--      prestations, reconnues par leur nom d'aujourd'hui au catalogue ;
--   ⑥ B. B. : le rendez-vous du 28 mars 2025, rangé sur la fiche
--      d'A.-M. A., passe sur la sienne, celle de sa facture F-2026-0339.
--
-- Les sept factures en double ne sont PAS touchées ici : elles se
-- suppriment à la main dans Factures (la suppression du Trône rembobine
-- l'avoir, le stock, l'abonnement et les pourboires).
--
-- AUCUN MESSAGE NE PART VERS UNE CLIENTE. Les rendez-vous recréés entrent
-- sans déclencheurs (session_replication_role = replica), avec une
-- dernière écriture ancienne (celle de leur facture) ; la trace les
-- inscrit à la main. Les autres gestes touchent des rendez-vous passés.
-- Passer en honoré ne change que le statut : ni points, ni stock.
-- Aucune facture ne change de montant, de statut ni de versement : une
-- facture ne reçoit au plus que le nom de son rendez-vous (apptId).
--
-- Chaque geste porte sa garde : un cas qui n'est plus celui que la sonde a
-- vu est sauté et nommé dans le compte rendu.
--
-- PRÉCAUTION : fermer si possible les onglets du Trône et de Ma Couronne.
-- RETOUR EN ARRIÈRE : repli_0142_appointments et repli_0142_invoices.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.repli_0142_appointments (like public.appointments including all);
alter table public.repli_0142_appointments enable row level security;
create table if not exists public.repli_0142_invoices (like public.invoices including all);
alter table public.repli_0142_invoices enable row level security;
create table if not exists public.repli_0142_compte_rendu (
  fait_le timestamptz not null default now(),
  compte_rendu jsonb not null
);
alter table public.repli_0142_compte_rendu enable row level security;

do $bloc$
declare
  f record;
  r record;
  ids text[];
  rid text;
  n int;
  fait jsonb := '{}'::jsonb;
  saute jsonb := '[]'::jsonb;
begin
  -- L'éditeur SQL n'a pas de compte : la base parle au nom du serveur de la
  -- Maison (la trace dira « Un service de la Maison »).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- ── Le secours, avant toute écriture (rempli une seule fois) ─────
  insert into public.repli_0142_appointments select * from public.appointments
  where not exists (select 1 from public.repli_0142_appointments);
  insert into public.repli_0142_invoices select * from public.invoices
  where not exists (select 1 from public.repli_0142_invoices);

  -- Le nom d'une prestation, comparé sans ce qui a changé depuis : « Le
  -- Shampoing », le féminin d'« Essentielle » et d'« Élaborée », les espaces.
  drop table if exists pg_temp.catalogue;
  create temp table catalogue as
  select c.id, regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(btrim(c.data->>'name')),
           'le shampoing ', '', 'g'), 'essentielle', 'essentiel', 'g'), 'élaborée', 'élaboré', 'g'), '\s+', ' ', 'g') as cle
  from public.catalog_services c where coalesce(c.data->>'name', '') <> '';

  -- La pièce et son rendez-vous, par la règle de la fiche.
  drop table if exists pg_temp.pieces;
  create temp table pieces as
  select i.id, i.branch_id, i.updated_at, i.data, i.data->>'number' as numero,
         coalesce(nullif(i.data->>'forClientId', ''), i.data->>'clientId') as cliente,
         coalesce((select a.id from public.appointments a where a.id = i.data->>'apptId'),
                  (select a.id from public.appointments a where a.data->>'invoiceId' = i.id order by a.data->>'date', a.id limit 1)) as rdv
  from public.invoices i
  where i.data->>'number' in ('MND-2026-0010', 'MND-2026-0022', 'MND-R-0003', 'MND-R-0004', 'MND-R-0117',
                              'MND-2026-0074', 'MND-2026-0056', 'MND-2026-0122', 'F-2026-0339')
    and coalesce(i.data->>'kind', 'facture') = 'facture';

  -- ── ① J.-L. K. : le rendez-vous revient à la fiche de sa facture ──
  select p.*, a.data as rdata into f from pieces p join public.appointments a on a.id = p.rdv where p.numero = 'MND-2026-0010';
  if f.id is null then
    saute := saute || jsonb_build_object('facture', 'MND-2026-0010', 'pourquoi', 'facture ou rendez-vous introuvable');
  elsif f.rdata->>'clientId' = f.cliente then
    saute := saute || jsonb_build_object('facture', 'MND-2026-0010', 'pourquoi', 'deja sur sa fiche');
  elsif exists (select 1 from public.clients c where c.id = f.rdata->>'clientId' and coalesce(c.data->>'name', '') <> '')
     or not exists (select 1 from public.clients c where c.id = f.cliente) then
    saute := saute || jsonb_build_object('facture', 'MND-2026-0010', 'pourquoi', 'le rendez-vous est sur une vraie fiche : a voir a la main');
  else
    update public.appointments a set data = a.data || jsonb_build_object('clientId', f.cliente)
      || coalesce((select jsonb_build_object('clientName', c.data->>'name') from public.clients c where c.id = f.cliente), '{}'::jsonb)
    where a.id = f.rdv;
    fait := fait || jsonb_build_object('rdv_rendu_a_sa_fiche', f.rdv);
  end if;

  -- ── ② S.-D. L. : la date de la facture, et honoré ────────────────
  select p.*, a.data as rdata into f from pieces p join public.appointments a on a.id = p.rdv where p.numero = 'MND-2026-0022';
  if f.id is null then
    saute := saute || jsonb_build_object('facture', 'MND-2026-0022', 'pourquoi', 'facture ou rendez-vous introuvable');
  elsif f.rdata->>'status' <> 'confirmé' or f.rdata->>'date' <> '2026-08-26' or f.data->>'date' <> '2026-09-06' then
    saute := saute || jsonb_build_object('facture', 'MND-2026-0022', 'pourquoi', 'le rendez-vous n est plus confirme au 26 aout : a voir a la main');
  else
    update public.appointments a set data = a.data || jsonb_build_object('date', '2026-09-06', 'status', 'honoré') where a.id = f.rdv;
    fait := fait || jsonb_build_object('rdv_redate_et_honore', f.rdv);
  end if;

  -- ── ③ Les trois reprises sans rendez-vous : recréé depuis la facture ─
  drop table if exists pg_temp.recrees;
  create temp table recrees (id text, branch_id text, updated_at timestamptz, numero text, data jsonb);
  for f in select * from pieces where numero in ('MND-R-0003', 'MND-R-0004', 'MND-R-0117') order by numero loop
    rid := case when f.id like 'inv-rep-%' then substr(f.id, 9) else 'rdv-' || f.id end;
    if f.rdv is not null or exists (select 1 from public.appointments a where a.id = rid) then
      saute := saute || jsonb_build_object('facture', f.numero, 'pourquoi', 'elle a deja un rendez-vous');
      continue;
    end if;
    if exists (select 1 from public.appointments a where a.data->>'clientId' = f.cliente and a.data->>'date' = f.data->>'date'
                and coalesce(a.data->>'status', '') <> 'annulé') then
      saute := saute || jsonb_build_object('facture', f.numero, 'jour', f.data->>'date', 'pourquoi', 'un rendez-vous existe deja ce jour-la : a relier a la main');
      continue;
    end if;
    insert into recrees values (rid, f.branch_id, f.updated_at, f.numero, jsonb_build_object(
      'id', rid,
      'branchId', coalesce(f.data->>'branchId', f.branch_id),
      'clientId', f.cliente,
      'serviceIds', coalesce((
        select jsonb_agg(s.id order by l.pos)
        from jsonb_array_elements(case when jsonb_typeof(f.data->'lines') = 'array' then f.data->'lines' else '[]'::jsonb end) with ordinality l(e, pos)
        cross join lateral (select k.id from catalogue k
          where k.cle = regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(btrim(l.e->>'label')),
                  'le shampoing ', '', 'g'), 'essentielle', 'essentiel', 'g'), 'élaborée', 'élaboré', 'g'), '\s+', ' ', 'g')
          order by k.id limit 1) s
        where coalesce(l.e->>'produitId', '') = ''), '[]'::jsonb),
      'date', f.data->>'date',
      'time', '',
      'master', '',
      'status', 'honoré',
      'priceXof', greatest(0, round(coalesce((select sum(greatest(0,
          coalesce(nullif(l->>'qty', '')::numeric, 1) * coalesce(nullif(l->>'unitXof', '')::numeric, 0)
          * (1 - coalesce(nullif(l->>'discountPct', '')::numeric, 0) / 100) - coalesce(nullif(l->>'discountXof', '')::numeric, 0)))
        from jsonb_array_elements(case when jsonb_typeof(f.data->'lines') = 'array' then f.data->'lines' else '[]'::jsonb end) l), 0)
        * (1 - coalesce(nullif(f.data->>'globalDiscountPct', '')::numeric, 0) / 100))
        - coalesce(nullif(f.data->>'globalDiscountXof', '')::numeric, 0)),
      'invoiceId', f.id,
      'pointsAwarded', true,
      'source', 'trone',
      'creeLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'note', 'Recréé le 28 octobre 2026 depuis sa facture : le rendez-vous d''origine avait disparu. Heure et maître inconnus.')
      || coalesce((select jsonb_build_object('clientName', c.data->>'name') from public.clients c where c.id = f.cliente), '{}'::jsonb));
  end loop;

  set local session_replication_role = replica;
  insert into public.appointments (id, branch_id, data, updated_at)
  select id, branch_id, data, updated_at from recrees;
  set local session_replication_role = origin;

  insert into public.traces (fait_le, table_name, piece_id, branch_id, operation, compte_nom, porte, avant, apres)
  select now(), 'appointments', id, branch_id, 'modifie', 'Réparation 0142 · derniers rendez-vous', 'base',
         jsonb_build_object('etat', 'disparu, recréé depuis la facture ' || numero), public.trace_allege(data)
  from recrees;
  fait := fait || jsonb_build_object('rdv_recrees', coalesce((select jsonb_agg(jsonb_build_object('facture', numero,
            'prestations_reconnues', jsonb_array_length(data->'serviceIds')) order by numero) from recrees), '[]'::jsonb));

  -- ── ④ E. A. : la facture rejoint le rendez-vous de son jour ──────
  select * into f from pieces where numero = 'MND-2026-0074';
  if f.id is null then
    saute := saute || jsonb_build_object('facture', 'MND-2026-0074', 'pourquoi', 'facture introuvable');
  elsif f.rdv is not null then
    saute := saute || jsonb_build_object('facture', 'MND-2026-0074', 'pourquoi', 'elle a deja son rendez-vous');
  else
    select array_agg(a.id order by a.id) into ids from public.appointments a
    where a.data->>'clientId' = f.cliente and a.data->>'date' = f.data->>'date' and coalesce(a.data->>'status', '') <> 'annulé';
    if coalesce(array_length(ids, 1), 0) <> 1 then
      saute := saute || jsonb_build_object('facture', 'MND-2026-0074', 'pourquoi', coalesce(array_length(ids, 1), 0) || ' rendez-vous ce jour-la : a voir a la main');
    elsif exists (select 1 from public.appointments a where a.id = ids[1] and coalesce(a.data->>'invoiceId', '') not in ('', f.id))
       or exists (select 1 from public.invoices i where i.data->>'apptId' = ids[1] and i.id <> f.id) then
      saute := saute || jsonb_build_object('facture', 'MND-2026-0074', 'rdv', ids[1], 'pourquoi', 'le rendez-vous du jour a deja sa facture : a voir a la main');
    else
      update public.invoices set data = data || jsonb_build_object('apptId', ids[1]) where id = f.id;
      update public.appointments set data = data || jsonb_build_object('invoiceId', f.id) where id = ids[1];
      fait := fait || jsonb_build_object('facture_reliee', jsonb_build_object('facture', 'MND-2026-0074', 'rdv', ids[1]));
    end if;
  end if;

  -- ── ⑤ Les prestations des deux rendez-vous recréés par le 0141 ───
  n := 0;
  for f in select p.*, a.data as rdata from pieces p join public.appointments a on a.id = p.rdv
           where p.numero in ('MND-2026-0056', 'MND-2026-0122') loop
    if jsonb_array_length(coalesce(f.rdata->'serviceIds', '[]'::jsonb)) > 0 or coalesce(f.rdata->>'note', '') not like 'Recréé le 27 octobre 2026%' then
      saute := saute || jsonb_build_object('facture', f.numero, 'pourquoi', 'le rendez-vous a deja ses prestations, ou n est pas celui du 0141');
      continue;
    end if;
    update public.appointments a set data = a.data || jsonb_build_object('serviceIds', coalesce((
        select jsonb_agg(s.id order by l.pos)
        from jsonb_array_elements(case when jsonb_typeof(f.data->'lines') = 'array' then f.data->'lines' else '[]'::jsonb end) with ordinality l(e, pos)
        cross join lateral (select k.id from catalogue k
          where k.cle = regexp_replace(regexp_replace(regexp_replace(regexp_replace(lower(btrim(l.e->>'label')),
                  'le shampoing ', '', 'g'), 'essentielle', 'essentiel', 'g'), 'élaborée', 'élaboré', 'g'), '\s+', ' ', 'g')
          order by k.id limit 1) s
        where coalesce(l.e->>'produitId', '') = ''), '[]'::jsonb))
    where a.id = f.rdv;
    select jsonb_array_length(a.data->'serviceIds') into n from public.appointments a where a.id = f.rdv;
    fait := fait || jsonb_build_object('prestations_' || f.numero, n);
  end loop;

  -- ── ⑥ B. B. : le rendez-vous du 28 mars 2025 passe sur sa fiche ──
  select p.*, a.data as rdata into f from pieces p join public.appointments a on a.id = p.rdv where p.numero = 'F-2026-0339';
  if f.id is null then
    saute := saute || jsonb_build_object('facture', 'F-2026-0339', 'pourquoi', 'facture ou rendez-vous introuvable');
  elsif f.rdata->>'clientId' = f.cliente then
    saute := saute || jsonb_build_object('facture', 'F-2026-0339', 'pourquoi', 'deja sur sa fiche');
  elsif f.rdata->>'date' <> '2025-03-28'
     or not exists (select 1 from public.clients c where c.id = f.rdata->>'clientId' and c.data->>'name' ilike 'anne-marie%')
     or not exists (select 1 from public.clients c where c.id = f.cliente) then
    saute := saute || jsonb_build_object('facture', 'F-2026-0339', 'pourquoi', 'le rendez-vous n est plus celui du 28 mars 2025 au nom d A.-M. A. : a voir a la main');
  else
    update public.appointments a set data = a.data || jsonb_build_object('clientId', f.cliente)
      || coalesce((select jsonb_build_object('clientName', c.data->>'name') from public.clients c where c.id = f.cliente), '{}'::jsonb)
    where a.id = f.rdv;
    fait := fait || jsonb_build_object('rdv_passe_sur_sa_fiche', f.rdv);
  end if;

  insert into public.repli_0142_compte_rendu (compte_rendu) values (jsonb_build_object(
    'fait', fait, 'sautes', saute,
    'secours', jsonb_build_object('rendez_vous', (select count(*) from public.repli_0142_appointments),
                                  'factures', (select count(*) from public.repli_0142_invoices))));

  drop table catalogue;
  drop table pieces;
  drop table recrees;
end
$bloc$;

select to_char(fait_le at time zone 'Africa/Porto-Novo', 'DD/MM HH24:MI') as passe_le, jsonb_pretty(compte_rendu) as compte_rendu
from public.repli_0142_compte_rendu order by fait_le desc limit 1;
