import { useState } from 'react';
import { Button, Field, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, clientsStore } from '../../../../shared/clients';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { type Service } from '../../../../shared/catalog';
import {
  invoicesStore, useCashboxes, invoiceTotal,
  type Invoice, type InvoiceLine, type PaymentMethod,
} from '../../../../shared/finance';
import { pointsRateStore, pointsHistoryStore } from '../../../../shared/offers';
import { uid } from '../../../../shared/store';
import {
  apptLabel, apptServices, apptTotalXof, frShort, todayISO, useServicesById,
} from './_shared';

/* Actions transverses Clients & Agenda : fidélité (points Cercle) + encaissement d'un RDV. */

/* ---------- Fidélité — points attribués à l'honneur d'un RDV ---------- */

/** Attribue les points Cercle MND correspondant à un montant (1 point / `taux` F). */
export function awardLoyalty(clientId: string, amountXof: number, label: string): number {
  const rate = pointsRateStore.get() || 100;
  const pts = Math.max(0, Math.floor(amountXof / rate));
  if (pts <= 0 || !clientId) return 0;
  const client = clientsStore.get().find((c) => c.id === clientId);
  clientsStore.set((prev) =>
    prev.map((c) => (c.id === clientId ? { ...c, loyaltyPoints: (c.loyaltyPoints ?? 0) + pts } : c)),
  );
  pointsHistoryStore.set((prev) => [
    { id: `pt-${uid()}`, clientId, clientName: client?.name ?? '—', label, pts, at: new Date().toISOString() },
    ...prev,
  ]);
  return pts;
}

/** Passe un RDV à « honoré » et attribue les points Cercle une seule fois. */
export function honorAppointment(appt: Appointment, byId: Map<string, Service>): number {
  const total = apptTotalXof(appt, byId);
  const awarded = appt.pointsAwarded ? 0 : awardLoyalty(appt.clientId, total, `Rituel honoré · ${frShort(appt.date)}`);
  appointmentsStore.set((prev) =>
    prev.map((a) => (a.id === appt.id ? { ...a, status: 'honoré', pointsAwarded: true } : a)),
  );
  return awarded;
}

/* ---------- Encaisser un RDV — Tableau de bord / Calendrier / Carnet ---------- */

const PAY_METHODS: PaymentMethod[] = ['MTN MoMo', 'Moov', 'Espèces', 'Carte', 'Lien WhatsApp'];

export function PayAppointmentModal({ appt, onClose }: { appt: Appointment; onClose: () => void }) {
  const { branch, currency } = useBranch();
  const byId = useServicesById();
  const [clients] = useClients();
  const [cashboxes] = useCashboxes();
  const branchBoxes = cashboxes.filter((c) => c.branchId === branch.id);

  const services = apptServices(appt, byId);
  const total = apptTotalXof(appt, byId);
  const deposit = appt.depositXof ?? 0;
  const due = Math.max(0, total - deposit);

  const [pay, setPay] = useState<PaymentMethod>('MTN MoMo');
  const [cashbox, setCashbox] = useState(branchBoxes[0]?.name ?? '');
  const client = clients.find((c) => c.id === appt.clientId);

  const confirm = () => {
    const lines: InvoiceLine[] = services.map((s) => ({
      id: `il-${uid()}`, label: s.name, qty: 1, unitXof: s.priceXof, discountPct: 0,
    }));
    const inv: Invoice = {
      id: `inv-${uid()}`,
      branchId: branch.id,
      kind: 'facture',
      number: `F-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
      clientId: appt.clientId,
      date: todayISO(),
      lines,
      globalDiscountPct: 0,
      theme: 'Rose',
      status: 'payée',
      payment: pay,
      cashbox,
      time: new Date().toTimeString().slice(0, 5),
      clientName: client?.name,
      master: appt.master,
    };
    invoicesStore.set((prev) => [inv, ...prev]);
    const awarded = honorAppointment(appt, byId);
    appointmentsStore.set((prev) => prev.map((a) => (a.id === appt.id ? { ...a, invoiceId: inv.id } : a)));
    onClose();
    if (awarded > 0) {
      window.setTimeout(
        () => window.alert(`Rituel honoré · facture ${fmtMoney(invoiceTotal(inv), currency)} · ${awarded} points Cercle pour ${client?.name ?? 'la cliente'}.`),
        30,
      );
    }
  };

  return (
    <Modal title="Encaisser le rituel" onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="mnd-muted" style={{ fontSize: 13 }}>
          {client?.name ?? 'Cliente'} · {apptLabel(appt, byId)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="mnd-muted">Total</span>
          <span style={{ fontFamily: 'var(--font-serif)' }}>{fmtMoney(total, currency)}</span>
        </div>
        {deposit > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="mnd-muted">Acompte déjà réglé</span><span>−{fmtMoney(deposit, currency)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-serif)', fontSize: 18 }}>
          <span>Reste à encaisser</span><span className="mnd-copper">{fmtMoney(due, currency)}</span>
        </div>
        <Field label="Moyen de paiement">
          <Select value={pay} onChange={(e) => setPay(e.target.value as PaymentMethod)}>
            {PAY_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        {branchBoxes.length > 0 && (
          <Field label="Caisse">
            <Select value={cashbox} onChange={(e) => setCashbox(e.target.value)}>
              {branchBoxes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <Button variant="copper" onClick={confirm} style={{ marginTop: 4 }}>
          Encaisser {fmtMoney(due, currency)} &amp; honorer
        </Button>
      </div>
    </Modal>
  );
}
