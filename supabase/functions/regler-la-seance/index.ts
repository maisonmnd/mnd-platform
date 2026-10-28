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
 * Verify JWT : ÉTEINT (la cliente n'a pas de compte). Secrets : ceux de
 * kkiapay-verify (KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY, KKIAPAY_SECRET_KEY,
 * KKIAPAY_API_BASE) et SERVICE_KEY, déjà posés sur le projet : rien à ajouter.
 */

const VERSION = '2026-10-28-b';

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
  };
}
// ── FIN copie de shared/regler-la-seance-pur.ts

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

async function nomDe(clientId: unknown): Promise<string> {
  if (!clientId) return '';
  const { data } = await admin.from('clients').select('data').eq('id', String(clientId)).maybeSingle();
  return String(data?.data?.name ?? '');
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
  { ok: true; deja?: boolean; versementXof: number; pourboireXof: number } | { ok: false; erreur: string; status: number }
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
  if (!pieceLigne) return { ok: false, erreur: 'sans_piece', status: 409 };
  const piece: PieceLue = { ...(pieceLigne.data ?? {}), id: pieceLigne.id };
  if (dejaInscrit(piece, t.id)) return { ok: true, deja: true, versementXof: 0, pourboireXof: 0 };

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

  const { data: frais } = await admin.from('appointments').select('id,data').eq('id', rdv.id).maybeSingle();
  if (frais) {
    const avant: RdvLu = { ...(frais.data ?? {}), id: frais.id };
    const apres = rdvRegle(avant, v, piece.id);
    if (apres !== avant) {
      const { error: e2 } = await admin.from('appointments').update({ data: apres }).eq('id', rdv.id);
      if (e2) throw new Error(e2.message);
    }
  }
  return { ok: true, versementXof: partage.versementXof, pourboireXof: partage.pourboireXof };
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
  { ok: true; deja?: boolean; versementXof: number; pourboireXof: number } | { ok: false; erreur: string; status: number }
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
  if (dejaRecu > 0 && aPoser.every((x) => resteDeLaPiece(x.piece) <= 0)) return { ok: true, deja: true, versementXof: 0, pourboireXof: 0 };
  const rep = repartitionDuFoyer(t.amountXof - dejaRecu, aPoser.map((x) => ({ id: x.piece.id, resteXof: resteDeLaPiece(x.piece) })));
  if (!rep.ok) return dejaRecu > 0 ? { ok: true, deja: true, versementXof: 0, pourboireXof: 0 } : { ok: false, erreur: rep.raison, status: 409 };

  const quand = new Date();
  const derniere = rep.parts[rep.parts.length - 1].id;
  let verse = 0;
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
    const { data: frais } = await admin.from('appointments').select('id,data').eq('id', x.rdv.id).maybeSingle();
    if (frais) {
      const avant: RdvLu = { ...(frais.data ?? {}), id: frais.id };
      const apres = rdvRegle(avant, v, x.piece.id, true);
      if (apres !== avant) {
        const { error: e2 } = await admin.from('appointments').update({ data: apres }).eq('id', x.rdv.id);
        if (e2) throw new Error(e2.message);
      }
    }
    verse += part.montantXof;
  }
  return { ok: true, versementXof: verse, pourboireXof: rep.pourboireXof };
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
  const tetes: { rdv: RdvLu; piece: PieceLue | null; nom?: string }[] = [];
  for (const rdv of rdvs) {
    const r: RdvLu = { ...(rdv.data ?? {}), id: rdv.id };
    const pl = await laPiece(rdv.id);
    tetes.push({ rdv: r, piece: pl ? { ...(pl.data ?? {}), id: pl.id } : null, nom: (await nomDe(r.clientId)) || r.clientName || '' });
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
  const nom = (await nomDe(r.clientId)) || r.clientName || '';
  return json({ ok: true, rattrapes, page: pageDuLien({ rdv: r, piece, nomDeLaCliente: nom, branchId: rdv.branch_id, maintenant: new Date() }) });
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
  return json({ ok: true, deja: !!r.deja, versementXof: r.versementXof, pourboireXof: r.pourboireXof, moyen: moyenDit(tx.source) });
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
