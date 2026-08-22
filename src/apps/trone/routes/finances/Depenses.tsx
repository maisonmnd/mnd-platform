import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Eyebrow, Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, fmtIn, convertFromXof } from '../../../../shared/currency';
import { uid, HOUSE_BLANK } from '../../../../shared/store';
import { CURRENCIES } from '../../../../shared/geo';
import { ensureKkiapayCashbox } from '../../../../shared/kkiapay';
import { useNavigate } from 'react-router-dom';
import { expenseOccurrences,
  useExpenses, useBudgets, useCashboxes, useExpenseCategories, useInvoices, useCoffre, useCredits, invoiceTotal, invoiceRegleAu, invoiceReglements, expenseTotal,
  partsPrisesParRevenu, partNonNommee, entameLeRevenu, sourcesDe,
  type CoffreMovement, type CreditMovement, type DepenseSource,
  cashboxCurrency, EXPENSE_CATEGORIES_SEED,
  type Expense, type ExpenseItem, type Cashbox, type ExpenseCategory, type Invoice,
} from '../../../../shared/finance';
import { CAISSE_POURBOIRES } from '../../../../shared/receipts';
import { useClients, useFamilies } from '../../../../shared/clients';
import { normName } from '../../../../shared/text';
import { todayISO, monthKey, monthLabel, monthShort, lastMonths, paceForecast, MonthNav, downloadCsv, useRegistreEncaissements } from './_shared';
import { useApprenants, useSubscribers } from '../equipe/data';
import { apptNetXof, useBranchAppointments, useServicesById } from '../clients/_shared';
import './finances.css';

/** Jour d'un achat, ex. « 13 juil. » — pour afficher la date de chaque dépense. */
const fmtDay = (iso: string): string =>
  iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '';

/* Dépenses — maîtrise des sorties de caisse. Flux par catégorie, caisses multiples,
   engagements à arbitrer (signaler / suspendre), paiements récurrents, budgets avec
   « reste à dépenser », prévision de fin de mois. Tout est persisté et filtré par la branche.
   La période est explicite : le mois se navigue ‹ mois › et une recherche filtre les listes. */

type Tab = 'flux' | 'caisses' | 'argent' | 'budgets';

const FLOW_FILLS = [
  'var(--color-indigo)', 'var(--color-copper)', 'var(--indigo-400)', 'var(--copper-400)',
  'var(--indigo-300)', 'var(--copper-200)', 'var(--indigo-600)', 'var(--color-argile)',
];

type Form = { label: string; amount: string; category: string; subcategory: string; cashbox: string; recurring: '' | 'mensuel' | 'hebdomadaire'; date: string; flagged: boolean; items: ExpenseItem[]; sources: DepenseSource[] };
/** `currency` vide = la caisse tient la devise de la maison. */
type BoxForm = { name: string; sub: string; glyph: string; opening: string; currency: string };

const GLYPHS = ['◈', '❖', '✦', '❈', '◆', '✧', '⬡', '❉'];


