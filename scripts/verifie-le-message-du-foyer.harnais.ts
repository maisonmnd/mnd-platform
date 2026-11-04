/* LE MESSAGE DU FOYER, ÉPROUVÉ : `node scripts/verifie-le-message-du-foyer.mjs`
   (et `--prouve` pour planter les pannes une à une).

   4 novembre 2026. « Un seul message par foyer, au numéro du foyer, qui
   nomme toutes les têtes » (maquette du parcours du foyer, arbitrage 3).
   Le cas rejoué est celui de J. K. et F. K., deux sœurs qui viennent
   ensemble : deux rendez-vous liés (`foyerId`), le même jour, le même
   numéro. Les prénoms et les numéros sont inventés pour le banc, le nom de
   famille aussi (« Banc »).

   Trois étages : I la règle pure (src/shared/message-du-foyer-pur), II la
   porte d'Opale (src/shared/porte-des-modeles-pur), III les VRAIES
   fonctions confirmation-rdv, rappels-j1 et envois-partent, contre une base,
   un Meta, un Deno et une horloge simulés : on compte ce qui part chez Meta,
   numéro par numéro. Sortie ASCII : la console de Windows. */
import {
  appelDuFoyer, champsDuFoyer, cleDuFoyer, cleDuNumeroDuFoyer, fichesNommees, foyerQuiNeTientPlus, foyersAPrevenir,
  nommeLeRendezVous, prenomDeLaTete, prenomsDits, tetesCouvertes, tetesNommees, type TeteAPrevenir,
} from '../src/shared/message-du-foyer-pur';
import { dejaParti, laPorte, vientDeConfirmer, type LigneALaPorte } from '../src/shared/porte-des-modeles-pur';

let ko = 0;
let n = 0;
const ascii = (v: unknown): string =>
  (JSON.stringify(v) ?? 'undefined').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom: string, attendu: unknown, obtenu: unknown) => {
  n++;
  const ok = JSON.stringify(attendu) === JSON.stringify(obtenu);
  if (!ok) { ko++; process.exitCode = 1; }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${ascii(obtenu)} (attendu ${ascii(attendu)})`}`);
};

