-- 0191 · LA CATÉGORIE « L'ENTRE-DEUX » · 7 novembre 2026
--
-- « Écrire L'entre-deux au lieu de Rituel Dekpe » (Y.) : la catégorie qui
-- contient Rituel Fidélité et Rituel Express (née en 0185) s'appelle
-- « L’entre-deux ». Ses deux services ne changent pas.
-- Rejouable, réversible.

update public.catalog_categories
   set data = data || jsonb_build_object('fon', 'L’entre-deux', 'label', 'L’entre-deux'),
       updated_at = now()
 where id = 'cat-entre-deux';
