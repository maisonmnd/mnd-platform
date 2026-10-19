/* ══ LE MOMOPAY DE LA MAISON — 19 octobre 2026 ══════════════════════════
   « L'ancien code MoMoPay était pour ACIA1. Maison MND vient de recevoir son
   propre numéro et son propre short code » (Yéman) : code marchand 909099,
   numéro 01 91 23 19 61. Au sélecteur : le nom affiché est « MAISON MND » ;
   le CODE seulement sur les affiches (le numéro reste dans le Trône) ; une
   caisse neuve « MoMoPay Maison MND », où l'ancienne caisse d'ACIA1 se vide
   avant d'être rangée.

   Le QR suit la forme que MTN avait remise pour l'ancien compte
   (« 506846@momopay », lu sur le document « Scannez et payez ») : le code,
   puis « @momopay ». À éprouver d'un scan avant d'imprimer.

   Tout se décide ici, sans magasin ni écran ; `verifie-le-momopay` le rejoue. */
import type { Cashbox, TransfertCaisse } from './finance';

export const CODE_MOMOPAY = '909099';
export const ANCIEN_CODE_MOMOPAY = '506846';
export const MARCHAND_MOMOPAY = 'MAISON MND';
export const NUMERO_MOMOPAY = '0191231961';
export const QR_MOMOPAY = `${CODE_MOMOPAY}@momopay`;
export const USSD_MOMOPAY = `*880*41*${CODE_MOMOPAY}*montant#`;
/** Les noms que l'ancien compte portait au Trône ou sur l'affiche. */
const ANCIENS_MARCHANDS = ['ets acia1', 'acia1', 'acia 1', 'yeman', ''];

type Reglages = { momoQr?: string; momoUssd?: string; momoMarchand?: string };

/** LA BASCULE DES RÉGLAGES : ce qui porte encore l'ancien compte prend le
    nouveau ; une valeur que la Maison a tapée autrement ne bouge pas. `null` :
    rien à changer (déjà basculé, ou réglé à la main). */
export function basculeDuMomopay(r: Reglages): Reglages | null {
  const patch: Reglages = {};
  if (!r.momoQr || r.momoQr.includes(ANCIEN_CODE_MOMOPAY)) patch.momoQr = QR_MOMOPAY;
  if (!r.momoUssd || r.momoUssd.includes(ANCIEN_CODE_MOMOPAY)) patch.momoUssd = USSD_MOMOPAY;
  if (ANCIENS_MARCHANDS.includes(String(r.momoMarchand ?? '').trim().toLowerCase())) patch.momoMarchand = MARCHAND_MOMOPAY;
  const change = (Object.keys(patch) as (keyof Reglages)[]).some((k) => patch[k] !== r[k]);
  return change ? patch : null;
}

/** UN LIEN ENVOYÉ AVANT LE CHANGEMENT (payer.html?c=506846) mène désormais au
    compte de la Maison : l'ancien compte est celui d'ACIA 1. */
export const codeDuLien = (code: string): { code: string; marchand?: string } =>
  (code === ANCIEN_CODE_MOMOPAY ? { code: CODE_MOMOPAY, marchand: MARCHAND_MOMOPAY } : { code });

/* ── LA CAISSE NEUVE, ET L'ANCIENNE QUI S'Y VIDE ─────────────────────── */
/** L'ancienne caisse MoMoPay d'ACIA 1, par son identifiant (le tri l'a peut-être renommée). */
export const ID_CAISSE_ACIA1 = '2b0gyen3wq';
export const idDuVirementMomopay = (caisseId: string): string => `trf-momopay-${caisseId}`;

/** Le virement qui ramène l'ancienne caisse à zéro dans la neuve (dans un sens
    ou dans l'autre, selon son solde). `null` : rien à virer. */
export function virementDeLAncienMomopay(o: {
  ancienne: Pick<Cashbox, 'id' | 'name' | 'currency'>; neuve: Pick<Cashbox, 'name' | 'currency'>;
  solde: number; jour: string; branchId: string;
}): TransfertCaisse | null {
  const solde = Math.round(o.solde);
  if (!solde || (o.ancienne.currency ?? '') !== (o.neuve.currency ?? '')) return null;
  return {
    id: idDuVirementMomopay(o.ancienne.id), branchId: o.branchId, date: o.jour,
    de: solde > 0 ? o.ancienne.name : o.neuve.name,
    vers: solde > 0 ? o.neuve.name : o.ancienne.name,
    amountXof: Math.abs(solde),
    note: `Nouveau compte MoMoPay de la Maison (code ${CODE_MOMOPAY}) : le solde de « ${o.ancienne.name} » y passe, puis elle est rangée`,
  };
}
