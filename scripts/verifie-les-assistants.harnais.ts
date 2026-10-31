/* LES ASSISTANTS RELIÉS, ÉPROUVÉS · 31 octobre 2026.
   `node scripts/verifie-les-assistants.mjs` (et `--prouve`).

   ① Le cerveau pur : le filtre du mot d'un relais, l'échéance en heures
      ouvrées (un dimanche mène au mardi), l'état d'un assistant, le chien de
      garde du sommeil, l'heure dite, les tournures interdites, la note, les
      tresses, le jeton et son empreinte.
   ② La fonction `assistants-maison`, regroupée depuis le dépôt, contre une
      base et un push-notify simulés : la santé, les deux portes et leurs
      refus, le passage (l'état, les relais, les décisions, l'autre), l'empêché
      prévenu une fois, le relais et son filtre, la notification sans nom, la
      décision et la tournure interdite, le rendez-vous (fiche, idempotence,
      prise du jour, déjà un rendez-vous, verrou de la base dans la fenêtre,
      insert direct hors fenêtre, place tenue, tresses), le verrou optimiste,
      la note, le jeton donné (l'empreinte écrite, jamais le jeton), la place
      tranchée et la confirmation officielle déposée, le journal.
   ③ Le câblage : la migration porte les genres du module pur et l'empreinte
      d'Opale ; aucun nom privé dans les sources.
   Les numéros, fiches et messages du banc sont inventés : rien de réel ici. */
import { readFileSync } from 'node:fs';
import {
  GENRES_DE_DECISION, GENRES_DE_RELAIS, REGLAGES_PAR_DEFAUT, aCotonou, doitPrevenirDuSommeil, echeanceOuvree, empreinteDuJetonAssistant,
  estUneTresse, etatDe, heureDite, motEstPropre, noteEstPropre, nouveauJetonAssistant, porteDeLAction, tournureInterdite, vocabulairePermis,
} from '../src/shared/assistants-pur';

let ko = 0;
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  const a = JSON.stringify(attendu); const o = JSON.stringify(obtenu);
  if (a === o) console.log(`OK    ${nom}`);
  else { ko += 1; console.log(`ECHEC ${nom}\n       obtenu  ${o}\n       attendu ${a}`); }
};
/* La panne de `--prouve`, posée en mémoire sur le texte lu, jamais sur le disque. */
const PANNE = process.env.ASSISTANTS_PANNE ? JSON.parse(process.env.ASSISTANTS_PANNE) as { fichier: string; avant: string; apres: string } : null;
const lit = (f: string) => {
  const t = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  return PANNE && PANNE.fichier === f ? t.replace(PANNE.avant, PANNE.apres) : t;
};

/* ── ① LE CERVEAU PUR ── */
const permis = vocabulairePermis(['Création', 'SÍNSIN Essentiel', 'Reprise de racines'], ['Awa', 'Banc']);
dit('le mot d un relais : des faits passent, une citation, un numéro, un mot étranger aux faits non',
  [true, true, false, false, false, true],
  [motEstPropre('sœur, création, mardi 14 h', permis).ok, motEstPropre('Awa viendra avec sa fille, sinsin', permis).ok,
    motEstPropre('elle a dit « je viens »', permis).ok, motEstPropre('rappeler au 01 97 00 00 01', permis).ok,
    motEstPropre('rupture de stock', permis).ok, motEstPropre('', permis).ok]);
dit('… et le mot refusé est nommé', 'un mot hors des faits de la Maison : « rupture »', (motEstPropre('rupture de stock', permis) as { motif: string }).motif);
/* Le 1er novembre 2026 est un dimanche ; la Maison rouvre le mardi 3 à 8 h. */
dit('deux heures ouvrées depuis un dimanche 10 h : mardi 10 h (le compte repart à 8 h)', '2026-11-03T09:00:00.000Z', echeanceOuvree(Date.UTC(2026, 10, 1, 9, 0), 2));
dit('deux heures ouvrées depuis un samedi 19 h 30 : mardi 9 h 30', '2026-11-03T08:30:00.000Z', echeanceOuvree(Date.UTC(2026, 9, 31, 18, 30), 2));
dit('deux heures ouvrées un mardi 10 h : midi', '2026-11-03T11:00:00.000Z', echeanceOuvree(Date.UTC(2026, 10, 3, 9, 0), 2));
const ici = Date.UTC(2026, 10, 3, 9, 0); // mardi 3 novembre 2026, 10 h à Cotonou
const ilYA = (min: number) => new Date(ici - min * 60_000).toISOString();
dit('l état : sans jeton, jamais passé, endormi, empêché, éveillé', ['sans-jeton', 'endormi', 'endormi', 'empeche', 'eveille'], [
  etatDe({ aUnJeton: false, vuLe: null, etat: {} }, ici).etat,
  etatDe({ aUnJeton: true, vuLe: null, etat: {} }, ici).etat,
  etatDe({ aUnJeton: true, vuLe: ilYA(40), etat: {} }, ici).etat,
  etatDe({ aUnJeton: true, vuLe: ilYA(5), etat: { controles: { chrome: true, lie: false, nonLus: true } } }, ici).etat,
  etatDe({ aUnJeton: true, vuLe: ilYA(5), etat: { controles: { chrome: true, lie: true, nonLus: true } } }, ici).etat,
]);
dit('… avec le détail dit', ['endormi depuis 40 min', 'empêché : WhatsApp Web délié : le code QR est à l\'écran'], [
  etatDe({ aUnJeton: true, vuLe: ilYA(40), etat: {} }, ici).detail,
  etatDe({ aUnJeton: true, vuLe: ilYA(5), etat: { controles: { chrome: true, lie: false, nonLus: true } } }, ici).detail,
]);
dit('le chien de garde : prévient après le silence, une fois, jamais la nuit, jamais sans jeton', [true, false, false, false, false], [
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: ilYA(40), etat: {} }, ici, REGLAGES_PAR_DEFAUT),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: ilYA(40), etat: { dortPrevenuLe: ilYA(10) } }, ici, REGLAGES_PAR_DEFAUT),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: ilYA(40), etat: {} }, Date.UTC(2026, 10, 3, 21, 0), REGLAGES_PAR_DEFAUT),
  doitPrevenirDuSommeil({ aUnJeton: true, vuLe: ilYA(10), etat: {} }, ici, REGLAGES_PAR_DEFAUT),
  doitPrevenirDuSommeil({ aUnJeton: false, vuLe: ilYA(40), etat: {} }, ici, REGLAGES_PAR_DEFAUT),
]);
dit('l heure dite : aujourd hui, demain, le jour de la semaine, puis la date', ['aujourd\'hui 10 h', 'demain 14 h 30', 'samedi 10 h', 'le 23 nov. 9 h'], [
  heureDite('2026-11-03', '10:00', ici), heureDite('2026-11-04', '14:30', ici), heureDite('2026-11-07', '10:00', ici), heureDite('2026-11-23', '09:00', ici),
]);
dit('les tournures d assistant sont repérées, la voix du porteur passe', ['c\'est noté', 'n\'hésite pas', null], [
  tournureInterdite('C’est noté, à très vite'), tournureInterdite('N’hésite pas stp'), tournureInterdite('ok samedi 10h, bises'),
]);
dit('la note du carnet : des faits, jamais une citation ni un numéro, deux cents caractères', [true, false, false, false], [
  noteEstPropre('Veut une couleur cuivre, longueur épaules').ok, noteEstPropre('elle a dit « j’arrive »').ok, noteEstPropre('rappeler 0197000001').ok, noteEstPropre('x'.repeat(201)).ok,
]);
dit('une tresse se reconnaît à la prestation ou à sa rubrique', [true, true, true, false], [
  estUneTresse('Nattes collées'), estUneTresse('Vanilles'), estUneTresse('Pose', 'Tresses et nattes'), estUneTresse('Création', 'Reprise de racines'),
]);
dit('la porte de chaque action', ['jeton', 'souverain', null], [porteDeLAction('rdv.poser'), porteDeLAction('place.trancher'), porteDeLAction('sql')]);
const e1 = await empreinteDuJetonAssistant('assistant-opale-test');
dit('l empreinte du jeton : 64 hexadécimaux, la même après un blanc, jamais le jeton', [64, true, true, false],
  [e1.length, /^[0-9a-f]+$/.test(e1), e1 === await empreinteDuJetonAssistant(' assistant-opale-test '), e1.includes('opale-test')]);
