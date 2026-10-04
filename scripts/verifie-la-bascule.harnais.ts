/* OUVRIR OCTOBRE, ÉPROUVÉ — `node scripts/verifie-la-bascule.mjs`.

   4 octobre 2026. L'attente vient des mots de Yéman, pas du code :
     · les réponses au sélecteur : MoMo Brice continue en « Terrasse · MoMo
       MTN », Wells Fargo et Scotiabank au Foyer, KkiaPay garde son nom, Real
       Money et ACIA1 ne continuent pas ;
     · le second message : « je ne veux pas que les caisses rangées
       disparaissent […] finaliser tout mon travail jusqu'au 1er octobre […]
       bien continuer la suite à partir du 1er octobre ». Donc rien d'avant
       octobre ne bouge, les anciennes restent visibles avec tout leur passé ;
     · plus tard, ranger l'avant dans une seule archive (temps ②).
   Les noms et montants sont des exemples. */
import { readFileSync } from 'node:fs';
import {
  ARCHIVE, NEUVES, basculeLEcriture, rendsLEcriture, caissesApres, caissesRendues, compteLaBascule,
  jourDe, nouveauNom, planPropose, type Plan,
} from '../src/shared/bascule-des-caisses-pur';
import { caissesVivantes, caisseParDefaut, caissesPourLaDate, type Cashbox } from '../src/shared/finance';

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

/* 1. Ce qu'ouvrir octobre propose. */
dit('c est le temps ① : ouvrir octobre', 'ouvrir', plan0.etape);
dit('Caisse principale, Real Money et ACIA1 deviennent anciennes, sans suite', ['ancienne', 'ancienne', 'ancienne'],
  [dest('Caisse principale').sort, dest('Real Money').sort, dest('ACIA1').sort]);
dit('MoMo Brice continue en Terrasse · MoMo MTN', { sort: 'suite', nom: 'Terrasse · MoMo MTN', role: 'terrasse' }, dest('MoMo Brice'));
dit('KkiaPay garde son nom, a la Terrasse', { sort: 'garder', role: 'terrasse' }, dest('KkiaPay'));
dit('Wells Fargo et Scotiabank continuent au Foyer, hors bilan', [['Foyer · Wells Fargo', 'foyer', true], ['Foyer · Scotiabank', 'foyer', true]],
  [dest('Wells Fargo'), dest('Scotiabank')].map((d) => (d.sort === 'suite' ? [d.nom, d.role, d.horsBilan] : d.sort)));
dit('le tiroir en euros continue en Terrasse · Devises EUR', 'Terrasse · Devises EUR', (dest('Tiroir EUR') as { nom?: string }).nom);
dit('deux caisses n ont jamais la meme suite : la seconde reste ancienne', 'ancienne', dest('Euros bis').sort);

/* 2. La règle : rien d'avant octobre ne bouge. */
const plan: Plan = { ...plan0, octobreVers: { 'Caisse principale': 'Terrasse · Tiroir espèces' } };
dit('avant octobre : rien ne bouge, aucune caisse', [undefined, undefined, undefined, undefined],
  [nouveauNom(plan, 'Real Money', '2026-09-30'), nouveauNom(plan, 'MoMo Brice', '2026-09-12'), nouveauNom(plan, 'KkiaPay', '2026-09-01'), nouveauNom(plan, 'Wells Fargo', '2025-12-01')]);
dit('octobre : la suite, la piece choisie, ou rien pour KkiaPay', ['Terrasse · MoMo MTN', 'Terrasse · Tiroir espèces', undefined],
  [nouveauNom(plan, 'MoMo Brice', '2026-10-02'), nouveauNom(plan, 'Caisse principale', '2026-10-03'), nouveauNom(plan, 'KkiaPay', '2026-10-02')]);
dit('les pourboires ne sont pas un tiroir : on n y touche pas', undefined, nouveauNom(plan, 'Pourboires', '2026-10-05'));
dit('les dates se lisent sous toutes leurs formes', ['2026-09-28', '2026-09-30', '2026-10-02'],
  [jourDe('28/09/2026'), jourDe('2026-09-30T23:10:00Z'), jourDe('2026-10-02')]);

/* 3. Les écritures. */
const facture = { id: 'f1', branchId: B, date: '2026-09-20', cashbox: 'Real Money', payments: [
  { id: 'p1', date: '2026-09-20', amountXof: 20000, method: 'Espèces', cashbox: 'Real Money' },
  { id: 'p2', date: '2026-10-02', amountXof: 5000, method: 'MTN MoMo', cashbox: 'MoMo Brice' },
] };
const f2 = basculeLEcriture('factures', facture, plan);
dit('facture : le versement de septembre reste, celui d octobre passe au MoMo MTN', ['Real Money', 'Terrasse · MoMo MTN', 'Real Money'],
  [f2.payments[0].cashbox, f2.payments[1].cashbox, f2.cashbox]);
