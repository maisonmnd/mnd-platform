/* LA VISIO RELUE AVANT DE PARTIR, ET SA CONSULTATION — `node scripts/verifie-la-visio-relue.mjs`.

   18 novembre 2026, deux défauts vus aux essais réels du matin :
   1. le message de la visio réservée (`visio`, déposé par visio-salle) est
      retenu jusqu'à 8 h pendant les heures calmes ; une visio annulée
      entre-temps (par la Maison au Trône, à 07:07) ou déplacée ne le
      retirait pas : il n'a pas de rendez-vous à relire (`apptId` vide), et
      il partait avec le lien d'une visio annulée ;
   2. une seconde visio au même numéro est refusée à juste titre, mais la
      consultation, déposée avant, restait en file A « à relire », sans visio
      derrière.

   I : la règle pure (`visioQuiNeTientPlus`, porte-des-modeles-pur). II : le
   VRAI facteur (envois-partent) contre une base, un Meta, un Deno et une
   horloge simulés : ce qui part chez Meta, ligne par ligne. III : la file A
   (`estARelire`) et l'écran qui la lit. Tout est inventé. Sortie ASCII. */
import { readFileSync } from 'node:fs';
import { visioQuiNeTientPlus } from '../src/shared/porte-des-modeles-pur';
import { estARelire, visioSansSuite } from '../src/shared/consultation-a-relire-pur';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : `\n       obtenu  ${ascii(obtenu)}\n       attendu ${ascii(attendu)}`}`);
};
const lit = (f: string): string => readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

/* La visio du banc : réservée la veille au soir pour 10 h 30 à Cotonou (09:30 UTC), son message retenu jusqu'à 8 h. */
const DEBUT = '2026-12-01T09:30:00.000Z';
const FIN = '2026-12-01T09:45:00.000Z';
const DEPOT = '2026-11-30T21:40:00.000Z';
const LIGNE = { visioId: 'vz-banc0000001', dateRdv: '2026-12-01', heure: '10:30', deposeLe: DEPOT };
const AVANT = Date.parse('2026-12-01T07:00:00Z');

/* ══ I. LA RÈGLE PURE ═══════════════════════════════════════════════════════ */
{
  const tient = { debut: DEBUT, fin: FIN, statut: 'réservée', deplacee_le: null };
  dit('I1 la visio telle qu au depot : le message part', null, visioQuiNeTientPlus(LIGNE, tient, AVANT));
  dit('I2 annulee (par elle, ou par la Maison au Trone), disparue : il ne part pas',
    ['la visio a été annulée', 'la visio n’existe plus'],
    [visioQuiNeTientPlus(LIGNE, { ...tient, statut: 'annulée' }, AVANT), visioQuiNeTientPlus(LIGNE, null, AVANT)]);
  dit('I3 a une autre heure, ou un autre jour, que celle du message : il ne part pas',
    ['la visio a été déplacée', 'la visio a été déplacée'],
    [visioQuiNeTientPlus(LIGNE, { ...tient, debut: '2026-12-01T10:00:00.000Z' }, AVANT), visioQuiNeTientPlus(LIGNE, { ...tient, debut: '2026-12-02T09:30:00.000Z' }, AVANT)]);
  dit('I4 deplacee depuis le depot, puis revenue a la meme heure : l ancien message (son ancien lien) ne part pas ; un message depose apres le deplacement part',
    ['la visio a été déplacée depuis le dépôt', null],
    [visioQuiNeTientPlus(LIGNE, { ...tient, deplacee_le: '2026-11-30T22:00:00.000Z' }, AVANT),
      visioQuiNeTientPlus({ ...LIGNE, deposeLe: '2026-11-30T22:00:01.000Z' }, { ...tient, deplacee_le: '2026-11-30T22:00:00.000Z' }, AVANT)]);
  dit('I5 la visio finie, une heure illisible, un message qui ne nomme pas sa visio : il ne part pas',
    ['l’heure de la visio est passée', 'la visio n’a plus d’heure lisible', 'le message ne nomme pas sa visio'],
    [visioQuiNeTientPlus(LIGNE, tient, Date.parse(FIN)), visioQuiNeTientPlus(LIGNE, { ...tient, debut: 'demain' }, AVANT), visioQuiNeTientPlus({ ...LIGNE, visioId: '' }, tient, AVANT)]);
  dit('I6 l heure de Cotonou, pas celle de Londres : 09:30 UTC est 10:30 a Cotonou', null,
    visioQuiNeTientPlus({ ...LIGNE, dateRdv: '2026-12-01', heure: '10:30' }, { ...tient, debut: '2026-12-01T09:30:00Z' }, AVANT));
}

/* ══ II. LE VRAI FACTEUR ══════════════════════════════════════════════════ */
type Ligne = Record<string, any>;
let TABLES: Record<string, Ligne[]> = {};
const table = (t: string): Ligne[] => (TABLES[t] ??= []);
const cleDe = (t: string): string => (t === 'documents' ? 'key' : 'id');
let VISIOS_EN_PANNE = false;
function valeur(l: Ligne, col: string): unknown {
  const m = /^data((?:->[A-Za-z0-9_]+)*)->>([A-Za-z0-9_]+)$/.exec(col);
  if (!m) return l[col];
  let v: any = l.data;
  for (const k of m[1].split('->').filter(Boolean)) v = v?.[k];
  v = v?.[m[2]];
  return v === undefined || v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
}
function projette(l: Ligne, cols: string): Ligne {
  if (!cols || cols.trim() === '*') return structuredClone(l);
  const r: Ligne = {};
  for (const brut of cols.split(',').map((c) => c.trim()).filter(Boolean)) r[brut] = structuredClone(valeur(l, brut));
  return r;
}
class Requete {
  private filtres: ((l: Ligne) => boolean)[] = [];
  private mode: 'select' | 'update' | 'upsert' | 'insert' = 'select';
  private cols = '*';
  private rendre = false;
  private plafond = Infinity;
  private debut = 0;
  private seule = false;
  private charge: any = null;
  private options: any = {};
  constructor(private t: string) {}
  select(cols = '*') { if (this.mode === 'select') this.cols = cols; else { this.rendre = true; this.cols = cols; } return this; }
  eq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) !== String(v)); return this; }
  gt(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') > String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') >= String(v)); return this; }
  lt(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') < String(v)); return this; }
  lte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') <= String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  order() { return this; }
  limit(k: number) { this.plafond = k; return this; }
  range(a: number, b: number) { this.debut = a; this.plafond = b - a + 1; return this; }
  maybeSingle() { this.seule = true; return this; }
  update(d: any) { this.mode = 'update'; this.charge = d; return this; }
  upsert(d: any, o: any = {}) { this.mode = 'upsert'; this.charge = d; this.options = o; return this; }
  insert(d: any) { this.mode = 'insert'; this.charge = d; return this; }
  private execute(): { data: any; error: any } {
    if (this.t === 'visios' && VISIOS_EN_PANNE) return { data: null, error: { message: 'panne du banc' } };
    const lignes = table(this.t);
    const cle = this.options.onConflict ?? cleDe(this.t);
    if (this.mode === 'insert' || this.mode === 'upsert') {
      for (const brut of [].concat(this.charge)) {
        const l: Ligne = structuredClone(brut);
        const i = lignes.findIndex((x) => x[cle] !== undefined && x[cle] === l[cle]);
        if (i >= 0 && this.mode === 'upsert') lignes[i] = l; else lignes.push(l);
      }
      return { data: null, error: null };
    }
    const vues = lignes.filter((l) => this.filtres.every((f) => f(l)));
    if (this.mode === 'update') {
      for (const l of vues) Object.assign(l, structuredClone(this.charge));
      return { data: this.rendre ? vues.map((l) => projette(l, this.cols)) : null, error: null };
    }
    const data = vues.slice(this.debut, this.debut + this.plafond).map((l) => projette(l, this.cols));
    if (this.seule) return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }
  then(ok: (r: any) => unknown, ko2?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.execute()).then(ok, ko2); } catch (e) { return Promise.reject(e).then(ok, ko2); }
  }
}
const client = { from: (t: string) => new Requete(t), rpc: async () => ({ data: null, error: { message: 'rpc absente du banc' } }) };

const VraieDate = Date;
let MAINTENANT = VraieDate.parse('2026-12-01T07:05:00Z');
class DateDuBanc extends VraieDate {
  constructor(...a: unknown[]) { if (a.length === 0) super(MAINTENANT); else super(...(a as [string])); }
  static now() { return MAINTENANT; }
}
(globalThis as any).Date = DateDuBanc;
const a = (iso: string) => { MAINTENANT = VraieDate.parse(iso); };

const ENV: Record<string, string | undefined> = {
  SUPABASE_URL: 'http://faux.local', SUPABASE_SERVICE_ROLE_KEY: 'le-secret-de-la-plateforme', CLE_SERVICE: 'la-cle-de-la-maison',
  WA_TOKEN: 'jeton-meta-de-banc', WA_PHONE_ID: '1234',
};
const SERVIS: ((req: Request) => Promise<Response>)[] = [];
let META: { modele: string; to: string; corps: string[] }[] = [];
(globalThis as any).__faux = { client: () => client };
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] }, serve: (h: any) => { SERVIS.push(h); } };
let numeroWa = 0;
(globalThis as any).fetch = async (url: string, init?: { body?: string }) => {
  if (String(url).includes('graph.facebook.com')) {
    const corps = JSON.parse(String(init?.body ?? '{}'));
    const body = (corps.template?.components ?? []).find((c: any) => c.type === 'body');
    META.push({ modele: corps.template?.name, to: corps.to, corps: (body?.parameters ?? []).map((p: any) => p.text) });
    return new Response(JSON.stringify({ messages: [{ id: `wamid.visio${++numeroWa}` }] }), { status: 200 });
  }
  return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
};
console.error = () => {};
await import('../supabase/functions/envois-partent/index.ts');
const [servirFacteur] = SERVIS;
const facteur = async () => (await servirFacteur(new Request('http://faux.local/', { method: 'POST', headers: { authorization: `Bearer ${ENV.CLE_SERVICE}` } }))).json();

const TEL = '2290162000001';
const visio = (o: Ligne = {}) => ({ id: 'vz-banc0000001', debut: DEBUT, fin: FIN, statut: 'réservée', deplacee_le: null, numero: '62000001', telephone: TEL, nom: 'Awa', ...o });
/** Le message tel que visio-salle le dépose, la salle ouverte, retenu jusqu'à 8 h. */
const message = (id: string, o: Ligne = {}) => ({
  id, branch_id: 'br-1',
  data: {
    id, branchId: 'br-1', type: 'visio', canal: 'whatsapp', apptId: '', invoiceId: '', clientId: '', visioId: 'vz-banc0000001',
    dateRdv: '2026-12-01', heure: '10:30', quand: DEPOT, prenom: 'Awa', statut: 'en-attente', deposeLe: DEPOT,
    partA: '2026-12-01T07:00:00.000Z', calme: true,
    colis: {
      genre: 'whatsapp', numero: TEL, modele: 'visio_mnd', parQui: 'la Maison, automatiquement',
      texteAuFil: 'Bonjour Awa, votre visio gratuite avec la Maison MND est réservée : mardi 1er décembre 2026 à 10 h 30. Votre lien d’entrée : https://x/visio/?v=a',
      composants: [{ type: 'body', parameters: [{ type: 'text', text: 'Awa' }, { type: 'text', text: 'mardi 1er décembre 2026 à 10 h 30' }, { type: 'text', text: 'https://x/visio/?v=a' }] }],
    },
    ...o,
  },
});
const ligne = (id: string) => table('envois').find((l) => l.id === id)?.data ?? {};
/** Une base neuve par scène ; le facteur passe une fois pour se dire vivant. */
async function scene(visios: Ligne[], messages: Ligne[]) {
  TABLES = {};
  META = [];
  VISIOS_EN_PANNE = false;
  a('2026-12-01T07:05:00Z');
  table('visios').push(...visios);
  table('envois').push(...messages);
}

/* II1. La visio tient : son message part à 8 h, une fois. */
{
  await scene([visio()], [message('env-vz-banc0000001-wa-visio')]);
  await facteur();
  dit('II1 la visio tient : a 8 h, son message part chez Meta, une fois, avec son lien', [1, 'visio_mnd', 'envoyé'],
    [META.length, META[0]?.modele, ligne('env-vz-banc0000001-wa-visio').statut]);
}
/* II2. Annulée par la Maison au Trône à 07:07 (la ligne de la table seule, sans visio-salle). */
{
  await scene([visio({ statut: 'annulée', annulee_par: 'maison', annulee_le: '2026-12-01T06:07:00.000Z' })], [message('env-vz-banc0000001-wa-visio')]);
  await facteur();
  const l = ligne('env-vz-banc0000001-wa-visio');
  dit('II2 la visio annulee par la Maison a 07:07 (au Trone, sans visio-salle) : a 8 h, rien ne part, la ligne dit pourquoi',
    [0, 'périmé', 'la visio a été annulée'], [META.length, l.statut, l.detail]);
}
/* II3. Déplacée : l'ancien message est resté en attente (une main l'a remis, un retrait raté), le nouveau est déposé. */
{
  const neuf = 'env-vz-banc0000001-wa-visio-mieuxneuf';
  await scene(
    [visio({ debut: '2026-12-01T11:00:00.000Z', fin: '2026-12-01T11:15:00.000Z', deplacee_le: '2026-11-30T22:10:00.000Z', deplacee_de: DEBUT, deplacements: 1 })],
    [message('env-vz-banc0000001-wa-visio'), message(neuf, { heure: '12:00', deposeLe: '2026-11-30T22:10:02.000Z', quand: '2026-11-30T22:10:02.000Z' })],
  );
  await facteur();
  dit('II3 deplacee de 10 h 30 a 12 h : seul le message de la nouvelle heure part ; l ancien est perime',
    [1, 'envoyé', 'périmé', 'la visio a été déplacée'],
    [META.length, ligne(neuf).statut, ligne('env-vz-banc0000001-wa-visio').statut, ligne('env-vz-banc0000001-wa-visio').detail]);
}
/* II4. Déplacée puis revenue à 10 h 30 : le premier message (son ancien lien) ne part pas. */
{
  const neuf = 'env-vz-banc0000001-wa-visio-retour01';
  await scene(
    [visio({ deplacee_le: '2026-11-30T22:20:00.000Z', deplacements: 2 })],
    [message('env-vz-banc0000001-wa-visio'), message(neuf, { deposeLe: '2026-11-30T22:20:01.000Z', quand: '2026-11-30T22:20:01.000Z' })],
  );
  await facteur();
  dit('II4 deplacee puis revenue a la meme heure : le message d avant le deplacement ne part pas, celui d apres part',
    [1, 'envoyé', 'la visio a été déplacée depuis le dépôt'], [META.length, ligne(neuf).statut, ligne('env-vz-banc0000001-wa-visio').detail]);
}
/* II5. Disparue ; II6. la table illisible : le message ne se perd pas, il repasse. */
{
  await scene([], [message('env-vz-banc0000001-wa-visio')]);
  await facteur();
  dit('II5 la visio disparue : rien ne part', [0, 'périmé', 'la visio n’existe plus'], [META.length, ligne('env-vz-banc0000001-wa-visio').statut, ligne('env-vz-banc0000001-wa-visio').detail]);
  await scene([visio()], [message('env-vz-banc0000001-wa-visio')]);
  VISIOS_EN_PANNE = true;
  await facteur();
  const l = ligne('env-vz-banc0000001-wa-visio');
  dit('II6 la visio illisible : rien ne part, le message reste en attente et repasse dans une minute',
    [0, 'en-attente', true], [META.length, l.statut, Date.parse(l.partA) > MAINTENANT]);
}

/* ══ III. LA FILE A : UNE VISIO REFUSÉE NE LAISSE RIEN À RELIRE ═══════════════ */
{
  const deposee = { modalite: 'auto', status: 'nouvelle', paidXof: 0, answers: { rendezVous: 'visio' } };
  dit('III1 deposee pour une visio, la visio refusee (aucune visio notee) : pas a relire ; sa visio posee : a relire',
    [false, true, true], [estARelire(deposee), estARelire({ ...deposee, visio: { id: 'vz-1', debut: DEBUT, statut: 'réservée' } }), visioSansSuite(deposee)]);
  dit('III2 la privee demandee, une consultation d avant sans rendez-vous dit : a relire comme avant ; fermee, reglee (file C), ou d une autre modalite : non',
    [true, true, false, false, false],
    [estARelire({ ...deposee, answers: { rendezVous: 'privee' } }), estARelire({ ...deposee, answers: {} }),
      estARelire({ ...deposee, status: 'fermée', visio: { id: 'v' } }), estARelire({ ...deposee, paidXof: 15000 }), estARelire({ ...deposee, modalite: 'privee', visio: { id: 'v' } })]);
  const ecran = lit('src/apps/trone/routes/clients/ConsultationsGratuites.tsx');
  dit('III3 la file A du Trone lit la regle, et seulement elle', [true, false],
    [ecran.includes('const aRelire = queue.filter(estARelire)'), /queue\.filter\(\(o\) => o\.modalite === 'auto'/.test(ecran)]);
}

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? `, ${ko} en echec` : ''}.`);
process.exit(ko ? 1 : 0);
