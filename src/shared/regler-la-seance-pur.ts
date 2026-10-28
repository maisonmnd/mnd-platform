/* ══ RÉGLER SA SÉANCE — 25 octobre 2026 ═════════════════════════════════
   « Donner la possibilité à chaque client de payer son RDV avant de venir à
   sa séance, ou quand je marque terminer la séance, le client reçoit un
   message avec le paiement de sa séance en direct sur son WhatsApp »
   (Yéman). Maquette : vues 9 à 11 du canvas du Tableau intelligent.

   UN LIEN PAR RENDEZ-VOUS. Le Trône pose sur le rendez-vous un jeton tiré
   au hasard (`lienDeReglement`) ; le bouton « Régler » du message mène à
   payer.html?tg=r-<jeton>, qui ouvre regler.html. La page relit le
   rendez-vous et SA pièce à chaque ouverture, au serveur : elle dit le
   juste reste, jamais un montant venu du navigateur. Réglée au comptoir
   entre-temps, elle dit « Déjà réglée, merci » et ne prend plus rien.

   L'ARGENT ARRIVE PAR KKIAPAY (MTN, Moov, Celtiis, carte ; les frais restent
   à la cliente, comme partout en ligne). La fonction `regler-la-seance`
   redemande la vérité à KkiaPay, inscrit la transaction au registre
   (`payments`, référence reg-<rendez-vous>), pose le versement kkia-<id>
   sur la pièce ET sur le rendez-vous, caisse KkiaPay. Ce qui dépasse le
   reste est le pourboire, pour l'équipe : jamais dans la pièce.

   Ce fichier est PUR. La fonction en porte une copie, mot pour mot, entre
   ses deux bornes (scripts/regler-copie-serveur.mjs la réécrit, le banc
   verifie-regler-la-seance la compare). Les calculs de la pièce sont ceux
   de finance.ts (invoiceTotal, invoiceRegleXof, invoiceResteXof) : le banc
   les rejoue côte à côte. */

/** Le jeton : quatorze signes sans ambiguïté (ni 0/o, ni 1/l/i). */
export const ALPHABET_DU_JETON = '23456789abcdefghjkmnpqrstuvwxyz';
export const LONGUEUR_DU_JETON = 14;
/** Ce que porte le bouton du modèle Meta : payer.html?tg=r-<jeton>. */
export const PREFIXE_DU_PARAMETRE = 'r-';
/** La référence au registre `payments` et chez KkiaPay. Jamais l'identifiant
    nu du rendez-vous : le filet de KkiaPay y confirmerait un acompte. */
export const PREFIXE_DE_LA_REFERENCE = 'reg-';
/** Le versement posé sur la pièce : le même préfixe que la Boutique. */
export const PREFIXE_DU_VERSEMENT = 'kkia-';
export const CAISSE_EN_LIGNE = 'KkiaPay';
export const DECALAGE_DE_COTONOU_MS = 3_600_000;

export type LienDeReglement = {
  jeton: string;
  creeLe: string;
  /** Le message parti (le Trône l'écrit quand WhatsApp l'a pris). */
  envoyeLe?: string;
  /** Première ouverture de la page par la cliente (écrite par le serveur). */
  ouvertLe?: string;
  /** Le dernier règlement reçu par ce lien. */
  payeLe?: string;
  /** Tap & Go proposé à côté, tant que le reste n'a pas bougé. */
  tapgo?: { resteXof: number; parametre: string; totalXof: number };
};

/** La trace d'un règlement en ligne, sur la pièce : le Trône s'en sert pour
    le pourboire de l'équipe, le reçu et l'annonce au comptoir. */
export type ReglementEnLigne = {
  id: string;
  transactionId: string;
  payeLe: string;
  montantXof: number;
  pourboireXof: number;
  fraisXof: number;
  moyen?: string;
  partsLe?: string;
  recuLe?: string;
};

