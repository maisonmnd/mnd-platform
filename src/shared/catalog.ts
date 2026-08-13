import { createStore, useStore, HOUSE_BLANK } from './store';

/* Catalogue — double nomenclature fon™ de la maison.
   Chaque catégorie porte un nom fon (marque déposée) + un descripteur français.
   La visibilité front (Vitrine / Ma Couronne) respecte `enabled` + vitrineConfig. */

/** Les deux maisons de l'arborescence v6. Une catégorie SANS maison est du
    PLATEAU TECHNIQUE : « une même ligne, deux origines de vente » (règle 5) —
    un DÀNDÀN™ se vend aussi bien après un rituel de locks qu'après une pose Studio.
    Le catalogue du Trône est commun à toute la Maison (voir 0001_init.sql) : c'est
    donc ce champ, et non la branche, qui sépare les deux maisons à l'écran. */
export type Maison = 'atelier' | 'studio';

export const MAISONS: { k: Maison; fon: string; label: string }[] = [
  { k: 'atelier', fon: 'ATELIER MND™', label: 'Les locks exclusivement' },
  { k: 'studio', fon: 'STUDIO MND · ACƆ™', label: 'Le cheveu afro dans tous ses styles' },
];

export type CatalogCategory = {
  id: string;
  fon: string; // VÈKPÈ™, SÍNSIN™…
  label: string; // descripteur français
  enabled: boolean; // visible côté front (Vitrine / Ma Couronne)
  order: number;
  /** Maison d'appartenance. Absent = plateau technique, commun aux deux. */
  maison?: Maison;
  /** Code ERP de l'atelier ou de l'axe — `ATL·I`, `PLT·05`, `STU·A`. */
  code?: string;
  /** L'ATELIER AUQUEL CETTE SOUS-CATEGORIE APPARTIENT.

      Un atelier se compose de familles de rituels : GBEJI porte les SINSIN
      (reprises de racines), les KLOKLO (shampoings), les DANDAN (soins
      signature). Ces familles n'existaient que dans les noms — c'est le prefixe
      qui faisait office de regroupement, sans que rien ne le sache.

      Absent = c'est un atelier, une racine. Present = c'est une famille rangee
      sous lui. Tout ce qui lit la maison, le bareme ou le calibre d'une
      prestation doit REMONTER a la racine : ces reglages appartiennent a
      l'atelier, pas a la famille. Voir `racineOf`. */
  parentId?: string;

  /** Une LIGNE DE PRODUITS — une collection au comptoir, pas un atelier.
      Elle vit dans le meme magasin que les ateliers : meme ecran Catalogue,
      meme code, meme ordre. Seul ce drapeau dit qu'elle se remplit de produits
      et non de rituels, et qu'elle a sa place a l'ecran Produits. */
  produits?: boolean;
};

/** Les catégories d'une maison : les siennes ET le plateau, qui n'appartient à
    aucune des deux mais se vend depuis les deux.

    La maison se lit sur l'ATELIER : une famille rangée sous lui n'en porte pas
    et la tiendrait pour absente — elle passerait pour du plateau, donc visible
    depuis les deux maisons. */
export const categoriesOfMaison = (cats: CatalogCategory[], m: Maison): CatalogCategory[] =>
  cats.filter((c) => {
    const maison = racineOf(cats, c.id)?.maison;
    return maison === m || !maison;
  });

/** Comment le prix d'une prestation est annoncé :
    · fixe     — un prix ferme, facturé tel quel ;
    · variable — un prix DE DÉPART (« à partir de »), le montant réel se fixe au fauteuil ;
    · devis    — aucun prix affiché (« sur devis »), donné au cas par cas.
    `hidePrice` (ancien booléen) est conservé et reste synchronisé avec `devis`
    pour ne rien casser du front / de la caisse ; `priceModeOf` fait le pont. */
export type PriceMode = 'fixe' | 'variable' | 'devis';

/** LES TROIS LONGUEURS. Un axe de prix distinct du calibre : le calibre compte
    les locks, la longueur mesure ce qui pend. Une tête Micro peut être courte,
    une tête Jumbo très longue — les deux se croisent, aucune ne remplace l'autre. */
