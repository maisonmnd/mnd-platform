import { asset } from '../../shared/asset';
import { Fragment, useMemo, useRef, useState } from 'react';
import { useBranch } from '../../shared/branches';
import { fmtMoney } from '../../shared/currency';
import { depositForServices, depositPctFor, useSettings, useExceptionsHoraires, joursFermesParmi, horairesDescendus } from '../../shared/settings';
import { useBlocages } from '../../shared/blocages';
import { appointmentsStore, useAppointments, venuesHonorees, type Appointment, estampilleLesPoses } from '../../shared/agenda';
import { useSubscribers, subPaid } from '../../shared/abonnements';
import { peutReserver } from '../../shared/echeancier';
import { askNotifyPermission, downloadIcs, notifyLocal, type IcsEvent } from '../../shared/ics';
import { enablePush, pushNotify, pushNotifyStaff } from '../../shared/push';
import { uid, useStore } from '../../shared/store';
import { vitrineConfigStore } from '../../shared/bridges';
import { clientsStore, useClients, useFamilies, usePersonas, remiseFamillePct } from '../../shared/clients';
import { estKids, tetesPortees } from '../../shared/accounts';
import { catalogueDeLaTete } from '../../shared/kids';
import { ENVIES, QUIZ_POOL, envieLabel, type ElanKey, type EnvieKey } from '../../shared/quiz';
import { recoPourEnvie, type RecoContexte } from '../../shared/reco';
import { kkiapayEnabled, payWithKkiapay, verifyDeposit } from '../../shared/kkiapay';
import { useAuth } from '../../shared/auth';
import { useCategories, useProducts, useServices, priceModeOf, longueurLabel, catsDansLOrdre, mondeDeCat, mondeLabel, type Service } from '../../shared/catalog';
import { useModelBands, useBandSets, pricingOf, personalPriceXof, prixDansPanier, remiseGestePct, unGesteDansLePanier, personalDurationMin, isPersonalized, prixFerme, estProposable, scalesWithModel, sortedBands, bandOf, bandRange, regimeTarifaire, type ModelBand } from '../../shared/pricing';
import {
  DOW_LETTERS,
  MONTHS,
  QUATRE_TEMPS,
  dayLabelIso,
  ensureClient,
  firstName,
  fmtDuration,
  freeSlots,
  useCreneauxOccupes,
  pad2,
  todayIso,
  useClient,
  useClientId,
  useVisibleCatalog,
  type BookingPrefill,
} from './lib';

/* RÉSERVER EN 6 TEMPS
   objectif → prestations → créneau → récapitulatif → acompte → confirmé

   LE PALIER A QUITTÉ LE PARCOURS — 6 août 2026. Fondation, Élévation et
   Souveraineté ne commandent qu'une chose : le taux de commission du maître
   qui exécute le rituel. C'est une affaire interne à la Maison. On demandait
   donc à la cliente de trancher entre trois mots qui ne décrivent rien de ce
   qu'elle vient chercher, et dont la réponse ne changeait ni son prix ni son
   rendez-vous.

   Le champ demeure au Catalogue, où il paie l'équipe. L'étape reste indexée
   à 1 dans les tableaux ci-dessous : renuméroter six écrans pour supprimer le
   deuxième, c'est six occasions de se tromper d'un cran. Elle n'est plus
   jamais atteinte — l'objectif mène directement aux prestations.

   L'acompte suit le taux de la Maison (Paramètres du Trône), non figé.

   LE QUIZ OUVRE LE TUNNEL — 7 août 2026. Les deux questions du miroir du salon
   se posent désormais ici, au seuil : « qu'est-ce qui compte le plus pour vous »,
   puis la prestation que la Maison propose à cette envie — la VRAIE, prise au
   catalogue et affichée à SON prix. Elle est contournable d'un mot (« Je sais
   déjà ce que je veux »), et ne s'ouvre pas du tout si la Régie n'a rien à
   proposer.

   Il porte l'index QUIZ (−1) et non 0 : le tunnel garde ses sept index, dont
   l'orphelin. Renuméroter six écrans pour en ajouter un devant, c'était six
   occasions de se tromper d'un cran — la même raison qui a laissé le palier
   vide à l'index 1. */

/* LE RITUEL EN UN ÉCRAN — 15 août 2026, maquette validée par Yéman
   (« Le rituel en un écran »). L'objectif et les prestations ne font plus
   qu'un ACCORDÉON À SECTION UNIQUE : les ateliers restent listés du haut en
   bas, celui qu'on ouvre déplie ses prestations et referme le précédent. On
   coche, on descend, on coche encore — sans jamais quitter la page.

   Ce qui cassait : une prestation d'un AUTRE atelier coûtait un retour en
   arrière, donc deux gestes par ajout — six allers-retours pour un panier de
   trois prestations, c'est-à-dire un péage sur les paniers les plus élevés.

   Une seule section ouverte à la fois, et non plusieurs : sur téléphone, deux
   ateliers dépliés font défiler l'écran sur trois hauteurs et l'on perd de vue
   ce qu'on a coché. La ligne de l'atelier REFERMÉ porte le compte
   (« 2 · 35 000 F ») — rien ne se perd en se repliant.

   LE RITUEL SE RELIT AVANT SON MOMENT (écran 2 de la même maquette) : le
   récapitulatif n'a plus d'écran à lui — il OUVRE celui du moment, prestations,
   remises et total au-dessus du jour et de l'heure. Le prix ne se découvre
   donc plus tout à la fin, et le geste se scelle depuis le panier collant.

   VOTRE RITUEL · LE MOMENT · LA CONFIRMATION : trois temps, plus l'acompte
   quand la Maison en demande un. Les index 1, 2 et 4 sont des orphelins — les
   écrans gardent leurs numéros. Renuméroter pour combler un trou du milieu,
   c'est autant d'occasions de se tromper d'un cran. */

/* L'écran d'envie précède tout le reste, et les tableaux de titres ne le
   connaissent pas : il porte ses mots lui-même. */
const QUIZ = -1;

const TITLES = ['Votre rituel.', '—', '—', 'Le moment.', '—', 'L’acompte.', 'Confirmé.'];
const EYEBROWS = [
  'Réserver · votre rituel',
  '—',
  '—',
  'Réserver · le moment',
  '—',
  'Réserver · Mobile Money',
  'Réserver · scellé',
];

const PAY_METHODS = [
  { k: 'mtn', n: 'MTN MoMo' },
  { k: 'moov', n: 'Moov Money' },
] as const;
type PayKey = (typeof PAY_METHODS)[number]['k'];

type Props = {
  prefill?: BookingPrefill;
  onClose: () => void;
  toast: (msg: string) => void;
};

