-- ═══════════════════════════════════════════════════════════════════
-- 0104 — SÍNSIN™ AU MASCULIN · 16 septembre 2026
--
-- « SÍNSIN™ est employé au masculin dans la Maison, il faut écrire
-- « du SÍNSIN™ » et « du SÍNSIN™ Élaboré ». Garder le même genre partout,
-- sur le certificat comme dans le reste des supports » (Yéman).
--
-- La semence du catalogue (`catalog-v6.ts`) et celle des parcours disent
-- désormais « SÍNSIN™ Essentiel » et « SÍNSIN™ Élaboré ». Le catalogue
-- VIVANT, lui, est en base : ceci met ses fiches au même genre, dans leur
-- nom et leur description. Rien d'autre ne bouge (identifiants, prix,
-- paliers, historique des rendez-vous, qui ne portent que des identifiants).
-- ═══════════════════════════════════════════════════════════════════

-- ── AVANT ──────────────────────────────────────────────────────────
select id, data->>'name' as nom
from public.catalog_services
where data->>'name' like '%SÍNSIN™ Essentielle%' or data->>'name' like '%SÍNSIN™ Élaborée%'
order by id;

-- ── LE NOM ─────────────────────────────────────────────────────────
update public.catalog_services
set data = jsonb_set(
  data, '{name}',
  to_jsonb(replace(replace(data->>'name', 'SÍNSIN™ Essentielle', 'SÍNSIN™ Essentiel'), 'SÍNSIN™ Élaborée', 'SÍNSIN™ Élaboré'))
)
where data->>'name' like '%SÍNSIN™ Essentielle%' or data->>'name' like '%SÍNSIN™ Élaborée%';

-- ── LA DESCRIPTION (les formules qui incluent des resserrages) ──────
update public.catalog_services
set data = jsonb_set(
  data, '{desc}',
  to_jsonb(replace(replace(data->>'desc', 'SÍNSIN™ Essentielle', 'SÍNSIN™ Essentiel'), 'SÍNSIN™ Élaborée', 'SÍNSIN™ Élaboré'))
)
where data ? 'desc'
  and (data->>'desc' like '%SÍNSIN™ Essentielle%' or data->>'desc' like '%SÍNSIN™ Élaborée%');

-- ── CONTRÔLE : plus rien au féminin ─────────────────────────────────
select count(*) as fiches_encore_au_feminin
from public.catalog_services
where data->>'name' like '%SÍNSIN™ Essentielle%' or data->>'name' like '%SÍNSIN™ Élaborée%'
   or data->>'desc' like '%SÍNSIN™ Essentielle%' or data->>'desc' like '%SÍNSIN™ Élaborée%';

select id, data->>'name' as nom
from public.catalog_services
where data->>'name' like '%SÍNSIN™%'
order by id;
