// cloture-du-jour - Grenat, la cloture de la journee (15 h, 19 h, le mot du matin).
//
// LA PREMIERE LIGNE EST VOLONTAIREMENT PAUVRE : un fichier qu'on colle a la
// main doit commencer par quelque chose qui survit a un collage de travers.

/* ═══════════════════════════════════════════════════════════════════
   CLOTURE-DU-JOUR — Grenat, le professionnel de l'argent · 4 novembre 2026.

   « Tous les jours à 15 h et à 19 h, qu'Opale clôture toutes les factures,
   qu'elles soient terminées, envoyées aux clients, et qu'on puisse faire la
   caisse du jour » (Yéman). Maquette 9KCMgAb1qksSVcEXDiKaHE validée : c'est
   Grenat qui porte la clôture, Opale garde les messages.

   QUI L'APPELLE :
     - le cron `cloture-de-grenat` (0156), chaque heure de 8 h à 23 h à
       Cotonou, avec la clé service : elle ne travaille qu'aux heures RÉGLÉES
       (`mnd_settings.cloture.heures`, défaut 15 et 19), une fois par heure ;
     - le cron `cloture-de-grenat-matin`, à 6 h 45 : la veille relue en
       entier (un rendez-vous fini après 19 h), pour le Conseil de Saphir ;
     - un essai, clé service et {"source":"essai"} : la clôture s'écrit,
       personne n'est prévenu.

   CE QU'ELLE FAIT, et rien d'autre :
     ① lire la journée (par pages de mille : le plafond de Supabase) ;
     ② juger avec la RÈGLE RECOPIÉE ci-dessous (⟨cloture-du-jour⟩, l'original
        est src/shared/cloture-du-jour-pur.ts ; le banc compare les deux) ;
     ③ faire les TROIS GESTES SÛRS, chacun relu juste avant d'écrire
        (`gesteToujoursValable` sur la ligne fraîche) et écrit SOUS
        CONDITION (`updated_at` inchangé) : jamais sur une donnée qui a bougé.
          · passer « honoré » un rendez-vous entièrement réglé encore
            « confirmé » (marqué `honoreParGrenat` : le Trône en fait les
            suites, points, stock, reprise, comme au comptoir) ;
          · relier une facture à son rendez-vous, un seul candidat ;
          · déposer le papier d'une pièce dans la salle d'attente, statut
            « à-préparer » : le PDF ne se fait qu'au Trône, qui le prépare et
            le pose « en-attente » ; le facteur le porte, jamais d'ici ;
     ④ écrire son compte rendu (`clotures_de_grenat`) et son bilan pour
        Saphir (`assistants_bilans`, « grenat:<jour> ») ;
     ⑤ prévenir la direction ET la personne au comptoir ce jour-là (les
        comptes qui ont écrit une pièce aujourd'hui, lus dans `traces`),
        une notification, des nombres, jamais un nom.
   LES DÉPENSES DU JOUR (5 novembre 2026, « Oui, il les relit à 19 h ») :
   elle LIT les dépenses du jour, celles qui attendent un oui, celles
   écrites pour l'écart d'un comptage, et les comptages de tiroir du jour ;
   la règle les met sous les yeux. Elle n'écrit JAMAIS une dépense.
   Jamais : dire venue, absente, annulée ; toucher un prix, une remise, un
   paiement ; effacer une pièce ; encaisser.

   AUCUN SECRET ICI : SUPABASE_URL et CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   viennent de l'environnement.

   Déploiement : `node scripts/mise-en-ligne.mjs fonction cloture-du-jour
   --commit <sha> --jwt non` (la porte est jugée ici). Vérifier : un GET rend
   sa version.
   ═══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

/* ══ LA RÈGLE DE LA CLÔTURE, recopiée à l'identique de
   src/shared/cloture-du-jour-pur.ts (une fonction Edge ne lit rien du
   dépôt). Le banc `verifie-la-cloture-du-jour` et celui des douze lunes (R8)
   comparent la copie à l'original, caractère pour caractère. ══ */
/* ⟨cloture-du-jour⟩ */
export const VERSION_DE_LA_CLOTURE = '2026-11-05-a';

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
  /** Les dépenses (5 novembre 2026) : celles du jour, et celles qui attendent
      un oui. Absentes : la clôture ne dit rien des dépenses. */
  depenses?: readonly DepenseLue[];
  /** Les comptages de tiroir du jour (`clotures_caisse`), pour l'écart. */
  comptages?: readonly ComptageLu[];
  /** L'heure de la relecture des dépenses : la dernière clôture du jour (19 h par défaut). */
  heureDesDepenses?: number;
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
  /** Les dépenses du jour, relues (absentes des comptes rendus d'avant le 5 novembre 2026). */
  depenses?: DepensesDuJour;
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

/* ── LES DÉPENSES DU JOUR — 5 novembre 2026 ─────────────────────────────
   « Comment Grenat saisit les dépenses ? » Il ne les saisit pas ; « Oui, il
   les relit à 19 h » (Yéman, 5 novembre 2026 ; maquette 9KCMgAb1…, section
   8). GRENAT RELIT, IL NE SAISIT JAMAIS UNE DÉPENSE. Il met sous les yeux :
     · les dépenses « à valider » qui attendent (posées par Opale ou par
       l'équipe) : « Valider », « Refuser », la validation de toujours ;
     · les dépenses du jour sans photo du reçu (au-dessus du seuil du
       justificatif) ou sans qui a payé : « Joindre la photo », « Dire qui a
       payé » ouvrent leur fiche ;
     · un jour ouvert sans aucune dépense saisie : il le DEMANDE, à l'heure
       de la relecture (la dernière clôture du jour) ; « Saisir une
       dépense », ou « Rien aujourd'hui », une décision de la direction ;
     · un écart de tiroir au comptage sans dépense en face : « C'était une
       dépense », ou « Laisser l'écart, avec sa note ».
   UNE JOURNÉE RESTE CLOSE avec une dépense à compléter : seule une dépense
   à valider DU JOUR bloque le comptage (le tiroir attendu la compte déjà
   comme sortie, le livre pas encore). Sans dépenses lues, rien ne se dit :
   l'absence de faits n'est pas un jour sans dépense. */

