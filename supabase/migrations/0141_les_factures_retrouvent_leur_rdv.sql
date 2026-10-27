-- ═══════════════════════════════════════════════════════════════════
-- 0141 · LES FACTURES RETROUVENT LEUR RENDEZ-VOUS · 27 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase › SQL Editor, puis Run. Un seul bloc :
-- tout passe, ou rien ne change.
--
-- « N'apparaît pas dans le Carnet mais apparaît dans Documents : les deux
-- doivent être liés. » La sonde du 27 octobre a trouvé 131 factures sans
-- leur rendez-vous. Décisions de la direction (27 oct., au sélecteur) :
--   ① remettre au Carnet, tels qu'ils étaient, les rendez-vous effacés
--      par l'envoi machine du 28 sept. 2026 à 09:14:53 dont la facture
--      existe toujours (68 attendus) ;
--   ② les 5 jours où un rendez-vous a été reposé à la main : relier la
--      facture à ce rendez-vous reposé, sauf s'il a déjà sa propre facture
--      (le cas est alors montré, ce serait un double) ;
--   ③ les 5 factures de 2025 dont le rendez-vous a disparu avant les
--      traces (13 sept. 2026) : recréer le rendez-vous à partir de la
--      facture, honoré, heure et maître inconnus.
--
-- POURQUOI LE 0118 NE LES AVAIT PAS REMIS. Il ne remettait que les
-- rendez-vous dont la facture portait un versement inscrit. Les factures
-- de reprise (MND-R-…) sont « payée » sans versement inscrit, et la
-- facture citait souvent son rendez-vous depuis le rendez-vous lui-même
-- (son invoiceId), pas depuis la facture (apptId).
--
-- AUCUN MESSAGE NE PART VERS UNE CLIENTE. Les rendez-vous remis ou
-- recréés entrent sans déclencheurs (session_replication_role = replica) :
-- ni pose neuve dans la trace, que le balayage des confirmations lirait
-- comme un rendez-vous du soir. Ils gardent une dernière écriture ancienne
-- (l'instant de l'effacement, ou celle de la facture). La trace les
-- inscrit à la main, au nom de la réparation. Aucune facture ne change de
-- montant, de statut ni de versement : une facture ne reçoit au plus que
-- le nom de son rendez-vous (apptId).
--
-- Chaque geste porte sa garde : un cas qui n'est plus celui que la sonde a
-- vu est sauté et nommé dans le compte rendu. Si la base compte plus de cas
-- que la sonde, rien ne change et le message le dit.
--
-- PRÉCAUTION : fermer si possible les onglets du Trône et de Ma Couronne.
-- RETOUR EN ARRIÈRE : repli_0141_appointments et repli_0141_invoices.
-- ═══════════════════════════════════════════════════════════════════

create table if not exists public.repli_0141_appointments (like public.appointments including all);
alter table public.repli_0141_appointments enable row level security;
create table if not exists public.repli_0141_invoices (like public.invoices including all);
alter table public.repli_0141_invoices enable row level security;
create table if not exists public.repli_0141_compte_rendu (
  fait_le timestamptz not null default now(),
  compte_rendu jsonb not null
);
alter table public.repli_0141_compte_rendu enable row level security;

do $bloc$
declare
  aujourdhui text := to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD');
  d record;
  n int;
  reposes text[];
  sa_facture text;
  fait jsonb := '{}'::jsonb;
  relies jsonb := '[]'::jsonb;
  recrees jsonb := '[]'::jsonb;
  saute jsonb := '[]'::jsonb;
