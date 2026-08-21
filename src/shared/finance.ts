import { createStore, useStore, uid } from './store';

/* Finances — factures/devis, dépenses, caisses. Montants stockés en XOF. */

/** Un moyen de paiement — la liste est désormais gérable (usePaymentMethods), donc libre. */
export type PaymentMethod = string;

/** Moyens de paiement par défaut — la liste est éditable (paymentMethodsStore). */
export const PAYMENT_METHODS_DEFAULT: string[] = [
  'MTN MoMo', 'Moov', 'Celtis', 'Wave', 'Espèces', 'Carte', 'Virement bancaire', 'PayPal', 'Chèque', 'Lien WhatsApp',
];
/** Alias rétro-compatible (liste par défaut). Préférer `usePaymentMethods()`. */
export const PAYMENT_METHODS = PAYMENT_METHODS_DEFAULT;

/** UN RÈGLEMENT PORTÉ PAR LA PIÈCE — 17 août 2026.

    « Hermine D. devrait avoir tous ces règlements sur une même facture avec
    différentes dates de paiement ou différents moyens de paiement. Pas besoin
    de deux factures différentes le même jour. » (Yéman)

    Un rituel réglé en deux fois produisait DEUX pièces, et chacune se réduisait
    à une ligne « Règlement · A + B + C ». Le bloc n'était pas un caprice : une
    pièce qui ne vaut que 30 000 F sur un rituel de 81 000 ne peut pas détailler
    les prestations sans les proratiser — donc sans mentir. Le bloc était la
    CONSÉQUENCE du découpage.

    Une pièce par rituel, détaillée, et les versements inscrits ici : le détail
    redevient vrai, et chaque règlement garde SA date, SON moyen et SA caisse —
    c'est la date du versement qui range l'argent dans le bon mois, jamais celle
    de la pièce. */
export type InvoicePayment = {
  id: string;
  /** Le jour où l'argent est entré — pas celui de la pièce. */
  date: string;
  amountXof: number;
  method: PaymentMethod;
  /** Caisse créditée. Absente sur les versements repris de l'ancien modèle. */
  cashbox?: string;
  /** Heure d'encaissement HH:mm — journal de caisse. */
  time?: string;
  note?: string;
  /** REÇU EN DEVISE — 18 août 2026, les 100 € de Stevie A. La devise vivait
      sur la PIÈCE seule (`Invoice.fx`) ; or un second versement s'inscrit sur
      une pièce existante sans la réécrire, et l'information se perdait : le
      tiroir EUR restait vide, le PDF taisait les euros. Avec plusieurs
      règlements, seule LE VERSEMENT sait quel argent était étranger.
      `amount` = les billets réellement tendus (pourboire compris — on ne
      découpe pas un billet) ; `amountXof` reste la seule base comptable. */
  fx?: { code: string; rate: number; amount: number };
};

