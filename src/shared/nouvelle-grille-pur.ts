/* ══ LA NOUVELLE GRILLE DE LA MAISON — 10 octobre 2026 ═══════════════════
   La genèse des prix : état des lieux, cinq expertises, une synthèse, puis
   les décisions de Yéman au sélecteur et la maquette validée (« construis »).

   LA CARTE EST UNE DONNÉE. Chaque changement dit la ligne qu'il touche, ce
   qu'elle doit ENCORE porter pour qu'on y touche (`si`), ce qu'on y pose
   (`pose`), et QUAND : maintenant, ou au 1er janvier 2027.

   LE JUGE NE TOUCHE QU'UNE LIGNE RESTÉE TELLE QU'ON LA CONNAÎT. Si la Maison
   a renommé ou recoté une prestation à la main depuis le 10 octobre, sa
   décision fait foi et le changement passe son chemin, comme la raison de la
   Maison le 10 octobre (`migreLIdentite`). Rejoué, il ne fait rien : la ligne
   porte déjà ce qu'on voulait poser.

   LE CALENDRIER DÉCIDÉ (question 12) : maintenant, ce qui ne monte aucun
   prix (les noms, les archives, les baisses, les nouveautés au comptoir) ;
   en novembre, le pilote au comptoir ; au 1er janvier 2027, les hausses et
   Ma Couronne. Les nouveautés sont donc MASQUÉES du site et de Ma Couronne
   jusqu'en janvier (`masquesDeLaGrille`).

   Pur : aucun magasin, aucun réseau. Le Trône l'applique au démarrage
   (`migreLaNouvelleGrille`, shared/nouvelle-grille.ts), le harnais l'éprouve. */

export type Temps = 'maintenant' | 'janvier';
export const JOUR_DE_JANVIER = '2027-01-01';

type Champs = Record<string, unknown>;
type Fiche = Champs & { id: string };

export type Retouche = {
  quoi: 'service' | 'categorie';
  id: string;
  temps: Temps;
  /** Ce que la ligne doit encore porter. Une clé à `undefined` = absente. */
  si: Champs;
  /** Ce qu'on pose. Une clé à `undefined` efface le champ. */
  pose: Champs;
  pourquoi: string;
};

export type Naissance = { quoi: 'service' | 'categorie'; temps: Temps; fiche: Fiche; pourquoi: string };

/** Un morceau de description remplacé, seulement s'il y est encore. */
export type Phrase = { id: string; temps: Temps; avant: string; apres: string; pourquoi: string };

/* ── Les catégories ─────────────────────────────────────────────────── */
const CAT = (id: string, si: Champs, pose: Champs, pourquoi: string, temps: Temps = 'maintenant'): Retouche =>
  ({ quoi: 'categorie', id, temps, si, pose, pourquoi });
/* ── Les prestations ────────────────────────────────────────────────── */
const SV = (id: string, si: Champs, pose: Champs, pourquoi: string, temps: Temps = 'maintenant'): Retouche =>
  ({ quoi: 'service', id, temps, si, pose, pourquoi });
const NOM = (id: string, avant: string, apres: string, pourquoi = 'nom de la grille'): Retouche =>
  SV(id, { name: avant }, { name: apres }, pourquoi);
const ARCHIVE = (id: string, nom: string, pourquoi: string, temps: Temps = 'maintenant'): Retouche =>
  SV(id, { name: nom, archived: undefined }, { archived: true }, pourquoi, temps);

