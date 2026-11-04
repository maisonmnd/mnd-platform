/* ══ LA CLÔTURE DE GRENAT — 4 novembre 2026 ══════════════════════════════
   « Tous les jours à 15 h et à 19 h, qu'Opale clôture toutes les factures,
   qu'elles soient terminées, envoyées aux clients, et qu'on puisse faire la
   caisse du jour. Crée un système clair où il n'y a pas d'erreur sur les RDV
   et sur les factures » (Yéman, 4 novembre 2026), puis « relier ce travail
   avec la caisse du jour que nous tenons dans le Trône ». Maquette
   9KCMgAb1qksSVcEXDiKaHE validée (« construis ») : c'est GRENAT, le
   professionnel de l'argent, qui porte la clôture ; Opale garde les messages.

   LES SIX RÈGLES D'UNE JOURNÉE CLOSE, toutes ici :
     1. chaque rendez-vous passé (heure + durée) a son état final : honoré,
        absente ou annulé ; plus aucun « confirmé » après sa fin ;
     2. chaque rendez-vous honoré a UNE facture, au même prix que lui, et le
        même argent des deux côtés (le Carnet et la pièce) ;
     3. chaque remise est permise : une seule remise, et une place limitée
        seulement sur un jour vide ;
     4. chaque facture terminée part une fois à la cliente, par la salle
        d'attente, sauf « Pas de reçu ni de facture par WhatsApp » ;
     5. une facture payée effacée est une alarme, et l'argent reçu reste
        compté jusqu'à ce que la direction tranche ;
     6. la caisse du jour, c'est l'argent reçu ce jour (versements datés du
        jour, toutes pièces), par moyen et par tiroir.

   CE QUE GRENAT FAIT SEUL, trois gestes sûrs et rien d'autre : envoyer le
   papier pas encore parti (par la salle, jamais en direct), passer « honoré »
   un rendez-vous entièrement réglé encore « confirmé », relier une facture à
   son rendez-vous quand un seul candidat existe (même cliente, même jour,
   même prix). Jamais seul : dire venue, absente ou annulée, toucher un prix,
   une remise, un paiement, effacer ou annuler une pièce, encaisser.

   CE MODULE EST PUR, sans import : le bloc ⟨cloture-du-jour⟩ ci-dessous est
   recopié À LA LETTRE dans la fonction `cloture-du-jour` (une fonction Edge
   ne lit rien du dépôt). Le banc `verifie-la-cloture-du-jour` éprouve la
   règle, confronte ses petites copies (la durée d'un rendez-vous, la famille
   d'un moyen, l'ouverture du jour, le reçu du jour) à leurs originaux, et
   compare la copie de la fonction à ce fichier. Le Trône l'importe tel quel :
   l'écran « La journée » et le serveur jugent avec la même règle. */

/* ⟨cloture-du-jour⟩ */
export const VERSION_DE_LA_CLOTURE = '2026-11-04-a';

/** Cotonou vit à UTC + 1, toute l'année. */
export const DECALAGE_DE_COTONOU_MIN = 60;

/** Les heures de la clôture quand rien n'est réglé : 15 h et 19 h. */
export const HEURES_DE_LA_CLOTURE_PAR_DEFAUT: readonly number[] = [15, 19];

/** LES HEURES RÉGLÉES (Système › Paramètres, `mnd_settings.cloture.heures`),
    bornées de 8 h à 23 h, sans doublon, dans l'ordre ; deux au plus. Une
    liste vide ou illisible rend les heures par défaut. */
export function heuresDeLaCloture(reglage: unknown): number[] {
  const brut = Array.isArray(reglage) ? reglage : [];
  const vues = [...new Set(brut.map((h) => Number(h)).filter((h) => Number.isInteger(h) && h >= 8 && h <= 23))].sort((a, b) => a - b);
  return vues.length ? vues.slice(0, 2) : [...HEURES_DE_LA_CLOTURE_PAR_DEFAUT];
}

/** Un instant lu à Cotonou : son jour, son heure, ses minutes depuis minuit. */
export function aCotonouLe(ms: number): { jour: string; heure: number; minutes: number; jourDeLaSemaine: number } {
  const d = new Date(ms + DECALAGE_DE_COTONOU_MIN * 60_000);
  return { jour: d.toISOString().slice(0, 10), heure: d.getUTCHours(), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), jourDeLaSemaine: d.getUTCDay() };
}

/** « 14:30 » → 870 ; `null` quand l'heure ne se lit pas. */
export const minutesDeLHeure = (hhmm: unknown): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]); const mm = Number(m[2]);
  return h <= 23 && mm <= 59 ? h * 60 + mm : null;
};

/** « 15 h 00 », « 9 h 30 » : l'heure telle que la clôture la dit. */
export const heureEnClair = (minutes: number): string => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