export type LongueurId = 'court' | 'mi-long' | 'long';
export const LONGUEURS: { id: LongueurId; label: string; hint: string }[] = [
  { id: 'court', label: 'Court', hint: 'jusqu’aux épaules' },
  { id: 'mi-long', label: 'Mi-Long', hint: 'des épaules aux omoplates' },
  { id: 'long', label: 'Long ou haute densité', hint: 'au-delà des omoplates' },
];
export const longueurLabel = (id: LongueurId | undefined): string =>
  LONGUEURS.find((l) => l.id === id)?.label ?? '—';
/** La prestation se facture-t-elle à la longueur ? Vrai dès qu'un prix est saisi. */
export const suitLongueur = (sv: Pick<Service, 'prixParLongueur'>): boolean =>
  Object.values(sv.prixParLongueur ?? {}).some((v) => typeof v === 'number');

export type Service = {
  id: string;
  categoryId: string;
  name: string;
  palier: 'Fondation' | 'Élévation' | 'Souveraineté';
  priceXof: number;
  hidePrice: boolean;
  priceMode?: PriceMode; // défaut dérivé de hidePrice (voir priceModeOf)
  sessions: number; // nombre de séances
  /** TARIF AU LOCK — le prix se compte lock par lock : `lockCount × ratePerLock`.
      SANS plancher ni plafond : vérifié sur les rendez-vous de l'ancien ERP, où
      335 locks se facturent 33 500 F et 455 locks 500 500 F, très au-delà du prix
      « affiché ». Repris tel quel — SÍNSIN à 100 F/lock, VÈKPÈ à 1 100 F/lock.
      Le barème par tranches (`mnd_model_bands`) ne sait pas faire ça : il rend un
      prix CONSTANT à l'intérieur d'une tranche, ce qui écarterait jusqu'à 110 000 F
      sur une création. Quand ce champ est posé, il PRIME sur le coefficient de
      tranche ; le Juste Prix de la cliente s'applique ensuite, comme partout. */
  ratePerLock?: number;
  /** Qui commande le prix : le comptage ou la tranche. Voir TarifMode. */
  tarifMode?: TarifMode;
  /** Prestations reellement couvertes par ce forfait. Voir ServiceInclus. */
  includes?: ServiceInclus[];
  /** REMISE DU FORFAIT, en pourcentage de sa composition.

      Un forfait a prix fixe fait payer la meme somme a toutes : une tete Jumbo
      et une tete Nano recoivent des valeurs du simple au double pour le meme
      montant, et l'economie reelle varie sans que rien ne le dise. Avec ce
      champ, le forfait vaut la somme de ses prestations AU PRIX DE LA CLIENTE,
      moins ce pourcentage — chaque tete a son montant exact, et la marge de la
      Maison reste constante.

      Absent : le forfait garde son prix annonce, comme avant. */
  forfaitRemisePct?: number;
  /** PLANCHER PAR CALIBRE — le prix au lock ne descend jamais sous le tarif du
      calibre. Clé = identifiant de tranche (`cal-jumbo`, `cal-mini`…), valeur =
      prix ferme en F CFA. Sans plancher, un Jumbo à 60 locks tomberait à 6 000 F
      là où le tarif de la Maison est de 20 000 F : le temps de fauteuil ne suit
      pas le nombre de locks aussi bas. Absent = aucun plancher. */
  priceFloors?: Record<string, number>;
  /** PRIX PAR LONGUEUR — un même soin, trois prix selon la longueur travaillée.

      LA LONGUEUR N'EST PAS LE CALIBRE. Le calibre se constate une fois au KÒKÒ™
      et ne bouge plus ; la longueur pousse de mois en mois. Elle ne peut donc
      pas vivre sur la fiche cliente sans vieillir — elle se choisit au moment de
      la réservation, et se fige sur le rendez-vous avec le prix.

      Avant ce champ, chaque soin existait en trois prestations — Court, Mi-Long,
      Long — soit dix-huit lignes pour trois soins. Renommer un soin voulait dire
      le renommer trois fois, et le Catalogue ne montrait plus ce que la Maison
      propose : il montrait sa grille tarifaire.

      Clé = identifiant de longueur, valeur = prix ferme en F CFA. Un prix saisi
      sort au franc près : tant que ni le modèle ni le Juste Prix ne le modulent,
      il n'est pas arrondi. Absent = la prestation a un prix unique. */
  prixParLongueur?: Partial<Record<LongueurId, number>>;
  /** DURÉE PAR LONGUEUR, en minutes. Les trois variantes qu'on remplace
      n'annonçaient pas seulement trois prix mais trois durées — 45 min, 1 h 10,
      1 h 30. Sans ce champ, réserver un soin Long aurait bloqué le fauteuil
      45 minutes et l'agenda aurait débordé sur le rituel suivant.
      Absent pour une longueur = `durationMin`, la durée annoncée. */
  dureeParLongueur?: Partial<Record<LongueurId, number>>;
  /** CALIBRE PROPRE — la prestation n'existe QUE dans cette tranche. Un VÈKPÈ™
      Jumbo, c'est 50 à 100 locks : au-delà, ce n'est pas « plus cher », ça
      n'existe pas. Le nombre de locks de la cliente CHOISIT la création ; il ne
      multiplie pas un prix. Absent = la prestation sert tous les calibres. */
  bandId?: string;
  /** CALIBRES SERVIS, au pluriel — le forfait GBÈJÍ™ Fidélité n'existe que
      pour les têtes Micro et Nano. `bandId` (singulier) reste pour les
      créations à calibre unique ; quand cette liste est posée, c'est elle qui
      fait foi. */
  bandIds?: string[];
  /** LA PRESTATION S'OUVRE À PARTIR DE LA Nᵉ VENUE (honorée, jours distincts).
      `desVenue: 3` = les deux premières visites paient le plein tarif, le
      forfait paraît à la 3ᵉ — récompense de la constance (GBÈJÍ™ Fidélité,
      11 août 2026). Absent = ouverte à toutes, comme toujours. Le compteur est
      `venuesHonorees`, le même que la marque de passage et le Cercle. */
  desVenue?: number;
  /** Borne haute d'AFFICHAGE seulement — « de 15 000 à 25 000 F ». N'entre dans
      aucun calcul : `priceXof` porte la borne basse, `ratePerLock` fait le prix. */
  priceToXof?: number;
  /** Code ERP de l'arborescence v6 — `ATL·II·MIN·E`, `PLT·05·SIG`, `STU·A·NUA·F`.
      Codage MAISON·CATÉGORIE·VARIANTE : c'est lui qu'on lit sur une facture et
      qu'on cherche à la caisse, jamais l'identifiant technique. */
  code?: string;
  /** Durée haute quand la prestation en annonce une fourchette (« 3h à 4h30 ») ;
      `durationMin` porte alors la borne basse. Absent = durée ferme. */
  durationMaxMin?: number;
  master: string; // maître assigné
  durationMin: number;
  order: number;
  description?: string;
  /** Marqueur de réécriture des descriptions signées (migration ponctuelle) —
      une fois posé, la migration ne retouche plus la prestation. */
  descRev?: number;
  /** La prestation suit-elle le MODÈLE de la cliente (barème par tranches de
      locks — voir shared/pricing.ts) ? Absent = défaut dérivé (entretien/soins). */
  scalesWithModel?: boolean;
  /** Couverture des quatre temps : Purifier · Nourrir · Sceller · Couronner (1 = couvert). */
  temps?: number[];
};

