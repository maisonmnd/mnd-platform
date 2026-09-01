/* LES COMPTES FOURNISSEURS, ÉPROUVÉS — 1er septembre 2026.

   « J'achète dans certains supermarchés de manière très répétitive au fil
   d'une année. J'aimerais qu'ils aient un suivi de manière très précise et un
   compte que j'interroge facilement » (Yéman).

   UNE ERREUR ICI NE PLANTE PAS : elle mélange deux maisons, et l'on compare
   pendant des mois des chiffres devenus faux sans que rien ne le dise. C'est
   le genre de faute qu'on ne découvre qu'en négociant avec un fournisseur,
   papier en main, devant lui. */
import {
  beneficiaireDuLibelle, nomsDe, fournisseurDeLaDepense, comptesFournisseurs,
  articlesDuFournisseur, prixUnitaire, libellesVoisins, maisonsARanger,
  type Fournisseur,
} from '../src/shared/fournisseurs';
import { soumission, type Expense } from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const dep = (p: Partial<Expense>): Expense => ({
  id: 'e1', branchId: 'b1', label: 'Super U', amountXof: 20_000, date: '2026-08-10',
  cashbox: 'Principale', category: 'Local', ...p,
} as Expense);

const superU: Fournisseur = { id: 'f-su', branchId: 'b1', nom: 'Super U', alias: ['SuperU'] };
const grossiste: Fournisseur = { id: 'f-gr', branchId: 'b1', nom: 'Grossiste Dantokpa' };
const FOURN = [superU, grossiste];

/* ── ① LE LIBELLÉ DIT LA MAISON ─────────────────────────────────────
   C'est ce qui fait naître le répertoire PLEIN plutôt que vide : au premier
   jour, Super U porte déjà toute son année sans qu'on ait rien ressaisi. */
dit('le nom exact retrouve la maison', 'f-su',
  fournisseurDeLaDepense(dep({ label: 'Super U' }), FOURN)?.id);
dit('la casse et les accents sont ignorés', 'f-su',
  fournisseurDeLaDepense(dep({ label: 'SUPER  u' }), FOURN)?.id);
dit('un autre nom aussi', 'f-su',
  fournisseurDeLaDepense(dep({ label: 'SuperU' }), FOURN)?.id);
dit('un inconnu ne trouve personne', undefined,
  fournisseurDeLaDepense(dep({ label: 'Quincaillerie Ganhi' }), FOURN)?.id);

/* L'IDENTIFIANT POSÉ SUR LA DÉPENSE PASSE DEVANT LE LIBELLÉ : le jour où la
   Maison range une dépense à la main, son geste ne se fait pas contredire par
   un mot mal tapé. */
dit('l’identifiant passe devant le libellé', 'f-gr',
  fournisseurDeLaDepense(dep({ label: 'Super U', fournisseurId: 'f-gr' }), FOURN)?.id);
/* UN IDENTIFIANT MORT NE FAIT PAS DISPARAÎTRE LA MAISON : on retombe sur le
   libellé plutôt que de rendre la dépense orpheline. */
dit('un identifiant effacé retombe sur le libellé', 'f-su',
  fournisseurDeLaDepense(dep({ label: 'Super U', fournisseurId: 'f-disparu' }), FOURN)?.id);

/* LE MOIS FINAL D'UNE CHARGE RÉCURRENTE NE FAIT PAS DOUZE MAISONS. */
dit('« Loyer — Août 2026 » est un loyer', 'Loyer', beneficiaireDuLibelle('Loyer — Août 2026'));
dit('un libellé ordinaire ne bouge pas', 'Super U', beneficiaireDuLibelle('Super U'));
dit('ses noms se normalisent', ['super u', 'superu'], nomsDe(superU));

/* ── ② LE COMPTE, ET SON RYTHME ─────────────────────────────────────
   Trois passages du 1er juillet au 30 août : soixante jours d'étendue, deux
   intervalles, donc un passage tous les trente jours. */
const achats = [
  dep({ id: 'a1', label: 'Super U', date: '2026-07-01', amountXof: 10_000 }),
  dep({ id: 'a2', label: 'SuperU', date: '2026-07-31', amountXof: 30_000 }),
  dep({ id: 'a3', label: 'Super U', date: '2026-08-30', amountXof: 20_000 }),
  dep({ id: 'b1x', label: 'Grossiste Dantokpa', date: '2026-08-01', amountXof: 90_000 }),
  dep({ id: 'z', label: 'Inconnu', date: '2026-08-02', amountXof: 5_000 }),
];
const comptes = comptesFournisseurs({ expenses: achats, fournisseurs: FOURN, branchId: 'b1' });

