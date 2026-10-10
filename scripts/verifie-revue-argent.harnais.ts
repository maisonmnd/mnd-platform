/* LA REVUE DU 10 OCTOBRE 2026, LOT « ARGENT », EPROUVEE —
   `node scripts/verifie-revue-argent.mjs` (et `--prouve` pour remettre
   chaque faute une a une et voir le banc crier).

   Onze constats de la revue de code (n = 39 a 54), sur le VRAI code : le
   registre des encaissements, les echeances d'emprunt, les soldes de caisse
   (le hook `useCaisses`, rendu cote serveur sans navigateur), la bascule
   d'octobre appliquee aux vrais magasins, le depart des caisses, le solde du
   coffre, la cloture du soir, la date de la carte cadeau. Les attendus sont
   ECRITS EN DUR, jamais tires du code eprouve. Donnees d'exemple, aucune
   personne reelle. Sortie en ASCII (console Windows). */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import {
  cashboxesStore, expensesStore, entreesHorsActiviteStore, empruntsStore, creditMovementsStore, coffreStore,
  invoicesStore, transfertsStore,
  rendUneEcheance, defaitUneEcheance, poseUnEmprunt, sansLesInteretsDeLEcheance, soldeDuCoffre,
  soldeHorsActiviteDuTiroir, CATEGORIE_INTERETS,
  type Cashbox, type Emprunt, type Expense, type MouvementHorsActivite, type CoffreMovement,
} from '../src/shared/finance';
import { buildReceipts } from '../src/shared/receipts';
import { settingsStore } from '../src/shared/settings';
import { useCaisses } from '../src/apps/trone/routes/finances/tiroirs';
import { appliqueLaBascule, lisLesLots } from '../src/apps/trone/routes/finances/bascule';
import { planDeLaBasculeFaite, planPropose, type Plan } from '../src/shared/bascule-des-caisses-pur';
import { ouverturesAuDepart, ouverturesRendues, ouverturesARemettre } from '../src/shared/depart-des-caisses-pur';
import {
  tiroirsQuiSeComptent, tiroirsSansCloture, versementParDefaut, attenduDuTiroir, livreDeLaCloture, nouvelleCloture,
} from '../src/shared/caisse-du-soir-pur';
import { cartesCadeauxStore, type CarteCadeau } from '../src/shared/cartes-cadeaux';
import { encaisseLaCarte } from '../src/apps/trone/routes/vente/cartes-actions';

declare const __FAUTE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
const dit = (n: number, nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} #${n} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 200)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)?.slice(0, 200)}`);
};
const as = <T>(x: unknown) => x as T;

/* LA SOURCE TELLE QUE LE BANC DOIT LA LIRE : commentaires effaces (un mot
   dans un commentaire ne prouve rien), et, en preuve, la faute remise. */
const racine = process.cwd();
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const source = (rel: string): string => {
  let s = readFileSync(path.join(racine, rel), 'utf8');
  if (__FAUTE__ && __FAUTE__.fichier === rel) s = s.split(__FAUTE__.avant).join(__FAUTE__.apres);
  return sansCommentaires(s);
};
const contient = (rel: string, motif: RegExp) => motif.test(source(rel));

const B = 'maison';
const F = 'src/apps/trone/routes/finances/';
settingsStore.set((p) => ({ ...p, caissesDepuis: undefined, basculeDesCaisses: undefined }));

/* ── #39 UNE SORTIE N'EST PAS UN ENCAISSEMENT ─────────────────────────── */
{
  const base = { branchId: B, date: '2026-10-10', cashbox: 'Terrasse · Tiroir espèces' };
  const recus = buildReceipts(as({
    branchId: B, invoices: [], online: [], appointments: [], credits: [], formation: [], abonnements: [],
    nameOf: () => '', apptLabel: () => '',
    horsActivite: [
      { ...base, id: 's1', sens: 'sortie', motif: 'Remboursement d’emprunt', label: 'Banque · échéance 1 sur 12', amountXof: 166666 },
      { ...base, id: 's2', sens: 'sortie', motif: 'Prélèvement de l’associé', label: 'Associé · courses', amountXof: 50000 },
      { ...base, id: 'e1', motif: 'Prêt reçu', label: 'Banque', amountXof: 500000 },
      { ...base, id: 'e2', sens: 'entree', motif: 'Remboursement de l’associé', label: 'Associé', amountXof: 20000 },
    ],
  })).filter((r) => r.kind === 'hors-activite');
  dit(39, 'le registre ne garde que les entrees (sans sens, ou entree)', ['r-hors-e1', 'r-hors-e2'], recus.map((r) => r.id).sort());
  dit(39, 'une sortie de 166 666 F ne fait aucune ligne', 0, recus.filter((r) => r.amountXof === 166666).length);
}

