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
   un contrat s'inscrit au contrat ET à sa pièce (`verse_sur_l_abonnement`). */
const VERSION = '2026-10-20-a';

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
  return 'MND PAY';
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
      cashbox: 'MND PAY', source: 'mnd-pay', note: `MND PAY${d.reference ? ` · réf. ${d.reference}` : ''}`,
    },
  });
  if (error) throw new Error(error.message);
  return r?.ok === false ? `refusé : ${r.raison}` : r?.dejaVerse ? 'déjà inscrit' : 'inscrit au contrat';
}
// ── FIN verseSurLeContratDeLaDemande

const laTransaction = (r: any): any => r?.['v1/transaction'] ?? r?.transaction ?? r;

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
      return json({ ok: true, deja: 'payee', contrat, version: VERSION });
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
      return json({ ok: true, statut, contrat, version: VERSION });
    } catch (e) {
      return json({ erreur: e instanceof Error ? e.message : String(e), version: VERSION }, 500);
    }
  }
  return json({ ok: true, statut, version: VERSION });
});
