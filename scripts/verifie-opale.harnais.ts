/* OPALE, ÉPROUVÉE : `node scripts/verifie-opale.mjs` (et `--prouve`).

   4 novembre 2026. La VRAIE fonction `whatsapp-automate` tourne ici contre
   une base, un Meta et un Claude simulés : le réglage « qui répond »
   (Opale ou l'automate), qui elle sert, les places de l'agenda du serveur,
   le rendez-vous en deux temps (proposé, puis posé au oui, jamais dans le
   même tour), le déplacement, la main passée, le silence d'un merci, les
   juges du texte, le secours, la main de l'équipe, le plafond. Puis le
   module pur (opale-pur) seul. Tout est inventé. Sortie ASCII : la console
   de Windows. */
import {
  CLE_D_OPALE, MESSAGES_D_OPALE_PAR_JOUR, OPALE, OUTILS_D_OPALE, confirmationPermise, consigneDOpale, contexteDOpale,
  etatApresOpale, fautesDOpale, gestesLus, heuresDites, montantsDuTexte, opaleSert, placesDites, propositionLue,
  reglageDOpale, estUneQuestionFrancheDOpale, salueLEnfant, type ContexteDOpale,
  avecLeLienDeLaConsultation, lienDeLaConsultation, motDeLaPhotoSansRendezVous, photoSansRendezVous, photoSeuleDansLeTour, tourSansUnMot,
  relanceDue, laMainNEstPasPrise, quiInscrire,
} from '../src/shared/opale-pur';
import { laVoixDuFil, type LecteurDeLaVoix, type LigneDeLaVoix } from '../src/shared/voix-du-fil-pur';

declare const __PANNE__: { fichier: string; avant: string; apres: string } | null;

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)}`}`);
};

/* ── La base simulée ── */
type Ligne = Record<string, any>;
const TABLES: Record<string, Ligne[]> = {};
const table = (t: string): Ligne[] => (TABLES[t] ??= []);
const cleDe = (t: string): string => (t === 'documents' ? 'key' : 'id');
function valeur(l: Ligne, col: string): unknown {
  const t = /^data((?:->[A-Za-z0-9_]+)*)->>([A-Za-z0-9_]+)$/.exec(col);
  if (t) {
    let v: any = l.data;
    for (const k of t[1].split('->').filter(Boolean)) v = v?.[k];
    v = v?.[t[2]];
    return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  const j = /^data((?:->[A-Za-z0-9_]+)+)$/.exec(col);
  if (j) {
    let v: any = l.data;
    for (const k of j[1].split('->').filter(Boolean)) v = v?.[k];
    return v ?? null;
  }
  return l[col];
}
function projette(l: Ligne, cols: string): Ligne {
  if (!cols || cols.trim() === '*') return structuredClone(l);
  const r: Ligne = {};
  for (const brut of cols.split(',').map((c) => c.trim()).filter(Boolean)) {
    const [alias, chemin] = brut.includes(':') ? brut.split(':') : [brut.replace(/^data->>/, ''), brut];
    r[alias] = structuredClone(valeur(l, chemin));
  }
  return r;
}
class Requete {
  private filtres: ((l: Ligne) => boolean)[] = [];
  private mode: 'select' | 'update' | 'upsert' | 'insert' = 'select';
  private cols = '*';
  private rendre = false;
  private tete = false;
  private plafond = Infinity;
  private tri: [string, boolean] | null = null;
  private seule: 'non' | 'peut-etre' | 'oui' = 'non';
  private charge: any = null;
  private options: any = {};
  constructor(private t: string) {}
  select(cols = '*', o: { count?: string; head?: boolean } = {}) {
    if (this.mode === 'select') { this.cols = cols; this.tete = !!o.head; } else { this.rendre = true; this.cols = cols; }
    return this;
  }
  eq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) !== String(v)); return this; }
  gt(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') > String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') >= String(v)); return this; }
  lt(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') < String(v)); return this; }
  lte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') <= String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  is(c: string, v: unknown) { this.filtres.push((l) => (valeur(l, c) ?? null) === v); return this; }
  limit(k: number) { this.plafond = k; return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.tri = [c, o.ascending !== false]; return this; }
  maybeSingle() { this.seule = 'peut-etre'; return this; }
  single() { this.seule = 'oui'; return this; }
  update(d: any) { this.mode = 'update'; this.charge = d; return this; }
  upsert(d: any, o: any = {}) { this.mode = 'upsert'; this.charge = d; this.options = o; return this; }
  insert(d: any) { this.mode = 'insert'; this.charge = d; return this; }
  private execute(): { data: any; error: any; count?: number } {
    const lignes = table(this.t);
    const cle = this.options.onConflict ?? cleDe(this.t);
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const faites: Ligne[] = [];
      for (const brut of [].concat(this.charge)) {
        const l: Ligne = { updated_at: new Date().toISOString(), ...structuredClone(brut) };
        const i = lignes.findIndex((x) => x[cle] !== undefined && x[cle] === l[cle]);
        if (i >= 0 && this.mode === 'upsert') { if (this.options.ignoreDuplicates) continue; lignes[i] = l; } else lignes.push(l);
        faites.push(l);
      }
      return { data: this.rendre ? faites.map((l) => projette(l, this.cols)) : null, error: null };
    }
    let vues = lignes.filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      for (const l of vues) Object.assign(l, structuredClone(this.charge), { updated_at: new Date(Date.now() + 1).toISOString() });
      return { data: this.rendre ? vues.map((l) => projette(l, this.cols)) : null, error: null };
    }
    if (this.tri) { const [c, asc] = this.tri; vues = [...vues].sort((a, b) => String(valeur(a, c)).localeCompare(String(valeur(b, c))) * (asc ? 1 : -1)); }
    const compte = vues.length;
    vues = vues.slice(0, this.plafond);
    if (this.tete) return { data: null, error: null, count: compte };
    const data = vues.map((l) => projette(l, this.cols));
    if (this.seule !== 'non') return { data: data[0] ?? null, error: this.seule === 'oui' && !data[0] ? { message: 'aucune ligne' } : null };
    return { data, error: null, count: compte };
  }
  then(ok: (r: any) => unknown, ko2?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.execute()).then(ok, ko2); } catch (e) { return Promise.reject(e).then(ok, ko2); }
  }
}
const cle8 = (n2: string): string => { const d = String(n2 ?? '').replace(/\D/g, ''); return d.startsWith('229') ? d.slice(-8) : d; };
const POSES: Ligne[] = [];
const OCCUPES: { jour: string; maitre: string; debut: string; duree: number }[] = [];
const APPELS_CRENEAUX: [string, string][] = [];
/* La reprise d'un rendez-vous à reprogrammer (0239), comme la base la fait :
   à reprogrammer seulement, la place prise refusée sauf au-delà des fauteuils. */
const REPRISES: any[] = [];
const RPC: Record<string, (a: any) => any> = {
  reprend_si_libre: ({ p_id, p_date, p_time, p_maitres, p_au_dela }) => {
    REPRISES.push({ p_id, p_date, p_time, p_maitres, p_au_dela });
    const l = table('appointments').find((a) => a.id === p_id);
    if (!l) return { ok: false, raison: 'introuvable' };
    const d = l.data;
    if (d.status === 'confirmé' && d.date === p_date && d.time === p_time) return { ok: true, verdict: 'deja', master: d.master };
    if (!(d.status === 'annulé' && d.aReprogrammerDepuis)) return { ok: false, raison: 'pas_a_reprogrammer' };
    if (!p_au_dela && OCCUPES.some((o) => o.jour === p_date && o.debut === p_time)) return { ok: false, raison: 'creneau_pris' };
    const { aReprogrammerDepuis: _a, aReprogrammerPar: _b, placesProposees: _c, relanceDuReportLe: _d, ...reste } = d;
    l.data = { ...reste, status: 'confirmé', date: p_date, time: p_time, master: p_maitres[0], reprogrammeLe: new Date().toISOString(), reprogrammeDe: { date: d.date, time: d.time }, ...(p_au_dela ? { auDelaDesPlaces: true } : {}) };
    l.updated_at = new Date(Date.now() + 1).toISOString();
    return { ok: true, verdict: 'repris', master: p_maitres[0], auDela: !!p_au_dela };
  },
  fiches_du_numero: ({ n: num }) => table('clients').filter((c) => [c.data?.phone, c.data?.phone2].some((p) => p && cle8(p) === cle8(num)))
    .map((c) => ({
      id: c.id, nom: c.data.name, ...(c.data.civilite ? { civilite: c.data.civilite } : {}), parPhone: cle8(c.data.phone) === cle8(num),
      numeros: [c.data.phone].filter(Boolean), ...(c.data.derniereVenue ? { derniereVenue: c.data.derniereVenue } : {}), branchId: 'br-banc',
      ...(c.data.birthday ? { naissance: c.data.birthday } : {}), ...(c.data.familyId ? { familyId: c.data.familyId } : {}),
    })),
  /* Les rendez-vous pris, comme la base les rend ({ jour, maitre, debut, duree }),
     et chaque période demandée (18 novembre 2026 : la lecture de toute la
     fenêtre, la journée relue avant une proposition). */
  creneaux_occupes: ({ p_du, p_au }: { p_du: string; p_au: string }) => { APPELS_CRENEAUX.push([p_du, p_au]); return OCCUPES.filter((o) => o.jour >= p_du && o.jour <= p_au); },
  is_staff: () => true,
  avance_le_fil: ({ p_numero, p_version, p_data }) => {
    const main = table('fils_automate').find((l) => l.id === `main-${p_numero}`)?.data;
    if (main && main.pauseLe && Date.parse(main.jusqua) > Date.now() && !(main.rendueLe && main.rendueLe >= main.pauseLe)) return null;
    const ligne = table('fils_automate').find((l) => l.id === `fil-${p_numero}`);
    const actuelle = Number(ligne?.data?.version ?? 0) || 0;
    if (actuelle !== p_version) return null;
    const data = { ...p_data, id: `fil-${p_numero}`, numero: p_numero, version: actuelle + 1 };
    if (ligne) ligne.data = data; else table('fils_automate').push({ id: `fil-${p_numero}`, data, updated_at: new Date().toISOString() });
    return actuelle + 1;
  },
  pose_si_libre: ({ p_rdv, p_maitres, p_demande, p_envoi }) => {
    if (table('appointments').some((a) => a.id === p_rdv.id)) return { ok: true, verdict: 'deja', id: p_rdv.id };
    POSES.push(p_rdv);
    table('appointments').push({ id: p_rdv.id, branch_id: p_rdv.branchId, data: { ...p_rdv, master: p_maitres[0] }, updated_at: new Date().toISOString() });
    if (p_demande) table('demandes').push({ id: p_demande.id, data: p_demande });
    if (p_envoi) table('envois').push({ id: p_envoi.id, data: p_envoi, updated_at: new Date().toISOString() });
    return { ok: true, verdict: 'pose', id: p_rdv.id };
  },
};
const client = {
  from: (t: string) => new Requete(t),
  rpc: async (nom: string, a: any) => (RPC[nom] ? { data: structuredClone(RPC[nom](a)), error: null } : { data: null, error: { message: `rpc ${nom} absente du banc` } }),
  /* Le coffre des pièces (18 novembre 2026) : ses photos, que lit Opale. */
  storage: {
    from: (coffre: string) => ({
      download: async (chemin: string) => {
        const o = COFFRE[`${coffre}/${chemin}`];
        return o ? { data: new Blob([o]), error: null } : { data: null, error: { message: 'absent du coffre' } };
      },
    }),
  },
};
const COFFRE: Record<string, Uint8Array> = {};

/* L'HEURE DU BANC (18 novembre 2026) : le jour même et la relance dépendent
   de l'heure de Cotonou. `aHeure` pose une heure choisie (Date.now et
   new Date() sans argument la suivent), `aHeure(null)` rend l'horloge. */
const VraieDate = Date;
let decalage = 0;
class DateDuBanc extends VraieDate {
  constructor(...a: any[]) { if (a.length === 0) super(VraieDate.now() + decalage); else super(...(a as [any])); }
  static now() { return VraieDate.now() + decalage; }
}
(globalThis as any).Date = DateDuBanc;
const aHeure = (cible: number | null) => { decalage = cible === null ? 0 : cible - VraieDate.now(); };
/** Le prochain mardi (ouvert dans le décor), à cette heure de Cotonou (UTC+1). */
const mardiA = (h: number, m = 0): number => {
  const d = new VraieDate(VraieDate.now() + 2 * 86_400_000);
  while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() + 1);
  return VraieDate.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h - 1, m);
};

/* ── Claude simulé : une file de réponses écrites d'avance ── */
type Reponse = { outils?: { name: string; input: any }[]; texte?: string; refus?: boolean; jette?: boolean };
let FILE: Reponse[] = [];
const DEMANDES: any[] = [];
let idOutil = 0;
const claudeRepond = async (corps: any) => {
  DEMANDES.push(structuredClone(corps));
  const r = FILE.shift();
  if (!r) return { stop_reason: 'end_turn', content: [{ type: 'text', text: '' }], usage: { input_tokens: 10, output_tokens: 1 } };
  if (r.jette) throw new Error('claude injoignable (banc)');
  if (r.refus) return { stop_reason: 'refusal', content: [], usage: { input_tokens: 10, output_tokens: 1 } };
  if (r.outils) return { stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: 'x' }, ...r.outils.map((o) => ({ type: 'tool_use', id: `toolu_${++idOutil}`, name: o.name, input: o.input }))], usage: { input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 4000 } };
  return { stop_reason: 'end_turn', content: [{ type: 'text', text: r.texte ?? '' }], usage: { input_tokens: 1000, output_tokens: 60 } };
};
const resultatsDe = (i: number): string[] => {
  const d = DEMANDES[i];
  const dernier = d?.messages?.[d.messages.length - 1];
  return Array.isArray(dernier?.content) ? dernier.content.filter((c: any) => c.type === 'tool_result').map((c: any) => String(c.content)) : [];
};

