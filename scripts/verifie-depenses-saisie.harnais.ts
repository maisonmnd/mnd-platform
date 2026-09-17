/* LA SAISIE D'UNE DÉPENSE, ALLÉGÉE, ÉPROUVÉE — `node scripts/verifie-depenses-saisie.mjs`.

   Ce qui manque se dit avant de cliquer, dans l'ordre de la fenêtre ; le
   bloc des trois réponses compte juste pour chaque compte ; « comme la
   dernière fois » retrouve la bonne dépense ; la liste se range jour par
   jour. */
import {
  reponsesManquantes, ditCeQuiManque, compteDesReponses, derniereDepenseDe, ditLaDerniereFois,
  groupeParJour, ditLeJour, cleDuJour,
} from '../src/shared/depenses-saisie';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

/* ── ① CE QUI MANQUE ────────────────────────────────────────────── */
const vide = { montant: false, beneficiaire: false, categorie: false, porteurChoisi: false, caisseChoisie: false, avancee: false };
const tout = { montant: true, beneficiaire: true, categorie: true, porteurChoisi: true, caisseChoisie: true, avancee: false };
dit('tout manque, dans l’ordre de la fenêtre',
  ['le montant', 'le bénéficiaire', 'à quoi va cet argent', 'qui a fait cet achat', 'la caisse'],
  reponsesManquantes(vide, { porteur: true }));
dit('rien ne manque', [], reponsesManquantes(tout, { porteur: true }));
dit('un compte restreint ne choisit pas de porteur', ['la caisse'],
  reponsesManquantes({ ...tout, caisseChoisie: false, porteurChoisi: false }, { porteur: false }));
dit('avancée de sa poche : la caisse ne se réclame pas', [],
  reponsesManquantes({ ...tout, caisseChoisie: false, avancee: true }, { porteur: true }));
dit('une seule chose', 'Il manque la caisse.', ditCeQuiManque(['la caisse']));
dit('deux choses', 'Il manque le montant et la caisse.', ditCeQuiManque(['le montant', 'la caisse']));
dit('trois choses', 'Il manque le montant, à quoi va cet argent et la caisse.',
  ditCeQuiManque(['le montant', 'à quoi va cet argent', 'la caisse']));
dit('rien à dire', '', ditCeQuiManque([]));

/* ── ② LE COMPTE DES TROIS RÉPONSES ────────────────────────────── */
dit('deux sur trois', { donnees: 2, total: 3 }, compteDesReponses({ ...tout, caisseChoisie: false }, { porteur: true }));
dit('un compte restreint : sur deux', { donnees: 1, total: 2 }, compteDesReponses({ ...tout, caisseChoisie: false }, { porteur: false }));
dit('avancée de sa poche : sur deux', { donnees: 2, total: 2 }, compteDesReponses({ ...tout, caisseChoisie: false, avancee: true }, { porteur: true }));

/* ── ③ COMME LA DERNIÈRE FOIS ──────────────────────────────────── */
const passees = [
  { label: 'Karité Bénin', date: '2026-08-02', category: 'Produits', subcategory: 'Huiles', porteur: '', cashbox: 'Caisse principale' },
  { label: 'karite benin', date: '2026-09-10', category: 'Produits', subcategory: 'Emballages', porteur: 'Dada S.', cashbox: '' },
  { label: 'Marché', date: '12/09/2026', category: 'Courses', porteur: 'Kabirou', cashbox: 'Caisse principale' },
];
dit('la plus récente du même bénéficiaire, aux accents près', '2026-09-10', derniereDepenseDe('Karité Bénin', passees)?.date);
dit('une date jj/mm/aaaa se compare quand même', 'Courses', derniereDepenseDe('marché', passees)?.category);
dit('moins de deux lettres : rien', undefined, derniereDepenseDe('K', passees));
dit('un inconnu : rien', undefined, derniereDepenseDe('Bailleur', passees));
dit('ce que le rappel dit', 'Produits · Emballages · Dada S. · Sans caisse', ditLaDerniereFois(passees[1]));
dit('la Maison elle-même, et la caisse', 'Produits · Huiles · La Maison elle-même · Caisse principale', ditLaDerniereFois(passees[0]));

/* ── ④ JOUR PAR JOUR ───────────────────────────────────────────── */
const lignes = [
  { id: 'a', date: '2026-09-16', xof: 12_500 },
  { id: 'b', date: '2026-09-15', xof: 66_000 },
  { id: 'c', date: '16/09/2026', xof: 30_000 },
  { id: 'd', date: '', xof: 1 },
];
const groupes = groupeParJour(lignes, (l) => l.xof);
dit('le plus récent en haut, sans date en dernier', ['2026-09-16', '2026-09-15', ''], groupes.map((g) => g.jour));
dit('les deux écritures de date se rangent dans le même jour, l’ordre reçu gardé', ['a', 'c'], groupes[0].lignes.map((l) => l.id));
dit('le total du jour', 42_500, groupes[0].total);
dit('une clé de jour depuis jj/mm/aaaa', '2026-09-16', cleDuJour('16/09/2026'));
dit('aujourd’hui, avec sa date entière', 'Aujourd’hui · mercredi 16 septembre', ditLeJour('2026-09-16', '2026-09-16'));
dit('hier, avec sa date entière', 'Hier · mardi 15 septembre', ditLeJour('2026-09-15', '2026-09-16'));
dit('un jour de la même année', 'Lundi 14 septembre', ditLeJour('2026-09-14', '2026-09-16'));
dit('un jour d’une autre année porte l’année', 'Mardi 31 décembre 2024', ditLeJour('2024-12-31', '2026-09-16'));
dit('sans date', 'Sans date', ditLeJour('', '2026-09-16'));

console.log(ko === 0 ? '\nTout passe.' : `\n${ko} ÉCHEC(S).`);
process.exit(ko === 0 ? 0 : 1);
