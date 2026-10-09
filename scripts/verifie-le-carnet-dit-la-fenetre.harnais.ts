/* LE CARNET DIT LA FENETRE, EPROUVE — `node scripts/verifie-le-carnet-dit-la-fenetre.mjs`
   (et `--prouve` pour le rejouer sur le code d'avant la correction).

   Le cas du 9 octobre 2026 (K. K.) : honorer son rituel du 9 octobre a pose sa
   reprise du 19 decembre 2026, nee sans prix (shared/reprise-nue). La fenetre
   du rendez-vous la lisait au tarif de SA tete, 40 000 F (SINSIN a son calibre
   Micro, le Souffle offert avec elle). Le Carnet, la caisse et la facture la
   lisaient au prix de vitrine, 28 000 F. Le prix paye dependait du bouton.

   LA REGLE (decision du 9 octobre 2026) : un rendez-vous a venir sans prix
   enregistre se lit au tarif de sa tete, par un seul calcul, partout ; ce prix
   se fige au premier geste qui engage de l'argent. Le passe ne bouge pas.

   Les donnees sont reconstruites a la main d'apres les vrais types, et TOUS
   les attendus sont ecrits en dur : jamais tires du code eprouve. */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as S from '../src/apps/trone/routes/clients/_shared';
import { apptTotalXof, apptNetXof, apptDueXof, tarifsDuRituel } from '../src/apps/trone/routes/clients/_shared';
import { honorAppointment, honoreSansEncaisser, resetAllPaidInvoices, cancelAppointmentPayment, rewindPaymentForDeletedInvoice } from '../src/apps/trone/routes/clients/actions';
import { appointmentsStore, type Appointment } from '../src/shared/agenda';
import { sansLaVisite } from '../src/shared/reprise-nue';
import { clientsStore, type Client } from '../src/shared/clients';
import { servicesStore, categoriesStore, productsStore, type Service } from '../src/shared/catalog';
import { modelBandsStore, bandSetsStore, type ModelBand } from '../src/shared/pricing';
import { invoicesStore, invoiceTotal, type Invoice } from '../src/shared/finance';

declare const __PROUVE__: boolean;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

