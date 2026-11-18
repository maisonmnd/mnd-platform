/* LE TRI DES DÉMARCHEURS, ÉPROUVÉ — 29 octobre 2026.
   `node scripts/verifie-le-tri-des-messages.mjs` (et `--prouve`, jamais dans
   l'arbre commun).

   ① Les règles pures (shared/tri-des-messages-pur) : la clé du numéro, le
      registre et ses gestes, la consigne, la lecture du verdict.
   ② La boîte des conversations : un bloqué ne paraît que dans « Bloqués »,
      une proposition sort de « À traiter ».
   ③ Le VRAI fichier à coller (`supabase/functions/tri-des-messages`) contre
      une base, un Claude et un WhatsApp simulés : les deux portes, le
      blocage, la proposition et sa notification, la cliente jugée une fois,
      jamais une fiche ni un échange passé, le déblocage, la passe des 24 h.
   ④ L'automate et le Trône, lus dans leurs sources. Les numéros sont faux. */
import { readFileSync } from 'node:fs';
import {
  CLE_DU_TRI, TRI_VIDE, avecUnBloque, avecUnJugement, avecUneProposition, cleDuTri, consigneDuTri, contexteDuTri,
  echangeQuiCompte, etatDuNumero, extraitDe, lectureDuTri, motifDit, rendu, sansSujet, triLu, type EntreeDuTri,
} from '../src/shared/tri-des-messages-pur';
import { cleDuNumeroWa } from '../src/shared/conversations';
import { filtresDe } from '../src/shared/boite-unique-pur';
import { OUTILS_D_OPALE, consigneDOpale, textesPourLeTri, verdictRange } from '../src/shared/opale-pur';

let ko = 0; let n = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko++; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};

/* ── ⓪ LE DÉMARCHEUR QUI SALUE D'ABORD (18 novembre 2026) ── */
dit('sans sujet : des saluts, un merci, un accord, rien', [true, true, true, true, true, true],
  [sansSujet(['Bonsoir']), sansSujet(['Bonjour Madame !']), sansSujet(['Bonsoir Madame,', 'ok merci']), sansSujet(['Bjr la maison MND']), sansSujet(['Good morning']), sansSujet([])]);
dit('... mais une question, une demande, une publicite ont un sujet', [false, false, false, false, false],
  [sansSujet(['Bonjour, vous êtes ouverts samedi ?']), sansSujet(['Bonjour je voudrais un rendez-vous']), sansSujet(['Bonsoir Madame, je suis créateur de sites web']), sansSujet(['Prix ?']), sansSujet(['bonjour bonjour bonjour bonjour bonjour bonjour bonjour'])]);
dit('un echange qui compte : un message de la Maison sans auto (une personne, un modele) ; jamais Opale ni l automate', [true, true, false, false, false],
  [echangeQuiCompte({ sens: 'sortant' }), echangeQuiCompte({ sens: 'sortant', modele: 'rappel' } as { sens: string }), echangeQuiCompte({ sens: 'sortant', auto: 'automate' }), echangeQuiCompte({ sens: 'entrant' }), echangeQuiCompte(null)]);
dit('la consigne du tri : se presenter et offrir ses services, c est demarcher, meme apres un bonjour', true,
  consigneDuTri().includes('« je suis créateur de sites web »') && consigneDuTri().includes('même s’il a salué avant'));
/* Le fil : un bonjour, sa publicité, la réponse de la Maison, une question,
   la même publicité recollée, une photo, un vocal non compris, un vocal compris. */
