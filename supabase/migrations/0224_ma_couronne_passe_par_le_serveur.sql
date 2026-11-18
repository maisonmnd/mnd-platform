-- ═══════════════════════════════════════════════════════════════════════════
-- 0224 · MA COURONNE PASSE PAR LE SERVEUR · 17 novembre 2026
--
-- Ma Couronne passe par demande-submit (`{ couronne: 'reserver' }`), qui
-- décide avec la clé service du statut, de la durée, de l'acompte et de la
-- remise des places.
--
-- CE FICHIER TIENT LA MÊME RÈGLE EN BASE, pour l'écriture qui ne passerait pas
-- par le serveur : une ancienne Ma Couronne encore en mémoire d'un téléphone,
-- le repli quand la fonction ne répond pas, ou un appel direct. Une garde À
-- PART (`garde_reservation_cliente`), qui ne réécrit pas `garde_argent_cliente`
-- (0074 à 0174) : chacune sa règle, et aucune ne dépend de la version de
-- l'autre en base.
--
-- POUR UNE ÉCRITURE DE CLIENTE (jamais le comptoir, jamais le serveur) :
--   À LA CRÉATION
--     · une ligne qui existe déjà n'est pas une création : la synchronisation
--       écrit par « insérer, ou modifier si la ligne existe », et c'est la
--       modification qui la garde (comme 0219) ;
--     · « confirmé » retombe à « en attente » : la Maison regarde et confirme,
--       comme avant le 29 septembre 2026. Aucun rendez-vous ne se perd ;
--     · le prix figé, la remise (en francs, en pour cent, par ligne), l'offre
--       et la remise famille ne s'écrivent pas : ce qu'elle annonçait passe
--       dans la note (« Annoncé par son appareil : … »), le comptoir compte ;
--     · la durée n'est jamais plus courte que celle du catalogue ;
--     · les marques du serveur (`suggereLe`, `attenduJusquAu`, `cleDuNumero`,
--       `placeLibereeLe`, `deplacements`) et celle du comptoir
--       (`ouiNoteParLeComptoir`, qui tient une place en ligne) ne se posent pas.
--   À LA MODIFICATION
--     · un rendez-vous ne se confirme pas lui-même ;
--     · la remise, la durée et les marques du serveur retombent sur leur
--       valeur d'avant (le prix figé et l'acompte le font déjà, 0074).
--
-- Rejouable : `create or replace`, `drop trigger if exists`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.garde_reservation_cliente() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  cle       text;
  annonce   text := '';
  ecrite    text;
  catalogue int;