dit('un jeton neuf : la forme, jamais deux fois le même', [true, true], [/^assistant-opale-[0-9a-f]{48}$/.test(nouveauJetonAssistant('opale')), nouveauJetonAssistant('opale') !== nouveauJetonAssistant('opale')]);

/* ── ② LA FONCTION ── */
type Row = Record<string, unknown>;
let tic = 0;
const horloge = () => new Date(Date.now() + (tic++)).toISOString();
const CLES: Record<string, string> = { assistants: 'id', assistants_relais: 'id', assistants_decisions: 'id', assistants_prises: 'cle', documents: 'key', appointments: 'id', envois: 'id', journal_gestes: 'id', staff: 'user_id', clients: 'id', branches: 'id', catalog_services: 'id', catalog_categories: 'id' };
const JETON_OPALE = 'assistant-opale-test';
const JETON_ONYX = 'assistant-onyx-test';
const tables: Record<string, Row[]> = {
  assistants: [
    { id: 'opale', nom: 'Opale', porteur_team_id: 'st-5qduae5jef', porteur_user_id: 'u-yeman', appareil: 'un ordinateur', empreinte: await empreinteDuJetonAssistant(JETON_OPALE), jeton_pose_le: horloge(), vu_le: null, eveille_depuis: null, etat: {}, branch_id: 'br-test', updated_at: horloge() },
    { id: 'onyx', nom: 'Onyx', porteur_team_id: 'st-d4t24p6inh', porteur_user_id: 'u-brice', appareil: 'un Mac', empreinte: await empreinteDuJetonAssistant(JETON_ONYX), jeton_pose_le: horloge(), vu_le: null, eveille_depuis: null, etat: {}, branch_id: 'br-test', updated_at: horloge() },
  ],
  assistants_relais: [], assistants_decisions: [], assistants_prises: [], journal_gestes: [], envois: [], appointments: [],
  documents: [{ key: 'mnd_settings', data: { assistants: { rythmeMin: 15 } } }, { key: 'mnd_house_identity', data: { nom: 'Maison du banc' } }, { key: 'mnd_auto_config', data: { itineraire: 'Au bout de la rue.' } }],
  staff: [{ user_id: 'u-yeman', name: 'Y. B.', role: 'souverain' }, { user_id: 'u-brice', name: 'B. A.', role: 'souverain' }, { user_id: 'u-maitre', name: 'M. T.', role: 'maitre' }],
  branches: [{ id: 'br-test', data: { name: 'Maison du banc', flagship: true, status: 'active', masters: ['Team', 'Expert'], masterParDefaut: 'Team' } }],
  catalog_categories: [{ id: 'c-soin', data: { label: 'Reprise de racines', fon: 'KLƆKLƆ' } }, { id: 'c-tresses', data: { label: 'Tresses et nattes' } }],
  catalog_services: [{ id: 's-creation', data: { name: 'Création', categoryId: 'c-soin' } }, { id: 's-sinsin', data: { name: 'SÍNSIN Essentiel', categoryId: 'c-soin' } }, { id: 's-nattes', data: { name: 'Nattes collées', categoryId: 'c-tresses' } }],
  clients: [
    { id: 'cl-1', data: { name: 'Awa Banc', phone: '+229 01 97 00 00 01', civilite: 'madame', branchId: 'br-test' } },
    { id: 'cl-2', data: { name: 'Codjo Banc', phone: '+229 01 97 00 00 02' } },
    { id: 'cl-3', data: { name: 'Dossi Banc', phone: '+229 01 97 00 00 05' } },
    { id: 'cl-4', data: { name: 'Efua Banc', phone: '+229 01 97 00 00 06' } },
    { id: 'cl-5', data: { name: 'Fifa Banc', phone: '+229 01 97 00 00 07' } },
    { id: 'cl-6', data: { name: 'Gbessi Banc', phone: '+229 01 97 00 00 08' } },
    { id: 'cl-7', data: { name: 'Hola Banc', phone: '+229 01 97 00 00 09' } },
  ],
};
const fichesParNumero: Record<string, Row[]> = {
  '2290197000001': [{ id: 'cl-1', nom: 'Awa Banc', parPhone: true, branchId: 'br-test' }],
  '2290197000002': [{ id: 'cl-2', nom: 'Codjo Banc', parPhone: true }],
  '2290197000004': [{ id: 'cl-1', nom: 'Awa Banc', parPhone: true }, { id: 'cl-3', nom: 'Dossi Banc', parFamille: true }],
  '2290197000005': [{ id: 'cl-3', nom: 'Dossi Banc', parPhone: true }],
  '2290197000006': [{ id: 'cl-4', nom: 'Efua Banc', parPhone: true }],
  '2290197000007': [{ id: 'cl-5', nom: 'Fifa Banc', parPhone: true }],
  '2290197000008': [{ id: 'cl-6', nom: 'Gbessi Banc', parPhone: true }],
  '2290197000009': [{ id: 'cl-7', nom: 'Hola Banc', parPhone: true }],
};
const JWTS: Record<string, string> = { 'jwt-yeman': 'u-yeman', 'jwt-brice': 'u-brice', 'jwt-maitre': 'u-maitre' };
let creneauPris = false;
const rpcAppels: { nom: string; params: Row }[] = [];
const valeur = (r: Row, col: string): unknown => {
  if (col.includes('->>')) { const [c, k] = col.split('->>'); return ((r[c] ?? null) as Row | null)?.[k]; }
  return r[col];
};
const cmp = (a: unknown, b: unknown) => String(a ?? '').localeCompare(String(b ?? ''));
class Requete {
  filtres: ((r: Row) => boolean)[] = [];
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  charge: Row[] = [];
  options: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  tri: { col: string; asc: boolean } | null = null;
  limite = Infinity;
  veutSelect = false;
  constructor(readonly table: string) {}
  select() { if (this.op !== 'select') this.veutSelect = true; return this; }
  eq(c: string, v: unknown) { this.filtres.push((r) => valeur(r, c) === v); return this; }
  neq(c: string, v: unknown) { this.filtres.push((r) => valeur(r, c) !== v); return this; }
  is(c: string, v: unknown) { this.filtres.push((r) => (v === null ? valeur(r, c) == null : valeur(r, c) === v)); return this; }
  not(c: string, op: string, v: unknown) { if (op === 'is' && v === null) this.filtres.push((r) => valeur(r, c) != null); return this; }
  in(c: string, vs: unknown[]) { this.filtres.push((r) => vs.includes(valeur(r, c))); return this; }
  gte(c: string, v: unknown) { this.filtres.push((r) => cmp(valeur(r, c), v) >= 0); return this; }
  lte(c: string, v: unknown) { this.filtres.push((r) => cmp(valeur(r, c), v) <= 0); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.tri = { col: c, asc: o?.ascending !== false }; return this; }
  limit(n: number) { this.limite = n; return this; }
  insert(rows: Row | Row[]) { this.op = 'insert'; this.charge = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) { this.op = 'upsert'; this.charge = Array.isArray(rows) ? rows : [rows]; this.options = o ?? {}; return this; }
  update(patch: Row) { this.op = 'update'; this.charge = [patch]; return this; }
  delete() { this.op = 'delete'; return this; }
  async maybeSingle() { const r = this.execute(); return { data: r.data?.[0] ?? null, error: r.error }; }
  async single() { const r = this.execute(); return { data: r.data?.[0] ?? null, error: r.data?.[0] ? r.error : { message: 'aucune ligne' } }; }
  then<T>(res: (v: { data: Row[] | null; error: { message: string } | null }) => T, rej?: (e: unknown) => T) { return Promise.resolve(this.execute()).then(res, rej); }
  execute(): { data: Row[] | null; error: { message: string } | null } {
    const t = tables[this.table]; if (!t) return { data: null, error: { message: `table inconnue ${this.table}` } };
    const cle = CLES[this.table] ?? 'id';
    const copie = (r: Row) => JSON.parse(JSON.stringify(r)) as Row;
    const touche = (r: Row) => { if ('updated_at' in r) r.updated_at = horloge(); };
    if (this.op === 'select') {
      let rows = t.filter((r) => this.filtres.every((f) => f(r)));
      if (this.tri) { const { col, asc } = this.tri; rows = [...rows].sort((a, b) => (asc ? 1 : -1) * cmp(valeur(a, col), valeur(b, col))); }
      return { data: rows.slice(0, this.limite).map(copie), error: null };
    }
    if (this.op === 'insert') {
      const faites: Row[] = [];
      for (const row of this.charge) {
        if (t.some((r) => r[cle] === row[cle])) return { data: null, error: { message: `duplicate key ${this.table}` } };
        const neuve = { ...(this.table === 'assistants_prises' ? { quand: horloge() } : {}), ...('updated_at' in (t[0] ?? {}) || ['appointments', 'assistants'].includes(this.table) ? { updated_at: horloge() } : {}), ...copie(row) };
        t.push(neuve); faites.push(copie(neuve));
      }
      return { data: this.veutSelect ? faites : null, error: null };
    }
    if (this.op === 'upsert') {
      const faites: Row[] = [];
      for (const row of this.charge) {
        const i = t.findIndex((r) => r[cle] === row[cle]);
        if (i >= 0) { if (this.options.ignoreDuplicates) continue; t[i] = { ...t[i], ...copie(row) }; touche(t[i]); faites.push(copie(t[i])); }
        else { const neuve = { ...(['appointments', 'assistants'].includes(this.table) ? { updated_at: horloge() } : {}), ...copie(row) }; t.push(neuve); faites.push(copie(neuve)); }
      }
      return { data: this.veutSelect ? faites : null, error: null };
    }
    if (this.op === 'update') {
      const touchees = t.filter((r) => this.filtres.every((f) => f(r)));
      for (const r of touchees) { Object.assign(r, copie(this.charge[0])); touche(r); }
      return { data: this.veutSelect ? touchees.map(copie) : null, error: null };
    }
    const gardees = t.filter((r) => !this.filtres.every((f) => f(r)));
    const parties = t.length - gardees.length;
    tables[this.table] = gardees;
    return { data: this.veutSelect ? [] : null, error: parties >= 0 ? null : { message: '' } };
  }
}
const fabrique = (_url: string, _cle: string) => ({
  from: (table: string) => new Requete(table),
  auth: { getUser: async (jwt: string) => (JWTS[jwt] ? { data: { user: { id: JWTS[jwt] } }, error: null } : { data: { user: null }, error: { message: 'invalide' } }) },
  rpc: async (nom: string, params: Row) => {
    rpcAppels.push({ nom, params });
    if (nom === 'fiches_du_numero') return { data: fichesParNumero[String(params.n)] ?? [], error: null };
    if (nom === 'pose_si_libre') {
      const rdv = params.p_rdv as Row; const maitres = (params.p_maitres as string[]) ?? [''];
      const appts = tables.appointments;
      const deja = appts.find((a) => a.id === rdv.id);
      if (deja) return { data: { ok: true, verdict: 'deja', id: deja.id, master: (deja.data as Row).master }, error: null };
      const aujourdhui = aCotonou(Date.now()).dateISO; const dans90 = aCotonou(Date.now() + 90 * 86_400_000).dateISO;
      if (String(rdv.date) <= aujourdhui || String(rdv.date) > dans90) return { data: { ok: false, raison: 'creneau_hors_fenetre' }, error: null };
      const meme = appts.find((a) => { const d = a.data as Row; return d.clientId === rdv.clientId && d.date === rdv.date && d.time === rdv.time && d.status !== 'annulé'; });
      if (meme) return { data: { ok: true, verdict: 'deja_pose', id: meme.id, master: (meme.data as Row).master }, error: null };
      if (creneauPris) return { data: { ok: false, raison: 'creneau_pris' }, error: null };
      appts.push({ id: rdv.id, branch_id: rdv.branchId, data: { ...rdv, master: maitres[0], dureeMin: 60 }, updated_at: horloge() });
      return { data: { ok: true, verdict: 'pose', id: rdv.id, master: maitres[0], dureeMin: 60 }, error: null };
    }
    return { data: null, error: { message: `rpc inconnue ${nom}` } };
  },
});
const pushs: { url: string; corps: Row; autorisation: string }[] = [];
(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init: { body: string; headers: Record<string, string> }) => {
  if (!String(url).endsWith('/functions/v1/push-notify')) throw new Error(`appel inattendu : ${url}`);
  pushs.push({ url: String(url), corps: JSON.parse(init.body), autorisation: init.headers.authorization });
  return { status: 200, json: async () => ({ version: 'banc', sent: 1 }) };
};
let handler: ((req: Request) => Promise<Response>) | null = null;
const env: Record<string, string> = { SUPABASE_URL: 'http://base', CLE_SERVICE: 'service', WA_TOKEN: 'wa', WA_PHONE_ID: '123', WA_TEMPLATE_CONF: 'confirmation_rdv' };
const sourceF = readFileSync(process.env.ASSISTANTS_FONCTION as string, 'utf8').replace(/^import \{ createClient \} from "npm:@supabase\/supabase-js@2";$/m, '');
new Function('createClient', 'Deno', sourceF)(fabrique, { env: { get: (k: string) => env[k] }, serve: (h: typeof handler) => { handler = h; } });

