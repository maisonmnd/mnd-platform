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

    /* LE FILET COUVRE AUSSI LES ABONNEMENTS — 29 août 2026.
       Ce webhook ne connaissait que les rendez-vous. Or `AchatFormule` règle
       un ABONNEMENT et lui passe la même référence : quand le téléphone de la
       cliente se ferme avant la confirmation, ou quand la vérification échoue,
       ce filet était le dernier recours — et il laissait tomber l'abonnement.
       L'argent restait au registre, orphelin de ce qu'il réglait.

       LES DEUX N'ENTRENT JAMAIS EN CONCURRENCE : les identifiants sont de deux
       familles (`a-…` pour un rituel, `ab-…` pour un abonnement), et le
       versement ne s'inscrit que s'il n'y est pas déjà — la vérification
       cliente et ce filet peuvent donc arriver dans n'importe quel ordre. */
    if (!appt) {
      const { data: sub } = await admin.from('subscribers').select('id, data').eq('id', opts.partnerId).maybeSingle();
      if (sub) {
        const d = (sub.data ?? {}) as { payments?: { id?: string }[]; status?: string };
        const deja = Array.isArray(d.payments) ? d.payments : [];
        if (!deja.some((x: { id?: string }) => x?.id === opts.transactionId)) {
          await admin.from('subscribers').update({
            data: {
              ...d,
              payments: [...deja, {
                id: opts.transactionId,
                amountXof: amount,
                date: new Date().toISOString().slice(0, 10),
                method: opts.tx.source ?? 'KkiaPay',
              }],
              status: d.status === 'churn' ? d.status : 'active',
            },
          }).eq('id', opts.partnerId);
        }
      }
    }
  }

  /* Aucune dépense de commission : les frais KkiaPay sont à la charge de la
     CLIENTE (1,9 % Mobile Money, 4 % carte). La Maison encaisse le montant
     demandé, entier. `feesXof` n'est gardé que pour la trace. */
}

/* ══ LA CARTE CADEAU RÉGLÉE — 2 octobre 2026 ═══════════════════════════
   JUMELLE À L'IDENTIQUE dans kkiapay-verify et kkiapay-webhook (le harnais
   `verifie-cartes-cadeaux` compare les deux copies, et l'alphabet avec celui
   de `src/shared/cartes-cadeaux-pur.ts`).

   LE CODE NAÎT ICI, ET UNE SEULE FOIS. L'écriture est CONDITIONNELLE (la
   ligne n'a pas encore de code) : si la vérification et le filet arrivent
   ensemble, le second trouve la carte déjà réglée et rend LE MÊME code, au
   lieu d'en tirer un autre que l'acheteur verrait sans qu'il existe.
   L'avoir que porte la carte a un identifiant déduit d'elle : un rejeu ne
   le double pas. Le montant est celui de la COMMANDE, écrit avant le
   paiement ; les frais KkiaPay restent à l'acheteur. */
const ALPHABET_DU_CODE = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const tireUnCode = (): string => {
  const v = crypto.getRandomValues(new Uint32Array(8));
  const t = Array.from(v, (x) => ALPHABET_DU_CODE[x % ALPHABET_DU_CODE.length]).join('');
  return `MND-${t.slice(0, 4)}-${t.slice(4)}`;
};

