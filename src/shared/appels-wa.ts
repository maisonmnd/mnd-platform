import { createStore, useStore } from './store';
import { bindCollection } from './sync';
import { numeroWa } from './conversations';

/* ══ LES APPELS WHATSAPP — 14 septembre 2026 ═════════════════════════

   « N'oublie pas que je dois recevoir les appels WhatsApp » (Yéman).
   Maquette `public/maquette-decrocher-dans-le-trone.html`, validée.

   LE CARNET EXISTANT NE DISPARAÎT PAS. « Les Appels » (`shared/appels.ts`)
   reste ce qu'il est : un carnet qu'on remplit à la main quand une cliente
   appelle sur le téléphone du salon. Le code y dit même, depuis le 25 août,
   qu'un navigateur ne peut pas détecter un appel. C'était vrai — pour les
   appels du réseau. Un appel WHATSAPP, lui, passe par Meta, et Meta nous le
   dit. Ce sont deux mondes, et ils se rangent au même endroit.

   POURQUOI UNE TABLE ET NON UN DOCUMENT. Le carnet à la main vit dans un
   document (`mnd_appels`), écrit par un poste à la fois. Un appel WhatsApp
   est écrit par LE SERVEUR pendant que trois postes lisent, et deux postes
   peuvent décrocher à la même seconde. Un document entier réécrit à chaque
   geste perdrait l'un des deux ; une table ne perd rien.

   TROIS MARCHES, ET CE FICHIER SERT LES TROIS. Savoir qu'on nous appelle,
   remplir le carnet tout seul, et faire sonner les postes. Les deux premières
   valent déjà sans la troisième : savoir qui a appelé et quand vaut mieux
   qu'un carnet qu'on oublie de remplir. */

export type EtatDAppel =
  /** Il sonne en ce moment. */
  | 'sonne'
  /** Quelqu'un a décroché — `prisPar` dit qui. */
  | 'pris'
  /** Personne n'a décroché. Il devient un rappel à faire. */
  | 'manque'
  /** Il a eu lieu et s'est terminé. */
  | 'fini'
  /** La Maison l'a refusé, ou la cliente a raccroché avant qu'on prenne. */
  | 'refuse';

export type AppelWa = {
  /** `wa-call-<identifiant Meta>` — déterministe, donc idempotent : Meta
      rappelle volontiers deux fois le même événement. */
  id: string;
  branchId?: string;
  /** L'identifiant que Meta donne à l'appel, et qu'il répète à chaque
      étape. C'est lui qui relie « ça sonne » à « c'est fini ». */
  callId: string;
  numero: string;
  /** La fiche, quand on a su la retrouver. Absente = tête inconnue. */
  clientId?: string;
  /** Le nom que WhatsApp annonce, pour une tête sans fiche. */
  nomProfil?: string;
  sens: 'entrant' | 'sortant';
  etat: EtatDAppel;
  /** ISO complet — l'instant où il a commencé à sonner. */
  sonneLe: string;
  prisLe?: string;
  /** QUI A DÉCROCHÉ. Tous les postes sonnent ; le premier qui prend gagne, et
      les autres se taisent parce qu'ils voient ce nom apparaître. */
  prisPar?: string;
  finiLe?: string;
  /** La durée en secondes, quand l'appel a eu lieu. */
  dureeS?: number;
  /** Le rappel posé au carnet quand l'appel est manqué — pour ne pas en
      poser deux si Meta répète l'événement. */
  rappelId?: string;
  /** Ce que Meta dit quand il refuse ou coupe. Un échec sans sa raison se
      cherche pendant des semaines. */
  detail?: string;
};

/* ══ CE QUE META DIT, ET CE QUE LA MAISON EN DIT ══════════════════════

   Meta nomme les étapes d'un appel à sa façon. On traduit une fois, ici, et
   un verdict inconnu ne devient JAMAIS « pris » : mieux vaut une Maison qui
   doute qu'une Maison qui croit avoir répondu. */
const ETAT_DE_META: Record<string, EtatDAppel> = {
  ringing: 'sonne',
  connect: 'pris',
  accepted: 'pris',
  terminate: 'fini',
  completed: 'fini',
  rejected: 'refuse',
  declined: 'refuse',
  missed: 'manque',
  failed: 'refuse',
};

export const etatDeMeta = (mot: string | undefined): EtatDAppel | null =>
  ETAT_DE_META[(mot ?? '').toLowerCase()] ?? null;

/* ══ COMBIEN DE TEMPS UN APPEL SONNE ══════════════════════════════════

   UN PANNEAU QUI SONNE POUR TOUJOURS EST PIRE QU'AUCUN PANNEAU. Si le
   message de fin n'arrive jamais — Meta l'a perdu, le webhook a eu une
   panne, le réseau a coupé — le Trône resterait à sonner pour une cliente
   qui a raccroché depuis un quart d'heure, et quelqu'un décrocherait dans le
   vide devant une autre cliente.

   QUARANTE-CINQ SECONDES : c'est ce qu'un téléphone sonne avant de renoncer,
   et c'est bien au-delà du temps qu'il faut pour traverser un salon. */