type Reponse = { ok?: boolean; motif?: string; detail?: string; tournure?: string; verdict?: string; rdvId?: string; id?: string; jeton?: string; [k: string]: unknown };
const appelle = async (entetes: Record<string, string>, corps: unknown) => {
  const r = await handler!(new Request('http://f/assistants-maison', { method: 'POST', headers: { 'content-type': 'application/json', ...entetes }, body: JSON.stringify(corps) }));
  return { status: r.status, corps: await r.json() as Reponse };
};
const opale = { 'x-jeton-assistant': JETON_OPALE };
const onyx = { 'x-jeton-assistant': JETON_ONYX };
const yeman = { authorization: 'Bearer jwt-yeman' };
const brice = { authorization: 'Bearer jwt-brice' };
const ligne = (table: string, f: (r: Row) => boolean) => tables[table].find(f) ?? null;
const lignes = (table: string, f: (r: Row) => boolean) => tables[table].filter(f);
const dateDans = (j: number) => aCotonou(Date.now() + j * 86_400_000).dateISO;
const aujourdhui = dateDans(0);
const sansNom = (texte: string) => !/Awa|Codjo|Dossi|Efua|Fifa|Gbessi|Hola|Banc/.test(texte);

const g = await handler!(new Request('http://f/assistants-maison', { method: 'GET' }));
dit('GET : la santé, la version, le nombre d assistants, aucun secret', ['assistants-maison', '2026-10-31-a', 2, false],
  await g.json().then((x: { fonction?: string; version?: string; assistants?: number }) => [x.fonction, x.version, x.assistants, JSON.stringify(x).includes('service')]));
