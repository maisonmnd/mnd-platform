import { createStore, useStore } from './store';

/* Finances — factures/devis, dépenses, caisses. Montants stockés en XOF. */

/** Un moyen de paiement — la liste est désormais gérable (usePaymentMethods), donc libre. */
export type PaymentMethod = string;

/** Moyens de paiement par défaut — la liste est éditable (paymentMethodsStore). */
export const PAYMENT_METHODS_DEFAULT: string[] = [
  'MTN MoMo', 'Moov', 'Celtis', 'Wave', 'Espèces', 'Carte', 'Virement bancaire', 'PayPal', 'Chèque', 'Lien WhatsApp',
];
/** Alias rétro-compatible (liste par défaut). Préférer `usePaymentMethods()`. */
export const PAYMENT_METHODS = PAYMENT_METHODS_DEFAULT;

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
  /** Remise manuelle en CFA, retranchée APRÈS la remise globale en %. */
  globalDiscountXof?: number;
  /** Encaissé en devise étrangère. Trace de ce qui a été REÇU au comptoir ; le
      total de la facture reste en XOF, seule base de la maison.
      `rate` = 1 unité de `code` en XOF, au taux du jour saisi par le maître. */
  fx?: { code: string; rate: number; amount: number };
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
  /** RDV créé automatiquement à l’acceptation d’un devis (évite les doublons). */
  apptId?: string;
  /** Pourboire encaissé dans la caisse (traçabilité POS) — HORS chiffre d'affaires,
      reversé au maître. Ne compte jamais dans invoiceTotal. */
  tipXof?: number;
  /** Part de la facture réglée par AVOIR (crédit prépayé du compte). C'est du
      revenu (compte dans invoiceTotal / le CA) mais PAS de l'argent physique :
      la Synthèse la route vers le poste « Avoir (crédit) », jamais une caisse. */
  avoirXof?: number;
  /** Part de cette facture DÉJÀ REÇUE avant le comptoir : l'acompte confirmé
      (envoyé en ligne ou remis à l'avance). C'est du revenu, et c'est de
      l'argent réel — mais il est entré un autre jour, dans une autre caisse.
      Sans ce champ, la caisse du comptoir est créditée du total et l'acompte
      est compté DEUX fois : une fois le jour où il arrive, une fois au solde.
      Même raison d'être que `avoirXof`, autre nature. */
  depositCreditXof?: number;
  /** Cliente réellement SOIGNÉE quand le payeur (clientId) est le parent d'un
      compte famille — mentionnée sur la facture. */
  forClientId?: string;
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

/** Caisse — chaque branche tient plusieurs caisses. */
export type Cashbox = {
  id: string;
  branchId: string;
  name: string;
  sub: string; // type / référence
  glyph: string;
  /** Solde d'ouverture du mois, DANS LA DEVISE DE LA CAISSE (voir `currency`).
      Le nom du champ est historique : avant les caisses en devise, tout était
      en XOF. Renommer casserait les données déjà enregistrées. */
  openingXof: number;
  /** Devise physiquement détenue. Absente = la devise de la maison.
      Une caisse en devise garde des billets étrangers : elle ne reçoit que des
      règlements dans SA devise, et son solde se compte dans cette devise —
      jamais reconverti, sinon le compte ne tomberait plus juste avec le tiroir. */
  currency?: string;
};

/** Devise d'une caisse — XOF par défaut. */
export const cashboxCurrency = (b: Cashbox): string => b.currency || 'XOF';

/** Une caisse tient-elle une devise étrangère (≠ devise de la maison) ? */
export const isFxCashbox = (b: Cashbox, houseCurrency: string): boolean =>
  cashboxCurrency(b) !== houseCurrency;

/** Nomenclature des dépenses — catégories & sous-catégories créables. */
export type ExpenseCategory = { id: string; name: string; subs: string[] };

/** Total encaissable : lignes remisées, puis remise globale en %, puis remise en
    CFA. Jamais négatif. Le pourboire (`tipXof`) n'y entre JAMAIS — il transite par
    la caisse mais n'est pas du chiffre d'affaires. */
export const invoiceTotal = (inv: Invoice): number => {
  const sub = inv.lines.reduce((s, l) => s + l.qty * l.unitXof * (1 - l.discountPct / 100), 0);
  return Math.max(0, Math.round(sub * (1 - inv.globalDiscountPct / 100)) - (inv.globalDiscountXof ?? 0));
};

export const INVOICE_THEMES = ['Rose', 'Arbre', 'Oiseau', 'Voyage', 'Aube', 'Souffle'] as const;

