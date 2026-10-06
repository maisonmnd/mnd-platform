/* CE QUE LA MAISON CALCULE NE SE DISPUTE PAS — le harnais. 4 octobre 2026.

   « Synchronisé · 19 conflits, fix it for good » (Yéman). Dix-neuf produits
   de la Gamme en « conflit », des deux côtés le même nom : la différence
   était dans `stock`, que le miroir recalcule sur chaque poste.

   LA RÈGLE éprouvée, pas le cas du jour :
   1. deux versions qui ne diffèrent que par l'ORDRE des champs ne sont pas
      un conflit (jsonb rend les champs dans un autre ordre) ;
   2. deux versions qui ne diffèrent que par un champ DÉRIVÉ ne sont pas un
      conflit ; un champ tenu à la main, si ;
   3. le stock d'un produit RELIÉ au journal est dérivé ; celui d'un produit
      sans fiche reste un compteur à la main, et son conflit reste montré ;
   4. une suppression reste toujours un conflit ;
   5. la règle vaut à l'entrée (rien de vide n'est noté) ET à la lecture
      (ce que le téléphone gardait déjà disparaît) ;
   6. le panneau montre ce qui diffère et se vide d'un geste. */
import { readFileSync } from 'node:fs';
import {
  champsQuiDifferent, conflitUtile, lisLesConflits, noteLesConflits, oublieTousLesConflits, type Conflit,
  declareLecteurDeLigne, dejaTranche,
} from '../src/shared/file-d-attente';
import { produitsStockStore } from '../src/shared/stock';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       attendu ${JSON.stringify(attendu)}\n       obtenu  ${JSON.stringify(obtenu)}`}`);
};
const sansCommentaires = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* Un produit de la Gamme relié à une fiche d'inventaire, un autre non. */
produitsStockStore.set([{ id: 'ps-1', branchId: 'b', code: 'SPR-01', nom: 'Recharge Spray', famille: 'gamme', unite: 'flacon', actif: true, catalogProductId: 'gp-relie' } as never]);

const produit = (id: string, champs: Record<string, unknown>) => JSON.stringify({ id, categoryId: 'cat-gamme', name: 'Recharge Spray', priceXof: 9500, stock: 12, order: 3, ...champs });
const conflit = (table: string, id: string, notre: string | null, leur: string): Conflit =>
  ({ table, id, notre, notreAt: '2026-10-04T18:23:00Z', leur, leurAt: '2026-10-04T18:23:05Z', vuLe: '2026-10-04T18:23:06Z' });

/* ── 1. L'ORDRE DES CHAMPS ──────────────────────────────────────────── */
const melange = JSON.stringify({ order: 3, stock: 12, priceXof: 9500, name: 'Recharge Spray', categoryId: 'cat-gamme', id: 'gp-libre' });
dit('le meme produit, champs dans un autre ordre : pas un conflit', [], champsQuiDifferent(conflit('catalog_products', 'gp-libre', produit('gp-libre', {}), melange)));

/* ── 2 et 3. LE CHAMP DÉRIVÉ ────────────────────────────────────────── */
dit('produit relie, seul le stock differe : pas un conflit', false,
  conflitUtile(conflit('catalog_products', 'gp-relie', produit('gp-relie', { stock: 11 }), produit('gp-relie', { stock: 14 }))));
dit('produit relie, le stock ET le prix different : le prix seul est montre', ['priceXof'],
  champsQuiDifferent(conflit('catalog_products', 'gp-relie', produit('gp-relie', { stock: 11, priceXof: 9000 }), produit('gp-relie', { stock: 14 }))));
dit('produit SANS fiche, le stock differe : compteur a la main, conflit montre', ['stock'],
  champsQuiDifferent(conflit('catalog_products', 'gp-libre', produit('gp-libre', { stock: 11 }), produit('gp-libre', { stock: 14 }))));