export type InvoiceLine = {
  id: string;
  label: string;
  qty: number;
  unitXof: number;
  discountPct: number; // remise par ligne 5/10/15/20 %
  /** REMISE DE LIGNE EN FRANCS — 17 août 2026. Le pourcentage ne dit pas tout :
      « 5 000 F de moins sur la couleur » est un geste qu'on annonce en francs,
      et le traduire en pourcentage donnerait un nombre à virgule que personne
      ne relit. Elle s'applique APRÈS le pourcentage, comme au rendez-vous.
      Absente sur toutes les pièces d'avant — donc zéro, donc rien ne change. */
  discountXof?: number;
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
  /** Le NOM de la remise quand elle en porte un — « Remise famille » pour
      l'avantage du compte famille. La pièce le stipule à la place du libellé
      générique ; le calcul, lui, ne change pas. */
  discountLabel?: string;
  /** Encaissé en devise étrangère. Trace de ce qui a été REÇU au comptoir ; le
      total de la facture reste en XOF, seule base de la maison.
      `rate` = 1 unité de `code` en XOF, au taux du jour saisi par le maître. */
  fx?: { code: string; rate: number; amount: number };
  theme: 'Rose' | 'Arbre' | 'Oiseau' | 'Voyage' | 'Aube' | 'Souffle';
  status: 'brouillon' | 'envoyée' | 'payée' | 'acceptée';
  payment?: PaymentMethod;
  /** LE JOURNAL DES RÈGLEMENTS — plusieurs versements sur UNE pièce, chacun
      avec sa date, son moyen et sa caisse. Absent sur les pièces d'avant le
      17 août : `invoiceReglements` leur en fabrique un d'une entrée.
      `payment`, `cashbox` et `time` restent le reflet du PREMIER versement,
      pour que les écrans qui ne lisent qu'un moyen continuent de dire vrai. */
  payments?: InvoicePayment[];
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
/** Un article d'une dépense. `amountXof` est TOUJOURS le total de la ligne —
    c'est lui que tous les écrans somment. Quantité et prix unitaire (19 août :
    « ajouter quantité et montant pour avoir le total ») ne sont que sa
    provenance : quand ils sont posés, amountXof = qty × unitXof, écrit à la
    saisie — jamais recalculé à la lecture, pour que les articles d'avant
    (montant seul) restent exacts tels quels. */
export type ExpenseItem = { id: string; label: string; amountXof: number; qty?: number; unitXof?: number };

/* ── L'ARGENT A UN NOM — 21 août 2026 ────────────────────────────────
   « Dans dépenses je veux voir le revenu de quelle cliente je suis en train
   de dépenser. Quand j'ai entamé un autre revenu le savoir aussi. »

   Une dépense désigne le ou les revenus qui la paient. Le lien est ÉCRIT,
   jamais déduit : deviner une provenance ferait lire une histoire fausse en
   croyant lire la vraie.

   `nom` et `date` sont FIGÉS à l'enregistrement, comme le prix d'un rituel
   (`Appointment.priceXof`) : le registre des encaissements vit — une fiche se
   renomme, une facture s'annule — et l'histoire d'une dépense ne doit pas se
   réécrire dans son dos. `ref` reste le lien vivant (l'identifiant du registre,
   `Receipt.id`) pour retrouver la pièce quand elle existe encore. */
export type DepenseSource = {
  /** L'identifiant du revenu dans le registre des encaissements (`Receipt.id`). */
  ref: string;
  /** Le nom porté par le revenu AU MOMENT du lien — figé. */
  nom: string;
  /** Le jour où cet argent est entré — figé. */
  date: string;
  /** La part prise sur ce revenu, en XOF. */
  xof: number;
  /** La fiche cliente, quand le revenu en nomme une — pour le lien de lecture. */
  clientId?: string;
};

export type Expense = {
  id: string;
  branchId: string;
  label: string;
  amountXof: number;
  date: string;
  cashbox: string; // caisses multiples
  /** LES REVENUS QUI PAIENT CETTE DÉPENSE — voir `DepenseSource`. Absent sur
      tout l'historique : une dépense sans `sources` reste muette, elle ne se
      remplit pas toute seule. */
  sources?: DepenseSource[];
  category: string;
  subcategory?: string;
  recurring?: 'mensuel' | 'hebdomadaire' | null;
  flagged?: boolean; // flag/stop d'une dépense
  stopped?: boolean;
  /** Récurrence suspendue (pause) sans être annulée. */
  paused?: boolean;
  /** Articles imputés au même achat ; `amountXof` = somme des lignes. */
  items?: ExpenseItem[];
  /** QUI a écrit cette ligne en dernier — seulement pour les charges de
      salaire, écrites par DEUX chemins (le run de Paie et « Confirmer le
      règlement » de Personnel). 'run' verrouille la resynchronisation
      automatique de Personnel : un run marqué payé ne se fait plus réécrire
      sans geste ; seul un clic explicite reprend la main. */
  source?: 'run' | 'confirm';
};

/** Total d'une dépense — somme des lignes si présentes, sinon le montant simple. */
/** COMBIEN DE FOIS une dépense pèse sur le mois `mk` (« aaaa-mm »).

    Le champ `recurring` était décoratif : rien ne reportait l'engagement d'un
    mois sur le suivant, si bien qu'un loyer de 300 000 F saisi en janvier
    laissait février à décembre trop beaux d'autant — alors que l'onglet
    Engagements l'affichait « actif ». Une récurrente court désormais sur
    chaque mois, de sa saisie jusqu'à son arrêt.

    `stopped` et `paused` la ramènent à son seul mois de saisie : arrêtée, elle
    ne court plus ; en pause, elle ne pèse pas non plus (le champ n'existait
    que pour l'affichage, et une dépense en pause était comptée en entier).

    L'hebdomadaire compte autant de fois que son jour de semaine tombe dans le
    mois — quatre ou cinq selon les mois, jamais un chiffre arbitraire. */
export const expenseOccurrences = (e: Expense, mk: string): number => {
  const debut = (e.date ?? '').slice(0, 7);
  if (!e.recurring || e.stopped || e.paused) return debut === mk ? 1 : 0;
  if (debut > mk) return 0;
  if (e.recurring === 'mensuel') return 1;
  const [y, m] = mk.split('-').map(Number);
  if (!y || !m) return 0;
  const jour = new Date(`${e.date}T12:00:00`).getDay();
  const fin = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= fin; d += 1) if (new Date(y, m - 1, d).getDay() === jour) n += 1;
  return n;
};

