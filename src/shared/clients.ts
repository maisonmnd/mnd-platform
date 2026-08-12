import { createStore, useStore, uid, HOUSE_BLANK } from './store';
import { type EnvieKey } from './quiz';

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
  /** LA MAIN L'EMPORTE. Posé dès qu'une personne choisit l'archétype elle-même
      au CRM : la lecture automatique (`shared/persona.ts`) ne recalcule plus
      cette fiche. Sans ce verrou, l'intelligence effacerait à la nuit tombée le
      jugement qu'un maître a porté le matin — et personne ne referait deux fois
      un geste qu'une machine défait. Se relâche d'un clic sur la fiche. */
  personaFige?: boolean;
  since: string; // ISO date
  photo?: string | null;
  segments: string[];
  priceCoef: number; // Le Juste Prix — coefficient personnalisé
  loyaltyPoints: number;
  notes?: string;
  /** CE QUE LA MAISON OBSERVE D'ELLE — écrit à la main, en phrases libres.

      Le carnet dit ce qu'elle a PRIS ; il ne dira jamais comment elle l'a pris :
      si elle a demandé le prix trois fois, si elle regardait l'heure, si elle
      repart dans trois semaines. Cela, seul quelqu'un qui l'a reçue le voit.

      Lu comme un signal par `shared/persona.ts` (lexique + négation), et ce que
      la Maison y lit s'affiche sous le champ — une lecture invisible ne se
      corrige jamais. Distinct de `notes`, qui porte les notes de consultation. */
  observation?: string;
  archived?: boolean;
  diaspora?: boolean;
  /** LA CLIENTE DE PASSAGE — venue une fois, sans relation engagée.

      On ne peut pas ne pas l'enregistrer : l'argent doit être tracé et le geste
      doit compter dans la production du maître. Mais la COMPTER comme une
      cliente fausse tout le reste — 178 têtes deviennent 400, la rétention
      s'effondre sans que rien n'ait changé dans la maison, et les relances
      partent vers des gens qui ne reviendront pas. Le tort n'est pas de les
      enregistrer, c'est de les compter.

      D'où la coupure, la même qu'entre encaisser et honorer :
      DANS le chiffre d'affaires et dans la production / les seuils du maître ;
      HORS des têtes actives, de la rétention et des relances.

      UN CHAMP, PAS UN SEGMENT. Un segment se renomme et s'efface depuis la
      liste — et le prédicat casserait en silence, comme il a failli le faire
      pour la Diaspora (`isDiaspora` lit le segment, `litSignaux` lit le champ
      `diaspora` : deux vérités pour une notion). Ici il n'y en a qu'une.

      Se lève tout seul au 2ᵉ passage (`usePassageVivant`) : là, la déduction
      est légitime — elle porte sur un fait observé, elle est revenue, et non
      sur une supposition quant à sa vie. */
  dePassage?: boolean;
  /** SES PRIX FERMES — un montant convenu avec ELLE, prestation par prestation.
      Clé = identifiant de prestation, valeur = prix en XOF.

      LE JUSTE PRIX EST UN COEFFICIENT, ET C'EST SA LIMITE : il multiplie ce que
      rend le barème, donc il ne sait pas dire « celle-ci paie 20 000 F, quoi
      qu'annonce le catalogue ». Pire, il s'applique à TOUTES ses prestations —
      le régler pour caler un seul geste déréglait tous les autres — et le prix
      « fixe » bougeait dès que le catalogue bougeait, puisqu'il n'était que
      proportionnel.

      Ce prix-ci est FERME : il passe AVANT le barème, le plancher, le tarif au
      lock et le coefficient (voir `personalPriceXof`). Ni son nombre de locks
      ni une révision du catalogue ne le déplacent. Une valeur ≤ 0 n'existe
      pas — un accord à zéro franc se dit « offert », pas « prix fixe ». */
  prixFixes?: Record<string, number>;
  /* — la couronne : partagé Trône (CRM 360) ↔ Ma Couronne (statut, suivi) — */
  crownStyle?: string; // Microlocks, Locks fines, Sisterlocks…
  /** SA LONGUEUR PAR DÉFAUT (évolution du 11 août 2026). La doctrine du 6 août
      la refusait sur la fiche — « la longueur repousse » — mais sans elle, Ma
      Couronne annonçait le prix de REPLI à une cliente dont la Maison connaît
      la longueur. Compromis : la fiche porte un POINT DE DÉPART, chaque
      rendez-vous FIGE toujours la sienne (`Appointment.longueur`) — relire un
      rituel de mars ne le retarife jamais — et le comptoir corrige à
      l'arrivée si elle a poussé. Mêmes valeurs que `LongueurId` (catalog). */
  longueur?: 'court' | 'mi-long' | 'long';
  lockCount?: number; // nombre de locks
  crownSince?: string; // ISO — naissance de la couronne (≠ since, date d'entrée au CRM)
  preferredMaster?: string;
  recoProductId?: string; // produit de la Gamme recommandé par la maison — affiché au Carnet de Suivi
  /** CE QU'ELLE EST VENUE CHERCHER, dit par elle au quiz de Ma Couronne
      (longueur · éclat · protection · changement). La DERNIÈRE seulement : une
      envie est du jour, pas une étiquette qu'on empile — `envieAt` dit quand
      elle l'a dite, pour qu'une réponse de mars ne passe pas pour celle
      d'aujourd'hui. Écrite par la cliente, jamais par la Maison. */
  envie?: EnvieKey;
  envieAt?: string; // ISO
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
  /** CE QUE LE QUIZ PROPOSE AUX TÊTES DE CET ARCHÉTYPE, envie par envie.

      La désignation vivait à la Régie, une seule pour toute la Maison : la même
      réponse à une Initiée qui découvre et à une Souveraine de dix ans. Elle
      vit ici parce qu'un persona, c'est précisément ce qui distingue une
      cliente d'une autre — six réglages au lieu de cent quatre-vingt-six, et
      une nouvelle cliente hérite du sien dès qu'elle est classée.

      Rien de désigné = on retombe sur la Régie (`VitrineConfig.recoParEnvie`),
      puis sur rien du tout. Voir `shared/reco.ts` pour la cascade complète. */
  recoParEnvie?: Partial<Record<EnvieKey, string>>;
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

