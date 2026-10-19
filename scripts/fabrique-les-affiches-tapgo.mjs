/* LES AFFICHES TAP & GO DE LA MAISON — `node scripts/fabrique-les-affiches-tapgo.mjs <dossier>`.

   19 octobre 2026. « Fais-moi une affiche pour la Maison MND avec le Tap
   and Go de FedaPay, je veux l'envoyer aux clientes » (Yéman). Une affiche
   qu'on ENVOIE se lit sur le téléphone de la cliente : un QR n'y sert à
   rien (on ne scanne pas son propre écran), le numéro à composer fait tout.
   Deux formats d'écran : le carré 1080 (image WhatsApp) et le statut
   1080 × 1920 ; les deux fonds de la charte, ivoire et indigo, comme les
   affiches MoMoPay. Jamais de prix (une campagne n'en porte pas) : la
   cliente compose la somme que la Maison lui indique.

   Le code vient de la règle (`shared/mnd-pay-pur.ts`, lu dans le texte du
   module), le verrou de `public/assets/vectoriel`, les polices de la
   construction du site (`node scripts/build-sites.mjs` d'abord).

   Il écrit, dans le dossier donné : carre.png, carre-indigo.png,
   statut.png, statut-indigo.png. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEPOT = path.resolve(import.meta.dirname, '..').split(path.sep).join('/');
const SORTIE = path.resolve(process.argv[2] || path.join(tmpdir(), 'affiches-tapgo'));
mkdirSync(SORTIE, { recursive: true });

/* Les valeurs, lues dans la règle (une seule vérité). */
const REGLE = readFileSync(`${DEPOT}/src/shared/mnd-pay-pur.ts`, 'utf8');
const lis = (nom) => { const m = new RegExp(`export const ${nom} = '([^']+)'`).exec(REGLE); if (!m) throw new Error(`${nom} introuvable dans la règle`); return m[1]; };
const CODE = lis('CODE_TAPGO_DEFAUT');
const PREFIXE = lis('PREFIXE_USSD_TAPGO');
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';
const ussdHtml = `${PREFIXE}<b>${CODE}</b>*<i>MONTANT</i>#`;