export const RETOUCHES: readonly Retouche[] = [
  /* Les six chapitres, et leurs familles. */
  CAT('koko', { label: 'Le Diagnostic' }, { label: 'Le Regard' }, 'KÒKÒ™ · Le Regard'),
  CAT('atl-i-vekpe', { label: 'Création . La Naissance' }, { label: 'La Naissance' }, 'point isolé retiré'),
  CAT('atl-ii-gbeji', { label: 'Entretien . La Vie' }, { label: 'La Vie' }, 'point isolé retiré'),
  CAT('atl-iii-yekpe', { label: 'Coloration' }, { label: 'La Lumière' }, 'retour au nom de la genèse'),
  CAT('tn29axgoc5', { order: 94 }, { order: 5 }, 'l’acte le plus vendu n’est plus rangé en dernier'),
  CAT('cat-defaisage', { parentId: 'atl-iv-finfin', label: 'Le Défaisage' }, { parentId: undefined, label: 'Le Dénouement', order: 5 }, 'GBÀTÀ™ devient le sixième chapitre'),
  CAT('cat-mnd-kids', { label: 'les petites tetes couronnees' }, { label: 'les petites têtes couronnées' }, 'accents'),
  CAT('cat-souverain', { fon: "L'Édition Souveraine" }, { fon: 'Portes closes', label: 'la Maison pour vous seule' }, 'le mot interdit retiré'),
  CAT('plt-70', { fon: 'SOINS ANNEXES' }, { fon: 'Pendant le rituel' }, 'Pendant le rituel'),
  CAT('sup', { fon: 'PRÉPARATION & SUPPLÉMENTS' }, { fon: 'Préparation et options' }, 'noms francisés'),
  CAT('home-rituals', { fon: 'HOME RITUALS™' }, { fon: 'À la maison' }, 'pas d’anglais dans un nom'),
  CAT('stu-c', { fon: 'SUBLIMER' }, { fon: 'CÉLÉBRER' }, 'évite la collision avec « Sublimation »'),
  CAT('cat-styling', { fon: 'Styling & Coiffures' }, { fon: 'La sortie' }, 'pas d’anglais dans un nom'),

  /* KÒKÒ™ · Le Regard */
  NOM('sv-koko-sui', 'KÒKÒ™ Suivi · Diagnostic locks Externes', 'KÒKÒ™ Accueil · pour des locks nées ailleurs', '« Suivi » disait le contraire'),
  NOM('svc-doto-conseil', 'Consultation Conseil & Diagnostic', 'KÒKÒ™ Conseil · enfant, cheveu naturel', 'la porte des Kids et du Studio'),
  NOM('sv-sup-30', 'Lock Test · Essai de Calibre', 'VÈKPÈ™ L’Essai · essai de calibre', 'anglais retiré'),

  /* VÈKPÈ™ · La Naissance */
  NOM('sv-atl-i-nan', 'VÈKPÈ™ Création Nano · La Couronne KPÒKPÒ™', 'VÈKPÈ™ Création Nano · La Très Haute Précision', 'KPÒKPÒ™ sort du vocabulaire public'),
  ARCHIVE('sv-plt-50-ret-c-c', 'Retouches Post Création', 'fondue dans La Retouche au calibre (35 000 F, plus qu’un resserrage)'),

  /* GBÈJÍ™ · La Vie */
  NOM('sv-atl-ii-l', 'SÍNSIN™ Élaboré · La Reprise Longue Durée', 'SÍNSIN™ Signature · La Reprise Longue Durée', 'une seule gamme : Essentiel, Signature, Prestige'),
  NOM('sv-plt-05-ess-c', 'KLƆKLƆ™ Essentiel · Le Shampoing « Le Souffle »', 'KLƆKLƆ™ Essentiel · Le Souffle'),
  NOM('sv-plt-05-sig-c', 'KLƆKLƆ™ Signature · Le Shampoing « L’Ancrage »', 'KLƆKLƆ™ Signature · L’Ancrage'),
  NOM('sv-plt-05-pre-c', 'KLƆKLƆ™ Prestige · Le Shampoing « La Dépose »', 'KLƆKLƆ™ Prestige · La Dépose'),
  NOM('sv-dds-shp-e', 'KLƆKLƆ™ à Façon Lavage · Shampoing apporté', 'KLƆKLƆ™ avec votre produit · shampoing apporté', '« à Façon » retiré'),
  NOM('sv-plt-50-sty-e', 'Styling · sortie soignée', 'La sortie soignée'),
  NOM('sv-plt-50-sty-s', 'Styling Signature · sortie élaborée', 'La sortie Signature · sortie élaborée'),
  NOM('sv-plt-50-eve-c', 'Coiffure Signature Événement', 'La sortie de grand jour'),
  NOM('sv-plt-10-m', 'DÀNDÀN™ · Le Soin Ultra-Hydratant', 'DÀNDÀN™ · L’hydratation aux sept huiles'),
  ARCHIVE('aqua-locks-ritual', 'AQUA LOCKS RITUAL™ · Le Soin Ultra-Hydratant', 'le même soin que DÀNDÀN™, sous un nom anglais'),
  NOM('sv-plt-30-c', 'VÍVÍVÓ™ · Le Soin L’Activateur de Pousse', 'VÍVÍVÓ™ · Le Vivifiant', 'le mot de la direction'),
  NOM('sv-plt-20-c', 'WÈWÈ™ · Le Soin La Purification', 'WÈWÈ™ · La Purification'),
  SV('sv-plt-40-m', { name: 'GBÌGBÌ™ Module · Le Soin Reconstruction', categoryId: 'atl-iv-finfin' }, { name: 'GBÌGBÌ™ · Le Renfort', categoryId: 'cat-soins' }, 'GBÌGBÌ™ ne nomme plus que le renfort, rangé dans les soins, sans consultation exigée'),
  NOM('sv-plt-30-cur', 'Forfait Cure VÍVÍVÓ™ × 3 séances', 'VÍVÍVÓ™ · Cure de trois'),
  NOM('sv-forfait-sv-plt-60-wd-c', 'WÈWÈ™ + DÀNDÀN™ · la combinaison trimestrielle', 'WÈWÈ™ + DÀNDÀN™ · le soin du trimestre'),
  SV('sv-forfait-sv-plt-60-wd-c', { priceXof: 38500, prixParLongueur: { court: 38500, 'mi-long': 46000, long: 51500 } }, { priceXof: 30000, prixParLongueur: { court: 30000, 'mi-long': 40000, long: 50000 } }, 'plus jamais au-dessus de la carte (baisse)'),
  NOM('sv-dds-dec', 'WÈWÈ™ à Façon Décapage · décapant apporté', 'WÈWÈ™ avec votre produit · décapant apporté', '« à Façon » retiré'),
  NOM('sv-dds-soi-c', 'WÈWÈ™ à Façon Soin · masque ou huile apportés', 'WÈWÈ™ avec votre produit · masque ou huile apportés', '« à Façon » retiré'),
  NOM('sv-retouches-post-reprise', 'Retouches Post Reprise', 'La Retouche · contours et racines', 'une seule ligne au calibre'),

  /* YÈKPÈ™ · La Lumière */
  NOM('sv-atl-iii-lum-c', 'YÈKPÈ™ Couleur Lumière · La Brillance Signature', 'YÈKPÈ™ Lumière · La Brillance Signature'),
  SV('sv-atl-iii-lum-c', { priceXof: 25000 }, { priceXof: 15000 }, 'la finition ne coûte plus plus cher que l’acte de fond (baisse)'),
  NOM('sv-forfait-sv-plt-60-cl-c', 'YÈKPÈ™ Couleur + Lumière · la combinaison complète', 'YÈKPÈ™ Couleur + Lumière · la finition'),
  SV('sv-forfait-sv-plt-60-cl-c', { priceXof: 37000, prixParLongueur: { court: 37000, 'mi-long': 55000, long: 64500 } }, { priceXof: 25000, prixParLongueur: { court: 25000, 'mi-long': 30000, long: 35000 } }, 'la Couleur, plus 10 000 F de Lumière (baisse)'),
  SV('sv-atl-iii-sub-c', { name: 'YÈKPÈ™ Couleur Sublimation · La Transformation Totale', categoryId: 'atl-iii-yekpe' }, { name: 'La Transformation · décoloration et oxydation', categoryId: 'cat-transformation' }, 'la chimie sort de YÈKPÈ™ : la promesse « 100 % végétale » redevient vraie'),
  NOM('sv-dds-col-c', 'YÈKPÈ™ à Façon · pose de couleur apportée', 'YÈKPÈ™ avec votre couleur · couleur apportée', '« à Façon » retiré'),

  /* FÍNFÍN™ · La Renaissance */
  NOM('sv-atl-iv-gbe-c', 'GBÌGBÌ™ Essentiel · La Reconstruction', 'FÍNFÍN™ Essentiel · La Reconstruction', 'la restauration prend le nom de son chapitre'),
  NOM('sv-atl-iv-gbp-c', 'GBÌGBÌ™ Profond · La Reconstruction Intensive', 'FÍNFÍN™ Profond · La Reconstruction Intensive', 'la restauration prend le nom de son chapitre'),
  SV('sv-atl-iv-ala-c', { prixParLongueur: { court: 110000, 'mi-long': 150000, long: 200000 } }, { prixParLongueur: { court: 110000, 'mi-long': 150000, long: 180000 } }, 'décision du 10 octobre : 110 000 / 150 000 / 180 000 F, en deux séances, aucune hausse en 2027'),
  NOM('sv-plt-50-ret-r-c', 'Retouches Post Restauration', 'FÍNFÍN™ · La Retouche'),

  /* GBÀTÀ™ · Le Dénouement */
  NOM('sv-plt-45-std', 'GBÀTÀ™ Standard · Le Défaisage', 'GBÀTÀ™ Essentiel · Le Défaisage'),
  SV('sv-plt-45-std', { consultationAvant: undefined }, { consultationAvant: true }, 'après KÒKÒ™ Accueil : le chapitre sort de FÍNFÍN™, la règle reste'),
  SV('sv-plt-45-int', { consultationAvant: undefined }, { consultationAvant: true }, 'après KÒKÒ™ Accueil : le chapitre sort de FÍNFÍN™, la règle reste'),

  /* MND Kids */
  SV('sv-kids-vekpe', { priceFloors: { 'cal-jumbo': 80000, 'cal-medium': 150000, 'cal-mini': 180000 } }, { priceFloors: { 'cal-jumbo': 80000, 'cal-medium': 120000, 'cal-mini': 180000 } }, 'correctif de la saison : plus de doublement à 81 locks (baisse)'),
  NOM('sv-kids-sinsin', 'SÍNSIN™ Kids · La Reprise Essentielle', 'SÍNSIN™ Kids · La Reprise', 'les noms fon sont masculins'),
  NOM('sv-kids-kloklo', 'KLƆKLƆ™ Kids · Le Shampoing « Le Souffle »', 'KLƆKLƆ™ Kids · Le Souffle'),
  SV('sv-kids-kloklo', { prixBarreXof: 10000 }, { prixBarreXof: undefined }, 'plus de prix barré permanent'),
  NOM('sv-kids-gbigbi', 'GBÌGBÌ™ Kids · Le Renfort durable', 'GBÌGBÌ™ Kids · Le Renfort'),
  SV('sv-kids-gbigbi', { prixBarreXof: 15000 }, { prixBarreXof: undefined }, 'plus de prix barré permanent'),
  NOM('sv-kids-yekpe', 'YÈKPÈ™ × GBÌGBÌ™ Kids · Sublimation & Renfort durable', 'GBÌGBÌ™ Kids · L’Éclat', 'ce n’est pas une couleur'),
  NOM('sv-kids-retouche', 'SÍNSIN™ Kids · La Retouche Post Création', 'La Retouche (Kids)'),
  SV('sv-kids-retouche', { priceXof: 10000, tarifMode: undefined, priceFloors: undefined }, { priceXof: 7000, tarifMode: 'calibre', priceFloors: { 'cal-jumbo': 5000, 'cal-medium': 7000, 'cal-mini': 9000 } }, 'au calibre, comme l’adulte (baisse : elle coûtait plus qu’une retouche d’adulte)'),
  NOM('sv-kids-rituel', 'PACK MND KIDS · Le rituel complet', 'MND Kids · Le Rituel', 'capitales retirées'),
  NOM('sv-kids-naissance', 'PACK MND KIDS · La Première Couronne + Les 3 Premières Venues', 'MND Kids · Les Premières Venues', 'capitales retirées'),

  /* Le Studio : les tresses suspendues (question 10). */
  ARCHIVE('sv-stu-a-lib-fin-dos', 'Tresses Fines · Mi-dos', 'tresses suspendues'),
  ARCHIVE('sv-stu-a-lib-jum-epa', 'Tresses Jumbo · Épaules', 'tresses suspendues'),
  ARCHIVE('sv-stu-a-lib-moy-dos', 'Tresses Moyennes · Mi-dos', 'tresses suspendues'),
  ARCHIVE('sv-stu-a-nat-m', 'Nattes Couronne', 'tresses suspendues'),
  ARCHIVE('sv-stu-a-van-c', 'Vanilles Signature', 'tresses suspendues'),
  NOM('sv-stu-b-eve-c', 'Éveil Studio', 'RÉVÉLER · Éveil'),
  NOM('sv-stu-b-cpf-c', 'Coupe & Forme', 'RÉVÉLER · Coupe et forme'),
  NOM('sv-stu-c-eve-c', 'Coiffure Événement', 'CÉLÉBRER · Coiffure d’événement'),
  NOM('sv-stu-c-sik-1-c', 'Sika Day · Formule Essentielle', 'CÉLÉBRER · Le Grand Jour Essentiel', '« Sika Day » retiré'),
  NOM('sv-stu-c-sik-2-c', 'Sika Day · Formule Signature', 'CÉLÉBRER · Le Grand Jour Signature', '« Sika Day » retiré'),

  /* Portes closes : le mot interdit sort des noms. */
  NOM('sv-souv-1h', 'Le Salon Souverain · Une heure', 'Portes closes · une heure', 'le mot interdit retiré'),
  NOM('sv-souv-2h', 'Le Salon Souverain · Deux heures', 'Portes closes · deux heures', 'le mot interdit retiré'),
  NOM('sv-souv-rep', 'Le Salon Souverain · La Réparation Intensive', 'Portes closes · la Réparation intensive', 'le mot interdit retiré'),
  NOM('sv-souv-crea', 'Le Salon Souverain · La Création', 'Portes closes · la Création', 'le mot interdit retiré'),

  /* Pendant le rituel, options, Académie. */
  NOM('sv-plt-70-man-c', 'Manucure', 'Pendant le rituel · manucure'),
  NOM('sv-plt-70-ped-c', 'Pédicure', 'Pendant le rituel · pédicure'),
  NOM('sv-plt-70-par', 'Pendant le Rituel · manucure et pédicure', 'Pendant le rituel · manucure et pédicure'),
  NOM('sv-sup-50', 'Option Nuage · technique knotless', 'Option Nuage · sans nœud', 'anglais retiré'),
  NOM('sv-aca-pro-biz', 'Module Business du Salon', 'Module Business · Tenir sa maison', 'le mot interdit retiré'),
  NOM('sv-aca-pro-cert', 'Cursus Certifiant Complet · KPLƆ̌N™', 'Cursus Certifiant Complet', 'KPLƆ̌N™ sort du vocabulaire public (son caron échappe à la police fon)'),
];

