import { useEffect, useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useCategories, useServices, useProducts } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { ClientPicker } from '../clients/_shared';
import { useInvoices, useCashboxes, invoiceTotal, type Invoice, type PaymentMethod } from '../../../../shared/finance';
import { invoicePdf, type InvoicePdfData } from '../../../../shared/pdf';
import { uid } from '../../../../shared/store';
import './vente.css';

/* Caisse POS — encaissement au fauteuil. Chaque encaissement crée une facture
   payée dans le registre des finances et crédite la caisse choisie. */

type CartLine = { qty: number; disc: number };

const PAY_METHODS: { k: PaymentMethod; n: string; sub: string }[] = [
  { k: 'MTN MoMo', n: 'MTN MoMo', sub: 'Mobile Money · 506846' },
  { k: 'Moov', n: 'Moov Money', sub: 'Mobile Money · 401122' },
  { k: 'Espèces', n: 'Espèces', sub: 'Caisse' },
  { k: 'Carte', n: 'Carte', sub: 'TPE bancaire' },
  { k: 'Lien WhatsApp', n: 'Lien WhatsApp', sub: 'Paiement à distance' },
];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDateFr = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function Caisse() {
  const { branch, currency } = useBranch();
  const [categories] = useCategories();
  const [services] = useServices();
  const [products] = useProducts();
  const [clients] = useClients();
  const [invoices, setInvoices] = useInvoices();
  const [cashboxes] = useCashboxes();

  const [tab, setTab] = useState<'encaisser' | 'journal'>('encaisser');
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [globalDisc, setGlobalDisc] = useState(0);
  const [clientId, setClientId] = useState('');
  const [pay, setPay] = useState<PaymentMethod>('MTN MoMo');
  const branchCashboxes = cashboxes.filter((c) => c.branchId === branch.id);
  const [cashbox, setCashbox] = useState<string>('');
  const [journalCaisse, setJournalCaisse] = useState<string>('Toutes');
  const [waHint, setWaHint] = useState<string | null>(null);

  /* La caisse active reste toujours valide : on sélectionne la première caisse de
     la branche au montage (et au changement de branche), et on ne réinitialise
     jamais la sélection après une vente. Vide s'il n'existe aucune caisse. */
  useEffect(() => {
    if (branchCashboxes.length === 0) {
      if (cashbox) setCashbox('');
    } else if (!branchCashboxes.some((c) => c.name === cashbox)) {
      setCashbox(branchCashboxes[0].name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.id, cashboxes]);

  const activeCashbox = branchCashboxes.some((c) => c.name === cashbox)
    ? cashbox
    : branchCashboxes[0]?.name ?? '';
  const hasCashbox = branchCashboxes.length > 0;

  const branchClients = clients.filter((c) => c.branchId === branch.id && !c.archived);

  /* — l'offre, groupée par catégorie ™ — */
  const groups = useMemo(() => {
    const cats = [...categories].sort((a, b) => a.order - b.order);
    type CaisseItem = { key: string; n: string; priceXof: number; kind: 'service' | 'product' };
    const gs: { key: string; label: string; items: CaisseItem[] }[] = cats
      .map((cat) => ({
        key: cat.id,
        label: `${cat.fon} · ${cat.label}`,
        items: services
          .filter((s) => s.categoryId === cat.id)
          .sort((a, b) => a.order - b.order)
          .map((s) => ({ key: `s:${s.id}`, n: s.name, priceXof: s.priceXof, kind: 'service' as const })),
      }))
      .filter((g) => g.items.length > 0);
    const prods = [...products].sort((a, b) => a.order - b.order).map((p) => ({ key: `p:${p.id}`, n: p.name, priceXof: p.priceXof, kind: 'product' as const }));
    if (prods.length) gs.push({ key: 'produits', label: 'Produits Maison · DÒDÒ™', items: prods });
    return gs;
  }, [categories, services, products]);

  const flat = useMemo(() => {
    const map: Record<string, { n: string; priceXof: number; kind: 'service' | 'product' }> = {};
    groups.forEach((g) => g.items.forEach((it) => { map[it.key] = it; }));
    return map;
  }, [groups]);

  const add = (key: string) =>
    setCart((c) => ({ ...c, [key]: { qty: (c[key]?.qty ?? 0) + 1, disc: c[key]?.disc ?? 0 } }));
  const dec = (key: string) =>
    setCart((c) => {
      const cur = c[key];
      if (!cur) return c;
      if (cur.qty <= 1) {
        const { [key]: _drop, ...rest } = c;
        return rest;
      }
      return { ...c, [key]: { ...cur, qty: cur.qty - 1 } };
    });
  const setLineDisc = (key: string, pct: number) =>
    setCart((c) => (c[key] ? { ...c, [key]: { ...c[key], disc: c[key].disc === pct ? 0 : pct } } : c));

  const lines = Object.entries(cart)
    .filter(([k]) => flat[k])
    .map(([k, v]) => {
      const it = flat[k];
      const netXof = it.priceXof * v.qty * (1 - v.disc / 100);
      return { key: k, ...it, ...v, netXof };
    });
  const subXof = lines.reduce((s, l) => s + l.netXof, 0);
  const netXof = Math.round(subXof * (1 - globalDisc / 100));

  /* — encaissement — */
  const nextNumber = () => {
    const year = new Date().getFullYear();
    const max = invoices.reduce((m, i) => {
      const n = parseInt(i.number.replace(/\D/g, '').slice(-4), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 1042);
    return `MND-${year}-${String(max + 1).padStart(4, '0')}`;
  };

  const checkout = async () => {
    if (lines.length === 0) return;
    const client = branchClients.find((c) => c.id === clientId);
    const now = new Date();
    const grossXof = lines.reduce((s, l) => s + l.priceXof * l.qty, 0);
    const inv: Invoice = {
      id: uid(),
      branchId: branch.id,
      kind: 'facture',
      number: nextNumber(),
      clientId: client?.id ?? '',
      clientName: client ? undefined : 'Walk-in',
      date: todayIso(),
      time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      lines: lines.map((l) => ({ id: uid(), label: l.n, qty: l.qty, unitXof: l.priceXof, discountPct: l.disc })),
      globalDiscountPct: globalDisc,
      theme: 'Aube',
      status: 'payée',
      payment: pay,
      cashbox: activeCashbox,
    };
    setInvoices((prev) => [inv, ...prev]);
    if (pay === 'Lien WhatsApp') {
      /* Un lien wa.me ne peut PAS joindre de fichier : on télécharge d'abord le vrai
         reçu PDF, puis on ouvre le chat pré-rempli en signalant la pièce jointe. */
      const receipt: InvoicePdfData = {
        kind: 'facture',
        number: inv.number,
        houseName: branch.name,
        houseSub: branch.city ? `${branch.city} · l'art de la couronne` : undefined,
        date: fmtDateFr(inv.date),
        clientName: client?.name ?? 'Cliente de passage',
        clientPhone: client?.phone,
        lines: inv.lines.map((l) => ({
          label: l.label,
          qty: l.qty,
          unit: fmtMoney(l.unitXof, currency),
          total: fmtMoney(Math.round(l.qty * l.unitXof * (1 - l.discountPct / 100)), currency),
        })),
        subtotal: fmtMoney(Math.round(grossXof), currency),
        discount: grossXof - netXof > 0 ? `− ${fmtMoney(Math.round(grossXof - netXof), currency)}` : undefined,
        total: fmtMoney(netXof, currency),
        payment: inv.payment,
        status: 'payée',
      };
      await invoicePdf(receipt);
      const msg =
        `Maison MND · ${inv.number}\n` +
        `${client ? client.name : 'Chère tête couronnée'}, voici le règlement de votre passage : ${fmtMoney(netXof, currency)}.\n` +
        `Votre reçu ${inv.number} est en pièce jointe.\n` +
        `Réglez d’un geste — MTN MoMo · Moov Money. La maison veille sur votre couronne.`;
      const phone = client?.phone.replace(/\D/g, '') ?? '';
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      setWaHint('Reçu PDF téléchargé — joignez-le à votre message WhatsApp.');
    } else {
      setWaHint(null);
    }
    setCart({});
    setGlobalDisc(0);
  };

  /* — journal du jour — */
  const today = todayIso();
  const journal = invoices
    .filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée' && i.date === today)
    .filter((i) => journalCaisse === 'Toutes' || (i.cashbox ?? 'Caisse principale') === journalCaisse);
  const journalTotal = journal.reduce((s, i) => s + invoiceTotal(i), 0);
  const sumBy = (fn: (p?: PaymentMethod) => boolean) => journal.filter((i) => fn(i.payment)).reduce((s, i) => s + invoiceTotal(i), 0);
  const clientName = (i: Invoice) => clients.find((c) => c.id === i.clientId)?.name ?? i.clientName ?? '—';
  const journalDateLabel = (() => {
    const s = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  })();

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Point de vente · Encaissement"
        title="Caisse."
        actions={
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
            Caisse active
            {hasCashbox ? (
              <select
                className="mnd-select"
                value={activeCashbox}
                onChange={(e) => setCashbox(e.target.value)}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}
              >
                {branchCashboxes.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
              </select>
            ) : (
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 13, color: 'var(--ink-soft)', textTransform: 'none', letterSpacing: 0 }}>
                Aucune caisse — créez-en une dans Dépenses
              </span>
            )}
          </label>
        }
      />

      <div className="trv-tabs">
        <button className={`trv-tab ${tab === 'encaisser' ? 'is-active' : ''}`} onClick={() => setTab('encaisser')}>Encaisser</button>
        <button className={`trv-tab ${tab === 'journal' ? 'is-active' : ''}`} onClick={() => setTab('journal')}>Journal de caisse</button>
      </div>

      {tab === 'encaisser' && (
        <div className="trv-pos-grid">
          {/* — l'offre — */}
          <div>
            <div className="trv-sec-label trv-sec-label--copper">Services & produits</div>
            {groups.map((g, gi) => {
              const [fon, ...rest] = g.label.split(' · ');
              return (
                <div key={g.key} className="trv-catgroup" style={gi > 0 ? { borderTop: '1px solid var(--hairline)', marginTop: 18, paddingTop: 16 } : undefined}>
                  <div className="trv-catgroup__head">
                    <span className="trv-catgroup__fon">{fon}</span>
                    {rest.length > 0 && <span className="trv-catgroup__label">{rest.join(' · ')}</span>}
                    <span className="trv-catgroup__count">{g.items.length}</span>
                  </div>
                  <div className="tr-grid tr-grid--2">
                    {g.items.map((it) => (
                      <button key={it.key} className="trv-pick" onClick={() => add(it.key)}>
                        <div className="n">{it.n}</div>
                        <div className="p">{fmtMoney(it.priceXof, currency)}</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* — le ticket — */}
          <div className="trv-ticket">
            <div className="trv-ticket__head">
              <span className="t">Ticket</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-200)' }}>{activeCashbox}</span>
            </div>
            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 16, borderBottom: '1px solid var(--hairline)' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)', flex: 'none' }}>Cliente</span>
                <div style={{ flex: 1 }}>
                  <ClientPicker value={clientId} onChange={setClientId} allowWalkIn />
                </div>
              </div>

              {lines.length === 0 && (
                <div style={{ textAlign: 'center', padding: '34px 16px', fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-soft)' }}>
                  Touchez une prestation pour l’ajouter au ticket.
                </div>
              )}

              {lines.map((l) => (
                <div key={l.key} className="trv-line">
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--ink)' }}>{l.n}</div>
                      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>
                        {fmtMoney(l.priceXof, currency)} · {l.kind === 'product' ? 'produit' : 'service'}
                      </div>
                    </div>
                    <span className="trv-qty">
                      <button onClick={() => dec(l.key)}>−</button>
                      <span className="q">{l.qty}</span>
                      <button className="plus" onClick={() => add(l.key)}>+</button>
                    </span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-soft)', whiteSpace: 'nowrap', marginTop: 4 }}>
                      {fmtMoney(Math.round(l.netXof), currency)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Remise ligne</span>
                    <span className="trv-disc-badge">{l.disc}</span>
                    {[5, 10, 15, 20].map((pct) => (
                      <button key={pct} className={`trv-pill ${l.disc === pct ? 'is-active is-active--copper' : ''}`} onClick={() => setLineDisc(l.key, pct)}>
                        −{pct}%
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', borderBottom: '1px solid var(--hairline)', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)', maxWidth: 84, lineHeight: 1.3 }}>
                  Remise globale facture
                </span>
                {[0, 5, 10, 15].map((pct) => (
                  <button key={pct} className={`trv-pill ${globalDisc === pct ? 'is-active' : ''}`} onClick={() => setGlobalDisc(pct)}>
                    {pct === 0 ? '0' : `−${pct}%`}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink-soft)' }}>
                <span>Sous-total</span>
                <span>{fmtMoney(Math.round(subXof), currency)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 0 4px' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--color-indigo)' }}>Net à payer</span>
                <span className="trv-net">{fmtMoney(netXof, currency)}</span>
              </div>
            </div>

            <div style={{ padding: '8px 22px 22px' }}>
              <div className="trv-sec-label trv-sec-label--copper" style={{ margin: '6px 0 12px' }}>Paiement</div>
              <div className="tr-grid tr-grid--2" style={{ gap: 10 }}>
                {PAY_METHODS.map((m) => (
                  <button key={m.k} className={`trv-pay ${pay === m.k ? 'is-active' : ''}`} onClick={() => setPay(m.k)}>
                    <div className="n">{m.n}</div>
                    <div className="s">{m.sub}</div>
                  </button>
                ))}
              </div>
              <Button variant="copper" size="lg" style={{ marginTop: 16, width: '100%' }} disabled={lines.length === 0} onClick={() => void checkout()}>
                Encaisser {fmtMoney(netXof, currency)}
              </Button>
              {waHint && <div className="trv-pdf-hint" style={{ marginTop: 10 }}>{waHint}</div>}
              <div style={{ textAlign: 'center', marginTop: 10, fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
                Reçu WhatsApp · réconciliation MoMo automatique.
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'journal' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22, gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div className="trv-sec-label trv-sec-label--copper" style={{ marginBottom: 6 }}>Caisse · Journal du jour · {journalDateLabel}</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, lineHeight: 1.05, color: 'var(--color-indigo)' }}>Journal de caisse.</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                {['Toutes', ...branchCashboxes.map((c) => c.name)].map((n) => (
                  <button key={n} className={`trv-pill ${journalCaisse === n ? 'is-active' : ''}`} onClick={() => setJournalCaisse(n)}>
                    {n === 'Toutes' ? 'Toutes les caisses' : n}
                  </button>
                ))}
              </div>
            </div>
            <Button variant="ghost" onClick={() => setTab('encaisser')}>Clôturer la caisse</Button>
          </div>

          <div className="tr-grid" style={{ gridTemplateColumns: '1.3fr 1fr 1fr 1fr 1fr', marginBottom: 24 }}>
            <div className="trv-kpi trv-kpi--copper">
              <div className="l">Total encaissé · jour</div>
              <div className="v">{fmtMoney(journalTotal, currency)}</div>
              <div className="c">{journal.length} transaction{journal.length > 1 ? 's' : ''}</div>
            </div>
            <div className="trv-kpi"><div className="l">Mobile Money</div><div className="v">{fmtMoney(sumBy((p) => p === 'MTN MoMo' || p === 'Moov'), currency)}</div></div>
            <div className="trv-kpi"><div className="l">Espèces</div><div className="v">{fmtMoney(sumBy((p) => p === 'Espèces'), currency)}</div></div>
            <div className="trv-kpi"><div className="l">Carte</div><div className="v">{fmtMoney(sumBy((p) => p === 'Carte'), currency)}</div></div>
            <div className="trv-kpi"><div className="l">WhatsApp</div><div className="v">{fmtMoney(sumBy((p) => p === 'Lien WhatsApp'), currency)}</div></div>
          </div>

          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 5, overflow: 'hidden' }}>
            <div className="trv-journal-head">
              <span className="trv-th">N°</span>
              <span className="trv-th">Date</span>
              <span className="trv-th">Détail</span>
              <span className="trv-th">Paiement</span>
              <span className="trv-th" style={{ textAlign: 'right' }}>Montant</span>
            </div>
            {journal.map((i) => (
              <div key={i.id} className="trv-journal-row">
                <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, letterSpacing: '.04em', color: 'var(--copper-600)' }}>{i.number.slice(-8)}</span>
                <span>
                  <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}>{fmtDateFr(i.date)}</span>
                  <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>{i.time ?? '—'}</span>
                </span>
                <div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
                    {i.lines.map((l) => (l.qty > 1 ? `${l.label} ×${l.qty}` : l.label)).join(' · ')}
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 3 }}>
                    {clientName(i)} · {i.cashbox ?? 'Caisse principale'}
                  </div>
                </div>
                <div>
                  <span className={`trv-paychip ${i.payment === 'MTN MoMo' || i.payment === 'Moov' ? 'momo' : ''}`}>{i.payment}</span>
                </div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)', textAlign: 'right' }}>
                  {fmtMoney(invoiceTotal(i), currency)}
                </span>
              </div>
            ))}
            {journal.length === 0 && (
              <div style={{ padding: '26px 24px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-soft)' }}>
                Aucun encaissement pour cette caisse aujourd’hui. Le premier ticket du jour ouvrira le journal.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