dit('sans porte : refusé', [403, 'reserve-aux-assistants'], await appelle({}, { action: 'passage', controles: {} }).then((r) => [r.status, r.corps.motif]));
dit('un jeton inconnu : refusé', [403, 'reserve-aux-assistants'], await appelle({ 'x-jeton-assistant': 'assistant-opale-faux' }, { action: 'passage', controles: {} }).then((r) => [r.status, r.corps.motif]));
dit('la porte A sur une action de la porte B, et l inverse : mauvaise porte', [403, 'mauvaise-porte', 403, 'mauvaise-porte'], [
  ...(await appelle(opale, { action: 'jeton.donner', id: 'x' }).then((r) => [r.status, r.corps.motif])),
  ...(await appelle(yeman, { action: 'passage', controles: {} }).then((r) => [r.status, r.corps.motif])),
]);
dit('un membre du personnel qui n est pas souverain : la porte B reste fermée', [403, 'reserve-aux-assistants'], await appelle({ authorization: 'Bearer jwt-maitre' }, { action: 'jeton.donner', id: 'x' }).then((r) => [r.status, r.corps.motif]));
dit('une action inconnue : refusée avant toute porte', [400, 'action-inconnue'], await appelle(opale, { action: 'sql' }).then((r) => [r.status, r.corps.motif]));

/* Le passage : d'abord quelques relais et décisions pour Opale. */
tables.assistants_relais.push(
  { id: 'rel-a', de: 'onyx', pour: 'opale', genre: 'envie-lue', numero_cle: '2290197000001', quand: horloge(), perime_le: null, traite_le: null },
  { id: 'rel-perime', de: 'onyx', pour: 'opale', genre: 'fil-ouvert', quand: horloge(), perime_le: new Date(Date.now() - 60_000).toISOString(), traite_le: null },
  { id: 'rel-traite', de: 'onyx', pour: 'opale', genre: 'rdv-annule', quand: horloge(), perime_le: null, traite_le: horloge() },
);
tables.assistants_decisions.push(
  { id: 'dec-tranchee', assistant: 'opale', genre: 'reponse', resume: 'r', proposition: 'p', choix: ['envoyer', 'modifier', 'non'], tranchee: 'envoyer', tranchee_le: horloge(), executee_le: null, cree_le: horloge() },
  { id: 'dec-attend', assistant: 'opale', genre: 'reponse', resume: 'r', proposition: 'p', choix: ['envoyer', 'modifier', 'non'], tranchee: null, executee_le: null, cree_le: horloge() },
);
const p1 = await appelle(opale, { action: 'passage', controles: { chrome: true, lie: true, nonLus: true }, version: '2026-10-31', traites: 4 });
const opaleApres = ligne('assistants', (a) => a.id === 'opale')!;
dit('le passage : vu, éveillé depuis maintenant, l état écrit, les réglages, un relais vivant, une décision tranchée, l autre endormi',
  [true, null, true, true, 4, 15, ['rel-a'], ['dec-tranchee'], [{ id: 'onyx', etat: 'endormi', detail: 'jamais passé' }], null],
  [p1.corps.ok, p1.corps.precedentVuLe, !!opaleApres.vu_le, opaleApres.eveille_depuis === opaleApres.vu_le, (opaleApres.etat as Row).traites, (p1.corps.reglages as Row).rythmeMin,
    (p1.corps.relais as Row[]).map((r) => r.id), (p1.corps.decisions as Row[]).map((d) => d.id), (p1.corps.autres as Row[]).map((a) => ({ id: a.id, etat: a.etat, detail: a.detail })), p1.corps.empeche]);
const vu1 = opaleApres.vu_le; const serie1 = opaleApres.eveille_depuis;
const p2 = await appelle(opale, { action: 'passage', controles: { chrome: true, lie: true, nonLus: true } });
dit('… le second passage rend le précédent et garde la série', [vu1, serie1], [p2.corps.precedentVuLe, p2.corps.eveilleDepuis]);
opaleApres.vu_le = new Date(Date.now() - 40 * 60_000).toISOString();
const p3 = await appelle(opale, { action: 'passage', controles: { chrome: true, lie: true, nonLus: true } });
dit('… après quarante minutes de silence, c est un réveil : la série repart', true, p3.corps.eveilleDepuis !== serie1 && Date.parse(String(p3.corps.eveilleDepuis)) > Date.now() - 5_000);

/* L'empêché, prévenu une fois. */
const avantEmpeche = pushs.length;
const e1r = await appelle(onyx, { action: 'passage', controles: { chrome: true, lie: false, nonLus: true } });
await appelle(onyx, { action: 'passage', controles: { chrome: true, lie: false, nonLus: true } });
const notifEmpeche = pushs[avantEmpeche];
dit('un passage empêché : l état le dit, le porteur est prévenu une fois sur son téléphone, sans nom',
  ['WhatsApp Web délié : le code QR est à l\'écran', 1, 'to-staff', 'u-brice', 'Onyx est empêché', 'Bearer service', '/trone/#/assistants', 'mnd-assistants'],
  [e1r.corps.empeche, pushs.length - avantEmpeche, notifEmpeche?.corps.mode, notifEmpeche?.corps.userId, notifEmpeche?.corps.title, notifEmpeche?.autorisation, notifEmpeche?.corps.url, notifEmpeche?.corps.tag]);
