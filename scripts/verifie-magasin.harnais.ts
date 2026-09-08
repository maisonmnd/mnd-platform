/* LE MAGASIN, ÉPROUVÉ — `node scripts/verifie-magasin.mjs`.

   Deux juges purs portent la refonte Stock & Achats : l'état d'une réserve
   (le mot de la pastille) et le solde après chaque mouvement (la colonne qui
   rend un kardex lisible). Un état faux enverrait commander ce qui dort en
   rayon ; un solde faux ferait mentir tout le journal d'un coup. */
import { etatReserve, soldesApres, type MouvementStock } from '../src/shared/stock';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① L'ÉTAT D'UNE RÉSERVE ─────────────────────────────────────────
   Trois mots, trois frontières. La rupture prime sur le seuil : à zéro,
   on ne dit pas « sous seuil », on dit qu'il n'y a plus rien. */
dit('plus rien : rupture', 'rupture', etatReserve({ seuilAlerte: 3 }, 0));
dit('en dessous de zéro (écart d’inventaire) : rupture aussi', 'rupture', etatReserve({ seuilAlerte: 3 }, -1));
dit('au seuil exactement : sous seuil (on commande)', 'sous_seuil', etatReserve({ seuilAlerte: 3 }, 3));
dit('sous le seuil : sous seuil', 'sous_seuil', etatReserve({ seuilAlerte: 3 }, 1));
dit('au-dessus du seuil : en réserve', 'ok', etatReserve({ seuilAlerte: 3 }, 4));
/* Seuil à zéro : le produit qu'on ne commande jamais d'avance. Une demi-unité
   restante est encore une réserve, pas une alerte. */
dit('seuil zéro et un fond de pot : en réserve', 'ok', etatReserve({ seuilAlerte: 0 }, 0.5));

/* ── ② LE SOLDE APRÈS CHAQUE MOUVEMENT ──────────────────────────────
   Le journal s'écrit dans l'ordre ; chaque ligne porte le solde de SON
   produit après elle, indépendamment des autres produits. */
const mvt = (id: string, produitId: string, quantite: number): MouvementStock =>
  ({ id, branchId: 'b1', date: '2026-09-08', type: 'ajustement', produitId, quantite });

const journal = [
  mvt('m1', 'p1', 6),
  mvt('m2', 'p2', 10),
  mvt('m3', 'p1', -2),
  mvt('m4', 'p1', -1),
  mvt('m5', 'p2', -10),
];
const soldes = soldesApres(journal);
dit('le premier mouvement fonde le solde', 6, soldes.get('m1'));
dit('les produits ne se mélangent pas', 10, soldes.get('m2'));
dit('la sortie retranche', 4, soldes.get('m3'));
dit('et la suivante continue', 3, soldes.get('m4'));
dit('un produit peut revenir à zéro', 0, soldes.get('m5'));

/* Les quantités fractionnaires s'accumulent en flottants : le même arrondi
   que le stock dérivé, sinon 0,3 − 3 × 0,1 afficherait 5,5e-17 au kardex. */
const fins = soldesApres([mvt('f1', 'p3', 0.3), mvt('f2', 'p3', -0.1), mvt('f3', 'p3', -0.1), mvt('f4', 'p3', -0.1)]);
dit('les décimales ne laissent pas de poussière', 0, fins.get('f4'));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
