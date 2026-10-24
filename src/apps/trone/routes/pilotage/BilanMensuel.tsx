import { useMemo, useState } from 'react';
import '../finances/finances.css';
import { PageHead } from '../_ui';
import { Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney, convertFromXof } from '../../../../shared/currency';
import { useAppointments, type Appointment } from '../../../../shared/agenda';
import { useApprenants, useSubscribers } from '../equipe/data';
import { estDePassage, useClients } from '../../../../shared/clients';
import { useInvoices, invoiceReglements, caissesHorsBilan, useCashboxes } from '../../../../shared/finance';
import {
  apptLabel, apptNetXof, apptServices, apptDiscountFactor, apptPayState, apptDueXof,
  frShort, todayISO, useServicesById, RdvModal, PayStatusPill,
  DrillModal, revenuDuMois, revenusProjetesDuMois, type Drill, type DrillRow,
} from '../clients/_shared';
import { PayAppointmentModal } from '../clients/actions';
import { TuileDuMois, ColonnesEmpilees, LignesDuCumul, Anneau, Classement } from '../finances/SyntheseGraphes';
import {
  TEINTES, TEINTE_AUTRES, chiffreCourt, ecartAuMois, borneDuMois, aJourEgal, cumul, type PartDeLAnneau,
} from '../finances/synthese-graphes-pur';
import './pilotage.css';

/* Bilan mensuel — le mois d'un regard : combien de rendez-vous, combien de revenu,
   qui sont les meilleures clientes, et combien de chaque prestation. Même base que
   la Synthèse (source de vérité du CA), donc mêmes chiffres — jamais deux fois :
   revenu = factures payées + rituels honorés NON facturés (la facture d'un rituel
   encaissé le compte déjà). Tout est dérivé des magasins réels.

   EN GRAPHES — 24 octobre 2026 (« Donne leur le même traitement », Yéman) :
   les tuiles de la Synthèse, le revenu jour par jour en colonnes (l'encaissé,
   puis l'attendu des jours à venir), le cumul du mois face au mois d'avant,
   les rendez-vous par état, les classements. Les règles de dessin vivent dans
   `finances/synthese-graphes-pur.ts`.

   ENCAISSÉ À CE JOUR (même jour) : le mois en cours s'arrête à aujourd'hui,
   comme le tableau de bord et la Synthèse ; ce qui est daté plus tard est de
   l'attendu, montré à part et jamais additionné au revenu. */

const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const pad2 = (n: number) => String(n).padStart(2, '0');
const monthTitle = (mk: string) => { const [y, m] = mk.split('-').map(Number); return `${MONTHS_FR[m - 1]} ${y}`; };
const shiftMonth = (mk: string, dir: number) => { const [y, m] = mk.split('-').map(Number); const d = new Date(y, m - 1 + dir, 1); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
const daysInMonth = (mk: string) => { const [y, m] = mk.split('-').map(Number); return new Date(y, m, 0).getDate(); };
/* « jeudi 24 octobre 2026 » : la bulle d'un jour dit son nom et son année. */
const jourLong = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/* LES ÉTATS D'UN RENDEZ-VOUS, chacun sa teinte, fixée à l'état et non à son rang. */
const ETATS: { k: Appointment['status']; nom: string; teinte: string }[] = [
  { k: 'honoré', nom: 'Honorés', teinte: TEINTES[0] },
  { k: 'confirmé', nom: 'Confirmés', teinte: TEINTES[2] },
  { k: 'en attente', nom: 'En attente', teinte: TEINTES[1] },
  { k: 'annulé', nom: 'Annulés', teinte: TEINTE_AUTRES },
];

/* Date d'un règlement de formation (jj/mm/aaaa, ou ISO) → jour ISO comparable. */
const payISOLocal = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : d;
};