/* ── #40 DEFAIRE UNE ECHEANCE N'EFFACE QUE SES INTERETS ───────────────── */
{
  const emp = (id: string, preteur: string, nombre: number): Emprunt => ({
    id, branchId: B, preteur, motif: '', date: '2026-09-01', recuXof: 1200000, aRendreXof: 1440000,
    cashbox: 'Caisse du mois', nombre, premier: '2026-10-01',
  });
  const A = emp('emp-a', 'Ecobank', 12);
  const Bp = emp('emp-b', 'Ecobank', 12);
  const C = emp('emp-c', 'Ecobank', 1);
  const D = emp('emp-d', 'Ecobank Bénin', 12);
  empruntsStore.set([A, Bp, C, D]);
  expensesStore.set([]);
  entreesHorsActiviteStore.set([]);
  rendUneEcheance(A, 2, 'Caisse du mois', '2026-10-10');
  rendUneEcheance(Bp, 2, 'Caisse du mois', '2026-10-10');
  rendUneEcheance(C, 1, 'Caisse du mois', '2026-10-10');
  rendUneEcheance(D, 1, 'Caisse du mois', '2026-10-10');
  const interets = () => expensesStore.get().filter((d) => d.category === CATEGORIE_INTERETS).map((d) => `${d.empruntId}:${d.echeance}:${d.amountXof}`).sort();
  dit(40, 'chaque echeance rendue porte son lien (emprunt, rang)', ['emp-a:2:20000', 'emp-b:2:20000', 'emp-c:1:240000', 'emp-d:1:20000'], interets());
  defaitUneEcheance(empruntsStore.get().find((e) => e.id === 'emp-a')!, 2);
  dit(40, 'defaire A (echeance 2) laisse les interets de B, meme preteur, meme nombre', ['emp-b:2:20000', 'emp-c:1:240000', 'emp-d:1:20000'], interets());
  defaitUneEcheance(empruntsStore.get().find((e) => e.id === 'emp-c')!, 1);
  dit(40, 'defaire « 1 sur 1 » d Ecobank laisse « 1 sur 12 » d Ecobank Benin', ['emp-b:2:20000', 'emp-d:1:20000'], interets());
  dit(40, 'la sortie hors activite de B reste aussi', 1, entreesHorsActiviteStore.get().filter((m) => m.empruntId === 'emp-b').length);

  /* Les interets d'AVANT le lien : libelle exact, et une seule dépense. */
  const vieille = (id: string, label: string): Expense => as({ id, branchId: B, label, amountXof: 20000, date: '2026-09-10', cashbox: 'Caisse du mois', category: CATEGORIE_INTERETS });
  const avant = [
    vieille('v1', 'Intérêts · Ecobank · échéance 2 sur 12'),
    vieille('v2', 'Intérêts · Ecobank · échéance 2 sur 12'),
    vieille('v3', 'Intérêts · Ecobank Bénin · échéance 2 sur 12'),
    vieille('v4', 'Intérêts · Ecobank · échéance 2 sur 120'),
  ];
  dit(40, 'sans lien : une seule des deux depenses au libelle identique part, ni « Ecobank Benin » ni « 2 sur 120 »',
    ['v2', 'v3', 'v4'], sansLesInteretsDeLEcheance(avant, A, 2).map((d) => d.id));
  /* REPRISE (relecture du 10 octobre 2026) : le repli par libelle ne prend
     qu'une depense SANS lien. Les interets d'un vieil emprunt A n'ont pas de
     lien ; ceux de B, rendus apres la correction, en ont un, sous le MEME
     libelle (meme preteur, meme nombre). Ceux de B passent en premier :
     defaire A ne retire que les siens. */
  const lieeB: Expense = as({ id: 'b-liee', branchId: B, label: 'Intérêts · Ecobank · échéance 2 sur 12', amountXof: 20000, date: '2026-10-10', cashbox: 'Caisse du mois', category: CATEGORIE_INTERETS, empruntId: 'emp-b', echeance: 2 });
  dit(40, 'repli sans lien : la depense liee a B, au meme libelle et placee avant, reste ; seule v1 part',
    ['b-liee'], sansLesInteretsDeLEcheance([lieeB, vieille('v1', 'Intérêts · Ecobank · échéance 2 sur 12')], A, 2).map((d) => d.id));
  dit(40, 'repli sans lien : sans depense d A, celle de B ne part jamais', ['b-liee'], sansLesInteretsDeLEcheance([lieeB], A, 2).map((d) => d.id));
}

