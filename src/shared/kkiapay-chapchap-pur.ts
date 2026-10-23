/* ══ LE PAIEMENT CHAP CHAP DE KKIAPAY — 23 octobre 2026 ══════════════════
   « Redessine le QR code dans les paiements Kkiapay pour MND avec le code
   USSD » (Yéman), d'après l'affiche bleue « Scannez le QR code et payez Chap
   Chap » du comptoir.

   Le QR de cette affiche a été LU (pas recopié à l'œil) : il ouvre la page de
   paiement KkiaPay dont le marchand s'affiche « MND » (« Direct payment link
   for MND »), avec MTN MoMo, Moov Money et Celtiis Cash. Le code USSD est
   celui imprimé dessous. Si KkiaPay remet une nouvelle affiche, la relire :
   le lien et le code changent ensemble.

   Une seule vérité pour l'écran QR codes du Trône et pour la fabrique des
   affiches (`scripts/fabrique-les-affiches-kkiapay.mjs`, qui lit ce texte) ;
   `verifie-le-kkiapay-chapchap` le rejoue. */

export const LIEN_CHAPCHAP = 'https://chapchap.kkiapay.me/fRUfT6FJZH1Hfiw18552';
export const CODE_CHAPCHAP = '8552';
export const USSD_CHAPCHAP = `*616*41*${CODE_CHAPCHAP}*montant#`;
/** Le nom que la page de paiement affiche à la cliente avant qu'elle paie. */
export const MARCHAND_CHAPCHAP = 'MND';
export const RESEAUX_CHAPCHAP = ['MTN MoMo', 'Moov Money', 'Celtiis Cash'] as const;
