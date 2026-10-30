/* ══ LA SOURCE DE LA FONCTION « variantes-wa » — 30 octobre 2026 ═════════
   Ce fichier n'est PAS collé tel quel : `node scripts/variantes-wa-serveur.mjs`
   le regroupe avec le module pur (`shared/variantes-wa-pur`) dans
   `supabase/functions/variantes-wa/index.ts`, le fichier entier à coller.

   QUI L'APPELLE : le Trône, la banque de scénarios, « Écrire 20 variantes »
   sur un cas validé. LA PORTE : une session du personnel (`is_staff`,
   demandé à la base avec le jeton de l'appelant).

   CE QU'ELLE FAIT : le plafond du mois (`APPELS_DE_VARIANTES_PAR_MOIS`),
   puis Claude (Haïku, Sonnet si l'identifiant n'est pas reconnu) écrit les
   variantes ; `lectureDesVariantes` les trie ; le compte du mois s'écrit
   (`mnd_variantes_wa_compte`). Elle rend `{ ok, variantes }`. Le texte de la
   cliente arrive sans numéro ni adresse (la banque les a ôtés à l'entrée).

   AUCUN SECRET ICI : SUPABASE_URL, SUPABASE_ANON_KEY, CLE_SERVICE (ou
   SUPABASE_SERVICE_ROLE_KEY) et ANTHROPIC_API_KEY viennent de
   l'environnement. GET sans clé : la version, et si la clé de Claude est
   posée. */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  APPELS_DE_VARIANTES_PAR_MOIS, SCHEMA_DES_VARIANTES, consigneDesVariantes, demandeDesVariantes, lectureDesVariantes,
} from '../../src/shared/variantes-wa-pur';
import { sansCoordonnees } from '../../src/shared/ia-anonymise-pur';

declare const Deno: {
  env: { get(nom: string): string | undefined };
  serve(f: (req: Request) => Promise<Response>): void;
};

const VERSION = '2026-10-30-a';
const MODELES = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
/** Le prix d'un million de jetons, en dollars, pour le compte du mois. */
const TARIFS: Record<string, { entree: number; sortie: number }> = {
  'claude-haiku-5-5': { entree: 0.1, sortie: 0.5 },
  'claude-sonnet-5-5': { entree: 2, sortie: 10 },
};
const CLE_DU_COMPTE = 'mnd_variantes_wa_compte';
const DELAI_CLAUDE_MS = 25_000;

// deno-lint-ignore no-explicit-any
type Base = any;
type CorpsAnthropic = {
  content?: { type: string; name?: string; input?: unknown }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const dis = (quoi: string, o: Record<string, unknown> = {}) => console.log(`variantes-wa · ${quoi} · ${JSON.stringify(o)}`);
const moisDeLaMaison = (ms: number): string => new Date(ms + 3_600_000).toISOString().slice(0, 7);

async function appelleClaude(cle: string, corps: Record<string, unknown>): Promise<{ status: number; corps: CorpsAnthropic }> {
  const arret = new AbortController();
  const minuterie = setTimeout(() => arret.abort(), DELAI_CLAUDE_MS);
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: arret.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(corps),
    });
    const texte = await r.text();
    let lu: CorpsAnthropic;
    try { lu = JSON.parse(texte) as CorpsAnthropic; } catch { lu = { error: { message: texte.slice(0, 200) } }; }
    return { status: r.status, corps: lu };
  } finally {
    clearTimeout(minuterie);
  }
}

const modeleInconnu = (status: number, c: CorpsAnthropic): boolean =>
  (status === 404 || status === 400) && /model/i.test(String(c.error?.message ?? ''));

