import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHead } from '../_ui';
import { Modal, Segs } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { useAppointments, tetesVenues } from '../../../../shared/agenda';
import { useCategories } from '../../../../shared/catalog';
import { useApprenants, useSubscribers } from '../equipe/data';
import { estCouronnee, estDePassage, useClients } from '../../../../shared/clients';
import { useInvoices, invoiceRegleAu, invoiceReglements, type Invoice } from '../../../../shared/finance';
import { consultationsQueueStore } from '../../../../shared/bridges';
import { useStore } from '../../../../shared/store';
import { useClientSessions, isOnline, type ClientSession } from '../../../../shared/activity';
import {
  apptLabel, apptNetXof, apptServices, apptDiscountFactor,
  addDaysISO, frShort, todayISO, useServicesById,
  DrillModal, type Drill, type DrillRow,
} from '../clients/_shared';
import './pilotage.css';

/* Analytics — lecture de tendance. Maison neuve : tout est dérivé des magasins
   réels (carnet, factures, clientes, consultations) — aucun indice fabriqué.
   « L'intelligence a besoin de vécu — les indices apparaîtront avec l'activité. » */

type Period = 'mois' | 'trim' | 'annee';

/* « Mois » = le mois calendaire en cours (du 1er à aujourd'hui) ; trimestre et
   année restent des fenêtres glissantes. */
const PERIOD_DAYS: Record<'trim' | 'annee', number> = { trim: 91, annee: 365 };

/** Durée cumulée en clair : « 42 s », « 12 min », « 1 h 05 ». */
function fmtDuration(sec: number): string {
  if (sec < 60) return `${Math.max(0, Math.round(sec))} s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, '0')}`;
}

