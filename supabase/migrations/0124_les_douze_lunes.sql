-- ═══════════════════════════════════════════════════════════════════
-- 0124 · DE MAIN EN MAIN : LA GARDE DE LA BASE · 9 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase → SQL Editor, puis Run. Le soir du
-- lancement, hors des heures d'ouverture : AVANT de recoller l'Edge
-- demande-submit, AVANT le geste « Lancer » du Trône. Se rejoue sans danger.
--
-- Le nouveau programme d'ambassadrices, « De main en main » : la carte ne se
-- donne plus à toutes, elle se gagne à la Maison. À sa Nᵉ visite honorée,
-- une cliente devient Graine ; le Trône écrit sur sa fiche `graine` (son
-- code, la décision) et range l'ancien programme dans `avantLesDouzeLunes`
-- (l'archive qui sert à revenir en arrière). Le document `mnd_douze_lunes`
-- porte N et, posé EN DERNIER par le geste, `lanceLe`.
--
--   1. Le secours : repli_0124_clients, les fiches telles qu'avant le geste.
--   2. douze_lunes_garde, une fonction pure : ce qu'un poste du Trône a le
--      droit d'écrire une fois le programme lancé.
--   3. UN SEUL BLOC : le secours se remplit, puis le banc éprouve la garde
--      dans les deux sens. Un seul cas faux, et l'éditeur s'arrête là : le
--      secours reste vide, le déclencheur et les politiques restent ceux
--      de 0111.
--   4. Le déclencheur des fiches, réécrit :
--      · auth.uid() vide (l'éditeur SQL, la clé de service des fonctions
--        Edge) : confiance, comme depuis 0110 (leçon du 10 août) ;
--      · la cliente (Ma Couronne) : SEPT champs réimposés depuis la ligne
--        existante, les cinq de 0111 plus `graine` et l'archive. Sa couleur
--        de carte et son choix de récompense restent à elle ;
--      · le personnel : tant que `lanceLe` est absent, rien ne change. Dès
--        qu'il est posé, chaque écriture passe par la garde. C'est la seule
--        chose qui arrête un vieux poste resté ouvert sans recharger
--        (version.ts ne recharge qu'à l'ouverture ou au retour au premier
--        plan).
--   5. Le classement du mois n'est plus montré aux clientes (décision 6) ;
--      N et le lancement deviennent lisibles par elles (« votre Graine dans
--      n visites »), jamais par le site public.
--
-- CE QUE LA GARDE REFUSE, une fois lancé :
--   (a) un code de parrainage neuf qui n'est pas celui de la Graine de la
--       fiche : l'ancien revient, ou rien ;
--   (b) une Graine posée qui change ou disparaît : elle revient ;
--   (c) une récompense qui n'était pas déjà sur la fiche et qui est un
--       écho, un rang ou un défi ; ou une récompense que le geste a rangée
--       dans l'archive (une fiche d'avant le geste, renvoyée par un poste
--       qui n'a pas vu passer le lancement, la rapporterait : la cliente la
--       reverrait dans Ma Couronne, la caisse la consommerait) ; ou un merci
--       posé sur une fiche qui n'est pas Graine (l'ancien moteur d'un vieux
--       poste, qui ne connaît pas la Graine) ;
--   (d) une archive réécrite ou retirée : elle revient.
-- (b) et (d) vont plus loin que la première étude, qui ne gardait la Graine
-- que contre un autre code : une fiche « périmée » renvoyée par un vieux
-- poste effacerait sinon l'archive, seul chemin du retour. Le retour en
-- arrière retire donc `lanceLe` D'ABORD et attend que la base l'ait lu ;
-- avant cela, la garde lui rend la Graine, l'archive et le code.
--
-- CE QU'ELLE NE TOUCHE PAS : le lien d'une amie (`parraineePar`,
-- `parraineeLe`). Une amie invitée avant le lancement et venue après vaut
-- son merci à sa marraine devenue Graine (décision 5). Ni le résumé, ni les
-- mercis, ni le Foyer, ni ce que la caisse écrit sur une récompense déjà là.
--
-- RETOUR EN ARRIÈRE : l'archive de chaque fiche (bouton du Trône), puis
-- repli_0124_clients. Pour défaire la garde elle-même : recoller 0111.
-- ═══════════════════════════════════════════════════════════════════


