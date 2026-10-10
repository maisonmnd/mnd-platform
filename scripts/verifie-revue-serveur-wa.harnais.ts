import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sansCommentaires } from './un-geste-par-passage';

/* LA REVUE DU 10 OCTOBRE 2026, LOT « SERVEUR-WA », EPROUVEE.
   Lance par `node scripts/verifie-revue-serveur-wa.mjs` (jamais seul) : le
   lanceur transforme `whatsapp-webhook` et `whatsapp-envoi` TELS QU'ILS
   SERONT COLLES, leurs imports npm remplaces par un faux module, et passe
   le dossier en argument. Le banc les EXECUTE sur un faux Supabase, un faux
   Graph et un faux web-push, en memoire : aucune requete ne part.

   Les attentes sont ecrites ici a la main, depuis la PROMESSE de chaque
   constat, jamais deduites du code eprouve :
     n0  le webhook range les messages meme quand Meta pend sur une piece ;
         tout appel reseau du webhook porte une borne de temps.
     n1  whatsapp-envoi rend la main quand Graph pend : « non remis », trace,
         pause de l'automate ; chacun de ses appels reseau est borne.
     n2  une demande du site (canal 'site') n'ouvre pas la fenetre de 24 h.
     n3  deux livraisons simultanees ne font partir qu'un seul accuse.
     n4  une relivraison de Meta ne rejoue aucun geste.
     n79 une cle d'unicite ne fait partir un message qu'une fois, meme de
         deux postes en meme temps ; un essai refuse par Meta se reprend.

   Sortie ASCII : « OK nom » ou « ECHEC nom : detail ». */

// deno-lint-ignore no-explicit-any
type Any = any;
type Fonction = (req: Request) => Promise<Response>;

const dossier = process.argv[2];
if (!dossier) { console.log('ECHEC lanceur : le dossier des fonctions manque'); process.exit(1); }

/* ── Le juge ─────────────────────────────────────────────────────────── */
let echecs = 0;
const ascii = (s: unknown): string => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
const dit = (nom: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`OK ${nom}`);
  else { echecs += 1; console.log(`ECHEC ${nom}${detail === undefined ? '' : ` : ${ascii(typeof detail === 'string' ? detail : JSON.stringify(detail))}`}`); }
};
const PEND = Symbol('pend');
const dort = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Une fonction qui ne rend pas la main en deux secondes PEND : c'est la
    panne meme que les constats n0 et n1 decrivent. */
const auPlus = <T>(p: Promise<T>, ms = 2000): Promise<T | typeof PEND> => Promise.race([p, dort(ms).then(() => PEND)]);

/* ── La fausse base ──────────────────────────────────────────────────── */
type Ligne = { id: string; branch_id?: string | null; data?: Any; updated_at?: string };
let tables = new Map<string, Map<string, Ligne>>();
let rpcs: { nom: string; args: Any }[] = [];
let tetes: Record<string, Any> = {};
let fiches: Any[] = [];
const table = (nom: string): Map<string, Ligne> => {
  if (!tables.has(nom)) tables.set(nom, new Map());
  return tables.get(nom)!;
};
/** `data->>x` comme PostgREST : un texte, ou null quand la cle manque. */
const valeur = (l: Ligne, c: string): string | null => {
  const m = /^data->>(.+)$/.exec(c);
  const v = m ? l.data?.[m[1]] : (l as Any)[c];
  return v === undefined || v === null ? null : String(v);
};
/** Une condition PostgREST simple, `col.op.val`, comme la comprend la base :
    une comparaison avec null n'est jamais vraie, sauf `is.null`. */
