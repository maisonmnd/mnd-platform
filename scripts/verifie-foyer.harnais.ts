/* SALON & FOYER, ÉPROUVÉ. La règle du Partage répartit sans perdre un franc ;
   le revenu se lit hors pourboires ; la dette monte et s'éteint ; les caisses
   étanches comptent chacune chez elle. Lancé par `node scripts/verifie-foyer.mjs`. */
import {
  PARTAGE_DEFAUT, partageDe, partageValide, partageNormalise, enveloppesDuMois, revenuPartageDuMois,
  beneficeReel, poidsDesCharges,
  prelevesDuMois, detteEnCours, pretSigneXof, pretDepassementId,
  dotationId, dotationIdLegacy, modifieLigneEpargne, caissesDe, deviseDeCaisse, soldeCaisse, mouvementsDe,
  soldeEnveloppe, mvtsEnveloppe, dotationDuMois, doterAuCoffre,
  verserDansEnveloppe, retirerDeEnveloppe, supprimeLigneEpargne,
  moisPlus, joursEntre, echeancesDuPret, etatsDesEmprunteurs, parUrgence, pretsASurveiller,
  type PartageConfig, type Prelevement, type PretAssocie, type Pret,
  type CaisseIndep, type MouvementCaisseIndep,
} from '../src/shared/foyer';
import { coffreStore, coffreBalance } from '../src/shared/finance';
import type { Receipt } from '../src/shared/receipts';

const BR = 'br';
let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── LA RÈGLE DU PARTAGE — TROIS parts, validées à 100 ──
   Le repère de charges ne compte pas : il ne prend rien au partage. */
dit('les défauts du modèle font 100', true, partageValide({ ...PARTAGE_DEFAUT }));
dit('99 % ne s’enregistre pas', false, partageValide({ pctReinvest: 20, pctReserve: 20, pctPrelevement: 59 }));
dit('un pourcentage négatif non plus', false, partageValide({ pctReinvest: -30, pctReserve: 5, pctPrelevement: 125 }));
dit('le repère de charges n’entre PAS dans le total', true,
  partageValide({ ...PARTAGE_DEFAUT, pctCharges: 999 } as never));

const cfg: PartageConfig = { id: 'pc-br', branchId: BR, ...PARTAGE_DEFAUT };
dit('sans règle enregistrée, les défauts commandent', PARTAGE_DEFAUT.pctPrelevement, partageDe([], BR).pctPrelevement);
dit('la règle de la branche prime', 30,
  partageDe([{ id: 'pc-br', branchId: BR, pctCharges: 50, pctReinvest: 40, pctReserve: 30, pctPrelevement: 30 }], BR).pctPrelevement);

/* ── LES RÈGLES D'AVANT LE 11 AOÛT SE RENORMALISENT ──
   40·15·10·35 : les trois parts restantes ne font que 60. Les lire telles
   quelles amputerait le partage d'un tiers, en silence. */
dit('une règle à trois parts déjà justes ne bouge pas', { reinvest: 20, reserve: 20, prelevement: 60 },
  partageNormalise(PARTAGE_DEFAUT));
dit('15·10·35 (soit 60) se ramène à 100 sans rien perdre', 100, (() => {
  const p = partageNormalise({ pctReinvest: 15, pctReserve: 10, pctPrelevement: 35 });
  return p.reinvest + p.reserve + p.prelevement;
})());
dit('… en gardant les proportions', { reinvest: 25, reserve: 17, prelevement: 58 },
  partageNormalise({ pctReinvest: 15, pctReserve: 10, pctPrelevement: 35 }));
dit('une règle vide ne rend pas NaN', { reinvest: 0, reserve: 0, prelevement: 100 },
  partageNormalise({ pctReinvest: 0, pctReserve: 0, pctPrelevement: 0 }));

