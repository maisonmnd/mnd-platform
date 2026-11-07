-- ═══════════════════════════════════════════════════════════════════════════
-- 0172 · RÉGLER AVANT ET APRÈS · 7 novembre 2026
--
-- « Pourquoi je ne peux pas faire un paiement d'un RDV sur ma couronne à
-- n'importe quel moment ? » (Yéman, 7 novembre 2026). Tranché au sélecteur :
-- « Avant et après ». Ma Couronne règle désormais un rendez-vous d'avance, ou
-- après coup. Sans pièce, le versement s'inscrit SUR LE RENDEZ-VOUS
-- (`payments`, kkia-…, par la fonction `regler-la-seance`), et le lien ouvert
-- depuis Ma Couronne porte sa marque (`lienDeReglement.depuisLaCouronne`,
-- posée par la fonction `terminer-et-regler`).
--
-- Ce que la relecture du 6 novembre avait vu reste vrai : une cliente écrit
-- SA ligne de rendez-vous avec son compte (la règle `own_upd`, 0045), et Ma
-- Couronne renvoie la ligne ENTIÈRE (`ecrisRendezVous`). Sans garde, un
-- téléphone en retard effacerait le versement d'avance que le serveur vient
-- de poser, ou le lien de son règlement ; et une cliente pourrait s'écrire un
-- versement « kkia-… » qui n'a jamais eu lieu, que la porte de la fin et la
-- Caisse compteraient comme reçu.
--
-- CE QUE FAIT 0172, et rien d'autre :
--   ① `argent_verse_sur_le_rdv(data)` : l'argent versé sur le rendez-vous
--      (son journal, sinon `paidXof`), la lecture d'`argentVerseSurLeRdv`
--      (src/shared/terminer-et-regler-pur.ts), que le banc compare cas par cas.
--   ② La garde de 0171, mot pour mot, avec `payments`, `lienDeReglement` et
--      `lienDuFoyer` ajoutés à ses deux listes (à la création, retirés ; à la
--      modification, ils retombent sur leur valeur d'AVANT), et une règle de
--      plus : RÉGLÉ D'AVANCE, IL NE S'ANNULE PAS PAR ELLE. Un rendez-vous qui
--      porte de l'argent versé garde son statut quand une cliente le passe
--      « annulé » : aucun remboursement ne part tout seul ; elle écrit à la
--      Maison, qui annule au Trône et décide.
--   ③ `annuler_une_seance` de 0138, mot pour mot, avec ce même refus : elle
--      rend `{ ok: false, raison: 'regle_d_avance' }`, et Ma Couronne dit
--      « écrivez à la Maison ».
-- Déplacer ne change pas : le versement suit le rendez-vous
-- (`deplacer_une_seance`, 0139, écrit `data || …`). Les écritures de la
-- Maison passent comme avant (`ecriture_de_la_maison`) : le comptoir, le
-- serveur, une fonction du serveur.
--
-- CE QUE 0172 NE FAIT PAS (à décider à part, voir docs/REPRENDRE.md) : les
-- autres champs d'argent qu'une cliente écrit encore (`discountXof`,
-- `discountPct`, `forfait`, `seriesIndex` sur le rendez-vous ; les lignes et
-- les versements d'une facture, dont seul `status = payée` est gardé).
--
-- Rejouable : `create or replace`. Essai à blanc : supabase/essai_0172_a_blanc.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⟨0172⟩
-- ① L'argent versé sur le rendez-vous lui-même, sans l'acompte.
create or replace function public.argent_verse_sur_le_rdv(d jsonb) returns numeric
language sql immutable set search_path = public as $$
  select case
    when jsonb_typeof(d->'payments') = 'array' and jsonb_array_length(d->'payments') > 0
      then coalesce((select sum(coalesce(public.abo_num(v->'amountXof'), 0)) from jsonb_array_elements(d->'payments') v), 0)
    else coalesce(public.abo_num(d->'paidXof'), 0)
  end;
$$;

grant execute on function public.argent_verse_sur_le_rdv(jsonb) to anon, authenticated, service_role;

-- ② La garde de 0171, et ce que « Régler avant et après » pose.
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
  end if;

  return new;
end $$;

-- ③ Annuler côté cliente (0138, réponse de 0169 : plus jamais « manquée », `compteeCommeManquee` est toujours false), et le refus d'un rendez-vous réglé d'avance.
create or replace function public.annuler_une_seance(p_appt_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_uid  text := (auth.uid())::text;
  v_a    public.appointments%rowtype;
  v_jour date := public.abo_aujourdhui();
  v_neuf jsonb;
begin
  if v_uid is null then
    raise exception 'Connexion requise.';
  end if;
  select * into v_a from public.appointments where id = p_appt_id for update;
  if v_a.id is null then
    return jsonb_build_object('ok', false, 'raison', 'rendez_vous_introuvable');
  end if;
  if not public.est_ma_tete(v_a.data->>'clientId') then
    return jsonb_build_object('ok', false, 'raison', 'pas_votre_rendez_vous');
  end if;
  if v_a.data->>'status' = 'annulé' then
    return jsonb_build_object('ok', true, 'dejaAnnulee', true,
      'compteeCommeManquee', false);
  end if;
  if v_a.data->>'status' = 'honoré' then
    return jsonb_build_object('ok', false, 'raison', 'deja_faite');
  end if;
  if coalesce(v_a.data->>'date', '') < v_jour::text then
    return jsonb_build_object('ok', false, 'raison', 'passee');
  end if;
  -- RÉGLÉ D'AVANCE, IL NE S'ANNULE PAS PAR ELLE (0172).
  if round(public.argent_verse_sur_le_rdv(v_a.data)) > 0 then
    return jsonb_build_object('ok', false, 'raison', 'regle_d_avance');
  end if;
  v_neuf := v_a.data || jsonb_build_object('status', 'annulé',
    'annuleeLe', public.abo_iso(public.abo_maintenant()), 'annuleePar', 'cliente');
  update public.appointments set data = v_neuf, updated_at = now() where id = v_a.id;
  return jsonb_build_object('ok', true,
    'compteeCommeManquee', false);
end;
$$;

revoke all on function public.annuler_une_seance(text) from public, anon;
grant execute on function public.annuler_une_seance(text) to authenticated;
-- ⟨/0172⟩