dit('les textes relus pour Opale : ses trois derniers qui disent quelque chose, sans doublon, la transcription d un vocal',
  ['Seriez-vous intéressée ?', 'Je fais des sites web', 'je vous propose une vidéo'],
  textesPourLeTri([
    { sens: 'entrant', texte: 'Bonsoir' }, { sens: 'entrant', texte: 'Je fais des sites web' }, { sens: 'sortant', texte: 'Bienvenue' },
    { sens: 'entrant', texte: 'Seriez-vous intéressée ?' }, { sens: 'entrant', texte: 'Je fais des sites web' }, { sens: 'entrant', texte: 'une photo', type: 'image' },
    { sens: 'entrant', texte: 'un message vocal', type: 'audio' }, { sens: 'entrant', texte: 'un message vocal', type: 'audio', transcription: 'je vous propose une vidéo' },
  ]));
dit('le verdict qui range : bloque ou proposition', [true, true, false, false, false], ['bloque', 'proposition', 'cliente', 'passe', ''].map(verdictRange));
const outilRanger = OUTILS_D_OPALE.find((o) => o.name === 'ranger_un_demarchage');
dit('Opale a l outil, et sa consigne : n ecris rien, ne remercie pas, ne passe pas la main', [true, true, true],
  [!!outilRanger, consigneDOpale().includes('n’écris RIEN, ne le remercie pas, ne passe pas la main ; appelle seulement `ranger_un_demarchage`'), !consigneDOpale().includes('(un démarchage, une sortie, une adresse ailleurs)')]);

/* ── ① LES RÈGLES PURES ── */
const NUMEROS = ['2290197000001', '22997000001', '22965947030', '33612345678', ''];
dit('la cle du tri suit la regle des fils (ancien plan beninois ramene au nouveau)', NUMEROS.map((x) => cleDuNumeroWa(x)), NUMEROS.map(cleDuTri));
const e1: EntreeDuTri = { numero: '22960000001', quand: '2026-10-29T20:06:00.000Z', motif: 'services numériques', extrait: 'Je crée des sites', par: 'claude' };
let t = avecUnBloque(TRI_VIDE, e1);
dit('bloque : il est dans les bloques', 'bloque', etatDuNumero(t, '22960000001'));
t = avecUneProposition(t, { ...e1, numero: '22960000002' });
t = avecUnJugement(t, '22960000003', 'cliente', e1.quand);
dit('proposition, jugee, inconnue', ['proposition', 'juge', 'inconnu'], ['22960000002', '22960000003', '22960000009'].map((x) => etatDuNumero(t, x)));
const t2 = rendu(t, '22960000001', e1.quand);
dit('rendu (debloque) : il sort des bloques et devient blanc, plus jamais juge', ['blanc', false], [etatDuNumero(t2, '22960000001'), '22960000001' in t2.bloques]);
const t3 = avecUnBloque(t, { ...e1, numero: '22960000002', par: 'direction' });
dit('bloquer une proposition la retire des propositions', [false, true], ['22960000002' in t3.propositions, '22960000002' in t3.bloques]);
dit('un registre illisible devient vide, jamais une case absente', TRI_VIDE, triLu('n importe quoi'));
dit('la cle du registre', 'mnd_tri_des_messages', CLE_DU_TRI);
const c = consigneDuTri();
dit('la consigne : le doute ne bloque pas, une cliente avec un lien reste cliente, une coiffeuse qui cherche du travail est une proposition', [true, true, true, true], [
  c.includes('Dans le doute, "doute"'), c.includes('Quelqu’un qui demande un service pour lui-même est "cliente", même avec un lien ou une photo.'),
  c.includes('ou une coiffeuse qui cherche du travail'), c.includes('Un lien seul ne suffit pas'),
]);
dit('le contexte : le nom annonce et trois messages au plus, sans numero', [true, false, true],
  [contexteDuTri({ textes: ['a', 'b', 'c', 'd'], nomProfil: 'B. digital' }).includes('B. digital'), contexteDuTri({ textes: ['a', 'b', 'c', 'd'] }).includes('« d »'), contexteDuTri({ textes: ['x'] }).includes('aucun')]);
