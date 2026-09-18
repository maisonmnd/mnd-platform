/* LA SOMME EN LETTRES — 18 septembre 2026, pour les lettres du prêt.

   Une reconnaissance de dette porte le montant en chiffres ET en lettres :
   c'est l'usage pour qu'elle ne se discute pas. Orthographe traditionnelle :
   « vingt » et « cent » prennent un s quand ils sont multipliés et finissent
   le nombre, jamais devant « mille », qui est invariable ; « et » ne se place
   que devant « un » et « onze », de vingt à soixante-dix. Éprouvé par
   `verifie-foyer`. */

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const DIZAINES: Record<number, string> = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' };

const moinsDeCent = (n: number, fin: boolean): string => {
  if (n <= 16) return UNITES[n];
  if (n < 20) return `dix-${UNITES[n - 10]}`;
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7) return u === 1 ? 'soixante et onze' : `soixante-${moinsDeCent(10 + u, fin)}`;
  if (d === 8) return u === 0 ? (fin ? 'quatre-vingts' : 'quatre-vingt') : `quatre-vingt-${UNITES[u]}`;
  if (d === 9) return `quatre-vingt-${moinsDeCent(10 + u, fin)}`;
  if (u === 0) return DIZAINES[d];
  if (u === 1) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
};

const moinsDeMille = (n: number, fin: boolean): string => {
  const c = Math.floor(n / 100);
  const r = n % 100;
  let s = '';
  if (c === 1) s = 'cent';
  else if (c > 1) s = `${UNITES[c]} cent${r === 0 && fin ? 's' : ''}`;
  if (r > 0) s += (s ? ' ' : '') + moinsDeCent(r, fin);
  return s;
};

/** Un entier positif en toutes lettres : 300 000 → « trois cent mille ». */
export const nombreEnLettres = (valeur: number): string => {
  const n = Math.max(0, Math.round(valeur));
  if (n === 0) return 'zéro';
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1000);
  const reste = n % 1000;
  const parts: string[] = [];
  if (milliards > 0) parts.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? 's' : ''}`);
  if (millions > 0) parts.push(`${moinsDeMille(millions, true)} million${millions > 1 ? 's' : ''}`);
  if (milliers > 0) parts.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`);
  if (reste > 0) parts.push(moinsDeMille(reste, true));
  return parts.join(' ');
};
