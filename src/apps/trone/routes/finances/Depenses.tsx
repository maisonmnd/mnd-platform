import { Fragment, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Eyebrow, Modal, Button, Field, Input, Select, toast } from '../../../../ds/components';
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
  usePorteurs, ajouteUnPorteur, achatsParPorteur, caisseDuPorteur, caisseParDefaut, caisseDiscrete,
  type Expense, type ExpenseItem, type Cashbox, type ExpenseCategory, type Invoice, type Budget, type PieceJointe, usePaymentMethods, caissesPourLEquipe,
  depensesComptees, aValider, estEnAttente, estRefusee, enRetard, heuresRestantes,
  heuresDattente, peutValider, doitEtreValidee, soumission, validee, refusee,
  totalEnAttenteXof, DELAI_VALIDATION_H,
  type ValidationDepense } from '../../../../shared/finance';
import { CAISSE_POURBOIRES } from '../../../../shared/receipts';
import { useStaff } from '../../../../shared/auth';
import { staffAccessStore } from '../equipe/data';
import { useStore } from '../../../../shared/store';
import { usePrets } from '../../../../shared/foyer';
import { useTransferts, transfertSurCaisse } from '../../../../shared/finance';
import { useClients, useFamilies } from '../../../../shared/clients';
import { normName, sameName } from '../../../../shared/text';
import { autoriserLaPurge } from '../../../../shared/sync';
import { fmtDay, todayISO, monthKey, monthLabel, monthShort, lastMonths, paceForecast, MonthNav, downloadCsv, useRegistreEncaissements, ChampPieceJointe } from './_shared';
import {
  lignesAvancees, soldesDesPorteurs, totalDuXof, lignesDunPorteur,
  remboursementsDunPorteur, rembourse, useRemboursements,
} from '../../../../shared/avances';
import { useMouvementsCaisse } from '../../../../shared/foyer';
import { summaryPdf } from '../../../../shared/pdf';
import { maisonNom } from '../../../../shared/identite';
import {
  useCaisses, ReleveCaisse, ContrepartieMaison, montantsDuTiroir, libelleDuMontant,
  nettoieLeMontant, nomEtSolde, useCaissesOuvertes,
} from './tiroirs';
import { RapportDeCaisse } from './Rapport';
import { useApprenants, useSubscribers } from '../equipe/data';
import { apptNetXof, useBranchAppointments, useServicesById } from '../clients/_shared';
import './finances.css';

/** Jour d'un achat, ex. « 13 juil. » — pour afficher la date de chaque dépense. */
/* `fmtDay` a rejoint `_shared` le 23 août 2026 — voir pourquoi là-bas. */

/* Dépenses — maîtrise des sorties de caisse. Flux par catégorie, caisses multiples,
   prélèvements récurrents qu'on peut arrêter sans effacer leur histoire, budgets avec
   « reste à dépenser », prévision de fin de mois. Tout est persisté et filtré par la branche.
   La période est explicite : le mois se navigue ‹ mois › et une recherche filtre les listes. */

type Tab = 'flux' | 'argent' | 'budgets';

const FLOW_FILLS = [
  'var(--color-indigo)', 'var(--color-copper)', 'var(--indigo-400)', 'var(--copper-400)',
  'var(--indigo-300)', 'var(--copper-200)', 'var(--indigo-600)', 'var(--color-argile)',
];

type Form = { label: string; amount: string; category: string; subcategory: string; cashbox: string; enDevise: string; recurring: '' | 'mensuel' | 'hebdomadaire'; date: string; flagged: boolean; items: ExpenseItem[]; sources: DepenseSource[]; fichier?: PieceJointe; porteur: string; avancee: boolean };
/** `currency` vide = la caisse tient la devise de la maison. */
type BoxForm = { name: string; sub: string; glyph: string; opening: string; currency: string; equipe: boolean };

const GLYPHS = ['◈', '❖', '✦', '❈', '◆', '✧', '⬡', '❉'];


