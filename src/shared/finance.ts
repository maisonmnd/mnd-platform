import { createStore, useStore } from './store';

/* Finances — factures/devis, dépenses, caisses. Montants stockés en XOF. */

export type PaymentMethod = 'MTN MoMo' | 'Moov' | 'Espèces' | 'Carte' | 'Lien WhatsApp';

export type InvoiceLine = {
  id: string;
  label: string;
  qty: number;
  unitXof: number;
  discountPct: number; // remise par ligne 5/10/15/20 %
};

export type Invoice = {
  id: string;
  branchId: string;
  kind: 'facture' | 'devis';
  number: string;
  clientId: string;
  date: string;
  lines: InvoiceLine[];
  globalDiscountPct: number;
  theme: 'Rose' | 'Arbre' | 'Oiseau' | 'Voyage' | 'Aube' | 'Souffle';
  status: 'brouillon' | 'envoyée' | 'payée' | 'acceptée';
  payment?: PaymentMethod;
  /** Caisse créditée à l’encaissement (POS multi-caisses). */
  cashbox?: string;
  /** Heure d’encaissement HH:mm — journal de caisse. */
  time?: string;
  /** Nom libre quand la cliente n’est pas au CRM (walk-in). */
  clientName?: string;
  /** Le mot du Maître — imprimé sur le document. */
  note?: string;
  /** Maître qui a officié. */
  master?: string;
};

export type Expense = {
  id: string;
  branchId: string;
  label: string;
  amountXof: number;
  date: string;
  cashbox: string; // caisses multiples
  category: string;
  subcategory?: string;
  recurring?: 'mensuel' | 'hebdomadaire' | null;
  flagged?: boolean; // flag/stop d'une dépense
  stopped?: boolean;
  /** Récurrence suspendue (pause) sans être annulée. */
  paused?: boolean;
};

export type Budget = { id: string; branchId: string; category: string; monthlyXof: number };

/** Caisse — chaque branche tient plusieurs caisses ; les montants restent en XOF. */
export type Cashbox = {
  id: string;
  branchId: string;
  name: string;
  sub: string; // type / référence
  glyph: string;
  openingXof: number; // solde d'ouverture du mois
};

/** Nomenclature des dépenses — catégories & sous-catégories créables. */
export type ExpenseCategory = { id: string; name: string; subs: string[] };

export const invoiceTotal = (inv: Invoice): number => {
  const sub = inv.lines.reduce((s, l) => s + l.qty * l.unitXof * (1 - l.discountPct / 100), 0);
  return Math.round(sub * (1 - inv.globalDiscountPct / 100));
};

export const INVOICE_THEMES = ['Rose', 'Arbre', 'Oiseau', 'Voyage', 'Aube', 'Souffle'] as const;

