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

   SECRETS : FEDAPAY_SECRET_KEY, FEDAPAY_ENV (comme `mnd-pay`), et
   FEDAPAY_WEBHOOK_SECRET (FedaPay › Développeurs › Webhooks › le point
   d'arrivée › « Cliquez pour révéler »).
   ═══════════════════════════════════════════════════════════════════ */

const VERSION = '2026-10-16-a';

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
  /* Une transaction que MND PAY n'a pas créée (une page de paiement faite à
     la main chez FedaPay, par exemple) : rien à poser ici. */
  if (!ligne) return json({ ok: true, inconnue: fedapayId, version: VERSION });

  // ② LA VÉRITÉ VIENT DE FEDAPAY, pas du corps reçu.
  const rep = await fetch(`${BASE}/transactions/${fedapayId}`, {
    headers: { authorization: `Bearer ${SECRET}`, accept: 'application/json' },
  });
  if (!rep.ok) return json({ erreur: `FedaPay ${rep.status}`, version: VERSION }, 502);
  const tx = laTransaction(await rep.json());

  const d = ligne.data ?? {};
  if (d.statut === 'payee') return json({ ok: true, deja: 'payee', version: VERSION });
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
  return json({ ok: true, statut, version: VERSION });
});