/** « 45 000 F » : les francs, sans devise étrangère (la clôture compte en XOF). */
export const francsDits = (xof: number): string => {
  const n = Math.round(Number(xof) || 0);
  const signe = n < 0 ? '−' : '';
  return `${signe}${String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;
};

/** Les initiales d'une cliente, jamais son nom : « A. M. G. P. », « J.-L. ». */
export function initialesDe(nom: unknown): string {
  const mots = String(nom ?? '').trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return 'Cliente';
  return mots.map((mot) => mot.split('-').filter(Boolean).map((p) => `${p.charAt(0).toUpperCase()}.`).join('-')).join(' ');
}

/* ── LA DURÉE, LE PRIX, L'ARGENT D'UN RENDEZ-VOUS ─────────────────────── */

/** Ce que la durée lit d'une prestation du catalogue. */
export type PrestationLue = { durationMin?: number; dureeParLongueur?: Partial<Record<string, number>> };

/** LA DURÉE D'UN RENDEZ-VOUS, la même règle que `dureeDuRendezVous`
    (agenda-pur.ts) : ce qui est écrit sur le rendez-vous fait foi, sinon la
    grille par longueur, sinon le catalogue, une heure si rien ne se lit. */
export function dureeLue(
  a: { dureeMin?: number; serviceIds?: readonly string[]; longueur?: string },
  prestations: ReadonlyMap<string, PrestationLue>,
): number {
  return a.dureeMin
    || (a.serviceIds ?? []).map((id) => prestations.get(id)).filter((s): s is PrestationLue => !!s).reduce(
      (somme, s) => somme + ((a.longueur ? s.dureeParLongueur?.[a.longueur] : undefined) ?? (Number(s.durationMin) || 0)),
      0,
    ) || 60;
}

/** Un versement tel que la clôture le lit (du Carnet ou de la pièce). */
export type VersementLu = {
  id?: string; date?: string; amountXof?: number; method?: string; cashbox?: string; time?: string;
  invoiceId?: string; note?: string; encaissePar?: string;
};

/** Le rendez-vous tel que la clôture le lit. `prixXof` : son prix net, quand
    on le connaît (le Trône le lit comme le Carnet, le serveur seulement s'il
    est figé) ; `dureeMin` : sa durée résolue ; `qui` : le nom à réduire en
    initiales ; `libelle` : ses gestes, dits. */
export type RdvLu = {
  id: string; branchId?: string; clientId?: string; qui?: string; libelle?: string;
  date: string; time?: string; dureeMin?: number; status?: string;
  absente?: { le?: string } | null; annuleePar?: string;
  invoiceId?: string; payments?: VersementLu[]; paidXof?: number;
  depositXof?: number; depositConfirmed?: boolean;
  prixXof?: number;
  /* Ce qu'il porte de remises. */
  codeOffre?: string; offreId?: string; remiseFamille?: boolean; remiseFamilleXof?: number;
  discountPct?: number; discountXof?: number; remiseDuComptoirXof?: number;
  remisesLignes?: ({ pct?: number; xof?: number } | null)[];
  forfait?: { totalXof?: number } | null; subId?: string; coverKind?: string; sinsinOffert?: boolean;
  seriesIndex?: number; creeLe?: string;
  /** Passé honoré par Grenat : le Trône en fait les suites (points, stock, reprise). */
  honoreParGrenat?: { le?: string } | null;
};

/** Le prix net d'un rendez-vous dont le prix est FIGÉ (`priceXof`), la même
    lecture qu'`apptNetXof` : séance de suite à zéro, forfait, prix moins la
    remise du rendez-vous. Sans prix figé : `undefined`, le prix ne se devine
    pas (le serveur ne lit pas le tarif de la tête). */
export function prixFigeLu(a: { priceXof?: unknown; seriesIndex?: number; forfait?: { totalXof?: number } | null; discountPct?: number; discountXof?: number }): number | undefined {
  if (a.seriesIndex && a.seriesIndex > 1) return 0;
  if (a.forfait) return Math.max(0, Math.round(Number(a.forfait.totalXof) || 0));
  if (typeof a.priceXof !== 'number' || !Number.isFinite(a.priceXof)) return undefined;
  return Math.max(0, Math.round(a.priceXof * (1 - (Number(a.discountPct) || 0) / 100)) - (Number(a.discountXof) || 0));
}

/** L'argent du Carnet : le journal des versements, sinon `paidXof`. */
export const argentDuCarnet = (a: Pick<RdvLu, 'payments' | 'paidXof'>): number =>
  a.payments?.length ? a.payments.reduce((s, p) => s + (Number(p.amountXof) || 0), 0) : Number(a.paidXof) || 0;

/** L'acompte reconnu reçu. */
export const acompteRecu = (a: Pick<RdvLu, 'depositXof' | 'depositConfirmed'>): number =>
  a.depositConfirmed ? Math.max(0, Number(a.depositXof) || 0) : 0;

/** Ce qui reste dû, quand le prix est connu. */
export const resteDuRdv = (a: RdvLu): number | undefined =>
  typeof a.prixXof === 'number' ? Math.max(0, a.prixXof - argentDuCarnet(a) - acompteRecu(a)) : undefined;

/** ENTIÈREMENT RÉGLÉ : un prix connu, de l'argent reçu, plus rien dû. */
export const estEntierementRegle = (a: RdvLu): boolean =>
  typeof a.prixXof === 'number' && a.prixXof > 0 && argentDuCarnet(a) + acompteRecu(a) > 0 && resteDuRdv(a) === 0;

/* ── LA PIÈCE ─────────────────────────────────────────────────────────── */

export type LigneLue = { qty?: number; unitXof?: number; discountPct?: number; discountXof?: number; produitId?: string; label?: string };

export type PieceLue = {
  id: string; branchId?: string; kind?: string; number?: string; clientId?: string; forClientId?: string; clientName?: string;
  date?: string; lines?: LigneLue[]; globalDiscountPct?: number; globalDiscountXof?: number; discountLabel?: string;
  status?: string; payment?: string; payments?: VersementLu[]; cashbox?: string; time?: string;
  apptId?: string; pourboireDe?: string; tipXof?: number; creeeLe?: string;
  whatsapp?: { partieLe?: string; modele?: string } | null;
  /** Posé par la direction juste avant l'effacement (0156) : le motif écrit. */
  effacement?: { motif?: string; par?: string; le?: string } | null;
};

const ligneNette = (l: LigneLue): number =>
  Math.max(0, (Number(l.qty) || 0) * (Number(l.unitXof) || 0) * (1 - (Number(l.discountPct) || 0) / 100) - (Number(l.discountXof) || 0));

/** Le total d'une pièce, la même lecture qu'`invoiceTotal`. */
export function totalDeLaPiece(p: Pick<PieceLue, 'lines' | 'globalDiscountPct' | 'globalDiscountXof'>): number {
  const sous = (p.lines ?? []).reduce((s, l) => s + ligneNette(l), 0);
  return Math.max(0, Math.round(sous * (1 - (Number(p.globalDiscountPct) || 0) / 100)) - (Number(p.globalDiscountXof) || 0));
}

/** La part RITUEL d'une pièce : ses lignes de prestation, la Gamme ôtée. */
export function rituelDeLaPiece(p: Pick<PieceLue, 'lines' | 'globalDiscountPct' | 'globalDiscountXof'>): number {
  const lignes = p.lines ?? [];
  if (!lignes.some((l) => !!l.produitId)) return totalDeLaPiece(p);
  return totalDeLaPiece({ ...p, lines: lignes.filter((l) => !l.produitId) });
}

/** Les versements d'une pièce, la même lecture qu'`invoiceReglements` : une
    pièce d'avant le journal, soldée, en reçoit un d'une entrée. */
export function versementsDeLaPiece(p: PieceLue): VersementLu[] {
  if (p.payments && p.payments.length > 0) return p.payments;
  if (p.status !== 'payée') return [];
  return [{ id: `ip-${p.id}`, date: p.date, amountXof: totalDeLaPiece(p), method: p.payment ?? 'Espèces', cashbox: p.cashbox, time: p.time }];
}

/** L'argent d'une pièce pour son RITUEL : ni l'acompte reçu avant, ni la
    Gamme (`argentHorsDuCarnet`, caisse-du-versement.ts). */
export const argentDuRituelSurLaPiece = (p: PieceLue): number =>
  versementsDeLaPiece(p).filter((v) => v.method !== 'Acompte' && !/^Gamme\b/.test(v.note ?? '')).reduce((s, v) => s + (Number(v.amountXof) || 0), 0);

/** Une pièce PAYÉE : de l'argent y est entré (ou elle se dit soldée). */
export const pieceAPaye = (p: PieceLue): boolean =>
  p.status === 'payée' || versementsDeLaPiece(p).some((v) => (Number(v.amountXof) || 0) > 0);

const estUneFacture = (p: PieceLue): boolean => (p.kind ?? 'facture') === 'facture' && !p.pourboireDe;

/** Les pièces d'un rendez-vous, par l'un des trois liens (`estLieALaPiece`). */
export const piecesDuRdv = (a: RdvLu, pieces: readonly PieceLue[]): PieceLue[] =>
  pieces.filter((p) => estUneFacture(p) && (p.apptId === a.id || a.invoiceId === p.id || (a.payments ?? []).some((v) => v.invoiceId === p.id)));

/* ── LE MOYEN ET LE TIROIR ────────────────────────────────────────────── */

/** LA FAMILLE D'UN MOYEN, la même que `familleDuMoyen` (caisse-du-soir-pur). */
export function familleLue(r: { method?: string; cashbox?: string }): string {
  if (r.cashbox === 'KkiaPay' || /^kkiapay/i.test(r.method ?? '')) return 'KkiaPay, en ligne';
  if (/esp[eè]ces|cash|liquide/i.test(r.method ?? '')) return 'Espèces';
  const m = (r.method ?? '').trim();
  if (/mtn|momo/i.test(m) && /priv[ée]|perso/i.test(m)) return 'MoMo Privé';
  if (/mtn|momo/i.test(m)) return 'MTN MoMo';
  if (/moov/i.test(m)) return 'Moov Money';
  if (/^mobile money$/i.test(m)) return 'Mobile Money';
  return m || 'Autre';
}
const ORDRE_DES_MOYENS = ['Espèces', 'MTN MoMo', 'MoMo Privé', 'Moov Money', 'Mobile Money', 'Carte', 'Virement bancaire', 'KkiaPay, en ligne'];
const rangDuMoyen = (f: string): number => { const i = ORDRE_DES_MOYENS.indexOf(f); return i < 0 ? 50 : i; };

/** Le tiroir d'un versement, la même règle que le journal de caisse. */
export const tiroirDuVersement = (p: PieceLue, v: VersementLu): string => v.cashbox ?? p.cashbox ?? 'Caisse principale';

/* ── L'OUVERTURE DU JOUR ──────────────────────────────────────────────── */

export type HeuresDuJourLues = { key?: string; open?: string; close?: string; closed?: boolean };
export type ExceptionLue = { date?: string; staffId?: string; closed?: boolean };
const CLES_DES_JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];

/** LA MAISON EST-ELLE FERMÉE CE JOUR ? La même lecture qu'`ouvertureDuJour`
    (agenda-pur.ts) : le jour de la semaine réglé, puis l'exception de la
    Maison (sans personne nommée). Jamais supposé : dimanche et lundi sont
    fermés parce que les horaires le disent. */
export function laMaisonEstFermee(jour: string, semaine: readonly HeuresDuJourLues[], exceptions: readonly ExceptionLue[] = []): boolean {
  const dow = new Date(`${jour}T00:00:00Z`).getUTCDay();
  const j = semaine.find((h) => h.key === CLES_DES_JOURS[dow]);
  if (!j || j.closed) return true;
  const ex = exceptions.find((e) => e.date === jour && !e.staffId);
  return !!ex?.closed;
}

/* ── LE REÇU DU JOUR ──────────────────────────────────────────────────── */

/** JAMAIS DE PAPIER POUR UN RATTRAPAGE, la règle de `recuAEnvoyer`
    (recu-whatsapp.ts, « ne pas faire voir mon retard aux clients ») : le
    papier ne part que pour un rituel d'aujourd'hui (ou à venir), et le reçu
    seulement pour l'argent reçu aujourd'hui. */
export const papierDuJour = (o: { jourDuPaiement?: string; jourDuRituel?: string; aujourdhui: string }): boolean =>
  (!o.jourDuPaiement || o.jourDuPaiement === o.aujourdhui) && (!o.jourDuRituel || o.jourDuRituel >= o.aujourdhui);

/* ── LES FAITS ET CE QUI EN SORT ──────────────────────────────────────── */

export type FicheLue = { id: string; nom?: string; sansPapiersWa?: boolean; aUnNumero?: boolean; prixConvenus?: boolean };
export type OffreLue = { id?: string; code?: string; active?: boolean; placesParJour?: number; jourVideSeulement?: boolean };
/** Une pièce effacée, lue dans `traces` (opération « efface » sur invoices). */
export type EffacementLu = { traceId: string; pieceId: string; faitLe: string; par?: string; porte?: string; avant: PieceLue | null };
/** Ce que la direction a tranché : la clé d'un constat ou d'une alarme. */
export type DecisionLue = { cle: string; par?: string; le?: string; mot?: string };
/** Une ligne de la salle d'attente qui porte le papier d'une pièce. */
export type EnvoiDePapierLu = { id: string; type?: string; statut?: string; invoiceId?: string };

export type FaitsDeLaJournee = {
  jour: string;
  maintenantMs: number;
  branchId?: string;
  /** La Maison est fermée ce jour (ses horaires le disent). */
  ferme?: boolean;
  rdvs: readonly RdvLu[];
  pieces: readonly PieceLue[];
  fiches: readonly FicheLue[];
  offres?: readonly OffreLue[];
  effacements?: readonly EffacementLu[];
  decisions?: readonly DecisionLue[];
  envois?: readonly EnvoiDePapierLu[];
};

/** Le type de la ligne d'envoi du papier d'une pièce, et son identifiant :
    une pièce, une seule ligne, jamais deux (la clé primaire tient la porte). */
export const TYPE_DU_PAPIER = 'papier-de-la-piece';
export const idDuPapier = (pieceId: string): string => `env-piece-${pieceId}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 160);
/** La ligne déposée par le serveur, que le Trône prépare (le PDF ne se fait qu'au Trône). */
export const A_PREPARER = 'à-préparer';

