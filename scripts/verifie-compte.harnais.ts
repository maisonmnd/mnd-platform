/* LE COMPTE D'UNE CLIENTE, ÉPROUVÉ — débit, crédit, solde, créances et
   plafond de crédit. Lancé par `node scripts/verifie-compte.mjs`.

   Ce harnais tient l'argent d'un compte : ce que la Maison a livré, ce que la
   cliente a versé, ce qu'il reste. Le piège de cet écran est le DOUBLE
   COMPTAGE — un rituel et sa facture disent la même dette — et c'est la
   première chose qu'on éprouve ici. */
import {
  ecrituresDuCompte, soldeDuCompte, creancesDeLaMaison, trancheDe, peutPartirDevant,
  duDeLaTete, duDuCompte, tetesDuCompte, lignesImpayees,
} from '../src/shared/compte';
import type { Appointment } from '../src/shared/agenda';
import type { Invoice, CreditMovement } from '../src/shared/finance';
import type { Client, Family } from '../src/shared/clients';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const AUJ = '2026-08-26';
const rdv = (o: Partial<Appointment> & { id: string; date: string }): Appointment => ({
  branchId: 'br', clientId: 'c1', serviceIds: ['sv'], time: '10:00', master: 'Team',
  status: 'honoré', ...o,
} as Appointment);

/* Le net et le dû sont injectés : le compte ne recalcule JAMAIS un prix, il
   lit le même juge que le Carnet. */
const net = (a: Appointment) => Number((a as never as { netTest?: number }).netTest ?? 0);
const du = (a: Appointment) => Number((a as never as { duTest?: number }).duTest ?? 0);

/* ── ① UN RITUEL LIVRÉ, PAYÉ EN DEUX FOIS ─────────────────────────── */
const a1 = rdv({ id: 'a1', date: '2026-08-01', netTest: 30_000, duTest: 0,
  payments: [
    { id: 'v1', amountXof: 20_000, date: '2026-08-01', method: 'Espèces' },
    { id: 'v2', amountXof: 10_000, date: '2026-08-05', method: 'Momopay' },
  ] } as never);
const e1 = ecrituresDuCompte({ ids: ['c1'], appts: [a1], invoices: [], credits: [], netDuRituel: net, dûDuRituel: du, aujourdhui: AUJ });
dit('un rituel et ses deux versements font trois écritures', 3, e1.length);
dit('… et le compte est soldé', 0, soldeDuCompte(e1));
dit('… les versements gardent LEUR date', ['2026-08-01', '2026-08-01', '2026-08-05'], e1.map((e) => e.date));

/* ── ② LE DOUBLE COMPTAGE — le rituel fait foi ─────────────────────
   Une facture ATTACHÉE au rituel dit la même dette : elle ne doit pas la
   réécrire, sinon la cliente devrait deux fois ce qu'elle doit une fois. */
const a2 = rdv({ id: 'a2', date: '2026-08-10', invoiceId: 'inv-9', netTest: 40_000, duTest: 40_000 } as never);
const fLiee: Invoice = { id: 'inv-9', branchId: 'br', clientId: 'c1', kind: 'facture', number: 'F-9',
  date: '2026-08-10', globalDiscountPct: 0, lines: [{ id: 'l', label: 'Rituel', qty: 1, unitXof: 40_000, discountPct: 0 }], status: 'envoyée' } as Invoice;
const e2 = ecrituresDuCompte({ ids: ['c1'], appts: [a2], invoices: [fLiee], credits: [], netDuRituel: net, dûDuRituel: du, aujourdhui: AUJ });
dit('la facture attachée au rituel ne redit PAS la dette', 40_000, e2.reduce((s, e) => s + e.debitXof, 0));
dit('… le solde reste celui du seul rituel', -40_000, soldeDuCompte(e2));

/* Une facture LIBRE (produits, caisse), elle, entre à son tour. */
const fLibre: Invoice = { ...fLiee, id: 'inv-libre', number: 'F-10', date: '2026-08-12',
  lines: [{ id: 'l2', label: 'Gamme', qty: 1, unitXof: 5_000, discountPct: 0 }] } as Invoice;