export type LigneLue = { label?: string; qty?: number; unitXof?: number; discountPct?: number; discountXof?: number };
export type VersementLu = { id: string; amountXof: number; date?: string; method?: string; cashbox?: string; time?: string; note?: string; invoiceId?: string };
export type PieceLue = {
  id: string; kind?: string; status?: string; number?: string; date?: string;
  clientId?: string; forClientId?: string; clientName?: string; apptId?: string;
  lines?: LigneLue[]; globalDiscountPct?: number; globalDiscountXof?: number;
  payments?: VersementLu[]; payment?: string; cashbox?: string; time?: string;
  tipXof?: number; reglementsEnLigne?: ReglementEnLigne[];
};
export type RdvLu = {
  id: string; clientId?: string; clientName?: string; date?: string; time?: string;
  master?: string; status?: string; payments?: VersementLu[]; paidXof?: number;
  lienDeReglement?: LienDeReglement;
  lienDuFoyer?: LienDuFoyer;
};

/* ══ LE RÈGLEMENT DU FOYER — 28 octobre 2026 ═════════════════════════════
   « Le bouton lien de paiement doit mener au bouton Régler pour passer par
   KkiaPay » (Yéman, sur la fenêtre « Un seul lien pour le foyer »). UN jeton
   pour plusieurs rendez-vous, posé sur chacun (`lienDuFoyer`) : la page dit
   chaque tête, sa pièce et son reste, et n'en fait qu'un montant. L'argent se
   répartit pièce par pièce, dans l'ordre des rendez-vous ; ce qui dépasse le
   tout est le pourboire de l'équipe, sur la dernière pièce. */
export type LienDuFoyer = {
  jeton: string;
  /** Les rendez-vous que le lien règle ensemble, tels que le Trône les a cochés. */
  apptIds: string[];
  creeLe: string;
  envoyeLe?: string;
  ouvertLe?: string;
  payeLe?: string;
};

/** Un jeton neuf, tiré de quatorze aléas (crypto.getRandomValues). */
export function jetonDe(aleas: ArrayLike<number>): string {
  let t = '';
  for (let i = 0; i < LONGUEUR_DU_JETON; i++) t += ALPHABET_DU_JETON[Math.abs(Math.floor(Number(aleas[i] ?? 0))) % ALPHABET_DU_JETON.length];
  return t;
}

export const estUnJeton = (s: unknown): s is string =>
  typeof s === 'string' && s.length === LONGUEUR_DU_JETON && [...s].every((c) => ALPHABET_DU_JETON.includes(c));

export const parametreDuLien = (jeton: string): string => `${PREFIXE_DU_PARAMETRE}${jeton}`;

/** Le jeton d'un paramètre « r-… », ou null (un paramètre Tap & Go n'en est pas un). */
export function jetonDuParametre(tg: unknown): string | null {
  const s = String(tg ?? '');
  if (!s.startsWith(PREFIXE_DU_PARAMETRE)) return null;
  const j = s.slice(PREFIXE_DU_PARAMETRE.length);
  return estUnJeton(j) ? j : null;
}

export const referenceDuRdv = (rdvId: string): string => `${PREFIXE_DE_LA_REFERENCE}${rdvId}`;

/** La référence d'un règlement du foyer au registre (`reg-foyer-<jeton>`) :
    jamais l'identifiant d'un rendez-vous, le filet de KkiaPay n'y pose rien. */
export const referenceDuFoyer = (jeton: string): string => `${PREFIXE_DE_LA_REFERENCE}foyer-${jeton}`;

/** Le jour et l'heure de Cotonou (UTC+1, sans heure d'été). */
export const jourDeCotonou = (d: Date): string => new Date(d.getTime() + DECALAGE_DE_COTONOU_MS).toISOString().slice(0, 10);
export const heureDeCotonou = (d: Date): string => new Date(d.getTime() + DECALAGE_DE_COTONOU_MS).toISOString().slice(11, 16);

const n = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);

/** La ligne, nette de sa remise : `ligneNetXof` de finance.ts. */
export const netDeLaLigne = (l: LigneLue): number =>
  Math.max(0, n(l.qty) * n(l.unitXof) * (1 - n(l.discountPct) / 100) - n(l.discountXof));

/** Le total de la pièce : `invoiceTotal` de finance.ts. */
export const totalDeLaPiece = (p: PieceLue): number => {
  const sub = (p.lines ?? []).reduce((s, l) => s + netDeLaLigne(l), 0);
  return Math.max(0, Math.round(sub * (1 - n(p.globalDiscountPct) / 100)) - n(p.globalDiscountXof));
};

