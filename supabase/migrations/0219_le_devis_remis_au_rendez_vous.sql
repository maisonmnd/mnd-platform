-- ═══════════════════════════════════════════════════════════════════════════
-- 0219 · LE DEVIS SE REMET AU RENDEZ-VOUS · 17 novembre 2026
--
-- « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV » (Yéman).
-- Le bilan (lecture, prix, devis) se remet AU rendez-vous, par la Maison : la
-- visio tenue, ou la consultation privée faite. Le Trône ne remet un devis
-- que si sa règle le permet (`peutEtreRemis`, src/shared/devis-remis-pur.ts),
-- et pose alors sa marque sur la pièce : `remisLe`, `remisPar`.
--
-- CE QUE FAIT 0219, dans la base, et rien d'autre :
--   ① `piece_lisible_par_elle(data)` : le jumeau de `lisibleParElle`. Une
--      facture, une commande de la Boutique : toujours. Un devis : remis par
--      la Maison (`remisLe`), et plus un brouillon. Un devis daté d'avant le
--      17 novembre 2026 et déjà envoyé, accepté, confirmé ou payé reste lu
--      (elle l'a en main).
--   ② une règle RESTRICTIVE sur `invoices` : une cliente ne lit que les
--      pièces lisibles par elle. Les règles `own_*` de 0036 ne changent pas ;
--      l'équipe lit tout, comme avant.
--   ③ `devis_perime(data)` : le jumeau de `estPerime`. Un devis remis vaut
--      quinze jours ; passé ce délai, il ne se valide plus.
--   ④ la garde `garde_de_la_piece_cliente` sur `invoices` : une pièce s'écrit
--      à la Maison. Sur un devis remis et encore valable, la cliente fait ses
--      trois gestes, et eux seuls : faire confirmer (estimé → à valider par la
--      Maison), valider (à valider par elle → acceptée), accepter (envoyée →
--      acceptée). Tout autre changement retombe sur la pièce d'avant, sans
--      refus (comme 0074 : sa file d'attente ne se bloque pas). Elle n'efface
--      pas une pièce, et n'en crée pas : seule une demande de devis passe
--      encore (les anciennes versions de Ma Couronne en écrivaient), née
--      « envoyée » ou « brouillon », sans lien de consultation ni de
--      rendez-vous, sans marque de Boutique, et marquée remise par elle.
--
-- L'équipe, le comptoir, le serveur et les fonctions du serveur écrivent
-- comme avant (`ecriture_de_la_maison`, 0138). La garde tourne avec les droits
-- de qui écrit, et n'appelle aucune fonction que 0138 a retirée aux clientes.
-- Elle passe APRÈS `garde_argent_cliente_biu` (ordre des noms) et AVANT
-- `garde_des_pieces_payees` (0156).
--
-- LE JOUR DE LA RÈGLE ('2026-11-17') est écrit ici et dans
-- `LE_JOUR_DE_LA_REMISE` (devis-remis-pur.ts) : `verifie-le-devis-remis`
-- compare les deux.
--
-- Rejouable : `create or replace`, `drop ... if exists`. Aucune ligne n'est
-- modifiée. Jouée dans PGlite par `scripts/verifie-le-devis-remis.mjs`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0219⟩
-- ① Ce qu'une cliente peut lire d'une pièce.
create or replace function public.piece_lisible_par_elle(d jsonb) returns boolean
language sql immutable set search_path = public as $$
  select
    coalesce(d->>'kind', '') <> 'devis'
    or coalesce(jsonb_typeof(d->'boutique'), '') = 'object'
    or (
      coalesce(d->>'status', '') <> 'brouillon'
      and (
        coalesce(d->>'remisLe', '') <> ''
        or (
          coalesce(d->>'date', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
          and (d->>'date') collate "C" < '2026-11-17'
          and coalesce(d->>'status', '') in ('envoyée', 'acceptée', 'confirmé', 'payée')
        )
      )
    );
$$;

-- ③ Un devis remis vaut quinze jours, comptés à Cotonou.
create or replace function public.devis_perime(d jsonb) returns boolean
language plpgsql stable set search_path = public as $$
declare
  v_base date;
begin
  if coalesce(d->>'kind', '') <> 'devis' or coalesce(jsonb_typeof(d->'boutique'), '') = 'object' then
    return false;
  end if;
  if coalesce(d->>'status', '') not in ('estimé', 'à valider', 'envoyée') then
    return false;
  end if;
  if not public.piece_lisible_par_elle(d) then
    return false;                     -- pas encore remis : ses quinze jours n'ont pas commencé
  end if;
  begin
    if coalesce(d->>'remisLe', '') <> '' then
      v_base := ((d->>'remisLe')::timestamptz at time zone 'Africa/Porto-Novo')::date;
    end if;
  exception when others then
    v_base := null;                   -- une marque illisible : la date du devis
  end;
  if v_base is null then
    begin
      v_base := left(d->>'date', 10)::date;
    exception when others then
      return false;
    end;
  end if;
  return (now() at time zone 'Africa/Porto-Novo')::date > v_base + 15;
end $$;

revoke all on function public.piece_lisible_par_elle(jsonb) from public;
revoke all on function public.devis_perime(jsonb) from public;
grant execute on function public.piece_lisible_par_elle(jsonb) to authenticated, service_role;
grant execute on function public.devis_perime(jsonb) to authenticated, service_role;

-- ② Une cliente ne lit que les pièces lisibles par elle.
drop policy if exists devis_remis_seulement on public.invoices;
create policy devis_remis_seulement on public.invoices as restrictive for select to authenticated
  using (public.is_staff() or public.piece_lisible_par_elle(data));

-- ④ Une pièce s'écrit à la Maison ; la cliente fait ses trois gestes sur un devis remis.
create or replace function public.garde_de_la_piece_cliente() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  v_avant text;
  v_apres text;
  v_geste text := '';
begin
  if public.ecriture_de_la_maison() then
    return coalesce(new, old);        -- comptoir, serveur, fonction du serveur : plein droit
  end if;

  if tg_op = 'DELETE' then
    return null;                      -- elle n'efface pas une pièce
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.data->>'kind', '') <> 'devis' then
      return null;                    -- une facture naît à la Maison ou au serveur
    end if;
    -- La synchronisation écrit par « insérer, ou modifier si la ligne existe » :
    -- ce déclencheur passe d'abord ici même pour une ligne déjà là. Elle est
    -- laissée telle quelle ; la branche des modifications la garde ensuite.
    if exists (select 1 from public.invoices i where i.id = new.id) then
      return new;
    end if;
    new.data := new.data - 'boutique' - 'consultationId' - 'apptId' - 'aValiderPar' - 'remisHorsRegle' - 'payments';
    if coalesce(new.data->>'status', '') not in ('brouillon', 'envoyée') then
      new.data := jsonb_set(new.data, '{status}', '"envoyée"'::jsonb);
    end if;
    new.data := new.data || jsonb_build_object(
      'remisLe', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'remisPar', 'cliente');
    return new;
  end if;

  -- MODIFICATION : la pièce d'avant, et son seul geste quand il est permis.
  v_avant := coalesce(old.data->>'status', '');
  v_apres := coalesce(new.data->>'status', '');
  if coalesce(old.data->>'kind', '') = 'devis'
     and coalesce(jsonb_typeof(old.data->'boutique'), '') <> 'object'
     and public.piece_lisible_par_elle(old.data)
     and not public.devis_perime(old.data) then
    if v_avant = 'estimé' and v_apres = 'à valider' then
      v_geste := 'faire-confirmer';
    elsif v_apres = 'acceptée'
          and (v_avant = 'envoyée' or (v_avant = 'à valider' and coalesce(old.data->>'aValiderPar', '') = 'cliente')) then
      v_geste := 'accepter';
    end if;
  end if;
  new.data := old.data;
  new.branch_id := old.branch_id;
  if v_geste = 'faire-confirmer' then
    new.data := new.data || jsonb_build_object('status', 'à valider', 'aValiderPar', 'maison');
  elsif v_geste = 'accepter' then
    new.data := (new.data - 'aValiderPar') || jsonb_build_object('status', 'acceptée');
  end if;
  return new;
end $$;

drop trigger if exists garde_de_la_piece_cliente_biud on public.invoices;
create trigger garde_de_la_piece_cliente_biud
  before insert or update or delete on public.invoices
  for each row execute function public.garde_de_la_piece_cliente();
-- ⟨/0219⟩

-- ── CONTRÔLE — LECTURE SEULE ───────────────────────────────────────────────
-- Attendu : `regle` = 1, `garde` = 1. `a_remettre` compte les devis que les
-- clientes ne lisent plus tant que la Maison ne les a pas remis : à relire au
-- Trône (Factures › Devis, pastille « à remettre »).
select
  (select count(*) from public.invoices
    where data->>'kind' = 'devis' and coalesce(jsonb_typeof(data->'boutique'), '') <> 'object') as devis,
  (select count(*) from public.invoices
    where data->>'kind' = 'devis' and coalesce(jsonb_typeof(data->'boutique'), '') <> 'object'
      and public.piece_lisible_par_elle(data)) as lisibles_par_elle,
  (select count(*) from public.invoices
    where data->>'kind' = 'devis' and coalesce(jsonb_typeof(data->'boutique'), '') <> 'object'
      and coalesce(data->>'status', '') <> 'brouillon'
      and not public.piece_lisible_par_elle(data)) as a_remettre,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'invoices' and policyname = 'devis_remis_seulement') as regle,
  (select count(*) from pg_trigger
    where tgrelid = 'public.invoices'::regclass and tgname = 'garde_de_la_piece_cliente_biud') as garde;