/* ── Deno, Meta ── */
const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: 'http://faux.local', CLE_SERVICE: 'la-cle-de-la-maison', WA_TOKEN: 'jeton-meta-de-banc', WA_PHONE_ID: '1234',
  ANTHROPIC_API_KEY: 'cle-claude-de-banc', SUPABASE_ANON_KEY: 'cle-publique-de-banc',
};
const SERVIS: ((req: Request) => Promise<Response>)[] = [];
const META: any[] = [];
(globalThis as any).__faux = { client: () => client, claude: claudeRepond };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: any) => { SERVIS.push(h); } };
let numeroWa = 0;
(globalThis as any).fetch = async (url: string, init?: { body?: string }) => {
  if (String(url).includes('graph.facebook.com')) {
    const corps = JSON.parse(String(init?.body ?? '{}'));
    if (corps.status === 'read') return new Response('{}', { status: 200 });
    META.push(corps);
    return new Response(JSON.stringify({ messages: [{ id: `wamid.banc${++numeroWa}` }] }), { status: 200 });
  }
  /* La fonction terminer-et-regler (6 novembre 2026) : ce que le banc lui fait répondre, et ce qu'on lui a demandé. */
  if (String(url).includes('/functions/v1/terminer-et-regler')) {
    FINS.push({ corps: JSON.parse(String(init?.body ?? '{}')), cle: String((init as { headers?: Record<string, string> } | undefined)?.headers?.authorization ?? '') });
    return REPONSE_DE_LA_FIN ? new Response(JSON.stringify(REPONSE_DE_LA_FIN), { status: 200 }) : new Response('{}', { status: 500 });
  }
  return new Response(JSON.stringify({ verdict: '' }), { status: 200 });
};
const FINS: { corps: any; cle: string }[] = [];
let REPONSE_DE_LA_FIN: Record<string, unknown> | null = null;
(globalThis as any).setTimeout = (f: () => void) => { queueMicrotask(f); return 0; };
console.log = ((log) => (...a: unknown[]) => { if (typeof a[0] === 'string' && /^(OK|ECHEC)/.test(a[0])) log(...a); })(console.log.bind(console));
console.error = () => {};
console.info = () => {};
console.warn = () => {};

/* ── Le décor : la Maison, son catalogue, ses heures, deux clientes ── */
const ICI = (ms: number) => new Date(ms + 3_600_000).toISOString().slice(0, 10);
const plusJours = (iso: string, k: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + k * 86_400_000).toISOString().slice(0, 10);
const AUJOURDHUI = ICI(Date.now());
const jourOuvert = (apres: number): string => {
  let iso = AUJOURDHUI;
  let vus = 0;
  for (let i = 1; i < 60; i++) {
    iso = plusJours(AUJOURDHUI, i);
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 1) continue;
    if (++vus >= apres) return iso;
  }
  return iso;
};
const J1 = jourOuvert(1);
const J2 = jourOuvert(2);
/** Un jour ouvert dans trois semaines et plus : au-delà des quatorze jours des listes. */
const LOIN = jourOuvert(16);
function decor(qui: 'opale' | 'automate' | null = 'opale') {
  for (const k of Object.keys(TABLES)) delete TABLES[k];
  POSES.length = 0; META.length = 0; DEMANDES.length = 0; FILE = []; OCCUPES.length = 0; APPELS_CRENEAUX.length = 0; REPRISES.length = 0;
  const semaine = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'].map((key) => ({ key, open: '08h00', close: '20h30', closed: key === 'lun' || key === 'dim' }));
  table('documents').push(
    { key: 'mnd_settings', data: { hours: semaine } },
    { key: 'mnd_auto_config', data: { automateWa: { mode: 'essai', numerosEssai: ['22990000009'], horizonJours: 14, pauseHeures: 1 } } },
    { key: 'mnd_payment_methods', data: ['Espèces', 'MoMo'] },
    { key: 'mnd_offers', data: [] },
    { key: 'mnd_model_bands', data: [{ id: 'b-medium', name: 'Medium', maxLocks: 150, coef: 1, durCoef: 1 }, { id: 'b-fin', name: 'Fin', maxLocks: null, coef: 1.2, durCoef: 1 }] },
  );
  if (qui) table('documents').push({ key: CLE_D_OPALE, data: { qui } });
  table('branches').push({ id: 'br-banc', data: { flagship: true, masters: ['m-banc'], seats: 2, mapsUrl: 'https://maps.app.goo.gl/51NfsswCwNqxW3xP9' } });
  table('catalog_categories').push(
    { id: 'atl-ii-gbeji', data: { name: 'Entretien' } },
    { id: 'cat-lavages', data: { parentId: 'atl-ii-gbeji' } },
  );
  table('catalog_services').push(
    { id: 'sv-plt-05-ess-c', data: { name: 'KLƆKLƆ™ Essentiel · Le Souffle', categoryId: 'cat-lavages', priceXof: 8000, priceMode: 'fixe', durationMin: 30 } },
    { id: 'sv-atl-ii-e', data: { name: 'SÍNSIN™ Essentiel · La Reprise', categoryId: 'atl-ii-gbeji', priceXof: 20000, priceMode: 'fixe', durationMin: 90 } },
  );
  table('clients').push({ id: 'cl-banc-a', data: { name: 'Akouele Banc', civilite: 'madame', phone: '+229 01 90 00 00 01', derniereVenue: { date: plusJours(AUJOURDHUI, -20), serviceIds: ['sv-plt-05-ess-c'] } } });
}
let seq = 0;
function elleEcrit(numero: string, texte: string, il = 0): string {
  const waId = `wamid.elle${++seq}`;
  table('messages_wa').push({ id: `wa-${waId}`, data: { waId, sens: 'entrant', numero, texte, type: 'text', quand: new Date(Date.now() - il).toISOString() } });
  return waId;
}
async function tour(numero: string, waIds: string[], tiroir = 'clientes', extra: Record<string, unknown> = {}): Promise<any> {
  const h = SERVIS[0];
  const r = await h(new Request('http://faux.local/functions/v1/whatsapp-automate', {
    method: 'POST', headers: { authorization: 'Bearer la-cle-de-la-maison', 'content-type': 'application/json' },
    body: JSON.stringify({ numero, tiroir, waIds, ...extra }),
  }));
  return r.json();
}
const fil = (numero: string): any => table('fils_automate').find((l) => l.id === `fil-${numero}`)?.data ?? null;
const textesEnvoyes = (): string[] => META.filter((m) => m.type === 'text').map((m) => String(m.text?.body ?? ''));
const traces = (): any[] => table('messages_wa').map((l) => l.data).filter((d) => d.sens === 'sortant');

const NUM = '22990000001';
const INCONNUE = '22990000002';

await import('../supabase/functions/whatsapp-automate/index.ts');

/* ══ 1. LE RÉGLAGE : qui répond ══ */
{
  decor('automate');
  const w = elleEcrit(NUM, 'Bonjour');
  await tour(NUM, [w]);
  dit('l automate en reserve : Claude n est jamais appele par Opale', 0, DEMANDES.filter((d) => d.model === 'claude-opus-5-5').length);
  decor(null);
  const w2 = elleEcrit(NUM, 'Bonjour');
  await tour(NUM, [w2]);
  dit('sans reglage : l automate, comme avant', 0, DEMANDES.filter((d) => d.model === 'claude-opus-5-5').length);
}

/* ══ 2. UNE DEMANDE DITE D'UN COUP : les vraies places, sans menu ══ */
{
  decor();
  const w = elleEcrit(NUM, 'Bonjour, je voudrais un rendez-vous pour un shampoing et mon resserrage, le matin');
  FILE = [
    { outils: [{ name: 'chercher_des_places', input: { gestes: ['sv-plt-05-ess-c', 'sv-atl-ii-e'], jour: J1, moment: 'matin' } }] },
    { texte: `Avec plaisir, Mme Akouele. Je peux vous recevoir ${J1} à 8 h 30 ou à 9 h. Laquelle vous convient ?` },
  ];
  const r = await tour(NUM, [w]);
  const res = resultatsDe(1)[0] ?? '';
  dit('Opale prend le tour', true, r.pris);
  /* 08:30, plus 08:00 : le premier rendez-vous du jour depuis le 16 novembre 2026. */
  dit('l outil rend les places du serveur, son jour d abord', [true, true], [res.includes(`${J1} 08:30`), !res.includes('Aucune place')]);
  dit('un seul message part, sa phrase, aucun menu', [1, true], [META.length, textesEnvoyes()[0]?.startsWith('Avec plaisir')]);
  dit('la trace est signee Opale', [OPALE, 'automate'], [traces()[0]?.parQui, traces()[0]?.auto]);
  dit('le fil la dit tenue (etape besoin), son message traite', ['besoin', true], [fil(NUM)?.etape, (fil(NUM)?.traites ?? []).includes(w)]);
  dit('la consigne et les outils partent avec le cache', [true, OUTILS_D_OPALE.length], [DEMANDES[0]?.system?.[0]?.cache_control?.type === 'ephemeral', DEMANDES[0]?.tools?.length]);
  dit('le contexte dit sa fiche, son appel, sa derniere venue, sans son numero', [true, true, false], [
    String(DEMANDES[0]?.messages?.[0]?.content).includes('[cl-banc-a]'), String(DEMANDES[0]?.messages?.[0]?.content).includes('Mme Akouele'),
    String(DEMANDES[0]?.messages?.[0]?.content).includes('90000001'),
  ]);
}

/* ══ 3. LE RENDEZ-VOUS EN DEUX TEMPS ══ */
{
  decor();
  const w1 = elleEcrit(NUM, `${J1} à 9 h c est parfait`, 60_000);
  FILE = [
    { outils: [{ name: 'proposer_le_rendez_vous', input: { pour: 'cl-banc-a', gestes: ['sv-plt-05-ess-c', 'sv-atl-ii-e'], date: J1, heure: '09:00' } }] },
    { outils: [{ name: 'confirmer', input: {} }] },
    { texte: 'Voici votre rendez-vous, Mme Akouele : lavage et reprise, 28 000 F. Nous le posons ?' },
  ];
  await tour(NUM, [w1]);
  const recap = resultatsDe(1)[0] ?? '';
  dit('proposer tient la place et rend le recapitulatif avec le prix', [true, true], [recap.startsWith('Place tenue'), recap.includes('28 000 F')]);
  dit('confirmer dans le meme tour est refuse : elle n a pas lu le recapitulatif', true, (resultatsDe(2)[0] ?? '').includes('pas encore lu'));
  dit('rien n est pose au premier tour, la proposition attend dans le fil', [0, J1, '09:00'], [POSES.length, fil(NUM)?.opale?.enAttente?.date, fil(NUM)?.opale?.enAttente?.heure]);
  dit('le prix du recapitulatif est permis (28 000 F part)', true, textesEnvoyes().some((t) => t.includes('28 000 F')));
  const w2 = elleEcrit(NUM, 'Oui je confirme');
  FILE = [
    { outils: [{ name: 'confirmer', input: {} }] },
    { texte: `C est confirmé, Mme Akouele : nous vous attendons ${J1} à 9 h.` },
  ];
  const r = await tour(NUM, [w2]);
  dit('au oui, confirmer pose LE rendez-vous propose, rien d autre', [1, J1, '09:00', ['sv-plt-05-ess-c', 'sv-atl-ii-e']], [POSES.length, POSES[0]?.date, POSES[0]?.time, POSES[0]?.serviceIds]);
  dit('le rendez-vous porte sa source, sa pose par Opale, confirme', ['whatsapp', OPALE, 'confirmé', 'cl-banc-a'], [POSES[0]?.source, POSES[0]?.poseePar, POSES[0]?.status, POSES[0]?.clientId]);
  const conf = table('envois').find((e) => e.id === `conf-${POSES[0]?.id}-whatsapp`)?.data;
  dit('sa confirmation dite dans la conversation : la ligne passe a envoye (le modele ne repart pas)', 'envoyé', conf?.statut);
  dit('l equipe est prevenue du rendez-vous pose', 'Nouveau rendez-vous par WhatsApp', r.alerte?.titre);
  dit('le fil dit le rendez-vous pose, la proposition effacee', ['confirme', POSES[0]?.id, undefined], [fil(NUM)?.etape, fil(NUM)?.rdvId, fil(NUM)?.opale?.enAttente]);
}

/* ══ 4. UNE NOUVELLE : la place tenue, son nom demandé dans le même message,
   sa réponse la pose (18 novembre 2026 ; avant, le nom d'abord, puis la
   civilité, puis la place, puis son oui : quatre allers et retours) ══ */
{
  decor();
  const w = elleEcrit(INCONNUE, `Un shampoing ${J2} à 10 h svp`, 60_000);
  FILE = [
    { outils: [{ name: 'proposer_le_rendez_vous', input: { pour: 'nouvelle', gestes: ['sv-plt-05-ess-c'], date: J2, heure: '10:00' } }] },
    { texte: `Je vous garde le ${J2} à 10 h pour votre lavage. Pour l’inscrire, quel prénom, et devons-nous écrire Madame ou Monsieur ?` },
  ];
  await tour(INCONNUE, [w]);
  dit('sans prenom ni civilite, la place est tenue et le nom se demande dans le meme message', [true, J2, '10:00', 0], [
    (resultatsDe(1)[0] ?? '').includes('Madame ou Monsieur'), fil(INCONNUE)?.opale?.enAttente?.date, fil(INCONNUE)?.opale?.enAttente?.heure, POSES.length,
  ]);
  const avant = DEMANDES.length;
  const w2 = elleEcrit(INCONNUE, 'Afiwa, madame');
  FILE = [
    { outils: [{ name: 'confirmer', input: {} }] },
    { outils: [{ name: 'confirmer', input: { prenom: 'Afiwa', civilite: 'madame' } }] },
    { texte: `C’est confirmé, Mme Afiwa : nous vous attendons le ${J2} à 10 h.` },
  ];
  await tour(INCONNUE, [w2]);
  dit('confirmer sans son nom est refuse, la place reste tenue ; avec son prenom et sa civilite, le rendez-vous est pose', [true, 1, 'Afiwa', 'madame', J2], [
    (resultatsDe(avant + 1)[0] ?? '').includes('Madame ou Monsieur'), POSES.length, table('demandes')[0]?.data?.prenom, table('demandes')[0]?.data?.civilite, POSES[0]?.date,
  ]);
  dit('une fiche qui n est pas a ce numero est refusee', false, propositionLue({ pour: 'cl-autre', gestes: ['a'], date: J2, heure: '10:00' }, { fiches: ['cl-banc-a'], connus: new Set(['a']), aujourdhui: AUJOURDHUI }).ok);
}

/* ══ 5. LE MERCI SANS QUESTION : rien ne part ══ */
{
  decor();
  const w = elleEcrit(NUM, 'Ok merci beaucoup');
  FILE = [{ outils: [{ name: 'ne_rien_repondre', input: { pourquoi: 'un merci' } }] }, { texte: '' }];
  const r = await tour(NUM, [w]);
  dit('un merci : aucun message, le tour est pris, sans alerte', [0, true, undefined], [META.length, r.pris, r.alerte]);
  dit('son message est traite quand meme', true, (fil(NUM)?.traites ?? []).includes(w));
}

