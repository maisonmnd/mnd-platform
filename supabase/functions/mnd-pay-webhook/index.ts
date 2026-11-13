// mnd-pay-webhook - FedaPay annonce, MND PAY verifie.
//
// Premiere ligne volontairement pauvre (lecon du 14 septembre 2026).

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ═══════════════════════════════════════════════════════════════════
   MND-PAY-WEBHOOK — 16 octobre 2026.

   FedaPay appelle cette adresse quand une transaction change d'état
   (`transaction.approved`, `transaction.declined`, `transaction.canceled`…).
   C'est elle qui fait passer le comptoir au vert pendant que la cliente
   range son téléphone.

   DEUX GARDES, ET AUCUNE NE SUFFIT SEULE :
     ① LA SIGNATURE. FedaPay signe chaque appel : en-tête
        `X-FEDAPAY-SIGNATURE: t=<horodatage>,s=<signature>`, la signature
        étant HMAC-SHA256 (hex) de « <horodatage>.<corps brut> » avec le
        secret du point d'arrivée, à cinq minutes près (SDK officiel,
        `WebhookSignature::verifyHeader`, tolérance 300). Sans secret posé,
        on refuse tout : un appel non signé ne fait rien bouger.
     ② LA TRANSACTION RELUE. Même signé, le corps ne fait pas foi : on
        redemande la transaction à FedaPay avec la clé secrète, et c'est SA
        réponse qui s'écrit. Une signature volée ne paierait rien.

   À DÉPLOYER SANS VÉRIFICATION DU JWT (« Verify JWT » éteint) : FedaPay ne
   présente pas de jeton Supabase. La signature tient la porte.

   TAP & GO (17 octobre 2026) : une transaction que MND PAY n'a pas créée
   (la cliente a composé le code USSD de la Maison) n'est plus ignorée. Relue
   chez FedaPay, elle règle l'attente du même montant au comptoir, ou va
   « À rattacher » (`rangeLeTapGo`, même texte que dans `mnd-pay`).

   SECRETS : FEDAPAY_SECRET_KEY, FEDAPAY_ENV (comme `mnd-pay`), et
   FEDAPAY_WEBHOOK_SECRET (FedaPay › Développeurs › Webhooks › le point
   d'arrivée › « Cliquez pour révéler »).
   ═══════════════════════════════════════════════════════════════════ */

/* 20 octobre 2026 (le parcours de l'abonnée) : une demande payée qui règle
   un contrat s'inscrit au contrat ET à sa pièce (`verse_sur_l_abonnement`).

   12 novembre 2026 (le choix du moyen, lot C) : une demande née sur la page
   « Régler » d'un rendez-vous (genre `regler`), payée, se POSE ICI sur sa
   pièce et son rendez-vous (`poseLeReglementDuLien`, même texte que dans
   mnd-pay), sans qu'un Trône soit ouvert. Un échec rend 500 : FedaPay rejoue,
   et le rejeu passe par « déjà payée », qui reprend la pose. */
const VERSION = '2026-11-12-b';

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

const SECRET = (Deno.env.get('FEDAPAY_SECRET_KEY') ?? '').trim();
const SECRET_WEBHOOK = (Deno.env.get('FEDAPAY_WEBHOOK_SECRET') ?? '').trim();
const ENV = (Deno.env.get('FEDAPAY_ENV') ?? 'live').trim().toLowerCase();
const BASE = ENV === 'sandbox' || ENV === 'test' ? 'https://sandbox-api.fedapay.com/v1' : 'https://api.fedapay.com/v1';

// ── DEBUT signatureValide (relu et éprouvé par scripts/verifie-mnd-pay)
/** La signature de FedaPay est-elle bonne ? `maintenantS` en secondes. */
async function signatureValide(entete: string, corpsBrut: string, secret: string, maintenantS: number): Promise<boolean> {
  if (!entete || !secret) return false;
  let t = -1;
  const signatures: string[] = [];
  for (const morceau of entete.split(',')) {
    const i = morceau.indexOf('=');
    if (i < 0) continue;
    const cle = morceau.slice(0, i).trim();
    const val = morceau.slice(i + 1).trim();
    if (cle === 't' && /^\d+$/.test(val)) t = Number(val);
    if (cle === 's' && val) signatures.push(val.toLowerCase());
  }
  if (t < 0 || signatures.length === 0) return false;
  if (Math.abs(maintenantS - t) > 300) return false;
  const cle = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(`${t}.${corpsBrut}`)));
  const attendue = Array.from(mac, (o) => o.toString(16).padStart(2, '0')).join('');
  /* Comparaison à temps constant : on ne dit pas, par la durée, combien de
     caractères étaient justes. */
  return signatures.some((s) => {
    if (s.length !== attendue.length) return false;
    let diff = 0;
    for (let k = 0; k < s.length; k++) diff |= s.charCodeAt(k) ^ attendue.charCodeAt(k);
    return diff === 0;
  });
}
// ── FIN signatureValide

// ── DEBUT statutDepuisFedaPay (même règle que src/shared/mnd-pay-pur.ts)
function statutDepuisFedaPay(s: unknown): string {
  const v = String(s ?? '').toLowerCase();
  if (['approved', 'transferred', 'refunded', 'approved_partially_refunded', 'transferred_partially_refunded'].includes(v)) return 'payee';
  if (v === 'declined') return 'refusee';
  if (v === 'canceled' || v === 'cancelled') return 'annulee';
  if (v === 'expired') return 'expiree';
  return 'en_attente';
}
// ── FIN statutDepuisFedaPay

// ── DEBUT instantDe (même texte que src/shared/mnd-pay-pur.ts, relu par scripts/verifie-mnd-pay)
/** UN INSTANT DE FEDAPAY EN MILLISECONDES. Ses dates portent six décimales
    (« 2026-10-17T08:12:03.000000Z ») ou un espace au lieu du T ; sans fuseau,
    c'est l'heure universelle. NaN quand rien ne se lit. */
function instantDe(s: unknown): number {
  const brut = String(s ?? '').trim();
  if (!brut) return NaN;
  let iso = brut.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(iso)) iso += 'Z';
  return Date.parse(iso);
}
// ── FIN instantDe

// ── DEBUT rapprocheTapGo (même texte que src/shared/mnd-pay-pur.ts, relu par scripts/verifie-mnd-pay)
/** QUELLE ATTENTE CE PAIEMENT RÈGLE-T-IL ? Une attente Tap & Go, encore en
    attente, sans transaction, du même montant à un franc près. Au comptoir,
    posée au plus une demi-heure avant le paiement ; sur une FACTURE envoyée
    (genre « lien », 17 octobre 2026), le temps qu'elle paie : quarante-cinq
    jours. Deux minutes d'avance tolérées pour les horloges. Le comptoir passe
    d'abord : la cliente qui compose devant la caissière est celle qu'on
    attend. Une seule attente : c'est elle. Plusieurs : on ne choisit pas. */
