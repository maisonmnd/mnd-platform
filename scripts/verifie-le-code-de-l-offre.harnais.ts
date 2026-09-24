/* LE CODE D'UNE OFFRE, ÉPROUVÉ — `node scripts/verifie-le-code-de-l-offre.mjs`.

   Ce qui se vérifie ici tient en une phrase : QUI paie quoi. Une erreur de
   dessin se voit ; une erreur de remise se découvre au comptoir, devant la
   cliente, un mois après que la faute a été écrite. C'est pourquoi le calcul
   vit dans un module pur plutôt que dans l'écran qui l'affiche.

   Deux règles coûtent de l'argent et sont donc éprouvées en premier : une
   offre qui ne dit pas sur quoi elle porte ne retire RIEN (un oubli de case
   ne solde pas le catalogue), et un prix qui n'est pas ferme ne se remise
   pas (un pourcentage n'a rien à mordre sur « au salon »). */
import {
  CODE_MAX, ceQueLeCodeRetire, codeNormalise, lignesDuCode, offreDuCode, offreDuCodePassee,
  prestationsDesCategories, SAISONS, offreDepuisLaSaison,
} from '../src/shared/offers';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const LE_15 = new Date('2026-09-15T10:00:00');
const EN_OCTOBRE = new Date('2026-10-15T10:00:00');

const RENTREE = {
  active: true, du: '2026-09-01', au: '2026-09-30',
  code: 'RENTREE10', discountPct: 10, serviceIds: ['sv-lavage', 'sv-reprise'],
};
const SANS_PORTEE = { active: true, du: '2026-09-01', au: '2026-09-30', code: 'VIDE20', discountPct: 20 };
const CADEAU = { active: true, du: '2026-12-01', au: '2026-12-31', code: 'NOEL', serviceIds: ['sv-styling'] };
const OFFRES = [RENTREE, SANS_PORTEE, CADEAU];

/* ── LA MÊME MAIN ÉCRIT LE CODE DE TROIS FAÇONS ──────────────────── */
dit('① les espaces et la casse ne font pas un autre code', 'RENTREE10', codeNormalise(' rentree 10 '));
dit('② un code vide reste vide', '', codeNormalise(undefined));
dit('③ un code ne dépasse pas sa longueur', CODE_MAX, codeNormalise('A'.repeat(40)).length);

/* ── QUEL CODE DÉSIGNE QUELLE OFFRE ──────────────────────────────── */
dit('④ le code trouve son offre, écrit comme on veut', 'RENTREE10', offreDuCode(OFFRES, 'rentree10', LE_15)?.code);
dit('⑤ un code inconnu ne trouve rien', null, offreDuCode(OFFRES, 'PASTOI', LE_15));
dit('⑥ un code vide ne trouve rien, surtout pas la première offre venue', null, offreDuCode(OFFRES, '', LE_15));
dit('⑦ hors de sa saison, le même code ne prend plus', null, offreDuCode(OFFRES, 'RENTREE10', EN_OCTOBRE));
dit('⑧ … et on sait le dire, avec ses dates', ['2026-09-01', '2026-09-30'],
  [offreDuCodePassee(OFFRES, 'RENTREE10', EN_OCTOBRE)?.du, offreDuCodePassee(OFFRES, 'RENTREE10', EN_OCTOBRE)?.au]);
dit('⑨ une offre éteinte ne répond pas à son code',
  null, offreDuCode([{ ...RENTREE, active: false }], 'RENTREE10', LE_15));

/* ── CE QUE LE CODE RETIRE, LIGNE À LIGNE ────────────────────────── */
const PANIER = [
  { id: 'sv-lavage', prixXof: 12000, ferme: true },
  { id: 'sv-reprise', prixXof: 20000, ferme: true },
  { id: 'sv-styling', prixXof: 2000, ferme: true },
];
const posees = lignesDuCode(PANIER, offreDuCode(OFFRES, 'RENTREE10', LE_15));
dit('⑩ seules les lignes couvertes bougent', [10800, 18000, 2000], posees.map((l) => l.net));
dit('⑪ … et chacune sait si le code a porté sur elle', [true, true, false], posees.map((l) => l.remisee));
dit('⑫ le compte dit le plein, le net, et sur combien de lignes',
  { plein: 34000, net: 30800, retire: 3200, combien: 2 }, ceQueLeCodeRetire(posees));

/* ── LES DEUX RÈGLES QUI COÛTENT DE L'ARGENT ─────────────────────── */
dit('⑬ UN PRIX QUI SE DIT AU SALON NE SE REMISE PAS',
  [0, false],
  (() => {
    const l = lignesDuCode([{ id: 'sv-lavage', prixXof: 0, ferme: false }], RENTREE)[0];
    return [l.net, l.remisee];
  })());
dit('⑭ UNE OFFRE SANS PORTÉE NE RETIRE RIEN : un oubli de case ne solde pas le catalogue',
  [12000, 20000, 2000], lignesDuCode(PANIER, offreDuCode(OFFRES, 'VIDE20', LE_15)).map((l) => l.net));
dit('⑮ un cadeau ne touche aucun prix : rien ne se déduit d’avance',
  [12000, 20000, 2000], lignesDuCode(PANIER, CADEAU).map((l) => l.net));
dit('⑯ sans code du tout, le panier reste au prix de la carte',
  [12000, 20000, 2000], lignesDuCode(PANIER, null).map((l) => l.net));
dit('⑰ une remise folle est bornée à 90 %', 1200,
  lignesDuCode([{ id: 'x', prixXof: 12000, ferme: true }], { active: true, discountPct: 250, serviceIds: ['x'] })[0].net);
