// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function — demande-submit
//
// LA SEULE PORTE PAR LAQUELLE LE SITE PUBLIC DÉPOSE UNE DEMANDE — 17 septembre 2026.
//
// Le site révélateur ne connaît personne : une visiteuse laisse un prénom et
// un numéro, sans compte. La relecture de l'audit a fixé la règle : plus
// aucun dépôt anonyme direct en base (0106 avait rouvert ce que 0007 avait
// fermé). Cette fonction, avec le service role :
//   1. applique la limite de débit de 0007 (`edge_rate_limits`, par IP) ;
//   2. normalise le téléphone en E.164 et refuse ce qui n'en est pas un ;
//   3. refuse un doublon (même téléphone, même besoin, dans les 24 h) en
//      renvoyant l'identifiant déjà connu, sans rien réécrire ;
//   4. génère l'identifiant elle-même, résout la branche dans `branches`
//      (la Maison phare par défaut : jamais un identifiant écrit en dur) ;
//   5. écrit la ligne dans `demandes`, puis alerte le personnel.
// Le navigateur ne choisit ni l'identifiant, ni le statut, ni la date.
//
// Déployez via le tableau de bord (Edge Functions → New function → coller ce
// fichier EN ENTIER). Secrets : SERVICE_KEY (comme push-notify) ; pour l'alerte,
// VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (les mêmes que push-notify).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
/* La clé service : CLE_SERVICE (la famille sb_secret, depuis la rotation du
   7 septembre), sinon SERVICE_KEY comme push-notify, sinon celle de la plateforme. */
const SERVICE_KEY = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@maison-mnd.bj';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/* ── La limite de débit, la même que le tunnel (0007) ─────────────── */
const RATE_BUCKET = 'demandes';
const RATE_MAX = 6;          // 6 dépôts…
const RATE_WINDOW_MIN = 10;  // …par 10 minutes et par IP

const ipOf = (req: Request): string =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';

async function allowRate(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
  const { count, error } = await admin
    .from('edge_rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('bucket', RATE_BUCKET).eq('ip', ip).gte('at', since);
  if (error) return true; // table absente : ne pas bloquer
  if ((count ?? 0) >= RATE_MAX) return false;
  await admin.from('edge_rate_limits').insert({ bucket: RATE_BUCKET, ip });
  return true;
}

/* ── Le téléphone, en E.164 ─────────────────────────────────────────
   Même règle que `shared/demandes.ts` côté Trône : les chiffres seuls ; un
   numéro déjà international garde son indicatif ; un numéro local béninois
   (8 chiffres à l'ancienne, 10 depuis 2024) reçoit +229 ; en dessous de
   8 chiffres, ce n'est pas un numéro. */
function telephoneNormalise(brut: string, dial = '+229'): string {
  const t = String(brut ?? '').trim();
  const international = t.startsWith('+') || t.startsWith('00');
  const chiffres = t.replace(/\D/g, '').replace(/^00/, '');
  if (chiffres.length < 8) return '';
  if (international) return chiffres.length >= 10 ? `+${chiffres}` : '';
  const indicatif = dial.replace(/\D/g, '');
  if (chiffres.length > 10 && chiffres.startsWith(indicatif)) return `+${chiffres}`;
  /* Huit chiffres à l'ancienne : tout numéro béninois en a dix depuis 2024,
     le 01 s'ajoute, comme le fait `numeroWa` côté Maison. */
  if (indicatif === '229' && chiffres.length === 8) return `+22901${chiffres}`;
  return `+${indicatif}${chiffres}`;
}

const GENRES = new Set(['prospect', 'rdv']);
const BESOINS = new Set(['creation', 'reparation', 'entretien', 'enfant', 'formation', 'inconnu']);
const texte = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

async function brancheParDefaut(voulue: string): Promise<string> {
  const { data: rows } = await admin.from('branches').select('id, data');
  const branches = (rows ?? []) as { id: string; data?: { flagship?: boolean; status?: string } }[];
  if (voulue && branches.some((b) => b.id === voulue)) return voulue;
  const phare = branches.find((b) => b.data?.flagship && b.data?.status !== 'paused');
  return phare?.id ?? branches[0]?.id ?? 'maison';
}

async function alerteLePersonnel(titre: string, corps: string): Promise<number> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return 0;
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
  const { data: staff } = await admin.from('staff').select('user_id');
  const ids = (staff ?? []).map((s: { user_id: string }) => s.user_id);
  if (ids.length === 0) return 0;
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth,client_id').in('client_id', ids);
  let n = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: titre, body: corps, url: '/trone/#/demandes', tag: 'mnd-staff' }),
      );
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!(await allowRate(ipOf(req)))) return json({ error: 'rate_limited' }, 429);

  const corps = await req.text();
  if (corps.length > 5_000) return json({ error: 'too_large' }, 400);
  let body: Record<string, unknown>;
  try { body = JSON.parse(corps); } catch { return json({ error: 'bad_request' }, 400); }

  const genre = String(body.genre ?? 'prospect');
  const d = (body.data ?? {}) as Record<string, unknown>;
  if (!GENRES.has(genre)) return json({ error: 'genre' }, 400);
  if (d.consentement !== true) return json({ error: 'consentement' }, 400);

  const telephone = telephoneNormalise(String(d.telephone ?? ''), String(d.dial ?? '+229'));
  if (!telephone) return json({ error: 'telephone' }, 400);
  const besoin = BESOINS.has(String(d.besoin)) ? String(d.besoin) : 'inconnu';
  const prenom = texte(d.prenom, 60);
  const email = texte(d.email, 120).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'email' }, 400);

  /* Le doublon : même numéro, même besoin, dans les 24 h. On rend l'identifiant
     connu, la Maison n'a qu'une ligne à rappeler. */
  const depuis = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: memes } = await admin
    .from('demandes').select('id, data')
    .eq('data->>telephone', telephone).eq('data->>besoin', besoin).gte('updated_at', depuis).limit(1);
  if (memes && memes.length > 0) return json({ ok: true, id: memes[0].id, deja: true });

  const id = `dem-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const branchId = await brancheParDefaut(String(d.branchId ?? ''));
  const demande = {
    id,
    genre,
    createdAt: now,
    branchId,
    prenom,
    telephone,
    ...(email ? { email } : {}),
    besoin,
    ...(d.profil ? { profil: texte(d.profil, 80) } : {}),
    ...(d.mot ? { mot: texte(d.mot, 1000) } : {}),
    source: 'site',
    ...(d.page ? { page: texte(d.page, 120) } : {}),
    ...(d.campagne ? { campagne: texte(d.campagne, 80) } : {}),
    consentementLe: now,
    statut: 'nouvelle',
  };
  const { error } = await admin.from('demandes').insert({ id, genre, branch_id: branchId, data: demande });
  if (error) return json({ error: 'insert_failed' }, 500);

  const sent = await alerteLePersonnel(
    genre === 'rdv' ? 'Demande de rendez-vous depuis le site' : 'Nouvelle demande depuis le site',
    `${prenom || 'Une visiteuse'} · ${besoin}`,
  ).catch(() => 0);
  return json({ ok: true, id, sent });
});