Deno.serve(async (req) => {
  const cleClaude = (Deno.env.get('ANTHROPIC_API_KEY') ?? '').trim();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ fonction: 'variantes-wa', version: VERSION, claude: cleClaude ? 'oui' : 'non' });
  if (req.method !== 'POST') return json({ ok: false, motif: 'POST seulement', version: VERSION }, 405);

  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const anon = (Deno.env.get('SUPABASE_ANON_KEY') ?? '').trim();
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const jeton = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!url || !anon || !service) return json({ ok: false, motif: 'environnement', version: VERSION }, 500);
  if (!cleClaude) return json({ ok: false, motif: 'cle-claude-absente', version: VERSION });

  /* LA PORTE : le personnel seulement, jugé par la base. */
  const commeAppelant: Base = createClient(url, anon, { global: { headers: { authorization: `Bearer ${jeton}` } } });
  const { data: estPersonnel, error: errStaff } = await commeAppelant.rpc('is_staff');
  if (errStaff || estPersonnel !== true) return json({ ok: false, motif: 'reserve-au-personnel', version: VERSION }, 403);

  let d: { texte?: unknown } = {};
  try { d = await req.json(); } catch { return json({ ok: false, motif: 'demande-illisible', version: VERSION }, 400); }
  const texte = sansCoordonnees(typeof d.texte === 'string' ? d.texte : '').trim().slice(0, 600);
  if (!texte) return json({ ok: false, motif: 'texte', version: VERSION }, 400);

  const sb: Base = createClient(url, service);
  const maintenant = Date.now();
  const mois = moisDeLaMaison(maintenant);
  try {
    /* LE PLAFOND DU MOIS. */
    const { data: lu } = await sb.from('documents').select('data').eq('key', CLE_DU_COMPTE).maybeSingle();
    const compte = (lu?.data ?? {}) as Record<string, { appels?: number; entree?: number; sortie?: number; usd?: number }>;
    if ((compte[mois]?.appels ?? 0) >= APPELS_DE_VARIANTES_PAR_MOIS) { dis('plafond du mois'); return json({ ok: false, motif: 'plafond', version: VERSION }); }

    let rendu: { status: number; corps: CorpsAnthropic } | null = null;
    let modele = MODELES[0];
    for (const m of MODELES) {
      modele = m;
      rendu = await appelleClaude(cleClaude, {
        model: m, max_tokens: 2500, system: consigneDesVariantes(),
        messages: [{ role: 'user', content: demandeDesVariantes(texte) }],
        tools: [{ name: 'variantes', description: 'Les variantes du message.', input_schema: SCHEMA_DES_VARIANTES }],
        tool_choice: { type: 'tool', name: 'variantes' },
      });
      if (modeleInconnu(rendu.status, rendu.corps)) continue;
      break;
    }
    if (!rendu || rendu.status < 200 || rendu.status >= 300) {
      dis('claude refuse', { status: rendu?.status ?? 0, genre: rendu?.corps.error?.type ?? '' });
      return json({ ok: false, motif: 'claude', version: VERSION });
    }
    const entree = rendu.corps.content?.find((c) => c.type === 'tool_use' && c.name === 'variantes')?.input;
    const variantes = lectureDesVariantes(entree, texte);

    const t = TARIFS[modele] ?? TARIFS['claude-sonnet-5-5'];
    const e = Number(rendu.corps.usage?.input_tokens ?? 0);
    const so = Number(rendu.corps.usage?.output_tokens ?? 0);
    const m0 = compte[mois] ?? {};
    await sb.from('documents').upsert({
      key: CLE_DU_COMPTE,
      data: { ...compte, [mois]: {
        appels: (m0.appels ?? 0) + 1, entree: (m0.entree ?? 0) + e, sortie: (m0.sortie ?? 0) + so,
        usd: Math.round(((m0.usd ?? 0) + (e * t.entree + so * t.sortie) / 1_000_000) * 10_000) / 10_000,
      } },
    });
    dis('variantes', { modele, nombre: variantes.length });
    if (variantes.length === 0) return json({ ok: false, motif: 'modele', version: VERSION });
    return json({ ok: true, variantes, version: VERSION });
  } catch (e) {
    dis('erreur', { motif: String((e as Error)?.message ?? e).slice(0, 120) });
    return json({ ok: false, motif: 'erreur', version: VERSION });
  }
});