/* ── LE BÉNÉFICE, ET LUI SEUL, SE PARTAGE ── */
dit('bénéfice = revenu − charges réelles', 300_000, beneficeReel(1_000_000, 700_000));
const e1 = enveloppesDuMois(beneficeReel(1_000_000, 500_000), cfg);
dit('500 000 de bénéfice à 20·20·60', { reinvest: 100_000, reserve: 100_000, prelevement: 300_000 }, e1);
const e2 = enveloppesDuMois(1_000_003, cfg);
dit('un bénéfice impair se répartit SANS reste', 1_000_003, e2.reinvest + e2.reserve + e2.prelevement);

/* LA PERTE NE SE PARTAGE PAS — jamais d'enveloppe négative. */
dit('un bénéfice négatif rend trois zéros', { reinvest: 0, reserve: 0, prelevement: 0 },
  enveloppesDuMois(beneficeReel(187_500, 230_000), cfg));
dit('un bénéfice nul aussi', { reinvest: 0, reserve: 0, prelevement: 0 }, enveloppesDuMois(0, cfg));

/* Le poids des charges — un repère, pas une enveloppe. */
dit('230 000 de charges sur 187 500 encaissés', 123, poidsDesCharges(187_500, 230_000));
dit('sans revenu, la question n’a pas de sens', null, poidsDesCharges(0, 50_000));

/* ── LE REVENU DU PARTAGE — les encaissements, HORS pourboires ──
   Depuis le 11 août le registre porte le pourboire sur SA ligne
   (`kind: 'pourboire'`) : le revenu du Partage l'écarte par sa nature,
   sans plus rien soustraire des lignes de facture. */
const recus: Receipt[] = [
  { id: 'r1', kind: 'facture', date: '2026-08-05', clientName: 'A', amountXof: 50_000, method: 'Espèces', label: '', invoiceId: 'i1' },
  { id: 'rt1', kind: 'pourboire', date: '2026-08-05', clientName: 'A', amountXof: 5_000, method: 'Espèces', cashbox: 'Pourboires', label: '', invoiceId: 'i1' },
  { id: 'r2', kind: 'acompte', date: '2026-08-12', clientName: 'B', amountXof: 20_000, method: 'MoMo', label: '' },
  { id: 'r3', kind: 'facture', date: '2026-07-30', clientName: 'C', amountXof: 88_000, method: 'Espèces', label: '', invoiceId: 'i2' },
  { id: 'rt3', kind: 'pourboire', date: '2026-07-30', clientName: 'C', amountXof: 2_000, method: 'Espèces', cashbox: 'Pourboires', label: '', invoiceId: 'i2' },
];
dit('la ligne pourboire est écartée du Partage', 70_000, revenuPartageDuMois(recus, '2026-08'));
dit('l’autre mois ne compte pas', 88_000, revenuPartageDuMois(recus, '2026-07'));
dit('sans ligne pourboire, rien n’est soustrait', 70_000,
  revenuPartageDuMois(recus.filter((r) => r.kind !== 'pourboire'), '2026-08'));

/* ── L'ANNEXE — le mois et la branche seulement ── */
const plv: Prelevement[] = [
  { id: 'p1', branchId: BR, date: '2026-08-02', beneficiaire: 'Foyer', motif: 'Nourriture', amountXof: 45_000 },
  { id: 'p2', branchId: BR, date: '2026-07-28', beneficiaire: 'Brice', motif: 'Transport', amountXof: 20_000 },
  { id: 'p3', branchId: 'autre', date: '2026-08-09', beneficiaire: 'Yéman', motif: 'Santé', amountXof: 15_000 },
];
dit('les retraits du mois, de cette branche', ['p1'], prelevesDuMois(plv, BR, '2026-08').map((p) => p.id));

