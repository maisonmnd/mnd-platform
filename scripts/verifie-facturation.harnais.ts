/* TEMPORAIRE — l'invariant qui compte : une pièce PAYÉE suit le rituel, et son
   TOTAL ne bouge pas d'un franc. */
import { alignerFacturesDuRituel, svcNetForAppt, apptTotalXof, apptNetXof, revenuDuMois, commissionDetaillee } from '../src/apps/trone/routes/clients/_shared';
import type { StaffMember } from '../src/apps/trone/routes/equipe/data';
import type { CommRates } from '../src/apps/trone/routes/equipe/payroll';
import { invoicesStore, invoiceTotal, ligneFacture, invoiceRegleXof, invoiceRegleAu, invoiceCaisseAu, invoiceResteXof, invoiceSoldee, type Invoice, type InvoicePayment, type Cashbox } from '../src/shared/finance';
import type { Appointment } from '../src/shared/agenda';
import type { Service } from '../src/shared/catalog';
import { cibleDeLEncaissement } from '../src/shared/receipts';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const sv = (id: string, name: string, priceXof: number): Service =>
  ({ id, categoryId: 'c', name, palier: 'Fondation', priceXof, sessions: 1, master: '', durationMin: 60, order: 1 } as Service);
const A = sv('a', 'KƆKLƆ™ Essentiel', 10_000);
const B = sv('b', 'SÍNSIN™ Essentielle', 20_000);
const byId = new Map([[A.id, A], [B.id, B]]);

const appt = (ids: string[]): Appointment =>
  ({ id: 'ap1', branchId: 'br', clientId: 'c1', serviceIds: ids, date: '2026-08-01', time: '10:00', master: 'M', status: 'honoré', invoiceId: 'inv1' } as Appointment);

const pose = (lines: Invoice['lines']) => {
  invoicesStore.set(() => [{
    id: 'inv1', branchId: 'br', kind: 'facture', number: 'F-1', clientId: 'c1', date: '2026-08-01',
    lines, globalDiscountPct: 0, theme: 'Aube', status: 'payée',
  } as Invoice]);
};
const piece = () => invoicesStore.get()[0];

/* ── LE CAS DE YÉMAN : une pièce PAYÉE d'UNE ligne aux noms collés ── */
pose([ligneFacture('KƆKLƆ™ Essentiel + SÍNSIN™ Essentielle', 30_000)]);
const avant = invoiceTotal(piece());
alignerFacturesDuRituel(appt(['a']), byId, (s) => s.priceXof); // on retire SÍNSIN du rituel
dit('la pièce payée a suivi le rituel', ['KƆKLƆ™ Essentiel', 'Ajustement · prix consenti ce jour-là'],
  piece().lines.map((l) => l.label));
dit('… et le total n’a pas bougé', avant, invoiceTotal(piece()));

/* ── L'ÉCART DANS L'AUTRE SENS — il se dit en remise ── */
pose([ligneFacture('KƆKLƆ™ Essentiel', 10_000)]);
const avant2 = invoiceTotal(piece());
alignerFacturesDuRituel(appt(['a', 'b']), byId, (s) => s.priceXof); // on AJOUTE SÍNSIN
dit('les deux gestes paraissent', ['KƆKLƆ™ Essentiel', 'SÍNSIN™ Essentielle'],
  piece().lines.map((l) => l.label));
dit('… la remise dit l’écart', 20_000, piece().globalDiscountXof);
dit('… et le total n’a toujours pas bougé', avant2, invoiceTotal(piece()));

/* ── CE QU'ON NE TOUCHE PAS ── */
pose([ligneFacture('Règlement · KƆKLƆ™ Essentiel', 5_000)]);
alignerFacturesDuRituel(appt(['a', 'b']), byId, (s) => s.priceXof);
dit('un règlement partiel ne se détaille pas', 1, piece().lines.length);

