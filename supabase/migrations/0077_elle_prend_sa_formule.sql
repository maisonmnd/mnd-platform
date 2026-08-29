-- ═══════════════════════════════════════════════════════════════════
-- 0077 — ELLE PREND SA FORMULE ELLE-MÊME.
--        (à coller dans Supabase → SQL Editor). UN SEUL TEMPS.
--
-- « Je ne veux pas qu'on envoie une demande au Trône. La cliente réserve
-- immédiatement et passe au paiement et choisit en 2 fois. Seul moi-même peut
-- activer un paiement en 4 fois » (Yéman, 29 août).
--
-- LE PRIX NE DOIT JAMAIS VENIR DU TÉLÉPHONE. La migration 0076 interdit à une
-- cliente d'écrire dans `subscribers`, et c'est précisément ce qui l'empêche
-- de s'offrir la formule de son choix au prix de son choix. Cette interdiction
-- NE BOUGE PAS. À la place, une fonction qui crée l'abonnement côté serveur,
-- en relisant le prix DANS LA FORMULE et en ignorant tout montant venu de
-- l'application.
--
-- ELLE NE PEUT PAS SE PAYER. La fonction crée l'abonnement À ZÉRO RÈGLEMENT :
-- aucun argent ne s'inscrit ici. Le règlement en ligne passe par
-- `kkiapay-verify`, qui vérifie la transaction chez KkiaPay avant d'inscrire
-- quoi que ce soit — exactement comme les acomptes de rendez-vous.
--
-- DEUX FOIS, JAMAIS QUATRE. La découpe en quatre est un accord qui se donne en
-- face. La fonction REFUSE tout autre nombre que 1 ou 2, même si l'application
-- le demandait — un écran se contourne, une fonction non.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.souscrire_a_une_formule(
  p_plan_id text,
  p_parts   int default 1
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

  -- ② UNE FORMULE À LA FOIS. Deux abonnements ouverts pour la même tête, ce
  --    sont deux compteurs de crédits sur les mêmes rendez-vous, et personne
  --    ne sait lequel se décompte.
  if exists (
    select 1 from public.subscribers s
    where s.data->>'clientId' = v_fiche.id
      and coalesce(s.data->>'status', '') <> 'churn'
  ) then
    return jsonb_build_object('erreur', 'deja_abonnee');
  end if;

  -- ③ LA FORMULE, ET SON PRIX LU ICI. Rien de ce qui vient de l'application
  --    n'entre dans ce calcul.
  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan.id is null then
    return jsonb_build_object('erreur', 'formule_inconnue');
  end if;
  v_prix := greatest(0, round(coalesce((v_plan.data->>'priceXof')::numeric, 0)));
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

  -- ⑤ L'ÉCHÉANCIER, ÉCRIT UNE FOIS. Même règle que `construitEcheancier`
  --    (shared/echeancier.ts, qui fait référence) : le reste sur la PREMIÈRE,
  --    trente jours entre deux, la première le jour même — on n'accorde pas un
  --    crédit qui commence par un délai.
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
      -- AUCUN ARGENT NE S'INSCRIT ICI. Le règlement passe par `kkiapay-verify`
      -- (en ligne) ou par le comptoir (Le Trône).
      'payments', '[]'::jsonb,
      'mrrXof', case when v_plan.data->>'mode' = 'pack'
                     then round(v_prix / v_mois) else v_prix end,
      'echeances', case when p_parts = 2 then v_ech else null end,
      'startIso', case when v_plan.data->>'mode' = 'pack'
                       then to_char(v_today, 'YYYY-MM-DD') else null end,
      'expiresIso', case when v_plan.data->>'mode' = 'pack'
                         then to_char(v_today + v_jours, 'YYYY-MM-DD') else null end,
      'priceXof', case when v_plan.data->>'mode' = 'pack' then v_prix else null end,
      -- D'OÙ VIENT CET ABONNEMENT. Au comptoir, on doit pouvoir distinguer ce
      -- qu'une cliente a pris seule de ce que la Maison a signé pour elle.
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

revoke all on function public.souscrire_a_une_formule(text, int) from public;
grant execute on function public.souscrire_a_une_formule(text, int) to authenticated;

-- ═══════════════════ CONTRÔLE — LECTURE SEULE ══════════════════════
select proname as fonction, prosecdef as security_definer
  from pg_proc
 where pronamespace = 'public'::regnamespace
   and proname = 'souscrire_a_une_formule';