/* ══ I. LA RÈGLE PURE ══════════════════════════════════════════════════ */
const NUM = '+229 01 97 00 00 42';
const AUTRE_NUM = '+229 01 66 00 00 07';
type T = TeteAPrevenir & { nom: string; appel: string };
const tete = (o: Partial<T> & { id: string }): T => ({
  clientId: `cl-${o.id}`, foyerId: 'fo-k', date: '2026-12-22', time: '10:00', status: 'confirmé', numero: NUM, nom: '', appel: '', ...o,
});
const J = tete({ id: 'j', nom: 'Jade Banc', appel: 'Jade' });
const F = tete({ id: 'f', nom: 'Faith Banc', appel: 'Faith' });
{
  dit('I1 un prenom, deux, trois : « Jade », « Jade et Faith », « Jade, Faith et Maelle »',
    ['Jade', 'Jade et Faith', 'Jade, Faith et Maëlle'], [prenomsDits(['Jade']), prenomsDits(['Jade', 'Faith']), prenomsDits(['Jade', 'Faith', 'Maëlle'])]);
  dit('I2 le prenom d une fiche, jamais son nom de famille', ['Jade', 'Faith', ''], [prenomDeLaTete('Jade Banc'), prenomDeLaTete('  Faith   Banc '), prenomDeLaTete(undefined)]);
  dit('I3 la cle du numero : avec ou sans le 01, avec ou sans le +', true,
    cleDuNumeroDuFoyer(NUM) === cleDuNumeroDuFoyer('22997000042') && cleDuNumeroDuFoyer('97000042') === cleDuNumeroDuFoyer('2290197000042'));
  const deux = foyersAPrevenir([F, J]);
  dit('I4 J. K. et F. K. : un seul foyer, la plus tot (a la meme heure, le plus petit identifiant) le porte', [1, 'f', ['f', 'j']],
    [deux.length, deux[0]?.porteur.id, deux[0]?.tetes.map((t) => t.id)]);
  const plusTot = foyersAPrevenir([J, { ...F, time: '9:30' }]);
  dit('I5 la tete la plus tot porte le message, a son heure', ['f', '9:30'], [plusTot[0]?.porteur.id, plusTot[0]?.porteur.time]);
  const appel = (f: ReturnType<typeof foyersAPrevenir<T>>[number]) => appelDuFoyer(f, (t) => t.appel, (t) => prenomDeLaTete(t.nom));
  dit('I6 l appel du foyer : « Faith et Jade » (l ordre du foyer), sans nom de famille ni civilite', 'Faith et Jade', appel(deux[0]));
  dit('I7 une tete seule garde l appel de sa fiche (sa civilite)', 'Mme Awa',
    appelDuFoyer(foyersAPrevenir([tete({ id: 'a', nom: 'Awa Banc', appel: 'Mme Awa' })])[0], (t) => t.appel, (t) => prenomDeLaTete(t.nom)));
  dit('I8 deux rendez-vous d une meme fiche la nomment une fois', 'Mme Awa',
    appelDuFoyer(foyersAPrevenir([tete({ id: 'a1', clientId: 'cl-a', nom: 'Awa Banc', appel: 'Mme Awa' }), tete({ id: 'a2', clientId: 'cl-a', time: '11:00', nom: 'Awa Banc', appel: 'Mme Awa' })])[0],
      (t) => t.appel, (t) => prenomDeLaTete(t.nom)));
  const deuxNumeros = foyersAPrevenir([J, { ...F, numero: AUTRE_NUM }]);
  dit('I9 un foyer de deux numeros fait deux messages', [2, 1, 1], [deuxNumeros.length, deuxNumeros[0]?.tetes.length, deuxNumeros[1]?.tetes.length]);
  dit('I10 un rendez-vous annule n est jamais nomme', [1, ['j']], ((g) => [g.length, g[0]?.tetes.map((t) => t.id)])(foyersAPrevenir([J, { ...F, status: 'annulé' }])));
  dit('I11 deux enfants d un meme parent hors d un foyer : deux messages, comme avant', 2, foyersAPrevenir([{ ...J, foyerId: undefined }, { ...F, foyerId: undefined }]).length);
  dit('I12 le meme foyer un autre jour : un autre message', 2, foyersAPrevenir([J, { ...F, date: '2026-12-29' }]).length);
  dit('I13 une tete sans numero reste seule', [2, 'seule|f'], [foyersAPrevenir([J, { ...F, numero: '' }]).length, cleDuFoyer({ ...F, numero: null })]);
  dit('I14 la ligne d un foyer dit le foyer, chaque rendez-vous et chaque fiche ; une tete seule rien de plus',
    [{ foyerId: 'fo-k', apptIds: ['f', 'j'], clientIds: ['cl-f', 'cl-j'] }, {}], [champsDuFoyer(deux[0]), champsDuFoyer(foyersAPrevenir([J])[0])]);
  const ligneDuFoyer = { apptId: 'f', apptIds: ['f', 'j'], clientId: 'cl-f', clientIds: ['cl-f', 'cl-j'] };
  dit('I15 les tetes et les fiches qu une ligne nomme', [['f', 'j'], ['cl-f', 'cl-j'], ['x'], true, false],
    [tetesNommees(ligneDuFoyer), fichesNommees(ligneDuFoyer), tetesNommees({ apptId: 'x' }), nommeLeRendezVous(ligneDuFoyer, 'j'), nommeLeRendezVous({ apptId: 'x' }, 'j')]);
  const verrouille = (l: { statut?: string }) => l.statut !== 'échec';
  dit('I16 les tetes couvertes : celles d une ligne de ce type et de ce canal qui verrouille', [['f', 'j'], []], [
    [...tetesCouvertes([{ type: 'rappel-j1', canal: 'whatsapp', statut: 'envoyé', ...ligneDuFoyer }, { type: 'confirmation', canal: 'whatsapp', statut: 'envoyé', apptId: 'z' }], { type: 'rappel-j1', canal: 'whatsapp', verrouille })].sort(),
    [...tetesCouvertes([{ type: 'rappel-j1', canal: 'whatsapp', statut: 'échec', ...ligneDuFoyer }, { type: 'rappel-j1', canal: 'sms', statut: 'envoyé', ...ligneDuFoyer }], { type: 'rappel-j1', canal: 'whatsapp', verrouille })],
  ]);
  const relus = (o: Record<string, { date?: string; status?: string } | null>) => new Map(Object.entries(o));
  dit('I17 le foyer relu avant l envoi : une tete annulee, disparue ou a un autre jour, et il se refait', [null, true, true, true], [
    foyerQuiNeTientPlus({ ...ligneDuFoyer, dateRdv: '2026-12-22' }, relus({ j: { date: '2026-12-22', status: 'confirmé' } })),
    /annul/.test(foyerQuiNeTientPlus({ ...ligneDuFoyer, dateRdv: '2026-12-22' }, relus({ j: { date: '2026-12-22', status: 'annulé' } })) ?? ''),
    /existe plus/.test(foyerQuiNeTientPlus({ ...ligneDuFoyer, dateRdv: '2026-12-22' }, relus({})) ?? ''),
    /jour/.test(foyerQuiNeTientPlus({ ...ligneDuFoyer, dateRdv: '2026-12-22' }, relus({ j: { date: '2026-12-29', status: 'confirmé' } })) ?? ''),
  ]);
}

