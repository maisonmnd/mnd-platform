/* LA CLOTURE DE GRENAT, EPROUVEE — 4 novembre 2026.
   `node scripts/verifie-la-cloture-du-jour.mjs` (et `--prouve`).

   La decision (Yeman, maquette 9KCMgAb1qksSVcEXDiKaHE, « construis ») : a
   15 h et a 19 h, Grenat relit chaque rendez-vous et chaque facture du jour ;
   les six regles d'une journee close ; trois gestes surs, jamais un prix, un
   paiement, une absence ; une facture payee effacee est une alarme, l'argent
   reste compte jusqu'a la decision de la direction ; la caisse du jour par
   moyen et par tiroir.

   LA VRAIE JOURNEE DU 4 NOVEMBRE 2026, EN SCENARIO FICTIF EQUIVALENT (noms
   inventes, montants de la maquette) : sept rendez-vous, quatre finis et pas
   encaisses a 15 h, deux sans etat a 19 h, une piece payee effacee a 22 h
   puis refaite a 47 000 F, une piece du 27 octobre 2026 reglee ce jour-la.

   TOUS LES ATTENDUS SONT ECRITS EN DUR, tires de ces phrases. */
import { readFileSync, readdirSync } from 'node:fs';
import {
  A_PREPARER, TYPE_DU_PAPIER, aCotonouLe, clotureDuJour, dureeLue, familleLue, francsDits, gesteToujoursValable, heureEnClair,
  heuresDeLaCloture, idDuPapier, initialesDe, laMaisonEstFermee, notificationDeLaCloture, papierDuJour, pieceAPaye, prixFigeLu,
  remisesDuRdv, totalDeLaPiece, versementsDeLaPiece,
  ceQuiManqueALaDepense, cleDeLEcart, cleDuJourSansDepense, dateDite, depenseEnAttente, heuresDAttente, montantDeLaDepense,
  type ComptageLu, type DepenseLue, type FaitsDeLaJournee, type FicheLue, type PieceLue, type RdvLu,
} from '../src/shared/cloture-du-jour-pur';
import { dureeDuRendezVous, ouvertureDuJour } from '../src/shared/agenda-pur';
import { familleDuMoyen } from '../src/shared/caisse-du-soir-pur';
import { recuAEnvoyer } from '../src/shared/recu-whatsapp';
import { invoiceReglements, invoiceTotal } from '../src/shared/finance-pur';
import { DEFAULT_SETTINGS } from '../src/shared/settings';
import { estEnAttente, expenseTotal, heuresDattente, type Expense, type Invoice } from '../src/shared/finance';

