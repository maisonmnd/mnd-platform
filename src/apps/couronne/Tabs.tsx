import { asset } from '../../shared/asset';
import { useMemo } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { useAppointments, type Appointment } from '../../shared/agenda';
import { useServices } from '../../shared/catalog';
import {
  CLIENT_ID,
  GOLD_AT,
  OFFERS,
  TIER_GOLD,
  TIER_SILVER,
  dayLabelIso,
  daysSince,
  firstName,
  productMeta,
  sessionStore,
  todayIso,
  useClient,
  useOfferCountdown,
  useVisibleCatalog,
  type BookingPrefill,
  type Offer,
} from './lib';

/* Les cinq onglets de Ma Couronne + le panneau de notifications. */

type OpenBooking = (prefill?: BookingPrefill) => void;

/* ---------- prochain rituel — lu dans l'agenda partagé ---------- */

function useNextAppointment(): Appointment | undefined {
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
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))[0];
  }, [appts, branch.id]);
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
  const countdown = useOfferCountdown();

  const points = client?.loyaltyPoints ?? 0;
  const goldPct = Math.min(100, Math.round((points / GOLD_AT) * 100));
  const crownDays = daysSince(client?.since ?? todayIso());

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
          ♟<span className="mc-bell__dot" />
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
              <span className="mc-crownstatus__style">Microlocks</span>
              <span className="mc-crownstatus__day">Jour {crownDays}</span>
            </div>
            <span className="mc-pillseal">{TIER_SILVER}</span>
          </div>
          <div className="mc-crownstatus__progress">
            <div className="mc-bar"><div style={{ width: `${goldPct}%` }} /></div>
            <span>{TIER_GOLD} · {Math.max(0, GOLD_AT - points)} points</span>
          </div>
        </div>

        {/* offres instantanées */}
        <div className="mc-offershead">
          <span className="mc-offershead__label">Offres instantanées</span>
          <span className="mc-offershead__timer">Expire dans {countdown}</span>
        </div>
        <div className="mc-scroll mc-offersrail">
          {OFFERS.map((o) => (
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
              <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>Recommandé par Aïcha</div>
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
  const next = useNextAppointment();
  const crownDays = daysSince(client?.since ?? todayIso());

  const timeline = [
    { d: 'Mars 2024', t: 'Le démarrage', s: 'Création des microlocks · avec Brice', done: true },
    { d: 'Juillet 2024', t: 'Premier resserrage', s: 'Racines reprises, cuir chevelu sain', done: true },
    { d: 'Décembre 2025', t: 'Le Couronnement', s: 'Édition mère · tapis cuivre', done: true },
    next
      ? { d: `${dayLabelIso(next.date)} · ${next.time}`, t: serviceNames(next, services) || 'Prochain rituel', s: `avec ${next.master}`, done: false }
      : { d: 'À composer', t: 'Prochain rituel', s: 'Réservez votre prochaine séance', done: false },
  ];

  const rebook = () => {
    /* Re-réserver à l'identique : la dernière prestation, directement au créneau. */
    onOpenBooking({ serviceId: 'sv-resserrage' });
  };

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade">
      <div className="mc-micro-eyebrow">Carnet de Suivi · votre lignée</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 16px' }}>Mon parcours.</h1>

      {/* avant / après — séparés d'un filet cuivre 2 px */}
      <div className="mc-beforeafter">
        <div className="mc-beforeafter__shot">
          <img src={asset("/assets/photos/portrait-3.jpg")} alt="Avant" />
          <span className="mc-beforeafter__tag">Avant · mars 2024</span>
        </div>
        <span className="mc-beforeafter__filet" aria-hidden="true" />
        <div className="mc-beforeafter__shot">
          <img src={asset("/assets/photos/model-microlocks.jpg")} alt="Aujourd’hui" />
          <span className="mc-beforeafter__tag mc-beforeafter__tag--now">Aujourd’hui</span>
        </div>
      </div>

      {/* état capillaire */}
      <div className="mc-metrics">
        <div className="mc-metric"><div className="mc-metric__v">Sain</div><div className="mc-metric__l">Cuir chevelu</div></div>
        <div className="mc-metric"><div className="mc-metric__v">+14 cm</div><div className="mc-metric__l">Longueur</div></div>
        <div className="mc-metric"><div className="mc-metric__v">{crownDays}</div><div className="mc-metric__l">Jours de loc</div></div>
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

      <button className="mc-cta mc-cta--outline" onClick={rebook}>Re-réserver à l’identique</button>
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
  const points = client?.loyaltyPoints ?? 0;
  const goldPct = Math.min(100, Math.round((points / GOLD_AT) * 100));

  const ladder = [
    { g: '✦', t: 'Soin offert', s: 'À 1 500 points de reconnaissance', st: points >= 1500 ? 'Obtenu' : `${points} / 1 500`, on: points >= 1500 },
    { g: '♛', t: TIER_GOLD, s: 'À 2 000 points · privilèges de la maison', st: points >= GOLD_AT ? 'Obtenu' : `${points} / 2 000`, on: points >= GOLD_AT },
    { g: '◇', t: 'Cercle Restreint', s: 'À 3 000 points · sur invitation', st: points >= 3000 ? 'Obtenu' : `${points} / 3 000`, on: points >= 3000 },
  ];

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
            <span className="mc-pointscard__unit">points · {TIER_SILVER}</span>
          </div>
          <div className="mc-bar mc-bar--invert"><div style={{ width: `${goldPct}%` }} /></div>
          <div className="mc-pointscard__hint">{TIER_GOLD} à {GOLD_AT.toLocaleString('fr-FR')} points — encore {Math.max(0, GOLD_AT - points)}.</div>
          <button className="mc-smallcta" onClick={() => toast('Invitation prête à transmettre sur WhatsApp.')}>
            Introduire par WhatsApp
          </button>
        </div>
      </div>

      {/* paliers de reconnaissance */}
      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Reconnaissance honorifique</div>
      <div className="mc-stack" style={{ gap: 10 }}>
        {ladder.map((r) => (
          <div key={r.t} className="mc-rewardrow">
            <span className="mc-rewardrow__glyph">{r.g}</span>
            <div className="mc-rewardrow__body">
              <div className="mc-rewardrow__t">{r.t}</div>
              <div className="mc-rewardrow__s">{r.s}</div>
            </div>
            <span className={`mc-rewardrow__st ${r.on ? 'is-on' : ''}`}>{r.st}</span>
          </div>
        ))}
      </div>

      {/* RACINES · Skool · Le Couronnement */}
      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>La maison vous parle</div>
      <div className="mc-circlecard mc-circlecard--obsidian">
        <div className="mc-circlecard__eyebrow">RACINES · le podcast</div>
        <div className="mc-circlecard__title">Épisode 12 — la couronne se transmet.</div>
        <div className="mc-circlecard__sub">Yéman et Brice reçoivent trois têtes couronnées de la diaspora.</div>
        <button className="mc-smallcta" onClick={() => toast('Épisode transmis sur WhatsApp.')}>Écouter</button>
      </div>
      <div className="mc-circlecard mc-circlecard--sable">
        <div className="mc-circlecard__eyebrow mc-circlecard__eyebrow--copper">Communauté · Skool</div>
        <div className="mc-circlecard__title mc-circlecard__title--indigo">Le Cercle des têtes couronnées.</div>
        <div className="mc-circlecard__sub mc-circlecard__sub--ink">Rituels filmés, réponses des maîtres, transmission entre membres.</div>
        <button className="mc-smallcta mc-smallcta--indigo" onClick={() => toast('Demande d’accès transmise au Cercle.')}>Rejoindre</button>
      </div>
      <div className="mc-circlecard mc-circlecard--indigo">
        <div className="mc-circlecard__eyebrow">Le Couronnement</div>
        <div className="mc-circlecard__title">Vous êtes conviée · Cotonou.</div>
        <div className="mc-circlecard__sub">Édition mère · décembre · tapis cuivre.</div>
      </div>
      <div style={{ height: 14 }} />
    </div>
  );
}

/* ================= PROFIL ================= */

export function ProfilTab({ toast }: { toast: (m: string) => void }) {
  const client = useClient();
  const { branch, currency } = useBranch();

  const prefs = [
    { l: 'Maître préféré', v: 'Aïcha' },
    { l: 'Canal de rappel', v: 'WhatsApp' },
    { l: 'Langue', v: 'Français' },
    { l: 'Maison', v: branch.city },
  ];

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade">
      <div className="mc-micro-eyebrow">Votre espace</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 18px' }}>Mon profil.</h1>

      <div className="mc-idcard">
        <span className="mc-idcard__photo" style={{ backgroundImage: `url(${asset('/assets/photos/portrait-1.jpg')})` }} />
        <div>
          <div className="mc-idcard__name">{client?.name ?? 'Cliente Ma Couronne'}</div>
          <div className="mc-idcard__meta">{client?.phone ?? '+229 01 97 44 12 08'} · {client?.city ?? 'Cotonou'}</div>
          <div className="mc-idcard__meta">Tête couronnée depuis {client ? new Date(client.since).getFullYear() : 2021}</div>
        </div>
      </div>

      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Préférences</div>
      <div className="mc-preflist">
        {prefs.map((p) => (
          <button key={p.l} className="mc-prefrow" onClick={() => toast('Réglage bientôt disponible — la maison y travaille.')}>
            <span>{p.l}</span>
            <span className="mc-prefrow__v">{p.v} →</span>
          </button>
        ))}
      </div>

      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Moyens de paiement</div>
      <div className="mc-paytiles">
        <div className="mc-paytile is-on">MTN MoMo</div>
        <div className="mc-paytile">Moov Money</div>
        <div className="mc-paytile">Carte</div>
      </div>

      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Abonnement actif</div>
      <div className="mc-subcard">
        <div>
          <div className="mc-subcard__name">Entretien mensuel</div>
          <div className="mc-subcard__meta">Resserrage · prélèvement MoMo</div>
        </div>
        <span className="mc-subcard__price">{fmtMoney(35000, currency)}</span>
      </div>

      <button className="mc-cta mc-cta--quiet" style={{ marginTop: 22 }} onClick={() => sessionStore.set(null)}>
        Se déconnecter
      </button>
      <div style={{ height: 12 }} />
    </div>
  );
}