export const PRICE_MODES: { k: PriceMode; label: string; hint: string }[] = [
  { k: 'fixe', label: 'Fixe', hint: 'un prix ferme' },
  { k: 'variable', label: 'Variable', hint: 'à partir de ce prix' },
  { k: 'devis', label: 'Sur devis', hint: 'prix donné au cas par cas' },
];

/** Mode de prix effectif — dérive des anciennes données (hidePrice) si non renseigné. */
export const priceModeOf = (s: { priceMode?: PriceMode; hidePrice?: boolean }): PriceMode =>
  s.priceMode ?? (s.hidePrice ? 'devis' : 'fixe');

/** L'ORDRE DU CATALOGUE, l'arbre mis à plat (12 août) : les ateliers par leur
    `order`, chacun aussitôt suivi de ses FAMILLES (mêmes règles, récursif).
    Le tri à plat sur `order` séparait une famille de son atelier — les
    flèches du Catalogue déplaçaient le parent, les enfants restaient. UN
    juge pour la modale RDV, la Caisse et le tunnel Ma Couronne. Une
    catégorie au parent inconnu (arbre cassé) ne disparaît pas : elle ferme
    la marche. */
/** LES QUATRE MONDES du catalogue — mêmes règles que l'écran Catalogue
    (`groupeDe`) : la maison est celle de la RACINE, jamais de la famille ;
    une racine `aca-…` est l'Académie ; sans maison, c'est le plateau. */
