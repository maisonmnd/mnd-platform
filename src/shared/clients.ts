import { createStore, useStore, uid, HOUSE_BLANK } from './store';
import { type EnvieKey } from './quiz';
/* Import sans cycle : accounts.ts n'importe d'ici que des TYPES (effacés à
   l'exécution) — le runtime ne boucle pas. */
import { estMineur } from './accounts';

/* Têtes couronnées — CRM 360. Toutes les entités portent `branchId` :
   la branche sélectionnée filtre tout. */

export type Client = {
  id: string;
  branchId: string;
  name: string;
  phone: string;
  /** Un second numéro, facultatif — un mari, une sœur, une ligne WhatsApp à
      part. Le premier reste le contact principal (messages, rappels) ; celui-ci
      n'est qu'un recours, appelable et joignable sur WhatsApp depuis la fiche. */
  phone2?: string;
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
  /** ELLE A DÉJÀ ÉTÉ DE PASSAGE — la mémoire de la marque (26 août).

      La marque ne savait que se lever : une facture supprimée, un rituel
      dés-honoré, et une tête revenue à UNE seule venue restait « de la Maison »,
      gonflant les têtes couronnées. La reposer sur tout le monde était exclu
      (une nouvelle inscrite n'a aucune venue sans être de passage pour autant,
      et un carnet mal chargé marquerait des fidèles).

      Ce témoin tranche : SEULE une tête qui l'a déjà été peut le redevenir, si
      ses venues retombent sous le seuil. Posé quand la marque est levée — par
      le hook comme à la main — et jamais retiré. */
  futDePassage?: boolean;
  /** CE QU'ELLE PEUT EMPORTER SANS PAYER (26 août) — le plafond de crédit
      accordé à CETTE tête, en XOF. Le comptoir est prévenu quand un
      encaissement le ferait dépasser.

      ABSENT = AUCUN CRÉDIT, et c'est le bon défaut : le crédit s'accorde
      nommément, il ne se suppose pas. Une Maison qui autoriserait par défaut
      découvrirait ses créances après coup. */
  plafondCreditXof?: number;
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
  /** LE NOMBRE DE LOCKS QU'ELLE DÉCLARE ELLE-MÊME au tunnel de réservation,
      tant que la Maison n'a pas compté (`lockCount` vide). Il ne sert qu'à la
      DURÉE du créneau — jamais au prix : une cliente ne peut pas s'auto-tarifer.
      Le comptage de la Maison, quand il arrive, l'emporte sans discussion. */
  lockCountDeclare?: number;
  /** ── LA MARGE DE CALIBRE — 1er septembre 2026 ──────────────────
      « Une marge de 10 locks que je peux appliquer ou non sur la fiche des
      clientes pour qu'elles ne paient pas le prix supérieur » (Yéman).

      Portée à QUINZE locks le 1er septembre. Le chiffre vit dans
      `MARGE_CALIBRE_LOCKS`, jamais recopié ici.

      À 350 locks elle est Micro, à 351 elle est Nano et paie un cran plus
      cher pour UN lock. Le comptage n'a pas cette précision : deux personnes
      qui comptent la même tête ne tombent pas au lock près.

      ABSENT = PAS DE MARGE. C'est un geste qui se donne tête par tête, il ne
      s'applique jamais tout seul. Voir `calibreDeLaTete`. */
  margeCalibre?: boolean;
  crownSince?: string; // ISO — naissance de la couronne (≠ since, date d'entrée au CRM)
  /** LE JOUR OÙ ELLE PEUT VENIR — 16 août 2026, demande de Yéman : « il y a
      des clientes qui ne veulent venir que le samedi ». Un chiffre de la
      semaine JavaScript (0 = dimanche … 6 = samedi).

      Il ne BLOQUE rien : le comptoir pose un rendez-vous le jour qu'il veut, et
      elle réserve le créneau qu'elle veut sur Ma Couronne. Il commande la
      PRÉDICTION — « quand la Maison l'attend » se pose alors sur son jour, au
      premier qui suit l'échéance. Prédire un mardi à qui ne vient que le
      samedi, c'était relancer sur une date qu'elle allait refuser. */
  jourPrefere?: number;
  /** ══ SA CADENCE, ET LA REPRISE AUTOMATIQUE — 3 septembre 2026 ═══════

      « Lorsque je finis un RDV pour une cliente, est-ce que le RDV suivant,
      selon la programmation 4, 6, 8 ou 10 semaines, une fois coché, peut
      automatiquement poser le RDV suivant ? » (Yéman).

      LE RYTHME VIT SUR LA TÊTE, PAS SUR LE RENDEZ-VOUS. C'est une propriété
      d'elle — sa pousse, ses habitudes, son emploi du temps — et la reposer à
      chaque clôture reviendrait à la redemander douze fois par an.

      `rythmeSemaines` seul ne fait RIEN : il informe. C'est `repriseAuto` qui
      arme le geste. Les séparer laisse noter la cadence d'une tête sans lui
      poser des rendez-vous dans le dos, ce qui est le cas le plus fréquent. */
  rythmeSemaines?: number;
  repriseAuto?: boolean;
  preferredMaster?: string;
  recoProductId?: string; // produit de la Gamme recommandé par la maison — affiché au Carnet de Suivi
  /** CE QU'ELLE EST VENUE CHERCHER, dit par elle au quiz de Ma Couronne
      (longueur · éclat · protection · changement). La DERNIÈRE seulement : une
      envie est du jour, pas une étiquette qu'on empile — `envieAt` dit quand
      elle l'a dite, pour qu'une réponse de mars ne passe pas pour celle
      d'aujourd'hui. Écrite par la cliente, jamais par la Maison. */
  envie?: EnvieKey;
  envieAt?: string; // ISO
  birthday?: string; // ISO — anniversaire de la cliente (voir joursAvantAnniversaire)
  birthdayGiftAt?: string; // ISO — date du dernier cadeau anniversaire envoyé
  geo?: { lat: number; lng: number }; // position GPS partagée (livraison Ma Couronne)
  /** Compte famille auquel la cliente est rattachée (ex. Famille A.). Le
      porte-monnaie d'avoir et le paiement des factures vivent alors sur le compte
      famille — c'est le parent payeur qui règle. Absent = compte individuel. */
  familyId?: string;
  /** Modules de Ma Couronne DÉSACTIVÉS pour cette cliente (réglés à la Vitrine du
      Trône) : 'reserver' · 'compose' · 'suivi' · 'gamme' · 'cercle' · 'offres'.
      Absent/vide = tout est ouvert. Accueil et Profil ne se coupent jamais. */
  hiddenModules?: string[];
  /** SON TAPIS DE CUIVRE (12 août) : les masques INDIVIDUELS de la vitrine —
      ateliers, prestations et produits que la régie éteint POUR ELLE. La
      config globale du miroir reste le socle de la Maison ; ces masques s'y
      ajoutent. Le juge unique est `catalogueVisiblePour` (shared/bridges). */
  vitrineMasques?: { categories?: string[]; services?: string[]; products?: string[]; plans?: string[] };
};

