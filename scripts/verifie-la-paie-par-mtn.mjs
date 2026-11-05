import { build, transform } from 'esbuild';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

/* LA PAIE PAR MTN, EPROUVEE - 5 novembre 2026, lot 2 de la paie
   (maquette 6bNGeh7nyABotDAXppWRoX). Deux bancs en un :
   - les REGLES DU TRONE (scripts/verifie-la-paie-par-mtn.harnais.ts), dans
     un processus fils ;
   - le VRAI fichier du serveur (supabase/functions/paie-mtn/index.ts),
     transpile et servi ici par un faux Deno, contre un faux relais MTN et
     une fausse base. Aucun appel ne sort : fetch est remplace.
   On y verifie : la direction seule ; le passage par la cle de service ;
   le relais et sa cle a chaque appel ; aucune cle dans une reponse ; la
   reference ecrite avant l'envoi ; un bulletin, un seul envoi (meme quand
   deux passages courent ensemble, meme quand MTN ne repond pas) ; le solde
   d'abord ; le refus qui ne repart jamais seul ; le renvoi apres un toucher ;
   l'annulation ; le test de 100 F (500 F au plus), parti aussitot.
   `--prouve` : chaque faute est remise une a une dans le vrai fichier (copie
   gardee, restauration dans un finally, empreintes comparees), et le banc
   doit crier a chacune. Personnes, numeros et montants inventes. */

const racine = path.resolve(import.meta.dirname, '..');
const prouve = process.argv.includes('--prouve');