dit('la lecture du verdict : un verdict connu, le motif propre (ni tiret long, ni numero)', [{ verdict: 'demarchage', motif: 'sites web, affiches' }, null, null],
  [lectureDuTri({ verdict: 'demarchage', motif: 'sites web — affiches 22960000001' }), lectureDuTri({ verdict: 'spam', motif: 'x' }), lectureDuTri(null)]);
dit('l extrait : une ligne, 180 signes au plus', [true, 'Bonjour · Je crée'], [extraitDe(['x'.repeat(400)]).length === 180, extraitDe(['  Bonjour  ', '', 'Je   crée'])]);
dit('le motif dit sur la ligne', ['Démarchage : services numériques', 'bloqué à la main'], [motifDit(e1, 'bloque'), motifDit({ ...e1, par: 'direction' }, 'bloque')]);

/* ── ② LA BOÎTE DES CONVERSATIONS ── */
const base2 = { attendUneReponse: true, soucisOuverts: [], discussions: [], demandes: [], bulles: [] } as unknown as Parameters<typeof filtresDe>[0];
dit('une boite bloquee ne parait que dans Bloques ; une proposition dans Propositions et Toutes ; sinon comme avant', [['bloques'], ['propositions', 'tout'], ['attend', 'tout']], [
  filtresDe({ ...base2, tri: { etat: 'bloque', entree: e1 } }), filtresDe({ ...base2, tri: { etat: 'proposition', entree: e1 } }), filtresDe(base2),
]);
const boite = readFileSync('src/shared/boite-unique-pur.ts', 'utf8');
dit('la boite : seulement sans fiche, par son numero WhatsApp ; un trie n attend pas de reponse', [true, true],
  [boite.includes("const etatDuTri = !b.clientId && !parentDe && e.tri && fil?.numero ? etatDuNumero(e.tri as TriDesMessages, fil.numero) : 'inconnu';"), boite.includes('attendUneReponse: !tri && pourquoi.length > 0,')]);

