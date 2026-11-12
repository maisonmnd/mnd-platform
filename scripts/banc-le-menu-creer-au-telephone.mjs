import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE MENU « CRÉER » AU TÉLÉPHONE — `node scripts/banc-le-menu-creer-au-telephone.mjs [capture]`.

   12 novembre 2026 : « le bouton Créer ne marche pas sur la version mobile
   téléphone » (Yéman). Au téléphone, la barre du haut est une rangée qui
   glisse (overflow-x: auto, overflow-y: hidden) : le menu posé sous le bouton,
   DANS la barre, était coupé, invisible. Ce banc construit le Trône comme le
   banc hors ligne (connexion obligatoire, serveur Supabase injoignable, une
   session gardée), l'ouvre dans un vrai Chrome sur 390 × 844, TOUCHE « Créer »
   et exige que la première ligne du menu soit vraiment à l'écran (ce que le
   doigt toucherait est bien elle), puis la touche et attend la fenêtre des
   liens à envoyer. La même chose sur un écran d'ordinateur.
   Les noms de ce banc sont des exemples. */

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-creer-'));
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
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-creer-chrome-'));
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

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};

/* La session gardée, comme le banc hors ligne : le Trône s'ouvre sur ses écrans. */
const UID = 'u-banc-creer';
const CLE = 'sb-127-auth-token';
const le = new Date(Date.now() - 86_400_000).toISOString();
const semence = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
    user: { id: UID, email: 'accueil@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Accueil', role: 'souverain', rubrics: [] } },
};

/* Le centre d'un élément, et ce que le doigt y toucherait vraiment. */
const centre = (sel) => evalue(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const touche = document.elementFromPoint(x, y);
  return { x, y, visible: x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight, atteint: !!touche && el.contains(touche) };
})()`);
const touche = async (x, y) => {
  await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const clique = async (x, y) => {
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};

async function essai(nom, largeur, hauteur, mobile) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  await evalue('location.reload()');
  await attend(8000);
  dit(`${nom} : le Trône s’ouvre sur ses écrans`, !!(await evalue(`!!document.querySelector('.tr-top')`)));

  const bouton = await centre('.trc-creer__bouton');
  dit(`${nom} : le bouton Créer est à l’écran, sans glisser la barre`, !!bouton?.visible && !!bouton?.atteint, JSON.stringify(bouton));
  if (!bouton) return;
  if (mobile) await touche(bouton.x, bouton.y); else await clique(bouton.x, bouton.y);
  await attend(500);
  await photo(`${nom}-menu`);
  const ligne = await centre('.trc-creer__menu .trc-creer__item');
  dit(`${nom} : le menu s’ouvre, sa première ligne est visible et touchable`, !!ligne?.visible && !!ligne?.atteint, JSON.stringify(ligne));
  const texte = await evalue(`document.querySelector('.trc-creer__menu .trc-creer__item b')?.textContent ?? ''`);
  dit(`${nom} : la première ligne est « Lien de réservation »`, texte === 'Lien de réservation', texte);
  if (!ligne) return;
  if (mobile) await touche(ligne.x, ligne.y); else await clique(ligne.x, ligne.y);
  await attend(800);
  await photo(`${nom}-fenetre`);
  const fenetre = await evalue(`(() => { const t = document.querySelector('.mnd-modal')?.innerText ?? ''; return { titre: t.includes('Un lien à envoyer.'), menuFerme: !document.querySelector('.trc-creer__menu') }; })()`);
  dit(`${nom} : la fenêtre des liens s’ouvre et le menu se referme`, fenetre?.titre && fenetre?.menuFerme, JSON.stringify(fenetre));
  await evalue(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); true`);
  await attend(300);
}

try {
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await essai('téléphone 390', 390, 844, true);
  await essai('ordinateur 1280', 1280, 800, false);
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
} finally {
  ws.close(); chrome.kill(); serveur.close();
  await attend(500);
  rmSync(construit, { recursive: true, force: true });
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore le profil */ }
}
console.log(ko ? `\n${ko} échec(s).` : '\nLe menu Créer s’ouvre au téléphone comme à l’ordinateur.');
process.exit(ko ? 1 : 0);
