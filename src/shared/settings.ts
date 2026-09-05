import { createStore, useStore } from './store';

/* Paramètres de la Maison — persistés en localStorage (clé `mnd_settings`).
   Jours & heures d'ouverture, bascules de rituel/notifications, et les liens
   d'automatisation insérés tels quels dans les envois WhatsApp / SMS. */

export type DayHours = { key: string; label: string; open: string; close: string; closed: boolean };

export type Automations = {
  momoLink: string;
  mapsLink: string;
  reviewLink: string;
  itineraire: string;
};

export type Settings = {
  /** ── LE VERROU DES CAISSES — 22 août 2026 ──────────────────────
      « Mettre un code de sécurité avant d'ouvrir tout l'onglet caisse. »

      L'EMPREINTE, JAMAIS LE CODE — même règle que les caisses discrètes : on
      n'écrit que le SHA-256, et il n'existe en clair nulle part. Absent = pas
      de verrou, et l'écran s'ouvre comme avant : personne ne se retrouve
      enfermé dehors par une mise à jour.

      Le verrou vaut pour la SÉANCE : il se repose au rechargement. Et il ne
      remplace pas les droits — un compte qui n'a pas accès aux finances ne
      verra jamais cet écran, code ou pas. */
  codeCaissesHash?: string;
  /** Le même verrou pour le Coffre-fort — 22 août 2026. */
  codeCoffreHash?: string;
  /** Le même verrou pour les Prêts — 23 août 2026. Trois écrans, une seule
      mécanique : ce qui se recopie se corrige trois fois. */
  codePretsHash?: string;
  toggles: Record<string, boolean>;
  hours: DayHours[];
  automations: Automations;
  /** Acompte proposé par défaut (%) quand on ajoute une prestation à la table
      ci-dessous. Sert aussi de repli pour les réglages d'avant le taux par
      prestation. Ce n'est PLUS le taux appliqué : chaque prestation porte le sien. */
  onlineDepositPct: number;
  /** Acompte PAR PRESTATION : id de prestation → pourcentage (0–100).
      Une prestation absente de la table n'exige aucun acompte ; table vide =
      aucun acompte nulle part. */
  depositPctByService?: Record<string, number>;
  /** @deprecated Ancienne liste — toutes les prestations au taux global.
      Encore lue en repli tant que des réglages d'avant la bascule circulent. */
  depositServiceIds?: string[];
  /** Frais de livraison à domicile (XOF). Lu par Ma Couronne · Gamme. */
  deliveryFeeXof: number;
  /** Ouvre l'encaissement en devise étrangère à la Caisse. Exceptionnel : on
      l'active le temps d'une facture, puis on le referme — d'où une bascule et
      non un réglage permanent. */
  fxEnabled?: boolean;
  /** LA CAPACITÉ DU CALENDRIER (réservation en ligne). Au-delà du plafond, Ma
      Couronne ne propose plus de créneau ce jour-là, même si des heures
      restent — la maison garde son souffle. 0 ou absent = illimité. Le
      comptoir, lui, n'est jamais bridé : poser un RDV à la main reste un
      geste du personnel, qui voit son carnet. */
  maxRdvParJourMaitre?: number;
  maxRdvParJourMaison?: number;
  /** LE BARÈME DES TRANCHES, SUSPENDU — 17 août 2026, demande de Yéman :
      « si je décide de suspendre le barème et rajouter des ateliers ou des
      prestations, besoin d'avoir la main ».

      SUSPENDRE, PAS EFFACER : les coefficients restent écrits sur la page du
      Juste Prix, intacts, et reprennent tels quels quand elle rallume. Le
      temps de remanier le catalogue, aucune prestation ne suit plus la taille
      de la couronne — les prix sont ceux du catalogue, nus.

      Ce que la suspension NE touche pas, et c'est voulu : le coefficient
      personnel d'une cliente et ses prix fermes (ce sont des accords avec
      ELLE, pas un barème), ni les prestations au lock ou au calibre (leur prix
      vient du comptage ou du plancher de tranche, jamais d'un coefficient). */
  baremeSuspendu?: boolean;
};