const GAMME = [{ name: 'Huile Kòfí™ 100 ml' }];
pose([ligneFacture('KƆKLƆ™ Essentiel', 10_000), ligneFacture('Huile Kòfí™ 100 ml', 12_000)]);
const avant3 = invoiceTotal(piece());
alignerFacturesDuRituel(appt(['a']), byId, (s) => s.priceXof, GAMME);
dit('une pièce MIXTE reste entière — le flacon ne disparaît pas',
  ['KƆKLƆ™ Essentiel', 'Huile Kòfí™ 100 ml'], piece().lines.map((l) => l.label));
dit('… et son total non plus', avant3, invoiceTotal(piece()));

/* ── LE LIBELLÉ QUI A VIEILLI (16 août — le cas de Prisca) ──────────
   La pièce de reprise dit « … · shampoing apporté » là où le catalogue dit
   aujourd'hui « … · Shampoing apporté ». Le nom exact ne suffit donc pas à
   reconnaître un geste : la pièce cessait de suivre son rituel EN SILENCE. */
pose([
  ligneFacture('KƆKLƆ™ Signature · « L’Ancrage »', 15_000),
  ligneFacture('KƆKLƆ™ à Façon Lavage · shampoing apporté', 6_000),
]);
const avant4 = invoiceTotal(piece());
alignerFacturesDuRituel(appt(['a', 'b']), byId, (s) => s.priceXof, GAMME);
dit('un libellé vieilli n’empêche plus la pièce de suivre',
  ['KƆKLƆ™ Essentiel', 'SÍNSIN™ Essentielle'], piece().lines.map((l) => l.label));
dit('… et le total tient toujours', avant4, invoiceTotal(piece()));

/* ── LE GESTE DE LA MAISON SE LIT (16 août — le cas de Kèmi) ────────
   « Kèmi doit savoir que le shampoing est à 10 000 F et qu'elle a une remise
   de 100 %. Je ne veux pas simplement le montant 0 F. » La pièce recevait le
   prix DÉJÀ diminué : un cadeau rendu invisible n'est pas reçu. */
/* La pièce telle qu'elle était écrite AVANT : le shampoing à 0 F, le cadeau
   rendu invisible. Le total payé, 20 000 F, est celui du catalogue. */
pose([ligneFacture('KƆKLƆ™ Essentiel', 0), ligneFacture('SÍNSIN™ Essentielle', 20_000)]);
const avant5 = invoiceTotal(piece());
alignerFacturesDuRituel(
  appt(['a', 'b']), byId,
  (s) => s.priceXof,                       // le prix PLEIN
  GAMME,
  (s) => (s.id === 'a' ? 100 : 0),         // le shampoing est offert
);
dit('la ligne porte son prix plein', [10_000, 20_000], piece().lines.map((l) => l.unitXof));
dit('… et la remise qui l’efface', [100, 0], piece().lines.map((l) => l.discountPct));
dit('… le geste ne se compte pas deux fois', undefined, piece().globalDiscountXof);
dit('… et le total ne bouge pas', avant5, invoiceTotal(piece()));

/* Sans la Gamme en main, l'ancienne règle stricte protège encore : un appel
   nu ne peut pas faire disparaître un produit qu'il ne connaît pas. */
pose([ligneFacture('KƆKLƆ™ Essentiel', 10_000), ligneFacture('Huile Kòfí™ 100 ml', 12_000)]);
alignerFacturesDuRituel(appt(['a']), byId, (s) => s.priceXof);
dit('appel sans la Gamme : la pièce mixte reste intouchée',
  ['KƆKLƆ™ Essentiel', 'Huile Kòfí™ 100 ml'], piece().lines.map((l) => l.label));

/* ── D'OÙ VIENT UNE LIGNE D'ENCAISSEMENT ───────────────────────────
   « Me permettre de supprimer des encaissements test » (Yéman, 29 août). Une
   ligne d'encaissement n'existe pas : elle est CALCULÉE depuis sept sources.
   Se tromper de source, c'est effacer l'argent d'une autre cliente. */