/* Date d'un règlement (jj/mm/aaaa, ou ISO) → clé de mois « aaaa-mm ». */
const payMonthKeyLocal = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}` : (d ?? '').slice(0, 7);
};

export default function Depenses() {
  const { branch, currency } = useBranch();
  const [expenses, setExpenses] = useExpenses();
  const [budgets, setBudgets] = useBudgets();
  const [cashboxes, setCashboxes] = useCashboxes();
  /* Le coffre : ses dépôts SORTENT d'une caisse depuis le 17 août. Les deux
     setters ne servent qu'au RENOMMAGE d'une caisse — voir `saveBox`. */
  const [coffre, setCoffre] = useCoffre();
  const [creditMvts, setCreditMvts] = useCredits();
  const [clientes] = useClients();
  const [familles] = useFamilies();
  const [categories, setCategories] = useExpenseCategories();
  const [invoices, setInvoices] = useInvoices();
  const appts = useBranchAppointments();
  const byId = useServicesById();
  const [apprenants] = useApprenants();
  const [abonnes] = useSubscribers();

  const [tab, setTab] = useState<Tab>('flux');
  const [filterCaisse, setFilterCaisse] = useState('all');
  const [filterCat, setFilterCat] = useState('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** Ce qui empêche d'enregistrer, dit à l'écran plutôt que tu en silence. */
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [form, setForm] = useState<Form>({ label: '', amount: '', category: '', subcategory: '', cashbox: '', recurring: '', date: '', flagged: false, items: [], sources: [] });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [catOpen, setCatOpen] = useState(false);
  const [boxOpen, setBoxOpen] = useState(false);
  const [boxEditingId, setBoxEditingId] = useState<string | null>(null);
  const [boxForm, setBoxForm] = useState<BoxForm>({ name: '', sub: '', glyph: '◈', opening: '', currency: '' });
  /** Nom de la caisse dont on lit les mouvements (null = fermé). */
  const [boxDrill, setBoxDrill] = useState<string | null>(null);
  /** Le détail derrière un indice de dépense (null = fermé). */
  const [expDrill, setExpDrill] = useState<{ title: string; sub: string; rows: Expense[] } | null>(null);
  const openExp = (title: string, sub: string, rows: Expense[]) => setExpDrill({ title, sub, rows });
  const navigate = useNavigate();

  /* Nomenclature de secours : liste des catégories VIDE (table serveur vidée ou
     hydratée à vide) → on repose les 8 catégories par défaut. Sans elles, ni
     dépense ni enveloppe budgétaire ne peuvent être qualifiées — la modale
     Budget s'ouvrait sur un choix vide et son bouton ne pouvait rien créer.
     Seed-if-empty : des lignes serveur arrivées plus tard reprennent la main. */
  useEffect(() => {
    if (HOUSE_BLANK) return; // Maison à blanc — pas de semence de catégories
    if (categories.length === 0) {
      setCategories(EXPENSE_CATEGORIES_SEED.map((c) => ({ ...c, subs: [...c.subs] })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length]);

  /* Caisse KkiaPay — l'argent encaissé en ligne n'est pas dans le tiroir : il
     dort sur le compte KkiaPay jusqu'au versement, et sa commission en sort.
     Sans caisse dédiée, la Synthèse annoncerait des billets incomptables.
     Idempotent, sans effet si les rails de paiement sont éteints. */
  useEffect(() => {
    if (HOUSE_BLANK) return;
    ensureKkiapayCashbox(branch.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch.id, cashboxes.length]);

  const thisMonth = monthKey(todayISO());
  const [month, setMonth] = useState(thisMonth);
  const monthName = monthLabel(month);
  const isCurrent = month === thisMonth;
  const branchBoxes = useMemo(() => cashboxes.filter((c) => c.branchId === branch.id), [cashboxes, branch.id]);

  // — Recherche : libellé, catégorie, sous-catégorie (et articles de l'achat) —
  const q = query.trim().toLowerCase();
  const matches = (e: Expense): boolean =>
    !q
    || e.label.toLowerCase().includes(q)
    || e.category.toLowerCase().includes(q)
    || (e.subcategory ?? '').toLowerCase().includes(q)
    || (e.items ?? []).some((it) => it.label.toLowerCase().includes(q));

  /* Une recurrente active pese sur CHAQUE mois qu'elle traverse, pas seulement
     sur celui de sa saisie — `expenseOccurrences` dit combien de fois. */
  /* PAR ORDRE DE DATE, JAMAIS DE SAISIE — 21 août 2026. La liste rendait
     l'ordre brut du magasin : une dépense du 7 août pouvait suivre une du
     21, et relire un mois demandait de sauter d'une ligne à l'autre. Du plus
     RÉCENT au plus ancien, comme le registre des encaissements et comme
     l'export CSV le faisait déjà de son côté.

     L'identifiant tranche les ex æquo : deux dépenses du même jour doivent
     garder le même ordre d'un poste à l'autre, sinon la liste se réarrangerait
     toute seule au gré des synchronisations.

     Une récurrente porte la date de sa SAISIE : elle se range donc au jour où
     l'engagement a été pris, y compris sur les mois qu'elle traverse ensuite —
     c'est bien la date de la dépense, il n'y en a pas d'autre. */
  const monthExp = useMemo(
    () => expenses
      .filter((e) => e.branchId === branch.id && expenseOccurrences(e, month) > 0)
      .sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : (a.date < b.date ? 1 : -1))),
    [expenses, branch.id, month],
  );
  const poids = (e: typeof expenses[number]) => expenseTotal(e) * expenseOccurrences(e, month);

  /* ── OÙ VA L'ARGENT — 22 août 2026 ─────────────────────────────────
     L'onglet Engagements a été retiré ; Yéman a demandé deux choses à sa
     place : « à qui je paie » et « qui a financé ce mois ». Ce sont les deux
     faces de la même pièce — ce qui sort, et d'où ça venait — donc un seul
     onglet, pour ne pas rendre à l'écran le poids qu'on venait de lui ôter.

     LE BÉNÉFICIAIRE SE DÉDUIT DU LIBELLÉ, et il faut le dégrossir : une paie
     s'écrit « Salaire · Nassim M. — août 2026 », si bien que douze mois de
     salaires feraient douze bénéficiaires différents. On retire donc le mois
     final quand il y en a un. Le reste des libellés se groupe tel quel. */
  const beneficiaireDe = (label: string): string =>
    label.replace(/\s+[—-]\s+[A-Za-zÀ-ÿ]+\s+\d{4}\s*$/u, '').trim() || label.trim();

  /** Les bénéficiaires d'une liste de dépenses, du plus payé au moins payé. */
  const beneficiaires = (liste: Expense[]) => {
    const par = new Map<string, { nom: string; total: number; n: number; dernier: string }>();
    for (const e of liste) {
      const nom = beneficiaireDe(e.label);
      const cle = normName(nom);
      const d = par.get(cle);
      if (d) {
        d.total += expenseTotal(e); d.n += 1;
        if (e.date > d.dernier) { d.dernier = e.date; d.nom = nom; }
      } else {
        par.set(cle, { nom, total: expenseTotal(e), n: 1, dernier: e.date });
      }
    }
    return [...par.values()].sort((a, b) => b.total - a.total);
  };

  /* Sur douze mois glissants — c'est l'horizon où « à qui je paie le plus »
     prend un sens ; sur un seul mois, la réponse n'est que le hasard du mois. */
  const debutAn = (() => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, (m || 1) - 12, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  })();
  const depensesDeLAnnee = useMemo(
    () => expenses.filter((e) => e.branchId === branch.id && !e.stopped && e.date >= debutAn && e.date.slice(0, 7) <= month),
    [expenses, branch.id, debutAn, month],
  );

  /* QUI A FINANCÉ CE MOIS — le pendant de « L'argent a un nom ». On lit les
     revenus DÉSIGNÉS par les dépenses du mois, bornés comme partout ailleurs
     (`sourcesDe`), et la part que personne n'a nommée se dit à côté plutôt
     que de disparaître. */
  const financeurs = useMemo(() => {
    const par = new Map<string, { nom: string; total: number; date: string }>();
    let sansNom = 0;
    for (const e of monthExp) {
      for (const src of sourcesDe(e)) {
        const cle = `${src.ref}`;
        const d = par.get(cle);
        if (d) d.total += src.xof;
        else par.set(cle, { nom: src.nom, total: src.xof, date: src.date });
      }
      sansNom += partNonNommee(e);
    }
    return { lignes: [...par.values()].sort((a, b) => b.total - a.total), sansNom };
  }, [monthExp]);
  const live = monthExp.filter((e) => !e.stopped);
  const visibleMonthExp = monthExp.filter(matches);

  const engaged = live.reduce((s, e) => s + poids(e), 0);
  const savings = monthExp.filter((e) => e.stopped).reduce((s, e) => s + poids(e), 0);
  /* LE MEME REVENU QUE LA SYNTHESE. Cet ecran ne comptait que les factures
     payees, en ignorant les rituels encaisses au carnet, les formations et les
     abonnements — puis affichait « Resultat net » et un ratio de depenses sur
     ce revenu tronque, tout en renvoyant par un bouton vers la Synthese, qui
     annoncait un autre chiffre. Sur une maison qui encaisse surtout au carnet,
     le resultat s'affichait negatif a tort. */
  const revenue = useMemo(() => {
    /* Le revenu du mois se lit sur les VERSEMENTS, pas sur le statut des
       pièces : une facture à moitié réglée est « envoyée », et son argent est
       pourtant bien entré. */
    const inv = invoices
      .filter((i) => i.branchId === branch.id && i.kind === 'facture')
      .reduce((s, i) => s + invoiceRegleAu(i, month), 0);
    const rit = appts
      .filter((a) => a.branchId === branch.id && a.status === 'honoré' && !a.invoiceId && monthKey(a.date) === month)
      .reduce((s, a) => s + apptNetXof(a, byId), 0);
    const form = apprenants
      .flatMap((ap) => ap.payments ?? [])
      .filter((pm) => payMonthKeyLocal(pm.date) === month)
      .reduce((s, pm) => s + pm.amountXof, 0);
    const abo = abonnes
      .flatMap((sub) => sub.payments ?? [])
      .filter((pm) => pm.amountXof > 0 && payMonthKeyLocal(pm.date) === month)
      .reduce((s, pm) => s + pm.amountXof, 0);
    return inv + rit + form + abo;
  }, [invoices, appts, apprenants, abonnes, byId, branch.id, month]);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // Prévision : au rythme réel pour le mois courant ; sinon, le total constaté du mois.
  const forecast = isCurrent ? paceForecast(engaged, now.getDate(), daysInMonth) : engaged;
  const forecastNote = isCurrent ? 'au rythme réel du mois' : month < thisMonth ? 'mois clos · total constaté' : 'mois à venir · engagé à date';

  /* ---------- LE MODÈLE DES CAISSES — le flux, défini une fois pour toutes ----------
     Ce qui CRÉDITE physiquement une caisse (le tiroir) :
       + les encaissements qui la citent. Caisse de la maison : total facturé
         − part réglée par AVOIR (crédit prépayé — aucun billet ce jour-là).
         Le POURBOIRE n'y entre PLUS (11 août) : il va dans la caisse pourboire
         de l'équipe — une cliente remet 45 000 F, la Caisse Principale reçoit
         40 000, les 5 000 vivent au registre Encaissements, caisse
         « Pourboires ». Caisse en devise : les billets étrangers réellement
         reçus (fx.amount) — jamais un total reconverti ; un pourboire remis en
         devise reste dans ces billets, on ne le découpe pas.
     Ce qui la DÉBITE :
       − les dépenses vivantes qui la citent (une dépense suspendue n'est
         jamais sortie du tiroir — c'est une économie, pas un flux).
     Le SOLDE est CUMULÉ depuis l'ouverture : ouverture + TOUS les flux jusqu'à
     la fin du mois affiché. L'ancien calcul ne comptait que le mois affiché et
     oubliait l'historique — le solde ne voulait plus rien dire dès le 2e mois. */
  /* Ce qu'une facture fait ENTRER dans une caisse le jour du solde. On retire
     deux parts qui ne sont pas des billets posés ce jour-là : l'avoir (crédit du
     compte, jamais des espèces) et l'acompte déjà reçu (entré un autre jour,
     souvent dans une AUTRE caisse — en ligne chez KkiaPay, par exemple). Sans
     cette seconde soustraction, l'acompte est compté deux fois. */
  /* CE QUE CETTE PIÈCE A MIS DANS CETTE CAISSE, sur les mois retenus.

     Versement par versement, et seulement ceux de LA caisse : un rituel réglé
     moitié espèces moitié Mobile Money ne crédite plus une seule caisse de son
     total. Et c'est la date du VERSEMENT qui le range dans son mois, jamais
     celle de la pièce — c'est toute la raison d'être du journal.

     L'avoir et l'acompte restent hors caisse : un crédit consommé n'est pas une
     devise, un acompte est entré ailleurs, un autre jour. */
  /* LA DEVISE SE LIT AU VERSEMENT — les 100 € de Stevie A., 18 août. Le
     tiroir lisait `i.fx`, posé sur la pièce à sa création seulement : un
     second versement en euros sur une pièce existante n'y entrait JAMAIS.
     Chaque versement porte désormais sa devise (`p.fx`), et le repli de
     `invoiceReglements` descend le `fx` des pièces d'avant sur leur versement
     unique — une seule forme à lire. */
  const boxCredit = (i: Invoice, name: string, boxCur: string, foreign: boolean, keep: (mk: string) => boolean): number =>
    foreign
      ? invoiceReglements(i)
          .filter((p) => p.fx && p.fx.code === boxCur
            /* La caisse du versement fait foi ; les versements d'avant le champ
               `cashbox` suivent la pièce, qui nommait le tiroir. */
            && (p.cashbox ?? i.cashbox) === name
            && keep(monthKey(p.date ?? i.date)))
          .reduce((n, p) => n + p.fx!.amount, 0)
      : invoiceReglements(i)
          .filter((p) => p.cashbox === name && p.method !== 'Avoir' && p.method !== 'Acompte' && keep(monthKey(p.date ?? '')))
          .reduce((n, p) => n + p.amountXof, 0);

  /* CE QUE CETTE CAISSE A VERSÉ AU COFFRE — 17 août 2026, « le coffre comme
     caisse ». Un dépôt qui nomme sa caisse en SORT : sans cette soustraction,
     les mêmes francs vivraient dans le tiroir et dans le coffre, et la
     trésorerie les compterait deux fois.

     Seuls les mouvements qui NOMMENT une caisse comptent. Ceux d'avant n'en
     portent pas : ils ont été saisis comme une mise de côté symbolique, et les
     rendre débiteurs après coup ferait bouger des soldes déjà arrêtés. */
  const verseAuCoffre = (name: string, keep: (mk: string) => boolean): number =>
    coffre
      .filter((m: CoffreMovement) => m.branchId === branch.id && m.kind === 'depot' && m.cashbox === name && keep(monthKey(m.date)))
      .reduce((s: number, m: CoffreMovement) => s + m.amountXof, 0);

  /* LES AVOIRS DE LA CAISSE — 19 août 2026, « verser un avoir doit aller dans
     une caisse et être retracé ». Un dépôt d'avoir qui nomme sa caisse y
     ENTRE (les billets sont dans le tiroir, même si le service n'a pas encore
     eu lieu) ; un remboursement en SORT. L'USAGE ne bouge rien — c'est le
     crédit qui se consomme, pas des billets qui passent. Les mouvements
     d'avant, sans caisse, ne comptent pas : leurs soldes sont arrêtés. */
  const avoirsDeCaisse = (name: string, keep: (mk: string) => boolean): number =>
    creditMvts
      .filter((m) => m.branchId === branch.id && m.cashbox === name
        && (m.kind === 'depot' || m.kind === 'remboursement') && keep(monthKey(m.date)))
      .reduce((s, m) => s + (m.kind === 'depot' ? m.amountXof : -m.amountXof), 0);
  const avoirsMouvements = (name: string, keep: (mk: string) => boolean) =>
    creditMvts.filter((m) => m.branchId === branch.id && m.cashbox === name
      && (m.kind === 'depot' || m.kind === 'remboursement') && keep(monthKey(m.date)));
  const porteurDe = (m: CreditMovement): string =>
    m.holderType === 'family'
      ? familles.find((f) => f.id === m.holderId)?.name ?? 'Compte famille'
      : clientes.find((c) => c.id === m.holderId)?.name ?? 'Cliente';

  const boxOf = (name: string) => branchBoxes.find((b) => b.name === name);
  const boxInvoices = (name: string) =>
    invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture'
      && invoiceReglements(i).some((p) => p.cashbox === name && p.method !== 'Avoir' && p.method !== 'Acompte'));
  const boxExpenses = (name: string) =>
    expenses.filter((e) => e.branchId === branch.id && !e.stopped && e.cashbox === name);

  /** Solde cumulé d'une caisse — ouverture + tous les flux dont le mois passe `keep`. */
  const boxBalanceWhere = (name: string, keep: (mk: string) => boolean) => {
    const box = boxOf(name);
    const boxCur = box ? cashboxCurrency(box) : currency;
    const foreign = boxCur !== currency;
    const inn = boxInvoices(name).reduce((s, i) => s + boxCredit(i, name, boxCur, foreign, keep), 0);
    const out = boxExpenses(name).filter((e) => keep(monthKey(e.date))).reduce((s, e) => s + expenseTotal(e), 0);
    return (box?.openingXof ?? 0) + inn - out - verseAuCoffre(name, keep) + avoirsDeCaisse(name, keep);
  };
  /** Solde à la FIN du mois affiché (c'est « à ce jour » quand on est sur le mois courant). */
  const boxBalance = (name: string) => boxBalanceWhere(name, (mk) => mk <= month);
  /** Solde au DÉBUT du mois affiché — le point de départ du relevé. */
  const boxBalanceStart = (name: string) => boxBalanceWhere(name, (mk) => mk < month);
  /** Entrées / sorties du SEUL mois affiché — le flux du mois, par caisse. */
  const boxMonthFlux = (name: string) => {
    const box = boxOf(name);
    const boxCur = box ? cashboxCurrency(box) : currency;
    const foreign = boxCur !== currency;
    const avoirs = avoirsMouvements(name, (mk) => mk === month);
    const inn = boxInvoices(name).reduce((s, i) => s + boxCredit(i, name, boxCur, foreign, (mk) => mk === month), 0)
      + avoirs.filter((m) => m.kind === 'depot').reduce((s, m) => s + m.amountXof, 0);
    const out = boxExpenses(name).filter((e) => monthKey(e.date) === month).reduce((s, e) => s + expenseTotal(e), 0)
      + verseAuCoffre(name, (mk) => mk === month)
      + avoirs.filter((m) => m.kind === 'remboursement').reduce((s, m) => s + m.amountXof, 0);
    return { inn, out };
  };
  /* La trésorerie ne somme QUE les caisses de la maison : additionner des euros
     à des francs donnerait un nombre qui ne veut rien dire. Les caisses en
     devise se lisent séparément, chacune dans son unité. */
  const treasury = branchBoxes
    .filter((b) => cashboxCurrency(b) === currency)
    .reduce((s, b) => s + boxBalance(b.name), 0);

  /* Ce qu'il y a DERRIÈRE le solde d'une caisse. Mêmes règles que `boxBalance`,
     au mot près : solde au début du mois + mouvements du mois = solde affiché.
     Si la liste ne tombe pas sur le chiffre, c'est l'un des deux qui ment. */
  const boxMoves = (name: string) => {
    const box = boxOf(name);
    const boxCur = box ? cashboxCurrency(box) : currency;
    const foreign = boxCur !== currency;

    const inn = boxInvoices(name)
      .filter((i) => boxCredit(i, name, boxCur, foreign, (mk) => mk === month) > 0)
      .map((i) => ({
        date: i.date,
        label: i.clientName?.trim() || 'Cliente de passage',
        sub: [
          i.number,
          (() => {
            /* Les billets étrangers se lisent au versement — même source que le solde. */
            const dev = invoiceReglements(i).filter((p) => p.fx && p.fx.code === boxCur);
            const total = dev.reduce((n, p) => n + p.fx!.amount, 0);
            return total > 0 ? `${total.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${boxCur}` : null;
          })(),
          !foreign && (i.avoirXof ?? 0) > 0 ? `avoir −${fmtIn(i.avoirXof!, boxCur)}` : null,
          /* Le pourboire se DIT sans se compter : il explique pourquoi la
             cliente a remis plus que ce que la caisse inscrit. */
          !foreign && (i.tipXof ?? 0) > 0 ? `pourboire ${fmtIn(i.tipXof!, boxCur)} → Pourboires` : null,
        ].filter(Boolean).join(' · '),
        delta: boxCredit(i, name, boxCur, foreign, (mk) => mk === month),
        invoiceId: i.id, // la ligne s'ouvre sur la facture
        expense: undefined as Expense | undefined,
      }));

    const out = boxExpenses(name)
      .filter((e) => monthKey(e.date) === month)
      .map((e) => ({
        date: e.date,
        label: e.label,
        sub: e.subcategory ? `${e.category} · ${e.subcategory}` : e.category,
        delta: -expenseTotal(e),
        invoiceId: undefined as string | undefined, // une dépense n'a pas de facture
        /* …mais elle a sa fiche : le relevé d'une caisse est l'endroit où l'on
           repère une ligne fausse, il doit donc y mener. */
        expense: e as Expense | undefined,
      }));

    /* Les avoirs du mois — l'entrée dit son porteur, la sortie aussi : « être
       retracé », c'est pouvoir répondre « c'est l'avoir de qui ? » en lisant. */
    const avoirs = avoirsMouvements(name, (mk) => mk === month).map((m) => ({
      date: m.date,
      label: m.kind === 'depot' ? `Avoir versé · ${porteurDe(m)}` : `Avoir remboursé · ${porteurDe(m)}`,
      sub: [m.method, m.note].filter(Boolean).join(' · ') || 'Comptes & Avoirs',
      delta: m.kind === 'depot' ? m.amountXof : -m.amountXof,
      invoiceId: undefined as string | undefined,
      expense: undefined as Expense | undefined,
    }));

    /* LE COFFRE MANQUAIT À L'APPEL — 21 août 2026. `boxBalanceWhere` retranche
       les versements au coffre depuis le 17 août, mais aucune ligne ne les
       disait : dès qu'un dépôt nommait la caisse dans le mois affiché,
       « solde au début + mouvements » ne tombait plus sur le solde affiché —
       exactement ce que le commentaire d'en-tête annonce comme impossible.
       Le relevé et le solde lisent désormais la même chose. */
    const versements = coffre
      .filter((m: CoffreMovement) => m.branchId === branch.id && m.kind === 'depot'
        && m.cashbox === name && monthKey(m.date) === month)
      .map((m: CoffreMovement) => ({
        date: m.date,
        label: 'Versé au coffre',
        sub: [m.note, 'Le Coffre'].filter(Boolean).join(' · '),
        delta: -m.amountXof,
        invoiceId: undefined as string | undefined,
        expense: undefined as Expense | undefined,
      }));

    const moves = [...inn, ...out, ...avoirs, ...versements].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return { boxCur, startBalance: boxBalanceStart(name), moves, balance: boxBalance(name) };
  };

  // Flux par catégorie (filtres caisse / catégorie + recherche)
  const flow = useMemo(() => {
    const map = new Map<string, number>();
    live
      .filter((e) => (filterCaisse === 'all' || e.cashbox === filterCaisse) && (filterCat === 'all' || e.category === filterCat) && matches(e))
      .forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + expenseTotal(e)));
    const rows = Array.from(map.entries()).map(([cat, n]) => ({ cat, n })).sort((a, b) => b.n - a.n);
    const total = rows.reduce((s, r) => s + r.n, 0);
    const max = Math.max(...rows.map((r) => r.n), 1);
    return { rows, total, max };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, filterCaisse, filterCat, q]);

  // Engagements récurrents — globaux, hors période : ils courent tant qu'ils vivent.

  const catNames = categories.map((c) => c.name);
  const subsOf = (cat: string) => categories.find((c) => c.name === cat)?.subs ?? [];

  // — Persistance —
  const patch = (id: string, fn: (e: Expense) => Expense) => setExpenses((prev) => prev.map((e) => (e.id === id ? fn(e) : e)));
  const stop = (e: Expense) => patch(e.id, (x) => ({ ...x, stopped: true }));
  const revive = (e: Expense) => patch(e.id, (x) => ({ ...x, stopped: false, flagged: false }));
  const togglePause = (e: Expense) => patch(e.id, (x) => ({ ...x, paused: !x.paused }));

  const openFor = (cashbox?: string) => {
    setSaveErr(null);
    setEditingId(null);
    setForm({ label: '', amount: '', category: catNames[0] ?? '', subcategory: '', cashbox: cashbox ?? branchBoxes[0]?.name ?? '', recurring: '', date: todayISO(), flagged: false, items: [], sources: [] });
    setOpen(true);
  };
  const openEdit = (e: Expense) => {
    setSaveErr(null);
    setEditingId(e.id);
    setForm({
      label: e.label, amount: String(e.amountXof), category: e.category, subcategory: e.subcategory ?? '',
      cashbox: e.cashbox, recurring: e.recurring ?? '', date: e.date, flagged: !!e.flagged,
      items: e.items ? e.items.map((it) => ({ ...it })) : [],
      sources: e.sources ? e.sources.map((s) => ({ ...s })) : [],
    });
    setOpen(true);
  };

  /* ── L'ARGENT A UN NOM — 21 août 2026 ──────────────────────────────
     « Je veux voir le revenu de quelle cliente je suis en train de dépenser.
     Quand j'ai entamé un autre revenu, le savoir aussi. »

     LES REVENUS QU'ON PEUT DÉSIGNER — ceux de la MÊME caisse, qui ont encore
     du reste, du plus ancien au plus récent (une dépense d'aujourd'hui puise
     presque toujours dans ce qui dort depuis le plus longtemps).

     LES POURBOIRES N'EN SONT PAS. Ils entrent au tiroir sans appartenir à la
     Maison — c'est l'argent des mains. Les proposer reviendrait à offrir de
     dépenser la part de l'équipe. */
  const registre = useRegistreEncaissements();
  const dejaPris = useMemo(
    () => partsPrisesParRevenu(expenses, editingId ?? undefined),
    [expenses, editingId],
  );
  const revenusDeLaCaisse = useMemo(() => {
    if (!form.cashbox) return [];
    return registre
      .filter((r) => r.kind !== 'pourboire' && (r.cashbox ?? '') === form.cashbox
        && form.cashbox !== CAISSE_POURBOIRES)
      .map((r) => ({ r, reste: r.amountXof - (dejaPris.get(r.id) ?? 0) }))
      .filter(({ r, reste }) => reste > 0 || form.sources.some((s) => s.ref === r.id))
      .sort((a, b) => (a.r.date < b.r.date ? -1 : a.r.date > b.r.date ? 1 : 0));
  }, [registre, dejaPris, form.cashbox, form.sources]);

  /* CHANGER DE CAISSE VIDE LES DÉSIGNATIONS : les revenus d'un tiroir ne
     paient pas les sorties d'un autre, et garder des liens devenus étrangers
     ferait mentir la ligne de provenance. */
  const changeLaCaisse = (nom: string) =>
    setForm((f) => (f.cashbox === nom ? f : { ...f, cashbox: nom, sources: [] }));
  const changeLaPart = (ref: string, xof: number) =>
    setForm((f) => ({ ...f, sources: f.sources.map((s) => (s.ref === ref ? { ...s, xof: Math.max(0, xof) } : s)) }));

  // — Lignes d'articles imputés au même achat —
  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, { id: uid(), label: '', amountXof: 0 }] }));
  const patchItem = (id: string, fn: (it: ExpenseItem) => ExpenseItem) =>
    setForm((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? fn(it) : it)) }));
  const removeItem = (id: string) => setForm((f) => ({ ...f, items: f.items.filter((it) => it.id !== id) }));
  // Total saisi = somme des lignes si présentes, sinon le montant simple.
  const cleanItems = form.items.filter((it) => it.label.trim() && it.amountXof > 0);
  const formTotal = cleanItems.length ? cleanItems.reduce((s, it) => s + it.amountXof, 0) : parseInt(form.amount || '0', 10);

  /* Ce qui est déjà nommé, et ce qui reste à nommer — le compte que la modale
     affiche sous le sélecteur. Déclarés APRÈS `formTotal` : les lire plus haut
     touchait une constante non encore initialisée. */
  const designeXof = form.sources.reduce((s, x) => s + x.xof, 0);
  const resteADesigner = Math.max(0, formTotal - designeXof);

  /* LES PARTS SUIVENT LE MONTANT. Baisser le montant d'une dépense (ou retirer
     un article) laissait des parts plus grandes que la dépense elle-même : le
     revenu de la cliente restait grevé de la différence. Ce qui dépasse est
     rendu, en cascade, dans l'ordre où les revenus ont été désignés. On ne
     REMONTE jamais tout seul, en revanche : rendre est une correction, prendre
     davantage serait un geste — il appartient à la main. */
  useEffect(() => {
    setForm((f) => {
      let reste = formTotal;
      const ajustees = f.sources
        .map((s) => { const part = Math.min(s.xof, Math.max(0, reste)); reste -= part; return { ...s, xof: part }; })
        .filter((s) => s.xof > 0);
      const inchange = ajustees.length === f.sources.length
        && ajustees.every((s, i) => s.xof === f.sources[i].xof);
      return inchange ? f : { ...f, sources: ajustees };
    });
  }, [formTotal]);

  /* COCHER PREND CE QU'IL FAUT, PAS PLUS. Le remplissage en cascade : le revenu
     coché donne le minimum entre ce qu'il lui reste et ce qui manque encore à
     la dépense. Décocher rend tout. */
  const basculeRevenu = (ref: string) => {
    const ligne = revenusDeLaCaisse.find((x) => x.r.id === ref);
    if (!ligne) return;
    setForm((f) => {
      if (f.sources.some((s) => s.ref === ref)) {
        return { ...f, sources: f.sources.filter((s) => s.ref !== ref) };
      }
      const dejaIci = f.sources.reduce((s, x) => s + x.xof, 0);
      /* CE QUI MANQUE, ET RIEN DE PLUS. Il y avait ici un repli « si rien ne
         manque, prends tout le revenu » — pensé pour le cas où le montant
         n'était pas encore saisi. Il faisait exactement le contraire de ce
         qu'il faut : cocher avant de taper le montant vidait le revenu de la
         cliente (3 000 F dépensés, 40 000 F déclarés pris, « épuisé » partout
         ailleurs). Sans montant, il n'y a rien à nommer — on attend. */
      const manque = Math.max(0, formTotal - dejaIci);
      const dispo = ligne.r.amountXof - (dejaPris.get(ref) ?? 0);
      const part = Math.min(dispo, manque);
      if (part <= 0) return f;
      return {
        ...f,
        /* Le nom et la date sont FIGÉS ici — le registre vit, l'histoire non. */
        sources: [...f.sources, {
          ref, nom: ligne.r.clientName, date: ligne.r.date, xof: part, clientId: ligne.r.clientId,
        }],
      };
    });
  };

  /* UN BOUTON QUI REFUSE DOIT DIRE POURQUOI.
     `save` renvoyait en silence dès qu'un champ manquait : l'écran ne bougeait
     pas, la modale restait ouverte, et rien ne disait ce qui clochait — on
     croyait le bouton cassé. Pire, il exigeait une CAISSE alors qu'une Maison
     qui n'en a encore déclaré aucune n'a rien à choisir : la dépense devenait
     tout simplement impossible à enregistrer (constaté le 11 août sur les
     salaires d'août). La caisse est donc facultative — sans elle, la dépense
     se range sous « Autres », ce que l'affichage sait déjà faire. */
  const save = () => {
    const items = cleanItems;
    const hasItems = items.length > 0;
    const amountXof = hasItems ? items.reduce((s, it) => s + it.amountXof, 0) : parseInt(form.amount || '0', 10);
    if (!form.label.trim()) { setSaveErr('Il manque le bénéficiaire — qui a reçu cet argent ?'); return; }
    if (!amountXof) {
      setSaveErr(hasItems
        ? 'Les articles saisis totalisent zéro — donnez un libellé et un montant à chacun.'
        : 'Il manque le montant.');
      return;
    }
    setSaveErr(null);
    /* Les revenus désignés : on ne garde que les parts réelles. Une part à zéro
       (cochée puis vidée à la main) n'est pas une provenance — c'est un lien
       qui ne dit rien, et il vaut mieux ne rien dire. */
    const sources = form.sources.filter((s) => s.xof > 0);
    const dits = sources.length ? sources : undefined;
    if (editingId) {
      setExpenses((prev) => prev.map((e) => (e.id === editingId ? {
        ...e, label: form.label.trim(), amountXof, date: form.date || e.date, cashbox: form.cashbox,
        category: form.category || 'Divers', subcategory: form.subcategory || undefined,
        recurring: form.recurring || null, flagged: form.flagged || undefined,
        items: hasItems ? items : undefined, sources: dits,
      } : e)));
    } else {
      const e: Expense = {
        id: uid(), branchId: branch.id, label: form.label.trim(), amountXof,
        date: form.date || todayISO(), cashbox: form.cashbox, category: form.category || 'Divers',
        subcategory: form.subcategory || undefined, recurring: form.recurring || null,
        flagged: form.flagged || undefined, items: hasItems ? items : undefined, sources: dits,
      };
      setExpenses((prev) => [e, ...prev]);
    }
    setOpen(false);
  };
  const removeExpense = (e: Expense) => {
    if (!window.confirm(`Supprimer la dépense « ${e.label} » (${fmtMoney(expenseTotal(e), currency)}) ? Cette action est définitive.`)) return;
    setExpenses((prev) => prev.filter((x) => x.id !== e.id));
  };

  /* ── LA LIGNE DE PROVENANCE ─────────────────────────────────────────
     De qui vient l'argent qu'on vient de dépenser. Muette sur une dépense
     sans revenu désigné : l'historique ne se remplit pas tout seul, et
     inventer une provenance ferait lire une histoire fausse en croyant lire
     la vraie.

     Le nom vient de la SOURCE (figé à l'enregistrement), pas du registre du
     jour : une facture annulée ou une fiche renommée ne réécrit pas ce qui a
     été payé. Le registre ne sert qu'à dire ce qu'il RESTE — chiffre vivant,
     par nature. */
  const partsToutes = useMemo(() => partsPrisesParRevenu(expenses), [expenses]);
  const revenuParRef = useMemo(() => new Map(registre.map((r) => [r.id, r])), [registre]);

  const Provenance = ({ dep }: { dep: Expense }) => {
    const sources = sourcesDe(dep);
    if (sources.length === 0) return null;
    const sansNom = partNonNommee(dep);
    return (
      <div className="trf-prov">
        <div className="trf-prov__titre">Payée par</div>
        {sources.map((s) => {
          const neuf = entameLeRevenu(expenses, dep, s.ref);
          const rev = revenuParRef.get(s.ref);
          const reste = rev ? rev.amountXof - (partsToutes.get(s.ref) ?? 0) : null;
          return (
            <div className="trf-prov__ligne" key={s.ref}>
              <span className={`trf-prov__puce ${neuf ? 'is-neuf' : ''}`} />
              <span className="trf-prov__nom">
                <b>{s.nom}</b>
                <span className="trf-prov__quand">· versement du {fmtDay(s.date)}</span>
                {neuf && <span className="trf-prov__tag">revenu entamé</span>}
              </span>
              {reste != null && (
                <span className="trf-prov__reste">
                  {reste <= 0 ? 'épuisé' : `reste ${fmtMoney(reste, currency)}`}
                </span>
              )}
              <span className="trf-prov__xof">{fmtMoney(s.xof, currency)}</span>
            </div>
          );
        })}
        {sansNom > 0 && (
          <div className="trf-prov__ligne trf-prov__ligne--muette">
            <span className="trf-prov__puce" style={{ background: 'transparent', border: '1px dashed var(--line)' }} />
            <span className="trf-prov__nom">Part sans nom — aucun revenu désigné</span>
            <span className="trf-prov__xof">{fmtMoney(sansNom, currency)}</span>
          </div>
        )}
      </div>
    );
  };

  // — Catégories : ajouter / renommer / supprimer, avec réétiquetage des dépenses —
  const addCategory = (): string | null => {
    const name = window.prompt('Nom de la nouvelle catégorie de dépense');
    if (name && name.trim() && !catNames.includes(name.trim())) {
      setCategories((prev) => [...prev, { id: uid(), name: name.trim(), subs: [] }]);
      return name.trim();
    }
    return null;
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
    setBoxForm({ name: '', sub: 'Caisse manuelle', glyph: '◈', opening: '', currency: '' });
    setBoxOpen(true);
  };
  const openEditBox = (c: Cashbox) => {
    setBoxEditingId(c.id);
    setBoxForm({ name: c.name, sub: c.sub, glyph: c.glyph || '◈', opening: String(c.openingXof), currency: c.currency ?? '' });
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
      setCashboxes((prev) => prev.map((b) => (b.id === boxEditingId ? { ...b, name, sub, glyph, openingXof: opening, currency: boxForm.currency || undefined } : b)));
      if (oldName && oldName !== name) {
        /* RENOMMER NE DOIT ORPHELINER PERSONNE — 21 août 2026. Le nom de la
           caisse EST la clé : il n'y a pas d'identifiant partagé entre une
           caisse et ses écritures. On réétiquetait la dépense et la facture,
           mais pas le JOURNAL DES VERSEMENTS — or c'est lui, et lui seul, que
           `boxCredit` interroge pour bâtir le solde. Renommer « Caisse
           principale » faisait donc tomber son solde de tout ce qu'elle avait
           encaissé, sans un mot. Le coffre et les avoirs, arrivés depuis,
           avaient le même angle mort. Tout ce qui nomme une caisse suit. */
        setExpenses((prev) => prev.map((e) => (e.cashbox === oldName ? { ...e, cashbox: name } : e)));
        setInvoices((prev) => prev.map((i) => {
          const pieceARenommer = i.cashbox === oldName;
          const journalARenommer = (i.payments ?? []).some((p) => p.cashbox === oldName);
          if (!pieceARenommer && !journalARenommer) return i;
          return {
            ...i,
            ...(pieceARenommer ? { cashbox: name } : {}),
            ...(journalARenommer
              ? { payments: i.payments!.map((p) => (p.cashbox === oldName ? { ...p, cashbox: name } : p)) }
              : {}),
          };
        }));
        setCoffre((prev) => prev.map((m) => (m.cashbox === oldName ? { ...m, cashbox: name } : m)));
        setCreditMvts((prev) => prev.map((m) => (m.cashbox === oldName ? { ...m, cashbox: name } : m)));
        if (filterCaisse === oldName) setFilterCaisse(name);
      }
    } else {
      setCashboxes((prev) => [...prev, { id: uid(), branchId: branch.id, name, sub, glyph, openingXof: opening, currency: boxForm.currency || undefined }]);
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
  /* — Budgets : créer / modifier / supprimer via une vraie modale (les
     window.prompt laissaient passer des catégories inexistantes et rendaient
     toute enveloppe immuable une fois créée). Une enveloppe par catégorie. */
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetEditingId, setBudgetEditingId] = useState<string | null>(null);
  const [budgetForm, setBudgetForm] = useState<{ category: string; amount: string }>({ category: '', amount: '' });
  const branchBudgets = budgets.filter((b) => b.branchId === branch.id);
  const openNewBudget = () => {
    setBudgetEditingId(null);
    const free = catNames.find((n) => !branchBudgets.some((b) => b.category === n)) ?? '';
    setBudgetForm({ category: free, amount: '' });
    setBudgetOpen(true);
  };
  const openEditBudget = (id: string) => {
    const b = branchBudgets.find((x) => x.id === id);
    if (!b) return;
    setBudgetEditingId(id);
    setBudgetForm({ category: b.category, amount: String(b.monthlyXof) });
    setBudgetOpen(true);
  };
  const saveBudget = () => {
    const n = parseInt(budgetForm.amount.replace(/[^0-9]/g, ''), 10) || 0;
    if (!budgetForm.category || n <= 0) return;
    if (budgetEditingId) {
      setBudgets((prev) => prev.map((b) => (b.id === budgetEditingId ? { ...b, category: budgetForm.category, monthlyXof: n } : b)));
    } else {
      /* Une enveloppe existe déjà pour cette catégorie → on la met à jour plutôt
         que d'en créer une deuxième qui rendrait le « reste » illisible. */
      const existing = branchBudgets.find((b) => b.category === budgetForm.category);
      if (existing) setBudgets((prev) => prev.map((b) => (b.id === existing.id ? { ...b, monthlyXof: n } : b)));
      else setBudgets((prev) => [...prev, { id: uid(), branchId: branch.id, category: budgetForm.category, monthlyXof: n }]);
    }
    setBudgetOpen(false);
  };
  const deleteBudget = () => {
    if (!budgetEditingId) return;
    const b = branchBudgets.find((x) => x.id === budgetEditingId);
    if (!b || !window.confirm(`Retirer l'enveloppe « ${b.category} » (${fmtMoney(b.monthlyXof, currency)}/mois) ? Les dépenses ne bougent pas.`)) return;
    setBudgets((prev) => prev.filter((x) => x.id !== budgetEditingId));
    setBudgetOpen(false);
  };
  const spentOfCat = (cat: string) => live.filter((e) => e.category === cat).reduce((s, e) => s + expenseTotal(e), 0);
  // Historique d'une enveloppe : dépensé (vivant) sur les 3 derniers mois, mois choisi inclus.
  const historyOfCat = (cat: string) =>
    lastMonths(month, 3).map((mk) => ({
      mk,
      n: expenses
        .filter((e) => e.branchId === branch.id && !e.stopped && e.category === cat && monthKey(e.date) === mk)
        .reduce((s, e) => s + expenseTotal(e), 0),
    }));

  // — Export CSV du mois sélectionné —
  const csvAmt = (xof: number) => convertFromXof(xof, currency).toFixed(2).replace('.', ',');
  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Libellé', 'Date', 'Caisse', 'Catégorie', 'Sous-catégorie', 'Articles', `Montant (${currency})`],
      /* `monthExp` est déjà rangé par date — l'export et l'écran disent
         désormais la même chose, dans le même ordre. */
      ...monthExp
        .map((e) => [
          e.label, e.date, e.cashbox, e.category, e.subcategory ?? '',
          (e.items ?? []).map((it) => `${it.label} (${csvAmt(it.amountXof)})`).join(' + '),
          csvAmt(expenseTotal(e)),
        ]),
    ];
    downloadCsv(`depenses-${month}.csv`, rows);
  };

  /* Un chiffre s'ouvre sur les dépenses qui le composent. Toujours cliquable,
     même à zéro : la modale dit alors POURQUOI c'est zéro, ce qu'une carte morte
     ne ferait pas. */
  const kpiCard = (l: string, v: string, a: string, col: string, c: string, cCls = '', open?: () => void) => {
    const inner = (
      <>
        <div className="l">{l}</div>
        <div className="v" style={{ color: col }}>{v}</div>
        <div className={`c ${cCls}`}>{c}</div>
      </>
    );
    return open ? (
      <button className="trf-kpi trf-kpi--click" style={{ '--accent': a } as CSSProperties} onClick={open} title="Voir le détail">
        {inner}
      </button>
    ) : (
      <div className="trf-kpi" style={{ '--accent': a } as CSSProperties}>{inner}</div>
    );
  };

  const expRatio = revenue > 0 ? Math.round((engaged / revenue) * 100) : 0;
  const net = revenue - engaged;
  const allocated = branchBudgets.reduce((s, b) => s + b.monthlyXof, 0);

  // Onglets avec leur total — le poids de chaque vue se lit avant d'y entrer.
  const TABS: [Tab, string, string][] = [
    ['flux', 'Le flux', fmtMoney(engaged, currency)],
    ['caisses', 'Les caisses', fmtMoney(treasury, currency)],
    ['argent', 'Où va l’argent', `${beneficiaires(depensesDeLAnnee).length} bénéficiaires`],
    ['budgets', 'Budgets & prévision', allocated ? fmtMoney(allocated, currency) : '—'],
  ];

  return (
    <div className="mnd-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Finances · maîtrise des dépenses</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}>Les dépenses.</h2>
        </div>
        {/* L'EN-TÊTE NE PORTE PLUS DE CHIFFRE — 22 août 2026. « Économies
            réalisées » y trônait en grand, à zéro onze mois sur douze, et le
            même montant se répétait plus bas dans les cartes. Un titre d'écran
            annonce l'écran ; les chiffres vivent dans les cartes, une fois. */}
        <button className="trf-act" style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)', padding: '12px 18px' }} onClick={() => openFor()}>
          + Ajouter une dépense
        </button>
      </div>

      {/* Période explicite + recherche + export — la barre d'outils de l'écran */}
      <div className="trf-toolbar">
        <MonthNav month={month} onChange={setMonth} />
        <input
          className="mnd-input trf-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une dépense (libellé, catégorie, article…)"
          aria-label="Rechercher une dépense"
        />
        <button className="trf-act" onClick={exportCsv} title="Télécharger les dépenses du mois en CSV">Exporter (CSV)</button>
      </div>

      <div className="trf-tabs">
        {TABS.map(([k, label, sum]) => (
          <button key={k} className={`trf-tab ${tab === k ? 'is-active' : ''}`} onClick={() => setTab(k)}>
            {label}
            <span className="trf-tab__sum">{sum}</span>
          </button>
        ))}
      </div>

      {/* ============ LE FLUX ============ */}
      {tab === 'flux' && (
        <div>
          {/* ── L'ÉCRAN S'ALLÈGE — 22 août 2026 ────────────────────────
              « L'intelligence mise en marche ne sert à rien et ne fait
              qu'alourdir l'UI. »

              Ce qu'il y avait ici : un bandeau sombre annonçant en toutes
              lettres qu'il n'avait rien trouvé (« 0 F d'économies possibles —
              0 engagement à arbitrer »), puis QUATRE cartes dont deux à zéro
              onze mois sur douze, et deux portant LE MÊME nombre — les
              dépenses engagées et le total du mois clos sont la même chose.
              Cinq chiffres pour en dire deux.

              LA RÈGLE MAINTENANT : une carte ne paraît que si elle a quelque
              chose à dire. Un mois calme n'en montre qu'une ; un mois qui
              demande un arbitrage la fait apparaître, en cuivre, sans prêter
              de flair à personne — ce sont TES signalements, pas ceux d'une
              intelligence. */}
          {(() => {
            const cartes: { k: string; n: ReactNode }[] = [];

            cartes.push({
              k: 'total',
              n: kpiCard(
                `Dépenses · ${monthName}`, fmtMoney(engaged, currency),
                'var(--color-indigo)', 'var(--color-indigo)',
                revenue > 0 ? `${expRatio} % du revenu · cible < 35 %` : 'aucun revenu ce mois-ci', '',
                () => openExp(`Dépenses · ${monthName}`, 'Toutes les dépenses vivantes du mois — les dépenses stoppées en sont exclues.', live),
              ),
            });

            /* La prévision n'a de sens que sur un mois EN COURS : sur un mois
               clos, elle répète le total au franc près. */
            if (isCurrent) {
              cartes.push({
                k: 'prevision',
                n: kpiCard(
                  'Prévision · fin de mois', fmtMoney(forecast, currency),
                  'var(--indigo-400)', 'var(--color-indigo)', forecastNote, '',
                  () => openExp('Prévision · fin de mois',
                    'Projection au rythme réel : ces dépenses, rapportées aux jours écoulés puis étendues au mois. Le total ci-contre est le réel à date, pas la projection.',
                    live),
                ),
              });
            }

            if (savings > 0) {
              cartes.push({
                k: 'economies',
                n: kpiCard(
                  'Économies réalisées', fmtMoney(savings, currency),
                  'var(--trf-success)', 'var(--trf-success)', `capturées en ${monthName}`, 'good',
                  () => openExp('Économies réalisées', `Les dépenses stoppées en ${monthName} — capturées, donc jamais sorties de la caisse.`, monthExp.filter((e) => e.stopped)),
                ),
              });
            }

            return (
              <div className={`tr-grid tr-grid--${cartes.length}`}>
                {cartes.map((c) => <Fragment key={c.k}>{c.n}</Fragment>)}
              </div>
            );
          })()}

          <div className="trf-panel" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10 }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Flux des dépenses · par catégorie · {monthName}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="trf-act" onClick={addCategory}>+ Catégorie</button>
                <button className="trf-act" onClick={() => setCatOpen(true)}>Gérer les catégories</button>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', marginLeft: 4 }}>
                  Total filtré <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(flow.total, currency)}</span>
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
              {flow.rows.length === 0 && (
                <div className="trf-empty">
                  {q
                    ? <>Aucune dépense de {monthName} ne répond à « {query.trim()} ».</>
                    : <>Aucune dépense pour ce filtre en {monthName}. Saisis une dépense depuis cette caisse pour la voir circuler ici.</>}
                </div>
              )}
              {flow.rows.map((b, i) => (
                <button
                  className="trf-linerow trf-linerow--click"
                  key={b.cat}
                  title="Voir les dépenses de cette catégorie"
                  onClick={() => openExp(
                    `${b.cat} · ${monthName}`,
                    filterCaisse !== 'all' ? `Les dépenses vivantes de cette catégorie, caisse « ${filterCaisse} ».` : 'Les dépenses vivantes de cette catégorie.',
                    live.filter((e) => e.category === b.cat && (filterCaisse === 'all' || e.cashbox === filterCaisse) && matches(e)),
                  )}
                >
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
                </button>
              ))}
            </div>
          </div>

          <div className="trf-panel" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Revenu vs dépenses · {monthName}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>
                Résultat net <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(net, currency)}</span>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="trf-linerow--click" title="Ouvrir la Synthèse — le détail du revenu" onClick={() => navigate('/synthese')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink)', marginBottom: 5 }}><span>Revenu</span><span>{fmtMoney(revenue, currency)}</span></div>
                <div className="trf-bar" style={{ height: 14 }}><div style={{ width: '100%', background: 'var(--color-indigo)' }} /></div>
              </button>
              <button
                className="trf-linerow--click"
                title="Voir les dépenses du mois"
                style={{ marginTop: 12 }}
                onClick={() => openExp(`Dépenses engagées · ${monthName}`, 'Toutes les dépenses vivantes du mois.', live)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink)', marginBottom: 5 }}><span>Dépenses</span><span>{fmtMoney(engaged, currency)}</span></div>
                <div className="trf-bar" style={{ height: 14 }}><div style={{ width: `${Math.min(100, revenue ? Math.round((engaged / revenue) * 100) : 100)}%`, background: 'var(--color-copper)' }} /></div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ LES CAISSES ============ */}
      {tab === 'caisses' && (
        <div>
          <div className="trf-obsidian" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 16 }}>
            <div>
              <div className="trf-obsidian__eyebrow">Trésorerie disponible · toutes caisses · {isCurrent ? 'à ce jour' : `fin ${monthName}`}</div>
              <div className="trf-obsidian__value">{fmtMoney(treasury, currency)}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flex: 'none' }}>
              <button className="trf-act" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)', padding: '12px 16px' }} onClick={openNewBox}>+ Nouvelle caisse</button>
              {/* LE PAIEMENT RÉCURRENT VIENT ICI — 22 août 2026. Il vivait dans
                  l'onglet Engagements, retiré ce jour ; c'était son seul geste
                  utile. Sa place est auprès des caisses : on programme une
                  échéance en regardant ce qu'on a. */}
              <button className="trf-act" style={{ color: 'var(--color-ivoire)', borderColor: 'var(--hairline-invert)', padding: '12px 16px' }} onClick={() => openFor()}>+ Paiement récurrent</button>
              <button className="trf-act" style={{ background: 'var(--color-copper)', color: 'var(--color-ivoire)', borderColor: 'var(--color-copper)', padding: '12px 16px' }} onClick={() => openFor()}>+ Ajouter une dépense</button>
            </div>
          </div>

          <div className="tr-grid tr-grid--3">
            {branchBoxes.map((c) => {
              const bal = boxBalance(c.name);
              const boxCur = cashboxCurrency(c);
              /* Le seuil « bas » est pensé en francs : l'appliquer à 100 000 € n'aurait
                 aucun sens, on ne l'affiche donc que sur les caisses de la maison. */
              const low = boxCur === currency && bal < 100000;
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
                  {/* Le solde s'ouvre : un chiffre ne vaut que si l'on peut voir
                      les mouvements qui l'ont fait. */}
                  <button className="trf-caisse__open" onClick={() => setBoxDrill(c.name)} title="Voir les mouvements de cette caisse">
                    <div style={{ fontFamily: 'var(--font-sans)', fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                      Solde · {isCurrent ? 'à ce jour' : `fin ${monthName}`}{boxCur !== currency ? ` · ${boxCur}` : ''}
                    </div>
                    <div className="trf-caisse__bal" style={{ color: low ? 'var(--trf-warning)' : 'var(--color-indigo)' }}>{fmtIn(bal, boxCur)}</div>
                    {(() => {
                      const { inn, out } = boxMonthFlux(c.name);
                      return (
                        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10.5, marginTop: 4, display: 'flex', gap: 10, fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ color: 'var(--trf-success)' }}>+ {fmtIn(inn, boxCur)}</span>
                          <span style={{ color: 'var(--color-copper)' }}>− {fmtIn(out, boxCur)}</span>
                          <span style={{ color: 'var(--ink-soft)' }}>en {monthName}</span>
                        </div>
                      );
                    })()}
                  </button>
                  <button className="trf-act" style={{ padding: 9 }} onClick={() => openFor(c.name)}>Dépenser d’ici</button>
                </div>
              );
            })}
          </div>

          <div className="trf-panel" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Dépenses saisies · {monthName}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums' }}>
                {visibleMonthExp.length}{q ? ` / ${monthExp.length}` : ''} · {fmtMoney(visibleMonthExp.reduce((s, e) => s + expenseTotal(e), 0), currency)}
              </div>
            </div>
            {visibleMonthExp.length === 0 && (
              <div className="trf-empty">
                {q
                  ? <>Aucune dépense de {monthName} ne répond à « {query.trim()} ».</>
                  : <>Aucune dépense saisie en {monthName}. « Ajouter une dépense » l’enregistre ici et débite la caisse choisie.</>}
              </div>
            )}
            {visibleMonthExp.map((e) => (
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
                  <button className="trf-tagbox trf-tagbox--btn" title="Voir les mouvements de cette caisse" onClick={() => setBoxDrill(e.cashbox)}>{e.cashbox}</button>
                  <span className="trf-exprow__amt">{fmtMoney(expenseTotal(e), currency)}</span>
                  <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
                    <button className="trf-act trf-act--ghost" onClick={() => openEdit(e)}>Modifier</button>
                    {/* « SIGNALER » A ÉTÉ RETIRÉ — 22 août 2026. Le signal ne
                        se lisait plus nulle part depuis que l'arbitrage a quitté
                        l'écran : un bouton dont l'effet est invisible ment. */}
                    {!e.stopped ? (
                      <button className="trf-act trf-act--stop" onClick={() => stop(e)}>Suspendre</button>
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
                <Provenance dep={e} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* L'ONGLET ENGAGEMENTS A ÉTÉ RETIRÉ — 22 août 2026.
          « Cette page ne me sert à rien », et « je ne fais rien de tout cela,
          Signalées à arbitrer ». Il portait un mécanisme entier — signaler une
          dépense, l'approuver, suspendre tout l'évitable, lire un « potentiel
          d'économie » — que la Maison n'a jamais employé. Son seul geste vivant
          était le bouton « + Paiement récurrent », remonté sous les caisses.
          Les dépenses récurrentes restent visibles dans la liste, avec leur
          mention « mensuel » ou « hebdomadaire ». Le champ `flagged` survit au
          modèle, intact : aucune donnée n'est perdue, et l'onglet reviendrait
          en quelques lignes si la Maison changeait d'avis. */}

      {/* ============ OÙ VA L'ARGENT ============ */}
      {tab === 'argent' && (
        <div className="tr-cols" style={{ '--cols': '1fr 1fr', gap: 18, alignItems: 'start' } as CSSProperties}>

          {/* ── À QUI LA MAISON PAIE ─────────────────────────────────
              Sur DOUZE MOIS : sur un seul, la réponse n'est que le hasard du
              mois. C'est l'horizon où « à qui je paie le plus » a un sens. */}
          <div className="trf-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>À qui la Maison paie</div>
              <span className="mnd-muted" style={{ fontSize: 11.5 }}>12 mois jusqu’à {monthName}</span>
            </div>
            {(() => {
              const rangs = beneficiaires(depensesDeLAnnee).filter((b) => !q || normName(b.nom).includes(normName(q)));
              if (rangs.length === 0) {
                return <div className="trf-empty" style={{ marginTop: 12 }}>Aucune dépense sur les douze derniers mois.</div>;
              }
              const haut = rangs[0].total || 1;
              return (
                <div style={{ marginTop: 12 }}>
                  {rangs.slice(0, 15).map((b) => (
                    <button
                      type="button"
                      key={b.nom}
                      className="trf-benef"
                      title={`Voir les ${b.n} ligne(s) de ${b.nom}`}
                      onClick={() => openExp(b.nom, `Tout ce qui est parti chez ${b.nom} sur douze mois.`,
                        depensesDeLAnnee.filter((e) => normName(beneficiaireDe(e.label)) === normName(b.nom)))}
                    >
                      <span className="trf-benef__nom">{b.nom}</span>
                      <span className="trf-benef__n">{b.n} ligne{b.n > 1 ? 's' : ''}</span>
                      <span className="trf-benef__xof">{fmtMoney(b.total, currency)}</span>
                      <span className="trf-benef__barre"><i style={{ width: `${Math.max(2, Math.round((b.total / haut) * 100))}%` }} /></span>
                    </button>
                  ))}
                  {rangs.length > 15 && (
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 9 }}>
                      … et {rangs.length - 15} autre{rangs.length - 15 > 1 ? 's' : ''} bénéficiaire{rangs.length - 15 > 1 ? 's' : ''} plus bas dans le classement.
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── QUI A FINANCÉ CE MOIS ────────────────────────────────
              Le pendant de « L'argent a un nom » : les revenus que les
              dépenses du mois ont désignés. La part que personne n'a nommée
              se dit à côté — elle n'est pas une faute, mais elle ne doit pas
              disparaître non plus. */}
          <div className="trf-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Qui a financé {monthName}</div>
              <span className="mnd-muted" style={{ fontSize: 11.5 }}>d’après les revenus désignés</span>
            </div>
            {financeurs.lignes.length === 0 && financeurs.sansNom === 0 ? (
              <div className="trf-empty" style={{ marginTop: 12 }}>Aucune dépense en {monthName}.</div>
            ) : (
              <div style={{ marginTop: 12 }}>
                {financeurs.lignes.map((f) => (
                  <div className="trf-linerow trf-linerow--split" key={f.nom + f.date}>
                    <span>
                      {f.nom}
                      <span className="mnd-muted"> · versement du {fmtDay(f.date)}</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)' }}>
                      {fmtMoney(f.total, currency)}
                    </span>
                  </div>
                ))}
                {financeurs.sansNom > 0 && (
                  <div className="trf-linerow trf-linerow--split" style={{ opacity: .75 }}>
                    <span style={{ fontStyle: 'italic' }}>Part sans nom — aucun revenu désigné</span>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--ink-soft)' }}>
                      {fmtMoney(financeurs.sansNom, currency)}
                    </span>
                  </div>
                )}
                {financeurs.lignes.length === 0 && (
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.55 }}>
                    Aucune dépense de {monthName} ne nomme le revenu qui l’a payée. Le lien se pose
                    à la saisie, au champ « Payée par quel revenu ».
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============ BUDGETS & PRÉVISION ============ */}
      {tab === 'budgets' && (
        <div className="tr-grid tr-grid--2" style={{ alignItems: 'start' }}>
          <div className="trf-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Budget souverain · alloué vs engagé · {monthName}</div>
              <button className="trf-act" style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' }} onClick={openNewBudget}>+ Budget</button>
            </div>
            {branchBudgets.length === 0 && <div className="trf-empty">Aucun budget défini. « + Budget » ouvre une enveloppe mensuelle par catégorie.</div>}
            {branchBudgets.map((b) => {
              const spent = spentOfCat(b.category);
              const remaining = b.monthlyXof - spent;
              const over = remaining < 0;
              const spentW = Math.min(100, Math.round((spent / (b.monthlyXof || 1)) * 100));
              const col = over ? 'var(--trf-error)' : remaining < b.monthlyXof * 0.15 ? 'var(--trf-warning)' : 'var(--trf-success)';
              const hist = historyOfCat(b.category);
              const histMax = Math.max(...hist.map((h) => h.n), b.monthlyXof, 1);
              return (
                <div key={b.id} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
                    <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
                      <button
                        className="trf-rowbtn"
                        style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--ink)' }}
                        title="Voir les dépenses de cette catégorie"
                        onClick={() => openExp(`${b.category} · ${monthName}`, 'Les dépenses vivantes de cette enveloppe.', live.filter((e) => e.category === b.category))}
                      >
                        {b.category}
                      </button>
                      <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: over ? 'var(--trf-error)' : 'var(--trf-success)' }}>{over ? 'Dépassé' : 'Maîtrisé'}</span>
                      <button className="trf-iconbtn" onClick={() => openEditBudget(b.id)}>Modifier</button>
                    </div>
                    <div className="trf-spark" title="Dépensé sur les 3 derniers mois" aria-label="Historique des 3 derniers mois">
                      {hist.map((h) => (
                        <div className="trf-spark__col" key={h.mk} title={`${monthLabel(h.mk)} · ${fmtMoney(h.n, currency)}`}>
                          <div className="trf-spark__bar" style={{ height: Math.max(2, Math.round((h.n / histMax) * 20)), background: h.mk === month ? 'var(--color-copper)' : 'var(--indigo-300)' }} />
                          <span className="trf-spark__lbl">{monthShort(h.mk).slice(0, 1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="trf-bar" style={{ height: 8, marginTop: 6 }}>
                    <div style={{ width: `${spentW}%`, background: over ? 'var(--trf-error)' : 'var(--trf-success)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-sans)', fontSize: 10.5, color: 'var(--ink-soft)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                    <span>Engagé {fmtMoney(spent, currency)} · {spentW} %</span><span>Alloué {fmtMoney(b.monthlyXof, currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 6, marginTop: 3 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>{over ? 'Dépassement' : 'Reste à dépenser'}</span>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: col, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Math.abs(remaining), currency)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <div className="trf-obsidian" style={{ marginBottom: 14 }}>
              <div className="trf-obsidian__eyebrow">{isCurrent ? 'Prévision · fin de mois' : `Total du mois · ${monthName}`}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8 }}>
                <span className="trf-obsidian__value" style={{ fontSize: 36 }}>{fmtMoney(forecast, currency)}</span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: savings > 0 ? 'var(--trf-success)' : 'var(--indigo-100)' }}>
                  {savings > 0 ? `▼ ${fmtMoney(savings, currency)} déjà capturés` : 'conforme au budget'}
                </span>
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 300, fontSize: 12.5, color: 'var(--indigo-100)', marginTop: 8 }}>
                {isCurrent
                  ? 'Après arbitrage des engagements évitables, le résultat net gagne en marge.'
                  : 'Le mois est arrêté — les enveloppes ci-contre disent où il est parti.'}
              </div>
            </div>

            <div className="trf-panel">
              <div className="trf-panel__title">Dépenses par catégorie · {monthName}</div>
              {(() => {
                const map = new Map<string, number>();
                live.forEach((e) => map.set(e.category, (map.get(e.category) ?? 0) + expenseTotal(e)));
                const rows = Array.from(map.entries()).map(([cat, n]) => ({ cat, n })).sort((a, b) => b.n - a.n);
                const max = Math.max(...rows.map((r) => r.n), 1);
                if (rows.length === 0) return <div className="trf-empty">Rien à analyser en {monthName}.</div>;
                return rows.map((r, i) => (
                  <button
                    className="trf-linerow trf-linerow--click"
                    key={r.cat}
                    title="Voir les dépenses de cette catégorie"
                    onClick={() => openExp(`${r.cat} · ${monthName}`, 'Les dépenses vivantes de cette catégorie.', live.filter((e) => e.category === r.cat))}
                  >
                    <div className="trf-linerow__top">
                      <span className="trf-linerow__cat">{r.cat}</span>
                      <span className="trf-linerow__val">{fmtMoney(r.n, currency)}</span>
                    </div>
                    <div className="trf-bar" style={{ marginTop: 5 }}>
                      <div style={{ width: `${Math.round((r.n / max) * 100)}%`, background: FLOW_FILLS[i % FLOW_FILLS.length] }} />
                    </div>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ============ MODALE · NOUVELLE DÉPENSE ============ */}
      {open && (
        <Modal title={editingId ? 'Modifier la dépense.' : 'Inscrire une dépense.'} onClose={() => setOpen(false)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* ═══ LE MONTANT EST LE HÉROS — 16 août 2026, demande de Yéman :
                « quand on ouvre Ajouter une dépense, je veux le même modèle que
                Inscrire un mouvement dans Salon & Foyer ». C'est le nombre
                qu'on vient écrire : il s'affiche en grand, au centre, avant
                tout le reste. Les champs alignés à la file — bénéficiaire,
                puis montant, puis date — faisaient chercher lequel portait la
                somme. La devise est celle de la CAISSE choisie : une dépense
                prise sur la caisse en euros sort des euros du tiroir. ═══ */}
            {(() => {
              const fb = branchBoxes.find((b) => b.name === form.cashbox);
              const fCur = fb ? cashboxCurrency(fb) : currency;
              return (
                <div style={{ textAlign: 'center', paddingTop: 4 }}>
                  <div className="trc-microlabel" style={{ letterSpacing: '.2em' }}>Montant</div>
                  <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10, marginTop: 8 }}>
                    {cleanItems.length ? (
                      /* LA SOMME DES ARTICLES FAIT LOI — on ne saisit plus deux
                         vérités pour le même achat. */
                      <span style={{
                        width: 220, textAlign: 'right', display: 'inline-block',
                        borderBottom: '1px solid var(--copper-300)',
                        fontFamily: 'var(--font-serif)', fontSize: 42, color: 'var(--color-indigo)', padding: '2px 6px',
                      }}>
                        {formTotal.toLocaleString('fr-FR')}
                      </span>
                    ) : (
                      <input
                        value={form.amount}
                        onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value.replace(/[^0-9]/g, '') }))}
                        inputMode="numeric"
                        placeholder="0"
                        autoFocus
                        aria-label={`Montant en ${fCur}`}
                        style={{
                          width: 220, textAlign: 'right', background: 'transparent',
                          border: 'none', borderBottom: '1px solid var(--copper-300)',
                          fontFamily: 'var(--font-serif)', fontSize: 42, color: 'var(--color-indigo)',
                          padding: '2px 6px', outline: 'none',
                        }}
                      />
                    )}
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24, color: 'var(--copper-700)' }}>
                      {fCur === 'XOF' ? 'F' : fCur}
                    </span>
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 5 }}>
                    {cleanItems.length > 0
                      ? `somme de ${cleanItems.length} article${cleanItems.length > 1 ? 's' : ''}`
                      : ''}
                    {cleanItems.length > 0 && fCur !== currency ? ' · ' : ''}
                    {fCur !== currency ? `caisse en ${fCur}` : ''}
                  </div>
                </div>
              );
            })()}

            {/* LA QUESTION EN MOTS, comme au Salon & Foyer : on répond d'abord
                à quoi va l'argent, le reste suit. */}
            <div>
              <div className="trc-microlabel" style={{ marginBottom: 9 }}>À quoi va cet argent ?</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {catNames.map((c) => (
                  <button key={c} className={`trf-chip ${form.category === c ? 'is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, category: c, subcategory: '' }))}>{c}</button>
                ))}
              </div>
              {subsOf(form.category).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 9, paddingLeft: 2 }}>
                  {subsOf(form.category).map((c) => (
                    <button key={c} className={`trf-chip ${form.subcategory === c ? 'is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, subcategory: c }))}>{c}</button>
                  ))}
                </div>
              )}
            </div>

            <label className="mnd-field">
              <span className="mnd-field__label">Bénéficiaire</span>
              <input className="mnd-input" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex. Fournisseur · Karité Bénin" />
            </label>

            {/* LE DÉTAIL SE REPLIE — un achat simple n'a rien à détailler, et
                trois lignes de cases vides encombraient la fenêtre. */}
            <div>
              {form.items.length === 0 ? (
                <button
                  type="button"
                  onClick={addItem}
                  style={{
                    width: '100%', cursor: 'pointer', font: 'inherit', fontSize: 13,
                    border: '1px dashed var(--copper-500)', borderRadius: 3,
                    background: 'transparent', color: 'var(--copper-700)', padding: '10px 13px',
                  }}
                >
                  + Détailler cet achat (optionnel)
                </button>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
                    <span className="mnd-field__label">Articles de l’achat · {cleanItems.length}/{form.items.length}</span>
                    <button className="trf-act" onClick={addItem}>+ Ligne</button>
                  </div>
                  {/* QUANTITÉ × PRIX = TOTAL DE LIGNE — 19 août : « ajouter
                      quantité et montant pour avoir le total ». On écrivait
                      « 6 ganches * 300 » dans le libellé et on posait la
                      multiplication de tête. La quantité vide vaut 1 : un
                      article d'avant (montant seul) se relit tel quel. Le
                      total de ligne s'ÉCRIT à la saisie (amountXof = qté ×
                      prix) — c'est lui que tous les écrans somment. */}
                  <div className="trf-items">
                    {form.items.map((it) => {
                      const majTotal = (x: typeof it, qty: number | undefined, unit: number | undefined) => ({
                        ...x, qty, unitXof: unit, amountXof: Math.max(0, Math.round((qty ?? 1) * (unit ?? 0))),
                      });
                      return (
                        <div className="trf-items__row" key={it.id}>
                          <input
                            className="mnd-input" value={it.label} placeholder="Article · ex. Ganches"
                            onChange={(ev) => patchItem(it.id, (x) => ({ ...x, label: ev.target.value }))}
                            style={{ flex: 1, minWidth: 130 }}
                          />
                          <input
                            className="mnd-input" inputMode="numeric"
                            value={it.qty != null ? String(it.qty) : ''}
                            placeholder="Qté"
                            title="Quantité — vide vaut 1"
                            onChange={(ev) => patchItem(it.id, (x) => {
                              const brut = ev.target.value.replace(/[^0-9]/g, '');
                              return majTotal(x, brut === '' ? undefined : parseInt(brut, 10), x.unitXof ?? x.amountXof);
                            })}
                            style={{ flex: 'none', width: 58, textAlign: 'right' }}
                          />
                          <span className="mnd-muted" style={{ flex: 'none', fontSize: 12 }}>×</span>
                          <input
                            className="mnd-input" inputMode="numeric"
                            value={(it.unitXof ?? it.amountXof) ? String(it.unitXof ?? it.amountXof) : ''}
                            placeholder="Prix"
                            title="Prix unitaire"
                            onChange={(ev) => patchItem(it.id, (x) => {
                              const unit = parseInt(ev.target.value.replace(/[^0-9]/g, '') || '0', 10);
                              return majTotal(x, x.qty, unit);
                            })}
                            style={{ flex: 'none', width: 96, textAlign: 'right' }}
                          />
                          <span
                            style={{ flex: 'none', width: 108, textAlign: 'right', fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)' }}
                            title="Total de la ligne — quantité × prix"
                          >
                            {it.amountXof > 0 ? fmtMoney(it.amountXof, currency) : '—'}
                          </span>
                          <button className="trf-iconbtn trf-iconbtn--danger" onClick={() => removeItem(it.id)} aria-label="Retirer la ligne">×</button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 7, lineHeight: 1.5 }}>
                    Quantité × prix fait le total de la ligne ; la somme des lignes devient le montant de l’achat. Quantité vide = 1.
                  </div>
                </>
              )}
            </div>
            <div>
              <div className="mnd-field__label" style={{ marginBottom: 9 }}>Payer depuis quelle caisse</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {branchBoxes.map((c) => (
                  <button key={c.id} className={`trf-chip ${form.cashbox === c.name ? 'is-active' : ''}`} onClick={() => changeLaCaisse(c.name)}>
                    {c.name} · {fmtIn(boxBalance(c.name), cashboxCurrency(c))}
                  </button>
                ))}
                {/* La caisse est FACULTATIVE : sans elle, la dépense se range
                    sous « Autres ». L'exiger rendait la saisie impossible tant
                    qu'aucune caisse n'était déclarée. */}
                <button className={`trf-chip ${!form.cashbox ? 'is-active' : ''}`} onClick={() => changeLaCaisse('')}>
                  Sans caisse · Autres
                </button>
              </div>
              {branchBoxes.length === 0 && (
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 7 }}>
                  Aucune caisse déclarée pour cette branche — la dépense se rangera sous « Autres ».
                  Les caisses se créent dans l’onglet « Les caisses ».
                </div>
              )}
            </div>

            {/* ── PAYÉE PAR QUEL REVENU — 21 août 2026 ──────────────────
                Le sélecteur ne paraît qu'avec une caisse : hors caisse, il n'y
                a pas de tiroir où puiser, donc rien à nommer. */}
            {!!form.cashbox && (
              <div>
                <div className="mnd-field__label" style={{ marginBottom: 9 }}>Payée par quel revenu</div>
                {/* SANS MONTANT, RIEN À NOMMER — un clic ne pourrait prendre
                    qu'un chiffre inventé. On le dit au lieu de ne rien faire. */}
                {formTotal <= 0 ? (
                  <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    Indiquez d’abord le montant de la dépense — les revenus se désignent ensuite,
                    et Le Trône prend sur chacun ce qu’il faut, pas davantage.
                  </div>
                ) : revenusDeLaCaisse.length === 0 ? (
                  <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    Aucun revenu disponible dans « {form.cashbox} » — tout ce qui y est entré
                    est déjà nommé par d’autres dépenses. La dépense s’enregistre quand même :
                    sa part restera simplement sans nom.
                  </div>
                ) : (
                  <>
                    <div className="trf-revenus">
                      {revenusDeLaCaisse.map(({ r, reste }) => {
                        const prise = form.sources.find((s) => s.ref === r.id);
                        return (
                          <div key={r.id} className={`trf-revenu ${prise ? 'is-on' : ''}`}>
                            <button
                              className="trf-revenu__coche"
                              role="checkbox"
                              aria-checked={!!prise}
                              aria-label={`Désigner le revenu de ${r.clientName}`}
                              onClick={() => basculeRevenu(r.id)}
                            >
                              {prise ? '✓' : ''}
                            </button>
                            <span className="trf-revenu__nom">
                              <b>{r.clientName}</b>
                              <span className="trf-revenu__quand">
                                {fmtDay(r.date)} · {r.method}{r.kind !== 'facture' ? ` · ${r.kind}` : ''}
                              </span>
                            </span>
                            <span className="trf-revenu__reste">reste {fmtMoney(reste, currency)}</span>
                            {prise && (
                              <input
                                className="mnd-input trf-revenu__part"
                                inputMode="numeric"
                                value={prise.xof ? String(prise.xof) : ''}
                                aria-label={`Part prise sur le revenu de ${r.clientName}`}
                                onChange={(ev) => changeLaPart(r.id, parseInt(ev.target.value.replace(/[^0-9]/g, '') || '0', 10))}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="trf-revenus__compte">
                      <span>Désigné · <b>{fmtMoney(designeXof, currency)}</b></span>
                      <span>Reste à désigner · <b>{fmtMoney(resteADesigner, currency)}</b></span>
                    </div>
                    {/* L'ENTAME SE DIT AVANT D'ENREGISTRER — c'est la demande
                        même : « quand j'ai entamé un autre revenu, le savoir ».
                        Un revenu est entamé si aucune dépense n'y a encore puisé. */}
                    {(() => {
                      const neufs = form.sources.filter((s) => !dejaPris.has(s.ref));
                      if (neufs.length === 0) return null;
                      return (
                        <div className="trf-entame">
                          Cette dépense <b>{neufs.length > 1 ? 'entame les revenus' : 'entame le revenu'} de {neufs.map((s) => s.nom).join(', ')}</b>
                          {' '}— c’est la première fois que la Maison y puise.
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
            <div>
              <div className="mnd-field__label" style={{ marginBottom: 9 }}>Récurrence</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {([['', 'Ponctuel'], ['mensuel', 'Mensuel'], ['hebdomadaire', 'Hebdomadaire']] as [Form['recurring'], string][]).map(([k, label]) => (
                  <button key={label} className={`trf-chip ${form.recurring === k ? 'is-active' : ''}`} onClick={() => setForm((f) => ({ ...f, recurring: k }))}>{label}</button>
                ))}
              </div>
            </div>
            {/* LA DATE FERME LA FENÊTRE, comme au Salon & Foyer : c'est le
                dernier réglage, pas une question posée avant le montant. */}
            <label className="mnd-field">
              <span className="mnd-field__label">Date</span>
              <input className="mnd-input" type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' }}>
              {saveErr && (
                <span style={{ marginRight: 'auto', fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--trf-error)' }}>
                  {saveErr}
                </span>
              )}
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
            {/* Une caisse en devise garde des billets étrangers : elle ne reçoit
                que les règlements dans SA devise, et son solde se compte dedans. */}
            <label className="mnd-field">
              <span className="mnd-field__label">Devise détenue</span>
              <select
                className="mnd-select"
                value={boxForm.currency}
                onChange={(e) => setBoxForm((f) => ({ ...f, currency: e.target.value }))}
              >
                <option value="">{currency} · devise de la maison</option>
                {CURRENCIES.filter((c) => c.code !== currency).map((c) => (
                  <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
                ))}
              </select>
            </label>
            <label className="mnd-field">
              <span className="mnd-field__label">
                Solde d’ouverture · en {boxForm.currency || currency}
              </span>
              <input className="mnd-input" inputMode="numeric" value={boxForm.opening} onChange={(e) => setBoxForm((f) => ({ ...f, opening: e.target.value.replace(/[^0-9]/g, '') }))} placeholder="0" style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }} />
            </label>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={() => setBoxOpen(false)}>Annuler</button>
              <button className="mnd-btn" onClick={saveBox}>{boxEditingId ? 'Enregistrer' : 'Créer la caisse'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ============ MODALE · BUDGET (enveloppe mensuelle par catégorie) ============ */}
      {budgetOpen && (() => {
        const budgetAmountNum = parseInt(budgetForm.amount.replace(/[^0-9]/g, ''), 10) || 0;
        const canSaveBudget = !!budgetForm.category && budgetAmountNum > 0;
        return (
        <Modal title={budgetEditingId ? 'Modifier l’enveloppe' : 'Nouvelle enveloppe budgétaire'} onClose={() => setBudgetOpen(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div className="mnd-field__label" style={{ marginBottom: 9 }}>Catégorie de dépense</div>
              {catNames.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span className="mnd-muted" style={{ fontSize: 12 }}>Aucune catégorie de dépense — créez-en une d’abord.</span>
                  <button
                    className="trf-act"
                    onClick={() => { const n = addCategory(); if (n) setBudgetForm((f) => ({ ...f, category: n })); }}
                  >
                    + Nouvelle catégorie
                  </button>
                </div>
              ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {catNames.map((c) => {
                  const taken = branchBudgets.some((b) => b.category === c && b.id !== budgetEditingId);
                  return (
                    <button
                      key={c}
                      className={`trf-chip ${budgetForm.category === c ? 'is-active' : ''}`}
                      style={taken ? { opacity: 0.45 } : undefined}
                      title={taken ? 'Une enveloppe existe déjà — la choisir la mettra à jour' : undefined}
                      onClick={() => setBudgetForm((f) => ({ ...f, category: c }))}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              )}
            </div>
            <label className="mnd-field">
              <span className="mnd-field__label">Enveloppe mensuelle · {currency}</span>
              <input
                className="mnd-input" inputMode="numeric" value={budgetForm.amount} placeholder="0"
                onChange={(e) => setBudgetForm((f) => ({ ...f, amount: e.target.value.replace(/[^0-9]/g, '') }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </label>
            {budgetForm.category && (
              <div className="mnd-muted" style={{ fontSize: 11.5 }}>
                Engagé en {monthName} sur « {budgetForm.category} » : <b style={{ color: 'var(--color-indigo)' }}>{fmtMoney(spentOfCat(budgetForm.category), currency)}</b>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 4 }}>
              {budgetEditingId
                ? <button className="mnd-btn mnd-btn--ghost" style={{ color: 'var(--trf-error)' }} onClick={deleteBudget}>Retirer l’enveloppe</button>
                : <span />}
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="mnd-btn mnd-btn--ghost" onClick={() => setBudgetOpen(false)}>Annuler</button>
                {/* Jamais un bouton muet : désactivé tant qu'il manque la catégorie
                    ou le montant, avec la raison en infobulle. */}
                <button
                  className="mnd-btn"
                  disabled={!canSaveBudget}
                  title={canSaveBudget ? undefined : !budgetForm.category ? 'Choisissez une catégorie de dépense' : 'Saisissez un montant supérieur à zéro'}
                  onClick={saveBudget}
                >
                  {budgetEditingId ? 'Enregistrer' : 'Créer l’enveloppe'}
                </button>
              </div>
            </div>
          </div>
        </Modal>
        );
      })()}

      {expDrill && (
        <Modal title={expDrill.title} onClose={() => setExpDrill(null)} width={620}>
          <div className="mnd-muted" style={{ fontSize: 12, marginBottom: 12 }}>{expDrill.sub}</div>
          {expDrill.rows.length === 0 ? (
            <div className="trf-empty">Aucune dépense ici en {monthName}.</div>
          ) : (
            <>
              <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
                {expDrill.rows
                  .slice()
                  .sort((a, b) => (a.date < b.date ? 1 : -1))
                  .map((e) => (
                    /* LA LIGNE S'OUVRE. On arrive ici en cherchant « où sont
                       passés ces 230 000 F » — et c'est précisément là qu'on
                       voit qu'une ligne est fausse. La refermer pour aller la
                       corriger ailleurs faisait perdre le fil ; le détail rend
                       donc directement à la fiche de la dépense. */
                    <button
                      key={e.id}
                      type="button"
                      title="Modifier cette dépense"
                      onClick={() => { setExpDrill(null); openEdit(e); }}
                      style={{
                        width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
                        font: 'inherit', color: 'inherit',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
                        padding: '9px 0', borderBottom: '1px solid var(--hairline)',
                      }}
                    >
                      <div style={{ minWidth: 0, display: 'flex', gap: 10, alignItems: 'baseline' }}>
                        <span className="trf-datepill" style={{ flex: 'none' }}>{fmtDay(e.date)}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{e.label}</div>
                          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                            {e.subcategory ? `${e.category} · ${e.subcategory}` : e.category} · {e.cashbox}
                          </div>
                        </div>
                      </div>
                      <div className="mnd-serif" style={{ fontSize: 15, flex: 'none', color: 'var(--color-indigo)' }}>
                        {fmtMoney(expenseTotal(e), currency)}
                      </div>
                    </button>
                  ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-argile)' }}>
                <span style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                  Total · {expDrill.rows.length} dépense{expDrill.rows.length > 1 ? 's' : ''}
                </span>
                <span className="mnd-serif" style={{ fontSize: 24, color: 'var(--color-indigo)' }}>
                  {fmtMoney(expDrill.rows.reduce((s, e) => s + expenseTotal(e), 0), currency)}
                </span>
              </div>
            </>
          )}
        </Modal>
      )}

      {boxDrill && (() => {
        const { boxCur, startBalance, moves, balance } = boxMoves(boxDrill);
        return (
          <Modal title={`${boxDrill} · mouvements`} onClose={() => setBoxDrill(null)} width={620}>
            <div className="mnd-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              {monthName}{boxCur !== currency ? ` · caisse en ${boxCur}` : ''} — encaissements crédités (avoir déduit, pourboire inclus), dépenses vivantes débitées.
            </div>

            <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
              {/* Le point de départ du relevé : l'ouverture + TOUT l'historique
                  d'avant le mois. Sans lui, la liste ne peut pas tomber sur le
                  solde affiché en bas. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--hairline)' }}>
                <div>
                  <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>Solde au début de {monthName}</div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>ouverture + tout l’historique antérieur</div>
                </div>
                <div className="mnd-serif" style={{ fontSize: 15, color: 'var(--ink-soft)' }}>{fmtIn(startBalance, boxCur)}</div>
              </div>

              {moves.length === 0 && (
                <div className="trf-empty" style={{ marginTop: 10 }}>
                  Aucun mouvement en {monthName} — ni encaissement, ni dépense.
                </div>
              )}

              {moves.map((m, i) => {
                const body = (
                  <>
                    <div style={{ minWidth: 0, display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span className="trf-datepill" style={{ flex: 'none' }}>{fmtDay(m.date)}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{m.label}</div>
                        <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{m.sub}</div>
                      </div>
                    </div>
                    <div
                      className="mnd-serif"
                      style={{ fontSize: 15, flex: 'none', color: m.delta >= 0 ? 'var(--trv-success, var(--color-indigo))' : 'var(--color-copper)' }}
                    >
                      {m.delta >= 0 ? '+' : '−'} {fmtIn(Math.abs(m.delta), boxCur)}
                    </div>
                  </>
                );
                /* `border: none` d'abord, puis la seule bordure qu'on garde :
                   l'inverse annulerait le trait sur les lignes-boutons. */
                const rowStyle = {
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  gap: 12, padding: '9px 0',
                  width: '100%', textAlign: 'left' as const, background: 'none',
                  border: 'none', borderBottom: '1px solid var(--hairline)',
                  font: 'inherit', color: 'inherit',
                };
                /* Un encaissement s'ouvre sur sa facture, une dépense sur sa
                   fiche. Seule une ligne qui ne mène nulle part reste inerte. */
                return m.invoiceId ? (
                  <button
                    key={`${m.date}-${m.label}-${i}`}
                    style={{ ...rowStyle, cursor: 'pointer' }}
                    title="Ouvrir la facture"
                    onClick={() => { setBoxDrill(null); navigate(`/factures?id=${m.invoiceId}`); }}
                  >
                    {body}
                  </button>
                ) : m.expense ? (
                  <button
                    key={`${m.date}-${m.label}-${i}`}
                    style={{ ...rowStyle, cursor: 'pointer' }}
                    title="Modifier cette dépense"
                    onClick={() => { const e = m.expense!; setBoxDrill(null); openEdit(e); }}
                  >
                    {body}
                  </button>
                ) : (
                  <div key={`${m.date}-${m.label}-${i}`} style={rowStyle}>{body}</div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-argile)' }}>
              <span style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                Solde · {isCurrent ? 'à ce jour' : `fin ${monthName}`}
              </span>
              <span className="mnd-serif" style={{ fontSize: 24, color: 'var(--color-indigo)' }}>{fmtIn(balance, boxCur)}</span>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
