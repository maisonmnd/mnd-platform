import { useMemo } from 'react';
import { appointmentsStore, useAppointments, type Appointment } from '../../../../shared/agenda';
import { invoiceResteXof, invoicesStore, useInvoices, type Invoice } from '../../../../shared/finance';
import { servicesStore, useServices, type Service } from '../../../../shared/catalog';
import { subPaid, subscribersStore, useSubscribers, type Subscriber } from '../../../../shared/abonnements';
import { etatDesEcheances } from '../../../../shared/echeancier';
import { dettesDeLaCliente, type Dette } from '../../../../shared/ia-capture-pur';
import { apptDueXof, todayISO } from './_shared';

/* ══ CE QUE LA CLIENTE DOIT, LU DANS LES MAGASINS — 19 octobre 2026 ══════
   La règle est pure (`dettesDeLaCliente`) ; ici on lui tend les magasins du
   Trône : le reste d'un rituel (`apptDueXof`, le même juge que le Carnet),
   le reste d'une pièce (`invoiceResteXof`), la prochaine échéance d'un
   abonnement (`etatDesEcheances`). Une version sans React pour le crochet
   du Shell, une avec pour les écrans. */

type Magasins = { rdvs: readonly Appointment[]; pieces: readonly Invoice[]; abonnements: readonly Subscriber[]; services: readonly Service[] };

export function dettesDepuisLesMagasins(clientId: string, m: Magasins, aujourdhui = todayISO()): Dette[] {
  const byId = new Map(m.services.map((s) => [s.id, s]));
  return dettesDeLaCliente({
    clientId,
    rdvs: m.rdvs,
    resteDuRdv: (a) => apptDueXof(a, byId),
    pieces: m.pieces,
    resteDeLaPiece: invoiceResteXof,
    abonnements: m.abonnements,
    echeancesDe: (s) => etatDesEcheances(s.echeances ?? [], subPaid(s), aujourdhui),
    aujourdhui,
  });
}

/** Pour le crochet du Shell : les magasins à l'instant du geste. */
export const dettesDeLaClienteMaintenant = (clientId: string): Dette[] =>
  dettesDepuisLesMagasins(clientId, {
    rdvs: appointmentsStore.get(), pieces: invoicesStore.get(), abonnements: subscribersStore.get(), services: servicesStore.get(),
  });

/** Pour les écrans : se recalcule quand un magasin bouge. */
export function useDettesDeLaCliente(clientId: string | undefined): Dette[] {
  const [rdvs] = useAppointments();
  const [pieces] = useInvoices();
  const [abonnements] = useSubscribers();
  const [services] = useServices();
  return useMemo(
    () => (clientId ? dettesDepuisLesMagasins(clientId, { rdvs, pieces, abonnements, services }) : []),
    [clientId, rdvs, pieces, abonnements, services],
  );
}