export const expenseTotal = (e: Expense): number =>
  e.items && e.items.length ? e.items.reduce((s, it) => s + it.amountXof, 0) : e.amountXof;

/** CE QUE LES DÉPENSES ONT DÉJÀ PRIS, revenu par revenu. Une seule passe pour
    tout l'écran : le sélecteur pose la question pour chaque revenu de la
    caisse, et interroger la liste des dépenses à chaque ligne la relirait
    autant de fois qu'il y a de revenus.

    `sauf` exclut une dépense du décompte — celle qu'on est en train de
    modifier, sans quoi elle se verrait refuser sa propre part. */
export const partsPrisesParRevenu = (
  expenses: readonly Expense[], sauf?: string,
): Map<string, number> => {
  const pris = new Map<string, number>();
  for (const e of expenses) {
    if (e.id === sauf || !e.sources) continue;
    for (const s of e.sources) pris.set(s.ref, (pris.get(s.ref) ?? 0) + s.xof);
  }
  return pris;
};

/** La part d'une dépense qui n'est rattachée à aucun revenu — jamais négative.
    Ce n'est pas une faute : une dépense peut dépasser ce que la caisse sait
    nommer, et le dire vaut mieux que l'inventer. */
export const partNonNommee = (e: Expense): number =>
  Math.max(0, expenseTotal(e) - (e.sources ?? []).reduce((s, x) => s + x.xof, 0));

/** LE REVENU EST-IL ENTAMÉ PAR CETTE DÉPENSE-LÀ ? Vrai quand aucune dépense
    ANTÉRIEURE n'y a puisé — c'est la question de Yéman : « quand j'ai entamé
    un autre revenu, le savoir ». L'ordre est celui de la date de dépense, puis
    de l'identifiant : deux dépenses du même jour doivent trancher pareil quel
    que soit l'ordre de lecture, sinon la pastille sauterait d'une ligne à
    l'autre au gré des synchronisations. */
export const entameLeRevenu = (
  expenses: readonly Expense[], dep: Expense, ref: string,
): boolean => !expenses.some((e) => e.id !== dep.id
  && (e.sources ?? []).some((s) => s.ref === ref)
  && (e.date < dep.date || (e.date === dep.date && e.id < dep.id)));

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
    CFA. Jamais négatif. Le pourboire (`tipXof`) n'y entre JAMAIS — depuis le
    11 août il ne crédite même plus la caisse de la facture : il vit sur sa
    propre ligne du registre des encaissements, caisse « Pourboires ». */
/** Ce que vaut UNE ligne, remises de ligne comprises — pourcentage d'abord,
    francs ensuite, jamais négatif. Une seule définition : trois écrans
    recalculaient la ligne à la main, et le jour où la remise en francs est
    arrivée, ils auraient divergé un par un. */
export const ligneNetXof = (l: InvoiceLine): number =>
  Math.max(0, l.qty * l.unitXof * (1 - l.discountPct / 100) - (l.discountXof ?? 0));

