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
  /* CE QUE LA PRESTATION VAUDRAIT AU TARIF DE LA MAISON. Absent = le tarif
     enfant EST le tarif, il n'y a pas de geste à montrer. */
  barreXof?: number,
): Service => ({
  id,
  categoryId: CAT_KIDS,
  name,
  description: desc,
  priceXof,
  ...(barreXof ? { prixBarreXof: barreXof } : {}),
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
  /* ATELIER II — GBÈJÍ™ · la vie. Le tarif enfant EST le tarif : rien à barrer,
     et l'annoncer réduit ferait un geste imaginaire. */
  kid('sv-kids-sinsin', 'SÍNSIN™ Kids · La Reprise Essentielle', 15_000, 40,
    'Resserrage lock par lock sur une petite tête, contrôle d’uniformité, styling de sortie.'),
  /* ATELIERS III & IV — YÈKPÈ™ × GBÌGBÌ™. Les deux gestes tiennent dans la même
     demi-heure sur une petite tête, et la Maison les donne pour un tiers de ce
     qu'ils valent : 15 000 F rendus 5 000. */
  kid('sv-kids-yekpe', 'YÈKPÈ™ × GBÌGBÌ™ Kids · Sublimation & Renfort durable', 5_000, 35,
    'Brillance, parfum, anti-casse et fermeture de fibre. Les deux gestes en un, pour une petite couronne.',
    15_000),
  /* LE PLATEAU — KLƆKLƆ™, à moitié prix. */
  kid('sv-kids-kloklo', 'KLƆKLƆ™ Kids · Le Shampoing « Le Souffle »', 5_000, 30,
    'Lavage doux, démêlage patient, séchage léger.', 10_000),
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
  description: 'Le shampoing à moitié prix, la reprise essentielle, la sublimation et le renfort durable donnés pour un tiers. 40 000 F au tarif de la Maison, 25 000 F pour les petites têtes.',
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
    { serviceId: 'sv-kids-sinsin' },
    { serviceId: 'sv-kids-yekpe' },
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

/** LE CATALOGUE D'UNE TÊTE — 3 septembre 2026.

    « Quand je veux prendre RDV pour un enfant, n'ouvrir que le catalogue MND
    Kids dans la modale de RDV » (Yéman).

    LA PORTE NE SUFFISAIT PAS. `reserveEnfants` retire la section aux adultes ;
    l'enfant, lui, voyait encore TOUT le catalogue, MND Kids noyé au milieu de
    trente rituels dont aucun n'est pour lui. Le maître devait le retrouver, et
    rien n'empêchait de lui poser un GBÌGBÌ™ Profond à 120 000 F.

    UNE TÊTE D'ENFANT NE VOIT QUE MND KIDS. C'est la règle, et elle se lit dans
    les deux sens : l'adulte ne voit pas les Kids, l'enfant ne voit qu'eux.

    DEUX GARDES, ET ILS COMPTENT AUTANT QUE LA RÈGLE :
    · un âge INCONNU ne restreint rien. On ne sait pas, donc on ne retire rien :
      cacher le catalogue entier à une tête dont la fiche n'a pas de date de
      naissance serait la faute la plus coûteuse de toutes.
    · une section PAS ENCORE POSÉE ne restreint rien non plus. Sans elle,
      l'enfant se retrouverait devant une liste vide, et l'écran aurait l'air
      cassé au lieu d'être seulement incomplet. */
export const catalogueDeLaTete = <T extends { reserveEnfants?: boolean }>(
  services: readonly T[], kids: 'oui' | 'non' | 'inconnu',
): T[] => {
  if (kids !== 'oui') return [...services];
  const siens = services.filter((s) => s.reserveEnfants);
  return siens.length > 0 ? siens : [...services];
};

/** CE QUE LE FORFAIT CONTIENT, ET CE QU'IL DONNE — 4 septembre 2026.

    « J'aurais voulu que les parents voient qu'on les accompagne vraiment avec
    nos tarifs. J'aurais voulu avoir ce qui est inclus dans le service »
    (Yéman).

    UN FORFAIT NE MONTRAIT QUE SON TOTAL. « MND Kids · Le Rituel Complet ·
    25 000 F » ne dit ni ce qu'on reçoit, ni ce que la Maison donne : le parent
    lit un prix, pas un geste. Or c'est exactement le geste qu'il faut voir.

    LE PRIX BARRÉ NE SERT QU'À DIRE, jamais à compter : le total du forfait
    reste celui du forfait, et rien ici ne touche à la caisse. */
export type LigneDuForfait = {
  serviceId: string;
  nom: string;
  prixXof: number;
  /** Ce que la prestation vaudrait au tarif de la Maison. */
  barreXof?: number;
  gainXof: number;
  pct: number;
};

export const compositionDuForfait = (
  forfait: Pick<Service, 'includes'>, catalogue: readonly Service[],
): LigneDuForfait[] =>
  (forfait.includes ?? [])
    .map((i) => catalogue.find((s) => s.id === i.serviceId))
    .filter((s): s is Service => !!s)
    .map((s) => {
      const barre = s.prixBarreXof && s.prixBarreXof > s.priceXof ? s.prixBarreXof : undefined;
      const gain = barre ? barre - s.priceXof : 0;
      return {
        serviceId: s.id, nom: s.name, prixXof: s.priceXof, barreXof: barre,
        gainXof: gain, pct: barre ? Math.round((gain / barre) * 100) : 0,
      };
    });

/** Ce que le forfait vaut au tarif de la Maison, et ce que la tête gagne. */
export const gainDuForfait = (
  forfait: Pick<Service, 'includes' | 'priceXof'>, catalogue: readonly Service[],
): { carteXof: number; prixXof: number; gainXof: number; pct: number } => {
  const lignes = compositionDuForfait(forfait, catalogue);
  /* LE PRIX BARRÉ QUAND IL EXISTE, LE PRIX SINON : une ligne sans geste vaut
     ce qu'elle coûte, et la compter à zéro gonflerait le gain annoncé. */
  const carte = lignes.reduce((n, l) => n + (l.barreXof ?? l.prixXof), 0);
  const prix = forfait.priceXof;
  const gain = Math.max(0, carte - prix);
  return { carteXof: carte, prixXof: prix, gainXof: gain, pct: carte > 0 ? Math.round((gain / carte) * 100) : 0 };
};

/** LA SECTION A CHANGÉ DE TARIFS — le geste qui met à jour ce qui est posé.

    ON NE RÉÉCRIT JAMAIS CE QUI EXISTE, sauf quand la Maison le demande. Les
    prix des Kids ont été décidés le 4 septembre après une première pose : sans
    ce geste, il faudrait rouvrir six fiches à la main, et une seule oubliée
    ferait un forfait qui ne tombe plus sur son total. Il ne touche QUE les
    prestations de la section, jamais le reste du catalogue. */
export function metAJourLaSectionKids(): number {
  const voulus = new Map(TOUT_KIDS.map((s) => [s.id, s] as const));
  let touchees = 0;
  servicesStore.set((prev) => prev.map((s) => {
    const v = voulus.get(s.id);
    if (!v) return s;
    const pareil = s.priceXof === v.priceXof
      && (s.prixBarreXof ?? 0) === (v.prixBarreXof ?? 0)
      && s.name === v.name
      && JSON.stringify(s.includes ?? []) === JSON.stringify(v.includes ?? []);
    if (pareil) return s;
    touchees += 1;
    return { ...s, name: v.name, priceXof: v.priceXof, description: v.description,
      prixBarreXof: v.prixBarreXof, includes: v.includes?.map((i) => ({ ...i })) };
  }));
  return touchees;
}

/** Combien de prestations de la section ne sont plus aux tarifs de la Maison. */
export const kidsADepasser = (services: readonly Service[]): number => {
  const voulus = new Map(TOUT_KIDS.map((s) => [s.id, s] as const));
  return services.filter((s) => {
    const v = voulus.get(s.id);
    if (!v) return false;
    return s.priceXof !== v.priceXof || (s.prixBarreXof ?? 0) !== (v.prixBarreXof ?? 0)
      || s.name !== v.name || JSON.stringify(s.includes ?? []) !== JSON.stringify(v.includes ?? []);
  }).length;
};

/** LE CONTENU D'UN FORFAIT, ÉCRIT UNE FOIS, LU PARTOUT — 4 septembre 2026.

    « Il faut traduire et sur le RDV et sur la facture » (Yéman).

    LE RENDEZ-VOUS ET LA PIÈCE DOIVENT DIRE EXACTEMENT LA MÊME CHOSE. Deux
    formulations du même geste finiraient par se contredire, et c'est devant le
    parent que cela se verrait.

    AVEC LES PRIX, CONTRAIREMENT À UN ABONNEMENT. Le détail d'un abonnement se
    tait sur les montants parce que sa somme ne tombe pas sur son total, c'est
    tout le principe. Un forfait, lui, tombe pile : 5 000 + 15 000 + 5 000 font
    les 25 000 F annoncés. Le chiffrer ne contredit donc rien, et c'est là que
    se lit ce que la Maison donne. */
const listeDuCatalogue = (
  c: readonly Service[] | ReadonlyMap<string, Service>,
): readonly Service[] => (Array.isArray(c) ? c : [...(c as ReadonlyMap<string, Service>).values()]);

export const detailDuForfait = (
  forfait: Pick<Service, 'includes' | 'priceXof'>,
  catalogue: readonly Service[] | ReadonlyMap<string, Service>,
  fmt: (x: number) => string,
): string[] => {
  const cat = listeDuCatalogue(catalogue);
  const lignes = compositionDuForfait(forfait, cat);
  if (lignes.length === 0) return [];
  const dites = lignes.map((l) => (l.barreXof
    ? `${l.nom} · ${fmt(l.prixXof)} au lieu de ${fmt(l.barreXof)}, ${l.pct} % offerts`
    : `${l.nom} · ${fmt(l.prixXof)}`));
  const g = gainDuForfait(forfait, cat);
  /* LA DERNIÈRE LIGNE DIT LE GESTE ENTIER. Trois remises isolées se lisent
     comme trois détails ; leur somme se lit comme un accompagnement. */
  if (g.gainXof > 0) {
    dites.push(`${fmt(g.carteXof)} au tarif de la Maison, ${fmt(g.prixXof)} pour elle, ${fmt(g.gainXof)} offerts`);
  }
  return dites;
};
