/* ══ LA SOURCE DE LA FONCTION « tri-des-messages » — 29 octobre 2026 ═══════
   Ce fichier n'est PAS collé tel quel : `node scripts/tri-des-messages-serveur.mjs`
   le regroupe avec les règles pures du dépôt (shared/tri-des-messages-pur)
   dans `supabase/functions/tri-des-messages/index.ts`, le fichier entier à
   coller. `verifie-le-tri-des-messages` refait le regroupement et crie si le
   fichier collé a pris du retard sur le dépôt.

   DEUX PORTES :
     · `Authorization: Bearer <CLE_SERVICE>` : whatsapp-automate, au premier
       message d'un numéro inconnu, AVANT toute réponse. Corps
       `{ numero, textes, nomProfil? }`. Rend `{ verdict }` : « bloque » et
       « proposition » veulent dire que personne ne lui répond.
     · une session du personnel (le Trône) : `{ geste }` parmi « bloquer »
       (`numeros`), « debloquer » et « cliente » (`numero`), « passe » (relire
       les fils sans fiche des dernières 24 heures, rien n'est rangé : la
       direction valide).

   LE BLOCAGE chez WhatsApp : `POST /<WA_PHONE_ID>/block_users` (Meta ne
   bloque qu'un numéro qui a écrit dans les 24 heures), `DELETE` pour
   débloquer. Un blocage refusé par Meta laisse le fil rangé dans « Bloqués »,
   et la ligne le dit.

   AUCUN SECRET ICI : CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY), SUPABASE_URL,
   SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, WA_TOKEN et WA_PHONE_ID viennent de
   l'environnement (déjà posés pour les autres fonctions).

   GET sans clé : la version, et si Claude et Meta sont posés (oui ou non). */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  CLE_DU_TRI, SCHEMA_DU_TRI, avecUnBloque, avecUnJugement, avecUneProposition, cleDuTri, consigneDuTri, contexteDuTri,
  etatDuNumero, extraitDe, lectureDuTri, rendu, triLu, type EntreeDuTri, type TriDesMessages, type VerdictDuTri,
} from '../../src/shared/tri-des-messages-pur';

const VERSION = '2026-10-29-a';
const MODELES = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
/** Le prix d'un million de jetons, en dollars, pour le compte du mois. */
const TARIFS: Record<string, { entree: number; sortie: number }> = {
  'claude-haiku-5-5': { entree: 1, sortie: 5 },
  'claude-sonnet-5-5': { entree: 3, sortie: 15 },
};
const CLE_DU_COMPTE = 'mnd_tri_compte';
const DELAI_CLAUDE_MS = 15_000;
const DELAI_META_MS = 10_000;
/** La passe des dernières 24 heures relit au plus vingt numéros. */
const PASSE_MAX = 20;

// deno-lint-ignore no-explicit-any
type Base = any;
type CorpsAnthropic = {
  content?: { type: string; name?: string; input?: unknown }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
/* Le journal : des verdicts et des comptes, jamais un numéro ni un texte. */
const dis = (quoi: string, o: Record<string, unknown> = {}) => console.log(`tri-des-messages · ${quoi} · ${JSON.stringify(o)}`);
const jourDeLaMaison = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 10);

/* ── CLAUDE ──────────────────────────────────────────────────────────────── */
async function juge(cle: string, sb: Base, o: { textes: readonly string[]; nomProfil?: string }): Promise<{ verdict: VerdictDuTri; motif: string } | null> {
  const corps = {
    max_tokens: 200,
    system: consigneDuTri(),
    messages: [{ role: 'user', content: contexteDuTri(o) }],
    tools: [{ name: 'trie', description: 'La boîte du message, et pourquoi.', input_schema: SCHEMA_DU_TRI }],
    tool_choice: { type: 'tool', name: 'trie' },
  };
  for (const modele of MODELES) {
    let status = 0; let lu: CorpsAnthropic = {};
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(DELAI_CLAUDE_MS),
        headers: { 'content-type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modele, ...corps }),
      });
      status = r.status;
      const texte = await r.text();
      try { lu = JSON.parse(texte) as CorpsAnthropic; } catch { lu = { error: { message: texte.slice(0, 200) } }; }
    } catch (e) {
      dis('claude injoignable', { motif: String((e as Error)?.message ?? e).slice(0, 80) });
      return null;
    }
    if ((status === 404 || status === 400) && /model/i.test(String(lu.error?.message ?? ''))) continue;
    if (status < 200 || status >= 300) { dis('claude refuse', { status }); return null; }
    await compteLAppel(sb, modele, lu.usage);
    return lectureDuTri(lu.content?.find((c) => c.type === 'tool_use' && c.name === 'trie')?.input);
  }
  return null;
}

