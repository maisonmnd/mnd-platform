/* ══════════════════════════════════════════════════════════════════
   MODELES-META — l'état des modèles WhatsApp chez Meta, lu pour le Trône.

   « Je ne vois pas les listes des modèles Meta : combien de fois chaque
   modèle a été utilisé… », puis « est-ce possible de mettre des modèles en
   pause et que ça marche également sur Meta ? » (Yéman, 4 novembre 2026).
   Maquette « Ce qui va partir » (v3), onglet « Les modèles Meta ».

   CE QU'ELLE FAIT, et rien d'autre :
     ① { "geste": "lire" } (le personnel connecté, ou la clé service) : lit
        chez Meta la liste des modèles du compte WhatsApp Business
        (GET /{WA_WABA_ID}/message_templates : nom, état, catégorie, langue,
        qualité, motif d'un refus), la garde au document `mnd_modeles_meta`
        (lu aussi par le Conseil du matin) et la rend ;
     ② { "geste": "reprendre", "id": "<id du modèle chez Meta>" } (la
        direction seule : souverain ou gérant) : demande à Meta de reprendre
        un modèle QUE META A MIS EN PAUSE (POST /{id}/unpause). Meta ne
        permet pas à une entreprise de mettre elle-même un modèle en pause :
        la pause « chez nous » vit au Trône (`modeles_en_pause`, 0197) et la
        porte d'Opale la fait respecter ; elle ne passe pas par ici.
   LE JETON META NE QUITTE JAMAIS LE SERVEUR : le Trône ne voit que la liste.

   Secrets : WA_TOKEN (déjà posé), WA_WABA_ID (l'identifiant du compte
   WhatsApp Business, à poser : sans lui, la fonction le dit et ne lit rien).
   AUCUN SECRET ICI : ce fichier vit dans un dépôt public.

   Un GET sans clé rend la version : c'est le contrôle de santé.
   ══════════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';

const VERSION = '2026-11-11-a · l’état des modèles chez Meta, lu ; reprendre un modèle que Meta a mis en pause, par la direction seule';
const GRAPH = 'https://graph.facebook.com/v20.0';
const APPEL_MAX_MS = 10_000;
const PAGES_AU_PLUS = 10;
const CHAMPS = 'id,name,status,category,language,quality_score,rejected_reason';

const ENTETES = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { ...ENTETES, 'content-type': 'application/json' } });

type ModeleMeta = { id: string; nom: string; etat: string; categorie?: string; langue?: string; qualite?: string; motifDuRefus?: string };

/** Ce que Meta rend d'un modèle, réduit à ce que l'écran montre. */
function modeleLu(t: Record<string, unknown>): ModeleMeta | null {
  const id = String(t?.id ?? '').trim();
  const nom = String(t?.name ?? '').trim();
  if (!id || !nom) return null;
  const q = t?.quality_score as { score?: unknown } | undefined;
  return {
    id, nom, etat: String(t?.status ?? '').toUpperCase(),
    ...(t?.category ? { categorie: String(t.category) } : {}),
    ...(t?.language ? { langue: String(t.language) } : {}),
    ...(q?.score ? { qualite: String(q.score).toUpperCase() } : {}),
    ...(t?.rejected_reason && String(t.rejected_reason) !== 'NONE' ? { motifDuRefus: String(t.rejected_reason) } : {}),
  };
}

