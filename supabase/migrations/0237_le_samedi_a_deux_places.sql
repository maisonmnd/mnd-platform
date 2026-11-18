-- ═══════════════════════════════════════════════════════════════════════════
-- 0237 · LE SAMEDI À DEUX PLACES · 18 novembre 2026
--
-- « Comme en semaine » (Yéman, au sélecteur) : le samedi aussi, la seconde
-- place en ligne s'ouvre quand le Planning met deux personnes « au fauteuil »
-- et que la branche a deux fauteuils. Jusqu'ici, 0152 la gardait du mardi au
-- vendredi : un samedi, le site, Ma Couronne et le verrou n'acceptaient qu'un
-- rendez-vous à la fois, et le comptoir devait forcer (une cliente reportée au
-- samedi 28 novembre à 9 h, le 18 novembre).
--
-- CE QUI CHANGE, ET RIEN D'AUTRE : `places_en_ligne`, la condition des jours
-- (« between 1 and 4 » devient « between 1 and 5 ») et ses deux commentaires.
-- Le reste est le texte de 0152, caractère pour caractère, la définition en
-- base (relue le 18 novembre 2026, corps identique). Tout ce qui lit les places la suit sans changement :
-- `places_en_ligne_du` (le site, Ma Couronne), `pose_si_libre` et le garde
-- `une_place_en_ligne` (les places du jour). Le miroir TypeScript est
-- `JOURS_DU_SECOND_FAUTEUIL` (src/shared/agenda-pur.ts), et le banc
-- `verifie-le-second-fauteuil` les confronte.
--
-- WhatsApp (place-du-serveur) garde ses propositions à une place : inchangé.
-- Les maîtres restent jugés un par un : la règle des deux têtes chez Team
-- (l'une sous 150 locks) viendra dans un lot à part.
--
-- Rejouable : `create or replace`, les droits reposés tels quels.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.places_en_ligne(p_branch text, p_date date)
returns int
language sql stable security definer set search_path = public as $$
  with le_jour as (
    -- Lundi = 0 … dimanche = 6, comme les cases du planning.
    select extract(isodow from p_date)::int - 1 as i,
           to_char(p_date - (extract(isodow from p_date)::int - 1), 'YYYY-MM-DD') as lundi,
           to_char(p_date, 'YYYY-MM-DD') as iso
  ),
  le_planning as (
    select coalesce((select d.data from public.documents d where d.key = 'mnd_planning'), '{}'::jsonb) as p
  ),
  au_fauteuil as (
    -- Les fiches de la branche, présentes ce jour-là, « fauteuil » au planning :
    -- la case de la semaine si elle est écrite, sinon celle du modèle. Ce qui
    -- n'est pas une liste de textes ne se lit pas.
    select count(*)::int as n
      from public.team t
      cross join le_jour j
      cross join le_planning pl
      cross join lateral (
        select pl.p -> 'semaines' -> j.lundi -> t.id as semaine,
               pl.p -> 'modele' -> t.id as modele
      ) c
     where coalesce(nullif(t.data ->> 'branchId', ''), t.branch_id, '') = p_branch
       and (coalesce(t.data ->> 'archiveeLe', '') = ''
            or (t.data ->> 'archiveeLe') collate "C" > j.iso collate "C")
       and coalesce(
             nullif(case when jsonb_typeof(c.semaine) = 'array' and jsonb_typeof(c.semaine -> j.i) = 'string'
                         then c.semaine ->> j.i end, ''),
             nullif(case when jsonb_typeof(c.modele) = 'array' and jsonb_typeof(c.modele -> j.i) = 'string'
                         then c.modele ->> j.i end, '')
           ) = 'fauteuil'
  ),
  les_fauteuils as (
    -- Les fauteuils de la branche, lus comme le verrou les lisait (0125).
    select coalesce((
      select case when btrim(coalesce(b.data ->> 'seats', '')) ~ '^\d{1,4}(\.\d+)?$'
                  then floor(btrim(b.data ->> 'seats')::numeric)::int else 0 end
        from public.branches b
       where b.id = p_branch), 0) as n
  )
  select case
           when p_branch is null or p_date is null then 1
           -- Le second fauteuil : mardi (1) à samedi (5, depuis le 18 novembre
           -- 2026), deux au fauteuil, deux fauteuils au moins. Jamais un
           -- troisième : un autre arbitrage.
           when (select i from le_jour) between 1 and 5
            and (select n from au_fauteuil) >= 2
            and (select n from les_fauteuils) >= 2
           then 2
           -- Sans planning à deux, le lundi, le dimanche, ou une branche à un fauteuil.
           else 1
         end
$$;

revoke all on function public.places_en_ligne(text, date) from public, anon, authenticated;
grant execute on function public.places_en_ligne(text, date) to service_role;


-- ── Contrôle ───────────────────────────────────────────────────────────────
-- Trois « oui » : le samedi ouvert dans la règle, le mardi aussi, le lundi non.
select
  (select position('between 1 and 5' in pg_get_functiondef('public.places_en_ligne(text, date)'::regprocedure)) > 0) as mardi_a_samedi,
  (select position('between 1 and 4' in pg_get_functiondef('public.places_en_ligne(text, date)'::regprocedure)) = 0) as plus_le_vendredi_seul,
  not has_function_privilege('anon', 'public.places_en_ligne(text, date)', 'execute') as garde_au_serveur;
