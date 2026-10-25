/* ══ L'ACCENT DE « nyɔ́ » POSÉ SUR LE ɔ — 25 octobre 2026 ═════════════════
   « Il faut régler l'accent sur le slogan, partout » (Yéman). « ɔ́ » n'existe
   pas en un seul caractère : c'est ɔ suivi d'un accent flottant (U+0301). La
   police des lettres fon (`MND Fon`, devise-fon.woff2) porte l'accent mais ne
   sait pas l'accrocher au ɔ : à l'écran il tombait à droite, collé au haut de
   la lettre. Le site l'a réglé le 11 octobre en dessinant l'accent au-dessus
   du ɔ (scripts/genere-revelateur.mjs, `.oa`) ; les pages, les feuilles
   imprimées et les images de la plateforme font désormais de même, par ces
   morceaux. Le texte reste le vrai : seul son dessin change. Le PDF le pose à
   la main depuis le 22 août (pieDeLaMaison, shared/pdf.ts). */

/** ɔ suivi de l'accent aigu flottant. */
export const OA = 'ɔ́';
export const O_OUVERT = 'ɔ';

/** Le texte en morceaux : `oa` vrai pour chaque ɔ qui portait l'accent. */
export function morceauxDuFon(texte: string): { t: string; oa: boolean }[] {
  if (!texte.includes(OA)) return [{ t: texte, oa: false }];
  const out: { t: string; oa: boolean }[] = [];
  const parts = texte.split(OA);
  parts.forEach((p, i) => {
    if (p) out.push({ t: p, oa: false });
    if (i < parts.length - 1) out.push({ t: O_OUVERT, oa: true });
  });
  return out;
}

/** Pour une feuille écrite en HTML (affiches, cartes imprimées) : le ɔ dans
    son span. Le texte de la Maison est sûr ; rien d'autre n'y est échappé. */
export const htmlFon = (texte: string): string =>
  morceauxDuFon(texte).map((m) => (m.oa ? `<span class="fon-oa">${m.t}</span>` : m.t)).join('');

/** La règle à poser dans une feuille imprimée qui n'emporte pas fonts.css. */
export const CSS_FON_OA = ".fon-oa{position:relative;display:inline-block}.fon-oa::after{content:'\\00B4';position:absolute;left:62%;top:-.06em;transform:translateX(-50%);font-family:'Cormorant Garamond',Georgia,serif;font-style:normal;font-weight:400;pointer-events:none}";
