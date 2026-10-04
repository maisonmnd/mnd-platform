/* ══ LA FILE D'ATTENTE DURABLE — 4 octobre 2026 ═══════════════════════════
   « Une version du Trône qui fonctionne hors connexion : le téléphone fait
   foi, la synchronisation se fait quand le réseau revient » (Yéman).
   Maquette « Le Trône hors ligne », validée. Temps 1.

   CE QUI SE PERDAIT. La couche de synchronisation ne retenait les gestes
   locaux que pour la SÉANCE (la « fenêtre froide ») : un encaissement fait
   sans réseau, puis l'application fermée, était effacé par le serveur à la
   réouverture. Et un changement venu d'un autre poste pendant qu'un geste
   attendait faisait passer ce geste pour déjà envoyé : il ne partait jamais.

   LA FILE. Chaque geste local s'inscrit ici, table par table, avec son HEURE,
   et survit à la fermeture : `{ id → { op, at, j } }`. Il n'en sort que
   lorsque le serveur l'a reçu.

   LE DERNIER GESTE GAGNE (arbitrage du 3 octobre). Au retour, chaque geste
   en attente se compare à la dernière écriture du serveur sur la même ligne :
   le plus récent l'emporte. Celui qui perd n'est jamais jeté : il devient un
   CONFLIT, lisible, que l'on peut reprendre.

   Ce module est pur : `arbitre` ne touche ni réseau ni stockage, le harnais
   `verifie-la-file-d-attente` l'éprouve. La lecture et l'écriture de la file
   sur l'appareil sont à part, en bas. */

export type Entree = {
  op: 'set' | 'del';
  /** L'heure du geste, sur le téléphone (ISO). */
  at: string;
  /** La ligne telle que le geste l'a laissée (JSON), pour un `set`. */
  j?: string;
};

export type Conflit = {
  table: string;
  id: string;
  /** Ce que ce téléphone avait fait, et quand. `null` : il l'avait supprimée. */
  notre: string | null;
  notreAt: string;
  /** Ce que le serveur porte, et depuis quand. */
  leur: string;
  leurAt: string;
  /** Quand le conflit a été constaté. */
  vuLe: string;
};

export type Arbitrage<T> = {
  /** L'état à poser dans le magasin : le serveur, gestes gagnants par-dessus. */
  items: T[];
  /** Les gestes qui gagnent et doivent partir. */
  aPousser: string[];
  /** Les gestes qui sortent de la file : arrivés, ou perdants. */
  finis: string[];
  /** Les gestes perdants, gardés pour être relus. */
  conflits: Omit<Conflit, 'table' | 'vuLe'>[];
};

/**
 * Rejoue la file sur l'état du serveur.
 * `quand` : l'heure de la dernière écriture du serveur par ligne ; `null` quand
 * on n'a pas pu la lire — le téléphone fait foi alors, sans arbitrage.
 * `canon` : la forme comparable d'une ligne (champs rangés).
 */
export function arbitre<T extends { id: string }>(
  serveur: readonly T[],
  quand: ReadonlyMap<string, string> | null,
  attente: ReadonlyMap<string, Entree>,
  canon: (x: unknown) => string,
): Arbitrage<T> {
  const parId = new Map<string, T>(serveur.map((it) => [it.id, it]));
  const aPousser: string[] = [];
  const finis: string[] = [];
  const conflits: Arbitrage<T>['conflits'] = [];
  for (const [id, e] of attente) {
    const s = parId.get(id);
    const sAt = quand?.get(id);
    const plusRecentAilleurs = !!s && !!sAt && Date.parse(sAt) > Date.parse(e.at);
    if (e.op === 'set') {
      const notre = e.j ? (JSON.parse(e.j) as T) : null;
      if (!notre) { finis.push(id); continue; }
      /* Déjà arrivé (l'application s'était fermée juste après l'envoi). */
      if (s && canon(s) === canon(notre)) { finis.push(id); continue; }
      if (plusRecentAilleurs) {
        conflits.push({ id, notre: e.j!, notreAt: e.at, leur: JSON.stringify(s), leurAt: sAt! });
        finis.push(id);
        continue;
      }
      parId.set(id, notre);
      aPousser.push(id);
    } else {
      if (!s) { finis.push(id); continue; }
      if (plusRecentAilleurs) {
        conflits.push({ id, notre: null, notreAt: e.at, leur: JSON.stringify(s), leurAt: sAt! });
        finis.push(id);
        continue;
      }
      parId.delete(id);
      aPousser.push(id);
    }
  }
  return { items: [...parId.values()], aPousser, finis, conflits };
}