-- ── 1. LE SECOURS, protégé dès sa naissance ────────────────────────
create table if not exists public.repli_0124_clients (like public.clients including all);
alter table public.repli_0124_clients enable row level security;


-- ── 2. LA GARDE, pure : elle ne lit aucune table ───────────────────
-- `ancien` : la ligne en base (null pour une fiche neuve) ; `neuf` : ce que
-- le poste envoie ; `lance` : l'instant du lancement, null tant qu'il n'a
-- pas eu lieu. Rend ce qui s'écrit.
create or replace function public.douze_lunes_garde(ancien jsonb, neuf jsonb, lance text)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  sortie jsonb := neuf;
  code_neuf text;
begin
  if nullif(btrim(lance), '') is null or neuf is null or jsonb_typeof(neuf) <> 'object' then
    return neuf;
  end if;

  -- (b) La Graine est une décision : posée, elle ne change plus.
  if jsonb_typeof(ancien -> 'graine') = 'object' then
    sortie := sortie || jsonb_build_object('graine', ancien -> 'graine');
  end if;

  -- (d) L'archive s'écrit une fois.
  if jsonb_typeof(ancien -> 'avantLesDouzeLunes') = 'object' then
    sortie := sortie || jsonb_build_object('avantLesDouzeLunes', ancien -> 'avantLesDouzeLunes');
  end if;

  -- (a) Le code : celui de la Graine, ou celui que la ligne porte déjà.
  code_neuf := sortie ->> 'codeParrain';
  if code_neuf is not null
     and code_neuf is distinct from (ancien ->> 'codeParrain')
     and code_neuf is distinct from (sortie -> 'graine' ->> 'code') then
    sortie := sortie - 'codeParrain';
    if (ancien -> 'codeParrain') is not null then
      sortie := sortie || jsonb_build_object('codeParrain', ancien -> 'codeParrain');
    end if;
  end if;

  -- (c) Les récompenses. Ce qui était déjà sur la ligne reste (la caisse
  -- peut le consommer), le Foyer passe, l'ordre de la liste est gardé. Ce
  -- qui n'y était pas ne passe pas quand c'est :
  --   · un écho, un rang ou un défi ;
  --   · une récompense rangée dans l'archive de la ligne par le geste (la
  --     fiche d'avant le geste, renvoyée par un poste périmé, la ramènerait) ;
  --   · un merci (parr-, source amie) sur une fiche sans Graine.
  if jsonb_typeof(sortie -> 'soinsOfferts') = 'array' then
    sortie := sortie || jsonb_build_object('soinsOfferts', coalesce((
      select jsonb_agg(s.e order by s.pos)
      from jsonb_array_elements(sortie -> 'soinsOfferts') with ordinality as s(e, pos)
      where exists (
          select 1
          from jsonb_array_elements(case when jsonb_typeof(ancien -> 'soinsOfferts') = 'array'
                                         then ancien -> 'soinsOfferts' else '[]'::jsonb end) as a(e)
          where (a.e ->> 'id') = (s.e ->> 'id'))
        or not (
          coalesce(s.e ->> 'source', '') in ('echo', 'defi', 'rang')
          or coalesce(s.e ->> 'id', '') ~ '^(echo|defi|rang)-'
          or exists (
            select 1
            from jsonb_array_elements(case when jsonb_typeof(ancien -> 'avantLesDouzeLunes' -> 'soinsRetires') = 'array'
                                           then ancien -> 'avantLesDouzeLunes' -> 'soinsRetires' else '[]'::jsonb end) as r(e)
            where (r.e ->> 'id') = (s.e ->> 'id'))
          or ((coalesce(s.e ->> 'source', '') = 'amie' or coalesce(s.e ->> 'id', '') ~ '^parr-')
              and jsonb_typeof(sortie -> 'graine') is distinct from 'object'))
    ), '[]'::jsonb));
  end if;

  return sortie;
end $$;


