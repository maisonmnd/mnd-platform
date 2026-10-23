/* LE PAIEMENT CHAP CHAP DE KKIAPAY, ÉPROUVÉ — `node scripts/verifie-le-kkiapay-chapchap.mjs`.

   23 octobre 2026 : « Redessine le QR code dans les paiements Kkiapay pour MND
   avec le code USSD » (Yéman). Le lien et le code vivent dans
   src/shared/kkiapay-chapchap-pur.ts, lus sur l'affiche de KkiaPay ; l'écran
   QR codes et la fabrique des affiches les LISENT, ils ne les recopient pas.
   Une copie à la main finirait par différer de l'affiche collée au mur.
   Sortie ASCII : la console de Windows. */
import { LIEN_CHAPCHAP, CODE_CHAPCHAP, USSD_CHAPCHAP, MARCHAND_CHAPCHAP, RESEAUX_CHAPCHAP } from '../src/shared/kkiapay-chapchap-pur';
import { existsSync, readFileSync } from 'node:fs';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
  if (!ok) console.log(`       attendu ${ascii(attendu)}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ── La règle ─────────────────────────────────────────────────────────── */
dit('le lien est celui lu sur l affiche KkiaPay', 'https://chapchap.kkiapay.me/fRUfT6FJZH1Hfiw18552', LIEN_CHAPCHAP);
dit('le lien et le code USSD designent le meme marchand (le lien finit par le code)', true, LIEN_CHAPCHAP.endsWith(CODE_CHAPCHAP));
dit('le code USSD est celui de l affiche', '*616*41*8552*montant#', USSD_CHAPCHAP);
dit('le nom que la page affiche', 'MND', MARCHAND_CHAPCHAP);
dit('les trois reseaux', ['MTN MoMo', 'Moov Money', 'Celtiis Cash'], [...RESEAUX_CHAPCHAP]);

/* ── L'écran QR codes ─────────────────────────────────────────────────── */
const ecran = sansCommentaires('src/apps/trone/routes/clients/QrCodes.tsx');
dit('l ecran lit la regle', true, ecran.includes("from '../../../../shared/kkiapay-chapchap-pur'"));
dit('l ecran ne recopie ni le lien ni le code', [false, false], [ecran.includes('chapchap.kkiapay.me'), ecran.includes('*616*')]);
dit('la carte Mobile Money est sur la page, au depart', true, /id: 'kkiapay', court: 'Mobile Money', moment: 'depart'/.test(ecran));
dit('son QR, sa carte A5 et son lien copie disent le lien de la regle', [true, true, true],
  [/valeur: LIEN_CHAPCHAP,/.test(ecran), /qr: LIEN_CHAPCHAP,/.test(ecran), /copier\(LIEN_CHAPCHAP,/.test(ecran)]);
dit('l affiche de la Maison est montree, et dite a qui ne la voit pas', [true, true, true],
  [/affiche: 'kkiapay-affiche\.png'/.test(ecran), /alt=\{g\.afficheAlt \?\?/.test(ecran), existsSync('public/kkiapay-affiche.png')]);

/* ── La fabrique des affiches ─────────────────────────────────────────── */
const fabrique = sansCommentaires('scripts/fabrique-les-affiches-kkiapay.mjs');
dit('la fabrique lit la regle et ne recopie pas le lien', [true, false],
  [fabrique.includes('src/shared/kkiapay-chapchap-pur.ts'), fabrique.includes('chapchap.kkiapay.me')]);

console.log(`\n${n - ko}/${n} epreuves : le paiement Mobile Money de la Maison.`);
if (ko) console.log(`${ko} ECHEC(S).`);