async function compteLAppel(sb: Base, modele: string, usage: CorpsAnthropic['usage']): Promise<void> {
  try {
    const mois = jourDeLaMaison(Date.now()).slice(0, 7);
    const { data } = await sb.from('documents').select('data').eq('key', CLE_DU_COMPTE).maybeSingle();
    const avant = (data?.data ?? {}) as Record<string, { appels?: number; entree?: number; sortie?: number; usd?: number }>;
    const t = TARIFS[modele] ?? TARIFS['claude-sonnet-5-5'];
    const e = Number(usage?.input_tokens ?? 0); const so = Number(usage?.output_tokens ?? 0);
    const m = avant[mois] ?? {};
    await sb.from('documents').upsert({ key: CLE_DU_COMPTE, data: { ...avant, [mois]: {
      appels: (m.appels ?? 0) + 1, entree: (m.entree ?? 0) + e, sortie: (m.sortie ?? 0) + so,
      usd: Math.round(((m.usd ?? 0) + (e * t.entree + so * t.sortie) / 1_000_000) * 10_000) / 10_000,
    } } });
  } catch (e) {
    dis('compte non ecrit', { motif: String((e as Error)?.message ?? e).slice(0, 80) });
  }
}

/* ── META ────────────────────────────────────────────────────────────────── */
/** Bloquer (POST) ou débloquer (DELETE) un numéro chez WhatsApp. */
async function bloqueChezMeta(methode: 'POST' | 'DELETE', numero: string): Promise<boolean> {
  const jeton = (Deno.env.get('WA_TOKEN') ?? '').trim();
  const tel = (Deno.env.get('WA_PHONE_ID') ?? '').trim();
  if (!jeton || !tel) { dis('cles Meta absentes'); return false; }
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${tel}/block_users`, {
      method: methode, signal: AbortSignal.timeout(DELAI_META_MS),
      headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', block_users: [{ user: numero }] }),
    });
    // deno-lint-ignore no-explicit-any
    const rep: any = await r.json().catch(() => ({}));
    const ok = r.ok && !rep?.error;
    if (!ok) dis(methode === 'POST' ? 'meta refuse le blocage' : 'meta refuse le deblocage', { status: r.status, code: rep?.error?.code ?? null });
    return ok;
  } catch (e) {
    dis('meta injoignable', { motif: String((e as Error)?.message ?? e).slice(0, 80) });
    return false;
  }
}

/* ── LE REGISTRE ─────────────────────────────────────────────────────────── */
async function litLeTri(sb: Base): Promise<TriDesMessages> {
  const { data, error } = await sb.from('documents').select('data').eq('key', CLE_DU_TRI).maybeSingle();
  if (error) throw new Error(`registre illisible : ${error.message}`);
  return triLu(data?.data);
}
async function ecritLeTri(sb: Base, tri: TriDesMessages): Promise<void> {
  const { error } = await sb.from('documents').upsert({ key: CLE_DU_TRI, data: tri });
  if (error) throw new Error(`registre non ecrit : ${error.message}`);
}

/** JAMAIS JUGÉ : une fiche porte ce numéro, ou la Maison lui a déjà écrit. */
async function estConnu(sb: Base, numero: string): Promise<boolean | null> {
  const { data: fiches, error } = await sb.rpc('fiches_du_numero', { n: numero });
  if (error || !Array.isArray(fiches)) return null;
  if (fiches.some((f: { id?: unknown }) => typeof f?.id === 'string' && f.id)) return true;
  const { data: sortants, error: e2 } = await sb.from('messages_wa').select('id')
    .eq('data->>numero', numero).eq('data->>sens', 'sortant').limit(1);
  if (e2) return null;
  return (sortants ?? []).length > 0;
}

/** La direction est prévenue d'une proposition (pas d'un blocage : le nombre suffit). */
async function previensDUneProposition(base: string, service: string, e: EntreeDuTri): Promise<void> {
  try {
    await fetch(`${base}/functions/v1/push-notify`, {
      method: 'POST', signal: AbortSignal.timeout(DELAI_META_MS),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${service}` },
      body: JSON.stringify({
        mode: 'staff', title: 'Maison MND · une proposition',
        body: `${e.nom || 'Un numéro inconnu'} : ${e.motif}`.slice(0, 160),
        url: '/trone/#/gerard?vue=conversations&filtre=propositions',
      }),
    });
  } catch (err) {
    dis('notification non partie', { motif: String((err as Error)?.message ?? err).slice(0, 80) });
  }
}