/* ── LA DETTE — elle monte, s'éteint, ne devient jamais négative ── */
const prets: PretAssocie[] = [
  { id: 'l1', branchId: BR, date: '2026-08-15', type: 'pret', associe: 'Foyer', motif: 'Dépassement août', amountXof: 50_000 },
  { id: 'l2', branchId: BR, date: '2026-09-05', type: 'remboursement', associe: 'Foyer', motif: 'Retenue septembre', amountXof: 25_000 },
];
dit('un prêt pèse en plus, un remboursement en moins', [50_000, -25_000], prets.map(pretSigneXof));
dit('dette : 50 000 − 25 000', 25_000, detteEnCours(prets, BR));
dit('trop remboursé = zéro, jamais un dû du salon', 0,
  detteEnCours([...prets, { id: 'l3', branchId: BR, date: '2026-10-05', type: 'remboursement', associe: 'Foyer', motif: '', amountXof: 99_000 }], BR));
dit('l’autre branche ne doit rien', 0, detteEnCours(prets, 'autre'));
dit('la conversion d’un mois a UN identifiant', pretDepassementId(BR, '2026-08'), pretDepassementId(BR, '2026-08'));
/* LA BRANCHE EST DANS L'IDENTIFIANT (12 août) : deux branches en dépassement
   le même mois ne partagent plus la même ligne — B n'efface plus la dette
   envers A. L'ancien id (sans branche) reste reconnu pour les mois en base. */
dit('… et deux branches ont DEUX identifiants', false,
  pretDepassementId(BR, '2026-08') === pretDepassementId('autre', '2026-08'));

/* ── L'ÉPARGNE VIT AU COFFRE — un seul registre, deux enveloppes ── */
coffreStore.set(() => [
  /* Une ligne du coffre qui n'a RIEN à voir avec le Partage : elle ne doit
     jamais entrer dans les enveloppes, mais compte dans le coffre. */
  { id: 'ord', branchId: BR, kind: 'depot', amountXof: 500_000, date: '2026-07-01', note: 'Mise de côté au comptoir' },
]);

doterAuCoffre({ branchId: BR, enveloppe: 'reinvestissement', mois: '2026-08', amountXof: 100_000, date: '2026-08-28' });
doterAuCoffre({ branchId: BR, enveloppe: 'fiscale', mois: '2026-08', amountXof: 100_000, date: '2026-08-28' });
dit('une dotation entre au coffre EN UNE FOIS', 100_000, soldeEnveloppe(coffreStore.get(), BR, 'reinvestissement'));
dit('… sous l’identifiant du mois', dotationId(BR, 'fiscale', '2026-08'), dotationDuMois(coffreStore.get(), BR, 'fiscale', '2026-08')?.id);
/* L'ANCIEN identifiant (sans branche) reste reconnu — pour NOTRE branche
   seulement : celui d'une autre branche n'est ni lu ni écrasé. */
coffreStore.set((prev) => [...prev, {
  id: dotationIdLegacy('reinvestissement', '2026-06'), branchId: BR, kind: 'depot',
  amountXof: 30_000, date: '2026-06-28', origine: 'reserve', enveloppe: 'reinvestissement',
}]);
dit('l’ancien id sans branche se lit encore', 30_000,
  dotationDuMois(coffreStore.get(), BR, 'reinvestissement', '2026-06')?.amountXof);
dit('… mais pas depuis une AUTRE branche', undefined,
  dotationDuMois(coffreStore.get(), 'autre', 'reinvestissement', '2026-06')?.amountXof);
doterAuCoffre({ branchId: BR, enveloppe: 'reinvestissement', mois: '2026-06', amountXof: 45_000, date: '2026-06-29' });
dit('re-doter un mois legacy REMPLACE la vieille ligne', 45_000,
  dotationDuMois(coffreStore.get(), BR, 'reinvestissement', '2026-06')?.amountXof);
dit('… sans en laisser deux', 1,
  mvtsEnveloppe(coffreStore.get(), BR, 'reinvestissement').filter((m) => m.date.slice(0, 7) === '2026-06').length);
supprimeLigneEpargne(dotationId(BR, 'reinvestissement', '2026-06'));

/* L'ENVELOPPE D'UNE DOTATION NE SE RE-LIBELLE PAS : l'id la porte, et le
   panneau détruisait la ligne re-libellée. Le patch enveloppe est ignoré. */
