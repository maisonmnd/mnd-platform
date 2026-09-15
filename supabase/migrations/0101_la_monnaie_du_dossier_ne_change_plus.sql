-- ═══════════════════════════════════════════════════════════════════
-- 0101 — LA MONNAIE D'UN DOSSIER NE CHANGE PLUS · 15 septembre 2026
--
-- « Me permettre de payer des prestataires en devises, pas seulement en
-- CFA » (Yéman). Tranché le même jour : LE DOSSIER VIT DANS SA DEVISE. Un
-- engagement porte `devise` (absente = franc CFA), et ses devis, ses lignes et
-- ses versements sont rangés dans cette monnaie.
--
-- CE QUE CETTE MIGRATION TIENT : la monnaie d'un dossier NE CHANGE PLUS dès
-- qu'un devis ou un versement y est rangé, POUR TOUT LE MONDE, direction
-- comprise. Passer en euros un dossier dont le devis dit 90 000 ferait lire
-- quatre-vingt-dix mille euros ; on ne réinterprète pas des sommes déjà
-- rangées. L'écran désactive le choix, mais deux postes qui ouvrent le même
-- dossier au même moment ne se voient pas : la barrière est en base, comme
-- pour tout le reste (0099, 0100).
--
-- SEULE LA FONCTION EST REMPLACÉE. Le déclencheur `engagements_garde`, posé
-- en 0099, l'appelle déjà : il n'y a rien à recréer. Les gardes de 0099
-- (numéro, pièce d'identité, abandon : la direction seule) sont reprises
-- telles quelles.
--
-- Les gardes RESTAURENT au lieu de refuser, comme en 0091, 0093, 0098, 0099
-- et 0100 : un refus ferait échouer la synchronisation et laisserait l'écran
-- en rouge sans que personne comprenne.
--
-- 0099 et 0100 sont passées le 15 septembre 2026. Les index
-- `devis_recus_dossier` et `versements_engagement_dossier` (0099) servent la
-- recherche ci-dessous.
-- ═══════════════════════════════════════════════════════════════════

create or replace function public.engagement_garde() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a_des_montants boolean;
begin
  if tg_op = 'INSERT' then
    if not public.est_direction() then
      new.data := new.data - 'identite' - 'abandonneLe';
    end if;
    return new;
  end if;

  -- ── LA MONNAIE NE CHANGE PLUS APRÈS LE PREMIER MONTANT, pour tous ──
  if (old.data -> 'devise') is distinct from (new.data -> 'devise') then
    select exists (select 1 from public.devis_recus where data->>'engagementId' = new.id)
        or exists (select 1 from public.versements_engagement where data->>'engagementId' = new.id)
      into a_des_montants;
    if a_des_montants then
      if (old.data ? 'devise') then
        new.data := jsonb_set(new.data, '{devise}', old.data -> 'devise', true);
      else
        new.data := new.data - 'devise';
      end if;
    end if;
  end if;

  if public.est_direction() then
    return new;
  end if;

  -- ── LE RESTE EST À LA DIRECTION (0099) ──────────────────────────
  -- Le numéro est posé à la création, jamais réécrit.
  if (old.data ? 'numero') then
    new.data := jsonb_set(new.data, '{numero}', old.data -> 'numero', true);
  end if;
  if (old.data ? 'identite') then
    new.data := jsonb_set(new.data, '{identite}', old.data -> 'identite', true);
  else
    new.data := new.data - 'identite';
  end if;
  if (old.data ? 'abandonneLe') then
    new.data := jsonb_set(new.data, '{abandonneLe}', old.data -> 'abandonneLe', true);
  else
    new.data := new.data - 'abandonneLe';
  end if;
  return new;
end;
$$;

-- ── CONTRÔLE ───────────────────────────────────────────────────────
select
  p.proname as fonction_remplacee,
  pg_get_functiondef(p.oid) like '%a_des_montants%' as monnaie_figee,
  exists (
    select 1 from pg_trigger t
    where t.tgname = 'engagements_garde' and t.tgfoid = p.oid and not t.tgisinternal
  ) as declencheur_branche
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'engagement_garde';
