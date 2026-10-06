import { useSyncExternalStore } from 'react';
import { EN } from './i18n/en';
import { fmtMoney } from '../../shared/currency';
import type { MotsDeLaDate } from '../../ds/dates';

/* ══ LES DEUX LANGUES DE MA COURONNE — 3 octobre 2026 ═══════════════════
   Maquette « Ma Couronne, sombre et bilingue », validée.

   LA PHRASE FRANÇAISE EST LA CLÉ. Chaque texte s'écrit `t('Mon profil.')` :
   en français il revient tel quel, en anglais il se cherche au dictionnaire
   (`i18n/en*.ts`). Une phrase sans traduction revient EN FRANÇAIS, jamais en
   blanc : une cliente anglophone lit alors une phrase française, pas un trou.

   LES VARIABLES SE NOMMENT : `t('Bonjour, {prenom}.', { prenom })`. La phrase
   anglaise porte les mêmes noms entre accolades, à la place que sa langue
   veut (le harnais `verifie-couronne-langues` vérifie qu'aucune ne se perd).

   LA LANGUE : celle de son téléphone à la première ouverture, puis celle
   qu'elle choisit dans Profil. Gardée sur l'appareil (avant même la
   connexion) ET sur sa fiche (`Client.langue`), pour la retrouver ailleurs.

   CE QUI NE SE TRADUIT JAMAIS : les noms fon des rituels (KLƆKLƆ™, SÍNSIN™,
   DÀNDÀN™…), « Maison MND », « Ma Couronne », la devise en fon. */

export type Langue = 'fr' | 'en';
export const CLE_DE_LA_LANGUE = 'mc_langue';

/* L'ANGLAIS S'OUVRE APRÈS LA RELECTURE DE YÉMAN (maquette validée : « je
   reprends ce que vous marquez, puis j'ouvre l'anglais à vos clientes »).
   Tant que c'est `false`, toutes lisent le français et Profil ne propose rien,
   sauf sur un appareil d'essai : ouvrir l'app avec `?anglais=1` le marque
   (et `?anglais=0` le démarque). */
export const ANGLAIS_OUVERT = false;
const CLE_D_ESSAI = 'mc_anglais_essai';
function appareilDEssai(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('anglais');
    if (q === '1') localStorage.setItem(CLE_D_ESSAI, '1');
    if (q === '0') localStorage.removeItem(CLE_D_ESSAI);
    return localStorage.getItem(CLE_D_ESSAI) === '1';
  } catch {
    return false;
  }
}
/** Le choix de langue paraît-il dans Profil ? */
export const anglaisPropose = ANGLAIS_OUVERT || appareilDEssai();

function langueDuTelephone(): Langue {
  try {
    const l = (navigator.languages?.[0] ?? navigator.language ?? 'fr').toLowerCase();
    return l.startsWith('en') ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
}

function langueEnregistree(): Langue | null {
  try {
    const v = localStorage.getItem(CLE_DE_LA_LANGUE);
    return v === 'en' || v === 'fr' ? v : null;
  } catch {
    return null;
  }
}

let courante: Langue = anglaisPropose ? (langueEnregistree() ?? langueDuTelephone()) : 'fr';
const ecouteurs = new Set<() => void>();

const poseLAttribut = () => {
  try { document.documentElement.lang = courante; } catch { /* hors navigateur */ }
};
poseLAttribut();

export const langue = (): Langue => courante;

/** Change la langue (et la garde sur l'appareil). La fiche est écrite par
    l'appelant, qui sait quelle fiche est la sienne. */
export function changeLaLangue(l: Langue): void {
  if (l === courante) return;
  courante = l;
  try { localStorage.setItem(CLE_DE_LA_LANGUE, l); } catch { /* elle vaut pour cette visite */ }
  poseLAttribut();
  ecouteurs.forEach((f) => f());
}

/** La langue de la fiche l'emporte sur celle du téléphone, pas sur un choix
    déjà fait sur CET appareil : un choix est plus récent qu'une fiche. */
export function adopteLaLangueDeLaFiche(l: Langue | undefined): void {
  if (!anglaisPropose || !l || langueEnregistree()) return;
  changeLaLangue(l);
}

export function useLangue(): Langue {
  return useSyncExternalStore(
    (f) => { ecouteurs.add(f); return () => ecouteurs.delete(f); },
    () => courante,
    () => courante,
  );
}

/** Remplace {nom} par sa valeur. */
const remplit = (phrase: string, vars?: Record<string, string | number>): string =>
  vars ? phrase.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : phrase;

/** LA PHRASE DANS LA LANGUE DE LA CLIENTE. */
export function t(fr: string, vars?: Record<string, string | number>): string {
  if (courante === 'en') {
    const en = EN[fr];
    if (en) return remplit(en, vars);
  }
  return remplit(fr, vars);
}

/** Les mots du champ de date de la Maison (`DateEnClair`) : en français le
    champ garde les siens, en anglais il reçoit ceux-ci. */
export function motsDeDate(): MotsDeLaDate | undefined {
  if (courante !== 'en') return undefined;
  return {
    jour: 'day', mois: 'month', annee: 'year',
    noms: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    tropTard: 'This day has not come yet.',
  };
}

/** Pour les dates : `toLocaleDateString(locale(), …)`. */
export const locale = (): string => (courante === 'en' ? 'en-GB' : 'fr-FR');

/** `fmtMoney` à la façon de la langue, pour ce que LA CLIENTE lit :
    « 25 000 F CFA » / « 25,000 F CFA », « 12,50 € » / « 12.50 € ». Ce qui
    part à la Maison (alerte du personnel, note du rendez-vous) garde
    `fmtMoney` : le Trône lit le français. */
export function prix(xof: number, code = 'XOF'): string {
  const fr = fmtMoney(xof, code);
  if (courante !== 'en' || code === 'USD' || code === 'CAD') return fr;
  return fr.replace(/(\d),(\d+)(?!\d)/g, '$1.$2').replace(/(\d)[\s  ](?=\d{3}(?!\d))/g, '$1,');
}

/** Un montant en francs CFA, séparé à la façon de la langue :
    « 25 000 F CFA » / « 25,000 F CFA ». */
export function argent(xof: number): string {
  const n = Math.round(Number(xof) || 0).toLocaleString(courante === 'en' ? 'en-US' : 'fr-FR');
  return `${n} F CFA`;
}