export const invoiceTotal = (inv: Invoice): number => {
  const sub = inv.lines.reduce((s, l) => s + ligneNetXof(l), 0);
  return Math.max(0, Math.round(sub * (1 - inv.globalDiscountPct / 100)) - (inv.globalDiscountXof ?? 0));
};

/** CE QUI ENTRE EN BILLETS le jour du solde : le total, moins la part réglée
    par AVOIR (un crédit, pas des billets) et moins l'acompte DÉJÀ reçu (entré
    un autre jour, souvent dans une autre caisse). Trois écrans recalculaient
    cette formule chacun de leur côté — registre des encaissements, relevé de
    caisse, tableau de bord — et le retrait du pourboire a dû s'y éditer en
    parallèle (12 août) : UNE formule désormais, ici. */
export const invoiceCashXof = (inv: Invoice): number =>
  invoiceTotal(inv) - (inv.avoirXof ?? 0) - (inv.depositCreditXof ?? 0);

/** LES RÈGLEMENTS D'UNE PIÈCE — la liste, ou sa lecture rétro-compatible.

    Les pièces d'avant le 17 août ne portent pas de journal : elles ont un seul
    moyen (`payment`), une seule caisse et un statut. On leur en FABRIQUE un
    d'une entrée quand elles sont soldées, pour que tous les lecteurs — caisse,
    Synthèse, Bilan, reçus — n'aient plus qu'UNE façon de lire l'argent d'une
    facture. Sans ce repli, chaque écran aurait dû connaître les deux formes,
    et c'est ainsi qu'un chiffre finit par diverger d'un écran à l'autre. */
export const invoiceReglements = (inv: Invoice): InvoicePayment[] => {
  if (inv.payments && inv.payments.length > 0) return inv.payments;
  if (inv.status !== 'payée') return [];
  return [{
    id: `ip-${inv.id}`,
    date: inv.date,
    amountXof: invoiceTotal(inv),
    method: inv.payment ?? 'Espèces',
    cashbox: inv.cashbox,
    time: inv.time,
    /* La devise de la pièce d'avant descend sur son versement unique : les
       lectures par versement (tiroir en devise, PDF) n'ont ainsi qu'UNE forme. */
    ...(inv.fx ? { fx: inv.fx } : {}),
  }];
};

/** CE QUI A ÉTÉ RÉELLEMENT REÇU sur la pièce, tous versements confondus. */
export const invoiceRegleXof = (inv: Invoice): number =>
  invoiceReglements(inv).reduce((s, p) => s + p.amountXof, 0);

/** CE QUI RESTE DÛ. Jamais négatif : un trop-perçu est un avoir, pas une dette
    en creux — il se traite ailleurs, il ne se soustrait pas ici. */
export const invoiceResteXof = (inv: Invoice): number =>
  Math.max(0, invoiceTotal(inv) - invoiceRegleXof(inv));

/** La pièce est-elle soldée ? Le STATUT suit l'argent, il ne le décide pas. */
export const invoiceSoldee = (inv: Invoice): boolean =>
  invoiceRegleXof(inv) >= invoiceTotal(inv);

/** CE QUI EST ENTRÉ SUR CETTE PIÈCE UN JOUR DONNÉ (`YYYY-MM-DD`).

    Une pièce ne contribue plus « en bloc au jour de sa date » : elle contribue
    versement par versement, chacun au SIEN. Hermine règle 30 000 F le 12 et
    51 000 F le 28 — une seule facture, deux mois. Compter la pièce entière au
    jour de son émission rangerait 51 000 F dans un mois où ils ne sont pas
    entrés ; c'est la faute que le découpage en deux pièces masquait.

    Passer un préfixe de mois (`YYYY-MM`) donne le mois entier : la comparaison
    se fait sur le début de la chaîne ISO, jamais sur un objet Date — construire
    une date pour en extraire un mois fait basculer d'un jour selon le fuseau. */
export const invoiceRegleAu = (inv: Invoice, prefixeIso: string): number =>
  invoiceReglements(inv)
    .filter((p) => (p.date ?? '').startsWith(prefixeIso))
    .reduce((s, p) => s + p.amountXof, 0);