/** Compte famille — regroupe plusieurs clientes sous un même compte payeur. */
export type Family = {
  id: string;
  branchId: string;
  name: string; // « Famille A. »
  payerClientId?: string; // le parent payeur (une des clientes rattachées, ou une fiche dédiée)
  note?: string;
  /** LA REMISE FAMILLE (%) — l'avantage du compte, posé d'office sur les
      rendez-vous de ses membres (HORS FORFAITS, déjà réduits) et nommé
      « Remise famille » partout où il s'écrit (modale RDV, facture).
      ABSENT = le BARÈME DU FOYER décide (1 enfant → 10, 2 et plus → 15).
      Un taux posé est une remise PERSONNALISÉE et fait foi ;
      0 = ce compte n'a pas de remise. Le juge unique est `remiseFamillePct`. */
  remisePct?: number;
};

/** Le plafond du barème — et le taux proposé par défaut dans l'éditeur. */
export const REMISE_FAMILLE_DEFAUT = 15;

/** LE juge de la remise famille — toute surface qui l'applique passe par ici.
    Pas de famille → 0. Un taux POSÉ fait foi (personnalisé, 0 = coupée).
    Famille muette → LE BARÈME DU FOYER (14 août, décision de Yéman) :
    1 enfant mineur rattaché → 10 %, 2 et plus → 15 %, aucun → 0.
    Elle ne porte JAMAIS sur les forfaits — déjà réduits par construction ;
    ce sont les surfaces d'application qui excluent leur part (part hors
    forfaits × taux, en francs exacts). */
