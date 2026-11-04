-- ═══════════════════════════════════════════════════════════════════════════
-- 0155 · LA REMISE FOYER SOUS « UNE SEULE REMISE », 4 novembre 2026
--
-- Yéman, au sélecteur : à une cliente aux prix convenus ou abonnée, « ni les
-- autres remises, en aucune circonstance ». Ma Couronne ne montre plus la
-- remise Foyer à l'achat d'une formule (AchatFormule, `rangDuFoyerPourElle`,
-- src/apps/couronne/places-pure.ts) ; le serveur, qui seul décide du prix
-- (`souscrire_a_une_formule` relit tout, 0138), ne l'applique plus non plus.
-- Sans lui, l'écran dirait un prix et le serveur en prendrait un autre :
-- jamais un prix changé en silence.
--
--   1. `abo_foyer_sans_remise(tête, jour)` : vrai quand la tête est aux prix
--      convenus (un prix convenu de plus de zéro franc, `aUnPrixConvenu`) ou
--      abonnée elle-même (une formule qui court à ce jour : retenue, en cours,
--      en pause, épuisée, ou la lune réglée d'une Chaque Lune résiliée ; le
--      juge `court` de src/shared/abonnee-pur.ts, celui que lit
--      `formulesQuiCourent` dans Ma Couronne).
--   2. `abo_rang_dans_le_foyer(tête, jour)` : inchangé, sauf qu'une telle tête
--      y compte comme une première tête (rang 1) ; la remise Foyer (rang 2 ou
--      3) ne joue donc pas. Son seul lecteur est `souscrire_a_une_formule`.
--
-- L'ORDRE DE LA POSE : Ma Couronne d'abord, cette migration aussitôt après.
-- Dans l'autre sens, l'ancienne Couronne montrerait encore une remise Foyer
-- que la base ne donnerait plus, et la cliente paierait plus que l'écran ne
-- l'a dit. Rejouable sans danger (`create or replace`).
-- Banc : `scripts/verifie-le-serveur-de-l-abonnee.mjs` (BANC_PGLITE) et
-- `scripts/verifie-les-places-a-la-couronne.mjs --prouve`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. LA TÊTE QUI NE PREND PAS LA REMISE FOYER ──────────────────────────
create or replace function public.abo_foyer_sans_remise(p_tete text, p_jour date) returns boolean
language sql stable set search_path = public as $$
  select exists (
           select 1
             from public.clients c
            cross join lateral jsonb_each(case when jsonb_typeof(c.data->'prixFixes') = 'object'
                                               then c.data->'prixFixes' else '{}'::jsonb end) e
            where c.id = p_tete
              and jsonb_typeof(e.value) = 'number' and (e.value #>> '{}')::numeric > 0)
      or exists (
           select 1
             from public.subscribers s
             left join public.plans p on p.id = s.data->>'planId'
            cross join lateral (select public.abo_etat_de_la_formule(s.id, s.data, p.data, p_jour)->>'etat' as etat,
                                       public.abo_dernier_jour_de_la_resiliee(s.data, p.data) as dernier) f
            where s.data->>'clientId' = p_tete
              and (f.etat in ('retenue', 'en-cours', 'en-pause', 'epuisee')
                   or (f.etat = 'resiliee' and f.dernier is not null
                       and f.dernier > public.abo_date(s.data->>'resilieeLe') and f.dernier >= p_jour)))
$$;

-- ── 2. LE RANG DE LA TÊTE DANS SON FOYER, SOUS UNE SEULE REMISE ──────────
-- 1 + les AUTRES têtes du même foyer qui portent une formule qui court
-- (retenue, en cours, en pause, épuisée) ; 1 pour une tête aux prix convenus
-- ou abonnée elle-même.
create or replace function public.abo_rang_dans_le_foyer(p_tete text, p_jour date) returns int
language sql stable set search_path = public as $$
  select case when public.abo_foyer_sans_remise(p_tete, p_jour) then 1 else (
    select 1 + count(distinct c.id)::int
      from public.clients moi
      join public.clients c
        on c.data->>'familyId' = moi.data->>'familyId' and c.id <> moi.id
      join public.subscribers s on s.data->>'clientId' = c.id
      left join public.plans p on p.id = s.data->>'planId'
     where moi.id = p_tete
       and coalesce(moi.data->>'familyId', '') <> ''
       and public.abo_etat_de_la_formule(s.id, s.data, p.data, p_jour)->>'etat' in ('retenue', 'en-cours', 'en-pause', 'epuisee')
  ) end
$$;

-- Les outils du juge ne s'ouvrent à personne de dehors (comme en 0138) :
-- `souscrire_a_une_formule`, en propriétaire, les lit seule.
revoke all on function public.abo_foyer_sans_remise(text, date) from public, anon, authenticated;
revoke all on function public.abo_rang_dans_le_foyer(text, date) from public, anon, authenticated;


-- ── Contrôle ───────────────────────────────────────────────────────────────
-- Trois « oui » attendus : le juge posé, le rang qui le lit, et le juge
-- fermé aux clientes comme aux visiteuses.
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'abo_foyer_sans_remise') = 1 as juge_pose,
  position('abo_foyer_sans_remise' in pg_get_functiondef('public.abo_rang_dans_le_foyer(text, date)'::regprocedure)) > 0 as rang_sous_le_juge,
  not has_function_privilege('authenticated', 'public.abo_foyer_sans_remise(text, date)', 'execute')
    and not has_function_privilege('anon', 'public.abo_foyer_sans_remise(text, date)', 'execute') as juge_au_serveur;
