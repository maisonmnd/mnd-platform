/* ══ VISIO-SALLE — 13 novembre 2026 (la Consultation, lot 3) ══════════════
   La visio gratuite de quinze minutes : les créneaux, la réservation, la
   salle qui se ferme d'elle-même. Règles : `src/shared/visio-pur.ts`.

   CE QU'ELLE FAIT, PAR GESTE (corps JSON `{ geste, … }`) :
     · creneaux        (public)            les quarts d'heure libres ;
     · reserver        (public, limité)    pose la visio ; le lien d'entrée part
                       sur WhatsApp, jamais dans la réponse ;
     · etat            (public, par jeton) l'heure, l'état, ce qu'elle peut encore
                       changer, le résumé une fois la salle fermée ;
     · entrer          (public, par le jeton du lien d'entrée) ouvre la salle ;
     · annuler         (public, par jeton) avant l'heure seulement ;
     · deplacer        (public par jeton, ou session de l'équipe) change l'heure ;
     · suite-vue       (public, par jeton) elle a vu la suite sur sa page ;
     · entrer-maison   (session de l'équipe) l'entrée de la Maison, propriétaire ;
     · nouveau-lien    (session de l'équipe) un lien d'entrée NEUF pour la cliente,
                       qui remplace l'ancien (le jeton n'est gardé qu'en empreinte) ;
     · suite           (session de l'équipe) dépose sur WhatsApp les affiches
                       d'après la visio ;
     · moments-privee  (public)            les moments libres de la consultation privée ;
     · reserver-privee (public, limité)    pose au Carnet la consultation privée réglée.

   LE SERVEUR COUPE, PAS LE NAVIGATEUR : la salle naît chez Daily avec
   `exp` = début + 15 min et `eject_at_room_exp`, et chaque entrée porte un
   jeton qui expire à la même seconde (`eject_at_token_exp`).

   LA VISIO EST LIMITÉE (17 novembre 2026, arbitrage C) : une par numéro tous
   les quatre-vingt-dix jours, les manquées comptent, une visio annulée à
   temps ne compte pas. LE LIEN D'ENTRÉE NE PART QUE PAR WHATSAPP : la
   réservation rend un BILLET (un second jeton, gardé en empreinte lui
   aussi) qui montre l'heure, la change et l'annule, mais n'ouvre jamais la
   salle. Un numéro qui n'est pas le sien n'entre donc pas.

   SANS CLÉ DAILY, rien ne s'ouvre : `creneaux` répond `actif: false` et le
   site ne propose pas la visio.

   AUCUN SECRET ICI : SUPABASE_URL, CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   et DAILY_API_KEY viennent de l'environnement. Aucun nom de domaine écrit :
   l'adresse de la salle est celle que Daily rend, celle des liens est
   l'origine de l'appel. */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  AVANT_L_ENTREE_MIN, FORME_DE_L_ID, FORME_DE_LA_CONSULTATION, FORME_DU_JETON,
  affichesDeLaSuite, changementPermis, changementsRestants, cheminDeLaSalle, creneauDit, creneauDuChangement, creneauValide, creneauxOuverts,
  finDe, heureDite, jourDeCotonou, jourDit, limiteDe, nomDeLaSalle, numeroCourt, reglagesSurs, resumeSur, sansLocksEncore,
  type ReglagesDeLaVisio, type VisioDuNumero,
} from '../../src/shared/visio-pur';
import { facteurVivant, heureDeDepart, reglesDepuis } from '../../src/shared/salle-des-envois';
import { numeroWa } from '../../src/shared/porte-des-modeles-pur';
import { agendaDepuisLesLignes, type AgendaDuServeur } from '../../src/shared/place-du-serveur';
import {
  NOM_DE_LA_VISIO_AU_CARNET, idDeLaDemandeDeLaPrivee, idDuRdvDeLaPrivee, laPriveeTient, momentSur, placesDeLaPrivee, rdvDeLaPrivee,
  type MomentChoisi,
} from '../../src/shared/consultation-privee-pur';
import { PRIX_DE_LA_CONSULTATION_PRIVEE_XOF } from '../../src/shared/estimation-pur';

declare const Deno: {
  env: { get(nom: string): string | undefined };
  serve(f: (req: Request) => Promise<Response>): void;
};

/* 2026-11-17-a : la visio limitée (une par numéro tous les 90 jours), le lien
   par WhatsApp seulement et le billet, changer l'heure (`deplacer`), les
   affiches d'après la visio (`suite`, `suite-vue`), la consultation privée au
   Carnet (`moments-privee`, `reserver-privee`).
   2026-11-14-b : la confirmation sur WhatsApp à la réservation (modèle visio_mnd).
   2026-11-18-b : refaite depuis ses sources après « deux têtes chez Team » (agenda-pur et place-du-serveur, 60603719) :
   la consultation privée lit les places du jour et la tête des créneaux pris, comme le verrou de 0238.
   2026-11-20-a : refaite depuis ses sources après « le petit service partage l'heure » (0240) et « une place par paire » (0242) :
   un rendez-vous d'une heure ou moins partage l'heure et UNE place avec un voisin, comme le verrou. */
const VERSION = '2026-11-20-a';
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
  /* 0216 */
  billet_hash?: string | null; deplacements?: number | null; rdv_id?: string | null; branch_id?: string | null;
  annulee_le?: string | null; annulee_par?: string | null; lien_etat?: string | null; suite_vue_le?: string | null;
};
/** Par quelle porte on parle d'une visio : son lien d'entrée, son billet, ou la Maison. */
type Porte = 'entree' | 'billet' | 'maison';

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
const objet = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

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

/** La visio d'un lien, si le jeton est le bon : celui du lien d'entrée (reçu
    sur WhatsApp), ou celui du billet (rendu à la réservation), qui n'ouvre pas la salle. */
