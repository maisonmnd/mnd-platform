// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* kkiapay-webhook — le filet. La cliente peut fermer son téléphone une seconde
 * après avoir payé : `kkiapay-verify` ne serait alors jamais appelée et l'argent
 * serait arrivé sans que la Maison le sache. KkiaPay, lui, appelle cette
 * fonction (5 tentatives, intervalle croissant) jusqu'à recevoir un 2xx.
 *
 * DÉPLOIEMENT PARTICULIER — cette fonction doit être joignable SANS jeton :
 *     supabase functions deploy kkiapay-webhook --no-verify-jwt
 * (KkiaPay n'a évidemment pas de session Supabase.) Sa porte n'est donc pas le
 * jeton mais DEUX serrures :
 *   ① l'en-tête `x-kkiapay-secret` doit correspondre au hash secret du tableau
 *      de bord (comparaison à temps constant) ;
 *   ② on ne croit JAMAIS le corps du message : le montant et le statut sont
 *      redemandés à KkiaPay avec les clés privée + secrète. Un webhook forgé ne
 *      peut donc rien créditer, même si la première serrure cédait.
 *
 * Secrets : KKIAPAY_WEBHOOK_SECRET, KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY,
 * KKIAPAY_SECRET_KEY, SERVICE_KEY. KKIAPAY_API_BASE pour le bac à sable.
 *
 * Le corps de `applyPayment` est le JUMEAU de celui de kkiapay-verify : chaque
 * fonction Edge se déploie seule (fichier collé tel quel), on assume la copie
 * plutôt qu'un module partagé qu'on oublierait de redéployer. Toute correction
 * ici doit être reportée là-bas.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
/* Route et en-têtes VÉRIFIÉS contre l'API le 28-07-2026 (non publiés par la
   documentation) : POST /api/v1/transactions/status, triplet
   x-api-key / x-private-key / x-secret-key. Bac à sable et production ont deux
   adresses distinctes — d'où KKIAPAY_API_BASE. */
const KKIA_BASE = Deno.env.get('KKIAPAY_API_BASE') ?? 'https://api.kkiapay.me';
const KKIA_VERIFY_PATH = '/api/v1/transactions/status';

/** Comparaison à temps constant — une comparaison naïve fuit le secret, octet
    par octet, par le temps de réponse. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type KkiaTransaction = { status?: string; amount?: number; fees?: number; source?: string; failureMessage?: string };

async function fetchTransaction(transactionId: string): Promise<KkiaTransaction> {
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
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  return (await res.json()) as KkiaTransaction;
}

async function applyPayment(admin: any, opts: {
  transactionId: string; tx: KkiaTransaction; partnerId: string; branchId: string; clientId?: string;
}): Promise<void> {
  const amount = Math.round(Number(opts.tx.amount ?? 0));
  const fees = Math.round(Number(opts.tx.fees ?? 0));
  const at = new Date().toISOString();

  const { error: insErr } = await admin.from('payments').insert({
    id: opts.transactionId,
    branch_id: opts.branchId,
    data: {
      id: opts.transactionId,
      branchId: opts.branchId,
      provider: 'kkiapay',
      amountXof: amount,
      feesXof: fees,
      method: opts.tx.source ?? undefined,
      partnerId: opts.partnerId,
      clientId: opts.clientId,
      status: 'success',
      at,
    },
  });
  if (insErr) {
    if (insErr.code === '23505') return; // déjà encaissé — rejeu normal
    throw new Error(insErr.message);
  }

  if (opts.partnerId) {
    const { data: appt } = await admin.from('appointments').select('id, data').eq('id', opts.partnerId).maybeSingle();
    if (appt) {
      const next = { ...(appt.data ?? {}), depositXof: amount, depositConfirmed: true };
      await admin.from('appointments').update({ data: next }).eq('id', opts.partnerId);
    }
  }

  if (fees > 0) {
    await admin.from('expenses').insert({
      id: `exp-kkia-${opts.transactionId}`,
      branch_id: opts.branchId,
      data: {
        id: `exp-kkia-${opts.transactionId}`,
        branchId: opts.branchId,
        label: `Commission KkiaPay · ${opts.transactionId}`,
        amountXof: fees,
        date: at.slice(0, 10),
        cashbox: 'KkiaPay',
        category: 'Frais bancaires',
        subcategory: 'Commissions Mobile Money',
      },
    });
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 });

  // ① Serrure du secret. Réponse 200 quand même : un 4xx ferait retenter
  //    KkiaPay cinq fois pour rien, et renseignerait un attaquant sur sa cible.
  const secret = Deno.env.get('KKIAPAY_WEBHOOK_SECRET') ?? '';
  const sent = req.headers.get('x-kkiapay-secret') ?? '';
  if (!secret || !safeEqual(sent, secret)) {
    console.error('kkiapay-webhook: signature refusée');
    return new Response('ok', { status: 200 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* corps illisible */ }

  const transactionId = String(body?.transactionId ?? '');
  if (!transactionId) return new Response('ok', { status: 200 });

  // Un échec n'a rien à créditer — on accuse réception et on s'arrête.
  if (body?.isPaymentSucces === false || String(body?.event ?? '').includes('failed')) {
    console.log(`kkiapay-webhook: ${transactionId} échoué (${body?.failureMessage ?? '—'})`);
    return new Response('ok', { status: 200 });
  }

  try {
    // ② On ne croit pas le corps : on redemande à KkiaPay.
    const tx = await fetchTransaction(transactionId);
    if ((tx.status ?? '').toUpperCase() !== 'SUCCESS') return new Response('ok', { status: 200 });

    // Notre référence voyage dans `data` à l'ouverture du widget et revient
    // dans `stateData` ; `partnerId` en est le doublon de secours.
    let state: any = body?.stateData ?? {};
    if (typeof state === 'string') { try { state = JSON.parse(state); } catch { state = {}; } }
    const partnerId = String(state?.partnerId ?? body?.partnerId ?? '');
    let branchId = String(state?.branchId ?? '');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // Branche inconnue (webhook plus ancien que l'app) : on la retrouve par le
    // rendez-vous, pour que le paiement tombe dans la bonne maison.
    if (!branchId && partnerId) {
      const { data: appt } = await admin.from('appointments').select('branch_id').eq('id', partnerId).maybeSingle();
      branchId = String(appt?.branch_id ?? '');
    }

    await applyPayment(admin, { transactionId, tx, partnerId, branchId, clientId: state?.clientId });
    return new Response('ok', { status: 200 });
  } catch (e) {
    // Panne passagère (base ou KkiaPay) : on rend un 5xx EXPRÈS pour que
    // KkiaPay retente — l'insertion est idempotente, un rejeu ne coûte rien.
    console.error('kkiapay-webhook:', e instanceof Error ? e.message : String(e));
    return new Response('retry', { status: 500 });
  }
});
