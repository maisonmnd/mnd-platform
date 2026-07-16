import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlarmClock, Bell, CalendarClock, ClipboardList, Clock, Crown, FileCheck2,
  KeyRound, PackageSearch, Radio, UserPlus, Wallet, type LucideIcon,
} from 'lucide-react';
import { useBranch } from '../../../shared/branches';
import { useAppointments, type Appointment } from '../../../shared/agenda';
import { askNotifyPermission, notifyLocal } from '../../../shared/ics';
import { useInvoices, invoiceTotal } from '../../../shared/finance';
import { useProducts } from '../../../shared/catalog';
import { useClients } from '../../../shared/clients';
import { consultationsQueueStore } from '../../../shared/bridges';
import { createStore, useStore } from '../../../shared/store';
import { useSettings } from '../../../shared/settings';
import { useClientSessions, isOnline } from '../../../shared/activity';
import { fmtMoney } from '../../../shared/currency';
import { useAuth } from '../../../shared/auth';
import { enablePush, ensurePush, registerSW, pushSupported, clearAppNotifications } from '../../../shared/push';

/* La Cloche — notifications réelles dérivées des magasins de la branche courante,
   avec état LU/NON-LU persistant : le compteur ne compte que les non-lues, ouvrir
   la cloche marque comme lues, et les événements clés déclenchent aussi une
   notification navigateur (consultation, prospect, inscription, RDV imminent,
   réservation Ma Couronne). */

/* ids des notifications déjà lues — persistant localement (préférence par appareil). */
const readNotifsStore = createStore<string[]>('mnd_notif_read', []);
/* ids des notifications EFFACÉES (masquées de la liste + hors compteur). */
const dismissedNotifsStore = createStore<string[]>('mnd_notif_dismissed', []);

type NotifKind =
  | 'consultation' | 'prospect' | 'inscription' | 'enligne'
  | 'attente' | 'rdv' | 'imminent' | 'devis' | 'stock' | 'impaye' | 'couronne';

type Notif = { id: string; kind: NotifKind; label: string; meta?: string; to: string };

const ICONS: Record<NotifKind, LucideIcon> = {
  consultation: ClipboardList,
  prospect: UserPlus,
  inscription: KeyRound,
  enligne: Radio,
  attente: Clock,
  rdv: CalendarClock,
  imminent: AlarmClock,
  devis: FileCheck2,
  stock: PackageSearch,
  impaye: Wallet,
  couronne: Crown,
};

