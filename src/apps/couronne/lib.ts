import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../shared/store';
import { clientSessionsStore } from '../../shared/activity';
import { useAuth } from '../../shared/auth';
import {
  useCategories,
  useServices,
  useProducts,
  type CatalogCategory,
  type Service,
  type Product,
} from '../../shared/catalog';
import { vitrineConfigStore, catalogueVisiblePour } from '../../shared/bridges';
import { clientsStore, initiePersonaId, useClients, type Client } from '../../shared/clients';
import { branchesStore, useBranch } from '../../shared/branches';
import { tablePrete } from '../../shared/sync';
import { type Appointment } from '../../shared/agenda';
import { openingForIso, hourToMin, settingsStore } from '../../shared/settings';
import { blocagesStore, plagesBloquees } from '../../shared/blocages';
import { useOffers, offerLiveNow } from '../../shared/offers';

/* Ma Couronne — bibliothèque locale : cliente, visibilité, dates, créneaux, offres. */

/* ---------- Cliente authentifiée — un compte = un dossier client ---------- */

/** Identifiant du client courant : l'utilisateur authentifié (Supabase),
    sinon un identifiant local stable pour le mode développement sans backend. */
/** LA FICHE DE CETTE CLIENTE — la sienne, pas une neuve.

    Trois lectures, dans cet ordre :
      ① la fiche qui porte déjà son compte (`authUserId`) ;
      ② celle qui porte son ADRESSE, qu'on adopte alors une fois pour toutes ;
      ③ à défaut, son identifiant de compte — la fiche naîtra à son nom.

    L'adresse est le seul lien possible avec l'histoire d'avant : la Maison a
    inscrit ses clientes bien avant qu'elles n'aient un compte. Sans cette
    reconnaissance, une inscription ouvrait un dossier vide et laissait des
    années de rituels de l'autre côté. */
export function useClientId(): string {
  const { session } = useAuth();
  const uid = session?.user?.id;
  const mail = (session?.user?.email ?? '').trim().toLowerCase();
  const [clients] = useClients();
  if (!uid) return 'c-local';
  const parCompte = clients.find((c) => c.authUserId === uid);
  if (parCompte) return parCompte.id;
  const parMail = mail ? clients.find((c) => !c.authUserId && (c.email ?? '').trim().toLowerCase() === mail) : undefined;
  return parMail ? parMail.id : uid;
}

/** Crée le dossier de la cliente dans le CRM partagé s'il n'existe pas encore
    (idempotent). Le nom initial dérive de l'e-mail ; il reste éditable au Profil,
    de sorte que réservations et devis restent liés au bon compte, visibles au Trône. */