/** CE QUI EST ENTRÉ EN BILLETS un jour donné — l'avoir et l'acompte écartés.
    L'avoir est un crédit consommé, pas une devise ; l'acompte est déjà entré
    ailleurs, un autre jour. Même doctrine que `invoiceCashXof`, mais versement
    par versement. */
export const invoiceCaisseAu = (inv: Invoice, prefixeIso: string): number =>
  invoiceReglements(inv)
    .filter((p) => (p.date ?? '').startsWith(prefixeIso) && p.method !== 'Avoir' && p.method !== 'Acompte')
    .reduce((s, p) => s + p.amountXof, 0);

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

/* ═══════ LA PIÈCE SE CONSTRUIT ICI, ET NULLE PART AILLEURS ═══════

   Quatre écrans émettaient chacun leur facture à la main — la Caisse,
   l'encaissement d'un rituel (deux pièces), l'écran Factures et le
   Laboratoire. Quatre copies des mêmes défauts possibles : un numéro tiré
   d'une liste de rendu périmée, une heure formatée autrement, un « walkin »
   écrit tel quel dans la pièce. Le constructeur ci-dessous est le seul
   chemin ; chaque écran ne dit plus que ce qui lui est propre.

   MA COURONNE N'EMPRUNTE PAS CE CHEMIN, et c'est voulu : sous RLS une
   cliente ne voit que SES pièces — un compteur de série calculé chez elle
   répéterait les numéros des autres. Sa commande de la Gamme tire un numéro
   aléatoire dans sa propre série (CMD-…, couronne/Tabs.tsx). */

/** La série dit le circuit d'origine, et c'est un DIAGNOSTIC : `F` n'est
    émise que par l'encaissement de rituel, toujours payée — une pièce F
    « envoyée » ne peut être qu'un résidu d'annulation (9 août). `MND` vient
    du comptoir (Caisse, Factures, Laboratoire), `MND-D` des devis. */
export type SerieFacture = 'MND' | 'MND-D' | 'F';

export type FactureNeuve = {
  branchId: string;
  clientId?: string;
  /** Nom libre quand la cliente n'est pas au CRM. */
  clientName?: string;
  forClientId?: string;
  /** Défaut : le jour LOCAL — entre minuit et une heure à Cotonou,
      toISOString daterait la veille et couperait la nuit comptable en deux. */
  date?: string;
  lines?: InvoiceLine[];
  globalDiscountPct?: number;
  globalDiscountXof?: number;
  discountLabel?: string;
  fx?: Invoice['fx'];
  theme?: Invoice['theme'];
  payment?: PaymentMethod;
  cashbox?: string;
  master?: string;
  note?: string;
  tipXof?: number;
  avoirXof?: number;
  depositCreditXof?: number;
} & (
  /* La série F est TOUJOURS payée — le type l'impose, pour que la lecture
     des résidus (une F « envoyée » = un encaissement annulé) reste vraie. */
  | { serie: 'F'; status?: 'payée' }
  | { serie: 'MND' | 'MND-D'; status: Invoice['status'] }
);

const jourLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Une ligne de pièce — le même identifiant d'un circuit à l'autre. */
export const ligneFacture = (label: string, unitXof: number, qty = 1, discountPct = 0): InvoiceLine =>
  ({ id: `il-${uid()}`, label, qty, unitXof, discountPct });

