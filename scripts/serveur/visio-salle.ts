/* ══ VISIO-SALLE — 13 novembre 2026 (la Consultation, lot 3) ══════════════
   La visio gratuite de quinze minutes : les créneaux, la réservation, la
   salle qui se ferme d'elle-même. Règles : `src/shared/visio-pur.ts`.

   CE QU'ELLE FAIT, PAR GESTE (corps JSON `{ geste, … }`) :
     · creneaux      (public)            les quarts d'heure libres ;
     · reserver      (public, limité)    pose la visio, rend son lien d'entrée ;
     · etat          (public, par jeton) l'heure, l'état, le résumé une fois fermée ;
     · entrer        (public, par jeton) ouvre la salle et rend l'entrée de la cliente ;
     · annuler       (public, par jeton) avant l'heure seulement ;
     · entrer-maison (session de l'équipe) l'entrée de la Maison, propriétaire de la salle.

   LE SERVEUR COUPE, PAS LE NAVIGATEUR : la salle naît chez Daily avec
   `exp` = début + 15 min et `eject_at_room_exp`, et chaque entrée porte un
   jeton qui expire à la même seconde (`eject_at_token_exp`).

   SANS CLÉ DAILY, rien ne s'ouvre : `creneaux` répond `actif: false` et le
   site ne propose pas la visio. Le jeton du lien d'entrée n'est gardé qu'en
   empreinte (SHA-256) : la base ne peut pas le rendre.

   AUCUN SECRET ICI : SUPABASE_URL, CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   et DAILY_API_KEY viennent de l'environnement. Aucun nom de domaine écrit :
   l'adresse de la salle est celle que Daily rend. */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  AVANT_L_ENTREE_MIN, FORME_DE_L_ID, FORME_DE_LA_CONSULTATION, FORME_DU_JETON,
  cheminDeLaSalle, creneauValide, creneauxOuverts, finDe, numeroCourt, reglagesSurs, resumeSur,
  type ReglagesDeLaVisio,
} from '../../src/shared/visio-pur';

declare const Deno: {
  env: { get(nom: string): string | undefined };
  serve(f: (req: Request) => Promise<Response>): void;
};

/* 2026-11-13-a : la première salle (lot 3 de la Consultation). */
const VERSION = '2026-11-13-a';
const DAILY = 'https://api.daily.co/v1';
/** La limite du public : six réservations par dix minutes et par adresse. */
const LIMITE = { seau: 'visio', max: 6, fenetreMin: 10 };
/** Un appel à Daily ne pend jamais au-delà. */
const DAILY_MAX_MS = 8_000;

// deno-lint-ignore no-explicit-any
type Base = any;
type Ligne = {
  id: string; consultation_id: string | null; debut: string; fin: string; nom: string; telephone: string;
  jeton_hash: string; statut: string; salle: string | null; salle_url: string | null; resume: unknown;
};

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};
const json = (corps: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify({ version: VERSION, maintenant: new Date().toISOString(), ...corps }), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const dis = (quoi: string, plus: Record<string, unknown> = {}) => console.log(JSON.stringify({ fonction: 'visio-salle', quoi, ...plus }));

/* ── Les petites pièces ─────────────────────────────────────────────── */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function aleatoire(n: number, alphabet = ALPHABET): string {
  const o = new Uint8Array(n);
  crypto.getRandomValues(o);
  return [...o].map((b) => alphabet[b % alphabet.length]).join('');
}
async function empreinte(jeton: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(jeton));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const prenomDe = (nom: string): string => String(nom ?? '').trim().split(/\s+/)[0]?.slice(0, 40) ?? '';
const ipDe = (req: Request): string => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'inconnue';

async function reglages(sb: Base): Promise<ReglagesDeLaVisio> {
  const { data } = await sb.from('documents').select('data').eq('key', 'mnd_visio').maybeSingle();
  return reglagesSurs(data?.data);
}

/** Les débuts déjà pris (toute visio non annulée, à venir). */
async function prisDepuis(sb: Base, depuis: string): Promise<string[]> {
  const { data } = await sb.from('visios').select('debut').neq('statut', 'annulée').gte('debut', depuis).limit(1000);
  return ((data ?? []) as { debut: string }[]).map((l) => l.debut);
}

async function permis(sb: Base, ip: string): Promise<boolean> {
  const depuis = new Date(Date.now() - LIMITE.fenetreMin * 60_000).toISOString();
  const { count, error } = await sb.from('edge_rate_limits').select('*', { count: 'exact', head: true })
    .eq('bucket', LIMITE.seau).eq('ip', ip).gte('at', depuis);
  if (error) return true; // table absente : ne pas casser la réservation
  if ((count ?? 0) >= LIMITE.max) return false;
  await sb.from('edge_rate_limits').insert({ bucket: LIMITE.seau, ip });
  return true;
}

/** La visio d'un lien d'entrée, si le jeton est le bon. */
async function parLeJeton(sb: Base, id: unknown, jeton: unknown): Promise<Ligne | null> {
  if (typeof id !== 'string' || typeof jeton !== 'string' || !FORME_DE_L_ID.test(id) || !FORME_DU_JETON.test(jeton)) return null;
  const { data } = await sb.from('visios').select('*').eq('id', id).maybeSingle();
  const l = data as Ligne | null;
  if (!l) return null;
  return l.jeton_hash === (await empreinte(jeton)) ? l : null;
}

/** La porte de l'équipe : une session d'un membre du personnel. */
async function delEquipe(sb: Base, req: Request): Promise<string | null> {
  const cle = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!cle) return null;
  const { data: lu } = await sb.auth.getUser(cle);
  const uid = lu?.user?.id;
  if (!uid) return null;
  const { data: staff } = await sb.from('staff').select('user_id').eq('user_id', uid).maybeSingle();
  return staff ? uid : null;
}