-- ── 3. UN SEUL BLOC : le secours, puis le banc ─────────────────────
-- Le banc dit ce qui est PROMIS, écrit à la main : un cas « passe » doit
-- rendre la fiche envoyée telle quelle, un cas « refuse » doit rendre ce
-- qu'il annonce, et qui n'est pas la fiche envoyée. Un banc qui n'éprouve
-- qu'un sens arrête tout lui aussi.
do $bloc$
declare
  quand text := '2026-10-09T20:00:00.000Z';
  la_graine jsonb := '{"code": "ADJOA-Q2X", "le": "2026-10-09", "atteinteLe": "2026-08-14", "seuil": 5}';
  une_autre jsonb := '{"code": "ADJOA-Z9Z", "le": "2026-10-10", "atteinteLe": "2026-10-10", "seuil": 5}';
  l_archive jsonb := '{"le": "2026-10-09T20:00:00.000Z", "codeParrain": "ADJOA-K7M", "parrainage": {"rang": "graine"}, "soinsRetires": [{"id": "echo-f2-1", "source": "echo"}], "ordreDesSoins": ["echo-f2-1", "foyer-x1"]}';
  l_echo jsonb := '{"id": "echo-f2-1", "source": "echo"}';
  le_merci_range jsonb := '{"id": "parr-c-f9", "source": "amie", "poseLe": "2026-09-01", "expireLe": "2027-03-01"}';
  l_archive_merci jsonb := '{"le": "2026-10-09T20:00:00.000Z", "codeParrain": "ADJOA-K7M", "soinsRetires": [{"id": "parr-c-f9", "source": "amie", "poseLe": "2026-09-01", "expireLe": "2027-03-01"}], "ordreDesSoins": ["parr-c-f9", "foyer-x1"]}';
  le_foyer jsonb := '{"id": "foyer-x1", "source": "foyer"}';
  cas record;
  voulu jsonb;
  obtenu jsonb;
  echecs text[] := '{}';
  passes int := 0;
  refuses int := 0;
