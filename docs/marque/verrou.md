# Le verrou de la Maison

Le verrou, c'est le pictogramme et le nom posés ensemble. Choisi le 25 septembre 2026,
après épreuve mesurée.

## Les deux formes

| | Où il va | Plancher mesuré |
|---|---|---|
| **Couché** · pictogramme à gauche, MAISON au-dessus de MND | en-têtes des papiers, barre du site, bandeaux, signatures | **123 px** de large |
| **Debout** · les trois pièces l'une sous l'autre | enseigne, tampon, format carré | **64 px** de large |

Les deux planchers sont relus de la même façon, en largeur d'encre du verrou **entier**.
Un tableau qui mélangerait cette unité avec la largeur du seul sigle ferait poser un logo
trop petit à qui croirait suivre la règle : `verifie-le-verrou` compare donc ces deux
nombres à ceux de `src/ds/verrou.ts`, et refuse qu'ils diffèrent.

Sous le plancher, on ne rapetisse pas le verrou : on pose le **pictogramme seul**, et le
nom se lit ailleurs. C'est ce que fait la barre du site sous 560 px de large.

Les proportions sont écrites une seule fois, dans [`src/ds/verrou.ts`](../../src/ds/verrou.ts).
Le site les lit pour composer son en-tête en vrai texte ; `scripts/fabrique-le-verrou.mjs`
les lit pour dessiner l'image que les PDF embarquent ; `scripts/verifie-le-verrou.mjs`
refuse que les trois se séparent, et refuse toute pose sous le plancher.

## D'où vient le plancher

Un seul critère, posé avant l'épreuve : **la capitale de « MAISON » ne descend pas sous
six pixels**. Sous cette hauteur, une capitale de romain clair cesse d'être une lettre et
devient une trace grise. Le banc réduit le dessin livré pixel par pixel et lit l'encre du
rendu, jamais la feuille de style.

Un second critère a servi à choisir la forme, sans donner de plancher : le **blanc entre
deux lettres rapporté à la lettre**. Il ne dépend pas de la taille, c'est une propriété du
dessin.

| dessin | blanc / lettre |
|---|---|
| le verrou retenu | 0,81 |
| une variante où MAISON est justifié à 40 % du corps | 1,34 |
| la même à 27 % du corps, **retirée** | 2,5 |

Au-delà de 1,5, le mot se désagrège en points dès qu'on le réduit. La variante à 27 % ne
s'emploie plus : son défaut n'était pas d'être petite, il était constant à toute taille.

## Le pictogramme est composé, jamais redessiné

Le verrou **compose** le fichier du dépôt avec le nom : il ne refait pas le dessin, il ne
l'étire pas. La seule opération subie est le **détourage**, qui retire les pixels
transparents autour du dessin, et une mise à l'échelle **uniforme**. Question posée le
25 septembre 2026, réglée par la mesure : le rapport du pictogramme dans le verrou livré
vaut 1,2105 contre 1,2113 pour le fichier du dépôt, soit **0,065 % d'écart**, l'arrondi au
pixel et rien d'autre.

Ce n'est pas une promesse, c'est un contrôle : `fabrique-le-verrou.mjs` relit le rapport du
pictogramme dans le verrou qu'il vient de rendre, le compare à celui du fichier source, et
**refuse de livrer** au-delà d'un centième. Éprouvé en écrasant volontairement le dessin de
7 % : il crie. Le jour où quelqu'un poserait une largeur à côté de la hauteur, il criera de
même.

## Deux pièges déjà payés

**Le retrait ne se pose que sur une ligne centrée.** Une ligne très écartée porte un blanc
après sa dernière lettre ; sur une ligne centrée, un `text-indent` égal à l'écartement le
compense. Sur un bloc calé à gauche, ce même retrait ne compense rien, il pousse la ligne.
Comme MAISON et MND n'ont pas le même écartement, les deux lignes ne partaient pas du même
bord : MAISON pendait de vingt-quatre pixels à gauche. Le couché n'a donc aucun retrait,
le debout garde les siens.

**La fenêtre du navigateur rogne en silence.** Dessiné à un corps trop grand, le verrou
dépassait la fenêtre sans tête et sortait amputé de sa droite, sans un mot. Le fabricant
regarde maintenant le bord de la photographie : si de l'encre le touche, il refuse.