/* ── ③ LA FONCTION, CONTRE UNE BASE, UN CLAUDE ET UN WHATSAPP SIMULÉS ── */
type Ligne = { id: string; data: Record<string, unknown> };
const tables: Record<string, Ligne[]> = { messages_wa: [] };
const docs = new Map<string, unknown>();
const fiches = new Set<string>();
const graph: { methode: string; user: string }[] = [];
const pushs: { body: string }[] = [];
let claudes = 0; let metaRefuse = false;
const versClaude: string[] = [];
const lit = (r: Ligne, col: string): string | null => {
  const m = /^data->>(.+)$/.exec(col);
  const v = m ? r.data?.[m[1]] : (r as unknown as Record<string, unknown>)[col];
  return v === undefined || v === null ? null : String(v);
};
class Requete {
  filtres: ((r: Ligne) => boolean)[] = []; lim = Infinity; seul = false; valeur: unknown = null; mode: 'select' | 'upsert' = 'select';
  constructor(public table: string) {}
  select() { return this; }
  eq(col: string, v: unknown) { this.filtres.push((r) => lit(r, col) === String(v)); return this; }
  gte(col: string, v: unknown) { this.filtres.push((r) => (lit(r, col) ?? '') >= String(v)); return this; }
  in(col: string, vs: unknown[]) { this.filtres.push((r) => vs.map(String).includes(String(lit(r, col)))); return this; }
  is(col: string, v: unknown) { this.filtres.push((r) => (v === null ? lit(r, col) === null : lit(r, col) === String(v))); return this; }
  limit(k: number) { this.lim = k; return this; }
  maybeSingle() { this.seul = true; return this; }
  upsert(o: unknown) { this.mode = 'upsert'; this.valeur = o; return this; }
  then(ok: (x: unknown) => unknown, ko2?: (e: unknown) => unknown) { return Promise.resolve(this.fais()).then(ok, ko2); }
  fais(): unknown {
    if (this.table === 'documents') {
      if (this.mode === 'upsert') { const v = this.valeur as { key: string; data: unknown }; docs.set(v.key, structuredClone(v.data)); return { error: null }; }
      const cle = this.filtres.length ? [...docs.keys()].find((k) => this.filtres.every((f) => f({ id: k, key: k, data: {} } as unknown as Ligne))) : undefined;
      const d = cle !== undefined ? { key: cle, data: structuredClone(docs.get(cle)) } : null;
      return { data: this.seul ? d : d ? [d] : [], error: null };
    }
    const lus = (tables[this.table] ?? []).filter((r) => this.filtres.every((f) => f(r))).slice(0, this.lim);
    return { data: this.seul ? lus[0] ?? null : structuredClone(lus), error: null };
  }
}
/* `documents` se filtre sur `key` : la ligne simulée porte la clé à son nom. */
Requete.prototype.eq = function (this: Requete, col: string, v: unknown) {
  if (this.table === 'documents' && col === 'key') { this.filtres.push((r) => (r as unknown as { key: string }).key === String(v)); return this; }
  this.filtres.push((r) => lit(r, col) === String(v)); return this;
};
const client = (_url: string, cle: string, o?: { global?: { headers?: { authorization?: string } } }) => ({
  from: (table: string) => new Requete(table),
  rpc: async (nom: string, args: { n?: string }) => {
    if (nom === 'is_staff') return { data: (o?.global?.headers?.authorization ?? '') === 'Bearer staff' && cle === 'anon', error: null };
    if (nom === 'fiches_du_numero') return { data: fiches.has(String(args.n)) ? [{ id: `c-${args.n}` }] : [], error: null };
    return { data: null, error: { message: 'inconnue' } };
  },
});
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { method?: string; body?: string }) => {
  const u = String(url);
  if (u.startsWith('https://api.anthropic.com/')) {
    claudes += 1;
    versClaude.push(String(init.body ?? ''));
    const corps = JSON.parse(String(init.body ?? '{}'));
    const lu = String(corps.messages?.[0]?.content ?? '');
    if (lu.includes('PANNE')) return new Response(JSON.stringify({ error: { message: 'surcharge' } }), { status: 529 });
    const verdict = /sites web|affiches/.test(lu) ? 'demarchage' : /huiles/.test(lu) ? 'proposition' : 'cliente';
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'trie', input: { verdict, motif: verdict === 'demarchage' ? 'services numériques' : verdict === 'proposition' ? 'huiles pour locks' : 'une cliente' } }], usage: { input_tokens: 300, output_tokens: 30 } }), { status: 200 });
  }
  if (u.includes('/block_users')) {
    const b = JSON.parse(String(init.body ?? '{}'));
    graph.push({ methode: String(init.method), user: String(b.block_users?.[0]?.user ?? '') });
    if (metaRefuse) return new Response(JSON.stringify({ error: { code: 139100, message: 'refus' } }), { status: 400 });
    return new Response(JSON.stringify({ messaging_product: 'whatsapp', block_users: { added_users: [{ input: b.block_users?.[0]?.user }] } }), { status: 200 });
  }
  if (u.includes('/functions/v1/push-notify')) { pushs.push({ body: String(init.body ?? '') }); return new Response('{}', { status: 200 }); }
  throw new Error(`appel reseau inattendu : ${u}`);
};
const env: Record<string, string> = { SUPABASE_URL: 'https://banc', CLE_SERVICE: 'service', SUPABASE_ANON_KEY: 'anon', ANTHROPIC_API_KEY: 'cle', WA_TOKEN: 'jeton', WA_PHONE_ID: '999' };
let handler: ((r: Request) => Promise<Response>) | null = null;
const source = readFileSync(process.env.TRI_FONCTION as string, 'utf8').replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, '');
new Function('createClient', 'Deno', source)(client, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } });
console.log = ((v) => (...a: unknown[]) => { if (!String(a[0] ?? '').startsWith('tri-des-messages ·')) v(...a); })(console.log);
const appel = async (jeton: string, corps: unknown) => {
  const r = await handler!(new Request('https://banc/functions/v1/tri-des-messages', { method: 'POST', headers: { authorization: `Bearer ${jeton}`, 'content-type': 'application/json' }, body: JSON.stringify(corps) }));
  return { status: r.status, j: await r.json() as Record<string, unknown> };
};
const registre = () => triLu(docs.get(CLE_DU_TRI));

