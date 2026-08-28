import { createStore, useStore } from './store';
import { catsDansLOrdre, type CatalogCategory, type Product, type Service } from './catalog';

/* Ponts inter-surfaces (mêmes clés localStorage que les prototypes) :
   - `mnd_couronne_compose` : rituel sur-mesure composé dans Ma Couronne → lu par le Trône
   - `mnd_consultations_queue` : consultations payées de La Consultation → queue du Trône
   - `mnd_vitrine_config` : configuration Vitrine du Trône → respectée par Ma Couronne */

export type ComposePayload = {
  id: string;
  createdAt: string;
  client: string;
  /** L'identifiant de SA fiche (12 août) — le Trône ouvre WhatsApp et la
      fiche sans chercher le nom à la main. Absent sur les vieux payloads. */
  clientId?: string;
  /** `forfait` (16 août) — elle ne compose pas, elle DEMANDE un forfait tout
      fait du catalogue (un cycle de plusieurs séances, que le tunnel ne sait
      pas programmer d'un coup). Pas de remise composée : le prix est celui de
      la carte. */
  mode: 'ponctuel' | 'abonnement' | 'forfait';
  discountPct: number;
  items: { service: string; category: string; priceXof: number }[];
  totalXof: number;
};

/** LA FILE DES COMPOSITIONS REÇUES — côté Trône. Le pont `mnd_couronne_compose`
    ne porte que la DERNIÈRE composition (un document) : le Tableau de bord la
    MOISSONNE dans cette file locale persistante dès qu'elle paraît, et rien ne
    se perd tant qu'un Trône est ouvert. La notification poussée à l'envoi
    couvre le reste. (Si le volume grandit, une vraie table de file prendra le
    relais — v1 sans migration, 12 août.) */
export type CompositionRecue = ComposePayload & { recueLe: string; traiteLe?: string };
export const compositionsRecuesStore = createStore<CompositionRecue[]>('mnd_compositions_recues', []);

export type OnlineConsultation = {
  id: string;
  createdAt: string;
  parcours: 'creation' | 'sos';
  client: { name: string; phone: string; city: string; currency: string };
  answers: Record<string, unknown>;
  diagnostic?: { palier: string; scores: Record<string, number> };
  reservation?: { mode: 'salon' | 'visio'; date: string; time: string };
  paidXof: number;
  status: 'nouvelle' | 'traitée' | 'fermée';
};

/* ── LA CARTE DU COMPTOIR — ce qu'on y montre, 28 août 2026 ───────────
   « Je veux la possibilité d'afficher ou pas des prestations, ou des
   formules, ou des produits Care & Store » (Yéman).

   LA CARTE A SES PROPRES MASQUES, distincts de ceux de la Vitrine. Le
   comptoir et l'application cliente n'ont pas le même public : une prestation
   qu'on montre à une cliente connue, dans son espace, ne va pas forcément sur
   un écran que tout le salon peut lire par-dessus son épaule. Partager les
   masques aurait obligé à choisir entre les deux surfaces.

   MASQUER, PAS SÉLECTIONNER. On liste ce qu'on RETIRE, jamais ce qu'on garde :
   une liste blanche cache toute prestation née après elle, et la Maison ne
   s'en aperçoit que le jour où une cliente demande pourquoi la nouveauté n'est
   pas à la carte. C'est la leçon de `visibleCategories`, resté vestige ici
   même. */
export type CarteConfig = {
  /** Les trois volets, allumés ou éteints d'un geste. */
  rituels: boolean;
  formules: boolean;
  produits: boolean;
  /** Ce qu'on RETIRE de la carte, ligne par ligne. */
  servicesMasques: string[];
  formulesMasquees: string[];
  produitsMasques: string[];
  /** Le défilement des formules : elles passent l'une après l'autre pour se
      laisser lire, plutôt que de s'entasser en petits caractères. */
  defileFormules: boolean;
  /** Secondes par formule — le temps de lire, pas celui de s'ennuyer. */
  secondesParFormule: number;
  /** LE VOLET DU WI-FI — « après Réserver il faut ajouter l'onglet pour le
      Code Wifi » (Yéman, 28 août). Éteint par défaut : allumer publie le mot
      de passe dans un document lisible sans compte, et ce choix appartient à
      la Maison, pas au code. */
  wifi: boolean;
  wifiSsid: string;
  wifiPass: string;
  wifi2Ssid: string;
  wifi2Pass: string;
};