dit('... la case deplacee garde le nom de son ancienne caisse', 'MoMo Brice', (f2.payments[1] as { cashboxAvant?: string }).cashboxAvant);
dit('un second passage ne change rien (meme objet)', true, basculeLEcriture('factures', f2, plan) === f2);
dit('le retour en arriere rend la facture telle quelle', facture, rendsLEcriture('factures', f2));
const plan2: Plan = { etape: 'ouvrir', destins: { 'Terrasse · MoMo MTN': { sort: 'ancienne' } }, octobreVers: { 'Terrasse · MoMo MTN': 'Caisse du mois' } };
const f3 = basculeLEcriture('factures', f2, plan2);
dit('deplacee deux fois : elle garde le nom de sa premiere caisse', ['Caisse du mois', 'MoMo Brice'],
  [f3.payments[1].cashbox, (f3.payments[1] as { cashboxAvant?: string }).cashboxAvant]);
dit('... et le retour ramene a avant la premiere fois', facture, rendsLEcriture('factures', f3));
const transfert = { id: 't1', branchId: B, date: '2026-10-05', de: 'ACIA1', vers: 'MoMo Brice', montant: 1 };
const sansPiece: Plan = { ...plan0, octobreVers: {} };
dit('une ecriture d octobre sur une ancienne sans suite demande sa piece avant d ouvrir', { versLArchive: 0, deplacees: 1, manquantes: { ACIA1: 1 } },
  compteLaBascule(sansPiece, { transferts: [transfert], depenses: [{ date: '2026-09-03', cashbox: 'ACIA1' }] }));
dit('avance du 02/10/2026 sur MoMo Brice : vers la suite', 'Terrasse · MoMo MTN', basculeLEcriture('avances', { id: 'a', date: '02/10/2026', cashbox: 'MoMo Brice' }, plan).cashbox);
dit('engagement : la date qui compte est celle du versement', 'MoMo Brice',
  basculeLEcriture('engagements', { id: 'v', prevuLe: '2026-10-10', verseLe: '2026-09-29', cashbox: 'MoMo Brice' }, plan).cashbox);

/* 4. Les caisses : rien ne disparaît. */
const apres = caissesApres(avant, B, plan, '2026-10-04T12:00:00Z', (nom) => `cb-${nom}`);
const par = (n: string) => apres.find((c) => c.name === n);
dit('aucune caisse ne disparait des listes', avant.map((c) => c.name).sort(), caissesVivantes(apres).filter((c) => avant.some((a) => a.id === c.id)).map((c) => c.name).sort());
dit('Real Money est ancienne, nom et ouverture intacts', ['Real Money', 15000, '2026-09-30'], [apres.find((c) => c.id === 'c2')?.name, apres.find((c) => c.id === 'c2')?.openingXof, apres.find((c) => c.id === 'c2')?.jusquAu]);
dit('MoMo Brice reste ancienne, sa suite nait a part', ['MoMo Brice', '2026-09-30', 'terrasse', 0],
  [apres.find((c) => c.id === 'c4')?.name, apres.find((c) => c.id === 'c4')?.jusquAu, par('Terrasse · MoMo MTN')?.role, par('Terrasse · MoMo MTN')?.openingXof]);
dit('une suite garde la devise de sa caisse', ['EUR', 'USD'], [par('Terrasse · Devises EUR')?.currency, par('Foyer · Wells Fargo')?.currency]);
dit('KkiaPay entre a la Terrasse sous son nom', ['KkiaPay', 'terrasse', undefined], [apres.find((c) => c.id === 'c5')?.name, apres.find((c) => c.id === 'c5')?.role, apres.find((c) => c.id === 'c5')?.jusquAu]);
dit('les pieces neuves naissent, sans l archive', NEUVES.map((n) => (n.role === 'archive' ? false : true)), NEUVES.map((n) => !!par(n.nom)));
dit('une relance ne cree rien deux fois', apres.length, caissesApres(apres, B, planPropose(apres.filter((c) => !c.creeeParLaBascule), B, 'XOF'), 'x', (n) => `cb2-${n}`).length);
dit('la caisse par defaut est a la Terrasse neuve', 'terrasse', caisseParDefaut(apres, B, 'XOF')?.role);
const rendues = caissesRendues(apres, B, new Set(['Caisse du mois']));
dit('retour : les anciennes redeviennent ordinaires', [undefined, 'MoMo Brice'], [rendues.find((c) => c.id === 'c4')?.jusquAu, rendues.find((c) => c.id === 'c4')?.name]);
dit('... les neuves que plus rien ne nomme s en vont, les autres restent', [false, false, true],
  [!!rendues.find((c) => c.name === 'La Banque'), !!rendues.find((c) => c.name === 'Terrasse · MoMo MTN'), !!rendues.find((c) => c.name === 'Caisse du mois')]);