/* ---------- Les clientes de passage ----------
   Un seul prédicat pour toute la Maison. Chaque écran qui compte des TÊTES
   (têtes couronnées, têtes actives, nouvelles du mois, audience d'une relance)
   passe par lui ; aucun écran qui compte de l'ARGENT ou du TRAVAIL ne le
   regarde — le rituel d'une passante vaut exactement celui d'une autre. */

export const estDePassage = (c: Pick<Client, 'dePassage'>): boolean => c.dePassage === true;

/* ---------- Les VISITEURS — un compte, aucune venue ----------

   Ouvrir un compte sur Ma Couronne crée une fiche pleine (`ensureClient`) :
   quelqu'un qui s'inscrit, regarde et s'en va entrait au CRM comme une
   fidèle. Ces fiches gonflaient « Têtes couronnées » et écrasaient la
   rétention — constaté le 11 août 2026 sur une vingtaine de comptes.

   ON NE POSE AUCUNE MARQUE, on corrige la DÉFINITION : une tête est
   couronnée quand la Maison l'a réellement couronnée, c'est-à-dire quand elle
   s'est assise au moins une fois. Rien à entretenir, rien à migrer, et le
   visiteur devient une tête le jour de sa première venue — sans qu'on ait à
   y penser.

   `venues` est le SET rendu par `tetesVenues` (shared/agenda.ts) ; on le
   passe en argument plutôt que d'importer l'agenda ici, pour ne pas nouer
   les deux couches. */

export const estCouronnee = (c: Pick<Client, 'id' | 'dePassage'>, venues: ReadonlySet<string>): boolean =>
  !estDePassage(c) && venues.has(c.id);

/** Un compte sans aucune venue — ni tête couronnée, ni passante. */
export const estVisiteur = (c: Pick<Client, 'id' | 'dePassage'>, venues: ReadonlySet<string>): boolean =>
  !estDePassage(c) && !venues.has(c.id);

/** IDENTITÉ MINIMALE — prénom et téléphone, rien d'autre.

    Demander une date de naissance à qui ne reviendra pas gaspille le seul
    moment où elle est là. Les champs absents ne sont pas vides par oubli :
    ils sont vides parce qu'on n'a pas le droit de retenir le comptoir pour
    les remplir. Ils se complètent d'eux-mêmes si elle revient. */
export function clienteDePassage(input: {
  branchId: string;
  name: string;
  phone?: string;
  city?: string;
  since: string;
  persona: string;
}): Client {
  return {
    id: uid(),
    branchId: input.branchId,
    name: input.name.trim(),
    phone: (input.phone ?? '').trim(),
    city: (input.city ?? '').trim(),
    persona: input.persona,
    since: input.since,
    segments: [],
    priceCoef: 1,
    loyaltyPoints: 0,
    dePassage: true,
  };
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