/** Prochain numéro d'une SÉRIE de documents (préfixe + année) : compteur monotone
    par série et par an, PLUS vérification d'unicité avant écriture. Les anciens
    tirages (4 derniers chiffres de l'horodatage — qui se répètent toutes les 10 s
    et d'un jour à l'autre — ou max des 4 derniers chiffres toutes séries
    confondues) finissaient par produire des numéros DUPLIQUÉS sur des documents
    client : cauchemar de rapprochement comptable. On ne lit que les numéros de la
    même série (`PREFIX-ANNÉE-N`) — les numéros repris de l'ancien ERP
    (MND-V-…) n'inflatent plus le compteur. Le suffixe grandit au-delà de 4
    chiffres sans troncature. Résiduel accepté : deux appareils HORS LIGNE peuvent
    encore tirer le même numéro dans la même fenêtre de synchronisation. */
/* 'MND-D' est la serie des DEVIS. Le motif ancre en debut et en fin
   (`^MND-2026-(\d+)$`) ne confond pas les deux series : un devis
   « MND-D-2026-0007 » ne compte pas dans les factures, ni l'inverse. */
export function nextInvoiceNumber(invoices: Invoice[], prefix: 'MND' | 'MND-D' | 'F'): string {
  const year = new Date().getFullYear();
  const re = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const used = new Set<string>();
  let max = 0;
  for (const i of invoices) {
    if (!i?.number) continue;
    used.add(i.number);
    const m = re.exec(i.number);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  let n = max + 1;
  let num = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
  while (used.has(num)) {
    n += 1;
    num = `${prefix}-${year}-${String(n).padStart(4, '0')}`;
  }
  return num;
}

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
/** Liste gérable des moyens de paiement (Paramètres), synchronisée Supabase. */
export const paymentMethodsStore = createStore<string[]>('mnd_payment_methods', PAYMENT_METHODS_DEFAULT);

export const useInvoices = () => useStore(invoicesStore);
export const useExpenses = () => useStore(expensesStore);
export const useBudgets = () => useStore(budgetsStore);
export const useCashboxes = () => useStore(cashboxesStore);
export const useExpenseCategories = () => useStore(expenseCategoriesStore);
export const usePaymentMethods = () => useStore(paymentMethodsStore);

/* ---------- Coffre-fort — épargne verrouillée ----------
   Registre d'épargne SÉPARÉ : on y met de côté une part du chiffre DÉJÀ gagné.
   Il n'entre PAS dans le chiffre d'affaires ni dans les dépenses (aucun écran de
   finances ne le compte). Aucune dépense possible depuis le coffre : la SEULE
   sortie autorisée est un virement vers la banque. Money = collection (une ligne
   par mouvement, jamais un document LWW) pour ne jamais perdre un dépôt. */
export type CoffreMovement = {
  id: string;
  branchId: string;
  kind: 'depot' | 'virement'; // dépôt (entrée) · virement bancaire (SEULE sortie)
  amountXof: number; // toujours positif ; le sens vient de `kind`
  date: string; // ISO AAAA-MM-JJ
  clientId?: string; // dépôt attribué à une cliente (source du revenu mis de côté)
  clientName?: string;
  bank?: string; // virement : banque / compte destinataire
  note?: string;
};
/** Montant signé d'un mouvement : + pour un dépôt, − pour un virement sortant. */
export const coffreSignedXof = (m: CoffreMovement): number => (m.kind === 'depot' ? m.amountXof : -m.amountXof);
/** Solde courant du coffre = somme des dépôts − somme des virements. Jamais négatif. */
export const coffreBalance = (moves: CoffreMovement[]): number => Math.max(0, moves.reduce((s, m) => s + coffreSignedXof(m), 0));

export const coffreStore = createStore<CoffreMovement[]>('mnd_coffre', []);
export const useCoffre = () => useStore(coffreStore);

/* ---------- Avoirs — crédit prépayé par COMPTE (famille ou cliente solo) ----------
   Un avoir est de l'argent versé d'avance sur un COMPTE, utilisable pour solder
   des prestations. Le porteur est soit un compte FAMILLE (porte-monnaie du parent
   payeur, utilisable pour tous les membres), soit une cliente sans famille.
   Money = collection (une ligne par mouvement, jamais un document LWW). */
export type CreditHolder = { type: 'family' | 'client'; id: string };
export type CreditMovement = {
  id: string;
  branchId: string;
  holderType: 'family' | 'client'; // qui porte l'avoir
  holderId: string; // family.id ou client.id
  kind: 'depot' | 'usage' | 'remboursement'; // dépôt (+) · règlement d'une presta (−) · remboursement (−)
  amountXof: number; // toujours positif ; le sens vient de `kind`
  date: string; // ISO
  forClientId?: string; // usage : la cliente réellement soignée (membre du compte)
  invoiceId?: string; // usage : facture réglée
  note?: string;
};
/** + pour un dépôt, − pour un usage ou un remboursement. */
export const creditSignedXof = (m: CreditMovement): number => (m.kind === 'depot' ? m.amountXof : -m.amountXof);
/** Solde d'avoir d'un porteur (compte famille ou cliente). Jamais négatif. */
export const creditBalanceOf = (moves: CreditMovement[], holder: CreditHolder): number =>
  Math.max(0, moves
    .filter((m) => m.holderType === holder.type && m.holderId === holder.id)
    .reduce((s, m) => s + creditSignedXof(m), 0));

export const creditMovementsStore = createStore<CreditMovement[]>('mnd_credits', []);
export const useCredits = () => useStore(creditMovementsStore);

/* ---------- Paiements en ligne (KkiaPay) ----------
   Registre des transactions encaissées hors comptoir. ÉCRIT PAR LE SERVEUR
   UNIQUEMENT (fonctions Edge `kkiapay-verify` / `kkiapay-webhook`, clé de
   service) : une cliente ne déclare jamais elle-même qu'elle a payé. Le magasin
   ci-dessous n'est là que pour LIRE au Trône — l'hydratation échoue en silence
   côté Ma Couronne, qui n'est pas du personnel (même cas que `mnd_segments`).
   `amountXof` est le BRUT débité à la cliente, `feesXof` la commission KkiaPay
   (à la charge de la Maison : le chiffre d'affaires reste brut, la commission
   part en dépense de la caisse KkiaPay). */
export type Payment = {
  id: string; // identifiant de transaction KkiaPay — clé d'idempotence
  branchId: string;
  provider: 'kkiapay';
  amountXof: number;
  feesXof: number;
  method?: string; // MOBILE_MONEY · CARD · WALLET
  partnerId?: string; // notre référence : id du rendez-vous
  clientId?: string;
  status: 'success' | 'failed';
  at: string; // ISO
};
export const paymentsStore = createStore<Payment[]>('mnd_payments', []);
export const usePayments = () => useStore(paymentsStore);
/** Le paiement en ligne rattaché à un rendez-vous, s'il existe. */
export const paymentOfAppointment = (payments: Payment[], apptId: string): Payment | undefined =>
  payments.find((p) => p.partnerId === apptId && p.status === 'success');

import { bindCollection, bindDocument } from './sync';
/* Liaison CONDITIONNELLE : sans clé publique KkiaPay, la maison n'encaisse pas
   en ligne et la table `payments` n'existe peut-être pas encore côté serveur —
   s'y lier ferait échouer l'hydratation et virer la pastille de synchro au
   rouge sur un salon en activité, pour rien. Poser la clé au build (après avoir
   joué la migration 0012) suffit à réveiller le registre. */
if ((import.meta.env.VITE_KKIAPAY_PUBLIC_KEY as string | undefined)?.trim()) {
  bindCollection(paymentsStore, 'payments');
}
bindCollection(invoicesStore, 'invoices');
bindCollection(expensesStore, 'expenses');
bindCollection(budgetsStore, 'budgets');
bindCollection(cashboxesStore, 'cashboxes');
bindCollection(expenseCategoriesStore, 'expense_categories');
bindCollection(coffreStore, 'coffre_movements');
bindCollection(creditMovementsStore, 'credit_movements');
bindDocument(paymentMethodsStore, 'mnd_payment_methods');

/* ═══════════════════════════════════════════════════════════
   LES CAISSES DE L'ANCIEN LOGICIEL.

   L'import de juillet 2026 a ecrit `cashbox: caisseId` — l'identifiant de la
   caisse Firebase, pas son nom. D'ou les « 9a7vogg », « uu5mhlr » et
   « ja1y92oymqfhqzu1 » qui s'affichaient tels quels dans Revenus par caisse :
   des montants justes sous une etiquette illisible. Les vrais noms sont restes
   dans Firebase, hors de portee ; plutot que d'inventer une correspondance,
   on regroupe ces identifiants sous un libelle qui dit ce qu'ils sont.

   La detection ne touche QUE ce qui ne peut pas etre un nom ecrit par une
   main : six caracteres ou plus, sans espace ni accent ni tiret, melangeant
   lettres et chiffres. « mobile-money », « especes », « Caisse principale »
   et « Autres » passent tous a travers, intacts. */
export const CAISSE_HERITEE = 'Caisse · ancien logiciel';

const semblePasUnNom = (v: string): boolean =>
  /^[a-z0-9]{6,}$/i.test(v) && /[0-9]/.test(v) && /[a-z]/i.test(v);

/** Le nom lisible d'une caisse — ou le libelle de l'heritage si c'en est un. */
export const cashboxLabel = (raw: string | undefined | null): string => {
  const v = (raw ?? '').trim();
  if (!v) return 'Autres';
  return semblePasUnNom(v) ? CAISSE_HERITEE : v;
};
