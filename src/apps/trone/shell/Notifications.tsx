import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell, CalendarClock, ClipboardList, Clock, Crown, FileCheck2, PackageSearch, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { useBranch } from '../../../shared/branches';
import { useAppointments, type Appointment } from '../../../shared/agenda';
import { askNotifyPermission, notifyLocal } from '../../../shared/ics';
import { useInvoices, invoiceTotal } from '../../../shared/finance';
import { useProducts } from '../../../shared/catalog';
import { useClients } from '../../../shared/clients';
import { consultationsQueueStore } from '../../../shared/bridges';
import { useStore } from '../../../shared/store';
import { useSettings } from '../../../shared/settings';
import { fmtMoney } from '../../../shared/currency';

/* La Cloche — notifications réelles dérivées des magasins de la branche courante.
   Rien de codé en dur : le compteur reflète les signaux vivants de la Maison. */

type NotifKind = 'consultation' | 'attente' | 'rdv' | 'devis' | 'stock' | 'impaye' | 'couronne';

type Notif = {
  id: string;
  kind: NotifKind;
  label: string;
  meta?: string;
  to: string;
};

const ICONS: Record<NotifKind, LucideIcon> = {
  consultation: ClipboardList,
  attente: Clock,
  rdv: CalendarClock,
  devis: FileCheck2,
  stock: PackageSearch,
  impaye: Wallet,
  couronne: Crown,
};

/* ---------- Dates ---------- */
const pad2 = (n: number) => String(n).padStart(2, '0');
const isoOffset = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const frShort = (iso: string) => {
  const s = new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Écart relatif éditorial depuis un horodatage : « à l'instant », « il y a 3 h », « hier ». */
const relTime = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'hier';
  if (d < 30) return `il y a ${d} j`;
  return `il y a ${Math.round(d / 30)} mois`;
};

/** Dérive la liste des notifications pertinentes pour la branche courante. */
function useNotifications(): Notif[] {
  const { branch, currency } = useBranch();
  const [appointments] = useAppointments();
  const [invoices] = useInvoices();
  const [products] = useProducts();
  const [clients] = useClients();
  const [queue] = useStore(consultationsQueueStore);
  const [settings] = useSettings();

  const t = settings.toggles;
  const okRdv = t.notifRdv !== false;
  const okStock = t.notifStock !== false;
  const okPaie = t.notifPaie !== false;

  return useMemo(() => {
    const out: Notif[] = [];
    const nameOf = new Map(clients.map((c) => [c.id, c.name]));
    const today = isoOffset(0);
    const horizon = isoOffset(3); // aujourd'hui + 3 jours

    // 1 — Consultations en ligne nouvelles (La Consultation Souveraine).
    for (const c of queue) {
      if (c.status !== 'nouvelle') continue;
      out.push({
        id: `cons-${c.id}`,
        kind: 'consultation',
        label: `Nouvelle consultation — ${c.client.name}`,
        meta: relTime(c.createdAt),
        to: '/consultations',
      });
    }

    // 2 — Rendez-vous (acompte en attente, aujourd'hui, à venir sous 3 jours).
    if (okRdv) {
      const appts = appointments
        .filter((a) => a.branchId === branch.id && a.status !== 'annulé' && a.status !== 'honoré')
        .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
      for (const a of appts) {
        const who = nameOf.get(a.clientId) ?? 'une tête couronnée';
        if (a.status === 'en attente') {
          out.push({
            id: `att-${a.id}`, kind: 'attente',
            label: `Acompte en attente — ${who}`,
            meta: `${frShort(a.date)} · ${a.time}`, to: '/calendrier',
          });
        } else if (a.date === today) {
          out.push({
            id: `rdv-${a.id}`, kind: 'rdv',
            label: `Rendez-vous aujourd’hui — ${who}`,
            meta: a.time, to: '/calendrier',
          });
        } else if (a.date > today && a.date <= horizon) {
          out.push({
            id: `rdv-${a.id}`, kind: 'rdv',
            label: `Rendez-vous ${frShort(a.date)} — ${who}`,
            meta: a.time, to: '/calendrier',
          });
        }
      }
    }

    // 3 — Devis acceptés à transformer en facture.
    for (const inv of invoices) {
      if (inv.branchId !== branch.id || inv.kind !== 'devis' || inv.status !== 'acceptée') continue;
      const who = inv.clientName ?? nameOf.get(inv.clientId) ?? 'une tête couronnée';
      out.push({
        id: `devis-${inv.id}`, kind: 'devis',
        label: `Devis accepté — ${who}`,
        meta: `${inv.number} · ${fmtMoney(invoiceTotal(inv), currency)}`, to: '/factures',
      });
    }

    // 4 — Factures envoyées non réglées (best-effort, sous notifPaie).
    if (okPaie) {
      for (const inv of invoices) {
        if (inv.branchId !== branch.id || inv.kind !== 'facture' || inv.status !== 'envoyée') continue;
        const who = inv.clientName ?? nameOf.get(inv.clientId) ?? 'une tête couronnée';
        out.push({
          id: `imp-${inv.id}`, kind: 'impaye',
          label: `Facture en attente — ${who}`,
          meta: `${inv.number} · ${fmtMoney(invoiceTotal(inv), currency)}`, to: '/factures',
        });
      }
    }

    // 5 — Produits en stock bas (< 10). Le catalogue est commun à la Maison.
    if (okStock) {
      for (const p of products) {
        if (p.stock >= 10) continue;
        out.push({
          id: `stock-${p.id}`, kind: 'stock',
          label: `Stock bas — ${p.name}`,
          meta: p.stock <= 0 ? 'rupture' : `${p.stock} en réserve`, to: '/catalogue',
        });
      }
    }

    return out;
  }, [appointments, invoices, products, clients, queue, branch.id, currency, okRdv, okStock, okPaie]);
}