export const remiseFamillePct = (
  f: Family | null | undefined,
  clients: readonly Pick<Client, 'id' | 'familyId' | 'birthday' | 'archived'>[],
  aujourdhui: string,
): number => {
  if (!f) return 0;
  const p = Number(f.remisePct);
  if (Number.isFinite(p)) return Math.max(0, Math.min(100, Math.round(p)));
  const enfants = clients.filter((c) =>
    c.familyId === f.id && c.id !== f.payerClientId && !c.archived && estMineur(c, aujourdhui)).length;
  return enfants >= 2 ? 15 : enfants === 1 ? 10 : 0;
};

/** Styles de couronne par défaut — la liste est éditable (crownStylesStore).
    LA NOMENCLATURE DE LA MAISON (Yéman, 13 août) : la finesse des locks,
    du plus épais au plus fin — les mêmes mots que les calibres du Juste
    Prix, plus les Traditionnelles. La liste d'usine du prototype proposait
    des couronnes que le salon ne pratique pas. */
export const CROWN_STYLES_DEFAULT = [
  'Jumbo', 'Traditionnelles', 'Medium', 'Mini', 'Micro', 'Nano', 'Galaxy',
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
  essence: 'Elle franchit le seuil, la maison l’accueille, l’observe, et attend de la connaître.',
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

/* ── LES PRIX CONVENUS — 22 août 2026 ───────────────────────────────
   Un prix convenu (`prixFixes`) est un accord passé avec UNE tête, prestation
   par prestation : il passe AVANT le barème, le plancher, le tarif au lock et
   le Juste Prix. C'est un engagement de la Maison — et un engagement se relit.

   UN SEUL PRÉDICAT POUR TOUTE LA MAISON, comme `estDePassage` : le filtre du
   CRM, un futur relevé des accords et tout écran qui posera la question
   doivent répondre le même nombre. Deux comptages, ce serait deux vérités.

   Une valeur ≤ 0 n'est pas un accord : à zéro franc, cela se dit « offert »,
   pas « prix fixe ». Une fiche dont tous les accords ont été remis à zéro sort
   donc de la liste d'elle-même, sans qu'on ait à nettoyer le champ. */
export const comptePrixConvenus = (c: Pick<Client, 'prixFixes'>): number =>
  Object.values(c.prixFixes ?? {}).filter((v) => typeof v === 'number' && v > 0).length;

export const aUnPrixConvenu = (c: Pick<Client, 'prixFixes'>): boolean =>
  comptePrixConvenus(c) > 0;

/** Nombre de venues honorées à partir duquel une tête cesse d'être de passage. */
export const VENUES_POUR_REVENIR = 2;

export type TetePassage = Pick<Client, 'id' | 'dePassage' | 'futDePassage'>;

/** CE QUE LA MARQUE « DE PASSAGE » DOIT DEVENIR (26 août) — décision PURE, pour
    qu'elle soit éprouvée par un harnais plutôt que devinée dans un effet React.

    Trois mouvements, et pas un de plus :
    · elle revient (≥ seuil) → la marque se lève, et la Maison s'en souvient ;
    · elle retombe (< seuil) ET l'a déjà portée → la marque revient ;
    · elle la porte sans souvenir → on note le souvenir, sans rien changer.

    Une tête qui n'a JAMAIS été de passage n'est jamais marquée par cette
    machine : c'est ce qui protège les nouvelles inscrites et les fidèles dont
    le carnet aurait mal chargé. */
export function mouvementsDePassage(
  clients: readonly TetePassage[],
  venuesDe: (id: string) => number,
  seuil: number = VENUES_POUR_REVENIR,
): { promues: Set<string>; rendues: Set<string>; aMemoriser: Set<string> } {
  const promues = new Set<string>();
  const rendues = new Set<string>();
  const aMemoriser = new Set<string>();
  for (const c of clients) {
    const venues = venuesDe(c.id);
    if (estDePassage(c)) {
      if (venues >= seuil) promues.add(c.id);
      else if (!c.futDePassage) aMemoriser.add(c.id);
    } else if (c.futDePassage && venues < seuil) {
      rendues.add(c.id);
    }
  }
  return { promues, rendues, aMemoriser };
}

/* ---------- Les clientes de passage ----------
   Un seul prédicat pour toute la Maison. Chaque écran qui compte des TÊTES
   (têtes couronnées, têtes actives, nouvelles du mois, audience d'une relance)
   passe par lui ; aucun écran qui compte de l'ARGENT ou du TRAVAIL ne le
   regarde — le rituel d'une passante vaut exactement celui d'une autre. */

export const estDePassage = (c: Pick<Client, 'dePassage'>): boolean => c.dePassage === true;

/** LA DIASPORA — UN SEUL JUGE, ENFIN (16 août 2026).

    La notion vivait à DEUX endroits, et le commentaire de `dePassage`
    ci-dessus le disait déjà : le CHAMP `diaspora` (lu par les signaux de
    persona) et le SEGMENT « Diaspora » (lu par le registre des Clientes).
    Deux vérités pour une notion, donc un compteur qui annonçait « Diaspora 1 »
    pendant que la Maison en reconnaissait cinquante.

    Ici on lit LES DEUX et on ne casse rien : une fiche marquée d'un côté ou de
    l'autre est de la diaspora. Les nouveaux marquages écrivent le CHAMP —
    un segment se renomme et s'efface depuis une liste, et le prédicat
    casserait en silence.

    CE QUE ÇA COMMANDE : on ne prédit pas le retour de quelqu'un qui vit
    ailleurs. Elle vient quand elle est au pays ; sa cadence ne dit rien, et la
    relance qu'on lui envoie ne fait que noyer les vraies (demande de Yéman —
    la moitié de « celles qui ont glissé » était de la diaspora). */
export const estDiaspora = (c: Pick<Client, 'diaspora' | 'segments'>): boolean =>
  c.diaspora === true || (c.segments ?? []).some((s) => s.trim().toLowerCase() === 'diaspora');

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

/** JOURS AVANT LE PROCHAIN ANNIVERSAIRE — 0 le jour même, en dates LOCALES
    (jamais un slice d'UTC : à Cotonou la nuit comptable ne se coupe pas en
    deux). UN seul juge : la liste des Clientes (badge « ANNIV. J-N ») et le
    rappel « joyeux anniversaire » de Ce qui presse doivent compter pareil. */
export const joursAvantAnniversaire = (birthdayIso: string): number => {
  const [, m, d] = birthdayIso.split('-').map((x) => parseInt(x, 10));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = new Date(today.getFullYear(), (m || 1) - 1, d || 1);
  if (next.getTime() < today.getTime()) next.setFullYear(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / 86400000);
};

/** Un compte sans aucune venue — ni tête couronnée, ni passante.
    UNE FICHE RATTACHÉE À UNE FAMILLE N'EST JAMAIS « VISITEUR » (12 août) :
    un enfant déclaré et validé (Ezra, Togni, Tobi…) n'a encore aucune venue,
    mais il est une tête de la Maison par son foyer — le classer visiteur le
    faisait DISPARAÎTRE du registre La Maison avec les comptes anonymes. */
export const estVisiteur = (c: Pick<Client, 'id' | 'dePassage' | 'familyId'>, venues: ReadonlySet<string>): boolean =>
  !estDePassage(c) && !venues.has(c.id) && !c.familyId;

/** Une tête du REGISTRE de la Maison : couronnée (venue au moins une fois),
    OU membre d'un compte famille pas encore assis — la relation existe par le
    foyer. Ne gonfle PAS le compteur des têtes couronnées, qui reste
    `estCouronnee` : ici on liste la relation, là-bas on compte les venues. */
export const estDeLaMaison = (c: Pick<Client, 'id' | 'dePassage' | 'familyId'>, venues: ReadonlySet<string>): boolean =>
  estCouronnee(c, venues) || (!!c.familyId && !estDePassage(c) && !venues.has(c.id));

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
    futDePassage: true,
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
