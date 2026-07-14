import { asset } from '../../shared/asset';
import { useEffect, useMemo, useState } from 'react';
import { notifyLocal } from '../../shared/ics';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { signOut } from '../../shared/auth';
import { useAppointments, type Appointment } from '../../shared/agenda';
import { useServices } from '../../shared/catalog';
import { clientsStore } from '../../shared/clients';
import { invoiceTotal, invoicesStore, useInvoices, type Invoice, type InvoiceLine } from '../../shared/finance';
import { useTiers } from '../../shared/offers';
import { deliveryFee } from '../../shared/settings';
import { uid } from '../../shared/store';
import {
  GOLD_AT,
  MONTHS,
  TIER_GOLD,
  TIER_SILVER,
  dayLabelIso,
  daysSince,
  firstName,
  productMeta,
  todayIso,
  useClient,
  useClientId,
  useLiveOffers,
  useOfferCountdown,
  useVisibleCatalog,
  type BookingPrefill,
  type Offer,
} from './lib';

/* Les cinq onglets de Ma Couronne + le panneau de notifications. */

type OpenBooking = (prefill?: BookingPrefill) => void;

/* ---------- rituels de la cliente — lus dans l'agenda partagé ---------- */

/** Tous les rendez-vous de la cliente, du plus ancien au plus récent. */
function useClientAppointments(): Appointment[] {
  const [appts] = useAppointments();
  const clientId = useClientId();
  return useMemo(
    () =>
      appts
        .filter((a) => a.clientId === clientId)
        .slice()
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [appts, clientId]
  );
}

/** Rendez-vous à venir (confirmés ou en attente), du plus proche au plus lointain. */
function useUpcomingAppointments(): Appointment[] {
  const { branch } = useBranch();
  const [appts] = useAppointments();
  const clientId = useClientId();
  return useMemo(() => {
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = todayIso();
    return appts
      .filter(
        (a) =>
          a.clientId === clientId &&
          a.branchId === branch.id &&
          (a.status === 'confirmé' || a.status === 'en attente') &&
          (a.date > today || (a.date === today && a.time >= nowTime))
      )
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }, [appts, branch.id, clientId]);
}

function useNextAppointment(): Appointment | undefined {
  return useUpcomingAppointments()[0];
}

/* ---------- devis — le pont Factures du Trône ---------- */

/** Devis adressés à la cliente : envoyés (à accepter) et acceptés (informatifs). */
function useClientDevis(): Invoice[] {
  const [invoices] = useInvoices();
  const clientId = useClientId();
  return useMemo(
    () =>
      invoices
        .filter((i) => i.clientId === clientId && i.kind === 'devis' && (i.status === 'envoyée' || i.status === 'acceptée'))
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [invoices, clientId]
  );
}

/** Commandes de la cliente — tous ses devis transmis (produits & prestations). */
function useClientOrders(): Invoice[] {
  const [invoices] = useInvoices();
  const clientId = useClientId();
  return useMemo(
    () =>
      invoices
        .filter((i) => i.clientId === clientId && i.kind === 'devis' && i.status !== 'brouillon')
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)),
    [invoices, clientId]
  );
}

/** Pastille de la cloche : devis en attente + rendez-vous à venir. */
function useNotifCount(): number {
  const devis = useClientDevis();
  const upcoming = useUpcomingAppointments();
  return devis.filter((d) => d.status === 'envoyée').length + upcoming.length;
}

function serviceNames(a: Appointment, services: { id: string; name: string }[]): string {
  return a.serviceIds
    .map((id) => services.find((s) => s.id === id)?.name)
    .filter(Boolean)
    .join(' + ');
}

/** « 12 mars 1990 · 34 ans » — date de naissance lisible et âge courant. */
function birthdayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return `${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()} · ${age} ans`;
}

/* ================= ACCUEIL ================= */

