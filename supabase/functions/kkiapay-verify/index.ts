// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* kkiapay-verify — le SEUL endroit qui a le droit de dire « l'acompte est reçu ».
 *
 * Appelée par Ma Couronne juste après que le widget KkiaPay a annoncé un succès.
 * Cette annonce ne prouve rien (n'importe qui peut appeler cette fonction avec
 * un identifiant inventé) : on redemande donc la vérité à KkiaPay avec les clés
 * privée + secrète, et on CONTRÔLE LE MONTANT. Sans ce contrôle, une cliente
 * paierait 100 F pour un acompte de 25 000 F.
 *
 * Effets, tous idempotents (la clé primaire de `payments` EST l'identifiant de
 * transaction — la fonction peut être rejouée, et le webhook fait la même chose
 * de son côté ; le premier arrivé écrit, le second ne double rien) :
 *   1. enregistre le paiement dans `payments` ;
 *   2. pose `depositConfirmed: true` sur le rendez-vous ;
 *   3. inscrit la commission KkiaPay en DÉPENSE de la caisse KkiaPay —
 *      décision de la Maison : le chiffre d'affaires reste BRUT (la cliente a
 *      bien payé ce montant), les frais sont une charge de la Maison.
 *
 * Secrets à poser sur la fonction : KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY,
 * KKIAPAY_SECRET_KEY, et SERVICE_KEY (clé de service Supabase, comme push-notify).
 * KKIAPAY_API_BASE bascule vers le bac à sable.
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/* ⚠ À CONFIRMER sur votre tableau de bord KkiaPay : l'URL de vérification et le
   nom des trois en-têtes. Ils sont isolés ici pour qu'un changement chez
   KkiaPay ne demande qu'une retouche d'une ligne. */
const KKIA_BASE = Deno.env.get('KKIAPAY_API_BASE') ?? 'https://api.kkiapay.me';
const KKIA_VERIFY_PATH = '/api/v1/transactions/status';

type KkiaTransaction = {
  status?: string;
  amount?: number;
  fees?: number;
  source?: string;
  performed_at?: string;
  failureMessage?: string;
};

/** Demande la vérité à KkiaPay. Lève si la transaction est introuvable. */
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
  if (!res.ok) throw new Error(res.status === 404 ? 'not_found' : `upstream_${res.status}`);
  return (await res.json()) as KkiaTransaction;
}

/** Applique un paiement vérifié. Rejouable sans effet double. */
export async function applyPayment(admin: any, opts: {
  transactionId: string;
  tx: KkiaTransaction;
  partnerId: string;
  branchId: string;
  clientId?: string;
}): Promise<void> {
  const amount = Math.round(Number(opts.tx.amount ?? 0));
  const fees = Math.round(Number(opts.tx.fees ?? 0));
  const at = new Date().toISOString();

  // 1) Le registre. La clé primaire est l'identifiant KkiaPay : `on conflict`
  //    ignoré = un paiement n'entre qu'une fois, quel que soit le nombre de
  //    rejeux (webhook réessayé 5 fois, vérification cliente en parallèle).
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
  // 23505 = déjà enregistré : c'est le cas NORMAL d'un rejeu, on s'arrête là
  // pour ne pas recréditer l'acompte ni recommissionner la Maison.
  if (insErr) {
    if (insErr.code === '23505') return;
    throw new Error(insErr.message);
  }

  // 2) L'acompte du rendez-vous — posé par le SERVEUR, jamais par la cliente.
  if (opts.partnerId) {
    const { data: appt } = await admin.from('appointments').select('id, data').eq('id', opts.partnerId).maybeSingle();
    if (appt) {
      const next = { ...(appt.data ?? {}), depositXof: amount, depositConfirmed: true };
      await admin.from('appointments').update({ data: next }).eq('id', opts.partnerId);
    }
    // Pas de rendez-vous ? Le paiement reste au registre avec son partnerId :
    // le comptoir le rapprochera. On ne perd jamais un franc reçu.
  }

  // 3) La commission, en dépense de la caisse KkiaPay (choix de la Maison :
  //    le CA reste brut, les frais sont une charge). Id dérivé de la
  //    transaction — donc lui aussi insérable une seule fois.
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { transactionId, apptId, expectedXof, branchId, clientId } = await req.json();
    if (!transactionId || !branchId) return json({ error: 'bad_request' }, 400);

    const tx = await fetchTransaction(String(transactionId));
    if ((tx.status ?? '').toUpperCase() !== 'SUCCESS') {
      return json({ error: 'failed', detail: tx.failureMessage ?? tx.status ?? '' }, 402);
    }

    // Le contrôle qui protège la Maison : on n'ouvre rien tant que le montant
    // reçu n'atteint pas l'acompte attendu (tolérance d'un franc d'arrondi).
    const paid = Math.round(Number(tx.amount ?? 0));
    const expected = Math.round(Number(expectedXof ?? 0));
    if (expected > 0 && paid + 1 < expected) {
      return json({ error: 'amount_mismatch', amountXof: paid, expectedXof: expected }, 402);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    await applyPayment(admin, {
      transactionId: String(transactionId),
      tx,
      partnerId: String(apptId ?? ''),
      branchId: String(branchId),
      clientId: clientId ? String(clientId) : undefined,
    });

    return json({ ok: true, amountXof: paid, feesXof: Math.round(Number(tx.fees ?? 0)), method: tx.source });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, msg === 'not_found' ? 404 : 500);
  }
});
