/* LE CATALOGUE PAR PALIER, ÉPROUVÉ — `node scripts/verifie-catalogue-par-palier.mjs`.

   « Mets bien en évidence les différents paliers » (Yéman, 16 septembre
   2026). Deux fautes de lecture coûteraient : regrouper deux fiches qui ne
   sont pas la même prestation (un prix lu pour un autre), et dire un seuil
   qui n'est pas celui des Paramètres. */
import {
  CHIFFRE_DU_PALIER, seuilDit, longueurDuNom, nomEtSous, lignesDuCatalogue, parPalier, compteParPalier, plusHautPalier,
} from '../src/shared/catalogue-par-palier';
import type { Service } from '../src/shared/catalog';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${nom} → ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};

const fiche = (o: Partial<Service> & { id: string; name: string }): Service => ({
  categoryId: 'plt-05', palier: 'Fondation', priceXof: 0, hidePrice: false, sessions: 1, durationMin: 30, master: 'M', order: 0,
  ...o,
} as Service);

/* ── LE CHIFFRE ET LE SEUIL ──────────────────────────────────────── */
dit('les chiffres de l’Académie', ['I', 'II', 'III'],
  [CHIFFRE_DU_PALIER.Fondation, CHIFFRE_DU_PALIER['Élévation'], CHIFFRE_DU_PALIER['Souveraineté']]);
dit('Fondation, dès le premier rituel', 'dès son premier rituel honoré', seuilDit('Fondation'));
dit('Élévation, aux seuils par défaut', 'au 3ᵉ rituel honoré, ou après 6 mois de couronne', seuilDit('Élévation'));
dit('Souveraineté, aux seuils par défaut', 'au premier acte de Souveraineté honoré, ou après 18 mois de couronne', seuilDit('Souveraineté'));
/* LES SEUILS SONT CEUX DES PARAMÈTRES, pas ceux du code. */
dit('les seuils réglés se lisent', 'au 5ᵉ rituel honoré, ou après 9 mois de couronne',
  seuilDit('Élévation', { elevationRituels: 5, elevationMois: 9 }));
dit('un seuil au premier rituel se dit « 1ᵉʳ »', 'au 1ᵉʳ rituel honoré, ou après 6 mois de couronne',
  seuilDit('Élévation', { elevationRituels: 1 }));
dit('un seuil absurde retombe sur le défaut', 'au 3ᵉ rituel honoré, ou après 6 mois de couronne',
  seuilDit('Élévation', { elevationRituels: 0 }));

/* ── LA LONGUEUR AU BOUT DU NOM ──────────────────────────────────── */
dit('la longueur se lit au bout du nom', { base: 'KLƆKLƆ™ Essentiel · « Le Souffle »', longueur: 'court' },
  longueurDuNom('KLƆKLƆ™ Essentiel · « Le Souffle » · Court'));
dit('… mi-long aussi', { base: 'DÀNDÀN™ · Le Soin Hydratant', longueur: 'mi-long' }, longueurDuNom('DÀNDÀN™ · Le Soin Hydratant · Mi-Long'));
dit('… et la longue', { base: 'WÈWÈ™ · La Purification', longueur: 'long' }, longueurDuNom('WÈWÈ™ · La Purification · Long ou haute densité'));
dit('un nom sans longueur reste entier', { base: 'KÒKÒ™ Origine · Avant Création' }, longueurDuNom('KÒKÒ™ Origine · Avant Création'));
/* « LONG » SEUL N'EST PAS UNE LONGUEUR DU TRÔNE : on ne devine pas. */
dit('un mot qui ressemble à une longueur ne se lit pas', { base: 'GBÈJÍ™ Annuel · Le Cycle de Vie, 12 mois' },
  longueurDuNom('GBÈJÍ™ Annuel · Le Cycle de Vie, 12 mois'));
dit('le nom et son sous-titre', { nom: 'KÒKÒ™ Origine', sous: 'Avant Création' }, nomEtSous('KÒKÒ™ Origine · Avant Création'));
dit('un nom seul n’a pas de sous-titre', { nom: 'Lock Test' }, nomEtSous('Lock Test'));

/* ── LES LIGNES ──────────────────────────────────────────────────── */
const souffleC = fiche({ id: 'c', name: 'KLƆKLƆ™ Essentiel · « Le Souffle » · Court', priceXof: 8000, order: 0 });
const souffleL = fiche({ id: 'l', name: 'KLƆKLƆ™ Essentiel · « Le Souffle » · Long ou haute densité', priceXof: 12000, order: 1 });
const souffleM = fiche({ id: 'm', name: 'KLƆKLƆ™ Essentiel · « Le Souffle » · Mi-Long', priceXof: 10000, order: 2 });
const ancrageC = fiche({ id: 'a', name: 'KLƆKLƆ™ Signature · « L’Ancrage » · Court', priceXof: 15000, order: 3 });
const koko = fiche({ id: 'k', name: 'KÒKÒ™ Origine · Avant Création', categoryId: 'koko', priceXof: 15000, order: 4 });

