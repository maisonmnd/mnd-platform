/* ══ LES DEUX PASSAGES D'« AVANT LE FAUTEUIL », LE JUGE — 31 octobre 2026 ═══
   « N'oublie pas de me faire un résumé de ce que je dois savoir avant un RDV
   d'un client. Credo vient le 13 novembre, il faut que je me souvienne de
   relire notre conversation. » (Yéman, 31 octobre 2026). Choix 2 de la
   maquette Jx3pJY3ZkzWkr9a9RXUFf3 : une notification la veille vers 19 h
   pour les rendez-vous de demain, une le matin vers 7 h pour ceux du jour.

   CE FICHIER NE LIT RIEN : il reçoit la mémoire des passages, le jour et
   l'heure du salon, et dit lequel des deux passages est dû. Le magasin qui
   garde cette mémoire (`shared/avant-le-fauteuil.ts`) et le crochet qui
   envoie (`routes/clients/avant-le-fauteuil-donnees.ts`) l'appellent.

   POURQUOI 18 H 50 ET 6 H 45, ET NON 19 H ET 7 H PILE. Le Trône n'a pas de
   réveil au serveur pour ce passage : il se fait quand la direction a le
   Trône ouvert (tableau de bord ou Carnet), comme le passage de Gérard. On
   ouvre donc la fenêtre dix minutes avant l'heure dite, pour qu'un Trône
   déjà ouvert à 18 h 52 prévienne « vers 19 h » plutôt qu'à la prochaine
   ouverture. Le soir reste dû jusqu'à minuit : demain n'a pas bougé. Le
   matin ne l'est que jusqu'à midi : « Aujourd'hui, 3 têtes » à 16 h
   parlerait de rendez-vous déjà passés. */

export type PassageAvantLeFauteuil = 'soir' | 'matin';

/** Le jour (AAAA-MM-JJ) du dernier passage de chaque sorte. Document
    `mnd_avant_le_fauteuil`, partagé entre les postes de la direction : un
    passage fait sur le téléphone n'est pas refait sur l'ordinateur. */
export type MemoireAvantLeFauteuil = { dernierSoir?: string; dernierMatin?: string };

/** Le soir : dès 18 h 50, heure du salon, pour les rendez-vous de demain. */
export const HEURE_DU_SOIR = 18 + 50 / 60;
/** Le matin : dès 6 h 45, pour ceux d'aujourd'hui. */
export const HEURE_DU_MATIN = 6 + 45 / 60;
/** Au-delà, le matin n'a plus de sens : la journée est entamée. */
export const FIN_DU_MATIN = 12;

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const jourLu = (v: unknown): string | undefined => (typeof v === 'string' && JOUR.test(v) ? v : undefined);

/** La mémoire telle qu'on la lit, quoi qu'un document mal formé contienne. */
export const memoireLue = (m: unknown): MemoireAvantLeFauteuil => {
  const o = (m && typeof m === 'object' ? m : {}) as { dernierSoir?: unknown; dernierMatin?: unknown };
  const dernierSoir = jourLu(o.dernierSoir);
  const dernierMatin = jourLu(o.dernierMatin);
  return { ...(dernierSoir ? { dernierSoir } : {}), ...(dernierMatin ? { dernierMatin } : {}) };
};

/** LE PASSAGE DÛ À CET INSTANT, ou `null`. Le soir l'emporte quand les deux
    seraient dus (un Trône rouvert à 19 h après une journée fermée) : le
    matin d'aujourd'hui n'a plus rien à dire, demain si. */
export function passageAvantLeFauteuilDu(
  m: MemoireAvantLeFauteuil | null | undefined, aujourdhui: string, heureSalon: number,
): PassageAvantLeFauteuil | null {
  const memoire = memoireLue(m);
  if (heureSalon >= HEURE_DU_SOIR && memoire.dernierSoir !== aujourdhui) return 'soir';
  if (heureSalon >= HEURE_DU_MATIN && heureSalon < FIN_DU_MATIN && memoire.dernierMatin !== aujourdhui) return 'matin';
  return null;
}

/** La mémoire après ce passage : le jour s'écrit sur la bonne case. */
export const avecLePassage = (m: MemoireAvantLeFauteuil | null | undefined, quand: PassageAvantLeFauteuil, jour: string): MemoireAvantLeFauteuil =>
  ({ ...memoireLue(m), ...(quand === 'soir' ? { dernierSoir: jour } : { dernierMatin: jour }) });
