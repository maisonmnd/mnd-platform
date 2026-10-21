/* LE MOMOPAY DE LA MAISON, ÉPROUVÉ — `node scripts/verifie-le-momopay.mjs`.

   19 octobre 2026. « L'ancien code MoMoPay était pour ACIA1. Maison MND vient
   de recevoir son propre numéro et son propre short code » (Yéman) : 909099,
   0191231961. Au sélecteur : nom affiché MAISON MND ; le CODE seulement sur
   les affiches ; une caisse neuve « MoMoPay Maison MND » où l'ancienne
   d'ACIA 1 se vide ; quatre formats d'affiche. Puis « recrée un poster,
   épuré, aux couleurs de la charte ». Les attentes viennent de là. */
import { existsSync, readFileSync } from 'node:fs';
import {
  ANCIEN_CODE_MOMOPAY, CODE_MOMOPAY, MARCHAND_MOMOPAY, NUMERO_MOMOPAY, QR_MOMOPAY, USSD_MOMOPAY, ID_CAISSE_ACIA1,
  basculeDuMomopay, codeDuLien, idDuVirementMomopay, virementDeLAncienMomopay,
} from '../src/shared/momopay-de-la-maison-pur';
import { CAISSE_MTN as CAISSE_MOMOPAY_MAISON, caisseMomopayDeLaMaison, caisseProposee } from '../src/shared/caisses-des-caissiers-pur';
import { decisionsDesCaisses } from '../src/shared/decisions-des-caisses-pur';
import { TRI_DU_19_OCTOBRE } from '../src/shared/tri-des-caisses-pur';
import { MOMO_MARCHAND_DEFAUT, MOMO_QR_DEFAUT, MOMO_USSD_DEFAUT } from '../src/apps/trone/routes/equipe/data';
import type { Cashbox } from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const lis = (f: string) => readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/<!--[\s\S]*?-->/g, '');

/* ── 1. LE COMPTE ─────────────────────────────────────────────────────── */
dit('le compte de la Maison : 909099, MAISON MND, le numéro 0191231961', ['909099', 'MAISON MND', '0191231961'], [CODE_MOMOPAY, MARCHAND_MOMOPAY, NUMERO_MOMOPAY]);
dit('le code à composer et le QR suivent la forme de MTN', ['*880*41*909099*montant#', '909099@momopay'], [USSD_MOMOPAY, QR_MOMOPAY]);
dit('les défauts du Trône sont ceux de la règle', [QR_MOMOPAY, USSD_MOMOPAY, MARCHAND_MOMOPAY], [MOMO_QR_DEFAUT, MOMO_USSD_DEFAUT, MOMO_MARCHAND_DEFAUT]);

/* ── 2. LA BASCULE DES RÉGLAGES ──────────────────────────────────────── */
dit('les réglages de l ancien compte basculent tous', { momoQr: QR_MOMOPAY, momoUssd: USSD_MOMOPAY, momoMarchand: MARCHAND_MOMOPAY },
  basculeDuMomopay({ momoQr: '506846@momopay', momoUssd: '*880*41*506846*montant#', momoMarchand: 'Ets ACIA1' }));
dit('déjà basculés : rien', null, basculeDuMomopay({ momoQr: QR_MOMOPAY, momoUssd: USSD_MOMOPAY, momoMarchand: MARCHAND_MOMOPAY }));
dit('une valeur tapée autrement à la main ne bouge pas', null, basculeDuMomopay({ momoQr: '123456@momopay', momoUssd: '*880*41*123456*montant#', momoMarchand: 'Autre marchand' }));
dit('« YEMAN » ou « ACIA1 » deviennent MAISON MND', [MARCHAND_MOMOPAY, MARCHAND_MOMOPAY],
  [basculeDuMomopay({ momoQr: QR_MOMOPAY, momoUssd: USSD_MOMOPAY, momoMarchand: 'YEMAN' })?.momoMarchand, basculeDuMomopay({ momoQr: QR_MOMOPAY, momoUssd: USSD_MOMOPAY, momoMarchand: 'ACIA1' })?.momoMarchand]);
dit('un lien d avant (c=506846) mène au compte de la Maison ; un autre code ne bouge pas', [{ code: '909099', marchand: 'MAISON MND' }, { code: '123456' }],
  [codeDuLien(ANCIEN_CODE_MOMOPAY), codeDuLien('123456')]);

