-- ═══════════════════════════════════════════════════════════════════════════
-- 0174 · LA GARDE DE LA FICHE D'ESSAI · 7 novembre 2026
--
-- Les fiches d'essai (« des RDV test qui ne vont pas dans notre liste de RDV,
-- ni dans le chiffre d'affaires », Yéman) reposent sur UNE marque, `essai: true`
-- sur la fiche cliente (`clients.data`, src/shared/essai-pur.ts). Or une
-- cliente écrit SA ligne `clients` avec son compte de Ma Couronne (les règles
-- `cli_ins` et `cli_upd`, 0027), et rien ne gardait cette clé : elle pouvait
-- se déclarer « fiche d'essai » et sortir ses rendez-vous, ses factures et ses
-- paiements de tous les comptes de la Maison, ou retirer la marque qui cache
-- l'essai de la Maison.
--
-- CE QUE FAIT 0174, et rien d'autre :
--   ① la garde EN BASE (celle de 0172, mot pour mot : rendez-vous et pièces ne
--      changent pas) reçoit une branche pour les fiches : à la CRÉATION par une
--      cliente, `essai` est retiré ; à la MODIFICATION, elle retombe sur sa
--      valeur d'AVANT (posée par la Maison, elle reste ; absente, elle le reste) ;
--   ② le même déclencheur qu'en 0138 est posé sur `public.clients`
--      (`garde_argent_cliente_biu`, avant insertion ou modification).
-- L'équipe, le comptoir, le serveur et les fonctions du serveur écrivent comme
-- avant (`ecriture_de_la_maison`). La garde n'appelle AUCUNE fonction que 0138
-- a retirée aux clientes (`abo_num`, `abo_vrai`, `abo_aujourdhui`,
-- `abo_maintenant`, `abo_etat_de_la_seance`) dans la branche des fiches : elle
-- ne tourne qu'avec les droits de la cliente. (Leçon de 0172.)
--
-- Rejouable : `create or replace`, `drop trigger if exists`.
-- Essai à blanc : supabase/essai_0174_a_blanc.sql. NON APPLIQUÉE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0174⟩
-- La garde de 0172, mot pour mot, avec la branche des fiches `clients`.
create or replace function public.garde_argent_cliente() returns trigger
language plpgsql security invoker set search_path = public as $$
declare
  cle text;
begin
  if public.ecriture_de_la_maison() then
    return new;                       -- comptoir, serveur, fonction du serveur : plein droit
  end if;

  if tg_table_name = 'appointments' then
    if tg_op = 'INSERT' then
      -- Création cliente : jamais de confirmation ni d'encaissé (0074), et
      -- jamais la couverture d'une formule ni les faits de la séance : seul
      -- `reserver_une_seance_incluse` les pose. Le prix figé et l'acompte
      -- DEMANDÉ restent (Booking). Ni terminé ni réglé à la naissance (0171),
      -- ni versement ni lien de règlement (0172).
      foreach cle in array array['depositConfirmed', 'depositConfirmedAt', 'paidXof',
                                 'coveredBySub', 'subId', 'coverKind', 'coverServiceId',
                                 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe',
                                 'confirmeeParLaClienteLe',
                                 'termineParElle', 'honoreAuReglement',
                                 'payments', 'lienDeReglement', 'lienDuFoyer'] loop
        new.data := new.data - cle;
      end loop;
      if new.data->>'status' = 'annulé' then
        new.data := new.data || jsonb_build_object('annuleeLe', public.abo_iso(now()), 'annuleePar', 'cliente');
      end if;
    else
      -- Modif cliente : chaque champ protégé retombe sur sa valeur d'AVANT.
      -- `termineParElle` et `honoreAuReglement` (0171) : les marques de
      -- « Terminer et régler » ne se posent ni ne se retirent par elle.
      -- `payments`, `lienDeReglement`, `lienDuFoyer` (0172) : le versement et
      -- le lien que le serveur a posés ne s'effacent ni ne se forgent.
      foreach cle in array array['depositConfirmed', 'depositConfirmedAt', 'depositXof', 'paidXof',
                                 'coveredBySub', 'subId', 'coverKind', 'coverServiceId', 'priceXof',
                                 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe',
                                 'termineParElle', 'honoreAuReglement',
                                 'payments', 'lienDeReglement', 'lienDuFoyer'] loop
        new.data := new.data - cle;
        if old.data ? cle then
          new.data := jsonb_set(new.data, array[cle], old.data -> cle);
        end if;
      end loop;
      -- Accepter une proposition : l'heure est celle du serveur, et ce qui
      -- est posé ne se retire plus.
      if old.data ? 'confirmeeParLaClienteLe' then
        new.data := jsonb_set(new.data, '{confirmeeParLaClienteLe}', old.data -> 'confirmeeParLaClienteLe');
      elsif new.data ? 'confirmeeParLaClienteLe' then
        new.data := jsonb_set(new.data, '{confirmeeParLaClienteLe}', to_jsonb(public.abo_iso(now())));
      end if;
      -- « Faite » se pose au comptoir, jamais par elle.
      if new.data->>'status' = 'honoré' and coalesce(old.data->>'status', '') <> 'honoré' then
        new.data := jsonb_set(new.data, '{status}', coalesce(old.data -> 'status', '"en attente"'::jsonb));
      end if;
      -- RÉGLÉ D'AVANCE, IL NE S'ANNULE PAS PAR ELLE (0172) : de l'argent versé
      -- sur le rendez-vous, et son statut reste celui d'avant. Elle écrit à la
      -- Maison, qui annule au Trône et décide du règlement.
      if new.data->>'status' = 'annulé' and coalesce(old.data->>'status', '') <> 'annulé'
         and round(public.argent_verse_sur_le_rdv(old.data)) > 0 then
        new.data := jsonb_set(new.data, '{status}', coalesce(old.data -> 'status', '"en attente"'::jsonb));
      end if;
      -- SON ANNULATION EST DATÉE PAR LE SERVEUR : c'est cette heure que le
      -- juge compare à celle de la séance (décision 3).
      if new.data->>'status' = 'annulé' and coalesce(old.data->>'status', '') <> 'annulé' then
        new.data := new.data || jsonb_build_object('annuleeLe', public.abo_iso(now()), 'annuleePar', 'cliente');
      end if;
    end if;

  elsif tg_table_name = 'invoices' then
    -- Une cliente ne déclare pas une facture « payée » (réservé au comptoir).
    if coalesce(new.data ->> 'status', '') = 'payée' then
      if tg_op = 'UPDATE' and (old.data ? 'status') then
        new.data := jsonb_set(new.data, '{status}', old.data -> 'status');
      else
        new.data := jsonb_set(new.data, '{status}', '"envoyée"'::jsonb);
      end if;
    end if;

  elsif tg_table_name = 'clients' then
    -- LA FICHE D'ESSAI (0174) : `essai` est la marque de la Maison. À la
    -- création, une cliente ne se la pose pas ; à la modification, elle ne la
    -- pose ni ne la retire (la valeur d'AVANT revient, absente le reste).
    new.data := new.data - 'essai';
    if tg_op = 'UPDATE' and (old.data ? 'essai') then
      new.data := jsonb_set(new.data, '{essai}', old.data -> 'essai');
    end if;
  end if;

  return new;
end $$;

-- Le même déclencheur qu'aux rendez-vous et aux pièces (0138), sur les fiches.
drop trigger if exists garde_argent_cliente_biu on public.clients;
create trigger garde_argent_cliente_biu
  before insert or update on public.clients
  for each row execute function public.garde_argent_cliente();
-- ⟨/0174⟩