await appelle(onyx, { action: 'passage', controles: { chrome: true, lie: true, nonLus: true } });
await appelle(onyx, { action: 'passage', controles: { chrome: false, lie: true, nonLus: true } });
dit('… rétabli puis empêché à nouveau : prévenu à nouveau', 2, pushs.length - avantEmpeche);

/* Les relais. */
dit('relais.deposer : une citation, un numéro, un mot étranger aux faits sont refusés, et nommés',
  [400, 'mot-refuse', true, 'mot-refuse', true, 'mot-refuse', 'un mot hors des faits de la Maison : « rupture »'], [
    ...(await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'envie-lue', mot: 'elle a dit « je viens »' }).then((r) => [r.status, r.corps.motif, String(r.corps.detail).includes('guillemets')])),
    ...(await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'envie-lue', mot: 'rappeler au 01 97 00 00 01' }).then((r) => [r.corps.motif, String(r.corps.detail).includes('numéro')])),
    ...(await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'envie-lue', mot: 'rupture de stock' }).then((r) => [r.corps.motif, r.corps.detail])),
  ]);
const avantRelais = pushs.length;
const r1 = await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'envie-lue', numeroCle: '+229 01 97 00 00 01', mot: 'sœur, création, mardi 14 h' });
const relR1 = ligne('assistants_relais', (r) => r.id === r1.corps.id)!;
dit('« sœur, création, mardi 14 h » passe : la ligne, la clé du numéro réduite, aucune notification pour une envie, le journal',
  [true, 'opale', 'onyx', 'envie-lue', '2290197000001', 'sœur, création, mardi 14 h', 0, 'assistant', 'Opale', 'pose', 'Relais : Une envie lue, posée en Note du carnet'],
  [r1.corps.ok, relR1?.de, relR1?.pour, relR1?.genre, relR1?.numero_cle, relR1?.mot, pushs.length - avantRelais,
    ...((): unknown[] => { const j = tables.journal_gestes.find((g) => (g.data as Row).pieceId === r1.corps.id)?.data as Row | undefined; return [j?.porte, j?.parNom, j?.verbe, j?.piece]; })()]);
dit('le prénom de la fiche visée est permis', true, (await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'envie-lue', clientId: 'cl-1', mot: 'Awa viendra mardi' })).corps.ok);
dit('un relais à soi-même, un genre inconnu : refusés', ['pour-invalide', 'genre-inconnu'], [
  (await appelle(opale, { action: 'relais.deposer', pour: 'opale', genre: 'envie-lue' })).corps.motif,
  (await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'potin' })).corps.motif,
]);
const r2 = await appelle(opale, { action: 'relais.deposer', pour: 'onyx', genre: 'argent-a-trancher', clientId: 'cl-1', mot: 'Awa doit encore le reste du carnet' });
const notifR2 = pushs[pushs.length - 1];
dit('un relais qui demande un geste part aussi au téléphone de l autre porteur : le bon compte, un corps sans nom',
  [true, 1, 'to-staff', 'u-brice', 'Une question d\'argent', 'Un relais vous attend au Trône.', true],
  [r2.corps.ok, r2.corps.sent, notifR2?.corps.mode, notifR2?.corps.userId, notifR2?.corps.title, notifR2?.corps.body, sansNom(JSON.stringify(notifR2?.corps))]);
dit('relais.traiter : l autre le traite, le déposant ne peut pas', [true, true, 403, 'pas-a-toi'], [
  (await appelle(onyx, { action: 'relais.traiter', id: r1.corps.id })).corps.ok, !!ligne('assistants_relais', (r) => r.id === r1.corps.id)!.traite_le,
  ...(await appelle(opale, { action: 'relais.traiter', id: r2.corps.id }).then((r) => [r.status, r.corps.motif])),
]);

/* Les décisions. */
dit('decision.deposer : une tournure d assistant est refusée et nommée ; un résumé qui cite aussi', [400, 'proposition-refusee', 'c\'est noté', 'resume-refuse'], [
  ...(await appelle(opale, { action: 'decision.deposer', genre: 'reponse', resume: 'Une cliente demande une place samedi', proposition: 'C’est noté, je te réserve la place' }).then((r) => [r.status, r.corps.motif, r.corps.tournure])),
  (await appelle(opale, { action: 'decision.deposer', genre: 'reponse', resume: 'elle dit « samedi »', proposition: 'ok' })).corps.motif,
]);
const d1 = await appelle(opale, { action: 'decision.deposer', genre: 'reponse', resume: 'Une cliente demande une place samedi matin', proposition: 'ok samedi 10h', numeroCle: '2290197000001', notifier: true });
const decD1 = ligne('assistants_decisions', (d) => d.id === d1.corps.id)!;
const notifD1 = pushs[pushs.length - 1];
dit('une décision déposée : la ligne, ses choix, le porteur prévenu (son assistant nommé, rien d autre)',
  [true, 'opale', 'reponse', ['envoyer', 'modifier', 'non'], null, 'u-yeman', 'Une décision vous attend', 'Opale a laissé une proposition dans Les assistants.'],
  [d1.corps.ok, decD1?.assistant, decD1?.genre, decD1?.choix, decD1?.tranchee, notifD1?.corps.userId, notifD1?.corps.title, notifD1?.corps.body]);
dit('decision.executee : par son assistant seulement', [403, true, true], [
  (await appelle(onyx, { action: 'decision.executee', id: 'dec-tranchee' })).status,
  (await appelle(opale, { action: 'decision.executee', id: 'dec-tranchee' })).corps.ok, !!ligne('assistants_decisions', (d) => d.id === 'dec-tranchee')!.executee_le,
]);

/* Les rendez-vous. */
const socle = { action: 'rdv.poser', serviceIds: ['s-creation'], time: '10:00', pourMaitre: 'st-5qduae5jef' };
dit('rdv.poser : une fiche inconnue, jamais créée ; plusieurs têtes sous un numéro : à choisir', [404, 'fiche-inconnue', 0, 409, 'plusieurs-fiches', 2], [
  ...(await appelle(opale, { ...socle, numeroCle: '2290197000003', date: dateDans(10), idempotence: 'opale:3:a' }).then((r) => [r.status, r.corps.motif, tables.assistants_prises.length])),
  ...(await appelle(opale, { ...socle, numeroCle: '2290197000004', date: dateDans(10), idempotence: 'opale:4:a' }).then((r) => [r.status, r.corps.motif, (r.corps.fiches as Row[]).length])),
]);
const rpcAvant = rpcAppels.filter((a) => a.nom === 'pose_si_libre').length;
const pose1 = await appelle(opale, { ...socle, numeroCle: '2290197000001', date: dateDans(10), idempotence: 'opale:1:a' });
const rdv1 = ligne('appointments', (a) => a.id === pose1.corps.rdvId)!;
const d1j = (rdv1?.data ?? {}) as Row;
const journalRdv1 = tables.journal_gestes.find((g) => (g.data as Row).pieceId === pose1.corps.rdvId)?.data as Row | undefined;
dit('la pose dans la fenêtre : par le verrou de la base, confirmée, signée par l assistant, pour son maître, sans relais ; le journal sans nom',
  [true, 'pose', 'Team', true, 1, 'confirmé', 'assistant', 'Opale', 'st-5qduae5jef', false, 'cl-1', ['s-creation'], true, 0,
    'assistant', 'Opale', 'pose', 'appointments', 'Les assistants', `Rendez-vous ${heureDite(dateDans(10), '10:00', Date.now())}, Création`, true],
  [pose1.corps.ok, pose1.corps.verdict, pose1.corps.master, /^rdv-/.test(String(pose1.corps.rdvId)), rpcAppels.filter((a) => a.nom === 'pose_si_libre').length - rpcAvant,
    d1j.status, d1j.source, d1j.poseePar, d1j.pourMaitre, d1j.sansConfirmation, d1j.clientId, d1j.serviceIds, !!d1j.creeLe, tables.assistants_relais.filter((r) => r.rdv_id === pose1.corps.rdvId).length,
    journalRdv1?.porte, journalRdv1?.parNom, journalRdv1?.verbe, journalRdv1?.table, journalRdv1?.ecran, journalRdv1?.piece, sansNom(JSON.stringify(journalRdv1))]);
