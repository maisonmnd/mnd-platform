-- Réglages des assistants (Opale, Onyx) : le rythme du soir. 2 novembre 2026.
--
-- Décision de Yéman du 2 novembre 2026 : de 6 h à 18 h un tour toutes les
-- 10 minutes, de 18 h à minuit un tour toutes les 30 minutes, rien de minuit
-- à 6 h. Le réglage du matin (reglage_heures_des_assistants_20261102.sql) a
-- posé veilleDe 6, veilleA 24, rythmeMin 10, silenceMin 45 : le rythme du
-- soir n'était écrit que dans la charte. Ce fichier AJOUTE les deux clés du
-- soir, soirDe 18 et rythmeSoirMin 30, que lisent la fonction
-- assistants-maison (2026-11-02-a, les crons rendus au passage, la série des
-- passages), le chien de garde de push-notify (2026-11-02-a) et l'écran
-- « Les assistants ». Les deux fonctions ont déjà ces valeurs par défaut :
-- ce fichier les écrit en base, pour que l'écran les montre et qu'on les
-- règle.
--
-- RÈGLES DE 0150 : à passer par l'agent mise-en-ligne
-- (scripts/mise-en-ligne.mjs sql), un seul bloc, rejouable sans dommage ;
-- une fois passé, noté PASSÉ dans docs/REPRENDRE.md, et jamais relancé à la
-- main. reglage_heures_des_assistants_20261102.sql est PASSÉ en production :
-- ne JAMAIS le relancer (il remplace tout le bloc assistants, et effacerait
-- les deux clés du soir posées ici).
--
-- Il FUSIONNE, il ne remplace pas : les autres clés de data.assistants
-- (rythmeMin, veilleDe, veilleA, silenceMin, tenueHeures, ou ce qu'un
-- souverain a réglé à l'écran depuis) gardent leur valeur ; seules soirDe et
-- rythmeSoirMin sont posées. Rejouable : la copie de repli de la ligne ne se
-- refait pas si elle existe (RLS posée aussitôt, comme toute table repli_),
-- et la fusion pose toujours les deux mêmes clés.

create table if not exists public.repli_mnd_settings_20261102_soir as
  select * from public.documents where key = 'mnd_settings';
alter table public.repli_mnd_settings_20261102_soir enable row level security;

update public.documents
   set data = jsonb_set(coalesce(data, '{}'::jsonb), '{assistants}',
              coalesce(data->'assistants','{}'::jsonb) || '{"soirDe":18,"rythmeSoirMin":30}'::jsonb, true),
       updated_at = now()
 where key = 'mnd_settings';

select data->'assistants' as assistants,
       (select count(*) from public.repli_mnd_settings_20261102_soir) as lignes_en_repli
  from public.documents where key = 'mnd_settings';
