/* LES RENDUS 3D DES ENSEIGNES — 22 octobre 2026.

     python scripts/signaletique/volumes.py <scenes.json> [R4,R3,…]
     node scripts/signaletique/rendu3d.mjs <scenes.json> <dossier des rendus>

   Ouvre rendu3d.html dans un vrai Chrome sans tête (WebGL logiciel), lui passe
   chaque scène de volumes.py, et écrit un PNG par vue : <id>-jour.png,
   <id>-nuit.png, <id>-situation.png. Three.js vient de jsdelivr (version
   figée 0.160.0) : il faut le réseau. */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const [scenesJson, sortie] = process.argv.slice(2);
if (!scenesJson || !sortie) { console.error('usage : node rendu3d.mjs <scenes.json> <dossier>'); process.exit(2); }
mkdirSync(sortie, { recursive: true });
const scenes = JSON.parse(readFileSync(scenesJson, 'utf8'));
const page = readFileSync(path.join(import.meta.dirname, 'rendu3d.html'));

const serveur = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(page); });
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const dbg = 9600 + Math.floor(Math.random() * 300);
const profil = mkdtempSync(path.join(tmpdir(), 'rendu3d-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist',
  '--window-size=1600,1000', `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank',
], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));

let ko = 0;
try {
  let cible;
  for (let i = 0; i < 60 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
  if (!cible) throw new Error('Chrome ne repond pas.');
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const enCours = new Map(); const erreurs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') erreurs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await cdp('Runtime.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${serveur.address().port}/` });
  let pret = false;
  for (let i = 0; i < 80 && !pret; i++) { await attend(500); pret = (await cdp('Runtime.evaluate', { expression: 'window.pret === true', returnByValue: true })).result?.result?.value; }
  if (!pret) throw new Error(`le moteur ne s'est pas charge : ${erreurs.join(' | ')}`);
  for (const sc of scenes) {
    for (const vue of sc.recette.vues) {
      const t0 = Date.now();
      const rep = await cdp('Runtime.evaluate', { expression: `window.rends(${JSON.stringify(sc)}, ${JSON.stringify(vue)})`, awaitPromise: true, returnByValue: true });
      const url = rep.result?.result?.value;
      if (!url || !url.startsWith('data:image/png')) {
        ko++;
        console.log(`ECHEC ${sc.id}-${vue} : ${rep.result?.exceptionDetails?.exception?.description?.split('\n')[0] ?? erreurs.slice(-1)[0] ?? 'rien rendu'}`);
        continue;
      }
      writeFileSync(path.join(sortie, `${sc.id}-${vue}.png`), Buffer.from(url.split(',')[1], 'base64'));
      console.log(`ok ${sc.id}-${vue} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
  }
  if (erreurs.length) console.log(`erreurs de la page : ${[...new Set(erreurs)].slice(0, 5).join(' | ')}`);
  ws.close();
} finally {
  chrome.kill();
  serveur.close();
  await attend(400);
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore son profil */ }
}
process.exitCode = ko ? 1 : 0;
