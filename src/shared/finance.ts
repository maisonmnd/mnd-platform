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

/** Ligne d'une dépense — plusieurs articles peuvent être imputés à un même achat. */
export type ExpenseItem = { id: string; label: string; amountXof: number };

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
  /** Articles imputés au même achat ; `amountXof` = somme des lignes. */
  items?: ExpenseItem[];
};

/** Total d'une dépense — somme des lignes si présentes, sinon le montant simple. */
export const expenseTotal = (e: Expense): number =>
  e.items && e.items.length ? e.items.reduce((s, it) => s + it.amountXof, 0) : e.amountXof;

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

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const INVOICES_SEED: Invoice[] = [];

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const EXPENSES_SEED: Expense[] = [];

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const BUDGETS_SEED: Budget[] = [];

/* Maison neuve — coquille vierge ; tout naît de l’usage. */
export const CASHBOXES_SEED: Cashbox[] = [];

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
