import { createStore, useStore } from './store';
import { bindDocument } from './sync';
import { hourToMin } from './settings';

/* Offres instantanées & Cercle — ponts Trône (Marketing/Cercle) → Ma Couronne.
   Gérés côté ERP, consommés côté cliente. Synchronisés via Supabase (documents)
   pour que les clientes voient les offres depuis n'importe quel appareil. */

export const OFFER_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
export const OFFER_AUDIENCES = ['Tous', 'Actifs', 'VIP', 'Cercle', 'Dormants'] as const;
export const OFFER_HOURS = ['00h', '06h', '07h', '08h', '09h', '10h', '11h', '12h', '14h', '16h', '17h', '18h', '19h', '20h', '21h', '22h'];

export type InstantOffer = {
  id: string;
  branchId: string;
  title: string;
  tag: string; // accroche — « Offre éclair », « Heure creuse »…
  deal: string; // avantage affiché — « −25% », « 2 = 1 »…
  sub: string; // détail
  audience: string; // persona / segment qui la voit
  days: string[]; // jours d'affichage
  heureDebut: string;
  heureFin: string;
  active: boolean;
  /** Prestation réservable en un geste depuis Ma Couronne (pré-remplit la réservation). */
  serviceId?: string;
  /** Remise réellement appliquée au prix à la réservation. */
  discountPct?: number;
};

export const offersStore = createStore<InstantOffer[]>('mnd_offers', []);
export const useOffers = () => useStore(offersStore);

/** Une offre est visible maintenant : active + jour retenu + fenêtre horaire.
    Aucun jour coché = jamais visible (cohérent avec « Aucun jour » à l'écran). */
export function offerLiveNow(o: InstantOffer, now = new Date()): boolean {
  if (!o.active) return false;
  const day = OFFER_DAYS[(now.getDay() + 6) % 7]; // getDay(): 0=dim → index 6
  if (!o.days.includes(day)) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return nowMin >= hourToMin(o.heureDebut) && nowMin < hourToMin(o.heureFin);
}

/* ---------- Cercle — paliers de récompense & points ---------- */

export type RewardTier = {
  id: string;
  pts: number; // seuil de points
  serviceId: string; // prestation offerte, tirée du catalogue
  desc: string;
  g: string; // chiffre du sceau — Ⅰ · Ⅱ · Ⅲ…
};

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const TIERS_SEED: RewardTier[] = [];

export const tiersStore = createStore<RewardTier[]>('mnd_cercle_tiers', TIERS_SEED);
export const useTiers = () => useStore(tiersStore);

/** 1 point / N F dépensés. */
export const pointsRateStore = createStore<number>('mnd_points_rate', 100);

/** Attribution des points Cercle — COUPÉE tant que la maison ne l'active pas
    (Cercle MND) : aucune écriture de points à l'encaissement/honneur avant que
    le programme ne soit officiellement lancé. */
export const pointsEnabledStore = createStore<boolean>('mnd_points_enabled', false);

export type PointsEvent = {
  id: string;
  clientId: string;
  clientName: string;
  label: string; // récompense offerte ou ajustement
  pts: number; // négatif = points rendus en soin
  at: string; // ISO
};

export const pointsHistoryStore = createStore<PointsEvent[]>('mnd_points_history', []);
export const usePointsHistory = () => useStore(pointsHistoryStore);

bindDocument(offersStore, 'mnd_offers');
bindDocument(tiersStore, 'mnd_cercle_tiers');
bindDocument(pointsRateStore, 'mnd_points_rate');
bindDocument(pointsEnabledStore, 'mnd_points_enabled');
bindDocument(pointsHistoryStore, 'mnd_points_history');
