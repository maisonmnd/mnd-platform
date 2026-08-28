/* ── PAYER EN PLUSIEURS FOIS — 28 août 2026 ───────────────────────────
   « Mets un système de paiements en 2 ou 4 fois pour les abonnements au-delà
   de 100 000 F » (Yéman).

   Un abonnement annuel ou un pack à 125 000 F se heurte à un mur : peu de
   têtes sortent cette somme d'un coup, et la Maison perd la vente entière
   faute d'avoir su la découper. L'échéancier est donc un OUTIL DE VENTE avant
   d'être un outil comptable.

   TROIS RÈGLES QUI NE SE DEVINENT PAS :

   ① LE SEUIL EST UNE PORTE, PAS UNE OBLIGATION. En dessous de 100 000 F, on
     ne découpe pas : quatre échéances de 8 750 F coûtent plus cher à suivre
     qu'elles ne rapportent, et elles habituent la Maison à courir après des
     miettes.

   ② L'ARRONDI VA SUR LA PREMIÈRE. 125 000 F en 4 fois donne 31 250 F pile ;
     mais 35 000 F en 4 fois donne 8 750 F, et 100 001 F en 2 fois donnerait
     deux fois 50 000,5 F. On arrondit chaque part à l'entier et on pose le
     RESTE sur la première : la Maison encaisse le franc en trop tout de
     suite, la dernière échéance n'est jamais plus lourde qu'annoncé, et la
     somme des parts vaut EXACTEMENT le total. Un centime perdu à l'arrondi
     se retrouve un an plus tard en écart de caisse inexplicable.

   ③ LES RÈGLEMENTS S'IMPUTENT DANS L'ORDRE, la plus vieille échéance
     d'abord. C'est la règle de tout créancier, et c'est la seule qui permette
     de dire « elle a deux échéances de retard » sans se tromper. Un versement
     qui déborde coule sur la suivante.

   RIEN N'EST STOCKÉ DE CE QUI SE CALCULE. L'échéancier (les dates et les
   montants) est écrit une fois à la signature ; l'état de chaque échéance,
   lui, se dérive des règlements à chaque lecture. Un « payé » stocké à côté
   de ses versements finit toujours par les contredire. */

/** Au-delà de ce montant, la Maison propose de découper. */
export const SEUIL_ECHELONNEMENT_XOF = 100_000;

/** Les découpes offertes. Deux ou quatre, jamais trois : la moitié et le
    quart se disent au comptoir, le tiers ne se dit pas. */
export const DECOUPES = [2, 4] as const;
export type Decoupe = (typeof DECOUPES)[number];

export type Echeance = {
  /** Rang, à partir de 1 — c'est ainsi qu'on en parle : « la deuxième ». */
  numero: number;
  /** Jour où elle est attendue (ISO). */
  dueIso: string;
  amountXof: number;
};

/** Un abonnement peut-il être découpé ? */
export const peutEtreEchelonne = (totalXof: number): boolean =>
  totalXof > SEUIL_ECHELONNEMENT_XOF;

const addDays = (iso: string, days: number): string =>
  new Date(new Date(`${iso}T12:00:00`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

/** L'ÉCHÉANCIER, écrit une fois à la signature.
    La première échéance tombe le jour même : on n'accorde pas un crédit qui
    commence par un délai, la tête repart déjà avec quelque chose de réglé. */
export function construitEcheancier(
  totalXof: number, parts: Decoupe, departIso: string, joursEntre = 30,
): Echeance[] {
  const total = Math.max(0, Math.round(totalXof));
  if (total === 0) return [];
  const base = Math.floor(total / parts);
  const reste = total - base * parts;
  return Array.from({ length: parts }, (_, i) => ({
    numero: i + 1,
    dueIso: i === 0 ? departIso : addDays(departIso, joursEntre * i),
    /* Le reste sur la PREMIÈRE — voir règle ②. */
    amountXof: i === 0 ? base + reste : base,
  }));
}

export type EtatEcheance = Echeance & {
  regleXof: number;
  resteXof: number;
  soldee: boolean;
  /** Échue et non soldée au jour de lecture. */
  enRetard: boolean;
  /** Jours depuis l'échéance quand elle est en retard, 0 sinon. */
  retardJours: number;
};

const jours = (deIso: string, aIso: string): number =>
  Math.max(0, Math.round(
    (new Date(`${aIso}T12:00:00`).getTime() - new Date(`${deIso}T12:00:00`).getTime()) / 86_400_000,
  ));

/** L'ÉTAT DE CHAQUE ÉCHÉANCE, dérivé des règlements — jamais stocké.
    Les versements s'imputent dans l'ordre, la plus vieille échéance d'abord
    (règle ③) ; ce qui déborde coule sur la suivante. */
export function etatDesEcheances(
  echeances: readonly Echeance[], verseXof: number, aujourdhui: string,
): EtatEcheance[] {
  let reserve = Math.max(0, verseXof);
  return [...echeances]
    .sort((a, b) => a.numero - b.numero)
    .map((e) => {
      const pris = Math.min(reserve, e.amountXof);
      reserve -= pris;
      const reste = e.amountXof - pris;
      const echue = e.dueIso <= aujourdhui;
      return {
        ...e,
        regleXof: pris,
        resteXof: reste,
        soldee: reste === 0,
        enRetard: reste > 0 && echue,
        retardJours: reste > 0 && echue ? jours(e.dueIso, aujourdhui) : 0,
      };
    });
}

/** Ce qu'il reste à encaisser sur tout l'échéancier. */
export const resteDeLEcheancier = (etats: readonly EtatEcheance[]): number =>
  etats.reduce((s, e) => s + e.resteXof, 0);

/** Ce qui est ÉCHU et toujours impayé — le seul chiffre qui justifie une relance. */
export const enRetardXof = (etats: readonly EtatEcheance[]): number =>
  etats.reduce((s, e) => (e.enRetard ? s + e.resteXof : s), 0);

/** La prochaine échéance à réclamer : la plus ancienne non soldée. */
export const prochaineEcheance = (etats: readonly EtatEcheance[]): EtatEcheance | undefined =>
  etats.find((e) => !e.soldee);

/** Le retard le plus ancien, en jours — donne son ton au dossier. */
export const plusVieuxRetardJours = (etats: readonly EtatEcheance[]): number =>
  etats.reduce((m, e) => Math.max(m, e.retardJours), 0);

/** Un versement qui DÉBORDE l'échéancier : elle a payé plus que tout le dû.
    Ce n'est pas une erreur (avance, arrondi de la main), mais il faut le voir. */
export const tropVerseXof = (echeances: readonly Echeance[], verseXof: number): number =>
  Math.max(0, Math.max(0, verseXof) - echeances.reduce((s, e) => s + e.amountXof, 0));
