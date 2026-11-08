-- ═══════════════════════════════════════════════════════════════════════
-- 0196 · LA NOTIFICATION DU POURBOIRE DIT SA PÉRIODE · 8 novembre 2026
--        Se rejoue sans danger (create or replace).
--
-- « Les pourboires du 6 au 4 du mois suivant sont payés le 5. » (Y., 8 nov.,
-- puis « oui, prépare ».) Le Trône compte déjà ainsi (periodeDesPourboires,
-- src/shared/periode-des-pourboires-pur.ts) ; 0157 notifiait encore un total
-- au mois civil. Ici le total de la notification est celui de la PÉRIODE du
-- pourboire, et le corps la dit : « Tes pourboires du 6 nov. au 4 déc. :
-- 1 750 F. » (même texte que notificationDuPourboire, côté TypeScript).
--
-- Rien d'autre ne change dans previens_du_pourboire : journal, idempotence,
-- jour de la part, plafond de cinq en dix minutes, compte, direction non
-- prévenue, refus de la fonction. Le déclencheur tips_previent (0157) reste.
-- ═══════════════════════════════════════════════════════════════════════

-- La période d'un jour : « AAAA-MM » du mois où elle COMMENCE (le 6).
-- JJ >= 6 : le mois même ; sinon le mois d'avant (3 janv. 2027 → 2026-12).
create or replace function public.periode_des_pourboires(jour date) returns text
language sql immutable as $$
  select to_char(
    case when extract(day from jour) >= 6 then jour
         else (date_trunc('month', jour) - interval '1 month')::date end,
    'YYYY-MM')
$$;

-- « du 6 nov. au 4 déc. » : le début, puis la fin le 4 du mois d'après.
create or replace function public.periode_dite(periode text) returns text
language sql immutable as $$
  select 'du 6 ' || (array['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'])[substr(periode, 6, 2)::int]
    || ' au 4 ' || (array['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'])[(substr(periode, 6, 2)::int % 12) + 1]
$$;

create or replace function public.previens_du_pourboire() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  part bigint;
  jour date;
  aujourdhui date := (now() at time zone 'Africa/Porto-Novo')::date;
  personne text := new.data ->> 'staffId';
  adresse text;
  compte uuid;
  prenom text;
  periode text;
  debut date;
  total bigint;
  titre text;
  corps text;
begin
  begin
    part := round((new.data ->> 'amountXof')::numeric);
    if personne is null or personne = '' or part is null or part <= 0 then
      return new;
    end if;
    jour := left(new.data ->> 'date', 10)::date;

    -- Une part, une seule fois : la ligne du journal se prend d'abord.
    insert into public.pourboires_prevenus (tip_id, staff_id) values (new.id, personne)
      on conflict (tip_id) do nothing;
    if not found then
      return new;
    end if;

    -- Le jour de la part juge : au-delà de deux jours, elle ne sonne pas.
    if jour < aujourdhui - 2 or jour > aujourdhui + 1 then
      update public.pourboires_prevenus set issue = 'ancien' where tip_id = new.id;
      return new;
    end if;

    -- Cinq au plus par personne en dix minutes.
    if (select count(*) from public.pourboires_prevenus
         where staff_id = personne and issue = 'parti' and tip_id <> new.id
           and prevenu_le > now() - interval '10 minutes') >= 5 then
      update public.pourboires_prevenus set issue = 'tempere' where tip_id = new.id;
      return new;
    end if;

    -- Son compte : l'adresse de sa fiche, comme est_ma_fiche (0090).
    select lower(coalesce(nullif(trim(t.data ->> 'compteMail'), ''), trim(t.data ->> 'email')))
      into adresse from public.team t where t.id = personne;
    if coalesce(adresse, '') = '' then
      update public.pourboires_prevenus set issue = 'sans-adresse' where tip_id = new.id;
      return new;
    end if;
    select u.id into compte from auth.users u where lower(u.email) = adresse limit 1;
    if compte is null or not exists (select 1 from public.staff s where s.user_id = compte) then
      update public.pourboires_prevenus set issue = 'sans-compte' where tip_id = new.id;
      return new;
    end if;
    -- La direction n'est pas prévenue (« Non, pas pour nous », Yéman,
    -- 5 novembre 2026) : elle voit tout dans Équipe › Les pourboires.
    if exists (select 1 from public.staff s where s.user_id = compte and s.role = 'souverain') then
      update public.pourboires_prevenus set issue = 'direction' where tip_id = new.id;
      return new;
    end if;

    -- ⟨notification-du-pourboire⟩ : sa part et le prénom ; son total de la PÉRIODE
    -- du pourboire (du 6 au 4, payée le 5), non plus du mois civil.
    prenom := public.prenom_de_la_cliente(new.data ->> 'note');
    periode := public.periode_des_pourboires(jour);
    debut := (periode || '-06')::date;
    select coalesce(sum(round((x.data ->> 'amountXof')::numeric)), 0)::bigint into total
      from public.tips x
     where x.data ->> 'staffId' = personne
       and left(x.data ->> 'date', 10) >= debut::text
       and left(x.data ->> 'date', 10) < (debut + interval '1 month')::date::text
       and coalesce((x.data ->> 'amountXof')::numeric, 0) > 0;
    titre := '+' || public.francs_dits(part) || ' de pourboire' || case when prenom <> '' then ' · ' || prenom else '' end;
    corps := 'Tes pourboires ' || public.periode_dite(periode) || ' : ' || public.francs_dits(total) || '.';

    begin
      perform public.appelle_fonction_edge('push-notify', jsonb_build_object(
        'mode', 'to-staff',
        'userId', compte::text,
        'title', titre,
        'body', corps,
        'url', '/trone/#/mon-mois',
        'tag', 'mnd-pourboire'
      ));
    exception when others then
      update public.pourboires_prevenus set issue = 'refuse : ' || left(sqlerrm, 120) where tip_id = new.id;
    end;
  exception when others then
    -- Jamais un pourboire refusé pour une notification.
    raise warning 'pourboire % : la notification ne part pas (%)', new.id, sqlerrm;
  end;
  return new;
end;
$$;