async function parLeJeton(sb: Base, id: unknown, jeton: unknown): Promise<{ l: Ligne; porte: Porte } | null> {
  if (typeof id !== 'string' || typeof jeton !== 'string' || !FORME_DE_L_ID.test(id) || !FORME_DU_JETON.test(jeton)) return null;
  const { data } = await sb.from('visios').select('*').eq('id', id).maybeSingle();
  const l = data as Ligne | null;
  if (!l) return null;
  const h = await empreinte(jeton);
  if (l.jeton_hash === h) return { l, porte: 'entree' };
  if (l.billet_hash && l.billet_hash === h) return { l, porte: 'billet' };
  return null;
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

/** La visio par son identifiant, pour la Maison. */
async function parLId(sb: Base, id: unknown): Promise<Ligne | null> {
  if (typeof id !== 'string' || !FORME_DE_L_ID.test(id)) return null;
  const { data } = await sb.from('visios').select('*').eq('id', id).maybeSingle();
  return (data as Ligne | null) ?? null;
}

/** L'origine de l'appel (le site, Ma Couronne, le Trône : une seule origine), pour écrire un lien. */
function origineDe(req: Request): string {
  const o = (req.headers.get('origin') ?? '').trim();
  return /^https:\/\/[^/\s]+$/.test(o) ? o : '';
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

/** La salle de cette visio : créée une fois pour CETTE heure, avec sa fin fixée
    d'avance. Une visio déplacée perd sa salle (`deplacer`) : la suivante porte
    un autre nom, celui de sa nouvelle heure. */
async function laSalle(sb: Base, cle: string, l: Ligne): Promise<{ nom: string; url: string }> {
  if (l.salle && l.salle_url) return { nom: l.salle, url: l.salle_url };
  const nom = nomDeLaSalle(l.id, l.debut);
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

/* ── Un modèle déposé dans la salle d'attente ───────────────────────────
   « Le numéro n'a reçu ni lien, ni confirmation, ni rien » (Yéman, 14
   novembre 2026). Comme tout envoi automatique de la Maison, un modèle de la
   visio est DÉPOSÉ dans la salle d'attente (`envois`, en-attente, type
   `visio`) : la porte des modèles le juge et le facteur l'envoie à son heure,
   hors des heures calmes. Si le facteur ne donne plus signe de vie, il part
   tout de suite (comme avis-google). Une ligne déjà partie ne se réécrit pas. */
type Depot = {
  id: string; visioId: string; branchId: string | null; debut: string; prenom: string; telephone: string;
  modele: string; composants: unknown[]; texteAuFil: string;
  /** Pas avant cet instant (les affiches d'après la visio attendent sa fin). */
  pasAvantMs?: number;
};
async function deposeLeModele(sb: Base, d: Depot): Promise<string> {
  if (!d.modele) return 'sans-modele';
  const numero = numeroWa(d.telephone);
  if (numero.length < 11) return 'numero';
  const { data: deja } = await sb.from('envois').select('id, data').eq('id', d.id).maybeSingle();
  const statutDeja = String(objet(deja?.data).statut ?? '');
  if (deja && statutDeja !== 'en-attente') return statutDeja || 'deja';
  const colis = { genre: 'whatsapp', numero, modele: d.modele, parQui: 'la Maison, automatiquement', texteAuFil: d.texteAuFil, composants: d.composants };
  const { data: docs } = await sb.from('documents').select('key, data').in('key', ['mnd_auto_config', 'mnd_facteur']);
  const regles = reglesDepuis((docs?.find((x: { key: string }) => x.key === 'mnd_auto_config')?.data ?? {}) as Record<string, unknown>);
  const maintenant = Date.now();
  const salleOuverte = facteurVivant((docs?.find((x: { key: string }) => x.key === 'mnd_facteur')?.data as { vuLe?: string } | undefined)?.vuLe, maintenant);
  const base = {
    id: d.id, branchId: d.branchId, type: 'visio', canal: 'whatsapp', apptId: '', invoiceId: '', clientId: '', visioId: d.visioId,
    dateRdv: jourDeCotonou(Date.parse(d.debut)), heure: heureDite(d.debut), quand: new Date(maintenant).toISOString(), prenom: d.prenom,
  };
  let ligne: Record<string, unknown>;
  if (salleOuverte) {
    const { partA, calme } = heureDeDepart(Math.max(maintenant, d.pasAvantMs ?? 0), regles);
    ligne = { ...base, statut: 'en-attente', deposeLe: new Date(maintenant).toISOString(), partA: new Date(partA).toISOString(), ...(calme ? { calme: true } : {}), colis };
  } else {
    const jeton = (Deno.env.get('WA_TOKEN') ?? '').trim();
    const telId = (Deno.env.get('WA_PHONE_ID') ?? '').trim();
    if (!jeton || !telId) return 'sans-whatsapp';
    let statut = 'échec';
    let detail = '';
    try {
      const r = await fetch(`https://graph.facebook.com/v20.0/${telId}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: numero, type: 'template', template: { name: d.modele, language: { code: 'fr' }, components: d.composants } }),
      });
      if (r.ok) statut = 'envoyé'; else detail = (await r.text()).slice(0, 300);
    } catch (e) {
      detail = String((e as Error)?.message ?? e).slice(0, 300);
    }
    ligne = { ...base, statut, ...(detail ? { detail } : {}), colis };
  }
  const { error } = await sb.from('envois').upsert({ id: d.id, branch_id: d.branchId, data: ligne }, { onConflict: 'id' });
  return error ? 'journal' : String(ligne.statut);
}

/** Le lien est-il parti (ou en route) sur WhatsApp ? */
const parti = (statut: string): boolean => statut === 'en-attente' || statut === 'envoyé';

/** LA CONFIRMATION DE LA VISIO : le modèle `visio_mnd` (secret WA_TEMPLATE_VISIO,
    posé une fois approuvé chez Meta) porte l'appel, le jour et l'heure, et le
    lien d'entrée. Il sert aussi quand l'heure change : mêmes trois paramètres. */
async function confirmeSurWhatsApp(
  sb: Base, req: Request,
  v: { id: string; nom: string; telephone: string; debut: string; chemin: string; branchId: string | null; envoiId?: string },
): Promise<string> {
  const modele = (Deno.env.get('WA_TEMPLATE_VISIO') ?? '').trim();
  if (!modele) return 'sans-modele';
  const origine = origineDe(req);
  if (!origine) return 'sans-origine';
  const prenom = prenomDe(v.nom);
  const quand = creneauDit(v.debut);
  const lien = `${origine}${v.chemin}`;
  return await deposeLeModele(sb, {
    id: v.envoiId ?? `env-${v.id}-wa-visio`, visioId: v.id, branchId: v.branchId, debut: v.debut, prenom, telephone: v.telephone, modele,
    composants: [{ type: 'body', parameters: [{ type: 'text', text: prenom }, { type: 'text', text: quand }, { type: 'text', text: lien }] }],
    texteAuFil: `Bonjour ${prenom}, votre visio gratuite avec la Maison MND est réservée : ${quand}. Votre lien d’entrée : ${lien}`,
  });
}

/** Les messages de cette visio encore en salle ne partent plus (elle a changé
    d'heure, annulé, ou vu la suite sur sa page). `sauf` : celui qu'on vient de déposer. */
async function retireDeLaSalle(sb: Base, visioId: string, motif: string, garde: (id: string) => boolean = () => false): Promise<number> {
  const { data } = await sb.from('envois').select('id, data').eq('data->>visioId', visioId).limit(50);
  let n = 0;
  for (const e of ((data ?? []) as { id: string; data: Record<string, unknown> }[])) {
    if (garde(e.id) || String(e.data?.statut ?? '') !== 'en-attente') continue;
    const { data: ecrit } = await sb.from('envois').update({ data: { ...e.data, statut: 'périmé', detail: motif } })
      .eq('id', e.id).eq('data->>statut', 'en-attente').select('id');
    if (Array.isArray(ecrit) && ecrit.length) n += 1;
  }
  return n;
}

/* ── Le Carnet ──────────────────────────────────────────────────────────
   LA CONSULTATION PRIVÉE y prend sa place sous le verrou (`pose_si_libre`).
   LA VISIO n'est pas une place au fauteuil : quand la Maison choisit de
   l'inscrire au Carnet (`auCarnet`, éteint au départ), sa ligne s'écrit à la
   clé de service, comme une pose de la direction, et suit la visio quand elle
   change d'heure ou s'annule (une écriture gardée par `updated_at`). */

async function brancheDe(sb: Base, voulue: string | null): Promise<{ id: string; data: Record<string, unknown> } | null> {
  if (voulue) {
    const { data } = await sb.from('branches').select('id, data').eq('id', voulue).maybeSingle();
    if (data) return { id: String(data.id), data: objet(data.data) };
  }
  const { data: toutes } = await sb.from('branches').select('id, data').limit(50);
  const lignes = ((toutes ?? []) as { id: string; data: unknown }[]).map((b) => ({ id: String(b.id), data: objet(b.data) }));
  return lignes.find((b) => b.data.flagship === true) ?? lignes[0] ?? null;
}

const maitreDe = (b: { data: Record<string, unknown> }): string => {
  const voulu = typeof b.data.masterParDefaut === 'string' ? b.data.masterParDefaut.trim() : '';
  const maitres = Array.isArray(b.data.masters) ? b.data.masters.filter((m): m is string => typeof m === 'string' && m !== '') : [];
  return voulu && maitres.includes(voulu) ? voulu : (maitres[0] ?? '');
};

/** La ligne de la visio au Carnet. Rend son identifiant, ou rien. */
async function inscrisLaVisioAuCarnet(sb: Base, v: { id: string; nom: string; debut: string; branchId: string | null }): Promise<string | null> {
  const branche = await brancheDe(sb, v.branchId);
  if (!branche) return null;
  const id = `rdv-visio-${v.id}`;
  const maintenant = new Date().toISOString();
  const rdv = {
    id, branchId: branche.id, clientId: '', clientName: prenomDe(v.nom) || 'Visio', serviceIds: [],
    date: jourDeCotonou(Date.parse(v.debut)), time: heureDite(v.debut), dureeMin: 15, master: maitreDe(branche),
    status: 'confirmé', source: 'consultation', creeLe: maintenant, sansConfirmation: true, visioId: v.id,
    forfait: { nom: NOM_DE_LA_VISIO_AU_CARNET, totalXof: 0, baseXof: 0, poseAt: maintenant.slice(0, 10) },
    note: 'Visio gratuite réservée sur le site · en ligne, dans Ma Couronne',
  };
  const { error } = await sb.from('appointments').insert({ id, branch_id: branche.id, data: rdv });
  if (error && !/duplicate|unique/i.test(String(error.message))) { dis('carnet · visio non inscrite', { id: v.id }); return null; }
  return id;
}

/** Le rendez-vous de la visio suit la visio : une autre heure, ou annulé. */
async function suisAuCarnet(sb: Base, rdvId: string | null | undefined, patch: Record<string, unknown>): Promise<void> {
  if (!rdvId) return;
  for (let essai = 0; essai < 3; essai += 1) {
    const { data } = await sb.from('appointments').select('id, data, updated_at').eq('id', rdvId).maybeSingle();
    if (!data) return;
    const { data: ecrit } = await sb.from('appointments').update({ data: { ...objet(data.data), ...patch } })
      .eq('id', rdvId).eq('updated_at', data.updated_at).select('id');
    if (Array.isArray(ecrit) && ecrit.length) return;
  }
}

/** Ce que la consultation garde de sa visio et de son rendez-vous (file B du Trône, et le devis). */
async function noteSurLaConsultation(sb: Base, consultationId: string | null, patch: Record<string, unknown>): Promise<void> {
  if (!consultationId) return;
  const { data: row } = await sb.from('consultations_queue').select('id, data').eq('id', consultationId).maybeSingle();
  if (!row) return;
  await sb.from('consultations_queue').update({ data: { ...objet(row.data), ...patch } }).eq('id', consultationId);
}

/** Son parcours, lu dans sa consultation : sans locks encore, ses affiches parlent de ses cheveux et de sa création. */
async function sansLocksDe(sb: Base, consultationId: string | null): Promise<boolean> {
  if (!consultationId) return false;
  const { data: row } = await sb.from('consultations_queue').select('id, data').eq('id', consultationId).maybeSingle();
  return sansLocksEncore(row?.data);
}

/** L'agenda de la Maison sur une période, tel que le juge des places le lit. */
async function lisLAgenda(sb: Base, branchId: string, du: string, au: string): Promise<AgendaDuServeur | null> {
  const [branche, docs, blocages, occupes] = await Promise.all([
    sb.from('branches').select('id, data').eq('id', branchId).maybeSingle(),
    sb.from('documents').select('key, data').in('key', ['mnd_settings', 'mnd_horaires_exceptions']),
    sb.from('blocages').select('id, data').eq('data->>branchId', branchId).gte('data->>date', du).lte('data->>date', au).limit(1000),
    sb.rpc('creneaux_occupes', { p_branch: branchId, p_du: du, p_au: au }),
  ]);
  const pris = (Array.isArray(occupes.data) ? occupes.data : []) as unknown[];
  /* Une lecture manquée, ou une tranche de mille : mieux vaut « la Maison vous écrit » qu'une place fausse. */
  if (!branche.data || docs.error || blocages.error || occupes.error || pris.length >= 1000) return null;
  const doc = (cle: string): unknown => ((docs.data ?? []) as { key: string; data?: unknown }[]).find((d) => d.key === cle)?.data;
  return agendaDepuisLesLignes({
    branche: branche.data, reglages: doc('mnd_settings'), exceptions: doc('mnd_horaires_exceptions'),
    services: [], categories: [], blocages: blocages.data ?? [], occupes: pris,
  });
}

/** Le prix de la consultation privée : la barre que `kkiapay-verify` tient (même secret, même nombre). */
const prixDeLaPrivee = (): number => {
  const n = Math.round(Number(Deno.env.get('CONSULTATION_FEE_XOF') ?? PRIX_DE_LA_CONSULTATION_PRIVEE_XOF));
  return Number.isFinite(n) && n > 0 ? n : PRIX_DE_LA_CONSULTATION_PRIVEE_XOF;
};

/** LA CONSULTATION PRIVÉE PREND SA PLACE AU CARNET. Réglée (le registre des
    paiements le dit, jamais le corps de l'appel), à un moment que l'agenda
    proposerait, sous le verrou des places. Rejouée, elle rend le même
    rendez-vous. Refusée, la consultation garde le moment voulu et la raison :
    la Maison le fixe avec elle (file C). */
async function reserveLaPrivee(sb: Base, consultationId: string, voulu: MomentChoisi | null): Promise<{ status: number; corps: Record<string, unknown> }> {
  const { data: row } = await sb.from('consultations_queue').select('id, data').eq('id', consultationId).maybeSingle();
  if (!row) return { status: 404, corps: { ok: false, motif: 'inconnue' } };
  const c = objet(row.data);
  const rdvId = idDuRdvDeLaPrivee(consultationId);
  const { data: deja } = await sb.from('appointments').select('id, data').eq('id', rdvId).maybeSingle();
  if (deja && String(objet(deja.data).status ?? '') !== 'annulé') {
    const a = objet(deja.data);
    return { status: 200, corps: { ok: true, verdict: 'deja', rdvId, moment: { jour: String(a.date ?? ''), heure: String(a.time ?? '') } } };
  }
  /* RÉGLÉE : la somme des paiements réussis de cette consultation, au registre. */
  const { data: regles } = await sb.from('payments').select('id, data').eq('data->>partnerId', consultationId);
  const reussis = ((regles ?? []) as { id: string; data?: { status?: string; amountXof?: number } }[]).filter((p) => (p.data?.status ?? '') === 'success');
  const regle = reussis.reduce((s, p) => s + Math.round(Number(p.data?.amountXof ?? 0)), 0);
  if (regle + 1 < prixDeLaPrivee()) return { status: 402, corps: { ok: false, motif: 'a-regler' } };

  const moment = voulu ?? momentSur(c.momentVoulu);
  if (!moment) return { status: 400, corps: { ok: false, motif: 'sans-moment' } };
  const branche = await brancheDe(sb, typeof c.branchId === 'string' && c.branchId ? c.branchId : null);
  if (!branche) return { status: 500, corps: { ok: false, motif: 'branche' } };
  const maintenant = Date.now();
  const le = new Date(maintenant).toISOString();
  const refuse = async (raison: string, status = 409) => {
    await sb.from('consultations_queue').update({ data: { ...c, momentVoulu: moment, momentRefuse: { ...moment, raison, le } } }).eq('id', consultationId);
    return { status, corps: { ok: false, motif: raison, raison } };
  };
  const r = await reglages(sb);
  const agenda = await lisLAgenda(sb, branche.id, moment.jour, moment.jour);
  if (!agenda) return await refuse('agenda', 503);
  const verdict = laPriveeTient(agenda, moment, r.priveeDureeMin, maintenant);
  if (!verdict.ok) return await refuse(verdict.erreur);

  const client = objet(c.client);
  const prenom = prenomDe(String(client.name ?? ''));
  const telephone = String(client.phone ?? '');
  const rdv = rdvDeLaPrivee({
    consultationId, branchId: branche.id, prenom, moment, dureeMin: r.priveeDureeMin, maintenantIso: le,
    regleXof: regle, ...(reussis[0]?.id ? { reference: reussis[0].id } : {}),
  });
  const numero = numeroWa(telephone);
  const demande = {
    id: idDeLaDemandeDeLaPrivee(consultationId), genre: 'rdv', createdAt: le, branchId: branche.id, prenom,
    telephone: numero ? `+${numero}` : telephone, besoin: c.parcours === 'creation' ? 'creation' : 'reparation',
    mot: 'Consultation privée réglée en ligne', source: 'site', page: '/consultation/', consentementLe: le, statut: 'nouvelle',
    serviceIds: [], date: moment.jour, time: moment.heure, consultationId,
  };
  const { data: pose, error } = await sb.rpc('pose_si_libre', { p_rdv: rdv, p_maitres: verdict.maitres, p_demande: demande });
  const posee = (pose ?? null) as { ok?: boolean; verdict?: string; id?: string; master?: string; raison?: string } | null;
  if (error || !posee) { dis('privée · verrou muet', { consultation: consultationId }); return await refuse('verrou', 500); }
  if (!posee.ok) return await refuse(posee.raison ?? 'creneau_pris');
  const pris = posee.id ?? rdvId;
  const { momentVoulu: _v, momentRefuse: _r, ...reste } = c;
  await sb.from('consultations_queue').update({
    data: {
      ...reste, rdvId: pris, rdv: { id: pris, date: moment.jour, time: moment.heure, ...(posee.master ? { master: posee.master } : {}), poseLe: le },
      momentFixe: `${jourDit(moment.jour)} · ${moment.heure}`,
    },
  }).eq('id', consultationId);
  dis('privée posée', { consultation: consultationId, verdict: posee.verdict });
  return { status: 200, corps: { ok: true, verdict: posee.verdict === 'pose' ? 'pose' : 'deja', rdvId: pris, moment } };
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
      const numero = numeroCourt(telephone);
      if (nom.length < 2 || numero.length < 8 || !Number.isFinite(Date.parse(debut))) return json({ ok: false, motif: 'incomplet' }, 400);
      /* Le lien ne part que par WhatsApp : un numéro que WhatsApp ne peut pas joindre n'a pas de visio. */
      if (numeroWa(telephone).length < 11) return json({ ok: false, motif: 'numero', raison: 'numero' }, 400);
      if (!(await permis(sb, ipDe(req)))) return json({ ok: false, motif: 'rate_limited' }, 429);
      const maintenant = Date.now();
      const debutIso = new Date(Date.parse(debut)).toISOString();
      if (!creneauValide(r, maintenant, await prisDepuis(sb, new Date(maintenant).toISOString()), debutIso)) return json({ ok: false, motif: 'pris' }, 409);

      /* LA LIMITE : une visio par numéro tous les quatre-vingt-dix jours, les
         manquées comptent, une visio annulée à temps ne compte pas (`limiteDe`).
         Sans les colonnes de 0216, on lit ce qui existe : rien n'est jamais « à temps ». */
      let siennes = await sb.from('visios').select('debut, statut, annulee_le, annulee_par').eq('numero', numero).order('debut', { ascending: false }).limit(60);
      if (siennes.error) siennes = await sb.from('visios').select('debut, statut').eq('numero', numero).order('debut', { ascending: false }).limit(60);
      const duNumero: VisioDuNumero[] = ((siennes.data ?? []) as Record<string, unknown>[]).map((l) => ({
        debut: String(l.debut), statut: String(l.statut),
        annuleeLe: typeof l.annulee_le === 'string' ? l.annulee_le : null, annuleePar: typeof l.annulee_par === 'string' ? l.annulee_par : null,
      }));
      const limite = limiteDe(duNumero, r, maintenant);
      if (!limite.ok) {
        dis('limite', { aVenir: limite.aVenir });
        return json({ ok: false, motif: limite.aVenir ? 'deja' : 'limite', raison: 'limite', prochaineLe: limite.prochaineLe }, 409);
      }

      /* La consultation déposée : elle donne sa Maison, et garde la trace de sa visio. */
      let consultationId = typeof corps.consultationId === 'string' && FORME_DE_LA_CONSULTATION.test(corps.consultationId) ? corps.consultationId : null;
      let branchId: string | null = null;
      if (consultationId) {
        const { data: row } = await sb.from('consultations_queue').select('id, data').eq('id', consultationId).maybeSingle();
        if (!row) consultationId = null;
        const b = objet(row?.data).branchId;
        branchId = typeof b === 'string' && b ? b : null;
      }

      const id = `vz-${aleatoire(12, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
      const jeton = aleatoire(32);
      const billet = aleatoire(32);
      const socle = {
        id, consultation_id: consultationId, debut: debutIso, fin: finDe(debutIso), nom, telephone, numero,
        jeton_hash: await empreinte(jeton), statut: 'réservée',
      };
      let { error } = await sb.from('visios').insert({ ...socle, billet_hash: await empreinte(billet), branch_id: branchId, lien_etat: 'a-envoyer' });
      /* Avant 0216, la table ne porte pas le billet : la visio se pose quand même, sans lui. */
      const sansBillet = !!error && /column|schema cache/i.test(String(error.message));
      if (sansBillet) ({ error } = await sb.from('visios').insert(socle));
      if (error) return json({ ok: false, motif: /duplicate|unique/i.test(String(error.message)) ? 'pris' : 'ecriture' }, 409);

      /* LE LIEN D'ENTRÉE PART SUR WHATSAPP, ET NULLE PART AILLEURS. La
         confirmation ne bloque jamais la réservation : si elle ne part pas, la
         file B du Trône le dit (« lien à envoyer ») et la Maison l'envoie. */
      const whatsapp = await confirmeSurWhatsApp(sb, req, { id, nom, telephone, debut: debutIso, chemin: cheminDeLaSalle(id, jeton), branchId }).catch(() => 'erreur');
      if (!sansBillet && parti(whatsapp)) await sb.from('visios').update({ lien_etat: 'whatsapp' }).eq('id', id);

      const rdvId = r.auCarnet ? await inscrisLaVisioAuCarnet(sb, { id, nom, debut: debutIso, branchId }).catch(() => null) : null;
      if (rdvId && !sansBillet) await sb.from('visios').update({ rdv_id: rdvId }).eq('id', id);
      await noteSurLaConsultation(sb, consultationId, { visio: { id, debut: debutIso, statut: 'réservée' }, ...(rdvId ? { rdvId } : {}) });

      dis('réservée', { id, debut: debutIso, consultation: !!consultationId, whatsapp, carnet: !!rdvId });
      /* Le billet : sa page (l'heure, la changer, l'annuler), sans l'entrée dans la salle. */
      return json({
        ok: true, id, debut: debutIso, fin: finDe(debutIso), whatsapp, parWhatsApp: parti(whatsapp),
        ...(sansBillet ? {} : { billet, chemin: cheminDeLaSalle(id, billet) }),
        changement: { max: r.changementsMax, avantMin: r.changementAvantMin },
      });
    }

    if (geste === 'etat' || geste === 'entrer' || geste === 'annuler' || geste === 'suite-vue') {
      const p = await parLeJeton(sb, corps.id, corps.jeton);
      if (!p) return json({ ok: false, motif: 'inconnue' }, 404);
      const { l, porte } = p;
      if (geste === 'etat') {
        /* Le résumé (et la suite qu'il propose) se lit une fois la salle fermée, jamais avant ni pendant. */
        const maintenant = Date.now();
        const fermee = maintenant >= Date.parse(l.fin);
        const r = await reglages(sb);
        const juge = changementPermis({ debut: l.debut, statut: l.statut, deplacements: l.deplacements }, r, maintenant);
        const resume = fermee ? resumeSur(l.resume) : null;
        return json({
          ok: true, debut: l.debut, fin: l.fin, statut: l.statut, prenom: prenomDe(l.nom), consultationId: l.consultation_id,
          resume, actif: !!cle, billet: porte === 'billet',
          /* Les affiches de la suite suivent son parcours (elle n'a pas encore de locks). */
          sansLocks: resume ? await sansLocksDe(sb, l.consultation_id) : false,
          changement: {
            permis: juge === 'permis', ...(juge === 'permis' ? {} : { motif: juge }),
            reste: changementsRestants(l, r), max: r.changementsMax, avantMin: r.changementAvantMin,
          },
        });
      }
      if (geste === 'annuler') {
        const maintenant = Date.now();
        if (l.statut !== 'réservée' || maintenant >= Date.parse(l.debut)) return json({ ok: false, motif: 'trop-tard' }, 409);
        const r = await reglages(sb);
        const le = new Date(maintenant).toISOString();
        let { error } = await sb.from('visios').update({ statut: 'annulée', annulee_par: 'cliente', maj_le: le }).eq('id', l.id);
        if (error && /column|schema cache/i.test(String(error.message))) ({ error } = await sb.from('visios').update({ statut: 'annulée', maj_le: le }).eq('id', l.id));
        if (error) return json({ ok: false, motif: 'ecriture' }, 500);
        await suisAuCarnet(sb, l.rdv_id, { status: 'annulé' });
        await retireDeLaSalle(sb, l.id, 'visio annulée par la cliente');
        await noteSurLaConsultation(sb, l.consultation_id, { visio: { id: l.id, debut: l.debut, statut: 'annulée' } });
        dis('annulée par la cliente', { id: l.id });
        /* Annulée à moins du délai, elle compte dans la limite, comme une visio manquée. */
        return json({ ok: true, compte: maintenant > Date.parse(l.debut) - r.changementAvantMin * 60_000 });
      }
      if (geste === 'suite-vue') {
        /* Elle a vu la suite sur sa page : le WhatsApp des affiches, encore en salle, ne part plus. */
        if (Date.now() < Date.parse(l.fin) || !resumeSur(l.resume)) return json({ ok: false, motif: 'trop-tot' }, 409);
        if (!l.suite_vue_le) await sb.from('visios').update({ suite_vue_le: new Date().toISOString() }).eq('id', l.id);
        const retires = await retireDeLaSalle(sb, l.id, 'vue sur sa page', (id) => !id.startsWith(`env-${l.id}-wa-suite`));
        return json({ ok: true, retires });
      }
      /* ENTRER : par le lien reçu sur WhatsApp, jamais par le billet. */
      if (porte !== 'entree') return json({ ok: false, motif: 'par-whatsapp' }, 403);
      if (!cle) return json({ ok: false, motif: 'sans-service' }, 503);
      return await entre(sb, cle, l, prenomDe(l.nom) || 'Cliente', false);
    }

    /* CHANGER L'HEURE — 17 novembre 2026. Par elle (son lien ou son billet) :
       jusqu'à deux heures avant, deux fois au plus. Par la Maison (session de
       l'équipe) : tant que la visio n'a pas commencé, sans compter. La ligne
       change d'heure d'une seule écriture, gardée par l'heure qu'on a lue :
       l'ancien quart d'heure se libère aussitôt, et l'index unique refuse un
       quart d'heure pris entre-temps. La nouvelle heure part sur WhatsApp. */
    if (geste === 'deplacer') {
      let l: Ligne | null;
      let porte: Porte;
      if (typeof corps.jeton === 'string') {
        const p = await parLeJeton(sb, corps.id, corps.jeton);
        if (!p) return json({ ok: false, motif: 'inconnue' }, 404);
        ({ l, porte } = p);
      } else {
        if (!(await delEquipe(sb, req))) return json({ ok: false, motif: 'reserve-a-l-equipe' }, 403);
        l = await parLId(sb, corps.id);
        if (!l) return json({ ok: false, motif: 'inconnue' }, 404);
        porte = 'maison';
      }
      const parLaMaison = porte === 'maison';
      const r = await reglages(sb);
      const maintenant = Date.now();
      const juge = changementPermis({ debut: l.debut, statut: l.statut, deplacements: l.deplacements }, r, maintenant, parLaMaison);
      if (juge !== 'permis') return json({ ok: false, motif: juge, reste: changementsRestants(l, r) }, 409);
      const voulu = String(corps.debut ?? '');
      if (!Number.isFinite(Date.parse(voulu))) return json({ ok: false, motif: 'incomplet' }, 400);
      if (!parLaMaison && !(await permis(sb, ipDe(req)))) return json({ ok: false, motif: 'rate_limited' }, 429);
      const debutIso = new Date(Date.parse(voulu)).toISOString();
      if (!creneauDuChangement(r, maintenant, await prisDepuis(sb, new Date(maintenant).toISOString()), debutIso, parLaMaison)) return json({ ok: false, motif: 'pris' }, 409);

      /* Le lien d'entrée : le sien quand elle le présente ; sinon un neuf (le
         serveur n'en garde que l'empreinte), que le WhatsApp de la nouvelle heure porte. */
      const jetonNeuf = porte === 'entree' ? null : aleatoire(32);
      const jetonDuLien = porte === 'entree' ? String(corps.jeton) : (jetonNeuf as string);
      const le = new Date(maintenant).toISOString();
      const deplacements = (l.deplacements ?? 0) + (parLaMaison ? 0 : 1);
      const { data: ecrit, error } = await sb.from('visios').update({
        debut: debutIso, fin: finDe(debutIso), deplacements, deplacee_le: le, deplacee_de: l.debut, salle: null, salle_url: null, maj_le: le,
        ...(jetonNeuf ? { jeton_hash: await empreinte(jetonNeuf) } : {}),
      }).eq('id', l.id).eq('debut', l.debut).eq('statut', 'réservée').select('id');
      if (error) return json({ ok: false, motif: /duplicate|unique/i.test(String(error.message)) ? 'pris' : 'ecriture' }, 409);
      /* La visio a bougé entre la lecture et l'écriture (un second toucher) : rien n'est compté deux fois. */
      if (!Array.isArray(ecrit) || ecrit.length === 0) return json({ ok: false, motif: 'a-change' }, 409);

      await suisAuCarnet(sb, l.rdv_id, { date: jourDeCotonou(Date.parse(debutIso)), time: heureDite(debutIso), deplaceLe: le, deplacePar: parLaMaison ? 'maison' : 'cliente' });
      await noteSurLaConsultation(sb, l.consultation_id, { visio: { id: l.id, debut: debutIso, statut: 'réservée' } });
      /* Un message par changement : l'instant du geste et quatre signes au sort le nomment. */
      const envoiId = `env-${l.id}-wa-visio-${maintenant.toString(36)}${aleatoire(4, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
      await retireDeLaSalle(sb, l.id, 'visio déplacée');
      const whatsapp = await confirmeSurWhatsApp(sb, req, {
        id: l.id, nom: l.nom, telephone: l.telephone, debut: debutIso, chemin: cheminDeLaSalle(l.id, jetonDuLien), branchId: l.branch_id ?? null, envoiId,
      }).catch(() => 'erreur');
      /* Un lien neuf qui n'est pas parti : la file B le dit, la Maison l'envoie. */
      if (jetonNeuf) await sb.from('visios').update({ lien_etat: parti(whatsapp) ? 'whatsapp' : 'a-envoyer' }).eq('id', l.id);
      dis('déplacée', { id: l.id, par: porte, debut: debutIso, whatsapp });
      return json({
        ok: true, debut: debutIso, fin: finDe(debutIso), deplacements, reste: Math.max(0, r.changementsMax - deplacements),
        whatsapp, parWhatsApp: parti(whatsapp),
      });
    }

    if (geste === 'entrer-maison') {
      if (!(await delEquipe(sb, req))) return json({ ok: false, motif: 'reserve-a-l-equipe' }, 403);
      const l = await parLId(sb, corps.id);
      if (!l) return json({ ok: false, motif: 'inconnue' }, 404);
      if (!cle) return json({ ok: false, motif: 'sans-service' }, 503);
      return await entre(sb, cle, l, 'Maison MND', true);
    }

    /* LE LIEN, RENVOYÉ PAR LA MAISON — 14 novembre 2026. « Le numéro n'a reçu
       ni lien, ni confirmation, ni rien » (Yéman). L'équipe en fabrique un
       neuf ici ; l'ancien cesse d'ouvrir la salle. Le Trône le met dans un
       WhatsApp prêt. */
    if (geste === 'nouveau-lien') {
      if (!(await delEquipe(sb, req))) return json({ ok: false, motif: 'reserve-a-l-equipe' }, 403);
      const l = await parLId(sb, corps.id);
      if (!l) return json({ ok: false, motif: 'inconnue' }, 404);
      if (l.statut === 'annulée') return json({ ok: false, motif: 'annulee' }, 409);
      if (Date.now() >= Date.parse(l.fin)) return json({ ok: false, motif: 'fermee' }, 409);
      const jeton = aleatoire(32);
      const { error } = await sb.from('visios').update({ jeton_hash: await empreinte(jeton), maj_le: new Date().toISOString() }).eq('id', l.id);
      if (error) return json({ ok: false, motif: 'ecriture' }, 500);
      await sb.from('visios').update({ lien_etat: 'a-la-main' }).eq('id', l.id);
      dis('nouveau lien', { id: l.id });
      return json({ ok: true, id: l.id, debut: l.debut, fin: l.fin, chemin: cheminDeLaSalle(l.id, jeton) });
    }

    /* APRÈS LA VISIO, LES AFFICHES SUR WHATSAPP — 17 novembre 2026. Le maître a
       écrit le résumé et ce qu'il propose (un rituel du catalogue, la
       consultation privée). Sa page les montre à la fermeture ; les mêmes lui
       arrivent sur WhatsApp si elle l'a fermée : déposés ici, ils attendent la
       fin de la visio et le temps de la salle, et `suite-vue` les retire si
       elle les a vus. « Votre rituel » part par le modèle approuvé de la
       réservation préparée (son bouton ouvre la réservation déjà remplie) ;
       « Consultation privée » par son modèle, une fois approuvé chez Meta
       (secret WA_TEMPLATE_SUITE_PRIVEE) : sans lui, rien ne part, la Maison écrit. */
    if (geste === 'suite') {
      if (!(await delEquipe(sb, req))) return json({ ok: false, motif: 'reserve-a-l-equipe' }, 403);
      const l = await parLId(sb, corps.id);
      if (!l) return json({ ok: false, motif: 'inconnue' }, 404);
      const resume = resumeSur(l.resume);
      if (l.statut !== 'tenue' || !resume) return json({ ok: false, motif: 'sans-resume' }, 409);
      if (l.suite_vue_le) return json({ ok: true, rituel: 'vue', privee: 'vue' });
      const affiches = affichesDeLaSuite(resume, l.consultation_id, await sansLocksDe(sb, l.consultation_id));
      const prenom = prenomDe(l.nom);
      const pasAvantMs = Date.parse(l.fin);
      const commun = { visioId: l.id, branchId: l.branch_id ?? null, debut: l.debut, prenom, telephone: l.telephone, pasAvantMs };
      /* Un résumé corrigé qui ne propose plus une affiche la retire de la salle. */
      const garde = (suffixe: string, presente: boolean) => (presente ? Promise.resolve(0)
        : retireDeLaSalle(sb, l.id, 'la Maison ne la propose plus', (id) => id !== `env-${l.id}-wa-suite-${suffixe}`));
      await garde('rituel', !!affiches.rituel);
      await garde('privee', !!affiches.privee);
      let rituel = 'rien';
      if (affiches.rituel) {
        const gestes = affiches.rituel.noms.join(' et ') || 'votre rituel';
        rituel = await deposeLeModele(sb, {
          ...commun, id: `env-${l.id}-wa-suite-rituel`,
          modele: (Deno.env.get('WA_TEMPLATE_RESA_PREPAREE') ?? '').trim() || 'reservation_preparee',
          composants: [
            { type: 'body', parameters: [{ type: 'text', text: prenom || 'Madame' }, { type: 'text', text: gestes }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: affiches.rituel.jeton }] },
          ],
          texteAuFil: `Bonjour ${prenom || 'Madame'}, la Maison MND a préparé votre réservation : ${gestes}. Il ne vous reste qu’à choisir votre jour et votre heure.`,
        }).catch(() => 'erreur');
      }
      let privee = 'rien';
      if (affiches.privee) {
        /* {{2}} suit son parcours : « à la Maison, devant vos locks » ou « … devant vos cheveux ». */
        const ou = affiches.privee.ligne.charAt(0).toLowerCase() + affiches.privee.ligne.slice(1);
        privee = !l.consultation_id ? 'sans-consultation' : await deposeLeModele(sb, {
          ...commun, id: `env-${l.id}-wa-suite-privee`,
          modele: (Deno.env.get('WA_TEMPLATE_SUITE_PRIVEE') ?? '').trim(),
          composants: [
            { type: 'body', parameters: [{ type: 'text', text: prenom || 'Madame' }, { type: 'text', text: ou }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: l.consultation_id }] },
          ],
          texteAuFil: `Bonjour ${prenom || 'Madame'}, merci pour votre visio avec la Maison MND. La Maison vous propose la consultation privée, ${ou}. Touchez « Choisir mon moment » pour la réserver.`,
        }).catch(() => 'erreur');
      }
      dis('suite', { id: l.id, rituel, privee });
      return json({ ok: true, rituel, privee });
    }

    /* LA CONSULTATION PRIVÉE, AU CARNET — 17 novembre 2026. Les moments que
       l'agenda propose (jamais le jour même, la grille, 08:30), puis la pose,
       une fois les 15 000 F au registre. */
    if (geste === 'moments-privee') {
      const r = await reglages(sb);
      const branche = await brancheDe(sb, typeof corps.branchId === 'string' && corps.branchId ? corps.branchId : null);
      if (!branche) return json({ ok: true, moments: [], dureeMin: r.priveeDureeMin });
      const maintenant = Date.now();
      const horizon = Math.max(1, Math.min(60, Math.round(Number(corps.horizonJours ?? 30)) || 30));
      const du = jourDeCotonou(maintenant);
      const au = jourDeCotonou(maintenant + (horizon + 1) * 86_400_000);
      const agenda = await lisLAgenda(sb, branche.id, du, au);
      const moments = agenda ? placesDeLaPrivee(agenda, r.priveeDureeMin, maintenant, horizon).map((p) => ({ jour: p.iso, heure: p.heure })) : [];
      return json({ ok: true, moments, dureeMin: r.priveeDureeMin, lisible: !!agenda });
    }

    if (geste === 'reserver-privee') {
      const consultationId = typeof corps.consultationId === 'string' && FORME_DE_LA_CONSULTATION.test(corps.consultationId) ? corps.consultationId : '';
      if (!consultationId) return json({ ok: false, motif: 'incomplet' }, 400);
      /* Un moment mal écrit se refuse ; sans moment, celui que la consultation a gardé au dépôt. */
      const moment = momentSur(corps.moment);
      if (corps.moment !== undefined && corps.moment !== null && !moment) return json({ ok: false, motif: 'incomplet' }, 400);
      /* L'équipe (file C du Trône) pose sans compter dans la limite du public. */
      if (!(await delEquipe(sb, req)) && !(await permis(sb, ipDe(req)))) return json({ ok: false, motif: 'rate_limited' }, 429);
      const rendu = await reserveLaPrivee(sb, consultationId, moment);
      return json(rendu.corps, rendu.status);
    }

    return json({ ok: false, motif: 'geste inconnu' }, 400);
  } catch (e) {
    dis('erreur', { geste, motif: String((e as Error)?.message ?? e).slice(0, 120) });
    return json({ ok: false, motif: 'erreur' }, 500);
  }
});