export type Monde = 'atelier' | 'plateau' | 'studio' | 'academie';

export const mondeDeCat = (
  /* Seuls id, parentId et maison servent au juge — la signature le dit, pour
     que le moteur tarifaire (qui ne porte que cette coupe) puisse le lire. */
  c: Pick<CatalogCategory, 'id' | 'parentId' | 'maison'>,
  cats: readonly Pick<CatalogCategory, 'id' | 'parentId' | 'maison'>[],
): Monde => {
  let cur = c;
  for (let i = 0; cur.parentId && i < 8; i += 1) {
    const p = cats.find((x) => x.id === cur.parentId);
    if (!p) break;
    cur = p;
  }
  if (cur.maison === 'atelier') return 'atelier';
  if (cur.maison === 'studio') return 'studio';
  if (cur.id.startsWith('aca-')) return 'academie';
  return 'plateau';
};

/** LE RANG DES MONDES à l'affichage : l'Atelier ouvre, le plateau relie, le
    Studio suit, l'Académie ferme (doctrine v6). */
export const rangMonde = (m: Monde): number =>
  (m === 'atelier' ? 0 : m === 'plateau' ? 1 : m === 'studio' ? 2 : 3);

/** Le nom du monde, en toutes lettres — pour les séparateurs des listes. */
export const mondeLabel = (m: Monde): string =>
  m === 'atelier' ? 'ATELIER MND™'
    : m === 'studio' ? 'STUDIO MND · ACƆ™'
      : m === 'academie' ? 'MND ACADÉMIE'
        : 'LE PLATEAU TECHNIQUE · commun aux deux maisons';

export const catsDansLOrdre = (cats: CatalogCategory[]): CatalogCategory[] => {
  /* LES MONDES NE SE MÉLANGENT PAS (12 août) : les racines se rangent
     d'abord par maison — Atelier, plateau, Studio — puis par leur ordre.
     Sans cela, une flèche du Catalogue pouvait glisser un atelier au milieu
     du Studio, et « où s'arrête l'Atelier ? » n'avait plus de réponse. */
  const enfants = (pid: string | null): CatalogCategory[] =>
    cats.filter((c) => (c.parentId ?? null) === pid).sort((a, b) => a.order - b.order);
  const racines = [...enfants(null)].sort((a, b) =>
    (rangMonde(mondeDeCat(a, cats)) - rangMonde(mondeDeCat(b, cats))) || (a.order - b.order));
  const out: CatalogCategory[] = [];
  const pousse = (c: CatalogCategory, prof: number): void => {
    if (prof > 8) return;
    out.push(c);
    for (const e of enfants(c.id)) pousse(e, prof + 1);
  };
  for (const racine of racines) pousse(racine, 0);
  for (const c of cats) if (!out.includes(c)) out.push(c);
  return out;
};

/** SEUIL DE REASSORT — un seul pour toute la Maison. Trois ecrans en avaient
    trois differents (3 aux Produits, 8 au Catalogue, 10 au Tableau de bord et
    aux notifications) : l'ecran Produits annoncait 5 references a reassortir
    pendant que le Tableau de bord en annoncait 13. Volontairement bas : une
    alerte qui se declenche tout le temps n'est plus une alerte. */
/** QUI COMMANDE LE PRIX d'une prestation qui porte a la fois un tarif au lock
    et des planchers par calibre.

      'lock'    — le comptage commande : prix = locks x tarif, le plancher n'est
                  qu'un filet de securite si le compte est tres bas.
      'calibre' — la tranche commande : le plancher du calibre EST le prix, le
                  tarif au lock est conserve mais mis en sommeil.

    Absent : 'lock' si la prestation porte un tarif, 'calibre' sinon — le
    comportement d'avant l'interrupteur, pour que rien ne bouge tout seul.

    Ce choix se fait au Catalogue, prestation par prestation : selon le geste,
    l'un ou l'autre est juste. Un resserrage se facture volontiers a la tranche ;
    une creation suit le comptage de pres. */
