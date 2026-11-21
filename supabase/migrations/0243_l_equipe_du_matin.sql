-- ══════════════════════════════════════════════════════════════════
-- 0243 · L'ÉQUIPE DU MATIN · 21 novembre 2026
--
-- « Je veux que Perle envoie automatiquement, chaque jour à 6 h, les
-- rendez-vous du jour à l'équipe » (Yéman). La fonction `equipe-du-matin`
-- dépose la journée à chacune des personnes choisies, et pose à la direction
-- la question de 9 h ou 10 h quand rien n'est avant 11 h.
--
-- CE QU'IL POSE :
--   1. son réveil, chaque jour à 05:00 UTC (6 h à Cotonou, sans heure d'été).
--      La fonction lit ses réglages (`mnd_settings.equipeDuMatin`) et ne fait
--      rien tant qu'ils sont éteints, ni tant que ses modèles Meta ne sont pas
--      nommés par leurs secrets ;
--   2. le document `mnd_equipe_du_matin` (la question du matin et ce qui en a
--      été décidé), vide, et la règle qui le garde : le Trône le LIT, seule la
--      fonction l'écrit (clé service, au-dessus de la RLS). Une session du
--      personnel qui l'écrirait déciderait 9 h ou 10 h sans la direction.
--
-- Rejouable : l'ancien réveil du même nom est retiré d'abord ; le document
-- n'est posé que s'il manque ; les règles se reposent.
-- ══════════════════════════════════════════════════════════════════

-- ── 1. LE RÉVEIL ──────────────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname = 'equipe-du-matin';
select cron.schedule('equipe-du-matin', '0 5 * * *',
  $$select public.appelle_fonction_edge('equipe-du-matin', '{"source":"cron"}'::jsonb);$$);

-- ── 2. LE DOCUMENT, QUE LA FONCTION SEULE ÉCRIT ───────────────────
insert into public.documents (key, data)
values ('mnd_equipe_du_matin', '{"propositions": []}'::jsonb)
on conflict (key) do nothing;

drop policy if exists docs_equipe_du_matin_creer on public.documents;
create policy docs_equipe_du_matin_creer on public.documents
  as restrictive for insert to anon, authenticated
  with check (key <> 'mnd_equipe_du_matin');

drop policy if exists docs_equipe_du_matin_modifier on public.documents;
create policy docs_equipe_du_matin_modifier on public.documents
  as restrictive for update to anon, authenticated
  using (key <> 'mnd_equipe_du_matin')
  with check (key <> 'mnd_equipe_du_matin');

drop policy if exists docs_equipe_du_matin_retirer on public.documents;
create policy docs_equipe_du_matin_retirer on public.documents
  as restrictive for delete to anon, authenticated
  using (key <> 'mnd_equipe_du_matin');