/* Événements qui déclenchent aussi une notification navigateur (les plus importants). */
const PUSH_KINDS = new Set<NotifKind>(['consultation', 'prospect', 'inscription', 'imminent', 'couronne']);

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
  const [sessions] = useClientSessions();
  const [settings] = useSettings();

  /* Battement : « dans 1h » et « en ligne » doivent se rafraîchir avec le temps. */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 30000);
    return () => window.clearInterval(t);
  }, []);

  const tg = settings.toggles;
  const okRdv = tg.notifRdv !== false;
  const okStock = tg.notifStock !== false;
  const okPaie = tg.notifPaie !== false;

  return useMemo(() => {
    void tick;
    const out: Notif[] = [];
    const nameOf = new Map(clients.map((c) => [c.id, c.name]));
    const today = isoOffset(0);
    const horizon = isoOffset(3);
    const now = Date.now();

    // 1 — Consultations en ligne nouvelles (La Consultation Souveraine).
    for (const c of queue) {
      if (c.status !== 'nouvelle') continue;
      out.push({
        id: `cons-${c.id}`, kind: 'consultation',
        label: `Nouvelle consultation — ${c.client.name}`,
        meta: relTime(c.createdAt), to: '/consultations',
      });
    }

    // 2 — Prospects à qualifier (créés depuis une consultation en ligne).
    for (const c of clients) {
      if (c.branchId !== branch.id || c.archived) continue;
      if (!c.segments.includes('Prospect')) continue;
      out.push({
        id: `prospect-${c.id}`, kind: 'prospect',
        label: `Nouvelle cliente en consultation — ${c.name}`,
        meta: 'prospect · à qualifier', to: '/customers',
      });
    }

    // 3 — Nouvelles inscriptions Ma Couronne (compte créé aujourd'hui).
    for (const c of clients) {
      if (c.branchId !== branch.id || c.archived) continue;
      if (!c.segments.includes('Ma Couronne') || (c.since ?? '') !== today) continue;
      out.push({
        id: `insc-${c.id}`, kind: 'inscription',
        label: `Nouvelle inscription Ma Couronne — ${c.name}`,
        meta: 'compte créé aujourd’hui', to: '/customers',
      });
    }

    // 4 — Clientes en ligne maintenant sur Ma Couronne.
    const onlineIds = new Set<string>();
    for (const s of sessions) if (isOnline(s)) onlineIds.add(s.clientId);
    for (const c of clients) {
      if (c.branchId !== branch.id || c.archived || !onlineIds.has(c.id)) continue;
      out.push({
        id: `online-${c.id}`, kind: 'enligne',
        label: `En ligne · Ma Couronne — ${c.name}`,
        meta: 'connectée maintenant', to: '/customers',
      });
    }

    // 5 — Rendez-vous : imminent (≤ 1h), acompte en attente, aujourd'hui, à venir (3 j).
    if (okRdv) {
      const appts = appointments
        .filter((a) => a.branchId === branch.id && a.status !== 'annulé' && a.status !== 'honoré')
        .sort((a, b) => (a.date === b.date ? a.time.localeCompare(b.time) : a.date.localeCompare(b.date)));
      for (const a of appts) {
        const who = nameOf.get(a.clientId) ?? 'une tête couronnée';
        const when = new Date(`${a.date}T${a.time}:00`).getTime();
        const mins = Math.round((when - now) / 60000);
        if (a.date === today && mins >= 0 && mins <= 60) {
          out.push({
            id: `imm-${a.id}`, kind: 'imminent',
            label: mins <= 1 ? `Rendez-vous maintenant — ${who}` : `Rendez-vous dans ${mins} min — ${who}`,
            meta: a.time, to: '/calendrier',
          });
        } else if (a.status === 'en attente') {
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

    // 6 — Devis acceptés à transformer en facture.
    for (const inv of invoices) {
      if (inv.branchId !== branch.id || inv.kind !== 'devis' || inv.status !== 'acceptée') continue;
      const who = inv.clientName ?? nameOf.get(inv.clientId) ?? 'une tête couronnée';
      out.push({
        id: `devis-${inv.id}`, kind: 'devis',
        label: `Devis accepté — ${who}`,
        meta: `${inv.number} · ${fmtMoney(invoiceTotal(inv), currency)}`, to: '/factures',
      });
    }

    // 7 — Factures envoyées non réglées.
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

    // 8 — Produits en stock bas (< 10).
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
  }, [appointments, invoices, products, clients, queue, sessions, branch.id, currency, okRdv, okStock, okPaie, tick]);
}

/* ---------- Veille Ma Couronne — alerte active à l'arrivée d'une réservation ---------- */
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

      const who = clients.find((c) => c.id === a.clientId)?.name ?? a.clientName ?? 'Cliente';
      const when = `${frShort(a.date)} · ${a.time}`;

      if (prev === undefined) {
        fresh.push({
          id: `mc-new-${a.id}-${stamp}`, kind: 'couronne',
          label: 'Nouvelle réservation · Ma Couronne',
          meta: `${who} · ${when}`, to: '/calendrier',
        });
      } else if (prev !== stamp) {
        fresh.push({
          id: `mc-mod-${a.id}-${stamp}`, kind: 'couronne',
          label: 'Rendez-vous modifié par la cliente',
          meta: `${who} · ${when}`, to: '/calendrier',
        });
      }
    }

    if (fresh.length > 0) setAlerts((cur) => [...fresh, ...cur].slice(0, 12));
  }, [appointments, clients]);

  return alerts;
}

/* Notification navigateur pour chaque nouvel événement clé (après le premier chargement). */
function useBrowserDelivery(items: Notif[]): void {
  const seenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (seenRef.current === null) {
      seenRef.current = new Set(items.map((n) => n.id));
      return;
    }
    const seen = seenRef.current;
    for (const n of items) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      if (PUSH_KINDS.has(n.kind)) notifyLocal(n.label, n.meta ?? '');
    }
  }, [items]);
}

