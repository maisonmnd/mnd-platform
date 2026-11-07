-- 0188 · LE D FON D'EXPRESS · 7 novembre 2026
--
-- « Pour le deuxième, écris le D en fon avec la cloche vers le bas » (Y.) :
-- Express seul porte le d des lettres fon, celui du slogan, dont la queue
-- descend (U+0256). Fidélité garde le D ordinaire (0187).
--
-- La lettre est posée par son numéro (chr 598), pour qu'aucun éditeur ni
-- aucune relecture ne la remplace par un d ordinaire. Le reste du nom
-- (« Express · lavage et retouche ») ne change pas.
-- Rejouable, réversible (remettre le D ordinaire de 0187).

update public.catalog_services
   set data = jsonb_set(data, '{name}', to_jsonb(regexp_replace(data->>'name', '^[^ ]+ ', chr(598) || chr(603) || 'kp' || chr(603) || ' '))),
       updated_at = now()
 where id = 'sv-venue-gbeji-exp'
   and data->>'name' ~ '^[^ ]+ Express';