/* Date d'un règlement (jj/mm/aaaa, ou ISO) → clé de mois « aaaa-mm ». */
const payMonthKeyLocal = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}` : (d ?? '').slice(0, 7);
};

export default function Depenses() {
  const { branch, currency } = useBranch();
  /* ══ CHACUN NE VOIT QUE SES DÉPENSES — 31 août 2026 ═══════════════
     « L'employé Kabirou ne doit voir que ces dépenses, pas les dépenses de
     tous. Les chiffres sont confidentiels et tout le monde ne doit pas savoir
     ce qui se fait » (Yéman).

     LA RÈGLE SE LIT DANS LA MATRICE, sans champ de plus : ouvrir le DOMAINE
     « Finances » donne la maison entière ; n'ouvrir que l'ÉCRAN « Dépenses »
     donne les siennes seulement. C'est exactement la distinction qu'il
     fallait, et elle se pose déjà d'un clic dans Accès & personnel.

     FILTRER LA LISTE NE SUFFIRAIT PAS. Les totaux du haut, la part des
     salaires, les budgets, « Où va l'argent » : tout se calcule depuis ce
     tableau. On restreint donc À LA SOURCE, et chaque chiffre de l'écran suit
     sans qu'on ait à y penser — c'est la seule façon de ne rien oublier.

     LE LIEN EST LE NOM DU PORTEUR, comparé comme partout ailleurs
     (`sameName`, celui des mains et des commissions). Sans porteur, une
     dépense n'est à personne : elle reste à la Maison, donc invisible pour un
     compte restreint. */
  const monProfil = useStaff();
  const accesTous = useStore(staffAccessStore)[0];
  const mesDomaines = accesTous[monProfil?.user_id ?? ''] ?? {};
  const voitToutesLesDepenses = monProfil?.role !== 'maitre' || mesDomaines.finances === true;
  const monNom = (monProfil?.name ?? '').trim();

  const [toutesLesDepenses, setExpenses] = useExpenses();
  /* Ce que ce compte a le DROIT de voir, en attente comprise. */
  const siennes = useMemo(
    () => (voitToutesLesDepenses
      ? toutesLesDepenses
      /* SON NOM DE PORTEUR, OU SA SIGNATURE DE SOUMISSION — 31 août 2026.
         Les deux, car ce qu'il a soumis ne doit jamais lui échapper : une
         dépense saisie sans porteur, ou dont le porteur a été corrigé, se
         serait effacée de son écran alors qu'elle attend encore sa réponse. */
      : toutesLesDepenses.filter((e) => (!!e.porteur && sameName(e.porteur, monNom))
        || (!!e.validation && sameName(e.validation.soumisPar, monNom)))),
    [toutesLesDepenses, voitToutesLesDepenses, monNom],
  );

  /* ══ CE QUI ATTEND UN OUI N'EST PAS UNE DÉPENSE — 31 août 2026 ═════
     « À chaque fois qu'un employé émet une dépense il doit recevoir un bouton
     valider d'un souverain. Sinon tout le monde marquerait ce qu'il a envie de
     marquer » (Yéman).

     DEUX LISTES, ET UNE SEULE COMPTE. `expenses` porte ce qui existe : totaux,
     budgets, bénéficiaires, ratio du revenu, prévision, export. `enAttente`
     porte ce qui demande une décision, et ne sert qu'à l'affichage.

     ON SÉPARE ICI, PAS PLUS BAS. Tous les chiffres de l'écran se dérivent de
     `expenses` ; un seul dérivé oublié aurait fait entrer dans les comptes ce
     que personne n'a regardé. */
  const expenses = useMemo(() => depensesComptees(siennes), [siennes]);
  const enAttente = useMemo(() => aValider(siennes, branch.id), [siennes, branch.id]);
  const refusees = useMemo(() => siennes.filter(estRefusee), [siennes]);

  /* L'HEURE SE PREND UNE FOIS PAR MINUTE, pas à chaque rendu : la jauge des 72
     heures doit avancer sans que l'écran se redessine cinquante fois par
     seconde, et sans qu'un compteur figé mente jusqu'au prochain clic. */
  const [maintenant, setMaintenant] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setMaintenant(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  /* QUI TRANCHE : un souverain ou un gérant, jamais ses propres dépenses.
     La règle vit dans `finance.ts`, l'écran ne fait que la lire. */
  const jeSoumets = doitEtreValidee(monProfil?.role);
  const aValiderPourMoi = useMemo(
    () => (voitToutesLesDepenses ? aValider(toutesLesDepenses, branch.id) : []),
    [voitToutesLesDepenses, toutesLesDepenses, branch.id],
  );
  const [budgets, setBudgets] = useBudgets();
  const [cashboxes, setCashboxes] = useCashboxes();
  /* Le coffre : ses dépôts SORTENT d'une caisse depuis le 17 août. Les deux
     setters ne servent qu'au RENOMMAGE d'une caisse — voir `saveBox`. */
  const [coffre, setCoffre] = useCoffre();
  const [creditMvts, setCreditMvts] = useCredits();
  /* Les prêts touchent la caisse depuis le 22 août — voir `pretsDeCaisse`. */
  const [prets] = usePrets();
  /* ── LE TRANSFERT ENTRE CAISSES — 22 août 2026 ──────────────────
     « Je peux faire des transferts ? » Non — et on ne pouvait le faire qu'en
     trichant : une fausse dépense d'un côté, un faux encaissement de l'autre.
     Deux comptes salis pour un seul geste. Une seule écriture à deux bouts. */
  const [transferts, setTransferts] = useTransferts();
  const [transfertOuvert, setTransfertOuvert] = useState(false);
  const [fTr, setFTr] = useState({ de: '', vers: '', montant: '', recu: '', note: '', date: todayISO() });


  const enregistrerTransfert = () => {
    const montant = parseInt(fTr.montant.replace(/[^0-9]/g, ''), 10) || 0;
    const recu = parseInt(fTr.recu.replace(/[^0-9]/g, ''), 10) || 0;
    /* UNE CAISSE NE S'ENVOIE PAS À ELLE-MÊME : le geste est absurde, et le
       laisser passer inscrirait un mouvement qui ne bouge rien. */
    if (!fTr.de || !fTr.vers || fTr.de === fTr.vers || montant <= 0) return;
    if (changeDeDevise && recu <= 0) return;
    setTransferts((prev) => [...prev, {
      id: `trf-${uid()}`,
      branchId: branch.id,
      date: fTr.date || todayISO(),
      de: fTr.de,
      vers: fTr.vers,
      amountXof: montant,
      recuXof: changeDeDevise ? recu : undefined,
      note: fTr.note.trim() || undefined,
    }]);
    setTransfertOuvert(false);
    setFTr((f) => ({ ...f, montant: '', recu: '', note: '' }));
  };

  /* Ce qu'un transfert fait à une caisse — négatif au départ, positif à
     l'arrivée. Il entre dans le solde comme tout le reste. */
  const transfertsDeCaisse = (name: string, keep: (mk: string) => boolean): number =>
    transferts
      .filter((t) => t.branchId === branch.id && keep(monthKey(t.date)))
      .reduce((s, t) => s + transfertSurCaisse(t, name), 0);
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
  const [form, setForm] = useState<Form>({ label: '', amount: '', category: '', subcategory: '', cashbox: '', enDevise: '', recurring: '', date: '', flagged: false, items: [], sources: [], porteur: voitToutesLesDepenses ? '' : monNom, avancee: false });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) => setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [catOpen, setCatOpen] = useState(false);
  const [boxOpen, setBoxOpen] = useState(false);
  const [boxEditingId, setBoxEditingId] = useState<string | null>(null);
  const [boxForm, setBoxForm] = useState<BoxForm>({ name: '', sub: '', glyph: '◈', opening: '', currency: '', equipe: false });
  /** Nom de la caisse dont on lit les mouvements (null = fermé). */
  const [boxDrill, setBoxDrill] = useState<string | null>(null);
  const [rapportDe, setRapportDe] = useState<string | null>(null);
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

  /* ── LE MOIS, OU L’ANNÉE — 23 août 2026 ──────────────────────────
     « Les dépenses doivent être au mois et à l’année. » L’écran ne savait lire
     qu’un mois : pour répondre à « combien de local cette année ? », il fallait
     ouvrir douze mois et additionner de tête.

     L’ANNÉE S’ARRÊTE AUJOURD’HUI. Une dépense mensuelle compte pour chaque mois
     depuis son premier — étendre la portée jusqu’en décembre ferait payer au
     mois d août un loyer de novembre qui n’a pas eu lieu. L année en cours se
     lit donc jusqu’au mois courant, et une année passée, en entier.

     LES BUDGETS RESTENT AU MOIS, et c’est voulu : une enveloppe se tient par
     mois, pas par an. L’onglet ne suit donc pas la portée. */
  const [portee, setPortee] = useState<'mois' | 'annee'>('mois');
  const annee = month.slice(0, 4);
  const moisCourant = monthKey(todayISO());
  const moisDeLaPortee = useMemo(() => {
    if (portee === 'mois') return [month];
    const fin = annee === moisCourant.slice(0, 4) ? moisCourant : `${annee}-12`;
    const liste: string[] = [];
    for (let m = 1; m <= 12; m += 1) {
      const mk = `${annee}-${String(m).padStart(2, '0')}`;
      if (mk <= fin) liste.push(mk);
    }
    return liste;
  }, [portee, month, annee, moisCourant]);
  /* Le préfixe ISO qui sert au revenu : `2026-07` ou `2026`. Les filtres de
     versements travaillent déjà par PRÉFIXE — l’année passe sans rien
     réécrire. */
  const prefixe = portee === 'mois' ? month : annee;
  const nomDeLaPortee = portee === 'mois'
    ? monthName
    : `${annee}${annee === moisCourant.slice(0, 4) ? ' · à ce jour' : ''}`;
  const isCurrent = month === thisMonth;
  /* ── UNE SEULE CAISSE POUR L'ÉQUIPE — 31 août 2026 ───────────────
     « Pour les employés une seule caisse est disponible pour eux. La caisse
     indépendante. Toutes les autres ne sont pas visibles » (Yéman).

     Le nom des tiroirs dit déjà beaucoup : Wells Fargo, Scotiabank, un tiroir
     en euros. Les montrer à qui n'a que ses propres dépenses à saisir, c'est
     lui dire où dort l'argent. Le filtre porte ici, à la source : les
     pastilles du flux, le choix du formulaire et la caisse d'un remboursement
     le suivent tous sans qu'on ait à y penser. */
  const toutesLesCaisses = useMemo(() => cashboxes.filter((c) => c.branchId === branch.id), [cashboxes, branch.id]);
  const branchBoxes = useMemo(
    () => caissesPourLEquipe(toutesLesCaisses, voitToutesLesDepenses),
    [toutesLesCaisses, voitToutesLesDepenses],
  );
  /* CET ÉCRAN N’A JAMAIS FILTRÉ LES CAISSES EN DEVISE — 22 août 2026. Une
     dépense en francs imputée à un tiroir en dollars lui retirait des francs,
     et son solde s’en trouvait faux. Le champ ci-dessous dit ce qui sort
     vraiment du tiroir ; sans lui, la ligne ne pèse rien et le relevé le dit. */
  const [porteurs] = usePorteurs();

  /* ── CE QUE LA MAISON DOIT — 31 août 2026 ────────────────────────
     Le solde SE CALCULE, il ne se stocke pas : un total posé à côté des lignes
     finit toujours par ne plus leur correspondre, et personne ne sait alors
     lequel croire. Les deux origines comptent — les dépenses du salon et les
     sorties des caisses indépendantes du foyer. */
  const [moyens] = usePaymentMethods();
  const [remboursements] = useRemboursements();
  const [mvtsFoyer] = useMouvementsCaisse();
  const avances = useMemo(
    () => lignesAvancees({ expenses, mouvements: mvtsFoyer, branchId: branch.id }),
    [expenses, mvtsFoyer, branch.id],
  );
  const soldes = useMemo(
    () => soldesDesPorteurs(avances, remboursements, branch.id),
    [avances, remboursements, branch.id],
  );
  const [aRembourser, setARembourser] = useState<string | null>(null);
  const [rbMontant, setRbMontant] = useState('');
  const [rbCaisse, setRbCaisse] = useState('');
  const [rbMoyen, setRbMoyen] = useState('');
  const [rbDate, setRbDate] = useState(todayISO());

  const ouvrirRemboursement = (nom: string, reste: number) => {
    setARembourser(nom);
    setRbMontant(String(Math.max(0, reste)));
    setRbCaisse(caisseParDefaut(branchBoxes, branch.id, currency)?.name ?? '');
    setRbMoyen(moyens[0] ?? '');
    setRbDate(todayISO());
  };

  const validerRemboursement = () => {
    if (!aRembourser) return;
    const montant = parseInt(rbMontant.replace(/[^0-9]/g, ''), 10) || 0;
    /* UN REFUS SE DIT, TOUJOURS. */
    if (montant <= 0) { toast('Saisissez le montant rendu.'); return; }
    const r = rembourse({
      branchId: branch.id, porteur: aRembourser, date: rbDate || todayISO(),
      amountXof: montant, cashbox: rbCaisse || undefined, method: rbMoyen || undefined,
    });
    if (!r) { toast('Ce remboursement n’a pas pu s’inscrire.'); return; }
    setARembourser(null);
    toast(rbCaisse
      ? `${fmtMoney(montant, currency)} rendus à ${aRembourser}, sortis de « ${rbCaisse} ».`
      : `${fmtMoney(montant, currency)} rendus à ${aRembourser}.`);
  };

  /* LE RELEVÉ D'UNE PERSONNE. Il SÉPARE ce qu'elle a avancé de ce qu'on lui a
     rendu : un total unique ferait payer deux fois le jour où on le relit. */
  const releveCsv = (nom: string) => {
    const l = lignesDunPorteur(avances, nom);
    const r = remboursementsDunPorteur(remboursements, nom, branch.id);
    downloadCsv(`releve-${nom.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.csv`, [
      ['Nature', 'Date', 'Libellé', 'Catégorie', 'Origine', 'Montant'],
      ...l.map((x) => ['Avancé', x.date, x.label, x.categorie ?? '', x.source === 'foyer' ? 'Foyer' : 'Salon', String(x.amountXof)]),
      ...r.map((x) => ['Remboursé', x.date, x.note ?? 'Remboursement', '', x.cashbox ?? '', String(-x.amountXof)]),
    ]);
  };

  const relevePdf = async (nom: string) => {
    const l = lignesDunPorteur(avances, nom);
    const r = remboursementsDunPorteur(remboursements, nom, branch.id);
    const s0 = soldes.find((x) => x.porteur.toLowerCase() === nom.toLowerCase());
    await summaryPdf({
      eyebrow: 'Relevé des avances',
      title: nom,
      houseName: maisonNom(),
      meta: [`Établi le ${fmtDay(todayISO())}`, branch.name ?? ''],
      sections: [
        {
          heading: 'Ce qui a été avancé',
          rows: l.length > 0
            ? l.map((x) => ({ label: `${fmtDay(x.date)} · ${x.label}`, value: fmtMoney(x.amountXof, currency) }))
            : [{ label: 'Aucune avance sur la période' }],
        },
        {
          heading: 'Ce que la Maison a rendu',
          rows: r.length > 0
            ? r.map((x) => ({ label: `${fmtDay(x.date)}${x.cashbox ? ` · ${x.cashbox}` : ''}`, value: fmtMoney(x.amountXof, currency) }))
            : [{ label: 'Rien rendu à ce jour' }],
        },
        {
          heading: 'Reste dû',
          rows: [{ label: 'Ce que la Maison doit encore', value: fmtMoney(Math.max(0, s0?.resteXof ?? 0), currency) }],
        },
      ],
      footer: 'Relevé arrêté au jour de son édition. Signé pour accord.',
      filename: `releve-${nom.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.pdf`,
    });
  };
  const caisseDeLaDepense = branchBoxes.find((c) => c.name === form.cashbox);

  /* ── UNE PASTILLE DE CAISSE NE DIT PAS CE QU'ELLE CONTIENT — 31 août 2026.
     « Ni les différentes caisses avec les montants » (Yéman).

     Le solde d'un tiroir n'est pas une information de saisie : on choisit OÙ
     l'on paie, on n'a pas besoin de savoir ce qui dort dedans. Et « Caisse
     Principale · 1 171 490 F » en dit plus sur la Maison que toute la page
     qu'on venait de fermer. */
  const libelleDeLaCaisse = (c: Cashbox) => (voitToutesLesDepenses
    ? nomEtSolde(c, boxBalance(c.name), caissesOuvertes, true)
    : c.name);
  /* LES DEUX NOMBRES D’UNE DÉPENSE — 23 août 2026. Le champ principal se dit
     dans la monnaie du tiroir ; le franc suit, au taux indicatif, corrigeable.
     LES ARTICLES RESTENT EN FRANCS : ils totalisent la charge de la Maison, et
     leur donner une devise ferait deux vérités pour une même somme. */
  const montantsDep = montantsDuTiroir(caisseDeLaDepense, currency, form.amount, form.enDevise);

  /* Les deux bouts du transfert, et leurs devises — déclarés APRÈS
     `branchBoxes` : les lire plus haut touchait une constante non encore
     initialisée, et tout l'écran tombait. */
  const caisseDe = branchBoxes.find((c) => c.name === fTr.de);
  const caisseVers = branchBoxes.find((c) => c.name === fTr.vers);
  const deviseDe = caisseDe ? cashboxCurrency(caisseDe) : currency;
  const deviseVers = caisseVers ? cashboxCurrency(caisseVers) : currency;
  const changeDeDevise = !!caisseDe && !!caisseVers && deviseDe !== deviseVers;

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
  /* Une dépense compte autant de fois qu’elle tombe dans la portée : un loyer
     mensuel vaut douze sur une année, une fois sur un mois. */
  const occurrencesDansLaPortee = (e: typeof expenses[number]) =>
    moisDeLaPortee.reduce((n, mk) => n + expenseOccurrences(e, mk), 0);
  const monthExp = useMemo(
    () => expenses
      .filter((e) => e.branchId === branch.id
        && moisDeLaPortee.some((mk) => expenseOccurrences(e, mk) > 0))
      .sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : (a.date < b.date ? 1 : -1))),
    [expenses, branch.id, moisDeLaPortee],
  );
  const poids = (e: typeof expenses[number]) => expenseTotal(e) * occurrencesDansLaPortee(e);

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
  /* CE QUE CHAQUE CAISSE PORTE — 24 août 2026. « Quand je choisis n’importe
     quelle caisse, les données ne changent pas d’une caisse à l’autre. » Le
     filtre marchait ; c’est la BARRE qui ne disait rien. Toutes les caisses de
     la branche s y alignaient, y compris celles qui n’ont pas vu une dépense
     du mois : cliquer l’une d’elles vidait l écran sans qu’on sache si c’était
     un filtre efficace ou un écran cassé.

     Chaque pastille porte donc ce qu’elle pèse. Celles à zéro se voient avant
     d’être cliquées — et la question ne se pose plus. */
  const poidsParCaisse = useMemo(() => {
    const par = new Map<string, number>();
    for (const e of live) par.set(e.cashbox, (par.get(e.cashbox) ?? 0) + poids(e));
    return par;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, moisDeLaPortee]);
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
      .reduce((s, i) => s + invoiceRegleAu(i, prefixe), 0);
    const rit = appts
      .filter((a) => a.branchId === branch.id && a.status === 'honoré' && !a.invoiceId && a.date.startsWith(prefixe))
      .reduce((s, a) => s + apptNetXof(a, byId), 0);
    const form = apprenants
      .flatMap((ap) => ap.payments ?? [])
      .filter((pm) => payMonthKeyLocal(pm.date).startsWith(prefixe))
      .reduce((s, pm) => s + pm.amountXof, 0);
    const abo = abonnes
      .flatMap((sub) => sub.payments ?? [])
      .filter((pm) => pm.amountXof > 0 && payMonthKeyLocal(pm.date) === month)
      .reduce((s, pm) => s + pm.amountXof, 0);
    return inv + rit + form + abo;
  }, [invoices, appts, apprenants, abonnes, byId, branch.id, prefixe]);
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
  /* LES CAISSES SE CALCULENT AILLEURS — 22 août 2026. Ces deux cents lignes
     vivaient ici, où elles sont nées ; elles servent désormais aussi l'écran
     des Caisses. Les recopier aurait fabriqué deux soldes pour un seul tiroir,
     et l'un des deux aurait fini par mentir — c'est ce qui était arrivé au
     registre des encaissements. Une seule porte : `useCaisses`. */
  const { boxOf, boxBalance, boxBalanceStart, boxMonthFlux, boxMoves, treasury } = useCaisses(month);
  /* UNE CAISSE DISCRÈTE SE TAIT DANS LES LISTES AUSSI — 23 août 2026. Son
     solde fuyait par les menus déroulants de la dépense et du transfert. */
  const caissesOuvertes = useCaissesOuvertes();

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
    setForm({ label: '', amount: '', category: catNames[0] ?? '', subcategory: '', cashbox: cashbox ?? caisseParDefaut(branchBoxes, branch.id, currency)?.name ?? '', enDevise: '', recurring: '', date: todayISO(), flagged: false, items: [], sources: [], porteur: voitToutesLesDepenses ? '' : monNom, avancee: false });
    setOpen(true);
  };
  const openEdit = (e: Expense) => {
    setSaveErr(null);
    setEditingId(e.id);
    setForm({
      label: e.label, amount: String(e.fx ? e.fx.amount : e.amountXof), category: e.category, subcategory: e.subcategory ?? '',
      cashbox: e.cashbox, enDevise: e.fx ? String(e.amountXof) : '', recurring: e.recurring ?? '', date: e.date, flagged: !!e.flagged,
      fichier: e.fichier,
      porteur: e.porteur ?? '',
      avancee: !!e.avancee,
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
  /* PAYER DEPUIS LA CAISSE DE QUELQU’UN, C’EST LUI ATTRIBUER L’ACHAT — 23 août
     2026. Laisser les deux se remplir à la main les ferait diverger au premier
     oubli : le tiroir dirait « Sandrine a payé », le résumé dirait « la
     Maison ». Le porteur suit donc la caisse — et reste modifiable. */
  const changeLaCaisse = (nom: string) =>
    setForm((f) => {
      if (f.cashbox === nom) return f;
      const tenue = branchBoxes.find((c) => c.name === nom)?.porteur;
      return { ...f, cashbox: nom, sources: [], porteur: tenue ?? (f.porteur && !branchBoxes.some((c) => c.porteur === f.porteur) ? f.porteur : '') };
    });
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
    const amountXof = hasItems ? items.reduce((s, it) => s + it.amountXof, 0) : montantsDep.xof;
    if (!form.label.trim()) { setSaveErr('Il manque le bénéficiaire, qui a reçu cet argent ?'); return; }
    if (!amountXof) {
      setSaveErr(hasItems
        ? 'Les articles saisis totalisent zéro, donnez un libellé et un montant à chacun.'
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
        fx: hasItems ? undefined : montantsDep.fx,
        fichier: form.fichier,
        porteur: form.porteur.trim() || undefined,
        /* IL A AVANCÉ DE SA POCHE : la charge compte, la caisse ne
           bouge pas. Sans porteur, l'avance n'a personne à qui
           rendre — on ne la retient donc pas. */
        avancee: form.avancee && !!form.porteur.trim() ? true : undefined,
        category: form.category || 'Divers', subcategory: form.subcategory || undefined,
        recurring: form.recurring || null, flagged: form.flagged || undefined,
        items: hasItems ? items : undefined, sources: dits,
        /* MODIFIER UNE DÉPENSE EN ATTENTE NE REMET PAS LE COMPTEUR À ZÉRO :
           sinon il suffirait de la retoucher chaque matin pour qu'elle ne soit
           jamais en retard. Une dépense DÉJÀ TRANCHÉE ne se remet pas non plus
           en attente par une simple correction de libellé ; pour la défaire,
           on la supprime, et la suppression est un acte tracé. */
        validation: e.validation,
      } : e)));
    } else {
      const e: Expense = {
        id: uid(), branchId: branch.id, label: form.label.trim(), amountXof,
        date: form.date || todayISO(), cashbox: form.cashbox, category: form.category || 'Divers',
        fx: hasItems ? undefined : montantsDep.fx,
        fichier: form.fichier,
        porteur: form.porteur.trim() || undefined,
        /* IL A AVANCÉ DE SA POCHE : la charge compte, la caisse ne
           bouge pas. Sans porteur, l'avance n'a personne à qui
           rendre — on ne la retient donc pas. */
        avancee: form.avancee && !!form.porteur.trim() ? true : undefined,
        subcategory: form.subcategory || undefined, recurring: form.recurring || null,
        flagged: form.flagged || undefined, items: hasItems ? items : undefined, sources: dits,
        /* ELLE PART À LA MAISON — 31 août 2026. Le rôle tranche, pas l'écran :
           un souverain ou un gérant enregistre, un employé soumet. Le champ
           reste ABSENT dans le second cas, et absent veut dire acquise. */
        validation: jeSoumets ? soumission(monNom || 'Sans nom', new Date().toISOString()) : undefined,
      };
      setExpenses((prev) => [e, ...prev]);
    }
    setOpen(false);
  };
  /* ══ DIRE OUI, DIRE NON — 31 août 2026 ═════════════════════════════
     La décision garde son auteur et son heure. Elle passe par le magasin
     COMPLET, jamais par la liste filtrée de l'écran : celle-ci ne porte que ce
     qu'on a le droit de voir, et écrire depuis une vue partielle effacerait
     tout le reste. */
  const trancher = (e: Expense, fait: (v: ValidationDepense) => ValidationDepense) => {
    if (!e.validation) return;
    setExpenses((prev) => prev.map((x) => (x.id === e.id && x.validation
      ? { ...x, validation: fait(x.validation) }
      : x)));
  };
  const dirOui = (e: Expense) => trancher(e, (v) => validee(v, monNom || 'La Maison', new Date().toISOString()));
  const [aRefuser, setARefuser] = useState<Expense | null>(null);
  const [motifRefus, setMotifRefus] = useState('');
  const confirmerLeRefus = () => {
    const e = aRefuser;
    /* UN NON SANS RAISON SE REJOUE LE LENDEMAIN À L'IDENTIQUE. Le motif est
       donc exigé, pas seulement suggéré. */
    if (!e || !motifRefus.trim()) return;
    trancher(e, (v) => refusee(v, monNom || 'La Maison', new Date().toISOString(), motifRefus));
    setARefuser(null);
    setMotifRefus('');
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
            <span className="trf-prov__nom">Part sans nom, aucun revenu désigné</span>
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
      ? `« ${c.name} » est référencée par ${used} dépense(s), leur libellé de catégorie sera conservé. Supprimer la catégorie quand même ?`
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
    setBoxForm({ name: '', sub: 'Caisse manuelle', glyph: '◈', opening: '', currency: '', equipe: false });
    setBoxOpen(true);
  };
  const openEditBox = (c: Cashbox) => {
    setBoxEditingId(c.id);
    setBoxForm({ name: c.name, sub: c.sub, glyph: c.glyph || '◈', opening: String(c.openingXof), currency: c.currency ?? '', equipe: !!c.equipe });
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
      setCashboxes((prev) => prev.map((b) => (b.id === boxEditingId ? { ...b, name, sub, glyph, openingXof: opening, currency: boxForm.currency || undefined, equipe: boxForm.equipe || undefined } : b)));
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
      ? `« ${c.name} » est référencée par ${expUsed} dépense(s) et ${invUsed} encaissement(s), ces écritures ne seront pas modifiées. Supprimer la caisse ?`
      : `Supprimer la caisse « ${c.name} » ?`;
    if (!window.confirm(msg)) return;
    setCashboxes((prev) => prev.filter((b) => b.id !== c.id));
    if (filterCaisse === c.name) setFilterCaisse('all');
  };
  /* — Budgets : créer / modifier / supprimer via une vraie modale (les
     window.prompt laissaient passer des catégories inexistantes et rendaient
     toute enveloppe immuable une fois créée). Une enveloppe par catégorie. */
  /* ── LE BUDGET SE POSE D'UN SEUL GESTE — 22 août 2026 ──────────────
     « Je veux aussi remplir différents montants pour chaque catégorie puis un
     total pour le budget. »

     L'enveloppe se créait une catégorie à la fois : neuf allers-retours pour
     poser un budget, et jamais le total sous les yeux pendant qu'on le
     compose — or c'est précisément le montant qu'on arbitre. Toutes les
     catégories tiennent maintenant dans une seule table, le total s'additionne
     à la frappe, et un montant laissé à zéro retire l'enveloppe.

     Une seule porte : « + Budget » et « Modifier » ouvrent le même composeur.
     Il n'y a plus de mode « création » ni de mode « édition » — il y a le
     budget du mois, tel qu'il est, qu'on ajuste. */
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetLignes, setBudgetLignes] = useState<Record<string, string>>({});
  const branchBudgets = budgets.filter((b) => b.branchId === branch.id);
  const ouvrirLeBudget = () => {
    const depart: Record<string, string> = {};
    for (const b of branchBudgets) depart[b.category] = String(b.monthlyXof);
    setBudgetLignes(depart);
    setBudgetOpen(true);
  };
  const montantDeLigne = (cat: string): number =>
    parseInt((budgetLignes[cat] ?? '').replace(/[^0-9]/g, ''), 10) || 0;
  const totalDuBudget = catNames.reduce((n, c) => n + montantDeLigne(c), 0);

  const enregistrerLeBudget = () => {
    const gardees = catNames.filter((c) => montantDeLigne(c) > 0);
    const retirees = branchBudgets.filter((b) => montantDeLigne(b.category) <= 0);
    /* RETIRER TOUTES LES ENVELOPPES D'UN COUP est un geste voulu, pas un cache
       périmé : on le déclare au garde-fou, qui sinon bloquerait le vidage et
       ferait réapparaître les enveloppes. Un laissez-passer, une poussée. */
    if (retirees.length > 0) autoriserLaPurge('budgets');
    setBudgets((prev) => {
      const hors = prev.filter((b) => b.branchId !== branch.id);
      const miennes: Budget[] = gardees.map((c) => {
        const exist = branchBudgets.find((b) => b.category === c);
        return exist
          ? { ...exist, monthlyXof: montantDeLigne(c) }
          : { id: uid(), branchId: branch.id, category: c, monthlyXof: montantDeLigne(c) };
      });
      return [...hors, ...miennes];
    });
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
      /* LE PORTEUR ENTRE DANS L'EXPORT — 23 août 2026 : un résumé qu'on emporte
         chez le comptable doit dire QUI a acheté, pas seulement qui a reçu. */
      ['Libellé', 'Date', 'Caisse', 'Acheté par', 'Catégorie', 'Sous-catégorie', 'Articles', `Montant (${currency})`],
      ...monthExp
        .map((e) => [
          e.label, e.date, e.cashbox, e.porteur ?? '', e.category, e.subcategory ?? '',
          (e.items ?? []).map((it) => `${it.label} (${csvAmt(it.amountXof)})`).join(' + '),
          csvAmt(expenseTotal(e)),
        ]),
    ];
    downloadCsv(`depenses-${portee === 'mois' ? month : annee}.csv`, rows);
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
    ['argent', 'Où va l’argent', `${beneficiaires(depensesDeLAnnee).length} bénéficiaires`],
    ['budgets', 'Budgets', allocated
      ? `${fmtMoney(allocated, currency)} alloués`
      : 'aucune enveloppe'],
  ];
  /* LES ENVELOPPES SONT CELLES DE LA MAISON : ce qu'elle s'autorise par poste
     dit son train de vie. Un compte restreint ne les voit pas — ni l'onglet,
     ni son total en regard. */
  const ongletsVisibles = voitToutesLesDepenses ? TABS : TABS.filter(([t]) => t !== 'budgets');

  return (
    <div className="mnd-rise">
      {/* ON NE CACHE PAS SANS LE DIRE. Un écran qui montre moins sans un mot se
          lit comme un écran cassé, et l'on cherche ce qui manque. */}
      {!voitToutesLesDepenses && (
        <div className="mnd-bande" style={{ marginBottom: 14, padding: '11px 14px', fontSize: 12.5, lineHeight: 1.6 }}>
          Vous voyez <b>vos dépenses</b>, celles que vous portez. Les chiffres de la Maison
          restent à la Maison.
        </div>
      )}
      {/* ══ CE QUI ATTEND PASSE DEVANT — 31 août 2026 ═══════════════════
          Avant les totaux, avant le flux : ce qui demande une décision. Le
          panneau disparaît quand la file est vide, il ne devient jamais un
          meuble qu'on cesse de voir. */}
      {voitToutesLesDepenses && aValiderPourMoi.length > 0 && (() => {
        const enRetardIci = aValiderPourMoi.filter((e) => enRetard(e, maintenant));
        const total = aValiderPourMoi.reduce((n, e) => n + expenseTotal(e), 0);
        return (
          <div className="trf-panel trf-valider" style={{ marginBottom: 18 }}>
            <div className="trf-valider__bandeau">
              <span className="trf-valider__titre">
                {aValiderPourMoi.length} dépense{aValiderPourMoi.length > 1 ? 's attendent' : ' attend'} votre oui
              </span>
              <span className="trf-valider__dit">
                {fmtMoney(total, currency)} au total
                {enRetardIci.length > 0 && (
                  <>, dont <b style={{ color: 'var(--trf-error)' }}>{enRetardIci.length} en retard</b></>
                )}. Rien de tout cela n’est encore dans vos chiffres.
              </span>
            </div>
            {aValiderPourMoi.map((e) => {
              const tard = enRetard(e, maintenant);
              const heures = heuresDattente(e, maintenant) ?? 0;
              const part = Math.min(100, Math.round((heures / DELAI_VALIDATION_H) * 100));
              const mienne = !peutValider(monProfil?.role, monNom, e);
              return (
                <div key={e.id} className={`trf-vcarte ${tard ? 'is-tard' : ''}`}>
                  <div className="trf-vcarte__tete">
                    <span className="trf-vcarte__nom">{e.label}</span>
                    <span className={`trf-past ${tard ? 'trf-past--tard' : 'trf-past--attente'}`}>
                      {tard ? `En retard · ${Math.floor(heures)} h` : `${heuresRestantes(e, maintenant)} h restantes`}
                    </span>
                    <span className="trf-vcarte__xof">{fmtMoney(expenseTotal(e), currency)}</span>
                  </div>
                  <div className="trf-vcarte__meta">
                    Saisie par <b>{e.validation?.soumisPar}</b> le {fmtDay(e.date)} · {e.category}
                    {e.cashbox ? ` · ${e.cashbox}` : ''}
                    {e.fichier ? ' · pièce jointe' : ' · aucune pièce jointe'}
                    {e.avancee && (
                      <><br /><b>Il a avancé de sa poche</b>, la Maison lui devra cette somme une fois validée.</>
                    )}
                  </div>
                  <div className={`trf-vjauge ${tard ? 'is-tard' : ''}`}><i style={{ width: `${tard ? 100 : Math.max(2, part)}%` }} /></div>
                  {/* ON NE VALIDE PAS SES PROPRES DÉPENSES. Le bouton ne se grise
                      pas en silence : on dit pourquoi, sinon on le reclique en
                      croyant à une panne. */}
                  {mienne ? (
                    <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.6 }}>
                      Vous l’avez saisie vous-même. Un autre souverain, ou un gérant, doit la valider.
                    </div>
                  ) : (
                    <div className="trf-vcarte__gestes">
                      <button className="trf-act trf-act--oui" onClick={() => dirOui(e)}>Valider</button>
                      <button className="trf-act trf-act--non" onClick={() => { setARefuser(e); setMotifRefus(''); }}>Refuser</button>
                      <button className="trf-act" onClick={() => openEdit(e)}>Voir le détail</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* CHEZ CELUI QUI A SAISI : la même file, sans les boutons. Il doit
          pouvoir suivre ce qu'il a demandé, sinon il le resaisit. */}
      {((!voitToutesLesDepenses && enAttente.length > 0) || refusees.length > 0) && (
        <div className="trf-panel trf-valider" style={{ marginBottom: 18 }}>
          <div className="trf-panel__title">
            {voitToutesLesDepenses ? 'Refusées' : 'Ce que vous avez soumis'}
          </div>
          {/* LE SOUVERAIN VOIT SES REFUS, LUI AUSSI. Ils ne comptent nulle part,
              mais une décision qu'on ne peut plus relire ne se discute pas le
              mois suivant, et l'on refuse deux fois la même chose. */}
          {!voitToutesLesDepenses && enAttente.map((e) => (
            <div key={e.id} className={`trf-vcarte ${enRetard(e, maintenant) ? 'is-tard' : ''}`}>
              <div className="trf-vcarte__tete">
                <span className="trf-vcarte__nom">{e.label}</span>
                <span className={`trf-past ${enRetard(e, maintenant) ? 'trf-past--tard' : 'trf-past--attente'}`}>
                  {enRetard(e, maintenant) ? 'En attente, la Maison est relancée' : `En attente · ${heuresRestantes(e, maintenant)} h`}
                </span>
                <span className="trf-vcarte__xof is-pale">{fmtMoney(expenseTotal(e), currency)}</span>
              </div>
              <div className="trf-vcarte__meta">{fmtDay(e.date)} · {e.category}{e.cashbox ? ` · ${e.cashbox}` : ''}</div>
              {/* IL PEUT RETIRER CE QU'IL A SOUMIS, tant que personne n'a
                  tranché : une erreur de saisie n'a pas à occuper la file de
                  la Maison, ni à forcer un refus pour disparaître. */}
              <div className="trf-vcarte__gestes">
                <button className="trf-act" onClick={() => openEdit(e)}>Corriger</button>
                <button className="trf-act trf-act--non" onClick={() => removeExpense(e)}>Retirer</button>
              </div>
            </div>
          ))}
          {refusees.map((e) => (
            <div key={e.id} className="trf-vcarte is-refuse">
              <div className="trf-vcarte__tete">
                <span className="trf-vcarte__nom">{e.label}</span>
                <span className="trf-past trf-past--refuse">
                  Refusée{e.validation?.decideLe ? ` le ${fmtDay(e.validation.decideLe.slice(0, 10))}` : ''}
                </span>
                <span className="trf-vcarte__xof is-pale is-barre">{fmtMoney(expenseTotal(e), currency)}</span>
              </div>
              {e.validation?.motif && <div className="trf-vcarte__motif">« {e.validation.motif} »</div>}
            </div>
          ))}
          <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 10 }}>
            Ces montants ne sont pas comptés dans votre total tant que la Maison n’a pas répondu.
          </div>
        </div>
      )}

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
        {/* LE MOIS OU L’ANNÉE — 23 août 2026. La navigation garde le mois
            (c’est lui qui donne l’année) ; ce couple dit ce qu’on additionne. */}
        <div style={{ display: 'flex', gap: 6 }}>
          {([['mois', 'Le mois'], ['annee', 'L’année']] as const).map(([k, mot]) => (
            <button
              key={k}
              type="button"
              className={`trf-chip ${portee === k ? 'is-active' : ''}`}
              onClick={() => setPortee(k)}
            >
              {mot}
            </button>
          ))}
        </div>
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
        {ongletsVisibles.map(([k, label, sum]) => (
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
                `Dépenses · ${nomDeLaPortee}`, fmtMoney(engaged, currency),
                'var(--color-indigo)', 'var(--color-indigo)',
                /* MÊME RAISON : « 38 % du revenu » laisse déduire le revenu
                   en une division. On dit alors ce qu'on montre, et rien de plus. */
                /* DEUX CHIFFRES SÉPARÉS, JAMAIS A$ITIONNÉS : le jour où l'un
                   devient l'autre, c'est qu'une décision a été prise. */
                !voitToutesLesDepenses
                  ? (enAttente.length > 0
                    ? `ce que vous avez porté · ${fmtMoney(enAttente.reduce((n, e) => n + expenseTotal(e), 0), currency)} en attente`
                    : 'ce que vous avez porté') :
                revenue > 0 ? `${expRatio} % du revenu · cible < 35 %` : (portee === 'mois' ? 'aucun revenu ce mois-ci' : 'aucun revenu cette année'), '',
                () => openExp(
                  `Dépenses · ${nomDeLaPortee}`,
                  portee === 'mois'
                    ? 'Toutes les dépenses vivantes du mois, les dépenses stoppées en sont exclues.'
                    : 'Toutes les dépenses vivantes de l’année, une dépense mensuelle y compte pour chaque mois écoulé. Les dépenses stoppées en sont exclues.',
                  live,
                ),
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
                  'Prélèvements arrêtés', fmtMoney(savings, currency),
                  'var(--trf-success)', 'var(--trf-success)', `épargnés en ${monthName}`, 'good',
                  () => openExp('Prélèvements arrêtés', `Ce qui aurait couru en ${monthName} et ne court plus, donc jamais sorti de la caisse.`, monthExp.filter((e) => e.stopped)),
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
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Flux des dépenses · par catégorie · {nomDeLaPortee}</div>
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
                <button className={`trf-chip ${filterCaisse === 'all' ? 'is-active' : ''}`} onClick={() => setFilterCaisse('all')}>
                  Toutes les caisses <i className="trf-chip__n">{fmtMoney(live.reduce((n, e) => n + poids(e), 0), currency)}</i>
                </button>
                {branchBoxes.map((b) => {
                  const porte = poidsParCaisse.get(b.name) ?? 0;
                  return (
                    <button
                      key={b.id}
                      className={`trf-chip ${filterCaisse === b.name ? 'is-active' : ''} ${porte === 0 ? 'is-vide' : ''}`}
                      onClick={() => setFilterCaisse(b.name)}
                      title={porte === 0 ? `Aucune dépense payée depuis « ${b.name} » sur cette période` : undefined}
                    >
                      {b.name} <i className="trf-chip__n">{porte === 0 ? '—' : fmtIn(porte, currency)}</i>
                    </button>
                  );
                })}
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
                    : filterCaisse !== 'all'
                      ? <>Aucune dépense payée depuis « {filterCaisse} » en {nomDeLaPortee}. Le filtre fonctionne, cette caisse n’a simplement rien payé sur la période.</>
                      : <>Aucune dépense pour ce filtre en {nomDeLaPortee}.</>}
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

          {/* ══ LE REVENU NE REGARDE PAS UN EMPLOYÉ — 31 août 2026 ══════
              « Les revenus ne concernent pas mes employés » (Yéman).

              Restreindre les dépenses ne suffisait pas : ce panneau affichait
              encore le chiffre d'affaires de la Maison et son résultat net,
              en grand, à quelqu'un à qui l'on venait justement de cacher les
              dépenses. La fuite passait par la porte d'à côté. */}
          {voitToutesLesDepenses && (
          <div className="trf-panel" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Revenu vs dépenses · {nomDeLaPortee}</div>
              <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--ink-soft)' }}>
                Résultat net <span style={{ fontFamily: 'var(--font-serif)', fontSize: 18, color: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)', fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(net, currency)}</span>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <button className="trf-linerow--click" title="Ouvrir la Synthèse, le détail du revenu" onClick={() => navigate('/synthese')}>
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
          )}
          <div className="trf-panel" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Dépenses saisies · {nomDeLaPortee}</div>
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
                {/* ── LA RANGÉE D’UNE DÉPENSE — revue le 24 août 2026 ─────
                    « Le nom des caisses est disproportionnellement écrit. » Il
                    l’était : une pastille indigo pleine, en capitales, sur
                    chacune des trente-et-une lignes — un mur sombre qui pesait
                    plus lourd que le montant. Et « Suspendre » portait un fond
                    ROUGE : le geste le plus rare de la ligne criait le plus
                    fort.

                    CE QUI COMPTE SE LIT EN PREMIER : le bénéficiaire, puis le
                    montant. La caisse rejoint la ligne de détail, avec la
                    catégorie — elle reste cliquable, elle ne domine plus. Les
                    trois gestes deviennent des liens discrets, et leur ordre
                    dit leur fréquence. */}
                <div className={`trf-exprow ${e.stopped ? 'is-stopped' : ''}`}>
                  <span className="trf-datepill" title="Date de l’achat">{fmtDay(e.date)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="trf-exprow__vendor">{e.label}</div>
                    <div className="trf-exprow__meta">
                      {e.category}{e.subcategory ? ` · ${e.subcategory}` : ''}{e.recurring ? ` · ${e.recurring}` : ''}
                      {/* LE NOM DE LA CAISSE N'EST PLUS UNE PORTE POUR TOUT LE
                          MONDE — 31 août 2026. « Don't allow employees to click
                          the details of a caisse » (Yéman).

                          Il restait un chemin, et c'était le plus large de tous :
                          sur SA propre dépense, le nom du tiroir ouvrait le
                          relevé complet de la Caisse Principale — solde
                          1 171 490 F, entrées et sorties depuis toujours, six
                          mois d'histogramme et toutes les lignes de la Maison,
                          fournisseurs nommés. On avait fermé les soldes, les
                          revenus et les autres tiroirs, et cette petite ligne
                          grise les rendait tous d'un clic.

                          LE NOM RESTE, il situe sa propre dépense ; c'est le
                          lien qui s'en va. */}
                      {e.cashbox ? (
                        <>
                          {' · '}
                          {voitToutesLesDepenses ? (
                            <button
                              className="trf-exprow__caisse"
                              title="Voir les mouvements de cette caisse"
                              onClick={() => setBoxDrill(e.cashbox)}
                            >
                              {e.cashbox}
                            </button>
                          ) : e.cashbox}
                        </>
                      ) : null}
                      {e.porteur ? <>{' · acheté par '}<b style={{ fontWeight: 500 }}>{e.porteur}</b></> : null}
                      {e.fichier ? <>{' · '}<span title={e.fichier.nom}>pièce jointe</span></> : null}
                      {e.items && e.items.length ? (
                        <>{' · '}<button className="trf-itemtoggle" onClick={() => toggleExpand(e.id)}>{e.items.length} articles {expanded.has(e.id) ? '▲' : '▼'}</button></>
                      ) : null}
                    </div>
                  </div>
                  <span className="trf-exprow__amt">{fmtMoney(expenseTotal(e), currency)}</span>
                  <div className="trf-exprow__gestes">
                    <button className="trf-geste trf-geste--premier" onClick={() => openEdit(e)}>Modifier</button>
                    {/* « SIGNALER » A ÉTÉ RETIRÉ — 22 août 2026. Le signal ne
                        se lisait plus nulle part depuis que l'arbitrage a quitté
                        l'écran : un bouton dont l'effet est invisible ment. */}
                    {/* « SUSPENDRE » NE SERT PLUS QU’AUX PRÉLÈVEMENTS — 24 août
                        2026. « Le bouton suspendre sert à quoi ? A-t-elle
                        toujours une utilité ? » Il en gardait UNE : arrêter un
                        abonnement mensuel sans’effacer les mois déjà payés.

                        SUR UN ACHAT PONCTUEL, C’ÉTAIT UN PIÈGE. Suspendre sort
                        la dépense de tous les totaux — le solde de la caisse
                        REMONTE alors que les billets sont sortis. Les livres
                        cessaient de correspondre au tiroir, sans un mot. Un
                        achat ponctuel se corrige ou s’efface ; il ne se met pas
                        entre parenthèses.

                        Rétablir reste offert à toute dépense arrêtée, ponctuelle
                        comprise : celles d’avant ce jour doivent pouvoir revenir. */}
                    {e.stopped ? (
                      <button className="trf-geste trf-geste--premier" onClick={() => revive(e)}>↺ Rétablir</button>
                    ) : e.recurring ? (
                      <button className="trf-geste" onClick={() => stop(e)} title="Ce prélèvement ne courra plus les mois suivants. Les mois déjà payés restent.">
                        Arrêter le prélèvement
                      </button>
                    ) : null}
                    <button className="trf-geste trf-geste--oter" onClick={() => removeExpense(e)}>Supprimer</button>
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

          {/* ── QUI ACHÈTE POUR LA MAISON — 23 août 2026 ─────────────
              « Il y a des personnes à qui je remets tout le temps de l’argent
              pour effectuer des dépenses… me retrouver en un clic quand j’ai
              besoin d’un résumé de ce qu’ils ont acheté durant l’année. »

              LE PENDANT EXACT DU PANNEAU AU-DESSUS, et l’inverse : celui-là
              dit qui REÇOIT, celui-ci dit qui A ACHETÉ. Les mêler donnerait un
              « à qui je paie le plus » qui répond à côté — le marché reçoit,
              Sandrine porte. Même horizon de douze mois, même clic qui ouvre
              toutes ses lignes. */}
          {/* ══ CE QUE LA MAISON DOIT — 31 août 2026 ═══════════════════
              « Il enregistre les dépenses sur des bouts de papier et parfois
              il oublie les dates et invente des choses » (Yéman). Le papier
              devient une ligne datée, et la dette se lit à l'instant près.

              LE VOLET NE PARAÎT QUE S'IL Y A QUELQUE CHOSE À DIRE : une Maison
              qui n'avance rien n'a pas à porter un tableau vide. */}
          {soldes.length > 0 && (
            <div className="trf-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <div className="trf-panel__title" style={{ marginBottom: 0 }}>Les avances de l’équipe</div>
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-brique, #96412E)' }}>
                  {fmtMoney(totalDuXof(soldes), currency)} dus
                </span>
              </div>
              <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.6 }}>
                Ce que chacun a sorti de sa poche pour la Maison. La charge a déjà compté au
                résultat ; la caisse ne bouge qu’au remboursement.
              </div>
              <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table className="tre-table" style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th>Qui</th>
                      <th style={{ textAlign: 'right' }}>Avancé</th>
                      <th style={{ textAlign: 'right' }}>Remboursé</th>
                      <th style={{ textAlign: 'right' }}>Reste dû</th>
                      <th>Dernier achat</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {soldes.map((so) => (
                      <tr key={so.porteur}>
                        <td>
                          {so.porteur}
                          <span className="mnd-muted" style={{ fontSize: 10.5, marginLeft: 6 }}>
                            {so.n} ligne{so.n > 1 ? 's' : ''}
                          </span>
                        </td>
                        <td className="num" style={{ textAlign: 'right' }}>{fmtMoney(so.avanceXof, currency)}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{fmtMoney(so.rembourseXof, currency)}</td>
                        <td className="num" style={{ textAlign: 'right' }}>
                          {so.resteXof > 0 ? (
                            <b style={{ fontFamily: 'var(--font-serif)', fontSize: 17, fontWeight: 400, color: 'var(--color-brique, #96412E)' }}>
                              {fmtMoney(so.resteXof, currency)}
                            </b>
                          ) : so.resteXof < 0 ? (
                            /* TROP RENDU : on ne l'efface pas, on le dit. */
                            <span style={{ color: 'var(--color-brique, #96412E)', fontSize: 12 }}>
                              {fmtMoney(-so.resteXof, currency)} de trop
                            </span>
                          ) : (
                            <span style={{ color: 'var(--color-vert, #4A6B52)', fontSize: 12 }}>à jour</span>
                          )}
                        </td>
                        <td className="mnd-muted" style={{ fontSize: 12.5 }}>{so.dernier ? fmtDay(so.dernier) : '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {so.resteXof > 0 && (
                            <button className="tre-link-btn" onClick={() => ouvrirRemboursement(so.porteur, so.resteXof)}>
                              Rembourser
                            </button>
                          )}
                          <button className="tre-link-btn" style={{ marginLeft: 10 }} onClick={() => void relevePdf(so.porteur)}>
                            Relevé
                          </button>
                          <button className="tre-link-btn" style={{ marginLeft: 10 }} onClick={() => releveCsv(so.porteur)}>
                            CSV
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {achatsParPorteur(depensesDeLAnnee).length > 0 && (
            <div className="trf-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <div className="trf-panel__title" style={{ marginBottom: 0 }}>Qui achète pour la Maison</div>
                <span className="mnd-muted" style={{ fontSize: 11.5 }}>12 mois jusqu’à {monthName}</span>
              </div>
              {(() => {
                const porteursRangs = achatsParPorteur(depensesDeLAnnee)
                  .filter((b) => !q || normName(b.nom).includes(normName(q)));
                if (porteursRangs.length === 0) {
                  return <div className="trf-empty" style={{ marginTop: 12 }}>Personne ne correspond à cette recherche.</div>;
                }
                const hautP = porteursRangs[0].total || 1;
                return (
                  <div style={{ marginTop: 12 }}>
                    {porteursRangs.map((b) => (
                      <button
                        type="button"
                        key={b.nom}
                        className="trf-benef"
                        title={`Tout ce que ${b.nom} a acheté sur douze mois`}
                        onClick={() => openExp(
                          b.nom,
                          `Tout ce que ${b.nom} a acheté pour la Maison sur douze mois, ${b.n} achat${b.n > 1 ? 's' : ''}, dernier le ${fmtDay(b.dernier)}.`,
                          depensesDeLAnnee.filter((e) => (e.porteur ?? '').toLowerCase() === b.nom.toLowerCase()),
                        )}
                      >
                        <span className="trf-benef__nom">{b.nom}</span>
                        <span className="trf-benef__n">{b.n} achat{b.n > 1 ? 's' : ''}</span>
                        <span className="trf-benef__xof">{fmtMoney(b.total, currency)}</span>
                        <span className="trf-benef__barre"><i style={{ width: `${Math.max(2, Math.round((b.total / hautP) * 100))}%` }} /></span>
                        {/* CE QUI RESTE DANS SES MAINS — la seule chose que le
                            total des achats ne dit pas. Il vient du solde de sa
                            caisse : remis moins dépensé, au franc près.

                            UN TIROIR À CODE SE TAIT ICI AUSSI — même règle stricte
                            que `nomEtSolde` hors des Caisses (23 août) : cet écran
                            n'est pas derrière `CLE_ECRAN`, le solde d'une caisse
                            discrète ne s'y lit donc jamais, même ouverte pour la
                            séance ailleurs. Sinon confier un tiroir à code à un
                            porteur rouvrait son solde par la porte des Dépenses. */}
                        {(() => {
                          const sienne = caisseDuPorteur(branchBoxes, branch.id, b.nom);
                          if (!sienne) return null;
                          return (
                            <span className="trf-benef__reste">
                              reste en main <b>{caisseDiscrete(sienne) ? '••• •••' : fmtIn(boxBalance(sienne.name), cashboxCurrency(sienne))}</b>
                            </span>
                          );
                        })()}
                      </button>
                    ))}
                    <div className="mnd-muted" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.6 }}>
                      Ce que ces mains ont dépensé POUR la Maison, avec l’argent qu’on leur a confié.
                      Un clic ouvre toutes leurs lignes, et le bouton « Exporter (CSV) » du haut
                      emporte la liste telle qu’elle est filtrée.
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

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
                    <span style={{ fontStyle: 'italic' }}>Part sans nom, aucun revenu désigné</span>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
              <div className="trf-panel__title" style={{ marginBottom: 0 }}>Les enveloppes · {monthName}</div>
              <button className="trf-act" style={{ background: 'var(--color-indigo)', color: 'var(--color-ivoire)', borderColor: 'var(--color-indigo)' }} onClick={ouvrirLeBudget}>+ Budget</button>
            </div>

            {/* ── LE SOMMAIRE DES ENVELOPPES — 22 août 2026 ──────────
                « J'ai besoin d'un espace clair où je peux créer un budget et
                contrôler comment elle se dépense et combien il en reste. »
                Les enveloppes se lisaient une par une, sans jamais dire le
                total : on ne pouvait pas répondre « combien me reste-t-il ce
                mois » sans additionner de tête. */}
            {branchBudgets.length > 0 && (() => {
              const depense = branchBudgets.reduce((n, b) => n + spentOfCat(b.category), 0);
              const reste = allocated - depense;
              const part = allocated > 0 ? Math.min(100, Math.round((depense / allocated) * 100)) : 0;
              const depasse = reste < 0;
              return (
                <div className="trf-enveloppes">
                  <div className="trf-enveloppes__rang">
                    <span><i>Alloué</i><b>{fmtMoney(allocated, currency)}</b></span>
                    <span><i>Dépensé</i><b>{fmtMoney(depense, currency)}</b></span>
                    <span className={depasse ? 'is-depasse' : 'is-reste'}>
                      <i>{depasse ? 'Dépassement' : 'Reste'}</i><b>{fmtMoney(Math.abs(reste), currency)}</b>
                    </span>
                  </div>
                  <div className="trf-bar" style={{ height: 8, marginTop: 10 }}>
                    <div style={{ width: `${part}%`, background: depasse ? 'var(--color-copper)' : 'var(--color-indigo)' }} />
                  </div>
                  <div className="trf-enveloppes__mot">
                    {depasse
                      ? `Les enveloppes sont dépassées de ${fmtMoney(-reste, currency)}.`
                      : `${part} % des enveloppes engagées, il reste ${fmtMoney(reste, currency)} à dépenser en ${monthName}.`}
                  </div>
                </div>
              );
            })()}

            {branchBudgets.length === 0 && (
              <div className="trf-empty" style={{ textAlign: 'left', lineHeight: 1.7 }}>
                <b style={{ color: 'var(--color-indigo)', fontWeight: 500 }}>Aucune enveloppe posée.</b>
                <br />
                Une enveloppe est un montant que la Maison s’accorde chaque mois sur une catégorie,
                le Local, les Matières premières, le Marketing. Le Trône compte alors ce qui en sort,
                dit ce qu’il en reste, et prévient quand elle est dépassée.
                <br />
                <span className="mnd-muted" style={{ fontSize: 12 }}>
                  « + Budget » en ouvre une. Rien n’est bloqué si elle est dépassée : une enveloppe
                  informe, elle n’interdit pas.
                </span>
              </div>
            )}
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
                      <button className="trf-iconbtn" onClick={ouvrirLeBudget}>Modifier</button>
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
            {/* ── LA PRÉVISION CESSE DE MENTIR — 22 août 2026 ────────
                Elle affichait « conforme au budget » alors qu'AUCUNE enveloppe
                n'était posée — une conformité à rien —, et sa phrase promettait
                que « le résultat net gagne en marge après arbitrage des
                engagements évitables », d'un arbitrage retiré le jour même.
                Deux affirmations sans objet, sur le chiffre le plus regardé de
                l'écran. Elle dit maintenant ce qu'elle sait, et rien de plus :
                le réel à date, la projection, et la comparaison aux enveloppes
                SEULEMENT quand il y en a. */}
            <div className="trf-obsidian" style={{ marginBottom: 14 }}>
              <div className="trf-obsidian__eyebrow">{isCurrent ? 'Prévision · fin de mois' : `Total du mois · ${monthName}`}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                <span className="trf-obsidian__value" style={{ fontSize: 36 }}>{fmtMoney(forecast, currency)}</span>
                {isCurrent && (
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--indigo-100)' }}>
                    réel à date · {fmtMoney(engaged, currency)}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 300, fontSize: 12.5, color: 'var(--indigo-100)', marginTop: 8, lineHeight: 1.6 }}>
                {(() => {
                  if (branchBudgets.length === 0) {
                    return isCurrent
                      ? 'Projection au rythme des jours écoulés. Aucune enveloppe n’est posée, ce chiffre ne se compare donc à rien.'
                      : 'Le mois est arrêté. Aucune enveloppe n’était posée, ce total ne se compare à rien.';
                  }
                  const depense = branchBudgets.reduce((n, b) => n + spentOfCat(b.category), 0);
                  const reste = allocated - depense;
                  /* On ne compare QUE ce qui est comparable : la projection porte
                     sur toutes les dépenses, les enveloppes sur quelques
                     catégories. Les mettre face à face ferait un rapport faux. */
                  return reste < 0
                    ? `Les enveloppes du mois sont dépassées de ${fmtMoney(-reste, currency)}, le détail est à gauche, catégorie par catégorie.`
                    : `Il reste ${fmtMoney(reste, currency)} dans les enveloppes du mois. Ce total-ci porte sur TOUTES les dépenses, y compris hors enveloppe.`;
                })()}
              </div>
            </div>

            <div className="trf-panel">
              <div className="trf-panel__title">Dépenses par catégorie · {nomDeLaPortee}</div>
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
                        /* LE CHIFFRE EST DÉJÀ ANNONCÉ DANS LA MONNAIE DU TIROIR
                           (`fCur`, à droite) — il l’ÉTAIT même quand la saisie,
                           elle, restait en francs : l’écran disait « USD » sous
                           un nombre de francs. Il dit vrai depuis le 23 août. */
                        onChange={(e) => setForm((f) => ({ ...f, amount: nettoieLeMontant(e.target.value, montantsDep.enDevise) }))}
                        inputMode="decimal"
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
              <span className="mnd-field__label">Bénéficiaire · qui reçoit l’argent</span>
              <input className="mnd-input" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Ex. Fournisseur · Karité Bénin" />
            </label>

            {/* ── QUI A FAIT CET ACHAT — 23 août 2026 ──────────────────
                « Il y a des personnes à qui je remets tout le temps de
                l’argent pour effectuer des dépenses. » À NE PAS CONFONDRE
                AVEC LE BÉNÉFICIAIRE : le marché reçoit, Sandrine porte. */}
            <div>
              <div className="trc-microlabel" style={{ marginBottom: 9 }}>Qui a fait cet achat ?</div>
              {/* UN COMPTE RESTREINT NE SIGNE QUE DE SON NOM — 31 août 2026.
                  Le laisser choisir un autre porteur lui permettrait d'écrire
                  au nom d'un collègue ; le laisser n'en choisir aucun ferait
                  une dépense qu'il ne reverrait jamais, puisqu'il ne voit que
                  les siennes. Son nom est donc posé, et il ne bouge pas. */}
              {!voitToutesLesDepenses ? (
                <div style={{
                  border: '1px solid var(--hairline)', borderRadius: 3, padding: '9px 12px',
                  background: 'var(--surface-card)', fontSize: 13, color: 'var(--color-indigo)',
                }}>
                  {monNom || 'Vous'}
                  <span className="mnd-muted" style={{ fontSize: 11, display: 'block', marginTop: 2 }}>
                    Vos dépenses sont signées de votre nom.
                  </span>
                </div>
              ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                <button
                  className={`trf-chip ${!form.porteur ? 'is-active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, porteur: '' }))}
                >
                  La Maison elle-même
                </button>
                {porteurs.map((nom) => (
                  <button
                    key={nom}
                    className={`trf-chip ${form.porteur === nom ? 'is-active' : ''}`}
                    onClick={() => setForm((f) => ({ ...f, porteur: nom }))}
                  >
                    {nom}
                  </button>
                ))}
                <button
                  className="trf-chip"
                  style={{ borderStyle: 'dashed' }}
                  onClick={() => {
                    const nom = window.prompt('Qui achète pour la Maison ? Son nom rejoindra la liste, sur tous les appareils.');
                    if (!nom?.trim()) return;
                    ajouteUnPorteur(nom);
                    setForm((f) => ({ ...f, porteur: nom.trim() }));
                  }}
                >
                  + Quelqu’un
                </button>
              </div>
              )}
              <div className="mnd-muted" style={{ fontSize: 10.5, marginTop: 7, lineHeight: 1.5 }}>
                Celui à qui vous confiez de l’argent pour acheter, pas celui qui l’encaisse.
                Vous retrouverez tout ce qu’il a acheté dans « Où va l’argent ».
              </div>

              {/* ══ IL A AVANCÉ DE SA POCHE — 31 août 2026 ═══════════════
                  « J'ai un staff qui préfinance des dépenses pour moi et je le
                  règle à la fin du mois » (Yéman).

                  UN SEUL INTERRUPTEUR DÉCIDE DE LA TRÉSORERIE. Fermé, la caisse
                  choisie se vide comme toujours. Ouvert, AUCUN TIROIR NE BOUGE :
                  l'argent n'est pas sorti de la Maison, il est sorti de sa poche.
                  La charge, elle, compte au résultat dans les deux cas.

                  Il n'a de sens qu'avec un porteur : sans nom, on ne pourrait
                  rendre l'argent à personne. */}
              {!!form.porteur && (
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, avancee: !f.avancee }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    marginTop: 10, padding: '10px 12px', cursor: 'pointer', font: 'inherit',
                    border: `1px solid ${form.avancee ? 'var(--copper-600)' : 'var(--hairline)'}`,
                    background: form.avancee ? 'var(--copper-50)' : 'transparent',
                    borderRadius: 3,
                  }}
                >
                  <span style={{
                    width: 34, height: 19, borderRadius: 10, flex: 'none', position: 'relative',
                    background: form.avancee ? 'var(--copper-600)' : 'var(--hairline)',
                    transition: 'background .2s ease',
                  }}>
                    <span style={{
                      position: 'absolute', top: 2, width: 15, height: 15, borderRadius: '50%',
                      background: '#fff', left: form.avancee ? 17 : 2, transition: 'left .2s ease',
                    }} />
                  </span>
                  <span style={{ fontSize: 13 }}>
                    {form.porteur} a avancé de sa poche
                    <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                      {form.avancee
                        ? 'La Maison le lui doit. Aucune caisse ne bouge aujourd’hui.'
                        : 'La caisse choisie se videra, comme d’habitude.'}
                    </span>
                  </span>
                </button>
              )}
            </div>

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
                            title="Quantité, vide vaut 1"
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
                            title="Total de la ligne, quantité × prix"
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
                    {libelleDeLaCaisse(c)}
                  </button>
                ))}
                {/* La caisse est FACULTATIVE : sans elle, la dépense se range
                    sous « Autres ». L'exiger rendait la saisie impossible tant
                    qu'aucune caisse n'était déclarée. */}
                <button className={`trf-chip ${!form.cashbox ? 'is-active' : ''}`} onClick={() => changeLaCaisse('')}>
                  Sans caisse · Autres
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                {cleanItems.length === 0 && (
                  <ContrepartieMaison
                    caisse={caisseDeLaDepense}
                    maison={currency}
                    saisie={form.amount}
                    contrepartie={form.enDevise}
                    onChange={(v: string) => setForm((f) => ({ ...f, enDevise: v }))}
                    sortant
                  />
                )}
              </div>
              {branchBoxes.length === 0 && (
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 7 }}>
                  Aucune caisse déclarée pour cette branche, la dépense se rangera sous « Autres ».
                  Les caisses se créent dans l’onglet « Les caisses ».
                </div>
              )}
            </div>

            {/* ── PAYÉE PAR QUEL REVENU — 21 août 2026 ──────────────────
                Le sélecteur ne paraît qu'avec une caisse : hors caisse, il n'y
                a pas de tiroir où puiser, donc rien à nommer.

                ET JAMAIS DEVANT UN COMPTE RESTREINT — 31 août 2026. Ce bloc
                nomme les clientes une à une, avec la date, le mode de règlement
                et ce qui reste sur chacune : c'était l'endroit le plus bavard
                de tout l'écran, juste sous une bannière qui promettait de ne
                montrer que ses propres dépenses.

                CE QU'ON PERD EN LE FERMANT est mince : la dépense s'enregistre
                sans source désignée, exactement comme lorsqu'aucun revenu n'est
                disponible. Sa part reste sans nom, et la Maison la rattachera
                depuis son propre écran. */}
            {voitToutesLesDepenses && !!form.cashbox && (
              <div>
                <div className="mnd-field__label" style={{ marginBottom: 9 }}>Payée par quel revenu</div>
                {/* SANS MONTANT, RIEN À NOMMER — un clic ne pourrait prendre
                    qu'un chiffre inventé. On le dit au lieu de ne rien faire. */}
                {formTotal <= 0 ? (
                  <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    Indiquez d’abord le montant de la dépense, les revenus se désignent ensuite,
                    et Le Trône prend sur chacun ce qu’il faut, pas davantage.
                  </div>
                ) : revenusDeLaCaisse.length === 0 ? (
                  <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                    Aucun revenu disponible dans « {form.cashbox} », tout ce qui y est entré
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
                          {' '}, c’est la première fois que la Maison y puise.
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
            {/* LA PREUVE DE LA DÉPENSE — 23 août 2026. C’est ici qu’elle sert
                le plus : un reçu de marché, une facture de fournisseur, la
                capture d’un virement. Le champ est le même que celui des
                caisses ; le compartiment aussi. */}
            <ChampPieceJointe
              branchId={branch.id}
              dossier="depense"
              valeur={form.fichier}
              onChange={(pj) => setForm((f) => ({ ...f, fichier: pj }))}
            />

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
              {/* LE BOUTON CHANGE DE MOT, ET LE MOT CHANGE LE GESTE — 31 août
                  2026. On ne ment pas sur ce qui vient de se passer : rien n'est
                  entré dans les comptes, une demande est partie. */}
              <button className="mnd-btn" onClick={save}>
                {editingId ? 'Enregistrer les modifications'
                  : jeSoumets ? 'Soumettre pour validation' : 'Enregistrer la dépense'}
              </button>
            </div>
            {jeSoumets && !editingId && (
              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 10, textAlign: 'right' }}>
                Cette dépense partira à la Maison. Elle n’entrera dans les comptes qu’une fois
                validée, et vous verrez la réponse ici même.
              </div>
            )}
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
            {/* ── OUVERTE À L'ÉQUIPE — 31 août 2026 ─────────────────────
                « Pour les employés une seule caisse est disponible pour eux »
                (Yéman). Le nom des tiroirs dit déjà beaucoup : Wells Fargo,
                Scotiabank, un tiroir en euros. Les montrer à qui n'a que ses
                propres dépenses à saisir, c'est lui dire où dort l'argent.

                TANT QU'AUCUNE N'EST COCHÉE, ELLES RESTENT TOUTES VISIBLES : un
                employé sans aucun tiroir ne pourrait plus rien saisir, et il
                chercherait la panne au lieu de comprendre le réglage. */}
            <button
              type="button"
              onClick={() => setBoxForm((f) => ({ ...f, equipe: !f.equipe }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '11px 13px', cursor: 'pointer', font: 'inherit', borderRadius: 3,
                border: `1px solid ${boxForm.equipe ? 'var(--copper-600)' : 'var(--hairline)'}`,
                background: boxForm.equipe ? 'var(--copper-50)' : 'transparent',
              }}
            >
              <span style={{
                width: 34, height: 19, borderRadius: 10, flex: 'none', position: 'relative',
                background: boxForm.equipe ? 'var(--copper-600)' : 'var(--hairline)',
                transition: 'background .2s ease',
              }}>
                <span style={{
                  position: 'absolute', top: 2, width: 15, height: 15, borderRadius: '50%',
                  background: '#fff', left: boxForm.equipe ? 17 : 2, transition: 'left .2s ease',
                }} />
              </span>
              <span style={{ fontSize: 13 }}>
                Ouverte à l’équipe
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginTop: 2 }}>
                  {boxForm.equipe
                    ? 'Les comptes qui ne voient que leurs dépenses pourront imputer ici.'
                    : 'Réservée à la Maison. Tant qu’aucune caisse n’est ouverte, elles restent toutes visibles.'}
                </span>
              </span>
            </button>

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
      {budgetOpen && (
        <Modal title="Le budget du mois" onClose={() => setBudgetOpen(false)} width={560}>
          {catNames.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="mnd-muted" style={{ fontSize: 12 }}>Aucune catégorie de dépense, créez-en une d’abord.</span>
              <button className="trf-act" onClick={() => addCategory()}>+ Nouvelle catégorie</button>
            </div>
          ) : (
            <div>
              <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6, marginBottom: 14 }}>
                Un montant par catégorie, et le total se fait tout seul. Une catégorie laissée à zéro
                n’a pas d’enveloppe, la laisser vide n’interdit rien, elle ne sera simplement pas suivie.
              </div>

              <div className="trf-budlignes">
                {catNames.map((c) => {
                  const engage = spentOfCat(c);
                  const pose = montantDeLigne(c);
                  const depasse = pose > 0 && engage > pose;
                  return (
                    <label className="trf-budligne" key={c}>
                      <span className="trf-budligne__nom">{c}</span>
                      <span className={`trf-budligne__engage ${depasse ? 'is-depasse' : ''}`}>
                        {engage > 0 ? `engagé ${fmtMoney(engage, currency)}` : '—'}
                      </span>
                      <input
                        className="mnd-input trf-budligne__champ"
                        inputMode="numeric"
                        placeholder="0"
                        aria-label={`Enveloppe mensuelle pour ${c}`}
                        value={budgetLignes[c] ?? ''}
                        onChange={(ev) => setBudgetLignes((f) => ({ ...f, [c]: ev.target.value.replace(/[^0-9]/g, '') }))}
                      />
                    </label>
                  );
                })}
              </div>

              {/* LE TOTAL SOUS LES YEUX PENDANT QU'ON COMPOSE — c'est lui
                  qu'on arbitre, pas les lignes une à une. */}
              <div className="trf-budtotal">
                <span>Budget total · {monthName}</span>
                <b>{fmtMoney(totalDuBudget, currency)}</b>
              </div>
              {totalDuBudget > 0 && revenue > 0 && (
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, textAlign: 'right' }}>
                  soit {Math.round((totalDuBudget / revenue) * 100)} % du revenu de {monthName}
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
                <button className="mnd-btn mnd-btn--ghost" onClick={() => setBudgetOpen(false)}>Annuler</button>
                <button className="mnd-btn" onClick={enregistrerLeBudget}>Enregistrer le budget</button>
              </div>
            </div>
          )}
        </Modal>
      )}

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

      {transfertOuvert && (
        <Modal title="Transférer entre caisses" onClose={() => setTransfertOuvert(false)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
              L’argent change de tiroir : la caisse de départ baisse, celle d’arrivée monte.
              <b> Rien n’est dépensé, rien n’est encaissé</b>, un transfert ne paraîtra ni dans
              vos dépenses ni dans vos encaissements.
            </div>

            <div className="tr-cols" style={{ '--cols': '1fr 1fr', gap: 14 } as CSSProperties}>
              <label className="mnd-field">
                <span className="mnd-field__label">D’où il part</span>
                <select className="mnd-input" value={fTr.de} onChange={(e) => setFTr((f) => ({ ...f, de: e.target.value }))}>
                  <option value="">Choisir…</option>
                  {branchBoxes.map((c) => (
                    <option key={c.id} value={c.name}>{libelleDeLaCaisse(c)}</option>
                  ))}
                </select>
              </label>
              <label className="mnd-field">
                <span className="mnd-field__label">Où il arrive</span>
                <select className="mnd-input" value={fTr.vers} onChange={(e) => setFTr((f) => ({ ...f, vers: e.target.value }))}>
                  <option value="">Choisir…</option>
                  {branchBoxes.filter((c) => c.name !== fTr.de).map((c) => (
                    <option key={c.id} value={c.name}>{libelleDeLaCaisse(c)}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mnd-field">
              <span className="mnd-field__label">Montant qui sort · {deviseDe}</span>
              <input
                className="mnd-input" inputMode="numeric" value={fTr.montant} placeholder="0"
                onChange={(e) => setFTr((f) => ({ ...f, montant: e.target.value.replace(/[^0-9]/g, '') }))}
                style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
              />
            </label>

            {/* ENTRE DEUX DEVISES, CE QUI ARRIVE N'EST PAS CE QUI PART. On le
                demande plutôt que de le convertir : un taux calculé à la
                lecture, un autre jour, réécrirait l'histoire. */}
            {changeDeDevise && (
              <label className="mnd-field">
                <span className="mnd-field__label">Montant réellement reçu · {deviseVers}</span>
                <input
                  className="mnd-input" inputMode="numeric" value={fTr.recu} placeholder="0"
                  onChange={(e) => setFTr((f) => ({ ...f, recu: e.target.value.replace(/[^0-9]/g, '') }))}
                  style={{ fontFamily: 'var(--font-serif)', fontSize: 20, color: 'var(--color-indigo)' }}
                />
                <span className="mnd-muted" style={{ fontSize: 11, marginTop: 5, display: 'block', lineHeight: 1.5 }}>
                  Les deux caisses ne tiennent pas la même monnaie. Saisissez ce qui entre vraiment
                  dans « {fTr.vers} », c’est ce chiffre qui fera foi, pas une conversion d’aujourd’hui.
                </span>
              </label>
            )}

            <label className="mnd-field">
              <span className="mnd-field__label">Date</span>
              <input className="mnd-input" type="date" value={fTr.date} onChange={(e) => setFTr((f) => ({ ...f, date: e.target.value }))} />
            </label>
            <label className="mnd-field">
              <span className="mnd-field__label">Motif · facultatif</span>
              <input
                className="mnd-input" value={fTr.note} placeholder="Ex. approvisionner le comptoir…"
                onChange={(e) => setFTr((f) => ({ ...f, note: e.target.value }))}
              />
            </label>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button className="mnd-btn mnd-btn--ghost" onClick={() => setTransfertOuvert(false)}>Annuler</button>
              <button className="mnd-btn" onClick={enregistrerTransfert}>Transférer</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Le relevé mène au rapport ici aussi : la Souveraine ouvre un tiroir
          depuis la pastille d'une dépense aussi souvent que depuis sa carte. */}
      {/* MÊME CEINTURE POUR LE RAPPORT DE CAISSE : il ne s'ouvre aujourd'hui
          que depuis le relevé, mais un chemin fermé doit l'être à sa porte. */}
      {rapportDe && voitToutesLesDepenses && (
        <RapportDeCaisse nom={rapportDe} month={month} onClose={() => setRapportDe(null)} />
      )}

      {/* ══ RENDRE L'ARGENT — 31 août 2026 ═══════════════════════════
          C'est CE JOUR-LÀ que le tiroir se vide, et pas avant : la dépense
          avancée n'avait rien retiré de la caisse. On demande donc la caisse
          et le moyen, exactement comme un encaissement — sans eux, rendre
          200 000 F ne les retirerait d'aucun tiroir, et les mêmes francs
          vivraient à deux endroits. */}
      {aRembourser && (() => {
        const so = soldes.find((x) => x.porteur === aRembourser);
        const reste = Math.max(0, so?.resteXof ?? 0);
        const montant = parseInt(rbMontant.replace(/[^0-9]/g, ''), 10) || 0;
        return (
          <Modal title={`Rembourser ${aRembourser}`} onClose={() => setARembourser(null)} width={460}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="mnd-muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                La Maison lui doit <b style={{ color: 'var(--color-brique, #96412E)' }}>{fmtMoney(reste, currency)}</b>
                {so ? `, sur ${so.n} ligne${so.n > 1 ? 's' : ''} avancée${so.n > 1 ? 's' : ''}.` : '.'}
              </div>

              <div className="tr-grid tr-grid--2">
                <Field label={`Montant rendu (${currency})`}>
                  <Input
                    inputMode="numeric"
                    value={rbMontant}
                    onChange={(e) => setRbMontant(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="0"
                  />
                </Field>
                <Field label="Date">
                  <Input type="date" value={rbDate} onChange={(e) => setRbDate(e.target.value)} />
                </Field>
              </div>

              <div className="tr-grid tr-grid--2">
                <Field label="Caisse qui se vide">
                  <Select value={rbCaisse} onChange={(e) => setRbCaisse(e.target.value)}>
                    {branchBoxes.length === 0 && <option value="">Aucune caisse</option>}
                    {branchBoxes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </Select>
                </Field>
                <Field label="Moyen">
                  <Select value={rbMoyen} onChange={(e) => setRbMoyen(e.target.value)}>
                    {moyens.length === 0 && <option value="">—</option>}
                    {moyens.map((m) => <option key={m} value={m}>{m}</option>)}
                  </Select>
                </Field>
              </div>

              {/* ON PEUT RENDRE UNE PARTIE. Le reste demeure dû, le solde suit
                  tout seul — il se calcule, il ne se stocke pas. */}
              {montant > 0 && montant < reste && (
                <div className="mnd-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
                  Il restera <b>{fmtMoney(reste - montant, currency)}</b> dus après ce versement.
                </div>
              )}
              {montant > reste && reste > 0 && (
                <div style={{
                  border: '1px solid var(--color-brique, #96412E)', borderRadius: 3,
                  background: 'rgba(150,65,46,.07)', padding: '10px 12px', fontSize: 12.5, lineHeight: 1.6,
                }}>
                  Vous rendez <b>{fmtMoney(montant - reste, currency)}</b> de plus que ce qu’elle a avancé.
                  Cela s’inscrira, et se lira « de trop » dans le tableau.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10 }}>
                <Button variant="ghost" style={{ flex: 1 }} onClick={() => setARembourser(null)}>Annuler</Button>
                <Button variant="copper" onClick={validerRemboursement}>Rembourser</Button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* ══ LE REFUS SE MOTIVE, TOUJOURS — 31 août 2026 ═══════════════════
          Un non sans raison se rejoue le lendemain à l'identique. Le motif
          part chez celui qui a saisi, alors on le lui écrit comme on le lui
          dirait. */}
      {aRefuser && (
        <Modal title="Refuser cette dépense" onClose={() => setARefuser(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{aRefuser.label}</b>
              {' · '}{fmtMoney(expenseTotal(aRefuser), currency)}
              {' · '}saisie par {aRefuser.validation?.soumisPar}
            </div>
            <label className="mnd-field">
              <span className="mnd-field__label">Pourquoi</span>
              <textarea
                className="mnd-input"
                rows={3}
                value={motifRefus}
                placeholder="Ex. Ce n’est pas pour la Maison, c’est une course personnelle."
                onChange={(e) => setMotifRefus(e.target.value)}
              />
              <span className="mnd-muted" style={{ fontSize: 11, marginTop: 6, display: 'block', lineHeight: 1.55 }}>
                {aRefuser.validation?.soumisPar} lira ce mot. La ligne restera visible chez lui,
                barrée, avec votre raison : ce qui a été demandé et refusé doit pouvoir se relire.
              </span>
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="ghost" style={{ flex: 1 }} onClick={() => setARefuser(null)}>Annuler</Button>
              <Button variant="copper" disabled={!motifRefus.trim()} onClick={confirmerLeRefus}>
                Confirmer le refus
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* LA CEINTURE : même si un autre chemin apparaissait un jour, le relevé
          d'un tiroir ne s'ouvre pas pour qui ne voit que ses dépenses. */}
      {boxDrill && voitToutesLesDepenses && (
        <ReleveCaisse
          nom={boxDrill}
          month={month}
          onClose={() => setBoxDrill(null)}
          onExpense={openEdit}
          onRapport={() => { setRapportDe(boxDrill); setBoxDrill(null); }}
        />
      )}
    </div>
  );
}
