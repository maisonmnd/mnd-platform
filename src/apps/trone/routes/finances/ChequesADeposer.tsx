import { useMemo, useState } from 'react';
import { toast } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { useClients } from '../../../../shared/clients';
import { fmtMoney } from '../../../../shared/currency';
import { invoicesStore, quiEncaisse, useInvoices } from '../../../../shared/finance';
import { jourDit } from '../../../../shared/gestes-conversation';
import { jourLocal } from '../../../../shared/mnd-pay-pur';
import { chequesADeposer, traceDite } from '../../../../shared/trace-du-moyen-pur';

/* ══ LES CHÈQUES À DÉPOSER — 18 octobre 2026 ═══════════════════════════
   Maquette « Chèque et carte » validée : les chèques encaissés avec leur
   trace et pas encore portés à la banque, le total à porter, et « Marquer
   déposés ». Les chèques d'avant la trace n'y paraissent pas : rien ne dit
   s'ils ont été déposés. */
export function ChequesADeposer() {
  const { branch, currency } = useBranch();
  const [pieces] = useInvoices();
  const [clients] = useClients();
  const [ecartes, setEcartes] = useState<Set<string>>(new Set());
  const nomDe = (id?: string, repli?: string) => clients.find((c) => c.id === id)?.name || repli || 'Cliente';
  const liste = useMemo(() => chequesADeposer(pieces, branch.id, nomDe), [pieces, branch.id, clients]); // eslint-disable-line react-hooks/exhaustive-deps
  if (liste.length === 0) return null;
  const choisis = liste.filter((c) => !ecartes.has(c.paymentId));
  const total = choisis.reduce((n, c) => n + c.montantXof, 0);
  const aujourdhui = jourLocal(new Date().toISOString());

  const deposer = () => {
    if (choisis.length === 0) return;
    const ids = new Set(choisis.map((c) => c.paymentId));
    const par = quiEncaisse();
    invoicesStore.set((prev) => prev.map((i) => ((i.payments ?? []).some((v) => ids.has(v.id))
      ? { ...i, payments: (i.payments ?? []).map((v) => (ids.has(v.id) && v.trace ? { ...v, trace: { ...v.trace, deposeLe: aujourdhui, ...(par ? { deposePar: par } : {}) } } : v)) }
      : i)));
    setEcartes(new Set());
    toast(`${choisis.length} chèque${choisis.length > 1 ? 's' : ''} déposé${choisis.length > 1 ? 's' : ''} le ${jourDit(aujourdhui)} · ${fmtMoney(total, currency)}.`);
  };

  return (
    <section data-cheques-a-deposer={liste.length} style={{ border: '1px solid var(--copper-300)', background: 'var(--copper-50)', borderRadius: 'var(--radius-md)', padding: '14px 16px', margin: '14px 0', display: 'grid', gap: 8 }}>
      <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>Chèques à déposer</div>
      {liste.map((c) => (
        <label key={c.paymentId} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 10, alignItems: 'baseline', fontFamily: 'var(--font-sans)', fontSize: 13 }}>
          <input
            type="checkbox"
            id={`depot-${c.paymentId}`}
            checked={!ecartes.has(c.paymentId)}
            onChange={() => setEcartes((avant) => { const s = new Set(avant); if (s.has(c.paymentId)) s.delete(c.paymentId); else s.add(c.paymentId); return s; })}
          />
          <span>{c.client} · {traceDite(c.trace) || 'chèque'} · {jourDit(c.date)}</span>
          <b style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(c.montantXof, currency)}</b>
        </label>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderTop: '1px solid var(--copper-300)', paddingTop: 8 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13 }}>Total à porter à la banque · <b style={{ fontWeight: 600 }}>{fmtMoney(total, currency)}</b></span>
        <button type="button" className="mnd-btn mnd-btn--sm" disabled={choisis.length === 0} onClick={deposer}>
          Marquer déposés le {jourDit(aujourdhui)}
        </button>
      </div>
    </section>
  );
}
