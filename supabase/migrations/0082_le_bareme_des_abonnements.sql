-- ═══════════════════════════════════════════════════════════════════
-- 0082 — LE BARÈME DES ABONNEMENTS.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- « Je dois avoir un juste prix pour les services, un pour les abonnements »
--   (Yéman, 1er septembre 2026).
--
-- LA 0081 LISAIT LE COEFFICIENT DANS `mnd_model_bands`, c'est-à-dire le barème
-- du FAUTEUIL. Un abonnement empruntait donc la majoration des prestations,
-- en silence. Or les deux ne se majorent pas pareil : au fauteuil, une tête
-- Pico prend deux fois et demie le temps d'une Medium, et le coefficient le
-- dit. Sur un engagement de dix mois, le même ×2,5 ferait fuir, personne ne
-- signe.
--
-- LE BARÈME DES ABONNEMENTS VIT DANS `mnd_model_band_sets`, sous la clé
-- réservée « abonnements ». Cette table indexe les barèmes par identifiant de
-- CATÉGORIE ; aucune catégorie ne porte ce nom, la clé ne peut donc rien
-- écraser. Les TRANCHES y restent communes à toute la Maison (un seul langage
-- de taille), seuls les coefficients divergent.
--
-- IL NAÎT IDENTIQUE, ET C'EST LA GARDE : tant que la Maison n'a touché aucun
-- coefficient, la clé n'existe pas et l'on retombe sur `mnd_model_bands`. Le
-- jour de la mise en ligne, aucun prix ne bouge.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.souscrire_a_une_formule(
  p_plan_id  text,
  p_parts    int default 1,
  p_band_id  text default null,
  p_longueur text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    text := (auth.uid())::text;
  v_fiche  public.clients%rowtype;
  v_plan   public.plans%rowtype;
  v_prix   numeric;
  v_seuil  numeric;
  v_jours  int;
  v_base   numeric;
  v_reste  numeric;
  v_ech    jsonb := '[]'::jsonb;
  v_id     text;
  v_today  date := (now() at time zone 'Africa/Porto-Novo')::date;
  v_mois   numeric;
  v_ecrit  numeric;
  v_coef   numeric;
  v_supp   numeric := 0;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;

  select * into v_fiche from public.clients
   where id = v_uid or data->>'authUserId' = v_uid
   order by (data->>'authUserId' = v_uid) desc
   limit 1;
  if v_fiche.id is null then
    return jsonb_build_object('erreur', 'aucune_fiche');
  end if;

  if exists (
    select 1 from public.subscribers s
    where s.data->>'clientId' = v_fiche.id
      and coalesce(s.data->>'status', '') <> 'churn'
  ) then
    return jsonb_build_object('erreur', 'deja_abonnee');
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan.id is null then
    return jsonb_build_object('erreur', 'formule_inconnue');
  end if;
  v_prix := greatest(0, round(coalesce((v_plan.data->>'priceXof')::numeric, 0)));

  -- LE CALIBRE. La case écrite passe devant le calcul.
  if p_band_id is not null and p_band_id <> '' then
    v_ecrit := (v_plan.data->'prixParCalibre'->>p_band_id)::numeric;
    if v_ecrit is not null then
      v_prix := greatest(0, round(v_ecrit));
    elsif coalesce((v_plan.data->>'suitLeCalibre')::boolean, false) then
      -- ① LE BARÈME DES ABONNEMENTS D'ABORD.
      select (b.value->>'coef')::numeric into v_coef
        from public.documents d,
             lateral jsonb_array_elements(
               coalesce(d.data->'abonnements', '[]'::jsonb)) b
       where d.key = 'mnd_model_band_sets'
         and b.value->>'id' = p_band_id
       limit 1;

      -- ② À DÉFAUT, CELUI DE LA MAISON. Tant que la Maison n'a pas écarté les
      --    deux barèmes, la clé « abonnements » n'existe pas et le prix reste
      --    exactement celui d'hier.
      if v_coef is null then
        select (b.value->>'coef')::numeric into v_coef
          from public.documents d,
               lateral jsonb_array_elements(coalesce(d.data, '[]'::jsonb)) b
         where d.key = 'mnd_model_bands'
           and b.value->>'id' = p_band_id
         limit 1;
      end if;

      if v_coef is not null and v_coef > 0 then
        v_prix := public.mnd_arrondi_500(v_prix * v_coef);
      end if;
    end if;
  end if;

  -- LE SUPPLÉMENT DE LONGUEUR, ajouté UNE FOIS, après le cycle.
  if p_longueur is not null and p_longueur <> '' then
    v_supp := greatest(0, round(coalesce(
      (v_plan.data->'supplementLongueur'->>p_longueur)::numeric, 0)));
  end if;
  v_prix := v_prix + v_supp;

  if v_prix <= 0 then
    return jsonb_build_object('erreur', 'prix_absent');
  end if;

  if p_parts not in (1, 2) then
    return jsonb_build_object('erreur', 'decoupe_refusee');
  end if;
  select coalesce((d.data->>'seuilDeuxFoisXof')::numeric, 100000) into v_seuil
    from public.documents d where d.key = 'mnd_vitrine_config';
  v_seuil := coalesce(v_seuil, 100000);
  if p_parts = 2 and v_prix <= v_seuil then
    return jsonb_build_object('erreur', 'seuil_non_atteint', 'seuil', v_seuil);
  end if;

  if p_parts = 2 then
    v_base  := floor(v_prix / 2);
    v_reste := v_prix - v_base * 2;
    v_ech := jsonb_build_array(
      jsonb_build_object('numero', 1, 'dueIso', to_char(v_today, 'YYYY-MM-DD'),
                         'amountXof', v_base + v_reste),
      jsonb_build_object('numero', 2, 'dueIso', to_char(v_today + 30, 'YYYY-MM-DD'),
                         'amountXof', v_base)
    );
  end if;

  v_jours := coalesce((v_plan.data->>'validityDays')::int, 365);
  v_mois  := greatest(1, round(v_jours::numeric / 30));

  v_id := 'ab-' || replace(gen_random_uuid()::text, '-', '');

  insert into public.subscribers (id, branch_id, data, updated_at)
  values (
    v_id,
    v_fiche.branch_id,
    jsonb_strip_nulls(jsonb_build_object(
      'id', v_id,
      'branchId', v_fiche.branch_id,
      'clientId', v_fiche.id,
      'name', coalesce(v_fiche.data->>'name', 'Cliente'),
      'planId', v_plan.id,
      'cycle', 'mensuel',
      'slot', 'Créneau à réserver',
      'nextIso', to_char(v_today + 30, 'YYYY-MM-DD'),
      'sinceIso', to_char(v_today, 'YYYY-MM-DD'),
      'since', 'ce mois',
      'status', 'new',
      'payments', '[]'::jsonb,
      'mrrXof', case when v_plan.data->>'mode' = 'pack'
                     then round(v_prix / v_mois) else v_prix end,
      'echeances', case when p_parts = 2 then v_ech else null end,
      'startIso', case when v_plan.data->>'mode' = 'pack'
                       then to_char(v_today, 'YYYY-MM-DD') else null end,
      'expiresIso', case when v_plan.data->>'mode' = 'pack'
                         then to_char(v_today + v_jours, 'YYYY-MM-DD') else null end,
      'priceXof', case when v_plan.data->>'mode' = 'pack' then v_prix else null end,
      'prixConvenuXof', v_prix,
      'calibreVendu', nullif(coalesce(p_band_id, ''), ''),
      'longueurVendue', nullif(coalesce(p_longueur, ''), ''),
      'motifConvenu', case
        when p_band_id is not null and p_band_id <> ''
          then 'Calibre déclaré à la souscription en ligne'
        else null end,
      'origine', 'couronne'
    )),
    now()
  );

  return jsonb_build_object(
    'ok', true, 'subId', v_id, 'totalXof', v_prix, 'parts', p_parts,
    'premiereXof', case when p_parts = 2 then v_base + v_reste else v_prix end
  );
end;
$$;

revoke all on function public.souscrire_a_une_formule(text, int, text, text) from public;
grant execute on function public.souscrire_a_une_formule(text, int, text, text) to authenticated;

-- ── CONTRÔLE — LECTURE SEULE ───────────────────────────────────────
-- `bareme_abo_pose` vaut 0 tant que la Maison n'a écarté aucun coefficient :
-- c'est normal, et cela signifie que rien n'a bougé.
select
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'souscrire_a_une_formule') as fonctions_du_nom,
  (select jsonb_array_length(coalesce(d.data->'abonnements', '[]'::jsonb))
     from public.documents d where d.key = 'mnd_model_band_sets') as bareme_abo_pose,
  (select count(*) from public.plans p
   where coalesce((p.data->>'suitLeCalibre')::boolean, false)) as formules_au_calibre;
