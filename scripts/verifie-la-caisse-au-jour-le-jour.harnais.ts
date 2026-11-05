/* LA CAISSE AU JOUR LE JOUR, ÉPROUVÉE : 5 novembre 2026.
   `node scripts/verifie-la-caisse-au-jour-le-jour.mjs` (et `--prouve`).

   La remise à 0 F du tiroir : le reste s'écrit « À régulariser », jamais
   avant une clôture, jamais deux fois ; ce que chaque mois a laissé tombe
   sur le livre ; une part retrouvée devient une dépense sans vider le
   tiroir une seconde fois ; le tiroir jour par jour. Montants inventés :
   le dépôt est public. */
import { readFileSync } from 'node:fs';
import {
  MOTIF_A_REGULARISER, aRegulariserDeLaRemise, apresLaRegularisation, ceQueChaqueMoisALaisse, dateProposeeDeLaRemise,
  derniereRemiseDe, dernierJourDuMois, estARegulariser, lesJoursDuTiroir, lesMoisDe, pourquoiPasLaRegularisation,
  pourquoiPasLaRemise, resteARegulariser, seDefait, type Destinations, type RemiseDuTiroir,
} from '../src/shared/remise-a-zero-pur';
import { MOTIFS_SORTIE_HORS_ACTIVITE } from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

const RIEN: Destinations = { banque: 0, coffre: 0, depense: 0, prelevement: 0, reste: 0 };
const LIVRE = 1850000;

/* ── 1. Ce qui s'écrit « À régulariser » ── */
dit('le reste du livre s’écrit à régulariser ; ce qu’on sait dire en sort',
  [1850000, 830000, 0],
  [
    aRegulariserDeLaRemise(LIVRE, RIEN),
    aRegulariserDeLaRemise(LIVRE, { ...RIEN, banque: 1000000, reste: 20000 }),
    aRegulariserDeLaRemise(LIVRE, { ...RIEN, coffre: 1850000 }),
  ]);

/* ── 2. Quand la remise ne s'écrit pas ── */
const base = { livreXof: LIVRE, d: RIEN, date: '2026-10-31', aujourdhui: '2026-11-05' };
dit('la remise d’octobre s’écrit ; un jour de clôture lui-même est permis',
  [null, null],
  [pourquoiPasLaRemise(base), pourquoiPasLaRemise({ ...base, derniereClotureLe: '2026-10-31' })]);
dit('jamais dans l’avenir, jamais avant une clôture, jamais deux fois',
  [
    'La remise ne se date pas dans l’avenir.',
    'Le tiroir a été clôturé le 03/11/2026 : la remise se date ce jour-là ou après.',
    'Ce tiroir a déjà été remis à 0 F le 31/10/2026 : la remise suivante se date après.',
  ],
  [
    pourquoiPasLaRemise({ ...base, date: '2026-11-06' }),
    pourquoiPasLaRemise({ ...base, derniereClotureLe: '2026-11-03' }),
    pourquoiPasLaRemise({ ...base, derniereRemiseLe: '2026-10-31' }),
  ]);
dit('un montant illisible, un livre vide, plus que le livre',
  [
    'Un montant ne se lit pas : écrivez des chiffres seulement.',
    'Un montant ne se lit pas : écrivez des chiffres seulement.',
    'Le livre ne dit rien dans ce tiroir : il n’y a rien à remettre à 0 F.',
    'Plus que le livre de 650 000 F : vérifiez les montants.',
  ],
  [
    pourquoiPasLaRemise({ ...base, d: { ...RIEN, coffre: -5 } }),
    pourquoiPasLaRemise({ ...base, d: { ...RIEN, coffre: Number.NaN } }),
    pourquoiPasLaRemise({ ...base, livreXof: 0 }),
    pourquoiPasLaRemise({ ...base, d: { ...RIEN, banque: 2500000 } }),
  ]);