let ko = 0;
/* La console Windows parle cp1252 : tout ce qui sort est ramene a l'ASCII. */
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`));
  if (!ok) console.log(ascii(`       attendu ${JSON.stringify(attendu)}`));
};
const saute = (nom: string) => console.log(`SAUTE ${nom} (absent du code d avant)`);
/* Les nouveautes se lisent par leur nom : le code d'avant ne les a pas, et un
   import nomme ferait echouer la construction de la preuve. */
const nouveau = (nom: string): Any => (S as Record<string, unknown>)[nom] ?? (() => `ABSENT ${nom}`);
const horloge = (iso: string) => { (globalThis as Any).__horloge = Date.parse(`${iso}T12:00:00Z`); };

/* ── Le barème, le catalogue, la fiche ── */
const BANDS: ModelBand[] = [
  { id: 'cal-medium', name: 'Medium', maxLocks: 150, coef: 1, durCoef: 1 },
  { id: 'cal-mini', name: 'Mini', maxLocks: 250, coef: 1.4, durCoef: 1.4 },
  { id: 'cal-micro', name: 'Micro', maxLocks: 350, coef: 1.8, durCoef: 1.9 },
  { id: 'cal-nano', name: 'Nano', maxLocks: 450, coef: 2.2, durCoef: 2.4 },
  { id: 'cal-galaxy', name: 'Galaxy', maxLocks: null, coef: 2.8, durCoef: 2.8 },
];
const PLANCHERS = { 'cal-medium': 25_000, 'cal-mini': 35_000, 'cal-micro': 40_000, 'cal-nano': 45_000, 'cal-galaxy': 55_000 };
const SINSIN = {
  id: 'sv-sinsin', categoryId: 'cat-sinsin', name: 'SINSIN Essentiel', palier: 'Fondation',
  priceXof: 20_000, hidePrice: false, priceMode: 'variable', tarifMode: 'calibre',
  priceFloors: PLANCHERS, sessions: 1, master: '', durationMin: 120, order: 1,
} as unknown as Service;
const SOUFFLE = {
  id: 'sv-souffle', categoryId: 'cat-plt', name: 'KLOKLO Essentiel, Le Souffle', palier: 'Fondation',
  priceXof: 8_000, hidePrice: false, prixParLongueur: { court: 8_000, 'mi-long': 10_000, long: 12_000 },
  offertAvec: { serviceIds: ['sv-sinsin'] }, sessions: 1, master: '', durationMin: 30, order: 2,
} as unknown as Service;
let services: Service[] = [SINSIN, SOUFFLE];
let byId = new Map(services.map((s) => [s.id, s] as const));
modelBandsStore.set(BANDS);
bandSetsStore.set({});
categoriesStore.set([]);
productsStore.set([]);
servicesStore.set(services);

const KK = {
  id: 'kk', branchId: 'b', name: 'K. K.', phone: '+22966000099', city: '', persona: 'p', since: '2026-02-01',
  segments: [], priceCoef: 1, loyaltyPoints: 0, lockCount: 331, rythmeSemaines: 10, joursPreferes: [6],
} as unknown as Client;
const RDV_0910 = {
  id: 'kk-0910', branchId: 'b', clientId: 'kk', clientName: 'K. K.', serviceIds: ['sv-sinsin', 'sv-souffle'],
  date: '2026-10-09', time: '10:00', master: 'Team', status: 'confirmé', priceXof: 35_000,
} as unknown as Appointment;
/* Chaque bloc repart de magasins remis a neuf : une reprise posee dans l'un
   ne fausse pas les gardes du suivant. */
const neuf = (fiches: Client[], rdvs: Appointment[]) => {
  clientsStore.set(fiches);
  appointmentsStore.set(rdvs);
  invoicesStore.set([]);
};
const ctx = (fiche: Client) => ({ client: fiche, bands: BANDS, sets: {}, cats: [], byId, tousServices: services, produits: [] });
const carnet = (a: Appointment): number => (__PROUVE__ ? apptTotalXof(a, byId) : nouveau('montantDuCarnet')(a, byId).montant);
const lu = (id: string) => appointmentsStore.get().find((a) => a.id === id) as Appointment;
const lignes = (f?: Invoice) => f?.lines.map((l) => [l.label, l.unitXof, l.discountPct ?? 0]);
/* Une reprise telle que la cloture la pose : nue, a venir, sans prix. */
const repriseNue = (plus: Partial<Appointment> = {}) => ({
  id: 'kk-1219', branchId: 'b', clientId: 'kk', clientName: 'K. K.', serviceIds: ['sv-sinsin', 'sv-souffle'],
  date: '2026-12-19', time: '10:00', master: 'Team', status: 'confirmé', source: 'trone', repriseDe: 'kk-0910', ...plus,
} as unknown as Appointment);

/* ── 1. L'honneur du 9 octobre 2026 ── */
horloge('2026-10-09');
neuf([KK], [RDV_0910]);
honorAppointment(lu('kk-0910'), byId, { muet: true });
const R = appointmentsStore.get().find((a) => a.repriseDe === 'kk-0910') as Appointment;
dit('honorer le 9 octobre pose la reprise', true, !!R);
dit('... le 19 decembre 2026', '2026-12-19', R?.date);
dit('... sans prix', undefined, R?.priceXof);
dit('le 9 octobre garde son prix', 35000, lu('kk-0910').priceXof);

/* ── 2. Le 9 octobre, avant que personne n'ouvre la reprise ── */
dit('Carnet, reprise du 19 dec. 2026', 40000, carnet(R));
if (__PROUVE__) saute('fenetre, reprise du 19 dec. 2026');
else {
  /* Ce que la fenetre calcule a l'ouverture : longueur du RDV (absente), de la
     fiche (absente), sinon Mi-Long, l'etat initial du selecteur. Que la
     fenetre appelle bien ce calcul, la lecture du code le prouve plus bas. */
  dit('fenetre, reprise du 19 dec. 2026', 40000,
    nouveau('brutDuRituel')({ serviceIds: R.serviceIds, remisesLignes: R.remisesLignes }, byId,
      tarifsDuRituel({ serviceIds: R.serviceIds, longueur: 'mi-long' } as Appointment, ctx(KK))));
}
dit('encaissement, net demande', 40000, apptNetXof(R, byId));
dit('encaissement, reste du', 40000, apptDueXof(R, byId));
if (__PROUVE__) saute('Caisse, parts du ticket');
else dit('Caisse, parts du ticket', [40000, 0], nouveau('partsDuRituelXof')(R, byId));

/* ── 3. Le 19 decembre 2026 : honorer sans encaisser ── */
horloge('2026-12-19');
{
  const tarifs = tarifsDuRituel(R, ctx(KK));
  /* Appelable pour le code d'avant (il attend `prixPlein`), objet pour le
     nouveau (il attend `{ prixPlein, gesteDe }`). */
  const r = honoreSansEncaisser(lu(R.id), byId, Object.assign((s: Service) => tarifs.prixPlein(s), tarifs) as Any);
  dit('le 19 dec., la facture est emise', true, !!r.facture && !r.deja);
  dit('... elle vaut 40000', 40000, r.facture ? invoiceTotal(r.facture) : null);
  dit('... sans remise globale', undefined, r.facture?.globalDiscountXof);
  dit('... SINSIN 40000, le Souffle 10000 offert', [['SINSIN Essentiel', 40000, 0], ['KLOKLO Essentiel, Le Souffle', 10000, 100]], lignes(r.facture));
  dit('le rendez-vous porte son prix fige, honore', [40000, 'honoré'], [lu(R.id).priceXof, lu(R.id).status]);
  dit('apres l honneur, le Carnet dit toujours 40000', 40000, carnet(lu(R.id)));
}

/* ── 4. Le prix enregistre tient ── */
{
  neuf([KK], [{ ...RDV_0910, status: 'honoré' }, repriseNue({ priceXof: 35_000 })]);
  const P = lu('kk-1219');
  dit('prix enregistre 35000 : Carnet', 35000, carnet(P));
  dit('... net', 35000, apptNetXof(P, byId));
  dit('... reste du', 35000, apptDueXof(P, byId));
  if (__PROUVE__) saute('... parts du ticket');
  else dit('... parts du ticket', [35000, 0], nouveau('partsDuRituelXof')(P, byId));
  const tarifs = tarifsDuRituel(P, ctx(KK));
  const r = honoreSansEncaisser(P, byId, Object.assign((s: Service) => tarifs.prixPlein(s), tarifs) as Any);
  dit('... honorer ne l ecrase pas', 35000, lu('kk-1219').priceXof);
  dit('... facture 35000, prix d origine conserve (remise 5000)', [35000, 5000],
    [r.facture ? invoiceTotal(r.facture) : null, r.facture?.globalDiscountXof]);
}

/* ── 5. Le prix ferme sur la fiche, l'outil que la direction pose elle-meme ── */
{
  const ferme = { ...KK, prixFixes: { 'sv-sinsin': 35_000 } } as unknown as Client;
  neuf([ferme], [repriseNue()]);
  dit('prix ferme sur la fiche : Carnet', 35000, carnet(lu('kk-1219')));
  dit('... le Souffle reste offert', 100, tarifsDuRituel(lu('kk-1219'), ctx(ferme)).gesteDe(SOUFFLE));
}

/* ── 6. Le passe ne bouge pas (prenoms inventes) ── */
{
  const ayaba = { ...KK, id: 'ayaba', name: 'Ayaba' } as unknown as Client;
  const sitou = { ...KK, id: 'sitou', name: 'Sitou', archived: true } as unknown as Client;
  const base = { branchId: 'b', serviceIds: ['sv-sinsin', 'sv-souffle'], date: '2026-12-19', time: '10:00', master: 'Team' };
  neuf([KK, ayaba, sitou], []);
  const a = (o: object) => ({ ...base, ...o } as unknown as Appointment);
  dit('honore sans prix, fiche connue : lecture d avant', 28000, apptTotalXof(a({ id: 'p1', clientId: 'ayaba', status: 'honoré' }), byId));
  dit('confirme sans fiche : lecture d avant', 28000, apptTotalXof(a({ id: 'p2', clientId: 'inconnue', status: 'confirmé' }), byId));
  dit('annule sans prix : lecture d avant', 28000, apptTotalXof(a({ id: 'p3', clientId: 'kk', status: 'annulé' }), byId));
  dit('fiche archivee : lecture d avant', 28000, apptTotalXof(a({ id: 'p4', clientId: 'sitou', status: 'confirmé' }), byId));
  dit('seance 2 : zero', 0, apptTotalXof(a({ id: 'p5', clientId: 'kk', status: 'confirmé', seriesIndex: 2, seriesTotal: 3 }), byId));
}

/* ── 7. La colonne Montant suit le bandeau de la fenetre ── */
if (__PROUVE__) saute('colonne Montant apres remise');
else {
  neuf([KK], []);
  const m = (plus: Partial<Appointment>) => { const r = nouveau('montantDuCarnet')(repriseNue(plus), byId); return [r.montant, r.barre]; };
  dit('remise de 10 % : 36000, 40000 barre', [36000, 40000], m({ discountPct: 10 }));
  dit('remise de 5000 F : 35000, 40000 barre', [35000, 40000], m({ discountXof: 5000 }));
  dit('forfait 30000 : 30000, 40000 barre', [30000, 40000], m({ forfait: { totalXof: 30000, baseXof: 40000 } } as Partial<Appointment>));
  dit('remise de ligne -50 % : 20000, rien de barre', [20000, undefined], m({ remisesLignes: [{ pct: 50 }, null] } as Partial<Appointment>));
}

/* ── 8. La memoire ── */
{
  neuf([KK], []);
  const X = repriseNue();
  dit('deux lectures du meme rendez-vous, le meme nombre', [40000, 40000], [apptTotalXof(X, byId), apptTotalXof(X, byId)]);
  clientsStore.set([{ ...KK, lockCount: 120 } as Client]);
  dit('la fiche recomptee (Medium) : le meme objet se relit', 25000, apptTotalXof(X, byId));
  clientsStore.set([{ ...KK } as Client]);
  services = [{ ...SINSIN, priceFloors: { ...PLANCHERS, 'cal-micro': 42_000 } } as Service, SOUFFLE];
  servicesStore.set(services);
  byId = new Map(services.map((s) => [s.id, s] as const));
  dit('le bareme monte (Micro a 42000) : le meme objet se relit', 42000, apptTotalXof(X, byId));
}

/* ── 9. La lecture du code ── */
if (__PROUVE__) saute('lecture du code');
else {
  const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const corps = (src: string, debut: string) => { const i = src.indexOf(debut); if (i < 0) return ''; const j = src.indexOf('\nexport ', i + debut.length); return src.slice(i, j < 0 ? undefined : j); };
  const shared = sansCom('src/apps/trone/routes/clients/_shared.tsx');
  dit('la fenetre tire son brut du calcul partage', [true, true, false], [
    new RegExp(String.raw`const grossBase = brutDuRituel\(\{ serviceIds, remisesLignes: remisesL \}, byId, tarifs\);`).test(shared),
    new RegExp(String.raw`const tarifs = tarifsDuRituel\(\{ serviceIds, longueur \}`).test(shared),
    new RegExp(String.raw`const grossBase = rdvPersonalized`).test(shared),
  ]);
  dit('apptTotalXof passe par le tarif de la tete', true,
    new RegExp(String.raw`tarifDeLaTeteXof\(a, byId\)`).test(corps(shared, 'export const apptTotalXof')));
  dit('le tarif de la tete passe par le meme calcul que la fenetre', true,
    new RegExp(String.raw`brutDuRituel\(a, byId, tarifsDuRituel\(a,`).test(corps(shared, 'export function tarifDeLaTeteXof')));
  /* Aucun total n'additionne plus le prix de vitrine hors des lieux connus. */
  const marche = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? marche(path.join(d, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []);
  const appels: Record<string, number> = {};
  for (const f of marche('src')) {
    const n = (sansCom(f).match(new RegExp(String.raw`svcPriceForAppt\(`, 'g')) ?? []).length;
    if (n > 0) appels[f.split(path.sep).join('/')] = n;
  }
  dit('svcPriceForAppt( : seuls les lieux connus', {
    'src/apps/trone/routes/clients/_shared.tsx': 3,
    'src/apps/trone/routes/clients/actions.tsx': 1,
    'src/apps/trone/routes/equipe/Personnel.tsx': 1,
  }, Object.fromEntries(Object.entries(appels).sort(([x], [y]) => x.localeCompare(y))));
  const carnetSrc = sansCom('src/apps/trone/routes/clients/Carnet.tsx');
  dit('Carnet : la colonne Montant dit le bandeau', [true, false], [
    new RegExp(String.raw`montantDuCarnet\(a, byId\)`).test(carnetSrc),
    new RegExp(String.raw`fmtMoney\(apptTotalXof\(a, byId\)`).test(carnetSrc),
  ]);
  const actions = sansCom('src/apps/trone/routes/clients/actions.tsx');
  dit('actions : honorer fige, encaisser fige, la visite suivante nait nue', [true, true, true, false], [
    new RegExp(String.raw`\.\.\.prixAFiger\(a, byId\), status: 'honoré'`).test(actions),
    new RegExp(String.raw`const (?:freeze|prixFige) = settleTotal > 0 \? prixAFiger\(appt, byId\) : \{\};`).test(actions),
    new RegExp(String.raw`const newAppt: Appointment = \{\s*\.\.\.sansLaVisite\(appt\),`).test(actions),
    new RegExp(String.raw`priceXof: appt\.priceXof \?\? apptTotalXof`).test(actions),
  ]);
  const caisse = sansCom('src/apps/trone/routes/vente/Caisse.tsx');
  dit('Caisse : le ticket prend les parts du rituel', [true, false], [
    new RegExp(String.raw`partsDuRituelXof\(`).test(caisse),
    new RegExp(String.raw`svcPriceForAppt`).test(caisse),
  ]);
}

/* ══ LA RELECTURE DU 9 OCTOBRE 2026 ══════════════════════════════════════
   Cinq fautes trouvees a la relecture de la correction, chacune rejouee ici.
   Le code de base (`--prouve`) n'a pas ces fonctions : ces blocs s'y sautent,
   leur preuve se fait en remettant chaque faute dans le code d'apres. */
if (__PROUVE__) saute('relecture du 9 octobre 2026');
else {
  services = [SINSIN, SOUFFLE];
  servicesStore.set(services);
  byId = new Map(services.map((s) => [s.id, s] as const));
  const ayaba = { ...KK, id: 'ayaba', name: 'Ayaba' } as unknown as Client;
  const base = { branchId: 'b', clientId: 'ayaba', clientName: 'Ayaba', serviceIds: ['sv-sinsin', 'sv-souffle'], time: '10:00', master: 'Team' };
  const rdv = (o: object) => ({ ...base, ...o } as unknown as Appointment);

  /* ── 10. L'argent recu avant la correction garde sa lecture ──
     Regle d'avance a la Caisse le 5 octobre 2026, au prix qu'on lisait alors
     (28 000 F), sans prix fige : la Caisse ne figeait jamais. */
  horloge('2026-10-09');
  const verse = { paidXof: 28_000, payments: [{ id: 'pay-1', amountXof: 28_000, date: '2026-10-05', invoiceId: 'inv-1' }], invoiceId: 'inv-1' };
  neuf([ayaba], [rdv({ id: 'ay-1020', date: '2026-10-20', status: 'confirmé', ...verse })]);
  const A = lu('ay-1020');
  dit('argent recu d avance : Carnet', { montant: 28000 }, nouveau('montantDuCarnet')(A, byId));
  dit('... reste du', 0, apptDueXof(A, byId));
  dit('... le prix qui se figera', { priceXof: 28000 }, nouveau('prixAFiger')(A, byId));
  dit('... parts du ticket (lecture d avant)', [20000, 8000], nouveau('partsDuRituelXof')(A, byId));
  dit('... la seule piece, sans versement au journal', 28000, apptTotalXof(rdv({ id: 'ay-x1', date: '2026-10-20', status: 'confirmé', invoiceId: 'inv-1' }), byId));
  dit('... le seul journal (apres une remise a zero)', 28000, apptTotalXof(rdv({ id: 'ay-x2', date: '2026-10-20', status: 'confirmé', payments: verse.payments }), byId));
  dit('... sans argent, le meme rendez-vous se lit au tarif de sa tete', 40000, apptTotalXof(rdv({ id: 'ay-x3', date: '2026-10-20', status: 'confirmé' }), byId));
  horloge('2026-10-20');
  honorAppointment(A, byId, { muet: true });
  dit('le 20 oct. 2026, honorer fige 28000 et ne laisse rien du', [28000, 'honoré', 0], [lu('ay-1020').priceXof, lu('ay-1020').status, apptDueXof(lu('ay-1020'), byId)]);

  /* ── 11. Des-honorer ne fait pas entrer le passe dans la nouvelle lecture ── */
  horloge('2026-10-15');
  neuf([ayaba], []);
  const D = nouveau('rituelDeshonore')(rdv({ id: 'ay-0920', date: '2026-09-20', status: 'honoré' }), byId);
  dit('des-honorer un rituel de sept. 2026 sans prix : il garde 28000', [28000, 'confirmé', 28000], [D.priceXof, D.status, apptTotalXof(D, byId)]);
  dit('... un prix enregistre n est pas touche', 35000, nouveau('rituelDeshonore')(rdv({ id: 'ay-p', date: '2026-09-20', status: 'honoré', priceXof: 35_000 }), byId).priceXof);
  /* Un rituel encaisse avant le journal des versements (17 aout 2026) : la
     remise a zero des encaissements lui retire sa somme ET sa piece. */
  neuf([ayaba], [rdv({ id: 'ay-0812', date: '2026-08-12', status: 'honoré', paidXof: 28_000, invoiceId: 'inv-r1', pointsAwarded: true })]);
  invoicesStore.set([{
    id: 'inv-r1', branchId: 'b', kind: 'facture', number: 'F-0101', clientId: 'ayaba', date: '2026-08-12',
    lines: [], globalDiscountPct: 0, theme: 'Aube', status: 'payée',
  } as unknown as Invoice]);
  const remis = resetAllPaidInvoices('b');
  const R0 = lu('ay-0812');
  dit('remise a zero des encaissements : le rituel d aout 2026 garde 28000', [1, 28000, 'confirmé', 28000],
    [remis.appts, R0.priceXof, R0.status, apptTotalXof(R0, byId)]);

  /* ── 12. La visite suivante garde la remise famille ──
     Afi, compte famille a -15 % : la fenetre a fige 6 000 F de remise en
     francs sur 40 000 F. */
  horloge('2026-10-09');
  const afi = { ...KK, id: 'afi', name: 'Afi' } as unknown as Client;
  neuf([afi], []);
  const visite = rdv({
    id: 'af-1009', clientId: 'afi', clientName: 'Afi', date: '2026-10-09', status: 'honoré',
    priceXof: 40_000, discountXof: 6_000, remiseFamille: true, ...verse, paidXof: 34_000,
  });
  dit('la remise famille suit', { discountXof: 6000, remiseFamille: true }, nouveau('remiseFamilleQuiSuit')(visite));
  const suivante = { ...sansLaVisite(visite), ...nouveau('remiseFamilleQuiSuit')(visite), id: 'af-1218', date: '2026-12-18', status: 'confirmé', repriseDe: 'af-1009' } as Appointment;
  dit('... la visite du 18 dec. 2026 : 40000, 34000 demandes', [40000, 34000, 34000],
    [apptTotalXof(suivante, byId), apptNetXof(suivante, byId), apptDueXof(suivante, byId)]);
  dit('... une remise du jour ne suit pas, le drapeau tombe', [{}, {}],
    [nouveau('remiseFamilleQuiSuit')({ discountXof: 5_000 }), nouveau('remiseFamilleQuiSuit')({ remiseFamille: true })]);

  /* ── 13. Le ticket de la Caisse fige ce qu'il encaisse ──
     Yawa, reprise du 19 dec. 2026 sans prix : SINSIN a son calibre et une
     prestation sur devis, dont le montant se saisit au ticket. */
  const DEVIS = {
    id: 'sv-devis', categoryId: 'cat-x', name: 'Soin sur devis', palier: 'Fondation',
    priceXof: 0, hidePrice: false, priceMode: 'devis', sessions: 1, master: '', durationMin: 30, order: 3,
  } as unknown as Service;
  services = [SINSIN, SOUFFLE, DEVIS];
  servicesStore.set(services);
  byId = new Map(services.map((s) => [s.id, s] as const));
  const yawa = { ...KK, id: 'yawa', name: 'Yawa' } as unknown as Client;
  neuf([yawa], []);
  const Y = rdv({ id: 'yw-1219', clientId: 'yawa', clientName: 'Yawa', serviceIds: ['sv-sinsin', 'sv-devis'], date: '2026-12-19', status: 'confirmé' });
  const auTicket = (o: Record<string, number>) => nouveau('prixAFigerAuTicket')(Y, byId, new Map(Object.entries(o)));
  dit('ticket tel que pose : 40000', { priceXof: 40000 }, auTicket({ 'sv-sinsin': 40_000, 'sv-devis': 0 }));
  dit('... devis saisi a 15000 : 55000, le total du ticket', { priceXof: 55000 }, auTicket({ 'sv-sinsin': 40_000, 'sv-devis': 15_000 }));
  dit('... SINSIN retiree du ticket : sa part reste due', { priceXof: 55000 }, auTicket({ 'sv-devis': 15_000 }));
  dit('... SINSIN en quantite 2 : 80000', { priceXof: 80000 }, auTicket({ 'sv-sinsin': 80_000, 'sv-devis': 0 }));
  dit('... un prix enregistre n est pas touche', {}, nouveau('prixAFigerAuTicket')({ ...Y, priceXof: 35_000 }, byId, new Map([['sv-devis', 15_000]])));

  /* ── 14. Les fautes de la relecture, lues dans le code ── */
  const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const actions = sansCom('src/apps/trone/routes/clients/actions.tsx');
  dit('actions : des-honorer et remettre a zero passent par rituelDeshonore, la visite suivante garde sa remise famille', [true, true, true], [
    new RegExp(String.raw`a\.id === frais\.id \? rituelDeshonore\(a, byId\) : a`).test(actions),
    new RegExp(String.raw`a\.status === 'honoré' \? rituelDeshonore\(a, parIdDuCatalogue\) : a`).test(actions),
    new RegExp(String.raw`\.\.\.sansLaVisite\(appt\),\s*\.\.\.remiseFamilleQuiSuit\(appt\),`).test(actions),
  ]);
  const caisse = sansCom('src/apps/trone/routes/vente/Caisse.tsx');
  dit('Caisse : le prix fige est celui du ticket, la remise se mesure contre lui', [true, false, true], [
    new RegExp(String.raw`prixAFigerAuTicket\(a, svcById, auTicket\)`).test(caisse),
    new RegExp(String.raw`prixAFiger\(a, svcById\)`).test(caisse),
    new RegExp(String.raw`resteAvantXof: apptDueXof\(\{ \.\.\.a, \.\.\.fige \}, svcById\)`).test(caisse),
  ]);
  const dash = sansCom('src/apps/trone/routes/pilotage/Dashboard.tsx');
  const creances = sansCom('src/apps/trone/routes/finances/Creances.tsx');
  dit('Tableau de bord et Creances : les totaux suivent la clef du tarif', [true, 3, true], [
    new RegExp(String.raw`const clefDuTarif = useClefDuTarif\(\);`).test(dash),
    (dash.match(new RegExp(String.raw`, clefDuTarif\]\);`, 'g')) ?? []).length,
    new RegExp(String.raw`\[appts, aujourdhui, byId, clefDuTarif\]`).test(creances),
  ]);
  /* ── 15. L'argent rendu libere le prix qu'il avait fige (10 octobre 2026) ──
     Decision de la direction : annuler un encaissement rend un rendez-vous a
     venir au tarif de sa tete. Jamais un prix retouche dans la fenetre, jamais
     un rituel honore. Le tarif d'Ayaba est de 40 000 F ; l'argent avait fige
     35 000 F, quand son tarif etait plus bas. Attendus ecrits en dur. */
  const figeParLArgent = (o: object) => rdv({ date: '2026-12-19', status: 'confirmé', priceXof: 35_000, prixFigeParLArgent: 35_000,
    paidXof: 10_000, payments: [{ id: 'p1', amountXof: 10_000, date: '2026-10-09', method: 'Espèces', invoiceId: 'f-1' }], invoiceId: 'f-1', ...o });
  const champs = (a: Appointment) => [a.priceXof ?? null, (a as Any).prixFigeParLArgent ?? null, a.paidXof ?? null, apptTotalXof(a, byId)];
  neuf([ayaba], [figeParLArgent({ id: 'lib-1' })]);
  cancelAppointmentPayment(lu('lib-1'));
  dit('annuler l encaissement : le prix fige par l argent se libere, le Carnet relit 40000', [null, null, null, 40000], champs(lu('lib-1')));
  neuf([ayaba], [figeParLArgent({ id: 'lib-2', priceXof: 38_000 })]);
  cancelAppointmentPayment(lu('lib-2'));
  dit('... un prix retouche dans la fenetre (38000) reste', [38000, null, null, 38000], champs(lu('lib-2')));
  neuf([ayaba], [figeParLArgent({ id: 'lib-3', date: '2026-10-09', status: 'honoré' })]);
  cancelAppointmentPayment(lu('lib-3'));
  dit('... un rituel honore garde le sien', [35000, null, null, 35000], champs(lu('lib-3')));
  neuf([ayaba], [figeParLArgent({ id: 'lib-4', paidXof: 20_000, payments: [
    { id: 'p1', amountXof: 10_000, date: '2026-10-09', method: 'Espèces', invoiceId: 'f-1' },
    { id: 'p2', amountXof: 10_000, date: '2026-10-10', method: 'Espèces', invoiceId: 'f-2' }], invoiceId: 'f-2' })]);
  rewindPaymentForDeletedInvoice('f-2', 10_000);
  dit('... une piece supprimee sur deux : 10000 restent, le prix reste fige', [35000, 35000, 10000, 35000], champs(lu('lib-4')));
  rewindPaymentForDeletedInvoice('f-1', 10_000);
  dit('... la derniere supprimee : le prix se libere', [null, null, null, 40000], champs(lu('lib-4')));
  dit('... la reprise n emporte pas le marqueur', false, 'prixFigeParLArgent' in sansLaVisite({ prixFigeParLArgent: 35_000 } as object));
  dit('ecrans d argent : l encaissement et la Caisse posent le marqueur avec le prix', [true, true], [
    new RegExp(String.raw`prixFigeParLArgent: prixFige\.priceXof`).test(actions),
    new RegExp(String.raw`prixFigeParLArgent: fige\.priceXof`).test(caisse),
  ]);

  /* ── 16. La reprise de la cloture garde la remise famille (10 octobre 2026) ──
     Le meme geste que la visite reprogrammee, dans le corps de `poseLaReprise`. */
  const corpsDe = (src: string, debut: string, fin: string) => {
    const i = src.indexOf(debut); const j = i < 0 ? -1 : src.indexOf(fin, i + debut.length);
    return i < 0 || j < 0 ? '' : src.slice(i, j);
  };
  const laReprise = corpsDe(actions, 'export function poseLaReprise', 'export function honorAppointment');
  dit('poseLaReprise : sansLaVisite puis remiseFamilleQuiSuit', [true, true], [
    laReprise.length > 0,
    new RegExp(String.raw`\.\.\.sansLaVisite\(appt\),\s*\.\.\.remiseFamilleQuiSuit\(appt\),`).test(laReprise),
  ]);

}

console.log(ko === 0 ? '\nLe Carnet dit la fenetre : un seul tarif de la tete, partout.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