const lignes = lignesDuCatalogue([souffleC, souffleL, souffleM, ancrageC, koko]);
dit('trois longueurs font une ligne, une fiche seule en fait une autre', ['c', 'a', 'k'], lignes.map((l) => l.cle));
dit('la ligne porte le nom et le sous-titre', ['KLƆKLƆ™ Essentiel', '« Le Souffle »'], [lignes[0].nom, lignes[0].sous]);
/* LES LONGUEURS DANS L'ORDRE DU TRÔNE, pas dans l'ordre de saisie. */
dit('les longueurs se rangent Court, Mi-long, Long', ['court', 'mi-long', 'long'], lignes[0].longueurs.map((x) => x.id));
dit('… et les prix suivent', [8000, 10000, 12000], lignes[0].fiches.map((f) => f.priceXof));
/* UNE FICHE ISOLÉE QUI PORTE UNE LONGUEUR n'a pas de sœurs : la longueur
   reste dans son nom. */
dit('une longueur seule garde son nom complet', ['KLƆKLƆ™ Signature', '« L’Ancrage » · Court', 0],
  [lignes[1].nom, lignes[1].sous, lignes[1].longueurs.length]);
dit('la fiche sans longueur est une ligne à elle', ['KÒKÒ™ Origine', 'Avant Création'], [lignes[2].nom, lignes[2].sous]);

/* ON NE REGROUPE PAS DEUX PRESTATIONS DIFFÉRENTES : un palier ou un atelier
   qui diffère fait deux lignes, même sous un nom jumeau. */
const autrePalier = fiche({ id: 'p', name: 'KLƆKLƆ™ Essentiel · « Le Souffle » · Mi-Long', palier: 'Élévation', order: 9 });
dit('un palier différent ne se regroupe pas', 2, lignesDuCatalogue([souffleC, autrePalier]).length);
const autreAtelier = fiche({ id: 'q', name: 'KLƆKLƆ™ Essentiel · « Le Souffle » · Mi-Long', categoryId: 'ailleurs', order: 9 });
dit('un atelier différent ne se regroupe pas', 2, lignesDuCatalogue([souffleC, autreAtelier]).length);
const memeLongueur = fiche({ id: 'r', name: 'KLƆKLƆ™ Essentiel · « Le Souffle » · Court', order: 9 });
dit('deux fiches de la même longueur restent deux lignes', 2, lignesDuCatalogue([souffleC, memeLongueur]).length);

/* ── PAR PALIER, DANS L'ATELIER ──────────────────────────────────── */
const vekpe = [
  fiche({ id: 'n', name: 'VÈKPÈ™ Nano', palier: 'Souveraineté', order: 0 }),
  fiche({ id: 'j', name: 'VÈKPÈ™ Jumbo', palier: 'Fondation', order: 1 }),
  fiche({ id: 'i', name: 'VÈKPÈ™ Mini', palier: 'Élévation', order: 2 }),
  fiche({ id: 'd', name: 'VÈKPÈ™ Medium', palier: 'Fondation', order: 3 }),
];
dit('du plus bas au plus haut, dans l’ordre saisi', [['Fondation', ['j', 'd']], ['Élévation', ['i']], ['Souveraineté', ['n']]],
  parPalier(vekpe).map((g) => [g.palier, g.items.map((x) => x.id)]));
dit('une marche vide ne paraît pas', ['Fondation'], parPalier([vekpe[1]]).map((g) => g.palier));

/* ── LE COMPTE DE L'ÉCHELLE ──────────────────────────────────────── */
const compte = compteParPalier([souffleC, souffleL, koko, vekpe[0], vekpe[2], autreAtelier]);
dit('prestations et catégories par palier', [[4, 3], [1, 1], [1, 1]],
  [compte.Fondation, compte['Élévation'], compte['Souveraineté']].map((c) => [c.prestations, c.categories]));
dit('le plus haut palier d’une ligne', 'Souveraineté', plusHautPalier(['Fondation', 'Souveraineté', 'Élévation']));

if (ko) {
  console.error(`\n${ko} vérification(s) en échec.`);
  process.exit(1);
}
console.log('\nLe catalogue par palier tient.');