/* ── Les descriptions : Kòfí™ n'existe pas encore, les noms fon sont
   masculins, ÀLÀLÀ™ passe à deux séances. ──────────────────────────── */
export const PHRASES: readonly Phrase[] = [
  { id: 'sv-atl-i-nan', temps: 'maintenant', avant: '1 SÍNSIN™ Nano Essentielle offert', apres: '1 SÍNSIN™ Essentiel offert', pourquoi: 'les noms fon sont masculins' },
  { id: 'sv-atl-i-nan', temps: 'maintenant', avant: ', huile Kòfí™ 100 ml.', apres: '.', pourquoi: 'Kòfí™ retirée tant que le produit n’existe pas' },
  { id: 'sv-atl-i-pic', temps: 'maintenant', avant: '1 SÍNSIN™ Essentielle offerte', apres: '1 SÍNSIN™ Essentiel offert', pourquoi: 'les noms fon sont masculins' },
  { id: 'sv-atl-i-pic', temps: 'maintenant', avant: ', huile Kòfí™ 100 ml.', apres: '.', pourquoi: 'Kòfí™ retirée tant que le produit n’existe pas' },
  { id: 'sv-atl-i-min', temps: 'maintenant', avant: '1 SÍNSIN™ Essentielle offert', apres: '1 SÍNSIN™ Essentiel offert', pourquoi: 'les noms fon sont masculins' },
  { id: 'sv-atl-iii-lum-c', temps: 'maintenant', avant: 'finition huile Kòfí™ MND', apres: 'finition à l’huile', pourquoi: 'Kòfí™ retirée tant que le produit n’existe pas' },
  { id: 'sv-atl-iv-ala-c', temps: 'maintenant', avant: 'Engagement 3 séances minimum.', apres: 'En deux séances.', pourquoi: 'décision du 10 octobre' },
  { id: 'sv-atl-iv-ala-c', temps: 'maintenant', avant: 'Inclus : 3 GBÌGBÌ™ + 3 DÀNDÀN™ répartis', apres: 'Inclus : un GBÌGBÌ™ et un DÀNDÀN™ à chaque séance', pourquoi: 'décision du 10 octobre' },
  { id: 'sv-atl-iv-ala-c', temps: 'maintenant', avant: 'coiffure signature de sortie à la séance 3', apres: 'coiffure signature de sortie à la séance 2', pourquoi: 'décision du 10 octobre' },
];