/* ══ 6. LA MAIN PASSEE, puis le silence ══ */
{
  decor();
  const w = elleEcrit(NUM, 'Je dois annuler mon rendez-vous de jeudi');
  FILE = [
    { outils: [{ name: 'passer_la_main', input: { motif: 'annulation', pourquoi: 'elle annule' } }] },
    { texte: 'Merci de nous prévenir, Mme Akouele. Une personne de la Maison vous répond ici dans un instant.' },
  ];
  const r = await tour(NUM, [w]);
  dit('la main passe : le fil le dit, son motif, l equipe est prevenue', ['main', 'annulation', 'WhatsApp · la main passe'], [fil(NUM)?.etape, fil(NUM)?.motifMain, r.alerte?.titre]);
  const w2 = elleEcrit(NUM, 'Vous avez vu mon message ?');
  FILE = [{ texte: 'ne doit pas partir' }];
  const avant = META.length;
  const r2 = await tour(NUM, [w2]);
  dit('la main passee et pas rendue : Opale se tait, la Maison est prevenue (pris false)', [false, avant, 1], [r2.pris, META.length, FILE.length]);
}

/* ══ 7. LA MAIN DE L'ÉQUIPE TIENT : personne ne parle ══ */
{
  decor();
  table('fils_automate').push({ id: `main-${NUM}`, data: { numero: NUM, pauseLe: new Date(Date.now() - 60_000).toISOString(), jusqua: new Date(Date.now() + 3_600_000).toISOString() } });
  const w = elleEcrit(NUM, 'Bonjour');
  FILE = [{ texte: 'ne doit pas partir' }];
  const r = await tour(NUM, [w]);
  dit('l equipe a la main : aucun appel a Claude, aucun message', [false, 0, 1], [r.pris, META.length, FILE.length]);
}

/* ══ 8. LES JUGES : une faute, une relecture ; deux, le secours ══ */
{
  decor();
  const w = elleEcrit(NUM, 'Vous etes ou ?');
  FILE = [{ texte: 'Notre salon est à Cotonou.' }, { texte: 'La Maison se trouve à Cotonou, au quartier Suru-Léré.' }];
  await tour(NUM, [w]);
  /* « Vous etes ou ? » demande le chemin : le plan et le lien suivent (19 novembre 2026). */
  dit('le mot banni : relu une fois, la phrase juste part (le plan et le lien suivent)', ['La Maison se trouve à Cotonou, au quartier Suru-Léré.', 'Maison MND sur Google Maps : https://maisonmnd.com/venir/'], textesEnvoyes());
  decor();
  const w2 = elleEcrit(NUM, 'Combien pour une couleur ?');
  FILE = [{ texte: 'La couleur est à 35 000 F.' }, { texte: 'La couleur est à 35 000 F, Madame.' }];
  const r = await tour(NUM, [w2]);
  dit('un montant que rien n a dit, deux fois : le secours part, la main passe', [true, 'main', 'erreur'], [textesEnvoyes()[0]?.startsWith('Merci pour votre message'), fil(NUM)?.etape, fil(NUM)?.motifMain]);
  dit('... et l equipe est prevenue', 'WhatsApp · la main passe', r.alerte?.titre);
}

/* ══ 9. CLAUDE INJOIGNABLE, OU QUI REFUSE : jamais un silence ══ */
{
  decor();
  const w = elleEcrit(NUM, 'Bonjour');
  FILE = [{ jette: true }];
  await tour(NUM, [w]);
  dit('Claude injoignable : le mot de secours part, la main passe', [1, true, 'main'], [META.length, textesEnvoyes()[0]?.startsWith('Merci pour votre message'), fil(NUM)?.etape]);
  decor();
  const w2 = elleEcrit(NUM, 'Bonjour');
  FILE = [{ refus: true }];
  await tour(NUM, [w2]);
  dit('un refus du modele : le secours aussi', [1, 'main'], [META.length, fil(NUM)?.etape]);
}

/* ══ 10. QUI ELLE SERT ══ */
{
  decor();
  const w = elleEcrit('22990000007', 'Bonjour');
  FILE = [{ texte: 'Bonjour.' }];
  const r = await tour('22990000007', [w], 'prestataires');
  dit('un prestataire : jamais', [false, 0], [r.pris, META.length]);
  const w2 = elleEcrit('22990000008', 'Bonjour');
  const r2 = await tour('22990000008', [w2], 'equipe');
  dit('l equipe hors des numeros d essai : jamais', [false, 0], [r2.pris, META.length]);
  const w3 = elleEcrit('22990000009', 'Bonjour');
  FILE = [{ texte: 'Bonjour, que puis-je pour vous ?' }];
  const r3 = await tour('22990000009', [w3], 'equipe');
  dit('l equipe, a son numero d essai : servie', [true, 1], [r3.pris, META.length]);
}

/* ══ 11. LE PLAFOND, LE PLAN ══ */
{
  decor();
  for (let i = 0; i < MESSAGES_D_OPALE_PAR_JOUR; i++) table('messages_wa').push({ id: `wa-o${i}`, data: { sens: 'sortant', numero: NUM, parQui: OPALE, quand: new Date(Date.now() - 60_000).toISOString(), texte: 'x' } });
  const w = elleEcrit(NUM, 'Encore une question');
  FILE = [{ texte: 'ne doit pas partir' }];
  const r = await tour(NUM, [w]);
  dit('quarante messages d Opale en 24 h : elle se tait, la Maison est prevenue', [false, 0], [r.pris, META.length]);
  decor();
  const w2 = elleEcrit(NUM, 'Envoyez-moi la localisation');
  FILE = [{ outils: [{ name: 'envoyer_le_plan', input: {} }] }, { texte: 'La Maison vous attend à Suru-Léré, à Cotonou. Le plan suit.' }];
  await tour(NUM, [w2]);
  dit('elle demande le chemin : le texte, le plan, le lien Google Maps', ['text', 'image', 'text'], META.map((m) => m.type));
  decor();
  const w3 = elleEcrit(NUM, 'Je suis en route');
  FILE = [{ outils: [{ name: 'envoyer_le_plan', input: {} }] }, { texte: 'Bien noté, nous vous attendons.' }];
  await tour(NUM, [w3]);
  dit('une habituee en route : pas de plan', [['text'], true], [META.map((m) => m.type), (resultatsDe(1)[0] ?? '').includes('connaît déjà')]);
  /* LE PLAN PART AVEC LE CHEMIN, TOUJOURS (19 novembre 2026) : pose par le
     code, meme quand Claude n appelle pas l outil, meme a une habituee. */
  decor();
  const w4 = elleEcrit(NUM, 'Envoyez-moi la localisation svp');
  FILE = [{ texte: 'Nous sommes à Suru-Léré, à Cotonou.' }];
  await tour(NUM, [w4]);
  dit('une habituee demande la localisation, Claude oublie l outil : le plan part quand meme', ['text', 'image', 'text'], META.map((m) => m.type));
  decor();
  const w5 = elleEcrit(NUM, 'Merci, a samedi');
  FILE = [{ texte: 'Avec plaisir. La Maison sur la carte : https://maps.app.goo.gl/banc' }];
  await tour(NUM, [w5]);
  dit('son mot donne un lien Google Maps : le plan part avec', ['text', 'image', 'text'], META.map((m) => m.type));
  decor();
  const w6 = elleEcrit(NUM, 'Comment venir chez vous ?');
  FILE = [{ texte: 'Voici le chemin : https://maisonmnd.com/venir/' }];
  await tour(NUM, [w6]);
  dit('... le lien pour venir deja dans son mot : le plan, sans redire le lien', ['text', 'image'], META.map((m) => m.type));
  decor();
  const w7 = elleEcrit(NUM, 'Merci beaucoup');
  FILE = [{ texte: 'Avec plaisir, à bientôt.' }];
  await tour(NUM, [w7]);
  dit('rien demande, rien donne : pas de plan', ['text'], META.map((m) => m.type));
}

/* ══ 11 bis. LES CORRECTIFS DU 4 NOVEMBRE 2026 ══
   « Je serai là le samedi 28 novembre » : la fenêtre des places suit le jour
   demandé (Mme S. a lu « plus de place » à tort) ; rendue à Opale après son
   mot de relais, elle répond (M. R.) ; « la Maison MND » ; un rendez-vous
   changé se dit confirmé, jamais déplacé. */
{
  decor();
  const w = elleEcrit(NUM, `Je serai là le ${LOIN}, pour un shampoing`);
  FILE = [
    { outils: [{ name: 'chercher_des_places', input: { gestes: ['sv-plt-05-ess-c'], jour: LOIN } }] },
    { outils: [{ name: 'proposer_le_rendez_vous', input: { pour: 'cl-banc-a', gestes: ['sv-plt-05-ess-c'], date: LOIN, heure: '10:00' } }] },
    { texte: `Avec plaisir, Mme Akouele : le ${LOIN} à 10 h, cela vous convient ?` },
  ];
  await tour(NUM, [w]);
  dit('un jour au-dela des quatorze jours : ses places, et la place se tient', [true, true], [(resultatsDe(1)[0] ?? '').includes(`${LOIN} 10:00`), (resultatsDe(2)[0] ?? '').startsWith('Place tenue')]);

  decor();
  elleEcrit(NUM, 'Bonjour, un traitement anti-poux pour mon fils svp', 3_600_000);
  table('messages_wa').push({ id: 'wa-relais', data: { sens: 'sortant', numero: NUM, parQui: OPALE, etape: 'main', etat: 'remis', texte: 'Une personne de la Maison vous répond ici.', quand: new Date(Date.now() - 3_500_000).toISOString() } });
  const rendue = new Date(Date.now() - 1000).toISOString();
  table('fils_automate').push({ id: `main-${NUM}`, data: { numero: NUM, pauseLe: new Date(Date.now() - 3_000_000).toISOString(), jusqua: new Date(Date.now() + 600_000).toISOString(), rendueLe: rendue } });
  FILE = [{ texte: 'Bonjour Mme Akouele, avec plaisir : nous recevons votre fils à la Maison MND.' }];
  const h = SERVIS[0];
  const r = await (await h(new Request('http://faux.local/functions/v1/whatsapp-automate', {
    method: 'POST', headers: { authorization: 'Bearer jeton-de-la-direction', 'content-type': 'application/json' },
    body: JSON.stringify({ reprise: { numero: NUM, tiroir: 'clientes', rendueLe: rendue } }),
  }))).json();
  dit('rendue a Opale apres son mot de relais : elle repond a ce qui attendait', [true, 1, true], [r.repris, META.length, String(DEMANDES[0]?.messages?.[0]?.content ?? '').includes('anti-poux pour mon fils')]);

  const consigne = consigneDOpale();
  dit('la consigne : la Maison MND en entier, confirme et jamais deplace', [true, true], [consigne.includes('écris « la Maison MND » en entier'), consigne.includes('ne dis jamais qu’il a été déplacé')]);
}

/* ══ 11 ter. AUCUNE OFFRE ANNONCÉE (4 novembre 2026) ══
   « Jamais deux remises » et MERCREDI15 le jour même seulement : Opale ne
   réserve jamais le jour même ; elle ne parle d'aucune remise, d'aucun code,
   d'aucune offre. La Maison les applique au comptoir. */
{
  decor();
  table('documents').find((d) => d.key === 'mnd_offers')!.data = [{ code: 'MERCREDI15', active: true, title: 'Le mercredi de la Maison', sub: 'Venez un mercredi : -15 %', conditions: 'Sur les soins.' }];
  const w = elleEcrit(NUM, 'Bonjour, vous avez des promotions ?');
  FILE = [{ texte: 'Bonjour Mme Akouele, la Maison MND vous accueille avec plaisir.' }];
  await tour(NUM, [w]);
  const ctx = String(DEMANDES[0]?.messages?.[0]?.content ?? '');
  dit('aucune offre au contexte, meme active ; la consigne n en parle pas', [false, false, true], [
    ctx.includes('MERCREDI15'), ctx.includes('L’offre du moment'), consigneDOpale().includes('Ne parle d’aucune remise, d’aucun code ni d’aucune offre'),
  ]);
}

/* ══ 11 quater. LE NUMÉRO DE LA MÈRE, QUE PORTENT SES FILLES (4 novembre 2026) ══
   « Une fiche d'enfant ne doit jamais être la voix d'un numéro » (Yéman) : la
   mère écrit du numéro de ses deux filles mineures. Opale lui parle, jamais
   « Bonjour Ama » ; la trace porte la mère (qui règle le compte famille), ou
   personne quand le parent n'a pas de fiche. Tout est inventé. */
{
  const NUM2 = '22990000003';
  const filles = (plus: Record<string, unknown> = {}) => {
    table('clients').push(
      { id: 'cl-fille-a', data: { name: 'Ama Banc', phone: '+229 01 90 00 00 03', birthday: '2017-03-02', familyId: 'fam-banc', ...plus } },
      { id: 'cl-fille-b', data: { name: 'Afi Banc', phone: '+229 01 90 00 00 03', birthday: '2019-05-05', familyId: 'fam-banc' } },
    );
  };
  decor();
  filles();
  table('clients').push({ id: 'cl-mere', data: { name: 'Rose Banc', civilite: 'madame', familyId: 'fam-banc' } });
  table('families').push({ id: 'fam-banc', data: { payerClientId: 'cl-mere' } });
  const w = elleEcrit(NUM2, 'Bonjour, je voudrais un rendez-vous pour mes filles');
  FILE = [
    { texte: 'Bonjour Ama, avec plaisir. Pour quel jour souhaitez-vous venir ?' },
    { texte: 'Bonjour Mme Rose, avec plaisir : pour quel jour souhaitez-vous recevoir vos filles à la Maison MND ?' },
  ];
  await tour(NUM2, [w]);
  const ctx = String(DEMANDES[0]?.messages?.[0]?.content ?? '');
  dit('le contexte : la mere ecrit, ses filles ne parlent pas sur son numero', [true, true, false], [
    ctx.includes('Qui t’écrit : le parent des enfants, fiche [cl-mere] ; on l’appelle « Mme Rose »'),
    ctx.includes('fiche [cl-fille-a] : son prénom : Ama, civilité inconnue ; ce numéro est celui de son parent : ce n’est jamais elle qui écrit ; enfant'),
    ctx.includes('fiche [cl-fille-a] : son prénom : Ama, civilité inconnue ; ce numéro est le sien'),
  ]);
  dit('« Bonjour Ama » est retenu et reecrit ; seul le salut a la mere part', [2, true, 1, true], [
    DEMANDES.length, String(DEMANDES[1]?.messages?.at(-1)?.content ?? '').includes('le prénom de l’enfant (« Ama »)'),
    META.length, textesEnvoyes()[0]?.startsWith('Bonjour Mme Rose') ?? false,
  ]);
  dit('la trace porte la mere, jamais une fille', ['cl-mere'], traces().map((t) => t.clientId));
  dit('la consigne : jamais l enfant saluee, le parent', true, consigneDOpale().includes('Ne salue jamais l’enfant et ne l’appelle jamais par son prénom'));

  decor();
  filles({ phoneNom: 'Maman' });
  const w2 = elleEcrit(NUM2, 'Bonjour');
  FILE = [{ texte: 'Bonjour, la Maison MND vous écoute.' }];
  await tour(NUM2, [w2]);
  const ctx2 = String(DEMANDES[0]?.messages?.[0]?.content ?? '');
  dit('sans fiche du parent : la voix que nomme la fiche des enfants, la trace a personne', [true, [null]], [
    ctx2.includes('Qui t’écrit : le parent des enfants, sans fiche à ce numéro ; la fiche des enfants le nomme « Maman d’Ama et Afi »'),
    traces().map((t) => t.clientId ?? null),
  ]);
}

