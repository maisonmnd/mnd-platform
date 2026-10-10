import { asset } from '../../shared/asset';
import { DEVISE_MAISON } from '../../shared/identite';
import { CarteDeMarraine } from '../../ds/CarteDeMarraine';
import { graineDansDite, MonAmbassade, useMaCarte, useMaGraine, visitesDites } from './MaCarte';
import { nomDuRang, rangDe, rangSuivant, soinsEnAttente } from '../../shared/parrainage-pur';
import { MapPin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { notifyLocal } from '../../shared/ics';
import { enablePush, disablePush, pushState, type PushState } from '../../shared/push';
import { useBranch } from '../../shared/branches';
import { signOut, useAuth } from '../../shared/auth';
import { useAppointments, venuesHonorees, type Appointment } from '../../shared/agenda';
import { useCategories, useProducts, useServices } from '../../shared/catalog';
import { clientsStore, useClients, useFamilies, usePersonas, remiseFamillePct, type Client } from '../../shared/clients';
import { vitrineConfigStore } from '../../shared/bridges';
import { recoPourEnvie } from '../../shared/reco';
import { envieLabel, type EnvieKey } from '../../shared/quiz';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, estProposable, calibreDe } from '../../shared/pricing';
import { predictNextVisit, cadenceLabel } from '../../shared/cadence';
import { dernierBilanDe, useBilans, type Bilan } from '../../shared/bilans';
import { INGREDIENTS } from '../revelateur/communaute';

/** « Le neem · L’aloès » : les ingrédients d'un temps, par leur nom. */
const nomsDesIngredients = (slugs: string[]): string =>
  slugs.map((s) => INGREDIENTS.find((i) => i.slug === s)?.nom ?? s).join(' · ');
