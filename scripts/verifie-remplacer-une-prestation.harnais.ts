/* REMPLACER UNE PRESTATION SUR SES PIECES, EPROUVE — 26 octobre 2026.
   `node scripts/verifie-remplacer-une-prestation.mjs` (et `--prouve`).

   « Change le Shampoing Le Souffle en Shampoing L'Ancrage a 10 000 F.
   Reajuste-moi toutes ces factures 2025 » (Yeman) ; au selecteur : « le
   total ne bouge pas », « le shampoing seul ». Les pieces ci-dessous ont la
   FORME de ses factures 2025 (prix, ajustements, remises), sans aucun nom.
   Le total passe par le vrai `invoiceTotal`. Attendus ecrits a la main. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { invoiceTotal, type Invoice } from '../src/shared/finance';
import {
  LIBELLE_AJUSTEMENT, dernierRemplacement, piecesSansLeRemplacement, rdvSansLeRemplacement,
  remplacementsDesPieces, remplacementsDesRdv,
} from '../src/apps/trone/routes/clients/remplacer-une-prestation-pur';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 200)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)?.slice(0, 200)}`));
};
/* Comparaison sans l'ordre des cles (un champ retire puis remis change de place). */
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v);
const pareil = (x: unknown, y: unknown) => JSON.stringify(canon(x)) === JSON.stringify(canon(y));
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};

const SOUFFLE = 'KLOKLO Essentiel · Le Shampoing « Le Souffle »';
const ANCRAGE = 'KLOKLO Signature · Le Shampoing « L’Ancrage »';
const REPRISE = 'SINSIN Essentiel · La Reprise';
let n = 0;
const ligne = (label: string, unitXof: number, o: { discountXof?: number } = {}) => ({ id: `l${++n}`, label, qty: 1, unitXof, discountPct: 0, ...o });
const piece = (id: string, date: string, lines: Invoice['lines'], o: Partial<Invoice> = {}): Invoice => ({
  id, branchId: 'b', kind: 'facture', number: `N-${id}`, clientId: 'c', date, lines, globalDiscountPct: 0,
  theme: 'Rose', status: 'payée', ...o,
} as Invoice);

const PIECES: Invoice[] = [
  /* A : 8 000 + 50 000 + prix consenti 2 000 = 60 000 */
  piece('A', '2025-01-22', [ligne(SOUFFLE, 8000), ligne(REPRISE, 50000), ligne(LIBELLE_AJUSTEMENT, 2000)]),
  /* B : le Souffle seul, 8 000 - 3 000 de remise globale = 5 000 */
  piece('B', '2025-02-12', [ligne(SOUFFLE, 8000)], { globalDiscountXof: 3000 }),
  /* C : deja a 10 000 avec 5 000 de remise de ligne, et des produits : 79 000 */
  piece('C', '2025-05-14', [ligne(SOUFFLE, 10000, { discountXof: 5000 }), ligne('Reprise Longue Duree', 55000), ligne('Shampoing', 5000), ligne('Vapo', 8000), ligne('Recharge', 6000)]),
  /* D : 8 000 + 20 000 + prix consenti 32 000 = 60 000 */
  piece('D', '2025-06-25', [ligne(SOUFFLE, 8000), ligne('SINSIN Essentielle · La Reprise', 20000), ligne(LIBELLE_AJUSTEMENT, 32000)]),
  /* E : deja L'Ancrage, pas touchee */
  piece('E', '2025-03-28', [ligne(ANCRAGE, 10000)]),
  /* F : un devis de 2025 avec le Souffle : jamais touche */
  piece('F', '2025-04-01', [ligne(SOUFFLE, 8000)], { kind: 'devis', status: 'brouillon' }),
  /* G : une facture de 2026 avec le Souffle : hors de l'annee */
  piece('G', '2026-02-11', [ligne(SOUFFLE, 8000), ligne(REPRISE, 50000), ligne(LIBELLE_AJUSTEMENT, 2000)]),
  /* H : remise globale en POURCENTAGE : le total ne retomberait pas pile */
  piece('H', '2025-08-01', [ligne(SOUFFLE, 8000), ligne(REPRISE, 50000), ligne(LIBELLE_AJUSTEMENT, 2000)], { globalDiscountPct: 10 }),
];
const PLAN = { de: SOUFFLE, vers: ANCRAGE, prixXof: 10000, annee: '2025' };
const LE = '2026-10-26T15:00:00.000Z';
const res = remplacementsDesPieces(PIECES, PLAN, invoiceTotal, LE);
const par = (id: string) => res.find((c) => c.piece.id === id)!;
const net = (p: Invoice, label: string) => p.lines.filter((l) => l.label === label).map((l) => [l.unitXof, l.discountXof ?? 0]);

/* == #1 -- LE TOTAL NE BOUGE PAS == */
dit(1, 'les pieces de 2025 qui portent le Souffle : A B C D H (ni E deja faite, ni le devis F, ni G de 2026)', ['A', 'B', 'C', 'D', 'H'], res.map((c) => c.piece.id));
dit(1, 'chaque total reste celui paye : 60 000, 5 000, 79 000, 60 000', [[60000, 60000], [5000, 5000], [79000, 79000], [60000, 60000]],
  ['A', 'B', 'C', 'D'].map((id) => [par(id).totalAvant, par(id).totalApres]));
dit(1, '... et toutes peuvent changer, sauf H', [true, true, true, true, false], res.map((c) => c.ok));

/* == #2 -- LE PRIX CONSENTI ABSORBE L'ECART == */
dit(2, 'A : L Ancrage a 10 000 ; le prix consenti de 2 000 tombe a 0 et la ligne part', [[[10000, 0]], [], { avant: 2000, apres: 0 }],
  [net(par('A').apres, ANCRAGE), net(par('A').apres, LIBELLE_AJUSTEMENT), par('A').ajustement]);
