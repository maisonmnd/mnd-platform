/* LE LOT « SERVEUR-SITE » DE LA REVUE, EPROUVE — `node scripts/verifie-revue-serveur-site.mjs`.

   10 octobre 2026, revue de nuit. Le banc charge les VRAIES fonctions Edge
   (kkiapay-verify, kkiapay-webhook, confirmation-rdv, rappels-j1,
   envois-partent, push-notify, avis-google-releve), transformees par
   esbuild, sur un faux Supabase en memoire et un faux reseau. Il rejoue
   chaque constat comme un recit, avec ses attendus ECRITS EN DUR : ils
   viennent de la promesse (une transaction regle une carte, un acompte de
   25 000 F ne se confirme pas pour 100 F...), jamais du code eprouve.

   La migration 0126 se lit ici comme un texte (commentaires effaces,
   motifs en String.raw) ; elle est jouee en vrai dans PGlite par l'essai
   hors depot (dossier de la revue).

   Rien ne part vers Supabase, Meta, KkiaPay, Google ni Twilio : le reseau
   est un faux. Le dossier des fonctions transformees est donne par le
   lanceur (BANC_DOSSIER) et efface par lui. Sortie ASCII. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// deno-lint-ignore no-explicit-any
type Any = any;

let ko = 0;
const ascii = (s: unknown) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '?');
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${ascii(nom)} -> ${ascii(JSON.stringify(obtenu))}`);
  if (!ok) console.log(`       attendu ${ascii(JSON.stringify(attendu))}`);
};
const lit = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const DOSSIER = process.env.BANC_DOSSIER ?? '';
if (!DOSSIER) { console.log('ECHEC le lanceur doit donner BANC_DOSSIER'); process.exit(1); }
mkdirSync(DOSSIER, { recursive: true });

/* ══ LE FAUX SUPABASE ════════════════════════════════════════════════ */
let BASE = new Map<string, Map<string, Any>>();
const remetLaBase = () => { BASE = new Map(); };
const table = (t: string) => { if (!BASE.has(t)) BASE.set(t, new Map()); return BASE.get(t)!; };
const cleDe = (t: string, l: Any): string =>
  t === 'documents' ? String(l.key) : t === 'push_reminders' ? `${l.appointment_id}|${l.kind}` : t === 'edge_rate_limits' ? `${Math.random()}` : String(l.id);
