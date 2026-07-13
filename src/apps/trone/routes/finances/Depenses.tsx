import { useMemo, useState, type CSSProperties } from 'react';
import { Eyebrow, Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, fmtMoneyCompact } from '../../../../shared/currency';
import { uid } from '../../../../shared/store';
import {
  useExpenses, useBudgets, useCashboxes, useExpenseCategories, useInvoices, invoiceTotal, expenseTotal,
  type Expense, type ExpenseItem, type Cashbox, type ExpenseCategory,
} from '../../../../shared/finance';
import { todayISO, monthKey, monthLabel, paceForecast } from './_shared';
import './finances.css';

/** Jour d'un achat, ex. « 13 juil. » — pour afficher la date de chaque dépense. */
const fmtDay = (iso: string): string =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';

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

type Form = { label: string; amount: string; category: string; subcategory: string; cashbox: string; recurring: '' | 'mensuel' | 'hebdomadaire'; date: string; flagged: boolean; items: ExpenseItem[] };
type BoxForm = { name: string; sub: string; glyph: string; opening: string };

const GLYPHS = ['◈', '❖', '✦', '❈', '◆', '✧', '⬡', '❉'];

export default function Depenses() {
  const { branch, currency } = useBranch();
  const [expenses, setExpenses] = useExpenses();
  const [budgets, setBudgets] = useBudgets();
  const [cashboxes, setCashboxes] = useCashboxes();
  const [categories, setCategories] = useExpenseCategories();
  const [invoices, setInvoices] = useInvoices();

  const [tab, setTab] = useState<Tab>('flux');
  const [filterCaisse, setFilterCaisse] = useState('all');
  const [filterCat, setFilterCat] = useState('all');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ label: '', amount: '', category: '', subcategory: '', cashbox: '', recurring: '', date: '', flagged: false, items: [] });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [catOpen, setCatOpen] = useState(false);
  const [boxOpen, setBoxOpen] = useState(false);
  const [boxEditingId, setBoxEditingId] = useState<string | null>(null);
  const [boxForm, setBoxForm] = useState<BoxForm>({ name: '', sub: '', glyph: '◈', opening: '' });

  const thisMonth = monthKey(todayISO());
  const branchBoxes = useMemo(() => cashboxes.filter((c) => c.branchId === branch.id), [cashboxes, branch.id]);

  const monthExp = useMemo(
    () => expenses.filter((e) => e.branchId === branch.id && monthKey(e.date) === thisMonth),
    [expenses, branch.id, thisMonth],
  );
  const live = monthExp.filter((e) => !e.stopped);

  const engaged = live.reduce((s, e) => s + expenseTotal(e), 0);
  const potential = live.filter((e) => e.flagged).reduce((s, e) => s + expenseTotal(e), 0);
  const savings = monthExp.filter((e) => e.stopped).reduce((s, e) => s + expenseTotal(e), 0);
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
    const out = live.filter((e) => e.cashbox === name).reduce((s, e) => s + expenseTotal(e), 0);
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
      .forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + expenseTotal(e)));
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
    setEditingId(null);
    setForm({ label: '', amount: '', category: catNames[0] ?? '', subcategory: '', cashbox: cashbox ?? branchBoxes[0]?.name ?? '', recurring: '', date: todayISO(), flagged: false, items: [] });
    setOpen(true);
  };
  const openEdit = (e: Expense) => {
    setEditingId(e.id);
    setForm({
      label: e.label, amount: String(e.amountXof), category: e.category, subcategory: e.subcategory ?? '',
      cashbox: e.cashbox, recurring: e.recurring ?? '', date: e.date, flagged: !!e.flagged,
      items: e.items ? e.items.map((it) => ({ ...it })) : [],
    });
    setOpen(true);
  };

  // — Lignes d'articles imputés au même achat —
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { id: uid(), label: '', amountXof: 0 }] }));
  const patchItem = (id: string, fn: (it: ExpenseItem) => ExpenseItem) =>
    setForm((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? fn(it) : it)) }));
  const removeItem = (id: string) => setForm((f) => ({ ...f, items: f.items.filter((it) => it.id !== id) }));
  // Total saisi = somme des lignes si présentes, sinon le montant simple.
  const cleanItems = form.items.filter((it) => it.label.trim() && it.amountXof > 0);
  const formTotal = cleanItems.length ? cleanItems.reduce((s, it) => s + it.amountXof, 0) : parseInt(form.amount || '0', 10);

  const save = () => {
    const items = cleanItems;
    const hasItems = items.length > 0;
    const amountXof = hasItems ? items.reduce((s, it) => s + it.amountXof, 0) : parseInt(form.amount || '0', 10);
    if (!form.label.trim() || !amountXof || !form.cashbox) return;
    if (editingId) {
      setExpenses((prev) => prev.map((e) => (e.id === editingId ? {
        ...e, label: form.label.trim(), amountXof, date: form.date || e.date, cashbox: form.cashbox,
        category: form.category || 'Divers', subcategory: form.subcategory || undefined,
        recurring: form.recurring || null, flagged: form.flagged || undefined,
        items: hasItems ? items : undefined,
      } : e)));
    } else {
      const e: Expense = {
        id: uid(), branchId: branch.id, label: form.label.trim(), amountXof,
        date: form.date || todayISO(), cashbox: form.cashbox, category: form.category || 'Divers',
        subcategory: form.subcategory || undefined, recurring: form.recurring || null,
        flagged: form.flagged || undefined, items: hasItems ? items : undefined,
      };
      setExpenses((prev) => [e, ...prev]);
    }
    setOpen(false);
  };
  const removeExpense = (e: Expense) => {
    if (!window.confirm(`Supprimer la dépense « ${e.label} » (${fmtMoney(expenseTotal(e), currency)}) ? Cette action est définitive.`)) return;
    setExpenses((prev) => prev.filter((x) => x.id !== e.id));
  };

  // — Catégories : ajouter / renommer / supprimer, avec réétiquetage des dépenses —
  const addCategory = () => {
    const name = window.prompt('Nom de la nouvelle catégorie de dépense');
    if (name && name.trim() && !catNames.includes(name.trim())) setCategories((prev) => [...prev, { id: uid(), name: name.trim(), subs: [] }]);
  };
  const renameCategory = (c: ExpenseCategory) => {
    const name = window.prompt('Renommer la catégorie', c.name);
    if (!name || !name.trim()) return;
    const nn = name.trim();
    if (nn === c.name || catNames.some((x) => x === nn)) return;
    setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, name: nn } : x)));
    setExpenses((prev) => prev.map((e) => (e.category === c.name ? { ...e, category: nn } : e)));
    setBudgets((prev) => prev.map((b) => (b.category === c.name ? { ...b, category: nn } : b)));
  };
  const deleteCategory = (c: ExpenseCategory) => {
    const used = expenses.filter((e) => e.category === c.name).length;
    const msg = used > 0
      ? `« ${c.name} » est référencée par ${used} dépense(s) — leur libellé de catégorie sera conservé. Supprimer la catégorie quand même ?`
      : `Supprimer la catégorie « ${c.name} » ?`;
    if (!window.confirm(msg)) return;
    setCategories((prev) => prev.filter((x) => x.id !== c.id));
  };
  const addSubTo = (c: ExpenseCategory) => {
    const sub = window.prompt(`Nouvelle sous-catégorie pour « ${c.name} »`);
    if (sub && sub.trim() && !c.subs.includes(sub.trim())) setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, subs: [...x.subs, sub.trim()] } : x)));
  };
  const renameSub = (c: ExpenseCategory, sub: string) => {
    const name = window.prompt('Renommer la sous-catégorie', sub);
    if (!name || !name.trim()) return;
    const nn = name.trim();
    if (nn === sub || c.subs.some((s) => s === nn)) return;
    setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, subs: x.subs.map((s) => (s === sub ? nn : s)) } : x)));
    setExpenses((prev) => prev.map((e) => (e.category === c.name && e.subcategory === sub ? { ...e, subcategory: nn } : e)));
  };
  const deleteSub = (c: ExpenseCategory, sub: string) => {
    const used = expenses.filter((e) => e.category === c.name && e.subcategory === sub).length;
    const msg = used > 0
      ? `« ${sub} » est utilisée par ${used} dépense(s), qui perdront cette sous-catégorie. Supprimer ?`
      : `Supprimer la sous-catégorie « ${sub} » ?`;
    if (!window.confirm(msg)) return;
    setCategories((prev) => prev.map((x) => (x.id === c.id ? { ...x, subs: x.subs.filter((s) => s !== sub) } : x)));
    setExpenses((prev) => prev.map((e) => (e.category === c.name && e.subcategory === sub ? { ...e, subcategory: undefined } : e)));
  };

  // — Caisses : ajouter / modifier / supprimer, avec réétiquetage dépenses + encaissements —
  const openNewBox = () => {
    setBoxEditingId(null);
    setBoxForm({ name: '', sub: 'Caisse manuelle', glyph: '◈', opening: '' });
    setBoxOpen(true);
  };
  const openEditBox = (c: Cashbox) => {
    setBoxEditingId(c.id);
    setBoxForm({ name: c.name, sub: c.sub, glyph: c.glyph || '◈', opening: String(c.openingXof) });
    setBoxOpen(true);
  };
  const saveBox = () => {
    const name = boxForm.name.trim();
    if (!name) return;
    const sub = boxForm.sub.trim() || 'Caisse';
    const glyph = boxForm.glyph.trim() || '◈';
    const opening = parseInt(boxForm.opening || '0', 10) || 0;
    if (boxEditingId) {
      const prevBox = cashboxes.find((b) => b.id === boxEditingId);
      const oldName = prevBox?.name;
      setCashboxes((prev) => prev.map((b) => (b.id === boxEditingId ? { ...b, name, sub, glyph, openingXof: opening } : b)));
      if (oldName && oldName !== name) {
        setExpenses((prev) => prev.map((e) => (e.cashbox === oldName ? { ...e, cashbox: name } : e)));
        setInvoices((prev) => prev.map((i) => (i.cashbox === oldName ? { ...i, cashbox: name } : i)));
        if (filterCaisse === oldName) setFilterCaisse(name);
      }
    } else {
      setCashboxes((prev) => [...prev, { id: uid(), branchId: branch.id, name, sub, glyph, openingXof: opening }]);
    }
    setBoxOpen(false);
  };
  const deleteBox = (c: Cashbox) => {
    const expUsed = expenses.filter((e) => e.cashbox === c.name).length;
    const invUsed = invoices.filter((i) => i.cashbox === c.name).length;
    const msg = expUsed + invUsed > 0
      ? `« ${c.name} » est référencée par ${expUsed} dépense(s) et ${invUsed} encaissement(s) — ces écritures ne seront pas modifiées. Supprimer la caisse ?`
      : `Supprimer la caisse « ${c.name} » ?`;
    if (!window.confirm(msg)) return;
    setCashboxes((prev) => prev.filter((b) => b.id !== c.id));
    if (filterCaisse === c.name) setFilterCaisse('all');
  };
  const addBudget = () => {
    const cat = window.prompt(`Catégorie du budget (${catNames.join(', ')})`);
    if (!cat) return;
    const amt = window.prompt(`Enveloppe mensuelle pour « ${cat.trim()} » (en ${currency})`);
    const n = parseInt((amt ?? '').replace(/[^0-9]/g, ''), 10);
    if (n) setBudgets((prev) => [...prev, { id: uid(), branchId: branch.id, category: cat.trim(), monthlyXof: n }]);
  };

  const branchBudgets = budgets.filter((b) => b.branchId === branch.id);
  const spentOfCat = (cat: string) => live.filter((e) => e.category === cat).reduce((s, e) => s + expenseTotal(e), 0);

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
                <button className="trf-act" onClick={() => setCatOpen(true)}>Gérer les catégories</button>
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
              <button className="trf-act" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)', padding: '12px 16px' }} onClick={openNewBox}>+ Nouvelle caisse</button>
              <button className="trf-act" style={{ background: 'var(--color-copper)', color: 'var(--color-ivoire)', borderColor: 'var(--color-copper)', padding: '12px 16px' }} onClick={() => openFor()}>+ Ajouter une dépense</button>
            </div>
          </div>

          <div className="tr-grid tr-grid--3">
            {branchBoxes.map((c) => {
              const bal = boxBalance(c.name);
              const low = bal < 100000;
              return (
                <div className="trf-caisse" key={c.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                      <span className="trf-caisse__glyph">{c.glyph}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="trf-caisse__name">{c.name}</div>
                        <div className="trf-caisse__sub">{c.sub}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 5, flex: 'none' }}>
                      <button className="trf-iconbtn" title="Modifier la caisse" onClick={() => openEditBox(c)}>Modifier</button>
                      <button className="trf-iconbtn trf-iconbtn--danger" title="Supprimer la caisse" onClick={() => deleteBox(c)}>Supprimer</button>
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
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>{monthExp.length} · {fmtMoney(monthExp.reduce((s, e) => s + expenseTotal(e), 0), currency)}</div>
            </div>
            {monthExp.length === 0 && <div className="trf-empty">Aucune dépense saisie ce mois. « Ajouter une dépense » l’enregistre ici et débite la caisse choisie.</div>}
            {monthExp.map((e) => (
              <div key={e.id}>
                <div className={`trf-exprow ${e.stopped ? 'is-stopped' : ''}`}>
                  <span className="trf-datepill" title="Date de l’achat">{fmtDay(e.date)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="trf-exprow__vendor">{e.label}</div>
                    <div className="trf-exprow__meta">
                      {e.category}{e.subcategory ? ` · ${e.subcategory}` : ''}{e.recurring ? ` · ${e.recurring}` : ''}
                      {e.items && e.items.length ? (
                        <>{' · '}<button className="trf-itemtoggle" onClick={() => toggleExpand(e.id)}>{e.items.length} articles {expanded.has(e.id) ? '▲' : '▼'}</button></>
                      ) : null}
                    </div>
                  </div>
                  <span className="trf-tagbox">{e.cashbox}</span>
                  <span className="trf-exprow__amt">{fmtMoney(expenseTotal(e), currency)}</span>
                  <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                    <button className="trf-act trf-act--ghost" onClick={() => openEdit(e)}>Modifier</button>
                    {!e.stopped ? (
                      <>
                        <button className={`trf-act ${e.flagged ? 'trf-act--warn' : 'trf-act--ghost'}`} onClick={() => toggleFlag(e)}>{e.flagged ? 'Signalé' : 'Signaler'}</button>
                        <button className="trf-act trf-act--stop" onClick={() => stop(e)}>Suspendre</button>
                      </>
                    ) : (
                      <button className="trf-act trf-act--ghost" onClick={() => revive(e)}>↺ Rétablir</button>
                    )}
                    <button className="trf-act trf-act--ghost" style={{ color: 'var(--trf-error)' }} onClick={() => removeExpense(e)}>Supprimer</button>
                  </div>
                </div>
                {e.items && e.items.length && expanded.has(e.id) ? (
                  <div className="trf-itembreak">
                    {e.items.map((it) => (
                      <div className="trf-itembreak__row" key={it.id}>
                        <span className="trf-itembreak__label">{it.label}</span>
                        <span className="trf-itembreak__val">{fmtMoney(it.amountXof, currency)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
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
                  <span className="trf-datepill" title="Date de l’achat">{fmtDay(e.date)}</span>
                  <span className="trf-tagbox">{e.cashbox}</span>
                  <span className="trf-exprow__amt" style={{ fontSize: 18 }}>{fmtMoney(expenseTotal(e), currency)}</span>
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
                  <div className="trf-exprow__meta">{fmtDay(e.date)} · {e.category}{e.subcategory ? ` · ${e.subcategory}` : ''} · {e.recurring ?? 'ponctuel'} · {e.cashbox}</div>
                  {e.items && e.items.length ? (
                    <div className="trf-itembreak trf-itembreak--inline">
                      {e.items.map((it) => (
                        <div className="trf-itembreak__row" key={it.id}>
                          <span className="trf-itembreak__label">{it.label}</span>
                          <span className="trf-itembreak__val">{fmtMoney(it.amountXof, currency)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 21, color: 'var(--color-indigo)', flex: 'none', textDecoration: e.stopped ? 'line-through' : 'none' }}>{fmtMoney(expenseTotal(e), currency)}</span>
                <div style={{ flex: 'none', display: 'flex', gap: 7, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="trf-act trf-act--ghost" onClick={() => openEdit(e)}>Modifier</button>
                  {e.stopped ? (
                    <button className="trf-act trf-act--ghost" onClick={() => revive(e)}>↺ Rétablir</button>
                  ) : (
                    <>
                      <button className="trf-act" onClick={() => revive(e)}>Approuver</button>
                      <button className="trf-act trf-act--warn" onClick={() => toggleFlag(e)}>{e.flagged ? 'Ne plus signaler' : 'Signaler'}</button>
                      <button className="trf-act trf-act--stop" onClick={() => stop(e)}>Suspendre</button>
                    </>
                  )}
                  <button className="trf-act trf-act--ghost" style={{ color: 'var(--trf-error)' }} onClick={() => removeExpense(e)}>Supprimer</button>
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
                live.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + expenseTotal(e)));
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
        <Modal title={editingId ? 'Modifier la dépense' : 'Nouvelle dépense'} onClose={() => setOpen(false)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <label className="mnd-field">
              <span className="mnd-field__label">Bénéficiaire</span>
              <input className="mnd-input" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex. Fournisseur · Karité Bénin" />
            </label>
            <div style={{ display: 'flex', gap: 14 }}>
              <label className="mnd-field" style={{ flex: 1 }}>
                <span className="mnd-field__label">Montant · {fmtMoney(formTotal, currency)}{cleanItems.length ? ' · somme des articles' : ''}</span>
                {cleanItems.length ? (
                  <input className="mnd-input" value={fmtMoney(formTotal, currency)} readOnly disabled style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }} />
                ) : (
                  <input className="mnd-input" inputMode="numeric" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="0" style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }} />
                )}
              </label>
              <label className="mnd-field" style={{ flex: 'none', width: 180 }}>
                <span className="mnd-field__label">Date</span>
                <input className="mnd-input" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
              </label>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
                <span className="mnd-field__label">Articles de l’achat {form.items.length ? `· ${cleanItems.length}/${form.items.length}` : '· facultatif'}</span>
                <button className="trf-act" onClick={addItem}>+ Ligne</button>
              </div>
              {form.items.length === 0 && (
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, fontStyle: 'italic', color: 'var(--ink-soft)' }}>
                  Ajoute des lignes pour imputer plusieurs articles à ce même achat — le montant devient leur somme. Sinon, laisse le montant simple ci-dessus.
                </div>
              )}
              {form.items.length > 0 && (
                <div className="trf-items">
                  {form.items.map((it) => (
                    <div className="trf-items__row" key={it.id}>
                      <input
                        className="mnd-input" value={it.label} placeholder="Article · ex. Beurre de karité"
                        onChange={(ev) => patchItem(it.id, (x) => ({ ...x, label: ev.target.value }))}
                        style={{ flex: 1 }}
                      />
                      <input
                        className="mnd-input" inputMode="numeric" value={it.amountXof ? String(it.amountXof) : ''} placeholder="0"
                        onChange={(ev) => patchItem(it.id, (x) => ({ ...x, amountXof: parseInt(ev.target.value.replace(/[^0-9]/g, '') || '0', 10) }))}
                        style={{ flex: 'none', width: 130, fontFamily: 'var(--font-serif)', color: 'var(--color-indigo)' }}
                      />
                      <button className="trf-iconbtn trf-iconbtn--danger" onClick={() => removeItem(it.id)} aria-label="Retirer la ligne">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
            <div>
              <div className="mnd-field__label" style={{ marginBottom: 9 }}>Arbitrage</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                <button className={`trf-chip ${!form.flagged ? 'is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, flagged: false }))}>Validée</button>
                <button className={`trf-chip ${form.flagged ? 'is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, flagged: true }))}>Signalée · à revoir</button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={() => setOpen(false)}>Annuler</button>
              <button className="mnd-btn" onClick={save}>{editingId ? 'Enregistrer les modifications' : 'Enregistrer la dépense'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ MODALE · GÉRER LES CATÉGORIES ============ */}
      {catOpen && (
        <Modal title="Catégories & sous-catégories" onClose={() => setCatOpen(false)} width={620}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {categories.length === 0 && <div className="trf-empty">Aucune catégorie. « + Nouvelle catégorie » ouvre la première nomenclature.</div>}
            {categories.map((c) => (
              <div className="trf-manage" key={c.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="trf-manage__name">{c.name}</span>
                  <button className="trf-iconbtn" onClick={() => renameCategory(c)}>Renommer</button>
                  <button className="trf-iconbtn trf-iconbtn--danger" onClick={() => deleteCategory(c)}>Supprimer</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {c.subs.length === 0 && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, fontStyle: 'italic', color: 'var(--ink-soft)' }}>Aucune sous-catégorie</span>}
                  {c.subs.map((s) => (
                    <span className="trf-subchip" key={s}>
                      <button className="trf-subchip__name" onClick={() => renameSub(c, s)} title="Renommer">{s}</button>
                      <button className="trf-subchip__x" onClick={() => deleteSub(c, s)} title="Supprimer" aria-label={`Supprimer ${s}`}>×</button>
                    </span>
                  ))}
                  <button className="trf-iconbtn" onClick={() => addSubTo(c)}>+ Sous-catégorie</button>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={addCategory}>+ Nouvelle catégorie</button>
              <button className="mnd-btn" onClick={() => setCatOpen(false)}>Terminé</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ MODALE · CAISSE ============ */}
      {boxOpen && (
        <Modal title={boxEditingId ? 'Modifier la caisse' : 'Nouvelle caisse'} onClose={() => setBoxOpen(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <label className="mnd-field">
              <span className="mnd-field__label">Nom de la caisse</span>
              <input className="mnd-input" value={boxForm.name} onChange={(e) => setBoxForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex. Caisse principale" />
            </label>
            <label className="mnd-field">
              <span className="mnd-field__label">Type / référence</span>
              <input className="mnd-input" value={boxForm.sub} onChange={(e) => setBoxForm((f) => ({ ...f, sub: e.target.value }))} placeholder="Ex. MTN MoMo · 07 00 00 00" />
            </label>
            <div>
              <div className="mnd-field__label" style={{ marginBottom: 9 }}>Emblème</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {GLYPHS.map((g) => (
                  <button key={g} className={`trf-chip ${boxForm.glyph === g ? 'is-active' : ''}`} style={{ fontSize: 15, padding: '4px 12px' }} onClick={() => setBoxForm((f) => ({ ...f, glyph: g }))}>{g}</button>
                ))}
              </div>
            </div>
            <label className="mnd-field">
              <span className="mnd-field__label">Solde d’ouverture · {boxForm.opening ? fmtMoney(parseInt(boxForm.opening, 10), currency) : fmtMoney(0, currency)}</span>
              <input className="mnd-input" inputMode="numeric" value={boxForm.opening} onChange={(e) => setBoxForm((f) => ({ ...f, opening: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="0" style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }} />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={() => setBoxOpen(false)}>Annuler</button>
              <button className="mnd-btn" onClick={saveBox}>{boxEditingId ? 'Enregistrer' : 'Créer la caisse'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