dit('⑱ une remise négative ne rend pas d’argent', 12000,
  lignesDuCode([{ id: 'x', prixXof: 12000, ferme: true }], { active: true, discountPct: -30, serviceIds: ['x'] })[0].net);
/* UN POURCENTAGE EST UN ENTIER dans cette Maison : 33,3 % se lit 33 %, et
   le net tombe au franc. On l'écrit ici pour que personne ne croie plus tard
   à une perte de centimes : c'est le pourcentage qui s'arrondit, pas le prix. */
dit('⑲ un pourcentage à virgule se lit au point entier, et le net tombe au franc', 8375,
  lignesDuCode([{ id: 'x', prixXof: 12500, ferme: true }], { active: true, discountPct: 33.3, serviceIds: ['x'] })[0].net);

/* ── LES CATÉGORIES SE RÉSOLVENT EN PRESTATIONS ──────────────────── */
const CATALOGUE = [
  { id: 'sv-a', categoryId: 'cat-lavages' },
  { id: 'sv-b', categoryId: 'cat-soins' },
  { id: 'sv-c', categoryId: 'cat-soins-enfant' },
  { id: 'sv-d', categoryId: 'cat-defaisage' },
];
const ARBRE = [
  { id: 'cat-lavages', parentId: 'atl-ii-gbeji' },
  { id: 'cat-soins', parentId: 'atl-ii-gbeji' },
  { id: 'cat-soins-enfant', parentId: 'cat-soins' },
  { id: 'cat-defaisage', parentId: 'atl-iv-finfin' },
];
dit('⑳ une catégorie rend ses prestations', ['sv-a'], prestationsDesCategories(['cat-lavages'], CATALOGUE, ARBRE));
dit('㉑ … et celles de ses descendantes, pour qu’un rangement du catalogue ne vide pas une offre',
  ['sv-b', 'sv-c'], prestationsDesCategories(['cat-soins'], CATALOGUE, ARBRE));
dit('㉒ une catégorie inconnue ne rend rien', [], prestationsDesCategories(['cat-fantome'], CATALOGUE, ARBRE));

/* ── LES SEPT SAISONS ARRIVENT REMPLIES ──────────────────────────── */
dit('㉓ les sept saisons sont là', 7, SAISONS.length);
dit('㉔ chacune porte un code', [], SAISONS.filter((s) => !s.code).map((s) => s.cle));
dit('㉕ aucun code n’est porté par deux saisons',
  SAISONS.length, new Set(SAISONS.map((s) => codeNormalise(s.code))).size);
dit('㉖ tout code est déjà écrit comme il sera lu',
  [], SAISONS.filter((s) => s.code !== codeNormalise(s.code)).map((s) => s.cle));
dit('㉗ chacune dit son parcours et ses conditions',
  [], SAISONS.filter((s) => !s.parcours || !s.conditions).map((s) => s.cle));
/* Une saison qui annonce une remise DOIT dire sur quoi elle porte, sinon la
   carte promet un pourcentage que rien n'applique. Celles qui n'annoncent
   pas de remise sont des cadeaux, et n'ont rien à couvrir. */
dit('㉘ AUCUNE REMISE SANS PORTÉE : une promesse sans portée est un mensonge poli',
  [], SAISONS.filter((s) => s.remise && !s.categories?.length).map((s) => s.cle));
dit('㉙ les conditions ne portent pas de tiret cadratin',
  [], SAISONS.filter((s) => (s.conditions ?? '').includes('—')).map((s) => s.cle));

/* ── ACTIVER ÉCRIT UNE OFFRE COMPLÈTE ────────────────────────────── */
const rentree = SAISONS.find((s) => s.cle === 'rentree')!;
const ecrite = offreDepuisLaSaison(
  rentree, { du: '2026-09-01', au: '2026-09-30' }, 'b1', 'of-1',
  [{ id: 'sv-a', categoryId: 'cat-lavages' }, { id: 'sv-r', categoryId: 'tn29axgoc5' }, { id: 'sv-z', categoryId: 'cat-souverain' }],
  [],
);
dit('㉚ l’offre écrite porte le code de la saison', 'RENTREE10', ecrite.code);
dit('㉛ … sa remise', 10, ecrite.discountPct);
dit('㉜ … et SES prestations, résolues contre le catalogue du jour', ['sv-a', 'sv-r'], ecrite.serviceIds);
/* Ma Couronne ouvre une réservation pré-remplie depuis `serviceId`. Une
   saison qui couvre une famille n'a pas de geste unique : en désigner un
   ouvrirait la réservation sur une prestation tirée au hasard. */
dit('㉝ … mais une offre qui couvre une famille ne prétend à aucun geste unique', undefined, ecrite.serviceId);
dit('㉝bis … alors qu’une offre sur une seule prestation le garde', 'sv-a', offreDepuisLaSaison(
  { ...rentree, categories: ['cat-lavages'] }, { du: '2026-09-01', au: '2026-09-30' }, 'b1', 'of-3',
  [{ id: 'sv-a', categoryId: 'cat-lavages' }], [],
).serviceId);
dit('㉞ … son parcours et ses conditions descendent aussi', true, !!ecrite.parcours && !!ecrite.conditions);
/* Un cadeau ne doit PAS écrire de remise : `discountPct` absent est ce qui
   empêche un prix de bouger à l'écran. */
const noel = SAISONS.find((s) => s.cle === 'noel')!;
dit('㉟ un cadeau n’écrit aucune remise', undefined,
  offreDepuisLaSaison(noel, { du: '2026-12-01', au: '2026-12-31' }, 'b1', 'of-2', [], []).discountPct);

console.log(ko === 0 ? `\nTOUT EST JUSTE (36 vérifications).` : `\n${ko} ÉCHEC(S).`);
if (ko > 0) process.exit(1);
