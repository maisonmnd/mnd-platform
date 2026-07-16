import { createStore, uid, useStore } from './store';
import { bindDocument } from './sync';

export type Tip = { id: string; amountXof: number; date: string; note?: string };

export const tipsStore = createStore<Record<string, Tip[]>>('mnd_tips', {});
bindDocument(tipsStore, 'mnd_tips');
export const useTips = () => useStore(tipsStore);

/** Enregistre un pourboire pour un membre du personnel (par staffId). */
export function addTip(staffId: string, amountXof: number, date: string, note?: string) {
  if (!staffId || amountXof <= 0) return;
  const t: Tip = { id: `tp-${uid()}`, amountXof: Math.round(amountXof), date, note };
  tipsStore.set((prev) => ({ ...prev, [staffId]: [...(prev[staffId] ?? []), t] }));
}
