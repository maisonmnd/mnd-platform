/* ══ LES FICHES D'ESSAI, À LA SOURCE — 7 novembre 2026 ═════════════════════
   « Ni dans notre liste de RDV, ni dans le chiffre d'affaires » (Yéman). La
   règle est pure (essai-pur.ts) ; ici, les portes que les écrans prennent.

   DEUX FAMILLES DE PORTES, ET C'EST VOULU :
   · `useRdvsDeLaMaison`, `usePiecesDeLaMaison`, `usePaiementsDeLaMaison`,
     `useClientsDeLaMaison`, et `useBranchAppointments` (clients/_shared) :
     ce que la Maison COMPTE ou LISTE. Les essais n'y sont pas. Tout écran de
     chiffre, de compteur, de liste d'équipe ou d'envoi à l'équipe passe par
     là, comme `useDepensesComptees` pour les dépenses en attente ;
   · `useAppointments`, `useInvoices`, `useClients`, les magasins eux-mêmes :
     le registre ENTIER. Il sert à écrire (la fin du rituel, l'honneur, le
     règlement), à servir LA cliente (Ma Couronne, le billet, WhatsApp) et à
     ouvrir une fiche ou un rendez-vous d'essai. Rien de la chaîne d'essai
     n'y change.

   Les mêmes jugements, hors React, pour le code qui lit les magasins
   directement (`rdvsDeLaMaison`, `piecesDeLaMaison`). */
import { useMemo } from 'react';
import { appointmentsStore, useAppointments, type Appointment } from './agenda';
import { clientsStore, useClients, type Client } from './clients';
import { invoicesStore, paymentsStore, useInvoices, usePayments, type Invoice, type Payment } from './finance';
import { createStore, useStore } from './store';
import {
  estUneFicheDEssai, estUnRdvDEssai, fichesParId, fichesSansLesEssais, piecesSansLesEssais, sansLesEssais,
} from './essai-pur';

export const useFichesParId = (): Map<string, Client> => {
  const [clients] = useClients();
  return useMemo(() => fichesParId(clients), [clients]);
};

/** Les rendez-vous que la Maison compte. Même forme que `useAppointments`. */
export const useRdvsDeLaMaison = (): [Appointment[], ReturnType<typeof useAppointments>[1]] => {
  const [rdvs, set] = useAppointments();
  const parId = useFichesParId();
  return [useMemo(() => sansLesEssais(rdvs, parId), [rdvs, parId]), set];
};

/** Les pièces que la Maison compte (factures et devis). Même forme que `useInvoices`. */
export const usePiecesDeLaMaison = (): [Invoice[], ReturnType<typeof useInvoices>[1]] => {
  const [pieces, set] = useInvoices();
  const [rdvs] = useAppointments();
  const parId = useFichesParId();
  return [useMemo(() => piecesSansLesEssais(pieces, parId, rdvs), [pieces, parId, rdvs]), set];
};

/** Les fiches qui comptent (statistiques de la Maison). Même forme que `useClients`. */
export const useClientsDeLaMaison = (): [Client[], ReturnType<typeof useClients>[1]] => {
  const [clients, set] = useClients();
  return [useMemo(() => fichesSansLesEssais(clients), [clients]), set];
};

const paiementsSansLesEssais = (paiements: readonly Payment[], rdvs: readonly Appointment[], parId: ReadonlyMap<string, Client>): Payment[] => {
  const rdvParId = new Map(rdvs.map((r) => [r.id, r]));
  return paiements.filter((p) => {
    if (p.clientId && estUneFicheDEssai(parId.get(p.clientId))) return false;
    const r = p.partnerId ? rdvParId.get(p.partnerId) : undefined;
    return !(r && estUnRdvDEssai(r, parId));
  });
};

/** Les paiements en ligne (KkiaPay) que la Maison compte. */
export const usePaiementsDeLaMaison = (): [Payment[], ReturnType<typeof usePayments>[1]] => {
  const [paiements, set] = usePayments();
  const [rdvs] = useAppointments();
  const parId = useFichesParId();
  return [useMemo(() => paiementsSansLesEssais(paiements, rdvs, parId), [paiements, rdvs, parId]), set];
};

/* Hors React. */
export const rdvsDeLaMaison = (): Appointment[] => sansLesEssais(appointmentsStore.get(), fichesParId(clientsStore.get()));
export const piecesDeLaMaison = (): Invoice[] =>
  piecesSansLesEssais(invoicesStore.get(), fichesParId(clientsStore.get()), appointmentsStore.get());
export const paiementsDeLaMaison = (): Payment[] =>
  paiementsSansLesEssais(paymentsStore.get(), appointmentsStore.get(), fichesParId(clientsStore.get()));

/** « Montrer les essais » au calendrier : un réglage de CE poste, éteint par défaut. */
export const montrerLesEssaisStore = createStore<boolean>('mnd_montrer_les_essais', false);
export const useMontrerLesEssais = () => useStore(montrerLesEssaisStore);