dit('chaque destination dit où : la caisse, le libellé, l’associé ; et rien qui sorte',
  [
    'Choisissez la caisse qui a reçu le versement.',
    'Dites ce que la dépense a payé.',
    'Choisissez l’associé du prélèvement.',
    'Rien ne sort : le tiroir garde tout ce que dit le livre.',
    null,
  ],
  [
    pourquoiPasLaRemise({ ...base, d: { ...RIEN, banque: 100000 } }),
    pourquoiPasLaRemise({ ...base, d: { ...RIEN, depense: 100000 }, depenseLibelle: '  ' }),
    pourquoiPasLaRemise({ ...base, d: { ...RIEN, prelevement: 100000 } }),
    pourquoiPasLaRemise({ ...base, d: { ...RIEN, reste: LIVRE } }),
    pourquoiPasLaRemise({ ...base, d: { ...RIEN, banque: 100000, depense: 5000, prelevement: 1, reste: 20000 }, banqueVers: 'Banque', depenseLibelle: 'Savon', prelevementPour: 'st-1' }),
  ]);

/* ── 3. Ce que chaque mois a laissé ── */
const fins = [
  ['2026-01', 20000], ['2026-02', 20000], ['2026-03', 20000], ['2026-04', 20000], ['2026-05', 20000],
  ['2026-06', 30000], ['2026-07', 180000], ['2026-08', 580000], ['2026-09', 1100000], ['2026-10', 1850000],
].map(([mois, xof]) => ({ mois: mois as string, xof: xof as number }));
const parts = ceQueChaqueMoisALaisse(fins);
dit('les six mois du tiroir, sans les mois vides, et leur somme tombe sur le livre',
  [[['2026-01', 20000], ['2026-06', 10000], ['2026-07', 150000], ['2026-08', 400000], ['2026-09', 520000], ['2026-10', 750000]], LIVRE],
  [parts.map((p) => [p.mois, p.xof]), parts.reduce((s, p) => s + p.xof, 0)]);
dit('après une remise d’avant : ce qu’elle a laissé d’abord, puis le mois',
  [[{ mois: '2026-10', xof: 20000, reste: true }, { mois: '2026-11', xof: 210000 }], []],
  [ceQueChaqueMoisALaisse([{ mois: '2026-11', xof: 230000 }], { xof: 20000, mois: '2026-10' }), ceQueChaqueMoisALaisse([])]);
dit('un mois qui a plus dépensé qu’encaissé se dit en négatif',
  [[['2026-09', 100000], ['2026-10', -40000]], 60000],
  ((p) => [p.map((x) => [x.mois, x.xof]), p.reduce((s, x) => s + x.xof, 0)])(ceQueChaqueMoisALaisse([{ mois: '2026-09', xof: 100000 }, { mois: '2026-10', xof: 60000 }])));

/* ── 4. Les jours ── */
dit('en début de mois, le dernier jour du mois d’avant ; après le 10, le jour même',
  ['2026-10-31', '2026-10-31', '2026-11-11', '2026-12-31', '2026-02-28'],
  [dateProposeeDeLaRemise('2026-11-05'), dateProposeeDeLaRemise('2026-11-10'), dateProposeeDeLaRemise('2026-11-11'), dateProposeeDeLaRemise('2027-01-03'), dateProposeeDeLaRemise('2026-03-02')]);
dit('le dernier jour d’un mois, février bissextile compris ; les mois d’un livre',
  ['2026-02-28', '2028-02-29', '2026-10-31', ['2026-11', '2026-12', '2027-01', '2027-02'], ['2026-10']],
  [dernierJourDuMois('2026-02'), dernierJourDuMois('2028-02'), dernierJourDuMois('2026-10'), lesMoisDe('2026-11', '2027-02'), lesMoisDe('2026-10', '2026-10')]);

