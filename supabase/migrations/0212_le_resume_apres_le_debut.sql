-- ═══════════════════════════════════════════════════════════════════════════
-- 0212 — LE RÉSUMÉ APRÈS LE DÉBUT (15 novembre 2026)
--
-- Le 14 novembre au soir, pendant les essais de la file B, un résumé a été
-- posé sur une visio réservée pour le mardi 17 : elle est passée « tenue »
-- trois jours avant l'heure, le bouton « Envoyer le lien » a disparu, et la
-- cliente aurait reçu ce faux résumé à la fin de sa visio. Elle a été remise
-- à « réservée » (supabase/repare_visio_tenue_par_erreur.sql).
--
-- Le Trône ne montre plus « Le résumé » avant le début (visio-pur,
-- `resumeOuvert`). La base, elle, refuse aussi, même depuis une ancienne
-- version du Trône restée en cache sur un téléphone :
--
-- LA RÈGLE : avant l'heure de début de la visio (horloge du serveur), une
-- mise à jour qui pose un résumé neuf, ou qui la fait passer « tenue », est
-- refusée. Tout le reste passe : annuler, renvoyer le lien, ouvrir la salle,
-- remettre à « réservée », effacer un résumé.
--
-- Aucune donnée ne bouge. Rejouable : `create or replace`, `drop … if exists`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0212⟩
create or replace function public.le_resume_apres_le_debut() returns trigger
language plpgsql set search_path = public as $$
begin
  if now() < new.debut and (
       (new.resume is not null and new.resume is distinct from old.resume)
    or (new.statut = 'tenue' and old.statut is distinct from 'tenue')
  ) then
    raise exception 'La visio n''a pas commencé : le résumé s''écrit à partir de %.', new.debut
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists le_resume_apres_le_debut on public.visios;
create trigger le_resume_apres_le_debut
  before update on public.visios
  for each row execute function public.le_resume_apres_le_debut();
-- ⟨/0212⟩


-- ── Contrôle ──────────────────────────────────────────────────────────
select tgname, tgenabled from pg_trigger where tgname = 'le_resume_apres_le_debut';
-- Les visios « tenues » ou résumées avant leur heure (doit rendre zéro ligne) :
select id, debut, statut from public.visios
 where debut > now() and (statut = 'tenue' or resume is not null);