dit('le plus payé passe en tête', ['f-gr', 'f-su'], comptes.map((c) => c.fournisseur.id));
const su = comptes.find((c) => c.fournisseur.id === 'f-su')!;
dit('les trois passages sont comptés', 3, su.n);
dit('le total est juste', 60_000, su.totalXof);
dit('la moyenne par passage', 20_000, su.moyenneXof);
dit('le plus petit et le plus gros', [10_000, 30_000], [su.minXof, su.maxXof]);
dit('le premier et le dernier', ['2026-07-01', '2026-08-30'], [su.premier, su.dernier]);
dit('un passage tous les trente jours', 30, su.rythmeJours);
dit('les lignes sortent du plus récent', ['a3', 'a2', 'a1'], su.lignes.map((e) => e.id));

/* UN SEUL PASSAGE NE DESSINE AUCUN RYTHME : annoncer « tous les 0 jour »
   mentirait, et « tous les 30 » serait inventé. */
dit('un seul passage n’a pas de rythme', null,
  comptesFournisseurs({ expenses: [achats[3]], fournisseurs: FOURN, branchId: 'b1' })[0].rythmeJours);

/* UNE MAISON SANS ACHAT NE PARAÎT PAS DANS LA PÉRIODE : une fiche à zéro dans
   un relevé de juillet ferait croire à une rupture. */
dit('la période écarte qui n’y a rien acheté', ['f-su'],
  comptesFournisseurs({ expenses: achats, fournisseurs: FOURN, branchId: 'b1', du: '2026-07-01', au: '2026-07-31' })
    .map((c) => c.fournisseur.id));

/* CE QUI ATTEND UN OUI N'EST PAS UNE DÉPENSE : un fournisseur ne doit pas
   peser de ce que la Maison n'a pas encore accepté. */
dit('une dépense en attente ne compte pas', 60_000,
  comptesFournisseurs({
    expenses: [...achats, dep({ id: 'att', label: 'Super U', date: '2026-08-31', amountXof: 500_000, validation: soumission('K', '2026-08-31T08:00:00Z') })],
    fournisseurs: FOURN, branchId: 'b1',
  }).find((c) => c.fournisseur.id === 'f-su')!.totalXof);
/* Une dépense arrêtée non plus, ni celle d'une autre branche. */
dit('une dépense arrêtée non plus', 60_000,
  comptesFournisseurs({
    expenses: [...achats, dep({ id: 'st', label: 'Super U', amountXof: 99_000, stopped: true })],
    fournisseurs: FOURN, branchId: 'b1',
  }).find((c) => c.fournisseur.id === 'f-su')!.totalXof);
dit('une autre branche non plus', 60_000,
  comptesFournisseurs({
    expenses: [...achats, dep({ id: 'ab', label: 'Super U', amountXof: 99_000, branchId: 'b2' })],
    fournisseurs: FOURN, branchId: 'b1',
  }).find((c) => c.fournisseur.id === 'f-su')!.totalXof);
/* UNE MAISON ARCHIVÉE SORT DU RÉPERTOIRE, sans effacer ses écritures. */
dit('une maison archivée ne paraît plus', ['f-gr'],
  comptesFournisseurs({ expenses: achats, fournisseurs: [{ ...superU, archived: true }, grossiste], branchId: 'b1' })
    .map((c) => c.fournisseur.id));

/* ── ③ LES ARTICLES, ET LE PRIX DE L'UNITÉ ──────────────────────────
   LE PRIX SUIVI EST CELUI DE L'UNITÉ : deux litres à 1 450 F ne sont pas un
   litre à 2 900 F, et comparer des paniers ferait passer une commande double
   pour une flambée. */
dit('le prix unitaire se lit dans la ligne', 1_450,
  prixUnitaire({ id: 'i', label: 'Huile', amountXof: 2_900, qty: 2 }));
dit('… ou dans le prix unitaire saisi', 1_450,
  prixUnitaire({ id: 'i', label: 'Huile', amountXof: 2_900, qty: 2, unitXof: 1_450 }));
dit('sans quantité, la ligne EST l’unité', 3_500,
  prixUnitaire({ id: 'i', label: 'Gants', amountXof: 3_500 }));

