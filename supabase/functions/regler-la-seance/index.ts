// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* regler-la-seance — la cliente règle sa séance depuis son téléphone
 * (25 octobre 2026).
 *
 * « Quand je marque terminer la séance, le client reçoit un message avec le
 * paiement de sa séance en direct sur son WhatsApp » (Yéman). Le bouton
 * « Régler » du message mène à payer.html?tg=r-<jeton>, qui ouvre la page
 * regler.html ; la page parle ici :
 *
 *   lire       — le jeton dit le rendez-vous ; on relit SA pièce et l'on rend
 *                le juste reste, le prénom, les lignes. Rien d'autre (ni
 *                numéro, ni nom de famille). La première ouverture se note
 *                sur le rendez-vous (`lienDeReglement.ouvertLe`) : le Trône
 *                la voit. Au passage, un paiement que seul le filet de
 *                KkiaPay a vu (page fermée trop tôt) se pose sur la pièce.
 *   regler     — après le widget KkiaPay : redemande la vérité à KkiaPay,
 *                inscrit la transaction au registre `payments` (référence
 *                reg-<rendez-vous>), pose le versement kkia-<id> sur la pièce
 *                ET sur le rendez-vous, caisse KkiaPay. Ce qui dépasse le
 *                reste est le pourboire de l'équipe (tipXof), jamais dans la
 *                pièce. Rejouable : un rejeu ne double rien.
 *   rattraper  — comme lire, sans noter d'ouverture (le Trône s'en sert).
 *
 * LE FOYER (28 octobre 2026, « le bouton lien de paiement doit mener au
 * bouton Régler pour passer par KkiaPay ») : un jeton posé sur plusieurs
 * rendez-vous (`lienDuFoyer`). Lire rend chaque tête et un seul montant ;
 * régler répartit l'argent pièce par pièce, dans l'ordre des rendez-vous
 * (référence reg-foyer-<jeton> au registre). Un jeton de rendez-vous passe
 * toujours d'abord : rien ne change pour lui.
 *
 * RÉGLER AVANT ET APRÈS (7 novembre 2026, « pourquoi je ne peux pas faire un
 * paiement d'un RDV sur ma couronne à n'importe quel moment ? ») : un jeton
 * que Ma Couronne a ouvert (`lienDeReglement.depuisLaCouronne`, posé par
 * terminer-et-regler) sur un rendez-vous SANS PIÈCE se lit et se règle au
 * prix figé moins l'argent déjà reçu, d'avance (avant l'heure du rituel) ou
 * après coup (dès le lendemain). Le versement kkia-<id> s'inscrit sur le
 * rendez-vous, sans pièce nommée ; le rendez-vous reste comme il est (jamais
 * « honoré ») ; le personnel l'apprend. Avec une pièce, rien ne change. Une
 * transaction déjà posée sur le rendez-vous ne se pose JAMAIS sur la pièce
 * du jour venu, qui l'a reprise en « Acompte ».
 *
 * Verify JWT : ÉTEINT (la cliente n'a pas de compte). Secrets : ceux de
 * kkiapay-verify (KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY, KKIAPAY_SECRET_KEY,
 * KKIAPAY_API_BASE) et SERVICE_KEY, déjà posés sur le projet : rien à ajouter.
 */

const VERSION = '2026-11-11-a';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const KKIA_BASE = Deno.env.get('KKIAPAY_API_BASE') ?? 'https://api.kkiapay.me';
const KKIA_VERIFY_PATH = '/api/v1/transactions/status';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify({ version: VERSION, ...(obj as object) }), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ── DEBUT copie de shared/regler-la-seance-pur.ts (verifie-regler-la-seance la compare, mot pour mot)
export const ALPHABET_DU_JETON = '23456789abcdefghjkmnpqrstuvwxyz';

export const LONGUEUR_DU_JETON = 14;

export const PREFIXE_DU_PARAMETRE = 'r-';

export const PREFIXE_DE_LA_REFERENCE = 'reg-';

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
  /** Elle a déclaré avoir terminé (6 novembre 2026, terminer-et-regler-pur.ts) :
      sa pièce se prépare au Trône, la page l'attend au lieu de renoncer. */
  termineParElle?: { le?: string } | null;
};

export type LienDuFoyer = {
  jeton: string;
  /** Les rendez-vous que le lien règle ensemble, tels que le Trône les a cochés. */
  apptIds: string[];
  creeLe: string;
  envoyeLe?: string;
  ouvertLe?: string;
  payeLe?: string;
};

export function jetonDe(aleas: ArrayLike<number>): string {
  let t = '';
  for (let i = 0; i < LONGUEUR_DU_JETON; i++) t += ALPHABET_DU_JETON[Math.abs(Math.floor(Number(aleas[i] ?? 0))) % ALPHABET_DU_JETON.length];
  return t;
}

export const estUnJeton = (s: unknown): s is string =>
  typeof s === 'string' && s.length === LONGUEUR_DU_JETON && [...s].every((c) => ALPHABET_DU_JETON.includes(c));

export const parametreDuLien = (jeton: string): string => `${PREFIXE_DU_PARAMETRE}${jeton}`;

export function jetonDuParametre(tg: unknown): string | null {
  const s = String(tg ?? '');
  if (!s.startsWith(PREFIXE_DU_PARAMETRE)) return null;
  const j = s.slice(PREFIXE_DU_PARAMETRE.length);
  return estUnJeton(j) ? j : null;
}

export const referenceDuRdv = (rdvId: string): string => `${PREFIXE_DE_LA_REFERENCE}${rdvId}`;

export const referenceDuFoyer = (jeton: string): string => `${PREFIXE_DE_LA_REFERENCE}foyer-${jeton}`;

export const jourDeCotonou = (d: Date): string => new Date(d.getTime() + DECALAGE_DE_COTONOU_MS).toISOString().slice(0, 10);

export const heureDeCotonou = (d: Date): string => new Date(d.getTime() + DECALAGE_DE_COTONOU_MS).toISOString().slice(11, 16);

const n = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);

export const netDeLaLigne = (l: LigneLue): number =>
  Math.max(0, n(l.qty) * n(l.unitXof) * (1 - n(l.discountPct) / 100) - n(l.discountXof));

export const totalDeLaPiece = (p: PieceLue): number => {
  const sub = (p.lines ?? []).reduce((s, l) => s + netDeLaLigne(l), 0);
  return Math.max(0, Math.round(sub * (1 - n(p.globalDiscountPct) / 100)) - n(p.globalDiscountXof));
};

export const regleDeLaPiece = (p: PieceLue): number => {
  if (p.payments && p.payments.length > 0) return p.payments.reduce((s, v) => s + n(v.amountXof), 0);
  return p.status === 'payée' ? totalDeLaPiece(p) : 0;
};

export const resteDeLaPiece = (p: PieceLue): number => Math.max(0, totalDeLaPiece(p) - regleDeLaPiece(p));

export function laPieceDuRdv(pieces: readonly PieceLue[], rdvId: string): PieceLue | null {
  const siennes = pieces.filter((p) => p && p.apptId === rdvId && (p.kind ?? 'facture') === 'facture' && p.status !== 'annulée');
  if (!siennes.length) return null;
  return [...siennes].sort((a, b) => (resteDeLaPiece(b) > 0 ? 1 : 0) - (resteDeLaPiece(a) > 0 ? 1 : 0) || String(b.date ?? '').localeCompare(String(a.date ?? '')))[0];
}

export type EtatDuLien = 'introuvable' | 'annule' | 'sans-piece' | 'reglee' | 'a-regler';

export function etatDuLien(rdv: RdvLu | null, piece: PieceLue | null): { etat: EtatDuLien; totalXof: number; recuXof: number; resteXof: number } {
  if (!rdv) return { etat: 'introuvable', totalXof: 0, recuXof: 0, resteXof: 0 };
  if (rdv.status === 'annulé') return { etat: 'annule', totalXof: 0, recuXof: 0, resteXof: 0 };
  if (!piece) return { etat: 'sans-piece', totalXof: 0, recuXof: 0, resteXof: 0 };
  const totalXof = totalDeLaPiece(piece);
  const recuXof = regleDeLaPiece(piece);
  const resteXof = resteDeLaPiece(piece);
  return { etat: resteXof > 0 ? 'a-regler' : 'reglee', totalXof, recuXof, resteXof };
}

export function partageDuPaiement(payeXof: number, attenduXof: number):
  { ok: true; versementXof: number; pourboireXof: number } | { ok: false; raison: 'deja_reglee' | 'montant' } {
  const paye = Math.round(n(payeXof));
  const attendu = Math.round(n(attenduXof));
  if (attendu <= 0) return { ok: false, raison: 'deja_reglee' };
  if (paye + 1 < attendu) return { ok: false, raison: 'montant' };
  return { ok: true, versementXof: attendu, pourboireXof: Math.max(0, paye - attendu) };
}

