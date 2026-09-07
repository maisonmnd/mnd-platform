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
import { categoriesStore, servicesStore, removedServiceIds, type CatalogCategory, type Service } from './catalog';
import { prixSelonLesLocks } from './pricing';

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
  /* LA MARCHE, quand le geste s'allonge au-delà d'un comptage. */
  paliers?: { auDela: number; prixXof: number }[],
  /* RIEN D'AUTRE, ET C'EST VOULU. `kid()` ne fabrique que des GESTES : une
     venue, aucune composition. Un forfait s'écrit en toutes lettres, comme
     `FORFAIT_KIDS` et `FORFAIT_KIDS_NAISSANCE`, parce qu'il porte des semaines
     et une doctrine qu'un paramètre optionnel aurait laissé oublier — c'est
     ainsi qu'une création s'est retrouvée à contenir ses propres retouches. */
): Service => ({
  id,
  categoryId: CAT_KIDS,
  name,
  description: desc,
  priceXof,
  ...(barreXof ? { prixBarreXof: barreXof } : {}),
  ...(paliers ? { paliersDeLocks: paliers } : {}),
  durationMin,
  priceMode: 'fixe',
  reserveEnfants: true,
  palier: 'Fondation',
  hidePrice: false,
  sessions: 1,
  master: '',
  order: 0,
});

