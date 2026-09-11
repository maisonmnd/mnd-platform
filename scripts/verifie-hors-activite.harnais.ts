/* LES ENTRÉES HORS ACTIVITÉ, ÉPROUVÉES — `node scripts/verifie-hors-activite.mjs`.

   Ce qui se joue ici est la sincérité du compte de résultat. Une entrée hors
   activité qui se glisserait dans le chiffre d'affaires ferait un mois record
   qui n'a pas eu lieu, et le mois suivant s'effondrerait sans raison ; une
   entrée qui n'apparaîtrait nulle part laisserait dans le tiroir des billets
   que le Trône ne sait pas dépenser. Les deux fautes se découvrent tard, et
   devant un comptable. */
import {
  MOTIFS_HORS_ACTIVITE, horsActiviteXof, horsActiviteParMotif,
  pourquoiEntreeImpossible, sensDe, echeancesDeLEmprunt, resteDuDeLEmprunt,
  empruntSolde, prochaineEcheanceDeLEmprunt, detteDeLaMaison,
  pourquoiEmpruntImpossible, type EntreeHorsActivite, type Emprunt,
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

/* ══ RENDRE N'EST PAS DÉPENSER — l'emprunt reçu, second passage ═════
   Ce qui se joue ici est le miroir exact de la faute évitée le matin :
   compter un remboursement en charge écraserait le résultat des mois
   suivants d'un argent qui n'a jamais été une dépense. */

/* ── LE SENS, absent compris ─────────────────────────────────────── */
dit('un mouvement sans sens est une entrée', 'entree', sensDe({}));
dit('… et le sens écrit fait foi', 'sortie', sensDe({ sens: 'sortie' }));

const mvts = [
  e({ id: 'a', date: '2026-09-11', amountXof: 500000 }),
  e({ id: 'b', date: '2026-09-20', amountXof: 159091, sens: 'sortie', motif: 'Remboursement d’emprunt' }),
];
dit('les entrées se comptent seules', 500000, horsActiviteXof(mvts, 'b1', '2026-09'));
dit('… et les sorties aussi', 159091, horsActiviteXof(mvts, 'b1', '2026-09', 'sortie'));
dit('le regroupement suit le sens',
  [{ motif: 'Remboursement d’emprunt', xof: 159091, n: 1 }],
  horsActiviteParMotif(mvts, 'b1', '2026-09', 'sortie'));

/* ── L'ÉCHÉANCIER : rien ne se perd à l'arrondi ──────────────────── */
const emp: Emprunt = {
  id: 'e1', branchId: 'b1', preteur: 'M. A.', motif: 'Avance du loyer',
  date: '2026-09-11', recuXof: 500000, aRendreXof: 550000,
  cashbox: 'Caisse principale', nombre: 3, premier: '2026-09-30',
};
const ech = echeancesDeLEmprunt(emp);
dit('trois échéances', 3, ech.length);
dit('elles tombent de mois en mois', ['2026-09-30', '2026-10-30', '2026-11-30'], ech.map((x) => x.dueIso));
/* LA SOMME EST EXACTE, c'est tout l'enjeu : trois fois 166 666 rendraient
   499 998 et la dette ne se solderait jamais tout à fait. */
dit('les principaux rendent EXACTEMENT le reçu', 500000, ech.reduce((s2, x) => s2 + x.principalXof, 0));
dit('les intérêts font EXACTEMENT le prix de l’argent', 50000, ech.reduce((s2, x) => s2 + x.interetXof, 0));
dit('et le total rendu est celui promis', 550000, ech.reduce((s2, x) => s2 + x.totalXof, 0));
dit('le dernier versement absorbe les arrondis', 166668, ech[2].principalXof);

/* Sans intérêt, aucune charge ne doit naître. */
const sansInteret = echeancesDeLEmprunt({ ...emp, aRendreXof: 500000 });
dit('un emprunt sans prix n’a aucun intérêt', 0, sansInteret.reduce((s2, x) => s2 + x.interetXof, 0));

/* Un seul versement : tout au premier jour, sans arrondi perdu. */
const enUneFois = echeancesDeLEmprunt({ ...emp, nombre: 1 });
dit('en une fois, tout tombe d’un coup', [550000], enUneFois.map((x) => x.totalXof));

/* Le 31 n'existe pas partout : l'échéance ne saute pas au mois suivant. */
const finDeMois = echeancesDeLEmprunt({ ...emp, premier: '2026-01-31', nombre: 3 });
dit('le 31 janvier ne devient pas le 3 mars',
  ['2026-01-31', '2026-02-28', '2026-03-31'], finDeMois.map((x) => x.dueIso));

/* ── LE RESTE DÛ, et la dette de la Maison ───────────────────────── */
dit('rien rendu, tout est dû', 550000, resteDuDeLEmprunt(emp));
const entame = { ...emp, reglees: [{ rang: 1, date: '2026-09-30' }] };
/* 550 000 moins la première échéance (166 666 + 16 666) : la dette restante
   se lit sur les DEUX échéances qui restent, arrondi du dernier compris. */
dit('une échéance rendue baisse la dette', 366668, resteDuDeLEmprunt(entame));
dit('… et elle n’est plus la prochaine', 2, prochaineEcheanceDeLEmprunt(entame)?.rang);
dit('un emprunt entamé n’est pas soldé', false, empruntSolde(entame));
const soldeTout = { ...emp, reglees: [{ rang: 1, date: 'x' }, { rang: 2, date: 'y' }, { rang: 3, date: 'z' }] };
dit('tout rendu, il est soldé', true, empruntSolde(soldeTout));
dit('… et il ne reste plus d’échéance à venir', undefined, prochaineEcheanceDeLEmprunt(soldeTout));
dit('la dette de la Maison somme les emprunts vivants', 550000, detteDeLaMaison([emp, soldeTout], 'b1'));
dit('… et ignore les autres branches', 0, detteDeLaMaison([emp], 'b9'));

/* ── CE QUI EMPÊCHE DE POSER, dit plutôt que tu ─────────────────── */
const bon = {
  preteur: 'M. A.', recuXof: 500000, aRendreXof: 550000,
  cashbox: 'Caisse principale', nombre: 3, premier: '2026-09-30',
};
dit('un emprunt complet passe', null, pourquoiEmpruntImpossible(bon));
dit('sans prêteur, on refuse', 'Il manque le nom de qui prête.',
  pourquoiEmpruntImpossible({ ...bon, preteur: ' ' }));
dit('sans montant non plus', 'Un emprunt sans montant n’apporte rien.',
  pourquoiEmpruntImpossible({ ...bon, recuXof: 0 }));
/* LA GARDE QUI COMPTE : rendre moins qu'on a reçu ferait un intérêt négatif,
   donc un « gain » sorti de nulle part au fil des échéances. */
dit('on ne rend jamais moins qu’on n’a reçu', 'On ne rend jamais moins qu’on n’a reçu.',
  pourquoiEmpruntImpossible({ ...bon, aRendreXof: 400000 }));
dit('rendre exactement le reçu est permis', null,
  pourquoiEmpruntImpossible({ ...bon, aRendreXof: 500000 }));
dit('sans caisse, l’argent n’aurait pas de tiroir', 'Choisissez la caisse qui reçoit cet argent.',
  pourquoiEmpruntImpossible({ ...bon, cashbox: '' }));
dit('zéro versement n’est pas un échéancier', 'Il faut au moins un versement.',
  pourquoiEmpruntImpossible({ ...bon, nombre: 0 }));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