/** Une dépense telle que la clôture la lit (`expenses`, finance.ts). */
export type DepenseLue = {
  id: string; branchId?: string; label?: string; amountXof?: number; items?: readonly { amountXof?: number }[] | null;
  date?: string; cashbox?: string; category?: string;
  /** Qui l'a payée ; `laMaisonAPaye` : « La Maison elle-même », dit au formulaire. */
  porteur?: string; laMaisonAPaye?: boolean;
  /** La photo du reçu (`fichier`, la pièce jointe du dossier « depense »). */
  fichier?: unknown;
  /** Une récurrente, une charge de la paie, l'intérêt d'une échéance : rien de saisi ce jour. */
  recurring?: string | null; source?: string; empruntId?: string;
  /** Écrite pour l'écart d'un comptage (« C'était une dépense ») : la clôture du tiroir. */
  ecartDe?: string;
  validation?: { etat?: string; soumisLe?: string; soumisPar?: string } | null;
};

/** Le comptage d'un tiroir, tel que la clôture le lit (`clotures_caisse`, caisse-du-soir-pur.ts). */
export type ComptageLu = {
  id: string; branchId?: string; cashbox?: string; date?: string; ecartXof?: number; note?: string;
  /** Les dépenses écrites PENDANT le comptage (« C'était une dépense »). */
  depenses?: readonly string[];
  le?: string; reprend?: string; validation?: { verdict?: string } | null;
};

/** Sous ce montant (un ticket de taxi, un sachet d'eau), la photo du reçu ne
    se réclame pas : le seuil du justificatif (`SEUIL_DU_JUSTIFICATIF_XOF`,
    agents-maison-pur.ts ; le banc compare les deux). */
export const SEUIL_DE_LA_PHOTO_XOF = 5000;

/** Le montant d'une dépense, la même lecture qu'`expenseTotal`. */
export const montantDeLaDepense = (e: Pick<DepenseLue, 'amountXof' | 'items'>): number =>
  e.items && e.items.length ? e.items.reduce((s, it) => s + (Number(it.amountXof) || 0), 0) : Number(e.amountXof) || 0;

/** Elle attend un oui, la même lecture qu'`estEnAttente`. */
export const depenseEnAttente = (e: Pick<DepenseLue, 'validation'>): boolean => e.validation?.etat === 'attente';

/** Les heures écoulées depuis la soumission, la même lecture qu'`heuresDattente`. */
export function heuresDAttente(e: Pick<DepenseLue, 'validation'>, maintenantMs: number): number | null {
  if (!depenseEnAttente(e)) return null;
  const t = Date.parse(e.validation?.soumisLe ?? '');
  if (Number.isNaN(t)) return null;
  return Math.max(0, (maintenantMs - t) / 3_600_000);
}

/** SAISIE À LA MAIN : ni une récurrente (elle court seule de mois en mois),
    ni une charge écrite par la paie, ni l'intérêt d'une échéance d'emprunt. */
export const saisieALaMain = (e: Pick<DepenseLue, 'recurring' | 'source' | 'empruntId'>): boolean =>
  !e.recurring && !e.source && !e.empruntId;

/** CE QUI MANQUE À UNE DÉPENSE : la photo du reçu (au-dessus du seuil), et
    qui a payé (un porteur, ou « La Maison elle-même » dite au formulaire). */
export function ceQuiManqueALaDepense(e: DepenseLue): ('recu' | 'porteur')[] {
  const manque: ('recu' | 'porteur')[] = [];
  if (!e.fichier && montantDeLaDepense(e) >= SEUIL_DE_LA_PHOTO_XOF) manque.push('recu');
  if (!String(e.porteur ?? '').trim() && !e.laMaisonAPaye) manque.push('porteur');
  return manque;
}

const MOIS_DITS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** « 1er novembre 2026 », « 4 novembre 2026 » : la date dite, l'année toujours. */
export const dateDite = (iso: unknown): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m || !MOIS_DITS[Number(m[2]) - 1]) return String(iso ?? '');
  return `${Number(m[3])}${Number(m[3]) === 1 ? 'er' : ''} ${MOIS_DITS[Number(m[2]) - 1]} ${m[1]}`;
};

export type GesteDeDepense = 'valider' | 'refuser' | 'joindre-la-photo' | 'dire-qui-a-paye' | 'saisir' | 'rien-aujourdhui' | 'c-etait-une-depense' | 'laisser-l-ecart';

export type ConstatDeDepense = {
  cle: string;
  genre: 'jour-sans-depense' | 'a-valider' | 'a-completer' | 'ecart-sans-depense';
  heure: string; quoi: string; dit: string; etatDit: string;
  gestes: GesteDeDepense[];
  /** Seule une dépense à valider DU JOUR bloque le comptage. */
  bloque: boolean;
  depenseId?: string; comptageId?: string; tiroir?: string; montantXof?: number;
  manque?: ('recu' | 'porteur')[];
  /** La note du comptage, quand l'écart en a une : « Laisser l'écart » la garde. */
  note?: string;
};

export type DepensesDuJour = {
  /** Les dépenses ont été lues. */
  lues: boolean;
  /** L'heure de la relecture est passée : la question du jour sans dépense
      se pose, et les nombres entrent dans la notification. */
  relues: boolean;
  constats: ConstatDeDepense[];
  /** Les dépenses saisies à la main ce jour (en attente comprises), et leur total. */
  saisies: number; totalXof: number;
  comptes: { aValiderDuJour: number; aValiderAvant: number; aCompleter: number; sansDepense: number; ecarts: number };
  /** Ce qui reste à dire sans bloquer, en nombres (à l'heure de la relecture). */
  aDire: string[];
};

/** La clé de « Rien aujourd'hui » et celle de « Laisser l'écart, avec sa note ». */
export const cleDuJourSansDepense = (jour: string): string => `sans-depense:${jour}`;
export const cleDeLEcart = (comptageId: string): string => `ecart:${comptageId}`;

