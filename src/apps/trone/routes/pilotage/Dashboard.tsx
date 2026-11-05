import { attendEncore } from '../../../../shared/salle-des-envois';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import { maisonNom, signeLeMessage } from '../../../../shared/identite';
import { openingForIso, joursFermesParmi, prochainJourOuvert } from '../../../../shared/settings';
import { quandDemandee, horodatageLisible, porteDuRendezVous } from '../../../../shared/temps';
import { joursAvantAnniversaire, useClients, type Client } from '../../../../shared/clients';
import { CarteModal } from '../clients/CarteModal';
import { appointmentsStore, tetesVenues, type Appointment } from '../../../../shared/agenda';
import { useAppels, appelsAActer, marquerAppelFait, reporterAppel, messageAppel } from '../../../../shared/appels';
import { useCategories } from '../../../../shared/catalog';
import { useInvoices, useDepensesComptees, invoiceReglements, invoiceResteXof, depensesDuMois, type Invoice } from '../../../../shared/finance';
import { useApprenants, useEnvois, useSubscribers } from '../equipe/data';
import { etatDeLaTournee } from '../../../../shared/tournee';
import { nommeLeRendezVous } from '../../../../shared/message-du-foyer-pur';
import { usePrets, pretsASurveiller, joursEntre } from '../../../../shared/foyer';
import { useCoffre, useObjectifs, objectifsASurveiller } from '../../../../shared/finance';
import { chiffreAttenduDuJour } from '../clients/chiffre-du-jour-pur';
import { GroupeDeReplis, Repli } from './Replis';
import {
  RdvModal, ReminderBell, StatusPill, tarifsDuRituel, apptLabel, apptNetXof, apptDueXof, apptDurationMin, addDaysISO, frShort, frShortAn, fromISO,
  predictNextVisit, timeToMin, todayISO, useBranchAppointments, useBranchClients, useServicesById,
  DrillModal, revenuDuMois, useClefDuTarif, type Drill, type DrillRow,
} from '../clients/_shared';
import { relancesAReprendre } from '../../../../shared/afaire';
import { composeStore, compositionsRecuesStore } from '../../../../shared/bridges';
import { useEnfantsDeclares, nomPropose } from '../../../../shared/enfants';
import { createStore, useStore } from '../../../../shared/store';
import { PayAppointmentModal, honoreSansEncaisser } from '../clients/actions';
import { FenetreDuProchainRituel } from '../vente/SonProchainRituel';
import { laCarteSOuvreApresLHonneur } from '../../../../shared/carte-du-prochain-rituel';
import { useModelBands, useBandSets } from '../../../../shared/pricing';
import { useProducts } from '../../../../shared/catalog';
import { supabase } from '../../../../shared/supabase';
import { sameName } from '../../../../shared/text';
import { useTips } from '../../../../shared/tips';
import { mesPourboires } from '../../../../shared/pourboires-de-l-equipe-pur';
import { useMaFicheDansLEquipe } from '../equipe/MesPourboires';
import { useEstDirection } from '../_vie';
import './pilotage.css';
import './tableau-de-bord.css';
import { RevenuDuJour } from '../finances/RevenuDuJour';
import { LaVeilleAValider } from '../finances/LaVeilleAValider';
import { useClotureDuJour } from '../finances/useClotureDuJour';
import { useRegistreEncaissements } from '../finances/_shared';
import { revenuDuJour } from '../../../../shared/caisse-du-soir-pur';
import { ChampDeDate } from '../../../../ds/dates';
import { cheminDeLaConversation, lienDuFil } from '../../../../shared/conversations';
import { ListeDeLAlarme, filPressant, useLAlarmeWhatsApp } from './AlarmeWhatsApp';
import { usePrevisionDuMois } from './PrevisionDuMois';
import { PassageDeGerard } from '../clients/PassageDeGerard';
import { PassageAvantLeFauteuil } from '../clients/PassageAvantLeFauteuil';
import { useDemandes, demandesTriees, ditLeBesoin, ditLeGenre, depuisQuand, telephoneMasque, nomDeLaDemande } from '../../../../shared/demandes';
import { appelDe } from '../../../../shared/civilite';
import { useSignalements } from '../../../../shared/entre-deux';
import { enRetard, fileRangee, niveauDe } from '../../../../shared/entre-deux-pur';
import { useEnvoiDeLaPiece } from '../vente/envoi-de-la-piece';
import {
  useEngagements, useDevisRecus, useVersementsEngagement, litLesDossiers, bilanDesEngagements, restesDits,
} from '../../../../shared/engagements';
import {
  clientesActives, dateDuTitre, encaissePourLesMoisDAvant, honoresDuMois, joursDits, moisAvant, nombreDe, nomDuMois,
  septJours, versementsDuMois,
} from './tableau-de-bord-pur';
import {
  estFermeLe, useDepensesAValider, useEnvoisDeLaDemiHeure, useLaVeilleEnNombres, useMinute, usePlacesLimiteesOuvertes, usePourboiresDeLEquipe,
  useProchainPassageDeGrenat, useSynchroDite,
} from './tableau-de-bord-donnees';

/* Tableau de bord — la salle du conseil au matin. Tout est dérivé des magasins,
   filtré par la branche, exprimé dans sa devise.

   ══ EN QUATRE BANDES — 5 novembre 2026 ══════════════════════════════════
   « Make dashboard more pro, expert ready, less writing, plus avec des
   chiffres. Il y a trop de choses partout et ce n'est pas structuré ni
   cohérent » (Yéman) ; maquette validée le même jour (« c'est bon
   construis ») : l'en-tête et ses puces, le bandeau de six chiffres,
   Aujourd'hui et À traiter côte à côte, Le mois ; et dessous, fermé au
   départ, un seul groupe « Le détail » pour les panneaux qui agissent.
   Chaque chiffre mène à son écran d'un toucher ; aucune phrase n'explique.
   Où sont partis les blocs d'avant :
     · « Mes pourboires » : Équipe › Mon mois (le bloc vit là) ;
     · la prévision du mois et « Demander aux chiffres » : Les prévisions ›
       Le mois en francs ; ici, sa seule fourchette ;
     · « Le mois, par maison » : la Synthèse (« Chiffre par maison ») ;
     · l'alarme WhatsApp, la veille à valider, la journée de Grenat, les
       appels, les demandes, la tournée, ce qui presse, les impayés : une
       ligne chiffrée de « À traiter » chacun, et leur panneau dans « Le
       détail ».
   L'ÉQUIPE (ni souverain ni gérant) lit une version courte : sa journée,
   ses rendez-vous, ses pourboires, jamais les chiffres de la Maison. */

/* Les arrivées d'enfants DÉJÀ REÇUES (marquées d'un geste) — mémoire locale du
   poste, comme la file des compositions : le journal `enfants_declares`, lui,
   reste intact. */
const enfantsRecusVusStore = createStore<string[]>('mnd_enfants_recus_vus', []);

/* Un rendez-vous sans prestation se dit « · », jamais d'un tiret cadratin. */
const rituelDit = (label: string): string => (label.trim() === String.fromCharCode(8212) ? '·' : label);

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

/** Une ligne de « À traiter » s'accorde à son chiffre : « 1 geste », « 2 gestes ». */
const accorde = (n: number, un: string, plusieurs: string): string => (n > 1 ? plusieurs : un);

export default function Dashboard() {
  /* La direction, ou le Trône d'essai sans serveur (rien n'y est protégé qui
     ne soit déjà sur l'appareil : la règle de `useVoitLesPourboiresDeLEquipe`). */
  const voitLaMaison = useEstDirection() || !supabase;
  return voitLaMaison ? <TableauDeLaDirection /> : <TableauDeLEquipe />;
}