/** LES GESTES DE LA SECTION, un par Atelier plus le Plateau. */
export const SERVICES_KIDS: Service[] = [
  /* ══ ATELIER I — VÈKPÈ™ · la naissance ═══════════════════════════
     LA POSE SEULE, 120 000 F (« son tarif hors forfait », Yéman, 7 septembre).
     Elle ne contient rien : ses trois suites vivent dans
     `FORFAIT_KIDS_NAISSANCE`, qui la contient elle. Elle avait porté ses
     retouches elle-même pendant une heure, et l'écran du forfait a montré
     pourquoi cela ne tenait pas — voir le pack, plus bas. */
  kid('sv-kids-vekpe', 'VÈKPÈ™ Kids · La Première Couronne', 120_000, 150,
    '50 à 120 locks. Pose patiente, pauses prévues. Inclus : shampoing de préparation et styling de sortie.'),
  /* LA RETOUCHE POST CRÉATION — un geste neuf, plus léger que la reprise
     (arbitrage de Yéman). On ne reprend que ce qui a bougé depuis la pose :
     une couronne neuve se détend aux racines dans les premières semaines, et
     la rattraper tôt évite de tout refaire.

     ELLE NE PORTE PAS DE MARCHE À 250 LOCKS, contrairement à la reprise : elle
     ne parcourt pas toute la tête, seulement ce qui a lâché. */
  kid('sv-kids-retouche', 'SÍNSIN™ Kids · La Retouche Post Création', 10_000, 25,
    'On reprend ce qui a bougé depuis la pose, racine par racine, sans refaire toute la '
    + 'couronne. Comprise dans le PACK de naissance, aux semaines 2 et 4.'),
  /* ATELIER II — GBÈJÍ™ · la vie. Le tarif enfant EST le tarif : rien à barrer,
     et l'annoncer réduit ferait un geste imaginaire. */
  /* LA MARCHE EST SUR LA REPRISE — 7 septembre 2026.

     « Quand ce tarif apparaît, le contenu devrait changer à SÍNSIN Kids · La
     Reprise Essentielle 20 000 F pour que le calcul soit juste » (Yéman).

     C'EST ELLE QUI COÛTE LE TEMPS. Le shampoing et la sublimation se font en
     une demi-heure sur n'importe quelle petite tête ; c'est le resserrage lock
     par lock qui s'allonge quand la couronne en compte trois cents. La marche
     appartient donc à ce geste-là, et le forfait ne fait que la suivre.

     SANS ELLE, LE PACK SE CONTOURNE : les trois gestes pris séparément
     feraient 25 000 F là où le pack en demande 30 000, et personne ne
     prendrait plus jamais le pack sur une grande petite tête. */
  kid('sv-kids-sinsin', 'SÍNSIN™ Kids · La Reprise Essentielle', 15_000, 40,
    'Resserrage lock par lock sur une petite tête, contrôle d’uniformité, styling de sortie. 20 000 F au-delà de 250 locks.',
    undefined, [{ auDela: 250, prixXof: 20_000 }]),
  /* ══ ATELIERS III & IV — 7 septembre 2026 ════════════════════════
     « YÈKPÈ™ × GBÌGBÌ™ Kids, mets ce tarif à 15 000 F. Le PACK MND KIDS
     remplace YÈKPÈ × GBÌGBÌ avec GBÌGBÌ Kids. Que les prix et les remises du
     pack complet ne bougent pas » (Yéman).

     LES DEUX GESTES EN UN CESSENT D'ÊTRE LE CADEAU DU PACK. Ils se vendent à
     leur tarif, sans rien de barré : le tarif enfant EST le tarif, et annoncer
     une remise qu'on ne fait plus serait un geste imaginaire.

     C'EST LE RENFORT SEUL QUI ENTRE AU PACK, et lui qui porte le cadeau. Le
     pack ne bouge donc ni de prix ni de remise : 5 000 F rendus sur 15 000,
     comme la ligne qu'il remplace. */
  kid('sv-kids-yekpe', 'YÈKPÈ™ × GBÌGBÌ™ Kids · Sublimation & Renfort durable', 15_000, 35,
    'Brillance, parfum, anti-casse et fermeture de fibre. Les deux gestes en un, pour une petite couronne.'),
  kid('sv-kids-gbigbi', 'GBÌGBÌ™ Kids · Le Renfort durable', 5_000, 20,
    'Anti-casse et fermeture de fibre, pour une petite couronne. Compris dans le PACK MND KIDS.',
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
  /* LE NOM DIT QUE C'EST UN PACK — 4 septembre 2026 : « corrige le MND
     Kids le rituel complet en PACK MND KIDS Le rituel complet » (Yéman).
     Le mot « pack » se lit au comptoir comme à la maison : il annonce un
     ensemble, là où « le rituel complet » pouvait passer pour une
     prestation de plus dans la liste. */
  name: 'PACK MND KIDS · Le rituel complet',
  description: 'Le shampoing à moitié prix, la reprise essentielle, la sublimation et le renfort durable donnés pour un tiers. 40 000 F au tarif de la Maison, 25 000 F pour les petites têtes. Au-delà de 250 locks, la reprise demande plus de temps : 45 000 F au tarif, 30 000 F pour elles.',
  priceXof: 25_000,
  /* LA MARCHE DES GRANDES PETITES TÊTES — 7 septembre 2026.

     « Le rituel complet pour les Kids de 25 000 F fonctionne quand le kids a
     moins de 250 locks. Dans les cas où le kids a plus de locks, le rituel
     complet passe à 30 000 F » (Yéman).

     C'EST LA MÊME RAISON QUI AVAIT FAIT ÉCARTER LE CALIBRE, retournée : une
     tête d'enfant tient « dans une ou deux tranches », et voici la seconde. Le
     forfait garde son prix qui s'annonce au téléphone ; il en annonce deux au
     lieu d'un, pas une grille.

     UNE SEULE MARCHE, PAS UNE PENTE : au-delà de 250 locks, ce n'est plus une
     petite tête qu'on couronne en 85 minutes. */
  paliersDeLocks: [{ auDela: 250, prixXof: 30_000 }],
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
    /* LE RENFORT SEUL, depuis le 7 septembre : la Sublimation est repassée à
       son tarif et ne pouvait plus porter le cadeau du pack sans mentir. Le
       total ne bouge pas — 5 000 + 15 000 + 5 000 font les 25 000 annoncés. */
    { serviceId: 'sv-kids-gbigbi' },
  ],
};

