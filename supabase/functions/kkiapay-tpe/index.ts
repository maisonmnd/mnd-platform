// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ══ kkiapay-tpe — LA RÉFÉRENCE DU TPE, VÉRIFIÉE — 22 novembre 2026 ══════
   « Il faut un meilleur moyen pour valider un paiement sur la TPE de KkiaPay.
   On ne peut pas saisir un numéro de ticket et 4 derniers chiffres » puis
   « les deux voies » (Yéman).

   Au comptoir, la cliente pose sa carte sur le TPE KkiaPay. L'encaissement
   du Trône tape la référence de la transaction ; cette fonction la DEMANDE À
   KKIAPAY (statut, montant pour la Maison, frais) et l'inscrit au registre
   `payments`, sans cible, comme `kkiapay-webhook` le fait quand KkiaPay
   l'appelle. Rien d'autre n'est écrit : la pièce et son versement restent
   au Trône, qui garde la référence dans la trace du versement.

   LA PORTE : la session du personnel (`is_staff`, la session de la personne
   connectée), jamais la cliente. Le corps ne fait foi de rien : le montant
   vient de KkiaPay.

   UNE RÉFÉRENCE DÉJÀ INSCRITE AVEC UNE CIBLE (un acompte en ligne, une carte
   cadeau…) ne se rend pas comme un paiement du TPE : elle est déjà comptée
   ailleurs (`deja-en-ligne`).

   Secrets (déjà posés pour kkiapay-verify) : KKIAPAY_PUBLIC_KEY,
   KKIAPAY_PRIVATE_KEY, KKIAPAY_SECRET_KEY, KKIAPAY_API_BASE (bac à sable),
   SUPABASE_URL, SUPABASE_ANON_KEY, CLE_SERVICE (ou SERVICE_KEY).

   Déploiement : `node scripts/mise-en-ligne.mjs fonction kkiapay-tpe
   --commit <sha> --jwt oui`. Vérifier : GET rend sa version. */

const VERSION = '2026-11-22-a · la référence du TPE KkiaPay demandée à KkiaPay et inscrite au registre, pour le personnel';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'content-type': 'application/json' } });

const KKIA_BASE = Deno.env.get('KKIAPAY_API_BASE') ?? 'https://api.kkiapay.me';
const KKIA_VERIFY_PATH = '/api/v1/transactions/status';

type KkiaTransaction = { status?: string; amount?: number; fees?: number; source?: string; failureMessage?: string };

/** KkiaPay, par la même route que kkiapay-verify et kkiapay-webhook. Rend
    null quand KkiaPay ne connaît pas la référence (4xx), lance quand il ne
    répond pas (réseau, 5xx). */
async function demandeAKkiapay(transactionId: string): Promise<KkiaTransaction | null> {
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
  if (res.status >= 400 && res.status < 500) return null;
  if (!res.ok) throw new Error(`upstream_${res.status}`);
  return (await res.json()) as KkiaTransaction;
}

const refPropre = (s: unknown): string => String(s ?? '').replace(/\s+/g, '').trim();
const refPlausible = (s: string): boolean => /^[A-Za-z0-9_-]{6,64}$/.test(s);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const ANON = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
  const SERVICE = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();

  /* Le contrôle de santé : la version et ce qui est posé, en longueurs seules. */
  if (req.method === 'GET') {
    return json({
      fonction: 'kkiapay-tpe', version: VERSION,
      secrets: {
        KKIAPAY_PUBLIC_KEY: (Deno.env.get('KKIAPAY_PUBLIC_KEY') ?? '').length,
        KKIAPAY_PRIVATE_KEY: (Deno.env.get('KKIAPAY_PRIVATE_KEY') ?? '').length,
        KKIAPAY_SECRET_KEY: (Deno.env.get('KKIAPAY_SECRET_KEY') ?? '').length,
        CLE_SERVICE: SERVICE.length,
      },
    });
  }
  if (req.method !== 'POST') return json({ ok: false, raison: 'mal-formee', version: VERSION }, 405);

  /* LA PORTE : le personnel connecté. */
  const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jeton || !SUPABASE_URL || !ANON) return json({ ok: false, raison: 'refusee', version: VERSION }, 403);
  const commeAppelant = createClient(SUPABASE_URL, ANON, { global: { headers: { authorization: `Bearer ${jeton}` } }, auth: { persistSession: false } });
  const { data: estPersonnel, error: errStaff } = await commeAppelant.rpc('is_staff');
  if (errStaff || estPersonnel !== true) return json({ ok: false, raison: 'refusee', version: VERSION }, 403);

  let corps: any = {};
  try { corps = await req.json(); } catch { /* corps illisible */ }
  const ref = refPropre(corps?.reference);
  const branchId = String(corps?.branchId ?? '').trim();
  if (!refPlausible(ref)) return json({ ok: false, raison: 'mal-formee', version: VERSION }, 400);

  let tx: KkiaTransaction | null;
  try {
    tx = await demandeAKkiapay(ref);
  } catch (e) {
    console.error('kkiapay-tpe : KkiaPay ne répond pas', e instanceof Error ? e.message : String(e));
    return json({ ok: false, raison: 'injoignable', version: VERSION });
  }
  if (!tx) return json({ ok: false, raison: 'introuvable', version: VERSION });
  const statut = String(tx.status ?? '').toUpperCase();
  if (statut !== 'SUCCESS') return json({ ok: false, raison: 'pas-reussie', statut, version: VERSION });

  const montantXof = Math.round(Number(tx.amount ?? 0));
  const fraisXof = Math.max(0, Math.round(Number(tx.fees ?? 0)));
  const source = tx.source ? String(tx.source) : undefined;

  /* LE REGISTRE : la transaction entre une fois (sa clé est sa référence). Déjà
     là avec une cible : un paiement en ligne, compté ailleurs. */
  if (SERVICE) {
    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false } });
    const { data: deja } = await admin.from('payments').select('data').eq('id', ref).maybeSingle();
    if (deja && String(deja.data?.partnerId ?? '').trim()) return json({ ok: false, raison: 'deja-en-ligne', version: VERSION });
    if (!deja) {
      const { error } = await admin.from('payments').insert({
        id: ref,
        branch_id: branchId || null,
        data: {
          id: ref, branchId: branchId || undefined, provider: 'kkiapay', origine: 'tpe', amountXof: montantXof, feesXof: fraisXof,
          method: source, partnerId: '', status: 'success', at: new Date().toISOString(), inscritPar: 'kkiapay-tpe',
        },
      });
      if (error && error.code !== '23505') console.error('kkiapay-tpe : registre', error.message);
    }
  }

  return json({ ok: true, ref, montantXof, fraisXof, ...(source ? { source } : {}), version: VERSION });
});
