// deno-lint-ignore-file no-explicit-any
// Supabase Edge Function — avis-google-releve
//
// LES AVIS GOOGLE, TELS QUELS — 17 septembre 2026. « Insérer les avis Google »
// (Yéman). Le site public ne les invente pas, et ne les demande pas à Google
// depuis le navigateur : la clé serait dans le bundle. Cette fonction les
// relit chez Google (Places API, nouvelle version) et les pose dans le
// document `mnd_avis_google`, lisible sans compte (liste blanche de 0108).
// Google ne rend que ses cinq avis « les plus pertinents » : c'est ce que le
// site montre, avec la note et le nombre total, et les deux liens (voir la
// fiche, écrire un avis).
//
// À appeler par un cron (Supabase → Cron, toutes les 12 h) ou à la main.
// Secrets : SERVICE_KEY ; GOOGLE_PLACES_KEY (clé API, restreinte à Places) ;
// GOOGLE_PLACE_ID (l'identifiant de la fiche de la Maison) ; CRON_SECRET.
//
// LA PORTE EST FERMÉE PAR DÉFAUT — 10 octobre 2026 (revue de nuit). Le secret
// était « facultatif » : sans lui, n'importe quel porteur de la clé publique
// déclenchait à chaque appel une requête Places facturée et réécrivait
// mnd_avis_google. Désormais l'appel doit porter SOIT l'en-tête x-cron-secret
// égal à CRON_SECRET, SOIT la clé service en Authorization (comme
// confirmation-rdv) ; sans l'un des deux, 403. Le cron des douze heures
// envoie donc l'un ou l'autre : la planification qui n'appelait qu'avec la
// clé publique reçoit 403 tant qu'elle n'a pas été réglée.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
/* La clé service : CLE_SERVICE (la famille sb_secret, depuis la rotation du
   7 septembre), sinon SERVICE_KEY comme push-notify, sinon celle de la plateforme. */
const SERVICE_KEY = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SERVICE_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
const PLACES_KEY = Deno.env.get('GOOGLE_PLACES_KEY') ?? '';
const PLACE_ID = Deno.env.get('GOOGLE_PLACE_ID') ?? '';
const CRON_SECRET = (Deno.env.get('CRON_SECRET') ?? '').trim();

/** La version de ce fichier, rendue dans chaque réponse. */
const VERSION = '2026-10-10-a';

/** Égalité à temps constant : une comparaison naïve fuit le secret par le
    temps de réponse. Une chaîne vide n'est égale à rien. */
const memeSecret = (a: string, b: string): boolean => {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** Le cron (son secret) ou le serveur (la clé service), et personne d'autre. */
const porteLaCle = (req: Request): boolean => {
  if (memeSecret((req.headers.get('x-cron-secret') ?? '').trim(), CRON_SECRET)) return true;
  const recu = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return [Deno.env.get('CLE_SERVICE'), Deno.env.get('SERVICE_KEY'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')]
    .some((cle) => memeSecret(recu, (cle ?? '').trim()));
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

type AvisGoogle = {
  auteur: string;
  note: number;
  texte: string;
  quand: string;
  photo?: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!porteLaCle(req)) return json({ error: 'forbidden', version: VERSION }, 403);
  if (!PLACES_KEY || !PLACE_ID) return json({ error: 'google_non_configure', version: VERSION, places: !!PLACES_KEY, place: !!PLACE_ID }, 500);

  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(PLACE_ID)}?languageCode=fr`, {
    headers: {
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': 'displayName,rating,userRatingCount,reviews,googleMapsUri',
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return json({ error: `google_${res.status}`, detail: detail.slice(0, 200) }, 502);
  }
  const place = await res.json();
  const avis: AvisGoogle[] = ((place.reviews ?? []) as any[])
    .filter((r) => Number(r.rating ?? 0) > 0)
    .map((r) => ({
      auteur: String(r.authorAttribution?.displayName ?? '').trim(),
      note: Number(r.rating ?? 0),
      texte: String(r.text?.text ?? r.originalText?.text ?? '').trim(),
      quand: String(r.relativePublishTimeDescription ?? '').trim(),
      ...(r.authorAttribution?.photoUri ? { photo: String(r.authorAttribution.photoUri) } : {}),
    }));

  const doc = {
    note: Number(place.rating ?? 0),
    nombre: Number(place.userRatingCount ?? 0),
    avis,
    fiche: String(place.googleMapsUri ?? ''),
    ecrire: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(PLACE_ID)}`,
    misAJourLe: new Date().toISOString(),
  };
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await admin.from('documents').upsert({ key: 'mnd_avis_google', data: doc });
  if (error) return json({ error: 'upsert_failed', detail: error.message }, 500);
  return json({ ok: true, version: VERSION, note: doc.note, nombre: doc.nombre, avis: avis.length });
});
