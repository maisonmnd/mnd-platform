import { useEffect, useState } from 'react';

/* ══ LE THÈME DE MA COURONNE — 3 octobre 2026 ═══════════════════════════
   Maquette « Ma Couronne, sombre et bilingue », validée : il SUIT LE
   TÉLÉPHONE, et la cliente peut le fixer dans Profil (Automatique, Clair,
   Sombre). Le choix reste sur l'appareil : c'est une affaire d'écran, pas de
   compte (on n'a pas le même éclairage sur tous ses téléphones).

   La feuille fait le travail (couronne.css, bloc « LE MODE SOMBRE ») : ce
   module ne pose que l'attribut `data-mc-theme` sur <html>, absent en
   automatique. La même lecture est faite AVANT le premier affichage par le
   petit script de couronne.html, sinon une cliente qui a choisi « Sombre »
   sous un téléphone clair verrait l'écran blanc une fraction de seconde. */

export type ChoixDuTheme = 'auto' | 'clair' | 'sombre';
export const CLE_DU_THEME = 'mc_theme';

/** La couleur de la barre du téléphone, accordée au fond. */
const BARRE = { clair: '#B97A4A', sombre: '#15173A' } as const;

export function choixEnregistre(): ChoixDuTheme {
  try {
    const v = localStorage.getItem(CLE_DU_THEME);
    return v === 'clair' || v === 'sombre' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

const sombreAuTelephone = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

/** Le thème réellement affiché pour ce choix, ce téléphone, maintenant. */
export const themeAffiche = (choix: ChoixDuTheme, telephoneSombre = sombreAuTelephone()): 'clair' | 'sombre' =>
  choix === 'auto' ? (telephoneSombre ? 'sombre' : 'clair') : choix;

export function appliqueLeTheme(choix: ChoixDuTheme): void {
  const html = document.documentElement;
  if (choix === 'auto') delete html.dataset.mcTheme;
  else html.dataset.mcTheme = choix;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', BARRE[themeAffiche(choix)]);
}

/** Le choix, et de quoi le changer. Suit aussi le téléphone qui bascule de
    lui-même au coucher du soleil, quand le choix est « Automatique ». */
export function useTheme(): [ChoixDuTheme, (c: ChoixDuTheme) => void] {
  const [choix, setChoix] = useState<ChoixDuTheme>(choixEnregistre);
  useEffect(() => {
    appliqueLeTheme(choix);
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const suit = () => appliqueLeTheme(choix);
    mq.addEventListener?.('change', suit);
    return () => mq.removeEventListener?.('change', suit);
  }, [choix]);
  const change = (c: ChoixDuTheme) => {
    try {
      if (c === 'auto') localStorage.removeItem(CLE_DU_THEME);
      else localStorage.setItem(CLE_DU_THEME, c);
    } catch { /* le choix vaut pour cette visite */ }
    setChoix(c);
  };
  return [choix, change];
}

appliqueLeTheme(choixEnregistre());
