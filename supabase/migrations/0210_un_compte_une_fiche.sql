-- ═══════════════════════════════════════════════════════════════════════════
-- 0210 — UN COMPTE, UNE FICHE (14 novembre 2026)
--
-- « Quand une cliente crée un compte sur Ma Couronne, qu'elle ne puisse plus
-- ouvrir un second compte au même nom et qu'elle ne perde plus ses RDV »
-- (Yéman, après Jocelyne S.). Sa fiche du comptoir portait déjà son compte ;
-- un téléphone dont le carnet ne la montrait pas encore a créé une fiche
-- NEUVE au même compte : vide, sans famille, sans ses filles, sans ses
-- rendez-vous. L'app ne le fait plus (couronne/lib.ts, `ficheDejaPortee`) ;
-- la base, elle, ne le laisse plus passer, même depuis une ancienne version
-- de l'app restée en cache.
--
-- LA RÈGLE : à la création d'une fiche par une CLIENTE (pas le personnel),
-- si une autre fiche porte déjà le même compte (`data->>'authUserId'`), la
-- création est IGNORÉE en silence (`return null`) : pas d'erreur qui
-- bloquerait le reste de sa synchronisation, simplement pas de doublon.
-- Le personnel n'est pas concerné (la fusion du Trône, les reprises).
--
-- Une fonction `security definer` : la cliente ne voit pas les fiches des
-- autres, la règle doit les voir pour juger. Aucune donnée ne bouge.
-- Rejouable : `create or replace`, `drop … if exists`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0210⟩
create or replace function public.une_fiche_par_compte() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_compte text := nullif(trim(coalesce(new.data->>'authUserId', '')), '');
begin
  if v_compte is null or public.is_staff() then
    return new;
  end if;
  if exists (
    select 1 from public.clients c
     where c.id <> new.id
       and c.data->>'authUserId' = v_compte
  ) then
    return null; -- une seconde fiche au même compte : ignorée
  end if;
  return new;
end;
$$;

revoke all on function public.une_fiche_par_compte() from public;

drop trigger if exists une_fiche_par_compte on public.clients;
create trigger une_fiche_par_compte
  before insert on public.clients
  for each row execute function public.une_fiche_par_compte();
-- ⟨/0210⟩


-- ── Contrôle ──────────────────────────────────────────────────────────
select tgname, tgenabled from pg_trigger where tgname = 'une_fiche_par_compte';
-- Les comptes qui portent aujourd'hui plus d'une fiche (à fondre au Trône) :
select data->>'authUserId' as compte, count(*) as fiches
  from public.clients
 where coalesce(data->>'authUserId', '') <> ''
 group by 1 having count(*) > 1;