/* ── 5. Une part retrouvée ── */
const reg = { resteXof: LIVRE, xof: 85000, quoi: 'Produits de soin', devient: 'depense' as const, date: '2026-09-30', remiseLe: '2026-10-31' };
dit('une part se régularise ; jamais plus que le reste, jamais vide, jamais après la remise',
  [
    null,
    'Plus que ce qui reste à régulariser (1 850 000 F).',
    'Le montant manque.',
    'Dites ce qui a été payé.',
    'La part est sortie du tiroir au plus tard le 31/10/2026.',
    'Choisissez l’associé.',
    null,
  ],
  [
    pourquoiPasLaRegularisation(reg),
    pourquoiPasLaRegularisation({ ...reg, xof: LIVRE + 1 }),
    pourquoiPasLaRegularisation({ ...reg, xof: 0 }),
    pourquoiPasLaRegularisation({ ...reg, quoi: ' ' }),
    pourquoiPasLaRegularisation({ ...reg, date: '2026-11-01' }),
    pourquoiPasLaRegularisation({ ...reg, devient: 'prelevement' }),
    pourquoiPasLaRegularisation({ ...reg, devient: 'prelevement', associe: 'st-1' }),
  ]);
const remise: RemiseDuTiroir = { livreXof: LIVRE, initialXof: LIVRE, resteXof: 0, parMois: parts, ecritures: [], regularisations: [], le: '2026-11-05T08:00:00.000Z' };
const ligne = { id: 'h1', branchId: 'b', date: '2026-10-31', sens: 'sortie' as const, motif: MOTIF_A_REGULARISER, label: 'x', amountXof: LIVRE, cashbox: 'Tiroir', remise };
const apres = apresLaRegularisation(ligne, { id: 'r1', le: '2026-11-06T09:00:00.000Z', xof: 85000, devient: 'depense', ecritureId: 'e1', quoi: 'Produits de soin', date: '2026-09-30' });
dit('la sortie baisse de la part, la part se garde ; la sortie et la dépense font toujours le livre',
  [1765000, 1, LIVRE, LIVRE, 'Tiroir'],
  [apres.amountXof, apres.remise?.regularisations.length, apres.amountXof + 85000, apres.remise?.initialXof, apres.cashbox]);

/* ── 6. Le registre ── */
const l = [
  ligne,
  { ...ligne, id: 'h2', amountXof: 5000, date: '2026-11-30' },
  { ...ligne, id: 'h3', motif: 'Prélèvement de l’associé', amountXof: 70000 },
  { ...ligne, id: 'h4', branchId: 'autre', amountXof: 999 },
  { ...ligne, id: 'h5', sens: 'entree' as const, amountXof: 111 },
  { ...ligne, id: 'h6', cashbox: 'Autre tiroir', date: '2026-12-31' },
];
dit('le reste à régulariser compte les sorties « À régulariser » de la branche, toutes caisses, et elles seules',
  [LIVRE + 5000 + LIVRE, true, false, false],
  [resteARegulariser(l, 'b'), estARegulariser(ligne), estARegulariser({ sens: 'sortie', motif: 'Autre' }), estARegulariser({ sens: 'entree', motif: MOTIF_A_REGULARISER })]);
dit('la dernière remise d’un tiroir est la sienne, la plus récente',
  ['2026-11-30', '2026-12-31', undefined],
  [derniereRemiseDe(l, 'b', 'Tiroir'), derniereRemiseDe(l, 'b', 'Autre tiroir'), derniereRemiseDe(l, 'b', 'Inconnu')]);
dit('une remise se défait tant qu’aucune part n’est régularisée',
  [true, false, false],
  [seDefait(ligne), seDefait(apres), seDefait({})]);