export function ensureClient(clientId: string, email?: string | null, branchId?: string, fullName?: string | null, authUserId?: string | null): void {
  if (!clientId || clientId === 'c-local') return;
  const bid = branchId ?? branchesStore.get()[0]?.id ?? 'maison';
  const mail = (email ?? '').trim() || undefined;
  const existing = clientsStore.get().find((c) => c.id === clientId);
  if (existing) {
    /* Réaligne la branche si besoin, et complète l'e-mail s'il manque encore.
       UNE BRANCHE INCONNUE DU RÉFÉRENTIEL SE RÉPARE AUSSI : la fiche de
       Valerie Ahouansou (10 août) était née sur la branche par défaut du code
       — un téléphone pas encore hydraté — et le Trône, qui filtre par la
       vraie, ne la voyait pas. Dès que les branches sont là, on la range. */
    const connues = branchesStore.get();
    const brancheInconnue = connues.length > 0 && !connues.some((b) => b.id === existing.branchId);
    const cibleBranche = branchId ?? (brancheInconnue ? connues[0]?.id : undefined);
    const needBranch = !!cibleBranche && existing.branchId !== cibleBranche;
    const needMail = !!mail && !existing.email;
    /* L'ADOPTION S'INSCRIT UNE FOIS. Reconnue par son adresse, la fiche garde
       desormais le compte : si la cliente change d'adresse au Profil, le lien
       tient quand meme, et une homonyme ne peut plus la reprendre. */
    const needCompte = !!authUserId && existing.authUserId !== authUserId;
    if (needBranch || needMail || needCompte) {
      clientsStore.set((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, ...(needBranch ? { branchId: cibleBranche } : {}), ...(needMail ? { email: mail } : {}), ...(needCompte ? { authUserId } : {}) }
            : c,
        ),
      );
    }
    return;
  }
  /* DERNIÈRE CHANCE D'ADOPTION avant de créer. `useClientId` a pu résoudre
     l'identifiant AVANT que le CRM ne soit hydraté : à cet instant la fiche
     historique (celle qui porte la famille, les enfants, les rituels) n'était
     pas encore là pour être reconnue par son adresse. Créer sans revérifier
     ouvrait un DOUBLON vide — la cliente perdait ses enfants et son histoire
     de l'autre côté (Merine, 12 août). On regarde une dernière fois, ici même,
     au moment du geste. */
  const mailBas = (mail ?? '').toLowerCase();
  const aAdopter = mailBas
    ? clientsStore.get().find((c) => !c.authUserId && (c.email ?? '').trim().toLowerCase() === mailBas)
    : undefined;
  if (aAdopter) {
    clientsStore.set((prev) =>
      prev.map((c) => (c.id === aAdopter.id ? { ...c, authUserId: authUserId ?? clientId } : c)),
    );
    return;
  }
  const local = (email ?? '').split('@')[0];
  const name = (fullName && fullName.trim())
    || (local ? local.charAt(0).toUpperCase() + local.slice(1) : 'Cliente Ma Couronne');
  const since = new Date().toISOString().slice(0, 10);
  clientsStore.set((prev) =>
    prev.some((c) => c.id === clientId)
      ? prev
      : [
          ...prev,
          {
            id: clientId, branchId: bid, name, phone: '', email: mail, city: '',
            authUserId: authUserId ?? clientId,
            /* Lecture seule : la RLS réserve l'écriture des personas au personnel.
               Si l'accueil n'existe pas encore, la fiche naît sans persona et le
               Trône la nommera — mieux qu'une écriture rejetée. */
            persona: initiePersonaId(), since, segments: ['Ma Couronne', 'Nouvelle'],
            priceCoef: 1, loyaltyPoints: 0,
          },
        ]
  );
}

/** Garantit l'existence du dossier client dès qu'une session est ouverte.

    LE DOSSIER EST RÉSOLU AVANT D'ÊTRE CRÉÉ : `useClientId` a déjà cherché la
    fiche de cette cliente par son compte, puis par son adresse. On ne crée donc
    qu'en dernier recours — et le compte s'inscrit sur la fiche trouvée, pour
    que la reconnaissance ne dépende plus jamais de l'adresse. */
export function useEnsureClient(): string {
  const { session } = useAuth();
  const clientId = useClientId();
  const uid = session?.user?.id;
  const metaName = (session?.user?.user_metadata as { name?: string } | undefined)?.name;
  /* Se ré-exécute quand les branches ou le CRM ARRIVENT — ce sont les moments
     où la fiche peut naître (ou se ranger) sur la vraie branche, ou être
     ADOPTÉE au lieu d'être doublée. */
  const [branches] = useStore(branchesStore);
  const [tousClients] = useClients();
  useEffect(() => {
    /* PAS DE FICHE SUR UNE BRANCHE DEVINÉE. Un téléphone neuf s'inscrit AVANT
       d'avoir hydraté le référentiel : créer la fiche à cet instant la rangeait
       sur la branche par défaut du code — invisible du Trône, qui filtre par la
       vraie (Valerie Ahouansou, 10 août 2026). On attend la première lecture
       des branches ; sans backend, tout est prêt d'emblée. */
    if (!tablePrete('branches')) return;
    /* PAS DE FICHE NEUVE AVANT D'AVOIR LU LE CRM. La même course, côté
       clientes : s'inscrire avant l'hydratation créait un DOUBLON alors que la
       fiche historique — famille, enfants, rituels — attendait d'être reconnue
       par son adresse (Merine, 12 août). */
    if (!tablePrete('clients')) return;
    ensureClient(clientId, session?.user?.email, undefined, metaName, uid);
  }, [clientId, session?.user?.email, metaName, uid, branches, tousClients]);
  return clientId;
}

export function useClient(): Client | undefined {
  const [clients] = useClients();
  const clientId = useClientId();
  return clients.find((c) => c.id === clientId);
}

export function firstName(name: string | undefined): string {
  return (name ?? 'Bienvenue').split(' ')[0];
}

/* ---------- Suivi de présence — temps passé sur Ma Couronne ---------- */

