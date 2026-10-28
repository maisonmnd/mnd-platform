import { transform } from 'esbuild';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/* LES ESSAIS MTN MOMO, EPROUVES — 28 octobre 2026.
   `node scripts/verifie-mtn-momo-essais.mjs` : le VRAI fichier a coller
   (supabase/functions/mtn-momo-essais/index.ts) tourne ici contre un faux
   Sandbox MTN et une fausse base. On y verifie : la version au GET sans
   aucune cle montree ; le lancement refuse sans la cle du projet ; le
   parcours complet (utilisateur, cle, jeton, compte actif, demande reussie,
   demande refusee, virement, soldes) ; le bac a sable seul ; l'euro ; le
   rappel garde ; aucun secret au rapport ; une cle absente dite, pas cassee.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. */

const racine = path.resolve(import.meta.dirname, '..');
const FICHIER = 'supabase/functions/mtn-momo-essais/index.ts';
const prouve = process.argv.includes('--prouve');

const PANNES = [
  ['le lancement sans la cle du projet', "    if (!ANON || jeton !== ANON) return json({ erreur: 'clé du projet attendue' }, 401);\n", ''],
  ['la production au lieu du bac a sable', "const BASE = 'https://sandbox.momodeveloper.mtn.com';", "const BASE = 'https://proxy.momoapi.mtn.com';"],
  ['la cle de l utilisateur au rapport', "apiKey ? 'clé reçue (gardée sur le serveur)'", 'apiKey ? apiKey'],
  ['le mauvais environnement cible', "const ENV_CIBLE = 'sandbox';", "const ENV_CIBLE = 'mtnbenin';"],
  ['le statut lu une seule fois', '      if (!EN_COURS.has(statut)) break;', '      break;'],
  ['le refus compte comme un echec', "(s) => s === 'REJECTED' || s === 'FAILED');", "(s) => s === 'SUCCESSFUL');"],
  ['un rappel sans reference lisible', '    if (!REF.test(ref) || (req.method', '    if ((req.method'],
  ['le franc dans le bac a sable', "const DEVISE = 'EUR';", "const DEVISE = 'XOF';"],
  ['la demande sans adresse de rappel', ", 'X-Callback-Url': o.adresseRappel(ref) }", ' }'],
  ['les cles montrees au GET', 'cles: { collection: !!k.collection, disbursement: !!k.disbursement }', 'cles: { collection: k.collection, disbursement: k.disbursement }'],
  ['le jeton au rapport', "jeton ? `jeton reçu, valable ${r.corps?.expires_in ?? '?'} s`", 'jeton ? jeton'],
];

const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');

if (prouve) {
  const propre = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); process.exit(1); }
  const garde = readFileSync(path.join(racine, FICHIER));
  const avant = md5(FICHIER);
  let muettes = 0;
  try {
    for (const [nom, a, b] of PANNES) {
      const brut = garde.toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (!texte.includes(a)) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, FICHIER), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, FICHIER), garde);
      }
    }
  } finally {
    writeFileSync(path.join(racine, FICHIER), garde);
  }
  const intact = md5(FICHIER) === avant;
  console.log(intact ? 'Fichier rendu a l identique.' : 'ATTENTION : le fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intact ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intact ? 0 : 1);
}

/* ── Le monde simule ── */
const PROJET = 'https://projet-essai.supabase.co';
const ANON = 'anon-publique-essai';
const SERVICE = 'service-secrete-essai';
const KC = 'CLE-ABO-COLLECTION-SECRETE';
const KD = 'CLE-ABO-DISBURSEMENT-SECRETE';
const ENV = {
  SUPABASE_URL: PROJET, SUPABASE_ANON_KEY: ANON, SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  MOMO_SANDBOX_COLLECTION_KEY: KC, MOMO_SANDBOX_DISBURSEMENT_KEY: KD, MOMO_ESSAIS_PAUSE_MS: '0',
};
const REFUSE = '46733123451';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let journal = [];
const utilisateurs = new Map();   // id -> { cle, apiKey, hote }
const jetons = new Map();          // jeton -> produit
const operations = new Map();      // ref -> { lu, refuse, produit }
const base = new Map();            // key -> data
let secretsVus = [];

