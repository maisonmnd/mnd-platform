-- ═══════════════════════════════════════════════════════════════════════
-- 0169 · UNE SÉANCE MANQUÉE NE SE PERD PAS · 6 novembre 2026
--        À coller dans Supabase › SQL Editor, puis Run, APRÈS la 0139.
--        Se rejoue sans danger (tout est « create or replace »).
--
-- « Dans le chemin des sceaux enlève Manqué. On ne perd pas les séances
-- qu'on a manquées, donc je préfère ne même pas comptabiliser. J'annule et
-- je reprogramme seulement, donc enlève. » (Yéman.)
--
-- LA DÉCISION 3 DU 20 OCTOBRE 2026 EST LEVÉE. Elle disait : annulée par la
-- cliente à moins de 24 h, ou absente, la séance est comptée, « Manquée », et
-- la Maison peut la rendre. Désormais : absente ou annulée, par qui que ce
-- soit et à n'importe quelle heure, la séance revient à la formule. Il n'y a
-- plus d'état « manquée », ni rien à rendre.
--
-- Le juge unique (`src/shared/abonnee-pur.ts`) porte la règle. Ce fichier
-- remplace, dans la copie bornée `abo_seance` de la 0138, les deux fonctions
-- qui la disaient ; l'essai scripts/verifie-le-serveur-de-l-abonnee pose la
-- 0138, la 0139, puis cette 0169, et compare à l'original.
--
-- CE QUI NE CHANGE PAS :
--   · `annuler_une_seance` écrit toujours l'instant et l'auteur de
--     l'annulation (une trace) ; elle répond désormais toujours
--     `compteeCommeManquee: false`, sans qu'on la réécrive ;
--   · `deplacer_une_seance` refuse toujours, en ligne, à moins de 24 h : la
--     Maison déplace alors la séance avec la cliente ;
--   · les clés `absente` et `rendue` restent gardées sur les rendez-vous :
--     `absente` est un fait (elle n'est pas venue), `rendue` une trace
--     d'avant que plus rien ne lit.
--
-- Au 6 novembre 2026, aucune séance en base n'était absente, rendue, ni
-- annulée sur une formule : aucun compte ne bouge à la pose.
-- ═══════════════════════════════════════════════════════════════════════

-- ── DEBUT abo_seance_qui_ne_se_perd_pas
-- L'ÉTAT D'UNE SÉANCE, lu sur les faits. Absente ou annulée : elle revient à
-- la formule, quelle que soit l'heure.
create or replace function public.abo_etat_de_la_seance(a jsonb, jour date) returns text
language plpgsql immutable set search_path = public as $$
declare
  v_st text := a->>'status';
begin
  if v_st = 'honoré' then
    return 'faite';
  end if;
  if public.abo_vrai(a->'absente') or v_st = 'annulé' then
    return 'annulee';
  end if;
  if coalesce(a->>'date', '') < jour::text then
    return 'a-cloturer';
  end if;
  if public.abo_vrai(a->'proposeeLe') and v_st = 'en attente' and not public.abo_vrai(a->'confirmeeParLaClienteLe') then
    return 'proposee';
  end if;
  return case when v_st = 'en attente' then 'a-confirmer' else 'confirmee' end;
end $$;

-- Cet état prend-il un crédit ? Tout sauf l'annulée (l'absente en est une).
create or replace function public.abo_prend_un_credit(a jsonb, jour date) returns boolean
language sql immutable set search_path = public as $$
  select public.abo_etat_de_la_seance(a, jour) <> 'annulee';
$$;
-- ── FIN abo_seance_qui_ne_se_perd_pas


-- ── CONTRÔLE, LECTURE SEULE ───────────────────────────────────────
-- Attendu : true, 'annulee', 'annulee', false, true.
select
  (select bool_and(position('manquee' in p.prosrc) = 0) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('abo_etat_de_la_seance', 'abo_prend_un_credit')) as plus_d_etat_manquee,
  public.abo_etat_de_la_seance('{"status":"confirmé","date":"2026-11-02","time":"10:00","absente":{"le":"2026-11-02"}}'::jsonb, date '2026-11-06') as absente,
  public.abo_etat_de_la_seance('{"status":"annulé","date":"2026-11-07","time":"09:00","annuleeLe":"2026-11-06T20:00:00+01:00","annuleePar":"cliente"}'::jsonb, date '2026-11-06') as annulee_la_veille_au_soir,
  public.abo_prend_un_credit('{"status":"annulé","date":"2026-11-07","time":"09:00","annuleeLe":"2026-11-06T20:00:00+01:00","annuleePar":"cliente"}'::jsonb, date '2026-11-06') as prend_un_credit,
  public.abo_prend_un_credit('{"status":"confirmé","date":"2026-11-07","time":"09:00"}'::jsonb, date '2026-11-06') as la_reservee_compte_toujours;