modifieLigneEpargne(dotationId(BR, 'fiscale', '2026-08'), { enveloppe: 'reinvestissement', note: 'essai' });
dit('re-libeller une dotation est refusé (l’enveloppe tient)', 'fiscale',
  dotationDuMois(coffreStore.get(), BR, 'fiscale', '2026-08')?.enveloppe);
dit('… mais le reste du patch passe', 'essai',
  dotationDuMois(coffreStore.get(), BR, 'fiscale', '2026-08')?.note);

/* IDEMPOTENCE : réinscrire le même mois AJUSTE, ne double jamais. */
doterAuCoffre({ branchId: BR, enveloppe: 'reinvestissement', mois: '2026-08', amountXof: 120_000, date: '2026-08-28' });
dit('réinscrire le même mois AJUSTE au lieu de doubler', 120_000, soldeEnveloppe(coffreStore.get(), BR, 'reinvestissement'));
dit('… et ne laisse qu’UNE ligne pour ce mois', 1,
  mvtsEnveloppe(coffreStore.get(), BR, 'reinvestissement').length);

dit('l’épargne du Partage additionne les deux enveloppes', 220_000, soldeEnveloppe(coffreStore.get(), BR));
dit('LE MUR : la ligne ordinaire du coffre reste HORS des enveloppes', 500_000,
  coffreBalance(coffreStore.get()) - soldeEnveloppe(coffreStore.get(), BR));

/* Un retrait est un VIREMENT — la seule sortie que le coffre autorise. */
dit('on ne retire pas plus que l’enveloppe ne porte', false,
  retirerDeEnveloppe({ branchId: BR, enveloppe: 'fiscale', amountXof: 150_000, date: '2026-09-10' }).ok);
dit('… et rien n’a bougé', 100_000, soldeEnveloppe(coffreStore.get(), BR, 'fiscale'));
dit('un montant nul est refusé', false,
  retirerDeEnveloppe({ branchId: BR, enveloppe: 'fiscale', amountXof: 0, date: '2026-09-10' }).ok);
dit('le retrait juste passe', true,
  retirerDeEnveloppe({ branchId: BR, enveloppe: 'fiscale', amountXof: 40_000, date: '2026-09-10' }).ok);
dit('… l’enveloppe baisse', 60_000, soldeEnveloppe(coffreStore.get(), BR, 'fiscale'));
dit('… et le coffre entier aussi', 680_000, coffreBalance(coffreStore.get()));

verserDansEnveloppe({ branchId: BR, enveloppe: 'fiscale', amountXof: 10_000, date: '2026-09-11', note: 'Appoint' });
dit('un dépôt libre s’ajoute à l’enveloppe', 70_000, soldeEnveloppe(coffreStore.get(), BR, 'fiscale'));

/* Retirer une dotation dont on a déjà dépensé une part laisse l'enveloppe
   NÉGATIVE — et c'est voulu : un négatif dit la vérité (« il manque 30 000 »)
   là où un zéro la cacherait. Même doctrine que le stock. */
supprimeLigneEpargne(dotationId(BR, 'fiscale', '2026-08'));
dit('retirer sa dotation laisse un négatif qui dit la vérité', -30_000,
  soldeEnveloppe(coffreStore.get(), BR, 'fiscale'));
dit('… sans toucher à la ligne ordinaire', 500_000,
  coffreBalance(coffreStore.get()) - soldeEnveloppe(coffreStore.get(), BR));

/* ── LES CAISSES ÉTANCHES — autant qu'on veut, chacune compte chez elle ── */
const cx: CaisseIndep[] = [
  { id: 'cx-suc', branchId: BR, nom: 'Succession', ordre: 1 },
  { id: 'cx-eur', branchId: BR, nom: 'Devises · EUR', devise: 'EUR', ordre: 2 },
  { id: 'cx-ter', branchId: BR, nom: 'Projet terrain', ordre: 3 },
  { id: 'cx-x', branchId: 'autre', nom: "Caisse d'ailleurs" },
];
dit('les caisses de la branche, dans l’ordre', ['Succession', 'Devises · EUR', 'Projet terrain'],
  caissesDe(cx, BR).map((c) => c.nom));
