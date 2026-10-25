// avis-google-pont - le pont entre Make.com et le Trone pour les avis Google.
//
// LA PREMIERE LIGNE EST VOLONTAIREMENT PAUVRE, comme celles des autres
// fonctions qu on colle a la main : elle survit a un collage de travers.

/* ═══════════════════════════════════════════════════════════════════════
   AVIS-GOOGLE-PONT · 25 octobre 2026 · version 2026-10-25-a

   « Je veux également répondre aux avis Google depuis ici » (Yéman). Google
   a refusé deux fois son API à la Maison ; Make.com l'a. Choix du 25 octobre
   au sélecteur : « Passer par Make ». Essai du même jour réussi (connexion
   « Google Business Profile » de Make, la fiche se lit).

   TROIS PORTES :
     GET   la version et l'état du pont (405, comme ia-maison) :
           { version, recoit, publie } ; le Trône ne montre « Publier sur
           Google » que si `publie` est vrai.
     POST avec l'en-tête x-jeton : MAKE APPORTE UN AVIS (scénario « Avis vers
           le Trône », un appel par avis, l'un après l'autre). Le jeton doit
           être AVIS_PONT_JETON ; l'avis se range dans le document
           `mnd_avis_google_tous` (l'équipe seule le lit). Rien ne part.
     POST avec la session du Trône : PUBLIER UNE RÉPONSE, après lecture
           (« Publier sur Google »). La personne est de l'équipe et son
           département publie (`peutPublier`) ; la réponse est recevable ;
           l'avis se retrouve chez Google (`apparie`, jamais deviné) ; Make
           la pose (scénario « Répondre sur Google », webhook
           MAKE_AVIS_REPONDRE) et doit rendre « 200 », le statut de Google.
           Alors seulement la réponse se range sur l'avis.

   DÉPLOIEMENT : Supabase → Edge Functions → New function → nom
   « avis-google-pont » → coller CE FICHIER ENTIER → Deploy. Verify JWT
   ALLUMÉ : le Trône passe la session de la personne, Make passe la clé
   publique (anon), qui est aussi un JWT. Secrets : AVIS_PONT_JETON (le
   jeton que Make met dans l'en-tête x-jeton), MAKE_AVIS_REPONDRE
   (l'adresse du webhook « Répondre sur Google ») ; CLE_SERVICE (ou
   SERVICE_KEY) existe déjà. Aucune migration. Contrôle : un GET sur
   l'adresse rend { error: 'method', version: '2026-10-25-a', … }.

   LE BLOC RECOPIÉ : src/shared/avis-google-pont-pur.ts, entier, entre ses
   repères (`node scripts/copie-dans-le-centre.mjs --fonction
   supabase/functions/avis-google-pont/index.ts` le rafraîchit ; le banc
   `verifie-le-pont-des-avis` crie s'il diverge). On corrige l'original. */
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
/* Ni le jeton ni l'adresse du webhook ne sortent de ce fichier : ni dans une
   réponse, ni dans le journal. */
const JETON = (Deno.env.get('AVIS_PONT_JETON') ?? '').trim();
const WEBHOOK = (Deno.env.get('MAKE_AVIS_REPONDRE') ?? '').trim();

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** La version de ce fichier : le Trône la lit au GET. */
const VERSION = '2026-10-25-a';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-jeton',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (corps: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ ...corps, version: VERSION }), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const refus = (status: number, erreur: string, message: string) => json({ ok: false, erreur, message }, status);

