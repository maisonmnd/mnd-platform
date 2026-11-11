import { build, transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ecartsDesCopies } from './collecte-copie-serveur.mjs';

/* RÉGLER PAR MTN, ÉPROUVÉ · 11 novembre 2026 (maquette AdAaYXGStQetsXHFkZzUW5).
   Deux bancs en un :
   - les RÈGLES PURES (src/shared/collecte-mtn-pur.ts), regroupées ici ;
   - le VRAI fichier du serveur (supabase/functions/collecte-mtn/index.ts),
     transpilé et servi par un faux Deno, contre un faux relais MTN et une
     fausse base. Aucun appel ne sort : fetch est remplacé.
   Lot A : aucun argent ne bouge. La direction seule lit le solde et fait
   l'essai sans argent ; tout passe par le relais, avec les clés de COLLECTE
   (jamais celles de la paie) ; aucune clé ni aucun jeton dans une réponse ;
   le numéro de collecte vient d'un réglage du serveur, jamais du dépôt.
   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restauration dans un finally, empreintes comparées), et le banc
   doit crier à chacune. Personnes, numéros et montants inventés. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const FONCTION = 'supabase/functions/collecte-mtn/index.ts';
const PUR = 'src/shared/collecte-mtn-pur.ts';
const BANDEAU = 'src/apps/trone/routes/finances/CompteDeCollecteMtn.tsx';
const CLIENT = 'src/apps/trone/routes/finances/collecte-mtn.ts';
const ENCAISSEMENTS = 'src/apps/trone/routes/finances/Encaissements.tsx';
const PANNES = [
  /* Le serveur */
  ['n importe qui lit le solde', FONCTION, "  if (!moi || !DIRECTION.has(String(moi.role))) return null;", '  if (!moi) return null;'],
  ['le relais muet fait tomber la fonction', FONCTION, '  } catch {\n    return { http: 0, corps: null };\n  }', '  } finally { /* rien */ }'],
  ['MTN appele sans le relais', FONCTION, "    const r = await fetch(`${k.relais}${chemin}`, {", "    const r = await fetch(`https://proxy.momoapi.mtn.com${chemin}`, {"],
  ['la cle du relais oubliee', FONCTION, "      headers: { 'X-Relais-Cle': k.relaisCle, 'Ocp-Apim-Subscription-Key': k.abonnement, ...(init.headers ?? {}) },", "      headers: { 'Ocp-Apim-Subscription-Key': k.abonnement, ...(init.headers ?? {}) },"],
  ['les cles de la paie prises pour la collecte', FONCTION, "  abonnement: env('MOMO_PROD_COLLECTION_SUBSCRIPTION'),", "  abonnement: env('MOMO_PROD_DISBURSEMENT_SUBSCRIPTION'),"],
  ['le jeton demande a la paie', FONCTION, "  const r = await mtn('/collection/token/', {", "  const r = await mtn('/disbursement/token/', {"],
  ['une cle montree au GET', FONCTION, "    cles: { utilisateur: !!k.utilisateur, cle: !!k.cle, abonnement: !!k.abonnement, numero: !!c.numero, compte: !!c.compte },", '    cles: { utilisateur: k.utilisateur, cle: k.cle, abonnement: k.abonnement, numero: c.numero, compte: c.compte },'],
  ['l environnement mtnbenin oublie', FONCTION, "  return mtn(chemin, { ...init, headers: { Authorization: `Bearer ${j.jeton}`, 'X-Target-Environment': cles().cible, ...(init.headers ?? {}) } });", "  return mtn(chemin, { ...init, headers: { Authorization: `Bearer ${j.jeton}`, ...(init.headers ?? {}) } });"],
  ['sans les cles, l essai part quand meme', FONCTION, "    if (!pret()) return json({ ...sante(), le, ...leCompte(), soldeXof: null, souci: souciDuCompte({ pret: false }) }, 503);", ''],
  ['le numero de collecte ecrit en dur', FONCTION, "  numero: numeroDitMtn(env('MOMO_PROD_COLLECTION_NUMERO')) || null,", "  numero: '01 90 00 00 99',"],
  ['un numero illisible demande a MTN', FONCTION, "    if (msisdn && s.jetonHttp === 200) {", '    if (s.jetonHttp === 200) {'],
  ['le jeton se perd dans la reponse', FONCTION, "      jeton: { ok: s.jetonHttp === 200, http: s.jetonHttp },", "      jeton: { ok: s.jetonHttp === 200, http: s.jetonHttp, valeur: jetonDuPassage?.jeton },"],
  /* Les règles */
  ['un numero a huit chiffres se complete', PUR, "  if (c.length === 10 && c.startsWith('01')) c = `229${c}`;", "  if (c.length === 10 && c.startsWith('01')) c = `229${c}`;\n  if (c.length === 8) c = `22901${c}`;"],
  ['un numero Moov passe pour MTN', PUR, "const PREFIXES_MTN_DU_BENIN: readonly string[] = ['42', '46',", "const PREFIXES_MTN_DU_BENIN: readonly string[] = ['95', '42', '46',"],
  ['le masque montre tout le numero', PUR, "  return d ? `${d.slice(0, 5)} •• •• ${d.slice(-2)}` : '';", '  return d;'],
  ['un solde absent devient zero', PUR, "  if (c?.availableBalance === undefined || c?.availableBalance === null || c?.availableBalance === '') return null;", ''],
  ['le relais muet se tait', PUR, "  if (j === 0) return 'Le relais MTN ne répond pas : le serveur de la Maison est-il allumé ?';", ''],
  /* Le Trône */
  ['le bandeau montre le solde a toute l equipe', BANDEAU, '  if (!direction) return null;\n', ''],
  ['le solde ne se relit plus chaque minute', CLIENT, '    const t = window.setInterval(() => { if (document.visibilityState === \'visible\') relire(); }, 60_000);', '    const t = window.setInterval(() => { if (document.visibilityState === \'visible\') relire(); }, 600_000);'],
  ['le bandeau quitte les encaissements', ENCAISSEMENTS, '      <CompteDeCollecteMtn />\n', ''],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout, propre.stderr); process.exit(1); }
  const fichiers = [...new Set(PANNES.map((x) => x[1]))];
  const gardes = new Map(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const avant = new Map(fichiers.map((f) => [f, md5(f)]));
  let muettes = 0;
  try {
    for (const [nom, f, a, b] of PANNES) {
      const garde = gardes.get(f);
      const brut = garde.toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, f), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      /* Une faute dans l'original des règles vit aussi dans la copie du
         serveur : on la remet là aussi, comme le ferait la copie. */
      const aussi = f === PUR ? FONCTION : null;
      const gardeAussi = aussi ? readFileSync(path.join(racine, aussi)) : null;
      if (aussi) {
        const t2 = gardeAussi.toString('utf8');
        const c2 = t2.includes('\r\n');
        const n2 = t2.replace(/\r\n/g, '\n').replace(a, b);
        writeFileSync(path.join(racine, aussi), c2 ? n2.replace(/\n/g, '\r\n') : n2);
      }
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, f), garde);
        if (aussi) writeFileSync(path.join(racine, aussi), gardeAussi);
      }
    }
  } finally {
    for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f)) && ecartsDesCopies(racine).length === 0;
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