const pose = (t: string, l: Any) => table(t).set(cleDe(t, l), structuredClone(l));
const ligne = (t: string, id: string) => table(t).get(id);
const valeur = (l: Any, c: string): unknown => {
  if (c.startsWith('data->>')) { const v = l.data?.[c.slice(7)]; return v === undefined || v === null ? null : String(v); }
  const v = l[c]; return v === undefined ? null : v;
};
class Requete {
  t: string; filtres: ((l: Any) => boolean)[] = []; mode = 'select'; lignes: Any[] = []; patch: Any = null;
  unique = false; ignore = false; rend = false; ordre: string | null = null; borne: number | null = null;
  constructor(t: string) { this.t = t; }
  select() { if (this.mode !== 'select') this.rend = true; return this; }
  eq(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && String(valeur(l, c)) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) !== String(v)); return this; }
  gt(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && String(valeur(l, c)) > String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && String(valeur(l, c)) >= String(v)); return this; }
  lt(c: string, v: unknown) { this.filtres.push((l) => valeur(l, c) !== null && String(valeur(l, c)) < String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set((vs ?? []).map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  is(c: string, v: unknown) { this.filtres.push((l) => (v === null ? valeur(l, c) === null : valeur(l, c) === v)); return this; }
  order(c: string) { this.ordre = c; return this; }
  limit(n: number) { this.borne = n; return this; }
  maybeSingle() { this.unique = true; return this; }
  single() { this.unique = true; return this; }
  insert(l: Any) { this.mode = 'insert'; this.lignes = Array.isArray(l) ? l : [l]; return this; }
  upsert(l: Any, o: Any = {}) { this.mode = 'upsert'; this.lignes = Array.isArray(l) ? l : [l]; this.ignore = !!o.ignoreDuplicates; return this; }
  update(p: Any) { this.mode = 'update'; this.patch = p; return this; }
  delete() { this.mode = 'delete'; return this; }
  then(ok: Any, ko2: Any) { return Promise.resolve().then(() => this.execute()).then(ok, ko2); }
  execute(): Any {
    const t = table(this.t);
    if (this.mode === 'insert') {
      if (this.lignes.some((l) => t.has(cleDe(this.t, l)))) return { data: null, error: { code: '23505', message: 'duplicate key' } };
      for (const l of this.lignes) pose(this.t, l);
      return { data: this.rend ? this.lignes.map((l) => ({ id: l.id })) : null, error: null };
    }
    if (this.mode === 'upsert') {
      const ecrites: Any[] = [];
      for (const l of this.lignes) { if (this.ignore && t.has(cleDe(this.t, l))) continue; pose(this.t, l); ecrites.push(l); }
      return { data: this.rend ? ecrites.map((l) => ({ id: l.id })) : null, error: null };
    }
    let lignes = [...t.values()].filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      for (const l of lignes) Object.assign(l, structuredClone(this.patch));
      return { data: this.rend ? lignes.map((l) => ({ id: l.id })) : null, error: null };
    }
    if (this.mode === 'delete') { for (const l of lignes) t.delete(cleDe(this.t, l)); return { data: null, error: null }; }
    if (this.ordre) { const c = this.ordre; lignes.sort((a, b) => (String(valeur(a, c)) < String(valeur(b, c)) ? -1 : 1)); }
    lignes = lignes.slice(0, this.borne ?? 1000).map((l) => structuredClone(l));
    if (this.unique) return { data: lignes[0] ?? null, error: null };
    return { data: lignes, error: null };
  }
}
const POUSSES: Any[] = [];
(globalThis as Any).__faux = {
  createClient: () => ({
    from: (t: string) => new Requete(t),
    auth: { getUser: async () => ({ data: { user: null } }) },
    rpc: async () => ({ data: null, error: { message: 'pas de rpc au banc' } }),
  }),
  webpush: {
    setVapidDetails() {},
    async sendNotification(s: Any, p: string) { POUSSES.push({ endpoint: s.endpoint, ...JSON.parse(p) }); return {}; },
  },
};

/* ══ LE FAUX RESEAU ══════════════════════════════════════════════════ */
const TX: Record<string, { status: string; amount: number; fees?: number; source?: string }> = {};
const APPELS: { url: string; signal: boolean; body: Any }[] = [];
let suspendreLeGraphAuNumero = 0; // 0 : jamais ; n : le n-ieme appel a Meta ne repond jamais
let appelsMeta = 0;
let auNieme: (() => void) | null = null;
(globalThis as Any).fetch = async (url: Any, init: Any = {}) => {
  const u = String(url);
  const body = typeof init.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : init.body;
  APPELS.push({ url: u, signal: init.signal instanceof AbortSignal, body });
  const rep = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (u.includes('/api/v1/transactions/status')) {
    const tx = TX[String(body?.transactionId)];
    return tx ? rep(tx) : rep({ message: 'not found' }, 404);
  }
  if (u.startsWith('https://graph.facebook.com/')) {
    appelsMeta += 1;
    if (suspendreLeGraphAuNumero && appelsMeta === suspendreLeGraphAuNumero) { auNieme?.(); return new Promise(() => {}); }
    return rep({ messages: [{ id: `wamid.banc-${appelsMeta}` }] });
  }
  if (u.includes('/functions/v1/push-notify')) return rep({ sent: 1 });
  if (u.startsWith('https://api.twilio.com/')) return rep({ sid: 'SM1' });
  if (u.startsWith('https://places.googleapis.com/')) {
    return rep({ rating: 4.9, userRatingCount: 12, googleMapsUri: 'https://maps.example/fiche', reviews: [{ rating: 5, text: { text: 'Belle maison' }, authorAttribution: { displayName: 'A.' }, relativePublishTimeDescription: 'il y a un mois' }] });
  }
  return rep({ error: `inattendu ${u}` }, 500);
};

/* ══ L'HORLOGE ═══════════════════════════════════════════════════════ */
const VraiDate = Date;
async function aLHeure<T>(iso: string, f: () => Promise<T>): Promise<T> {
  const decalage = VraiDate.parse(iso) - VraiDate.now();
  class DateDuBanc extends VraiDate {
    constructor(...a: Any[]) { if (a.length === 0) super(VraiDate.now() + decalage); else super(...(a as [Any])); }
    static now() { return VraiDate.now() + decalage; }
  }
  (globalThis as Any).Date = DateDuBanc;
  try { return await f(); } finally { (globalThis as Any).Date = VraiDate; }
}

/* ══ LES FONCTIONS, CHARGEES TELLES QU'ON LES COLLE ══════════════════ */
let ENV: Record<string, string> = {};
(globalThis as Any).Deno = { env: { get: (k: string) => ENV[k] }, serve: () => {} };
const cale = path.join(DOSSIER, 'faux-supabase.mjs');
writeFileSync(cale, `const f = globalThis.__faux;
export const createClient = (...a) => f.createClient(...a);
export default { setVapidDetails: (...a) => f.webpush.setVapidDetails(...a), sendNotification: (...a) => f.webpush.sendNotification(...a) };
`);
let esb: Any = null;
type Porte = (req: Request) => Promise<Response>;
async function charge(nom: string, env: Record<string, string>, variante = ''): Promise<Porte> {
  esb ??= await import(pathToFileURL(path.join(process.cwd(), 'node_modules/esbuild/lib/main.js')).href);
  const u = pathToFileURL(cale).href;
  const src = lit(`supabase/functions/${nom}/index.ts`)
    .split("'https://esm.sh/@supabase/supabase-js@2'").join(`'${u}'`)
    .split("'npm:@supabase/supabase-js@2'").join(`'${u}'`)
    .split("'npm:web-push@3.6.7'").join(`'${u}'`);
  const { code } = await esb.transform(src, { loader: 'ts', format: 'esm' });
  const f = path.join(DOSSIER, `${nom}${variante}.mjs`);
  writeFileSync(f, code);
  ENV = env;
  let h: Porte | null = null;
  (globalThis as Any).Deno.serve = (x: Porte) => { h = x; };
  await import(pathToFileURL(f).href);
  if (!h) throw new Error(`${nom} n ouvre pas sa porte`);
  const porte = h as Porte;
  return (req: Request) => { ENV = env; return porte(req); };
}
const corpsDe = async (r: Response) => { try { return await r.json(); } catch { return null; } };

const SERVICE = 'sb_secret_banc_service_cle_0123456789';
const ENV_KKIA = { SUPABASE_URL: 'https://banc.supabase.co', SERVICE_KEY: SERVICE, KKIAPAY_PUBLIC_KEY: 'p', KKIAPAY_PRIVATE_KEY: 'q', KKIAPAY_SECRET_KEY: 'r', KKIAPAY_WEBHOOK_SECRET: 'secret-du-filet' };
const ENV_CRON = { SUPABASE_URL: 'https://banc.supabase.co', CLE_SERVICE: SERVICE, WA_TOKEN: 'tok', WA_PHONE_ID: '123' };

const verify = await charge('kkiapay-verify', ENV_KKIA);
const webhook = await charge('kkiapay-webhook', ENV_KKIA);
const appelVerify = async (corps: Any) => {
  const r = await verify(new Request('https://banc/functions/v1/kkiapay-verify', { method: 'POST', body: JSON.stringify(corps) }));
  return { status: r.status, corps: await corpsDe(r) };
};
const appelWebhook = async (transactionId: string, partnerId: string) => {
  await webhook(new Request('https://banc/functions/v1/kkiapay-webhook', {
    method: 'POST', headers: { 'x-kkiapay-secret': 'secret-du-filet' },
    body: JSON.stringify({ transactionId, isPaymentSucces: true, stateData: JSON.stringify({ partnerId, branchId: 'br' }) }),
  }));
};
const carte = (id: string, plus: Any = {}) => pose('cartes_cadeaux', { id, branch_id: 'br', data: { id, branchId: 'br', statut: 'a-regler', objet: 'montant', montantXof: 25000, pour: 'Awa', de: 'Rama', ...plus } });

/* ══ 15 · UNE TRANSACTION NE REGLE QU'UNE CARTE ══════════════════════ */
{
  remetLaBase();
  carte('cc-aaaaaaaaaaaa'); carte('cc-bbbbbbbbbbbb');
  TX.T1 = { status: 'SUCCESS', amount: 25000, fees: 475, source: 'MOBILE_MONEY' };
  const a = await appelVerify({ transactionId: 'T1', carteId: 'cc-aaaaaaaaaaaa', branchId: 'br' });
  dit('15 : la carte payee est reglee, son code rendu', [200, 'reglee', true], [a.status, ligne('cartes_cadeaux', 'cc-aaaaaaaaaaaa')?.data?.statut, /^MND-/.test(a.corps?.carte?.code ?? '')]);
  const b = await appelVerify({ transactionId: 'T1', carteId: 'cc-bbbbbbbbbbbb', branchId: 'br' });
  dit('15 : la meme transaction rejouee sur une autre carte ne la regle pas', [409, 'a-regler', false],
    [b.status, ligne('cartes_cadeaux', 'cc-bbbbbbbbbbbb')?.data?.statut, table('credit_movements').has('cre-cc-bbbbbbbbbbbb')]);
  await appelWebhook('T1', 'cc-bbbbbbbbbbbb');
  dit('15 : ... ni par le filet', ['a-regler', false], [ligne('cartes_cadeaux', 'cc-bbbbbbbbbbbb')?.data?.statut, table('credit_movements').has('cre-cc-bbbbbbbbbbbb')]);
  const c = await appelVerify({ transactionId: 'T1', carteId: 'cc-aaaaaaaaaaaa', branchId: 'br' });
  dit('15 : rejouee sur SA carte, elle rend le meme code', [200, a.corps?.carte?.code], [c.status, c.corps?.carte?.code]);

  pose('appointments', { id: 'a-rdv1', branch_id: 'br', data: { id: 'a-rdv1', depositXof: 25000, status: 'confirmé' } });
  carte('cc-cccccccccccc');
  TX.T2 = { status: 'SUCCESS', amount: 25000 };
  const d = await appelVerify({ transactionId: 'T2', apptId: 'a-rdv1', carteId: 'cc-cccccccccccc', branchId: 'br' });
  dit('15 : un rendez-vous ET une carte dans la meme requete se refusent, rien ne bouge', [400, 'cibles_multiples', undefined, 'a-regler', false],
    [d.status, d.corps?.error, ligne('appointments', 'a-rdv1')?.data?.depositConfirmed, ligne('cartes_cadeaux', 'cc-cccccccccccc')?.data?.statut, table('payments').has('T2')]);
}

/* ══ 16 · LE MONTANT ATTENDU EST CELUI DE LA CIBLE, JAMAIS ZERO ══════ */
{
  remetLaBase();
  pose('appointments', { id: 'a-rdv1', branch_id: 'br', data: { id: 'a-rdv1', depositXof: 25000, status: 'confirmé' } });
  TX.T3 = { status: 'SUCCESS', amount: 100 };
  const a = await appelVerify({ transactionId: 'T3', apptId: 'a-rdv1', inscriptionId: 'dem-inventee', branchId: 'br' });
  dit('16 : rendez-vous + inscription inventee : refuse, acompte non confirme', [400, undefined], [a.status, ligne('appointments', 'a-rdv1')?.data?.depositConfirmed]);
  const b = await appelVerify({ transactionId: 'T3', apptId: 'a-rdv1', branchId: 'br' });
  dit('16 : 100 F pour un acompte de 25 000 F : refuse', [402, 'amount_mismatch', undefined], [b.status, b.corps?.error, ligne('appointments', 'a-rdv1')?.data?.depositConfirmed]);
  pose('academie_demandes', { id: 'dem-sans', branch_id: 'br', data: { id: 'dem-sans' } });
  const c = await appelVerify({ transactionId: 'T3', inscriptionId: 'dem-sans', expectedXof: 100, branchId: 'br' });
  dit('16 : une inscription sans acompte ne retombe pas sur le corps : 404', [404, undefined], [c.status, ligne('academie_demandes', 'dem-sans')?.data?.acompteConfirme]);
  pose('appointments', { id: 'a-sans', branch_id: 'br', data: { id: 'a-sans', status: 'confirmé' } });
  const e = await appelVerify({ transactionId: 'T3', apptId: 'a-sans', expectedXof: 100, branchId: 'br' });
  dit('16 : un rendez-vous sans acompte demande ne se confirme pas pour 100 F', [404, undefined], [e.status, ligne('appointments', 'a-sans')?.data?.depositConfirmed]);
  TX.T9 = { status: 'SUCCESS', amount: 25000 };
  const f = await appelVerify({ transactionId: 'T9', apptId: 'a-rdv1', branchId: 'br' });
  dit('16 : le bon montant confirme l acompte', [200, true, 25000], [f.status, ligne('appointments', 'a-rdv1')?.data?.depositConfirmed, ligne('appointments', 'a-rdv1')?.data?.depositXof]);
}

/* ══ 17 · LE FILET CONFIRME L'ACADEMIE, UN REJEU POSE L'EFFET ════════ */
{
  remetLaBase();
  pose('academie_demandes', { id: 'dem-1', branch_id: 'br', data: { id: 'dem-1', acompteXof: 40000 } });
  TX.T7 = { status: 'SUCCESS', amount: 40000 };
  await appelWebhook('T7', 'dem-1');
  const d = ligne('academie_demandes', 'dem-1')?.data ?? {};
  dit('17 : le filet seul confirme l acompte d une inscription', [true, 40000, 'T7'], [d.acompteConfirme, d.acompteVerseXof, d.transactionId]);
  pose('academie_demandes', { id: 'dem-2', branch_id: 'br', data: { id: 'dem-2', acompteXof: 40000 } });
  pose('payments', { id: 'T8', branch_id: 'br', data: { id: 'T8', partnerId: 'dem-2', amountXof: 40000, status: 'success' } });
  TX.T8 = { status: 'SUCCESS', amount: 40000 };
  const v = await appelVerify({ transactionId: 'T8', inscriptionId: 'dem-2', branchId: 'br' });
  dit('17 : deja au registre (filet passe avant), la verification pose quand meme l acompte', [200, true], [v.status, ligne('academie_demandes', 'dem-2')?.data?.acompteConfirme]);
  pose('academie_demandes', { id: 'dem-3', branch_id: 'br', data: { id: 'dem-3', acompteXof: 40000 } });
  const w = await appelVerify({ transactionId: 'T8', inscriptionId: 'dem-3', branchId: 'br' });
  dit('17 : ... mais pas sur une AUTRE inscription que celle du registre (409)', [409, 'transaction_deja_utilisee', undefined], [w.status, w.corps?.error, ligne('academie_demandes', 'dem-3')?.data?.acompteConfirme]);
  /* Ma Couronne paie AVANT d'ecrire le rendez-vous : le filet confirme ensuite. */
  TX.T6 = { status: 'SUCCESS', amount: 25000 };
  const x = await appelVerify({ transactionId: 'T6', apptId: 'a-neuf', branchId: 'br' });
  pose('appointments', { id: 'a-neuf', branch_id: 'br', data: { id: 'a-neuf', depositXof: 25000, status: 'en attente' } });
  await appelWebhook('T6', 'a-neuf');
  dit('17 : rendez-vous paye avant d exister : registre d abord, acompte confirme par le filet', [200, 'a-neuf', true],
    [x.status, ligne('payments', 'T6')?.data?.partnerId, ligne('appointments', 'a-neuf')?.data?.depositConfirmed]);
}

/* ══ 24 · UN GESTE NE SE REGLE PAS EN LIGNE ══════════════════════════ */
{
  remetLaBase();
  carte('cc-gggggggggggg', { objet: 'geste', geste: 'Création complète', montantXof: 100 });
  TX.T5 = { status: 'SUCCESS', amount: 100 };
  const a = await appelVerify({ transactionId: 'T5', carteId: 'cc-gggggggggggg', branchId: 'br' });
  dit('24 : un geste a montant glisse ne se regle pas par la verification', [404, 'a-regler'], [a.status, ligne('cartes_cadeaux', 'cc-gggggggggggg')?.data?.statut]);
  await appelWebhook('T5', 'cc-gggggggggggg');
  dit('24 : ... ni par le filet', ['a-regler', false], [ligne('cartes_cadeaux', 'cc-gggggggggggg')?.data?.statut, table('credit_movements').has('cre-cc-gggggggggggg')]);
}

/* ══ LES JUMEAUX : verify et webhook portent le meme texte ═══════════ */
{
  const v = lit('supabase/functions/kkiapay-verify/index.ts');
  const w = lit('supabase/functions/kkiapay-webhook/index.ts');
  const corps = (t: string, debut: string, fin: string) => { const a = t.indexOf(debut); const b = t.indexOf(fin, a); return a < 0 || b < 0 ? '' : t.slice(a, b); };
  const ap = (t: string) => corps(t, 'async function applyPayment(', '\n}\n');
  const rc = (t: string) => corps(t, 'async function regleLaCarte(', "throw new Error('carte_non_reglee');");
  dit('jumeaux : applyPayment identique dans verify et webhook', true, ap(v).length > 500 && ap(v) === ap(w));
  dit('jumeaux : regleLaCarte identique dans verify et webhook', true, rc(v).length > 500 && rc(v) === rc(w));
  dit('verify ne lit plus expectedXof du corps', false, /expectedXof\s*\?\?/.test(v.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
}

/* ══ 18 · LA RAFALE NE COMPTE QUE CE QUI RESTE A DIRE ════════════════ */
const ilYa = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const dansJours = (j: number) => new Date(Date.now() + j * 86_400_000 + 3_600_000).toISOString().slice(0, 10);
const rdvNeuf = (id: string, clientId: string) => {
  pose('appointments', { id, branch_id: 'br', updated_at: ilYa(5), data: { id, branchId: 'br', clientId, date: dansJours(3), time: '10:00', status: 'confirmé', source: 'trone', creeLe: ilYa(10) } });
  pose('clients', { id: clientId, data: { id: clientId, name: 'Awa Test', phone: '0197000001' } });
};
const confirmer = await charge('confirmation-rdv', ENV_CRON);
const appelCron = (porte: Porte, nom: string) => porte(new Request(`https://banc/functions/v1/${nom}`, { method: 'POST', headers: { authorization: `Bearer ${SERVICE}` } }));
{
  remetLaBase(); APPELS.length = 0;
  for (let i = 1; i <= 6; i++) {
    rdvNeuf(`a-deja${i}`, `c-${i}`);
    for (const canal of ['push', 'whatsapp']) pose('envois', { id: `conf-a-deja${i}-${canal}`, data: { statut: 'envoyé' } });
  }
  rdvNeuf('a-septieme', 'c-7');
  const r = await corpsDe(await appelCron(confirmer, 'confirmation-rdv'));
  dit('18 : six confirmations deja parties ne taisent pas la septieme', [undefined, 'envoyé', 'envoyé'],
    [r?.rafaleEcartee, ligne('envois', 'conf-a-septieme-push')?.data?.statut, ligne('envois', 'conf-a-septieme-whatsapp')?.data?.statut]);
  remetLaBase();
  for (let i = 1; i <= 6; i++) rdvNeuf(`a-bloc${i}`, `c-${i}`);
  const s = await corpsDe(await appelCron(confirmer, 'confirmation-rdv'));
  dit('18 : six rendez-vous neufs d un coup restent une rafale ecartee', [6, 0], [s?.rafaleEcartee, table('envois').size]);
}

/* ══ 21 · CONFIRMATION : BORNEE, ET CONSIGNEE AUSSITOT ═══════════════ */
{
  remetLaBase(); APPELS.length = 0; appelsMeta = 0;
  rdvNeuf('a-un', 'c-1'); rdvNeuf('a-deux', 'c-2');
  suspendreLeGraphAuNumero = 2;
  const pendu = new Promise<void>((ok) => { auNieme = ok; });
  void appelCron(confirmer, 'confirmation-rdv');
  await Promise.race([pendu, new Promise((ok) => setTimeout(ok, 3000))]);
  dit('21 : Meta pend sur la deuxieme cliente : la premiere est deja au journal', ['envoyé', 'envoyé'],
    [ligne('envois', 'conf-a-un-push')?.data?.statut, ligne('envois', 'conf-a-un-whatsapp')?.data?.statut]);
  const sansBorne = APPELS.filter((a) => (a.url.includes('graph.facebook.com') || a.url.includes('push-notify')) && !a.signal).length;
  dit('21 : chaque appel de confirmation-rdv porte une duree maximale', [true, 0], [APPELS.length >= 3, sansBorne]);
  suspendreLeGraphAuNumero = 0; auNieme = null;
}

/* ══ 19 · LE PASSAGE DE 21 H NE DEPOSE PAS CE QUI PARTIRAIT LE JOUR MEME ══ */
const rappels = await charge('rappels-j1', ENV_CRON);
{
  const prepare = () => {
    remetLaBase();
    pose('documents', { key: 'mnd_facteur', data: { vuLe: new Date().toISOString() } });
    pose('appointments', { id: 'a-demain', branch_id: 'br', data: { id: 'a-demain', branchId: 'br', clientId: 'c-1', date: '2026-10-13', time: '10:00', status: 'confirmé' } });
    pose('clients', { id: 'c-1', data: { id: 'c-1', name: 'Awa Test', phone: '0197000001' } });
  };
  await aLHeure('2026-10-12T20:00:00Z', async () => {
    prepare();
    await appelCron(rappels, 'rappels-j1');
    const l = ligne('envois', 'env-a-demain-whatsapp')?.data ?? {};
    dit('19 : 21 h, salle ouverte : le rappel n est pas depose pour le matin du rendez-vous, le journal le dit', ['périmé', true],
      [l.statut, /heures calmes/.test(String(l.detail ?? ''))]);
  });
  await aLHeure('2026-10-12T16:00:00Z', async () => {
    prepare();
    await appelCron(rappels, 'rappels-j1');
    const l = ligne('envois', 'env-a-demain-whatsapp')?.data ?? {};
    /* A la minute pres (10 octobre 2026) : l'horloge du banc est un decalage sur
       la vraie, qui avance pendant l'appel ; une milliseconde d'ecart faisait
       crier le banc une fois sur deux sans faute dans la fonction. */
    dit('19 : 17 h, salle ouverte : le rappel est depose et part a 17 h 10', ['en-attente', '2026-10-12T16:10'], [l.statut, String(l.partA ?? '').slice(0, 16)]);
  });
}

/* ══ 20 · LE FACTEUR : BORNE, ET UNE LIGNE PRISE NE RESTE PAS PRISE ══ */
const facteur = await charge('envois-partent', ENV_CRON);
await aLHeure('2026-10-12T10:00:00Z', async () => {
  remetLaBase(); APPELS.length = 0; appelsMeta = 0;
  pose('envois', { id: 'e-vieux', data: { id: 'e-vieux', statut: 'en-envoi', prisLe: '2026-10-12T09:45:00.000Z' } });
  pose('envois', { id: 'e-frais', data: { id: 'e-frais', statut: 'en-envoi', prisLe: '2026-10-12T09:58:00.000Z' } });
  pose('appointments', { id: 'a-x', data: { id: 'a-x', date: '2026-10-13', time: '10:00', status: 'confirmé' } });
  pose('envois', { id: 'conf-a-x-whatsapp', data: { id: 'conf-a-x-whatsapp', type: 'confirmation', statut: 'en-attente', apptId: 'a-x', dateRdv: '2026-10-13', heure: '10:00', partA: '2026-10-12T09:50:00.000Z', colis: { genre: 'whatsapp', numero: '2290197000001', modele: 'confirmation_rdv', composants: [] } } });
  const r = await corpsDe(await appelCron(facteur, 'envois-partent'));
  dit('20 : une ligne prise depuis quinze minutes redevient un echec a retenter', ['échec', 'envoi interrompu'],
    [ligne('envois', 'e-vieux')?.data?.statut, ligne('envois', 'e-vieux')?.data?.detail]);
  dit('20 : une ligne prise depuis deux minutes reste en main', 'en-envoi', ligne('envois', 'e-frais')?.data?.statut);
  dit('20 : le message du jour part, avec une duree maximale', ['envoyé', 1, 0],
    [ligne('envois', 'conf-a-x-whatsapp')?.data?.statut, r?.interrompus, APPELS.filter((a) => !a.signal).length]);
});

/* ══ 22 · LE RAPPEL PUSH SE DIT EN CLAIR ; LE SOIR, LES BONS TIROIRS ══ */
const push = await charge('push-notify', { SUPABASE_URL: 'https://banc.supabase.co', SERVICE_KEY: SERVICE, VAPID_PUBLIC: 'x', VAPID_PRIVATE: 'y' });
const appelPush = async (mode: string) => corpsDe(await push(new Request('https://banc/functions/v1/push-notify', { method: 'POST', body: JSON.stringify({ mode }) })));
await aLHeure('2026-10-12T09:00:00Z', async () => {
  remetLaBase(); POUSSES.length = 0;
  pose('appointments', { id: 'a-rappel', data: { id: 'a-rappel', clientId: 'c-1', date: '2026-10-13', time: '09:30', status: 'confirmé' } });
  pose('push_subscriptions', { id: 's1', endpoint: 'https://push/1', p256dh: 'k', auth: 'a', client_id: 'c-1' });
  await appelPush('reminders');
  dit('22 : la veille, la notification dit la date en clair, avec l annee, sans tiret cadratin', 'Rendez-vous le mardi 13 octobre 2026 à 9 h 30, la Maison vous attend.', POUSSES[0]?.body);
});
await aLHeure('2026-10-12T20:05:00Z', async () => {
  remetLaBase(); POUSSES.length = 0;
  pose('staff', { id: 'u1', user_id: 'u1', role: 'souverain' });
  pose('push_subscriptions', { id: 's2', endpoint: 'https://push/2', p256dh: 'k', auth: 'a', client_id: 'u1' });
  pose('cashboxes', { id: 'cb-foyer', branch_id: 'br', data: { id: 'cb-foyer', branchId: 'br', name: 'Caisse du foyer', horsBilan: true } });
  pose('cashboxes', { id: 'cb-p', branch_id: 'br', data: { id: 'cb-p', branchId: 'br', name: 'Caisse principale' } });
  pose('expenses', { id: 'x1', branch_id: 'br', data: { id: 'x1', branchId: 'br', date: '2026-10-12', cashbox: 'Caisse du foyer', amountXof: 3000 } });
  pose('entrees_hors_activite', { id: 'h1', branch_id: 'br', data: { id: 'h1', branchId: 'br', date: '2026-10-12', cashbox: 'Caisse principale', amountXof: 50000, sens: 'sortie' } });
  await appelPush('staff-cron');
  dit('22 : a 21 h, le foyer hors bilan se tait, le tiroir qui a bouge hors activite se nomme', ['Un tiroir pas clôturé', 'Caisse principale'],
    [POUSSES[0]?.title, String(POUSSES[0]?.body ?? '').split(' : ')[0]]);
});
{
  const corps = (t: string, nom: string) => { const a = t.indexOf(`const ${nom} = `); const b = t.indexOf('\n};\n', a); return a < 0 || b < 0 ? '' : t.slice(a, b); };
  const p = lit('supabase/functions/push-notify/index.ts');
  const c = lit('supabase/functions/confirmation-rdv/index.ts');
  dit('22 : push-notify porte heureLisible et jourEnClair de confirmation-rdv, a l identique', [true, true],
    ['heureLisible', 'jourEnClair'].map((n) => corps(p, n).length > 50 && corps(p, n) === corps(c, n)));
}

/* ══ 23 · LE RELEVE DES AVIS GOOGLE N'EST PAS OUVERT A LA CLE PUBLIQUE ══ */
{
  const env = { SUPABASE_URL: 'https://banc.supabase.co', CLE_SERVICE: SERVICE, GOOGLE_PLACES_KEY: 'g', GOOGLE_PLACE_ID: 'pl' };
  const sansSecret = await charge('avis-google-releve', env, '-sans');
  const avecSecret = await charge('avis-google-releve', { ...env, CRON_SECRET: 'secret-du-cron' }, '-avec');
  const appel = async (porte: Porte, h: Record<string, string>) => { remetLaBase(); APPELS.length = 0; const r = await porte(new Request('https://banc/functions/v1/avis-google-releve', { method: 'POST', headers: h })); return [r.status, APPELS.length, table('documents').has('mnd_avis_google')]; };
  dit('23 : sans CRON_SECRET, la cle publique seule ne declenche rien', [403, 0, false], await appel(sansSecret, { apikey: 'sb_publishable_x', authorization: 'Bearer sb_publishable_x' }));
  dit('23 : la cle service, oui', [200, 1, true], await appel(sansSecret, { authorization: `Bearer ${SERVICE}` }));
  dit('23 : avec CRON_SECRET, le bon en-tete passe, un faux non', [[200, 1, true], [403, 0, false]],
    [await appel(avecSecret, { 'x-cron-secret': 'secret-du-cron' }), await appel(avecSecret, { 'x-cron-secret': 'faux' })]);
}

/* ══ LA MIGRATION 0126, LUE ══════════════════════════════════════════ */
{
  const m = lit('supabase/migrations/0126_la_revue_de_nuit.sql').replace(/--.*$/gm, '');
  const a = (re: RegExp) => re.test(m);
  dit('15 : une transaction, une carte (index unique)', true, a(new RegExp(String.raw`create unique index cartes_cadeaux_transaction_unique\s+on public\.cartes_cadeaux \(\(data->>'transactionId'\)\)`)));
  const depot = (m.match(/create policy cc_depot[\s\S]*?\);\n/) ?? [''])[0];
  dit('24 : le geste se depose SANS montant', true, depot.includes(String.raw`(data->>'objet' = 'geste' and data->'montantXof' is null)`));
  dit('31 : le depot pese moins de 4 000 signes, identifiant du site', [true, true], [depot.includes('length(data::text) < 4000'), depot.includes(String.raw`id ~ '^cc-[a-z0-9]{8,32}$'`)]);
  const garde = (m.match(/create or replace function public\.secretariat_garde_les_signatures[\s\S]*?end \$\$;/) ?? [''])[0];
  dit('25 : la garde ne croit pas une ancienne ligne d un autre genre', true,
    garde.includes(String.raw`if avant is not null and avant->>'genre' is distinct from 'piece' then
    avant := null;`)
    && garde.includes(String.raw`and (avant is null or avant->>'genre' is distinct from 'piece') then
    return new;`));
  dit('26 : emprunts, hors activite et messages ont leur horodatage', true, a(/foreach t in array array\['entrees_hors_activite', 'emprunts', 'messages_wa'\] loop\s+execute format\('drop trigger if exists %I on public\.%I', t \|\| '_touch', t\);\s+execute format\('create trigger %I before update on public\.%I for each row execute function public\.touch_updated_at\(\)', t \|\| '_touch', t\);/));
  dit('27 : l equipe ne range ses fils qu a un nouveau numero', [true, true],
    [a(/create trigger team_range_les_fils after update of data on public\.team\s+for each row\s+when \(pg_trigger_depth\(\) = 0 and old\.data->>'phone' is distinct from new\.data->>'phone'\)/),
      a(/create trigger fournisseurs_range_les_fils after update of data on public\.fournisseurs\s+for each row\s+when \(pg_trigger_depth\(\) = 0 and old\.data->>'telephone' is distinct from new\.data->>'telephone'\)/)]);
  const appels = m.split('\n').filter((l) => /create policy \w+ on public\.appels_wa/.test(l));
  dit('29 : appels_wa sans « for all », la direction seule efface', [0, true, true],
    [appels.filter((l) => /for all/.test(l)).length, a(/drop policy if exists appel_ecrit on public\.appels_wa;/), a(/create policy appel_efface on public\.appels_wa for delete to authenticated\s+using \(public\.est_direction\(\)\);/)]);
  dit('30 : a qui est ce numero : rien pour une cliente', [true, true],
    [a(/function public\.tete_du_numero\(n text\)[\s\S]*?begin\s+if auth\.uid\(\) is not null and not public\.is_staff\(\) then\s+return jsonb_build_object\('tiroir', 'clientes'\);/),
      a(/function public\.numero_est_reserve\(n text\)[\s\S]*?select \(auth\.uid\(\) is null or public\.is_staff\(\)\)\s+and/)]);
  dit('la migration finit par son controle en lignes', true, /select n, quoi, etat from \([\s\S]*\) as controle\s+order by n;\s*$/.test(m));
}

console.log(ko === 0 ? '\nLe lot serveur-site tient.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