/** ══ LE PACK DE NAISSANCE — 7 septembre 2026 ═════════════════════════

    « Rajoute le VÈKPÈ Kids dans le pack. Son tarif hors forfait est à
    120 000 F » (Yéman).

    LA CRÉATION EST REDEVENUE UN GESTE, ET LE PACK LA CONTIENT. Elle avait
    d'abord porté ses retouches elle-même (« 150 000 F, tout compris ») ; l'écran
    du forfait a montré pourquoi cela ne tenait pas : une prestation ne peut pas
    figurer dans sa propre composition, et le Catalogue lisait donc 35 000 F de
    contenu sous un prix de 150 000 — « Majoration · −329 % ». Un forfait dont la
    valeur affichée est trois fois inférieure à son prix ne se montre à personne.

    DEUX ARTICLES, ET CHACUN SON USAGE : la couronne seule pour qui ne veut que
    la pose, le pack pour qui prend la suite avec. C'est exactement ce que fait
    le catalogue adulte avec « VÈKPÈ™ × GBÈJÍ™ · La Naissance + Les 3 Premiers
    Entretiens ».

    LE PRIX NE BOUGE PAS : 150 000 F pour 155 000 F de gestes. Le geste de la
    Maison est modeste ici, et c'est un choix de Yéman — ce n'est pas une remise
    qu'on vend, c'est un chemin qu'on tient. */
export const FORFAIT_KIDS_NAISSANCE: Service = {
  id: 'sv-kids-naissance',
  categoryId: CAT_KIDS,
  name: 'PACK MND KIDS · La Première Couronne + Les 3 Premières Venues',
  description: 'La pose, puis les trois venues qui la tiennent : deux retouches post création '
    + 'à 2 et à 4 semaines, et une reprise essentielle à 8 semaines.',
  priceXof: 150_000,
  durationMin: 150,
  priceMode: 'fixe',
  reserveEnfants: true,
  palier: 'Fondation',
  hidePrice: false,
  /* UNE SEULE MÉCANIQUE DE SUITES — revue du 7 septembre 2026.

     Les trois venues qui suivent la pose sont ÉCRITES DANS LA CADENCE
     (`afterWeeks`), et c'est elle que le comptoir pose au carnet le jour de
     la pose. Y ajouter `sessions: 4` faisait tourner DEUX mécaniques sur le
     même rendez-vous : le carnet proposait encore « Poser la séance
     suivante », qui créait une seconde séance du pack entier, à 150 minutes,
     puis trois suites de plus depuis cette date — sept visites pour un pack
     de quatre. Ma Couronne dit déjà que « le juge est la cadence, pas
     sessions » (Cycle.tsx) ; le pack s'y conforme.

     CE QUE CELA CHANGE POUR MA COURONNE : le tunnel de réservation ne posera
     que la visite d'ouverture ; les suites se posent au comptoir. C'est un
     choix à revoir si les parents réservent ce pack en ligne. */
  sessions: 1,
  master: '',
  order: 0,
  /* ══ LES SEMAINES SONT ÉCRITES — 7 septembre 2026 ═══════════════
     « Remplir aussi les semaines » (Yéman).

     UN CHEMIN SANS DATES N'EST PAS UN CHEMIN. La description dit « à 2 et à
     4 semaines », mais c'est `afterWeeks` que le comptoir lit pour poser les
     rendez-vous : la phrase se lit, le nombre se pose. Écrites ici, les trois
     venues sortent du carnet toutes seules le jour de la pose.

     LA POSE NE PORTE PAS DE SEMAINE : absent vaut « le jour même » partout où
     la Maison lit ce champ, et l'éditeur du Catalogue efface un zéro à
     l'enregistrement. Écrire 0 ici aurait fait une fiche que l'écran ne peut
     pas reproduire, donc un bouton « à remettre au tarif » qui ne s'éteint
     jamais — et qui, cliqué, aurait écrasé ce que la Maison venait de
     corriger. */
  includes: [
    { serviceId: 'sv-kids-vekpe' },
    { serviceId: 'sv-kids-retouche', afterWeeks: 2 },
    { serviceId: 'sv-kids-retouche', afterWeeks: 4 },
    { serviceId: 'sv-kids-sinsin', afterWeeks: 8 },
  ],
};

