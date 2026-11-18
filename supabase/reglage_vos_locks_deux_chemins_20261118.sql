-- Vos locks, deux chemins : 18 novembre 2026.
-- « Des locks faites à la Maison et des locks faites ailleurs ont tous deux le
-- même parcours » (Yéman). Au sélecteur : « origine puis état ». Après « Vos
-- locks ? », « Comment vont vos locks ? » : En forme, ou Un souci (maquette
-- « Vos locks, deux chemins », version 4, « construis »).
--
-- Deux documents changent, rien d'autre :
--
--   ① `mnd_envies` (Système › Besoins et règles › Vos envies) : deux écarts
--      de l'état, « Des locks en forme, pas avec Créer » et « pas avec
--      Réparer ». « On est d'accord que les locks ne peuvent pas être en forme
--      quelle que soit leur origine et avoir une envie de créer » (Yéman). Ils
--      se voient et se retirent au Trône, comme ceux de la première réponse.
--
--   ② `mnd_besoins` : les besoins de Réparer deviennent « Ce qui ne va pas »,
--      dans l'ordre de la maquette, en mots courts et concrets. « Après un
--      défrisage ou une décoloration ne va pas : du concret, une alopécie, les
--      cheveux continuent de se défaire, ne se forment pas, sortent de la lock,
--      ont des résidus » (Yéman). Les besoins gardés gardent leur identifiant,
--      leurs points et leurs prestations ; seuls leurs mots changent :
--        bs-012 Elles cassent · bs-013 Elles s'ouvrent, elles sont creuses ·
--        bs-014 Elles s'amincissent à la racine · bs-011 Quelques-unes
--        s'abîment · bs-016 Longtemps négligées.
--      Quatre naissent (un besoin sans prestation ne paraît pas sur le site) :
--        Elles se défont, elles ne se forment pas (FÍNFÍN™ Légère, FÍNFÍN™
--        Essentiel) ; Des cheveux sortent de la lock (les mêmes) ; Elles gardent
--        des résidus (WÈWÈ™ Détox & Purification) ; Une alopécie (garde
--        « peau », Le Moment Cuir chevelu).
--      Cinq sortent de Réparer, gardés au repli : bs-015 (le défrisage), et
--      quatre phrases qui ne disent pas ce qui ne va pas (bs-017 faites
--      ailleurs et pas satisfaite : c'est le chemin lui-même ; bs-018 un
--      suivi ; bs-019 une reconstruction suivie ; bs-020 réparer dans le
--      calme). Les consultations déjà déposées gardent leurs mots.
--
-- LE REPLI : les deux lignes, telles qu'elles sont avant le premier passage,
-- dans `repli_vos_locks_deux_chemins_20261118` (RLS activée, aucune règle :
-- personne ne la lit hors de la base). Rejoué, le repli n'est pas recopié.
--
-- REJOUABLE : rejoué, il ne trouve plus rien à changer et rend le même résultat.

-- ⓪ Le repli, une fois.
create table if not exists public.repli_vos_locks_deux_chemins_20261118 as
  select key, data, updated_at, now() as replie_le
    from public.documents
   where key in ('mnd_besoins', 'mnd_envies');
alter table public.repli_vos_locks_deux_chemins_20261118 enable row level security;

-- ① Les deux écarts de l'état, dans `mnd_envies`, s'ils n'y sont pas.
update public.documents d
   set data = d.data
         || jsonb_build_object(
              'ecarts',
              coalesce(d.data->'ecarts', '[]'::jsonb)
                || (select coalesce(jsonb_agg(v.x order by v.ord), '[]'::jsonb)
                      from (values (1, '{"reponse":"bien","envie":"creer"}'::jsonb),
                                   (2, '{"reponse":"bien","envie":"reparer"}'::jsonb)) as v(ord, x)
                     where not coalesce(d.data->'ecarts', '[]'::jsonb) @> jsonb_build_array(v.x)),
              'modifieLe', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'modifiePar', 'réglage du 18 novembre 2026 (vos locks, deux chemins)'),
       updated_at = now()
 where d.key = 'mnd_envies'
   and (not coalesce(d.data->'ecarts', '[]'::jsonb) @> '[{"reponse":"bien","envie":"creer"}]'::jsonb
        or not coalesce(d.data->'ecarts', '[]'::jsonb) @> '[{"reponse":"bien","envie":"reparer"}]'::jsonb);

