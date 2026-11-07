/* ══ LES REÇUS DES CONVERSATIONS, LE PUR · 6 novembre 2026 ═════════════════
   « Je ne remarque jamais quand j'ai de nouveaux messages qui arrivent dans
   la conversation. C'est toujours mélangé avec le tout. J'ai vraiment besoin
   de voir quand un message arrive, parce que c'est pas possible : je les
   loupe toujours. » (Yéman, 6 novembre 2026, 21 h 45, sur une capture de
   l'écran Conversations). Au sélecteur : « Construis ce soir, v0 ».

   CE QUE CE FICHIER JUGE, et rien d'autre :
   · quelles boîtes sont REÇUES : son dernier message (WhatsApp, chat du
     site, vocal, demande, Ma Couronne) est plus récent que la dernière
     ouverture par une personne de la Maison, et personne de l'équipe n'a
     écrit depuis. Un appel noté n'est pas un message ; un démarcheur trié
     (bloqué, proposition) ne se reçoit pas ;
   · COMBIEN de ses messages attendent dans chaque boîte depuis la dernière
     ouverture (ou la dernière main de l'équipe) ;
   · si PERLE (l'assistant, l'automate) a répondu depuis : la boîte RESTE
     reçue et on le dit (« Perle a répondu »). Seule une PERSONNE qui ouvre
     la conversation la fait sortir : jamais Perle, l'automate ni un modèle ;
   · LA PLUS RÉCENTE en tête (la pastille de la barre y mène) ;
   · quelle ISO écrire quand une personne ouvre la boîte (« lu ») ;
   · l'heure d'arrivée en peu de mots : « 9 h 24 », « hier 18 h 40 »,
     « mar. 4 nov. » ;
   · le titre de l'onglet du navigateur : « (3) Le Trône … », sans
     parenthèse à zéro.

   LE DOCUMENT PARTAGÉ `mnd_conversations_lues` (shared/conversations-lues) :
   { [clé de la boîte]: ISO de la dernière bulle d'elle lue }. Il vaut sur
   tous les postes, comme `mnd_rien_a_repondre`. Les instants se comparent
   en millisecondes, jamais en texte (même règle que `estRangee`).

   RIEN AVANT CE SOIR NE SE REÇOIT (`DEBUT_DES_RECUS`) : le document naît
   vide ; sans ce seuil, chaque conversation jamais rouverte depuis des mois
   serait « reçue » au premier matin, et tout serait de nouveau mélangé.

   Pur : `scripts/verifie-recus.mjs` le prouve (et `--prouve`). */

import type { AuteurDeBulle, Boite, Bulle, SourceDeBulle } from './boite-unique-pur';

/* ── LES MOTS ────────────────────────────────────────────────────────────── */

/** Le document partagé : par clé de boîte, l'ISO de la dernière bulle d'elle lue. */
export type ConversationsLues = Record<string, string>;

/** Une boîte reçue, telle que l'écran et la barre la lisent. */
export type Recu = {
  cle: string;
  nom: string;
  /** L'instant de son dernier message (ISO). */
  quand: string;
  /** Ses messages arrivés depuis la dernière ouverture (ou la dernière main de l'équipe). */
  nombre: number;
  /** Perle ou l'automate lui a répondu depuis : elle n'attend peut-être plus, mais personne ne l'a lue. */
  perleARepondu: boolean;
  /** Ce qui suit `#/gerard?vue=conversations&` pour l'ouvrir (`n=`, `c=` ou `d=`). */
  adresse: string;
};

/** Ce qui est un MESSAGE d'elle : ce qu'elle a écrit ou dit, pas un appel noté par l'équipe. */
export const SOURCES_RECUES: ReadonlySet<SourceDeBulle> = new Set<SourceDeBulle>(['whatsapp', 'chat', 'vocal', 'demande', 'couronne']);
/** Les voix de la Maison qui répondent SEULES : elles ne font pas « lu ». */
export const VOIX_DE_PERLE: ReadonlySet<AuteurDeBulle> = new Set<AuteurDeBulle>(['assistant', 'automate']);
/** Minuit à Cotonou, le 6 novembre 2026 : rien d'avant ne se reçoit. */
export const DEBUT_DES_RECUS = '2026-11-06T00:00:00+01:00';
const DEBUT_MS = Date.parse(DEBUT_DES_RECUS);

type BoiteRecevable = Pick<Boite, 'cle' | 'nom' | 'bulles' | 'tri' | 'numero' | 'clientId' | 'discussionId'>;

const ms = (iso: string | undefined): number => (iso ? Date.parse(iso) : NaN);

/* ── SON DERNIER MESSAGE ─────────────────────────────────────────────────── */

export const estUnMessageDElle = (x: Pick<Bulle, 'auteur' | 'source'>): boolean => x.auteur === 'elle' && SOURCES_RECUES.has(x.source);

/** La dernière bulle d'elle qui est un message (les bulles sont dans l'ordre du temps). */
export function dernierMessageDElle(b: Pick<Boite, 'bulles'>): Bulle | undefined {
  for (let i = b.bulles.length - 1; i >= 0; i--) if (estUnMessageDElle(b.bulles[i])) return b.bulles[i];
  return undefined;
}

/** `n=`, `c=` ou `d=` : la même règle que le geste « ouvrir » de l'écran. */
export function adresseDeLaBoite(b: Pick<Boite, 'numero' | 'clientId' | 'discussionId'>): string {
  if (b.numero) return `n=${encodeURIComponent(b.numero)}`;
  if (b.clientId) return `c=${encodeURIComponent(b.clientId)}`;
  if (b.discussionId) return `d=${encodeURIComponent(b.discussionId)}`;
  return '';
}