/* ── LA PORTE DE L'AUTOMATE ─────────────────────────────────────────────── */
async function pourLAutomate(sb: Base, cleClaude: string, base: string, service: string, d: { numero?: unknown; textes?: unknown; nomProfil?: unknown }): Promise<Response> {
  const numero = String(d.numero ?? '');
  if (!/^\d{8,15}$/.test(numero)) return json({ ok: false, motif: 'numero', version: VERSION }, 400);
  const textes = (Array.isArray(d.textes) ? d.textes : []).map((t) => String(t ?? '')).filter((t) => t.trim()).slice(0, 3);
  const nom = String(d.nomProfil ?? '').trim().slice(0, 80);
  let tri = await litLeTri(sb);
  const etat = etatDuNumero(tri, numero);
  if (etat === 'bloque' || etat === 'proposition') return json({ ok: true, verdict: etat, version: VERSION });
  if (etat === 'blanc' || etat === 'juge') return json({ ok: true, verdict: 'passe', version: VERSION });
  if (textes.length === 0) return json({ ok: true, verdict: 'passe', version: VERSION });
  const connu = await estConnu(sb, numero);
  if (connu !== false) return json({ ok: true, verdict: connu ? 'connue' : 'passe', version: VERSION });
  if (!cleClaude) return json({ ok: true, verdict: 'passe', motif: 'cle-claude-absente', version: VERSION });

  const lu = await juge(cleClaude, sb, { textes, nomProfil: nom });
  if (!lu) return json({ ok: true, verdict: 'passe', motif: 'claude', version: VERSION });
  const quand = new Date().toISOString();
  const entree: EntreeDuTri = { numero, quand, motif: lu.motif, extrait: extraitDe(textes), ...(nom ? { nom } : {}), par: 'claude' };
  /* Relu juste avant d'écrire : un geste du Trône a pu passer entre-temps. */
  tri = await litLeTri(sb);
  if (lu.verdict === 'demarchage') {
    const pose = await bloqueChezMeta('POST', numero);
    await ecritLeTri(sb, avecUnBloque(tri, { ...entree, meta: pose ? 'bloque' : 'echec' }));
    dis('bloque', { meta: pose });
    return json({ ok: true, verdict: 'bloque', version: VERSION });
  }
  if (lu.verdict === 'proposition') {
    await ecritLeTri(sb, avecUneProposition(tri, entree));
    await previensDUneProposition(base, service, entree);
    dis('proposition');
    return json({ ok: true, verdict: 'proposition', version: VERSION });
  }
  await ecritLeTri(sb, avecUnJugement(tri, numero, lu.verdict, quand));
  dis('juge', { verdict: lu.verdict });
  return json({ ok: true, verdict: lu.verdict, version: VERSION });
}