/* ── #42 ET #54 LES SOLDES DES TIROIRS (le hook, rendu sans navigateur) ── */
const TIROIR = 'Terrasse · Tiroir espèces';
const MOMO = 'Terrasse · MoMoPay société';
const USD = 'Caisse USD';
let caisses: ReturnType<typeof useCaisses> | undefined;
const lis = (mois = '2026-10') => {
  function Sonde() { caisses = useCaisses(mois); return null; }
  renderToString(createElement(Sonde));
  return caisses!;
};
{
  cashboxesStore.set(as<Cashbox[]>([
    { id: 'c1', branchId: B, name: TIROIR, sub: 'Espèces du comptoir', glyph: '◈', openingXof: 100000 },
    { id: 'c2', branchId: B, name: MOMO, sub: 'MTN MoMoPay', glyph: '◉', openingXof: 0 },
    { id: 'c3', branchId: B, name: USD, sub: '', glyph: '$', openingXof: 0, currency: 'USD' },
  ]));
  expensesStore.set([]); entreesHorsActiviteStore.set([]); empruntsStore.set([]); creditMovementsStore.set([]);
  coffreStore.set([]); invoicesStore.set([]); transfertsStore.set([]);
  dit(42, 'au depart, le tiroir vaut son ouverture', 100000, lis().boxBalance(TIROIR));

  const mv = (o: Partial<MouvementHorsActivite>): MouvementHorsActivite => as({ id: `h-${Math.random()}`, branchId: B, date: '2026-10-10', label: 'Associé A.', cashbox: TIROIR, ...o });
  entreesHorsActiviteStore.set([mv({ id: 'p1', sens: 'sortie', motif: 'Prélèvement de l’associé', amountXof: 50000 })]);
  dit(42, 'un prelevement de 50 000 F fait baisser le tiroir de 50 000 F', 50000, lis().boxBalance(TIROIR));

  poseUnEmprunt({ branchId: B, preteur: 'Banque', motif: 'Fauteuil', date: '2026-10-10', recuXof: 2000000, aRendreXof: 2400000, cashbox: TIROIR, nombre: 12, premier: '2026-10-10' });
  dit(42, 'un pret recu de 2 000 000 F le fait monter', 2050000, lis().boxBalance(TIROIR));

  rendUneEcheance(empruntsStore.get()[0], 1, TIROIR, '2026-10-10');
  dit(42, 'une echeance rendue retire principal + interets (166 666 + 33 333)', 1850001, lis().boxBalance(TIROIR));

  entreesHorsActiviteStore.set((p) => [...p, mv({ id: 'r1', sens: 'entree', motif: 'Remboursement de l’associé', amountXof: 20000 })]);
  const c = lis();
  dit(42, 'le remboursement de l associe remonte le tiroir', 1870001, c.boxBalance(TIROIR));
  dit(42, 'le flux du mois dit les deux sens', { inn: 2020000, out: 249999 }, c.boxMonthFlux(TIROIR));
  const jour = c.boxMoves(TIROIR, { de: '2026-10-10', a: '2026-10-10' });
  dit(42, 'le releve d un jour tombe sur le solde (la cloture lit ce chiffre)', [100000, 1870001, 1770001],
    [jour.startBalance, jour.balance, jour.moves.reduce((s, m) => s + m.delta, 0)]);
  dit(42, 'la cloture du soir attend ce que le tiroir contient', 1870001, attenduDuTiroir({ livreMaintenantXof: jour.balance }));
  dit(42, 'le releve du mois aussi', 1870001, c.boxMoves(TIROIR).balance);

  /* Une cloture d'AVANT la correction a retenu un livre sans hors activite
     (ouverture 100 000 - interets 33 333 = 66 667) et le compte reel du
     tiroir (1 870 001). Le lendemain, rien n'a bouge : l'attendu doit etre ce
     qui a ete laisse, pas 1 803 334 F de plus. */
  dit(42, 'le hors activite du tiroir jusqu au 10 octobre 2026 (rien le 9)', [1803334, 0],
    [c.horsActiviteJusquAu(TIROIR, '2026-10-10'), c.horsActiviteJusquAu(TIROIR, '2026-10-09')]);
  const vieilleCloture = { livreXof: 66667, laisseXof: 1870001 };
  dit(42, 'le lendemain d une cloture d avant, l attendu reste ce qui a ete laisse', 1870001,
    attenduDuTiroir({ livreMaintenantXof: 1870001, derniere: { ...vieilleCloture, livreXof: livreDeLaCloture(vieilleCloture, c.horsActiviteJusquAu(TIROIR, '2026-10-10')) } }));
  dit(42, 'une cloture d apres porte sa marque, et son livre ne se retouche pas', [true, 5],
    [nouvelleCloture({ id: 'x', branchId: B, cashbox: TIROIR, date: '2026-10-10', attenduXof: 0, compteXof: 0, fondXof: 0, verseAuCoffreXof: 0, livreAvantCoffreXof: 0, par: 'A.', le: '2026-10-10T20:00:00Z' }).livreAvecHorsActivite,
      livreDeLaCloture({ livreXof: 5, livreAvecHorsActivite: true }, 999)]);
  dit(42, 'la cloture du soir remet le livre d avant a la meme mesure', true,
    contient(F + 'ClotureDuTiroir.tsx', /livreXof: livreDeLaCloture\(derniereBrute, caisses\.horsActiviteJusquAu\(box\.name, derniereBrute\.date\)\)/));
  dit(42, 'chaque mouvement hors activite a sa ligne au releve', ['Prélèvement de l’associé', 'Prêt reçu', 'Remboursement de l’associé', 'Remboursement d’emprunt'],
    jour.moves.filter((m) => /hors activit/.test(m.sub)).map((m) => m.label.split(' · ')[0]).sort());

  entreesHorsActiviteStore.set((p) => [...p, mv({ id: 'u1', motif: 'Apport du souverain', amountXof: 10000, cashbox: USD })]);
  const u = lis().boxMoves(USD);
  dit(42, 'sans montant en dollars, une entree ne pese rien sur un tiroir USD, et le releve le dit', [0, true],
    [u.balance, u.moves.some((m) => /montant en USD non renseign/.test(m.sub))]);
  dit(42, 'le calcul pur : une autre branche ou un autre tiroir ne comptent pas', -50000,
    soldeHorsActiviteDuTiroir([mv({ sens: 'sortie', amountXof: 50000 }), mv({ amountXof: 9, branchId: 'autre' }), mv({ amountXof: 7, cashbox: MOMO })], B, TIROIR, () => true, 'XOF', 'XOF'));

  /* #54 : un depot d'avoir date en ISO complet (KkiaPay, ou une carte vendue
     avant la correction) reste dans la periode d'un jour. */
  creditMovementsStore.set(as([{ id: 'cre-x', branchId: B, holderType: 'carte', holderId: 'cc-x', kind: 'depot', amountXof: 25000, date: '2026-10-10T13:22:11.000Z', cashbox: MOMO, method: 'Mobile Money' }]));
  const m = lis();
  const jourMomo = m.boxMoves(MOMO, { de: '2026-10-10', a: '2026-10-10' });
  dit(54, 'un depot date « 2026-10-10T13:22Z » compte dans le jour du 10 octobre 2026', [25000, 25000, 0],
    [m.boxBalance(MOMO), jourMomo.balance, jourMomo.startBalance]);
}