/* ── Ce qui naît. Masqué du site et de Ma Couronne jusqu'en janvier :
   le pilote se fait au comptoir (question 12). ─────────────────────── */
const PRESTATION = (f: Fiche): Fiche => ({
  palier: 'Élévation', palierPose: true, hidePrice: false, priceMode: 'fixe', sessions: 1, master: '', ...f,
});

export const NAISSANCES: readonly Naissance[] = [
  { quoi: 'categorie', temps: 'maintenant', pourquoi: 'la venue nommée a sa famille, en tête de GBÈJÍ™', fiche: {
    id: 'cat-venue', fon: 'La venue', label: 'GBÈJÍ™ Essentiel, Signature, Le Moment', order: 1, maison: 'atelier', parentId: 'atl-ii-gbeji', enabled: true, code: 'ATL·II·VEN',
  } },
  { quoi: 'categorie', temps: 'maintenant', pourquoi: 'la décoloration sort de YÈKPÈ™ (question 9)', fiche: {
    id: 'cat-transformation', fon: 'La Transformation', label: 'décoloration et oxydation, hors de la couleur végétale', order: 6, maison: 'atelier', enabled: true, code: 'TRF',
  } },
  { quoi: 'service', temps: 'maintenant', pourquoi: 'la venue de tous les jours porte enfin un nom (question 3)', fiche: PRESTATION({
    id: 'sv-venue-gbeji-ess', categoryId: 'cat-venue', name: 'GBÈJÍ™ Essentiel · la venue d’entretien', code: 'ATL·II·VEN·E', order: 1,
    priceXof: 0, forfaitRemisePct: 0, durationMin: 150, durationMaxMin: 280,
    includes: [{ serviceId: 'sv-plt-05-ess-c' }, { serviceId: 'sv-atl-ii-e' }, { serviceId: 'sv-plt-50-sty-e', offert: true }],
    description: 'La venue toutes les six semaines, au prix de la carte : KLƆKLƆ™ Essentiel et SÍNSIN™ Essentiel, la sortie soignée comprise.',
  }) },
  { quoi: 'service', temps: 'maintenant', pourquoi: 'la combinaison la plus vendue, en une ligne (question 3)', fiche: PRESTATION({
    id: 'sv-venue-gbeji-sig', categoryId: 'cat-venue', name: 'GBÈJÍ™ Signature · la venue d’entretien', code: 'ATL·II·VEN·S', order: 2,
    priceXof: 0, forfaitRemisePct: 0, durationMin: 180, durationMaxMin: 310,
    includes: [{ serviceId: 'sv-plt-05-ess-c' }, { serviceId: 'sv-atl-ii-l' }, { serviceId: 'sv-plt-50-sty-e', offert: true }],
    description: 'KLƆKLƆ™ Essentiel et SÍNSIN™ Signature, la sortie soignée comprise. La reprise longue durée, au prix de la carte.',
  }) },
  { quoi: 'service', temps: 'maintenant', pourquoi: 'le soin et le temps (question 3)', fiche: PRESTATION({
    id: 'sv-le-moment', categoryId: 'cat-venue', name: 'Le Moment · le soin et le temps', code: 'ATL·II·VEN·M', order: 3,
    priceXof: 0, forfaitRemisePct: 0, durationMin: 300, durationMaxMin: 420,
    includes: [
      { serviceId: 'sv-plt-05-sig-c' }, { serviceId: 'sv-atl-ii-l' }, { serviceId: 'sv-plt-10-m' },
      { serviceId: 'sv-plt-30-c', offert: true }, { serviceId: 'sv-plt-50-sty-s', offert: true },
    ],
    description: 'KLƆKLƆ™ Signature, SÍNSIN™ Signature et DÀNDÀN™, sans horloge, sur un créneau dédié. Le VÍVÍVÓ™ et la sortie Signature sont offerts.',
  }) },
  { quoi: 'service', temps: 'maintenant', pourquoi: 'la lecture qui déclenche une recommandation de soin', fiche: PRESTATION({
    id: 'sv-koko-bilan', categoryId: 'koko', name: 'KÒKÒ™ Bilan · la lecture de votre couronne', code: 'KOKO·BIL', order: 3,
    palier: 'Fondation', priceXof: 10000, durationMin: 30,
    description: 'Mèche témoin, longueur, cuir chevelu : la Maison lit votre couronne et vous dit le soin dont elle a besoin.',
  }) },
  { quoi: 'service', temps: 'maintenant', pourquoi: 'la marche entre le renfort et la restauration', fiche: PRESTATION({
    id: 'sv-gbigbi-cure-trois', categoryId: 'cat-soins', name: 'GBÌGBÌ™ · Cure de trois', code: 'PLT·40·CUR', order: 26,
    palier: 'Fondation', priceXof: 0, forfaitRemisePct: 50 / 3, durationMin: 80,
    includes: [{ serviceId: 'sv-plt-40-m' }, { serviceId: 'sv-plt-40-m', afterWeeks: 3 }, { serviceId: 'sv-plt-40-m', afterWeeks: 6 }],
    description: 'Trois renforts GBÌGBÌ™ en six semaines, posés au carnet.',
  }) },
];