function rapprocheTapGo(
  paiement: { montantXof: number; quandMs: number },
  attentes: readonly { id: string; moyen?: string; statut?: string; fedapayId?: number; totalXof?: number; creeLe?: string; genre?: string }[],
): { sorte: 'une'; id: string } | { sorte: 'aucune' } | { sorte: 'plusieurs'; ids: string[] } {
  const montant = Math.round(Number(paiement.montantXof) || 0);
  if (montant <= 0) return { sorte: 'aucune' };
  const valables = attentes.filter((a) => {
    if (a.moyen !== 'tapgo' || a.statut !== 'en_attente' || a.fedapayId) return false;
    if (Math.abs(Math.round(Number(a.totalXof) || 0) - montant) > 1) return false;
    const t = Date.parse(String(a.creeLe ?? ''));
    if (!Number.isFinite(t) || !Number.isFinite(paiement.quandMs)) return false;
    const ecart = paiement.quandMs - t;
    const fenetre = a.genre === 'lien' ? 45 * 86_400_000 : 30 * 60_000;
    return ecart >= -2 * 60_000 && ecart <= fenetre;
  });
  const auComptoir = valables.filter((a) => a.genre !== 'lien').map((a) => a.id);
  const ids = auComptoir.length > 0 ? auComptoir : valables.map((a) => a.id);
  if (ids.length === 1) return { sorte: 'une', id: ids[0] };
  return ids.length === 0 ? { sorte: 'aucune' } : { sorte: 'plusieurs', ids };
}
// ── FIN rapprocheTapGo

// ── DEBUT rangeLeTapGo (même texte dans mnd-pay et mnd-pay-webhook)
/** UN PAIEMENT QUE MND PAY N'A PAS CRÉÉ — Tap & Go, 17 octobre 2026 : la
    cliente a composé le code USSD de la Maison. La transaction a été RELUE
    chez FedaPay avant d'arriver ici. Seul un « payé » range quelque chose.
    Une attente du même montant, et une seule : elle passe « payée », et le
    comptoir qui l'attend s'encaisse seul. Aucune, ou plusieurs : la ligne
    s'écrit « À rattacher » (identifiant tiré de la transaction : deux appels
    simultanés n'en écrivent qu'une). */
async function rangeLeTapGo(admin: any, tx: any): Promise<string> {
  const fedapayId = Number(tx?.id);
  if (!Number.isFinite(fedapayId) || fedapayId <= 0) return 'sans transaction';
  if (statutDepuisFedaPay(tx?.status) !== 'payee') return 'pas encore payée';
  const { data: connue } = await admin.from('mnd_pay').select('id').eq('data->>fedapayId', String(fedapayId)).limit(1);
  if ((connue ?? []).length > 0) return 'deja';
  const montantXof = Math.round(Number(tx?.amount ?? 0));
  if (!(montantXof > 0)) return 'sans montant';
  const quand = instantDe(tx?.approved_at ?? tx?.created_at);
  const quandMs = Number.isFinite(quand) ? quand : Date.now();
  /* Les attentes d'une facture vivent quarante-cinq jours (17 octobre 2026). */
  const depuis = new Date(quandMs - 46 * 86_400_000).toISOString();
  const { data: lignes } = await admin.from('mnd_pay').select('id, branch_id, data')
    .eq('data->>moyen', 'tapgo').eq('data->>statut', 'en_attente').gte('updated_at', depuis).limit(500);
  const attentes = (lignes ?? []).map((l: any) => ({ ...(l.data ?? {}), id: String(l.id) }));
  const choix = rapprocheTapGo({ montantXof, quandMs }, attentes);
  const commun: Record<string, unknown> = {
    statut: 'payee',
    fedapayId,
    ...(tx?.reference ? { reference: String(tx.reference) } : {}),
    ...(tx?.mode ? { modeReel: String(tx.mode) } : {}),
    ...(Number.isFinite(Number(tx?.fees)) && Number(tx?.fees) > 0 ? { commissionXof: Math.round(Number(tx.fees)) } : {}),
    payeeLe: new Date(quandMs).toISOString(),
  };
  if (choix.sorte === 'une') {
    const ligne = (lignes ?? []).find((l: any) => String(l.id) === choix.id);
    const { error } = await admin.from('mnd_pay').update({ data: { ...(ligne?.data ?? {}), ...commun } })
      .eq('id', choix.id).eq('data->>statut', 'en_attente');
    if (error) throw new Error(error.message);
    return `rattachée à ${choix.id}`;
  }
  let branchId = choix.sorte === 'plusieurs'
    ? String((lignes ?? []).find((l: any) => String(l.id) === choix.ids[0])?.branch_id ?? '')
    : '';
  if (!branchId) {
    const { data: derniere } = await admin.from('mnd_pay').select('branch_id').not('branch_id', 'is', null)
      .order('updated_at', { ascending: false }).limit(1);
    branchId = String(derniere?.[0]?.branch_id ?? '');
  }
  if (!branchId) {
    const { data: branches } = await admin.from('branches').select('id').limit(1);
    branchId = String(branches?.[0]?.id ?? '');
  }
  const id = `tg-${fedapayId}`;
  const data = {
    id, branchId, genre: 'comptoir', moyen: 'tapgo', montantXof, fraisXof: 0, totalXof: montantXof,
    pieceId: '', libelle: 'Tap & Go, code composé par la cliente', creeLe: new Date(quandMs).toISOString(),
    ...commun,
    ...(choix.sorte === 'plusieurs' ? { raison: `${choix.ids.length} tickets attendaient ce montant : à rattacher à la main` } : {}),
  };
  const { error } = await admin.from('mnd_pay').insert({ id, branch_id: branchId || null, data });
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message);
  return 'à rattacher';
}
// ── FIN rangeLeTapGo

