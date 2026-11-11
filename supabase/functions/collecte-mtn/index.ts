// collecte-mtn - regler par MTN : le compte de collecte de la Maison, par le relais.
//
// Premiere ligne volontairement pauvre (lecon du 14 septembre 2026).

/* ═══════════════════════════════════════════════════════════════════
   COLLECTE-MTN · 11 novembre 2026, maquette « Régler par MTN, QR »
   (AdAaYXGStQetsXHFkZzUW5), « construis » de Yéman.

   LOT A : AUCUN ARGENT NE BOUGE. La direction lit le compte de collecte
   de la Maison chez MTN : le jeton Collection, le solde, et un numéro
   vérifié (actif, nom du titulaire). Rien n'est demandé à personne.

   PAR LE RELAIS, SEULEMENT, comme `paie-mtn` (dont rien n'est touché) :
   chaque appel va à MOMO_RELAIS_URL avec l'en-tête X-Relais-Cle, et le
   relais le transmet tel quel à MTN, depuis l'adresse fixe autorisée.

   LE COMPTE DE COLLECTE N'EST PAS LE COMPTE DE PAIE : ses clés sont les
   siennes. Son numéro et son nom de compte ne s'écrivent jamais dans le
   dépôt, qui est public : ils se lisent dans deux réglages du serveur,
   facultatifs ; sans eux, le Trône dit « numéro à poser ».

   QUI APPELLE.
   · Tout le monde : GET, ou { action: 'sante' } : la version, et ce qui est
     posé (oui / non), jamais une valeur.
   · La direction (souverain, gérant), avec son jeton : 'solde', 'essai'.
   Verify JWT : ÉTEINT ; la direction se vérifie ici, action par action.

   LES CLÉS NE SORTENT PAS : ni l'utilisateur d'API, ni sa clé, ni la clé
   d'abonnement, ni le jeton, ni la clé du relais ne figurent dans une
   réponse ou un journal.

   SECRETS : MOMO_PROD_COLLECTION_USER, MOMO_PROD_COLLECTION_KEY,
   MOMO_PROD_COLLECTION_SUBSCRIPTION, MOMO_TARGET_ENV (mtnbenin),
   MOMO_RELAIS_URL, MOMO_RELAIS_CLE ; facultatifs, pour l'affichage :
   MOMO_PROD_COLLECTION_NUMERO (le numéro de collecte), MOMO_PROD_COLLECTION_COMPTE
   (le nom du compte chez MTN). SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY
   sont posés d'office.
   ═══════════════════════════════════════════════════════════════════ */