/** Enregistre UNE session par chargement dans `clientSessionsStore`, que le Trône
    lit pour monitorer la présence et le temps passé. À appeler une seule fois dans
    la coquille de l'app, uniquement quand il y a une vraie cliente (authentifiée ou
    cliente locale). Battement toutes les ~20 s + sur visibilité/focus : met à jour
    `lastSeenAt` et cumule `durationSec` seulement pendant que l'onglet est visible.
    Sans backend (mode local), la session reste locale — inoffensif. */
export function useActivityTracker(screen?: string): void {
  const clientId = useClientId();
  const client = useClient();
  const { branch } = useBranch();

  /* Valeurs mutables lues par les battements sans réarmer l'intervalle. */
  const metaRef = useRef({ clientName: client?.name, branchId: branch.id, screen });
  metaRef.current = { clientName: client?.name, branchId: branch.id, screen };

  const sessionIdRef = useRef<string | null>(null);
  /* Dernier repère de mesure du temps visible. */
  const lastTickRef = useRef(Date.now());

  /* Une seule ligne de session par chargement, réamorcée si la cliente change. */
  useEffect(() => {
    const now = Date.now();
    const id = `sess-${clientId}-${now}`;
    sessionIdRef.current = id;
    lastTickRef.current = now;
    const iso = new Date(now).toISOString();
    const { clientName, branchId, screen: scr } = metaRef.current;
    clientSessionsStore.set((prev) =>
      prev.some((s) => s.id === id)
        ? prev
        : [
            ...prev,
            { id, clientId, clientName, branchId, startedAt: iso, lastSeenAt: iso, durationSec: 0, screen: scr },
          ]
    );
  }, [clientId]);

  /* Battements + écoute visibilité/focus. */
  useEffect(() => {
    /* Cumule le temps visible écoulé depuis le dernier repère. */
    const accumulate = () => {
      const id = sessionIdRef.current;
      if (!id) return;
      const now = Date.now();
      const elapsed = Math.max(0, Math.round((now - lastTickRef.current) / 1000));
      lastTickRef.current = now;
      const iso = new Date(now).toISOString();
      const { clientName, branchId, screen: scr } = metaRef.current;
      clientSessionsStore.set((prev) =>
        prev.map((s) =>
          s.id === id
            ? { ...s, lastSeenAt: iso, durationSec: s.durationSec + elapsed, clientName, branchId, screen: scr }
            : s
        )
      );
    };

    /* Reprise : réinitialise le repère sans compter la période cachée. */
    const touch = () => {
      const id = sessionIdRef.current;
      if (!id) return;
      const now = Date.now();
      lastTickRef.current = now;
      const iso = new Date(now).toISOString();
      const { clientName, branchId, screen: scr } = metaRef.current;
      clientSessionsStore.set((prev) =>
        prev.map((s) => (s.id === id ? { ...s, lastSeenAt: iso, clientName, branchId, screen: scr } : s))
      );
    };

    const heartbeat = window.setInterval(() => {
      if (!document.hidden) accumulate();
    }, 20000);

    const onVisibility = () => {
      if (document.hidden) accumulate(); // fige la portion visible qui vient de s'achever
      else touch(); // reprise : ne compte pas le temps caché
    };
    const onFocus = () => {
      if (!document.hidden) accumulate();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      if (!document.hidden) accumulate(); // fige le temps visible restant
    };
  }, [clientId]);
}

/* ---------- Visibilité — catalogue × configuration Vitrine du Trône ---------- */

export type VisibleCatalog = {
  cats: CatalogCategory[];
  services: Service[];
  products: Product[];
};

export function useVisibleCatalog(): VisibleCatalog {
  const [cats] = useCategories();
  const [services] = useServices();
  const [products] = useProducts();
  const [vitrine] = useStore(vitrineConfigStore);
  /* SON tapis de cuivre : les masques individuels vivent sur SA fiche —
     le juge unique (`catalogueVisiblePour`, shared/bridges) applique le
     socle de la Maison PLUS ses masques. Sans session, socle seul. */
  const client = useClient();

  return useMemo(
    () => catalogueVisiblePour({ cfg: vitrine, masques: client?.vitrineMasques, cats, services, products }),
    [cats, services, products, vitrine, client],
  );
}

/* ---------- Dates (tout est calculé sur la date du jour) ---------- */