const cible = (r: Parameters<typeof cibleDeLEncaissement>[0]) => cibleDeLEncaissement(r);

/* ON NE DÉCOUPE PAS L'IDENTIFIANT : `r-inv-<facture>-<versement>` porte des
   tirets des deux côtés. La facture est connue, on la retranche. */
dit('un versement de facture se retrouve', { source: 'facture', invoiceId: 'inv-a-1', paymentId: 'pay-b-2' },
  cible({ id: 'r-inv-inv-a-1-pay-b-2', invoiceId: 'inv-a-1' }));
dit('… même sans le champ, rien ne se devine', null,
  cible({ id: 'r-inv-inv-a-1-pay-b-2' }));

dit('un pourboire nomme sa facture', { source: 'pourboire', invoiceId: 'inv-9' },
  cible({ id: 'r-tip-inv-9', invoiceId: 'inv-9' }));
dit('une transaction en ligne', { source: 'enligne', paymentId: 'tx-77' },
  cible({ id: 'r-pay-tx-77' }));
dit('un acompte de rituel', { source: 'acompte', apptId: 'a-12' },
  cible({ id: 'r-dep-a-12', apptId: 'a-12' }));
dit('… et sans le champ, l’identifiant suffit', { source: 'acompte', apptId: 'a-12' },
  cible({ id: 'r-dep-a-12' }));
dit('un règlement de formation', { source: 'formation', paymentId: 'p-3' },
  cible({ id: 'r-for-p-3' }));
dit('un règlement d’abonnement', { source: 'abonnement', paymentId: 'pay-x' },
  cible({ id: 'r-abo-pay-x' }));
dit('un dépôt d’avoir', { source: 'avoir', movementId: 'cm-5' },
  cible({ id: 'r-cre-cm-5' }));

/* UNE ORIGINE INCONNUE N'EFFACE RIEN. Mieux vaut une ligne de trop qu'une
   suppression au hasard dans les comptes de la Maison. */
dit('un préfixe inconnu ne cible rien', null, cible({ id: 'r-zzz-1' }));
dit('un identifiant vide non plus', null, cible({ id: '' }));
dit('un préfixe sans suite non plus', null, cible({ id: 'r-pay-' }));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);

/* ═══════════════════════════════════════════════════════════════════
   UNE PIÈCE, PLUSIEURS RÈGLEMENTS — 17 août 2026.

   Ce que ces contrôles protègent : l'argent d'Hermine. Un rituel de 81 000 F
   réglé 30 000 le 12 août et 51 000 le 28 doit compter DANS DEUX MOIS, pour
   ses vraies parts. L'ancien modèle en faisait deux factures ; le nouveau en
   fait une, et c'est le journal des versements qui date l'argent.
   ═══════════════════════════════════════════════════════════════════ */

const piece2 = (payments?: InvoicePayment[], status: Invoice['status'] = 'payée'): Invoice =>
  ({
    id: 'inv2', branchId: 'br', kind: 'facture', number: 'F-2', clientId: 'c1', date: '2026-08-12',
    lines: [ligneFacture('KƆKLƆ™ Essentiel', 30_000), ligneFacture('SÍNSIN™ Essentielle', 51_000)],
    globalDiscountPct: 0, theme: 'Aube', status, payments,
  } as Invoice);

const deuxVersements: InvoicePayment[] = [
  { id: 'p1', date: '2026-08-12', amountXof: 30_000, method: 'Espèces', cashbox: 'Bocal' },
  { id: 'p2', date: '2026-09-28', amountXof: 51_000, method: 'MTN MoMo', cashbox: 'MoMo' },
];

