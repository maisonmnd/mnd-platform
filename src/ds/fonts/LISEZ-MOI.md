# La police des lettres fon

`devise-fon.woff2` (écran) et `public/assets/fonts/devise-fon.ttf` (PDF) sont
**le même sous-ensemble** d'**EB Garamond** (poids 400).

## Pourquoi

Les deux polices de la Maison — Cormorant Garamond et Jost — **ne contiennent
pas** `ɔ` (U+0254), `ɖ` (U+0256) ni `ɛ` (U+025B). Vérifié le 22 août 2026 en
lisant leur table `cmap` : les trois manquent dans les deux familles. Jusque-là,
« mi nyɔ́ ɖɛkpɛ » empruntait à l'écran le dessin d'une police de secours choisie
par la machine, et sur le papier on translittérait — « mi nyó dekpe ».

EB Garamond les porte toutes les trois, plus l'accent flottant U+0301 et les
capitales `Ɔ Ɖ Ɛ`. C'est une Garamond, comme Cormorant : la parenté rend
l'emprunt invisible.

Testées et écartées : Cormorant Garamond et Jost (lettres absentes),
Gentium Book Plus (table `cmap` illisible par notre lecteur). Retenues aussi
possibles : Charis SIL, Noto Serif, Cardo — EB Garamond l'emporte par la forme.

## D'où vient le fichier

Sous-ensemble produit par Google Fonts, restreint aux caractères de la devise :

```
https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400&text=<les caractères>
```

Caractères demandés (les changer oblige à régénérer le fichier) :

```
mi nyɔ́ ɖɛkpɛ • la maison veille
MI NYƆ́ ƉƐKPƐ LA MAISON VEILLE
 ·—-,.0123456789ÉÈÀÂÎÔÛÇéèàâîôûç
```

Le `.ttf` s'obtient avec un en-tête `User-Agent: Mozilla/5.0` (sans indice de
navigateur), le `.woff2` avec un User-Agent de navigateur moderne.

## Licence

EB Garamond — **SIL Open Font License 1.1**, redistribution autorisée, y
compris intégrée à un document. Auteur : Georg Duffner, Octavio Pardo.
<https://fonts.google.com/specimen/EB+Garamond/license>

## Où c'est utilisé

- **Écran** : `src/ds/tokens/fonts.css` déclare `MND Fon` avec un
  `unicode-range` restreint aux seules lettres manquantes ; les piles
  `--font-serif` / `--font-sans` la portent en tête. Elle ne prend donc rien
  aux polices de la Maison.
- **PDF** : `src/shared/pdf.ts` (`pieDeLaMaison`) charge le `.ttf` à la
  demande et l'embarque dans le document. L'accent de `ɔ́` y est posé **à la
  main** : jsPDF n'a pas de moteur de composition, et le dessinerait à droite
  de la lettre. Le recul (0,219 em) vient des métriques de la police —
  le `ɔ` avance de 439 millièmes, son centre visuel est à 220.