begin
  -- Le secours, rempli UNE fois : un second passage ne mêle pas les fiches
  -- d'après le geste à celles d'avant.
  insert into public.repli_0124_clients select * from public.clients
  where not exists (select 1 from public.repli_0124_clients);

  for cas in
    select * from (values
      -- Avant le lancement, la garde dort : tout passe.
      ('passe'::text, 'avant le lancement, un ancien code passe'::text,
        '{}'::jsonb, '{"codeParrain": "ADJOA-K7M"}'::jsonb, null::text, null::jsonb),
      ('passe', 'avant le lancement, un écho neuf passe',
        '{"soinsOfferts": []}', jsonb_build_object('soinsOfferts', jsonb_build_array(l_echo)), null, null),
      ('passe', 'lancement annulé : le retour rend l''ancien code et retire Graine et archive',
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X', 'avantLesDouzeLunes', l_archive,
                           'soinsOfferts', jsonb_build_array(le_foyer)),
        jsonb_build_object('codeParrain', 'ADJOA-K7M', 'parrainage', '{"rang": "graine"}'::jsonb,
                           'soinsOfferts', jsonb_build_array(l_echo, le_foyer)), null, null),
      ('passe', 'un lancement vide ne compte pas',
        '{}', '{"codeParrain": "ADJOA-K7M"}', '', null),

      -- Après le lancement : ce qui passe.
      ('passe', 'la Graine se pose avec son code',
        '{"name": "Adjoa Mensah"}',
        jsonb_build_object('name', 'Adjoa Mensah', 'graine', la_graine, 'codeParrain', 'ADJOA-Q2X'), quand, null),
      ('passe', 'la relance du geste range l''ancien programme et pose la Graine',
        jsonb_build_object('codeParrain', 'ADJOA-K7M', 'parrainage', '{"rang": "graine"}'::jsonb,
                           'soinsOfferts', jsonb_build_array(l_echo, le_foyer)),
        jsonb_build_object('avantLesDouzeLunes', l_archive, 'soinsOfferts', jsonb_build_array(le_foyer),
                           'graine', la_graine, 'codeParrain', 'ADJOA-Q2X'), quand, null),
      ('passe', 'un écho déjà là, consommé à la caisse, reste',
        jsonb_build_object('soinsOfferts', jsonb_build_array(l_echo)),
        '{"soinsOfferts": [{"id": "echo-f2-1", "source": "echo", "utiliseLe": "2026-10-12", "piece": "F-2026-0420"}]}', quand, null),
      ('passe', 'un merci, un Foyer et le résumé neufs passent, dans leur ordre',
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X', 'soinsOfferts', jsonb_build_array(le_foyer)),
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X',
                           'parrainage', '{"filleules": [{"prenom": "Afi", "etat": "venue"}]}'::jsonb,
                           'soinsOfferts', '[{"id": "parr-c-f9", "source": "amie"}, {"id": "foyer-x1", "source": "foyer"}, {"id": "foyer-x2", "source": "foyer"}]'::jsonb),
        quand, null),
      ('passe', 'sur une Graine dont l''archive range un merci, un merci NEUF passe',
        jsonb_build_object('graine', la_graine, 'avantLesDouzeLunes', l_archive_merci, 'soinsOfferts', '[]'::jsonb),
        jsonb_build_object('graine', la_graine, 'avantLesDouzeLunes', l_archive_merci,
                           'soinsOfferts', '[{"id": "parr-c-f10", "source": "amie"}]'::jsonb), quand, null),
      ('passe', 'un merci déjà sur une fiche sans Graine reste, la caisse le consomme',
        '{"soinsOfferts": [{"id": "parr-c-f12", "source": "amie"}]}',
        '{"soinsOfferts": [{"id": "parr-c-f12", "source": "amie", "utiliseLe": "2026-10-12", "piece": "F-2026-0421"}]}', quand, null),
      ('passe', 'le lien d''une amie invitée avant le lancement reste (décision 5)',
        '{"parraineePar": "ADJOA-K7M", "parraineeLe": "2026-09-30"}',
        '{"parraineePar": "ADJOA-K7M", "parraineeLe": "2026-09-30", "note": "venue le 12"}', quand, null),
      ('passe', 'un lien posé après le lancement passe',
        '{}', '{"parraineePar": "ADJOA-Q2X", "parraineeLe": "2026-10-12"}', quand, null),
      ('passe', 'une fiche archivée garde sa Graine',
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X'),
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X', 'archived', true), quand, null),
      ('passe', 'un ancien code que la ligne porte déjà reste jusqu''à la relance du geste',
        '{"codeParrain": "ADJOA-K7M"}', '{"codeParrain": "ADJOA-K7M", "note": "rappeler"}', quand, null),

      -- Après le lancement : ce qui est refusé.
      ('refuse', 'un vieux poste repose un ancien code',
        jsonb_build_object('avantLesDouzeLunes', l_archive),
        jsonb_build_object('avantLesDouzeLunes', l_archive, 'codeParrain', 'ADJOA-K7M'), quand,
        jsonb_build_object('avantLesDouzeLunes', l_archive)),
      ('refuse', 'un ancien code ne remplace pas celui de la Graine',
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X'),
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-K7M'), quand,
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X')),
      ('refuse', 'une Graine ne change pas de code',
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X'),
        jsonb_build_object('graine', une_autre, 'codeParrain', 'ADJOA-Z9Z'), quand,
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X')),
      ('refuse', 'une fiche périmée ne retire ni la Graine ni l''archive',
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X', 'avantLesDouzeLunes', l_archive),
        jsonb_build_object('codeParrain', 'ADJOA-K7M', 'soinsOfferts', jsonb_build_array(l_echo, le_foyer)), quand,
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X', 'avantLesDouzeLunes', l_archive,
                           'soinsOfferts', jsonb_build_array(le_foyer))),
      ('refuse', 'l''archive ne se réécrit pas',
        jsonb_build_object('avantLesDouzeLunes', l_archive),
        '{"avantLesDouzeLunes": {"le": "2026-10-11T08:00:00.000Z", "soinsRetires": []}}', quand,
        jsonb_build_object('avantLesDouzeLunes', l_archive)),
      ('refuse', 'un écho neuf est retiré',
        jsonb_build_object('soinsOfferts', jsonb_build_array(le_foyer)),
        '{"soinsOfferts": [{"id": "foyer-x1", "source": "foyer"}, {"id": "echo-f2-2", "source": "echo"}]}', quand,
        jsonb_build_object('soinsOfferts', jsonb_build_array(le_foyer))),
      ('refuse', 'un défi et deux rangs neufs sont retirés, par leur identifiant ou leur source',
        jsonb_build_object('graine', la_graine, 'soinsOfferts', '[]'::jsonb),
        jsonb_build_object('graine', la_graine, 'soinsOfferts',
          '[{"id": "defi-2026-10"}, {"id": "rang-tresse"}, {"id": "s-77", "source": "rang"}, {"id": "parr-c-f9", "source": "amie"}]'::jsonb), quand,
        jsonb_build_object('graine', la_graine, 'soinsOfferts', '[{"id": "parr-c-f9", "source": "amie"}]'::jsonb)),
      ('refuse', 'un merci rangé dans l''archive par le geste ne revient pas avec une fiche périmée',
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X', 'avantLesDouzeLunes', l_archive_merci,
                           'soinsOfferts', jsonb_build_array(le_foyer)),
        jsonb_build_object('codeParrain', 'ADJOA-K7M', 'soinsOfferts', jsonb_build_array(le_merci_range, le_foyer), 'note', 'rappeler'), quand,
        jsonb_build_object('graine', la_graine, 'codeParrain', 'ADJOA-Q2X', 'avantLesDouzeLunes', l_archive_merci,
                           'soinsOfferts', jsonb_build_array(le_foyer), 'note', 'rappeler')),
      ('refuse', 'un merci neuf sur une fiche sans Graine est retiré (l''ancien moteur d''un vieux poste)',
        jsonb_build_object('avantLesDouzeLunes', l_archive, 'soinsOfferts', '[]'::jsonb),
        jsonb_build_object('avantLesDouzeLunes', l_archive, 'soinsOfferts', '[{"id": "parr-c-f11", "source": "amie"}, {"id": "parr-d-77"}]'::jsonb), quand,
        jsonb_build_object('avantLesDouzeLunes', l_archive, 'soinsOfferts', '[]'::jsonb)),
      ('refuse', 'une fiche neuve naît sans ancien code ni écho',
        null, '{"name": "Adjoa Mensah", "codeParrain": "ADJOA-K7M", "soinsOfferts": [{"id": "echo-f2-1", "source": "echo"}]}', quand,
        '{"name": "Adjoa Mensah", "soinsOfferts": []}')
    ) as banc(sens, nom, ancien, neuf, lance, attendu)
  loop
    if cas.sens = 'passe' then
      passes := passes + 1;
      voulu := cas.neuf;
    elsif cas.sens = 'refuse' and cas.attendu is not null and cas.attendu is distinct from cas.neuf then
      refuses := refuses + 1;
      voulu := cas.attendu;
    else
      echecs := echecs || format('%s : cas mal écrit (un refus annonce autre chose que la fiche envoyée)', cas.nom);
      continue;
    end if;
    obtenu := public.douze_lunes_garde(cas.ancien, cas.neuf, cas.lance);
    if obtenu is distinct from voulu then
      echecs := echecs || format('%s : attendu %s, obtenu %s', cas.nom, voulu, obtenu);
    end if;
  end loop;

  if passes = 0 or refuses = 0 then
    raise exception 'Le banc de la garde doit éprouver les deux sens (passe : %, refuse : %). Rien n''est changé.', passes, refuses;
  end if;
  if cardinality(echecs) > 0 then
    raise exception 'La garde ne tient pas (% cas sur %). Rien n''est changé. %',
      cardinality(echecs), passes + refuses, array_to_string(echecs, ' | ');
  end if;
  raise notice 'Banc de la garde : % cas passent, % sont refusés, comme promis.', passes, refuses;
