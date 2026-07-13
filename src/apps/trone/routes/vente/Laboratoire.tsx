import { useMemo, useState } from 'react';
import { PageHead } from '../_ui';
import { Button, Field, Input, Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useProducts } from '../../../../shared/catalog';
import { uid } from '../../../../shared/store';
import {
  LAB_CONCERNS, PERF_SEED, REINVENT_SEED,
  buildFormulaView, buildMatches, composeFromStock, labPantry, isAvail, effectiveStock,
  type Sub, type StockMap,
} from './lab';
import './vente.css';

/* Le Laboratoire — Gamme & stock. Le formulateur maître : besoin → formule complète,
   substitution d'ingrédients indisponibles avec régénération ET recalibrage du protocole,
   inventaire par ingrédients disponibles, suivi des formules performantes. */

type LabTab = 'atelier' | 'gamme' | 'perf';
type Mode = 'besoin' | 'ingredients';

const REINVENT_TONE: Record<'red' | 'amber' | 'blue', { bg: string; fg: string; accent: string }> = {
  red: { bg: 'rgba(140,59,46,.12)', fg: 'var(--trv-error)', accent: 'var(--trv-error)' },
  amber: { bg: 'rgba(169,112,43,.14)', fg: 'var(--trv-warning)', accent: 'var(--trv-warning)' },
  blue: { bg: 'var(--indigo-50)', fg: 'var(--color-indigo)', accent: 'var(--color-indigo)' },
};

type ProductForm = { name: string; price: string; stock: string };
const emptyProduct: ProductForm = { name: '', price: '', stock: '0' };

