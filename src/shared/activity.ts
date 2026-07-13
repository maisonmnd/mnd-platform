import { createStore, useStore } from './store';
import { bindCollection } from './sync';

/* Suivi d'activité des clientes sur Ma Couronne — synchronisé Supabase.
   Ma Couronne écrit une session par visite (début, dernière activité, durée) ;
   Le Trône la lit pour monitorer la présence et le temps passé sur la plateforme. */

export type ClientSession = {
  id: string;
  clientId: string;
  clientName?: string;
  branchId?: string;
  startedAt: string; // ISO
  lastSeenAt: string; // ISO — mis à jour par battement de cœur
  durationSec: number; // temps cumulé de la session
  screen?: string; // dernier écran vu (accueil, réservation…)
};

export const clientSessionsStore = createStore<ClientSession[]>('mnd_client_sessions', []);
export const useClientSessions = () => useStore(clientSessionsStore);

bindCollection(clientSessionsStore, 'client_sessions');

/** En ligne si la dernière activité remonte à moins de `graceSec` (défaut 90 s). */
export const isOnline = (s: ClientSession, graceSec = 90): boolean =>
  Date.now() - new Date(s.lastSeenAt).getTime() < graceSec * 1000;
