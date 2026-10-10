/* LE CACHET COMMERCIAL DE LA MAISON, AVEC SON REGISTRE — 10 octobre 2026.

   `node scripts/fabrique-le-cachet-de-la-maison.mjs --sortie <dossier>`
     écrit <dossier>/cachet.png et <dossier>/cachet-sur-papier.png (aperçu) ;
   `node scripts/fabrique-le-cachet-de-la-maison.mjs --pose`
     écrit public/assets/tampons/mnd-cachet-registre.png, après l'accord.

   La Maison est immatriculée depuis le 9 octobre 2026. Le cachet commercial
   du 6 octobre (mnd-3-cachet.png) ne porte ni RCCM ni IFU, et il ne se
   redessine PAS sur place : une pièce signée du Secrétariat ne garde que la
   CLÉ de son tampon, et l'image est relue à chaque rendu. Redessiner
   l'ancien réécrirait les documents déjà signés. D'où un NOUVEAU fichier,
   sous une nouvelle clé (mnd-cachet-registre).

   Même composition que l'ancien : cadre double indigo, pictogramme à gauche,
   filet cuivre, le nom en Cormorant, le reste en Jost. Le pictogramme est
   pris TEL QUEL (public/assets/vectoriel/pictogramme-indigo.svg), composé,
   jamais redessiné ni déformé. Aucun nom de personne : la décision du
   10 octobre est « juste Maison MND ». Le RCCM et l'IFU viennent du module
   du registre, la seule source.

   Rendu par Chrome sans tête, piloté par son protocole (fond transparent,
   600 px de large, la hauteur mesurée sur la page). Les polices viennent de
   Google Fonts. */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { REGISTRE_MAISON_MND } from '../src/shared/registre.ts';

const racine = path.resolve(import.meta.dirname, '..');
const arg = (nom) => { const i = process.argv.indexOf(nom); return i >= 0 ? process.argv[i + 1] : undefined; };
const pose = process.argv.includes('--pose');
const sortie = arg('--sortie');
if (!pose && !sortie) {
  console.error('Usage : --sortie <dossier> (apercu) ou --pose (fichier du depot).');
  process.exit(2);
}

const INDIGO = '#1E2150';
const CUIVRE = '#B0703C';
const picto = readFileSync(path.join(racine, 'public/assets/vectoriel/pictogramme-indigo.svg'), 'utf8');
const pictoUrl = `data:image/svg+xml;base64,${Buffer.from(picto).toString('base64')}`;
const R = REGISTRE_MAISON_MND;

const page = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500;600&display=block">
<style>
  html, body { margin: 0; background: transparent; }
  .cachet { box-sizing: border-box; width: 600px; padding: 6px; border: 4px solid ${INDIGO}; border-radius: 14px; }
  .dedans { box-sizing: border-box; border: 1.5px solid ${INDIGO}; border-radius: 9px; display: flex; align-items: center; padding: 22px 26px 22px 30px; gap: 26px; }
  .picto { width: 96px; flex: none; display: block; }
  .filet { align-self: stretch; width: 2px; background: ${CUIVRE}; flex: none; }
  .texte { color: ${INDIGO}; font-family: Jost, sans-serif; }
  .nom { font-family: 'Cormorant Garamond', serif; font-weight: 600; font-size: 44px; letter-spacing: .14em; line-height: 1; margin: 0 0 12px; }
  .l { font-size: 16.5px; font-weight: 500; line-height: 1.55; white-space: nowrap; }
  .fort { font-weight: 600; font-size: 17px; }
  .petit { font-size: 14px; font-weight: 400; margin-top: 4px; }
</style></head><body>
<div class="cachet" id="cachet"><div class="dedans">
  <img class="picto" src="${pictoUrl}" alt="">
  <div class="filet"></div>
  <div class="texte">
    <div class="nom">MAISON MND</div>
    <div class="l">Quartier Suru-Léré</div>
    <div class="l">06 BP 2076 · Cotonou, Bénin</div>
    <div class="l fort">RCCM ${R.rccm}</div>
    <div class="l fort">IFU ${R.ifu}</div>
    <div class="l">Tél. et WhatsApp : +229 01 51 99 77 99</div>
    <div class="l petit">contact@maisonmnd.com · maisonmnd.com</div>
  </div>
</div></div>
</body></html>`;

const travail = mkdtempSync(path.join(tmpdir(), 'cachet-maison-'));
const profil = path.join(travail, 'profil');
const html = path.join(travail, 'cachet.html');
writeFileSync(html, page);
const dbg = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let cible;
  for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
  if (!cible) throw new Error('Chrome ne repond pas.');
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const enCours = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); } });
  const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await cdp('Emulation.setDeviceMetricsOverride', { width: 700, height: 600, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await cdp('Page.navigate', { url: pathToFileURL(html).href });
  await attend(1500);
  const pret = await evalue(`document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family).join(','))`);
  const boite = await evalue(`(() => { const r = document.getElementById('cachet').getBoundingClientRect(); return { x: r.left, y: r.top, l: r.width, h: r.height }; })()`);
  const img = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: boite.x, y: boite.y, width: boite.l, height: Math.ceil(boite.h), scale: 1 } });
  const png = Buffer.from(img.result.data, 'base64');
  ws.close();
  const { width, height } = await sharp(png).metadata();
  console.log(`polices chargees : ${pret || 'AUCUNE'}`);
  console.log(`cachet : ${width} x ${height} (ratio 600 / ${height})`);
  if (!/Cormorant/.test(pret ?? '') || !/Jost/.test(pret ?? '')) throw new Error('Les polices ne sont pas arrivees : rien n est ecrit.');
  if (pose) {
    const f = path.join(racine, 'public/assets/tampons/mnd-cachet-registre.png');
    writeFileSync(f, png);
    console.log('ecrit :', path.relative(racine, f));
  } else {
    mkdirSync(sortie, { recursive: true });
    writeFileSync(path.join(sortie, 'cachet.png'), png);
    /* Sur une feuille ivoire, l'encre un peu passée, comme sur le papier. */
    const encre = await sharp(png).ensureAlpha(0.85).composite([{ input: Buffer.from([255, 255, 255, Math.round(255 * 0.85)]), raw: { width: 1, height: 1, channels: 4 }, tile: true, blend: 'dest-in' }]).png().toBuffer();
    await sharp({ create: { width: width + 80, height: height + 80, channels: 4, background: '#F6F1E7' } })
      .composite([{ input: encre, left: 40, top: 40 }]).png().toFile(path.join(sortie, 'cachet-sur-papier.png'));
    console.log('ecrit :', path.join(sortie, 'cachet.png'), 'et cachet-sur-papier.png');
  }
} finally {
  chrome.kill();
  await attend(800);
  try { rmSync(travail, { recursive: true, force: true }); } catch { /* libere apres */ }
}