const verrou = (teinte) => readFileSync(`${DEPOT}/public/assets/vectoriel/verrou-couche-${teinte}.svg`, 'utf8').replace(/<\?xml[^>]*>/, '');
/* Les polices de la construction : leurs noms portent une empreinte, on les cherche. */
const ASSETS = `${DEPOT}/dist-sites/revelateur/assets`;
const fichiers = readdirSync(ASSETS);
const police = (debut) => {
  /* « cormorant-latin- » ne doit pas prendre « cormorant-latin-ext- ». */
  const f = fichiers.find((n) => n.startsWith(debut) && n.endsWith('.woff2') && (debut.includes('-ext-') || !n.startsWith(`${debut}ext-`)));
  if (!f) throw new Error(`police ${debut} absente : node scripts/build-sites.mjs d'abord`);
  return pathToFileURL(`${ASSETS}/${f}`).href;
};
const FONTES = `
@font-face { font-family: 'Cormorant'; src: url('${police('cormorant-latin-')}') format('woff2'); font-weight: 300 700; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'Cormorant'; src: url('${police('cormorant-latin-ext-')}') format('woff2'); font-weight: 300 700; }
@font-face { font-family: 'Cormorant'; font-style: italic; src: url('${police('cormorant-italique-latin-')}') format('woff2'); font-weight: 300 700; }
@font-face { font-family: 'Jost'; src: url('${police('jost-latin-')}') format('woff2'); font-weight: 300 700; }
@font-face { font-family: 'Jost'; src: url('${police('jost-latin-ext-')}') format('woff2'); font-weight: 300 700; unicode-range: U+0100-02AF, U+1E00-1EFF; }
@font-face { font-family: 'Devise'; src: url('${police('devise-fon-')}') format('woff2'); }
`;
/* La charte : ivoire pour le fond, indigo pour l'encre, cuivre pour les filets ; jamais obsidienne. */
const THEMES = {
  ivoire: { css: ':root { --fond: #F6F1E7; --encre: #1E2150; --accent: #9A6036; --filet: #E7D7C2; --doux: #5E5750; --voile: #FFFDF9; --rond: #1E2150; --rond-texte: #F6F1E7; }', verrou: 'indigo' },
  indigo: { css: ':root { --fond: #1E2150; --encre: #F6F1E7; --accent: #D6A06F; --filet: rgba(246, 241, 231, .24); --doux: #C9C4D6; --voile: rgba(246, 241, 231, .07); --rond: #D6A06F; --rond-texte: #1E2150; }', verrou: 'ivoire' },
};
const COMMUN = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--fond); color: var(--encre); }
.page { position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; }
.page::before { content: ''; position: absolute; inset: 30px; border: 1.5px solid var(--filet); pointer-events: none; }
.verrou svg { width: 100%; height: auto; display: block; }
.sur { font: 400 17px/1.2 'Jost', sans-serif; letter-spacing: .32em; text-transform: uppercase; color: var(--accent); }
.titre { font: 300 92px/1 'Cormorant', serif; color: var(--encre); }
.reseaux { font: 300 24px/1.3 'Jost', sans-serif; color: var(--doux); letter-spacing: .02em; }
.numero { font: 400 58px/1 'Jost', sans-serif; letter-spacing: .03em; color: var(--encre); background: var(--voile); border: 1.5px solid var(--filet); border-radius: 22px; padding: 30px 34px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.numero b { font-weight: 500; color: var(--accent); }
.numero i { font-style: normal; font-weight: 500; letter-spacing: .06em; }
.etiquette { font: 400 15px/1.2 'Jost', sans-serif; letter-spacing: .28em; text-transform: uppercase; color: var(--accent); }
.pas { display: grid; gap: 22px; text-align: left; }
.pas li { list-style: none; display: grid; grid-template-columns: 54px 1fr; gap: 20px; align-items: center; font: 300 28px/1.35 'Jost', sans-serif; color: var(--encre); }
.pas li span { width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center; background: var(--rond); color: var(--rond-texte); font: 500 24px/1 'Jost', sans-serif; }
.pas b { font-weight: 500; }
.pas p { text-wrap: balance; }
.filet { width: 120px; height: 1.5px; background: var(--accent); }
.par { font: 300 19px/1.3 'Jost', sans-serif; color: var(--doux); letter-spacing: .04em; }
.devise { font: italic 400 30px/1.2 'Devise', 'Cormorant', serif; color: var(--accent); }
`;
const PAS = `<ol class="pas">
  <li><span>1</span><p>Composez ce numéro sur votre téléphone.</p></li>
  <li><span>2</span><p>Remplacez <b>MONTANT</b> par la somme que la Maison vous indique, sans espace.</p></li>
  <li><span>3</span><p>Confirmez avec votre code secret Mobile Money.</p></li>
</ol>`;

/* LE CARRÉ 1080 (l'image qu'on envoie sur WhatsApp). */
const carre = (theme) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FONTES}${THEMES[theme].css}${COMMUN}
body { width: 1080px; height: 1080px; }
.page { width: 1080px; height: 1080px; padding: 74px 90px 62px; justify-content: space-between; }
.verrou { width: 250px; }
.tete { display: grid; gap: 14px; justify-items: center; }
.titre { font-size: 84px; }
.numero { font-size: 54px; }
.pas li { font-size: 26px; grid-template-columns: 48px 1fr; } .pas li span { width: 48px; height: 48px; font-size: 22px; }
.bas { display: grid; gap: 12px; justify-items: center; }
.devise { font-size: 27px; }
</style></head><body><div class="page">
  <div class="verrou">${verrou(THEMES[theme].verrou)}</div>
  <div class="tete"><p class="sur">Régler votre rituel</p><h1 class="titre">Par Mobile Money</h1><p class="reseaux">Tout réseau · sans internet · même sans smartphone</p></div>
  <p class="numero">${ussdHtml}</p>
  ${PAS}
  <div class="bas"><p class="par">Paiement Tap &amp; Go de FedaPay · Maison MND</p><p class="devise">${DEVISE}</p></div>
</div></body></html>`;

/* LE STATUT 1080 × 1920 (le statut WhatsApp, l'histoire Instagram). */
const statut = (theme) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FONTES}${THEMES[theme].css}${COMMUN}
body { width: 1080px; height: 1920px; }
.page { width: 1080px; height: 1920px; padding: 150px 96px 130px; justify-content: space-between; }
.page::before { inset: 40px; }
.verrou { width: 330px; }
.tete { display: grid; gap: 22px; justify-items: center; }
.sur { font-size: 20px; }
.titre { font-size: 116px; }
.reseaux { font-size: 30px; }
.bloc { display: grid; gap: 26px; justify-items: center; }
.numero { font-size: 60px; padding: 38px 40px; }
.pas { gap: 34px; }
.pas li { font-size: 34px; grid-template-columns: 64px 1fr; gap: 26px; } .pas li span { width: 64px; height: 64px; font-size: 28px; }
.bas { display: grid; gap: 18px; justify-items: center; }
.par { font-size: 23px; }
.devise { font-size: 36px; }
</style></head><body><div class="page">
  <div class="verrou">${verrou(THEMES[theme].verrou)}</div>
  <div class="tete"><p class="sur">Régler votre rituel</p><h1 class="titre">Par Mobile<br>Money</h1><p class="reseaux">Tout réseau · sans internet<br>même sans smartphone</p></div>
  <div class="bloc"><p class="etiquette">Composez</p><p class="numero">${ussdHtml}</p></div>
  ${PAS}
  <div class="filet"></div>
  <div class="bas"><p class="par">Paiement Tap &amp; Go de FedaPay · Maison MND</p><p class="devise">${DEVISE}</p></div>
</div></body></html>`;

const PAGES = [];
for (const theme of Object.keys(THEMES)) {
  const suffixe = theme === 'ivoire' ? '' : `-${theme}`;
  PAGES.push({ nom: `carre${suffixe}`, html: carre(theme), l: 1080, h: 1080 }, { nom: `statut${suffixe}`, html: statut(theme), l: 1080, h: 1920 });
}
for (const p of PAGES) writeFileSync(path.join(SORTIE, `${p.nom}.html`), p.html);

const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'affiches-tapgo-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let cible;
for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
if (!cible) { console.error('Chrome ne repond pas.'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const enCours = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
await cdp('Page.enable');
for (const p of PAGES) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: p.l, height: p.h, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: pathToFileURL(path.join(SORTIE, `${p.nom}.html`)).href });
  await attend(1500);
  await cdp('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
  /* Rien ne doit dépasser du cadre : on le mesure avant de photographier. */
  const deborde = (await cdp('Runtime.evaluate', { expression: `(() => { const n = document.querySelector('.numero').getBoundingClientRect(); return document.documentElement.scrollHeight > ${p.h} || n.right > ${p.l} - 40 || n.left < 40; })()`, returnByValue: true })).result?.result?.value;
  if (deborde) console.log('ATTENTION : ça dépasse dans', p.nom);
  const img = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: p.l, height: p.h, scale: 1 } });
  writeFileSync(path.join(SORTIE, `${p.nom}.png`), Buffer.from(img.result.data, 'base64'));
  console.log('fait', p.nom);
}
ws.close(); chrome.kill();
console.log(`Numéro : ${PREFIXE}${CODE}*MONTANT#`);