// ── DEBUT duDuContrat (éprouvé par scripts/verifie-le-serveur-de-l-abonnee : même réponse que argentDuContrat)
function duDuContrat(d: any, piece: any, plan: any, jour: string): { duXof: number; resteXof: number; raison?: 'resiliee' | 'effacee' | 'suspendue' | 'deja_regle' } {
  const n = (x: unknown): number => (Number.isFinite(Number(x)) ? Number(x) : 0);
  const iso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const plus = (s: string, k: number): string => new Date(Date.parse(`${s}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
  const ouvre = (s: string): string => (iso(s) && new Date(`${s}T12:00:00Z`).getUTCDay() === 0 ? plus(s, 1) : s);
  /* LE VERSÉ : le contrat d'abord, puis sa pièce, réunis par identifiant. */
  const verses = new Map<string, number>();
  for (const p of Array.isArray(d?.payments) ? d.payments : []) if (p?.id) verses.set(String(p.id), n(p.amountXof));
  for (const p of Array.isArray(piece?.payments) ? piece.payments : []) if (p?.id && !verses.has(String(p.id))) verses.set(String(p.id), n(p.amountXof));
  const verse = [...verses.values()].reduce((s, x) => s + x, 0);
  const paquet = plan?.mode === 'pack';
  const prix = n(d?.prixConvenuXof ?? (paquet ? d?.priceXof : undefined) ?? plan?.priceXof ?? 0);
  if (d?.resilieeLe ? String(d.resilieeLe) <= jour : d?.status === 'churn') return { duXof: 0, resteXof: 0, raison: 'resiliee' };
  const ech = Array.isArray(d?.echeances) && d.echeances.length
    ? [...d.echeances].sort((a: any, b: any) => n(a?.numero) - n(b?.numero)).map((e: any) => n(e?.amountXof))
    : paquet && prix > 0 ? [prix] : [];
  /* LA RETENUE : prise en ligne, rien de réglé, sept jours (le lundi si le
     septième est un dimanche), puis effacée. */
  if (d?.origine === 'couronne' && verse <= 0) {
    if (d?.renonceeLe && String(d.renonceeLe) <= jour) return { duXof: 0, resteXof: 0, raison: 'effacee' };
    const debut = iso(d?.startIso) ? d.startIso : d?.sinceIso;
    if (iso(debut) && jour > ouvre(plus(debut, 7))) return { duXof: 0, resteXof: 0, raison: 'effacee' };
    return { duXof: ech[0] ?? prix, resteXof: ech.length ? ech.reduce((s: number, x: number) => s + x, 0) : prix };
  }
  /* UNE LUNE : jamais une dette, elle se règle d'avance ou pour sortir de la
     pause ; pas pendant une suspension. */
  if (!ech.length) {
    const s = d?.suspendue;
    if (s && s.du <= jour && jour <= s.au) return { duXof: 0, resteXof: 0, raison: 'suspendue' };
    if (paquet || !iso(d?.nextIso) || !(prix > 0)) return { duXof: 0, resteXof: 0, raison: 'deja_regle' };
    return { duXof: prix, resteXof: prix };
  }
  let reserve = Math.max(0, verse);
  let du = 0;
  let reste = 0;
  for (const m of ech) {
    const pris = Math.min(reserve, m);
    reserve -= pris;
    if (m - pris > 0 && du === 0) du = m - pris;
    reste += m - pris;
  }
  return du > 0 ? { duXof: du, resteXof: reste } : { duXof: 0, resteXof: 0, raison: 'deja_regle' };
}
// ── FIN duDuContrat

// ── DEBUT leContratEtSaPiece (même texte dans kkiapay-verify, kkiapay-webhook, mnd-pay et mnd-pay-webhook)
/** Le jour à Cotonou (UTC+1, sans heure d'été). */
const jourDeCotonou = (): string => new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
/** La pièce et la formule d'un contrat, relues pour juger son dû. */
async function leContratEtSaPiece(admin: any, d: any): Promise<{ piece: any; plan: any }> {
  const piece = d?.invoiceId
    ? (await admin.from('invoices').select('data').eq('id', String(d.invoiceId)).maybeSingle())?.data?.data ?? null
    : null;
  const plan = d?.planId
    ? (await admin.from('plans').select('data').eq('id', String(d.planId)).maybeSingle())?.data?.data ?? null
    : null;
  return { piece, plan };
}
// ── FIN leContratEtSaPiece

/* ══ L'ARGENT D'UN CONTRAT — 20 octobre 2026 (le parcours de l'abonnée) ══
   « Le contrat fait foi, la pièce suit » (décision 6). Une demande MND PAY
   qui règle la pièce d'un abonnement (ou nomme son contrat, `subId`) ne
   s'inscrit plus seulement sur la pièce : `verse_sur_l_abonnement` (0138)
   l'écrit au contrat ET à la pièce, sous l'identifiant de la demande, le
   même que celui que le Trône inscrit (`versementDeLaDemande`) : deux
   inscriptions n'en font qu'une. Le montant demandé ne dépasse jamais ce
   que le contrat attend encore. Même texte dans mnd-pay et mnd-pay-webhook. */
// ── DEBUT moyenDeLaPiece (même corps que src/shared/mnd-pay-pur.ts)
function moyenDeLaPiece(d: any): string {
  const m = String(d.modeReel ?? '').toLowerCase();
  if (m.startsWith('mtn')) return 'MTN MoMo';
  if (m.startsWith('moov')) return 'Moov';
  if (m === 'sbin' || m.startsWith('celtiis')) return 'Celtiis';
  if (m && /card|visa|master|carte/.test(m)) return 'Carte';
  if (d.moyen === 'mtn') return 'MTN MoMo';
  if (d.moyen === 'moov') return 'Moov';
  if (d.moyen === 'celtiis') return 'Celtiis';
  if (d.moyen === 'carte') return 'Carte';
  return 'FedaPay';
}
// ── FIN moyenDeLaPiece

// ── DEBUT leContratDeLaDemande (même texte dans mnd-pay et mnd-pay-webhook)
/** Le contrat que règle une demande : celui qu'elle nomme, sinon le seul
    dont la pièce est la sienne. Rien s'il n'y en a pas, ou plusieurs. */
async function leContratDeLaDemande(admin: any, subId: unknown, pieceId: unknown): Promise<{ id: string; data: any; piece: any; plan: any } | null> {
  let ligne: any = null;
  if (String(subId ?? '').trim()) {
    ligne = (await admin.from('subscribers').select('id, data').eq('id', String(subId).trim()).maybeSingle())?.data ?? null;
  } else if (String(pieceId ?? '').trim()) {
    const { data: lies } = await admin.from('subscribers').select('id, data').eq('data->>invoiceId', String(pieceId).trim()).limit(2);
    ligne = Array.isArray(lies) && lies.length === 1 ? lies[0] : null;
  }
  if (!ligne) return null;
  const { piece, plan } = await leContratEtSaPiece(admin, ligne.data ?? {});
  return { id: String(ligne.id), data: ligne.data ?? {}, piece, plan };
}
// ── FIN leContratDeLaDemande

// ── DEBUT verseSurLeContratDeLaDemande (même texte dans mnd-pay et mnd-pay-webhook)
/** UNE DEMANDE PAYÉE QUI RÈGLE UN CONTRAT : le versement passe par le seul
    chemin de l'argent. Le jour est celui où FedaPay a confirmé, à Cotonou.
    Rejouée, elle n'écrit rien de plus. */
async function verseSurLeContratDeLaDemande(admin: any, d: any): Promise<string> {
  if (d?.statut !== 'payee' || !d?.id) return 'pas payée';
  const contrat = await leContratDeLaDemande(admin, d.subId, d.pieceId);
  if (!contrat) return 'sans contrat';
  const t = Date.parse(String(d.payeeLe ?? d.creeLe ?? ''));
  const jour = Number.isFinite(t) ? new Date(t + 3_600_000).toISOString().slice(0, 10) : jourDeCotonou();
  const { data: r, error } = await admin.rpc('verse_sur_l_abonnement', {
    p_sub_id: contrat.id,
    p_versement: {
      id: String(d.id), montantXof: Math.round(Number(d.montantXof ?? 0)), date: jour, moyen: moyenDeLaPiece(d),
      cashbox: 'FedaPay', source: 'mnd-pay', note: `FedaPay${d.reference ? ` · réf. ${d.reference}` : ''}`,
    },
  });
  if (error) throw new Error(error.message);
  return r?.ok === false ? `refusé : ${r.raison}` : r?.dejaVerse ? 'déjà inscrit' : 'inscrit au contrat';
}
// ── FIN verseSurLeContratDeLaDemande

const laTransaction = (r: any): any => r?.['v1/transaction'] ?? r?.transaction ?? r;

/* ══ LA PAGE « RÉGLER », SON SECOURS FEDAPAY — 12 novembre 2026 ═════════
   Le choix du moyen, lot C. Les règles vivent dans
   src/shared/regler-par-fedapay-pur.ts ; la fonction en porte des COPIES,
   entre leurs repères, que scripts/fedapay-copie-serveur.mjs réécrit et que
   le banc verifie-regler-par-fedapay compare, caractère pour caractère : la
   pièce et le versement (regler-la-seance-pur.ts), les frais
   (mnd-pay-pur.ts), l'honneur au règlement (terminer-et-regler-pur.ts), et
   le bloc ⟨regler-par-fedapay⟩. */

// ── DEBUT copie de shared/regler-la-seance-pur.ts (fedapay-copie-serveur la réécrit, verifie-regler-par-fedapay la compare)
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

export const ALPHABET_DU_JETON = '23456789abcdefghjkmnpqrstuvwxyz';

export const LONGUEUR_DU_JETON = 14;

export const estUnJeton = (s: unknown): s is string =>
  typeof s === 'string' && s.length === LONGUEUR_DU_JETON && [...s].every((c) => ALPHABET_DU_JETON.includes(c));

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
// ── FIN copie de shared/regler-la-seance-pur.ts

// ── DEBUT copie de shared/mnd-pay-pur.ts (fedapay-copie-serveur la réécrit, verifie-regler-par-fedapay la compare)
export type MoyenMndPay = 'mtn' | 'moov' | 'celtiis' | 'carte' | 'au_choix' | 'tapgo';

export type ReglagesMndPay = {
  /** MND PAY s'allume ici, une fois le compte FedaPay ouvert et les clés posées. */
  actif?: boolean;
  /** Les frais ajoutés pour la cliente, en pourcentage du montant. 1,8 % est
      la grille affichée par FedaPay pour MTN et Moov au Bénin (16 octobre 2026). */
  tauxMobilePct?: number;
  /** Le taux de la carte, à recopier de son contrat FedaPay. */
  tauxCartePct?: number;
  /** Les codes de FedaPay pour la demande directe (à corriger si le premier
      essai dit autre chose : la documentation n'est pas d'accord avec elle-même). */
  modes?: Partial<Record<'mtn' | 'moov' | 'celtiis', string>>;
  /** Zelle, noté à la main : le compte américain qui le reçoit. */
  zelle?: { actif?: boolean; adresse?: string; titulaire?: string };
  /** TAP & GO (17 octobre 2026) : le code USSD de la Maison chez FedaPay.
      Allumé par défaut avec MND PAY ; `code` est le code marchand à cinq
      chiffres de la page Tap & Go, `tauxPct` sa commission. */
  tapgo?: { actif?: boolean; code?: string; tauxPct?: number };
};

export const TAUX_MOBILE_DEFAUT = 1.8;

export const TAUX_TAPGO_DEFAUT = 1.6;

const f = (x: number): number => Math.max(0, Math.round(Number.isFinite(x) ? x : 0));

export function tauxDe(moyen: MoyenMndPay, r: ReglagesMndPay | undefined): number {
  const mobile = Math.max(0, Number(r?.tauxMobilePct ?? TAUX_MOBILE_DEFAUT) || 0);
  const carte = Math.max(0, Number(r?.tauxCartePct ?? 0) || 0) || mobile;
  if (moyen === 'tapgo') {
    const t = Number(r?.tapgo?.tauxPct ?? TAUX_TAPGO_DEFAUT);
    return Number.isFinite(t) && t >= 0 ? t : TAUX_TAPGO_DEFAUT;
  }
  if (moyen === 'carte') return carte;
  if (moyen === 'au_choix') return Math.max(mobile, carte);
  return mobile;
}

export function fraisPour(baseXof: number, moyen: MoyenMndPay, r: ReglagesMndPay | undefined): number {
  const base = f(baseXof);
  if (base <= 0) return 0;
  const pct = tauxDe(moyen, r);
  return pct > 0 ? Math.ceil((base * pct) / 100 - 1e-9) : 0;
}

export function compteDeLaDemande(e: { montantXof: number; pourboireXof?: number; moyen: MoyenMndPay; reglages?: ReglagesMndPay; fraisOfferts?: boolean }): {
  montantXof: number; pourboireXof: number; fraisXof: number; totalXof: number; fraisOffertsXof?: number;
} {
  const montantXof = f(e.montantXof);
  const pourboireXof = f(e.pourboireXof ?? 0);
  /* Les frais portent sur tout ce qui passe chez FedaPay, pourboire compris :
     il traverse le même tuyau, il en paie la même commission. */
  const dus = fraisPour(montantXof + pourboireXof, e.moyen, e.reglages);
  const offerts = !!e.fraisOfferts && dus > 0;
  const fraisXof = offerts ? 0 : dus;
  return { montantXof, pourboireXof, fraisXof, totalXof: montantXof + pourboireXof + fraisXof, ...(offerts ? { fraisOffertsXof: dus } : {}) };
}
// ── FIN copie de shared/mnd-pay-pur.ts

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

/* ⟨regler-par-fedapay⟩ */
/** Le genre d'une demande née sur la page Régler, au registre `mnd_pay`.
    Ni « lien » (le Trône inscrirait lui-même le versement, sans le merci),
    ni « comptoir » : c'est le serveur qui la pose sur sa pièce. */
export const GENRE_DU_LIEN_REGLER = 'regler';
/** La page de paiement de FedaPay : elle y choisit mobile money ou carte. */
export const MOYEN_DU_LIEN_REGLER = 'au_choix';
/** La caisse de l'argent reçu par FedaPay (celle du Trône, `CAISSE_MND_PAY`). */
export const CAISSE_FEDAPAY_DU_LIEN = 'FedaPay';
/** Son nom d'avant le 12 novembre 2026 : il vaut encore la caisse FedaPay. */
export const ANCIEN_NOM_MND_PAY = 'MND PAY';
/** Le merci, de 0 à 100 000 F : la règle de « Payer par MTN ». */
export const MERCI_MAX_DU_LIEN = 100_000;
/** Au-delà, ce n'est plus une séance : un montant à vérifier (le plafond de mnd-pay). */
export const PLAFOND_DU_LIEN_XOF = 5_000_000;
/** Une demande encore en attente, du même total, se reprend une demi-heure :
    deux touchers ne font pas deux transactions chez FedaPay. */
export const REPRISE_DU_LIEN_MS = 30 * 60_000;
/** Une demande payée que le serveur n'a pas pu poser paraît « à rattacher »
    au Trône passé ce délai (une panne entre les deux). */
export const DELAI_DU_LIEN_REGLER_MS = 10 * 60_000;
/** L'identifiant d'une demande au registre : « mp- » et vingt signes hexadécimaux, tirés par le serveur. */
export const RE_DEMANDE_DU_LIEN = /^mp-[0-9a-f]{20}$/;
/** Ce que FedaPay montre sur sa page : jamais un nom, jamais un numéro de pièce. */
export const LIBELLE_DU_LIEN_REGLER = 'Maison MND · règlement de la séance';
/** Qui a demandé, au registre. */
export const DEMANDEE_PAR_LE_LIEN = 'la cliente, par son lien Régler';

const entier = (x: unknown): number => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : 0);

/** Le merci tapé : un entier de 0 à 100 000 F ; rien quand la pièce en porte déjà un. */
export function merciDuLien(x: unknown, permis: boolean): number {
  const v = Math.floor(Number(x));
  if (!permis || !Number.isFinite(v) || v <= 0) return 0;
  return Math.min(MERCI_MAX_DU_LIEN, v);
}

/** LES RÉGLAGES DE LA MAISON qui comptent ici, lus dans le document
    `mnd_settings` (sa clé `mndPay`) : FedaPay allumé, et ses deux taux. Un
    taux illisible ne se lit pas (le défaut de mnd-pay-pur s'applique). */
export function reglagesDuLien(doc: unknown): ReglagesMndPay {
  const m = (doc && typeof doc === 'object' ? (doc as { mndPay?: unknown }).mndPay : null) as Record<string, unknown> | null;
  if (!m || typeof m !== 'object') return {};
  const taux = (x: unknown): number | undefined => {
    const v = Number(x);
    return x !== undefined && x !== null && x !== '' && Number.isFinite(v) && v >= 0 && v <= 20 ? v : undefined;
  };
  const mobile = taux(m.tauxMobilePct);
  const carte = taux(m.tauxCartePct);
  return { actif: m.actif === true, ...(mobile !== undefined ? { tauxMobilePct: mobile } : {}), ...(carte !== undefined ? { tauxCartePct: carte } : {}) };
}

/** FedaPay se propose sur la page : allumé par la Maison, et sa clé posée au serveur. */
export const fedapayOuvertAuLien = (o: { reglages: ReglagesMndPay | undefined; clePosee: boolean }): boolean =>
  o.reglages?.actif === true && o.clePosee === true;

/** LE COMPTE DU SERVEUR : le reste de la pièce, le merci (s'il est permis),
    les frais de FedaPay ajoutés (le taux le plus haut des deux, puisqu'elle
    choisit sur la page de FedaPay après que le montant est écrit), le total.
    `deja_reglee` : rien à régler ; `montant` : au-delà du plafond. */
export function compteDuLien(o: { resteXof: number; merciXof: unknown; merciPermis: boolean; reglages: ReglagesMndPay | undefined }):
  { ok: true; montantXof: number; pourboireXof: number; fraisXof: number; totalXof: number } | { ok: false; raison: 'deja_reglee' | 'montant' } {
  const reste = entier(o.resteXof);
  if (reste < 1) return { ok: false, raison: 'deja_reglee' };
  const c = compteDeLaDemande({ montantXof: reste, pourboireXof: merciDuLien(o.merciXof, o.merciPermis), moyen: MOYEN_DU_LIEN_REGLER, reglages: o.reglages });
  if (c.totalXof > PLAFOND_DU_LIEN_XOF) return { ok: false, raison: 'montant' };
  return { ok: true, montantXof: c.montantXof, pourboireXof: c.pourboireXof, fraisXof: c.fraisXof, totalXof: c.totalXof };
}

/** Une adresse de la machine même (le développement) : jamais un autre site. */
const boucleLocale = (u: URL): boolean => (u.protocol === 'http:' || u.protocol === 'https:') && (u.hostname === 'localhost' || u.hostname === '127.0.0.1');

/** OÙ FEDAPAY LA RAMÈNE. Aucun domaine écrit ici : l'adresse se déduit de la
    page de retour que la Maison a déjà donnée à FedaPay (`MND_PAY_RETOUR`,
    paye.html du Trône), dont regler.html est la voisine. La page peut dire la
    sienne : elle n'est prise que si elle vit sur le MÊME site (ou sur la
    machine même, en développement) et se nomme regler.html. Le serveur écrit
    lui-même la suite (`r` : le jeton, `fp` : la demande) : rien d'autre ne
    voyage. Rend null quand la page de la Maison ne se lit pas. */
export function retourDuLien(o: { pageDeRetourDeLaMaison: string; pageDemandee?: unknown; jeton: string; demandeId: string }): string | null {
  let maison: URL;
  try { maison = new URL(String(o.pageDeRetourDeLaMaison ?? '').trim()); } catch { return null; }
  if (maison.protocol !== 'https:' && !boucleLocale(maison)) return null;
  let page = new URL('regler.html', maison);
  if (typeof o.pageDemandee === 'string' && o.pageDemandee.trim()) {
    try {
      const p = new URL(o.pageDemandee.trim());
      if ((p.origin === maison.origin || boucleLocale(p)) && /\/regler\.html$/.test(p.pathname)) page = new URL(`${p.origin}${p.pathname}`);
    } catch { /* une adresse illisible ne change rien */ }
  }
  /* Ni la requête ni l'ancre d'aucune des deux ne survivent : la suite est celle du serveur. */
  page.searchParams.set('r', o.jeton);
  page.searchParams.set('fp', o.demandeId);
  return page.toString();
}

/** Une demande du registre, telle que le serveur la lit. */
export type DemandeDuLien = {
  id: string; branchId?: string; genre?: string; moyen?: string; statut?: string;
  montantXof?: number; pourboireXof?: number; fraisXof?: number; totalXof?: number;
  pieceId?: string; pieceNumero?: string; clientId?: string; rdvId?: string;
  fedapayId?: number; reference?: string; url?: string; modeReel?: string;
  creeLe?: string; payeeLe?: string; poseLe?: string; aRapprocher?: string; raison?: string;
};

/** LA DEMANDE ÉCRITE AU REGISTRE AVANT L'APPEL À FEDAPAY : tout vient du
    serveur (le rendez-vous et la pièce relus, le compte), rien de la page. */
export function demandeDuLien(o: {
  id: string; branchId: string; rdvId: string;
  piece: { id: string; number?: string; clientId?: string };
  compte: { montantXof: number; pourboireXof: number; fraisXof: number; totalXof: number };
  creeLe: string;
}): DemandeDuLien & Record<string, unknown> {
  return {
    id: o.id, branchId: o.branchId, genre: GENRE_DU_LIEN_REGLER, moyen: MOYEN_DU_LIEN_REGLER,
    montantXof: o.compte.montantXof, fraisXof: o.compte.fraisXof, totalXof: o.compte.totalXof,
    ...(o.compte.pourboireXof > 0 ? { pourboireXof: o.compte.pourboireXof } : {}),
    pieceId: o.piece.id, ...(o.piece.number ? { pieceNumero: String(o.piece.number).slice(0, 40) } : {}),
    ...(o.piece.clientId ? { clientId: String(o.piece.clientId).slice(0, 80) } : {}),
    rdvId: o.rdvId, libelle: LIBELLE_DU_LIEN_REGLER, statut: 'en_attente', creeLe: o.creeLe, creePar: DEMANDEE_PAR_LE_LIEN,
  };
}

/** LA DEMANDE À REPRENDRE : du même rendez-vous, encore en attente, partie
    chez FedaPay (sa page existe), au MÊME total, de moins d'une demi-heure. */
export function demandeAReprendre(lignes: readonly DemandeDuLien[], rdvId: string, totalXof: number, maintenantMs: number): DemandeDuLien | null {
  const bonnes = lignes.filter((d) => d.genre === GENRE_DU_LIEN_REGLER && d.rdvId === rdvId && d.statut === 'en_attente'
    && !!d.fedapayId && !!d.url && entier(d.totalXof) === entier(totalXof)
    && maintenantMs - (Date.parse(String(d.creeLe ?? '')) || 0) < REPRISE_DU_LIEN_MS);
  return [...bonnes].sort((a, b) => String(b.creeLe ?? '').localeCompare(String(a.creeLe ?? '')))[0] ?? null;
}

/** Les demandes du même rendez-vous qu'une neuve remplace (un autre merci,
    un reste qui a changé) : encore en attente. Si l'une est payée quand
    même, FedaPay le dira, et l'argent ne se perd pas. */
export const demandesRemplacees = (lignes: readonly DemandeDuLien[], rdvId: string): DemandeDuLien[] =>
  lignes.filter((d) => d.genre === GENRE_DU_LIEN_REGLER && d.rdvId === rdvId && d.statut === 'en_attente');

/** CE QUE LA PAGE VOIT D'UNE DEMANDE, et rien d'autre : son état, ce qui
    règle la séance (le reste et le merci), le total payé, l'honneur. Ni
    l'identifiant de FedaPay, ni sa référence, ni la pièce, ni un numéro. */
export function statutDuLienPourLaPage(d: DemandeDuLien, honore = false): {
  etat: 'attente' | 'payee' | 'refusee' | 'expiree' | 'annulee'; regleXof: number; totalXof: number; honore?: true;
} {
  const etat = d.statut === 'payee' ? 'payee' : d.statut === 'refusee' ? 'refusee' : d.statut === 'expiree' ? 'expiree' : d.statut === 'annulee' ? 'annulee' : 'attente';
  return {
    etat, regleXof: entier(d.montantXof) + entier(d.pourboireXof), totalXof: entier(d.totalXof),
    ...(etat === 'payee' && honore ? { honore: true as const } : {}),
  };
}

/** LE PARTAGE QUAND FEDAPAY CONFIRME : la pièce relue doit encore AU MOINS
    le reste demandé ; le versement est ce reste, le merci celui qu'elle a
    choisi. Réglée entre-temps, ou un reste qui a baissé : à rapprocher.
    On ne devine jamais un merci. */
export function partageDuLien(d: DemandeDuLien, resteActuelXof: number):
  { ok: true; versementXof: number; pourboireXof: number } | { ok: false; raison: 'deja_reglee' | 'reste_change' } {
  const actuel = entier(resteActuelXof);
  const demande = entier(d.montantXof);
  if (actuel <= 0) return { ok: false, raison: 'deja_reglee' };
  if (demande <= 0 || actuel < demande) return { ok: false, raison: 'reste_change' };
  return { ok: true, versementXof: demande, pourboireXof: Math.max(0, entier(d.pourboireXof)) };
}

/** Le jour et l'heure de Cotonou (UTC+1, sans heure d'été) d'un instant. */
export function quandACotonou(ms: number): { date: string; time: string } {
  const iso = new Date(ms + 3_600_000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** LE VERSEMENT POSÉ SUR LA PIÈCE ET LE RENDEZ-VOUS : l'identifiant de la
    demande (celui que le Trône inscrirait : deux écritures n'en font qu'une),
    le moyen qu'elle a vraiment pris, la caisse FedaPay. */
export function versementDuLien(d: DemandeDuLien, quandMs: number): VersementLu {
  const q = quandACotonou(quandMs);
  const frais = entier(d.fraisXof);
  return {
    id: d.id, date: q.date, time: q.time, amountXof: entier(d.montantXof),
    method: moyenDeLaPiece({ moyen: (d.moyen ?? MOYEN_DU_LIEN_REGLER) as 'au_choix', modeReel: d.modeReel }),
    cashbox: CAISSE_FEDAPAY_DU_LIEN,
    note: `FedaPay${d.reference ? ` · réf. ${d.reference}` : ''} · réglé par son lien Régler${frais > 0 ? ` · frais ${frais} F payés par la cliente` : ''}`,
  };
}

/** LA TRACE DU RÈGLEMENT sur la pièce : la forme d'un règlement en ligne. */
export function traceDuLien(d: DemandeDuLien, v: VersementLu, quandMs: number, pourboireXof: number): ReglementEnLigne {
  return {
    id: v.id, transactionId: d.fedapayId ? String(d.fedapayId) : d.id, payeLe: new Date(quandMs).toISOString(),
    montantXof: v.amountXof, pourboireXof: Math.max(0, entier(pourboireXof)), fraisXof: entier(d.fraisXof), moyen: CAISSE_FEDAPAY_DU_LIEN,
  };
}

/** LA PIÈCE APRÈS LE RÈGLEMENT : le versement, le statut qui suit l'argent,
    le merci à part (tipXof), la trace. La forme de `pieceReglee`
    (regler-la-seance-pur.ts), la caisse FedaPay en plus. */
export function pieceRegleeParLeLien(p: PieceLue, v: VersementLu, pourboireXof: number, trace: ReglementEnLigne): PieceLue {
  const payments = [...(p.payments ?? []), v];
  const suivante: PieceLue = { ...p, payments };
  const solde = resteDeLaPiece(suivante) <= 0;
  return {
    ...suivante,
    status: solde ? 'payée' : p.status,
    payment: p.payment ?? CAISSE_FEDAPAY_DU_LIEN,
    cashbox: p.cashbox ?? CAISSE_FEDAPAY_DU_LIEN,
    time: p.time ?? v.time,
    ...(pourboireXof > 0 ? { tipXof: entier(p.tipXof) + entier(pourboireXof) } : {}),
    reglementsEnLigne: [...(p.reglementsEnLigne ?? []).filter((r) => r.id !== trace.id), trace],
  };
}

/** LE RENDEZ-VOUS SUIT SA PIÈCE : le même versement (`rdvRegle`), puis
    l'honneur si elle avait déclaré avoir terminé et que tout est réglé. */
export function rdvApresLeLien(avant: RdvLu, v: VersementLu, pieceId: string, resteApresXof: number, maintenantMs: number): RdvLu {
  const regle = rdvRegle(avant, v, pieceId);
  const honneur = honneurAuReglement({ rdv: regle as unknown as Parameters<typeof honneurAuReglement>[0]['rdv'], resteXof: resteApresXof, maintenantMs });
  return honneur ? ({ ...regle, status: 'honoré', honoreAuReglement: honneur } as RdvLu) : regle;
}

/** La caisse FedaPay de la branche, si le Trône ne l'a pas encore posée : la
    même que la sienne (même identifiant, aucun doublon). */
export const caisseFedaPayNeuve = (branchId: string) => ({
  id: `cb-mndpay-${branchId}`, branchId, name: CAISSE_FEDAPAY_DU_LIEN, sub: 'Avant le reversement', glyph: '◈', openingXof: 0,
});
/** Une caisse de la branche est-elle déjà la caisse FedaPay ? */
export const estDejaLaCaisseFedaPay = (nom: unknown): boolean => nom === CAISSE_FEDAPAY_DU_LIEN || nom === ANCIEN_NOM_MND_PAY;
/* ⟨/regler-par-fedapay⟩ */

// ── DEBUT poseLeReglementDuLien (même texte dans mnd-pay et mnd-pay-webhook)
/** Le rendez-vous suit sa pièce, relu à l'instant et écrit sous condition (le
    Trône écrit les mêmes lignes). Rend vrai quand il porte l'honneur du
    règlement (posé ici ou déjà là) : la page dit alors « vous pouvez partir ». */
async function suisLeRdvDuLien(admin: any, rdvId: string, v: VersementLu, pieceId: string, resteApresXof: number, quandMs: number): Promise<boolean> {
  for (let essai = 0; essai < 3; essai++) {
    const { data: l, error } = await admin.from('appointments').select('id, data, updated_at').eq('id', rdvId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!l) return false;
    const avant: RdvLu = { ...(l.data ?? {}), id: l.id };
    const apres = rdvApresLeLien(avant, v, pieceId, resteApresXof, quandMs);
    const honore = !!(apres as { honoreAuReglement?: { le?: string } }).honoreAuReglement?.le;
    if (apres === avant) return honore;
    let q = admin.from('appointments').update({ data: apres }).eq('id', rdvId);
    if (l.updated_at) q = q.eq('updated_at', l.updated_at);
    const { data: ecrites, error: refus } = await q.select('id');
    if (refus) throw new Error(refus.message);
    if ((ecrites ?? []).length) return honore;
  }
  return false;
}

/** La caisse FedaPay de la branche, née ici si le Trône ne l'a pas encore posée (même identifiant que la sienne). */
async function laCaisseFedaPayDuLien(admin: any, branchId: string): Promise<void> {
  if (!branchId) return;
  const { data: caisses } = await admin.from('cashboxes').select('id, data').eq('branch_id', branchId).limit(200);
  if (!Array.isArray(caisses) || caisses.some((c: any) => estDejaLaCaisseFedaPay(c?.data?.name))) return;
  const c = caisseFedaPayNeuve(branchId);
  const { error } = await admin.from('cashboxes').insert({ id: c.id, branch_id: branchId, data: c });
  if (error && !/duplicate|unique|23505/i.test(`${error.code ?? ''} ${error.message ?? ''}`)) throw new Error(error.message);
}

/** Une marque sur la demande (`poseLe`, `aRapprocher`), sur la ligne relue. */
async function marqueLaDemandeDuLien(admin: any, id: string, patch: Record<string, unknown>): Promise<void> {
  const { data: l } = await admin.from('mnd_pay').select('id, data').eq('id', id).maybeSingle();
  if (!l) return;
  const { error } = await admin.from('mnd_pay').update({ data: { ...(l.data ?? {}), ...patch } }).eq('id', id);
  if (error) throw new Error(error.message);
}

/** LA SÉANCE RÉGLÉE PAR FEDAPAY, SANS TRÔNE OUVERT. Une demande de la page
    Régler, PAYÉE (le statut ne vient que de FedaPay, relu) : le versement se
    pose sur SA pièce, relue à l'instant et écrite sous condition, puis sur son
    rendez-vous (et l'honneur, si elle avait terminé elle-même), la caisse
    FedaPay naît s'il le faut, et la demande porte `poseLe`. Réglée
    entre-temps, reste qui a baissé, pièce disparue : `aRapprocher`, l'argent
    reste au registre. Rejouée, elle ne double rien : le versement porte
    l'identifiant de la demande. UNE PIÈCE DE CONTRAT ne s'écrit jamais ici
    (« le contrat fait foi, la pièce suit ») : `verse_sur_l_abonnement`,
    appelé avant, l'a déjà portée ; sinon, elle est à rapprocher. */
async function poseLeReglementDuLien(admin: any, ligne: { id: string; data: any }): Promise<{ pose: boolean; honore: boolean; raison?: string }> {
  const d: DemandeDuLien = { ...(ligne.data ?? {}), id: String(ligne.data?.id ?? ligne.id) };
  if (d.genre !== GENRE_DU_LIEN_REGLER || d.statut !== 'payee' || !d.pieceId || !d.rdvId) return { pose: false, honore: false };
  if (d.aRapprocher) return { pose: false, honore: false, raison: String(d.aRapprocher) };
  if (d.poseLe) {
    const { data: r } = await admin.from('appointments').select('id, data').eq('id', d.rdvId).maybeSingle();
    return { pose: true, honore: !!r?.data?.honoreAuReglement?.le && r?.data?.status === 'honoré' };
  }
  const t = instantDe(d.payeeLe);
  const quandMs = Number.isFinite(t) ? t : Date.now();
  for (let essai = 0; essai < 3; essai++) {
    const { data: lp, error } = await admin.from('invoices').select('id, branch_id, data, updated_at').eq('id', d.pieceId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!lp || lp.data?.status === 'annulée') {
      await marqueLaDemandeDuLien(admin, ligne.id, { aRapprocher: 'piece_introuvable' });
      return { pose: false, honore: false, raison: 'piece_introuvable' };
    }
    const piece: PieceLue = { ...(lp.data ?? {}), id: lp.id };
    const deja = (piece.payments ?? []).find((x) => x?.id === d.id);
    if (deja) {
      /* UN REJEU : l'argent est sur la pièce ; le rendez-vous le suit s'il ne l'a pas encore. */
      const honore = await suisLeRdvDuLien(admin, d.rdvId, deja, piece.id, resteDeLaPiece(piece), quandMs);
      await marqueLaDemandeDuLien(admin, ligne.id, { poseLe: new Date().toISOString() });
      return { pose: true, honore };
    }
    if (await leContratDeLaDemande(admin, undefined, d.pieceId)) {
      await marqueLaDemandeDuLien(admin, ligne.id, { aRapprocher: 'contrat' });
      return { pose: false, honore: false, raison: 'contrat' };
    }
    const partage = partageDuLien(d, resteDeLaPiece(piece));
    if (!partage.ok) {
      await marqueLaDemandeDuLien(admin, ligne.id, { aRapprocher: partage.raison });
      return { pose: false, honore: false, raison: partage.raison };
    }
    const v = versementDuLien(d, quandMs);
    const neuve = pieceRegleeParLeLien(piece, v, partage.pourboireXof, traceDuLien(d, v, quandMs, partage.pourboireXof));
    let q = admin.from('invoices').update({ data: neuve }).eq('id', piece.id);
    if (lp.updated_at) q = q.eq('updated_at', lp.updated_at);
    const { data: ecrites, error: refus } = await q.select('id');
    if (refus) throw new Error(refus.message);
    /* La pièce a bougé entre la lecture et l'écriture : on relit, on rejuge. */
    if (!(ecrites ?? []).length) continue;
    const honore = await suisLeRdvDuLien(admin, d.rdvId, v, piece.id, resteDeLaPiece(neuve), quandMs);
    await laCaisseFedaPayDuLien(admin, String(lp.branch_id ?? d.branchId ?? ''));
    await marqueLaDemandeDuLien(admin, ligne.id, { poseLe: new Date().toISOString() });
    console.log('[fedapay] lien Régler posé', { demande: d.id.slice(0, 8), versementXof: partage.versementXof, pourboireXof: partage.pourboireXof });
    return { pose: true, honore };
  }
  return { pose: false, honore: false, raison: 'ecriture' };
}
// ── FIN poseLeReglementDuLien

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return json({ version: VERSION, base: BASE, secrets: { fedapay: SECRET !== '', webhook: SECRET_WEBHOOK !== '' } });
  }
  if (req.method !== 'POST') return json({ erreur: 'POST seulement' }, 405);
  if (!SECRET || !SECRET_WEBHOOK) return json({ erreur: 'secrets absents', version: VERSION }, 500);

  const brut = await req.text();
  const entete = req.headers.get('x-fedapay-signature') ?? '';
  if (!(await signatureValide(entete, brut, SECRET_WEBHOOK, Math.floor(Date.now() / 1000)))) {
    return json({ erreur: 'signature refusée', version: VERSION }, 401);
  }

  let evenement: any = null;
  try { evenement = JSON.parse(brut); } catch { return json({ erreur: 'corps illisible' }, 400); }
  const entite = evenement?.entity ?? evenement?.data ?? {};
  const fedapayId = Number(entite?.id ?? evenement?.object_id);
  /* Un événement qui ne parle pas d'une transaction (un client créé, un
     versement…) se salue et s'oublie : FedaPay ne doit pas le rejouer. */
  if (!Number.isFinite(fedapayId) || fedapayId <= 0 || (entite?.klass && !String(entite.klass).includes('transaction'))) {
    return json({ ok: true, ignore: evenement?.name ?? 'sans transaction', version: VERSION });
  }

  const urlBase = Deno.env.get('SUPABASE_URL') ?? '';
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const admin = createClient(urlBase, service, { auth: { persistSession: false } });

  const { data: ligne } = await admin.from('mnd_pay').select('id, data').eq('data->>fedapayId', String(fedapayId)).maybeSingle();

  // ② LA VÉRITÉ VIENT DE FEDAPAY, pas du corps reçu.
  const rep = await fetch(`${BASE}/transactions/${fedapayId}`, {
    headers: { authorization: `Bearer ${SECRET}`, accept: 'application/json' },
  });
  if (!rep.ok) return json({ erreur: `FedaPay ${rep.status}`, version: VERSION }, 502);
  const tx = laTransaction(await rep.json());

  /* Une transaction que MND PAY n'a pas créée : Tap & Go (ou une page de
     paiement faite à la main chez FedaPay). Elle se range, elle ne se perd
     plus. */
  if (!ligne) {
    try {
      const range = await rangeLeTapGo(admin, tx);
      /* L'attente réglée au montant peut être celle d'un contrat (20 octobre 2026). */
      let contrat: string | undefined;
      if (range.startsWith('rattachée à ')) {
        const { data: reglee } = await admin.from('mnd_pay').select('id, data').eq('id', range.slice('rattachée à '.length)).maybeSingle();
        if (reglee) contrat = await verseSurLeContratDeLaDemande(admin, { ...(reglee.data ?? {}), id: reglee.id });
      }
      return json({ ok: true, inconnue: fedapayId, range, ...(contrat ? { contrat } : {}), version: VERSION });
    } catch (e) {
      return json({ erreur: e instanceof Error ? e.message : String(e), version: VERSION }, 500);
    }
  }

  const d = ligne.data ?? {};
  /* DÉJÀ PAYÉE : un rejeu de FedaPay reprend l'inscription au contrat si elle
     avait échoué ; elle est idempotente (20 octobre 2026). */
  if (d.statut === 'payee') {
    try {
      const contrat = await verseSurLeContratDeLaDemande(admin, { ...d, id: d.id ?? ligne.id });
      const lien = d.genre === GENRE_DU_LIEN_REGLER ? await poseLeReglementDuLien(admin, { id: ligne.id, data: d }) : null;
      return json({ ok: true, deja: 'payee', contrat, ...(lien ? { pose: lien.pose, ...(lien.raison ? { raison: lien.raison } : {}) } : {}), version: VERSION });
    } catch (e) {
      return json({ erreur: e instanceof Error ? e.message : String(e), version: VERSION }, 500);
    }
  }
  let statut = statutDepuisFedaPay(tx?.status);
  let raison: string | undefined;
  const recu = Math.round(Number(tx?.amount ?? 0));
  if (statut === 'payee' && recu + 1 < Math.round(Number(d.totalXof ?? 0))) {
    statut = 'refusee';
    raison = `montant reçu ${recu} F, attendu ${d.totalXof} F : à voir avec FedaPay`;
  }
  if (statut === d.statut && !raison) return json({ ok: true, inchange: statut, version: VERSION });
  const suite = {
    ...d,
    statut,
    ...(tx?.mode ? { modeReel: String(tx.mode) } : {}),
    ...(Number.isFinite(Number(tx?.fees)) && Number(tx?.fees) > 0 ? { commissionXof: Math.round(Number(tx.fees)) } : {}),
    ...(statut === 'payee' ? { payeeLe: String(tx?.approved_at ?? new Date().toISOString()) } : {}),
    ...(raison ? { raison } : statut === 'refusee' && tx?.last_error_code ? { raison: String(tx.last_error_code) } : {}),
  };
  const { error } = await admin.from('mnd_pay').update({ data: suite }).eq('id', ligne.id);
  if (error) return json({ erreur: error.message, version: VERSION }, 500);
  /* PAYÉE, ELLE RÈGLE SON CONTRAT. Un échec rend 500 : FedaPay rejoue, et le
     rejeu passe par « déjà payée » ci-dessus. */
  if (statut === 'payee') {
    try {
      const contrat = await verseSurLeContratDeLaDemande(admin, { ...suite, id: suite.id ?? ligne.id });
      /* LA PAGE RÉGLER : la séance se règle ici, Trône fermé ou non. */
      const lien = suite.genre === GENRE_DU_LIEN_REGLER ? await poseLeReglementDuLien(admin, { id: ligne.id, data: suite }) : null;
      return json({ ok: true, statut, contrat, ...(lien ? { pose: lien.pose, ...(lien.raison ? { raison: lien.raison } : {}) } : {}), version: VERSION });
    } catch (e) {
      return json({ erreur: e instanceof Error ? e.message : String(e), version: VERSION }, 500);
    }
  }
  return json({ ok: true, statut, version: VERSION });
});