export type TarifMode = 'lock' | 'calibre';

/** UNE PRESTATION INCLUSE DANS UN FORFAIT.

    Les forfaits n'etaient que du texte : « La Naissance + Les 3 Premiers
    Entretiens » decrivait quatre gestes sans qu'aucun n'existe pour
    l'application. Impossible de savoir ce qui restait du, ni de compter ces
    gestes dans les statistiques, ni de poser les rendez-vous de suivi.

    Chaque ligne nomme une VRAIE prestation du catalogue et dit quand elle est
    due : `afterWeeks: 0` (ou absent) = pendant la meme visite ; au-dela, c'est
    un rendez-vous a poser au carnet a cette echeance. */
export type ServiceInclus = {
  /** La prestation exacte. Vide si la ligne designe un atelier (voir categoryId). */
  serviceId: string;
  /** UN ATELIER PLUTOT QU'UNE PRESTATION — « la creation VEKPE du calibre de la
      cliente ». Les creations existent en cinq versions, une par calibre : sans
      cela il aurait fallu cinq forfaits identiques, un par densite, et changer
      un prix aurait voulu dire le changer cinq fois. La prestation reelle se
      resout a la reservation, d'apres le modele inscrit sur la fiche. */
  categoryId?: string;
  /** UN PRODUIT DE LA GAMME inclus dans le forfait — le flacon remis avec la
      creation, la trousse promise. Il ne devient pas un rendez-vous : il se
      compte dans la valeur du forfait et se remet au comptoir. */
  productId?: string;
  /** Dans combien de semaines apres la visite d'ouverture. 0 = le jour meme. */
  afterWeeks?: number;
};

export const SEUIL_REASSORT = 3;

export type Product = {
  id: string;
  categoryId: string;
  name: string;
  priceXof: number;
  stock: number;
  order: number;
};

/* L'ARBORESCENCE v6 — deux maisons, quatre ateliers, trois axes Studio, et entre
   les deux un plateau technique qui n'appartient à personne et se vend des deux
   côtés. L'ordre suit le document : le diagnostic ouvre, le plateau relie, le
   Studio ferme. */