import { serieDesComptages } from '../../shared/comptages';
import { CourbeDesJauges, CourbeDeLaPousse } from '../../ds/courbes';
import { derniereCouleur, ouvertureDuProgramme, suivreLeProtocole, useProtocoles, protocoleNatif, etapesPourLaTete, MOT_DE_L_ETAT } from '../../shared/protocoles';
import { ageDe, tetesPortees, statutFidelite, type StatutFidelite } from '../../shared/accounts';
import { corrigerNaissance, declarationsDe, rattacherEnfant, nomPropose, useEnfantsDeclares } from '../../shared/enfants';
import { invoiceTotal, invoicesStore, useInvoices, type Invoice, type InvoiceLine } from '../../shared/finance';
import { cercleSeuilStore, foyerSeuilStore, estDuCercle, useFoyerTiers } from '../../shared/offers';
import { deliveryFee, useSettings } from '../../shared/settings';
import { palierDuCarnet, pasSuivant, jourLocal, PALIER_DIT } from '../../shared/paliers';
import { createStore, uid, useStore } from '../../shared/store';
import {
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
import { DateEnClair } from '../../ds/dates';
import { useTheme } from './theme';
import { t, locale, langue, useLangue, changeLaLangue, anglaisPropose, prix, motsDeDate } from './i18n';

/* Les cinq onglets de Ma Couronne + le panneau de notifications. */

type OpenBooking = (prefill?: BookingPrefill) => void;

/* Chiffre du sceau d'un palier — même convention que le Trône (Cercle) : le
   rang dans l'échelle triée, le champ g des anciens paliers restant prioritaire. */
const ROMANS = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ'];
const tierGlyph = (tier: { g: string }, idx: number) => tier.g || ROMANS[idx] || '✦';

/* LE JOUR DANS SA LANGUE (3 octobre 2026). En français, le libellé de la
   maison (« Sam. 5 juil »), inchangé ; en anglais, « Sat 5 Oct ». */
const jourDit = (iso: string): string => {
  if (langue() !== 'en') return dayLabelIso(iso);
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? dayLabelIso(iso) : d.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

/* LE RYTHME DANS SA LANGUE : le juge (seuils, arrondis) reste celui de
   shared/cadence.ts ; seule la phrase se traduit. */
const rythmeDit = (days: number): string => {
  const brut = cadenceLabel(days);
  const n = /~(\d+)/.exec(brut)?.[1] ?? String(days);
  if (brut.endsWith(' mois')) return t('toutes les ~{n} mois', { n });
  if (brut.endsWith(' semaines')) return t('toutes les ~{n} semaines', { n });
  if (brut.endsWith(' j')) return t('tous les ~{n} j', { n });
  return brut;
};

/* Le lecteur du bilan — la cliente relit ce que la maison a remis.

   IL S'OUVRE SUR L'ESSENTIEL — 4 octobre 2026, réponse au sélecteur : le
   résumé en trois phrases, sa routine, ce que la Maison propose avec un
   bouton pour le réserver. Le bilan entier reste à un geste, et le document
   (le PDF Maison MND) aussi. Un bilan d'avant, sans résumé, s'ouvre entier,
   comme il l'a toujours fait. La signature du maître reste : un bilan est un
   document signé. */

/** La première phrase d'un résumé : la ligne de la carte d'accueil. */
const premierePhrase = (s: string): string => {
  const m = s.match(/^.+?[.!?](?=\s|$)/);
  return (m ? m[0] : s).trim();
};

export function BilanLecteur({ bilan, porteuse, onClose, onReserver }: {
  bilan: Bilan;
  porteuse: Client;
  onClose: () => void;
  onReserver?: (serviceId: string) => void;
}) {
  const [entier, setEntier] = useState(!bilan.resume);
  const [papier, setPapier] = useState<'' | 'prepare' | 'rate'>('');
  const telecharge = async () => {
    setPapier('prepare');
    try {
      const [{ bilanPdf }, { donneesDuBilanPdf }] = await Promise.all([import('../../shared/pdf'), import('../../shared/bilan-document')]);
      await bilanPdf(donneesDuBilanPdf(bilan, porteuse));
      setPapier('');
    } catch {
      setPapier('rate');
    }
  };

  return (
    <div className="mc-bilanveil" onClick={onClose} role="dialog" aria-label={t('Bilan de séance')}>
      <div className="mc-bilancard" onClick={(e) => e.stopPropagation()}>
        <div className="mc-micro-eyebrow">{t('Le Carnet de Suivi · {numero}', { numero: bilan.numero })}</div>
        <h2 className="mc-serif-title" style={{ margin: '6px 0 2px' }}>{t('Bilan de séance.')}</h2>
        <div className="mc-bilanmeta">
          {t('Séance du {date}', { date: jourDit(bilan.date) })}
          {bilan.prestation ? ` · ${bilan.prestation}` : ''}
          {bilan.duree ? ` · ${bilan.duree}` : ''}
        </div>

        {bilan.resume && (
          <p className="mc-bilanresume">{bilan.resume}</p>
        )}

        {bilan.resume && (
          <>
            <div className="mc-bilansec">{t('Votre routine à la maison')}</div>
            <div className="mc-bilanroutine">
              {bilan.rituel.map((tp) => (
                <div key={tp.nom}>
                  <b>{tp.nom}</b>
                  <span>{tp.cadence}</span>
                  {tp.ingredients?.length ? <em>{nomsDesIngredients(tp.ingredients)}</em> : null}
                </div>
              ))}
            </div>
          </>
        )}

        {(bilan.propositions?.length ?? 0) > 0 && (
          <>
            <div className="mc-bilansec">{t('Ce que la Maison vous propose')}</div>
            {bilan.propositions!.map((p) => (
              <div key={p.serviceId} className="mc-bilanpropo">
                <div>
                  <div className="n">{p.nom}</div>
                  {p.quand && <div className="q">{p.quand}</div>}
                </div>
                {onReserver && (
                  <button type="button" className="mc-smallcta" onClick={() => onReserver(p.serviceId)}>{t('Réserver')}</button>
                )}
              </div>
            ))}
          </>
        )}

        {bilan.resume && (
          <button type="button" className="mc-bilanentier" onClick={() => setEntier((e) => !e)} aria-expanded={entier}>
            {entier ? t('Replier le bilan') : t('Voir le bilan entier')}
          </button>
        )}

        {entier && (
          <>
            {bilan.diagnostic && (
              <>
                <div className="mc-bilansec">{t('Ce que nous avons vu')}</div>
                <p className="mc-bilantexte">{bilan.diagnostic}</p>
              </>
            )}
            {bilan.sens && (
              <>
                <div className="mc-bilansec">{t('Ce que cela veut dire')}</div>
                <p className="mc-bilantexte">{bilan.sens}</p>
              </>
            )}

            <div className="mc-bilansec">{t('L’état de la couronne')}</div>
            {bilan.jauges.map((j) => (
              <div key={j.nom} className="mc-bilanjauge">
                <span className="n">{j.nom}</span>
                <span className="dots" role="img" aria-label={t('{n} sur 5', { n: j.valeur })}>
                  {[1, 2, 3, 4, 5].map((v) => <i key={v} className={v <= j.valeur ? 'on' : ''} />)}
                </span>
                <span className="note">{j.note}</span>
              </div>
            ))}

            {bilan.points.length > 0 && (
              <>
                <div className="mc-bilansec">{t('Les points clés de la séance')}</div>
                <ul className="mc-bilanpoints">
                  {bilan.points.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </>
            )}

            {bilan.solutions && (
              <>
                <div className="mc-bilansec">{t('Ce que la Maison vous propose')}</div>
                <p className="mc-bilantexte">{bilan.solutions}</p>
              </>
            )}

            <div className="mc-bilansec">{t('Le rituel à domicile')}</div>
            {bilan.rituel.map((tp) => (
              <div key={tp.nom} className="mc-bilantemps">
                <div className="n">{tp.nom} <span>· {tp.cadence}</span></div>
                <p>{tp.texte}</p>
              </div>
            ))}
          </>
        )}

        {bilan.prochaineVisite && (
          <div className="mc-bilannext">{t('Prochaine visite conseillée, {quand}', { quand: bilan.prochaineVisite })}</div>
        )}
        {bilan.praticien && <div className="mc-bilansig">{bilan.praticien} · Maison MND · {DEVISE_MAISON}, {t('votre beauté est déjà là')}</div>}

        <button className="mc-cta mc-cta--outline" style={{ marginTop: 20 }} onClick={telecharge} disabled={papier === 'prepare'}>
          {papier === 'prepare' ? t('Le document se prépare…') : t('Télécharger le document')}
        </button>
        {papier === 'rate' && <div className="mc-bilanmeta" style={{ marginTop: 8 }}>{t('Le document n’a pas pu être préparé, réessayez dans un instant.')}</div>}
        <button className="mc-cta mc-cta--outline" style={{ marginTop: 10 }} onClick={onClose}>{t('Fermer')}</button>
      </div>
    </div>
  );
}

function useClientAppointments(cibleId?: string): Appointment[] {
  const [appts] = useAppointments();
  const monId = useClientId();
  const clientId = cibleId ?? monId;
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
function useUpcomingAppointments(cibleId?: string): Appointment[] {
  const { branch } = useBranch();
  const [appts] = useAppointments();
  const monId = useClientId();
  const clientId = cibleId ?? monId;
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

function useNextAppointment(cibleId?: string): Appointment | undefined {
  return useUpcomingAppointments(cibleId)[0];
}

/** OÙ ELLE EN EST DU CERCLE. On y entre au N-ième passage (réglé au Trône) : une
    cliente qui n'y est pas encore ne doit pas lire « 0 point » sans comprendre —
    c'est ainsi qu'un programme de fidélité passe pour cassé. Elle voit donc le
    chemin qu'il lui reste, pas une porte close. */
function useCercle(): StatutFidelite & { membre: boolean } {
  const [appts] = useAppointments();
  const client = useClient();
  const [clients] = useClients();
  const [families] = useFamilies();
  const [seuil] = useStore(cercleSeuilStore);
  const [seuilFoyer] = useStore(foyerSeuilStore);
  return useMemo(() => {
    /* PAR TÊTE (25 août) : le Cercle se gagne par SES propres venues, à plein
       tarif. Un prix convenu, un enfant/membre dépendant, un foyer — chacun sa
       reconnaissance. Un seul juge, partagé avec le Trône (`statutFidelite`). */
    if (!client) {
      return { genre: 'passage', membreCercle: false, venues: 0, seuil, reste: seuil, convenu: false,
        dependant: false, foyer: false, depenseFoyer: 0, seuilFoyer, foyerAtteint: false, resteFoyer: seuilFoyer, membre: false };
    }
    const s = statutFidelite(client, clients, families, appts, seuil, seuilFoyer);
    return { ...s, membre: s.membreCercle };
  }, [appts, client, clients, families, seuil, seuilFoyer]);
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

/** LES BILANS REMIS CES TRENTE DERNIERS JOURS — 4 octobre 2026 : la
    notification de la signature a sa ligne dans la cloche. */
function useBilansRecents(): Bilan[] {
  const client = useClient();
  const [bilans] = useBilans();
  return useMemo(() => {
    if (!client) return [];
    const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    return bilans.filter((b) => b.clientId === client.id && b.remisLe >= depuis)
      .sort((a, b) => b.remisLe.localeCompare(a.remisLe));
  }, [bilans, client]);
}

function useNotifCount(): number {
  const devis = useClientDevis();
  const upcoming = useUpcomingAppointments();
  const bilans = useBilansRecents();
  const [dismissed] = useStore(dismissedMcStore);
  const d = new Set(dismissed);
  return devis.filter((x) => x.status === 'envoyée' && !d.has(`devis-${x.id}`)).length
    + upcoming.filter((a) => !d.has(`resa-${a.id}`)).length
    + bilans.filter((b) => !d.has(`bilan-${b.id}`)).length;
}

/* LA PHRASE DU POURQUOI (maquette accueil, repère 5) : la recommandation dit
   sa raison en toutes lettres — l'envie qu'ELLE a déclarée au quiz, jamais un
   fait inventé sur sa fibre. Une par envie, dans les mots de la maison. */
const PHRASE_ENVIE: Record<EnvieKey, string> = {
  longueur: 'Pour les centimètres que vous êtes venue chercher, la longueur se gagne à la racine, séance après séance.',
  eclat: 'Pour l’éclat que vous êtes venue chercher, la lumière se scelle mèche après mèche.',
  protection: 'Pour protéger ce qui pousse, la saison ne doit rien prendre à votre couronne.',
  transformation: 'Pour la transformation que vous êtes venue chercher, sans rien sacrifier de votre couronne.',
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
  const date = d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
  return age > 1 ? t('{date} · {age} ans', { date, age }) : t('{date} · {age} an', { date, age });
}

/* ================= ACCUEIL ================= */

export function HomeTab({
  onOpenBooking,
  onOpenCompose,
  onOpenNotif,
  onOpenRdv,
  goGamme,
  toast,
  onOpenCarte,
}: {
  onOpenBooking: OpenBooking;
  onOpenCompose: () => void;
  onOpenNotif: () => void;
  /** Sans identifiant : la liste. Avec : la fiche de CE rendez-vous (7 octobre 2026). */
  onOpenRdv: (id?: string) => void;
  goGamme: () => void;
  toast: (m: string) => void;
  /** La carte de marraine (28 septembre 2026). */
  onOpenCarte?: () => void;
}) {
  const client = useClient();
  const maCarte = useMaCarte();
  /* DE MAIN EN MAIN (9 octobre 2026) : sans Graine, le chemin vers elle. */
  const maGraine = useMaGraine();
  const soinsQuiAttendent = soinsEnAttente(client?.soinsOfferts);
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
    const offre = servicesVisibles.filter((s) => estProposable(s, pricing, venuesTete, !!client?.familyId));
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
    notifyLocal(t('Votre rituel approche'), t('{jour} · {heure}, la maison vous attend.', { jour: jourDit(soon.date), heure: soon.time }));
  }, [soon]);

  const pickOffer = (o: Offer) => {
    if (o.act === 'invite') {
      toast(t('Invitation prête à transmettre sur WhatsApp.'));
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
        <button className="mc-bell" aria-label={t('Notifications')} onClick={onOpenNotif}>
          ♟{notifCount > 0 && <span className="mc-bell__count">{notifCount}</span>}
        </button>
        <div className="mc-homehero__text">
          <div className="mc-micro-eyebrow">{t('Votre couronne')}</div>
          <div className="mc-homehero__greet">{prenom ? t('Bonjour, {prenom}.', { prenom }) : t('Bonjour.')}</div>
        </div>
      </div>

      <div className="mc-pagepad">
        {/* rappel discret — rituel sous 48 h */}
        {soon && (
          <button className="mc-remindbanner" onClick={() => onOpenRdv(soon.id)}>
            <span className="mc-remindbanner__dot" aria-hidden="true" />
            <span className="mc-remindbanner__txt">
              {t('Votre rituel approche, {jour} · {heure}', { jour: jourDit(soon.date), heure: soon.time })}
            </span>
            <span className="mc-remindbanner__go">{t('Voir')}</span>
          </button>
        )}

        {/* LA CITATION EST RETIRÉE (14 août — « élimine tous les textes
            inutiles ») : une phrase qui ne porte ni geste ni information
            occupait une carte entière à chaque ouverture. */}

        {/* VOTRE PROCHAINE SÉANCE — EN TÊTE (maquette accueil, repère 2) : la
            séance prise, ou la séance PRÉDITE avec ses deux gestes. Le vide
            n'ouvre plus l'écran. */}
        <div className="mc-nextrdv">
          <div className="mc-nextrdv__row">
            <span className="mc-nextrdv__label">{t('Votre prochaine séance')}</span>
            {next && <span className="mc-nextrdv__status">{next.status === 'confirmé' ? t('Confirmé') : t('En attente')}</span>}
          </div>
          {next ? (
            /* LA CARTE S'OUVRE — 7 octobre 2026 (maquette validée) : toute la
               séance se touche et ouvre SA fiche. Aucun nom de maître. */
            <button type="button" className="mc-nextrdv__ouvrir" onClick={() => onOpenRdv(next.id)}>
              <div className="mc-nextrdv__service">{serviceNames(next, services)}</div>
              <div className="mc-nextrdv__when">{jourDit(next.date)} · {next.time}</div>
              {next.seriesTotal && (
                <span className="mc-nextrdv__seal" style={{ marginRight: 8 }}>
                  {t('Séance {i}/{n}', { i: next.seriesIndex ?? '', n: next.seriesTotal })}
                </span>
              )}
              {next.depositXof != null && (
                <span className="mc-nextrdv__seal">{next.depositConfirmed ? t('Acompte reçu') : t('Acompte')} · {prix(next.depositXof, currency)}</span>
              )}
              <span className="mc-nextrdv__voir">{t('Ouvrir')} →</span>
            </button>
          ) : predite ? (
            /* RIEN N'EST PRIS, MAIS LA MAISON SAIT — le ≈ dit l'estimation, la
               phrase dit le rythme, et DEUX gestes répondent (13 août) :
               « Réserver ce créneau » ouvre le tunnel SUR le jour prédit,
               « Choisir une autre date » l'ouvre grille libre. Même juge que
               la fiche du Trône (shared/cadence.ts). */
            <>
              {/* UNE TOUCHE — 29 septembre 2026 (« la réservation en 30
                  secondes », maquette validée) : le jour prédit, SON heure
                  habituelle et TOUS les gestes de sa dernière venue. Le
                  tunnel s'ouvre le moment déjà posé ; « Réserver » suffit. La
                  Maison choisit qui s'occupe d'elle : aucun nom ici. */}
              <div className="mc-nextrdv__service">≈ {jourDit(predite.iso!)}{predite.template?.time ? ` · ${predite.template.time}` : ''}</div>
              {predite.template && predite.template.serviceIds.length > 0 && (
                <div className="mc-nextrdv__when">{serviceNames(predite.template, services)}</div>
              )}
              <div className="mc-nextrdv__when">
                {predite.avgDays ? t('d’après votre rythme, {rythme}', { rythme: rythmeDit(predite.avgDays) }) : t('d’après votre rythme')}
              </div>
              {predite.template && predite.template.serviceIds.length > 0 && !moduleHidden(client, 'reserver') && (
                <>
                  <button
                    className="mc-cta mc-cta--copper"
                    style={{ marginTop: 14 }}
                    onClick={() => onOpenBooking({
                      serviceId: predite.template!.serviceIds[0],
                      serviceIds: predite.template!.serviceIds,
                      dateIso: predite.iso!,
                      ...(predite.template!.time ? { time: predite.template!.time, express: true } : {}),
                    })}
                  >
                    {t('Réserver ce moment')}
                  </button>
                  <button
                    className="mc-nextrdv__manage"
                    onClick={() => onOpenBooking({ serviceId: predite.template!.serviceIds[0], serviceIds: predite.template!.serviceIds })}
                  >
                    {t('Un autre moment')}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <div className="mc-nextrdv__service">{t('Aucun rituel à venir')}</div>
              <div className="mc-nextrdv__when">{t('La maison vous attend.')}</div>
            </>
          )}
          <button className="mc-nextrdv__manage" onClick={() => onOpenRdv()}>
            {t('Mes rendez-vous')}
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
                  return cal ? t('Couronne {calibre} · {n} locks', { calibre: cal, n: client?.lockCount ?? '' }) : t('Votre couronne');
                })()}
              </span>
            </div>
            {/* LE CERCLE RÉUNI (29 septembre) : plus de sceau à points, son rang
                d'ambassadrice. Depuis De main en main (9 octobre 2026), dès
                sa Graine : le rang se gagne, Graine comprise. */}
            {maCarte && (
              <span className="mc-pillseal">{t(nomDuRang(maCarte.rang))}</span>
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
                {cercle.venues > 1
                  ? t('{n} passages sur {seuil}', { n: cercle.venues, seuil: cercle.seuil })
                  : t('{n} passage sur {seuil}', { n: cercle.venues, seuil: cercle.seuil })}
                {cercle.venues === 0
                  ? t(', le Cercle s’ouvre au {seuil}ᵉ', { seuil: cercle.seuil })
                  : cercle.reste > 0
                    ? t(', encore {n} avant le Cercle', { n: cercle.reste })
                    : ''}
              </span>
            </div>
          ) : !maCarte ? (
            /* MEMBRE DU CERCLE, PAS ENCORE GRAINE (9 octobre 2026) : la ligne
               de la Graine, à la place des amies qu'elle ne peut pas encore
               inviter. */
            <div className="mc-crownstatus__progress">
              <div className="mc-bar"><div style={{ width: `${Math.min(100, Math.round((maGraine.visites / Math.max(1, maGraine.seuil)) * 100))}%` }} /></div>
              <span>{maGraine.reste > 0
                ? maGraine.reste > 1
                  ? t('Membre du Cercle · votre Graine dans {n} visites', { n: maGraine.reste })
                  : t('Membre du Cercle · votre Graine dans {n} visite', { n: maGraine.reste })
                : t('Membre du Cercle · votre carte se prépare à la Maison')}</span>
            </div>
          ) : (() => {
            const venues = client?.parrainage?.venues ?? 0;
            const suivant = rangSuivant(venues);
            if (!suivant) return null;
            const base = rangDe(venues).seuil;
            const pct = Math.round(((venues - base) / Math.max(1, suivant.seuil - base)) * 100);
            return (
              <div className="mc-crownstatus__progress">
                <div className="mc-bar"><div style={{ width: `${pct}%` }} /></div>
                <span>{venues === 0
                  ? t('Membre du Cercle · votre première amie vous fera Pousse')
                  : suivant.seuil - venues > 1
                    ? t('Encore {n} amies pour devenir {rang}', { n: suivant.seuil - venues, rang: t(suivant.nom) })
                    : t('Encore {n} amie pour devenir {rang}', { n: suivant.seuil - venues, rang: t(suivant.nom) })}</span>
              </div>
            );
          })()}
        </div>

        {/* offres instantanées — créées au Trône (Marketing), fenêtre jour/heure vivante */}
        {offers.length > 0 && !moduleHidden(client, 'offres') && (
          <>
        <div className="mc-offershead">
          <span className="mc-offershead__label">{t('Offres instantanées')}</span>
          {countdown && <span className="mc-offershead__timer">{t('Expire dans {temps}', { temps: countdown })}</span>}
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
            {t('Réserver un rituel')}
          </button>
        )}
        {!moduleHidden(client, 'compose') && (
          <button className="mc-cta mc-cta--outline" style={{ marginTop: 10 }} onClick={onOpenCompose}>
            {t('✦ Rituel sur-mesure')}
          </button>
        )}

        {/* VOTRE DERNIER BILAN — le Carnet de Suivi remis par la maison. */}
        {monBilan && (
          <>
            <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>{t('Votre dernier bilan')}</div>
            <button className="mc-recocard" style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--hairline)', background: 'var(--surface-card)' }} onClick={() => setLireBilan(true)}>
              <div className="mc-recocard__body">
                <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>{t('Le Carnet de Suivi')}</div>
                <div className="mc-recocard__name">{t('Séance du {date}', { date: jourDit(monBilan.date) })}</div>
                <div className="mc-recocard__line">{monBilan.resume ? premierePhrase(monBilan.resume) : monBilan.prestation ?? t('Rituel de la maison')}</div>
              </div>
              <span className="mc-arrowbtn" aria-hidden="true">→</span>
            </button>
          </>
        )}
        {lireBilan && monBilan && client && <BilanLecteur bilan={monBilan} porteuse={client} onClose={() => setLireBilan(false)} onReserver={moduleHidden(client, 'reserver') ? undefined : (serviceId) => { setLireBilan(false); onOpenBooking({ serviceId }); }} />}

        {/* LA MAISON RECOMMANDE — une PRESTATION désignée (le juge du quiz),
            au prix de la cliente, et la flèche RÉSERVE. Le produit prescrit
            sur sa fiche garde sa carte. Sans désignation : rien du tout —
            l'ancien repli sur `products[0]` présentait le premier flacon de
            la Gamme en recommandation de la maison. */}
        {/* ══ SA CARTE DE MARRAINE — 28 septembre 2026 ══════════════
            Le recto à son prénom, en petit ; une touche ouvre la carte
            entière, son QR et ses filleules. Un soin qui l'attend se dit
            ici, en premier. */}
        {/* DE MAIN EN MAIN — 9 octobre 2026. La carte est celle de la
            Graine ; sans elle, une petite carte dit le chemin et ouvre le
            Cercle. Une récompense qui attend (le Foyer compris) se dit dans
            les deux cas, en premier. */}
        {!maCarte && onOpenCarte && (
          <>
            <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>{t('De main en main')}</div>
            <button type="button" onClick={onOpenCarte}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 16, border: '1px solid var(--mc-filet-12)', background: 'var(--mc-blanc)', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
              <span aria-hidden="true" style={{ position: 'relative', width: 64, height: 64, flex: 'none' }}>
                <svg viewBox="0 0 64 64" style={{ position: 'absolute', inset: 0 }}>
                  <circle cx={32} cy={32} r={28} fill="none" style={{ stroke: 'var(--mc-piste)' }} strokeWidth={4} />
                  <circle cx={32} cy={32} r={28} fill="none" style={{ stroke: 'var(--copper-700)' }} strokeWidth={4} strokeLinecap="round"
                    strokeDasharray={`${(2 * Math.PI * 28 * Math.max(0.02, Math.min(1, maGraine.visites / Math.max(1, maGraine.seuil)))).toFixed(1)} ${(2 * Math.PI * 28).toFixed(1)}`} transform="rotate(-90 32 32)" />
                </svg>
                <img src={asset('/assets/motifs/medaillon-seul-cuivre.png')} alt="" style={{ position: 'absolute', left: 13, top: 13, width: 38, height: 38 }} />
              </span>
              <span style={{ display: 'grid', gap: 4, flexGrow: 1 }}>
                <span style={{ fontFamily: 'var(--font-serif, Georgia)', fontSize: 19, color: 'var(--mc-encre)', lineHeight: 1.15 }}>
                  {soinsQuiAttendent.length ? t('Une récompense vous attend.') : maGraine.reste > 0 ? graineDansDite(maGraine.reste) : t('Votre carte se prépare à la Maison.')}
                </span>
                <span style={{ fontSize: 12.5, color: soinsQuiAttendent.length ? 'var(--copper-700)' : 'var(--mc-doux)' }}>
                  {soinsQuiAttendent.length ? t('Un soin vous attend : {soin}', { soin: soinsQuiAttendent[0].libelle }) : visitesDites(maGraine)}
                </span>
              </span>
              <span aria-hidden style={{ color: 'var(--copper-700)', fontSize: 18 }}>→</span>
            </button>
          </>
        )}
        {maCarte && onOpenCarte && (
          <>
            <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>{t('De main en main · {rang}', { rang: t(nomDuRang(maCarte.rang)) })}</div>
            <button type="button" onClick={onOpenCarte}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 16, border: '1px solid var(--mc-filet-12)', background: 'var(--mc-blanc)', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}>
              <CarteDeMarraine donnees={maCarte} largeur={120} retournable={false} />
              <span style={{ display: 'grid', gap: 4, flexGrow: 1 }}>
                <span style={{ fontFamily: 'var(--font-serif, Georgia)', fontSize: 19, color: 'var(--mc-encre)', lineHeight: 1.15 }}>{soinsQuiAttendent.length ? t('Une récompense vous attend.') : t('Offrez la Maison à une amie.')}</span>
                <span style={{ fontSize: 12.5, color: soinsQuiAttendent.length ? 'var(--copper-700)' : 'var(--mc-doux)' }}>
                  {soinsQuiAttendent.length ? t('Un soin vous attend : {soin}', { soin: soinsQuiAttendent[0].libelle }) : t('Votre code {code}', { code: maCarte.code })}
                </span>
              </span>
              <span aria-hidden style={{ color: 'var(--copper-700)', fontSize: 18 }}>→</span>
            </button>
          </>
        )}
        {recoPresta ? (
          <>
            <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>{t('La maison vous recommande')}</div>
            <div className="mc-recocard">
              <div className="mc-productvisual"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
              <div className="mc-recocard__body">
                <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>
                  {client?.envie ? t('Pour votre envie · {envie}', { envie: t(envieLabel(client.envie) ?? '') }) : t('Choisie pour votre couronne')}
                </div>
                <div className="mc-recocard__name">{recoPresta.service.name}</div>
                <div className="mc-recocard__line">
                  {recoPresta.service.hidePrice
                    ? t('Prix au fauteuil, la maison vous dira')
                    : (() => { const p = personalPriceXof(recoPresta.service, pricing, services, produits); return p > 0 ? t('{prix} · votre prix', { prix: prix(p, currency) }) : t('Sur devis'); })()}
                </div>
                {client?.envie && (
                  <div className="mc-recocard__why">{t(PHRASE_ENVIE[client.envie])}</div>
                )}
              </div>
              {!moduleHidden(client, 'reserver') && (
                <button className="mc-arrowbtn" aria-label={t('Réserver cette prestation')} onClick={() => onOpenBooking({ serviceId: recoPresta.service.id })}>→</button>
              )}
            </div>
          </>
        ) : chosenReco ? (
          <>
            <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>{t('Du Carnet de Suivi')}</div>
            <div className="mc-recocard">
              <div className="mc-productvisual"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
              <div className="mc-recocard__body">
                <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>
                  {client?.preferredMaster ? t('Recommandé par {nom}', { nom: client.preferredMaster }) : t('La maison recommande')}
                </div>
                <div className="mc-recocard__name">{chosenReco.name}</div>
                <div className="mc-recocard__line">
                  {productMeta(chosenReco.id).line} · {prix(chosenReco.priceXof, currency)}
                </div>
              </div>
              <button className="mc-arrowbtn" aria-label={t('Voir la gamme')} onClick={goGamme}>→</button>
            </div>
          </>
        ) : null}
        <div style={{ height: 26 }} />
      </div>
    </div>
  );
}

/* ================= LA COURONNE DE L'ENFANT (écran 2, maquette du 9 août) ==
   Quand le sélecteur regarde une tête portée, l'accueil devient LE SIEN :
   sa couronne, son calibre, son prochain rituel — et le bouton DIT LE NOM
   (« Réserver pour Mahoussi », jamais « Réserver un rituel ») : un bouton
   qui ne nomme pas sa tête laisse poser un rendez-vous sur la mauvaise
   personne, et personne ne s'en aperçoit avant le fauteuil. */

export function HomeEnfant({ enfant, onOpenBooking, onRevenir, onOpenRdv }: {
  enfant: Client;
  onOpenBooking: OpenBooking;
  onRevenir: () => void;
  /** Son rituel s'ouvre sur sa fiche (7 octobre 2026). */
  onOpenRdv?: (id?: string) => void;
}) {
  const [services] = useServices();
  const [bands] = useModelBands();
  const appts = useClientAppointments(enfant.id);
  const next = useNextAppointment(enfant.id);
  const prenom = enfant.name.split(' ')[0] || enfant.name;
  const age = ageDe(enfant.birthday, todayIso());
  const cal = calibreDe(enfant.lockCount, bands);
  /* Dernière venue honorée + reprise conseillée — le même juge de cadence que
     la fiche du Trône (shared/cadence.ts), posé sur SA tête. */
  const honores = appts.filter((a) => a.status === 'honoré');
  const derniere = honores[honores.length - 1];
  const cadence = useMemo(
    () => predictNextVisit(appts, [enfant], enfant.id, todayIso()),
    [appts, enfant],
  );
  const reprise = !next && cadence?.predicted && cadence.iso ? cadence.iso : null;

  return (
    <div className="mc-fade mc-pagepad mc-pagepad--top">
      <div className="mc-nextrdv" style={{ marginTop: 0 }}>
        <div className="mc-nextrdv__label">{t('La couronne de {prenom}', { prenom })}</div>
        <div className="mc-nextrdv__service" style={{ marginTop: 6 }}>{prenom}.</div>
        <div className="mc-nextrdv__when">
          {age === undefined
            ? t('c’est vous qui réservez et réglez.')
            : age > 1
              ? t('{age} ans · c’est vous qui réservez et réglez.', { age })
              : t('{age} an · c’est vous qui réservez et réglez.', { age })}
        </div>
      </div>

      {/* Son calibre se COMPTE, comme pour toutes les têtes (13 août). */}
      <div className="mc-crownstatus">
        <span className="mc-crownstatus__filet" />
        <div className="mc-crownstatus__top">
          <span className="mc-crownstatus__style">
            {cal ? t('Couronne {calibre} · {n} locks', { calibre: cal, n: enfant.lockCount ?? '' }) : t('Sa couronne')}
          </span>
        </div>
        {(derniere || reprise) && (
          <div className="mc-crownstatus__progress">
            <span>
              {derniere ? t('Dernière venue le {date}', { date: jourDit(derniere.date) }) : ''}
              {reprise
                ? derniere
                  ? t(', reprise conseillée ≈ {date}', { date: jourDit(reprise) })
                  : t('reprise conseillée ≈ {date}', { date: jourDit(reprise) })
                : ''}
            </span>
          </div>
        )}
        {!cal && !derniere && !reprise && (
          <div className="mc-crownstatus__progress">
            <span>{t('La maison comptera ses locks à son premier passage.')}</span>
          </div>
        )}
      </div>

      <div className="mc-nextrdv">
        <div className="mc-nextrdv__row">
          <span className="mc-nextrdv__label">{t('Prochain rituel')}</span>
          {next && <span className="mc-nextrdv__status">{next.status === 'confirmé' ? t('Confirmé') : t('En attente')}</span>}
        </div>
        {next ? (
          <button type="button" className="mc-nextrdv__ouvrir" onClick={() => onOpenRdv?.(next.id)}>
            <div className="mc-nextrdv__service">{serviceNames(next, services) || t('Rituel de la maison')}</div>
            <div className="mc-nextrdv__when">{jourDit(next.date)} · {next.time}</div>
            {onOpenRdv && <span className="mc-nextrdv__voir">{t('Ouvrir')} →</span>}
          </button>
        ) : (
          <>
            <div className="mc-nextrdv__service">{t('Aucun rituel à venir')}</div>
            <div className="mc-nextrdv__when">{t('Son fauteuil l’attend.')}</div>
          </>
        )}
      </div>

      <button className="mc-cta mc-cta--copper" style={{ marginTop: 16 }} onClick={() => onOpenBooking({ pourId: enfant.id })}>
        {t('Réserver pour {prenom}', { prenom })}
      </button>
      <button className="mc-cta mc-cta--outline" style={{ marginTop: 10 }} onClick={onRevenir}>
        {t('Revenir à votre couronne')}
      </button>
      <div style={{ height: 26 }} />
    </div>
  );
}

/* ================= SUIVI ================= */

export function SuiviTab({ regard, onOpenBooking, onOpenRdv, onOpenOrders, goGamme }: { regard?: Client; onOpenBooking: OpenBooking; onOpenRdv: (id?: string) => void; onOpenOrders: () => void; goGamme: () => void }) {
  const [services] = useServices();
  const moi = useClient();
  /* LE SUIVI SUIT LE REGARD : la tête choisie au sélecteur de l'accueil.
     Une couronne de neuf ans n'est pas celle de sa mère — son parcours non
     plus (maquette du 9 août). */
  const client = regard ?? moi;
  const { currency } = useBranch();
  const { products } = useVisibleCatalog();
  const clientAppts = useClientAppointments(regard?.id);
  const next = useNextAppointment(regard?.id);

  /* Le produit prescrit par la maison sur la fiche cliente — affiché seulement
     s'il est choisi ET visible au front (catégorie active, non masqué). */
  const reco = client?.recoProductId ? products.find((p) => p.id === client.recoProductId) : undefined;

  const honored = clientAppts.filter((a) => a.status === 'honoré');
  const lockDays = daysSince(client?.crownSince ?? client?.since ?? todayIso());
  /* Le calibre, déduit du comptage — le style à la main est retiré (13 août). */
  const [bandsModeles] = useModelBands();
  const calSuivi = calibreDe(client?.lockCount, bandsModeles);

  /* ══ SA PENTE, ET CE QUI L'ATTEND — 6 septembre 2026 ═══════════════
     Maquette du 5 septembre, section ⑥ : « Ma Couronne · pour fidéliser. La
     cliente voit sa propre pente, son protocole et ce qui l'attend. »

     UN SUIVI QU'ON GARDE POUR SOI NE FIDÉLISE PERSONNE. La Maison mesurait
     déjà — quatre jauges par bilan, une mèche témoin à chaque resserrage — et
     tout cela restait au Trône. La cliente recevait un chiffre le jour même et
     n'a jamais vu sa courbe.

     CE QUI RESTE AU TRÔNE : le comptage de locks et le calibre. Ils commandent
     le tarif, et un chiffre qui décide d'un prix n'a rien à faire dans une
     application où on ne peut pas l'expliquer. */
  const [bilansTous] = useBilans();
  const mesBilans = useMemo(
    () => (client ? bilansTous.filter((b) => b.clientId === client.id) : []),
    [bilansTous, client],
  );
  const monDernierBilan = client ? dernierBilanDe(bilansTous, client.id) : undefined;
  /* LA MÈCHE TÉMOIN VIT SUR LA FICHE, pas au Fil : la série se lit donc sans
     lui, et c'est heureux — le Fil est la parole de l'atelier, il ne se remet
     pas. */
  const maSerie = useMemo(
    () => (client ? serieDesComptages([], client.branchId, client) : []),
    [client],
  );

  const svcById = useMemo(() => new Map(services.map((sv) => [sv.id, sv])), [services]);
  /* LES MEMES PROTOCOLES QU'AU TRONE, avec SON ecart : deux sources donneraient
     deux calendriers pour une seule couronne, et c'est elle qui les compare. */
  const [lesProtocoles] = useProtocoles();
  const etapesCouleur = etapesPourLaTete(protocoleNatif(lesProtocoles, 'couleur').etapes, client?.ecartProtocole?.couleur);
  const etapesPousse = etapesPourLaTete(protocoleNatif(lesProtocoles, 'pousse').etapes, client?.ecartProtocole?.pousse);
  /* DU CODE DE L'ÉTAPE À SA PRESTATION, à sa longueur. Le protocole nomme un
     soin par son code nu ; le catalogue en tient trois, une par longueur. */
  const prestationDeLEtape = (code: string) => {
    const nu = (c?: string) => (c ?? '').replace(/·[CML]$/, '');
    const candidats = services.filter((sv) => nu(sv.code) === code);
    if (candidats.length <= 1) return candidats[0];
    const suffixe = client?.longueur === 'court' ? 'C' : client?.longueur === 'long' ? 'L' : 'M';
    return candidats.find((sv) => (sv.code ?? '').endsWith(`·${suffixe}`)) ?? candidats[0];
  };
  const maCouleur = client ? derniereCouleur(clientAppts, client.id, svcById) : undefined;
  /* LE PROGRAMME S'OUVRE OÙ LA MAISON L'A POSÉ, ou derrière le dernier VÍVÍVÓ™
     honoré. La cliente lit la même ouverture que le Trône : deux dates de
     départ donneraient deux calendriers pour un seul programme. */
  const { depart: activateurPousse } = client
    ? ouvertureDuProgramme({ pose: client.programmeDepuis, appts: clientAppts, clientId: client.id, byId: svcById })
    : { depart: undefined };
  const suiteCouleur = maCouleur
    ? suivreLeProtocole({ couleur: maCouleur, appts: clientAppts, byId: svcById, aujourdhui: todayIso(), etapes: etapesCouleur })
    : [];
  const suitePousse = activateurPousse
    ? suivreLeProtocole({
      couleur: activateurPousse, appts: clientAppts, byId: svcById,
      aujourdhui: todayIso(), etapes: etapesPousse,
    })
    : [];

  /* La timeline naît des vrais rendez-vous : naissance de la couronne,
     rituels honorés, puis le prochain rendez-vous en attente. */
  /* `id` : le rendez-vous qu'un passage ouvre (7 octobre 2026). */
  const timeline: { d: string; t: string; s: string; done: boolean; id?: string }[] = [];
  if (client?.crownSince) {
    timeline.push({
      d: jourDit(client.crownSince),
      t: t('Naissance de la couronne'),
      s: calSuivi ? t('Calibre {calibre} · la maison veille', { calibre: calSuivi }) : t('La maison veille'),
      done: true,
    });
  }
  /* SES CINQ DERNIERS PASSAGES, EN RÉSUMÉ — 29 septembre 2026 (Yéman) : le
     carnet ne déroule plus toute l'histoire des rendez-vous. Les plus anciens
     se disent en une ligne, comptés. Le compteur du Cercle, lui, lit toujours
     tout (venuesDeLAnnee), rien n'est perdu. */
  const PASSAGES_MONTRES = 5;
  const anciens = Math.max(0, honored.length - PASSAGES_MONTRES);
  if (anciens > 0) {
    timeline.push({
      d: t('Avant le {date}', { date: jourDit(honored[anciens].date) }),
      t: anciens > 1 ? t('{n} passages plus anciens', { n: anciens }) : t('{n} passage plus ancien', { n: anciens }),
      s: t('La Maison les garde dans votre dossier'),
      done: true,
    });
  }
  for (const a of honored.slice(-PASSAGES_MONTRES)) {
    timeline.push({
      d: `${jourDit(a.date)} · ${a.time}`,
      t: serviceNames(a, services) || t('Rituel de la maison'),
      s: t('Honoré'),
      done: true,
      id: a.id,
    });
  }
  if (next) {
    timeline.push({
      d: `${jourDit(next.date)} · ${next.time}`,
      t: serviceNames(next, services) || t('Prochain rituel'),
      s: next.status === 'confirmé' ? t('Confirmé') : t('En attente de la maison'),
      done: false,
      id: next.id,
    });
  }

  /* Re-réserver à l'identique : la prestation du rendez-vous le plus récent —
     posée sur la tête regardée, jamais sur le compte par défaut. */
  const lastAppt = clientAppts.filter((a) => a.status !== 'annulé' && a.serviceIds.length > 0).slice(-1)[0];
  const rebook = () => {
    if (lastAppt) onOpenBooking({ serviceId: lastAppt.serviceIds[0], pourId: regard?.id });
  };

  const prenomRegard = regard ? (regard.name.split(' ')[0] || regard.name) : '';

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade">
      <div className="mc-micro-eyebrow">{regard ? t('Carnet de Suivi · sa lignée') : t('Carnet de Suivi · votre lignée')}</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 16px' }}>{regard ? t('Le parcours de {prenom}.', { prenom: prenomRegard }) : t('Mon parcours.')}</h1>

      {/* portrait de la couronne — seulement si la maison l'a consigné */}
      {client?.photo && (
        <div className="mc-suiviphoto">
          <img src={client.photo} alt={t('Votre couronne aujourd’hui')} />
          <span className="mc-beforeafter__tag mc-beforeafter__tag--now">{t('Aujourd’hui')}</span>
        </div>
      )}

      {/* état de la couronne — chiffres réels du CRM et de l'agenda */}
      <div className="mc-metrics">
        <div className="mc-metric"><div className="mc-metric__v">{client?.lockCount ?? '—'}</div><div className="mc-metric__l">{t('Locks')}</div></div>
        <div className="mc-metric"><div className="mc-metric__v">{lockDays}</div><div className="mc-metric__l">{t('Jours de locks')}</div></div>
        <div className="mc-metric"><div className="mc-metric__v">{honored.length}</div><div className="mc-metric__l">{t('Rituels honorés')}</div></div>
      </div>

      {/* prescription de la maison — produit choisi sur la fiche, au Trône.
          Pas pour un mineur : la Gamme n'est pas à son nom (9 août). */}
      {reco && !regard && (
        <>
          <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>{t('La maison vous recommande')}</div>
          <div className="mc-recocard">
            <div className="mc-productvisual"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
            <div className="mc-recocard__body">
              <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>
                {client?.preferredMaster ? t('Conseillé par {nom}', { nom: client.preferredMaster }) : t('Choisi pour votre couronne')}
              </div>
              <div className="mc-recocard__name">{reco.name}</div>
              <div className="mc-recocard__line">{productMeta(reco.id).line} · {prix(reco.priceXof, currency)}</div>
            </div>
            <button className="mc-arrowbtn" aria-label={t('Voir la gamme')} onClick={goGamme}>→</button>
          </div>
        </>
      )}

      {/* ══ SA PENTE ═══════════════════════════════════════════════════
          LA MAISON MESURAIT DÉJÀ, ET NE MONTRAIT RIEN. Quatre jauges par
          bilan, une mèche témoin à chaque resserrage, depuis le début. C'est
          la PENTE qui parle, pas la note du jour : une jauge à 3 ne dit rien,
          « 3 après un 2 » dit que le soin a pris.

          UNE JAUGE QUI BAISSE NE DOIT JAMAIS SE LIRE COMME UN REPROCHE. Elle
          est donc suivie de ce que la Maison a noté ce jour-là — le geste qui
          la relève, écrit de sa main, jamais inventé ici. */}
      {mesBilans.length >= 2 && (
        <>
          <div className="mc-sectionlabel" style={{ margin: '26px 0 10px' }}>
            {regard ? t('Ce que la maison observe chez elle') : t('Ce que la maison observe')}
          </div>
          <CourbeDesJauges bilans={mesBilans} />
          {(monDernierBilan?.points ?? []).length > 0 && (
            <div className="mc-recocard" style={{ display: 'block', marginTop: 12 }}>
              <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>
                {t('Ce que la maison a noté le {date}', { date: jourDit(monDernierBilan!.date) })}
              </div>
              <ul style={{ margin: '8px 0 0', padding: '0 0 0 18px', lineHeight: 1.7 }}>
                {monDernierBilan!.points.map((pt, i) => <li key={i}>{pt}</li>)}
              </ul>
            </div>
          )}
        </>
      )}

      {/* LA POUSSE — la mèche témoin, mesurée dans le même geste que le
          comptage. Le repère à 1 cm par mois transforme la courbe en
          évaluation : au-dessus, la Maison fait mieux que la nature. */}
      {maSerie.filter((c) => (c.longueurCm ?? 0) > 0).length >= 3 && (
        <>
          <div className="mc-sectionlabel" style={{ margin: '26px 0 10px' }}>
            {regard ? t('Sa pousse, mèche témoin') : t('Votre pousse, mèche témoin')}
          </div>
          <CourbeDeLaPousse serie={maSerie} />
        </>
      )}

      {/* ══ CE QUI L'ATTEND ════════════════════════════════════════════
          LE PROTOCOLE NE POSE RIEN TOUT SEUL, ici pas plus qu'au Trône : il
          DIT ce qui est dû et quand. Une étape à poser porte donc un bouton
          qui ouvre la réservation — c'est la main de la cliente qui décide,
          et c'est aussi ce qui fidélise : elle sait ce qui vient. */}
      {(suiteCouleur.length > 0 || suitePousse.length > 0) && (
        <>
          <div className="mc-sectionlabel" style={{ margin: '26px 0 10px' }}>
            {regard ? t('Ce qui attend sa couronne') : t('Ce qui attend votre couronne')}
          </div>
          {[
            { titre: 'Après votre couleur', suite: suiteCouleur },
            { titre: 'Le programme de pousse', suite: suitePousse },
          ].filter((g) => g.suite.length > 0).map((g) => (
            <div key={g.titre} style={{ marginBottom: 14 }}>
              <div className="mc-micro-eyebrow" style={{ fontSize: 10, marginBottom: 8 }}>{t(g.titre)}</div>
              {g.suite.map((e) => (
                <div key={`${g.titre}-${e.code}-${e.jours}`} className="mc-tl">
                  <div className="mc-tl__rail">
                    <span className={`mc-tl__dot ${e.etat === 'fait' ? 'is-done' : ''}`} />
                    <span className="mc-tl__line" />
                  </div>
                  <div className="mc-tl__body">
                    <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>
                      {jourDit(e.dueIso)} · {t(MOT_DE_L_ETAT[e.etat])}
                    </div>
                    <div className="mc-tl__t">{e.nom}</div>
                    <div className="mc-tl__s">{e.pourquoi}</div>
                    {/* LA MÈRE POSE AUSSI POUR SA FILLE : le suivi se lit sur
                        la tête regardée, la réservation doit suivre le même
                        regard, sans quoi le geste ouvrirait le calendrier de
                        la mauvaise couronne. */}
                    {/* LE SOIN EST DÉJÀ CHOISI QUAND ELLE ARRIVE — 6 septembre.
                        Un bouton qui ouvre une réservation vide fait chercher
                        dans le catalogue le soin qu'on venait de lui nommer :
                        c'est là qu'on abandonne, ou qu'on prend le voisin. */}
                    {(e.etat === 'a-poser' || e.etat === 'en-retard') && (
                      <button
                        className="mc-cta"
                        style={{ marginTop: 8 }}
                        onClick={() => onOpenBooking({
                          ...(prestationDeLEtape(e.code) ? { serviceId: prestationDeLEtape(e.code)!.id } : {}),
                          pourId: regard?.id,
                        })}
                      >
                        {t('Poser ce rendez-vous')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* timeline mèche-après-mèche */}
      <div className="mc-sectionlabel" style={{ margin: '24px 0 12px' }}>{regard ? t('L’histoire de sa couronne') : t('L’histoire de votre couronne')}</div>
      {timeline.map((ev, i) => (
        <div key={i} className="mc-tl">
          <div className="mc-tl__rail">
            <span className={`mc-tl__dot ${ev.done ? 'is-done' : ''}`} />
            {i < timeline.length - 1 && <span className="mc-tl__line" />}
          </div>
          {ev.id ? (
            <button type="button" className="mc-tl__body mc-tl__body--ouvrable" onClick={() => onOpenRdv(ev.id)}>
              <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>{ev.d}</div>
              <div className="mc-tl__t">{ev.t}</div>
              <div className="mc-tl__s">{ev.s} · {t('Ouvrir')} →</div>
            </button>
          ) : (
            <div className="mc-tl__body">
              <div className="mc-micro-eyebrow" style={{ fontSize: 10 }}>{ev.d}</div>
              <div className="mc-tl__t">{ev.t}</div>
              <div className="mc-tl__s">{ev.s}</div>
            </div>
          )}
        </div>
      ))}
      {timeline.length === 0 && (
        <div className="mc-tlempty">
          <div className="mc-tlempty__t">{regard ? t('Son histoire commence ici.') : t('Votre histoire commence ici.')}</div>
          <div className="mc-tlempty__s">
            {t('Chaque rituel honoré s’inscrira dans ce carnet, mèche après mèche.')}
          </div>
          <button className="mc-cta mc-cta--copper" onClick={() => onOpenBooking({ pourId: regard?.id })}>
            {regard ? t('Réserver pour {prenom}', { prenom: prenomRegard }) : t('Réserver mon premier rituel')}
          </button>
        </div>
      )}

      {/* Tout suivre — rendez-vous & commandes, réunis dans le Carnet de Suivi.
          Ces tiroirs sont ceux du COMPTE (vos rendez-vous, vos commandes) :
          quand le carnet regarde un enfant, ils se taisent. */}
      {!regard && (
        <>
          <div className="mc-sectionlabel" style={{ margin: '24px 0 10px' }}>{t('Tout suivre')}</div>
          <div className="mc-preflist">
            <button className="mc-navrow" onClick={() => onOpenRdv()}>
              <span className="mc-navrow__main">
                <span>{t('Mes rendez-vous')}</span>
                <span className="mc-navrow__sub">{t('voir, déplacer, annuler')}</span>
              </span>
              <span className="mc-navrow__arrow" aria-hidden="true">→</span>
            </button>
            <button className="mc-navrow" onClick={onOpenOrders}>
              <span className="mc-navrow__main">
                <span>{t('Mes commandes')}</span>
                <span className="mc-navrow__sub">{t('suivre l’état de la Gamme')}</span>
              </span>
              <span className="mc-navrow__arrow" aria-hidden="true">→</span>
            </button>
          </div>
        </>
      )}
      {lastAppt && (
        <button className="mc-cta mc-cta--outline" style={{ marginTop: 14 }} onClick={rebook}>
          {t('Re-réserver à l’identique')}
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
      toast(t('La géolocalisation n’est pas disponible sur cet appareil.'));
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
        toast(t('Position partagée, la maison vous trouvera facilement.'));
      },
      (err) => {
        setGeoBusy(false);
        toast(
          err.code === err.PERMISSION_DENIED
            ? t('Autorisez la localisation pour partager votre position.')
            : t('Impossible d’obtenir votre position. Réessayez.'),
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
            `Livraison à domicile${address.trim() ? `, ${address.trim()}` : ''}`,
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
    const confirmed = prix(total, currency);
    invoicesStore.set((prev) => [...prev, inv]);
    /* La position GPS partagée se dépose aussi sur la fiche cliente — le Trône
       propose alors un itinéraire direct depuis le CRM. */
    if (geo) clientsStore.set((prev) => prev.map((c) => (c.id === clientId ? { ...c, geo } : c)));
    setCart({});
    setGeo(null);
    setOrderDone({ number: inv.number, totalXof: total, mode });
    toast(t('Commande transmise à la maison, {montant}', { montant: confirmed }));
  };

  const closeBasket = () => {
    setBasketOpen(false);
    setOrderDone(null);
  };

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade mc-page--wide">
      <div className="mc-micro-eyebrow">{t('La Gamme · Care & Store')}</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 4px' }}>{t('Votre rituel.')}</h1>
      <p className="mc-lead" style={{ margin: '0 0 18px' }}>
        {t('Formules naturelles, moringa, karité, niaouli. Sans silicone ni paraben.')}
      </p>

      {/* Suivre ses commandes — visible dès qu'une commande existe. */}
      {orders.length > 0 && (
        <button className="mc-orderslink" onClick={onOpenOrders}>
          <span>{t('Mes commandes · {n}', { n: orders.length })}</span>
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
                {p.stock > 0 && p.stock <= 8 && <div className="mc-productcard__scarce">{t('Dernières pièces, {n} en maison', { n: p.stock })}</div>}
              </div>
              <div className="mc-productcard__side">
                <span className="mc-productcard__price">{prix(p.priceXof, currency)}</span>
                {qty > 0 ? (
                  <div className="mc-qtystep">
                    <button aria-label={t('Retirer {nom}', { nom: p.name })} onClick={() => dec(p.id)}>−</button>
                    <span>{qty}</span>
                    <button aria-label={t('Ajouter {nom}', { nom: p.name })} onClick={() => add(p.id)}>+</button>
                  </div>
                ) : (
                  <button className="mc-plusbtn" aria-label={t('Ajouter {nom}', { nom: p.name })} onClick={() => add(p.id)}>+</button>
                )}
              </div>
            </div>
          );
        })}
        {products.length === 0 && (
          <div className="mc-emptyzone">
            <div className="mc-emptyzone__glyph">⬡</div>
            <div className="mc-emptyzone__t">{t('La gamme se prépare.')}</div>
            <div className="mc-emptyzone__s">
              {t('Nos formules naturelles seront bientôt disponibles ici. La maison vous les présentera une à une.')}
            </div>
          </div>
        )}
      </div>

      {/* Barre panier — synthèse vivante, visible depuis la Gamme. */}
      {count > 0 && (
        <div className="mc-basketbar">
          <div className="mc-basketbar__info">
            <span className="mc-basketbar__count">{count > 1 ? t('{n} articles', { n: count }) : t('{n} article', { n: count })}</span>
            <span className="mc-basketbar__total">{prix(total, currency)}</span>
          </div>
          <button className="mc-cta mc-cta--copper mc-basketbar__cta" onClick={() => setBasketOpen(true)}>
            {t('Voir le panier')}
          </button>
        </div>
      )}

      <div style={{ height: 70 }} />

      {/* Vue panier — liste, quantités, total, commander. */}
      {basketOpen && (
        <div className="mc-overlayscreen mc-slide" style={{ zIndex: 42 }}>
          <div className="mc-flowhead mc-flowhead--split">
            <div>
              <div className="mc-micro-eyebrow">{orderDone ? t('Commande transmise') : t('Votre panier')}</div>
              <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>
                {orderDone ? t('C’est transmis.') : t('Le panier.')}
              </h1>
            </div>
            <button className="mc-x" aria-label={t('Fermer')} onClick={closeBasket}>✕</button>
          </div>
          <div className="mc-scroll" style={{ flex: 1, padding: '18px 24px calc(24px + env(safe-area-inset-bottom))' }}>
            {orderDone ? (
              <div className="mc-confirm mc-rise" style={{ paddingTop: 26 }}>
                <div className="mc-confirm__seal"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
                <h2>{t('Commande transmise.')}</h2>
                <p>
                  {t('La maison la reçoit à l’instant et vous confirme sur WhatsApp. Suivez son état à tout moment dans « Mes commandes ».')}
                </p>
                <div className="mc-recapcard" style={{ textAlign: 'left', width: '100%' }}>
                  <div className="mc-recapcard__line"><span>{t('Commande')}</span><span>{orderDone.number}</span></div>
                  <div className="mc-recapcard__line"><span>{t('Statut')}</span><span>{t('Reçue par la maison')}</span></div>
                  <div className="mc-recapcard__line">
                    <span>{t('Remise')}</span>
                    <span>{orderDone.mode === 'livraison' ? t('Livraison à domicile') : t('Retrait en maison')}</span>
                  </div>
                  <div className="mc-hairline" />
                  <div className="mc-recapcard__total">
                    <span>{t('Total')}</span>
                    <span>{prix(orderDone.totalXof, currency)}</span>
                  </div>
                  <div className="mc-recapcard__meta">
                    {orderDone.mode === 'livraison' ? t('Réglée à la livraison.') : t('Réglée au retrait en maison.')}
                  </div>
                </div>
                <button
                  className="mc-cta mc-cta--indigo"
                  style={{ marginTop: 20 }}
                  onClick={() => { closeBasket(); onOpenOrders(); }}
                >
                  {t('Suivre mes commandes')}
                </button>
                <button className="mc-quietbtn" onClick={closeBasket}>{t('Revenir à la gamme')}</button>
              </div>
            ) : items.length === 0 ? (
              <div className="mc-emptyzone">
                <div className="mc-emptyzone__glyph">⬡</div>
                <div className="mc-emptyzone__t">{t('Votre panier est vide.')}</div>
                <div className="mc-emptyzone__s">
                  {t('Ajoutez une formule de la gamme pour composer votre commande.')}
                </div>
                <button className="mc-cta mc-cta--outline" style={{ marginTop: 22 }} onClick={closeBasket}>
                  {t('Revenir à la gamme')}
                </button>
              </div>
            ) : (
              <>
                <div className="mc-stack" style={{ gap: 10 }}>
                  {items.map((it) => (
                    <div key={it.p.id} className="mc-basketrow">
                      <div className="mc-basketrow__body">
                        <div className="mc-basketrow__name">{it.p.name}</div>
                        <div className="mc-basketrow__unit">{t('{prix} l’unité', { prix: prix(it.p.priceXof, currency) })}</div>
                      </div>
                      <div className="mc-qtystep">
                        <button aria-label={t('Retirer {nom}', { nom: it.p.name })} onClick={() => dec(it.p.id)}>−</button>
                        <span>{it.qty}</span>
                        <button aria-label={t('Ajouter {nom}', { nom: it.p.name })} onClick={() => add(it.p.id)}>+</button>
                      </div>
                      <div className="mc-basketrow__total">{prix(it.p.priceXof * it.qty, currency)}</div>
                      <button className="mc-basketrow__x" aria-label={t('Retirer {nom} du panier', { nom: it.p.name })} onClick={() => drop(it.p.id)}>✕</button>
                    </div>
                  ))}
                </div>
                {/* Remise — retrait en maison (offert) ou livraison à domicile. */}
                <div className="mc-deliver" style={{ marginTop: 18 }}>
                  <div className="mc-micro-eyebrow">{t('Comment la recevoir')}</div>
                  <div className="mc-deliver__opts">
                    <button
                      type="button"
                      className={`mc-deliver__opt ${mode === 'retrait' ? 'is-active' : ''}`}
                      onClick={() => setMode('retrait')}
                    >
                      <span className="mc-deliver__name">{t('Retrait en maison')}</span>
                      <span className="mc-deliver__price">{t('Offert')}</span>
                    </button>
                    <button
                      type="button"
                      className={`mc-deliver__opt ${mode === 'livraison' ? 'is-active' : ''}`}
                      onClick={() => setMode('livraison')}
                    >
                      <span className="mc-deliver__name">{t('Livraison à domicile')}</span>
                      <span className="mc-deliver__price">{fee > 0 ? prix(fee, currency) : t('Offert')}</span>
                    </button>
                  </div>
                  {mode === 'livraison' && (
                    <>
                      <label className="mc-deliver__addr">
                        <span className="mc-deliver__addrlabel">{t('Adresse de livraison')}</span>
                        <textarea
                          className="mc-deliver__addrinput"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder={t('Quartier, rue, repère… et un numéro à joindre.')}
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
                            ? t('Localisation en cours…')
                            : geo
                              ? t('Actualiser ma position')
                              : t('Partager ma position GPS')}
                        </button>
                        {geo && (
                          <a
                            className="mc-geo__link"
                            href={mapsLink}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t('Position enregistrée · voir sur la carte')}
                          </a>
                        )}
                        {!geo && (
                          <span className="mc-geo__hint">
                            {t('Un point précis pour que le livreur vous trouve sans hésiter.')}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                <div className="mc-recapcard" style={{ marginTop: 16 }}>
                  <div className="mc-recapcard__line">
                    <span>{count > 1 ? t('Sous-total · {n} articles', { n: count }) : t('Sous-total · {n} article', { n: count })}</span>
                    <span>{prix(subtotal, currency)}</span>
                  </div>
                  <div className="mc-recapcard__line">
                    <span>{t('Livraison')}</span>
                    <span>{mode === 'livraison' ? (deliveryCost > 0 ? prix(deliveryCost, currency) : t('Offerte')) : t('Retrait, offert')}</span>
                  </div>
                  <div className="mc-hairline" />
                  <div className="mc-recapcard__total"><span>{t('Total')}</span><span>{prix(total, currency)}</span></div>
                  <div className="mc-recapcard__meta">
                    {mode === 'livraison' ? t('Réglée à la livraison.') : t('Réglée au retrait en maison.')}
                  </div>
                </div>
                <button
                  className="mc-cta mc-cta--copper"
                  style={{ marginTop: 18 }}
                  onClick={checkout}
                  disabled={addressMissing}
                >
                  {t('Commander · {prix}', { prix: prix(total, currency) })}
                </button>
                {addressMissing && (
                  <div className="mc-footnote" style={{ color: 'var(--mc-copper, #b97a4a)' }}>
                    {t('Indiquez l’adresse de livraison pour transmettre la commande.')}
                  </div>
                )}
                <div className="mc-footnote">{t('La maison confirmera votre commande sur WhatsApp.')}</div>
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
  const [foyerTiers] = useFoyerTiers();
  const [services] = useServices();
  const cercle = useCercle();

  /* ══ LE CERCLE RÉUNI — 29 septembre 2026 (maquette validée) ══════════════
     Le Cercle et les ambassadrices ne font plus qu'un. On y lit, dans
     l'ordre : où elle en est au Cercle (sa 3ᵉ venue, son prix convenu, son
     foyer), puis son ambassade (rang, récompense à choisir, arbre,
     récompenses, carte), puis le Foyer. Les POINTS sont partis : éteints
     depuis juillet et jamais reliés à la caisse, ils affichaient un compteur
     à zéro. Le bouton « Introduire » qui n'envoyait rien est parti avec eux :
     la carte se partage pour de vrai.
     DE MAIN EN MAIN (9 octobre 2026) : le programme des ambassadrices porte
     ce nom ; « transmettre » lui cède la place dans l'en-tête. Le défi est
     parti, et sans Graine l'ambassade dit le chemin vers elle. */
  const foyerLadder = useMemo(() => foyerTiers.slice().sort((a, b) => a.seuilXof - b.seuilXof), [foyerTiers]);
  const prochainFoyer = foyerLadder.find((tier) => cercle.depenseFoyer < tier.seuilXof);
  const cibleFoyer = prochainFoyer?.seuilXof ?? cercle.seuilFoyer;
  const pctFoyer = Math.min(100, Math.round((cercle.depenseFoyer / Math.max(1, cibleFoyer)) * 100));
  const pctCercle = Math.min(100, Math.round((cercle.venues / Math.max(1, cercle.seuil)) * 100));

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade">
      <div className="mc-micro-eyebrow">{t('Le Cercle MND · de main en main')}</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 14px' }}>{t('Votre lignée.')}</h1>

      {/* OÙ ELLE EN EST AU CERCLE, en une ligne. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {cercle.convenu ? (
          <span className="mc-pillseal">{t('Prix convenu · votre reconnaissance, à chaque venue')}</span>
        ) : cercle.dependant ? (
          <span className="mc-pillseal">{t('Rattachée à votre foyer')}</span>
        ) : cercle.membre ? (
          <span className="mc-pillseal">{cercle.venues > 1
            ? t('Membre du Cercle · {n} venues en 12 mois', { n: cercle.venues })
            : t('Membre du Cercle · {n} venue en 12 mois', { n: cercle.venues })}</span>
        ) : (
          <span className="mc-pillseal">{t('Le Cercle s’ouvre à {seuil} venues en 12 mois · {n} sur {seuil}', { seuil: cercle.seuil, n: cercle.venues })}</span>
        )}
      </div>
      {!cercle.convenu && !cercle.dependant && !cercle.membre && (
        <div style={{ marginBottom: 18 }}>
          <div className="mc-bar"><div style={{ width: `${pctCercle}%` }} /></div>
          <div className="mc-footnote" style={{ textAlign: 'left', marginTop: 6 }}>
            {cercle.venues === 0
              ? t('Votre lignée commence à votre première venue. Le Cercle vous accueille à {seuil} venues en douze mois.', { seuil: cercle.seuil })
              : cercle.reste > 1
                ? t('Encore {n} venues dans les douze mois, et la Maison vous accueille dans son Cercle.', { n: cercle.reste })
                : t('Encore {n} venue dans les douze mois, et la Maison vous accueille dans son Cercle.', { n: cercle.reste })}
          </div>
        </div>
      )}

      {/* SON AMBASSADE, membre du Cercle ou pas : sa Graine et sa carte, ou
          le chemin vers elles, et ses récompenses dans les deux cas. */}
      <MonAmbassade toast={toast} />

      {/* LE FOYER — la reconnaissance de la maisonnée, sur sa dépense cumulée.
          Un sceau atteint se pose comme une récompense (Vos récompenses). */}
      {cercle.foyer && !cercle.dependant && (<>
        <div className="mc-sectionlabel" style={{ margin: '26px 0 10px' }}>{t('Le Foyer')}</div>
        <div className="mc-pointscard">
          <div className="mc-pointscard__watermark" aria-hidden="true" />
          <div className="mc-pointscard__inner">
            <div className="mc-pointscard__label">{t('Votre maisonnée')}</div>
            <div className="mc-pointscard__row">
              <span className="mc-pointscard__big">{pctFoyer}%</span>
              <span className="mc-pointscard__unit">{prochainFoyer ? t('vers le prochain sceau du foyer') : t('de votre sceau famille')}</span>
            </div>
            <div className="mc-bar mc-bar--invert"><div style={{ width: `${pctFoyer}%` }} /></div>
            <div className="mc-pointscard__hint">
              {prochainFoyer
                ? t('Encore un peu et « {soin} » s’offre à la maisonnée.', { soin: services.find((s) => s.id === prochainFoyer.serviceId)?.name ?? t('un soin') })
                : cercle.foyerAtteint
                  ? t('Votre foyer a franchi son sceau : le soin vous attend dans vos récompenses.')
                  : t('La venue de chaque membre du foyer avance vers un soin offert à la famille.')}
            </div>
          </div>
        </div>
        {foyerLadder.length > 0 && (
          <div className="mc-stack mc-rewardgrid" style={{ gap: 10, marginTop: 12 }}>
            {foyerLadder.map((tier, i) => {
              const on = cercle.depenseFoyer >= tier.seuilXof;
              const svc = services.find((s) => s.id === tier.serviceId);
              return (
                <div key={tier.id} className={`mc-rewardrow ${on ? 'is-on' : ''}`}>
                  <span className="mc-rewardrow__glyph">{tierGlyph(tier, i)}</span>
                  <div className="mc-rewardrow__body">
                    <div className="mc-rewardrow__t">{svc?.name ?? t('Un soin de la maison')}</div>
                    <div className="mc-rewardrow__s">{tier.desc || t('Offert à la maisonnée')}</div>
                  </div>
                  <span className={`mc-rewardrow__st ${on ? 'is-on' : ''}`}>{on ? t('Offert') : t('À venir')}</span>
                </div>
              );
            })}
          </div>
        )}
      </>)}
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
  /* LA CORRECTION D'UNE NAISSANCE (14 août) — une date mal saisie fausse
     l'âge affiché partout. L'écriture passe par le serveur (0050). */
  const [corrigeId, setCorrigeId] = useState('');
  const [dateCorrigee, setDateCorrigee] = useState('');
  const [errCorrige, setErrCorrige] = useState('');

  if (!client) return null;
  const aujourdhui = todayIso();
  const mesTetes = tetesPortees(client, clients, familles, aujourdhui);
  const mesDemandes = declarationsDe(declarations, client.id);
  const attente = mesDemandes.filter((d) => d.statut === 'en attente');
  const refusees = mesDemandes.filter((d) => d.statut === 'refusé');

  const envoyer = async () => {
    /* LE RATTACHEMENT EST IMMÉDIAT (13 août) : le SERVEUR crée la fiche sous
       son compte famille (migration 0044) et l'écran la reflète aussitôt.
       Seule une tête DÉJÀ au carnet repasse par la Maison — on ne s'annexe
       pas la fiche d'une autre. */
    const r = await rattacherEnfant(client, prenom, nom, naissance, aujourdhui);
    if (!r.ok) { setErreur(r.erreur ? t(r.erreur) : t('Cette demande n’a pas pu être envoyée.')); return; }
    setErreur('');
    const petit = prenom.trim();
    setPrenom('');
    setNom('');
    setNaissance('');
    setOuvert(false);
    toast(r.enAttente
      ? t('Cette tête est déjà connue de la maison, elle vérifie et vous prévient.')
      : t('{prenom} est sur votre compte, réservez pour {prenom} dès maintenant.', { prenom: petit }));
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
        {t('Un enfant à inscrire ?')}
      </button>
    );
  }

  return (
    <>
      {parenteConnue && <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>{t('Mes enfants')}</div>}

      {parenteConnue && mesTetes.length === 0 && attente.length === 0 && (
        <div className="mc-emptyline" style={{ lineHeight: 1.55 }}>
          {t('Vos enfants peuvent avoir leurs propres rendez-vous, à leur nom, avec leur suivi. C’est vous qui réservez et réglez pour eux.')}
        </div>
      )}

      {/* CHAQUE ENFANT S'OUVRE PAR SON NOM (14 août, goût de Yéman) : la
          liste reste calme — le geste de correction vit DEDANS, pas étalé
          sous chaque ligne. */}
      {mesTetes.map((e) => {
        const a = ageDe(e.birthday, aujourdhui);
        const ouverte = corrigeId === e.id;
        const corriger = async () => {
          const r = await corrigerNaissance(e.id, dateCorrigee, aujourdhui);
          if (!r.ok) { setErrCorrige(r.erreur ? t(r.erreur) : t('La correction n’a pas pu passer.')); return; }
          setCorrigeId(''); setDateCorrigee(''); setErrCorrige('');
          toast(t('La date de naissance de {prenom} est corrigée.', { prenom: e.name.split(' ')[0] }));
        };
        return (
          <div key={e.id} className="mc-crownstatus" style={{ marginTop: 8 }}>
            <span className="mc-crownstatus__filet" />
            <button
              type="button"
              onClick={() => {
                if (ouverte) { setCorrigeId(''); setErrCorrige(''); return; }
                setCorrigeId(e.id); setDateCorrigee(e.birthday ?? ''); setErrCorrige('');
              }}
              aria-expanded={ouverte}
              style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}
            >
              <div className="mc-crownstatus__top">
                <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>
                  {e.name}
                  <span aria-hidden="true" style={{ marginLeft: 8, fontSize: 12, color: 'var(--ink-soft)', display: 'inline-block', transform: ouverte ? 'rotate(90deg)' : 'none', transition: 'transform .2s ease' }}>›</span>
                </span>
                <span className="mc-pillseal">{a === undefined ? t('âge à préciser') : a > 1 ? t('{n} ans', { n: a }) : t('{n} an', { n: a })}</span>
              </div>
            </button>
            {ouverte && (
              <div style={{ marginTop: 10 }}>
                <div className="mc-field-label">{t('Changer sa date de naissance')}</div>
                <DateEnClair mots={motsDeDate()}
                  value={dateCorrigee}
                  max={aujourdhui}
                  onChange={(iso) => { setDateCorrigee(iso ?? ''); setErrCorrige(''); }}
                  ariaLabel={t('Sa date de naissance')}
                />
                {errCorrige && <div className="mc-form-err">{errCorrige}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                  <button className="mc-cta mc-cta--indigo" style={{ marginTop: 0, flex: 1 }} onClick={() => void corriger()}>
                    {t('Enregistrer')}
                  </button>
                  <button className="mc-textbtn" style={{ marginTop: 0 }} onClick={() => { setCorrigeId(''); setErrCorrige(''); }}>
                    {t('Annuler')}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {attente.map((d) => (
        <div key={d.id} className="mc-crownstatus" style={{ marginTop: 8, opacity: .75 }}>
          <span className="mc-crownstatus__filet" style={{ background: 'var(--color-argile)' }} />
          <div className="mc-crownstatus__top">
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 17, color: 'var(--color-indigo)' }}>{nomPropose(d)}</span>
            <span className="mc-pillseal">{t('En attente de la maison')}</span>
          </div>
        </div>
      ))}

      {/* UN REFUS SE LIT. Une demande qui disparaît sans un mot se redépose
          indéfiniment, et personne ne comprend pourquoi. */}
      {refusees.slice(0, 2).map((d) => (
        <div key={d.id} className="mc-emptyline" style={{ marginTop: 8, lineHeight: 1.55 }}>
          {t('{prenom}, la maison n’a pas retenu cette demande.', { prenom: d.prenom })}
          {d.motif ? ` ${t('« {motif} »', { motif: d.motif })}` : ` ${t('Passez à la Maison, on en parle.')}`}
        </div>
      ))}

      {ouvert ? (
        <div style={{ marginTop: 12 }}>
          <div className="mc-field-label">{t('Son prénom')}</div>
          <input
            className="mnd-input"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            placeholder="Mahoussi"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div className="mc-field-label" style={{ marginTop: 12 }}>{t('Son nom de famille')}</div>
          <input
            className="mnd-input"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Houngbédji"
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
          <div className="mc-footnote" style={{ textAlign: 'left', marginTop: 6, lineHeight: 1.5 }}>
            {t('Le sien, tel qu’il est écrit à l’état civil, il peut être différent du vôtre.')}
          </div>
          <div className="mc-field-label" style={{ marginTop: 12 }}>{t('Sa date de naissance')}</div>
          <DateEnClair mots={motsDeDate()}
            value={naissance}
            max={aujourdhui}
            onChange={(iso) => setNaissance(iso ?? '')}
            ariaLabel={t('Sa date de naissance')}
          />
          <div className="mc-footnote" style={{ textAlign: 'left', marginTop: 6, lineHeight: 1.5 }}>
            {t('Elle nous sert à tenir son suivi, et c’est elle qui vous donne accès à son espace jusqu’à ses dix-huit ans.')}
          </div>
          {erreur && <div className="mc-form-err">{erreur}</div>}
          <button className="mc-cta mc-cta--indigo" style={{ marginTop: 14 }} onClick={() => void envoyer()}>
            {t('Envoyer à la maison')}
          </button>
          <button className="mc-textbtn" style={{ marginTop: 8 }} onClick={() => { setOuvert(false); setErreur(''); }}>
            {t('Annuler')}
          </button>
        </div>
      ) : (
        /* Le bouton plein ne s'offre qu'à un parent connu : pour les autres,
           c'est la ligne discrète du dessus qui a ouvert ce formulaire. */
        parenteConnue && (
          <button className="mc-cta mc-cta--outline" style={{ marginTop: 12 }} onClick={() => setOuvert(true)}>
            {t('+ Ajouter un enfant')}
          </button>
        )
      )}
    </>
  );
}

export function ProfilTab({ toast }: { toast: (m: string) => void }) {
  const [choixTheme, setChoixTheme] = useTheme();
  const lg = useLangue();
  const client = useClient();
  const clientId = useClientId();
  const { branch } = useBranch();
  /* L'AVANTAGE DU COMPTE FAMILLE SE LIT ICI (14 août) : le taux du juge de
     la maison — barème du foyer ou taux personnalisé — dit à la cliente ce
     que son compte lui donne. */
  const [famillesProfil] = useFamilies();
  const [tousClientsProfil] = useClients();
  const familleProfil = client?.familyId ? famillesProfil.find((f) => f.id === client.familyId) : undefined;
  /* La règle des mineurs, jusqu'au compte du serveur (voir `remiseFamillePct`). */
  const famPctProfil = remiseFamillePct(familleProfil, tousClientsProfil, todayIso(), 'mineurs');
  const { session } = useAuth();
  const email = client?.email ?? session?.user?.email ?? '';
  /* Le calibre affiché se déduit du comptage — le style à la main est retiré. */
  const [bandsProfil] = useModelBands();
  /* ══ OÙ EN EST SA COURONNE — 16 septembre 2026 ══════════════════════
     Maquette `maquette-les-trois-paliers.html`, arbitrage de Yéman : elle
     lit son palier ici, avec le pas suivant. JAMAIS le palier du maître qui
     la coiffe, jamais un compte à rebours : on n'achète pas un palier. Le
     même juge que la fiche du Trône, sur les mêmes rituels honorés. */
  const apptsProfil = useClientAppointments(clientId);
  const [servicesProfil] = useServices();
  const [reglagesProfil] = useSettings();
  const lecturePalier = client
    ? palierDuCarnet(client, apptsProfil, new Map(servicesProfil.map((s) => [s.id, s])), jourLocal(), reglagesProfil.paliers)
    : null;
  const pasSuivantProfil = client && lecturePalier?.palier
    ? pasSuivant(
      lecturePalier.palier,
      servicesProfil,
      new Set(apptsProfil.filter((a) => a.status === 'honoré').flatMap((a) => a.serviceIds)),
    )
    : undefined;

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
      toast(t('Notifications désactivées sur ce téléphone.'));
    } else {
      const ok = await enablePush(clientId);
      setPstate(await pushState());
      setPbusy(false);
      toast(ok ? t('Notifications activées sur ce téléphone.') : t('Notifications non activées, autorisez-les dans le navigateur.'));
    }
  };

  const save = () => {
    const n = name.trim();
    if (!n) {
      toast(t('Votre nom est nécessaire, la maison vous appelle par votre nom.'));
      return;
    }
    /* LA FICHE D'ABORD, L'ÉCRITURE ENSUITE. Avant la fiche (synchronisation en
       cours), le `map` n'écrivait RIEN et le toast disait quand même
       « enregistré » — la cliente retapait son prénom sans fin (Merine,
       12 août). On assure la fiche, et si elle n'est toujours pas là, on le
       DIT au lieu de mentir. */
    ensureClient(clientId, session?.user?.email, branch.id, n, session?.user?.id);
    if (!clientsStore.get().some((c) => c.id === clientId)) {
      toast(t('La maison synchronise encore votre dossier, réessayez dans un instant.'));
      return;
    }
    clientsStore.set((prev) =>
      prev.map((c) =>
        c.id === clientId
          ? { ...c, name: n, phone: phone.trim(), city: city.trim(), birthday: birthday || undefined }
          : c
      )
    );
    toast(t('Profil enregistré, la maison vous connaît.'));
  };


  const sinceYear = client ? new Date(client.since).getFullYear() : new Date().getFullYear();
  const initial = (client?.name?.trim() || 'C').charAt(0).toUpperCase();

  return (
    <div className="mc-pagepad mc-pagepad--top mc-fade">
      <div className="mc-micro-eyebrow">{t('Votre espace')}</div>
      <h1 className="mc-serif-title" style={{ margin: '6px 0 18px' }}>{t('Mon profil.')}</h1>

      <div className="mc-idcard">
        {client?.photo ? (
          <span className="mc-idcard__photo" style={{ backgroundImage: `url(${client.photo})` }} />
        ) : (
          <span className="mc-idcard__initial">{initial}</span>
        )}
        <div style={{ minWidth: 0 }}>
          <div className="mc-idcard__name">{client?.name ?? 'Ma Couronne'}</div>
          {email && <div className="mc-idcard__meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>}
          <div className="mc-idcard__meta">{t('Tête couronnée depuis {annee} · {maison}', { annee: sinceYear, maison: branch.name })}</div>
          {famPctProfil > 0 && (
            <div className="mc-idcard__meta" style={{ color: 'var(--copper-700, #9E6238)' }}>
              {t('Compte famille · remise −{pct} % (hors forfaits)', { pct: famPctProfil })}
            </div>
          )}
        </div>
      </div>

      {/* MES ENFANTS. C'est le parent qui écrit la date de naissance — une petite
          de trois ans ne la dira jamais au comptoir, et la Maison ne la devine
          pas. Il ne crée pas de fiche pour autant : il dépose un prénom et une
          date, la Maison ouvre la tête. */}
      <MesEnfants toast={toast} />
      {/* L'APPARENCE (3 octobre 2026) : elle suit le téléphone, ou la cliente
          la fixe. Voir theme.ts. */}
      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>{t('Apparence')}</div>
      <div className="mc-pushrow">
        <div style={{ minWidth: 0 }}>
          <div className="mc-pushrow__t">{t('Thème')}</div>
          <div className="mc-pushrow__s">
            {choixTheme === 'auto' ? t('Comme votre téléphone, clair le jour ou sombre le soir.') : choixTheme === 'sombre' ? t('Toujours sombre.') : t('Toujours clair.')}
          </div>
        </div>
        <div className="mc-seg" role="radiogroup" aria-label={t('Thème de l’app')}>
          {(['auto', 'clair', 'sombre'] as const).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={choixTheme === c}
              className={`mc-seg__opt${choixTheme === c ? ' is-on' : ''}`}
              onClick={() => setChoixTheme(c)}
            >
              {c === 'auto' ? t('Auto') : c === 'clair' ? t('Clair') : t('Sombre')}
            </button>
          ))}
        </div>
      </div>
      {/* LA LANGUE (3 octobre 2026) : gardée sur l'appareil ET sur sa fiche,
          pour que la Maison lui écrive dans la sienne. Les deux noms restent
          dans leur langue, chacune reconnaît le sien. Voir i18n.ts. */}
      {anglaisPropose && (
        <div className="mc-pushrow" style={{ marginTop: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="mc-pushrow__t">{t('Langue')}</div>
            <div className="mc-pushrow__s">{t('L’app vous parle dans cette langue. Vos messages WhatsApp suivront dès que la Maison les aura préparés.')}</div>
          </div>
          <div className="mc-seg" role="radiogroup" aria-label={t('Langue de l’app')}>
            {(['fr', 'en'] as const).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                lang={l}
                aria-checked={lg === l}
                className={`mc-seg__opt${lg === l ? ' is-on' : ''}`}
                onClick={() => {
                  changeLaLangue(l);
                  if (clientId && client && client.langue !== l) {
                    clientsStore.set((prev) => prev.map((c) => (c.id === clientId ? { ...c, langue: l } : c)));
                  }
                }}
              >
                {l === 'fr' ? 'Français' : 'English'}
              </button>
            ))}
          </div>
        </div>
      )}

      {pstate !== 'unsupported' && (
        <>
          <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>{t('Notifications')}</div>
          <div className="mc-pushrow">
            <div style={{ minWidth: 0 }}>
              <div className="mc-pushrow__t">{t('Rappels & confirmations sur ce téléphone')}</div>
              <div className="mc-pushrow__s">
                {pstate === 'subscribed' ? t('Vous serez prévenue à chaque réservation, modification et avant vos rendez-vous.')
                  : pstate === 'denied' ? t('Notifications bloquées, réactivez-les dans les réglages du navigateur.')
                  : t('Activez pour recevoir vos confirmations et rappels de rendez-vous.')}
              </div>
            </div>
            {pstate === 'denied' ? (
              <span className="mc-pushrow__on" style={{ color: 'var(--mc-error)' }}>{t('Bloquées')}</span>
            ) : (
              <button
                type="button"
                role="switch"
                aria-checked={pstate === 'subscribed'}
                aria-label={t('Activer les notifications')}
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

      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>{t('Vos informations')}</div>
      <div className="mc-profform">
        <label className="mc-profield">
          <span>{t('Nom complet')}</span>
          <input value={name} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mc-profield">
          <span>{t('Téléphone')}</span>
          <input value={phone} inputMode="tel" autoComplete="tel" onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label className="mc-profield">
          <span>{t('Ville')}</span>
          <input value={city} autoComplete="address-level2" onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="mc-profield">
          <span>{t('Date de naissance')}</span>
          {/* JOUR · MOIS · ANNÉE — 13 septembre 2026. Le champ natif s'écrivait
              dans la langue du téléphone : « 09/13/1990 » sous un téléphone
              réglé en anglais, et la cliente ne savait plus quel nombre était
              le mois. */}
          <DateEnClair mots={motsDeDate()}
            value={birthday}
            max={todayIso()}
            onChange={(iso) => setBirthday(iso ?? '')}
            ariaLabel={t('Date de naissance')}
          />
          {birthday && <span className="mc-profield__read">{birthdayLabel(birthday)}</span>}
        </label>
        <button className="mc-cta mc-cta--outline" style={{ marginTop: 18 }} onClick={save}>{t('Enregistrer')}</button>
      </div>

      {/* « MAÎTRE PRÉFÉRÉ » RETIRÉ (13 août, décision de Yéman) : la cliente
          ne choisit pas les maîtres — les mains sont l'affaire de la maison,
          au Profil comme au tunnel (décision du 10 août). */}

      <div className="mc-sectionlabel" style={{ margin: '22px 0 10px' }}>{t('Votre couronne')}</div>
      <div className="mc-preflist">
        <div className="mc-inforow">
          <span>{t('Calibre')}</span>
          {/* Déduit du comptage de la Maison — il ne se choisit pas. */}
          <span className="mc-inforow__v">{calibreDe(client?.lockCount, bandsProfil) ?? t('À compter à la Maison')}</span>
        </div>
        <div className="mc-inforow">
          <span>{t('Nombre de locks')}</span>
          <span className="mc-inforow__v">{client?.lockCount ?? '—'}</span>
        </div>
        {/* SON PALIER, ET LE PAS SUIVANT — lus sur ses rituels honorés. */}
        {lecturePalier?.palier && (
          <>
            <div className="mc-inforow">
              <span>{t('Où elle en est')}</span>
              <span className="mc-inforow__v">{t(lecturePalier.palier)}</span>
            </div>
            {pasSuivantProfil && (
              <div className="mc-inforow">
                <span>{t('Le pas suivant')}</span>
                <span className="mc-inforow__v">{pasSuivantProfil.name}</span>
              </div>
            )}
          </>
        )}
      </div>
      <div className="mc-emptyline" style={{ paddingTop: 6 }}>
        {lecturePalier?.palier
          ? t('{phrase} Renseignés par la maison, lors de vos rituels.', { phrase: t(PALIER_DIT[lecturePalier.palier].couronne) })
          : t('Renseignés par la maison, lors de vos rituels.')}
      </div>

      <button className="mc-cta mc-cta--quiet" style={{ marginTop: 22 }} onClick={() => void signOut()}>
        {t('Se déconnecter')}
      </button>
      {/* L'EMPREINTE DE VERSION — pour lire d'un coup d'œil quelle construction
          ce téléphone porte (14 août : « les écrans ne sont jamais publiés »
          alors que le site en ligne était à jour — impossible à trancher sans
          elle). Le format du build est AAAAMMJJHHMMSS. */}
      {(() => {
        const b = (import.meta.env.VITE_BUILD_ID as string | undefined) ?? '';
        const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(b);
        const mot = m
          ? t('Version du {date} · {heure}', {
            date: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' }),
            heure: `${m[4]}:${m[5]}`,
          })
          : t('Version de développement');
        return <div className="mc-footnote" style={{ marginTop: 10 }}>{mot}</div>;
      })()}
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
          <div className="mc-micro-eyebrow">{t('Votre suivi · la Gamme')}</div>
          <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>{t('Mes commandes.')}</h1>
        </div>
        <button className="mc-x" aria-label={t('Fermer')} onClick={onClose}>✕</button>
      </div>
      <div className="mc-scroll" style={{ flex: 1, padding: '8px 0 calc(16px + env(safe-area-inset-bottom))' }}>
        {orders.map((o) => (
          <div key={o.id} className="mc-orderrow">
            <div className="mc-orderrow__head">
              <span className="mc-orderrow__no">{o.number}</span>
              <span className="mc-orderrow__date">{jourDit(o.date)}</span>
            </div>
            <div className="mc-orderrow__lines">
              {o.lines.map((l) => (l.qty > 1 ? `${l.qty}× ${t(l.label)}` : t(l.label))).join(' · ')}
            </div>
            <div className="mc-orderrow__foot">
              <span className="mc-orderrow__total">{prix(invoiceTotal(o), currency)}</span>
              <span className={`mc-stchip ${ORDER_STATUS[o.status].cls}`}>{t(ORDER_STATUS[o.status].label)}</span>
            </div>
          </div>
        ))}
        {orders.length === 0 && (
          <div className="mc-emptyzone">
            <div className="mc-emptyzone__glyph">⬡</div>
            <div className="mc-emptyzone__t">{t('Aucune commande pour l’instant.')}</div>
            <div className="mc-emptyzone__s">
              {t('Composez votre commande depuis la Gamme, vous suivrez ici chacun de ses états.')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= NOTIFICATIONS ================= */

export function Notifications({ onClose, onOpenRdv }: { onClose: () => void; onOpenRdv?: (id: string) => void }) {
  const { currency } = useBranch();
  const [services] = useServices();
  const devis = useClientDevis();
  const upcoming = useUpcomingAppointments();
  const next = upcoming[0];
  const client = useClient();
  const bilansRecents = useBilansRecents();
  const [bilanLu, setBilanLu] = useState<Bilan | null>(null);

  /* Notifications effacées par la cliente : masquées + retirées du compteur. */
  const [dismissed] = useStore(dismissedMcStore);
  const dset = new Set(dismissed);
  const devisV = devis.filter((d) => !dset.has(`devis-${d.id}`));
  const upcomingV = upcoming.filter((a) => !dset.has(`resa-${a.id}`));
  const showRappel = !!next && !dset.has(`rappel-${next.id}`);
  const bilansV = bilansRecents.filter((b) => !dset.has(`bilan-${b.id}`));
  const dismiss = (id: string) => dismissedMcStore.set((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const clearAll = () =>
    dismissedMcStore.set((prev) => {
      const s = new Set(prev);
      for (const d of devis) s.add(`devis-${d.id}`);
      for (const a of upcoming) s.add(`resa-${a.id}`);
      if (next) s.add(`rappel-${next.id}`);
      for (const b of bilansRecents) s.add(`bilan-${b.id}`);
      return [...s];
    });

  /* Le pont devis → ERP : accepter ici rend le devis « accepté » au Trône (Factures). */
  const acceptDevis = (id: string) => {
    invoicesStore.set((prev) => prev.map((i) => (i.id === id && i.status === 'envoyée' ? { ...i, status: 'acceptée' } : i)));
  };

  const empty = devisV.length === 0 && upcomingV.length === 0 && !showRappel && bilansV.length === 0;

  return (
    <div className="mc-overlayscreen mc-slide" style={{ zIndex: 42 }}>
      <div className="mc-flowhead mc-flowhead--split">
        <div>
          <div className="mc-micro-eyebrow">{t('La maison vous parle')}</div>
          <h1 className="mc-flowhead__h1" style={{ marginTop: 4 }}>{t('Notifications.')}</h1>
        </div>
        <button className="mc-x" aria-label={t('Fermer')} onClick={onClose}>✕</button>
      </div>
      <div className="mc-scroll" style={{ flex: 1, padding: '8px 0 calc(16px + env(safe-area-inset-bottom))' }}>
        {!empty && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 24px 6px' }}>
            <button
              type="button"
              onClick={clearAll}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink-soft)', textDecoration: 'underline', textUnderlineOffset: '3px' }}
            >
              {t('Tout effacer')}
            </button>
          </div>
        )}
        {/* bilans — signés par le maître, lus ici */}
        {bilansV.map((b) => (
          <div key={b.id} className="mc-notif" style={{ position: 'relative', paddingRight: 34 }}>
            <button type="button" aria-label={t('Effacer')} onClick={() => dismiss(`bilan-${b.id}`)} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 12 }}>✕</button>
            <span className="mc-notif__dot mc-notif__dot--copper" />
            <div className="mc-notif__body">
              <div className="mc-notif__head">
                <span className="mc-notif__kind">{t('Votre bilan')}</span>
                <span className="mc-notif__time">{jourDit(b.remisLe)}</span>
              </div>
              <div className="mc-notif__msg">{t('Votre bilan du {jour} est prêt, avec votre routine à la maison.', { jour: jourDit(b.date) })}</div>
              <button className="mc-smallcta" style={{ marginTop: 10 }} onClick={() => setBilanLu(b)}>{t('Lire mon bilan')}</button>
            </div>
          </div>
        ))}

        {/* devis — envoyés par le Trône, acceptés ici */}
        {devisV.map((d) => (
          <div key={d.id} className="mc-notif" style={{ position: 'relative', paddingRight: 34 }}>
            <button type="button" aria-label={t('Effacer')} onClick={() => dismiss(`devis-${d.id}`)} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 12 }}>✕</button>
            <span className={`mc-notif__dot ${d.status === 'acceptée' ? 'mc-notif__dot--success' : 'mc-notif__dot--copper'}`} />
            <div className="mc-notif__body">
              <div className="mc-notif__head">
                <span className="mc-notif__kind">{t('Devis · {numero}', { numero: d.number })}</span>
                <span className="mc-notif__time">{jourDit(d.date)}</span>
              </div>
              <div className="mc-notif__msg">
                {d.status === 'acceptée'
                  ? t('Devis accepté, la maison prépare votre rituel.')
                  : t('La maison vous propose un devis, à accepter pour sceller le rituel.')}
              </div>
              <div className="mc-notif__total">{prix(invoiceTotal(d), currency)}</div>
              {d.status === 'envoyée' && (
                <button className="mc-smallcta" style={{ marginTop: 10 }} onClick={() => acceptDevis(d.id)}>
                  {t('Accepter le devis')}
                </button>
              )}
            </div>
          </div>
        ))}

        {/* rappel du prochain rituel */}
        {showRappel && next && (
          <div className="mc-notif" style={{ position: 'relative', paddingRight: 34 }}>
            <button type="button" aria-label={t('Effacer')} onClick={() => dismiss(`rappel-${next.id}`)} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 12 }}>✕</button>
            <span className="mc-notif__dot mc-notif__dot--indigo" />
            <div className="mc-notif__body">
              <div className="mc-notif__head">
                <span className="mc-notif__kind">{t('Rappel')}</span>
                <span className="mc-notif__time">{jourDit(next.date)}</span>
              </div>
              <div className="mc-notif__msg">
                {t('{rituel} · {jour} à {heure}. Venez les locks secs, sans produit.', {
                  rituel: serviceNames(next, services) || t('Votre rituel'),
                  jour: jourDit(next.date),
                  heure: next.time,
                })}
              </div>
              {onOpenRdv && <button className="mc-smallcta" style={{ marginTop: 10 }} onClick={() => onOpenRdv(next.id)}>{t('Voir mon rendez-vous')}</button>}
            </div>
          </div>
        )}

        {/* réservations — l'état vu par la maison */}
        {upcomingV.map((a) => (
          <div key={a.id} className="mc-notif" style={{ position: 'relative', paddingRight: 34 }}>
            <button type="button" aria-label={t('Effacer')} onClick={() => dismiss(`resa-${a.id}`)} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-soft)', fontSize: 12 }}>✕</button>
            <span className={`mc-notif__dot ${a.status === 'confirmé' ? 'mc-notif__dot--success' : 'mc-notif__dot--soft'}`} />
            <div className="mc-notif__body">
              <div className="mc-notif__head">
                <span className="mc-notif__kind">{a.status === 'confirmé' ? t('Confirmation') : t('Réservation')}</span>
                <span className="mc-notif__time">{jourDit(a.date)} · {a.time}</span>
              </div>
              <div className="mc-notif__msg">
                {a.status === 'confirmé'
                  ? t('{rituel} confirmé, la maison vous attend.', { rituel: serviceNames(a, services) || t('Votre rituel') })
                  : t('{rituel}, acompte reçu, en attente de la maison.', { rituel: serviceNames(a, services) || t('Votre rituel') })}
              </div>
              {onOpenRdv && <button className="mc-smallcta" style={{ marginTop: 10 }} onClick={() => onOpenRdv(a.id)}>{t('Voir mon rendez-vous')}</button>}
            </div>
          </div>
        ))}

        {empty && <div className="mc-emptyline" style={{ padding: '18px 24px' }}>{t('Aucune notification, la maison veille.')}</div>}
      </div>
      {bilanLu && client && <BilanLecteur bilan={bilanLu} porteuse={client} onClose={() => setBilanLu(null)} />}
    </div>
  );
}