const e3 = ecrituresDuCompte({ ids: ['c1'], appts: [a2], invoices: [fLiee, fLibre], credits: [], netDuRituel: net, dûDuRituel: du, aujourdhui: AUJ });
dit('une facture libre entre au débit', 45_000, e3.reduce((s, e) => s + e.debitXof, 0));

/* ── ②bis CE QUI RESTE DÛ, LIGNE PAR LIGNE ─────────────────────────
   La seconde lecture du même relevé : seulement les livraisons non soldées, la
   plus vieille d'abord, chacune sachant ce qui a déjà été versé dessus. */
const aPartiel = rdv({ id: 'ap', date: '2026-06-25', netTest: 40_000, duTest: 30_000,
  payments: [{ id: 'vv', amountXof: 10_000, date: '2026-07-28', method: 'Momopay' }] } as never);
const aSolde = rdv({ id: 'as', date: '2026-08-18', netTest: 20_000, duTest: 0,
  payments: [{ id: 'vs', amountXof: 20_000, date: '2026-08-18', method: 'Espèces' }] } as never);
const aRecent = rdv({ id: 'ar', date: '2026-08-02', netTest: 15_000, duTest: 15_000 } as never);
const impayes = lignesImpayees(ecrituresDuCompte({
  ids: ['c1'], appts: [aSolde, aRecent, aPartiel], invoices: [], credits: [],
  netDuRituel: net, dûDuRituel: du, aujourdhui: AUJ,
}));
dit('seules les livraisons NON soldées entrent', ['ap', 'ar'], impayes.map((l) => l.refId));
dit('… la plus vieille d’abord, c’est elle qui presse', '2026-06-25', impayes[0].date);
dit('… elle sait ce qui a déjà été versé dessus', 10_000, impayes[0].verseXof);
dit('… et ce qu’il reste', 30_000, impayes[0].resteXof);
dit('… l’âge est celui de la LIVRAISON', 62, impayes[0].depuisJours);
dit('un rituel soldé ne laisse aucune ligne', false, impayes.some((l) => l.refId === 'as'));
dit('le total dû égale la somme des lignes', 45_000, impayes.reduce((s, l) => s + l.resteXof, 0));

/* ── ③ L'ÂGE DE LA CRÉANCE ─────────────────────────────────────────
   La date qui fait foi est celle du rituel, jamais celle d'une relance. */
dit('la dette du 10 août a 16 jours au 26', 16, e2.find((e) => e.source === 'rituel')?.impayeDepuisJours);
dit('… et elle porte son reste', 40_000, e2.find((e) => e.source === 'rituel')?.impayeXof);

/* ── ④ LES AVOIRS ──────────────────────────────────────────────────
   Un dépôt crédite, un usage crédite (il solde un débit déjà porté), un
   remboursement débite : l'argent sort de la Maison. */
const av = (o: Partial<CreditMovement> & { id: string; kind: CreditMovement['kind']; amountXof: number; date: string }): CreditMovement =>
  ({ branchId: 'br', holderType: 'client', holderId: 'c1', ...o } as CreditMovement);
const e4 = ecrituresDuCompte({
  ids: ['c1'], appts: [], invoices: [], netDuRituel: net, dûDuRituel: du, aujourdhui: AUJ,
  credits: [av({ id: 'd1', kind: 'depot', amountXof: 20_000, date: '2026-08-02' }),
    av({ id: 'r1', kind: 'remboursement', amountXof: 5_000, date: '2026-08-03' })],
});
dit('un dépôt crédite, un remboursement débite', 15_000, soldeDuCompte(e4));

/* ── ⑤ LE REGISTRE DES CRÉANCES ────────────────────────────────────
   Le dû se cumule par tête, et c'est la PLUS VIEILLE dette qui date le dossier. */
