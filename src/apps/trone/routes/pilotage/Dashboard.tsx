import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eyebrow, Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { estCouronnee, joursAvantAnniversaire, useClients } from '../../../../shared/clients';
import { appointmentsStore, tetesVenues, type Appointment } from '../../../../shared/agenda';
import { useCategories } from '../../../../shared/catalog';
import { useInvoices, useExpenses, invoiceTotal, invoiceCashXof, expenseTotal } from '../../../../shared/finance';
import { useApprenants, useEnvois } from '../equipe/data';
import { splitByWeights } from '../../../../shared/pricing';
import { totalsOf, MAISON_BUCKETS, emptyTotals, sumTotals, type Part } from '../../../../shared/maisons';
import {
  Avatar, PayStatusPill, RdvModal, ReminderBell, SourceBadge, StatusPill, apptLabel, apptTotalXof, apptNetXof, apptDueXof, addDaysISO, frShort, fromISO,
  predictNextVisit, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
  DrillModal, type Drill, type DrillRow,
} from '../clients/_shared';
import { useBilans } from '../../../../shared/bilans';
import { composeStore, compositionsRecuesStore } from '../../../../shared/bridges';
import { useEnfantsDeclares, nomPropose } from '../../../../shared/enfants';
import { createStore, useStore } from '../../../../shared/store';
import { PayAppointmentModal, honorAppointment } from '../clients/actions';
import { useAuth, useStaff } from '../../../../shared/auth';
import './pilotage.css';

/* Tableau de bord — la salle du conseil au matin. Tout est dérivé des magasins,
   filtré par la branche, exprimé dans sa devise. */

/* Les arrivées d'enfants DÉJÀ REÇUES (marquées d'un geste) — mémoire locale du
   poste, comme la file des compositions : le journal `enfants_declares`, lui,
   reste intact. */
const enfantsRecusVusStore = createStore<string[]>('mnd_enfants_recus_vus', []);

