import { asset } from '../../../../shared/asset';
import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useServices } from '../../../../shared/catalog';
import { useClients } from '../../../../shared/clients';
import { useInvoices, invoiceTotal, type Invoice, type PaymentMethod } from '../../../../shared/finance';
import { uid } from '../../../../shared/store';
import './vente.css';

/* Factures & devis — documents de marque à âme. Six thèmes émotionnels,
   remises par ligne et globale, conversion devis → facture, impression. */

type ThemeKey = Invoice['theme'];

const THEMES: Record<ThemeKey, { amb: string; verse: string; paths: string[] }> = {
  Rose: { amb: 'Parfum de rose', verse: 'Ce qui prend le temps d’éclore\nen garde le parfum plus longtemps.', paths: ['M24 11c7 0 12 5 12 11 0 6-5 10-10 10s-9-4-9-8 3-7 7-7 6 3 6 6-2 4-4 4', 'M24 32v22', 'M24 43c-5 0-9-3-10-8', 'M24 48c5 0 9-3 10-8'] },
  Arbre: { amb: 'Force tranquille', verse: 'Vos racines tiennent\nce que vos pointes promettent.', paths: ['M24 55V30', 'M24 36l-7-6', 'M24 41l7-6', 'M24 22m-13 0a13 13 0 1 0 26 0a13 13 0 1 0 -26 0'] },
  Oiseau: { amb: 'Élan léger', verse: 'On ne couronne pas la hâte.\nOn couronne la constance.', paths: ['M5 32c8-10 12-10 19 0', 'M24 32c8-10 12-10 19 0', 'M22 33l2 4 2-4'] },
  Voyage: { amb: 'Horizon ouvert', verse: 'Chaque retour ici\nest un pas de plus sur votre chemin.', paths: ['M5 44h38', 'M24 30m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0', 'M11 55c6-6 20-6 26 0'] },
  Aube: { amb: 'Lumière naissante', verse: 'La beauté n’est pas un instant —\nc’est une habitude que l’on honore.', paths: ['M7 47h34', 'M13 47a11 11 0 0 1 22 0', 'M24 28v-7', 'M37 35l5-5', 'M11 35l-5-5', 'M24 47v9'] },
  Souffle: { amb: 'Calme profond', verse: 'Respirez.\nVotre couronne se bâtit, mèche après mèche.', paths: ['M24 41c-12 0-18-9-18-9s6-9 18-9 18 9 18 9-6 9-18 9z', 'M24 32m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0'] },
};

