/* ══ MND KIDS — 3 septembre 2026 ══════════════════════════════════════
   « Dans les foyers, j'ai des enfants. J'aimerais une section de service
   shampoing retenue pour les MND Kids, où le total ne revient pas à plus de
   25 000 avec un peu de sublimation, renfort durable. Fais-moi un forfait. »
   Puis : « Rajoute le SÍNSIN Kids et le VÈKPÈ Kids, donc le Kids dans les
   4 ateliers » (Yéman).

   LE TARIF ADULTE NE POUVAIT PAS TENIR. Au catalogue, le plus léger des lavages
   commence à 8 000 F et le renfort à 22 000 F : 30 000 F avant même la
   sublimation. Remiser un rituel adulte pour un enfant ferait porter la baisse
   à des prestations vendues plein tarif le reste du temps, et la Maison ne
   saurait plus ce que vaut son propre catalogue. Une tête d'enfant, c'est moins
   de locks, moins de matière et moins de fauteuil : ce sont des prestations à
   elles, avec leurs prix, leurs durées, et une porte qui ne s'ouvre que pour
   elles (`reserveEnfants`).

   LES PRIX SONT CEUX DE LA MAISON, validés le 3 septembre 2026. Ils ne se
   devinent pas : la section ne se pose qu'au geste du souverain, jamais toute
   seule au démarrage. */
import { categoriesStore, servicesStore, type CatalogCategory, type Service } from './catalog';

/** La catégorie qui porte la section. Elle vit à la racine du catalogue, à
    côté des Ateliers : MND Kids TRAVERSE les quatre, elle n'est sous aucun. */
export const CAT_KIDS = 'cat-mnd-kids';

const KIDS_CATEGORIE: CatalogCategory = {
  id: CAT_KIDS,
  fon: 'MND Kids',
  label: 'les petites tetes couronnees',
  enabled: true,
  order: 900,
  code: 'KID',
};

/** LE PRIX FERME PLUTÔT QUE LE CALIBRE — décision du 3 septembre 2026.

    Chez les grandes, la création va de 80 000 à 660 000 F et la reprise de
    20 000 à 90 000 F selon la tranche. Chez les enfants, la tête tient dans une
    ou deux tranches : un prix ferme se lit, s'annonce au téléphone et ne se
    discute pas. Il se change au Catalogue comme n'importe quel autre. */
const kid = (
  id: string, name: string, priceXof: number, durationMin: number, desc: string,
): Service => ({
  id,
  categoryId: CAT_KIDS,
  name,
  description: desc,
  priceXof,
  durationMin,
  priceMode: 'fixe',
  reserveEnfants: true,
  palier: 'Fondation',
  hidePrice: false,
  sessions: 1,
  master: '',
  order: 0,
});

/** LES CINQ GESTES DE LA SECTION, un par Atelier plus le Plateau. */
export const SERVICES_KIDS: Service[] = [
  /* ATELIER I — VÈKPÈ™ · la naissance */
  kid('sv-kids-vekpe', 'VÈKPÈ™ Kids · La Première Couronne', 55_000, 150,
    '50 à 120 locks. Pose patiente, pauses prévues. Inclus : shampoing de préparation et styling de sortie.'),
  /* ATELIER II — GBÈJÍ™ · la vie */
  kid('sv-kids-sinsin', 'SÍNSIN™ Kids · La Reprise', 15_000, 40,
    'Resserrage lock par lock sur une petite tête, contrôle d’uniformité, styling de sortie.'),
  /* ATELIER III — YÈKPÈ™ · la lumière */
  kid('sv-kids-yekpe', 'YÈKPÈ™ Kids · Un peu de sublimation', 8_000, 20,
    'Brillance et parfum, sans transformation ni couleur. Le geste qui fait sourire au miroir.'),
  /* ATELIER IV — FÍNFÍN™ · la renaissance */
  kid('sv-kids-gbigbi', 'GBÌGBÌ™ Kids · Renfort durable', 13_000, 35,
    'Anti-casse, fermeture de fibre. La version enfant du reconstituant.'),
  /* LE PLATEAU — KLƆKLƆ™ */
  kid('sv-kids-kloklo', 'KLƆKLƆ™ Kids · Le Shampoing', 9_000, 30,
    'Lavage doux, démêlage patient, séchage léger.'),
];

/** LE FORFAIT — 25 000 F, et le plafond ne bouge pas.

    IL NE PORTE QUE L'ENTRETIEN. La création se pose une fois, la reprise revient
    toutes les six semaines : les mettre au même paquet ferait payer d'avance ce
    qui ne se consomme pas ensemble. Elles se vendent à leur prix, dans leur
    Atelier.

    PRIX FERME, PAS UNE REMISE EN POURCENTAGE. `forfaitRemisePct` recalculerait
    le forfait au prix de la tête et le ferait varier ; 25 000 F est un plafond
    décidé, pas un résultat de calcul. */
export const FORFAIT_KIDS: Service = {
  id: 'sv-kids-rituel',
  categoryId: CAT_KIDS,
  name: 'MND Kids · Le Rituel Complet',
  description: 'Le shampoing, un peu de sublimation et le renfort durable, en un seul rituel. 30 000 F à la carte, 25 000 F au forfait.',
  priceXof: 25_000,
  durationMin: 85,
  priceMode: 'fixe',
  reserveEnfants: true,
  palier: 'Fondation',
  hidePrice: false,
  sessions: 1,
  master: '',
  order: 0,
  /* LA COMPOSITION SE LIT EN TROIS LIGNES, une par geste. `ServiceInclus` ne
     porte pas de quantite : un forfait se compose de prestations, pas de
     jetons — c'est l'abonnement qui compte les passages. */
  includes: [
    { serviceId: 'sv-kids-kloklo' },
    { serviceId: 'sv-kids-yekpe' },
    { serviceId: 'sv-kids-gbigbi' },
  ],
};

const TOUT_KIDS = [...SERVICES_KIDS, FORFAIT_KIDS];

/** Combien de gestes de la section manquent encore au catalogue. */
export const kidsAbsents = (services: readonly Service[]): number => {
  const connus = new Set(services.map((s) => s.id));
  return TOUT_KIDS.filter((s) => !connus.has(s.id)).length;
};

/** POSER LA SECTION, une fois. Rend le nombre de gestes ajoutés.

    ON NE RÉÉCRIT JAMAIS CE QUI EXISTE. Le souverain a pu renommer une
    prestation, changer son prix, la ranger ailleurs : repasser dessus
    effacerait sa décision, et c'est le genre de perte qu'on ne remarque
    qu'au moment de facturer. */
export function poseLaSectionKids(): number {
  const cats = categoriesStore.get();
  if (!cats.some((c) => c.id === CAT_KIDS)) {
    categoriesStore.set((prev) => [...prev, { ...KIDS_CATEGORIE }]);
  }
  const connus = new Set(servicesStore.get().map((s) => s.id));
  const neufs = TOUT_KIDS.filter((s) => !connus.has(s.id));
  if (neufs.length === 0) return 0;
  servicesStore.set((prev) => [
    ...prev,
    ...neufs.map((s) => ({ ...s, includes: s.includes?.map((i) => ({ ...i })) })),
  ]);
  return neufs.length;
}