/* 5. Le temps ② : ranger l'avant, plus tard. */
const ranger: Plan = { etape: 'ranger', destins: {}, octobreVers: {} };
dit('ranger : l avant part dans l archive, octobre ne bouge pas', [ARCHIVE, undefined],
  [nouveauNom(ranger, 'Real Money', '2026-09-30'), nouveauNom(ranger, 'Terrasse · MoMo MTN', '2026-10-02')]);
dit('ranger : seule l archive nait', [ARCHIVE], caissesApres(apres, B, ranger, 'x', (n) => n).filter((c) => !apres.includes(c)).map((c) => c.name));

/* 5 bis. « Pourquoi les RDV à venir ont toujours les anciennes caisses ? »
   La liste suit la date de l'écriture, une fois octobre ouvert. */
const noms = (l: Cashbox[]) => l.map((c) => c.name).sort();
const dOctobre = noms(caissesPourLaDate(apres.filter((c) => c.branchId === B), '2026-10-07'));
dit('un encaissement d octobre ne voit pas les anciennes', false, dOctobre.some((n) => ['Real Money', 'MoMo Brice', 'Caisse principale'].includes(n)));
dit('... il voit les pieces neuves, les suites et KkiaPay', true, ['Terrasse · Tiroir espèces', 'Terrasse · MoMo MTN', 'KkiaPay'].every((n) => dOctobre.includes(n)));
const dSeptembre = noms(caissesPourLaDate(apres.filter((c) => c.branchId === B), '2026-09-20'));
dit('une correction de septembre voit les anciennes, pas les pieces neuves', [true, false],
  [dSeptembre.includes('Real Money'), dSeptembre.some((n) => n === 'Terrasse · Tiroir espèces' || n === 'La Banque')]);
dit('la caisse deja portee par l ecriture reste dans la liste', true, caissesPourLaDate(apres, '2026-10-07', 'Real Money').some((c) => c.name === 'Real Money'));
dit('avant d ouvrir octobre, rien n est filtre', avant.length, caissesPourLaDate(avant, '2026-10-07').length);
const avecBiic: Plan = { ...planPropose([...avant, caisse('cb', 'BIIC')], B, 'XOF'), octobreVers: {} };
avecBiic.destins.BIIC = { sort: 'garder', role: 'banque' };
const apresBiic = caissesApres([...avant, caisse('cb', 'BIIC')], B, avecBiic, 'x', (n) => `cb-${n}`);
dit('BIIC gardee comme Banque : pas de seconde « La Banque »', [false, 'banque'], [apresBiic.some((c) => c.name === 'La Banque'), apresBiic.find((c) => c.name === 'BIIC')?.role]);

/* 6. Le câblage. */
const ecransDate: [string, RegExp][] = [
  ['src/apps/trone/routes/clients/actions.tsx', /caissesPourLaDate\(branchBoxes, payDate, cashbox\)/],
  ['src/apps/trone/routes/vente/Caisse.tsx', /caissesPourLaDate\(branchCashboxes, dateVente, cashbox\)/],
  ['src/apps/trone/routes/finances/Depenses.tsx', /caissesPourLaDate\(branchBoxes, form\.date \|\| todayISO\(\), form\.cashbox\)/],
  ['src/apps/trone/routes/vente/Factures.tsx', /caissesPourLaDate\(boxesBranche, p\.date, p\.cashbox\)/],
];
dit('encaisser, vendre, depenser, corriger une facture : la liste suit la date', ecransDate.map(() => true),
  ecransDate.map(([f, re]) => re.test(readFileSync(f, 'utf8'))));
const sync = readFileSync('src/shared/sync.ts', 'utf8');
dit('la synchronisation ecrit par tranches', true, /for \(let i = 0; i < upserts\.length; i \+= TRANCHE_D_ENVOI\)/.test(sync));
const caissesSrc = readFileSync('src/apps/trone/routes/finances/Caisses.tsx', 'utf8');
dit('l ecran des caisses ouvre octobre et montre les anciennes a part', true, /<BasculeDOctobre onClose=/.test(caissesSrc) && /Anciennes caisses · jusqu’au 30 sept\. 2026/.test(caissesSrc));
const tiroirs = readFileSync('src/apps/trone/routes/finances/tiroirs.tsx', 'utf8');
dit('une ancienne garde tout son passe, et sort de la tresorerie', true,
  /keepDemande\(mk\) && \(ancienne \|\| dansLesComptes\(mk, depuis\)\)/.test(tiroirs) && /!b\.horsBilan && !b\.jusquAu && soldeVisible/.test(tiroirs));
const bascule = readFileSync('src/apps/trone/routes/finances/bascule.ts', 'utf8');
dit('les cartes cadeaux ne sont pas reecrites (la base les fige)', false, /cartesCadeaux/.test(bascule));

console.log(ko === 0 ? '\nOuvrir octobre tient ce qui a ete decide.' : `\n${ko} controle(s) en echec.`);
