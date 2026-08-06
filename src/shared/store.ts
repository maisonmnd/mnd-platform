import { useSyncExternalStore } from 'react';

/* Magasin persisté en localStorage.
   Chaque clé émet un CustomEvent local + réagit au `storage` des autres onglets,
   ce qui reproduit le comportement des prototypes (.dc.html).

   ── CHAQUE SURFACE A SON CACHE — 6 août 2026 ─────────────────────────
   Le Trône et Ma Couronne vivent sur le MÊME domaine : ils partageaient donc
   le même localStorage. C'était présenté comme « le pont entre les surfaces
   sœurs » ; c'était une bombe.

   Une cliente connectée à Ma Couronne ne lit qu'UNE fiche — la sienne, la
   sécurité de la base y veille. Cette lecture réduite écrasait le cache
   commun. De retour au Trône, le poste croyait n'avoir plus qu'une cliente
   sur 186 et voulait aligner le serveur là-dessus : 186 clientes, 406
   rendez-vous et 58 factures à effacer. Seuls les garde-fous anti-effacement
   de masse ont sauvé la Maison, le 6 août, sur le compte d'un employé.

   Les deux surfaces se parlent par le SERVEUR, jamais par le cache. Le
   partager n'apportait rien et exposait tout. Chaque clé porte désormais le
   nom de sa surface, lu sur `<body data-surface>`.

   Les anciennes clés ne sont pas reprises : les reprendre aurait recopié
   l'état corrompu dans le nouveau cache. On repart du serveur, qui n'a
   jamais cessé d'être juste. */
const SURFACE = (typeof document !== 'undefined' && document.body?.dataset?.surface) || 'trone';
const nsKey = (key: string): string => `${SURFACE}::${key}`;

type Listener = () => void;

const EVT = 'mnd:store';

/* Réinitialisation de la Maison — purge unique des anciennes données de
   démonstration (bump le suffixe pour re-purger tous les navigateurs).
   v3 : après la fuite d'un onglet resté ouvert sur l'ancien déploiement.
   S'exécute avant toute création de magasin. */
const RESET_FLAG = 'mnd_reset_v5';
if (!localStorage.getItem(RESET_FLAG)) {
  /* v5 : emporte AUSSI les clés partagées d'avant le cloisonnement. Un cache
     hérité de l'ancien régime peut porter la vue tronquée d'une cliente. */
  Object.keys(localStorage)
    .filter((k) => k.startsWith('mnd_') || k.includes('::mnd_'))
    .forEach((k) => localStorage.removeItem(k));
  localStorage.setItem(RESET_FLAG, '1');
}

export type Store<T> = {
  key: string;
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (fn: Listener) => () => void;
};

/* Maison À BLANC — posé par la réinitialisation totale (Système · Paramètres) :
   après un reset, les semences de COLLECTION ne doivent PAS repeupler le serveur
   (sinon le catalogue, les personas, les caisses… reviendraient). Les branches
   sont la seule exception : l'app a besoin d'au moins une branche pour tourner.
   Les documents-objets (réglages, marque) gardent leurs valeurs par défaut :
   ce sont des réglages, pas des données. */
export const HOUSE_BLANK = localStorage.getItem('mnd_house_blank') === '1';
const BLANK_KEEP = new Set(['mnd_branches', 'mnd_current_branch']);

export function createStore<T>(key: string, initial: T): Store<T> {
  const seed: T = HOUSE_BLANK && Array.isArray(initial) && !BLANK_KEEP.has(key) ? ([] as unknown as T) : initial;
  let cache: T | undefined;
  let cachedRaw: string | null = null;

  const read = (): T => {
    const raw = localStorage.getItem(nsKey(key));
    if (raw === null) return seed;
    if (raw === cachedRaw && cache !== undefined) return cache;
    try {
      cache = JSON.parse(raw) as T;
      cachedRaw = raw;
      return cache;
    } catch {
      return seed;
    }
  };

  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach((fn) => fn());

  /* L'evenement `storage` porte la cle REELLE : c'est celle de la surface
     qu'il faut comparer, sinon deux onglets du meme Trone cessent de se
     repondre. */
  window.addEventListener('storage', (e) => {
    if (e.key === nsKey(key)) notify();
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
      localStorage.setItem(nsKey(key), cachedRaw);
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
    /* La cle de surface, sinon la purge de deconnexion ne retirerait rien. */
    try { localStorage.removeItem(nsKey(k)); } catch { /* stockage indisponible — tant pis */ }
    window.dispatchEvent(new CustomEvent(EVT, { detail: k }));
  }
}
