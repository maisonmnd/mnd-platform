import { useRef, useState } from 'react';
import { Button, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useClients, clientsStore } from '../../../../shared/clients';
import { appointmentsStore, type Appointment } from '../../../../shared/agenda';
import { type Service } from '../../../../shared/catalog';
import {
  invoicesStore, useCashboxes, invoiceTotal, usePaymentMethods,
  type Invoice, type InvoiceLine, type PaymentMethod,
} from '../../../../shared/finance';
import { pointsRateStore, pointsHistoryStore } from '../../../../shared/offers';
import { uid } from '../../../../shared/store';
import { addTip } from '../../../../shared/tips';
import { useStaff } from '../equipe/data';
import {
  apptLabel, apptServices, apptNetXof, apptDueXof, frShort, todayISO, useServicesById,
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
  const total = apptNetXof(appt, byId);
  const awarded = appt.pointsAwarded ? 0 : awardLoyalty(appt.clientId, total, `Rituel honoré · ${frShort(appt.date)}`);
  appointmentsStore.set((prev) =>
    prev.map((a) => (a.id === appt.id ? { ...a, status: 'honoré', pointsAwarded: true } : a)),
  );
  return awarded;
}

/* ---------- Encaisser un RDV — Tableau de bord / Calendrier / Carnet ---------- */

