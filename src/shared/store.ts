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

/** LA CASE RÉELLE d'un magasin de CETTE surface (« trone::mnd_clients »), et
    son nom logique (« mnd_clients ») pour qui la lit de l'extérieur : la
    sauvegarde, la remise à blanc. Toute boucle sur `localStorage` qui cherche
    `mnd_*` au début de la clé manque les magasins depuis le 6 août : c'est ce
    qui vidait la sauvegarde et le « Remplacer la Maison » (18 septembre 2026). */
export const cleDeSurface = nsKey;
export const cleLogique = (cleReelle: string): string | null =>
  (cleReelle.startsWith(`${SURFACE}::`) ? cleReelle.slice(SURFACE.length + 2) : null);
/** Une clé de la Maison, d'avant ou d'après le cloisonnement. */
export const estCleDeLaMaison = (k: string): boolean => k.startsWith('mnd_') || k.includes('::mnd_');

type Listener = () => void;

const EVT = 'mnd:store';

/* Réinitialisation de la Maison — purge unique des anciennes données de
   démonstration (bump le suffixe pour re-purger tous les navigateurs).
   v3 : après la fuite d'un onglet resté ouvert sur l'ancien déploiement.
   S'exécute avant toute création de magasin. */
export const RESET_FLAG = 'mnd_reset_v5';
/** Exportée pour s'éprouver (`verifie-sauvegarde-maison`) : c'est elle qui,
    au rechargement, emportait le fichier de « Remplacer la Maison » quand la
    remise à blanc avait retiré ce drapeau. */
export function purgeDeReprise(): void {
  if (localStorage.getItem(RESET_FLAG)) return;
  /* v5 : emporte AUSSI les clés partagées d'avant le cloisonnement. Un cache
     hérité de l'ancien régime peut porter la vue tronquée d'une cliente. */
  Object.keys(localStorage)
    .filter(estCleDeLaMaison)
    .forEach((k) => localStorage.removeItem(k));
  localStorage.setItem(RESET_FLAG, '1');
}
purgeDeReprise();

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

/* ── LE DISQUE DU NAVIGATEUR PEUT ÊTRE PLEIN — 21 août 2026 ──────────
   LE MACBOOK DE LA MAISON : « tout arrive sauf les clientes », sur les trois
   comptes souverains, à chaque redémarrage.

   `localStorage.setItem` n'était protégé par rien. Quand le navigateur refuse
   d'écrire — quota dépassé, et Safari est de loin le plus strict — la ligne
   JETAIT, et l'événement qui prévient l'écran, juste en dessous, n'était
   jamais émis. Le magasin gardait sa valeur vide et l'écran restait blanc,
   sans un mot. Les fiches clientes sont le plus gros paquet de la Maison :
   c'est donc lui qui débordait, tout ce qui s'écrit avant passant très bien.

   Trois règles désormais, dans cet ordre :
   ① le refus du disque n'interrompt JAMAIS le geste — la valeur vit en
     mémoire, l'écran s'affiche, la Maison travaille ;
   ② l'écran est prévenu même quand l'écriture a échoué (c'est cette ligne-là
     qui manquait, et elle seule suffisait à tout figer) ;
   ③ le magasin passe alors en MÉMOIRE SEULE : il cesse de relire un disque
     qui ne porte plus qu'une valeur périmée, ou rien du tout.

   Le serveur reste la vérité : au prochain démarrage, tout se relit là-bas. */
const magasinsSatures = new Set<string>();

/** Les magasins que le navigateur a refusé d'écrire — nommés dans
    « Cet appareil » (Paramètres). Un poste saturé doit pouvoir le dire. */
export const magasinsEnMemoireSeule = (): string[] => [...magasinsSatures].sort();

