# La police des lettres fon

`devise-fon.woff2` (écran) et `public/assets/fonts/devise-fon.ttf` (PDF) sont
deux sous-ensembles d'**EB Garamond** (poids 400) :

- **woff2 (écran)** — restreint aux seules lettres fon (`unicode-range` dans
  `fonts.css`) : l'écran écrit tout le latin en Cormorant, la police fon ne sert
  qu'à `ɔ ɖ ɛ` et leurs capitales. Elle reste donc minuscule.
- **ttf (PDF)** — porte EN PLUS **l'alphabet latin complet**, car le pied de page
  (`pieDeLaMaison`) écrit le nom de la Maison « Maison MND » dans cette police,
  pour qu'il soit de la même main que la devise (décision du 24 août). jsPDF n'a
  pas de police fon de secours : ce qu'il doit dessiner, il faut le lui embarquer.

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

Sous-ensemble produit par Google Fonts, via le paramètre `text=` :

```
https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400&text=<les caractères>
```

Caractères demandés (les changer oblige à régénérer le fichier). Le **ttf** (PDF)
demande, en plus de la devise et des noms fon des prestations, **tout l'alphabet
latin A–Z / a–z** (pour « Maison MND · … » au pied de page) :

```
alphabet latin complet A-Z a-z 0-9
· • — - , . ' ™ ÉÈÀÂÎÔÛÇéèàâîôûç ÍÌ
lettres fon : ɔ Ɔ ɖ Ɖ ɛ Ɛ + accent flottant U+0301
```

Le **woff2** (écran) se régénère avec le seul jeu fon (la liste historique
ci-dessous suffit) — inutile d'y mettre le latin, l'écran l'écrit en Cormorant :

```
mi nyɔ́ ɖɛkpɛ · la maison veille
MI NYƆ́ ƉƐKPƐ LA MAISON VEILLE
 ·—-,.0123456789ÉÈÀÂÎÔÛÇéèàâîôûç
```

Le `.ttf` s'obtient avec un en-tête `User-Agent: Mozilla/5.0` (sans indice de
navigateur), le `.woff2` avec un User-Agent de navigateur moderne. Après un
nouveau `.ttf`, régénérer `src/shared/devise-fon-b64.ts` (le base64 embarqué
dans les PDF) — c'est LUI que lit `pieDeLaMaison`, pas le fichier public.

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

# Cormorant Garamond et Jost, servies par nous

Depuis le 24 septembre 2026, les deux polices de la Maison ne viennent plus
de Google Fonts à chaque visite : `fonts.css` les déclare en `@font-face`
sur les fichiers de ce dossier. Google sert ces deux familles en polices
VARIABLES : un seul fichier porte tout l'axe des graisses (300 à 700), et
la feuille le déclare avec `font-weight: 300 700`. Six fichiers woff2 en
tout, dont un navigateur ne charge que ceux qu'une page emploie (style, et
plage unicode : le latin seul, tant qu'un « œ » n'appelle pas le latin
étendu).

Nommage : `<famille>[-italique]-<sous-ensemble>.woff2`, par exemple
`cormorant-latin.woff2`, `cormorant-italique-latin-ext.woff2` ou
`jost-latin.woff2`. (Le premier essai du 24 septembre avait téléchargé un
fichier par graisse, vingt-huit noms pour six contenus : Vite les a
dédoublonnés par empreinte, et c'est ainsi que le doublon s'est vu.)

## D'où viennent les fichiers

Ce sont exactement ceux que Google servait, téléchargés depuis la feuille
que rend cette adresse avec un User-Agent de navigateur moderne :

```
https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400;1,500;1,600&family=Jost:wght@300;400;500;600;700&display=swap
```

Seuls les blocs `latin` et `latin-ext` sont gardés (cyrillique et
vietnamien ne servent à rien ici). Les plages `unicode-range` sont
recopiées telles quelles, pour que le navigateur découpe comme avant. Dans
cette feuille, tous les blocs d'une même famille, d'un même style et d'un
même sous-ensemble pointent le MÊME fichier : c'est la police variable.

Pour régénérer : télécharger la feuille, prendre l'`url(...woff2)` d'un
bloc par famille, style et sous-ensemble, l'enregistrer sous le nom
ci-dessus, et réécrire les blocs `@font-face` de `fonts.css` avec le même
`unicode-range` et l'axe `font-weight: 300 700`. Le harnais
`verifie-les-polices` refuse une graisse promise hors de l'axe déclaré, et
un fichier déclaré qui n'existe pas.

## Licence

Cormorant Garamond (Christian Thalmann) et Jost (indestructible type) sont
toutes deux sous **SIL Open Font License 1.1** : redistribution et
hébergement autorisés, y compris sur un site commercial.
