/* LE BANC DES DISCUSSIONS — `node scripts/banc-des-discussions.mjs [capture]`.

   19 octobre 2026. Le harnais `verifie-le-chat-du-site` éprouve la règle et
   le serveur ; ce banc ouvre le VRAI Trône comme la direction (session et
   tête gardées, comme le banc hors ligne). Le serveur reste injoignable,
   sauf les trois tables du chat, servies ici avec deux discussions
   d'exemple :
     - l'écran « Le chat du site » (onglet de Conversations) liste, compte « à répondre », ouvre un fil ;
     - la réponse automatique se dit Claude, le mot du chat se dit chat ;
     - le numéro se masque, « voir » le montre ;
     - « Prendre la permanence » pose SA ligne, et le bandeau le dit ;
     - répondre (Entrée) écrit une réponse « maison » signée de son compte ;
     - sur un téléphone, la liste puis le fil, « ‹ » pour revenir, rien ne dépasse.
   Les noms et numéros sont des exemples. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-disc-'));
console.log('Construction du Trône (serveur injoignable)…');
execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
});
renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = createServer((req, res) => {
  let f = path.join(construit, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const origine = `http://127.0.0.1:${serveur.address().port}`;

/* ── LES TROIS TABLES DU CHAT, D'EXEMPLE ── */
const UID = 'u-banc-direction';
const il = (min) => new Date(Date.now() - min * 60_000).toISOString();
const discussions = [
  { id: 'disc-00000000-0000-4000-8000-000000000001', branch_id: 'maison', civilite: 'madame', prenom: 'Clarisse', nom: 'Dossou', telephone: '+2290197000000', page: '/soins-locks/', etat: 'ouverte', dernier_de: 'visiteuse', derniere_le: il(4), client_id: null, cree_le: il(9) },
  { id: 'disc-00000000-0000-4000-8000-000000000002', branch_id: 'maison', civilite: 'monsieur', prenom: 'Koffi', nom: 'Agbo', telephone: '+2290196000000', page: '/', etat: 'ouverte', dernier_de: 'maison', derniere_le: il(60 * 26), client_id: null, cree_le: il(60 * 27) },
];
const messages = [
  { id: 1, discussion_id: discussions[0].id, de: 'visiteuse', texte: 'Bonjour, il vous reste de la place samedi pour un entretien ?', cree_le: il(9), genre: null, par: null },
  { id: 2, discussion_id: discussions[0].id, de: 'auto', texte: 'Bonjour Madame Clarisse, ici la réponse automatique de la Maison MND. Vous pouvez choisir votre heure en ligne. Une personne de l’équipe vous répondra sur WhatsApp dès son retour.', cree_le: il(9), genre: null, par: null },
  { id: 3, discussion_id: discussions[0].id, de: 'visiteuse', texte: 'Merci, j’attends alors.', cree_le: il(4), genre: null, par: null },
  { id: 4, discussion_id: discussions[1].id, de: 'visiteuse', texte: 'Bonsoir, faites-vous les microlocks ?', cree_le: il(60 * 27), genre: null, par: null },
  { id: 5, discussion_id: discussions[1].id, de: 'maison', texte: 'Bonsoir Monsieur Koffi, oui. Voulez-vous réserver une consultation ?', cree_le: il(60 * 26), genre: null, par: 'u-autre' },
];
let permanences = [];
const ecrits = [];
const UTILISATEUR = { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: il(60 * 24 * 30) };
const servi = (url, methode, corps, accept) => {
  const u = new URL(url);
  /* La session, le compte et la fiche de la direction : le Trône sait qui répond. */
  if (u.pathname === '/auth/v1/token') return [200, { access_token: 'faux-2', refresh_token: 'faux-2', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: UTILISATEUR }];
  if (u.pathname === '/auth/v1/user') return [200, UTILISATEUR];
  if (u.pathname === '/rest/v1/staff' && methode === 'GET') {
    const fiche = { user_id: UID, name: 'Yéman Boya', role: 'souverain', rubrics: [] };
    return [200, /object/.test(accept) ? fiche : [fiche]];
  }
  const table = u.pathname.replace('/rest/v1/', '');
  if (table === 'discussions' && methode === 'GET') return [200, discussions];
  if (table === 'discussion_messages' && methode === 'GET') {
    const id = (u.searchParams.get('discussion_id') ?? '').replace(/^eq\./, '');
    return [200, messages.filter((m) => m.discussion_id === id)];
  }
  if (table === 'discussion_messages' && methode === 'POST') {
    const row = { ...JSON.parse(corps || '{}'), id: messages.length + 1, cree_le: new Date().toISOString(), genre: null };
    messages.push(row); ecrits.push({ table, row });
    return [201, /object/.test(accept) ? row : [row]];
  }
  if (table === 'discussion_permanence' && methode === 'GET') return [200, permanences];
  if (table === 'discussion_permanence' && methode === 'POST') {
    const row = JSON.parse(corps || '{}'); permanences = [...permanences.filter((p) => p.user_id !== row.user_id), row]; ecrits.push({ table, row });
    return [201, ''];
  }
  if (table === 'discussion_permanence' && methode === 'DELETE') { permanences = []; return [204, '']; }
  if (table === 'discussions' && methode === 'PATCH') return [204, ''];
  return null;
};

