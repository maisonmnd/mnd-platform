-- ═══════════════════════════════════════════════════════════════════
-- 0150 · UNE PIÈCE, UN SEUL WHATSAPP — 1er novembre 2026
--
-- À passer par l'agent mise-en-ligne (scripts/mise-en-ligne.mjs sql), AVEC
-- la publication du Trône, ni des heures avant ni des heures après : les
-- pièces parties sous l'ancienne clé `facture-<id>-<étape>` ne sont tenues
-- que par la marque que ce bloc pose. Un seul bloc, rejouable sans dommage :
-- la mise à jour ne touche que les pièces qui ne portent pas encore la
-- marque, et la seconde fois ne trouve plus rien.
--
-- LE FAIT. Le 31 octobre 2026, la pièce 0166 est partie à 14 h 37 depuis
-- un poste (le rituel honoré, modèle facture_du_rituel, le PDF, une clé
-- facture-<id>-modele). À 22 h 08, un autre poste a encaissé le même
-- rendez-vous : le reçu recu_de_paiement est reparti au même numéro, avec le
-- même PDF, sans clé. Rien ne savait que le papier était déjà chez elle.
--
-- LA RÈGLE (Yéman, 1er novembre 2026) : « Quand c'est parti une fois, même
-- quand on retouche, terminer, plus d'envoi. » Le Trône pose désormais
-- `data.whatsapp` sur la pièce dont le papier est parti
-- (shared/une-piece-un-message-pur.ts : partieLe, modele, parQui) et refuse
-- tout envoi automatique d'une pièce marquée.
--
-- CE BLOC pose la marque sur les pièces DÉJÀ parties avant lui, d'après
-- les messages sortants de `messages_wa` que Meta a PRIS : remis, lus, ou
-- encore « en-route » AVEC un waId (un téléphone éteint, un accusé jamais
-- revenu : le papier est pourtant parti ; seuls « non-remis » et une
-- réservation « en-route » sans waId n'ont rien envoyé) :
--   ① par la clé d'unicité : l'ancienne `facture-<id de pièce>-…` (mot,
--     modèle, lien, renvoi compris) et les neuves `piece-<id>` et
--     `piece-<id>-renvoi-<minute>`, pour les envois faits entre la mise en
--     ligne du Trône et ce bloc dont la marque locale manquerait (un reçu
--     gardé hors ligne). Jamais `starts_with(…, 'piece-' || id)` seul : un
--     identifiant préfixe d'un autre apparierait la mauvaise pièce ;
--   ② sans clé de pièce, par le nom du PDF joint `Facture-<numéro>.pdf`,
--     lu dans `data->'piece'->>'nom'` ou dans `data->>'texte'` (le reçu du
--     comptoir, la facture d'avant les clés, le reçu d'un règlement en ligne).
--     Un numéro porté par DEUX pièces (le cas connu d'un numéro d'octobre
--     2026, deux clientes à un jour d'écart) ne s'apparie pas par son nom :
--     le même message marquerait la pièce de celle qui n'a rien reçu, et
--     l'écran mentirait sur une pièce réelle. Le `select` final les liste,
--     pour une pose à la main après lecture du fil (`--montre` l'affiche).
-- Le plus ANCIEN message fait foi : c'est lui qui a mis le papier chez elle.
-- Un mot sans modèle (dans la fenêtre de 24 heures) dit son papier par son
-- en-tête, « · reçu » ou « · facture » ; sinon « message ».
--
-- CE QUE CE BLOC NE FAIT PAS, dit noir sur blanc (relecture du 1er novembre
-- 2026) :
--   · il ne pose AUCUNE clé serveur `piece-<id>` dans messages_wa : les
--     envois d'avant portaient `facture-<id>-<étape>` ou rien. Pour une
--     pièce marquée ici, seul le premier verrou (la marque) tient. Un poste
--     ouvert hors ligne pendant la migration, qui encaisse un rituel
--     prépayé ou « termine la séance » d'un rendez-vous passé avant d'avoir
--     relu la pièce, peut encore renvoyer un papier d'avant, ce jour-là.
--     La garde du jour et `recuAEnvoyer` ferment tout le reste (les rituels
--     passés). Poser ces clés aurait mis des lignes sans numéro dans une
--     table que huit écrans lisent : trop de surface pour une fenêtre d'un
--     jour.
--   · il n'apparie pas les pièces parties seulement DANS une facture du
--     foyer ou un point du compte d'avant (`Facture-du-foyer-….pdf`, le
--     message ne cite que des prénoms et des restes) : elles restent sans
--     marque ; les mêmes gardes du jour les tiennent.
--
-- `updated_at = now()` pour que les postes relisent la pièce. Vérifié le
-- 1er novembre 2026 : aucune fonction du serveur ne choisit des pièces sur
-- invoices.updated_at (confirmation-rdv lit appointments, mnd-pay lit
-- mnd_pay, demande-submit lit demandes ; relances-factures juge `date` et
-- `creeeLe`, avis-google le jour du règlement).
-- ═══════════════════════════════════════════════════════════════════

with sortants as (
  select nullif(m.data->>'cleUnique', '')        as cle,
         nullif(m.data->>'modele', '')           as modele,
         m.data->>'quand'                        as quand,
         nullif(m.data->>'parQui', '')           as par_qui,
         coalesce(m.data->'piece'->>'nom', '')   as nom,
         coalesce(m.data->>'texte', '')          as texte
    from public.messages_wa m
   where m.data->>'sens' = 'sortant'
     -- Meta a pris le message : remis, lu, ou en route avec son waId. Une
     -- réservation en route SANS waId attend encore Meta, ou a été abandonnée.
     and (m.data->>'etat' in ('remis', 'lu')
          or (m.data->>'etat' = 'en-route' and coalesce(m.data->>'waId', '') <> ''))
     and coalesce(m.data->>'quand', '') <> ''
),
-- ① La clé de la pièce : l'ancienne facture-<id>-mot, -modele, -lien et les
--   renvois facture-<id>-<minute>-<étape> ; les neuves piece-<id> (égalité
--   stricte) et piece-<id>-renvoi-<minute>. `starts_with` plutôt que `like` :
--   un identifiant peut porter un signe que `like` lirait comme un joker.
par_cle as (
  select i.id as piece_id, s.quand, coalesce(s.modele, 'message') as modele, s.par_qui
    from public.invoices i
    join sortants s
      on s.cle is not null
     and (starts_with(s.cle, 'facture-' || i.id || '-')
          or s.cle = 'piece-' || i.id
          or starts_with(s.cle, 'piece-' || i.id || '-renvoi-'))
   where i.data->'whatsapp' is null
),
-- ② Le nom du PDF, pour les envois qui n'avaient pas de clé de pièce. Jamais
--   pour un numéro porté par deux pièces : on ne sait pas laquelle est partie.
par_nom as (
  select i.id as piece_id, s.quand,
         coalesce(s.modele,
                  case when position('· reçu' in s.texte) > 0 then 'recu_de_paiement'
                       when position('· facture' in s.texte) > 0 then 'facture_du_rituel'
                       else 'message' end) as modele,
         s.par_qui
    from public.invoices i
    join sortants s
      on (s.cle is null or not (starts_with(s.cle, 'facture-') or starts_with(s.cle, 'piece-')))
     and coalesce(i.data->>'number', '') <> ''
     and (s.nom = 'Facture-' || (i.data->>'number') || '.pdf'
          or position('Facture-' || (i.data->>'number') || '.pdf' in s.texte) > 0)
   where i.data->'whatsapp' is null
     and not exists (select 1 from public.invoices j
                      where j.id <> i.id and j.data->>'number' = i.data->>'number')
),
choisis as (
  select distinct on (piece_id) piece_id, quand, modele, par_qui
    from (select * from par_cle union all select * from par_nom) t
   order by piece_id, quand asc
)
update public.invoices i
   set data = i.data || jsonb_build_object('whatsapp', jsonb_strip_nulls(jsonb_build_object(
                'partieLe', c.quand,
                'modele', c.modele,
                'parQui', c.par_qui))),
       updated_at = now()
  from choisis c
 where c.piece_id = i.id
   and i.data->'whatsapp' is null;

-- Les pièces sans marque dont le numéro est porté par une autre pièce : le
-- volet ② ne les a pas touchées. À lire dans le fil, à poser à la main.
select i.id, i.data->>'number' as numero, i.data->>'date' as jour
  from public.invoices i
 where i.data->'whatsapp' is null
   and exists (select 1 from public.invoices j where j.id <> i.id and j.data->>'number' = i.data->>'number')
 order by 2, 3;
