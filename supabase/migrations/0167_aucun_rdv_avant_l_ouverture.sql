-- ═══════════════════════════════════════════════════════════════════════════
-- 0167 · AUCUN RENDEZ-VOUS AVANT L'OUVERTURE · 6 novembre 2026
--
-- « Assure-toi que les rendez-vous du samedi commencent toujours à 9 h.
-- Personne n'a le droit d'avoir dans son calendrier 8 h 30 un samedi. Le
-- problème s'est déjà posé dans le passé » (Yéman).
--
-- D'où venait-il : la reprise posée à la clôture (retirée le 4 novembre)
-- recopiait l'heure d'un rituel de semaine (8 h 30, la Maison ouvre à 8 h)
-- sur un samedi, qui ouvre à 9 h. Le Trône refuse désormais l'heure (le
-- blocage `sansPasseDroit` de rdv-fluide-pur, sans « Poser quand même ») ;
-- ici, le DERNIER MUR, pour tout chemin qui passerait quand même.
--
-- ① `ouverture_du_jour(date)` : l'heure d'ouverture d'une date, en minutes,
--    `null` quand la Maison est fermée ce jour-là. La même règle que
--    `ouvertureDuJour` (src/shared/agenda-pur.ts) : un jour fermé de la
--    semaine reste fermé ; une journée exceptionnelle de toute la Maison
--    (sans `staffId`) ferme, ou change l'heure d'ouverture ; une heure vide
--    garde celle de la semaine ; une graphie illisible vaut 9 h.
-- ② LE DÉCLENCHEUR REMET À L'OUVERTURE, IL NE REFUSE PAS. Un refus ferait
--    tomber toute la tranche d'envoi du Trône (jusqu'à 400 rendez-vous d'un
--    coup) pour une seule heure : le rendez-vous à venir, vivant, posé avant
--    l'ouverture d'un jour ouvert, prend l'heure d'ouverture. Seulement quand
--    son jour ou son heure change, ou qu'il naît : un rituel passé, honoré ou
--    annulé ne se touche pas. Un jour fermé ouvert exprès garde son heure.
--    Il passe avant `places_limitees` et `une_place_en_ligne` (ordre
--    alphabétique des déclencheurs BEFORE) : la place se juge à la bonne
--    heure.
-- ③ CE QUI EST DÉJÀ INSCRIT : les rendez-vous à venir posés avant
--    l'ouverture de leur jour passent à l'heure d'ouverture. Rien ne part
--    aux clientes d'ici : le rappel de la veille dira la bonne heure.
--
-- Rejouable : `create or replace`, `drop trigger if exists`, et ③ ne trouve
-- plus rien la seconde fois.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① L'HEURE D'OUVERTURE D'UNE DATE ───────────────────────────────────
create or replace function public.heure_de_la_maison_en_minutes(h text)
returns int
language sql
immutable
set search_path = public
as $$
  -- '09h30' → 570, '9h' → 540 ; illisible → 540, comme `hourToMin`.
  select coalesce(
    (select m[1]::int * 60 + coalesce(nullif(m[2], ''), '0')::int
       from regexp_match(btrim(coalesce(h, '')), '^(\d{1,2})h(\d{2})?$') as m),
    540);
$$;

create or replace function public.ouverture_du_jour(jour date)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cles constant text[] := array['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  semaine jsonb;
  ex jsonb;
begin
  select x into semaine
    from public.documents d,
         jsonb_array_elements(case when jsonb_typeof(d.data->'hours') = 'array' then d.data->'hours' else '[]'::jsonb end) x
   where d.key = 'mnd_settings'
     and x->>'key' = cles[extract(dow from jour)::int + 1]
   limit 1;
  -- Sans semaine connue, ou un jour que la semaine ferme : fermé.
  if semaine is null or coalesce((semaine->>'closed')::boolean, false) then
    return null;
  end if;
  select x into ex
    from public.documents d,
         jsonb_array_elements(case when jsonb_typeof(d.data) = 'array' then d.data else '[]'::jsonb end) x
   where d.key = 'mnd_horaires_exceptions'
     and x->>'date' = to_char(jour, 'YYYY-MM-DD')
     and coalesce(x->>'staffId', '') = ''
   limit 1;
  if ex is not null and coalesce((ex->>'closed')::boolean, false) then
    return null;
  end if;
  if ex is not null and btrim(coalesce(ex->>'open', '')) <> '' then
    return public.heure_de_la_maison_en_minutes(ex->>'open');
  end if;
  return public.heure_de_la_maison_en_minutes(semaine->>'open');
end;
$$;

-- ── ② LE DÉCLENCHEUR ───────────────────────────────────────────────────
create or replace function public.pas_avant_l_ouverture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jour  date;
  debut int;
  ouvre int;
begin
  if coalesce(new.data->>'status', '') in ('annulé', 'honoré') then
    return new;
  end if;
  if coalesce(new.data->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return new;
  end if;
  -- Une écriture qui ne change ni le jour ni l'heure ne se rejuge pas.
  if tg_op = 'UPDATE'
     and coalesce(old.data->>'date', '') = coalesce(new.data->>'date', '')
     and coalesce(old.data->>'time', '') = coalesce(new.data->>'time', '') then
    return new;
  end if;
  jour := (new.data->>'date')::date;
  if jour < (now() at time zone 'Africa/Porto-Novo')::date then
    return new;
  end if;
  debut := public.minutes_de_l_heure(new.data->>'time');
  if debut is null then
    return new;
  end if;
  ouvre := public.ouverture_du_jour(jour);
  if ouvre is null or debut >= ouvre then
    return new;
  end if;
  new.data := jsonb_set(new.data, '{time}',
    to_jsonb(lpad((ouvre / 60)::text, 2, '0') || ':' || lpad((ouvre % 60)::text, 2, '0')));
  return new;
end;
$$;

revoke all on function public.pas_avant_l_ouverture() from public, anon, authenticated;

drop trigger if exists pas_avant_l_ouverture on public.appointments;
create trigger pas_avant_l_ouverture
  before insert or update on public.appointments
  for each row execute function public.pas_avant_l_ouverture();

-- ── ③ CE QUI EST DÉJÀ INSCRIT ──────────────────────────────────────────
update public.appointments a
   set data = jsonb_set(a.data, '{time}',
         to_jsonb(lpad((public.ouverture_du_jour((a.data->>'date')::date) / 60)::text, 2, '0') || ':'
                  || lpad((public.ouverture_du_jour((a.data->>'date')::date) % 60)::text, 2, '0')))
 where coalesce(a.data->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
   and (a.data->>'date')::date >= (now() at time zone 'Africa/Porto-Novo')::date
   and coalesce(a.data->>'status', '') not in ('annulé', 'honoré')
   and public.minutes_de_l_heure(a.data->>'time') is not null
   and public.ouverture_du_jour((a.data->>'date')::date) is not null
   and public.minutes_de_l_heure(a.data->>'time') < public.ouverture_du_jour((a.data->>'date')::date);
