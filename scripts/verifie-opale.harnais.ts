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
  reglageDOpale, estUneQuestionFrancheDOpale, type ContexteDOpale,
} from '../src/shared/opale-pur';

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
const RPC: Record<string, (a: any) => any> = {
  fiches_du_numero: ({ n: num }) => table('clients').filter((c) => [c.data?.phone, c.data?.phone2].some((p) => p && cle8(p) === cle8(num)))
    .map((c) => ({
      id: c.id, nom: c.data.name, ...(c.data.civilite ? { civilite: c.data.civilite } : {}), parPhone: cle8(c.data.phone) === cle8(num),
      numeros: [c.data.phone].filter(Boolean), ...(c.data.derniereVenue ? { derniereVenue: c.data.derniereVenue } : {}), branchId: 'br-banc',
    })),
  creneaux_occupes: () => [],
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
  storage: { from: () => ({}) },
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
  ANTHROPIC_API_KEY: 'cle-claude-de-banc',
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
  return new Response(JSON.stringify({ verdict: '' }), { status: 200 });
};
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
  for (let i = 1; i < 20; i++) {
    iso = plusJours(AUJOURDHUI, i);
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 1) continue;
    if (++vus >= apres) return iso;
  }
  return iso;
};
const J1 = jourOuvert(1);
const J2 = jourOuvert(2);
function decor(qui: 'opale' | 'automate' | null = 'opale') {
  for (const k of Object.keys(TABLES)) delete TABLES[k];
  POSES.length = 0; META.length = 0; DEMANDES.length = 0; FILE = [];
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
    { texte: `Avec plaisir, Mme Akouele. Je peux vous recevoir ${J1} à 8 h ou à 9 h. Laquelle vous convient ?` },
  ];
  const r = await tour(NUM, [w]);
  const res = resultatsDe(1)[0] ?? '';
  dit('Opale prend le tour', true, r.pris);
  dit('l outil rend les places du serveur, son jour d abord', [true, true], [res.includes(`${J1} 08:00`), !res.includes('Aucune place')]);
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

/* ══ 4. UNE NOUVELLE : prenom et civilite avant toute proposition ══ */
{
  decor();
  const w = elleEcrit(INCONNUE, `Un shampoing ${J2} à 10 h svp`);
  FILE = [
    { outils: [{ name: 'proposer_le_rendez_vous', input: { pour: 'nouvelle', gestes: ['sv-plt-05-ess-c'], date: J2, heure: '10:00' } }] },
    { texte: 'Pour inscrire votre rendez-vous, comment devons-nous vous appeler ?' },
  ];
  await tour(INCONNUE, [w]);
  dit('sans prenom ni civilite, la proposition est refusee', [true, undefined], [(resultatsDe(1)[0] ?? '').includes('prénom'), fil(INCONNUE)?.opale?.enAttente]);
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
  dit('le mot banni : relu une fois, la phrase juste part', ['La Maison se trouve à Cotonou, au quartier Suru-Léré.'], textesEnvoyes());
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
  dit('la fonction importe le SDK, et sa version le dit', [true, true], [a.includes("import Anthropic from 'npm:@anthropic-ai/sdk';"), /const VERSION = '2026-11-04-a · Opale/.test(a)]);
}

console.log(`${ko ? 'ECHEC' : 'OK   '} ${n} controles, ${ko} echec(s)`);
