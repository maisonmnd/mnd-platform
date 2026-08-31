/* LA VALIDATION DES DÉPENSES, ÉPROUVÉE — 31 août 2026.

   « À chaque fois qu'un employé émet une dépense il doit recevoir un bouton
   valider d'un souverain pour valider toute la transaction. Sinon tout le monde
   marquerait ce qu'il a envie de marquer » (Yéman).

   DEUX FAUTES SONT POSSIBLES ICI, ET ELLES NE SE VALENT PAS. Laisser entrer
   dans les comptes une dépense que personne n'a regardée vide le contrôle de
   son sens. Faire disparaître une dépense réelle fausse le mois et se découvre
   au comptage, des semaines plus tard. Ni l'une ni l'autre ne plante. */
import {
  DELAI_VALIDATION_H, estEnAttente, estRefusee, compteDansLesChiffres, depensesComptees,
  heuresDattente, enRetard, heuresRestantes, aValider, peutValider, doitEtreValidee,
  soumission, validee, refusee, totalEnAttenteXof, enAttenteSurLaCaisse,
  type Expense, type ValidationDepense,
} from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const T0 = Date.parse('2026-08-30T08:00:00Z');
const h = (n: number) => T0 + n * 3_600_000;

const dep = (p: Partial<Expense>): Expense => ({
  id: 'e1', branchId: 'b1', label: 'Super U', amountXof: 17_500, date: '2026-08-30',
  cashbox: 'Caisse Indépendantes', category: 'Local', ...p,
} as Expense);

const soumise = (p: Partial<Expense> = {}, quand = '2026-08-30T08:00:00Z', qui = 'Kabirou') =>
  dep({ validation: soumission(qui, quand), ...p });

/* ── ① CE QUI EXISTE, ET CE QUI ATTEND ──────────────────────────────
   ABSENT VEUT DIRE ACQUISE. C'est la convention qui permet à la règle d'entrer
   en vigueur sans suspendre d'un coup toute l'histoire des dépenses. */
dit('une dépense sans validation compte', true, compteDansLesChiffres(dep({})));
dit('une dépense validée compte', true,
  compteDansLesChiffres(dep({ validation: validee(soumission('K', '2026-08-30T08:00:00Z'), 'Yéman', '2026-08-31T09:00:00Z') })));
dit('une dépense en attente ne compte pas', false, compteDansLesChiffres(soumise()));
dit('une dépense refusée ne compte pas', false,
  compteDansLesChiffres(dep({ validation: refusee(soumission('K', '2026-08-30T08:00:00Z'), 'Yéman', '2026-08-31T09:00:00Z', 'course personnelle') })));

dit('le filtre laisse passer l’acquis et retient le reste', ['a', 'c'],
  depensesComptees([
    dep({ id: 'a' }),
    soumise({ id: 'b' }),
    dep({ id: 'c', validation: validee(soumission('K', '2026-08-30T08:00:00Z'), 'Y', '2026-08-31T09:00:00Z') }),
  ]).map((e) => e.id));

/* ── ② LES 72 HEURES NE DÉCIDENT RIEN ───────────────────────────────
   Elles changent le ton. Le silence n'accorde pas et ne refuse pas : passé le
   délai, la dépense est toujours en attente, et toujours hors des chiffres.
   C'est le choix de la Maison, et le harnais doit le tenir. */
dit('le délai est de 72 heures', 72, DELAI_VALIDATION_H);
dit('à l’heure zéro, pas de retard', false, enRetard(soumise(), h(0)));
dit('à 71 heures, pas encore', false, enRetard(soumise(), h(71)));
dit('à 72 heures pile, en retard', true, enRetard(soumise(), h(72)));
dit('à 100 heures, toujours EN ATTENTE et non validée', [true, false],
  [estEnAttente(soumise()), compteDansLesChiffres(soumise())]);

dit('il reste 72 h à la soumission', 72, heuresRestantes(soumise(), h(0)));
dit('il en reste 61 après onze heures', 61, heuresRestantes(soumise(), h(11)));
dit('… et jamais moins de zéro', 0, heuresRestantes(soumise(), h(300)));
dit('les heures écoulées se comptent', 11, heuresDattente(soumise(), h(11)));

