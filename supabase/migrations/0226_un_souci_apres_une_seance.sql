-- ═══════════════════════════════════════════════════════════════════════════
-- 0226 · UN SOUCI, APRÈS UNE SÉANCE · 17 novembre 2026
--
-- « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV sinon
-- tout le monde nous trichera » (Yéman, 17 novembre 2026, la consultation en
-- affiches, arbitrage D).
--
-- « Un souci avec vos locks ? » (Ma Couronne, Entre deux séances, 0132) rend
-- tout de suite la réponse validée de la Maison : un conseil. Il ne se donne
-- qu'à une cliente qui a déjà eu une séance à la Maison. Ma Couronne ne
-- montre plus la question aux autres (shared/rendez-vous-pris-pur.ts,
-- `aEuUneSeance`) ; la base, elle, refuse aussi le dépôt, même depuis une
-- ancienne version de l'application restée en cache sur un téléphone.
--
-- CE QUE FAIT 0226, et rien d'autre :
--   · `a_eu_une_seance(cible)` : un rendez-vous honoré, aujourd'hui ou avant
--     (le jour de Cotonou), pour cette tête. La même règle que
--     `estUneSeanceFaite`. Elle ne répond qu'au personnel et à la cliente
--     elle-même (ou au parent payeur d'un mineur, `est_ma_tete`, 0028) :
--     personne n'apprend par elle si une autre est venue.
--   · `signalement_de_cliente_valide(d)` : la même qu'en 0132, mot pour mot,
--     plus cette condition. Le personnel dépose toujours (règle `sig_deposer`,
--     inchangée) : un souci dit au comptoir ou sur WhatsApp se note comme
--     avant.
--
-- Aucune donnée ne bouge : les signalements déjà déposés restent, la Maison
-- les traite. Rejouable : « create or replace ». À PASSER AVANT de publier
-- Ma Couronne (dans l'autre ordre, rien ne casse non plus : l'écran d'avant
-- dirait seulement « Votre message n'est pas parti »).
-- ═══════════════════════════════════════════════════════════════════════════

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'signalement_de_cliente_valide') then
    raise exception 'signalement_de_cliente_valide() est absente : passez d’abord 0132_entre_deux_seances.sql';
  end if;
end $$;

-- ⟨0226⟩
create or replace function public.a_eu_une_seance(cible text) returns boolean
language sql stable security definer set search_path = public as $$
  select (public.is_staff() or public.est_ma_tete(cible))
     and exists (
       select 1
         from public.appointments a
        where a.data->>'clientId' = cible
          and a.data->>'status' = 'honoré'
          and coalesce(a.data->>'date', '') ~ '^\d{4}-\d{2}-\d{2}'
          and left(a.data->>'date', 10) <= to_char(now() at time zone 'Africa/Porto-Novo', 'YYYY-MM-DD')
     );
$$;
revoke all on function public.a_eu_une_seance(text) from public, anon;
grant execute on function public.a_eu_une_seance(text) to authenticated;

-- Ce qu'une cliente peut déposer : sa ligne, ouverte (ou « tout va bien »),
-- depuis Ma Couronne, d'une taille raisonnable (0132), ET après une séance
-- faite à la Maison (0226).
create or replace function public.signalement_de_cliente_valide(d jsonb) returns boolean
language sql stable as $$
  select jsonb_typeof(d) = 'object'
    and octet_length(d::text) <= 8000
    and public.est_ma_tete(d->>'clientId')
    and coalesce(d->>'canal', '') = 'couronne'
    and jsonb_typeof(coalesce(d->'soucis', '[]'::jsonb)) = 'array'
    and length(coalesce(d->>'texte', '')) <= 1000
    and (coalesce(d->>'etat', '') = 'ouvert' or coalesce(d->'bien', 'false'::jsonb) = 'true'::jsonb)
    and d->>'traiteLe' is null and d->>'traitePar' is null
    and public.a_eu_une_seance(d->>'clientId')
$$;
-- ⟨/0226⟩


-- ── Contrôle ──────────────────────────────────────────────────────────
-- Attendu : true (la fonction existe), true (la règle du dépôt la lit),
-- 1 (la règle `sig_deposer` de 0132 est toujours là, inchangée).
select
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'a_eu_une_seance') as la_seance_se_lit,
  (select pg_get_functiondef(p.oid) like '%a_eu_une_seance%'
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'signalement_de_cliente_valide') as le_depot_la_demande,
  (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = 'signalements' and p.policyname = 'sig_deposer') as regle_du_depot;