const deux = piece2(deuxVersements);
dit('le total de la pièce reste celui du rituel', 81_000, invoiceTotal(deux));
dit('les deux versements se lisent', 81_000, invoiceRegleXof(deux));
dit('août ne reçoit que sa part', 30_000, invoiceRegleAu(deux, '2026-08'));
dit('… et septembre la sienne', 51_000, invoiceRegleAu(deux, '2026-09'));
dit('le jour compte comme le mois', 30_000, invoiceRegleAu(deux, '2026-08-12'));
dit('la pièce est soldée', true, invoiceSoldee(deux));
dit('… donc plus rien n’est dû', 0, invoiceResteXof(deux));

/* À MOITIÉ RÉGLÉE : elle est une CRÉANCE de son solde, pas de son total. */
const moitie = piece2([deuxVersements[0]], 'envoyée');
dit('la moitié reçue se voit', 30_000, invoiceRegleXof(moitie));
dit('… le solde est ce qui reste', 51_000, invoiceResteXof(moitie));
dit('… et la pièce n’est pas soldée', false, invoiceSoldee(moitie));

/* L'AVOIR N'EST PAS DES BILLETS — il compte au revenu, jamais en caisse. */
const parAvoir = piece2([
  { id: 'p3', date: '2026-08-12', amountXof: 40_000, method: 'Avoir' },
  { id: 'p4', date: '2026-08-12', amountXof: 41_000, method: 'Espèces', cashbox: 'Bocal' },
]);
dit('le revenu du mois compte l’avoir', 81_000, invoiceRegleAu(parAvoir, '2026-08'));
dit('… mais la caisse ne prend que les billets', 41_000, invoiceCaisseAu(parAvoir, '2026-08'));

/* ── LE JOURNAL DU JOUR LIT LES VERSEMENTS, PAS LA PIÈCE EN BLOC — 24 août 2026.
   La Caisse sommait `invoiceTotal` de chaque pièce DATÉE du jour : un solde reçu
   le 28 septembre sur une pièce du 12 août n'entrait nulle part, une pièce du
   jour à moitié réglée comptait en entier, et l'avoir/l'acompte gonflaient le
   « Total encaissé · jour ». Le total d'un jour est la somme de SES versements,
   l'avoir et l'acompte écartés — exactement `invoiceCaisseAu(piece, jour)`. */
dit('le journal d’un jour ne prend que les versements de CE jour', 51_000, invoiceCaisseAu(deux, '2026-09-28'));
dit('… et le 12 août, l’autre versement seul', 30_000, invoiceCaisseAu(deux, '2026-08-12'));
/* Un acompte reçu un AUTRE jour n'entre pas dans la caisse du jour du solde. */
const avecAcompte = piece2([
  { id: 'pa1', date: '2026-08-10', amountXof: 25_000, method: 'Acompte', cashbox: 'Bocal' },
  { id: 'pa2', date: '2026-08-12', amountXof: 56_000, method: 'Espèces', cashbox: 'Bocal' },
]);
dit('l’acompte d’un autre jour ne gonfle pas la caisse du jour du solde', 56_000, invoiceCaisseAu(avecAcompte, '2026-08-12'));
dit('… et le jour de l’acompte ne compte que lui', 0, invoiceCaisseAu(avecAcompte, '2026-08-10'));

/* LES PIÈCES D'AVANT NE BOUGENT PAS — sans journal, une soldée en vaut un
   d'une entrée, et les chiffres sont EXACTEMENT ceux d'hier. */
const ancienne = piece2(undefined);
dit('une pièce d’avant se lit encore', 81_000, invoiceRegleXof(ancienne));
dit('… à la date de la pièce', 81_000, invoiceRegleAu(ancienne, '2026-08'));
dit('… et une non payée d’avant ne compte rien', 0, invoiceRegleXof(piece2(undefined, 'envoyée')));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);