/* ── LA PORTE DU TRÔNE ──────────────────────────────────────────────────── */
async function pourLeTrone(sb: Base, cleClaude: string, d: { geste?: unknown; numero?: unknown; numeros?: unknown }): Promise<Response> {
  const quand = new Date().toISOString();
  if (d.geste === 'bloquer') {
    const numeros = (Array.isArray(d.numeros) ? d.numeros : [d.numero]).map((n) => String(n ?? '').replace(/\D/g, '')).filter((n) => /^\d{8,15}$/.test(n)).slice(0, 30);
    if (numeros.length === 0) return json({ ok: false, motif: 'numero', version: VERSION }, 400);
    const faits: { numero: string; meta: boolean }[] = [];
    for (const numero of numeros) {
      const connu = await estConnu(sb, numero);
      if (connu !== false) { faits.push({ numero, meta: false }); continue; }
      const pose = await bloqueChezMeta('POST', numero);
      const tri = await litLeTri(sb);
      const avant = tri.propositions[cleDuTri(numero)];
      await ecritLeTri(sb, avecUnBloque(tri, {
        numero, quand, motif: avant?.motif ?? 'bloqué à la main', extrait: avant?.extrait ?? '', ...(avant?.nom ? { nom: avant.nom } : {}),
        par: 'direction', meta: pose ? 'bloque' : 'echec',
      }));
      faits.push({ numero, meta: pose });
    }
    /* Une fiche ou un échange passé : jamais bloqué, même à la main ici. */
    const refuses = faits.filter((f) => !f.meta).length;
    return json({ ok: true, bloques: faits.filter((f) => f.meta).length, refuses, version: VERSION });
  }
  if (d.geste === 'debloquer' || d.geste === 'cliente') {
    const numero = String(d.numero ?? '').replace(/\D/g, '');
    if (!/^\d{8,15}$/.test(numero)) return json({ ok: false, motif: 'numero', version: VERSION }, 400);
    const tri = await litLeTri(sb);
    const etaitBloque = etatDuNumero(tri, numero) === 'bloque';
    const meta = etaitBloque ? await bloqueChezMeta('DELETE', numero) : true;
    await ecritLeTri(sb, rendu(tri, numero, quand));
    return json({ ok: true, meta, version: VERSION });
  }
  if (d.geste === 'passe') {
    if (!cleClaude) return json({ ok: false, motif: 'cle-claude-absente', version: VERSION });
    const depuis = new Date(Date.now() - 86_400_000).toISOString();
    const { data, error } = await sb.from('messages_wa').select('id, data')
      .eq('data->>sens', 'entrant').gte('data->>quand', depuis).limit(1000);
    if (error) return json({ ok: false, motif: 'messages', version: VERSION }, 500);
    const tri = await litLeTri(sb);
    const parNumero = new Map<string, { textes: string[]; nom: string }>();
    for (const l of (data ?? []) as { data: { numero?: string; texte?: string; nomProfil?: string; quand?: string } }[]) {
      const n = String(l.data?.numero ?? '');
      if (!/^\d{8,15}$/.test(n) || etatDuNumero(tri, n) !== 'inconnu') continue;
      const x = parNumero.get(n) ?? { textes: [], nom: '' };
      if (l.data.texte) x.textes.push(String(l.data.texte));
      if (!x.nom && l.data.nomProfil) x.nom = String(l.data.nomProfil);
      parNumero.set(n, x);
    }
    const proposes: { numero: string; nom: string; extrait: string; verdict: VerdictDuTri; motif: string }[] = [];
    let lus = 0;
    for (const [numero, x] of parNumero) {
      if (lus >= PASSE_MAX) break;
      if (x.textes.length === 0) continue;
      const connu = await estConnu(sb, numero);
      if (connu !== false) continue;
      lus += 1;
      const lu = await juge(cleClaude, sb, { textes: x.textes.slice(0, 3), nomProfil: x.nom });
      if (lu && (lu.verdict === 'demarchage' || lu.verdict === 'proposition')) {
        proposes.push({ numero, nom: x.nom, extrait: extraitDe(x.textes.slice(0, 3)), verdict: lu.verdict, motif: lu.motif });
      }
    }
    return json({ ok: true, lus, proposes, version: VERSION });
  }
  return json({ ok: false, motif: 'geste', version: VERSION }, 400);
}

Deno.serve(async (req) => {
  const cleClaude = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();
  const meta = !!(Deno.env.get('WA_TOKEN') ?? '').trim() && !!(Deno.env.get('WA_PHONE_ID') ?? '').trim();
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const avecCors = (r: Response) => { for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); return r; };
  if (req.method === 'GET') return avecCors(json({ fonction: 'tri-des-messages', version: VERSION, claude: cleClaude ? 'oui' : 'non', meta: meta ? 'oui' : 'non' }));
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
  if (!base || !service) return avecCors(json({ ok: false, motif: 'configuration', version: VERSION }, 500));
  let d: Record<string, unknown>;
  try { d = await req.json() as Record<string, unknown>; } catch { return avecCors(json({ ok: false, motif: 'demande-illisible', version: VERSION }, 400)); }
  const sb = createClient(base, service);
  const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  try {
    if (jeton && jeton === service) return avecCors(await pourLAutomate(sb, cleClaude, base, service, d));
    /* LE TRÔNE : on demande à la base si ce jeton est celui du personnel. */
    if (!jeton || !anon) return avecCors(json({ ok: false, motif: 'porte', version: VERSION }, 401));
    const commeAppelant = createClient(base, anon, { global: { headers: { authorization: `Bearer ${jeton}` } } });
    const { data: estPersonnel, error } = await commeAppelant.rpc('is_staff');
    if (error || estPersonnel !== true) return avecCors(json({ ok: false, motif: 'reserve-au-personnel', version: VERSION }, 403));
    return avecCors(await pourLeTrone(sb, cleClaude, d));
  } catch (e) {
    dis('erreur', { motif: String((e as Error)?.message ?? e).slice(0, 160) });
    return avecCors(json({ ok: false, motif: 'erreur', version: VERSION }, 500));
  }
});
