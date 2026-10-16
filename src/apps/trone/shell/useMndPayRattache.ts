import { useEffect } from 'react';
import { useAuth } from '../../../shared/auth';
import { useBranch } from '../../../shared/branches';
import { useSettings } from '../../../shared/settings';
import { invoiceResteXof, invoicesStore, useInvoices } from '../../../shared/finance';
import { tablePrete } from '../../../shared/sync';
import { piecesReglees } from '../../../shared/mnd-pay-pur';
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

  useEffect(() => {
    if (!actif || !tablePrete('invoices')) return;
    const { changees } = piecesReglees(invoices, demandes, invoiceResteXof);
    if (changees.length === 0) return;
    const parId = new Map(changees.map((p) => [p.id, p]));
    invoicesStore.set((prev) => prev.map((p) => parId.get(p.id) ?? p));
  }, [actif, demandes, invoices]);
}