export default function Laboratoire() {
  const { currency } = useBranch();

  const [tab, setTab] = useState<LabTab>('atelier');
  const [mode, setMode] = useState<Mode>('besoin');
  const [concern, setConcern] = useState('hydratation');
  const [swaps, setSwaps] = useState<Record<string, Sub>>({});
  const [stock, setStock] = useState<StockMap>({});
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // gamme — les produits Maison du catalogue (DÒDÒ™), stock réel partagé
  const [products, setProducts] = useProducts();
  const [prodModal, setProdModal] = useState(false);
  const [prodForm, setProdForm] = useState<ProductForm>(emptyProduct);

  const view = useMemo(() => buildFormulaView(concern, swaps, stock), [concern, swaps, stock]);
  const matches = useMemo(() => buildMatches(stock), [stock]);
  const pantry = useMemo(() => labPantry(), []);
  const eff = effectiveStock(stock);
  const availCount = pantry.filter((p) => isAvail(eff, p)).length;

  const restoreAll = () =>
    setSwaps((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (k.startsWith(`${concern}:`)) delete next[k]; });
      return next;
    });
  const restoreOne = (key: string) =>
    setSwaps((prev) => { const next = { ...prev }; delete next[key]; return next; });
  const pickSub = (key: string, opt: Sub) => {
    setSwaps((prev) => ({ ...prev, [key]: opt }));
    setOpenSub(null);
  };
  const toggleStock = (name: string) =>
    setStock((prev) => ({ ...prev, [name]: !isAvail(effectiveStock(prev), name) }));
  const compose = (k: string) => {
    setConcern(k);
    setMode('besoin');
    setSwaps((prev) => composeFromStock(k, prev, stock));
    setOpenSub(null);
    setNote(`L’intelligence a composé « ${labFormulaName(k)} » à partir de ton stock.`);
  };

  const f = view.base;

  /* — gamme : lit et écrit le stock réel du catalogue (productsStore) — */
  const gammeRows = useMemo(() => [...products].sort((a, b) => a.order - b.order), [products]);
  const setUnits = (id: string, n: number) =>
    setProducts((prev) => prev.map((x) => (x.id === id ? { ...x, stock: Math.max(0, n) } : x)));
  const stockValue = gammeRows.reduce((a, p) => a + p.stock * p.priceXof, 0);
  const totalUnits = gammeRows.reduce((a, p) => a + p.stock, 0);
  const lowCount = gammeRows.filter((p) => p.stock <= 8).length;
  const maxStock = Math.max(...gammeRows.map((p) => p.stock), 1);

  const saveProduct = () => {
    if (!prodForm.name.trim()) return;
    const price = parseInt(prodForm.price.replace(/[^0-9]/g, ''), 10) || 0;
    const stockN = parseInt(prodForm.stock.replace(/[^0-9]/g, ''), 10) || 0;
    const maxOrder = gammeRows.reduce((m, p) => Math.max(m, p.order), 0);
    setProducts((prev) => [...prev, { id: `pr-${uid()}`, categoryId: 'dodo', name: prodForm.name.trim(), priceXof: price, stock: stockN, order: maxOrder + 1 }]);
    setProdForm(emptyProduct);
    setProdModal(false);
  };

  const TABS: { k: LabTab; l: string }[] = [
    { k: 'atelier', l: 'L’atelier' },
    { k: 'gamme', l: 'La gamme & le stock' },
    { k: 'perf', l: 'Performance' },
  ];

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Gamme & stock · l’atelier des formules"
        title="Le Laboratoire."
        sub="Le formulateur maître : un besoin de couronne, une formule souveraine — nom, origines, protocole. L’intelligence substitue ce qui manque et recalibre le geste."
      />

      <div className="trv-tabs">
        {TABS.map((t) => (
          <button key={t.k} className={`trv-tab ${tab === t.k ? 'is-active' : ''}`} onClick={() => setTab(t.k)}>{t.l}</button>
        ))}
      </div>

      {note && (
        <div className="tre-inline-note" style={{ marginBottom: 16 }}>
          <span className="mark">✦</span><span>{note}</span>
          <button className="trv-linkbtn trv-linkbtn--muted" style={{ marginLeft: 'auto' }} onClick={() => setNote(null)}>fermer</button>
        </div>
      )}

      {/* ===== L'ATELIER — le formulateur ===== */}
      {tab === 'atelier' && (
        <div>
          <div className="trv-lab-voice">
            <div>
              <div className="mnd-eyebrow" style={{ color: 'var(--copper-200)' }}>La parole de la formulatrice</div>
              <div className="quote">« Dites-moi ce dont la couronne souffre — <em>je connais l’ingrédient juste, sa terre d’origine et le geste qui le réveille.</em> »</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 3, border: '1px solid var(--hairline)', borderRadius: 999, padding: 3, background: 'var(--surface-card)' }}>
              {(['besoin', 'ingredients'] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setOpenSub(null); }}
                  style={{
                    cursor: 'pointer', border: 'none', borderRadius: 999, padding: '8px 18px',
                    fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '.08em',
                    background: mode === m ? 'var(--color-indigo)' : 'transparent',
                    color: mode === m ? 'var(--color-ivoire)' : 'var(--ink-soft)',
                  }}
                >
                  {m === 'besoin' ? 'Par besoin' : 'Par ingrédients disponibles'}
                </button>
              ))}
            </div>
            <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, color: 'var(--ink-soft)' }}>
              Pars du besoin de la cliente, ou de ce que le laboratoire a sous la main.
            </span>
          </div>

          {mode === 'besoin' && (
            <div>
              <div className="trv-sec-label">Quel est le besoin de la cliente ?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 24 }}>
                {LAB_CONCERNS.map((c) => (
                  <button key={c.k} className={`trv-concern ${concern === c.k ? 'is-active' : ''}`} onClick={() => setConcern(c.k)}>
                    <div className="g">{c.glyph}</div>
                    <div className="l">{c.label}</div>
                  </button>
                ))}
              </div>

              {view.swapCount > 0 && (
                <div className="trv-recomposed">
                  <span>
                    <span style={{ color: 'var(--copper-700)', fontWeight: 500 }}>Formule recomposée</span> — l’intelligence a remplacé {view.swapCount} ingrédient{view.swapCount > 1 ? 's' : ''} par des substituts de même rôle. Origines et protocole ajustés.
                  </span>
                  <button className="trv-minibtn" onClick={restoreAll}>Tout rétablir</button>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 18, alignItems: 'start' }}>
                {/* gauche — identité + origines */}
                <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 6, overflow: 'hidden' }}>
                  <div className="trv-formula-band" style={{ background: f.band.bg }}>
                    <div className="eyebrow" style={{ color: f.band.eyebrow }}>Formule souveraine · {f.concernLabel}</div>
                    <div className="name" style={{ color: f.band.title }}>{view.name}</div>
                    <div className="forme" style={{ color: f.band.forme }}>{f.forme} · {f.contenance}</div>
                  </div>
                  <div style={{ padding: '20px 24px 24px' }}>
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.55, color: 'var(--ink)' }}>{f.description}</div>
                    <div className="trv-sec-label trv-sec-label--copper" style={{ margin: '22px 0 12px' }}>Les origines · le meilleur du monde</div>
                    <div>
                      {view.origins.map((o) => (
                        <div key={o.key} className={`trv-origin ${o.rowClass}`}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
                            <div>
                              <div className="ing">{o.ingredient}</div>
                              <div className="role">{o.role}</div>
                            </div>
                            <div style={{ textAlign: 'right', flex: 'none' }}>
                              <div className="origin">{o.origin}</div>
                              <div className="grade">{o.grade}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 8, flexWrap: 'wrap' }}>
                            <span className="trv-origin-status" style={{ color: o.statusFg }}>{o.statusLabel}</span>
                            {o.swapped && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, fontStyle: 'italic', color: 'var(--ink-soft)' }}>au lieu de {o.origName}</span>}
                            {o.subOptions.length > 0 && (
                              <button className="trv-linkbtn" onClick={() => setOpenSub(openSub === o.key ? null : o.key)}>Remplacer ›</button>
                            )}
                            {o.swapped && <button className="trv-linkbtn trv-linkbtn--muted" onClick={() => restoreOne(o.key)}>Rétablir l’original</button>}
                          </div>
                          {openSub === o.key && (
                            <div className="trv-subpanel">
                              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Substituts de même rôle · proposés par l’intelligence</div>
                              {o.subOptions.map((opt) => (
                                <button key={opt.ingredient} className="trv-subopt" onClick={() => pickSub(o.key, opt)}>
                                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--color-indigo)' }}>{opt.ingredient}</span>
                                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)' }}>{opt.origin} · {opt.grade}</span>
                                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: opt.stockFg, whiteSpace: 'nowrap' }}>{opt.stockLabel}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* droite — protocole */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ background: 'var(--color-sable)', borderRadius: 5, padding: '18px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                      <div className="trv-sec-label trv-sec-label--copper" style={{ marginBottom: 0 }}>Le protocole · de l’atelier au cuir</div>
                      {view.protoChanged && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--color-ivoire)', background: 'var(--color-copper)', borderRadius: 999, padding: '2px 9px' }}>Recalibré</span>}
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)', marginLeft: 'auto' }}>{f.protocolTime}</span>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      {view.protocol.map((p) => (
                        <div key={p.n} className="trv-proto-step">
                          <div className="n">{p.n}</div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 500, color: 'var(--ink)' }}>{p.title}</span>
                              {p.changed && <span className="trv-adjusted">ajusté</span>}
                            </div>
                            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-soft)', marginTop: 3 }}>{p.detail}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '15px 17px' }}>
                      <div className="mnd-eyebrow">Coût matière / unité</div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24, color: 'var(--ink)', marginTop: 7 }}>{fmtMoney(f.coutMatN, currency)}</div>
                    </div>
                    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '15px 17px' }}>
                      <div className="mnd-eyebrow">Prix conseillé · marge</div>
                      <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 24, color: 'var(--trv-success)', marginTop: 7 }}>{fmtMoney(f.prixN, currency)} · ×{f.prixMult}</div>
                    </div>
                  </div>

                  <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, padding: '15px 18px' }}>
                    <div className="mnd-eyebrow" style={{ color: 'var(--copper-700)' }}>Le mot du maître</div>
                    <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.5, color: 'var(--ink)', marginTop: 6 }}>{f.maitreNote}</div>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    <Button style={{ flex: 1 }} onClick={() => setNote(`« ${view.name} » inscrite à la gamme.`)}>Inscrire à la gamme</Button>
                    <Button variant="ghost" onClick={() => setNote('Fiche atelier prête à imprimer.')}>Fiche atelier</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ===== PAR INGRÉDIENTS DISPONIBLES ===== */}
          {mode === 'ingredients' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
              <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '20px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div className="trv-sec-label" style={{ marginBottom: 0 }}>Ce que le laboratoire a en réserve</div>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>{availCount}/{pantry.length}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 14 }}>Allume ce que tu as, éteins ce qui manque ce matin. L’intelligence recompose en conséquence.</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {pantry.map((p) => {
                    const on = isAvail(eff, p);
                    return (
                      <button key={p} className={`trv-pantry-chip ${on ? 'on' : ''}`} onClick={() => toggleStock(p)}>
                        {p}<span style={{ fontSize: 10 }}>{on ? '✓' : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="trv-sec-label trv-sec-label--copper" style={{ marginBottom: 4 }}>Ce que l’intelligence peut composer</div>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 14 }}>Classé par couverture du stock — elle substitue d’elle-même ce qui manque.</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {matches.map((m) => (
                    <div key={m.k} style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 6, padding: '15px 17px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <div>
                          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)' }}>{m.name}</div>
                          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 1 }}>{m.label} · {m.forme}</div>
                        </div>
                        <span className="trv-origin-status" style={{ color: m.readyFg, whiteSpace: 'nowrap' }}>{m.readyLabel}</span>
                      </div>
                      <div className="trv-perf-bar" style={{ margin: '12px 0 7px' }}><div style={{ width: `${m.coverPct}%`, background: m.barFill }} /></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>{m.summary}</span>
                        <Button size="sm" onClick={() => compose(m.k)}>Composer celle-ci ›</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== LA GAMME & LE STOCK ===== */}
      {tab === 'gamme' && (
        <div>
          <div className="tre-actions-row">
            <div>
              <div className="trv-sec-label" style={{ marginBottom: 4 }}>La Gamme & le stock</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink-soft)' }}>Vos produits Maison et leur stock en temps réel — partagé avec le Catalogue et la Caisse.</div>
            </div>
            <Button onClick={() => { setProdForm(emptyProduct); setProdModal(true); }}>+ Ajouter un produit</Button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 18 }}>
            <div className="trv-kpi"><div className="l">Produits en gamme</div><div className="v">{gammeRows.length}</div><div className="c">catalogue DÒDÒ™</div></div>
            <div className="trv-kpi"><div className="l">Unités en réserve</div><div className="v">{totalUnits > 0 ? totalUnits : '—'}</div><div className="c">tous produits confondus</div></div>
            <div className="trv-kpi trv-kpi--copper"><div className="l">Alertes réassort</div><div className="v" style={{ color: lowCount > 0 ? 'var(--trv-warning)' : undefined }}>{lowCount}</div><div className="c">niveaux sous le seuil</div></div>
            <div className="trv-kpi trv-kpi--copper"><div className="l">Valeur du stock</div><div className="v">{fmtMoney(stockValue, currency)}</div><div className="c">au prix catalogue</div></div>
          </div>

          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
            <div className="mnd-scroll-x">
              <table className="tre-table">
                <thead>
                  <tr><th>Produit Maison</th><th>Prix</th><th>Stock</th><th>État</th><th style={{ textAlign: 'right' }}>Réassort</th></tr>
                </thead>
                <tbody>
                  {gammeRows.map((p) => {
                    const tagK = p.stock <= 2 ? 'error' : p.stock <= 8 ? 'warn' : 'ok';
                    const tag = tagK === 'error' ? 'Rupture proche' : tagK === 'warn' ? 'Réassort' : 'En gamme';
                    const sc = tagK === 'error' ? 'var(--trv-error)' : tagK === 'warn' ? 'var(--trv-warning)' : 'var(--trv-success)';
                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{p.name}</div>
                          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>Gamme & produits</div>
                        </td>
                        <td>{fmtMoney(p.priceXof, currency)}</td>
                        <td style={{ minWidth: 120 }}>
                          <div className="trv-perf-bar"><div style={{ width: `${Math.round((p.stock / maxStock) * 100)}%`, background: sc }} /></div>
                          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, color: sc, marginTop: 4 }}>{p.stock} unité{p.stock > 1 ? 's' : ''}</div>
                        </td>
                        <td><span className={`tre-pill tre-pill--${tagK}`}>{tag}</span></td>
                        <td>
                          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                            <button className="trv-sq" title="Retirer" onClick={() => setUnits(p.id, p.stock - 1)}>−</button>
                            <button className="trv-sq" title="Ajouter" onClick={() => setUnits(p.id, p.stock + 1)}>+</button>
                            <button className="trv-minibtn" onClick={() => setUnits(p.id, p.stock + 10)}>+ 10</button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {gammeRows.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: 'center', padding: 32, fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                        La gamme attend son premier produit Maison — inscrivez-le, le stock vivra ici.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== PERFORMANCE ===== */}
      {tab === 'perf' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 18, alignItems: 'start' }}>
          <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '20px 22px' }}>
            <div className="trv-sec-label" style={{ marginBottom: 4 }}>Le palmarès des formules</div>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', marginBottom: 16 }}>Rachat, résultats consignés au Carnet, satisfaction et vitesse de vente — combinés en un Indice de mérite.</div>
            {PERF_SEED.length === 0 && (
              <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, lineHeight: 1.6, color: 'var(--ink-soft)', padding: '14px 0', borderTop: '1px solid var(--hairline)' }}>
                Le palmarès se mérite — il naîtra des premières ventes, des rachats et des résultats consignés au Carnet.
              </div>
            )}
            {PERF_SEED.map((p, i) => {
              const col = p.score >= 85 ? 'var(--trv-success)' : p.score >= 60 ? 'var(--copper-700)' : 'var(--trv-warning)';
              return (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '13px 0', borderTop: '1px solid var(--hairline)' }}>
                  <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 22, color: i === 0 ? 'var(--color-copper)' : 'var(--ink-soft)', width: 28, flex: 'none', textAlign: 'center' }}>0{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>{p.name}</span>
                      <span style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 18, color: col, flex: 'none' }}>{p.score}</span>
                    </div>
                    <div className="trv-perf-bar" style={{ marginTop: 6 }}><div style={{ width: `${p.score}%`, background: col }} /></div>
                    <div style={{ display: 'flex', gap: 18, marginTop: 7, fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>
                      <span>Rachat <span style={{ color: 'var(--ink)' }}>{p.rachat}</span></span>
                      <span>Résultats <span style={{ color: 'var(--ink)' }}>{p.resultats}</span></span>
                      <span>Vente <span style={{ color: 'var(--ink)' }}>{p.vitesse}</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: 'var(--color-obsidian)', borderRadius: 5, padding: '20px 22px' }}>
              <div className="mnd-eyebrow" style={{ color: 'var(--copper-200)' }}>À réinventer · l’atelier ne dort jamais</div>
              <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 21, color: 'var(--color-ivoire)', marginTop: 7, lineHeight: 1.35 }}>Une grande formule cesse de l’être le jour où on la croit finie.</div>
            </div>
            {REINVENT_SEED.length === 0 && (
              <div style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderRadius: 4, padding: '16px 18px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
                Rien à réinventer pour l’instant — les signaux viendront des ventes et des retours consignés au Carnet.
              </div>
            )}
            {REINVENT_SEED.map((r) => {
              const t = REINVENT_TONE[r.flagK];
              return (
                <div key={r.name} style={{ background: 'var(--surface-card)', border: '1px solid var(--hairline)', borderLeft: `3px solid ${t.accent}`, borderRadius: 4, padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{r.name}</span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: t.fg, background: t.bg, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap', flex: 'none' }}>{r.flag}</span>
                  </div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-soft)', marginTop: 8 }}>{r.why}</div>
                  <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.5, color: 'var(--copper-700)', marginTop: 8 }}>→ {r.move}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {prodModal && (
        <Modal title="Nouveau produit Maison." onClose={() => setProdModal(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field label="Nom de la formule">
              <Input value={prodForm.name} onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })} placeholder="Ex. Le Sérum Moringa & Prêle" />
            </Field>
            <div className="tr-grid tr-grid--2">
              <Field label="Prix conseillé (F CFA)">
                <Input inputMode="numeric" value={prodForm.price} onChange={(e) => setProdForm({ ...prodForm, price: e.target.value })} placeholder="12 000" />
              </Field>
              <Field label="Stock initial">
                <Input inputMode="numeric" value={prodForm.stock} onChange={(e) => setProdForm({ ...prodForm, stock: e.target.value })} placeholder="0" />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Button variant="ghost" onClick={() => setProdModal(false)}>Annuler</Button>
              <Button variant="copper" style={{ flex: 1 }} onClick={saveProduct} disabled={!prodForm.name.trim()}>Inscrire à la gamme</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* Nom de la formule pour un concern (usage message). */
function labFormulaName(k: string): string {
  return buildFormulaView(k, {}, {}).base.name;
}
