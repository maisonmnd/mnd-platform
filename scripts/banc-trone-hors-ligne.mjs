/* LE BANC DU TRÔNE HORS LIGNE — `node scripts/banc-trone-hors-ligne.mjs [capture]`.

   4 octobre 2026, maquette « Le Trône hors ligne », temps 2. Il construit le
   Trône comme pour la mise en ligne (connexion obligatoire, service injecté par
   `sw-a-garder.mjs`), avec un serveur Supabase INJOIGNABLE, et l'ouvre dans un
   vrai Chrome :

     1. une session laissée par supabase-js, une dernière connexion en ligne
        d'hier et sa tête gardée : le Trône s'ouvre sur ses écrans, pas sur la
        page de connexion ;
     2. le service garde l'application (la page et le code) ;
     3. serveur de fichiers ARRÊTÉ et navigateur hors ligne : on recharge, le
        Trône s'ouvre encore, la pastille dit « Hors ligne » ;
     4. dernière connexion en ligne il y a 8 jours : il redemande la connexion.

   Les noms de cette journée sont des exemples. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { injecteLeService } from './sw-a-garder.mjs';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-hl-'));
console.log('Construction du Trône (serveur injoignable)…');
execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
});
renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));
const garde = injecteLeService(construit, 'banc-hors-ligne');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = createServer((req, res) => {
  let f = path.join(construit, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;
const origine = `http://127.0.0.1:${port}`;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-hl-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let cible;
for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
if (!cible) { console.error('Chrome ne repond pas.'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const enCours = new Map(); const erreurs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails.text);
});
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await cdp('Runtime.enable');
await cdp('Network.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};
const quelEcran = () => evalue(`(() => {
  const t = document.body.innerText;
  if (document.querySelector('.tr-top__sync, .tr-side, nav')) return 'trone';
  if (/mot de passe|se connecter|connexion/i.test(t)) return 'connexion';
  return 'autre : ' + t.slice(0, 80).replace(/\\s+/g, ' ');
})()`);

/* La session laissée par supabase-js (jeton expiré, rafraîchissement impossible
   sans réseau), et ce que le Trône a gardé à sa dernière ouverture en ligne. */
const UID = 'u-banc-accueil';
const CLE = 'sb-127-auth-token';
const semence = (joursDepuisLaConnexion) => {
  const le = new Date(Date.now() - joursDepuisLaConnexion * 86_400_000).toISOString();
  return {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'accueil@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Accueil', role: 'souverain', rubrics: [] } },
  };
};
const seme = (j) => evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence(j))})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);

/* 1. En ligne pour les fichiers, mais Supabase injoignable. */
await cdp('Page.navigate', { url: `${origine}/` });
await attend(2500);
await seme(1);
await evalue('location.reload()');
await attend(9000);
const e1 = await quelEcran();
dit('1. session et tete gardees : le Trone s ouvre sur ses ecrans', e1 === 'trone', e1);
await photo('1-ouvert');

/* 2. Le service a gardé l'application. */
const gardes = await evalue(`(async () => {
  const reg = await navigator.serviceWorker.ready;
  for (let i = 0; i < 40; i++) {
    const noms = await caches.keys();
    const app = noms.find((n) => n.startsWith('mnd-app-'));
    if (app) { const n = (await (await caches.open(app)).keys()).length; if (n >= ${garde.fichiers}) return { scope: reg.scope, n }; }
    await new Promise((r) => setTimeout(r, 500));
  }
  const noms = await caches.keys();
  return { scope: reg.scope, noms, n: noms.length };
})()`);
dit(`2. le service garde l application (${garde.fichiers} fichiers, ${garde.mo.toFixed(1)} Mo)`, (gardes?.n ?? 0) >= garde.fichiers, JSON.stringify(gardes));

/* 3. Plus de serveur de fichiers, navigateur hors ligne : on recharge. */
await new Promise((r) => serveur.close(r));
serveur.closeAllConnections?.();
await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
await evalue('location.reload()');
await attend(9000);
const e3 = await quelEcran();
dit('3. sans serveur ni reseau, le Trone se rouvre', e3 === 'trone', e3);
const pastille = await evalue(`document.querySelector('.tr-top__sync')?.innerText ?? ''`);
dit('... et la pastille dit « Hors ligne »', /hors ligne/i.test(pastille ?? ''), pastille);
await photo('3-hors-ligne');

/* 3 bis. Un envoi gardé (temps 3) : la pastille le compte, et s'ouvre sur la file. */
await evalue(`localStorage.setItem('trone::appels-en-attente', JSON.stringify([{ id: 'ap-banc', fonction: 'whatsapp-envoi', corps: {}, dit: 'WhatsApp à Awa K.', at: new Date().toISOString() }])); true`);
await evalue('location.reload()');
await attend(9000);
const pastille2 = await evalue(`document.querySelector('.tr-top__sync')?.innerText ?? ''`);
dit('3 bis. la pastille compte l envoi en attente', /1 envoi en attente/i.test(pastille2 ?? ''), pastille2);
await evalue(`document.querySelector('.tr-top__sync')?.click(); true`);
await attend(800);
const panneau = await evalue(`(document.querySelector('[role=dialog]')?.innerText ?? '')`);
dit('... et s ouvre sur « La file d attente » qui le nomme', /file d.attente/i.test(panneau ?? '') && /WhatsApp à Awa K\./.test(panneau ?? ''), (panneau ?? '').slice(0, 120).replace(/\s+/g, ' '));
await photo('3b-file');
await evalue(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); localStorage.removeItem('trone::appels-en-attente'); true`);

/* 4. La dernière connexion en ligne date de 8 jours : on redemande. */
await seme(8);
await evalue('location.reload()');
await attend(9000);
const e4 = await quelEcran();
dit('4. au-dela de 7 jours, le Trone redemande la connexion', e4 === 'connexion', e4);
await photo('4-sept-jours');
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill();
setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libere apres */ } } }, 1500);
console.log(ko === 0 ? '\nLe Trone s ouvre sans reseau, et sept jours au plus.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