begin
  -- L'éditeur SQL n'a pas de compte : la base parle au nom du serveur de la
  -- Maison (la trace dira « Un service de la Maison »).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- ── Le secours, avant toute écriture (rempli une seule fois) ─────
  insert into public.repli_0141_appointments select * from public.appointments
  where not exists (select 1 from public.repli_0141_appointments);
  insert into public.repli_0141_invoices select * from public.invoices
  where not exists (select 1 from public.repli_0141_invoices);

  -- ── Les factures sans aucun rendez-vous, par la règle de la fiche ─
  -- Ni le rendez-vous qu'elle cite (apptId), ni un rendez-vous qui la cite
  -- (invoiceId), ni un versement de rendez-vous qui la nomme. Les pièces
  -- de pourboire seul ont leur propre règle et ne sont pas touchées.
  drop table if exists pg_temp.orphelines;
  create temp table orphelines as
  select i.id, i.branch_id, i.updated_at, i.data,
         nullif(i.data->>'apptId', '') as rdv_cite,
         coalesce(nullif(i.data->>'forClientId', ''), i.data->>'clientId') as cliente
  from public.invoices i
  where coalesce(i.data->>'kind', 'facture') = 'facture'
    and coalesce(i.data->>'pourboireDe', '') = ''
    and not exists (select 1 from public.appointments a where a.id = i.data->>'apptId')
    and not exists (select 1 from public.appointments a where a.data->>'invoiceId' = i.id)
    and not exists (select 1 from public.appointments a
                      cross join lateral jsonb_array_elements(case when jsonb_typeof(a.data->'payments') = 'array' then a.data->'payments' else '[]'::jsonb end) v
                     where v->>'invoiceId' = i.id);

  -- ── ①② Les rendez-vous de ces factures effacés le 28 septembre ──
  -- La dernière trace d'effacement de chaque facture, comme la sonde.
  drop table if exists pg_temp.effaces;
  create temp table effaces as
  select * from (
    select distinct on (o.id) o.id as facture, o.data->>'number' as numero, t.piece_id as rdv, t.branch_id,
           t.fait_le as efface_le, t.avant->>'clientId' as cliente, t.avant->>'date' as jour,
           (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(t.avant) e
             where e.value <> to_jsonb('(trop long pour la trace)'::text)) as data
    from orphelines o
    join public.traces t on t.table_name = 'appointments' and t.operation = 'efface'
     and (t.piece_id = o.rdv_cite or t.avant->>'invoiceId' = o.id)
    where jsonb_typeof(t.avant) = 'object'
    order by o.id, t.fait_le desc
  ) x
  where date_trunc('second', x.efface_le) = '2026-09-28 09:14:53+00';

  select count(*) into n from effaces;
  if n > 73 then
    raise exception 'La base ne ressemble plus a la sonde : % factures au RDV efface le 28 septembre au lieu de 73. Rien n''est change.', n;
  end if;

  -- ① À remettre : ceux dont aucun rendez-vous n'a été reposé ce jour-là.
  -- Un rendez-vous cité par deux factures ne revient qu'une fois.
  drop table if exists pg_temp.a_remettre;
  create temp table a_remettre as
  select distinct on (e.rdv) e.rdv as id, e.facture, e.branch_id, e.efface_le,
         e.data || case when coalesce(e.data->>'invoiceId', '') = '' then jsonb_build_object('invoiceId', e.facture) else '{}'::jsonb end as data
  from effaces e
  where not exists (select 1 from public.appointments a where a.id = e.rdv)
    and not exists (select 1 from public.appointments a
                     where a.data->>'clientId' = e.cliente and a.data->>'date' = e.jour
                       and coalesce(a.data->>'status', '') <> 'annulé')
  order by e.rdv, e.facture;

  -- Un versement du rendez-vous qui ne nomme pas sa facture entrerait au
  -- registre une seconde fois (r-rdv à côté du r-inv de la facture) : on lui
  -- donne l'identifiant et la date du versement de la facture de même
  -- montant, comme le 0118. Repéré par sa PLACE, jamais par son identifiant.
  drop table if exists pg_temp.alignes;
  create temp table alignes as
  with
  rv as (
    select x.id as rdv, x.facture, v.pos, v.e->>'id' as vid, v.e->>'date' as jour,
           (v.e->>'amountXof')::numeric as montant
    from a_remettre x
    cross join lateral jsonb_array_elements(case when jsonb_typeof(x.data->'payments') = 'array' then x.data->'payments' else '[]'::jsonb end) with ordinality v(e, pos)
    where coalesce(nullif(v.e->>'amountXof', '')::numeric, 0) > 0
      and coalesce(nullif(v.e->>'invoiceId', ''), x.facture) = x.facture
  ),
  fv as (
    select x.id as rdv, v->>'id' as vid, v->>'date' as jour, (v->>'amountXof')::numeric as montant
    from a_remettre x join public.invoices i on i.id = x.facture
    cross join lateral jsonb_array_elements(case when jsonb_typeof(i.data->'payments') = 'array' then i.data->'payments' else '[]'::jsonb end) v
    where coalesce(nullif(v->>'amountXof', '')::numeric, 0) > 0
  ),
  r1 as (select * from rv where not exists (select 1 from fv where fv.rdv = rv.rdv and fv.vid = rv.vid)),
  f1 as (select * from fv where not exists (select 1 from rv where rv.rdv = fv.rdv and rv.vid = fv.vid)),
  r1n as (select *, row_number() over (partition by rdv, montant order by (jour is null), jour, pos) as k from r1),
  f1n as (select *, row_number() over (partition by rdv, montant order by (jour is null), jour, vid) as k from f1)
  select r.rdv, r.facture, r.pos, f.vid as vid_fac, f.jour as date_fac
  from r1n r join f1n f on f.rdv = r.rdv and f.montant = r.montant and f.k = r.k;

  update a_remettre x
  set data = jsonb_set(x.data, '{payments}', (
    select jsonb_agg(case when m.rdv is null then v.e
                          else v.e || jsonb_build_object('id', m.vid_fac, 'invoiceId', m.facture)
                                   || case when m.date_fac is not null then jsonb_build_object('date', m.date_fac) else '{}'::jsonb end
                     end order by v.pos)
    from jsonb_array_elements(x.data->'payments') with ordinality v(e, pos)
    left join alignes m on m.rdv = x.id and m.pos = v.pos))
  where x.id in (select rdv from alignes) and jsonb_typeof(x.data->'payments') = 'array';

  set local session_replication_role = replica;
  insert into public.appointments (id, branch_id, data, updated_at)
  select id, branch_id, data, efface_le from a_remettre;
  set local session_replication_role = origin;

  insert into public.traces (fait_le, table_name, piece_id, branch_id, operation, compte_nom, porte, avant, apres)
  select now(), 'appointments', id, branch_id, 'modifie', 'Réparation 0141 · factures et carnet', 'base',
         jsonb_build_object('etat', 'effacé par l''envoi du ' || to_char(efface_le, 'YYYY-MM-DD HH24:MI:SS')),
         public.trace_allege(data)
  from a_remettre;

  fait := fait || jsonb_build_object(
    'rendez_vous_remis', (select count(*) from a_remettre),
    'versements_alignes_sur_la_facture', (select count(*) from alignes));

  -- ② Reliés : la facture prend le rendez-vous reposé à la main ce jour-là.
  n := 0;
  for d in
    select e.* from effaces e
    where e.facture not in (select facture from a_remettre)
      and e.rdv not in (select id from a_remettre)
    order by e.jour, e.facture
  loop
    select array_agg(a.id order by a.id) into reposes from public.appointments a
    where a.data->>'clientId' = d.cliente and a.data->>'date' = d.jour
      and coalesce(a.data->>'status', '') <> 'annulé';
    if coalesce(array_length(reposes, 1), 0) = 0 then
      saute := saute || jsonb_build_object('facture', d.numero, 'jour', d.jour, 'pourquoi', 'aucun rendez-vous repose ce jour-la (deja au carnet ?)');
      continue;
    end if;
    if array_length(reposes, 1) > 1 then
      saute := saute || jsonb_build_object('facture', d.numero, 'jour', d.jour, 'pourquoi', 'plusieurs rendez-vous ce jour-la : a voir a la main', 'rdv', to_jsonb(reposes));
      continue;
    end if;
    select coalesce(nullif(a.data->>'invoiceId', ''),
                    (select i.id from public.invoices i where i.data->>'apptId' = a.id and i.id <> d.facture limit 1))
      into sa_facture from public.appointments a where a.id = reposes[1];
    if sa_facture is not null and sa_facture <> d.facture then
      saute := saute || jsonb_build_object('facture', d.numero, 'jour', d.jour, 'rdv', reposes[1],
        'pourquoi', 'le rendez-vous repose a deja sa facture ' || coalesce((select data->>'number' from public.invoices where id = sa_facture), sa_facture) || ' : facture en double a voir');
      continue;
    end if;
    if exists (select 1 from public.appointments a where a.id = reposes[1]
                and a.data->>'status' in ('confirmé', 'en attente') and a.data->>'date' >= aujourdhui) then
      saute := saute || jsonb_build_object('facture', d.numero, 'jour', d.jour, 'pourquoi', 'rendez-vous a venir : pas touche');
      continue;
    end if;
    update public.invoices set data = data || jsonb_build_object('apptId', reposes[1]) where id = d.facture;
    update public.appointments set data = data || jsonb_build_object('invoiceId', d.facture) where id = reposes[1];
    relies := relies || jsonb_build_object('facture', d.numero, 'jour', d.jour, 'rdv', reposes[1]);
    n := n + 1;
  end loop;
  fait := fait || jsonb_build_object('factures_reliees_au_rdv_repose', n);

  -- ── ③ Les factures de 2025 dont le rendez-vous a disparu sans trace ─
  drop table if exists pg_temp.a_recreer;
  create temp table a_recreer as
  select o.*,
         (select count(*) from public.appointments a
           where a.data->>'clientId' = o.cliente and a.data->>'date' = o.data->>'date'
             and coalesce(a.data->>'status', '') <> 'annulé') as rdv_du_jour
  from orphelines o
  where o.rdv_cite is not null
    and not exists (select 1 from public.traces t
                     where t.table_name = 'appointments' and t.operation = 'efface'
                       and (t.piece_id = o.rdv_cite or t.avant->>'invoiceId' = o.id))
    and not exists (select 1 from public.appointments a where a.id = o.rdv_cite);

  select count(*) into n from a_recreer;
  if n > 5 then
    raise exception 'La base ne ressemble plus a la sonde : % factures au RDV introuvable au lieu de 5. Rien n''est change.', n;
  end if;

  saute := saute || coalesce((select jsonb_agg(jsonb_build_object('facture', data->>'number', 'jour', data->>'date',
             'pourquoi', 'un rendez-vous existe deja ce jour-la : a relier a la main')) from a_recreer where rdv_du_jour > 0), '[]'::jsonb);
  delete from a_recreer where rdv_du_jour > 0;

  drop table if exists pg_temp.recrees;
  create temp table recrees as
  select o.rdv_cite as id, o.branch_id, o.updated_at, o.data->>'number' as numero,
         jsonb_build_object(
           'id', o.rdv_cite,
           'branchId', coalesce(o.data->>'branchId', o.branch_id),
           'clientId', o.cliente,
           'serviceIds', coalesce((
             select jsonb_agg(s.id order by l.pos)
             from jsonb_array_elements(case when jsonb_typeof(o.data->'lines') = 'array' then o.data->'lines' else '[]'::jsonb end) with ordinality l(e, pos)
             cross join lateral (select c.id from public.catalog_services c
                                  where lower(btrim(c.data->>'name')) = lower(btrim(l.e->>'label')) order by c.id limit 1) s
             where coalesce(l.e->>'produitId', '') = ''), '[]'::jsonb),
           'date', o.data->>'date',
           'time', '',
           'master', '',
           'status', 'honoré',
           'priceXof', greatest(0, round(coalesce((select sum(greatest(0,
               coalesce(nullif(l->>'qty', '')::numeric, 1) * coalesce(nullif(l->>'unitXof', '')::numeric, 0)
               * (1 - coalesce(nullif(l->>'discountPct', '')::numeric, 0) / 100) - coalesce(nullif(l->>'discountXof', '')::numeric, 0)))
             from jsonb_array_elements(case when jsonb_typeof(o.data->'lines') = 'array' then o.data->'lines' else '[]'::jsonb end) l), 0)
             * (1 - coalesce(nullif(o.data->>'globalDiscountPct', '')::numeric, 0) / 100))
             - coalesce(nullif(o.data->>'globalDiscountXof', '')::numeric, 0)),
           'invoiceId', o.id,
           'pointsAwarded', true,
           'source', 'trone',
           'creeLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'note', 'Recréé le 27 octobre 2026 depuis sa facture : le rendez-vous d''origine avait disparu. Heure et maître inconnus.')
         || coalesce((select jsonb_build_object('clientName', c.data->>'name') from public.clients c where c.id = o.cliente), '{}'::jsonb) as data
  from a_recreer o;

  set local session_replication_role = replica;
  insert into public.appointments (id, branch_id, data, updated_at)
  select id, branch_id, data, updated_at from recrees;
  set local session_replication_role = origin;

  insert into public.traces (fait_le, table_name, piece_id, branch_id, operation, compte_nom, porte, avant, apres)
  select now(), 'appointments', id, branch_id, 'modifie', 'Réparation 0141 · factures et carnet', 'base',
         jsonb_build_object('etat', 'disparu avant le 13 septembre 2026, recréé depuis la facture ' || numero),
         public.trace_allege(data)
  from recrees;

  recrees := coalesce((select jsonb_agg(jsonb_build_object('facture', numero, 'jour', data->>'date',
               'prestations_reconnues', jsonb_array_length(data->'serviceIds')) order by data->>'date') from recrees), '[]'::jsonb);
  fait := fait || jsonb_build_object('rendez_vous_recrees', jsonb_array_length(recrees));

  insert into public.repli_0141_compte_rendu (compte_rendu) values (jsonb_build_object(
    'fait', fait, 'relies', relies, 'recrees', recrees, 'sautes', saute,
    'secours', jsonb_build_object('rendez_vous', (select count(*) from public.repli_0141_appointments),
                                  'factures', (select count(*) from public.repli_0141_invoices))));

  drop table orphelines;
  drop table effaces;
  drop table a_remettre;
  drop table alignes;
  drop table a_recreer;
  drop table recrees;
end
$bloc$;

select to_char(fait_le at time zone 'Africa/Porto-Novo', 'DD/MM HH24:MI') as passe_le, jsonb_pretty(compte_rendu) as compte_rendu
from public.repli_0141_compte_rendu order by fait_le desc limit 1;