/* ══ II. LA PORTE D'OPALE ══════════════════════════════════════════════ */
{
  const t = Date.parse('2026-12-21T17:20:00Z');
  const il = (min: number) => new Date(t - min * 60_000).toISOString();
  const colis = (appel: string, cl = 'cl-f') => ({ genre: 'whatsapp', numero: '2290197000042', modele: 'rappel_rdv', parQui: 'la Maison, automatiquement',
    texteAuFil: `${appel}, votre rendez-vous est demain à 10 h.`, composants: [{ type: 'body', parameters: [{ type: 'text', text: appel }, { type: 'text', text: '10 h' }] }], cl });
  const ligne = (o: Partial<LigneALaPorte>): LigneALaPorte => ({
    id: 'env-f-whatsapp', type: 'rappel-j1', canal: 'whatsapp', statut: 'en-envoi', apptId: 'f', clientId: 'cl-f', dateRdv: '2026-12-22', heure: '10:00',
    deposeLe: il(10), quand: il(10), colis: colis('Faith'), ...o,
  });
  const rdv = { date: '2026-12-22', time: '10:00', status: 'confirmé', foyerId: 'fo-k' };
  const duFoyer = ligne({ id: 'env-f-whatsapp', apptIds: ['f', 'j'], clientIds: ['cl-f', 'cl-j'], foyerId: 'fo-k', colis: colis('Faith et Jade') });
  const partie = { ...duFoyer, statut: 'envoyé', quand: il(30) };
  const legacyJ = ligne({ id: 'env-j-whatsapp', apptId: 'j', clientId: 'cl-j', colis: colis('Jade', 'cl-j') });
  dit('II1 le second : une ligne pour une tete deja nommee par le message parti du foyer ne repart pas (journal)', true,
    /chaque rendez-vous de ce foyer/.test(dejaParti(legacyJ, { maintenantMs: t, rdv, envois: [partie], messages: [] }) ?? ''));
  dit('II2 ... ni quand seul le fil le dit (sa ligne remise en echec : le chemin du 2 novembre 2026)', 'retenu', laPorte(legacyJ, {
    maintenantMs: t, rdv, envois: [{ ...partie, statut: 'échec' }],
    messages: [{ sens: 'sortant', numero: '2290197000042', modele: 'rappel_rdv', clientId: 'cl-f', clientIds: ['cl-f', 'cl-j'], texte: 'Faith et Jade, votre rendez-vous est demain à 10 h.', quand: il(30), etat: 'remis' }],
  }).verdict);
  dit('II3 le message du foyer passe la porte la premiere fois', 'passe', laPorte(duFoyer, { maintenantMs: t, rdv, fiche: { name: 'Faith Banc' }, envois: [], messages: [] }).verdict);
  dit('II4 ... et la civilite de la fiche ne retouche pas un appel de foyer', 'passe', laPorte(duFoyer, { maintenantMs: t, rdv, fiche: { name: 'Faith Banc', civilite: 'mademoiselle' }, envois: [], messages: [] }).verdict);
  dit('II5 une tete encore jamais nommee passe : le foyer ne couvre que ce qu il a dit', null,
    dejaParti(ligne({ id: 'env-m-whatsapp', apptId: 'm', clientId: 'cl-m', colis: colis('Maelle', 'cl-m') }), { maintenantMs: t, rdv, envois: [partie], messages: [] }));
  dit('II6 deux enfants d un meme parent hors d un foyer gardent chacun leur rappel', null, dejaParti(legacyJ, {
    maintenantMs: t, rdv, envois: [{ ...ligne({}), statut: 'envoyé', quand: il(30) }],
    messages: [{ sens: 'sortant', numero: '2290197000042', modele: 'rappel_rdv', clientId: 'cl-f', texte: 'Faith, votre rendez-vous est demain à 10 h.', quand: il(30), etat: 'remis' }],
  }));
  const conf = { id: 'conf-f-whatsapp', type: 'confirmation', canal: 'whatsapp', statut: 'envoyé', apptId: 'f', apptIds: ['f', 'j'], quand: il(60) };
  dit('II7 la confirmation du foyer, partie il y a moins de 24 h, tait le rappel de chaque tete qu elle nomme', true,
    /confirmation est partie/.test(vientDeConfirmer(legacyJ, { maintenantMs: t, rdv, envois: [conf], messages: [] }) ?? ''));
  dit('II8 ... pas celui d une tete qu elle ne nomme pas', null, vientDeConfirmer(legacyJ, { maintenantMs: t, rdv, envois: [{ ...conf, apptIds: ['f'] }], messages: [] }));
}

