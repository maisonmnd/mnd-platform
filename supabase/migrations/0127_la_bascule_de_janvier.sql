-- ═══════════════════════════════════════════════════════════════════
-- 0127 · LA BASCULE DE JANVIER, CÔTÉ SERVEUR — 11 octobre 2026
--        (la genèse des prix). À coller dans Supabase › SQL Editor, puis
--        Run. Se rejoue sans danger. À poser AVANT le 1er janvier 2027.
--
-- Le Trône tient déjà ces règles au comptoir ; Ma Couronne passe par le
-- serveur, qui doit tenir les mêmes :
--
--   1. LA SOUSCRIPTION EN LIGNE (`souscrire_a_une_formule`, 4e version) :
--      · en 1, 2 ou 3 fois : deux fois DÈS 100 000 F (la 0082 voulait
--        « au-dessus »), trois fois dès 200 000 F (décision du 10 octobre) ;
--      · une formule FERMÉE à la vente ne se souscrit pas. Seule exception :
--        une formule fermée par la bascule du 1er janvier 2027, que la tête
--        tenait avant ; elle peut la reprendre UNE fois, à l'ancien prix ;
--      · une formule « une fois par tête » (Les Premières Lunes, le Carnet de
--        Quatre et sa variante Signature) ne se prend qu'une fois ;
--      · Les Premières Lunes se signent dans les 30 jours d'une création
--        honorée à la Maison ;
--      · un paquet ÉPUISÉ ou ÉCHU ne bloque plus une nouvelle formule (la 0077
--        refusait tout tant qu'un contrat n'était pas résilié).
--      Le prix reste celui de la 0082, relu dans la grille : rien ne bouge.
--   2. LES DEUX INTERRUPTEURS DU LOT 4 (le Cercle, les sceaux du Foyer)
--      deviennent lisibles par Ma Couronne : fermés, elle le savait déjà par
--      défaut ; rouverts au Trône, elle le saura.
--   3. LE COMPTE DES TÊTES DU FOYER, et rien d'autre : la remise famille
--      ouverte aux adultes (lot 3) se lit enfin pareil dans Ma Couronne et au
--      comptoir. La fonction rend un nombre, jamais un nom.
--   4. LE SIGNAL : `seuilTroisFoisXof` posé dans la vitrine. Ma Couronne ne
--      propose « en trois fois » qu'une fois ce signal lu, c'est-à-dire une
--      fois cette migration passée.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. LA SOUSCRIPTION EN LIGNE ──────────────────────────────────────
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
  v_seuil2 numeric;
  v_seuil3 numeric;
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
  v_une    text;
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

  -- UN CONTRAT VIVANT BLOQUE ; un paquet épuisé ou échu, non.
  if exists (
    select 1 from public.subscribers s
    where s.data->>'clientId' = v_fiche.id
      and coalesce(s.data->>'status', '') not in ('churn', 'exhausted')
      and not (s.data->>'expiresIso' is not null and (s.data->>'expiresIso')::date < v_today)
  ) then
    return jsonb_build_object('erreur', 'deja_abonnee');
  end if;

  select * into v_plan from public.plans where id = p_plan_id;
  if v_plan.id is null then
    return jsonb_build_object('erreur', 'formule_inconnue');
  end if;

  -- FERMÉE À LA VENTE : non, sauf la reprise unique d'une formule fermée par
  -- la bascule de janvier, que la tête tenait avant.
  if coalesce((v_plan.data->>'fermee')::boolean, false) then
    if not (
      coalesce((v_plan.data->>'fermeeParLaBascule')::boolean, false)
      and exists (select 1 from public.subscribers s
                   where s.data->>'clientId' = v_fiche.id and s.data->>'planId' = v_plan.id
                     and coalesce(s.data->>'startIso', s.data->>'sinceIso', '') <> ''
                     and coalesce(s.data->>'startIso', s.data->>'sinceIso') < '2027-01-01')
      and not exists (select 1 from public.subscribers s
                   where s.data->>'clientId' = v_fiche.id and s.data->>'planId' = v_plan.id
                     and coalesce(s.data->>'startIso', s.data->>'sinceIso', '') >= '2027-01-01')
    ) then
      return jsonb_build_object('erreur', 'formule_fermee');
    end if;
  end if;

  -- UNE FOIS PAR TÊTE : tout contrat compte, même fini ; la variante
  -- Signature porte la même clé.
  v_une := nullif(v_plan.data->>'uneFoisParTete', '');
  if v_une is not null and exists (
    select 1 from public.subscribers s
      join public.plans p on p.id = s.data->>'planId'
     where s.data->>'clientId' = v_fiche.id and p.data->>'uneFoisParTete' = v_une
  ) then
    return jsonb_build_object('erreur', 'deja_prise');
  end if;

  -- LES PREMIÈRES LUNES : dans les 30 jours d'une création honorée à la Maison.
  if v_une = 'premieres-lunes' and not exists (
    select 1 from public.appointments a
     where a.data->>'clientId' = v_fiche.id
       and a.data->>'status' = 'honoré'
       and (a.data->>'date')::date >= v_today - 30
       and exists (select 1 from jsonb_array_elements_text(coalesce(a.data->'serviceIds', '[]'::jsonb)) sid
                     join public.catalog_services cs on cs.id = sid
                    where cs.data->>'categoryId' = 'atl-i-vekpe')
  ) then
    return jsonb_build_object('erreur', 'apres_une_creation');
  end if;

  v_prix := greatest(0, round(coalesce((v_plan.data->>'priceXof')::numeric, 0)));

  -- LE CALIBRE (inchangé depuis la 0082). La case écrite passe devant le calcul.
  if p_band_id is not null and p_band_id <> '' then
    v_ecrit := (v_plan.data->'prixParCalibre'->>p_band_id)::numeric;
    if v_ecrit is not null then
      v_prix := greatest(0, round(v_ecrit));
    elsif coalesce((v_plan.data->>'suitLeCalibre')::boolean, false) then
      select (b.value->>'coef')::numeric into v_coef
        from public.documents d,
             lateral jsonb_array_elements(coalesce(d.data->'abonnements', '[]'::jsonb)) b
       where d.key = 'mnd_model_band_sets' and b.value->>'id' = p_band_id
       limit 1;
      if v_coef is null then
        select (b.value->>'coef')::numeric into v_coef
          from public.documents d,
               lateral jsonb_array_elements(coalesce(d.data, '[]'::jsonb)) b
         where d.key = 'mnd_model_bands' and b.value->>'id' = p_band_id
         limit 1;
      end if;
      if v_coef is not null and v_coef > 0 then
        v_prix := public.mnd_arrondi_500(v_prix * v_coef);
      end if;
    end if;
  end if;

  if p_longueur is not null and p_longueur <> '' then
    v_supp := greatest(0, round(coalesce((v_plan.data->'supplementLongueur'->>p_longueur)::numeric, 0)));
  end if;
  v_prix := v_prix + v_supp;

  if v_prix <= 0 then
    return jsonb_build_object('erreur', 'prix_absent');
  end if;

  -- EN 1, 2 OU 3 FOIS : deux fois dès 100 000 F, trois fois dès 200 000 F.
  if p_parts not in (1, 2, 3) then
    return jsonb_build_object('erreur', 'decoupe_refusee');
  end if;
  select coalesce((d.data->>'seuilDeuxFoisXof')::numeric, 100000),
         coalesce((d.data->>'seuilTroisFoisXof')::numeric, 200000)
    into v_seuil2, v_seuil3
    from public.documents d where d.key = 'mnd_vitrine_config';
  v_seuil2 := coalesce(v_seuil2, 100000);
  v_seuil3 := coalesce(v_seuil3, 200000);
  if p_parts = 2 and v_prix < v_seuil2 then
    return jsonb_build_object('erreur', 'seuil_non_atteint', 'seuil', v_seuil2);
  end if;
  if p_parts = 3 and v_prix < v_seuil3 then
    return jsonb_build_object('erreur', 'seuil_non_atteint', 'seuil', v_seuil3);
  end if;

  if p_parts > 1 then
    v_base  := floor(v_prix / p_parts);
    v_reste := v_prix - v_base * p_parts;
    v_ech := jsonb_build_array(
      jsonb_build_object('numero', 1, 'dueIso', to_char(v_today, 'YYYY-MM-DD'), 'amountXof', v_base + v_reste),
      jsonb_build_object('numero', 2, 'dueIso', to_char(v_today + 30, 'YYYY-MM-DD'), 'amountXof', v_base)
    );
    if p_parts = 3 then
      v_ech := v_ech || jsonb_build_array(
        jsonb_build_object('numero', 3, 'dueIso', to_char(v_today + 60, 'YYYY-MM-DD'), 'amountXof', v_base));
    end if;
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
      'mrrXof', case when v_plan.data->>'mode' = 'pack' then round(v_prix / v_mois) else v_prix end,
      'echeances', case when p_parts > 1 then v_ech else null end,
      'startIso', case when v_plan.data->>'mode' = 'pack' then to_char(v_today, 'YYYY-MM-DD') else null end,
      'expiresIso', case when v_plan.data->>'mode' = 'pack' then to_char(v_today + v_jours, 'YYYY-MM-DD') else null end,
      'priceXof', case when v_plan.data->>'mode' = 'pack' then v_prix else null end,
      'prixConvenuXof', v_prix,
      'calibreVendu', nullif(coalesce(p_band_id, ''), ''),
      'longueurVendue', nullif(coalesce(p_longueur, ''), ''),
      'motifConvenu', case
        when coalesce((v_plan.data->>'fermee')::boolean, false) then 'Son renouvellement, à l’ancien prix (bascule de janvier 2027)'
        when p_band_id is not null and p_band_id <> '' then 'Calibre déclaré à la souscription en ligne'
        else null end,
      'origine', 'couronne'
    )),
    now()
  );

  return jsonb_build_object(
    'ok', true, 'subId', v_id, 'totalXof', v_prix, 'parts', p_parts,
    'premiereXof', case when p_parts > 1 then v_base + v_reste else v_prix end
  );