export const moyenDit = (source: unknown): string => {
  const s = String(source ?? '').toUpperCase();
  if (s.includes('CARD')) return 'carte';
  if (s.includes('MTN')) return 'MTN';
  if (s.includes('MOOV')) return 'Moov';
  if (s.includes('CELTIIS')) return 'Celtiis';
  return s ? 'Mobile Money' : '';
};

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

export const prenomDe = (nom: unknown): string => String(nom ?? '').trim().split(/\s+/)[0] ?? '';

export const maitreDit = (master: unknown): string => {
  const p = prenomDe(master);
  return /^team$/i.test(p) ? '' : p;
};

export const lignesDites = (p: PieceLue): { label: string; montantXof: number }[] =>
  (p.lines ?? []).filter((l) => String(l.label ?? '').trim()).map((l) => ({ label: String(l.label).trim(), montantXof: Math.round(netDeLaLigne(l)) }));

export function pageDuLien(o: { rdv: RdvLu | null; piece: PieceLue | null; nomDeLaCliente?: string; prenom?: string; branchId?: string; maintenant: Date }) {
  const e = etatDuLien(o.rdv, o.piece);
  const lien = o.rdv?.lienDeReglement;
  const tapgo = lien?.tapgo && e.etat === 'a-regler' && Math.round(n(lien.tapgo.resteXof)) === e.resteXof
    ? { parametre: lien.tapgo.parametre, totalXof: Math.round(n(lien.tapgo.totalXof)) }
    : undefined;
  return {
    etat: e.etat,
    /* Le prénom d'usage que le serveur a lu sur sa fiche (11 novembre 2026),
       sinon le premier mot, comme avant. */
    prenom: String(o.prenom ?? '').trim().replace(/\s+/g, ' ') || prenomDe(o.nomDeLaCliente ?? o.rdv?.clientName),
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
    /* Elle a terminé elle-même et sa pièce n'est pas encore écrite : le
       Trône la prépare, la page attend (6 novembre 2026). */
    ...(e.etat === 'sans-piece' && o.rdv?.termineParElle?.le ? { enPreparation: true } : {}),
  };
}

export function repartitionDuFoyer(payeXof: number, restes: readonly { id: string; resteXof: number }[]):
  { ok: true; parts: { id: string; montantXof: number }[]; pourboireXof: number } | { ok: false; raison: 'deja_reglee' | 'montant' } {
  const paye = Math.round(n(payeXof));
  const parts = restes.map((r) => ({ id: r.id, montantXof: Math.round(n(r.resteXof)) })).filter((r) => r.montantXof > 0);
  const total = parts.reduce((s, r) => s + r.montantXof, 0);
  if (total <= 0) return { ok: false, raison: 'deja_reglee' };
  if (paye + 1 < total) return { ok: false, raison: 'montant' };
  return { ok: true, parts, pourboireXof: Math.max(0, paye - total) };
}

export const idDuVersementDuFoyer = (transactionId: string, pieceId: string): string =>
  `${PREFIXE_DU_VERSEMENT}${transactionId}-${pieceId}`;

export function jourCourtDit(iso: string): string {
  const mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const j = Number((iso ?? '').slice(8, 10)); const m = Number((iso ?? '').slice(5, 7));
  if (!j || !m || m > 12) return '';
  return `${j === 1 ? '1er' : j} ${mois[m - 1]} ${iso.slice(0, 4)}`;
}

export type TeteDuFoyer = { prenom: string; jour: string; lignes: { label: string; montantXof: number }[]; resteXof: number };

export function pageDuFoyer(o: {
  tetes: readonly { rdv: RdvLu; piece: PieceLue | null; nom?: string; prenom?: string }[]; jeton: string; branchId?: string; maintenant: Date;
}) {
  const vivantes = o.tetes.filter((t) => t.rdv.status !== 'annulé');
  const avecPiece = vivantes.filter((t) => !!t.piece);
  const etats = avecPiece.map((t) => etatDuLien(t.rdv, t.piece));
  const totalXof = etats.reduce((s, e) => s + e.totalXof, 0);
  const recuXof = etats.reduce((s, e) => s + e.recuXof, 0);
  const resteXof = etats.reduce((s, e) => s + e.resteXof, 0);
  /* UNE TÊTE QUI A TERMINÉ ELLE-MÊME ET N'A PAS ENCORE SA PIÈCE (6 novembre
     2026) : le Trône l'écrit dans l'instant. La page attend toutes les
     pièces du foyer : un total à moitié prêt ferait régler la moitié. */
  const enPreparation = vivantes.some((t) => !t.piece && !!t.rdv.termineParElle?.le);
  const etat: EtatDuLien = o.tetes.length === 0 ? 'introuvable'
    : vivantes.length === 0 ? 'annule'
      : avecPiece.length === 0 || enPreparation ? 'sans-piece'
        : resteXof > 0 ? 'a-regler' : 'reglee';
  const tetes: TeteDuFoyer[] = avecPiece.map((t, i) => ({
    prenom: String(t.prenom ?? '').trim().replace(/\s+/g, ' ') || prenomDe(t.nom ?? t.rdv.clientName), jour: t.rdv.date ?? '', lignes: lignesDites(t.piece!), resteXof: etats[i].resteXof,
  }));
  const jours = [...new Set(tetes.map((t) => t.jour).filter(Boolean))];
  /* Plusieurs jours (le point d'un compte, 28 octobre 2026) : chaque ligne dit le sien. */
  const plusieursJours = jours.length > 1;
  return {
    etat,
    prenom: '',
    maitre: '',
    jour: jours.length === 1 ? jours[0] : '',
    lignes: tetes.flatMap((t) => t.lignes.map((l) => ({
      label: [t.prenom, plusieursJours ? jourCourtDit(t.jour) : '', l.label].filter(Boolean).join(' · '), montantXof: l.montantXof,
    }))),
    totalXof,
    recuXof,
    resteXof,
    pourboire: avecPiece.length > 0 && !avecPiece.some((t) => n(t.piece!.tipXof) > 0),
    reference: referenceDuFoyer(o.jeton),
    branchId: o.branchId ?? '',
    tetes,
    ...(enPreparation ? { enPreparation: true } : {}),
  };
}
// ── FIN copie de shared/regler-la-seance-pur.ts

/* ══ HONORÉ QUAND ELLE A RÉGLÉ — 6 novembre 2026 (« Terminer et régler ») ══
   La cliente a déclaré avoir terminé (`termineParElle`, posé par la fonction
   terminer-et-regler) ; le rendez-vous passe « honoré » ici, au règlement
   qui solde sa pièce, jamais à sa déclaration. La marque `honoreAuReglement`
   dit au Trône d'en faire les suites (points, stock, mission), comme pour un
   honneur posé par Grenat. Sans déclaration, rien ne change : le chemin du
   25 octobre 2026 honore au comptoir. La règle est recopiée à l'identique de
   src/shared/terminer-et-regler-pur.ts (douze lunes, R8). */

/* ⟨honneur-au-reglement⟩ */
/** Par quelle porte elle a déclaré avoir terminé. */
export type PorteDeLaFin = 'couronne' | 'site' | 'whatsapp';
/** La marque posée sur le rendez-vous à sa déclaration (le serveur seul
    l'écrit). `pieceLe` : un poste du Trône a réservé l'écriture de sa pièce
    (une écriture conditionnelle, un seul poste la fait). */
export type MarqueDeLaFin = { le: string; par: PorteDeLaFin; pieceLe?: string };
/** La marque posée au règlement : le serveur passe « honoré », un poste du
    Trône réserve les suites (`suitesLe`) et les fait, comme au comptoir. */
export type MarqueDeLHonneur = { le: string; suitesLe?: string };
/** Cotonou : UTC+1 toute l'année. */
export const DECALAGE_DE_LA_FIN_MS = 3_600_000;
export const jourDeLaFin = (ms: number): string => new Date(ms + DECALAGE_DE_LA_FIN_MS).toISOString().slice(0, 10);

/** HONORÉ QUAND ELLE A RÉGLÉ. Rend la marque à poser, ou null : elle n'a
    rien déclaré (le chemin d'avant ne bouge pas), le rendez-vous n'est plus
    « confirmé », il reste à régler, ou le rituel est à venir. Un reste
    illisible n'honore jamais. */