/** LES DÉPENSES DU JOUR, relues : ce que Grenat met sous les yeux. Pure. */
export function depensesDuJour(o: {
  jour: string; maintenantMs: number; minutesMaintenant: number; branchId?: string; ferme: boolean;
  depenses?: readonly DepenseLue[]; comptages?: readonly ComptageLu[]; heureDesDepenses?: number;
  tranche: ReadonlyMap<string, DecisionLue>;
}): DepensesDuJour {
  const comptes = { aValiderDuJour: 0, aValiderAvant: 0, aCompleter: 0, sansDepense: 0, ecarts: 0 };
  if (!o.depenses) return { lues: false, relues: false, constats: [], saisies: 0, totalXof: 0, comptes, aDire: [] };
  const heure = Number.isInteger(o.heureDesDepenses) ? Number(o.heureDesDepenses) : 19;
  const relues = o.minutesMaintenant >= heure * 60;
  const deLaMaison = (b?: string) => !o.branchId || !b || b === o.branchId;
  const vivantes = o.depenses.filter((e) => deLaMaison(e.branchId) && e.validation?.etat !== 'refusee');
  const saisies = vivantes.filter((e) => e.date === o.jour && saisieALaMain(e));
  const enAttente = vivantes.filter((e) => depenseEnAttente(e) && String(e.date ?? '') <= o.jour)
    .sort((a, b) => String(a.validation?.soumisLe ?? '').localeCompare(String(b.validation?.soumisLe ?? '')) || a.id.localeCompare(b.id));
  const heureDe = (iso?: string): string => {
    const t = Date.parse(iso ?? '');
    if (!Number.isFinite(t)) return '';
    const ici = aCotonouLe(t);
    return ici.jour === o.jour ? heureEnClair(ici.minutes) : '';
  };
  const quoiDe = (e: DepenseLue) => `${String(e.label ?? '').trim() || 'Dépense'} · ${francsDits(montantDeLaDepense(e))}`;
  const manqueDit = (m: ('recu' | 'porteur')[]) => [m.includes('recu') ? 'sans photo du reçu' : '', m.includes('porteur') ? 'sans qui a payé' : ''].filter(Boolean).join(', et ');
  const constats: ConstatDeDepense[] = [];

  /* LE JOUR OUVERT SANS AUCUNE DÉPENSE : demandé, jamais supposé, à l'heure
     de la relecture ; « Rien aujourd'hui » de la direction le ferme. */
  const cleSans = cleDuJourSansDepense(o.jour);
  if (relues && !o.ferme && saisies.length === 0 && !o.tranche.has(cleSans)) {
    const aujourdhui = aCotonouLe(o.maintenantMs).jour === o.jour;
    constats.push({ cle: cleSans, genre: 'jour-sans-depense', heure: '', etatDit: 'À dire', bloque: false,
      quoi: aujourdhui ? 'Aucune dépense saisie aujourd’hui' : 'Aucune dépense saisie ce jour-là',
      dit: 'Rien acheté, rien payé de la caisse ? Le comptage du soir le dira.', gestes: ['saisir', 'rien-aujourdhui'] });
    comptes.sansDepense = 1;
  }

  /* LES DÉPENSES À VALIDER, la plus ancienne d'abord. */
  for (const e of enAttente) {
    const duJour = e.date === o.jour;
    const h = heuresDAttente(e, o.maintenantMs);
    const attente = h === null ? 'à valider' : h < 1 ? 'à valider depuis moins d’une heure' : `à valider depuis ${nombreDit(Math.floor(h), 'heure', 'heures')}`;
    const qui = String(e.validation?.soumisPar ?? '').trim();
    const debut = [duJour ? '' : `Du ${dateDite(e.date)}`, qui ? `posée par ${qui}` : 'posée par l’équipe', attente].filter(Boolean).join(', ');
    const manque = ceQuiManqueALaDepense(e);
    const dit = `${debut.charAt(0).toUpperCase()}${debut.slice(1)}.${e.cashbox ? ` ${e.cashbox}.` : ''}${manque.length ? ` ${manqueDit(manque).replace(/^./, (x) => x.toUpperCase())}.` : ''}`;
    constats.push({ cle: `depense-a-valider:${e.id}`, genre: 'a-valider', heure: heureDe(e.validation?.soumisLe), quoi: quoiDe(e), dit, etatDit: 'À valider',
      gestes: ['valider', 'refuser'], bloque: duJour, depenseId: e.id, montantXof: montantDeLaDepense(e), ...(manque.length ? { manque } : {}) });
    if (duJour) comptes.aValiderDuJour += 1; else comptes.aValiderAvant += 1;
  }

  /* LES DÉPENSES DU JOUR À COMPLÉTER : la photo du reçu, qui a payé. */
  for (const e of saisies) {
    if (depenseEnAttente(e)) continue;
    const manque = ceQuiManqueALaDepense(e);
    if (!manque.length) continue;
    const ou = [String(e.category ?? '').trim(), String(e.cashbox ?? '').trim()].filter(Boolean).join(', ');
    const dit = ou ? `${ou} : ${manqueDit(manque)}.` : `${manqueDit(manque).replace(/^./, (x) => x.toUpperCase())}.`;
    constats.push({ cle: `depense-a-completer:${e.id}`, genre: 'a-completer', heure: '', quoi: quoiDe(e), dit, etatDit: 'À compléter',
      gestes: [...(manque.includes('recu') ? ['joindre-la-photo' as const] : []), ...(manque.includes('porteur') ? ['dire-qui-a-paye' as const] : [])],
      bloque: false, depenseId: e.id, montantXof: montantDeLaDepense(e), manque });
    comptes.aCompleter += 1;
  }

  /* L'ÉCART DE TIROIR SANS DÉPENSE EN FACE : il manque de l'argent au
     comptage du jour, aucune dépense n'a été écrite pendant le comptage ni
     pour lui après, la direction n'y a pas encore répondu (acceptée ou
     reprise), aucun recomptage ne le remplace. */
  const comptages = (o.comptages ?? []).filter((c) => deLaMaison(c.branchId) && c.date === o.jour);
  for (const c of comptages) {
    const ecart = Math.round(Number(c.ecartXof) || 0);
    if (ecart >= 0) continue;
    if (c.depenses?.length || c.validation) continue;
    if ((o.comptages ?? []).some((x) => x.reprend === c.id)) continue;
    if (vivantes.some((e) => e.ecartDe === c.id)) continue;
    if (o.tranche.has(cleDeLEcart(c.id))) continue;
    const note = String(c.note ?? '').trim();
    const aQuelleHeure = heureDe(c.le);
    constats.push({ cle: cleDeLEcart(c.id), genre: 'ecart-sans-depense', heure: aQuelleHeure, etatDit: 'Écart', bloque: false,
      quoi: `Tiroir ${String(c.cashbox ?? '').trim() || 'sans nom'} · ${francsDits(-ecart)} de moins que l’attendu`,
      dit: `Au comptage${aQuelleHeure ? ` de ${aQuelleHeure}` : ''}, un écart sans dépense en face : une dépense oubliée ?${note ? ` Sa note : « ${note} ».` : ''}`,
      gestes: ['c-etait-une-depense', 'laisser-l-ecart'], comptageId: c.id, tiroir: c.cashbox, montantXof: -ecart, ...(note ? { note } : {}) });
    comptes.ecarts += 1;
  }

  const aDire = relues ? [
    comptes.aValiderAvant ? nombreDit(comptes.aValiderAvant, 'dépense d’un jour passé à valider', 'dépenses de jours passés à valider') : '',
    comptes.aCompleter ? nombreDit(comptes.aCompleter, 'dépense à compléter', 'dépenses à compléter') : '',
    comptes.sansDepense ? 'aucune dépense saisie' : '',
    comptes.ecarts ? nombreDit(comptes.ecarts, 'écart de tiroir sans dépense', 'écarts de tiroir sans dépense') : '',
  ].filter(Boolean) : [];
  return { lues: true, relues, constats, saisies: saisies.length, totalXof: saisies.reduce((s, e) => s + montantDeLaDepense(e), 0), comptes, aDire };
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

  /* LES DÉPENSES DU JOUR, relues : seule une dépense à valider du jour bloque. */
  const depenses = depensesDuJour({
    jour, maintenantMs: f.maintenantMs, minutesMaintenant, branchId: f.branchId, ferme: !!f.ferme,
    depenses: f.depenses, comptages: f.comptages, heureDesDepenses: f.heureDesDepenses, tranche,
  });

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
  if (depenses.comptes.aValiderDuJour) reste.push(nombreDit(depenses.comptes.aValiderDuJour, 'dépense à valider', 'dépenses à valider'));
  if (gestes.length) reste.push(nombreDit(gestes.length, 'geste que Grenat fait seul', 'gestes que Grenat fait seul'));
  const ferme = !!f.ferme;
  const close = reste.length === 0;
  const dit = close
    ? (ferme && constats.length === 0 && total === 0 ? 'La Maison est fermée ce jour : rien à clore.' : 'La journée est close : la caisse peut se compter.')
    : alarmesOuvertes && !aClore ? (alarmesOuvertes > 1 ? `${alarmesOuvertes} factures payées ont été effacées` : 'Une facture payée a été effacée')
      : `${reste[0].charAt(0).toUpperCase()}${reste[0].slice(1)}, la caisse ne se compte pas encore`;
  return {
    version: VERSION_DE_LA_CLOTURE, jour, ecriteA: new Date(f.maintenantMs).toISOString(), ferme,
    rdvs: constats, pieces: lesPieces, gestes, alarmes, caisse, comptes, verdict: { close, dit, reste }, depenses,
  };
}

