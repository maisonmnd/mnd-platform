// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* ══ kkiapay-solde — LE SOLDE KKIAPAY, LU CHEZ KKIAPAY — 26 novembre 2026 ═══
   « Je veux lire mon solde KkiaPay directement sur le Trône, comme on a fait
   pour MTN MoMo » (Yéman).

   KkiaPay ne documente aucune route de solde. Son tableau de bord lit les
   trois soldes (total, opération, disponible) par `POST /merchant/me` ; on
   pose la même question avec les clés API de la Maison (les mêmes que
   `kkiapay-tpe` : KKIAPAY_PUBLIC_KEY, KKIAPAY_PRIVATE_KEY, KKIAPAY_SECRET_KEY),
   jamais avec un mot de passe. Si KkiaPay refuse ces clés, la fonction le dit
   en clair ; elle ne tente rien d'autre.

   LA DIRECTION SEULE (sa session, `est_direction`, ou la clé de service pour
   l'essai de la mise en ligne). Verify JWT éteint : la porte se juge ici.
   Elle ne LIT que : aucune écriture, ni chez KkiaPay ni dans la base.
   La réponse de KkiaPay ne se garde pas et ne s'écrit pas au journal : seuls
   le code HTTP et, si rien ne s'y lit, le NOM de ses champs. */

const VERSION = '2026-11-26-a · le solde KkiaPay, lu chez KkiaPay (merchant/me), direction seule';

const SUPABASE_URL = (Deno.env.get('SUPABASE_URL') ?? '').trim();
const ANON = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
const KKIA_BASE = Deno.env.get('KKIAPAY_API_BASE') ?? 'https://api.kkiapay.me';
const KKIA_SOLDE_PATH = '/merchant/me';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (corps: unknown, status = 200) =>
  new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'content-type': 'application/json' } });

/* ⟨kkiapay-solde⟩ */
/** Un compte KkiaPay et ses trois soldes, en francs entiers. */
export type CompteKkiapay = { id: string; nom: string; totalXof: number | null; operationXof: number | null; disponibleXof: number | null };

/** Ce que la Maison retient d'une lecture : les comptes, leurs sommes, et le souci s'il y en a un. */
export type SoldeKkiapay = {
  comptes: CompteKkiapay[];
  totalXof: number | null;
  operationXof: number | null;
  disponibleXof: number | null;
  /** Les clés de la réponse quand rien ne s'y lit (jamais leurs valeurs) : de quoi comprendre sans rien exposer. */
  forme?: string[];
};

