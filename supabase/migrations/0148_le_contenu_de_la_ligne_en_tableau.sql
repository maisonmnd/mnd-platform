-- ═══════════════════════════════════════════════════════════════════
-- 0148 · LE CONTENU DE LA LIGNE, EN TABLEAU — 31 octobre 2026
--
-- Passée par l'agent mise-en-ligne (scripts/mise-en-ligne.mjs sql). Un
-- seul bloc, rejouable sans dommage : `create or replace` et une mise à
-- jour qui ne touche que les lignes encore fautives.
--
-- LA PANNE. Au Trône, ouvrir la facture MND-2026-0165 (Carnet des Trois,
-- contrat ABO-2026-001 signé le 31 octobre 2026, 100 000 F, un versement
-- en espèces daté du 24 octobre 2026) faisait tomber l'écran Factures :
-- « .map is not a function ». La pièce est née ici, au premier versement
-- (`verse_sur_l_abonnement`, 0138), et sa ligne portait
--
--     "detail": "3 × Resserrage · 2 × Lavage"
--
-- une CHAÎNE, agrégée par `string_agg` dans un `v_detail text`, alors que
-- le Trône attend `InvoiceLine.detail : string[]` (shared/finance.ts) et
-- lui applique `.map` et `.join`. `data jsonb` arrive au Trône sans
-- traduction : la chaîne tombait droit dans l'écran.
--
-- LA CORRECTION, À LA RACINE : `v_detail` devient `jsonb`, agrégé par
-- `jsonb_agg`, un élément par prestation incluse, dans les mots mêmes de
-- `libellesInclus` (shared/abonnements.ts) : « 3 × Resserrage »,
-- « Lavage · à volonté ». Le même texte sert la facture, le suivi et le
-- rappel ; l'écrire autrement ici, c'était promettre « Lavage (à volonté) »
-- d'un côté et « Lavage · à volonté » de l'autre.
--
-- PUIS LES PIÈCES DÉJÀ ÉCRITES : toute ligne de facture dont `detail` est
-- une chaîne est redécoupée sur « · » en tableau (MND-2026-0165 est la
-- seule connue ; la requête en trouverait d'autres si d'autres contrats
-- avaient reçu un versement depuis le 20 octobre 2026). Le Trône, lui,
-- lit déjà une chaîne sans tomber (`detailPorte`, pdf-de-la-piece.ts) :
-- cette reprise rend seulement à la pièce ses lignes une à une.
--
-- Le reste de la fonction est celui de 0138, à l'identique.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.verse_sur_l_abonnement(p_sub_id text, p_versement jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_claims    jsonb;
  v_role      text := '';
  v_sub       public.subscribers%rowtype;
  v_plan      jsonb;
  v_piece     public.invoices%rowtype;
  v_id        text := btrim(coalesce(p_versement->>'id', ''));
  v_montant   numeric := round(coalesce(public.abo_num(p_versement->'montantXof'), 0));
  v_jour      date := coalesce(public.abo_date(p_versement->>'date'), public.abo_aujourdhui());
  v_moyen     text := coalesce(nullif(btrim(p_versement->>'moyen'), ''), 'Espèces');
  v_caisse    text := nullif(btrim(coalesce(p_versement->>'cashbox', '')), '');
  v_par       text := nullif(btrim(coalesce(p_versement->>'encaissePar', '')), '');
  v_note      text := coalesce(nullif(btrim(p_versement->>'note'), ''), 'Abonnement');
  v_pack      boolean;
  v_prix      numeric;
  v_nom       text;
  v_total     numeric;
  v_sur_c     boolean;
  v_sur_p     boolean := false;
  v_neuve     boolean := false;
  v_suite     date;
  v_lunes     int;
  v_payes     jsonb;
  v_ligne_p   jsonb;
  -- UN TABLEAU, JAMAIS UN TEXTE (31 octobre 2026) : `InvoiceLine.detail`
  -- est `string[]` au Trône, et la pièce MND-2026-0165 a prouvé ce qu'une
  -- chaîne fait à l'écran.
  v_detail    jsonb;
  v_maj       jsonb := '{}'::jsonb;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_role := coalesce(v_claims->>'role', '');
  exception when others then
    v_claims := '{}'::jsonb;
  end;
  -- Le personnel, un service de la Maison, ou la base elle-même (éditeur SQL).
  if not (v_claims is null or v_role = 'service_role' or public.is_staff()) then
    return jsonb_build_object('ok', false, 'raison', 'reserve_au_personnel');
  end if;
  if v_id = '' then
    return jsonb_build_object('ok', false, 'raison', 'versement_sans_identifiant');
  end if;
  if v_montant <= 0 then
    return jsonb_build_object('ok', false, 'raison', 'montant_invalide');
  end if;
  if v_montant > 5000000 then
    return jsonb_build_object('ok', false, 'raison', 'montant_hors_plafond');
  end if;

  select * into v_sub from public.subscribers where id = p_sub_id for update;
  if v_sub.id is null then
    return jsonb_build_object('ok', false, 'raison', 'contrat_introuvable');
  end if;
  select p.data into v_plan from public.plans p where p.id = v_sub.data->>'planId';
  v_pack := public.abo_est_un_paquet(v_plan);
  v_prix := public.abo_prix(v_sub.data, v_plan);
  v_nom := coalesce(v_plan->>'name', 'Abonnement');

  v_sur_c := exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(v_sub.data->'payments') = 'array' then v_sub.data->'payments' else '[]'::jsonb end) x
     where x->>'id' = v_id);

  if coalesce(v_sub.data->>'invoiceId', '') <> '' then
    select * into v_piece from public.invoices where id = v_sub.data->>'invoiceId' for update;
  end if;
  if v_piece.id is not null then
    v_sur_p := exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(v_piece.data->'payments') = 'array' then v_piece.data->'payments' else '[]'::jsonb end) x
       where x->>'id' = v_id);
  end if;

  if v_sur_c and v_sur_p then
    return jsonb_build_object('ok', true, 'dejaVerse', true, 'pieceId', v_piece.id);
  end if;

  -- LA PIÈCE : celle du contrat, ou une neuve. Une Chaque Lune dont la pièce
  -- est soldée en ouvre une pour la lune suivante.
  if not v_sur_p then
    if v_piece.id is not null and not v_pack then
      select coalesce(sum(coalesce(public.abo_num(l->'unitXof'), 0) * coalesce(public.abo_num(l->'qty'), 1)), 0)
        into v_total
        from jsonb_array_elements(case when jsonb_typeof(v_piece.data->'lines') = 'array' then v_piece.data->'lines' else '[]'::jsonb end) l;
      if (select coalesce(sum(coalesce(public.abo_num(x->'amountXof'), 0)), 0)
            from jsonb_array_elements(case when jsonb_typeof(v_piece.data->'payments') = 'array' then v_piece.data->'payments' else '[]'::jsonb end) x)
         >= v_total then
        v_piece := null;
      end if;
    end if;

    if v_piece.id is null then
      v_neuve := true;
      v_total := case when v_pack
        then v_prix + coalesce(public.abo_num(v_sub.data->'couleur'->'supplementXof'), 0)
        else v_prix end;
      -- CE QUE LA LIGNE CONTIENT, un élément par prestation, dans les mots de
      -- `libellesInclus` : « 3 × Resserrage », « Lavage · à volonté ».
      -- `jsonb_agg` rend null sans prestation : `jsonb_strip_nulls` retire
      -- alors la clé, et la ligne ne porte rien, comme une pièce d'avant.
      select jsonb_agg(
               case when public.abo_num(i->'qty') is null then coalesce(cs.data->>'name', i->>'serviceId') || ' · à volonté'
                    else (public.abo_num(i->'qty'))::int || ' × ' || coalesce(cs.data->>'name', i->>'serviceId') end)
        into v_detail
        from jsonb_array_elements(public.abo_inclus_a_la_date(v_sub.data, v_plan, v_jour)) i
        left join public.catalog_services cs on cs.id = i->>'serviceId';
      v_piece.id := 'inv-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
      v_piece.branch_id := coalesce(v_sub.branch_id, v_sub.data->>'branchId');
      v_piece.data := jsonb_strip_nulls(jsonb_build_object(
        'id', v_piece.id,
        'branchId', v_piece.branch_id,
        'kind', 'facture',
        'number', public.abo_prochain_numero_de_piece('MND', extract(year from public.abo_aujourdhui())::int),
        'clientId', v_sub.data->>'clientId',
        'clientName', v_sub.data->>'name',
        'date', case when v_pack then coalesce(public.abo_date(v_sub.data->>'sinceIso'), v_jour)::text else v_jour::text end,
        'lines', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'id', 'il-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
          'label', v_nom, 'qty', 1, 'unitXof', v_total, 'discountPct', 0, 'detail', v_detail))),
        'globalDiscountPct', 0,
        'theme', 'Aube',
        'status', 'envoyée',
        'creeeLe', public.abo_iso(public.abo_maintenant()),
        'note', 'Abonnement · ' || v_nom
                || coalesce(' · ' || nullif(v_sub.data->>'reference', ''), '')
                || case when jsonb_typeof(v_sub.data->'echeances') = 'array' and jsonb_array_length(v_sub.data->'echeances') > 1
                        then ' · réglable en ' || jsonb_array_length(v_sub.data->'echeances') || ' fois' else '' end,
        'subId', v_sub.id,
        'payments', '[]'::jsonb
      ));
    end if;

    -- LE VERSEMENT DE LA PIÈCE : ce que lit le journal de caisse.
    v_ligne_p := jsonb_strip_nulls(jsonb_build_object(
      'id', v_id, 'date', v_jour::text, 'amountXof', v_montant, 'method', v_moyen,
      'cashbox', v_caisse, 'note', v_note,
      'time', to_char(public.abo_maintenant() at time zone 'Africa/Porto-Novo', 'HH24:MI'),
      'encaissePar', v_par));
    v_payes := case when jsonb_typeof(v_piece.data->'payments') = 'array' then v_piece.data->'payments' else '[]'::jsonb end
               || jsonb_build_array(v_ligne_p);
    if v_neuve then
      insert into public.invoices (id, branch_id, data, updated_at)
      values (v_piece.id, v_piece.branch_id,
              v_piece.data || jsonb_build_object('payments', v_payes, 'payment', v_moyen)
                           || case when v_caisse is not null then jsonb_build_object('cashbox', v_caisse) else '{}'::jsonb end,
              now());
    else
      update public.invoices
         set data = data || jsonb_build_object('payments', v_payes), updated_at = now()
       where id = v_piece.id;
    end if;
  end if;

  -- LE CONTRAT : le versement, l'état, la pièce, et la lune qui avance.
  if not v_sur_c then
    v_maj := v_maj || jsonb_build_object('payments',
      case when jsonb_typeof(v_sub.data->'payments') = 'array' then v_sub.data->'payments' else '[]'::jsonb end
      || jsonb_build_array(jsonb_build_object('id', v_id, 'amountXof', v_montant, 'date', v_jour::text, 'method', v_moyen)));
    if not v_pack and v_prix > 0 then
      v_lunes := floor((v_montant + 1) / v_prix);
      v_suite := null;
      for i in 1 .. least(v_lunes, 24) loop
        v_suite := public.abo_prochaine_iso_apres_reglement(
          v_sub.data || case when v_suite is null then '{}'::jsonb else jsonb_build_object('nextIso', v_suite::text) end, v_jour);
      end loop;
      if v_suite is not null then
        v_maj := v_maj || jsonb_build_object('nextIso', v_suite::text);
      end if;
    end if;
  end if;
  if coalesce(v_sub.data->>'status', '') <> 'churn' then
    v_maj := v_maj || jsonb_build_object('status', 'active');
  end if;
  v_maj := v_maj || jsonb_build_object('invoiceId', v_piece.id);
  update public.subscribers set data = data || v_maj, updated_at = now() where id = v_sub.id;

  return jsonb_build_object('ok', true, 'dejaVerse', false, 'pieceId', v_piece.id, 'pieceNeuve', v_neuve,
                            'nextIso', v_maj->>'nextIso');