/* ================= NOTIFICATIONS ================= */

const NOTIFS = [
  { kind: 'Confirmation', t: 'il y a 2 h', msg: 'Votre acompte est confirmé. Resserrage racines scellé — la maison vous attend.', tone: 'success' },
  { kind: 'Rappel · J-1', t: 'hier', msg: 'Demain 09:00 avec Aïcha. Venez les locks secs, sans produit.', tone: 'copper' },
  { kind: 'Suivi de série', t: 'mar.', msg: 'Séance 2 / 3 de votre SOS restauration la semaine prochaine.', tone: 'indigo' },
  { kind: 'Après-soin', t: 'lun.', msg: 'Recommandation d’Aïcha : Sérum Racines, matin et soir, 14 jours.', tone: 'copper' },
  { kind: 'Reçu', t: 'sam.', msg: 'Votre reçu du bain vapeur & huiles est disponible.', tone: 'soft' },
] as const;

export function Notifications({ onClose }: { onClose: () => void }) {
  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 42 }}>
      <div className="mc-flowhead mc-flowhead--split">
        <div>
          <div className="mc-micro-eyebrow">WhatsApp · in-app</div>
          <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>Notifications.</h1>
        </div>
        <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
      </div>
      <div className="mc-scroll" style={{ flex: 1, padding: '8px 0' }}>
        {NOTIFS.map((n, i) => (
          <div key={i} className="mc-notif">
            <span className={`mc-notif__dot mc-notif__dot--${n.tone}`} />
            <div className="mc-notif__body">
              <div className="mc-notif__head">
                <span className="mc-notif__kind">{n.kind}</span>
                <span className="mc-notif__time">{n.t}</span>
              </div>
              <div className="mc-notif__msg">{n.msg}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