const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-disc-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let cible;
for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
if (!cible) { console.error('Chrome ne repond pas.'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const enCours = new Map(); const erreurs = [];
const cdp = (method, params = {}) => new Promise((r) => { const k = ++id; enCours.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
const CORS = [{ name: 'access-control-allow-origin', value: '*' }, { name: 'access-control-allow-headers', value: '*' }, { name: 'access-control-allow-methods', value: '*' }, { name: 'content-type', value: 'application/json' }];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails.text);
  if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params;
    if (request.method === 'OPTIONS') { void cdp('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: CORS }); return; }
    const r = /\/rest\/v1\/(discussion|staff)|\/auth\/v1\/(token|user)/.test(request.url) ? servi(request.url, request.method, request.postData, request.headers?.Accept ?? request.headers?.accept ?? '') : null;
    /* Le reste du serveur reste injoignable : le Trône vit hors ligne, comme au banc hors ligne. */
    if (!r) { void cdp('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }); return; }
    const corps = typeof r[1] === 'string' ? r[1] : JSON.stringify(r[1]);
    void cdp('Fetch.fulfillRequest', { requestId, responseCode: r[0], responseHeaders: CORS, ...(corps ? { body: Buffer.from(corps).toString('base64') } : {}) });
  }
});
const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:9/*' }] });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};
const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
const clique = (selecteur, texte) => evalue(`(() => {
  const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const texte = (sel) => evalue(String.raw`(document.querySelector(${JSON.stringify(sel)})?.innerText || '').replace(/\s+/g, ' ')`);

/* La direction, comme le banc hors ligne. Sa session est périmée : la
   bibliothèque tente de la renouveler (serveur injoignable) une trentaine
   de secondes, puis lit avec la clé publique. On l'attend. */
const CLE = 'sb-127-auth-token';
const le = new Date(Date.now() - 86_400_000).toISOString();
await cdp('Page.navigate', { url: `${origine}/` });
await attend(2500);
const semence = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
    user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Yéman Boya', role: 'souverain', rubrics: [] } },
  mnd_reset_v5: '1',
};
await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; })()`);
await evalue('location.reload()');
await jusqua(`!!document.querySelector('.tr-top__sync, .tr-side, nav')`, 20000);
await evalue(`location.hash = '#/discussions'; true`);

const liste = await jusqua(`document.querySelectorAll('.trc-chat-ligne').length`, 75000);
dit('l écran Discussions s ouvre et liste « à répondre » d abord : une', liste === 1, liste ?? await texte('.trc-chat-erreur, .trc-chat-vide'));
const nb = await texte('.trc-chat-filtres');
dit('les filtres comptent : 1 à répondre, 2 ouvertes, 2 en tout', /À répondre\s*1/.test(nb) && /Ouvertes\s*2/.test(nb) && /Toutes\s*2/.test(nb), nb);
dit('personne de permanence : le bandeau le dit', /Personne de permanence/.test(await texte('.trc-chat-garde')));
await clique('.trc-chat-ligne', 'Clarisse Dossou');
const fil = await jusqua(`document.querySelectorAll('.trc-chat-fil .trc-chat-msg').length`, 10000);
dit('le fil s ouvre : son message, la réponse automatique, sa relance', fil === 3, fil);
const vuFil = await texte('.trc-chat-fil');
dit('la réponse automatique se dit Claude', /Réponse automatique \(Claude\)/.test(vuFil));
const qui = await texte('.trc-chat-qui');
dit('« Madame Clarisse », le numéro masqué, la page d où elle écrit', /Madame Clarisse/.test(qui) && !/97 00 00 00/.test(qui) && /soins-locks/.test(qui), qui);
await clique('.trc-chat-qui button', 'voir');
dit('« voir » montre le numéro', /01 97 00 00 00/.test(await texte('.trc-chat-qui')));
/* Le bouton paraît quand le Trône sait qui regarde (sa fiche relue). */
const boutonDeGarde = await jusqua(`[...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /permanence/i.test(t)).join(' | ')`, 60000);
await clique('button', 'Prendre la permanence');
await jusqua(`/De permanence : vous/.test(document.querySelector('.trc-chat-garde')?.innerText || '')`, 8000);
const pose = ecrits.find((e) => e.table === 'discussion_permanence')?.row ?? {};
dit('« Prendre la permanence » pose SA ligne, pour la journée (huit heures au plus)', pose.user_id === UID && Date.parse(pose.jusqua) > Date.now() && Date.parse(pose.jusqua) - Date.now() <= 8 * 3_600_000 + 60_000 && pose.nom === 'Yéman', `${JSON.stringify(pose)} (bouton : ${boutonDeGarde || 'absent'})`);
dit('... et le bandeau dit « De permanence : vous »', /De permanence : vous/.test(await texte('.trc-chat-garde')));
await photo('1-ordinateur');
await evalue(`(() => { const t = document.querySelector('.trc-chat-repondre textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(t, 'Bonjour Madame Clarisse, oui : samedi à 10 h.'); t.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await evalue(`document.querySelector('.trc-chat-repondre textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
await jusqua(`document.querySelectorAll('.trc-chat-fil .trc-chat-msg--maison').length === 1`, 8000);
const rep = ecrits.find((e) => e.table === 'discussion_messages')?.row ?? {};
dit('Entrée répond au nom de la Maison, signé de son compte', rep.de === 'maison' && rep.par === UID && rep.texte === 'Bonjour Madame Clarisse, oui : samedi à 10 h.' && rep.discussion_id === discussions[0].id, JSON.stringify(rep));
dit('... la réponse paraît à droite, « Vous, au nom de la Maison »', /Vous, au nom de la Maison/.test(await texte('.trc-chat-fil .trc-chat-msg--maison')));
dit('... et la saisie se vide', (await evalue(`document.querySelector('.trc-chat-repondre textarea').value`)) === '');

/* Sur un téléphone. */
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await attend(800);
const deborde = () => evalue(`document.documentElement.scrollWidth > innerWidth + 1 ? document.documentElement.scrollWidth : 0`);
dit('téléphone : le fil seul, avec « ‹ » pour revenir', (await evalue(`getComputedStyle(document.querySelector('.trc-chat-liste')).display === 'none' && getComputedStyle(document.querySelector('.trc-chat-retour')).display !== 'none'`)) === true);
dit('... rien ne dépasse à droite', (await deborde()) === 0, await deborde());
await photo('2-telephone-fil');
await evalue(`document.querySelector('.trc-chat-retour').click()`);
await attend(400);
dit('« ‹ » rend la liste', (await evalue(`getComputedStyle(document.querySelector('.trc-chat-liste')).display !== 'none' && !document.querySelector('.trc-chat-fil')`)) === true);
await photo('3-telephone-liste');
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
console.log(ko === 0 ? '\nL écran Discussions tient ses promesses.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