let ko = 0;
const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)?.slice(0, 220)}`));
};
const vrai = (nom: string, v: boolean, detail?: unknown) => dit(nom, true, v ? true : { faux: detail ?? false });

const JOUR = '2026-11-04';
const a = (hhmm: string, jour = JOUR) => Date.parse(`${jour}T${hhmm}:00+01:00`);
const NBSP = ' ';
const F = (n: number) => francsDits(n);

/* ── 0. Les petits outils ── */
dit('les heures par defaut : 15 et 19', [15, 19], heuresDeLaCloture(undefined));
dit('les heures reglees, triees, sans doublon', [14, 20], heuresDeLaCloture([20, 14, 20]));
dit('une heure hors de 8 h a 23 h tombe', [19], heuresDeLaCloture([3, 19, 24]));
dit('deux heures au plus', [9, 12], heuresDeLaCloture([12, 9, 18]));
dit('le 4 novembre 2026 a 15 h a Cotonou', { jour: JOUR, heure: 15 }, (({ jour, heure }) => ({ jour, heure }))(aCotonouLe(Date.parse('2026-11-04T14:00:00Z'))));
dit('minuit passe a Cotonou change le jour', '2026-11-05', aCotonouLe(Date.parse('2026-11-04T23:30:00Z')).jour);
dit('l heure en clair', ['15 h 00', '9 h 30'], [heureEnClair(900), heureEnClair(570)]);
dit('les francs dits', [`45${NBSP}000${NBSP}F`, `211${NBSP}000${NBSP}F`, `500${NBSP}F`], [F(45000), F(211000), F(500)]);
dit('les initiales, jamais le nom', ['A. K. M.', 'J.-L. D.', 'F.', 'Cliente'], [initialesDe('awa koffi mensah'), initialesDe('Jean-Luc Dossou'), initialesDe('Fifamè'), initialesDe('')]);
dit('le papier a son identifiant de ligne', 'env-piece-inv-1', idDuPapier('inv-1'));

/* ── 1. Les copies, confrontees a leurs originaux ── */
const PRESTATIONS = new Map([
  ['sv-a', { durationMin: 90, dureeParLongueur: { long: 120 } }],
  ['sv-b', { durationMin: 45 }],
]);
const cas = [
  { serviceIds: ['sv-a', 'sv-b'] }, { serviceIds: ['sv-a'], longueur: 'long' }, { dureeMin: 200, serviceIds: ['sv-a'] },
  { serviceIds: [] }, { serviceIds: ['inconnu'] }, { serviceIds: ['sv-b'], longueur: 'court' },
];
dit('dureeLue = dureeDuRendezVous (agenda-pur)', cas.map((c) => dureeDuRendezVous(c, PRESTATIONS)), cas.map((c) => dureeLue(c, PRESTATIONS)));
const moyens = [
  { method: 'Espèces' }, { method: 'cash' }, { method: 'MTN MoMo' }, { method: 'MoMo Privé' }, { method: 'Moov' }, { method: 'Mobile Money' },
  { method: 'Carte' }, { method: 'Kkiapay' }, { method: 'Lien WhatsApp', cashbox: 'KkiaPay' }, { method: 'Virement bancaire' }, { method: '' },
  { method: 'MTN Collection', cashbox: 'MTN Collection' }, { method: 'MTN Collection' }, { method: 'MTN MoMo', cashbox: 'FedaPay' }, { method: 'Moov', cashbox: 'MND PAY' },
];
dit('familleLue = familleDuMoyen (caisse-du-soir-pur)', moyens.map((m) => familleDuMoyen(m)), moyens.map((m) => familleLue(m)));
/* MTN Collection et FedaPay à part dans la clôture de Grenat (12 novembre 2026) :
   ni l'un ni l'autre ne se range plus sous « MTN MoMo » par son moyen. */
dit('la cloture range MTN Collection et FedaPay a part, pas sous MTN MoMo',
  ['MTN Collection, en ligne', 'MTN Collection, en ligne', 'FedaPay, en ligne', 'FedaPay, en ligne', 'MTN MoMo'],
  [familleLue({ method: 'MTN Collection', cashbox: 'MTN Collection' }), familleLue({ method: 'MTN Collection' }), familleLue({ method: 'MTN MoMo', cashbox: 'FedaPay' }),
    familleLue({ method: 'Moov', cashbox: 'MND PAY' }), familleLue({ method: 'MTN MoMo', cashbox: 'MTN MoMoPay' })]);
const quinzeJours = Array.from({ length: 14 }, (_, i) => new Date(Date.parse('2026-11-01T12:00:00Z') + i * 86_400_000).toISOString().slice(0, 10));
const exceptions = [{ date: '2026-11-07', closed: true }, { date: '2026-11-11', staffId: 'st-1', closed: true }];
dit('laMaisonEstFermee = ouvertureDuJour(...).closed, quatorze jours',
  quinzeJours.map((j) => ouvertureDuJour(j, DEFAULT_SETTINGS.hours, exceptions).closed),
  quinzeJours.map((j) => laMaisonEstFermee(j, DEFAULT_SETTINGS.hours, exceptions)));
dit('... le dimanche est ferme parce que les horaires le disent', true, laMaisonEstFermee('2026-11-08', DEFAULT_SETTINGS.hours));
const recus = [
  { jourDuPaiement: JOUR, jourDuRituel: JOUR, aujourdhui: JOUR }, { jourDuPaiement: JOUR, jourDuRituel: '2026-10-27', aujourdhui: JOUR },
  { jourDuPaiement: '2026-11-03', jourDuRituel: JOUR, aujourdhui: JOUR }, { jourDuPaiement: JOUR, jourDuRituel: '2026-11-06', aujourdhui: JOUR },
  { jourDuPaiement: JOUR, aujourdhui: JOUR },
];
dit('papierDuJour = recuAEnvoyer (recu-whatsapp)', recus.map((r) => recuAEnvoyer(r)), recus.map((r) => papierDuJour(r)));
const piecesTest = [
  { id: 'x1', lines: [{ id: 'l', label: 'a', qty: 2, unitXof: 10000, discountPct: 10, discountXof: 500 }], globalDiscountPct: 5, globalDiscountXof: 1000, status: 'payée', date: JOUR, payment: 'MTN MoMo', cashbox: 'Momo' },
  { id: 'x2', lines: [{ id: 'l', label: 'a', qty: 1, unitXof: 35000, discountPct: 0 }], globalDiscountPct: 0, status: 'envoyée', date: JOUR, payments: [{ id: 'p', date: JOUR, amountXof: 10000, method: 'Espèces' }] },
  { id: 'x3', lines: [{ id: 'l', label: 'a', qty: 1, unitXof: 20000, discountPct: 0 }], globalDiscountPct: 0, status: 'envoyée', date: JOUR },
];
dit('totalDeLaPiece = invoiceTotal', piecesTest.map((p) => invoiceTotal(p as unknown as Invoice)), piecesTest.map((p) => totalDeLaPiece(p as PieceLue)));
dit('versementsDeLaPiece = invoiceReglements', piecesTest.map((p) => invoiceReglements(p as unknown as Invoice)), piecesTest.map((p) => versementsDeLaPiece(p as PieceLue)));
dit('le prix fige, lu comme le Carnet', [47000, 0, 60000, undefined, 42500], [
  prixFigeLu({ priceXof: 47000 }), prixFigeLu({ priceXof: 47000, seriesIndex: 2 }), prixFigeLu({ forfait: { totalXof: 60000 }, priceXof: 90000 }),
  prixFigeLu({}), prixFigeLu({ priceXof: 50000, discountPct: 10, discountXof: 2500 }),
]);

/* ── 2. La journee du 4 novembre 2026, en scenario fictif equivalent ── */
const fiches: FicheLue[] = [
  { id: 'c-1', nom: 'Awa Koffi Mensah', aUnNumero: true },
  { id: 'c-2', nom: 'Rose Sika Adjo', aUnNumero: true },
  { id: 'c-3', nom: 'Kafui Amah', aUnNumero: true },
  { id: 'c-4', nom: 'Fifamè', aUnNumero: true },
  { id: 'c-5', nom: 'Jeanne', aUnNumero: true },
  { id: 'c-6', nom: 'Victoire Agbo', aUnNumero: true },
  { id: 'c-7', nom: 'Dela Dossou', aUnNumero: true },
  { id: 'c-8', nom: 'Gisèle Ranou', aUnNumero: true },
];
const rdv = (id: string, clientId: string, time: string, dureeMin: number, prixXof: number | undefined, plus: Partial<RdvLu> = {}): RdvLu => ({
  id, branchId: 'maison', clientId, qui: fiches.find((c) => c.id === clientId)?.nom, date: JOUR, time, dureeMin, status: 'confirmé', prixXof, ...plus,
});
const ligne = (prix: number) => ({ label: 'Rituel', qty: 1, unitXof: prix, discountPct: 0 });
const piece = (id: string, numero: string, clientId: string, prix: number, plus: Partial<PieceLue> = {}): PieceLue => ({
  id, branchId: 'maison', kind: 'facture', number: numero, clientId, date: JOUR, lines: [ligne(prix)], globalDiscountPct: 0, status: 'payée', ...plus,
});
const especes = (id: string, montant: number, heure: string, jour = JOUR) => ({ id, date: jour, amountXof: montant, method: 'Espèces', cashbox: 'Real Money', time: heure });

/* Les sept rendez-vous du matin, tels qu'ils etaient poses. */
const R1 = rdv('r-1', 'c-1', '11:00', 255, 45000);
const R2 = rdv('r-2', 'c-2', '11:00', 240, 52000);
const R3 = rdv('r-3', 'c-3', '12:00', 90, 35000);
const R4 = rdv('r-4', 'c-4', '13:00', 60, 20000);
const R5 = rdv('r-5', 'c-5', '13:30', 60, 20000);
const R6 = rdv('r-6', 'c-6', '14:00', 180, undefined);
const R7 = rdv('r-7', 'c-7', '16:00', 150, undefined);
const matin = [R1, R2, R3, R4, R5, R6, R7];
const faits = (maintenantMs: number, plus: Partial<FaitsDeLaJournee> = {}): FaitsDeLaJournee => ({
  jour: JOUR, maintenantMs, branchId: 'maison', rdvs: matin, pieces: [], fiches, ...plus,
});

/* 15 h */
const q15 = clotureDuJour(faits(a('15:00')));
dit('15 h : les etats, dans l ordre des heures', ['en-cours', 'a-encaisser', 'a-encaisser', 'a-encaisser', 'a-encaisser', 'en-cours', 'a-venir'], q15.rdvs.map((r) => r.etat));
dit('15 h : chaque ligne dit ses initiales, jamais le nom', ['A. K. M.', 'R. S. A.', 'K. A.', 'F.', 'J.', 'V. A.', 'D. D.'], q15.rdvs.map((r) => r.qui));
dit('15 h : « Au fauteuil jusque vers 15 h 15 »', 'Au fauteuil jusque vers 15 h 15', q15.rdvs[0].dit);
dit('15 h : « Fini vers 15 h 00, pas encore encaisse »', 'Fini vers 15 h 00, pas encore encaissé', q15.rdvs[1].dit);
dit('15 h : les gestes d un rendez-vous a encaisser', ['encaisser', 'absente', 'annulee'], q15.rdvs[1].gestes);
dit('15 h : « Pas encore son heure »', 'Pas encore son heure', q15.rdvs[6].dit);
dit('15 h : le verdict', '4 rendez-vous à clore, la caisse ne se compte pas encore', q15.verdict.dit);
dit('15 h : pas close', false, q15.verdict.close);
dit('15 h : rien a encaisser dans la caisse, 127 000 F restent', { t: 0, r: 127000, n: 4 }, { t: q15.caisse.totalXof, r: q15.caisse.resteAEncaisserXof, n: q15.caisse.rdvAEncaisser });
dit('15 h : Grenat ne fait rien seul', [], q15.gestes);
dit('15 h : la notification, des nombres seulement',
  { titre: 'Clôture de 15 h', corps: '4 rendez-vous à clore, 3 rendez-vous pas encore finis.' }, notificationDeLaCloture(q15, 15));

/* 19 h : A. K. M. honoree a 15 h 51, 45 000 F en especes, son recu parti. */
const P1 = piece('inv-1', 'F-2026-0769', 'c-1', 45000, { apptId: 'r-1', payments: [especes('p-1', 45000, '15:51')], whatsapp: { partieLe: '2026-11-04T14:52:00Z', modele: 'recu_de_paiement' }, creeeLe: '2026-11-04T14:51:00Z' });
const R1h = { ...R1, status: 'honoré', invoiceId: 'inv-1', payments: [{ ...especes('p-1', 45000, '15:51'), invoiceId: 'inv-1' }] };
const q19 = clotureDuJour(faits(a('19:00'), { rdvs: [R1h, R2, R3, R4, R5, R6, R7], pieces: [P1] }));
dit('19 h : les etats', ['clos', 'a-encaisser', 'a-encaisser', 'a-encaisser', 'a-encaisser', 'sans-etat', 'sans-etat'], q19.rdvs.map((r) => r.etat));
dit('19 h : la premiere dit sa piece et l argent recu', `Honoré · F-2026-0769 · 45${NBSP}000${NBSP}F reçus`, q19.rdvs[0].dit);
dit('19 h : « Fini vers 17 h 00 : ni honore, ni absente, ni annulee »', 'Fini vers 17 h 00 : ni honoré, ni absente, ni annulée', q19.rdvs[5].dit);
dit('19 h : les gestes d un rendez-vous sans etat', ['honore', 'absente', 'annulee'], q19.rdvs[5].gestes);
dit('19 h : le verdict', '6 rendez-vous à clore, la caisse ne se compte pas encore', q19.verdict.dit);
dit('19 h : la caisse, especes 45 000 F au tiroir Real Money', { t: 45000, m: [{ famille: 'Espèces', totalXof: 45000 }], ti: [{ tiroir: 'Real Money', totalXof: 45000 }] },
  { t: q19.caisse.totalXof, m: q19.caisse.parMoyen, ti: q19.caisse.parTiroir });
dit('19 h : le recu deja parti, rien a envoyer seul', [], q19.gestes);
dit('19 h : la notification', { titre: 'Clôture de 19 h', corps: '6 rendez-vous à clore.' }, notificationDeLaCloture(q19, 19));

/* 23 h : quatre encaissees a 21 h 48-50, la piece de A. K. M. effacee a 22 h
   depuis un poste de la direction, refaite a 47 000 F a 22 h 30, une piece
   du 27 octobre 2026 reglee ce soir, V. A. et D. D. toujours sans etat. */
const encaisse = (r: RdvLu, inv: string, montant: number, heure: string): RdvLu => ({ ...r, status: 'honoré', invoiceId: inv, payments: [{ ...especes(`p-${inv}`, montant, heure), invoiceId: inv }] });
const parti = (heure: string) => ({ partieLe: `${JOUR}T${heure}:30+01:00`, modele: 'recu_de_paiement' });
const P2 = piece('inv-2', 'F-2026-0770', 'c-8', 20000, { apptId: 'r-4', clientId: 'c-4', payments: [especes('p-inv-2', 20000, '21:48')], whatsapp: parti('21:48') });
const P3 = piece('inv-3', 'F-2026-0771', 'c-5', 20000, { apptId: 'r-5', payments: [especes('p-inv-3', 20000, '21:48')], whatsapp: parti('21:48') });
const P4 = piece('inv-4', 'F-2026-0772', 'c-3', 35000, { apptId: 'r-3', payments: [especes('p-inv-4', 35000, '21:49')], whatsapp: parti('21:49') });
const P5 = piece('inv-5', 'F-2026-0773', 'c-2', 52000, { apptId: 'r-2', payments: [especes('p-inv-5', 52000, '21:50')], whatsapp: parti('21:50') });
const P6 = piece('inv-6', 'F-2026-0774', 'c-1', 47000, { apptId: 'r-1', payments: [especes('p-inv-6', 47000, '22:30')], whatsapp: parti('22:30'), creeeLe: '2026-11-04T21:30:00Z' });
const P7 = piece('inv-7', 'MND-2026-0163', 'c-8', 37000, { date: '2026-10-27', payments: [especes('p-inv-7', 37000, '21:54')] });
const EFFACEE = { traceId: 't-1', pieceId: 'inv-1', faitLe: '2026-11-04T21:00:00Z', par: 'Un compte de la direction', porte: 'trone', avant: P1 };
const soir = [encaisse({ ...R1, prixXof: 47000 }, 'inv-6', 47000, '22:30'), encaisse(R2, 'inv-5', 52000, '21:50'), encaisse(R3, 'inv-4', 35000, '21:49'),
  encaisse(R4, 'inv-2', 20000, '21:48'), encaisse(R5, 'inv-3', 20000, '21:48'), R6, R7];
const q23 = clotureDuJour(faits(a('23:00'), { rdvs: soir, pieces: [P2, P3, P4, P5, P6, P7], effacements: [EFFACEE] }));
dit('23 h : les etats', ['clos', 'clos', 'clos', 'clos', 'clos', 'sans-etat', 'sans-etat'], q23.rdvs.map((r) => r.etat));
dit('23 h : la caisse du jour, 211 000 F en 6 versements', { t: 211000, n: 6 }, { t: q23.caisse.totalXof, n: q23.caisse.versements });
dit('23 h : toutes en especes, au tiroir Real Money', { m: [{ famille: 'Espèces', totalXof: 211000 }], ti: [{ tiroir: 'Real Money', totalXof: 211000 }] }, { m: q23.caisse.parMoyen, ti: q23.caisse.parTiroir });
dit('23 h : l effacement est une alarme, refaite, ecart 2 000 F', { sort: 'refaite', e: 2000, o: true, s: 'F-2026-0774' }, { sort: q23.alarmes[0]?.sort, e: q23.alarmes[0]?.ecartXof, o: q23.alarmes[0]?.ouverte, s: q23.alarmes[0]?.successeur?.numero });
dit('23 h : l alarme dit l heure, l argent remis, l ecart a dire',
  `F-2026-0769 effacée à 22 h 00 par Un compte de la direction, refaite par F-2026-0774 ; à 15 h 51, 45${NBSP}000${NBSP}F avaient été remis. Si les 2${NBSP}000${NBSP}F de plus n’ont pas été reçus, le tiroir sera court de 2${NBSP}000${NBSP}F. À dire avant le comptage.`,
  q23.alarmes[0]?.dit);
dit('23 h : refaite, son argent n est pas compte deux fois', 0, q23.caisse.sortiDesComptesXof);
dit('23 h : la piece du 27 octobre 2026, reglee ce soir, ne reveille personne', 'excepte', q23.pieces.find((p) => p.id === 'inv-7')?.papier);
dit('23 h : le verdict', '2 rendez-vous à clore, la caisse ne se compte pas encore', q23.verdict.dit);
dit('23 h : ce qui reste', ['2 rendez-vous à clore', '1 pièce payée effacée à trancher'], q23.verdict.reste);
const tranche = clotureDuJour(faits(a('23:00'), { rdvs: soir.map((r) => (r.status === 'confirmé' ? { ...r, status: 'annulé', absente: { le: JOUR } } : r)), pieces: [P2, P3, P4, P5, P6, P7], effacements: [EFFACEE],
  decisions: [{ cle: 'effacement:t-1', par: 'Yéman', mot: 'les 2 000 F ont été reçus' }] }));
dit('23 h, absentes dites et effacement tranche : la journee est close', { c: true, d: 'La journée est close : la caisse peut se compter.' }, { c: tranche.verdict.close, d: tranche.verdict.dit });
dit('... l alarme tranchee reste au compte rendu, fermee', { o: false, par: 'Yéman' }, { o: tranche.alarmes[0]?.ouverte, par: tranche.alarmes[0]?.tranchee?.par });
dit('... une absente est un etat final', 'Absente', tranche.rdvs[5].etatDit);

/* La piece effacee sans suite : l argent reste compte. */
const perdue = clotureDuJour(faits(a('23:00'), { rdvs: [R1h], pieces: [], effacements: [{ ...EFFACEE, avant: { ...P1, effacement: { motif: 'saisie en double' } } }] }));
dit('effacee sans suite : l argent reste compte', { s: 'perdue', x: 45000 }, { s: perdue.alarmes[0]?.sort, x: perdue.caisse.sortiDesComptesXof });
vrai('... le motif ecrit est dit', /Motif : « saisie en double »/.test(perdue.alarmes[0]?.dit ?? ''), perdue.alarmes[0]?.dit);
vrai('... et la journee ne se dit pas close', !perdue.verdict.close);
dit('... le Carnet la dit a revoir (honore sans facture)', 'a-revoir', perdue.rdvs[0].etat);
const fondue = clotureDuJour(faits(a('23:00'), { rdvs: [{ ...R1h, invoiceId: 'inv-9' }], pieces: [piece('inv-9', 'F-2026-0800', 'c-1', 45000, { apptId: 'r-1', payments: [especes('p-1', 45000, '15:51')], whatsapp: parti('15:52') })], effacements: [EFFACEE] }));
dit('fondue dans une autre (son argent y est) : signalee, jamais bloquante', { s: 'fondue', o: false }, { s: fondue.alarmes[0]?.sort, o: fondue.alarmes[0]?.ouverte });
const nonPayee = clotureDuJour(faits(a('23:00'), { rdvs: [], effacements: [{ ...EFFACEE, avant: { ...P1, status: 'envoyée', payments: [] } }] }));
dit('une piece effacee sans argent n est pas une alarme', 0, nonPayee.alarmes.length);
const hier = clotureDuJour(faits(a('23:00'), { rdvs: [], effacements: [{ ...EFFACEE, faitLe: '2026-11-03T21:00:00Z' }] }));
dit('l effacement d un autre jour n est pas de cette journee', 0, hier.alarmes.length);
dit('pieceAPaye : de l argent entre, ou soldee', [true, true, false], [pieceAPaye(P1), pieceAPaye({ id: 'z', status: 'payée', lines: [ligne(1000)] }), pieceAPaye({ id: 'z', status: 'envoyée' })]);

/* ── 3. Les trois gestes surs ── */
const regle = rdv('r-9', 'c-1', '10:00', 60, 30000, { payments: [{ ...especes('p-9', 30000, '09:50'), invoiceId: 'inv-9' }] });
const g1 = clotureDuJour(faits(a('12:00'), { rdvs: [regle] }));
dit('passe, regle en entier, encore confirme : Grenat le passe honore', [{ genre: 'passer-honore', rdvId: 'r-9' }], g1.gestes.map((g) => ({ genre: g.genre, rdvId: (g as { rdvId?: string }).rdvId })));
dit('... jamais avant sa fin', 0, clotureDuJour(faits(a('10:30'), { rdvs: [regle] })).gestes.length);
dit('... jamais s il reste a payer', 0, clotureDuJour(faits(a('12:00'), { rdvs: [{ ...regle, prixXof: 35000 }] })).gestes.length);
dit('... jamais sans prix connu', 0, clotureDuJour(faits(a('12:00'), { rdvs: [{ ...regle, prixXof: undefined }] })).gestes.length);
dit('... jamais un rendez-vous offert (rien recu)', 0, clotureDuJour(faits(a('12:00'), { rdvs: [{ ...regle, prixXof: 0, payments: [] }] })).gestes.length);
dit('... l acompte reconnu compte comme recu', 1, clotureDuJour(faits(a('12:00'), { rdvs: [{ ...regle, payments: [], depositXof: 30000, depositConfirmed: true }] })).gestes.length);
dit('... un acompte demande mais pas reconnu ne compte pas', 0, clotureDuJour(faits(a('12:00'), { rdvs: [{ ...regle, payments: [], depositXof: 30000 }] })).gestes.length);
const g2f = faits(a('12:00'), { rdvs: [regle] });
vrai('... le geste vaut encore sur les memes faits', gesteToujoursValable(g1.gestes[0], g2f));
vrai('... il ne vaut plus quand le rendez-vous a bouge (annule entre-temps)', !gesteToujoursValable(g1.gestes[0], { ...g2f, rdvs: [{ ...regle, status: 'annulé' }] }));

const honoreSansPiece = rdv('r-10', 'c-3', '10:00', 60, 35000, { status: 'honoré' });
const orpheline = piece('inv-10', 'F-2026-0900', 'c-3', 35000, { payments: [especes('p-10', 35000, '11:05')], whatsapp: parti('11:05') });
const g3 = clotureDuJour(faits(a('12:00'), { rdvs: [honoreSansPiece], pieces: [orpheline] }));
dit('honore sans piece, un seul candidat : Grenat relie', [{ genre: 'relier-la-piece', rdvId: 'r-10', pieceId: 'inv-10' }],
  g3.gestes.map((g) => ({ genre: g.genre, rdvId: (g as { rdvId: string }).rdvId, pieceId: (g as { pieceId: string }).pieceId })));
const deux = clotureDuJour(faits(a('12:00'), { rdvs: [honoreSansPiece], pieces: [orpheline, { ...orpheline, id: 'inv-11', number: 'F-2026-0901' }] }));
dit('... deux candidats : rien seul, a revoir', { g: 0, r: 1 }, { g: deux.gestes.length, r: deux.rdvs[0].aRevoir.length });
dit('... un autre prix : rien seul', 0, clotureDuJour(faits(a('12:00'), { rdvs: [honoreSansPiece], pieces: [{ ...orpheline, lines: [ligne(30000)] }] })).gestes.length);
dit('... une autre cliente : rien seul', 0, clotureDuJour(faits(a('12:00'), { rdvs: [honoreSansPiece], pieces: [{ ...orpheline, clientId: 'c-4' }] })).gestes.length);
dit('... un autre jour : rien seul', 0, clotureDuJour(faits(a('12:00'), { rdvs: [honoreSansPiece], pieces: [{ ...orpheline, date: '2026-11-03' }] })).gestes.length);
dit('... une piece deja reliee a un autre rendez-vous n est pas candidate', 0, clotureDuJour(faits(a('12:00'), { rdvs: [honoreSansPiece], pieces: [{ ...orpheline, apptId: 'r-77' }] })).gestes.length);

const recuDu = (plus: Partial<PieceLue> = {}) => piece('inv-20', 'F-2026-0950', 'c-2', 52000, { apptId: 'r-2', payments: [especes('p-20', 52000, '15:10')], ...plus });
const R2h = { ...R2, status: 'honoré', invoiceId: 'inv-20', payments: [{ ...especes('p-20', 52000, '15:10'), invoiceId: 'inv-20' }] };
const papier = (plus: Partial<PieceLue> = {}, f2: Partial<FaitsDeLaJournee> = {}) => clotureDuJour(faits(a('16:00'), { rdvs: [R2h], pieces: [recuDu(plus)], ...f2 }));
const p1 = papier();
dit('le recu d une piece reglee ce jour, pas parti : Grenat l envoie par la salle', [{ genre: 'envoyer-le-papier', papier: 'recu', montantXof: 52000, pieceId: 'inv-20' }],
  p1.gestes.map((g) => ({ genre: g.genre, papier: (g as { papier: string }).papier, montantXof: (g as { montantXof: number }).montantXof, pieceId: (g as { pieceId: string }).pieceId })));
vrai('... ce papier qui attend Grenat ne retient pas le comptage (5 novembre 2026, Yeman)', p1.verdict.close && !p1.verdict.reste.some((r) => /Grenat/.test(r)));
dit('... deja parti : rien', [], papier({ whatsapp: parti('15:11') }).gestes);
dit('... « Pas de recu ni de facture par WhatsApp » : rien', { g: 0, p: 'excepte' },
  (() => { const c = papier({}, { fiches: fiches.map((x) => (x.id === 'c-2' ? { ...x, sansPapiersWa: true } : x)) }); return { g: c.gestes.length, p: c.pieces[0].papier }; })());
dit('... deja en salle d attente : rien de plus', { g: 0, p: 'en-salle' },
  (() => { const c = papier({}, { envois: [{ id: idDuPapier('inv-20'), type: TYPE_DU_PAPIER, statut: A_PREPARER, invoiceId: 'inv-20' }] }); return { g: c.gestes.length, p: c.pieces[0].papier }; })());
dit('... ecarte par une main : on ne le renvoie pas', 'excepte', papier({}, { envois: [{ id: idDuPapier('inv-20'), type: TYPE_DU_PAPIER, statut: 'écarté', invoiceId: 'inv-20' }] }).pieces[0].papier);
dit('... sans numero sur la fiche : a revoir, rien ne part', { g: 0, p: 'sans-numero', r: 1 },
  (() => { const c = papier({}, { fiches: fiches.map((x) => (x.id === 'c-2' ? { ...x, aUnNumero: false } : x)) }); return { g: c.gestes.length, p: c.pieces[0].papier, r: c.pieces[0].aRevoir.length }; })());
dit('... une vente sans fiche : pas de papier', 'excepte', papier({ clientId: '' }).pieces[0].papier);
dit('... un rituel d un jour passe regle ce jour : jamais (le retard reste invisible)', 'excepte',
  clotureDuJour(faits(a('16:00'), { rdvs: [], pieces: [recuDu({ apptId: undefined, date: '2026-10-28' })] })).pieces[0].papier);
const aRegler = clotureDuJour(faits(a('16:00'), { rdvs: [{ ...R2, status: 'honoré', invoiceId: 'inv-20' }], pieces: [recuDu({ status: 'envoyée', payments: [] })] }));
dit('la facture a regler d un rituel du jour, pas partie : Grenat l envoie', { papier: 'facture', montantXof: 52000 },
  (({ papier: p, montantXof }) => ({ papier: p, montantXof }))(aRegler.gestes[0] as { papier: string; montantXof: number }));
dit('... honore et a regler, sa facture partie : la journee la tient pour close', 'clos',
  clotureDuJour(faits(a('16:00'), { rdvs: [{ ...R2, status: 'honoré', invoiceId: 'inv-20' }], pieces: [recuDu({ status: 'envoyée', payments: [], whatsapp: parti('15:30') })] })).rdvs[0].etat);
dit('... un brouillon ne part pas', 0, clotureDuJour(faits(a('16:00'), { rdvs: [{ ...R2, status: 'honoré', invoiceId: 'inv-20' }], pieces: [recuDu({ status: 'brouillon', payments: [] })] })).gestes.length);

/* ── 4. Une seule facture, au meme prix, le meme argent ── */
dit('deux factures pour un rendez-vous : a revoir', 'a-revoir', clotureDuJour(faits(a('16:00'), { rdvs: [{ ...R2h, payments: [] }], pieces: [recuDu({ whatsapp: parti('15:11'), payments: [] , status: 'envoyée' }), recuDu({ id: 'inv-21', number: 'F-2026-0951', whatsapp: parti('15:11'), payments: [], status: 'envoyée' })] })).rdvs[0].etat);
const prixAutre = clotureDuJour(faits(a('16:00'), { rdvs: [{ ...R2h, prixXof: 50000 }], pieces: [recuDu({ whatsapp: parti('15:11') })] }));
vrai('un autre prix au rendez-vous et sur la piece : a revoir', prixAutre.rdvs[0].aRevoir.some((r) => r.cle === 'prix:r-2'), prixAutre.rdvs[0].aRevoir);
const argentAutre = clotureDuJour(faits(a('16:00'), { rdvs: [{ ...R2h, payments: [{ ...especes('p-20', 50000, '15:10'), invoiceId: 'inv-20' }], prixXof: 52000 }], pieces: [recuDu({ whatsapp: parti('15:11') })] }));
vrai('un autre argent au Carnet et sur la piece : a revoir', argentAutre.rdvs[0].aRevoir.some((r) => r.cle === 'argent:r-2'), argentAutre.rdvs[0].aRevoir);
const memeArgent = clotureDuJour(faits(a('16:00'), { rdvs: [R2h], pieces: [recuDu({ whatsapp: parti('15:11'), payments: [especes('p-20', 52000, '15:10'), { ...especes('p-g', 8000, '15:10'), note: 'Gamme · huile' }] })] }));
dit('... la Gamme et l acompte ne comptent pas dans l argent du rituel', 'clos', memeArgent.rdvs[0].etat);
const decide = clotureDuJour(faits(a('16:00'), { rdvs: [{ ...R2h, prixXof: 50000 }], pieces: [recuDu({ whatsapp: parti('15:11') })], decisions: [{ cle: 'prix:r-2', par: 'Brice' }] }));
dit('... la direction tranche : le constat se ferme', 'clos', decide.rdvs[0].etat);

/* ── 5. Une seule remise ── */
dit('les natures de remise', [['famille'], ['code'], ['main'], ['code', 'famille'], ['famille', 'main'], ['main', 'prix convenus'], ['code', 'abonnee']], [
  remisesDuRdv({ ...R2, remiseFamille: true, discountPct: 10 }),
  remisesDuRdv({ ...R2, discountXof: 5000, remiseDuComptoirXof: 5000 }),
  remisesDuRdv({ ...R2, discountPct: 10 }),
  remisesDuRdv({ ...R2, codeOffre: 'MERCREDI15', remiseFamilleXof: 3000, discountXof: 3000 }),
  remisesDuRdv({ ...R2, remiseFamilleXof: 3000, discountXof: 5000 }),
  remisesDuRdv({ ...R2, discountXof: 2000 }, { id: 'c-2', prixConvenus: true }),
  remisesDuRdv({ ...R2, subId: 'sub-1', offreId: 'of-1' }),
]);
const deuxRemises = clotureDuJour(faits(a('16:00'), { rdvs: [{ ...R2h, codeOffre: 'MERCREDI15', remiseFamille: true, discountPct: 10 }], pieces: [recuDu({ whatsapp: parti('15:11') })] }));
vrai('deux remises sur un rendez-vous honore : a revoir', deuxRemises.rdvs[0].aRevoir.some((r) => r.cle === 'remise:r-2'), deuxRemises.rdvs[0].aRevoir);
const PLACES = { id: 'of-places', code: 'PLACES15', active: true, placesParJour: 3, jourVideSeulement: true };
const avecPlace = { ...R2h, offreId: 'of-places', creeLe: '2026-11-02T10:00:00Z' };
const autreAvant = rdv('r-30', 'c-6', '09:00', 60, 20000, { creeLe: '2026-11-01T10:00:00Z' });
const placePleine = clotureDuJour(faits(a('16:00'), { rdvs: [avecPlace, autreAvant], pieces: [recuDu({ whatsapp: parti('15:11') })], offres: [PLACES] }));
vrai('une place limitee prise un jour qui avait deja un rendez-vous : a revoir', placePleine.rdvs.find((r) => r.id === 'r-2')?.aRevoir.some((x) => x.cle === 'place:r-2') ?? false, placePleine.rdvs);
const placeTenue = clotureDuJour(faits(a('16:00'), { rdvs: [avecPlace, { ...autreAvant, creeLe: '2026-11-03T10:00:00Z' }], pieces: [recuDu({ whatsapp: parti('15:11') })], offres: [PLACES] }));
dit('... prise sur un jour vide, gardee quand le jour s est rempli apres : permise', [], placeTenue.rdvs.find((r) => r.id === 'r-2')?.aRevoir);
const tropDePlaces = clotureDuJour(faits(a('16:00'), { rdvs: [avecPlace, { ...avecPlace, id: 'r-31', status: 'confirmé', time: '17:00' }], pieces: [recuDu({ whatsapp: parti('15:11') })], offres: [{ ...PLACES, placesParJour: 1, jourVideSeulement: false }] }));
vrai('... plus de places prises que permises : a revoir', tropDePlaces.rdvs.find((r) => r.id === 'r-2')?.aRevoir.some((x) => x.cle === 'place:r-2') ?? false, tropDePlaces.rdvs);

/* ── 6. La caisse du jour ── */
const caisse = clotureDuJour(faits(a('20:00'), { rdvs: [], pieces: [
  piece('k1', 'F-1', 'c-1', 30000, { tipXof: 2000, payments: [especes('a', 10000, '10:00'), { id: 'b', date: JOUR, amountXof: 20000, method: 'MTN MoMo', cashbox: 'Téléphone MoMo', time: '11:00' }], whatsapp: parti('11:00') }),
  piece('k2', 'F-2', 'c-2', 50000, { payments: [{ id: 'c', date: JOUR, amountXof: 15000, method: 'Avoir' }, { id: 'd', date: JOUR, amountXof: 5000, method: 'Acompte' }, { id: 'e', date: '2026-11-03', amountXof: 10000, method: 'Espèces', cashbox: 'Real Money' }, { id: 'f', date: JOUR, amountXof: 20000, method: 'Carte', cashbox: 'TPE' }], status: 'payée', whatsapp: parti('12:00') }),
  piece('k3', 'D-1', 'c-3', 9000, { kind: 'devis', payments: [especes('g', 9000, '12:00')] }),
] }));
dit('la caisse ne compte que l argent recu ce jour, ni avoir ni acompte ni devis', { t: 50000, n: 3, pb: 2000 }, { t: caisse.caisse.totalXof, n: caisse.caisse.versements, pb: caisse.caisse.pourboiresXof });
dit('... par moyen, dans l ordre du comptoir', [{ famille: 'Espèces', totalXof: 10000 }, { famille: 'MTN MoMo', totalXof: 20000 }, { famille: 'Carte', totalXof: 20000 }], caisse.caisse.parMoyen);
dit('... par tiroir', [{ tiroir: 'Real Money', totalXof: 10000 }, { tiroir: 'Téléphone MoMo', totalXof: 20000 }, { tiroir: 'TPE', totalXof: 20000 }], caisse.caisse.parTiroir);

/* ── 7. La Maison fermee ── */
dit('un jour ferme sans rien : rien a clore', { c: true, d: 'La Maison est fermée ce jour : rien à clore.' },
  (({ verdict }) => ({ c: verdict.close, d: verdict.dit }))(clotureDuJour({ jour: '2026-11-08', maintenantMs: a('19:00', '2026-11-08'), ferme: true, rdvs: [], pieces: [], fiches })));
dit('un jour sans rien, ouvert : la journee est close', 'La journée est close : la caisse peut se compter.',
  clotureDuJour({ jour: JOUR, maintenantMs: a('19:00'), rdvs: [], pieces: [], fiches }).verdict.dit);
dit('une autre maison ne se compte pas', 0, clotureDuJour(faits(a('16:00'), { rdvs: [{ ...R2, branchId: 'ailleurs' }] })).rdvs.length);
dit('le lendemain, tout rendez-vous de la veille est fini', 'sans-etat', clotureDuJour(faits(a('07:00', '2026-11-05'), { rdvs: [R7] })).rdvs[0].etat);

/* ── 8. Les copies et les gardes, lues dans les fichiers ── */
const lf = (s: string) => s.replace(/\r\n/g, '\n');
const lis = (f: string) => lf(readFileSync(f, 'utf8'));
const entre = (src: string, nom: string): string | null => {
  const ouvre = `/* ⟨${nom}⟩ */\n`;
  const i = src.indexOf(ouvre);
  const k = src.indexOf(`\n/* ⟨/${nom}⟩ */`, i);
  return i < 0 || k < 0 ? null : src.slice(i + ouvre.length, k);
};
const original = entre(lis('src/shared/cloture-du-jour-pur.ts'), 'cloture-du-jour');
vrai('l original porte son bloc', !!original && original.length > 1000);
const fonction = lis('supabase/functions/cloture-du-jour/index.ts');
const copie = entre(fonction, 'cloture-du-jour');
vrai('la fonction porte la copie du bloc', copie !== null);
dit('la copie de la fonction est l original, caractere pour caractere', original, copie?.trimEnd());
vrai('la fonction ne pousse jamais un nom de cliente dans la notification', /notificationDeLaCloture\(/.test(fonction) && !/body:\s*[^,]*\bqui\b/.test(fonction));
vrai('la fonction lit les pieces effacees dans traces (operation efface sur invoices)', /from\('traces'\)[\s\S]{0,200}eq\('table_name', 'invoices'\)[\s\S]{0,120}eq\('operation', 'efface'\)/.test(fonction));
const horsDuBloc = fonction.slice(fonction.indexOf('/* ⟨/cloture-du-jour⟩ */'));
vrai('la fonction relit avant d ecrire (gesteToujoursValable sur la ligne fraiche) et ecrit sous condition (updated_at)',
  horsDuBloc.includes('if (!gesteToujoursValable(g, { ...faitsDe(), rdvs: rdvsFrais, pieces: piecesFraiches })) {') && (horsDuBloc.match(/\.eq\('updated_at', fra[a-z]+\.updated_at\)/g) ?? []).length >= 3);
vrai('le mot du matin n envoie aucun papier (le papier d hier ne part pas le lendemain)', /if \(matin && g\.genre === 'envoyer-le-papier'\)/.test(horsDuBloc));
vrai('la fonction ne notifie ni a l essai ni au mot du matin, et une fois par passage', /if \(!essai && !matin && !dejaDit && pourLaNotification\)/.test(horsDuBloc));
vrai('la fonction ne travaille qu aux heures reglees', /if \(!matin && !essai && !heures\.includes\(ici\.heure\)\)/.test(horsDuBloc));
vrai('la fonction lit par pages de mille', /PAGE = 1000/.test(fonction) && /\.range\(/.test(fonction));
vrai('la fonction ne parle jamais a la cliente en direct (pas de graph.facebook.com)', !/graph\.facebook\.com/.test(fonction));
vrai('la fonction lit les heures reglees (heuresDeLaCloture) et les horaires (laMaisonEstFermee)', /heuresDeLaCloture\(/.test(fonction) && /laMaisonEstFermee\(/.test(fonction));
vrai('la fonction depose son bilan pour Saphir', /assistants_bilans/.test(fonction) && /grenat:/.test(fonction));

const migrations = readdirSync('supabase/migrations').filter((n) => /^0156_/.test(n));
dit('une seule migration 0156', 1, migrations.length);
const sql = migrations.length ? lis(`supabase/migrations/${migrations[0]}`) : '';
vrai('0156 : le compte rendu sous RLS', /create table if not exists public\.clotures_de_grenat/.test(sql) && /alter table public\.clotures_de_grenat enable row level security/.test(sql));
vrai('0156 : les decisions de la direction sous RLS, ecrites par le souverain seul', /alter table public\.cloture_decisions enable row level security/.test(sql) && /cloture_decisions_ecrire[\s\S]{0,200}is_souverain\(\)/.test(sql));
vrai('0156 : la garde, une piece payee ne s efface que par la direction', /create or replace function public\.garde_des_pieces_payees\(\)/.test(sql) && /before delete on public\.invoices/.test(sql) && /is_souverain\(\)/.test(sql));
vrai('0156 : le motif ecrit avant l effacement (efface_la_piece_payee)', /create or replace function public\.efface_la_piece_payee\(p_id text, p_motif text\)/.test(sql) && /length\(trim\(coalesce\(p_motif/.test(sql));
vrai('0156 : les crons de Grenat (chaque heure du salon, et le mot du matin)', /cron\.schedule\('cloture-de-grenat'/.test(sql) && /cron\.schedule\('cloture-de-grenat-matin'/.test(sql));
vrai('0156 : aucune table repli_ sans RLS', !/create table[^;]*repli_/i.test(sql) || /repli_[\s\S]*enable row level security/.test(sql));

/* ── 9. Ses deux choix du 5 novembre 2026 ── */
vrai('le comptoir prevenu = qui a encaisse ce jour-la (les pieces seules, pas les rendez-vous)',
  /\.eq\('table_name', 'invoices'\)\.eq\('porte', 'trone'\)/.test(fonction) && !/'appointments'\]\)\.eq\('porte', 'trone'\)/.test(fonction));
vrai('Les caisses : « Cloturer la caisse » reste, porte de secours de la direction seule',
  /\{estDirection && \(\s*<button[^>]*onClick=\{\(\) => setClotureOuverte\(true\)\}>\s*Clôturer la caisse/.test(lis('src/apps/trone/routes/finances/Caisses.tsx')));

/* ── 10. Les depenses du jour (5 novembre 2026) ──
   « Comment Grenat saisit les depenses ? » Il ne les saisit pas ; « Oui, il
   les relit a 19 h » (Yeman ; maquette 9KCMgAb1..., section 8). Le constat
   reel : aucune depense saisie depuis le 1er novembre 2026 ; les dernieres,
   31 octobre 2026 (7, 92 425 F, 4 sans porteur) ; aucune jamais « a valider ».
   Scenario fictif equivalent, les montants de la maquette. */
const exp = (e: Partial<DepenseLue>) => e as unknown as Expense;
const casDeMontant: Partial<DepenseLue>[] = [{ amountXof: 3000 }, { amountXof: 9000, items: [{ amountXof: 4000 }, { amountXof: 2500 }] }, { amountXof: 5000, items: [] }];
dit('montantDeLaDepense = expenseTotal (finance)', casDeMontant.map((e) => expenseTotal(exp(e))), casDeMontant.map((e) => montantDeLaDepense(e)));
const casDAttente: Partial<DepenseLue>[] = [{}, { validation: { etat: 'attente', soumisLe: '2026-11-04T12:00:00Z', soumisPar: 'Opale' } },
  { validation: { etat: 'validee', soumisLe: '2026-11-04T12:00:00Z', soumisPar: 'Opale' } }, { validation: { etat: 'refusee', soumisLe: '2026-11-04T12:00:00Z', soumisPar: 'Opale' } },
  { validation: { etat: 'attente', soumisLe: '2026-11-05T12:00:00Z', soumisPar: 'Opale' } }, { validation: { etat: 'attente', soumisLe: 'illisible', soumisPar: 'Opale' } }];
dit('depenseEnAttente = estEnAttente (finance)', casDAttente.map((e) => estEnAttente(exp(e))), casDAttente.map((e) => depenseEnAttente(e)));
dit('heuresDAttente = heuresDattente (finance)', casDAttente.map((e) => heuresDattente(exp(e), a('19:00'))), casDAttente.map((e) => heuresDAttente(e, a('19:00'))));
dit('les dates dites, l annee toujours', ['1er novembre 2026', '4 novembre 2026', '31 octobre 2026'], [dateDite('2026-11-01'), dateDite('2026-11-04'), dateDite('2026-10-31')]);

const D = (id: string, plus: Partial<DepenseLue> = {}): DepenseLue => ({
  id, branchId: 'maison', label: 'Achat', amountXof: 10000, date: JOUR, cashbox: 'Caisse Principale', category: 'Divers', porteur: 'Sandrine', fichier: true, ...plus,
});
const attend = (soumisLe: string, soumisPar = 'Opale') => ({ etat: 'attente', soumisLe, soumisPar });
/* « PAS BESOIN DE PHOTO » (Yeman, 5 novembre 2026, au selecteur) : Grenat ne
   reclame plus jamais la photo du recu, a aucun montant ; seul « qui a paye »
   manquant rend une depense a completer. */
dit('ce qui manque : qui a paye, et jamais la photo du recu, a aucun montant', [['porteur'], ['porteur'], [], [], [], [], [], []], [
  ceQuiManqueALaDepense(D('m1', { porteur: undefined, fichier: undefined, amountXof: 64600 })),
  ceQuiManqueALaDepense(D('m2', { porteur: '  ', fichier: undefined, amountXof: 4999 })),
  ceQuiManqueALaDepense(D('m3', { porteur: undefined, laMaisonAPaye: true, fichier: undefined, amountXof: 2000 })),
  ceQuiManqueALaDepense(D('m4')),
  ceQuiManqueALaDepense(D('m5', { fichier: undefined, amountXof: 5000 })),
  ceQuiManqueALaDepense(D('m6', { fichier: undefined, amountXof: 0, items: [{ amountXof: 3000 }, { amountXof: 3000 }] })),
  ceQuiManqueALaDepense(D('m7', { fichier: undefined, amountXof: 20000 })),
  ceQuiManqueALaDepense(D('m8', { fichier: undefined, amountXof: 300000 })),
]);

const TRANSPORT = D('d-transport', { label: 'Transport des produits', amountXof: 3000, fichier: undefined, validation: attend('2026-11-04T12:00:00Z') });
const DEPENSES: DepenseLue[] = [
  TRANSPORT,
  D('d-meches', { label: 'Mèches', amountXof: 64600, category: 'Matières premières', porteur: undefined, fichier: undefined }),
  D('d-loyer', { label: 'Loyer', amountXof: 300000, recurring: 'mensuel', porteur: undefined, fichier: undefined }),
  D('d-paie', { label: 'Salaire', amountXof: 80000, source: 'run', porteur: undefined, fichier: undefined }),
  D('d-eau', { label: 'Eau', amountXof: 500, fichier: undefined }),
  D('d-refusee', { label: 'Taxi', amountXof: 7000, porteur: undefined, fichier: undefined, validation: { etat: 'refusee', soumisLe: '2026-11-04T09:00:00Z', soumisPar: 'K.' } }),
  D('d-avant', { label: 'Gaz', amountXof: 6000, date: '2026-11-02', validation: attend('2026-11-02T10:00:00Z', 'Kabirou') }),
  D('d-maison', { label: 'Savon', amountXof: 8000, porteur: undefined, laMaisonAPaye: true }),
  D('d-ailleurs', { branchId: 'ailleurs', label: 'Autre maison', porteur: undefined, fichier: undefined }),
  D('d-pour-ecart', { label: 'Coursier', amountXof: 1500, ecartDe: 'clo-7' }),
];
const C = (id: string, plus: Partial<ComptageLu> = {}): ComptageLu => ({ id, branchId: 'maison', cashbox: 'Real Money', date: JOUR, ecartXof: 0, le: '2026-11-04T18:00:00Z', ...plus });
const COMPTAGES: ComptageLu[] = [
  C('clo-1', { ecartXof: -2500, note: 'monnaie rendue' }),
  C('clo-2', { ecartXof: -1000, depenses: ['exp-x'] }),
  C('clo-3', { ecartXof: 500 }),
  C('clo-4', { ecartXof: -3000, validation: { verdict: 'accepte' } }),
  C('clo-5', { ecartXof: -4000 }), C('clo-6', { ecartXof: 0, reprend: 'clo-5' }),
  C('clo-7', { ecartXof: -1500 }),
  C('clo-8', { ecartXof: -900, date: '2026-11-03' }),
  C('clo-9', { ecartXof: -700, branchId: 'ailleurs' }),
];
const jd = (ms: number, plus: Partial<FaitsDeLaJournee> = {}) => clotureDuJour({ jour: JOUR, maintenantMs: ms, branchId: 'maison', rdvs: [], pieces: [], fiches, depenses: DEPENSES, comptages: COMPTAGES, ...plus });
const d19 = jd(a('19:00'));
const sous = d19.depenses;
dit('19 h : ce que Grenat met sous les yeux, dans l ordre de la maquette', [['a-valider', 'd-avant'], ['a-valider', 'd-transport'], ['a-completer', 'd-meches'], ['ecart-sans-depense', 'clo-1']],
  sous?.constats.map((c) => [c.genre, c.depenseId ?? c.comptageId]));
const ligneDe = (id: string) => sous?.constats.find((c) => (c.depenseId ?? c.comptageId) === id);
dit('19 h : la depense posee par Opale, comme la maquette la dit',
  { quoi: `Transport des produits · ${F(3000)}`, heure: '13 h 00', dit: 'Posée par Opale, à valider depuis 6 heures. Caisse Principale.', etat: 'À valider', gestes: ['valider', 'refuser'], bloque: true },
  (({ quoi, heure, dit: d, etatDit, gestes, bloque }) => ({ quoi, heure, dit: d, etat: etatDit, gestes, bloque }))(ligneDe('d-transport')!));
dit('... celle d un autre jour attend aussi, sa date dite, sans retenir le comptage',
  { dit: 'Du 2 novembre 2026, posée par Kabirou, à valider depuis 56 heures. Caisse Principale.', bloque: false, heure: '' },
  (({ dit: d, bloque, heure }) => ({ dit: d, bloque, heure }))(ligneDe('d-avant')!));
dit('... les meches, sans qui a paye : un seul geste, « Dire qui a paye », et pas un mot de la photo',
  { quoi: `Mèches · ${F(64600)}`, dit: 'Matières premières, Caisse Principale : sans qui a payé.', etat: 'À compléter', gestes: ['dire-qui-a-paye'], manque: ['porteur'], bloque: false },
  (({ quoi, dit: d, etatDit, gestes, manque, bloque }) => ({ quoi, dit: d, etat: etatDit, gestes, manque, bloque }))(ligneDe('d-meches')!));
vrai('19 h : aucune ligne de Grenat ne parle de photo ni de reçu', (sous?.constats.length ?? 0) > 0 && !sous!.constats.some((c) => /photo|reçu|justificatif/i.test(`${c.quoi} ${c.dit}`)),
  sous?.constats.filter((c) => /photo|reçu|justificatif/i.test(`${c.quoi} ${c.dit}`)).map((c) => c.dit));
const SANS_PHOTO = D('d-sans-photo', { label: 'Produits', amountXof: 20000, category: 'Matières premières', porteur: 'Sandrine', fichier: undefined });
const sp = jd(a('19:00'), { depenses: [SANS_PHOTO], comptages: [] });
dit('« Pas besoin de photo » : une depense de 20 000 F sans photo mais avec qui a paye n est PAS a completer',
  { constats: [], aCompleter: 0, saisies: 1, totalXof: 20000, aDire: [], close: true },
  { constats: sp.depenses?.constats.map((c) => [c.genre, c.depenseId]), aCompleter: sp.depenses?.comptes.aCompleter, saisies: sp.depenses?.saisies, totalXof: sp.depenses?.totalXof, aDire: sp.depenses?.aDire, close: sp.verdict.close });
const spAttente = jd(a('19:00'), { depenses: [{ ...SANS_PHOTO, id: 'd-sans-photo-attente', validation: attend('2026-11-04T12:00:00Z') }], comptages: [] });
dit('... posee par Opale et a valider, Grenat ne dit rien de la photo non plus',
  { dit: 'Posée par Opale, à valider depuis 6 heures. Caisse Principale.', gestes: ['valider', 'refuser'], manque: undefined },
  (({ dit: d, gestes, manque }) => ({ dit: d, gestes, manque }))(spAttente.depenses?.constats[0] ?? { dit: '', gestes: [], manque: ['?'] }));
dit('... l ecart du tiroir sans depense en face, avec sa note',
  { quoi: `Tiroir Real Money · ${F(2500)} de moins que l’attendu`, dit: 'Au comptage de 19 h 00, un écart sans dépense en face : une dépense oubliée ? Sa note : « monnaie rendue ».',
    gestes: ['c-etait-une-depense', 'laisser-l-ecart'], tiroir: 'Real Money', montant: 2500, note: 'monnaie rendue', cle: 'ecart:clo-1' },
  (({ quoi, dit: d, gestes, tiroir, montantXof, note, cle }) => ({ quoi, dit: d, gestes, tiroir, montant: montantXof, note, cle }))(ligneDe('clo-1')!));
dit('19 h : les saisies du jour (en attente comprises ; ni la recurrente, ni la paie, ni la refusee, ni l autre maison)', { n: 5, t: 77600 }, { n: sous?.saisies, t: sous?.totalXof });
dit('19 h : la depense a valider du jour retient le comptage, et elle seule',
  { close: false, reste: ['1 dépense à valider'], dit: '1 dépense à valider, la caisse ne se compte pas encore' },
  { close: d19.verdict.close, reste: d19.verdict.reste, dit: d19.verdict.dit });
dit('19 h : la notification, en nombres',
  { titre: 'Clôture de 19 h', corps: '1 dépense à valider, 1 dépense d’un jour passé à valider, 1 dépense à compléter, 1 écart de tiroir sans dépense.' }, notificationDeLaCloture(d19, 19));
const validee = jd(a('19:00'), { depenses: DEPENSES.map((e) => (e.id === 'd-transport' ? { ...e, validation: { ...attend('2026-11-04T12:00:00Z'), etat: 'validee' } } : e)) });
dit('validee, la journee est close malgre la depense a completer et l ecart', { close: true, dit: 'La journée est close : la caisse peut se compter.' }, { close: validee.verdict.close, dit: validee.verdict.dit });
dit('... et la notification de 19 h les dit quand meme, en nombres',
  'La journée est close : la caisse peut se compter. À voir aussi : 1 dépense d’un jour passé à valider, 1 dépense à compléter, 1 écart de tiroir sans dépense.', notificationDeLaCloture(validee, 19).corps);
const refusee = jd(a('19:00'), { depenses: DEPENSES.map((e) => (e.id === 'd-transport' ? { ...e, validation: { ...attend('2026-11-04T12:00:00Z'), etat: 'refusee' } } : e)) });
dit('refusee, elle ne retient plus rien et ne se relit plus', { close: true, lignes: 0 }, { close: refusee.verdict.close, lignes: refusee.depenses?.constats.filter((c) => c.depenseId === 'd-transport').length });
const d15 = jd(a('15:00'));
dit('15 h : la depense a valider du jour retient deja le comptage ; le reste attend la relecture de 19 h',
  { reste: ['1 dépense à valider'], aDire: [], corps: '1 dépense à valider.', relues: false }, { reste: d15.verdict.reste, aDire: d15.depenses?.aDire, corps: notificationDeLaCloture(d15, 15).corps, relues: d15.depenses?.relues });
dit('... les constats se voient deja a l ecran', 4, d15.depenses?.constats.length);
dit('laisser l ecart (une decision de la direction) le ferme', [], jd(a('19:00'), { decisions: [{ cle: cleDeLEcart('clo-1'), par: 'Brice', mot: 'L écart reste, avec sa note.' }] })
  .depenses?.constats.filter((c) => c.genre === 'ecart-sans-depense'));
dit('un compte rendu d avant (sans depenses) se notifie comme avant', { titre: 'Clôture de 19 h', corps: '2 rendez-vous à clore.' },
  notificationDeLaCloture({ verdict: { close: false, dit: '', reste: ['2 rendez-vous à clore'] }, comptes: q19.comptes, alarmes: [] }, 19));

/* Le jour ouvert sans aucune depense saisie : il le DEMANDE. */
const sansRien = (ms: number, plus: Partial<FaitsDeLaJournee> = {}) => clotureDuJour({ jour: JOUR, maintenantMs: ms, branchId: 'maison', rdvs: [], pieces: [], fiches,
  depenses: DEPENSES.filter((e) => ['d-loyer', 'd-paie', 'd-refusee', 'd-ailleurs'].includes(e.id)), comptages: [], ...plus });
const s19 = sansRien(a('19:00'));
dit('un jour ouvert sans depense saisie : Grenat le demande a 19 h, sans rien supposer',
  { genre: 'jour-sans-depense', quoi: 'Aucune dépense saisie aujourd’hui', gestes: ['saisir', 'rien-aujourdhui'], bloque: false, cle: cleDuJourSansDepense(JOUR) },
  (({ genre, quoi, gestes, bloque, cle }) => ({ genre, quoi, gestes, bloque, cle }))(s19.depenses?.constats[0] ?? { genre: '', quoi: '', gestes: [], bloque: true, cle: '' }));
dit('... sans retenir la journee ; la notification le dit', { close: true, corps: 'La journée est close : la caisse peut se compter. À voir aussi : aucune dépense saisie.' },
  { close: s19.verdict.close, corps: notificationDeLaCloture(s19, 19).corps });
dit('... pas a 15 h', 0, sansRien(a('15:00')).depenses?.constats.length);
dit('... pas un jour ferme', 0, sansRien(a('19:00'), { ferme: true }).depenses?.constats.length);
dit('... « Rien aujourd hui » de la direction le ferme', 0, sansRien(a('19:00'), { decisions: [{ cle: cleDuJourSansDepense(JOUR), par: 'Yéman' }] }).depenses?.constats.length);
dit('... l heure reglee de la relecture (20 h) : pas encore a 19 h', 0, sansRien(a('19:00'), { heureDesDepenses: 20 }).depenses?.constats.length);
dit('... le lendemain matin, la veille se relit en entier', 'Aucune dépense saisie ce jour-là', sansRien(a('07:00', '2026-11-05')).depenses?.constats[0]?.quoi);
dit('... sans depenses lues, rien ne se dit (l absence de faits n est pas un jour sans depense)', { lues: false, n: 0 },
  (({ depenses }) => ({ lues: depenses?.lues, n: depenses?.constats.length }))(sansRien(a('19:00'), { depenses: undefined })));
dit('... une depense de l autre maison ne compte pas comme saisie ici', 'jour-sans-depense', s19.depenses?.constats[0]?.genre);

/* Les copies dans la fonction, les gestes au Trone. */
vrai('la fonction lit les depenses du jour, celles qui attendent et celles de l ecart, par pages de mille',
  /from\('expenses'\)\.select\('id, branch_id, data'\)\.eq\('data->>date', jour\)\.order\('id'\)\.range\(/.test(horsDuBloc)
  && /from\('expenses'\)\.select\('id, branch_id, data'\)\.eq\('data->validation->>etat', 'attente'\)\.order\('id'\)\.range\(/.test(horsDuBloc)
  && /from\('expenses'\)\.select\('id, branch_id, data'\)\.in\('data->>ecartDe', t\)/.test(horsDuBloc));
vrai('la fonction lit les comptages de tiroir du jour', /from\('clotures_caisse'\)\.select\('id, branch_id, data'\)\.eq\('data->>date', jour\)/.test(horsDuBloc));
vrai('la fonction n ecrit jamais une depense', !/from\('expenses'\)\s*\.\s*(insert|update|upsert|delete)\(/.test(fonction) && !/from\('expenses'\)[^;\n]*\.(insert|update|upsert|delete)\(/.test(fonction));
vrai('la fonction passe a la regle les depenses, les comptages et l heure de la relecture (la derniere cloture)',
  /envois, depenses, comptages, heureDesDepenses \}\);/.test(horsDuBloc) && /const heureDesDepenses = Math\.max\(\.\.\.heures\);/.test(horsDuBloc));
const journee = lis('src/apps/trone/routes/finances/LaJournee.tsx');
const posDep = journee.indexOf('data-lj="depenses"');
vrai('La journee : les depenses sous les rendez-vous, avant la caisse du jour',
  posDep > journee.indexOf('Les rendez-vous du jour') && journee.indexOf('Les rendez-vous du jour') > 0 && posDep < journee.indexOf('data-lj="caisse-resume"') && posDep < journee.indexOf('<JournalDeCaisse'));
vrai('La journee : Valider et Refuser par la validation de toujours (peutValider) ; Rien aujourd hui et Laisser l ecart a la direction seule',
  journee.includes("if (g === 'valider' || g === 'refuser') { const e = depenseDe(c.depenseId); return !!e && peutValider(me?.role, monNom, e); }")
  && journee.includes("if (g === 'rien-aujourdhui' || g === 'laisser-l-ecart') return souverain;")
  && journee.includes("if (!souverain) { toast('La direction seule le dit.'); return; }"));
vrai('La journee : Dire qui a paye ouvre la fiche ; Saisir et C etait une depense ouvrent le formulaire',
  journee.includes("navigate(`/depenses?depense=${encodeURIComponent(c.depenseId ?? '')}&volet=porteur`);")
  && journee.includes("const q = new URLSearchParams({ nouvelle: '1', date: jour });") && journee.includes("if (c.comptageId) q.set('ecart', c.comptageId);"));
vrai('« Pas besoin de photo » : ni La journee ni la regle ne proposent « Joindre la photo » (la photo reste libre depuis la fiche)',
  !/joindre-la-photo|Joindre la photo|volet=recu/.test(journee) && !/joindre-la-photo|SEUIL_DE_LA_PHOTO|e\.fichier/.test(original ?? 'joindre-la-photo'));
const blocDeLaJournee = journee.slice(posDep, journee.indexOf('{alarmes.length > 0 && ('));
const litteraux = (s: string) => s.match(/'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`|>[^<>{}\n]+</g) ?? [];
const blocDeLaRegle = (original ?? '').slice((original ?? '').indexOf('export type DepenseLue'), (original ?? '').indexOf('export function clotureDuJour'));
vrai('les textes neufs : jamais le tiret « — », jamais « salon »', blocDeLaRegle.length > 1000 && blocDeLaJournee.length > 500
  && ![...litteraux(blocDeLaRegle), ...litteraux(blocDeLaJournee)].some((t) => t.includes('—') || /salon/i.test(t)));
