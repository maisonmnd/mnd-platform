/* LES FRAIS DE LA CARTE, ÉPROUVÉS — `node scripts/verifie-les-frais-de-carte.mjs`.

   21 novembre 2026 : « Cliente Eliane, qui est là présentement, veut payer
   par carte, mais je dois rajouter les frais sur sa transaction, les frais de
   4 %. » (Yéman), puis « construis ». L'attente vient de cette phrase :
     - la part passée au terminal porte 4 % de plus, que la caissière voit et
       peut retirer ;
     - les frais s'écrivent sur SA facture (une ligne) et se versent à part,
       dans la caisse de la carte ;
     - ils ne soldent rien du rituel : le carnet, `paidXof`, la conformité et
       la clôture du jour ne les comptent pas au rituel ;
     - FedaPay n'en porte pas (ses frais sont déjà dits), l'argent en devise
       non plus.
   Les noms et montants sont des exemples. */
import { readFileSync } from 'node:fs';
import {
  FRAIS_DE_CARTE_PCT, LIBELLE_FRAIS_DE_CARTE, NOTE_FRAIS_DE_CARTE, estLigneDeFraisDeCarte, estVersementDeFraisDeCarte,
  fraisDeCarteXof, libelleDesFraisDeCarte, ligneDesFraisDeCarte,
} from '../src/shared/frais-de-carte-pur';
import { argentHorsDuCarnet, versementsAInscrireAuCarnet } from '../src/shared/caisse-du-versement';
import { argentDuRituelSurLaPiece, rituelDeLaPiece, totalDeLaPiece } from '../src/shared/cloture-du-jour-pur';
import { alignerFacturesDuRituel } from '../src/apps/trone/routes/clients/_shared';
import { invoicesStore, invoiceTotal, invoiceSoldee, ligneFacture, ligneProduit, type Invoice } from '../src/shared/finance';
import type { Appointment } from '../src/shared/agenda';
import type { Service } from '../src/shared/catalog';

let ko = 0;
let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── 1. LA RÈGLE ─────────────────────────────────────────────────────── */
dit('le taux est de 2,3 % (22 novembre 2026, plus 4 %)', 2.3, FRAIS_DE_CARTE_PCT);
dit('45 000 F au terminal : 1 035 F de frais', 1035, fraisDeCarteXof(45000));
dit('12 345 F : 283,935 F montent au franc superieur', 284, fraisDeCarteXof(12345));
dit('62 000 F : 1 426 F tout rond, le flottant ne fait pas monter d un franc', 1426, fraisDeCarteXof(62000));
dit('une part vide, negative ou a 0 % : aucun frais', [0, 0, 0], [fraisDeCarteXof(0), fraisDeCarteXof(-500), fraisDeCarteXof(45000, 0)]);
dit('le libelle dit le taux, espace insecable avant %', 'Frais de paiement par carte (2,3 %)', libelleDesFraisDeCarte());
const ligne = ligneDesFraisDeCarte(1800, 'il-f');
dit('la ligne porte son marqueur, son montant, aucune remise', [1800, 1, 0, 'carte'], [ligne.unitXof, ligne.qty, ligne.discountPct, ligne.frais]);
dit('une ligne de frais se reconnait au marqueur, ou au libelle seul', [true, true, false],
  [estLigneDeFraisDeCarte({ label: 'renommee', frais: 'carte' }), estLigneDeFraisDeCarte({ label: 'Frais de paiement par carte (4 %)' }), estLigneDeFraisDeCarte({ label: 'KƆKLƆ™ Essentiel' })]);
dit('un versement de frais se reconnait a sa note, pas la Gamme', [true, false, false],
  [estVersementDeFraisDeCarte({ note: NOTE_FRAIS_DE_CARTE }), estVersementDeFraisDeCarte({ note: 'Gamme, produits emportés' }), estVersementDeFraisDeCarte({})]);

/* ── 2. LE CARNET NE LES COMPTE PAS ──────────────────────────────────── */
const pieceCarte = (x: Partial<Invoice> = {}): Invoice => ({
  id: 'inv-1', branchId: 'b1', kind: 'facture', number: 'F-0101', clientId: 'c1', date: '2026-11-21',
  lines: [ligneFacture('KƆKLƆ™ Essentiel', 45000), ligneDesFraisDeCarte(1800, 'il-f')],
  globalDiscountPct: 0, theme: 'Rose', status: 'payée', apptId: 'ap-1',
  payments: [
    { id: 'ip-r', date: '2026-11-21', amountXof: 45000, method: 'Carte bancaire', cashbox: 'TPE' },
    { id: 'ip-f', date: '2026-11-21', amountXof: 1800, method: 'Carte bancaire', cashbox: 'TPE', note: NOTE_FRAIS_DE_CARTE },
  ],
  ...x,
} as Invoice);
const rdvPaye = { id: 'ap-1', clientId: 'c1', date: '2026-11-21', paidXof: 45000,
  payments: [{ id: 'pay-1', date: '2026-11-21', amountXof: 45000, method: 'Carte bancaire', cashbox: 'TPE', invoiceId: 'inv-1' }] } as unknown as Appointment;