const rep = (status, corps) => new Response(corps === undefined ? '' : JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });

async function fauxFetch(entree, init = {}) {
  const url = new URL(String(entree));
  const methode = (init.method ?? 'GET').toUpperCase();
  const h = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const corps = init.body ? JSON.parse(init.body) : undefined;
  journal.push({ methode, url: url.href, h, corps });

  if (url.origin === PROJET && url.pathname === '/rest/v1/documents') {
    if (h.apikey !== SERVICE || h.authorization !== `Bearer ${SERVICE}`) return rep(401, { message: 'service attendu' });
    if (methode === 'GET') { const k = url.searchParams.get('key')?.replace(/^eq\./, ''); return rep(200, base.has(k) ? [{ data: base.get(k) }] : []); }
    if (methode === 'POST') { base.set(corps.key, corps.data); return rep(201); }
  }
  if (url.origin !== 'https://sandbox.momodeveloper.mtn.com') return rep(404, { message: 'hors du bac a sable' });

  const p = url.pathname;
  const cle = h['ocp-apim-subscription-key'];
  if (cle !== KC && cle !== KD) return rep(401, { message: 'abonnement inconnu' });
  let m;
  if (methode === 'POST' && p === '/v1_0/apiuser') {
    if (!UUID.test(h['x-reference-id'] ?? '') || !corps?.providerCallbackHost) return rep(400, { message: 'mal forme' });
    utilisateurs.set(h['x-reference-id'], { cle, hote: corps.providerCallbackHost });
    return rep(201);
  }
  if ((m = p.match(/^\/v1_0\/apiuser\/([^/]+)$/)) && methode === 'GET') {
    const u = utilisateurs.get(m[1]); return u ? rep(200, { providerCallbackHost: u.hote, targetEnvironment: 'sandbox' }) : rep(404, {});
  }
  if ((m = p.match(/^\/v1_0\/apiuser\/([^/]+)\/apikey$/)) && methode === 'POST') {
    const u = utilisateurs.get(m[1]); if (!u) return rep(404, {});
    u.apiKey = `APIKEY-SECRETE-${m[1].slice(0, 6)}`; secretsVus.push(u.apiKey); return rep(201, { apiKey: u.apiKey });
  }
  if ((m = p.match(/^\/(collection|disbursement)\/token\/$/)) && methode === 'POST') {
    const [id, k] = Buffer.from((h.authorization ?? '').replace(/^Basic /, ''), 'base64').toString().split(':');
    const u = utilisateurs.get(id);
    if (!u || u.apiKey !== k || u.cle !== cle || (m[1] === 'collection' ? KC : KD) !== cle) return rep(401, { error: 'login_failed' });
    const jeton = `JETON-SECRET-${randomUUID().slice(0, 8)}`; secretsVus.push(jeton); jetons.set(jeton, m[1]);
    return rep(200, { access_token: jeton, token_type: 'access_token', expires_in: 3600 });
  }
  const produit = p.split('/')[1];
  const jeton = (h.authorization ?? '').replace(/^Bearer /, '');
  if (jetons.get(jeton) !== produit) return rep(401, { message: 'jeton refuse' });
  if (h['x-target-environment'] !== 'sandbox') return rep(400, { code: 'TARGET_ENVIRONMENT_INVALID' });
  if ((m = p.match(/^\/(collection|disbursement)\/v1_0\/accountholder\/msisdn\/(\d+)\/active$/))) return rep(200, { result: true });
  if (p.match(/^\/(collection|disbursement)\/v1_0\/account\/balance$/)) return rep(200, { availableBalance: '1000', currency: 'EUR' });
  if ((p === '/collection/v1_0/requesttopay' || p === '/disbursement/v1_0/transfer') && methode === 'POST') {
    const ref = h['x-reference-id'];
    if (!UUID.test(ref ?? '')) return rep(400, { code: 'REFERENCE_ID_INVALID' });
    if (corps?.currency !== 'EUR') return rep(500, { code: 'NOT_ALLOWED_TARGET_ENVIRONMENT' });
    if (!(h['x-callback-url'] ?? '').startsWith(`${PROJET}/functions/v1/mtn-momo-essais?rappel=${ref}`)) return rep(400, { code: 'CALLBACK_ATTENDU' });
    const numero = (corps.payer ?? corps.payee)?.partyId;
    operations.set(ref, { lu: 0, refuse: numero === REFUSE, produit });
    return rep(202);
  }
  if ((m = p.match(/^\/(collection\/v1_0\/requesttopay|disbursement\/v1_0\/transfer)\/([^/]+)$/)) && methode === 'GET') {
    const op = operations.get(m[2]); if (!op) return rep(404, { code: 'RESOURCE_NOT_FOUND' });
    op.lu++;
    if (op.lu === 1) return rep(200, { status: 'PENDING' });
    return rep(200, op.refuse ? { status: 'REJECTED', reason: 'APPROVAL_REJECTED' } : { status: 'SUCCESSFUL', financialTransactionId: '1234567' });
  }
  return rep(404, { message: `inattendu ${methode} ${p}` });
}