-- ② Ce qui ne va pas : les besoins de Réparer, dans `mnd_besoins`. Les autres
--    familles ne bougent pas, ni de place ni de contenu.
with liste(ord, id, mots, cree) as (
  values
    (1, 'bs-012', 'Elles cassent', null::jsonb),
    (2, 'bs-013', 'Elles s’ouvrent, elles sont creuses', null),
    (3, 'bs-014', 'Elles s’amincissent à la racine', null),
    (4, 'bs-souci-defont', 'Elles se défont, elles ne se forment pas',
        '{"famille":"reparer","points":20,"prestations":["sv-finfin-legere","sv-atl-iv-gbe-c"]}'::jsonb),
    (5, 'bs-souci-sortent', 'Des cheveux sortent de la lock',
        '{"famille":"reparer","points":20,"prestations":["sv-finfin-legere","sv-atl-iv-gbe-c"]}'::jsonb),
    (6, 'bs-souci-residus', 'Elles gardent des résidus',
        '{"famille":"reparer","points":20,"prestations":["sv-plt-20-c"]}'::jsonb),
    (7, 'bs-souci-alopecie', 'Une alopécie',
        '{"famille":"reparer","points":25,"prestations":["sv-le-moment-cuir-chevelu"],"garde":"peau"}'::jsonb),
    (8, 'bs-011', 'Quelques-unes s’abîment', null),
    (9, 'bs-016', 'Longtemps négligées', null)
),
doc as (select data from public.documents where key = 'mnd_besoins'),
autres as (
  select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) as l
    from doc, jsonb_array_elements(doc.data->'besoins') with ordinality as t(e, ord)
   where e->>'famille' is distinct from 'reparer'
),
souci as (
  select coalesce(jsonb_agg(
           coalesce(
             (select e from doc, jsonb_array_elements(doc.data->'besoins') as e where e->>'id' = liste.id),
             liste.cree || jsonb_build_object('id', liste.id))
           || jsonb_build_object('mots', liste.mots)
           order by liste.ord), '[]'::jsonb) as l
    from liste
   where liste.cree is not null
      or exists (select 1 from doc, jsonb_array_elements(doc.data->'besoins') as e where e->>'id' = liste.id)
)
update public.documents d
   set data = d.data
         || jsonb_build_object(
              'besoins', (select l from autres) || (select l from souci),
              'modifieLe', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
              'modifiePar', 'réglage du 18 novembre 2026 (vos locks, deux chemins : ce qui ne va pas)'),
       updated_at = now()
 where d.key = 'mnd_besoins'
   and jsonb_typeof(d.data->'besoins') = 'array'
   and (select l from autres) || (select l from souci) is distinct from d.data->'besoins';

-- Ce qui est en base après coup. Attendu : les deux écarts de l'état ; neuf
-- besoins de Réparer, dans l'ordre, chacun avec une prestation au moins ;
-- l'alopécie sous la garde « peau » ; les autres familles au même compte
-- qu'avant (le repli le dit).
select (select d.data->'ecarts' from public.documents d where d.key = 'mnd_envies') as ecarts,
       (select jsonb_agg(e->>'mots' order by ord) from public.documents d, jsonb_array_elements(d.data->'besoins') with ordinality as t(e, ord)
         where d.key = 'mnd_besoins' and e->>'famille' = 'reparer') as ce_qui_ne_va_pas,
       (select bool_and(jsonb_array_length(e->'prestations') > 0) from public.documents d, jsonb_array_elements(d.data->'besoins') as e
         where d.key = 'mnd_besoins' and e->>'famille' = 'reparer') as toutes_reliees,
       (select e->>'garde' from public.documents d, jsonb_array_elements(d.data->'besoins') as e
         where d.key = 'mnd_besoins' and e->>'id' = 'bs-souci-alopecie') as garde_de_l_alopecie,
       (select count(*) from public.documents d, jsonb_array_elements(d.data->'besoins') as e
         where d.key = 'mnd_besoins' and e->>'famille' is distinct from 'reparer') as autres_besoins_apres,
       (select count(*) from public.repli_vos_locks_deux_chemins_20261118 r, jsonb_array_elements(r.data->'besoins') as e
         where r.key = 'mnd_besoins' and e->>'famille' is distinct from 'reparer') as autres_besoins_avant;
