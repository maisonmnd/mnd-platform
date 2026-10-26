import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { ESSAI_MAX, REGLAGES_LIVRES, reglagesLus, type ModeDeGerard, type ReglagesDeGerard } from './gerard-pur';

export { ESSAI_MAX, reglagesLus, type ModeDeGerard, type ReglagesDeGerard };

/* ── LES RÉGLAGES DE GÉRARD — 26 octobre 2026 ────────────────────────────
   Au sélecteur : « seul, après deux semaines d'essai ». Gérard est livré
   ÉTEINT ; en essai, il n'écrit qu'aux clientes de la liste (cinq, choisies
   dans sa rubrique) ; ouvert, à toutes. Tant que sa fonction au serveur
   n'est pas posée (lot 2), le réglage ne fait rien partir : il dit ce que
   Gérard fera. Les règles vivent dans `gerard-pur.ts`. */

export const reglagesDeGerardStore = createStore<ReglagesDeGerard>('mnd_gerard', REGLAGES_LIVRES);
export const useReglagesDeGerard = () => useStore(reglagesDeGerardStore);
bindDocument(reglagesDeGerardStore, 'mnd_gerard');

export function changeLeMode(mode: ModeDeGerard, parQui: string): void {
  reglagesDeGerardStore.set((prev) => {
    const r = reglagesLus(prev);
    return { ...r, mode, essaiDepuis: mode === 'essai' && r.mode !== 'essai' ? new Date().toISOString() : r.essaiDepuis, parQui, le: new Date().toISOString() };
  });
}

/** Met une cliente dans l'essai, ou l'en retire ; jamais plus de cinq. */
export function basculeDansLEssai(clientId: string, parQui: string): 'ajoutee' | 'retiree' | 'pleine' {
  let issue: 'ajoutee' | 'retiree' | 'pleine' = 'pleine';
  reglagesDeGerardStore.set((prev) => {
    const r = reglagesLus(prev);
    if (r.essai.includes(clientId)) { issue = 'retiree'; return { ...r, essai: r.essai.filter((x) => x !== clientId), parQui, le: new Date().toISOString() }; }
    if (r.essai.length >= ESSAI_MAX) { issue = 'pleine'; return r; }
    issue = 'ajoutee';
    return { ...r, essai: [...r.essai, clientId], parQui, le: new Date().toISOString() };
  });
  return issue;
}
