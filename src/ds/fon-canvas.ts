import { OA, O_OUVERT } from './fon-pur';

/** ÉCRIRE DU FON SUR UNE IMAGE (cartes de la Maison, carte de marraine, carte
    cadeau) avec l'accent de « nyɔ́ » posé sur le ɔ (25 octobre 2026, règle :
    fon-pur.ts). Le texte s'écrit sans l'accent flottant, puis l'accent ´ se
    dessine au-dessus du ɔ, à la hauteur de l'accent du « é » et un peu à
    droite du centre (62 % de la lettre, 58 % en italique), comme les pages.
    L'alignement du contexte (gauche, centre, droite) est respecté et rendu
    tel quel. */
export function ecritLeFon(c: CanvasRenderingContext2D, texte: string, x: number, y: number): void {
  const i = texte.indexOf(OA);
  if (i < 0) { c.fillText(texte, x, y); return; }
  const sans = texte.slice(0, i + 1) + texte.slice(i + OA.length);
  c.fillText(sans, x, y);
  const alignement = c.textAlign;
  c.textAlign = 'left';
  const total = c.measureText(sans).width;
  const debut = alignement === 'center' ? x - total / 2 : alignement === 'right' || alignement === 'end' ? x - total : x;
  const avant = c.measureText(sans.slice(0, i)).width;
  const penche = /^\s*(italic|oblique)\b/.test(c.font);
  const centre = debut + avant + c.measureText(O_OUVERT).width * (penche ? 0.58 : 0.62);
  const accent = c.measureText('´');
  const taille = Number((/(\d+(?:\.\d+)?)px/.exec(c.font) ?? [])[1] ?? 16);
  c.fillText('´', centre - (accent.actualBoundingBoxRight - accent.actualBoundingBoxLeft) / 2, y - taille * 0.06);
  c.textAlign = alignement;
}