/* ══ III. LES VRAIES FONCTIONS ═════════════════════════════════════════ */
type Ligne = Record<string, any>;
let TABLES: Record<string, Ligne[]> = {};
const table = (t: string): Ligne[] => (TABLES[t] ??= []);
const cleDe = (t: string): string => (t === 'documents' ? 'key' : 'id');
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
  private seule: 'non' | 'peut-etre' = 'non';
  private charge: any = null;
  private options: any = {};
  constructor(private t: string) {}
  select(cols = '*') { if (this.mode === 'select') this.cols = cols; else { this.rendre = true; this.cols = cols; } return this; }
  eq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) === String(v)); return this; }
  neq(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c)) !== String(v)); return this; }
  gt(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') > String(v)); return this; }
  gte(c: string, v: unknown) { this.filtres.push((l) => String(valeur(l, c) ?? '') >= String(v)); return this; }
  in(c: string, vs: unknown[]) { const s = new Set(vs.map(String)); this.filtres.push((l) => s.has(String(valeur(l, c)))); return this; }
  limit(k: number) { this.plafond = k; return this; }
  range(a: number, b: number) { this.debut = a; this.plafond = b - a + 1; return this; }
  maybeSingle() { this.seule = 'peut-etre'; return this; }
  update(d: any) { this.mode = 'update'; this.charge = d; return this; }
  upsert(d: any, o: any = {}) { this.mode = 'upsert'; this.charge = d; this.options = o; return this; }
  insert(d: any) { this.mode = 'insert'; this.charge = d; return this; }
  private execute(): { data: any; error: any } {
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
    if (this.seule !== 'non') return { data: data[0] ?? null, error: null };
    return { data, error: null };
  }
  then(ok: (r: any) => unknown, ko2?: (e: unknown) => unknown) {
    try { return Promise.resolve(this.execute()).then(ok, ko2); } catch (e) { return Promise.reject(e).then(ok, ko2); }
  }
}
const client = { from: (t: string) => new Requete(t), rpc: async () => ({ data: null, error: { message: 'rpc absente du banc' } }) };

/* L'horloge du banc : `new Date()` et `Date.now()` disent l'instant choisi. */
const VraieDate = Date;
let MAINTENANT = VraieDate.parse('2026-12-01T09:00:00Z');
class DateDuBanc extends VraieDate {
  constructor(...a: unknown[]) {
    if (a.length === 0) super(MAINTENANT);
    else super(...(a as [string]));
  }
  static now() { return MAINTENANT; }
}
(globalThis as any).Date = DateDuBanc;
const a = (iso: string) => { MAINTENANT = VraieDate.parse(iso); };
const iso = (ms: number) => new VraieDate(ms).toISOString();

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
    return new Response(JSON.stringify({ messages: [{ id: `wamid.foyer${++numeroWa}` }] }), { status: 200 });
  }
  return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
};
console.error = () => {};

