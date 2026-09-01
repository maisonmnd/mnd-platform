-- ═══════════════════════════════════════════════════════════════════
-- 0081 — LA FORMULE AU CALIBRE.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- « Les abonnements doivent se facturer au palier comme au catalogue. Et avoir
--   aussi l'option de la longueur » (Yéman, 1er septembre 2026).
--
-- LE PRIX D'UNE FORMULE SE LIT ICI, ET NULLE PART AILLEURS (0077). L'écran
-- annonce, le serveur décide : c'est ce qui empêche une cliente de s'offrir La
-- Juste Cadence à 1 000 F. Le calibre doit donc entrer DANS cette fonction,
-- sinon l'application afficherait 112 500 F pour un Pico et le serveur en
-- inscrirait 45 000.
--
-- LA MÊME RÈGLE QUE `basePourLaTete`, MOT POUR MOT :
--   ① le prix écrit à la main pour ce calibre, s'il existe ;
--   ② sinon le prix de référence × le coefficient du calibre, si
--      l'interrupteur `suitLeCalibre` est posé ;
--   ③ sinon le prix unique de la formule.
--   ④ puis le supplément de longueur, ajouté UNE FOIS, après le cycle.
--
-- LE CALIBRE ANNONCÉ PAR L'APPLICATION EST UNE DÉCLARATION, PAS UNE PREUVE.
-- Une cliente pourrait annoncer « Jumbo » pour payer moins. C'est assumé, et
-- c'est le même régime qu'au tunnel de réservation : la Maison compte la tête
-- au premier rendez-vous, et l'écart se règle au comptoir. Le mensonge coûte
-- une conversation, pas une perte silencieuse — la fiche de l'abonnée porte le
-- calibre déclaré, écrit noir sur blanc.
-- ═══════════════════════════════════════════════════════════════════

-- ── L'ARRONDI DE LA MAISON, EN BASE ────────────────────────────────
-- Jumeau exact de `roundPrice` (shared/pricing.ts), correction du 1er
-- septembre comprise : SOUS LE PAS, LE PRIX EXACT FAIT FOI. Sans cette garde,
-- un supplément de 150 F disparaîtrait ici comme il disparaissait à l'écran.
create or replace function public.mnd_arrondi_500(x numeric)
returns numeric
language sql
immutable
as $$
  select case
    when round(x / 500) * 500 = 0 and x > 0 then round(x)
    else round(x / 500) * 500
  end;
$$;

comment on function public.mnd_arrondi_500(numeric) is
  'Arrondi commercial au 500 F. Sous le pas, le montant exact fait foi (jumeau de roundPrice).';

