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

/* ── RETIRÉ DES ÉCRANS · 12 novembre 2026 ────────────────────────────────
   « Le choix du moyen » (maquette DnRyTv95…, « construis ») : l'affiche Chap
   Chap se pointait à la main ; « Payer par MTN » et Tap & Go la remplacent et
   se confirment seuls. La règle reste (elle dit ce que portait l'affiche
   collée au mur) ; aucun écran ne la propose plus. */
const ecran = sansCommentaires('src/apps/trone/routes/clients/QrCodes.tsx');
const encaisser = sansCommentaires('src/apps/trone/routes/clients/actions.tsx');
const liens = [sansCommentaires('src/shared/liens-a-envoyer-pur.ts'), sansCommentaires('src/apps/trone/routes/clients/liens-des-qr-codes.ts'), sansCommentaires('src/apps/trone/shell/LiensAEnvoyer.tsx')].join('\n');
const moment = sansCommentaires('src/shared/codes-du-moment.ts');
dit('les QR de la Maison ne proposent plus Chap Chap (ni carte, ni affiche, ni message)', [false, false, false, false],
  [ecran.includes('kkiapay-chapchap-pur'), /id: 'kkiapay'/.test(ecran), ecran.includes('LIEN_CHAPCHAP'), /case 'kkiapay':/.test(ecran)]);
dit('Encaisser n a plus de tuile KkiaPay, ni de QR Chap Chap', [false, false],
  [/nom: 'KkiaPay'/.test(encaisser), encaisser.includes('LIEN_CHAPCHAP')]);
dit('les liens a envoyer et les codes du moment ne le proposent plus', [false, false, false],
  [/kkiapay/i.test(liens), /'kkiapay'/.test(moment), moment.includes("PAR_DEFAUT: readonly IdDuCode[] = ['kkiapay'")]);
dit('l affiche du mur reste dans public (archive), la fenetre plein ecran sait toujours dire une affiche', [true, true],
  [existsSync('public/kkiapay-affiche.png'), /alt=\{g\.afficheAlt \?\?/.test(sansCommentaires('src/apps/trone/routes/clients/AuComptoir.tsx'))]);

/* ── La fabrique des affiches ─────────────────────────────────────────── */
const fabrique = sansCommentaires('scripts/fabrique-les-affiches-kkiapay.mjs');
dit('la fabrique lit la regle et ne recopie pas le lien', [true, false],
  [fabrique.includes('src/shared/kkiapay-chapchap-pur.ts'), fabrique.includes('chapchap.kkiapay.me')]);

console.log(`\n${n - ko}/${n} epreuves : le paiement KkiaPay de la Maison.`);
if (ko) console.log(`${ko} ECHEC(S).`);
