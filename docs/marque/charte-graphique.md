# Charte graphique de la Maison MND

Version 1.0 · 29 septembre 2026 · Cotonou

Ce document fixe l'identité visuelle de la Maison MND et de ses sous-marques,
et la manière de l'appliquer sur tout support : écran, papier, enseigne,
réseaux, messages. Il est construit selon la structure usuelle des chartes
internationales (identité, logo, couleur, typographie, grille, image, voix,
applications, accessibilité, gouvernance) et cite, pour chaque chapitre, la
norme qui s'applique. Là où le dépôt porte déjà une règle (tokens, verrou,
polices), ce document la reprend telle quelle : **le code reste la source de
vérité**, la charte en est la lecture pour les humains.

Une version visuelle, prête à imprimer, accompagne ce texte :
`docs/marque/charte-graphique.html` et son export `charte-graphique.pdf`.

## Sommaire

0. Objet, portée et normes de référence
1. La Maison : nom, devise, signature
2. Le pictogramme et le verrou
3. L'architecture de marque : les sous-marques
4. La couleur
5. La typographie et les lettres fon
6. L'espace, la grille, les formes
7. Le mouvement
8. Les motifs, monogrammes et icônes
9. La photographie
10. La voix : écrire pour la Maison
11. Les applications : écran, papier, réseaux, enseigne, messages
12. L'accessibilité et la conformité
13. Les fichiers : où sont les sources, formats, licences
14. La gouvernance : qui décide, comment la charte change
Annexes : tables de contraste, équivalences d'impression, liste de contrôle

---

## 0. Objet, portée et normes de référence

**Objet.** Garantir qu'une pièce signée MND, où qu'elle paraisse, soit reconnue
au premier regard et tienne la même promesse : sobriété, netteté, chaleur.

**Portée.** Toutes les surfaces de la Maison : le portail, Le Trône (ERP),
Ma Couronne (app cliente), La Consultation, LOKAA, le Certificat, le Bilan, le
Bulletin, le site public révélateur, les PDF (factures, reçus, lettres,
certificats), les affiches et publications, l'enseigne et le tampon, les
messages WhatsApp et e-mails, y compris ceux que l'IA rédige.

**Ce qui prime.** En cas de contradiction entre ce document et le dépôt, le
dépôt gagne, et ce document se corrige. Les règles « non négociables » du
`CLAUDE.md` restent non négociables ici.

**Normes et référentiels cités dans cette charte.**

| Domaine | Référence | Ce qu'on en retient |
| --- | --- | --- |
| Couleur écran | IEC 61966-2-1 (sRGB) | Toutes les valeurs HEX/RGB de la charte sont sRGB. Aucune valeur n'est donnée en Display P3. |
| Couleur imprimée | ISO 12647-2 (offset), ISO 12647-7 (épreuve contractuelle), profils ICC (ISO 15076-1), PSO Coated v3 (Fogra 51) | Les CMJN de l'annexe sont des valeurs de départ ; la teinte de référence est validée sur épreuve contractuelle, puis inscrite ici. |
| Conditions d'observation | ISO 3664:2009 | Les couleurs se jugent sous D50 ; jamais sous un néon de bureau ni un écran non calibré. |
| Formats papier | ISO 216 (A4, A5, A6), ISO 217 | Papeterie et PDF en A4 portrait ; certificat en A4 paysage ; cartes en A6 ou 85 × 55 mm. |
| Fichiers PDF | ISO 32000 (PDF), ISO 19005 (PDF/A) | Les pièces d'archive (certificats, contrats) se conservent en PDF/A-2b avec polices embarquées. |
| Accessibilité | WCAG 2.2 niveau AA (W3C) ; la version 2.0 est ISO/IEC 40500:2012 ; EN 301 549 | Contraste 4,5:1 pour le texte, 3:1 pour le grand texte et les composants ; cibles de 24 px ; mouvement réduit respecté. |
| Ergonomie | ISO 9241-210, ISO 9241-112 | Conception centrée sur la cliente ; hiérarchie visuelle lisible sur téléphone d'abord. |
| Caractères | Unicode (ISO/IEC 10646), normalisation NFC | Les lettres fon sont des caractères Unicode, jamais des substituts. |
| Langue, pays, devise, dates | ISO 639 (fr, fon), ISO 3166-1 (BJ), ISO 4217 (XOF, EUR, USD), ISO 8601 | Dans les données, les codes ; à l'affichage, le français de la Maison. |
| Typographie française | Lexique des règles typographiques en usage à l'Imprimerie nationale | Espaces insécables avant « : ; ? ! », guillemets « à chevrons », nombres groupés par trois. |
| Polices | SIL Open Font License 1.1 | Cormorant Garamond, Jost et EB Garamond : redistribution et embarquement autorisés, y compris à usage commercial. |
| Icônes d'application | W3C Web Application Manifest (icônes « maskable ») | Le pictogramme reste dans la zone sûre centrale (80 %) des icônes maskables. |

---

## 1. La Maison : nom, devise, signature

### 1.1 Le nom

- La marque s'écrit **MND**, trois capitales, sans point.
- La raison de dire « Maison » : le nom complet est **Maison MND**. Il se tient
  seul (entête, signature, pied de page). Il ne s'insère pas au milieu d'une
  phrase française : on écrit « La Maison pense à vous », jamais « Toute la
  Maison MND pense à vous ».