export const CATEGORIES_SEED: CatalogCategory[] = [
  /* ─── Maison 1 · ATELIER MND™ — les locks exclusivement ─── */
  { id: 'koko', code: 'KOKO', fon: 'KÒKÒ™', label: 'Le Diagnostic', maison: 'atelier', enabled: true, order: 0 },
  { id: 'atl-i-vekpe', code: 'ATL·I', fon: 'VÈKPÈ™', label: 'La Naissance', maison: 'atelier', enabled: true, order: 1 },
  { id: 'atl-ii-gbeji', code: 'ATL·II', fon: 'GBÈJÍ™', label: 'La Vie', maison: 'atelier', enabled: true, order: 2 },
  { id: 'atl-iii-yekpe', code: 'ATL·III', fon: 'YÈKPÈ™', label: 'La Lumière', maison: 'atelier', enabled: true, order: 3 },
  { id: 'atl-iv-finfin', code: 'ATL·IV', fon: 'FÍNFÍN™', label: 'La Renaissance', maison: 'atelier', enabled: true, order: 4 },

  /* ─── Le PLATEAU TECHNIQUE — sans maison : commun aux deux (règle 5) ─── */
  { id: 'plt-05', code: 'PLT·05', fon: 'KLƆKLƆ™', label: 'Le Lavage Rituel', enabled: true, order: 10 },
  { id: 'plt-10', code: 'PLT·10', fon: 'DÀNDÀN™', label: 'Le Soin Hydratant', enabled: true, order: 11 },
  { id: 'plt-20', code: 'PLT·20', fon: 'WÈWÈ™', label: 'La Purification', enabled: true, order: 12 },
  { id: 'plt-30', code: 'PLT·30', fon: 'VÍVÍVÓ™', label: "L'Activateur de Pousse", enabled: true, order: 13 },
  { id: 'plt-40', code: 'PLT·40', fon: 'GBÌGBÌ™ Module', label: 'Soin Reconstruction', enabled: true, order: 14 },
  /* PLT·45 — l'acte INVERSE de VÈKPÈ™ : on défait ce que la création a posé.
     Le ranger sous VÈKPÈ™ (« La Naissance ») était un contresens. */
  { id: 'plt-45', code: 'PLT·45', fon: 'GBÀTÀ™', label: 'Le Défaisage', enabled: true, order: 15 },
  { id: 'plt-50', code: 'PLT·50', fon: 'Styling & Coiffures Signature', label: 'Les livrables physiques', enabled: true, order: 16 },
  /* PLT·55 — la reprise PARTIELLE du contour, absente du document v6 mais vendue
     5 fois dans l'ancien ERP. Créée sur décision de la Maison. */
  { id: 'plt-55', code: 'PLT·55', fon: 'La Reprise Frontale', label: 'Reprise partielle du contour', enabled: true, order: 17 },
  { id: 'plt-60', code: 'PLT·60', fon: 'Combinaisons officielles', label: 'Lignes autonomes à prix propre', enabled: true, order: 18 },
  { id: 'plt-70', code: 'PLT·70', fon: 'SOINS ANNEXES', label: 'Beauté & Bien-être', enabled: true, order: 19 },
  { id: 'sup', code: 'SUP', fon: 'Préparation & Suppléments', label: 'Prélude, démontage, essais', enabled: true, order: 20 },
  /* DDS — la règle 6 : un produit apporté par la cliente ne supprime jamais la
     facturation, il déclenche le prix du GESTE. Le droit de service REMPLACE le
     prix produit, il ne s'y ajoute pas. */
  { id: 'dds', code: 'DDS', fon: 'DROIT DE SERVICE', label: 'Produits apportés par la cliente', enabled: true, order: 21 },

  /* ─── PILIER 3 · MND ACADÉMIE — la transmission ─── */
  { id: 'aca-ini', code: 'ACA·INI', fon: "L'INITIÉE", label: 'Particuliers · entretenir ses propres locks', enabled: true, order: 25 },
  { id: 'aca-pro', code: 'ACA·PRO', fon: 'LA PROFESSIONNELLE', label: 'Cursus certifiant', enabled: true, order: 26 },

  /* ─── LA GAMME — produits, communs aux deux maisons ─── */
  { id: 'home-rituals', code: 'HR', fon: 'HOME RITUALS™', label: 'Le soin à la maison', enabled: true, produits: true, order: 30 },
  { id: 'meches', code: 'MCH', fon: 'Mèches & Extensions', label: 'Naturelles et synthétiques', enabled: true, produits: true, order: 31 },

  /* ─── Maison 2 · STUDIO MND · ACƆ™ — ne touche jamais aux locks ─── */
  { id: 'stu-a', code: 'STU·A', fon: 'COIFFER', label: 'Les Couronnes Tressées', maison: 'studio', enabled: true, order: 20 },
  { id: 'stu-b', code: 'STU·B', fon: 'RÉVÉLER', label: 'Le Cheveu Naturel Libre', maison: 'studio', enabled: true, order: 21 },
  { id: 'stu-c', code: 'STU·C', fon: 'SUBLIMER', label: 'Les Grands Jours', maison: 'studio', enabled: true, order: 22 },
];

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const SERVICES_SEED: Service[] = [];

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const PRODUCTS_SEED: Product[] = [];

export const categoriesStore = createStore<CatalogCategory[]>('mnd_catalog_categories', CATEGORIES_SEED);
export const servicesStore = createStore<Service[]>('mnd_catalog_services', SERVICES_SEED);
export const productsStore = createStore<Product[]>('mnd_catalog_products', PRODUCTS_SEED);

import { bindCollection, bindDocument } from './sync';
bindCollection(categoriesStore, 'catalog_categories');
bindCollection(servicesStore, 'catalog_services');
bindCollection(productsStore, 'catalog_products');