const detaillees = [
  dep({ id: 'd1', date: '2025-09-10', items: [{ id: 'i1', label: 'Huile de coco', amountXof: 1_200, qty: 1 }] }),
  dep({ id: 'd2', date: '2026-03-10', items: [{ id: 'i2', label: 'huile de coco', amountXof: 2_600, qty: 2 }] }),
  dep({ id: 'd3', date: '2026-08-10', items: [
    { id: 'i3', label: 'Huile de coco', amountXof: 1_450, qty: 1 },
    { id: 'i4', label: 'Gants jetables', amountXof: 3_500, qty: 1 },
  ] }),
];
const arts = articlesDuFournisseur(detaillees);
dit('le plus souvent acheté passe en tête', 'Huile de coco', arts[0].label);
dit('les libellés se rassemblent malgré la casse', 3, arts[0].n);
dit('le dernier prix', 1_450, arts[0].dernierPrixXof);
dit('le premier prix de la période', 1_200, arts[0].premierPrixXof);
dit('la hausse se dit en pourcentage', 20.8, arts[0].ecartPct);

/* UN ARTICLE VU UNE SEULE FOIS N'A PAS D'ÉCART : en inventer un ferait lire
   une hausse là où il n'y a qu'un achat. */
const gants = arts.find((a) => a.label === 'Gants jetables')!;
dit('un article vu une fois n’a pas d’écart', [null, null], [gants.premierPrixXof, gants.ecartPct]);

/* UNE FICHE SANS ARTICLES N'EN MONTRE AUCUN — décision de Yéman : l'achat est
   toujours suivi, l'article seulement quand il est saisi. */
dit('sans détail, aucun article', 0, articlesDuFournisseur([dep({})]).length);

/* ── ④ LES LIBELLÉS VOISINS : ON PROPOSE, ON NE RATTACHE PAS ────────
   « Super U Godomey » est peut-être une autre boutique, avec d'autres prix.
   Deviner mélangerait deux comptes, et l'erreur ne se verrait qu'au moment de
   comparer des chiffres devenus faux. */
const avecVoisins = [
  ...achats,
  dep({ id: 'v1', label: 'Super U Godomey', date: '2026-08-05', amountXof: 12_000 }),
  dep({ id: 'v2', label: 'SUPER-U', date: '2026-08-06', amountXof: 8_000 }),
];
const voisins = libellesVoisins(superU, avecVoisins, FOURN, 'b1');
dit('les voisins se proposent', ['Super U Godomey', 'SUPER-U'], voisins.map((v) => v.libelle));
dit('… avec ce qu’ils pèsent', [12_000, 8_000], voisins.map((v) => v.totalXof));
/* CE QUI EST DÉJÀ RATTACHÉ N'EST PAS PROPOSÉ : on ne vole pas la maison d'un
   autre fournisseur. */
dit('un libellé déjà porté n’est pas proposé', 0,
  libellesVoisins(superU, avecVoisins, [...FOURN, { id: 'f-g2', branchId: 'b1', nom: 'Super U Godomey' }], 'b1')
    .filter((v) => v.libelle === 'Super U Godomey').length);
/* UN NOM SANS RAPPORT NE SE PROPOSE PAS : la ressemblance se dit en une
   phrase, l'un contient l'autre, et l'on doit pouvoir répondre « pourquoi
   celui-là ? » sans ouvrir le code. */
dit('un nom sans rapport reste dehors', 0,
  voisins.filter((v) => v.libelle === 'Inconnu').length);

/* ── ⑤ CE QU'AUCUNE FICHE NE PORTE ENCORE ───────────────────────────
   Le répertoire naît plein : « à ranger » est la porte d'entrée, pas un
   déchet. */
const aRanger = maisonsARanger({ expenses: avecVoisins, fournisseurs: FOURN, branchId: 'b1' });
dit('les maisons à ranger, du plus gros au plus petit',
  ['Super U Godomey', 'SUPER-U', 'Inconnu'], aRanger.map((m) => m.libelle));
dit('… et ce qu’elles pèsent', [12_000, 8_000, 5_000], aRanger.map((m) => m.totalXof));
dit('ce qui est déjà rangé n’y est plus', 0,
  aRanger.filter((m) => m.libelle === 'Super U').length);

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} vérification(s) en échec.`);
if (ko > 0) process.exit(1);