const prise = lis('src/apps/trone/routes/finances/useClotureDuJour.ts');
vrai('le Trone juge avec les depenses, les comptages et l heure de la relecture',
  prise.includes('depenses: depenses as unknown as DepenseLue[],') && prise.includes('comptages: comptages as unknown as ComptageLu[],')
  && prise.includes('const heureDesDepenses = Math.max(...heuresDeLaCloture(settings.cloture?.heures));'));
const partage = lis('src/shared/cloture-du-jour.ts');
vrai('decideLaDepense : la validation de toujours (peutValider), le motif exige au refus',
  partage.includes('if (!peutValider(o.role, o.nom, e)) {') && partage.includes("if (!o.oui && !motif) return 'Un refus se donne avec son motif.';"));
vrai('la veille a valider dit les depenses relues par Grenat', lis('src/apps/trone/routes/finances/LaVeilleAValider.tsx').includes('const depensesDites = grenat?.cloture.depenses?.aDire ?? [];'));
const depensesTsx = lis('src/apps/trone/routes/finances/Depenses.tsx');
vrai('Depenses : « C etait une depense » ecrit le lien de l ecart, « La Maison elle-meme » s ecrit',
  depensesTsx.includes('...(form.ecartDe ? { ecartDe: form.ecartDe } : {}),')
  && depensesTsx.includes('const laMaisonAPaye = voitToutesLesDepenses && form.porteurChoisi && !form.porteur.trim();')
  && depensesTsx.includes("if (ecart) setForm((f) => ({ ...f, ecartDe: ecart.slice(0, 120) }));"));

/* NE PAS ENVOYER CE PAPIER (5 novembre 2026) : le geste de la direction pose la ligne de salle
   ecartee de CETTE piece, que la regle 4 lit ; la fiche n'est pas touchee. */
vrai('La journee : « Ne pas envoyer ce papier » pose la ligne de salle ecartee de la piece', /Ne pas envoyer ce papier/.test(journee) && /id = idDuPapier\(g\.pieceId\)/.test(journee) && /type: TYPE_DU_PAPIER, canal: 'whatsapp', statut: 'écarté'/.test(journee) && !/sansPapiersWa/.test(journee.slice(journee.indexOf('const nePasEnvoyer'), journee.indexOf('const appts'))));

if (ko) console.log(`\n${ko} controle(s) en echec.`);
else console.log('\nLa cloture de Grenat tient ses six regles, et relit les depenses du jour.');