/* ----- Suppressions VOLONTAIRES de prestations — pierres tombales synchronisées.
   Sans elles, les mécanismes de restauration (prestations signées de départ
   ci-dessous, sauvetage du 23-07) re-créaient toute prestation manquante :
   « je supprime, ça revient ». Toute suppression au Catalogue s'inscrit ici,
   et tout ensure* qui AJOUTE des prestations doit ignorer ces ids. Jamais purgé
   (une création manuelle prend un id neuf — jamais bloquée par une tombale). */
export const removedServicesStore = createStore<string[]>('mnd_removed_services', []);
bindDocument(removedServicesStore, 'mnd_removed_services');
export const markServiceRemoved = (id: string): void =>
  removedServicesStore.set((prev) => (prev.includes(id) ? prev : [...prev, id]));
export const removedServiceIds = (): Set<string> => new Set(removedServicesStore.get());

/** LA RACINE d'une categorie — l'atelier dont elle releve, ou elle-meme si
    c'en est un. La maison, les baremes du Juste Prix et les calibres sont
    attaches a l'atelier : une famille en herite, elle ne les redefinit pas.
    La remontee est bornee pour qu'un parent circulaire ne fige pas l'ecran. */
export const racineOf = (cats: CatalogCategory[], id: string | undefined): CatalogCategory | undefined => {
  let cur = cats.find((c) => c.id === id);
  for (let i = 0; cur?.parentId && i < 8; i += 1) {
    const parent = cats.find((c) => c.id === cur!.parentId);
    if (!parent) break;
    cur = parent;
  }
  return cur;
};

/** L'ATELIER ET TOUTES SES FAMILLES. Designer « GBEJI » dans un forfait doit
    couvrir ce qui est range dessous : sans cette descente, sortir les SINSIN
    vers une famille ferait disparaitre la seance du forfait en silence, la
    ligne ne trouvant plus aucune prestation dans l'atelier lui-meme. */
export const sousArbreOf = (cats: CatalogCategory[], rootId: string): Set<string> => {
  const ids = new Set([rootId]);
  for (let i = 0; i < 8; i += 1) {
    const avant = ids.size;
    for (const c of cats) if (c.parentId && ids.has(c.parentId)) ids.add(c.id);
    if (ids.size === avant) break;
  }
  return ids;
};

/** Les ateliers seuls — les categories sans parent. */
export const ateliersOf = (cats: CatalogCategory[]): CatalogCategory[] => cats.filter((c) => !c.parentId);

export const useCategories = () => useStore(categoriesStore);
export const useServices = () => useStore(servicesStore);
export const useProducts = () => useStore(productsStore);

/** Idempotent : garantit la catégorie Consultation (ÐÓTÓ™) sur les maisons créées
    avant son introduction (leur table `catalog_categories` est déjà peuplée, donc
    la graine ne suffit pas). À appeler au montage du Catalogue. N'agit que si elle
    est ABSENTE — un renommage (même id `doto`) est donc préservé. */
export function ensureConsultationCategory(): void {
  if (HOUSE_BLANK) return; // Maison à blanc — aucune semence
  const cats = categoriesStore.get();
  if (!Array.isArray(cats) || cats.some((c) => c.id === 'doto')) return;
  categoriesStore.set((prev) => [
    { id: 'doto', fon: 'ÐÓTÓ™', label: 'Consultation & conseil', enabled: true, order: 0 },
    ...prev,
  ]);
}

/* Prestations signées de départ. NOMS EN CLAIR (français descriptif) : quel que
   soit le nom fon de la catégorie, la cliente sait EXACTEMENT ce qu'elle réserve.
   `master` vide = à affecter par la Maison (rempli au défaut de branche par
   `ensureStarterServices`). `order` recalculé à l'insertion. */
const svc = (
  id: string, categoryId: string, name: string, palier: Service['palier'],
  priceMode: PriceMode, priceXof: number, durationMin: number, description: string, temps: number[],
): Service => ({
  id, categoryId, name, palier, priceMode, priceXof, hidePrice: priceMode === 'devis',
  sessions: 1, master: '', durationMin, order: 0, description, temps,
});