/* ── LE GLISSEMENT — 28 août 2026 ─────────────────────────────────────
   « Je préfère swiper sur l'écran et aller au suivant et revenir en arrière à
   ma convenance » (Yéman). Les pastilles demandent de viser ; le doigt qui
   glisse ne vise rien, il pousse.

   LE MOUVEMENT VERTICAL NE COMPTE PAS. La carte défile de haut en bas : sans
   cette garde, chaque défilement du pouce ferait sauter une formule, et
   personne ne comprendrait pourquoi l'écran bouge tout seul. On ne retient un
   glissement que s'il est franchement HORIZONTAL. */

/* ── LE CARRÉ WI-FI ───────────────────────────────────────────────────
   Le format que tous les téléphones savent lire. Les caractères que le format
   RÉSERVE s'échappent : un mot de passe qui porte un point-virgule couperait
   la chaîne en deux, et le carré connecterait à un réseau au nom tronqué sans
   que rien ne le signale. C'est le genre de panne qu'on met un mois à
   comprendre, parce qu'elle ne touche qu'une Maison sur vingt. */
export const wifiPayload = (ssid: string, pass: string): string =>
  `WIFI:T:WPA;S:${ssid.replace(/([\\;,:"])/g, '\\$1')};P:${pass.replace(/([\\;,:"])/g, '\\$1')};;`;

/** Le seuil en pixels sous lequel un mouvement n'est qu'un tremblement. */
export const SEUIL_GLISSE = 48;

/** Le sens d'un glissement : −1 revient en arrière, +1 va au suivant, 0 ne
    fait rien. Un doigt qui va vers la GAUCHE tire la suivante vers soi. */
export function directionDuGlisse(dx: number, dy: number, seuil = SEUIL_GLISSE): -1 | 0 | 1 {
  if (Math.abs(dx) < seuil) return 0;
  /* Franchement horizontal : au moins autant de large que de haut. */
  if (Math.abs(dy) > Math.abs(dx)) return 0;
  return dx < 0 ? 1 : -1;
}

/** L'index suivant, qui BOUCLE : après la dernière revient la première, et
    avant la première vient la dernière. Un écran de comptoir n'a pas de fin ;
    buter sur un bord donnerait l'impression qu'il est cassé. */
export const indexSuivant = (i: number, n: number, sens: -1 | 0 | 1): number =>
  (n <= 0 ? 0 : (((i + sens) % n) + n) % n);

export const CARTE_DEFAUT: CarteConfig = {
  rituels: true,
  formules: true,
  produits: true,
  servicesMasques: [],
  formulesMasquees: [],
  produitsMasques: [],
  defileFormules: true,
  secondesParFormule: 9,
  /* ÉTEINT PAR DÉFAUT. Allumer publie le mot de passe du réseau dans un
     document lisible sans compte : c'est un choix de la Maison, pas un
     réglage qu'on hérite sans l'avoir voulu. */
  wifi: false,
  wifiSsid: '',
  wifiPass: '',
  wifi2Ssid: '',
  wifi2Pass: '',
};

/** Les réglages de la carte, complétés — une Maison d'avant ce champ n'a rien
    en base, et l'absence doit valoir « tout montrer », jamais « rien ». */
export const carteReglages = (cfg: { carte?: Partial<CarteConfig> } | null | undefined): CarteConfig => ({
  ...CARTE_DEFAUT,
  ...(cfg?.carte ?? {}),
  servicesMasques: cfg?.carte?.servicesMasques ?? [],
  formulesMasquees: cfg?.carte?.formulesMasquees ?? [],
  produitsMasques: cfg?.carte?.produitsMasques ?? [],
  /* Un défilement à zéro seconde ferait clignoter l'écran ; on borne à ce
     qu'un œil peut suivre. */
  secondesParFormule: Math.min(60, Math.max(3, cfg?.carte?.secondesParFormule ?? CARTE_DEFAUT.secondesParFormule)),
});

/** Ce qui reste à montrer, une fois les masques posés. */
export const gardeSurLaCarte = <T extends { id: string }>(
  liste: readonly T[], masques: readonly string[],
): T[] => {
  const hors = new Set(masques);
  return liste.filter((x) => !hors.has(x.id));
};