export function PayAppointmentModal({ appt, onClose }: { appt: Appointment; onClose: () => void }) {
  const { branch, currency } = useBranch();
  const byId = useServicesById();
  const [clients] = useClients();
  const [cashboxes] = useCashboxes();
  const [team] = useStaff();
  const [methods] = usePaymentMethods();
  const branchBoxes = cashboxes.filter((c) => c.branchId === branch.id);

  const services = apptServices(appt, byId);
  const net = apptNetXof(appt, byId);
  const deposit = appt.depositXof ?? 0;
  const alreadyPaid = appt.paidXof ?? 0;
  const due = apptDueXof(appt, byId);

  const [pay, setPay] = useState<PaymentMethod>('MTN MoMo');
  const [cashbox, setCashbox] = useState(branchBoxes[0]?.name ?? '');
  const [amountStr, setAmountStr] = useState(String(due));
  const amount = Math.max(0, Math.min(due, Math.round(Number(amountStr) || 0)));
  const [tipStr, setTipStr] = useState('0');
  const tip = Math.max(0, Math.round(Number(tipStr) || 0));
  /* Le maître officiant, retrouvé dans le personnel par son nom — reçoit le pourboire. */
  const tipMaster = team.find((s) => s.name === appt.master);
  const remainingAfter = Math.max(0, due - amount);
  const submitting = useRef(false); // garde-fou anti double-clic (double facture / double pourboire)
  const fullyPaid = remainingAfter === 0;
  const client = clients.find((c) => c.id === appt.clientId);

  const confirm = () => {
    if (submitting.current) return; // évite la double-soumission (double-clic rapide)
    if (amount <= 0 && tip <= 0) return;
    submitting.current = true;
    let awarded = 0;
    if (amount > 0) {
      /* Une ligne unique proportionnelle au montant encaissé (paiement partiel possible). */
      const lines: InvoiceLine[] = [{
        id: `il-${uid()}`,
        label: fullyPaid && alreadyPaid === 0 ? apptLabel(appt, byId) : `Règlement · ${apptLabel(appt, byId)}`,
        qty: 1, unitXof: amount, discountPct: 0,
      }];
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
        note: fullyPaid ? undefined : `Paiement partiel — reste ${fmtMoney(remainingAfter, currency)}`,
        /* Le pourboire rejoint la MÊME caisse que le paiement — traçable, mais
           toujours hors chiffre d'affaires (invoiceTotal l'exclut). Seulement s'il est
           attribuable à un maître, pour que « à reverser aux maîtres » reste juste. */
        tipXof: tip > 0 && tipMaster ? tip : undefined,
      };
      invoicesStore.set((prev) => [inv, ...prev]);
      if (fullyPaid) awarded = honorAppointment(appt, byId); // marque honoré + points Cercle
      appointmentsStore.set((prev) => prev.map((a) => (a.id === appt.id ? { ...a, invoiceId: inv.id, paidXof: alreadyPaid + amount } : a)));
    } else if (tip > 0 && tipMaster) {
      /* Pourboire seul sur un rituel déjà soldé : on crée une facture minimale à 0 F
         (invoiceTotal=0 → aucun chiffre d'affaires) portant le pourboire, pour qu'il
         reste tracé dans la caisse et reversable au maître. */
      const inv: Invoice = {
        id: `inv-${uid()}`,
        branchId: branch.id,
        kind: 'facture',
        number: `F-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
        clientId: appt.clientId,
        date: todayISO(),
        lines: [{ id: `il-${uid()}`, label: `Pourboire · ${appt.master}`, qty: 1, unitXof: 0, discountPct: 0 }],
        globalDiscountPct: 0,
        theme: 'Rose',
        status: 'payée',
        payment: pay,
        cashbox,
        time: new Date().toTimeString().slice(0, 5),
        clientName: client?.name,
        master: appt.master,
        note: 'Pourboire',
        tipXof: tip,
      };
      invoicesStore.set((prev) => [inv, ...prev]);
    }

    /* Pourboire — enregistré séparément sur le maître officiant (jamais dans la
       facture ni le chiffre d'affaires). Possible même si le rituel est déjà soldé,
       à condition que le maître soit bien dans le personnel. */
    const tipRecorded = tip > 0 && !!tipMaster;
    if (tip > 0 && tipMaster) addTip(tipMaster.id, tip, todayISO());

    onClose();
    /* Alerte honnête : on ne prétend jamais avoir attribué un pourboire perdu. */
    const payMsg = amount > 0
      ? (fullyPaid
          ? `Réglé en totalité · ${fmtMoney(amount, currency)}${awarded > 0 ? ` · ${awarded} points Cercle pour ${client?.name ?? 'la cliente'}` : ''}.`
          : `Paiement partiel enregistré · ${fmtMoney(amount, currency)} · reste ${fmtMoney(remainingAfter, currency)}.`)
      : '';
    const tipMsg = tip <= 0 ? ''
      : tipRecorded ? ` · pourboire ${fmtMoney(tip, currency)} pour ${appt.master}`
      : ` · pourboire ${fmtMoney(tip, currency)} NON attribué (maître « ${appt.master || '—'} » introuvable dans le personnel)`;
    const msg = (payMsg + tipMsg).replace(/^ · /, '').trim() || 'Enregistré.';
    window.setTimeout(() => window.alert(msg), 30);
  };

  return (
    <Modal title="Encaisser le rituel" onClose={onClose} width={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="mnd-muted" style={{ fontSize: 13 }}>
          {client?.name ?? 'Cliente'} · {apptLabel(appt, byId)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span className="mnd-muted">Total{appt.discountPct ? ` (remise −${appt.discountPct}%)` : ''}</span>
          <span style={{ fontFamily: 'var(--font-serif)' }}>{fmtMoney(net, currency)}</span>
        </div>
        {deposit > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="mnd-muted">Acompte réglé</span><span>−{fmtMoney(deposit, currency)}</span>
          </div>
        )}
        {alreadyPaid > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="mnd-muted">Déjà encaissé</span><span>−{fmtMoney(alreadyPaid, currency)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-serif)', fontSize: 18 }}>
          <span>Reste à encaisser</span><span className="mnd-copper">{fmtMoney(due, currency)}</span>
        </div>
        <Field label="Montant encaissé maintenant">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Input type="number" min={0} max={due} value={amountStr} onChange={(e) => setAmountStr(e.target.value)} style={{ textAlign: 'right' }} />
            <button type="button" className="mnd-btn mnd-btn--ghost mnd-btn--sm" onClick={() => setAmountStr(String(due))}>Tout</button>
          </div>
        </Field>
        <Field label="Moyen de paiement">
          <Select value={pay} onChange={(e) => setPay(e.target.value as PaymentMethod)}>
            {methods.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        {branchBoxes.length > 0 && (
          <Field label="Caisse">
            <Select value={cashbox} onChange={(e) => setCashbox(e.target.value)}>
              {branchBoxes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={`Pourboire (F CFA) — pour ${appt.master || 'le maître'}`}>
          <Input type="number" min={0} value={tipStr} onChange={(e) => setTipStr(e.target.value)} style={{ textAlign: 'right' }} />
        </Field>
        {tip > 0 && !tipMaster && (
          <div style={{ fontSize: 12, color: 'var(--trf-error, #8f3b30)', marginTop: -6 }}>
            « {appt.master || '—'} » n'est pas dans le personnel — le pourboire ne pourra pas être attribué.
          </div>
        )}
        <Button
          variant="copper"
          onClick={confirm}
          disabled={amount <= 0 && (tip <= 0 || !tipMaster)}
          style={{ marginTop: 4 }}
        >
          {amount <= 0 && tip > 0
            ? `Enregistrer le pourboire ${fmtMoney(tip, currency)}`
            : fullyPaid ? `Encaisser ${fmtMoney(amount, currency)} & honorer` : `Encaisser ${fmtMoney(amount, currency)} (partiel)`}
        </Button>
      </div>
    </Modal>
  );
}