/* ── #54 LA CARTE VENDUE AU COMPTOIR SE DATE DU JOUR LOCAL ────────────── */
{
  /* 23 h 30 UTC le 9 octobre = 0 h 30 le 10 octobre a Cotonou (le lanceur
     pose TZ=Africa/Lagos, UTC+1, le fuseau du Benin). */
  (globalThis as unknown as { __horloge: number }).__horloge = Date.parse('2026-10-09T23:30:00Z');
  creditMovementsStore.set([]);
  cartesCadeauxStore.set([]);
  const carte = as<CarteCadeau>({ id: 'cc-1', branchId: B, creeLe: '2026-10-09T23:29:00Z', origine: 'trone', objet: 'montant', modele: 'ivoire', pour: 'A.', de: 'B.', remise: 'imprimee', telephone: '', statut: 'a-regler' });
  cartesCadeauxStore.set([carte]);
  encaisseLaCarte(carte, { montantXof: 30000, cashbox: TIROIR, methode: 'Espèces' });
  dit(54, 'le depot de la carte est date du 10 octobre 2026, jour local, sans heure', '2026-10-10', creditMovementsStore.get()[0]?.date);
  dit(54, 'l heure exacte reste sur la carte', '2026-10-09T23:30:00.000Z', cartesCadeauxStore.get()[0]?.payeLe);
  (globalThis as unknown as { __horloge: number }).__horloge = Date.parse('2026-10-10T12:00:00Z');
}