export const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);

export const DOWS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
export const DOW_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
export const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];
export const MONTHS_SHORT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];

export const isoOf = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayIso = () => isoOf(new Date());
export const dateOfIso = (iso: string) => new Date(`${iso}T00:00:00`);

/** « Sam. 5 juil » */
export function dayLabel(d: Date): string {
  return `${DOWS[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
export function dayLabelIso(iso: string): string {
  return dayLabel(dateOfIso(iso));
}

export function daysSince(iso: string): number {
  const ms = Date.now() - dateOfIso(iso).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/** « 2 h » · « 1 h 30 » · « 45 min » */
export function fmtDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${pad2(m)}` : `${h} h`;
}

/* ---------- Créneaux libres — calculés par maître contre l'agenda partagé ---------- */

function apptDurationMin(a: Appointment, services: Service[]): number {
  const total = a.serviceIds.reduce((sum, id) => sum + (services.find((s) => s.id === id)?.durationMin ?? 60), 0);
  return total || 60;
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Heures de départ libres pour un maître, un jour, une durée — dans la fenêtre
    d'ouverture configurée au Trône (Paramètres : jours & heures, jours fermés,
    exceptions d'une date — `openingForIso` les résout toutes), MOINS les
    créneaux bloqués à la main, et SEULEMENT si le plafond de rendez-vous du
    jour n'est pas atteint. Trois murs, trois réglages du Trône. */
export function freeSlots(
  dateIso: string,
  master: string,
  durationMin: number,
  appts: Appointment[],
  services: Service[],
  branchId: string
): string[] {
  const opening = openingForIso(dateIso);
  if (opening.closed) return [];

  const duJour = appts.filter((a) => a.branchId === branchId && a.date === dateIso && a.status !== 'annulé');

  /* LE PLAFOND D'ABORD : au-delà, plus aucun créneau — même si des heures
     restent. La maison choisit son souffle ; le comptoir, lui, n'est pas
     bridé (poser un RDV à la main reste un geste du personnel). 0 = illimité. */
  const regl = settingsStore.get();
  const capMaison = regl.maxRdvParJourMaison ?? 0;
  const capMaitre = regl.maxRdvParJourMaitre ?? 0;
  if (capMaison > 0 && duJour.length >= capMaison) return [];
  const duMaitre = duJour.filter((a) => a.master === master);
  if (capMaitre > 0 && duMaitre.length >= capMaitre) return [];

  /* L'agenda du maître, PLUS les murs posés à la main (pause, absence) :
     un blocage occupe le calendrier exactement comme un rendez-vous. */
  const busy: Array<readonly [number, number]> = duMaitre.map((a) => {
    const start = toMin(a.time);
    return [start, start + apptDurationMin(a, services)] as const;
  });
  busy.push(...plagesBloquees(blocagesStore.get(), branchId, dateIso, master, hourToMin));

  const now = new Date();
  const isToday = dateIso === isoOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const out: string[] = [];
  for (let m = opening.openMin; m + durationMin <= opening.closeMin; m += 60) {
    if (isToday && m <= nowMin) continue;
    const overlaps = busy.some(([s, e]) => m < e && m + durationMin > s);
    if (!overlaps) out.push(`${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`);
  }
  return out;
}

/* ---------- Paliers d'expérience ---------- */

export const PALIERS: { key: Service['palier']; sub: string }[] = [
  { key: 'Fondation', sub: 'Poser les bases, découvrir le rituel.' },
  { key: 'Élévation', sub: 'Affirmer sa couronne, séance après séance.' },
  { key: 'Souveraineté', sub: 'La maîtrise, mèche après mèche.' },
];

/* ---------- Les quatre temps — la méthode de la maison ---------- */

export const QUATRE_TEMPS = [
  { no: '01', n: 'Purifier', g: 'Laver en douceur, libérer le cuir chevelu.' },
  { no: '02', n: 'Nourrir', g: 'Hydrater la fibre, fortifier la racine.' },
  { no: '03', n: 'Sceller', g: 'Fixer le soin, protéger la mèche.' },
  { no: '04', n: 'Couronner', g: 'Sculpter, parfumer, révéler la tête haute.' },
];

/* ---------- Offres instantanées — créées au Trône (Marketing), vécues ici ---------- */

export type Offer = {
  id: string;
  tag: string;
  deal: string;
  discountPct: number;
  serviceId?: string;
  title: string;
  sub: string;
  cta: string;
  theme: 'copper' | 'indigo' | 'sable';
  act: 'book' | 'invite';
};

const OFFER_THEMES: Offer['theme'][] = ['copper', 'indigo', 'sable'];

/** Offres visibles maintenant pour cette branche — fenêtre jour/heure respectée. */
export function useLiveOffers(): { offers: Offer[]; endMin: number | null } {
  const { branch } = useBranch();
  const [all] = useOffers();
  const now = new Date();
  return useMemo(() => {
    const live = all.filter((o) => o.branchId === branch.id && offerLiveNow(o, now));
    const offers = live.map((o, i): Offer => ({
      id: o.id,
      tag: o.tag,
      deal: o.deal,
      discountPct: o.discountPct ?? 0,
      serviceId: o.serviceId,
      title: o.title,
      sub: o.sub,
      cta: o.serviceId ? `Réserver ${o.deal}` : o.deal,
      theme: OFFER_THEMES[i % OFFER_THEMES.length],
      act: o.serviceId ? 'book' : 'invite',
    }));
    /* Fin de fenêtre la plus proche — pour le compte à rebours. */
    const endMin = live.length ? Math.min(...live.map((o) => hourToMin(o.heureFin))) : null;
    return { offers, endMin };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, branch.id, now.getHours(), now.getMinutes()]);
}

/** Compte à rebours vivant jusqu'à la fin de fenêtre d'offre (minutes depuis minuit). */
export function useOfferCountdown(endMin: number | null): string {
  const compute = () => {
    if (endMin == null) return '';
    const now = new Date();
    const end = new Date(now);
    end.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
    if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
    const s = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000));
    return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
  };
  const [v, setV] = useState(compute);
  useEffect(() => {
    const t = window.setInterval(() => setV(compute()), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endMin]);
  return v;
}

