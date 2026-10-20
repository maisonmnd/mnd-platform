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
const VERSION = '2026-10-20-b';

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

/* LE TEXTE D'ORIGINE AUSSI — 20 octobre 2026. Google rend les avis traduits
   en français (`languageCode=fr`) : un avis écrit en anglais arrivait donc en
   français, et sa réponse proposée au Trône serait partie en français
   (« répondre dans la langue de l'avis », choix de Yéman au sélecteur).
   On garde désormais, à côté, le texte tel que l'auteur l'a écrit et sa
   langue. `texte` NE CHANGE PAS : il est la clé des avis cochés pour le site
   (Vitrines › Site public), et le changer décocherait ses choix. Les deux
   champs ne paraissent que si Google les donne ; un avis déjà en français
   les porte aussi, identiques. */
type AvisGoogle = {
  auteur: string;
  note: number;
  texte: string;
  quand: string;
  photo?: string;
  texteOriginal?: string;
  langueOriginale?: string;
  publieLe?: string;
  ref?: string;
  lien?: string;
};

/* LE JOUR, LA RÉFÉRENCE, LE LIEN — 20 octobre 2026, version b. « À partir
   d'aujourd'hui lier un avis à une fiche » (Yéman) : le Trône propose la
   cliente d'après le JOUR où l'avis a été publié (`publishTime` de Google,
   gardé en `publieLe`) ; « il y a 3 jours » ne suffisait pas. `ref` est le
   nom de l'avis chez Google (stable), `lien` son adresse sur Maps (le
   bouton « Ouvrir l'avis sur Google » y mène droit). `texte` NE CHANGE
   TOUJOURS PAS : il reste la clé des avis cochés et des brouillons. */

// ── DEBUT alerteDesAvis
/* PRÉVENIR LA DIRECTION D'UN AVIS DE 1 À 3 ÉTOILES — 20 octobre 2026
   (maquette DNVVXdkd…, choix « Prévenir la direction »). Un avis est NOUVEAU
   s'il n'était pas dans le relevé d'avant (par sa référence, ou par auteur
   et texte quand le relevé d'avant n'en portait pas) ni déjà signalé. Le
   tout premier relevé ne prévient de rien : il n'a pas d'« avant ». Un avis
   publié avant le 20 octobre 2026 ne prévient pas. L'alerte dit le prénom et
   les étoiles, JAMAIS le texte : un écran verrouillé se lit par-dessus
   l'épaule. */
type AvisPourLAlerte = { auteur: string; note: number; texte: string; ref?: string; publieLe?: string };
const DEPART_DES_ALERTES = '2026-10-20';
const NOTE_QUI_ALERTE = 3;
const ALERTES_GARDEES = 50;
const parAuteurEtTexte = (a: AvisPourLAlerte): string => `${a.auteur}\u0000${a.texte}`;
const cleDAlerte = (a: AvisPourLAlerte): string => a.ref || parAuteurEtTexte(a);

function avisQuiAlertent(avant: AvisPourLAlerte[] | null, apres: AvisPourLAlerte[], dejaAlertes: string[]): AvisPourLAlerte[] {
  if (!avant) return [];
  const connus = new Set<string>([...avant.map(cleDAlerte), ...avant.map(parAuteurEtTexte), ...dejaAlertes]);
  return apres.filter((a) => {
    const note = Number(a.note);
    if (!(note > 0 && note <= NOTE_QUI_ALERTE)) return false;
    if (connus.has(cleDAlerte(a)) || connus.has(parAuteurEtTexte(a))) return false;
    const jour = String(a.publieLe ?? '').slice(0, 10);
    return !jour || jour >= DEPART_DES_ALERTES;
  });
}

function alerteDeLaDirection(nouveaux: AvisPourLAlerte[]): { title: string; body: string; url: string } | null {
  if (nouveaux.length === 0) return null;
  const url = '/trone/#/vitrine?onglet=avis';
  if (nouveaux.length === 1) {
    const a = nouveaux[0];
    const n = Math.round(Number(a.note));
    const etoiles = `${n} étoile${n > 1 ? 's' : ''}`;
    const prenom = String(a.auteur ?? '').trim().split(/\s+/)[0] || 'Quelqu’un';
    return { title: `Un avis Google de ${etoiles}`, body: `${prenom} vient de laisser ${etoiles} sur Google. Ouvrez le Trône pour le lire et répondre.`, url };
  }
  return { title: `${nouveaux.length} avis Google de 1 à 3 étoiles`, body: 'Ouvrez le Trône pour les lire et répondre.', url };
}

const alertesGardees = (deja: string[], nouveaux: AvisPourLAlerte[]): string[] =>
  [...deja, ...nouveaux.map(cleDAlerte)].slice(-ALERTES_GARDEES);
// ── FIN alerteDesAvis

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
      ...(String(r.originalText?.text ?? '').trim() ? { texteOriginal: String(r.originalText.text).trim() } : {}),
      ...(String(r.originalText?.languageCode ?? '').trim() ? { langueOriginale: String(r.originalText.languageCode).trim() } : {}),
      ...(String(r.publishTime ?? '').trim() ? { publieLe: String(r.publishTime).trim() } : {}),
      ...(String(r.name ?? '').trim() ? { ref: String(r.name).trim() } : {}),
      ...(/^https:\/\//.test(String(r.googleMapsUri ?? '')) ? { lien: String(r.googleMapsUri) } : {}),
    }));

  /* Le relevé d'avant : de quoi reconnaître un avis nouveau, et les avis
     déjà signalés à la direction. Illisible : on relève quand même, sans
     prévenir (mieux vaut une alerte manquée qu'une rafale). */
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: avantRow, error: errAvant } = await admin.from('documents').select('data').eq('key', 'mnd_avis_google').maybeSingle();
  const avantDoc = (avantRow?.data ?? null) as { avis?: AvisPourLAlerte[]; alertes?: string[] } | null;
  const avant = !errAvant && avantDoc && Array.isArray(avantDoc.avis) ? avantDoc.avis : null;
  const dejaAlertes = Array.isArray(avantDoc?.alertes) ? avantDoc!.alertes!.filter((x) => typeof x === 'string') : [];
  const nouveaux = avisQuiAlertent(avant, avis, dejaAlertes);

  const doc = {
    note: Number(place.rating ?? 0),
    nombre: Number(place.userRatingCount ?? 0),
    avis,
    fiche: String(place.googleMapsUri ?? ''),
    ecrire: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(PLACE_ID)}`,
    misAJourLe: new Date().toISOString(),
    alertes: alertesGardees(dejaAlertes, nouveaux),
  };
  const { error } = await admin.from('documents').upsert({ key: 'mnd_avis_google', data: doc });
  if (error) return json({ error: 'upsert_failed', detail: error.message }, 500);

  /* L'alerte part APRÈS l'écriture : un relevé qui échoue ne prévient pas
     d'un avis qu'il n'a pas gardé. Elle passe par push-notify (mode
     « direction », la clé service en guise de porte) et ne fait jamais
     échouer le relevé. */
  let alerte = 0;
  const message = alerteDeLaDirection(nouveaux);
  if (message) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/push-notify`, {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ mode: 'direction', ...message }),
      });
      alerte = Number(((await r.json().catch(() => ({}))) as { sent?: number }).sent ?? 0) || 0;
    } catch { /* une alerte manquée ne casse pas le relevé */ }
  }
  return json({ ok: true, version: VERSION, note: doc.note, nombre: doc.nombre, avis: avis.length, nouveauxBas: nouveaux.length, alerte });
});