/* ── Le vrai fichier, transpile, servi par un faux Deno ── */
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-mtn-momo-essais');
mkdirSync(dossier, { recursive: true });
let gestionnaire = null;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (f) => { gestionnaire = f; } };
globalThis.fetch = fauxFetch;
try {
  const { code } = await transform(readFileSync(path.join(racine, FICHIER), 'utf8'), { loader: 'ts', format: 'esm' });
  const sortie = path.join(dossier, 'fonction.mjs');
  writeFileSync(sortie, code);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}

let echecs = 0;
const dit = (nom, ok, vu = '') => { console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${vu}`}`); if (!ok) echecs++; };
const appelle = (chemin, init = {}) => gestionnaire(new Request(`${PROJET}/functions/v1/mtn-momo-essais${chemin}`, init));
const lance = (cle = ANON) => appelle('?lancer=1', { method: 'POST', headers: cle ? { Authorization: `Bearer ${cle}` } : {} });

dit('le fichier se charge et sert', typeof gestionnaire === 'function');

// 1. Le GET : la version, des oui et des non, aucune cle.
let r = await appelle('');
let t = await r.text();
let o = JSON.parse(t);
dit('le GET dit sa version et le bac a sable', r.status === 200 && /^\d{4}-\d{2}-\d{2}-[a-z]$/.test(o.version) && o.sandbox === true, t.slice(0, 120));
dit('le GET dit quelles cles sont posees, par oui ou non', o.cles?.collection === true && o.cles?.disbursement === true, JSON.stringify(o.cles));
dit('le GET ne montre aucune cle', ![KC, KD, SERVICE, ANON].some((s) => t.includes(s)), t.slice(0, 200));

// 2. Le lancement demande la cle du projet.
journal = [];
r = await lance('');
dit('sans cle du projet, rien ne se lance (401) et MTN n est pas appele', r.status === 401 && journal.length === 0, `${r.status}, ${journal.length} appels`);
r = await lance('une-autre-cle');
dit('une autre cle est refusee aussi', r.status === 401, String(r.status));

// 3. Le parcours complet.
journal = []; secretsVus = [];
r = await lance();
t = await r.text();
o = JSON.parse(t);
const etape = (produit, nom) => o.etapes?.find((e) => e.produit === produit && e.etape === nom);
dit('le parcours tient : toutes les etapes reussies', r.status === 200 && o.total === 15 && o.reussis === 15,
  `${r.status} ${o.reussis}/${o.total} ${JSON.stringify((o.etapes ?? []).filter((e) => !e.ok)).slice(0, 300)}`);
dit('la demande qui reussit va jusqu a SUCCESSFUL, malgre un premier PENDING', /statut SUCCESSFUL, transaction 1234567/.test(etape('collection', 'Demande de paiement qui réussit')?.detail ?? ''), etape('collection', 'Demande de paiement qui réussit')?.detail);
dit('la demande refusee dit REJECTED et son motif', /statut REJECTED, motif APPROVAL_REJECTED/.test(etape('collection', 'Demande de paiement refusée par la cliente')?.detail ?? '') && etape('collection', 'Demande de paiement refusée par la cliente')?.ok === true,
  etape('collection', 'Demande de paiement refusée par la cliente')?.detail);