/* UNE HORLOGE DÉRÉGLÉE NE CRÉE PAS D'HEURES NÉGATIVES. Un téléphone au mauvais
   fuseau soumettrait « dans le futur » : la dépense se lirait alors comme ayant
   -6 h d'attente, et une jauge négative fait peur pour rien. */
dit('une soumission dans le futur se lit « à l’instant »', 0, heuresDattente(soumise(), h(-6)));
dit('… et son délai est intact', 72, heuresRestantes(soumise(), h(-6)));
/* UNE DATE ILLISIBLE NE FAIT PAS TOMBER L'ÉCRAN : elle ne dit simplement rien. */
dit('une date illisible ne compte pas les heures', null,
  heuresDattente(dep({ validation: { etat: 'attente', soumisLe: 'jamais', soumisPar: 'K' } }), h(10)));
dit('ce qui n’attend pas n’a pas d’heures', null, heuresDattente(dep({}), h(10)));

/* ── ③ LA FILE, LA PLUS ANCIENNE D'ABORD ────────────────────────────
   Donc les retards en tête, d'eux-mêmes : aucun tri « les retards puis les
   autres » à écrire, et donc aucun tri qui puisse se contredire. */
const file = [
  soumise({ id: 'recent' }, '2026-08-30T20:00:00Z'),
  dep({ id: 'acquise' }),
  soumise({ id: 'vieille' }, '2026-08-27T06:00:00Z'),
  soumise({ id: 'autre-branche', branchId: 'b2' }, '2026-08-25T06:00:00Z'),
  soumise({ id: 'milieu' }, '2026-08-29T06:00:00Z'),
];
dit('la file est ordonnée du plus ancien au plus récent', ['vieille', 'milieu', 'recent'],
  aValider(file, 'b1').map((e) => e.id));
dit('une autre branche n’entre pas dans la file', 0,
  aValider(file, 'b1').filter((e) => e.id === 'autre-branche').length);
dit('la plus vieille est en retard', true, enRetard(aValider(file, 'b1')[0], h(0)));

/* ── ④ QUI PEUT DIRE OUI ────────────────────────────────────────────
   « Souverain ou gérant » (Yéman). JAMAIS SES PROPRES DÉPENSES : sans cette
   règle, le contrôle serait une formalité qu'on se donne à soi-même. */
const deKabirou = soumise({}, '2026-08-30T08:00:00Z', 'Kabirou');
const deLaGerante = soumise({}, '2026-08-30T08:00:00Z', 'Judith');

dit('un souverain valide', true, peutValider('souverain', 'Yéman', deKabirou));
dit('un gérant valide aussi', true, peutValider('gerant', 'Judith', deKabirou));
dit('un maître ne valide rien', false, peutValider('maitre', 'Kabirou', deKabirou));
dit('la gérante ne valide pas les siennes', false, peutValider('gerant', 'Judith', deLaGerante));
dit('… même écrites autrement', false, peutValider('gerant', ' judith ', deLaGerante));
dit('mais le souverain, lui, le peut', true, peutValider('souverain', 'Yéman', deLaGerante));
dit('rien à valider sur une dépense déjà tranchée', false,
  peutValider('souverain', 'Yéman', dep({ validation: validee(soumission('K', '2026-08-30T08:00:00Z'), 'Y', '2026-08-31T09:00:00Z') })));
dit('ni sur une dépense qui n’a rien demandé', false, peutValider('souverain', 'Yéman', dep({})));
/* UN SOUVERAIN SANS NOM POSÉ NE SE VALIDE PAS LUI-MÊME PAR ACCIDENT : sans nom,
   la comparaison ne peut pas conclure, et `sameName` répond non. La garde de
   l'écran demandera un nom avant d'ouvrir le geste. */
dit('un valideur sans nom ne se reconnaît pas', true, peutValider('souverain', undefined, deKabirou));

/* ── ⑤ QUI DOIT ÊTRE SOUMIS ─────────────────────────────────────────
   Le rôle tranche, pas l'écran : le même juge répond au formulaire, au bandeau
   et au harnais. */
