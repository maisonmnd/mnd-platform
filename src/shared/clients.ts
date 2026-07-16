import { createStore, useStore } from './store';

/* Têtes couronnées — CRM 360. Toutes les entités portent `branchId` :
   la branche sélectionnée filtre tout. */

export type Client = {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  email?: string;
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
  /* — la couronne : partagé Trône (CRM 360) ↔ Ma Couronne (statut, suivi) — */
  crownStyle?: string; // Microlocks, Locks fines, Sisterlocks…
  lockCount?: number; // nombre de locks
  crownSince?: string; // ISO — naissance de la couronne (≠ since, date d'entrée au CRM)
  preferredMaster?: string;
  birthday?: string; // ISO — anniversaire de la cliente
  birthdayGiftAt?: string; // ISO — date du dernier cadeau anniversaire envoyé
  geo?: { lat: number; lng: number }; // position GPS partagée (livraison Ma Couronne)
};

/** Styles de couronne par défaut — la liste est éditable (crownStylesStore). */
export const CROWN_STYLES_DEFAULT = [
  'Microlocks', 'Sisterlocks', 'Locks fines', 'Locks moyennes', 'Locks larges',
  'Traditionnelles', 'Freeform', 'Faux locks', 'Locks bouclées', 'Interlocks',
];

/** Liste gérable des styles de couronne (Paramètres / CRM), synchronisée Supabase. */
export const crownStylesStore = createStore<string[]>('mnd_crown_styles', CROWN_STYLES_DEFAULT);
export const useCrownStyles = () => useStore(crownStylesStore);

/** Segments de clientèle par défaut — la liste est éditable (segmentsStore). */
export const SEGMENTS_DEFAULT = [
  'Prospect', 'VIP', 'Abonnée', 'Nouvelle', 'Diaspora', 'Famille', 'Cercle', 'Régulier', 'Dormante', 'Ma Couronne',
];

/** Liste gérable des segments de clientèle (Paramètres / CRM), synchronisée Supabase. */
export const segmentsStore = createStore<string[]>('mnd_segments', SEGMENTS_DEFAULT);
export const useSegments = () => useStore(segmentsStore);

/** Alias rétro-compatible (liste par défaut). Préférer `useCrownStyles()`. */
export const CROWN_STYLES = CROWN_STYLES_DEFAULT;

export type Persona = {
  id: string;
  name: string;
  essence: string; // une phrase — comment la maison l'accueille
  builtin: boolean;
};

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const PERSONAS_SEED: Persona[] = [];

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const CLIENTS_SEED: Client[] = [];

export const clientsStore = createStore<Client[]>('mnd_clients', CLIENTS_SEED);
export const personasStore = createStore<Persona[]>('mnd_personas', PERSONAS_SEED);

export const useClients = () => useStore(clientsStore);
export const usePersonas = () => useStore(personasStore);

import { bindCollection, bindDocument } from './sync';
bindCollection(clientsStore, 'clients');
bindCollection(personasStore, 'personas');
bindDocument(crownStylesStore, 'mnd_crown_styles');
bindDocument(segmentsStore, 'mnd_segments');