- **L'atelier MND** est l'ancien nom. Il ne s'emploie plus pour la marque mère.
  Il survit comme sous-marque des branches (« L'Atelier MND », voir § 3).
- La ligne légale, au pied des pièces administratives, vient de
  `shared/identite.ts` : `ACIA 1 · RCCM RB/COT/12 A 14509`. Elle n'est jamais
  recopiée à la main.
- La ville qui signe est **Cotonou** (le siège), quelle que soit l'adresse de la
  branche.

### 1.2 La devise

- En fon : **mi nyɔ́ ɖɛkpɛ**. Le ɖ n'appartient qu'à elle : il n'entre jamais
  dans « MND ».
- Entière, telle qu'elle s'écrit : **mi nyɔ́ ɖɛkpɛ, et vous le savez**. Le fon
  dit ce que vous êtes, le français achève. Une virgule les lie, pas un point
  médian : la seconde moitié dépend de la première.
- Traduction, pour qui ne lit pas le fon : « vous êtes beaux, et vous le
  savez ». En fon, « mi » porte « vous » et « nous » ; c'est le français qui
  choisit, et la Maison a choisi « vous ».
- **Une seule source** : `DEVISE_COMPLETE` dans `src/shared/identite.ts`. La
  devise n'est jamais recopiée à la main : chaque copie a fini par diverger.
- Les lettres fon ne se translittèrent jamais. « mi nyo dekpe » est une faute,
  pas une variante.

### 1.3 La signature

- Tout message écrit par l'IA se termine par la signature de la Maison, posée
  **par le code** (`signeLeMessage()`), jamais demandée au modèle. Elle ne se
  pose qu'une fois : la fonction reconnaît la devise même écorchée.
- Forme de la signature texte (WhatsApp, e-mail) : le picto typographique de la
  branche, le nom, la devise. Un lien wa.me ne transporte que du texte : le vrai
  pictogramme se pose en photo de profil du compte, où il signe chaque message.
- Forme de la signature imprimée (pied des PDF, `pieDeLaMaison()`) : le nom et
  la devise dans la même main (police de la devise), centrés.

### 1.4 Le point médian

Le point médian « · » est le seul séparateur de la Maison entre deux éléments
de même rang sur une ligne : « SÍNSÍN™ · La Reprise », « Cotonou · GMT+1 ».
Jamais de puce ronde « • », jamais de barre « | ». Il ne remplace jamais une
phrase.

---

## 2. Le pictogramme et le verrou

### 2.1 Le pictogramme

Une couronne : un arc posé sur une barre, traversé d'une tige. C'est le seul
signe de la Maison. Il est **composé, jamais redessiné** : les fichiers du
dépôt sont la seule source (`public/assets/vectoriel/pictogramme-*.svg`). Les
seules opérations permises sont le détourage (retirer le vide autour du
dessin) et la mise à l'échelle **uniforme**. Le rapport largeur/hauteur du
dessin est 1,211 ; le script de fabrication refuse de livrer un verrou qui
s'en écarte de plus d'un centième.

Le pictogramme existe en huit encres : indigo, indigo profond, cuivre,
obsidienne, ivoire, sable, argile, or. Les trois premières et l'ivoire sont
les encres de la Maison ; sable et argile servent en filigrane sur fond clair ;
l'or est réservé au sceau du Trône et au site public (voir § 4.6).

### 2.2 Le verrou

Le verrou, c'est le pictogramme et le nom posés ensemble. Il en existe deux, et
un seul est le principal.

| Forme | Composition | Emploi | Plancher (largeur d'encre du verrou entier) |
| --- | --- | --- | --- |
| **Couché** (principal) | Pictogramme à gauche ; MAISON au-dessus de MND à droite | En-têtes des papiers, barre du site, bandeaux, signatures | **123 px** à l'écran · **33 mm** sur papier |
| **Debout** | Les trois pièces l'une sous l'autre | Enseigne, tampon, format carré, photo de profil | **64 px** à l'écran · **17 mm** sur papier |

Les proportions sont écrites une seule fois, dans `src/ds/verrou.ts` :

- corps de MAISON : 42/132 du corps du sigle ;
- écartement du sigle MND : 0,30 em ; écartement de MAISON : 0,44 em ;
- blanc entre MAISON et MND : 16/132 du corps du sigle ;
- couché : blanc entre pictogramme et texte 44/132 ; hauteur du pictogramme
  1,10 fois la hauteur du bloc de texte (le dixième en plus corrige l'illusion
  d'optique : sans lui, l'œil trouve le pictogramme plus petit que le texte) ;
- debout : blanc sous le pictogramme 44/132 ; largeur du pictogramme 0,74 fois
  la largeur du sigle.

**MAISON n'est pas justifié à la largeur du sigle.** Il garde son écartement et
reste plus étroit : c'est ce qui lui permet d'être petit sans se désagréger.
La variante qui justifiait MAISON sur toute la largeur du sigle ne s'emploie
plus.

### 2.3 Le plancher, et ce qu'on fait en dessous

Le plancher n'est pas estimé, il est mesuré : on réduit le verrou jusqu'à ce
que la capitale de MAISON tombe sous six pixels, hauteur sous laquelle une
capitale de romain clair devient une trace grise. À 123 px de large le verrou
couché tient encore ; à 122 il ne tient plus.

**Sous le plancher, on ne rapetisse pas le verrou : on pose le pictogramme
seul**, et le nom se lit ailleurs. C'est ce que fait la barre du site sous
560 px de large, et ce que font les icônes d'application.

### 2.4 La zone de protection

Autour du verrou, rien n'approche à moins de **X**, X étant la hauteur du
sigle MND (la hauteur de capitale de « MND »). Pour l'écran, le token
`--logo-clearspace` (24 px) est le minimum absolu aux tailles courantes ; à
grande taille, X prime. Aucun texte, aucun filet, aucun bord de photo n'entre
dans cette zone.

### 2.5 Les couleurs du verrou

| Fond | Verrou |
| --- | --- |
| Ivoire, sable, argile, papier blanc | Indigo Royal (par défaut). Cuivre admis pour une pièce non administrative (carte, invitation). |
| Indigo, indigo profond, toute sous-marque en aplat | Ivoire, sigle compris : c'est le fond qui porte la teinte. |
| Photo | Ivoire sur un voile sombre (`--veil-bottom` / `--veil-top`), jamais à nu sur une zone chargée. |
| Dégradé des Événements | Sur le début du bain (côté indigo), jamais sur sa fin : l'ivoire y tient 8,1:1 contre 3,1:1 à l'autre bout. |

L'encre des pièces administratives est **l'indigo**, pas le cuivre : un
tampon de 34 mm n'est presque que de petites lettres, l'indigo survit à une
photocopie là où le cuivre part en gris, et le monogramme cuivre ouvre déjà le
papier en tête, l'indigo le ferme.

### 2.6 Les interdits

- Étirer, incliner, faire tourner le pictogramme ou le verrou.
- Redessiner la couronne « à la main », même fidèlement.
- Ajouter ombre portée, contour, dégradé ou relief au pictogramme.
- Poser le verrou en dessous de son plancher, ou dans une couleur hors de la
  gamme (§ 4).
- Séparer les lignes MAISON et MND, ou recomposer le nom dans une autre police.
- Placer le ɖ ou toute lettre fon dans le sigle.
- Poser un verrou de sous-marque en couleur sur un fond de la même couleur.

---

## 3. L'architecture de marque : les sous-marques

Un seul pictogramme, jamais redessiné, et un seul verrou. **Le mot du métier
prend la place de MAISON**, au-dessus ; MND reste la grande ligne. Une
sous-marque n'est donc pas un autre logo : c'est le même, avec un mot échangé et
une couleur à elle. La gamme est écrite dans `docs/marque/sous-marques/gamme.json`.

| Sous-marque | Ligne du haut | Vocation | Couleur | HEX | Signature |
| --- | --- | --- | --- | --- | --- |
| Maison MND | MAISON | la marque mère, le salon d'Akpakpa | Indigo Royal | #1E2150 | mi nyɔ́ ɖɛkpɛ, et vous le savez |
| L'Atelier MND | L'ATELIER | les branches, d'une ville à l'autre | Ocre Brûlé | #936518 | Ouvrir. Porter. Essaimer. |
| Académie MND | ACADÉMIE | formations, certifications, transmission | Vert Savoir | #2F5D50 | Former. Transmettre. Affirmer. |
| Boutique MND | BOUTIQUE | produits, outils, objets | Prune Profonde | #4A2C5C | Choisir. Entretenir. Durer. |
| Soins MND | SOINS | routines, cuir chevelu, entretien | Bleu Lagune | #2E6F8E | Nourrir. Apaiser. Fortifier. |
| Événements MND | ÉVÉNEMENTS | ateliers, rencontres, défilés, lancements | Bleu Pétrole | #1F4D62 | Rassembler. Parer. Célébrer. |
| Studio MND | STUDIO | portraits, contenu, éditorial | Bordeaux | #6E283C | Cadrer. Révéler. Garder. |
| LOKAA by MND | LOKAA | offre entreprise, logiciel pour salons | Noir Encre | #1A1A1A | Équiper. Servir. Grandir. |

Règles :

- **« MND » reste indigo, toujours**, quelle que soit la vocation écrite
  au-dessus : c'est le nom de la Maison, il ne prend pas la couleur de ce qui
  le précède. Sur un fond coloré, le verrou entier passe en ivoire.
- **Un seul aplat par sous-marque.** Les dégradés n'existent que pour les
  Événements, sur les fonds uniquement, jamais sur le pictogramme ; partout
  ailleurs les Événements se replient sur leur Bleu Pétrole.
- Deux dégradés des Événements sont admis : **Option A · Souverain**
  (#1E2150 → #1F4D62 → #6E283C → #B97A4A, tout vient de la palette) et
  **Option B · Vif** (#1E2150 → #5B3FA6 → #C2306E → #E8683A → #E9844C, pour
  l'affiche ou l'écran vus de loin). Le verrou se pose sur le début du bain.
- Ce qui est mesuré : le pictogramme ivoire tient au moins 4,5:1 sur chaque
  champ de sous-marque ; deux sous-marques s'écartent d'au moins 12 en Lab (la
  paire la plus serrée est à 13,8), sous quoi l'œil les confond sur une tuile
  de soixante pixels.
- **MND Kids** et **MND Formation** sont des offres, pas des sous-marques : ils
  s'écrivent en texte, avec le verrou de la Maison ou de l'Académie.
- LOKAA en marque blanche : « Propulsé par MND » en pied, pictogramme de la
  Maison, accent du locataire ; jamais le verrou du locataire recomposé avec la
  couronne.

---

## 4. La couleur

« Le neutre domine, l'indigo structure, le cuivre ponctue. » Aucune couleur
hors de ce système n'est autorisée. Les valeurs sont celles de
`src/ds/tokens/colors.css`, en sRGB.

### 4.1 Les couleurs de marque

| Nom | HEX | RGB | Rôle |
| --- | --- | --- | --- |
| **Indigo Royal** | #1E2150 | 30 · 33 · 80 | La signature. Aplats structurants, surfaces sombres, encre administrative. |
| Indigo profond | #15173A | 21 · 23 · 58 | Dégradés profonds, fond le plus sombre. |
| **Cuivre Noble** | #B97A4A | 185 · 122 · 74 | L'accent : boutons, filets, eyebrows, détails. Jamais du texte courant sur fond clair. |
| Obsidienne | #14141B | 20 · 20 · 27 | Le texte courant sur fond clair. Pas une surface. |

### 4.2 Les neutres minéraux

| Nom | HEX | RGB | Rôle |
| --- | --- | --- | --- |
| **Ivoire** | #F6F1E7 | 246 · 241 · 231 | Le papier par défaut. |
| Sable | #E3DACB | 227 · 218 · 203 | Fond alternatif, cartes, filets doux. |
| Argile | #CDBBA9 | 205 · 187 · 169 | Fond chaleureux, filigranes. |

### 4.3 Les rampes

Trois rampes de 50 à 900, écrites dans les tokens (`--indigo-*`, `--copper-*`,
`--obsidian-*`). L'indigo 600 et le cuivre 500 sont les références. On ne
crée pas de teinte intermédiaire « à l'œil » : on prend le cran de la rampe.

### 4.4 Les alias sémantiques

Les écrans n'emploient pas les HEX : ils emploient les alias, pour qu'un
changement de teinte se propage partout.

| Alias | Valeur | Emploi |
| --- | --- | --- |
| `--paper` / `--paper-2` / `--paper-3` | ivoire / sable / argile | Fonds |
| `--ink` / `--ink-soft` | obsidienne / obsidienne 400 | Texte courant / secondaire |
| `--ink-invert` / `--ink-invert-soft` | ivoire / indigo 200 | Texte sur fond profond |
| `--accent` / `--accent-strong` | cuivre 500 / cuivre 600 | Accent, filets, eyebrows |
| `--structure` / `--structure-deep` | indigo / indigo profond | Aplats, surfaces sombres |
| `--hairline` | obsidienne à 14 % | Séparateur discret sur clair |
| `--focus-ring` | cuivre à 55 % | Anneau de focus clavier |

### 4.5 Les règles d'emploi

1. **Le neutre domine.** Plus de 80 % d'une surface est ivoire, sable ou
   argile. Un écran « tout indigo » est un écran de cérémonie (La Consultation),
   pas la règle.
2. **Surfaces sombres : indigo, pas obsidienne.** L'obsidienne est une encre,
   trop sombre pour un fond ; on ne l'introduit pas dans de nouveaux écrans,
   même si une maquette la mentionne. Le site public va plus loin : aucun noir,
   le sombre y est l'indigo.
3. **Le cuivre est un accent.** Sur ivoire il tient 3,1:1 : assez pour un
   bouton, un filet, un grand titre, un eyebrow en capitales ; pas assez pour
   du texte courant (4,5:1 exigé). Un texte cuivre sur fond clair prend le
   cuivre 700 (#7C4C2C, 6,4:1) ou l'indigo.
4. **L'indigo est l'encre des chiffres et des papiers.** Il survit à la
   photocopie et au noir et blanc.
5. **Les états** : brique #96412E pour l'alerte et l'erreur, vert sauge
   #4A6B52 pour l'accord ; ils ne servent qu'à dire un état, jamais à décorer.
6. **Aucun dégradé décoratif**, sauf `--grad-indigo` pour un aplat profond et
   les bains des Événements. Les voiles sur photo (`--veil-*`) protègent le
   texte, ils n'ornent pas.

### 4.6 L'or : une exception à périmètre fermé

L'or (#B8902F pour le sceau, #C9A84C sur le site public, or profond #8B5E15)
existe à deux endroits seulement : le **sceau du Trône** et le **site
révélateur**, dont la palette est or, crème (#FBF7F0), terre (#3D2B1F) et
l'indigo de la Maison. Sur le site, l'or est l'accent ; il tient 6,6:1 sur
indigo et 2,1:1 sur crème : il n'y est donc jamais du texte courant, et les
petits textes dorés prennent l'or profond (5,3:1). Les cinq applications
gardent indigo et cuivre. Ne pas mélanger or et cuivre sur une même pièce.

### 4.7 L'impression

Les équivalences CMJN de l'annexe B sont des conversions de départ (sRGB vers
CMJN sans profil). **La teinte de référence s'établit sur épreuve
contractuelle** (ISO 12647-7) avec le profil de l'imprimeur (PSO Coated v3 pour
un papier couché, PSO Uncoated v3 pour un papier non couché), sous éclairage
D50 (ISO 3664). Les codes Pantone se choisissent sur nuancier physique, en
regard de l'épreuve, puis s'inscrivent à l'annexe B ; ils ne se devinent pas
depuis un écran.

Repères d'impression : fond perdu 3 mm, marge de sécurité 5 mm, trait
minimal 0,25 pt, texte minimal 7 pt en Jost et 8 pt en Cormorant, aucun texte
de moins de 10 pt en défonce ivoire sur indigo.

---

## 5. La typographie et les lettres fon

### 5.1 Deux familles, aucune exception

| Famille | Rôle | Graisses servies | Emploi |
| --- | --- | --- | --- |
| **Cormorant Garamond** | la voix | variable 300 à 700, romain et italique (italique 300 à 600) | Titres, chiffres de tête, citations (italique), sigle MND |
| **Jost** | la clarté | variable 300 à 700, romain | Corps de texte, labels, boutons, tableaux, données |

Toute autre police est interdite, y compris dans un document bureautique, une
publication sociale ou un message : on choisit alors Cormorant Garamond et
Jost si elles sont disponibles, sinon on **n'imite pas** avec une police
« proche ». Un support sans les polices de la Maison prend Georgia et une
grotesque système, et le dit.

Les polices sont **servies par la Maison** depuis `src/ds/fonts/` (fichiers
variables, sous-ensembles latin et latin étendu, licence OFL 1.1). Aucun appel
à un hôte tiers : un harnais (`verifie-les-polices`) le refuse.

### 5.2 Les lettres fon

Ni Cormorant ni Jost ne portent ɔ, ɖ, ɛ. La police **MND Fon** (sous-ensemble
d'EB Garamond, une Garamond comme Cormorant : la parenté rend l'emprunt
invisible) les sert à l'écran par `unicode-range`, restreinte à
U+0186, U+0189, U+0190, U+0254, U+0256, U+025B et à l'accent flottant U+0301.
Placée en tête des piles `--font-serif` et `--font-sans`, elle ne prend rien
aux polices de la Maison.

Sur le papier, `pieDeLaMaison()` embarque le TTF dans le PDF et pose l'accent
de « ɔ́ » à la main (recul de 0,219 em), jsPDF n'ayant pas de moteur de
composition. Les noms fon des gestes suivent la même règle.

Les gestes s'écrivent avec leur marque, sans espace avant le ™ :
VÈKPÈ™, SÍNSIN™, FÍNFÍN™, YÈKPÈ™, GBÀTÀ™, DÀNDÀN™, KLƆKLƆ™.

### 5.3 L'échelle

| Rôle | Police | Corps | Graisse | Interlignage | Interlettrage |
| --- | --- | --- | --- | --- | --- |
| Display | Cormorant | 64 à 128 px (`clamp(64px, 9vw, 128px)`) | 300 | 0,92 | −0,01 em |
| H1 | Cormorant | 46 à 74 px | 300 à 400 | 1,05 | −0,01 em |
| H2 | Cormorant | 34 à 50 px | 300 à 400 | 1,05 | −0,01 em |
| H3 | Cormorant | 26 à 34 px | 400 | 1,05 | 0 |
| Citation | Cormorant italique | 24 à 38 px | 300 | 1,25 | 0 |
| Accroche | Jost | 18 px | 300 à 400 | 1,6 | 0 |
| Corps | Jost | 14 px | 400 | 1,6 | 0 |
| Petit | Jost | 13 px | 400 | 1,6 | 0 |
| Label, eyebrow | Jost capitales | 12 px | 500 à 600 | 1,25 | 0,26 em |
| Micro | Jost | 11 px | 400 | 1,4 | 0 |
| Sigle MND | Cormorant capitales | selon le verrou | 400 | 1 | 0,30 em (verrou) · 0,34 em (`.mnd-sigle`) |

Le corps de 14 px est le minimum du texte courant à l'écran ; 16 px sur le
site public. Aucun texte lu en dessous de 11 px. Sur papier : corps 10 à 11 pt
en Jost, titres 24 à 36 pt en Cormorant.

Les graisses des tokens ont été rehaussées d'un cran pour la lisibilité
(`--weight-light` vaut 400) : le « 300 » de la règle de marque désigne le
dessin Light de Cormorant pour les grands titres, non le corps de texte.

### 5.4 L'eyebrow

Le label en capitales très espacées (Jost 12 px, 0,26 em, cuivre) ouvre un
bloc ou nomme une section. Il est court (deux à quatre mots), jamais une
phrase, jamais suivi de deux-points.

### 5.5 Les règles d'écriture typographique (français)

- Espace insécable avant « : », « ; », « ? », « ! » et à l'intérieur des
  guillemets « à chevrons ». Pas de guillemets droits "".
- Nombres groupés par trois avec une espace fine insécable : 15 000 F.
- Les montants : nombre, espace insécable, unité ; toujours par `fmtMoney()`
  à l'écran ; la devise suit la branche.
- **Pas de tiret cadratin « — » dans le texte affiché** : la virgule ou le
  deux-points le remplacent. Le tiret « fait trop IA ».
- Point médian « · » entre éléments de même rang ; jamais « • », jamais « | ».
- Pas d'émojis, nulle part, y compris dans les messages.
- Capitales accentuées : É, À, Ç.
- Les dates s'écrivent en toutes lettres à l'affichage (« 29 septembre 2026 »)
  et en ISO 8601 dans les données.

---

## 6. L'espace, la grille, les formes

### 6.1 Le module

La grille est celle du monogramme : un module carré de **8 px**. Tout
espacement est un multiple de 4 (`--space-1` 4 px … `--space-10` 128 px). Les
respirations éditoriales prennent 96 ou 128 px.

### 6.2 Les conteneurs

| Token | Largeur | Emploi |
| --- | --- | --- |
| `--container-narrow` | 720 px | Prose, manifeste, lettres |
| `--container-text` | 960 px | Pages de texte |
| `--container-wide` | 1200 px | Tableaux, grilles |
| `--container-max` | 1320 px | Limite absolue |

Le mobile d'abord : Ma Couronne vit dans un cadre 390 × 844 ; le site public se
lit à une main. Gouttière minimale de 16 px sur téléphone.

### 6.3 Les rayons

**2 à 4 px, jamais plus.** `--radius-sm` 2 px pour les champs et puces,
`--radius-md` 4 px pour les cartes et boutons. Le seul cercle admis est le
sceau ou le badge cerclé (`--radius-pill`). La Maison ne s'arrondit pas.

### 6.4 Les filets

- Filet cuivre 2 px : l'accent, sous un titre ou en tête d'une carte.
- Filet indigo 1 px : la structure, les tableaux.
- Hairline (obsidienne à 14 %) : le séparateur discret.
Jamais de bordure de 3 px ou plus, jamais de double filet.

### 6.5 Les ombres

Ombres teintées d'obsidienne, diffuses, jamais dures (`--shadow-xs` à
`--shadow-xl`). Sur fond indigo, l'ombre se teinte (`--shadow-indigo`). Une
carte au repos porte au plus `--shadow-sm` ; une modale `--shadow-lg`.

---

## 7. Le mouvement

Fondu, sans rebond. Les transitions sont courtes et sobres :

| Token | Valeur | Emploi |
| --- | --- | --- |
| `--dur-fast` | 140 ms | Survol, focus |
| `--dur-base` | 240 ms | Ouverture d'un volet, changement d'état |
| `--dur-slow` | 420 ms | Entrée d'un écran (`mnd-rise`) |
| `--ease-soft` | cubic-bezier(0.22, 0.61, 0.36, 1) | Par défaut |
| `--ease-inout` | cubic-bezier(0.45, 0, 0.2, 1) | Aller-retour |

Interdits : rebond, élastique, rotation décorative, parallaxe, chargement
animé qui tourne. Le mouvement dit que quelque chose a changé ; il ne divertit
pas. `prefers-reduced-motion: reduce` coupe toute animation et toute
transition, sans exception.

---

## 8. Les motifs, monogrammes et icônes

### 8.1 Les motifs

Trois motifs allover (rosette, arcade, tresse) et un médaillon, en cuivre sur
indigo ou ivoire (`public/assets/motifs/`). Ils habillent un fond, une
couverture, un dos de carte. **Un motif ne passe jamais sous le texte
courant.** Il s'emploie « aéré » (les versions `allover-aere-*`), à faible
contraste, et une seule fois par pièce.

### 8.2 Les monogrammes

Le monogramme (le pictogramme en carré, `public/assets/monograms/`) ouvre les
pièces imprimées en tête, en cuivre. Dans un PDF il s'embarque compressé
(`compression: 'FAST'`) : une facture ne pèse pas dix mégaoctets.

### 8.3 Les icônes d'application

| Surface | Fichiers | Règle |
| --- | --- | --- |
| Portail, Trône, Couronne, LOKAA | `public/assets/icons/<sœur>-192.png`, `-512.png`, `-maskable-512.png` | Pictogramme seul, centré, dans la zone sûre de 80 % de l'icône maskable (W3C). Fond de la sœur : ivoire pour le portail et la Couronne, indigo pour le Trône, neutre pour LOKAA. |
| Favicon, écran d'accueil | `public/assets/icones/icone-32/180/192/512.png` | Pictogramme indigo sur ivoire. |
| Partage (Open Graph) | `public/assets/og/carte-lien.png` (carrée aujourd’hui) | Verrou couché ivoire sur indigo, devise en pied. Cible à produire : 1200 × 630 px pour les aperçus de lien. |

Les icônes d'interface sont des traits de 1,5 px, à bouts droits, sur une
grille de 24 px, en encre courante ; aucune icône colorée, aucune icône
remplie sauf pour l'état actif.

### 8.4 Les graphiques

Les graphiques sont des **SVG faits main** (pas de librairie de charts). Une
seule série est cuivre ; les autres prennent la rampe indigo (600, 400, 200).
Le fond reste ivoire, la grille en hairline, les axes en Jost 11 px.

---

## 9. La photographie

La direction complète est dans `docs/site-revelateur/direction-photo.md`. Ce
que la charte en retient :

**Sept sensations** : sécurité, confiance, expertise, élégance, intimité,
prise en charge, transmission. Le geste est vu avant le visage.

**La lumière** : naturelle, latérale, diffuse ; balance des blancs sur charte
grise, réchauffée légèrement, jamais orangée ; on expose pour la peau. Les
ombres existent ; au traitement, elles tirent vers l'indigo, jamais vers le
noir bouché.

**Les fonds** : unis et mats (crème, lin, bois, terre, velours indigo). Pas de
feuillage vert flou, pas de wax dominant, pas de miroir, chrome, néon, mur de
produits.

**Ce qu'on refuse** : l'esthétique de salon générique, les clichés de pose, les
filtres et la peau lissée, les images générées, les banques d'images, le fond
noir, la saturation « Instagram », la contre-plongée arrogante.

**Règle absolue** : toute personne montrée avec des locks en porte réellement.
Une image qui ne respecte pas cette règle est retirée, quelle que soit sa
qualité. Le droit à l'image est un document signé
(`shared/droit-image.ts`), jamais une case cochée.

**Le mobile d'abord** : les fonds de grand écran se tournent en paysage avec le
sujet dans la bande centrale, la marge calme réservée au texte.

---

## 10. La voix : écrire pour la Maison

La Maison parle à la deuxième personne, au présent, en français simple. Elle
écoute avant de prescrire. Sa référence de textes est
`docs/site-revelateur/voix-du-site.md`.

- **Chaque bouton dit ce que la lectrice obtient** : « Je découvre mon
  parcours », « Faire diagnostiquer ma couronne ». Jamais un simple
  « Réserver » ou « Envoyer ».
- **Les titres sont des phrases courtes**, en Cormorant, sans point final :
  « Votre couronne, comprise, soignée, révélée. » est la seule à en porter un,
  parce qu'elle est un manifeste.
- **On nomme la cliente « vous »**, jamais « le client » ; les équipes se
  nomment par leur rôle dans la Maison (la Souveraine, le Maître, l'apprenante).
- **Aucun prix chiffré sur le site public** ; les montants passent par le
  devis. Dans les applications, tout montant passe par `fmtMoney()`.
- **Pas d'anglicisme de confort** (« care » est admis dans la vocation de
  Soins MND, en italique, parce qu'il nomme un rayon).
- **La devise ferme tout message écrit par l'IA**, posée par le code.
- Ce qu'on n'écrit pas : tiret cadratin, émoji, point d'exclamation en
  rafale, capitales pour crier, « cher client ».

---

## 11. Les applications

### 11.1 Les cinq sœurs, à l'écran

| Surface | Identité | Ce qui la distingue |
| --- | --- | --- |
| Portail | Ivoire éditorial | Grandes respirations, Cormorant Display, une porte vers chaque sœur |
| Le Trône | Indigo et sceau | Barre latérale indigo, papier ivoire, chiffres en Cormorant, sceau or ; le seul lieu où l'obsidienne subsiste, et on ne l'étend pas |
| Ma Couronne | Ivoire chaud et cuivre | Cadre mobile 390 × 844, un geste par écran, réservation en sept temps |
| La Consultation | Indigo profond cérémoniel | Écran plein indigo, ivoire pour le texte, cuivre pour le seul bouton |
| LOKAA | Neutre, accent du locataire | Ivoire et obsidienne 400, l'accent est celui du salon ; « Propulsé par MND » en pied |
| Certificat, Bilan, Bulletin | Papier pur | A4, monogramme cuivre en tête, verrou ou pictogramme en pied avec la devise |

Toute surface : `lang="fr"`, fonts servies par la Maison, tokens pour toute
couleur (`var(--…)`, jamais un HEX en dur dans un nouvel écran), focus visible
en cuivre, `prefers-reduced-motion` respecté.

### 11.2 Le papier et les PDF

- **Format** : A4 portrait (ISO 216) pour factures, reçus, lettres, contrats,
  bulletins ; A4 paysage pour le certificat ; marges 18 mm, 15 mm en pied.
- **Tête** : monogramme cuivre à gauche, 13 mm ; nom de la Maison et ligne
  légale en Jost 9 pt ; filet cuivre 2 px sous la tête.
- **Corps** : Jost 10 à 11 pt, interligne 1,5 ; titres en Cormorant 24 à 36 pt ;
  tableaux avec filets indigo 1 px et hairline entre lignes.
- **Pied** : `pieDeLaMaison()` : nom et devise dans la police de la devise,
  centrés ; le verrou couché ne se pose pas sous 33 mm de large ; sous ce
  plancher, pictogramme seul.
- **Encre** : indigo pour tout ce qui est administratif ; cuivre pour le
  monogramme et un filet. Jamais de fond indigo sur un document qui se
  photocopie.
- **Fichier** : polices embarquées, images compressées, un reçu pèse moins de
  200 Ko pour partir par WhatsApp à Cotonou. Les pièces d'archive (certificat,
  contrat, décharge) se conservent en PDF/A-2b (ISO 19005-2).

### 11.3 Le tampon et l'enseigne

- Tampon : verrou debout, encre indigo, 34 à 40 mm ; le pictogramme au centre,
  MAISON MND en arc calculé sur la largeur réelle de chaque glyphe ; ville et
  RCCM en Jost 7 pt minimum.
- Enseigne : verrou debout ivoire sur indigo, ou indigo sur ivoire ; jamais de
  lettrage lumineux coloré ; le plancher du debout (64 px) vaut ici « lisible à
  la distance d'usage », soit une capitale de MAISON d'au moins 15 mm à 10 m.

### 11.4 Les réseaux et les affiches

| Support | Format | Règle |
| --- | --- | --- |
| Publication carrée | 1080 × 1080 px | Fond ivoire ou indigo ; verrou couché en haut à gauche, plancher 123 px largement dépassé (au moins 240 px) |
| Publication portrait | 1080 × 1350 px | Idem ; le texte dans les 4/5 supérieurs |
| Story, Reel | 1080 × 1920 px | Zone sûre : 250 px en haut, 340 px en bas, 60 px sur les côtés ; verrou dans la zone sûre |
| Bannière, événement | selon le lieu | Bain des Événements (Option A ou B), verrou ivoire sur le début du bain |

Une affiche porte : un eyebrow, un titre Cormorant, une phrase Jost, une
action (un code d'offre écrit en toutes lettres, un lien), le verrou. Rien
d'autre. Les gabarits vivent dans `docs/affiches/` et
`scripts/exporte-les-affiches.mjs`.

### 11.5 Les messages : WhatsApp, e-mail, SMS

- Texte seul, français, sans émoji. Le point médian sépare les éléments
  courts. Un lien par message au plus.
- L'e-mail transactionnel (gabarits dans `docs/gabarit-*.html`) : styles en
  ligne, tableau de mise en page, Cormorant et Jost avec repli Georgia et Arial,
  largeur 600 px, monogramme en tête, devise en pied.
- Signature : « ◈ Maison MND · mi nyɔ́ ɖɛkpɛ, et vous le savez », posée par le
  code.

---

## 12. L'accessibilité et la conformité

Cible : **WCAG 2.2 niveau AA** sur toutes les surfaces publiques et clientes ;
AAA visé pour le texte courant (l'obsidienne sur ivoire tient 16,3:1).

| Exigence | Règle de la Maison | Vérifié |
| --- | --- | --- |
| Contraste du texte (1.4.3) | 4,5:1 minimum ; le cuivre 500 n'est jamais du texte courant sur clair | Annexe A |
| Contraste des composants (1.4.11) | 3:1 pour bordures de champs, icônes, filets porteurs de sens | Annexe A |
| Taille des cibles (2.5.8) | 24 × 24 px minimum, 44 px pour les boutons principaux | `mnd-btn` |
| Focus visible (2.4.7, 2.4.11) | Anneau cuivre `--focus-ring`, jamais supprimé | `ds.css` |
| Mouvement (2.3.3) | `prefers-reduced-motion` coupe tout | `ds.css` |
| Langue (3.1.1) | `lang="fr"` ; les mots fon marqués `lang="fon"` quand le balisage le permet | À poser sur les nouvelles pages |
| Redimensionnement (1.4.4) | Texte lisible à 200 % sans perte ; unités relatives pour les titres | tokens `clamp()` |
| Images (1.1.1) | Le verrou porte `role="img"` et `aria-label="Maison MND"` ; les photos décoratives ont un alt vide | SVG du dépôt |
| Impression | Lisibilité en noir et blanc : l'indigo devient gris foncé, le cuivre gris moyen ; aucune information portée par la seule couleur | Règle 4.5.5 |

Données et échanges : dates en ISO 8601 dans les magasins, devises en codes
ISO 4217, pays en ISO 3166-1, langues en ISO 639 ; à l'affichage, tout passe
par les fonctions de la Maison (`fmtMoney`, dates en lettres).

---

## 13. Les fichiers

| Ce qu'on cherche | Où | Format |
| --- | --- | --- |
| Pictogramme (8 encres) | `public/assets/vectoriel/pictogramme-*.svg` | SVG |
| Verrou couché et debout (indigo, cuivre, ivoire) | `public/assets/vectoriel/verrou-*.svg`, `public/assets/verrous/*.png` | SVG, PNG |
| Verrous des sous-marques | `docs/marque/sous-marques/logos/` | SVG, PNG, versions ivoire |
| Gamme des sous-marques | `docs/marque/sous-marques/gamme.json` | JSON |
| Dégradés des Événements | `docs/marque/sous-marques/degrades/` | SVG, PNG, CSS |
| Monogrammes | `public/assets/monograms/mono-*.png` | PNG |
| Motifs | `public/assets/motifs/*.png` | PNG |
| Icônes d'app, favicon, Open Graph | `public/assets/icons/`, `icones/`, `og/` | PNG |
| Polices | `src/ds/fonts/*.woff2`, `public/assets/fonts/devise-fon.ttf` | WOFF2, TTF |
| Tokens | `src/ds/tokens/*.css` | CSS |
| Proportions du verrou | `src/ds/verrou.ts` | TS |
| Nom, devise, signature | `src/shared/identite.ts` | TS |

Conventions : noms de fichiers en minuscules, en français, séparés par des
tirets ; la couleur en suffixe (`-ivoire`, `-indigo`) ; jamais d'espace ni
d'accent dans un nom de fichier nouveau. Les sources se régénèrent par les
scripts `fabrique-*` ; on ne retouche pas un export à la main.

Licences : Cormorant Garamond (Christian Thalmann), Jost (indestructible type)
et EB Garamond (Georg Duffner, Octavio Pardo) sous SIL OFL 1.1. Le
pictogramme, les verrous, les motifs et les textes sont la propriété de la
Maison MND ; le dépôt est public, les fichiers d'import de clientes n'y
entrent jamais.

---

## 14. La gouvernance

- **Qui décide** : la Souveraine de la Maison (Yéman) tranche toute question
  de marque. Une décision se note, datée, dans `docs/REPRENDRE.md`, avec sa
  raison ; c'est elle qui fait foi ensuite.
- **Comment la charte change** : on modifie d'abord la source (un token, le
  verrou, l'identité), on fait passer les harnais (`verifie-le-verrou`,
  `verifie-les-polices`, `verifie-signature`, `verifie-le-nom-de-la-maison`),
  puis on met ce document à jour et on incrémente sa version.
- **Ce qui ne change pas** : les règles non négociables (pas d'émojis, rayons
  2 à 4 px, deux familles, cuivre en accent, indigo pour le sombre, animations
  fondues, MND sans ɖ, devise par le code, français partout).
- **Contrôle avant publication** : la liste de l'annexe C.

---

## Annexe A. Contrastes mesurés (WCAG 2.2)

Ratios calculés sur les valeurs sRGB des tokens. AA texte : 4,5:1 ; AA grand
texte et composants : 3:1 ; AAA : 7:1.

| Paire | Ratio | Verdict | Emploi permis |
| --- | --- | --- | --- |
| Obsidienne sur ivoire | 16,3:1 | AAA | Texte courant |
| Obsidienne sur sable | 13,2:1 | AAA | Texte courant |
| Obsidienne sur argile | 9,8:1 | AAA | Texte courant |
| Obsidienne 400 sur ivoire | 8,4:1 | AAA | Texte secondaire |
| Obsidienne 300 sur ivoire | 4,4:1 | Grand texte, composants | Placeholders, hairlines épaisses ; pas de corps |
| Indigo Royal sur ivoire | 13,4:1 | AAA | Texte, titres, chiffres |
| Indigo Royal sur sable | 10,9:1 | AAA | Texte |
| Indigo Royal sur argile | 8,1:1 | AAA | Texte |
| Indigo 500 sur ivoire | 10,2:1 | AAA | Texte |
| Indigo 400 sur ivoire | 6,0:1 | AA | Texte |
| Indigo 300 sur ivoire | 3,3:1 | Grand texte, composants | Bordures, icônes |
| **Cuivre 500 sur ivoire** | **3,1:1** | Grand texte, composants | Boutons, filets, eyebrows, titres ≥ 24 px ; **jamais du corps** |
| Cuivre 500 sur sable | 2,6:1 | Échec | Filet décoratif seulement |
| Cuivre 600 sur ivoire | 4,4:1 | Grand texte, composants | Titres, labels |
| Cuivre 700 sur ivoire | 6,4:1 | AA | Texte cuivré admis (`.mnd-copper` prend le 600 : réservé aux labels) |
| Cuivre 800 sur ivoire | 9,3:1 | AAA | Texte |
| Ivoire sur Indigo Royal | 13,4:1 | AAA | Texte sur fond profond |
| Indigo 200 sur Indigo Royal | 6,8:1 | AA | Texte secondaire sur indigo |
| Indigo 100 sur Indigo Royal | 10,4:1 | AAA | Texte sur indigo |
| Cuivre 500 sur Indigo Royal | 4,3:1 | Grand texte, composants | Boutons, filets, titres sur indigo |
| Cuivre 300 sur Indigo Royal | 6,6:1 | AA | Texte cuivré sur indigo |
| Cuivre 200 sur Indigo Royal | 8,8:1 | AAA | Texte |
| Ivoire sur indigo profond | 15,4:1 | AAA | Texte |
| Ivoire sur Indigo 800 | 15,8:1 | AAA | Texte |
| Cuivre 500 sur Indigo 800 | 5,0:1 | AA | Texte |
| Ivoire sur cuivre 500 | 3,1:1 | Grand texte, composants | Libellé d'un bouton cuivre : ≥ 14 px en 600, ou 18 px |
| Obsidienne sur cuivre 500 | 5,2:1 | AA | Libellé d'un bouton cuivre, alternative |
| Ivoire sur cuivre 600 | 4,4:1 | Grand texte, composants | Bouton cuivre foncé |
| Ivoire sur Ocre Brûlé | 4,5:1 | AA | Verrou ivoire de L'Atelier |
| Ivoire sur Vert Savoir | 6,7:1 | AA | Verrou ivoire de l'Académie |
| Ivoire sur Prune Profonde | 10,3:1 | AAA | Verrou ivoire de la Boutique |
| Ivoire sur Bleu Lagune | 4,9:1 | AA | Verrou ivoire des Soins |
| Ivoire sur Bleu Pétrole | 8,1:1 | AAA | Verrou ivoire des Événements |
| Ivoire sur Bordeaux | 9,2:1 | AAA | Verrou ivoire du Studio |
| Ivoire sur Noir Encre | 15,5:1 | AAA | Verrou ivoire de LOKAA |
| Or #C9A84C sur Indigo Royal | 6,6:1 | AA | Site public : titres et boutons dorés sur indigo |
| Or profond #8B5E15 sur crème | 5,3:1 | AA | Site public : petit texte doré |
| Or #C9A84C sur crème | 2,1:1 | Échec | Filet, ornement seulement |
| Terre #3D2B1F sur crème | 12,6:1 | AAA | Site public : texte courant |

## Annexe B. Équivalences pour l'impression

Conversions sRGB vers CMJN sans profil, **valeurs de départ**. La colonne
Pantone reste vide tant qu'une épreuve contractuelle (ISO 12647-7, D50) n'a
pas arrêté la référence ; on y inscrit alors le code lu sur nuancier physique.

| Nom | HEX | RGB | CMJN de départ | Pantone (à établir sur épreuve) |
| --- | --- | --- | --- | --- |
| Indigo Royal | #1E2150 | 30 · 33 · 80 | 62 · 59 · 0 · 69 | |
| Indigo profond | #15173A | 21 · 23 · 58 | 64 · 60 · 0 · 77 | |
| Cuivre Noble | #B97A4A | 185 · 122 · 74 | 0 · 34 · 60 · 27 | |
| Obsidienne | #14141B | 20 · 20 · 27 | 26 · 26 · 0 · 89 | |
| Ivoire | #F6F1E7 | 246 · 241 · 231 | 0 · 2 · 6 · 4 | |
| Sable | #E3DACB | 227 · 218 · 203 | 0 · 4 · 11 · 11 | |
| Argile | #CDBBA9 | 205 · 187 · 169 | 0 · 9 · 18 · 20 | |
| Ocre Brûlé | #936518 | 147 · 101 · 24 | 0 · 31 · 84 · 42 | |
| Vert Savoir | #2F5D50 | 47 · 93 · 80 | 49 · 0 · 14 · 64 | |
| Prune Profonde | #4A2C5C | 74 · 44 · 92 | 20 · 52 · 0 · 64 | |
| Bleu Lagune | #2E6F8E | 46 · 111 · 142 | 68 · 22 · 0 · 44 | |
| Bleu Pétrole | #1F4D62 | 31 · 77 · 98 | 68 · 21 · 0 · 62 | |
| Bordeaux | #6E283C | 110 · 40 · 60 | 0 · 64 · 45 · 57 | |
| Noir Encre | #1A1A1A | 26 · 26 · 26 | 0 · 0 · 0 · 90 | |
| Or (sceau) | #B8902F | 184 · 144 · 47 | 0 · 22 · 74 · 28 | |
| Or (site) | #C9A84C | 201 · 168 · 76 | 0 · 16 · 62 · 21 | |

Conseils au façonnage : l'ivoire s'obtient de préférence par le **papier**
(un vergé ou un vélin ivoire 120 à 300 g) plutôt que par un aplat imprimé ;
l'indigo en aplat demande un noir riche de repli (60 · 50 · 0 · 90) si le
Pantone n'est pas disponible ; le cuivre peut se faire en Pantone métallique
sur les cartes et invitations, jamais sur les pièces administratives.

## Annexe C. Liste de contrôle avant publication

- [ ] Le nom s'écrit « Maison MND » ou « MND », sans ɖ, et se tient seul.
- [ ] La devise vient de `DEVISE_COMPLETE` ; les lettres fon sont exactes ; l'accent de ɔ́ est posé.
- [ ] Le verrou est celui du dépôt, à l'échelle, au-dessus de son plancher ; sous le plancher, pictogramme seul.
- [ ] Zone de protection respectée ; verrou ivoire sur tout fond coloré ; « MND » indigo partout ailleurs.
- [ ] Aucune couleur hors gamme ; le cuivre n'est pas du texte courant sur clair ; le sombre est indigo, pas obsidienne ni noir.
- [ ] Cormorant Garamond et Jost seulement ; polices servies par la Maison, pas d'hôte tiers.
- [ ] Rayons 2 à 4 px ; filets 1 ou 2 px ; ombres diffuses.
- [ ] Animations fondues ; `prefers-reduced-motion` respecté.
- [ ] Pas d'émoji, pas de tiret cadratin, point médian comme seul séparateur, espaces insécables posées.
- [ ] Contrastes AA vérifiés (annexe A) ; cibles 24 px ; focus visible.
- [ ] Montants par `fmtMoney()`, devise de la branche ; dates en lettres.
- [ ] Photos conformes à la direction (lumière, fonds, vraies locks, droit à l'image signé).
- [ ] PDF : polices embarquées, images compressées, pied par `pieDeLaMaison()`.
- [ ] Aucune donnée personnelle, aucun secret, aucun nom de domaine en dur.

---

Maison MND · Cotonou · mi nyɔ́ ɖɛkpɛ, et vous le savez