/* ── LES REMISES DE LIGNE — % puis F, et le cumul avec la globale ── */
const rdvRemise = {
  id: 'ap9', branchId: 'br', clientId: 'c1', serviceIds: ['a', 'b'],
  date: '2026-08-01', time: '10:00', master: 'M', status: 'honoré',
  remisesLignes: [{ pct: 50 }, { xof: 5_000 }],
} as Appointment;
dit('le % s’applique à SA ligne', 5_000, svcNetForAppt(rdvRemise, A, 0));
dit('… les francs à la sienne', 15_000, svcNetForAppt(rdvRemise, B, 1));
dit('le total du rituel les déduit', 20_000, apptTotalXof(rdvRemise, byId));
dit('… et la remise globale vient APRÈS',
  18_000, apptNetXof({ ...rdvRemise, discountPct: 10 } as Appointment, byId));
dit('une ligne sans remise ne bouge pas',
  30_000, apptTotalXof({ ...rdvRemise, remisesLignes: undefined } as Appointment, byId));

/* La pièce écrit le prix PLEIN et la remise en regard — jamais un prix raboté. */
pose([ligneFacture('x', 1)]);
alignerFacturesDuRituel({ ...rdvRemise, invoiceId: 'inv1', status: 'honoré' } as Appointment,
  byId, (s) => s.priceXof);
dit('la pièce garde les prix pleins', [10_000, 20_000], piece().lines.map((l) => l.unitXof));
dit('… le pourcentage sur la ligne', [50, 0], piece().lines.map((l) => l.discountPct));
dit('… et les francs sur la sienne', [undefined, 5_000], piece().lines.map((l) => l.discountXof));

/* ═══════════════════════════════════════════════════════════════════
   LE CHIFFRE D'AFFAIRES DU MOIS — UNE SEULE PORTE — 24 août 2026.

   Le même mois affichait des CA différents selon l'écran : la Synthèse comptait
   les abonnements, le Dashboard / Analytics / Bilan les oubliaient ; le Bilan
   seul écartait les caisses hors bilan. `revenuDuMois` tient la composition pour
   tous : factures (versement par versement) + rituels honorés non facturés +
   formation + abonnements. Ces assertions la tiennent — dont l'exclusion
   hors-bilan (Bilan) et la borne du jour (KPI mois-à-date).
   ═══════════════════════════════════════════════════════════════════ */
const invMix: Invoice = {
  id: 'invR', branchId: 'br', kind: 'facture', number: 'F-R', clientId: 'c1', date: '2026-08-01',
  lines: [ligneFacture('Prestation', 50_000)], globalDiscountPct: 0, theme: 'Aube', status: 'payée',
  payments: [
    { id: 'r1', date: '2026-08-10', amountXof: 30_000, method: 'Espèces', cashbox: 'Bocal' },
    { id: 'r2', date: '2026-08-20', amountXof: 20_000, method: 'Espèces', cashbox: 'Épargne' },
  ],
} as Invoice;
const rdvHonore = {
  id: 'apR', branchId: 'br', clientId: 'c1', serviceIds: ['a'], date: '2026-08-05',
  time: '10:00', master: 'M', status: 'honoré',
} as Appointment; // apptNetXof = prix de A = 10 000, et pas d'invoiceId → compté comme rituel
const cbx: Cashbox[] = [
  { id: 'k1', branchId: 'br', name: 'Bocal', sub: '', glyph: '◈', openingXof: 0 } as Cashbox,
  { id: 'k2', branchId: 'br', name: 'Épargne', sub: '', glyph: '◈', openingXof: 0, horsBilan: true } as Cashbox,
];
const apprenantsR = [{ payments: [{ date: '2026-08-25', amountXof: 15_000 }] }];
const abonnesR = [{ payments: [{ date: '2026-08-12', amountXof: 25_000 }, { date: '2026-08-12', amountXof: 0 }] }];
const baseArgs = { invoices: [invMix], appts: [rdvHonore], byId, apprenants: apprenantsR, abonnes: abonnesR, branchId: 'br', cashboxes: cbx };

/* Tout compte : 30 000 + 20 000 (factures) + 10 000 (rituel) + 15 000 (formation)
   + 25 000 (abonnement ; le versement à 0 est écarté). */
