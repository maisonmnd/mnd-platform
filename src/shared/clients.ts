import { createStore, useStore } from './store';

/* Têtes couronnées — CRM 360. Toutes les entités portent `branchId` :
   la branche sélectionnée filtre tout. */

export type Client = {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  city: string;
  persona: string; // id de persona
  since: string; // ISO date
  photo?: string | null;
  segments: string[];
  priceCoef: number; // Le Juste Prix — coefficient personnalisé
  loyaltyPoints: number;
  notes?: string;
  archived?: boolean;
  diaspora?: boolean;
};

export type Persona = {
  id: string;
  name: string;
  essence: string; // une phrase — comment la maison l'accueille
  builtin: boolean;
};

export const PERSONAS_SEED: Persona[] = [
  { id: 'p-souveraine-locale', name: 'Souveraine Locale', essence: 'Fidèle du flagship, la maison est son rituel hebdomadaire.', builtin: true },
  { id: 'p-diaspora', name: 'Diaspora Souveraine', essence: 'Revient au pays, exige le standard international.', builtin: true },
  { id: 'p-initie', name: 'Initié·e', essence: 'Première couronne — tout est à transmettre.', builtin: true },
  { id: 'p-maman', name: 'Maman Transmettrice', essence: 'Vient pour elle, revient pour ses enfants.', builtin: true },
  { id: 'p-souverain', name: 'Le Souverain', essence: 'Homme de tête haute, discret, régulier.', builtin: true },
];

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const CLIENTS_SEED: Client[] = [];

export const clientsStore = createStore<Client[]>('mnd_clients', CLIENTS_SEED);
export const personasStore = createStore<Persona[]>('mnd_personas', PERSONAS_SEED);

export const useClients = () => useStore(clientsStore);
export const usePersonas = () => useStore(personasStore);

import { bindCollection } from './sync';
bindCollection(clientsStore, 'clients');
bindCollection(personasStore, 'personas');