/* ── LIRE NE RELIT PLUS LE DISQUE — 1er octobre 2026 ──────────────────
   « Quand je clique dans la barre de navigation du Trône, c'est lent »
   (Yéman), pour la troisième fois en deux jours.

   Chaque lecture d'un magasin redemandait sa case au navigateur et la
   comparait, caractère par caractère, à la dernière vue. Or un écran lit ses
   magasins à chaque affichage, et chaque ligne d'une liste lit les siens : le
   banc (`scripts/banc-de-la-barre.mjs`) a compté, pour UN clic dans la barre,
   de 200 à 17 000 lectures et trente mégaoctets relus, sur une Maison de 520
   fiches. Le coût grandit avec la Maison, à chaque rendez-vous de plus.

   LA RÈGLE : la mémoire fait foi, le disque ne se relit que si quelqu'un
   d'autre a pu y écrire. Trois portes le disent, et elles seules :
     · un autre onglet (l'événement `storage`) ;
     · une purge ou un autre magasin de la même clé (l'événement de la Maison) ;
     · une écriture directe dans la case (`relisLeDisque`, que son auteur appelle).
   Entre deux, lire coûte une comparaison, quelle que soit la taille. */
const aRelire = new Set<() => void>();

/** À appeler après avoir écrit DIRECTEMENT dans une case de magasin, sans
    passer par lui (la restauration d'une sauvegarde le fait) : les magasins
    relisent leur case à la prochaine lecture. */
export function relisLeDisque(): void {
  for (const marque of aRelire) marque();
}

export function createStore<T>(key: string, initial: T): Store<T> {
  const seed: T = HOUSE_BLANK && Array.isArray(initial) && !BLANK_KEEP.has(key) ? ([] as unknown as T) : initial;
  let cache: T | undefined;
  let cachedRaw: string | null = null;
  /* Le disque a refusé cette clé : la mémoire fait foi jusqu'au rechargement. */
  let memoireSeule = false;
  /* Le disque a pu changer sans nous : vrai au départ, et après chaque porte. */
  let disqueARelire = true;
  /* Nos propres écritures préviennent l'écran par le même événement que les
     purges : on ne se fait pas relire à soi-même ce qu'on vient d'écrire. */
  let enEcriture = 0;
  aRelire.add(() => { disqueARelire = true; });

  const read = (): T => {
    if (cache !== undefined && (memoireSeule || !disqueARelire)) return cache;
    const raw = localStorage.getItem(nsKey(key));
    /* Une case vide ne se retient pas : elle coûte une lecture de rien, et la
       semence revient d'elle-même après une purge. */
    if (raw === null) return seed;
    if (raw === cachedRaw && cache !== undefined) { disqueARelire = false; return cache; }
    try {
      cache = JSON.parse(raw) as T;
      cachedRaw = raw;
      disqueARelire = false;
      return cache;
    } catch {
      return seed;
    }
  };

  const listeners = new Set<Listener>();
  const notify = () => listeners.forEach((fn) => fn());

  /* L'evenement `storage` porte la cle REELLE : c'est celle de la surface
     qu'il faut comparer, sinon deux onglets du meme Trone cessent de se
     repondre. Une cle absente dit que l'autre onglet a tout vide. */
  window.addEventListener('storage', (e) => {
    if (e.key === null) { disqueARelire = true; return; }
    if (e.key === nsKey(key)) { disqueARelire = true; notify(); }
  });
  window.addEventListener(EVT, (e) => {
    if ((e as CustomEvent).detail !== key) return;
    if (enEcriture === 0) disqueARelire = true;
    notify();
  });

  return {
    key,
    get: read,
    set: (next) => {
      const value = typeof next === 'function' ? (next as (p: T) => T)(read()) : next;
      cache = value;
      cachedRaw = JSON.stringify(value);
      /* Ce qu'on écrit est ce que la mémoire porte : rien à relire. */
      disqueARelire = false;
      try {
        localStorage.setItem(nsKey(key), cachedRaw);
        if (memoireSeule) { memoireSeule = false; magasinsSatures.delete(key); }
      } catch {
        /* ① Le geste passe quand même. */
        memoireSeule = true;
        magasinsSatures.add(key);
        /* La valeur restée au disque est PÉRIMÉE — la relire ferait reculer
           l'écran sur un état plus ancien que celui qu'on vient de poser. */
        try { localStorage.removeItem(nsKey(key)); } catch { /* rien à faire de plus */ }
        console.warn(`[mnd-store] ${key} : le navigateur refuse d'écrire (mémoire saturée), on continue en mémoire seule.`);
      }
      /* ② TOUJOURS prévenir l'écran, écriture réussie ou non. */
      enEcriture += 1;
      try { window.dispatchEvent(new CustomEvent(EVT, { detail: key })); } finally { enEcriture -= 1; }
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