await import('../supabase/functions/confirmation-rdv/index.ts');
await import('../supabase/functions/rappels-j1/index.ts');
await import('../supabase/functions/envois-partent/index.ts');
const [servirConfirmation, servirRappels, servirFacteur] = SERVIS;
const appelle = async (h: (req: Request) => Promise<Response>) =>
  (await h(new Request('http://faux.local/', { method: 'POST', headers: { authorization: `Bearer ${ENV.CLE_SERVICE}` } }))).json();
const confirmation = () => appelle(servirConfirmation);
const rappels = () => appelle(servirRappels);
const facteur = () => appelle(servirFacteur);

const TEL = '2290197000042';
const TEL_B = '2290166000007';
/* Une base neuve par scène : les fiches de J. K. et F. K., et la salle ouverte. */
function nouvelleBase() {
  TABLES = {};
  META = [];
  table('clients').push(
    { id: 'cl-jk', data: { name: 'Jade Banc', phone: NUM } },
    { id: 'cl-fk', data: { name: 'Faith Banc', phone: NUM } },
    { id: 'cl-awa', data: { name: 'Awa Banc', civilite: 'madame', phone: NUM } },
  );
}
const rdvDuFoyer = (id: string, clientId: string, nom: string, o: Ligne = {}) => ({
  id, branch_id: 'br-1', updated_at: iso(MAINTENANT - 5 * 60_000),
  data: { id, branchId: 'br-1', clientId, clientName: nom, date: '2026-12-22', time: '10:00', status: 'confirmé', source: 'trone', foyerId: 'fo-k', creeLe: iso(MAINTENANT - 5 * 60_000), ...o },
});
const lignesWa = (type: string) => table('envois').filter((l) => l.data?.type === type && l.data?.canal === 'whatsapp');
const auNumero = (to: string) => META.filter((m) => m.to === to);
const passeLaSalle = async () => { a(iso(MAINTENANT + 11 * 60_000)); await facteur(); };

