import { asset } from '../../shared/asset';
import { MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { notifyLocal } from '../../shared/ics';
import { enablePush, disablePush, pushState, type PushState } from '../../shared/push';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { signOut, useAuth } from '../../shared/auth';
import { useAppointments, venuesHonorees, type Appointment } from '../../shared/agenda';
import { useCategories, useProducts, useServices } from '../../shared/catalog';
import { clientsStore, useClients, useFamilies, usePersonas } from '../../shared/clients';
import { vitrineConfigStore } from '../../shared/bridges';
import { recoPourEnvie } from '../../shared/reco';
import { envieLabel, type EnvieKey } from '../../shared/quiz';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, estProposable, calibreDe } from '../../shared/pricing';
import { predictNextVisit, cadenceLabel } from '../../shared/cadence';
import { dernierBilanDe, useBilans, type Bilan } from '../../shared/bilans';
import { ageDe, tetesPortees } from '../../shared/accounts';
import { declarationsDe, declarerEnfant, nomPropose, useEnfantsDeclares } from '../../shared/enfants';
import { invoiceTotal, invoicesStore, useInvoices, type Invoice, type InvoiceLine } from '../../shared/finance';
import { cercleSeuilStore, estDuCercle, useTiers } from '../../shared/offers';
import { deliveryFee } from '../../shared/settings';
import { createStore, uid, useStore } from '../../shared/store';
import {
  MONTHS,
  ensureClient,
  moduleHidden,
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

/* Chiffre du sceau d'un palier — même convention que le Trône (Cercle) : le
   rang dans l'échelle triée, le champ g des anciens paliers restant prioritaire. */
const ROMANS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ'];
const tierGlyph = (t: { g: string }, idx: number) => t.g || ROMANS[idx] || '✦';

/* Le lecteur du bilan — la cliente relit ce que la maison a remis : jauges,
   points clés, les Quatre Temps, la prochaine visite. En surimpression,
   sobre ; la signature du praticien reste — un bilan est un document signé. */
function BilanLecteur({ bilan, onClose }: { bilan: Bilan; onClose: () => void }) {
  return (
    <div className="mc-bilanveil" onClick={onClose} role="dialog" aria-label="Bilan de séance">
      <div className="mc-bilancard" onClick={(e) => e.stopPropagation()}>
        <div className="mc-micro-eyebrow">Le Carnet de Suivi · {bilan.numero}</div>
        <h2 className="mc-serif-title" style={{ margin: '6px 0 2px' }}>Bilan de séance.</h2>
        <div className="mc-bilanmeta">
          Séance du {dayLabelIso(bilan.date)}
          {bilan.prestation ? ` · ${bilan.prestation}` : ''}
          {bilan.duree ? ` · ${bilan.duree}` : ''}
        </div>

        <div className="mc-bilansec">L’état de la couronne</div>
        {bilan.jauges.map((j) => (
          <div key={j.nom} className="mc-bilanjauge">
            <span className="n">{j.nom}</span>
            <span className="dots" role="img" aria-label={`${j.valeur} sur 5`}>
              {[1, 2, 3, 4, 5].map((v) => <i key={v} className={v <= j.valeur ? 'on' : ''} />)}
            </span>
            <span className="note">{j.note}</span>
          </div>
        ))}

        {bilan.points.length > 0 && (
          <>
            <div className="mc-bilansec">Les points clés de la séance</div>
            <ul className="mc-bilanpoints">
              {bilan.points.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </>
        )}

        <div className="mc-bilansec">Le rituel à domicile</div>
        {bilan.rituel.map((t) => (
          <div key={t.nom} className="mc-bilantemps">
            <div className="n">{t.nom} <span>· {t.cadence}</span></div>
            <p>{t.texte}</p>
          </div>
        ))}

        {bilan.prochaineVisite && (
          <div className="mc-bilannext">Prochaine visite conseillée — {bilan.prochaineVisite}</div>
        )}
        {bilan.praticien && <div className="mc-bilansig">{bilan.praticien} · Maison MND · mi nyɔ́ ɖɛkpɛ</div>}

        <button className="mc-cta mc-cta--outline" style={{ marginTop: 20 }} onClick={onClose}>Fermer</button>
      </div>
    </div>
  );
}

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

/** OÙ ELLE EN EST DU CERCLE. On y entre au N-ième passage (réglé au Trône) : une
    cliente qui n'y est pas encore ne doit pas lire « 0 point » sans comprendre —
    c'est ainsi qu'un programme de fidélité passe pour cassé. Elle voit donc le
    chemin qu'il lui reste, pas une porte close. */
function useCercle(): { venues: number; seuil: number; membre: boolean; reste: number } {
  const [appts] = useAppointments();
  const clientId = useClientId();
  const [seuil] = useStore(cercleSeuilStore);
  return useMemo(() => {
    /* Par la PAYEUSE, comme les points : un rituel qu'on lui a offert ne la fait
       pas entrer — c'est celle qui a payé que la Maison reconnaît. */
    const venues = venuesHonorees(appts, clientId, true);
    const membre = estDuCercle(venues, seuil);
    return { venues, seuil, membre, reste: Math.max(0, seuil - venues) };
  }, [appts, clientId, seuil]);
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
/* ids des notifications effacées par la cliente (masquées + hors compteur). */
const dismissedMcStore = createStore<string[]>('mnd_mc_notif_dismissed', []);

function useNotifCount(): number {
  const devis = useClientDevis();
  const upcoming = useUpcomingAppointments();
  const [dismissed] = useStore(dismissedMcStore);
  const d = new Set(dismissed);
  return devis.filter((x) => x.status === 'envoyée' && !d.has(`devis-${x.id}`)).length
    + upcoming.filter((a) => !d.has(`resa-${a.id}`)).length;
}

/* LA PHRASE DU POURQUOI (maquette accueil, repère 5) : la recommandation dit
   sa raison en toutes lettres — l'envie qu'ELLE a déclarée au quiz, jamais un
   fait inventé sur sa fibre. Une par envie, dans les mots de la maison. */
const PHRASE_ENVIE: Record<EnvieKey, string> = {
  longueur: 'Pour les centimètres que vous êtes venue chercher — la longueur se gagne à la racine, séance après séance.',
  eclat: 'Pour l’éclat que vous êtes venue chercher — la lumière se scelle mèche après mèche.',
  protection: 'Pour protéger ce qui pousse — la saison ne doit rien prendre à votre couronne.',
  transformation: 'Pour la transformation que vous êtes venue chercher — sans rien sacrifier de votre couronne.',
};

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
  /* LE CATALOGUE VISIBLE pour tout ce qui PROPOSE (reco) : une prestation
     masquée à la Vitrine ne doit jamais se recommander — le catalogue brut
     ne sert qu'à nommer l'historique. */
  const { services: servicesVisibles, products } = useVisibleCatalog();
  const next = useNextAppointment();
  const { offers, endMin } = useLiveOffers();
  const countdown = useOfferCountdown(endMin);

  const notifCount = useNotifCount();
  const points = client?.loyaltyPoints ?? 0;
  /* Paliers RÉELS du Cercle (définis au Trône) — jamais de seuils inventés. */
  const [tiers] = useTiers();
  const ladder = useMemo(() => tiers.slice().sort((a, b) => a.pts - b.pts), [tiers]);
  const nextTier = ladder.find((t) => points < t.pts);
  const attained = ladder.filter((t) => t.pts <= points);
  const tierPct = nextTier ? Math.min(100, Math.round((points / nextTier.pts) * 100)) : 100;
  const cercle = useCercle();

  /* LE PRÉNOM VRAI — jamais un identifiant (chantier ④). « Yemanboya1 » est
     un login, pas elle : un prénom ne porte ni chiffre ni arobase. À défaut,
     « Bonjour. » tout court — sobre vaut mieux que faux. */
  const brut = (client?.name ?? '').trim().split(/\s+/)[0] ?? '';
  const prenom = brut && !/[0-9@_.]/.test(brut) ? brut : '';

  /* LA PROCHAINE SÉANCE, PRÉDITE quand rien n'est pris — le MÊME juge que la
     fiche du Trône (shared/cadence.ts) : deux surfaces qui calculeraient
     chacune la leur diraient deux dates à la même tête. La RLS ne montre ici
     que SES rendez-vous — exactement ce que la cadence regarde. */
  const clientAppts = useClientAppointments();
  const cadence = useMemo(
    () => (client ? predictNextVisit(clientAppts, [client], client.id, todayIso()) : null),
    [clientAppts, client],
  );
  const predite = !next && cadence?.predicted && cadence.iso ? cadence : null;

  /* LA RECOMMANDATION EST UNE PRESTATION DÉSIGNÉE, jamais un produit inventé.
     L'ancien bloc repliait sur `products[0]` : la Gamme d'abord — « Cheveux
     naturels » — se présentait en recommandation de la maison. Le juge est
     celui du quiz (shared/reco.ts), l'envie est la sienne (Client.envie),
     l'offre est la vraie (catalogue visible, à son calibre). Sans envie ou
     sans désignation : RIEN — mieux qu'une recommandation fausse. Le produit
     PRESCRIT sur sa fiche (recoProductId) garde sa carte, lui : c'est un
     choix de la maison, pas un repli. */
  const chosenReco = products.find((p) => p.id === client?.recoProductId);
  /* LE DERNIER BILAN REMIS (maquette écran 2, repère 4) — la raison de revenir
     entre deux passages. Sous RLS la cliente ne lit que LES SIENS (0035). */
  const [bilans] = useBilans();
  const monBilan = client ? dernierBilanDe(bilans, client.id) : undefined;
  const [lireBilan, setLireBilan] = useState(false);
  const [personas] = usePersonas();
  const [cats] = useCategories();
  const [produits] = useProducts();
  const [bands] = useModelBands();
  const [sets] = useBandSets();
  const pricing = pricingOf(client ?? undefined, bands, sets, cats);
  const cfgVitrine = useStore(vitrineConfigStore)[0];
  const recoPresta = useMemo(() => {
    if (!client?.envie) return undefined;
    /* LE MÊME JUGE QUE LE TUNNEL (12 août) : calibre servi ET seuil de venues.
       Sans le seuil, l'accueil recommandait — bouton « Réserver » compris —
       le forfait « dès la 3ᵉ venue » à une première visite, et le prefill
       entrait dans le tunnel APRÈS l'unique garde de l'étape 2. */
    const venuesTete = venuesHonorees(clientAppts, client.id);
    const offre = servicesVisibles.filter((s) => estProposable(s, pricing, venuesTete));
    return recoPourEnvie(client, client.envie, {
      offre,
      catalogue: servicesVisibles,
      personas,
      maison: cfgVitrine.recoParEnvie,
      appointments: clientAppts,
      auto: cfgVitrine.recoAuto,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, servicesVisibles, personas, cfgVitrine, clientAppts, bands, sets, cats]);

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
        <img className="mc-homehero__photo" src={asset("/assets/photos/model-microlocks.jpg")} alt="" />
        <div className="mc-homehero__veil" />
        <img className="mc-homehero__seal" src={asset("/assets/monograms/mono-ivoire.png")} alt="" />
        <button className="mc-bell" aria-label="Notifications" onClick={onOpenNotif}>
          ♟{notifCount > 0 && <span className="mc-bell__count">{notifCount}</span>}
        </button>
        <div className="mc-homehero__text">
          <div className="mc-micro-eyebrow">Votre couronne</div>
          <div className="mc-homehero__greet">{prenom ? `Bonjour, ${prenom}.` : 'Bonjour.'}</div>
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

        {/* VOTRE PROCHAINE SÉANCE — EN TÊTE (maquette accueil, repère 2) : la
            séance prise, ou la séance PRÉDITE avec ses deux gestes. Le vide
            n'ouvre plus l'écran. */}
        <div className="mc-nextrdv">
          <div className="mc-nextrdv__row">
            <span className="mc-nextrdv__label">Votre prochaine séance</span>
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
                <span className="mc-nextrdv__seal">{next.depositConfirmed ? 'Acompte reçu' : 'Acompte'} · {fmtMoney(next.depositXof, currency)}</span>
              )}
            </>
          ) : predite ? (
            /* RIEN N'EST PRIS, MAIS LA MAISON SAIT — le ≈ dit l'estimation, la
               phrase dit le rythme, et DEUX gestes répondent (13 août) :
               « Réserver ce créneau » ouvre le tunnel SUR le jour prédit,
               « Choisir une autre date » l'ouvre grille libre. Même juge que
               la fiche du Trône (shared/cadence.ts). */
            <>
              <div className="mc-nextrdv__service">≈ {dayLabelIso(predite.iso!)}</div>
              <div className="mc-nextrdv__when">
                d’après votre rythme{predite.avgDays ? ` — ${cadenceLabel(predite.avgDays)}` : ''} · à confirmer ensemble
              </div>
              {predite.template && predite.template.serviceIds.length > 0 && !moduleHidden(client, 'reserver') && (
                <>
                  <button
                    className="mc-cta mc-cta--copper"
                    style={{ marginTop: 14 }}
                    onClick={() => onOpenBooking({ serviceId: predite.template!.serviceIds[0], dateIso: predite.iso! })}
                  >
                    Réserver ce créneau
                  </button>
                  <button
                    className="mc-nextrdv__manage"
                    onClick={() => onOpenBooking({ serviceId: predite.template!.serviceIds[0] })}
                  >
                    Choisir une autre date
                  </button>
                </>
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

        {/* statut couronne */}
        <div className="mc-crownstatus">
          <span className="mc-crownstatus__filet" />
          <div className="mc-crownstatus__top">
            <div className="mc-crownstatus__id">
              {/* LE CALIBRE SE COMPTE (13 août) : le style choisi à la main est
                  retiré — la couronne se nomme par son calibre, déduit du
                  comptage de la Maison. */}
              <span className="mc-crownstatus__style">
                {(() => {
                  const cal = calibreDe(client?.lockCount, bands);
                  return cal ? `Couronne ${cal} · ${client?.lockCount} locks` : 'Votre couronne';
                })()}
              </span>
            </div>
            {cercle.membre && attained.length > 0 && (
              <span className="mc-pillseal">Palier {tierGlyph(attained[attained.length - 1], attained.length - 1)}</span>
            )}
          </div>
          {/* AVANT LE CERCLE, ON COMPTE DES PASSAGES, PAS DES POINTS. Montrer une
              barre de paliers figée à zéro à qui n'y a pas encore droit fait
              croire que rien ne compte — alors que ses venues, elles, comptent. */}
          {!cercle.membre ? (
            /* LE CERCLE EN CHIFFRES (chantier ④). La barre muette disait
               « presque » sans dire où l'on en est ; les points se comptent
               d'un regard — un par passage, remplis au fil des venues. Au-delà
               de dix, la barre reprend : trente points ne se lisent plus. */
            <div className="mc-crownstatus__progress">
              {cercle.seuil <= 10 ? (
                <div className="mc-dots" aria-hidden="true">
                  {Array.from({ length: cercle.seuil }, (_, i) => (
                    <i key={i} className={i < Math.min(cercle.venues, cercle.seuil) ? 'is-fait' : ''} />
                  ))}
                </div>
              ) : (
                <div className="mc-bar">
                  <div style={{ width: `${Math.min(100, Math.round((cercle.venues / Math.max(1, cercle.seuil)) * 100))}%` }} />
                </div>
              )}
              <span>
                {`${cercle.venues} passage${cercle.venues > 1 ? 's' : ''} sur ${cercle.seuil}`}
                {cercle.venues === 0
                  ? ` — le Cercle s’ouvre au ${cercle.seuil}ᵉ`
                  : cercle.reste > 0
                    ? ` — encore ${cercle.reste} avant le Cercle`
                    : ''}
              </span>
            </div>
          ) : ladder.length > 0 && (
            <div className="mc-crownstatus__progress">
              <div className="mc-bar"><div style={{ width: `${tierPct}%` }} /></div>
              <span>
                {nextTier
                  ? `Palier ${tierGlyph(nextTier, ladder.indexOf(nextTier))} · encore ${(nextTier.pts - points).toLocaleString('fr-FR')} points`
                  : 'Tous les paliers sont honorés'}
              </span>
            </div>
          )}
        </div>

        {/* offres instantanées — créées au Trône (Marketing), fenêtre jour/heure vivante */}
        {offers.length > 0 && !moduleHidden(client, 'offres') && (
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

        {/* Modules coupés par la Maison : les gestes fermés disparaissent (les
            gardes d'App.tsx couvrent de toute façon tous les autres chemins). */}
        {!moduleHidden(client, 'reserver') && (
          <button className="mc-cta mc-cta--copper" style={{ marginTop: 16 }} onClick={() => onOpenBooking()}>
            Réserver un rituel
          </button>
        )}
        {!moduleHidden(client, 'compose') && (
          <button className="mc-cta mc-cta--outline" style={{ marginTop: 10 }} onClick={onOpenCompose}>
            ✦ Composez votre rituel sur-mesure
          </button>
        )}

        {/* VOTRE DERNIER BILAN — le Carnet de Suivi remis par la maison. */}
        {monBilan && (
          <>
            <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>Votre dernier bilan</div>
            <button className="mc-recocard" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--hairline)', background: 'var(--surface-card)' }} onClick={() => setLireBilan(true)}>
              <div className="mc-recocard__body">
                <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>Le Carnet de Suivi</div>
                <div className="mc-recocard__name">Séance du {dayLabelIso(monBilan.date)}</div>
                <div className="mc-recocard__line">
                  {monBilan.prestation ?? 'Rituel de la maison'} — l’état de votre couronne, geste par geste.
                </div>
              </div>
              <span className="mc-arrowbtn" aria-hidden="true">→</span>
            </button>
          </>
        )}
        {lireBilan && monBilan && <BilanLecteur bilan={monBilan} onClose={() => setLireBilan(false)} />}

        {/* LA MAISON RECOMMANDE — une PRESTATION désignée (le juge du quiz),
            au prix de la cliente, et la flèche RÉSERVE. Le produit prescrit
            sur sa fiche garde sa carte. Sans désignation : rien du tout —
            l'ancien repli sur `products[0]` présentait le premier flacon de
            la Gamme en recommandation de la maison. */}
        {recoPresta ? (
          <>
            <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>La maison vous recommande</div>
            <div className="mc-recocard">
              <div className="mc-productvisual"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
              <div className="mc-recocard__body">
                <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>
                  {client?.envie ? `Pour votre envie · ${envieLabel(client.envie)}` : 'Choisie pour votre couronne'}
                </div>
                <div className="mc-recocard__name">{recoPresta.service.name}</div>
                <div className="mc-recocard__line">
                  {recoPresta.service.hidePrice
                    ? 'Prix au fauteuil — la maison vous dira'
                    : (() => { const p = personalPriceXof(recoPresta.service, pricing, services, produits); return p > 0 ? `${fmtMoney(p, currency)} · votre prix` : 'Sur devis'; })()}
                </div>
                {client?.envie && (
                  <div className="mc-recocard__why">{PHRASE_ENVIE[client.envie]}</div>
                )}
              </div>
              {!moduleHidden(client, 'reserver') && (
                <button className="mc-arrowbtn" aria-label="Réserver cette prestation" onClick={() => onOpenBooking({ serviceId: recoPresta.service.id })}>→</button>
              )}
            </div>
          </>
        ) : chosenReco ? (
          <>
            <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>Du Carnet de Suivi</div>
            <div className="mc-recocard">
              <div className="mc-productvisual"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
              <div className="mc-recocard__body">
                <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>
                  {client?.preferredMaster ? `Recommandé par ${client.preferredMaster}` : 'La maison recommande'}
                </div>
                <div className="mc-recocard__name">{chosenReco.name}</div>
                <div className="mc-recocard__line">
                  {productMeta(chosenReco.id).line} · {fmtMoney(chosenReco.priceXof, currency)}
                </div>
              </div>
              <button className="mc-arrowbtn" aria-label="Voir la gamme" onClick={goGamme}>→</button>
            </div>
          </>
        ) : null}
        <div style={{ height: 26 }} />
      </div>
    </div>
  );
}

/* ================= SUIVI ================= */

export function SuiviTab({ onOpenBooking, onOpenRdv, onOpenOrders, goGamme }: { onOpenBooking: OpenBooking; onOpenRdv: () => void; onOpenOrders: () => void; goGamme: () => void }) {
  const [services] = useServices();
  const client = useClient();
  const { currency } = useBranch();
  const { products } = useVisibleCatalog();
  const clientAppts = useClientAppointments();
  const next = useNextAppointment();

  /* Le produit prescrit par la maison sur la fiche cliente — affiché seulement
     s'il est choisi ET visible au front (catégorie active, non masqué). */
  const reco = client?.recoProductId ? products.find((p) => p.id === client.recoProductId) : undefined;

  const honored = clientAppts.filter((a) => a.status === 'honoré');
  const lockDays = daysSince(client?.crownSince ?? client?.since ?? todayIso());
  /* Le calibre, déduit du comptage — le style à la main est retiré (13 août). */
  const [bandsModeles] = useModelBands();
  const calSuivi = calibreDe(client?.lockCount, bandsModeles);

  /* La timeline naît des vrais rendez-vous : naissance de la couronne,
     rituels honorés, puis le prochain rendez-vous en attente. */
  const timeline: { d: string; t: string; s: string; done: boolean }[] = [];
  if (client?.crownSince) {
    timeline.push({
      d: dayLabelIso(client.crownSince),
      t: 'Naissance de la couronne',
      s: calSuivi ? `Calibre ${calSuivi} · la maison veille` : 'La maison veille',
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

      {/* prescription de la maison — produit choisi sur la fiche, au Trône */}
      {reco && (
        <>
          <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>La maison vous recommande</div>
          <div className="mc-recocard">
            <div className="mc-productvisual"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
            <div className="mc-recocard__body">
              <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>
                {client?.preferredMaster ? `Conseillé par ${client.preferredMaster}` : 'Choisi pour votre couronne'}
              </div>
              <div className="mc-recocard__name">{reco.name}</div>
              <div className="mc-recocard__line">{productMeta(reco.id).line} · {fmtMoney(reco.priceXof, currency)}</div>
            </div>
            <button className="mc-arrowbtn" aria-label="Voir la gamme" onClick={goGamme}>→</button>
          </div>
        </>
      )}

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
  /* Position GPS partagée par la cliente — un point précis pour le livreur. */
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const mapsLink = geo ? `https://maps.google.com/?q=${geo.lat},${geo.lng}` : '';

  const shareLocation = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      toast('La géolocalisation n’est pas disponible sur cet appareil.');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setGeoBusy(false);
        toast('Position partagée — la maison vous trouvera facilement.');
      },
      (err) => {
        setGeoBusy(false);
        toast(
          err.code === err.PERMISSION_DENIED
            ? 'Autorisez la localisation pour partager votre position.'
            : 'Impossible d’obtenir votre position. Réessayez.',
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };
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
  /* La livraison exige un repère : une adresse saisie OU une position GPS partagée. */
  const addressMissing = mode === 'livraison' && !address.trim() && !geo;

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
        ? [
            `Livraison à domicile${address.trim() ? ` — ${address.trim()}` : ''}`,
            mapsLink ? `Position GPS : ${mapsLink}` : '',
          ]
            .filter(Boolean)
            .join('\n')
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
    /* La position GPS partagée se dépose aussi sur la fiche cliente — le Trône
       propose alors un itinéraire direct depuis le CRM. */
    if (geo) clientsStore.set((prev) => prev.map((c) => (c.id === clientId ? { ...c, geo } : c)));
    setCart({});
    setGeo(null);
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
                {p.stock > 0 && p.stock <= 8 && <div className="mc-productcard__scarce">Dernières pièces — {p.stock} en maison</div>}
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
                    <>
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
                      <div className="mc-geo">
                        <button
                          type="button"
                          className={`mc-geo__btn ${geo ? 'is-set' : ''}`}
                          onClick={shareLocation}
                          disabled={geoBusy}
                        >
                          <MapPin size={15} strokeWidth={1.75} />
                          {geoBusy
                            ? 'Localisation en cours…'
                            : geo
                              ? 'Actualiser ma position'
                              : 'Partager ma position GPS'}
                        </button>
                        {geo && (
                          <a
                            className="mc-geo__link"
                            href={mapsLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Position enregistrée · voir sur la carte
                          </a>
                        )}
                        {!geo && (
                          <span className="mc-geo__hint">
                            Un point précis pour que le livreur vous trouve sans hésiter.
                          </span>
                        )}
                      </div>
                    </>
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
  const cercle = useCercle();

  /* Les paliers sont ceux définis au Trône (Cercle) — la prestation offerte
     vient du catalogue partagé. */
  const ladder = useMemo(() => tiers.slice().sort((a, b) => a.pts - b.pts), [tiers]);
  const nextTier = ladder.find((t) => points < t.pts);
  const pct = nextTier ? Math.min(100, Math.round((points / nextTier.pts) * 100)) : 100;

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade">
      <div className="mc-micro-eyebrow">Le Cercle MND · transmettre</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 16px' }}>Votre lignée.</h1>

      {/* LE SEUIL, DIT AVANT LES POINTS. Un compteur à zéro sans un mot se lit
          comme une panne ; le chemin restant se lit comme une invitation. */}
      {!cercle.membre ? (
        <div className="mc-pointscard">
          <div className="mc-pointscard__watermark" aria-hidden="true" />
          <div className="mc-pointscard__inner">
            <div className="mc-pointscard__label">Le Cercle s’ouvre au {cercle.seuil}ᵉ passage</div>
            <div className="mc-pointscard__row">
              <span className="mc-pointscard__big">{cercle.venues}</span>
              <span className="mc-pointscard__unit">
                {cercle.venues > 1 ? 'passages' : 'passage'} sur {cercle.seuil}
              </span>
            </div>
            <div className="mc-bar mc-bar--invert">
              <div style={{ width: `${Math.min(100, Math.round((cercle.venues / Math.max(1, cercle.seuil)) * 100))}%` }} />
            </div>
            <div className="mc-pointscard__hint">
              {cercle.venues === 0
                ? `Votre lignée commence à votre première venue. Le Cercle vous accueillera au ${cercle.seuil}ᵉ passage.`
                : `Encore ${cercle.reste} passage${cercle.reste > 1 ? 's' : ''} et la maison vous accueille dans son Cercle.`}
            </div>
          </div>
        </div>
      ) : (
        /* points de reconnaissance */
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
      )}

      {/* paliers de reconnaissance — définis au Trône */}
      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Reconnaissance honorifique</div>
      <div className="mc-stack mc-rewardgrid" style={{ gap: 10 }}>
        {ladder.map((t, i) => {
          const svc = services.find((s) => s.id === t.serviceId);
          const on = points >= t.pts;
          return (
            <div key={t.id} className="mc-rewardrow">
              <span className="mc-rewardrow__glyph">{tierGlyph(t, i)}</span>
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

/* ---------- Mes enfants ----------
   Un mineur n'a ni compte, ni e-mail, ni téléphone : c'est sa mère qui agit
   pour lui, et c'est elle seule qui connaît sa date de naissance — une petite
   de trois ans ne la dira pas au comptoir.

   ELLE NE CRÉE POURTANT AUCUNE FICHE. Elle dépose un prénom et une date ; rien
   dans ce qu'elle écrit ne désigne quelqu'un d'existant. La Maison regarde, et
   c'est elle qui ouvre la tête. Sans ce détour, il suffirait de rattacher à sa
   famille la fiche d'une autre cliente pour la lire entière. */
function MesEnfants({ toast }: { toast: (m: string) => void }) {
  const client = useClient();
  const [clients] = useClients();
  const [familles] = useFamilies();
  const [declarations] = useEnfantsDeclares();
  const [ouvert, setOuvert] = useState(false);
  const [prenom, setPrenom] = useState('');
  /* SON NOM À LUI, demandé — jamais déduit du vôtre. L'enfant porte le nom de
     son père, et beaucoup de mamans sont inscrites sous leur nom de jeune
     fille : le déduire de la déclarante écrivait un nom faux sur sa fiche. */
  const [nom, setNom] = useState('');
  const [naissance, setNaissance] = useState('');
  const [erreur, setErreur] = useState('');

  if (!client) return null;
  const aujourdhui = todayIso();
  const mesTetes = tetesPortees(client, clients, familles, aujourdhui);
  const mesDemandes = declarationsDe(declarations, client.id);
  const attente = mesDemandes.filter((d) => d.statut === 'en attente');
  const refusees = mesDemandes.filter((d) => d.statut === 'refusé');

  const envoyer = () => {
    const r = declarerEnfant(client, prenom, nom, naissance, aujourdhui);
    if (!r.ok) { setErreur(r.erreur ?? 'Cette demande n’a pas pu être envoyée.'); return; }
    setErreur('');
    setPrenom('');
    setNom('');
    setNaissance('');
    setOuvert(false);
    toast('Demande transmise — la maison ouvre sa fiche et vous prévient.');
  };

  /* LE PROFIL NE PROPOSE PLUS UN ENFANT À TOUT LE MONDE.
     La section entière — titre, phrase d'invitation, bouton « + Ajouter un
     enfant » — s'affichait sur CHAQUE profil, y compris ceux qui n'ont pas
     d'enfant à inscrire : on demandait quelque chose de très intime à des
     clientes qui n'avaient rien demandé.
     Elle ne paraît donc en entier que pour un PARENT CONNU — une tête déjà
     ouverte par la Maison, une demande en cours, ou un refus à lire. Pour les
     autres, la porte reste ouverte mais discrète : une seule ligne, sans
     titre ni exposé, qui déplie le formulaire si on la touche. */
  const parenteConnue = mesTetes.length > 0 || attente.length > 0 || refusees.length > 0;

  if (!parenteConnue && !ouvert) {
    return (
      <button className="mc-textbtn" style={{ marginTop: 18 }} onClick={() => setOuvert(true)}>
        Un enfant à inscrire ?
      </button>
    );
  }

  return (
    <>
      {parenteConnue && <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Mes enfants</div>}

      {parenteConnue && mesTetes.length === 0 && attente.length === 0 && (
        <div className="mc-emptyline" style={{ lineHeight: 1.55 }}>
          Vos enfants peuvent avoir leurs propres rendez-vous, à leur nom, avec leur suivi.
          C’est vous qui réservez et réglez pour eux.
        </div>
      )}

      {mesTetes.map((e) => {
        const a = ageDe(e.birthday, aujourdhui);
        return (
          <div key={e.id} className="mc-crownstatus" style={{ marginTop: 8 }}>
            <span className="mc-crownstatus__filet" />
            <div className="mc-crownstatus__top">
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{e.name}</span>
              <span className="mc-pillseal">{a !== undefined ? `${a} an${a > 1 ? 's' : ''}` : 'âge à préciser'}</span>
            </div>
          </div>
        );
      })}

      {attente.map((d) => (
        <div key={d.id} className="mc-crownstatus" style={{ marginTop: 8, opacity: .75 }}>
          <span className="mc-crownstatus__filet" style={{ background: 'var(--color-argile)' }} />
          <div className="mc-crownstatus__top">
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{nomPropose(d)}</span>
            <span className="mc-pillseal">En attente de la maison</span>
          </div>
        </div>
      ))}

      {/* UN REFUS SE LIT. Une demande qui disparaît sans un mot se redépose
          indéfiniment, et personne ne comprend pourquoi. */}
      {refusees.slice(0, 2).map((d) => (
        <div key={d.id} className="mc-emptyline" style={{ marginTop: 8, lineHeight: 1.55 }}>
          {d.prenom} — la maison n’a pas retenu cette demande.
          {d.motif ? ` « ${d.motif} »` : ' Passez au salon, on en parle.'}
        </div>
      ))}

      {ouvert ? (
        <div style={{ marginTop: 12 }}>
          <div className="mc-field-label">Son prénom</div>
          <input
            className="mnd-input"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            placeholder="Mahoussi"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div className="mc-field-label" style={{ marginTop: 12 }}>Son nom de famille</div>
          <input
            className="mnd-input"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Houngbédji"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div className="mc-footnote" style={{ textAlign: 'left', marginTop: 6, lineHeight: 1.5 }}>
            Le sien, tel qu’il est écrit à l’état civil — il peut être différent du vôtre.
          </div>
          <div className="mc-field-label" style={{ marginTop: 12 }}>Sa date de naissance</div>
          <input
            className="mnd-input"
            type="date"
            value={naissance}
            max={aujourdhui}
            onChange={(e) => setNaissance(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div className="mc-footnote" style={{ textAlign: 'left', marginTop: 6, lineHeight: 1.5 }}>
            Elle nous sert à tenir son suivi, et c’est elle qui vous donne accès à son espace
            jusqu’à ses dix-huit ans.
          </div>
          {erreur && <div className="mc-form-err">{erreur}</div>}
          <button className="mc-cta mc-cta--indigo" style={{ marginTop: 14 }} onClick={envoyer}>
            Envoyer à la maison
          </button>
          <button className="mc-textbtn" style={{ marginTop: 8 }} onClick={() => { setOuvert(false); setErreur(''); }}>
            Annuler
          </button>
        </div>
      ) : (
        /* Le bouton plein ne s'offre qu'à un parent connu : pour les autres,
           c'est la ligne discrète du dessus qui a ouvert ce formulaire. */
        parenteConnue && (
          <button className="mc-cta mc-cta--outline" style={{ marginTop: 12 }} onClick={() => setOuvert(true)}>
            + Ajouter un enfant
          </button>
        )
      )}
    </>
  );
}

export function ProfilTab({ toast }: { toast: (m: string) => void }) {
  const client = useClient();
  const clientId = useClientId();
  const { branch } = useBranch();
  const { session } = useAuth();
  const email = client?.email ?? session?.user?.email ?? '';
  /* Le calibre affiché se déduit du comptage — le style à la main est retiré. */
  const [bandsProfil] = useModelBands();

  const [name, setName] = useState(client?.name ?? '');
  const [phone, setPhone] = useState(client?.phone ?? '');
  const [city, setCity] = useState(client?.city ?? '');
  const [birthday, setBirthday] = useState(client?.birthday ?? '');

  /* LA FICHE PEUT ARRIVER APRÈS L'ÉCRAN — synchronisation en cours, adoption,
     première visite. L'amorce `useState` ne se rejoue pas : le formulaire
     restait VIDE devant une fiche pleine, et la cliente retapait son nom en
     boucle (Merine, 12 août). Dès que la fiche change de tête, on ressème. */
  useEffect(() => {
    if (!client) return;
    setName(client.name ?? '');
    setPhone(client.phone ?? '');
    setCity(client.city ?? '');
    setBirthday(client.birthday ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id]);

  /* Notifications téléphone (Web Push). */
  const [pstate, setPstate] = useState<PushState>('default');
  const [pbusy, setPbusy] = useState(false);
  useEffect(() => { void pushState().then(setPstate); }, []);
  const togglePush = async () => {
    if (pbusy) return;
    setPbusy(true);
    if (pstate === 'subscribed') {
      await disablePush();
      setPstate(await pushState());
      setPbusy(false);
      toast('Notifications désactivées sur ce téléphone.');
    } else {
      const ok = await enablePush(clientId);
      setPstate(await pushState());
      setPbusy(false);
      toast(ok ? 'Notifications activées sur ce téléphone.' : 'Notifications non activées — autorisez-les dans le navigateur.');
    }
  };

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast('Votre nom est nécessaire — la maison vous appelle par votre nom.');
      return;
    }
    /* LA FICHE D'ABORD, L'ÉCRITURE ENSUITE. Avant la fiche (synchronisation en
       cours), le `map` n'écrivait RIEN et le toast disait quand même
       « enregistré » — la cliente retapait son prénom sans fin (Merine,
       12 août). On assure la fiche, et si elle n'est toujours pas là, on le
       DIT au lieu de mentir. */
    ensureClient(clientId, session?.user?.email, branch.id, n, session?.user?.id);
    if (!clientsStore.get().some((c) => c.id === clientId)) {
      toast('La maison synchronise encore votre dossier — réessayez dans un instant.');
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
        <div style={{ minWidth: 0 }}>
          <div className="mc-idcard__name">{client?.name ?? 'Ma Couronne'}</div>
          {email && <div className="mc-idcard__meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>}
          <div className="mc-idcard__meta">Tête couronnée depuis {sinceYear} · {branch.name}</div>
        </div>
      </div>

      {/* MES ENFANTS. C'est le parent qui écrit la date de naissance — une petite
          de trois ans ne la dira jamais au comptoir, et la Maison ne la devine
          pas. Il ne crée pas de fiche pour autant : il dépose un prénom et une
          date, la Maison ouvre la tête. */}
      <MesEnfants toast={toast} />

      {pstate !== 'unsupported' && (
        <>
          <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Notifications</div>
          <div className="mc-pushrow">
            <div style={{ minWidth: 0 }}>
              <div className="mc-pushrow__t">Rappels & confirmations sur ce téléphone</div>
              <div className="mc-pushrow__s">
                {pstate === 'subscribed' ? 'Vous serez prévenue à chaque réservation, modification et avant vos rendez-vous.'
                  : pstate === 'denied' ? 'Notifications bloquées — réactivez-les dans les réglages du navigateur.'
                  : 'Activez pour recevoir vos confirmations et rappels de rendez-vous.'}
              </div>
            </div>
            {pstate === 'denied' ? (
              <span className="mc-pushrow__on" style={{ color: 'var(--mc-error)' }}>Bloquées</span>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={pstate === 'subscribed'}
                aria-label="Activer les notifications"
                className={`mc-switch ${pstate === 'subscribed' ? 'is-on' : ''}`}
                onClick={() => void togglePush()}
                disabled={pbusy}
              >
                <span className="mc-switch__knob" />
              </button>
            )}
          </div>
        </>
      )}

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

      {/* « MAÎTRE PRÉFÉRÉ » RETIRÉ (13 août, décision de Yéman) : la cliente
          ne choisit pas les maîtres — les mains sont l'affaire de la maison,
          au Profil comme au tunnel (décision du 10 août). */}

      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>Votre couronne</div>
      <div className="mc-preflist">
        <div className="mc-inforow">
          <span>Calibre</span>
          {/* Déduit du comptage de la Maison — il ne se choisit pas. */}
          <span className="mc-inforow__v">{calibreDe(client?.lockCount, bandsProfil) ?? 'À compter au salon'}</span>
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

  /* Notifications effacées par la cliente : masquées + retirées du compteur. */
  const [dismissed] = useStore(dismissedMcStore);
  const dset = new Set(dismissed);
  const devisV = devis.filter((d) => !dset.has(`devis-${d.id}`));
  const upcomingV = upcoming.filter((a) => !dset.has(`resa-${a.id}`));
  const showRappel = !!next && !dset.has(`rappel-${next.id}`);
  const dismiss = (id: string) => dismissedMcStore.set((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const clearAll = () =>
    dismissedMcStore.set((prev) => {
      const s = new Set(prev);
      for (const d of devis) s.add(`devis-${d.id}`);
      for (const a of upcoming) s.add(`resa-${a.id}`);
      if (next) s.add(`rappel-${next.id}`);
      return [...s];
    });

  /* Le pont devis → ERP : accepter ici rend le devis « accepté » au Trône (Factures). */
  const acceptDevis = (id: string) => {
    invoicesStore.set((prev) => prev.map((i) => (i.id === id && i.status === 'envoyée' ? { ...i, status: 'acceptée' } : i)));
  };

  const empty = devisV.length === 0 && upcomingV.length === 0 && !showRappel;

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
        {!empty && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 24px 6px' }}>
            <button
              type="button"
              onClick={clearAll}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              Tout effacer
            </button>
          </div>
        )}
        {/* devis — envoyés par le Trône, acceptés ici */}
        {devisV.map((d) => (
          <div key={d.id} className="mc-notif" style={{ position: 'relative', paddingRight: 34 }}>
            <button type="button" aria-label="Effacer" onClick={() => dismiss(`devis-${d.id}`)} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 12 }}>✕</button>
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
        {showRappel && next && (
          <div className="mc-notif" style={{ position: 'relative', paddingRight: 34 }}>
            <button type="button" aria-label="Effacer" onClick={() => dismiss(`rappel-${next.id}`)} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 12 }}>✕</button>
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
        {upcomingV.map((a) => (
          <div key={a.id} className="mc-notif" style={{ position: 'relative', paddingRight: 34 }}>
            <button type="button" aria-label="Effacer" onClick={() => dismiss(`resa-${a.id}`)} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 12 }}>✕</button>
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