dit('un employé soumet', true, doitEtreValidee('maitre'));
dit('un gérant enregistre directement', false, doitEtreValidee('gerant'));
dit('un souverain aussi', false, doitEtreValidee('souverain'));

/* ── ⑥ LES TRANSITIONS GARDENT LA MÉMOIRE ───────────────────────────
   Qui a soumis, quand, qui a tranché, quand, et pourquoi. Une décision sans
   auteur ne se discute pas le mois suivant. */
const v0: ValidationDepense = soumission('Kabirou', '2026-08-30T08:00:00Z');
const vOui = validee(v0, 'Yéman', '2026-08-31T09:00:00Z');
const vNon = refusee(v0, 'Yéman', '2026-08-31T09:00:00Z', '  course personnelle  ');

dit('la soumission garde son auteur et son heure',
  { etat: 'attente', soumisLe: '2026-08-30T08:00:00Z', soumisPar: 'Kabirou' }, v0);
dit('le oui garde la soumission dessous', ['Kabirou', '2026-08-30T08:00:00Z'], [vOui.soumisPar, vOui.soumisLe]);
dit('… et nomme qui a tranché', ['Yéman', '2026-08-31T09:00:00Z'], [vOui.decidePar, vOui.decideLe]);
dit('le refus retient le motif, sans ses espaces', 'course personnelle', vNon.motif);
dit('un oui n’emporte aucun motif', undefined, vOui.motif);
dit('refusée reste refusée', [false, true], [estEnAttente(dep({ validation: vNon })), estRefusee(dep({ validation: vNon }))]);

/* ── ⑦ CE QUE LA MAISON N'A PAS ENCORE TRANCHÉ ──────────────────────
   Le bandeau du haut annonce ce total, et le solde d'un tiroir dit ce qui en
   est sorti sans être encore validé. Sinon le trou se découvre au comptage. */
const enCours = [
  soumise({ id: 'a', amountXof: 24_000, cashbox: 'Caisse Indépendantes' }, '2026-08-27T06:00:00Z'),
  soumise({ id: 'b', amountXof: 17_500, cashbox: 'Caisse Indépendantes' }, '2026-08-30T08:00:00Z'),
  soumise({ id: 'c', amountXof: 9_000, cashbox: 'Caisse Principale' }, '2026-08-30T09:00:00Z'),
  dep({ id: 'd', amountXof: 99_000, cashbox: 'Caisse Indépendantes' }),
];
dit('le total en attente', 50_500, totalEnAttenteXof(enCours, 'b1'));
dit('ce qui pèse sur un tiroir donné', 41_500, enAttenteSurLaCaisse(enCours, 'b1', 'Caisse Indépendantes'));
dit('… et sur un autre', 9_000, enAttenteSurLaCaisse(enCours, 'b1', 'Caisse Principale'));

/* UNE AVANCE DE POCHE NE PÈSE PAS SUR LE TIROIR, même en attente : l'argent
   n'en est jamais sorti, c'est celui de la personne. Le confondre ferait
   annoncer un trou qui n'existe pas. */
dit('une avance de poche ne creuse aucun tiroir', 41_500,
  enAttenteSurLaCaisse([...enCours, soumise({ id: 'e', amountXof: 30_000, avancee: true })], 'b1', 'Caisse Indépendantes'));
dit('… mais elle compte dans ce qui attend', 80_500,
  totalEnAttenteXof([...enCours, soumise({ id: 'e', amountXof: 30_000, avancee: true })], 'b1'));

/* LES ARTICLES FONT LE MONTANT : une dépense détaillée doit peser ses lignes,
   pas son champ `amountXof` laissé à zéro. C'est `amountXof` DE CHAQUE LIGNE
   qui fait foi, pas quantité × prix : le détail peut porter un rabais que la
   multiplication ne retrouverait pas. */
dit('une dépense détaillée pèse ses lignes', 12_000,
  totalEnAttenteXof([soumise({
    id: 'f', amountXof: 0,
    items: [{ id: 'i1', label: 'Rallonge', qty: 2, unitXof: 6_000, amountXof: 12_000 }],
  })], 'b1'));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