const creances = creancesDeLaMaison({
  aujourdhui: AUJ, dûDuRituel: du,
  appts: [
    rdv({ id: 'x1', clientId: 'c1', date: '2026-08-20', duTest: 10_000 } as never),
    rdv({ id: 'x2', clientId: 'c1', date: '2026-05-01', duTest: 25_000 } as never),
    rdv({ id: 'x3', clientId: 'c2', date: '2026-08-25', duTest: 5_000 } as never),
    rdv({ id: 'x4', clientId: 'c3', date: '2026-08-01', duTest: 0 } as never),
    rdv({ id: 'x5', clientId: 'c4', date: '2026-01-01', duTest: 9_000, status: 'annulé' } as never),
  ],
});
dit('deux têtes doivent quelque chose', ['c1', 'c2'], creances.map((c) => c.clientId));
dit('… le dû d’une tête s’additionne', 35_000, creances[0].duXof);
dit('… et c’est la PLUS VIEILLE dette qui date le dossier', '2026-05-01', creances[0].plusVieilleDate);
dit('un rituel soldé ne fait pas de créance', false, creances.some((c) => c.clientId === 'c3'));
dit('un rituel ANNULÉ non plus — personne ne l’encaissera', false, creances.some((c) => c.clientId === 'c4'));

dit('les tranches se rangent par âge', ['0-30', '30-60', '60-90', '90+'],
  [10, 45, 75, 200].map(trancheDe));
dit('29 jours reste dans le mois', '0-30', trancheDe(29));
dit('30 jours bascule', '30-60', trancheDe(30));

/* ── ⑥ LE PLAFOND DE CRÉDIT ────────────────────────────────────────
   Sans plafond, la Maison n'autorise RIEN : le crédit s'accorde, il ne se
   suppose pas. */
dit('sans plafond, elle ne peut rien emporter', false, peutPartirDevant(undefined, 0, 5_000).autorise);
dit('sous le plafond, elle peut', true, peutPartirDevant(30_000, 10_000, 15_000).autorise);
dit('juste au plafond, elle peut encore', true, peutPartirDevant(30_000, 10_000, 20_000).autorise);
dit('au-delà, non', false, peutPartirDevant(30_000, 10_000, 25_000).autorise);
dit('… et le dépassement se chiffre', 5_000, peutPartirDevant(30_000, 10_000, 25_000).depassementXof);

/* Dans un foyer, la dette naît souvent sur le rituel de l'ENFANT tandis que le
   plafond est posé sur la PAYEUSE : comparer le plafond de l'une au seul dû de
   l'autre laisserait le foyer partir indéfiniment en devant. */
const rdvFoyer = [
  rdv({ id: 'f1', clientId: 'mere', date: '2026-08-01', duTest: 10_000 } as never),
  rdv({ id: 'f2', clientId: 'enfant', date: '2026-08-02', duTest: 25_000 } as never),
  rdv({ id: 'f3', clientId: 'etrangere', date: '2026-08-03', duTest: 99_000 } as never),
];
dit('le dû du FOYER additionne toutes ses têtes', 35_000, duDuCompte(rdvFoyer, ['mere', 'enfant'], du));
dit('… la payeuse seule dirait bien moins', 10_000, duDeLaTete(rdvFoyer, 'mere', du));
dit('… et un plafond de 30 000 ne couvre donc PAS le foyer', false,
  peutPartirDevant(30_000, duDuCompte(rdvFoyer, ['mere', 'enfant'], du), 0).autorise);

dit('le dû d’une tête ignore les annulés', 10_000, duDeLaTete([
  rdv({ id: 'y1', clientId: 'c1', date: '2026-08-01', duTest: 10_000 } as never),
  rdv({ id: 'y2', clientId: 'c1', date: '2026-08-02', duTest: 7_000, status: 'annulé' } as never),
  rdv({ id: 'y3', clientId: 'c9', date: '2026-08-03', duTest: 3_000 } as never),
], 'c1', du));

/* ── ⑦ LE FOYER — la tête rattachée voit le compte de SON FOYER ───── */
const cl = (id: string, familyId?: string): Client => ({ id, name: id, branchId: 'br', familyId } as Client);
const fam: Family[] = [{ id: 'fam', branchId: 'br', name: 'Foyer', payerClientId: 'mere' } as Family];
dit('une tête du foyer voit tout le foyer', ['mere', 'enfant'],
  tetesDuCompte(cl('enfant', 'fam'), [cl('mere', 'fam'), cl('enfant', 'fam'), cl('autre')], fam));
dit('une tête sans famille ne voit qu’elle', ['seule'], tetesDuCompte(cl('seule'), [cl('seule'), cl('autre')], fam));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