export function honneurAuReglement(o: {
  rdv: { status?: string; date?: string; termineParElle?: MarqueDeLaFin | null } | null;
  resteXof: number;
  maintenantMs: number;
}): MarqueDeLHonneur | null {
  const r = o.rdv;
  if (!r || !r.termineParElle || !r.termineParElle.le) return null;
  if (r.status !== 'confirmé') return null;
  const reste = Number(o.resteXof);
  if (!Number.isFinite(reste) || Math.round(reste) > 0) return null;
  const jour = String(r.date ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || jour > jourDeLaFin(o.maintenantMs)) return null;
  return { le: new Date(o.maintenantMs).toISOString() };
}
/* ⟨/honneur-au-reglement⟩ */

/* ══ RÉGLER AVANT ET APRÈS — 7 novembre 2026 ══════════════════════════════
   « Pourquoi je ne peux pas faire un paiement d'un RDV sur ma couronne à
   n'importe quel moment ? » (Yéman). Un rendez-vous SANS PIÈCE se règle
   d'avance (avant l'heure du rituel) ou après coup (dès le lendemain), au
   prix figé moins l'argent déjà reçu : le versement s'inscrit sur le
   rendez-vous, jamais « honoré ». Les deux blocs sont recopiés à l'identique
   de src/shared/terminer-et-regler-pur.ts (douze lunes, R8). */

/* ⟨reste-du-rdv⟩ */
/* CE QUE LE RENDEZ-VOUS ET SA PIÈCE DISENT DE L'ARGENT. Sorti de
   ⟨terminer-et-regler⟩ le 7 novembre 2026, mot pour mot, pour servir aussi à
   ⟨regler-avant-apres⟩ : régler d'avance ou après coup se juge sur le même
   reste que la porte de la fin. Recopié dans terminer-et-regler et dans
   regler-la-seance. */

/** Le rendez-vous tel que la règle le lit. */
export type RdvDeLaFin = {
  id: string; date?: string; time?: string; status?: string; clientId?: string; numeroAPrevenir?: string;
  priceXof?: unknown; seriesIndex?: number; forfait?: { totalXof?: number } | null;
  discountPct?: number; discountXof?: number;
  payments?: { amountXof?: number }[]; paidXof?: number;
  depositXof?: number; depositConfirmed?: boolean; coveredBySub?: boolean;
  termineParElle?: MarqueDeLaFin | null; honoreAuReglement?: MarqueDeLHonneur | null;
  lienDeReglement?: { jeton?: string; creeLe?: string } | null;
  lienDuFoyer?: { jeton?: string; apptIds?: string[]; creeLe?: string } | null;
  /** Elle n'est pas venue (le Trône le marque) : rien ne se règle après coup. */
  absente?: unknown;
};

/** L'instant du rituel, à l'heure de Cotonou ; NaN si la date ou l'heure ne se lisent pas. */
export function instantDuRituel(date: unknown, time: unknown): number {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date ?? ''));
  const h = /^(\d{1,2}):(\d{2})/.exec(String(time ?? ''));
  if (!d || !h) return NaN;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(h[1]), Number(h[2])) - DECALAGE_DE_LA_FIN_MS;
}

/** Le prix net d'un rendez-vous au prix FIGÉ, la lecture d'`apptNetXof` :
    séance de suite à zéro, forfait, prix moins la remise du rendez-vous.
    Sans prix figé : `undefined`. Le serveur ne devine pas le tarif d'une tête. */
export function prixFigeDeLaFin(a: Pick<RdvDeLaFin, 'priceXof' | 'seriesIndex' | 'forfait' | 'discountPct' | 'discountXof'>): number | undefined {
  if (a.seriesIndex && a.seriesIndex > 1) return 0;
  if (a.forfait) return Math.max(0, Math.round(Number(a.forfait.totalXof) || 0));
  if (typeof a.priceXof !== 'number' || !Number.isFinite(a.priceXof)) return undefined;
  return Math.max(0, Math.round(a.priceXof * (1 - (Number(a.discountPct) || 0) / 100)) - (Number(a.discountXof) || 0));
}

/** L'argent déjà reçu sur le rendez-vous : le journal des versements, sinon
    `paidXof`, et l'acompte seulement s'il est reconnu reçu. */
export const argentRecuDeLaFin = (a: Pick<RdvDeLaFin, 'payments' | 'paidXof' | 'depositXof' | 'depositConfirmed'>): number =>
  (a.payments && a.payments.length > 0 ? a.payments.reduce((s, p) => s + (Number(p.amountXof) || 0), 0) : Number(a.paidXof) || 0)
  + (a.depositConfirmed ? Math.max(0, Number(a.depositXof) || 0) : 0);

/** L'ACOMPTE DEMANDÉ QUE LA MAISON N'A PAS ENCORE VÉRIFIÉ (relecture du 6
    novembre 2026) : son montant, ou zéro. Tant que l'équipe ne l'a pas
    reconnu reçu, le serveur ne sait pas ce qu'elle doit vraiment (elle l'a
    peut-être versé) : la porte reste fermée, son règlement se fait au
    comptoir, et le personnel l'apprend. */
export const acompteAVerifier = (r: Pick<RdvDeLaFin, 'depositXof' | 'depositConfirmed'> | null): number =>
  (r && !r.depositConfirmed ? Math.max(0, Math.round(Number(r.depositXof) || 0)) : 0);

/** Ce qui reste dû, quand le prix est figé ; null sinon. */
export function resteConnuDeLaFin(a: RdvDeLaFin): number | null {
  const prix = prixFigeDeLaFin(a);
  return prix === undefined ? null : Math.max(0, prix - argentRecuDeLaFin(a));
}

/* LA PIÈCE, telle que la fonction la relit : les calculs de finance.ts, que
   regler-la-seance-pur.ts porte déjà (le banc les rejoue côte à côte). */
export type PieceDeLaFin = {
  id: string; kind?: string; status?: string; date?: string; apptId?: string;
  lines?: { qty?: number; unitXof?: number; discountPct?: number; discountXof?: number }[];
  globalDiscountPct?: number; globalDiscountXof?: number; payments?: { amountXof?: number }[];
};
const nombreDeLaFin = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);
export function resteDeLaPieceDeLaFin(p: PieceDeLaFin): number {
  const sous = (p.lines ?? []).reduce((s, l) => s + Math.max(0, nombreDeLaFin(l.qty) * nombreDeLaFin(l.unitXof) * (1 - nombreDeLaFin(l.discountPct) / 100) - nombreDeLaFin(l.discountXof)), 0);
  const total = Math.max(0, Math.round(sous * (1 - nombreDeLaFin(p.globalDiscountPct) / 100)) - nombreDeLaFin(p.globalDiscountXof));
  const regle = p.payments && p.payments.length > 0 ? p.payments.reduce((s, v) => s + nombreDeLaFin(v.amountXof), 0) : p.status === 'payée' ? total : 0;
  return Math.max(0, total - regle);
}
/** La pièce du rendez-vous : une facture qui porte son identifiant, jamais
    annulée ; celle qui doit encore d'abord, puis la plus récente. */
export function pieceDuRdvDeLaFin<P extends PieceDeLaFin>(pieces: readonly P[], rdvId: string): P | null {
  const siennes = pieces.filter((p) => p && p.apptId === rdvId && (p.kind ?? 'facture') === 'facture' && p.status !== 'annulée');
  if (!siennes.length) return null;
  return [...siennes].sort((a, b) => (resteDeLaPieceDeLaFin(b) > 0 ? 1 : 0) - (resteDeLaPieceDeLaFin(a) > 0 ? 1 : 0) || String(b.date ?? '').localeCompare(String(a.date ?? '')))[0];
}
/* ⟨/reste-du-rdv⟩ */

/* ⟨regler-avant-apres⟩ */
/* RÉGLER AVANT ET APRÈS, DANS MA COURONNE — 7 novembre 2026.
   « Pourquoi je ne peux pas faire un paiement d'un RDV sur ma couronne à
   n'importe quel moment ? » (Yéman, 7 h 45). Tranché au sélecteur : « Avant
   et après ».

   TROIS MOMENTS, SANS CHEVAUCHEMENT (`momentDuReglement`) :
   · D'AVANCE, de sa réservation jusqu'à l'heure du rituel : « Régler
     d'avance » le prix connu. Le rendez-vous reste « confirmé » : il n'est
     honoré que quand elle vient. Un soin ajouté pendant la séance se règle
     en plus le jour même (la porte de la fin relit le reste).
   · LE JOUR MÊME, dès l'heure : la porte de la fin (⟨terminer-et-regler⟩),
     qui ne change pas.
   · APRÈS, dès le lendemain : un rendez-vous passé qui doit encore reste
     payable, sans limite de temps. Régler après ne pose JAMAIS « honoré » :
     on règle la pièce (ou, sans pièce, le rendez-vous) ; l'honneur reste au
     comptoir, ou à la règle de la fin quand elle avait déclaré avoir terminé.

   LE MONTANT VIENT TOUJOURS DU SERVEUR : le reste de SA pièce quand elle
   existe (elle fait foi), sinon le prix figé moins l'argent déjà reçu
   (⟨reste-du-rdv⟩). Sans pièce, le versement s'inscrit sur le rendez-vous
   (kkia-…, comme tout versement en ligne), sans nommer de pièce : la pièce du
   jour venu le reprend en « Acompte », à sa date, comme la Caisse le fait
   pour l'argent reçu au Carnet. Les noms portent « AvantApres ». */