/* ── 7. Le tiroir jour par jour ── */
const jours = lesJoursDuTiroir({
  de: '2026-10-31', a: '2026-11-05', departXof: 1850000,
  moves: [
    { date: '2026-10-31', delta: -1850000, remise: true },
    { date: '2026-11-03', delta: 35000 }, { date: '2026-11-03', delta: 25000 },
    { date: '2026-11-04T13:22:11.000Z', delta: 40000 }, { date: '2026-11-04', delta: 110000 },
  ],
  clotures: [
    { date: '2026-11-04', compteXof: 202000, ecartXof: -8000, laisseXof: 202000, le: '2026-11-05T07:00:00.000Z' },
    { date: '2026-11-04', compteXof: 210000, ecartXof: 0, laisseXof: 210000, le: '2026-11-05T07:30:00.000Z' },
  ],
});
dit('une ligne par jour : la remise, le matin, le soir, l’heure ISO au bon jour',
  [
    ['2026-10-31', 1850000, 0, 1850000, 0, 1850000],
    ['2026-11-01', 0, 0, 0, 0, 0],
    ['2026-11-03', 0, 60000, 0, 60000, 0],
    ['2026-11-04', 60000, 150000, 0, 210000, 0],
    ['2026-11-05', 210000, 0, 0, 210000, 0],
  ],
  jours.filter((j) => ['2026-10-31', '2026-11-01', '2026-11-03', '2026-11-04', '2026-11-05'].includes(j.jour))
    .map((j) => [j.jour, j.matinXof, j.entreesXof, j.sortiesXof, j.soirXof, j.remiseXof]));
dit('la remise se voit sur son jour ; la clôture reprise dit le dernier compte ; six jours',
  [[1850000, 0, 1850000], { compteXof: 210000, ecartXof: 0, laisseXof: 210000 }, 6, false],
  [[jours[0].sortiesXof, jours[0].soirXof, jours[0].remiseXof], jours.find((j) => j.jour === '2026-11-04')?.compte, jours.length, 'compte' in (jours.find((j) => j.jour === '2026-11-03') ?? {})]);

/* ── 8. Le modèle, les écrans ── */
dit('« À régulariser » est un motif de sortie hors activité', true, (MOTIFS_SORTIE_HORS_ACTIVITE as readonly string[]).includes(MOTIF_A_REGULARISER));
const caisses = readFileSync('src/apps/trone/routes/finances/Caisses.tsx', 'utf8');
const tiroirs = readFileSync('src/apps/trone/routes/finances/tiroirs.tsx', 'utf8');
const remiseEcran = readFileSync('src/apps/trone/routes/finances/RemiseAZero.tsx', 'utf8');
const registre = readFileSync('src/apps/trone/routes/finances/ARegulariser.tsx', 'utf8');
dit('« Remettre à 0 F » : la direction seule, sur un tiroir de la Maison ; le registre est posé',
  [true, true],
  [/\{estDirection && visible && boxCur === currency && !gardeToutSonPasse\(c\) && bal > 0 && \(/.test(caisses), caisses.includes('<ARegulariser />')]);
dit('le relevé a son « Jour par jour » ; la remise et le registre passent par les règles pures',
  [true, true, true, true],
  [
    tiroirs.includes("['jours', 'Jour par jour']") && tiroirs.includes('<TiroirJourParJour nom={nom} month={month} />'),
    remiseEcran.includes('pourquoiPasLaRemise({') && remiseEcran.includes('aRegulariserDeLaRemise(livreXof, d)'),
    registre.includes('pourquoiPasLaRegularisation({') && registre.includes('apresLaRegularisation(x, r)'),
    registre.includes('if (lignes.length === 0) return null;'),
  ]);
/* La dépense née d'une part sort du même tiroir que la sortie : sinon le
   tiroir baisserait une seconde fois, ou d'un autre tiroir. */
dit('la dépense née d’une part sort du tiroir de la sortie', true, /cashbox: m\.cashbox, category: form\.categorie/.test(registre));
const pur = readFileSync('src/shared/remise-a-zero-pur.ts', 'utf8');
const sansCommentaires = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
dit('pas de tiret cadratin dans ce qui s’affiche', [false, false, false],
  [sansCommentaires(pur), sansCommentaires(remiseEcran), sansCommentaires(registre)].map((t) => t.includes(String.fromCharCode(0x2014))));

console.log(ko === 0 ? '\nLa caisse au jour le jour tient.' : `\n${ko} ECHEC(S)`);
if (ko) process.exitCode = 1;
