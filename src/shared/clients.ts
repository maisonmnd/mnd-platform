import { createStore, useStore, HOUSE_BLANK } from './store';

/* Têtes couronnées — CRM 360. Toutes les entités portent `branchId` :
   la branche sélectionnée filtre tout. */

export type Client = {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  email?: string;
  /** LE COMPTE MA COURONNE RATTACHÉ À CETTE FICHE.

      Ma Couronne reliait une cliente à son dossier par l'IDENTIFIANT : la
      fiche portait l'identifiant du compte. Cela marche pour une cliente qui
      naît en ligne, et seulement pour elle. Toutes celles que la Maison a
      inscrites elle-même au Trône portent un identifiant maison, et leurs
      rendez-vous avec — s'inscrire leur ouvrait une fiche NEUVE et vide, à
      côté de la leur, et elles ne voyaient rien de leur histoire.

      La fiche garde donc son identifiant, et c'est le compte qui vient s'y
      rattacher. Rien à re-clefer, aucun rendez-vous à déplacer. */
  authUserId?: string;
  city: string;
  persona: string; // id de persona
  since: string; // ISO date
  photo?: string | null;
  segments: string[];
  priceCoef: number; // Le Juste Prix — coefficient personnalisé
  loyaltyPoints: number;
  notes?: string;
  archived?: boolean;
  diaspora?: boolean;
  /* — la couronne : partagé Trône (CRM 360) ↔ Ma Couronne (statut, suivi) — */
  crownStyle?: string; // Microlocks, Locks fines, Sisterlocks…
  lockCount?: number; // nombre de locks
  crownSince?: string; // ISO — naissance de la couronne (≠ since, date d'entrée au CRM)
  preferredMaster?: string;
  recoProductId?: string; // produit de la Gamme recommandé par la maison — affiché au Carnet de Suivi
  birthday?: string; // ISO — anniversaire de la cliente
  birthdayGiftAt?: string; // ISO — date du dernier cadeau anniversaire envoyé
  geo?: { lat: number; lng: number }; // position GPS partagée (livraison Ma Couronne)
  /** Compte famille auquel la cliente est rattachée (ex. Famille Adamon). Le
      porte-monnaie d'avoir et le paiement des factures vivent alors sur le compte
      famille — c'est le parent payeur qui règle. Absent = compte individuel. */
  familyId?: string;
  /** Modules de Ma Couronne DÉSACTIVÉS pour cette cliente (réglés à la Vitrine du
      Trône) : 'reserver' · 'compose' · 'suivi' · 'gamme' · 'cercle' · 'offres'.
      Absent/vide = tout est ouvert. Accueil et Profil ne se coupent jamais. */
  hiddenModules?: string[];
};

/** Compte famille — regroupe plusieurs clientes sous un même compte payeur. */
export type Family = {
  id: string;
  branchId: string;
  name: string; // « Famille Adamon »
  payerClientId?: string; // le parent payeur (une des clientes rattachées, ou une fiche dédiée)
  note?: string;
};

/** Styles de couronne par défaut — la liste est éditable (crownStylesStore). */
export const CROWN_STYLES_DEFAULT = [
  'Microlocks', 'Sisterlocks', 'Locks fines', 'Locks moyennes', 'Locks larges',
  'Traditionnelles', 'Freeform', 'Faux locks', 'Locks bouclées', 'Interlocks',
];

/** Liste gérable des styles de couronne (Paramètres / CRM), synchronisée Supabase. */
export const crownStylesStore = createStore<string[]>('mnd_crown_styles', CROWN_STYLES_DEFAULT);
export const useCrownStyles = () => useStore(crownStylesStore);

/** Segments de clientèle par défaut — la liste est éditable (segmentsStore). */
export const SEGMENTS_DEFAULT = [
  'Prospect', 'VIP', 'Abonnée', 'Nouvelle', 'Diaspora', 'Famille', 'Cercle', 'Régulier', 'Dormante', 'Ma Couronne',
];

/** Liste gérable des segments de clientèle (Paramètres / CRM), synchronisée Supabase. */
export const segmentsStore = createStore<string[]>('mnd_segments', SEGMENTS_DEFAULT);
export const useSegments = () => useStore(segmentsStore);

/** Alias rétro-compatible (liste par défaut). Préférer `useCrownStyles()`. */
export const CROWN_STYLES = CROWN_STYLES_DEFAULT;

export type Persona = {
  id: string;
  name: string;
  essence: string; // une phrase — comment la maison l'accueille
  builtin: boolean;
};