/** Le moment du règlement : d'avance (avant l'heure du rituel), le jour même
    (dès l'heure, jusqu'à minuit à Cotonou), ou après (un jour d'après). Rien
    quand la date ou l'heure ne se lisent pas. */
export type MomentDuReglement = 'avance' | 'jour-meme' | 'apres';
export function momentDuReglement(r: Pick<RdvDeLaFin, 'date' | 'time'>, maintenantMs: number): MomentDuReglement | null {
  const jour = String(r.date ?? '').slice(0, 10);
  const debut = instantDuRituel(jour, r.time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour) || !Number.isFinite(debut)) return null;
  if (maintenantMs < debut) return 'avance';
  return jour < jourDeLaFin(maintenantMs) ? 'apres' : 'jour-meme';
}

/** Pourquoi « Régler d'avance » ou « Régler » (après) est ouvert, ou fermé. */
export type RaisonAvantApres =
  | 'ouverte' | 'introuvable' | 'annule' | 'pas-le-moment' | 'couvert' | 'absente' | 'comptoir'
  | 'pas-confirme' | 'clos' | 'en-preparation' | 'sans-prix' | 'deja-regle' | 'rien-a-regler';
/** `resteXof` : ce qu'elle réglera, quand la porte est ouverte (zéro quand
    tout est réglé) ; `surLaPiece` : il se règle sur sa pièce, sinon sur le
    rendez-vous. */
export type PorteAvantApres = { ouverte: boolean; raison: RaisonAvantApres; resteXof: number | null; surLaPiece: boolean };

/** LA PORTE D'AVANT ET D'APRÈS. Fermée, dans cet ordre : un annulé ; hors de
    son moment ; couvert par une formule ; absente ; « Passe au comptoir » sur
    sa fiche, ou un acompte demandé que la Maison n'a pas vérifié (le juste
    reste ne se connaît pas). Avec une pièce : son reste fait foi (soldée,
    « déjà réglé ») ; le rendez-vous doit être confirmé ou honoré. Sans pièce :
    seulement un rendez-vous « confirmé » (un honoré sans pièce a été clos au
    comptoir), dont elle n'a pas déclaré la fin (sa pièce se prépare au
    Trône), au prix FIGÉ ; sans prix figé, rien ne se devine. */
export function porteAvantApres(o: {
  quand: 'avance' | 'apres';
  rdv: RdvDeLaFin | null;
  maintenantMs: number;
  passeAuComptoir?: boolean;
  piece?: { resteXof: number } | null;
}): PorteAvantApres {
  const ferme = (raison: RaisonAvantApres, resteXof: number | null = null): PorteAvantApres => ({ ouverte: false, raison, resteXof, surLaPiece: false });
  const r = o.rdv;
  if (!r) return ferme('introuvable');
  if (r.status === 'annulé') return ferme('annule');
  if (momentDuReglement(r, o.maintenantMs) !== o.quand) return ferme('pas-le-moment');
  if (r.coveredBySub) return ferme('couvert');
  if (r.absente) return ferme('absente');
  if (o.passeAuComptoir === true || acompteAVerifier(r) > 0) return ferme('comptoir');
  if (o.piece) {
    const reste = Number(o.piece.resteXof);
    if (!Number.isFinite(reste)) return ferme('clos');
    if (Math.round(reste) <= 0) return ferme('deja-regle', 0);
    if (r.status !== 'confirmé' && r.status !== 'honoré') return ferme('pas-confirme');
    return { ouverte: true, raison: 'ouverte', resteXof: Math.round(reste), surLaPiece: true };
  }
  if (r.status === 'honoré') return ferme('clos');
  if (r.status !== 'confirmé') return ferme('pas-confirme');
  if (r.termineParElle?.le) return ferme('en-preparation');
  const reste = resteConnuDeLaFin(r);
  if (reste === null) return ferme('sans-prix');
  if (Math.round(reste) <= 0) return ferme(argentRecuDeLaFin(r) > 0 ? 'deja-regle' : 'rien-a-regler', 0);
  return { ouverte: true, raison: 'ouverte', resteXof: Math.round(reste), surLaPiece: false };
}

/** SANS PIÈCE, SEULEMENT CE QUE MA COURONNE A OUVERT. La page « Régler » ne
    règle un rendez-vous sans pièce (sur lui-même) que si son lien a été
    ouvert depuis Ma Couronne (`depuisLaCouronne`, posé par la fonction
    terminer-et-regler, que la base garde, 0172). Un lien posé au Trône
    (« Terminer la séance », « Envoyer le lien ») attend sa pièce comme avant :
    une cliente qui l'ouvre dans les secondes où la pièce voyage encore ne
    règle pas deux fois. */
export const ouvertDepuisLaCouronne = (r: { lienDeReglement?: { depuisLaCouronne?: { le?: string } | null } | null } | null): boolean =>
  !!r?.lienDeReglement?.depuisLaCouronne?.le;

/** L'ARGENT VERSÉ SUR LE RENDEZ-VOUS LUI-MÊME : son journal, sinon `paidXof`,
    sans l'acompte (la lecture d'`argentRecuDeLaFin`, l'acompte en moins). La
    base porte la même lecture (`argent_verse_sur_le_rdv`, 0172). */
export const argentVerseSurLeRdv = (a: Pick<RdvDeLaFin, 'payments' | 'paidXof'>): number =>
  (a.payments && a.payments.length > 0 ? a.payments.reduce((s, p) => s + (Number(p.amountXof) || 0), 0) : Number(a.paidXof) || 0);

/** RÉGLÉ D'AVANCE, IL NE S'ANNULE PAS PAR ELLE (7 novembre 2026). Un
    rendez-vous qui porte de l'argent versé (en ligne ou au Carnet) ne
    s'annule pas depuis Ma Couronne : aucun remboursement ne part tout seul.
    Elle écrit à la Maison, qui annule au Trône et décide. L'acompte seul ne
    change rien (il reste acquis, comme avant). Déplacer, lui, reste permis :
    le versement suit le rendez-vous. */
export const annulationParElle = (r: Pick<RdvDeLaFin, 'payments' | 'paidXof'> | null): 'permise' | 'ecrire-a-la-maison' =>
  (r && Math.round(argentVerseSurLeRdv(r)) > 0 ? 'ecrire-a-la-maison' : 'permise');

/** UNE TÊTE DE SON FOYER : la fiche d'un mineur de la famille dont elle est
    la payeuse, jamais archivée. La règle de la base (`est_ma_tete`, 0036),
    qui ouvre déjà ces rendez-vous dans Ma Couronne : moins de dix-huit ans
    révolus, une date de naissance lisible (la minorité ne se présume pas). */
export function teteDuCompte(o: {
  parents: readonly string[];
  tete: { familyId?: unknown; birthday?: unknown; archived?: unknown } | null;
  payeur: unknown;
  aujourdhui: string;
}): boolean {
  const t = o.tete;
  const payeur = String(o.payeur ?? '');
  const naissance = String(t?.birthday ?? '').slice(0, 10);
  const jour = /^(\d{4})-(\d{2}-\d{2})$/.exec(String(o.aujourdhui ?? '').slice(0, 10));
  if (!t || !String(t.familyId ?? '') || t.archived === true || t.archived === 'true') return false;
  if (!payeur || !o.parents.includes(payeur) || !jour || !/^\d{4}-\d{2}-\d{2}$/.test(naissance)) return false;
  return naissance > `${Number(jour[1]) - 18}-${jour[2]}`;
}

/** LE VERSEMENT POSÉ SUR LE RENDEZ-VOUS, quand il n'a pas de pièce : celui de
    la transaction vérifiée chez KkiaPay (kkia-…), à sa date, sans nommer de
    pièce (la pièce du jour venu le reprend en « Acompte » ; un versement qui
    nommerait une pièce ferait croire au Trône qu'elle existe), `paidXof` à
    jour, et le lien qui dit quand il a servi. Un rejeu ne double rien. */
