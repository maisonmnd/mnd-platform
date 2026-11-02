-- Réglages des assistants (Opale, Onyx) — 2 novembre 2026, décision de Yéman :
-- veille de 6 h à minuit, un tour toutes les 10 minutes (30 minutes après 18 h,
-- tenu par la charte docs/ASSISTANTS.md), chien de garde à 45 minutes de silence.
-- Rejouable : la copie de repli ne se refait pas si elle existe, la mise à jour
-- pose toujours la même valeur.
create table if not exists public.repli_mnd_settings_20261102 as
  select * from public.documents where key = 'mnd_settings';
alter table public.repli_mnd_settings_20261102 enable row level security;

update public.documents
   set data = jsonb_set(coalesce(data, '{}'::jsonb), '{assistants}',
              '{"rythmeMin": 10, "veilleDe": 6, "veilleA": 24, "silenceMin": 45, "tenueHeures": 2}'::jsonb, true),
       updated_at = now()
 where key = 'mnd_settings';

select data->'assistants' as assistants,
       (select count(*) from public.repli_mnd_settings_20261102) as lignes_en_repli
  from public.documents where key = 'mnd_settings';
