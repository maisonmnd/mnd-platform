/* LA CAISSE DU JOUR, ÉPROUVÉE : 5 novembre 2026.
   `node scripts/verifie-la-caisse-du-jour.mjs` (et `--prouve`).

   Le mercredi 4 novembre 2026 rejoué en DONNÉES DE BANC (le dépôt est
   public : pièces et clientes inventées, initiales seulement, montants de
   banc) : Real Money 77 000 F au matin, sept versements pour 218 000 F,
   7 000 F de pourboires, rien de sorti, 302 000 F disponibles ; MoMoPay
   140 000 F, KkiaPay 60 600 F au livre. Les attentes sont écrites à la main,
   jamais tirées du calcul éprouvé. */
import { readFileSync } from 'node:fs';
import {
  MOTIF_POURBOIRES_REMIS, caissesDuComptoir, cocheeAuDepart, compteEtEcart, etatDeLaCaisse, etatDit, laCaisseDuJour, laRemiseDesPourboires,
  leDepartDuLivre, leLivreDeLaCaisse, lendemainDe, type LivreDeLaCaisse,
  lesCloturesDuSoir, lesTotaux, montantSaisi, pourboiresDesPieces, pourboiresDuJour, pourquoiPasLaCloture, pourquoiPasLaRemiseDesPourboires,
  remisesDesPourboires,
  type CaisseACloturer, type CaisseDuJour, type LigneDuLivre, type LigneDuTableau,
} from '../src/shared/caisse-du-jour-pur';
import { attenduDuTiroir, type Cloture } from '../src/shared/caisse-du-soir-pur';
import { estARegulariser, lesJoursDuTiroir } from '../src/shared/remise-a-zero-pur';
import { MOTIFS_SORTIE_HORS_ACTIVITE, type Cashbox, type Invoice } from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
const vrai = (nom: string, ok: boolean, detail = '') => dit(nom + (ok || !detail ? '' : ` (${detail})`), true, ok);

const B = 'maison';
const J = '2026-11-04';
const VEILLE = '2026-11-03';
const LENDEMAIN = '2026-11-05';
const RM = 'Real Money';
const MOMO = 'MoMoPay Maison MND';
const KKIA = 'KkiaPay';