export function versementSurLeRdv<R extends Pick<RdvDeLaFin, 'payments' | 'paidXof' | 'lienDeReglement'>>(
  r: R,
  v: { id: string; amountXof: number; date: string; time?: string; method?: string; cashbox?: string; note?: string },
  quand: 'avance' | 'apres',
): R {
  if ((r.payments ?? []).some((x) => (x as { id?: string }).id === v.id)) return r;
  const montant = Math.round(Number(v.amountXof) || 0);
  const dit = quand === 'avance' ? 'D’avance' : 'Après le rituel';
  return {
    ...r,
    paidXof: Math.round(argentVerseSurLeRdv(r)) + montant,
    payments: [...(r.payments ?? []), { id: v.id, amountXof: montant, date: v.date, method: v.method, cashbox: v.cashbox, note: v.note ? `${dit} · ${v.note}` : dit }],
    ...(r.lienDeReglement ? { lienDeReglement: { ...r.lienDeReglement, payeLe: `${v.date}T${v.time ?? '00:00'}` } } : {}),
  } as R;
}

/** La date d'une page ou d'une notification : « 12 novembre 2026 », l'année toujours. */
const MOIS_AVANT_APRES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export function jourDitAvantApres(iso: unknown): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
  return `${Number(m[3]) === 1 ? '1er' : Number(m[3])} ${MOIS_AVANT_APRES[Number(m[2]) - 1]} ${m[1]}`;
}
const francsAvantApres = (xof: number): string => `${String(Math.round(xof)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} F`;

/** LA PAGE « RÉGLER » D'UN RENDEZ-VOUS SANS PIÈCE (d'avance, ou passé au prix
    figé) : la forme de la page qui existe, le total annoncé, ce qui est déjà
    reçu, le reste. Aucun merci pour l'équipe ici : il se donne le jour du
    rituel, sur sa pièce. Aucun nom de maître : la Maison choisit qui
    s'occupe d'elle. Tout réglé : « réglée ». */
export function pageSansPiece(o: {
  rdv: RdvDeLaFin; porte: PorteAvantApres; quand: 'avance' | 'apres';
  prenom: string; reference: string; branchId?: string;
}) {
  const prix = prixFigeDeLaFin(o.rdv) ?? 0;
  const reste = o.porte.ouverte ? Math.max(0, Math.round(o.porte.resteXof ?? 0)) : 0;
  return {
    etat: (o.porte.ouverte && reste > 0 ? 'a-regler' : 'reglee') as 'a-regler' | 'reglee',
    prenom: String(o.prenom ?? '').trim().replace(/\s+/g, ' '),
    maitre: '',
    jour: String(o.rdv.date ?? '').slice(0, 10),
    lignes: [{ label: 'Total annoncé', montantXof: prix }],
    totalXof: prix,
    recuXof: Math.round(argentRecuDeLaFin(o.rdv)),
    resteXof: reste,
    pourboire: false,
    reference: o.reference,
    branchId: o.branchId ?? '',
    sansPiece: o.quand,
  };
}

/** LE PERSONNEL L'APPREND, une fois par versement : le prénom, le rituel, le
    montant ; et ce qui dépasse le reste, gardé au registre, à rapprocher.
    Aucun pronom : la civilité ne se suppose pas. */
export function notificationAvantApres(o: { prenom: string; quand: 'avance' | 'apres'; jour: string; heure?: string; montantXof: number; enPlusXof: number }): { titre: string; corps: string; url: string } {
  const nom = String(o.prenom ?? '').trim() || 'Une cliente';
  const h = /^(\d{1,2}):(\d{2})/.exec(String(o.heure ?? ''));
  const heure = h ? (h[2] === '00' ? ` à ${Number(h[1])} h` : ` à ${Number(h[1])} h ${h[2]}`) : '';
  const plus = o.enPlusXof > 0 ? ` ${francsAvantApres(o.enPlusXof)} de plus, gardés au registre : à rapprocher.` : '';
  return {
    titre: o.quand === 'avance' ? `${nom} a réglé d’avance` : `${nom} a réglé un rituel passé`,
    corps: `Rituel du ${jourDitAvantApres(o.jour)}${heure} : ${francsAvantApres(o.montantXof)} en ligne, inscrits sur le rendez-vous.`
      + (o.quand === 'avance' ? ' Le rendez-vous reste confirmé ; le jour venu, ce versement compte à sa pièce.' : ' La pièce se fait au Trône, le versement y compte.')
      + plus,
    url: '/trone/#/carnet',
  };
}
/* ⟨/regler-avant-apres⟩ */

/** Le rendez-vous après le règlement : son versement (s'il y en a un à
    poser), puis l'honneur si elle avait déclaré avoir terminé et que sa pièce
    est soldée. Rend la ligne à écrire, ou `avant` si rien ne change. */
function rdvApresLeReglement(avant: RdvLu, v: VersementLu | null, pieceId: string, resteXof: number, quand: Date, parLeFoyer = false): RdvLu {
  const regle = v ? rdvRegle(avant, v, pieceId, parLeFoyer) : avant;
  const honneur = honneurAuReglement({ rdv: regle as any, resteXof, maintenantMs: quand.getTime() });
  return honneur ? ({ ...regle, status: 'honoré', honoreAuReglement: honneur } as RdvLu) : regle;
}

/* ── La limite de débit, la même table que les demandes du site (0007) ── */
const ipOf = (req: Request): string => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
async function permis(ip: string, seau: string, plafond: number): Promise<boolean> {
  const depuis = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count, error } = await admin.from('edge_rate_limits').select('*', { count: 'exact', head: true })
    .eq('bucket', seau).eq('ip', ip).gte('at', depuis);
  if (error) return true; // table absente : ne pas bloquer un règlement
  if ((count ?? 0) >= plafond) return false;
  await admin.from('edge_rate_limits').insert({ bucket: seau, ip });
  return true;
}

type Ligne = { id: string; branch_id: string; data: any };

/** Le rendez-vous du jeton : un seul, sinon personne. */
async function leRdvDuJeton(jeton: string): Promise<Ligne | null> {
  const { data, error } = await admin.from('appointments').select('id,branch_id,data')
    .eq('data->lienDeReglement->>jeton', jeton).limit(2);
  if (error) throw new Error(error.message);
  return data && data.length === 1 ? (data[0] as Ligne) : null;
}

/** Les pièces du rendez-vous, relues à l'instant. */
async function lesPiecesDuRdv(rdvId: string): Promise<Ligne[]> {
  const { data, error } = await admin.from('invoices').select('id,branch_id,data').eq('data->>apptId', rdvId).limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []) as Ligne[];
}

async function laPiece(rdvId: string): Promise<Ligne | null> {
  const lignes = await lesPiecesDuRdv(rdvId);
  const choisie = laPieceDuRdv(lignes.map((l) => ({ ...(l.data ?? {}), id: l.id })), rdvId);
  return choisie ? lignes.find((l) => l.id === choisie.id) ?? null : null;
}

/* LE PRÉNOM D'USAGE (11 novembre 2026, « écrire tout le prénom Anne-Marie »,
   Y.) : la page du rendez-vous disait « Merci, Anne ». Copie du bloc de
   `src/shared/civilite.ts` entre ses repères ; verifie-le-prenom-d-usage
   la compare, caractère pour caractère. */
/* ⟨prenom-d-usage⟩ */
/** LES PRÉNOMS QUI SE COMPOSENT (liste du 7 novembre 2026) : en tête d'un nom
    de trois mots ou plus sans NOM en capitales, ils prennent le mot suivant. */