/* ══ 11 quinquies. LA VOIX D'UN FIL, SEULE (voix-du-fil-pur) ══ */
{
  const lignes: Record<'clients' | 'families', LigneDeLaVoix[]> = { clients: [], families: [] };
  const lis = (muette = false): LecteurDeLaVoix => async (t, ids) => (muette ? null : lignes[t].filter((l) => ids.includes(l.id)));
  const AUJ = '2026-11-04';
  const MERE = '+229 01 90 00 00 07';
  lignes.clients = [
    { id: 'a', data: { name: 'Ama B.', phone: MERE, birthday: '2017-03-02', familyId: 'f' } },
    { id: 'm', data: { name: 'Rose B.', civilite: 'madame', phone: '+229 01 90 00 00 08', familyId: 'f' } },
  ];
  lignes.families = [{ id: 'f', data: { payerClientId: 'm' } }];
  const v1 = await laVoixDuFil('22990000007', ['a'], lis(), AUJ);
  dit('le payeur a son numero a lui : une voix sans fiche, l enfant muette', [null, 'Parent d’Ama', ['a']], [v1?.fiche?.id ?? null, v1?.nom, v1?.muettes]);
  lignes.clients[1] = { id: 'm', data: { name: 'Rose B.', civilite: 'madame', familyId: 'f' } };
  const v2 = await laVoixDuFil('2290190000007', ['a'], lis(), AUJ);
  dit('le payeur sans numero parle, avec sa civilite ; le numero en 01 se replie', ['m', true, 'madame', ['a']], [v2?.fiche?.id, v2?.payeur, v2?.fiche?.civilite, v2?.muettes]);
  lignes.clients.push({ id: 'p', data: { name: 'Koffi B.', phone: MERE } });
  const v3 = await laVoixDuFil('22990000007', ['a', 'p'], lis(), AUJ);
  dit('un adulte porte le numero : c est lui, l enfant reste muette', ['p', null, ['a']], [v3?.fiche?.id, v3?.payeur ?? null, v3?.muettes]);
  lignes.clients[2] = { id: 'p', data: { name: 'Koffi B.', phone: MERE, phoneNom: 'Papa' } };
  const v4 = await laVoixDuFil('22990000007', ['a', 'p'], lis(), AUJ);
  dit('un adulte qui nomme ce numero « Papa » n y parle pas : le payeur', ['m', ['a', 'p']], [v4?.fiche?.id, v4?.muettes]);
  dit('la base muette : null, le fil a personne', null, await laVoixDuFil('22990000007', ['a'], lis(true), AUJ));
  dit('aucune fiche : personne', { muettes: [] }, await laVoixDuFil('22990000007', [], lis(), AUJ));
  dit('le salut d un enfant', [true, true, false, false, false], [
    salueLEnfant('Bonjour Ama, avec plaisir.', 'Ama'), salueLEnfant('Merci, Mlle Ama.', 'Ama'),
    salueLEnfant('Bonjour Mme Rose, le rendez-vous d’Ama est confirmé.', 'Ama'), salueLEnfant('Bonjour Amadou.', 'Ama'), salueLEnfant('Bonjour A.', 'A'),
  ]);
}

/* ══ 12. LE MODULE PUR ══ */
{
  dit('le reglage : opale seulement quand il le dit', ['automate', 'automate', 'opale'], [reglageDOpale(null).qui, reglageDOpale({ qui: 'autre' }).qui, reglageDOpale({ qui: 'opale' }).qui]);
  const cle = (x: string) => x.replace(/\D/g, '').slice(-8);
  dit('qui elle sert', [true, false, true, false], [
    opaleSert({ tiroir: 'clientes', numero: '1', numerosEssai: [], cle }), opaleSert({ tiroir: 'equipe', numero: '22990000008', numerosEssai: [], cle }),
    opaleSert({ tiroir: 'equipe', numero: '22990000009', numerosEssai: ['+229 90000009'], cle }), opaleSert({ tiroir: 'prestataires', numero: '1', numerosEssai: ['1'], cle }),
  ]);
  const P = [{ iso: '2026-11-10', heure: '08:00' }, { iso: '2026-11-10', heure: '10:00' }, { iso: '2026-11-10', heure: '15:00' }, { iso: '2026-11-11', heure: '09:00' }, { iso: '2026-11-12', heure: '18:00' }];
  dit('les places : son jour, son moment, son heure', [['08:00', '10:00'], ['2026-11-12'], ['10:00', '08:00', '15:00']], [
    placesDites(P, { jour: '2026-11-10', moment: 'matin' }).map((p) => p.heure), placesDites(P, { moment: 'soir' }).map((p) => p.iso),
    placesDites(P, { jour: '2026-11-10', heure: '10:30' }).map((p) => p.heure),
  ]);
  dit('deux places par jour quand elle n a rien dit', 4, placesDites(P, {}).length);
  dit('les gestes : connus, sans doublon', { ids: ['a'], inconnus: ['z'] }, gestesLus(['a', 'a', 'z'], new Set(['a'])));
  dit('le jour meme ne se propose pas', false, propositionLue({ pour: 'f', gestes: ['a'], date: '2026-11-04', heure: '10:00' }, { fiches: ['f'], connus: new Set(['a']), aujourdhui: '2026-11-04' }).ok);
  const prop = { genre: 'pose' as const, pour: 'f', gestes: ['a'], date: '2026-11-10', heure: '10:00', dureeMin: 60, proposeLe: '2026-11-04T10:00:00.000Z' };
  dit('confirmer : apres la proposition, moins de deux heures', [true, false, false, false], [
    confirmationPermise(prop, '2026-11-04T10:05:00.000Z', Date.parse('2026-11-04T10:06:00Z')).ok,
    confirmationPermise(prop, '2026-11-04T09:59:00.000Z', Date.parse('2026-11-04T10:06:00Z')).ok,
    confirmationPermise(prop, '2026-11-04T10:05:00.000Z', Date.parse('2026-11-04T12:30:00Z')).ok,
    confirmationPermise(undefined, '2026-11-04T10:05:00.000Z', Date.parse('2026-11-04T10:06:00Z')).ok,
  ]);
  const permis = new Set([8000]);
  dit('les juges', [[], ['un tiret cadratin'], ['un émoji'], ['une formule d’assistant']], [
    fautesDOpale('Le lavage est à 8 000 F.', { montantsPermis: permis, questionFranche: false }),
    fautesDOpale(`Bien noté ${String.fromCharCode(0x2014)} merci.`, { montantsPermis: permis, questionFranche: false }),
    fautesDOpale('Avec plaisir 🙂', { montantsPermis: permis, questionFranche: false }),
    fautesDOpale('Je suis l’assistant de la Maison.', { montantsPermis: permis, questionFranche: false }),
  ]);
  dit('a une question franche, elle peut dire ce qu elle est', [true, []], [estUneQuestionFrancheDOpale('Êtes-vous un robot ?'), fautesDOpale('Je suis l’assistante de la Maison, un programme.', { montantsPermis: permis, questionFranche: true })]);
  dit('les montants lus', [8000, 135000, 25000], montantsDuTexte('8 000 F, puis 135 000 FCFA et 25000 F'));
  dit('les dates du texte ne sont pas des prix', [], montantsDuTexte('le 5 février 2026 à 10 h'));
  dit('un numero ne part pas', true, fautesDOpale('Appelez le 01 51 99 77 99.', { montantsPermis: permis, questionFranche: false }).includes('un numéro'));
  dit('les heures dites', ['lundi fermé', 'mardi de 8 h à 20 h 30'], heuresDites([{ key: 'mar', open: '08h00', close: '20h30', closed: false }, { key: 'lun', open: '', close: '', closed: true }]));
  const base = { numero: 'n', version: 3, etape: 'repos', depuis: 'x', versionDeLEtape: 0, majLe: 'x', traites: ['a'], panier: {}, ecarts: 0, envois: [] } as any;
  const e1 = etatApresOpale(base, { issue: { genre: 'main', motif: 'sante' }, waIds: ['b'], envois: 1, planEnvoye: false, maintenantMs: Date.parse('2026-11-04T10:00:00Z') });
  dit('l etat apres une main passee', ['main', 'sante', 'besoin', ['a', 'b']], [e1.etape, e1.motifMain, e1.etapeAvantLaMain, e1.traites]);
  const consigne = consigneDOpale();
  dit('la consigne dit ses regles', [true, true, true, true, true, true], [
    consigne.includes('JAMAIS « salon »'), consigne.includes('consultation'), consigne.includes('Madame ou Monsieur ?'),
    consigne.includes('`confirmer`'), consigne.includes('ne_rien_repondre'), !consigne.includes(String.fromCharCode(0x2014)),
  ]);
  const c: ContexteDOpale = {
    maintenantMs: Date.now(), aujourdhui: '2026-11-04', heureDuJour: '10 h', reouverture: null, heures: [], fiches: [], rdvs: [], connaitLeLieu: false,
    adresse: 'Ilot 130-F', liens: { catalogue: 'c', creation: 'cr', reparation: 'r' }, paiements: [], offres: [], catalogue: ['sv · Lavage · 8 000 F'],
    fil: [], nouveaux: [{ sens: 'entrant', texte: 'Bonjour', quand: '2026-11-04T09:00:00Z' }], nomDe: (x) => x,
  };
  const ctx = contexteDOpale(c);
  dit('le contexte d une nouvelle : l adresse, ce qui part seul, ses nouveaux messages', [true, true, true], [ctx.includes('Ilot 130-F'), ctx.includes('CE QUI PART SEUL'), ctx.includes('Elle : Bonjour')]);
}

/* ══ 13. LES SOURCES : la copie du bloc, le délai du webhook ══ */
{
  const { readFileSync } = await import('node:fs');
  const brut = (rel: string): string => {
    let s = readFileSync(rel, 'utf8').replace(/\r\n/g, '\n');
    if (__PANNE__ && __PANNE__.fichier === rel) s = s.split(__PANNE__.avant).join(__PANNE__.apres);
    return s;
  };
  const entre = (s: string): string => s.slice(s.indexOf('/* ⟨opale⟩ */'), s.indexOf('/* ⟨/opale⟩ */'));
  const ori = entre(brut('src/shared/opale-pur.ts'));
  dit('le bloc d Opale est recopie tel quel dans whatsapp-automate', [true, true], [ori.length > 1000, ori === entre(brut('supabase/functions/whatsapp-automate/index.ts'))]);
  const w = brut('supabase/functions/whatsapp-webhook/index.ts');
  dit('le webhook laisse 120 s au tour d Opale', true, /const AUTOMATE_EN_FOND_MS = 120_000;/.test(w));
  const a = brut('supabase/functions/whatsapp-automate/index.ts');
  dit('la fonction importe le SDK, et sa version le dit', [true, true], [a.includes("import Anthropic from 'npm:@anthropic-ai/sdk';"), /const VERSION = '2026-11-\d{2}-[a-z] · [^']*Opale repond sur le WhatsApp de la Maison/.test(a)]);
}

