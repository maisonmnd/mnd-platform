-- 0145 · LA DICTÉE DU BUREAU, SON JETON — 31 octobre 2026
--
-- La Dictée de l'ordinateur (C:\Users\…\Dictee\dictee.py) se présente à la
-- fonction dictee-au-propre avec un jeton (en-tête x-jeton-dictee). La base
-- n'en garde que l'EMPREINTE SHA-256, posée ici dans les réglages de la
-- Maison (mnd_settings → dictee.bureau), celle que Paramètres › Dictée
-- aurait écrite par « Donner un jeton au bureau ». Le jeton lui-même vit dans
-- reglages.json du bureau, nulle part ailleurs : une empreinte ne se remonte
-- pas. Pour en changer : Paramètres › Dictée › « Refaire un jeton ».
--
-- Repli d'abord, RLS comprise (règle de la Maison), puis la ligne touchée.
-- `updated_at` suit par le déclencheur touch_updated_at : les postes relisent.

create table if not exists public.repli_mnd_settings_20261031 as
  select * from public.documents where key = 'mnd_settings';
alter table public.repli_mnd_settings_20261031 enable row level security;

update public.documents
set data = jsonb_set(
  coalesce(data, '{}'::jsonb),
  '{dictee}',
  coalesce(data->'dictee', '{}'::jsonb) || jsonb_build_object(
    'bureau', jsonb_build_object(
      'empreinte', 'b567b3aedcfa52deeae0d282a6a5e9ab49cd20a0570f676430fc716fd5fb6c7f',
      'poseLe', '2026-10-31',
      'par', 'le-trone-52'
    )
  ),
  true
)
where key = 'mnd_settings';