const PRENOMS_QUI_SE_COMPOSENT: readonly string[] = ['Marie', 'Anne', 'Jean', 'Paul', 'Pierre', 'Louis'];
/** Les particules d'un nom de famille : « de », « da », « d'Agbo »… */
const PARTICULE_DU_NOM = /^(?:de|da|do|dos|das|du|des|di|del|della|van|von|le|la|d['’]\S*)$/i;
/** Un mot tout en capitales : au moins deux lettres, accents compris, l'apostrophe et le trait d'union admis. */
const motEnCapitales = (m: string): boolean => /^[\p{Lu}'’-]+$/u.test(m) && (m.match(/\p{Lu}/gu) ?? []).length >= 2;
/** La capitale d'un second prénom écrit en minuscules ; rien d'autre ne bouge. */
const capitaleDuSecond = (m: string): string => (/^\p{Ll}/u.test(m) ? `${m.charAt(0).toUpperCase()}${m.slice(1)}` : m);

/** LE PRÉNOM QUE LE TRÔNE DEVINE d'un nom complet (les règles 2 à 5). Le
    trait d'union se recolle dans le prénom, jamais vers un NOM en capitales
    (« Awa - KOSSI » reste deux mots). */
const prenomDevine = (nom: unknown): string => {
  const mots = String(nom ?? '').trim().replace(/\s+/g, ' ')
    .replace(/(\S+) ?- ?(?=(\S+))/g, (tout: string, g: string, d: string) => (motEnCapitales(g) || motEnCapitales(d) ? tout : `${g}-`))
    .split(' ').filter(Boolean);
  if (mots.length === 0) return '';
  const nomDeFamille = mots.findIndex((m, i) => i > 0 && motEnCapitales(m));
  if (nomDeFamille > 0) {
    const fin = mots.findIndex((m, i) => i > 0 && (i >= nomDeFamille || !/^\p{L}/u.test(m)));
    const prenoms = mots.slice(0, fin);
    while (prenoms.length > 1 && PARTICULE_DU_NOM.test(prenoms[prenoms.length - 1])) prenoms.pop();
    return prenoms.map((m, i) => (i > 0 && !PARTICULE_DU_NOM.test(m) ? capitaleDuSecond(m) : m)).join(' ');
  }
  const premier = mots[0].toLowerCase();
  const second = mots[1] ?? '';
  if (mots.length >= 3 && PRENOMS_QUI_SE_COMPOSENT.some((p) => p.toLowerCase() === premier) && /^\p{L}/u.test(second) && !PARTICULE_DU_NOM.test(second)) {
    return `${mots[0]} ${capitaleDuSecond(second)}`;
  }
  return mots[0];
};

/** LE PRÉNOM D'USAGE d'une cliente : celui de sa fiche, sinon celui que le
    Trône devine de son nom. `repli` sert quand la fiche manque mais qu'un nom
    est connu ailleurs (le rendez-vous, la demande du site). */
const prenomDUsage = (c: { name?: unknown; prenomUsage?: unknown } | null | undefined, repli?: unknown): string => {
  const note = String(c?.prenomUsage ?? '').trim().replace(/\s+/g, ' ');
  return note || prenomDevine(c?.name ?? repli);
};
/* ⟨/prenom-d-usage⟩ */

/** Son prénom d'usage : celui de sa fiche, sinon deviné de son nom ou du nom du rendez-vous. */
async function prenomDUsageDe(clientId: unknown, repli: unknown): Promise<string> {
  if (!clientId) return prenomDUsage(null, repli);
  const { data } = await admin.from('clients').select('data').eq('id', String(clientId)).maybeSingle();
  return prenomDUsage((data?.data as { name?: unknown; prenomUsage?: unknown } | undefined) ?? null, repli);
}

/* ── RÉGLER AVANT ET APRÈS (7 novembre 2026) : un rendez-vous sans pièce ── */

/** « Passe au comptoir » sur la fiche de la tête du rendez-vous. */
async function passeAuComptoirDe(clientId: unknown): Promise<boolean> {
  if (!clientId) return false;
  const { data } = await admin.from('clients').select('data').eq('id', String(clientId)).maybeSingle();
  return data?.data?.passeAuComptoir === true;
}

/** LA PORTE D'UN RENDEZ-VOUS SANS PIÈCE, d'avance ou après coup, telle que la
    règle la juge (⟨regler-avant-apres⟩) ; null quand ce n'est pas son chemin :
    son lien n'a pas été ouvert depuis Ma Couronne (un lien du Trône attend sa
    pièce, comme avant), ou c'est le jour même dès l'heure (la porte de la
    fin). Elle a déclaré avoir terminé : la règle ferme (« en-preparation »),
    le Trône écrit sa pièce et la page l'attend, comme avant. */
async function laPorteSansPiece(l: { id: string; data: any }, maintenantMs: number): Promise<{ porte: PorteAvantApres; moment: 'avance' | 'apres' } | null> {
  const r = { ...(l.data ?? {}), id: l.id };
  if (!ouvertDepuisLaCouronne(r)) return null;
  const moment = momentDuReglement(r, maintenantMs);
  if (moment !== 'avance' && moment !== 'apres') return null;
  const porte = porteAvantApres({ quand: moment, rdv: r, maintenantMs, passeAuComptoir: await passeAuComptoirDe(r.clientId), piece: null });
  return { porte, moment };
}

/** Le personnel est prévenu, une fois par versement : la notification existante (push-notify, mode `staff`). */
async function previensLePersonnel(n: { titre: string; corps: string; url: string }): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/push-notify`, {
      method: 'POST', signal: AbortSignal.timeout(6000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_KEY}` },
      body: JSON.stringify({ mode: 'staff', title: n.titre, body: n.corps, url: n.url }),
    });
  } catch (e) {
    console.error('regler-la-seance: notification', String((e as Error)?.message ?? e).slice(0, 120));
  }
}

/** L'ARGENT D'UN RENDEZ-VOUS SANS PIÈCE : le registre est déjà écrit (par
    `appliquer`) ; la porte se rejuge sur le rendez-vous relu à l'instant ;
    fermée, l'argent reste au registre, « à rapprocher » au comptoir, comme un
    argent qui ne couvre pas le reste. Ouverte : le versement kkia-<id>
    s'inscrit sur le rendez-vous, sous condition (le Trône écrit les mêmes
    lignes), sans nommer de pièce ; le statut ne bouge pas (jamais honoré) ;
    le personnel l'apprend. Un rejeu ne double rien. */
async function appliquerSansPiece(rdv: Ligne, t: { id: string; amountXof: number; feesXof: number; source?: string }): Promise<
  { ok: true; deja?: boolean; versementXof: number; pourboireXof: number; honore?: boolean } | { ok: false; erreur: string; status: number }
> {
  const id = `${PREFIXE_DU_VERSEMENT}${t.id}`;
  for (let essai = 0; essai < 3; essai++) {
    const { data: frais, error } = await admin.from('appointments').select('id,branch_id,data,updated_at').eq('id', rdv.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!frais) return { ok: false, erreur: 'sans_piece', status: 409 };
    const r = { ...(frais.data ?? {}), id: frais.id };
    if ((r.payments ?? []).some((x: any) => x?.id === id)) return { ok: true, deja: true, versementXof: 0, pourboireXof: 0, honore: false };
    const quand = new Date();
    const sp = await laPorteSansPiece(frais, quand.getTime());
    if (!sp || !sp.porte.ouverte || !sp.porte.resteXof) {
      return { ok: false, erreur: sp?.porte.raison === 'deja-regle' ? 'deja_reglee' : 'sans_piece', status: 409 };
    }
    const partage = partageDuPaiement(t.amountXof, sp.porte.resteXof);
    if (!partage.ok) return { ok: false, erreur: partage.raison, status: 409 };
    const v = versementEnLigne({ transactionId: t.id, montantXof: partage.versementXof, source: t.source, quand });
    const neuf = versementSurLeRdv(r, v, sp.moment);
    let q = admin.from('appointments').update({ data: neuf }).eq('id', rdv.id);
    if (frais.updated_at) q = q.eq('updated_at', frais.updated_at);
    const { data: ecrites, error: refus } = await q.select('id');
    if (refus) throw new Error(refus.message);
    /* La ligne a bougé entre la lecture et l'écriture : on relit, on rejuge. */
    if (!(ecrites ?? []).length) continue;
    await previensLePersonnel(notificationAvantApres({
      prenom: await prenomDUsageDe(r.clientId, r.clientName), quand: sp.moment, jour: String(r.date ?? ''), heure: String(r.time ?? ''),
      montantXof: partage.versementXof, enPlusXof: partage.pourboireXof,
    }));
    return { ok: true, versementXof: partage.versementXof, pourboireXof: partage.pourboireXof, honore: false };
  }
  return { ok: false, erreur: 'ecriture', status: 409 };
}