{
  const g = await handler!(new Request('https://banc/functions/v1/tri-des-messages'));
  const j = await g.json() as Record<string, unknown>;
  dit('GET : la version, Claude et Meta poses, sans cle', ['tri-des-messages', 'oui', 'oui'], [j.fonction, j.claude, j.meta]);

  const D = '22960000011';
  const a = await appel('service', { numero: D, textes: ['Bonjour, je crée affiches, vidéos et sites web pour les salons.'], nomProfil: 'B. digital' });
  const r = registre().bloques[D];
  dit('un demarcheur : bloque chez WhatsApp (une fois, son numero), range avec son motif et son nom, personne ne lui repond', ['bloque', [{ methode: 'POST', user: D }], 'bloque', 'services numériques', 'B. digital', 'claude'],
    [a.j.verdict, graph, r?.meta, r?.motif, r?.nom, r?.par]);
  dit('... aucune notification pour un blocage', 0, pushs.length);
  const avant = claudes;
  const a2 = await appel('service', { numero: D, textes: ['Encore moi'] });
  dit('... il reecrit (le blocage a ete refuse ou il ecrit d ailleurs) : toujours bloque, Claude n est pas rappele', ['bloque', avant], [a2.j.verdict, claudes]);

  const P = '22960000012';
  const p = await appel('service', { numero: P, textes: ['Nous fabriquons des huiles naturelles pour locks.'], nomProfil: 'Huilerie K.' });
  dit('une proposition qui parle de cheveux : rangee, pas bloquee, la direction prevenue une fois', ['proposition', 1, 1, true],
    [p.j.verdict, graph.length, pushs.length, P in registre().propositions]);
  dit('... la notification dit le nom et le motif, et mene aux propositions', [true, true], [pushs[0]?.body.includes('Huilerie K. : huiles pour locks'), pushs[0]?.body.includes('filtre=propositions')]);

  const C = '22960000013';
  const k1 = claudes;
  const cl = await appel('service', { numero: C, textes: ['Je voudrais un rendez-vous samedi pour un resserrage.'] });
  const cl2 = await appel('service', { numero: C, textes: ['Vous êtes là ?'] });
  dit('une cliente : jugee une fois, jamais rangee ; son message suivant ne rappelle pas Claude', ['cliente', 'passe', k1 + 1, 'cliente'],
    [cl.j.verdict, cl2.j.verdict, claudes, registre().juges[C]?.verdict]);

  const F = '22960000014'; fiches.add(F);
  const S = '22960000015'; tables.messages_wa.push({ id: 'wa-s1', data: { numero: S, sens: 'sortant', texte: 'Bonjour', quand: '2026-10-01T10:00:00Z' } });
  const k2 = claudes;
  const f = await appel('service', { numero: F, textes: ['Je crée des sites web.'] });
  const s = await appel('service', { numero: S, textes: ['Je crée des sites web.'] });
  dit('JAMAIS JUGE : une fiche, ou un numero a qui la Maison a deja ecrit ; Claude n est pas appele', ['connue', 'connue', k2, false, false],
    [f.j.verdict, s.j.verdict, claudes, F in registre().bloques, S in registre().bloques]);

  /* LE DÉMARCHEUR QUI SALUE D'ABORD (18 novembre 2026) : « Bonsoir » seul,
     la réponse automatique d'Opale, puis sa publicité. */
  const B = '22960000041';
  const k6 = claudes;
  const salut = await appel('service', { numero: B, textes: ['Bonsoir Madame !'] });
  const salut2 = await appel('service', { numero: B, textes: ['Bonjour, comment allez-vous ?', 'ok merci'] });
  dit('un bonjour seul (ou un merci) : ni juge ni inscrit, Claude n est pas appele', ['passe', 'sans-sujet', 'passe', k6, false],
    [salut.j.verdict, salut.j.motif, salut2.j.verdict, claudes, B in registre().juges]);
  tables.messages_wa.push({ id: 'wa-b1', data: { numero: B, sens: 'sortant', texte: 'Bonjour, et bienvenue', auto: 'automate', parQui: 'Opale', quand: '2026-11-11T13:46:02Z' } });
  const pub = await appel('service', { numero: B, textes: ['Je suis créateur de sites web professionnels. Seriez-vous intéressée ?'] });
  dit('... la reponse automatique d Opale ne le protege pas : sa publicite suivante est bloquee', ['bloque', k6 + 1, true],
    [pub.j.verdict, claudes, B in registre().bloques]);
  const Q = '22960000042';
  tables.messages_wa.push({ id: 'wa-q1', data: { numero: Q, sens: 'sortant', texte: 'Bonjour Madame, ici la Maison', parQui: 'Yéman Boya', quand: '2026-11-11T13:46:02Z' } });
  const k7 = claudes;
  const q = await appel('service', { numero: Q, textes: ['Je crée des sites web.'] });
  dit('... mais un message ecrit par une personne de la Maison le protege toujours', ['connue', k7], [q.j.verdict, claudes]);
  const Rl = '22960000043';
  const r0 = await appel('service', { numero: Rl, textes: ['Bonjour, vous êtes ouverts samedi ?'] });
  const r1 = await appel('service', { numero: Rl, textes: ['Je fais aussi des affiches pour les salons, à petit prix.'] });
  const k8 = claudes;
  const r2 = await appel('service', { numero: Rl, textes: ['Je fais aussi des affiches pour les salons, à petit prix.'], relire: true });
  dit('RELIRE (Opale) : un numero juge cliente se relit, et sa publicite le fait bloquer ; sans relire, il passe', ['cliente', 'passe', 'bloque', k8 + 1, true],
    [r0.j.verdict, r1.j.verdict, r2.j.verdict, claudes, Rl in registre().bloques]);
  const Bl = '22960000044';
  docs.set(CLE_DU_TRI, { ...registre(), blancs: { ...registre().blancs, [Bl]: '2026-11-01T00:00:00Z' } });
  const k9 = claudes;
  const rb = await appel('service', { numero: Bl, textes: ['Je crée des sites web.'], relire: true });
  dit('... mais jamais un numero rendu par la direction, meme relu', ['passe', k9, false], [rb.j.verdict, claudes, Bl in registre().bloques]);
  const rs = await appel('service', { numero: '22960000045', textes: ['Bonsoir'], relire: true });
  dit('... et un bonjour seul, meme relu, reste sans sujet', ['passe', 'sans-sujet'], [rs.j.verdict, rs.j.motif]);

  const V = '22960000016';
  const k3 = claudes;
  const vide = await appel('service', { numero: V, textes: [] });
  dit('une photo ou un vocal seul : rien a lire, rien de juge', ['passe', k3], [vide.j.verdict, claudes]);
  const pa = await appel('service', { numero: '22960000017', textes: ['PANNE sites web'] });
  dit('Claude en panne : comme avant (personne n est range)', ['passe', false], [pa.j.verdict, '22960000017' in registre().bloques]);

  const portes = await Promise.all([appel('n importe', { geste: 'debloquer', numero: D }), appel('service', { numero: '12', textes: ['x'] })]);
  dit('les portes : un jeton qui n est pas du personnel est refuse ; un numero illisible aussi', [403, 400], portes.map((x) => x.status));

  const g0 = graph.length;
  const db = await appel('staff', { geste: 'debloquer', numero: D });
  dit('debloquer : WhatsApp debloque (DELETE), le fil sort des bloques, le numero est blanc', [true, { methode: 'DELETE', user: D }, false, true],
    [db.j.ok, graph[g0], D in registre().bloques, D in registre().blancs]);
  const k4 = claudes;
  const apres = await appel('service', { numero: D, textes: ['Je crée des sites web, encore.'] });
  dit('... plus jamais juge, meme s il redemarche', ['passe', k4, false], [apres.j.verdict, claudes, D in registre().bloques]);

  const cli = await appel('staff', { geste: 'cliente', numero: P });
  dit('« C est une cliente » : la proposition revient, sans appel a WhatsApp', [true, false, true], [cli.j.ok, P in registre().propositions, P in registre().blancs]);

  const M = '22960000018';
  const g1 = graph.length;
  const bm = await appel('staff', { geste: 'bloquer', numeros: [M, F] });
  dit('« Bloquer ce numero » : bloque chez WhatsApp, par la direction ; une fiche jamais, meme a la main', [1, 1, [{ methode: 'POST', user: M }], 'direction', false],
    [bm.j.bloques, bm.j.refuses, graph.slice(g1), registre().bloques[M]?.par, F in registre().bloques]);
  metaRefuse = true;
  const R = '22960000019';
  const rf = await appel('service', { numero: R, textes: ['Je crée des affiches.'] });
  dit('WhatsApp refuse le blocage : le fil reste range, la ligne le dit', ['bloque', 'echec'], [rf.j.verdict, registre().bloques[R]?.meta]);
  metaRefuse = false;

  const maintenant = new Date().toISOString();
  const hier = new Date(Date.now() - 2 * 86_400_000).toISOString();
  tables.messages_wa.push(
    { id: 'wa-p1', data: { numero: '22960000031', sens: 'entrant', texte: 'Je crée des sites web pour salons', nomProfil: 'W. agence', quand: maintenant } },
    { id: 'wa-p2', data: { numero: '22960000032', sens: 'entrant', texte: 'Un rendez-vous demain ?', quand: maintenant } },
    { id: 'wa-p3', data: { numero: F, sens: 'entrant', texte: 'Je crée des sites web', quand: maintenant } },
    { id: 'wa-p4', data: { numero: '22960000034', sens: 'entrant', texte: 'Je crée des sites web', quand: hier } },
    { id: 'wa-p5', data: { numero: C, sens: 'entrant', texte: 'Je crée des sites web', quand: maintenant } },
  );
  const avantPasse = JSON.stringify(registre());
  const k5 = claudes;
  const ps = await appel('staff', { geste: 'passe' });
  dit('la passe des 24 h : seulement les inconnus de la veille, ni fiche, ni deja juge ; rien n est range sans la direction',
    [true, 2, [{ numero: '22960000031', nom: 'W. agence', verdict: 'demarchage' }], k5 + 2, avantPasse],
    [ps.j.ok, ps.j.lus, ((ps.j.proposes ?? []) as { numero: string; nom: string; verdict: string }[]).map((x) => ({ numero: x.numero, nom: x.nom, verdict: x.verdict })), claudes, JSON.stringify(registre())]);
  dit('aucun numero ne part chez Claude', [true, false], [versClaude.length > 5, versClaude.some((b) => /2296000\d{4}/.test(b))]);
}