/* ── Daily ──────────────────────────────────────────────────────────── */

async function daily(cle: string, chemin: string, corps?: unknown): Promise<{ ok: boolean; status: number; d: Record<string, unknown> }> {
  const ctl = new AbortController();
  const minuterie = setTimeout(() => ctl.abort(), DAILY_MAX_MS);
  try {
    const r = await fetch(`${DAILY}${chemin}`, {
      method: corps === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'content-type': 'application/json' },
      ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
      signal: ctl.signal,
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: r.ok, status: r.status, d };
  } finally {
    clearTimeout(minuterie);
  }
}

/** La salle de cette visio : créée une fois, avec sa fin fixée d'avance. */
async function laSalle(sb: Base, cle: string, l: Ligne): Promise<{ nom: string; url: string }> {
  if (l.salle && l.salle_url) return { nom: l.salle, url: l.salle_url };
  const nom = `mnd-${l.id}`;
  const exp = Math.floor(Date.parse(l.fin) / 1000);
  const nbf = Math.floor((Date.parse(l.debut) - AVANT_L_ENTREE_MIN * 60_000) / 1000);
  let r = await daily(cle, '/rooms', {
    name: nom, privacy: 'private',
    properties: { nbf, exp, eject_at_room_exp: true, max_participants: 3, enable_chat: false, lang: 'fr' },
  });
  if (!r.ok) r = await daily(cle, `/rooms/${nom}`); // déjà créée par un appel d'avant
  const url = typeof r.d.url === 'string' ? r.d.url : '';
  if (!r.ok || !url) throw new Error(`salle ${r.status}`);
  await sb.from('visios').update({ salle: nom, salle_url: url, maj_le: new Date().toISOString() }).eq('id', l.id);
  return { nom, url };
}

/** Une entrée dans la salle, qui expire à la fermeture. */
async function uneEntree(cle: string, salle: string, fin: string, nom: string, maison: boolean): Promise<string> {
  const r = await daily(cle, '/meeting-tokens', {
    properties: { room_name: salle, exp: Math.floor(Date.parse(fin) / 1000), eject_at_token_exp: true, user_name: nom, is_owner: maison, lang: 'fr' },
  });
  const t = typeof r.d.token === 'string' ? r.d.token : '';
  if (!r.ok || !t) throw new Error(`jeton ${r.status}`);
  return t;
}

/** Ouvre la salle et rend l'adresse d'entrée, dans la fenêtre seulement. */
async function entre(sb: Base, cle: string, l: Ligne, nom: string, maison: boolean): Promise<Response> {
  const maintenant = Date.now();
  if (l.statut === 'annulée') return json({ ok: false, motif: 'annulee' });
  if (maintenant >= Date.parse(l.fin)) return json({ ok: false, motif: 'fermee', resume: resumeSur(l.resume) });
  if (maintenant < Date.parse(l.debut) - AVANT_L_ENTREE_MIN * 60_000) return json({ ok: false, motif: 'trop-tot', debut: l.debut, fin: l.fin });
  const salle = await laSalle(sb, cle, l);
  const jeton = await uneEntree(cle, salle.nom, l.fin, nom, maison);
  dis('entrée', { id: l.id, maison });
  return json({ ok: true, url: `${salle.url}?t=${encodeURIComponent(jeton)}`, debut: l.debut, fin: l.fin });
}

