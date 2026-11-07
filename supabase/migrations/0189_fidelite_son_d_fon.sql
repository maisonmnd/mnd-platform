-- 0189 · LE D FON DE FIDÉLITÉ · 7 novembre 2026
--
-- « ɖɛkpɛ Fidélité 20 % … » et « ɖɛkpɛ Express … » (Y.) : les deux services
-- s'écrivent avec le même mot, le d des lettres fon dont la queue descend
-- (U+0256), comme Express depuis 0188. Fidélité prend donc la même écriture.
--
-- La lettre est posée par son numéro (chr 598), pour qu'aucun éditeur ni
-- aucune relecture ne la remplace par un d ordinaire. Le reste du nom ne
-- change pas. Rejouable, réversible (remettre le D ordinaire de 0187).

update public.catalog_services
   set data = jsonb_set(data, '{name}', to_jsonb(regexp_replace(data->>'name', '^[^ ]+ ', chr(598) || chr(603) || 'kp' || chr(603) || ' '))),
       updated_at = now()
 where id = 'sv-forfait-gbeji-fidelite'
   and data->>'name' ~ '^[^ ]+ Fidélité';