end;
$$;

revoke all on function public.souscrire_a_une_formule(text, int, text, text) from public;
grant execute on function public.souscrire_a_une_formule(text, int, text, text) to authenticated;

-- ── 2. LES INTERRUPTEURS, LISIBLES PAR MA COURONNE ──────────────────
-- La liste blanche de la 0114, plus deux clés (deux booléens).
drop policy if exists docs_pub_read on public.documents;
create policy docs_pub_read on public.documents for select to anon, authenticated
  using (key = any(array[
    'mnd_settings',
    'mnd_brand',
    'mnd_offers',
    'mnd_cercle_tiers',
    'mnd_points_rate',
    'mnd_crown_styles',
    'mnd_couronne_compose',
    'mnd_vitrine_config',
    'mnd_model_bands',
    'mnd_model_band_sets',
    'mnd_cercle_seuil',
    'mnd_horaires_exceptions',
    'mnd_avis_google',
    'mnd_site_publie',
    -- 0127 :
    'mnd_cercle_actif',
    'mnd_foyer_actif'
  ]));

-- ── 3. LE COMPTE DES TÊTES DE SON FOYER ─────────────────────────────
-- Un nombre, jamais un nom : les têtes non archivées de son compte famille,
-- elle comprise. Sans foyer : 0.
create or replace function public.nombre_de_tetes_de_mon_foyer()
returns int
language sql
stable
security definer
set search_path = public
as $$
  with moi as (
    select data->>'familyId' as famille from public.clients
     where id = (auth.uid())::text or data->>'authUserId' = (auth.uid())::text
     order by (data->>'authUserId' = (auth.uid())::text) desc
     limit 1
  )
  select coalesce((
    select count(*)::int from public.clients c, moi
     where moi.famille is not null and moi.famille <> ''
       and c.data->>'familyId' = moi.famille
       and coalesce((c.data->>'archived')::boolean, false) = false
  ), 0);
$$;

revoke all on function public.nombre_de_tetes_de_mon_foyer() from public;
grant execute on function public.nombre_de_tetes_de_mon_foyer() to authenticated;

-- ── 4. LE SIGNAL DES TROIS FOIS ─────────────────────────────────────
update public.documents
   set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('seuilTroisFoisXof', 200000)
 where key = 'mnd_vitrine_config'
   and not (coalesce(data, '{}'::jsonb) ? 'seuilTroisFoisXof');

-- ── CONTRÔLE — LECTURE SEULE ───────────────────────────────────────
-- Attendu : une seule fonction de chaque nom ; la politique porte les deux
-- interrupteurs ; le signal vaut 200000.
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'souscrire_a_une_formule') as souscription,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'nombre_de_tetes_de_mon_foyer') as compte_du_foyer,
  (select position('mnd_foyer_actif' in pg_get_expr(pol.polqual, pol.polrelid)) > 0
     from pg_policy pol where pol.polname = 'docs_pub_read' and pol.polrelid = 'public.documents'::regclass) as interrupteurs_lisibles,
  (select d.data->>'seuilTroisFoisXof' from public.documents d where d.key = 'mnd_vitrine_config') as signal_trois_fois;
