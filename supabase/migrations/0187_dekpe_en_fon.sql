-- 0187 · DEKPE ÉCRIT EN FON · 7 novembre 2026
--
-- « Dekpe devant les deux, mais avec dekpe écrit en fon comme le slogan »
-- (Y.). Le slogan écrit « mi nyɔ́ ɖɛkpɛ » : les voyelles sont les lettres
-- fon (ɛ), le D reste ordinaire (« jamais le D avec la barre », 0186). Le mot
-- s'écrit donc « Dɛkpɛ », comme le nom pour le portail de la paie
-- (`nomPourMtn`).
--
-- Les deux services portent le MÊME mot (Fidélité disait « Endekpe ») ; la
-- catégorie née en 0185 le porte aussi. Le reste de chaque nom ne change pas.
-- Rejouable, réversible (remettre « Dekpe » / « Endekpe »).

update public.catalog_categories
   set data = data || jsonb_build_object('fon', 'Dɛkpɛ', 'label', 'Rituel Dɛkpɛ'),
       updated_at = now()
 where id = 'cat-entre-deux';

update public.catalog_services
   set data = jsonb_set(data, '{name}', to_jsonb(regexp_replace(data->>'name', '^(Endekpe|Dekpe) ', 'Dɛkpɛ '))),
       updated_at = now()
 where id in ('sv-forfait-gbeji-fidelite', 'sv-venue-gbeji-exp')
   and data->>'name' ~ '^(Endekpe|Dekpe) ';