dit('la piece est soldee : frais en ligne ET en versement', [46800, true], [invoiceTotal(pieceCarte()), invoiceSoldee(pieceCarte())]);
dit('aucun argent « hors du carnet » : les frais ne sont pas le rituel', 0, argentHorsDuCarnet(rdvPaye, pieceCarte()));
const rdvVide = { id: 'ap-1', clientId: 'c1', date: '2026-11-21', payments: [] } as unknown as Appointment;
dit('a inscrire au carnet : le seul argent du rituel', ['ip-r'], versementsAInscrireAuCarnet(rdvVide, pieceCarte()).map((v) => v.id));

/* ── 3. LA CLÔTURE DU JOUR NE VOIT PAS D'ÉCART ───────────────────────── */
dit('la part rituel de la piece : 45 000 F, les frais otes', 45000, rituelDeLaPiece(pieceCarte()));
dit('... meme relue sans le marqueur (le libelle suffit)', 45000,
  rituelDeLaPiece({ lines: [ligneFacture('KƆKLƆ™ Essentiel', 45000), ligneFacture('Frais de paiement par carte (4 %)', 1800)], globalDiscountPct: 0 }));
dit('... avec la Gamme en plus, les deux otes', 45000,
  rituelDeLaPiece({ lines: [ligneFacture('KƆKLƆ™ Essentiel', 45000), ligneProduit('p1', 'Huile', 12000), ligneDesFraisDeCarte(2280, 'il-f')], globalDiscountPct: 0 }));
dit('l argent du rituel sur la piece : 45 000 F', 45000, argentDuRituelSurLaPiece(pieceCarte()));
dit('le total de la piece, lui, porte les frais', 46800, totalDeLaPiece(pieceCarte()));

/* ── 4. LA CONFORMITÉ GARDE LA LIGNE ─────────────────────────────────── */
const sv = (id: string, name: string, priceXof: number): Service =>
  ({ id, categoryId: 'c', name, palier: 'Fondation', priceXof, sessions: 1, master: '', durationMin: 60, order: 1 } as Service);
const A = sv('a', 'KƆKLƆ™ Essentiel', 10000);
const B = sv('b', 'SÍNSIN™ Essentiel', 20000);
const byId = new Map([[A.id, A], [B.id, B]]);
const rituel = (ids: string[]): Appointment =>
  ({ id: 'ap1', branchId: 'br', clientId: 'c1', serviceIds: ids, date: '2026-11-21', time: '10:00', master: 'M', status: 'honoré', invoiceId: 'inv1' } as Appointment);
const pose = (lines: Invoice['lines']) => {
  invoicesStore.set(() => [{
    id: 'inv1', branchId: 'br', kind: 'facture', number: 'F-1', clientId: 'c1', date: '2026-11-21',
    lines, globalDiscountPct: 0, theme: 'Aube', status: 'payée',
  } as Invoice]);
};
const piece = () => invoicesStore.get()[0];
const labels = () => piece().lines.map((l) => (estLigneDeFraisDeCarte(l) ? 'FRAIS' : l.label));

pose([ligneFacture('KƆKLƆ™ Essentiel', 10000), ligneDesFraisDeCarte(400, 'il-f')]);
const deja = piece();
const ecarts0 = alignerFacturesDuRituel(rituel(['a']), byId, (s) => s.priceXof);
dit('une piece conforme avec ses frais ne bouge pas (meme objet)', [0, true], [ecarts0.length, piece() === deja]);

pose([ligneFacture('KƆKLƆ™ Essentiel', 10000), ligneDesFraisDeCarte(400, 'il-f')]);
alignerFacturesDuRituel(rituel(['a', 'b']), byId, (s) => s.priceXof);
dit('un geste ajoute : il parait, les frais restent en dernier', ['KƆKLƆ™ Essentiel', 'SÍNSIN™ Essentiel', 'FRAIS'], labels());
dit('... la remise dit l ecart du rituel seul, le total ne bouge pas', [20000, 10400], [piece().globalDiscountXof, invoiceTotal(piece())]);

pose([ligneFacture('KƆKLƆ™ Essentiel + SÍNSIN™ Essentiel', 30000), ligneDesFraisDeCarte(1200, 'il-f')]);
alignerFacturesDuRituel(rituel(['a']), byId, (s) => s.priceXof);
dit('une ligne aux noms colles se reconforme, les frais ne deviennent pas un ajustement',
  ['KƆKLƆ™ Essentiel', 'Ajustement · prix consenti ce jour-là', 'FRAIS'], labels());