dit('une autre table ne partage pas la regle du stock', ['stock'],
  champsQuiDifferent(conflit('autre_table', 'gp-relie', produit('gp-relie', { stock: 11 }), produit('gp-relie', { stock: 14 }))));

/* ── 4. LA SUPPRESSION ──────────────────────────────────────────────── */
dit('une suppression reste un conflit', true, conflitUtile(conflit('catalog_products', 'gp-relie', null, produit('gp-relie', {}))));

/* ── 5. À L'ENTRÉE ET À LA LECTURE ──────────────────────────────────── */
oublieTousLesConflits();
noteLesConflits([
  conflit('catalog_products', 'gp-relie', produit('gp-relie', { stock: 11 }), produit('gp-relie', { stock: 14 })),
  conflit('catalog_products', 'gp-libre', produit('gp-libre', { name: 'Recharge Spray 2' }), produit('gp-libre', {})),
]);
/* Ce qui est ÉCRIT sur le téléphone, pas ce que la lecture filtre : sinon le
   filtre de lecture masquerait l'absence de celui d'entrée. */
dit('a l entree : seul le vrai conflit est ecrit sur le telephone', ['gp-libre'],
  (JSON.parse(localStorage.getItem('trone::file::conflits') || '[]') as Conflit[]).map((c) => c.id));
/* Ce que le téléphone gardait déjà, d'avant la règle : écrit tel quel. */
localStorage.setItem('trone::file::conflits', JSON.stringify([
  conflit('catalog_products', 'gp-relie', produit('gp-relie', { stock: 2 }), produit('gp-relie', { stock: 9 })),
  conflit('catalog_products', 'gp-libre', produit('gp-libre', { priceXof: 1 }), produit('gp-libre', {})),
]));
dit('a la lecture : les anciens conflits de stock disparaissent', ['gp-libre'], lisLesConflits().map((c) => c.id));
oublieTousLesConflits();
dit('« Tout garder ainsi » vide la liste', 0, lisLesConflits().length);

/* ── LA RÈGLE TIENT AU VRAI ÉCRIVAIN ───────────────────────────────── */
const stock = sansCommentaires('src/shared/stock.ts');
dit('le miroir ecrit bien le champ stock (la regle vise le vrai ecrivain)', true, /return \{ \.\.\.g, stock: total \}/.test(stock));
dit('le stock est declare derive pour les seuls produits relies', true,
  /declareChampsDerives\('catalog_products', \(ligne\) =>\s*\(produitsStockStore\.get\(\)\.some\(\(p\) => p\.catalogProductId === ligne\.id\) \? \['stock'\] : \[\]\)\)/.test(stock));

/* ── 6. LE PANNEAU ──────────────────────────────────────────────────── */
const shell = sansCommentaires('src/apps/trone/shell/Shell.tsx');
dit('la coquille charge la regle des l ouverture', true, /import '\.\.\/\.\.\/\.\.\/shared\/stock';/.test(shell));
dit('le panneau montre ce qui differe, et se vide d un geste', [true, true],
  [/champsQuiDifferent\(c\)/.test(shell) && /Ce qui diffère :/.test(shell), /onClick=\{oublieTousLesConflits\}/.test(shell)]);

/* ── LA FRAPPE N'EST PAS UNE DISPUTE — 6 octobre 2026 (« 11 conflits ») ──
   ① Un conflit dont la ligne a été réécrite depuis est tranché : il ne se
      demande plus. Il ne reste que tant que la ligne porte ENCORE la version
      gardée d'ailleurs sur les champs disputés.
   ② L'écho de notre propre poussée est reconnu AVANT le jugement : la frappe
      en attente gagne, sans conflit. */