let echecs = 0;
let oks = 0;
const dit = (nom, ok, vu = '') => { console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${vu}`}`); if (!ok) echecs++; else oks++; };
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const lis = (f) => readFileSync(path.join(racine, f), 'utf8').replace(/\r\n/g, '\n');

/* ══ 1. LES RÈGLES PURES ══ */
const dossier = path.join(racine, 'node_modules', '.cache', `verifie-collecte-mtn-${process.pid}`);
mkdirSync(dossier, { recursive: true });
let R;
try {
  const sortie = path.join(dossier, 'pur.mjs');
  await build({ entryPoints: [path.join(racine, PUR)], bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error' });
  R = await import(pathToFileURL(sortie).href);
} finally {
  /* rien : le dossier sert encore à la fonction, il part à la fin */
}

dit('le numero se lit : dix chiffres, +229, 00229 ; huit chiffres refuses, jamais completes',
  egal(['01 97 12 34 56', '+229 01 97 12 34 56', '00229 0197123456', '97123456', '229 97 12 34 56', '', 'abc'].map(R.msisdnDe),
    ['2290197123456', '2290197123456', '2290197123456', null, null, null, null]),
  JSON.stringify(['01 97 12 34 56', '97123456'].map(R.msisdnDe)));
dit('MTN d abord pour un numero MTN (51, 52, 61, 66, 67, 69, 90, 91, 96, 97) ; Moov (55, 58, 60, 63, 64, 65, 68, 94, 95, 98, 99) et Celtiis (40, 41, 43, 44) non',
  ['0151000001', '0152000001', '0161000001', '0166000001', '0167000001', '0169000001', '0190000001', '0191000001', '0196000001', '0197000001'].every(R.estUnNumeroMtn)
  && !['0155000001', '0158000001', '0160000001', '0163000001', '0164000001', '0165000001', '0168000001', '0194000001', '0195000001', '0198000001', '0199000001', '0140000001', '0141000001', '0143000001', '0144000001', '97000001'].some(R.estUnNumeroMtn),
  R.PREFIXES_MTN_DU_BENIN.join(','));
dit('le numero se dit « 01 97 12 34 56 » et se masque « 01 97 •• •• 56 »', egal([R.numeroDitMtn('2290197123456'), R.numeroMasque('0197123456'), R.numeroMasque('rien')], ['01 97 12 34 56', '01 97 •• •• 56', '']),
  JSON.stringify([R.numeroDitMtn('2290197123456'), R.numeroMasque('0197123456')]));
dit('le nom chez MTN : prenom et nom, sinon name, sinon rien', egal([R.nomDeMtnCollecte({ given_name: 'AWA', family_name: 'K.' }), R.nomDeMtnCollecte({ name: ' Sika ' }), R.nomDeMtnCollecte({}), R.nomDeMtnCollecte(null)], ['AWA K.', 'Sika', null, null]), '');
dit('le solde : un nombre lu, sinon rien (jamais zero par defaut)', egal([R.soldeDeMtnCollecte({ availableBalance: '412500.75' }), R.soldeDeMtnCollecte({}), R.soldeDeMtnCollecte({ availableBalance: 'x' }), R.soldeDeMtnCollecte(null)], [412500, null, null, null]), '');
dit('le souci se dit en clair : cles absentes, relais muet, relais qui refuse, cles refusees, solde illisible ; rien quand tout va',
  [R.souciDuCompte({ pret: false }), R.souciDuCompte({ pret: true, jetonHttp: 0 }), R.souciDuCompte({ pret: true, jetonHttp: 403 }), R.souciDuCompte({ pret: true, jetonHttp: 401 }), R.souciDuCompte({ pret: true, jetonHttp: 200, soldeHttp: 500 })].every((x) => typeof x === 'string' && x.length > 20 && !/—/.test(x))
  && R.souciDuCompte({ pret: true, jetonHttp: 200, soldeHttp: 200 }) === null && /relais MTN ne répond pas/.test(R.souciDuCompte({ pret: true, jetonHttp: 0 })),
  R.souciDuCompte({ pret: true, jetonHttp: 0 }));
dit('« il y a » : a l instant, 12 s, 3 min, 2 h', egal([R.ilYaDit(500), R.ilYaDit(12_000), R.ilYaDit(185_000), R.ilYaDit(7_300_000)], ['à l’instant', 'il y a 12 s', 'il y a 3 min', 'il y a 2 h']), '');
dit('la fonction porte la copie exacte des regles (collecte-copie-serveur)', ecartsDesCopies(racine).length === 0, ecartsDesCopies(racine).join(' ; '));

/* ══ 2. LE SERVEUR, contre un faux relais MTN et une fausse base ══ */
const PROJET = 'https://projet-essai.supabase.co';
const SERVICE = 'service-secrete-essai';
const RELAIS = 'https://relais-essai.example';
const RELAIS_CLE = 'CLE-DU-RELAIS-SECRETE';
const C_USER = '7dbbf2d7-0000-4000-8000-00000000c011';
const C_KEY = 'CLE-COLLECTE-SECRETE';
const C_ABO = 'ABO-COLLECTE-SECRET';
const D_ABO = 'ABO-PAIE-SECRET';
const NUMERO_DE_COLLECTE = '0190000099';
const ENV = {
  SUPABASE_URL: PROJET, SUPABASE_SERVICE_ROLE_KEY: SERVICE, CLE_SERVICE: 'cle-service-du-coffre',
  MOMO_RELAIS_URL: RELAIS, MOMO_RELAIS_CLE: RELAIS_CLE, MOMO_TARGET_ENV: 'mtnbenin',
  MOMO_PROD_COLLECTION_USER: C_USER, MOMO_PROD_COLLECTION_KEY: C_KEY, MOMO_PROD_COLLECTION_SUBSCRIPTION: C_ABO,
  MOMO_PROD_DISBURSEMENT_USER: 'paie-user', MOMO_PROD_DISBURSEMENT_KEY: 'CLE-PAIE-SECRETE', MOMO_PROD_DISBURSEMENT_SUBSCRIPTION: D_ABO,
  MOMO_PROD_COLLECTION_NUMERO: NUMERO_DE_COLLECTE, MOMO_PROD_COLLECTION_COMPTE: 'CompteEssai.sp',
};
const SECRETS = [SERVICE, 'cle-service-du-coffre', RELAIS_CLE, C_KEY, C_ABO, D_ABO, 'CLE-PAIE-SECRETE', 'JETON-COLLECTE-SECRET'];
const JWT_DIRECTION = 'jwt-direction';
const JWT_EQUIPE = 'jwt-equipe';
const COMPTES = { [JWT_DIRECTION]: '11111111-1111-4111-8111-111111111111', [JWT_EQUIPE]: '22222222-2222-4222-8222-222222222222' };
const STAFF = { [COMPTES[JWT_DIRECTION]]: { role: 'souverain', name: 'Y. B.' }, [COMPTES[JWT_EQUIPE]]: { role: 'coiffeuse', name: 'A. K.' } };

const N = { bon: '2290197000001', inactif: '2290197000005', anonyme: '2290197000007' };
const NOMS = { [N.bon]: ['AWA', 'KOSSOU'] };

let journal = [];
let soldeMtn = 412_500;
let jetonRefuse = false;
let relaisMuet = false;
const remiseAZero = () => { journal = []; soldeMtn = 412_500; jetonRefuse = false; relaisMuet = false; };

const rep = (status, corps) => new Response(corps === undefined ? '' : JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });

function base(url, methode, h) {
  if (h.apikey !== SERVICE || h.authorization !== `Bearer ${SERVICE}`) return rep(401, { message: 'service attendu' });
  const table = url.pathname.replace('/rest/v1/', '');
  if (table === 'staff') {
    const uid = url.searchParams.get('user_id')?.replace(/^eq\./, '');
    return rep(200, STAFF[uid] ? [STAFF[uid]] : []);
  }
  return rep(404, { message: `table inconnue ${table} (${methode})` });
}

function mtn(url, methode, h) {
  if (relaisMuet) return null;
  if (h['x-relais-cle'] !== RELAIS_CLE) return rep(403, { message: 'refusé' });
  if (h['ocp-apim-subscription-key'] !== C_ABO) return rep(401, { message: 'missing subscription key' });
  const p = url.pathname;
  if (p.startsWith('/disbursement/')) return rep(500, { message: 'la collecte ne parle jamais a la paie' });
  if (methode === 'POST' && p === '/collection/token/') {
    if (jetonRefuse) return rep(401, { error: 'login' });
    return h.authorization === `Basic ${btoa(`${C_USER}:${C_KEY}`)}` ? rep(200, { access_token: 'JETON-COLLECTE-SECRET', token_type: 'access_token', expires_in: 3600 }) : rep(401, { error: 'login' });
  }
  if (h.authorization !== 'Bearer JETON-COLLECTE-SECRET') return rep(401, { message: 'jeton' });
  if (h['x-target-environment'] !== 'mtnbenin') return rep(500, { code: 'NOT_ALLOWED_TARGET_ENVIRONMENT' });
  let m;
  if (methode === 'GET' && p === '/collection/v1_0/account/balance') return rep(200, { availableBalance: String(soldeMtn), currency: 'XOF' });
  if (methode === 'GET' && (m = p.match(/^\/collection\/v1_0\/accountholder\/msisdn\/(\d+)\/active$/))) return rep(200, { result: m[1] !== N.inactif });
  if (methode === 'GET' && (m = p.match(/^\/collection\/v1_0\/accountholder\/msisdn\/(\d+)\/basicuserinfo$/))) {
    const n = NOMS[m[1]]; return n ? rep(200, { given_name: n[0], family_name: n[1] }) : rep(404, { code: 'NOT_FOUND' });
  }
  return rep(404, { message: `inattendu ${methode} ${p}` });
}

async function fauxFetch(entree, init = {}) {
  const url = new URL(String(entree));
  const methode = (init.method ?? 'GET').toUpperCase();
  const h = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const corps = init.body ? JSON.parse(init.body) : undefined;
  journal.push({ methode, url: url.href, chemin: url.pathname, origine: url.origin, h, corps });
  if (url.origin === PROJET && url.pathname === '/auth/v1/user') {
    const jwt = (h.authorization ?? '').replace('Bearer ', '');
    return COMPTES[jwt] ? rep(200, { id: COMPTES[jwt] }) : rep(401, { message: 'jeton' });
  }
  if (url.origin === PROJET && url.pathname.startsWith('/rest/v1/')) return base(url, methode, h, corps);
  if (url.origin === RELAIS) {
    const r = mtn(url, methode, h, corps);
    if (r === null) throw new TypeError('fetch failed');
    return r;
  }
  return rep(599, { message: `hors du monde simule : ${url.origin}` });
}

let gestionnaire = null;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (f) => { gestionnaire = f; } };
globalThis.fetch = fauxFetch;
try {
  const { code } = await transform(readFileSync(path.join(racine, FONCTION), 'utf8'), { loader: 'ts', format: 'esm' });
  const sortie = path.join(dossier, 'fonction.mjs');
  writeFileSync(sortie, code);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

const appelle = async (init = {}) => {
  const r = await gestionnaire(new Request(`${PROJET}/functions/v1/collecte-mtn`, init));
  const t = await r.text();
  let o = null; try { o = JSON.parse(t); } catch { o = null; }
  return { status: r.status, o, t };
};
const poste = (jwt, corps) => appelle({ method: 'POST', headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
const direction = (corps) => poste(JWT_DIRECTION, corps);
const sansSecret = (t) => !SECRETS.some((s) => t.includes(s));
const versMtn = () => journal.filter((j) => j.origine !== PROJET);

/* La santé */
{
  remiseAZero();
  const r = await appelle({ method: 'GET' });
  dit('le GET dit sa version et ce qui est pose, sans aucune valeur', r.status === 200 && r.o?.pret === true && /^\d{4}-\d{2}-\d{2}-[a-z]$/.test(r.o?.version) && r.o?.cles?.numero === true && sansSecret(r.t) && !r.t.includes('0190000099') && !r.t.includes('CompteEssai'), r.t.slice(0, 300));
  const s = await poste(null, { action: 'sante' });
  dit('la sante se lit aussi en POST, sans jeton', s.status === 200 && s.o?.version === r.o?.version, s.t);
  dit('la sante n appelle jamais MTN', versMtn().length === 0, JSON.stringify(versMtn().map((j) => j.chemin)));
  const cle = ENV.MOMO_PROD_COLLECTION_KEY; delete ENV.MOMO_PROD_COLLECTION_KEY;
  const r2 = await appelle({ method: 'GET' });
  dit('une cle absente : pas pret, et dit laquelle manque', r2.o?.pret === false && r2.o?.cles?.cle === false && r2.o?.cles?.utilisateur === true, r2.t);
  const r3 = await direction({ action: 'solde' });
  dit('sans les cles : rien n est demande a MTN, et le souci se dit', r3.status === 503 && /pas encore posés/.test(r3.o?.souci ?? '') && versMtn().length === 0, r3.t);
  ENV.MOMO_PROD_COLLECTION_KEY = cle;
}

/* Qui appelle */
{
  remiseAZero();
  const sans = await poste(null, { action: 'solde' });
  const equipe = await poste(JWT_EQUIPE, { action: 'solde' });
  const service = await poste(SERVICE, { action: 'solde' });
  const essaiEquipe = await poste(JWT_EQUIPE, { action: 'essai', numero: N.bon });
  dit('le solde et l essai : refuses sans jeton, a l equipe, a la cle de service', [sans, equipe, service, essaiEquipe].every((x) => x.status === 403), [sans, equipe, service, essaiEquipe].map((x) => x.status).join(' '));
  dit('... et MTN n a pas ete appele', versMtn().length === 0, JSON.stringify(versMtn().map((j) => j.chemin)));
  const inconnue = await direction({ action: 'demander' });
  dit('une action inconnue du lot A est refusee', inconnue.status === 400, inconnue.t);
}

/* Le solde en direct */
{
  remiseAZero();
  const r = await direction({ action: 'solde' });
  dit('le solde : le montant chez MTN, le numero de collecte lu dans son reglage, le nom du compte, l heure',
    r.status === 200 && r.o?.soldeXof === 412500 && r.o?.numero === '01 90 00 00 99' && r.o?.compte === 'CompteEssai.sp' && !!Date.parse(r.o?.le) && r.o?.souci === null, r.t);
  dit('le solde ne montre aucune cle ni jeton', sansSecret(r.t), r.t);
  dit('chaque appel a MTN passe par le relais, avec sa cle, l abonnement de COLLECTE et l environnement mtnbenin',
    versMtn().length === 2 && versMtn().every((j) => j.origine === RELAIS && j.h['x-relais-cle'] === RELAIS_CLE && j.h['ocp-apim-subscription-key'] === C_ABO && (j.chemin === '/collection/token/' || j.h['x-target-environment'] === 'mtnbenin')),
    JSON.stringify(versMtn().map((j) => j.chemin)));
  dit('le jeton se demande a la collecte, avec l utilisateur et la cle de collecte', versMtn()[0]?.chemin === '/collection/token/' && versMtn()[0]?.h.authorization === `Basic ${btoa(`${C_USER}:${C_KEY}`)}`, JSON.stringify(versMtn()[0]?.chemin));
  const garde = ENV.MOMO_PROD_COLLECTION_NUMERO; delete ENV.MOMO_PROD_COLLECTION_NUMERO;
  const r2 = await direction({ action: 'solde' });
  dit('sans son reglage, le numero manque (le Trone dit « numero a poser »)', r2.status === 200 && r2.o?.numero === null && r2.o?.soldeXof === 412500, r2.t);
  ENV.MOMO_PROD_COLLECTION_NUMERO = garde;
  jetonRefuse = true;
  const r3 = await direction({ action: 'solde' });
  dit('les cles refusees par MTN : pas de solde, le souci dit les cles', r3.o?.soldeXof === null && /refuse les clés de collecte/.test(r3.o?.souci ?? ''), r3.t);
  jetonRefuse = false;
  relaisMuet = true;
  const r4 = await direction({ action: 'solde' });
  dit('le relais muet : pas de solde, le souci le dit en clair', r4.o?.soldeXof === null && /relais MTN ne répond pas/.test(r4.o?.souci ?? ''), r4.t);
  relaisMuet = false;
}

/* L'essai sans argent */
{
  remiseAZero();
  const r = await direction({ action: 'essai', numero: '01 97 00 00 01' });
  dit('l essai : le jeton recu, le solde lu, le numero actif et son nom chez MTN',
    r.status === 200 && r.o?.jeton?.ok === true && r.o?.solde?.xof === 412500 && r.o?.verifie?.actif === true && r.o?.verifie?.nom === 'AWA KOSSOU' && r.o?.verifie?.dit === '01 97 00 00 01' && r.o?.verifie?.mtn === true, r.t);
  const r2 = await direction({ action: 'essai', numero: '01 97 00 00 05' });
  dit('un numero inactif se dit inactif, sans nom', r2.o?.verifie?.actif === false && r2.o?.verifie?.nom === null, r2.t);
  const avant = versMtn().length;
  const r3 = await direction({ action: 'essai', numero: '97000001' });
  dit('un numero illisible ne se demande pas a MTN, et se dit', r3.o?.numeroIllisible === true && r3.o?.verifie === null && !versMtn().slice(avant).some((j) => /accountholder/.test(j.chemin)), r3.t);
  dit('aucun argent ne bouge : ni demande de paiement, ni envoi', !journal.some((j) => /requesttopay|transfer|deposit|refund/i.test(j.chemin)), JSON.stringify([...new Set(journal.map((j) => j.chemin))]));
  dit('l essai ne montre aucune cle ni jeton', sansSecret(r.t) && sansSecret(r2.t) && sansSecret(r3.t), r.t);
}

/* Le Trône, lu dans ses fichiers */
{
  const bandeau = lis(BANDEAU);
  const client = lis(CLIENT);
  dit('le bandeau est en tete des Encaissements (Vente & Caisse)', /<CompteDeCollecteMtn \/>/.test(lis(ENCAISSEMENTS)) && /import \{ CompteDeCollecteMtn \} from '\.\/CompteDeCollecteMtn';/.test(lis(ENCAISSEMENTS)), '');
  dit('la direction seule le voit (souverain, gerant)', /const direction = moi\?\.role === 'souverain' \|\| moi\?\.role === 'gerant';/.test(bandeau) && /  if \(!direction\) return null;\n/.test(bandeau), '');
  dit('le solde se relit chaque minute ecran ouvert, au retour sur l ecran, et d un geste', /60_000\);/.test(client) && /visibilitychange/.test(client) && /Relire maintenant/.test(bandeau), '');
  dit('sans numero, le bandeau dit « numero a poser » ; il dit l heure de la derniere lecture et le souci en clair',
    /lecture\?\.numero \?\? 'numéro à poser'/.test(bandeau) && /lu à \{/.test(bandeau) && /role="alert"/.test(bandeau), '');
  /* Le dépôt est public : aucun numéro mobile (01 et huit chiffres, espacés
     ou non) ni identifiant de compte MTN (« ….sp ») dans ce qui part en
     ligne. Le banc, lui, n'écrit que des numéros inventés. */
  const UN_NUMERO = /\b01(?:[\s.]?\d{2}){4}\b/;
  const UN_COMPTE_MTN = /\b[A-Za-z][\w-]*\.sp\b/;
  const fichiers = [FONCTION, PUR, BANDEAU, CLIENT, 'scripts/collecte-copie-serveur.mjs'];
  const fautifs = fichiers.filter((f) => UN_NUMERO.test(lis(f)) || UN_COMPTE_MTN.test(lis(f)));
  dit('aucun numero ni compte MTN dans le depot public (fonction, regles, Trone)', fautifs.length === 0, fautifs.join(', '));
  dit('les textes du Trone sans tiret long', ![bandeau, client].some((t) => t.split('\n').filter((l) => !/^\s*(\/\*|\*|\/\/)/.test(l)).some((l) => l.includes('—'))), '');
}

/* Tout le journal : jamais MTN en direct */
dit('aucun appel ne sort du monde simule', !journal.some((j) => ![PROJET, RELAIS].includes(j.origine)), JSON.stringify([...new Set(journal.map((j) => j.origine))]));

console.log(echecs === 0 ? `\nRegler par MTN tient : ${oks} controles.` : `\n${echecs} ECHEC(S) sur ${oks + echecs}`);
process.exit(echecs === 0 ? 0 : 1);
