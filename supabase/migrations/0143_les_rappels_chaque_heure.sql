-- ═══════════════════════════════════════════════════════════════════
-- 0143 · LES RAPPELS CHAQUE HEURE · 29 octobre 2026
--
-- À COLLER TEL QUEL dans Supabase › SQL Editor, puis Run.
--
-- APRÈS la fonction rappels-j1 du 29 octobre 2026 (version
-- « 2026-10-29-a · les heures des rappels réglées au Trône »).
-- JAMAIS avant : l'ancienne fonction, réveillée chaque heure, enverrait
-- les rappels de demain dès la première heure venue.
--
-- « Redonne-moi là où je dois aller pour régler les paramètres des
-- relances de rendez-vous » (Yéman). Les heures du rappel de la veille se
-- règlent désormais au Trône (Marketing › Automatisations › Réglages),
-- dans mnd_auto_config. Les deux jobs posés à la main, rappels-j1-soir
-- (18 h au salon) et rappels-j1-nuit (21 h, qui n'envoyait plus rien
-- depuis le 10 octobre : heures calmes), laissent la place à UN job qui
-- réveille la fonction chaque heure ; elle ne fait son passage qu'aux
-- heures choisies, et se tait aux autres.
--
-- Rien ne part vers une cliente à cause de ce fichier : il ne fait que
-- changer l'heure du réveil.
-- ═══════════════════════════════════════════════════════════════════

-- ① Les anciens jobs du rappel de la veille, quel que soit leur nom.
select cron.unschedule(jobid)
from cron.job
where command ilike '%rappels_j1%' or command ilike '%rappels-j1%';

-- ② Un seul job, chaque heure pile. La fonction lit l'heure du salon.
select cron.schedule('rappels-j1-chaque-heure', '0 * * * *', $$select public.rappels_j1_soir_sql();$$);

-- ③ Le contrôle : une seule ligne attendue, « 0 * * * * », active.
select jobname, schedule, command, active
from cron.job
where command ilike '%rappels_j1%' or command ilike '%rappels-j1%';
