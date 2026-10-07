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
  /** Le nom du magasin de la ligne sur l'appareil (« mnd_secretariat ») :
      de quoi relire la ligne actuelle même si son écran n'est pas ouvert. */
  magasin?: string;
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

/* ══ CE QUE LA MAISON CALCULE NE SE DISPUTE PAS — 4 octobre 2026 ════════

   « Synchronisé · 19 conflits, fix it for good » (Yéman). Dix-neuf produits de
   la Gamme, la même minute, des deux côtés le même nom : rien ne distinguait
   « la vôtre » de « l'autre ». La différence était dans `stock`, que personne
   n'avait tapé. Le miroir de la vitrine (`stock.ts`, `recalculeMiroir`)
   recalcule ce chiffre depuis le journal des mouvements, SUR CHAQUE POSTE, à
   chaque fois que le journal bouge, même ailleurs. Deux postes recalculent à
   la même minute ; le plus lent écrit un geste plus ancien que l'écriture de
   l'autre ; le « dernier geste gagne » en fait un conflit à trancher.

   LA RÈGLE, pas le cas du jour : un champ DÉRIVÉ (recalculé d'une source qui se
   synchronise elle-même) n'est pas un geste. Quand deux versions ne diffèrent
   QUE par des champs dérivés, la plus récente reste et rien n'est demandé :
   chaque poste le recalculera de la même source. Une table déclare ses champs
   dérivés ici ; la déclaration peut dépendre de la ligne (le stock d'un
   produit n'est dérivé que s'il est relié au journal ; celui d'un produit sans
   fiche reste un compteur tenu à la main, et son conflit reste montré).

   La règle s'applique à l'entrée (aucun conflit vide n'est noté) ET à la
   lecture (ceux déjà gardés sur le téléphone disparaissent d'eux-mêmes). */
type Derives = (ligne: Record<string, unknown>) => readonly string[];
const DERIVES = new Map<string, Derives>();

export function declareChampsDerives(table: string, champs: readonly string[] | Derives): void {
  DERIVES.set(table, typeof champs === 'function' ? champs : () => champs);
}

/** Une valeur comparable : les clés rangées, à toute profondeur — jsonb rend
    les champs dans un autre ordre que le téléphone. */
const canonique = (v: unknown): string => JSON.stringify(v, (_k, x) =>
  (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x as Record<string, unknown>).sort().map((k) => [k, (x as Record<string, unknown>)[k]]))
    : x));

const enLigne = (j: string | null): Record<string, unknown> | null => {
  if (j === null) return null;
  try {
    const v = JSON.parse(j) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : { valeur: v };
  } catch { return { valeur: j }; }
};

/** LES CHAMPS QUI DIFFÈRENT VRAIMENT entre les deux versions, champs dérivés
    retirés. `null` d'un côté (une suppression) : la ligne entière diffère. */
export function champsQuiDifferent(c: Pick<Conflit, 'table' | 'notre' | 'leur'>): string[] {
  const a = enLigne(c.notre);
  const b = enLigne(c.leur);
  if (!a || !b) return a === b ? [] : ['(la ligne entière)'];
  const derive = DERIVES.get(c.table);
  const ignores = new Set(derive ? [...derive(a), ...derive(b)] : []);
  const cles = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...cles].filter((k) => !ignores.has(k) && canonique(a[k]) !== canonique(b[k])).sort();
}

/* ══ UN CONFLIT DÉJÀ TRANCHÉ NE SE DEMANDE PLUS — 6 octobre 2026 ═══════
   « Je ne comprends pas les synchros en échec, 11 conflits. Répondre "c'est
   bien ainsi" ou "reprendre ma version" ne me convient pas » (Yéman). Onze
   conflits sur le même objet de lettre, chacun d'une lettre (« Moov Afric »
   contre « Moov Africa ») : les étapes de SA frappe, prises pour une dispute.

   Quand la ligne a été RÉÉCRITE depuis le conflit (on a continué à taper,
   on a corrigé ailleurs), la question ne se pose plus : la ligne d'aujourd'hui
   ne porte plus la version gardée, c'est donc qu'on a tranché, en écrivant.
   Le conflit ne reste à l'écran que tant que la ligne porte ENCORE, sur les
   champs disputés, la version gardée d'ailleurs. Chaque magasin dit où lire
   sa ligne actuelle (`declareLecteurDeLigne`, posé par la synchro). */
type LecteurDeLigne = () => readonly unknown[];
const LECTEURS = new Map<string, LecteurDeLigne>();
export function declareLecteurDeLigne(table: string, lire: LecteurDeLigne): void { LECTEURS.set(table, lire); }

/* LA LIGNE SE RELIT AUSSI SUR L'APPAREIL (6 octobre 2026, le soir même).
   Le lecteur d'un magasin n'existe qu'une fois son écran chargé : depuis le
   tableau de bord, le secrétariat n'était pas encore là, et ses onze conflits
   restaient comptés. Sans lecteur, on relit la ligne dans ce que l'appareil
   garde de ce magasin : le nom noté avec le conflit, sinon `mnd_<table>`. */
