/* LE BANC DU RYTHME — `node scripts/banc-du-rythme.mjs [--prouve]`.

   8 octobre 2026 : « J'aime la transition entre le diagnostic, les offres de
   la Maison et la carte cadeau. Ça n'a pas été fait pour le parrainage, notre
   histoire et la galerie : tout vient brutalement. Même chose au début, entre
   La Maison et les cinq portes. » (Yéman)

   La promesse : sur l'accueil, AUCUNE section ne porte la même couleur que
   sa voisine. Le banc ouvre l'accueil construit (dist-sites/revelateur) dans
   Chrome, lit la couleur que chaque section montre en son milieu (son fond
   plein, le milieu de son dégradé, ou la toile si elle est transparente), et
   compare chaque section à la suivante.

   --prouve : rejoue l'accueil avec la galerie remise sur la toile ivoire (la
   panne du 8 octobre, quatre clairs à la suite) ; le banc doit crier. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const SITE = path.resolve(import.meta.dirname, '..', 'dist-sites', 'revelateur');
if (!existsSync(path.join(SITE, 'index.html'))) { console.log('RATE  construis d abord : node scripts/build-sites.mjs'); process.exit(2); }
const prouve = process.argv.includes('--prouve');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };
const serveur = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let f = path.join(SITE, decodeURIComponent(url.pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(SITE) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-rythme-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let cible;
for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
if (!cible) { console.log('RATE  Chrome ne repond pas.'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const enCours = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/* La couleur qu'une section MONTRE : fond plein, sinon le milieu de son
   dégradé, sinon (transparente) la toile du body. */
const LIS = `(() => {
  const transparent = (c) => !c || c === 'transparent' || /rgba\\([^)]*,\\s*0\\)$/.test(c);
  const toile = getComputedStyle(document.body).backgroundColor;
  const milieu = (img) => {
    const cs = img.match(/rgba?\\([^)]*\\)/g);
    if (!cs || !cs.length) return null;
    const pleins = cs.filter((c) => !transparent(c));
    return pleins.length ? pleins[Math.floor(pleins.length / 2)] : null;
  };
  return [...document.querySelectorAll('main > section')].map((s) => {
    const st = getComputedStyle(s);
    let c = transparent(st.backgroundColor) ? null : st.backgroundColor;
    if (!c && st.backgroundImage.includes('gradient')) c = milieu(st.backgroundImage);
    /* Une section qui peint son fond par un ::before couvrant (la communauté,
       son indigo et son motif) montre la couleur de ce ::before. */
    if (!c) {
      const av = getComputedStyle(s, '::before');
      if (av.content !== 'none' && av.position === 'absolute' && !transparent(av.backgroundColor)) c = av.backgroundColor;
    }
    return { nom: s.id || s.className.split(' ')[0] || 'section', couleur: c || toile };
  });
})()`;

const PANNE = `(() => { const s = document.createElement('style'); s.textContent = '#galerie { background: transparent !important; }'; document.head.append(s); })()`;

async function eprouve(panne) {
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  await attend(2500);
  if (panne) { await evalue(PANNE); await attend(200); }
  const sections = await evalue(LIS);
  const ecarts = [];
  for (let i = 1; i < sections.length; i++) {
    const a = sections[i - 1], b = sections[i];
    if (a.couleur === b.couleur) ecarts.push(`${a.nom} et ${b.nom} portent la meme couleur (${a.couleur})`);
  }
  return { sections, ecarts };
}

let ko = 0;
const { sections, ecarts } = await eprouve(false);
console.log(sections.map((s) => `      ${s.nom.padEnd(14)} ${s.couleur}`).join('\n'));
if (sections.length < 8) { ko++; console.log(`RATE  l accueil n a que ${sections.length} sections lues`); }
if (ecarts.length) { ko++; console.log('RATE  sur l accueil, chaque section a sa couleur\n' + ecarts.map((e) => '      - ' + e).join('\n')); }
else console.log('OK    sur l accueil, chaque section a sa couleur');
if (prouve) {
  const p = await eprouve(true);
  if (p.ecarts.length) console.log('OK    crie : la galerie remise sur la toile');
  else { ko++; console.log('RATE  muet devant « la galerie remise sur la toile »'); }
}

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nLe rythme tient.' : `\n${ko} RATE.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
