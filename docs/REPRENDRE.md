# Reprendre — restructuration du catalogue

État au 5 août 2026. À lire en premier dans une nouvelle session.

## Ce qui reste à faire : l'étape 3

Écrire et livrer **un script SQL** qui range le plateau technique dans les
ateliers. Il n'est pas encore écrit. Toutes les décisions sont prises.

La spécification complète — quelles prestations, vers quelle famille, sous quel
atelier — est dans **`docs/reference_maisons_avant_restructuration.md`**,
section « Destinations arrêtées ». Ce fichier porte aussi les chiffres d'avant
et les quatre contrôles d'après. Ne pas réinventer ces choix : ils ont été
mesurés, pas supposés.

Le script doit suivre la forme des précédents (`supabase/0013`, `0015`, `0018`) :
un aperçu qui ne modifie rien, la création et le déplacement dans **une seule
transaction**, un contrôle chiffré, un rollback complet. Livré à coller — jamais
exécuté par l'assistant, la base est en production.

## Le piège à ne pas oublier

Un rendez-vous ne stocke ni la maison ni la catégorie de ses prestations, mais
leurs identifiants. La ventilation se recalcule à chaque affichage depuis le
catalogue courant : **déplacer une prestation reclasse tout l'historique.**
C'est voulu, et c'est pourquoi les chiffres d'avant ont été relevés.

## Ce qui est déjà en place

- Familles de catégories (`parentId`) : la maison, le barème du Juste Prix et
  les calibres remontent jusqu'à l'atelier ; les forfaits « selon le calibre »
  descendent jusqu'aux familles.
- Catégorie **À FAÇON** reclassée : 4 prestations actives, 6 anciennes désactivées.
- Section **Forfaits** distincte dans chaque atelier au Catalogue.
- Boutons **+ Prestation** et **+ Forfait** séparés.

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