end
$bloc$;


-- ── 4. LE DÉCLENCHEUR DES FICHES ───────────────────────────────────
create or replace function public.clients_protege_parrainage()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  lance text;
begin
  -- L'éditeur SQL et les fonctions Edge (clé de service) : confiance.
  if auth.uid() is null then return new; end if;

  -- Le personnel tient la carte, le résumé, les récompenses, la Graine.
  -- Une fois le programme lancé, la garde juge ce qu'il envoie. La synchro
  -- écrit par upsert : la base passe d'abord par l'INSERT, sans la ligne
  -- existante, puis par l'UPDATE. La garde juge donc à l'UPDATE, et à
  -- l'INSERT seulement pour une fiche vraiment neuve (sinon elle prendrait
  -- tout ce que la fiche porte déjà pour du neuf).
  if public.is_staff() then
    lance := (select nullif(btrim(d.data ->> 'lanceLe'), '') from public.documents d where d.key = 'mnd_douze_lunes');
    if lance is null then return new; end if;
    if tg_op = 'UPDATE' then
      new.data := public.douze_lunes_garde(old.data, new.data, lance);
    elsif not exists (select 1 from public.clients c where c.id = new.id) then
      new.data := public.douze_lunes_garde(null, new.data, lance);
    end if;
    return new;
  end if;

  -- La cliente : une fiche qu'elle crée naît sans rien de tout cela.
  if tg_op = 'INSERT' then
    new.data := new.data - 'codeParrain' - 'parrainage' - 'soinsOfferts' - 'parraineePar' - 'parraineeLe'
                         - 'graine' - 'avantLesDouzeLunes';
    return new;
  end if;

  -- Sinon, les sept champs reviennent tels que la ligne les porte : ceux
  -- qu'elle n'a pas restent absents (plus de jsonb_strip_nulls, qui ôtait
  -- aussi les null rangés à l'intérieur de la Graine ou de l'archive).
  new.data := (new.data - 'codeParrain' - 'parrainage' - 'soinsOfferts' - 'parraineePar' - 'parraineeLe'
                        - 'graine' - 'avantLesDouzeLunes')
              || (select coalesce(jsonb_object_agg(champ.key, champ.value), '{}'::jsonb)
                  from jsonb_each(jsonb_build_object(
                         'codeParrain', old.data -> 'codeParrain',
                         'parrainage', old.data -> 'parrainage',
                         'soinsOfferts', old.data -> 'soinsOfferts',
                         'parraineePar', old.data -> 'parraineePar',
                         'parraineeLe', old.data -> 'parraineeLe',
                         'graine', old.data -> 'graine',
                         'avantLesDouzeLunes', old.data -> 'avantLesDouzeLunes')) as champ
                  where old.data ? champ.key);
  return new;
