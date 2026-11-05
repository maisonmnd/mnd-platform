-- ═══════════════════════════════════════════════════════════════════════════
-- 0165 · LA PAIE SUR WHATSAPP · 6 novembre 2026
--
-- « Il faut que l'employé reçoive un message sur son WhatsApp et sur le
-- Trône » (Yéman). Au sélecteur : avec le montant (le modèle approuvé
-- `versement_engagement`), et deux boutons, « Oui, bien reçu » et
-- « Pas encore ».
--
-- ① CE QUE LE REGISTRE GARDE EN PLUS. Le serveur (`paie-mtn`) dépose le
--    WhatsApp en salle d'attente quand MTN dit reçu, et le note
--    (`whatsapp`, `whatsapp_le`). Le webhook écrit la réponse de la personne
--    (`reponse_employe` : bien-recu ou pas-encore, `reponse_employe_le`).
-- ② « PAS ENCORE » PRÉVIENT LA DIRECTION, sur son téléphone, aussitôt
--    (`push-notify`, mode direction) : MTN dit l'argent parti, la personne dit
--    ne pas l'avoir. Une fois par envoi.
--
-- Rejouable : `add column if not exists`, `create or replace`, `drop … if exists`.
-- `appelle_fonction_edge` vient de 0069, `francs_dits` et `mois_dit` de 0157.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① LES COLONNES ──────────────────────────────────────────────────────
alter table public.paie_envois_mtn add column if not exists whatsapp text;
alter table public.paie_envois_mtn add column if not exists whatsapp_le timestamptz;
alter table public.paie_envois_mtn add column if not exists reponse_employe text;
alter table public.paie_envois_mtn add column if not exists reponse_employe_le timestamptz;
alter table public.paie_envois_mtn drop constraint if exists paie_envois_mtn_reponse;
alter table public.paie_envois_mtn add constraint paie_envois_mtn_reponse
  check (reponse_employe is null or reponse_employe in ('bien-recu', 'pas-encore'));

-- ── ② « PAS ENCORE » PRÉVIENT LA DIRECTION ─────────────────────────────
create or replace function public.previens_du_pas_encore() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  jour date;
  corps text;
begin
  begin
    if new.reponse_employe is distinct from 'pas-encore' or old.reponse_employe is not distinct from 'pas-encore' then
      return new;
    end if;
    jour := (coalesce(new.periode, to_char(now(), 'YYYY-MM')) || '-01')::date;
    corps := new.nom || ' dit ne pas avoir reçu sa paie de ' || public.mois_dit(jour) || ' (' || public.francs_dits(new.montant_xof::bigint) || ')'
      || case when coalesce(new.transaction_mtn, '') <> '' then ', transaction MTN ' || new.transaction_mtn else '' end
      || '. Vérifiez chez MTN.';
    perform public.appelle_fonction_edge('push-notify', jsonb_build_object(
      'mode', 'direction',
      'title', 'Paie : « Pas encore »',
      'body', corps,
      'url', '/trone/#/personnel'
    ));
  exception when others then
    -- Jamais une réponse refusée pour une notification.
    raise warning 'paie % : la direction n''est pas prévenue (%)', new.reference, sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.previens_du_pas_encore() from public, anon, authenticated;

drop trigger if exists paie_envois_mtn_pas_encore on public.paie_envois_mtn;
create trigger paie_envois_mtn_pas_encore after update of reponse_employe on public.paie_envois_mtn
  for each row execute function public.previens_du_pas_encore();

-- ── Contrôle ──────────────────────────────────────────────────────────
-- Attendu : colonnes 4 ; declencheur 1.
select
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'paie_envois_mtn'
     and column_name in ('whatsapp', 'whatsapp_le', 'reponse_employe', 'reponse_employe_le')) as colonnes,
  (select count(*) from pg_trigger where tgrelid = 'public.paie_envois_mtn'::regclass and tgname = 'paie_envois_mtn_pas_encore') as declencheur;
