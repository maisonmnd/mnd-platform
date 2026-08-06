-- ═══════════════════════════════════════════════════════════════════
-- 0026 — Le pointage appartient à celui qui pointe
--        (à coller dans Supabase → SQL Editor → Run). Idempotent.
--
-- ── LE BLOCAGE ───────────────────────────────────────────────────
-- La migration 0013 a rangé `attendance` avec la paie, sous
-- `is_souverain()` : avances, congés, runs et pointages ensemble. C'était
-- juste tant que le pointage était une saisie de direction.
--
-- Il ne l'est plus. Depuis le 6 août, chacun inscrit son arrivée et son
-- départ depuis « Mon mois », et ce geste commande ses points et sa prime.
-- Avec la garde actuelle, un maître qui ouvre l'écran ne LIT rien et
-- n'ÉCRIT rien : la table lui est fermée. L'application ne dirait pas
-- l'erreur — `sync.ts` capture le refus et rend la main — et le pointage
-- ne vivrait que dans son navigateur, jusqu'à la première purge de cache.
--
-- ── CE QUE CE SCRIPT FAIT ────────────────────────────────────────
-- `attendance` passe sous `is_staff()` : tout compte autorisé y lit et y
-- écrit. Les trois autres tables de paie — avances, congés, runs — RESTENT
-- au souverain. Ce qui touche au salaire ne s'ouvre pas parce qu'un
-- pointage s'ouvre.
--
-- ── CE QUE CE SCRIPT NE FAIT PAS, ET QU'IL FAUT SAVOIR ───────────
-- Il n'empêche pas un membre de modifier le pointage d'un autre. La base
-- ne sait pas relier un compte du Trône à une fiche du personnel — le lien
-- se fait par le NOM, côté écran. Une garde « chacun sa ligne » écrite ici
-- serait donc fausse, et une fausse garde vaut moins que pas de garde.
--
-- L'écran, lui, ne propose la correction qu'au gérant et en garde la trace :
-- qui a corrigé, quand, et la valeur d'avant. C'est une protection de
-- confiance, pas une barrière. Elle est du même ordre que celle qui protège
-- déjà les clientes et les factures — le bandeau d'Accès & personnel le dit
-- sans détour : les rôles organisent l'interface, ils ne cloisonnent pas
-- les données.
-- ═══════════════════════════════════════════════════════════════════

-- ── ÉTAT AVANT — à lire d'abord ──────────────────────────────────
select c.relname                                        as table_name,
       p.polname                                        as policy,
       pg_get_expr(p.polqual, p.polrelid)               as garde_lecture,
       pg_get_expr(p.polwithcheck, p.polrelid)          as garde_ecriture
from pg_class c
join pg_policy p on p.polrelid = c.oid
where c.relname in ('attendance', 'salary_advances', 'leave_requests', 'payroll_runs')
order by 1, 2;


-- ── LE CHANGEMENT ────────────────────────────────────────────────
-- Une seule table touchée, une seule politique réécrite.
alter table public.attendance enable row level security;
drop policy if exists staff_all on public.attendance;
create policy staff_all on public.attendance
  for all to authenticated
  using (public.is_staff())
  with check (public.is_staff());


-- ── CONTRÔLE APRÈS ───────────────────────────────────────────────
-- `attendance` doit montrer is_staff() ; les trois autres, is_souverain().
select c.relname                                        as table_name,
       pg_get_expr(p.polqual, p.polrelid)               as garde
from pg_class c
join pg_policy p on p.polrelid = c.oid and p.polname = 'staff_all'
where c.relname in ('attendance', 'salary_advances', 'leave_requests', 'payroll_runs')
order by 1;


-- ── ROLLBACK — referme le pointage au souverain ──────────────────
-- drop policy if exists staff_all on public.attendance;
-- create policy staff_all on public.attendance
--   for all to authenticated
--   using (public.is_souverain())
--   with check (public.is_souverain());
