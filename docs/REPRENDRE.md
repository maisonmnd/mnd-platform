# Reprendre — état du catalogue

État au 5 août 2026. À lire en premier dans une nouvelle session.

## Le catalogue est replié — 5 août 2026

**147 → 74 prestations.** Deux mouvements, dans cet ordre :

1. `supabase/0023_repli_longueurs_catalogue.sql` — 92 variantes de longueur
   (« … · Court / Mi-Long / Long ou haute densité ») repliées en 31 gestes qui
   portent chacun ses trois prix et ses trois durées. 61 lignes retirées.
2. Le ménage, écrit par `menage-catalogue.html` (à la racine du dossier
   « Le Trone ») : 12 prestations jamais réservées, choisies une à une.

Contrôles passés : aucun rituel n'a changé de montant, aucun rendez-vous ne
pointe vers une prestation disparue. **Ne pas relancer ces scripts.**

`supabase/0022_soins_une_prestation_par_geste.sql` est REMPLACÉ par le 0023 et
ne doit jamais être exécuté.

### Les tables de secours

`repli_0023_services`, `repli_0023_appointments`, `repli_0025_services`. Elles
sont le seul retour en arrière. Ne pas les supprimer avant d'avoir travaillé
quelques jours avec le nouveau catalogue. Les blocs de rollback sont en fin des
fichiers correspondants.

## Comment la longueur fonctionne désormais

Une prestation porte `prixParLongueur` et `dureeParLongueur` — un prix et une
durée par longueur travaillée. `priceXof` reste le **prix de repli** : celui
qu'annonce la Vitrine (« dès ») et qui sort quand la longueur est inconnue.

La longueur **se choisit à la réservation**, pas sur la fiche cliente : le
calibre se constate une fois au KÒKÒ™ et ne bouge plus, la longueur repousse.
Elle s'inscrit sur le rendez-vous (`Appointment.longueur`), si bien que relire
un rituel de mars ne le retarife jamais à la longueur d'aujourd'hui.

Un prix par longueur est un prix SAISI : tant que ni le modèle ni le Juste Prix
ne le modulent, il sort au franc près, sans l'arrondi commercial au 500 F.

Le sélecteur paraît à la réservation et à la Caisse dès qu'une prestation
choisie s'y facture. **Ma Couronne ne le porte pas** — une cliente n'évalue pas
sa propre longueur ; le comptoir corrige à l'arrivée.

## Le piège à ne pas oublier

Un rendez-vous ne stocke ni la maison ni la catégorie de ses prestations, mais
leurs identifiants. La ventilation se recalcule à chaque affichage depuis le
catalogue courant : **déplacer une prestation reclasse tout l'historique**, et
mettre son prix à zéro vide sa part du chiffre sur les cartes du Catalogue
(le total du rituel, lui, ne bouge pas s'il est figé).

## Deux barèmes à revoir, sans urgence

- **YÈKPÈ™ Couleur · La Révélation Végétale** — saute de 15 000 à 65 000 F entre
  court et mi-long, et n'a pas de long.
- **Manucure** et **Pédicure** — leur prix suit une longueur de cheveux qui ne
  les concerne pas. Héritage de l'ancien catalogue, appliqué partout.

## Chantiers ouverts par ailleurs

- **Factures de reprise** : `supabase/0018_factures_reprise.sql` est prêt,
  jamais exécuté. 335 pièces, statut réel selon le règlement. Décision prise,
  exécution en attente.
- **Encaissements** : le registre date les règlements de rituels par leur
  facture, pas par le journal des versements — qui existe désormais et porte sa
  propre date. `buildReceipts` doit lire ce journal pour que la caisse tombe au
  bon mois.
- **Notification APDP** de la fuite du 2 août : à la charge de la Maison, hors
  code. La purge de l'historique Git ne la remplace pas.

## Historique

Les étapes 1 à 3 de la restructuration (plateau technique rangé dans les
ateliers, familles de catégories, section Forfaits) sont faites depuis le
5 août. Voir `supabase/0019_rangement_plateau.sql` et
`docs/reference_maisons_avant_restructuration.md` pour les chiffres d'avant.
