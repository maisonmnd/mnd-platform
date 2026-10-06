// ═══════════════════════════════════════════════════════════════════
// site-publier — 4 octobre 2026
//
// « L'éditeur du site » : quand Brice ou Yéman publient au Trône, cette
// fonction demande à GitHub de refabriquer le site sur ses serveurs
// (workflow `.github/workflows/publier-le-site.yml`, événement
// `site-publier`). Le site sort avec les retouches publiées, comme s'il
// avait été construit depuis le poste.
//
// SECRET À POSER (Supabase › Edge Functions › Secrets) :
//   GITHUB_SITE_TOKEN — la clé GitHub créée par la marche à suivre.
// Sans lui, la fonction répond « clé absente » et le Trône le dit.
//
// SEULE LA DIRECTION (souverain, gérant) peut la déclencher, comme la base
// refuse à tout autre d'écrire `mnd_site_publie` (0114).
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GITHUB_SITE_TOKEN = Deno.env.get('GITHUB_SITE_TOKEN') ?? '';
const DEPOT = Deno.env.get('GITHUB_SITE_DEPOT') ?? 'maisonmnd/mnd-platform';

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'méthode' }, 405);

  // Qui appelle ? La direction seule.
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: 'forbidden' }, 403);
  const { data: staffRow } = await admin.from('staff').select('role').eq('user_id', uid).maybeSingle();
  const role = (staffRow as { role?: string } | null)?.role;
  if (role !== 'souverain' && role !== 'gerant') return json({ error: 'Seuls Brice et Yéman publient le site.' }, 403);

  if (!GITHUB_SITE_TOKEN) return json({ error: 'clé absente : GITHUB_SITE_TOKEN n’est pas posée' }, 503);

  // La demande à GitHub : un événement que le workflow écoute.
  const r = await fetch(`https://api.github.com/repos/${DEPOT}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_SITE_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'maison-mnd-site-publier',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ event_type: 'site-publier', client_payload: { par: uid, le: new Date().toISOString() } }),
  });
  if (r.status !== 204) {
    const dit = await r.text().catch(() => '');
    console.error('[site-publier] GitHub a refusé', r.status, dit.slice(0, 300));
    return json({ error: `GitHub a refusé (${r.status})` }, 502);
  }
  return json({ ok: true });
});