const condition = (txt: string): ((l: Ligne) => boolean) => {
  const m = /^(.+)\.(is|eq|neq|gt|gte|lt|lte)\.(.*)$/.exec(txt.trim());
  if (!m) throw new Error(`condition illisible : ${txt}`);
  const [, c, op, v] = m;
  return (l) => {
    const x = valeur(l, c);
    if (op === 'is') return v === 'null' ? x === null : false;
    if (x === null) return false;
    if (op === 'eq') return x === v;
    if (op === 'neq') return x !== v;
    if (op === 'gt') return x > v;
    if (op === 'gte') return x >= v;
    if (op === 'lt') return x < v;
    return x <= v;
  };
};
class Requete {
  filtres: ((l: Ligne) => boolean)[] = [];
  mode: 'select' | 'upsert' | 'update' | 'delete' = 'select';
  lignes: Ligne[] = [];
  ignore = false;
  patch: Any = null;
  rend = false;
  borne: number | null = null;
  ordre: { c: string; asc: boolean } | null = null;
  constructor(public nom: string) {}
  select() { if (this.mode !== 'select') this.rend = true; return this; }
  eq(c: string, v: unknown) { this.filtres.push(condition(`${c}.eq.${String(v)}`)); return this; }
  neq(c: string, v: unknown) { this.filtres.push(condition(`${c}.neq.${String(v)}`)); return this; }
  gt(c: string, v: unknown) { this.filtres.push(condition(`${c}.gt.${String(v)}`)); return this; }
  gte(c: string, v: unknown) { this.filtres.push(condition(`${c}.gte.${String(v)}`)); return this; }
  lte(c: string, v: unknown) { this.filtres.push(condition(`${c}.lte.${String(v)}`)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set((vs ?? []).map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  or(txt: string) { const fs = txt.split(',').map(condition); this.filtres.push((l) => fs.some((f) => f(l))); return this; }
  order(c: string, o: Any = {}) { this.ordre = { c, asc: o.ascending !== false }; return this; }
  limit(n: number) { this.borne = n; return this; }
  maybeSingle() { return this; }
  upsert(l: Any, o: Any = {}) { this.mode = 'upsert'; this.lignes = Array.isArray(l) ? l : [l]; this.ignore = !!o.ignoreDuplicates; return this; }
  update(p: Any) { this.mode = 'update'; this.patch = p; return this; }
  delete() { this.mode = 'delete'; return this; }
  then(ok: Any, ko: Any) { return Promise.resolve().then(() => this.execute()).then(ok, ko); }
  /* UNE INSTRUCTION, D'UN SEUL TENANT, comme dans Postgres : rien ne
     s'intercale entre la lecture et l'ecriture d'un meme appel. */
  execute(): Any {
    const t = table(this.nom);
    const ici = new Date().toISOString();
    if (this.mode === 'upsert') {
      const ecrites: Ligne[] = [];
      for (const l of this.lignes) {
        if (t.has(l.id) && this.ignore) continue;
        const n = { ...structuredClone(l), updated_at: ici };
        t.set(l.id, n);
        ecrites.push(n);
      }
      return { data: this.rend ? ecrites.map((l) => ({ id: l.id })) : null, error: null };
    }
    let lignes = [...t.values()].filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      for (const l of lignes) Object.assign(l, structuredClone(this.patch));
      return { data: this.rend ? lignes.map((l) => ({ id: l.id })) : null, error: null };
    }
    if (this.mode === 'delete') { for (const l of lignes) t.delete(l.id); return { data: null, error: null }; }
    if (this.ordre) {
      const { c, asc } = this.ordre;
      lignes.sort((x, y) => (String(valeur(x, c)) < String(valeur(y, c)) ? -1 : 1) * (asc ? 1 : -1));
    }
    lignes = lignes.slice(0, this.borne ?? 1000);
    return { data: lignes.map((l) => structuredClone(l)), error: null };
  }
}
const RPC: Record<string, (a: Any, auth: string) => Any> = {
  is_staff: (_a, auth) => /^Bearer staff/.test(auth),
  est_direction: (_a, auth) => /^Bearer staff-direction/.test(auth),
  tiroir_du_numero: ({ n }) => (tetes[n] ?? { tiroir: 'clientes' }).tiroir,
  tete_du_numero: ({ n }) => tetes[n] ?? { tiroir: 'clientes' },
  fiches_du_numero: ({ n }) => fiches.filter((f) => f.numeros.includes(n)),
  pause_le_fil: ({ p_numero }) => ({ id: `main-${p_numero}` }),
};
(globalThis as Any).__fauxSupabase = {
  createClient(_u: string, cle: string, o: Any = {}) {
    const auth = o?.global?.headers?.authorization ?? `Bearer ${cle}`;
    return {
      from: (nom: string) => new Requete(nom),
      rpc: async (nom: string, args: Any = {}) => {
        rpcs.push({ nom, args });
        const f = RPC[nom];
        return f ? { data: f(args, auth), error: null } : { data: null, error: { message: `function ${nom} does not exist` } };
      },
      storage: { from: () => ({ upload: async () => ({ error: null }) }) },
    };
  },
  webpush: { setVapidDetails() {}, async sendNotification() { return {}; } },
};

/* ── Le faux Graph ───────────────────────────────────────────────────── */
type Graph = { pieces: 'pend' | 'ok'; envoi: 'ok' | 'pend' | 'lent'; refus: number };
let graph: Graph = { pieces: 'ok', envoi: 'ok', refus: 0 };
let envois: { to: string; body: Any }[] = [];
let bornes: number[] = [];
/** Une requete qui ne repond jamais. Seul un signal la libere : sans borne
    de temps, elle tient la fonction pour toujours, comme un Graph qui pend. */
const pendante = (init: Any): Promise<Response> => new Promise((_ok, ko) => {
  const s: AbortSignal | undefined = init?.signal;
  if (s) s.addEventListener('abort', () => ko(s.reason ?? new Error('abort')));
});
(globalThis as Any).fetch = async (url: Any, init: Any = {}) => {
  const u = String(url);
  if (u.startsWith('https://graph.facebook.com/') && u.endsWith('/messages')) {
    const body = JSON.parse(String(init.body ?? '{}'));
    if (graph.envoi === 'pend') return pendante(init);
    if (graph.envoi === 'lent') await dort(40);
    envois.push({ to: String(body.to ?? ''), body });
    if (graph.refus > 0) {
      graph.refus -= 1;
      return new Response(JSON.stringify({ error: { message: 'Re-engagement message' } }), { status: 400 });
    }
    return new Response(JSON.stringify({ messages: [{ id: `wamid.out-${envois.length}` }] }), { status: 200 });
  }
  if (u.startsWith('https://graph.facebook.com/') && u.endsWith('/media')) {
    return new Response(JSON.stringify({ id: 'media-1' }), { status: 200 });
  }
  if (u.startsWith('https://graph.facebook.com/')) {
    if (graph.pieces === 'pend') return pendante(init);
    return new Response(JSON.stringify({ url: 'https://cdn.meta.test/f', mime_type: 'image/jpeg', file_size: 3 }), { status: 200 });
  }
  if (u.startsWith('https://cdn.meta.test/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  if (u.includes('/functions/v1/whatsapp-automate')) return new Response(JSON.stringify({ pris: false }), { status: 200 });
  throw new Error(`appel reseau inattendu : ${u}`);
};
/* LES BORNES DE TEMPS SE NOTENT ET SE RACCOURCISSENT : dix secondes au
   banc ne prouveraient rien de plus que trente millisecondes. */
const vraiTimeout = AbortSignal.timeout.bind(AbortSignal);
(AbortSignal as Any).timeout = (ms: number) => { bornes.push(ms); return vraiTimeout(Math.min(ms, 30)); };
/* Les journaux des fonctions se taisent : le banc parle seul. */
console.error = () => {};
const vraiLog = console.log.bind(console);
console.log = (...a: Any[]) => { const t = a.join(' '); if (!/^whatsapp-/.test(t)) vraiLog(...a); };

/* ── Les fonctions, telles qu'elles seront collees ────────────────────── */
const ENV: Record<string, string> = {
  SUPABASE_URL: 'https://banc.supabase.test', CLE_SERVICE: 'service', SUPABASE_ANON_KEY: 'anon',
  WA_TOKEN: 'jeton', WA_PHONE_ID: '999', WA_APP_SECRET: 'secret-du-banc',
};
async function charge(nom: string): Promise<Fonction> {
  let h: Fonction | null = null;
  (globalThis as Any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (x: Fonction) => { h = x; } };
  await import(pathToFileURL(path.join(dossier, `${nom}.mjs`)).href);
  if (!h) throw new Error(`${nom} n ouvre pas sa porte`);
  return h;
}
const webhook = await charge('whatsapp-webhook');
const envoi = await charge('whatsapp-envoi');

const remetsLaBase = () => {
  tables = new Map(); rpcs = []; tetes = {}; fiches = []; envois = []; bornes = [];
  graph = { pieces: 'ok', envoi: 'ok', refus: 0 };
};
const livraison = (messages: Any[]): Request => {
  const corps = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '999' }, messages } }] }] });
  const sig = createHmac('sha256', ENV.WA_APP_SECRET).update(corps).digest('hex');
  return new Request('https://banc/functions/v1/whatsapp-webhook', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${sig}` }, body: corps,
  });
};
const unEnvoi = (corps: Any): Request => new Request('https://banc/functions/v1/whatsapp-envoi', {
  method: 'POST', headers: { authorization: 'Bearer staff-direction', 'content-type': 'application/json' }, body: JSON.stringify(corps),
});
const ilYA = (ms: number) => new Date(Date.now() - ms).toISOString();
const secondes = () => String(Math.floor(Date.now() / 1000));
const NUM = '22990000001';
const PRESTA = '22990000011';
const entrantDuFil = (id: string, extra: Any = {}) => table('messages_wa').set(id, {
  id, data: { id, sens: 'entrant', numero: NUM, texte: 'bonjour', quand: ilYA(3600000), ...extra },
});

/* ── n0 · le webhook range ses messages quand Meta pend sur une piece ── */
remetsLaBase();
tetes[PRESTA] = { tiroir: 'prestataires' };
graph.pieces = 'pend';
{
  const r = await auPlus(webhook(livraison([{ id: 'wamid.in-1', from: PRESTA, type: 'image', timestamp: secondes(), image: { id: 'm-1', mime_type: 'image/jpeg' } }])));
  const ligne = table('messages_wa').get('wa-wamid.in-1');
  dit('n0 une piece qui pend chez Meta n empeche pas le message de se ranger', r !== PEND && !!ligne && !ligne.data?.piece?.chemin,
    r === PEND ? 'le webhook pend toujours apres 2 s' : { ligne: !!ligne, piece: ligne?.data?.piece });
  dit('n0 la borne de Graph est de dix secondes', bornes.includes(10_000), bornes);
}

/* LA REGLE, PAS LE CAS DU JOUR : tout `fetch(` des deux fonctions porte sa
   borne. Commentaires effaces : un appel raconte n'est pas un appel. */
const appelsReseau = (src: string): string[] => {
  const s = sansCommentaires(src);
  const out: string[] = [];
  let i = s.indexOf('fetch(');
  while (i >= 0) {
    let p = 0;
    let k = i + 5;
    for (; k < s.length; k += 1) {
      if (s[k] === '(') p += 1;
      else if (s[k] === ')') { p -= 1; if (p === 0) break; }
    }
    out.push(s.slice(i, k + 1));
    i = s.indexOf('fetch(', k);
  }
  return out;
};
const racine = process.cwd();
for (const [n, f, combien] of [['n0', 'whatsapp-webhook', 9], ['n1', 'whatsapp-envoi', 5]] as const) {
  const appels = appelsReseau(readFileSync(path.join(racine, `supabase/functions/${f}/index.ts`), 'utf8'));
  const nus = appels.filter((a) => !a.includes('signal: AbortSignal.timeout('));
  dit(`${n} chaque fetch de ${f} porte une borne de temps (${combien} appels)`, appels.length === combien && nus.length === 0,
    { appels: appels.length, sansBorne: nus.map((a) => a.slice(0, 90)) });
}

/* ── n1 · whatsapp-envoi rend la main quand Graph pend ─────────────── */
remetsLaBase();
entrantDuFil('wa-in-a');
graph.envoi = 'pend';
{
  const r = await auPlus(envoi(unEnvoi({ numero: NUM, texte: 'Avec plaisir.', parQui: 'Y. B.' })));
  const traces = [...table('messages_wa').values()].filter((l) => l.data?.sens === 'sortant');
  dit('n1 un envoi qui pend chez Graph rend la main : non remis, trace, pause', r !== PEND && (r as Response).status === 502
    && traces.length === 1 && traces[0].data.etat === 'non-remis' && rpcs.some((x) => x.nom === 'pause_le_fil'),
  r === PEND ? 'whatsapp-envoi pend toujours apres 2 s' : { statut: (r as Response).status, traces: traces.map((t) => t.data.etat) });
}

/* ── n2 · une demande du site n'ouvre pas la fenetre ───────────────── */
remetsLaBase();
entrantDuFil('site-1', { canal: 'site', texte: 'Demande du site' });
{
  const r = await envoi(unEnvoi({ numero: NUM, texte: 'Bonjour, Madame.' }));
  dit('n2 une demande du site seule laisse la fenetre fermee (409, rien chez Graph)', r.status === 409 && envois.length === 0,
    { statut: r.status, envois: envois.length });
}
remetsLaBase();
entrantDuFil('site-1', { canal: 'site', texte: 'Demande du site' });
entrantDuFil('wa-in-b');
{
  const r = await envoi(unEnvoi({ numero: NUM, texte: 'Bonjour, Madame.' }));
  dit('n2 un vrai message WhatsApp ouvre la fenetre (canal absent)', r.status === 200 && envois.length === 1, { statut: r.status, envois: envois.length });
}

/* ── n3 · deux livraisons simultanees, un seul accuse ──────────────── */
remetsLaBase();
tetes[PRESTA] = { tiroir: 'prestataires' };
graph.envoi = 'lent';
{
  const piece = (id: string, media: string) => ({ id, from: PRESTA, type: 'image', timestamp: secondes(), image: { id: media, mime_type: 'image/jpeg' } });
  await Promise.all([webhook(livraison([piece('wamid.in-2', 'm-2')])), webhook(livraison([piece('wamid.in-3', 'm-3')]))]);
  const accuses = envois.filter((e) => e.to === PRESTA);
  const lignes = [...table('messages_wa').values()].filter((l) => l.data?.auto === 'accuse');
  dit('n3 deux livraisons simultanees ne font partir qu un seul Bien recu', accuses.length === 1 && lignes.length === 1
    && lignes[0].data.waId === 'wamid.out-1' && lignes[0].data.etat === 'en-route',
  { envois: accuses.length, lignes: lignes.map((l) => ({ id: l.id, waId: l.data.waId, etat: l.data.etat })) });
}

/* ── n4 · une relivraison ne rejoue aucun geste ────────────────────── */
const reprise = () => {
  remetsLaBase();
  fiches = [{ id: 'c1', nom: 'Naffi', civilite: 'madame', numeros: [NUM] }];
  table('appointments').set('rdv-1', {
    id: 'rdv-1', data: { id: 'rdv-1', clientId: 'c1', clientName: 'Naffi', date: '2026-10-20', time: '10:00', status: 'confirmé', confirmeeParLaClienteLe: '2026-10-09T08:00:00.000Z' },
  });
};
const bouton = (id: string) => ({ id, from: NUM, type: 'interactive', timestamp: secondes(), interactive: { type: 'button_reply', button_reply: { id: 'REPRISE_AUTRE:rdv-1', title: 'Un autre moment' } } });
reprise();
entrantDuFil('wa-wamid.btn-1', { texte: 'Un autre moment', bouton: { id: 'REPRISE_AUTRE:rdv-1' } });
{
  await webhook(livraison([bouton('wamid.btn-1')]));
  const rdv = table('appointments').get('rdv-1')!.data;
  dit('n4 une relivraison tardive de Un autre moment n efface pas Je confirme', rdv.confirmeeParLaClienteLe === '2026-10-09T08:00:00.000Z'
    && rdv.autreMomentDemandeLe === undefined && envois.length === 0, { rdv, envois: envois.length });
}
reprise();
{
  await webhook(livraison([bouton('wamid.btn-2')]));
  const rdv = table('appointments').get('rdv-1')!.data;
  dit('n4 un bouton neuf joue toujours', typeof rdv.autreMomentDemandeLe === 'string' && rdv.confirmeeParLaClienteLe === undefined
    && envois.filter((e) => e.to === NUM).length === 1, { rdv, envois: envois.length });
}
{
  /* LA REGLE : apres l'ecriture des messages, chaque boucle sur les
     entrants teste d'abord qu'ils sont neufs. Cinq boucles : l'automate,
     les versements, la reprise, le conge, les deux messages automatiques. */
  const src = sansCommentaires(readFileSync(path.join(racine, 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8'));
  const ancre = src.indexOf(".upsert(lignes, { onConflict: 'id', ignoreDuplicates: true }).select('id');");
  const boucles: string[] = [];
  let i = src.indexOf('for (const e of entrants) {', ancre);
  while (ancre >= 0 && i >= 0) {
    boucles.push(src.slice(i, i + 110).replace(/\s+/g, ' '));
    i = src.indexOf('for (const e of entrants) {', i + 1);
  }
  const nues = boucles.filter((b) => !/^for \(const e of entrants\) \{ (if \(!estNeuf\(e\)|if \(!neufs\.has\(`wa-\$\{e\.waId\}`\))/.test(b));
  dit('n4 chaque boucle de gestes ne joue que les messages neufs (5 boucles)', boucles.length === 5 && nues.length === 0, { boucles: boucles.length, nues });
}

/* ── n79 · la cle d'unicite ────────────────────────────────────────── */
const merci = { numero: NUM, modele: 'parrainage_merci', variables: ['Madame Naffi', 'A.', 'un soin'], cleUnique: 'merci:c1:parr-1' };
remetsLaBase();
graph.envoi = 'lent';
{
  const [a, b] = await Promise.all([envoi(unEnvoi(merci)), envoi(unEnvoi(merci))]);
  const [ja, jb] = [await a.json(), await b.json()];
  const lignes = [...table('messages_wa').values()].filter((l) => l.data?.cleUnique === merci.cleUnique);
  dit('n79 deux postes, un seul merci : un envoi chez Graph, le second dit deja', envois.length === 1 && a.status === 200 && b.status === 200
    && ja.id === jb.id && [ja.deja, jb.deja].filter(Boolean).length === 1 && lignes.length === 1 && lignes[0].data.waId === 'wamid.out-1',
  { envois: envois.length, ja, jb, lignes: lignes.length });
}
remetsLaBase();
graph.refus = 1;
{
  const r1 = await envoi(unEnvoi(merci));
  const r2 = await envoi(unEnvoi(merci));
  const r3 = await envoi(unEnvoi(merci));
  const j3 = await r3.json();
  const lignes = [...table('messages_wa').values()].filter((l) => l.data?.cleUnique === merci.cleUnique);
  dit('n79 un merci refuse par Meta se reprend, puis ne repart plus', r1.status === 502 && r2.status === 200 && r3.status === 200 && j3.deja === true
    && envois.length === 2 && lignes.length === 1 && lignes[0].data.etat === 'en-route' && lignes[0].data.waId === 'wamid.out-2',
  { statuts: [r1.status, r2.status, r3.status], envois: envois.length, lignes: lignes.map((l) => l.data) });
}
remetsLaBase();
{
  const sans = { ...merci, cleUnique: undefined };
  await envoi(unEnvoi(sans));
  await envoi(unEnvoi(sans));
  dit('n79 sans cle, rien ne change : deux envois partent', envois.length === 2, { envois: envois.length });
}

console.log(echecs === 0 ? '\nTout tient.' : `\n${echecs} ECHEC(S).`);
process.exit(echecs === 0 ? 0 : 1);