const FONCTION = 'supabase/functions/paie-mtn/index.ts';
const PUR = 'src/shared/paie-par-mtn-pur.ts';
const P5 = 'src/apps/trone/routes/equipe/PaieDu5.tsx';
const BLOC = 'src/apps/trone/routes/equipe/PaieParMtn.tsx';
const SQL = 'supabase/migrations/0163_la_paie_par_mtn.sql';
const PANNES = [
  /* Le serveur */
  ['n importe qui confie un envoi', FONCTION, "  if (!moi || !DIRECTION.has(String(moi.role))) return null;", '  if (!moi) return null;'],
  ['le passage sans la cle de service', FONCTION, '  return !!jwt && CLES_DE_SERVICE().includes(jwt);', '  return true;'],
  ['MTN appele sans le relais', FONCTION, "    const r = await fetch(`${k.relais}${chemin}`, {", "    const r = await fetch(`https://proxy.momoapi.mtn.com${chemin}`, {"],
  ['la cle du relais oubliee', FONCTION, "      headers: { 'X-Relais-Cle': k.relaisCle, 'Ocp-Apim-Subscription-Key': k.abonnement, ...(init.headers ?? {}) },", "      headers: { 'Ocp-Apim-Subscription-Key': k.abonnement, ...(init.headers ?? {}) },"],
  ['une cle montree au GET', FONCTION, "    cles: { utilisateur: !!k.utilisateur, cle: !!k.cle, abonnement: !!k.abonnement },", '    cles: { utilisateur: k.utilisateur, cle: k.cle, abonnement: k.abonnement },'],
  ['deux passages envoient deux fois', FONCTION, "        const pris = await ecris(e.reference, { etat: 'envoi', tentatives: (e.tentatives ?? 0) + 1, envoye_le: new Date().toISOString(), note: null }, 'programme');", "        const pris = await ecris(e.reference, { etat: 'envoi', tentatives: (e.tentatives ?? 0) + 1, envoye_le: new Date().toISOString(), note: null });"],
  ['un envoi part avant son heure', FONCTION, "  const dus = lignes.filter((e) => e.etat === 'programme' && Date.parse(e.part_a) <= maintenant);", "  const dus = lignes.filter((e) => e.etat === 'programme');"],
  ['le solde n arrete plus rien', FONCTION, '    if (bilan.solde == null || bilan.solde < total) {', '    if (false) {'],
  ['un silence de MTN devient un renvoi', FONCTION, "  if (http === 0 || http >= 500) return { etat: 'sans-reponse' };", "  if (http === 0 || http >= 500) return { etat: 'programme' };"],
  ['un envoi accepte se renvoie quand MTN l oublie', FONCTION, "    if (etatAvant === 'envoye') return { etat: 'envoye' };", ''],
  ['les renvois sans fin', FONCTION, '    if (tentatives < MAX_TENTATIVES) return { etat: etatAvant, renvoie: true };', '    return { etat: etatAvant, renvoie: true };'],
  ['un renvoi sans refus', FONCTION, "    if (avant.etat !== 'refuse') return json({ erreur: 'seul un envoi refusé se renvoie' }, 409);", ''],
  ['le test au-dela de 500 F', FONCTION, "  const max = genre === 'essai' ? MAX_ESSAI : MAX_PAR_ENVOI;", '  const max = MAX_PAR_ENVOI;'],
  ['la paie part aussitot comme le test', FONCTION, "    if (genre === 'essai' && r.inscrits.length) sortie.passage = await passage(r.inscrits);", '    if (r.inscrits.length) sortie.passage = await passage(r.inscrits);'],
  ['une annulation touche un envoi parti', FONCTION, '    const r = await base(`paie_envois_mtn?reference=in.${enListe(refs)}&etat=eq.programme`, {', '    const r = await base(`paie_envois_mtn?reference=in.${enListe(refs)}`, {'],
  ['le franc oublie', FONCTION, "const DEVISE = 'XOF';", "const DEVISE = 'EUR';"],
  ['un numero illisible entre au registre', FONCTION, "  if (!RE_MSISDN.test(msisdn)) return 'numéro MTN illisible';", ''],
  ['la transaction MTN perdue', FONCTION, "...(issue.transaction ? { transaction_mtn: issue.transaction } : {})", '...{}'],
  /* Les regles du Trone */
  ['un nom different passe sans mot', PUR, "    if (lu && nomConcorde(it.nom, lu.nom) === 'differe') {", '    if (false) {'],
  ['un vu pour un autre numero libere', PUR, '      if (!vu || vu.msisdn !== it.msisdn || vu.nomMtn !== lu.nom)', '      if (!vu)'],
  ['un numero inactif part', PUR, "    if (lu?.actif === false) { attendent.push({ ...it, pourquoi: 'inactif', nomMtn: lu.nom }); continue; }\n", ''],
  ['un envoi vivant n empeche plus un second', PUR, "    if (envoiActif(o.envois, o.runId, it.employeeId)) { attendent.push({ ...it, pourquoi: 'deja' }); continue; }\n", ''],
  ['un refus retient la ligne', PUR, "e.etat !== 'refuse' && e.etat !== 'annule');", "e.etat !== 'annule');"],
  ['un seul mot commun suffit', PUR, '  if (communs >= 1 && communs === fiche.length) return \'concorde\';', "  if (communs >= 1) return 'concorde';"],
  ['le passage suivant le jour meme apres 18 h', PUR, '  if (depart <= maintenantMs) depart += JOUR_MS;', ''],
  ['la paie payee au jour UTC', PUR, "    const jour = aCotonou(Date.parse(e.repondu_le ?? e.envoye_le ?? e.programme_le)).slice(0, 10);", "    const jour = new Date(Date.parse(e.repondu_le ?? e.envoye_le ?? e.programme_le)).toISOString().slice(0, 10);"],
  ['un prestataire recoit le test', PUR, "    if (f.contractType === 'prestataire' || f.archiveeLe) continue;", '    if (f.archiveeLe) continue;'],
  ['le test a 1 000 F', PUR, 'export const MONTANT_ESSAI_MAX = 500;', 'export const MONTANT_ESSAI_MAX = 1000;'],
  ['la depense avant la fin du test', PUR, '  if (!o.bilan.fini || o.bilan.recuXof <= 0) return null;', '  if (o.bilan.recuXof <= 0) return null;'],
  /* Les ecrans et la base */
  ['la validation ne programme plus', P5, '    const res = await programmeLeRun({', '    const res = await Promise.resolve({ tri: { attendent: [] }, inscrits: [], refuses: [], erreur: undefined }) ?? programmeLeRun({'],
  ['le portail disparait', P5, "        ) : portailMtn}\n", '        ) : null}\n'],
  ['un refus se renvoie sans toucher', BLOC, '              {e.etat === \'refuse\' && !fige && <span><Button size="sm" variant="ghost" onClick={() => void renvoyer(e)}>', '              {e.etat === \'refuse\' && !fige && <span><Button size="sm" variant="ghost" onClick={() => void renvoie(e.reference)}>'],
  ['l equipe ecrit au registre', SQL, 'revoke all on public.paie_envois_mtn from anon, authenticated;', '-- (revoke retire)'],
  ['l equipe recoit tous les droits', SQL, 'grant select on public.paie_envois_mtn to authenticated;', 'grant all on public.paie_envois_mtn to authenticated;'],
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
      try {
        const r = spawnSync(process.execPath, [import.meta.filename], { encoding: 'utf8' });
        if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom}`);
      } finally {
        writeFileSync(path.join(racine, f), garde);
      }
    }
  } finally {
    for (const [f, g] of gardes) writeFileSync(path.join(racine, f), g);
  }
  const intacts = fichiers.every((f) => md5(f) === avant.get(f));
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

let echecs = 0;
const dit = (nom, ok, vu = '') => { console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${ok ? '' : ` -> ${vu}`}`); if (!ok) echecs++; };