export type VitrineConfig = {
  autoplay: boolean;
  /** LES RÉGLAGES DE LA CARTE DU COMPTOIR — ils vivent ici parce que
      `mnd_vitrine_config` est déjà lisible publiquement : la carte est une
      entrée SANS compte, elle doit pouvoir lire ses réglages sans être
      personne. Un document neuf aurait demandé sa propre règle RLS. */
  carte?: Partial<CarteConfig>;
  /** VESTIGE (12 août) — la liste blanche n'est plus consultée par le juge :
      semée une fois, jamais entretenue, elle cachait toute catégorie née
      après. Conservée pour ne pas casser les données déjà en base. */
  visibleCategories: string[];
  /** LE TAPIS DE LA MAISON — masques valant pour TOUTES les clientes (mode
      « Pour toutes les clientes » de la régie). Les masques individuels de
      chaque fiche (`Client.vitrineMasques`) s'y AJOUTENT. */
  hiddenCategories?: string[];
  hiddenServices: string[];
  hiddenProducts: string[];
  /** CE QUE LE QUIZ RECOMMANDE, prestation par envie.

      Le miroir proposait quatre rituels écrits en dur dans le code — « Le Soin
      Allongement » à 28 000 F, « La Création Nano-locks » à 120 000 F — qui
      n'existaient dans aucun catalogue, avec des prix inventés qu'un
      multiplicateur arrondissait encore. Montrés à une cliente, ils devenaient
      une promesse que la Maison n'avait jamais faite.

      On désigne donc, pour chacune des quatre envies, une prestation du
      catalogue. Son nom et son prix sont alors les vrais — le prix personnel
      de la cliente, coefficient compris. Rien n'est désigné = le miroir ne
      recommande rien, ce qui vaut mieux qu'une recommandation fausse.

      LE REPLI COMMUN, désormais. La désignation qui compte vit sur le PERSONA
      (`Persona.recoParEnvie`) : la même réponse à une Initiée qui découvre et à
      une Souveraine de dix ans n'en était pas une. Ce réglage-ci sert quand
      l'archétype n'a rien dit. */
  recoParEnvie?: Partial<Record<'longueur' | 'eclat' | 'protection' | 'transformation', string>>;
  /** LE QUIZ AU MIROIR DU SALON — la scène « une question pour toi ». */
  quizEnabled: boolean;
  /** LE QUIZ SUR MA COURONNE, au seuil de la réservation — commandé À PART.

      Un seul interrupteur pour les deux surfaces obligeait à choisir entre les
      deux : éteindre le quiz pour les clientes l'éteignait au fauteuil, où il
      se joue pourtant devant quelqu'un qui peut l'expliquer. Ce ne sont pas les
      mêmes conditions — au salon la maîtresse est là, sur le téléphone la
      cliente est seule.

      Absent = allumé : c'est l'état dans lequel le quiz est né sur Ma Couronne,
      et le retirer par surprise à une maison qui l'utilise serait pire que de
      lui demander de l'éteindre. */
  quizCouronne?: boolean;
  /** MODULES FERMÉS POUR TOUTE LA MAISON — 'reserver' · 'compose' · 'suivi' ·
      'gamme' · 'cercle' · 'offres'.

      Les modules ne se coupaient que cliente par cliente (`Client.hiddenModules`),
      ce qui obligeait à répéter cent soixante-dix-huit fois une décision qui
      n'en est qu'une : « on ne prend pas de réservation en ligne ». Ce réglage-ci
      vaut pour toutes ; celui de la fiche reste, et RETIRE en plus. Les deux
      s'additionnent, aucun ne rouvre ce que l'autre a fermé — on ne rend pas à
      une cliente ce que la Maison a fermé à tout le monde. */
  modulesFermes?: string[];
  /** MA COURONNE FERMÉE — l'application entière, pour toutes.

      Un cran au-dessus des modules : la porte, pas les pièces. Sert le jour où
      la Maison ne veut plus rien recevoir en ligne — congés, refonte du
      catalogue, incident. La cliente qui ouvre l'app lit le mot ci-dessous
      plutôt qu'un écran cassé ou, pire, un tunnel qui accepte une réservation
      que personne ne lira. */
  couronneFermee?: boolean;
  /** Ce que lit la cliente quand la porte est close. Vide = un mot de la Maison. */
  couronneMot?: string;
  /** SON HISTOIRE TRANCHE. Allumé, le quiz ne prend plus la désignation de son
      persona telle quelle : il choisit, PARMI tout ce que la Maison a désigné
      pour cette envie, la prestation que ses rendez-vous rendent la plus juste
      (celle qu'elle reprend, sinon la maison qu'elle fréquente). Il n'invente
      rien — il trie. Sans histoire, son persona reprend la main. */
  recoAuto?: boolean;
  /** LE SUR-MESURE SE RÈGLE AU TRÔNE (12 août) — les remises, le minimum et
      les ateliers étaient écrits dans le code. Absent = les valeurs
      historiques : ponctuel −10 % (tout le catalogue), abonnement −15 %,
      3 prestations minimum, ateliers gbeji + finfin. LES DEUX RÉGIMES SONT
      SCINDÉS : chacun sa liste d'ateliers/familles (un nœud coché couvre son
      sous-arbre). `ponctuelCats` VIDE = tout le catalogue visible. */
  surMesure?: { ponctuelPct?: number; aboPct?: number; aboMin?: number; aboCats?: string[]; ponctuelCats?: string[] };
};