/* ---------- Veille Ma Couronne — alerte active à l'arrivée d'une réservation ----------
   On mémorise (ref) les rendez-vous déjà vus : id → « date heure ». Au premier passage,
   rien n'est signalé (pas d'orage au chargement) ; ensuite, un id inconnu venu de
   Ma Couronne déclenche une notification locale + un item en tête de cloche, et un id
   connu dont date/heure a changé signale une modification par la cliente. */
function useCouronneAlerts(): Notif[] {
  const [appointments] = useAppointments();
  const [clients] = useClients();
  const [alerts, setAlerts] = useState<Notif[]>([]);
  const seenRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    const stampOf = (a: Appointment) => `${a.date} ${a.time}`;

    if (seenRef.current === null) {
      seenRef.current = new Map(appointments.map((a) => [a.id, stampOf(a)]));
      return;
    }

    const seen = seenRef.current;
    const fresh: Notif[] = [];

    for (const a of appointments) {
      const stamp = stampOf(a);
      const prev = seen.get(a.id);
      seen.set(a.id, stamp);
      if (a.source !== 'couronne' || a.status === 'annulé') continue;

      const who = clients.find((c) => c.id === a.clientId)?.name ?? 'Cliente';
      const when = `${frShort(a.date)} · ${a.time}`;

      if (prev === undefined) {
        notifyLocal('Nouvelle réservation · Ma Couronne', `${who} · ${frShort(a.date)} ${a.time}`);
        fresh.push({
          id: `mc-new-${a.id}-${stamp}`, kind: 'couronne',
          label: 'Nouvelle réservation · Ma Couronne',
          meta: `${who} · ${when}`, to: '/calendrier',
        });
      } else if (prev !== stamp) {
        notifyLocal('Rendez-vous modifié par la cliente', `${who} · ${frShort(a.date)} ${a.time}`);
        fresh.push({
          id: `mc-mod-${a.id}-${stamp}`, kind: 'couronne',
          label: 'Rendez-vous modifié par la cliente',
          meta: `${who} · ${when}`, to: '/calendrier',
        });
      }
    }

    if (fresh.length > 0) setAlerts((cur) => [...fresh, ...cur].slice(0, 8));
  }, [appointments, clients]);

  return alerts;
}

export default function NotificationsBell() {
  const derived = useNotifications();
  const alerts = useCouronneAlerts();
  const items = useMemo(() => [...alerts, ...derived], [alerts, derived]);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [permState, setPermState] = useState<NotificationPermission | 'unsupported'>(
    () => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'),
  );

  const enableAlerts = async () => {
    await askNotifyPermission();
    setPermState('Notification' in window ? Notification.permission : 'unsupported');
  };
  const wrapRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  const count = items.length;

  // Fermeture au clic extérieur + Échap (avec retour du focus à la cloche).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        bellRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  return (
    <div className="tr-notif" ref={wrapRef}>
      <button
        ref={bellRef}
        className="tr-top__bell"
        aria-label={`Notifications${count ? ` (${count})` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={15} />
        {count > 0 && <span className="tr-top__bell-count">{count}</span>}
      </button>

      {open && (
        <div className="tr-notif__panel" role="dialog" aria-label="Notifications">
          <div className="tr-notif__head">
            <span className="mnd-serif">Le guet de la Maison</span>
            {count > 0 && <span className="tr-notif__badge">{count}</span>}
          </div>

          {permState === 'default' && (
            <button className="tr-notif__perm" onClick={enableAlerts}>
              Activer les alertes sur cet appareil
            </button>
          )}

          {count === 0 ? (
            <div className="tr-notif__empty">Rien à signaler — la Maison veille.</div>
          ) : (
            <div className="tr-notif__list" role="menu">
              {items.map((n) => {
                const Icon = ICONS[n.kind];
                return (
                  <button
                    key={n.id}
                    className="tr-notif__item"
                    role="menuitem"
                    onClick={() => go(n.to)}
                  >
                    <span className={`tr-notif__dot tr-notif__dot--${n.kind}`}>
                      <Icon size={13} />
                    </span>
                    <span className="tr-notif__body">
                      <span className="tr-notif__label">{n.label}</span>
                      {n.meta && <span className="tr-notif__meta">{n.meta}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
