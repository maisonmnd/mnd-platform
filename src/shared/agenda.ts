import { createStore, useStore } from './store';

/* Le Carnet — rendez-vous multi-services, 08:00–18:00.
   Les semences sont générées autour d'aujourd'hui : le carnet vit toujours. */

export type Appointment = {
  id: string;
  branchId: string;
  clientId: string;
  serviceIds: string[]; // RDV multi-services
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  master: string;
  status: 'confirmé' | 'en attente' | 'honoré' | 'annulé';
  depositXof?: number; // acompte Mobile Money (Ma Couronne)
  paidXof?: number; // total encaissé au salon (hors acompte) — suit les paiements partiels
  discountPct?: number; // remise appliquée au RDV (0–100)
  /** Prestations sur lesquelles l'acompte est calculé (défaut : toutes). */
  depositServiceIds?: string[];
  note?: string;
  source?: 'trone' | 'couronne' | 'consultation';
  /** Points de fidélité déjà attribués à l'honneur du RDV (évite le double comptage). */
  pointsAwarded?: boolean;
  /** Numéro de la facture émise à l'encaissement du RDV. */
  invoiceId?: string;
};

/** Date ISO à J+offset (calculée au chargement — le carnet suit le présent). */
const dOff = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const APPOINTMENTS_SEED: Appointment[] = [];

export const appointmentsStore = createStore<Appointment[]>('mnd_appointments', APPOINTMENTS_SEED);
export const useAppointments = () => useStore(appointmentsStore);

import { bindCollection } from './sync';
bindCollection(appointmentsStore, 'appointments');

export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 18;