/** Un montant de KkiaPay (nombre ou texte « 12 500 », « 12500.00 ») en francs entiers, ou null. */
export function francsDeKkiapay(x: unknown): number | null {
  if (typeof x === 'number') return Number.isFinite(x) ? Math.round(x) : null;
  if (typeof x !== 'string') return null;
  const t = x.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

const somme = (xs: readonly (number | null)[]): number | null => {
  const lus = xs.filter((x): x is number => typeof x === 'number');
  return lus.length ? lus.reduce((s, x) => s + x, 0) : null;
};

/** La réponse de `/merchant/me` lue comme le tableau de bord la lit. Les
    comptes sans leurs deux portefeuilles sont écartés, comme chez KkiaPay. */
export function soldeDeKkiapay(corps: unknown): SoldeKkiapay {
  const c = (corps && typeof corps === 'object' ? corps : {}) as Record<string, unknown>;
  const dedans = (c.data && typeof c.data === 'object' ? c.data : c) as Record<string, unknown>;
  const liste = Array.isArray(dedans.developerAccounts) ? dedans.developerAccounts : [];
  const comptes: CompteKkiapay[] = [];
  for (const brut of liste) {
    if (!brut || typeof brut !== 'object') continue;
    const a = brut as Record<string, unknown>;
    const paiement = a.payment_wallet as Record<string, unknown> | null | undefined;
    const reversement = a.payout_wallet as Record<string, unknown> | null | undefined;
    if (!paiement || typeof paiement !== 'object' || !reversement || typeof reversement !== 'object') continue;
    const nom = String(a.label ?? a.name ?? a.business_name ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
    comptes.push({
      id: String(a.id ?? '').slice(0, 64),
      nom: nom || 'Compte KkiaPay',
      totalXof: francsDeKkiapay(a.wallet_balance),
      operationXof: francsDeKkiapay(paiement.availableBalance),
      disponibleXof: francsDeKkiapay(reversement.availableBalance),
    });
  }
  return {
    comptes,
    totalXof: somme(comptes.map((x) => x.totalXof)),
    operationXof: somme(comptes.map((x) => x.operationXof)),
    disponibleXof: somme(comptes.map((x) => x.disponibleXof)),
    ...(comptes.length === 0 ? { forme: Object.keys(dedans).map((k) => k.slice(0, 40)).slice(0, 30) } : {}),
  };
}

/** Le souci d'une lecture, dit en clair ; null quand le solde est lu. */
export function souciDuSoldeKkiapay(http: number, lu: Pick<SoldeKkiapay, 'comptes'> | null): string | null {
  if (http === 200 && lu && lu.comptes.length > 0) return null;
  if (http === 200) return 'KkiaPay répond, mais sans aucun compte lisible.';
  if (http === 0) return 'KkiaPay ne répond pas. Réessayez dans un instant.';
  if (http === 401 || http === 403) return 'KkiaPay refuse les clés de la Maison pour lire le solde : il ne le montre qu’à son tableau de bord, connecté.';
  if (http === 404) return 'KkiaPay ne connaît pas cette route du solde.';
  if (http === 429) return 'KkiaPay demande d’attendre un peu avant de relire.';
  return `KkiaPay n’a pas rendu le solde (réponse ${http}).`;
}
/* ⟨/kkiapay-solde⟩ */

/** Deux clés sont-elles la même ? À temps constant. */
const memeCle = (a: string, b: string): boolean => {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
async function laDirection(req: Request): Promise<boolean> {
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return false;
  const cles = [Deno.env.get('CLE_SERVICE'), Deno.env.get('SERVICE_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .map((c) => String(c ?? '').trim()).filter(Boolean);
  if (cles.some((c) => memeCle(bearer, c))) return true;
  if (!ANON || !SUPABASE_URL) return false;
  const commeAppelant = createClient(SUPABASE_URL, ANON, { global: { headers: { authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } });
  const { data, error } = await commeAppelant.rpc('est_direction');
  return !error && data === true;
}

const lesCles = () => ({
  'x-api-key': (Deno.env.get('KKIAPAY_PUBLIC_KEY') ?? '').trim(),
  'x-private-key': (Deno.env.get('KKIAPAY_PRIVATE_KEY') ?? '').trim(),
  'x-secret-key': (Deno.env.get('KKIAPAY_SECRET_KEY') ?? '').trim(),
});

/** La question du tableau de bord, posée avec les clés de la Maison. Huit secondes au plus. */
async function demandeLeSolde(): Promise<{ http: number; corps: unknown }> {
  const minuterie = new AbortController();
  const t = setTimeout(() => minuterie.abort(), 8_000);
  try {
    const res = await fetch(`${KKIA_BASE}${KKIA_SOLDE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...lesCles() },
      body: '{}',
      signal: minuterie.signal,
    });
    const corps = await res.json().catch(() => null);
    return { http: res.status, corps };
  } catch {
    return { http: 0, corps: null };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const cles = lesCles();
  if (req.method === 'GET') {
    return json({ fonction: 'kkiapay-solde', version: VERSION, secrets: { public: !!cles['x-api-key'], private: !!cles['x-private-key'], secret: !!cles['x-secret-key'] } });
  }
  if (req.method !== 'POST') return json({ ok: false, raison: 'mal-forme' }, 405);
  if (!(await laDirection(req))) return json({ ok: false, raison: 'refusee', version: VERSION }, 403);
  if (!cles['x-api-key'] || !cles['x-private-key'] || !cles['x-secret-key']) {
    return json({ ok: false, raison: 'cles-absentes', souci: 'Les clés KkiaPay de la Maison ne sont pas posées sur le serveur.', version: VERSION });
  }
  const { http, corps } = await demandeLeSolde();
  const lu = http === 200 ? soldeDeKkiapay(corps) : null;
  const souci = souciDuSoldeKkiapay(http, lu);
  console.log(`kkiapay-solde ${VERSION.slice(0, 12)}: KkiaPay ${http}${lu ? `, ${lu.comptes.length} compte(s)` : ''}`);
  return json({
    ok: !souci, le: new Date().toISOString(), http, version: VERSION,
    ...(lu ? { comptes: lu.comptes, totalXof: lu.totalXof, operationXof: lu.operationXof, disponibleXof: lu.disponibleXof, ...(lu.forme ? { forme: lu.forme } : {}) } : {}),
    ...(souci ? { souci } : {}),
  });
});