end;
$$;

revoke all on function public.verse_sur_l_abonnement(text, jsonb) from public, anon;
grant execute on function public.verse_sur_l_abonnement(text, jsonb) to authenticated, service_role;


-- ══ LES PIÈCES DÉJÀ ÉCRITES AVEC UNE CHAÎNE ═══════════════════════════
-- Chaque ligne dont `detail` est une chaîne est redécoupée sur « · » (le
-- séparateur de 0138) en tableau de chaînes, sans vide. « Lavage (à volonté) »
-- reste tel quel : réécrire les mots d'une pièce remise serait réécrire une
-- trace. Rien d'autre ne bouge sur la pièce ; rejouable, la requête ne
-- trouve plus rien la seconde fois.
update public.invoices f
   set data = jsonb_set(f.data, '{lines}', (
         select jsonb_agg(
                  case when jsonb_typeof(l->'detail') = 'string'
                       then l || jsonb_build_object('detail', coalesce((
                              select jsonb_agg(btrim(m))
                                from unnest(string_to_array(l->>'detail', '·')) m
                               where btrim(m) <> ''), '[]'::jsonb))
                       else l end
                  order by o)
           from jsonb_array_elements(f.data->'lines') with ordinality as t(l, o))),
       updated_at = now()
 where jsonb_typeof(f.data->'lines') = 'array'
   and exists (
     select 1 from jsonb_array_elements(f.data->'lines') l
      where jsonb_typeof(l->'detail') = 'string');