async function regleLaCarte(admin: any, o: { carteId: string; transactionId: string }): Promise<{ code: string; valableJusquau: string } | null> {
  for (let essai = 0; essai < 6; essai++) {
    const { data: row } = await admin.from('cartes_cadeaux').select('id, branch_id, data').eq('id', o.carteId).maybeSingle();
    if (!row) return null;
    const c = (row.data ?? {}) as Record<string, any>;
    if (c.code) return { code: String(c.code), valableJusquau: String(c.valableJusquau ?? '') };
    if (c.statut !== 'a-regler') return null;
    const montant = Math.round(Number(c.montantXof ?? 0));
    if (montant <= 0) return null;
    const at = new Date().toISOString();
    const d = new Date(at);
    const valable = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 12, d.getUTCDate())).toISOString().slice(0, 10);
    const creditId = `cre-${o.carteId}`;
    const code = tireUnCode();
    const next = {
      ...c, statut: 'reglee', code, valableJusquau: valable, payeLe: at,
      transactionId: o.transactionId, cashbox: 'KkiaPay', methode: 'KkiaPay', creditId,
    };
    const { data: pose, error } = await admin.from('cartes_cadeaux')
      .update({ data: next }).eq('id', o.carteId).is('data->>code', null).select('id');
    if (error) {
      if (error.code === '23505') continue; // ce code existe déjà ailleurs : on en tire un autre
      throw new Error(error.message);
    }
    if (!pose || pose.length === 0) continue; // réglée entre-temps : on relit, on rend son code
    const { error: e2 } = await admin.from('credit_movements').insert({
      id: creditId,
      branch_id: row.branch_id,
      data: {
        id: creditId, branchId: c.branchId ?? row.branch_id, holderType: 'carte', holderId: o.carteId,
        kind: 'depot', amountXof: montant, date: at, cashbox: 'KkiaPay', method: 'KkiaPay',
        note: `Carte cadeau ${code} · pour ${c.pour || '?'}, de la part de ${c.de || '?'}`,
      },
    });
    if (e2 && e2.code !== '23505') throw new Error(e2.message);
    return { code, valableJusquau: valable };
  }
  throw new Error('carte_non_reglee');
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
      const { data: subBr } = await admin.from('subscribers').select('branch_id').eq('id', partnerId).maybeSingle();
      if (subBr?.branch_id) branchId = String(subBr.branch_id);
    }
    if (!branchId && partnerId) {
      const { data: appt } = await admin.from('appointments').select('branch_id').eq('id', partnerId).maybeSingle();
      branchId = String(appt?.branch_id ?? '');
    }

    // LE MONTANT ATTENDU VIENT DU SERVEUR — 24 août 2026 (audit), jumeau du
    // contrôle de kkiapay-verify. On lit l'acompte DEMANDÉ sur la fiche
    // (`depositXof`, posé à la réservation, avant tout paiement). Un paiement réel
    // INFÉRIEUR (100 F pour un acompte de 25 000 F) ne confirme pas l'acompte :
    // on accuse réception (200, KkiaPay cesse de retenter) sans rien créditer —
    // le comptoir rapprochera via le tableau KkiaPay.
    const paid = Math.round(Number(tx.amount ?? 0));
    /* LA CARTE CADEAU (`cc-…`) — 2 octobre 2026. Même lecture que
       kkiapay-verify : le montant de la commande déposée, jamais le corps. */
    if (partnerId.startsWith('cc-')) {
      const { data: cc } = await admin.from('cartes_cadeaux').select('branch_id, data').eq('id', partnerId).maybeSingle();
      const attendu = Math.round(Number(cc?.data?.montantXof ?? 0));
      if (!cc || attendu <= 0 || paid + 1 < attendu) {
        console.log(`kkiapay-webhook: carte ${partnerId} non reglee (${paid} pour ${attendu})`);
        return new Response('ok', { status: 200 });
      }
      if (!branchId) branchId = String(cc.branch_id ?? '');
      await applyPayment(admin, { transactionId, tx, partnerId, branchId, clientId: state?.clientId });
      await regleLaCarte(admin, { carteId: partnerId, transactionId });
      return new Response('ok', { status: 200 });
    }
    if (partnerId) {
      const { data: apptDue } = await admin
        .from('appointments').select('data').eq('id', partnerId).maybeSingle();
      let expected = Math.round(Number(apptDue?.data?.depositXof ?? 0));
      /* L'ABONNEMENT ATTEND SA PREMIÈRE ÉCHÉANCE, ou son prix entier. Même
         règle et même lecture que `kkiapay-verify` : le montant attendu se lit
         DANS ce qui est réglé, jamais dans le corps de la requête. */
      if (!apptDue) {
        const { data: subDue } = await admin
          .from('subscribers').select('data').eq('id', partnerId).maybeSingle();
        const d = (subDue?.data ?? {}) as { echeances?: { amountXof?: number }[]; priceXof?: number; mrrXof?: number };
        const premiere = Array.isArray(d.echeances) && d.echeances.length > 0
          ? Math.round(Number(d.echeances[0]?.amountXof ?? 0))
          : 0;
        expected = premiere > 0 ? premiere : Math.round(Number(d.priceXof ?? d.mrrXof ?? 0));
      }
      if (expected > 0 && paid + 1 < expected) {
        console.log(`kkiapay-webhook: ${transactionId} sous-payé (${paid} < ${expected}) — non confirmé`);
        return new Response('ok', { status: 200 });
      }
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