// ── DÉBUT DE LA COPIE : src/shared/avis-google-pont-pur.ts ──
/* ══ LE PONT DES AVIS, SES RÈGLES — 25 octobre 2026 ═════════════════════
   « Je veux également répondre aux avis Google depuis ici » (Yéman). Google
   a refusé deux fois son API à la Maison ; Make.com l'a, et la Maison y a
   branché sa fiche (connexion « Google Business Profile » de Make, essai
   du 25 octobre réussi). Le pont a deux sens :

   - MAKE → LE TRÔNE. Le scénario « Avis vers le Trône » (Watch Reviews, puis
     une requête HTTP) pose chaque avis dans la fonction `avis-google-pont`,
     qui le range dans le document `mnd_avis_google_tous` : TOUS les avis,
     leur nom chez Google (accounts/…/locations/…/reviews/…) et la réponse
     déjà publiée. Le relevé des cinq avis (Places) ne porte ni l'un ni
     l'autre.
   - LE TRÔNE → GOOGLE. « Publier sur Google », après lecture : la fonction
     retrouve l'avis chez Google (`apparie`), puis demande à Make de poser la
     réponse (scénario « Répondre sur Google »). Rien ne part tout seul.

   Pur : aucun import. La fonction Edge en porte une copie entière entre ses
   repères (scripts/copie-dans-le-centre.mjs --fonction …), le banc
   `verifie-le-pont-des-avis` crie si elles divergent. */

/** Le document où la fonction range les avis reçus de Make. Lisible par
    l'équipe seulement (il n'est pas dans la liste blanche des documents
    publics) : le site public garde son relevé, `mnd_avis_google`. */
export const CLE_DES_AVIS_DE_GOOGLE = 'mnd_avis_google_tous';

/** Un avis tel que Google le tient, reçu par Make. */
export type AvisDeGoogle = {
  /** Le nom de l'avis chez Google : accounts/…/locations/…/reviews/… */
  name: string;
  auteur: string;
  /** De 1 à 5 ; 0 si Google ne l'a pas dit. */
  note: number;
  texte: string;
  creeLe?: string;
  majLe?: string;
  /** La réponse de la Maison, publiée sur Google. */
  reponse?: string;
  reponduLe?: string;
  /** Vrai quand c'est le Trône qui l'a publiée (« Publier sur Google »). */
  parLeTrone?: boolean;
  /** Quand Make l'a apporté pour la dernière fois. */
  recuLe: string;
};
export type DocumentDesAvisDeGoogle = { avis: Record<string, AvisDeGoogle>; le?: string };

/** La limite de Google pour une réponse : 4 096 octets. */
export const OCTETS_MAX_DE_LA_REPONSE = 4096;

const NOM_D_AVIS = /^accounts\/[0-9]+\/locations\/[0-9]+\/reviews\/[A-Za-z0-9_-]+$/;
/** Un nom d'avis de Google, et rien d'autre : il finit dans une adresse. */
export const nomDAvisValide = (s: unknown): s is string => typeof s === 'string' && NOM_D_AVIS.test(s.trim());

const NOTES: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
/** « FIVE » (Google), « 5 » (un formulaire) ou 5 : la note de 1 à 5, sinon 0. */
export function noteDeGoogle(v: unknown): number {
  const s = String(v ?? '').trim().toUpperCase();
  if (NOTES[s]) return NOTES[s];
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 0;
}

/** Un champ texte de Make : une case laissée vide arrive en chaîne vide,
    parfois en « null » ou « undefined » écrits en toutes lettres. */
function champ(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return s === 'null' || s === 'undefined' ? '' : s;
}

/** Une date que Google a écrite (ISO), sinon rien. */
function dateDe(v: unknown): string | undefined {
  const s = champ(v);
  return s && Number.isFinite(Date.parse(s)) ? s : undefined;
}

/** CE QUE MAKE ENVOIE, lu champ par champ (formulaire ou JSON). Le nom de
    l'avis est obligatoire et vérifié ; le reste se lit tel quel. Null si ce
    n'est pas un avis. */