-- ── LA FONCTION, AVEC SES DEUX NOUVEAUX ARGUMENTS ──────────────────
-- Ils ont une valeur par défaut : tous les appels d'avant ce jour continuent
-- de fonctionner et retombent sur le prix unique, au franc près.
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

  -- ① SA FICHE — par son identifiant, ou par son compte si elle a été adoptée.
  select * into v_fiche from public.clients
   where id = v_uid or data->>'authUserId' = v_uid
   order by (data->>'authUserId' = v_uid) desc
   limit 1;
  if v_fiche.id is null then
    return jsonb_build_object('erreur', 'aucune_fiche');
  end if;

  -- ② UNE FORMULE À LA FOIS.
  if exists (
    select 1 from public.subscribers s
    where s.data->>'clientId' = v_fiche.id
      and coalesce(s.data->>'status', '') <> 'churn'
  ) then
    return jsonb_build_object('erreur', 'deja_abonnee');
  end if;

  -- ③ LA FORMULE, ET SON PRIX LU ICI.
  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan.id is null then
    return jsonb_build_object('erreur', 'formule_inconnue');
  end if;
  v_prix := greatest(0, round(coalesce((v_plan.data->>'priceXof')::numeric, 0)));

  -- ③ bis · LE CALIBRE. La case écrite passe devant le calcul ; le calcul ne
  --         s'applique que si l'interrupteur est posé ET le coefficient connu.
  if p_band_id is not null and p_band_id <> '' then
    v_ecrit := (v_plan.data->'prixParCalibre'->>p_band_id)::numeric;
    if v_ecrit is not null then
      -- UN ZÉRO ÉCRIT EST UN PRIX (offert à ce calibre), pas une case vide.
      v_prix := greatest(0, round(v_ecrit));
    elsif coalesce((v_plan.data->>'suitLeCalibre')::boolean, false) then
      select (b.value->>'coef')::numeric into v_coef
        from public.documents d,
             lateral jsonb_array_elements(coalesce(d.data, '[]'::jsonb)) b
       where d.key = 'mnd_model_bands'
         and b.value->>'id' = p_band_id
       limit 1;
      if v_coef is not null and v_coef > 0 then
        v_prix := public.mnd_arrondi_500(v_prix * v_coef);
      end if;
    end if;
  end if;

  -- ③ ter · LE SUPPLÉMENT DE LONGUEUR, retenu pour être ajouté APRÈS le cycle.
  --         L'ajouter ici le ferait multiplier par dix dans un paquet annuel.
  if p_longueur is not null and p_longueur <> '' then
    v_supp := greatest(0, round(coalesce(
      (v_plan.data->'supplementLongueur'->>p_longueur)::numeric, 0)));
  end if;

  -- Le mode `cycle` de Ma Couronne est mensuel : le prix du cycle EST le prix
  -- de base. Le supplément s'ajoute donc ici, une seule fois, dans les deux
  -- modes.
  v_prix := v_prix + v_supp;

  if v_prix <= 0 then
    return jsonb_build_object('erreur', 'prix_absent');
  end if;

  -- ④ DEUX FOIS, JAMAIS QUATRE, ET PAS EN DESSOUS DU SEUIL DE LA MAISON.
  if p_parts not in (1, 2) then
    return jsonb_build_object('erreur', 'decoupe_refusee');
  end if;
  select coalesce((d.data->>'seuilDeuxFoisXof')::numeric, 100000) into v_seuil
    from public.documents d where d.key = 'mnd_vitrine_config';
  v_seuil := coalesce(v_seuil, 100000);
  if p_parts = 2 and v_prix <= v_seuil then
    return jsonb_build_object('erreur', 'seuil_non_atteint', 'seuil', v_seuil);
  end if;

  -- ⑤ L'ÉCHÉANCIER, ÉCRIT UNE FOIS.
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

  -- ⑥ LA VIE DU PAQUET, et la part mensuelle qui nourrit le revenu récurrent.
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
      -- LE PRIX EST FIGÉ SUR LA FICHE, comme au comptoir : une grille qui
      -- bouge ne renchérit jamais une abonnée au milieu de son engagement.
      'prixConvenuXof', v_prix,
      -- CE QUI A FAIT CE PRIX, écrit noir sur blanc. Une tête grossit, une
      -- tête se refait : sans cette trace, on ne saurait plus dans six mois
      -- d'où vient le montant, ni quoi vérifier au premier comptage.
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

-- L'ANCIENNE SIGNATURE À DEUX ARGUMENTS DISPARAÎT : la laisser vivre à côté
-- ferait deux fonctions du même nom, et Postgres choisirait la mauvaise le
-- jour où l'application n'enverrait qu'un argument sur deux.
drop function if exists public.souscrire_a_une_formule(text, int);

-- ── CONTRÔLE — LECTURE SEULE ───────────────────────────────────────
select
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'souscrire_a_une_formule') as fonctions_du_nom,
  (select count(*) from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'mnd_arrondi_500') as arrondi_pose,
  public.mnd_arrondi_500(150) as petit_prix_intact,
  public.mnd_arrondi_500(45000 * 2.5) as pico_calcule;
