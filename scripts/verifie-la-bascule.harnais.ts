/* LA BASCULE D'OCTOBRE, ÉPROUVÉE — `node scripts/verifie-la-bascule.mjs`.

   4 octobre 2026. L'attente vient des réponses de Yéman au sélecteur, pas du
   code : tout l'avant octobre dans une seule archive ; Real Money et ACIA1
   rangés ; Wells Fargo et Scotiabank au Foyer ; MoMo Brice devient « Terrasse ·
   MoMo MTN » ; KkiaPay garde son nom ; le retour en arrière rend tout. Les
   noms et montants sont des exemples. */
import { readFileSync } from 'node:fs';
import {
  ARCHIVE, NEUVES, basculeLEcriture, rendsLEcriture, caissesApres, caissesRendues, compteLaBascule,
  jourDe, nouveauNom, planPropose, type Plan,
} from '../src/shared/bascule-des-caisses-pur';
import { caissesVivantes, caisseParDefaut, type Cashbox } from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const B = 'br-1';
const caisse = (id: string, name: string, x: Partial<Cashbox> = {}): Cashbox =>
  ({ id, branchId: B, name, sub: '', glyph: '◈', openingXof: 15000, ...x });
const avant: Cashbox[] = [
  caisse('c1', 'Caisse principale'), caisse('c2', 'Real Money'), caisse('c3', 'ACIA1'),
  caisse('c4', 'MoMo Brice'), caisse('c5', 'KkiaPay'), caisse('c6', 'Wells Fargo', { currency: 'USD' }),
  caisse('c7', 'Scotiabank', { currency: 'CAD' }), caisse('c8', 'Tiroir EUR', { currency: 'EUR' }),
  caisse('c9', 'Euros bis', { currency: 'EUR' }),
];
const plan0 = planPropose(avant, B, 'XOF');
const dest = (n: string) => plan0.destins[n];

/* 1. Ce que la bascule propose : les réponses du 4 octobre. */
dit('Real Money et ACIA1 sont ranges', ['archiver', 'archiver'], [dest('Real Money').sort, dest('ACIA1').sort]);
dit('MoMo Brice devient Terrasse · MoMo MTN', { sort: 'renommer', nom: 'Terrasse · MoMo MTN', role: 'terrasse' }, dest('MoMo Brice'));
dit('KkiaPay garde son nom, a la Terrasse', { sort: 'garder', role: 'terrasse' }, dest('KkiaPay'));
dit('Wells Fargo et Scotiabank vont au Foyer, hors bilan', [['Foyer · Wells Fargo', 'foyer', true], ['Foyer · Scotiabank', 'foyer', true]],
  [dest('Wells Fargo'), dest('Scotiabank')].map((d) => (d.sort === 'renommer' ? [d.nom, d.role, d.horsBilan] : d.sort)));
dit('le tiroir en euros devient Terrasse · Devises EUR', 'Terrasse · Devises EUR', (dest('Tiroir EUR') as { nom?: string }).nom);
dit('deux caisses ne prennent jamais le meme nom : la seconde est rangee', 'archiver', dest('Euros bis').sort);

/* 2. La règle, case par case. */
const plan: Plan = { ...plan0, octobreVers: { 'Caisse principale': 'Terrasse · Tiroir espèces' } };
dit('avant octobre : tout va a l archive', [ARCHIVE, ARCHIVE, ARCHIVE],
  [nouveauNom(plan, 'Real Money', '2026-09-30'), nouveauNom(plan, 'KkiaPay', '2026-09-12'), nouveauNom(plan, 'Wells Fargo', '2025-12-01')]);
dit('... meme un nom qui n est plus une caisse (heritage)', ARCHIVE, nouveauNom(plan, '9a7vogg', '2025-06-01'));
dit('octobre : renommee, gardee, rangee avec sa piece', ['Terrasse · MoMo MTN', undefined, 'Terrasse · Tiroir espèces'],
  [nouveauNom(plan, 'MoMo Brice', '2026-10-02'), nouveauNom(plan, 'KkiaPay', '2026-10-02'), nouveauNom(plan, 'Caisse principale', '2026-10-03')]);
dit('les pourboires ne sont pas un tiroir : on n y touche pas', undefined, nouveauNom(plan, 'Pourboires', '2026-09-01'));
dit('les dates se lisent sous toutes leurs formes', ['2026-09-28', '2026-09-30', '2026-10-02'],
  [jourDe('28/09/2026'), jourDe('2026-09-30T23:10:00Z'), jourDe('2026-10-02')]);

/* 3. Les écritures. */
const facture = { id: 'f1', branchId: B, date: '2026-09-20', cashbox: 'Real Money', payments: [
  { id: 'p1', date: '2026-09-20', amountXof: 20000, method: 'Espèces', cashbox: 'Real Money' },
  { id: 'p2', date: '2026-10-02', amountXof: 5000, method: 'MTN MoMo', cashbox: 'MoMo Brice' },
] };
const f2 = basculeLEcriture('factures', facture, plan);
dit('facture : le versement de septembre a l archive, celui d octobre au MoMo MTN', [ARCHIVE, 'Terrasse · MoMo MTN', ARCHIVE],
  [f2.payments[0].cashbox, f2.payments[1].cashbox, f2.cashbox]);