export default function BilanMensuel() {
  const { branch, currency } = useBranch();
  const [appts] = useAppointments();
  const [invoices] = useInvoices();
  /* Les caisses écartées des bilans — leur nom sert de clé partout. */
  const [cashboxes] = useCashboxes();
  const exclues = useMemo(() => caissesHorsBilan(cashboxes, branch.id), [cashboxes, branch.id]);
  const nomsExclus = useMemo(
    () => cashboxes.filter((c) => c.branchId === branch.id && c.horsBilan).map((c) => c.name),
    [cashboxes, branch.id],
  );
  const [clients] = useClients();
  const [apprenants] = useApprenants();
  const [abonnes] = useSubscribers();
  const byId = useServicesById();
  const today = todayISO();
  const thisMonth = today.slice(0, 7);

  const [month, setMonth] = useState(thisMonth);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);
  /* Carnet intégré : périmètre (ce mois / tout) et filtre de règlement. */
  const [carnetScope, setCarnetScope] = useState<'mois' | 'tout'>('mois');
  const [carnetStatus, setCarnetStatus] = useState<'tous' | 'impayes' | 'payes'>('tous');

  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente';

  /* Rendre une ligne de rituel cliquable : si le rituel a été encaissé, la ligne
     OUVRE SA FACTURE ; sinon (honoré non encaissé, RDV à venir…) elle ouvre le
     rendez-vous, d'où l'on peut l'encaisser. `onOpen` prime sur `invoiceId` dans
     le DrillModal : on ne le pose donc QUE lorsqu'il n'y a pas de facture. */
  const apptLink = (a: Appointment): Pick<DrillRow, 'invoiceId' | 'onOpen'> => ({
    invoiceId: a.invoiceId,
    onOpen: a.invoiceId ? undefined : () => { setDrill(null); setEditAppt(a); },
  });

  const d = useMemo(() => {
    const borne = borneDuMois(month, today);
    const dansLaBorne = (iso?: string) => !borne || (iso ?? '') <= borne;
    const inMonth = (iso: string) => iso.slice(0, 7) === month;
    const factures = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture');
    /* Ce qu'une pièce a reçu sur `prefixe` (un mois, ou un jour), à ce jour,
       hors des caisses écartées quand `sauf` le demande. */
    const regle = (i: (typeof factures)[number], prefixe: string, sauf: boolean, cut?: string) => invoiceReglements(i)
      .filter((p) => (p.date ?? '').startsWith(prefixe) && (!cut || (p.date ?? '') <= cut) && (!sauf || !exclues.has(p.cashbox ?? '')))
      .reduce((s, p) => s + p.amountXof, 0);

    /* LES PIÈCES QUI ONT REÇU DE L'ARGENT CE MOIS-CI — 17 août 2026.
       Depuis qu'une facture porte plusieurs règlements, son STATUT ne dit plus
       ce qui est entré : une pièce à moitié réglée est « envoyée », et filtrer
       sur `payée` effacerait l'argent déjà reçu. On ne retient plus la date
       d'ÉMISSION mais celle des VERSEMENTS. */
    const paidInv = factures.filter((i) => regle(i, month, false, borne) > 0);
    /* Rituels honorés NON facturés : la facture d'encaissement, quand elle existe,
       les compte déjà — on ne retient donc que ceux sans invoiceId (jamais deux fois). */
    const honoredNoInv = appts.filter((a) => a.branchId === branch.id && a.status === 'honoré' && !a.invoiceId && inMonth(a.date) && dansLaBorne(a.date));
    const monthAppts = appts.filter((a) => a.branchId === branch.id && a.status !== 'annulé' && inMonth(a.date));
    const annulesDuMois = appts.filter((a) => a.branchId === branch.id && a.status === 'annulé' && inMonth(a.date));
    /* Rituels honorés porteurs de valeur (séances 2..N d'une série = 0). */
    const honoredValue = monthAppts.filter((a) => a.status === 'honoré' && !(a.seriesIndex && a.seriesIndex > 1));

    /* LES CAISSES HORS BILAN N'ENTRENT PAS DANS LE REVENU — 22 août 2026.
       Une épargne personnelle, un tiroir tenu pour quelqu'un d'autre : ce qui
       y tombe n'a pas été gagné par la Maison. L'exclusion est DITE plus haut :
       un total amputé en silence se croirait faux sans qu'on sache pourquoi. */
    const revRit = honoredNoInv.reduce((s, a) => s + apptNetXof(a, byId), 0);
    /* LE CA DU MOIS PAR LA PORTE UNIQUE `revenuDuMois` (clients/_shared), la même
       que la Synthèse / le Dashboard / Analytics — mais avec `exclureHorsBilan`,
       car le Bilan seul écarte les caisses hors bilan (livres officiels). Les
       abonnements y ENTRENT (décision du 3 août). Borné à aujourd'hui pour le
       mois en cours (24 octobre 2026). */
    const args = { invoices, appts, byId, apprenants, abonnes, branchId: branch.id, cashboxes };
    const revenue = revenuDuMois(args, month, { exclureHorsBilan: true, cut: borne });
    const projete = month >= thisMonth ? revenusProjetesDuMois(args, month, today) : null;

    /* LES CHIFFRES D'UN MOIS, pour les tuiles et leur pente. `cut` borne au jour
       (le mois en cours, ou le mois d'avant comparé à jour égal). Le nombre de
       rendez-vous, lui, compte aussi ceux à venir : c'est le carnet du mois. */
    const chiffresDu = (mk: string, cut?: string) => {
      const rdv = appts.filter((a) => a.branchId === branch.id && a.status !== 'annulé' && a.date.slice(0, 7) === mk);
      const honores = rdv.filter((a) => a.status === 'honoré' && (!cut || a.date <= cut));
      const valeur = honores.filter((a) => !(a.seriesIndex && a.seriesIndex > 1));
      const net = valeur.reduce((s, a) => s + apptNetXof(a, byId), 0);
      return {
        rdv: rdv.length,
        honores: honores.length,
        revenu: revenuDuMois(args, mk, { exclureHorsBilan: true, cut }),
        panier: valeur.length > 0 ? Math.round(net / valeur.length) : 0,
      };
    };
    const moisDuFil = Array.from({ length: 6 }, (_, i) => shiftMonth(month, i - 5));
    const fil = moisDuFil.map((mk) => chiffresDu(mk, borneDuMois(mk, today)));
    const moisAvant = shiftMonth(month, -1);
    const borneAvant = month === thisMonth ? aJourEgal(moisAvant, today) : undefined;
    const avant = chiffresDu(moisAvant, borneAvant);
    const avantRdv = chiffresDu(moisAvant).rdv;

    const honoredNet = honoredValue.reduce((s, a) => s + apptNetXof(a, byId), 0);
    const honoredCount = monthAppts.filter((a) => a.status === 'honoré').length;
    const totalRdv = monthAppts.length;
    const basket = honoredValue.length > 0 ? Math.round(honoredNet / honoredValue.length) : 0;
    /* DES TÊTES, PAS DES VENUES. Le revenu ci-dessus compte la passante au franc
       près — c'est son argent, il est réel. Ces deux compteurs-ci disent la
       clientèle : « 12 clientes · 4 nouvelles » ne doit pas monter parce que
       quatre inconnues sont passées, sinon le mois d'après paraît en chute.
       Voir `Client.dePassage`. */
    const passage = new Set(clients.filter(estDePassage).map((c) => c.id));
    const heads = new Set(monthAppts.filter((a) => !passage.has(a.clientId)).map((a) => a.clientId)).size;
    /* UNE NOUVELLE EST UNE TÊTE DONT LA PREMIÈRE VENUE HONORÉE TOMBE CE
       MOIS-CI (12 août). Deux versions fausses avant celle-ci : compter les
       fiches ouvertes (les comptes Ma Couronne jamais venus gonflaient), puis
       « couronnée ET fiche ouverte ce mois » — or la fiche du comptoir naît
       « de passage » (levée à la 2ᵉ venue) : le mois courant lisait ~0
       nouvelle, le chiffre se remplissait rétroactivement au retour, et une
       tête venue une seule fois ne comptait dans AUCUN mois. La première
       venue honorée est un fait stable : ni le statut de passage ni le mois
       d'ouverture de la fiche ne le déplacent. */
    const branchClientIds = new Set(clients.filter((c) => c.branchId === branch.id).map((c) => c.id));
    const premiereVenue = new Map<string, string>();
    for (const a of appts) {
      if (a.status !== 'honoré' || !a.clientId) continue;
      const cur = premiereVenue.get(a.clientId);
      if (!cur || a.date < cur) premiereVenue.set(a.clientId, a.date);
    }
    const nouvelles = [...premiereVenue.entries()]
      .filter(([id, date]) => branchClientIds.has(id) && date.slice(0, 7) === month).length;
    const dePassage = new Set(monthAppts.filter((a) => passage.has(a.clientId)).map((a) => a.clientId)).size;

    /* — LE REVENU JOUR PAR JOUR : l'encaissé jusqu'à aujourd'hui ; pour les
       jours à venir (et ce qui reste d'aujourd'hui), l'ATTENDU : les versements
       datés de ce jour-là et le reste dû des rendez-vous prévus. Les caisses
       écartées n'y entrent pas, comme dans le total. — */
    const encaisseDu = (mk: string, iso: string) =>
      factures.reduce((s, x) => s + regle(x, iso, true), 0)
      + appts.filter((a) => a.branchId === branch.id && a.status === 'honoré' && !a.invoiceId && a.date === iso && a.date.slice(0, 7) === mk)
        .reduce((s, a) => s + apptNetXof(a, byId), 0);
    const dim = daysInMonth(month);
    const days = Array.from({ length: dim }, (_, i) => {
      const iso = `${month}-${pad2(i + 1)}`;
      const passe = !borne || iso <= borne;
      const encaisse = passe ? encaisseDu(month, iso) : 0;
      const verseePlusTard = !passe ? factures.reduce((s, x) => s + regle(x, iso, true), 0) : 0;
      const resteDesRdv = borne && iso >= today
        ? appts.filter((a) => a.branchId === branch.id && a.date === iso && a.status !== 'annulé' && a.status !== 'honoré')
          .reduce((s, a) => s + Math.max(0, apptDueXof(a, byId)), 0)
        : 0;
      return { day: i + 1, iso, total: encaisse, attendu: verseePlusTard + resteDesRdv };
    });
    const dayMax = Math.max(...days.map((x) => x.total), 0);
    /* LE CUMUL, face au mois d'avant ENTIER (on y lit où l'on en était au même
       jour, et où il a fini). */
    const dimAvant = daysInMonth(moisAvant);
    const joursAvant = Array.from({ length: dimAvant }, (_, i) => encaisseDu(moisAvant, `${moisAvant}-${pad2(i + 1)}`));
    const indexDuJour = borne ? Number(borne.slice(8, 10)) - 1 : dim - 1;
    const cumulDuMois = cumul(days.map((x) => x.total), indexDuJour);
    const cumulDuMoisAvant = cumul(joursAvant);
    const cumulAvant = Array.from({ length: dim }, (_, i) => (i < dimAvant ? cumulDuMoisAvant[i] : null));

    /* — meilleures clientes du mois (revenu) — */
    const cliMap = new Map<string, { value: number; count: number }>();
    const bumpCli = (k: string, v: number) => { const c = cliMap.get(k) ?? { value: 0, count: 0 }; cliMap.set(k, { value: c.value + v, count: c.count + 1 }); };
    paidInv.forEach((i) => bumpCli(i.clientName ?? nameOf(i.clientId), regle(i, month, false, borne)));
    honoredNoInv.forEach((a) => bumpCli(nameOf(a.clientId), apptNetXof(a, byId)));
    const topClients = Array.from(cliMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.value - a.value).slice(0, 8);

    /* — résumé des prestations réalisées : combien de CHAQUE, et le revenu —
       part de la prestation dans le rituel, remise répercutée au prorata (une
       prestation à deux nomenclatures n'est jamais comptée deux fois pleine). */
    const svcMap = new Map<string, { value: number; count: number }>();
    honoredValue.forEach((a) => {
      const disc = apptDiscountFactor(a, byId);
      apptServices(a, byId).forEach((s) => {
        const amt = Math.round(s.priceXof * disc);
        const c = svcMap.get(s.name) ?? { value: 0, count: 0 };
        svcMap.set(s.name, { value: c.value + amt, count: c.count + 1 });
      });
    });
    const services = Array.from(svcMap.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.count - a.count || b.value - a.value);
    const svcTotalCount = services.reduce((s, x) => s + x.count, 0);

    /* — les rendez-vous du mois par état (les annulés compris : ils se voient) — */
    const parEtat = ETATS.map((e) => ({
      ...e,
      rdv: e.k === 'annulé' ? annulesDuMois : monthAppts.filter((a) => a.status === e.k),
    }));

    /* LES FORMATIONS : leurs règlements entrent dans le revenu (revenuDuMois)
       mais pas dans les colonnes du jour ; on dit l'écart plutôt que de le
       cacher. */
    const formations = apprenants
      .flatMap((ap) => ap.payments ?? [])
      .filter((pm) => inMonth(payISOLocal(pm.date)) && dansLaBorne(payISOLocal(pm.date)))
      .reduce((s2, pm) => s2 + pm.amountXof, 0);

    return {
      /* Le mois voyage avec ses chiffres : les journaux en aval doivent
         additionner les VERSEMENTS de ce mois-là, pas le total des pièces. */
      month, borne, borneAvant, moisAvant,
      paidInv, honoredNoInv, monthAppts, honoredValue,
      revenue, projete, revRit, honoredNet, honoredCount, totalRdv, basket, heads, nouvelles, dePassage,
      days, dayMax, cumulDuMois, cumulAvant, topClients, services, svcTotalCount, parEtat,
      moisDuFil, fil, avant, avantRdv, formations,
      regleDuMois: (i: (typeof factures)[number]) => regle(i, month, false, borne),
    };
  }, [appts, invoices, branch.id, month, byId, clients, apprenants, abonnes, cashboxes, exclues, today, thisMonth]);

  const hasLife = d.totalRdv > 0 || d.revenue > 0;

  /* — Carnet des rendez-vous : la liste (ce mois ou tout le carnet), avec l'état de
     règlement et l'encaissement d'un geste. Les annulés sortent ; tri du plus
     récent au plus ancien. On calcule l'état une fois, puis on filtre. */
  const carnet = useMemo(() => {
    const base = appts.filter((a) => a.branchId === branch.id && a.status !== 'annulé'
      && (carnetScope === 'tout' || a.date.slice(0, 7) === month));
    const rows = base
      .map((a) => ({ a, state: apptPayState(a, byId), due: apptDueXof(a, byId) }))
      .sort((x, y) => (x.a.date < y.a.date ? 1 : x.a.date > y.a.date ? -1 : (y.a.time ?? '').localeCompare(x.a.time ?? '')));
    const unpaid = rows.filter((r) => r.state === 'impayé' || r.state === 'partiel').length;
    const paid = rows.filter((r) => r.state === 'payé').length;
    const shown = rows.filter((r) =>
      carnetStatus === 'tous' ? true
      : carnetStatus === 'impayes' ? (r.state === 'impayé' || r.state === 'partiel')
      : r.state === 'payé');
    const dueTotal = rows.reduce((s, r) => s + r.due, 0);
    return { rows, shown, unpaid, paid, total: rows.length, dueTotal };
  }, [appts, branch.id, month, carnetScope, carnetStatus, byId]);

  /* ---------- Détails cliquables ---------- */
  const revenueRows = (from: string, to: string): DrillRow[] =>
    [
      ...d.honoredNoInv
        .filter((a) => a.date >= from && a.date <= to)
        .map((a) => ({ date: a.date, who: nameOf(a.clientId), sub: apptLabel(a, byId), amount: apptNetXof(a, byId), ...apptLink(a) })),
      ...d.paidInv
        .filter((i) => invoiceReglements(i).some((p) => p.date >= from && p.date <= to))
        .map((i) => ({ date: i.date, who: i.clientName ?? nameOf(i.clientId), sub: `Facture ${i.number}`, amount: d.regleDuMois(i), invoiceId: i.id })),
    ].sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));

  const openRevenueMonth = () => {
    const rows = revenueRows(`${month}-01`, d.borne ?? `${month}-31`);
    setDrill({ title: `Revenu · ${monthTitle(month)}`, sub: d.borne ? `Factures payées et rituels honorés, encaissés au ${frShort(d.borne)}` : 'Factures payées et rituels honorés du mois', rows, total: rows.reduce((s, r) => s + (r.amount ?? 0), 0) });
  };
  const openDay = (iso: string) => {
    if (d.borne && iso > d.borne) {
      /* Un jour à venir : ce qu'il attend, rendez-vous par rendez-vous. */
      const rows: DrillRow[] = appts
        .filter((a) => a.branchId === branch.id && a.date === iso && a.status !== 'annulé' && a.status !== 'honoré')
        .map((a) => ({ date: a.date, who: nameOf(a.clientId), sub: `${apptLabel(a, byId)} · ${a.time ?? ''} · reste à régler`, amount: Math.max(0, apptDueXof(a, byId)), ...apptLink(a) }));
      setDrill({ title: `Attendu · ${jourLong(iso)}`, sub: rows.length ? `${rows.length} rendez-vous prévu${rows.length > 1 ? 's' : ''}, rien n'est encore acquis` : 'aucun rendez-vous prévu ce jour', rows, total: rows.reduce((s, r) => s + (r.amount ?? 0), 0) });
      return;
    }
    const rows = revenueRows(iso, iso);
    setDrill({ title: `Revenu · ${jourLong(iso)}`, sub: rows.length ? `${rows.length} encaissement${rows.length > 1 ? 's' : ''}` : 'aucun encaissement ce jour', rows, total: rows.reduce((s, r) => s + (r.amount ?? 0), 0) });
  };
  const openTotalRdv = () => {
    const rows: DrillRow[] = d.monthAppts
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((a) => ({ date: a.date, who: nameOf(a.clientId), sub: `${apptLabel(a, byId)} · ${a.status}`, amount: a.status === 'honoré' ? apptNetXof(a, byId) : undefined, ...apptLink(a) }));
    setDrill({ title: `Rendez-vous · ${monthTitle(month)}`, sub: `${rows.length} rendez-vous (hors annulés)`, rows });
  };
  const openEtat = (p: PartDeLAnneau) => {
    const e = d.parEtat.find((x) => x.nom === p.nom);
    if (!e) return;
    const rows: DrillRow[] = e.rdv
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((a) => ({ date: a.date, who: nameOf(a.clientId), sub: `${apptLabel(a, byId)}${a.time ? ` · ${a.time}` : ''}`, amount: a.status === 'honoré' ? apptNetXof(a, byId) : undefined, ...apptLink(a) }));
    setDrill({ title: `${e.nom} · ${monthTitle(month)}`, sub: `${rows.length} rendez-vous`, rows });
  };
  const openClient = (name: string) => {
    const rows: DrillRow[] = [
      ...d.honoredNoInv.filter((a) => nameOf(a.clientId) === name).map((a) => ({ date: a.date, who: name, sub: apptLabel(a, byId), amount: apptNetXof(a, byId), ...apptLink(a) })),
      ...d.paidInv.filter((i) => (i.clientName ?? nameOf(i.clientId)) === name).map((i) => ({ date: i.date, who: name, sub: `Facture ${i.number}`, amount: d.regleDuMois(i), invoiceId: i.id })),
    ].sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));
    setDrill({ title: name, sub: `Le mois de ${monthTitle(month)}`, rows, total: rows.reduce((s, r) => s + (r.amount ?? 0), 0) });
  };
  const openService = (svcName: string) => {
    const rows: DrillRow[] = [];
    d.honoredValue
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach((a) => {
        const part = apptServices(a, byId).filter((s) => s.name === svcName);
        if (part.length === 0) return;
        const gross = part.reduce((s, sv) => s + sv.priceXof, 0);
        rows.push({ date: a.date, who: nameOf(a.clientId), sub: svcName, amount: Math.round(gross * apptDiscountFactor(a, byId)), ...apptLink(a) });
      });
    setDrill({ title: `Prestation · ${svcName}`, sub: `${rows.length} fois en ${monthTitle(month)}`, rows, total: rows.reduce((s, r) => s + (r.amount ?? 0), 0) });
  };

  /* — LES TUILES : la même comparaison loyale que la Synthèse. Le mois en
     cours, arrêté à aujourd'hui, se compare au mois d'avant au même jour ;
     un mois passé, au mois d'avant entier. — */
  const nomAvant = monthTitle(d.moisAvant);
  const quantieme = (iso: string) => { const j = Number(iso.slice(8, 10)); return j === 1 ? '1er' : String(j); };
  const avantNom = d.borneAvant ? `Au ${quantieme(d.borneAvant)} ${nomAvant}` : nomAvant;
  const vsNom = d.borneAvant ? `${nomAvant}, à jour égal` : nomAvant;
  const indexDuMois = d.moisDuFil.length - 1;
  const parts = d.parEtat
    .map((e, i) => ({ nom: e.nom, valeur: e.rdv.length, n: e.rdv.length, teinte: i, membres: [e.nom] }))
    .filter((p) => p.valeur > 0);
  const teinteDeLEtat = (p: PartDeLAnneau) => ETATS.find((e) => e.nom === p.nom)?.teinte ?? TEINTE_AUTRES;
  const court = (v: number) => chiffreCourt(convertFromXof(v, currency));
  const enCours = month === thisMonth;

  return (
    <div className="mnd-rise">
      {/* L'EXCLUSION SE DIT — 22 août 2026. Un total amputé en silence se
          croirait faux sans qu'on sache pourquoi ; on nomme donc les caisses
          écartées, en haut, avant les chiffres. */}
      {nomsExclus.length > 0 && (
        <div className="trf-note-exclues">
          {nomsExclus.length > 1 ? 'Caisses écartées de ce bilan' : 'Caisse écartée de ce bilan'} :
          {' '}<b>{nomsExclus.join(', ')}</b>. Ce qui y est entré ne compte pas dans les revenus.
        </div>
      )}
      <PageHead
        eyebrow="Pilotage · Le mois"
        title="Bilan mensuel."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--hairline)', borderRadius: 2, padding: '8px 12px' }}>
            <button onClick={() => setMonth((m) => shiftMonth(m, -1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }} aria-label="Mois précédent">‹</button>
            <button
              onClick={() => setMonth(thisMonth)}
              title="Revenir au mois en cours"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 12, letterSpacing: '.04em', color: 'var(--color-indigo)', textTransform: 'capitalize', minWidth: 120 }}
            >
              {monthTitle(month)}
            </button>
            <button onClick={() => setMonth((m) => shiftMonth(m, 1))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 13 }} aria-label="Mois suivant">›</button>
          </div>
        }
      />

      {!hasLife && (
        <div className="trp-panel" style={{ marginTop: 18 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
            Aucun rendez-vous ni encaissement en {monthTitle(month)}, le bilan se remplira avec l’activité du mois.
          </div>
        </div>
      )}

      {/* LES QUATRE CHIFFRES DU MOIS, comme à la Synthèse. */}
      <div className="tr-grid tr-grid--4 tsy-tuiles">
        <TuileDuMois
          libelle="Rendez-vous du mois" valeur={String(d.totalRdv)}
          ecart={ecartAuMois(d.totalRdv, d.avantRdv)} avantNom={nomAvant} avantValeur={`${d.avantRdv} rendez-vous`}
          extra={`${d.heads} cliente${d.heads > 1 ? 's' : ''} · ${d.nouvelles} nouvelle${d.nouvelles > 1 ? 's' : ''}${d.dePassage > 0 ? ` · ${d.dePassage} de passage` : ''}`}
          serie={d.fil.map((x) => x.rdv)} indexCourant={indexDuMois} onOuvrir={d.totalRdv > 0 ? openTotalRdv : undefined}
        />
        <TuileDuMois
          libelle="Rituels honorés" valeur={String(d.honoredCount)}
          ecart={ecartAuMois(d.honoredCount, d.avant.honores)} avantNom={avantNom} vsNom={vsNom} avantValeur={`${d.avant.honores} rituel${d.avant.honores > 1 ? 's' : ''}`}
          extra={d.totalRdv > 0 ? `${Math.round((d.honoredCount / d.totalRdv) * 100)} % des rendez-vous` : undefined}
          serie={d.fil.map((x) => x.honores)} indexCourant={indexDuMois}
        />
        <TuileDuMois
          libelle={enCours ? 'Revenu encaissé à ce jour' : 'Revenu du mois'} valeur={fmtMoney(d.revenue, currency)}
          ecart={ecartAuMois(d.revenue, d.avant.revenu)} avantNom={avantNom} vsNom={vsNom} avantValeur={fmtMoney(d.avant.revenu, currency)}
          extra={d.projete && d.projete.total > 0 ? `Projeté sur le mois : ${fmtMoney(d.revenue + d.projete.total, currency)}` : undefined}
          serie={d.fil.map((x) => x.revenu)} indexCourant={indexDuMois} onOuvrir={d.revenue > 0 ? openRevenueMonth : undefined}
        />
        <TuileDuMois
          libelle="Panier moyen" valeur={fmtMoney(d.basket, currency)}
          ecart={ecartAuMois(d.basket, d.avant.panier)} avantNom={avantNom} vsNom={vsNom} avantValeur={fmtMoney(d.avant.panier, currency)}
          extra="par rituel honoré"
          serie={d.fil.map((x) => x.panier)} indexCourant={indexDuMois}
        />
      </div>

      {/* LE MOIS JOUR PAR JOUR, et ses rendez-vous par état. */}
      <div className="tsy-rangee">
        <div className="trf-panel">
          <div className="tsy-panneau__tete">
            <div className="trf-panel__title">Revenu · jour par jour · {monthTitle(month)}</div>
            <span className="tsy-panneau__sous">
              {d.days.some((x) => x.total > 0) ? `Meilleur jour ${fmtMoney(d.dayMax, currency)} · ` : ''}un clic sur un jour pour le détail
            </span>
          </div>
          <ColonnesEmpilees
            colonnes={d.days.map((x) => ({
              cle: x.iso,
              court: x.day === 1 || x.day % 5 === 0 || x.day === d.days.length ? String(x.day) : '',
              long: jourLong(x.iso),
              valeurs: [x.total, x.attendu],
              marque: x.iso === today,
            }))}
            series={[{ nom: 'Encaissé', teinte: TEINTES[0] }, { nom: 'Attendu (pas encore acquis)', teinte: TEINTE_AUTRES }]}
            fmt={(v) => fmtMoney(v, currency)} fmtAxe={court}
            onChoisir={openDay} consigne="Cliquer pour le détail du jour"
            vide="Aucun encaissement ce mois-ci, le premier rituel honoré posera la première colonne."
          />
          <div className="tsy-note">
            {d.honoredCount} rituel{d.honoredCount > 1 ? 's' : ''} honoré{d.honoredCount > 1 ? 's' : ''} · {d.paidInv.length} facture{d.paidInv.length > 1 ? 's' : ''} payée{d.paidInv.length > 1 ? 's' : ''}.
            {' '}Une colonne dit les factures réglées et les rituels honorés du jour
            {d.formations > 0 ? ` ; les ${fmtMoney(d.formations, currency)} de formations et les abonnements comptent dans le total sans jour de caisse` : ''}.
          </div>
        </div>
        <div className="trf-panel">
          <div className="trf-panel__title">Les rendez-vous du mois</div>
          <Anneau
            parts={parts} currency={currency} compte total={parts.reduce((s, p) => s + p.valeur, 0)} libelleTotal="rendez-vous"
            teinteDe={teinteDeLEtat} vide={`Aucun rendez-vous en ${monthTitle(month)}.`} onOuvrir={openEtat}
          />
        </div>
      </div>

      {/* LE CUMUL FACE AU MOIS D'AVANT, et les meilleures clientes. */}
      <div className="tsy-rangee">
        <div className="trf-panel">
          <div className="tsy-panneau__tete">
            <div className="trf-panel__title">Le cumul du mois · face à {nomAvant}</div>
            <span className="tsy-panneau__sous">Factures réglées et rituels honorés, depuis le 1er</span>
          </div>
          <LignesDuCumul
            points={d.days.length}
            series={[
              { nom: monthTitle(month), teinte: TEINTES[0], valeurs: d.cumulDuMois },
              { nom: nomAvant, teinte: TEINTE_AUTRES, valeurs: d.cumulAvant },
            ]}
            fmt={(v) => fmtMoney(v, currency)} fmtAxe={court}
            libelle={(i) => `Le ${i === 0 ? '1er' : i + 1} du mois`}
            court={(i) => (i === 0 || (i + 1) % 5 === 0 || i === d.days.length - 1 ? String(i + 1) : null)}
          />
        </div>
        <div className="trf-panel">
          <div className="trf-panel__title">Meilleures clientes · {monthTitle(month)}</div>
          <Classement
            lignes={d.topClients.map((c) => ({ nom: c.name, valeur: c.value, meta: `${c.count} passage${c.count > 1 ? 's' : ''}` }))}
            currency={currency} vide="Aucune cliente encaissée ce mois, le classement attend ses lauréates." onOuvrir={openClient}
          />
        </div>
      </div>

      {/* LE RÉSUMÉ DES PRESTATIONS : la barre suit le NOMBRE, le montant se lit à côté. */}
      <div className="trf-panel" style={{ marginTop: 18 }}>
        <div className="tsy-panneau__tete">
          <div className="trf-panel__title">Résumé des prestations · combien de chaque</div>
          {d.svcTotalCount > 0 && <span className="tsy-panneau__sous">{d.svcTotalCount} au total</span>}
        </div>
        <div className="tsy-colonnes-2">
          <Classement
            lignes={d.services.map((s) => ({ nom: s.name, valeur: s.count, dit: `${s.count}× · ${fmtMoney(s.value, currency)}` }))}
            currency={currency} vide="Aucune prestation réalisée ce mois, le résumé se dessinera avec le carnet." onOuvrir={openService}
          />
        </div>
      </div>

      {/* Carnet des rendez-vous — la liste, l'état de règlement, l'encaissement d'ici. */}
      <div className="trp-panel" style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
          <div>
            <div className="trp-panel__title" style={{ marginBottom: 2 }}>Carnet des rendez-vous</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>
              {carnetScope === 'mois' ? `${monthTitle(month)}, ` : 'Tout le carnet, '}
              {carnet.total} rendez-vous · <b style={{ color: 'var(--copper-700)' }}>{carnet.unpaid} à encaisser</b>
              {carnet.dueTotal > 0 ? ` · reste ${fmtMoney(carnet.dueTotal, currency)}` : ''}
            </div>
          </div>
          <Segs<'mois' | 'tout'>
            options={[{ value: 'mois', label: 'Ce mois' }, { value: 'tout', label: 'Tout le carnet' }]}
            value={carnetScope}
            onChange={setCarnetScope}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 6px' }}>
          {([['tous', `Tous · ${carnet.total}`], ['impayes', `Impayés · ${carnet.unpaid}`], ['payes', `Payés · ${carnet.paid}`]] as const).map(([k, lbl]) => (
            <button key={k} className={`trp-chip ${carnetStatus === k ? 'is-active' : ''}`} onClick={() => setCarnetStatus(k)}>{lbl}</button>
          ))}
        </div>

        {carnet.shown.length === 0 ? (
          <div className="trp-empty">
            {carnet.total === 0
              ? (carnetScope === 'mois' ? `Aucun rendez-vous en ${monthTitle(month)}.` : 'Le carnet est encore vierge.')
              : carnetStatus === 'impayes' ? 'Rien à encaisser, tout est réglé.' : 'Aucun rendez-vous dans ce filtre.'}
          </div>
        ) : (
          <div className="trp-carnet">
            {carnet.shown.slice(0, 200).map(({ a, state, due }) => (
              <div
                key={a.id}
                className="trp-carnet__row"
                onClick={() => setEditAppt(a)}
                title={`${nameOf(a.clientId)}, ouvrir le rendez-vous`}
              >
                <span className="trp-carnet__date">
                  <b>{frShort(a.date)}</b>
                  <span>{a.time}</span>
                </span>
                <span className="trp-carnet__main">
                  <span className="trp-carnet__who">{nameOf(a.clientId)}</span>
                  <span className="trp-carnet__svc">{apptLabel(a, byId)}{a.master ? ` · ${a.master}` : ''}</span>
                </span>
                <span className="trp-carnet__side" onClick={(e) => e.stopPropagation()}>
                  <PayStatusPill a={a} byId={byId} />
                  {state !== 'payé' && state !== 'gratuit' && (
                    <button
                      type="button"
                      className="trp-carnet__pay"
                      onClick={(e) => { e.stopPropagation(); setPayAppt(a); }}
                      title={`Encaisser ${due > 0 ? fmtMoney(due, currency) : ''}`.trim()}
                    >
                      Encaisser{due > 0 ? ` · ${fmtMoney(due, currency)}` : ''}
                    </button>
                  )}
                </span>
              </div>
            ))}
            {carnet.shown.length > 200 && (
              <div className="mnd-muted" style={{ fontSize: 11.5, padding: '10px 2px 2px', fontStyle: 'italic' }}>
                200 rendez-vous affichés sur {carnet.shown.length}, affinez avec le filtre ou le mois.
              </div>
            )}
          </div>
        )}
      </div>

      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
      {/* Rituel sans facture ouvert depuis un détail — on peut l'encaisser d'ici. */}
      {editAppt && (
        <RdvModal
          onClose={() => setEditAppt(null)}
          appt={editAppt}
          onEncaisser={(a) => { setEditAppt(null); setPayAppt(a); }}
        />
      )}
      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
    </div>
  );
}