dit('sans devise, c’est celle de la maison', 'XOF', deviseDeCaisse(cx[0], 'XOF'));
dit('avec devise, c’est la sienne', 'EUR', deviseDeCaisse(cx[1], 'XOF'));

const mvt: MouvementCaisseIndep[] = [
  { id: 'm1', branchId: BR, caisseId: 'cx-suc', date: '2026-08-01', sens: 'entree', label: 'Report de solde', montant: 300_000 },
  { id: 'm2', branchId: BR, caisseId: 'cx-suc', date: '2026-08-14', sens: 'sortie', label: 'Frais notaire', montant: 45_000 },
  { id: 'm3', branchId: BR, caisseId: 'cx-eur', date: '2026-08-02', sens: 'entree', label: 'Virement reçu', montant: 200, taux: 655 },
  { id: 'm4', branchId: BR, caisseId: 'cx-eur', date: '2026-08-16', sens: 'sortie', label: 'Achat colorations', montant: 120.5, taux: 655 },
];
dit('succession : 300 000 − 45 000', 255_000, soldeCaisse(mvt, 'cx-suc'));
dit('la caisse en euros compte ses centimes', 79.5, soldeCaisse(mvt, 'cx-eur'));
dit('une caisse jamais mouvementée vaut zéro', 0, soldeCaisse(mvt, 'cx-ter'));
dit('LE MUR : une caisse ne voit QUE ses mouvements', ['m2', 'm1'],
  mouvementsDe(mvt, 'cx-suc').map((m) => m.id));
/* Les centimes ne dérivent pas : 0,1 + 0,2 ne doit jamais rendre 0,30000000000000004. */
dit('les décimales restent propres', 0.3, soldeCaisse([
  { id: 'a', branchId: BR, caisseId: 'k', date: '2026-08-01', sens: 'entree', label: '', montant: 0.1 },
  { id: 'b', branchId: BR, caisseId: 'k', date: '2026-08-02', sens: 'entree', label: '', montant: 0.2 },
], 'k'));

/* ── L’ÉCHÉANCE D’UN PRÊT — 23 août 2026 ──────────────────────────
   Ce qui manquait n’était pas un écran, c’était une date : un prêt sans date
   de retour ne se réclame pas, il s’oublie. Ces assertions tiennent le calcul
   des versements attendus, l’imputation des remboursements, et l’ordre de
   lecture — qui doit être celui de l’urgence. */
const BRP = 'br';
const pret = (o: Partial<Pret>): Pret => ({
  id: o.id ?? 'p1', branchId: BRP, date: o.date ?? '2026-05-05',
  type: o.type ?? 'pret', associe: o.associe ?? 'Olivier', motif: 'Prêt',
  amountXof: o.amountXof ?? 30_000, genre: 'tiers',
  echeance: o.echeance, echeancier: o.echeancier, retenueXof: o.retenueXof,
} as Pret);

/* Le mois de plus se replie sur le dernier jour : le 31 janvier plus un mois
   tombe au 28, jamais au 3 mars — une échéance ne saute pas de mois. */
dit('le 31 janvier plus un mois tombe au 28 février', '2026-02-28', moisPlus('2026-01-31', 1));
dit('le 15 mars plus trois mois tombe au 15 juin', '2026-06-15', moisPlus('2026-03-15', 3));
dit('huit jours de retard se comptent huit', 8, joursEntre('2026-08-15', '2026-08-23'));

/* LA SOMME DES VERSEMENTS FAIT LE PRÊT, AU FRANC PRÈS — le dernier porte
   l’arrondi, sinon quatre parts de 7 500 ne rendraient pas 30 001. */
const quatre = echeancesDuPret(pret({ amountXof: 30_001, echeancier: { nombre: 4, premier: '2026-09-30' } }));
dit('quatre versements sont posés', 4, quatre.length);
dit('leur somme fait le prêt exactement', 30_001, quatre.reduce((n, e) => n + e.montantXof, 0));
dit('ils tombent de mois en mois', ['2026-09-30', '2026-10-30', '2026-11-30', '2026-12-30'], quatre.map((e) => e.date));
dit('un prêt sans date n’attend rien', 0, echeancesDuPret(pret({})).length);