/** Les nouveautés masquées du site et de Ma Couronne jusqu'en janvier. */
export const MASQUEES_JUSQUEN_JANVIER: readonly string[] = NAISSANCES
  .filter((n) => n.quoi === 'service').map((n) => n.fiche.id);

/* ══ LE JUGE ══════════════════════════════════════════════════════════ */

/** Deux valeurs égales, quel que soit l'ordre des clés d'un objet : le jsonb
    rend les champs dans un autre ordre (leçon du 2 octobre, `memeContenu`). */
export function egaux(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return a === undefined && b === undefined;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => egaux(x, bb[i]));
  }
  const ka = Object.keys(a as Champs).filter((k) => (a as Champs)[k] !== undefined);
  const kb = Object.keys(b as Champs).filter((k) => (b as Champs)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => egaux((a as Champs)[k], (b as Champs)[k]));
}

const porte = (f: Champs, si: Champs): boolean => Object.keys(si).every((k) => egaux(f[k], si[k]));
const deja = (f: Champs, pose: Champs): boolean => Object.keys(pose).every((k) => egaux(f[k], pose[k]));
const posee = (f: Fiche, pose: Champs, jour: string): Fiche => {
  const g: Champs = { ...f };
  for (const [k, v] of Object.entries(pose)) {
    if (v === undefined) delete g[k]; else g[k] = v;
  }
  if (pose.archived === true && !g.archivedLe) g.archivedLe = jour;
  return g as Fiche;
};