dit('le virement va jusqu a SUCCESSFUL', /statut SUCCESSFUL/.test(etape('disbursement', 'Virement vers un compte MoMo')?.detail ?? ''), etape('disbursement', 'Virement vers un compte MoMo')?.detail);
dit('les soldes sont lus des deux cotes', /solde 1000 EUR/.test(etape('collection', 'Lire le solde du compte')?.detail ?? '') && /solde 1000 EUR/.test(etape('disbursement', 'Lire le solde du compte')?.detail ?? ''));
const versMtn = journal.filter((j) => !j.url.startsWith(PROJET));
dit('tout appel vers MTN va au bac a sable, et a lui seul', versMtn.length > 0 && versMtn.every((j) => j.url.startsWith('https://sandbox.momodeveloper.mtn.com/')), versMtn.map((j) => j.url).find((u) => !u.startsWith('https://sandbox.')));
dit('chaque appel d operation porte l environnement sandbox', versMtn.filter((j) => j.h.authorization?.startsWith('Bearer ')).every((j) => j.h['x-target-environment'] === 'sandbox'));
dit('les montants sont en euros d essai', versMtn.filter((j) => j.corps?.amount).every((j) => j.corps.currency === 'EUR' && j.corps.amount === '100'));
dit('l hote de rappel est celui du projet', journal.find((j) => j.url.endsWith('/v1_0/apiuser'))?.corps?.providerCallbackHost === 'projet-essai.supabase.co');
const tout = t;
dit('aucun secret au rapport : ni cles d abonnement, ni cle d utilisateur, ni jeton', ![KC, KD, SERVICE, ...secretsVus].some((s) => tout.includes(s)),
  [KC, KD, SERVICE, ...secretsVus].find((s) => tout.includes(s)));
dit('l utilisateur n y parait qu en huit signes', /utilisateur [0-9a-f]{8}…/.test(etape('collection', 'Créer l’utilisateur d’API')?.detail ?? '') && !UUID.test(etape('collection', 'Créer l’utilisateur d’API')?.detail ?? ''));
dit('trois rappels attendus, aucun recu encore', o.rappels?.length === 3 && o.rappels.every((x) => x.recu === false), JSON.stringify(o.rappels));

// 4. Le rappel de MTN : garde, puis relu au rapport suivant.
const refs = journal.filter((j) => j.h['x-callback-url']).map((j) => j.h['x-reference-id']);
r = await appelle(`?rappel=${refs[0]}`, { method: 'PUT', body: JSON.stringify({ status: 'SUCCESSFUL', financialTransactionId: '1234567' }) });
dit('un rappel de MTN est recu sans jeton et garde', r.status === 200 && base.get('mtn_momo_essais_rappels')?.parRef?.[refs[0]]?.status === 'SUCCESSFUL', `${r.status} ${JSON.stringify(base.get('mtn_momo_essais_rappels'))}`);
r = await appelle('?rappel=pas-une-reference', { method: 'POST', body: '{}' });
dit('un rappel sans reference lisible est refuse (400)', r.status === 400, String(r.status));

// 5. Une cle absente se dit, rien ne casse.
const garde = ENV.MOMO_SANDBOX_DISBURSEMENT_KEY;
ENV.MOMO_SANDBOX_DISBURSEMENT_KEY = '';
r = await lance();
o = await r.json();
ENV.MOMO_SANDBOX_DISBURSEMENT_KEY = garde;
dit('sans la cle Disbursement : Collection passe, Disbursement dit « cle absente »', r.status === 200 && o.etapes.filter((e) => e.produit === 'collection').every((e) => e.ok)
  && o.etapes.some((e) => e.produit === 'disbursement' && /clé absente/.test(e.detail)), JSON.stringify(o.etapes?.filter((e) => e.produit === 'disbursement')));

console.log(echecs === 0 ? '\nLes essais MTN tiennent.' : `\n${echecs} controle(s) en echec.`);
process.exit(echecs === 0 ? 0 : 1);
