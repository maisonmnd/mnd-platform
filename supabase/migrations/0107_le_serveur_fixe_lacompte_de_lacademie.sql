-- ═══════════════════════════════════════════════════════════════════
-- 0107 — LE SERVEUR FIXE L'ACOMPTE DE L'ACADÉMIE · 17 septembre 2026
--
-- La relecture adversaire de l'audit du site révélateur a lu 0106 tel qu'il
-- est, pas tel qu'il se raconte : « le montant attendu vient du serveur »
-- était faux. La ligne que `kkiapay-verify` relit pour connaître l'acompte
-- attendu est ÉCRITE PAR LE NAVIGATEUR (`acad_dem_depot ... with check (true)`),
-- avec la clé anon qui est dans le bundle public. Deux gestes suffisaient :
--   • déposer `acompteXof: 100`, payer 100 F, la vérification passait ;
--   • déposer directement `acompteConfirme: true, acompteVerseXof: 180000`,
--     et le Trône affichait « acompte reçu », puis inscrivait un paiement
--     KkiaPay fictif au dossier en faisant la candidature.
--
-- CE QUI CHANGE. Le prix et l'acompte attendu ne sont plus crus : une table
-- `academie_tarifs`, que seul le personnel écrit, porte le prix de chaque
-- parcours ; un déclencheur recalcule `prixXof` et `acompteXof` (40 %) sur
-- chaque dépôt, et RETIRE les quatre champs que seul `kkiapay-verify` a le
-- droit de poser (`acompteConfirme`, `acompteVerseXof`, `transactionId`,
-- `payeLe`), sauf quand c'est le service role qui écrit. Un parcours inconnu
-- des tarifs est refusé : mieux vaut un dépôt qui échoue qu'un acompte
-- deviné. La politique de dépôt exige en plus un nom, un téléphone, un
-- parcours, et une ligne de moins de 20 000 caractères.
--
-- À NE PAS OUBLIER : un parcours ajouté à `PARCOURS_MND` (shared/parcours.ts)
-- doit recevoir sa ligne ici, sinon le site ne peut plus déposer pour lui.
-- Les neuf prix ci-dessous sont ceux de la semence au 17 septembre 2026.
--
-- La suite, décidée pour le site révélateur : une seule fonction Edge
-- `demande-submit` (limite de débit, service role) prendra tous les dépôts
-- publics, et `acad_dem_depot` disparaîtra. En attendant, ce verrou tient.
-- ═══════════════════════════════════════════════════════════════════

-- ── LES TARIFS, ÉCRITS PAR LA MAISON SEULE ─────────────────────────
create table if not exists public.academie_tarifs (
  parcours_id text primary key,
  prix_xof    integer not null check (prix_xof >= 0),
  updated_at  timestamptz not null default now()
);
alter table public.academie_tarifs enable row level security;

drop policy if exists acad_tarifs_maison on public.academie_tarifs;
create policy acad_tarifs_maison on public.academie_tarifs for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
-- Aucune politique pour anon : le prix ne se lit pas depuis le site, il se
-- relit ici, par le déclencheur, au moment du dépôt.

insert into public.academie_tarifs (parcours_id, prix_xof) values
  ('fondation',   150000),
  ('affirmation', 250000),
  ('oeuvre',      450000),
  ('initiation',   90000),
  ('praticien',   350000),
  ('maitre',      850000),
  ('resserrage',  180000),
  ('laboratoire', 200000),
  ('referentiel', 400000)
on conflict (parcours_id) do update set prix_xof = excluded.prix_xof, updated_at = now();

-- ── LE DÉCLENCHEUR : LE SERVEUR A LE DERNIER MOT ───────────────────
create or replace function public.academie_demande_nettoie()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  role_appelant text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
  prix integer;
begin
  -- Les champs de paiement n'appartiennent qu'à kkiapay-verify (service role).
  if role_appelant <> 'service_role' then
    new.data := new.data - 'acompteConfirme' - 'acompteVerseXof' - 'transactionId' - 'payeLe';
    -- Une ligne déjà payée ne perd pas son paiement sous une mise à jour du personnel.
    if tg_op = 'UPDATE' and old.data ? 'acompteConfirme' then
      new.data := new.data
        || jsonb_build_object('acompteConfirme', old.data->'acompteConfirme')
        || jsonb_build_object('acompteVerseXof', old.data->'acompteVerseXof')
        || jsonb_build_object('transactionId',   old.data->'transactionId')
        || jsonb_build_object('payeLe',          old.data->'payeLe');
    end if;
  end if;

  -- Le prix et l'acompte viennent des tarifs, jamais du navigateur.
  if tg_op = 'INSERT' then
    select t.prix_xof into prix from public.academie_tarifs t where t.parcours_id = new.data->>'parcoursId';
    if prix is null then
      raise exception 'parcours inconnu des tarifs : %', coalesce(new.data->>'parcoursId', '(vide)')
        using errcode = 'check_violation';
    end if;
    new.data := new.data
      || jsonb_build_object('prixXof', prix)
      || jsonb_build_object('acompteXof', round(prix * 40 / 100.0));
  end if;
  return new;
end;
$$;

drop trigger if exists academie_demandes_nettoie on public.academie_demandes;
create trigger academie_demandes_nettoie before insert or update on public.academie_demandes
  for each row execute function public.academie_demande_nettoie();

-- ── LE DÉPÔT RESTE OUVERT, MAIS PLUS À N'IMPORTE QUOI ──────────────
drop policy if exists acad_dem_depot on public.academie_demandes;
create policy acad_dem_depot on public.academie_demandes for insert to anon, authenticated
  with check (
    coalesce(data->>'nom', '') <> ''
    and coalesce(data->>'telephone', '') <> ''
    and coalesce(data->>'parcoursId', '') <> ''
    and not (data ?| array['acompteConfirme', 'acompteVerseXof', 'transactionId', 'payeLe'])
    and length(data::text) < 20000
  );

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select count(*) as tarifs_poses from public.academie_tarifs;

select policyname as politique, cmd as commande, roles
from pg_policies
where schemaname = 'public' and tablename in ('academie_demandes', 'academie_tarifs')
order by tablename, policyname;

select tgname as declencheur from pg_trigger
where tgrelid = 'public.academie_demandes'::regclass and not tgisinternal
order by tgname;
