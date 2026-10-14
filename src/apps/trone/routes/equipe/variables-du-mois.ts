import { createStore, useStore } from '../../../../shared/store';
import { bindDocument } from '../../../../shared/sync';
import type { Tip } from '../../../../shared/tips';

/* ══ LES VARIABLES DU MOIS — 14 octobre 2026 (direction des RH) ══════════

   Les primes, les retenues, les ajustements de commission et les
   confirmations de paie vivaient dans l'écran Personnel, et le run de paie ne
   les lisait pas : une prime de seuil « inscrite » n'arrivait jamais sur un
   bulletin, sauf à la retaper ligne par ligne. Elles vivent ici, lues par les
   deux, et la base les réserve au souverain (0130, `cles_rh_privees`). */

/* Ajustements manuels des commissions par mois + maître : `${AAAA-MM}:${staffId}`. */
export type PaieOverride = { commPresta?: number; commProduit?: number };
export const overridesStore = createStore<Record<string, PaieOverride>>('mnd_paie_overrides', {});
bindDocument(overridesStore, 'mnd_paie_overrides');
export const useOverrides = () => useStore(overridesStore);

/* Primes typées — staffId → liste. Chaque prime est datée (donc rattachée à un mois). */
export type PrimeType = 'fin_annee' | 'performance' | 'nuit' | 'autre';
export type Prime = { id: string; type: PrimeType; label?: string; amountXof: number; date: string; note?: string };
export const primesStore = createStore<Record<string, Prime[]>>('mnd_primes', {});
bindDocument(primesStore, 'mnd_primes');
export const usePrimes = () => useStore(primesStore);
export const PRIME_LABEL: Record<PrimeType, string> = {
  fin_annee: 'Fin d’année', performance: 'Performance', nuit: 'Nuit', autre: 'Autre',
};
export const PRIME_TYPES: [PrimeType, string][] = [
  ['performance', 'Performance'], ['nuit', 'Nuit'], ['fin_annee', 'Fin d’année'], ['autre', 'Autre'],
];

/* Confirmation de règlement (la « signature ») — clé `${AAAA-MM}:${staffId}`. */
export type PayConfirm = { paidAt: string; byId: string; byName: string; method?: string; amountXof: number; expenseId?: string };
export const confirmStore = createStore<Record<string, PayConfirm>>('mnd_paie_confirm', {});
bindDocument(confirmStore, 'mnd_paie_confirm');
export const useConfirm = () => useStore(confirmStore);

/* Retenues sur salaire — staffId → liste, datées. Diminuent le net à verser.
   Motifs : absence non rémunérée, mise à pied, absence injustifiée, autre. */
export type RetenueType = 'absence_non_rem' | 'mise_a_pied' | 'absence_injustifiee' | 'autre';
export type Retenue = { id: string; type: RetenueType; amountXof: number; date: string; days?: number; note?: string };
export const retenuesStore = createStore<Record<string, Retenue[]>>('mnd_retenues', {});
bindDocument(retenuesStore, 'mnd_retenues');
export const useRetenues = () => useStore(retenuesStore);
export const RETENUE_LABEL: Record<RetenueType, string> = {
  absence_non_rem: 'Absence non rémunérée', mise_a_pied: 'Mise à pied', absence_injustifiee: 'Absence injustifiée', autre: 'Autre retenue',
};
export const RETENUE_TYPES: [RetenueType, string][] = [
  ['absence_non_rem', 'Absence non rémunérée'], ['mise_a_pied', 'Mise à pied'], ['absence_injustifiee', 'Absence injustifiée'], ['autre', 'Autre'],
];

/* ══ CE QUE LE RUN REPREND, ET D'OÙ ══════════════════════════════════ */

/** Une ligne de provenance : ce qui a fait un chiffre du bulletin. */
export type Origine = { quoi: 'prime' | 'pourboires' | 'retenue' | 'points'; libelle: string; montantXof: number; le?: string };

const duMois = (date: string | undefined, period: string): boolean => (date ?? '').slice(0, 7) === period;
const enListe = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]).filter((x) => x && typeof x === 'object') : []);

/** LE MOIS D'UNE PERSONNE, TEL QUE LE RUN LE REPREND. Pur : le banc
    l'éprouve. Les montants viennent de ce qui a été inscrit ; rien ne
    s'invente (les heures supplémentaires n'ont pas de taux réglé, elles
    restent à la main). */
export function variablesDuMois(o: {
  staffId: string;
  period: string;
  primes: Record<string, Prime[]> | undefined;
  retenues: Record<string, Retenue[]> | undefined;
  tips: readonly Tip[];
  primeDePointsXof?: number;
}): { prime: number; pourboires: number; retenues: number; origines: Origine[] } {
  const origines: Origine[] = [];
  for (const p of enListe<Prime>(o.primes?.[o.staffId])) {
    if (!duMois(p.date, o.period) || !(p.amountXof > 0)) continue;
    origines.push({ quoi: 'prime', libelle: p.note || p.label || PRIME_LABEL[p.type] || 'Prime', montantXof: p.amountXof, le: p.date });
  }
  if (o.primeDePointsXof && o.primeDePointsXof > 0) {
    origines.push({ quoi: 'points', libelle: 'Prime de points (seuil du mois atteint)', montantXof: o.primeDePointsXof });
  }
  const tips = o.tips.filter((t) => t && t.staffId === o.staffId && duMois(t.date, o.period) && t.amountXof > 0);
  const pourboires = tips.reduce((n, t) => n + t.amountXof, 0);
  if (pourboires > 0) origines.push({ quoi: 'pourboires', libelle: `${tips.length} pourboire${tips.length > 1 ? 's' : ''} du mois`, montantXof: pourboires });
  for (const r of enListe<Retenue>(o.retenues?.[o.staffId])) {
    if (!duMois(r.date, o.period) || !(r.amountXof > 0)) continue;
    origines.push({ quoi: 'retenue', libelle: `${RETENUE_LABEL[r.type] ?? 'Retenue'}${r.days ? `, ${r.days} j` : ''}${r.note ? ` · ${r.note}` : ''}`, montantXof: r.amountXof, le: r.date });
  }
  const somme = (q: Origine['quoi'][]) => origines.filter((x) => q.includes(x.quoi)).reduce((n, x) => n + x.montantXof, 0);
  return { prime: somme(['prime', 'points']), pourboires, retenues: somme(['retenue']), origines };
}