dit('... l ajustement vaut 20 000 F (pas 21 200), le total ne bouge pas', [20000, 31200],
  [piece().lines.find((l) => l.label.startsWith('Ajustement'))?.unitXof, invoiceTotal(piece())]);

/* ── 5. LA FENÊTRE D'ENCAISSEMENT ────────────────────────────────────── */
const enc = readFileSync('src/apps/trone/routes/clients/actions.tsx', 'utf8');
dit('seule la part au terminal (tuile carte) porte les frais, ni FedaPay ni la devise', true,
  /const fraisDeLaPart = \(pt: PartEnc\): number =>\s*\n\s*\(pt\.tuile === 'carte' && !pt\.sansFrais && !fxOn \? fraisDeCarteXof\(montantDe\(pt\)\) : 0\);/.test(enc));
dit('la case est cochee d office et se decoche, le montant au terminal dit', [true, true, true],
  [/checked=\{!p\.sansFrais\}/.test(enc), /onChange=\{\(e\) => majPart\(p\.id, \{ sansFrais: !e\.target\.checked \}\)\}/.test(enc), /au terminal : <b[^>]*>\{fmtMoney\(x \+ fraisDeCarteXof\(x\), currency\)\}/.test(enc)]);
dit('le versement des frais : sa note, la caisse et le moyen de la carte', true,
  /if \(frais > 0\) \{\s*\n\s*versements\.push\(\{\s*\n\s*id: `ip-\$\{uid\(\)\}`, date: payDate, amountXof: frais,\s*\n\s*method: c\.methode, cashbox: c\.caisse \|\| undefined,[\s\S]{0,80}note: NOTE_FRAIS_DE_CARTE,/.test(enc));
dit('la piece neuve porte la ligne ; la piece qui grandit garde les frais d avant', [true, true],
  [/lines: \[\.\.\.lignesPiece, \.\.\.lignesFrais\],/.test(enc), /lines: \[\.\.\.lignesPiece, \.\.\.pieceDuRituel\.lines\.filter\(estLigneDeFraisDeCarte\), \.\.\.lignesFrais\],/.test(enc)]);
const carnet = enc.slice(enc.indexOf('const lignesDuCarnet = (invoiceId: string): ApptPayment[] => {'), enc.indexOf('const freeze = prixFigeAuReglement('));
dit('le carnet et paidXof ne comptent que le rituel', [true, false, true],
  [/amountXof: settleTotal, date: payDate,/.test(carnet), /Frais|frais/.test(carnet), /paidXof: alreadyPaid \+ settleTotal,/.test(enc)]);
dit('le bouton et la barre disent les frais', [true, true],
  [/\$\{totalFrais > 0 \? ` \+ frais de carte \$\{fmtMoney\(totalFrais, currency\)\}` : ''\}\$\{fullyPaid \? '' : ' \(partiel\)'\}/.test(enc), /\{totalFrais > 0 && ` · frais de carte \$\{fmtMoney\(totalFrais, currency\)\}`\}/.test(enc)]);
dit('« C est regle » dit la part frais compris, comme le ticket de la banque', true,
  /x: montantDe\(pt\) \+ fraisDeLaPart\(pt\) \}\)\)\.filter/.test(enc));

/* ── 6. LA COPIE DU SERVEUR DIT LA MÊME RÈGLE ────────────────────────── */
const pur = readFileSync('src/shared/cloture-du-jour-pur.ts', 'utf8');
const fn = readFileSync('supabase/functions/cloture-du-jour/index.ts', 'utf8');
const regle = "!!l.produitId || l.frais === 'carte' || (l.label ?? '').startsWith('Frais de paiement par carte')";
dit('la cloture (Trone et fonction) ote la ligne et le versement des frais', [true, true, true, true],
  [pur.includes(regle), fn.includes(regle), pur.includes("!/^Frais de carte\\b/.test(v.note ?? '')"), fn.includes("!/^Frais de carte\\b/.test(v.note ?? '')")]);
dit('les reconnaissances recopiees suivent les constantes du module', [true, true],
  [LIBELLE_FRAIS_DE_CARTE === 'Frais de paiement par carte', /^Frais de carte\b/.test(NOTE_FRAIS_DE_CARTE)]);
const versionPur = pur.match(/VERSION_DE_LA_CLOTURE = '([^']+)'/)?.[1];
dit('la fonction et le Trone portent la meme version de la cloture', versionPur, fn.match(/VERSION_DE_LA_CLOTURE = '([^']+)'/)?.[1]);

console.log(ko === 0 ? `\n${n}/${n} epreuves : les frais de la carte.` : `\n${ko} echec(s) sur ${n}.`);
