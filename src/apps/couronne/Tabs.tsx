import { asset } from '../../shared/asset';
import { useMemo, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { useAppointments, type Appointment } from '../../shared/agenda';
import { useServices } from '../../shared/catalog';
import { clientsStore } from '../../shared/clients';
import { invoiceTotal, invoicesStore, useInvoices, type Invoice } from '../../shared/finance';
import { useTiers } from '../../shared/offers';
import {
  CLIENT_ID,
  GOLD_AT,
  TIER_GOLD,
  TIER_SILVER,
  dayLabelIso,
  daysSince,
  firstName,
  productMeta,
  sessionStore,
  todayIso,
  useClient,
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
  return useMemo(
    () =>
      appts
        .filter((a) => a.clientId === CLIENT_ID)
        .slice()
        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)),
    [appts]
  );
}

/** Rendez-vous à venir (confirmés ou en attente), du plus proche au plus lointain. */
function useUpcomingAppointments(): Appointment[] {
  const { branch } = useBranch();
  const [appts] = useAppointments();
  return useMemo(() => {
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = todayIso();
    return appts
      .filter(
        (a) =>
          a.clientId === CLIENT_ID &&
          a.branchId === branch.id &&
          (a.status === 'confirmé' || a.status === 'en attente') &&
          (a.date > today || (a.date === today && a.time >= nowTime))
      )
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }, [appts, branch.id]);
}

function useNextAppointment(): Appointment | undefined {
  return useUpcomingAppointments()[0];
}

/* ---------- devis — le pont Factures du Trône ---------- */

/** Devis adressés à la cliente : envoyés (à accepter) et acceptés (informatifs). */
function useClientDevis(): Invoice[] {
  const [invoices] = useInvoices();
  return useMemo(
    () =>
      invoices
        .filter((i) => i.clientId === CLIENT_ID && i.kind === 'devis' && (i.status === 'envoyée' || i.status === 'acceptée'))
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [invoices]
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

/* ================= ACCUEIL ================= */

export function HomeTab({
  onOpenBooking,
  onOpenCompose,
  onOpenNotif,
  goGamme,
  toast,
}: {
  onOpenBooking: OpenBooking;
  onOpenCompose: () => void;
  onOpenNotif: () => void;
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
        </div>

        <button className="mc-cta mc-cta--copper" style={{ marginTop: 16 }} onClick={() => onOpenBooking()}>
          Réserver un rituel
        </button>
        <button className="mc-cta mc-cta--outline" style={{ marginTop: 10 }} onClick={onOpenCompose}>
          ✦ Composez votre rituel sur-mesure
        </button>

        {/* recommandation du moment */}
        <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>Du Carnet de Suivi</div>
        {reco && (
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
        )}
        <div style={{ height: 26 }} />
      </div>
    </div>
  );
}

/* ================= SUIVI ================= */

export function SuiviTab({ onOpenBooking }: { onOpenBooking: OpenBooking }) {
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

      {lastAppt && (
        <button className="mc-cta mc-cta--outline" style={{ marginTop: timeline.length ? 0 : 16 }} onClick={rebook}>
          Re-réserver à l’identique
        </button>
      )}
      <div style={{ height: 10 }} />
    </div>
  );
}

/* ================= GAMME ================= */

export function GammeTab({ toast }: { toast: (m: string) => void }) {
  const { currency } = useBranch();
  const { products } = useVisibleCatalog();

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade">
      <div className="mc-micro-eyebrow">La Gamme · Care & Store</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 4px' }}>Votre rituel.</h1>
      <p className="mc-lead" style={{ margin: '0 0 18px' }}>
        Formules naturelles — moringa, karité, niaouli. Sans silicone ni paraben.
      </p>

      <div className="mc-stack" style={{ gap: 12 }}>
        {products.map((p) => {
          const meta = productMeta(p.id);
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
                <button className="mc-plusbtn" aria-label={`Ajouter ${p.name}`} onClick={() => toast(`${p.name} ajouté au panier.`)}>+</button>
              </div>
            </div>
          );
        })}
        {products.length === 0 && <div className="mc-emptyline">La gamme se prépare — revenez bientôt.</div>}
      </div>
      <div style={{ height: 70 }} />
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
      <div className="mc-stack" style={{ gap: 10 }}>
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
  const { branch } = useBranch();

  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [city, setCity] = useState(client?.city ?? '');

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast('Votre nom est nécessaire — la maison vous appelle par votre nom.');
      return;
    }
    clientsStore.set((prev) =>
      prev.map((c) => (c.id === CLIENT_ID ? { ...c, name: n, phone: phone.trim(), city: city.trim() } : c))
    );
    toast('Profil enregistré — la maison vous connaît.');
  };

  const setMaster = (m: string) => {
    clientsStore.set((prev) => prev.map((c) => (c.id === CLIENT_ID ? { ...c, preferredMaster: m || undefined } : c)));
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

      <button className="mc-cta mc-cta--quiet" style={{ marginTop: 22 }} onClick={() => sessionStore.set(null)}>
        Se déconnecter
      </button>
      <div style={{ height: 12 }} />
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