export type GesteDuComptoir = 'encaisser' | 'honore' | 'absente' | 'annulee';
export type EtatDuRdv = 'a-venir' | 'en-cours' | 'a-encaisser' | 'sans-etat' | 'regle' | 'a-revoir' | 'clos' | 'annule';

export type ConstatDuRdv = {
  id: string; heure: string; finDite: string; qui: string; libelle?: string;
  etat: EtatDuRdv; etatDit: string; dit: string;
  gestes: GesteDuComptoir[];
  pieceId?: string; numero?: string;
  /** Ce qui reste à revoir, chacun avec sa clé (la direction peut trancher). */
  aRevoir: { cle: string; dit: string }[];
  /** Fini après la dernière clôture du jour : il se relit au mot de 7 h. */
  finMin: number;
};

export type GesteSur =
  | { genre: 'envoyer-le-papier'; cle: string; pieceId: string; rdvId?: string; papier: 'recu' | 'facture'; montantXof: number; dit: string }
  | { genre: 'passer-honore'; cle: string; rdvId: string; dit: string }
  | { genre: 'relier-la-piece'; cle: string; rdvId: string; pieceId: string; dit: string };

export type Alarme = {
  cle: string; traceId: string; pieceId: string; numero: string; faitLe: string; par?: string; motif?: string;
  argentXof: number; argentDuJourXof: number;
  sort: 'perdue' | 'refaite' | 'fondue';
  successeur?: { id: string; numero: string; argentXof: number };
  ecartXof?: number;
  tranchee?: DecisionLue;
  dit: string;
  /** Ouverte tant que la direction n'a pas tranché (une pièce fondue, son argent dans une autre, ne bloque pas). */
  ouverte: boolean;
};

