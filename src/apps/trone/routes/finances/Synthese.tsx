import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, convertFromXof } from '../../../../shared/currency';
import { depensesDuMois, useInvoices, useDepensesComptees, invoiceRegleAu, invoiceReglements, expenseTotal, cashboxLabel, invoiceRegleAuSauf, caissesHorsBilan, useCashboxes, useEntreesHorsActivite, horsActiviteXof, horsActiviteParMotif, useEmprunts, detteDeLaMaison } from '../../../../shared/finance';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useCategories } from '../../../../shared/catalog';
import { splitByWeights } from '../../../../shared/pricing';
import { totalsOf, splitByMaison, MAISON_BUCKETS, sumTotals, type MaisonBucket, type Part } from '../../../../shared/maisons';
import { useClients, type Client } from '../../../../shared/clients';
import { useSettings } from '../../../../shared/settings';
import {
  palierDuCarnet, repartitionDesPaliers, rituelsDuMoisParPalier, PALIERS, PALIER_DIT, RANG_DU_PALIER, jourLocal, type Palier,
} from '../../../../shared/paliers';
import { useSubscribers, useApprenants, useFormations } from '../equipe/data';
import { apptDiscountFactor, apptLabel, apptNetXof, apptServices, useServicesById, revenuDuMois, revenusProjetesDuMois } from '../clients/_shared';
import { todayISO, monthKey, monthTitle, monthShort, shiftMonth, lastMonths, MonthNav, downloadCsv, fmtDay as jourDesFinances } from './_shared';
import { TuileDuMois, ColonnesDuResultat, ColonnesEmpilees, BarreDesParts, Anneau, Classement, FenetreDuDetail, type LigneDuDetail } from './SyntheseGraphes';
import { TEINTES, rangsStables, partsDeLAnneau, ecartAuMois, borneDuMois, aJourEgal, type PartDeLAnneau } from './synthese-graphes-pur';
import './finances.css';

/* Synthèse & résultat — le compte de résultat de la branche, mois par mois.
   Tout est dérivé des factures encaissées, des rituels honorés et des dépenses
   non suspendues, filtré par la branche courante et exprimé dans sa devise.
   Le mois affiché se navigue ‹ mois › — chaque chiffre suit le mois choisi. */

/* UNE SEULE PORTE POUR LE JOUR — 12 septembre 2026. Chaque écran des Finances
   portait sa propre mise en forme, identique à `fmtDay` à l'année près :
   quand l'année y a été ajoutée, ces copies ne l'ont pas vue, parce qu'elles
   ne lisaient pas la même fonction. Deux écritures pour une notion, la
   maladie habituelle. */
/** Date ISO → « 12 juil. 2026 » pour les pastilles de journal. */
const fmtDay = (iso: string): string => jourDesFinances(iso);

/* Date d'un règlement de formation (jj/mm/aaaa, ou ISO) → clé de mois « aaaa-mm ». */
const payMonthKey = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2]}`;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${iso[1]}-${iso[2]}` : '';
};
/* … et → ISO « aaaa-mm-jj » pour l'affichage/tri du journal. */
const payISO = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : d;
};

/* LA TEINTE DE CHAQUE MAISON, fixée à la maison et non à son rang du mois. */
const TEINTE_DE_LA_MAISON: Record<MaisonBucket, string> = { atelier: TEINTES[0], studio: TEINTES[1], plateau: TEINTES[2] };

/* « oct. 26 » sous une colonne : l'année se lit même quand la fenêtre passe janvier. */
const moisCourt = (mk: string): string => `${monthShort(mk)} ${mk.slice(2, 4)}`;