/** ÐÓTÓ™ — trois consultations : avant une création, pour réparer/améliorer, ou pour conseil. */
export const STARTER_DOTO_SERVICES: Service[] = [
  svc('svc-doto-creation', 'doto', 'Consultation Création — Première couronne', 'Fondation', 'fixe', 10000, 45,
    'Le premier rendez-vous : lecture du cheveu et du cuir chevelu, choix de la méthode et projection de votre future couronne. Le point de départ de toute création.', [0, 0, 0, 0]),
  svc('svc-doto-reparation', 'doto', 'Consultation Réparation & Amélioration', 'Fondation', 'fixe', 7500, 30,
    'Diagnostic d’une couronne fragilisée ou relâchée : on identifie ce qui doit être réparé, renforcé ou repris, et on trace le plan de soin.', [0, 0, 0, 0]),
  svc('svc-doto-conseil', 'doto', 'Consultation Conseil & Diagnostic', 'Fondation', 'fixe', 5000, 30,
    'Un temps d’écoute et de conseil : routine, entretien à la maison, produits — pour que votre couronne tienne, entre deux passages au fauteuil.', [0, 0, 0, 0]),
];

/** VÈKPÈ™ — quatre créations de couronne, un mode de prix par cas (devis / variable / fixe). */
export const STARTER_VEKPE_SERVICES: Service[] = [
  svc('svc-vekpe-microlocks', 'vekpe', 'Création Microlocks sur mesure', 'Souveraineté', 'devis', 0, 480,
    'La couronne d’exception : des centaines de locks fines, montées mèche après mèche. Entièrement sur mesure — le tarif s’établit après la consultation, selon la densité et la longueur.', [1, 1, 1, 1]),
  svc('svc-vekpe-traditionnelles', 'vekpe', 'Création Locks Traditionnelles', 'Élévation', 'variable', 50000, 300,
    'Les locks classiques, nées de vos propres cheveux : vrillées, nourries puis scellées. Le tarif part de la longueur et du volume — d’où le « à partir de ».', [1, 1, 1, 1]),
  svc('svc-vekpe-crochet', 'vekpe', 'Création Locks Instantanées (au crochet)', 'Élévation', 'variable', 60000, 360,
    'Des locks déjà structurées dès la première séance, montées au crochet : un rendu net, immédiat. Le tarif suit la quantité et la longueur souhaitées.', [1, 1, 1, 1]),
  svc('svc-vekpe-fauxlocks', 'vekpe', 'Pose Faux Locks (protection temporaire)', 'Fondation', 'fixe', 35000, 240,
    'Le style protecteur : des locks temporaires posées en extensions, pour essayer la couronne ou traverser une saison. Prix ferme, retrait compris.', [1, 0, 1, 1]),
];

/** Idempotent : pose les prestations signées de départ (ÐÓTÓ™ + VÈKPÈ™) absentes.
    Add-if-missing-by-id : ne duplique jamais, respecte les suppressions et les
    renommages. `defaultMaster` renseigne le maître si le seed le laisse vide. */
export function ensureStarterServices(defaultMaster: string): void {
  if (HOUSE_BLANK) return; // Maison à blanc — aucune semence
  const cur = servicesStore.get();
  if (!Array.isArray(cur)) return;
  const have = new Set(cur.map((s) => s.id));
  const removed = removedServiceIds(); // suppression volontaire = jamais re-créée
  const toAdd = [...STARTER_DOTO_SERVICES, ...STARTER_VEKPE_SERVICES].filter((s) => !have.has(s.id) && !removed.has(s.id));
  if (toAdd.length === 0) return;
  const counters: Record<string, number> = {};
  const prepared = toAdd.map((s) => {
    const base = counters[s.categoryId] ?? cur.filter((x) => x.categoryId === s.categoryId).reduce((m, x) => Math.max(m, x.order), 0);
    counters[s.categoryId] = base + 1;
    return { ...s, order: base + 1, master: s.master || defaultMaster, temps: [...(s.temps ?? [1, 1, 1, 1])] };
  });
  servicesStore.set((prev) => [...prev, ...prepared]);
}

/** Les quatre temps de la méthode — chaque prestation les honore en tout ou partie. */
export const QUATRE_TEMPS = ['Purifier', 'Nourrir', 'Sceller', 'Couronner'] as const;

/** Format maison d’une durée en minutes : `2 h`, `1 h 30`, `45 min`. */
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}