/** Les réglages EFFECTIFS du sur-mesure — les défauts historiques comblent. */
export const surMesureDe = (cfg: VitrineConfig): { ponctuelPct: number; aboPct: number; aboMin: number; aboCats: string[]; ponctuelCats: string[] } => ({
  ponctuelPct: cfg.surMesure?.ponctuelPct ?? 10,
  aboPct: cfg.surMesure?.aboPct ?? 15,
  aboMin: cfg.surMesure?.aboMin ?? 3,
  aboCats: cfg.surMesure?.aboCats ?? ['gbeji', 'finfin'],
  ponctuelCats: cfg.surMesure?.ponctuelCats ?? [],
});

/* ---------- LE CATALOGUE QU'UNE CLIENTE VOIT — le juge UNIQUE ----------

   Deux couches, dans cet ordre :
   · LE SOCLE DE LA MAISON (VitrineConfig) — catégories offertes au miroir,
     masques valant pour toutes ;
   · SES MASQUES À ELLE (`Client.vitrineMasques`, posés à la régie de la
     Vitrine) — le tapis de cuivre est INDIVIDUEL : éteindre pour Marie
     n'éteint QUE pour Marie (12 août — la régie écrivait la config globale
     et masquer pour une tête masquait pour toutes).

   Une famille suit son atelier : un maillon désactivé, non offert ou masqué
   coupe toute sa descendance. L'ordre rendu est celui de l'ARBRE du
   Catalogue. Utilisé par Ma Couronne (useVisibleCatalog) ET par l'aperçu de
   la Vitrine — deux écrans, un seul juge. */
export type VitrineMasques = { categories?: string[]; services?: string[]; products?: string[] };

