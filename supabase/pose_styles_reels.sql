-- ═══════════════════════════════════════════════════════════════════
-- POSE LES STYLES RÉELS DE LA MAISON (13 août 2026) — à coller dans
-- Supabase → SQL Editor. UN SEUL TEMPS. Rejouable sans danger.
--
-- La liste « Styles de couronne » (Paramètres → Catalogue & clientèle)
-- vivait encore sur les dix styles d'usine du prototype. Ce script écrit
-- les six modèles que la maison pratique — le document synchronisé fait
-- foi sur tous les appareils, la graine du code ne sert qu'au premier
-- démarrage.
--
-- Les fiches déjà taguées d'un ancien style le GARDENT (le style vit sur
-- la fiche, la liste ne sert qu'à proposer) : rien ne se perd.
-- ═══════════════════════════════════════════════════════════════════

insert into public.documents (key, data, updated_at)
values (
  'mnd_crown_styles',
  '["Microlocks","Sisterlocks","Nanolocks","Galaxy","Traditionnelles","Freeform"]'::jsonb,
  now()
)
on conflict (key) do update
  set data = excluded.data, updated_at = now();

-- Contrôle : la liste en place, telle que la liront les Paramètres.
select key, jsonb_array_length(data) as styles, data
from public.documents
where key = 'mnd_crown_styles';
