-- ═══════════════════════════════════════════════════════════════════════
-- 0195 · UN PLAN DU MOMENT CUIR CHEVELU PASSE DE TROIS À QUATRE VENUES
--        7 novembre 2026. ÉCRITE, NON APPLIQUÉE. Se rejoue sans danger.
--
-- « Il faut mettre 4 venues au total. Changer le Moment en 4 venues », puis
-- « Mettre chaque venue à 45 000 F » (un PRIX CONVENU, pas le prix de la grille
-- de sa tête) et « Les 4 venues sont sur le Moment cuir chevelu uniquement »
-- (Yéman). Le plan mt-31z2t1q7v9 (client MND-J5AK) :
--
--   avant : 28 nov. 2026 11 h (Le Moment cuir chevelu), 16 janv. 2027 12 h 30,
--           13 févr. 2027 11 h (deux venues d'entretien GBÈJÍ™ Signature),
--           trois parts de 42 000 F = 126 000 F (la grille de sa tête) ;
--   après : QUATRE venues, chacune LE MOMENT CUIR CHEVELU à 45 000 F, soit
--           180 000 F de prix convenu, plafond par venue 45 000 F :
--             1  sam. 28 nov. 2026   11 h     (rdv koxsmtq7v9, inchangé sauf la part)
--             2  sam. 19 déc. 2026   11 h     (NOUVEAU rdv, posé ici)
--             3  sam. 16 janv. 2027  12 h 30  (rdv xxj05gq7va, était rang 2)
--             4  sam. 13 févr. 2027  11 h     (rdv 7e88n4q7va, était rang 3)
--
-- RIEN NE S'ENCAISSE, rien ne se déplace d'argent : la migration REFUSE
-- (raise exception) si l'un des trois rendez-vous porte déjà un versement ou
-- une facture, si les identifiants, les dates ou les parts ne sont pas ceux-là,
-- ou si la place du maître est prise (autre rendez-vous, plage bloquée) à l'une
-- des quatre dates pour la durée du Moment. Elle ne touche à rien d'autre.
-- Les trois rendez-vous sont d'abord copiés dans repli_0195_appointments (RLS).
--
-- L'HEURE DE LA 4e VENUE (la nouvelle, le 19 déc.) : 11 h, comme le 28 nov. et le
-- 13 févr. ; la 16 janv. est à 12 h 30. L'agenda n'a pas été lu depuis cette
-- migration (aucun accès à la base) : le garde-fou ci-dessous le lit au moment de
-- lancer et s'arrête, en disant qui occupe la place, plutôt que de poser par-dessus.
--
-- LA DURÉE de chaque venue est celle du Moment cuir chevelu : celle figée sur le
-- premier rendez-vous (sa tête, son calibre), à défaut la durée du catalogue.
--
-- LECTURE SEULE, à passer avant (le même contrôle que le garde-fou, sans rien
-- écrire) : voir le bloc « select » en fin de fichier, en commentaire.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.repli_0195_appointments (like public.appointments including all);
alter table public.repli_0195_appointments enable row level security;

do $bloc$
declare
  plan constant text := 'mt-31z2t1q7v9';
  r1 constant text := 'koxsmtq7v9';
  r3 constant text := 'xxj05gq7va';
  r4 constant text := '7e88n4q7va';
  r2 constant text := 'mq4-19dec2026';          -- l'identifiant du nouveau rendez-vous (fixe : rejouable)
  moment constant text := 'sv-le-moment-cuir-chevelu';
  part constant int := 45000;
  total constant int := 180000;
  a1 public.appointments; a3 public.appointments; a4 public.appointments; a2 public.appointments;
  tiers jsonb := '[45000,45000,45000,45000]'::jsonb;
  duree int;
  poseAt text;
  maintenant text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  ids text[] := array[r1, r2, r3, r4];
  dates text[] := array['2026-11-28', '2026-12-19', '2027-01-16', '2027-02-13'];
  heures text[];
  i int;
  occupe record;
  debut int; fin int;
begin
  select * into a1 from public.appointments where id = r1;
  select * into a3 from public.appointments where id = r3;
  select * into a4 from public.appointments where id = r4;
  if a1.id is null or a3.id is null or a4.id is null then
    raise exception '0195 : les rendez-vous % / % / % ne sont pas tous là', r1, r3, r4;
  end if;

  -- Déjà fait : les trois portent quatre parts de 45 000 F et le 4e rendez-vous existe.
  if jsonb_array_length(coalesce(a1.data->'momentEnTrois'->'tiers', '[]'::jsonb)) = 4
     and exists (select 1 from public.appointments where id = r2) then
    raise notice '0195 : déjà passée, rien à faire';
    return;
  end if;

  -- Les identifiants sont bien ceux du plan, dans leur état d'avant : trois parts de 42 000 F, rangs 1, 2, 3.
  if a1.data->'momentEnTrois'->>'planId' is distinct from plan
     or a3.data->'momentEnTrois'->>'planId' is distinct from plan
     or a4.data->'momentEnTrois'->>'planId' is distinct from plan then
    raise exception '0195 : ces rendez-vous ne sont pas du plan %', plan;
  end if;
  if (a1.data->'momentEnTrois'->>'rang')::int <> 1 or (a3.data->'momentEnTrois'->>'rang')::int <> 2 or (a4.data->'momentEnTrois'->>'rang')::int <> 3
     or a1.data->'momentEnTrois'->'tiers' is distinct from '[42000,42000,42000]'::jsonb
     or (a1.data->'momentEnTrois'->>'total')::int <> 126000 then
    raise exception '0195 : le plan n''est pas dans l''état attendu (rangs 1, 2, 3 ; trois parts de 42 000 F ; 126 000 F)';
  end if;
  if a1.data->>'date' <> dates[1] or a3.data->>'date' <> dates[3] or a4.data->>'date' <> dates[4]
     or a1.data->>'time' <> '11:00' or a3.data->>'time' <> '12:30' or a4.data->>'time' <> '11:00' then
    raise exception '0195 : les dates ou les heures ne sont pas celles attendues (28 nov. 11 h, 16 janv. 12 h 30, 13 févr. 11 h)';
  end if;
  if a1.data->'serviceIds' is distinct from jsonb_build_array(moment) then
    raise exception '0195 : le premier rendez-vous n''est pas Le Moment cuir chevelu';
  end if;
  if a1.data->>'clientId' is distinct from a3.data->>'clientId' or a1.data->>'clientId' is distinct from a4.data->>'clientId' then
    raise exception '0195 : les trois rendez-vous ne sont pas de la même cliente';
  end if;
  if a1.data->>'status' = 'annulé' or a3.data->>'status' = 'annulé' or a4.data->>'status' = 'annulé' then
    raise exception '0195 : un rendez-vous du plan est annulé';
  end if;

  -- AUCUN VERSEMENT NI FACTURE : rien d'encaissé, rien n'est réécrit sur de l'argent.
  if exists (
    select 1 from public.appointments x
    where x.id in (r1, r3, r4)
      and (coalesce((x.data->>'paidXof')::numeric, 0) > 0
           or jsonb_array_length(case when jsonb_typeof(x.data->'payments') = 'array' then x.data->'payments' else '[]'::jsonb end) > 0
           or nullif(x.data->>'invoiceId', '') is not null)
  ) or exists (
    select 1 from public.invoices i where i.data->>'apptId' in (r1, r3, r4)
  ) then
    raise exception '0195 : un des trois rendez-vous porte déjà un versement ou une facture ; rien n''est écrit';
  end if;

  -- La durée : celle du Moment cuir chevelu (figée sur le premier rendez-vous, sinon le catalogue).
  select coalesce(nullif(a1.data->>'dureeMin', '')::int, (select (data->>'durationMin')::int from public.catalog_services where id = moment), 240)
    into duree;
  poseAt := coalesce(a1.data->'forfait'->>'poseAt', to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD'));
  heures := array['11:00', '11:00', '12:30', '11:00'];

  -- LA PLACE DU MAÎTRE, aux quatre dates et pour la durée du Moment : un autre rendez-vous (non annulé) ou une plage bloquée.
  for i in 1..4 loop
    debut := split_part(heures[i], ':', 1)::int * 60 + split_part(heures[i], ':', 2)::int;
    fin := debut + duree;
    for occupe in
      select x.id, x.data->>'time' as t, coalesce(nullif(x.data->>'dureeMin', '')::int, 60) as d
        from public.appointments x
       where x.id <> all (ids)
         and x.data->>'date' = dates[i]
         and coalesce(x.data->>'status', '') <> 'annulé'
         and x.data->>'master' is not distinct from a1.data->>'master'
         and x.data->>'time' ~ '^\d{1,2}:\d{2}$'
         and split_part(x.data->>'time', ':', 1)::int * 60 + split_part(x.data->>'time', ':', 2)::int < fin
         and split_part(x.data->>'time', ':', 1)::int * 60 + split_part(x.data->>'time', ':', 2)::int + coalesce(nullif(x.data->>'dureeMin', '')::int, 60) > debut
    loop
      raise exception '0195 : la place du maître est prise le % à % (% minutes) : rendez-vous % à % ; rien n''est écrit', dates[i], heures[i], duree, occupe.id, occupe.t;
    end loop;
    for occupe in
      select b.id, b.data->>'debut' as t0, b.data->>'fin' as t1
        from public.blocages b
       where b.data->>'date' = dates[i]
         and (b.data->>'master' is null or b.data->>'master' = '' or b.data->>'master' = a1.data->>'master')
         and coalesce((regexp_match(b.data->>'debut', '^(\d{1,2})[h:](\d{2})$'))[1]::int * 60 + (regexp_match(b.data->>'debut', '^(\d{1,2})[h:](\d{2})$'))[2]::int, 0) < fin
         and coalesce((regexp_match(b.data->>'fin', '^(\d{1,2})[h:](\d{2})$'))[1]::int * 60 + (regexp_match(b.data->>'fin', '^(\d{1,2})[h:](\d{2})$'))[2]::int, 24 * 60) > debut
    loop
      raise exception '0195 : une plage est bloquée le % (% à %, blocage %) ; rien n''est écrit', dates[i], occupe.t0, occupe.t1, occupe.id;
    end loop;
  end loop;

  -- La copie de repli, avant d'écrire.
  insert into public.repli_0195_appointments select * from public.appointments where id in (r1, r3, r4) on conflict (id) do nothing;

  -- Les trois rendez-vous existants : rang, quatre parts, prix figé 45 000 F, et le Moment cuir chevelu (pour les rangs 3 et 4).
  update public.appointments set data =
    data
    || jsonb_build_object(
         'momentEnTrois', jsonb_build_object('planId', plan, 'rang', 1, 'total', total, 'tiers', tiers, 'plafondParVenueXof', part),
         'forfait', jsonb_build_object('nom', 'Le Moment en quatre venues · venue 1 sur 4', 'totalXof', part, 'baseXof', part, 'poseAt', poseAt),
         'priceXof', part)
   where id = r1;

  update public.appointments set data =
    data
    || jsonb_build_object(
         'serviceIds', a1.data->'serviceIds', 'dureeMin', duree,
         'momentEnTrois', jsonb_build_object('planId', plan, 'rang', 3, 'total', total, 'tiers', tiers, 'plafondParVenueXof', part),
         'forfait', jsonb_build_object('nom', 'Le Moment en quatre venues · venue 3 sur 4', 'totalXof', part, 'baseXof', part, 'poseAt', poseAt),
         'priceXof', part)
   where id = r3;

  update public.appointments set data =
    data
    || jsonb_build_object(
         'serviceIds', a1.data->'serviceIds', 'dureeMin', duree,
         'momentEnTrois', jsonb_build_object('planId', plan, 'rang', 4, 'total', total, 'tiers', tiers, 'plafondParVenueXof', part),
         'forfait', jsonb_build_object('nom', 'Le Moment en quatre venues · venue 4 sur 4', 'totalXof', part, 'baseXof', part, 'poseAt', poseAt),
         'priceXof', part)
   where id = r4;

  -- LE NOUVEAU RENDEZ-VOUS du sam. 19 déc. 2026 : les mêmes champs que la venue du 16 janv. (même cliente, même maître,
  -- même numéro à prévenir, mêmes réglages de message), le Moment cuir chevelu, rang 2.
  insert into public.appointments (id, branch_id, data)
  select r2, a3.branch_id,
         (a3.data
         || jsonb_build_object(
              'id', r2, 'date', dates[2], 'time', heures[2], 'serviceIds', a1.data->'serviceIds', 'dureeMin', duree,
              'status', coalesce(a3.data->>'status', 'confirmé'), 'creeLe', maintenant,
              'momentEnTrois', jsonb_build_object('planId', plan, 'rang', 2, 'total', total, 'tiers', tiers, 'plafondParVenueXof', part),
              'forfait', jsonb_build_object('nom', 'Le Moment en quatre venues · venue 2 sur 4', 'totalXof', part, 'baseXof', part, 'poseAt', poseAt),
              'priceXof', part))
         - 'invoiceId' - 'payments' - 'paidXof'
  on conflict (id) do nothing;
end
$bloc$;

-- ─── LECTURE SEULE : à passer AVANT, pour voir la place du maître aux quatre dates (rien ne s'écrit) ───
-- select x.id, x.data->>'date' d, x.data->>'time' t, x.data->>'dureeMin' duree, x.data->>'master' maitre, x.data->>'status' statut
--   from public.appointments x
--  where x.data->>'date' in ('2026-11-28', '2026-12-19', '2027-01-16', '2027-02-13')
--    and x.data->>'master' = (select data->>'master' from public.appointments where id = 'koxsmtq7v9')
--    and coalesce(x.data->>'status', '') <> 'annulé'
--  order by d, t;
-- select b.id, b.data from public.blocages b where b.data->>'date' in ('2026-11-28', '2026-12-19', '2027-01-16', '2027-02-13');