export type CaisseDuJour = {
  totalXof: number; versements: number; pourboiresXof: number;
  parMoyen: { famille: string; totalXof: number }[];
  parTiroir: { tiroir: string; totalXof: number }[];
  /** Encaissé ce jour sur une pièce effacée, pas encore tranché : toujours compté. */
  sortiDesComptesXof: number;
  /** Ce qui reste à encaisser sur les rendez-vous passés et non honorés. */
  resteAEncaisserXof: number; rdvAEncaisser: number;
};

export type ComptesDeLaJournee = {
  rdv: number; clos: number; aVenir: number; enCours: number; aEncaisser: number; sansEtat: number; regles: number;
  aRevoir: number; alarmes: number; gestes: number; papiersEnSalle: number;
};

export type ClotureDuJour = {
  version: string; jour: string; ecriteA: string;
  ferme: boolean;
  rdvs: ConstatDuRdv[];
  pieces: { id: string; numero: string; dit: string; aRevoir: { cle: string; dit: string }[]; papier: 'parti' | 'en-salle' | 'excepte' | 'a-envoyer' | 'sans-numero' | 'sans-objet' }[];
  gestes: GesteSur[];
  alarmes: Alarme[];
  caisse: CaisseDuJour;
  comptes: ComptesDeLaJournee;
  verdict: { close: boolean; dit: string; reste: string[] };
};

const nombreDit = (n: number, un: string, plusieurs: string): string => `${n} ${n > 1 ? plusieurs : un}`;

/** LES REMISES D'UN RENDEZ-VOUS, par nature : la règle « une seule remise »
    (4 novembre 2026) en compte une de trop dès qu'il y en a deux. */
export function remisesDuRdv(a: RdvLu, fiche?: FicheLue): string[] {
  const natures = new Set<string>();
  /* `discountPct` EST la remise famille quand `remiseFamille` le dit ;
     `discountXof` porte la part famille (`remiseFamilleXof`) et la part d'un
     code honoré au comptoir (`remiseDuComptoirXof`) : seul le reste est de
     la main (agenda.ts, 10 octobre 2026). */
  const famillePart = Math.max(0, Number(a.remiseFamilleXof) || 0);
  const comptoirPart = Math.max(0, Number(a.remiseDuComptoirXof) || 0);
  const code = !!(a.codeOffre || a.offreId) || comptoirPart > 0;
  if (code) natures.add('code');
  if (a.remiseFamille || famillePart > 0) natures.add('famille');
  const lignesALaMain = !(a.codeOffre || a.offreId) && (a.remisesLignes ?? []).some((r) => !!r && ((Number(r.pct) || 0) > 0 || (Number(r.xof) || 0) > 0));
  const pctALaMain = !a.remiseFamille && (Number(a.discountPct) || 0) > 0;
  const xofALaMain = (Number(a.discountXof) || 0) - famillePart - comptoirPart > 0;
  if (pctALaMain || xofALaMain || lignesALaMain || a.forfait) natures.add('main');
  if (a.sinsinOffert) natures.add('geste');
  if (a.subId || a.coverKind) natures.add('abonnee');
  if (fiche?.prixConvenus) natures.add('prix convenus');
  return [...natures];
}

/** LA PLACE LIMITÉE TENUE SUR UN JOUR QUI N'ÉTAIT PAS VIDE : un autre
    rendez-vous du jour, sans la place, posé AVANT elle ; ou plus de places
    prises que l'offre n'en donne. Sans heure de pose, on ne juge pas. */