/* ── 3. LA CAISSE NEUVE ──────────────────────────────────────────────── */
const b = (id: string, name: string, x: Partial<Cashbox> = {}): Cashbox => ({ id, branchId: 'br', name, sub: '', glyph: '', openingXof: 0, ...x });
const ACIA = b(ID_CAISSE_ACIA1, 'ACIA1', { sub: 'Momopay' });
const P = (boxes: Cashbox[]) => caisseProposee({ methode: 'MTN MoMo', aujourdhui: '2026-10-19', boxes, branchId: 'br' }).caisse ?? null;
dit('MTN MoMo va dans la caisse de la Maison dès qu elle existe, même si celle d ACIA1 est encore là', [CAISSE_MOMOPAY_MAISON, CAISSE_MOMOPAY_MAISON],
  [P([ACIA, caisseMomopayDeLaMaison('br')]), P([caisseMomopayDeLaMaison('br'), ACIA])]);
/* 21 octobre 2026 : « les caisses portent le nom des paiements » ; sans la
   caisse de la Maison, elle naît à son nom (plus de repli sur ACIA 1). */
dit('sans elle, elle naît à son nom, jamais l ancienne d ACIA 1', CAISSE_MOMOPAY_MAISON, P([ACIA]));
dit('la caisse de la Maison : une par branche, rôle Terrasse, elle dit son code', ['cb-momopay-br', 'terrasse', true],
  [caisseMomopayDeLaMaison('br').id, caisseMomopayDeLaMaison('br').role, /909099/.test(caisseMomopayDeLaMaison('br').sub)]);
{
  const apres = decisionsDesCaisses([ACIA], '2026-10-19');
  dit('les décisions la font naître, une fois', [true, null], [!!apres?.some((x) => x.id === 'cb-momopay-br'), decisionsDesCaisses(apres!, '2026-10-20')]);
  dit('rangée à la main, elle ne revient pas', false,
    !!decisionsDesCaisses([ACIA, { ...caisseMomopayDeLaMaison('br'), archiveeLe: '2026-10-19' }], '2026-10-20')?.some((x) => x.id === 'cb-momopay-br' && !x.archiveeLe));
}
{
  const neuve = caisseMomopayDeLaMaison('br');
  const v = virementDeLAncienMomopay({ ancienne: ACIA, neuve, solde: 134000, jour: '2026-10-19', branchId: 'br' });
  dit('l ancienne se vide dans la neuve (sa décision)', [idDuVirementMomopay(ID_CAISSE_ACIA1), 'ACIA1', CAISSE_MOMOPAY_MAISON, 134000], [v?.id, v?.de, v?.vers, v?.amountXof]);
  dit('à découvert, la neuve la comble ; à zéro ou dans une autre devise, rien', [[CAISSE_MOMOPAY_MAISON, 'ACIA1', 5000], null, null], [
    (() => { const w = virementDeLAncienMomopay({ ancienne: ACIA, neuve, solde: -5000, jour: '2026-10-19', branchId: 'br' }); return w ? [w.de, w.vers, w.amountXof] : null; })(),
    virementDeLAncienMomopay({ ancienne: ACIA, neuve, solde: 0, jour: '2026-10-19', branchId: 'br' }),
    virementDeLAncienMomopay({ ancienne: { ...ACIA, currency: 'USD' }, neuve, solde: 100, jour: '2026-10-19', branchId: 'br' })]);
}
dit('le tri ne renomme plus ACIA1 (elle se vide dans la caisse neuve)', false, TRI_DU_19_OCTOBRE.retouches.some((r) => r.id === ID_CAISSE_ACIA1));

