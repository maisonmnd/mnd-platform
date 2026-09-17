/* CONSULTATION D'ABORD OU RÉSERVATION DIRECTE, ÉPROUVÉ — `node scripts/verifie-qualification.mjs`.

   Le site et Ma Couronne lisent le même juge ; s'il se trompe, le site
   refuse ce que la Maison accepte, ou l'inverse. */
import { exigeConsultation, porteDe, porteDuBesoin, ditLaPorte } from '../src/shared/qualification';
import { CATEGORIE_VEKPE, CATEGORIE_FINFIN, estUneConsultation, masquePourLeSite } from '../src/shared/catalogue-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const cats = [
  { id: CATEGORIE_VEKPE },
  { id: CATEGORIE_FINFIN },
  { id: 'fam-finfin-legere', parentId: CATEGORIE_FINFIN },
  { id: 'atl-ii-gbeji' },
  { id: 'fam-sinsin', parentId: 'atl-ii-gbeji' },
  { id: 'boucle-a', parentId: 'boucle-b' },
  { id: 'boucle-b', parentId: 'boucle-a' },
];

dit('① une création (atelier VÈKPÈ™) exige la consultation', true, exigeConsultation({ categoryId: CATEGORIE_VEKPE }, cats));
dit('② un resserrage à prix fixe se réserve directement', false, exigeConsultation({ categoryId: 'fam-sinsin', priceMode: 'fixe' }, cats));
dit('③ un prix sur devis exige la consultation', true, exigeConsultation({ categoryId: 'fam-sinsin', priceMode: 'devis' }, cats));
dit('④ l’ancien hidePrice vaut devis', true, exigeConsultation({ categoryId: 'fam-sinsin', hidePrice: true }, cats));
dit('⑤ une famille de la Renaissance hérite de son atelier', true, exigeConsultation({ categoryId: 'fam-finfin-legere', priceMode: 'fixe' }, cats));
dit('⑥ le drapeau posé au Catalogue l’emporte', true, exigeConsultation({ categoryId: 'fam-sinsin', priceMode: 'fixe', consultationAvant: true }, cats));
dit('⑦ un parent circulaire ne fige rien', false, exigeConsultation({ categoryId: 'boucle-a', priceMode: 'fixe' }, cats));
dit('⑧ une catégorie inconnue se réserve directement', 'directe', porteDe({ categoryId: 'nulle-part', priceMode: 'variable' }, cats));
dit('⑨ les besoins du site', ['consultation', 'consultation', 'directe', 'consultation', 'directe', 'consultation'],
  (['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu'] as const).map(porteDuBesoin));
dit('⑩ la porte se dit', ['Commence par une consultation.', 'Se réserve directement.'], [ditLaPorte('consultation'), ditLaPorte('directe')]);

/* ── RECONNAÎTRE UNE CONSULTATION — la faute du 17 septembre, en ligne ──
   Le site ne connaissait que `doto`, la Maison avait posé `koko` : l'écran
   de réservation est sorti vide en production. */
const catsC = [{ id: 'doto' }, { id: 'koko' }, { id: 'fam-koko', parentId: 'koko' }, { id: 'atl-ii-gbeji' }];
dit('⑪ l\u2019atelier de la semence est une consultation', true, estUneConsultation({ categoryId: 'doto' }, catsC));
dit('⑫ celui que la Maison a posé aussi', true, estUneConsultation({ categoryId: 'koko' }, catsC));
dit('⑬ une famille rangée dessous en est une', true, estUneConsultation({ categoryId: 'fam-koko' }, catsC));
dit('⑭ un entretien n\u2019en est pas une', false, estUneConsultation({ categoryId: 'atl-ii-gbeji', name: 'KLƆKLƆ™ Essentiel' }, catsC));
dit('⑮ renommée encore, le nom la sauve d\u2019une page vide', true,
  estUneConsultation({ categoryId: 'inconnu-demain', name: 'Consultation Origine' }, catsC));
dit('⑯ … et « Diagnostic » vaut autant', true,
  estUneConsultation({ categoryId: 'inconnu-demain', name: 'KÒKÒ™ Suivi · Diagnostic locks Externes' }, catsC));
dit('⑰ sans catégorie connue ni nom parlant, non', false, estUneConsultation({ categoryId: 'x', name: 'Nattes Couronne' }, catsC));

/* ── CE QUE LA MAISON DECOCHE POUR LE SITE — 17 septembre 2026 ──
   « Il y a des services que je ne voudrais pas sur le site » (Yeman). La
   regle sert DEUX FOIS : l'ecran pour ne plus proposer, la fonction Edge
   pour refuser. Sans la seconde, decocher ne serait qu'un decor. */
const catsM = [
  { id: 'atl-ii-gbeji' },
  { id: 'cat-soins', parentId: 'atl-ii-gbeji' },
  { id: 'atl-iii-yekpe' },
  { id: 'boucle-a', parentId: 'boucle-b' },
  { id: 'boucle-b', parentId: 'boucle-a' },
];
const soin = { id: 'sv-aqua', categoryId: 'cat-soins' };
dit('\u3256 sans masques, rien ne se cache', false, masquePourLeSite(soin, undefined, catsM));
dit('\u3257 une liste vide ne cache rien', false, masquePourLeSite(soin, { services: [], categories: [] }, catsM));
dit('\u3258 une prestation decochee ne parait plus', true, masquePourLeSite(soin, { services: ['sv-aqua'] }, catsM));
dit('\u3259 sa voisine reste visible', false, masquePourLeSite({ id: 'sv-wewe', categoryId: 'cat-soins' }, { services: ['sv-aqua'] }, catsM));
dit('\u325a une famille decochee emporte ses gestes', true, masquePourLeSite(soin, { categories: ['cat-soins'] }, catsM));
dit('\u325b un atelier decoche emporte ses familles', true, masquePourLeSite(soin, { categories: ['atl-ii-gbeji'] }, catsM));
dit('\u325c un autre atelier ne l\u2019emporte pas', false, masquePourLeSite(soin, { categories: ['atl-iii-yekpe'] }, catsM));
dit('\u325d un parent circulaire ne fige rien', false, masquePourLeSite({ id: 'x', categoryId: 'boucle-a' }, { categories: ['ailleurs'] }, catsM));

if (ko) { console.error(`\n${ko} vérification(s) en échec.`); process.exit(1); }
console.log('\nLe juge tient.');
