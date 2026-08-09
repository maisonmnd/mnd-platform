import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { Button, Field, Input, Modal, Select } from '../../../../ds/components';
import { useBranch } from '../../../../shared/branches';
import { fmtMoney } from '../../../../shared/currency';
import {
  clientsStore, clienteDePassage, ensureInitiePersona, estDePassage, useClients, type Client,
} from '../../../../shared/clients';
import { apptPaidXof,
  appointmentsStore, useAppointments, useRemindersSent, markReminderSent, reminderKey,
  type Appointment, type ReminderKind,
} from '../../../../shared/agenda';
import { sousArbreOf, useServices, useCategories, priceModeOf, LONGUEURS, suitLongueur, type LongueurId, type Service } from '../../../../shared/catalog';
import { depositForServices, depositPctFor, useSettings } from '../../../../shared/settings';
import { uid } from '../../../../shared/store';
import { useSubscribers, usePlans, activeSubscriberOf, coveredRemaining, useStaff, ordonneEquipe } from '../equipe/data';
import { prixFerme, useModelBands, useBandSets, pricingOf, personalPriceXof, prixDeBase, isPersonalized, bandLabel, servesBand, bandForService } from '../../../../shared/pricing';
import './clients.css';

/* Outils communs du domaine Clients & Agenda — dates, pastilles, tiroir, modale RDV. */

/* ---------- Dates ---------- */
export const pad2 = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayISO = () => toISO(new Date());

/** Le JOUR d'une valeur de date, ou '' si elle est illisible.
    `fromISO` construit la date en collant l'heure au jour (`${iso}T12:00:00`) :
    toute valeur qui n'est pas un jour ISO nu produit une date invalide, et les
    formateurs écrivaient « Invalid Date » en clair à l'écran. C'est arrivé pour
    de bon — une date déjà formatée repassée dans `frShort` (voir Catalogue.tsx,
    le point d'usage). Ce garde-fou coupe au jour, tolère un horodatage complet,
    et refuse le reste plutôt que de deviner. */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export const dayOf = (v?: string | null): string => {
  const s = String(v ?? '').slice(0, 10);
  return ISO_DAY.test(s) ? s : '';
};
export const fromISO = (iso: string) => new Date(`${dayOf(iso)}T12:00:00`);
export const addDaysISO = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* Une date illisible s'écrit « — », JAMAIS « Invalid Date » : au comptoir,
   un tiret se comprend, un message d'erreur anglais inquiète la cliente. */

/** « Lun. 13 juil. » */
export const frShort = (iso: string) =>
  dayOf(iso) ? cap(fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })) : '—';

/** « Lundi 13 juillet » */
export const frLong = (iso: string) =>
  dayOf(iso) ? cap(fromISO(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })) : '—';