export default function Booking({ prefill, onClose, toast }: Props) {
  const { branch, currency } = useBranch();
  /* Ses abonnements, pour la porte du paiement (voir plus bas). */
  const [mesAbonnements] = useSubscribers();
  /* CE QU'ELLE PEUT RÉSERVER — la carte élaguée à sa mesure. Seules les
     PRESTATIONS en sortent : les catégories réservables se déduisent d'elles
     (voir `bookableCats`), donc rien d'invisible ne peut fuir par ce chemin. */
  const { services } = useVisibleCatalog();
  /* L'ARBRE ENTIER, à côté. La carte élaguée ne porte que ce que CETTE cliente
     peut voir — bon pour AFFICHER, faux pour JUGER : le monde d'une prestation
     se lit en remontant à sa racine, et une racine élaguée fait retomber sa
     famille sur « le plateau technique ». Le Juste Prix personnel, lui, ne
     s'applique qu'à l'Atelier (`coefJustePrix`) : jugé sur la carte élaguée il
     s'ÉTEIGNAIT ici, alors que le comptoir — qui a l'arbre entier —
     l'appliquait ; les deux surfaces se seraient contredites sur le prix, ce
     que Ma Couronne ne peut pas se permettre. On affiche la carte, on juge sur
     l'arbre. */
  const [tousCats] = useCategories();
  /* LE CATALOGUE ENTIER, pour les mêmes raisons — et pour deux JUGES précis :
     ① LE PRIX D'UN FORFAIT est la somme de sa composition ; résolue sur la
     carte élaguée, une prestation masquée sortait de la somme EN SILENCE.
     Constaté le 16 août, en ligne : le « Forfait VÈKPÈ™ Initiation » s'annonçait
     17 600 F quand la caisse en encaisse 176 000 — dix fois moins, sur cinq
     forfaits, 490 400 F d'écart cumulé. Elle achète le pack ENTIER ; son prix
     ne dépend pas de ce qu'on lui montre.
     ② LES CRÉNEAUX LIBRES se calculent sur la durée des rituels DÉJÀ pris —
     ceux des autres clientes, qui peuvent porter une prestation masquée à
     celle-ci. Sur la carte élaguée, ces rituels comptaient pour moins de temps
     qu'ils n'en prennent, et le calendrier promettait des heures occupées.
     `services` (élagué) reste ce qu'elle peut CHOISIR ; `tousServices` est ce
     avec quoi on CALCULE. */
  const [tousServices] = useServices();
  /* Les produits de la Gamme — une composition de forfait peut en porter. */
  const [produits] = useProducts();
  const [appts] = useAppointments();
  const clientId = useClientId();
  const client = useClient();
  /* LES TÊTES QU'ELLE PORTE — réserver POUR un enfant (TEMPS 2 des comptes
     enfants, 0036). Le sélecteur ne paraît que si la Maison a validé des
     mineurs sur son compte famille. Le prix de l'enfant se calcule comme le
     sien : il hérite de son coefficient à la validation et n'a pas de modèle
     au dossier — mêmes chiffres, honnêtement. */
  const [tousClients] = useClients();
  const [familles] = useFamilies();
  const tetes = client ? tetesPortees(client, tousClients, familles, todayIso()) : [];
  /* « Réserver pour Mahoussi » (accueil, tête regardée) arrive déjà posé. */
  const [pourId, setPourId] = useState(prefill?.pourId ?? '');
  const beneficiaire = tetes.find((t) => t.id === pourId);
  /* LA TÊTE POUR QUI L'ON RÉSERVE (12 août) : tout — seuil de venues, tarif,
     longueur, durée, acompte — se calcule sur ELLE, pas sur le compte
     connecté. Avant, une mère à 2 venues ouvrait le forfait « dès la 3ᵉ » à
     la PREMIÈRE venue de sa fille, et le rendez-vous de l'enfant se figeait
     au barème et à la longueur de la mère. */
  const cible = beneficiaire ?? client;
  const { session } = useAuth();
  /* LE COMPTE FAMILLE DE LA TÊTE (14 août) : sa remise se VOIT ici — prix
     famille au récapitulatif — et se fige en francs sur le rendez-vous, pour
     que le Trône encaisse exactement ce que l'écran a promis. Le juge est
     celui de la maison : taux posé = personnalisé ; compte muet = barème du
     foyer (1 enfant → 10 %, 2 et plus → 15 %). Jamais sur les forfaits. */
  const familleDeLaTete = cible?.familyId ? familles.find((f) => f.id === cible.familyId) : undefined;
  const famPctCompte = remiseFamillePct(familleDeLaTete, tousClients, todayIso());

  const prefService = prefill ? services.find((s) => s.id === prefill.serviceId) ?? null : null;

  /* LE CRÉNEAU PRÉDIT ARRIVE PRÉ-CHOISI (maquette accueil, repère 2) :
     « Réserver ce créneau » porte la date de la cadence — la grille s'ouvre
     sur ce jour, l'heure reste à choisir. Une date passée, ou au-delà des deux
     mois que le calendrier montre, est simplement ignorée. */
  const prefIso = (() => {
    const d = prefill?.dateIso;
    if (!prefService || !d || d < todayIso()) return null;
    const now = new Date();
    const decalage = (Number(d.slice(0, 4)) - now.getFullYear()) * 12 + (Number(d.slice(5, 7)) - 1 - now.getMonth());
    return decalage === 0 || decalage === 1 ? { iso: d, mois: decalage } : null;
  })();

  /* Une prestation déjà désignée (offre instantanée, re-réservation) saute le
     quiz ET l'objectif : on ne demande pas son envie à une cliente qui vient de
     toucher « Réserver ce rituel ». */
  const [step, setStep] = useState(prefService ? 3 : QUIZ);
  /* Le quiz du seuil : la variante de questions posée, l'envie et l'élan dits. */
  const [cfg] = useStore(vitrineConfigStore);
  const [variante, setVariante] = useState(0);
  const [envie, setEnvie] = useState<EnvieKey | null>(null);
  const [elan, setElan] = useState<ElanKey | null>(null);
  /* L'ATELIER OUVERT — un seul à la fois (accordéon à section unique).
     `null` = tout est replié ; une prestation déjà désignée ouvre le sien. */
  const [catId, setCatId] = useState<string | null>(prefService?.categoryId ?? null);
  /* Une poignée de choix à la fois (Zenoti : 5–10 idéal) — au-delà de dix, le
     pli se coupe à huit et « Voir les N autres » le rouvre d'un geste. Se
     remet à zéro à chaque atelier ouvert : la coupe est celle du pli courant. */
  const [voirTout, setVoirTout] = useState(false);
  /* Sélection multiple : une réservation peut réunir plusieurs prestations. */
  const [selectedIds, setSelectedIds] = useState<string[]>(prefService ? [prefService.id] : []);
  const [monthIdx, setMonthIdx] = useState(prefIso?.mois ?? 0);
  const [selIso, setSelIso] = useState<string | null>(prefIso?.iso ?? null);
  const [time, setTime] = useState<string | null>(null);
  /* Séries multi-séances : chaque séance choisie (date + heure), dans l'ordre. */
  const [sessionDates, setSessionDates] = useState<{ iso: string; time: string }[]>([]);
  const [pay, setPay] = useState<PayKey | null>(null);
  const [paying, setPaying] = useState(false);
  /* Voie choisie à l'écran d'acompte : régler en ligne (défaut quand les rails
     KkiaPay sont branchés) ou envoyer soi-même le Mobile Money. */
  const [manualDeposit, setManualDeposit] = useState(false);
  /* Identifiant de la séance 1 réservé avant le paiement (voir payOnline). */
  const onlineApptId = useRef<string | null>(null);
  /* Issue du règlement en ligne, pour que l'écran de confirmation dise la
     vérité : reçu (vérifié par le serveur), payé mais pas encore vérifié, ou
     rien du tout (voie manuelle). */
  const [onlinePaid, setOnlinePaid] = useState<{ ok: boolean; ref: string } | null>(null);

  const discountPct = prefill?.discountPct ?? 0;
  const offerLabel = prefill?.offerLabel;

  /* ---- Prestations retenues (dans l'ordre du catalogue) et agrégats ---- */
  const selected = useMemo(
    () => services.filter((s) => selectedIds.includes(s.id)),
    [services, selectedIds]
  );
  /* SON prix, SA durée : le modèle de la cliente (nombre de locks, barème par
     tranches) et son Juste Prix personnalisent le tarif ET le créneau. */
  const [bands] = useModelBands();
  /* Les barèmes par atelier : VÈKPÈ™ a les siens, la création ne progresse pas
     comme le resserrage. */
  const [sets] = useBandSets();
  const pricing = pricingOf(cible ?? undefined, bands, sets, tousCats);
  const personalized = isPersonalized(pricing);
  /* LA DURÉE PEUT CROIRE LA CLIENTE, LE PRIX JAMAIS. Tant que la Maison n'a
     pas compté ses locks, la densité qu'elle déclare au tunnel (chips
     ci-dessous, `lockCountDeclare`) affine le CRÉNEAU — une Micro demande des
     heures qu'une Jumbo ne demande pas, et sans elles le calendrier promettait
     un créneau intenable. Le PRIX, lui, reste sur `pricing` : une cliente ne
     peut pas s'auto-tarifer, et le comptage de la Maison l'emportera. */
  const pricingDuree = cible && !cible.lockCount && cible.lockCountDeclare
    ? pricingOf({ ...cible, lockCount: cible.lockCountDeclare }, bands, sets, tousCats)
    : pricing;
  const totalDuration = selected.reduce((n, s) => n + personalDurationMin(s, pricingDuree), 0);
  /* Nombre de séances à programmer : le maximum parmi les prestations retenues. */
  const totalSessions = selected.reduce((n, s) => Math.max(n, s.sessions), 1);
  /* `services` + `produits` en arguments : sans eux, un FORFAIT COMPOSÉ ne
     résolvait jamais sa composition ici — Ma Couronne annonçait son priceXof
     stocké (souvent 0 F) au lieu du prix réel de la tête (12 août). */
  /* LE GESTE OFFERT (15 août) — le prix d'une prestation peut dépendre du
     PANIER (shampoing offert aux Pico et Galaxy qui viennent pour une
     Reprise). `prixIci` est le seul juge de prix de ce tunnel : Ma Couronne
     doit annoncer très exactement ce que le comptoir encaissera. */
  const prixIci = (s: Service) => prixDansPanier(s, pricing, selected, tousServices, produits);
  const knownTotal = selected.filter((s) => !s.hidePrice).reduce((n, s) => n + prixIci(s), 0);
  /* La remise famille, en francs, sur la part HORS FORFAITS du panier. */
  /* UNE SEULE FAVEUR À LA FOIS (16 août, décision de Yéman) : quand la Maison
     offre déjà un geste dans ce rituel, la remise du compte famille ne s'y
     ajoute pas. Deux cadeaux pour une venue coûtent trop cher, et le geste est
     le plus généreux des deux. */
  const gesteAuPanier = unGesteDansLePanier(selected, pricing);
  const famPct = gesteAuPanier ? 0 : famPctCompte;
  const famForfaitXof = selected
    .filter((s) => !s.hidePrice && regimeTarifaire(s, tousCats).k === 'forfait')
    .reduce((n, s) => n + prixIci(s), 0);
  const famRemiseXof = famPct > 0 ? Math.round(Math.max(0, knownTotal - famForfaitXof) * (famPct / 100)) : 0;
  const anyHidden = selected.some((s) => s.hidePrice);
  const allHidden = selected.length > 0 && selected.every((s) => s.hidePrice);
  /* Maître : commun si toutes le partagent, sinon celui de la première prestation. */
  const master = selected[0]?.master ?? '';
  const masterVaries = selected.length > 1 && !selected.every((s) => s.master === master);
  const summaryLabel = selected.length === 1 ? selected[0].name : `${selected.length} prestations`;

  /* Prix effectif (offre appliquée sur le total). */
  useSettings(); // re-rend quand les taux d'acompte OU la capacité du jour changent au Trône
  /* Les murs du calendrier : `freeSlots` les lit dans les registres, mais c'est
     l'abonnement d'ICI qui re-rend la grille quand un blocage tombe. */
  const [blocages] = useBlocages();
  const [exceptions] = useExceptionsHoraires();
  /* L'offre en % d'abord, puis la remise famille en francs — le même ordre
     que le juge d'encaissement du Trône (apptNetXof). */
  const price = Math.max(0, Math.round(knownTotal * (1 - discountPct / 100)) - famRemiseXof);
  /* Acompte UNIQUEMENT sur les prestations qui l'exigent, CHACUNE à son propre
     taux (Paramètres du Trône). Aucune → pas d'étape acompte, réservation directe. */
  const priced = selected.filter((s) => !s.hidePrice);
  /* L'acompte se calcule sur les prix PERSONNALISÉS — le pourcentage de la
     maison s'applique à ce que la cliente paiera vraiment. */
  const deposit = depositForServices(priced.map((s) => ({ id: s.id, priceXof: prixIci(s) })), discountPct);
  const hasDeposit = deposit > 0;
  /* Les taux pouvant différer d'une prestation à l'autre, on n'annonce un
     pourcentage que s'il est unique — sinon le montant parle seul. */
  const depositRates = [...new Set(priced.map((s) => depositPctFor(s.id)).filter((p) => p > 0))];
  const depositPct = depositRates.length === 1 ? depositRates[0] : null;
  /* Base réellement soumise à l'acompte (≠ total : seules certaines prestations). */
  const depositBase = Math.round(
    priced.filter((s) => depositPctFor(s.id) > 0).reduce((n, s) => n + prixIci(s), 0) * (1 - discountPct / 100),
  );

  /* CE QUI LA CONCERNE, ELLE. Les créations existent en cinq versions, une par
     calibre : montrer les cinq à une cliente dont on connaît le modèle ne lui
     donne pas le choix, ça lui donne l'occasion de réserver le mauvais. On ne
     retient donc que les prestations de SON calibre — et tant qu'elle n'a pas
     de modèle au dossier, `servesBand` laisse tout passer, comme avant.

     `selected` (plus haut) lit toujours le catalogue entier : une prestation
     déjà choisie ne doit pas s'évaporer d'un panier parce que le modèle a
     changé entre-temps.

     LES PRESTATIONS À SEUIL DE VENUES s'ouvrent ici comme au comptoir : le
     forfait GBÈJÍ™ Fidélité paraît à la 3ᵉ venue honorée, pas avant. Sous
     RLS, la cliente ne lit que SES rendez-vous (et ceux de ses mineurs) —
     c'est précisément ce que le compteur regarde : les venues de la tête
     pour qui l'on réserve, celle dont `pricing` porte déjà le tarif. */
  const venuesTete = cible ? venuesHonorees(appts, cible.id) : 0;
  /* MND KIDS — la mère qui réserve pour sa fille voit la section ; sur son
     propre rituel, elle ne la voit pas. */
  /* LA TÊTE SERVIE COMMANDE LE CATALOGUE : la mère qui réserve pour sa fille
     ne voit que MND Kids ; pour elle-même, elle ne le voit pas du tout. */
  const verdictKids = estKids(beneficiaire ?? client ?? undefined, todayIso());
  const offre = catalogueDeLaTete(
    services.filter((s) => estProposable(s, pricing, venuesTete, !!familleDeLaTete, verdictKids)),
    verdictKids,
  );

  /* Catégories réservables : au moins une prestation visible. */
  /* DANS L'ORDRE DU CATALOGUE (12 août) : objectifs et prestations suivent
     les champs `order` du Trône — le tunnel doit dérouler la carte dans le
     même ordre que la Maison la pense.

     L'ORDRE SE PREND SUR L'ARBRE ENTIER (15 août) — jamais sur la liste
     visible. `useVisibleCatalog` ÉLAGUE : une cliente à qui rien de GBÈJÍ™ ne
     s'adresse ne reçoit pas GBÈJÍ™, mais reçoit toujours ses familles
     (KLƆKLƆ™, LES SOINS, SÍNSIN™, Styling). Ranger CETTE liste-là, c'était
     ranger un arbre sans ses branches : les familles orphelines de leur
     atelier perdaient leur place et fermaient la marche, pendant qu'un
     atelier resté entier — YÈKPÈ™, la coloration — remontait en tête. La
     Maison pense KLƆKLƆ · les soins · SÍNSIN · les coiffures, PUIS YÈKPÈ ;
     l'écran disait le contraire. Le monde se lit sur le même arbre, sinon
     une famille sans son atelier tombe au « plateau technique ». */
  const ordreCatalogue = useMemo(() => catsDansLOrdre(tousCats), [tousCats]);
  const bookableCats = ordreCatalogue.filter((c) => offre.some((s) => s.categoryId === c.id));
  /* Le corps d'un pli : les prestations de CET atelier, dans l'ordre du Trône.
     Le palier ne les trie plus — toutes celles qu'elle peut réserver y sont. */
  const servicesDe = (id: string) => offre.filter((s) => s.categoryId === id).sort((a, b) => a.order - b.order);

  const toggleService = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  /* ---- Le quiz du seuil ----
     LE JUGE EST AILLEURS (`shared/reco.ts`) : son persona, son histoire si la
     Maison l'a voulu, le repli commun — le miroir du salon et cet écran doivent
     répondre la même chose. Ici on ne fournit que le contexte.

     `offre` (et non le catalogue entier) : une prestation désignée mais masquée
     à la Vitrine, ou taillée pour un autre modèle, ne se propose pas — mieux
     vaut ne rien promettre que promettre ce qu'elle ne pourra pas réserver deux
     écrans plus loin. `services` reste le catalogue visible ENTIER, pour relire
     son histoire. */
  const [personas] = usePersonas();
  const ctxReco: RecoContexte = {
    offre,
    catalogue: services,
    personas,
    maison: cfg.recoParEnvie,
    appointments: appts,
    auto: cfg.recoAuto,
  };
  const recoDe = (k: EnvieKey) => recoPourEnvie(client, k, ctxReco)?.service;
  const recoSvc = envie ? recoDe(envie) : undefined;
  const motEnvie = ENVIES.find((e) => e.k === envie);
  const pool = QUIZ_POOL[variante % QUIZ_POOL.length];
  /* Le quiz ne s'ouvre que s'il a quelque chose à proposer : l'interrupteur DE
     MA COURONNE allumé au Trône (`quizCouronne`, distinct de celui du miroir du
     salon — la cliente est seule devant son téléphone, la maîtresse n'est pas
     là pour expliquer), et au moins une envie pourvue d'une prestation qu'elle
     peut vraiment réserver. Rien à proposer = pas d'écran, plutôt que deux
     questions pour rien. Réglage absent = allumé, comme à sa naissance. */
  const quizActif = cfg.quizCouronne !== false && !prefService && ENVIES.some((e) => !!recoDe(e.k));
  /* L'écran qu'on REGARDE. Le quiz s'efface s'il n'a rien à dire — l'objectif
     prend alors sa place, sans qu'aucune navigation n'ait à le savoir (le
     catalogue peut arriver du serveur après le premier rendu). */
  const vue = step === QUIZ && !quizActif ? 0 : step;
  const premierEcran = quizActif ? QUIZ : 0;
  /* LE COMPTE DIT LA VÉRITÉ DE CE PARCOURS-CI : votre rituel · le moment · la
     confirmation, plus le quiz s'il s'ouvre et l'acompte si la Maison en
     demande un sur ces prestations. Il bouge donc pendant qu'elle compose —
     c'est le prix de l'honnêteté : annoncer trois écrans puis en imposer un
     quatrième vaut moins qu'un dénominateur qui suit la vérité. */
  const total = 3 + (quizActif ? 1 : 0) + (hasDeposit ? 1 : 0);
  const rang = (s: number) => {
    if (s === QUIZ) return 1;
    const q = quizActif ? 1 : 0;
    if (s === 0) return 1 + q;
    if (s === 3) return 2 + q;
    if (s === 5) return 3 + q;
    return total; // 6 · confirmé — toujours le dernier
  };

  /* SON ENVIE S'INSCRIT AU DOSSIER dès qu'elle la dit — la Maison la lit au
     Trône même si la réservation n'aboutit pas. La dernière seulement : une
     envie est du jour, pas une étiquette qu'on empile. */
  const declareEnvie = (k: EnvieKey) => {
    setEnvie(k);
    if (!clientId || clientId === 'c-local') return;
    clientsStore.set((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, envie: k, envieAt: todayIso() } : c)),
    );
  };

  /* La reco acceptée : retenue comme si elle l'avait cochée à l'écran des
     prestations — même sélection, même suite. */
  const prendreReco = () => {
    if (!recoSvc) return;
    setCatId(recoSvc.categoryId);
    setSelectedIds([recoSvc.id]);
    setSessionDates([]); setSelIso(null); setTime(null); setMonthIdx(0);
    setStep(3);
  };

  /* ---- Calendrier : mois courant + DEUX suivants, disponibilité sur la durée TOTALE ----
     « Les clients de Ma Couronne n'arrivent pas à prendre RDV au-delà du
     30 septembre. Allow 2 months ahead » (Yéman, 31 août 2026).

     LE 31 AOÛT, DEUX MOIS N'EN FONT QU'UN. Le calendrier ouvrait le mois
     courant et le suivant : le dernier jour d'août, cela ne laissait qu'un
     mois et un jour devant soi, et la cliente qui prépare sa reprise de
     rentrée butait sur un mur. Trois fenêtres donnent au moins deux mois
     pleins, quel que soit le jour où l'on regarde. */
  const months = useMemo(() => {
    const now = new Date();
    return [0, 1, 2].map((k) => {
      const d = new Date(now.getFullYear(), now.getMonth() + k, 1);
      return { y: d.getFullYear(), m: d.getMonth(), label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` };
    });
  }, []);

  const month = months[monthIdx];

  /* ── CE QUE LE SALON A DÉJÀ PRIS — 31 août 2026 ────────────────────
     La RLS ne laisse lire à une cliente que SES rendez-vous ; le calendrier
     se dessinait donc contre un agenda vide. `creneaux_occupes` (0079) rend
     la forme des murs sans dire qui les occupe. On demande la fenêtre
     entière d'un coup : trois mois, une requête, et plus rien à faire quand
     elle tourne les pages. */
  const fenetre = useMemo(() => {
    const p = months[0];
    const d = months[months.length - 1];
    return {
      du: `${p.y}-${pad2(p.m + 1)}-01`,
      au: `${d.y}-${pad2(d.m + 1)}-${pad2(new Date(d.y, d.m + 1, 0).getDate())}`,
    };
  }, [months]);
  const occupes = useCreneauxOccupes(branch.id, fenetre.du, fenetre.au);

  /* LES RÉGLAGES ENTRENT DANS LES DÉPENDANCES — 31 août 2026. « Le calendrier
     est libre le lundi 31 août pourtant le salon est fermé. »

     `freeSlots` lit les heures d'ouverture dans le magasin, MAIS ce calcul est
     mémorisé : au premier rendu le document n'est pas encore descendu du
     serveur, et le repli dit lundi ouvert de 9 h à 19 h. La vérité arrivait un
     instant plus tard, le composant se redessinait — et la grille, elle,
     gardait sa réponse d'avant, faute d'une dépendance qui ait changé. Un
     abonnement sans dépendance ne rafraîchit rien. */
  const [reglages] = useSettings();

  const calCells = useMemo(() => {
    if (!selected.length) return [];
    const first = new Date(month.y, month.m, 1);
    const daysIn = new Date(month.y, month.m + 1, 0).getDate();
    const today = todayIso();
    const cells: { key: string; day: number | null; iso?: string; free: boolean }[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push({ key: `b${i}`, day: null, free: false });
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${month.y}-${pad2(month.m + 1)}-${pad2(d)}`;
      const past = iso < today;
      const free = !past && freeSlots(iso, master, totalDuration, appts, tousServices, branch.id, occupes).length > 0;
      cells.push({ key: iso, day: d, iso, free });
    }
    return cells;
  }, [month, selected.length, master, totalDuration, appts, services, branch.id, blocages, exceptions, occupes, reglages]);

  const dayTimes = selIso && selected.length
    ? freeSlots(selIso, master, totalDuration, appts, tousServices, branch.id, occupes)
    : [];

  /* LE MOMENT EST POSÉ quand toutes les séances ont le leur — c'est lui qui
     arme le bouton du panier collant (l'écran ne se quitte plus tout seul en
     touchant une heure). */
  const momentComplet = sessionDates.length >= totalSessions;
  const dernierMoment = sessionDates[sessionDates.length - 1];

  /* ---- Densité déclarée (12 août) — la question ne se pose qu'au créneau,
     et seulement quand elle compte : tête jamais comptée par la Maison, et au
     moins une prestation qui suit le modèle. Elle règle la DURÉE, pas le prix. */
  const besoinDensite = !!cible && !cible.lockCount && selected.some((s) => scalesWithModel(s));
  const bandesDensite = sortedBands(bands);
  const bandeDeclaree = besoinDensite ? bandOf(cible?.lockCountDeclare, bands) : undefined;
  const declarerDensite = (b: ModelBand) => {
    if (!cible) return;
    /* On stocke un NOMBRE (le plafond de la tranche) et non l'id : les tranches
       du Juste Prix peuvent être recalibrées sans invalider les déclarations. */
    const i = bandesDensite.findIndex((x) => x.id === b.id);
    const n = b.maxLocks ?? (bandesDensite[i - 1]?.maxLocks ?? 0) + 1;
    clientsStore.set((prev) => prev.map((c) => (c.id === cible.id ? { ...c, lockCountDeclare: n } : c)));
  };

  /* ---- Navigation ---- */
  const back = () => {
    if (paying) return;
    if (step === QUIZ) { onClose(); return; }
    /* Depuis son rituel : on retourne à l'envie quand le quiz existe — elle a pu
       l'enjamber d'un mot, elle doit pouvoir y revenir du même geste. */
    if (step === 0) { if (quizActif) setStep(QUIZ); else onClose(); return; }
    /* Depuis l'acompte : revenir au moment — ses séances restent posées, elle
       les corrige sur place si elle le veut. */
    if (step === 5) { setStep(3); return; }
    if (step === 3) {
      /* Séance déjà posée dans la série : dépiler pour la reprendre. */
      if (sessionDates.length > 0) {
        setSessionDates((prev) => prev.slice(0, -1));
        setSelIso(null); setTime(null);
        return;
      }
      setSelIso(null); setTime(null);
      /* Les étapes 1 et 2 n'existent plus : depuis le créneau, on remonte à
         l'accordéon — son atelier ouvert et ses cases cochées intacts. */
      setStep(0);
      return;
    }
    setStep(step - 1);
  };

  /* ---- Écriture dans l'agenda partagé ----
     `online` n'est renseigné que si l'acompte vient d'être RÉGLÉ par KkiaPay et
     VÉRIFIÉ par le serveur : `confirmed` est alors le reflet d'un verdict
     serveur, jamais une décision de cet écran. La preuve, elle, vit dans la
     table `payments` (écrite par la fonction Edge) — c'est elle que le comptoir
     doit croire en cas de doute. */
  const settle = (online?: { apptId: string; transactionId: string; confirmed: boolean }) => {
    if (hasDeposit && !online && !pay) { toast('Choisissez votre moyen d’envoi.'); return; }
    if (!selected.length || sessionDates.length < totalSessions) return;
    const finalize = () => {
      const baseNotes: string[] = [];
      if (offerLabel) baseNotes.push(`Offre instantanée · ${offerLabel}`);
      /* CE QU'ELLE EST VENUE CHERCHER, porté par le rituel : le maître le lit au
         Calendrier avant qu'elle ne s'assoie. */
      if (envie) baseNotes.push(`Envie · ${envieLabel(envie)}`);
      if (masterVaries) baseNotes.push(`Maîtres multiples · ${selected.map((s) => s.master).join(', ')}`);
      /* Le comptoir doit savoir COMMENT la cliente annonce avoir envoyé l'acompte —
         il le vérifiera avant de le créditer (depositConfirmed). */
      if (hasDeposit && online) {
        baseNotes.push(`Acompte ${fmtMoney(deposit, currency)} réglé en ligne · KkiaPay · réf. ${online.transactionId}`);
      } else if (hasDeposit) {
        baseNotes.push(`Acompte ${fmtMoney(deposit, currency)} annoncé · ${payMethodName}`);
      }
      /* Garantit la fiche cliente sur LA MÊME branche que le RDV, sous la session
         authentifiée (l'écriture Supabase passe alors le RLS et remonte au Trône). */
      ensureClient(clientId, session?.user?.email, branch.id);
      const clientName =
        client?.name ??
        (session?.user?.email ? session.user.email.split('@')[0] : undefined) ??
        'Cliente Ma Couronne';
      /* POUR QUI : le rendez-vous se pose au nom de la TÊTE choisie — c'est
         son parcours qui le porte (TEMPS 2 : la RLS accepte l'écriture du
         parent payeur pour ses mineurs). */
      const cibleId = beneficiaire?.id ?? clientId;
      const cibleNom = beneficiaire?.name ?? clientName;
      /* ══ LE DERNIER MOT AVANT D'ÉCRIRE — 5 septembre 2026 ═══════════
         « Je ne sais pas comment il a pu prendre RDV le lundi 12 octobre
         puisque le salon est fermé » (Yéman).

         LE CALENDRIER JUGEAIT, RIEN N'EMPÊCHAIT. Entre le clic et l'écriture,
         tout peut arriver : des horaires pas encore descendus, une date
         pré-remplie qui n'est jamais passée par le calendrier, un retour en
         arrière du navigateur. Un écran qui propose bien et n'empêche rien
         finit toujours par laisser passer.

         LES HORAIRES D'ABORD. Sans eux, on raisonne sur ceux de naissance, où
         le lundi est OUVERT : le garde bénirait le jour fermé en toute bonne
         foi. Mieux vaut faire patienter cinq secondes que poser un rituel un
         jour où personne n'ouvrira la porte. */
      if (!horairesDescendus()) {
        setPaying(false);
        toast('Les horaires de la Maison se chargent, réessayez dans un instant.');
        return;
      }
      const fermes = joursFermesParmi(sessionDates.map((sd) => sd.iso));
      if (fermes.length > 0) {
        setPaying(false);
        toast(fermes.length > 1
          ? 'La Maison est fermée ces jours-là, choisissez d’autres dates.'
          : `La Maison est fermée le ${dayLabelIso(fermes[0])}, choisissez un autre jour.`);
        return;
      }
      /* Série liée : un identifiant commun quand il y a plusieurs séances. */
      const seriesId = totalSessions > 1 ? uid() : undefined;
      const newAppts: Appointment[] = sessionDates.map((sd, i) => {
        const notes = [...baseNotes];
        if (totalSessions > 1) notes.push(`Séance ${i + 1}/${totalSessions}`);
        return {
          /* La séance 1 porte l'identifiant RÉSERVÉ avant l'ouverture du widget :
             c'est lui qui a voyagé chez KkiaPay en `partnerId`, et par lui que le
             serveur relie le paiement à cette réservation. */
          id: i === 0 && online ? online.apptId : uid(),
          branchId: branch.id,
          clientId: cibleId,
          clientName: cibleNom,
          serviceIds: [...selectedIds],
          date: sd.iso,
          time: sd.time,
          master,
          /* Un acompte ENCAISSÉ ET VÉRIFIÉ tient le créneau : le rendez-vous
             naît confirmé, le comptoir n'a plus à le valider à la main. Sans
             paiement prouvé, il reste « en attente » — la Maison décide. */
          status: online?.confirmed ? 'confirmé' : 'en attente',
          /* L'acompte ne s'applique qu'à la première séance (et seulement s'il y en a un). */
          depositXof: i === 0 && hasDeposit ? deposit : undefined,
          /* Un acompte n'est « reçu » que sur verdict serveur — sinon il reste
             annoncé, et le comptoir le vérifie comme aujourd'hui. */
          ...(i === 0 && online?.confirmed ? { depositConfirmed: true } : {}),
          /* PRIX PERSONNALISÉ FIGÉ dès la réservation (modèle + Juste Prix) : le
             comptoir facturera EXACTEMENT ce que la cliente a vu — le barème
             pourra bouger, pas son prix. Porté par la séance 1 (les suivantes
             valent 0, règle des séries) ; jamais figé si un prix est masqué ou
             variable (le montant se fixe au fauteuil). L'offre éventuelle est
             portée par discountPct — le net retombe sur le total annoncé. */
          ...(i === 0 && personalized && !anyHidden && !anyVariable
            ? { priceXof: knownTotal, ...(discountPct > 0 ? { discountPct } : {}) }
            : {}),
          /* LA REMISE FAMILLE VOYAGE AVEC LE RENDEZ-VOUS — figée en francs
             (part hors forfaits × taux) : l'encaissement du Trône retranche
             ce montant exact, et la facture le nommera « Remise famille ». */
          ...(i === 0 && famRemiseXof > 0 ? { discountXof: famRemiseXof, remiseFamille: true } : {}),
          /* LA LONGUEUR QUI A FAIT CE PRIX se fige avec lui (11 août) : c'est
             celle de la fiche, héritée par `pricingOf`. Sans elle, le comptoir
             rouvrirait le rituel à SA longueur du jour et retarifierait ce que
             la cliente a vu. Si la fiche est muette, rien ne se fige — le
             fauteuil constatera. */
          ...(pricing.longueur ? { longueur: pricing.longueur } : {}),
          source: 'couronne',
          /* L'HEURE DE LA DEMANDE, pour que le comptoir sache son âge : une
             demande de ce matin s'appelle, une demande de la semaine passée
             jamais reçue est un manquement de la Maison. */
          creeLe: new Date().toISOString(),
          note: notes.length ? notes.join(' · ') : undefined,
          ...(totalSessions > 1 ? { seriesId, seriesIndex: i + 1, seriesTotal: totalSessions } : {}),
        };
      });
      appointmentsStore.set((prev) => [...prev, ...estampilleLesPoses(newAppts)]);
      /* Alerte le personnel du Trône (Web Push), même Le Trône fermé. */
      void pushNotifyStaff(
        online?.confirmed ? 'Réservation payée · Ma Couronne' : 'Nouvelle réservation · Ma Couronne',
        `${beneficiaire ? `${cibleNom} · par ${clientName}` : clientName} · ${summaryLabel}${online?.confirmed ? ` · acompte ${fmtMoney(deposit, currency)} reçu` : ''}`,
        '/trone/#/calendrier',
      );
      setPaying(false);
      setStep(6);
      /* Le bon moment pour proposer les notifications : juste après une réservation
         réussie. Web Push si possible (arrive même app fermée) ; sinon notif locale. */
      const first = sessionDates[0];
      const url = `${import.meta.env.BASE_URL}#/suivi`;
      void enablePush(clientId).then((subbed) => {
        if (!first) return;
        const body = `${summaryLabel} · ${dayLabelIso(first.iso)} à ${first.time}, la maison confirmera.`;
        if (subbed) void pushNotify(clientId, 'Réservation transmise', body, url);
        else void askNotifyPermission().then((ok) => { if (ok) notifyLocal('Réservation transmise', body); });
      });
    };

    /* Voie MANUELLE : rien n'est débité ici. La cliente envoie elle-même son
       Mobile Money et l'annonce ; l'acompte reste « annoncé » jusqu'à
       vérification au salon. Aucun théâtre de paiement — jamais. */
    setPaying(true);
    finalize();
  };

  /* ---- Acompte réglé EN LIGNE (KkiaPay) ----
     Trois temps, dans cet ordre précis : on paie, le serveur vérifie, PUIS la
     réservation s'écrit. Vérifier avant d'écrire garantit qu'un paiement abouti
     est déjà au registre (avec sa référence) même si la cliente ferme l'app à
     la seconde suivante — la Maison peut alors le rapprocher, plutôt que de
     découvrir un virement sans réservation. */
  const payOnline = async () => {
    if (paying) return;
    if (!selected.length || sessionDates.length < totalSessions) return;
    /* Identifiant réservé AVANT l'ouverture du widget : il part chez KkiaPay en
       `partnerId` et deviendra celui de la séance 1. Conservé d'une tentative à
       l'autre pour qu'un second essai retombe sur la même réservation. */
    const apptId = onlineApptId.current ?? uid();
    onlineApptId.current = apptId;
    setPaying(true);
    try {
      const { transactionId } = await payWithKkiapay({
        amountXof: deposit,
        partnerId: apptId,
        branchId: branch.id,
        clientId,
        phone: client?.phone,
        name: client?.name,
        email: session?.user?.email ?? undefined,
      });
      let confirmed = false;
      try {
        const v = await verifyDeposit({ transactionId, apptId, expectedXof: deposit, branchId: branch.id, clientId });
        confirmed = v.ok;
      } catch (e) {
        /* Le paiement a eu lieu ; seule la vérification a échoué. On réserve
           quand même, acompte « annoncé » — on ne perd ni la cliente ni sa
           référence. */
        toast(e instanceof Error ? e.message : 'Vérification impossible, la Maison vérifiera.');
      }
      setOnlinePaid({ ok: confirmed, ref: transactionId });
      settle({ apptId, transactionId, confirmed });
    } catch (e) {
      setPaying(false);
      toast(e instanceof Error ? e.message : 'Le paiement n’a pas abouti.');
    }
  };

  /* ---- Rappel fiable : le calendrier natif du téléphone (un événement par séance) ---- */
  const addToCalendar = () => {
    const names = selected.map((s) => s.name).join(' + ') || 'Rituel de la maison';
    const events: IcsEvent[] = sessionDates.map((sd, i) => ({
      title: `Maison MND · ${names}`,
      description:
        /* Les mains sont l'affaire de la maison — le calendrier de la cliente
           dit le rituel, pas qui le donne (décision du 10 août). */
        totalSessions > 1 ? `Séance ${i + 1}/${totalSessions} · Maison MND` : 'Maison MND, la maison vous attend.',
      location: branch.name,
      dateIso: sd.iso,
      time: sd.time,
      durationMin: totalDuration,
      alarmMin: 120,
    }));
    downloadIcs(events, 'rituel-maison-mnd.ics');
    toast('Fichier calendrier téléchargé, votre téléphone vous rappellera 2 h avant.');
  };

  const priceLabel = (s: Service, pct = 0) => {
    const mode = priceModeOf(s);
    if (mode === 'devis') return 'Prix en salon';
    /* Le geste de la maison se DIT, dans la liste comme au récapitulatif —
       c'est ce qui donne envie de l'ajouter au rituel. */
    const geste = remiseGestePct(s, pricing, selected);
    if (geste >= 100) return 'Offert';
    if (geste > 0) return `${fmtMoney(prixIci(s), currency)} · −${geste} %`;
    /* Le prix affiché est LE SIEN — modèle + Juste Prix — pas celui du catalogue. */
    const amount = fmtMoney(Math.round(personalPriceXof(s, pricing, tousServices, produits) * (1 - pct / 100)), currency);
    return mode === 'variable' ? `à partir de ${amount}` : amount;
  };

  /* Total lisible : « Prix en salon » si tout est masqué, sinon montant (+ salon si mixte). */
  /* Un rituel à prix VARIABLE ne peut pas annoncer un total ferme : chaque ligne
     dit « à partir de », le total doit le dire aussi. */
  /* « A partir de » ne s'affiche QUE si le prix est reellement indetermine.
     Avant, tout tarif au lock etait dit variable — donc le resserrage, coeur du
     chiffre, s'annoncait « a partir de » alors que la caisse affichait un
     montant ferme. Les deux surfaces se contredisaient sur la meme prestation. */
  const anyVariable = selected.some((s) => priceModeOf(s) === 'variable' && !prixFerme(s, pricing));
  const totalLabel = allHidden ? 'Prix en salon' : `${anyVariable ? 'à partir de ' : ''}${fmtMoney(price, currency)}`;

  const payMethodName = PAY_METHODS.find((p) => p.k === pay)?.n ?? 'Mobile Money';

  /* ── LA PORTE SE FERME SUR UNE ÉCHÉANCE OUBLIÉE — 28 août 2026 ──────
     « Quand une cliente ne paie pas selon l'échéance, elle ne peut pas prendre
     RDV sur la plateforme. Les paiements aux dates respectées sont requis pour
     bénéficier du RDV suivant » (Yéman).

     C'est la contrepartie honnête du paiement en plusieurs fois : la Maison
     avance un service contre une promesse, et la promesse tenue ouvre la porte
     suivante. Sans cette règle, découper le paiement revenait à offrir le pack
     et espérer.

     ELLE SE FERME ICI, PAS AU COMPTOIR. Une cliente peut toujours venir,
     appeler, régler et repartir avec son rendez-vous — c'est Yéman qui tient
     le comptoir. L'écran cesse seulement de servir en libre accès celle qui
     doit ; il ne la chasse pas, et il lui dit exactement quoi faire. */
  const verdictReservation = useMemo(() => {
    const sien = mesAbonnements.find((s) => s.clientId === clientId && s.status !== 'churn' && s.echeances?.length);
    if (!sien) return null;
    const v = peutReserver(sien.echeances, subPaid(sien), todayIso());
    return v.ouvert ? null : v;
  }, [mesAbonnements, clientId]);

  if (verdictReservation) {
    const numero = (branch.phone ?? '').replace(/\D/g, '');
    return (
      <div className="mc-overlayscreen mc-slide">
        <div className="mc-flowhead">
          <div className="mc-flowhead__row">
            <span />
            <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
          </div>
          <div className="mc-flowhead__titles">
            <div>
              <div className="mc-micro-eyebrow">Réserver</div>
              <h1 className="mc-flowhead__h1">Une échéance vous attend.</h1>
            </div>
          </div>
        </div>
        <div className="mc-flowbody">
          <div className="cma-attente">
            <div className="cma-attente__tag">Réservation suspendue</div>
            <p className="cma-attente__nom">{fmtMoney(verdictReservation.retardXof, currency)}</p>
            <p className="cma-attente__dit">{verdictReservation.dit}</p>
            {numero && (
              <a
                className="cma-btn cma-btn--sm"
                href={`https://wa.me/${numero}?text=${encodeURIComponent(
                  `Bonjour, je souhaite régler ${fmtMoney(verdictReservation.retardXof, currency)} sur mon abonnement et reprendre rendez-vous.`)}`}
                target="_blank"
                rel="noreferrer"
              >
                Régler {fmtMoney(verdictReservation.retardXof, currency)}
              </a>
            )}
            <p className="cma-note">
              Vous pouvez aussi passer au salon : la Maison encaisse et rouvre votre rendez-vous sur-le-champ.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mc-overlayscreen mc-slide">
      {/* -------- entête + progression -------- */}
      <div className="mc-flowhead">
        <div className="mc-flowhead__row">
          {vue < 6 ? (
            <button className="mc-linkback" onClick={back}>{vue === premierEcran ? '← Annuler' : '← Retour'}</button>
          ) : <span />}
          <button className="mc-x" aria-label="Fermer" onClick={onClose}>✕</button>
        </div>
        {/* L'etape 1 n'est jamais atteinte et le quiz n'est pas toujours la :
            `rang` compte les ecrans REELLEMENT traverses, pour que la barre et
            le compteur disent la meme verite. */}
        <div className="mc-progress"><div style={{ width: `${(rang(vue) / total) * 100}%` }} /></div>
        <div className="mc-flowhead__titles">
          <div>
            <div className="mc-micro-eyebrow">{vue === QUIZ ? 'Réserver · une question pour vous' : EYEBROWS[vue]}</div>
            <h1 className="mc-flowhead__h1">{vue === QUIZ ? 'Dites-nous, en deux gestes.' : TITLES[vue]}</h1>
          </div>
          <span className="mc-flowhead__count">{rang(vue)} / {total}</span>
        </div>
      </div>

      <div className="mc-scroll mc-flowbody">

        {/* POUR QUI ? — le sélecteur de tête (TEMPS 2). Ne paraît que si la
            Maison a validé des mineurs sur son compte : réserver pour Keli est
            un geste, pas un détour. */}
        {tetes.length > 0 && vue === 0 && (
          <div className="mc-pourqui">
            <span className="mc-pourqui__lb">Pour</span>
            <button type="button" className={`mc-pourqui__chip ${!pourId ? 'is-on' : ''}`} onClick={() => setPourId('')}>
              Moi
            </button>
            {tetes.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`mc-pourqui__chip ${pourId === t.id ? 'is-on' : ''}`}
                onClick={() => setPourId(t.id)}
              >
                {t.name.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        {/* -------- 0 · l'envie · le quiz de la Maison --------
            LES MÊMES MOTS QU'AU MIROIR (shared/quiz.ts), dans l'adresse de
            l'application. Ce qui se propose au bout est une prestation RÉELLE du
            catalogue, à SON prix — jamais un rituel inventé pour la circonstance.
            Deux questions, contournables d'un mot. */}
        {vue === QUIZ && (
          <div className="mc-fade">
            <div className="mc-quizintro">
              <span>Deux réponses, et votre prochaine couronne s’écrit déjà.</span>
              <button
                className="mc-quizother"
                onClick={() => { setVariante((v) => v + 1); setEnvie(null); setElan(null); }}
              >
                ↻ Autres questions
              </button>
            </div>

            <QuizRow label={pool.q1.vous} opts={pool.q1opts} value={envie} onPick={(k) => declareEnvie(k as EnvieKey)} />
            <QuizRow label={pool.q2.vous} opts={pool.q2opts} value={elan} onPick={(k) => setElan(k as ElanKey)} />

            {envie && elan && (
              <div className="mc-quizreco mc-rise">
                <div className="mc-quizreco__eyebrow">
                  {client?.name ? `Pour vous, ${firstName(client.name)}` : 'Pour vous'}
                </div>
                {recoSvc && motEnvie ? (
                  <>
                    <div className="mc-quizreco__name">{recoSvc.name}</div>
                    <div className="mc-quizreco__line">{motEnvie.line.vous}</div>
                    <div className="mc-quizreco__meta">
                      {priceLabel(recoSvc)} · {fmtDuration(personalDurationMin(recoSvc, pricing))}
                      {/* « Votre tarif » ne se dit QUE si son prix diffère vraiment
                          du catalogue — sinon c'est une flatterie, et la Maison
                          n'en fait pas. */}
                      {priceModeOf(recoSvc) !== 'devis' && personalPriceXof(recoSvc, pricing, tousServices, produits) !== recoSvc.priceXof
                        ? ' · votre tarif'
                        : ''}
                    </div>
                    <button className="mc-cta mc-cta--copper" onClick={prendreReco}>Réserver ce rituel</button>
                    <button className="mc-textbtn" onClick={() => setStep(0)}>Voir toutes les prestations →</button>
                  </>
                ) : (
                  /* Envie entendue, rien à proposer en face : on le dit, et on
                     ouvre le catalogue. Une envie sans rituel désigné ne justifie
                     pas d'inventer une recommandation. */
                  <>
                    <div className="mc-quizreco__line">
                      Votre envie est notée, la maison la lira avant votre venue. Parcourez ses
                      rituels : la maîtresse fera le reste au fauteuil.
                    </div>
                    <button className="mc-cta mc-cta--indigo" onClick={() => setStep(0)}>Voir les rituels</button>
                  </>
                )}
              </div>
            )}

            {!(envie && elan) && (
              <button className="mc-textbtn mc-quizskip" onClick={() => setStep(0)}>
                Je sais déjà ce que je veux →
              </button>
            )}
          </div>
        )}

        {/* -------- 1 · votre rituel · l'accordéon des ateliers -------- */}
        {vue === 0 && (
          bookableCats.length > 0 ? (
            <div className="mc-fade">
              <div className="mc-acclist">
                {/* LES MONDES SE DISENT (12 août) : un intertitre quand on passe
                    de l'Atelier au plateau, puis au Studio. */}
                {bookableCats.map((c, ci) => {
                  const monde = mondeDeCat(c, tousCats);
                  const prec = ci > 0 ? mondeDeCat(bookableCats[ci - 1], tousCats) : null;
                  const ouvert = catId === c.id;
                  const svcs = servicesDe(c.id);
                  /* CE QU'ON Y A PRIS, dit sur la ligne même de l'atelier — c'est
                     ce qui autorise le pli à se refermer sans rien perdre. Les
                     prestations à prix de salon ne s'additionnent pas. */
                  const prisIci = svcs.filter((s) => selectedIds.includes(s.id));
                  const sommeIci = prisIci
                    .filter((s) => !s.hidePrice)
                    .reduce((n, s) => n + prixIci(s), 0);
                  const montres = ouvert && !voirTout && svcs.length > 10 ? svcs.slice(0, 8) : svcs;
                  return (
                    <Fragment key={c.id}>
                      {(ci === 0 || monde !== prec) && (
                        <div className="mc-mondelabel">{mondeLabel(monde)}</div>
                      )}
                      <div className={`mc-acc ${ouvert ? 'is-open' : ''}`}>
                        <button
                          type="button"
                          className="mc-acc__head"
                          aria-expanded={ouvert}
                          onClick={() => {
                            /* Section unique : ouvrir referme le précédent, et
                               retoucher la même ligne replie tout. */
                            setCatId(ouvert ? null : c.id);
                            setVoirTout(false);
                          }}
                        >
                          <span className="mc-acc__id">
                            <span className="mc-acc__fon">{c.fon}</span>
                            <span className="mc-acc__sub">{c.label}</span>
                          </span>
                          {prisIci.length > 0 && (
                            <span className="mc-acc__count">
                              {prisIci.length} · {sommeIci > 0 ? fmtMoney(sommeIci, currency) : 'en salon'}
                            </span>
                          )}
                          <span className="mc-acc__chev" aria-hidden="true">›</span>
                        </button>

                        {ouvert && (
                          <div className="mc-acc__body">
                            {montres.map((s) => {
                              const on = selectedIds.includes(s.id);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  className={`mc-presta ${on ? 'is-on' : ''}`}
                                  aria-pressed={on}
                                  onClick={() => toggleService(s.id)}
                                >
                                  <span className="mc-presta__box" aria-hidden="true" />
                                  <span className="mc-presta__body">
                                    <span className="mc-presta__name">{s.name}</span>
                                    {/* LA MAÎTRESSE NE SE DIT PAS ICI — décision du
                                        10 août : les mains sont l'affaire de la
                                        maison, la cliente choisit un rituel. La
                                        description tient sur UNE ligne (~20 % du
                                        texte est lu) — le poème vit ailleurs. */}
                                    <span className="mc-presta__meta">
                                      {priceLabel(s)} · {fmtDuration(s.durationMin)}
                                    </span>
                                    {s.description && (
                                      <span className="mc-presta__meta mc-presta__desc">{s.description}</span>
                                    )}
                                    {s.sessions > 1 && (
                                      <span className="mc-pillseal">Série · {s.sessions} séances · prix unique</span>
                                    )}
                                  </span>
                                </button>
                              );
                            })}
                            {/* Une poignée à la fois : au-delà de dix, huit d'abord —
                                celles déjà choisies hors de la coupe restent comptées
                                sur la ligne de l'atelier comme au panier. */}
                            {!voirTout && svcs.length > 10 && (
                              <button
                                type="button"
                                className="mc-textbtn mc-acc__more"
                                onClick={() => setVoirTout(true)}
                              >
                                Voir les {svcs.length - 8} autres prestations →
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
              </div>

              {/* LE PANIER COLLANT : total, compte et durée sous les yeux, et
                  « Continuer » en zone du pouce. Vide, il dit le geste qui
                  manque plutôt qu'un zéro. */}
              <div className={`mc-multibar ${selectedIds.length ? '' : 'mc-multibar--empty'}`}>
                <div className="mc-multibar__info">
                  <span className="mc-multibar__count">
                    {selectedIds.length ? totalLabel : 'Aucune prestation choisie'}
                  </span>
                  <span className="mc-multibar__meta">
                    {selectedIds.length
                      ? `${selectedIds.length} prestation${selectedIds.length > 1 ? 's' : ''} · ${fmtDuration(totalDuration)}`
                      : 'Ouvrez un atelier pour commencer'}
                  </span>
                </div>
                <button
                  className="mc-cta mc-cta--copper mc-multibar__cta"
                  disabled={selectedIds.length === 0}
                  onClick={() => { setSessionDates([]); setSelIso(null); setTime(null); setMonthIdx(0); setStep(3); }}
                >
                  Continuer
                </button>
              </div>
            </div>
          ) : (
            <div className="mc-emptyzone">
              <div className="mc-emptyzone__glyph">✦</div>
              <div className="mc-emptyzone__t">L’offre se prépare.</div>
              <div className="mc-emptyzone__s">
                La maison compose en ce moment ses rituels. Revenez très bientôt, votre couronne sera reçue comme il se doit.
              </div>
              <button className="mc-cta mc-cta--outline" style={{ marginTop: 22 }} onClick={onClose}>
                Revenir à l’accueil
              </button>
            </div>
          )
        )}

        {/* -------- 2 · orphelin — les prestations vivent dans l'accordéon -------- */}

        {/* -------- 3 · le moment -------- */}
        {vue === 3 && selected.length > 0 && (
          <div className="mc-fade">
            {/* LE RITUEL SE RELIT EN ENTIER AVANT SON MOMENT (maquette écran 2,
                validée le 15 août) : le récapitulatif n'a plus d'écran à lui —
                il ouvre celui-ci. Elle relit ce qu'elle a composé, avec son
                total, AVANT de choisir son jour ; le parcours tient en trois
                temps — votre rituel · le moment · la confirmation. */}
            <div className="mc-recapcard mc-recapcard--tete">
              <div className="mc-micro-eyebrow mc-recapcard__et">Votre rituel</div>
              {selected.map((s) => (
                <div key={s.id} className="mc-recapcard__svcline">
                  <div>
                    <div className="mc-recapcard__svcname">{s.name}</div>
                    <div className="mc-recapcard__svcsub">{fmtDuration(s.durationMin)}</div>
                  </div>
                  <div className="mc-recapcard__svcprice">{priceLabel(s, discountPct)}</div>
                </div>
              ))}
              {discountPct > 0 && knownTotal > 0 && (
                <div className="mc-recapcard__deal">
                  {offerLabel ?? 'Offre instantanée'} · −{discountPct} % <s>{fmtMoney(knownTotal, currency)}</s>
                </div>
              )}
              {/* LE PRIX FAMILLE SE LIT (14 août) : la remise du compte, dite
                  avec son taux et ses francs — hors forfaits, déjà réduits. */}
              {famRemiseXof > 0 && (
                <div className="mc-recapcard__deal">
                  Remise famille · −{famPct} %{famForfaitXof > 0 ? ' (hors forfaits)' : ''} · −{fmtMoney(famRemiseXof, currency)}
                </div>
              )}
              <div className="mc-hairline" />
              <div className="mc-recapcard__total">
                <span>Total{anyHidden && !allHidden ? ' connu' : ''}</span>
                <span>{totalLabel}</span>
              </div>
              <div className="mc-recapcard__meta">
                {selected.length} prestation{selected.length > 1 ? 's' : ''} · {fmtDuration(totalDuration)}
                {master ? ` · avec ${master}${masterVaries ? ' et son équipe' : ''}` : ''}
              </div>
              {(personalized && pricing.band && cible?.lockCount) || pricing.longueur ? (
                /* Une phrase qui dit D'OÙ viennent ces prix — locks et longueur
                   de fiche (11 août) : personnaliser en silence, c'est laisser
                   la cliente croire à une erreur quand le tarif diffère. La
                   couronne décrite est celle de la TÊTE servie (12 août). */
                <div className="mc-recapcard__meta" style={{ color: 'var(--copper-700, #7C4C2C)' }}>
                  {beneficiaire ? `Ses prix, établis pour la couronne de ${beneficiaire.name}` : 'Vos prix, établis pour votre couronne'}
                  {personalized && pricing.band && cible?.lockCount ? ` de ${cible.lockCount} locks` : ''}
                  {pricing.longueur ? ` · longueur ${longueurLabel(pricing.longueur)}` : ''}.
                </div>
              ) : null}
              {anyHidden && !allHidden && (
                <div className="mc-recapcard__meta">Une prestation se règle en salon.</div>
              )}
              <div className="mc-recapcard__meta">Maison · {branch.name}</div>
            </div>

            {totalSessions > 1 && (
              <div className="mc-sessionhead">
                <div className="mc-sessionhead__row">
                  <span className="mc-sessionhead__k">Séance {sessionDates.length + 1} sur {totalSessions}</span>
                  <span className="mc-sessionhead__steps" aria-hidden="true">
                    {Array.from({ length: totalSessions }, (_, i) => (
                      <i key={i} className={i < sessionDates.length ? 'is-done' : i === sessionDates.length ? 'is-now' : ''} />
                    ))}
                  </span>
                </div>
                <span className="mc-sessionhead__s">Choisissez la date et l’heure de cette séance.</span>
                {sessionDates.length > 0 && (
                  <div className="mc-sessionchips">
                    {sessionDates.map((sd, i) => (
                      <button
                        key={i}
                        className="mc-sessionchip mc-sessionchip--btn"
                        aria-label={`Reprendre la séance ${i + 1}, ${dayLabelIso(sd.iso)} à ${sd.time}`}
                        onClick={() => {
                          setSessionDates((prev) => prev.filter((_, k) => k !== i));
                          setSelIso(null);
                          setTime(null);
                        }}
                      >
                        S{i + 1} · {dayLabelIso(sd.iso)} · {sd.time}
                        <span className="mc-sessionchip__x" aria-hidden="true">✕</span>
                      </button>
                    ))}
                  </div>
                )}
                {sessionDates.length > 0 && (
                  <span className="mc-sessionhead__hint">Touchez une séance pour la reprendre.</span>
                )}
                <span className="mc-sessionhead__note">
                  La prestation est réglée une fois, les séances suivantes sont incluses
                  {hasDeposit ? ' · acompte sur la 1ʳᵉ' : ''}.
                </span>
              </div>
            )}
            {/* LA DENSITÉ DE SA COURONNE, dite par elle — le calendrier a besoin
                de savoir combien d'heures réserver, et des Nano ne se resserrent
                pas dans le temps d'une Jumbo. Sa réponse règle la DURÉE du
                créneau ; le prix, lui, attend le comptage de la Maison. */}
            {besoinDensite && (
              <div className="mc-pourqui" style={{ paddingTop: 22, paddingBottom: 18 }}>
                <span className="mc-pourqui__lb" style={{ width: '100%' }}>
                  Vos locks, pour réserver le bon nombre d’heures
                </span>
                {bandesDensite.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`mc-pourqui__chip ${bandeDeclaree?.id === b.id ? 'is-on' : ''}`}
                    onClick={() => declarerDensite(b)}
                  >
                    {b.name}
                    <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 10.5, opacity: 0.75 }}>
                      {bandRange(b, bandesDensite)}
                    </span>
                  </button>
                ))}
                <span className="mnd-muted" style={{ width: '100%', fontSize: 11.5, lineHeight: 1.5 }}>
                  Au plus près, la Maison comptera précisément au fauteuil.
                  {bandeDeclaree ? ` Durée prévue : ${fmtDuration(totalDuration)}.` : ''}
                </span>
              </div>
            )}
            <div className="mc-micro-eyebrow mc-stepkicker">Le jour</div>
            <div className="mc-calnav">
              <button onClick={() => setMonthIdx(Math.max(0, monthIdx - 1))} disabled={monthIdx === 0}>‹</button>
              <span>{month.label}</span>
              <button onClick={() => setMonthIdx(Math.min(months.length - 1, monthIdx + 1))} disabled={monthIdx === months.length - 1}>›</button>
            </div>
            <div className="mc-calgrid mc-calgrid--dows">
              {DOW_LETTERS.map((d, i) => <div key={i}>{d}</div>)}
            </div>
            <div className="mc-calgrid">
              {calCells.map((c) =>
                c.day === null ? (
                  <span key={c.key} />
                ) : (
                  <button
                    key={c.key}
                    className={`mc-calday ${c.iso === selIso ? 'is-sel' : ''} ${c.free ? 'is-free' : 'is-off'}`}
                    onClick={() => {
                      if (!c.free) { toast('Aucune disponibilité ce jour.'); return; }
                      setSelIso(c.iso!); setTime(null);
                    }}
                  >
                    {c.day}
                    {c.free && c.iso !== selIso && <i />}
                  </button>
                )
              )}
            </div>
            <div className="mc-callegend">
              <span />Jours avec créneaux libres · {fmtDuration(totalDuration)}
            </div>

            {selIso && (
              <div className="mc-fade">
                <div className="mc-micro-eyebrow mc-stepkicker">L’heure · {dayLabelIso(selIso)}</div>
                <div className="mc-stack">
                  {dayTimes.map((t) => {
                    const choisi = time === t && sessionDates.some((sd) => sd.iso === selIso && sd.time === t);
                    return (
                      <button
                        key={t}
                        className={`mc-slotcard ${choisi ? 'is-sel' : ''}`}
                        aria-pressed={choisi}
                        onClick={() => {
                          if (!selIso) return;
                          /* ON NE QUITTE PLUS L'ÉCRAN EN CHOISISSANT SON HEURE
                             (maquette écran 2) : un second toucher CORRIGE la
                             dernière séance au lieu d'en empiler une de trop. */
                          const choix = { iso: selIso, time: t };
                          const next = sessionDates.length >= totalSessions
                            ? [...sessionDates.slice(0, totalSessions - 1), choix]
                            : [...sessionDates, choix];
                          setSessionDates(next);
                          setTime(t);
                          if (next.length < totalSessions) {
                            setSelIso(null); setTime(null); setMonthIdx(0);
                          }
                        }}
                      >
                        <div>
                          <div className="mc-slotcard__time">{t}</div>
                          <div className="mc-slotcard__who">{fmtDuration(totalDuration)}</div>
                        </div>
                        <span className="mc-slotcard__free">{choisi ? 'Votre heure' : 'Libre'}</span>
                      </button>
                    );
                  })}
                  {dayTimes.length === 0 && <div className="mc-emptyline">Plus de créneau ce jour, choisissez un autre jour.</div>}
                </div>
              </div>
            )}

            {/* LES QUATRE TEMPS de la venue — ils vivaient sur l'écran du
                récapitulatif ; ils se lisent maintenant une fois le moment
                posé, juste avant de sceller. */}
            {momentComplet && (
              <div className="mc-fade">
                <div className="mc-sectionlabel">Les quatre temps</div>
                {QUATRE_TEMPS.map((t) => (
                  <div key={t.no} className="mc-temps">
                    <span className="mc-temps__no">{t.no}</span>
                    <div>
                      <div className="mc-temps__n">{t.n}</div>
                      <div className="mc-temps__g">{t.g}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* LE PANIER SUIT LA CLIENTE (maquette écran 4) : au moment aussi,
                total et durée restent sous les yeux — le prix découvert tard
                fait fuir, le prix qui accompagne rassure. Il porte désormais LE
                GESTE : le moment choisi s'y inscrit, et le bouton scelle. */}
            <div className="mc-multibar">
              <div className="mc-multibar__info">
                <span className="mc-multibar__count">{totalLabel}</span>
                <span className="mc-multibar__meta">
                  {momentComplet && dernierMoment
                    ? `${dayLabelIso(dernierMoment.iso)} · ${dernierMoment.time} · ${fmtDuration(totalDuration)}`
                    : totalSessions > 1
                      ? `Séance ${sessionDates.length + 1} sur ${totalSessions}, choisissez son moment`
                      : 'Choisissez le jour, puis l’heure'}
                </span>
              </div>
              <button
                className="mc-cta mc-cta--copper mc-multibar__cta"
                disabled={!momentComplet || paying}
                onClick={() => (hasDeposit ? setStep(5) : settle())}
              >
                {hasDeposit ? 'Continuer · acompte' : 'Réserver'}
              </button>
            </div>
          </div>
        )}

        {/* -------- 4 · orphelin — le récapitulatif ouvre l'écran du moment -------- */}

        {/* -------- 5 · acompte (taux de la Maison) --------
            DIRE VRAI, dans les deux voies. Rails KkiaPay branchés : la cliente
            paie POUR DE BON, et l'acompte n'est réputé reçu qu'après vérification
            serveur. Rails éteints (pas de clé publique au build) : elle envoie
            elle-même son Mobile Money et l'annonce, le salon vérifie avant de
            créditer. L'écran d'origine, lui, SIMULAIT un paiement (« paiement
            sécurisé », fausse demande poussée au téléphone) : trahison de
            confiance assurée au premier passage en salon. Ne jamais le remettre —
            un écran de paiement ne s'affiche que s'il débite vraiment. */}
        {vue === 5 && selected.length > 0 && (
          <div className="mc-fade">
            <div className="mc-depositcard">
              <div className="mc-depositcard__label">{depositPct !== null && depositPct >= 100 ? 'Prestation à régler d’avance' : 'Acompte à envoyer'}</div>
              <div className="mc-depositcard__amount">{allHidden ? 'Au salon' : fmtMoney(deposit, currency)}</div>
              <div className="mc-depositcard__sub">
                {allHidden
                  ? 'Acompte réglé au salon'
                  : depositPct !== null && depositPct >= 100
                    ? 'Montant intégral de la prestation'
                    : `${depositPct !== null ? `${depositPct} % de ${fmtMoney(depositBase, currency)}` : 'Acompte des prestations concernées'} · ${anyHidden ? 'reste' : 'solde'} au salon`}
              </div>
              {/* L'ACOMPTE DIT SON POURQUOI (maquette écran 4) : sans cette
                  ligne, le prélèvement se lit comme un péage. Une promesse,
                  pas une caution. */}
              {!allHidden && !(depositPct !== null && depositPct >= 100) && (
                <div className="mc-depositcard__why">Il tient votre créneau, et se déduit le jour même.</div>
              )}
            </div>
            {/* VOIE EN LIGNE — n'apparaît que si les rails KkiaPay sont branchés
                (clé publique au build). Sans eux, l'écran reste exactement celui
                d'avant : le mode d'emploi Mobile Money, honnête. */}
            {!allHidden && kkiapayEnabled() && !manualDeposit ? (
              <>
                <div className="mc-sectionlabel">Régler maintenant</div>
                <div className="mc-recapcard" style={{ textAlign: 'left' }}>
                  <div className="mc-recapcard__line"><span>Mobile Money · carte</span><span>{fmtMoney(deposit, currency)}</span></div>
                  <div className="mc-recapcard__line"><span>Reste au salon</span><span>{anyHidden ? 'à convenir' : fmtMoney(Math.max(0, price - deposit), currency)}</span></div>
                </div>
                <button className="mc-cta mc-cta--copper" style={{ marginTop: 22 }} onClick={payOnline} disabled={paying}>
                  {paying ? 'Paiement en cours…' : `Payer l’acompte · ${fmtMoney(deposit, currency)}`}
                </button>
                <button
                  className="mc-textbtn"
                  style={{ marginTop: 12 }}
                  onClick={() => setManualDeposit(true)}
                  disabled={paying}
                >
                  J’enverrai l’acompte moi-même
                </button>
                <div className="mc-footnote">Votre acompte est crédité dès la confirmation du paiement.</div>
              </>
            ) : (
              <>
                {!allHidden && (
                  <>
                    <div className="mc-sectionlabel">Comment faire</div>
                    <div className="mc-recapcard" style={{ textAlign: 'left' }}>
                      <div className="mc-recapcard__line"><span>1 · Envoyez</span><span>{fmtMoney(deposit, currency)}</span></div>
                      <div className="mc-recapcard__line"><span>2 · Au numéro de la Maison</span><span>{branch.phone || 'communiqué sur WhatsApp'}</span></div>
                      <div className="mc-recapcard__line"><span>3 · Puis annoncez l’envoi</span><span>bouton ci-dessous</span></div>
                    </div>
                  </>
                )}
                <div className="mc-sectionlabel">Envoyé par</div>
                <div className="mc-stack">
                  {PAY_METHODS.map((pm) => (
                    <button
                      key={pm.k}
                      className={`mc-paycard ${pay === pm.k ? 'is-on' : ''}`}
                      onClick={() => setPay(pm.k)}
                    >
                      <span>{pm.n}</span>
                      <span className="mc-paycard__dot" />
                    </button>
                  ))}
                </div>
                <button className="mc-cta mc-cta--copper" style={{ marginTop: 22 }} onClick={() => settle()} disabled={paying}>
                  {allHidden ? 'Confirmer la réservation' : `J’ai envoyé l’acompte · ${fmtMoney(deposit, currency)}`}
                </button>
                {!allHidden && kkiapayEnabled() && (
                  <button className="mc-textbtn" style={{ marginTop: 12 }} onClick={() => setManualDeposit(false)} disabled={paying}>
                    ← Régler en ligne plutôt
                  </button>
                )}
                <div className="mc-footnote">La Maison vérifie la réception avant votre passage.</div>
              </>
            )}
          </div>
        )}

        {/* -------- 7 · confirmé -------- */}
        {vue === 6 && selected.length > 0 && selIso && time && (
          <div className="mc-confirm mc-rise">
            <div className="mc-confirm__seal"><img src={asset("/assets/monograms/mono-copper.png")} alt="" /></div>
            <h2>Votre rituel est scellé.</h2>
            <p>
              {onlinePaid?.ok
                ? 'Votre acompte est reçu, votre créneau est tenu. '
                : 'La Maison confirme votre créneau très vite. '}
              Ajoutez le rituel à votre calendrier : c’est lui qui vous rappellera sur votre
              téléphone, même l’app fermée.
            </p>
            <div className="mc-recapcard" style={{ textAlign: 'left' }}>
              <div className="mc-recapcard__name">{summaryLabel}</div>
              <div className="mc-recapcard__meta">
                {totalSessions > 1 ? `${totalSessions} séances liées` : `${dayLabelIso(selIso)} · ${time}`} · {fmtDuration(totalDuration)}
              </div>
              <div className="mc-hairline" />
              {totalSessions > 1 &&
                sessionDates.map((sd, i) => (
                  <div key={i} className="mc-recapcard__line">
                    <span>Séance {i + 1}/{totalSessions}</span>
                    <span>{dayLabelIso(sd.iso)} · {sd.time}</span>
                  </div>
                ))}
              {/* DIRE VRAI ici aussi : annoncer « à vérifier » à une cliente qui
                  vient de payer en ligne détruit exactement la confiance que le
                  paiement venait d'acheter. Trois issues, trois phrases. */}
              <div className="mc-recapcard__line">
                <span>Acompte</span>
                <span>
                  {!hasDeposit
                    ? 'Au salon'
                    : onlinePaid?.ok
                      ? `${fmtMoney(deposit, currency)} · reçu`
                      : onlinePaid
                        ? `${fmtMoney(deposit, currency)} · payé · vérification en cours`
                        : `${fmtMoney(deposit, currency)} · à vérifier par la Maison`}
                </span>
              </div>
              {onlinePaid && (
                <div className="mc-recapcard__line"><span>Référence</span><span>{onlinePaid.ref}</span></div>
              )}
              <div className="mc-recapcard__line">
                <span>Statut</span>
                <span>{onlinePaid?.ok ? 'Confirmé' : 'En attente de la maison'}</span>
              </div>
            </div>
            <button className="mc-cta mc-cta--indigo" style={{ marginTop: 20 }} onClick={addToCalendar}>
              Ajouter au calendrier
            </button>
            <button className="mc-quietbtn" onClick={onClose}>Revenir à l’accueil</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* Une question, ses réponses en pastilles — la même mécanique qu'au miroir du
   salon, aux dimensions du pouce. */
function QuizRow({ label, opts, value, onPick }: {
  label: string;
  opts: [string, string][];
  value: string | null;
  onPick: (k: string) => void;
}) {
  return (
    <div className="mc-quizq">
      <div className="mc-quizq__label">{label}</div>
      <div className="mc-envies">
        {opts.map(([k, l]) => (
          <button
            key={k}
            className={`mc-envie ${value === k ? 'is-on' : ''}`}
            aria-pressed={value === k}
            onClick={() => onPick(k)}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