export default function Synthese() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const [invoices] = useInvoices();
  /* CE QUI ATTEND UN OUI N'EST PAS ENCORE UNE DÉPENSE — 31 août 2026.
     Voir `compteDansLesChiffres` dans `shared/finance.ts`. */
  const expenses = useDepensesComptees();
  const [appts] = useAppointments();
  const [clients] = useClients();
  const [categories] = useCategories();
  const [apprenants] = useApprenants();
  const [abonnes] = useSubscribers();
  const [formations] = useFormations();
  const byId = useServicesById();

  const [showRev, setShowRev] = useState(false);
  const [showExp, setShowExp] = useState(false);
  /* Détail cliquable d'un montant — écritures derrière le chiffre, et ses
     « Voir par » (les `dims` de chaque ligne). */
  const [detail, setDetail] = useState<{ title: string; rows: LigneDuDetail[] } | null>(null);
  /* La fenêtre du graphe : six mois, ou l'année glissante. */
  const [fenetre, setFenetre] = useState<6 | 12>(6);

  const today = todayISO();
  const thisMonth = monthKey(today);
  const [month, setMonth] = useState(thisMonth);
  const prevMonth = shiftMonth(month, -1);

  const {
    revenueOf, expenseOf, series, visitesDu, byCashbox, byMethod, revSources, expenseGroups, expenseRows, topServices, topClients, svcDetail, revMaison, maisonRows, couvertes, rituelRows,
  } = useMemo(() => {
    const nameOf = (id: string) => clients.find((c) => c.id === id)?.name;

    /* TOUTES LES FACTURES, PAS SEULEMENT LES SOLDÉES — 17 août 2026.
       Depuis qu'une pièce peut porter plusieurs règlements, une facture à
       moitié réglée est « envoyée » : filtrer sur `payée` ferait disparaître
       l'argent DÉJÀ REÇU dessus. Ce qui compte n'est plus le statut de la
       pièce mais ses VERSEMENTS, chacun à sa date. */
    const factInv = invoices.filter(
      (i) => i.branchId === branch.id && i.kind === 'facture',
    );
    // Rituels honorés non facturés : la facture d'encaissement, quand elle existe,
    // les compte déjà — on ne retient donc que ceux sans invoiceId (jamais deux fois).
    const honored = appts.filter(
      (a) => a.branchId === branch.id && a.status === 'honoré' && !a.invoiceId,
    );
    const liveExp = expenses.filter((e) => e.branchId === branch.id && !e.stopped);

    // Règlements de formation (Académie) — revenus de la Maison. Les apprenant·e·s
    // ne sont pas rattaché·e·s à une branche : la formation compte comme revenu
    // quelle que soit la branche affichée.
    const fName = (id: string) => formations.find((f) => f.id === id)?.name ?? 'Formation';
    const formationPays = apprenants.flatMap((ap) =>
      (ap.payments ?? []).map((p) => ({
        id: p.id, amount: p.amountXof, who: ap.name, formation: fName(ap.formationId),
        mk: payMonthKey(p.date), iso: payISO(p.date),
      })),
    );

    /* REGLEMENTS D'ABONNEMENT — du chiffre d'affaires, decide par la Maison le
       3 aout 2026 : le pack compte le jour ou il est ENCAISSE, et les rituels
       qu'il couvre restent a zero (`coveredBySub` pose deja priceXof: 0).
       Jusqu'ici le pack n'entrait nulle part : ni a la vente, ni a la
       consommation — le chiffre d'abonnement valait zero partout. */
    const aboPays = abonnes.flatMap((sub) =>
      (sub.payments ?? [])
        .filter((pm) => pm.amountXof > 0)
        .map((pm) => ({ mk: payMonthKey(pm.date), amount: pm.amountXof })),
    );

    /* LE CA DU MOIS PASSE PAR LA PORTE UNIQUE `revenuDuMois` (clients/_shared) —
       la même que le Dashboard, Analytics et le Bilan. Écran opérationnel : toutes
       les caisses comptent (pas d'exclusion hors bilan). */
    /* ENCAISSÉ À CE JOUR — 25 octobre 2026, aligné sur le tableau de bord
       (1er octobre). Sans borne, la Synthèse comptait dès le 24 un versement
       daté du 29 et disait plus que le tableau de bord pour le même mois. Le
       mois en cours s'arrête à aujourd'hui (`borneDuMois`) ; ce qui est daté
       plus tard se lit dans le projeté, à part. */
    const revenueOf = (mk: string, cut = borneDuMois(mk, today)) =>
      revenuDuMois({ invoices, appts, byId, apprenants, abonnes, branchId: branch.id }, mk, { cut });
    /* Meme regle qu'a l'ecran Depenses ET au Dashboard : une recurrente active
       pese sur chaque mois qu'elle traverse. La porte unique `depensesDuMois`
       (shared/finance.ts) tient cette regle pour tous les ecrans. `cut` ne sert
       qu'à la comparaison à jour égal, comme au tableau de bord. */
    const expenseOf = (mk: string, cut?: string) => depensesDuMois(expenses, branch.id, mk, cut);

    /* LES RITUELS DE CHAQUE MOIS, pour la tuile « Rituels honorés » et sa
       pente : une visite par rendez-vous honoré (les séances 2..N d'une série
       ne recomptent pas la visite) ; le panier moyen ne lit que les rituels
       payants, une séance déjà réglée par un forfait valant 0 F. */
    const visitesParMois = new Map<string, { n: number; payants: number; somme: number }>();
    for (const a of appts) {
      if (a.branchId !== branch.id || a.status !== 'honoré' || (a.seriesIndex && a.seriesIndex > 1)) continue;
      const mk = monthKey(a.date);
      const c = visitesParMois.get(mk) ?? { n: 0, payants: 0, somme: 0 };
      const v = apptNetXof(a, byId);
      visitesParMois.set(mk, { n: c.n + 1, payants: c.payants + (v > 0 ? 1 : 0), somme: c.somme + Math.max(0, v) });
    }

    // Fenêtre de 6 ou 12 mois : elle se termine au présent (ou au futur navigué)
    // et glisse en arrière si le mois choisi sort du cadre — il reste toujours visible.
    const chartEnd = month > thisMonth ? month : thisMonth;
    let windowN = lastMonths(chartEnd, fenetre);
    if (!windowN.includes(month)) windowN = lastMonths(month, fenetre);
    const series = windowN.map((mk) => {
      const rev = revenueOf(mk);
      const exp = expenseOf(mk);
      const vis = visitesParMois.get(mk) ?? { n: 0, payants: 0, somme: 0 };
      return {
        mk, rev, exp, net: rev - exp, selected: mk === month,
        rituels: vis.n, panier: vis.payants > 0 ? Math.round(vis.somme / vis.payants) : 0,
      };
    });
    /* Le mois d'avant peut tomber hors de la fenêtre : la tuile le relit ici,
       borné au même jour quand on compare le mois en cours. */
    const visitesDu = (mk: string, cut?: string) => {
      if (!cut) {
        const vis = visitesParMois.get(mk) ?? { n: 0, payants: 0, somme: 0 };
        return { n: vis.n, panier: vis.payants > 0 ? Math.round(vis.somme / vis.payants) : 0 };
      }
      let n = 0, payants = 0, somme = 0;
      for (const a of appts) {
        if (a.branchId !== branch.id || a.status !== 'honoré' || (a.seriesIndex && a.seriesIndex > 1)) continue;
        if (monthKey(a.date) !== mk || a.date > cut) continue;
        const v = apptNetXof(a, byId);
        n += 1; if (v > 0) { payants += 1; somme += v; }
      }
      return { n, panier: payants > 0 ? Math.round(somme / payants) : 0 };
    };

    // — Détail du mois sélectionné —
    /* Les pièces qui ont REÇU de l'argent ce mois-ci — pas celles émises ce
       mois-ci. Une facture d'août encaissée en septembre appartient à
       septembre, et une facture réglée en deux fois appartient aux deux. */
    /* La même borne que le total : tout ce qui se ventile (caisses, modes,
       clientes, sources, prestations) s'arrête au même jour que lui. */
    const borne = borneDuMois(month, today);
    const dansLaBorne = (d?: string) => !borne || (d ?? '') <= borne;
    const regleDuMois = (i: (typeof factInv)[number]) => invoiceReglements(i)
      .filter((pm) => (pm.date ?? '').startsWith(month) && dansLaBorne(pm.date))
      .reduce((n, pm) => n + pm.amountXof, 0);
    const invM = factInv.filter((i) => regleDuMois(i) > 0);
    const ritM = honored.filter((a) => monthKey(a.date) === month && dansLaBorne(a.date));
    const payM = formationPays.filter((p) => p.mk === month && dansLaBorne(p.iso));

    const bump = (m: Map<string, { value: number; count: number }>, key: string, v: number) => {
      const cur = m.get(key) ?? { value: 0, count: 0 };
      m.set(key, { value: cur.value + v, count: cur.count + 1 });
    };
    const spread = (m: Map<string, { value: number; count: number }>) =>
      Array.from(m.entries())
        .map(([name, { value, count }]) => ({ name, value, count }))
        .sort((a, b) => b.value - a.value);

    // Revenus par caisse créditée — factures + rituels honorés (pseudo-caisse).
    // La part réglée par AVOIR (avoirXof) est du revenu mais PAS de l'argent
    // physique : elle va au poste « Avoir (crédit) », jamais dans une caisse.
    /* VERSEMENT PAR VERSEMENT, plus pièce par pièce : un rituel réglé moitié en
       espèces moitié en Mobile Money crédite DEUX caisses, et l'ancien calcul
       — total moins l'avoir, rangé dans la seule caisse de la pièce — les
       confondait en une. */
    const caisseMap = new Map<string, { value: number; count: number }>();
    invM.forEach((i) => {
      for (const p of invoiceReglements(i)) {
        if (!(p.date ?? '').startsWith(month) || !dansLaBorne(p.date) || p.amountXof <= 0) continue;
        if (p.method === 'Avoir') bump(caisseMap, 'Avoir (crédit)', p.amountXof);
        else bump(caisseMap, cashboxLabel(p.cashbox), p.amountXof);
      }
    });
    ritM.forEach((a) => bump(caisseMap, 'Rituels honorés', apptNetXof(a, byId)));
    payM.forEach((p) => bump(caisseMap, 'Académie · formations', p.amount));
    const byCashbox = spread(caisseMap);

    // Revenus par mode de paiement (l'avoir a son propre poste, pas une caisse).
    const methodMap = new Map<string, { value: number; count: number }>();
    invM.forEach((i) => {
      for (const p of invoiceReglements(i)) {
        if (!(p.date ?? '').startsWith(month) || !dansLaBorne(p.date) || p.amountXof <= 0) continue;
        bump(methodMap, p.method === 'Avoir' ? 'Avoir (crédit)' : (p.method || 'Non précisé'), p.amountXof);
      }
    });
    ritM.forEach((a) => bump(methodMap, 'Rituel · carnet', apptNetXof(a, byId)));
    payM.forEach((p) => bump(methodMap, 'Académie · formation', p.amount));
    const byMethod = spread(methodMap);

    // Top prestations du mois — tous les rituels honorés du mois (facturés ou non),
    // au prix net de la remise ; les séances 2..N d'une série valent 0 (jamais deux fois).
    const honoredAll = appts.filter(
      (a) => a.branchId === branch.id && a.status === 'honoré'
        && monthKey(a.date) === month && dansLaBorne(a.date) && !(a.seriesIndex && a.seriesIndex > 1),
    );
    const svcMap = new Map<string, { value: number; count: number }>();
    const svcDetail = new Map<string, LigneDuDetail[]>();
    honoredAll.forEach((a) => {
      const disc = apptDiscountFactor(a, byId);
      apptServices(a, byId).forEach((s) => {
        const amt = Math.round(s.priceXof * disc);
        bump(svcMap, s.name, amt);
        svcDetail.set(s.name, [...(svcDetail.get(s.name) ?? []), {
          date: a.date, who: nameOf(a.clientId) ?? 'Cliente', meta: s.name, amount: amt,
          dims: { Cliente: nameOf(a.clientId) ?? 'Cliente', Maître: a.master ?? '' },
        }]);
      });
    });
    const topServices = spread(svcMap).slice(0, 5);

    /* LE CHIFFRE DE CHAQUE MAISON. L'Atelier MND™ et le Studio ACƆ™ partagent
       une branche, une caisse et un plateau : rien dans le rendez-vous ne dit
       de qui il relève. C'est le catalogue qui le sait — chaque atelier porte
       sa maison — alors on ventile LIGNE À LIGNE, jamais rendez-vous par
       rendez-vous : une visite qui enchaîne un resserrage et des tresses
       nourrit les deux, et trancher pour l'une en déplacerait tout le montant.

       On répartit le NET encaissé (remises comprises) au prorata des prix
       catalogue — la somme des parts égale toujours le net du rendez-vous. */
    const catById = new Map(categories.map((c) => [c.id, c]));
    const partsOf = (a: Appointment): Part[] => {
      const net = apptNetXof(a, byId);
      const poids = a.serviceIds.map((id) => byId.get(id)?.priceXof ?? 0);
      const parts = splitByWeights(net, poids);
      return a.serviceIds.map((id, i) => ({ serviceId: id, amountXof: parts[i] }));
    };
    /* TOUS les rituels honorés du mois, pas seulement ceux restés hors facture.
       `ritM` exclut les rendez-vous rattachés à une facture — c'est juste pour
       le REVENU, qui les compte alors par la facture et ne doit pas les compter
       deux fois. Mais pour la VENTILATION, cette exclusion effaçait des visites
       bel et bien honorées : le 31 juillet, des Tresses Jumbo passées en caisse
       ne comptaient nulle part, et le Studio affichait trois écritures au lieu
       de quatre. On ventile donc le même ensemble que TOP PRESTATIONS. */
    /* CE QUE CHAQUE FORMULE A FAIT TRAVAILLER. Ces seances valent 0 F -- elles
       sont deja payees -- donc elles n'apparaissent dans aucun chiffre
       d'affaires. Sans ce comptage, un forfait vendu 380 000 F et un abonnement
       mensuel se ressemblaient : du travail fourni, invisible partout. */
    const couvertes = { abonnement: 0, forfait: 0 };
    for (const a of honoredAll) {
      if (!a.coveredBySub) continue;
      couvertes[a.coverKind === 'forfait' ? 'forfait' : 'abonnement'] += 1;
    }

    const revMaison = totalsOf(honoredAll, partsOf, byId, catById);

    /* LE DÉTAIL DERRIÈRE CHAQUE MONTANT. Un chiffre par maison qu'on ne peut pas
       ouvrir demande de le croire ; celui-ci se justifie visite par visite. Un
       rendez-vous mixte apparaît sous les deux maisons, chacune pour SA part —
       c'est la même règle que le total, montrée. */
    const maisonRows: Record<MaisonBucket, LigneDuDetail[]> =
      { atelier: [], studio: [], plateau: [] };
    honoredAll.forEach((a) => {
      const t = splitByMaison(partsOf(a), byId, catById);
      MAISON_BUCKETS.forEach((m) => {
        if (t[m.k] > 0) {
          maisonRows[m.k].push({
            date: a.date,
            who: nameOf(a.clientId) ?? 'Cliente',
            meta: apptLabel(a, byId),
            amount: t[m.k],
            dims: { Cliente: nameOf(a.clientId) ?? 'Cliente', Maître: a.master ?? '' },
          });
        }
      });
    });
    MAISON_BUCKETS.forEach((m) => maisonRows[m.k].sort((x, y) => (y.date ?? '').localeCompare(x.date ?? '')));

    /* Les rituels honorés du mois, derrière la tuile « Rituels honorés ». */
    const rituelRows: LigneDuDetail[] = honoredAll
      .map((a) => ({
        date: a.date,
        who: nameOf(a.clientId) ?? 'Cliente',
        meta: [apptLabel(a, byId), a.master, a.coveredBySub ? 'déjà payée' : ''].filter(Boolean).join(' · '),
        amount: apptNetXof(a, byId),
        dims: { Cliente: nameOf(a.clientId) ?? 'Cliente', Maître: a.master ?? '', Rituel: apptLabel(a, byId) },
      }))
      .sort((x, y) => (y.date ?? '').localeCompare(x.date ?? ''));

    // Meilleures clientes du mois — factures payées + rituels honorés non facturés
    const cliMap = new Map<string, { value: number; count: number }>();
    invM.forEach((i) => bump(cliMap, i.clientName ?? nameOf(i.clientId) ?? 'Cliente de passage', regleDuMois(i)));
    ritM.forEach((a) => bump(cliMap, nameOf(a.clientId) ?? 'Cliente', apptNetXof(a, byId)));
    payM.forEach((p) => bump(cliMap, p.who, p.amount));
    const topClients = spread(cliMap).slice(0, 5);

    // Sources itemisées — factures payées + rituels honorés, du plus récent
    const revSources = [
      ...invM.map((i) => ({
        key: `f-${i.id}`,
        date: i.date,
        who: i.clientName ?? nameOf(i.clientId) ?? 'Cliente de passage',
        title: `Facture ${i.number}`,
        mode: i.payment ?? 'Paiement non précisé',
        cashbox: i.cashbox ? cashboxLabel(i.cashbox) : '',
        methodKey: i.payment ?? 'Non précisé',
        cashboxKey: cashboxLabel(i.cashbox),
        /* Ce que la pièce a rapporté CE MOIS-CI, à ce jour — pas ce qu'elle vaut. */
        amount: regleDuMois(i),
        source: 'Facture',
      })),
      ...ritM.map((a) => ({
        key: `r-${a.id}`,
        date: a.date,
        who: nameOf(a.clientId) ?? 'Cliente',
        title: apptLabel(a, byId),
        mode: ['Rituel honoré', a.master].filter(Boolean).join(' · '),
        cashbox: '',
        methodKey: 'Rituel · carnet',
        cashboxKey: 'Rituels honorés',
        amount: apptNetXof(a, byId),
        source: 'Rituel honoré',
      })),
      ...payM.map((p) => ({
        key: `af-${p.id}`,
        date: p.iso,
        who: p.who,
        title: `Formation · ${p.formation}`,
        mode: 'Formation · Académie',
        cashbox: 'Académie',
        methodKey: 'Académie · formation',
        cashboxKey: 'Académie · formations',
        amount: p.amount,
        source: 'Formation',
      })),
    ].sort((x, y) => (x.date < y.date ? 1 : -1));

    // Dépenses du mois groupées par catégorie, sous-total décroissant
    const expM = liveExp.filter((e) => monthKey(e.date) === month);
    const groupMap = new Map<string, typeof expM>();
    expM.forEach((e) => {
      const key = e.category || 'Sans catégorie';
      groupMap.set(key, [...(groupMap.get(key) ?? []), e]);
    });
    const expenseGroups = Array.from(groupMap.entries())
      .map(([category, rows]) => ({
        category,
        total: rows.reduce((s, e) => s + expenseTotal(e), 0),
        rows: [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)),
      }))
      .sort((a, b) => b.total - a.total);

    // Lignes de dépense aplaties — pour le détail cliquable « Dépenses ».
    const expenseRows = expM
      .map((e): LigneDuDetail => ({
        date: e.date, who: e.label || 'Dépense', meta: [e.category, e.subcategory, e.cashbox ? cashboxLabel(e.cashbox) : ''].filter(Boolean).join(' · '), amount: expenseTotal(e),
        dims: { Catégorie: e.category || 'Sans catégorie', 'Sous-catégorie': e.subcategory ?? '', Caisse: e.cashbox ? cashboxLabel(e.cashbox) : '', Libellé: e.label || 'Dépense' },
      }))
      .sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));

    return { revenueOf, expenseOf, series, visitesDu, byCashbox, byMethod, revSources, expenseGroups, expenseRows, topServices, topClients, svcDetail, revMaison, maisonRows, couvertes, rituelRows };
  }, [invoices, expenses, appts, clients, apprenants, formations, abonnes, branch.id, month, thisMonth, today, byId, categories, fenetre]);

  /* ② LA COULEUR SUIT LA CHOSE (synthese-graphes-pur) : le rang de chaque
     caisse, mode et catégorie se lit sur TOUT l'historique de la branche, pas
     sur le mois affiché. Une caisse garde sa teinte quand on change de mois. */
  const rangs = useMemo(() => {
    const caisses = new Map<string, number>();
    const modes = new Map<string, number>();
    const cats = new Map<string, number>();
    const ajoute = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
    for (const i of invoices) {
      if (i.branchId !== branch.id || i.kind !== 'facture') continue;
      for (const p of invoiceReglements(i)) {
        if (p.amountXof <= 0) continue;
        ajoute(caisses, p.method === 'Avoir' ? 'Avoir (crédit)' : cashboxLabel(p.cashbox), p.amountXof);
        ajoute(modes, p.method === 'Avoir' ? 'Avoir (crédit)' : (p.method || 'Non précisé'), p.amountXof);
      }
    }
    for (const a of appts) {
      if (a.branchId !== branch.id || a.status !== 'honoré' || a.invoiceId) continue;
      const v = apptNetXof(a, byId);
      ajoute(caisses, 'Rituels honorés', v);
      ajoute(modes, 'Rituel · carnet', v);
    }
    for (const ap of apprenants) {
      for (const p of ap.payments ?? []) { ajoute(caisses, 'Académie · formations', p.amountXof); ajoute(modes, 'Académie · formation', p.amountXof); }
    }
    for (const e of expenses) {
      if (e.branchId === branch.id && !e.stopped) ajoute(cats, e.category || 'Sans catégorie', expenseTotal(e));
    }
    return { caisses: rangsStables(caisses), modes: rangsStables(modes), categories: rangsStables(cats) };
  }, [invoices, appts, apprenants, expenses, branch.id, byId]);

  /* L'ANNÉE SUR CHAQUE MOIS : « octobre 2026 », jamais « octobre » seul. */
  const monthName = monthTitle(month);
  const prevName = monthTitle(prevMonth);
  /* LA COMPARAISON LOYALE, À JOUR ÉGAL — comme le tableau de bord : le mois
     en cours, arrêté à aujourd'hui, se compare au mois d'avant arrêté au même
     jour. Un mois passé se compare au mois d'avant en entier. */
  const enCours = month === thisMonth;
  const borneAvant = enCours ? aJourEgal(prevMonth, today) : undefined;
  const quantieme = (iso: string) => { const j = Number(iso.slice(8, 10)); return j === 1 ? '1er' : String(j); };
  const avantNom = borneAvant ? `Au ${quantieme(borneAvant)} ${prevName}` : prevName;
  const vsNom = borneAvant ? `${prevName}, à jour égal` : prevName;
  const revenue = revenueOf(month);
  const spent = expenseOf(month);
  const net = revenue - spent;
  const prevRevenue = revenueOf(prevMonth, borneAvant);
  const prevSpent = expenseOf(prevMonth, borneAvant);
  const prevNet = prevRevenue - prevSpent;
  const margin = revenue > 0 ? Math.round((net / revenue) * 100) : 0;
  const prevMargin = prevRevenue > 0 ? Math.round(((prevRevenue - prevSpent) / prevRevenue) * 100) : 0;
  const visites = visitesDu(month);
  const visitesAvant = visitesDu(prevMonth, borneAvant);
  /* CE QUI EST ATTENDU D'ICI LA FIN DU MOIS : les versements datés plus tard
     et le reste dû des rendez-vous à venir, le même calcul que la tuile
     « Revenus projetés du mois » du tableau de bord. Rien n'en est acquis. */
  const projete = month >= thisMonth
    ? revenusProjetesDuMois({ invoices, appts, byId, apprenants, abonnes, branchId: branch.id }, month, today)
    : null;
  const indexDuMois = series.findIndex((d) => d.selected);

  /* — Détail cliquable : chaque montant ouvre la liste des écritures qui le
     composent, et ses « Voir par » (cliente, caisse, mode, source). — */
  const openDetail = (title: string, rows: LigneDuDetail[]) => setDetail({ title, rows });
  const ligneDeSource = (src: (typeof revSources)[number], who: string, meta: string): LigneDuDetail => ({
    date: src.date, who, meta, amount: src.amount,
    dims: { Cliente: src.who, Caisse: src.cashboxKey, 'Mode de paiement': src.methodKey, Source: src.source },
  });
  const openRevenue = () =>
    openDetail(`Revenus encaissés · ${monthName}`, revSources.map((x) => ligneDeSource(x, x.who, [x.title, x.mode, x.cashbox].filter(Boolean).join(' · '))));
  const openExpenses = () => openDetail(`Dépenses engagées · ${monthName}`, expenseRows);
  const openResult = () =>
    openDetail(`Résultat net · ${monthName}`, [{ who: 'Revenus encaissés', amount: revenue }, { who: 'Charges & dépenses', amount: -spent }]);
  const openRituels = () => openDetail(`Rituels honorés · ${monthName}`, rituelRows);
  /* Un morceau « Autres » ouvre ensemble tout ce qu'il range. */
  const titreDe = (pt: PartDeLAnneau) => (pt.membres.length > 1 ? `Autres · ${pt.membres.join(', ')}` : pt.nom);
  const openCaisses = (pt: PartDeLAnneau) =>
    openDetail(`Caisse · ${titreDe(pt)} · ${monthName}`, revSources.filter((x) => pt.membres.includes(x.cashboxKey)).map((x) => ligneDeSource(x, x.who, [x.title, x.mode].filter(Boolean).join(' · '))));
  const openModes = (pt: PartDeLAnneau) =>
    openDetail(`Mode de paiement · ${titreDe(pt)} · ${monthName}`, revSources.filter((x) => pt.membres.includes(x.methodKey)).map((x) => ligneDeSource(x, x.who, [x.title, x.cashbox].filter(Boolean).join(' · '))));
  const openCategories = (pt: PartDeLAnneau) =>
    openDetail(`Dépenses · ${titreDe(pt)} · ${monthName}`, expenseRows.filter((e) => pt.membres.includes(e.dims?.['Catégorie'] ?? '')));
  const openClient = (name: string) =>
    openDetail(`Cliente · ${name} · ${monthName}`, revSources.filter((x) => x.who === name).map((x) => ligneDeSource(x, x.title, [x.mode, x.cashbox].filter(Boolean).join(' · '))));
  const openService = (name: string) => openDetail(`Prestation · ${name} · ${monthName}`, svcDetail.get(name) ?? []);

  /* LES MORCEAUX DES ANNEAUX : quatre teintes au rang de l'historique, le
     reste en « Autres » (synthese-graphes-pur). Les maisons ont chacune la leur. */
  const partsCaisses = partsDeLAnneau(byCashbox.map((c) => ({ nom: c.name, valeur: c.value, n: c.count })), rangs.caisses);
  const partsModes = partsDeLAnneau(byMethod.map((m) => ({ nom: m.name, valeur: m.value, n: m.count })), rangs.modes);
  const partsDepenses = partsDeLAnneau(expenseGroups.map((g) => ({ nom: g.category, valeur: g.total, n: g.rows.length })), rangs.categories);
  const partsMaisons = partsDeLAnneau(
    MAISON_BUCKETS.map((m) => ({ nom: m.label, valeur: revMaison[m.k], n: maisonRows[m.k].length })),
    new Map(MAISON_BUCKETS.map((m, i) => [m.label, i])),
  );
  const maisonDe = (nom: string) => MAISON_BUCKETS.find((m) => m.label === nom);
  const totalDe = (parts: PartDeLAnneau[]) => parts.reduce((t, x) => t + x.valeur, 0);

  const [entreesHors] = useEntreesHorsActivite();
  const [emprunts] = useEmprunts();
  /* ══ CE QUI EST ENTRÉ SANS ÊTRE UN GAIN — 11 septembre 2026 ════════
     Maquette validée. Le compte de résultat NE BOUGE PAS : `revenuDuMois`
     ne lit ni apport, ni prêt reçu, ni vente de matériel, et c'est exactement
     ce qu'il faut — un emprunt n'a jamais fait un bon mois. Mais l'argent est
     dans le tiroir, et le taire serait mentir d'une autre façon : il se lit
     SOUS le trait, avec sa propre question.

     DEUX CHIFFRES, DEUX QUESTIONS. Le résultat répond « la maison a-t-elle
     gagné sa vie ce mois-ci ? ». Ce qui est entré en caisse répond « de
     combien je dispose ? ». Les confondre, c'est se croire brillant parce
     qu'on a emprunté. */
  const horsMois = horsActiviteXof(entreesHors, branch.id, month);
  const horsDetail = horsActiviteParMotif(entreesHors, branch.id, month);
  /* LE MIROIR, 11 septembre au soir : rendre n'est pas dépenser. Le principal
     d'un remboursement sort du tiroir sans toucher au résultat — seul le prix
     de l'argent est une charge, et il est DÉJÀ compté dans les dépenses. */
  const sortiesMois = horsActiviteXof(entreesHors, branch.id, month, 'sortie');
  const sortiesDetail = horsActiviteParMotif(entreesHors, branch.id, month, 'sortie');
  const notreDette = detteDeLaMaison(emprunts, branch.id);

  // Compte de résultat
  const pnl = [
    { label: 'Chiffre d’affaires encaissé', value: fmtMoney(revenue, currency), strong: true, col: 'var(--color-indigo)', on: openRevenue },
    { label: 'Charges & dépenses', value: `− ${fmtMoney(spent, currency)}`, strong: false, col: 'var(--ink)', on: openExpenses },
    { label: 'Résultat net', value: fmtMoney(net, currency), strong: true, col: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)', on: openResult },
    { label: 'Marge nette', value: `${margin} %`, strong: false, col: net >= 0 ? 'var(--trf-success)' : 'var(--trf-error)', on: openResult },
  ];

  // — Export CSV du mois : lignes de revenus + lignes de dépenses —
  const csvAmt = (xof: number) => convertFromXof(xof, currency).toFixed(2).replace('.', ',');
  const exportCsv = () => {
    const rows: (string | number)[][] = [
      ['Type', 'Date', 'Libellé', 'Cliente / bénéficiaire', 'Mode / catégorie', 'Caisse', `Montant (${currency})`],
      ...revSources.map((s) => ['Revenu', s.date, s.title, s.who, s.mode, s.cashbox, csvAmt(s.amount)]),
      ...expenseGroups.flatMap((g) =>
        g.rows.map((e) => [
          'Dépense', e.date, e.label || 'Dépense', '',
          [g.category, e.subcategory].filter(Boolean).join(' · '), e.cashbox ?? '', csvAmt(expenseTotal(e)),
        ]),
      ),
    ];
    downloadCsv(`synthese-${month}.csv`, rows);
  };

  return (
    <div className="mnd-rise">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
        <div>
          <Eyebrow>Finances · Synthèse & résultat</Eyebrow>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}>
            Le résultat.
          </h2>
        </div>
        {/* LES RÉGLAGES, EN UNE RANGÉE AU-DESSUS DE TOUT : le mois et la
            fenêtre du graphe pèsent sur chaque chiffre de la page. */}
        <div className="trf-toolbar tsy-outils" style={{ marginTop: 0 }}>
          <MonthNav month={month} onChange={setMonth} />
          <div className="tsy-segs" role="group" aria-label="Fenêtre du graphe">
            {([6, 12] as const).map((n) => (
              <button key={n} type="button" className={`tsy-seg ${fenetre === n ? 'is-on' : ''}`} aria-pressed={fenetre === n} onClick={() => setFenetre(n)}>
                {n} mois
              </button>
            ))}
          </div>
          <button className="trf-act" onClick={exportCsv} title="Télécharger les revenus et dépenses du mois en CSV">
            Exporter (CSV)
          </button>
        </div>
      </div>

      {/* LES QUATRE CHIFFRES DU MOIS : la valeur, l'écart au mois d'avant (une
          hausse des dépenses n'est pas une bonne nouvelle), et la pente. */}
      <div className="tr-grid tr-grid--4 tsy-tuiles">
        <TuileDuMois
          libelle={enCours ? 'Revenus encaissés à ce jour' : 'Revenus encaissés'} valeur={fmtMoney(revenue, currency)}
          ecart={ecartAuMois(revenue, prevRevenue)} avantNom={avantNom} vsNom={vsNom} avantValeur={fmtMoney(prevRevenue, currency)}
          extra={projete && projete.total > 0 ? `Projeté sur le mois : ${fmtMoney(revenue + projete.total, currency)}` : undefined}
          serie={series.map((d) => d.rev)} indexCourant={indexDuMois} onOuvrir={openRevenue}
        />
        <TuileDuMois
          libelle="Dépenses engagées" valeur={fmtMoney(spent, currency)}
          ecart={ecartAuMois(spent, prevSpent, false)} avantNom={avantNom} vsNom={vsNom} avantValeur={fmtMoney(prevSpent, currency)}
          serie={series.map((d) => d.exp)} indexCourant={indexDuMois} onOuvrir={openExpenses}
        />
        <TuileDuMois
          libelle="Résultat net" valeur={fmtMoney(net, currency)}
          ecart={ecartAuMois(net, prevNet)} avantNom={avantNom} vsNom={vsNom} avantValeur={fmtMoney(prevNet, currency)}
          extra={`Marge nette ${margin} %${prevRevenue > 0 ? ` (${prevMargin} % avant)` : ''}`}
          serie={series.map((d) => d.net)} indexCourant={indexDuMois} onOuvrir={openResult}
        />
        <TuileDuMois
          libelle="Rituels honorés" valeur={`${visites.n}`}
          ecart={ecartAuMois(visites.n, visitesAvant.n)} avantNom={avantNom} vsNom={vsNom} avantValeur={`${visitesAvant.n} rituel${visitesAvant.n > 1 ? 's' : ''}`}
          extra={visites.panier > 0 ? `Panier moyen ${fmtMoney(visites.panier, currency)}` : undefined}
          serie={series.map((d) => d.rituels)} indexCourant={indexDuMois} onOuvrir={openRituels}
        />
      </div>

      {/* LE RÉSULTAT MOIS PAR MOIS, et le compte du mois choisi à côté. */}
      <div className="tsy-rangee">
        <div className="trf-panel">
          <div className="tsy-panneau__tete">
            <div className="trf-panel__title">Revenus, dépenses et résultat · {fenetre} mois</div>
            <span className="tsy-panneau__sous">Un clic sur un mois le lit en entier</span>
          </div>
          <ColonnesDuResultat
            mois={series.map((d) => ({ mk: d.mk, court: moisCourt(d.mk), long: monthTitle(d.mk), rev: d.rev, exp: d.exp, net: d.net, selected: d.selected }))}
            currency={currency}
            onChoisir={setMonth}
          />
        </div>

        <div className="trf-panel">
          <div className="trf-panel__title">Compte de résultat · {monthName}</div>
          {pnl.map((p, i) => (
            <div
              key={p.label}
              className="trf-click"
              role="button"
              tabIndex={0}
              onClick={p.on}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); p.on(); } }}
              title="Voir le détail"
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '13px 10px', margin: '0 -10px', borderRadius: 4,
                borderBottom: i < pnl.length - 1 ? '1px solid var(--hairline)' : 'none',
              }}
            >
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: p.strong ? 13.5 : 13, fontWeight: p.strong ? 500 : 300, color: 'var(--ink)' }}>{p.label}</span>
              <span style={{ fontFamily: 'var(--font-sans)', fontWeight: p.strong ? 500 : 400, fontSize: p.strong ? 19 : 15, color: p.col, fontVariantNumeric: 'tabular-nums' }}>{p.value}</span>
            </div>
          ))}
          {/* L'ATTENDU SOUS LE TRAIT : il n'entre pas dans le résultat (rien n'en
              est acquis), il dit ce que le mois vaudra si chacune vient et règle. */}
          {projete && projete.total > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--line)', margin: '10px -10px 2px' }} />
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '11px 10px', margin: '0 -10px', background: 'var(--surface-sunken, var(--indigo-50))', borderRadius: 4,
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                  Encore attendu ce mois
                  <span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>
                    {projete.versements > 0 ? `versements datés plus tard · ${fmtMoney(projete.versements, currency)}` : ''}
                    {projete.versements > 0 && projete.nombre > 0 ? ' · ' : ''}
                    {projete.nombre > 0 ? `reste de ${projete.nombre} rendez-vous à venir · ${fmtMoney(projete.rendezVous, currency)}` : ''}
                  </span>
                </span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--indigo-500, var(--color-indigo))', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoney(projete.total, currency)}
                </span>
              </div>
            </>
          )}
          {(horsMois > 0 || sortiesMois > 0 || notreDette > 0) && (
            <>
              <div style={{ height: 1, background: 'var(--line)', margin: '10px -10px 2px' }} />
              {horsMois > 0 && (
              <div
                title={horsDetail.map((d) => `${d.motif} · ${fmtMoney(d.xof, currency)}`).join(' · ')}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '11px 10px', margin: '0 -10px', background: 'var(--surface-sunken, var(--indigo-50))',
                  borderRadius: 4,
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                  Entrées hors activité
                  <span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>
                    {horsDetail.map((d) => `${d.motif.toLowerCase()} · ${d.n}`).join(' · ')}
                  </span>
                </span>
                <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--indigo-500, var(--color-indigo))', fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoney(horsMois, currency)}
                </span>
              </div>
              )}
              {sortiesMois > 0 && (
                <div
                  title={sortiesDetail.map((d) => `${d.motif} · ${fmtMoney(d.xof, currency)}`).join(' · ')}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    padding: '11px 10px', margin: '0 -10px', background: 'var(--surface-sunken, var(--indigo-50))',
                    borderRadius: 4,
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                    Sorties hors activité
                    <span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>
                      {sortiesDetail.map((d) => `${d.motif.toLowerCase()} · ${d.n}`).join(' · ')}
                    </span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--indigo-500, var(--color-indigo))', fontVariantNumeric: 'tabular-nums' }}>
                    − {fmtMoney(sortiesMois, currency)}
                  </span>
                </div>
              )}
              {(horsMois > 0 || sortiesMois > 0) && (
                <div
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                    padding: '11px 10px', margin: '0 -10px',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                    Mouvement réel de la caisse
                    <span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>activité + hors activité</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtMoney(revenue - spent + horsMois - sortiesMois, currency)}
                  </span>
                </div>
              )}
              {notreDette > 0 && (
                <>
                  <div style={{ height: 1, background: 'var(--line)', margin: '2px -10px 2px' }} />
                  <div
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      padding: '11px 10px', margin: '0 -10px',
                    }}
                  >
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>
                      Ce que la Maison doit encore
                      <span className="mnd-muted" style={{ display: 'block', fontSize: 11 }}>emprunts non soldés, toutes échéances à venir</span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, color: '#8f3b30', fontVariantNumeric: 'tabular-nums' }}>
                      {fmtMoney(notreDette, currency)}
                    </span>
                  </div>
                </>
              )}
            </>
          )}

          <div style={{ marginTop: 14, background: 'var(--color-sable)', borderRadius: 4, padding: '13px 15px', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--ink)' }}>
            {net >= 0
              ? <>La maison dégage <strong style={{ fontWeight: 500, color: 'var(--trf-success)' }}>{fmtMoney(net, currency)}</strong> de résultat en {monthName}. La discipline paie.</>
              : month === thisMonth
                ? <>Le mois est encore jeune : les charges fixes précèdent les encaissements. Le carnet comblera l’écart.</>
                : <>Les charges ont dépassé les encaissements en {monthName}, le détail ci-dessous dit où.</>}
          </div>
        </div>
      </div>

      {/* D'OÙ VIENT L'ARGENT, OÙ IL VA : trois anneaux, chacun cliquable. */}
      <div className="tsy-rangee tsy-rangee--3">
        <div className="trf-panel">
          <div className="trf-panel__title">Revenus par caisse · {monthName}</div>
          <Anneau parts={partsCaisses} currency={currency} total={totalDe(partsCaisses)} libelleTotal="encaissés"
            vide={`Aucun encaissement en ${monthName} pour l’instant.`} onOuvrir={openCaisses} />
        </div>
        <div className="trf-panel">
          <div className="trf-panel__title">Modes de paiement · {monthName}</div>
          <Anneau parts={partsModes} currency={currency} total={totalDe(partsModes)} libelleTotal="encaissés"
            vide="Le mix des paiements se dessinera au premier encaissement." onOuvrir={openModes} />
        </div>
        <div className="trf-panel">
          <div className="trf-panel__title">Dépenses par catégorie · {monthName}</div>
          <Anneau parts={partsDepenses} currency={currency} total={totalDe(partsDepenses)} libelleTotal="dépensés"
            vide={`Aucune dépense engagée en ${monthName}, la maison tient ses comptes au clair.`} onOuvrir={openCategories} />
        </div>
      </div>

      {/* LE PODIUM DU MOIS ET LE CHIFFRE PAR MAISON. Le chiffre par maison ne
          remplace pas le revenu du mois : il en montre l'origine. */}
      <div className="tsy-rangee tsy-rangee--3">
        <div className="trf-panel">
          <div className="tsy-panneau__tete">
            <div className="trf-panel__title">Top prestations · {monthName}</div>
            {/* Le tableau complet, toute période (14 octobre 2026). */}
            <button type="button" className="tsy-lien" onClick={() => navigate('/chiffre-des-prestations')}>Toutes les prestations</button>
          </div>
          <Classement
            lignes={topServices.map((x) => ({ nom: x.name, valeur: x.value, meta: `${x.count} rituel${x.count > 1 ? 's' : ''}` }))}
            currency={currency} vide={`Aucun rituel honoré en ${monthName}, le classement attend ses lauréates.`} onOuvrir={openService}
          />
        </div>
        <div className="trf-panel">
          <div className="trf-panel__title">Meilleures clientes · {monthName}</div>
          <Classement
            lignes={topClients.map((c) => ({ nom: c.name, valeur: c.value, meta: `${c.count} encaissement${c.count > 1 ? 's' : ''}` }))}
            currency={currency} vide={`Aucun encaissement en ${monthName}, les têtes couronnées se font attendre.`} onOuvrir={openClient}
          />
        </div>
        <div className="trf-panel">
          <div className="trf-panel__title">Chiffre par maison · {monthName}</div>
          <Anneau
            parts={partsMaisons} currency={currency} total={sumTotals(revMaison)} libelleTotal="des rituels"
            teinteDe={(pt) => { const m = maisonDe(pt.nom); return m ? TEINTE_DE_LA_MAISON[m.k] : TEINTES[0]; }}
            vide={`Aucun rituel honoré en ${monthName}, rien à ventiler.`}
            onOuvrir={(pt) => { const m = maisonDe(pt.nom); if (m) openDetail(`${m.label} · ${monthName}`, maisonRows[m.k]); }}
          />
          {sumTotals(revMaison) > 0 && (
            <div className="tsy-note">
              Rituels honorés, ventilés ligne à ligne : une visite mixte nourrit les deux maisons, chacune à hauteur de ce
              qu'elle a fait. « Plateau seul » : les lavages et soins vendus sans rituel d'une maison.
              {revenue - sumTotals(revMaison) > 0 && (
                <> S'y ajoutent <strong style={{ fontWeight: 500 }}>{fmtMoney(revenue - sumTotals(revMaison), currency)}</strong> de
                factures, produits et formations, qui ne relèvent d'aucune maison.</>
              )}
            </div>
          )}
        </div>
      </div>

      {(couvertes.abonnement > 0 || couvertes.forfait > 0) && (
        <div className="trf-panel" style={{ marginTop: 18 }}>
          <div className="trf-panel__title">Séances déjà payées · {monthName}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, marginTop: 12 }}>
            {([['Abonnements', couvertes.abonnement], ['Forfaits', couvertes.forfait]] as const).map(([nom, n]) => (
              <div key={nom} style={{ minWidth: 150 }}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>{nom}</div>
                <div style={{ fontSize: 22, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {n} séance{n > 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.55 }}>
            Du travail fourni ce mois-ci sans encaissement : ces séances étaient déjà réglées, à la vente
            du forfait ou du pack. Elles ne comptent donc dans aucun chiffre d'affaires, mais elles ont
            occupé le fauteuil, et c'est ce que ce compte rend visible.
          </div>
        </div>
      )}

      {/* Détail des revenus — sources, mode de paiement, caisse */}
      <div className="trf-panel" style={{ marginTop: 18 }}>
        <div className="trf-detail__head">
          <div className="trf-panel__title" style={{ marginBottom: 0 }}>Détail des revenus · {monthName}</div>
          <button className="trf-iconbtn" onClick={() => setShowRev((v) => !v)}>
            {showRev ? 'Masquer le détail' : 'Voir le détail'} · {fmtMoney(revenue, currency)}
          </button>
        </div>
        {showRev && (
          revSources.length === 0 ? (
            <div className="trf-empty" style={{ marginTop: 14 }}>Aucun encaissement en {monthName}, ni facture payée, ni rituel honoré.</div>
          ) : (
            <div style={{ marginTop: 16 }}>
              <div className="trf-detail__grid">
                <div>
                  <div className="trf-detail__sub">Par mode de paiement</div>
                  {byMethod.map((m) => (
                    <div className="trf-tally" key={m.name}>
                      <span className="trf-tally__k">{m.name}<span className="trf-tally__n">{m.count} encaissement{m.count > 1 ? 's' : ''}</span></span>
                      <span className="trf-tally__v">{fmtMoney(m.value, currency)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="trf-detail__sub">Par caisse créditée</div>
                  {byCashbox.map((c) => (
                    <div className="trf-tally" key={c.name}>
                      <span className="trf-tally__k">{c.name}<span className="trf-tally__n">{c.count} encaissement{c.count > 1 ? 's' : ''}</span></span>
                      <span className="trf-tally__v">{fmtMoney(c.value, currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="trf-detail__sub" style={{ marginTop: 22 }}>Sources · {revSources.length}</div>
              {revSources.map((s) => (
                <div className="trf-exprow" key={s.key}>
                  <span className="trf-datepill">{fmtDay(s.date)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="trf-exprow__vendor">{s.who}</div>
                    <div className="trf-exprow__meta">{[s.title, s.mode, s.cashbox].filter(Boolean).join(' · ')}</div>
                  </div>
                  <span className="trf-exprow__amt">{fmtMoney(s.amount, currency)}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* Détail des dépenses — groupées par catégorie */}
      <div className="trf-panel" style={{ marginTop: 18 }}>
        <div className="trf-detail__head">
          <div className="trf-panel__title" style={{ marginBottom: 0 }}>Détail des dépenses · {monthName}</div>
          <button className="trf-iconbtn" onClick={() => setShowExp((v) => !v)}>
            {showExp ? 'Masquer le détail' : 'Voir le détail'} · {fmtMoney(spent, currency)}
          </button>
        </div>
        {showExp && (
          expenseGroups.length === 0 ? (
            <div className="trf-empty" style={{ marginTop: 14 }}>Aucune dépense engagée en {monthName}, la maison tient ses comptes au clair.</div>
          ) : (
            <div style={{ marginTop: 14 }}>
              {expenseGroups.map((g) => (
                <div className="trf-catgroup" key={g.category}>
                  <div className="trf-catgroup__head">
                    <span className="trf-catgroup__name">{g.category}</span>
                    <span className="trf-catgroup__sum">{fmtMoney(g.total, currency)}</span>
                  </div>
                  {g.rows.map((e) => (
                    <div key={e.id}>
                      <div className="trf-exprow">
                        <span className="trf-datepill">{fmtDay(e.date)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="trf-exprow__vendor">{e.label || 'Dépense'}</div>
                          <div className="trf-exprow__meta">{[e.subcategory, e.cashbox].filter(Boolean).join(' · ') || '—'}</div>
                        </div>
                        <span className="trf-exprow__amt">{fmtMoney(expenseTotal(e), currency)}</span>
                      </div>
                      {e.items && e.items.length > 0 && (
                        <div className="trf-itembreak trf-itembreak--inline">
                          {e.items.map((it) => (
                            <div className="trf-itembreak__row" key={it.id}>
                              <span className="trf-itembreak__label">{it.label}</span>
                              <span className="trf-itembreak__val">{fmtMoney(it.amountXof, currency)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* ══ LES PALIERS — 16 septembre 2026 ═══════════════════════════════
          Maquette `maquette-les-trois-paliers.html`. C'est le chiffre qui dit
          si la Maison fait grandir ses clientes, ou si elle recommence chaque
          mois à la Fondation. */}
      <LesPaliers clients={clients} appts={appts} byId={byId} branchId={branch.id} month={month} monthName={monthName} mois={series.map((d) => d.mk)} onChoisir={setMonth} />

      {/* Détail cliquable d'un montant : les écritures qui le composent, et « Voir par ». */}
      {detail && (
        <FenetreDuDetail
          key={detail.title}
          titre={detail.title}
          lignes={detail.rows}
          currency={currency}
          vide={`Aucune écriture derrière ce montant en ${monthName}.`}
          fmtJour={fmtDay}
          onFermer={() => setDetail(null)}
        />
      )}
    </div>
  );
}

/* ══ LES PALIERS DE LA MAISON — 16 septembre 2026 ═════════════════════
   Le même juge que la fiche cliente et Ma Couronne (`palierDuCarnet`), passé
   sur toutes les têtes de la branche. Aucune projection : des rituels
   honorés, des dates. Le mois choisi dit qui est MONTÉE ce mois-là, et
   combien de rituels honorés relèvent de chaque palier.

   EN GRAPHES (25 octobre 2026) : les rituels de chaque palier, mois par
   mois, et les clientes par palier en une barre. Trois marches ORDONNÉES :
   une seule teinte, du clair (Fondation) au foncé (Souveraineté), éprouvée
   comme une rampe (clarté qui monte, écarts visibles, le clair tient 2:1 sur
   l'ivoire). */
const RAMPE_DES_PALIERS: Record<Palier, string> = { Fondation: '#8F9BD3', 'Élévation': '#5263BE', 'Souveraineté': '#283371' };

function LesPaliers({ clients, appts, byId, branchId, month, monthName, mois, onChoisir }: {
  clients: Client[];
  appts: Appointment[];
  byId: ReturnType<typeof useServicesById>;
  branchId: string;
  month: string;
  monthName: string;
  /** Les mois du graphe (la fenêtre de 6 ou 12 mois de la page). */
  mois: string[];
  onChoisir: (mk: string) => void;
}) {
  const [reglages] = useSettings();
  const cleDesMois = mois.join(',');
  const lecture = useMemo(() => {
    const aujourdhui = jourLocal();
    const tetes = clients.filter((c) => c.branchId === branchId);
    const paliers = tetes.map((c) => palierDuCarnet(c, appts, byId, aujourdhui, reglages.paliers));
    return {
      total: tetes.length,
      repartition: repartitionDesPaliers(paliers, month),
      parMois: cleDesMois.split(',').filter(Boolean).map((mk) => ({ mk, rituels: rituelsDuMoisParPalier(appts, byId, mk, branchId) })),
    };
  }, [clients, appts, byId, branchId, month, reglages.paliers, cleDesMois]);
  if (lecture.total === 0) return null;
  const avecPalier = lecture.total - lecture.repartition.sansPalier;
  const montees = PALIERS.reduce((s, p) => s + lecture.repartition.monteesDuMois[p], 0);
  const rituels = (n: number) => `${n} rituel${n > 1 ? 's' : ''}`;
  return (
    <div className="tsy-titre-section">
      <Eyebrow>Les paliers · où en sont les couronnes</Eyebrow>
      <div className="tsy-rangee" style={{ marginTop: 10 }}>
        <div className="trf-panel">
          <div className="tsy-panneau__tete">
            <div className="trf-panel__title">Rituels honorés par palier · {mois.length} mois</div>
            <span className="tsy-panneau__sous">Un clic sur un mois le lit en entier</span>
          </div>
          <ColonnesEmpilees
            colonnes={lecture.parMois.map((m) => ({
              cle: m.mk, court: moisCourt(m.mk), long: monthTitle(m.mk),
              valeurs: PALIERS.map((p) => m.rituels[p]), marque: m.mk === month,
            }))}
            series={PALIERS.map((p) => ({ nom: p, teinte: RAMPE_DES_PALIERS[p] }))}
            fmt={rituels} fmtAxe={(v) => v.toLocaleString('fr-FR')} pasMin={1}
            onChoisir={onChoisir} consigne="Cliquer pour lire ce mois"
            vide="Aucun rituel honoré sur ces mois, les marches attendent leurs premières couronnes."
          />
        </div>
        <div className="trf-panel">
          <div className="trf-panel__title">Les clientes par palier</div>
          <BarreDesParts
            parts={PALIERS.map((p) => {
              const m = lecture.repartition.monteesDuMois[p];
              return {
                nom: p, valeur: lecture.repartition.parPalier[p], teinte: RAMPE_DES_PALIERS[p],
                marque: <span className={`mnd-palier mnd-palier--${RANG_DU_PALIER[p]}`}>{p}</span>,
                detail: `${PALIER_DIT[p].sous} ${m > 0 ? `${m} montée${m > 1 ? 's' : ''}` : 'Aucune montée'} en ${monthName}.`,
              };
            })}
            vide="Aucune cliente n'a encore de rituel honoré : pas de palier à lire."
          />
          <div className="tsy-note">
            {avecPalier} cliente{avecPalier > 1 ? 's' : ''} avec un rituel honoré
            {lecture.repartition.sansPalier > 0 ? `, ${lecture.repartition.sansPalier} sans palier encore (aucun rituel honoré)` : ''}.
            {montees > 0 ? ` ${montees} montée${montees > 1 ? 's' : ''} de palier en ${monthName}.` : ''}
            {' '}Le palier se lit sur le carnet, il ne se saisit pas : les seuils se règlent dans Paramètres.
          </div>
        </div>
      </div>
    </div>
  );
}
