import { SANS_CENTIMES } from './currency';

/* ══ UNE SOMME ÉCRITE EN LETTRES — descendue dans shared/, 15 septembre 2026 ══

   Elle vivait dans `routes/equipe/facture.ts`, où la facture du prestataire
   en avait besoin. Les engagements en ont besoin à leur tour, pour la
   décharge d'une avance — et un module de `shared/` ne lit jamais une route.
   Elle descend donc ici, et la facture la relit d'ici : une seule écriture
   des nombres pour toute la Maison.

   POURQUOI EN LETTRES. Un chiffre se rature, une somme écrite se conteste :
   « 740 000 » devient « 1 740 000 » d'un trait de stylo, « sept cent quarante
   mille » ne devient rien d'autre. Une décharge et une facture portent les
   deux.

   LES RÈGLES SONT CELLES DE L'ORTHOGRAPHE TRADITIONNELLE, celles qu'un
   notaire écrit encore : « quatre-vingts » prend son s en fin de nombre et le
   perd devant « mille », « cent » de même, « mille » ne prend jamais d's, et
   l'on écrit « vingt et un » mais « quatre-vingt-un ». */

const UNITES = [
  '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];

const DIZAINES = [
  '', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt',
];

/** `finale` : ce groupe termine-t-il le nombre ? C'est ce qui décide du s de
    « quatre-vingts » et de « cents ». */
const moinsDeCent = (n: number, finale: boolean): string => {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    if (d === 7 && u === 1) return 'soixante et onze';
    return `${DIZAINES[d]}-${UNITES[10 + u]}`;
  }
  if (u === 0) return d === 8 ? (finale ? 'quatre-vingts' : 'quatre-vingt') : DIZAINES[d];
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
};