const lignesDuBanc = new Map<string, Record<string, unknown>>();
declareLecteurDeLigne('banc_frappe', (id) => lignesDuBanc.get(id));
const frappe = (gardee: string, votre: string) => ({
  table: 'banc_frappe', id: 'doc-1',
  notre: JSON.stringify({ id: 'doc-1', objet: votre, corps: 'x' }),
  leur: JSON.stringify({ id: 'doc-1', objet: gardee, corps: 'x' }),
});
lignesDuBanc.set('doc-1', { id: 'doc-1', objet: 'Dépôt de marque', corps: 'x' });
dit('la ligne reecrite depuis (on a continue a taper) : le conflit est tranche', [true, false],
  [dejaTranche(frappe('Demande de Moov Afric', 'Demande de Moov Africa')), conflitUtile(frappe('Demande de Moov Afric', 'Demande de Moov Africa'))]);
lignesDuBanc.set('doc-1', { id: 'doc-1', objet: 'Demande de Moov Africa', corps: 'x' });
dit('la ligne porte deja ma version : tranche aussi', false, conflitUtile(frappe('Demande de Moov Afric', 'Demande de Moov Africa')));
lignesDuBanc.set('doc-1', { id: 'doc-1', objet: 'Demande de Moov Afric', corps: 'x' });
dit('la ligne porte encore la version gardee : la question reste posee', [false, true],
  [dejaTranche(frappe('Demande de Moov Afric', 'Demande de Moov Africa')), conflitUtile(frappe('Demande de Moov Afric', 'Demande de Moov Africa'))]);
dit('noter ne juge pas « deja tranche » (la ligne porte encore notre version a cet instant)', true,
  /export function noteLesConflits[\s\S]{0,120}nouveaux = nouveaux\.filter\(conflitQuiDiffere\);/.test(readFileSync('src/shared/file-d-attente.ts', 'utf8')));
/* Sans lecteur (l'écran du magasin n'est pas chargé) : la ligne se relit sur l'appareil. */
localStorage.setItem('trone::mnd_banc_ecran_ferme', JSON.stringify([{ id: 'doc-1', objet: 'Dépôt de marque', corps: 'x' }]));
dit('ecran ferme : la ligne se relit sur l appareil, et le conflit tranche disparait', [true, false],
  [dejaTranche({ ...frappe('Demande de Moov Afric', 'Demande de Moov Africa'), table: 'banc_ecran_ferme' }),
    conflitUtile({ ...frappe('Demande de Moov Afric', 'Demande de Moov Africa'), table: 'banc_ecran_ferme' })]);
localStorage.setItem('trone::mnd_banc_nom_note', JSON.stringify([{ id: 'doc-1', objet: 'Dépôt de marque', corps: 'x' }]));
dit('... par le nom du magasin note avec le conflit', true,
  dejaTranche({ ...frappe('Demande de Moov Afric', 'Demande de Moov Africa'), table: 'autre_nom', magasin: 'mnd_banc_nom_note' }));
dit('une table sans lecteur garde le comportement d avant', true,
  conflitUtile({ ...frappe('a', 'b'), table: 'banc_sans_lecteur' }));
const synchro = readFileSync('src/shared/sync.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
dit('chaque conflit note son magasin', [true, true], [
  /noteLesConflits\(a\.conflits\.map\(\(c\) => \(\{ \.\.\.c, table, vuLe, magasin: store\.key \}\)\)\);/.test(synchro),
  /vuLe: new Date\(\)\.toISOString\(\),\s*magasin: store\.key,\s*\}\]\);/.test(synchro),
]);
dit('l echo de notre poussee est reconnu avant le jugement de conflit', [true, true], [
  /const notreEcho = !!distant && estNotreEcho\(idTouche, contenuCanonique\(distant\)\);/.test(synchro),
  /\} else if \(notreEcho \|\| leGesteLocalTient\(enAttente, distantAt\)\) \{/.test(synchro),
]);
dit('chaque magasin dit ou lire sa ligne actuelle', true,
  /declareLecteurDeLigne\(table, \(id\) => store\.get\(\)\.find\(\(x\) => x\.id === id\)\);/.test(synchro));

console.log(ko === 0 ? '\nCe que la Maison calcule ne se dispute pas.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