/* ── #43 LA RELANCE DE LA BASCULE REPART DES CHOIX FAITS ──────────────── */
{
  const BB = 'br-bascule';
  settingsStore.set((p) => ({ ...p, caissesDepuis: undefined, basculeDesCaisses: undefined }));
  cashboxesStore.set(as<Cashbox[]>([
    { id: 'k1', branchId: BB, name: 'BIIC', sub: 'Banque', glyph: '▥', openingXof: 0 },
    { id: 'k2', branchId: BB, name: 'MoMo Brice', sub: '', glyph: '◉', openingXof: 0 },
    { id: 'k3', branchId: BB, name: 'Caisse principale', sub: '', glyph: '◈', openingXof: 30000 },
  ]));
  const dep = (id: string, cashbox: string, date: string): Expense => as({ id, branchId: BB, label: 'x', amountXof: 1000, date, cashbox, category: 'Divers' });
  expensesStore.set([dep('d1', 'Caisse principale', '2026-10-02'), dep('d2', 'MoMo Brice', '2026-10-02')]);
  entreesHorsActiviteStore.set([]); invoicesStore.set([]); transfertsStore.set([]); coffreStore.set([]); creditMovementsStore.set([]); empruntsStore.set([]);

  const plan = planPropose(cashboxesStore.get(), BB, 'XOF');
  plan.destins.BIIC = { sort: 'garder', role: 'banque' };
  plan.octobreVers['Caisse principale'] = 'Caisse du mois';
  dit(43, 'premiere bascule : BIIC gardee comme Banque', true, appliqueLaBascule(plan, BB, '2026-10-04T12:00:00Z').ok);
  const garde = () => settingsStore.get().basculeDesCaisses?.plans?.[BB];
  dit(43, 'le plan applique est garde dans les reglages, sous sa branche', { BIIC: 'garder:banque', cp: 'Caisse du mois' },
    { BIIC: `${garde()?.destins.BIIC?.sort}:${(garde()?.destins.BIIC as { role?: string } | undefined)?.role}`,
      cp: garde()?.octobreVers['Caisse principale'] });

  /* Deux ecritures d'octobre saisies APRES, sur deux anciennes. */
  expensesStore.set((p) => [...p, dep('d3', 'Caisse principale', '2026-10-06'), dep('d4', 'MoMo Brice', '2026-10-06')]);
  const verifieLaRelance = (titre: string, enregistres: Record<string, Plan> | undefined) => {
    const photo = JSON.stringify([cashboxesStore.get(), expensesStore.get(), settingsStore.get()]);
    const p2 = planDeLaBasculeFaite(cashboxesStore.get(), BB, lisLesLots(BB), enregistres);
    dit(43, `${titre} : un plan est rendu`, true, !!p2);
    const r = p2 ? appliqueLaBascule(p2, BB, '2026-10-09T12:00:00Z') : { ok: false };
    const bx = cashboxesStore.get().filter((c) => c.branchId === BB);
    dit(43, `${titre} : la relance passe`, true, r.ok);
    dit(43, `${titre} : BIIC reste vivante, sans « jusqu au »`, undefined, bx.find((c) => c.name === 'BIIC')?.jusquAu);
    dit(43, `${titre} : « La Banque » ne nait pas`, false, bx.some((c) => c.name === 'La Banque'));
    dit(43, `${titre} : les ecritures d octobre suivent les choix faits`, { d3: 'Caisse du mois', d4: 'Terrasse · MoMo MTN' },
      { d3: expensesStore.get().find((d) => d.id === 'd3')?.cashbox, d4: expensesStore.get().find((d) => d.id === 'd4')?.cashbox });
    /* Chaque relance repart du meme etat : la suivante ne doit rien a celle-ci. */
    const [cb, ex, st] = JSON.parse(photo);
    cashboxesStore.set(cb); expensesStore.set(ex); settingsStore.set(st);
  };
  verifieLaRelance('plan garde', settingsStore.get().basculeDesCaisses?.plans);
  /* La bascule du 4 octobre n'a pas garde de plan : il se relit dans les caisses et les ecritures. */
  verifieLaRelance('plan relu dans les caisses', undefined);
  dit(43, 'le pur : sans plan garde, BIIC se relit gardee, MoMo Brice avec sa suite, Caisse principale vers sa piece',
    { BIIC: 'garder', MoMo: 'suite', CP: 'Caisse du mois' },
    (() => { const p = planDeLaBasculeFaite(cashboxesStore.get(), BB, lisLesLots(BB)); return { BIIC: p?.destins.BIIC?.sort, MoMo: p?.destins['MoMo Brice']?.sort, CP: p?.octobreVers['Caisse principale'] }; })());
  dit(43, 'l ecran repart du plan de LA BRANCHE, la proposition seulement pour une branche que la bascule n a pas touchee', true,
    contient(F + 'BasculeDOctobre.tsx', /faite && planDeLaBasculeFaite\(toutes, branch\.id, lisLesLots\(branch\.id\), faite\.plans\)\)\s*\|\|\s*planPropose\(/));

  /* REPRISE (relecture du 10 octobre 2026) : UN PLAN PAR BRANCHE. Le plan
     garde valait pour toute la Maison ; une deuxieme branche aurait repris
     celui de la premiere (destins aux noms de ses caisses), et ses anciennes
     n'auraient eu aucun destin. */
  const BC = 'br-seconde';
  cashboxesStore.set((p) => [...p, ...as<Cashbox[]>([
    { id: 'm1', branchId: BC, name: 'Caisse Akpakpa', sub: '', glyph: '◈', openingXof: 0 },
    { id: 'm2', branchId: BC, name: 'MoMo Akpakpa', sub: '', glyph: '◉', openingXof: 0 },
  ])]);
  const plansAvant = JSON.stringify(settingsStore.get().basculeDesCaisses?.plans?.[BB]);
  dit(43, 'une branche que la bascule n a jamais touchee : aucun plan relu (l ecran propose)', undefined,
    planDeLaBasculeFaite(cashboxesStore.get(), BC, lisLesLots(BC), settingsStore.get().basculeDesCaisses?.plans));
  const planC = planPropose(cashboxesStore.get(), BC, 'XOF');
  dit(43, 'la bascule de la seconde branche passe', true, appliqueLaBascule(planC, BC, '2026-10-12T12:00:00Z').ok);
  const plans = settingsStore.get().basculeDesCaisses?.plans;
  dit(43, 'chaque branche garde son plan, celui de la premiere intact', [[BB, BC], true],
    [Object.keys(plans ?? {}).sort(), JSON.stringify(plans?.[BB]) === plansAvant]);
  const relC = planDeLaBasculeFaite(cashboxesStore.get(), BC, lisLesLots(BC), plans);
  dit(43, 'la seconde branche relit SES caisses, jamais BIIC ni Caisse principale', ['Caisse Akpakpa', 'MoMo Akpakpa'],
    Object.keys(relC?.destins ?? {}).sort());
  const relB = planDeLaBasculeFaite(cashboxesStore.get(), BB, lisLesLots(BB), plans);
  dit(43, 'et la premiere relit les siennes', ['BIIC', 'Caisse principale', 'MoMo Brice'], Object.keys(relB?.destins ?? {}).sort());
  /* Un plan garde sous une AUTRE branche ne sert jamais : la branche qui a
     sa trace dans les caisses se relit elle-meme. */
  dit(43, 'un plan garde seulement sous la premiere ne sert pas a la seconde', ['Caisse Akpakpa', 'MoMo Akpakpa'],
    Object.keys(planDeLaBasculeFaite(cashboxesStore.get(), BC, lisLesLots(BC), { [BB]: plans![BB] })?.destins ?? {}).sort());
  dit(43, 'l ecran offre de choisir la piece d une ancienne qui en manque', true,
    contient(F + 'BasculeDOctobre.tsx', /manquent\.map\(\(nom\) =>[\s\S]*?poseOctobre\(nom,/));
  settingsStore.set((p) => ({ ...p, caissesDepuis: undefined, basculeDesCaisses: undefined }));
}

/* ── #44 LE DEPART DES CAISSES GARDE LES ANCIENNES ET SA TRACE ────────── */
{
  const cx = as<Cashbox[]>([
    { id: 'a', branchId: B, name: 'Tiroir', sub: '', glyph: '', openingXof: 40000 },
    { id: 'b', branchId: B, name: 'Ancienne', sub: '', glyph: '', openingXof: 75000, jusquAu: '2026-09-30' },
    { id: 'c', branchId: B, name: 'Rangée', sub: '', glyph: '', openingXof: 5000, archiveeLe: '2026-10-04' },
    { id: 'd', branchId: 'autre', name: 'Tiroir', sub: '', glyph: '', openingXof: 9000 },
  ]);
  dit(44, 'l ecran ne nomme que la caisse en cours de la branche', ['Tiroir'], ouverturesARemettre(cx, B).map((c) => c.name));
  const parti = ouverturesAuDepart(cx, B);
  dit(44, 'le depart remet a 0 la caisse en cours, jamais l ancienne, la rangee ni l autre branche', [0, 75000, 5000, 9000], parti.map((c) => c.openingXof));
  dit(44, 'la valeur effacee est gardee', 40000, parti[0].ouvertureAvantDepart);
  dit(44, 'compter depuis toujours la rend', [40000, undefined], (() => { const r = ouverturesRendues(parti, B)[0]; return [r.openingXof, r.ouvertureAvantDepart]; })());
  const ressaisie = parti.map((c) => (c.id === 'a' ? { ...c, openingXof: 12000 } : c));
  dit(44, 'une ouverture ressaisie depuis garde le dernier mot', [12000, 40000], (() => { const r = ouverturesRendues(ressaisie, B)[0]; return [r.openingXof, r.ouvertureAvantDepart]; })());
  dit(44, 'l ecran passe par ces deux portes', true,
    contient(F + 'DepartDesCaisses.tsx', /ouverturesAuDepart\(prev, branch\.id\)/) && contient(F + 'DepartDesCaisses.tsx', /ouverturesRendues\(prev, branch\.id\)/));
}

/* ── #45 UN SEUL SOLDE DU COFFRE ──────────────────────────────────────── */
{
  const k = (o: Partial<CoffreMovement>): CoffreMovement => as({ id: `k${Math.random()}`, branchId: B, kind: 'depot', amountXof: 0, date: '2026-09-15', ...o });
  const moves = [k({ amountXof: 1200000 }), k({ date: '2026-10-05', amountXof: 300000 }), k({ date: '2026-10-06', amountXof: 50000, fx: { code: 'EUR', rate: 655.957, amount: 76 } })];
  dit(45, 'apres la bascule, le depot de septembre ne compte plus (devise exclue)', 300000,
    soldeDuCoffre(moves, { caissesDepuis: '2026-10', basculeDesCaisses: { le: '2026-10-04' } }));
  dit(45, 'sans bascule, tout l historique en francs', 1500000, soldeDuCoffre(moves, { caissesDepuis: '2026-10' }));
  dit(45, 'Objectifs, Partage et Coffre lisent la meme porte', [true, true, true, false, false],
    [contient(F + 'objectifs.tsx', /const balance = soldeDuCoffre\(moves, reglages\)/),
      contient(F + 'SalonFoyer.tsx', /soldeDuCoffre\(coffre\.filter\(\(m\) => m\.branchId === branch\.id\), reglages\)/),
      contient(F + 'Coffre.tsx', /const balance = soldeDuCoffre\(moves, reglagesCoffre\)/),
      contient(F + 'objectifs.tsx', /\bcoffreBalance\(/), contient(F + 'SalonFoyer.tsx', /\bcoffreBalance\(/)]);
}

/* ── #46 LA CASE DU COFFRE N'EST COCHEE QUE POUR DES BILLETS ──────────── */
{
  dit(46, 'MoMoPay societe : pas de versement par defaut', false, versementParDefaut({ name: 'Terrasse · MoMoPay société', sub: 'MTN MoMoPay' }));
  dit(46, 'MoMo MTN : non plus', false, versementParDefaut({ name: 'Terrasse · MoMo MTN', sub: 'Suite de MoMo Brice' }));
  dit(46, 'le tiroir especes : oui', true, versementParDefaut({ name: 'Terrasse · Tiroir espèces' }));
  dit(46, 'une reference « Especes du comptoir » suffit', true, versementParDefaut({ name: 'Comptoir', sub: 'Espèces du comptoir' }));
  dit(46, 'la cloture lit cette regle pour le versement et pour la case', [true, true, false],
    [contient(F + 'ClotureDuTiroir.tsx', /const coche = versement \?\? versementParDefaut\(box\)/),
      contient(F + 'ClotureDuTiroir.tsx', /checked=\{coche\}/),
      contient(F + 'ClotureDuTiroir.tsx', /versement \?\? (true|surplus)/)]);
}

/* ── #48 UNE CAISSE HORS BILAN N'EST PAS UN OUBLI ─────────────────────── */
{
  const boites = [
    { branchId: B, name: 'Terrasse · Tiroir espèces' },
    { branchId: B, name: 'Caisse du foyer', horsBilan: true },
    { branchId: B, name: 'Foyer · Wells Fargo', horsBilan: true },
    { branchId: B, name: 'Pourboires' }, { branchId: B, name: 'KkiaPay' },
  ];
  dit(48, 'les tiroirs qui se comptent', ['Terrasse · Tiroir espèces'], tiroirsQuiSeComptent(boites, B).map((b) => b.name));
  const oublies = tiroirsSansCloture({
    branchId: B, date: '2026-10-09',
    registre: [{ date: '2026-10-09', cashbox: 'Terrasse · Tiroir espèces' }, { date: '2026-10-09', cashbox: 'Foyer · Wells Fargo' }],
    depenses: [{ branchId: B, date: '2026-10-09', cashbox: 'Caisse du foyer' }],
    clotures: [],
    seComptent: new Set(tiroirsQuiSeComptent(boites, B).map((b) => b.name)),
  });
  dit(48, 'le foyer qui a bouge hier ne sort pas en oubli', ['Terrasse · Tiroir espèces'], oublies);
  /* REPRISE (relecture du 10 octobre 2026) : une sortie hors activite
     n'entre plus au registre (#39) mais fait baisser le tiroir (#42). Un jour
     ou il n'y a qu'un prelevement de l'associe, ou une echeance sans
     interets (aucune depense), le tiroir A BOUGE. */
  const h = (o: Record<string, unknown>) => as<MouvementHorsActivite>({ id: 'h', branchId: B, date: '2026-10-09', label: 'x', cashbox: 'Terrasse · Tiroir espèces', amountXof: 50000, sens: 'sortie', motif: 'Prélèvement de l’associé', ...o });
  const seuls = (horsActivite: MouvementHorsActivite[]) => tiroirsSansCloture({
    branchId: B, date: '2026-10-09', registre: [], depenses: [], clotures: [], horsActivite,
    seComptent: new Set(['Terrasse · Tiroir espèces', 'Terrasse · MoMoPay société']),
  });
  dit(39, 'un prelevement de 50 000 F, seul mouvement du jour : le tiroir a bouge', ['Terrasse · Tiroir espèces'], seuls([h({})]));
  dit(39, 'une echeance sans interets (sortie seule) : le MoMo a bouge, une entree aussi',
    ['Terrasse · MoMoPay société', 'Terrasse · Tiroir espèces'],
    seuls([h({ cashbox: 'Terrasse · MoMoPay société', motif: 'Remboursement d’emprunt' }), h({ sens: 'entree', motif: 'Remboursement de l’associé' })]));
  dit(39, 'ni une autre branche, ni un autre jour, ni un montant nul, ni le foyer hors bilan', [],
    seuls([h({ branchId: 'autre' }), h({ date: '2026-10-08' }), h({ amountXof: 0 }), h({ cashbox: 'Caisse du foyer' })]));
  dit(39, 'une cloture du jour leve l oubli', [], tiroirsSansCloture({
    branchId: B, date: '2026-10-09', registre: [], depenses: [], horsActivite: [h({})],
    clotures: [{ branchId: B, cashbox: 'Terrasse · Tiroir espèces', date: '2026-10-09' }],
  }));
  dit(39, 'la fenetre de cloture et l alerte de la veille lui passent le hors activite', [true, true],
    [contient(F + 'ClotureDuTiroir.tsx', /tiroirsSansCloture\(\{[^}]*\bhorsActivite,\s*\}\)\), \[[^\]]*\bhorsActivite\]/),
      contient(F + 'LaVeilleAValider.tsx', /tiroirsSansCloture\(\{[^}]*\bhorsActivite,\s*\}\), \[[^\]]*\bhorsActivite\]/)]);
  dit(48, 'l alerte de la veille et la cloture partagent la regle', [true, true],
    [contient(F + 'LaVeilleAValider.tsx', /seComptent: new Set\(tiroirsQuiSeComptent\(boxes, branch\.id\)/),
      contient(F + 'ClotureDuTiroir.tsx', /const tiroirs = tiroirsQuiSeComptent\(branchBoxes, branch\.id\)/)]);
}

/* ── #49 AUJOURD'HUI N'EST JAMAIS LA DATE UTC, AUX FINANCES ───────────── */
{
  const UTC_DU_JOUR = new RegExp(String.raw`new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)`);
  const fautifs = readdirSync(path.join(racine, F)).filter((f) => /\.tsx?$/.test(f))
    .filter((f) => UTC_DU_JOUR.test(source(F + f)));
  dit(49, 'aucun ecran des Finances ne prend « aujourd hui » en UTC', [], fautifs);
}

console.log(ko === 0 ? '\nLot argent : tout tient.' : `\n${ko} controle(s) en echec.`);