dit(2, 'D : le prix consenti passe de 32 000 a 30 000', [[[10000, 0]], [[30000, 0]]], [net(par('D').apres, ANCRAGE), net(par('D').apres, LIBELLE_AJUSTEMENT)]);
dit(2, 'B : sans prix consenti, 2 000 de remise sur la nouvelle ligne ; la remise globale reste 3 000', [[[10000, 2000]], 3000, 2000],
  [net(par('B').apres, ANCRAGE), par('B').apres.globalDiscountXof, par('B').remiseLigne]);
dit(2, 'C : deja a 10 000, seul le nom change (la remise de 5 000 reste)', [[[10000, 5000]], undefined, undefined],
  [net(par('C').apres, ANCRAGE), par('C').ajustement, par('C').remiseLigne]);
dit(2, 'plus aucune ligne Souffle sur A B C D', [0, 0, 0, 0], ['A', 'B', 'C', 'D'].map((id) => net(par(id).apres, SOUFFLE).length));
{
  const moinsCher = remplacementsDesPieces([PIECES[0]], { ...PLAN, prixXof: 5000 }, invoiceTotal, LE)[0];
  dit(2, 'si la nouvelle coute moins (5 000), le prix consenti MONTE : 2 000 -> 5 000, total 60 000', [{ avant: 2000, apres: 5000 }, 60000, true],
    [moinsCher.ajustement, moinsCher.totalApres, moinsCher.ok]);
  const sansAjust = remplacementsDesPieces([piece('S', '2025-01-01', [ligne(SOUFFLE, 8000), ligne(REPRISE, 50000)])], { ...PLAN, prixXof: 5000 }, invoiceTotal, LE)[0];
  dit(2, '... et sans prix consenti, il s ajoute (3 000)', [3000, [[3000, 0]], 58000],
    [sansAjust.ajoute, net(sansAjust.apres, LIBELLE_AJUSTEMENT), sansAjust.totalApres]);
}

/* == #3 -- DEFAIRE REMET LA PIECE TELLE QU'AVANT == */
{
  const sansCle = (p: Invoice) => { const { remplacements: _r, ...x } = p; return x; };
  dit(3, 'defaire A, B, D : les lignes d avant reviennent, et la trace part', [true, true, true],
    ['A', 'B', 'D'].map((id) => pareil(piecesSansLeRemplacement(par(id).apres, LE), sansCle(par(id).piece))));
  dit(3, 'defaire un AUTRE geste ne touche a rien', true, piecesSansLeRemplacement(par('A').apres, '2020-01-01') === par('A').apres);
  dit(3, 'le dernier geste se retrouve sur les pieces', { le: LE, de: SOUFFLE, vers: ANCRAGE },
    (({ le, de, vers }) => ({ le, de, vers }))(dernierRemplacement(res.map((c) => c.apres))!));
}

/* == #4 -- LES RENDEZ-VOUS : MEME PLACE, MEME ANNEE == */
{
  const RDV = [
    { id: 'r1', date: '2025-01-22', status: 'honoré', serviceIds: ['ess-c', 'atl'], depositServiceIds: ['ess-c'], mains: [['x'], ['y']] },
    { id: 'r2', date: '2025-02-12', status: 'honoré', serviceIds: ['ess-c'] },
    { id: 'r3', date: '2025-07-01', status: 'annulé', serviceIds: ['ess-c', 'atl'] },
    { id: 'r4', date: '2026-02-11', status: 'honoré', serviceIds: ['ess-c', 'atl'] },
    { id: 'r5', date: '2025-09-17', status: 'honoré', serviceIds: ['atl'] },
  ];
  const r = remplacementsDesRdv(RDV, { deId: 'ess-c', versId: 'sig-c', annee: '2025' }, LE);
  dit(4, 'les RDV de 2025 qui portent le Souffle, ni annule ni 2026 : r1 r2', ['r1', 'r2'], r.map((x) => x.rdv.id));
  dit(4, 'la prestation change A SA PLACE (mains et remises restent alignees)', [['sig-c', 'atl'], ['sig-c'], [['x'], ['y']]],
    [r[0].apres.serviceIds, r[0].apres.depositServiceIds, r[0].apres.mains]);
  dit(4, 'defaire remet les prestations d avant', [true, true],
    r.map((x) => { const { remplacements: _r, ...a } = rdvSansLeRemplacement(x.apres, LE); return pareil(a, x.rdv); }));
}

/* == #5 -- LE CABLAGE == */
{
  const outil = source('src/apps/trone/routes/clients/RemplacerUnePrestation.tsx');
  const fiche = source('src/apps/trone/routes/clients/Customers.tsx');
  dit(5, 'l outil passe par invoiceTotal, n applique que les pieces qui retombent pile, sauvegarde d abord', [true, true, true, true], [
    /remplacementsDesPieces\(factures, \{ de, vers: vers\.name, prixXof, annee: an \}, invoiceTotal, le\)\.filter\(\(c\) => c\.ok\)/.test(outil),
    outil.includes('downloadBackup()'),
    outil.includes('disabled={!sauvee ||'),
    outil.includes("o.kind !== 'devis'"),
  ]);
  dit(5, 'la fiche ne l ouvre que pour la direction', true, /estDirection && documents\.some\(\(o\) => o\.kind !== 'devis'\) && \(remplaceOuvertPour === client\.id/.test(fiche));
}

console.log(ko === 0 ? 'Une prestation remplacee, les totaux tenus.' : `${ko} constat(s) en echec.`);