/** « 13 juil. » */
export const frDay = (iso: string) =>
  dayOf(iso) ? fromISO(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—';

export const timeToMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Écart relatif éditorial : « aujourd'hui », « il y a 4 j », « il y a 2 mois ». */
export function relDays(iso: string): string {
  const diff = Math.round((Date.now() - fromISO(iso).getTime()) / 86400000);
  if (diff <= 0) return 'aujourd’hui';
  if (diff === 1) return 'hier';
  if (diff < 30) return `il y a ${diff} j`;
  const months = Math.round(diff / 30);
  return `il y a ${months} mois`;
}

/* ---------- Rendez-vous ---------- */
export const apptServices = (a: Appointment, byId: Map<string, Service>): Service[] =>
  a.serviceIds.map((id) => byId.get(id)).filter((s): s is Service => !!s);

/** Le prix d'une prestation POUR CE RENDEZ-VOUS : celui de la longueur
    travaillée quand le rituel en porte une, son prix catalogue sinon.

    Le rendez-vous connaît sa longueur — elle est inscrite dessus. Aucun contexte
    cliente n'est donc nécessaire ici, et ces totaux restent lisibles partout
    (carnet, synthèse, impayés) sans que chaque écran ait à retrouver la fiche. */
export const svcPriceForAppt = (a: Appointment, s: Service): number =>
  (a.longueur ? s.prixParLongueur?.[a.longueur] : undefined) ?? s.priceXof;

export const apptDurationMin = (a: Appointment, byId: Map<string, Service>) =>
  apptServices(a, byId).reduce(
    (sum, s) => sum + ((a.longueur ? s.dureeParLongueur?.[a.longueur] : undefined) ?? s.durationMin),
    0,
  ) || 60;

/* Série multi-séances : la prestation n'est facturée qu'UNE fois.
   Le montant est porté par la séance 1 ; les séances suivantes valent 0
   (partout : tableau de bord, carnet, synthèse, fidélité, impayés). */
export const apptTotalXof = (a: Appointment, byId: Map<string, Service>) => {
  if (a.seriesIndex && a.seriesIndex > 1) return 0;
  /* Un prix figé l'emporte sur le catalogue : le rituel a été facturé À CE
     PRIX-LÀ, et le catalogue a bougé depuis. Le relire au tarif du jour
     réécrirait l'histoire — c'est ce que faisaient les RDV repris de l'ancien
     ERP, à 3 M F près. La règle des séries reste au-dessus : une séance 2+ ne
     vaut rien, prix figé ou non. */
  if (typeof a.priceXof === 'number') return a.priceXof;
  return apptServices(a, byId).reduce((sum, s) => sum + svcPriceForAppt(a, s), 0);
};

/** Total après remise du RDV : le pourcentage d'abord, puis la remise en CFA.
    Jamais négatif — une remise en CFA supérieure au reste rend le rituel offert.

    UN FORFAIT PONCTUEL FAIT FOI et remplace tout le calcul : c'est le total que
    la Maison a promis pour l'ensemble des gestes. Rien ne s'y ajoute — on ne
    remise pas un prix déjà négocié. Tout ce qui ventile par prestation (mains,
    production, seuils, commissions, Bilan) répartit ce net au prorata et suit
    donc sans rien savoir du forfait. */
export const apptNetXof = (a: Appointment, byId: Map<string, Service>) => {
  /* La règle des séries passe avant tout : une séance 2+ ne vaut rien, forfait
     ou non — sinon un forfait se compterait une fois par séance. */
  if (a.seriesIndex && a.seriesIndex > 1) return 0;
  if (a.forfait) return Math.max(0, Math.round(a.forfait.totalXof));
  return Math.max(0, Math.round(apptTotalXof(a, byId) * (1 - (a.discountPct ?? 0) / 100)) - (a.discountXof ?? 0));
};

/** Le nom d'un forfait ponctuel — « Forfait » quand la Maison n'en a pas donné. */
export const forfaitLabel = (f: NonNullable<Appointment['forfait']>): string => f.nom?.trim() || 'Forfait';

/** Le taux que ce forfait représente, en % du prix plein consenti ce jour-là. */
export const forfaitTauxPct = (f: NonNullable<Appointment['forfait']>): number =>
  f.baseXof > 0 ? Math.max(0, (1 - f.totalXof / f.baseXof) * 100) : 0;

/** Facteur de remise EFFECTIF d'un RDV (0–1) — le pourcentage ET la remise en
    CFA, cette dernière répartie au prorata des prestations. À utiliser pour
    toute ventilation par prestation ou par maître : appliquer seulement
    `discountPct` surévaluerait le chiffre d'affaires dès qu'une remise manuelle
    existe, et les ventilations ne sommeraient plus au net encaissé. */
export const apptDiscountFactor = (a: Appointment, byId: Map<string, Service>): number => {
  const gross = apptTotalXof(a, byId);
  if (gross <= 0) return 0;
  return apptNetXof(a, byId) / gross;
};

/** Acompte CRÉDITABLE : seul un acompte VÉRIFIÉ reçu (depositConfirmed) compte.
    Un acompte simplement demandé (réservation en ligne, RDV pris au comptoir)
    n'a aucune preuve de paiement — le déduire ferait sous-encaisser le salon. */
export const apptDepositCreditXof = (a: Appointment) =>
  (a.depositConfirmed ? a.depositXof ?? 0 : 0);

/** Reste à encaisser : net − acompte VÉRIFIÉ − déjà encaissé (jamais négatif). */
export const apptDueXof = (a: Appointment, byId: Map<string, Service>) =>
  /* `apptPaidXof` lit le JOURNAL des versements quand il existe, et retombe sur
     `paidXof` sinon. Sans cela, des qu'un reglement s'inscrit au journal, cet
     ecran reclamerait un argent deja encaisse. */
  Math.max(0, apptNetXof(a, byId) - apptDepositCreditXof(a) - apptPaidXof(a));

/** État de règlement d'un RDV — support de la pastille payé/partiel/impayé/gratuit. */
export function apptPayState(a: Appointment, byId: Map<string, Service>): 'payé' | 'partiel' | 'impayé' | 'gratuit' {
  const net = apptNetXof(a, byId);
  if (net <= 0) return 'gratuit';
  const due = apptDueXof(a, byId);
  if (due <= 0) return 'payé';
  const paid = (a.paidXof ?? 0) + apptDepositCreditXof(a);
  return paid > 0 ? 'partiel' : 'impayé';
}

export const apptLabel = (a: Appointment, byId: Map<string, Service>) =>
  apptServices(a, byId).map((s) => s.name).join(' + ') || '—';

/* ---------- Rappel WhatsApp (cloche sur un RDV à venir) ----------
   Un seul endroit pour le message ET la fenêtre du rappel, partagé par
   Le Carnet, le Calendrier et le Tableau de bord — le libellé reste identique
   partout. `due` code l'urgence : « now » = dans l'heure (rappel H-1),
   « soon » = demain (rappel J-1), '' = plus lointain. */
const digitsOf = (p?: string) => (p ?? '').replace(/\D/g, '');

/** Signature de la Maison au bas d'un message — le picto de la branche puis la
    devise en fon, celle du Portail, du Certificat et du Bilan de séance :
    « mi nyɔ́ ɖɛkpɛ » (nous sommes beaux, et nous le savons).
    ⚠ Un lien wa.me ne transporte QUE du texte — le monogramme dessiné ne peut
    pas voyager dans le message. Le picto typographique de la branche en tient
    lieu ; le vrai logo se pose une fois pour toutes en photo de profil du compte
    WhatsApp de la Maison, où il signe alors CHAQUE message. */
export const houseSignature = (picto?: string) =>
  `${picto ?? '◈'} Maison MND · mi nyɔ́ ɖɛkpɛ`;

export function apptReminder(
  a: Appointment,
  client: Client | undefined,
  byId: Map<string, Service>,
  picto?: string,
): { href: string | null; due: 'now' | 'soon' | ''; when: string } {
  const t = todayISO();
  const tomorrow = addDaysISO(t, 1);
  const when =
    a.date === t ? `aujourd'hui à ${a.time}`
    : a.date === tomorrow ? `demain à ${a.time}`
    : `${frDay(a.date)} à ${a.time}`;
  let due: 'now' | 'soon' | '' = '';
  if (a.date === t) {
    const now = new Date();
    const mins = timeToMin(a.time) - (now.getHours() * 60 + now.getMinutes());
    due = mins >= -15 && mins <= 90 ? 'now' : 'soon';
  } else if (a.date === tomorrow) {
    due = 'soon';
  }
  const digits = digitsOf(client?.phone);
  if (!digits) return { href: null, due, when };
  const first = (client?.name ?? '').split(' ')[0] || 'Madame';
  const svc = apptLabel(a, byId);
  const msg =
    `Bonjour ${first},\n` +
    `Petit rappel de la Maison MND : votre rendez-vous est prévu ${when}${svc && svc !== '—' ? ` (${svc})` : ''}.\n` +
    `Merci de nous prévenir en cas d'empêchement. À très vite.\n\n` +
    houseSignature(picto);
  return { href: `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, due, when };
}

/** Cloche de rappel WhatsApp : n'apparaît que sur un RDV À VENIR (confirmé ou en
    attente, date ≥ aujourd'hui) d'une cliente avec numéro. Un clic ouvre WhatsApp
    avec le message prêt à envoyer ET consigne le rappel. Réutilisée par Le Carnet,
    le Calendrier et le Tableau de bord.
    Deux rappels distincts par rendez-vous : « j1 » (la veille) et « h1 » (dans
    l'heure). Une fois le J-1 consigné la cloche se met en retrait ; elle se
    RALLUME d'elle-même à l'entrée dans la dernière heure, car le H-1 reste à
    envoyer. Un rappel consigné se renvoie quand même d'un clic — on ne verrouille
    rien, on se souvient seulement. */
export function ReminderBell({
  appt, client, byId, className, size = 15,
}: { appt: Appointment; client?: Client; byId: Map<string, Service>; className?: string; size?: number }) {
  const [sentKeys] = useRemindersSent();
  const { branch } = useBranch(); // le picto de la branche signe le message
  const upcoming =
    (appt.status === 'confirmé' || appt.status === 'en attente') && appt.date >= todayISO();
  const { href, due, when } = apptReminder(appt, client, byId, branch.pictogram ?? undefined);
  if (!upcoming || !href) return null;
  const kind: ReminderKind = due === 'now' ? 'h1' : 'j1';
  const sent = sentKeys.includes(reminderKey(appt.id, appt.date, kind));
  const label = kind === 'h1' ? 'dernier rappel (dans l’heure)' : 'rappel de la veille';
  return (
    <a
      className={`trc-remind${className ? ` ${className}` : ''}`}
      data-due={due}
      data-sent={sent ? '1' : undefined}
      href={href}
      target="_blank"
      rel="noreferrer"
      draggable={false}
      onClick={(e) => { e.stopPropagation(); markReminderSent(appt.id, appt.date, kind); }}
      title={sent ? `Rappel déjà envoyé — RDV ${when}. Cliquez pour renvoyer.` : `Rappel WhatsApp — ${label}, RDV ${when}`}
      aria-label={sent ? 'Rappel WhatsApp déjà envoyé — renvoyer' : 'Envoyer un rappel WhatsApp'}
    >
      {sent ? <Check size={size} /> : <Bell size={size} />}
    </a>
  );
}

export function useServicesById(): Map<string, Service> {
  const [services] = useServices();
  return useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
}

export function useBranchClients(): Client[] {
  const { branch } = useBranch();
  const [clients] = useClients();
  return useMemo(() => clients.filter((c) => c.branchId === branch.id && !c.archived), [clients, branch.id]);
}

export function useBranchAppointments(): Appointment[] {
  const { branch } = useBranch();
  const [appointments] = useAppointments();
  return useMemo(() => appointments.filter((a) => a.branchId === branch.id), [appointments, branch.id]);
}

/* ---------- Pastilles ---------- */
const STATUS_CLASS: Record<Appointment['status'], string> = {
  'confirmé': 'trc-pill--confirme',
  'en attente': 'trc-pill--attente',
  'honoré': 'trc-pill--honore',
  'annulé': 'trc-pill--annule',
};

export function StatusPill({ status }: { status: Appointment['status'] }) {
  return <span className={`trc-pill ${STATUS_CLASS[status]}`}>{status}</span>;
}

/* Pastille de règlement — verte (payé), cuivre (partiel), rouge (impayé) ; rien si gratuit. */
export function PayStatusPill({ a, byId }: { a: Appointment; byId: Map<string, Service> }) {
  const state = apptPayState(a, byId);
  if (state === 'gratuit') return null;
  /* copper-700, pas le cuivre brut : à cette taille sur fond clair, le cuivre
     brut tombe à 3,1:1 — sous le seuil AA (4,5:1). */
  const color = state === 'payé' ? 'var(--trf-success)' : state === 'partiel' ? 'var(--copper-700)' : '#8f3b30';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.09em',
        textTransform: 'uppercase',
        borderRadius: 'var(--radius-pill)',
        padding: '2px 7px',
        border: `1px solid ${color}`,
        color,
        whiteSpace: 'nowrap',
        lineHeight: 1.35,
      }}
    >
      {state}
    </span>
  );
}

const SOURCE_LABEL: Record<string, string> = { couronne: 'Ma Couronne', consultation: 'Consultation', trone: 'Le Trône' };

export function SourceBadge({ source }: { source?: Appointment['source'] }) {
  if (!source || source === 'trone') return null;
  return <span className={`trc-src ${source === 'consultation' ? 'trc-src--indigo' : ''}`}>{SOURCE_LABEL[source]}</span>;
}

/* ---------- Avatar (photo ou initiales) ---------- */
/** Lit un fichier image et le RÉDUIT avant stockage : la photo part en JSONB
    synchronisé (Supabase) puis vit dans localStorage — une photo de téléphone
    brute (3–5 Mo en base64) saturerait les deux. On la ramène à `max` px de côté,
    en JPEG : un avatar net pèse alors quelques dizaines de Ko. Repli sur le
    data-URL d'origine si le canvas n'est pas disponible. */
export async function readImageDownscaled(file: File, max = 512): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    r.readAsDataURL(file);
  });
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible.'));
      i.src = dataUrl;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', 0.82);
  } catch {
    return dataUrl; // un GIF animé ou un format exotique : on garde l'original plutôt que rien
  }
}

export function Avatar({ client, size = 36 }: { client: Pick<Client, 'name' | 'photo'>; size?: number }) {
  const initials = client.name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');
  if (client.photo) {
    return <img className="trc-avatar" src={client.photo} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  }
  return (
    <span className="trc-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials}
    </span>
  );
}

/* ---------- Tiroir latéral ---------- */
export function Drawer({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="trc-drawer-veil" onClick={onClose} />
      <div className="trc-drawer">{children}</div>
    </>
  );
}

/* ---------- Créneaux 07:00 → 21:30 ----------
   Toute l'amplitude d'ouverture possible (le samedi ferme à 20h, certains
   soirs plus tard) : la liste s'arrêtait à 17:30, d'où l'impossibilité de
   poser un rendez-vous en soirée. La modale accepte de toute façon une heure
   hors liste (option injectée), mais le menu doit couvrir les heures réelles. */
export const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 7; h < 22; h++) {
    out.push(`${pad2(h)}:00`, `${pad2(h)}:30`);
  }
  return out;
})();

/* ---------- Modale rendez-vous — création & modification ---------- */
export type RdvInitial = Partial<Pick<Appointment, 'clientId' | 'serviceIds' | 'date' | 'time' | 'master' | 'note'>>;

const RDV_STATUSES: Appointment['status'][] = ['en attente', 'confirmé', 'honoré', 'annulé'];

export function RdvModal({
  onClose,
  initial,
  appt,
  title,
  onEncaisser,
  sansPrix,
}: {
  onClose: () => void;
  /** LA FICHE SANS SES MONTANTS. Un maître ouvre le rituel pour lire sa
      journée et désigner ses mains, pas pour lire le chiffre de la Maison.
      Le prix de chaque prestation, le total, la remise et l'acompte se
      taisent alors — le reste de la fiche fonctionne à l'identique. */
  sansPrix?: boolean;
  initial?: RdvInitial;
  /** Rendez-vous existant — la modale passe en mode modification (statut, suppression). */
  appt?: Appointment;
  title?: string;
  /** Encaisser depuis la modale — n'apparaît qu'en modification d'un RDV existant. */
  onEncaisser?: (a: Appointment) => void;
}) {
  const { branch, currency } = useBranch();
  const clients = useBranchClients();
  const branchAppts = useBranchAppointments();
  const [services] = useServices();
  const byId = useServicesById();

  const [clientId, setClientId] = useState(appt?.clientId ?? initial?.clientId ?? clients[0]?.id ?? '');
  const [serviceIds, setServiceIds] = useState<string[]>(appt?.serviceIds ?? initial?.serviceIds ?? []);
  /* LES MAINS, prestation par prestation. Un tableau parallele a `serviceIds` :
     le rituel peut porter deux fois le meme geste, et pas forcement par les
     memes personnes. Vide sur une ligne = on retombe sur le maitre assigne. */
  const [mains, setMains] = useState<string[][]>(appt?.mains ?? []);
  const [equipe] = useStaff();
  const mainsDe = (i: number) => mains[i] ?? [];
  const basculeMain = (i: number, staffId: string) => setMains((prev) => {
    const n = serviceIds.map((_, k) => prev[k] ?? []);
    n[i] = n[i].includes(staffId) ? n[i].filter((x) => x !== staffId) : [...n[i], staffId];
    return n;
  });
  const [date, setDate] = useState(appt?.date ?? initial?.date ?? todayISO());
  const [time, setTime] = useState(appt?.time ?? initial?.time ?? '09:00');
  const [master, setMaster] = useState(appt?.master ?? initial?.master ?? branch.masters[0] ?? '');
  const [status, setStatus] = useState<Appointment['status']>(appt?.status ?? 'confirmé');
  const [note, setNote] = useState(appt?.note ?? initial?.note ?? '');
  const [discountPct, setDiscountPct] = useState<number>(appt?.discountPct ?? 0);
  const [discountXof, setDiscountXof] = useState<number>(appt?.discountXof ?? 0);
  /* LE FORFAIT PONCTUEL — un total négocié pour l'ensemble des gestes. Il
     REMPLACE les remises tant qu'il est posé : deux mécaniques sur le même
     rituel, et plus personne ne sait ce qui a été consenti. */
  const [forfaitOn, setForfaitOn] = useState(!!appt?.forfait);
  const [forfaitNom, setForfaitNom] = useState(appt?.forfait?.nom ?? '');
  const [forfaitStr, setForfaitStr] = useState(appt?.forfait ? String(appt.forfait.totalXof) : '');
  /* Qui a offert ce rituel — vide dans l'immense majorité des cas. */
  const [offertPar, setOffertPar] = useState(appt?.offertPar ?? '');
  /* Montant convenu — saisi pour les rituels à prix variable / sur devis. */
  const [amount, setAmount] = useState<string>(appt?.priceXof != null ? String(appt.priceXof) : '');
  /* Ré-tarifer un rituel au tarif du jour (geste EXPLICITE) : un prix figé sous
     un ancien barème peut être actualisé au prix personnalisé courant. Jamais
     automatique — le prix d'origine fait foi tant que la maison ne le demande pas. */
  const [refreshPrice, setRefreshPrice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings] = useSettings();
  const [subs] = useSubscribers();
  const [plans] = usePlans();
  const [bands] = useModelBands();
  /* Abonnement actif de la cliente — pour la distinguer à la prise de rendez-vous. */
  const membership = clientId ? activeSubscriberOf(subs, clientId) : undefined;
  const membershipPlan = membership ? plans.find((p) => p.id === membership.planId) : undefined;
  /* Couverture par l'abonnement : rituel « inclus » (prix 0, décompté du quota). */
  const [covered, setCovered] = useState<boolean>(appt?.coveredBySub ?? false);

  const chosen = serviceIds.map((id) => byId.get(id)).filter((s): s is Service => !!s);
  const [cats] = useCategories();
  const remaining = services.filter((s) => !serviceIds.includes(s.id)).sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.order - b.order);

  /* Prestations choisies qui sont INCLUSES dans la formule de l'abonnée, avec leur
     allocation restante sur le cycle (le RDV en cours exclu de son propre décompte).
     `remaining === null` = illimité. La couverture n'est proposée que s'il reste au
     moins une allocation (ou si ce RDV était déjà couvert). */
  const coverageRows = (membership && membershipPlan)
    ? chosen
        .filter((sv) => membershipPlan.included?.some((i) => i.serviceId === sv.id))
        .map((sv) => ({ sv, remaining: coveredRemaining(membership, membershipPlan, sv.id, branchAppts, appt?.id) }))
    : [];
  const canCover = coverageRows.length > 0 && (coverageRows.some((r) => r.remaining === null || (r.remaining ?? 0) > 0) || !!appt?.coveredBySub);
  const effCovered = covered && canCover;
  /* LE PRIX D'ORIGINE FAIT FOI. Un rituel au prix figé (facturé à CE prix-là —
     ancien ERP ou encaissement passé) GARDE son prix quand on le modifie : le
     catalogue vit, l'histoire non. Le prix ne se recalcule au catalogue du jour
     QUE si l'on change les prestations elles-mêmes — l'ancien prix ne décrit
     alors plus le même rituel. */
  const frozenXof = appt?.priceXof;
  /* SON prix : le modèle de la cliente (nombre de locks → tranche du barème) et
     son Juste Prix personnalisent le tarif de référence. Quand il n'y a rien à
     personnaliser, la référence reste le catalogue — comportement inchangé. */
  const rdvClient = clients.find((c) => c.id === clientId);
  const [sets] = useBandSets();
  /* LA LONGUEUR TRAVAILLÉE, choisie ici et non lue sur la fiche : elle repousse.
     Elle entre dans le contexte tarifaire comme le calibre, et se réinscrit sur
     le rendez-vous pour que le relire ne le retarife jamais à la longueur
     d'aujourd'hui. Par défaut Mi-Long — le cas courant au fauteuil. */
  const [longueur, setLongueur] = useState<LongueurId>(appt?.longueur ?? 'mi-long');
  /* TOUS LES MONTANTS DE CETTE FICHE PASSENT PAR ICI. Masquer les prix un par
     un aurait laissé passer celui qu'on oublie — et un prix oublié dans un
     écran censé n'en montrer aucun vaut pire que pas de masquage du tout. */
  const argent = (n: number): string => (sansPrix ? '—' : fmtMoney(n, currency));
  const pricing = { ...pricingOf(rdvClient, bands, sets, cats), longueur };
  /* Le prix de référence suit déjà la longueur : sans cela, une cliente sans
     modèle ni Juste Prix — donc « non personnalisée » — se serait vu facturer
     le prix du Court quelle que soit sa longueur. */
  const grossCatalogue = chosen.reduce((s, sv) => s + prixDeBase(sv, pricing), 0);
  /* La longueur ne concerne que les prestations qui s'y facturent. Ailleurs, le
     sélecteur n'a rien à commander : on ne le montre pas. */
  const longueurPertinente = chosen.some(suitLongueur);
  /* SEULEMENT CE QUI LA CONCERNE. Un VÈKPÈ™ Medium n'existe pas pour une cliente
     Mini : le proposer, c'est risquer de figer 150 000 F sur son rendez-vous là
     où son prix est de 220 000 F. Déclaré APRÈS `pricing` — le lire plus haut
     touchait une constante non encore initialisée et cassait tout le Carnet. */
  const proposables = remaining.filter((sv) => servesBand(sv, bandForService(sv, pricing)));
  /* GROUPÉES PAR ATELIER. 148 prestations à la file, on ne retrouve rien : il
     faut lire toute la liste pour choisir un resserrage. Les regrouper sous le
     nom de leur atelier rend la recherche visuelle immédiate — c'est déjà comme
     ça que la Maison en parle. Les catégories vides ne s'affichent pas. */
  const parAtelier = cats
    .map((c) => ({ cat: c, list: proposables.filter((sv) => sv.categoryId === c.id) }))
    .filter((g) => g.list.length);
  const horsAtelier = proposables.filter((sv) => !cats.some((c) => c.id === sv.categoryId));

  const rdvPersonalized = isPersonalized(pricing) && chosen.length > 0;
  const grossBase = rdvPersonalized ? chosen.reduce((s, sv) => s + personalPriceXof(sv, pricing, services), 0) : grossCatalogue;
  const servicesChanged = !!appt && [...appt.serviceIds].sort().join('|') !== [...serviceIds].sort().join('|');
  /* Prestation à prix variable ou sur devis : le montant se fixe au fauteuil. Le
     montant convenu (saisi dans la modale) prime alors sur la somme de référence ;
     à défaut, on retient le prix de départ. */
  const needsAmount = chosen.some((sv) => priceModeOf(sv) !== 'fixe');
  const amountNum = parseInt(amount.replace(/[^0-9]/g, ''), 10) || 0;
  const keepFrozen = !needsAmount && typeof frozenXof === 'number' && !servicesChanged && !refreshPrice;
  const grossXof = keepFrozen ? (frozenXof as number) : grossBase;
  const effGross = needsAmount ? (amountNum || grossBase) : grossXof;
  /* REMISE VISIBLE « prix d'origine conservé » : chaque prestation reste affichée à
     son prix PLEIN (personalPriceXof, somme = grossBase) ; quand le total effectif
     figé est INFÉRIEUR au prix du jour, l'écart est une remise explicite — le RDV
     et la facture montrent les mêmes prix pleins + la même remise. Ne vaut que pour
     les rituels tout-en-prix-fixe (variable/devis : montant saisi au fauteuil). */
  const frozenRemiseXof = !needsAmount && keepFrozen && grossBase > effGross ? grossBase - effGross : 0;
  /* Information « prix d'origine ≠ tarif du jour » — ne vaut que pour les prix FIXES. */
  const frozenDiffers = !needsAmount && typeof frozenXof === 'number' && Math.round(frozenXof) !== Math.round(grossBase);
  /* Pourcentage d'abord, puis remise en CFA — jamais sous zéro. Même ordre que
     `apptNetXof`, sinon l'aperçu de la modale mentirait sur le net encaissé.
     Rituel couvert par l'abonnement → rien à facturer (0). */
  /* Le forfait : un total, et le taux qu'il représente — l'un remplit l'autre.
     On négocie tantôt un montant rond (« les quatre pour 60 000 »), tantôt un
     pourcentage ; le comptoir ne devrait pas avoir à faire la conversion. */
  const forfaitNum = Math.max(0, Math.round(Number(String(forfaitStr).replace(/[^0-9]/g, '')) || 0));
  const forfaitPose = forfaitOn && String(forfaitStr).trim() !== '';
  const forfaitPct = effGross > 0 ? Math.round((1 - forfaitNum / effGross) * 1000) / 10 : 0;
  const setForfaitParPct = (v: string) => {
    const p = Math.max(0, Math.min(100, Number(String(v).replace(',', '.')) || 0));
    setForfaitStr(String(Math.max(0, Math.round(effGross * (1 - p / 100)))));
  };
  const totalXof = effCovered
    ? 0
    : forfaitPose
      ? forfaitNum
      : Math.max(0, Math.round(effGross * (1 - discountPct / 100)) - discountXof);
  /* Acompte piloté par Paramètres : SEULEMENT les prestations qui l'exigent,
     CHACUNE à son propre taux. Aucune (ou taux 0) → pas d'acompte. */
  const depositServiceIds = chosen.filter((s) => depositPctFor(s.id) > 0).map((s) => s.id);
  /* La remise en CFA ne se répartit pas prestation par prestation : l'acompte se
     calcule sur le prix remisé en %, puis on le plafonne au net — réclamer un
     acompte supérieur au total à payer n'aurait aucun sens. */
  const depositXof = Math.min(depositForServices(chosen, discountPct), totalXof);
  const hasDeposit = depositXof > 0;
  /* Un pourcentage n'est affichable que s'il est unique parmi les prestations
     concernées ; sinon seul le montant a du sens. */
  const depositRates = [...new Set(chosen.map((s) => depositPctFor(s.id)).filter((p) => p > 0))];
  const depositPct = depositRates.length === 1 ? depositRates[0] : null;

  /* Chevauchement — même maître, même jour, statut non annulé (indication non bloquante). */
  const overlap = useMemo(() => {
    const start = timeToMin(time);
    const end = start + (chosen.reduce((s, sv) => s + sv.durationMin, 0) || 60);
    return branchAppts.find((a) => {
      if (a.id === appt?.id || a.date !== date || a.master !== master || a.status === 'annulé') return false;
      const s2 = timeToMin(a.time);
      return start < s2 + apptDurationMin(a, byId) && s2 < end;
    });
  }, [branchAppts, appt?.id, date, time, master, chosen, byId]);

  const overlapName = overlap ? clients.find((c) => c.id === overlap.clientId)?.name ?? 'une cliente' : '';

  /* CE QUI S'ÉCRIT SUR LE RITUEL. `baseXof` se réaffirme à chaque enregistrement :
     c'est le prix plein contre lequel la Maison vient de consentir ce total.
     La date, elle, ne bouge que si le total change — rouvrir une fiche ne
     redate pas une promesse déjà faite. */
  const forfaitEnregistre: Appointment['forfait'] =
    effCovered || !forfaitPose
      ? undefined
      : {
          nom: forfaitNom.trim() || undefined,
          totalXof: forfaitNum,
          baseXof: effGross,
          poseAt: appt?.forfait && appt.forfait.totalXof === forfaitNum ? appt.forfait.poseAt : todayISO(),
        };

  const nomDe = (id: string) => clients.find((c) => c.id === id)?.name ?? 'cette cliente';
  /* On ne s'offre pas son propre rituel : la mention n'aurait aucun sens et
     ferait compter la dépense deux fois au même compte. */
  const offertRetenu = offertPar && offertPar !== clientId ? offertPar : undefined;

  const save = (chosenStatus: Appointment['status']) => {
    if (!clientId) {
      setError('Choisissez une tête couronnée.');
      return;
    }
    if (serviceIds.length === 0) {
      setError('Ajoutez au moins une prestation.');
      return;
    }
    if (appt) {
      appointmentsStore.set((prev) =>
        prev.map((x) =>
          x.id === appt.id
            ? { ...x, clientId, serviceIds, date, time, master, status: chosenStatus, note: note.trim() || undefined,
                /* La longueur ne s'inscrit que si une prestation s'y facture :
                   la poser partout salirait tous les rituels d'une donnee qui
                   ne commande rien chez eux. */
                longueur: longueurPertinente ? longueur : undefined,
                /* Aucune main nulle part : on n'ecrit rien plutot qu'un tableau
                   de listes vides — le rendez-vous retombe alors sur son maitre. */
                mains: mains.some((m) => m?.length) ? serviceIds.map((_, k) => mains[k] ?? []) : undefined,
                /* Rituel COUVERT par l'abonnement : rien à facturer (prix 0), ni
                   remise ni acompte, décompté du quota du cycle. */
                coveredBySub: effCovered ? true : undefined,
                offertPar: offertRetenu,
                forfait: forfaitEnregistre,
                /* Un forfait posé efface les remises : le total négocié EST le
                   prix, on ne le remise pas une seconde fois. */
                discountPct: effCovered || forfaitPose ? undefined : (discountPct || undefined),
                discountXof: effCovered || forfaitPose ? undefined : (discountXof || undefined),
                /* PRIX D'ORIGINE CONSERVÉ tant que les prestations ne changent pas.
                   Prestations modifiées → recalcul au tarif du jour DE LA CLIENTE
                   (personnalisé si modèle/Juste Prix, sinon catalogue). Variable/
                   devis : on GÈLE le montant convenu. */
                priceXof: effCovered ? 0 : needsAmount ? (amountNum || grossBase) : keepFrozen ? frozenXof : rdvPersonalized ? grossBase : undefined,
                depositServiceIds: effCovered ? [] : depositServiceIds,
                depositXof: effCovered ? 0 : depositXof }
            : x,
        ),
      );
    } else {
      const created: Appointment = {
        id: uid(),
        branchId: branch.id,
        clientId,
        serviceIds,
        longueur: longueurPertinente ? longueur : undefined,
        mains: mains.some((m) => m?.length) ? serviceIds.map((_, k) => mains[k] ?? []) : undefined,
        date,
        time,
        master,
        status: chosenStatus,
        source: 'trone',
        note: note.trim() || undefined,
        coveredBySub: effCovered || undefined,
        coverKind: effCovered ? ('abonnement' as const) : undefined,
        offertPar: offertRetenu,
        forfait: forfaitEnregistre,
        discountPct: effCovered || forfaitPose ? undefined : (discountPct || undefined),
        discountXof: effCovered || forfaitPose ? undefined : (discountXof || undefined),
        /* Couvert par l'abonnement → prix 0 ; variable/devis gèle le montant
           convenu ; cliente au prix personnalisé → SON prix, figé dès la prise. */
        priceXof: effCovered ? 0 : needsAmount ? (amountNum || grossBase) : rdvPersonalized ? grossBase : undefined,
        depositServiceIds: effCovered ? [] : depositServiceIds,
        depositXof: effCovered ? 0 : depositXof,
      };
      /* LES SEANCES DUES PAR UN FORFAIT SE POSENT AU CARNET. Un forfait qui
         promet « les 3 premiers entretiens » ne les promettait qu'en toutes
         lettres : rien ne savait ce qui restait du, ces gestes n'entraient dans
         aucune statistique, et une seance oubliee ne se voyait nulle part.

         Chaque prestation incluse portant une echeance devient un rendez-vous
         a sa date, couvert par le forfait donc a 0 F. Le montant du forfait
         reste entier sur la visite d'ouverture : ces seances sont deja payees.
         Les dates sont a confirmer avec la cliente — elles sont posees pour ne
         pas etre perdues, pas pour etre gravees. */
      const suites: Appointment[] = [];
      for (const sid of serviceIds) {
        for (const inc of byId.get(sid)?.includes ?? []) {
          if (!inc.afterWeeks || inc.afterWeeks <= 0) continue;
          /* « SELON LE CALIBRE » se resout ICI, au moment ou une tete est en
             face : la ligne designe un atelier, on y prend la prestation qui
             sert le modele de la cliente. Sans cela il aurait fallu cinq
             forfaits identiques, un par densite. */
          const sousArbre = inc.categoryId ? sousArbreOf(cats, inc.categoryId) : undefined;
          const cible = sousArbre
            ? services.find((sv) => sousArbre.has(sv.categoryId) && servesBand(sv, bandForService(sv, pricing)))
            : byId.get(inc.serviceId);
          if (!cible) continue;
          suites.push({
            id: uid(),
            branchId: branch.id,
            clientId,
            serviceIds: [cible.id],
            date: addDaysISO(date, inc.afterWeeks * 7),
            time,
            master,
            status: 'confirmé',
            source: 'trone',
            note: `Inclus au forfait · ${byId.get(sid)?.name ?? ''} — date à confirmer`.trim(),
            coveredBySub: true,
            coverKind: 'forfait',
            coverServiceId: sid,
            priceXof: 0,
            depositServiceIds: [],
            depositXof: 0,
          });
        }
      }
      appointmentsStore.set((prev) => [...prev, created, ...suites]);
    }
    onClose();
  };

  const remove = () => {
    if (!appt) return;
    if (!window.confirm('Supprimer ce rendez-vous ? Cette action est définitive.')) return;
    appointmentsStore.set((prev) => prev.filter((x) => x.id !== appt.id));
    onClose();
  };

  /* Annuler ≠ supprimer : le RDV annulé sort du calendrier et de tout chiffre,
     mais reste visible (barré) au Carnet — l'histoire n'est pas effacée. */
  const cancelRdv = () => {
    if (!appt) return;
    const paid = appt.paidXof ?? 0;
    const msg = paid > 0
      ? `Annuler ce rendez-vous ? Il porte déjà ${argent(paid)} encaissés — l'annulation ne rembourse rien (passez par « Encaisser → Annuler l'encaissement » d'abord si besoin). Le rituel sortira du calendrier et ne comptera dans aucun chiffre.`
      : 'Annuler ce rendez-vous ? Il sortira du calendrier et ne comptera dans aucun chiffre — il restera visible, barré, au Carnet.';
    if (!window.confirm(msg)) return;
    appointmentsStore.set((prev) => prev.map((x) => (x.id === appt.id ? { ...x, status: 'annulé' } : x)));
    onClose();
  };

  return (
    <Modal title={title ?? (appt ? 'Modifier le rendez-vous.' : 'Nouveau rendez-vous.')} onClose={onClose} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Tête couronnée">
          <ClientPicker value={clientId} onChange={setClientId} allowPassage placeholder="Rechercher une cliente (nom, téléphone)…" />
          {membership && (
            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-pill)', padding: '3px 11px' }}>
              ★ Abonnée · {membershipPlan?.name ?? 'formule'}{membership.cycle && membership.cycle !== 'mensuel' ? ` · ${membership.cycle}` : ''}
            </div>
          )}
        </Field>

        <div>
          <span className="trc-microlabel">Prestations</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {chosen.map((sv, i) => (
              <div
                key={sv.id}
                style={{
                  border: '1px solid var(--hairline)', borderRadius: 2, padding: '11px 14px',
                  background: 'var(--surface-card)',
                }}
              >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, color: 'var(--color-indigo)' }}>{sv.name}</span>
                  <span style={{ display: 'block', fontSize: 10, color: 'var(--ink-soft)', marginTop: 2 }}>
                    {Math.round(sv.durationMin / 60 * 10) / 10} h · {sv.sessions > 1 ? `${sv.sessions} séances · ` : ''}palier {sv.palier}
                  </span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
                  {/* SON prix PLEIN — la remise éventuelle est une ligne à part (comme la facture). */}
                  <span style={{ fontSize: 13 }}>{priceModeOf(sv) === 'devis'
                      ? 'sur devis'
                      /* « dès » ne vaut que si le modèle est INCONNU. Dès qu'on
                         sait son nombre de locks, le prix au lock est exact —
                         l'annoncer comme un plancher fait douter la caissière. */
                      : priceModeOf(sv) === 'variable' && !prixFerme(sv, pricing)
                        ? `dès ${argent(personalPriceXof(sv, pricing, services))}`
                        : argent(personalPriceXof(sv, pricing, services))}</span>
                  {/* L'ORDRE DES PRESTATIONS EST CELUI DU FAUTEUIL. Il decide de
                      la lecture du rendez-vous, de l'ordre des lignes sur la
                      facture et du deroule de la seance : un diagnostic ouvre,
                      un styling ferme. On ne pouvait que retirer et re-ajouter
                      pour le corriger. */}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <button
                      /* On echange par la POSITION REELLE de la prestation, pas
                         par son rang a l'ecran : `chosen` ecarte les fiches
                         disparues du catalogue, et les deux index divergent des
                         qu'un rendez-vous ancien en porte une. */
                      onClick={() => {
                        const pos = serviceIds.indexOf(sv.id);
                        if (pos <= 0) return;
                        /* LES MAINS SUIVENT LEUR GESTE. Les deux tableaux sont
                           paralleles : deplacer l'un sans l'autre attribuerait
                           le travail d'une personne a la prestation voisine. */
                        setServiceIds((ids) => { const n = [...ids]; [n[pos - 1], n[pos]] = [n[pos], n[pos - 1]]; return n; });
                        setMains((prev) => {
                          const n = serviceIds.map((_, k) => prev[k] ?? []);
                          [n[pos - 1], n[pos]] = [n[pos], n[pos - 1]];
                          return n;
                        });
                      }}
                      disabled={i === 0}
                      aria-label="Monter cette prestation"
                      title="Monter"
                      style={{ cursor: i === 0 ? 'default' : 'pointer', background: 'none', border: 'none', padding: 0, lineHeight: 0.9, fontSize: 11, color: i === 0 ? 'var(--line)' : 'var(--ink-soft)' }}
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => {
                        const pos = serviceIds.indexOf(sv.id);
                        if (pos < 0 || pos >= serviceIds.length - 1) return;
                        setServiceIds((ids) => { const n = [...ids]; [n[pos], n[pos + 1]] = [n[pos + 1], n[pos]]; return n; });
                        setMains((prev) => {
                          const n = serviceIds.map((_, k) => prev[k] ?? []);
                          [n[pos], n[pos + 1]] = [n[pos + 1], n[pos]];
                          return n;
                        });
                      }}
                      disabled={i >= chosen.length - 1}
                      aria-label="Descendre cette prestation"
                      title="Descendre"
                      style={{ cursor: i >= chosen.length - 1 ? 'default' : 'pointer', background: 'none', border: 'none', padding: 0, lineHeight: 0.9, fontSize: 11, color: i >= chosen.length - 1 ? 'var(--line)' : 'var(--ink-soft)' }}
                    >
                      ▼
                    </button>
                  </span>
                  <button
                    onClick={() => {
                      const pos = serviceIds.indexOf(sv.id);
                      setServiceIds((ids) => ids.filter((_, k) => k !== pos));
                      setMains((prev) => serviceIds.map((_, k) => prev[k] ?? []).filter((_, k) => k !== pos));
                    }}
                    aria-label="Retirer"
                    style={{ cursor: 'pointer', background: 'none', border: 'none', color: 'var(--ink-soft)', fontSize: 13 }}
                  >
                    ✕
                  </button>
                </span>
              </div>
              {/* LES MAINS. Qui a reellement execute ce geste — un KLOKLO se
                  fait a deux, une reprise rarement a moins, la coiffure souvent
                  par une troisieme. Le maitre assigne repond du rendez-vous ;
                  il ne dit pas qui a travaille, et c'est pourtant lui seul que
                  la commission suivait. Aucune main cochee : on retombe sur lui. */}
              {ordonneEquipe(equipe.filter((m) => m.branchId === branch.id && m.auFauteuil)).length > 0 && (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 9, paddingTop: 9, borderTop: '1px dashed var(--hairline)' }}>
                  <span style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>
                    Mains
                  </span>
                  {ordonneEquipe(equipe.filter((m) => m.branchId === branch.id && m.auFauteuil)).map((m) => {
                    const pos = serviceIds.indexOf(sv.id);
                    const on = mainsDe(pos).includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        className={`trv-palier-chip ${on ? 'is-active' : ''}`}
                        style={{ fontSize: 11.5, padding: '3px 10px' }}
                        onClick={() => basculeMain(pos, m.id)}
                      >
                        {m.name}
                      </button>
                    );
                  })}
                  {mainsDe(serviceIds.indexOf(sv.id)).length === 0 && (
                    <span className="mnd-muted" style={{ fontSize: 11 }}>— {master || 'le maître assigné'}</span>
                  )}
                </div>
              )}
              </div>
            ))}
            <Select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  setServiceIds((ids) => [...ids, e.target.value]);
                }
              }}
              style={{ borderStyle: 'dashed', color: 'var(--copper-600)' }}
            >
              <option value="" disabled>
                + Ajouter une prestation…
              </option>
              {parAtelier.map((g) => (
                <optgroup key={g.cat.id} label={`${g.cat.fon} · ${g.cat.label}`}>
                  {g.list.map((sv) => (
                    <option key={sv.id} value={sv.id}>
                      {sv.name} · {priceModeOf(sv) === 'devis' ? 'sur devis' : argent(personalPriceXof(sv, pricing, services))}
                    </option>
                  ))}
                </optgroup>
              ))}
              {horsAtelier.length > 0 && (
                <optgroup label="Autres">
                  {horsAtelier.map((sv) => (
                    <option key={sv.id} value={sv.id}>
                      {sv.name} · {priceModeOf(sv) === 'devis' ? 'sur devis' : argent(personalPriceXof(sv, pricing, services))}
                    </option>
                  ))}
                </optgroup>
              )}
            </Select>
          </div>
        </div>

        {/* LA LONGUEUR TRAVAILLÉE — elle commande le prix et la durée des
            prestations qui s'y facturent, et se fige sur le rendez-vous. Elle ne
            paraît que si une prestation choisie la lit : ailleurs, un sélecteur
            qui ne commande rien n'est qu'une case de plus à remplir. */}
        {longueurPertinente && (
          <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', background: 'var(--copper-50)', padding: '11px 13px' }}>
            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--copper-700)', marginBottom: 8 }}>
              Longueur travaillée
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LONGUEURS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`trv-palier-chip ${longueur === l.id ? 'is-active' : ''}`}
                  title={l.hint}
                  onClick={() => setLongueur(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 7, lineHeight: 1.5 }}>
              {chosen.filter(suitLongueur).map((sv) => `${sv.name} · ${argent(personalPriceXof(sv, pricing, services))}`).join(' — ')}
            </div>
          </div>
        )}

        {coverageRows.length > 0 && (
          <div style={{ border: '1px solid var(--copper-300)', borderLeft: '3px solid var(--color-copper)', borderRadius: 'var(--radius-md)', background: 'var(--copper-50)', padding: '11px 13px' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: canCover ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                checked={effCovered}
                disabled={!canCover}
                onChange={(e) => setCovered(e.target.checked)}
                style={{ marginTop: 2, flex: 'none' }}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--copper-700)' }}>
                  Inclus dans l’abonnement — ne rien facturer
                </span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-soft)', marginTop: 3, lineHeight: 1.5 }}>
                  {coverageRows.map((r) => {
                    const label = r.remaining === null
                      ? 'illimité'
                      : (r.remaining ?? 0) > 0
                        ? `reste ${r.remaining} ce cycle`
                        : 'allocation épuisée';
                    return `${r.sv.name} · ${label}`;
                  }).join(' — ')}
                </span>
                {!canCover && (
                  <span style={{ display: 'block', fontSize: 11, color: '#8f3b30', marginTop: 3 }}>
                    Plus d’allocation sur le cycle en cours — le rituel sera facturé normalement.
                  </span>
                )}
              </span>
            </label>
          </div>
        )}

        <div className="tr-grid tr-grid--2">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Heure">
            <Select value={time} onChange={(e) => setTime(e.target.value)}>
              {!TIME_SLOTS.includes(time) && <option value={time}>{time}</option>}
              {TIME_SLOTS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="tr-grid tr-grid--2">
          <Field label="Maître au fauteuil">
            <Select value={master} onChange={(e) => setMaster(e.target.value)}>
              {branch.masters.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          {appt ? (
            <Field label="Statut">
              <Select value={status} onChange={(e) => setStatus(e.target.value as Appointment['status'])}>
                {RDV_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <span />
          )}
        </div>

        {overlap && (
          <div className="trc-overlap">
            Attention — {master} reçoit déjà {overlapName} à {overlap.time} ce jour-là. Les deux rituels se chevauchent ;
            vous pouvez tout de même enregistrer.
          </div>
        )}

        <Field label="Note du carnet">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Une attention, une préférence…" />
        </Field>

        {/* LES CHAMPS DE SAISIE AUSSI. Masquer les montants FORMATÉS ne suffisait
            pas : le montant du rituel et les remises sont des nombres bruts,
            qui passaient au travers. Un écran censé ne montrer aucun prix en
            montrait trois. */}
        {needsAmount && !effCovered && !sansPrix && (
          <Field label="Montant du rituel (F CFA)">
            <input
              className="mnd-input"
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={grossBase > 0 ? String(grossBase) : '—'}
              style={{ width: 180, textAlign: 'right' }}
              aria-label="Montant convenu du rituel"
            />
            <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
              Rituel à prix variable ou sur devis — saisissez le montant convenu.
              {grossBase > 0 ? ` À défaut, ${argent(grossBase)} (prix de départ${rdvPersonalized ? ' personnalisé' : ''}) sera retenu.` : ''}
            </div>
          </Field>
        )}

        {/* LE FORFAIT PONCTUEL — un total pour l'ensemble des gestes. Les
            prestations restent entières dessous : c'est leur montant qui porte
            les mains, la production, les commissions et le Bilan. */}
        {!effCovered && !sansPrix && (
          <Field label="Forfait — un total pour l’ensemble des gestes">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input type="checkbox" checked={forfaitOn} onChange={(e) => setForfaitOn(e.target.checked)} />
              Poser un forfait sur ce rituel
            </label>
            {forfaitOn && (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
                  <input
                    className="mnd-input"
                    value={forfaitNom}
                    onChange={(e) => setForfaitNom(e.target.value)}
                    placeholder="Forfait"
                    style={{ flex: '1 1 150px', minWidth: 0 }}
                    aria-label="Nom du forfait"
                  />
                  <input
                    className="mnd-input"
                    type="number"
                    min={0}
                    value={forfaitStr}
                    onChange={(e) => setForfaitStr(e.target.value)}
                    placeholder={String(effGross)}
                    style={{ width: 128, textAlign: 'right' }}
                    aria-label={`Total du forfait en ${currency}`}
                  />
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>soit</span>
                  <input
                    className="mnd-input"
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={forfaitPose ? forfaitPct : ''}
                    onChange={(e) => setForfaitParPct(e.target.value)}
                    style={{ width: 76, textAlign: 'right' }}
                    aria-label="Taux du forfait en pourcentage"
                  />
                  <span className="mnd-muted" style={{ fontSize: 11.5 }}>% sur {argent(effGross)}</span>
                </div>
                <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
                  Les prestations restent détaillées : chacune reçoit sa part du total, au prorata de
                  ce qu’elle vaut pour cette tête. Les mains, les primes, les commissions et le Bilan
                  continuent de compter juste. Un forfait remplace les remises.
                </div>
              </>
            )}
          </Field>
        )}

        {/* CE RITUEL EST-IL OFFERT ? Le geste vit sur le rendez-vous, et non sur
            la facture : c'est le rendez-vous que tout le monde relit. Rhanda a
            offert à Ahmed sa première visite — 110 000 F, le 2 mai 2026 — et la
            Maison n'avait aucun endroit où l'inscrire, sinon un compte famille
            qui l'aurait faite payeuse à vie. */}
        {!effCovered && !sansPrix && (
          <Field label="Rituel offert par une autre cliente">
            <ClientPicker
              value={offertPar}
              onChange={setOffertPar}
              placeholder="Personne — elle règle elle-même"
            />
            {offertPar && offertPar !== clientId && (
              <div className="trc-sub" style={{ marginTop: 6, lineHeight: 1.5 }}>
                La dépense et les points de fidélité iront à {nomDe(offertPar)} — c’est elle qui
                paie. Le rituel, lui, reste au parcours de {nomDe(clientId)}.
              </div>
            )}
            {offertPar && offertPar === clientId && (
              <div className="trc-sub" style={{ marginTop: 6, color: 'var(--copper-700)' }}>
                Elle ne peut pas s’offrir son propre rituel — laissez vide.
              </div>
            )}
          </Field>
        )}

        {/* Remise — accessible à la prise de RDV (tableau de bord, carnet, calendrier).
            Masquée quand le rituel est couvert par l'abonnement (rien à facturer)
            ou porté par un forfait (le total est déjà négocié). */}
        {!effCovered && !sansPrix && !forfaitPose && (
        <>
        <Field label="Remise sur le rituel (%)">
          <div style={{ display: 'flex', gap: 6 }}>
            {[0, 5, 10, 15, 20].map((p) => (
              <button
                key={p}
                type="button"
                className={`trc-disc ${discountPct === p ? 'is-on' : ''}`}
                onClick={() => setDiscountPct(p)}
              >
                {p === 0 ? 'Aucune' : `−${p}%`}
              </button>
            ))}
            <input
              className="mnd-input"
              type="number"
              min={0}
              max={100}
              value={discountPct}
              onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))}
              style={{ width: 68, textAlign: 'right' }}
              aria-label="Remise personnalisée"
            />
          </div>
        </Field>

        {/* Remise en CFA — geste de comptoir, retranchée après le pourcentage. */}
        <Field label={`Remise manuelle (${currency})`}>
          <input
            className="mnd-input"
            type="number"
            min={0}
            value={discountXof}
            onChange={(e) => setDiscountXof(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            style={{ width: 140, textAlign: 'right' }}
            placeholder="0"
            aria-label={`Remise manuelle en ${currency}`}
          />
        </Field>
        </>
        )}

        {/* LE PRIX D'ORIGINE FAIT FOI : le rituel a été facturé à CE prix-là et
            le garde, quoi que fasse le catalogue. Il ne se recalcule que si les
            prestations elles-mêmes changent — et on le dit AVANT d'enregistrer. */}
        {frozenDiffers && !servicesChanged && !refreshPrice && !sansPrix && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5 }}>
            Prix d’origine conservé : <b>{argent(frozenXof!)}</b> (au tarif d’aujourd’hui,
            ces prestations vaudraient {argent(grossBase)}). Il ne changera que si vous
            modifiez les prestations — ou si vous l’actualisez :
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setRefreshPrice(true)}
                style={{ cursor: 'pointer', background: 'var(--color-copper)', color: 'var(--color-ivoire)', border: 'none', borderRadius: 3, padding: '6px 12px', fontFamily: 'var(--font-sans)', fontSize: 11.5, fontWeight: 600 }}
              >
                Actualiser au tarif du jour ({argent(grossBase)})
              </button>
            </div>
          </div>
        )}
        {frozenDiffers && !servicesChanged && refreshPrice && !sansPrix && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5 }}>
            Ré-tarifé au tarif du jour : <b>{argent(grossBase)}</b> (ancien prix
            {' '}{argent(frozenXof!)}). Enregistrez pour figer ce nouveau prix ; ré-encaissez
            ensuite pour que la facture porte les mêmes montants.
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={() => setRefreshPrice(false)}
                style={{ cursor: 'pointer', background: 'none', color: 'var(--copper-700)', border: '1px solid var(--copper-300)', borderRadius: 3, padding: '6px 12px', fontFamily: 'var(--font-sans)', fontSize: 11.5 }}
              >
                Garder le prix d’origine
              </button>
            </div>
          </div>
        )}
        {typeof frozenXof === 'number' && servicesChanged && !needsAmount && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5 }}>
            Vous avez modifié les prestations : enregistrer recalculera ce rituel au tarif du jour
            ({argent(grossBase)}) — l’ancien prix de {argent(frozenXof)} sera abandonné.
          </div>
        )}
        {/* Prix PERSONNALISÉ — modèle (tranche de locks) × Juste Prix : annoncé
            avant d'enregistrer, puis figé sur le rendez-vous. */}
        {rdvPersonalized && !needsAmount && !keepFrozen && !effCovered && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)', background: 'var(--copper-50)', border: '1px solid var(--copper-300)', borderRadius: 'var(--radius-md)', padding: '9px 11px', lineHeight: 1.5 }}>
            Prix personnalisé : <b>{argent(grossBase)}</b>
            {pricing.band ? <> — modèle {bandLabel(pricing.band, bands)} (×{pricing.band.coef})</> : null}
            {pricing.clientCoef !== 1 ? <> · Juste Prix ×{pricing.clientCoef}</> : null}
            {grossBase !== grossCatalogue ? <> · catalogue {argent(grossCatalogue)}</> : null}.
            Il sera figé sur ce rendez-vous à l’enregistrement.
          </div>
        )}

        {/* LE RÉCAPITULATIF ENTIER SE TAIT. Le laisser avec des tirets partout
            n'apprend rien et donne l'air d'un écran cassé : mieux vaut qu'il
            n'y soit pas. */}
        {!sansPrix && (
        <div className="trc-total">
          {effCovered ? (
            <div className="trc-total__row">
              <span>Inclus dans l’abonnement</span>
              <span className="trc-total__num" style={{ color: 'var(--copper-700)' }}>Rien à facturer</span>
            </div>
          ) : (
          <>
          {/* Remise « prix d'origine conservé » : prix du jour plein, puis l'écart
              figé retranché — la remise reste LISIBLE (comme sur la facture). */}
          {frozenRemiseXof > 0 && (
            <>
              <div className="trc-total__row">
                <span>Prix du jour</span>
                <span className="trc-total__num">{argent(grossBase)}</span>
              </div>
              <div className="trc-total__row">
                <span>Remise · prix d’origine conservé</span>
                <span className="trc-total__num" style={{ color: 'var(--copper-700)' }}>−{argent(frozenRemiseXof)}</span>
              </div>
            </>
          )}
          {forfaitPose && (
            <div className="trc-total__row">
              <span>{forfaitNom.trim() || 'Forfait'} · au lieu de {argent(effGross)}</span>
              <span className="trc-total__num" style={{ color: 'var(--copper-700)' }}>
                −{argent(Math.max(0, effGross - forfaitNum))}
              </span>
            </div>
          )}
          {!forfaitPose && (discountPct > 0 || discountXof > 0) && (
            <div className="trc-total__row">
              <span>
                Sous-total
                {discountPct > 0 ? ` · remise −${discountPct}%` : ''}
                {discountXof > 0 ? ` · remise −${argent(discountXof)}` : ''}
              </span>
              <span className="trc-total__num"><s style={{ color: 'var(--ink-soft)' }}>{argent(effGross)}</s></span>
            </div>
          )}
          <div className="trc-total__row">
            <span>Total prestations</span>
            <span className="trc-total__num">{argent(totalXof)}</span>
          </div>
          </>
          )}
          {hasDeposit && (
            <div className="trc-total__row">
              <span>
                Acompte demandé{depositPct !== null ? ` · ${depositPct} %` : ' · taux variables'}
                {depositServiceIds.length < chosen.length ? ' (partiel)' : ''}
                {' · à vérifier à l’encaissement'}
              </span>
              <span className="trc-total__num">{argent(depositXof)}</span>
            </div>
          )}
        </div>
        )}

        {error && (
          <div style={{ fontSize: 12, color: 'var(--copper-700)' }}>{error}</div>
        )}

        {appt ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="copper" onClick={() => save(status)}>
              Enregistrer les modifications
            </Button>
            {onEncaisser && (
              <Button variant="ghost" onClick={() => onEncaisser(appt)}>
                Encaisser ou poser un acompte
              </Button>
            )}
            {appt.status !== 'annulé' && (
              <Button variant="ghost" onClick={cancelRdv}>
                Annuler le rendez-vous
              </Button>
            )}
            <Button variant="ghost" onClick={remove} style={{ color: 'var(--copper-700)' }}>
              Supprimer le rendez-vous
            </Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Button variant="copper" onClick={() => save('confirmé')}>
              {hasDeposit ? 'Confirmer & demander l’acompte' : 'Confirmer le rendez-vous'}
            </Button>
            <Button variant="ghost" onClick={() => save('en attente')}>
              Enregistrer en attente
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------- Sélecteur de cliente — recherche par nom / téléphone ----------

   `allowWalkIn` : la vente ANONYME au comptoir (un flacon vendu à quelqu'un qui
   passe). Aucune fiche, aucun nom — et c'est légitime, personne n'a à décliner
   son identité pour acheter un sérum.

   `allowPassage` : la cliente DE PASSAGE, qui elle reçoit un geste. Son rituel
   doit compter dans la production du maître, donc il lui faut une fiche — mais
   deux champs suffisent, et le comptoir ne doit pas quitter son écran pour les
   saisir. Voir `Client.dePassage`. */
export function ClientPicker({
  value,
  onChange,
  placeholder = 'Rechercher une cliente…',
  allowWalkIn = false,
  allowPassage = false,
}: {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  allowWalkIn?: boolean;
  allowPassage?: boolean;
}) {
  const clients = useBranchClients();
  const { branch } = useBranch();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  /* null = menu ; objet = le petit formulaire de passage, ouvert par-dessus. */
  const [passage, setPassage] = useState<{ name: string; phone: string } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const selected = clients.find((c) => c.id === value);
  const digits = (s: string) => s.replace(/\D/g, '');
  const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const q = query.trim();
  const qn = norm(q);
  const qd = digits(q);
  /* TOUT le CRM, trié : le menu défile. Aucun plafond — taper les premières lettres
     filtre par nom (insensible aux accents : « agnes » trouve « Agnès ») OU par
     téléphone. Le filtre téléphone ne s'applique QUE si la recherche contient des
     chiffres — sinon `digits(c.phone).includes('')` renvoie vrai pour TOUTES les
     clientes et le filtre par nom ne servait à rien (le bug « rien ne se filtre »). */
  const results = useMemo(() => {
    const base = q
      ? clients.filter((c) => norm(c.name).includes(qn) || (qd !== '' && digits(c.phone).includes(qd)))
      : clients;
    return [...base].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [clients, q, qn, qd]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setPassage(null); }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  /* Ce qui est déjà tapé n'est pas perdu : des chiffres remplissent le
     téléphone, des lettres le prénom. Le comptoir a commencé à chercher — il
     ne recommence pas parce que la fiche n'existait pas. */
  const ouvrePassage = () => {
    const chiffres = digits(q);
    setPassage({
      name: chiffres === q ? '' : q,
      phone: chiffres.length >= 4 ? q.trim() : `${branch.dial} `,
    });
  };

  const enregistrePassage = () => {
    const nom = (passage?.name ?? '').trim();
    if (!nom) return;
    const c = clienteDePassage({
      branchId: branch.id,
      name: nom,
      phone: passage?.phone,
      city: branch.city,
      since: todayISO(),
      /* Elle entre par le seuil comme les autres — le persona dit son goût, pas
         son statut ; les deux notions ne se remplacent pas. */
      persona: ensureInitiePersona(),
    });
    clientsStore.set((prev) => [...prev, c]);
    onChange(c.id);
    setPassage(null);
    setOpen(false);
    setQuery('');
  };

  const display = open ? query : selected?.name ?? (value === 'walkin' && allowWalkIn ? 'Vente au comptoir' : '');

  return (
    <div className="trc-clientpick" ref={wrapRef}>
      <input
        className="mnd-input"
        value={display}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
      />
      {open && passage && (
        <div className="trc-clientpick__menu trc-passage" role="dialog" aria-label="Cliente de passage">
          <div className="trc-passage__head">
            Cliente de passage — prénom et téléphone, rien de plus.
          </div>
          <input
            className="mnd-input"
            autoFocus
            value={passage.name}
            placeholder="Prénom"
            aria-label="Prénom de la cliente de passage"
            onChange={(e) => setPassage({ ...passage, name: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enregistrePassage(); } }}
          />
          <input
            className="mnd-input"
            value={passage.phone}
            placeholder="Téléphone"
            inputMode="tel"
            aria-label="Téléphone de la cliente de passage"
            onChange={(e) => setPassage({ ...passage, phone: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); enregistrePassage(); } }}
          />
          <div className="trc-passage__foot">
            <button type="button" className="trc-passage__cancel" onClick={() => setPassage(null)}>Annuler</button>
            <Button variant="copper" onClick={enregistrePassage} disabled={!passage.name.trim()}>Enregistrer</Button>
          </div>
          <div className="trc-passage__note">
            Son rituel comptera au chiffre et à la production du maître. Elle
            restera hors des têtes actives et des relances jusqu’à sa 2ᵉ venue.
          </div>
        </div>
      )}
      {open && !passage && (
        <div className="trc-clientpick__menu" role="listbox">
          {allowPassage && (
            <button type="button" className="trc-clientpick__opt" onClick={ouvrePassage}>
              <span className="trc-clientpick__n">＋ Cliente de passage</span>
              <span className="trc-clientpick__m">prénom + téléphone</span>
            </button>
          )}
          {allowWalkIn && (
            <button type="button" className="trc-clientpick__opt" onClick={() => { onChange('walkin'); setOpen(false); }}>
              <span className="trc-clientpick__n">Vente au comptoir</span>
              <span className="trc-clientpick__m">sans fiche</span>
            </button>
          )}
          {results.map((c) => (
            <button key={c.id} type="button" className="trc-clientpick__opt" onClick={() => { onChange(c.id); setOpen(false); }}>
              <span className="trc-clientpick__n">{c.name}</span>
              <span className="trc-clientpick__m">
                {estDePassage(c) ? 'de passage · ' : ''}{c.phone || c.city}
              </span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="trc-clientpick__empty">Aucune cliente — {q ? 'affinez la recherche' : 'ajoutez-en une'}.</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Ce qu'il y a derrière un chiffre ----------
   Un indice du pilotage (un KPI, une barre, une part de camembert) n'est jamais
   qu'une somme : cette modale montre les lignes qui la composent, et chaque ligne
   qui porte une facture l'ouvre. Partagée par le Tableau de bord et Analytics —
   deux écrans, un seul geste. */

export type DrillRow = {
  date?: string; who: string; sub?: string; amount?: number;
  /** La ligne ouvre sa facture. */
  invoiceId?: string;
  /** …ou creuse d'un cran (une semaine s'ouvre sur un jour). Prime sur `invoiceId`. */
  onOpen?: () => void;
};
export type Drill = { title: string; sub?: string; rows: DrillRow[]; total?: number };

export function DrillModal({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const navigate = useNavigate();
  const { currency } = useBranch();
  return (
    <Modal title={drill.title} onClose={onClose} width={620}>
      {drill.sub && <div className="mnd-muted" style={{ fontSize: 12, marginBottom: 12 }}>{drill.sub}</div>}
      {drill.rows.length === 0 ? (
        <div className="trp-empty">Rien à montrer ici.</div>
      ) : (
        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {drill.rows.map((r, i) => {
            const body = (
              <>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, color: 'var(--ink)' }}>{r.who}</div>
                  {r.sub && <div className="mnd-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{r.sub}</div>}
                </div>
                <div style={{ textAlign: 'right', flex: 'none' }}>
                  {r.amount !== undefined && (
                    <div className="mnd-serif" style={{ fontSize: 15, color: 'var(--color-indigo)' }}>
                      {fmtMoney(r.amount, currency)}
                    </div>
                  )}
                  {r.date && <div className="mnd-muted" style={{ fontSize: 11 }}>{frShort(r.date)}</div>}
                </div>
              </>
            );
            /* `border: none` d'abord, puis la seule bordure qu'on garde :
               l'inverse annulerait le trait sur les lignes-boutons. */
            const st = {
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              gap: 12, padding: '9px 0',
              width: '100%', textAlign: 'left' as const, background: 'none',
              border: 'none', borderBottom: '1px solid var(--hairline)',
              font: 'inherit', color: 'inherit',
            };
            /* La ligne s'ouvre sur sa facture, ou creuse d'un cran. Une fidélisée
               ou un rituel jamais encaissé n'a ni l'un ni l'autre : elle reste une
               ligne plutôt qu'un bouton qui ne mène nulle part. */
            const open = r.onOpen ?? (r.invoiceId ? () => { onClose(); navigate(`/factures?id=${r.invoiceId}`); } : null);
            return open ? (
              <button
                key={`${r.who}-${r.date ?? ''}-${i}`}
                style={{ ...st, cursor: 'pointer' }}
                title={r.invoiceId && !r.onOpen ? 'Ouvrir la facture' : 'Voir le détail'}
                onClick={open}
              >
                {body}
              </button>
            ) : (
              <div key={`${r.who}-${r.date ?? ''}-${i}`} style={st}>{body}</div>
            );
          })}
        </div>
      )}
      {drill.total !== undefined && drill.rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-argile)' }}>
          <span style={{ fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-soft)' }}>Total</span>
          <span className="mnd-serif" style={{ fontSize: 22, color: 'var(--color-indigo)' }}>{fmtMoney(drill.total, currency)}</span>
        </div>
      )}
    </Modal>
  );
}