function TableauDeLaDirection() {
  const navigate = useNavigate();
  const { branch, currency } = useBranch();
  /* La facture à régler part seule chez elle (17 octobre 2026). */
  const envoiDeLaPiece = useEnvoiDeLaPiece();
  /* LES DEMANDES DU SITE SUR LE TABLEAU DE BORD — 28 septembre 2026 :
     « demande de RDV doit venir sur le tableau de bord » (Yéman). Les
     demandes NOUVELLES de la branche, rendez-vous et rappels, les plus
     récentes d'abord ; chacune s'ouvre dans Demandes, et un rendez-vous déjà
     posé s'ouvre au calendrier, à son jour. */
  const [demandes] = useDemandes();
  const demandesRows = useMemo(
    () => demandesTriees(demandes.filter((d) => d.branchId === branch.id && d.statut === 'nouvelle' && !d.archiveeLe)),
    [demandes, branch.id],
  );
  const [appels] = useAppels();
  const appelsAFaire = appelsAActer(appels, branch.id);
  const demainAppel = addDaysISO(todayISO(), 1);
  /* « Créer le RDV » ouvre DIRECTEMENT le formulaire de rendez-vous (pré-rempli
     de la cliente), pas sa fiche. On retient le nombre de ses RDV avant, pour
     marquer l'appel « fait » seulement si un rendez-vous a bien été posé. */
  const [rdvPour, setRdvPour] = useState<{ clientId: string; appelId: string; avant: number } | null>(null);
  const ouvrirRdv = (clientId: string, appelId: string) =>
    setRdvPour({ clientId, appelId, avant: appointmentsStore.get().filter((x) => x.clientId === clientId).length });
  const appts = useBranchAppointments();
  const clients = useBranchClients();
  const [allClients] = useClients();
  const byId = useServicesById();
  /* Le tarif d’une tête a pu changer sans qu’aucun rendez-vous ne bouge (fiche
     recomptée, barème) : les totaux qui lisent les rendez-vous à venir se
     refont sur cette clef (9 octobre 2026). */
  const clefDuTarif = useClefDuTarif();
  const [invoices] = useInvoices();
  const [lesPrets] = usePrets();
  const pretsAVeiller = pretsASurveiller(lesPrets, branch.id, todayISO());
  /* LES JALONS D’ÉPARGNE QUI PRESSENT — 23 août 2026, arbitrage de Yéman :
     « oui, comme pour les prêts ». Un objectif qu’on ne voit pas est un
     objectif qu’on n’alimente pas. Même fenêtre, même tri par urgence. */
  const [lesMoves] = useCoffre();
  const [lesObjectifs] = useObjectifs();
  const jalonsAVeiller = objectifsASurveiller(
    lesObjectifs, lesMoves.filter((m) => m.branchId === branch.id), branch.id, todayISO(),
  );
  /* CE QUI ATTEND UN OUI N'EST PAS ENCORE UNE DÉPENSE — 31 août 2026.
     Voir `compteDansLesChiffres` dans `shared/finance.ts`. */
  const expenses = useDepensesComptees();
  const [categories] = useCategories();
  /* Index des catégories — c'est leur `maison` qui range le chiffre côté
     Atelier ou côté Studio. */
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const [apprenants] = useApprenants();
  const [abonnes] = useSubscribers();

  const [breakOpen, setBreakOpen] = useState(false);
  const [drill, setDrill] = useState<Drill | null>(null);
  const [jourOuvert, setJourOuvert] = useState<string | null>(null);
  const registre = useRegistreEncaissements();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const [produitsTarif] = useProducts();
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const [payAppt, setPayAppt] = useState<Appointment | null>(null);
  /* Son prochain rituel après « honoré » (4 novembre 2026) : proposé, validé d'un toucher. */
  const [prochainPour, setProchainPour] = useState<string | null>(null);

  const today = todayISO();
  /* La prévision du mois : le tableau de bord n'en lit que la fourchette (son
     bloc et « Demander aux chiffres » vivent aux Prévisions, 5 novembre 2026). */
  const prevDuMois = usePrevisionDuMois();
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

  const { revenue, spent, rev7, todayRows } = useMemo(() => {
    /* Une prestation encaissée porte un invoiceId : sa facture (payée) la compte déjà.
       On ne recompte donc jamais l'appt côté carnet → fini le double comptage carnet+caisse. */
    /* SEUL un rituel HONORÉ est du chiffre. L'ancienne présomption « confirmé et
       daté d'aujourd'hui ou avant = réalisé » comptait les RDV du jour dès le matin
       (avant que la cliente n'arrive) et les no-shows confirmés pour toujours —
       des revenus « réels » qui n'avaient jamais eu lieu. */
    const realized = (a: Appointment) => !a.invoiceId && a.status === 'honoré';
    const realizedAppts = appts.filter(realized);
    /* TOUTES LES FACTURES : c'est le VERSEMENT qui dit ce qui est entré, plus
       le statut de la pièce. Une facture à moitié réglée est « envoyée » ;
       filtrer sur `payée` effacerait l'argent déjà reçu dessus. */
    const paidInv = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture');

    /* `cut` : borne haute du jour (comparaison à jour égal) — absent, le mois entier. */
    const apptRev = (mk: string, cut?: string) => realizedAppts
      .filter((a) => monthKey(a.date) === mk && (!cut || a.date <= cut))
      .reduce((s, a) => s + apptNetXof(a, byId), 0);
    const invRev = (mk: string, cut?: string) => paidInv.reduce(
      (s, i) => s + invoiceReglements(i)
        .filter((p) => (p.date ?? '').startsWith(mk) && (!cut || p.date <= cut))
        .reduce((n, p) => n + p.amountXof, 0),
      0,
    );
    /* UNE SEULE PORTE POUR LES DÉPENSES DU MOIS — récurrentes comprises, comme
       la Synthèse et l'onglet Dépenses. Le filtre local d'avant oubliait les
       récurrentes engagées un mois antérieur : le Résultat net s'en trouvait
       trop beau. Voir `depensesDuMois` (shared/finance.ts). */
    const exp = (mk: string, cut?: string) => depensesDuMois(expenses, branch.id, mk, cut);

    // Règlements de formation (Académie) — revenu réel de la Maison (hors branche).
    const formPays = apprenants.flatMap((ap) =>
      (ap.payments ?? []).map((p) => ({ amount: p.amountXof, mk: payMonthKey(p.date), iso: payISO(p.date) })),
    );
    const formRev = (mk: string, cut?: string) => formPays
      .filter((p) => p.mk === mk && (!cut || p.iso <= cut))
      .reduce((s, p) => s + p.amount, 0);

    /* L'ARGENT REÇU D'UN JOUR — 3 octobre 2026, maquette « Le pointage du
       jour ». La barre comptait aussi les rituels honorés sans facture (aucun
       franc entré) et l'avoir déjà versé un autre jour : elle pouvait dépasser
       ce que les tiroirs avaient reçu. Elle lit désormais le registre, comme
       la fenêtre qu'elle ouvre (`RevenuDuJour`) : même règle, même total. */
    const dayRev = (iso: string) => revenuDuJour(registre, iso).reduce((s, r) => s + r.amountXof, 0);

    const rev7 = Array.from({ length: 7 }, (_, i) => {
      const iso = addDaysISO(today, i - 6);
      return { iso, total: dayRev(iso), label: fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'narrow' }).toUpperCase() };
    });

    /* LE CHIFFRE PAR MAISON (Atelier MND™ / Studio ACƆ™) a quitté le tableau
       de bord le 5 novembre 2026 : la Synthèse le ventile déjà, ligne à ligne
       et visite par visite (« Chiffre par maison »). */

    return {
      /* CA du mois par la porte unique `revenuDuMois` (clients/_shared) —
         abonnements COMPRIS, comme la Synthèse (ils manquaient ici). Écran
         opérationnel : toutes les caisses comptent. */
      /* ENCAISSÉ À CE JOUR — 1er octobre 2026. Sans borne, un versement daté du
         15 comptait dès le 1er : « j'ai besoin que ce soit les revenus actuels,
         payés » (Yéman). Ce qui est daté d'après aujourd'hui se lit à part. */
      revenue: revenuDuMois({ invoices, appts, byId, apprenants, abonnes, branchId: branch.id }, thisMonth, { cut: today }),
      /* Les revenus projetés du mois se lisent désormais dans la prévision
         (Les prévisions › Le mois en francs, « Encore attendu ») ; le
         Résultat net, dans la Synthèse (5 novembre 2026). */
      spent: exp(thisMonth),
      rev7,
      todayRows: appts
        .filter((a) => a.date === today && a.status !== 'annulé')
        .sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
    };
  }, [appts, byId, invoices, expenses, apprenants, abonnes, branch.id, today, thisMonth, prevMonth, cutPrev, registre, clefDuTarif]);

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
      if (i.branchId !== branch.id || i.kind !== 'facture') continue;
      /* Un versement par moyen : un rituel réglé moitié espèces moitié Mobile
         Money compte dans les DEUX, chacun pour sa part. */
      for (const p of invoiceReglements(i)) {
        if (!(p.date ?? '').startsWith(thisMonth) || (p.date ?? '') > today || p.amountXof <= 0) continue;
        const k = p.method || 'Autre';
        const cur = pay.get(k) ?? { count: 0, total: 0 };
        cur.count += 1;
        cur.total += p.amountXof;
        pay.set(k, cur);
      }
    }
    const encaissements = [...pay].map(([k, v]) => ({ id: k, label: k, ...v }));
    // Formation de l'Académie — un encaissement du mois, tous parcours confondus.
    const scol = apprenants
      .flatMap((ap) => ap.payments ?? [])
      .filter((p) => payMonthKey(p.date) === thisMonth && payISO(p.date) <= today)
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
  }, [appts, byId, today, clefDuTarif]);

  /* ---------- Ce qui presse — des gestes, pas des constats ----------

     LE RÉASSORT N'Y EST PLUS (décision de Yéman, 11 août). Il occupait
     jusqu'à quatre lignes sur cinq et repoussait l'argent en bas de la carte,
     alors qu'un manque de flacons se voit au comptoir et se traite dans Stock
     & Achats. Ce panneau ne garde que ce qui presse VRAIMENT le matin :
     l'argent qui doit rentrer, et la parole due à une cliente. */
  const unpaidRef = useRef<HTMLDivElement>(null);
  /* « Le détail » se pilote d'ici : une ligne de « À traiter » ouvre son
     panneau replié, puis la page y descend (27 octobre 2026 ; un seul groupe
     depuis le 5 novembre 2026). */
  const [ouvertDetail, setOuvertDetail] = useState<string | null>(null);
  const ouvreLeDetail = (cle: string) => {
    setOuvertDetail(cle);
    setTimeout(() => document.getElementById(`tdb-detail-${cle}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  /* « À ENCAISSER » (27 octobre 2026, lot 3 de l'Assistant Maison, maquette
     « 4 tuiles replacées ») : la tuile qui remplace l'agent des encaissements
     au tableau de bord, avec SON calcul, tel quel (Agents.tsx) : les factures
     de la branche qui gardent un reste, et les rituels honorés d'avant
     aujourd'hui sans facture ni versement. Des chiffres, deux liens.
     DEPUIS LE 5 NOVEMBRE 2026, c'est le chiffre « Impayés » du bandeau, et
     deux lignes de « À traiter » : les factures (`/factures?filtre=reste`,
     exactement celles-là) et les rituels (le Carnet). Les « factures à
     régler » d'avant (`facturesQuiAttendent`) en étaient une part : un seul
     compte des factures, pour qu'un chiffre ne contredise pas l'autre. */
  const aEncaisser = useMemo(() => {
    const factures = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture' && invoiceResteXof(i) > 0);
    const rituels = appts.filter((a) => a.status === 'honoré' && !a.invoiceId && a.date < today && apptDueXof(a, byId) > 0);
    return {
      factures: factures.length,
      resteFactures: factures.reduce((s, i) => s + invoiceResteXof(i), 0),
      rituels: rituels.length,
      resteRituels: rituels.reduce((s, a) => s + apptDueXof(a, byId), 0),
      lesFactures: factures,
      lesRituels: rituels,
    };
  }, [clefDuTarif, invoices, appts, byId, branch.id, today]);

  /* LES BILANS DUS ne sont plus une alerte du tableau de bord (27 octobre 2026,
     lot 3 de l'Assistant Maison, spec §12) : le juge `seancesSansBilan` reste
     partagé par le Carnet (`/customers?focus=bilans`) et par « Attend un oui »
     de l'Assistant, qui remet le bilan par la salle des envois. */
  /* LE MÊME JUGE QU'À FAIRE (`relancesAReprendre`) : la tuile mène à la même
     liste, en tête de page. */
  const reprisesARelancer = useMemo(
    () => relancesAReprendre(appts, today, addDaysISO(today, 3)).length,
    [appts, today],
  );

  /* CE QUE LA MAISON DOIT ENCORE À SES PRESTATAIRES — 15 septembre 2026.
     « Le dossier ne se solde pas tout seul. Tant qu'il reste un franc, le
     Tableau de bord le compte : ce que la Maison doit encore est une dette,
     même sans facture » (maquette des engagements, validée). Le lecteur est
     celui de l'écran et de la cloche. */
  const [engagements] = useEngagements();
  const [devisRecus] = useDevisRecus();
  const [versementsEng] = useVersementsEngagement();
  const engagementsDus = useMemo(
    () => bilanDesEngagements(litLesDossiers(engagements, devisRecus, versementsEng, branch.id, today)),
    [engagements, devisRecus, versementsEng, branch.id, today],
  );

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
  /* LA CARTE S'OUVRE ICI, sur la tête dont c'est l'anniversaire. */
  const [carteFor, setCarteFor] = useState<Client | null>(null);

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
  /* ══ PROPOSER UNE AUTRE DATE — 5 septembre 2026 ═══════════════════
     « Besoin de lui proposer une nouvelle date » (Yéman), après qu'une
     réservation soit tombée un lundi fermé.

     LE RENDEZ-VOUS SE DÉPLACE ET RESTE EN ATTENTE. Le confirmer serait décider
     à la place de la cliente ; le laisser sur son jour impossible serait tenir
     un créneau que personne n'honorera. Il porte donc la date proposée, dans
     l'état « en attente » où il était, jusqu'à ce qu'elle réponde. */
  const [proposeFor, setProposeFor] = useState<{ appt: Appointment; date: string; time: string } | null>(null);

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

  /* ENTRE DEUX SÉANCES (15 octobre 2026) : un souci Santé, ou un souci en
     retard, remonte ici, en tête, comme la maquette l'a promis. */
  const signalements = useSignalements();
  const fileEntreDeux = fileRangee(signalements);
  const santeOuverte = fileEntreDeux.filter((s) => niveauDe(s.soucis) === 'sante').length;
  const entreDeuxEnRetard = fileEntreDeux.filter((s) => enRetard(s, new Date().toISOString())).length;

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
              <div className="trp-pay__date">{frShortAn(a.date)}</div>
              <div className="trp-pay__total">{fmtMoney(rowNet, currency)}</div>
              <div className="trp-pay__due">{fmtMoney(due, currency)}</div>
              <div style={{ flex: 'none' }}><StatusPill status={a.status} /></div>
              <button
                className="trp-pay__cta"
                onClick={(e) => { e.stopPropagation(); setPayAppt(a); }}
                title="Encaisser, paiement partiel ou total"
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
      /* Honorer sans encaisser émet la facture (4 octobre 2026). */
      const h = honoreSansEncaisser(a, byId, tarifsDuRituel(a, {
        client: clients.find((c) => c.id === a.clientId),
        bands, sets, cats: categories, byId, tousServices: [...byId.values()], produits: produitsTarif,
      }));
      /* La facture à régler part seule chez elle (17 octobre 2026). */
      if (h.facture && !h.deja) void envoiDeLaPiece.aRegler(h.facture.id, a.date);
      /* La reprise n'est plus posée d'office : la carte la propose. */
      if (h.honore && laCarteSOuvreApresLHonneur(a.id)) setProchainPour(a.id);
    }
  };

  /* ---------- Ce qu'il y a derrière un chiffre ----------
     Même geste qu'Analytics : un indice s'ouvre sur les lignes qui le composent,
     et une ligne qui a une facture ouvre sa facture. */
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.name ?? 'Cliente';

  /** Le revenu d'un jour : la fenêtre du pointage (`RevenuDuJour`). */
  const openDay = (iso: string) => { setDrill(null); setJourOuvert(iso); };

  /** Les factures d'un moyen de paiement — chacune ouvrable. */
  const openPayMethod = (method: string) => {
    const partDuMoyen = (i: Invoice) => invoiceReglements(i)
      .filter((p) => (p.date ?? '').startsWith(thisMonth) && (p.date ?? '') <= today && (p.method || 'Autre') === method)
      .reduce((n, p) => n + p.amountXof, 0);
    const rows: DrillRow[] = invoices
      .filter((i) => i.branchId === branch.id && i.kind === 'facture' && partDuMoyen(i) > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((i) => ({
        who: i.clientName || nameOf(i.clientId),
        sub: `${i.number}${i.fx ? ` · ${i.fx.amount.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${i.fx.code}` : ''}`,
        date: i.date,
        amount: partDuMoyen(i),
        invoiceId: i.id,
      }));
    setDrill({
      title: `Encaissements · ${method}`,
      sub: `${rows.length} facture${rows.length > 1 ? 's' : ''} ce mois-ci`,
      rows,
      total: rows.reduce((s, r) => s + (r.amount ?? 0), 0),
    });
  };

  /* LA JOURNÉE EN SOMMES (24 octobre 2026, `chiffre-du-jour-pur`) : l'attendu,
     l'encaissé, le reste, au pied d'« Aujourd'hui » ; le même calcul qu'au Carnet. */
  const jourDuChiffre = chiffreAttenduDuJour(todayRows.map((a) => ({
    date: a.date, status: a.status, rituelXof: apptNetXof(a, byId), resteRituelXof: apptDueXof(a, byId), gamme: a.gamme,
  })), today);
  /* LES RÉSUMÉS DES LIGNES REPLIÉES — 27 octobre 2026 : chaque ligne dit, en
     chiffres, ce que son panneau contient ; le panneau lit les mêmes. */
  const appelsEnRetard = appelsAFaire.filter((a) => a.suite === 'rappel' && !!a.quand && a.quand < today).length;
  const rappelsALaMain = demainRows.filter((a) => {
    /* Le rappel d'un foyer nomme chaque tête (`apptIds`, 4 novembre 2026) : il compte pour chacune. */
    const e = etatDeLaTournee(envois.filter((x) => nommeLeRendezVous(x, a.id) && x.type === 'rappel-j1' && !attendEncore(x)));
    return e.rate || e.muet;
  }).length;
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

  /* ══ LES QUATRE BANDES — 5 novembre 2026 ═════════════════════════════
     Les nombres des puces, du bandeau, de « À traiter » et du mois, lus des
     juges que les écrans d'origine gardent (aucune lecture de plus). */
  const minute = useMinute();
  const synchro = useSynchroDite();
  const envoisDemiHeure = useEnvoisDeLaDemiHeure(minute);
  const passageGrenat = useProchainPassageDeGrenat(minute);
  /* La journée de Grenat : la même prise que Finances › La journée. */
  const journee = useClotureDuJour(today);
  const veille = useLaVeilleEnNombres();
  /* L'alarme WhatsApp montée une fois : sa sonnette sonne, repliée ou non. */
  const alarme = useLAlarmeWhatsApp();
  const places = usePlacesLimiteesOuvertes();
  const pourboiresEquipe = usePourboiresDeLEquipe(today);
  /* Les dépenses à valider, celles que Grenat prépare comprises (Finances › Dépenses). */
  const depensesAValider = useDepensesAValider();

  /* LE BANDEAU ET LE MOIS, en un calcul. « Encaissé » est la porte des
     Revenus du mois (`revenuDuMois`, borné à aujourd'hui) ; « Gagné », les
     rituels honorés du mois à leur net (la règle du chiffre des prestations). */
  const chiffres = useMemo(() => {
    const args = { invoices, appts, byId, apprenants, abonnes, branchId: branch.id };
    const netDe = (a: Appointment) => apptNetXof(a, byId);
    const factures = invoices.filter((i) => i.branchId === branch.id && i.kind === 'facture');
    const desPorteurs = [...apprenants, ...abonnes].flatMap((p) => (p.payments ?? []).map((r) => ({ date: payISO(r.date), amountXof: r.amountXof })));
    const avantDernier = moisAvant(thisMonth, 2);
    return {
      honores: honoresDuMois(appts, thisMonth, today, netDe),
      honoresAvant: honoresDuMois(appts, prevMonth, null, netDe),
      pourAvant: encaissePourLesMoisDAvant(factures.map((i) => ({ date: i.date, reglements: invoiceReglements(i) })), thisMonth, today),
      versements: versementsDuMois([...factures.flatMap((i) => invoiceReglements(i)), ...desPorteurs], thisMonth, today),
      barres: [
        { mois: avantDernier, xof: revenuDuMois(args, avantDernier), enCours: false },
        { mois: prevMonth, xof: revenuDuMois(args, prevMonth), enCours: false },
        { mois: thisMonth, xof: revenue, enCours: true },
      ],
      actives: clientesActives(appts, today, 90),
      sept: septJours(appts, today, estFermeLe),
    };
  }, [invoices, appts, byId, apprenants, abonnes, branch.id, thisMonth, prevMonth, today, revenue, clefDuTarif]);

  /* LES FAUTEUILS DU JOUR : combien sont pris au plus fort de la journée,
     sur ceux de la Maison (les durées du calendrier). */
  const fauteuils = useMemo(() => {
    const plages = todayRows.map((a) => { const d = timeToMin(a.time); return [d, d + Math.max(1, apptDurationMin(a, byId))] as const; });
    let pris = 0;
    for (const [d] of plages) pris = Math.max(pris, plages.filter(([x, y]) => x <= d && d < y).length);
    return { pris, sieges: Math.max(0, branch.seats ?? 0) };
  }, [todayRows, byId, branch.seats]);

  const fmt = (x: number) => fmtMoney(x, currency);
  const nomMois = nomDuMois(thisMonth);
  const encaisseAujourdhui = rev7[rev7.length - 1]?.total ?? 0;

  /* LES IMPAYÉS : le calcul de l'agent des encaissements (« À encaisser »),
     ce que la Maison a fait ou facturé et qui n'est pas encore entré : les
     factures qui gardent un reste, les rituels honorés sans facture ni
     versement. Un rendez-vous passé sans état n'y est pas : rien n'a été fait. */
  const impayesXof = aEncaisser.resteFactures + aEncaisser.resteRituels;
  const impayesDits = [
    aEncaisser.factures ? nombreDe(aEncaisser.factures, 'facture') : '',
    aEncaisser.rituels ? nombreDe(aEncaisser.rituels, 'rituel') : '',
  ].filter(Boolean).join(' · ') || 'rien à encaisser';
  const openImpayes = () => {
    const pieces: DrillRow[] = [...aEncaisser.lesFactures]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((i) => ({ who: i.clientName || nameOf(i.clientId), sub: `Facture · ${i.number}`, date: i.date, amount: invoiceResteXof(i), invoiceId: i.id }));
    const rituels: DrillRow[] = [...aEncaisser.lesRituels]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((a) => ({
        who: clientOf(a.clientId)?.name ?? a.clientName ?? 'Cliente', sub: `Rituel honoré sans versement · ${apptLabel(a, byId)}`, date: a.date, amount: apptDueXof(a, byId),
        onOpen: () => { setDrill(null); setPayAppt(a); },
      }));
    setDrill({ title: 'Impayés', sub: impayesDits, rows: [...pieces, ...rituels], total: impayesXof });
  };

  /* L'ATTENDU DU JOUR, rendez-vous par rendez-vous (24 octobre 2026). */
  const openAttendu = () => setDrill({
    title: 'Attendu aujourd’hui',
    sub: `Encaissé ${fmt(jourDuChiffre.encaisseXof)} · reste ${fmt(jourDuChiffre.resteXof)}`,
    rows: todayRows.map((a) => {
      const u = chiffreAttenduDuJour([{ date: a.date, status: a.status, rituelXof: apptNetXof(a, byId), resteRituelXof: apptDueXof(a, byId), gamme: a.gamme }], a.date);
      return {
        who: clientOf(a.clientId)?.name ?? a.clientName ?? 'Cliente de passage',
        sub: `${a.time} · ${apptLabel(a, byId)}${u.gammeXof > 0 ? ` · dont Gamme ${fmt(u.gammeXof)}` : ''} · ${u.resteXof > 0 ? `reste ${fmt(u.resteXof)}` : 'réglé'}`,
        amount: u.attenduXof, onOpen: () => { setDrill(null); setEditAppt(a); },
      };
    }),
    total: jourDuChiffre.attenduXof,
  });

  /* ── À TRAITER : une ligne par sujet, un grand chiffre, trois à six mots,
     un geste. Rouge : une anomalie. Une ligne ne paraît que si elle compte
     quelque chose, sauf l'anomalie à zéro (aucune dépense depuis le 1er). */
  type Tache = { k: string; n: number; dit: string; geste: string; go: () => void; ko?: boolean };
  const dep = journee.cloture.depenses?.comptes;
  const piecesEffacees = journee.alarmes.filter((x) => x.ouverte).length;
  const aClore = journee.cloture.comptes.aEncaisser + journee.cloture.comptes.sansEtat;
  const pretsEnRetard = pretsAVeiller.filter((e) => !!e.prochaine && joursEntre(today, e.prochaine.date) < 0).length;
  const jalonsEnRetard = jalonsAVeiller.filter((e) => e.retardXof > 0).length;
  const zeroDepenseDuMois = spent === 0 && jourDuMois >= 2;
  const pressants = alarme.enAttente.filter(filPressant).length;
  const seulFil = alarme.enAttente.length === 1 ? alarme.enAttente[0] : null;
  const versLaJournee = () => navigate('/la-journee');
  const toutes: Tache[] = [
    ...(alarme.enAttente.length > 0 ? [{
      k: 'whatsapp', n: alarme.enAttente.length, ko: true,
      dit: `${alarme.enAttente.length > 1 ? 'messages WhatsApp sans réponse' : 'message WhatsApp sans réponse'}${pressants ? ` · ${pressants} sous 2 h` : ''}`,
      geste: 'Répondre',
      go: seulFil ? () => navigate(cheminDeLaConversation(seulFil.numero) ?? '/conversations') : () => ouvreLeDetail('messages'),
    }] : []),
    ...(piecesEffacees > 0 ? [{ k: 'effacees', n: piecesEffacees, ko: true, dit: piecesEffacees > 1 ? 'pièces payées effacées' : 'pièce payée effacée', geste: 'Trancher', go: versLaJournee }] : []),
    ...(veille.ecarts > 0 ? [{ k: 'ecarts', n: veille.ecarts, ko: true, dit: veille.ecarts > 1 ? 'écarts de caisse à trancher' : 'écart de caisse à trancher', geste: 'Trancher', go: () => ouvreLeDetail('veille') }] : []),
    ...(veille.oublies.length > 0 ? [{ k: 'tiroirs', n: veille.oublies.length, ko: true, dit: veille.oublies.length > 1 ? 'tiroirs non comptés hier' : 'tiroir non compté hier', geste: 'Compter', go: () => ouvreLeDetail('veille') }] : []),
    ...(dep && dep.aValiderDuJour > 0 ? [{ k: 'dep-jour', n: dep.aValiderDuJour, ko: true, dit: dep.aValiderDuJour > 1 ? 'dépenses du jour à valider' : 'dépense du jour à valider', geste: 'Valider', go: versLaJournee }] : []),
    ...(dep && dep.ecarts > 0 ? [{ k: 'dep-ecarts', n: dep.ecarts, ko: true, dit: dep.ecarts > 1 ? 'écarts de tiroir sans dépense' : 'écart de tiroir sans dépense', geste: 'Voir', go: versLaJournee }] : []),
    ...(zeroDepenseDuMois
      ? [{ k: 'dep-mois', n: 0, ko: true, dit: 'dépense depuis le 1er', geste: 'Saisir', go: () => navigate('/depenses') }]
      : dep && dep.sansDepense > 0 ? [{ k: 'dep-sans', n: 0, ko: true, dit: 'dépense saisie aujourd’hui', geste: 'Saisir', go: versLaJournee }] : []),
    ...(santeOuverte > 0 || entreDeuxEnRetard > 0 ? [{
      k: 'entre-deux', n: santeOuverte || entreDeuxEnRetard, ko: santeOuverte > 0,
      dit: santeOuverte > 0 ? accorde(santeOuverte, 'souci santé à rappeler', 'soucis santé à rappeler') : accorde(entreDeuxEnRetard, 'souci entre deux séances en retard', 'soucis entre deux séances en retard'),
      geste: 'Voir', go: () => navigate('/entre-deux'),
    }] : []),
    ...(rappelsALaMain > 0 ? [{ k: 'rappels', n: rappelsALaMain, ko: true, dit: accorde(rappelsALaMain, 'rappel de demain à la main', 'rappels de demain à la main'), geste: 'Rappeler', go: () => ouvreLeDetail('tournee') }] : []),
    ...(engagementsDus.livraisonsEnRetard.length > 0 ? [{ k: 'livraisons', n: engagementsDus.livraisonsEnRetard.length, ko: true, dit: accorde(engagementsDus.livraisonsEnRetard.length, 'livraison en retard', 'livraisons en retard'), geste: 'Voir', go: () => navigate('/engagements') }] : []),
    ...(pretsAVeiller.length > 0 ? [{
      k: 'prets', n: pretsAVeiller.length, ko: pretsEnRetard > 0,
      dit: pretsEnRetard > 0 ? `${accorde(pretsAVeiller.length, 'remboursement de prêt', 'remboursements de prêt')} · ${pretsEnRetard} en retard` : accorde(pretsAVeiller.length, 'remboursement de prêt attendu', 'remboursements de prêt attendus'),
      geste: 'Voir', go: () => navigate('/prets'),
    }] : []),
    ...(jalonsAVeiller.length > 0 ? [{
      k: 'jalons', n: jalonsAVeiller.length, ko: jalonsEnRetard > 0,
      dit: jalonsEnRetard > 0 ? `${accorde(jalonsAVeiller.length, 'versement d’épargne', 'versements d’épargne')} · ${jalonsEnRetard} en retard` : accorde(jalonsAVeiller.length, 'versement d’épargne attendu', 'versements d’épargne attendus'),
      geste: 'Voir', go: () => navigate('/prets?onglet=objectifs'),
    }] : []),
    ...(aClore > 0 ? [{ k: 'a-clore', n: aClore, dit: 'rendez-vous du jour à clore', geste: 'Clore', go: versLaJournee }] : []),
    ...(journee.cloture.comptes.aRevoir > 0 ? [{ k: 'a-revoir', n: journee.cloture.comptes.aRevoir, dit: accorde(journee.cloture.comptes.aRevoir, 'facture du jour à revoir', 'factures du jour à revoir'), geste: 'Revoir', go: versLaJournee }] : []),
    ...(journee.cloture.gestes.length > 0 ? [{ k: 'gestes', n: journee.cloture.gestes.length, dit: accorde(journee.cloture.gestes.length, 'geste que Grenat fait seul', 'gestes que Grenat fait seul'), geste: 'Voir', go: versLaJournee }] : []),
    /* LES DÉPENSES PRÉPARÉES, À VALIDER (5 novembre 2026) : la liste de Finances ›
       Dépenses ; celles du jour, qui retiennent le comptage, ont leur ligne rouge. */
    ...(depensesAValider - (dep?.aValiderDuJour ?? 0) > 0 ? [{ k: 'dep-preparees', n: depensesAValider - (dep?.aValiderDuJour ?? 0), dit: depensesAValider - (dep?.aValiderDuJour ?? 0) > 1 ? 'dépenses préparées à valider' : 'dépense préparée à valider', geste: 'Valider', go: () => navigate('/depenses') }] : []),
    ...(dep && dep.aCompleter > 0 ? [{ k: 'dep-completer', n: dep.aCompleter, dit: accorde(dep.aCompleter, 'dépense à compléter', 'dépenses à compléter'), geste: 'Compléter', go: versLaJournee }] : []),
    /* EXACTEMENT CELLES-LÀ : la page ouvre le même juge par `?filtre=reste`. */
    ...(aEncaisser.factures > 0 ? [{ k: 'factures', n: aEncaisser.factures, dit: aEncaisser.factures > 1 ? 'factures impayées' : 'facture impayée', geste: 'Relancer', go: () => navigate('/factures?filtre=reste') }] : []),
    ...(aEncaisser.rituels > 0 ? [{ k: 'rituels', n: aEncaisser.rituels, dit: aEncaisser.rituels > 1 ? 'rituels honorés sans versement' : 'rituel honoré sans versement', geste: 'Encaisser', go: () => navigate('/carnet') }] : []),
    ...(aRecevoir.length > 0 ? [{ k: 'attente', n: aRecevoir.length, dit: aRecevoir.length > 1 ? 'réservations à recevoir' : 'réservation à recevoir', geste: 'Recevoir', go: () => setAttenteOpen(true) }] : []),
    ...(demandesRows.length > 0 ? [{ k: 'demandes', n: demandesRows.length, dit: demandesRows.length > 1 ? 'demandes du site' : 'demande du site', geste: 'Traiter', go: () => navigate('/demandes') }] : []),
    ...(appelsAFaire.length > 0 ? [{
      k: 'appels', n: appelsAFaire.length, ko: appelsEnRetard > 0,
      dit: `${appelsAFaire.length > 1 ? 'appels à traiter' : 'appel à traiter'}${appelsEnRetard ? ` · ${appelsEnRetard} en retard` : ''}`,
      geste: 'Appeler', go: () => ouvreLeDetail('appels'),
    }] : []),
    ...(compoNouvelles.length > 0 ? [{ k: 'compositions', n: compoNouvelles.length, dit: accorde(compoNouvelles.length, 'rituel sur-mesure à sceller', 'rituels sur-mesure à sceller'), geste: 'Sceller', go: () => setCompoOpen(true) }] : []),
    ...(anniversaires.length > 0 ? [{
      k: 'anniversaires', n: anniversaires.length, dit: anniversaires.length > 1 ? 'anniversaires sous 2 jours' : 'anniversaire sous 2 jours',
      geste: anniversaires.length > 1 ? 'Les cartes' : 'Sa carte',
      go: anniversaires.length === 1 ? () => setCarteFor(anniversaires[0].c) : () => ouvreLeDetail('anniversaires'),
    }] : []),
    ...(enfantsArrives.length > 0 ? [{
      k: 'enfants', n: enfantsArrives.length, dit: accorde(enfantsArrives.length, 'enfant rattaché depuis Ma Couronne', 'enfants rattachés depuis Ma Couronne'), geste: 'Voir',
      go: () => {
        /* Vus = reçus : la ligne s'éteint, le journal demeure. */
        const ids = enfantsArrives.map((d) => d.id);
        enfantsRecusVusStore.set((prev) => [...new Set([...prev, ...ids])]);
        navigate('/customers');
      },
    }] : []),
    /* LE MÊME JUGE QU'À FAIRE (`relancesAReprendre`) : la même liste, en tête de page. */
    ...(reprisesARelancer > 0 ? [{ k: 'relances-j3', n: reprisesARelancer, dit: accorde(reprisesARelancer, 'retenue à relancer sous 3 jours', 'retenues à relancer sous 3 jours'), geste: 'Relancer', go: () => navigate('/a-faire') }] : []),
    ...(engagementsDus.enCours > 0 || engagementsDus.sansDecharge > 0 ? [{
      k: 'engagements', n: engagementsDus.enCours || engagementsDus.sansDecharge,
      dit: engagementsDus.enCours > 0 ? `${accorde(engagementsDus.enCours, 'engagement en cours', 'engagements en cours')} · ${restesDits(engagementsDus.restes, currency)}` : accorde(engagementsDus.sansDecharge, 'versement sans décharge', 'versements sans décharge'),
      geste: 'Voir', go: () => navigate('/engagements'),
    }] : []),
    /* UN CARNET LIBRE PROPOSE : les couronnes qui ont passé leur cadence. */
    ...(relances > 0 ? [{ k: 'cadence', n: relances, dit: accorde(relances, 'couronne au-delà de sa cadence', 'couronnes au-delà de leur cadence'), geste: 'Relancer', go: () => navigate('/customers') }] : []),
  ];
  /* Les anomalies d'abord, l'alarme WhatsApp en tête. */
  const taches = [...toutes.filter((t) => t.ko), ...toutes.filter((t) => !t.ko)];

  /* ── LE MOIS ── */
  const maxBarre = Math.max(1, ...chiffres.barres.map((b) => b.xof));
  const fourchette = `${fmt(prevDuMois.prevision.basXof)} à ${fmt(prevDuMois.prevision.hautXof)}`;
  const placesDites = !places.active ? 'éteintes'
    : places.jours.length === 0 ? 'aucun jour ouvert'
      : `${joursDits(places.jours.map((j) => j.iso))} · ${nombreDe(places.jours.reduce((s, j) => s + j.reste, 0), 'place')}`;
  const journeeClose = journee.close && journee.cloture.rdvs.length > 0;
  const tonDeLaSynchro = synchro.ton === 'ok' ? ' est-ok' : synchro.ton === 'attente' ? ' est-attente' : synchro.ton === 'ko' ? ' est-ko' : '';

  const kpis = [
    { k: 'jour', l: 'Encaissé aujourd’hui', v: fmt(encaisseAujourdhui), c: nombreDe(todayRows.length, 'rendez-vous', 'rendez-vous'), go: () => openDay(today) },
    { k: 'mois', l: `Encaissé ${nomMois}`, v: fmt(revenue), c: `au ${jourDuMois} · ${nombreDe(chiffres.versements, 'versement')}`, go: () => setBreakOpen(true) },
    { k: 'impayes', l: 'Impayés', v: fmt(impayesXof), c: impayesDits, ko: impayesXof > 0, go: openImpayes },
    { k: 'rituels', l: `Rituels ${nomMois}`, v: String(chiffres.honores.nombre), c: `${prevMonthName} : ${chiffres.honoresAvant.nombre}`, go: () => navigate('/chiffre-des-prestations') },
    { k: 'actives', l: 'Clientes actives', v: String(chiffres.actives), c: 'sur 90 jours', go: () => navigate('/customers') },
    { k: 'sept', l: '7 jours', v: String(chiffres.sept.rdv), c: `rendez-vous · ${nombreDe(chiffres.sept.joursLibres, 'jour libre', 'jours libres')}`, go: () => navigate('/calendrier') },
  ];

  /* Le détail : un panneau par sujet qui agit, fermé au départ. */
  const aDuDetail = alarme.enAttente.length > 0 || (veille.voit && (veille.ecarts + veille.oublies.length > 0 || veille.grenat))
    || unpaid.overdue.rows.length + unpaid.upcoming.rows.length > 0 || appelsAFaire.length > 0 || demandesRows.length > 0
    || demainRows.length > 0 || anniversaires.length > 0;

  return (
    <div className="mnd-rise tdb" data-tdb="direction">
      {/* LES PASSAGES DU JOUR : invisibles, montés ici (Gérard, devenu Perle,
          et « Avant le fauteuil ») ; ils ne tournent que pour la direction. */}
      <PassageDeGerard />
      <PassageAvantLeFauteuil />

      {/* ── 1. L'EN-TÊTE ── */}
      <header className="tdb-tete" data-tdb="tete">
        <div>
          <p className="tdb-tete__sur">Tableau de bord · {maisonNom()}</p>
          <h1 className="tdb-tete__titre">{dateDuTitre(today)}</h1>
        </div>
        <div className="tdb-puces">
          <span className={`tdb-puce${tonDeLaSynchro}`} role="status">{synchro.dit}</span>
          <button type="button" className={`tdb-puce${envoisDemiHeure > 0 ? ' est-attente' : ''}`} onClick={() => navigate('/conversations?envois=1')}>
            {nombreDe(envoisDemiHeure, 'envoi')} · 30 min
          </button>
          <button type="button" className={`tdb-puce${journeeClose ? ' est-ok' : ''}`} onClick={() => navigate('/la-journee')}>
            {journeeClose ? 'Journée close' : passageGrenat !== null ? `Grenat · ${passageGrenat} h` : 'Grenat · demain matin'}
          </button>
        </div>
      </header>

      {/* ── 2. LE BANDEAU : six chiffres, chacun s'ouvre sur son écran ── */}
      <section className="tdb-kpis" aria-label="Les chiffres du jour et du mois" data-tdb="bandeau">
        {kpis.map((k) => (
          <button type="button" key={k.k} className="tdb-kpi" data-kpi={k.k} onClick={k.go}>
            <span className="tdb-kpi__l">{k.l}</span>
            <span className={`tdb-kpi__v${k.ko ? ' est-ko' : ''}`}>{k.v}</span>
            <span className={`tdb-kpi__c${k.ko ? ' est-ko' : ''}`}>{k.c}</span>
          </button>
        ))}
      </section>

      {/* ── 3. AUJOURD'HUI et À TRAITER ── */}
      <div className="tdb-grille">
        <section className="tdb-carte" aria-labelledby="tdb-t-jour" data-tdb="aujourdhui">
          <div className="tdb-carte__t">
            <h2 id="tdb-t-jour">Aujourd’hui</h2>
            <button type="button" className="tdb-lien" onClick={() => navigate('/carnet')}>Le Carnet ›</button>
          </div>
          <div className="tdb-defile">
            <table className="tdb-table">
              <thead>
                <tr><th>Heure</th><th>Cliente</th><th>Rituel</th><th>État</th><th className="n">Montant</th><th><span className="tdb-cache">Gestes</span></th></tr>
              </thead>
              <tbody>
                {todayRows.length === 0 && (
                  <tr><td className="tdb-vide" colSpan={6}>Carnet libre</td></tr>
                )}
                {todayRows.map((a) => {
                  const u = chiffreAttenduDuJour([{ date: a.date, status: a.status, rituelXof: apptNetXof(a, byId), resteRituelXof: apptDueXof(a, byId), gamme: a.gamme }], a.date);
                  return (
                    <tr key={a.id} onClick={() => setEditAppt(a)} title="Ouvrir ce rendez-vous">
                      <td className="tdb__num">{a.time}</td>
                      <td className="tdb-txt">{clientOf(a.clientId)?.name ?? a.clientName ?? 'Cliente de passage'}</td>
                      <td className="tdb-txt">{rituelDit(apptLabel(a, byId))}</td>
                      <td><StatusPill status={a.status} /></td>
                      <td className="n">{u.attenduXof > 0 ? fmt(u.attenduXof) : '·'}</td>
                      <td>
                        {/* UN GESTE PAR LIGNE, LE SUIVANT (5 novembre 2026) : confirmer,
                            terminer, puis encaisser ; jamais l'état et l'argent côte à
                            côte (la paire dangereuse, maquette du 10 août). La ligne
                            touchée ouvre le rendez-vous et tous ses gestes. */}
                        <span className="tdb-gestes">
                          {a.status !== 'honoré' ? (
                            <button type="button" className="tdb-btn tdb-btn--etat" onClick={(e) => { e.stopPropagation(); advance(a); }}>
                              {/* « Terminer » le jour même : le reste part sur son WhatsApp (25 octobre 2026). */}
                              {a.status === 'en attente' ? 'Confirmer' : a.date === todayISO() ? 'Terminer' : 'Honorer'}
                            </button>
                          ) : u.resteXof > 0 ? (
                            <button type="button" className="tdb-btn" onClick={(e) => { e.stopPropagation(); setPayAppt(a); }} title="Encaisser, paiement partiel ou total">
                              Encaisser
                            </button>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="tdb-resume">
            <button type="button" onClick={openAttendu} title="Attendu aujourd’hui, rendez-vous par rendez-vous">Attendu <b>{fmt(jourDuChiffre.attenduXof)}</b></button>
            <span>Encaissé <b>{fmt(jourDuChiffre.encaisseXof)}</b></span>
            <span>Fauteuils <b>{fauteuils.sieges > 0 ? `${fauteuils.pris} / ${fauteuils.sieges}` : fauteuils.pris}</b></span>
          </p>
        </section>

        <section className="tdb-carte" aria-labelledby="tdb-t-traiter" data-tdb="a-traiter">
          <div className="tdb-carte__t">
            <h2 id="tdb-t-traiter">À traiter</h2>
            <button type="button" className="tdb-lien" onClick={() => navigate('/la-journee')}>La journée ›</button>
          </div>
          {taches.length === 0 && <p className="tdb-rien">Rien à traiter</p>}
          {taches.map((t) => (
            <div key={t.k} className={`tdb-tache${t.ko ? ' est-ko' : ''}`} data-tache={t.k}>
              <span className={`tdb-tache__n${t.ko ? ' est-ko' : ''}`}>{t.n}</span>
              <span className="tdb-tache__dit">{t.dit}</span>
              <button type="button" className="tdb-btn" onClick={t.go}>{t.geste}</button>
            </div>
          ))}
        </section>
      </div>

      {/* ── 4. LE MOIS ── */}
      <section className="tdb-carte" aria-labelledby="tdb-t-mois" data-tdb="mois">
        <div className="tdb-carte__t">
          <h2 id="tdb-t-mois">Le mois <small>{nomMois} {thisMonth.slice(0, 4)}</small></h2>
          <button type="button" className="tdb-lien" onClick={() => navigate('/encaissements')}>Les encaissements ›</button>
        </div>
        <div className="tdb-mois">
          <div
            className="tdb-mois__graphe" role="img"
            aria-label={`Encaissé par mois : ${chiffres.barres.map((b) => `${nomDuMois(b.mois)} ${b.mois.slice(0, 4)}${b.enCours ? ` au ${jourDuMois}` : ''}, ${fmt(b.xof)}`).join(' ; ')}.`}
          >
            <svg viewBox="0 0 520 200" aria-hidden="true">
              <line className="axe" x1="20" y1="168" x2="500" y2="168" />
              {chiffres.barres.map((b, i) => {
                const h = Math.max(2, Math.round((b.xof / maxBarre) * 140 * 10) / 10);
                const x = 60 + i * 152;
                const nom = nomDuMois(b.mois);
                return (
                  <g key={b.mois}>
                    <rect className={`b${b.enCours ? ' en-cours' : ''}`} x={x} y={168 - h} width="96" height={h} rx="3" />
                    <text className="val" x={x + 48} y={160 - h} textAnchor="middle">{fmt(b.xof)}</text>
                    <text x={x + 48} y="188" textAnchor="middle">{nom.charAt(0).toUpperCase() + nom.slice(1)}{b.enCours ? ` (au ${jourDuMois})` : ''}</text>
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="tdb-lignes">
            <button type="button" className="tdb-ligne" onClick={() => navigate('/chiffre-des-prestations')}><span>Gagné {nomMois}</span><b>{fmt(chiffres.honores.xof)}</b></button>
            <button type="button" className="tdb-ligne" onClick={() => navigate('/encaissements')}><span>Encaissé pour {prevMonthName} et avant</span><b>{fmt(chiffres.pourAvant.xof)}</b></button>
            <button type="button" className="tdb-ligne" onClick={() => navigate('/pourboires')}><span>Pourboires (équipe)</span><b>{fmt(pourboiresEquipe.mois)}</b></button>
            <button type="button" className="tdb-ligne" onClick={() => navigate('/depenses')}><span>Dépenses</span><b className={zeroDepenseDuMois ? 'est-ko' : ''}>{fmt(spent)}</b></button>
            {/* LA PRÉVISION, EN FOURCHETTE SEULEMENT : son calcul vit aux Prévisions. */}
            <button type="button" className="tdb-ligne" data-ligne="prevision" onClick={() => navigate('/previsions?vue=francs')}><span>Prévision fin de mois</span><b>{fourchette}</b></button>
            <button type="button" className="tdb-ligne" onClick={() => navigate('/parametres?ouvre=places')}><span>Places limitées</span><b>{placesDites}</b></button>
          </div>
        </div>
      </section>

      {/* ── LE DÉTAIL : les panneaux qui agissent, fermés au départ, un seul ouvert ── */}
      {aDuDetail && (
        <div className="tdb-detail" data-tdb="detail">
          <GroupeDeReplis id="le-detail" titre="Le détail" ouvert={ouvertDetail} onOuvre={setOuvertDetail}>
            {alarme.enAttente.length > 0 && (
              <div id="tdb-detail-messages">
                <Repli
                  cle="messages" titre="Messages sans réponse" compte={alarme.enAttente.length} ton="presse"
                  resume={pressants ? `${pressants} sous 2 h · fenêtre de 24 h` : 'fenêtre de 24 h ouverte'}
                  geste={{ dit: 'Les conversations', faire: () => navigate('/conversations') }}
                >
                  <ListeDeLAlarme {...alarme} />
                </Repli>
              </div>
            )}
            {veille.voit && (veille.ecarts + veille.oublies.length > 0 || veille.grenat) && (
              <div id="tdb-detail-veille">
                <Repli
                  cle="veille" titre="La veille à valider" compte={veille.ecarts + veille.oublies.length} ton={veille.ecarts + veille.oublies.length > 0 ? 'presse' : 'calme'}
                  resume={[veille.ecarts ? nombreDe(veille.ecarts, 'écart déclaré', 'écarts déclarés') : '', veille.oublies.length ? nombreDe(veille.oublies.length, 'tiroir non compté', 'tiroirs non comptés') : '', veille.grenat ? 'compte rendu de Grenat' : ''].filter(Boolean).join(' · ')}
                >
                  {/* LES CAISSES À VALIDER — 3 octobre 2026 : les écarts déclarés au
                      comptage du soir, et les tiroirs restés ouverts hier. */}
                  <LaVeilleAValider />
                </Repli>
              </div>
            )}
            {unpaid.overdue.rows.length + unpaid.upcoming.rows.length > 0 && (
              <div id="tdb-detail-impayes">
                <Repli
                  cle="impayes" titre="Rendez-vous impayés" compte={unpaid.overdue.rows.length} ton={unpaid.overdue.rows.length > 0 ? 'presse' : 'calme'}
                  resume={`Échus : ${unpaid.overdue.rows.length} · ${fmtMoney(unpaid.overdue.total, currency)} · à venir : ${unpaid.upcoming.rows.length} · ${fmtMoney(unpaid.upcoming.total, currency)}`}
                >
          <div ref={unpaidRef} className="tr-grid trd-impayes" style={{ marginTop: 18, alignItems: 'start' }}>
            {renderUnpaidGroup('Impayés échus · en retard', unpaid.overdue, 'Aucun impayé échu, rien en retard.')}
            {renderUnpaidGroup('Soldes à venir', unpaid.upcoming, 'Aucun solde à venir.')}
          </div>
                </Repli>
              </div>
            )}
            {/* APPELS À TRAITER — posés à la volée, ils restent ici jusqu'à ce qu'ils
                soient faits ou transformés en rendez-vous. */}
            {appelsAFaire.length > 0 && (
              <div id="tdb-detail-appels">
                <Repli
                  cle="appels" titre="Appels à traiter" compte={appelsAFaire.length} ton={appelsEnRetard > 0 ? 'presse' : 'calme'}
                  resume={`${pluriel(appelsAFaire.length, 'appel')} en attente${appelsEnRetard ? ` · ${appelsEnRetard} en retard` : ''}`}
                  geste={{ dit: 'Voir tout', faire: () => navigate('/appels') }}
                >
              <div style={{ marginTop: 22, border: '1px solid var(--hairline)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 16px', borderBottom: '1px solid var(--hairline)', background: 'var(--copper-50, #FAF1E9)' }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 19, color: 'var(--color-indigo)' }}>Appels à traiter</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                    <span className="mnd-muted" style={{ fontSize: 12 }}>{appelsAFaire.length} en attente</span>
                    <button type="button" onClick={() => navigate('/appels')} style={{ background: 'none', border: 'none', color: 'var(--color-copper)', fontSize: 12.5, cursor: 'pointer', padding: 0 }}>Voir tout →</button>
                  </span>
                </div>
                {appelsAFaire.map((a) => {
                  const enRetard = a.suite === 'rappel' && !!a.quand && a.quand < todayISO();
                  const tag = a.suite === 'rdv'
                    ? { t: 'RDV à caler', bg: '#ECEEF6', c: 'var(--color-indigo)', b: '#C7CCE2' }
                    : { t: 'à rappeler', bg: 'var(--copper-50, #FAF1E9)', c: '#8A5A32', b: 'var(--copper-300, #E3C9AE)' };
                  const chip = { border: '1px solid var(--hairline)', borderRadius: 3, padding: '6px 11px', fontSize: 12, color: 'var(--ink-soft)', background: 'var(--surface, #fff)', cursor: 'pointer' } as const;
                  return (
                    <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '30px 1fr auto', gap: 12, alignItems: 'center', padding: '12px 16px', borderTop: '1px solid var(--hairline)' }}>
                      <span style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--color-indigo)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12 }}>{a.nom.slice(0, 1)}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>
                          {a.nom}
                          <span style={{ fontSize: 10, borderRadius: 999, padding: '1px 8px', marginLeft: 8, background: tag.bg, color: tag.c, border: `1px solid ${tag.b}` }}>{tag.t}</span>
                        </div>
                        <div className="mnd-muted" style={{ fontSize: 12.5 }}>{a.motif || 'Sans note'}{a.phone ? ` · ${a.phone}` : ''}</div>
                        {a.suite === 'rappel' && a.quand && (
                          <div style={{ fontSize: 11, fontWeight: 500, color: enRetard ? 'var(--color-brique, #96412E)' : 'var(--ink-soft)' }}>
                            {a.quand === todayISO() ? "Aujourd'hui" : a.quand === demainAppel ? 'Demain' : a.quand}{enRetard ? ' · en retard' : ''}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {a.phone && (
                          <a href={`#${cheminDeLaConversation(a.phone.replace(/\D/g, ''), signeLeMessage(messageAppel(a))) ?? '/conversations'}`} style={{ ...chip, textDecoration: 'none' }}>WhatsApp</a>
                        )}
                        {a.clientId && a.suite === 'rdv' && (
                          <button type="button" style={{ ...chip, borderColor: 'var(--color-copper)', color: '#8A5A32', background: 'var(--copper-50, #FAF1E9)' }} onClick={() => ouvrirRdv(a.clientId!, a.id)}>
                            Créer le RDV
                          </button>
                        )}
                        {a.clientId && a.suite === 'rappel' && (
                          <button type="button" style={{ ...chip, borderColor: 'var(--color-copper)', color: '#8A5A32', background: 'var(--copper-50, #FAF1E9)' }} onClick={() => navigate(`/customers?id=${a.clientId}`)}>
                            Ouvrir la fiche
                          </button>
                        )}
                        {a.suite === 'rappel' && a.quand !== demainAppel && (
                          <button type="button" style={chip} onClick={() => reporterAppel(a.id, demainAppel)}>Demain</button>
                        )}
                        <button type="button" style={chip} onClick={() => marquerAppelFait(a.id)}>Fait</button>
                      </div>
                    </div>
                  );
                })}
              </div>
                </Repli>
              </div>
            )}
            {demandesRows.length > 0 && (
              <div id="tdb-detail-demandes">
                <Repli
                  cle="demandes" titre="Demandes du site" compte={demandesRows.length}
                  resume={`${pluriel(demandesRows.length, 'demande')} en attente · la plus ancienne ${depuisQuand(demandesRows[demandesRows.length - 1].createdAt)}`}
                  geste={{ dit: 'Traiter', faire: () => navigate('/demandes') }}
                >
          <div className="trp-panel" style={{ marginTop: 14 }}>
            <div className="trp-panel__title">
              Demandes du site · rendez-vous et rappels{demandesRows.length > 0 ? ` · ${demandesRows.length}` : ''}
            </div>
            {demandesRows.length === 0
              ? <div className="trp-empty">Aucune demande en attente. Celles du site arrivent ici, dès qu’elles sont envoyées.</div>
              : demandesRows.map((d, i) => (
                <div
                  key={d.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hairline)', flexWrap: 'wrap' }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 500 }}>{nomDeLaDemande(d) || 'Sans prénom'}</span>
                    <span className="mnd-muted" style={{ marginLeft: 10, fontSize: 12 }}>
                      {ditLeGenre(d.genre)} · {ditLeBesoin(d.besoin)}
                      {/* L'année aussi (10 octobre 2026) : une demande de décembre pour
                          janvier se lisait comme une date passée. */}
                      {d.date ? ` · le ${d.date.slice(8, 10)}/${d.date.slice(5, 7)}/${d.date.slice(0, 4)}${d.time ? ` à ${d.time}` : ''}` : ''}
                      {' · '}{telephoneMasque(d.telephone)} · {depuisQuand(d.createdAt)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {d.apptId && <button className="trp-af-pill" onClick={() => navigate('/calendrier')}>Le calendrier</button>}
                    <button className="trp-pay__cta" onClick={() => navigate('/demandes')}>Traiter</button>
                  </div>
                </div>
              ))}
          </div>
                </Repli>
              </div>
            )}
            {demainRows.length > 0 && (
              <div id="tdb-detail-tournee">
                <Repli
                  cle="tournee" titre="La tournée du matin" compte={demainRows.length} ton={rappelsALaMain > 0 ? 'presse' : 'calme'}
                  resume={`${pluriel(demainRows.length, 'rappel')} de demain${rappelsALaMain ? ` · ${rappelsALaMain} à faire à la main` : ' · tous partis ou en route'}`}
                >
          <div className="trp-panel" style={{ marginTop: 14 }}>
            <div className="trp-panel__title">
              La tournée du matin · rappels de demain{demainRows.length > 0 ? ` · ${demainRows.length}` : ''}
            </div>
            {demainRows.length === 0
              ? <div className="trp-empty">Rien à rappeler, le carnet de demain est libre.</div>
              : demainRows.map((a, i) => {
                const c = clientOf(a.clientId);
                const nom = a.clientName ?? c?.name ?? 'Cliente';
                /* ══ UNE LIGNE NUE VOULAIT DIRE TROIS CHOSES — 11 sept. 2026 ══
                   L'écran n'affichait une pastille que par SUCCÈS : « pas encore
                   passé », « a échoué » et « personne à joindre » se ressemblaient
                   tous les trois, et se ressemblaient à « tout va bien ». Le juge
                   est pur (`shared/tournee.ts`), éprouvé, et l'écran ne fait que
                   le lire. */
                /* Un rappel qui attend en salle n'est pas encore passé (2 octobre 2026). */
                /* Le rappel d'un foyer compte pour chaque tête qu'il nomme (4 novembre 2026). */
                const lignes = envois.filter((e) => nommeLeRendezVous(e, a.id) && e.type === 'rappel-j1' && !attendEncore(e));
                const etat = etatDeLaTournee(lignes);
                const tag = (texte: string, ton?: 'alerte' | 'cuivre') => (
                  <span
                    className={ton ? undefined : 'mnd-muted'}
                    style={{
                      fontSize: 11, borderRadius: 3, padding: '2px 7px', whiteSpace: 'nowrap',
                      border: `1px solid ${ton === 'alerte' ? '#E0B3A9' : ton === 'cuivre' ? 'var(--copper-300)' : 'var(--hairline)'}`,
                      background: ton === 'alerte' ? '#F7E4E0' : ton === 'cuivre' ? 'var(--copper-50)' : undefined,
                      color: ton === 'alerte' ? 'var(--color-brique, #96412E)' : ton === 'cuivre' ? 'var(--copper-700)' : undefined,
                    }}
                  >
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
                    {/* L'ACCUSÉ DE META PASSE DEVANT — 11 septembre 2026.
                        « Remis » et « lu » sont des faits rapportés par le
                        téléphone de la cliente ; « WhatsApp auto » ne disait que
                        « Meta a accepté notre requête ». Quand l'accusé existe,
                        c'est lui qu'il faut lire, et le canal devient un détail. */}
                    {etat.accuse === 'lu' && tag('Lu')}
                    {etat.accuse === 'remis' && tag('Remis')}
                    {etat.accuse === 'en-route' && tag('En route')}
                    {etat.partis.includes('push') && tag('Push parti seul')}
                    {etat.sansAppli && tag('Sans l’appli')}
                    {etat.partis.includes('whatsapp') && tag('WhatsApp auto')}
                    {etat.partis.includes('sms') && tag('SMS auto')}
                    {/* LES TROIS SILENCES, ENFIN ÉCRITS. Chacun appelle un geste
                        différent : attendre, taper la cloche, ou poser un numéro. */}
                    {etat.rate && tag('Échec · à la main', 'alerte')}
                    {etat.muet && tag('Rien n’est parti', 'cuivre')}
                    {etat.jamaisPasse && tag('Pas encore passé')}
                    <ReminderBell appt={a} client={c} byId={byId} />
                  </div>
                );
              })}
          </div>
                </Repli>
              </div>
            )}
            {anniversaires.length > 0 && (
              <div id="tdb-detail-anniversaires">
                <Repli
                  cle="anniversaires" titre="Anniversaires" compte={anniversaires.length}
                  resume={`${anniversaires.filter((x) => x.j === 0).length} aujourd’hui · ${anniversaires.filter((x) => x.j > 0).length} sous 2 jours`}
                >
                  <div className="trp-panel" style={{ marginTop: 14 }}>
                    {anniversaires.map(({ c, j }, i) => (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--hairline)' }}>
                        <span><b style={{ fontWeight: 500 }}>{c.name}</b> <span className="mnd-muted" style={{ fontSize: 12 }}>{j === 0 ? 'aujourd’hui' : j === 1 ? 'demain' : 'dans 2 jours'}</span></span>
                        {/* LE JOUR J OUVRE SA CARTE (7 septembre 2026) : la même modale que sur sa fiche. */}
                        <button type="button" className="trp-pay__cta" onClick={() => setCarteFor(c)}>Sa carte</button>
                      </div>
                    ))}
                  </div>
                </Repli>
              </div>
            )}
          </GroupeDeReplis>
        </div>
      )}

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
                <div className="trp-break__empty">Aucun rituel honoré ce mois-ci, le carnet écrira la suite.</div>
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

      {/* « Créer le RDV » depuis un appel — le formulaire, pré-rempli de la cliente. */}
      {rdvPour && (
        <RdvModal
          title="Rendez-vous depuis un appel"
          initial={{ clientId: rdvPour.clientId }}
          onClose={() => {
            const apres = appointmentsStore.get().filter((x) => x.clientId === rdvPour.clientId).length;
            if (apres > rdvPour.avant) marquerAppelFait(rdvPour.appelId);
            setRdvPour(null);
          }}
        />
      )}

      {/* Encaissement d’un rendez-vous du carnet du jour */}
      {payAppt && <PayAppointmentModal appt={payAppt} onClose={() => setPayAppt(null)} />}
      {prochainPour && <FenetreDuProchainRituel rituelId={prochainPour} onClose={() => setProchainPour(null)} />}

      {/* Ce qu’il y a derrière un chiffre — chaque ligne ouvre sa facture */}
      {drill && <DrillModal drill={drill} onClose={() => setDrill(null)} />}
      {jourOuvert && <RevenuDuJour iso={jourOuvert} onClose={() => setJourOuvert(null)} onOpenAppt={(a) => setEditAppt(a)} />}

      {/* LES RITUELS SUR-MESURE REÇUS — chaque composition se lit, s'ouvre sur
          WhatsApp pour sceller les créneaux, puis se marque traitée. */}
      {/* LA FILE DE RÉCEPTION — les réservations encore « en attente », toutes
          dates confondues. Confirmer ici est le même geste qu'au Calendrier ;
          « Ouvrir » donne la fiche du rendez-vous pour déplacer ou annuler. */}
      {attenteOpen && (
        <Modal title="Réservations à recevoir." onClose={() => setAttenteOpen(false)} width={620}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
            {aRecevoir.length === 0 && <div className="trc-empty">Rien à recevoir, tout est scellé.</div>}
            {aRecevoir.map((a) => {
              /* CE QUE LA DEMANDE NE DISAIT PAS — 5 septembre 2026. « J'ai
                 besoin de voir plus d'informations quand le client a fait la
                 réservation en ligne » (Yéman). Trois lignes et deux boutons :
                 on ne savait ni d'où elle venait, ni depuis quand elle
                 attendait, ni si un acompte était tombé, ni comment joindre la
                 cliente sans ouvrir sa fiche. */
              const fiche = clients.find((c) => c.id === a.clientId);
              const tel = (fiche?.phone ?? '').replace(/\D/g, '');
              const ferme = openingForIso(a.date).closed;
              const acompte = a.depositXof ?? 0;
              return (
              <div key={a.id} style={{ border: '1px solid var(--hairline)', borderLeft: `3px solid ${ferme ? 'var(--color-brique, #96412E)' : 'var(--color-copper)'}`, borderRadius: 4, padding: '12px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                  <b style={{ fontWeight: 'var(--weight-medium)' as never, color: 'var(--color-indigo)' }}>
                    {a.clientName || 'Une tête'}
                  </b>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, color: 'var(--color-indigo)', flex: 'none' }}>
                    {frShortAn(a.date)} · {a.time}
                  </span>
                </div>
                {/* LE JOUR FERMÉ SE VOIT AVANT D'ÊTRE CONFIRMÉ. Une réservation
                    posée un jour où personne n'ouvre la porte ne doit pas
                    pouvoir se sceller sans qu'on l'ait lu. */}
                {ferme && (
                  <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--color-brique, #96412E)', fontWeight: 600 }}>
                    La Maison est fermée ce jour-là.
                  </div>
                )}
                <div className="mnd-muted" style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
                  {apptLabel(a, byId)}{a.master ? ` · avec ${a.master}` : ''}
                </div>
                {/* D'OÙ ELLE VIENT, DEPUIS QUAND, ET CE QUI EST DÉJÀ TOMBÉ. */}
                <div className="mnd-muted" style={{ fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
                  {/* PAR QUELLE PORTE, ET QUAND EXACTEMENT — 5 septembre 2026.
                      « Posée au comptoir » ne disait pas si la cliente avait
                      demandé elle-même ou si la Maison avait posé la date, et
                      ne datait rien du tout. L'heure exacte prouve, l'âge
                      juge : les deux se lisent ensemble. */}
                  {porteDuRendezVous(a.source)}
                  {a.creeLe
                    ? ` · le ${horodatageLisible(a.creeLe)}, ${quandDemandee(a.creeLe)}`
                    : ' · heure de pose non enregistrée'}
                  {fiche?.phone ? ` · ${fiche.phone}` : ''}
                  {acompte > 0 ? ` · acompte ${fmtMoney(acompte, currency)} ${a.depositConfirmed ? 'reçu' : 'annoncé, non reçu'}` : ''}
                  {typeof a.priceXof === 'number' ? ` · ${fmtMoney(a.priceXof, currency)}` : ''}
                </div>
                {a.note && (
                  <div style={{ fontSize: 11.5, marginTop: 6, fontStyle: 'italic', color: 'var(--ink-soft)' }}>« {a.note} »</div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <button
                    className="trf-act"
                    onClick={() => appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: 'confirmé' } : x)))}
                  >
                    Confirmer
                  </button>
                  <button
                    className="trf-act trf-act--ghost"
                    onClick={() => setProposeFor({ appt: a, date: prochainJourOuvert(a.date), time: a.time })}
                  >
                    Proposer une autre date
                  </button>
                  <button
                    className="trf-act trf-act--ghost"
                    onClick={() => { setAttenteOpen(false); setEditAppt(a); }}
                  >
                    Ouvrir
                  </button>
                  {tel && (
                    <a className="trf-act trf-act--ghost" style={{ textDecoration: 'none' }}
                      href={`#${cheminDeLaConversation(tel) ?? '/conversations'}`}>
                      WhatsApp
                    </a>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* ══ LA NOUVELLE DATE PROPOSÉE ═══════════════════════════════════
          Elle DÉPLACE le rendez-vous et le laisse « en attente » : confirmer
          serait décider à la place de la cliente, et le laisser sur son jour
          impossible tiendrait un créneau que personne n'honorera. */}
      {proposeFor && (() => {
        const a = proposeFor.appt;
        const fiche = clients.find((c) => c.id === a.clientId);
        const tel = (fiche?.phone ?? '').replace(/\D/g, '');
        const fermeAvant = openingForIso(a.date).closed;
        const fermeApres = joursFermesParmi([proposeFor.date]).length > 0;
        const prenom = appelDe(fiche, a.clientName);
        const msg = signeLeMessage(
          `${maisonNom()}\n`
          + `${prenom ? `Bonjour ${prenom}, ` : ''}votre demande du ${frShortAn(a.date)} à ${a.time} nous est bien parvenue.`
          + `${fermeAvant ? ' La Maison est malheureusement fermée ce jour-là.' : ''}\n`
          + `Nous vous proposons le ${frShortAn(proposeFor.date)} à ${proposeFor.time}. Dites-nous si cela vous convient et nous scellons votre créneau.`,
        );
        const poser = () => {
          appointmentsStore.set((prev) => prev.map((x) => (x.id === a.id
            ? {
              ...x, date: proposeFor.date, time: proposeFor.time, status: 'en attente',
              /* LA TRACE DU DÉPLACEMENT sur le rituel : dans trois jours,
                 personne ne se souviendra pourquoi la date a bougé. */
              note: [x.note, `Date proposée le ${todayISO()}, en attente de sa réponse`].filter(Boolean).join(' · '),
            }
            : x)));
          setProposeFor(null);
        };
        return (
          <Modal title="Proposer une autre date." onClose={() => setProposeFor(null)} width={480}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="mnd-muted" style={{ fontSize: 12.5, lineHeight: 1.65 }}>
                {a.clientName || 'Une tête'} demandait le <b>{frShortAn(a.date)} à {a.time}</b>
                {fermeAvant ? ', un jour où la Maison est fermée.' : '.'}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <ChampDeDate compact sens="avant" value={proposeFor.date} onChange={(iso) => setProposeFor({ ...proposeFor, date: iso })} min={todayISO()} style={{ flex: 1, minWidth: 0 }} />
                <input
                  className="mnd-input" type="time" value={proposeFor.time}
                  onChange={(e) => setProposeFor({ ...proposeFor, time: e.target.value })}
                  style={{ width: 118, flex: 'none' }}
                />
              </div>
              {fermeApres && (
                <div className="tre-inline-note">
                  <span className="mark">!</span>
                  <span>La Maison est fermée ce jour-là aussi. Choisissez-en un autre, sinon la cliente reviendra devant une porte close.</span>
                </div>
              )}
              <div style={{ border: '1px solid var(--hairline)', borderRadius: 3, padding: '11px 13px', background: 'var(--surface-card)' }}>
                <div className="mnd-eyebrow" style={{ fontSize: 9.5, marginBottom: 6 }}>Ce qu’elle recevra</div>
                <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--ink-soft)' }}>{msg}</div>
              </div>
              <div className="mnd-muted" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
                Le rendez-vous prend la nouvelle date et <b>reste en attente</b> : c’est elle qui
                décide, vous le confirmerez quand elle aura répondu.
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button className="trf-act trf-act--ghost" style={{ flex: 1 }} onClick={() => setProposeFor(null)}>Annuler</button>
                {tel && (
                  <a
                    className="trv-wa-btn" style={{ textDecoration: 'none', flex: 1, textAlign: 'center' }}
                    href={`#${cheminDeLaConversation(tel, msg) ?? '/conversations'}`}
                    onClick={poser}
                  >
                    Déplacer et prévenir
                  </a>
                )}
                <button className="trf-act" onClick={poser}>Déplacer sans message</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* SA CARTE, DEPUIS LE TABLEAU DE BORD — la même modale que sur sa fiche,
          jamais une seconde : une carte dessinée à deux endroits finirait par
          avoir deux visages. */}
      {carteFor && <CarteModal client={carteFor} onClose={() => setCarteFor(null)} />}

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
                          href={`#${cheminDeLaConversation(tel, signeLeMessage(r.mode === 'forfait'
                            ? `Votre forfait « ${r.items[0]?.service ?? 'de la Maison'} » est entre nos mains, scellons vos créneaux, mèche après mèche.`
                            : `Votre ${r.mode === 'abonnement' ? 'abonnement' : 'rituel'} sur-mesure est entre nos mains, scellons vos créneaux, mèche après mèche.`)) ?? '/conversations'}`}
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


/* ══ LE TABLEAU DE L'ÉQUIPE — 5 novembre 2026 ═══════════════════════════
   Pour qui n'est ni souverain ni gérant : sa journée, ses rendez-vous, ses
   pourboires, en chiffres ; jamais l'argent de la Maison (ni l'encaissé du
   mois, ni les impayés), ni les montants des rendez-vous. Le bloc entier de
   ses pourboires vit dans Mon mois ; ici, ses totaux. */
function TableauDeLEquipe() {
  const navigate = useNavigate();
  const { currency } = useBranch();
  const appts = useBranchAppointments();
  const [allClients] = useClients();
  const byId = useServicesById();
  const maFiche = useMaFicheDansLEquipe();
  const [tips] = useTips();
  const synchro = useSynchroDite();
  /* L'alarme de toujours : les clientes seules, pour l'équipe. */
  const alarme = useLAlarmeWhatsApp();
  const [editAppt, setEditAppt] = useState<Appointment | null>(null);
  const today = todayISO();
  const fmt = (x: number) => fmtMoney(x, currency);
  const prevMonthName = nomDuMois(moisAvant(today.slice(0, 7)));

  const duJour = useMemo(
    () => appts.filter((a) => a.date === today && a.status !== 'annulé').sort((a, b) => timeToMin(a.time) - timeToMin(b.time)),
    [appts, today],
  );
  const estAMoi = (a: Appointment): boolean => !!maFiche && !!a.master && sameName(a.master, maFiche.name);
  const mesDuJour = duJour.filter(estAMoi).length;
  const mesSeptJours = useMemo(() => {
    const fin = addDaysISO(today, 6);
    return appts.filter((a) => a.status !== 'annulé' && a.date >= today && a.date <= fin && !!maFiche && !!a.master && sameName(a.master, maFiche.name)).length;
  }, [appts, today, maFiche]);
  const mes = useMemo(() => (maFiche ? mesPourboires(tips, maFiche.id, today) : null), [tips, maFiche, today]);
  const seulFil = alarme.enAttente.length === 1 ? alarme.enAttente[0] : null;
  const tonDeLaSynchro = synchro.ton === 'ok' ? ' est-ok' : synchro.ton === 'attente' ? ' est-attente' : synchro.ton === 'ko' ? ' est-ko' : '';

  const kpis = [
    { k: 'mes-rdv', l: 'Mes rendez-vous', v: String(mesDuJour), c: `aujourd’hui · ${nombreDe(duJour.length, 'à la Maison', 'à la Maison')}`, go: () => navigate('/calendrier') },
    { k: 'mes-sept', l: '7 jours', v: String(mesSeptJours), c: 'mes rendez-vous', go: () => navigate('/calendrier') },
    { k: 'mes-pourboires-jour', l: 'Mes pourboires', v: fmt(mes?.totaux.aujourdhui ?? 0), c: `aujourd’hui · semaine ${fmt(mes?.totaux.semaine ?? 0)}`, go: () => navigate('/mon-mois') },
    { k: 'mes-pourboires-mois', l: `Pourboires ${nomDuMois(today.slice(0, 7))}`, v: fmt(mes?.totaux.mois ?? 0), c: `${prevMonthName} : ${fmt(mes?.totaux.moisPrecedent ?? 0)}`, go: () => navigate('/mon-mois') },
  ];

  return (
    <div className="mnd-rise tdb" data-tdb="equipe">
      <header className="tdb-tete" data-tdb="tete">
        <div>
          <p className="tdb-tete__sur">Tableau de bord · {maisonNom()}</p>
          <h1 className="tdb-tete__titre">{dateDuTitre(today)}</h1>
        </div>
        <div className="tdb-puces">
          <span className={`tdb-puce${tonDeLaSynchro}`} role="status">{synchro.dit}</span>
          <button type="button" className="tdb-puce" onClick={() => navigate('/mon-mois')}>Mon mois ›</button>
        </div>
      </header>

      <section className="tdb-kpis tdb-kpis--quatre" aria-label="Mes chiffres" data-tdb="bandeau">
        {kpis.map((k) => (
          <button type="button" key={k.k} className="tdb-kpi" data-kpi={k.k} onClick={k.go}>
            <span className="tdb-kpi__l">{k.l}</span>
            <span className="tdb-kpi__v">{k.v}</span>
            <span className="tdb-kpi__c">{k.c}</span>
          </button>
        ))}
      </section>

      <div className={`tdb-grille${alarme.enAttente.length === 0 ? ' tdb-grille--seule' : ''}`}>
        <section className="tdb-carte" aria-labelledby="tdb-t-ma-journee" data-tdb="aujourdhui">
          <div className="tdb-carte__t">
            <h2 id="tdb-t-ma-journee">Aujourd’hui</h2>
            <button type="button" className="tdb-lien" onClick={() => navigate('/calendrier')}>Le calendrier ›</button>
          </div>
          <div className="tdb-defile">
            <table className="tdb-table">
              <thead><tr><th>Heure</th><th>Cliente</th><th>Rituel</th><th>Avec</th><th>État</th></tr></thead>
              <tbody>
                {duJour.length === 0 && <tr><td className="tdb-vide" colSpan={5}>Carnet libre</td></tr>}
                {duJour.map((a) => (
                  <tr key={a.id} className={estAMoi(a) ? 'est-moi' : undefined} onClick={() => setEditAppt(a)} title="Ouvrir ce rendez-vous">
                    <td className="tdb__num">{a.time}</td>
                    <td className="tdb-txt">{allClients.find((c) => c.id === a.clientId)?.name ?? a.clientName ?? 'Cliente de passage'}</td>
                    <td className="tdb-txt">{rituelDit(apptLabel(a, byId))}</td>
                    <td>{a.master || '·'}</td>
                    <td><StatusPill status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {alarme.enAttente.length > 0 && (
          <section className="tdb-carte" aria-labelledby="tdb-t-a-traiter" data-tdb="a-traiter">
            <div className="tdb-carte__t">
              <h2 id="tdb-t-a-traiter">À traiter</h2>
              <button type="button" className="tdb-lien" onClick={() => navigate('/conversations')}>Les conversations ›</button>
            </div>
            <div className="tdb-tache est-ko" data-tache="whatsapp">
              <span className="tdb-tache__n est-ko">{alarme.enAttente.length}</span>
              <span className="tdb-tache__dit">{alarme.enAttente.length > 1 ? 'messages WhatsApp sans réponse' : 'message WhatsApp sans réponse'}</span>
              <button type="button" className="tdb-btn" onClick={() => navigate(seulFil ? cheminDeLaConversation(seulFil.numero) ?? '/conversations' : '/conversations')}>Répondre</button>
            </div>
          </section>
        )}
      </div>

      {editAppt && <RdvModal appt={editAppt} onClose={() => setEditAppt(null)} />}
    </div>
  );
}
