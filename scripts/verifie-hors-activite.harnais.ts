/* LES ENTRÉES HORS ACTIVITÉ, ÉPROUVÉES — `node scripts/verifie-hors-activite.mjs`.

   Ce qui se joue ici est la sincérité du compte de résultat. Une entrée hors
   activité qui se glisserait dans le chiffre d'affaires ferait un mois record
   qui n'a pas eu lieu, et le mois suivant s'effondrerait sans raison ; une
   entrée qui n'apparaîtrait nulle part laisserait dans le tiroir des billets
   que le Trône ne sait pas dépenser. Les deux fautes se découvrent tard, et
   devant un comptable. */
import {
  MOTIFS_HORS_ACTIVITE, horsActiviteXof, horsActiviteParMotif,
  pourquoiEntreeImpossible, type EntreeHorsActivite,
} from '../src/shared/finance';
import { EST_ACTIVITE, buildReceipts, type ReceiptKind } from '../src/shared/receipts';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const e = (o: Partial<EntreeHorsActivite>): EntreeHorsActivite => ({
  id: 'h1', branchId: 'b1', date: '2026-09-11', motif: 'Prêt reçu',
  label: 'Prêt de M. A.', amountXof: 500000, cashbox: 'Caisse principale', ...o,
});

/* ── ① LA SÉPARATION, la règle qui commande tout ────────────────────
   Un apport et un pourboire entrent en caisse sans être un gain : l'un est
   prêté ou versé par le souverain, l'autre appartient aux mains. */
dit('une entrée hors activité n’est pas de l’activité', false, EST_ACTIVITE['hors-activite']);
dit('un pourboire non plus', false, EST_ACTIVITE.pourboire);
dit('une facture, si', true, EST_ACTIVITE.facture);
dit('un rituel sans pièce, si', true, EST_ACTIVITE.rituel);
/* Le tableau doit couvrir TOUS les genres : un genre neuf sans verdict
   passerait pour du chiffre d'affaires par défaut, en silence. */
const GENRES: ReceiptKind[] = ['facture', 'rituel', 'acompte', 'formation', 'abonnement', 'avoir', 'pourboire', 'hors-activite'];
dit('aucun genre n’est laissé sans verdict', [],
  GENRES.filter((g) => typeof EST_ACTIVITE[g] !== 'boolean'));

/* ── ② LE TOTAL D'UNE PÉRIODE ───────────────────────────────────────
   Le préfixe ISO fait la borne : un mois, une année, ou tout. */
const liste = [
  e({ id: 'a', date: '2026-09-11', amountXof: 500000 }),
  e({ id: 'b', date: '2026-09-02', amountXof: 15000, motif: 'Vente de matériel' }),
  e({ id: 'c', date: '2026-08-30', amountXof: 90000, motif: 'Apport du souverain' }),
  e({ id: 'd', date: '2026-09-05', amountXof: 40000, branchId: 'b2' }),
];
dit('le mois borne le total', 515000, horsActiviteXof(liste, 'b1', '2026-09'));
dit('l’année aussi', 605000, horsActiviteXof(liste, 'b1', '2026'));
dit('sans préfixe, tout compte', 605000, horsActiviteXof(liste, 'b1'));
dit('une autre branche ne compte pas ici', 40000, horsActiviteXof(liste, 'b2', '2026-09'));
dit('une branche sans entrée rend zéro', 0, horsActiviteXof(liste, 'b9', '2026-09'));

/* ── ③ LA RÉPARTITION PAR MOTIF, du plus lourd au plus léger ────────
   C'est ce que la Synthèse déplie sous le trait. */
dit('les motifs se regroupent, le plus lourd d’abord',
  [{ motif: 'Prêt reçu', xof: 500000, n: 1 }, { motif: 'Vente de matériel', xof: 15000, n: 1 }],
  horsActiviteParMotif(liste, 'b1', '2026-09'));

/* ── ④ CE QUI EMPÊCHE D'ENREGISTRER se dit, jamais ne se tait ───────
   La phrase est obligatoire : dans six mois, il faudra savoir de qui venait
   cet argent. Un montant nul n'entre rien. */
dit('une entrée complète passe', null,
  pourquoiEntreeImpossible({ label: 'Prêt de M. A.', amountXof: 500000, cashbox: 'Caisse principale', date: '2026-09-11' }));
dit('sans phrase, on refuse et on le dit', 'Il manque de qui vient cet argent, et pourquoi.',
  pourquoiEntreeImpossible({ label: '   ', amountXof: 500000, cashbox: 'Caisse principale', date: '2026-09-11' }));
dit('sans montant non plus', 'Une entrée sans montant n’entre rien.',
  pourquoiEntreeImpossible({ label: 'Prêt', amountXof: 0, cashbox: 'Caisse principale', date: '2026-09-11' }));
dit('un montant négatif n’est pas une entrée', 'Une entrée sans montant n’entre rien.',
  pourquoiEntreeImpossible({ label: 'Prêt', amountXof: -10, cashbox: 'Caisse principale', date: '2026-09-11' }));
dit('sans caisse, l’argent n’aurait pas de tiroir', 'Choisissez la caisse qui reçoit cet argent.',
  pourquoiEntreeImpossible({ label: 'Prêt', amountXof: 500000, cashbox: '', date: '2026-09-11' }));
dit('une date illisible se refuse', 'La date n’est pas lisible.',
  pourquoiEntreeImpossible({ label: 'Prêt', amountXof: 500000, cashbox: 'Caisse principale', date: '11/09/2026' }));

/* ── ⑤ ELLE ENTRE AU REGISTRE, ET ELLE PEUT PAYER ───────────────────
   C'est tout l'intérêt : sans ligne au registre, cet argent serait dans le
   tiroir sans pouvoir en sortir. */
const vide = {
  branchId: 'b1', invoices: [], online: [], appointments: [], credits: [],
  formation: [], abonnements: [],
  nameOf: () => '', apptLabel: () => '',
} as unknown as Parameters<typeof buildReceipts>[0];

const reg = buildReceipts({ ...vide, horsActivite: [e({ id: 'a' })] });
dit('une ligne naît au registre', 1, reg.length);
dit('… sous son propre genre', 'hors-activite', reg[0]?.kind);
dit('… nommée par sa phrase', 'Prêt de M. A.', reg[0]?.clientName);
dit('… avec sa caisse, sinon elle ne paierait rien', 'Caisse principale', reg[0]?.cashbox);
dit('… son identifiant se rejoue', 'r-hors-a', reg[0]?.id);

/* Les gardes : une autre branche, un montant nul, rien du tout. */
dit('une entrée d’une autre branche reste dehors', 0,
  buildReceipts({ ...vide, horsActivite: [e({ id: 'x', branchId: 'b2' })] }).length);
dit('un montant nul n’écrit pas de ligne', 0,
  buildReceipts({ ...vide, horsActivite: [e({ id: 'y', amountXof: 0 })] }).length);
dit('sans entrées, le registre ne change pas', 0, buildReceipts({ ...vide }).length);

/* ── ⑥ LES MOTIFS SONT UNE LISTE FERMÉE ─────────────────────────────
   Six, et « Autre » en dernier — un champ libre donnerait « apport »,
   « Apport », « mon argent », trois lignes pour une seule réalité. */
dit('six motifs, Autre en dernier', 6, MOTIFS_HORS_ACTIVITE.length);
dit('… et le dernier est bien Autre', 'Autre', MOTIFS_HORS_ACTIVITE[MOTIFS_HORS_ACTIVITE.length - 1]);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
