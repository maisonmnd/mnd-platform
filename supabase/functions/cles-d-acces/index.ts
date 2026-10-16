// ═══════════════════════════════════════════════════════════════════
// cles-d-acces — 16 octobre 2026
//
// « Entrer par l'empreinte » (maquette 16whsWP5…, choix « chacun retire
// ses clés, et la direction celles de l'équipe ») : chacun voit et retire
// SES clés d'accès depuis le Trône (supabase-js, sa propre session) ; la
// DIRECTION voit et retire celles de l'équipe ici, parce que lire ou
// retirer la clé d'un autre demande la clé de service, qui ne quitte
// jamais le serveur.
//
//   { action: 'lister' }                        → { membres: [{ user_id, nom, role, cles: [...] }] }
//   { action: 'retirer', userId, passkeyId }    → { ok: true }
//
// SEULE LA DIRECTION (souverain, gérant) l'appelle, et seulement pour les
// comptes de l'équipe (table `staff`), jamais ceux des clientes.
// Aucun secret à poser : la clé de service est déjà celle des autres fonctions.
// ═══════════════════════════════════════════════════════════════════
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const AUTH = `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
const ENTETES = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Ce que dit le serveur de connexion quand les clés d'accès ne sont pas allumées. */
const ETEINTES = 'Les clés d’accès ne sont pas encore allumées dans Supabase (Authentication, Passkeys).';

type Cle = { id: string; friendly_name?: string; created_at: string; last_used_at?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'méthode' }, 405);

  // Qui appelle ? La direction seule.
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (!uid) return json({ error: 'forbidden' }, 403);
  const { data: moi } = await admin.from('staff').select('role').eq('user_id', uid).maybeSingle();
  const role = (moi as { role?: string } | null)?.role;
  if (role !== 'souverain' && role !== 'gerant') return json({ error: 'Seule la direction voit les clés de l’équipe.' }, 403);

  const corps = await req.json().catch(() => ({})) as { action?: string; userId?: string; passkeyId?: string };

  // L'équipe tient en une page (quelques personnes, jamais mille) : une seule lecture suffit.
  const { data: equipe, error: errEquipe } = await admin.from('staff').select('user_id,name,role');
  if (errEquipe) return json({ error: 'L’équipe n’a pas pu être lue.' }, 500);
  const membres = ((equipe ?? []) as { user_id: string; name: string | null; role: string }[]).filter((m) => UUID.test(m.user_id));

  if (corps.action === 'lister') {
    const sortie: { user_id: string; nom: string; role: string; cles: Cle[] }[] = [];
    for (const m of membres) {
      const r = await fetch(`${AUTH}/admin/users/${m.user_id}/passkeys`, { headers: ENTETES });
      if (r.status === 404) {
        const dit = await r.text().catch(() => '');
        if (/passkey_disabled/i.test(dit)) return json({ error: ETEINTES }, 503);
      }
      const cles = r.ok ? await r.json().catch(() => []) : [];
      sortie.push({
        user_id: m.user_id, nom: m.name?.trim() || 'Sans nom', role: m.role,
        cles: (Array.isArray(cles) ? cles : []).map((c: Cle) => ({ id: c.id, friendly_name: c.friendly_name, created_at: c.created_at, last_used_at: c.last_used_at })),
      });
    }
    return json({ membres: sortie });
  }

  if (corps.action === 'retirer') {
    const userId = String(corps.userId ?? '');
    const passkeyId = String(corps.passkeyId ?? '');
    if (!UUID.test(userId) || !UUID.test(passkeyId)) return json({ error: 'Clé ou compte illisible.' }, 400);
    // Seulement un compte de l'équipe : jamais celui d'une cliente.
    if (!membres.some((m) => m.user_id === userId)) return json({ error: 'Ce compte n’est pas dans l’équipe.' }, 403);
    const r = await fetch(`${AUTH}/admin/users/${userId}/passkeys/${passkeyId}`, { method: 'DELETE', headers: ENTETES });
    if (!r.ok) {
      const dit = await r.text().catch(() => '');
      if (/passkey_disabled/i.test(dit)) return json({ error: ETEINTES }, 503);
      console.error('[cles-d-acces] retrait refusé', r.status, dit.slice(0, 200));
      return json({ error: `La clé n’a pas pu être retirée (${r.status}).` }, 502);
    }
    console.log('[cles-d-acces] clé retirée', { par: uid, compte: userId, cle: passkeyId });
    return json({ ok: true });
  }

  return json({ error: 'action inconnue' }, 400);
});