/* ══ 1. LES REGLES DU TRONE, dans un processus fils ══ */
{
  const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-paie-par-mtn');
  mkdirSync(dossier, { recursive: true });
  try {
    const sortie = path.join(dossier, 'harnais.mjs');
    await build({
      entryPoints: [path.join(racine, 'scripts/verifie-la-paie-par-mtn.harnais.ts')],
      bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error', loader: { '.css': 'empty' },
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    });
    const r = spawnSync(process.execPath, [sortie], { cwd: racine, encoding: 'utf8' });
    process.stdout.write(r.stdout ?? '');
    if (r.stderr) process.stdout.write(r.stderr);
    dit('les regles du Trone', r.status === 0, `statut ${r.status}`);
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
}

/* ══ 2. LE SERVEUR, contre un faux relais MTN et une fausse base ══ */
const PROJET = 'https://projet-essai.supabase.co';
const SERVICE = 'service-secrete-essai';
const RELAIS = 'https://relais-essai.example';
const RELAIS_CLE = 'CLE-DU-RELAIS-SECRETE';
const USER = '6f5ed51a-0000-4000-8000-00000000abcd';
const KEY = 'CLE-UTILISATEUR-SECRETE';
const ABO = 'CLE-ABONNEMENT-SECRETE';
const ENV = {
  SUPABASE_URL: PROJET, SUPABASE_SERVICE_ROLE_KEY: SERVICE, CLE_SERVICE: 'cle-service-du-coffre',
  MOMO_RELAIS_URL: RELAIS, MOMO_RELAIS_CLE: RELAIS_CLE, MOMO_TARGET_ENV: 'mtnbenin',
  MOMO_PROD_DISBURSEMENT_USER: USER, MOMO_PROD_DISBURSEMENT_KEY: KEY, MOMO_PROD_DISBURSEMENT_SUBSCRIPTION: ABO,
};
const SECRETS = [SERVICE, 'cle-service-du-coffre', RELAIS_CLE, KEY, ABO];
const JWT_DIRECTION = 'jwt-direction';
const JWT_EQUIPE = 'jwt-equipe';
const COMPTES = { [JWT_DIRECTION]: '11111111-1111-4111-8111-111111111111', [JWT_EQUIPE]: '22222222-2222-4222-8222-222222222222' };
const STAFF = { [COMPTES[JWT_DIRECTION]]: { role: 'souverain', name: 'Y. B.' }, [COMPTES[JWT_EQUIPE]]: { role: 'coiffeuse', name: 'A. K.' } };

const N = { bon: '2290190000001', refuse: '2290190000002', lent: '2290190000003', perdu: '2290190000004', inactif: '2290190000005', deja: '2290190000006', muet: '2290190000007', oublie: '2290190000008', jamais: '2290190000009' };
const NOMS = { [N.bon]: ['AICHA', 'KOSSOU'], [N.refuse]: ['PAULIN', 'AHO'] };

let registre = [];
let transferts = new Map();  // ref -> { msisdn, montant, posts, lu, statut }
let journal = [];
let soldeMtn = 1_000_000;
let perduUneFois = new Set();
const remiseAZero = () => { registre = []; transferts = new Map(); journal = []; soldeMtn = 1_000_000; perduUneFois = new Set(); };

const rep = (status, corps) => new Response(corps === undefined ? '' : JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
const valeurs = (v) => v.replace(/^in\.\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));
const filtreDe = (url) => {
  const f = [];
  for (const [k, v] of url.searchParams) {
    if (['select', 'order', 'limit'].includes(k)) continue;
    if (v.startsWith('eq.')) f.push((r) => String(r[k]) === v.slice(3));
    else if (v.startsWith('in.')) { const l = valeurs(v); f.push((r) => l.includes(String(r[k]))); }
  }
  return (r) => f.every((x) => x(r));
};

function base(url, methode, h, corps) {
  if (h.apikey !== SERVICE || h.authorization !== `Bearer ${SERVICE}`) return rep(401, { message: 'service attendu' });
  const table = url.pathname.replace('/rest/v1/', '');
  if (table === 'staff') {
    const uid = url.searchParams.get('user_id')?.replace(/^eq\./, '');
    return rep(200, STAFF[uid] ? [STAFF[uid]] : []);
  }
  if (table !== 'paie_envois_mtn') return rep(404, { message: 'table inconnue' });
  const garde = filtreDe(url);
  if (methode === 'GET') return rep(200, registre.filter(garde).map((r) => ({ ...r })));
  if (methode === 'POST') {
    const r = { ...corps };
    if (registre.some((x) => x.reference === r.reference)) return rep(409, { code: '23505' });
    if (!/^22901\d{8}$/.test(r.msisdn) || !(r.montant_xof >= 1 && r.montant_xof <= 2_000_000)) return rep(400, { code: '23514' });
    if (r.genre === 'essai' && r.montant_xof > 500) return rep(400, { code: '23514' });
    const vivant = (x) => x.etat !== 'refuse' && x.etat !== 'annule';
    if (r.genre === 'paie' && registre.some((x) => x.genre === 'paie' && x.run_id === r.run_id && x.employee_id === r.employee_id && vivant(x))) return rep(409, { code: '23505' });
    if (r.genre === 'essai' && registre.some((x) => x.genre === 'essai' && x.essai_id === r.essai_id && x.employee_id === r.employee_id && vivant(x))) return rep(409, { code: '23505' });
    registre.push({ tentatives: 0, programme_le: new Date().toISOString(), ...r });
    return rep(201);
  }
  if (methode === 'PATCH') {
    const touches = registre.filter(garde);
    for (const t of touches) Object.assign(t, corps);
    return rep(200, touches.map((t) => ({ ...t })));
  }
  return rep(405);
}

function mtn(url, methode, h, corps) {
  if (h['x-relais-cle'] !== RELAIS_CLE) return rep(403, { message: 'refusé' });
  if (h['ocp-apim-subscription-key'] !== ABO) return rep(401, { message: 'missing subscription key' });
  const p = url.pathname;
  if (methode === 'POST' && p === '/disbursement/token/') {
    return h.authorization === `Basic ${btoa(`${USER}:${KEY}`)}` ? rep(200, { access_token: 'JETON-MTN-SECRET', token_type: 'access_token', expires_in: 3600 }) : rep(401, { error: 'login' });
  }
  if (h.authorization !== 'Bearer JETON-MTN-SECRET') return rep(401, { message: 'jeton' });
  if (h['x-target-environment'] !== 'mtnbenin') return rep(500, { code: 'NOT_ALLOWED_TARGET_ENVIRONMENT' });
  let m;
  if (methode === 'GET' && p === '/disbursement/v1_0/account/balance') return rep(200, { availableBalance: String(soldeMtn), currency: 'XOF' });
  if (methode === 'GET' && (m = p.match(/^\/disbursement\/v1_0\/accountholder\/msisdn\/(\d+)\/active$/))) return rep(200, { result: m[1] !== N.inactif });
  if (methode === 'GET' && (m = p.match(/^\/disbursement\/v1_0\/accountholder\/msisdn\/(\d+)\/basicuserinfo$/))) {
    const n = NOMS[m[1]]; return n ? rep(200, { given_name: n[0], family_name: n[1] }) : rep(404, { code: 'NOT_FOUND' });
  }
  if (methode === 'POST' && p === '/disbursement/v1_0/transfer') {
    const ref = h['x-reference-id'];
    if (!/^[0-9a-f-]{36}$/.test(ref ?? '')) return rep(400, { code: 'REFERENCE_ID_INVALID' });
    if (corps?.currency !== 'XOF' || corps?.payee?.partyIdType !== 'MSISDN' || !/^\d+$/.test(corps?.amount ?? '')) return rep(400, { code: 'INVALID_REQUEST' });
    if (transferts.has(ref)) { transferts.get(ref).posts++; return rep(409, { code: 'RESOURCE_ALREADY_EXIST' }); }
    const msisdn = corps.payee.partyId;
    if (msisdn === N.perdu && !perduUneFois.has(ref)) { perduUneFois.add(ref); return rep(500, { code: 'INTERNAL_PROCESSING_ERROR' }); }
    if (msisdn === N.jamais) return rep(500, { code: 'INTERNAL_PROCESSING_ERROR' });
    const montant = Number(corps.amount);
    const statut = msisdn === N.refuse ? { status: 'FAILED', reason: 'PAYEE_NOT_ALLOWED_TO_RECEIVE' } : { status: 'SUCCESSFUL', financialTransactionId: String(41270000 + transferts.size) };
    if (statut.status === 'SUCCESSFUL') soldeMtn -= montant;
    transferts.set(ref, { msisdn, montant, posts: 1, lu: 0, statut, corps });
    /* MTN a pris l'envoi, mais repond 500 : le Trone doit relire, pas renvoyer. */
    if (msisdn === N.muet) return rep(500, { code: 'INTERNAL_PROCESSING_ERROR' });
    return rep(202);
  }
  if (methode === 'GET' && (m = p.match(/^\/disbursement\/v1_0\/transfer\/([^/]+)$/))) {
    const t = transferts.get(m[1]); if (!t) return rep(404, { code: 'RESOURCE_NOT_FOUND' });
    t.lu++;
    /* MTN a accepte l'envoi mais ne le montre pas encore : 404 deux fois. */
    if (t.msisdn === N.oublie && t.lu < 3) return rep(404, { code: 'RESOURCE_NOT_FOUND' });
    if (t.msisdn === N.lent && t.lu < 3) return rep(200, { status: 'PENDING' });
    return rep(200, { amount: String(t.montant), currency: 'XOF', ...t.statut });
  }
  return rep(404, { message: `inattendu ${methode} ${p}` });
}

async function fauxFetch(entree, init = {}) {
  const url = new URL(String(entree));
  const methode = (init.method ?? 'GET').toUpperCase();
  const h = Object.fromEntries(Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]));
  const corps = init.body ? JSON.parse(init.body) : undefined;
  journal.push({ methode, url: url.href, origine: url.origin, h, corps });
  if (url.origin === PROJET && url.pathname === '/auth/v1/user') {
    const jwt = (h.authorization ?? '').replace('Bearer ', '');
    return COMPTES[jwt] ? rep(200, { id: COMPTES[jwt] }) : rep(401, { message: 'jeton' });
  }
  if (url.origin === PROJET && url.pathname.startsWith('/rest/v1/')) return base(url, methode, h, corps);
  if (url.origin === RELAIS) return mtn(url, methode, h, corps);
  return rep(599, { message: `hors du monde simule : ${url.origin}` });
}