export function HomeTab({
  onOpenBooking,
  onOpenCompose,
  onOpenNotif,
  onOpenRdv,
  goGamme,
  toast,
}: {
  onOpenBooking: OpenBooking;
  onOpenCompose: () => void;
  onOpenNotif: () => void;
  onOpenRdv: () => void;
  goGamme: () => void;
  toast: (m: string) => void;
}) {
  const client = useClient();
  const { currency } = useBranch();
  const [services] = useServices();
  const { products } = useVisibleCatalog();
  const next = useNextAppointment();
  const { offers, endMin } = useLiveOffers();
  const countdown = useOfferCountdown(endMin);

  const notifCount = useNotifCount();
  const points = client?.loyaltyPoints ?? 0;
  const goldPct = Math.min(100, Math.round((points / GOLD_AT) * 100));
  const crownDays = daysSince(client?.crownSince ?? client?.since ?? todayIso());

  const reco = products.find((p) => p.id === 'pr-serum-racines') ?? products[0];

  /* Rituel sous 48 h : bannière discrète + une notification locale, une seule fois. */
  const soon = useMemo(() => {
    if (!next) return null;
    const start = new Date(`${next.date}T${next.time}:00`).getTime();
    const diff = start - Date.now();
    return diff > 0 && diff <= 48 * 3600 * 1000 ? next : null;
  }, [next]);

  useEffect(() => {
    if (!soon) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const key = `mc_rappel_${soon.id}_${soon.date}_${soon.time}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    notifyLocal('Votre rituel approche', `${dayLabelIso(soon.date)} · ${soon.time} — la maison vous attend.`);
  }, [soon]);

  const pickOffer = (o: Offer) => {
    if (o.act === 'invite') {
      toast('Invitation prête à transmettre sur WhatsApp.');
      return;
    }
    if (o.serviceId) onOpenBooking({ serviceId: o.serviceId, discountPct: o.discountPct, offerLabel: o.tag });
  };

  return (
    <div className="mc-fade">
      {/* hero photographique + voile obsidienne */}
      <div className="mc-homehero">
        <img src={asset("/assets/photos/model-microlocks.jpg")} alt="" />
        <div className="mc-homehero__veil" />
        <img className="mc-homehero__seal" src={asset("/assets/monograms/mono-ivoire.png")} alt="" />
        <button className="mc-bell" aria-label="Notifications" onClick={onOpenNotif}>
          ♟{notifCount > 0 && <span className="mc-bell__count">{notifCount}</span>}
        </button>
        <div className="mc-homehero__text">
          <div className="mc-micro-eyebrow">Votre couronne</div>
          <div className="mc-homehero__greet">Bonjour, {firstName(client?.name)}.</div>
        </div>
      </div>

      <div className="mc-pagepad">
        {/* rappel discret — rituel sous 48 h */}
        {soon && (
          <button className="mc-remindbanner" onClick={onOpenRdv}>
            <span className="mc-remindbanner__dot" aria-hidden="true" />
            <span className="mc-remindbanner__txt">
              Votre rituel approche — {dayLabelIso(soon.date)} · {soon.time}
            </span>
            <span className="mc-remindbanner__go">Voir</span>
          </button>
        )}

        {/* citation de la maison */}
        <div className="mc-quote">
          <span className="mc-quote__mark">“</span>
          <div>Vous êtes l’héroïne de cette transformation. Mèche après mèche, depuis plus de 20 ans, la maison veille.</div>
        </div>

        {/* statut couronne */}
        <div className="mc-crownstatus">
          <span className="mc-crownstatus__filet" />
          <div className="mc-crownstatus__top">
            <div className="mc-crownstatus__id">
              <span className="mc-crownstatus__style">{client?.crownStyle ?? 'Votre couronne'}</span>
              <span className="mc-crownstatus__day">Jour {crownDays}</span>
            </div>
            <span className="mc-pillseal">{TIER_SILVER}</span>
          </div>
          <div className="mc-crownstatus__progress">
            <div className="mc-bar"><div style={{ width: `${goldPct}%` }} /></div>
            <span>{TIER_GOLD} · {Math.max(0, GOLD_AT - points)} points</span>
          </div>
        </div>

        {/* offres instantanées — créées au Trône (Marketing), fenêtre jour/heure vivante */}
        {offers.length > 0 && (
          <>
        <div className="mc-offershead">
          <span className="mc-offershead__label">Offres instantanées</span>
          {countdown && <span className="mc-offershead__timer">Expire dans {countdown}</span>}
        </div>
        <div className="mc-scroll mc-offersrail">
          {offers.map((o) => (
            <button key={o.id} className={`mc-offer mc-offer--${o.theme}`} onClick={() => pickOffer(o)}>
              <div className="mc-offer__top">
                <span className="mc-offer__tag">{o.tag}</span>
                <span className="mc-offer__deal">{o.deal}</span>
              </div>
              <div className="mc-offer__title">{o.title}</div>
              <div className="mc-offer__sub">{o.sub}</div>
              <div className="mc-offer__cta">{o.cta} <span>→</span></div>
            </button>
          ))}
        </div>
          </>
        )}

        {/* prochain rituel */}
        <div className="mc-nextrdv">
          <div className="mc-nextrdv__row">
            <span className="mc-nextrdv__label">Prochain rituel</span>
            {next && <span className="mc-nextrdv__status">{next.status === 'confirmé' ? 'Confirmé' : 'En attente'}</span>}
          </div>
          {next ? (
            <>
              <div className="mc-nextrdv__service">{serviceNames(next, services)}</div>
              <div className="mc-nextrdv__when">{dayLabelIso(next.date)} · {next.time} · avec {next.master}</div>
              {next.seriesTotal && (
                <span className="mc-nextrdv__seal" style={{ marginRight: 8 }}>
                  Séance {next.seriesIndex}/{next.seriesTotal}
                </span>
              )}
              {next.depositXof != null && (
                <span className="mc-nextrdv__seal">Acompte réglé · {fmtMoney(next.depositXof, currency)}</span>
              )}
            </>
          ) : (
            <>
              <div className="mc-nextrdv__service">Aucun rituel à venir</div>
              <div className="mc-nextrdv__when">Votre couronne mérite sa prochaine séance — réservez en sept temps.</div>
            </>
          )}
          <button className="mc-nextrdv__manage" onClick={onOpenRdv}>
            Mes rendez-vous · voir, déplacer, annuler
          </button>
        </div>

        <button className="mc-cta mc-cta--copper" style={{ marginTop: 16 }} onClick={() => onOpenBooking()}>
          Réserver un rituel
        </button>
        <button className="mc-cta mc-cta--outline" style={{ marginTop: 10 }} onClick={onOpenCompose}>
          ✦ Composez votre rituel sur-mesure
        </button>

        {/* recommandation du moment — seulement si la gamme existe */}
        {reco && (
          <>
            <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>Du Carnet de Suivi</div>
            <div className="mc-recocard">
              <div className="mc-productvisual"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
              <div className="mc-recocard__body">
                <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>
                  {client?.preferredMaster ? `Recommandé par ${client.preferredMaster}` : 'La maison recommande'}
                </div>
                <div className="mc-recocard__name">{reco.name}</div>
                <div className="mc-recocard__line">Pour densifier d’ici le resserrage · {fmtMoney(reco.priceXof, currency)}</div>
              </div>
              <button className="mc-arrowbtn" aria-label="Voir la gamme" onClick={goGamme}>→</button>
            </div>
          </>
        )}
        <div style={{ height: 26 }} />
      </div>
    </div>
  );
}

/* ================= SUIVI ================= */

export function SuiviTab({ onOpenBooking, onOpenRdv, onOpenOrders }: { onOpenBooking: OpenBooking; onOpenRdv: () => void; onOpenOrders: () => void }) {
  const [services] = useServices();
  const client = useClient();
  const clientAppts = useClientAppointments();
  const next = useNextAppointment();

  const honored = clientAppts.filter((a) => a.status === 'honoré');
  const lockDays = daysSince(client?.crownSince ?? client?.since ?? todayIso());

  /* La timeline naît des vrais rendez-vous : naissance de la couronne,
     rituels honorés, puis le prochain rendez-vous en attente. */
  const timeline: { d: string; t: string; s: string; done: boolean }[] = [];
  if (client?.crownSince) {
    timeline.push({
      d: dayLabelIso(client.crownSince),
      t: 'Naissance de la couronne',
      s: client.crownStyle ? `${client.crownStyle} · la maison veille` : 'La maison veille',
      done: true,
    });
  }
  for (const a of honored) {
    timeline.push({
      d: `${dayLabelIso(a.date)} · ${a.time}`,
      t: serviceNames(a, services) || 'Rituel de la maison',
      s: `avec ${a.master}`,
      done: true,
    });
  }
  if (next) {
    timeline.push({
      d: `${dayLabelIso(next.date)} · ${next.time}`,
      t: serviceNames(next, services) || 'Prochain rituel',
      s: `avec ${next.master} · ${next.status === 'confirmé' ? 'confirmé' : 'en attente de la maison'}`,
      done: false,
    });
  }

  /* Re-réserver à l'identique : la prestation du rendez-vous le plus récent. */
  const lastAppt = clientAppts.filter((a) => a.status !== 'annulé' && a.serviceIds.length > 0).slice(-1)[0];
  const rebook = () => {
    if (lastAppt) onOpenBooking({ serviceId: lastAppt.serviceIds[0] });
  };

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade">
      <div className="mc-micro-eyebrow">Carnet de Suivi · votre lignée</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 16px' }}>Mon parcours.</h1>

      {/* portrait de la couronne — seulement si la maison l'a consigné */}
      {client?.photo && (
        <div className="mc-suiviphoto">
          <img src={client.photo} alt="Votre couronne aujourd’hui" />
          <span className="mc-beforeafter__tag mc-beforeafter__tag--now">Aujourd’hui</span>
        </div>
      )}

      {/* état de la couronne — chiffres réels du CRM et de l'agenda */}
      <div className="mc-metrics">
        <div className="mc-metric"><div className="mc-metric__v">{client?.lockCount ?? '—'}</div><div className="mc-metric__l">Locks</div></div>
        <div className="mc-metric"><div className="mc-metric__v">{lockDays}</div><div className="mc-metric__l">Jours de locks</div></div>
        <div className="mc-metric"><div className="mc-metric__v">{honored.length}</div><div className="mc-metric__l">Rituels honorés</div></div>
      </div>

      {/* timeline mèche-après-mèche */}
      <div className="mc-sectionlabel" style={{ margin: '24px 0 12px' }}>L’histoire de votre couronne</div>
      {timeline.map((t, i) => (
        <div key={i} className="mc-tl">
          <div className="mc-tl__rail">
            <span className={`mc-tl__dot ${t.done ? 'is-done' : ''}`} />
            {i < timeline.length - 1 && <span className="mc-tl__line" />}
          </div>
          <div className="mc-tl__body">
            <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>{t.d}</div>
            <div className="mc-tl__t">{t.t}</div>
            <div className="mc-tl__s">{t.s}</div>
          </div>
        </div>
      ))}
      {timeline.length === 0 && (
        <div className="mc-tlempty">
          <div className="mc-tlempty__t">Votre histoire commence ici.</div>
          <div className="mc-tlempty__s">
            Chaque rituel honoré s’inscrira dans ce carnet, mèche après mèche.
          </div>
          <button className="mc-cta mc-cta--copper" onClick={() => onOpenBooking()}>Réserver mon premier rituel</button>
        </div>
      )}

      {/* Tout suivre — rendez-vous & commandes, réunis dans le Carnet de Suivi */}
      <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>Tout suivre</div>
      <div className="mc-preflist">
        <button className="mc-navrow" onClick={onOpenRdv}>
          <span className="mc-navrow__main">
            <span>Mes rendez-vous</span>
            <span className="mc-navrow__sub">voir, déplacer, annuler</span>
          </span>
          <span className="mc-navrow__arrow" aria-hidden="true">→</span>
        </button>
        <button className="mc-navrow" onClick={onOpenOrders}>
          <span className="mc-navrow__main">
            <span>Mes commandes</span>
            <span className="mc-navrow__sub">suivre l’état de la Gamme</span>
          </span>
          <span className="mc-navrow__arrow" aria-hidden="true">→</span>
        </button>
      </div>
      {lastAppt && (
        <button className="mc-cta mc-cta--outline" style={{ marginTop: 14 }} onClick={rebook}>
          Re-réserver à l’identique
        </button>
      )}
      <div style={{ height: 10 }} />
    </div>
  );
}

/* ================= GAMME ================= */

export function GammeTab({ toast, onOpenOrders }: { toast: (m: string) => void; onOpenOrders: () => void }) {
  const { branch, currency } = useBranch();
  const { products } = useVisibleCatalog();
  const client = useClient();
  const clientId = useClientId();
  const orders = useClientOrders();

  /* Panier réel : id produit → quantité. */
  const [cart, setCart] = useState<Record<string, number>>({});
  const [basketOpen, setBasketOpen] = useState(false);
  /* Remise : retrait en maison (offert) ou livraison à domicile (frais + adresse). */
  const [mode, setMode] = useState<'retrait' | 'livraison'>('retrait');
  const [address, setAddress] = useState(client?.city ? `${client.city}, ` : '');
  /* État après-commande : le récapitulatif reste affiché, le suivi à un geste. */
  const [orderDone, setOrderDone] = useState<
    { number: string; totalXof: number; mode: 'retrait' | 'livraison' } | null
  >(null);

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const dec = (id: string) =>
    setCart((c) => {
      const q = (c[id] ?? 0) - 1;
      const next = { ...c };
      if (q <= 0) delete next[id];
      else next[id] = q;
      return next;
    });
  const drop = (id: string) =>
    setCart((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });

  const items = products.filter((p) => (cart[p.id] ?? 0) > 0).map((p) => ({ p, qty: cart[p.id] }));
  const count = items.reduce((n, it) => n + it.qty, 0);
  const subtotal = items.reduce((n, it) => n + it.p.priceXof * it.qty, 0);
  /* Frais de livraison — pilotés par le Trône (Paramètres) ; 0 = offert. */
  const fee = deliveryFee();
  const deliveryCost = mode === 'livraison' ? fee : 0;
  const total = subtotal + deliveryCost;
  /* La livraison exige une adresse ; le retrait, jamais. */
  const addressMissing = mode === 'livraison' && !address.trim();

  /* Commander : un vrai devis produit adressé à la maison (Trône · Factures/devis).
     La livraison ajoute sa propre ligne au devis ; l'adresse voyage dans la note. */
  const checkout = () => {
    if (items.length === 0 || addressMissing) return;
    const year = new Date().getFullYear();
    const rand = Math.floor(1000 + Math.random() * 9000);
    const productLines: InvoiceLine[] = items.map((it) => ({
      id: uid(),
      label: it.p.name,
      qty: it.qty,
      unitXof: it.p.priceXof,
      discountPct: 0,
    }));
    if (mode === 'livraison') {
      productLines.push({ id: uid(), label: 'Livraison à domicile', qty: 1, unitXof: fee, discountPct: 0 });
    }
    const note =
      mode === 'livraison'
        ? `Livraison à domicile — ${address.trim()}`
        : 'Retrait en maison';
    const inv: Invoice = {
      id: uid(),
      branchId: branch.id,
      kind: 'devis',
      number: `CMD-${year}-${rand}`,
      clientId,
      date: todayIso(),
      lines: productLines,
      globalDiscountPct: 0,
      theme: 'Souffle',
      status: 'envoyée',
      clientName: client?.name,
      note,
    };
    const confirmed = fmtMoney(total, currency);
    invoicesStore.set((prev) => [...prev, inv]);
    setCart({});
    setOrderDone({ number: inv.number, totalXof: total, mode });
    toast(`Commande transmise à la maison — ${confirmed}`);
  };

  const closeBasket = () => {
    setBasketOpen(false);
    setOrderDone(null);
  };

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade mc-page--wide">
      <div className="mc-micro-eyebrow">La Gamme · Care & Store</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 4px' }}>Votre rituel.</h1>
      <p className="mc-lead" style={{ margin: '0 0 18px' }}>
        Formules naturelles — moringa, karité, niaouli. Sans silicone ni paraben.
      </p>

      {/* Suivre ses commandes — visible dès qu'une commande existe. */}
      {orders.length > 0 && (
        <button className="mc-orderslink" onClick={onOpenOrders}>
          <span>Mes commandes · {orders.length}</span>
          <span className="mc-orderslink__arrow" aria-hidden="true">→</span>
        </button>
      )}

      <div className="mc-stack mc-productgrid" style={{ gap: 12 }}>
        {products.map((p) => {
          const meta = productMeta(p.id);
          const qty = cart[p.id] ?? 0;
          return (
            <div key={p.id} className="mc-productcard">
              <div className="mc-productvisual mc-productvisual--tall"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
              <div className="mc-productcard__body">
                <div className="mc-micro-eyebrow" style={{ fontSize: 9.5 }}>{meta.tag}</div>
                <div className="mc-productcard__name">{p.name}</div>
                <div className="mc-productcard__line">{meta.line}</div>
                {p.stock <= 8 && <div className="mc-productcard__scarce">Dernières pièces — {p.stock} en maison</div>}
              </div>
              <div className="mc-productcard__side">
                <span className="mc-productcard__price">{fmtMoney(p.priceXof, currency)}</span>
                {qty > 0 ? (
                  <div className="mc-qtystep">
                    <button aria-label={`Retirer ${p.name}`} onClick={() => dec(p.id)}>−</button>
                    <span>{qty}</span>
                    <button aria-label={`Ajouter ${p.name}`} onClick={() => add(p.id)}>+</button>
                  </div>
                ) : (
                  <button className="mc-plusbtn" aria-label={`Ajouter ${p.name}`} onClick={() => add(p.id)}>+</button>
                )}
              </div>
            </div>
          );
        })}
        {products.length === 0 && (
          <div className="mc-emptyzone">
            <div className="mc-emptyzone__glyph">⬡</div>
            <div className="mc-emptyzone__t">La gamme se prépare.</div>
            <div className="mc-emptyzone__s">
              Nos formules naturelles seront bientôt disponibles ici. La maison vous les présentera une à une.
            </div>
          </div>
        )}
      </div>

      {/* Barre panier — synthèse vivante, visible depuis la Gamme. */}
      {count > 0 && (
        <div className="mc-basketbar">
          <div className="mc-basketbar__info">
            <span className="mc-basketbar__count">{count} article{count > 1 ? 's' : ''}</span>
            <span className="mc-basketbar__total">{fmtMoney(total, currency)}</span>
          </div>
          <button className="mc-cta mc-cta--copper mc-basketbar__cta" onClick={() => setBasketOpen(true)}>
            Voir le panier
          </button>
        </div>
      )}

      <div style={{ height: 70 }} />

      {/* Vue panier — liste, quantités, total, commander. */}
      {basketOpen && (
        <div className="mc-overlayscreen mc-slide" style={{ zIndex: 42 }}>
          <div className="mc-flowhead mc-flowhead--split">
            <div>
              <div className="mc-micro-eyebrow">{orderDone ? 'Commande transmise' : 'Votre panier'}</div>
              <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>
                {orderDone ? 'C’est transmis.' : 'Le panier.'}
              </h1>
            </div>
            <button className="mc-x" aria-label="Fermer" onClick={closeBasket}>✕</button>
          </div>
          <div className="mc-scroll" style={{ flex: 1, padding: '18px 24px calc(24px + env(safe-area-inset-bottom))' }}>
            {orderDone ? (
              <div className="mc-confirm mc-rise" style={{ paddingTop: 26 }}>
                <div className="mc-confirm__seal"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
                <h2>Commande transmise.</h2>
                <p>
                  La maison la reçoit à l’instant et vous confirme sur WhatsApp.
                  Suivez son état à tout moment dans « Mes commandes ».
                </p>
                <div className="mc-recapcard" style={{ textAlign: 'left', width: '100%' }}>
                  <div className="mc-recapcard__line"><span>Commande</span><span>{orderDone.number}</span></div>
                  <div className="mc-recapcard__line"><span>Statut</span><span>Reçue par la maison</span></div>
                  <div className="mc-recapcard__line">
                    <span>Remise</span>
                    <span>{orderDone.mode === 'livraison' ? 'Livraison à domicile' : 'Retrait en maison'}</span>
                  </div>
                  <div className="mc-hairline" />
                  <div className="mc-recapcard__total">
                    <span>Total</span>
                    <span>{fmtMoney(orderDone.totalXof, currency)}</span>
                  </div>
                  <div className="mc-recapcard__meta">
                    {orderDone.mode === 'livraison' ? 'Réglée à la livraison.' : 'Réglée au retrait en maison.'}
                  </div>
                </div>
                <button
                  className="mc-cta mc-cta--indigo"
                  style={{ marginTop: 20 }}
                  onClick={() => { closeBasket(); onOpenOrders(); }}
                >
                  Suivre mes commandes
                </button>
                <button className="mc-quietbtn" onClick={closeBasket}>Revenir à la gamme</button>
              </div>
            ) : items.length === 0 ? (
              <div className="mc-emptyzone">
                <div className="mc-emptyzone__glyph">⬡</div>
                <div className="mc-emptyzone__t">Votre panier est vide.</div>
                <div className="mc-emptyzone__s">
                  Ajoutez une formule de la gamme pour composer votre commande.
                </div>
                <button className="mc-cta mc-cta--outline" style={{ marginTop: 22 }} onClick={closeBasket}>
                  Revenir à la gamme
                </button>
              </div>
            ) : (
              <>
                <div className="mc-stack" style={{ gap: 10 }}>
                  {items.map((it) => (
                    <div key={it.p.id} className="mc-basketrow">
                      <div className="mc-basketrow__body">
                        <div className="mc-basketrow__name">{it.p.name}</div>
                        <div className="mc-basketrow__unit">{fmtMoney(it.p.priceXof, currency)} l’unité</div>
                      </div>
                      <div className="mc-qtystep">
                        <button aria-label={`Retirer ${it.p.name}`} onClick={() => dec(it.p.id)}>−</button>
                        <span>{it.qty}</span>
                        <button aria-label={`Ajouter ${it.p.name}`} onClick={() => add(it.p.id)}>+</button>
                      </div>
                      <div className="mc-basketrow__total">{fmtMoney(it.p.priceXof * it.qty, currency)}</div>
                      <button className="mc-basketrow__x" aria-label={`Retirer ${it.p.name} du panier`} onClick={() => drop(it.p.id)}>✕</button>
                    </div>
                  ))}
                </div>
                {/* Remise — retrait en maison (offert) ou livraison à domicile. */}
                <div className="mc-deliver" style={{ marginTop: 18 }}>
                  <div className="mc-micro-eyebrow">Comment la recevoir</div>
                  <div className="mc-deliver__opts">
                    <button
                      type="button"
                      className={`mc-deliver__opt ${mode === 'retrait' ? 'is-active' : ''}`}
                      onClick={() => setMode('retrait')}
                    >
                      <span className="mc-deliver__name">Retrait en maison</span>
                      <span className="mc-deliver__price">Offert</span>
                    </button>
                    <button
                      type="button"
                      className={`mc-deliver__opt ${mode === 'livraison' ? 'is-active' : ''}`}
                      onClick={() => setMode('livraison')}
                    >
                      <span className="mc-deliver__name">Livraison à domicile</span>
                      <span className="mc-deliver__price">{fee > 0 ? fmtMoney(fee, currency) : 'Offert'}</span>
                    </button>
                  </div>
                  {mode === 'livraison' && (
                    <label className="mc-deliver__addr">
                      <span className="mc-deliver__addrlabel">Adresse de livraison</span>
                      <textarea
                        className="mc-deliver__addrinput"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Quartier, rue, repère… et un numéro à joindre."
                        rows={2}
                      />
                    </label>
                  )}
                </div>

                <div className="mc-recapcard" style={{ marginTop: 16 }}>
                  <div className="mc-recapcard__line">
                    <span>Sous-total · {count} article{count > 1 ? 's' : ''}</span>
                    <span>{fmtMoney(subtotal, currency)}</span>
                  </div>
                  <div className="mc-recapcard__line">
                    <span>Livraison</span>
                    <span>{mode === 'livraison' ? (deliveryCost > 0 ? fmtMoney(deliveryCost, currency) : 'Offerte') : 'Retrait — offert'}</span>
                  </div>
                  <div className="mc-hairline" />
                  <div className="mc-recapcard__total"><span>Total</span><span>{fmtMoney(total, currency)}</span></div>
                  <div className="mc-recapcard__meta">
                    {mode === 'livraison' ? 'Réglée à la livraison.' : 'Réglée au retrait en maison.'}
                  </div>
                </div>
                <button
                  className="mc-cta mc-cta--copper"
                  style={{ marginTop: 18 }}
                  onClick={checkout}
                  disabled={addressMissing}
                >
                  Commander · {fmtMoney(total, currency)}
                </button>
                {addressMissing && (
                  <div className="mc-footnote" style={{ color: 'var(--mc-copper, #b97a4a)' }}>
                    Indiquez l’adresse de livraison pour transmettre la commande.
                  </div>
                )}
                <div className="mc-footnote">La maison confirmera votre commande sur WhatsApp.</div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= CERCLE ================= */

export function CercleTab({ toast }: { toast: (m: string) => void }) {
  const client = useClient();
  const [tiers] = useTiers();
  const [services] = useServices();
  const points = client?.loyaltyPoints ?? 0;

  /* Les paliers sont ceux définis au Trône (Cercle) — la prestation offerte
     vient du catalogue partagé. */
  const ladder = useMemo(() => tiers.slice().sort((a, b) => a.pts - b.pts), [tiers]);
  const nextTier = ladder.find((t) => points < t.pts);
  const pct = nextTier ? Math.min(100, Math.round((points / nextTier.pts) * 100)) : 100;

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade">
      <div className="mc-micro-eyebrow">Le Cercle MND · transmettre</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 16px' }}>Votre lignée.</h1>

      {/* points de reconnaissance */}
      <div className="mc-pointscard">
        <div className="mc-pointscard__watermark" aria-hidden="true" />
        <div className="mc-pointscard__inner">
          <div className="mc-pointscard__label">Reconnaissance de la maison</div>
          <div className="mc-pointscard__row">
            <span className="mc-pointscard__big">{points.toLocaleString('fr-FR')}</span>
            <span className="mc-pointscard__unit">points de reconnaissance</span>
          </div>
          <div className="mc-bar mc-bar--invert"><div style={{ width: `${pct}%` }} /></div>
          <div className="mc-pointscard__hint">
            {nextTier
              ? `Prochain palier à ${nextTier.pts.toLocaleString('fr-FR')} points — encore ${(nextTier.pts - points).toLocaleString('fr-FR')}.`
              : ladder.length > 0
                ? 'Tous les paliers sont honorés — la maison vous salue.'
                : 'Chaque rituel honoré nourrit votre reconnaissance.'}
          </div>
          <button className="mc-smallcta" onClick={() => toast('Invitation prête à transmettre sur WhatsApp.')}>
            Introduire par WhatsApp
          </button>
        </div>
      </div>

      {/* paliers de reconnaissance — définis au Trône */}
      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Reconnaissance honorifique</div>
      <div className="mc-stack mc-rewardgrid" style={{ gap: 10 }}>
        {ladder.map((t) => {
          const svc = services.find((s) => s.id === t.serviceId);
          const on = points >= t.pts;
          return (
            <div key={t.id} className="mc-rewardrow">
              <span className="mc-rewardrow__glyph">{t.g}</span>
              <div className="mc-rewardrow__body">
                <div className="mc-rewardrow__t">{svc?.name ?? 'Prestation de la maison'}</div>
                <div className="mc-rewardrow__s">{t.desc} · à {t.pts.toLocaleString('fr-FR')} points</div>
              </div>
              <span className={`mc-rewardrow__st ${on ? 'is-on' : ''}`}>
                {on ? 'Obtenu' : `${points.toLocaleString('fr-FR')} / ${t.pts.toLocaleString('fr-FR')}`}
              </span>
            </div>
          );
        })}
        {ladder.length === 0 && (
          <div className="mc-emptyline">Les paliers du Cercle se préparent — la maison vous les révélera bientôt.</div>
        )}
      </div>
      <div style={{ height: 14 }} />
    </div>
  );
}

/* ================= PROFIL ================= */

export function ProfilTab({ toast }: { toast: (m: string) => void }) {
  const client = useClient();
  const clientId = useClientId();
  const { branch } = useBranch();

  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [city, setCity] = useState(client?.city ?? '');
  const [birthday, setBirthday] = useState(client?.birthday ?? '');

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast('Votre nom est nécessaire — la maison vous appelle par votre nom.');
      return;
    }
    clientsStore.set((prev) =>
      prev.map((c) =>
        c.id === clientId
          ? { ...c, name: n, phone: phone.trim(), city: city.trim(), birthday: birthday || undefined }
          : c
      )
    );
    toast('Profil enregistré — la maison vous connaît.');
  };

  const setMaster = (m: string) => {
    clientsStore.set((prev) => prev.map((c) => (c.id === clientId ? { ...c, preferredMaster: m || undefined } : c)));
    toast(m ? `${m} vous accueillera en priorité.` : 'La maison choisira votre maître.');
  };

  const sinceYear = client ? new Date(client.since).getFullYear() : new Date().getFullYear();
  const initial = (client?.name?.trim() || 'C').charAt(0).toUpperCase();

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade">
      <div className="mc-micro-eyebrow">Votre espace</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 18px' }}>Mon profil.</h1>

      <div className="mc-idcard">
        {client?.photo ? (
          <span className="mc-idcard__photo" style={{ backgroundImage: `url(${client.photo})` }} />
        ) : (
          <span className="mc-idcard__initial">{initial}</span>
        )}
        <div>
          <div className="mc-idcard__name">{client?.name ?? 'Ma Couronne'}</div>
          <div className="mc-idcard__meta">Tête couronnée depuis {sinceYear} · {branch.name}</div>
        </div>
      </div>

      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Vos informations</div>
      <div className="mc-profform">
        <label className="mc-profield">
          <span>Nom complet</span>
          <input value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mc-profield">
          <span>Téléphone</span>
          <input value={phone} inputMode="tel" autoComplete="tel" onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="mc-profield">
          <span>Ville</span>
          <input value={city} autoComplete="address-level2" onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="mc-profield">
          <span>Date de naissance</span>
          <input
            type="date"
            value={birthday}
            max={todayIso()}
            autoComplete="bday"
            onChange={(e) => setBirthday(e.target.value)}
          />
          {birthday && <span className="mc-profield__read">{birthdayLabel(birthday)}</span>}
        </label>
        <button className="mc-cta mc-cta--outline" style={{ marginTop: 18 }} onClick={save}>Enregistrer</button>
      </div>

      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Maître préféré</div>
      <select
        className="mc-profselect"
        value={client?.preferredMaster ?? ''}
        aria-label="Maître préféré"
        onChange={(e) => setMaster(e.target.value)}
      >
        <option value="">La maison choisit</option>
        {branch.masters.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Votre couronne</div>
      <div className="mc-preflist">
        <div className="mc-inforow">
          <span>Style de couronne</span>
          <span className="mc-inforow__v">{client?.crownStyle ?? 'À renseigner'}</span>
        </div>
        <div className="mc-inforow">
          <span>Nombre de locks</span>
          <span className="mc-inforow__v">{client?.lockCount ?? '—'}</span>
        </div>
      </div>
      <div className="mc-emptyline" style={{ paddingTop: 6 }}>Renseignés par la maison, lors de vos rituels.</div>

      <button className="mc-cta mc-cta--quiet" style={{ marginTop: 22 }} onClick={() => void signOut()}>
        Se déconnecter
      </button>
      <div style={{ height: 12 }} />
    </div>
  );
}

/* ================= MES COMMANDES ================= */

/** Suivi des commandes : chaque devis transmis, son numéro, son total et son état
    vu par la maison — envoyée → « Reçue », acceptée → « Confirmée », payée → « Réglée ». */
const ORDER_STATUS: Record<Invoice['status'], { label: string; cls: string }> = {
  brouillon: { label: 'Brouillon', cls: '' },
  'envoyée': { label: 'Reçue par la maison', cls: 'mc-stchip--wait' },
  'acceptée': { label: 'Confirmée', cls: 'mc-stchip--info' },
  'payée': { label: 'Réglée', cls: 'mc-stchip--ok' },
};

export function MesCommandes({ onClose }: { onClose: () => void }) {
  const { currency } = useBranch();
  const orders = useClientOrders();

  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 42 }}>
      <div className="mc-flowhead mc-flowhead--split">
        <div>
          <div className="mc-micro-eyebrow">Votre suivi · la Gamme</div>
          <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>Mes commandes.</h1>
        </div>
        <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
      </div>
      <div className="mc-scroll" style={{ flex: 1, padding: '8px 0 calc(16px + env(safe-area-inset-bottom))' }}>
        {orders.map((o) => (
          <div key={o.id} className="mc-orderrow">
            <div className="mc-orderrow__head">
              <span className="mc-orderrow__no">{o.number}</span>
              <span className="mc-orderrow__date">{dayLabelIso(o.date)}</span>
            </div>
            <div className="mc-orderrow__lines">
              {o.lines.map((l) => (l.qty > 1 ? `${l.qty}× ${l.label}` : l.label)).join(' · ')}
            </div>
            <div className="mc-orderrow__foot">
              <span className="mc-orderrow__total">{fmtMoney(invoiceTotal(o), currency)}</span>
              <span className={`mc-stchip ${ORDER_STATUS[o.status].cls}`}>{ORDER_STATUS[o.status].label}</span>
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className="mc-emptyzone">
            <div className="mc-emptyzone__glyph">⬡</div>
            <div className="mc-emptyzone__t">Aucune commande pour l’instant.</div>
            <div className="mc-emptyzone__s">
              Composez votre commande depuis la Gamme — vous suivrez ici chacun de ses états.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= NOTIFICATIONS ================= */

export function Notifications({ onClose }: { onClose: () => void }) {
  const { currency } = useBranch();
  const [services] = useServices();
  const devis = useClientDevis();
  const upcoming = useUpcomingAppointments();
  const next = upcoming[0];

  /* Le pont devis → ERP : accepter ici rend le devis « accepté » au Trône (Factures). */
  const acceptDevis = (id: string) => {
    invoicesStore.set((prev) => prev.map((i) => (i.id === id && i.status === 'envoyée' ? { ...i, status: 'acceptée' } : i)));
  };

  const empty = devis.length === 0 && upcoming.length === 0;

  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 42 }}>
      <div className="mc-flowhead mc-flowhead--split">
        <div>
          <div className="mc-micro-eyebrow">La maison vous parle</div>
          <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>Notifications.</h1>
        </div>
        <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
      </div>
      <div className="mc-scroll" style={{ flex: 1, padding: '8px 0 calc(16px + env(safe-area-inset-bottom))' }}>
        {/* devis — envoyés par le Trône, acceptés ici */}
        {devis.map((d) => (
          <div key={d.id} className="mc-notif">
            <span className={`mc-notif__dot ${d.status === 'acceptée' ? 'mc-notif__dot--success' : 'mc-notif__dot--copper'}`} />
            <div className="mc-notif__body">
              <div className="mc-notif__head">
                <span className="mc-notif__kind">Devis · {d.number}</span>
                <span className="mc-notif__time">{dayLabelIso(d.date)}</span>
              </div>
              <div className="mc-notif__msg">
                {d.status === 'acceptée'
                  ? 'Devis accepté — la maison prépare votre rituel.'
                  : 'La maison vous propose un devis — à accepter pour sceller le rituel.'}
              </div>
              <div className="mc-notif__total">{fmtMoney(invoiceTotal(d), currency)}</div>
              {d.status === 'envoyée' && (
                <button className="mc-smallcta" style={{ marginTop: 10 }} onClick={() => acceptDevis(d.id)}>
                  Accepter le devis
                </button>
              )}
            </div>
          </div>
        ))}

        {/* rappel du prochain rituel */}
        {next && (
          <div className="mc-notif">
            <span className="mc-notif__dot mc-notif__dot--indigo" />
            <div className="mc-notif__body">
              <div className="mc-notif__head">
                <span className="mc-notif__kind">Rappel</span>
                <span className="mc-notif__time">{dayLabelIso(next.date)}</span>
              </div>
              <div className="mc-notif__msg">
                {serviceNames(next, services) || 'Votre rituel'} · {dayLabelIso(next.date)} à {next.time} avec {next.master}. Venez les locks secs, sans produit.
              </div>
            </div>
          </div>
        )}

        {/* réservations — l'état vu par la maison */}
        {upcoming.map((a) => (
          <div key={a.id} className="mc-notif">
            <span className={`mc-notif__dot ${a.status === 'confirmé' ? 'mc-notif__dot--success' : 'mc-notif__dot--soft'}`} />
            <div className="mc-notif__body">
              <div className="mc-notif__head">
                <span className="mc-notif__kind">{a.status === 'confirmé' ? 'Confirmation' : 'Réservation'}</span>
                <span className="mc-notif__time">{dayLabelIso(a.date)} · {a.time}</span>
              </div>
              <div className="mc-notif__msg">
                {a.status === 'confirmé'
                  ? `${serviceNames(a, services) || 'Votre rituel'} confirmé — la maison vous attend, avec ${a.master}.`
                  : `${serviceNames(a, services) || 'Votre rituel'} — acompte reçu, en attente de la maison.`}
              </div>
            </div>
          </div>
        ))}

        {empty && <div className="mc-emptyline" style={{ padding: '18px 24px' }}>Aucune notification — la maison veille.</div>}
      </div>
    </div>
  );
}