dit('le CA du mois somme les quatre composantes', 100_000, revenuDuMois(baseArgs, '2026-08'));
/* Le Bilan écarte les caisses hors bilan : les 20 000 tombés dans « Épargne »
   sortent, le reste tient. */
dit('exclureHorsBilan retire les versements hors bilan', 80_000,
  revenuDuMois(baseArgs, '2026-08', { exclureHorsBilan: true }));
/* La borne du jour (KPI mois-à-date) : au 15, le versement du 20, la formation
   du 25 sont dehors ; le versement du 10, le rituel du 5, l'abonnement du 12 restent. */
dit('la borne du jour arrête au mois-à-date', 65_000,
  revenuDuMois(baseArgs, '2026-08', { cut: '2026-08-15' }));
/* Un autre mois ne prend rien de celui-ci. */
dit('un mois voisin ne compte pas', 0, revenuDuMois(baseArgs, '2026-07'));

/* ═══════════════════════════════════════════════════════════════════
   LA COMMISSION DÉTAILLÉE — UNE SEULE PORTE POUR PERSONNEL ET LE RUN — 24 août.

   Décision : le moteur détaillé (prorata par prestation, mains partagées, taux
   par palier, commission produits) fait foi, pas le forfait `commissionPct`. Le
   tableau Personnel ET le run de Paie appellent `commissionDetaillee` — un net
   de commission identique des deux côtés. Ces assertions la tiennent.
   ═══════════════════════════════════════════════════════════════════ */
const maitre = { id: 'st1', name: 'Awa T.', branchId: 'br', role: 'maitre', commissionne: true } as StaffMember;
const ratesC: CommRates = { fondation: 10, elevation: 15, souverainete: 20, produits: 5 };
/* A = 'a', palier Fondation, prix 10 000 (voir sv() plus haut). Rituel honoré,
   au maître Awa T., un seul geste : net 10 000. */
const rdvComm = { id: 'apc', branchId: 'br', clientId: 'c1', serviceIds: ['a'], date: '2026-08-05', time: '10:00', master: 'Awa T.', status: 'honoré' } as Appointment;
const argsC = { appts: [rdvComm], invoices: [], byId, team: [maitre], branchId: 'br', rates: ratesC };
const cd = commissionDetaillee(maitre, '2026-08', argsC);
dit('commission prestation = net × taux du palier (10 000 × 10 %)', 1000, cd.presta);
dit('… pas de produit sans facture produit', 0, cd.produit);

/* Une facture produit attribuée au maître : total × taux produits. */
const factProduit = { id: 'fp', branchId: 'br', kind: 'facture', number: 'F-P', clientId: 'c1', date: '2026-08-10', master: 'Awa T.', status: 'payée', lines: [ligneFacture('Huile Kòfí', 20_000)], globalDiscountPct: 0, theme: 'Aube' } as Invoice;
const cd2 = commissionDetaillee(maitre, '2026-08', { ...argsC, invoices: [factProduit] });
dit('commission produit = total facture × taux produits (20 000 × 5 %)', 1000, cd2.produit);

/* Une prestation à DEUX mains partage la commission — chacune la moitié. */
const rdvDeux = { ...rdvComm, id: 'apd', mains: [['st1', 'st2']] } as Appointment;
const maitre2 = { ...maitre, id: 'st2', name: 'Bri S.' } as StaffMember;
dit('deux mains se partagent la commission', 500,
  commissionDetaillee(maitre, '2026-08', { ...argsC, appts: [rdvDeux], team: [maitre, maitre2] }).presta);

/* Un maître NON commissionné ne touche rien, quel que soit le barème. */
const salarie = { ...maitre, id: 'st3', name: 'Sal A.', commissionne: false } as StaffMember;
const rdvSal = { ...rdvComm, id: 'aps', master: 'Sal A.' } as Appointment;
dit('un non-commissionné ne touche rien', 0,
  commissionDetaillee(salarie, '2026-08', { ...argsC, appts: [rdvSal], team: [salarie] }).presta);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