/** Écart relatif fin depuis une dernière activité : « à l'instant », « il y a 4 min », « il y a 2 h », « il y a 3 j ». */
function relSeen(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'à l’instant';
  const min = Math.round(s / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return `il y a ${d} j`;
}


/* Date d'un règlement de formation (jj/mm/aaaa, ou ISO) → jour ISO comparable. */
const payISOLocal = (d: string): string => {
  const fr = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : d;
};

export default function Analytics() {
  const { branch, branches, currency } = useBranch();
  const [appointments] = useAppointments();
  const [invoices] = useInvoices();
  const [clients] = useClients();
  const [apprenants] = useApprenants();
  const [abonnes] = useSubscribers();
  const [categories] = useCategories();
  const [queue] = useStore(consultationsQueueStore);
  const [sessions] = useClientSessions();
  const byId = useServicesById();

  const clientNameById = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const [period, setPeriod] = useState<Period>('trim');
  const [scope, setScope] = useState<string>(branch.id); // id de branche ou 'toutes'
  /* Un indice ne vaut que si l'on peut ouvrir ce qu'il agrège : chaque chiffre
     cliquable rend la liste des lignes qui le composent. */
  const [drill, setDrill] = useState<Drill | null>(null);
  const navigate = useNavigate();

  const scopedAppts = useMemo(
    () => appointments.filter((a) => (scope === 'toutes' ? true : a.branchId === scope)),
    [appointments, scope],
  );
  /* LES CLIENTES DE PASSAGE NE SONT PAS DES TÊTES. Elles restent dans tout ce
     qui compte de l'ARGENT (leur rituel est du chiffre d'affaires plein) et du
     TRAVAIL (la production du maître), mais elles sortent de tout ce qui compte
     des TÊTES : sans quoi « Têtes actives » et sa part du carnet mesureraient la
     fréquentation du comptoir, jamais la fidélité de la Maison — et la rétention
     s'effondrerait sans que rien n'ait changé. Voir `Client.dePassage`. */
  /* UNE TÊTE COURONNÉE S'EST ASSISE AU MOINS UNE FOIS (11 août). Un compte
     ouvert sur Ma Couronne et jamais suivi d'une venue n'est pas une cliente :
     le compter au dénominateur faisait chuter la rétention à chaque
     inscription. */
  const venues = useMemo(() => tetesVenues(appointments), [appointments]);
  const scopedClients = useMemo(
    () => clients.filter((c) => (scope === 'toutes' ? true : c.branchId === scope) && estCouronnee(c, venues)),
    [clients, scope, venues],
  );
  /* Qui ne compte pas comme tête — pour retirer ses venues de « Têtes actives »
     sans jamais toucher au revenu qu'elle a laissé. */
  const passageIds = useMemo(
    () => new Set(clients.filter(estDePassage).map((c) => c.id)),
    [clients],
  );
  const scopedPaidInvoices = useMemo(
    /* Toutes les factures : c'est le VERSEMENT qui dit ce qui est entré, pas
       le statut — une pièce à moitié réglée est « envoyée ». */
    () => invoices.filter((i) => (scope === 'toutes' ? true : i.branchId === scope) && i.kind === 'facture'),
    [invoices, scope],
  );

  const today = todayISO();
  const thisMonth = today.slice(0, 7);
  const periodStart = period === 'mois' ? `${thisMonth}-01` : addDaysISO(today, -PERIOD_DAYS[period]);

  /* — indices prospectifs : dérivés du vécu de la période, jamais inventés —
     `apptNetXof` et non `apptTotalXof` : cette carte dit « Revenu ENCAISSÉ ».
     Le total brut ignore les remises (le %, et la remise en CFA) — il annoncerait
     un encaissement que la maison n'a jamais vu. */
  const life = useMemo(() => {
    const inWindow = scopedAppts.filter((a) => a.date >= periodStart && a.date <= today && a.status !== 'annulé');
    const honored = inWindow.filter((a) => a.status === 'honoré');
    /* Valeur des rituels honorés, TOUS : c'est le panier moyen et le plus gros
       ticket. Ce n'est PAS le revenu — voir juste en dessous. */
    const honoredXof = honored.reduce((s, a) => s + apptNetXof(a, byId), 0);
    const revInv = scopedPaidInvoices.reduce((s, i) => s + regleEntre(i, periodStart, today), 0);
    /* JAMAIS DEUX FOIS. Un rituel encaissé par facture est déjà compté par sa
       facture : on n'ajoute donc que les rituels honorés SANS `invoiceId`.
       Additionner les deux totaux entiers gonflait le revenu de tout ce qui
       avait été facturé — même règle que la Synthèse et le Bilan mensuel,
       qui sont la source de vérité du chiffre d'affaires. */
    const revRit = honored
      .filter((a) => !a.invoiceId)
      .reduce((s, a) => s + apptNetXof(a, byId), 0);
    /* LES REGLEMENTS DE FORMATION SONT DU REVENU. La Synthese et le Tableau de
       bord les comptent ; cet ecran les oubliait, et affichait donc un chiffre
       inferieur pour le meme mois — sur la courbe 12 mois comme sur le panier
       moyen. Les apprenant·e·s ne sont pas rattachees a une branche : la
       formation compte quelle que soit la branche affichee, comme ailleurs. */
    const revForm = apprenants
      .flatMap((ap) => ap.payments ?? [])
      .filter((pm) => { const j = payISOLocal(pm.date); return j >= periodStart && j <= today; })
      .reduce((s2, pm) => s2 + pm.amountXof, 0);
    /* LES REGLEMENTS D'ABONNEMENT AUSSI (decision du 3 aout) : la Synthese et le
       Dashboard les comptent, cet ecran les oubliait — meme motif que la
       formation ci-dessus. Meme fenetre de dates. */
    const revAbo = abonnes
      .flatMap((sub) => sub.payments ?? [])
      .filter((pm) => pm.amountXof > 0 && (() => { const j = payISOLocal(pm.date); return j >= periodStart && j <= today; })())
      .reduce((s2, pm) => s2 + pm.amountXof, 0);
    const revenue = revInv + revRit + revForm + revAbo;
    /* Des TÊTES, pas des venues : la passante a laissé son argent au-dessus,
       elle ne gonfle pas le compte des clientes de la Maison. */
    const heads = new Set(inWindow.filter((a) => !passageIds.has(a.clientId)).map((a) => a.clientId)).size;
    const basket = honored.length > 0 ? Math.round(honoredXof / honored.length) : 0;
    const maxTicket = honored.reduce((m, a) => Math.max(m, apptNetXof(a, byId)), 0);
    return {
      revenue, revRit, honoredXof, honoredCount: honored.length, apptCount: inWindow.length,
      heads, basket, maxTicket,
      hasLife: revenue > 0 || inWindow.length > 0,
    };
  }, [scopedAppts, scopedPaidInvoices, byId, periodStart, today, apprenants, abonnes, passageIds]);

  const nameOf = (id: string) => clientNameById.get(id) ?? 'Cliente';

  /* ---------- Ce qu'il y a derrière chaque chiffre ----------
     Les mêmes filtres que les agrégats ci-dessus, mais rendus ligne à ligne :
     si le détail ne somme pas au chiffre affiché, c'est l'un des deux qui ment. */

  /** Rituels honorés d'une fenêtre, du plus récent au plus ancien.
      `onlyUnbilled` — pour le détail du REVENU, qui ne doit montrer que les
      rituels non facturés, sinon la somme des lignes dépasse le chiffre affiché
      (et c'est alors l'un des deux qui ment, cf. la note ci-dessus). Le détail
      des « rituels honorés », lui, les veut tous. */
  const honoredRows = (from: string, to: string, onlyUnbilled = false): DrillRow[] =>
    scopedAppts
      .filter((a) => a.status === 'honoré' && (!onlyUnbilled || !a.invoiceId) && a.date >= from && a.date <= to)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((a) => ({
        date: a.date,
        who: nameOf(a.clientId),
        sub: apptLabel(a, byId),
        amount: apptNetXof(a, byId),
        /* Le RDV mémorise la facture de son encaissement — un rituel honoré mais
           jamais encaissé n'en a pas, la ligne reste alors muette. */
        invoiceId: a.invoiceId,
      }));

  /** Ce qu'une pièce a REÇU dans une fenêtre — versement par versement. */
  const regleEntre = (i: Invoice, from: string, to: string): number =>
    invoiceReglements(i)
      .filter((p) => (p.date ?? '') >= from && (p.date ?? '') <= to)
      .reduce((n, p) => n + p.amountXof, 0);

  /** Factures ayant reçu de l'argent dans une fenêtre. */
  const invoiceRows = (from: string, to: string): DrillRow[] =>
    scopedPaidInvoices
      .filter((i) => regleEntre(i, from, to) > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((i) => ({
        date: i.date,
        who: i.clientName ?? nameOf(i.clientId),
        sub: `Facture ${i.number}`,
        amount: regleEntre(i, from, to),
        invoiceId: i.id,
      }));

  const openRevenue = (from: string, to: string, title: string, sub: string) => {
    const rows = [...honoredRows(from, to, true), ...invoiceRows(from, to)].sort((a, b) =>
      (a.date ?? '') < (b.date ?? '') ? 1 : -1,
    );
    setDrill({ title, sub, rows, total: rows.reduce((s, r) => s + (r.amount ?? 0), 0) });
  };

  const openHonored = () => {
    const rows = honoredRows(periodStart, today);
    setDrill({
      title: 'Rituels honorés',
      sub: `Du ${frShort(periodStart)} au ${frShort(today)}`,
      rows,
      total: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
    });
  };

  /** Détail d'une catégorie du mix : les rituels qui la portent.
      Le montant est la part de la catégorie DANS le rituel, remise répercutée
      au prorata — sinon un rituel à deux catégories serait compté deux fois plein. */
  const openMix = (catId: string, catName: string) => {
    const rows: DrillRow[] = [];
    scopedAppts
      .filter((a) => a.status !== 'annulé')
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach((a) => {
        const part = apptServices(a, byId).filter((s) => s.categoryId === catId);
        if (part.length === 0) return;
        const gross = part.reduce((s, sv) => s + sv.priceXof, 0);
        rows.push({
          date: a.date,
          who: nameOf(a.clientId),
          sub: part.map((s) => s.name).join(' · '),
          amount: Math.round(gross * apptDiscountFactor(a, byId)),
        });
      });
    setDrill({
      title: `Mix · ${catName}`,
      sub: `${rows.length} rituel${rows.length > 1 ? 's' : ''} portent cette nomenclature`,
      rows,
      total: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
    });
  };

  const indices: {
    l: string; v: string; cap: string; up: boolean; a: string; pct: number;
    open?: () => void;
  }[] = [
    {
      l: 'Revenu encaissé · période',
      v: life.revenue > 0 ? fmtMoney(life.revenue, currency) : '—',
      cap: life.revenue > 0 ? 'factures payées + rituels honorés non facturés' : 'en attente de vécu',
      up: life.revenue > 0,
      a: 'var(--color-copper)',
      /* Part du revenu qui vient des rituels PAS encore passés en facture.
         Avec `honoredXof` (tous les rituels) la barre pouvait dépasser 100 %. */
      pct: life.revenue > 0 ? Math.round((life.revRit / life.revenue) * 100) : 0,
      open: life.revenue > 0
        ? () => openRevenue(periodStart, today, 'Revenu encaissé · période', `Du ${frShort(periodStart)} au ${frShort(today)}`)
        : undefined,
    },
    {
      l: 'Rituels honorés',
      v: life.honoredCount > 0 ? String(life.honoredCount) : '—',
      cap: life.apptCount > 0 ? `${life.apptCount} rendez-vous sur la période` : 'le carnet est encore vierge',
      up: false,
      a: 'var(--color-indigo)',
      pct: life.apptCount > 0 ? Math.round((life.honoredCount / life.apptCount) * 100) : 0,
      open: life.honoredCount > 0 ? openHonored : undefined,
    },
    {
      l: 'Têtes actives',
      v: life.heads > 0 ? String(life.heads) : '—',
      cap: `${scopedClients.length} au carnet de la maison${passageIds.size > 0 ? ` · ${passageIds.size} de passage à part` : ''}`,
      up: false,
      a: 'var(--copper-600)',
      pct: scopedClients.length > 0 ? Math.min(100, Math.round((life.heads / scopedClients.length) * 100)) : 0,
    },
    {
      l: 'Panier moyen · rituel',
      v: life.basket > 0 ? fmtMoney(life.basket, currency) : '—',
      cap: life.basket > 0 ? 'par rituel honoré' : 'se calculera à l’usage',
      up: false,
      a: 'var(--indigo-400)',
      pct: life.maxTicket > 0 ? Math.round((life.basket / life.maxTicket) * 100) : 0,
    },
  ];

  /* — prévision : rythme du mois × jours restants — */
  const forecast = useMemo(() => {
    const realized = scopedAppts.filter(
      /* La prévision extrapole le RYTHME RÉEL — la bâtir sur des RDV confirmés
         non honorés gonflait le rythme avec de l'argent jamais entré. */
      (a) => a.date.slice(0, 7) === thisMonth && a.date <= today && a.status === 'honoré',
    );
    const soFar = realized.reduce((s, a) => s + apptNetXof(a, byId), 0);
    const dayOfMonth = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    return Math.round((soFar / Math.max(1, dayOfMonth)) * daysInMonth);
  }, [scopedAppts, byId, thisMonth, today]);

  /* — mix de services par nomenclature ™ — */
  const mix = useMemo(() => {
    const perCat = new Map<string, number>();
    scopedAppts
      .filter((a) => a.status !== 'annulé')
      .forEach((a) =>
        a.serviceIds.forEach((id) => {
          const sv = byId.get(id);
          if (sv) perCat.set(sv.categoryId, (perCat.get(sv.categoryId) ?? 0) + sv.priceXof);
        }),
      );
    const total = Array.from(perCat.values()).reduce((s, v) => s + v, 0);
    return {
      hasData: total > 0,
      rows: categories
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((c, i) => ({
          id: c.id,
          name: c.fon,
          pct: total > 0 ? Math.round(((perCat.get(c.id) ?? 0) / total) * 100) : 0,
          fill: ['var(--color-indigo)', 'var(--color-copper)', 'var(--indigo-400)', 'var(--indigo-300)', 'var(--copper-300)', 'var(--color-argile)'][i % 6],
        })),
    };
  }, [scopedAppts, byId, categories]);

  /* — taux de remplissage par maître (fenêtre ± 7 jours, 10 h / jour) — */
  const fillRates = useMemo(() => {
    const masters = scope === 'toutes' ? branches.flatMap((b) => b.masters) : (branches.find((b) => b.id === scope)?.masters ?? []);
    const lo = addDaysISO(today, -7);
    const hi = addDaysISO(today, 7);
    const capacityMin = 15 * 10 * 60; // 15 jours × 10 h d'ouverture
    const booked = new Map<string, number>();
    scopedAppts
      .filter((a) => a.status !== 'annulé' && a.date >= lo && a.date <= hi)
      .forEach((a) => {
        const min = a.serviceIds.reduce((s, id) => s + (byId.get(id)?.durationMin ?? 60), 0);
        booked.set(a.master, (booked.get(a.master) ?? 0) + min);
      });
    return masters
      .map((m) => ({ name: m, pct: Math.min(100, Math.round(((booked.get(m) ?? 0) / capacityMin) * 100)) }))
      .sort((a, b) => b.pct - a.pct);
  }, [scopedAppts, byId, branches, scope, today]);

  /* — transmission : consultation → réservation → fidélisation — */
  const funnel = useMemo(() => {
    /* Une consultation clôturée a quitté le tunnel : elle n'est plus « en attente
       de suite » et ne doit plus peser dans le palier (ni dans son détail). */
    const openQueue = queue.filter((q) => q.status !== 'fermée');
    const consultations = openQueue.length + scopedAppts.filter((a) => a.source === 'consultation').length;
    const reservations = scopedAppts.filter((a) => a.source === 'consultation' && a.status !== 'annulé').length;
    const perClient = new Map<string, number>();
    scopedAppts.filter((a) => a.status !== 'annulé').forEach((a) => perClient.set(a.clientId, (perClient.get(a.clientId) ?? 0) + 1));
    const fideles = scopedClients.filter((c) => (perClient.get(c.id) ?? 0) >= 2).length;
    return [
      { label: 'Consultations', n: consultations },
      { label: 'Réservations', n: reservations },
      { label: 'Fidélisation', n: fideles },
    ];
  }, [queue, scopedAppts, scopedClients]);
  const funnelMax = Math.max(...funnel.map((f) => f.n), 1);
  const hasTransmission = funnel.some((f) => f.n > 0);

  /** Détail d'un palier du Cercle — qui se cache derrière le chiffre. */
  const openFunnel = (label: string) => {
    let rows: DrillRow[] = [];
    if (label === 'Consultations') {
      rows = [
        ...queue.filter((q) => q.status !== 'fermée').map((q) => ({
          date: (q.createdAt ?? '').slice(0, 10),
          who: q.client?.name ?? 'Consultation en ligne',
          sub: 'Tunnel · en attente de suite',
        })),
        ...scopedAppts
          .filter((a) => a.source === 'consultation')
          .map((a) => ({ date: a.date, who: nameOf(a.clientId), sub: 'Consultation devenue rituel' })),
      ];
    } else if (label === 'Réservations') {
      rows = scopedAppts
        .filter((a) => a.source === 'consultation' && a.status !== 'annulé')
        .map((a) => ({ date: a.date, who: nameOf(a.clientId), sub: apptLabel(a, byId), amount: apptNetXof(a, byId), invoiceId: a.invoiceId }));
    } else {
      /* Fidélisation : deux rituels ou plus — la même règle que le compteur. */
      const perClient = new Map<string, number>();
      scopedAppts.filter((a) => a.status !== 'annulé').forEach((a) => perClient.set(a.clientId, (perClient.get(a.clientId) ?? 0) + 1));
      rows = scopedClients
        .filter((c) => (perClient.get(c.id) ?? 0) >= 2)
        .map((c) => ({ who: c.name, sub: `${perClient.get(c.id)} rituels au carnet` }));
    }
    rows.sort((a, b) => ((a.date ?? '') < (b.date ?? '') ? 1 : -1));
    setDrill({
      title: `Le Cercle · ${label}`,
      sub: `${rows.length} ligne${rows.length > 1 ? 's' : ''}`,
      rows,
      total: rows.some((r) => r.amount !== undefined) ? rows.reduce((s, r) => s + (r.amount ?? 0), 0) : undefined,
    });
  };

  /* — revenu encaissé · 12 mois — MÊMES composantes que la carte du haut :
       factures (versement par versement) + rituels honorés NON facturés +
       formation + abonnements. Le `!a.invoiceId` évite de compter deux fois un
       rituel déjà encaissé par sa facture. La formation et l'abonnement y
       manquaient : chaque barre sous-estimait le mois. */
  const monthly = useMemo(() => {
    const now = new Date();
    const fluxDuMois = (porteurs: { payments?: readonly { date: string; amountXof: number }[] }[], mk: string, positifSeul: boolean) =>
      porteurs.flatMap((p) => p.payments ?? [])
        .filter((pm) => (!positifSeul || pm.amountXof > 0) && payISOLocal(pm.date).slice(0, 7) === mk)
        .reduce((s, pm) => s + pm.amountXof, 0);
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const appt = scopedAppts
        .filter((a) => a.status === 'honoré' && !a.invoiceId && a.date.slice(0, 7) === mk)
        .reduce((s, a) => s + apptNetXof(a, byId), 0);
      const inv = scopedPaidInvoices.reduce((s, x) => s + invoiceRegleAu(x, mk), 0);
      const form = fluxDuMois(apprenants, mk, false);
      const abo = fluxDuMois(abonnes, mk, true);
      return { mk, label: d.toLocaleDateString('fr-FR', { month: 'narrow' }).toUpperCase(), total: appt + inv + form + abo };
    });
  }, [scopedAppts, scopedPaidInvoices, byId, apprenants, abonnes]);
  const yearTotal = monthly.reduce((s, m) => s + m.total, 0);
  const chartMax = Math.max(...monthly.map((m) => m.total), 1);

  /* — Activité des clientes · Ma Couronne : présence & temps sur la plateforme —
     Sessions regroupées par cliente, filtrées au périmètre (branchId de la session). */
  const activity = useMemo(() => {
    const scoped = sessions.filter((s: ClientSession) => (scope === 'toutes' ? true : s.branchId ? s.branchId === scope : true));
    const byClient = new Map<string, ClientSession[]>();
    scoped.forEach((s) => {
      const arr = byClient.get(s.clientId) ?? [];
      arr.push(s);
      byClient.set(s.clientId, arr);
    });
    const rows = Array.from(byClient.entries()).map(([clientId, list]) => {
      const last = list.reduce((a, b) => (b.lastSeenAt > a.lastSeenAt ? b : a));
      return {
        clientId,
        name: list.find((s) => s.clientName)?.clientName ?? clientNameById.get(clientId) ?? 'Cliente',
        online: list.some((s) => isOnline(s)),
        lastSeenAt: last.lastSeenAt,
        screen: last.screen,
        totalSec: list.reduce((sum, s) => sum + s.durationSec, 0),
        count: list.length,
      };
    });
    rows.sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeenAt > a.lastSeenAt ? 1 : b.lastSeenAt < a.lastSeenAt ? -1 : 0));
    const onlineNow = rows.filter((r) => r.online).length;
    const avgSec = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.totalSec, 0) / rows.length) : 0;
    return { rows, onlineNow, avgSec, scoped };
  }, [sessions, scope, clientNameById]);

  /* — Activité des clientes · 7 derniers jours, en barres comme le revenu —
     Une session est rangée au jour de sa DERNIÈRE trace (`lastSeenAt`) : c'est le
     seul horodatage dont on soit sûr, `startedAt` n'existe pas sur le magasin. */
  const weekly = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysISO(today, -(6 - i));
      const d = new Date(`${iso}T00:00:00`);
      return {
        iso,
        label: d.toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase(),
        visits: 0,
        sec: 0,
        heads: new Set<string>(),
      };
    });
    const byIso = new Map(days.map((d) => [d.iso, d]));
    activity.scoped.forEach((s: ClientSession) => {
      const day = byIso.get((s.lastSeenAt ?? '').slice(0, 10));
      if (!day) return;
      day.visits += 1;
      day.sec += s.durationSec;
      day.heads.add(s.clientId);
    });
    const totalVisits = days.reduce((n, d) => n + d.visits, 0);
    const totalSec = days.reduce((n, d) => n + d.sec, 0);
    return { days, totalVisits, totalSec, max: Math.max(...days.map((d) => d.visits), 1) };
  }, [activity.scoped, today]);

  /** Détail d'un jour de présence — qui est passée, et combien de temps. */
  const openDay = (iso: string) => {
    const rows: DrillRow[] = activity.scoped
      .filter((s: ClientSession) => (s.lastSeenAt ?? '').slice(0, 10) === iso)
      .sort((a: ClientSession, b: ClientSession) => (a.lastSeenAt < b.lastSeenAt ? 1 : -1))
      .map((s: ClientSession) => ({
        date: iso,
        who: s.clientName ?? clientNameById.get(s.clientId) ?? 'Cliente',
        sub: `${fmtDuration(s.durationSec)} · ${s.screen ?? 'écran inconnu'}`,
      }));
    setDrill({
      title: `Présence · ${frShort(iso)}`,
      sub: rows.length > 0 ? `${rows.length} visite${rows.length > 1 ? 's' : ''}` : 'aucune visite ce jour-là',
      rows,
    });
  };

  const scopeChips = [
    { id: 'toutes', label: 'Toutes les branches' },
    ...branches.map((b) => ({ id: b.id, label: b.name })),
  ];

  return (
    <div className="mnd-rise">
      <PageHead
        eyebrow="Analytics · Lecture de tendance"
        title="Les tendances."
        actions={
          <Segs<Period>
            options={[
              { value: 'mois', label: 'Mois' },
              { value: 'trim', label: 'Trimestre' },
              { value: 'annee', label: 'Année' },
            ]}
            value={period}
            onChange={setPeriod}
          />
        }
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: -12 }}>
        {scopeChips.map((c) => (
          <button key={c.id} className={`trp-chip ${scope === c.id ? 'is-active' : ''}`} onClick={() => setScope(c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {!life.hasLife && (
        <div className="trp-panel" style={{ marginTop: 18 }}>
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 16, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
            L’intelligence a besoin de vécu, les indices apparaîtront avec l’activité de la maison.
          </div>
        </div>
      )}

      {/* Indices prospectifs, jauges fines — dérivés de la période */}
      <div className="tr-grid tr-grid--4" style={{ marginTop: 18 }}>
        {indices.map((i) => {
          const inner = (
            <>
              <span className="trp-kpi__bar" style={{ background: i.a }} />
              <div className="trp-index__label">{i.l}</div>
              <div className="trp-index__value">{i.v}</div>
              <svg viewBox="0 0 100 8" style={{ width: '100%', height: 8, marginTop: 12, display: 'block' }} aria-hidden>
                <line x1="0" y1="4" x2="100" y2="4" stroke="var(--hairline)" strokeWidth="2" />
                <line x1="0" y1="4" x2={i.pct} y2="4" stroke={i.a} strokeWidth="4" strokeLinecap="round" />
              </svg>
              <div className={`trp-index__cap ${i.up ? 'trp-index__cap--up' : ''}`}>{i.cap}</div>
            </>
          );
          /* Seuls les indices qui ont un détail à montrer deviennent cliquables :
             un bouton qui ouvre une liste vide serait une promesse en l'air. */
          return i.open ? (
            <button type="button" key={i.l} className="trp-index trp-index--click" onClick={i.open} title="Voir le détail">
              {inner}
            </button>
          ) : (
            <div className="trp-index" key={i.l}>{inner}</div>
          );
        })}
      </div>

      {/* Revenu encaissé · 12 mois */}
      <div className="trp-rev" style={{ marginTop: 18, borderRadius: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="trp-rev__eyebrow">Revenu encaissé · 12 mois</div>
            <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 4 }}>
              Rituels honorés et factures payées, la preuve se construit mois après mois.
            </div>
          </div>
        </div>
        {yearTotal > 0 ? (
          <svg viewBox="0 0 480 190" style={{ width: '100%', height: 190, marginTop: 18, display: 'block' }} aria-hidden>
            {monthly.map((m, i) => {
              const x = 10 + i * 39;
              const h = (m.total / chartMax) * 150;
              const openMonth = () =>
                openRevenue(`${m.mk}-01`, `${m.mk}-31`, `Revenu encaissé · ${m.mk}`, 'Rituels honorés et factures payées du mois');
              return (
                <g
                  key={m.mk}
                  onClick={m.total > 0 ? openMonth : undefined}
                  style={{ cursor: m.total > 0 ? 'pointer' : 'default' }}
                >
                  {/* Cible de clic pleine hauteur : viser une barre de 1px serait cruel. */}
                  <rect x={x - 6} y={10} width={38} height={158} fill="transparent" />
                  <rect x={x} y={168 - h} width={26} height={Math.max(1, h)} fill={m.total > 0 ? 'var(--color-copper)' : 'rgba(246,241,231,0.10)'} />
                  <text x={x + 13} y={184} textAnchor="middle" fontSize={9} fontFamily="var(--font-sans)" fill="var(--indigo-200)">
                    {m.label}
                  </text>
                  {m.total > 0 && <title>{`${m.mk} · ${fmtMoney(m.total, currency)}`}</title>}
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ padding: '38px 0 26px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--indigo-100)' }}>
            Aucun encaissement encore, le premier rituel honoré posera la première pierre de cette courbe.
          </div>
        )}
        <div className="trp-rev__foot">
          <span>Périmètre · {scope === 'toutes' ? 'toutes les branches' : (branches.find((b) => b.id === scope)?.name ?? '')}</span>
          <span className="trp-rev__best">{yearTotal > 0 ? fmtMoney(yearTotal, currency) : '—'}</span>
        </div>
      </div>

      {/* Mix de services + remplissage */}
      <div className="tr-grid tr-grid--2" style={{ marginTop: 18 }}>
        <div className="trp-panel">
          <div className="trp-panel__title">Mix de services · lexique ™</div>
          {!mix.hasData && (
            <div className="mnd-muted" style={{ fontSize: 13, fontFamily: 'var(--font-serif)', fontStyle: 'italic', marginBottom: 12 }}>
              Le mix se dessinera avec les premiers rituels du carnet.
            </div>
          )}
          {mix.rows.map((x) => (
            <button
              type="button"
              key={x.name}
              className="trp-drill"
              disabled={!mix.hasData}
              onClick={() => openMix(x.id, x.name)}
              title={mix.hasData ? 'Voir les rituels de cette nomenclature' : undefined}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="mnd-serif" style={{ fontSize: 15, color: 'var(--color-indigo)' }}>{x.name}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{mix.hasData ? `${x.pct} %` : '—'}</span>
              </div>
              <div className="trp-bar" style={{ marginTop: 5 }}>
                <div style={{ width: `${x.pct}%`, background: x.fill }} />
              </div>
            </button>
          ))}
        </div>
        <div className="trp-panel">
          <div className="trp-panel__title">Taux de remplissage · par Maître</div>
          {fillRates.map((f, i) => (
            <div key={f.name} style={{ marginBottom: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, color: 'var(--ink)' }}>{f.name}</span>
                <span className="mnd-serif" style={{ fontSize: 17, color: 'var(--color-indigo)' }}>{f.pct > 0 ? `${f.pct} %` : '—'}</span>
              </div>
              <div className="trp-bar" style={{ height: 6, marginTop: 6 }}>
                <div style={{ width: `${f.pct}%`, background: i === 0 ? 'var(--color-copper)' : 'var(--indigo-400)' }} />
              </div>
            </div>
          ))}
          {fillRates.length === 0 && <div className="mnd-muted" style={{ fontSize: 13 }}>Aucun maître sur ce périmètre.</div>}
          {fillRates.length > 0 && fillRates.every((f) => f.pct === 0) && (
            <div className="mnd-muted" style={{ fontSize: 12, fontFamily: 'var(--font-serif)', fontStyle: 'italic', marginTop: 4 }}>
              Les fauteuils attendent leurs premiers rendez-vous, le remplissage se lira ici.
            </div>
          )}
        </div>
      </div>

      {/* Prévision + transmission */}
      <div className="tr-cols" style={{ '--cols': '1.2fr 1fr', gap: 18, marginTop: 18, alignItems: 'stretch' } as CSSProperties}>
        <div className="trp-panel" style={{ position: 'relative', overflow: 'hidden' }}>
          <span className="trp-kpi__bar" style={{ background: 'var(--indigo-400)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="trp-panel__title" style={{ marginBottom: 0 }}>Prévision · IA souveraine</div>
            <span className="mnd-badge">fin de mois</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 14 }}>
            <span className="mnd-serif" style={{ fontSize: 42, lineHeight: 1, color: 'var(--color-indigo)' }}>
              {forecast > 0 ? fmtMoney(forecast, currency) : '—'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--copper-600)' }}>{forecast > 0 ? 'au rythme réel du carnet' : ''}</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 300, color: 'var(--ink-soft)', marginTop: 10, lineHeight: 1.5 }}>
            {forecast > 0
              ? 'Projection au rythme réel du carnet, portée par les rituels confirmés et honorés du mois.'
              : 'La prévision attend les premiers rituels du mois, elle se calcule sur le rythme réel du carnet, jamais sur une hypothèse.'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--hairline)' }}>
            L’humain décide · la maison propose.
          </div>
        </div>

        <div className="trp-obsidian">
          <div className="trp-rev__eyebrow">Le Cercle · transmission</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 10 }}>
            <span className="mnd-serif" style={{ fontSize: 44, lineHeight: 1 }}>{hasTransmission ? funnel[0].n : '—'}</span>
            <span style={{ fontSize: 12, color: 'var(--indigo-100)' }}>{hasTransmission ? 'consultations reçues' : 'têtes apportées / cliente'}</span>
          </div>
          <div style={{ marginTop: 16 }}>
            {funnel.map((f) => (
              <button
                type="button"
                className="trp-funnel__row trp-drill trp-drill--dark"
                key={f.label}
                disabled={f.n === 0}
                onClick={() => openFunnel(f.label)}
                title={f.n > 0 ? 'Voir le détail' : undefined}
              >
                <span className="trp-funnel__label" style={{ color: 'var(--indigo-100)' }}>{f.label}</span>
                <div className="trp-bar" style={{ flex: 1, background: 'rgba(246,241,231,0.14)' }}>
                  <div style={{ width: `${Math.round((f.n / funnelMax) * 100)}%`, background: 'var(--color-copper)' }} />
                </div>
                <span className="trp-funnel__num" style={{ color: 'var(--copper-200)' }}>{f.n}</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 300, color: 'var(--indigo-100)', marginTop: 12, lineHeight: 1.5 }}>
            {hasTransmission
              ? `${funnel[1].n} réservation${funnel[1].n > 1 ? 's' : ''} nées de la consultation · ${funnel[2].n} tête${funnel[2].n > 1 ? 's' : ''} fidélisée${funnel[2].n > 1 ? 's' : ''}, le coefficient de transmission se calculera avec la lignée.`
              : 'Le Cercle s’exprimera dès les premières introductions, l’intelligence a besoin de vécu.'}
          </div>
        </div>
      </div>

      {/* Activité des clientes · 7 derniers jours — mêmes barres que le revenu */}
      <div className="trp-rev" style={{ marginTop: 18, borderRadius: 4 }}>
        <div>
          <div className="trp-rev__eyebrow">Activité des clientes · 7 derniers jours</div>
          <div style={{ fontSize: 11.5, color: 'var(--indigo-100)', marginTop: 4 }}>
            Visites sur Ma Couronne, jour après jour, la présence se lit comme le revenu.
          </div>
        </div>
        {weekly.totalVisits > 0 ? (
          <svg viewBox="0 0 480 190" style={{ width: '100%', height: 190, marginTop: 18, display: 'block' }}>
            {weekly.days.map((d, i) => {
              const x = 20 + i * 66;
              const h = (d.visits / weekly.max) * 150;
              return (
                <g key={d.iso} onClick={() => openDay(d.iso)} style={{ cursor: 'pointer' }}>
                  <rect x={x - 8} y={10} width={60} height={158} fill="transparent" />
                  <rect x={x} y={168 - h} width={44} height={Math.max(1, h)} fill={d.visits > 0 ? 'var(--color-copper)' : 'rgba(246,241,231,0.10)'} />
                  <text x={x + 22} y={184} textAnchor="middle" fontSize={9} fontFamily="var(--font-sans)" fill="var(--indigo-200)">
                    {d.label}
                  </text>
                  <title>{`${frShort(d.iso)} · ${d.visits} visite${d.visits > 1 ? 's' : ''} · ${fmtDuration(d.sec)}`}</title>
                </g>
              );
            })}
          </svg>
        ) : (
          <div style={{ padding: '38px 0 26px', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 15, color: 'var(--indigo-100)' }}>
            Aucune visite cette semaine, la présence se dessinera dès la première cliente sur Ma Couronne.
          </div>
        )}
        <div className="trp-rev__foot">
          <span>
            {weekly.totalVisits > 0
              ? `${weekly.totalVisits} visite${weekly.totalVisits > 1 ? 's' : ''} · ${fmtDuration(weekly.totalSec)} au total`
              : 'Périmètre · Ma Couronne'}
          </span>
          <span className="trp-rev__best">{activity.onlineNow > 0 ? `${activity.onlineNow} en ligne` : '—'}</span>
        </div>
      </div>

      {/* Activité des clientes · Ma Couronne — présence temps réel & temps sur la plateforme */}
      <div className="trp-panel" style={{ marginTop: 18 }}>
        <div className="trp-mon__head">
          <div className="trp-panel__title" style={{ marginBottom: 0 }}>Activité des clientes · Ma Couronne</div>
          {activity.rows.length > 0 && (
            <div className="trp-mon__headline">
              <span className="trp-dot is-on" style={{ marginRight: 6 }} />
              {activity.onlineNow > 0
                ? `${activity.onlineNow} en ligne maintenant`
                : 'aucune en ligne'}
              <span className="trp-mon__sep">·</span>
              temps moyen {fmtDuration(activity.avgSec)}
            </div>
          )}
        </div>
        {activity.rows.length === 0 ? (
          <div className="trp-empty">Aucune visite cliente pour l’instant.</div>
        ) : (
          <div className="trp-act">
            {activity.rows.map((r) => (
              <div className="trp-act__row" key={r.clientId}>
                <span className={`trp-dot ${r.online ? 'is-on' : ''}`} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="trp-act__name">{r.name}</div>
                  <div className="trp-act__meta">
                    {r.online ? 'En ligne' : relSeen(r.lastSeenAt)}
                    <span className="trp-mon__sep">·</span>
                    {r.screen ?? 'écran inconnu'}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="trp-act__time">{fmtDuration(r.totalSec)}</div>
                  <div className="trp-act__meta">{r.count} session{r.count > 1 ? 's' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}
