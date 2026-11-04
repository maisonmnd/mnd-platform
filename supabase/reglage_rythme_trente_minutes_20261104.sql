-- Réglages des assistants (Opale, Onyx) : un tour toutes les 30 minutes, de
-- 6 h à 23 h. 4 novembre 2026, 22 h 36.
--
-- Décision de Yéman, ce soir : « Lis maintenant les messages toutes les 30
-- min tout au long de la journée jusqu'à 23h ». Elle remplace celle du
-- 2 novembre 2026 (10 minutes de 6 h à 18 h, 30 minutes de 18 h à minuit).
--
-- Il FUSIONNE, il ne remplace pas : seules rythmeMin (10 → 30) et veilleA
-- (24 → 23) changent ; veilleDe 6, soirDe 18, rythmeSoirMin 30, silenceMin 45
-- et tenueHeures 2 gardent leur valeur. La fonction assistants-maison en tire
-- les crons rendus au passage, push-notify son chien de garde, l'écran « Les
-- assistants » ce qu'il montre.
--
-- À passer UNE fois par scripts/mise-en-ligne.mjs sql. Rejouable sans dommage :
-- la copie de repli ne se refait pas si elle existe (RLS posée aussitôt), la
-- fusion pose toujours les deux mêmes clés.

create table if not exists public.repli_mnd_settings_20261104_rythme as
  select * from public.documents where key = 'mnd_settings';
alter table public.repli_mnd_settings_20261104_rythme enable row level security;

update public.documents
   set data = jsonb_set(coalesce(data, '{}'::jsonb), '{assistants}',
              coalesce(data->'assistants', '{}'::jsonb) || '{"rythmeMin": 30, "veilleA": 23}'::jsonb, true),
       updated_at = now()
 where key = 'mnd_settings';

select data->'assistants' as assistants,
       (select count(*) from public.repli_mnd_settings_20261104_rythme) as lignes_en_repli
  from public.documents where key = 'mnd_settings';
