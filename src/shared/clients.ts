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

export const CLIENTS_SEED: Client[] = [
  { id: 'c-adjoa', branchId: 'cotonou-flagship', name: 'Adjoa Hounkpatin', phone: '+229 01 97 44 12 08', city: 'Cotonou', persona: 'p-souveraine-locale', since: '2021-03-12', segments: ['VIP', 'Abonnée'], priceCoef: 1.0, loyaltyPoints: 1240, diaspora: false },
  { id: 'c-mariama', branchId: 'cotonou-flagship', name: 'Mariama Sow', phone: '+229 01 96 20 45 31', city: 'Cotonou', persona: 'p-maman', since: '2022-07-02', segments: ['Famille'], priceCoef: 0.92, loyaltyPoints: 480, diaspora: false },
  { id: 'c-chanel', branchId: 'cotonou-flagship', name: 'Chanel Dossou', phone: '+229 ** ** ** **', city: 'Paris', persona: 'p-diaspora', since: '2023-12-18', segments: ['Diaspora', 'VIP'], priceCoef: 1.18, loyaltyPoints: 860, diaspora: true },
  { id: 'c-ines', branchId: 'cotonou-flagship', name: 'Inès Agossa', phone: '+229 01 95 33 78 40', city: 'Cotonou', persona: 'p-initie', since: '2026-05-20', segments: ['Nouvelle'], priceCoef: 1.0, loyaltyPoints: 60, diaspora: false },
  { id: 'c-thierry', branchId: 'cotonou-flagship', name: 'Thierry Amoussou', phone: '+229 01 94 11 02 76', city: 'Cotonou', persona: 'p-souverain', since: '2020-01-15', segments: ['Régulier'], priceCoef: 0.95, loyaltyPoints: 1520, diaspora: false },
  { id: 'c-nadege', branchId: 'cotonou-flagship', name: 'Nadège Zinsou', phone: '+229 01 91 58 24 63', city: 'Porto-Novo', persona: 'p-maman', since: '2023-04-11', segments: ['Famille', 'Cercle'], priceCoef: 0.9, loyaltyPoints: 640, diaspora: false },
  { id: 'c-gisele', branchId: 'cotonou-flagship', name: 'Gisèle Adjovi', phone: '+229 01 98 76 30 15', city: 'Cotonou', persona: 'p-souveraine-locale', since: '2022-11-03', segments: ['Abonnée'], priceCoef: 1.0, loyaltyPoints: 910, diaspora: false },
  { id: 'c-reine', branchId: 'cotonou-flagship', name: 'Reine Dossou-Yovo', phone: '+229 01 90 12 47 88', city: 'Calavi', persona: 'p-initie', since: '2026-02-14', segments: ['Nouvelle'], priceCoef: 1.0, loyaltyPoints: 140, diaspora: false },
  { id: 'c-fatou', branchId: 'abidjan', name: 'Fatou Koné', phone: '+229 ** ** ** **', city: 'Abidjan', persona: 'p-souveraine-locale', since: '2024-02-09', segments: ['VIP'], priceCoef: 1.0, loyaltyPoints: 720, diaspora: false },
  { id: 'c-awa', branchId: 'paris', name: 'Awa Diallo', phone: '+229 ** ** ** **', city: 'Paris', persona: 'p-diaspora', since: '2025-09-30', segments: ['Nouvelle'], priceCoef: 1.1, loyaltyPoints: 180, diaspora: true },
];

export const clientsStore = createStore<Client[]>('mnd_clients', CLIENTS_SEED);
export const personasStore = createStore<Persona[]>('mnd_personas', PERSONAS_SEED);

export const useClients = () => useStore(clientsStore);
export const usePersonas = () => useStore(personasStore);

import { bindCollection } from './sync';
bindCollection(clientsStore, 'clients');
bindCollection(personasStore, 'personas');