/** Créneaux d'ouverture proposés — repris du prototype. */
export const HOUR_OPTIONS = [
  '07h00', '07h30', '08h00', '08h30', '09h00', '09h30', '10h00', '10h30', '11h00',
  '12h00', '13h00', '14h00', '15h00', '16h00', '17h00', '18h00', '18h30', '19h00',
  '19h30', '20h00', '20h30', '21h00', '22h00',
];

export const DEFAULT_HOURS: DayHours[] = [
  { key: 'lun', label: 'Lundi', open: '09h00', close: '19h00', closed: false },
  { key: 'mar', label: 'Mardi', open: '09h00', close: '19h00', closed: false },
  { key: 'mer', label: 'Mercredi', open: '09h00', close: '19h00', closed: false },
  { key: 'jeu', label: 'Jeudi', open: '09h00', close: '20h00', closed: false },
  { key: 'ven', label: 'Vendredi', open: '09h00', close: '20h00', closed: false },
  { key: 'sam', label: 'Samedi', open: '08h00', close: '20h00', closed: false },
  { key: 'dim', label: 'Dimanche', open: '10h00', close: '16h00', closed: true },
];

export const DEFAULT_SETTINGS: Settings = {
  toggles: {
    rappel: true,
    acompte: true,
    notifRdv: true,
    notifStock: true,
    notifPaie: true,
    notifCercle: false,
    auth: true,
    sauvegarde: true,
    export: true,
  },
  hours: DEFAULT_HOURS,
  automations: { momoLink: '', mapsLink: '', reviewLink: '', itineraire: '' },
  onlineDepositPct: 30,
  depositServiceIds: [],
  deliveryFeeXof: 2000,
};

/** Fraction d'acompte (0–1) exigée en ligne — défaut 30 %. */
export const onlineDepositRate = (): number => {
  const pct = settingsStore.get().onlineDepositPct;
  return typeof pct === 'number' && pct >= 0 && pct <= 100 ? pct / 100 : 0.3;
};

/** Pourcentage d'acompte d'UNE prestation. 0 = aucun acompte exigé. */
export const depositPctFor = (serviceId: string): number => {
  const s = settingsStore.get();
  const map = s.depositPctByService;
  if (map && serviceId in map) {
    const p = map[serviceId];
    return typeof p === 'number' && p > 0 && p <= 100 ? p : 0;
  }
  /* Repli — réglages d'avant le taux par prestation : la liste + le taux global. */
  if (s.depositServiceIds?.includes(serviceId)) {
    const g = s.onlineDepositPct;
    return typeof g === 'number' && g > 0 && g <= 100 ? g : 30;
  }
  return 0;
};

/** Fraction (0–1) d'acompte d'une prestation. */
export const depositRateFor = (serviceId: string): number => depositPctFor(serviceId) / 100;

/** Une prestation exige-t-elle un acompte ? */
export const serviceRequiresDeposit = (serviceId: string): boolean => depositPctFor(serviceId) > 0;

/** Ids des prestations qui exigent un acompte (vide = aucune). */
export const depositServiceIds = (): string[] => {
  const s = settingsStore.get();
  const map = s.depositPctByService;
  if (map) return Object.keys(map).filter((id) => depositPctFor(id) > 0);
  return s.depositServiceIds ?? [];
};

/** Acompte dû pour un panier — chaque prestation à SON taux, remise répercutée.
    Source unique de la règle : Ma Couronne et Le Trône doivent tomber d'accord. */
export function depositForServices(
  items: { id: string; priceXof: number }[],
  discountPct = 0,
): number {
  const f = 1 - (discountPct || 0) / 100;
  return Math.round(items.reduce((n, s) => n + s.priceXof * f * depositRateFor(s.id), 0));
}