/* ---------- Gestion des segments — la liste ET les fiches taguées ----------
   Un segment n'existe pas qu'en liste : il est recopié dans `client.segments`.
   Toute opération sur la liste doit donc décider du sort des fiches, sinon on
   laisse des libellés orphelins que plus rien ne sait retrouver. */

/** Ajoute un segment (trim + dédoublonnage insensible à la casse). */
export function addSegment(name: string): void {
  const t = name.trim();
  if (!t) return;
  segmentsStore.set((prev) => (prev.some((s) => s.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]));
}

/** Renomme un segment PARTOUT : la liste et les fiches déjà taguées.
    Sans la migration des fiches, un renommage laisserait chaque cliente porter
    l'ancien libellé — absent de la liste, donc introuvable et infiltrable. */
export function renameSegment(from: string, to: string): void {
  const next = to.trim();
  if (!next || next === from) return;
  /* Le renommage peut faire tomber sur un segment existant : on dédoublonne
     plutôt que de créer deux entrées identiques. */
  segmentsStore.set((prev) => Array.from(new Set(prev.map((s) => (s === from ? next : s)))));
  clientsStore.set((prev) =>
    prev.map((c) =>
      c.segments.includes(from)
        ? { ...c, segments: Array.from(new Set(c.segments.map((s) => (s === from ? next : s)))) }
        : c,
    ),
  );
}

/** Retire un segment de la liste. `alsoFromClients` le retire aussi des fiches
    (sinon elles le gardent — c'est une trace, pas une erreur). */
export function removeSegment(name: string, alsoFromClients = false): void {
  segmentsStore.set((prev) => prev.filter((s) => s !== name));
  if (!alsoFromClients) return;
  clientsStore.set((prev) =>
    prev.map((c) => (c.segments.includes(name) ? { ...c, segments: c.segments.filter((s) => s !== name) } : c)),
  );
}

/** Persona d'accueil — toute nouvelle tête couronnée entre par là, avant que la
    maison ne la nomme autrement. `builtin` : fourni par la maison, pas né de l'usage. */
export const INITIE_PERSONA: Persona = {
  id: 'p-initie',
  name: 'Initiée',
  essence: 'Elle franchit le seuil — la maison l’accueille, l’observe, et attend de la connaître.',
  builtin: true,
};

/* Maison neuve — une seule exception à la coquille vierge : le persona d'accueil,
   sans quoi une nouvelle fiche naîtrait sans identité. */
export const PERSONAS_SEED: Persona[] = [INITIE_PERSONA];

/* Reconnaît le persona d'accueil quelle que soit sa graphie (Initié / Initiée /
   Initie) : une maison déjà en service peut avoir créé le sien à la main. */
const isInitie = (p: Persona): boolean =>
  p.id === INITIE_PERSONA.id || /^\s*initi/i.test(p.name);

/** Id du persona d'accueil s'il existe — n'écrit JAMAIS. À utiliser partout où
    le code peut tourner côté cliente : la RLS réserve l'écriture des personas
    au personnel, une tentative depuis Ma Couronne serait rejetée. */
export const initiePersonaId = (): string => personasStore.get().find(isInitie)?.id ?? '';

/** Garantit le persona d'accueil et renvoie son id (idempotent).
    ÉCRIT si absent → réservé au Trône (personnel). */
export function ensureInitiePersona(): string {
  if (HOUSE_BLANK) return ''; // Maison à blanc — aucune semence
  const existing = initiePersonaId();
  if (existing) return existing;
  personasStore.set((prev) => [...prev, INITIE_PERSONA]);
  return INITIE_PERSONA.id;
}

/* Maison neuve — aucune donnée de démonstration ; tout naît de l’usage. */
export const CLIENTS_SEED: Client[] = [];

export const clientsStore = createStore<Client[]>('mnd_clients', CLIENTS_SEED);
export const personasStore = createStore<Persona[]>('mnd_personas', PERSONAS_SEED);
/* Maison neuve — aucun compte famille au départ ; ils naissent de l'usage. */
export const familiesStore = createStore<Family[]>('mnd_families', []);

export const useClients = () => useStore(clientsStore);
export const usePersonas = () => useStore(personasStore);
export const useFamilies = () => useStore(familiesStore);

import { bindCollection, bindDocument } from './sync';
bindCollection(clientsStore, 'clients');
bindCollection(personasStore, 'personas');
bindCollection(familiesStore, 'families');
bindDocument(crownStylesStore, 'mnd_crown_styles');
bindDocument(segmentsStore, 'mnd_segments');