begin
  if public.ecriture_de_la_maison() then
    return new;                       -- comptoir, serveur, fonction du serveur : plein droit
  end if;

  if tg_op = 'INSERT' then
    -- LA LIGNE DÉJÀ LÀ (18 novembre 2026, comme 0219) : la synchronisation
    -- écrit par « insérer, ou modifier si la ligne existe », et ce déclencheur
    -- passe d'abord ici même pour une ligne qui existe (Ma Couronne repousse
    -- le rendez-vous que le serveur vient de poser confirmé, ou qu'elle vient
    -- de confirmer). Ce que cette branche écrirait passerait dans la
    -- modification : un rendez-vous confirmé retomberait « en attente ». Elle
    -- est laissée telle quelle ; la branche des modifications la garde ensuite.
    if exists (select 1 from public.appointments a where a.id = new.id) then
      return new;
    end if;

    -- LE STATUT : une cliente ne se confirme pas ; la Maison regarde.
    if coalesce(new.data->>'status', '') = 'confirmé' then
      new.data := jsonb_set(new.data, '{status}', '"en attente"'::jsonb);
    end if;

    -- L'ARGENT : rien de ce qu'annonce l'appareil ne fait foi ; la note le garde.
    if btrim(coalesce(new.data->>'priceXof', '')) ~ '^\d{1,9}(\.\d+)?$' then
      annonce := 'prix ' || round(btrim(new.data->>'priceXof')::numeric)::text || ' F';
    end if;
    if btrim(coalesce(new.data->>'discountXof', '')) ~ '^\d{1,9}(\.\d+)?$'
       and round(btrim(new.data->>'discountXof')::numeric) > 0 then
      annonce := concat_ws(', ', nullif(annonce, ''), 'remise ' || round(btrim(new.data->>'discountXof')::numeric)::text || ' F');
    end if;
    if btrim(coalesce(new.data->>'discountPct', '')) ~ '^\d{1,3}(\.\d+)?$'
       and btrim(new.data->>'discountPct')::numeric > 0 then
      annonce := concat_ws(', ', nullif(annonce, ''), 'remise ' || btrim(new.data->>'discountPct') || ' %');
    end if;
    if new.data ? 'remisesLignes' then
      annonce := concat_ws(', ', nullif(annonce, ''), 'remise du jour' || coalesce(' (code ' || nullif(new.data->>'codeOffre', '') || ')', ''));
    end if;
    foreach cle in array array['priceXof', 'discountXof', 'discountPct', 'remisesLignes', 'offreId',
                               'remiseFamille', 'remiseFamilleXof', 'remiseDuComptoirXof',
                               'suggereLe', 'attenduJusquAu', 'cleDuNumero', 'placeLibereeLe', 'deplacements',
                               'ouiNoteParLeComptoir'] loop
      new.data := new.data - cle;
    end loop;
    if annonce <> '' then
      new.data := jsonb_set(new.data, '{note}', to_jsonb(concat_ws(' · ',
        nullif(btrim(coalesce(new.data->>'note', '')), ''), 'Annoncé par son appareil : ' || annonce || ' (à compter au comptoir)')));
    end if;

    -- LA DURÉE : jamais plus courte que celle du catalogue.
    ecrite := btrim(coalesce(new.data->>'dureeMin', ''));
    catalogue := public.duree_du_rdv(new.data - 'dureeMin');
    new.data := jsonb_set(new.data, '{dureeMin}', to_jsonb(greatest(
      catalogue,
      case when ecrite ~ '^\d{1,4}(\.\d+)?$' then least(1440, round(ecrite::numeric))::int else 0 end)));
  else
    -- Un rendez-vous ne se confirme pas lui-même.
    if coalesce(new.data->>'status', '') = 'confirmé' and coalesce(old.data->>'status', '') <> 'confirmé' then
      new.data := jsonb_set(new.data, '{status}', coalesce(old.data -> 'status', '"en attente"'::jsonb));
    end if;
    -- La remise, la durée et les marques du serveur : la valeur d'AVANT.
    foreach cle in array array['discountXof', 'discountPct', 'remisesLignes', 'offreId',
                               'remiseFamille', 'remiseFamilleXof', 'remiseDuComptoirXof', 'dureeMin',
                               'suggereLe', 'attenduJusquAu', 'cleDuNumero', 'placeLibereeLe', 'deplacements',
                               'ouiNoteParLeComptoir'] loop
      new.data := new.data - cle;
      if old.data ? cle then
        new.data := jsonb_set(new.data, array[cle], old.data -> cle);
      end if;
    end loop;
  end if;

  return new;
end $$;

revoke all on function public.garde_reservation_cliente() from public, anon;
grant execute on function public.garde_reservation_cliente() to authenticated, service_role;

-- Après `garde_argent_cliente_biu`, avant `places_limitees` et
-- `une_place_en_ligne` (les déclencheurs passent dans l'ordre de leurs noms) :
-- la garde des places juge une ligne dont la remise est déjà retombée.
drop trigger if exists garde_reservation_cliente_biu on public.appointments;
create trigger garde_reservation_cliente_biu
  before insert or update on public.appointments
  for each row execute function public.garde_reservation_cliente();


-- ── Contrôle ───────────────────────────────────────────────────────────────
-- Trois « oui » attendus.
select
  exists (select 1 from pg_trigger where tgname = 'garde_reservation_cliente_biu' and not tgisinternal) as garde_posee,
  (select position('if exists (select 1 from public.appointments a where a.id = new.id) then' in pg_get_functiondef('public.garde_reservation_cliente()'::regprocedure)) > 0) as la_ligne_deja_la_se_garde,
  (select position('ecriture_de_la_maison()' in pg_get_functiondef('public.garde_reservation_cliente()'::regprocedure)) > 0) as la_maison_ecrit_comme_avant;