const dansLeTemps = (t: Temps, phase: Temps): boolean => t === 'maintenant' || phase === 'janvier';

export type Bilan = { services: Fiche[]; categories: Fiche[]; faits: string[] };

/** APPLIQUE LA GRILLE d'une phase sur le catalogue vivant. Rend le catalogue
    neuf et ce qui a été fait, ou `null` s'il n'y a rien à faire. */
export function appliqueLaGrille(
  catalogue: { services: readonly Fiche[]; categories: readonly Fiche[] },
  phase: Temps,
  jour: string,
): Bilan | null {
  const services = catalogue.services.map((s) => ({ ...s }));
  const categories = catalogue.categories.map((c) => ({ ...c }));
  const faits: string[] = [];
  const liste = (q: 'service' | 'categorie') => (q === 'service' ? services : categories);

  for (const n of NAISSANCES) {
    if (!dansLeTemps(n.temps, phase)) continue;
    const l = liste(n.quoi);
    if (l.some((x) => x.id === n.fiche.id)) continue;
    l.push({ ...n.fiche });
    faits.push(`naît ${n.fiche.id}`);
  }
  for (const r of RETOUCHES) {
    if (!dansLeTemps(r.temps, phase)) continue;
    const l = liste(r.quoi);
    const i = l.findIndex((x) => x.id === r.id);
    if (i < 0 || deja(l[i], r.pose) || !porte(l[i], r.si)) continue;
    l[i] = posee(l[i], r.pose, jour);
    faits.push(`${r.id} : ${r.pourquoi}`);
  }
  for (const p of PHRASES) {
    if (!dansLeTemps(p.temps, phase)) continue;
    const i = services.findIndex((x) => x.id === p.id);
    if (i < 0) continue;
    const d = services[i].description;
    if (typeof d !== 'string' || !d.includes(p.avant)) continue;
    services[i] = { ...services[i], description: d.replace(p.avant, p.apres) };
    faits.push(`${p.id} : ${p.pourquoi}`);
  }
  return faits.length ? { services, categories, faits } : null;
}

/** LES MASQUES DE LA PHASE. Maintenant : les nouveautés sont cachées du site
    et de Ma Couronne (le pilote est au comptoir). En janvier : on les montre.
    Rend la configuration neuve, ou `null` si rien ne change. */
export function masquesDeLaGrille<C extends { hiddenServices?: string[]; siteMasques?: { services?: string[]; categories?: string[] } }>(
  cfg: C, phase: Temps,
): C | null {
  const ids = MASQUEES_JUSQUEN_JANVIER;
  const caches = cfg.hiddenServices ?? [];
  const site = cfg.siteMasques?.services ?? [];
  const nCaches = phase === 'maintenant' ? [...caches, ...ids.filter((i) => !caches.includes(i))] : caches.filter((i) => !ids.includes(i));
  const nSite = phase === 'maintenant' ? [...site, ...ids.filter((i) => !site.includes(i))] : site.filter((i) => !ids.includes(i));
  if (egaux(nCaches, caches) && egaux(nSite, site)) return null;
  return { ...cfg, hiddenServices: nCaches, siteMasques: { ...(cfg.siteMasques ?? {}), services: nSite } };
}
