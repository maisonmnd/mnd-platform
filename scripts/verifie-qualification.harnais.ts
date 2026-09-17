/* CONSULTATION D'ABORD OU RÉSERVATION DIRECTE, ÉPROUVÉ — `node scripts/verifie-qualification.mjs`.

   Le site et Ma Couronne lisent le même juge ; s'il se trompe, le site
   refuse ce que la Maison accepte, ou l'inverse. */
import { exigeConsultation, porteDe, porteDuBesoin, ditLaPorte } from '../src/shared/qualification';
import { CATEGORIE_VEKPE, CATEGORIE_FINFIN } from '../src/shared/catalogue-pur';

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

if (ko) { console.error(`\n${ko} vérification(s) en échec.`); process.exit(1); }
console.log('\nLe juge tient.');
