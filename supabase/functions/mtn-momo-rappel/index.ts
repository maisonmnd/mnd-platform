// mtn-momo-rappel - le rappel de MTN : il ne fait que demander une relecture.
//
// Premiere ligne volontairement pauvre (lecon du 14 septembre 2026).

/* ═══════════════════════════════════════════════════════════════════
   MTN-MOMO-RAPPEL · 11 novembre 2026, maquette « Régler par MTN, QR »
   (AdAaYXGStQetsXHFkZzUW5).

   Les adresses déclarées chez MTN (5 novembre 2026) :
   · …/functions/v1/mtn-momo-rappel/collection
   · …/functions/v1/mtn-momo-rappel/disbursement

   UN RAPPEL N'EST PAS UNE PREUVE. N'importe qui peut écrire à cette
   adresse, et MTN y dit « SUCCESSFUL » sans signature : ce corps n'est
   JAMAIS cru. Le rappel de la collecte ne fait qu'une chose : demander à
   `collecte-mtn` (par la clé de service) de RELIRE chez MTN la demande
   qu'il nomme. Rien ne s'écrit ici, rien n'est marqué payé ici.
   La paie (disbursement) ne demande pas de rappel : `paie-mtn` relit
   elle-même ; un rappel de paie est seulement accusé.

   Verify JWT : ÉTEINT (MTN n'a pas de jeton). Réponse 200, toujours, sans
   rien de ce que la Maison sait.
   ═══════════════════════════════════════════════════════════════════ */

const VERSION = '2026-11-11-a';

const RE_REFERENCE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const SERVICE = () => env('SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');

Deno.serve(async (req) => {
  if (req.method === 'GET') return json({ fonction: 'mtn-momo-rappel', version: VERSION });
  if (req.method !== 'POST' && req.method !== 'PUT') return json({ ok: false }, 405);
  const url = new URL(req.url);
  const voie = /\/collection\/?$/.test(url.pathname) ? 'collection' : /\/disbursement\/?$/.test(url.pathname) ? 'disbursement' : '';
  const corps = await req.json().catch(() => null) as Record<string, unknown> | null;
  /* La référence : celle que MTN rappelle (referenceId), sinon l'identifiant
     externe que la Maison a donné (sa référence aussi), sinon l'en-tête. */
  const reference = [corps?.referenceId, corps?.externalId, req.headers.get('X-Reference-Id'), url.searchParams.get('ref')]
    .map((x) => String(x ?? '').trim())
    .find((x) => RE_REFERENCE.test(x))?.toLowerCase();
  console.log('[mtn-momo-rappel]', { voie: voie || 'inconnue', reference: reference ? `${reference.slice(0, 8)}…` : null, statutDit: String(corps?.status ?? '').slice(0, 20) });
  if (voie === 'collection' && reference && SERVICE()) {
    const projet = env('SUPABASE_URL').replace(/\/$/, '');
    await fetch(`${projet}/functions/v1/collecte-mtn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE(), Authorization: `Bearer ${SERVICE()}` },
      body: JSON.stringify({ source: 'rappel', reference }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
  }
  return json({ ok: true });
});
