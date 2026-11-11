/* LE QR DU COMPTOIR, « RÉGLER PAR MTN » — `node scripts/fabrique-le-qr-du-comptoir.mjs <dossier> [--adresse <url>]`.

   11 novembre 2026, maquette « Régler par MTN, QR » (AdAaYXGStQetsXHFkZzUW5),
   vue « Le QR du comptoir (A5) ». Un QR FIXE : il ouvre la page « Régler »
   en mode comptoir (regler.html?comptoir), où la cliente tape son numéro
   MTN et retrouve son rendez-vous du jour. Il ne porte ni montant, ni
   numéro de compte : il sert tous les jours, à toutes les clientes.

   AUCUN DOMAINE EN DUR (dépôt public) : l'adresse se lit comme la carte de
   lien (build-sites.mjs), depuis l'origine du dépôt et la configuration
   Pages du compte (`origine-des-pages.mjs`). `--adresse` la remplace (essai).

   À imprimer seulement APRÈS l'essai de 100 F et l'ouverture du règlement
   par MTN au Trône : avant, la page dit « ouvre bientôt ».

   Il écrit, dans le dossier donné : A5.pdf et A5.png (indigo, comme la
   maquette), A5-ivoire.pdf et A5-ivoire.png, et adresse.txt (ce que le QR
   ouvre, à scanner une fois avant d'imprimer). Les polices viennent de la
   construction du site (`node scripts/build-sites.mjs` d'abord). */
import { execSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { origineDuCompte } from './origine-des-pages.mjs';

const DEPOT = path.resolve(import.meta.dirname, '..').split(path.sep).join('/');
const require = createRequire(DEPOT + '/package.json');
const qrcode = require('qrcode-generator');
const args = process.argv.slice(2);
const iAdresse = args.indexOf('--adresse');
const SORTIE = path.resolve(args.find((a, i) => !a.startsWith('--') && i !== iAdresse + 1) || path.join(tmpdir(), 'qr-du-comptoir'));
mkdirSync(SORTIE, { recursive: true });

/* L'adresse de la page du comptoir : l'origine des sites, puis le Trône. */
function origineDesPages() {
  try {
    const url = execSync('git remote get-url origin', { cwd: DEPOT, encoding: 'utf8' }).trim();
    const m = url.match(/[/:]([^/:]+)\/[^/]+?(?:\.git)?$/);
    return m ? origineDuCompte(m[1]) : '';
  } catch {
    return '';
  }
}
const CHEMIN_DU_COMPTOIR = '/trone/regler.html?comptoir';
const ADRESSE = iAdresse >= 0 ? args[iAdresse + 1] : `${origineDesPages()}${CHEMIN_DU_COMPTOIR}`;
if (!/^https:\/\/[^/]+\/.+\?comptoir$/.test(ADRESSE)) throw new Error(`adresse du comptoir illisible : ${ADRESSE}`);
const ADRESSE_DITE = ADRESSE.replace(/^https:\/\//, '');
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

/* Le QR, en modules carrés indigo, sans marge (la carte blanche fait la marge). */
function qrSvg(donnee, couleur = '#15173A') {
  const q = qrcode(0, 'M');
  q.addData(donnee);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path fill="${couleur}" d="${d}"/></svg>`;
}
const verrou = (teinte) => readFileSync(`${DEPOT}/public/assets/vectoriel/verrou-couche-${teinte}.svg`, 'utf8').replace(/<\?xml[^>]*>/, '');

/* Les polices de la construction du site, retrouvées par leur nom (le suffixe change à chaque construction). */
const ASSETS = `${DEPOT}/dist-sites/revelateur/assets`;
let fichiers = [];
try { fichiers = readdirSync(ASSETS); } catch { throw new Error('Construisez le site d’abord : node scripts/build-sites.mjs'); }
/* Le jeu latin de base d'abord, puis l'étendu (`-ext-`) : chacun sa plage. */
const police = (debut, etendu = false) => {
  const f = fichiers.find((x) => x.startsWith(debut) && x.endsWith('.woff2') && x.includes('-ext-') === etendu);
  return f ? pathToFileURL(`${ASSETS}/${f}`).href : '';
};
const BASE = 'unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215;';
const FONTES = `
@font-face { font-family: 'Cormorant'; src: url('${police('cormorant-latin-')}') format('woff2'); font-weight: 300 700; ${BASE} }
@font-face { font-family: 'Cormorant'; src: url('${police('cormorant-latin-', true)}') format('woff2'); font-weight: 300 700; unicode-range: U+0100-02AF, U+1E00-1EFF; }
@font-face { font-family: 'Jost'; src: url('${police('jost-latin-')}') format('woff2'); font-weight: 300 700; ${BASE} }
@font-face { font-family: 'Jost'; src: url('${police('jost-latin-', true)}') format('woff2'); font-weight: 300 700; unicode-range: U+0100-02AF, U+1E00-1EFF; }
@font-face { font-family: 'Devise'; src: url('${police('devise-fon-')}') format('woff2'); }
`;

/* La charte : indigo (la maquette) ou ivoire ; jamais obsidienne. Le QR reste foncé sur blanc dans sa carte. */
const THEMES = {
  indigo: { css: ':root { --fond: #1E2150; --encre: #F6F1E7; --accent: #E4BE9C; --doux: #D3D5E5; --pied: #A7ACC9; --filet: rgba(246, 241, 231, .24); }', verrou: 'ivoire' },
  ivoire: { css: ':root { --fond: #F6F1E7; --encre: #1E2150; --accent: #9A6036; --doux: #2C3470; --pied: #4E5790; --filet: #E7D7C2; }', verrou: 'indigo' },
};

const page = (theme) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FONTES}${THEMES[theme].css}
@page { size: 148mm 210mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--fond); color: var(--encre); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { width: 148mm; height: 210mm; }
.page { position: relative; width: 100%; height: 100%; padding: 14mm 12mm 10mm; display: flex; flex-direction: column; align-items: center; gap: 5.2mm; text-align: center; }
.page::before { content: ''; position: absolute; inset: 6mm; border: .35mm solid var(--filet); pointer-events: none; }
.verrou { width: 52mm; } .verrou svg { width: 100%; height: auto; display: block; }
.sur { font: 400 3.1mm/1.2 'Jost', sans-serif; letter-spacing: .3em; text-transform: uppercase; color: var(--accent); }
.carte { background: #FFFFFF; border-radius: 3mm; padding: 6mm; display: grid; place-items: center; }
.carte svg { width: 62mm; height: 62mm; display: block; }
.titre { font: 500 7mm/1.2 'Cormorant', serif; color: var(--encre); }
.note { font: 300 3.7mm/1.5 'Jost', sans-serif; color: var(--doux); max-width: 110mm; }
.pied { margin-top: auto; font: 300 2.9mm/1.5 'Jost', sans-serif; color: var(--pied); }
.devise { font: italic 400 3.6mm/1.2 'Devise', 'Cormorant', serif; color: var(--accent); }
</style></head><body><div class="page">
  <div class="verrou">${verrou(THEMES[theme].verrou)}</div>
  <p class="sur">Réglez votre rituel</p>
  <div class="carte">${qrSvg(ADRESSE)}</div>
  <h1 class="titre">Scannez, tapez votre numéro MTN,<br>validez sur votre téléphone.</h1>
  <p class="note">Le montant de votre rendez-vous s’affiche tout seul. Aucun frais pour vous.</p>
  <p class="pied">${ADRESSE_DITE}<br>Moov, Celtiis, carte : à l’accueil, ou par votre lien « Régler ».</p>
  <p class="devise">${DEVISE}</p>
</div></body></html>`;

const PAGES = [
  { nom: 'A5', html: page('indigo') },
  { nom: 'A5-ivoire', html: page('ivoire') },
];
for (const p of PAGES) writeFileSync(path.join(SORTIE, `${p.nom}.html`), p.html);
writeFileSync(path.join(SORTIE, 'adresse.txt'), `${ADRESSE}\n`);

/* Chrome sans tête : PDF pour l'impression, PNG pour l'aperçu. */
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'qr-comptoir-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let cible;
for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const enCours = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await cdp('Page.enable');
for (const p of PAGES) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 560, height: 794, deviceScaleFactor: 2, mobile: false });
  await cdp('Page.navigate', { url: pathToFileURL(path.join(SORTIE, `${p.nom}.html`)).href });
  await attend(1800);
  await cdp('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
  const r = await cdp('Page.printToPDF', { paperWidth: 5.83, paperHeight: 8.27, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, printBackground: true, preferCSSPageSize: true });
  writeFileSync(path.join(SORTIE, `${p.nom}.pdf`), Buffer.from(r.result.data, 'base64'));
  const img = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 560, height: 794, scale: 1 } });
  writeFileSync(path.join(SORTIE, `${p.nom}.png`), Buffer.from(img.result.data, 'base64'));
  console.log('fait', p.nom);
}
ws.close(); chrome.kill();
console.log('Le QR ouvre :', ADRESSE);
