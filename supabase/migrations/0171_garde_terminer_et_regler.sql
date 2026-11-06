-- ═══════════════════════════════════════════════════════════════════════════
-- 0171 · LA GARDE DE « TERMINER ET RÉGLER » · 6 novembre 2026
--
-- « Terminer et régler » (lot 1) pose deux marques sur le rendez-vous :
--   · `termineParElle`    : elle a déclaré avoir terminé (la fonction
--                           `terminer-et-regler`, puis le Trône qui y réserve
--                           sa pièce, `pieceLe`) ;
--   · `honoreAuReglement` : son règlement en ligne a soldé sa pièce (la
--                           fonction `regler-la-seance`, puis le Trône qui y
--                           réserve les suites de l'honneur, `suitesLe`).
--
-- Ce que la relecture a vu : une cliente écrit SA ligne de rendez-vous avec
-- son compte de Ma Couronne (la règle `own_upd`, 0045), et la garde de 0138
-- (`garde_argent_cliente`) ne connaissait pas ces deux clés. Elle pouvait
-- donc les poser ou les retirer elle-même, sans passer par aucune porte.
-- Le Trône ne juge plus « Réglée en ligne · Départ sans caisse » que sur la
-- PIÈCE soldée par un versement en ligne ; ici, le mur de la base : les deux
-- marques ne s'écrivent que par la Maison (le comptoir, le serveur, une
-- fonction du serveur).
--
-- CE QUE FAIT 0171, et rien d'autre : la même fonction qu'en 0138, mot pour
-- mot, avec `termineParElle` et `honoreAuReglement` ajoutés aux deux listes.
--   · À la CRÉATION par une cliente : les deux clés sont retirées (un
--     rendez-vous qui naît n'est ni terminé ni réglé).
--   · À la MODIFICATION par une cliente : chaque clé retombe sur sa valeur
--     d'AVANT (posée par la Maison, elle reste ; absente, elle le reste).
--     Un téléphone qui renvoie une ligne en retard, sans la marque que le
--     serveur vient de poser, ne l'efface donc plus.
-- Les déclencheurs ne changent pas (ils appellent la fonction par son nom).
-- Les écritures de la Maison passent comme avant (`ecriture_de_la_maison`).
--
-- CE QUE 0171 NE FAIT PAS (à décider à part, voir docs/REPRENDRE.md) : les
-- champs d'argent d'avant qu'une cliente écrit encore (`payments`,
-- `discountXof`, `discountPct`, `forfait`, `seriesIndex` sur le rendez-vous ;
-- les lignes et les versements d'une facture, dont seul `status = payée` est
-- gardé). Ma Couronne en pose plusieurs elle-même à la réservation : les
-- garder demande d'abord l'inventaire de ses chemins.
--
-- Rejouable : `create or replace`. Essai à blanc : supabase/essai_0171_a_blanc.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0171⟩
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
      -- DEMANDÉ restent (Booking). Ni terminé ni réglé à la naissance (0171).
      foreach cle in array array['depositConfirmed', 'depositConfirmedAt', 'paidXof',
                                 'coveredBySub', 'subId', 'coverKind', 'coverServiceId',
                                 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe',
                                 'confirmeeParLaClienteLe',
                                 'termineParElle', 'honoreAuReglement'] loop
        new.data := new.data - cle;
      end loop;
      if new.data->>'status' = 'annulé' then
        new.data := new.data || jsonb_build_object('annuleeLe', public.abo_iso(now()), 'annuleePar', 'cliente');
      end if;
    else
      -- Modif cliente : chaque champ protégé retombe sur sa valeur d'AVANT.
      -- `termineParElle` et `honoreAuReglement` (0171) : les marques de
      -- « Terminer et régler » ne se posent ni ne se retirent par elle.
      foreach cle in array array['depositConfirmed', 'depositConfirmedAt', 'depositXof', 'paidXof',
                                 'coveredBySub', 'subId', 'coverKind', 'coverServiceId', 'priceXof',
                                 'annuleeLe', 'annuleePar', 'absente', 'rendue', 'proposeeLe',
                                 'termineParElle', 'honoreAuReglement'] loop
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
  end if;

  return new;
end $$;
-- ⟨/0171⟩