/* LE REMBOURSÉ COUVRE LE PLUS ANCIEN D’ABORD — la règle du comptoir.
   L’imputer autrement ferait apparaître un retard là où l’emprunteur a payé. */
const lignesPret: Pret[] = [
  pret({ id: 'a', amountXof: 40_000, echeancier: { nombre: 4, premier: '2026-05-30' } }),
  pret({ id: 'b', type: 'remboursement', amountXof: 20_000, date: '2026-07-02' }),
];
const [olivier] = etatsDesEmprunteurs(lignesPret, BRP, '2026-08-23');
dit('les deux premiers versements sont couverts', 2, olivier.attendus.length);
dit('le prochain attendu est celui de juillet', '2026-07-30', olivier.prochaine?.date);
dit('et il est en retard de 24 jours', 24, olivier.retardJours);
dit('le reste dû ne bouge pas', 20_000, olivier.reste);

/* Un remboursement PARTIEL ampute l’échéance sans la faire disparaître. */
const partiel = etatsDesEmprunteurs([
  pret({ id: 'c', amountXof: 30_000, echeance: '2026-08-15' }),
  pret({ id: 'd', type: 'remboursement', amountXof: 10_000, date: '2026-08-20' }),
], BRP, '2026-08-23')[0];
dit('il reste 20 000 à l’échéance entamée', 20_000, partiel.prochaine?.montantXof);

/* SOLDÉ, PLUS RIEN N’EST ATTENDU — et surtout aucun retard n’est annoncé. */
const soldeSansReste = etatsDesEmprunteurs([
  pret({ id: 'e', amountXof: 30_000, echeance: '2026-08-15' }),
  pret({ id: 'f', type: 'remboursement', amountXof: 30_000, date: '2026-08-14' }),
], BRP, '2026-08-23')[0];
dit('un prêt soldé n’attend plus rien', 0, soldeSansReste.attendus.length);
dit('… et ne se dit jamais en retard', 0, soldeSansReste.retardJours);

/* UN PRÊT SANS ÉCHÉANCE NE SE DIT JAMAIS EN RETARD : on ne réclame pas une
   date qu’on n’a jamais posée. Mais l’écran doit pouvoir le repérer. */
const nu = etatsDesEmprunteurs([pret({ id: 'g', amountXof: 30_000 })], BRP, '2027-01-01')[0];
dit('sans échéance, aucun retard', 0, nu.retardJours);
dit('… et il se signale comme tel', true, nu.sansEcheance);

/* L’ORDRE DE LECTURE EST L’ORDRE DE L’URGENCE. */
const aTrier = [
  { nom: 'à jour', reste: 90_000, retardJours: 0, prochaine: { date: '2026-12-01' } },
  { nom: 'très en retard', reste: 10_000, retardJours: 40, prochaine: { date: '2026-07-01' } },
  { nom: 'soldé', reste: 0, retardJours: 0 },
  { nom: 'peu en retard', reste: 50_000, retardJours: 3, prochaine: { date: '2026-08-20' } },
] as any[];
dit('le retard passe devant, le soldé ferme la marche',
  ['très en retard', 'peu en retard', 'à jour', 'soldé'],
  [...aTrier].sort(parUrgence).map((e) => e.nom));

/* Le Tableau de bord ne montre que ce qui presse : dépassé, ou sous huit jours. */
const veille = pretsASurveiller([
  pret({ id: 'h', associe: 'Proche', amountXof: 10_000, echeance: '2026-08-27' }),
  pret({ id: 'i', associe: 'Lointain', amountXof: 10_000, echeance: '2026-11-30' }),
], BRP, '2026-08-23');
dit('seule l’échéance proche remonte', ['Proche'], veille.map((e) => e.nom));


console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
