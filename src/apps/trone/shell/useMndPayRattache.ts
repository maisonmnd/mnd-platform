import { useEffect } from 'react';
import { useAuth } from '../../../shared/auth';
import { useBranch } from '../../../shared/branches';
import { useSettings } from '../../../shared/settings';
import { expensesStore, invoiceResteXof, invoicesStore, useInvoices, type Expense } from '../../../shared/finance';
import { clientsStore } from '../../../shared/clients';
import { quandTablePrete, tablePrete } from '../../../shared/sync';
import { depensesDesFraisOfferts, piecesReglees, rendezVousRegles } from '../../../shared/mnd-pay-pur';
import { appointmentsStore } from '../../../shared/agenda';
import { mndPayOuvert, useDemandesMndPay } from '../../../shared/mnd-pay';

/* ══ LE LIEN PAYÉ RÈGLE SA PIÈCE — 16 octobre 2026 (MND PAY) ════════════
   Un lien envoyé à distance (une facture, une échéance) est payé quand la
   cliente le veut, Trône ouvert ou non. Dès qu'un poste du personnel voit la
   demande « payée », il inscrit le versement sur la pièce (règle pure :
   `piecesReglees`). Le versement porte l'identifiant de la demande : deux
   postes qui l'inscrivent au même instant écrivent la même ligne, et
   personne ne l'inscrit deux fois.

   Rien ne s'écrit avant la première lecture des pièces (`tablePrete`) : une
   pièce absente du poste parce que pas encore descendue n'est pas une pièce
   absente. */
export function useMndPayRattache(): void {
  const { session } = useAuth();
  const { branch } = useBranch();
  const [settings] = useSettings();
  const actif = !!session && mndPayOuvert(settings.mndPay);
  const demandes = useDemandesMndPay(branch.id, actif);
  const [invoices] = useInvoices();

  /* LES FRAIS OFFERTS (18 octobre 2026, « Une dépense écrite seule ») : la
     demande payée sans ses frais écrit sa dépense dans la caisse MND PAY,
     une fois (identifiant tiré de la demande), jamais avant que les dépenses
     soient lues : on attend leur première lecture, puis on écrit. */
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    quandTablePrete('expenses', () => {
      if (!vivant) return;
      const neuves = depensesDesFraisOfferts(demandes, expensesStore.get(), (id) => clientsStore.get().find((c) => c.id === id)?.name);
      if (neuves.length === 0) return;
      expensesStore.set((prev) => [...prev, ...neuves.filter((n) => !prev.some((x) => x.id === n.id)) as Expense[]]);
    });
    return () => { vivant = false; };
  }, [actif, demandes]);

  useEffect(() => {
    if (!actif || !tablePrete('invoices')) return;
    const { changees, inscrits } = piecesReglees(invoices, demandes, invoiceResteXof);
    if (changees.length === 0) return;
    const parId = new Map(changees.map((p) => [p.id, p]));
    invoicesStore.set((prev) => prev.map((p) => parId.get(p.id) ?? p));
    /* Le Carnet suit la pièce (17 octobre 2026) : le rendez-vous du rituel
       reçoit le même versement, sous le même identifiant. */
    if (tablePrete('appointments')) {
      const rdvs = rendezVousRegles(appointmentsStore.get(), changees, demandes, inscrits);
      if (rdvs.length > 0) {
        const rdvParId = new Map(rdvs.map((r) => [r.id, r]));
        appointmentsStore.set((prev) => prev.map((r) => rdvParId.get(r.id) ?? r));
      }
    }
  }, [actif, demandes, invoices]);
}