/** Une ligne venue d'ailleurs en direct, pendant qu'un geste l'attend : qui
    gagne ? `true` = le geste local reste, `false` = la ligne distante gagne. */
export const leGesteLocalTient = (e: Entree, distantAt: string | undefined): boolean =>
  !distantAt || Date.parse(distantAt) <= Date.parse(e.at);

/** Les gestes à inscrire, d'un état local à l'autre : ce qui a changé ou
    disparu, à l'heure `at`. */
export function gestesEntre(avant: ReadonlyMap<string, string>, apres: ReadonlyMap<string, string>, at: string): Map<string, Entree> {
  const sortie = new Map<string, Entree>();
  for (const [id, j] of apres) if (avant.get(id) !== j) sortie.set(id, { op: 'set', at, j });
  for (const id of avant.keys()) if (!apres.has(id)) sortie.set(id, { op: 'del', at });
  return sortie;
}

/** Après un envoi réussi : les gestes que le serveur a reçus TELS QU'ILS SONT
    (un geste plus récent, posé pendant l'envoi, reste dans la file). */
export function recus(attente: ReadonlyMap<string, Entree>, envoye: ReadonlyMap<string, string>): string[] {
  const sortie: string[] = [];
  for (const [id, e] of attente) {
    if (e.op === 'set' && envoye.get(id) === e.j) sortie.push(id);
    if (e.op === 'del' && !envoye.has(id)) sortie.push(id);
  }
  return sortie;
}

/* ── SUR L'APPAREIL ─────────────────────────────────────────────────────
   La file vit dans le stockage du navigateur, à côté des magasins, sous une
   clé par table. Elle est petite : seules les lignes touchées sans réseau. */

const surface = (): string => (typeof document !== 'undefined' && document.body?.dataset?.surface) || 'trone';
const cleDeLaFile = (table: string): string => `${surface()}::file::${table}`;
const CLE_DES_CONFLITS = (): string => `${surface()}::file::conflits`;

export function lisLaFile(table: string): Map<string, Entree> {
  try {
    const brut = localStorage.getItem(cleDeLaFile(table));
    if (!brut) return new Map();
    return new Map(Object.entries(JSON.parse(brut) as Record<string, Entree>));
  } catch {
    return new Map();
  }
}

export function ecrisLaFile(table: string, file: ReadonlyMap<string, Entree>): void {
  try {
    if (file.size === 0) localStorage.removeItem(cleDeLaFile(table));
    else localStorage.setItem(cleDeLaFile(table), JSON.stringify(Object.fromEntries(file)));
  } catch {
    /* Stockage plein ou refusé : la file vit en mémoire pour cette séance. */
  }
  annonce();
}

export function lisLesConflits(): Conflit[] {
  try { return JSON.parse(localStorage.getItem(CLE_DES_CONFLITS()) || '[]') as Conflit[]; } catch { return []; }
}

/** Les conflits se gardent, les plus récents d'abord, cent au plus. */
export function noteLesConflits(nouveaux: readonly Conflit[]): void {
  if (nouveaux.length === 0) return;
  try {
    const tous = [...nouveaux, ...lisLesConflits()].slice(0, 100);
    localStorage.setItem(CLE_DES_CONFLITS(), JSON.stringify(tous));
  } catch { /* idem */ }
  annonce();
}

export function oublieLeConflit(table: string, id: string, vuLe: string): void {
  try {
    localStorage.setItem(CLE_DES_CONFLITS(), JSON.stringify(lisLesConflits().filter((c) => !(c.table === table && c.id === id && c.vuLe === vuLe))));
  } catch { /* idem */ }
  annonce();
}

/** Combien de gestes attendent, toutes tables confondues. */
export function gestesEnAttente(): number {
  let n = 0;
  try {
    const tete = `${surface()}::file::`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(tete) || k === CLE_DES_CONFLITS()) continue;
      n += Object.keys(JSON.parse(localStorage.getItem(k) || '{}')).length;
    }
  } catch { /* idem */ }
  return n;
}

/* Les écrans s'abonnent : la pastille compte les gestes, la liste des conflits
   se redessine. */
const ecouteurs = new Set<() => void>();
let version = 0;
const annonce = (): void => { version += 1; ecouteurs.forEach((f) => f()); };
export const abonneLaFile = (f: () => void): (() => void) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; };
export const versionDeLaFile = (): number => version;