const monthKey = (iso: string) => iso.slice(0, 7);
/* Date d'un règlement de formation (jj/mm/aaaa, ou ISO) → clé de mois / jour ISO. */
const payMonthKey = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}` : d.slice(0, 7);
};
const payISO = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : d;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const [allClients] = useClients();
  const byId = useServicesById();
  const [invoices] = useInvoices();
  const [expenses] = useExpenses();
  const [categories] = useCategories();
  /* Index des catégories — c'est leur `maison` qui range le chiffre côté
     Atelier ou côté Studio. */
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const [apprenants] = useApprenants();

  const [breakOpen, setBreakOpen] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);

  const today = todayISO();
  const now = new Date();
  const greeting = now.getHours() >= 17 || now.getHours() < 5 ? 'Bonsoir' : 'Bonjour';
  /* Salutation à la personne connectée — nom du personnel, sinon la partie
     locale de l'e-mail ; jamais un nom en dur. */
  const { session } = useAuth();
  const staff = useStaff();
  const rawWho = (staff?.name?.trim().split(' ')[0]) || (session?.user?.email?.split('@')[0]) || '';
  const who = rawWho ? rawWho.charAt(0).toUpperCase() + rawWho.slice(1) : '';
  const thisMonth = monthKey(today);
  const prevMonth = monthKey(addDaysISO(`${thisMonth}-01`, -1));
  const prevMonthName = fromISO(`${prevMonth}-15`).toLocaleDateString('fr-FR', { month: 'long' });
  /* LA COMPARAISON LOYALE — À JOUR ÉGAL. Comparer dix jours d'août à juillet
     PLEIN affichait « ▼ 91 % » tous les débuts de mois : une alarme fictive
     permanente, qui apprend à ne plus croire le rouge. On borne donc le mois
     précédent au même jour (clampé à sa longueur), et on le dit sous le
     chiffre. */
  const jourDuMois = Number(today.slice(8, 10));
  const finPrev = new Date(Number(prevMonth.slice(0, 4)), Number(prevMonth.slice(5, 7)), 0).getDate();
  const cutPrev = `${prevMonth}-${String(Math.min(jourDuMois, finPrev)).padStart(2, '0')}`;

  const { revenue, prevRevenue, spent, prevSpent, rev7, todayRows, revMaison } = useMemo(() => {
    /* Une prestation encaissée porte un invoiceId : sa facture (payée) la compte déjà.
       On ne recompte donc jamais l'appt côté carnet → fini le double comptage carnet+caisse. */
    /* SEUL un rituel HONORÉ est du chiffre. L'ancienne présomption « confirmé et
       daté d'aujourd'hui ou avant = réalisé » comptait les RDV du jour dès le matin
       (avant que la cliente n'arrive) et les no-shows confirmés pour toujours —
       des revenus « réels » qui n'avaient jamais eu lieu. */
    const realized = (a: Appointment) => !a.invoiceId && a.status === 'honoré';
    const realizedAppts = appts.filter(realized);
    const paidInv = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée');

    /* `cut` : borne haute du jour (comparaison à jour égal) — absent, le mois entier. */
    const apptRev = (mk: string, cut?: string) => realizedAppts
      .filter((a) => monthKey(a.date) === mk && (!cut || a.date <= cut))
      .reduce((s, a) => s + apptNetXof(a, byId), 0);
    const invRev = (mk: string, cut?: string) => paidInv
      .filter((i) => monthKey(i.date) === mk && (!cut || i.date <= cut))
      .reduce((s, i) => s + invoiceTotal(i), 0);
    const exp = (mk: string, cut?: string) =>
      expenses
        .filter((e) => e.branchId === branch.id && monthKey(e.date) === mk && !e.stopped && (!cut || e.date <= cut))
        .reduce((s, e) => s + expenseTotal(e), 0);

    // Règlements de formation (Académie) — revenu réel de la Maison (hors branche).
    const formPays = apprenants.flatMap((ap) =>
      (ap.payments ?? []).map((p) => ({ amount: p.amountXof, mk: payMonthKey(p.date), iso: payISO(p.date) })),
    );
    const formRev = (mk: string, cut?: string) => formPays
      .filter((p) => p.mk === mk && (!cut || p.iso <= cut))
      .reduce((s, p) => s + p.amount, 0);

    /* Revenu réel d'un jour — MÊMES composantes que le mois (carnet non encaissé
       + factures payées + formation) : le graphe 7 jours reste cohérent avec le KPI. */
    const dayRev = (iso: string) =>
      realizedAppts.filter((a) => a.date === iso).reduce((s, a) => s + apptNetXof(a, byId), 0)
      + paidInv.filter((i) => i.date === iso).reduce((s, i) => s + invoiceTotal(i), 0)
      + formPays.filter((p) => p.iso === iso).reduce((s, p) => s + p.amount, 0);

    const rev7 = Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysISO(today, i - 6);
      return { iso, total: dayRev(iso), label: fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase() };
    });

    /* LE CHIFFRE PAR MAISON — Atelier MND™ / Studio ACƆ™.
       Les deux maisons partagent une branche : ce qui les sépare est le
       catalogue. On ventile donc LIGNE À LIGNE, jamais rendez-vous par
       rendez-vous : sept visites portent des rituels des deux maisons, et
       trancher pour l'une aurait basculé 209 000 F du mauvais côté.
       Le total d'un rituel est réparti au prorata des prix catalogue, comme
       partout ailleurs au Trône — la somme des parts égale toujours le total. */
    const partsOf = (a: Appointment): Part[] => {
      const total = apptNetXof(a, byId);
      const poids = a.serviceIds.map((id) => byId.get(id)?.priceXof ?? 0);
      const parts = splitByWeights(total, poids);
      return a.serviceIds.map((id, i) => ({ serviceId: id, amountXof: parts[i] }));
    };
    const revMaison = totalsOf(
      realizedAppts.filter((a) => monthKey(a.date) === thisMonth),
      partsOf, byId, catById,
    );

    return {
      revMaison,
      revenue: apptRev(thisMonth) + invRev(thisMonth) + formRev(thisMonth),
      /* À JOUR ÉGAL : le mois précédent s'arrête au même jour que nous. */
      prevRevenue: apptRev(prevMonth, cutPrev) + invRev(prevMonth, cutPrev) + formRev(prevMonth, cutPrev),
      spent: exp(thisMonth),
      prevSpent: exp(prevMonth, cutPrev),
      rev7,
      todayRows: appts
        .filter((a) => a.date === today && a.status !== 'annulé')
        .sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
    };
  }, [appts, byId, invoices, expenses, apprenants, branch.id, today, thisMonth, prevMonth, cutPrev]);

  /* — décomposition du revenu du mois : rituels par catégorie + encaissements par moyen — */
  const breakdown = useMemo(() => {
    // Même règle que le revenu : un rituel encaissé (invoiceId) est compté par sa facture, pas ici.
    /* SEUL un rituel HONORÉ est du chiffre. L'ancienne présomption « confirmé et
       daté d'aujourd'hui ou avant = réalisé » comptait les RDV du jour dès le matin
       (avant que la cliente n'arrive) et les no-shows confirmés pour toujours —
       des revenus « réels » qui n'avaient jamais eu lieu. */
    const realized = (a: Appointment) => !a.invoiceId && a.status === 'honoré';

    const rit = new Map<string, { count: number; total: number }>();
    for (const a of appts) {
      if (monthKey(a.date) !== thisMonth || !realized(a)) continue;
      for (const sid of a.serviceIds) {
        const sv = byId.get(sid);
        if (!sv) continue;
        const cur = rit.get(sv.categoryId) ?? { count: 0, total: 0 };
        cur.count += 1;
        cur.total += sv.priceXof;
        rit.set(sv.categoryId, cur);
      }
    }
    const rituels = [...rit]
      .map(([catId, v]) => {
        const cat = categories.find((c) => c.id === catId);
        return { id: catId, label: cat ? `${cat.fon} · ${cat.label}` : 'Hors catalogue', ...v };
      })
      .sort((a, b) => b.total - a.total);

    const pay = new Map<string, { count: number; total: number }>();
    for (const i of invoices) {
      if (i.branchId !== branch.id || monthKey(i.date) !== thisMonth || i.kind !== 'facture' || i.status !== 'payée') continue;
      const k = i.payment ?? 'Autre';
      const cur = pay.get(k) ?? { count: 0, total: 0 };
      cur.count += 1;
      cur.total += invoiceTotal(i);
      pay.set(k, cur);
    }
    const encaissements = [...pay].map(([k, v]) => ({ id: k, label: k, ...v }));
    // Formation de l'Académie — un encaissement du mois, tous parcours confondus.
    const scol = apprenants
      .flatMap((ap) => ap.payments ?? [])
      .filter((p) => payMonthKey(p.date) === thisMonth)
      .reduce((acc, p) => ({ count: acc.count + 1, total: acc.total + p.amountXof }), { count: 0, total: 0 });
    if (scol.total > 0) encaissements.push({ id: 'academie', label: 'Académie · formation', count: scol.count, total: scol.total });
    encaissements.sort((a, b) => b.total - a.total);

    return {
      rituels,
      encaissements,
      rituelsTotal: rituels.reduce((s, r) => s + r.total, 0),
      encTotal: encaissements.reduce((s, e) => s + e.total, 0),
    };
  }, [appts, byId, categories, invoices, apprenants, branch.id, thisMonth, today]);

  /* Rendez-vous impayés — solde restant dû (net − acompte − encaissé), hors annulés.
     Scindés : ÉCHUS (date passée, en retard) d'un côté, À VENIR (aujourd'hui + futur)
     de l'autre. Chaque groupe trié du plus ancien au plus lourd, avec son total. */
  const unpaid = useMemo(() => {
    const rows = appts
      .filter((a) => a.status !== 'annulé' && apptDueXof(a, byId) > 0)
      .map((a) => ({ a, net: apptNetXof(a, byId), due: apptDueXof(a, byId) }));
    const byDate = (x: typeof rows[number], y: typeof rows[number]) =>
      (x.a.date < y.a.date ? -1 : x.a.date > y.a.date ? 1 : y.due - x.due);
    const sum = (rs: typeof rows) => rs.reduce((s, r) => s + r.due, 0);
    const overdue = rows.filter((r) => r.a.date < today).sort(byDate);
    const upcoming = rows.filter((r) => r.a.date >= today).sort(byDate);
    return {
      overdue: { rows: overdue, total: sum(overdue) },
      upcoming: { rows: upcoming, total: sum(upcoming) },
    };
  }, [appts, byId, today]);

  /* ---------- Ce qui presse — des gestes, pas des constats ----------

     LE RÉASSORT N'Y EST PLUS (décision de Yéman, 11 août). Il occupait
     jusqu'à quatre lignes sur cinq et repoussait l'argent en bas de la carte,
     alors qu'un manque de flacons se voit au comptoir et se traite dans Stock
     & Achats. Ce panneau ne garde que ce qui presse VRAIMENT le matin :
     l'argent qui doit rentrer, et la parole due à une cliente. */
  const [bilans] = useBilans();
  const unpaidRef = useRef<HTMLDivElement>(null);

  /* « Têtes couronnées » comptait les FICHES de la branche — donc aussi les
     comptes ouverts sur Ma Couronne sans jamais venir. Une tête est couronnée
     quand la Maison l'a réellement couronnée (11 août). */
  const tetesCouronnees = useMemo(() => {
    const venues = tetesVenues(appts);
    return clients.filter((c) => estCouronnee(c, venues)).length;
  }, [clients, appts]);

  /* LES FACTURES ÉMISES QUI ATTENDENT LEUR RÈGLEMENT — les pièces, pas les
     rendez-vous. On ÔTE celles déjà comptées dans les impayés échus : la même
     somme lue deux fois ferait croire à une dette double. */
  const facturesARegler = useMemo(() => {
    const dejaComptees = new Set(
      unpaid.overdue.rows.map((r) => r.a.invoiceId).filter((id): id is string => !!id),
    );
    const rows = invoices.filter(
      (i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'envoyée' && !dejaComptees.has(i.id),
    );
    const total = rows.reduce(
      (s, i) => s + Math.max(0, invoiceCashXof(i)),
      0,
    );
    return { count: rows.length, total };
  }, [invoices, branch.id, unpaid.overdue.rows]);

  /* LES BILANS DUS — un rituel honoré est une séance dont la cliente attend le
     mot de la maison. On se borne aux TRENTE DERNIERS JOURS : au-delà, le
     bilan a perdu son sens, et une liste sans fin ne se traite jamais. */
  const bilansARemettre = useMemo(() => {
    const depuis = addDaysISO(today, -30);
    const remis = new Set(bilans.map((b) => b.apptId).filter((id): id is string => !!id));
    return appts.filter(
      (a) => a.status === 'honoré' && a.date >= depuis && a.date <= today && !remis.has(a.id),
    ).length;
  }, [appts, bilans, today]);

  /* LES COMPOSITIONS SUR-MESURE (12 août). Le pont `mnd_couronne_compose` ne
     porte que la DERNIÈRE composition transmise — et AVANT ce jour, personne
     ne le lisait : les rituels composés dormaient en base pendant que la
     cliente attendait un WhatsApp promis. Le Tableau de bord MOISSONNE chaque
     payload dans une file locale persistante ; « Ce qui presse » la montre,
     et le geste « Traitée » la solde. */
  const [compoDoc] = useStore(composeStore);
  const [compositions] = useStore(compositionsRecuesStore);
  useEffect(() => {
    if (!compoDoc) return;
    compositionsRecuesStore.set((prev) => (prev.some((r) => r.id === compoDoc.id)
      ? prev
      : [{ ...compoDoc, recueLe: todayISO() }, ...prev]));
  }, [compoDoc]);
  const compoNouvelles = compositions.filter((r) => !r.traiteLe);
  const [compoOpen, setCompoOpen] = useState(false);

  /* JOYEUX ANNIVERSAIRE — dès J−2 (demande de Yéman, 12 août). Une ligne par
     tête dont l'anniversaire tombe sous deux jours, pour préparer le vœu et
     l'envoyer le jour venu. Seules les têtes DÉJÀ VENUES comptent : souhaiter
     l'anniversaire d'un compte Ma Couronne jamais assis n'aurait pas de sens.
     Le compte des jours est le juge partagé (`joursAvantAnniversaire`) — le
     même que le badge « ANNIV. J-N » de la liste des Clientes. */
  const anniversaires = useMemo(() => {
    const venues = tetesVenues(appts);
    return clients
      .filter((c) => !c.archived && c.branchId === branch.id && c.birthday && venues.has(c.id))
      .map((c) => ({ c, j: joursAvantAnniversaire(c.birthday!) }))
      .filter((x) => x.j <= 2)
      .sort((a, b) => a.j - b.j);
  }, [clients, appts, branch.id]);

  /* LES RÉSERVATIONS À RECEVOIR (13 août, « ce qui presse » — demande de
     Yéman). Un rendez-vous pris depuis Ma Couronne arrive « en attente » : la
     cliente attend le sceau de la maison. Or il ne paraissait qu'à SA date au
     Calendrier — une réservation prise pour dans trois semaines restait
     invisible trois semaines. La file les montre tous, et chacun se confirme
     d'un geste. */
  const aRecevoir = useMemo(
    () => appts
      .filter((a) => a.status === 'en attente' && a.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || timeToMin(a.time) - timeToMin(b.time)),
    [appts, today],
  );
  const [attenteOpen, setAttenteOpen] = useState(false);

  /* LES ENFANTS RATTACHÉS DEPUIS MA COURONNE. Depuis le rattachement direct
     (0044), la fiche naît sans passer par une validation — mais une tête qui
     entre au carnet sans qu'on la voie entrer n'est pas reçue. Le journal
     `enfants_declares` (statut accepté) porte chaque arrivée ; « Voir » les
     marque reçues et ouvre les Clientes. */
  const [declares] = useEnfantsDeclares();
  const [enfantsVus] = useStore(enfantsRecusVusStore);
  const enfantsArrives = useMemo(() => {
    const vus = new Set(enfantsVus);
    return declares
      .filter((d) => d.branchId === branch.id && d.statut === 'accepté' && !!d.clientCreeId && !vus.has(d.id))
      .sort((a, b) => b.declareLe.localeCompare(a.declareLe));
  }, [declares, enfantsVus, branch.id]);

  const presseRows = [
    ...(aRecevoir.length > 0 ? [{
      k: 'attente',
      label: `${aRecevoir.length} réservation${aRecevoir.length > 1 ? 's' : ''} à recevoir`,
      sub: aRecevoir.slice(0, 3).map((a) => `${a.clientName || 'Une tête'} · ${frShort(a.date)} ${a.time}`).join(' · ')
        + (aRecevoir.length > 3 ? ' · …' : ''),
      action: 'Recevoir', go: () => setAttenteOpen(true),
    }] : []),
    ...(enfantsArrives.length > 0 ? [{
      k: 'enfants',
      label: `${enfantsArrives.length} enfant${enfantsArrives.length > 1 ? 's' : ''} rattaché${enfantsArrives.length > 1 ? 's' : ''} depuis Ma Couronne`,
      sub: enfantsArrives.slice(0, 4).map((d) => nomPropose(d) || 'Sans nom').join(' · ')
        + (enfantsArrives.length > 4 ? ' · …' : ''),
      action: 'Voir',
      go: () => {
        /* Vus = reçus : la ligne s'éteint, le journal demeure. */
        const ids = enfantsArrives.map((d) => d.id);
        enfantsRecusVusStore.set((prev) => [...new Set([...prev, ...ids])]);
        navigate('/customers');
      },
    }] : []),
    ...(compoNouvelles.length > 0 ? [{
      k: 'compositions',
      label: `${compoNouvelles.length} rituel${compoNouvelles.length > 1 ? 's' : ''} sur-mesure à sceller`,
      sub: compoNouvelles.map((r) => r.client).join(' · '),
      action: 'Voir', go: () => setCompoOpen(true),
    }] : []),
    ...anniversaires.map(({ c, j }) => ({
      k: `anniv-${c.id}`,
      label: `Joyeux anniversaire à ${c.name}`,
      sub: j === 0 ? 'c’est aujourd’hui' : j === 1 ? 'c’est demain' : 'dans 2 jours',
      action: c.phone ? 'Souhaiter' : 'Sa fiche',
      go: () => {
        if (c.phone) {
          const msg = `Joyeux anniversaire, ${c.name} ! Toute la Maison MND pense à vous et vous souhaite une année rayonnante. Votre couronne vous va à merveille.`;
          window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
        } else {
          navigate('/customers');
        }
      },
    })),
    ...(facturesARegler.count > 0 ? [{
      k: 'factures',
      label: `${facturesARegler.count} facture${facturesARegler.count > 1 ? 's' : ''} à régler`,
      sub: `${fmtMoney(facturesARegler.total, currency)} en attente`,
      action: 'Voir', go: () => navigate('/factures'),
    }] : []),
    ...(bilansARemettre > 0 ? [{
      k: 'bilans',
      label: `${bilansARemettre} bilan${bilansARemettre > 1 ? 's' : ''} à remettre`,
      sub: bilansARemettre > 1 ? 'séances honorées des 30 derniers jours' : 'séance honorée des 30 derniers jours',
      action: 'Voir', go: () => navigate('/customers'),
    }] : []),
    ...(unpaid.overdue.rows.length > 0 ? [{
      k: 'impayes',
      label: `${unpaid.overdue.rows.length} impayé${unpaid.overdue.rows.length > 1 ? 's' : ''} échu${unpaid.overdue.rows.length > 1 ? 's' : ''}`,
      sub: `${fmtMoney(unpaid.overdue.total, currency)} dus`,
      action: 'Voir', go: () => unpaidRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    }] : []),
  ];

  /* Les relances d'un carnet libre — le MÊME juge que la fiche cliente
     (`predictNextVisit`) : une couronne dont la date estimée est passée, sans
     rendez-vous pris. Compté seulement quand le carnet du jour est vide. */
  const relances = useMemo(() => {
    if (todayRows.length > 0) return 0;
    return clients.filter((c) => !c.archived).filter((c) => {
      const r = predictNextVisit(appts, clients, c.id, today);
      return r.predicted && r.iso !== null && r.iso <= today;
    }).length;
  }, [clients, appts, today, todayRows.length]);

  const net = revenue - spent;
  const prevNet = prevRevenue - prevSpent;

  /* La tendance ne parle que quand la comparaison est LOYALE — et elle dit sa
     règle en toutes lettres. Un rouge qu'on peut croire vaut mieux qu'un rouge
     permanent qu'on apprend à ignorer. */
  const trend = (cur: number, prev: number): { t: string; down: boolean } => {
    if (prev === 0) return { t: `rien à comparer en ${prevMonthName}`, down: false };
    const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
    return { t: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct)} % vs ${jourDuMois} ${prevMonthName} · à jour égal`, down: pct < 0 };
  };

  const kpis = [
    { label: 'Revenus du mois', value: fmtMoney(revenue, currency), bar: 'var(--color-indigo)', trend: trend(revenue, prevRevenue), action: () => setBreakOpen(true) },
    {
      label: 'Dépenses du mois', value: fmtMoney(spent, currency), bar: 'var(--color-copper)',
      /* Zéro dépense saisie n'est pas « ▼ 100 % » : c'est un registre vide, et
         il vaut mieux le dire que faire croire à une économie. */
      trend: spent === 0 ? { t: 'rien de saisi ce mois', down: false } : trend(spent, prevSpent),
      action: () => navigate('/depenses'),
    },
    {
      label: 'Résultat net du mois', value: fmtMoney(net, currency), bar: 'var(--copper-600)',
      trend: spent === 0 ? { t: '= revenus — aucune dépense saisie', down: false } : trend(net, prevNet),
      action: () => navigate('/synthese'),
    },
  ];

  const clientOf = (id: string) => allClients.find((c) => c.id === id);

  /* La tournée du matin — les rendez-vous de DEMAIN encore debout, et le
     journal des envois (table `envois`) qui dit ce qui est déjà parti seul. */
  const demain = addDaysISO(today, 1);
  const [envois] = useEnvois();
  const demainRows = useMemo(
    () => appts
      .filter((a) => a.date === demain && (a.status === 'confirmé' || a.status === 'en attente'))
      .sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
    [appts, demain],
  );

  /* Rendu d'un groupe d'impayés (échus / à venir) — carte avec total + lignes encaissables. */
  const renderUnpaidGroup = (
    title: string,
    group: { rows: { a: Appointment; net: number; due: number }[]; total: number },
    empty: string,
  ) => (
    <div className="trp-panel">
      <div className="trp-mon__head">
        <div className="trp-panel__title" style={{ marginBottom: 0 }}>{title}</div>
        {group.rows.length > 0 && (
          <div className="trp-mon__headline">
            {group.rows.length} RDV
            <span className="trp-mon__sep">·</span>
            <span style={{ color: 'var(--color-copper)', fontFamily: 'var(--font-serif)', fontSize: 15 }}>
              {fmtMoney(group.total, currency)} dus
            </span>
          </div>
        )}
      </div>
      {group.rows.length === 0 ? (
        <div className="trp-empty">{empty}</div>
      ) : (
        <div className="trp-pay">
          {group.rows.map(({ a, net: rowNet, due }) => (
            <div
              className="trp-pay__row trp-pay__row--click"
              key={a.id}
              onClick={() => setEditAppt(a)}
              title="Ouvrir ce rendez-vous"
            >
              <div style={{ minWidth: 0 }}>
                <div className="trp-act__name">{clientOf(a.clientId)?.name ?? 'Cliente'}</div>
                <div className="trp-act__meta">{apptLabel(a, byId)}</div>
              </div>
              <div className="trp-pay__date">{frShort(a.date)}</div>
              <div className="trp-pay__total">{fmtMoney(rowNet, currency)}</div>
              <div className="trp-pay__due">{fmtMoney(due, currency)}</div>
              <div style={{ flex: 'none' }}><StatusPill status={a.status} /></div>
              <button
                className="trp-pay__cta"
                onClick={(e) => { e.stopPropagation(); setPayAppt(a); }}
                title="Encaisser — paiement partiel ou total"
              >
                Encaisser
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const advance = (a: Appointment) => {
    if (a.status === 'en attente') {
      appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: 'confirmé' } : x)));
    } else {
      honorAppointment(a, byId);
    }
  };

  /* ---------- Ce qu'il y a derrière un chiffre ----------
     Même geste qu'Analytics : un indice s'ouvre sur les lignes qui le composent,
     et une ligne qui a une facture ouvre sa facture. */
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente';

  /** Le revenu d'un jour, ligne à ligne — LES TROIS composantes de `dayRev`, sans
      quoi le détail annoncerait moins que la barre qu'on vient d'ouvrir. */
  const openDay = (iso: string) => {
    const rows: DrillRow[] = [
      ...appts
        // INVARIANT CA : seuls les rituels HONORÉS comptent — un « confirmé daté
        // d'hier » n'est pas du revenu, le détail doit tomber sur la barre.
        .filter((a) => a.date === iso && !a.invoiceId && a.status === 'honoré')
        // Un rituel du carnet n'a pas (encore) de facture : la ligne ouvre son RDV,
        // d'où l'on encaisse — plutôt que de mener à une facture qui n'existe pas.
        .map((a) => ({ who: nameOf(a.clientId), sub: apptLabel(a, byId), amount: apptNetXof(a, byId), onOpen: () => { setDrill(null); setEditAppt(a); } })),
      ...invoices
        .filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée' && i.date === iso)
        .map((i) => ({ who: i.clientName || nameOf(i.clientId), sub: `Facture ${i.number}`, amount: invoiceTotal(i), invoiceId: i.id })),
      // Formation de l'Académie — hors branche, mais bien du revenu de la Maison.
      // La ligne s'ouvre sur l'Académie, où vit le dossier de l'apprenant·e.
      ...apprenants.flatMap((ap) =>
        (ap.payments ?? [])
          .filter((p) => payISO(p.date) === iso)
          .map((p) => ({ who: ap.name, sub: 'Formation · Académie', amount: p.amountXof, onOpen: () => { setDrill(null); navigate('/academie'); } })),
      ),
    ];
    setDrill({
      title: `Revenu · ${frShort(iso)}`,
      sub: rows.length ? 'Rituels du carnet, factures payées et formations de la journée.' : undefined,
      rows,
      total: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
    });
  };

  /** Les 7 jours, ligne à ligne — le détail derrière le total de la semaine. */
  const openWeek = () => {
    const rows: DrillRow[] = [...rev7]
      .reverse()
      .map((d) => ({
        who: frShort(d.iso),
        sub: d.total > 0 ? 'Voir la journée' : 'Aucun mouvement',
        amount: d.total,
        onOpen: d.total > 0 ? () => openDay(d.iso) : undefined,
      }));
    setDrill({ title: 'Revenu · 7 jours', sub: 'Rituels du carnet, factures payées et formations.', rows, total: rev7Total });
  };

  /** Les factures d'un moyen de paiement — chacune ouvrable. */
  const openPayMethod = (method: string) => {
    const rows: DrillRow[] = invoices
      .filter((i) => i.branchId === branch.id && i.kind === 'facture' && i.status === 'payée'
        && monthKey(i.date) === thisMonth && (i.payment ?? 'Autre') === method)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((i) => ({
        who: i.clientName || nameOf(i.clientId),
        sub: `${i.number}${i.fx ? ` · ${i.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${i.fx.code}` : ''}`,
        date: i.date,
        amount: invoiceTotal(i),
        invoiceId: i.id,
      }));
    setDrill({
      title: `Encaissements · ${method}`,
      sub: `${rows.length} facture${rows.length > 1 ? 's' : ''} ce mois-ci`,
      rows,
      total: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
    });
  };

  /* — revenu 7 jours, barres SVG — */
  const rev7Total = rev7.reduce((s, d) => s + d.total, 0);
  const rev7Max = Math.max(...rev7.map((d) => d.total), 1);
  const best = rev7.reduce((a, b) => (b.total >= a.total ? b : a), rev7[0]);
  const bestName = fromISO(best.iso).toLocaleDateString('fr-FR', { weekday: 'long' });

  return (
    <div className="mnd-rise">
      <Eyebrow>
        Le Trône · {branch.city} · {frShort(today)} {now.getFullYear()}
      </Eyebrow>
      <h2
        style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontSize: 38, color: 'var(--color-indigo)', margin: '6px 0 0', lineHeight: 1 }}
      >
        {greeting}{who ? `, ${who}` : ''}.
      </h2>

      {/* KPI majeurs */}
      <div className="tr-grid tr-grid--3" style={{ marginTop: 24 }}>
        {kpis.map((k) => (
          <div
            className="trp-kpi trp-kpi--click"
            key={k.label}
            role="button"
            tabIndex={0}
            onClick={k.action}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') k.action(); }}
          >
            <span className="trp-kpi__bar" style={{ background: k.bar }} />
            <div className="trp-kpi__label">{k.label}</div>
            <div className="trp-kpi__value">{k.value}</div>
            <div className="trp-kpi__foot">
              <span className={`trp-kpi__trend ${k.trend.down ? 'trp-kpi__trend--down' : ''}`}>{k.trend.t}</span>
              <button className="trp-kpi__link" onClick={(e) => { e.stopPropagation(); k.action(); }}>
                Voir le détail →
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Tuiles secondaires */}
      {/* LE CHIFFRE PAR MAISON — n'apparaît que s'il y a quelque chose à séparer.
          Une Maison qui ne vend que des locks n'a pas à lire une ligne « Studio
          0 F » tous les matins. */}
      {sumTotals(revMaison) > 0 && (revMaison.studio > 0 || revMaison.plateau > 0) && (
        <div className="tr-card" style={{ marginTop: 14, padding: '14px 18px' }}>
          <Eyebrow>Le mois, par maison</Eyebrow>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28, marginTop: 10 }}>
            {MAISON_BUCKETS.map((m) => (
              <div key={m.k}>
                <div style={{ fontFamily: 'var(--font-sans)', fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                  {m.label}
                </div>
                <div style={{ fontSize: 19, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMoney(revMaison[m.k], currency)}
                </div>
              </div>
            ))}
          </div>
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 8, lineHeight: 1.5 }}>
            Prestations du carnet, ventilées ligne à ligne. « Plateau seul » : les soins et lavages
            vendus sans rituel d’une maison — rien ne permet de les rattacher, on ne devine pas.
          </div>
        </div>
      )}
      {/* Ce qui presse — chaque alerte porte son GESTE : réassort → le bon,
          impayés échus → la section qui les encaisse. L'ancienne tuile
          « Alertes stock : 5 » constatait ; ici l'écran tend la main. */}
      <div className="trp-panel" style={{ marginTop: 14 }}>
        <div className="trp-panel__title">Ce qui presse</div>
        {presseRows.length === 0
          ? <div className="trp-empty">Rien ne presse — tout est réglé, et chaque séance a son bilan.</div>
          : presseRows.map((r, i) => (
            <div
              key={r.k}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hairline)' }}
            >
              <div style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 500 }}>{r.label}</span>
                <span className="mnd-muted" style={{ marginLeft: 10, fontSize: 12 }}>{r.sub}</span>
              </div>
              <button className="trp-pay__cta" onClick={r.go}>{r.action}</button>
            </div>
          ))}
      </div>

      {/* ── LA TOURNÉE DU MATIN — les rappels de demain, réunis (13 août).
          Les cloches existaient, dispersées sur le Carnet et le Calendrier ;
          ici elles s'alignent : un tap par cliente, et la pastille dit si le
          rappel PUSH est déjà parti tout seul (fonction `rappels-j1`). */}
      <div className="trp-panel" style={{ marginTop: 14 }}>
        <div className="trp-panel__title">
          La tournée du matin · rappels de demain{demainRows.length > 0 ? ` · ${demainRows.length}` : ''}
        </div>
        {demainRows.length === 0
          ? <div className="trp-empty">Rien à rappeler — le carnet de demain est libre.</div>
          : demainRows.map((a, i) => {
            const c = clientOf(a.clientId);
            const nom = a.clientName ?? c?.name ?? 'Cliente';
            const push = envois.find((e) => e.id === `env-${a.id}-push`);
            const waAuto = envois.find((e) => e.id === `env-${a.id}-whatsapp`);
            const smsAuto = envois.find((e) => e.id === `env-${a.id}-sms`);
            const tag = (texte: string) => (
              <span className="mnd-muted" style={{ fontSize: 11, border: '1px solid var(--hairline)', borderRadius: 3, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                {texte}
              </span>
            );
            return (
              <div
                key={a.id}
                style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hairline)' }}
              >
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 15, color: 'var(--color-indigo)', minWidth: 46 }}>{a.time}</span>
                <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nom}</span>
                {push?.statut === 'envoyé' && tag('Push parti seul')}
                {push?.statut === 'sans-abonnement' && tag('Sans l’appli')}
                {waAuto?.statut === 'envoyé' && tag('WhatsApp auto')}
                {smsAuto?.statut === 'envoyé' && tag('SMS auto')}
                <ReminderBell appt={a} client={c} byId={byId} />
              </div>
            );
          })}
        {demainRows.length > 0 && (
          <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
            Le rappel push part tout seul en fin de journée vers les clientes qui ont installé
            Ma Couronne. La cloche ouvre WhatsApp pré-rempli pour les autres — un tap, Envoyer,
            et elle se souvient de ton geste.
          </div>
        )}
      </div>

      {/* Carnet du jour + revenu 7 jours */}
      <div className="tr-cols" style={{ '--cols': '1.55fr 1fr', gap: 18, marginTop: 24, alignItems: 'start' } as CSSProperties}>
        <div className="trp-day">
          <div className="trp-day__head">
            <span className="trp-day__title">Le carnet du jour{todayRows.length > 0 ? ` · ${todayRows.length}` : ''}</span>
            <button className="trp-kpi__link" onClick={() => navigate('/carnet')}>
              Tout voir →
            </button>
          </div>
          {/* UN ÉTAT VIDE PROPOSE, il ne constate pas : un carnet libre est
              l'occasion de relancer les couronnes qui ont passé leur cadence. */}
          {todayRows.length === 0 && (
            relances > 0 ? (
              <div className="trp-day__empty">
                Le carnet est libre — {relances === 1 ? 'une couronne a dépassé sa cadence' : `${relances} couronnes ont dépassé leur cadence`}.
                {' '}
                <button className="trp-kpi__link" onClick={() => navigate('/customers')}>Voir les relances →</button>
              </div>
            ) : (
              <div className="trp-day__empty">Le carnet est libre aujourd’hui.</div>
            )
          )}
          {todayRows.map((a) => {
            const c = clientOf(a.clientId);
            return (
              <div
                className="trp-day__row trp-day__row--click"
                key={a.id}
                onClick={() => setEditAppt(a)}
                title="Modifier ce rendez-vous"
              >
                <div className="trp-day__time">{a.time}</div>
                {c && <Avatar client={c} size={34} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="trp-day__client">{c?.name ?? 'Cliente de passage'}</div>
                  <div className="trp-day__meta">
                    {apptLabel(a, byId)} · {a.master}
                  </div>
                </div>
                <SourceBadge source={a.source} />
                <PayStatusPill a={a} byId={byId} />
                <StatusPill status={a.status} />
                <ReminderBell appt={a} client={c} byId={byId} />
                {/* LA PAIRE DANGEREUSE, SÉPARÉE (maquette du 10 août). « Honorer »
                    (un ÉTAT, indigo) vient d'abord ; « Encaisser » (de l'ARGENT,
                    cuivre) ferme la ligne, à l'écart — NN/g : deux actions
                    opposées qui se touchent, au pouce, c'est l'erreur assurée. */}
                {a.status !== 'honoré' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); advance(a); }}
                    style={{
                      cursor: 'pointer', flex: 'none', borderRadius: 2, padding: '10px 14px',
                      fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                      background: a.status === 'en attente' ? 'var(--color-copper)' : 'transparent',
                      color: a.status === 'en attente' ? 'var(--color-ivoire)' : 'var(--color-indigo)',
                      border: a.status === 'en attente' ? '1px solid transparent' : '1px solid var(--color-indigo)',
                    }}
                  >
                    {a.status === 'en attente' ? 'Confirmer' : 'Honorer'}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setPayAppt(a); }}
                  title="Encaisser — paiement partiel ou total"
                  style={{
                    cursor: 'pointer', flex: 'none', borderRadius: 2, padding: '10px 14px', marginLeft: 12,
                    fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 500,
                    background: 'transparent', color: 'var(--copper-700)', border: '1px solid var(--color-copper)',
                  }}
                >
                  Encaisser
                </button>
              </div>
            );
          })}
        </div>

        <div>
        <div className="trp-rev">
          <button className="trp-rev__open" onClick={openWeek} title="Voir le détail des 7 jours">
            <div className="trp-rev__eyebrow">Revenu · 7 jours</div>
            <div className="trp-rev__value">{fmtMoney(rev7Total, currency)}</div>
          </button>
          <svg viewBox="0 0 280 150" style={{ width: '100%', height: 150, marginTop: 18, display: 'block' }} role="group" aria-label="Revenu des 7 derniers jours">
            {rev7.map((d, i) => {
              const h = Math.max(4, Math.round((d.total / rev7Max) * 118));
              const x = 8 + i * 39;
              const isBest = d.iso === best.iso && d.total > 0;
              return (
                <g key={d.iso} role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => openDay(d.iso)}>
                  <title>{`${frShort(d.iso)} · ${fmtMoney(d.total, currency)}`}</title>
                  {/* Cible de clic sur toute la colonne : une journée creuse n'a
                      qu'un trait de 4 px, impossible à viser au doigt. */}
                  <rect x={x - 6} y={4} width={38} height={142} fill="transparent" />
                  <rect x={x} y={130 - h} width={26} height={h} rx={2} fill={isBest ? 'var(--color-copper)' : 'rgba(246,241,231,0.28)'} />
                  <text x={x + 13} y={146} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-sans)" fill="var(--indigo-200)">
                    {d.label}
                  </text>
                </g>
              );
            })}
          </svg>
          <button className="trp-rev__foot trp-rev__foot--btn" onClick={() => openDay(best.iso)} title="Voir le meilleur jour">
            <span>Meilleur jour · {bestName}</span>
            <span className="trp-rev__best">{fmtMoney(best.total, currency)}</span>
          </button>
        </div>
        <div className="trp-tile" style={{ marginTop: 12 }}>
          <div className="trp-tile__label">Têtes couronnées</div>
          <div className="trp-tile__value">{tetesCouronnees}</div>
          <div className="trp-tile__cap">venues au moins une fois</div>
        </div>
        </div>
      </div>

      {/* Rendez-vous impayés — échus (en retard) d'un côté, à venir de l'autre, chacun son total.
          `unpaidRef` : la ligne « impayés échus » de Ce qui presse descend ici. */}
      <div ref={unpaidRef} className="tr-grid tr-grid--2" style={{ marginTop: 18, alignItems: 'start' }}>
        {renderUnpaidGroup('Impayés échus · en retard', unpaid.overdue, 'Aucun impayé échu — rien en retard.')}
        {renderUnpaidGroup('Soldes à venir', unpaid.upcoming, 'Aucun solde à venir.')}
      </div>

      {/* Décomposition du revenu du mois */}
      {breakOpen && (
        <Modal
          title={`Revenus réels · ${fromISO(`${thisMonth}-15`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}.`}
          onClose={() => setBreakOpen(false)}
          width={560}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div className="trp-break__head">Rituels honorés · par catégorie</div>
              {breakdown.rituels.length === 0 && (
                <div className="trp-break__empty">Aucun rituel honoré ce mois-ci — le carnet écrira la suite.</div>
              )}
              {breakdown.rituels.map((r) => (
                <button className="trp-break__row" key={r.id} onClick={() => { setBreakOpen(false); navigate('/calendrier'); }}>
                  <span className="trp-break__label">{r.label}</span>
                  <span className="trp-break__count">{r.count} prestation{r.count > 1 ? 's' : ''}</span>
                  <span className="trp-break__num">{fmtMoney(r.total, currency)}</span>
                </button>
              ))}
              {breakdown.rituels.length > 0 && (
                <div className="trp-break__sub">
                  <span>Sous-total rituels</span>
                  <span>{fmtMoney(breakdown.rituelsTotal, currency)}</span>
                </div>
              )}
            </div>

            <div>
              <div className="trp-break__head">Encaissements · par moyen de paiement</div>
              {breakdown.encaissements.length === 0 && (
                <div className="trp-break__empty">Aucune facture payée ce mois-ci.</div>
              )}
              {breakdown.encaissements.map((e) => (
                <button className="trp-break__row" key={e.id} title="Voir les factures" onClick={() => { setBreakOpen(false); openPayMethod(e.id); }}>
                  <span className="trp-break__label">{e.label}</span>
                  <span className="trp-break__count">{e.count} facture{e.count > 1 ? 's' : ''}</span>
                  <span className="trp-break__num">{fmtMoney(e.total, currency)}</span>
                </button>
              ))}
              {breakdown.encaissements.length > 0 && (
                <div className="trp-break__sub">
                  <span>Sous-total encaissements</span>
                  <span>{fmtMoney(breakdown.encTotal, currency)}</span>
                </div>
              )}
            </div>

            <div className="trp-break__total">
              <span>Total du mois</span>
              <span>{fmtMoney(revenue, currency)}</span>
            </div>
          </div>
        </Modal>
      )}

      {/* Modification d’un rendez-vous du carnet du jour */}
      {editAppt && <RdvModal appt={editAppt} onClose={() => setEditAppt(null)} />}

      {/* Encaissement d’un rendez-vous du carnet du jour */}
      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}

      {/* Ce qu’il y a derrière un chiffre — chaque ligne ouvre sa facture */}
      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}

      {/* LES RITUELS SUR-MESURE REÇUS — chaque composition se lit, s'ouvre sur
          WhatsApp pour sceller les créneaux, puis se marque traitée. */}
      {/* LA FILE DE RÉCEPTION — les réservations encore « en attente », toutes
          dates confondues. Confirmer ici est le même geste qu'au Calendrier ;
          « Ouvrir » donne la fiche du rendez-vous pour déplacer ou annuler. */}
      {attenteOpen && (
        <Modal title="Réservations à recevoir." onClose={() => setAttenteOpen(false)} width={620}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
            {aRecevoir.length === 0 && <div className="trc-empty">Rien à recevoir — tout est scellé.</div>}
            {aRecevoir.map((a) => (
              <div key={a.id} style={{ border: '1px solid var(--hairline)', borderLeft: '3px solid var(--color-copper)', borderRadius: 4, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <b style={{ fontWeight: 'var(--weight-medium)' as never, color: 'var(--color-indigo)' }}>
                    {a.clientName || 'Une tête'}
                  </b>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)', flex: 'none' }}>
                    {frShort(a.date)} · {a.time}
                  </span>
                </div>
                <div className="mnd-muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                  {apptLabel(a, byId)}{a.master ? ` · avec ${a.master}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    className="trf-act"
                    onClick={() => appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: 'confirmé' } : x)))}
                  >
                    Confirmer
                  </button>
                  <button
                    className="trf-act trf-act--ghost"
                    onClick={() => { setAttenteOpen(false); setEditAppt(a); }}
                  >
                    Ouvrir
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {compoOpen && (
        <Modal title="Rituels sur-mesure reçus." onClose={() => setCompoOpen(false)} width={620}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '60vh', overflowY: 'auto' }}>
            {compositions.length === 0 && <div className="trc-empty">Aucune composition reçue.</div>}
            {compositions.map((r) => {
              const fiche = clients.find((c) => c.id === r.clientId);
              const tel = fiche?.phone?.replace(/\D/g, '');
              return (
                <div key={r.id} style={{ border: '1px solid var(--hairline)', borderLeft: `3px solid ${r.traiteLe ? 'var(--hairline)' : 'var(--color-copper)'}`, borderRadius: 4, padding: '12px 14px', opacity: r.traiteLe ? 0.55 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                    <b style={{ fontWeight: 'var(--weight-medium)' as never, color: 'var(--color-indigo)' }}>{r.client}</b>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
                      {fmtMoney(r.totalXof, currency)}{r.mode === 'abonnement' ? ' / cycle' : ''}
                    </span>
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                    {/* Un forfait DEMANDÉ n'est pas composé : il vaut le prix de
                        la carte, et « −0 % » ne dirait rien. */}
                    {r.mode === 'abonnement' ? 'Abonnement sur-mesure' : r.mode === 'forfait' ? 'Forfait de la carte' : 'Ponctuel sur-mesure'}
                    {r.discountPct > 0 ? ` · −${r.discountPct} %` : ''} · reçu le {frShort(r.recueLe)}
                    {r.traiteLe ? ` · traité le ${frShort(r.traiteLe)}` : ''}
                  </div>
                  <div className="mnd-muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                    {r.items.map((it) => it.service).join(' · ')}
                  </div>
                  {!r.traiteLe && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                      {tel && (
                        <a
                          className="trf-act"
                          style={{ textDecoration: 'none' }}
                          href={`https://wa.me/${tel}?text=${encodeURIComponent(r.mode === 'forfait'
                            ? `Votre forfait « ${r.items[0]?.service ?? 'de la Maison'} » est entre nos mains — scellons vos créneaux, mèche après mèche. — Maison MND`
                            : `Votre ${r.mode === 'abonnement' ? 'abonnement' : 'rituel'} sur-mesure est entre nos mains — scellons vos créneaux, mèche après mèche. — Maison MND`)}`}
                          target="_blank" rel="noopener noreferrer"
                        >
                          Sceller sur WhatsApp
                        </a>
                      )}
                      <button
                        className="trf-act trf-act--ghost"
                        onClick={() => compositionsRecuesStore.set((prev) => prev.map((x) => (x.id === r.id ? { ...x, traiteLe: todayISO() } : x)))}
                      >
                        Marquée traitée
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