export function pourquoiLaPlaceNeTientPas(a: RdvLu, rdvs: readonly RdvLu[], offres: readonly OffreLue[]): string | null {
  const offre = offres.find((o) => (!!a.offreId && o.id === a.offreId) || (!!a.codeOffre && !!o.code && o.code.trim().toUpperCase() === a.codeOffre.trim().toUpperCase()));
  if (!offre || !(Math.floor(Number(offre.placesParJour) || 0) > 0)) return null;
  const memeJour = rdvs.filter((r) => r.date === a.date && r.status !== 'annulé' && (!a.branchId || !r.branchId || r.branchId === a.branchId));
  const sienne = (r: RdvLu) => (!!offre.id && r.offreId === offre.id) || (!!offre.code && !!r.codeOffre && r.codeOffre.trim().toUpperCase() === offre.code.trim().toUpperCase());
  const prises = memeJour.filter(sienne);
  if (prises.length > Math.floor(Number(offre.placesParJour))) return `${prises.length} places prises pour ${Math.floor(Number(offre.placesParJour))} permises`;
  if (!offre.jourVideSeulement) return null;
  const posee = Date.parse(a.creeLe ?? '');
  if (!Number.isFinite(posee)) return null;
  const avant = memeJour.some((r) => r.id !== a.id && !sienne(r) && Date.parse(r.creeLe ?? '') < posee);
  return avant ? 'la place limitée a été prise un jour qui avait déjà un rendez-vous' : null;
}

/** LA CLÔTURE D'UNE JOURNÉE. Pure : les mêmes faits rendent toujours la
    même clôture, à l'écran comme au serveur. */
