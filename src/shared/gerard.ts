import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { REGLAGES_LIVRES, estActif, reglagesLus, type GenreDeMessage, type ModeDeGerard, type ReglagesDeGerard } from './gerard-pur';

export { estActif, reglagesLus, type ModeDeGerard, type ReglagesDeGerard };

/* ── LES RÉGLAGES DE L'ASSISTANT MAISON — 26 octobre 2026 ────────────────
   Maquette v4 (« construis », choix `essai` = pause-actif) : plus d'essai à
   cinq clientes. Un seul interrupteur, PAUSE ou ACTIF ; le champ `mode`
   garde ses valeurs (« eteint » = Pause, « ouvert » = Actif) pour que
   l'ancien document se lise sans migration. Et le plafond de la semaine,
   en nombre et en francs, réglé par la direction. Les règles vivent dans
   `gerard-pur.ts`. */

export const reglagesDeGerardStore = createStore<ReglagesDeGerard>('mnd_gerard', REGLAGES_LIVRES);
export const useReglagesDeGerard = () => useStore(reglagesDeGerardStore);
bindDocument(reglagesDeGerardStore, 'mnd_gerard');

export function changeLeMode(mode: ModeDeGerard, parQui: string): void {
  reglagesDeGerardStore.set((prev) => ({ ...reglagesLus(prev), mode, parQui, le: new Date().toISOString() }));
}

/** Pause ou Actif, d'un toucher. */
export function metEnPause(pause: boolean, parQui: string): void {
  changeLeMode(pause ? 'eteint' : 'ouvert', parQui);
}

/** Le plafond de la semaine : le nombre de remises, et les francs. */
export function changeLePlafond(p: { remisesParSemaine?: number; plafondFrancs?: number }, parQui: string): void {
  reglagesDeGerardStore.set((prev) => reglagesLus({ ...reglagesLus(prev), ...p, parQui, le: new Date().toISOString() }));
}

/** « Éteindre une situation » : il ne l'écrit plus à personne ; la rallumer la rend. */
export function eteinsLaSituation(genre: GenreDeMessage, eteinte: boolean, parQui: string): void {
  reglagesDeGerardStore.set((prev) => {
    const r = reglagesLus(prev);
    const eteintes = eteinte ? [...new Set([...r.eteintes, genre])] : r.eteintes.filter((g) => g !== genre);
    return { ...r, eteintes, parQui, le: new Date().toISOString() };
  });
}

/** « Jamais pour elle » : cette situation ne lui sera plus écrite. `false` la lui rend. */
export function jamaisPourElle(clientId: string, genre: GenreDeMessage, jamais: boolean, parQui: string): void {
  reglagesDeGerardStore.set((prev) => {
    const r = reglagesLus(prev);
    const siens = r.jamais[clientId] ?? [];
    const neufs = jamais ? [...new Set([...siens, genre])] : siens.filter((g) => g !== genre);
    const tous = { ...r.jamais };
    if (neufs.length) tous[clientId] = neufs; else delete tous[clientId];
    return { ...r, jamais: tous, parQui, le: new Date().toISOString() };
  });
}

/** « Approuvé chez Meta » : ce modèle part seul sur WhatsApp au passage du
    matin ; décoché, il attend de nouveau un toucher au Trône. */
export function marqueLeModeleApprouve(nom: string, approuve: boolean, parQui: string): void {
  reglagesDeGerardStore.set((prev) => {
    const r = reglagesLus(prev);
    const approuves = approuve ? [...new Set([...r.approuves, nom])] : r.approuves.filter((n) => n !== nom);
    return reglagesLus({ ...r, approuves, parQui, le: new Date().toISOString() });
  });
}