/** Ce qui est reçu : `invoiceRegleXof` (une pièce d'avant le journal, soldée, vaut son total). */
export const regleDeLaPiece = (p: PieceLue): number => {
  if (p.payments && p.payments.length > 0) return p.payments.reduce((s, v) => s + n(v.amountXof), 0);
  return p.status === 'payée' ? totalDeLaPiece(p) : 0;
};

/** Ce qui reste dû : `invoiceResteXof`. */
export const resteDeLaPiece = (p: PieceLue): number => Math.max(0, totalDeLaPiece(p) - regleDeLaPiece(p));

/** LA PIÈCE DU RENDEZ-VOUS : une facture qui porte son identifiant, jamais
    annulée ; celle qui doit encore quelque chose d'abord, puis la plus récente. */
export function laPieceDuRdv(pieces: readonly PieceLue[], rdvId: string): PieceLue | null {
  const siennes = pieces.filter((p) => p && p.apptId === rdvId && (p.kind ?? 'facture') === 'facture' && p.status !== 'annulée');
  if (!siennes.length) return null;
  return [...siennes].sort((a, b) => (resteDeLaPiece(b) > 0 ? 1 : 0) - (resteDeLaPiece(a) > 0 ? 1 : 0) || String(b.date ?? '').localeCompare(String(a.date ?? '')))[0];
}

export type EtatDuLien = 'introuvable' | 'annule' | 'sans-piece' | 'reglee' | 'a-regler';

/** CE QUE DIT LE LIEN : le rendez-vous, sa pièce, et le juste reste. */
export function etatDuLien(rdv: RdvLu | null, piece: PieceLue | null): { etat: EtatDuLien; totalXof: number; recuXof: number; resteXof: number } {
  if (!rdv) return { etat: 'introuvable', totalXof: 0, recuXof: 0, resteXof: 0 };
  if (rdv.status === 'annulé') return { etat: 'annule', totalXof: 0, recuXof: 0, resteXof: 0 };
  if (!piece) return { etat: 'sans-piece', totalXof: 0, recuXof: 0, resteXof: 0 };
  const totalXof = totalDeLaPiece(piece);
  const recuXof = regleDeLaPiece(piece);
  const resteXof = resteDeLaPiece(piece);
  return { etat: resteXof > 0 ? 'a-regler' : 'reglee', totalXof, recuXof, resteXof };
}

/** LE PARTAGE DE L'ARGENT REÇU : le reste d'abord (un franc d'arrondi
    absorbé), le pourboire ensuite, qui est tout ce qui dépasse. */
export function partageDuPaiement(payeXof: number, attenduXof: number):
  { ok: true; versementXof: number; pourboireXof: number } | { ok: false; raison: 'deja_reglee' | 'montant' } {
  const paye = Math.round(n(payeXof));
  const attendu = Math.round(n(attenduXof));
  if (attendu <= 0) return { ok: false, raison: 'deja_reglee' };
  if (paye + 1 < attendu) return { ok: false, raison: 'montant' };
  return { ok: true, versementXof: attendu, pourboireXof: Math.max(0, paye - attendu) };
}

/** Le moyen que KkiaPay dit, en clair. */
export const moyenDit = (source: unknown): string => {
  const s = String(source ?? '').toUpperCase();
  if (s.includes('CARD')) return 'carte';
  if (s.includes('MTN')) return 'MTN';
  if (s.includes('MOOV')) return 'Moov';
  if (s.includes('CELTIIS')) return 'Celtiis';
  return s ? 'Mobile Money' : '';
};

/** LE VERSEMENT POSÉ SUR LA PIÈCE ET LE RENDEZ-VOUS (même identifiant). */
export function versementEnLigne(o: { transactionId: string; montantXof: number; source?: string; quand: Date }): VersementLu {
  const moyen = moyenDit(o.source);
  return {
    id: `${PREFIXE_DU_VERSEMENT}${o.transactionId}`,
    date: jourDeCotonou(o.quand),
    time: heureDeCotonou(o.quand),
    amountXof: Math.round(n(o.montantXof)),
    method: CAISSE_EN_LIGNE,
    cashbox: CAISSE_EN_LIGNE,
    note: `Réglé en ligne par la cliente${moyen ? ` · ${moyen}` : ''} · transaction ${o.transactionId}`,
  };
}