/* ── 4. LE CODE AUTOUR ────────────────────────────────────────────────── */
{
  const shell = sansCommentaires(lis('src/apps/trone/shell/Shell.tsx'));
  dit('la bascule des réglages : la direction, une fois le document descendu', [true, true],
    [/if \(!estDirectionDuShell\) return;\s*let vivant = true;\s*void quandDocumentDescendu\('mnd_auto_config'\)/.test(shell), /const patch = basculeDuMomopay\(autoConfigStore\.get\(\)/.test(shell)]);
  const panneau = sansCommentaires(lis('src/apps/trone/routes/finances/AncienMomopay.tsx'));
  dit('le panneau de l ancienne caisse : la direction, le virement, rangée et datée, et le retour', [true, true, true, true],
    [/if \(!estDirection\) return null;/.test(panneau), /virementDeLAncienMomopay\(\{ ancienne, neuve, solde,/.test(panneau),
      /archiveeLe: le, rangeeAuMomopay: le/.test(panneau), /prev\.filter\(\(t\) => t\.id !== idDuVirementMomopay\(ancienne\.id\)\)/.test(panneau)]);
  dit('Les caisses le montre', true, /<AncienMomopay \/>/.test(lis('src/apps/trone/routes/finances/Caisses.tsx')));
  const payer = lis('public/payer.html');
  const payerCorps = sansCommentaires(payer.slice(payer.indexOf('<body>')));
  dit('la page de paiement : un lien d avant mène à la Maison, MAISON MND par défaut, plus d ACIA1 ni d ancienne image', [true, true, false, false],
    [/if \(code === '506846'\) \{ code = '909099'; marchand = 'MAISON MND'; \}/.test(payerCorps), /e\(marchand \|\| 'MAISON MND'\)/.test(payerCorps),
      /ACIA1/.test(payerCorps), /momopay-affiche\.jpg/.test(payer)]);
  dit('la page de paiement aux couleurs de la charte : ni nuit ni or', [false, false, true],
    [/#0E1030|--nuit/.test(payer), /#F2B705|--or\b/.test(payer), /--indigo: #1E2150/.test(payer)]);
  const qr = sansCommentaires(lis('src/apps/trone/routes/clients/QrCodes.tsx'));
  dit('l écran QR codes : la nouvelle affiche, plus de panneau ACIA1', [true, false, true, false],
    [/affiche: 'momopay-affiche\.png'/.test(qr), />ACIA1</.test(qr), existsSync('public/momopay-affiche.png'), existsSync('public/momopay-affiche.jpg')]);
  dit('La Consultation compose le code de la Maison', [true, true],
    [/MOMO_USSD = '\*880\*41\*909099\*15000#'/.test(lis('src/apps/consultation/data.ts')), /MOMO_ACCOUNT = '909099'/.test(lis('src/apps/consultation/data.ts'))]);
  /* Plus aucun 506846 dans le code qui tourne, hors la règle qui le reconnaît et la page qui redirige. */
  const fichiers = ['src/apps/trone/routes/equipe/data.ts', 'src/apps/trone/routes/clients/QrCodes.tsx', 'src/apps/trone/routes/systeme/Parametres.tsx',
    'src/apps/consultation/data.ts', 'src/apps/consultation/App.tsx', 'src/apps/trone/routes/vente/pdf-de-la-piece.ts', 'src/shared/pdf.ts'];
  dit('plus aucun ancien code dans le code qui tourne', [], fichiers.filter((f) => existsSync(f) && /506846/.test(sansCommentaires(lis(f)))));
  const fabrique = lis('scripts/fabrique-les-affiches-momopay.mjs');
  dit('les affiches lisent le compte dans la règle, et ne portent pas le numéro (le code seulement)', [true, false],
    [/lis\('CODE_MOMOPAY'\)/.test(fabrique) && /lis\('MARCHAND_MOMOPAY'\)/.test(fabrique), /NUMERO_MOMOPAY|0191231961/.test(fabrique)]);
  dit('les affiches aux couleurs de la charte : ivoire, indigo, cuivre ; jamais d obsidienne ni d or', [true, false],
    [/--ivoire: #F6F1E7; --carte: #FFFDF9; --indigo: #1E2150; --cuivre: #9A6036/.test(fabrique), /#0E1030|#0B0D24|#F2B705|obsidi/i.test(sansCommentaires(fabrique))]);
  dit('et en indigo aussi (sa demande) : encre ivoire, cuivre clair, le verrou ivoire, le QR toujours sombre sur blanc', [true, true, true],
    [/indigo: \{ css: ':root \{ --fond: #1E2150; --encre: #F6F1E7; --accent: #D6A06F;[^}]*\}', verrou: 'ivoire' \}/.test(fabrique),
      /for \(const theme of Object\.keys\(THEMES\)\)/.test(fabrique), /\.carte-qr \{ background: #FFFFFF;/.test(fabrique) && /function qrSvg\(donnee, couleur = '#1E2150'\)/.test(fabrique)]);
}

if (ko) { console.error(`\n${ko} controle(s) en echec.`); process.exit(1); }
console.log('\nLe MoMoPay de la Maison tient.');