const VERSION = '2026-11-11-a';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const env = (k: string) => (Deno.env.get(k) ?? '').trim();
const PROJET = () => env('SUPABASE_URL').replace(/\/$/, '');
const SERVICE = () => env('SERVICE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
/** Les clés de service posées : le passage de la base présente l'une d'elles. */
const CLES_DE_SERVICE = () => [env('SERVICE_KEY'), env('CLE_SERVICE'), env('SUPABASE_SERVICE_ROLE_KEY')].filter(Boolean);
const DIRECTION = new Set(['souverain', 'gerant']);

/* ⟨collecte-mtn⟩ */
/** Un numéro mobile du Bénin, tel que MTN l'attend : 229, puis 01, puis huit chiffres. */
const RE_MSISDN_DU_BENIN = /^22901\d{8}$/;

/** LES PRÉFIXES DE MTN BÉNIN (les deux chiffres après « 01 », numérotation à
    dix chiffres du 30 novembre 2024 ; liste de l'ARCEP Bénin, à revoir si
    MTN reçoit de nouvelles tranches). Ils ne servent qu'à proposer MTN
    d'abord : MTN refuse lui-même un numéro qui n'est pas chez lui, et la
    page offre alors KkiaPay. */
const PREFIXES_MTN_DU_BENIN: readonly string[] = ['42', '46', '50', '51', '52', '53', '54', '56', '57', '59', '61', '62', '66', '67', '69', '90', '91', '96', '97'];

/** Le numéro tapé, en 22901XXXXXXXX, ou null. Un numéro à huit chiffres
    (l'ancien format) ne se complète pas : une demande au mauvais numéro
    sonnerait chez quelqu'un d'autre. */
function msisdnDe(saisi: unknown): string | null {
  let c = String(saisi ?? '').replace(/\D/g, '');
  if (c.startsWith('00229')) c = c.slice(2);
  if (c.length === 10 && c.startsWith('01')) c = `229${c}`;
  return RE_MSISDN_DU_BENIN.test(c) ? c : null;
}

/** Un numéro de chez MTN Bénin (d'après ses préfixes). */
const estUnNumeroMtn = (msisdn: unknown): boolean => {
  const m = msisdnDe(msisdn);
  return !!m && PREFIXES_MTN_DU_BENIN.includes(m.slice(5, 7));
};

/** Le numéro dit par paires : « 01 », puis quatre paires. */
const numeroDitMtn = (msisdn: unknown): string => {
  const m = msisdnDe(msisdn);
  return m ? m.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ') : '';
};

/** « 01 97 •• •• 56 » : ce que le Trône montre d'un numéro de cliente. */
const numeroMasque = (msisdn: unknown): string => {
  const d = numeroDitMtn(msisdn);
  return d ? `${d.slice(0, 5)} •• •• ${d.slice(-2)}` : '';
};

/** Ce que MTN rend d'un titulaire (basicuserinfo) ou d'un compte (balance). */
type FicheDeMtn = { given_name?: unknown; family_name?: unknown; name?: unknown; availableBalance?: unknown } | null | undefined;

/** Le nom que MTN rend pour un numéro (basicuserinfo). */
const nomDeMtnCollecte = (c: FicheDeMtn): string | null => {
  const n = [c?.given_name, c?.family_name].filter((x): x is string => typeof x === 'string' && !!x.trim()).join(' ').trim();
  return n || (typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : null);
};

/** Le solde que MTN rend (account/balance), en francs entiers, ou null. */
const soldeDeMtnCollecte = (c: FicheDeMtn): number | null => {
  if (c?.availableBalance === undefined || c?.availableBalance === null || c?.availableBalance === '') return null;
  const n = Number(c.availableBalance);
  return Number.isFinite(n) ? Math.floor(n) : null;
};

/** CE QUE LE SERVEUR DIT DU COMPTE, en clair, pour le bandeau de la
    direction : rien quand tout va, sinon une phrase. Jamais un code nu. */
function souciDuCompte(o: { pret: boolean; jetonHttp?: number; soldeHttp?: number }): string | null {
  if (!o.pret) return 'Les clés de collecte MTN ou le relais ne sont pas encore posés dans Supabase.';
  const j = Number(o.jetonHttp ?? 0);
  if (j === 0) return 'Le relais MTN ne répond pas : le serveur de la Maison est-il allumé ?';
  if (j === 403) return 'Le relais refuse l’appel : la clé du relais posée dans Supabase n’est pas la bonne.';
  if (j === 401) return 'MTN refuse les clés de collecte (utilisateur, clé ou abonnement) : à revoir dans Supabase.';
  if (j !== 200) return `MTN n’a pas donné de jeton (réponse ${j}).`;
  const s = Number(o.soldeHttp ?? 0);
  if (s === 200) return null;
  if (s === 0) return 'Le solde n’a pas pu être lu : le relais n’a pas répondu.';
  if (s === 401 || s === 403) return 'MTN refuse la lecture du solde : l’adresse du relais est-elle autorisée pour la collecte ?';
  return `MTN n’a pas rendu le solde (réponse ${s}).`;
}

/** « il y a 12 s », « il y a 3 min », « à l’instant ». */
function ilYaDit(depuisMs: number): string {
  const s = Math.max(0, Math.round(depuisMs / 1000));
  if (s < 2) return 'à l’instant';
  if (s < 60) return `il y a ${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `il y a ${m} min` : `il y a ${Math.floor(m / 60)} h`;
}
/* ⟨/collecte-mtn⟩ */

/* ── La base, par la clé de service ── */
const enTetesBase = () => ({ apikey: SERVICE(), Authorization: `Bearer ${SERVICE()}`, 'Content-Type': 'application/json' });
async function base(chemin: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; corps: any }> {
  try {
    const r = await fetch(`${PROJET()}/rest/v1/${chemin}`, { ...init, headers: { ...enTetesBase(), ...(init.headers ?? {}) } });
    const t = await r.text().catch(() => '');
    let corps: any = null;
    try { corps = t ? JSON.parse(t) : null; } catch { corps = t; }
    return { ok: r.ok, status: r.status, corps };
  } catch {
    return { ok: false, status: 0, corps: null };
  }
}

/* ── MTN, par le relais ── */
const cles = () => ({
  utilisateur: env('MOMO_PROD_COLLECTION_USER'),
  cle: env('MOMO_PROD_COLLECTION_KEY'),
  abonnement: env('MOMO_PROD_COLLECTION_SUBSCRIPTION'),
  relais: env('MOMO_RELAIS_URL').replace(/\/$/, ''),
  relaisCle: env('MOMO_RELAIS_CLE'),
  cible: env('MOMO_TARGET_ENV') || 'mtnbenin',
});
const pret = () => { const k = cles(); return !!(k.utilisateur && k.cle && k.abonnement && k.relais && k.relaisCle); };

async function mtn(chemin: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<{ http: number; corps: any }> {
  const k = cles();
  try {
    const r = await fetch(`${k.relais}${chemin}`, {
      method: init.method ?? 'GET',
      headers: { 'X-Relais-Cle': k.relaisCle, 'Ocp-Apim-Subscription-Key': k.abonnement, ...(init.headers ?? {}) },
      body: init.body,
      signal: AbortSignal.timeout(20_000),
    });
    const t = await r.text().catch(() => '');
    let corps: any = null;
    try { corps = t ? JSON.parse(t) : null; } catch { corps = null; }
    return { http: r.status, corps };
  } catch {
    return { http: 0, corps: null };
  }
}
let jetonDuPassage: { jeton: string | null; http: number } | null = null;
async function jeton(): Promise<{ jeton: string | null; http: number }> {
  if (jetonDuPassage) return jetonDuPassage;
  const k = cles();
  const r = await mtn('/collection/token/', { method: 'POST', headers: { Authorization: `Basic ${btoa(`${k.utilisateur}:${k.cle}`)}` } });
  jetonDuPassage = { jeton: r.http === 200 && typeof r.corps?.access_token === 'string' ? r.corps.access_token : null, http: r.http };
  return jetonDuPassage;
}
async function mtnAuth(chemin: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  const j = await jeton();
  if (!j.jeton) return { http: j.http === 200 ? 401 : j.http, corps: { code: 'ACCES_REFUSE' } };
  return mtn(chemin, { ...init, headers: { Authorization: `Bearer ${j.jeton}`, 'X-Target-Environment': cles().cible, ...(init.headers ?? {}) } });
}

/** Le solde du compte de collecte, et ce que MTN a répondu. */
async function leSolde(): Promise<{ soldeXof: number | null; devise: string | null; jetonHttp: number; soldeHttp: number }> {
  const j = await jeton();
  if (!j.jeton) return { soldeXof: null, devise: null, jetonHttp: j.http, soldeHttp: 0 };
  const r = await mtnAuth('/collection/v1_0/account/balance');
  return {
    soldeXof: r.http === 200 ? soldeDeMtnCollecte(r.corps) : null,
    devise: r.http === 200 && typeof r.corps?.currency === 'string' ? r.corps.currency : null,
    jetonHttp: j.http, soldeHttp: r.http,
  };
}

/** Le numéro et le nom du compte de collecte, lus dans leurs réglages : jamais écrits dans le dépôt. */
const leCompte = () => ({
  numero: numeroDitMtn(env('MOMO_PROD_COLLECTION_NUMERO')) || null,
  compte: env('MOMO_PROD_COLLECTION_COMPTE').slice(0, 60) || null,
});

/* ── Qui appelle ── */
async function direction(req: Request): Promise<{ par: string } | null> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt || CLES_DE_SERVICE().includes(jwt)) return null;
  const u = await fetch(`${PROJET()}/auth/v1/user`, { headers: { apikey: SERVICE(), Authorization: `Bearer ${jwt}` } }).catch(() => null);
  if (!u || !u.ok) return null;
  const uid = (await u.json().catch(() => null))?.id;
  if (typeof uid !== 'string' || !/^[0-9a-f-]{36}$/i.test(uid)) return null;
  const s = await base(`staff?user_id=eq.${uid}&select=role,name&limit=1`);
  const moi = Array.isArray(s.corps) ? s.corps[0] : null;
  if (!moi || !DIRECTION.has(String(moi.role))) return null;
  return { par: String(moi.name ?? '').trim() || 'La direction' };
}

const sante = () => {
  const k = cles();
  const c = leCompte();
  return {
    fonction: 'collecte-mtn', version: VERSION, pret: pret(), environnement: k.cible,
    cles: { utilisateur: !!k.utilisateur, cle: !!k.cle, abonnement: !!k.abonnement, numero: !!c.numero, compte: !!c.compte },
    relais: !!(k.relais && k.relaisCle),
  };
};

Deno.serve(async (req) => {
  jetonDuPassage = null;
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json(sante());
  if (req.method !== 'POST') return json({ erreur: 'méthode' }, 405);

  const corps = await req.json().catch(() => ({})) as any;
  const action = String(corps?.action ?? '');
  if (action === 'sante') return json(sante());

  if (action === 'solde' || action === 'essai') {
    const qui = await direction(req);
    if (!qui) return json({ erreur: 'Seule la direction lit le compte de collecte.' }, 403);
    const le = new Date().toISOString();
    if (!pret()) return json({ ...sante(), le, ...leCompte(), soldeXof: null, souci: souciDuCompte({ pret: false }) }, 503);

    if (action === 'solde') {
      const s = await leSolde();
      return json({ le, ...leCompte(), soldeXof: s.soldeXof, devise: s.devise, souci: souciDuCompte({ pret: true, jetonHttp: s.jetonHttp, soldeHttp: s.soldeHttp }) });
    }

    /* L'ESSAI SANS ARGENT : le jeton, le solde, et un numéro vérifié chez
       MTN (actif, nom du titulaire). Rien n'est demandé à personne. */
    const s = await leSolde();
    const msisdn = msisdnDe(corps.numero);
    let verifie: { dit: string; mtn: boolean; actif: boolean | null; nom: string | null } | null = null;
    if (msisdn && s.jetonHttp === 200) {
      const a = await mtnAuth(`/collection/v1_0/accountholder/msisdn/${msisdn}/active`);
      const b = await mtnAuth(`/collection/v1_0/accountholder/msisdn/${msisdn}/basicuserinfo`);
      verifie = {
        dit: numeroDitMtn(msisdn), mtn: estUnNumeroMtn(msisdn),
        actif: a.http === 200 ? a.corps?.result === true || a.corps?.result === 'true' : null,
        nom: b.http === 200 ? nomDeMtnCollecte(b.corps) : null,
      };
    }
    console.log('[collecte-mtn] essai', { par: qui.par, jeton: s.jetonHttp, solde: s.soldeHttp, numero: !!verifie });
    return json({
      le, ...leCompte(),
      jeton: { ok: s.jetonHttp === 200, http: s.jetonHttp },
      solde: { xof: s.soldeXof, devise: s.devise, http: s.soldeHttp },
      verifie, ...(corps.numero && !msisdn ? { numeroIllisible: true } : {}),
      souci: souciDuCompte({ pret: true, jetonHttp: s.jetonHttp, soldeHttp: s.soldeHttp }),
    });
  }

  return json({ erreur: 'action inconnue' }, 400);
});