/** Frais de livraison à domicile (XOF) — défaut 2 000 F ; 0 = livraison gratuite. */
export const deliveryFee = (): number => {
  const n = settingsStore.get().deliveryFeeXof;
  return typeof n === 'number' && n >= 0 ? Math.round(n) : 2000;
};

export const settingsStore = createStore<Settings>('mnd_settings', DEFAULT_SETTINGS);

export function useSettings() {
  return useStore(settingsStore);
}

/* ---------- Heures d'ouverture résolues (partagé Trône ↔ Ma Couronne) ---------- */

/** '09h30' → minutes depuis minuit. */
export const hourToMin = (h: string): number => {
  const m = /^(\d{1,2})h(\d{2})?$/.exec(h.trim());
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 9 * 60;
};

const DAY_KEYS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** Fenêtre d'ouverture d'une date ISO — la disponibilité de réservation la
    respecte, EXCEPTIONS COMPRISES : « deux sources d'horaires pour une seule
    maison, c'est une de trop » — la fermeture exceptionnelle saisie pour la
    paie ferme AUSSI la réservation en ligne (celle de la Maison ; celles d'une
    personne restent l'affaire du pointage). */
export function openingForIso(dateIso: string): { closed: boolean; openMin: number; closeMin: number } {
  const dow = new Date(`${dateIso}T00:00:00`).getDay();
  const day = settingsStore.get().hours.find((h) => h.key === DAY_KEYS[dow]);
  if (!day || day.closed) return { closed: true, openMin: 0, closeMin: 0 };
  const base = { closed: false, openMin: hourToMin(day.open), closeMin: hourToMin(day.close) };
  const ex = exceptionsHorairesStore.get().find((e) => e.date === dateIso && !e.staffId);
  if (!ex) return base;
  if (ex.closed) return { closed: true, openMin: 0, closeMin: 0 };
  return {
    closed: false,
    openMin: ex.open?.trim() ? hourToMin(ex.open) : base.openMin,
    closeMin: ex.close?.trim() ? hourToMin(ex.close) : base.closeMin,
  };
}

/* ══ LE VERROU DU JOUR FERMÉ — 5 septembre 2026 ═════════════════════
   « Je ne sais pas comment il a pu prendre RDV le lundi 12 octobre puisque le
   salon est fermé » (Yéman).

   LE CALENDRIER DE MA COURONNE JUGEAIT DÉJÀ (`creneauxDuJour` rend zéro
   créneau un jour fermé), MAIS RIEN NE JUGEAIT AU MOMENT D'ÉCRIRE. Entre les
   deux, tout peut arriver : des horaires pas encore descendus du serveur, une
   date pré-remplie qui n'est jamais passée par le calendrier, un retour en
   arrière du navigateur sur un écran vieux d'une minute. Un écran qui propose
   bien et n'empêche rien finit toujours par laisser passer.

   DEUX GARDES, ET LE SECOND COMPTE PLUS QUE LE PREMIER :

   ① `joursFermesParmi` relit l'ouverture réelle de chaque date, juste avant
     d'écrire. C'est le dernier mot, et il ne dépend d'aucun état d'écran.

   ② `horairesDescendus` dit si les horaires de LA MAISON sont arrivés, ou si
     l'on raisonne encore sur ceux de naissance — où le lundi est OUVERT. Sans
     lui, le premier garde bénirait un lundi fermé en toute bonne foi. */
export const joursFermesParmi = (isos: readonly string[]): string[] =>
  [...new Set(isos.filter((iso) => iso && openingForIso(iso).closed))];

/** Les horaires de la Maison sont-ils descendus, ou lit-on ceux de naissance ?
    Sans backend, ils le sont d'office : il n'y a rien à attendre. */
export const horairesDescendus = (): boolean => documentDescendu('mnd_settings');

/** LE PROCHAIN JOUR OÙ LA PORTE S'OUVRE, à partir d'une date incluse.

    Proposer une autre date en repartant du jour fermé lui-même ferait tomber
    la proposition une semaine plus tard sur le même mur. Quatorze essais : deux
    semaines fermées d'affilée n'existent pas, et si elles existaient, mieux
    vaut rendre la date de départ que boucler sans fin. */
export const prochainJourOuvert = (isoDepart: string): string => {
  /* LE LENDEMAIN SE CALCULE EN HEURE LOCALE, JAMAIS PAR `toISOString`. Minuit
     local à Cotonou (UTC+1) vaut 23 h la veille en UTC : la date « avancée »
     retombait sur celle d'hier, la boucle tournait quatorze fois sur le même
     jour fermé et rendait le jour de départ. Le harnais l'a vu ; au comptoir
     on aurait seulement trouvé que le bouton ne proposait rien. */
  const lendemain = (iso: string): string => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + 1);
    const mois = String(d.getMonth() + 1).padStart(2, '0');
    const jour = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mois}-${jour}`;
  };
  let iso = isoDepart;
  for (let i = 0; i < 14; i += 1) {
    if (!openingForIso(iso).closed) return iso;
    iso = lendemain(iso);
  }
  return isoDepart;
};

/* ---------- Exceptions d'horaires — UNE date, des heures à part ----------
   Déménagées ici depuis la paie (equipe/payroll) le 12 août : le calendrier
   de réservation doit les lire aussi, et Ma Couronne ne peut pas importer un
   module du Trône. Une exception SANS `staffId` vaut pour toute la Maison —
   c'est elle que la réservation respecte ; avec `staffId`, elle ne parle
   qu'au pointage. La clé du document ne change pas. */
export type HoraireException = {
  id: string;
  date: string;       // AAAA-MM-JJ
  staffId?: string;   // absent = toute la Maison
  open?: string;
  close?: string;
  closed?: boolean;
  note?: string;
};
export const exceptionsHorairesStore = createStore<HoraireException[]>('mnd_horaires_exceptions', []);
export const useExceptionsHoraires = () => useStore(exceptionsHorairesStore);

/** L'horaire qui s'applique VRAIMENT à une personne un jour donné (paie). */
export const horaireEffectif = (
  date: string,
  staffId: string | undefined,
  semaine: Record<string, { open: string; close: string; closed: boolean }>,
  exceptions: HoraireException[],
  jourDeLaSemaine: (d: string) => string,
): { open: string; close: string; closed: boolean; exception?: HoraireException } => {
  const base = semaine[jourDeLaSemaine(date)] ?? { open: '09h00', close: '19h00', closed: false };
  const duJour = exceptions.filter((e) => e.date === date);
  /* Le plus précis d'abord : la personne, puis la Maison. */
  const ex = duJour.find((e) => e.staffId && e.staffId === staffId) ?? duJour.find((e) => !e.staffId);
  if (!ex) return base;
  return {
    open: ex.open?.trim() || base.open,
    close: ex.close?.trim() || base.close,
    closed: ex.closed ?? base.closed,
    exception: ex,
  };
}

/* ---------- Marque & thème ---------- */
export type Brand = {
  accent: string;
  mono: string;
  verbe: string;
};

export const DEFAULT_ACCENT = '#B97A4A';
export const DEFAULT_VERBE = 'Le cheveu est une couronne. Nous en sommes les orfèvres.';

export const DEFAULT_BRAND: Brand = {
  accent: DEFAULT_ACCENT,
  mono: 'copper',
  verbe: DEFAULT_VERBE,
};

export const brandStore = createStore<Brand>('mnd_brand', DEFAULT_BRAND);

export function useBrand() {
  return useStore(brandStore);
}

import { bindDocument, documentDescendu } from './sync';
bindDocument(settingsStore, 'mnd_settings');
bindDocument(brandStore, 'mnd_brand');
bindDocument(exceptionsHorairesStore, 'mnd_horaires_exceptions');