/** TOUTE LA SECTION, dans l'ordre où elle se pose. Exportée pour que le
    harnais juge LA liste, pas une copie qui finirait par en différer. */
export const TOUT_KIDS = [...SERVICES_KIDS, FORFAIT_KIDS, FORFAIT_KIDS_NAISSANCE];

/** ══ CE QUE LA MAISON SUIT SUR UNE FICHE POSÉE — revue du 7 septembre ═══

    Le juge (« est-elle encore au tarif ? ») et le geste (« la remettre au
    tarif ») listaient chacun leurs champs, à la main, et les deux listes
    avaient divergé : `sessions` et `description` n'étaient ni comparés ni
    recopiés. Une couronne posée hier à 150 000 F et quatre venues serait
    passée à 120 000 F en gardant ses quatre venues, et le bouton aurait dit
    qu'il n'y avait plus rien à faire. UNE SEULE LISTE, et les deux en
    dérivent : ils ne peuvent plus se contredire.

    `includes` se compare sans ses zéros : l'éditeur du Catalogue efface un
    `afterWeeks: 0` à l'enregistrement, et « le jour même » s'écrit aussi bien
    par l'absence. Deux écritures, une notion. */
const CHAMPS_SUIVIS = [
  'name', 'priceXof', 'prixBarreXof', 'description', 'includes', 'paliersDeLocks',
  'sessions', 'durationMin',
] as const;

const inclusNormalises = (inc: Service['includes']) =>
  (inc ?? []).map((i) => ({
    ...(i.serviceId ? { serviceId: i.serviceId } : {}),
    ...(i.categoryId ? { categoryId: i.categoryId } : {}),
    ...(i.productId ? { productId: i.productId } : {}),
    ...(i.afterWeeks ? { afterWeeks: i.afterWeeks } : {}),
  }));

export const empreinteKids = (s: Service): string => JSON.stringify(CHAMPS_SUIVIS.map((k) => {
  if (k === 'includes') return inclusNormalises(s.includes);
  if (k === 'paliersDeLocks') return s.paliersDeLocks ?? [];
  if (k === 'prixBarreXof') return s.prixBarreXof ?? 0;
  if (k === 'sessions') return s.sessions ?? 1;
  return s[k] ?? null;
}));

/** La fiche posée, remise aux valeurs de la Maison — ET RIEN D'AUTRE. Ce que
    la Maison a ajouté elle-même sur la fiche (un maître, un ordre) reste. */
const remiseAuTarif = (posee: Service, voulue: Service): Service => ({
  ...posee,
  name: voulue.name,
  priceXof: voulue.priceXof,
  prixBarreXof: voulue.prixBarreXof,
  description: voulue.description,
  includes: voulue.includes?.map((i) => ({ ...i })),
  paliersDeLocks: voulue.paliersDeLocks?.map((x) => ({ ...x })),
  sessions: voulue.sessions,
  durationMin: voulue.durationMin,
});