dit('... chaque case garde le nom de son ancienne caisse', ['Real Money', 'MoMo Brice'],
  f2.payments.map((p) => (p as { cashboxAvant?: string }).cashboxAvant));
dit('un second passage ne change rien (meme objet)', true, basculeLEcriture('factures', f2, plan) === f2);
dit('le retour en arriere rend la facture telle quelle', facture, rendsLEcriture('factures', f2));
/* Une relance qui déplace encore une case garde le nom d'ORIGINE : le retour
   doit ramener à avant la première bascule, pas à la précédente. */
const plan2: Plan = { destins: { 'Terrasse · MoMo MTN': { sort: 'archiver' } }, octobreVers: { 'Terrasse · MoMo MTN': 'Caisse du mois' } };
const f3 = basculeLEcriture('factures', f2, plan2);
dit('deplacee deux fois : elle garde le nom de sa premiere caisse', ['Caisse du mois', 'MoMo Brice'],
  [f3.payments[1].cashbox, (f3.payments[1] as { cashboxAvant?: string }).cashboxAvant]);
dit('... et le retour ramene a avant la premiere bascule', facture, rendsLEcriture('factures', f3));
const transfert = { id: 't1', branchId: B, date: '2026-09-15', de: 'ACIA1', vers: 'Caisse principale', montant: 1 };
const t2 = basculeLEcriture('transferts', transfert, plan);
dit('transfert d avant octobre : ses deux bouts vont a l archive', [ARCHIVE, ARCHIVE], [t2.de, t2.vers]);
dit('avance sur salaire datee 28/09/2026 : archive', ARCHIVE, basculeLEcriture('avances', { id: 'a', date: '28/09/2026', cashbox: 'ACIA1' }, plan).cashbox);
dit('engagement : la date qui compte est celle du versement', ARCHIVE,
  basculeLEcriture('engagements', { id: 'v', prevuLe: '2026-10-10', verseLe: '2026-09-29', cashbox: 'Real Money' }, plan).cashbox);
const sansPiece: Plan = { ...plan0, octobreVers: {} };
const bilan = compteLaBascule(sansPiece, { depenses: [{ date: '2026-10-03', cashbox: 'Caisse principale' }, { date: '2026-09-03', cashbox: 'Caisse principale' }] });
dit('une ecriture d octobre sur une caisse rangee demande sa piece avant de lancer', { versLArchive: 1, deplacees: 0, manquantes: { 'Caisse principale': 1 } }, bilan);

/* 4. Les caisses. */
const apres = caissesApres(avant, B, plan, '2026-10-04T12:00:00Z', (n) => `cb-${n.role}`);
const nom = (n: string) => apres.find((c) => c.name === n);
dit('les caisses neuves sont creees, l archive comprise', NEUVES.map((n) => !!nom(n.nom)), NEUVES.map(() => true));
dit('Real Money est rangee, son ouverture a 0', [true, 0], [!!apres.find((c) => c.id === 'c2')?.archiveeLe, apres.find((c) => c.id === 'c2')?.openingXof]);
dit('MoMo Brice renommee garde son identifiant et son passe', ['c4', 'MoMo Brice', 15000], [nom('Terrasse · MoMo MTN')?.id, nom('Terrasse · MoMo MTN')?.avantLaBascule?.name, nom('Terrasse · MoMo MTN')?.avantLaBascule?.openingXof]);
dit('toutes les caisses vivantes repartent de 0', true, caissesVivantes(apres).every((c) => c.openingXof === 0));
dit('les rangees quittent les listes', false, caissesVivantes(apres).some((c) => c.name === 'Real Money'));
dit('la caisse par defaut est a la Terrasse', 'terrasse', caisseParDefaut(apres, B, 'XOF')?.role);
const rendues = caissesRendues(apres, B, new Set(['Caisse du mois']));
dit('retour : noms et ouvertures d avant', ['MoMo Brice', 15000, undefined], [rendues.find((c) => c.id === 'c4')?.name, rendues.find((c) => c.id === 'c4')?.openingXof, rendues.find((c) => c.id === 'c2')?.archiveeLe]);
dit('... les neuves que plus rien ne nomme s en vont, les autres restent', [false, true], [!!rendues.find((c) => c.name === 'La Banque'), !!rendues.find((c) => c.name === 'Caisse du mois')]);

/* 5. Le câblage. */
const sync = readFileSync('src/shared/sync.ts', 'utf8');
dit('la synchronisation ecrit par tranches', true, /for \(let i = 0; i < upserts\.length; i \+= TRANCHE_D_ENVOI\)/.test(sync));
const caissesSrc = readFileSync('src/apps/trone/routes/finances/Caisses.tsx', 'utf8');
dit('l ecran des caisses ouvre la bascule', true, /<BasculeDOctobre onClose=/.test(caissesSrc));
const bascule = readFileSync('src/apps/trone/routes/finances/bascule.ts', 'utf8');
dit('les cartes cadeaux ne sont pas reecrites (la base les fige)', false, /cartesCadeaux/.test(bascule));
const fin = readFileSync('src/shared/finance.ts', 'utf8');
dit('useCashboxes ne rend que les caisses vivantes', true, /const vivantes = useMemo\(\(\) => caissesVivantes\(toutes\), \[toutes\]\);/.test(fin));

console.log(ko === 0 ? '\nLa bascule tient ce qui a ete decide.' : `\n${ko} controle(s) en echec.`);
