-- ═══════════════════════════════════════════════════════════════════
-- 0105 — LES MODULES DE L'ŒUVRE, TELS QUE LE CERTIFICAT LES DIT · 16 septembre 2026
--
-- « Corrige sur le certificat : […] sa maîtrise de la racine et du cuir
-- chevelu, de la naissance VÈKPÈ™, du resserrage SÍNSIN™ Essentiel et
-- Élaboré, de la reprise frontale, de la restauration FÍNFÍN™, des soins et
-- de la couleur végétale YÈKPÈ™, ainsi que du défaisage GBÀTÀ™ » (Yéman).
--
-- LE CERTIFICAT LIT LES MODULES VIVANTS DE LA FORMATION (`competencesDesModules`,
-- `maitriseDe`) : pour qu'il dise cette phrase-là, ce sont les modules de
-- L'Œuvre qui se renomment, ici, en base. TROIS RENOMMAGES, INDEX POUR INDEX,
-- jamais de fusion ni de suppression : les séances et les évaluations
-- tiennent par l'index du module, et l'ordre ne bouge pas.
--   « SÍNSIN™, le resserrage »               → « Le resserrage SÍNSIN™ Essentiel et Élaboré »
--   « SÍNSIN™ Élaborée et reprise frontale » → « La reprise frontale »
--   « Les Soins et la couleur végétale · YÈKPÈ™ » → « Les soins et la couleur végétale · YÈKPÈ™ »
-- Les autres modules (la racine et le cuir chevelu, la naissance · VÈKPÈ™,
-- la restauration · FÍNFÍN™, le défaisage · GBÀTÀ™) restent tels quels.
-- Un module au nom inattendu n'est pas touché : le contrôle d'après le montre.
-- ═══════════════════════════════════════════════════════════════════

-- ── AVANT ──────────────────────────────────────────────────────────
select id, data->>'name' as formation, data->'modules' as modules
from public.formations
where data->>'name' ilike '%Œuvre%';

-- ── LES TROIS RENOMMAGES ───────────────────────────────────────────
update public.formations f
set data = jsonb_set(f.data, '{modules}', (
  select jsonb_agg(
    case
      when lower(trim(t.m)) in ('sínsin™, le resserrage', 'sínsin™ · le resserrage', 'sínsin™ le resserrage', 'le resserrage sínsin™')
        then to_jsonb('Le resserrage SÍNSIN™ Essentiel et Élaboré'::text)
      when lower(trim(t.m)) in ('sínsin™ élaborée et reprise frontale', 'sínsin™ élaboré et reprise frontale')
        then to_jsonb('La reprise frontale'::text)
      when lower(trim(t.m)) in ('les soins et la couleur végétale · yèkpè™', 'les soins et la couleur végétale yèkpè™')
        then to_jsonb('Les soins et la couleur végétale · YÈKPÈ™'::text)
      else to_jsonb(t.m)
    end
    order by t.ord
  )
  from jsonb_array_elements_text(f.data->'modules') with ordinality as t(m, ord)
))
where f.data->>'name' ilike '%Œuvre%'
  and jsonb_typeof(f.data->'modules') = 'array';

-- ── CONTRÔLE : les modules après, dans l'ordre ──────────────────────
select id, data->>'name' as formation, t.ord as rang, t.m as module
from public.formations f, jsonb_array_elements_text(f.data->'modules') with ordinality as t(m, ord)
where f.data->>'name' ilike '%Œuvre%'
order by id, t.ord;
