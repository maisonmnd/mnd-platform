import { useMemo, useState, type CSSProperties } from 'react';
import { Eyebrow, Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, fmtMoneyCompact } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import {
  useExpenses, useBudgets, useCashboxes, useExpenseCategories, useInvoices, invoiceTotal,
  type Expense, type Cashbox, type ExpenseCategory,
} from '../../../../shared/finance';
import { todayISO, monthKey, monthLabel, paceForecast } from './_shared';
import './finances.css';

/* Dépenses — maîtrise des sorties de caisse. Flux par catégorie, caisses multiples,
   engagements à arbitrer (signaler / suspendre), paiements récurrents, budgets avec
   « reste à dépenser », prévision de fin de mois. Tout est persisté et filtré par la branche. */

type Tab = 'flux' | 'caisses' | 'engagements' | 'budgets';
const TABS: [Tab, string][] = [
  ['flux', 'Le flux'],
  ['caisses', 'Les caisses'],
  ['engagements', 'Engagements'],
  ['budgets', 'Budgets & prévision'],
];

const FLOW_FILLS = [
  'var(--color-indigo)', 'var(--color-copper)', 'var(--indigo-400)', 'var(--copper-400)',
  'var(--indigo-300)', 'var(--copper-200)', 'var(--indigo-600)', 'var(--color-argile)',
];

type Form = { label: string; amount: string; category: string; subcategory: string; cashbox: string; recurring: '' | 'mensuel' | 'hebdomadaire' };