type KkiaTransaction = { status?: string; amount?: number; fees?: number; source?: string; failureMessage?: string };
async function transaction(transactionId: string): Promise<KkiaTransaction> {
  const res = await fetch(`${KKIA_BASE}${KKIA_VERIFY_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': Deno.env.get('KKIAPAY_PUBLIC_KEY') ?? '',
      'x-private-key': Deno.env.get('KKIAPAY_PRIVATE_KEY') ?? '',
      'x-secret-key': Deno.env.get('KKIAPAY_SECRET_KEY') ?? '',
    },
    body: JSON.stringify({ transactionId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(res.status === 404 ? 'transaction_introuvable' : `kkiapay_${res.status} ${detail.slice(0, 160)}`);
  }
  return (await res.json()) as KkiaTransaction;
}

/* ══ L'ARGENT POSÉ ═══════════════════════════════════════════════════════
   Le registre d'abord (sa clé est la transaction : elle ne règle qu'UN
   rendez-vous), puis la pièce relue à l'instant, puis le rendez-vous. Une
   transaction déjà posée ne se pose plus ; un argent qui ne couvre pas le
   reste reste au registre, « à rapprocher » au comptoir : on ne perd jamais
   un franc reçu. */
async function appliquer(rdv: Ligne, t: { id: string; amountXof: number; feesXof: number; source?: string }): Promise<
  { ok: true; deja?: boolean; versementXof: number; pourboireXof: number; honore?: boolean } | { ok: false; erreur: string; status: number }
> {
  const reference = referenceDuRdv(rdv.id);
  const r = rdv.data ?? {};
  const { error: insErr } = await admin.from('payments').insert({
    id: t.id, branch_id: rdv.branch_id,
    data: {
      id: t.id, branchId: rdv.branch_id, provider: 'kkiapay', amountXof: t.amountXof, feesXof: t.feesXof,
      method: t.source ?? undefined, partnerId: reference, clientId: r.clientId || undefined, status: 'success', at: new Date().toISOString(),
    },
  });
  if (insErr) {
    if (insErr.code !== '23505') throw new Error(insErr.message);
    const { data: inscrit } = await admin.from('payments').select('data').eq('id', t.id).maybeSingle();
    if (String(inscrit?.data?.partnerId ?? '') !== reference) return { ok: false, erreur: 'transaction_deja_utilisee', status: 409 };
  }

  const pieceLigne = await laPiece(rdv.id);
  /* Sans pièce (7 novembre 2026) : d'avance ou après coup, sur le rendez-vous, si Ma Couronne l'a ouvert ; sinon 409 comme avant. */
  if (!pieceLigne) return await appliquerSansPiece(rdv, t);
  const piece: PieceLue = { ...(pieceLigne.data ?? {}), id: pieceLigne.id };
  /* RÉGLÉE SANS PIÈCE, PUIS LA PIÈCE EST VENUE (7 novembre 2026) : la
     transaction est déjà sur le rendez-vous (d'avance, ou après coup), et la
     pièce l'a reprise en « Acompte ». Le filet la relit à chaque ouverture :
     elle ne se pose JAMAIS une seconde fois sur la pièce. */
  if (dejaInscrit(piece, t.id) || (r.payments ?? []).some((x: any) => x?.id === `${PREFIXE_DU_VERSEMENT}${t.id}`)) {
    /* Un rejeu : l'argent est posé. Si l'honneur n'avait pas pu s'écrire, il s'écrit. */
    const honore = await suisLeRdv(rdv.id, null, piece.id, resteDeLaPiece(piece), new Date());
    return { ok: true, deja: true, versementXof: 0, pourboireXof: 0, honore };
  }

  const partage = partageDuPaiement(t.amountXof, resteDeLaPiece(piece));
  if (!partage.ok) return { ok: false, erreur: partage.raison, status: 409 };

  const quand = new Date();
  const v = versementEnLigne({ transactionId: t.id, montantXof: partage.versementXof, source: t.source, quand });
  const trace: ReglementEnLigne = {
    id: v.id, transactionId: t.id, payeLe: quand.toISOString(), montantXof: partage.versementXof,
    pourboireXof: partage.pourboireXof, fraisXof: t.feesXof, ...(moyenDit(t.source) ? { moyen: moyenDit(t.source) } : {}),
  };
  const neuve = pieceReglee(piece, v, partage.pourboireXof, trace);
  const { error: e1 } = await admin.from('invoices').update({ data: neuve }).eq('id', piece.id);
  if (e1) throw new Error(e1.message);

  const honore = await suisLeRdv(rdv.id, v, piece.id, resteDeLaPiece(neuve), quand);
  return { ok: true, versementXof: partage.versementXof, pourboireXof: partage.pourboireXof, honore };
}

/** LE RENDEZ-VOUS SUIT SA PIÈCE, relu à l'instant : le versement, puis
    l'honneur quand elle avait déclaré avoir terminé (`rdvApresLeReglement`).
    Rend vrai quand le rendez-vous porte l'honneur du règlement (posé ici ou
    déjà là) : la page dit alors « vous pouvez partir ». */
async function suisLeRdv(rdvId: string, v: VersementLu | null, pieceId: string, resteXof: number, quand: Date, parLeFoyer = false): Promise<boolean> {
  const { data: frais } = await admin.from('appointments').select('id,data').eq('id', rdvId).maybeSingle();
  if (!frais) return false;
  const avant: RdvLu = { ...(frais.data ?? {}), id: frais.id };
  const apres = rdvApresLeReglement(avant, v, pieceId, resteXof, quand, parLeFoyer);
  const honore = !!(apres as { honoreAuReglement?: { le?: string } }).honoreAuReglement?.le;
  if (apres === avant) return honore;
  const { error } = await admin.from('appointments').update({ data: apres }).eq('id', rdvId);
  if (error) throw new Error(error.message);
  return honore;
}

/** LE FILET : les transactions du registre pour ce rendez-vous (posées par
    kkiapay-webhook quand la page s'est fermée trop tôt), pas encore sur la pièce. */
async function rattrapeLeRegistre(rdv: Ligne): Promise<number> {
  const { data } = await admin.from('payments').select('id,data').eq('data->>partnerId', referenceDuRdv(rdv.id)).limit(20);
  let poses = 0;
  for (const row of data ?? []) {
    const d = row.data ?? {};
    if (String(d.status ?? '') !== 'success' || String(d.provider ?? 'kkiapay') !== 'kkiapay') continue;
    const r = await appliquer(rdv, { id: String(row.id), amountXof: Math.round(Number(d.amountXof) || 0), feesXof: Math.round(Number(d.feesXof) || 0), source: d.method });
    if (r.ok && !r.deja) poses += 1;
  }
  return poses;
}

/* ══ LE FOYER : UN JETON, PLUSIEURS RENDEZ-VOUS (28 octobre 2026) ═════════ */

/** Les rendez-vous du jeton du foyer, dans l'ordre du jour et de l'heure :
    ceux qui portent ce jeton ET se nomment dans sa liste. */
async function lesRdvsDuFoyer(jeton: string): Promise<Ligne[]> {
  const { data, error } = await admin.from('appointments').select('id,branch_id,data')
    .eq('data->lienDuFoyer->>jeton', jeton).limit(12);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Ligne[])
    .filter((l) => Array.isArray(l.data?.lienDuFoyer?.apptIds) && l.data.lienDuFoyer.apptIds.includes(l.id))
    .sort((a, b) => `${a.data?.date ?? ''} ${a.data?.time ?? ''} ${a.id}`.localeCompare(`${b.data?.date ?? ''} ${b.data?.time ?? ''} ${b.id}`));
}

/** L'ARGENT DU FOYER POSÉ : le registre d'abord (référence du foyer), puis
    chaque pièce relue à l'instant reçoit son reste, dans l'ordre ; le
    pourboire va sur la dernière. Une pièce où la transaction est déjà posée
    ne se repose pas (un rejeu ne double rien) ; un argent qui ne couvre pas
    le tout reste au registre, « à rapprocher » au comptoir. */
async function appliquerAuFoyer(jeton: string, rdvs: Ligne[], t: { id: string; amountXof: number; feesXof: number; source?: string }): Promise<
  { ok: true; deja?: boolean; versementXof: number; pourboireXof: number; honore?: boolean } | { ok: false; erreur: string; status: number }
> {
  const reference = referenceDuFoyer(jeton);
  const { error: insErr } = await admin.from('payments').insert({
    id: t.id, branch_id: rdvs[0]?.branch_id,
    data: {
      id: t.id, branchId: rdvs[0]?.branch_id, provider: 'kkiapay', amountXof: t.amountXof, feesXof: t.feesXof,
      method: t.source ?? undefined, partnerId: reference, status: 'success', at: new Date().toISOString(),
    },
  });
  if (insErr) {
    if (insErr.code !== '23505') throw new Error(insErr.message);
    const { data: inscrit } = await admin.from('payments').select('data').eq('id', t.id).maybeSingle();
    if (String(inscrit?.data?.partnerId ?? '') !== reference) return { ok: false, erreur: 'transaction_deja_utilisee', status: 409 };
  }

  const pieces: { rdv: Ligne; piece: PieceLue }[] = [];
  for (const rdv of rdvs) {
    const pl = await laPiece(rdv.id);
    if (pl) pieces.push({ rdv, piece: { ...(pl.data ?? {}), id: pl.id } });
  }
  if (pieces.length === 0) return { ok: false, erreur: 'sans_piece', status: 409 };
  const posee = (p: PieceLue) => (p.payments ?? []).filter((v) => v.id === idDuVersementDuFoyer(t.id, p.id));
  const dejaRecu = pieces.reduce((s, x) => s + posee(x.piece).reduce((a, v) => a + n(v.amountXof), 0), 0);
  const aPoser = pieces.filter((x) => posee(x.piece).length === 0);
  /* Un rejeu : l'argent est posé. L'honneur qui n'aurait pas pu s'écrire s'écrit, tête par tête. */
  const rejeu = async () => {
    let honore = true;
    for (const x of pieces) honore = (await suisLeRdv(x.rdv.id, null, x.piece.id, resteDeLaPiece(x.piece), new Date(), true)) && honore;
    return { ok: true as const, deja: true, versementXof: 0, pourboireXof: 0, honore };
  };
  if (dejaRecu > 0 && aPoser.every((x) => resteDeLaPiece(x.piece) <= 0)) return await rejeu();
  const rep = repartitionDuFoyer(t.amountXof - dejaRecu, aPoser.map((x) => ({ id: x.piece.id, resteXof: resteDeLaPiece(x.piece) })));
  if (!rep.ok) return dejaRecu > 0 ? await rejeu() : { ok: false, erreur: rep.raison, status: 409 };

  const quand = new Date();
  const derniere = rep.parts[rep.parts.length - 1].id;
  let verse = 0;
  let tousHonores = true;
  for (const part of rep.parts) {
    const x = aPoser.find((y) => y.piece.id === part.id);
    if (!x) continue;
    const v = { ...versementEnLigne({ transactionId: t.id, montantXof: part.montantXof, source: t.source, quand }), id: idDuVersementDuFoyer(t.id, x.piece.id) };
    const pourboire = part.id === derniere ? rep.pourboireXof : 0;
    const trace: ReglementEnLigne = {
      id: v.id, transactionId: t.id, payeLe: quand.toISOString(), montantXof: part.montantXof,
      pourboireXof: pourboire, fraisXof: part.id === derniere ? t.feesXof : 0, ...(moyenDit(t.source) ? { moyen: moyenDit(t.source) } : {}),
    };
    const neuve = pieceReglee(x.piece, v, pourboire, trace);
    const { error: e1 } = await admin.from('invoices').update({ data: neuve }).eq('id', x.piece.id);
    if (e1) throw new Error(e1.message);
    tousHonores = (await suisLeRdv(x.rdv.id, v, x.piece.id, resteDeLaPiece(neuve), quand, true)) && tousHonores;
    verse += part.montantXof;
  }
  return { ok: true, versementXof: verse, pourboireXof: rep.pourboireXof, honore: tousHonores };
}

/** LE FILET DU FOYER : les transactions du registre à sa référence, pas encore posées. */
async function rattrapeLeFoyer(jeton: string, rdvs: Ligne[]): Promise<number> {
  const { data } = await admin.from('payments').select('id,data').eq('data->>partnerId', referenceDuFoyer(jeton)).limit(20);
  let poses = 0;
  for (const row of data ?? []) {
    const d = row.data ?? {};
    if (String(d.status ?? '') !== 'success' || String(d.provider ?? 'kkiapay') !== 'kkiapay') continue;
    const r = await appliquerAuFoyer(jeton, rdvs, { id: String(row.id), amountXof: Math.round(Number(d.amountXof) || 0), feesXof: Math.round(Number(d.feesXof) || 0), source: d.method });
    if (r.ok && !r.deja) poses += 1;
  }
  return poses;
}

async function lireLeFoyer(jeton: string, rdvsLus: Ligne[], noteLOuverture: boolean) {
  let rdvs = rdvsLus;
  const rattrapes = await rattrapeLeFoyer(jeton, rdvs);
  if (rattrapes > 0) rdvs = await lesRdvsDuFoyer(jeton);
  if (noteLOuverture) {
    const ouvert = new Date().toISOString();
    for (const rdv of rdvs) {
      const lien = rdv.data?.lienDuFoyer;
      if (lien && !lien.ouvertLe) await admin.from('appointments').update({ data: { ...(rdv.data ?? {}), lienDuFoyer: { ...lien, ouvertLe: ouvert } } }).eq('id', rdv.id);
    }
  }
  const tetes: { rdv: RdvLu; piece: PieceLue | null; prenom?: string }[] = [];
  for (const rdv of rdvs) {
    const r: RdvLu = { ...(rdv.data ?? {}), id: rdv.id };
    const pl = await laPiece(rdv.id);
    tetes.push({ rdv: r, piece: pl ? { ...(pl.data ?? {}), id: pl.id } : null, prenom: await prenomDUsageDe(r.clientId, r.clientName) });
  }
  return json({ ok: true, rattrapes, page: pageDuFoyer({ tetes, jeton, branchId: rdvs[0]?.branch_id, maintenant: new Date() }) });
}

async function lire(req: Request, b: any, noteLOuverture: boolean) {
  if (!(await permis(ipOf(req), 'regler-lire', 60))) return json({ error: 'trop' }, 429);
  const jeton = String(b.jeton ?? '').trim();
  if (!estUnJeton(jeton)) return json({ error: 'lien' }, 400);
  let rdv = await leRdvDuJeton(jeton);
  if (!rdv) {
    const foyer = await lesRdvsDuFoyer(jeton);
    if (foyer.length > 0) return await lireLeFoyer(jeton, foyer, noteLOuverture);
    return json({ ok: true, page: pageDuLien({ rdv: null, piece: null, maintenant: new Date() }) });
  }
  const rattrapes = await rattrapeLeRegistre(rdv);
  if (rattrapes > 0) rdv = (await leRdvDuJeton(jeton)) ?? rdv;
  const r: RdvLu = { ...(rdv.data ?? {}), id: rdv.id };
  if (noteLOuverture && r.lienDeReglement && !r.lienDeReglement.ouvertLe) {
    const lien = { ...r.lienDeReglement, ouvertLe: new Date().toISOString() };
    await admin.from('appointments').update({ data: { ...(rdv.data ?? {}), lienDeReglement: lien } }).eq('id', rdv.id);
  }
  const pieceLigne = await laPiece(rdv.id);
  const piece: PieceLue | null = pieceLigne ? { ...(pieceLigne.data ?? {}), id: pieceLigne.id } : null;
  const prenom = await prenomDUsageDe(r.clientId, r.clientName);
  /* RÉGLER AVANT ET APRÈS (7 novembre 2026) : sans pièce, un rendez-vous que
     Ma Couronne a ouvert se règle sur lui-même, au reste du serveur ; tout
     réglé, la page dit « réglée ». Sinon, la page d'avant (elle attend sa pièce). */
  if (!piece) {
    const sp = await laPorteSansPiece(rdv, Date.now());
    if (sp && (sp.porte.ouverte || sp.porte.raison === 'deja-regle')) {
      return json({ ok: true, rattrapes, page: pageSansPiece({ rdv: r as any, porte: sp.porte, quand: sp.moment, prenom, reference: referenceDuRdv(rdv.id), branchId: rdv.branch_id }) });
    }
  }
  return json({ ok: true, rattrapes, page: pageDuLien({ rdv: r, piece, prenom, branchId: rdv.branch_id, maintenant: new Date() }) });
}

async function regler(req: Request, b: any) {
  if (!(await permis(ipOf(req), 'regler-payer', 20))) return json({ error: 'trop' }, 429);
  const jeton = String(b.jeton ?? '').trim();
  const transactionId = String(b.transactionId ?? '').trim();
  if (!estUnJeton(jeton) || !transactionId) return json({ error: 'bad_request' }, 400);
  const rdv = await leRdvDuJeton(jeton);
  const foyer = rdv ? [] : await lesRdvsDuFoyer(jeton);
  if (!rdv && foyer.length === 0) return json({ error: 'lien_introuvable' }, 404);
  const tx = await transaction(transactionId);
  if ((tx.status ?? '').toUpperCase() !== 'SUCCESS') return json({ error: 'echec', detail: tx.failureMessage ?? tx.status ?? '' }, 402);
  const argent = { id: transactionId, amountXof: Math.round(Number(tx.amount ?? 0)), feesXof: Math.round(Number(tx.fees ?? 0)), source: tx.source };
  const r = rdv ? await appliquer(rdv, argent) : await appliquerAuFoyer(jeton, foyer, argent);
  if (!r.ok) return json({ error: r.erreur }, r.status);
  /* `honore` : elle avait terminé elle-même et tout est réglé, le rendez-vous
     vient de passer honoré. La page lui dit qu'elle peut partir. */
  return json({ ok: true, deja: !!r.deja, versementXof: r.versementXof, pourboireXof: r.pourboireXof, moyen: moyenDit(tx.source), honore: !!r.honore });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') {
    return json({
      fonction: 'regler-la-seance', ok: true,
      secrets: {
        public: !!Deno.env.get('KKIAPAY_PUBLIC_KEY'), private: !!Deno.env.get('KKIAPAY_PRIVATE_KEY'),
        secret: !!Deno.env.get('KKIAPAY_SECRET_KEY'), service: !!SERVICE_KEY,
      },
    });
  }
  try {
    const b = await req.json().catch(() => ({}));
    if (b.action === 'lire') return await lire(req, b, true);
    if (b.action === 'rattraper') return await lire(req, b, false);
    if (b.action === 'regler') return await regler(req, b);
    return json({ error: 'action' }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