dit('… les prises : le geste et le jour, avec le rendez-vous', [pose1.corps.rdvId, pose1.corps.rdvId], [
  ligne('assistants_prises', (p) => p.cle === 'geste:opale:1:a')?.rdv_id, ligne('assistants_prises', (p) => p.cle === `jour:2290197000001:${dateDans(10)}`)?.rdv_id,
]);
const rejoue = await appelle(opale, { ...socle, numeroCle: '2290197000001', date: dateDans(10), idempotence: 'opale:1:a' });
dit('la même pose rejouée : déjà, le même rendez-vous, rien de plus', [true, 'deja', pose1.corps.rdvId, 1, 1],
  [rejoue.corps.ok, rejoue.corps.verdict, rejoue.corps.rdvId, rpcAppels.filter((a) => a.nom === 'pose_si_libre').length - rpcAvant, tables.appointments.length]);
const dejaUn = await appelle(opale, { ...socle, numeroCle: '2290197000001', date: dateDans(15), idempotence: 'opale:1:b' });
dit('elle a déjà un rendez-vous à venir : le porteur tranche, la prise est rendue', [409, 'deja-un-rdv', pose1.corps.rdvId, dateDans(10), null],
  [dejaUn.status, dejaUn.corps.motif, (dejaUn.corps.rdv as Row)?.id, (dejaUn.corps.rdv as Row)?.date, ligne('assistants_prises', (p) => p.cle === 'geste:opale:1:b')]);
const ajout = await appelle(opale, { ...socle, numeroCle: '2290197000001', date: dateDans(15), idempotence: 'opale:1:b', ajouter: true });
dit('… « Ajouter » pose quand même', [true, 'pose'], [ajout.corps.ok, ajout.corps.verdict]);
const pris = await appelle(onyx, { ...socle, numeroCle: '2290197000001', date: dateDans(10), time: '15:00', pourMaitre: 'st-d4t24p6inh', idempotence: 'onyx:1:a' });
dit('la prise du jour est à l autre : pris, par qui, et le geste rendu', [409, 'pris', 'Opale', true, null],
  [pris.status, pris.corps.motif, pris.corps.par, !!pris.corps.quand, ligne('assistants_prises', (p) => p.cle === 'geste:onyx:1:a')]);
const rpcAvantDirect = rpcAppels.filter((a) => a.nom === 'pose_si_libre').length;
const direct = await appelle(opale, { ...socle, numeroCle: '2290197000002', date: aujourdhui, time: '16:00', idempotence: 'opale:2:a' });
const rdvDirect = ligne('appointments', (a) => a.id === direct.corps.rdvId);
dit('hors de la fenêtre du verrou (le jour même) : l insert direct, la branche vedette', [true, 'pose', 0, 'br-test', 'confirmé'],
  [direct.corps.ok, direct.corps.verdict, rpcAppels.filter((a) => a.nom === 'pose_si_libre').length - rpcAvantDirect, rdvDirect?.branch_id, (rdvDirect?.data as Row)?.status]);
creneauPris = true;
const plein = await appelle(opale, { ...socle, numeroCle: '2290197000009', date: dateDans(12), idempotence: 'opale:9:a' });
creneauPris = false;
dit('le verrou refuse la place : le motif de la base, et le geste rendu', ['creneau_pris', null], [plein.corps.motif, ligne('assistants_prises', (p) => p.cle === 'geste:opale:9:a')]);

/* La place tenue. */
const avantTenue = pushs.length;
const tenue = await appelle(onyx, { action: 'rdv.poser', numeroCle: '2290197000005', serviceIds: ['s-sinsin'], date: dateDans(10), time: '14:00', pourMaitre: 'st-5qduae5jef', tenue: true, idempotence: 'onyx:5:a' });
const rdvTenue = ligne('appointments', (a) => a.id === tenue.corps.rdvId)!;
const dT = (rdvTenue?.data ?? {}) as Row;
const relTenue = ligne('assistants_relais', (r) => r.rdv_id === tenue.corps.rdvId && r.genre === 'place-tenue');
const decTenue = ligne('assistants_decisions', (d) => d.rdv_id === tenue.corps.rdvId && d.genre === 'place-tenue');
const notifTenue = pushs[avantTenue];
const heureTenue = heureDite(dateDans(10), '14:00', Date.now());
dit('la place tenue sur le fauteuil de l autre : en attente, sans confirmation, l échéance, le relais, la décision pour l autre, son téléphone',
  [true, 'tenue', 'en attente', true, 'onyx', 'opale', true, 'onyx', 'opale', heureTenue,
    'opale', ['confirmer', 'autre-heure', 'non'], true, true, true,
    1, 'u-yeman', 'Une place tenue pour vous', `${heureTenue} : confirmez d'un toucher dans Les assistants.`, true],
  [tenue.corps.ok, tenue.corps.verdict, dT.status, dT.sansConfirmation, (dT.tenue as Row)?.par, (dT.tenue as Row)?.pour, !!(dT.tenue as Row)?.jusqua, relTenue?.de, relTenue?.pour, relTenue?.mot,
    decTenue?.assistant, decTenue?.choix, String(decTenue?.resume).startsWith('Place tenue'), String(decTenue?.resume).includes('Onyx') && String(decTenue?.resume).includes('SÍNSIN'), decTenue?.echeance === (dT.tenue as Row)?.jusqua,
    pushs.length - avantTenue, notifTenue?.corps.userId, notifTenue?.corps.title, notifTenue?.corps.body, sansNom(JSON.stringify(notifTenue?.corps))]);

/* Les tresses, posées par Onyx : Hermine est à prévenir depuis le fil de Yéman. */
const avantTresses = pushs.length;
const tresses = await appelle(onyx, { action: 'rdv.poser', numeroCle: '2290197000006', serviceIds: ['s-nattes'], date: dateDans(11), time: '09:00', pourMaitre: 'st-d4t24p6inh', idempotence: 'onyx:6:a' });
const relHermine = ligne('assistants_relais', (r) => r.rdv_id === tresses.corps.rdvId && r.genre === 'hermine-a-prevenir');
dit('des tresses posées par Onyx : un relais à Opale, et le téléphone de Yéman', [true, 'onyx', 'opale', 'u-yeman', 'Tresses posées'],
  [tresses.corps.ok, relHermine?.de, relHermine?.pour, pushs[avantTresses]?.corps.userId, pushs[avantTresses]?.corps.title]);
