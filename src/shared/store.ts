import { useSyncExternalStore } from 'react';

/* Magasin persisté en localStorage — le pont entre les surfaces sœurs.
   Chaque clé émet un CustomEvent local + réagit au `storage` des autres onglets,
   ce qui reproduit le comportement des prototypes (.dc.html). */

type Listener = () => void;

const EVT = 'mnd:store';

/* Réinitialisation de la Maison — purge unique des anciennes données de
   démonstration (bump le suffixe pour re-purger tous les navigateurs).
   v3 : après la fuite d'un onglet resté ouvert sur l'ancien déploiement.
   S'exécute avant toute création de magasin. */
const RESET_FLAG = 'mnd_reset_v4';
if (!localStorage.getItem(RESET_FLAG)) {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('mnd_'))
    .forEach((k) => localStorage.removeItem(k));
  localStorage.setItem(RESET_FLAG, '1');
}

export type Store<T> = {
  key: string;
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (fn: Listener) => () => void;
};

export function createStore<T>(key: string, initial: T): Store<T> {
  let cache: T | undefined;
  let cachedRaw: string | null = null;

  const read = (): T => {
    const raw = localStorage.getItem(key);
    if (raw === null) return initial;
    if (raw === cachedRaw && cache !== undefined) return cache;
    try {
      cache = JSON.parse(raw) as T;
      cachedRaw = raw;
      return cache;
    } catch {
      return initial;
    }
  };

  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach((fn) => fn());

  window.addEventListener('storage', (e) => {
    if (e.key === key) notify();
  });
  window.addEventListener(EVT, (e) => {
    if ((e as CustomEvent).detail === key) notify();
  });

  return {
    key,
    get: read,
    set: (next) => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(read()) : next;
      cache = value;
      cachedRaw = JSON.stringify(value);
      localStorage.setItem(key, cachedRaw);
      window.dispatchEvent(new CustomEvent(EVT, { detail: key }));
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function useStore<T>(store: Store<T>): [T, Store<T>['set']] {
  const value = useSyncExternalStore(store.subscribe, store.get, store.get);
  return [value, store.set];
}

/** Identifiant court, stable, sans dépendance. */
export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/** Purge ciblée du cache local (déconnexion) : retire les clés données et notifie
    leurs magasins (retour à la valeur initiale). Les données re-hydratent depuis
    Supabase à la prochaine connexion — rien n'est perdu côté serveur. */
export function purgeLocalKeys(keys: string[]): void {
  for (const k of keys) {
    try { localStorage.removeItem(k); } catch { /* stockage indisponible — tant pis */ }
    window.dispatchEvent(new CustomEvent(EVT, { detail: k }));
  }
}