export default function NotificationsBell() {
  const derived = useNotifications();
  const alerts = useCouronneAlerts();
  const items = useMemo(() => {
    const seen = new Set<string>();
    return [...alerts, ...derived].filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
  }, [alerts, derived]);

  useBrowserDelivery(items);

  const [read] = useStore(readNotifsStore);
  const [dismissed] = useStore(dismissedNotifsStore);
  const readSet = useMemo(() => new Set(read), [read]);
  const dismissedSet = useMemo(() => new Set(dismissed), [dismissed]);
  /* Notifications visibles = non effacées. Le compteur ne compte que les visibles non lues. */
  const visible = useMemo(() => items.filter((n) => !dismissedSet.has(n.id)), [items, dismissedSet]);
  const unreadCount = useMemo(() => visible.reduce((n, it) => n + (readSet.has(it.id) ? 0 : 1), 0), [visible, readSet]);
  const readVisibleCount = useMemo(() => visible.reduce((n, it) => n + (readSet.has(it.id) ? 1 : 0), 0), [visible, readSet]);

  const navigate = useNavigate();
  const { session } = useAuth();
  const staffUid = session?.user?.id;
  const [open, setOpen] = useState(false);
  const [permState, setPermState] = useState<NotificationPermission | 'unsupported'>(
    () => (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'),
  );

  /* Web Push personnel : enregistre le service worker et (ré)abonne ce membre du
     personnel s'il a déjà autorisé — pour recevoir les alertes Le Trône fermé. */
  useEffect(() => {
    if (!staffUid || !pushSupported()) return;
    void registerSW();
    void ensurePush(staffUid);
  }, [staffUid]);

  /* Vide le tiroir + badge d'icône à CHAQUE reprise de l'app (ouverture, focus,
     retour BFCache) — le badge Samsung retombe car il suit le tiroir. */
  useEffect(() => {
    const clear = () => { void clearAppNotifications(); };
    clear();
    const onVis = () => { if (!document.hidden) clear(); };
    window.addEventListener('focus', clear);
    window.addEventListener('pageshow', clear);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', clear);
      window.removeEventListener('pageshow', clear);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const markRead = (id: string) =>
    readNotifsStore.set((prev) => (prev.includes(id) ? prev : [...prev, id].slice(-800)));
  const markAllRead = () =>
    readNotifsStore.set((prev) => {
      const s = new Set(prev);
      for (const n of visible) s.add(n.id);
      return [...s].slice(-800);
    });
  /* Effacer = masquer de la liste et sortir du compteur (persistant). */
  const dismiss = (id: string) =>
    dismissedNotifsStore.set((prev) => (prev.includes(id) ? prev : [...prev, id].slice(-1200)));
  const dismissRead = () =>
    dismissedNotifsStore.set((prev) => {
      const s = new Set(prev);
      for (const n of visible) if (readSet.has(n.id)) s.add(n.id);
      return [...s].slice(-1200);
    });
  const dismissAll = () =>
    dismissedNotifsStore.set((prev) => {
      const s = new Set(prev);
      for (const n of visible) s.add(n.id);
      return [...s].slice(-1200);
    });

  const enableAlerts = async () => {
    await askNotifyPermission();
    /* Abonne aussi ce membre du personnel au Web Push → alertes même Le Trône fermé. */
    if (staffUid && pushSupported()) await enablePush(staffUid);
    setPermState('Notification' in window ? Notification.permission : 'unsupported');
  };
  const wrapRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  /* Ouvrir la cloche = « lire » : on marque tout comme lu → le badge retombe. */
  /* Ouvrir la cloche NE marque PAS tout lu automatiquement : les non-lues restent
     en gras jusqu'à ce qu'on les touche. On vide seulement le tiroir/badge d'icône
     (on est en train de « regarder » les notifications sur le téléphone). */
  useEffect(() => {
    if (open) void clearAppNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Fermeture au clic extérieur + Échap.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); bellRef.current?.focus(); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const go = (n: Notif) => {
    markRead(n.id);
    setOpen(false);
    navigate(n.to);
  };

  return (
    <div className="tr-notif" ref={wrapRef}>
      <button
        ref={bellRef}
        className="tr-top__bell"
        aria-label={`Notifications${unreadCount ? ` (${unreadCount})` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={15} />
        {unreadCount > 0 && <span className="tr-top__bell-count">{unreadCount}</span>}
      </button>

      {open && (
        <div className="tr-notif__panel" role="dialog" aria-label="Notifications">
          <div className="tr-notif__head">
            <span className="mnd-serif">Le guet de la Maison</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'center' }}>
              {unreadCount > 0 && (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '.04em', color: 'var(--color-indigo)' }}
                  onClick={markAllRead}
                >
                  Tout marquer comme lu
                </button>
              )}
              {readVisibleCount > 0 && (
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, letterSpacing: '.04em', color: 'var(--ink-soft)' }}
                  onClick={unreadCount === 0 ? dismissAll : dismissRead}
                >
                  {unreadCount === 0 ? 'Tout effacer' : 'Effacer les lues'}
                </button>
              )}
            </div>
          </div>

          {permState === 'default' && (
            <button className="tr-notif__perm" onClick={enableAlerts}>
              Activer les alertes sur cet appareil
            </button>
          )}

          {visible.length === 0 ? (
            <div className="tr-notif__empty">Rien à signaler — la Maison veille.</div>
          ) : (
            <div className="tr-notif__list" role="menu">
              {visible.map((n) => {
                const Icon = ICONS[n.kind];
                const unread = !readSet.has(n.id);
                return (
                  <div key={n.id} style={{ display: 'flex', alignItems: 'stretch' }}>
                    <button
                      className="tr-notif__item"
                      role="menuitem"
                      onClick={() => go(n)}
                      style={{ flex: 1, minWidth: 0, ...(unread ? {} : { opacity: 0.55 }) }}
                    >
                      <span className={`tr-notif__dot tr-notif__dot--${n.kind}`}>
                        <Icon size={13} />
                      </span>
                      <span className="tr-notif__body">
                        <span className="tr-notif__label" style={{ fontWeight: unread ? 600 : 400 }}>
                          {n.label}
                        </span>
                        {n.meta && <span className="tr-notif__meta">{n.meta}</span>}
                      </span>
                      {unread && (
                        <span
                          aria-hidden
                          style={{ flex: 'none', width: 7, height: 7, borderRadius: '50%', background: 'var(--color-copper)', alignSelf: 'center' }}
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label="Effacer cette notification"
                      title="Effacer"
                      onClick={() => dismiss(n.id)}
                      style={{ flex: 'none', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', padding: '0 12px', fontSize: 13 }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