export const dejaInscrit = (p: PieceLue, transactionId: string): boolean =>
  (p.payments ?? []).some((v) => v.id === `${PREFIXE_DU_VERSEMENT}${transactionId}`);

/** LA PIÈCE APRÈS LE RÈGLEMENT : le versement, le statut qui suit l'argent,
    le pourboire à part (tipXof) et la trace pour le Trône. */
export function pieceReglee(p: PieceLue, v: VersementLu, pourboireXof: number, trace: ReglementEnLigne): PieceLue {
  const payments = [...(p.payments ?? []), v];
  const suivante: PieceLue = { ...p, payments };
  const solde = resteDeLaPiece(suivante) <= 0;
  return {
    ...suivante,
    status: solde ? 'payée' : p.status,
    payment: p.payment ?? CAISSE_EN_LIGNE,
    cashbox: p.cashbox ?? CAISSE_EN_LIGNE,
    time: p.time ?? v.time,
    ...(pourboireXof > 0 ? { tipXof: n(p.tipXof) + Math.round(pourboireXof) } : {}),
    reglementsEnLigne: [...(p.reglementsEnLigne ?? []).filter((r) => r.id !== trace.id), trace],
  };
}

/** LE RENDEZ-VOUS SUIT SA PIÈCE : le même versement, sous le même
    identifiant (la règle de `rendezVousRegles`), et le lien dit qu'il a payé :
    celui du rendez-vous, ou celui du foyer quand l'argent vient de lui. */
export function rdvRegle(r: RdvLu, v: VersementLu, pieceId: string, parLeFoyer = false): RdvLu {
  if ((r.payments ?? []).some((x) => x.id === v.id)) return r;
  const payes = r.payments?.length ? r.payments.reduce((s, x) => s + n(x.amountXof), 0) : n(r.paidXof);
  const payeLe = `${v.date}T${v.time ?? '00:00'}`;
  return {
    ...r,
    paidXof: payes + n(v.amountXof),
    payments: [...(r.payments ?? []), { id: v.id, amountXof: v.amountXof, date: v.date, method: v.method, cashbox: v.cashbox, invoiceId: pieceId }],
    ...(!parLeFoyer && r.lienDeReglement ? { lienDeReglement: { ...r.lienDeReglement, payeLe } } : {}),
    ...(parLeFoyer && r.lienDuFoyer ? { lienDuFoyer: { ...r.lienDuFoyer, payeLe } } : {}),
  };
}

/** Le prénom seul : la page ne montre rien de plus d'elle. */
export const prenomDe = (nom: unknown): string => String(nom ?? '').trim().split(/\s+/)[0] ?? '';

/** Le maître, sauf le calendrier commun (« Team »). */
export const maitreDit = (master: unknown): string => {
  const p = prenomDe(master);
  return /^team$/i.test(p) ? '' : p;
};

/** Les lignes que la page affiche : un libellé, un montant net. */
export const lignesDites = (p: PieceLue): { label: string; montantXof: number }[] =>
  (p.lines ?? []).filter((l) => String(l.label ?? '').trim()).map((l) => ({ label: String(l.label).trim(), montantXof: Math.round(netDeLaLigne(l)) }));

/** CE QUE LA PAGE REÇOIT, et rien de plus : ni numéro, ni nom de famille. */
export function pageDuLien(o: { rdv: RdvLu | null; piece: PieceLue | null; nomDeLaCliente?: string; branchId?: string; maintenant: Date }) {
  const e = etatDuLien(o.rdv, o.piece);
  const lien = o.rdv?.lienDeReglement;
  const tapgo = lien?.tapgo && e.etat === 'a-regler' && Math.round(n(lien.tapgo.resteXof)) === e.resteXof
    ? { parametre: lien.tapgo.parametre, totalXof: Math.round(n(lien.tapgo.totalXof)) }
    : undefined;
  return {
    etat: e.etat,
    prenom: prenomDe(o.nomDeLaCliente ?? o.rdv?.clientName),
    maitre: maitreDit(o.rdv?.master),
    jour: o.rdv?.date ?? '',
    lignes: o.piece ? lignesDites(o.piece) : [],
    totalXof: e.totalXof,
    recuXof: e.recuXof,
    resteXof: e.resteXof,
    pourboire: !!o.piece && !(n(o.piece.tipXof) > 0),
    reference: o.rdv ? referenceDuRdv(o.rdv.id) : '',
    branchId: o.branchId ?? '',
    ...(tapgo ? { tapgo } : {}),
  };
}