/* ══ 14. « J'AI TERMINÉ MON RDV » : la porte du WhatsApp (6 novembre 2026) ══
   « Quand le client finit son rendez-vous, il peut […] écrire "j'ai terminé
   mon RDV", et il reçoit automatiquement le lien de paiement » (Yéman). La
   Maison répond elle-même (sans Claude) : le rituel du jour de CE numéro, le
   montant et le lien que rend la fonction terminer-et-regler. Sans
   rendez-vous du jour à ce numéro : le code est demandé, AUCUN lien de
   règlement ne part, la main passe à l'équipe. */
{
  const ADRESSE = 'https://maisonmnd.com/trone/payer.html?tg=r-23456789abcdef';
  const rdv = (id: string, clientId: string, date: string, status = 'confirmé') =>
    table('appointments').push({ id, branch_id: 'br-banc', data: { id, clientId, date, time: '08:00', status, serviceIds: ['sv-atl-ii-e'] } });

  decor(); FINS.length = 0;
  rdv('rdv-du-jour', 'cl-banc-a', AUJOURDHUI); rdv('rdv-de-demain', 'cl-banc-a', J1);
  REPONSE_DE_LA_FIN = { ok: true, etat: 'a-regler', adresse: ADRESSE, resteXof: 12000 };
  const w = elleEcrit(NUM, 'J’ai terminé mon RDV');
  const r = await tour(NUM, [w]);
  dit('« j ai termine » : la Maison repond elle-meme, Claude n est pas appele', [true, 0], [r.pris, DEMANDES.length]);
  dit('la fonction recoit le rituel du jour de ce numero, lui seul, par la porte WhatsApp et la cle de service',
    [{ action: 'terminer', porte: 'whatsapp', rdvIds: ['rdv-du-jour'] }, 'Bearer la-cle-de-la-maison'], [FINS[0]?.corps, FINS[0]?.cle]);
  dit('un seul message : merci, le montant, le lien de reglement, l equipe prevenue',
    [`Merci Mme Akouele, c'est noté. Votre rituel d'aujourd'hui, 12 000 F. Réglez depuis votre téléphone, en un toucher :\n${ADRESSE}\nL'équipe est prévenue.`], textesEnvoyes());
  dit('la trace est signee Opale, le fil reste tenu, son message traite', [OPALE, 'besoin', true], [traces()[0]?.parQui, fil(NUM)?.etape, (fil(NUM)?.traites ?? []).includes(w)]);

  decor(); FINS.length = 0;
  rdv('rdv-de-demain', 'cl-banc-a', J1); rdv('rdv-annule', 'cl-banc-a', AUJOURDHUI, 'annulé');
  REPONSE_DE_LA_FIN = { ok: true, etat: 'a-regler', adresse: ADRESSE, resteXof: 12000 };
  const w2 = elleEcrit(NUM, 'J’ai fini MND-7K3Q');
  const r2 = await tour(NUM, [w2]);
  dit('sans rendez-vous du jour a ce numero (demain, ou annule) : la fonction n est pas appelee, AUCUN lien de reglement ne part',
    [0, 1, false], [FINS.length, textesEnvoyes().length, /payer\.html|tg=r-/.test(textesEnvoyes().join(' '))]);
  dit('... la Maison demande le code et ses quatre chiffres, sur la page du site, le code deja pose',
    [true, true, true], [textesEnvoyes()[0]?.includes('code de confirmation'), textesEnvoyes()[0]?.includes('4 derniers chiffres'), textesEnvoyes()[0]?.includes('https://maisonmnd.com/mon-rendez-vous/?code=MND-7K3Q')]);
  dit('... et la main passe a l equipe, prevenue (Claude n a pas ete appele)', ['main', true, 0], [fil(NUM)?.etape, !!r2.alerte, DEMANDES.length]);

  decor(); FINS.length = 0;
  rdv('rdv-du-jour', 'cl-banc-a', AUJOURDHUI);
  REPONSE_DE_LA_FIN = { ok: true, etat: 'deja-regle' };
  await tour(NUM, [elleEcrit(NUM, 'Je veux régler')]);
  dit('deja regle : la Maison le dit, sans lien', [`Mme Akouele, votre rituel d'aujourd'hui est déjà réglé. Merci, et à très bientôt à la Maison MND.`], textesEnvoyes());

  decor(); FINS.length = 0;
  rdv('rdv-du-jour', 'cl-banc-a', AUJOURDHUI);
  REPONSE_DE_LA_FIN = { ok: true, etat: 'a-regler', adresse: ADRESSE, resteXof: null };
  await tour(NUM, [elleEcrit(NUM, 'Terminé')]);
  dit('un montant que la fonction ne connait pas ne s invente pas : il l attend sur la page',
    [`Merci Mme Akouele, c'est noté. Votre montant se prépare à la Maison : il vous attend sur la page. Réglez depuis votre téléphone, en un toucher :\n${ADRESSE}\nL'équipe est prévenue.`], textesEnvoyes());

  decor(); FINS.length = 0;
  rdv('rdv-du-jour', 'cl-banc-a', AUJOURDHUI);
  REPONSE_DE_LA_FIN = null;
  FILE = [{ texte: 'Merci Mme Akouele. Une personne de la Maison vous répond ici dans un instant.' }];
  await tour(NUM, [elleEcrit(NUM, 'J’ai terminé mon RDV')]);
  dit('la fonction ne repond pas : rien d invente, la conversation suit son cours ordinaire (Claude repond)', [1, 1, false, false],
    [FINS.length, DEMANDES.length, /payer\.html/.test(textesEnvoyes().join(' ')), /code de confirmation/.test(textesEnvoyes().join(' '))]);

  /* SANS RENDEZ-VOUS DU JOUR À CE NUMÉRO (seconde relecture du 6 novembre
     2026) : « c'est fini », « fini », « j'ai fini », « je veux régler » tout
     courts parlent peut-être d'autre chose. La Maison ne demande pas le code :
     Opale répond comme d'habitude, la main ne passe pas. */
  for (const phrase of ['C’est fini', 'Fini', 'J’ai fini', 'Je veux régler', 'On a terminé']) {
    decor(); FINS.length = 0;
    rdv('rdv-de-demain', 'cl-banc-a', J1);
    REPONSE_DE_LA_FIN = { ok: true, etat: 'a-regler', adresse: ADRESSE, resteXof: 12000 };
    FILE = [{ texte: 'Bien noté, Mme Akouele. Que puis-je pour vous ?' }];
    await tour(NUM, [elleEcrit(NUM, phrase)]);
    dit(`sans rendez-vous du jour, « ${phrase.replace(/[^\x20-\x7e]/g, ' ')} » ne nomme rien : ni code demande, ni main passee, Opale repond`,
      [0, 1, false, false], [FINS.length, DEMANDES.length, /code de confirmation|payer\.html/.test(textesEnvoyes().join(' ')), fil(NUM)?.etape === 'main']);
  }
  decor(); FINS.length = 0;
  rdv('rdv-de-demain', 'cl-banc-a', J1);
  const w3 = elleEcrit(NUM, 'J’ai terminé mon RDV');
  const r3 = await tour(NUM, [w3]);
  dit('... mais celle qui NOMME son rendez-vous recoit la demande du code, et la main passe a l equipe (Claude n est pas appele)',
    [0, true, 'main', true, 0], [FINS.length, textesEnvoyes()[0]?.includes('code de confirmation'), fil(NUM)?.etape, !!r3.alerte, DEMANDES.length]);

  /* LES VINGT PREMIÈRES MINUTES DU RITUEL : la fonction dit « a-peine-commence »,
     la Maison ne répond pas d'elle-même (ni lien, ni phrase toute faite), Opale répond. */
  decor(); FINS.length = 0;
  rdv('rdv-du-jour', 'cl-banc-a', AUJOURDHUI);
  REPONSE_DE_LA_FIN = { ok: true, etat: 'a-peine-commence' };
  FILE = [{ texte: 'Bien noté, Mme Akouele. Bon rituel à la Maison MND.' }];
  await tour(NUM, [elleEcrit(NUM, 'J’ai terminé mon RDV')]);
  dit('le rituel commence a peine (vingt premieres minutes) : la fonction est interrogee, aucune reponse toute faite ne part, Opale repond',
    [1, 1, false], [FINS.length, DEMANDES.length, /payer\.html|code de confirmation|c'est noté/.test(textesEnvoyes().join(' '))]);

  /* LES FORMES NUES « je paie / je vais payer / je peux payer » ne sont plus une déclaration. */
  for (const phrase of ['Je vais payer', 'Je paie', 'Je peux payer']) {
    decor(); FINS.length = 0;
    rdv('rdv-du-jour', 'cl-banc-a', AUJOURDHUI);
    REPONSE_DE_LA_FIN = { ok: true, etat: 'a-regler', adresse: ADRESSE, resteXof: 12000 };
    FILE = [{ texte: 'Bien noté, Mme Akouele.' }];
    await tour(NUM, [elleEcrit(NUM, phrase)]);
    dit(`« ${phrase} » tout nu n est pas une declaration : la fonction n est pas appelee, Opale repond`, [0, 1, false], [FINS.length, DEMANDES.length, /payer\.html/.test(textesEnvoyes().join(' '))]);
  }
  /* Reconnues aussi, toujours le message entier. */
  for (const phrase of ['Voilà, j’ai terminé', 'Bonjour Maison MND, je viens de terminer', 'Oui c’est bon, j’ai fini mes soins', 'J’ai terminé mon rendez-vous d’aujourd’hui']) {
    decor(); FINS.length = 0;
    rdv('rdv-du-jour', 'cl-banc-a', AUJOURDHUI);
    REPONSE_DE_LA_FIN = { ok: true, etat: 'a-regler', adresse: ADRESSE, resteXof: 12000 };
    await tour(NUM, [elleEcrit(NUM, phrase)]);
    dit(`« ${phrase.replace(/[^\x20-\x7e]/g, ' ')} » est une declaration : la Maison repond elle-meme, avec le lien`, [1, 0, true], [FINS.length, DEMANDES.length, /payer\.html/.test(textesEnvoyes().join(' '))]);
  }

  /* Le rituel d'un enfant, sur le numéro de sa mère : le salut va à la mère. */
  decor(); FINS.length = 0;
  table('clients').unshift({ id: 'cl-enfant', data: { name: 'Sena Banc', phone: '+229 01 90 00 00 01', birthday: plusJours(AUJOURDHUI, -8 * 365) } });
  rdv('rdv-de-l-enfant', 'cl-enfant', AUJOURDHUI);
  REPONSE_DE_LA_FIN = { ok: true, etat: 'a-regler', adresse: ADRESSE, resteXof: 5000 };
  await tour(NUM, [elleEcrit(NUM, 'c’est terminé')]);
  dit('le rituel d un enfant sur le numero de sa mere : son rendez-vous est retrouve, le salut va a la mere, jamais a l enfant',
    [['rdv-de-l-enfant'], true, false], [FINS[0]?.corps?.rdvIds, textesEnvoyes()[0]?.startsWith('Merci Mme Akouele, c\'est noté.'), /Sena/.test(textesEnvoyes().join(' '))]);

  decor(); FINS.length = 0;
  rdv('rdv-du-jour', 'cl-banc-a', AUJOURDHUI);
  REPONSE_DE_LA_FIN = { ok: true, etat: 'a-regler', adresse: ADRESSE, resteXof: 12000 };
  FILE = [{ texte: 'Bonjour Mme Akouele, que puis-je pour vous ?' }];
  await tour(NUM, [elleEcrit(NUM, 'Je n’ai pas terminé, vous avez encore du monde ?')]);
  dit('une phrase qui n est pas une declaration ne declenche rien : la fonction n est pas appelee', [0, 1], [FINS.length, DEMANDES.length]);

  /* LE MESSAGE ENTIER, ET RIEN D'AUTRE (relecture du 6 novembre 2026) : une
     cliente en retard, son rendez-vous du jour déjà commencé, écrit qu'elle
     arrive. Ce n'est pas une déclaration : ni marque, ni lien de règlement,
     la conversation suit son cours ordinaire avec Opale. */
  for (const phrase of ['J’ai fini mon travail, j’arrive', 'c’est fini la pluie, je viens', 'j’ai fini mes courses', 'j’ai fini ?', 'Le travail, c’est fini']) {
    decor(); FINS.length = 0;
    rdv('rdv-du-jour', 'cl-banc-a', AUJOURDHUI);
    REPONSE_DE_LA_FIN = { ok: true, etat: 'a-regler', adresse: ADRESSE, resteXof: 12000 };
    FILE = [{ texte: 'Bien noté, Mme Akouele. Nous vous attendons à la Maison MND.' }];
    await tour(NUM, [elleEcrit(NUM, phrase)]);
    dit(`une cliente qui dit autre chose (« ${phrase.replace(/[^\x20-\x7e]/g, ' ')} ») ne recoit aucun lien de reglement : la fonction n est pas appelee, Opale repond`,
      [0, 1, false], [FINS.length, DEMANDES.length, /payer\.html/.test(textesEnvoyes().join(' '))]);
  }
}

/* ══ 14. L'AVIS SUR PHOTO, AVEC UN RENDEZ-VOUS (17 novembre 2026) ══
   « Il ne faut pas permettre d'avoir des bilans sans prendre de RDV » : la
   main ne passe plus pour la photo d'un numéro que la Maison ne reçoit pas. */
{
  const LIEN = 'https://maisonmnd.com/consultation/';
  let seqPhoto = 0;
  const elleEnvoie = (numero: string, type: string, legende = ''): string => {
    const waId = `wamid.photo${++seqPhoto}`;
    table('messages_wa').push({ id: `wa-${waId}`, data: { waId, sens: 'entrant', numero, texte: legende, type, quand: new Date().toISOString() } });
    return waId;
  };
  const pose = (id: string, clientId: string, date: string, status: string, marques: Record<string, unknown> = {}) =>
    table('appointments').push({ id, branch_id: 'br-banc', data: { id, clientId, date, time: '10:00', status, serviceIds: ['sv-atl-ii-e'], ...marques } });
  const LA_LIGNE = 'Bonjour. La Maison regarde vos locks avec vous, au rendez-vous.';
  const PASSE = { outils: [{ name: 'passer_la_main', input: { motif: 'media', pourquoi: 'une photo' } }] };
  const contexteLu = (): string => String(DEMANDES[0]?.messages?.[0]?.content ?? '');

  /* Une inconnue, une photo seule : la main ne passe pas, le lien part. */
  decor();
  const w1 = elleEnvoie(INCONNUE, 'image');
  FILE = [PASSE, { texte: LA_LIGNE }];
  const r1 = await tour(INCONNUE, [w1]);
  dit('une photo sans rendez-vous : le contexte le dit a Opale, avec le lien de la consultation', [true, true],
    [contexteLu().includes('L’avis sur photo : elle n’a ni rendez-vous pris ni séance faite'), contexteLu().includes(LIEN)]);
  dit('... la main ne passe pas : l outil le refuse et rend le lien', [true, true], [(resultatsDe(1)[0] ?? '').startsWith('La main ne passe pas pour cette photo'), (resultatsDe(1)[0] ?? '').includes(LIEN)]);
  dit('... le fil reste a Opale, personne n est alerte', ['besoin', undefined, undefined], [fil(INCONNUE)?.etape, fil(INCONNUE)?.motifMain, r1.alerte]);
  dit('... son message part avec le lien, pose par le code', [1, `${LA_LIGNE}\nVotre consultation se prend ici : ${LIEN}`], [META.length, textesEnvoyes()[0]]);

  /* Le lien deja ecrit par Opale ne se pose pas deux fois. */
  decor();
  FILE = [{ texte: `${LA_LIGNE} Votre consultation : ${LIEN}` }];
  await tour(INCONNUE, [elleEnvoie(INCONNUE, 'image')]);
  dit('le lien deja dans son message ne se pose pas deux fois', 1, (textesEnvoyes()[0] ?? '').split(LIEN).length - 1);

  /* Un silence a une photo seule : refuse aussi. */
  decor();
  FILE = [{ outils: [{ name: 'ne_rien_repondre', input: { pourquoi: 'une photo' } }] }, { texte: LA_LIGNE }];
  await tour(INCONNUE, [elleEnvoie(INCONNUE, 'image')]);
  dit('une photo seule ne reste pas sans reponse', [1, true], [META.length, (textesEnvoyes()[0] ?? '').endsWith(LIEN)]);

  /* Une photo seule, un autre motif : la main ne passe pas non plus. */
  decor();
  FILE = [{ outils: [{ name: 'passer_la_main', input: { motif: 'question', pourquoi: 'une photo sans mot' } }] }, { texte: LA_LIGNE }];
  await tour(INCONNUE, [elleEnvoie(INCONNUE, 'image')]);
  dit('une photo seule, sans un mot : aucun motif ne fait passer la main', ['besoin', true], [fil(INCONNUE)?.etape, (textesEnvoyes()[0] ?? '').endsWith(LIEN)]);

  /* Une photo et des mots qui parlent d argent : la main passe pour l argent. */
  decor();
  FILE = [{ outils: [{ name: 'passer_la_main', input: { motif: 'question', pourquoi: 'un reglement' } }] }, { texte: 'Bien reçu. Une personne de la Maison vous répond ici dans un instant.' }];
  await tour(INCONNUE, [elleEnvoie(INCONNUE, 'image', 'Voici mon reçu de paiement')]);
  dit('une photo avec des mots d argent : la main passe pour l argent, sans lien de consultation', ['main', 'question', false], [fil(INCONNUE)?.etape, fil(INCONNUE)?.motifMain, (textesEnvoyes()[0] ?? '').includes(LIEN)]);

  /* Une photo avec des mots : le motif « media » reste refuse. */
  decor();
  FILE = [PASSE, { texte: 'La Maison regarde vos locks avec vous, au rendez-vous.' }];
  await tour(INCONNUE, [elleEnvoie(INCONNUE, 'image', 'Que pensez-vous de mes locks ?')]);
  dit('une photo avec une demande d avis : la main ne passe pas, le lien part', ['besoin', true], [fil(INCONNUE)?.etape, (textesEnvoyes()[0] ?? '').endsWith(LIEN)]);

  /* Un vocal revient toujours a une personne. */
  decor();
  FILE = [PASSE, { texte: 'Bien reçu. Une personne de la Maison vous répond ici dans un instant.' }];
  await tour(INCONNUE, [elleEnvoie(INCONNUE, 'audio')]);
  dit('un vocal sans rendez-vous : la main passe, comme avant', ['main', 'media'], [fil(INCONNUE)?.etape, fil(INCONNUE)?.motifMain]);

  /* Claude muet devant une photo seule : la ligne de la Maison, sans passer la main. */
  decor();
  FILE = [{ jette: true }];
  const r2 = await tour(INCONNUE, [elleEnvoie(INCONNUE, 'image')]);
  dit('Claude injoignable devant une photo seule : la ligne de la Maison et le lien, la main ne passe pas', [motDeLaPhotoSansRendezVous(LIEN), 'besoin', undefined],
    [textesEnvoyes()[0], fil(INCONNUE)?.etape, r2.alerte]);

  /* Une seance faite : la photo revient a une personne, comme avant. */
  decor();
  FILE = [PASSE, { texte: 'Bien reçu, Mme Akouele. Une personne de la Maison vous répond ici dans un instant.' }];
  const r3 = await tour(NUM, [elleEnvoie(NUM, 'image')]);
  dit('une seance faite : le contexte le dit, la main passe, l equipe est prevenue', [true, 'main', 'media', 'WhatsApp · la main passe', false],
    [contexteLu().includes('L’avis sur photo : elle a un rendez-vous pris ou une séance faite'), fil(NUM)?.etape, fil(NUM)?.motifMain, r3.alerte?.titre, (textesEnvoyes()[0] ?? '').includes(LIEN)]);

  /* Une fiche jamais venue : seul un rendez-vous PRIS ouvre. */
  const jamaisVenue = (rdvs: () => void): Promise<any> => {
    decor();
    table('clients').push({ id: 'cl-banc-n', data: { name: 'Nadia Banc', civilite: 'madame', phone: '+229 01 90 00 00 02' } });
    rdvs();
    FILE = [PASSE, { texte: 'Bien reçu.' }];
    return tour(INCONNUE, [elleEnvoie(INCONNUE, 'image')]);
  };
  await jamaisVenue(() => pose('rdv-pris', 'cl-banc-n', J2, 'confirmé'));
  dit('jamais venue, un rendez-vous confirme a venir : la main passe', 'main', fil(INCONNUE)?.etape);
  await jamaisVenue(() => pose('rdv-attente', 'cl-banc-n', J2, 'en attente'));
  dit('jamais venue, un rendez-vous encore en attente : la main ne passe pas', 'besoin', fil(INCONNUE)?.etape);
  await jamaisVenue(() => pose('rdv-suggere', 'cl-banc-n', J2, 'confirmé', { suggereLe: '2026-11-15T10:00:00.000Z' }));
  dit('jamais venue, une suggestion de la Maison sans son oui : la main ne passe pas', 'besoin', fil(INCONNUE)?.etape);
  await jamaisVenue(() => pose('rdv-oui', 'cl-banc-n', J2, 'confirmé', { suggereLe: '2026-11-15T10:00:00.000Z', confirmeeParLaClienteLe: '2026-11-16T09:00:00.000Z' }));
  dit('jamais venue, une suggestion qu elle a confirmee : la main passe', 'main', fil(INCONNUE)?.etape);
  await jamaisVenue(() => pose('rdv-passe', 'cl-banc-n', plusJours(AUJOURDHUI, -3), 'confirmé'));
  dit('jamais venue, un rendez-vous confirme reste dans le passe : la main ne passe pas', 'besoin', fil(INCONNUE)?.etape);
  await jamaisVenue(() => pose('rdv-annule', 'cl-banc-n', J2, 'annulé'));
  dit('jamais venue, un rendez-vous annule : la main ne passe pas', 'besoin', fil(INCONNUE)?.etape);

  /* Le module pur. */
  dit('le lien de la consultation se deduit du site du catalogue, jamais ecrit a part', [LIEN, ''],
    [lienDeLaConsultation('https://maisonmnd.com/reserver/?besoin=entretien'), lienDeLaConsultation('c')]);
  dit('une photo seule dans le tour : photo ou video, sans vocal ni piece', [true, true, false, false, false],
    [photoSeuleDansLeTour([{ type: 'image' }]), photoSeuleDansLeTour([{ type: 'text' }, { type: 'video' }]), photoSeuleDansLeTour([{ type: 'image' }, { type: 'audio' }]),
      photoSeuleDansLeTour([{ type: 'image' }, { type: 'document' }]), photoSeuleDansLeTour([{ type: 'text' }])]);
  dit('la photo sans rendez-vous : jamais pour une cliente suivie', [true, false, false],
    [photoSansRendezVous({ suivie: false, nouveaux: [{ type: 'image' }] }), photoSansRendezVous({ suivie: true, nouveaux: [{ type: 'image' }] }), photoSansRendezVous({ suivie: false, nouveaux: [{ type: 'text' }] })]);
  dit('un tour sans un mot', [true, false], [tourSansUnMot([{ texte: '' }, { texte: '  ' }]), tourSansUnMot([{ texte: '' }, { texte: 'Bonjour' }])]);
  dit('le lien se pose une fois, a la ligne, et jamais sur un message vide', ['Bonjour.\nVotre consultation se prend ici : L', 'Voir L', ''],
    [avecLeLienDeLaConsultation('Bonjour.', 'L'), avecLeLienDeLaConsultation('Voir L', 'L'), avecLeLienDeLaConsultation('', 'L')]);
  const laConsigne = consigneDOpale();
  /* 18 novembre 2026, avec « Opale ne perd aucun rendez-vous » : la photo sert au prix et à la place, jamais à un avis. */
  dit('la consigne ne demande une photo que pour le prix, jamais un avis, et ne passe plus la main pour toute photo', [true, true, false, true],
    [laConsigne.includes('Ne demande une photo que pour estimer leur nombre et leur longueur.'), laConsigne.includes('Sa photo te sert au prix et à la place, jamais à un avis'),
      laConsigne.includes('une photo ou un vocal (tu ne les vois pas'), laConsigne.includes('ne passe pas la main. Une seule ligne, sans expliquer pourquoi')]);
}


/* ══ 15. NE PERDRE AUCUN RENDEZ-VOUS (18 novembre 2026) ══
   Le fil de Mme H. : « Puis je avoir les tarifs svp? » sans un montant ;
   « Je peux envoyer une photo? », la main passée pour la photo, puis
   « ALORS? » et « Pas d'info sur les prix? » sans réponse jusqu'au
   lendemain. Au sélecteur : le jour même une heure plus tard, une relance
   une fois après trois heures. Tout est inventé. */
{
  const filDe = (numero: string, data: Record<string, unknown>) =>
    table('fils_automate').push({ id: `fil-${numero}`, data: { id: `fil-${numero}`, numero, version: 3, versionDeLEtape: 2, traites: [], envois: [], panier: {}, ecarts: 0, ...data }, updated_at: new Date().toISOString() });
  const ilYA = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  const opaleADit = (numero: string, texte: string, minutes: number, plus: Record<string, unknown> = {}) =>
    table('messages_wa').push({ id: `wa-o-${++seq}`, data: { sens: 'sortant', numero, parQui: OPALE, etat: 'remis', texte, quand: ilYA(minutes), ...plus } });

  /* ── a. SA PHOTO, QU'OPALE VOIT ── */
  decor();
  const octets = new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02]);
  COFFRE['whatsapp/22990000002/abc-photo.jpg'] = octets;
  const w1 = elleEcrit(INCONNUE, 'Voici mes locks');
  const w2 = `wamid.photo${++seq}`;
  table('messages_wa').push({ id: `wa-${w2}`, data: { waId: w2, sens: 'entrant', numero: INCONNUE, type: 'image', texte: 'une photo', quand: new Date().toISOString(), piece: { nom: 'photo.jpg', type: 'image/jpeg', chemin: '22990000002/abc-photo.jpg', coffre: 'whatsapp', octets: 5 } } });
  FILE = [{ texte: 'Merci pour votre photo : vos locks sont fines et longues.' }];
  await tour(INCONNUE, [w1, w2]);
  const premier = DEMANDES[0]?.messages?.[0]?.content;
  const image = Array.isArray(premier) ? premier.find((c: any) => c.type === 'image') : null;
  const texteDuPremier = Array.isArray(premier) ? String(premier.find((c: any) => c.type === 'text')?.text ?? '') : String(premier ?? '');
  dit('sa photo part avec la demande : l image elle-meme, et le fil dit qu Opale la voit', ['image/jpeg', btoa(String.fromCharCode(...octets)), true, 1], [
    image?.source?.media_type, image?.source?.data, texteDuPremier.includes('[une photo, jointe après le contexte : tu la vois]'), META.length,
  ]);
  decor();
  const w3 = `wamid.photo${++seq}`;
  table('messages_wa').push({ id: `wa-${w3}`, data: { waId: w3, sens: 'entrant', numero: INCONNUE, type: 'image', texte: 'une photo', quand: new Date().toISOString(), piece: { type: 'image/jpeg', chemin: '22990000002/absente.jpg', coffre: 'whatsapp' } } });
  FILE = [{ texte: 'Merci pour votre photo.' }];
  await tour(INCONNUE, [w3]);
  dit('une photo que le coffre ne rend pas : le tour part quand meme, sans image', [true, false, 1], [
    typeof DEMANDES[0]?.messages?.[0]?.content === 'string', String(DEMANDES[0]?.messages?.[0]?.content ?? '').includes('jointe après le contexte'), META.length,
  ]);

  /* ── b. LE PRIX TOUT DE SUITE : la grille ── */
  decor();
  table('catalog_services').push(
    { id: 'sv-banc-grille', data: { name: 'SÍNSIN™ Banc · La Reprise', categoryId: 'atl-ii-gbeji', priceXof: 20000, priceMode: 'fixe', durationMin: 90, tarifMode: 'calibre', priceFloors: { 'b-medium': 20000, 'b-fin': 30000 } } },
    { id: 'sv-banc-lavage', data: { name: 'KLƆKLƆ™ Banc · Le Souffle', categoryId: 'cat-lavages', priceXof: 8000, priceMode: 'fixe', durationMin: 30, prixParLongueur: { court: 8000, 'mi-long': 10000, long: 12000 } } },
  );
  const wp = elleEcrit(INCONNUE, 'Puis je avoir les tarifs svp?');
  FILE = [
    { outils: [{ name: 'prix', input: { gestes: ['sv-banc-grille', 'sv-banc-lavage'] } }] },
    { texte: 'La Reprise est à 20 000 F jusqu’à 150 locks, 30 000 F au-delà ; Le Souffle de 8 000 F à 12 000 F selon la longueur, soit de 28 000 F à 42 000 F pour les deux. Combien de locks avez-vous à peu près ?' },
  ];
  await tour(INCONNUE, [wp]);
  const grille = resultatsDe(1)[0] ?? '';
  dit('sans son nombre de locks ni sa longueur : la grille, tout de suite', [true, true], [
    grille.includes('jusqu’à 150 locks : 20 000 F ; plus de 150 locks : 30 000 F'), grille.includes('court : 8 000 F ; mi-long : 10 000 F ; long : 12 000 F'),
  ]);
  dit('les montants de la grille et les totaux possibles partent, sans relecture', [1, 2], [META.length, DEMANDES.length]);

  /* ── c. LA MAIN QUE PERSONNE NE PREND ── */
  decor();
  const wa0 = elleEcrit(NUM, 'Je peux envoyer une photo?', 16 * 60_000);
  filDe(NUM, { etape: 'main', majLe: ilYA(15), depuis: ilYA(15), mainPasseeLe: ilYA(15), motifMain: 'media', mainDeLaReception: true, etapeAvantLaMain: 'besoin', dernierEntrantQuand: ilYA(16), traites: [wa0] });
  opaleADit(NUM, 'Je vous en prie, envoyez-la ici. Une personne de la Maison vous répond dans un instant.', 15, { etape: 'main' });
  const wa = elleEcrit(NUM, 'ALORS?');
  FILE = [{ texte: 'Pardonnez cette attente, Mme Akouele. Le lavage est à 8 000 F, et je peux vous recevoir demain à 10 h. Je vous la garde ?' }];
  const ra = await tour(NUM, [wa]);
  dit('la main passee il y a 15 min, personne ne l a prise : Opale reprend et repond', [true, 1, true, 'besoin'], [
    ra.pris, META.length, String(DEMANDES[0]?.messages?.[0]?.content ?? '').includes('TU REPRENDS LA CONVERSATION'), fil(NUM)?.etape,
  ]);
  decor();
  const wb0 = elleEcrit(NUM, 'Je peux envoyer une photo?', 16 * 60_000);
  filDe(NUM, { etape: 'main', majLe: ilYA(15), depuis: ilYA(15), mainPasseeLe: ilYA(15), motifMain: 'media', mainDeLaReception: true, etapeAvantLaMain: 'besoin', dernierEntrantQuand: ilYA(16), traites: [wb0] });
  table('messages_wa').push({ id: 'wa-equipe', data: { sens: 'sortant', numero: NUM, parQui: 'Yéman', etat: 'remis', texte: 'Je regarde votre photo.', quand: ilYA(5) } });
  const wb = elleEcrit(NUM, 'Alors ?');
  FILE = [{ texte: 'ne doit pas partir' }];
  const rb = await tour(NUM, [wb]);
  dit('une personne de l equipe a ecrit depuis : Opale se tait', [false, 0, 1], [rb.pris, META.length, FILE.length]);
  decor();
  const wc0 = elleEcrit(NUM, 'Je dois annuler jeudi', 30 * 60_000);
  const passee = ilYA(25);
  filDe(NUM, { etape: 'main', majLe: passee, depuis: passee, mainPasseeLe: passee, motifMain: 'annulation', mainDeLaReception: true, etapeAvantLaMain: 'besoin', dernierEntrantQuand: ilYA(30), traites: [wc0] });
  const wc = elleEcrit(NUM, 'Et pour un shampoing samedi, combien ?');
  FILE = [{ texte: 'Pardonnez l’attente, Mme Akouele : la Maison s’occupe de votre annulation. Le lavage est à 8 000 F.' }];
  const rc = await tour(NUM, [wc]);
  dit('une annulation que personne n a prise : Opale repond au prix, le fil reste a l equipe, son heure gardee, l alarme sonne', [1, 'main', 'annulation', passee, 'WhatsApp · la main passe'], [
    META.length, fil(NUM)?.etape, fil(NUM)?.motifMain, fil(NUM)?.mainPasseeLe, rc.alerte?.titre,
  ]);

  /* ── d. LE JOUR MÊME, UNE HEURE PLUS TARD (un mardi, 9 h à Cotonou) ── */
  aHeure(mardiA(9));
  decor();
  const auj = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const wj = elleEcrit(NUM, 'Avez-vous de la place aujourd hui pour un shampoing ?');
  FILE = [
    { outils: [{ name: 'chercher_des_places', input: { gestes: ['sv-plt-05-ess-c'], jour: auj } }] },
    { outils: [{ name: 'proposer_le_rendez_vous', input: { pour: 'cl-banc-a', gestes: ['sv-plt-05-ess-c'], date: auj, heure: '09:30' } }] },
    { outils: [{ name: 'proposer_le_rendez_vous', input: { pour: 'cl-banc-a', gestes: ['sv-plt-05-ess-c'], date: auj, heure: '10:00' } }] },
    { texte: 'Avec plaisir, Mme Akouele : aujourd’hui à 10 h pour votre lavage. Je vous la garde ?' },
  ];
  await tour(NUM, [wj]);
  const placesDuJour = resultatsDe(1)[0] ?? '';
  dit('le jour meme : les places d aujourd hui, une heure plus tard au plus tot', [true, false], [
    placesDuJour.includes(`${auj} 10:00`), placesDuJour.includes(`${auj} 09:00`) || placesDuJour.includes(`${auj} 09:30`),
  ]);
  dit('une place du jour a moins d une heure est refusee ; a une heure, tenue', [true, true, auj], [
    (resultatsDe(2)[0] ?? '').includes('une heure plus tard'), (resultatsDe(3)[0] ?? '').startsWith('Place tenue'), fil(NUM)?.opale?.enAttente?.date,
  ]);
  const wj2 = elleEcrit(NUM, 'Oui parfait');
  FILE = [{ outils: [{ name: 'confirmer', input: {} }] }, { texte: 'C’est confirmé, Mme Akouele : nous vous attendons aujourd’hui à 10 h.' }];
  await tour(NUM, [wj2]);
  dit('a son oui, le rendez-vous du jour meme est pose', [1, auj, '10:00'], [POSES.length, POSES[0]?.date, POSES[0]?.time]);
  aHeure(null);

  /* ── e. LA RELANCE, UNE FOIS, DE JOUR (un mardi, midi à Cotonou) ── */
  aHeure(mardiA(12));
  decor();
  const wr0 = elleEcrit(NUM, 'Je suis de passage, mon agenda n est pas encore stable', 4 * 3_600_000 + 5 * 60_000);
  opaleADit(NUM, 'Je vous garde le jeudi à 10 h ? Un simple message suffira pour la déplacer.', 4 * 60);
  filDe(NUM, { etape: 'besoin', majLe: ilYA(240), depuis: ilYA(240), dernierEntrantQuand: ilYA(245), traites: [wr0], opale: { dernierTourLe: ilYA(240) } });
  const relance = async () => (await (await SERVIS[0](new Request('http://faux.local/functions/v1/whatsapp-automate', {
    method: 'POST', headers: { authorization: 'Bearer la-cle-de-la-maison', 'content-type': 'application/json' }, body: JSON.stringify({ relances: true }),
  }))).json());
  FILE = [{ texte: 'Je vous garde toujours jeudi à 10 h, Mme Akouele ? Un simple mot suffit.' }];
  const r1 = await relance();
  dit('trois heures sans reponse, de jour : une relance part, une seule, signee Opale', [1, 1, true, OPALE], [
    r1.relancees, META.length, String(DEMANDES[0]?.messages?.[0]?.content ?? '').includes('RELANCE :'), traces().at(-1)?.parQui,
  ]);
  dit('la relance est notee dans le fil', true, typeof fil(NUM)?.opale?.relanceLe === 'string');
  FILE = [{ texte: 'ne doit pas partir' }];
  const r2 = await relance();
  dit('jamais deux fois avant un nouveau message d elle', [0, 1, 1], [r2.relancees, META.length, FILE.length]);
  decor();
  const ws0 = elleEcrit(NUM, 'Je vous redis', 4 * 3_600_000 + 5 * 60_000);
  opaleADit(NUM, 'Je vous garde le jeudi à 10 h ?', 4 * 60);
  filDe(NUM, { etape: 'besoin', majLe: ilYA(240), depuis: ilYA(240), dernierEntrantQuand: ilYA(245), traites: [ws0] });
  FILE = [{ outils: [{ name: 'ne_rien_repondre', input: { pourquoi: 'elle reviendra' } }] }, { texte: '' }];
  await relance();
  dit('une relance que Claude juge inutile : rien ne part, et elle est quand meme notee', [0, true], [META.length, typeof fil(NUM)?.opale?.relanceLe === 'string']);
  aHeure(mardiA(22));
  decor();
  const wn0 = elleEcrit(NUM, 'Je vous redis', 4 * 3_600_000 + 5 * 60_000);
  opaleADit(NUM, 'Je vous garde le jeudi à 10 h ?', 4 * 60);
  filDe(NUM, { etape: 'besoin', majLe: ilYA(240), depuis: ilYA(240), dernierEntrantQuand: ilYA(245), traites: [wn0] });
  FILE = [{ texte: 'ne doit pas partir' }];
  const rn = await relance();
  dit('la nuit, aucune relance', [0, 'la nuit', 0], [rn.relancees, rn.raison, META.length]);
  aHeure(null);

  /* ── g. L'AGENDA DE TOUTE LA FENÊTRE (18 novembre 2026) ──
     « Le samedi 28 novembre à 9 h est libre », puis « vient d'être prise » :
     Opale lisait l'agenda sur l'horizon de l'automate (sept jours en ligne,
     quatorze ici), et une journée plus loin paraissait vide. */
  decor();
  OCCUPES.push({ jour: LOIN, maitre: 'm-banc', debut: '10:00', duree: 60 });
  const wl = elleEcrit(NUM, `Un shampoing le ${LOIN} à 10 h ?`);
  FILE = [
    { outils: [{ name: 'chercher_des_places', input: { gestes: ['sv-plt-05-ess-c'], jour: LOIN } }] },
    { outils: [{ name: 'proposer_le_rendez_vous', input: { pour: 'cl-banc-a', gestes: ['sv-plt-05-ess-c'], date: LOIN, heure: '10:00' } }] },
    { texte: `Le ${LOIN} à 10 h est pris, Mme Akouele : je peux vous recevoir à 11 h. Je vous la garde ?` },
  ];
  await tour(NUM, [wl]);
  const placesLoin = resultatsDe(1)[0] ?? '';
  dit('un rendez-vous pris au-dela de l horizon de l automate : la place n est ni proposee ni tenue', [false, true, true, undefined], [
    placesLoin.includes(`${LOIN} 10:00`), placesLoin.includes(`${LOIN} 11:00`), (resultatsDe(2)[0] ?? '').startsWith('Cette place n’est pas libre'), fil(NUM)?.opale?.enAttente,
  ]);
  dit('la lecture va jusqu a la borne du site, et la journee est relue avant la proposition', [true, true], [
    APPELS_CRENEAUX.some(([, au]) => au >= LOIN), APPELS_CRENEAUX.some(([du, au]) => du === LOIN && au === LOIN),
  ]);
  /* Le cas du 18 novembre : un DÉPLACEMENT vers un jour au-delà de l'horizon. */
  decor();
  OCCUPES.push({ jour: LOIN, maitre: 'm-banc', debut: '10:00', duree: 60 });
  table('appointments').push({ id: 'rdv-banc-a', branch_id: 'br-banc', data: { clientId: 'cl-banc-a', date: J1, time: '10:00', status: 'confirmé', serviceIds: ['sv-plt-05-ess-c'], master: 'm-banc', dureeMin: 60 }, updated_at: new Date().toISOString() });
  const wd = elleEcrit(NUM, `Je voudrais reporter mon soin au ${LOIN} à 10 h`);
  FILE = [
    { outils: [{ name: 'proposer_le_deplacement', input: { rdv: 'rdv-banc-a', date: LOIN, heure: '10:00' } }] },
    { texte: `Le ${LOIN} à 10 h n’est pas libre, Mme Akouele : je peux vous recevoir à 11 h. Cela vous convient-il ?` },
  ];
  await tour(NUM, [wd]);
  dit('un deplacement vers un jour au-dela de l horizon : la place prise n est pas dite libre, la journee est relue', [true, undefined, true], [
    (resultatsDe(1)[0] ?? '').startsWith('Cette place n’est pas libre'), fil(NUM)?.opale?.enAttente, APPELS_CRENEAUX.some(([du, au]) => du === LOIN && au === LOIN),
  ]);

  /* ── f. LE MODULE PUR ── */
  const T = VraieDate.UTC(2026, 10, 18, 11, 0);
  const iso = (ms: number) => new VraieDate(ms).toISOString();
  const filR = (opaleIlYA: number, elleIlYA: number, texte = 'Je vous garde jeudi à 10 h ?') => [
    { sens: 'entrant', quand: iso(T - elleIlYA * 60_000), texte: 'Je suis de passage' },
    { sens: 'sortant', qui: 'opale', quand: iso(T - opaleIlYA * 60_000), texte },
  ];
  dit('la relance : trois heures apres sa question, une fois, de jour, la fenetre ouverte', [true, false, false, false, false, false, false], [
    relanceDue({ etape: 'besoin', fil: filR(185, 190), maintenantMs: T }).due,
    relanceDue({ etape: 'besoin', fil: filR(170, 175), maintenantMs: T }).due,
    relanceDue({ etape: 'besoin', fil: filR(185, 190, 'Nous vous attendons jeudi.'), maintenantMs: T }).due,
    relanceDue({ etape: 'main', fil: filR(185, 190), maintenantMs: T }).due,
    relanceDue({ etape: 'besoin', relanceLe: iso(T - 60_000), fil: filR(185, 190), maintenantMs: T }).due,
    relanceDue({ etape: 'besoin', fil: filR(185, 23 * 60 + 40), maintenantMs: T }).due,
    relanceDue({ etape: 'besoin', fil: filR(185, 190), maintenantMs: VraieDate.UTC(2026, 10, 18, 20, 30) }).due,
  ]);
  dit('la main non prise : dix minutes, sans un mot de l equipe', [false, true, false], [
    laMainNEstPasPrise({ mainPasseeLe: iso(T - 5 * 60_000), fil: [], maintenantMs: T }),
    laMainNEstPasPrise({ mainPasseeLe: iso(T - 11 * 60_000), fil: [{ sens: 'sortant', qui: 'opale', quand: iso(T - 11 * 60_000) }], maintenantMs: T }),
    laMainNEstPasPrise({ mainPasseeLe: iso(T - 11 * 60_000), fil: [{ sens: 'sortant', qui: 'equipe', quand: iso(T - 2 * 60_000) }], maintenantMs: T }),
  ]);
  const inscrite = quiInscrire({ prenom: 'Afiwa' }, { civilite: 'madame' });
  dit('qui inscrire : jamais une civilite supposee', [false, true, 'Afiwa'], [
    quiInscrire({}, { prenom: 'Afiwa' }).ok, quiInscrire({}, { prenom: 'Afiwa', civilite: 'madame' }).ok, inscrite.ok ? inscrite.prenom : '',
  ]);
  const relu = (heure: string, date = '2026-11-04') => propositionLue({ pour: 'f', gestes: ['a'], date, heure }, { fiches: ['f'], connus: new Set(['a']), aujourdhui: '2026-11-04', minutesDuJour: 8 * 60 + 30 }).ok;
  dit('le jour meme, relu : une heure plus tard au plus tot, jamais hier', [false, true, false], [relu('09:00'), relu('09:30'), relu('10:00', '2026-11-03')]);
  dit('une nouvelle sans nom : la proposition tient', true, propositionLue({ pour: 'nouvelle', gestes: ['a'], date: '2026-11-10', heure: '10:00' }, { fiches: [], connus: new Set(['a']), aujourdhui: '2026-11-04' }).ok);
  const consigne = consigneDOpale();
  dit('la consigne : le prix tout de suite, les photos vues, conclure, le jour meme, jamais « dans un instant »', [true, true, true, true, true], [
    consigne.includes('donne-le TOUT DE SUITE'), consigne.includes('tu vois les photos qu’elle envoie'), consigne.includes('CONCLURE'),
    consigne.includes('Le jour même se réserve ici'), consigne.includes('jamais « dans un instant »'),
  ]);
}

