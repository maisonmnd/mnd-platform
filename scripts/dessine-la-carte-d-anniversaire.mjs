/* LA CARTE D'ANNIVERSAIRE SANS PRÉNOM, DESSINÉE — 27 octobre 2026.

   `node scripts/dessine-la-carte-d-anniversaire.mjs` réécrit
   `public/assets/cartes/carte-anniversaire.png`, l'image que Meta joint en
   tête des messages d'anniversaire automatiques de l'Assistant Maison
   (`IMAGE_DE_LA_CARTE`, shared/gerard-pur). `--essai <prénom>` dessine à
   côté, dans le dossier temporaire, la carte À SON PRÉNOM telle que la
   fenêtre « Sa carte » la dessine, pour comparer.

   LE MÊME DESSIN QUE LA FENÊTRE « SA CARTE » : `ds/carte.ts` et ses mots
   (`texteDeLaCarteSansPrenom`, shared/cartes), ses polices (tokens/fonts.css)
   et son monogramme (public/assets/monograms), dans un Chrome sans tête. Une
   image refaite à la main finirait par ne plus ressembler à la carte de la
   Maison. Seuls le nom de la Maison et sa devise passent par une doublure
   (le module de l'identité tire la synchronisation) : la devise est LUE dans
   son fichier, jamais recopiée. */
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const essai = process.argv.includes('--essai') ? process.argv[process.argv.indexOf('--essai') + 1] ?? '' : null;
const CIBLE = path.join(racine, 'public/assets/cartes/carte-anniversaire.png');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const identite = readFileSync(path.join(racine, 'src/shared/identite.ts'), 'utf8');
const devise = /export const DEVISE_COMPLETE = ('[^']+');/.exec(identite)?.[1];
const nom = /export const DEFAULT_IDENTITY: HouseIdentity = \{\s*nom: ('[^']+')/.exec(identite)?.[1];
if (!devise || !nom) throw new Error('La devise ou le nom de la Maison introuvable dans src/shared/identite.ts.');

const dossier = mkdtempSync(path.join(tmpdir(), 'carte-anniv-'));
const profil = mkdtempSync(path.join(tmpdir(), 'carte-anniv-chrome-'));
let chrome; let serveur;
try {
  await build({
    stdin: {
      contents: `import '../src/ds/tokens/fonts.css';
import { dessineLaCarte } from '../src/ds/carte';
import { texteDeLaCarte, texteDeLaCarteSansPrenom } from '../src/shared/cartes';
window.dessine = async (prenom) => {
  const c = document.createElement('canvas');
  await dessineLaCarte(c, prenom == null ? texteDeLaCarteSansPrenom() : texteDeLaCarte({ carte: 'anniversaire', genre: 'femme', prenom }));
  return c.toDataURL('image/png');
};`,
      resolveDir: path.join(racine, 'scripts'), sourcefile: 'carte.ts', loader: 'ts',
    },
    bundle: true, format: 'iife', platform: 'browser', outdir: dossier, entryNames: 'carte', assetNames: '[name]',
    loader: { '.woff2': 'file' }, publicPath: '/', logLevel: 'error',
    define: { 'import.meta.env.BASE_URL': '"/"' },
    plugins: [{
      name: 'doublures',
      setup(b) {
        b.onResolve({ filter: /\/identite$/ }, () => ({ path: 'identite', namespace: 'doublure' }));
        b.onResolve({ filter: /\/rappel$/ }, () => ({ path: 'rappel', namespace: 'doublure' }));
        b.onLoad({ filter: /^identite$/, namespace: 'doublure' }, () => ({
          loader: 'ts',
          contents: `export const DEVISE_COMPLETE = ${devise};\nexport const maisonNom = (): string => ${nom};\nexport const signeLeMessage = (t: string): string => t;`,
        }));
        b.onLoad({ filter: /^rappel$/, namespace: 'doublure' }, () => ({
          loader: 'ts',
          contents: "export const deLaMaison = (n: string): string => (/^(l['’]|le |la |les )/i.test(n.trim()) ? n.trim() : `la ${n.trim()}`);",
        }));
      },
    }],
  });
  writeFileSync(path.join(dossier, 'index.html'), '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/carte.css"><script src="/carte.js"></script>');

  /* Le dossier construit, et public/ pour le monogramme. */
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
  serveur = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const chemin = url === '/' ? '/index.html' : url;
    const f = [path.join(dossier, chemin), path.join(racine, 'public', chemin)].find((x) => existsSync(x));
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const port = serveur.address().port;

  const dbg = 9300 + Math.floor(Math.random() * 500);
  chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
  let cible = null;
  for (let i = 0; i < 60 && !cible; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* Chrome se lève */ }
  }
  if (!cible) throw new Error('Chrome ne répond pas.');
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((ok) => ws.addEventListener('open', ok));
  let id = 0; const enCours = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await cdp('Page.enable');
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/` });
  for (let i = 0; i < 40; i++) {
    const r = await cdp('Runtime.evaluate', { expression: 'typeof window.dessine', returnByValue: true });
    if (r.result?.result?.value === 'function') break;
    await new Promise((ok) => setTimeout(ok, 250));
  }
  const dessine = async (prenom) => {
    const r = await cdp('Runtime.evaluate', { expression: `window.dessine(${JSON.stringify(prenom)})`, awaitPromise: true, returnByValue: true });
    const url = r.result?.result?.value;
    if (typeof url !== 'string' || !url.startsWith('data:image/png;base64,')) throw new Error(`Le dessin a échoué : ${JSON.stringify(r.result?.exceptionDetails ?? r).slice(0, 300)}`);
    return Buffer.from(url.slice('data:image/png;base64,'.length), 'base64');
  };
  /* Les polices réellement prêtes : une carte en Times est une carte fausse. */
  const polices = await cdp('Runtime.evaluate', {
    expression: `(async () => { await window.dessine(null); return ['300 88px "Cormorant Garamond"', '300 29px "Jost"', '400 28px "MND Fon"'].map((f) => document.fonts.check(f)); })()`,
    awaitPromise: true, returnByValue: true,
  });
  if (JSON.stringify(polices.result?.result?.value) !== '[true,true,true]') throw new Error(`Polices pas prêtes : ${JSON.stringify(polices.result?.result?.value)}`);

  if (essai !== null) {
    const f = path.join(tmpdir(), `carte-anniversaire-${essai || 'sans'}.png`);
    writeFileSync(f, await dessine(essai));
    console.log(`Essai à son prénom : ${f}`);
  }
  const png = await dessine(null);
  mkdirSync(path.dirname(CIBLE), { recursive: true });
  writeFileSync(CIBLE, png);
  console.log(`Carte sans prénom : public/assets/cartes/carte-anniversaire.png (${Math.round(png.length / 1024)} Ko, 1080 x 1350).`);
  ws.close();
} finally {
  try { chrome?.kill(); } catch { /* déjà parti */ }
  try { serveur?.close(); } catch { /* déjà fermé */ }
  rmSync(dossier, { recursive: true, force: true });
  setTimeout(() => rmSync(profil, { recursive: true, force: true, maxRetries: 5 }), 800);
}
