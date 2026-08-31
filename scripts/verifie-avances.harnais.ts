/* LES AVANCES DE L'ÉQUIPE, ÉPROUVÉES — 31 août 2026.

   « J'ai un staff qui préfinance des dépenses personnelles pour moi et je le
   règle à la fin du mois » (Yéman).

   CE QUI SE JOUE ICI EST UNE DETTE ENTRE LA MAISON ET QUELQU'UN QUI TRAVAILLE
   POUR ELLE. Une erreur ne plante pas : elle fait redemander une somme déjà
   rendue, ou oublier ce qu'on doit à quelqu'un qui a sorti son propre argent.
   Ces deux fautes abîment la confiance bien avant les comptes. */
import {
  lignesAvancees, soldesDesPorteurs, totalDuXof, lignesDunPorteur,
  type Remboursement,
} from '../src/shared/avances';
import { caissesPourLEquipe } from '../src/shared/finance';
import type { Expense } from '../src/shared/finance';
import type { MouvementCaisseIndep } from '../src/shared/foyer';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const dep = (p: Partial<Expense>): Expense => ({
  id: 'e1', branchId: 'b1', label: 'Achat', amountXof: 10_000, date: '2026-08-10',
  cashbox: 'Principale', category: 'Fournitures', ...p,
} as Expense);

const mvt = (p: Partial<MouvementCaisseIndep>): MouvementCaisseIndep => ({
  id: 'm1', branchId: 'b1', caisseId: 'c1', date: '2026-08-12',
  sens: 'sortie', label: 'Course', montant: 5_000, ...p,
} as MouvementCaisseIndep);

/* ── ① CE QUI EST UNE AVANCE, ET CE QUI N'EN EST PAS ────────────────
   Le drapeau ET le porteur. Une avance sans nom n'en est pas une : on ne peut
   rendre l'argent à personne, et la ranger sous un nom vide ferait un dû que
   nul ne réclamerait jamais. */
dit('une dépense avancée compte', 1,
  lignesAvancees({ expenses: [dep({ avancee: true, porteur: 'Sandrine' })], branchId: 'b1' }).length);
dit('une dépense ordinaire ne compte pas', 0,
  lignesAvancees({ expenses: [dep({ porteur: 'Sandrine' })], branchId: 'b1' }).length);
dit('avancée SANS porteur ne compte pas', 0,
  lignesAvancees({ expenses: [dep({ avancee: true })], branchId: 'b1' }).length);
dit('un porteur vide non plus', 0,
  lignesAvancees({ expenses: [dep({ avancee: true, porteur: '   ' })], branchId: 'b1' }).length);
dit('une dépense arrêtée ne compte pas', 0,
  lignesAvancees({ expenses: [dep({ avancee: true, porteur: 'S', stopped: true })], branchId: 'b1' }).length);
dit('une autre branche non plus', 0,
  lignesAvancees({ expenses: [dep({ avancee: true, porteur: 'S', branchId: 'b2' })], branchId: 'b1' }).length);

/* ── ② LE FOYER AVANCE AUSSI ────────────────────────────────────────
   « Construis la même chose dans le salon/foyer » (Yéman). Une ENTRÉE ne
   s'avance pas : on la reçoit. Le drapeau n'a de sens que sur une sortie. */
dit('une sortie de caisse indépendante, avancée', 1,
  lignesAvancees({ expenses: [], mouvements: [mvt({ avancee: true, porteur: 'Sandrine' })], branchId: 'b1' }).length);
dit('une ENTRÉE ne s’avance pas', 0,
  lignesAvancees({ expenses: [], mouvements: [mvt({ sens: 'entree', avancee: true, porteur: 'S' })], branchId: 'b1' }).length);
/* LA DEVISE SE CONVERTIT AU TAUX DU JOUR OÙ ELLE A ÉTÉ SAISIE, jamais à celui
   du jour où l'on relit : la dette est née ce jour-là, à ce taux-là. */
dit('une caisse en devise se convertit au taux du mouvement', 65_000,
  lignesAvancees({ expenses: [], mouvements: [mvt({ avancee: true, porteur: 'S', montant: 100, taux: 650 })], branchId: 'b1' })[0].amountXof);
dit('sans taux, le montant vaut des francs', 5_000,
  lignesAvancees({ expenses: [], mouvements: [mvt({ avancee: true, porteur: 'S' })], branchId: 'b1' })[0].amountXof);

/* ── ③ LE SOLDE SE CALCULE, IL NE SE STOCKE PAS ─────────────────────
   Un total posé à côté des lignes finit toujours par ne plus leur
   correspondre, et personne ne sait alors lequel croire. */
const lignes = lignesAvancees({
  expenses: [
    dep({ id: 'e1', avancee: true, porteur: 'Sandrine', amountXof: 40_000, date: '2026-08-05' }),
    dep({ id: 'e2', avancee: true, porteur: 'Sandrine', amountXof: 24_500, date: '2026-08-31' }),
    dep({ id: 'e3', avancee: true, porteur: 'Arsène', amountXof: 12_000, date: '2026-08-28' }),
    dep({ id: 'e4', porteur: 'Judith', amountXof: 99_000 }),
  ],
  branchId: 'b1',
});
const rbs: Remboursement[] = [
  { id: 'r1', branchId: 'b1', porteur: 'Sandrine', date: '2026-08-20', amountXof: 40_000 },
];
const soldes = soldesDesPorteurs(lignes, rbs, 'b1');

