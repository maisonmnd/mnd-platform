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

async function sendToStaff(payload: Payload): Promise<number> {
  // Abonnements du personnel : client_id figurant dans la table staff.
  const { data: staff } = await admin.from('staff').select('user_id');
  const ids = (staff ?? []).map((s: { user_id: string }) => s.user_id);
  if (ids.length === 0) return 0;
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth,client_id')
    .in('client_id', ids);
  if (!subs || subs.length === 0) return 0;
  let n = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ url: '/trone/', ...payload }),
      );
      n++;
    } catch (e) {
      const code = (e as { statusCode?: number })?.statusCode;
      if (code === 404 || code === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    }
  }
  return n;
}

async function broadcastToClients(payload: Payload): Promise<number> {
  // Toute personne ayant une FICHE CLIENTE (inclut un souverain qui utilise aussi
  // Ma Couronne). On ne diffuse pas aux abonnements purement personnel (sans fiche).
  const { data: clientRows } = await admin.from('clients').select('id');
  const clientIds = new Set((clientRows ?? []).map((c: { id: string }) => c.id));
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint,p256dh,auth,client_id');
  if (!subs || subs.length === 0) return 0;
  let n = 0;
  for (const s of subs) {
    if (!clientIds.has(s.client_id)) continue;
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

async function runStaffCron(): Promise<number> {
  // Balaye les RDV : ceux qui commencent dans ≤ 1h alertent le personnel (une fois).
  const { data: appts } = await admin.from('appointments').select('id,data');
  if (!appts) return 0;
  const { data: clientRows } = await admin.from('clients').select('id,data');
  const nameOf = new Map<string, string>(
    (clientRows ?? []).map((r: { id: string; data: { name?: string } }) => [r.id, r.data?.name ?? '']),
  );
  const now = Date.now();
  let sent = 0;
  for (const row of appts as { id: string; data: Record<string, unknown> }[]) {
    const a = row.data;
    if (!a) continue;
    const status = a.status as string;
    if (status === 'annulé' || status === 'honoré') continue;
    const date = a.date as string;
    const time = (a.time as string) || '09:00';
    if (!date) continue;
    const when = new Date(`${date}T${time}:00${TZ_OFFSET}`).getTime();
    const diffMin = (when - now) / 60_000;
    if (!(diffMin > 0 && diffMin <= 60)) continue;
    const ref = (a.id as string) ?? row.id;
    const { data: seen } = await admin.from('push_reminders').select('appointment_id').eq('appointment_id', ref).eq('kind', 'staff-h1').maybeSingle();
    if (seen) continue;
    const who = nameOf.get(a.clientId as string) || (a.clientName as string) || 'une tête couronnée';
    const n = await sendToStaff({
      title: 'Rendez-vous dans moins d’1h',
      body: `${who} · ${date} à ${time}`,
      url: '/trone/#/calendrier',
      tag: `staff-h1-${ref}`,
    });
    await admin.from('push_reminders').insert({ appointment_id: ref, kind: 'staff-h1' });
    sent += n;
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  // Modes cron (rappels clientes + RDV personnel dans 1h). Pas de secret requis :
  // la passerelle exige déjà la clé publishable, et ces balayages sont idempotents
  // (journal push_reminders + fenêtre horaire) — les rejouer est sans effet.
  if (body.mode === 'reminders') return json({ sent: await runReminders() });
  if (body.mode === 'staff-cron') return json({ sent: await runStaffCron() });

  // Mode diffusion — annonce (offre/promo) à TOUTES les clientes. Réservé au personnel.
  if (body.mode === 'broadcast') {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'forbidden' }, 403);
    const { data: staffRow } = await admin.from('staff').select('user_id').eq('user_id', uid).maybeSingle();
    if (!staffRow) return json({ error: 'forbidden' }, 403);
    return json({ sent: await broadcastToClients({
      title: (body.title as string) || 'Maison MND',
      body: (body.body as string) ?? '',
      url: (body.url as string) ?? '/couronne/',
      tag: 'mnd-offre',
    }) });
  }

  // Mode ciblé — le personnel notifie UNE cliente précise (ex. cadeau anniversaire).
  // Robuste : on cible l'id fourni ET toute fiche ayant le même e-mail (fiches en double).
  if (body.mode === 'to-client') {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data: userData } = await admin.auth.getUser(jwt);
    const uid = userData?.user?.id;
    if (!uid) return json({ error: 'forbidden' }, 403);
    const { data: staffRow } = await admin.from('staff').select('user_id').eq('user_id', uid).maybeSingle();
    if (!staffRow) return json({ error: 'forbidden' }, 403);
    const target = body.clientId as string;
    const email = ((body.email as string) || '').trim().toLowerCase();
    const ids = new Set<string>();
    if (target) ids.add(target);
    if (email) {
      const { data: rows } = await admin.from('clients').select('id,data');
      for (const r of (rows ?? []) as { id: string; data: { email?: string } }[]) {
        if ((r.data?.email || '').trim().toLowerCase() === email) ids.add(r.id);
      }
    }
    if (ids.size === 0) return json({ error: 'bad request' }, 400);
    const payload = {
      title: (body.title as string) || 'Maison MND',
      body: (body.body as string) ?? '',
      url: (body.url as string) ?? '/couronne/',
      tag: 'mnd-cadeau',
    };
    let sent = 0;
    for (const id of ids) sent += await sendToClient(id, payload);
    return json({ sent });
  }

  // Mode personnel — notifie tout le personnel (consultation reçue, réservation, inscription…).
  // Appelable par le tunnel public de consultation et par les clientes ; charge utile figée.
  if (body.mode === 'staff') {
    const title = (body.title as string) || 'Maison MND';
    return json({ sent: await sendToStaff({
      title,
      body: (body.body as string) ?? '',
      url: (body.url as string) ?? '/trone/',
      tag: 'mnd-staff',
    }) });
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
