/* LE BANC DES ANCRES DU TABLEAU DE BORD — 5 novembre 2026. `node scripts/banc-des-ancres.mjs [dossier construit]`.

   « Les pages ne s'ouvrent pas : Le mois, Aujourd'hui, À traiter, Le détail
   du mois ne marchent pas. J'ai un message unexpected » (Yéman). Le Trône vit
   derrière le dièse : `href="#le-mois"` y était une page inconnue, et le
   routeur montrait « Unexpected Application Error ». Ce banc ouvre le VRAI
   Trône, hors ligne, touche chaque bouton du sommaire, puis une adresse
   inconnue :
     - l'adresse ne change pas (#/), aucune page d'erreur ;
     - la section visée vient en haut de l'écran ;
     - une adresse inconnue ramène au tableau de bord.

   Il attend le Trône construit sans serveur (sous Bash) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY=        npx vite build --outDir "$TEMP/banc-trone-ancres" --emptyOutDir */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const construit = process.argv[2] || path.join(tmpdir(), 'banc-trone-ancres');
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
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
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-ancres-'));
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
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };

const erreurDuRouteur = () => evalue(`/Unexpected Application Error|404 Not Found/.test(document.body.innerText)`);
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/` });
await attend(8000);
dit('le tableau de bord s ouvre', !(await erreurDuRouteur()) && (await evalue(`document.querySelectorAll('.trd-nav a').length`)) === 4,
  await evalue(`document.querySelectorAll('.trd-nav a').length`));
for (const [texte, id] of [['Le mois', 'le-mois'], ['Aujourd’hui', 'aujourdhui'], ['À traiter', 'a-traiter'], ['Le détail du mois', 'le-detail-du-mois']]) {
  await evalue(`window.scrollTo(0, 0); document.querySelector('.tr-content')?.scrollTo?.(0, 0)`);
  await attend(300);
  const ok = await evalue(`(() => { const a = [...document.querySelectorAll('.trd-nav a')].find((x) => x.textContent.trim() === ${JSON.stringify(texte)}); if (a) a.click(); return !!a; })()`);
  await attend(1200);
  const hash = await evalue('location.hash');
  const haut = await evalue(`(() => { const s = document.getElementById(${JSON.stringify(id)}); return s ? Math.round(s.getBoundingClientRect().top) : null; })()`);
  dit(`« ${texte} » : la page reste, aucune erreur`, ok && hash === '#/' && !(await erreurDuRouteur()), `${hash}`);
  /* Hors ligne, la page est courte : la section du bas vient a l'ecran sans
     pouvoir monter tout en haut. On demande qu'elle soit sous les yeux. */
  const vue = await evalue('window.innerHeight');
  dit(`« ${texte} » : la section vient sous les yeux`, typeof haut === 'number' && haut >= -40 && haut <= vue - 80, `${haut} sur ${vue}`);
}
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/le-mois` });
await attend(3000);
dit('une adresse inconnue ramene au tableau de bord, sans page d erreur', (await evalue('location.hash')) === '#/' && !(await erreurDuRouteur()), await evalue('location.hash'));
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nLes ancres du tableau de bord tiennent.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
