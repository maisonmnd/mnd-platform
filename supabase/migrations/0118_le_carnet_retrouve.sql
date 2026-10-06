-- ═══════════════════════════════════════════════════════════════════
-- 0118 — LE CARNET RETROUVÉ · 6 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Rien à
-- décommenter. Un seul bloc : tout passe, ou rien ne change.
--
-- Décisions de la direction (6 oct., au sélecteur) :
--   ① remettre au carnet les rituels HONORÉS dont la facture est payée,
--      effacés par les trois envois machine (21 sept. 21:49:36, 22 sept.
--      07:53:48, 28 sept. 09:14:53, chacun dans la même seconde) ;
--   ② remettre aussi les rendez-vous à venir ou confirmés de ces envois ;
--   ③ aligner les versements identiques (même date, même montant) dont
--      seul l'identifiant diffère entre le rendez-vous et sa facture ;
--   ④ rendre au versement redaté du rendez-vous la date de sa facture.
--
-- Ce que le script NE fait PAS : il ne touche à AUCUNE facture, à aucun
-- montant, et ne remet pas un rendez-vous déjà reposé à la main (même
-- cliente, même jour).
--
-- POURQUOI LA FACTURE DONNE L'IDENTIFIANT : le registre des encaissements
-- nomme chaque entrée par le versement de la facture (r-inv-…), et le
-- pointage du soir s'y accroche. Un versement de rendez-vous qui ne dit pas
-- sa facture entre au registre UNE SECONDE FOIS (r-rdv-…) : c'étaient les
-- doublons de septembre. Le rendez-vous prend donc l'identifiant de la
-- facture et le nom de sa facture.
--
-- AUCUN MESSAGE NE PART VERS UNE CLIENTE. La confirmation (confirmation-rdv)
-- balaie les rendez-vous écrits depuis dix minutes et juge « neuf » celui
-- dont la POSE, lue dans la trace, a moins de deux heures. Un INSERT nu
-- aurait signé une pose de ce soir : chaque cliente à venir aurait reçu
-- « c'est confirmé ». Donc :
--   · les rendez-vous remis gardent leur dernière écriture d'origine
--     (l'instant de leur effacement), hors du balayage ;
--   · ils entrent sans déclencheurs (session_replication_role = replica) :
--     ni pose neuve dans la trace, ni garde de l'argent qui retirerait le
--     « payé » d'une écriture sans compte du personnel ;
--   · la trace les inscrit à la main, en « modifie », au nom de la
--     réparation ;
--   · l'alignement ne touche AUCUN rendez-vous confirmé à venir.
-- Si la base refusait le mode replica, tout s'annulerait : rien ne change.
--
-- PRÉCAUTION : fermer si possible les onglets du Trône et de Ma Couronne.
-- RETOUR EN ARRIÈRE : repli_0118_appointments garde le carnet d'avant.
-- ═══════════════════════════════════════════════════════════════════


-- UN SEUL BLOC (6 octobre, 22 h 27). Le premier essai, écrit en
-- « begin; … commit; », a échoué dans l'éditeur de Supabase : « relation
-- a_remettre does not exist ». L'éditeur validait chaque instruction à part,
-- et la table de travail « on commit drop » mourait aussitôt née. L'échec
-- est tombé sur la remise elle-même : rien n'a été écrit, hormis peut-être
-- le secours (le carnet d'avant, sans danger). Un bloc `do` est UNE
-- instruction : Postgres le passe entier ou pas du tout, quel que soit
-- l'éditeur. Le compte rendu se garde dans une table, lue juste après.

create table if not exists public.repli_0118_appointments (like public.appointments including all);
alter table public.repli_0118_appointments enable row level security;
create table if not exists public.repli_0118_compte_rendu (
  fait_le timestamptz not null default now(),
  compte_rendu jsonb not null
);
alter table public.repli_0118_compte_rendu enable row level security;

do $bloc$
declare
  n_remis int; n_honores int; n_a_venir int; n_cles bigint;
  n_ident int; n_redate int; n_touches int; n_reportes int;
  etat_avant jsonb;
begin
  -- L'éditeur SQL n'a pas de compte : la base parle au nom du serveur de la
  -- Maison (la trace dira « Un service de la Maison »).
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  -- CE QUE LE PREMIER ESSAI A PU LAISSER : des rendez-vous des trois envois
  -- déjà revenus, des poses ou des réparations écrites ce soir.
  select jsonb_build_object(
    'rdv_des_envois_deja_au_carnet', (select count(distinct t.piece_id) from public.traces t
       where t.table_name = 'appointments' and t.operation = 'efface'
         and date_trunc('second', t.fait_le) in ('2026-09-21 21:49:36+00', '2026-09-22 07:53:48+00', '2026-09-28 09:14:53+00')
         and exists (select 1 from public.appointments a where a.id = t.piece_id)),
    'poses_de_rdv_depuis_20h', (select count(*) from public.traces t where t.table_name = 'appointments'
       and t.operation = 'pose' and t.fait_le >= '2026-10-06 19:00+00'),
    'reparations_deja_tracees', (select count(*) from public.traces t where t.compte_nom like 'Réparation 0118%')
  ) into etat_avant;

  -- ── Le secours, avant toute écriture ───────────────────────────
  -- Rempli UNE fois : un second passage ne mêle pas les remis au carnet d'avant.
  insert into public.repli_0118_appointments select * from public.appointments
  where not exists (select 1 from public.repli_0118_appointments);

  -- ── ①② LES RENDEZ-VOUS À REMETTRE, lus dans la trace ───────────
  -- La trace garde le `data` entier ; une valeur de plus de 20 000 signes y
  -- est remplacée par « (trop long pour la trace) » : on retire ces clés-là
  -- plutôt que de remettre le texte de remplacement.
  drop table if exists pg_temp.a_remettre;
  create temp table a_remettre as
  select distinct on (t.piece_id)
         t.piece_id as id, t.branch_id, t.fait_le as efface_le,
         (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
            from jsonb_each(t.avant) e where e.value <> to_jsonb('(trop long pour la trace)'::text)) as data,
         t.avant->>'status' as statut,
         (select count(*) from jsonb_each(t.avant) e where e.value = to_jsonb('(trop long pour la trace)'::text)) as cles_retirees
  from public.traces t
  where t.table_name = 'appointments' and t.operation = 'efface'
    and date_trunc('second', t.fait_le) in ('2026-09-21 21:49:36+00', '2026-09-22 07:53:48+00', '2026-09-28 09:14:53+00')
    and jsonb_typeof(t.avant) = 'object'
    and (
      (t.avant->>'status' = 'honoré' and exists (
         select 1 from public.invoices i where i.data->>'apptId' = t.piece_id
           and jsonb_typeof(i.data->'payments') = 'array' and jsonb_array_length(i.data->'payments') > 0))
      or t.avant->>'status' in ('confirmé', 'en attente')
    )
    and not exists (select 1 from public.appointments a where a.id = t.piece_id)
    and not exists (select 1 from public.appointments a
                     where a.data->>'clientId' = t.avant->>'clientId' and a.data->>'date' = t.avant->>'date')
  order by t.piece_id, t.fait_le desc;

  set local session_replication_role = replica;
  insert into public.appointments (id, branch_id, data, updated_at)
  select id, branch_id, data, efface_le from a_remettre;
  set local session_replication_role = origin;

  insert into public.traces (fait_le, table_name, piece_id, branch_id, operation, compte_nom, porte, avant, apres)
  select now(), 'appointments', id, branch_id, 'modifie', 'Réparation 0118 · carnet retrouvé', 'base',
         jsonb_build_object('etat', 'effacé par l''envoi du ' || to_char(efface_le, 'YYYY-MM-DD HH24:MI:SS')),
         public.trace_allege(data)
  from a_remettre;

  -- ── ③④ LES VERSEMENTS À ALIGNER, calculés APRÈS la remise ──────
  -- Même rapprochement que la vérification des incohérences : par
  -- identifiant ; sinon même date et même montant (③) ; sinon même montant à
  -- une autre date (④). On repère chaque versement du rendez-vous par sa
  -- PLACE dans la liste, jamais par son identifiant (deux versements peuvent
  -- le partager).
  drop table if exists pg_temp.alignements;
  create temp table alignements as
  with
  rdv as (
    select a.id, a.data->>'invoiceId' as facture,
           case when jsonb_typeof(a.data->'payments') = 'array' then a.data->'payments' else '[]'::jsonb end as versements
    from public.appointments a
  ),
  fac as (
    select i.id, i.data->>'apptId' as rdv,
           case when jsonb_typeof(i.data->'payments') = 'array' then i.data->'payments' else '[]'::jsonb end as versements
    from public.invoices i
  ),
  rv as (
    select r.id as rdv, r.facture as facture_du_rdv, v.pos, v.e->>'id' as vid, v.e->>'date' as jour,
           (v.e->>'amountXof')::numeric as montant, v.e->>'invoiceId' as facture_du_versement
    from rdv r cross join lateral jsonb_array_elements(r.versements) with ordinality v(e, pos)
    where coalesce((v.e->>'amountXof')::numeric, 0) > 0
  ),
  fv as (
    select f.id as facture, v->>'id' as vid, v->>'date' as jour, (v->>'amountXof')::numeric as montant
    from fac f cross join lateral jsonb_array_elements(f.versements) v
    where coalesce((v->>'amountXof')::numeric, 0) > 0
  ),
  liens as (
    select r.id as rdv, f.id as facture from rdv r join fac f on f.id = r.facture
    union select f.rdv, f.id from fac f join rdv r on r.id = f.rdv
    union select rv.rdv, f.id from rv join fac f on f.id = rv.facture_du_versement
  ),
  lrv as (
    select l.rdv, l.facture, rv.pos, rv.vid, rv.jour, rv.montant from liens l join rv on rv.rdv = l.rdv
    where rv.facture_du_versement = l.facture
       or (rv.facture_du_versement is null and (rv.facture_du_rdv = l.facture or (rv.facture_du_rdv is null and (select count(*) from liens m where m.rdv = l.rdv) = 1)))
  ),
  lfv as (select l.rdv, l.facture, fv.vid, fv.jour, fv.montant from liens l join fv on fv.facture = l.facture),
  r1 as (select * from lrv x where not exists (select 1 from lfv y where y.facture = x.facture and y.rdv = x.rdv and y.vid = x.vid)),
  f1 as (select * from lfv y where not exists (select 1 from lrv x where x.facture = y.facture and x.rdv = y.rdv and x.vid = y.vid)),
  r1n as (select *, row_number() over (partition by rdv, facture, jour, montant order by pos) as n from r1),
  f1n as (select *, row_number() over (partition by rdv, facture, jour, montant order by vid) as n from f1),
  pa as (select r.rdv, r.facture, r.pos, f.vid as vid_fac, null::text as date_fac
         from r1n r join f1n f on f.rdv = r.rdv and f.facture = r.facture and f.jour is not distinct from r.jour and f.montant = r.montant and f.n = r.n),
  r2 as (select * from r1 x where not exists (select 1 from pa where pa.rdv = x.rdv and pa.facture = x.facture and pa.pos = x.pos)),
  f2 as (select * from f1 y where not exists (select 1 from pa where pa.rdv = y.rdv and pa.facture = y.facture and pa.vid_fac = y.vid)),
  r2n as (select *, row_number() over (partition by rdv, facture, montant order by jour, pos) as n from r2),
  f2n as (select *, row_number() over (partition by rdv, facture, montant order by jour, vid) as n from f2),
  pb as (select r.rdv, r.facture, r.pos, f.vid as vid_fac, f.jour as date_fac
         from r2n r join f2n f on f.rdv = r.rdv and f.facture = r.facture and f.montant = r.montant and f.n = r.n)
  select *, 'identifiant' as genre from pa
  union all
  select *, 'redate' from pb;

  -- Un rendez-vous confirmé à venir n'est pas touché : sa nouvelle écriture le
  -- ferait passer sous le balayage des confirmations.
  drop table if exists pg_temp.reportes;
  create temp table reportes as
  select x.* from alignements x
  where exists (select 1 from public.appointments a where a.id = x.rdv
                  and a.data->>'status' = 'confirmé'
                  and a.data->>'date' >= to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD'));
  delete from alignements x using reportes r where r.rdv = x.rdv and r.pos = x.pos;

  -- Un versement du rendez-vous ne prend qu'UNE facture : s'il en appariait
  -- deux (rendez-vous lié à plusieurs pièces), on ne le touche pas.
  delete from alignements x
  where (select count(*) from alignements y where y.rdv = x.rdv and y.pos = x.pos) > 1;

  update public.appointments a
  set data = jsonb_set(a.data, '{payments}', (
    select jsonb_agg(
             case when m.rdv is null then v.e
                  else v.e || jsonb_build_object('id', m.vid_fac, 'invoiceId', m.facture)
                           || case when m.date_fac is not null then jsonb_build_object('date', m.date_fac) else '{}'::jsonb end
             end order by v.pos)
    from jsonb_array_elements(a.data->'payments') with ordinality v(e, pos)
    left join alignements m on m.rdv = a.id and m.pos = v.pos))
  where a.id in (select rdv from alignements)
    and jsonb_typeof(a.data->'payments') = 'array';

  -- ── Le compte rendu ─────────────────────────────────────────────
  select count(*), count(*) filter (where statut = 'honoré'),
         count(*) filter (where statut in ('confirmé', 'en attente')), coalesce(sum(cles_retirees), 0)
    into n_remis, n_honores, n_a_venir, n_cles from a_remettre;
  select count(*) filter (where genre = 'identifiant'), count(*) filter (where genre = 'redate'), count(distinct rdv)
    into n_ident, n_redate, n_touches from alignements;
  select count(distinct rdv) into n_reportes from reportes;

  insert into public.repli_0118_compte_rendu (compte_rendu) values (jsonb_build_object(
    'rendez_vous_remis', n_remis,
    'dont_honores_payes', n_honores,
    'dont_a_venir_ou_confirmes', n_a_venir,
    'cles_trop_longues_retirees', n_cles,
    'versements_identifiant_aligne', n_ident,
    'versements_redates_remis_a_la_date_de_la_facture', n_redate,
    'rendez_vous_touches_par_l_alignement', n_touches,
    'rendez_vous_a_venir_laisses_pour_plus_tard', n_reportes,
    'secours', (select count(*) from public.repli_0118_appointments),
    'trouve_avant', etat_avant
  ));

  drop table a_remettre;
  drop table alignements;
  drop table reportes;
end
$bloc$;

select to_char(fait_le at time zone 'Africa/Porto-Novo', 'DD/MM HH24:MI') as passe_le, jsonb_pretty(compte_rendu) as compte_rendu
from public.repli_0118_compte_rendu order by fait_le desc limit 1;