const avantPourToi = pushs.length;
const pourToi = await appelle(opale, { action: 'rdv.poser', numeroCle: '2290197000007', serviceIds: ['s-creation'], date: dateDans(12), time: '11:00', pourMaitre: 'st-d4t24p6inh', idempotence: 'opale:7:a' });
dit('un rendez-vous posé pour l autre, sans tenue : confirmé, un relais, son téléphone', [true, 'pose', 'confirmé', 'rdv-pose-pour-toi', 'u-brice', 'Rendez-vous posé pour vous'],
  [pourToi.corps.ok, pourToi.corps.verdict, (ligne('appointments', (a) => a.id === pourToi.corps.rdvId)?.data as Row)?.status,
    ligne('assistants_relais', (r) => r.rdv_id === pourToi.corps.rdvId)?.genre, pushs[avantPourToi]?.corps.userId, pushs[avantPourToi]?.corps.title]);

/* Le verrou optimiste. */
const vieux = rdv1.updated_at;
const depl0 = await appelle(opale, { action: 'rdv.deplacer', rdvId: pose1.corps.rdvId, date: dateDans(11), time: '11:00', updatedAt: '2020-01-01T00:00:00.000Z' });
const depl1 = await appelle(opale, { action: 'rdv.deplacer', rdvId: pose1.corps.rdvId, date: dateDans(11), time: '11:00', updatedAt: vieux });
const rdv1Apres = ligne('appointments', (a) => a.id === pose1.corps.rdvId)!;
const journalDepl = tables.journal_gestes.filter((g) => (g.data as Row).pieceId === pose1.corps.rdvId && (g.data as Row).verbe === 'modifie').pop()?.data as Row | undefined;
dit('rdv.deplacer : le verrou optimiste refuse une lecture périmée, accepte la bonne, et bouge la date', [409, 'modifie-entre-temps', true, dateDans(11), '11:00', true, true, 'Date'],
  [depl0.status, depl0.corps.motif, depl1.corps.ok, (rdv1Apres.data as Row).date, (rdv1Apres.data as Row).time, rdv1Apres.updated_at !== vieux, depl1.corps.updatedAt === rdv1Apres.updated_at, (journalDepl?.champs as Row[])?.[0]?.champ]);
dit('… rejouer avec l ancienne lecture : refusé', 'modifie-entre-temps', (await appelle(opale, { action: 'rdv.deplacer', rdvId: pose1.corps.rdvId, date: dateDans(12), time: '11:00', updatedAt: vieux })).corps.motif);
const rdvPourToi = ligne('appointments', (a) => a.id === pourToi.corps.rdvId)!;
await appelle(opale, { action: 'rdv.deplacer', rdvId: pourToi.corps.rdvId, date: dateDans(13), time: '11:00', updatedAt: rdvPourToi.updated_at });
dit('… déplacé sur le fauteuil de l autre : relais rdv-deplace', 'rdv-deplace', lignes('assistants_relais', (r) => r.rdv_id === pourToi.corps.rdvId).pop()?.genre);
const rdvAjout = ligne('appointments', (a) => a.id === ajout.corps.rdvId)!;
const ann = await appelle(opale, { action: 'rdv.annuler', rdvId: ajout.corps.rdvId, updatedAt: rdvAjout.updated_at });
dit('rdv.annuler sous le même verrou : annulé', [true, 'annulé'], [ann.corps.ok, (ligne('appointments', (a) => a.id === ajout.corps.rdvId)?.data as Row).status]);

/* La note. */
const note = await appelle(opale, { action: 'note.poser', rdvId: pose1.corps.rdvId, note: 'Veut une couleur cuivre, longueur épaules' });
dit('note.poser : signée du nom de l assistant et du jour, une citation refusée', [true, true, 'note-refusee'], [
  note.corps.ok, /^Opale, .+ : Veut une couleur cuivre, longueur épaules$/.test(String((ligne('appointments', (a) => a.id === pose1.corps.rdvId)?.data as Row).note)),
  (await appelle(opale, { action: 'note.poser', rdvId: pose1.corps.rdvId, note: 'elle a dit « bof »' })).corps.motif,
]);

/* Notifier. */
const avantNotif = pushs.length;
const n1 = await appelle(opale, { action: 'notifier', pour: 'moi', genre: 'decision' });
const n2 = await appelle(opale, { action: 'notifier', pour: 'onyx', genre: 'assistant-endormi', detail: { heure: 'rappeler 0197000001' } });
const n3 = await appelle(opale, { action: 'notifier', pour: 'moi', genre: 'blague' });
dit('notifier : moi, l autre, un genre inconnu ; un détail qui porte un numéro tombe', [true, true, 'u-yeman', 'u-brice', 'Des fils attendent de son côté.', 2, 'genre-inconnu'],
  [n1.corps.ok, n2.corps.ok, pushs[avantNotif]?.corps.userId, pushs[avantNotif + 1]?.corps.userId, pushs[avantNotif + 1]?.corps.body, pushs.length - avantNotif, n3.corps.motif]);

/* Le jeton, donné par un souverain. */
const don = await appelle(brice, { action: 'jeton.donner', id: 'jaspe', nom: 'Jaspe', porteurTeamId: 'st-banc', appareil: 'un portable' });
const jaspe = ligne('assistants', (a) => a.id === 'jaspe');
dit('jeton.donner : un jeton rendu une fois, l empreinte écrite, jamais le jeton, le porteur = le compte du JWT',
  [true, true, true, 'u-brice', 'Jaspe', false, false],
  [don.corps.ok, /^assistant-jaspe-[0-9a-f]{48}$/.test(String(don.corps.jeton)), jaspe?.empreinte === await empreinteDuJetonAssistant(String(don.corps.jeton)), jaspe?.porteur_user_id, jaspe?.nom,
    JSON.stringify(tables).includes(String(don.corps.jeton)), JSON.stringify(tables.journal_gestes).includes('jaspe')]);
dit('… le jeton ouvre la porte A ; retiré, il ne l ouvre plus', [true, true, 403], [
  (await appelle({ 'x-jeton-assistant': String(don.corps.jeton) }, { action: 'passage', controles: {} })).corps.ok,
  (await appelle(brice, { action: 'jeton.retirer', id: 'jaspe' })).corps.ok,
  (await appelle({ 'x-jeton-assistant': String(don.corps.jeton) }, { action: 'passage', controles: {} })).status,
]);

/* La décision tranchée. */
dit('decision.trancher : l autre souverain non ; un choix hors liste non ; le porteur oui ; deux fois non', [403, 'pas-ta-decision', 400, 'choix-inconnu', true, 'modifier', 'ok samedi 11h', 409, 'deja-tranchee'], [
  ...(await appelle(brice, { action: 'decision.trancher', id: d1.corps.id, choix: 'envoyer' }).then((r) => [r.status, r.corps.motif])),
  ...(await appelle(yeman, { action: 'decision.trancher', id: d1.corps.id, choix: 'confirmer' }).then((r) => [r.status, r.corps.motif])),
  (await appelle(yeman, { action: 'decision.trancher', id: d1.corps.id, choix: 'modifier', texte: 'ok samedi 11h' })).corps.ok,
  ligne('assistants_decisions', (d) => d.id === d1.corps.id)?.tranchee, ligne('assistants_decisions', (d) => d.id === d1.corps.id)?.texte_modifie,
  ...(await appelle(yeman, { action: 'decision.trancher', id: d1.corps.id, choix: 'non' }).then((r) => [r.status, r.corps.motif])),
]);
const p4 = await appelle(opale, { action: 'passage', controles: { chrome: true, lie: true, nonLus: true } });
dit('… le passage suivant de l assistant la rend à exécuter', true, (p4.corps.decisions as Row[]).some((d) => d.id === d1.corps.id && d.tranchee === 'modifier'));