/* ── Les pièces du jour (données de banc) ── */
const piece = (n: string, heure: string, xof: number, x: Partial<Invoice> = {}, versements?: Invoice['payments']): Invoice => ({
  id: `inv-${n}`, branchId: B, kind: 'facture', number: `F-BANC-${n}`, clientId: '', clientName: `C. ${n}.`, date: J,
  lines: [{ id: `l-${n}`, label: 'Rituel', qty: 1, unitXof: xof, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'payée',
  payments: versements ?? [{ id: `p-${n}`, date: J, time: heure, amountXof: xof, method: 'Espèces', cashbox: RM }],
  ...x,
}) as Invoice;
const PIECES = [
  piece('01', '07:51', 7000),
  piece('02', '21:48', 20000),
  piece('03', '21:48', 20000),
  piece('04', '21:49', 35000),
  piece('05', '21:50', 52000, { tipXof: 4000 }),
  piece('06', '21:54', 37000),
  piece('07', '22:30', 47000, { tipXof: 3000 }),
];
/* Le livre de Real Money comme `boxMoves` le rend : une ligne par pièce. */
const lignesDuLivre = (ps: readonly Invoice[]): LigneDuLivre[] => ps.map((i) => ({ date: J, delta: i.payments![0].amountXof, label: i.clientName!, sub: i.number, invoiceId: i.id }));
const LIVRE_RM = lignesDuLivre(PIECES);
const POURBOIRES = pourboiresDuJour(PIECES, B, J);

const caisse = (nom: string, livreMatinXof: number, moves: LigneDuLivre[] = [], x: Partial<Parameters<typeof laCaisseDuJour>[0]> = {}): CaisseDuJour =>
  laCaisseDuJour({ nom, jour: J, livreMatinXof, moves, enAttente: [], pourboires: POURBOIRES, ...x });

/* ── 1. Real Money, le 4 novembre 2026 ── */
const rm = caisse(RM, 77000, LIVRE_RM);
dit('Real Money : matin 77 000, versements 218 000, pourboires 7 000, sorties 0, disponible 302 000',
  [77000, 218000, 7000, 0, 0, 302000],
  [rm.matinXof, rm.versementsXof, rm.pourboiresXof, rm.autresEntreesXof, rm.sortiesXof, rm.disponibleXof]);
dit('... ses sept versements, au livre 295 000 F le soir', [7, 295000], [rm.entrees.length, rm.livreSoirXof]);
const momo = caisse(MOMO, 140000);
const kkia = caisse(KKIA, 60600);
dit('MoMoPay 140 000 F, KkiaPay 60 600 F : rien n a bougé, le disponible est le livre', [140000, 140000, 60600, 60600, false, false],
  [momo.matinXof, momo.disponibleXof, kkia.matinXof, kkia.disponibleXof, momo.bouge, kkia.bouge]);

/* ── 2. disponible = matin + versements + pourboires − sorties, pour toute ligne ── */
const JOUR_CHARGE: LigneDuLivre[] = [
  ...LIVRE_RM,
  { date: J, delta: -12000, label: 'Coursier', expenseId: 'exp-1' },
  { date: J, delta: -50000, label: 'Versé au coffre' },
  { date: J, delta: -1500, label: 'À régulariser · reste sans pièce' },
  { date: `${J}T15:20:00.000Z`, delta: 30000, label: 'Reçu de MoMoPay Maison MND', transfertId: 't-1' },
  { date: J, delta: -20000, label: 'Transféré vers Banque du banc', transfertId: 't-2' },
];
const charge = caisse(RM, 77000, JOUR_CHARGE);
for (const c of [rm, momo, kkia, charge]) {
  vrai(`${c.nom}${c === charge ? ' (jour chargé)' : ''} : disponible = matin + versements + pourboires + autres entrées − sorties`,
    c.disponibleXof === c.matinXof + c.versementsXof + c.pourboiresXof + c.autresEntreesXof - c.sortiesXof);
}
dit('le jour chargé : 30 000 F reçus d une autre caisse en entrée ; dépense, coffre, régulariser, transfert en sorties',
  [30000, 83500, 248500], [charge.autresEntreesXof, charge.sortiesXof, charge.disponibleXof]);

/* ── 3. Les totaux ne somment que les cochées ── */
const BOXES: Cashbox[] = [
  { id: 'cb-banque', branchId: B, name: 'Banque du banc', sub: 'Compte', glyph: '▤', openingXof: 0, role: 'banque' },
  { id: 'cb-mndpay-rangee', branchId: B, name: 'MND PAY', sub: 'Rangée', glyph: '◈', openingXof: 0, archiveeLe: '2026-10-01' },
  { id: 'cb-mndpay', branchId: B, name: 'MND PAY', sub: 'FedaPay', glyph: '◈', openingXof: 0 },
  { id: 'ytb0sweqjt', branchId: B, name: RM, sub: 'Espèces du comptoir', glyph: '◈', openingXof: 0, role: 'terrasse' },
  { id: `cb-kkiapay-${B}`, branchId: B, name: KKIA, sub: 'Paiements en ligne', glyph: '◈', openingXof: 0, role: 'terrasse' },
  { id: 'cb-cheques-x', branchId: B, name: 'Chèques à déposer', sub: 'Chèques', glyph: '▤', openingXof: 0 },
  { id: 'cb-carte-x', branchId: B, name: 'Carte', sub: 'Carte', glyph: '▤', openingXof: 0 },
  { id: 'cb-momo-x', branchId: B, name: MOMO, sub: 'MTN MoMoPay', glyph: '◉', openingXof: 0, role: 'terrasse' },
  { id: 'cb-vieille', branchId: B, name: 'Vieille caisse', sub: 'Rangée', glyph: '◈', openingXof: 0, archiveeLe: '2026-10-01' },
] as Cashbox[];
dit('le comptoir : espèces, MoMoPay, KkiaPay, carte, chèques, MND PAY ; ni la banque ni une rangée',
  ['ytb0sweqjt', 'cb-momo-x', `cb-kkiapay-${B}`, 'cb-carte-x', 'cb-cheques-x', 'cb-mndpay'], caissesDuComptoir(BOXES, B).map((b) => b.id));
dit('... un tiroir qui se dit « tiroir des espèces » est reconnu sans son identifiant',
  ['Tiroir du banc'], caissesDuComptoir([{ id: 'x', branchId: B, name: 'Tiroir du banc', sub: 'Tiroir des espèces', glyph: '◈', openingXof: 0 } as Cashbox], B).map((b) => b.name));
const carte = caisse('Carte', 0);
const cheques = caisse('Chèques à déposer', 0);
const mndpay = caisse('MND PAY', 0);
const banque = caisse('Banque du banc', 500000);
dit('cochées au départ : le comptoir qui a un solde ou un mouvement ; jamais la banque',
  [true, true, true, false, false, false, false],
  [cocheeAuDepart(rm, true), cocheeAuDepart(momo, true), cocheeAuDepart(kkia, true), cocheeAuDepart(carte, true), cocheeAuDepart(cheques, true), cocheeAuDepart(mndpay, true), cocheeAuDepart(banque, false)]);
dit('... la carte qui a bougé se coche', true, cocheeAuDepart(caisse('Carte', 0, [{ date: J, delta: 15000, label: 'C. 09.', invoiceId: 'inv-09' }]), true));
const ligne = (c: CaisseDuJour, compteXof: number | null = null): LigneDuTableau => ({ caisse: c, compteXof, ecartXof: compteXof === null ? null : compteXof - c.disponibleXof });
const TOUT = [ligne(rm), ligne(momo), ligne(kkia), ligne(carte), ligne(cheques), ligne(mndpay), ligne(banque)];
const tot = lesTotaux(TOUT, new Set([RM, MOMO, KKIA]));
dit('les trois du comptoir : 3 caisses, matin 277 600, entrées 225 000, sorties 0, disponible 502 600',
  [3, 277600, 218000, 7000, 0, 502600], [tot.n, tot.matinXof, tot.versementsXof, tot.pourboiresXof, tot.sortiesXof, tot.disponibleXof]);
dit('MoMoPay décochée : 362 600 F ; la banque cochée en plus : 1 002 600 F',
  [2, 362600, 4, 1002600],
  [lesTotaux(TOUT, new Set([RM, KKIA])).n, lesTotaux(TOUT, new Set([RM, KKIA])).disponibleXof, lesTotaux(TOUT, new Set([RM, MOMO, KKIA, 'Banque du banc'])).n, lesTotaux(TOUT, new Set([RM, MOMO, KKIA, 'Banque du banc'])).disponibleXof]);
dit('rien de coché : tout à 0', [0, 0], [lesTotaux(TOUT, new Set()).n, lesTotaux(TOUT, new Set()).disponibleXof]);
const comptees = lesTotaux([ligne(rm, 302000), ligne(momo, 140000), ligne(kkia), ligne(banque, 499000)], new Set([RM, MOMO, KKIA]));
dit('le compté ne somme que les cochées comptées, l écart aussi', [2, 442000, 0], [comptees.comptees, comptees.compteXof, comptees.ecartXof]);

/* ── 4. Les pourboires comptent dans le disponible ── */
dit('Real Money : 7 000 F de pourboires au-dessus du livre du soir', 7000, rm.disponibleXof - rm.livreSoirXof);
dit('... sans eux, le disponible serait le livre : 295 000 F', 295000, caisse(RM, 77000, LIVRE_RM, { pourboires: [] }).disponibleXof);
const AUTRES_PIECES = [
  /* Réglée par MoMo seul : le pourboire est chez MTN. */
  piece('11', '10:00', 15000, { tipXof: 1000 }, [{ id: 'p-11', date: J, time: '10:00', amountXof: 15000, method: 'MTN MoMo', cashbox: MOMO }]),
  /* Réglée en deux jours : le pourboire arrive avec le premier versement, une fois. */
  piece('12', '11:00', 15000, { tipXof: 2000 }, [
    { id: 'p-12a', date: VEILLE, time: '18:00', amountXof: 10000, method: 'Espèces', cashbox: RM },
    { id: 'p-12b', date: J, time: '11:00', amountXof: 5000, method: 'Espèces', cashbox: RM },
  ]),
  /* En devise : le billet est entier dans son tiroir, rien à ajouter. */
  piece('13', '12:00', 65596, { tipXof: 1000, fx: { code: 'EUR', rate: 655.96, amount: 101.5 } }, [{ id: 'p-13', date: J, amountXof: 65596, method: 'Espèces', cashbox: 'Tiroir EUR du banc' }]),
  /* MoMo à 9 h, espèces à 9 h 30 : le pourboire va au tiroir des espèces. */
  piece('14', '09:00', 30000, { tipXof: 500 }, [
    { id: 'p-14a', date: J, time: '09:00', amountXof: 20000, method: 'MTN MoMo', cashbox: MOMO },
    { id: 'p-14b', date: J, time: '09:30', amountXof: 10000, method: 'Espèces', cashbox: RM },
  ]),
  /* Couverte par un avoir : aucun billet du jour, aucun pourboire compté. */
  piece('15', '13:00', 20000, { tipXof: 700, cashbox: RM }, [{ id: 'p-15', date: J, amountXof: 20000, method: 'Avoir' }]),
  /* Un devis n'est pas une pièce payée. */
  piece('16', '14:00', 20000, { tipXof: 900, kind: 'devis' }),
];
const tips = (jour: string) => pourboiresDuJour(AUTRES_PIECES, B, jour).map((p) => [p.invoiceId, p.cashbox, p.xof]);
dit('les pourboires du 4 : chez MTN pour la pièce MoMo, au tiroir pour la pièce mixte ; ni devise, ni avoir, ni devis, ni pièce commencée la veille',
  [['inv-11', MOMO, 1000], ['inv-14', RM, 500]], tips(J));
dit('... la pièce réglée en deux jours : son pourboire est du 3, une seule fois', [['inv-12', RM, 2000]], tips(VEILLE));

/* ── 5. Une remise de pourboires, une dépense du jour : le disponible baisse ── */
const REMISE: LigneDuLivre = { date: J, delta: -7000, label: 'Salaire · remise des pourboires', expenseId: 'exp-paie' };
const avecRemise = caisse(RM, 77000, [...LIVRE_RM, REMISE]);
dit('la remise des pourboires, écrite en sortie ce jour-là : 295 000 F, et 7 000 F en sorties', [295000, 7000], [avecRemise.disponibleXof, avecRemise.sortiesXof]);
const avecAttente = caisse(RM, 77000, [...LIVRE_RM, REMISE], { enAttente: [{ id: 'exp-eau', label: 'Eau', date: J, xof: 2000 }, { id: 'exp-gaz', label: 'Gaz', date: VEILLE, xof: 1500 }, { id: 'exp-demain', label: 'Demain', date: LENDEMAIN, xof: 999 }] });
dit('une dépense du jour en attente de validation sort aussi, une d avant baisse le matin, une d après ne compte pas',
  [75500, 9000, 291500], [avecAttente.matinXof, avecAttente.sortiesXof, avecAttente.disponibleXof]);
dit('... et la clôture retient le livre sans elles : 284 500 F', 284500, avecAttente.livreAClotureXof);
vrai('... le disponible est l attendu de la clôture du soir, plus les pourboires',
  avecAttente.disponibleXof === attenduDuTiroir({ livreMaintenantXof: avecAttente.livreAClotureXof }) + avecAttente.pourboiresXof);

/* ── 6. Le matin = le soir compté de la veille ── */
const apresCloture = caisse(RM, 77000, LIVRE_RM, { derniere: { laisseXof: 76500, livreXof: 77000, date: VEILLE } });
dit('une clôture la veille, 76 500 F comptés : le matin est le compté, le disponible suit', [76500, 'comptage', 301500],
  [apresCloture.matinXof, apresCloture.matinSelon, apresCloture.disponibleXof]);
const saisieApres = caisse(RM, 80000, LIVRE_RM, { derniere: { laisseXof: 76500, livreXof: 77000, date: VEILLE } });
dit('... un versement de la veille saisi après sa clôture monte le matin de 3 000 F', 79500, saisieApres.matinXof);
vrai('... toujours l attendu de la clôture du soir, plus les pourboires',
  saisieApres.disponibleXof === attenduDuTiroir({ livreMaintenantXof: saisieApres.livreAClotureXof, derniere: { laisseXof: 76500, livreXof: 77000 } }) + saisieApres.pourboiresXof);
dit('sans clôture, le livre au soir de la veille', [77000, 'livre'], [rm.matinXof, rm.matinSelon]);

/* ── 7. Le même chiffre que « Jour par jour » ──
   Le mois de Real Money après la remise à 0 F du 31 octobre : 77 000 F le 3,
   la journée chargée le 4. `Jour par jour` lit le livre du mois ; la caisse
   du jour, le livre du seul jour (le matin = le départ + ce qui précède). */
const MOIS: LigneDuLivre[] = [{ date: VEILLE, delta: 77000, label: 'C. 00.', invoiceId: 'inv-00' }, ...JOUR_CHARGE];
const jpj = lesJoursDuTiroir({ de: '2026-11-01', a: J, departXof: 0, moves: MOIS.map((m) => ({ date: m.date, delta: m.delta })), clotures: [] }).find((x) => x.jour === J)!;
const duJour = MOIS.filter((m) => m.date.slice(0, 10) === J);
const leMatin = MOIS.filter((m) => m.date.slice(0, 10) < J).reduce((s, m) => s + m.delta, 0);
const cj = caisse(RM, leMatin, duJour);
dit('« Jour par jour » du 4 : matin 77 000, entrées 248 000, sorties 83 500, soir 241 500', [77000, 248000, 83500, 241500], [jpj.matinXof, jpj.entreesXof, jpj.sortiesXof, jpj.soirXof]);
dit('... la caisse du jour dit les mêmes : matin, entrées (versements + autres), sorties, soir du livre',
  [jpj.matinXof, jpj.entreesXof, jpj.sortiesXof, jpj.soirXof], [cj.matinXof, cj.versementsXof + cj.autresEntreesXof, cj.sortiesXof, cj.livreSoirXof]);
dit('... et son disponible est ce soir-là, plus les pourboires', jpj.soirXof + 7000, cj.disponibleXof);

/* ── 8. L'état d'une caisse ce jour-là ── */
const clo = (x: Partial<Cloture>): Cloture => ({
  id: 'clo-x', branchId: B, cashbox: RM, date: J, attenduXof: 302000, compteXof: 301000, ecartXof: -1000, fondXof: 20000,
  verseAuCoffreXof: 0, laisseXof: 301000, livreXof: 295000, par: 'Accueil', le: `${J}T21:40:00.000Z`, ...x,
}) as Cloture;
const etat = (clotures: Cloture[], cashbox = RM) => etatDeLaCaisse({ clotures, branchId: B, cashbox, jour: J, aujourdhui: LENDEMAIN });
dit('sans clôture : ouverte', 'ouverte', etat([]).etat);
const close = etat([clo({ le: `${J}T20:00:00.000Z`, compteXof: 1, ecartXof: 1 }), clo({})]);
dit('close ce jour-là : la plus récente, avec son compté et son écart', ['close', 301000, -1000],
  [close.etat, close.etat === 'close' ? close.cloture.compteXof : null, close.etat === 'close' ? close.cloture.ecartXof : null]);
dit('... son compté et son écart sont ceux de la clôture, jamais une saisie', { compteXof: 301000, ecartXof: -1000 }, compteEtEcart(close, 999999, 302000));
dit('une autre caisse ou une autre branche ne la ferme pas', ['ouverte', 'ouverte'], [etat([clo({ cashbox: MOMO })]).etat, etat([clo({ branchId: 'autre' })]).etat]);
dit('close un jour d après : bloquée, on ne clôture pas un jour d avant', 'bloquee', etat([clo({ date: LENDEMAIN })]).etat);
const reprise = etat([clo({ validation: { verdict: 'repris', par: 'Direction', le: `${LENDEMAIN}T08:00:00.000Z`, mot: 'Recompter' } })]);
dit('la direction demande de recompter : ouverte, et la clôture reprise est nommée', { etat: 'ouverte', reprend: 'clo-x' }, reprise);
dit('... une fois reprise, elle est close', 'close',
  etat([clo({ validation: { verdict: 'repris', par: 'Direction', le: `${LENDEMAIN}T08:00:00.000Z` } }), clo({ id: 'clo-y', le: `${LENDEMAIN}T09:00:00.000Z`, reprend: 'clo-x' })]).etat);

/* ── 9. Le bouton ── */
const OUVERTE = { etat: 'ouverte' } as const;
const aClore = (c: CaisseDuJour, compte: number | null, motif = '', e: CaisseACloturer['etat'] = OUVERTE): CaisseACloturer => {
  const ce = compteEtEcart(e, compte, c.disponibleXof);
  return { nom: c.nom, etat: e, caisse: c, compteXof: ce.compteXof, ecartXof: ce.ecartXof, motif, fondXof: 20000 };
};
const pq = (cochees: CaisseACloturer[], journeeClose = true) => pourquoiPasLaCloture({ journeeClose, pourquoiJournee: 'Grenat : la caisse ne se compte pas encore. 1 rendez-vous à clore.', cochees });
dit('la journée ouverte : le bouton reste éteint et dit pourquoi', 'Grenat : la caisse ne se compte pas encore. 1 rendez-vous à clore.',
  pq([aClore(rm, 302000), aClore(momo, 140000), aClore(kkia, 60600)], false));
dit('rien de coché', 'Cochez au moins une caisse.', pq([]));
dit('éteint tant qu une caisse cochée n est pas comptée', 'Reste à compter : MoMoPay Maison MND, KkiaPay.', pq([aClore(rm, 302000), aClore(momo, null), aClore(kkia, null)]));
dit('un écart demande un motif', 'Motif de l’écart : KkiaPay.', pq([aClore(rm, 302000), aClore(momo, 140000), aClore(kkia, 60000)]));
dit('... un motif d espaces ne compte pas', 'Motif de l’écart : KkiaPay.', pq([aClore(rm, 302000), aClore(momo, 140000), aClore(kkia, 60000, '   ')]));
dit('tout compté, l écart expliqué : il s allume', null, pq([aClore(rm, 302000), aClore(momo, 140000), aClore(kkia, 60000, 'Frais KkiaPay du jour')]));
dit('une caisse déjà close n a pas à être recomptée', null, pq([aClore(rm, null, '', close), aClore(momo, 140000)]));
dit('toutes closes : rien à clôturer', 'Les caisses cochées sont closes.', pq([aClore(rm, null, '', close)]));
dit('une caisse close un jour d après bloque', 'Real Money : Ce tiroir a déjà été clôturé le 2026-11-05 : on ne clôture pas un jour d’avant.',
  pq([aClore(rm, 302000, '', etat([clo({ date: LENDEMAIN })]))]));

/* ── 10. Ce que la clôture écrit ── */
let n = 0;
const ecrites = lesCloturesDuSoir({
  branchId: B, jour: J, par: 'Accueil', le: `${J}T22:45:00.000Z`, id: () => `clo-${++n}`,
  cochees: [aClore(rm, 301000, 'Monnaie rendue'), aClore(momo, 140000, 'rien à dire'), aClore(kkia, 60000, 'Frais', { etat: 'ouverte', reprend: 'clo-ancienne' }), aClore(carte, null, '', close)],
});
dit('une ligne par caisse cochée, ouverte et comptée ; jamais la caisse déjà close', [RM, MOMO, KKIA], ecrites.map((c) => c.cashbox));
dit('Real Money : attendu = disponible (pourboires compris), compté, écart, motif, livre du soir, laissé = compté, rien au coffre',
  { attenduXof: 302000, compteXof: 301000, ecartXof: -1000, note: 'Monnaie rendue', livreXof: 295000, laisseXof: 301000, verseAuCoffreXof: 0, fondXof: 20000, date: J },
  (({ attenduXof, compteXof, ecartXof, note, livreXof, laisseXof, verseAuCoffreXof, fondXof, date }) => ({ attenduXof, compteXof, ecartXof, note, livreXof, laisseXof, verseAuCoffreXof, fondXof, date }))(ecrites[0]));
dit('... MoMoPay juste : pas de motif écrit ; KkiaPay nomme la clôture qu elle reprend', [undefined, 0, 'clo-ancienne'], [ecrites[1].note, ecrites[1].ecartXof, ecrites[2].reprend]);
/* La couture : la clôture d'aujourd'hui fait le matin de demain. */
const demain = laCaisseDuJour({
  nom: RM, jour: LENDEMAIN, livreMatinXof: 295000, enAttente: [], pourboires: [],
  moves: [{ date: LENDEMAIN, delta: -7000, label: 'Salaire · remise des pourboires', expenseId: 'exp-paie' }],
  derniere: { laisseXof: ecrites[0].laisseXof, livreXof: ecrites[0].livreXof },
});
dit('le lendemain : le matin est le compté (301 000 F, pourboires dedans) ; la remise des pourboires du 5 le baisse à 294 000 F',
  [301000, 294000], [demain.matinXof, demain.disponibleXof]);

/* ── 11. La saisie et l'état dit ── */
dit('un montant se lit avec ses espaces, rien d autre (ni signe, ni exposant)', [302000, 60600, null, null, 1500, null, null], [montantSaisi('302 000'), montantSaisi(' 60 600 '), montantSaisi(''), montantSaisi('3OO'), montantSaisi('1 500,4'), montantSaisi('-500'), montantSaisi('1e3')]);
dit('l état : « Non clôturée · 1 / 3 comptée », « Clôturée · 2 / 2 »',
  ['Non clôturée · 1 / 3 comptée', 'Non clôturée · 0 / 3 comptée', 'Clôturée · 2 / 2'],
  [etatDit([aClore(rm, 302000), aClore(momo, null), aClore(kkia, null)]).dit, etatDit([aClore(rm, null), aClore(momo, null), aClore(kkia, null)]).dit, etatDit([aClore(rm, null, '', close), aClore(rm, null, '', close)]).dit]);

/* ── 12. L'écran lit le livre des caisses, et pas autre chose ── */
const ecran = readFileSync('src/apps/trone/routes/finances/JournalDeCaisse.tsx', 'utf8');
const code = ecran.replace(/\/\*[\s\S]*?\*\//g, '');
vrai('l écran lit le livre du jour de chaque caisse (`boxMoves`, du jour au jour)', /boxMoves\(box\.name, \{ de: jour, a: jour \}\)/.test(ecran) && /livreMatinXof: vu\.startBalance/.test(ecran));
vrai('... la dernière clôture d avant le jour, à la mesure du livre (`livreDeLaCloture`)', /derniereCloture\(clotures, branch\.id, box\.name, veille\)/.test(ecran) && /livreDeLaCloture\(brute, horsActiviteJusquAu\(box\.name, brute\.date\)\)/.test(ecran));
vrai('... les dépenses en attente comme la clôture du soir', /aValiderDepenses\(depenses, branch\.id\)\.filter\(\(e\) => !e\.avancee && e\.date <= jour\)/.test(ecran));
vrai('le bouton garde la condition de la journée close', /journeeClose=\{clotureOuverteAuxGestes\}/.test(ecran) && /pourquoiPasLaCloture\(\{ journeeClose, pourquoiJournee, cochees: aCloturer \}\)/.test(ecran) && /disabled=\{!!pourquoi\}/.test(ecran));
vrai('la clôture s écrit au magasin des clôtures, par `lesCloturesDuSoir`', /cloturesStore\.set\(\(prev\) => \[\.\.\.prev, \.\.\.nouvelles\]\)/.test(ecran) && /lesCloturesDuSoir\(\{/.test(ecran));
vrai('pas de billetage : les espèces se comptent en un montant', !/COUPURES|sommeDuBilletage|billet/i.test(code));
vrai('une caisse à code ne dit pas son solde', /verrouillee: caisseDiscrete\(box\)/.test(ecran) && /vue\.verrouillee \? '•••'/.test(ecran));
vrai('aucun tiret « — » dans les textes de l écran', !/—/.test(code));

/* ── 13. Remettre les pourboires ──
   La paie ne fait sortir aucune espèce (les salaires partent par MTN) : sans
   geste, les pourboires du tiroir y resteraient pour toujours. La remise est
   une sortie hors activité, motif « Pourboires remis à l’équipe ». */
const AVANT_LE_SUIVI = piece('08', '10:00', 10000, { tipXof: 900, date: '2026-10-30' }, [{ id: 'p-08', date: '2026-10-30', time: '10:00', amountXof: 10000, method: 'Espèces', cashbox: RM }]);
const TOUS = pourboiresDesPieces([...PIECES, AVANT_LE_SUIVI], B);
const jourRM = (jour: string, livreMatinXof: number, x: Partial<Parameters<typeof laCaisseDuJour>[0]> = {}) =>
  laCaisseDuJour({ nom: RM, jour, livreMatinXof, moves: [], enAttente: [], pourboires: TOUS, ...x });
const REMIS: LigneDuLivre = { date: LENDEMAIN, delta: -7000, label: `${MOTIF_POURBOIRES_REMIS} · Par Direction` };
const le4 = jourRM(J, 77000, { moves: LIVRE_RM });
dit('le 4 : 7 000 F de pourboires dans le disponible, 7 000 F à remettre ; ceux d avant le suivi ne comptent pas',
  [302000, 7000, 0, 7000], [le4.disponibleXof, le4.pourboiresXof, le4.pourboiresDuMatinXof, le4.aRemettreXof]);
const le5 = jourRM(LENDEMAIN, 295000);
dit('le 5, sans clôture ni remise : ils restent au matin (295 000 + 7 000) et à remettre', [302000, 7000, 302000, 7000],
  [le5.matinXof, le5.pourboiresDuMatinXof, le5.disponibleXof, le5.aRemettreXof]);
const le5Remis = jourRM(LENDEMAIN, 295000, { moves: [REMIS], remises: [{ date: LENDEMAIN, xof: 7000 }] });
dit('le 5, la remise écrite : 7 000 F en sorties, 295 000 F disponibles, plus rien à remettre', [7000, 295000, 0],
  [le5Remis.sortiesXof, le5Remis.disponibleXof, le5Remis.aRemettreXof]);
const le5Partiel = jourRM(LENDEMAIN, 295000, { moves: [{ ...REMIS, delta: -5000 }], remises: [{ date: LENDEMAIN, xof: 5000 }] });
dit('... une remise de 5 000 F laisse 2 000 F à remettre', [297000, 2000], [le5Partiel.disponibleXof, le5Partiel.aRemettreXof]);
const le5Clos = jourRM(LENDEMAIN, 295000, { moves: [REMIS], remises: [{ date: LENDEMAIN, xof: 7000 }], derniere: { laisseXof: 302000, livreXof: 295000, date: J } });
dit('le 4 clôturé (302 000 F comptés, pourboires dedans) : le matin du 5 ne les compte pas deux fois ; la remise les sort', [302000, 0, 295000],
  [le5Clos.matinXof, le5Clos.pourboiresDuMatinXof, le5Clos.disponibleXof]);
const le6 = jourRM('2026-11-06', 288000, { remises: [{ date: LENDEMAIN, xof: 7000 }] });
dit('le 6, sans clôture : le livre a perdu la remise, le matin garde le tiroir vrai (288 000 + 7 000), rien à remettre', [295000, 0], [le6.matinXof, le6.aRemettreXof]);
const apresRemiseA0 = jourRM(LENDEMAIN, 0, { suiviDepuis: J });
dit('une remise à 0 F du tiroir le 4 au soir emporte ses pourboires : rien de gardé, rien à remettre', [0, 0, 0], [apresRemiseA0.matinXof, apresRemiseA0.pourboiresDuMatinXof, apresRemiseA0.aRemettreXof]);
const ecrite = laRemiseDesPourboires({ id: 'hav-1', branchId: B, cashbox: RM, jour: LENDEMAIN, xof: 7000, par: 'Direction' });
dit('la remise s écrit en sortie hors activité, motif « Pourboires remis à l’équipe », au jour et au tiroir',
  { id: 'hav-1', branchId: B, date: LENDEMAIN, sens: 'sortie', motif: 'Pourboires remis à l’équipe', label: 'Par Direction', amountXof: 7000, cashbox: RM }, ecrite);
vrai('... un motif de sortie hors activité du modèle, hors résultat ; jamais « À régulariser »',
  (MOTIFS_SORTIE_HORS_ACTIVITE as readonly string[]).includes(MOTIF_POURBOIRES_REMIS) && !estARegulariser(ecrite));
vrai('... jamais une dépense : ni catégorie, ni fiche de dépense, ni ligne de dépense au tiroir',
  !('category' in ecrite) && !('expenseId' in ecrite) && le5Remis.sorties.every((s) => !s.expenseId));
dit('les remises se lisent sur leur tiroir, en sortie, à leur motif seulement', [{ date: LENDEMAIN, xof: 7000 }], remisesDesPourboires([
  ecrite, { ...ecrite, id: 'x1', cashbox: MOMO }, { ...ecrite, id: 'x2', sens: 'entree' }, { ...ecrite, id: 'x3', motif: 'Autre' }, { ...ecrite, id: 'x4', branchId: 'autre' },
], B, RM));
const pr = (xof: number | null, aRemettreXof = 7000, x: Partial<Parameters<typeof pourquoiPasLaRemiseDesPourboires>[0]> = {}) =>
  pourquoiPasLaRemiseDesPourboires({ xof, aRemettreXof, jour: LENDEMAIN, aujourdhui: LENDEMAIN, ...x });
dit('la remise : 7 000 F passent ; plus, rien, ou rien à remettre, non ; ni dans l avenir, ni avant une clôture',
  [null, 'Plus que les pourboires à remettre (7 000 F).', 'Le montant manque.', 'Le montant manque.', 'Aucun pourboire à remettre.', 'La remise ne se date pas dans l’avenir.', 'Caisse close le 06/11/2026 : la remise se date ce jour-là ou après.', null],
  [pr(7000), pr(8000), pr(null), pr(0), pr(1000, 0), pr(7000, 7000, { jour: '2026-11-06' }), pr(7000, 7000, { derniereClotureLe: '2026-11-06' }), pr(7000, 7000, { derniereClotureLe: LENDEMAIN })]);
dit('les totaux disent les pourboires à remettre des seules cochées', [7000, 0],
  [lesTotaux([ligne(le4), ligne(caisse(MOMO, 140000))], new Set([RM, MOMO])).aRemettreXof, lesTotaux([ligne(le4)], new Set([MOMO])).aRemettreXof]);
vrai('l écran lit les remises de chaque caisse et la remise à 0 F', /remises: remisesDesPourboires\(horsActivite, branch\.id, box\.name\)/.test(ecran) && /suiviDepuis: derniereRemiseDe\(horsActivite, branch\.id, box\.name\)/.test(ecran));
vrai('« Remettre les pourboires » est à la direction seule, et écrit au magasin hors activité', /const peutRemettre = \(l: \(typeof lignes\)\[number\]\) => estDirection && /.test(ecran)
  && /entreesHorsActiviteStore\.set\(\(prev\) => \[\.\.\.prev, laRemiseDesPourboires\(\{/.test(ecran) && !/expensesStore/.test(code));

/* ── 9. Tous les montants d'une caisse (5 novembre 2026, « quand je clique sur une caisse ») ── */
const DEBUT = '2026-10-01';
const tient = (nom: string, l: LivreDeLaCaisse, c: CaisseDuJour, jour: string) => {
  const leJour = l.jours.find((j) => j.jour === jour);
  vrai(`${nom} : départ + entrées − sorties = disponible ; le matin du jour = le Matin du tableau ; le soir = le Disponible`,
    l.departXof + l.entreesXof - l.sortiesXof === c.disponibleXof && l.disponibleXof === c.disponibleXof
      && leJour?.matinXof === c.matinXof && leJour?.soirXof === c.disponibleXof && l.jours.at(-1)?.jour === jour,
    JSON.stringify({ depart: l.departXof, e: l.entreesXof, s: l.sortiesXof, matin: leJour?.matinXof, soir: leJour?.soirXof }));
};
dit('le départ : la clôture la plus récente, sinon la remise à 0 F, sinon le début des comptes ; jamais avant lui',
  [
    { depuis: LENDEMAIN, depart: 'cloture', departLe: J },
    { depuis: LENDEMAIN, depart: 'remise', departLe: J },
    { depuis: '2026-11-01', depart: 'remise', departLe: '2026-10-31' },
    { depuis: DEBUT, depart: 'debut' },
    { depuis: DEBUT, depart: 'debut' },
  ],
  [
    leDepartDuLivre({ clotureLe: J, remiseLe: '2026-10-31', debutDesComptes: DEBUT }),
    leDepartDuLivre({ clotureLe: '2026-10-20', remiseLe: J, debutDesComptes: DEBUT }),
    leDepartDuLivre({ remiseLe: '2026-10-31', debutDesComptes: DEBUT }),
    leDepartDuLivre({ clotureLe: '2026-09-12', debutDesComptes: DEBUT }),
    leDepartDuLivre({ debutDesComptes: DEBUT }),
  ]);
dit('le lendemain passe les fins de mois', ['2026-11-01', '2027-01-01', '2026-03-01'], [lendemainDe('2026-10-31'), lendemainDe('2026-12-31'), lendemainDe('2026-02-28')]);

/* KkiaPay, rien de reçu le 4 : ses 60 600 F se lisent montant par montant depuis le 1er octobre. */
const AVANT_KKIA: LigneDuLivre[] = [
  { date: '2026-10-12', delta: 20000, label: 'C. 21.', sub: 'F-BANC-21', invoiceId: 'inv-21' },
  { date: '2026-10-20T10:12:00.000Z', delta: 25100, label: 'C. 22.', sub: 'F-BANC-22', invoiceId: 'inv-22' },
  { date: '2026-10-25', delta: -4500, label: 'Frais du banc', expenseId: 'exp-k1' },
  { date: '2026-11-02', delta: 20000, label: 'C. 23.', sub: 'F-BANC-23', invoiceId: 'inv-23' },
  { date: '2026-10-28', delta: 0, label: 'Ligne à 0 F' },
];
const lk = leLivreDeLaCaisse({ caisse: kkia, jour: J, depuis: DEBUT, depart: 'debut', avant: AVANT_KKIA });
dit('KkiaPay : départ 0 F au 1er octobre, 4 montants, 65 100 F entrés, 4 500 F sortis, 60 600 F ; le 4 est là, vide',
  [0, 4, 65100, 4500, 60600, ['2026-10-12', '2026-10-20', '2026-10-25', '2026-11-02', J], 0],
  [lk.departXof, lk.n, lk.entreesXof, lk.sortiesXof, lk.disponibleXof, lk.jours.map((j) => j.jour), lk.jours.at(-1)!.montants.length]);
dit('... le solde après chaque montant', [20000, 45100, 40600, 60600], lk.jours.flatMap((j) => j.montants.map((m) => m.soldeXof)));
dit('... chaque montant dit ce qu il est et mène à sa fiche', [['versement', 'inv-21'], ['versement', 'inv-22'], ['sortie', 'exp-k1'], ['versement', 'inv-23']],
  lk.jours.flatMap((j) => j.montants.map((m) => [m.genre, m.invoiceId ?? m.expenseId])));
tient('KkiaPay', lk, kkia, J);

/* Une dépense d'avant en attente de validation : le matin l'a retirée, le livre la montre. */
const kkiaAttente = caisse(KKIA, 60600, [], { enAttente: [{ id: 'exp-k2', label: 'Taxi du banc', date: VEILLE, xof: 2000 }] });
const lka = leLivreDeLaCaisse({ caisse: kkiaAttente, jour: J, depuis: DEBUT, depart: 'debut', avant: AVANT_KKIA });
dit('... une dépense d avant en attente : 58 600 F au matin, le livre la montre à son jour, le départ reste 0 F',
  [58600, 0, { jour: VEILLE, genre: 'attente', xof: -2000, expenseId: 'exp-k2' }],
  [kkiaAttente.matinXof, lka.departXof, (({ jour, genre, xof, expenseId }) => ({ jour, genre, xof, expenseId }))(lka.jours.find((j) => j.jour === VEILLE)!.montants[0])]);
tient('KkiaPay en attente', lka, kkiaAttente, J);

/* Real Money le 5 : la remise à 0 F du 31 octobre, puis le 2, le 3, le 4 et ses pourboires gardés. */
const AVANT_RM: LigneDuLivre[] = [
  { date: '2026-10-31', delta: 5000, label: 'Avant la remise : déjà dans le départ' },
  { date: '2026-11-02', delta: 30000, label: 'C. 31.', sub: 'F-BANC-31', invoiceId: 'inv-31' },
  { date: '2026-11-03', delta: 47000, label: 'C. 32.', sub: 'F-BANC-32', invoiceId: 'inv-32' },
  ...LIVRE_RM,
];
const depRM = leDepartDuLivre({ remiseLe: '2026-10-31', debutDesComptes: DEBUT });
const lr = leLivreDeLaCaisse({ caisse: le5, jour: LENDEMAIN, ...depRM, avant: AVANT_RM });
const le4DuLivre = lr.jours.find((j) => j.jour === J)!;
dit('Real Money le 5 : départ 0 F (remise à 0 F du 31), le 4 entre 225 000 F dont 7 000 F de pourboires, 302 000 F au soir',
  [0, ['2026-11-02', '2026-11-03', J, LENDEMAIN], 225000, 302000, 2],
  [lr.departXof, lr.jours.map((j) => j.jour), le4DuLivre.entreesXof, le4DuLivre.soirXof, le4DuLivre.montants.filter((m) => m.genre === 'pourboire').length]);
tient('Real Money le 5', lr, le5, LENDEMAIN);

/* Le 4 clôturé à 302 000 F, la remise des pourboires le 5 : le livre part du compté. */
const lc = leLivreDeLaCaisse({ caisse: le5Clos, jour: LENDEMAIN, ...leDepartDuLivre({ clotureLe: J, remiseLe: '2026-10-31', debutDesComptes: DEBUT }), avant: [] });
dit('le 4 clôturé : le livre part des 302 000 F comptés, la remise sort 7 000 F, 295 000 F ce soir',
  ['cloture', 302000, 1, -7000, 295000], [lc.depart, lc.departXof, lc.n, lc.jours[0].montants[0].xof, lc.disponibleXof]);
tient('Real Money clôturé', lc, le5Clos, LENDEMAIN);

/* Dans le jour, à l'heure : le pourboire suit son versement. */
const heureBanc = (m: { invoiceId?: string; jour: string }) => PIECES.find((p) => p.id === m.invoiceId)?.payments?.[0]?.time;
const lh = leLivreDeLaCaisse({ caisse: le4, jour: J, ...depRM, avant: AVANT_RM.slice(0, 3), heureDe: heureBanc });
dit('le 4 à l heure : 07 h 51 d abord, chaque pourboire juste après son versement',
  ['07:51', 'versement', 'versement', 'versement', 'versement', 'versement', 'pourboire', 'versement', 'versement', 'pourboire'],
  [lh.jours.at(-1)!.montants[0].heure, ...lh.jours.at(-1)!.montants.map((m) => m.genre)]);
dit('... le solde après le premier, après le dernier', [84000, 302000], [lh.jours.at(-1)!.montants[0].soldeXof, lh.jours.at(-1)!.montants.at(-1)!.soldeXof]);
tient('Real Money le 4 à l heure', lh, le4, J);

/* L'écran : la ligne entière ouvre le livre, lu depuis son départ, la veille au plus tard. */
vrai('l écran : un clic sur la ligne de caisse ouvre tous ses montants', /data-caisse=\{nom\} onClick=\{\(e\) => surLaLigne\(e, l\)\}/.test(code) && /<LeLivre\b/.test(code));
vrai('l écran lit le livre de son départ à la veille, la clôture et la remise d avant le jour',
  /avant: de <= veille \? boxMoves\(nom, \{ de, a: veille \}\)\.moves\.map\(versLigne\)/.test(code)
  && /clotureLe: derniereCloture\(clotures, branch\.id, nom, veille\)\?\.date,/.test(code)
  && /remiseLe: derniereRemiseDe\(horsActivite\.filter\(\(m\) => m\.date\.slice\(0, 10\) <= veille\), branch\.id, nom\),/.test(code));

console.log(ko === 0 ? '\nLa caisse du jour tient ses chiffres : disponible, totaux cochés, pourboires, clôture.' : `\n${ko} controle(s) en echec.`);
process.exitCode = ko === 0 ? 0 : 1;
