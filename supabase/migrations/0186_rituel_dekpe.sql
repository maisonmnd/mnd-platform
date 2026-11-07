-- 0186 · RITUEL ƉƐKPƐ · 7 novembre 2026
--
-- « Non, je préfère rituel dekpe » (Y.), écrit comme sa devise « mi nyɔ́
-- ɖɛkpɛ » : la catégorie née en 0185 (Express et Fidélité, hors de la venue)
-- s'appelle « Rituel Ɖɛkpɛ ». Le nom fon dans `fon`, le nom dit dans `label`,
-- comme les autres catégories de l'Atelier. Rejouable ; réversible.

update public.catalog_categories
   set data = data || jsonb_build_object('fon', 'Ɖɛkpɛ', 'label', 'Rituel Ɖɛkpɛ'),
       updated_at = now()
 where id = 'cat-entre-deux';
