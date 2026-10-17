/* LA BASCULE APPLIQUÉE AUX VRAIS MAGASINS, ALLER ET RETOUR —
   `node scripts/verifie-la-bascule-appliquee.mjs`.

   4 octobre 2026. Le harnais pur éprouve la règle ; celui-ci éprouve la
   couture : les treize magasins réellement branchés par `bascule.ts`, la
   caisse neuve, le départ, puis le retour en arrière qui doit rendre CHAQUE
   magasin tel qu'il était. Données d'exemple. */
import { cashboxesStore, invoicesStore, expensesStore, transfertsStore, coffreStore, creditMovementsStore } from '../src/shared/finance';
import { appointmentsStore } from '../src/shared/agenda';
import { cloturesStore } from '../src/shared/caisse-du-soir';
import { advancesStore } from '../src/apps/trone/routes/equipe/payroll';
import { settingsStore } from '../src/shared/settings';
import { appliqueLaBascule, annuleLaBascule, resteAFaire } from '../src/apps/trone/routes/finances/bascule';
import { planPropose } from '../src/shared/bascule-des-caisses-pur';
import { fondsLaCaisse, defaisLaFusion, casesDeLaCaisse } from '../src/apps/trone/routes/finances/fusion';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu).slice(0, 220)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu).slice(0, 220)}`);
};
const B = 'br-1';
const as = <T>(x: unknown) => x as T;

cashboxesStore.set([
  { id: 'c1', branchId: B, name: 'Caisse principale', sub: '', glyph: '◈', openingXof: 50000 },
  { id: 'c2', branchId: B, name: 'Real Money', sub: '', glyph: '◈', openingXof: 0 },
  { id: 'c4', branchId: B, name: 'MoMo Brice', sub: '', glyph: '◉', openingXof: 0 },
  { id: 'c5', branchId: B, name: 'KkiaPay', sub: '', glyph: '◉', openingXof: 0 },
  { id: 'cx', branchId: 'autre', name: 'Real Money', sub: '', glyph: '◈', openingXof: 7 },
]);
invoicesStore.set(as([
  { id: 'f1', branchId: B, kind: 'facture', number: 'F1', clientId: 'x', date: '2026-09-20', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Real Money',
    payments: [{ id: 'p1', date: '2026-09-20', amountXof: 20000, method: 'Espèces', cashbox: 'Real Money' }, { id: 'p2', date: '2026-10-02', amountXof: 5000, method: 'MTN MoMo', cashbox: 'MoMo Brice' }] },
  { id: 'f-autre', branchId: 'autre', kind: 'facture', number: 'F9', clientId: 'x', date: '2026-09-20', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Real Money' },
]));
expensesStore.set(as([
  { id: 'e1', branchId: B, date: '2026-10-03', cashbox: 'Caisse principale', label: 'Produits', amountXof: 8000 },
  { id: 'e2', branchId: B, date: '2026-08-03', cashbox: 'KkiaPay', label: 'Frais', amountXof: 500 },
]));
transfertsStore.set(as([{ id: 't1', branchId: B, date: '2026-09-15', de: 'Caisse principale', vers: 'Real Money', montantXof: 1000 }]));
coffreStore.set(as([{ id: 'k1', branchId: B, date: '2026-09-30', kind: 'depot', amountXof: 3000, cashbox: 'Caisse principale' }]));
creditMovementsStore.set(as([{ id: 'cr1', branchId: B, date: '2026-09-29T10:00:00Z', kind: 'depot', amountXof: 2000, cashbox: 'KkiaPay' }]));
appointmentsStore.set(as([{ id: 'r1', branchId: B, clientId: 'x', date: '2026-10-01', payments: [{ id: 'ap1', date: '2026-10-01', amountXof: 4000, method: 'MTN MoMo', cashbox: 'MoMo Brice' }] }]));
cloturesStore.set(as([{ id: 'cl1', branchId: B, date: '2026-09-30', cashbox: 'Caisse principale', fondXof: 10000 }]));
advancesStore.set(as([{ id: 'av1', date: '27/09/2026', cashbox: 'Real Money', amountXof: 5000 }]));
settingsStore.set((p) => ({ ...p, caissesDepuis: undefined, basculeDesCaisses: undefined }));

const photo = () => JSON.stringify([invoicesStore.get(), expensesStore.get(), transfertsStore.get(), coffreStore.get(),
  creditMovementsStore.get(), appointmentsStore.get(), cloturesStore.get(), advancesStore.get()]);
const avant = photo();
const caissesAvant = JSON.stringify(cashboxesStore.get());

const plan = planPropose(cashboxesStore.get(), B, 'XOF');
dit('sans piece pour les ecritures d octobre de l ancienne, ouvrir octobre refuse', false, appliqueLaBascule(plan, B).ok);
dit('... et ne touche a rien', avant, photo());
plan.octobreVers['Caisse principale'] = 'Caisse du mois';
dit('avec sa piece, octobre s ouvre', true, appliqueLaBascule(plan, B, '2026-10-04T12:00:00Z').ok);

const f1 = invoicesStore.get().find((i) => i.id === 'f1')!;
dit('facture : septembre reste a Real Money, octobre passe au MoMo MTN', ['Real Money', 'Terrasse · MoMo MTN', 'Real Money'], [f1.payments![0].cashbox, f1.payments![1].cashbox, f1.cashbox]);
dit('la facture d une autre branche ne bouge pas', 'Real Money', invoicesStore.get().find((i) => i.id === 'f-autre')!.cashbox);
dit('depense d octobre vers la Caisse du mois, celle d aout reste a KkiaPay', ['Caisse du mois', 'KkiaPay'], expensesStore.get().map((e) => e.cashbox));
dit('transfert, coffre, avoir, cloture, avance de septembre : rien ne bouge', ['Caisse principale', 'Real Money', 'Caisse principale', 'KkiaPay', 'Caisse principale', 'Real Money'], [
  transfertsStore.get()[0].de, transfertsStore.get()[0].vers, coffreStore.get()[0].cashbox, creditMovementsStore.get()[0].cashbox,
  cloturesStore.get()[0].cashbox, advancesStore.get()[0].cashbox]);
dit('rendez-vous du 1er octobre : le versement passe a la suite du MoMo', 'Terrasse · MoMo MTN', appointmentsStore.get()[0].payments![0].cashbox);
const vivantes = cashboxesStore.get().filter((c) => c.branchId === B && !c.archiveeLe).map((c) => c.name).sort();
dit('toutes les caisses restent visibles, les neuves s ajoutent, pas d archive', [
  'Caisse du foyer', 'Caisse du mois', 'Caisse principale', 'KkiaPay', 'La Banque', 'La Cour', 'Le Grenier', 'MoMo Brice', 'Real Money',
  'Terrasse · MoMo MTN', 'Terrasse · MoMoPay société', 'Terrasse · Tiroir espèces',
].sort(), vivantes);
dit('les anciennes sont marquees jusqu au 30 septembre', ['Caisse principale', 'MoMo Brice', 'Real Money'],
  cashboxesStore.get().filter((c) => c.branchId === B && c.jusquAu === '2026-09-30').map((c) => c.name).sort());
dit('la caisse de l autre branche ne bouge pas', 'Real Money', cashboxesStore.get().find((c) => c.id === 'cx')!.name);
dit('le depart est pose en octobre 2026, la bascule datee', ['2026-10', '2026-10-04T12:00:00Z'], [settingsStore.get().caissesDepuis, settingsStore.get().basculeDesCaisses?.le]);
dit('plus rien a faire', { versLArchive: 0, deplacees: 0, manquantes: {} }, resteAFaire(plan, B));

/* Une dépense saisie APRÈS la bascule dans une caisse neuve : le retour la
   laisse où elle est, et sa caisse reste. */
expensesStore.set((p) => [...p, as({ id: 'e3', branchId: B, date: '2026-10-04', cashbox: 'Caisse du mois', label: 'Après', amountXof: 1 })]);
annuleLaBascule(B);
dit('la depense saisie apres la bascule garde sa caisse', 'Caisse du mois', expensesStore.get().find((e) => e.id === 'e3')?.cashbox);
expensesStore.set((p) => p.filter((e) => e.id !== 'e3'));
dit('retour : chaque magasin redevient exactement ce qu il etait', avant, photo());
const rendues = cashboxesStore.get();
dit('... les caisses reprennent noms et ouvertures', JSON.parse(caissesAvant).map((c: { name: string; openingXof: number }) => [c.name, c.openingXof]),
  rendues.filter((c) => ['c1', 'c2', 'c4', 'c5', 'cx'].includes(c.id)).map((c) => [c.name, c.openingXof]));
dit('... la Caisse du mois reste (une ecriture la nommait), les autres neuves s en vont', ['Caisse du mois'],
  rendues.filter((c) => c.creeeParLaBascule).map((c) => c.name));
dit('... et le depart d avant revient (aucun)', [undefined, undefined], [settingsStore.get().caissesDepuis, settingsStore.get().basculeDesCaisses]);

/* ── LA FUSION APPLIQUÉE AUX VRAIS MAGASINS — 17 octobre 2026 ──────
   « Reprise 2025 » fondue dans « Années passées », puis défaite : chaque
   magasin redevient ce qu'il était, l'autre branche ne bouge jamais. */
cashboxesStore.set((p) => [...p,
  { id: 'rp', branchId: B, name: 'Reprise 2025', sub: '', glyph: '◈', openingXof: 12000, jusquAu: '2026-09-30' },
  { id: 'rp-autre', branchId: 'autre', name: 'Reprise 2025', sub: '', glyph: '◈', openingXof: 3 }]);
invoicesStore.set((p) => [...p, as({ id: 'fr', branchId: B, kind: 'facture', number: 'F7', clientId: 'x', date: '2025-06-12', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Reprise 2025',
  payments: [{ id: 'pr', date: '2025-06-12', amountXof: 25000, method: 'Espèces', cashbox: 'Reprise 2025' }] }),
  as({ id: 'fr-autre', branchId: 'autre', kind: 'facture', number: 'F8', clientId: 'x', date: '2025-06-12', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Reprise 2025' })]);
expensesStore.set((p) => [...p, as({ id: 'er', branchId: B, date: '2026-02-03', cashbox: 'Reprise 2025', label: 'Rendu', amountXof: 1000 })]);
transfertsStore.set((p) => [...p, as({ id: 'tr', branchId: B, date: '2026-03-01', de: 'Reprise 2025', vers: 'Real Money', montantXof: 500 })]);
appointmentsStore.set((p) => [...p, as({ id: 'rr', branchId: B, clientId: 'x', date: '2025-06-12', payments: [{ id: 'arp', date: '2025-06-12', amountXof: 25000, method: 'Espèces', cashbox: 'Reprise 2025' }] })]);
const avantF = photo();
const caissesAvantF = JSON.stringify(cashboxesStore.get());
dit('avant la fusion : la branche nomme Reprise 2025 en 4 cases (miroir de la pièce à part)', 4, casesDeLaCaisse(B, 'Reprise 2025'));
fondsLaCaisse(B, 'Reprise 2025', 'Années passées', '2026-10-17T12:00:00Z');
const ap = cashboxesStore.get().find((c) => c.branchId === B && c.name === 'Années passées');
const rp = cashboxesStore.get().find((c) => c.id === 'rp');
dit('après : plus rien ne la nomme dans la branche', 0, casesDeLaCaisse(B, 'Reprise 2025'));
dit('... la pièce, son miroir, la dépense, le transfert, le carnet passent aux années passées', ['Années passées', 'Années passées', 'Années passées', 'Années passées', 'Années passées'], [
  as<{ cashbox: string }>(invoicesStore.get().find((i) => i.id === 'fr')).cashbox,
  as<{ payments: { cashbox: string }[] }>(invoicesStore.get().find((i) => i.id === 'fr')).payments[0].cashbox,
  as<{ cashbox: string }>(expensesStore.get().find((e) => e.id === 'er')).cashbox,
  as<{ de: string }>(transfertsStore.get().find((t) => t.id === 'tr')).de,
  as<{ payments: { cashbox: string }[] }>(appointmentsStore.get().find((r) => r.id === 'rr')).payments[0].cashbox]);
dit('... la caisse des années passées naît, garde son passé, reçoit l ouverture ; Reprise 2025 rangée', [true, true, 12000, '2026-10-17T12:00:00Z', 'Années passées'],
  [!!ap, ap?.histoire, ap?.openingXof, rp?.archiveeLe, rp?.fondueDans]);
dit('... l autre branche ne bouge pas', ['Reprise 2025', 'Reprise 2025', undefined],
  [as<{ cashbox: string }>(invoicesStore.get().find((i) => i.id === 'fr-autre')).cashbox, cashboxesStore.get().find((c) => c.id === 'rp-autre')?.name, cashboxesStore.get().find((c) => c.id === 'rp-autre')?.archiveeLe]);
defaisLaFusion(B, 'Reprise 2025');
dit('défaire : chaque magasin redevient exactement ce qu il était', avantF, photo());
dit('... Reprise 2025 revient avec son ouverture, les années passées la rendent', [12000, undefined, 0],
  [cashboxesStore.get().find((c) => c.id === 'rp')?.openingXof, cashboxesStore.get().find((c) => c.id === 'rp')?.archiveeLe,
    cashboxesStore.get().find((c) => c.branchId === B && c.name === 'Années passées')?.openingXof]);
dit('... et les caisses d avant sont là, plus la caisse des années passées', JSON.parse(caissesAvantF).length + 1, cashboxesStore.get().length);

console.log(ko === 0 ? '\nAller et retour, rien ne se perd.' : `\n${ko} controle(s) en echec.`);