function lesLignesSurLAppareil(c: Pick<Conflit, 'table'> & { magasin?: string }): readonly unknown[] | undefined {
  try {
    const nom = c.magasin ?? `mnd_${c.table}`;
    const brut = localStorage.getItem(`${surface()}::${nom}`) ?? localStorage.getItem(nom);
    const lignes = brut ? (JSON.parse(brut) as unknown) : null;
    return Array.isArray(lignes) ? lignes : undefined;
  } catch { return undefined; }
}

/* ══ UNE LIGNE SUPPRIMÉE NE SE DISPUTE PLUS — 7 octobre 2026 ══════════
   « Résoudre les 11 conflits » (Yéman, le lendemain) : les mêmes onze, les
   étapes de sa frappe sur deux lettres du secrétariat. Les deux lettres
   n'existaient plus sur le poste : sans ligne à relire, la règle du 6
   gardait le conflit, pour toujours. Or une ligne supprimée depuis ne
   laisse rien à garder ni à reprendre (« Reprendre ma version » la ferait
   même renaître). La question ne se pose plus.

   LA GARDE : un magasin VIDE ne prouve rien (pas encore descendu, écran
   jamais ouvert sur ce poste) : le conflit reste alors montré, comme avant. */
function laLigneActuelle(c: Pick<Conflit, 'table' | 'id'> & { magasin?: string }): { connue: boolean; ligne?: Record<string, unknown> } {
  const lire = LECTEURS.get(c.table);
  const lignes = lire ? lire() : lesLignesSurLAppareil(c);
  if (!lignes || lignes.length === 0) return { connue: false };
  const ligne = lignes.find((x) => !!x && typeof x === 'object' && (x as { id?: unknown }).id === c.id);
  return { connue: true, ligne: ligne as Record<string, unknown> | undefined };
}

export function dejaTranche(c: Pick<Conflit, 'table' | 'id' | 'notre' | 'leur'> & { magasin?: string }): boolean {
  const gardee = enLigne(c.leur);
  if (!gardee) return false;
  const actuel = laLigneActuelle(c);
  if (!actuel.connue) return false;
  /* Supprimée depuis le conflit : plus rien à trancher. */
  if (!actuel.ligne) return true;
  /* Notre suppression contre une version qui vit encore : la question reste. */
  if (!enLigne(c.notre)) return false;
  const ligne = actuel.ligne;
  return champsQuiDifferent(c).some((k) => canonique(ligne[k]) !== canonique(gardee[k]));
}

/** Un conflit qui DIFFÈRE : au moins un champ tenu à la main. C'est le
    seul filtre au moment de NOTER : à cet instant, la ligne affichée porte
    encore notre version (la version gardée s'applique juste après), et
    « déjà tranché » s'y tromperait (vu au banc de la file, 6 octobre). */
export const conflitQuiDiffere = (c: Pick<Conflit, 'table' | 'notre' | 'leur'>): boolean => champsQuiDifferent(c).length > 0;

/** Un conflit qui mérite un regard, À LA LECTURE : il diffère, et la ligne ne
    l'a pas tranché depuis. */
export const conflitUtile = (c: Pick<Conflit, 'table' | 'id' | 'notre' | 'leur'>): boolean =>
  conflitQuiDiffere(c) && !dejaTranche(c);

export function lisLesConflits(): Conflit[] {
  try { return (JSON.parse(localStorage.getItem(CLE_DES_CONFLITS()) || '[]') as Conflit[]).filter(conflitUtile); } catch { return []; }
}

/** « Tout garder ainsi » : la liste se vide d'un geste. Rien n'est défait —
    la version gardée est déjà celle de la Maison. */
export function oublieTousLesConflits(): void {
  try { localStorage.removeItem(CLE_DES_CONFLITS()); } catch { /* idem */ }
  annonce();
}

/** Les conflits se gardent, les plus récents d'abord, cent au plus. */
export function noteLesConflits(nouveaux: readonly Conflit[]): void {
  nouveaux = nouveaux.filter(conflitQuiDiffere);
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

/** Les gestes en attente, table par table, avec l'heure du plus ancien —
    pour le panneau de la pastille (temps 3). */
export function gestesParTable(): { table: string; n: number; depuis: string }[] {
  const sortie: { table: string; n: number; depuis: string }[] = [];
  try {
    const tete = `${surface()}::file::`;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(tete) || k === CLE_DES_CONFLITS()) continue;
      const entrees = Object.values(JSON.parse(localStorage.getItem(k) || '{}') as Record<string, Entree>);
      if (!entrees.length) continue;
      sortie.push({ table: k.slice(tete.length), n: entrees.length, depuis: entrees.map((e) => e.at).sort()[0] });
    }
  } catch { /* idem */ }
  return sortie.sort((a, b) => a.depuis.localeCompare(b.depuis));
}

/* Les écrans s'abonnent : la pastille compte les gestes, la liste des conflits
   se redessine. */
const ecouteurs = new Set<() => void>();
let version = 0;
const annonce = (): void => { version += 1; ecouteurs.forEach((f) => f()); };
export const abonneLaFile = (f: () => void): (() => void) => { ecouteurs.add(f); return () => { ecouteurs.delete(f); }; };
export const versionDeLaFile = (): number => version;