/* ---------- Gamme — descripteurs éditoriaux par produit ---------- */

export const PRODUCT_META: Record<string, { tag: string; line: string }> = {
  'pr-huile-couronne': { tag: 'Sceller', line: 'Brillance & protection des pointes' },
  'pr-shampoing': { tag: 'Purifier', line: 'Moringa · romarin · sans paraben' },
  'pr-beurre-locks': { tag: 'Couronner', line: 'Karité · cacao · définition' },
  'pr-serum-racines': { tag: 'Nourrir', line: 'Densité & cuir chevelu sain' },
};

export const productMeta = (id: string) => PRODUCT_META[id] ?? { tag: 'Rituel', line: 'Formule naturelle de la maison' };

/* ---------- Modules de l'app — coupés par cliente depuis la Vitrine du Trône ---------- */

export type CouronneModule = 'reserver' | 'compose' | 'suivi' | 'gamme' | 'cercle' | 'offres';

/** Le module est-il DÉSACTIVÉ pour cette cliente ? (fiche.hiddenModules) */
export const moduleHidden = (
  client: { hiddenModules?: string[] } | null | undefined,
  m: CouronneModule,
): boolean => !!client?.hiddenModules?.includes(m);

/** DEUX FERMETURES QUI S'ADDITIONNENT : celle de la Maison, pour toutes
    (`VitrineConfig.modulesFermes`), et celle de la fiche, pour elle seule.
    Aucune ne rouvre ce que l'autre a fermé — on ne rend pas à une cliente ce
    que la Maison a fermé à tout le monde. */
export function useModuleFerme(): (m: CouronneModule) => boolean {
  const me = useClient();
  const [cfg] = useStore(vitrineConfigStore);
  return (m) => (cfg.modulesFermes ?? []).includes(m) || moduleHidden(me, m);
}

/** La porte de l'application — au-dessus des modules. */
export function useCouronneFermee(): { fermee: boolean; mot: string } {
  const [cfg] = useStore(vitrineConfigStore);
  return {
    fermee: !!cfg.couronneFermee,
    mot: cfg.couronneMot?.trim()
      || 'La maison ne prend pas de réservation en ligne en ce moment. Écrivez-nous, on vous répondra.',
  };
}

/* ---------- Réservation — pré-remplissage (offres, re-réservation) ---------- */

export type BookingPrefill = {
  serviceId: string;
  discountPct?: number;
  offerLabel?: string;
};