export default function Depenses() {
  const { branch, currency } = useBranch();
  const [expenses, setExpenses] = useExpenses();
  const [budgets, setBudgets] = useBudgets();
  const [cashboxes, setCashboxes] = useCashboxes();
  const [categories, setCategories] = useExpenseCategories();
  const [invoices] = useInvoices();

  const [tab, setTab] = useState<Tab>('flux');
  const [filterCaisse, setFilterCaisse] = useState('all');
  const [filterCat, setFilterCat] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>({ label: '', amount: '', category: '', subcategory: '', cashbox: '', recurring: '' });

  const thisMonth = monthKey(todayISO());
  const branchBoxes = useMemo(() => cashboxes.filter((c) => c.branchId === branch.id), [cashboxes, branch.id]);

  const monthExp = useMemo(
    () => expenses.filter((e) => e.branchId === branch.id && monthKey(e.date) === thisMonth),
    [expenses, branch.id, thisMonth],
  );
  const live = monthExp.filter((e) => !e.stopped);

  const engaged = live.reduce((s, e) => s + e.amountXof, 0);
  const potential = live.filter((e) => e.flagged).reduce((s, e) => s + e.amountXof, 0);
  const savings = monthExp.filter((e) => e.stopped).reduce((s, e) => s + e.amountXof, 0);
  const revenue = useMemo(
    () => invoices
      .filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée' && monthKey(i.date) === thisMonth)
      .reduce((s, i) => s + invoiceTotal(i), 0),
    [invoices, branch.id, thisMonth],
  );
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const forecast = paceForecast(engaged, now.getDate(), daysInMonth);

  // Solde par caisse : ouverture − dépenses vivantes + encaissements crédités
  const boxBalance = (name: string) => {
    const box = branchBoxes.find((b) => b.name === name);
    const opening = box?.openingXof ?? 0;
    const out = live.filter((e) => e.cashbox === name).reduce((s, e) => s + e.amountXof, 0);
    const inn = invoices
      .filter((i) => i.branchId === branch.id && i.status === 'payée' && i.cashbox === name && monthKey(i.date) === thisMonth)
      .reduce((s, i) => s + invoiceTotal(i), 0);
    return opening - out + inn;
  };
  const treasury = branchBoxes.reduce((s, b) => s + boxBalance(b.name), 0);

  // Flux par catégorie (filtré)
  const flow = useMemo(() => {
    const map = new Map<string, number>();
    live
      .filter((e) => (filterCaisse === 'all' || e.cashbox === filterCaisse) && (filterCat === 'all' || e.category === filterCat))
      .forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amountXof));
    const rows = Array.from(map.entries()).map(([cat, n]) => ({ cat, n })).sort((a, b) => b.n - a.n);
    const total = rows.reduce((s, r) => s + r.n, 0);
    const max = Math.max(...rows.map((r) => r.n), 1);
    return { rows, total, max };
  }, [live, filterCaisse, filterCat]);

  const recurring = live.filter((e) => e.recurring);

  const catNames = categories.map((c) => c.name);
  const subsOf = (cat: string) => categories.find((c) => c.name === cat)?.subs ?? [];

  // — Persistance —
  const patch = (id: string, fn: (e: Expense) => Expense) => setExpenses((prev) => prev.map((e) => (e.id === id ? fn(e) : e)));
  const toggleFlag = (e: Expense) => patch(e.id, (x) => ({ ...x, flagged: !x.flagged }));
  const stop = (e: Expense) => patch(e.id, (x) => ({ ...x, stopped: true }));
  const revive = (e: Expense) => patch(e.id, (x) => ({ ...x, stopped: false, flagged: false }));
  const togglePause = (e: Expense) => patch(e.id, (x) => ({ ...x, paused: !x.paused }));

  const openFor = (cashbox?: string) => {
    setForm({ label: '', amount: '', category: catNames[0] ?? '', subcategory: '', cashbox: cashbox ?? branchBoxes[0]?.name ?? '', recurring: '' });
    setOpen(true);
  };
  const save = () => {
    const amountXof = parseInt(form.amount || '0', 10);
    if (!form.label.trim() || !amountXof || !form.cashbox) return;
    const e: Expense = {
      id: uid(), branchId: branch.id, label: form.label.trim(), amountXof,
      date: todayISO(), cashbox: form.cashbox, category: form.category || 'Divers',
      subcategory: form.subcategory || undefined, recurring: form.recurring || null,
    };
    setExpenses((prev) => [e, ...prev]);
    setOpen(false);
  };

  const addCategory = () => {
    const name = window.prompt('Nom de la nouvelle catégorie de dépense');
    if (name && !catNames.includes(name.trim())) setCategories((prev) => [...prev, { id: uid(), name: name.trim(), subs: [] }]);
  };
  const addSubcat = () => {
    const cat = window.prompt(`Catégorie à enrichir (${catNames.join(', ')})`);
    if (!cat) return;
    const found = categories.find((c) => c.name === cat.trim());
    if (!found) return;
    const sub = window.prompt(`Nouvelle sous-catégorie pour « ${found.name} »`);
    if (sub) setCategories((prev) => prev.map((c) => (c.id === found.id ? { ...c, subs: [...c.subs, sub.trim()] } : c)));
  };
  const addCashbox = () => {
    const name = window.prompt('Nom de la nouvelle caisse');
    if (name) setCashboxes((prev) => [...prev, { id: uid(), branchId: branch.id, name: name.trim(), sub: 'Caisse manuelle', glyph: '◈', openingXof: 0 }]);
  };
  const addBudget = () => {
    const cat = window.prompt(`Catégorie du budget (${catNames.join(', ')})`);
    if (!cat) return;
    const amt = window.prompt(`Enveloppe mensuelle pour « ${cat.trim()} » (en ${currency})`);
    const n = parseInt((amt ?? '').replace(/[^0-9]/g, ''), 10);
    if (n) setBudgets((prev) => [...prev, { id: uid(), branchId: branch.id, category: cat.trim(), monthlyXof: n }]);
  };

  const branchBudgets = budgets.filter((b) => b.branchId === branch.id);
  const spentOfCat = (cat: string) => live.filter((e) => e.category === cat).reduce((s, e) => s + e.amountXof, 0);

  const kpiCard = (l: string, v: string, a: string, col: string, c: string, cCls = '') => (
    <div className="trf-kpi" style={{ '--accent': a } as CSSProperties}>
      <div className="l">{l}</div>
      <div className="v" style={{ color: col }}>{v}</div>
      <div className={`c ${cCls}`}>{c}</div>
    </div>
  );

  const expRatio = revenue > 0 ? Math.round((engaged / revenue) * 100) : 0;
  const net = revenue - engaged;

  return (
    <div className="mnd-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Finances · maîtrise des dépenses</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}>Les dépenses.</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Économies réalisées · ce mois</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 30, lineHeight: 1, color: 'var(--trf-success)', marginTop: 3 }}>{fmtMoney(savings, currency)}</div>
          </div>
          <button className="trf-act" style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)', padding: '12px 18px' }} onClick={() => openFor()}>
            + Ajouter une dépense
          </button>
        </div>
      </div>

      <div className="trf-tabs">
        {TABS.map(([k, label]) => (
          <button key={k} className={`trf-tab ${tab === k ? 'is-active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {/* ============ LE FLUX ============ */}
      {tab === 'flux' && (
        <div>
          <div className="trf-obsidian" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--trf-warning)', flex: 'none' }} />
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13.5, color: 'var(--color-ivoire)' }}>
                L’intelligence a repéré <span style={{ color: 'var(--copper-200)', fontWeight: 500 }}>{fmtMoney(potential, currency)}</span> d’économies possibles ce mois — {live.filter((e) => e.flagged).length} engagement(s) à arbitrer.
              </div>
            </div>
            <button className="trf-act" style={{ background: 'var(--color-copper)', color: 'var(--color-ivoire)', borderColor: 'var(--color-copper)', flex: 'none' }} onClick={() => setTab('engagements')}>
              Arbitrer les engagements →
            </button>
          </div>

          <div className="tr-grid tr-grid--4">
            {kpiCard('Dépenses engagées · ce mois', fmtMoney(engaged, currency), 'var(--color-indigo)', 'var(--color-indigo)', `${expRatio} % du revenu · cible < 35 %`)}
            {kpiCard('Potentiel d’économie · IA', fmtMoney(potential, currency), 'var(--color-copper)', 'var(--copper-600)', `${live.filter((e) => e.flagged).length} à arbitrer`, 'up')}
            {kpiCard('Économies réalisées', fmtMoney(savings, currency), 'var(--trf-success)', 'var(--trf-success)', 'capturées ce mois', 'good')}
            {kpiCard('Prévision · fin de mois', fmtMoney(forecast, currency), 'var(--indigo-400)', 'var(--color-indigo)', 'au rythme réel du mois')}
          </div>

          <div className="trf-panel" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Flux des dépenses · par catégorie</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="trf-act" onClick={addCategory}>+ Catégorie</button>
                <button className="trf-act" onClick={addSubcat}>+ Sous-catégorie</button>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', marginLeft: 4 }}>
                  Total filtré <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{fmtMoney(flow.total, currency)}</span>
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginRight: 4 }}>Caisse</span>
                {[{ k: 'all', label: 'Toutes les caisses' }, ...branchBoxes.map((b) => ({ k: b.name, label: b.name }))].map((c) => (
                  <button key={c.k} className={`trf-chip ${filterCaisse === c.k ? 'is-active' : ''}`} onClick={() => setFilterCaisse(c.k)}>{c.label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', marginRight: 4 }}>Catégorie</span>
                {[{ k: 'all', label: 'Toutes catégories' }, ...catNames.map((n) => ({ k: n, label: n }))].map((c) => (
                  <button key={c.k} className={`trf-chip ${filterCat === c.k ? 'is-active' : ''}`} onClick={() => setFilterCat(c.k)}>{c.label}</button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 18 }}>
              {flow.rows.length === 0 && <div className="trf-empty">Aucune dépense pour ce filtre. Saisis une dépense depuis cette caisse pour la voir circuler ici.</div>}
              {flow.rows.map((b, i) => (
                <div className="trf-linerow" key={b.cat}>
                  <div className="trf-linerow__top">
                    <span className="trf-linerow__cat">{b.cat}</span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: 'var(--ink-soft)' }}>{flow.total ? Math.round((b.n / flow.total) * 100) : 0} %</span>
                      <span className="trf-linerow__val">{fmtMoney(b.n, currency)}</span>
                    </span>
                  </div>
                  <div className="trf-bar trf-bar--tall" style={{ marginTop: 5 }}>
                    <div style={{ width: `${Math.round((b.n / flow.max) * 100)}%`, background: FLOW_FILLS[i % FLOW_FILLS.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="trf-panel" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Revenu vs dépenses · {monthLabel(thisMonth)}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>
                Résultat net <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)' }}>{fmtMoney(net, currency)}</span>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink)', marginBottom: 5 }}><span>Revenu</span><span>{fmtMoney(revenue, currency)}</span></div>
              <div className="trf-bar" style={{ height: 14 }}><div style={{ width: '100%', background: 'var(--color-indigo)' }} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink)', margin: '12px 0 5px' }}><span>Dépenses</span><span>{fmtMoney(engaged, currency)}</span></div>
              <div className="trf-bar" style={{ height: 14 }}><div style={{ width: `${Math.min(100, revenue ? Math.round((engaged / revenue) * 100) : 100)}%`, background: 'var(--color-copper)' }} /></div>
            </div>
          </div>
        </div>
      )}

      {/* ============ LES CAISSES ============ */}
      {tab === 'caisses' && (
        <div>
          <div className="trf-obsidian" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div>
              <div className="trf-obsidian__eyebrow">Trésorerie disponible · toutes caisses</div>
              <div className="trf-obsidian__value">{fmtMoney(treasury, currency)}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
              <button className="trf-act" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)', padding: '12px 16px' }} onClick={addCashbox}>+ Nouvelle caisse</button>
              <button className="trf-act" style={{ background: 'var(--color-copper)', color: 'var(--color-ivoire)', borderColor: 'var(--color-copper)', padding: '12px 16px' }} onClick={() => openFor()}>+ Ajouter une dépense</button>
            </div>
          </div>

          <div className="tr-grid tr-grid--3">
            {branchBoxes.map((c) => {
              const bal = boxBalance(c.name);
              const low = bal < 100000;
              return (
                <div className="trf-caisse" key={c.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span className="trf-caisse__glyph">{c.glyph}</span>
                    <div>
                      <div className="trf-caisse__name">{c.name}</div>
                      <div className="trf-caisse__sub">{c.sub}</div>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Solde</div>
                    <div className="trf-caisse__bal" style={{ color: low ? 'var(--trf-warning)' : 'var(--color-indigo)' }}>{fmtMoney(bal, currency)}</div>
                  </div>
                  <button className="trf-act" style={{ padding: 9 }} onClick={() => openFor(c.name)}>Dépenser d’ici</button>
                </div>
              );
            })}
          </div>

          <div className="trf-panel" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Dépenses saisies · {monthLabel(thisMonth)}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>{monthExp.length} · {fmtMoney(monthExp.reduce((s, e) => s + e.amountXof, 0), currency)}</div>
            </div>
            {monthExp.length === 0 && <div className="trf-empty">Aucune dépense saisie ce mois. « Ajouter une dépense » l’enregistre ici et débite la caisse choisie.</div>}
            {monthExp.map((e) => (
              <div className={`trf-exprow ${e.stopped ? 'is-stopped' : ''}`} key={e.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="trf-exprow__vendor">{e.label}</div>
                  <div className="trf-exprow__meta">{e.category}{e.subcategory ? ` · ${e.subcategory}` : ''}{e.recurring ? ` · ${e.recurring}` : ''}</div>
                </div>
                <span className="trf-tagbox">{e.cashbox}</span>
                <span className="trf-exprow__amt">{fmtMoney(e.amountXof, currency)}</span>
                {!e.stopped ? (
                  <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                    <button className={`trf-act ${e.flagged ? 'trf-act--warn' : 'trf-act--ghost'}`} onClick={() => toggleFlag(e)}>{e.flagged ? 'Signalé' : 'Signaler'}</button>
                    <button className="trf-act trf-act--stop" onClick={() => stop(e)}>Suspendre</button>
                  </div>
                ) : (
                  <button className="trf-act trf-act--ghost" onClick={() => revive(e)}>↺ Rétablir</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ ENGAGEMENTS ============ */}
      {tab === 'engagements' && (
        <div>
          <div className="trf-obsidian" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 26 }}>
              <div>
                <div className="trf-obsidian__eyebrow">Économies capturées</div>
                <div className="trf-obsidian__value">{fmtMoney(savings, currency)}</div>
              </div>
              <div>
                <div className="trf-obsidian__eyebrow" style={{ color: 'var(--indigo-100)' }}>Potentiel restant</div>
                <div className="trf-obsidian__value" style={{ color: 'var(--copper-200)' }}>{fmtMoney(potential, currency)}</div>
              </div>
            </div>
            <button
              className="trf-act" style={{ background: 'var(--color-copper)', color: 'var(--color-ivoire)', borderColor: 'var(--color-copper)', flex: 'none' }}
              onClick={() => setExpenses((prev) => prev.map((e) => (e.branchId === branch.id && monthKey(e.date) === thisMonth && e.flagged ? { ...e, stopped: true } : e)))}
            >
              Suspendre tout l’évitable
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div className="trf-panel__title" style={{ marginBottom: 0 }}>Paiements récurrents programmés</div>
            <button className="trf-act" style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' }} onClick={() => openFor()}>+ Paiement récurrent</button>
          </div>
          {recurring.length === 0 && <div className="trf-empty" style={{ marginBottom: 18 }}>Aucun paiement récurrent ce mois. Ajoute une dépense avec une récurrence pour la programmer ici.</div>}
          {recurring.length > 0 && (
            <div className="trf-panel" style={{ padding: '6px 18px', marginBottom: 18 }}>
              {recurring.map((e) => (
                <div className="trf-exprow" key={e.id} style={{ opacity: e.paused ? 0.55 : 1 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: e.paused ? 'var(--color-argile)' : 'var(--color-copper)', flex: 'none' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span className="trf-exprow__vendor">{e.label}</span>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.08em', textTransform: 'uppercase', color: e.paused ? 'var(--ink-soft)' : 'var(--trf-success)' }}>· {e.paused ? 'En pause' : 'Actif'}</span>
                    </div>
                    <div className="trf-exprow__meta">{e.category} · {e.recurring}</div>
                  </div>
                  <span className="trf-tagbox">{e.cashbox}</span>
                  <span className="trf-exprow__amt" style={{ fontSize: 18 }}>{fmtMoney(e.amountXof, currency)}</span>
                  <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                    <button className="trf-act trf-act--ghost" onClick={() => togglePause(e)}>{e.paused ? 'Reprendre' : 'Pause'}</button>
                    <button className="trf-act trf-act--ghost" style={{ color: 'var(--trf-error)' }} onClick={() => setExpenses((prev) => prev.filter((x) => x.id !== e.id))}>Annuler</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="trf-panel__title">Engagements à arbitrer</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {monthExp.length === 0 && <div className="trf-empty">Aucun engagement ce mois.</div>}
            {monthExp.map((e) => (
              <div className={`trf-engage ${e.stopped ? 'is-stopped' : e.flagged ? 'is-flagged' : ''}`} key={e.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: 'var(--color-indigo)', textDecoration: e.stopped ? 'line-through' : 'none' }}>{e.label}</span>
                    <span className={`trf-verdict ${e.stopped ? 'trf-verdict--stop' : e.flagged ? 'trf-verdict--warn' : ''}`}>
                      {e.stopped ? 'Suspendu' : e.flagged ? 'À revoir' : e.recurring ? 'Engagement' : 'Ponctuel'}
                    </span>
                  </div>
                  <div className="trf-exprow__meta">{e.category}{e.subcategory ? ` · ${e.subcategory}` : ''} · {e.recurring ?? 'ponctuel'} · {e.cashbox}</div>
                </div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-indigo)', flex: 'none', textDecoration: e.stopped ? 'line-through' : 'none' }}>{fmtMoney(e.amountXof, currency)}</span>
                <div style={{ flex: 'none', display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
                  {e.stopped ? (
                    <button className="trf-act trf-act--ghost" onClick={() => revive(e)}>↺ Rétablir</button>
                  ) : (
                    <>
                      <button className="trf-act" onClick={() => revive(e)}>Approuver</button>
                      <button className="trf-act trf-act--warn" onClick={() => toggleFlag(e)}>{e.flagged ? 'Ne plus signaler' : 'Signaler'}</button>
                      <button className="trf-act trf-act--stop" onClick={() => stop(e)}>Suspendre</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ============ BUDGETS & PRÉVISION ============ */}
      {tab === 'budgets' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22, alignItems: 'start' }}>
          <div className="trf-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Budget souverain · alloué vs engagé</div>
              <button className="trf-act" style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' }} onClick={addBudget}>+ Budget</button>
            </div>
            {branchBudgets.length === 0 && <div className="trf-empty">Aucun budget défini. « + Budget » ouvre une enveloppe mensuelle par catégorie.</div>}
            {branchBudgets.map((b) => {
              const spent = spentOfCat(b.category);
              const remaining = b.monthlyXof - spent;
              const over = remaining < 0;
              const spentW = Math.min(100, Math.round((spent / (b.monthlyXof || 1)) * 100));
              const col = over ? 'var(--trf-error)' : remaining < b.monthlyXof * 0.15 ? 'var(--trf-warning)' : 'var(--trf-success)';
              return (
                <div key={b.id} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink)' }}>{b.category}</span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: over ? 'var(--trf-error)' : 'var(--trf-success)' }}>{over ? 'Dépassé' : 'Maîtrisé'}</span>
                  </div>
                  <div className="trf-bar" style={{ height: 8, marginTop: 6 }}>
                    <div style={{ width: `${spentW}%`, background: over ? 'var(--trf-error)' : 'var(--trf-success)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                    <span>Engagé {fmtMoney(spent, currency)}</span><span>Alloué {fmtMoney(b.monthlyXof, currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>{over ? 'Dépassement' : 'Reste à dépenser'}</span>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: col }}>{fmtMoney(Math.abs(remaining), currency)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <div className="trf-obsidian" style={{ marginBottom: 14 }}>
              <div className="trf-obsidian__eyebrow">Prévision · fin de mois</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
                <span className="trf-obsidian__value" style={{ fontSize: 36 }}>{fmtMoneyCompact(forecast, currency)}</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: savings > 0 ? 'var(--trf-success)' : 'var(--indigo-100)' }}>
                  {savings > 0 ? `▼ ${fmtMoney(savings, currency)} déjà capturés` : 'conforme au budget'}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 300, fontSize: 12.5, color: 'var(--indigo-100)', marginTop: 8 }}>
                Après arbitrage des engagements évitables, le résultat net gagne en marge.
              </div>
            </div>

            <div className="trf-panel">
              <div className="trf-panel__title">Dépenses par catégorie · {monthLabel(thisMonth)}</div>
              {(() => {
                const map = new Map<string, number>();
                live.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + e.amountXof));
                const rows = Array.from(map.entries()).map(([cat, n]) => ({ cat, n })).sort((a, b) => b.n - a.n);
                const max = Math.max(...rows.map((r) => r.n), 1);
                if (rows.length === 0) return <div className="trf-empty">Rien à analyser ce mois.</div>;
                return rows.map((r, i) => (
                  <div className="trf-linerow" key={r.cat}>
                    <div className="trf-linerow__top">
                      <span className="trf-linerow__cat">{r.cat}</span>
                      <span className="trf-linerow__val">{fmtMoney(r.n, currency)}</span>
                    </div>
                    <div className="trf-bar" style={{ marginTop: 5 }}>
                      <div style={{ width: `${Math.round((r.n / max) * 100)}%`, background: FLOW_FILLS[i % FLOW_FILLS.length] }} />
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ============ MODALE · NOUVELLE DÉPENSE ============ */}
      {open && (
        <Modal title="Nouvelle dépense" onClose={() => setOpen(false)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <label className="mnd-field">
              <span className="mnd-field__label">Bénéficiaire</span>
              <input className="mnd-input" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex. Fournisseur · Karité Bénin" />
            </label>
            <label className="mnd-field">
              <span className="mnd-field__label">Montant · {form.amount ? fmtMoney(parseInt(form.amount, 10), currency) : fmtMoney(0, currency)}</span>
              <input className="mnd-input" inputMode="numeric" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="0" style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }} />
            </label>
            <div>
              <div className="mnd-field__label" style={{ marginBottom: 9 }}>Catégorie</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {catNames.map((c) => (
                  <button key={c} className={`trf-chip ${form.category === c ? 'is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, category: c, subcategory: '' }))}>{c}</button>
                ))}
              </div>
            </div>
            {subsOf(form.category).length > 0 && (
              <div>
                <div className="mnd-field__label" style={{ marginBottom: 9 }}>Sous-catégorie</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {subsOf(form.category).map((c) => (
                    <button key={c} className={`trf-chip ${form.subcategory === c ? 'is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, subcategory: c }))}>{c}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="mnd-field__label" style={{ marginBottom: 9 }}>Payer depuis quelle caisse</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {branchBoxes.map((c) => (
                  <button key={c.id} className={`trf-chip ${form.cashbox === c.name ? 'is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, cashbox: c.name }))}>
                    {c.name} · {fmtMoneyCompact(boxBalance(c.name), currency)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mnd-field__label" style={{ marginBottom: 9 }}>Récurrence</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {([['', 'Ponctuel'], ['mensuel', 'Mensuel'], ['hebdomadaire', 'Hebdomadaire']] as [Form['recurring'], string][]).map(([k, label]) => (
                  <button key={label} className={`trf-chip ${form.recurring === k ? 'is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, recurring: k }))}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={() => setOpen(false)}>Annuler</button>
              <button className="mnd-btn" onClick={save}>Enregistrer la dépense</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
