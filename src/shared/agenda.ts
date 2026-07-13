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
  depositXof?: number; // acompte 30 % Mobile Money (Ma Couronne)
  note?: string;
  source?: 'trone' | 'couronne' | 'consultation';
};

/** Date ISO à J+offset (calculée au chargement — le carnet suit le présent). */
const dOff = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const APPOINTMENTS_SEED: Appointment[] = [
  /* — aujourd'hui, Cotonou — */
  { id: 'a-1', branchId: 'cotonou-flagship', clientId: 'c-adjoa', serviceIds: ['sv-resserrage', 'sv-bain-vapeur'], date: dOff(0), time: '09:00', master: 'Aïcha', status: 'confirmé', source: 'trone' },
  { id: 'a-2', branchId: 'cotonou-flagship', clientId: 'c-thierry', serviceIds: ['sv-entretien-complet'], date: dOff(0), time: '11:30', master: 'Romuald', status: 'confirmé', source: 'trone' },
  { id: 'a-3', branchId: 'cotonou-flagship', clientId: 'c-ines', serviceIds: ['sv-locks-moyennes'], date: dOff(0), time: '14:00', master: 'Aïcha', status: 'en attente', source: 'couronne', depositXof: 24000 },
  { id: 'a-8', branchId: 'cotonou-flagship', clientId: 'c-nadege', serviceIds: ['sv-rituel-quatre-temps'], date: dOff(0), time: '10:00', master: 'Brice', status: 'confirmé', source: 'trone' },
  { id: 'a-9', branchId: 'cotonou-flagship', clientId: 'c-gisele', serviceIds: ['sv-coiffure-event', 'sv-style-conseil'], date: dOff(0), time: '15:30', master: 'Yéman', status: 'confirmé', source: 'couronne', depositXof: 15000 },

  /* — à venir, Cotonou — */
  { id: 'a-4', branchId: 'cotonou-flagship', clientId: 'c-mariama', serviceIds: ['sv-rituel-quatre-temps'], date: dOff(1), time: '10:00', master: 'Brice', status: 'confirmé', source: 'trone' },
  { id: 'a-5', branchId: 'cotonou-flagship', clientId: 'c-chanel', serviceIds: ['sv-sos-restauration'], date: dOff(3), time: '09:30', master: 'Brice', status: 'confirmé', source: 'consultation' },
  { id: 'a-10', branchId: 'cotonou-flagship', clientId: 'c-adjoa', serviceIds: ['sv-resserrage'], date: dOff(2), time: '09:00', master: 'Aïcha', status: 'en attente', source: 'couronne', depositXof: 7500 },
  { id: 'a-11', branchId: 'cotonou-flagship', clientId: 'c-reine', serviceIds: ['sv-microlocks'], date: dOff(4), time: '08:30', master: 'Brice', status: 'confirmé', source: 'trone' },
  { id: 'a-12', branchId: 'cotonou-flagship', clientId: 'c-thierry', serviceIds: ['sv-bain-vapeur'], date: dOff(5), time: '16:00', master: 'Aïcha', status: 'confirmé', source: 'trone' },

  /* — passés, Cotonou (le mois courant + le mois dernier nourrissent revenus & cadences) — */
  { id: 'a-20', branchId: 'cotonou-flagship', clientId: 'c-adjoa', serviceIds: ['sv-resserrage'], date: dOff(-7), time: '09:00', master: 'Aïcha', status: 'honoré', source: 'trone' },
  { id: 'a-21', branchId: 'cotonou-flagship', clientId: 'c-thierry', serviceIds: ['sv-entretien-complet'], date: dOff(-6), time: '11:00', master: 'Romuald', status: 'honoré', source: 'trone' },
  { id: 'a-22', branchId: 'cotonou-flagship', clientId: 'c-mariama', serviceIds: ['sv-bain-vapeur', 'sv-style-conseil'], date: dOff(-5), time: '14:30', master: 'Romuald', status: 'honoré', source: 'trone' },
  { id: 'a-23', branchId: 'cotonou-flagship', clientId: 'c-reine', serviceIds: ['sv-locks-fines'], date: dOff(-4), time: '08:30', master: 'Yéman', status: 'honoré', source: 'trone' },
  { id: 'a-24', branchId: 'cotonou-flagship', clientId: 'c-gisele', serviceIds: ['sv-rituel-quatre-temps'], date: dOff(-3), time: '10:00', master: 'Brice', status: 'honoré', source: 'couronne', depositXof: 18000 },
  { id: 'a-25', branchId: 'cotonou-flagship', clientId: 'c-nadege', serviceIds: ['sv-reprise-locks'], date: dOff(-2), time: '13:00', master: 'Yéman', status: 'honoré', source: 'consultation' },
  { id: 'a-26', branchId: 'cotonou-flagship', clientId: 'c-ines', serviceIds: ['sv-bain-vapeur'], date: dOff(-1), time: '17:00', master: 'Aïcha', status: 'honoré', source: 'trone' },
  { id: 'a-27', branchId: 'cotonou-flagship', clientId: 'c-chanel', serviceIds: ['sv-entretien-complet'], date: dOff(-1), time: '09:30', master: 'Brice', status: 'annulé', source: 'couronne' },
  { id: 'a-28', branchId: 'cotonou-flagship', clientId: 'c-adjoa', serviceIds: ['sv-resserrage', 'sv-bain-vapeur'], date: dOff(-35), time: '09:00', master: 'Aïcha', status: 'honoré', source: 'trone' },
  { id: 'a-29', branchId: 'cotonou-flagship', clientId: 'c-thierry', serviceIds: ['sv-entretien-complet'], date: dOff(-34), time: '11:00', master: 'Romuald', status: 'honoré', source: 'trone' },
  { id: 'a-30', branchId: 'cotonou-flagship', clientId: 'c-mariama', serviceIds: ['sv-rituel-quatre-temps'], date: dOff(-32), time: '10:00', master: 'Brice', status: 'honoré', source: 'trone' },
  { id: 'a-31', branchId: 'cotonou-flagship', clientId: 'c-reine', serviceIds: ['sv-coiffure-event'], date: dOff(-31), time: '15:00', master: 'Yéman', status: 'honoré', source: 'trone' },
  { id: 'a-32', branchId: 'cotonou-flagship', clientId: 'c-gisele', serviceIds: ['sv-bain-vapeur'], date: dOff(-28), time: '16:00', master: 'Aïcha', status: 'honoré', source: 'trone' },

  /* — autres branches — */
  { id: 'a-6', branchId: 'abidjan', clientId: 'c-fatou', serviceIds: ['sv-resserrage'], date: dOff(0), time: '15:00', master: 'Mariam', status: 'confirmé', source: 'trone' },
  { id: 'a-40', branchId: 'abidjan', clientId: 'c-fatou', serviceIds: ['sv-entretien-complet'], date: dOff(-9), time: '10:00', master: 'Koffi', status: 'honoré', source: 'trone' },
  { id: 'a-7', branchId: 'paris', clientId: 'c-awa', serviceIds: ['sv-entretien-complet'], date: dOff(2), time: '13:00', master: 'Awa', status: 'en attente', source: 'couronne' },
  { id: 'a-41', branchId: 'paris', clientId: 'c-awa', serviceIds: ['sv-bain-vapeur'], date: dOff(-12), time: '11:00', master: 'Sébastien', status: 'honoré', source: 'trone' },
];

export const appointmentsStore = createStore<Appointment[]>('mnd_appointments', APPOINTMENTS_SEED);
export const useAppointments = () => useStore(appointmentsStore);

import { bindCollection } from './sync';
bindCollection(appointmentsStore, 'appointments');

export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 18;