/* ── REÇUE ? ─────────────────────────────────────────────────────────────── */

/** REÇUE si son dernier message est d'après le début, d'après la dernière
    lecture (`lues[cle]`), et qu'aucune personne de l'équipe n'a écrit
    depuis. Perle, l'automate, un modèle, le chat automatique ne comptent ni
    pour une lecture ni pour une main. */
export function recuDe(b: BoiteRecevable, lues: Readonly<ConversationsLues> | null | undefined): Recu | null {
  if (b.tri) return null;
  const dernier = dernierMessageDElle(b);
  if (!dernier) return null;
  const t = ms(dernier.quand);
  if (!Number.isFinite(t) || t < DEBUT_MS) return null;
  const lu = ms(lues?.[b.cle]);
  if (Number.isFinite(lu) && t <= lu) return null;
  let derniereMain = Number.NEGATIVE_INFINITY;
  let perle = false;
  for (const x of b.bulles) {
    const q = ms(x.quand);
    if (!Number.isFinite(q)) continue;
    if (x.auteur === 'equipe' && q > derniereMain) derniereMain = q;
    if (VOIX_DE_PERLE.has(x.auteur) && q >= t) perle = true;
  }
  if (derniereMain > t) return null;
  const borne = Math.max(Number.isFinite(lu) ? lu : Number.NEGATIVE_INFINITY, derniereMain, DEBUT_MS - 1);
  const nombre = b.bulles.filter((x) => estUnMessageDElle(x) && ms(x.quand) > borne).length;
  return { cle: b.cle, nom: b.nom, quand: dernier.quand, nombre: Math.max(1, nombre), perleARepondu: perle, adresse: adresseDeLaBoite(b) };
}

/** Les boîtes reçues, la plus récente en tête. */
export function recusDesBoites(boites: readonly BoiteRecevable[], lues: Readonly<ConversationsLues> | null | undefined): Recu[] {
  return boites.map((b) => recuDe(b, lues)).filter((r): r is Recu => r !== null)
    .sort((x, y) => ms(y.quand) - ms(x.quand));
}

/** La plus récente, celle que la pastille de la barre ouvre. */
export const plusRecente = (recus: readonly Recu[]): Recu | undefined => recus[0];

/* ── LU ──────────────────────────────────────────────────────────────────── */

/** L'ISO à écrire quand une personne a la boîte sous les yeux : son dernier
    message. `undefined` si elle n'a rien écrit : rien à marquer. */
export const isoALire = (b: Pick<Boite, 'bulles'>): string | undefined => dernierMessageDElle(b)?.quand;

/** FAUT-IL ÉCRIRE ? Seulement si c'est plus récent que ce qui est écrit :
    deux postes qui ont la même boîte ouverte ne se réécrivent pas l'un
    l'autre, et une ISO illisible ne s'écrit jamais. */
export function aMarquer(lues: Readonly<ConversationsLues> | null | undefined, cle: string, iso: string | undefined): boolean {
  if (!cle || !iso) return false;
  const t = ms(iso);
  if (!Number.isFinite(t)) return false;
  const deja = ms(lues?.[cle]);
  return !Number.isFinite(deja) || deja < t;
}

/* ── LES TEXTES ──────────────────────────────────────────────────────────── */

const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const COTONOU_MS = 3_600_000;
/** Cotonou est à UTC+1 toute l'année : on décale, puis on lit en UTC. */
const aCotonou = (t: number): Date => new Date(t + COTONOU_MS);
const jourDe = (d: Date): string => d.toISOString().slice(0, 10);

/** « 9 h 24 » le jour même, « hier 18 h 40 », sinon « mar. 4 nov. » (et
    l'année si ce n'est pas la même). Vide si l'instant est illisible. */
export function heureRecueDite(iso: string, maintenantMs: number): string {
  const t = ms(iso);
  if (!Number.isFinite(t) || !Number.isFinite(maintenantMs)) return '';
  const d = aCotonou(t);
  const heure = `${d.getUTCHours()} h ${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const jour = jourDe(d);
  const aujourdhui = aCotonou(maintenantMs);
  if (jour === jourDe(aujourdhui)) return heure;
  if (jour === jourDe(new Date(aujourdhui.getTime() - 86_400_000))) return `hier ${heure}`;
  const n = d.getUTCDate();
  const date = `${JOURS_COURTS[d.getUTCDay()]} ${n === 1 ? '1er' : n} ${MOIS_COURTS[d.getUTCMonth()]}`;
  return d.getUTCFullYear() === aujourdhui.getUTCFullYear() ? date : `${date} ${d.getUTCFullYear()}`;
}

/** « Reçus · 3 » en tête de la liste. */
export const titreDesRecus = (n: number): string => `Reçus · ${n}`;

/** Le mot de la pastille de la barre : « 1 reçu · 9 h 24 », « 3 reçus · hier 18 h 40 ». */
export function motDeLaPastille(recus: readonly Recu[], maintenantMs: number): string {
  const n = recus.length;
  if (n === 0) return '';
  const h = heureRecueDite(recus[0].quand, maintenantMs);
  return `${n} reçu${n > 1 ? 's' : ''}${h ? ` · ${h}` : ''}`;
}

/** Le titre de l'onglet sans son compte d'avant : « (3) Le Trône » redevient « Le Trône ». */
export const titreDeBase = (titre: string): string => titre.replace(/^\(\d+\)\s*/, '');

/** « (3) Le Trône … » ; à zéro, le titre nu, sans parenthèse. */
export const titreDeLOnglet = (base: string, n: number): string => (n > 0 ? `(${n}) ${titreDeBase(base)}` : titreDeBase(base));