/** Combien de gestes de la section manquent encore au catalogue. */
export const kidsAbsents = (
  services: readonly Service[],
  retires: ReadonlySet<string> = removedServiceIds(),
): number => {
  const connus = new Set(services.map((s) => s.id));
  /* UNE FICHE SUPPRIMÉE NE MANQUE PAS, ELLE A ÉTÉ ÉCARTÉE — 6 septembre 2026.
     Sans cela le bouton reparaissait sans fin pour reposer ce que la Maison
     venait de retirer. */
  return TOUT_KIDS.filter((s) => !retires.has(s.id) && !connus.has(s.id)).length;
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
  const retires = removedServiceIds();
  const neufs = TOUT_KIDS.filter((s) => !retires.has(s.id) && !connus.has(s.id));
  if (neufs.length === 0) return 0;
  servicesStore.set((prev) => [
    ...prev,
    ...neufs.map((s) => ({
      ...s,
      includes: s.includes?.map((i) => ({ ...i })),
      /* COPIÉE, PAS PARTAGÉE : posée par référence, la marche du magasin et
         celle de la constante auraient été le même objet, et une retouche en
         place de l'une aurait déplacé l'autre — le juge n'aurait plus rien vu. */
      paliersDeLocks: s.paliersDeLocks?.map((x) => ({ ...x })),
    })),
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

    UN FORFAIT NE MONTRAIT QUE SON TOTAL. « PACK MND KIDS · Le rituel complet ·
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

/** CE QUE LE FORFAIT CONTIENT, AU PRIX DE CETTE TÊTE-LÀ — 7 septembre 2026.

    « Quand ce tarif apparaît, le contenu devrait changer à SÍNSIN Kids 20 000 F
    pour que le calcul soit juste » (Yéman).

    UN FORFAIT TOMBE PILE, c'est tout son principe : 5 000 + 15 000 + 5 000 font
    les 25 000 F annoncés. Au-delà de 250 locks le pack passe à 30 000 F, et une
    composition lue au tarif de base affichait toujours 25 000 sous un total de
    30 000. Le parent fait l'addition — elle est écrite juste devant lui.

    SANS COMPTAGE, LES PRIX D'ANNONCE : l'aperçu du Catalogue n'a pas de tête
    sous la main, et montre ce qu'on dit au téléphone. */
export const compositionDuForfait = (
  forfait: Pick<Service, 'includes'>, catalogue: readonly Service[],
  lockCount?: number,
): LigneDuForfait[] =>
  (forfait.includes ?? [])
    .map((i) => catalogue.find((s) => s.id === i.serviceId))
    .filter((s): s is Service => !!s)
    .map((s) => {
      const prix = prixSelonLesLocks(s, lockCount) ?? s.priceXof;
      const barre = s.prixBarreXof && s.prixBarreXof > prix ? s.prixBarreXof : undefined;
      const gain = barre ? barre - prix : 0;
      return {
        serviceId: s.id, nom: s.name, prixXof: prix, barreXof: barre,
        gainXof: gain, pct: barre ? Math.round((gain / barre) * 100) : 0,
      };
    });

/** Ce que le forfait vaut au tarif de la Maison, et ce que la tête gagne.

    ══ LE PRIX RÉELLEMENT APPLIQUÉ — 7 septembre 2026 ══════════════════
    Le forfait ne vaut plus un seul prix : au-delà de 250 locks, le PACK Kids
    passe de 25 000 à 30 000 F. Lire ici `priceXof` annoncerait « 25 000 F pour
    les Kids, 15 000 F offerts » sous une ligne facturée 30 000 — c'est-à-dire
    un geste qui n'a pas été fait, écrit noir sur blanc devant le parent.

    ABSENT, ON RETOMBE SUR LE PRIX DE LA FICHE : les appelants qui n'ont pas de
    tête sous la main (l'aperçu du Catalogue) montrent le tarif d'annonce. */
export const gainDuForfait = (
  forfait: Pick<Service, 'includes' | 'priceXof'>, catalogue: readonly Service[],
  prixApplique?: number,
  /* LE COMPTAGE DE LA TÊTE : il décide du prix de chaque ligne, donc de ce que
     la Maison donne. Absent, les prix d'annonce. */
  lockCount?: number,
): { carteXof: number; prixXof: number; gainXof: number; pct: number } => {
  const lignes = compositionDuForfait(forfait, catalogue, lockCount);
  /* LE PRIX BARRÉ QUAND IL EXISTE, LE PRIX SINON : une ligne sans geste vaut
     ce qu'elle coûte, et la compter à zéro gonflerait le gain annoncé. */
  const carte = lignes.reduce((n, l) => n + (l.barreXof ?? l.prixXof), 0);
  const prix = prixApplique ?? forfait.priceXof;
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
  /* CE QUI A ÉTÉ SUPPRIMÉ NE SE REMET PAS AU TARIF : la fiche n'existe plus,
     et la ligne suivante ne la trouverait pas de toute façon. On l'écarte pour
     que le compte affiché au bouton dise la vérité. */
  const retires = removedServiceIds();
  const voulus = new Map(TOUT_KIDS.filter((s) => !retires.has(s.id)).map((s) => [s.id, s] as const));
  let touchees = 0;
  servicesStore.set((prev) => prev.map((s) => {
    const v = voulus.get(s.id);
    if (!v || empreinteKids(s) === empreinteKids(v)) return s;
    touchees += 1;
    return remiseAuTarif(s, v);
  }));
  return touchees;
}

/** Combien de prestations de la section ne sont plus aux tarifs de la Maison. */
export const kidsADepasser = (
  services: readonly Service[],
  retires: ReadonlySet<string> = removedServiceIds(),
): number => {
  const voulus = new Map(TOUT_KIDS.filter((s) => !retires.has(s.id)).map((s) => [s.id, s] as const));
  return services.filter((s) => {
    const v = voulus.get(s.id);
    return !!v && empreinteKids(s) !== empreinteKids(v);
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

/** À QUI CE FORFAIT S'ADRESSE — 4 septembre 2026.

    « Ayant filles et garçons en Kids, il faut écrire 25 000 F pour les Kids »
    (Yéman).

    « POUR ELLE » EST JUSTE AU COMPTOIR, ET FAUX SUR UNE PETITE TÊTE. La Maison
    coiffe des femmes : le mot est le bon partout ailleurs, et le remplacer
    partout appauvrirait ce qu'on dit à une cliente. Mais MND Kids reçoit des
    filles ET des garçons, et un papier qui parle d'« elle » à un père venu avec
    son fils se lit comme un papier fait pour quelqu'un d'autre.

    C'est la fiche qui décide, pas l'appelant : `reserveEnfants` est déjà la
    marque de la section, celle qui n'ouvre le catalogue qu'aux petites têtes. */
export const pourQui = (forfait: Pick<Service, 'reserveEnfants'>): string =>
  (forfait.reserveEnfants ? 'pour les Kids' : 'pour elle');

export const detailDuForfait = (
  forfait: Pick<Service, 'includes' | 'priceXof' | 'reserveEnfants'>,
  catalogue: readonly Service[] | ReadonlyMap<string, Service>,
  fmt: (x: number) => string,
  /* CE QUE LA LIGNE COÛTE VRAIMENT — voir `gainDuForfait`. Une pièce qui
     annonce un geste qu'elle n'a pas fait est pire qu'une pièce muette. */
  prixApplique?: number,
  lockCount?: number,
): string[] => {
  const cat = listeDuCatalogue(catalogue);
  const lignes = compositionDuForfait(forfait, cat, lockCount);
  if (lignes.length === 0) return [];
  const dites = lignes.map((l) => (l.barreXof
    ? `${l.nom} · ${fmt(l.prixXof)} au lieu de ${fmt(l.barreXof)}, ${l.pct} % offerts`
    : `${l.nom} · ${fmt(l.prixXof)}`));
  const g = gainDuForfait(forfait, cat, prixApplique, lockCount);
  /* LA DERNIÈRE LIGNE DIT LE GESTE ENTIER. Trois remises isolées se lisent
     comme trois détails ; leur somme se lit comme un accompagnement. */
  if (g.gainXof > 0) {
    dites.push(`${fmt(g.carteXof)} au tarif de la Maison, ${fmt(g.prixXof)} ${pourQui(forfait)}, ${fmt(g.gainXof)} offerts`);
  }
  return dites;
};