export function clotureDuJour(f: FaitsDeLaJournee): ClotureDuJour {
  const jour = f.jour;
  const maintenant = aCotonouLe(f.maintenantMs);
  const minutesMaintenant = maintenant.jour > jour ? 24 * 60 + 1 : maintenant.jour < jour ? -1 : maintenant.minutes;
  const tranche = new Map((f.decisions ?? []).map((d) => [d.cle, d] as const));
  const pieces = f.pieces.filter((p) => !f.branchId || !p.branchId || p.branchId === f.branchId);
  const rdvs = f.rdvs
    .filter((a) => a.date === jour && (!f.branchId || !a.branchId || a.branchId === f.branchId))
    .slice()
    .sort((a, b) => (minutesDeLHeure(a.time) ?? 9999) - (minutesDeLHeure(b.time) ?? 9999) || a.id.localeCompare(b.id));
  const ficheDe = (id?: string): FicheLue | undefined => (id ? f.fiches.find((c) => c.id === id) : undefined);
  const gestes: GesteSur[] = [];
  const constats: ConstatDuRdv[] = [];
  const piecesDuJour = new Set<string>();

  /* LES PIÈCES SANS RENDEZ-VOUS, candidates au lien : une facture qu'aucun
     rendez-vous ne nomme et qui ne nomme aucun rendez-vous. */
  const nommees = new Set<string>();
  for (const a of f.rdvs) for (const p of piecesDuRdv(a, pieces)) nommees.add(p.id);
  const orphelines = pieces.filter((p) => estUneFacture(p) && !p.apptId && !nommees.has(p.id));

  for (const a of rdvs) {
    const debut = minutesDeLHeure(a.time);
    const fin = (debut ?? 0) + Math.max(1, Math.round(Number(a.dureeMin) || 60));
    const fiche = ficheDe(a.clientId);
    const qui = initialesDe(a.qui ?? fiche?.nom);
    const base = { id: a.id, heure: debut === null ? '—' : heureEnClair(debut), finDite: heureEnClair(fin), qui, libelle: a.libelle, finMin: fin };
    const aRevoir: { cle: string; dit: string }[] = [];
    const revoir = (cle: string, dit: string) => { if (!tranche.has(cle)) aRevoir.push({ cle, dit }); };
    const passe = minutesMaintenant >= fin;
    const commence = debut !== null && minutesMaintenant >= debut;
    const leurs = piecesDuRdv(a, pieces);
    for (const p of leurs) piecesDuJour.add(p.id);
    const piece = leurs[0];
    const numero = piece?.number;

    /* L'annulé et l'absente sont des états finals : rien à clore. */
    if (a.status === 'annulé') {
      constats.push({ ...base, etat: 'annule', etatDit: a.absente ? 'Absente' : 'Annulé', dit: a.absente ? 'Elle n’est pas venue.' : 'Rendez-vous annulé.', gestes: [], aRevoir: [] });
      continue;
    }
    const reste = resteDuRdv(a);
    const recu = argentDuCarnet(a) + acompteRecu(a);

    if (a.status !== 'honoré') {
      if (!passe) {
        constats.push({ ...base, etat: commence ? 'en-cours' : 'a-venir', etatDit: commence ? 'En cours' : 'À venir',
          dit: commence ? `Au fauteuil jusque vers ${heureEnClair(fin)}` : 'Pas encore son heure', gestes: [], aRevoir: [] });
        continue;
      }
      /* RÈGLE 1 : passé, encore « confirmé ». Réglé en entier : Grenat le
         passe honoré seul. Sinon, la main dit ce qui s'est passé. */
      if (estEntierementRegle(a)) {
        gestes.push({ genre: 'passer-honore', cle: `honore:${a.id}`, rdvId: a.id, dit: `${qui} · ${base.heure} : réglé en entier, encore « confirmé » ; Grenat le passe honoré.` });
        constats.push({ ...base, etat: 'regle', etatDit: 'Réglé', dit: `Fini vers ${heureEnClair(fin)}, réglé en entier : Grenat le passe honoré`, gestes: [], aRevoir: [], pieceId: piece?.id, numero });
        continue;
      }
      if (typeof reste === 'number' && reste > 0) {
        constats.push({ ...base, etat: 'a-encaisser', etatDit: 'À encaisser',
          dit: recu > 0 ? `Fini vers ${heureEnClair(fin)}, ${francsDits(reste)} restent à encaisser` : `Fini vers ${heureEnClair(fin)}, pas encore encaissé`,
          gestes: ['encaisser', 'absente', 'annulee'], aRevoir: [], pieceId: piece?.id, numero });
        continue;
      }
      constats.push({ ...base, etat: 'sans-etat', etatDit: 'Sans état', dit: `Fini vers ${heureEnClair(fin)} : ni honoré, ni absente, ni annulée`,
        gestes: ['honore', 'absente', 'annulee'], aRevoir: [], pieceId: piece?.id, numero });
      continue;
    }

    /* RÈGLE 2 : honoré, une seule facture, au même prix, le même argent. */
    if (leurs.length === 0) {
      const candidates = orphelines.filter((p) => (p.clientId === a.clientId || p.forClientId === a.clientId) && !!a.clientId && p.date === a.date
        && typeof a.prixXof === 'number' && rituelDeLaPiece(p) === a.prixXof);
      if (candidates.length === 1) {
        const p = candidates[0];
        piecesDuJour.add(p.id);
        gestes.push({ genre: 'relier-la-piece', cle: `relier:${a.id}`, rdvId: a.id, pieceId: p.id, dit: `${qui} · ${base.heure} : la facture ${p.number ?? ''} est la sienne (même cliente, même jour, même prix) ; Grenat la relie.` });
        constats.push({ ...base, etat: 'regle', etatDit: 'À relier', dit: `Honoré ; sa facture ${p.number ?? ''} n’était reliée à rien, Grenat la relie`, gestes: [], aRevoir: [], pieceId: p.id, numero: p.number });
        continue;
      }
      if ((a.prixXof ?? 0) > 0 || recu > 0) {
        revoir(`sans-facture:${a.id}`, candidates.length > 1 ? `honoré sans facture reliée : ${candidates.length} factures pourraient être la sienne` : 'honoré sans facture');
      }
    } else if (leurs.length > 1) {
      revoir(`deux-factures:${a.id}`, `${leurs.length} factures pour un seul rendez-vous (${leurs.map((p) => p.number ?? p.id).join(', ')})`);
    } else {
      if (typeof a.prixXof === 'number' && rituelDeLaPiece(piece) !== a.prixXof) {
        revoir(`prix:${a.id}`, `prix différent : ${francsDits(a.prixXof)} au rendez-vous, ${francsDits(rituelDeLaPiece(piece))} sur ${numero ?? 'la facture'}`);
      }
      const surLaPiece = argentDuRituelSurLaPiece(piece);
      const auCarnet = argentDuCarnet(a);
      if (surLaPiece !== auCarnet) {
        revoir(`argent:${a.id}`, `argent différent : ${francsDits(auCarnet)} au Carnet, ${francsDits(surLaPiece)} sur ${numero ?? 'la facture'}`);
      }
      if (piece.status === 'brouillon') revoir(`brouillon:${a.id}`, `${numero ?? 'sa facture'} est encore un brouillon`);
    }

    /* RÈGLE 3 : une seule remise, et la place limitée seulement un jour vide. */
    const natures = remisesDuRdv(a, fiche);
    if (natures.length > 1) revoir(`remise:${a.id}`, `deux remises sur un rendez-vous (${natures.join(' et ')}) : une seule est permise`);
    const place = pourquoiLaPlaceNeTientPas(a, f.rdvs, f.offres ?? []);
    if (place) revoir(`place:${a.id}`, place);

    const argentDit = recu > 0 ? `${francsDits(recu)} reçus` : 'rien reçu';
    const dit = typeof reste === 'number' && reste > 0
      ? `Honoré${numero ? ` · ${numero}` : ''} · ${francsDits(reste)} à régler`
      : `Honoré${numero ? ` · ${numero}` : ''} · ${argentDit}`;
    constats.push({
      ...base, etat: aRevoir.length ? 'a-revoir' : 'clos', etatDit: aRevoir.length ? 'À revoir' : 'Clos',
      dit, gestes: !leurs.length && typeof reste === 'number' && reste > 0 ? ['encaisser'] : [], aRevoir, pieceId: piece?.id, numero,
    });
  }

  /* RÈGLE 4 : le papier de chaque facture terminée, une fois, par la salle. */
  const versementsDuJour = (p: PieceLue) => versementsDeLaPiece(p).filter((v) => (v.date ?? p.date) === jour && v.method !== 'Avoir' && v.method !== 'Acompte');
  const lesPieces: ClotureDuJour['pieces'] = [];
  const reliees = new Map<string, string>();
  for (const g of gestes) if (g.genre === 'relier-la-piece') reliees.set(g.pieceId, g.rdvId);
  for (const p of pieces) {
    if (!estUneFacture(p)) continue;
    const duJour = piecesDuJour.has(p.id) || p.date === jour || versementsDuJour(p).length > 0;
    if (!duJour) continue;
    const rdv = f.rdvs.find((a) => a.id === p.apptId || a.id === reliees.get(p.id) || a.invoiceId === p.id || (a.payments ?? []).some((v) => v.invoiceId === p.id));
    const numero = p.number ?? p.id;
    const aRevoir: { cle: string; dit: string }[] = [];
    let papier: ClotureDuJour['pieces'][number]['papier'] = 'sans-objet';
    let dit = '';
    const terminee = p.status === 'payée' || p.status === 'envoyée';
    const jourDuRituel = rdv?.date ?? p.date;
    if (p.status === 'brouillon') {
      dit = 'brouillon : pas de papier tant qu’elle n’est pas terminée';
    } else if (!terminee) {
      dit = 'pas terminée';
    } else if (p.whatsapp?.partieLe) {
      papier = 'parti'; dit = 'papier parti sur son WhatsApp';
    } else {
      const ligne = (f.envois ?? []).find((e) => e.invoiceId === p.id && (e.type ?? TYPE_DU_PAPIER) === TYPE_DU_PAPIER);
      const payeuse = ficheDe(p.clientId);
      const soignee = ficheDe(p.forClientId ?? p.clientId);
      const destinataire = payeuse?.aUnNumero ? payeuse : soignee;
      const reste = Math.max(0, totalDeLaPiece(p) - versementsDeLaPiece(p).reduce((s, v) => s + (Number(v.amountXof) || 0), 0));
      const aujourdhui = versementsDuJour(p);
      const dernierPaiement = versementsDeLaPiece(p).map((v) => v.date ?? p.date ?? '').sort().at(-1);
      const genre: 'recu' | 'facture' = reste > 0 ? 'facture' : 'recu';
      if (ligne && ['en-attente', 'retenu', 'en-envoi', A_PREPARER, 'envoyé'].includes(ligne.statut ?? '')) {
        papier = 'en-salle'; dit = ligne.statut === 'retenu' ? 'papier retenu en salle par une main' : 'papier en salle d’attente';
      } else if (ligne && ligne.statut === 'écarté') {
        papier = 'excepte'; dit = 'papier écarté de la salle par une main';
      } else if (!destinataire) {
        papier = 'excepte'; dit = 'vente sans fiche : pas de papier';
      } else if (destinataire.sansPapiersWa) {
        papier = 'excepte'; dit = 'pas de reçu ni de facture par WhatsApp (sa fiche le dit)';
      } else if (!destinataire.aUnNumero) {
        papier = 'sans-numero'; dit = 'pas de numéro sur sa fiche : le papier ne peut pas partir';
        if (!tranche.has(`papier:${p.id}`)) aRevoir.push({ cle: `papier:${p.id}`, dit: `${numero} : pas de numéro sur sa fiche, le papier ne peut pas partir` });
      } else if (!papierDuJour({ jourDuPaiement: genre === 'recu' ? dernierPaiement : undefined, jourDuRituel, aujourdhui: jour })) {
        papier = 'excepte'; dit = 'rattrapage d’un jour passé : pas de papier, le retard reste invisible';
      } else if (genre === 'recu' && aujourdhui.length === 0) {
        papier = 'excepte'; dit = 'réglée avant ce jour : son reçu était l’affaire de ce jour-là';
      } else {
        papier = 'a-envoyer';
        const montant = genre === 'recu' ? aujourdhui.reduce((s, v) => s + (Number(v.amountXof) || 0), 0) : reste;
        dit = genre === 'recu' ? 'le reçu n’est pas parti' : 'la facture à régler n’est pas partie';
        gestes.push({ genre: 'envoyer-le-papier', cle: `papier:${p.id}`, pieceId: p.id, rdvId: rdv?.id, papier: genre, montantXof: montant,
          dit: `${numero} : ${genre === 'recu' ? 'le reçu' : 'la facture'} part par la salle d’attente.` });
      }
    }
    lesPieces.push({ id: p.id, numero, dit, aRevoir, papier });
  }

  /* RÈGLE 5 : la pièce payée effacée. */
  const alarmes: Alarme[] = [];
  for (const e of f.effacements ?? []) {
    const avant = e.avant;
    if (!avant || !estUneFacture(avant) || !pieceAPaye(avant)) continue;
    if (f.branchId && avant.branchId && avant.branchId !== f.branchId) continue;
    if (aCotonouLe(Date.parse(e.faitLe)).jour !== jour) continue;
    const argent = versementsDeLaPiece(avant).filter((v) => v.method !== 'Avoir' && v.method !== 'Acompte').reduce((s, v) => s + (Number(v.amountXof) || 0), 0);
    const argentDuJour = versementsDuJour(avant).reduce((s, v) => s + (Number(v.amountXof) || 0), 0);
    /* LA PIÈCE QUI LA SUIT : celle du même rendez-vous, sinon une pièce de la
       même cliente, du même jour, qui n'est à aucun autre rendez-vous. Elle
       l'a FONDUE si chacun de ses versements s'y retrouve (même identifiant,
       ou même montant, même jour, même moyen : « Rassembler les pièces ») ;
       elle l'a REFAITE si elle est née après l'effacement (ou sans heure de
       naissance). Une pièce plus ancienne qui n'a pas son argent n'est rien. */
    const candidate = pieces.find((s) => s.id !== avant.id && estUneFacture(s) && (avant.apptId
      ? s.apptId === avant.apptId
      : !!avant.clientId && s.clientId === avant.clientId && s.date === avant.date && !s.apptId));
    const sesVersements = candidate ? versementsDeLaPiece(candidate) : [];
    const pris = new Set<number>();
    const fondue = !!candidate && versementsDeLaPiece(avant).every((v) => {
      const k = sesVersements.findIndex((w, i) => !pris.has(i) && ((!!v.id && w.id === v.id) || (w.amountXof === v.amountXof && (w.date ?? '') === (v.date ?? '') && (w.method ?? '') === (v.method ?? ''))));
      if (k < 0) return false;
      pris.add(k);
      return true;
    });
    const neeLe = Date.parse(candidate?.creeeLe ?? '');
    const successeur = candidate && (fondue || !Number.isFinite(neeLe) || neeLe >= Date.parse(e.faitLe)) ? candidate : undefined;
    const cle = `effacement:${e.traceId}`;
    const decision = tranche.get(cle);
    const numero = avant.number ?? avant.id;
    const heure = heureEnClair(aCotonouLe(Date.parse(e.faitLe)).minutes);
    const premier = versementsDeLaPiece(avant).map((v) => v.time).filter(Boolean).sort()[0];
    const remis = premier ? ` ; à ${heureEnClair(minutesDeLHeure(premier) ?? 0)}, ${francsDits(argent)} avaient été remis` : `, ${francsDits(argent)} y étaient entrés`;
    const motif = avant.effacement?.motif?.trim() || undefined;
    let sort: Alarme['sort'] = 'perdue';
    let dit: string;
    let ecart: number | undefined;
    if (successeur && fondue) {
      sort = 'fondue';
      dit = `${numero} effacée à ${heure} : fondue dans ${successeur.number ?? successeur.id}, son argent y est.`;
    } else if (successeur) {
      sort = 'refaite';
      ecart = argentDuRituelSurLaPiece(successeur) - argent;
      dit = `${numero} effacée à ${heure}${e.par ? ` par ${e.par}` : ''}, refaite par ${successeur.number ?? successeur.id}${remis}.`
        + (ecart > 0 ? ` Si les ${francsDits(ecart)} de plus n’ont pas été reçus, le tiroir sera court de ${francsDits(ecart)}. À dire avant le comptage.`
          : ecart < 0 ? ` La nouvelle pièce porte ${francsDits(-ecart)} de moins : à dire avant le comptage.` : '');
    } else {
      dit = `${numero} effacée à ${heure}${e.par ? ` par ${e.par}` : ''}${remis} ; ils ne sont plus comptés. L’argent reste compté jusqu’à la décision de la direction.`;
    }
    if (motif) dit += ` Motif : « ${motif} ».`;
    const ouverte = !decision && sort !== 'fondue';
    alarmes.push({
      cle, traceId: e.traceId, pieceId: avant.id, numero, faitLe: e.faitLe, par: e.par, motif, argentXof: argent, argentDuJourXof: argentDuJour, sort,
      ...(successeur ? { successeur: { id: successeur.id, numero: successeur.number ?? successeur.id, argentXof: argentDuRituelSurLaPiece(successeur) } } : {}),
      ...(ecart !== undefined ? { ecartXof: ecart } : {}),
      ...(decision ? { tranchee: decision } : {}),
      dit, ouverte,
    });
  }

  /* RÈGLE 6 : la caisse du jour, l'argent reçu ce jour, par moyen et par tiroir. */
  const parMoyen = new Map<string, number>();
  const parTiroir = new Map<string, number>();
  let total = 0; let nb = 0; let pourboires = 0;
  for (const p of pieces) {
    if ((p.kind ?? 'facture') !== 'facture') continue;
    const vs = versementsDuJour(p);
    if (!vs.length) continue;
    pourboires += Math.max(0, Number(p.tipXof) || 0);
    for (const v of vs) {
      const m = Number(v.amountXof) || 0;
      total += m; nb += 1;
      const fam = familleLue({ method: v.method, cashbox: v.cashbox ?? p.cashbox });
      parMoyen.set(fam, (parMoyen.get(fam) ?? 0) + m);
      const t = tiroirDuVersement(p, v);
      parTiroir.set(t, (parTiroir.get(t) ?? 0) + m);
    }
  }
  const sortiDesComptes = alarmes.filter((x) => x.ouverte && x.sort === 'perdue').reduce((s, x) => s + x.argentDuJourXof, 0);
  const aEncaisser = constats.filter((c) => c.etat === 'a-encaisser');
  const resteAEncaisser = aEncaisser.reduce((s, c) => s + (resteDuRdv(rdvs.find((a) => a.id === c.id) as RdvLu) ?? 0), 0);
  const caisse: CaisseDuJour = {
    totalXof: total, versements: nb, pourboiresXof: pourboires,
    parMoyen: [...parMoyen.entries()].sort(([a], [b]) => rangDuMoyen(a) - rangDuMoyen(b) || a.localeCompare(b, 'fr')).map(([famille, totalXof]) => ({ famille, totalXof })),
    parTiroir: [...parTiroir.entries()].sort(([a], [b]) => a.localeCompare(b, 'fr')).map(([tiroir, totalXof]) => ({ tiroir, totalXof })),
    sortiDesComptesXof: sortiDesComptes,
    resteAEncaisserXof: resteAEncaisser, rdvAEncaisser: aEncaisser.length,
  };

  /* LE VERDICT : ce qui reste, dit en nombres ; jamais un nom. */
  const compte = (e: EtatDuRdv) => constats.filter((c) => c.etat === e).length;
  const aRevoirEnTout = constats.reduce((s, c) => s + c.aRevoir.length, 0) + lesPieces.reduce((s, p) => s + p.aRevoir.length, 0);
  const alarmesOuvertes = alarmes.filter((a) => a.ouverte).length;
  const comptes: ComptesDeLaJournee = {
    rdv: constats.length, clos: compte('clos') + compte('annule'), aVenir: compte('a-venir'), enCours: compte('en-cours'),
    aEncaisser: compte('a-encaisser'), sansEtat: compte('sans-etat'), regles: compte('regle'),
    aRevoir: aRevoirEnTout, alarmes: alarmesOuvertes, gestes: gestes.length, papiersEnSalle: lesPieces.filter((p) => p.papier === 'en-salle').length,
  };
  const aClore = comptes.aEncaisser + comptes.sansEtat;
  const reste: string[] = [];
  if (aClore) reste.push(`${nombreDit(aClore, 'rendez-vous à clore', 'rendez-vous à clore')}`);
  if (comptes.aVenir + comptes.enCours) reste.push(`${nombreDit(comptes.aVenir + comptes.enCours, 'rendez-vous pas encore fini', 'rendez-vous pas encore finis')}`);
  if (aRevoirEnTout) reste.push(nombreDit(aRevoirEnTout, 'facture à revoir', 'factures à revoir'));
  if (alarmesOuvertes) reste.push(nombreDit(alarmesOuvertes, 'pièce payée effacée à trancher', 'pièces payées effacées à trancher'));
  if (gestes.length) reste.push(nombreDit(gestes.length, 'geste que Grenat fait seul', 'gestes que Grenat fait seul'));
  const ferme = !!f.ferme;
  const close = reste.length === 0;
  const dit = close
    ? (ferme && constats.length === 0 && total === 0 ? 'La Maison est fermée ce jour : rien à clore.' : 'La journée est close : la caisse peut se compter.')
    : alarmesOuvertes && !aClore ? (alarmesOuvertes > 1 ? `${alarmesOuvertes} factures payées ont été effacées` : 'Une facture payée a été effacée')
      : `${reste[0].charAt(0).toUpperCase()}${reste[0].slice(1)}, la caisse ne se compte pas encore`;
  return {
    version: VERSION_DE_LA_CLOTURE, jour, ecriteA: new Date(f.maintenantMs).toISOString(), ferme,
    rdvs: constats, pieces: lesPieces, gestes, alarmes, caisse, comptes, verdict: { close, dit, reste },
  };
}

