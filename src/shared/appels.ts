import { createStore, useStore, uid } from './store';
import { bindDocument } from './sync';

/* ── LE JOURNAL DES APPELS (25 août) ──────────────────────────────────
   Une cliente appelle pour un rendez-vous, on raccroche, on oublie. On ne peut
   PAS détecter l'appel depuis une app web (mur du navigateur) — mais on peut
   rendre la saisie instantanée et relancer sans relâche jusqu'à ce que ce soit
   traité. Un appel « posé » reste sur le Tableau de bord (et compte à la cloche)
   tant qu'il n'est ni fait ni transformé en rendez-vous. */

export type AppelRecu = {
  id: string;
  branchId: string;
  clientId?: string;   // rattaché à une fiche, si connue
  nom: string;         // nom affiché (fiche ou saisi à la main)
  phone?: string;
  motif: string;       // ce qu'elle veut, une phrase
  suite: 'rappel' | 'rdv';  // à rappeler, ou un rendez-vous à caler
  quand?: string;      // ISO (jour) — quand se le rappeler
  fait: boolean;
  at: string;          // ISO de création
};

export const appelsStore = createStore<AppelRecu[]>('mnd_appels', []);
export const useAppels = () => useStore(appelsStore);
bindDocument(appelsStore, 'mnd_appels');

/** Les appels NON TRAITÉS d'une branche, les plus urgents d'abord : échéance la
    plus proche (ou passée), puis les plus anciens. */
export function appelsAActer(appels: AppelRecu[], branchId: string): AppelRecu[] {
  return appels
    .filter((a) => !a.fait && a.branchId === branchId)
    .sort((a, b) => (a.quand ?? '9999-99').localeCompare(b.quand ?? '9999-99') || a.at.localeCompare(b.at));
}

export const poserAppel = (a: Omit<AppelRecu, 'id' | 'at' | 'fait'>): string => {
  const id = `ap-${uid()}`;
  appelsStore.set((prev) => [{ ...a, id, at: new Date().toISOString(), fait: false }, ...prev]);
  return id;
};
export const marquerAppelFait = (id: string): void =>
  appelsStore.set((prev) => prev.map((a) => (a.id === id ? { ...a, fait: true } : a)));
export const rouvrirAppel = (id: string): void =>
  appelsStore.set((prev) => prev.map((a) => (a.id === id ? { ...a, fait: false } : a)));
export const reporterAppel = (id: string, quand: string): void =>
  appelsStore.set((prev) => prev.map((a) => (a.id === id ? { ...a, quand } : a)));
