import { createStore, useStore } from './store';

/* Paramètres de la Maison — persistés en localStorage (clé `mnd_settings`).
   Jours & heures d'ouverture, bascules de rituel/notifications, et les liens
   d'automatisation insérés tels quels dans les envois WhatsApp / SMS. */

export type DayHours = { key: string; label: string; open: string; close: string; closed: boolean };

export type Automations = {
  momoLink: string;
  mapsLink: string;
  reviewLink: string;
  itineraire: string;
};

export type Settings = {
  toggles: Record<string, boolean>;
  hours: DayHours[];
  automations: Automations;
  /** Acompte exigé à la réservation en ligne (%). Lu par Ma Couronne. */
  onlineDepositPct: number;
  /** Frais de livraison à domicile (XOF). Lu par Ma Couronne · Gamme. */
  deliveryFeeXof: number;
};

/** Créneaux d'ouverture proposés — repris du prototype. */
export const HOUR_OPTIONS = [
  '07h00', '07h30', '08h00', '08h30', '09h00', '09h30', '10h00', '10h30', '11h00',
  '12h00', '13h00', '14h00', '15h00', '16h00', '17h00', '18h00', '18h30', '19h00',
  '19h30', '20h00', '20h30', '21h00', '22h00',
];

export const DEFAULT_HOURS: DayHours[] = [
  { key: 'lun', label: 'Lundi', open: '09h00', close: '19h00', closed: false },
  { key: 'mar', label: 'Mardi', open: '09h00', close: '19h00', closed: false },
  { key: 'mer', label: 'Mercredi', open: '09h00', close: '19h00', closed: false },
  { key: 'jeu', label: 'Jeudi', open: '09h00', close: '20h00', closed: false },
  { key: 'ven', label: 'Vendredi', open: '09h00', close: '20h00', closed: false },
  { key: 'sam', label: 'Samedi', open: '08h00', close: '20h00', closed: false },
  { key: 'dim', label: 'Dimanche', open: '10h00', close: '16h00', closed: true },
];

export const DEFAULT_SETTINGS: Settings = {
  toggles: {
    rappel: true,
    acompte: true,
    notifRdv: true,
    notifStock: true,
    notifPaie: true,
    notifCercle: false,
    auth: true,
    sauvegarde: true,
    export: true,
  },
  hours: DEFAULT_HOURS,
  automations: { momoLink: '', mapsLink: '', reviewLink: '', itineraire: '' },
  onlineDepositPct: 30,
  deliveryFeeXof: 2000,
};

/** Fraction d'acompte (0–1) exigée en ligne — défaut 30 %. */
export const onlineDepositRate = (): number => {
  const pct = settingsStore.get().onlineDepositPct;
  return typeof pct === 'number' && pct >= 0 && pct <= 100 ? pct / 100 : 0.3;
};

/** Frais de livraison à domicile (XOF) — défaut 2 000 F ; 0 = livraison gratuite. */
export const deliveryFee = (): number => {
  const n = settingsStore.get().deliveryFeeXof;
  return typeof n === 'number' && n >= 0 ? Math.round(n) : 2000;
};

export const settingsStore = createStore<Settings>('mnd_settings', DEFAULT_SETTINGS);

export function useSettings() {
  return useStore(settingsStore);
}

/* ---------- Heures d'ouverture résolues (partagé Trône ↔ Ma Couronne) ---------- */

/** '09h30' → minutes depuis minuit. */
export const hourToMin = (h: string): number => {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(h.trim());
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 9 * 60;
};

const DAY_KEYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** Fenêtre d'ouverture d'une date ISO — la disponibilité de réservation la respecte. */
export function openingForIso(dateIso: string): { closed: boolean; openMin: number; closeMin: number } {
  const dow = new Date(`${dateIso}T00:00:00`).getDay();
  const day = settingsStore.get().hours.find((h) => h.key === DAY_KEYS[dow]);
  if (!day || day.closed) return { closed: true, openMin: 0, closeMin: 0 };
  return { closed: false, openMin: hourToMin(day.open), closeMin: hourToMin(day.close) };
}

/* ---------- Marque & thème ---------- */
export type Brand = {
  accent: string;
  mono: string;
  verbe: string;
};

export const DEFAULT_ACCENT = '#B97A4A';
export const DEFAULT_VERBE = 'Le cheveu est une couronne. Nous en sommes les orfèvres.';

export const DEFAULT_BRAND: Brand = {
  accent: DEFAULT_ACCENT,
  mono: 'copper',
  verbe: DEFAULT_VERBE,
};

export const brandStore = createStore<Brand>('mnd_brand', DEFAULT_BRAND);

export function useBrand() {
  return useStore(brandStore);
}

import { bindDocument } from './sync';
bindDocument(settingsStore, 'mnd_settings');
bindDocument(brandStore, 'mnd_brand');
