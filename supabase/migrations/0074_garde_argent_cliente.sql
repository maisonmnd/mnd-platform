-- =====================================================================
-- Maison MND — Protéger les champs d'ARGENT contre l'écriture CLIENTE directe.
-- À APPLIQUER UNE FOIS (SQL Editor → Run). Idempotent.
--
-- LE TROU (audit du 24 août 2026). Les policies own_ins/own_upd (0006, 0036)
-- laissent une cliente AUTHENTIFIÉE (Ma Couronne : e-mail/mot de passe ou
-- Google, déjà en service) écrire SA propre ligne appointments/invoices sans
-- que le CONTENU du jsonb soit contrôlé — seule la propriété (est_ma_tete) l'est.
-- Par la seule couche de sync, elle peut donc :
--   • poser depositConfirmed = true SANS payer (pas même 1 F via KkiaPay) ;
--   • gonfler depositXof / paidXof pour effacer son reste dû ;
--   • marquer une facture « payée » à son nom.
-- Ces champs sont posés par le SERVEUR (kkiapay-verify / kkiapay-webhook, en
-- service_role) ou par le COMPTOIR (staff). Ils n'ont aucun usage cliente.
--
-- LE DÉCLENCHEUR NEUTRALISE ces champs pour une écriture cliente (il les rabat
-- sur la valeur serveur au lieu de REJETER, pour ne pas casser la réservation
-- optimiste), et LAISSE PASSER staff + service_role à plein droit.
--
-- NON couvert ici (décision produit séparée) : priceXof / discountXof — le prix
-- personnalisé FIGÉ à la réservation, que le comptoir honore « exactement ».
-- Le fermer demande de recalculer le prix côté serveur depuis le catalogue.
-- =====================================================================

create or replace function public.garde_argent_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text := coalesce(current_setting('request.jwt.claims', true)::json ->> 'role', '');
  privilegie boolean := (r = 'service_role') or public.is_staff();
  cle text;
begin
  if privilegie then
    return new;                       -- serveur (kkiapay) ou comptoir : plein droit
  end if;

  if tg_table_name = 'appointments' then
    if tg_op = 'INSERT' then
      -- Création cliente : jamais de confirmation ni d'encaissé. depositXof
      -- (acompte DEMANDÉ, pour l'affichage) reste — le serveur le remplacera
      -- par le montant réellement payé.
      new.data := (new.data - 'depositConfirmed') - 'depositConfirmedAt' - 'paidXof';
    else
      -- Modif cliente : on rabat chaque champ protégé sur sa valeur d'AVANT
      -- (celle posée par le serveur / le comptoir).
      foreach cle in array array['depositConfirmed','depositConfirmedAt','depositXof','paidXof'] loop
        new.data := new.data - cle;
        if old.data ? cle then
          new.data := jsonb_set(new.data, array[cle], old.data -> cle);
        end if;
      end loop;
    end if;

  elsif tg_table_name = 'invoices' then
    -- Une cliente ne déclare pas une facture « payée » (réservé au comptoir).
    -- Elle crée / accepte des devis : brouillon, envoyée, acceptée.
    if coalesce(new.data ->> 'status', '') = 'payée' then
      if tg_op = 'UPDATE' and (old.data ? 'status') then
        new.data := jsonb_set(new.data, '{status}', old.data -> 'status');
      else
        new.data := jsonb_set(new.data, '{status}', '"envoyée"'::jsonb);
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists garde_argent_cliente_biu on public.appointments;
create trigger garde_argent_cliente_biu
  before insert or update on public.appointments
  for each row execute function public.garde_argent_cliente();

drop trigger if exists garde_argent_cliente_biu on public.invoices;
create trigger garde_argent_cliente_biu
  before insert or update on public.invoices
  for each row execute function public.garde_argent_cliente();

-- ROLLBACK (si un chemin légitime casse) :
--   drop trigger if exists garde_argent_cliente_biu on public.appointments;
--   drop trigger if exists garde_argent_cliente_biu on public.invoices;