/* ── La fonction ────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method === 'GET') return json({ ok: true, fonction: 'visio-salle' });
  if (req.method !== 'POST') return json({ ok: false, motif: 'POST seulement' }, 405);
  const url = (Deno.env.get('SUPABASE_URL') ?? '').trim();
  const service = (Deno.env.get('CLE_SERVICE') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '').trim();
  const cle = (Deno.env.get('DAILY_API_KEY') ?? '').trim();
  if (!url || !service) return json({ ok: false, motif: 'environnement' }, 500);
  const sb: Base = createClient(url, service);
  let corps: Record<string, unknown> = {};
  try { corps = (await req.json()) as Record<string, unknown>; } catch { /* corps vide */ }
  const geste = String(corps.geste ?? '');

  try {
    if (geste === 'creneaux') {
      const r = await reglages(sb);
      const actif = r.actif && !!cle;
      const maintenant = Date.now();
      const creneaux = actif ? creneauxOuverts(r, maintenant, await prisDepuis(sb, new Date(maintenant).toISOString())) : [];
      return json({ ok: true, actif, cle: !!cle, creneaux });
    }

    if (geste === 'reserver') {
      const r = await reglages(sb);
      if (!r.actif || !cle) return json({ ok: false, motif: 'fermee' }, 409);
      const nom = String(corps.nom ?? '').trim().slice(0, 80);
      const telephone = String(corps.telephone ?? '').trim().slice(0, 30);
      const debut = String(corps.debut ?? '');
      const consultationId = typeof corps.consultationId === 'string' && FORME_DE_LA_CONSULTATION.test(corps.consultationId) ? corps.consultationId : null;
      if (nom.length < 2 || numeroCourt(telephone).length < 8 || !Number.isFinite(Date.parse(debut))) return json({ ok: false, motif: 'incomplet' }, 400);
      if (!(await permis(sb, ipDe(req)))) return json({ ok: false, motif: 'rate_limited' }, 429);
      const maintenant = Date.now();
      const debutIso = new Date(Date.parse(debut)).toISOString();
      if (!creneauValide(r, maintenant, await prisDepuis(sb, new Date(maintenant).toISOString()), debutIso)) return json({ ok: false, motif: 'pris' }, 409);
      const { count } = await sb.from('visios').select('*', { count: 'exact', head: true })
        .eq('numero', numeroCourt(telephone)).eq('statut', 'réservée').gte('fin', new Date(maintenant).toISOString());
      if ((count ?? 0) >= r.parTelephone) return json({ ok: false, motif: 'deja' }, 409);
      const id = `vz-${aleatoire(12, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
      const jeton = aleatoire(32);
      const { error } = await sb.from('visios').insert({
        id, consultation_id: consultationId, debut: debutIso, fin: finDe(debutIso), nom, telephone, numero: numeroCourt(telephone),
        jeton_hash: await empreinte(jeton), statut: 'réservée',
      });
      if (error) return json({ ok: false, motif: /duplicate|unique/i.test(String(error.message)) ? 'pris' : 'ecriture' }, 409);
      /* La consultation déposée garde la trace de sa visio (file B du Trône). */
      if (consultationId) {
        const { data: row } = await sb.from('consultations_queue').select('id, data').eq('id', consultationId).maybeSingle();
        if (row) await sb.from('consultations_queue').update({ data: { ...(row.data ?? {}), visio: { id, debut: debutIso } } }).eq('id', consultationId);
      }
      dis('réservée', { id, debut: debutIso, consultation: !!consultationId });
      return json({ ok: true, id, jeton, debut: debutIso, fin: finDe(debutIso), chemin: cheminDeLaSalle(id, jeton) });
    }

    if (geste === 'etat' || geste === 'entrer' || geste === 'annuler') {
      const l = await parLeJeton(sb, corps.id, corps.jeton);
      if (!l) return json({ ok: false, motif: 'inconnue' }, 404);
      if (geste === 'etat') {
        /* Le résumé se lit une fois la salle fermée, jamais pendant : la Maison le relit jusqu'à la fin. */
        const fermee = Date.now() >= Date.parse(l.fin);
        return json({
          ok: true, debut: l.debut, fin: l.fin, statut: l.statut, prenom: prenomDe(l.nom), consultationId: l.consultation_id,
          resume: fermee ? resumeSur(l.resume) : null, actif: !!cle,
        });
      }
      if (geste === 'annuler') {
        if (l.statut !== 'réservée' || Date.now() >= Date.parse(l.debut)) return json({ ok: false, motif: 'trop-tard' }, 409);
        await sb.from('visios').update({ statut: 'annulée', maj_le: new Date().toISOString() }).eq('id', l.id);
        dis('annulée par la cliente', { id: l.id });
        return json({ ok: true });
      }
      if (!cle) return json({ ok: false, motif: 'sans-service' }, 503);
      return await entre(sb, cle, l, prenomDe(l.nom) || 'Cliente', false);
    }

    if (geste === 'entrer-maison') {
      if (!(await delEquipe(sb, req))) return json({ ok: false, motif: 'reserve-a-l-equipe' }, 403);
      if (typeof corps.id !== 'string' || !FORME_DE_L_ID.test(corps.id)) return json({ ok: false, motif: 'inconnue' }, 404);
      const { data } = await sb.from('visios').select('*').eq('id', corps.id).maybeSingle();
      if (!data) return json({ ok: false, motif: 'inconnue' }, 404);
      if (!cle) return json({ ok: false, motif: 'sans-service' }, 503);
      return await entre(sb, cle, data as Ligne, 'Maison MND', true);
    }

    return json({ ok: false, motif: 'geste inconnu' }, 400);
  } catch (e) {
    dis('erreur', { geste, motif: String((e as Error)?.message ?? e).slice(0, 120) });
    return json({ ok: false, motif: 'erreur' }, 500);
  }
});