export function lisLAvisRecu(corps: Record<string, unknown>, maintenant: string): AvisDeGoogle | null {
  const name = champ(corps.name);
  if (!nomDAvisValide(name)) return null;
  const a: AvisDeGoogle = {
    name,
    auteur: champ(corps.auteur),
    note: noteDeGoogle(corps.note),
    texte: champ(corps.texte),
    recuLe: maintenant,
  };
  const creeLe = dateDe(corps.cree);
  const majLe = dateDe(corps.maj);
  const reponse = champ(corps.reponse);
  const reponduLe = dateDe(corps.reponduLe);
  if (creeLe) a.creeLe = creeLe;
  if (majLe) a.majLe = majLe;
  if (reponse) { a.reponse = reponse; if (reponduLe) a.reponduLe = reponduLe; }
  return a;
}

/** RANGER UN AVIS REÇU. Make ne dit rien d'une réponse qu'il ne voit pas
    encore : une réponse publiée par le Trône reste tant que Make n'en
    apporte pas une autre. */
export function versLeDocument(doc: DocumentDesAvisDeGoogle | null | undefined, a: AvisDeGoogle): DocumentDesAvisDeGoogle {
  const avis = { ...(doc?.avis ?? {}) };
  const avant = avis[a.name];
  const garde = !a.reponse && avant?.reponse
    ? { reponse: avant.reponse, ...(avant.reponduLe ? { reponduLe: avant.reponduLe } : {}), ...(avant.parLeTrone ? { parLeTrone: true } : {}) }
    : {};
  avis[a.name] = { ...a, ...garde };
  return { avis, le: a.recuLe };
}

/** La réponse publiée par le Trône, rangée sur l'avis. */
export function avecLaReponse(doc: DocumentDesAvisDeGoogle, name: string, reponse: string, le: string): DocumentDesAvisDeGoogle {
  const a = doc.avis[name];
  if (!a) return doc;
  return { ...doc, avis: { ...doc.avis, [name]: { ...a, reponse, reponduLe: le, parLeTrone: true } } };
}

/** Le texte remis à plat pour comparer : minuscules, sans accents, sans
    ponctuation, espaces simples. */