/* ── ④ L'AUTOMATE ET LE TRÔNE, LUS DANS LEURS SOURCES ── */
const auto = readFileSync('supabase/functions/whatsapp-automate/index.ts', 'utf8').replace(/\r\n/g, '\n');
const servir = auto.slice(auto.indexOf('async function servirLeNumero('), auto.indexOf('async function unTour('));
dit('l automate trie AVANT son interrupteur, pour les clientes seulement, et se tait sur un range', [true, true],
  [servir.indexOf('estRangeParLeTri(') > 0 && servir.indexOf('estRangeParLeTri(') < servir.indexOf('numeroServi('),
    servir.includes("if (o.tiroir === 'clientes' && await estRangeParLeTri(sb, o, docs.get('mnd_tri_des_messages'))) return { pris: true };")]);
const range = auto.slice(auto.indexOf('async function estRangeParLeTri('), auto.indexOf('async function demandeAuTri('));
const demande = auto.slice(auto.indexOf('async function demandeAuTri('), auto.indexOf('async function servirLeNumero('));
dit('... rien n est appele pour un numero rendu, juge ou avec une fiche ; injoignable, comme avant', [true, true, true, true, true], [
  range.includes('if (!k || tri.blancs?.[k] || tri.juges?.[k]) return false;'), range.includes('if (!fiches || fiches.length > 0) return false;'),
  /catch \(e\) \{\s*dis\('tri injoignable : comme avant'[\s\S]{0,80}return '';/.test(demande), range.includes("return verdict === 'bloque' || verdict === 'proposition';"),
  demande.includes("...(o.relire ? { relire: true } : {})"),
]);
/* OPALE RECONNAÎT LE DÉMARCHAGE (18 novembre 2026) : son outil, la relecture, le silence. */
const outilDOpale = auto.slice(auto.indexOf("if (nom === 'ranger_un_demarchage') {"), auto.indexOf("return 'Outil inconnu.';", auto.indexOf("if (nom === 'ranger_un_demarchage') {")));
dit('Opale : son outil fait relire le tri ; range, rien ne part ; sinon elle repond', [true, true, true, true], [
  outilDOpale.includes('const textes = textesPourLeTri([...filLu, ...nouveaux]);'),
  outilDOpale.includes('await demandeAuTri({ numero: o.numero, textes, relire: true })'),
  /if \(verdictRange\(verdict\)\) \{\s*issue\.silence = true;/.test(outilDOpale),
  outilDOpale.includes('Le tri de la Maison ne le range pas.'),
]);
const cleWa = new Function(`${auto.slice(auto.indexOf('const cleDuTriWa = '), auto.indexOf('};', auto.indexOf('const cleDuTriWa = ')) + 2).replace('(numero: string): string =>', '(numero) =>')}; return cleDuTriWa;`)() as (x: string) => string;
dit('... la cle de l automate est celle du tri', NUMEROS.map(cleDuTri), NUMEROS.map((x) => cleWa(x)));
dit('... il lit le registre avec ses documents', true, /'mnd_assistant_wa', 'mnd_tri_des_messages'[,\]]/.test(auto));
const conv = readFileSync('src/apps/trone/routes/clients/LesConversations.tsx', 'utf8');
dit('le Trone : les onglets Propositions et Bloques, Debloquer, Bloquer ce numero, la passe et ses coches', [true, true, true, true, true], [
  conv.includes("(['propositions', 'bloques'] as const).map((f) => ("), conv.includes("{b.tri.etat === 'bloque' ? 'Débloquer' : 'C’est une cliente'}"),
  conv.includes('>Bloquer ce numéro</button>'), conv.includes('>Relire les dernières 24 h</button>'), conv.includes('Bloquer les cochés ({passe.coches.length})'),
]);
dit('... la direction seule bloque et debloque', [true, true], [conv.includes('{estDirection && b.sansFiche && !b.parentDe && b.fil && b.numero && !b.tri && aConfirmer !== b.cle && ('), conv.includes("{filtre === 'bloques' && estDirection && (")]);

console.log(ko === 0 ? `\nLe tri tient (${n} controles).` : `\n${ko} controle(s) en echec sur ${n}.`);
process.exitCode = ko === 0 ? 0 : 1;
