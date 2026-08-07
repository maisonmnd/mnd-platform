import { createStore } from './store';

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
      recommande rien, ce qui vaut mieux qu'une recommandation fausse. */
  recoParEnvie?: Partial<Record<'longueur' | 'eclat' | 'protection' | 'transformation', string>>;
  quizEnabled: boolean;
};

export const composeStore = createStore<ComposePayload | null>('mnd_couronne_compose', null);
export const consultationsQueueStore = createStore<OnlineConsultation[]>('mnd_consultations_queue', []);
export const vitrineConfigStore = createStore<VitrineConfig>('mnd_vitrine_config', {
  autoplay: true,
  visibleCategories: [],
  hiddenServices: [],
  hiddenProducts: [],
  recoParEnvie: {},
  quizEnabled: true,
});

import { bindCollection, bindDocument } from './sync';
bindCollection(consultationsQueueStore, 'consultations_queue');
bindDocument(composeStore, 'mnd_couronne_compose');
bindDocument(vitrineConfigStore, 'mnd_vitrine_config');