dit('deux porteurs seulement', ['Sandrine', 'Arsène'], soldes.map((s) => s.porteur));
dit('ce qu’elle a avancé', 64_500, soldes[0].avanceXof);
dit('ce qu’on lui a rendu', 40_000, soldes[0].rembourseXof);
dit('ce qui reste dû', 24_500, soldes[0].resteXof);
dit('… et le nombre de lignes', 2, soldes[0].n);
dit('… et son dernier achat', '2026-08-31', soldes[0].dernier);
dit('ce que la Maison doit en tout', 36_500, totalDuXof(soldes));

/* CE QU'ON DOIT ENCORE PASSE DEVANT : c'est ce qu'on vient chercher ici. */
dit('le plus dû est en tête', 'Sandrine', soldes[0].porteur);

/* ── ④ LE NOM SE RECONNAÎT MALGRÉ LA CASSE ET LES ESPACES ───────────
   « sandrine », « Sandrine » et « Sandrine  » sont la même personne. Sans
   cela, la Maison lui devrait trois fois, sur trois lignes, et n'en solderait
   qu'une. */
const melange = soldesDesPorteurs(
  lignesAvancees({
    expenses: [
      dep({ id: 'a', avancee: true, porteur: 'Sandrine', amountXof: 10_000 }),
      dep({ id: 'b', avancee: true, porteur: ' sandrine ', amountXof: 5_000 }),
    ],
    branchId: 'b1',
  }),
  [{ id: 'r', branchId: 'b1', porteur: 'SANDRINE', date: '2026-08-21', amountXof: 3_000 }],
  'b1',
);
dit('un seul porteur malgré la casse', 1, melange.length);
dit('… tout lui est compté', 15_000, melange[0].avanceXof);
dit('… le remboursement aussi', 3_000, melange[0].rembourseXof);

/* ── ⑤ CE QU'ON A TROP RENDU SE VOIT, ET NE S'EFFACE PAS ────────────
   Deux dettes de sens contraires ne s'annulent pas : on doit toujours à l'un
   pendant que l'autre nous doit. Le total ne compense donc jamais. */
const trop = soldesDesPorteurs(
  lignesAvancees({ expenses: [dep({ avancee: true, porteur: 'Arsène', amountXof: 10_000 })], branchId: 'b1' }),
  [
    { id: 'r1', branchId: 'b1', porteur: 'Arsène', date: '2026-08-21', amountXof: 15_000 },
    { id: 'r2', branchId: 'b1', porteur: 'Judith', date: '2026-08-21', amountXof: 8_000 },
  ],
  'b1',
);
dit('trop rendu se lit en négatif', -5_000, trop.find((s) => s.porteur === 'Arsène')!.resteXof);
dit('un remboursement sans avance crée sa ligne', -8_000,
  trop.find((s) => s.porteur === 'Judith')!.resteXof);
dit('le total ne compense pas les négatifs', 0, totalDuXof(trop));

/* ── ⑥ LE RELEVÉ D'UNE SEULE PERSONNE ──────────────────────────────── */
dit('son relevé ne porte que ses lignes', ['e2', 'e1'],
  lignesDunPorteur(lignes, 'Sandrine').map((l) => l.id));
dit('… le plus récent d’abord', '2026-08-31', lignesDunPorteur(lignes, 'Sandrine')[0].date);
dit('un inconnu n’a pas de relevé', 0, lignesDunPorteur(lignes, 'Personne').length);

/* ── ⑦ LES CAISSES OUVERTES À L'ÉQUIPE ─────────────────────────────
   « Pour les employés une seule caisse est disponible pour eux. La caisse
   indépendante. Toutes les autres ne sont pas visibles » (Yéman, 31 août).
   Le nom des tiroirs dit déjà beaucoup : les montrer, c'est dire où dort
   l'argent. */
const tiroirs = [
  { id: 'a', name: 'Caisse Principale' },
  { id: 'b', name: 'Wells Fargo' },
  { id: 'c', name: 'Caisse Indépendantes', equipe: true },
];
const noms = (l: readonly { name: string }[]) => l.map((x) => x.name);

dit('la Maison voit tous ses tiroirs', 3, caissesPourLEquipe(tiroirs, true).length);
dit('un compte restreint n’en voit qu’un', ['Caisse Indépendantes'],
  noms(caissesPourLEquipe(tiroirs, false)));

/* LA RÈGLE ÉCHOUE OUVERT, ET C'EST VOULU : tant qu'aucune caisse n'est
   désignée, elles restent toutes visibles. Un employé sans aucun tiroir ne
   pourrait plus rien saisir, et il chercherait la panne au lieu de comprendre
   le réglage. */
const aucuneDesignee = [{ id: 'a', name: 'Principale' }, { id: 'b', name: 'Wells Fargo' }];
dit('aucune caisse désignée, on les laisse toutes', 2,
  caissesPourLEquipe(aucuneDesignee, false).length);
dit('… et une liste vide reste vide', 0, caissesPourLEquipe([], false).length);

/* PLUSIEURS CAISSES D'ÉQUIPE SONT PERMISES : le jour où le foyer et l'atelier
   en veulent chacun une, rien ne s'y oppose. */
dit('deux caisses ouvertes se voient toutes deux', 2,
  caissesPourLEquipe([...tiroirs, { id: 'd', name: 'Menue monnaie', equipe: true }], false).length);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
