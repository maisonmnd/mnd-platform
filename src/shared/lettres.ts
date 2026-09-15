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