end $$;

drop trigger if exists clients_protege_parrainage on public.clients;
create trigger clients_protege_parrainage
  before insert or update on public.clients
  for each row execute function public.clients_protege_parrainage();


-- ── 5. CE QUE LES CLIENTES CONNECTÉES LISENT ───────────────────────
-- Le classement du mois reste au personnel (docs_staff_all, 0006).
drop policy if exists docs_ambassade_read on public.documents;
drop policy if exists docs_douze_lunes_read on public.documents;
create policy docs_douze_lunes_read on public.documents for select to authenticated
  using (key = 'mnd_douze_lunes');


-- ── LE CONTRÔLE, en lignes de résultat (l'éditeur n'affiche pas les NOTICE)
-- Avant le geste, les lignes 9, 10 et 12 comptent l'ancien programme.
-- Relancer ce même select après le geste : elles doivent dire 0. La ligne
-- 11 dit 0 toujours.
select n, quoi, etat from (
  select 1 as n, 'déclencheur des fiches' as quoi,
         case when exists (select 1 from pg_trigger where tgrelid = 'public.clients'::regclass
                             and tgname = 'clients_protege_parrainage' and tgenabled <> 'D')
              then 'actif' else 'ABSENT' end as etat
  union all
  select 2, 'champs gardés aux clientes',
         (select count(*) from unnest(array['codeParrain', 'parrainage', 'soinsOfferts', 'parraineePar',
                                            'parraineeLe', 'graine', 'avantLesDouzeLunes']) as champ(k)
           where pg_get_functiondef('public.clients_protege_parrainage()'::regprocedure)
                 like '%''' || champ.k || ''', old.data -> ''' || champ.k || '''%')::text || ' sur 7'
  union all
  select 3, 'garde du personnel une fois lancé',
         case when pg_get_functiondef('public.clients_protege_parrainage()'::regprocedure)
                   like '%public.douze_lunes_garde(old.data, new.data, lance)%'
              then 'en place' else 'ABSENTE' end
  union all
  select 4, 'banc de la garde',
         case when public.douze_lunes_garde('{}'::jsonb, '{"codeParrain": "ADJOA-K7M"}'::jsonb, '2026-10-09T20:00:00.000Z') = '{}'::jsonb
               and public.douze_lunes_garde('{}'::jsonb, '{"graine": {"code": "ADJOA-Q2X"}, "codeParrain": "ADJOA-Q2X"}'::jsonb, '2026-10-09T20:00:00.000Z')
                   = '{"graine": {"code": "ADJOA-Q2X"}, "codeParrain": "ADJOA-Q2X"}'::jsonb
               and public.douze_lunes_garde('{}'::jsonb, '{"codeParrain": "ADJOA-K7M"}'::jsonb, null) = '{"codeParrain": "ADJOA-K7M"}'::jsonb
              then 'tient : un ancien code refusé, le code d''une Graine passe'
              else 'NE TIENT PAS' end
  union all
  select 5, 'N et le lancement lisibles par les clientes connectées',
         case when exists (select 1 from pg_policy where polrelid = 'public.documents'::regclass
                             and polname = 'docs_douze_lunes_read')
              then 'oui' else 'NON' end
  union all
  select 6, 'classement du mois montré aux clientes',
         case when exists (select 1 from pg_policy where polrelid = 'public.documents'::regclass
                             and polname = 'docs_ambassade_read')
              then 'ENCORE OUVERT' else 'non, le personnel seul le voit' end
  union all
  select 7, 'secours repli_0124_clients',
         (select count(*) from public.repli_0124_clients)::text || ' lignes pour '
         || (select count(*) from public.clients)::text || ' fiches · RLS '
         || case when (select relrowsecurity from pg_class where oid = 'public.repli_0124_clients'::regclass)
                 then 'oui' else 'NON' end
  union all
  select 8, 'lancement',
         coalesce('lancé le ' || (select nullif(btrim(data ->> 'lanceLe'), '') from public.documents
                                   where key = 'mnd_douze_lunes'),
                  'pas encore : la garde du personnel attend le geste')
  union all
  select 9, 'fiches dont le code n''est pas celui de leur Graine',
         (select count(*) from public.clients c
           where coalesce(c.data ->> 'codeParrain', '') <> ''
             and (c.data ->> 'codeParrain') is distinct from (c.data -> 'graine' ->> 'code'))::text
  union all
  select 10, 'récompenses écho, rang ou défi sur les fiches',
         (select count(*) from public.clients c,
                 jsonb_array_elements(case when jsonb_typeof(c.data -> 'soinsOfferts') = 'array'
                                           then c.data -> 'soinsOfferts' else '[]'::jsonb end) as s(e)
           where coalesce(s.e ->> 'source', '') in ('echo', 'rang', 'defi')
              or coalesce(s.e ->> 'id', '') ~ '^(echo|rang|defi)-')::text
  union all
  -- Toujours 0 : une récompense rangée par le geste qui serait revenue.
  select 11, 'récompenses à la fois sur la fiche et dans son archive',
         (select count(*) from public.clients c,
                 jsonb_array_elements(case when jsonb_typeof(c.data -> 'soinsOfferts') = 'array'
                                           then c.data -> 'soinsOfferts' else '[]'::jsonb end) as s(e)
           where jsonb_typeof(c.data -> 'avantLesDouzeLunes' -> 'soinsRetires') = 'array'
             and exists (select 1 from jsonb_array_elements(c.data -> 'avantLesDouzeLunes' -> 'soinsRetires') as r(e)
                          where (r.e ->> 'id') = (s.e ->> 'id')))::text
  union all
  -- Avant le geste : les mercis de l'ancien programme. Après : 0 (un merci
  -- ne se pose que sur une Graine, le reste est dans les archives).
  select 12, 'mercis sur une fiche sans Graine',
         (select count(*) from public.clients c,
                 jsonb_array_elements(case when jsonb_typeof(c.data -> 'soinsOfferts') = 'array'
                                           then c.data -> 'soinsOfferts' else '[]'::jsonb end) as s(e)
           where jsonb_typeof(c.data -> 'graine') is distinct from 'object'
             and (coalesce(s.e ->> 'source', '') = 'amie' or coalesce(s.e ->> 'id', '') ~ '^parr-'))::text
) as controle
order by n;