export function nouvelleFacture(f: FactureNeuve): Invoice {
  /* LE NUMÉRO SE TIRE DU MAGASIN, jamais d'une liste de rendu : la valeur
     qu'un composant tient en main date de son dernier rendu, et un numéro
     tiré d'elle peut répéter celui qu'un autre poste vient d'écrire. Le
     magasin, lui, est à jour à l'instant du geste. Résiduel accepté : deux
     appareils HORS LIGNE peuvent encore se croiser (voir nextInvoiceNumber). */
  const number = nextInvoiceNumber(invoicesStore.get(), f.serie);
  /* LE FANTÔME NE TRAVERSE PAS : « walkin » est un marqueur d'écran, pas une
     cliente — écrit tel quel dans une pièce, il ouvrait une fiche fourre-tout
     au CRM (useReconcileClients). La traduction vaut pour tous les circuits. */
  const walkin = f.clientId === 'walkin';
  const clientId = walkin ? '' : f.clientId ?? '';
  const clientName = walkin ? f.clientName ?? 'Walk-in' : f.clientName;
  const status: Invoice['status'] = f.serie === 'F' ? 'payée' : f.status;
  return {
    id: `inv-${uid()}`,
    branchId: f.branchId,
    kind: f.serie === 'MND-D' ? 'devis' : 'facture',
    number,
    clientId,
    date: f.date ?? jourLocal(),
    lines: f.lines ?? [],
    globalDiscountPct: f.globalDiscountPct ?? 0,
    theme: f.theme ?? 'Aube',
    status,
    /* L'heure n'a de sens que sur un encaissement — c'est le journal de caisse. */
    ...(status === 'payée' ? { time: new Date().toTimeString().slice(0, 5) } : {}),
    ...(clientName ? { clientName } : {}),
    ...(f.forClientId ? { forClientId: f.forClientId } : {}),
    ...(f.globalDiscountXof ? { globalDiscountXof: f.globalDiscountXof } : {}),
    ...(f.discountLabel ? { discountLabel: f.discountLabel } : {}),
    ...(f.fx ? { fx: f.fx } : {}),
    ...(f.payment ? { payment: f.payment } : {}),
    ...(f.cashbox ? { cashbox: f.cashbox } : {}),
    ...(f.master ? { master: f.master } : {}),
    ...(f.note ? { note: f.note } : {}),
    ...(f.tipXof ? { tipXof: f.tipXof } : {}),
    ...(f.avoirXof ? { avoirXof: f.avoirXof } : {}),
    ...(f.depositCreditXof ? { depositCreditXof: f.depositCreditXof } : {}),
  };
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
  /** LA CAISSE D'OÙ L'ARGENT SORT — 17 août 2026, décision de Yéman : « le
      coffre comme caisse ».

      Sans elle, mettre 50 000 F au coffre ne les retirait d'aucun tiroir : les
      mêmes francs vivaient dans la caisse créditée à l'encaissement ET dans le
      coffre. Chaque écran disait vrai séparément, et la trésorerie comptait
      deux fois. Un dépôt qui NOMME sa caisse la débite d'autant.

      Absente sur tous les mouvements d'avant cette date, et c'est voulu : ils
      ont été saisis sous l'autre convention, les rendre débiteurs après coup
      ferait bouger des soldes de caisse déjà arrêtés. Ils restent une mise de
      côté symbolique ; les nouveaux déplacent vraiment l'argent. */
  cashbox?: string;
  note?: string;
  /** Dépôt venu des RÉSERVES de Salon & Foyer — un virement interne, pas une
      part de chiffre mise de côté au comptoir. Ces lignes sont réservées au
      souverain côté serveur (migration 0040) : le budget du foyer et l'épargne
      du Partage sont l'affaire du couple, le reste du coffre ne bouge pas. */
  origine?: 'reserve';
  /** Laquelle des deux enveloppes du Partage a produit cette ligne. C'est le
      SEUL endroit où vit cette information : le coffre est le registre unique
      de l'épargne, les « réserves » n'en sont qu'une lecture par enveloppe. */
  enveloppe?: 'reinvestissement' | 'fiscale';
  /** Référence d'un mouvement apparié — libre, conservée pour l'historique. */
  ref?: string;
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
  /** LA CAISSE QUI A REÇU (dépôt) OU RENDU (remboursement) L'ARGENT — 19 août
      2026, « verser un avoir doit aller dans une caisse et être retracé ».
      L'avoir créditait le compte de la cliente et l'argent, lui, n'entrait
      nulle part : le tiroir qui tenait les billets n'en savait rien. Un dépôt
      qui nomme sa caisse y ENTRE, un remboursement en SORT ; l'USAGE ne bouge
      jamais d'argent — c'est un crédit qui se consomme, pas des billets. Les
      mouvements d'avant n'en portent pas : leurs soldes sont arrêtés, on ne
      les fait pas bouger après coup (même règle que le coffre). */
  cashbox?: string;
  /** Le moyen par lequel l'argent est arrivé — Espèces, Mobile Money… */
  method?: string;
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