export const SONNERIE_MAX_MS = 45_000;

/** CET APPEL SONNE-T-IL ENCORE, VRAIMENT ? L'état ne suffit pas : il faut
    aussi que l'heure le dise. */
export const sonneEncore = (a: AppelWa, maintenant: number): boolean =>
  a.etat === 'sonne' && maintenant - Date.parse(a.sonneLe) < SONNERIE_MAX_MS;

/** L'APPEL QUI DOIT FAIRE SONNER LE POSTE, s'il y en a un.

    UN SEUL À LA FOIS, et c'est le plus récent : deux panneaux d'appel
    superposés ne se répondent pas, ils se gênent. */
export const appelQuiSonne = (
  appels: readonly AppelWa[], maintenant: number, branchId?: string,
): AppelWa | undefined => appels
  .filter((a) => a.sens === 'entrant' && sonneEncore(a, maintenant)
    && (!branchId || !a.branchId || a.branchId === branchId))
  .sort((a, b) => b.sonneLe.localeCompare(a.sonneLe))[0];

/** LE PREMIER QUI DÉCROCHE GAGNE.

    Tous les postes sonnent, et deux mains peuvent tomber ensemble. Celui qui
    trouve un nom déjà posé se tait — il ne « perd » pas l'appel, il apprend
    qu'il est pris, et c'est ce que l'écran doit lui dire. */
export const dejaPris = (a: AppelWa | undefined): string | null =>
  (a?.prisPar ? a.prisPar : null);

/* ══ CE QUI RESTE D'UN APPEL ══════════════════════════════════════════ */

/** LA DURÉE, DITE COMME AU COMPTOIR. « 3 min 20 », jamais « 200 s ». */
export const dureeDite = (secondes: number | undefined): string => {
  const s = Math.max(0, Math.round(secondes ?? 0));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r}`;
};

/** LA DURÉE D'UN APPEL, depuis ses deux bornes. Sans l'une des deux, on ne
    devine pas : une durée inventée finirait dans un décompte. */
export const dureeDe = (a: AppelWa): number | undefined => {
  if (!a.prisLe || !a.finiLe) return undefined;
  const d = Date.parse(a.finiLe) - Date.parse(a.prisLe);
  return Number.isFinite(d) && d >= 0 ? Math.round(d / 1000) : undefined;
};

/** UN APPEL MANQUÉ DEVIENT UN RAPPEL À FAIRE — c'est tout l'intérêt de la
    deuxième marche, et elle vaut sans la troisième.

    ON NE DEVINE PAS CE QU'ELLE VOULAIT : le motif dit ce qu'on sait, c'est
    tout. Une phrase inventée se retrouverait citée au téléphone. */
export const motifDuRappel = (a: AppelWa): string => {
  const quand = new Date(a.sonneLe);
  const h = Number.isNaN(quand.getTime())
    ? ''
    : ` de ${quand.getHours()} h ${String(quand.getMinutes()).padStart(2, '0')}`;
  return `Appel WhatsApp manqué${h}. On ne sait pas encore ce qu’elle voulait.`;
};

/** FAUT-IL POSER UN RAPPEL POUR CET APPEL ? Manqué ou refusé, jamais pris,
    et jamais deux fois — Meta répète volontiers ses événements. */
export const meriteUnRappel = (a: AppelWa): boolean =>
  a.sens === 'entrant' && !a.prisPar && !a.rappelId
  && (a.etat === 'manque' || a.etat === 'refuse'
    /* UN APPEL « FINI » QUE PERSONNE N'A PRIS est un appel manqué qui ne dit
       pas son nom : Meta annonce parfois la fin sans jamais dire « manqué ». */
    || a.etat === 'fini');

/* ══ LES APPELS D'UNE TÊTE ════════════════════════════════════════════ */

/** SES APPELS, du plus récent au plus ancien. Le rapprochement se fait par
    NUMÉRO autant que par fiche : Meta ne connaît que le numéro, et la fiche
    peut être rattachée après coup. */
export const appelsDeLaTete = (
  appels: readonly AppelWa[], clientId: string, numeros: readonly (string | undefined)[],
): AppelWa[] => {
  const siens = new Set(numeros.map((n) => numeroWa(n)).filter(Boolean));
  return appels
    .filter((a) => a.clientId === clientId || siens.has(numeroWa(a.numero)))
    .sort((a, b) => b.sonneLe.localeCompare(a.sonneLe));
};

export const appelsWaStore = createStore<AppelWa[]>('mnd_appels_wa', []);
export const useAppelsWa = () => useStore(appelsWaStore);

bindCollection(appelsWaStore, 'appels_wa');