export function catalogueVisiblePour(o: {
  cfg: VitrineConfig;
  masques?: VitrineMasques;
  cats: CatalogCategory[];
  services: Service[];
  products: Product[];
}): { cats: CatalogCategory[]; services: Service[]; products: Product[] } {
  const mCats = o.masques?.categories ?? [];
  const mSvcs = o.masques?.services ?? [];
  const mProds = o.masques?.products ?? [];
  /* PLUS DE LISTE BLANCHE (12 août). `visibleCategories` avait été semée une
     fois au premier jour et plus aucun écran ne l'entretenait : toute
     catégorie née après — les forfaits SÍNSIN, les familles — restait
     invisible sur Ma Couronne sans qu'aucun réglage ne le dise. Le VRAI
     interrupteur global existe déjà et a son écran : « Visible aux
     clientes » du Catalogue (`enabled`), qui coupe sa descendance. */
  const gCats = o.cfg.hiddenCategories ?? [];
  const catOk = (id: string): boolean => {
    let c = o.cats.find((x) => x.id === id);
    if (!c || !c.enabled || mCats.includes(c.id) || gCats.includes(c.id)) return false;
    for (let i = 0; c.parentId && i < 8; i += 1) {
      const parent = o.cats.find((x) => x.id === c!.parentId);
      if (!parent) break;
      if (!parent.enabled || mCats.includes(parent.id) || gCats.includes(parent.id)) return false;
      c = parent;
    }
    return true;
  };
  /* L'ORDRE DU CATALOGUE JUSQU'AU BOUT (12 août) : trier les prestations à
     plat sur `order` mélangeait les ateliers (tous les rangs 1 d'abord…) —
     le tapis de cuivre ne suivait pas la carte. On trie par la POSITION de
     l'atelier dans l'arbre, puis par le rang dans l'atelier. */
  const arbre = catsDansLOrdre(o.cats);
  const rangCat = new Map(arbre.map((c, i) => [c.id, i]));
  const parCatalogue = (a: { categoryId: string; order: number }, b: { categoryId: string; order: number }): number =>
    ((rangCat.get(a.categoryId) ?? 9999) - (rangCat.get(b.categoryId) ?? 9999)) || (a.order - b.order);
  const services = o.services
    .filter((s) => catOk(s.categoryId) && !o.cfg.hiddenServices.includes(s.id) && !mSvcs.includes(s.id))
    .slice()
    .sort(parCatalogue);
  const products = o.products
    .filter((p) => catOk(p.categoryId) && !o.cfg.hiddenProducts.includes(p.id) && !mProds.includes(p.id))
    .slice()
    .sort(parCatalogue);
  const nonEmpty = new Set<string>([...services.map((s) => s.categoryId), ...products.map((p) => p.categoryId)]);
  return {
    cats: arbre.filter((c) => catOk(c.id) && nonEmpty.has(c.id)),
    services,
    products,
  };
}

export const composeStore = createStore<ComposePayload | null>('mnd_couronne_compose', null);
export const consultationsQueueStore = createStore<OnlineConsultation[]>('mnd_consultations_queue', []);
export const vitrineConfigStore = createStore<VitrineConfig>('mnd_vitrine_config', {
  autoplay: true,
  visibleCategories: [],
  hiddenCategories: [],
  hiddenServices: [],
  hiddenProducts: [],
  recoParEnvie: {},
  quizEnabled: true,
  quizCouronne: true,
});

import { bindCollection, bindDocument } from './sync';
bindCollection(consultationsQueueStore, 'consultations_queue');
bindDocument(composeStore, 'mnd_couronne_compose');
bindDocument(vitrineConfigStore, 'mnd_vitrine_config');

/* ── LES DEMANDES DE FORMULE — Ma Couronne → Le Trône, 28 août 2026 ────
   « Build an interactive way for the clients to purchase and follow their
   packs and memberships » (Yéman).

   LE BOUTON DE LA CLIENTE N'ACHÈTE RIEN, IL DEMANDE. Laisser l'application
   créer des abonnements que personne n'a validés deviendrait ingérable le jour
   où deux clientes réservent le même créneau réservé — et un abonnement porte
   un créneau, c'est sa promesse. La demande arrive donc dans Le Trône, Yéman
   confirme, encaisse, et l'abonnement naît de son geste à lui.

   UNE SEULE DEMANDE OUVERTE PAR TÊTE. Deux demandes simultanées de la même
   cliente obligeraient à deviner laquelle compte. */
export type DemandeFormule = {
  id: string;
  clientId: string;
  clientName: string;
  planId: string;
  planName: string;
  /** Jour de la demande — une attente qui porte une date engage la Maison ;
      « en cours de traitement » n'engage personne. */
  demandeeLe: string;
  /** Posé quand la Maison a tranché — l'abonnement est né, ou la demande est
      retirée. Une demande traitée ne disparaît pas : elle se tait. */
  traiteeLe?: string;
  /** L'abonnement né de cette demande, quand il existe. */
  subId?: string;
};

export const demandesFormuleStore = createStore<DemandeFormule[]>('mnd_demandes_formule', []);
export const useDemandesFormule = () => useStore(demandesFormuleStore);

/** La demande OUVERTE d'une tête, s'il y en a une. */
export const demandeOuverteDe = (liste: readonly DemandeFormule[], clientId: string) =>
  liste.find((d) => d.clientId === clientId && !d.traiteeLe);

bindCollection(demandesFormuleStore, 'demandes_formule');