/** LA RÉPARTITION DU FOYER : chaque pièce reçoit son reste, dans l'ordre
    donné ; un franc d'arrondi absorbé, comme pour une pièce seule ; ce qui
    dépasse le tout est le pourboire. Un argent qui ne couvre pas le tout ne
    se pose pas : il reste au registre, « à rapprocher » au comptoir. */
export function repartitionDuFoyer(payeXof: number, restes: readonly { id: string; resteXof: number }[]):
  { ok: true; parts: { id: string; montantXof: number }[]; pourboireXof: number } | { ok: false; raison: 'deja_reglee' | 'montant' } {
  const paye = Math.round(n(payeXof));
  const parts = restes.map((r) => ({ id: r.id, montantXof: Math.round(n(r.resteXof)) })).filter((r) => r.montantXof > 0);
  const total = parts.reduce((s, r) => s + r.montantXof, 0);
  if (total <= 0) return { ok: false, raison: 'deja_reglee' };
  if (paye + 1 < total) return { ok: false, raison: 'montant' };
  return { ok: true, parts, pourboireXof: Math.max(0, paye - total) };
}

/** LE VERSEMENT DU FOYER SUR UNE DE SES PIÈCES : son identifiant porte la
    pièce (kkia-<transaction>-<pièce>), pour que deux pièces réglées par la
    même transaction ne se confondent jamais, ni en caisse ni au comptoir. */
export const idDuVersementDuFoyer = (transactionId: string, pieceId: string): string =>
  `${PREFIXE_DU_VERSEMENT}${transactionId}-${pieceId}`;

/** Une tête du foyer, telle que la page la montre : son prénom, son jour, ses lignes, son reste. */
export type TeteDuFoyer = { prenom: string; jour: string; lignes: { label: string; montantXof: number }[]; resteXof: number };

/** CE QUE LA PAGE DU FOYER REÇOIT : les têtes dont la pièce existe, le tout
    en un montant, et la référence du foyer. Ni numéro, ni nom de famille. */
export function pageDuFoyer(o: {
  tetes: readonly { rdv: RdvLu; piece: PieceLue | null; nom?: string }[]; jeton: string; branchId?: string; maintenant: Date;
}) {
  const vivantes = o.tetes.filter((t) => t.rdv.status !== 'annulé');
  const avecPiece = vivantes.filter((t) => !!t.piece);
  const etats = avecPiece.map((t) => etatDuLien(t.rdv, t.piece));
  const totalXof = etats.reduce((s, e) => s + e.totalXof, 0);
  const recuXof = etats.reduce((s, e) => s + e.recuXof, 0);
  const resteXof = etats.reduce((s, e) => s + e.resteXof, 0);
  const etat: EtatDuLien = o.tetes.length === 0 ? 'introuvable'
    : vivantes.length === 0 ? 'annule'
      : avecPiece.length === 0 ? 'sans-piece'
        : resteXof > 0 ? 'a-regler' : 'reglee';
  const tetes: TeteDuFoyer[] = avecPiece.map((t, i) => ({
    prenom: prenomDe(t.nom ?? t.rdv.clientName), jour: t.rdv.date ?? '', lignes: lignesDites(t.piece!), resteXof: etats[i].resteXof,
  }));
  const jours = [...new Set(tetes.map((t) => t.jour).filter(Boolean))];
  return {
    etat,
    prenom: '',
    maitre: '',
    jour: jours.length === 1 ? jours[0] : '',
    lignes: tetes.flatMap((t) => t.lignes.map((l) => ({ label: t.prenom ? `${t.prenom} · ${l.label}` : l.label, montantXof: l.montantXof }))),
    totalXof,
    recuXof,
    resteXof,
    pourboire: avecPiece.length > 0 && !avecPiece.some((t) => n(t.piece!.tipXof) > 0),
    reference: referenceDuFoyer(o.jeton),
    branchId: o.branchId ?? '',
    tetes,
  };
}
