-- ═══════════════════════════════════════════════════════════════════════════
-- 0164 · LA PAIE PRÉVIENT CHACUN · 5 novembre 2026
--
-- Maquette « Les paiements » (claude.ai 7AvgqVQdWV1QrQn7eQoA4i), validée par
-- Yéman (« construis ») ; son choix 3 : « Prévenir chacun · notification du
-- Trône quand son argent part ». Sur le téléphone de la personne :
-- « Ta paie de novembre 2026 est partie : 50 000 F. »
--
-- POURQUOI UN DÉCLENCHEUR. Seule la base voit passer la réponse de MTN : le
-- serveur (`paie-mtn`) écrit « recu » au registre (0163) quand MTN dit
-- SUCCESSFUL, au passage de la base ou depuis le Trône. Le déclencheur prend
-- ce moment-là, une fois.
--
-- QUI EST PRÉVENU. L'envoi le dit lui-même : `prevenir`, posé par le Trône
-- quand il confie l'envoi (vrai pour l'équipe ; faux pour les prestataires,
-- les entreprises et les tests). La direction (souverain, gérant) ne l'est
-- jamais. Le compte se retrouve comme pour les pourboires (0157) : l'adresse
-- de la fiche (`compteMail`, sinon `email`) = l'adresse du compte, et le
-- compte doit être du personnel.
--
-- LES GARDES :
--   · jamais la panne d'une notification ne refuse une réponse de MTN : tout
--     le corps est sous `exception when others` ;
--   · une référence, une seule notification (journal `paies_prevenues`) ;
--   · seulement le passage À « recu », d'un autre état.
--
-- LE TEXTE est celui de src/shared/paie-par-mtn-pur.ts
-- (`notificationDeLaPaie`) ; le banc verifie-la-paie-par-mtn compare les deux.
--
-- Rejouable : `if not exists`, `create or replace`, `drop … if exists`.
-- `francs_dits` et `mois_dit` viennent de 0157 ; `appelle_fonction_edge` de 0069.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. QUI EST À PRÉVENIR : posé par le Trône, envoi par envoi ──────────
alter table public.paie_envois_mtn add column if not exists prevenir boolean not null default false;

-- ── 2. LE JOURNAL : une référence, une seule notification ──────────────
create table if not exists public.paies_prevenues (
  reference  uuid primary key,
  staff_id   text not null,
  prevenu_le timestamptz not null default now(),
  -- 'parti' · 'sans-adresse' · 'sans-compte' · 'direction' · 'refuse : …'
  issue      text not null default 'parti'
);
alter table public.paies_prevenues enable row level security;
drop policy if exists paies_prevenues_lire on public.paies_prevenues;
create policy paies_prevenues_lire on public.paies_prevenues for select to authenticated
  using (public.est_direction());
-- Personne n'y écrit que le déclencheur (security definer).
revoke all on public.paies_prevenues from anon, authenticated;
grant select on public.paies_prevenues to authenticated;

-- ── 3. LE DÉCLENCHEUR ──────────────────────────────────────────────────
create or replace function public.previens_de_la_paie() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  adresse text;
  compte uuid;
  titre text;
  jour date;
begin
  begin
    if new.genre <> 'paie' or not new.prevenir or new.etat <> 'recu' or old.etat = 'recu' then
      return new;
    end if;

    -- Une référence, une seule fois : la ligne du journal se prend d'abord.
    insert into public.paies_prevenues (reference, staff_id) values (new.reference, new.employee_id)
      on conflict (reference) do nothing;
    if not found then
      return new;
    end if;

    -- Son compte : l'adresse de sa fiche, comme est_ma_fiche (0090) et 0157.
    select lower(coalesce(nullif(trim(t.data ->> 'compteMail'), ''), trim(t.data ->> 'email')))
      into adresse from public.team t where t.id = new.employee_id;
    if coalesce(adresse, '') = '' then
      update public.paies_prevenues set issue = 'sans-adresse' where reference = new.reference;
      return new;
    end if;
    select u.id into compte from auth.users u where lower(u.email) = adresse limit 1;
    if compte is null or not exists (select 1 from public.staff s where s.user_id = compte) then
      update public.paies_prevenues set issue = 'sans-compte' where reference = new.reference;
      return new;
    end if;
    -- La direction n'est pas prévenue : elle voit tout dans Les paiements.
    if exists (select 1 from public.staff s where s.user_id = compte and s.role in ('souverain', 'gerant')) then
      update public.paies_prevenues set issue = 'direction' where reference = new.reference;
      return new;
    end if;

    -- ⟨notification-de-la-paie⟩ : « Ta paie de novembre 2026 est partie : 50 000 F. »
    -- « d’octobre », « d’avril », « d’août » : l'élision devant une voyelle, comme `duMois`.
    jour := (new.periode || '-01')::date;
    titre := 'Ta paie ' || case when extract(month from jour) in (4, 8, 10) then 'd’' else 'de ' end
      || public.mois_dit(jour) || ' est partie : ' || public.francs_dits(new.montant_xof::bigint) || '.';

    begin
      perform public.appelle_fonction_edge('push-notify', jsonb_build_object(
        'mode', 'to-staff',
        'userId', compte::text,
        'title', titre,
        'body', 'Le détail est dans Mon mois.',
        'url', '/trone/#/mon-mois',
        'tag', 'mnd-paie'
      ));
    exception when others then
      update public.paies_prevenues set issue = 'refuse : ' || left(sqlerrm, 120) where reference = new.reference;
    end;
  exception when others then
    -- Jamais une réponse de MTN refusée pour une notification.
    raise warning 'paie % : la notification ne part pas (%)', new.reference, sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.previens_de_la_paie() from public, anon, authenticated;

drop trigger if exists paie_envois_mtn_previent on public.paie_envois_mtn;
create trigger paie_envois_mtn_previent after update of etat on public.paie_envois_mtn
  for each row execute function public.previens_de_la_paie();

-- ── Contrôle ──────────────────────────────────────────────────────────
-- Attendu : prevenir 1 ; rls true ; declencheur 1 ; le texte d'exemple.
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'paie_envois_mtn' and column_name = 'prevenir') as prevenir,
  (select relrowsecurity from pg_class where oid = 'public.paies_prevenues'::regclass) as rls,
  (select count(*) from pg_trigger where tgrelid = 'public.paie_envois_mtn'::regclass and tgname = 'paie_envois_mtn_previent') as declencheur,
  'Ta paie de ' || public.mois_dit('2026-11-01'::date) || ' est partie : ' || public.francs_dits(50000) || '.' as exemple,
  (select count(*) from public.paies_prevenues) as prevenues;
