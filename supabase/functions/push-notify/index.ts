// Supabase Edge Function — push-notify
// Deux modes :
//   • immédiat : POST { clientId, title, body, url }  → notif à la cliente (elle-même).
//   • rappels  : POST { mode: 'reminders' } + header x-cron-secret → balaye les RDV à venir.
// Déployez via le dashboard (Edge Functions → New function → coller ce code),
// puis définissez les secrets : VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT, CRON_SECRET.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contact@maison-mnd.bj';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
// Fuseau de la maison (Bénin = +01:00) pour caler les rappels sur l'heure locale.
const TZ_OFFSET = Deno.env.get('TZ_OFFSET') ?? '+01:00';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type Payload = { title: string; body: string; url?: string; tag?: string };

async function sendToClient(clientId: string, payload: Payload): Promise<number> {
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth').eq('client_id', clientId);
  if (!subs || subs.length === 0) return 0;
  let n = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ url: '/couronne/', ...payload }),
      );
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return n;
}

async function runReminders(): Promise<number> {
  const { data: appts } = await admin.from('appointments').select('id,data');
  if (!appts) return 0;
  const now = Date.now();
  let sent = 0;
  for (const row of appts as { id: string; data: Record<string, unknown> }[]) {
    const a = row.data;
    if (!a) continue;
    const status = a.status as string;
    if (status === 'annulé' || status === 'honoré') continue;
    const date = a.date as string;
    const time = (a.time as string) || '09:00';
    const clientId = a.clientId as string;
    if (!date || !clientId) continue;
    const when = new Date(`${date}T${time}:00${TZ_OFFSET}`).getTime();
    const diffH = (when - now) / 3_600_000;
    let kind: 'j-1' | 'h-2' | null = null;
    if (diffH <= 24 && diffH > 22) kind = 'j-1';
    else if (diffH <= 2 && diffH > 0.4) kind = 'h-2';
    if (!kind) continue;
    const { data: seen } = await admin.from('push_reminders').select('appointment_id').eq('appointment_id', a.id ?? row.id).eq('kind', kind).maybeSingle();
    if (seen) continue;
    const title = kind === 'j-1' ? 'Rappel · demain' : 'Votre rituel approche';
    const body = `Rendez-vous le ${date} à ${time} — la maison vous attend.`;
    const n = await sendToClient(clientId, { title, body, url: '/couronne/#/suivi', tag: `rdv-${row.id}` });
    // On journalise même sans abonnement, pour ne pas re-tenter en boucle.
    await admin.from('push_reminders').insert({ appointment_id: (a.id as string) ?? row.id, kind });
    sent += n;
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // Mode rappels (cron) — protégé par un secret.
  if (body.mode === 'reminders') {
    if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return json({ error: 'forbidden' }, 403);
    return json({ sent: await runReminders() });
  }

  // Mode immédiat — la cliente se notifie elle-même (vérif du JWT).
  const clientId = body.clientId as string;
  const title = body.title as string;
  if (!clientId || !title) return json({ error: 'bad request' }, 400);
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data: userData } = await admin.auth.getUser(jwt);
  if (!userData?.user || userData.user.id !== clientId) return json({ error: 'forbidden' }, 403);

  const n = await sendToClient(clientId, {
    title,
    body: (body.body as string) ?? '',
    url: (body.url as string) ?? '/couronne/#/suivi',
    tag: 'mnd-rdv',
  });
  return json({ sent: n });
});
