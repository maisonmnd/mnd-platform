import { transform } from 'esbuild';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/* LES ESSAIS MTN MOMO, EPROUVES — 28 octobre 2026, revu le 29.
   `node scripts/verifie-mtn-momo-essais.mjs` : le VRAI fichier a coller
   (supabase/functions/mtn-momo-essais/index.ts) tourne ici contre un faux
   Sandbox MTN et une fausse base. On y verifie : la version au GET sans
   aucune cle montree ; le lancement refuse sans la cle du projet ; le
   parcours complet ; le bac a sable seul ; l'euro ; le champ du rappel VIDE
   (conseil de MTN du 29 octobre : sans le champ, puis sans corps, puis le
   champ vide, la premiere forme acceptee servant a la suite) et aucune
   adresse de rappel envoyee ; le repli sur l'hote du projet si MTN les
   refuse toutes ; le rappel garde ;
   aucun secret au rapport ; une cle absente dite, pas cassee.
   Trois Sandbox simules : l'IDEAL ; celui des ESSAIS REELS du 28 et du 29
   octobre (toute forme sans valeur refusee a la creation, tout hote declare
   fait tomber les operations en INVALID_CALLBACK_URL_HOST, virement refuse,
   solde Disbursement indisponible puis refuse) ; et un Sandbox qui
   ACCEPTERAIT la creation sans le champ.
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
  ['les cles montrees au GET', 'cles: { collection: !!k.collection, disbursement: !!k.disbursement }', 'cles: { collection: k.collection, disbursement: k.disbursement }'],
  ['le jeton au rapport', "jeton ? `jeton reçu, valable ${r.corps?.expires_in ?? '?'} s`", 'jeton ? jeton'],
  ['le champ du rappel rempli en sandbox', "{ nom: 'sans le champ du rappel', corps: {} },", "{ nom: 'sans le champ du rappel', corps: { providerCallbackHost: 'maisonmnd.com' } },"],
  ['pas de repli si MTN refuse toutes les formes sans valeur', "  auth = auth ?? await entree({ nom: `rappels vers ${o.hoteRappel}`, corps: { providerCallbackHost: o.hoteRappel } }, false, `Utilisateur de repli, rappels vers ${o.hoteRappel}`);", '  auth = auth ?? null;'],
  ['on s arrete a la premiere forme refusee', '    if (auth) break;', '    break;'],
  ['on continue apres une forme acceptee', '    if (auth) break;\n', ''],
  ['une adresse de rappel envoyee', "{ ...auth, 'X-Reference-Id': ref }", "{ ...auth, 'X-Reference-Id': ref, 'X-Callback-Url': 'https://' + o.hoteRappel + '/rappel' }"],
  ['pas de depot apres un virement refuse', '    if (!reussie(v.statut)) await suis(', '    if (false) await suis('],
  ['le solde indisponible non redemande', '    if (s.http === 503) {', '    if (false) {'],
  ['pas de solde par sa devise', "  if (!await solde('Lire le solde du compte', `/${nom}/v1_0/account/balance`)) await solde(", "  await solde('Lire le solde du compte', `/${nom}/v1_0/account/balance`); if (false) await solde("],
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

/** Le Sandbox simule : `ideal`, `reel` (celui des essais des 28 et 29 octobre), ou `sans-champ-accepte`. */
let sandbox = 'ideal';
let journal = [];
const utilisateurs = new Map();   // id -> { cle, hote, apiKey }
const jetons = new Map();          // jeton -> { produit, hote }
const operations = new Map();      // ref -> { lu, issue }
const base = new Map();            // key -> data
let secretsVus = [];
let soldesDemandes = 0;

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
    if (!UUID.test(h['x-reference-id'] ?? '')) return rep(400, { message: 'mal forme' });
    const hote = corps && typeof corps.providerCallbackHost === 'string' ? corps.providerCallbackHost : '';
    /* Le Sandbox reel refuse toute forme sans valeur (le champ vide : 400, vu le 29 octobre) ; l'autre accepte la creation sans le champ. */
    if (hote === '' && (sandbox === 'reel' || (sandbox === 'sans-champ-accepte' && !(corps && !('providerCallbackHost' in corps))))) return rep(400);
    utilisateurs.set(h['x-reference-id'], { cle, hote });
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
    const jeton = `JETON-SECRET-${randomUUID().slice(0, 8)}`; secretsVus.push(jeton); jetons.set(jeton, { produit: m[1], hote: u.hote });
    return rep(200, { access_token: jeton, token_type: 'access_token', expires_in: 3600 });
  }
  const produit = p.split('/')[1];
  const jeton = jetons.get((h.authorization ?? '').replace(/^Bearer /, ''));
  if (jeton?.produit !== produit) return rep(401, { message: 'jeton refuse' });
  if (h['x-target-environment'] !== 'sandbox') return rep(400, { code: 'TARGET_ENVIRONMENT_INVALID' });
  if ((m = p.match(/^\/(collection|disbursement)\/v1_0\/accountholder\/msisdn\/(\d+)\/active$/))) return rep(200, { result: true });
  if (p.match(/^\/(collection|disbursement)\/v1_0\/account\/balance$/)) {
    if (sandbox === 'ideal' || produit === 'collection') return rep(200, { availableBalance: '1000', currency: 'EUR' });
    return ++soldesDemandes === 1 ? rep(503, { code: 'SERVICE_UNAVAILABLE' }) : rep(500, { code: 'NOT_ALLOWED' });
  }
  if (p.match(/^\/(collection|disbursement)\/v1_0\/account\/balance\/EUR$/)) return rep(200, { availableBalance: '1000', currency: 'EUR' });
  if (['/collection/v1_0/requesttopay', '/disbursement/v1_0/transfer', '/disbursement/v1_0/deposit'].includes(p) && methode === 'POST') {
    const ref = h['x-reference-id'];
    if (!UUID.test(ref ?? '')) return rep(400, { code: 'REFERENCE_ID_INVALID' });
    if (corps?.currency !== 'EUR') return rep(500, { code: 'NOT_ALLOWED_TARGET_ENVIRONMENT' });
    const rappel = h['x-callback-url'];
    if (rappel && new URL(rappel).host !== jeton.hote) return rep(500, { code: 'INVALID_CALLBACK_URL_HOST' });
    const numero = (corps.payer ?? corps.payee)?.partyId;
    let issue = numero === REFUSE ? { status: 'FAILED', reason: 'APPROVAL_REJECTED' } : { status: 'SUCCESSFUL', financialTransactionId: '1234567' };
    /* Le Sandbox des essais reels : tout hote declare fait tomber ce qui devait reussir ; le vide passe ; le virement est refuse. */
    if (sandbox !== 'ideal' && jeton.hote !== '' && issue.status === 'SUCCESSFUL') issue = { status: 'FAILED', reason: 'INVALID_CALLBACK_URL_HOST' };
    if (sandbox !== 'ideal' && p.endsWith('/transfer')) issue = { status: 'FAILED', reason: 'NOT_ALLOWED_TARGET_ENVIRONMENT' };
    operations.set(ref, { lu: 0, issue });
    return rep(202);
  }
  if ((m = p.match(/^\/(collection\/v1_0\/requesttopay|disbursement\/v1_0\/transfer|disbursement\/v1_0\/deposit)\/([^/]+)$/)) && methode === 'GET') {
    const op = operations.get(m[2]); if (!op) return rep(404, { code: 'RESOURCE_NOT_FOUND' });
    op.lu++;
    return op.lu === 1 ? rep(200, { status: 'PENDING' }) : rep(200, op.issue);
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
const etapeDe = (o, produit, nom) => o.etapes?.find((e) => e.produit === produit && e.etape === nom);
const ratees = (o) => JSON.stringify((o.etapes ?? []).filter((e) => !e.ok)).slice(0, 400);
const versMtn = () => journal.filter((j) => !j.url.startsWith(PROJET));

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

// 3. Le Sandbox ideal.
sandbox = 'ideal'; journal = []; secretsVus = [];
r = await lance();
t = await r.text();
o = JSON.parse(t);
dit('ideal : quinze etapes, toutes reussies', r.status === 200 && o.total === 15 && o.reussis === 15, `${r.status} ${o.reussis}/${o.total} ${ratees(o)}`);
dit('ideal : la demande va jusqu a SUCCESSFUL, malgre un premier PENDING', /statut SUCCESSFUL, transaction 1234567/.test(etapeDe(o, 'collection', 'Demande de paiement qui réussit')?.detail ?? ''), etapeDe(o, 'collection', 'Demande de paiement qui réussit')?.detail);
dit('ideal : la demande refusee dit FAILED et son motif', /statut FAILED, motif APPROVAL_REJECTED/.test(etapeDe(o, 'collection', 'Demande de paiement refusée par la cliente')?.detail ?? '') && etapeDe(o, 'collection', 'Demande de paiement refusée par la cliente')?.ok === true,
  etapeDe(o, 'collection', 'Demande de paiement refusée par la cliente')?.detail);
const creations = versMtn().filter((j) => j.url.endsWith('/v1_0/apiuser'));
dit('la creation part sans le champ du rappel, une seule fois par produit', creations.length === 2 && creations.every((j) => j.corps && !('providerCallbackHost' in j.corps)), JSON.stringify(creations.map((j) => j.corps)));
dit('la relecture dit le champ du rappel vide', /environnement sandbox, champ du rappel vide/.test(etapeDe(o, 'collection', 'Relire l’utilisateur')?.detail ?? ''), etapeDe(o, 'collection', 'Relire l’utilisateur')?.detail);
dit('aucune demande ne porte d adresse de rappel', !versMtn().some((j) => j.h['x-callback-url']), versMtn().find((j) => j.h['x-callback-url'])?.url);
dit('tout appel vers MTN va au bac a sable, et a lui seul', versMtn().length > 0 && versMtn().every((j) => j.url.startsWith('https://sandbox.momodeveloper.mtn.com/')), versMtn().map((j) => j.url).find((u) => !u.startsWith('https://sandbox.')));
dit('chaque appel d operation porte l environnement sandbox', versMtn().filter((j) => j.h.authorization?.startsWith('Bearer ')).every((j) => j.h['x-target-environment'] === 'sandbox'));
dit('les montants sont en euros d essai', versMtn().filter((j) => j.corps?.amount).every((j) => j.corps.currency === 'EUR' && j.corps.amount === '100'));
dit('aucun secret au rapport : ni cles d abonnement, ni cle d utilisateur, ni jeton', ![KC, KD, SERVICE, ...secretsVus].some((s) => t.includes(s)), [KC, KD, SERVICE, ...secretsVus].find((s) => t.includes(s)));
dit('l utilisateur n y parait qu en huit signes', /utilisateur [0-9a-f]{8}…/.test(etapeDe(o, 'collection', 'Créer l’utilisateur d’API, sans le champ du rappel')?.detail ?? '') && !UUID.test(etapeDe(o, 'collection', 'Créer l’utilisateur d’API, sans le champ du rappel')?.detail ?? ''));

// 4. Le rappel de MTN (pour la production) : garde sans jeton.
const refRappel = randomUUID();
r = await appelle(`?rappel=${refRappel}`, { method: 'PUT', body: JSON.stringify({ status: 'SUCCESSFUL', financialTransactionId: '1234567' }) });
dit('un rappel de MTN est recu sans jeton et garde', r.status === 200 && base.get('mtn_momo_essais_rappels')?.parRef?.[refRappel]?.status === 'SUCCESSFUL', `${r.status} ${JSON.stringify(base.get('mtn_momo_essais_rappels'))}`);
r = await appelle('?rappel=pas-une-reference', { method: 'POST', body: '{}' });
dit('un rappel sans reference lisible est refuse (400)', r.status === 400, String(r.status));

// 5. Le Sandbox des essais reels : toutes les formes sans valeur refusees, repli, et chaque refus dit.
sandbox = 'reel'; journal = []; secretsVus = []; soldesDemandes = 0;
r = await lance();
t = await r.text();
o = JSON.parse(t);
dit('reel : dix-sept etapes, sept reussies, chaque refus dit', r.status === 200 && o.total === 17 && o.reussis === 7, `${o.reussis}/${o.total} ${ratees(o)}`);
const essais = versMtn().filter((j) => j.url.endsWith('/v1_0/apiuser') && j.h['ocp-apim-subscription-key'] === KC);
dit('reel : trois formes sans valeur essayees dans l ordre (sans le champ, sans corps, champ vide), puis le repli',
  essais.length === 4 && essais[0].corps && !('providerCallbackHost' in essais[0].corps) && essais[1].corps === undefined && essais[1].h['content-type'] === undefined
  && essais[2].corps?.providerCallbackHost === '' && essais[3].corps?.providerCallbackHost === 'projet-essai.supabase.co', JSON.stringify(essais.map((j) => j.corps ?? null)));
dit('reel : chaque forme refusee est au rapport, puis l utilisateur de repli', ['sans le champ du rappel', 'sans corps', 'champ du rappel vide'].every((n) => etapeDe(o, 'collection', `Créer l’utilisateur d’API, ${n}`)?.ok === false)
  && etapeDe(o, 'collection', 'Utilisateur de repli, rappels vers projet-essai.supabase.co')?.ok === true, ratees(o));
dit('reel : la demande part quand meme et son echec est dit', /INVALID_CALLBACK_URL_HOST/.test(etapeDe(o, 'collection', 'Demande de paiement qui réussit')?.detail ?? ''), ratees(o));
dit('reel : le solde indisponible est redemande, puis lu par sa devise', soldesDemandes === 2 && etapeDe(o, 'disbursement', 'Lire le solde du compte')?.ok === false
  && /solde 1000 EUR/.test(etapeDe(o, 'disbursement', 'Lire le solde en euros')?.detail ?? ''), `${soldesDemandes} ${ratees(o)}`);
dit('reel : aucun secret au rapport', ![KC, KD, SERVICE, ...secretsVus].some((s) => t.includes(s)));

// 6. Un Sandbox qui accepterait la creation sans le champ : la demande et le depot passent.
sandbox = 'sans-champ-accepte'; journal = []; secretsVus = []; soldesDemandes = 0;
r = await lance();
o = await r.json();
dit('sans le champ : dix-sept etapes, quinze reussies', o.total === 17 && o.reussis === 15, `${o.reussis}/${o.total} ${ratees(o)}`);
dit('sans le champ : la premiere forme suffit, les autres ne sont pas essayees', versMtn().filter((j) => j.url.endsWith('/v1_0/apiuser')).length === 2, String(versMtn().filter((j) => j.url.endsWith('/v1_0/apiuser')).length));
dit('sans le champ : la demande de paiement reussit, le virement refuse est dit, le depot reussit',
  /statut SUCCESSFUL/.test(etapeDe(o, 'collection', 'Demande de paiement qui réussit')?.detail ?? '')
  && /NOT_ALLOWED_TARGET_ENVIRONMENT/.test(etapeDe(o, 'disbursement', 'Virement vers un compte MoMo')?.detail ?? '')
  && /statut SUCCESSFUL/.test(etapeDe(o, 'disbursement', 'Dépôt vers un compte MoMo')?.detail ?? ''), ratees(o));

// 7. Une cle absente se dit, rien ne casse.
sandbox = 'ideal';
const garde = ENV.MOMO_SANDBOX_DISBURSEMENT_KEY;
ENV.MOMO_SANDBOX_DISBURSEMENT_KEY = '';
r = await lance();
o = await r.json();
ENV.MOMO_SANDBOX_DISBURSEMENT_KEY = garde;
dit('sans la cle Disbursement : Collection passe, Disbursement dit « cle absente »', r.status === 200 && o.etapes.filter((e) => e.produit === 'collection').every((e) => e.ok)
  && o.etapes.some((e) => e.produit === 'disbursement' && /clé absente/.test(e.detail)), JSON.stringify(o.etapes?.filter((e) => e.produit === 'disbursement')));

console.log(echecs === 0 ? '\nLes essais MTN tiennent.' : `\n${echecs} controle(s) en echec.`);
process.exit(echecs === 0 ? 0 : 1);