export const INVOICES_SEED: Invoice[] = [
  {
    id: 'f-1042', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-1042', clientId: 'c-adjoa', date: '2026-07-10',
    lines: [
      { id: 'l1', label: 'Resserrage racines', qty: 1, unitXof: 25000, discountPct: 0 },
      { id: 'l2', label: 'Huile Couronne', qty: 2, unitXof: 12000, discountPct: 10 },
    ],
    globalDiscountPct: 0, theme: 'Aube', status: 'payée', payment: 'MTN MoMo', cashbox: 'MTN MoMo', time: '10:20', master: 'Aïcha',
  },
  {
    id: 'd-118', branchId: 'cotonou-flagship', kind: 'devis', number: 'MND-D-2026-118', clientId: 'c-chanel', date: '2026-07-08',
    lines: [{ id: 'l1', label: 'SOS restauration couronne (3 séances)', qty: 3, unitXof: 90000, discountPct: 0 }],
    globalDiscountPct: 15, theme: 'Voyage', status: 'envoyée', master: 'Brice',
  },
  // — Fil des mois passés (démo P&L 6 mois) —
  { id: 'f-0917', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-0917', clientId: 'c-thierry', date: '2026-02-14', lines: [{ id: 'l1', label: 'Entretien complet', qty: 1, unitXof: 40000, discountPct: 0 }, { id: 'l2', label: 'Création locks moyennes', qty: 1, unitXof: 80000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Arbre', status: 'payée', payment: 'Espèces', cashbox: 'Caisse principale', master: 'Romuald' },
  { id: 'f-0918', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-0918', clientId: 'c-mariama', date: '2026-02-21', lines: [{ id: 'l1', label: 'Rituel des quatre temps', qty: 1, unitXof: 60000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Souffle', status: 'payée', payment: 'MTN MoMo', cashbox: 'MTN MoMo', master: 'Brice' },
  { id: 'f-0946', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-0946', clientId: 'c-adjoa', date: '2026-03-08', lines: [{ id: 'l1', label: 'Création microlocks', qty: 1, unitXof: 180000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'payée', payment: 'Carte', cashbox: 'Compte UBA', master: 'Brice' },
  { id: 'f-0952', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-0952', clientId: 'c-thierry', date: '2026-03-19', lines: [{ id: 'l1', label: 'Resserrage racines', qty: 1, unitXof: 25000, discountPct: 0 }, { id: 'l2', label: 'Sérum Racines', qty: 1, unitXof: 14000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Aube', status: 'payée', payment: 'Moov', cashbox: 'Moov Money', master: 'Aïcha' },
  { id: 'f-0968', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-0968', clientId: 'c-mariama', date: '2026-04-05', lines: [{ id: 'l1', label: 'Coiffure cérémonie', qty: 1, unitXof: 35000, discountPct: 0 }, { id: 'l2', label: 'Beurre Locks', qty: 2, unitXof: 9500, discountPct: 5 }], globalDiscountPct: 0, theme: 'Oiseau', status: 'payée', payment: 'Espèces', cashbox: 'Caisse principale', master: 'Yéman' },
  { id: 'f-0975', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-0975', clientId: 'c-chanel', date: '2026-04-18', lines: [{ id: 'l1', label: 'Reprise de locks abîmées', qty: 2, unitXof: 55000, discountPct: 0 }], globalDiscountPct: 10, theme: 'Voyage', status: 'payée', payment: 'MTN MoMo', cashbox: 'MTN MoMo', master: 'Yéman' },
  { id: 'f-0991', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-0991', clientId: 'c-adjoa', date: '2026-05-09', lines: [{ id: 'l1', label: 'Entretien complet', qty: 1, unitXof: 40000, discountPct: 0 }, { id: 'l2', label: 'Huile Couronne', qty: 1, unitXof: 12000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Aube', status: 'payée', payment: 'MTN MoMo', cashbox: 'MTN MoMo', master: 'Romuald' },
  { id: 'f-1003', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-1003', clientId: 'c-ines', date: '2026-05-24', lines: [{ id: 'l1', label: 'Création locks moyennes', qty: 1, unitXof: 80000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'payée', payment: 'Espèces', cashbox: 'Caisse principale', master: 'Aïcha' },
  { id: 'f-1018', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-1018', clientId: 'c-thierry', date: '2026-06-06', lines: [{ id: 'l1', label: 'Rituel des quatre temps', qty: 1, unitXof: 60000, discountPct: 0 }, { id: 'l2', label: 'Bain vapeur & huiles', qty: 1, unitXof: 20000, discountPct: 0 }], globalDiscountPct: 5, theme: 'Souffle', status: 'payée', payment: 'Carte', cashbox: 'Compte UBA', master: 'Brice' },
  { id: 'f-1027', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-1027', clientId: 'c-mariama', date: '2026-06-17', lines: [{ id: 'l1', label: 'Resserrage racines', qty: 1, unitXof: 25000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Arbre', status: 'payée', payment: 'Moov', cashbox: 'Moov Money', master: 'Aïcha' },
  { id: 'f-1034', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-1034', clientId: 'c-adjoa', date: '2026-06-28', lines: [{ id: 'l1', label: 'Coiffure cérémonie', qty: 1, unitXof: 35000, discountPct: 0 }, { id: 'l2', label: 'Shampoing Naturel', qty: 2, unitXof: 8000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Oiseau', status: 'payée', payment: 'MTN MoMo', cashbox: 'MTN MoMo', master: 'Yéman' },
  { id: 'f-1040', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-1040', clientId: 'c-ines', date: '2026-07-04', lines: [{ id: 'l1', label: 'Bain vapeur & huiles', qty: 1, unitXof: 20000, discountPct: 0 }, { id: 'l2', label: 'Sérum Racines', qty: 1, unitXof: 14000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Aube', status: 'payée', payment: 'Espèces', cashbox: 'Caisse principale', time: '09:05', master: 'Aïcha' },
  { id: 'f-1041', branchId: 'cotonou-flagship', kind: 'facture', number: 'MND-2026-1041', clientId: 'c-thierry', date: '2026-07-09', lines: [{ id: 'l1', label: 'Entretien complet', qty: 1, unitXof: 40000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Arbre', status: 'envoyée', master: 'Romuald' },
  { id: 'f-ab-204', branchId: 'abidjan', kind: 'facture', number: 'MND-AB-2026-0204', clientId: 'c-fatou', date: '2026-07-06', lines: [{ id: 'l1', label: 'Resserrage racines', qty: 1, unitXof: 25000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Aube', status: 'payée', payment: 'Moov', cashbox: 'Caisse principale', master: 'Mariam' },
  { id: 'f-pa-088', branchId: 'paris', kind: 'facture', number: 'MND-PA-2026-0088', clientId: 'c-awa', date: '2026-07-05', lines: [{ id: 'l1', label: 'Entretien complet', qty: 1, unitXof: 40000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Voyage', status: 'payée', payment: 'Carte', cashbox: 'Caisse principale', master: 'Awa' },
];

export const EXPENSES_SEED: Expense[] = [
  { id: 'e-1', branchId: 'cotonou-flagship', label: 'Loyer flagship', amountXof: 450000, date: '2026-07-01', cashbox: 'Caisse principale', category: 'Local', subcategory: 'Loyer', recurring: 'mensuel' },
  { id: 'e-2', branchId: 'cotonou-flagship', label: 'Karité brut (25 kg)', amountXof: 85000, date: '2026-07-05', cashbox: 'Caisse laboratoire', category: 'Matières premières', subcategory: 'Beurres' },
  { id: 'e-3', branchId: 'cotonou-flagship', label: 'Électricité SBEE', amountXof: 62000, date: '2026-07-06', cashbox: 'Caisse principale', category: 'Local', subcategory: 'Énergie', recurring: 'mensuel' },
  { id: 'e-4', branchId: 'cotonou-flagship', label: 'Campagne Instagram juillet', amountXof: 40000, date: '2026-07-07', cashbox: 'Caisse principale', category: 'Marketing', flagged: true },
  { id: 'e-5', branchId: 'abidjan', label: 'Loyer Cocody', amountXof: 380000, date: '2026-07-01', cashbox: 'Caisse principale', category: 'Local', subcategory: 'Loyer', recurring: 'mensuel' },
  // — Mois passés (démo P&L 6 mois) —
  { id: 'e-fev-1', branchId: 'cotonou-flagship', label: 'Loyer flagship', amountXof: 450000, date: '2026-02-01', cashbox: 'Caisse principale', category: 'Local', subcategory: 'Loyer', recurring: 'mensuel' },
  { id: 'e-fev-2', branchId: 'cotonou-flagship', label: 'Salaires & commissions', amountXof: 620000, date: '2026-02-28', cashbox: 'Compte UBA', category: 'Salaires', subcategory: 'Base fixe', recurring: 'mensuel' },
  { id: 'e-mar-1', branchId: 'cotonou-flagship', label: 'Loyer flagship', amountXof: 450000, date: '2026-03-01', cashbox: 'Caisse principale', category: 'Local', subcategory: 'Loyer', recurring: 'mensuel' },
  { id: 'e-mar-2', branchId: 'cotonou-flagship', label: 'Plantes & actifs · réserve', amountXof: 96000, date: '2026-03-12', cashbox: 'Caisse laboratoire', category: 'Matières premières', subcategory: 'Plantes & actifs' },
  { id: 'e-avr-1', branchId: 'cotonou-flagship', label: 'Loyer flagship', amountXof: 450000, date: '2026-04-01', cashbox: 'Caisse principale', category: 'Local', subcategory: 'Loyer', recurring: 'mensuel' },
  { id: 'e-avr-2', branchId: 'cotonou-flagship', label: 'Shooting gamme DÒDÒ™', amountXof: 120000, date: '2026-04-15', cashbox: 'Caisse principale', category: 'Marketing', subcategory: 'Shooting & contenu' },
  { id: 'e-mai-1', branchId: 'cotonou-flagship', label: 'Loyer flagship', amountXof: 450000, date: '2026-05-01', cashbox: 'Caisse principale', category: 'Local', subcategory: 'Loyer', recurring: 'mensuel' },
  { id: 'e-mai-2', branchId: 'cotonou-flagship', label: 'Contenants & packaging', amountXof: 74000, date: '2026-05-20', cashbox: 'Caisse laboratoire', category: 'Matières premières', subcategory: 'Contenants & packaging' },
  { id: 'e-juin-1', branchId: 'cotonou-flagship', label: 'Loyer flagship', amountXof: 450000, date: '2026-06-01', cashbox: 'Caisse principale', category: 'Local', subcategory: 'Loyer', recurring: 'mensuel' },
  { id: 'e-juin-2', branchId: 'cotonou-flagship', label: 'Électricité SBEE', amountXof: 58000, date: '2026-06-06', cashbox: 'Caisse principale', category: 'Local', subcategory: 'Énergie', recurring: 'mensuel' },
  { id: 'e-juin-3', branchId: 'cotonou-flagship', label: 'Salaires & commissions', amountXof: 640000, date: '2026-06-30', cashbox: 'Compte UBA', category: 'Salaires', subcategory: 'Base fixe', recurring: 'mensuel' },
];

export const BUDGETS_SEED: Budget[] = [
  { id: 'b-1', branchId: 'cotonou-flagship', category: 'Local', monthlyXof: 600000 },
  { id: 'b-2', branchId: 'cotonou-flagship', category: 'Matières premières', monthlyXof: 200000 },
  { id: 'b-3', branchId: 'cotonou-flagship', category: 'Marketing', monthlyXof: 100000 },
];

export const CASHBOXES_SEED: Cashbox[] = [
  { id: 'cx-cot-principale', branchId: 'cotonou-flagship', name: 'Caisse principale', sub: 'Espèces · coffre salon', glyph: '◈', openingXof: 1850000 },
  { id: 'cx-cot-labo', branchId: 'cotonou-flagship', name: 'Caisse laboratoire', sub: 'Atelier des formules', glyph: '⬡', openingXof: 240000 },
  { id: 'cx-cot-mtn', branchId: 'cotonou-flagship', name: 'MTN MoMo', sub: 'Marchand · 506846', glyph: '▤', openingXof: 920000 },
  { id: 'cx-cot-moov', branchId: 'cotonou-flagship', name: 'Moov Money', sub: 'Marchand · 401122', glyph: '▤', openingXof: 410000 },
  { id: 'cx-cot-uba', branchId: 'cotonou-flagship', name: 'Compte UBA', sub: 'Banque · virements', glyph: '▦', openingXof: 6400000 },
  { id: 'cx-ab-principale', branchId: 'abidjan', name: 'Caisse principale', sub: 'Espèces · Cocody', glyph: '◈', openingXof: 760000 },
  { id: 'cx-ab-momo', branchId: 'abidjan', name: 'Mobile Money', sub: 'Marchand · 2211', glyph: '▤', openingXof: 380000 },
  { id: 'cx-pa-principale', branchId: 'paris', name: 'Caisse principale', sub: 'Espèces · Château d’Eau', glyph: '◈', openingXof: 520000 },
  { id: 'cx-pa-banque', branchId: 'paris', name: 'Compte BNP', sub: 'Banque · CB & virements', glyph: '▦', openingXof: 2100000 },
];

export const EXPENSE_CATEGORIES_SEED: ExpenseCategory[] = [
  { id: 'ec-local', name: 'Local', subs: ['Loyer', 'Énergie', 'Internet & téléphone', 'Entretien des lieux'] },
  { id: 'ec-matieres', name: 'Matières premières', subs: ['Beurres', 'Plantes & actifs', 'Contenants & packaging', 'Cristaux & poudres'] },
  { id: 'ec-salaires', name: 'Salaires', subs: ['Base fixe', 'Commissions', 'Primes', 'Charges sociales'] },
  { id: 'ec-marketing', name: 'Marketing', subs: ['Publicité réseaux', 'Shooting & contenu', 'Influence & RP', 'Le Couronnement'] },
  { id: 'ec-logistique', name: 'Logistique', subs: ['Livraisons', 'Transport équipe', 'Coursiers', 'Stockage'] },
  { id: 'ec-equipement', name: 'Équipement', subs: ['Fauteuils & miroirs', 'Outils & ciseaux', 'Informatique', 'Mobilier'] },
  { id: 'ec-frais', name: 'Frais bancaires', subs: ['Commissions Mobile Money', 'Frais de compte', 'Agios'] },
  { id: 'ec-divers', name: 'Divers', subs: ['Imprévu', 'Cadeaux clientes', 'Formation externe', 'Autre'] },
];

export const invoicesStore = createStore<Invoice[]>('mnd_invoices', INVOICES_SEED);
export const expensesStore = createStore<Expense[]>('mnd_expenses', EXPENSES_SEED);
export const budgetsStore = createStore<Budget[]>('mnd_budgets', BUDGETS_SEED);
export const cashboxesStore = createStore<Cashbox[]>('mnd_cashboxes', CASHBOXES_SEED);
export const expenseCategoriesStore = createStore<ExpenseCategory[]>('mnd_expense_categories', EXPENSE_CATEGORIES_SEED);

export const useInvoices = () => useStore(invoicesStore);
export const useExpenses = () => useStore(expensesStore);
export const useBudgets = () => useStore(budgetsStore);
export const useCashboxes = () => useStore(cashboxesStore);
export const useExpenseCategories = () => useStore(expenseCategoriesStore);

import { bindCollection } from './sync';
bindCollection(invoicesStore, 'invoices');
bindCollection(expensesStore, 'expenses');
bindCollection(budgetsStore, 'budgets');
bindCollection(cashboxesStore, 'cashboxes');
bindCollection(expenseCategoriesStore, 'expense_categories');
