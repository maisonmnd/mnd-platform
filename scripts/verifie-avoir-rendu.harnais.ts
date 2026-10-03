/* L'AVOIR REVIENT, EPROUVE — `node scripts/verifie-avoir-rendu.mjs`.

   3 octobre 2026 : « J'ai supprime le paiement de 47 000 F et le montant
   n'est pas revenu dans l'avoir » (Yeman). Le rendez-vous du 30 octobre,
   regle par l'avoir de la famille, avait ete supprime ; sa facture restait
   seule, et la supprimer ne rendait rien : le rembobinage ne partait que si la
   piece etait encore rattachee a un rendez-vous.

   La promesse tenue ici : quel que soit l'ordre des suppressions, l'avoir
   depense pour une facture qui n'existe plus revient sur le compte. Rejoue sur
   les VRAIES fonctions du Trone. */
import { readFileSync } from 'node:fs';
import { rewindPaymentForDeletedInvoice, cancelAppointmentPayment } from '../src/apps/trone/routes/clients/actions';
import { appointmentsStore } from '../src/shared/agenda';
import { invoicesStore, creditMovementsStore, creditBalanceOf, usagesSansFacture, type CreditMovement } from '../src/shared/finance';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom} -> ${JSON.stringify(obtenu)}`);
  if (!ok) console.log(`       attendu ${JSON.stringify(attendu)}`);
};
const sansCom = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const famille = { type: 'family' as const, id: 'fam' };
const depot: CreditMovement = { id: 'd1', branchId: 'b', holderType: 'family', holderId: 'fam', kind: 'depot', amountXof: 84000, date: '2026-10-02' };
const usage: CreditMovement = { id: 'u1', branchId: 'b', holderType: 'family', holderId: 'fam', kind: 'usage', amountXof: 47000, date: '2026-10-30', forClientId: 'she', invoiceId: 'f1' };
const facture = { id: 'f1', branchId: 'b', kind: 'facture', number: 'F-2026-0700', clientId: 'she', date: '2026-10-30', lines: [], globalDiscountPct: 0, theme: 'Rose', status: 'payée', payments: [{ id: 'pf', amountXof: 47000, date: '2026-10-30', method: 'Avoir' }] };
const rdv = { id: 'a30', branchId: 'b', clientId: 'she', serviceIds: ['s'], date: '2026-10-30', time: '11:00', master: 'Team', status: 'confirmé', paidXof: 47000, invoiceId: 'f1', payments: [{ id: 'p1', amountXof: 47000, date: '2026-10-30', method: 'Avoir', invoiceId: 'f1' }] };

/* ── 1. La regle pure ── */
dit('un usage dont la facture a disparu est orphelin', ['u1'], usagesSansFacture([depot, usage], [{ id: 'autre' }]).map((m) => m.id));
dit('... pas si sa facture existe', [], usagesSansFacture([depot, usage], [{ id: 'f1' }]));
dit('... ni tant que les factures ne sont pas chargees', [], usagesSansFacture([depot, usage], []));

/* ── 2. LA PANNE : le rendez-vous supprime d'abord, la facture ensuite ── */
{
  creditMovementsStore.set([depot, usage]);
  invoicesStore.set([facture] as never);
  appointmentsStore.set([] as never); // le rendez-vous est deja parti
  dit('avant : l avoir est a 37 000 F', 37000, creditBalanceOf(creditMovementsStore.get(), famille));
  rewindPaymentForDeletedInvoice('f1', 47000);
  dit('la facture supprimee sans rendez-vous rend les 47 000 F', 84000, creditBalanceOf(creditMovementsStore.get(), famille));
}

/* ── 3. Annuler l'encaissement d'un rendez-vous rend l'avoir ── */
{
  creditMovementsStore.set([depot, usage]);
  invoicesStore.set([facture] as never);
  appointmentsStore.set([rdv] as never);
  cancelAppointmentPayment(rdv as never);
  dit('annuler l encaissement rend l avoir et retire la facture', [84000, 0],
    [creditBalanceOf(creditMovementsStore.get(), famille), invoicesStore.get().length]);
}

/* ── 4. Chaque chemin de suppression passe par la restitution ── */
{
  const fac = sansCom('src/apps/trone/routes/vente/Factures.tsx');
  dit('Factures : supprimer une piece rembobine TOUJOURS (pas seulement rattachee)', true,
    /if \(doc\) rewindPaymentForDeletedInvoice\(id, invoiceTotal\(doc\)\);/.test(fac) && !/if \(doc && linked\) rewindPaymentForDeletedInvoice/.test(fac));
  dit('Carnet : supprimer un rendez-vous encaisse annule son encaissement', true,
    /if \(aEteEncaisse\(a\)\) cancelAppointmentPayment\(a\);/.test(sansCom('src/apps/trone/routes/clients/Carnet.tsx')));
  dit('Fiche du rendez-vous : idem', true,
    /if \(encaisse\) \{\s*const \{ cancelAppointmentPayment \} = await import\('\.\/actions'\);/.test(sansCom('src/apps/trone/routes/clients/_shared.tsx')));
  dit('Serie : les pieces retirees rendent leur avoir', true,
    /for \(const id of piecesQuiPartent\) restituerAvoir\(id\);/.test(sansCom('src/apps/trone/routes/clients/SerieModal.tsx')));
  dit('Comptes : un avoir orphelin se rend d un geste', true,
    /usagesSansFacture\(rows, invoices\)/.test(sansCom('src/apps/trone/routes/finances/Comptes.tsx')));
}

console.log(ko === 0 ? '\nL avoir revient, quel que soit l ordre des suppressions.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