const moinsDeMille = (n: number, finale: boolean): string => {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let s = '';
  if (c > 0) s = c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 && finale ? 's' : ''}`;
  if (r > 0) s = s ? `${s} ${moinsDeCent(r, finale)}` : moinsDeCent(r, finale);
  return s;
};

/** « quatre-vingt-sept mille ». */
export function nombreEnLettres(x: number): string {
  const n = Math.round(Math.abs(x));
  if (n === 0) return 'zéro';
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor(n / 1e6) % 1000;
  const milliers = Math.floor(n / 1000) % 1000;
  const reste = n % 1000;
  const parts: string[] = [];
  if (milliards) parts.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? 's' : ''}`);
  if (millions) parts.push(`${moinsDeMille(millions, true)} million${millions > 1 ? 's' : ''}`);
  if (milliers) parts.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`);
  if (reste) parts.push(moinsDeMille(reste, true));
  return parts.join(' ');
}

/** « 740 000 » — les milliers séparés d'une espace ordinaire.

    PAS L'ESPACE FINE QUE PRODUIT `toLocaleString('fr-FR')` : elle est juste à
    l'écran, mais un PDF sans la bonne police l'imprime en carré, et une
    décharge qui porte un carré au milieu de la somme ne se défend pas. */
export const nombreEnChiffres = (x: number): string =>
  String(Math.round(Math.abs(x))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* ══ LES DEVISES, EN LETTRES ET EN CHIFFRES — 15 septembre 2026 ══════════
   « Me permettre de payer des prestataires en devises, pas seulement en
   CFA » (Yéman). Une décharge en euros qui dirait « francs CFA » serait un
   faux ; une décharge qui dirait « 700 » sans dire de quoi ne vaudrait rien.

   LES CODES SONT CEUX QUE LA MAISON CONNAÎT DÉJÀ (`currency.ts`). Un code
   inconnu ne casse rien : il s'écrit tel quel, après le nombre.

   LE SYMBOLE EST CHOISI POUR LE PAPIER. « € » et « £ » s'impriment dans un
   PDF ; le signe du naira, non : il y serait un carré, et une décharge avec un
   carré au milieu de la somme ne se défend pas. Il s'écrit donc « NGN ». */

export type NomDeDevise = {
  un: string;
  plusieurs: string;
  /** La subdivision qui se paie. Absente = la devise ne compte pas de
      centimes (le franc CFA), et tout s'arrondit à l'unité. */
  centime?: { un: string; plusieurs: string };
  symbole: string;
  /** « une livre sterling », « vingt et une livres ». */
  feminin?: boolean;
};

export const DEVISES: Record<string, NomDeDevise> = {
  XOF: { un: 'franc CFA', plusieurs: 'francs CFA', symbole: 'F' },
  XAF: { un: 'franc CFA', plusieurs: 'francs CFA', symbole: 'F CFA' },
  EUR: { un: 'euro', plusieurs: 'euros', centime: { un: 'centime', plusieurs: 'centimes' }, symbole: '€' },
  USD: { un: 'dollar américain', plusieurs: 'dollars américains', centime: { un: 'cent', plusieurs: 'cents' }, symbole: '$ US' },
  CAD: { un: 'dollar canadien', plusieurs: 'dollars canadiens', centime: { un: 'cent', plusieurs: 'cents' }, symbole: '$ CA' },
  GBP: { un: 'livre sterling', plusieurs: 'livres sterling', centime: { un: 'penny', plusieurs: 'pence' }, symbole: '£', feminin: true },
  CHF: { un: 'franc suisse', plusieurs: 'francs suisses', centime: { un: 'centime', plusieurs: 'centimes' }, symbole: 'CHF' },
  NGN: { un: 'naira', plusieurs: 'nairas', symbole: 'NGN' },
  GHS: { un: 'cedi', plusieurs: 'cedis', centime: { un: 'pesewa', plusieurs: 'pesewas' }, symbole: 'GHS' },
  ZAR: { un: 'rand', plusieurs: 'rands', centime: { un: 'cent', plusieurs: 'cents' }, symbole: 'ZAR' },
  MAD: { un: 'dirham', plusieurs: 'dirhams', centime: { un: 'centime', plusieurs: 'centimes' }, symbole: 'MAD' },
  CNY: { un: 'yuan', plusieurs: 'yuans', centime: { un: 'fen', plusieurs: 'fens' }, symbole: 'CNY' },
  AED: { un: 'dirham des Émirats', plusieurs: 'dirhams des Émirats', centime: { un: 'fils', plusieurs: 'fils' }, symbole: 'AED' },
};

/** Deux décimales pour une devise à centimes, aucune pour le franc CFA. Un
    code que la Maison ne sait pas nommer suit la liste des monnaies sans
    centimes de `currency.ts`, la même que l'affichage : un franc guinéen ne
    doit pas avoir des centimes ici et pas là. Sinon, deux : mieux vaut un
    centime de trop qu'un arrondi qui efface de l'argent. */
export const decimalesDe = (code: string): 0 | 2 => {
  const nom = DEVISES[code];
  if (nom) return nom.centime ? 2 : 0;
  return SANS_CENTIMES.has(code) ? 0 : 2;
};

/** Arrondir à ce que la devise sait payer : le franc, ou le centime. */
export const arrondiDans = (x: number, code: string): number => {
  const f = decimalesDe(code) === 2 ? 100 : 1;
  return Math.round(x * f) / f;
};

/** « 740,50 € », « 740 000 F ». Les centimes ne s'écrivent que s'il y en a :
    « 700 € » se lit mieux que « 700,00 € », et ne dit rien de moins. */
export function sommeEnChiffres(x: number, code: string): string {
  const v = arrondiDans(Math.abs(x), code);
  const entier = Math.floor(v);
  const cents = decimalesDe(code) === 2 ? Math.round((v - entier) * 100) : 0;
  const chiffres = `${nombreEnChiffres(entier)}${cents > 0 ? `,${String(cents).padStart(2, '0')}` : ''}`;
  return `${x < 0 && v > 0 ? '-' : ''}${chiffres} ${DEVISES[code]?.symbole ?? code}`;
}

/** « sept cent quarante euros et cinquante centimes », « deux millions
    d'euros », « vingt et une livres sterling ». */
export function sommeEnLettres(x: number, code: string): string {
  const nom = DEVISES[code];
  const v = arrondiDans(Math.abs(x), code);
  if (!nom) return `${nombreEnLettres(v)} ${code}`;
  const entier = Math.floor(v);
  const cents = nom.centime ? Math.round((v - entier) * 100) : 0;

  const dit = (n: number, u: { un: string; plusieurs: string }, feminin?: boolean): string => {
    let lettres = nombreEnLettres(n);
    if (feminin) lettres = lettres.replace(/(^|[\s-])un$/, '$1une');
    /* « UN MILLION D'EUROS » : le nom se lie par « de » quand le nombre finit
       sur million ou milliard, et s'élide devant une voyelle. */
    const lien = /(million|milliard)s?$/.test(lettres)
      ? (/^[aeiouyhéè]/i.test(u.plusieurs) ? ' d’' : ' de ')
      : ' ';
    return `${lettres}${lien}${n > 1 ? u.plusieurs : u.un}`;
  };

  if (cents > 0 && nom.centime) {
    const lesCentimes = dit(cents, nom.centime);
    return entier > 0 ? `${dit(entier, nom, nom.feminin)} et ${lesCentimes}` : lesCentimes;
  }
  return dit(entier, nom, nom.feminin);
}