/* ══ 13. À REPROGRAMMER, ET JAMAIS SANS RENDEZ-VOUS (19 novembre 2026) ══
   Maquette 7YX7UtCFusPMJdrjJtfcQr : le rendez-vous empêché rend sa place
   sans être annulé ; trois dates en boutons, le toucher vaut son oui ;
   « Changer l'heure » libère tout de suite ; sa date écrite : son heure,
   sinon dans l'heure en boutons, sinon au-delà des fauteuils. */
{
  const rdvBanc = (d: Record<string, unknown> = {}) => table('appointments').push({
    id: 'rdv-banc-r', branch_id: 'br-banc', updated_at: new Date().toISOString(),
    data: { id: 'rdv-banc-r', branchId: 'br-banc', clientId: 'cl-banc-a', clientName: 'Akouele Banc', serviceIds: ['sv-plt-05-ess-c'], date: J1, time: '10:00', master: 'm-banc', status: 'confirmé', dureeMin: 30, ...d },
  });
  const rdvLu = (): any => table('appointments').find((l) => l.id === 'rdv-banc-r')?.data;
  const boutonsEnvoyes = (): { id: string; titre: string }[] => META.filter((m) => m.type === 'interactive' && m.interactive?.type === 'button')
    .flatMap((m) => m.interactive.action.buttons).map((b: any) => ({ id: String(b.reply.id), titre: String(b.reply.title) }));
  const corpsDesBoutons = (): string => String(META.find((m) => m.type === 'interactive')?.interactive?.body?.text ?? '');
  const elleTouche = (numero: string, id: string, titre: string): string => {
    const waId = `wamid.elle${++seq}`;
    table('messages_wa').push({ id: `wa-${waId}`, data: { waId, sens: 'entrant', numero, texte: titre, type: 'interactive', bouton: { id, texte: titre }, quand: new Date().toISOString() } });
    return waId;
  };

  decor();
  rdvBanc();
  const w1 = elleEcrit(NUM, 'J’ai une contrainte et je ne pourrai plus être là. Je vais reprogrammer le RDV. Merci');
  FILE = [{ outils: [{ name: 'mettre_a_reprogrammer', input: { rdv: 'rdv-banc-r' } }] }, { texte: 'Merci de nous prévenir, Mme Akouele. Touchez la place qui vous convient, ou écrivez-nous une autre date.' }];
  await tour(NUM, [w1]);
  const b1 = boutonsEnvoyes();
  dit('elle ne pourra pas venir : le rendez-vous passe a reprogrammer, sa place est rendue, il n est pas annule pour de bon', ['annulé', true, 'opale'],
    [rdvLu()?.status, !!rdvLu()?.aReprogrammerDepuis, rdvLu()?.aReprogrammerPar]);
  dit('... trois dates en boutons sous son mot, vingt signes au plus, notees sur le rendez-vous', [3, true, true, 3], [
    b1.length, b1.every((b) => b.titre.length <= 20 && b.id.startsWith('MND:place|r:rdv-banc-r|')), corpsDesBoutons().startsWith('Merci de nous prévenir'), (rdvLu()?.placesProposees ?? []).length]);

  const choisi = b1[1] ?? b1[0];
  const [, , jour2, heure2] = String(choisi?.id ?? '|||').split('|');
  FILE = [{ texte: 'ne doit pas partir' }];
  await tour(NUM, [elleTouche(NUM, choisi?.id ?? '', choisi?.titre ?? '')]);
  dit('son toucher vaut son oui : repris sous verrou a cette place, confirme, ses marques tombent, sans Claude', ['confirmé', jour2, heure2, undefined, 1, true, 1], [
    rdvLu()?.status, rdvLu()?.date, rdvLu()?.time, rdvLu()?.aReprogrammerDepuis, REPRISES.length, (textesEnvoyes()[0] ?? '').startsWith('C’est confirmé, Mme Akouele'), FILE.length]);

  decor();
  rdvBanc({ status: 'annulé', aReprogrammerDepuis: new Date().toISOString(), aReprogrammerPar: 'opale' });
  OCCUPES.push({ jour: J2, maitre: 'm-banc', debut: '11:00', duree: 60 });
  FILE = [{ texte: 'ne doit pas partir' }];
  await tour(NUM, [elleTouche(NUM, `MND:place|r:rdv-banc-r|${J2}|11:00`, 'Sa place')]);
  dit('la place touchee vient d etre prise : d autres en boutons, jamais une date a recopier', [true, true, 'annulé'], [
    corpsDesBoutons().startsWith('Cette place vient d’être prise'), boutonsEnvoyes().length >= 1 && boutonsEnvoyes().every((b) => !b.id.endsWith(`|${J2}|11:00`)), rdvLu()?.status]);

  decor();
  rdvBanc();
  FILE = [{ texte: 'ne doit pas partir' }];
  await tour(NUM, [elleEcrit(NUM, 'Changer l’heure')], 'clientes', { deplacer: { rdvId: 'rdv-banc-r' } });
  dit('« Changer l heure » : sa place se rend tout de suite, trois dates suivent en boutons, sans Claude', ['annulé', 'cliente', 3, 1, true], [
    rdvLu()?.status, rdvLu()?.aReprogrammerPar, boutonsEnvoyes().length, FILE.length, corpsDesBoutons().includes('est libéré')]);

  /* Sa date écrite, pour une première réservation. */
  decor();
  FILE = [{ outils: [{ name: 'accommoder', input: { gestes: ['sv-plt-05-ess-c'], date: J1, heure: '15:00', pour: 'cl-banc-a' } }] }, { texte: 'C’est confirmé, Mme Akouele.' }];
  await tour(NUM, [elleEcrit(NUM, `Un shampoing le ${J1} à 15 h`)]);
  dit('elle ecrit son heure, libre : posee aussitot, son oui', [1, '15:00', true, undefined], [POSES.length, POSES[0]?.time, (resultatsDe(1)[0] ?? '').startsWith('C’est posé'), POSES[0]?.auDelaDesPlaces]);

  decor();
  OCCUPES.push({ jour: J1, maitre: 'm-banc', debut: '15:00', duree: 60 });
  FILE = [{ outils: [{ name: 'accommoder', input: { gestes: ['sv-plt-05-ess-c'], date: J1, heure: '15:00', pour: 'cl-banc-a' } }] }, { texte: 'Quinze heures est pris ; la plus proche est à seize heures.' }];
  await tour(NUM, [elleEcrit(NUM, `Un shampoing le ${J1} à 15 h`)]);
  dit('son heure prise, 16 h libre : la plus proche dans l heure en premier bouton, rien de pose', [0, true, true], [
    POSES.length, (boutonsEnvoyes()[0]?.id ?? '').endsWith(`|${J1}|16:00`), (resultatsDe(1)[0] ?? '').startsWith('Son heure est prise')]);

  decor();
  OCCUPES.push({ jour: J1, maitre: 'm-banc', debut: '15:00', duree: 120 });
  FILE = [{ outils: [{ name: 'accommoder', input: { gestes: ['sv-plt-05-ess-c'], date: J1, heure: '15:00', pour: 'cl-banc-a' } }] }, { texte: 'C’est confirmé.' }];
  const rPleine = await tour(NUM, [elleEcrit(NUM, `Un shampoing le ${J1} à 15 h`)]);
  dit('rien de libre dans l heure : posee quand meme a son heure, au-dela des fauteuils, la note et l equipe', [1, true, '15:00', true, true, 'Posé au-delà des fauteuils'], [
    POSES.length, POSES[0]?.auDelaDesPlaces, POSES[0]?.time, String(POSES[0]?.note ?? '').includes('au-delà des fauteuils'),
    (resultatsDe(1)[0] ?? '').includes('un peu pleine'), rPleine?.alerte?.titre]);

  /* Trois dates en boutons pour une première réservation, puis son toucher. */
  decor();
  FILE = [{ outils: [{ name: 'proposer_les_places', input: { gestes: ['sv-plt-05-ess-c'], pour: 'cl-banc-a', places: [{ date: J1, heure: '10:00' }, { date: J1, heure: '11:00' }, { date: J2, heure: '10:00' }] } }] }, { texte: 'Touchez la place qui vous convient.' }];
  await tour(NUM, [elleEcrit(NUM, 'Je voudrais un shampoing cette semaine')]);
  const b2 = boutonsEnvoyes();
  dit('proposer_les_places : trois boutons « place|n: », l offre gardee dans le fil', [3, true, ['sv-plt-05-ess-c']], [
    b2.length, b2.every((b) => b.id.startsWith('MND:place|n:cl-banc-a|')), fil(NUM)?.opale?.offre?.gestes]);
  FILE = [{ texte: 'ne doit pas partir' }];
  await tour(NUM, [elleTouche(NUM, b2[0]?.id ?? '', b2[0]?.titre ?? '')]);
  dit('... son toucher pose le rendez-vous, sans Claude, et l offre tombe', [1, J1, '10:00', true, 1, undefined], [
    POSES.length, POSES[0]?.date, POSES[0]?.time, !!POSES[0]?.confirmeeParLaClienteLe, FILE.length, fil(NUM)?.opale?.offre]);

  /* LA RELANCE DU LENDEMAIN : vers la 23e heure, de jour, trois NOUVELLES dates. */
  const relanceDuReport = async () => (await (await SERVIS[0](new Request('http://faux.local/functions/v1/whatsapp-automate', {
    method: 'POST', headers: { authorization: 'Bearer la-cle-de-la-maison', 'content-type': 'application/json' }, body: JSON.stringify({ relances: true }),
  }))).json());
  aHeure(mardiA(14));
  decor();
  const depuis = new Date(Date.now() - 23.5 * 3_600_000).toISOString();
  rdvBanc({ status: 'annulé', aReprogrammerDepuis: depuis, aReprogrammerPar: 'opale', placesProposees: [] });
  elleEcrit(NUM, 'Merci, je regarde', 23.5 * 3_600_000);
  FILE = [{ texte: 'ne doit pas partir' }];
  await relanceDuReport();
  const rel = boutonsEnvoyes();
  dit('la relance du lendemain : une fois, de jour, des dates en boutons, sans Claude, notee', [true, true, true, 1], [
    rel.length >= 1 && rel.length <= 3, corpsDesBoutons().startsWith('Bonjour Mme Akouele, votre rendez-vous vous attend toujours'), !!rdvLu()?.relanceDuReportLe, FILE.length]);
  const proposees = [...(rdvLu()?.placesProposees ?? [])];
  META.length = 0;
  await relanceDuReport();
  dit('... jamais deux fois', 0, META.length);

  decor();
  rdvBanc({ status: 'annulé', aReprogrammerDepuis: depuis, aReprogrammerPar: 'opale', placesProposees: proposees });
  elleEcrit(NUM, 'Merci, je regarde', 23.5 * 3_600_000);
  await relanceDuReport();
  dit('... jamais une date deja proposee', true, boutonsEnvoyes().length > 0 && boutonsEnvoyes().every((b) => !proposees.includes(b.id.split('|').slice(2).join(' '))));

  decor();
  rdvBanc({ status: 'annulé', aReprogrammerDepuis: new Date(Date.now() - 10 * 3_600_000).toISOString(), aReprogrammerPar: 'opale' });
  elleEcrit(NUM, 'Merci', 10 * 3_600_000);
  await relanceDuReport();
  dit('... pas avant la 23e heure', 0, META.length);
  aHeure(null);

  /* LA DERNIÈRE RELANCE (20 novembre 2026) : le matin du 7e jour, le modèle
     « rdv_a_reprogrammer » en deux temps, une fois ; « Voir des dates »,
     « Plus tard ». Jamais sans modèle approuvé, après un stop, l'après-midi,
     ni si elle a écrit dans les 24 heures. */
  const modeleApprouve = () => table('documents').push({ key: 'mnd_modeles_meta', data: { modeles: [{ nom: 'rdv_a_reprogrammer', etat: 'APPROVED' }] } });
  const modelesEnvoyes = (): any[] => META.filter((m) => m.type === 'template');
  aHeure(mardiA(10, 30));
  const report7 = () => ({ status: 'annulé', aReprogrammerDepuis: new Date(Date.now() - 7 * 86_400_000 - 3_600_000).toISOString(), aReprogrammerPar: 'opale', relanceDuReportLe: new Date(Date.now() - 6 * 86_400_000).toISOString() });
  decor(); modeleApprouve(); rdvBanc(report7());
  FILE = [{ texte: 'ne doit pas partir' }];
  await relanceDuReport();
  const tpl = modelesEnvoyes()[0];
  const charges = (tpl?.template?.components ?? []).filter((c: any) => c.type === 'button').map((c: any) => c.parameters?.[0]?.payload);
  dit('la derniere relance : le matin du 7e jour, le modele en deux temps, une fois, notee', ['rdv_a_reprogrammer', ['MND:report|dates|rdv-banc-r', 'MND:report|plus-tard|rdv-banc-r'], true, 1], [
    tpl?.template?.name, charges, !!rdvLu()?.derniereRelanceDuReportLe, FILE.length]);
  META.length = 0;
  await relanceDuReport();
  dit('... jamais deux fois', 0, modelesEnvoyes().length);
  decor(); rdvBanc(report7());
  await relanceDuReport();
  dit('... jamais sans modele approuve chez Meta', 0, modelesEnvoyes().length);
  decor(); modeleApprouve(); rdvBanc(report7());
  const fiche = table('clients').find((c) => c.id === 'cl-banc-a');
  if (fiche) fiche.data = { ...fiche.data, nouvelles: { par: 'stop' } };
  await relanceDuReport();
  dit('... jamais apres un « stop »', 0, modelesEnvoyes().length);
  decor(); modeleApprouve(); rdvBanc(report7());
  elleEcrit(NUM, 'Je regarde mon agenda', 5 * 3_600_000);
  await relanceDuReport();
  dit('... jamais si elle a ecrit dans les 24 heures', 0, modelesEnvoyes().filter((m) => m.template?.name === 'rdv_a_reprogrammer').length);
  aHeure(mardiA(15));
  decor(); modeleApprouve(); rdvBanc(report7());
  await relanceDuReport();
  dit('... jamais l apres-midi', 0, modelesEnvoyes().length);
  aHeure(null);

  decor(); rdvBanc(report7());
  FILE = [{ texte: 'ne doit pas partir' }];
  await tour(NUM, [elleTouche(NUM, 'MND:report|dates|rdv-banc-r', 'Voir des dates')]);
  dit('« Voir des dates » : trois dates en boutons, sans Claude', [true, 1, true], [
    boutonsEnvoyes().length >= 1 && boutonsEnvoyes().every((b) => b.id.startsWith('MND:place|r:rdv-banc-r|')), FILE.length, corpsDesBoutons().startsWith('Avec plaisir')]);
  decor(); rdvBanc(report7());
  FILE = [{ texte: 'ne doit pas partir' }];
  await tour(NUM, [elleTouche(NUM, 'MND:report|plus-tard|rdv-banc-r', 'Plus tard')]);
  dit('« Plus tard » : plus aucune relance, le rendez-vous reste a reprogrammer, un mot bref', [true, 'annulé', true, 1], [
    !!rdvLu()?.refusDuReportLe, rdvLu()?.status, (textesEnvoyes()[0] ?? '').startsWith('Bien noté, Mme Akouele'), FILE.length]);

  const consigneR = consigneDOpale();
  dit('la consigne : trois dates en boutons, accommoder, mettre a reprogrammer', [true, true, true], [
    consigneR.includes('`proposer_les_places` avec TROIS de ces places'), consigneR.includes('appelle `accommoder`'), consigneR.includes('appelle `mettre_a_reprogrammer`')]);
}

console.log(`${ko ? 'ECHEC' : 'OK   '} ${n} controles, ${ko} echec(s)`);
