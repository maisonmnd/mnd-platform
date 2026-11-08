/* ══ LA PÉRIODE DES POURBOIRES — 8 novembre 2026 ═══════════════════════════
   « Les pourboires du 6 au 4 du mois suivant sont payés le 5. » (Y., 8 nov.)
   Le pourboire ne se compte plus au mois civil : il se range dans la période
   qui COMMENCE le 6. La clé reste « AAAA-MM », celle du mois où la période
   commence :
     · 6 nov. au 4 déc. 2026  →  '2026-11'  (payée le 5 déc.)
     · 4 nov. 2026            →  '2026-10'  (payé le 5 nov.)
     · 3 janv. 2027           →  '2026-12'
   Un seul juge, pur : `periodeDesPourboires`. La Paie, le bulletin, la page
   Les paiements, Mon mois, Les pourboires et le Personnel l'appellent tous ;
   aucun ne recoupe plus `.slice(0, 7)` pour des pourboires.
   La notification serveur (0196, `previens_du_pourboire`) dit la même période :
   `periode_des_pourboires` et `periode_dite` en SQL, gardées par le banc
   verifie-les-pourboires-de-l-equipe. */

/** Le jour où commence une période, et celui où elle est payée (le 5). */
export const JOUR_DEBUT_PERIODE = 6;
export const JOUR_DE_PAIE = 5;

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const;

/** La période d'un pourboire daté `dateISO` (AAAA-MM-JJ…) : 'AAAA-MM', ou ''
    si la date est illisible. JJ >= 6 : le mois même ; sinon le mois d'avant. */
export function periodeDesPourboires(dateISO: string | undefined | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateISO ?? ''));
  if (!m) return '';
  const a = Number(m[1]);
  const mois = Number(m[2]);
  const jour = Number(m[3]);
  if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return '';
  if (jour >= JOUR_DEBUT_PERIODE) return `${m[1]}-${m[2]}`;
  return mois === 1 ? `${a - 1}-12` : `${m[1]}-${String(mois - 1).padStart(2, '0')}`;
}

/** La période qui précède (n périodes avant). */
export function periodeAvant(periode: string, n = 1): string {
  const [a, m] = periode.split('-').map(Number);
  const t = a * 12 + (m - 1) - n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

const nomCourt = (mois: number): string => MOIS_COURTS[mois - 1] ?? '';
const finDe = (periode: string): { mois: number } => ({ mois: (Number(periode.slice(5, 7)) % 12) + 1 });

/** « 6 nov. au 4 déc. » : en tête de colonne. */
export function periodeTitre(periode: string): string {
  const m = Number(periode.slice(5, 7));
  if (!/^\d{4}-\d{2}$/.test(periode) || m < 1 || m > 12) return periode;
  return `${JOUR_DEBUT_PERIODE} ${nomCourt(m)} au ${JOUR_DEBUT_PERIODE - 2} ${nomCourt(finDe(periode).mois)}`;
}
/** « du 6 nov. au 4 déc. ». */
export const periodeDite = (periode: string): string => `du ${periodeTitre(periode)}`;
/** « Pourboires du 6 nov. au 4 déc. ». */
export const pourboiresDuDit = (periode: string): string => `Pourboires ${periodeDite(periode)}`;
/** « payés le 5 déc. » (le 5 du mois qui suit la période). */
export const payesLeDit = (periode: string): string => `payés le ${JOUR_DE_PAIE} ${nomCourt(finDe(periode).mois)}`;
/** « 6 nov. », sous une barre quand les périodes sont nombreuses. */
export const periodeCourte = (periode: string): string => `${JOUR_DEBUT_PERIODE} ${nomCourt(Number(periode.slice(5, 7)))}`;
