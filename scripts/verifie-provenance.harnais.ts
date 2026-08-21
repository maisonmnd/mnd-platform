/* L'ARGENT A UN NOM — les invariants de la provenance d'une dépense.

   Ce qui compte ici n'est pas l'affichage : c'est que la Maison puisse dire,
   sans se tromper d'un franc, DE QUI vient l'argent qu'elle a dépensé, ce
   qu'il reste de chaque revenu, et QUAND un revenu neuf a été entamé. */

import {
  partsPrisesParRevenu, partNonNommee, entameLeRevenu,
  type Expense, type DepenseSource,
} from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const src = (ref: string, xof: number, nom = ref): DepenseSource =>
  ({ ref, nom, date: '2026-08-19', xof });

const dep = (id: string, date: string, total: number, sources?: DepenseSource[]): Expense =>
  ({ id, branchId: 'br', label: id, amountXof: total, date, cashbox: 'Principale',
    category: 'Divers', ...(sources ? { sources } : {}) } as Expense);

/* ── ① CE QUI EST DÉJÀ PRIS SUR CHAQUE REVENU ────────────────────── */
const troisDepenses = [
  dep('d1', '2026-08-19', 60_000, [src('rA', 12_000), src('rB', 48_000)]),
  dep('d2', '2026-08-20', 85_000, [src('rC', 85_000)]),
  dep('d3', '2026-08-21', 20_000, [src('rB', 20_000)]),
];
const pris = partsPrisesParRevenu(troisDepenses);
dit('rA a donné 12 000', 12_000, pris.get('rA'));
dit('rB a donné deux fois — 48 000 + 20 000', 68_000, pris.get('rB'));
dit('un revenu jamais touché ne figure pas', undefined, pris.get('rZ'));

/* LA DÉPENSE QU'ON MODIFIE NE SE REFUSE PAS SA PROPRE PART. Sans `sauf`, le
   sélecteur rouvert sur d1 verrait rB à 68 000 pris et lui interdirait de
   garder les 48 000 qu'il lui a lui-même donnés. */
const prisSaufD1 = partsPrisesParRevenu(troisDepenses, 'd1');
dit('en modifiant d1, rB ne compte plus que les 20 000 de d3', 20_000, prisSaufD1.get('rB'));
dit('… et rA redevient entièrement libre', undefined, prisSaufD1.get('rA'));

/* ── ② LA PART SANS NOM ──────────────────────────────────────────── */
dit('tout est nommé → rien sans nom', 0, partNonNommee(troisDepenses[0]));
dit('une dépense muette est entièrement sans nom', 32_000, partNonNommee(dep('d4', '2026-08-18', 32_000)));
dit('nommée à moitié → le reste est dit', 30_000, partNonNommee(dep('d5', '2026-08-18', 50_000, [src('rA', 20_000)])));
/* Désigner PLUS que le montant ne rend jamais une part négative — une
   soustraction qui passe sous zéro remonterait en « −5 000 F sans nom ». */
dit('trop désigné ne devient pas négatif', 0, partNonNommee(dep('d6', '2026-08-18', 10_000, [src('rA', 15_000)])));

/* ── ③ QUAND UN REVENU EST ENTAMÉ ────────────────────────────────── */
dit('d1 entame rA — personne avant elle', true, entameLeRevenu(troisDepenses, troisDepenses[0], 'rA'));
dit('d1 entame rB aussi', true, entameLeRevenu(troisDepenses, troisDepenses[0], 'rB'));
dit('d3 n’entame PAS rB — d1 y a puisé la veille', false, entameLeRevenu(troisDepenses, troisDepenses[2], 'rB'));
dit('d2 entame rC, qu’elle est seule à toucher', true, entameLeRevenu(troisDepenses, troisDepenses[1], 'rC'));

/* DEUX DÉPENSES LE MÊME JOUR : une seule doit porter l'entame, et toujours la
   même — sinon la pastille sauterait d'une ligne à l'autre au gré de l'ordre
   d'arrivée des synchronisations. L'identifiant tranche après la date. */
const memeJour = [
  dep('b', '2026-08-22', 10_000, [src('rD', 10_000)]),
  dep('a', '2026-08-22', 10_000, [src('rD', 10_000)]),
];
dit('même jour : « a » entame', true, entameLeRevenu(memeJour, memeJour[1], 'rD'));
dit('même jour : « b » n’entame pas', false, entameLeRevenu(memeJour, memeJour[0], 'rD'));
/* L'ordre de la liste ne doit rien changer — c'est tout l'enjeu. */
const inverse = [memeJour[1], memeJour[0]];
dit('… et l’ordre de lecture n’y change rien', true, entameLeRevenu(inverse, inverse[0], 'rD'));

/* ── ④ LA SOMME DES PARTS NE DÉPASSE PAS LE REVENU ───────────────── */
/* Le sélecteur borne chaque part au reste ; le harnais vérifie la règle que
   l'écran doit respecter — un revenu de 75 000 ne peut pas payer 90 000. */
const revenuRB = 75_000;
dit('rB : ce qui est pris tient dans ce qui est entré', true, (pris.get('rB') ?? 0) <= revenuRB);
dit('rB : reste 7 000', 7_000, revenuRB - (pris.get('rB') ?? 0));

/* ── ⑤ L'HISTOIRE NE SE RÉÉCRIT PAS ──────────────────────────────── */
/* Le nom et la date vivent DANS la dépense, pas dans le registre : une fiche
   renommée demain ne touche pas une dépense d'hier. */
const figee = dep('d7', '2026-08-19', 5_000, [{ ref: 'rA', nom: 'Assetina S.', date: '2026-08-19', xof: 5_000 }]);
dit('le nom est porté par la dépense elle-même', 'Assetina S.', figee.sources![0].nom);
dit('… et la date du versement aussi', '2026-08-19', figee.sources![0].date);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
if (ko > 0) process.exit(1);