function Motif({ theme, size, color }: { theme: ThemeKey; size: number; color: string }) {
  return (
    <svg width={size} height={Math.round(size * 1.18)} viewBox="0 0 48 64" fill="none" stroke={color} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round">
      {THEMES[theme].paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

const DISC_OPTIONS = [0, 5, 10, 15, 20, 25, 30];
const PAYMENTS: PaymentMethod[] = ['MTN MoMo', 'Moov', 'Espèces', 'Carte', 'Lien WhatsApp'];

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDateFr = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  const s = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  return s.replace(/^1 /, '1ᵉʳ ');
};

export default function Factures() {
  const { branch, currency } = useBranch();
  const [invoices, setInvoices] = useInvoices();
  const [clients] = useClients();
  const [services] = useServices();

  const [kindTab, setKindTab] = useState<'all' | 'facture' | 'devis'>('all');
  const [statusFilter, setStatusFilter] = useState<'tous' | Invoice['status']>('tous');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [payChoice, setPayChoice] = useState<PaymentMethod>('MTN MoMo');
  const [freeLabel, setFreeLabel] = useState('');
  const [freeAmount, setFreeAmount] = useState('');

  const branchDocs = useMemo(
    () => invoices.filter((i) => i.branchId === branch.id).sort((a, b) => b.date.localeCompare(a.date)),
    [invoices, branch.id],
  );
  const filtered = branchDocs
    .filter((d) => kindTab === 'all' || d.kind === kindTab)
    .filter((d) => statusFilter === 'tous' || d.status === statusFilter);

  const doc = branchDocs.find((d) => d.id === selectedId) ?? filtered[0] ?? branchDocs[0] ?? null;

  const patchDoc = (patch: Partial<Invoice>) => {
    if (!doc) return;
    setInvoices((prev) => prev.map((i) => (i.id === doc.id ? { ...i, ...patch } : i)));
  };

  const clientOf = (d: Invoice) => clients.find((c) => c.id === d.clientId);
  const clientNameOf = (d: Invoice) => clientOf(d)?.name ?? d.clientName ?? 'Walk-in';
  const prenomOf = (d: Invoice) => clientNameOf(d).split(' ')[0];

  const branchClients = clients.filter((c) => c.branchId === branch.id && !c.archived);

  const nextNumber = (kind: Invoice['kind']) => {
    const year = new Date().getFullYear();
    const max = invoices.reduce((m, i) => {
      const n = parseInt(i.number.replace(/\D/g, '').slice(-4), 10);
      return Number.isFinite(n) ? Math.max(m, n) : m;
    }, 1042);
    return kind === 'devis' ? `MND-D-${year}-${String(max + 1).padStart(4, '0')}` : `MND-${year}-${String(max + 1).padStart(4, '0')}`;
  };

  const createDoc = (kind: Invoice['kind']) => {
    const inv: Invoice = {
      id: uid(),
      branchId: branch.id,
      kind,
      number: nextNumber(kind),
      clientId: branchClients[0]?.id ?? '',
      date: todayIso(),
      lines: [],
      globalDiscountPct: 0,
      theme: 'Aube',
      status: 'brouillon',
      master: branch.masters[0],
    };
    setInvoices((prev) => [inv, ...prev]);
    setSelectedId(inv.id);
    setKindTab('all');
    setStatusFilter('tous');
  };

  const addServiceLine = (svcId: string) => {
    const svc = services.find((s) => s.id === svcId);
    if (!svc || !doc) return;
    patchDoc({ lines: [...doc.lines, { id: uid(), label: svc.name, qty: 1, unitXof: svc.priceXof, discountPct: 0 }] });
  };
  const addFreeLine = () => {
    const amt = parseInt(freeAmount.replace(/[^0-9]/g, ''), 10) || 0;
    if (!doc || !freeLabel.trim() || amt <= 0) return;
    patchDoc({ lines: [...doc.lines, { id: uid(), label: freeLabel.trim(), qty: 1, unitXof: amt, discountPct: 0 }] });
    setFreeLabel('');
    setFreeAmount('');
  };

  const totals = doc
    ? (() => {
        const gross = doc.lines.reduce((s, l) => s + l.qty * l.unitXof, 0);
        const afterLines = doc.lines.reduce((s, l) => s + l.qty * l.unitXof * (1 - l.discountPct / 100), 0);
        const lineDisc = gross - afterLines;
        const globalDisc = afterLines * (doc.globalDiscountPct / 100);
        return { gross, lineDisc, globalDisc, net: invoiceTotal(doc) };
      })()
    : null;

  const theme = doc ? THEMES[doc.theme] : THEMES.Aube;
  const defaultNote = doc
    ? `${prenomOf(doc)}, ce fut un honneur de veiller sur votre couronne. Elle vous va à merveille. — ${doc.master ?? branch.masters[0] ?? 'la Maison'}`
    : '';

  const qrCells = useMemo(() => {
    if (!doc) return [];
    const seed = (doc.number + doc.theme).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return Array.from({ length: 25 }, (_, i) => ((seed * (i + 7)) % 5) > 1);
  }, [doc]);

  const printDoc = () => {
    document.body.classList.add('trv-print-doc');
    window.print();
    window.setTimeout(() => document.body.classList.remove('trv-print-doc'), 400);
  };

  const sendWhatsApp = () => {
    if (!doc) return;
    const phone = clientOf(doc)?.phone.replace(/\D/g, '') ?? '';
    const msg =
      `Maison MND · ${doc.kind === 'devis' ? 'Devis' : 'Facture'} ${doc.number}\n` +
      `Pour ${prenomOf(doc)} — total ${fmtMoney(invoiceTotal(doc), currency)}.\n` +
      `${(doc.note?.trim() || defaultNote)}\nRéglez d’un geste — MTN MoMo · Moov Money.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    if (doc.status === 'brouillon') patchDoc({ status: 'envoyée' });
  };

  const statusClass = (s: Invoice['status']) =>
    s === 'payée' ? 'trv-status--payee' : s === 'envoyée' ? 'trv-status--envoyee' : s === 'acceptée' ? 'trv-status--acceptee' : '';

  const counts = {
    all: branchDocs.length,
    facture: branchDocs.filter((d) => d.kind === 'facture').length,
    devis: branchDocs.filter((d) => d.kind === 'devis').length,
  };

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Vente · documents de marque"
        title="Factures & devis."
        actions={
          <>
            <Button variant="ghost" onClick={() => createDoc('devis')}>+ Devis</Button>
            <Button onClick={() => createDoc('facture')}>+ Nouvelle facture</Button>
          </>
        }
      />

      <div className="trv-fac-grid">
        {/* ===== Colonne gauche — documents & âme ===== */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div className="trv-sec-label">Les documents</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              {([['all', 'Tous'], ['facture', 'Factures'], ['devis', 'Devis']] as const).map(([k, label]) => (
                <button key={k} className={`trv-pill ${kindTab === k ? 'is-active' : ''}`} onClick={() => setKindTab(k)}>
                  {label} <span style={{ opacity: 0.6 }}>{counts[k]}</span>
                </button>
              ))}
            </div>
            <div style={{ marginBottom: 11 }}>
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} style={{ width: '100%', fontSize: 12 }}>
                <option value="tous">Tous les statuts</option>
                <option value="brouillon">Brouillon</option>
                <option value="envoyée">Envoyée</option>
                <option value="payée">Payée</option>
                <option value="acceptée">Acceptée</option>
              </Select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, maxHeight: 320, overflowY: 'auto' }}>
              {filtered.map((d) => (
                <button key={d.id} className={`trv-doc-item ${doc?.id === d.id ? 'is-active' : ''}`} onClick={() => setSelectedId(d.id)}>
                  <span style={{ minWidth: 0 }}>
                    <span className="cl">{clientNameOf(d)}</span>
                    <span className="no">{d.kind === 'devis' ? 'Devis' : 'Facture'} · {d.number}</span>
                  </span>
                  <span style={{ textAlign: 'right', flex: 'none' }}>
                    <span className="amt">{fmtMoney(invoiceTotal(d), currency)}</span>
                    <span className={`trv-status ${statusClass(d.status)}`}>{d.status}</span>
                  </span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-soft)', padding: '8px 0' }}>
                  Aucun document pour ce filtre.
                </div>
              )}
            </div>
          </div>

          {doc && (
            <>
              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
                <div className="trv-sec-label">Tête couronnée & maître</div>
                <div className="tr-grid tr-grid--2" style={{ gap: 8 }}>
                  <Select value={doc.clientId} onChange={(e) => patchDoc({ clientId: e.target.value })} style={{ fontSize: 12 }}>
                    <option value="">Walk-in</option>
                    {branchClients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Select>
                  <Select value={doc.master ?? ''} onChange={(e) => patchDoc({ master: e.target.value })} style={{ fontSize: 12 }}>
                    {[...new Set([doc.master ?? '', ...branch.masters])].filter(Boolean).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
                <div className="trv-sec-label">Prestations & remises</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {doc.lines.map((l) => (
                    <div key={l.id} style={{ border: '1px solid var(--hairline)', borderRadius: 3, padding: '10px 12px', background: 'var(--surface-card)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ minWidth: 0, fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--color-indigo)' }}>
                          {l.qty > 1 ? `${l.label} ×${l.qty}` : l.label}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
                          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink)' }}>{fmtMoney(l.qty * l.unitXof, currency)}</span>
                          <button
                            className="trv-sq trv-sq--ghost"
                            style={{ width: 20, height: 20, color: 'var(--ink-soft)' }}
                            title="Retirer la ligne"
                            onClick={() => patchDoc({ lines: doc.lines.filter((x) => x.id !== l.id) })}
                          >
                            ✕
                          </button>
                        </span>
                      </div>
                      <select
                        className="mnd-select"
                        style={{ marginTop: 7, padding: '5px 8px', fontSize: 10.5, color: 'var(--copper-700)' }}
                        value={l.discountPct}
                        onChange={(e) =>
                          patchDoc({ lines: doc.lines.map((x) => (x.id === l.id ? { ...x, discountPct: +e.target.value } : x)) })
                        }
                      >
                        {DISC_OPTIONS.map((v) => (
                          <option key={v} value={v}>{v === 0 ? 'Aucune remise' : `Remise −${v}%`}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
                <select
                  className="mnd-select"
                  style={{ width: '100%', marginTop: 8, borderStyle: 'dashed', fontSize: 11.5, color: 'var(--copper-700)' }}
                  value=""
                  onChange={(e) => { addServiceLine(e.target.value); e.target.value = ''; }}
                >
                  <option value="" disabled>+ Ajouter une prestation…</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · {fmtMoney(s.priceXof, currency)}</option>
                  ))}
                </select>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input className="mnd-input" style={{ flex: 1, padding: '8px 10px', fontSize: 12 }} placeholder="Ligne libre — libellé" value={freeLabel} onChange={(e) => setFreeLabel(e.target.value)} />
                  <input className="mnd-input" style={{ width: 90, padding: '8px 10px', fontSize: 12 }} placeholder="F CFA" inputMode="numeric" value={freeAmount} onChange={(e) => setFreeAmount(e.target.value)} />
                  <button className="trv-minibtn" onClick={addFreeLine}>Ajouter</button>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Remise globale</span>
                  <select
                    className="mnd-select"
                    style={{ padding: '6px 10px', fontSize: 11.5, color: 'var(--copper-700)' }}
                    value={doc.globalDiscountPct}
                    onChange={(e) => patchDoc({ globalDiscountPct: +e.target.value })}
                  >
                    {DISC_OPTIONS.map((v) => (
                      <option key={v} value={v}>{v === 0 ? 'Aucune' : `−${v}%`}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16 }}>
                <div className="trv-sec-label trv-sec-label--copper">L’âme du document</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', marginBottom: 7 }}>Le motif & le vers</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                  {(Object.keys(THEMES) as ThemeKey[]).map((k) => (
                    <button key={k} title={THEMES[k].amb} className={`trv-theme-btn ${doc.theme === k ? 'is-active' : ''}`} onClick={() => patchDoc({ theme: k })}>
                      <span style={{ height: 34, display: 'flex', alignItems: 'center' }}>
                        <Motif theme={k} size={24} color={doc.theme === k ? '#9E6238' : '#B97A4A'} />
                      </span>
                      <span className="l">{k}</span>
                    </button>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', margin: '14px 0 6px' }}>Le mot du Maître</div>
                <textarea
                  className="mnd-textarea"
                  style={{ width: '100%', minHeight: 74, fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.5 }}
                  placeholder={defaultNote}
                  value={doc.note ?? ''}
                  onChange={(e) => patchDoc({ note: e.target.value })}
                />
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 6 }}>
                  Ambiance · <span style={{ color: 'var(--copper-700)' }}>{theme.amb}</span>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="trv-wa-btn" onClick={sendWhatsApp}>Adresser par WhatsApp</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button style={{ flex: 1 }} size="sm" onClick={printDoc}>Imprimer</Button>
                  <Button variant="ghost" style={{ flex: 1 }} size="sm" onClick={printDoc}>PDF</Button>
                </div>
                {doc.kind === 'devis' ? (
                  <Button
                    variant="copper"
                    size="sm"
                    onClick={() => patchDoc({ kind: 'facture', number: nextNumber('facture'), status: 'envoyée' })}
                  >
                    Convertir en facture
                  </Button>
                ) : doc.status !== 'payée' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Select value={payChoice} onChange={(e) => setPayChoice(e.target.value as PaymentMethod)} style={{ flex: 1, fontSize: 12 }}>
                      {PAYMENTS.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </Select>
                    <Button variant="copper" size="sm" onClick={() => patchDoc({ status: 'payée', payment: payChoice })}>
                      Marquer payée
                    </Button>
                  </div>
                ) : (
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--trv-success)', textAlign: 'center' }}>
                    Payée · {doc.payment}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* ===== Le document vivant ===== */}
        {doc && totals && (
          <div className="trv-doc-stage">
            <div className="trv-doc">
              <div className="trv-doc__motif" aria-hidden="true">
                <Motif theme={doc.theme} size={60} color="#B97A4A" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                <img src={asset("/assets/monograms/mono-copper.png")} alt="" style={{ width: 30 }} />
                <div>
                  <div className="trv-doc__brand">Maison MND</div>
                  <div className="trv-doc__brand-sub">{branch.city} · l’art de la couronne</div>
                </div>
              </div>
              <div className="trv-doc__filet" />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div className="trv-doc__kind">{doc.kind === 'devis' ? 'Devis' : 'Facture'} · {doc.number}</div>
                <span className={`trv-status ${statusClass(doc.status)}`}>{doc.status}</span>
              </div>

              <div className="trv-doc__pour">Pour {prenomOf(doc)},</div>
              <div className="trv-doc__verse">{theme.verse}</div>
              <div className="trv-doc__sep">· — ✦ — ·</div>

              <div className="trv-doc__passage">
                Votre passage · {fmtDateFr(doc.date)}{doc.master ? ` · avec ${doc.master}` : ''}
              </div>
              <div style={{ marginTop: 12 }}>
                {doc.lines.map((l) => {
                  const net = l.qty * l.unitXof * (1 - l.discountPct / 100);
                  return (
                    <div key={l.id} className="trv-doc__item">
                      <div>
                        <div className="lbl">{l.qty > 1 ? `${l.label} ×${l.qty}` : l.label}</div>
                        <div className="temps">
                          Purifier · Nourrir · Sceller · Couronner{l.discountPct > 0 ? ` · remise −${l.discountPct}%` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flex: 'none' }}>
                        {l.discountPct > 0 && <div className="orig">{fmtMoney(l.qty * l.unitXof, currency)}</div>}
                        <div className="amt">{fmtMoney(Math.round(net), currency)}</div>
                      </div>
                    </div>
                  );
                })}
                {doc.lines.length === 0 && (
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-soft)', padding: '12px 0' }}>
                    Le document attend sa première prestation.
                  </div>
                )}
              </div>

              {(totals.lineDisc > 0 || totals.globalDisc > 0) && (
                <>
                  <div className="trv-doc__totline"><span>Sous-total</span><span>{fmtMoney(Math.round(totals.gross), currency)}</span></div>
                  {totals.lineDisc > 0 && (
                    <div className="trv-doc__totline disc"><span>Remises par prestation</span><span>− {fmtMoney(Math.round(totals.lineDisc), currency)}</span></div>
                  )}
                  {totals.globalDisc > 0 && (
                    <div className="trv-doc__totline disc"><span>Remise globale · −{doc.globalDiscountPct}%</span><span>− {fmtMoney(Math.round(totals.globalDisc), currency)}</span></div>
                  )}
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14 }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Total · TVA exonérée</div>
                <div className="trv-doc__total">{fmtMoney(totals.net, currency)}</div>
              </div>

              <div className="trv-doc__note">
                <span className="q">“</span>
                <div className="txt">{doc.note?.trim() || defaultNote}</div>
              </div>

              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, color: 'var(--ink-soft)' }}>
                  Réglez d’un geste<br />
                  <span style={{ color: 'var(--color-indigo)', fontWeight: 500, letterSpacing: '.04em' }}>MTN MoMo · Moov Money</span>
                </div>
                <div className="trv-doc__qr">
                  {qrCells.map((on, i) => (
                    <span key={i} style={{ width: 4, height: 4, background: on ? 'var(--color-indigo)' : 'transparent' }} />
                  ))}
                </div>
              </div>

              <div className="trv-doc__foot">
                <div className="trv-doc__fon">mi nyɔ́ ɖɛkpɛ</div>
                <div className="trv-doc__legal">Maison MND · RCCM CO-B-2024 · {branch.city} · merci de cultiver votre couronne avec nous.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