/* ── Scène 1 : la confirmation de J. K. et F. K., posées ensemble le 1er décembre 2026 ── */
{
  nouvelleBase();
  a('2026-12-01T09:00:00Z');
  table('appointments').push(rdvDuFoyer('ap-jk', 'cl-jk', 'Jade Banc'), rdvDuFoyer('ap-fk', 'cl-fk', 'Faith Banc'));
  await facteur();
  await confirmation();
  const conf = lignesWa('confirmation');
  dit('III1 confirmation : une seule ligne WhatsApp pour le foyer, sous la tete la plus tot', [1, 'conf-ap-fk-whatsapp'], [conf.length, conf[0]?.id]);
  dit('III2 ... qui nomme chaque rendez-vous et chaque fiche', [['ap-fk', 'ap-jk'], ['cl-fk', 'cl-jk'], 'fo-k'],
    [conf[0]?.data?.apptIds, conf[0]?.data?.clientIds, conf[0]?.data?.foyerId]);
  dit('III3 le push reste a chaque tete (il va a son appli)', 2, table('envois').filter((l) => l.data?.canal === 'push').length);
  await passeLaSalle();
  dit('III4 J. K. et F. K. : un seul WhatsApp au numero du foyer', 1, auNumero(TEL).length);
  dit('III5 ... la confirmation approuvee, « Faith et Jade », le jour avec l annee', ['confirmation_rdv', 'Faith et Jade', 'mardi 22 décembre 2026 à 10 h'],
    [META[0]?.modele, META[0]?.corps[0], META[0]?.corps[1]]);
  const fil = table('messages_wa').find((m) => m.data?.sens === 'sortant');
  dit('III6 le fil dit le message parti et chaque fiche nommee, sans nom de famille ni tiret long', [true, ['cl-fk', 'cl-jk'], false],
    [/^Bonjour Faith et Jade, c'est confirmé/.test(fil?.data?.texte ?? ''), fil?.data?.clientIds, /Banc|—/.test(fil?.data?.texte ?? '')]);
  a('2026-12-01T09:25:00Z');
  table('appointments').forEach((r) => { r.updated_at = iso(MAINTENANT - 60_000); });
  await confirmation();
  await passeLaSalle();
  dit('III7 le balayage suivant ne confirme pas F. K. une seconde fois', [1, 1], [lignesWa('confirmation').length, auNumero(TEL).length]);
}

/* ── Scène 2 : le rappel de la veille, le 21 décembre 2026 à 18 h, puis 19 h ── */
const veille = async () => {
  nouvelleBase();
  a('2026-12-21T17:05:00Z');
  table('appointments').push(rdvDuFoyer('ap-jk', 'cl-jk', 'Jade Banc'), rdvDuFoyer('ap-fk', 'cl-fk', 'Faith Banc'));
  await facteur();
  await rappels();
};
{
  await veille();
  const r = lignesWa('rappel-j1');
  dit('III8 rappel : une seule ligne pour le foyer, qui nomme les deux', [1, 'env-ap-fk-whatsapp', ['ap-fk', 'ap-jk']], [r.length, r[0]?.id, r[0]?.data?.apptIds]);
  await passeLaSalle();
  dit('III9 J. K. et F. K. : un seul rappel au numero du foyer, « Faith et Jade », a 10 h', [1, 'rappel_rdv', 'Faith et Jade', '10 h'],
    [auNumero(TEL).length, META[0]?.modele, META[0]?.corps[0], META[0]?.corps[1]]);
  a('2026-12-21T18:05:00Z');
  await facteur();
  await rappels();
  await passeLaSalle();
  dit('III10 le second passage de 19 h ne depose rien et n envoie rien', [1, 1], [lignesWa('rappel-j1').length, auNumero(TEL).length]);
}

/* ── Scène 3 : la ligne du foyer remise en échec entre deux passages (le chemin du 2 novembre 2026) ── */
{
  await veille();
  await passeLaSalle();
  const l = table('envois').find((x) => x.id === 'env-ap-fk-whatsapp');
  if (l) l.data = { ...l.data, statut: 'échec', detail: 'accusé failed (banc)' };
  a('2026-12-21T18:05:00Z');
  await rappels();
  dit('III11 le fil dit les deux fiches : aucune ligne nouvelle pour l une ou l autre', [['env-ap-fk-whatsapp'], 'échec'],
    [lignesWa('rappel-j1').map((x) => x.id), table('envois').find((x) => x.id === 'env-ap-fk-whatsapp')?.data?.statut]);
  await passeLaSalle();
  dit('III12 ... et rien ne repart au numero', 1, auNumero(TEL).length);
}

/* ── Scène 4 : le second, déposé à part (une ligne d'avant le foyer), ne passe pas la porte ──
   Deux fois : avec le fil, puis sans lui (Meta a dit oui sans identifiant,
   rien n'est au fil) : seul le journal du foyer le dit alors. */
for (const sansLeFil of [false, true]) {
  await veille();
  await passeLaSalle();
  if (sansLeFil) TABLES.messages_wa = [];
  table('envois').push({
    id: 'env-ap-jk-whatsapp', branch_id: 'br-1',
    data: {
      id: 'env-ap-jk-whatsapp', branchId: 'br-1', type: 'rappel-j1', canal: 'whatsapp', apptId: 'ap-jk', clientId: 'cl-jk', dateRdv: '2026-12-22', heure: '10:00',
      statut: 'en-attente', quand: iso(MAINTENANT), deposeLe: iso(MAINTENANT), partA: iso(MAINTENANT),
      colis: { genre: 'whatsapp', numero: TEL, modele: 'rappel_rdv', parQui: 'la Maison, automatiquement', texteAuFil: 'Jade, votre rendez-vous est demain à 10 h.',
        composants: [{ type: 'body', parameters: [{ type: 'text', text: 'Jade' }, { type: 'text', text: '10 h' }] }] },
    },
  });
  await passeLaSalle();
  const second = table('envois').find((x) => x.id === 'env-ap-jk-whatsapp')?.data;
  dit(`III13 la porte retient le second : « perime », marque d Opale${sansLeFil ? ' (sans le fil : par le journal du foyer)' : ''}`, [1, 'périmé', true],
    [auNumero(TEL).length, second?.statut, /^retenu par Opale/.test(second?.detail ?? '')]);
}

/* ── Scène 5 : Opale retient le rappel du foyer (elle a écrit), il ne se redépose pour aucune tête ── */
{
  await veille();
  table('messages_wa').push({ id: 'wa-entrant-1', data: { id: 'wa-entrant-1', sens: 'entrant', numero: TEL, texte: 'Bonsoir, on sera la demain', quand: iso(MAINTENANT + 2 * 60_000) } });
  await passeLaSalle();
  const retenue = table('envois').find((x) => x.id === 'env-ap-fk-whatsapp')?.data;
  dit('III14 elle a ecrit depuis le depot : Opale retient le rappel du foyer', [0, 'périmé', true], [auNumero(TEL).length, retenue?.statut, /^retenu par Opale/.test(retenue?.detail ?? '')]);
  a('2026-12-21T18:05:00Z');
  await rappels();
  await passeLaSalle();
  dit('III15 le « retenu par Opale » ne se redepose pour aucune tete qu il nommait', [['env-ap-fk-whatsapp'], 0],
    [lignesWa('rappel-j1').map((x) => x.id), auNumero(TEL).length]);
}

/* ── Scène 6 : J. K. annulée pendant l'attente : le message se refait sans elle ── */
{
  await veille();
  const j = table('appointments').find((x) => x.id === 'ap-jk');
  if (j) j.data = { ...j.data, status: 'annulé' };
  await passeLaSalle();
  const avant = table('envois').find((x) => x.id === 'env-ap-fk-whatsapp')?.data;
  dit('III16 le facteur ne fait pas partir un message qui nomme une tete annulee', [0, 'périmé', false], [META.length, avant?.statut, /^retenu par Opale/.test(avant?.detail ?? '')]);
  a('2026-12-21T18:05:00Z');
  await rappels();
  await passeLaSalle();
  dit('III17 ... le passage de 19 h le refait pour F. K. seule, a son prenom', [1, 'Faith', ['env-ap-fk-whatsapp']],
    [auNumero(TEL).length, META[0]?.corps[0], lignesWa('rappel-j1').map((x) => x.id).sort()]);
}

/* ── Scène 7 : un foyer de deux numéros, et deux enfants d'un même parent hors foyer ── */
{
  nouvelleBase();
  a('2026-12-21T17:05:00Z');
  table('appointments').push(
    rdvDuFoyer('ap-jk', 'cl-jk', 'Jade Banc'), rdvDuFoyer('ap-fk', 'cl-fk', 'Faith Banc', { numeroAPrevenir: AUTRE_NUM }),
    rdvDuFoyer('ap-awa', 'cl-awa', 'Awa Banc', { foyerId: undefined, time: '15:00' }),
    rdvDuFoyer('ap-kiki', 'cl-kiki', 'Kiki Banc', { foyerId: undefined, time: '16:00' }),
  );
  table('clients').push({ id: 'cl-kiki', data: { name: 'Kiki Banc', phone: NUM } });
  await facteur();
  await rappels();
  await passeLaSalle();
  dit('III18 un foyer de deux numeros : un message a chacun, a son prenom', [['Faith'], ['Jade']],
    [auNumero(TEL_B).map((m) => m.corps[0]), auNumero(TEL).filter((m) => m.corps[1] === '10 h').map((m) => m.corps[0])]);
  dit('III19 deux enfants d un meme parent hors d un foyer : chacun son rappel, la civilite gardee', ['Kiki', 'Mme Awa'],
    auNumero(TEL).filter((m) => m.corps[1] !== '10 h').map((m) => m.corps[0]).sort());
}

/* ── Scène 8 : une confirmation retenue par Opale ne se redépose pas ── */
{
  nouvelleBase();
  a('2026-12-01T09:00:00Z');
  table('appointments').push(rdvDuFoyer('ap-awa', 'cl-awa', 'Awa Banc', { foyerId: undefined }));
  table('envois').push({ id: 'conf-ap-awa-whatsapp', data: { id: 'conf-ap-awa-whatsapp', type: 'confirmation', canal: 'whatsapp', apptId: 'ap-awa', clientId: 'cl-awa', dateRdv: '2026-12-22', statut: 'périmé', detail: 'retenu par Opale : déjà parti : le même message est au journal depuis moins de 20 h', quand: iso(MAINTENANT - 60_000) } });
  await facteur();
  await confirmation();
  await passeLaSalle();
  dit('III20 confirmation-rdv ne redepose pas ce qu Opale a retenu', ['périmé', 0], [table('envois').find((x) => x.id === 'conf-ap-awa-whatsapp')?.data?.statut, META.length]);
}

console.log(`\n${n - ko}/${n} epreuves tenues${ko ? ` ; ${ko} en echec` : ''}.`);
