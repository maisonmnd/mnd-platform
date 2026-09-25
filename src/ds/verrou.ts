/* ══ LE VERROU DE LA MAISON — 25 septembre 2026 ═══════════════════════
   Le verrou, c'est le pictogramme et le nom posés ensemble. Il y en a deux,
   et un seul est le principal :

     · COUCHÉ   le pictogramme à gauche, MAISON au-dessus de MND à droite.
                C'est celui des en-têtes, des bandeaux et des papiers.
     · DEBOUT   les trois pièces l'une sous l'autre. Enseigne, tampon, carré.

   CE FICHIER EST LE SEUL ENDROIT OÙ SES PROPORTIONS SONT ÉCRITES. Le site les
   lit pour poser son en-tête, `scripts/fabrique-le-verrou.mjs` les lit pour
   dessiner l'image que les PDF embarquent, et `verifie-le-verrou` refuse que
   la feuille de style et ce fichier disent deux choses différentes.

   « MAISON » N'EST PAS JUSTIFIÉ À LA LARGEUR DU SIGLE. Il garde son propre
   écartement, .44em, et reste plus étroit : c'est ce qui lui permet d'être
   petit sans se désagréger. Le verrou qui justifiait MAISON sur toute la
   largeur (« le 2 ») écartait ses lettres de deux fois et demie leur propre
   largeur, et tombait en poussière dès qu'on le réduisait. Il ne s'emploie
   plus. La mesure est dans `docs/marque/verrou.md`.

   LE PICTOGRAMME EST CELUI DU DÉPÔT, DÉTOURÉ, JAMAIS REDESSINÉ. Détourer,
   c'est retirer les pixels transparents autour du dessin : les 29 % de vide
   que porte le fichier carré éloignaient le nom sans raison. Le dessin, lui,
   n'est pas touché, et son rapport est conservé à l'échelle près. */

export const VERROU = {
  /** Corps de « MAISON », en part du corps du sigle. */
  partMaison: 42 / 132,
  /** Écartement du sigle, en em de SON corps. */
  ecartSigle: 0.30,
  /** Écartement de « MAISON », en em de SON corps. */
  ecartMaison: 0.44,
  /** Blanc entre « MAISON » et le sigle, en part du corps du sigle. */
  entreLignes: 16 / 132,
  /** Couché : blanc entre le pictogramme et le texte, en part du corps du sigle. */
  ecartPicto: 44 / 132,
  /** Couché : hauteur du pictogramme, en part de la hauteur du bloc de texte.
      Le dixième en plus n'est pas un ornement : sans lui l'œil compte les
      jambages du sigle et trouve le pictogramme plus petit que le texte. */
  hautPicto: 1.10,
  /** Debout : blanc sous le pictogramme, en part du corps du sigle. */
  souslePicto: 44 / 132,
  /** Debout : largeur du pictogramme, en part de la largeur du sigle. */
  largePictoDebout: 0.74,
} as const;

/** Hauteur du bloc de texte, en part du corps du sigle. */
export const HAUT_DU_BLOC = VERROU.partMaison + VERROU.entreLignes + 1;
/** Couché : hauteur du pictogramme, en part du corps du sigle. */
export const HAUT_DU_PICTO = HAUT_DU_BLOC * VERROU.hautPicto;

/* ══ LE PLANCHER ══════════════════════════════════════════════════════
   Mesuré, pas estimé : on réduit le verrou jusqu'à ce que la capitale de
   « MAISON » tombe sous six pixels, hauteur sous laquelle une capitale de
   romain clair cesse de se lire et devient une trace grise. Le banc est
   `scratchpad/allover/mesure.py`, il lit l'encre d'un rendu, pas la feuille
   de style. Sous le plancher on ne rapetisse pas le verrou : on pose le
   PICTOGRAMME SEUL, et le nom se lit ailleurs. */

/** Largeur totale minimale du verrou couché, en pixels d'écran.
    Mesuré sur LE DESSIN QUI EST LIVRÉ, `verrou-couche-indigo.png`, réduit
    pixel par pixel : à 123 px de large la capitale de MAISON tient encore
    six pixels, à 122 elle n'en tient plus que cinq. Un premier relevé disait
    135 : il portait sur un dessin qui n'était pas celui-là, plus large d'une
    marge de rognage et d'un défaut d'alignement depuis corrigé. On garde le
    nombre du dessin réel, et les tailles posées gardent leur marge au-dessus. */
export const PLANCHER_COUCHE = 123;
/** Largeur totale minimale du verrou debout, en pixels d'écran. */
export const PLANCHER_DEBOUT = 73;

/* SUR LE PAPIER, LE MÊME PLANCHER CHANGE D'UNITÉ, PAS DE NATURE. Six pixels
   d'écran valent 6 × 25,4 / 96 millimètres d'encre ; un PDF se lit d'ailleurs
   à l'écran aussi souvent que sur papier, et c'est là qu'il est le plus
   fragile. On arrondit au millimètre supérieur. */
export const PLANCHER_COUCHE_MM = Math.ceil((PLANCHER_COUCHE * 25.4) / 96);
export const PLANCHER_DEBOUT_MM = Math.ceil((PLANCHER_DEBOUT * 25.4) / 96);

/** Le verrou couché tient-il à cette largeur ? */
export const verrouTient = (largeur: number, unite: 'px' | 'mm' = 'px'): boolean =>
  largeur >= (unite === 'mm' ? PLANCHER_COUCHE_MM : PLANCHER_COUCHE);