export function aPlat(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Ce que le relevé du Trône sait d'un avis (Places). */
export type AvisAApparier = { auteur: string; texte: string; texteOriginal?: string; publieLe?: string };

/** L'écart toléré entre la date de Places et celle de Google : la même
    publication, vue par deux portes. */
const ECART_MAX_MS = 36 * 3_600_000;

/** RETROUVER CHEZ GOOGLE l'avis que le Trône montre. Le même nom affiché,
    puis la même date de publication (à 36 h près) ; sans date commune, le
    même début de texte. Deux à la même distance, ou aucun : null. On ne
    devine jamais, une réponse sous le mauvais avis serait publique. */
export function apparie(a: AvisAApparier, tous: readonly AvisDeGoogle[]): AvisDeGoogle | null {
  const qui = aPlat(a.auteur);
  if (!qui) return null;
  const memes = tous.filter((g) => aPlat(g.auteur) === qui);
  if (memes.length === 0) return null;
  const t = Date.parse(String(a.publieLe ?? ''));
  const proches = Number.isFinite(t)
    ? memes
      .map((g) => ({ g, d: Math.abs(Date.parse(String(g.creeLe ?? '')) - t) }))
      .filter((x) => Number.isFinite(x.d) && x.d <= ECART_MAX_MS)
      .sort((x, y) => x.d - y.d)
    : [];
  if (proches.length > 0) {
    if (proches.length > 1 && proches[0].d === proches[1].d) return null;
    return proches[0].g;
  }
  const debut = aPlat(a.texteOriginal || a.texte).slice(0, 40);
  const parTexte = debut ? memes.filter((g) => aPlat(g.texte).includes(debut)) : memes.filter((g) => !aPlat(g.texte));
  return parTexte.length === 1 ? parTexte[0] : null;
}

/** Le corps que Make pose tel quel dans l'appel à Google : du JSON déjà
    écrit, où guillemets et retours à la ligne sont échappés. */
export const corpsDeLaReponse = (texte: string): string => JSON.stringify({ comment: texte });

/** Ce qui empêche de publier une réponse, ou null. */
export function defautDeLaReponse(texte: unknown): string | null {
  if (typeof texte !== 'string' || !texte.trim()) return 'la réponse est vide';
  if (new TextEncoder().encode(texte.trim()).length > OCTETS_MAX_DE_LA_REPONSE) return 'la réponse dépasse la longueur que Google accepte';
  return null;
}

/** Qui publie sur Google : la direction, et les départements qui ont le
    chantier des avis au Trône (la Clientèle, le Marketing). */
export const DEPARTEMENTS_QUI_PUBLIENT: readonly string[] = ['dept-clientele', 'dept-marketing'];
export function peutPublier(role: string | undefined, acces: Record<string, boolean> | undefined): boolean {
  if (role === 'souverain' || role === 'gerant') return true;
  return DEPARTEMENTS_QUI_PUBLIENT.some((d) => acces?.[d] === true);
}
// ── FIN DE LA COPIE ──

/** Deux secrets égaux, comparés sans s'arrêter au premier écart. */
function memeSecret(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function lisLeDocument<T>(cle: string, defaut: T): Promise<T> {
  const { data, error } = await admin.from('documents').select('data').eq('key', cle).maybeSingle();
  if (error) throw new Error(`lecture ${cle} : ${error.message}`);
  const v = (data as { data?: unknown } | null)?.data;
  return (v === null || v === undefined ? defaut : v) as T;
}
async function ecrisLeDocument(cle: string, data: unknown): Promise<void> {
  const { error } = await admin.from('documents').upsert({ key: cle, data });
  if (error) throw new Error(`écriture ${cle} : ${error.message}`);
}

/** Le corps de Make : un formulaire (le plus sûr pour des textes libres) ou
    du JSON. */
async function corpsDeMake(req: Request): Promise<Record<string, unknown>> {
  const type = (req.headers.get('content-type') ?? '').toLowerCase();
  const brut = await req.text();
  if (type.includes('application/json')) {
    try { const v = JSON.parse(brut); return v && typeof v === 'object' ? v as Record<string, unknown> : {}; } catch { return {}; }
  }
  return Object.fromEntries(new URLSearchParams(brut));
}

/* ── MAKE APPORTE UN AVIS ─────────────────────────────────────────────── */
async function recoisUnAvis(req: Request): Promise<Response> {
  if (!JETON) return refus(503, 'pont', 'Le secret AVIS_PONT_JETON n’est pas posé.');
  if (!memeSecret((req.headers.get('x-jeton') ?? '').trim(), JETON)) return refus(403, 'jeton', 'Jeton refusé.');
  const a = lisLAvisRecu(await corpsDeMake(req), new Date().toISOString());
  if (!a) return refus(400, 'format', 'Ce n’est pas un avis : le champ « name » doit être le nom de l’avis chez Google (accounts/…/locations/…/reviews/…).');
  const doc = await lisLeDocument<DocumentDesAvisDeGoogle>(CLE_DES_AVIS_DE_GOOGLE, { avis: {} });
  const apres = versLeDocument(doc, a);
  await ecrisLeDocument(CLE_DES_AVIS_DE_GOOGLE, apres);
  return json({ ok: true, nombre: Object.keys(apres.avis).length });
}

/* ── PUBLIER UNE RÉPONSE ──────────────────────────────────────────────── */
type DemandeDePublication = { action?: unknown; avis?: Partial<AvisAApparier>; reponse?: unknown };

async function publieUneReponse(req: Request, jwt: string): Promise<Response> {
  /* 1. LA PORTE : de l'équipe, et d'un département qui publie. */
  const { data: u } = jwt ? await admin.auth.getUser(jwt) : { data: null };
  const uid = u?.user?.id ?? null;
  const { data: ligne } = uid ? await admin.from('staff').select('user_id, role').eq('user_id', uid).maybeSingle() : { data: null };
  if (!uid || !ligne) return refus(403, 'equipe', 'Cette porte est celle de l’équipe : ouvrez une session du Trône.');
  const matrice = await lisLeDocument<Record<string, Record<string, boolean>>>('mnd_staff_access', {});
  if (!peutPublier((ligne as { role?: string }).role, matrice[uid])) return refus(403, 'equipe', 'Publier sur Google n’est pas ouvert à votre département.');

  /* 2. LA DEMANDE. */
  let d: DemandeDePublication;
  try { d = await req.json() as DemandeDePublication; } catch { return refus(400, 'format', 'La demande n’est pas du JSON.'); }
  if (d.action !== 'publier') return refus(400, 'format', 'Action inconnue.');
  const defaut = defautDeLaReponse(d.reponse);
  if (defaut) return refus(400, 'format', `Rien n’est parti : ${defaut}.`);
  const reponse = String(d.reponse).trim();
  const avis = d.avis ?? {};
  if (typeof avis.auteur !== 'string' || typeof avis.texte !== 'string') return refus(400, 'format', 'L’avis n’est pas dit.');

  /* 3. L'AVIS CHEZ GOOGLE, jamais deviné. */
  const doc = await lisLeDocument<DocumentDesAvisDeGoogle>(CLE_DES_AVIS_DE_GOOGLE, { avis: {} });
  const g = apparie(avis as AvisAApparier, Object.values(doc.avis ?? {}));
  if (!g) return refus(404, 'introuvable', 'Cet avis n’a pas encore été apporté par Make, ou deux avis lui ressemblent : rien n’est parti. Copiez la réponse et collez-la sur Google.');
  if (!WEBHOOK) return refus(503, 'pont', 'Le secret MAKE_AVIS_REPONDRE n’est pas posé : rien n’est parti.');

  /* 4. MAKE LA POSE. Il rend le statut de Google : « 200 », ou rien de bon. */
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), 45_000);
  let dit = '';
  let statut = 0;
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      signal: arret.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ review: g.name, corps: corpsDeLaReponse(reponse) }),
    });
    statut = r.status;
    dit = (await r.text()).trim();
  } catch (e) {
    console.error('avis-google-pont: make', arret.signal.aborted ? 'délai' : String((e as Error)?.message ?? e));
    return refus(504, 'make', 'Make n’a pas répondu à temps. Regardez l’avis sur Google avant de recommencer : la réponse est peut-être partie.');
  } finally {
    clearTimeout(minuterie);
  }
  if (statut !== 200 || dit !== '200') {
    console.error('avis-google-pont: make a rendu', statut, dit.slice(0, 120));
    return refus(502, 'google', `Make n’a pas confirmé la publication (${statut} · ${dit.slice(0, 60) || 'vide'}). Regardez l’avis sur Google avant de recommencer.`);
  }

  /* 5. RANGÉE SUR L'AVIS, pour que le Trône la voie au prochain regard. */
  const le = new Date().toISOString();
  try {
    const frais = await lisLeDocument<DocumentDesAvisDeGoogle>(CLE_DES_AVIS_DE_GOOGLE, { avis: {} });
    await ecrisLeDocument(CLE_DES_AVIS_DE_GOOGLE, avecLaReponse(frais, g.name, reponse, le));
  } catch (e) {
    console.error('avis-google-pont: rangement', String((e as Error)?.message ?? e));
  }
  return json({ ok: true, name: g.name, le });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method', recoit: !!JETON, publie: !!WEBHOOK }, 405);
  try {
    if (req.headers.has('x-jeton')) return await recoisUnAvis(req);
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    return await publieUneReponse(req, jwt);
  } catch (e) {
    console.error('avis-google-pont:', String((e as Error)?.message ?? e));
    return refus(500, 'pont', 'Le pont a trébuché : réessayez dans un instant.');
  }
});