/** QUI APPELLE : la clé service (le cron, un essai), la direction, le personnel, ou personne. */
// deno-lint-ignore no-explicit-any
async function quiAppelle(sb: any, req: Request, service: string): Promise<'service' | 'direction' | 'personnel' | null> {
  const cle = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!cle) return null;
  if (service && cle === service) return 'service';
  const { data: lu } = await sb.auth.getUser(cle);
  const uid = lu?.user?.id;
  if (!uid) return null;
  const { data: staff } = await sb.from('staff').select('user_id, role').eq('user_id', uid).maybeSingle();
  if (!staff) return null;
  return staff.role === 'souverain' || staff.role === 'gerant' ? 'direction' : 'personnel';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ENTETES });
  if (req.method === 'GET') return json({ fonction: 'modeles-meta', version: VERSION });
  if (req.method !== 'POST') return json({ erreur: 'méthode', version: VERSION }, 405);

  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', service);
  const qui = await quiAppelle(sb, req, service);
  if (!qui) return json({ erreur: 'réservé au personnel de la Maison', version: VERSION }, 401);

  const corps = (await req.json().catch(() => ({}))) as { geste?: string; id?: string };
  const WA_TOKEN = (Deno.env.get('WA_TOKEN') ?? '').trim();
  const WABA = (Deno.env.get('WA_WABA_ID') ?? '').trim();
  if (!WA_TOKEN) return json({ version: VERSION, erreur: 'jeton Meta absent (WA_TOKEN)' }, 200);

  /* ② REPRENDRE CHEZ META, la direction seule. */
  if (corps.geste === 'reprendre') {
    if (qui !== 'direction' && qui !== 'service') return json({ erreur: 'la direction seule reprend un modèle', version: VERSION }, 403);
    const id = String(corps.id ?? '').trim();
    if (!/^\d{5,30}$/.test(id)) return json({ erreur: 'identifiant du modèle invalide', version: VERSION }, 400);
    try {
      const r = await fetch(`${GRAPH}/${id}/unpause`, {
        method: 'POST', signal: AbortSignal.timeout(APPEL_MAX_MS),
        headers: { authorization: `Bearer ${WA_TOKEN}` },
      });
      const rep = await r.json().catch(() => ({})) as { success?: boolean; error?: { message?: string; code?: number } };
      if (!r.ok || rep?.error) return json({ version: VERSION, repris: false, motif: String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 300) }, 200);
      return json({ version: VERSION, repris: rep?.success !== false });
    } catch (e) {
      return json({ version: VERSION, repris: false, motif: String(e).slice(0, 200) }, 200);
    }
  }

  /* ① LIRE LA LISTE. */
  if (corps.geste && corps.geste !== 'lire') return json({ erreur: 'geste inconnu', version: VERSION }, 400);
  if (!WABA) return json({ version: VERSION, erreur: 'compte WhatsApp Business absent (WA_WABA_ID) : l’état chez Meta ne peut pas se lire', modeles: [] }, 200);
  const modeles: ModeleMeta[] = [];
  let adresse: string | null = `${GRAPH}/${WABA}/message_templates?fields=${CHAMPS}&limit=100`;
  try {
    for (let page = 0; adresse && page < PAGES_AU_PLUS; page++) {
      const r: Response = await fetch(adresse, { signal: AbortSignal.timeout(APPEL_MAX_MS), headers: { authorization: `Bearer ${WA_TOKEN}` } });
      const rep = await r.json().catch(() => ({})) as { data?: Record<string, unknown>[]; paging?: { next?: string }; error?: { message?: string } };
      if (!r.ok || rep?.error) return json({ version: VERSION, erreur: `Meta : ${String(rep?.error?.message ?? `HTTP ${r.status}`).slice(0, 200)}`, modeles: [] }, 200);
      for (const t of rep.data ?? []) { const m = modeleLu(t); if (m) modeles.push(m); }
      adresse = rep.paging?.next && rep.paging.next.startsWith(GRAPH) ? rep.paging.next : null;
    }
  } catch (e) {
    return json({ version: VERSION, erreur: `Meta : ${String(e).slice(0, 200)}`, modeles: [] }, 200);
  }
  modeles.sort((a, b) => a.nom.localeCompare(b.nom));
  const lusLe = new Date().toISOString();
  const { error } = await sb.from('documents').upsert({ key: 'mnd_modeles_meta', data: { lusLe, modeles, version: VERSION } });
  if (error) console.error('modeles-meta: document', error.message);
  return json({ version: VERSION, lusLe, modeles });
});
