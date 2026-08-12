import { createStore } from './store';
import { catsDansLOrdre, type CatalogCategory, type Product, type Service } from './catalog';

/* Ponts inter-surfaces (mêmes clés localStorage que les prototypes) :
   - `mnd_couronne_compose` : rituel sur-mesure composé dans Ma Couronne → lu par le Trône
   - `mnd_consultations_queue` : consultations payées de La Consultation → queue du Trône
   - `mnd_vitrine_config` : configuration Vitrine du Trône → respectée par Ma Couronne */

export type ComposePayload = {
  id: string;
  createdAt: string;
  client: string;
  mode: 'ponctuel' | 'abonnement';
  discountPct: number;
  items: { service: string; category: string; priceXof: number }[];
  totalXof: number;
};

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

export type VitrineConfig = {
  autoplay: boolean;
  visibleCategories: string[];
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
};

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
  const catOk = (id: string): boolean => {
    let c = o.cats.find((x) => x.id === id);
    if (!c || !c.enabled || mCats.includes(c.id)) return false;
    for (let i = 0; c.parentId && i < 8; i += 1) {
      const parent = o.cats.find((x) => x.id === c!.parentId);
      if (!parent) break;
      if (!parent.enabled || mCats.includes(parent.id)) return false;
      c = parent;
    }
    return true;
  };
  const services = o.services
    .filter((s) => catOk(s.categoryId) && !o.cfg.hiddenServices.includes(s.id) && !mSvcs.includes(s.id))
    .slice()
    .sort((a, b) => a.order - b.order);
  const products = o.products
    .filter((p) => catOk(p.categoryId) && !o.cfg.hiddenProducts.includes(p.id) && !mProds.includes(p.id))
    .slice()
    .sort((a, b) => a.order - b.order);
  const nonEmpty = new Set<string>([...services.map((s) => s.categoryId), ...products.map((p) => p.categoryId)]);
  return {
    cats: catsDansLOrdre(o.cats).filter((c) => catOk(c.id) && nonEmpty.has(c.id)),
    services,
    products,
  };
}

export const composeStore = createStore<ComposePayload | null>('mnd_couronne_compose', null);
export const consultationsQueueStore = createStore<OnlineConsultation[]>('mnd_consultations_queue', []);
export const vitrineConfigStore = createStore<VitrineConfig>('mnd_vitrine_config', {
  autoplay: true,
  visibleCategories: [],
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