/* La place tranchée : la confirmation officielle part d'ici. */
const avantPlace = pushs.length;
dit('place.trancher : l autre souverain ne confirme pas la place de Yéman', [403, 'pas-ta-decision'], await appelle(brice, { action: 'place.trancher', rdvId: tenue.corps.rdvId, choix: 'confirmer' }).then((r) => [r.status, r.corps.motif]));
const conf = await appelle(yeman, { action: 'place.trancher', rdvId: tenue.corps.rdvId, choix: 'confirmer' });
const rdvTenueApres = ligne('appointments', (a) => a.id === tenue.corps.rdvId)!;
const dTA = rdvTenueApres.data as Row;
const relConf = ligne('assistants_relais', (r) => r.rdv_id === tenue.corps.rdvId && r.genre === 'place-confirmee');
const envoiWa = ligne('envois', (e) => e.id === `conf-${tenue.corps.rdvId}-whatsapp`);
const envoiPush = ligne('envois', (e) => e.id === `conf-${tenue.corps.rdvId}-push`);
const colisWa = ((envoiWa?.data as Row)?.colis ?? {}) as Row;
const journalConf = tables.journal_gestes.filter((g) => (g.data as Row).pieceId === tenue.corps.rdvId).pop()?.data as Row | undefined;
dit('« Confirmer » : confirmé, la confirmation de la Maison rendue, la décision tranchée, le relais au poseur, son téléphone, les deux pièces officielles déposées en salle, le journal',
  [true, 'confirmer', 'confirmé', false, true, 'confirmer', 'u-yeman', 'opale', 'onyx', 'u-brice', 'Place confirmée',
    2, 'en-attente', 'confirmation', 'whatsapp', 'confirmation_rdv', '2290197000005', 2, true, 'en-attente', 'push', 'cl-3',
    'assistant', 'Y. B.', 'modifie', true],
  [conf.corps.ok, conf.corps.choix, dTA.status, dTA.sansConfirmation, !!(dTA.tenue as Row).confirmeeLe, decTenue?.tranchee, decTenue?.tranchee_par, relConf?.de, relConf?.pour, pushs[avantPlace]?.corps.userId, pushs[avantPlace]?.corps.title,
    conf.corps.deposes, (envoiWa?.data as Row)?.statut, (envoiWa?.data as Row)?.type, colisWa.genre, colisWa.modele, colisWa.numero, (colisWa.composants as Row[])?.[0] && ((colisWa.composants as Row[])[0].parameters as Row[]).length,
    String(colisWa.texteAuFil).includes('c\'est confirmé'), (envoiPush?.data as Row)?.statut, ((envoiPush?.data as Row)?.colis as Row)?.genre, ((envoiPush?.data as Row)?.colis as Row)?.clientId,
    journalConf?.porte, journalConf?.parNom, journalConf?.verbe, String(journalConf?.piece).startsWith('Place confirmée')]);
dit('… confirmer deux fois : non', 'deja-tranchee', (await appelle(yeman, { action: 'place.trancher', rdvId: tenue.corps.rdvId, choix: 'confirmer' })).corps.motif);
const tenue2 = await appelle(onyx, { action: 'rdv.poser', numeroCle: '2290197000008', serviceIds: ['s-creation'], date: dateDans(20), time: '10:00', pourMaitre: 'st-5qduae5jef', tenue: true, idempotence: 'onyx:8:a' });
const decTenue2 = ligne('assistants_decisions', (d) => d.rdv_id === tenue2.corps.rdvId)!;
const refus2 = await appelle(yeman, { action: 'decision.trancher', id: decTenue2.id, choix: 'autre-heure', date: dateDans(21), time: '15:00' });
dit('« Autre heure » par decision.trancher : annulé, la place refusée relayée avec l heure proposée, aucune pièce officielle',
  [true, 'annulé', 'place-refusee', heureDite(dateDans(21), '15:00', Date.now()), 'autre-heure', 0],
  [refus2.corps.ok, (ligne('appointments', (a) => a.id === tenue2.corps.rdvId)?.data as Row).status,
    ligne('assistants_relais', (r) => r.rdv_id === tenue2.corps.rdvId && r.genre === 'place-refusee')?.genre,
    ligne('assistants_relais', (r) => r.rdv_id === tenue2.corps.rdvId && r.genre === 'place-refusee')?.mot,
    ligne('assistants_decisions', (d) => d.id === decTenue2.id)?.tranchee, lignes('envois', (e) => String(e.id).includes(String(tenue2.corps.rdvId))).length]);

/* Le journal et les téléphones, sans nom. */
dit('tout le journal passe par la porte assistant, signé, sans nom de cliente', [true, true, true, true], [
  tables.journal_gestes.length >= 8, tables.journal_gestes.every((g) => (g.data as Row).porte === 'assistant'),
  tables.journal_gestes.every((g) => ['Opale', 'Onyx', 'Y. B.'].includes(String((g.data as Row).parNom))), sansNom(JSON.stringify(tables.journal_gestes)),
]);
dit('aucune notification ne porte un nom ni un jeton', [true, true], [sansNom(JSON.stringify(pushs)), !JSON.stringify(pushs).includes(JETON_OPALE)]);

/* ── ③ LE CÂBLAGE ── */
const sql = lit('supabase/migrations/0149_assistants.sql');
dit('la migration porte les genres du module pur, dans ses contraintes', [true, true], [
  GENRES_DE_RELAIS.every((g) => sql.includes(`'${g}'`)), GENRES_DE_DECISION.every((g) => sql.includes(`'${g}'`)),
]);
dit('… l empreinte d Opale, Onyx sans jeton, la RLS sur les quatre tables, aucune politique d insert', [true, true, 4, false], [
  sql.includes("'ea99abc29efac82eaa16c7179449dc50454af41331a06299403f395207b06b47'"), /'onyx', 'Onyx', 'st-d4t24p6inh', null/.test(sql),
  (sql.match(/enable row level security/g) ?? []).length, /for insert/.test(sql),
]);
const miens = [lit('scripts/serveur/assistants-maison.ts'), lit('scripts/assistants-maison-serveur.mjs'), sql].join('\n');
dit('aucun numéro réel dans les sources, aucun tiret long dans les fichiers du chantier', [false, false],
  [/\+?229\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}/.test(`${miens}\n${lit('src/shared/assistants-pur.ts')}`), miens.includes(String.fromCharCode(0x2014))]);

console.log(ko === 0 ? '\nLes assistants tiennent.' : `\n${ko} ECHEC.`);
process.exit(ko ? 1 : 0);