/** LA NOTIFICATION DE LA CLÔTURE : « Clôture de 19 h : 6 rendez-vous à clore,
    1 facture à revoir. » Des nombres, jamais une cliente. */
export function notificationDeLaCloture(c: Pick<ClotureDuJour, 'verdict' | 'comptes' | 'alarmes'>, heure: number | 'matin'): { titre: string; corps: string } {
  const titre = heure === 'matin' ? 'La clôture d’hier' : `Clôture de ${heure} h`;
  if (c.verdict.close) return { titre, corps: 'La journée est close : la caisse peut se compter.' };
  return { titre, corps: `${c.verdict.reste.join(', ')}.`.replace(/^./, (x) => x.toUpperCase()) };
}

/** L'ÉTAT DU RENDEZ-VOUS APRÈS UN GESTE DE GRENAT, relu juste avant
    d'écrire : le geste ne vaut que si le rendez-vous frais le demande encore
    (jamais sur une donnée qui a bougé). */
export function gesteToujoursValable(g: GesteSur, f: FaitsDeLaJournee): boolean {
  return clotureDuJour(f).gestes.some((x) => x.cle === g.cle && x.genre === g.genre
    && (x.genre !== 'relier-la-piece' || (g.genre === 'relier-la-piece' && x.pieceId === g.pieceId)));
}
/* ⟨/cloture-du-jour⟩ */
