import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import type { Service } from './catalog';
import type { Client } from './clients';

/* L'intelligence des prix — le prix d'une cliente dépend de son MODÈLE (nombre
   de locks : 100, 204, 450…) et de son Juste Prix (coefficient personnel).

       prix personnalisé = prix catalogue × coef du modèle × Juste Prix
       durée personnalisée = durée catalogue × coef de durée du modèle

   Le modèle est porté par un BARÈME PAR TRANCHES (éditable au Juste Prix) : une
   tranche de locks → un coefficient de prix et un coefficient de durée. Seules
   les prestations qui « suivent le modèle » sont concernées (interrupteur par
   prestation au Catalogue ; par défaut : entretien, resserrage et soins — les
   créations VÈKPÈ ont déjà leurs variantes par taille). Le prix personnalisé se
   FIGE sur le rendez-vous dès la réservation (invariant : le prix d'origine
   fait foi) — retoucher le barème ne réécrit jamais l'histoire. */

export type ModelBand = {
  id: string;
  /** Borne haute de la tranche (nombre de locks inclus) — null = dernière tranche, sans plafond. */
  maxLocks: number | null;
  coef: number; // coefficient de PRIX
  durCoef: number; // coefficient de DURÉE
};

/** Barème de départ — la tranche 121–180 est la base (×1) ; tout est éditable. */
export const MODEL_BANDS_SEED: ModelBand[] = [
  { id: 'mb-120', maxLocks: 120, coef: 0.85, durCoef: 0.85 },
  { id: 'mb-180', maxLocks: 180, coef: 1, durCoef: 1 },
  { id: 'mb-250', maxLocks: 250, coef: 1.2, durCoef: 1.2 },
  { id: 'mb-350', maxLocks: 350, coef: 1.4, durCoef: 1.45 },
  { id: 'mb-500', maxLocks: 500, coef: 1.65, durCoef: 1.7 },
  { id: 'mb-max', maxLocks: null, coef: 1.9, durCoef: 2 },
];

export const modelBandsStore = createStore<ModelBand[]>('mnd_model_bands', MODEL_BANDS_SEED);
export const useModelBands = () => useStore(modelBandsStore);
bindDocument(modelBandsStore, 'mnd_model_bands');

/** Tranches triées par plafond croissant (la sans-plafond en dernier). */
export const sortedBands = (bands: ModelBand[]): ModelBand[] =>
  [...bands].sort((a, b) => (a.maxLocks ?? Infinity) - (b.maxLocks ?? Infinity));

/** Libellé lisible d'une tranche — « 121 – 180 locks », « > 500 locks ». */
export const bandLabel = (band: ModelBand, bands: ModelBand[]): string => {
  const sorted = sortedBands(bands);
  const i = sorted.findIndex((b) => b.id === band.id);
  const prevMax = i > 0 ? sorted[i - 1].maxLocks ?? 0 : 0;
  if (band.maxLocks == null) return `> ${prevMax} locks`;
  return prevMax === 0 ? `≤ ${band.maxLocks} locks` : `${prevMax + 1} – ${band.maxLocks} locks`;
};

/** La tranche d'un modèle (nombre de locks) — undefined si modèle inconnu ou barème vide. */
export const bandOf = (lockCount: number | undefined, bands: ModelBand[]): ModelBand | undefined => {
  if (!lockCount || lockCount <= 0 || bands.length === 0) return undefined;
  const sorted = sortedBands(bands);
  return sorted.find((b) => lockCount <= (b.maxLocks ?? Infinity)) ?? sorted[sorted.length - 1];
};

/** Une prestation suit-elle le modèle ? Explicite si l'interrupteur est posé au
    Catalogue ; sinon dérivé : entretien / resserrage / soins profonds. */
export const scalesWithModel = (s: Pick<Service, 'name' | 'categoryId'> & { scalesWithModel?: boolean }): boolean => {
  if (typeof s.scalesWithModel === 'boolean') return s.scalesWithModel;
  if (['sinsin', 'finfin', 'cat-finfin'].includes(s.categoryId)) return true;
  return /s[íi]nsin|resserrage|entretien/i.test(s.name);
};

/** Arrondi commercial — au 500 F, un prix se dit sans virgule au comptoir. */
export const roundPrice = (x: number): number => Math.round(x / 500) * 500;

export type PersonalPricing = { band?: ModelBand; clientCoef: number };

/** Le contexte tarifaire d'une cliente : sa tranche de modèle + son Juste Prix. */
export const pricingOf = (
  client: Pick<Client, 'lockCount' | 'priceCoef'> | undefined,
  bands: ModelBand[],
): PersonalPricing => ({
  band: bandOf(client?.lockCount, bands),
  clientCoef: client?.priceCoef && client.priceCoef > 0 ? client.priceCoef : 1,
});

/** Y a-t-il quelque chose à personnaliser (modèle connu ou Juste Prix ≠ 1) ? */
export const isPersonalized = (p: PersonalPricing): boolean => !!p.band || p.clientCoef !== 1;

/** Prix personnalisé d'une prestation. Le coef de modèle ne s'applique qu'aux
    prestations qui suivent le modèle ; le Juste Prix s'applique à tout. */
export const personalPriceXof = (sv: Service, p: PersonalPricing): number => {
  const modelCoef = scalesWithModel(sv) && p.band ? p.band.coef : 1;
  return roundPrice(sv.priceXof * modelCoef * p.clientCoef);
};

/** Durée personnalisée d'une prestation — calée au quart d'heure, jamais nulle. */
export const personalDurationMin = (sv: Service, p: PersonalPricing): number => {
  const c = scalesWithModel(sv) && p.band ? p.band.durCoef : 1;
  return Math.max(15, Math.round((sv.durationMin * c) / 15) * 15);
};