/** LA NOTIFICATION DE LA CLÔTURE : « Clôture de 19 h : 6 rendez-vous à clore,
    1 facture à revoir. » Des nombres, jamais une cliente. À l'heure de la
    relecture, les dépenses s'y disent aussi, en nombres (5 novembre 2026). */
export function notificationDeLaCloture(
  c: Pick<ClotureDuJour, 'verdict' | 'comptes' | 'alarmes'> & { depenses?: Pick<DepensesDuJour, 'aDire'> },
  heure: number | 'matin',
): { titre: string; corps: string } {
  const titre = heure === 'matin' ? 'La clôture d’hier' : `Clôture de ${heure} h`;
  const aDire = c.depenses?.aDire ?? [];
  if (c.verdict.close) {
    return { titre, corps: aDire.length ? `La journée est close : la caisse peut se compter. À voir aussi : ${aDire.join(', ')}.` : 'La journée est close : la caisse peut se compter.' };
  }
  return { titre, corps: `${[...c.verdict.reste, ...aDire].join(', ')}.`.replace(/^./, (x) => x.toUpperCase()) };
}

/** L'ÉTAT DU RENDEZ-VOUS APRÈS UN GESTE DE GRENAT, relu juste avant
    d'écrire : le geste ne vaut que si le rendez-vous frais le demande encore
    (jamais sur une donnée qui a bougé). */
export function gesteToujoursValable(g: GesteSur, f: FaitsDeLaJournee): boolean {
  return clotureDuJour(f).gestes.some((x) => x.cle === g.cle && x.genre === g.genre
    && (x.genre !== 'relier-la-piece' || (g.genre === 'relier-la-piece' && x.pieceId === g.pieceId)));
}
/* ⟨/cloture-du-jour⟩ */

const VERSION = '2026-11-05-a';
const ADRESSE = '/trone/#/la-journee';
const ETIQUETTE = 'mnd-cloture';
/** Mille lignes par page : le plafond de Supabase. Au-delà de vingt pages, on s'arrête. */
const PAGE = 1000;
const PAGES_AU_PLUS = 20;
/** Un appel à push-notify ne pend jamais au-delà. */
const ENVOI_MAX_MS = 8_000;