const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-paie-par-mtn-fonction');
mkdirSync(dossier, { recursive: true });
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
  const r = await gestionnaire(new Request(`${PROJET}/functions/v1/paie-mtn`, init));
  const t = await r.text();
  let o = null; try { o = JSON.parse(t); } catch { o = null; }
  return { status: r.status, o, t };
};
const poste = (jwt, corps) => appelle({ method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
const direction = (corps) => poste(JWT_DIRECTION, corps);
const cron = () => poste(SERVICE, { source: 'cron' });
const ref = () => randomUUID();
const passe = new Date(Date.now() - 60_000).toISOString();
const futur = new Date(Date.now() + 3_600_000).toISOString();
const paie = (o) => ({ reference: ref(), runId: 'run-1', periode: '2026-11', employeeId: 'e1', nom: 'Aïcha Kossou', msisdn: N.bon, montantXof: 150000, partA: passe, ...o });
const ligne = (reference) => registre.find((r) => r.reference === reference);
const sansSecret = (t) => !SECRETS.some((s) => t.includes(s)) && !t.includes('JETON-MTN-SECRET');
const postsTransfert = () => journal.filter((j) => j.methode === 'POST' && j.url.endsWith('/disbursement/v1_0/transfer'));

/* GET */
{
  remiseAZero();
  const r = await appelle({ method: 'GET' });
  dit('le GET dit sa version et que tout est pose, sans aucune valeur', r.status === 200 && r.o?.pret === true && /^\d{4}-\d{2}-\d{2}-[a-z]$/.test(r.o?.version) && sansSecret(r.t), r.t.slice(0, 200));
  const cle = ENV.MOMO_PROD_DISBURSEMENT_KEY; delete ENV.MOMO_PROD_DISBURSEMENT_KEY;
  const r2 = await appelle({ method: 'GET' });
  dit('une cle absente : pas pret, et dit laquelle manque', r2.o?.pret === false && r2.o?.cles?.cle === false && r2.o?.cles?.utilisateur === true, r2.t);
  const r3 = await direction({ action: 'programmer', envois: [paie({})] });
  dit('sans les cles, rien n entre au registre', r3.status === 503 && registre.length === 0, r3.t);
  ENV.MOMO_PROD_DISBURSEMENT_KEY = cle;
}

/* Qui appelle */
{
  remiseAZero();
  const sans = await appelle({ method: 'POST', body: JSON.stringify({ action: 'etat' }) });
  const equipe = await poste(JWT_EQUIPE, { action: 'programmer', envois: [paie({})] });
  const dir = await direction({ action: 'etat' });
  dit('sans jeton, ou par l equipe : refuse ; la direction : servie', sans.status === 403 && equipe.status === 403 && dir.status === 200 && registre.length === 0, `${sans.status} ${equipe.status} ${dir.status}`);
  const r = await poste(SERVICE, { action: 'programmer', envois: [paie({})] });
  dit('la cle de service ne fait que le passage, jamais un envoi neuf', r.status === 200 && 'passage' in (r.o ?? {}) && registre.length === 0, r.t);
  const r2 = await poste('cle-service-du-coffre', { source: 'cron' });
  dit('le passage reconnait aussi la cle du coffre (CLE_SERVICE)', r2.status === 200 && 'passage' in (r2.o ?? {}), r2.t);
}

/* Lire chez MTN */
{
  remiseAZero();
  const r = await direction({ action: 'lire', numeros: [N.bon, N.inactif, '22990000001', N.bon] });
  dit('lire : le solde, le nom MTN, le numero inactif ; un numero illisible n est pas demande',
    r.o?.soldeXof === 1_000_000 && r.o?.numeros?.[N.bon]?.nom === 'AICHA KOSSOU' && r.o?.numeros?.[N.bon]?.actif === true
    && r.o?.numeros?.[N.inactif]?.actif === false && r.o?.numeros?.[N.inactif]?.nom === null && !('22990000001' in (r.o?.numeros ?? {})), r.t);
  dit('lire ne montre aucune cle ni jeton', sansSecret(r.t), r.t);
  dit('chaque appel a MTN passe par le relais, avec sa cle et l environnement mtnbenin',
    journal.filter((j) => j.origine !== PROJET).every((j) => j.origine === RELAIS && j.h['x-relais-cle'] === RELAIS_CLE && (j.url.endsWith('/token/') || j.h['x-target-environment'] === 'mtnbenin')),
    JSON.stringify(journal.map((j) => j.origine)));
}

/* Programmer, puis le passage */
{
  remiseAZero();
  const a = paie({ partA: futur });
  const r = await direction({ action: 'programmer', envois: [a, paie({ employeeId: 'e1' }), paie({ employeeId: 'e9', msisdn: '22990000001' }), paie({ employeeId: 'e8', montantXof: 0 })] });
  dit('programmer : la reference ecrite, rien ne part ; un second envoi pour le meme bulletin, un numero illisible, un montant nul : refuses',
    r.o?.inscrits?.length === 1 && r.o?.refuses?.length === 3 && ligne(a.reference)?.etat === 'programme' && postsTransfert().length === 0, r.t);
  dit('le serveur relit lui-meme le numero et le montant, avant la base', ['numéro MTN illisible', 'montant hors bornes (1 à 2000000 F)'].every((m) => r.o?.refuses?.some((x) => x.erreur === m)), r.t);
  await cron();
  dit('avant son heure, le passage n envoie rien', postsTransfert().length === 0 && ligne(a.reference).etat === 'programme', JSON.stringify(ligne(a.reference)));
  ligne(a.reference).part_a = passe;
  await cron();
  const t = transferts.get(a.reference);
  dit('a son heure : un seul envoi, en francs, vers le numero, sous sa reference',
    postsTransfert().length === 1 && t?.corps?.currency === 'XOF' && t?.corps?.amount === '150000' && t?.corps?.payee?.partyId === N.bon && ligne(a.reference).etat === 'recu',
    JSON.stringify(ligne(a.reference)));
  dit('le recu garde la transaction MTN', /^4127\d{4}$/.test(ligne(a.reference).transaction_mtn ?? ''), JSON.stringify(ligne(a.reference)));
  await cron();
  dit('un recu ne repart jamais', postsTransfert().length === 1, String(postsTransfert().length));
}

/* Deux passages en meme temps */
{
  remiseAZero();
  const lot = [paie({ employeeId: 'e1' }), paie({ employeeId: 'e2', nom: 'Sika H.', msisdn: N.lent, montantXof: 90000 })];
  await direction({ action: 'programmer', envois: lot });
  await Promise.all([cron(), cron(), direction({ action: 'relire' })]);
  const parRef = lot.map((x) => journal.filter((j) => j.methode === 'POST' && j.url.endsWith('/transfer') && j.h['x-reference-id'] === x.reference).length);
  dit('trois passages ensemble : chaque bulletin part une fois', parRef.every((n) => n === 1), JSON.stringify(parRef));
  await cron(); await cron();
  dit('MTN lent : le Trone relit, sans renvoyer, jusqu au recu', ligne(lot[1].reference).etat === 'recu' && transferts.get(lot[1].reference).posts === 1, JSON.stringify(ligne(lot[1].reference)));
}

/* Le solde d'abord */
{
  remiseAZero();
  soldeMtn = 100_000;
  const lot = [paie({ employeeId: 'e1' }), paie({ employeeId: 'e2', msisdn: N.lent, montantXof: 90000 })];
  await direction({ action: 'programmer', envois: lot });
  const r = await cron();
  dit('le solde ne couvre pas tout : aucun envoi ne part, chacun le dit',
    postsTransfert().length === 0 && lot.every((x) => ligne(x.reference).etat === 'programme' && /il manque 140000 F/.test(ligne(x.reference).note ?? '')), r.t);
  soldeMtn = 1_000_000;
  await cron();
  dit('le compte alimente : le passage suivant envoie', postsTransfert().length === 2, String(postsTransfert().length));
}

/* Le refus, puis le renvoi */
{
  remiseAZero();
  const a = paie({ employeeId: 'e2', nom: 'Paulin Aho', msisdn: N.refuse, montantXof: 80000 });
  await direction({ action: 'programmer', envois: [a] });
  await cron();
  dit('MTN refuse : le refus et sa raison sont notes', ligne(a.reference).etat === 'refuse' && ligne(a.reference).raison === 'PAYEE_NOT_ALLOWED_TO_RECEIVE', JSON.stringify(ligne(a.reference)));
  await cron(); await cron();
  dit('un refus ne repart jamais seul', postsTransfert().length === 1, String(postsTransfert().length));
  const b = paie({ employeeId: 'e2', nom: 'Paulin Aho', msisdn: N.bon, montantXof: 80000 });
  const reprog = await direction({ action: 'programmer', envois: [b] });
  dit('apres un refus, le bulletin peut etre programme a nouveau', reprog.o?.inscrits?.length === 1, reprog.t);
  await direction({ action: 'annuler', references: [b.reference] });
  const nouvelle = ref();
  const r = await direction({ action: 'renvoyer', reference: a.reference, nouvelle, msisdn: N.bon });
  const n = ligne(nouvelle);
  dit('renvoyer : une nouvelle reference, qui se souvient de l ancienne, partie aussitot vers le numero corrige',
    r.status === 200 && n?.remplace === a.reference && n?.msisdn === N.bon && n?.programme_par === 'Y. B.' && transferts.has(nouvelle) && ligne(a.reference).etat === 'refuse', r.t);
  const r2 = await direction({ action: 'renvoyer', reference: nouvelle, nouvelle: ref() });
  dit('seul un envoi refuse se renvoie', r2.status === 409, r2.t);
}

/* MTN ne repond pas, puis ne connait pas l'envoi */
{
  remiseAZero();
  const a = paie({ employeeId: 'e4', nom: 'Rose Dah', msisdn: N.perdu, montantXof: 70000 });
  await direction({ action: 'programmer', envois: [a] });
  await cron();
  await cron();
  dit('sans reponse de MTN : la meme reference est relue, puis renvoyee telle quelle, une seule fois recue',
    ligne(a.reference).etat === 'recu' && transferts.get(a.reference)?.posts === 1 && postsTransfert().every((j) => j.h['x-reference-id'] === a.reference),
    JSON.stringify({ l: ligne(a.reference), posts: postsTransfert().length }));
  const b = paie({ employeeId: 'e5', msisdn: N.bon });
  await direction({ action: 'programmer', envois: [b] });
  transferts.set(b.reference, { msisdn: N.bon, montant: 150000, posts: 1, lu: 0, statut: { status: 'SUCCESSFUL', financialTransactionId: '41279999' } });
  await cron();
  dit('MTN a deja la reference (409) : l envoi compte comme parti, rien ne part deux fois', ligne(b.reference).etat === 'recu' && transferts.get(b.reference).posts === 2 && soldeMtn === 1_000_000 - 70000, JSON.stringify(ligne(b.reference)));
}

/* MTN prend l'envoi mais repond 500 ; MTN l'accepte puis l'oublie un temps ; MTN ne le prend jamais */
{
  remiseAZero();
  const a = paie({ employeeId: 'e7', msisdn: N.muet, montantXof: 60000 });
  const b = paie({ employeeId: 'e8', msisdn: N.oublie, montantXof: 50000 });
  const c = paie({ employeeId: 'e9', msisdn: N.jamais, montantXof: 40000 });
  await direction({ action: 'programmer', envois: [a, b, c] });
  for (let i = 0; i < 6; i++) await cron();
  const postsDe = (x) => postsTransfert().filter((j) => j.h['x-reference-id'] === x.reference).length;
  dit('MTN repond 500 mais a pris l envoi : le Trone relit, un seul envoi, recu', postsDe(a) === 1 && ligne(a.reference).etat === 'recu', JSON.stringify({ posts: postsDe(a), l: ligne(a.reference) }));
  dit('MTN accepte puis ne montre pas l envoi : le Trone attend, sans renvoyer', postsDe(b) === 1 && ligne(b.reference).etat === 'recu', JSON.stringify({ posts: postsDe(b), l: ligne(b.reference) }));
  dit('MTN ne prend jamais l envoi : trois essais sous la meme reference, puis un refus qui se dit', postsDe(c) === 3 && ligne(c.reference).etat === 'refuse' && ligne(c.reference).raison === 'INCONNU_CHEZ_MTN', JSON.stringify({ posts: postsDe(c), l: ligne(c.reference) }));
}

/* Annuler */
{
  remiseAZero();
  const a = paie({ partA: futur });
  const b = paie({ employeeId: 'e2', msisdn: N.lent, montantXof: 90000 });
  await direction({ action: 'programmer', envois: [a, b] });
  await cron();
  const r = await direction({ action: 'annuler', references: [a.reference, b.reference] });
  dit('annuler : seul ce qui n est pas parti s annule', r.o?.annules === 1 && ligne(a.reference).etat === 'annule' && ligne(b.reference).etat !== 'annule', r.t);
  ligne(a.reference).part_a = passe;
  await cron();
  dit('un envoi annule ne part pas', !transferts.has(a.reference), String(transferts.has(a.reference)));
  const r2 = await direction({ action: 'renvoyer', reference: a.reference, nouvelle: ref() });
  dit('un envoi annule ne se renvoie pas', r2.status === 409 && transferts.size === 1, r2.t);
}

/* Le test de 100 F */
{
  remiseAZero();
  const essaiId = 'essai-202612011800';
  const r = await direction({ action: 'tester', essaiId, envois: [
    { reference: ref(), employeeId: 'e1', nom: 'Aïcha Kossou', msisdn: N.bon, montantXof: 100 },
    { reference: ref(), employeeId: 'e2', nom: 'Paulin Aho', msisdn: N.refuse, montantXof: 100 },
    { reference: ref(), employeeId: 'e3', nom: 'Sika H.', msisdn: N.lent, montantXof: 600 },
  ] });
  dit('le test part aussitot ; 600 F est refuse par le serveur lui-meme', r.o?.inscrits?.length === 2 && r.o?.refuses?.length === 1 && r.o?.refuses?.[0]?.erreur === 'montant hors bornes (1 à 500 F)' && postsTransfert().length === 2, r.t);
  const lignes = registre.filter((x) => x.essai_id === essaiId);
  dit('le test : le recu et le refus se disent', lignes.some((x) => x.etat === 'recu') && lignes.some((x) => x.etat === 'refuse' && x.raison === 'PAYEE_NOT_ALLOWED_TO_RECEIVE'), JSON.stringify(lignes.map((x) => x.etat)));
  const r2 = await direction({ action: 'tester', essaiId: 'pas-un-essai', envois: [{ reference: ref(), employeeId: 'e1', nom: 'A', msisdn: N.bon, montantXof: 100 }] });
  dit('un test sans identifiant lisible n entre pas', r2.o?.inscrits?.length === 0, r2.t);
  dit('aucune reponse ne montre une cle', sansSecret(r.t) && sansSecret(r2.t), r.t);
}

/* Tout le journal : jamais MTN en direct */
dit('aucun appel ne sort du monde simule', !journal.some((j) => ![PROJET, RELAIS].includes(j.origine)), JSON.stringify([...new Set(journal.map((j) => j.origine))]));

console.log(echecs === 0 ? '\nLa paie par MTN tient.' : `\n${echecs} ECHEC(S)`);
process.exit(echecs === 0 ? 0 : 1);