// deno-lint-ignore no-explicit-any
type Base = any;
type Ligne = { id: string; branch_id?: string | null; data?: Record<string, unknown> | null; updated_at?: string; [k: string]: unknown };

declare const Deno: {
  env: { get(nom: string): string | undefined };
  serve(f: (req: Request) => Promise<Response>): void;
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const dis = (quoi: string, plus: Record<string, unknown> = {}) => console.log(JSON.stringify({ fonction: 'cloture-du-jour', quoi, ...plus }));

/** Minuit d'un jour de Cotonou (UTC+1), en ISO UTC. */
const minuitDe = (jour: string): string => new Date(Date.parse(`${jour}T00:00:00Z`) - DECALAGE_DE_COTONOU_MIN * 60_000).toISOString();
const lendemain = (jour: string): string => new Date(Date.parse(`${jour}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Toutes les lignes d'une requête, par pages de mille (le plafond de Supabase). */
async function parPages(requete: (de: number, a: number) => PromiseLike<{ data: Ligne[] | null; error: unknown }>): Promise<Ligne[]> {
  const tout: Ligne[] = [];
  for (let i = 0; i < PAGES_AU_PLUS; i += 1) {
    const { data, error } = await requete(i * PAGE, i * PAGE + PAGE - 1);
    if (error) throw new Error(String((error as { message?: string })?.message ?? error));
    const lot = data ?? [];
    tout.push(...lot);
    if (lot.length < PAGE) break;
  }
  return tout;
}

/** Des identifiants en tranches de cent : une liste `in` trop longue dépasse l'adresse. */
async function parTranches(ids: readonly string[], lis: (tranche: string[]) => Promise<Ligne[]>): Promise<Ligne[]> {
  const tout: Ligne[] = [];
  const uniques = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniques.length; i += 100) tout.push(...await lis(uniques.slice(i, i + 100)));
  return tout;
}

type Prestation = { name?: string; durationMin?: number; dureeParLongueur?: Partial<Record<string, number>> };

/** Le rendez-vous de la base, lu comme la règle le lit. Le prix n'est connu
    que FIGÉ (`prixFigeLu`) : le serveur ne lit pas le tarif de la tête. */
function rdvDe(l: Ligne, prestations: ReadonlyMap<string, Prestation>, nomDe: (id?: string) => string | undefined): RdvLu {
  const d = (l.data ?? {}) as Record<string, unknown> & RdvLu & { serviceIds?: string[]; clientName?: string; priceXof?: unknown; longueur?: string };
  return {
    ...d,
    id: l.id,
    branchId: (d.branchId as string | undefined) ?? (l.branch_id ?? undefined),
    qui: nomDe(d.clientId) ?? d.clientName,
    libelle: (d.serviceIds ?? []).map((id) => prestations.get(id)?.name).filter(Boolean).join(', ') || undefined,
    dureeMin: dureeLue(d, prestations),
    prixXof: prixFigeLu(d),
  };
}

/** Les comptes du personnel qui ont tenu le comptoir aujourd'hui : ceux qui
    ont ENCAISSÉ, c'est-à-dire écrit une pièce depuis le Trône (la trace,
    0092). « Qui a encaissé ce jour-là » (Yéman, 5 novembre 2026) : un maître
    qui a seulement posé ou déplacé un rendez-vous n'est pas prévenu. */
async function lesComptesDuComptoir(sb: Base, jour: string): Promise<string[]> {
  const lignes = await parPages((de, a) => sb.from('traces').select('id, compte')
    .eq('table_name', 'invoices').eq('porte', 'trone').not('compte', 'is', null)
    .gte('fait_le', minuitDe(jour)).lt('fait_le', minuitDe(lendemain(jour))).order('id').range(de, a));
  return [...new Set(lignes.map((t) => String(t.compte ?? '')).filter(Boolean))];
}

/** Une notification par compte, des nombres seulement : le titre et le corps viennent de `notificationDeLaCloture`. */
async function previens(sb: Base, url: string, service: string, jour: string, note: { titre: string; corps: string }): Promise<number> {
  const { data: souverains } = await sb.from('staff').select('user_id').eq('role', 'souverain');
  const direction = ((souverains ?? []) as Ligne[]).map((s) => String(s.user_id ?? '')).filter(Boolean);
  let comptoir: string[] = [];
  try { comptoir = await lesComptesDuComptoir(sb, jour); } catch (e) { dis('comptoir illisible', { motif: String((e as Error)?.message ?? e).slice(0, 80) }); }
  const { data: personnel } = comptoir.length ? await sb.from('staff').select('user_id').in('user_id', comptoir) : { data: [] };
  const destinataires = [...new Set([...direction, ...((personnel ?? []) as Ligne[]).map((s) => String(s.user_id ?? ''))].filter(Boolean))];
  let envoyes = 0;
  for (const userId of destinataires) {
    try {
      const r = await fetch(`${url}/functions/v1/push-notify`, {
        method: 'POST', signal: AbortSignal.timeout(ENVOI_MAX_MS),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
        body: JSON.stringify({ mode: 'to-staff', userId, title: note.titre, body: note.corps, url: ADRESSE, tag: ETIQUETTE }),
      });
      envoyes += Number(((await r.json().catch(() => ({}))) as { sent?: number }).sent ?? 0) || 0;
    } catch (e) {
      dis('notification en échec', { motif: String((e as Error)?.message ?? e).slice(0, 80) });
    }
  }
  return envoyes;
}

/** La porte : la clé service (le cron), ou la session d'un souverain (un essai depuis le Trône). */
async function laPorte(sb: Base, req: Request, service: string): Promise<'cron' | 'souverain' | null> {
  const cle = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!cle) return null;
  if (service && cle === service) return 'cron';
  const { data: lu } = await sb.auth.getUser(cle);
  const uid = lu?.user?.id;
  if (!uid) return null;
  const { data: staff } = await sb.from('staff').select('user_id, role').eq('user_id', uid).eq('role', 'souverain').maybeSingle();
  return staff ? 'souverain' : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ ok: true, fonction: 'cloture-du-jour', version: VERSION, regle: VERSION_DE_LA_CLOTURE });
  if (req.method !== 'POST') return json({ ok: false, motif: 'POST seulement', version: VERSION }, 405);
  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  if (!url || !service) return json({ ok: false, motif: 'environnement', version: VERSION }, 500);
  const sb: Base = createClient(url, service);
  try {
    const porte = await laPorte(sb, req, service);
    if (!porte) return json({ ok: false, motif: 'reserve-au-cron-et-aux-souverains', version: VERSION }, 403);
    const corps = (await req.json().catch(() => ({}))) as { source?: string; moment?: string };
    const essai = porte === 'souverain' || corps.source === 'essai';
    const matin = corps.moment === 'matin';

    const maintenantMs = Date.now();
    const ici = aCotonouLe(maintenantMs);
    const jour = matin ? aCotonouLe(maintenantMs - 86_400_000).jour : ici.jour;

    /* ① LES RÉGLAGES : les heures de la clôture, les horaires de la Maison. */
    const { data: docs } = await sb.from('documents').select('key, data').in('key', ['mnd_settings', 'mnd_horaires_exceptions', 'mnd_offers']);
    const doc = (k: string): unknown => ((docs ?? []) as { key: string; data: unknown }[]).find((d) => d.key === k)?.data ?? null;
    const reglages = (doc('mnd_settings') ?? {}) as { hours?: HeuresDuJourLues[]; cloture?: { heures?: unknown } };
    const heures = heuresDeLaCloture(reglages.cloture?.heures);
    if (!matin && !essai && !heures.includes(ici.heure)) {
      return json({ ok: true, version: VERSION, rien: 'pas une heure de clôture', heure: ici.heure, heures });
    }
    const moment = matin ? 'matin' : String(ici.heure);
    const exceptionsBrutes = doc('mnd_horaires_exceptions');
    const ferme = laMaisonEstFermee(jour, Array.isArray(reglages.hours) ? reglages.hours : [], Array.isArray(exceptionsBrutes) ? exceptionsBrutes as ExceptionLue[] : []);
    const offresBrutes = doc('mnd_offers');
    const offres = (Array.isArray(offresBrutes) ? offresBrutes : []) as OffreLue[];

    /* ② LA JOURNÉE : ses rendez-vous, ses pièces (du jour, réglées ce jour,
       ou d'un rendez-vous du jour), ses fiches, le catalogue, les pièces
       effacées, les décisions de la direction, les papiers en salle. */
    const lignesRdv = await parPages((de, a) => sb.from('appointments').select('id, branch_id, data, updated_at').eq('data->>date', jour).order('id').range(de, a));
    const idsRdv = lignesRdv.map((l) => l.id);
    const pieces = new Map<string, Ligne>();
    for (const l of await parPages((de, a) => sb.from('invoices').select('id, branch_id, data, updated_at').eq('data->>date', jour).order('id').range(de, a))) pieces.set(l.id, l);
    for (const l of await parPages((de, a) => sb.from('invoices').select('id, branch_id, data, updated_at').filter('data->payments', 'cs', JSON.stringify([{ date: jour }])).order('id').range(de, a))) pieces.set(l.id, l);
    for (const l of await parTranches(idsRdv, async (t) => (await sb.from('invoices').select('id, branch_id, data, updated_at').in('data->>apptId', t)).data ?? [])) pieces.set(l.id, l);
    const idsFiches = [...lignesRdv.map((l) => String(l.data?.clientId ?? '')), ...[...pieces.values()].flatMap((l) => [String(l.data?.clientId ?? ''), String(l.data?.forClientId ?? '')])];
    const lignesFiches = await parTranches(idsFiches, async (t) => (await sb.from('clients').select('id, data').in('id', t)).data ?? []);
    const prestations = new Map<string, Prestation>();
    for (const l of await parPages((de, a) => sb.from('catalog_services').select('id, data').order('id').range(de, a))) prestations.set(l.id, (l.data ?? {}) as Prestation);
    const traces = await parPages((de, a) => sb.from('traces').select('id, piece_id, fait_le, compte_nom, porte, avant')
      .eq('table_name', 'invoices').eq('operation', 'efface')
      .gte('fait_le', minuitDe(jour)).lt('fait_le', minuitDe(lendemain(jour))).order('id').range(de, a));
    const decisionsBrutes = await parPages((de, a) => sb.from('cloture_decisions').select('id, branch_id, data').order('id').range(de, a));
    const papiers = await parTranches([...pieces.keys()], async (t) => (await sb.from('envois').select('id, data').eq('data->>type', TYPE_DU_PAPIER).in('data->>invoiceId', t)).data ?? []);
    /* LES DÉPENSES (5 novembre 2026), LUES ET JAMAIS ÉCRITES : celles du
       jour, celles qui attendent un oui, et celles écrites pour l'écart d'un
       comptage du jour ; les comptages de tiroir du jour. */
    const lignesComptages = await parPages((de, a) => sb.from('clotures_caisse').select('id, branch_id, data').eq('data->>date', jour).order('id').range(de, a));
    const lignesDepenses = new Map<string, Ligne>();
    for (const l of await parPages((de, a) => sb.from('expenses').select('id, branch_id, data').eq('data->>date', jour).order('id').range(de, a))) lignesDepenses.set(l.id, l);
    for (const l of await parPages((de, a) => sb.from('expenses').select('id, branch_id, data').eq('data->validation->>etat', 'attente').order('id').range(de, a))) lignesDepenses.set(l.id, l);
    for (const l of await parTranches(lignesComptages.map((l) => l.id), async (t) => (await sb.from('expenses').select('id, branch_id, data').in('data->>ecartDe', t)).data ?? [])) lignesDepenses.set(l.id, l);

    const fiches: FicheLue[] = lignesFiches.map((l) => {
      const d = (l.data ?? {}) as { name?: string; sansPapiersWa?: boolean; phone?: string; prixFixes?: Record<string, unknown> };
      return { id: l.id, nom: d.name, sansPapiersWa: d.sansPapiersWa === true, aUnNumero: !!String(d.phone ?? '').trim(),
        prixConvenus: Object.values(d.prixFixes ?? {}).some((v) => typeof v === 'number' && v > 0) };
    });
    const nomDe = (id?: string) => (id ? fiches.find((c) => c.id === id)?.nom : undefined);
    let rdvs: RdvLu[] = lignesRdv.map((l) => rdvDe(l, prestations, nomDe));
    let lesPieces: PieceLue[] = [...pieces.values()].map((l) => ({ ...((l.data ?? {}) as PieceLue), id: l.id, branchId: (l.data?.branchId as string | undefined) ?? (l.branch_id ?? undefined) }));
    const effacements: EffacementLu[] = traces.map((t) => ({
      traceId: String(t.id), pieceId: String(t.piece_id ?? ''), faitLe: String(t.fait_le ?? ''), par: (t.compte_nom as string | undefined) ?? undefined,
      porte: (t.porte as string | undefined) ?? undefined, avant: t.avant ? { ...(t.avant as PieceLue), id: String(t.piece_id ?? '') } : null,
    }));
    const decisions: DecisionLue[] = decisionsBrutes.map((l) => ({ ...((l.data ?? {}) as DecisionLue), cle: String(l.data?.cle ?? '') })).filter((d) => !!d.cle);
    let envois: EnvoiDePapierLu[] = papiers.map((l) => ({ id: l.id, type: String(l.data?.type ?? ''), statut: String(l.data?.statut ?? ''), invoiceId: String(l.data?.invoiceId ?? '') }));
    /* La photo du reçu ne se recopie pas : la règle demande seulement si elle est là. */
    const depenses: DepenseLue[] = [...lignesDepenses.values()].map((l) => {
      const d = (l.data ?? {}) as DepenseLue;
      return { ...d, id: l.id, branchId: d.branchId ?? (l.branch_id ?? undefined), fichier: d.fichier ? true : undefined };
    });
    const comptages: ComptageLu[] = lignesComptages.map((l) => ({ ...((l.data ?? {}) as ComptageLu), id: l.id, branchId: (l.data?.branchId as string | undefined) ?? (l.branch_id ?? undefined) }));
    /* L'heure de la relecture des dépenses : la dernière clôture du jour. */
    const heureDesDepenses = Math.max(...heures);

    /* Les maisons qui ont vécu ce jour-là : un rendez-vous, une pièce, une
       pièce effacée, une dépense du jour ou un comptage de tiroir. */
    const branches = [...new Set([...rdvs.map((r) => r.branchId ?? ''), ...lesPieces.map((p) => p.branchId ?? ''), ...effacements.map((e) => e.avant?.branchId ?? ''),
      ...depenses.filter((e) => e.date === jour).map((e) => e.branchId ?? ''), ...comptages.map((c) => c.branchId ?? '')].filter(Boolean))];
    if (ferme && branches.length === 0) {
      dis('maison fermée', { jour });
      return json({ ok: true, version: VERSION, jour, moment, ferme: true, rien: 'la Maison est fermée ce jour' });
    }

    const resultats: Record<string, unknown>[] = [];
    const total = { rdv: 0, clos: 0, aClore: 0, aRevoir: 0, alarmes: 0, papiers: 0, honores: 0, relies: 0 };
    let pourLaNotification: ClotureDuJour | null = null;
    for (const branche of branches) {
      const faitsDe = (): FaitsDeLaJournee => ({ jour, maintenantMs, branchId: branche, ferme, rdvs, pieces: lesPieces, fiches, offres, effacements, decisions, envois, depenses, comptages, heureDesDepenses });
      const premiere = clotureDuJour(faitsDe());
      const faits: { genre: string; cle: string; dit: string }[] = [];
      const passes: { cle: string; pourquoi: string }[] = [];

      /* ③ LES TROIS GESTES SÛRS, chacun relu et écrit sous condition. */
      for (const g of premiere.gestes) {
        /* Le mot du matin n'envoie aucun papier : celui d'hier ne part pas
           aujourd'hui (le retard reste invisible). */
        if (matin && g.genre === 'envoyer-le-papier') { passes.push({ cle: g.cle, pourquoi: 'le papier d’hier ne part pas le lendemain' }); continue; }
        const idRdv = g.rdvId;
        const idPiece = g.genre === 'passer-honore' ? undefined : g.pieceId;
        const frais = idRdv ? (await sb.from('appointments').select('id, branch_id, data, updated_at').eq('id', idRdv).maybeSingle()).data as Ligne | null : null;
        const fraiche = idPiece ? (await sb.from('invoices').select('id, branch_id, data, updated_at').eq('id', idPiece).maybeSingle()).data as Ligne | null : null;
        if ((idRdv && !frais) || (idPiece && !fraiche)) { passes.push({ cle: g.cle, pourquoi: 'la ligne n’existe plus' }); continue; }
        const rdvsFrais = frais ? rdvs.map((r) => (r.id === frais.id ? rdvDe(frais, prestations, nomDe) : r)) : rdvs;
        const piecesFraiches = fraiche ? lesPieces.map((p) => (p.id === fraiche.id ? { ...((fraiche.data ?? {}) as PieceLue), id: fraiche.id } : p)) : lesPieces;
        if (!gesteToujoursValable(g, { ...faitsDe(), rdvs: rdvsFrais, pieces: piecesFraiches })) { passes.push({ cle: g.cle, pourquoi: 'la donnée a bougé' }); continue; }
        const le = new Date().toISOString();

        if (g.genre === 'passer-honore' && frais) {
          const data = { ...(frais.data ?? {}), status: 'honoré', honoreParGrenat: { le, moment } };
          const { data: ecrit } = await sb.from('appointments').update({ data }).eq('id', frais.id).eq('updated_at', frais.updated_at).select('id');
          if (!(ecrit ?? []).length) { passes.push({ cle: g.cle, pourquoi: 'la donnée a bougé' }); continue; }
          rdvs = rdvs.map((r) => (r.id === frais.id ? { ...r, status: 'honoré', honoreParGrenat: { le } } : r));
          faits.push({ genre: g.genre, cle: g.cle, dit: g.dit }); total.honores += 1;
        } else if (g.genre === 'relier-la-piece' && frais && fraiche) {
          const { data: ecrit } = await sb.from('invoices').update({ data: { ...(fraiche.data ?? {}), apptId: frais.id } })
            .eq('id', fraiche.id).eq('updated_at', fraiche.updated_at).select('id');
          if (!(ecrit ?? []).length) { passes.push({ cle: g.cle, pourquoi: 'la donnée a bougé' }); continue; }
          /* Le rendez-vous apprend sa pièce s'il n'en nomme aucune : c'est
             `invoiceId` qui garde le Carnet du double compte. */
          if (!frais.data?.invoiceId) {
            await sb.from('appointments').update({ data: { ...(frais.data ?? {}), invoiceId: fraiche.id } }).eq('id', frais.id).eq('updated_at', frais.updated_at);
          }
          lesPieces = lesPieces.map((p) => (p.id === fraiche.id ? { ...p, apptId: frais.id } : p));
          faits.push({ genre: g.genre, cle: g.cle, dit: g.dit }); total.relies += 1;
        } else if (g.genre === 'envoyer-le-papier' && fraiche) {
          /* LE DÉPÔT EN SALLE, « à-préparer » : une pièce, une ligne (la clé
             primaire). Une ligne en échec se reprend ; toute autre reste. */
          const id = idDuPapier(fraiche.id);
          const d = (fraiche.data ?? {}) as PieceLue;
          const ligne = {
            id, branchId: d.branchId ?? branche, type: TYPE_DU_PAPIER, canal: 'whatsapp', statut: A_PREPARER,
            invoiceId: fraiche.id, ...(g.rdvId ? { apptId: g.rdvId } : {}), clientId: d.clientId, papier: g.papier, montantXof: g.montantXof,
            jour, prenom: initialesDe(nomDe(d.forClientId ?? d.clientId)), deposeLe: le, quand: le, parQui: 'Grenat',
          };
          const { error } = await sb.from('envois').insert({ id, branch_id: d.branchId ?? branche, data: ligne });
          if (error && (error as { code?: string }).code === '23505') {
            const { data: repris } = await sb.from('envois').update({ data: ligne }).eq('id', id).eq('data->>statut', 'échec').select('id');
            if (!(repris ?? []).length) { passes.push({ cle: g.cle, pourquoi: 'déjà en salle' }); continue; }
          } else if (error) { passes.push({ cle: g.cle, pourquoi: `dépôt refusé : ${String(error.message ?? '').slice(0, 80)}` }); continue; }
          envois = [...envois.filter((e) => e.id !== id), { id, type: TYPE_DU_PAPIER, statut: A_PREPARER, invoiceId: fraiche.id }];
          faits.push({ genre: g.genre, cle: g.cle, dit: g.dit }); total.papiers += 1;
        }
      }

      /* La journée rejugée après les gestes : c'est elle que le compte rendu dit. */
      const finale = clotureDuJour(faitsDe());
      total.rdv += finale.comptes.rdv; total.clos += finale.comptes.clos;
      total.aClore += finale.comptes.aEncaisser + finale.comptes.sansEtat; total.aRevoir += finale.comptes.aRevoir; total.alarmes += finale.comptes.alarmes;
      if (!pourLaNotification || finale.comptes.rdv > pourLaNotification.comptes.rdv) pourLaNotification = finale;

      /* ④ LE COMPTE RENDU. Relancée à la même heure, la fonction le réécrit
         sans renotifier : l'heure de la notification passe d'une écriture à l'autre. */
      const idCr = `${branche}|${jour}|${moment}`;
      const { data: avant } = await sb.from('clotures_de_grenat').select('data').eq('id', idCr).maybeSingle();
      const notifieLe = (avant?.data as { notifieLe?: string } | null)?.notifieLe ?? null;
      const compteRendu = {
        id: idCr, branchId: branche, jour, moment, heures, source: essai ? 'essai' : 'cron', version: VERSION, ecritLe: new Date().toISOString(),
        cloture: finale, gestesFaits: faits, gestesPasses: passes, ...(notifieLe ? { notifieLe } : {}),
      };
      const { error: errCr } = await sb.from('clotures_de_grenat').upsert({ id: idCr, branch_id: branche, data: compteRendu }, { onConflict: 'id' });
      if (errCr) dis('compte rendu non écrit', { branche, motif: String(errCr.message ?? '').slice(0, 80) });
      resultats.push({ branche, verdict: finale.verdict.dit, gestes: faits.length, passes: passes.length, dejaNotifie: !!notifieLe });
    }

    /* Le bilan pour Saphir : des compteurs, jamais un nom. */
    await sb.from('assistants_bilans').upsert({ id: `grenat:${jour}`, assistant: 'grenat', jour, comptes: total }, { onConflict: 'id' });

    /* ⑤ PRÉVENIR, une fois par passage, ni à l'essai ni au mot du matin
       (Saphir le dit à 7 h). */
    let notifies = 0;
    const dejaDit = resultats.some((r) => r.dejaNotifie === true);
    if (!essai && !matin && !dejaDit && pourLaNotification) {
      notifies = await previens(sb, url, service, jour, notificationDeLaCloture(pourLaNotification, ici.heure));
      const notifieLe = new Date().toISOString();
      for (const branche of branches) {
        const idCr = `${branche}|${jour}|${moment}`;
        const { data: cr } = await sb.from('clotures_de_grenat').select('data').eq('id', idCr).maybeSingle();
        if (cr?.data) await sb.from('clotures_de_grenat').update({ data: { ...(cr.data as object), notifieLe } }).eq('id', idCr);
      }
    }
    dis('clôture écrite', { jour, moment, branches: branches.length, notifies, total });
    return json({ ok: true, version: VERSION, jour, moment, ferme, resultats, total, notifies });
  } catch (e) {
    dis('erreur', { motif: String((e as Error)?.message ?? e).slice(0, 160) });
    return json({ ok: false, motif: 'erreur', version: VERSION }, 500);
  }
});
