/* LES AFFICHES KKIAPAY DE LA MAISON — `node scripts/fabrique-les-affiches-kkiapay.mjs <dossier>`.

   23 octobre 2026. « Redessine le QR code dans les paiements Kkiapay pour MND
   avec le code USSD » (Yéman), d'après l'affiche bleue « Scannez le QR code et
   payez Chap Chap » collée au comptoir. Son QR a été LU sur la photo (pas
   recopié à l'œil) : il ouvre la page de paiement Chap Chap dont le marchand
   s'affiche « MND » (« Direct payment link for MND »), MTN MoMo, Moov Money et
   Celtiis Cash. Le QR est refait à l'identique de contenu ; le 23 octobre,
   les huit rendus ont été relus par un lecteur de QR (zxing-cpp) et disaient
   tous ce même lien. Refaire cette relecture avant toute réimpression.

   Même charte et mêmes formats que les affiches MoMoPay
   (fabrique-les-affiches-momopay.mjs) : A3 mur, A4 comptoir, A5 chevalet (une
   A4 pliée en deux), carré 1080, en ivoire et en indigo. Polices de la
   construction du site (`node scripts/build-sites.mjs` d'abord).

   Il écrit aussi A4-ecran.png (deux fois plus fin), que le Trône montre comme
   affiche au comptoir (`public/kkiapay-affiche.png`).

   24 octobre 2026 : le titre dit « Par KkiaPay », plus « Par Mobile Money » :
   « corriger le nom en KkiaPay partout » (Yéman), MoMoPay est aussi du
   Mobile Money. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const DEPOT = path.resolve(import.meta.dirname, '..').split(path.sep).join('/');
const require = createRequire(DEPOT + '/package.json');
const qrcode = require('qrcode-generator');
const SORTIE = path.resolve(process.argv[2] || path.join(tmpdir(), 'affiches-kkiapay'));
mkdirSync(SORTIE, { recursive: true });

/* Les valeurs du paiement, lues dans la règle (une seule vérité) :
   `shared/kkiapay-chapchap-pur.ts`, lues sur l'affiche KkiaPay du comptoir. */
const REGLE = readFileSync(`${DEPOT}/src/shared/kkiapay-chapchap-pur.ts`, 'utf8');
const lis = (nom) => { const m = new RegExp(`export const ${nom} = '([^']+)'`).exec(REGLE); if (!m) throw new Error(`${nom} introuvable dans la règle`); return m[1]; };
const LIEN_CHAPCHAP = lis('LIEN_CHAPCHAP');
const CODE = lis('CODE_CHAPCHAP');
const USSD = `*616*41*${CODE}*montant#`;
if (!REGLE.includes('export const USSD_CHAPCHAP = `*616*41*${CODE_CHAPCHAP}*montant#`;')) throw new Error('le code USSD de la règle a changé de forme : relire la fabrique');
const NOM = lis('MARCHAND_CHAPCHAP');
const RESEAUX = JSON.parse((/export const RESEAUX_CHAPCHAP = (\[[^\]]+\])/.exec(REGLE) ?? [])[1]?.replace(/'/g, '"') ?? 'null');
if (!Array.isArray(RESEAUX) || RESEAUX.length === 0) throw new Error('RESEAUX_CHAPCHAP introuvable dans la règle');
const DEVISE = 'mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là';

/* Le QR, en modules carrés indigo, sans marge (la carte blanche fait la marge).
   Niveau M, celui de l'affiche d'origine. */
function qrSvg(donnee, couleur = '#1E2150') {
  const q = qrcode(0, 'M');
  q.addData(donnee);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path fill="${couleur}" d="${d}"/></svg>`;
}
const verrou = (sorte, teinte) => readFileSync(`${DEPOT}/public/assets/vectoriel/verrou-${sorte}-${teinte}.svg`, 'utf8').replace(/<\?xml[^>]*>/, '');
const police = (f) => pathToFileURL(`${DEPOT}/dist-sites/revelateur/assets/${f}`).href;

const FONTES = `
@font-face { font-family: 'Cormorant'; src: url('${police('cormorant-latin-CUoBjw-S.woff2')}') format('woff2'); font-weight: 300 700; unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215; }
@font-face { font-family: 'Cormorant'; src: url('${police('cormorant-latin-ext-ltf1AbuM.woff2')}') format('woff2'); font-weight: 300 700; }
@font-face { font-family: 'Cormorant'; font-style: italic; src: url('${police('cormorant-italique-latin-C-nL33vl.woff2')}') format('woff2'); font-weight: 300 700; }
@font-face { font-family: 'Jost'; src: url('${police('jost-latin-ObQm3Zd1.woff2')}') format('woff2'); font-weight: 300 700; }
@font-face { font-family: 'Jost'; src: url('${police('jost-latin-ext-BDUtSsKd.woff2')}') format('woff2'); font-weight: 300 700; unicode-range: U+0100-02AF, U+1E00-1EFF; }
@font-face { font-family: 'Devise'; src: url('${police('devise-fon-DX3P0bG4.woff2')}') format('woff2'); }
`;
/* La charte : ivoire pour le fond, indigo pour l'encre, cuivre pour les filets ; jamais obsidienne. */
const CHARTE = `
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--fond); color: var(--encre); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sur { font: 400 calc(var(--k) * 3.4mm)/1.2 'Jost', sans-serif; letter-spacing: .32em; text-transform: uppercase; color: var(--accent); }
.titre { font: 300 calc(var(--k) * 15mm)/1 'Cormorant', serif; color: var(--encre); }
.reseaux { font: 400 calc(var(--k) * 3.6mm)/1.2 'Jost', sans-serif; letter-spacing: .2em; text-transform: uppercase; color: var(--encre); }
.reseaux i { font-style: normal; color: var(--accent); padding: 0 .5em; }
.carte-qr { background: #FFFFFF; border: calc(var(--k) * .35mm) solid var(--filet); border-radius: calc(var(--k) * 3mm); display: grid; place-items: center; }
.carte-qr svg { display: block; }
.etiquette { font: 400 calc(var(--k) * 3mm)/1.2 'Jost', sans-serif; letter-spacing: .28em; text-transform: uppercase; color: var(--accent); }
.filet { width: calc(var(--k) * 26mm); height: calc(var(--k) * .35mm); background: var(--accent); }
.ussd { font: 400 calc(var(--k) * 7mm)/1 'Jost', sans-serif; letter-spacing: .06em; color: var(--encre); background: var(--voile); border: calc(var(--k) * .3mm) solid var(--filet); border-radius: 999px; padding: calc(var(--k) * 3.4mm) calc(var(--k) * 7.5mm); white-space: nowrap; font-variant-numeric: tabular-nums; }
.ussd b { font-weight: 500; color: var(--accent); }
.note { font: 300 calc(var(--k) * 3.6mm)/1.45 'Jost', sans-serif; color: var(--doux); text-align: center; }
.garant { font: 300 calc(var(--k) * 2.8mm)/1.2 'Jost', sans-serif; letter-spacing: .18em; text-transform: uppercase; color: var(--doux); }
.devise { font: italic 400 calc(var(--k) * 5mm)/1.2 'Devise', 'Cormorant', serif; color: var(--accent); }
`;
const ussdHtml = USSD.replace(CODE, `<b>${CODE}</b>`);
const reseauxHtml = RESEAUX.join('<i>·</i>');

/* DEUX FONDS, TOUS DEUX DE LA CHARTE, comme MoMoPay : l'ivoire, encre indigo ;
   l'indigo, encre ivoire et cuivre clair. Le QR reste foncé sur blanc dans sa
   carte : un QR clair sur fond sombre se lit mal. */
const THEMES = {
  ivoire: { css: ':root { --fond: #F6F1E7; --encre: #1E2150; --accent: #9A6036; --filet: #E7D7C2; --doux: #5E5750; --voile: #FAF1E9; }', verrou: 'indigo' },
  indigo: { css: ':root { --fond: #1E2150; --encre: #F6F1E7; --accent: #D6A06F; --filet: rgba(246, 241, 231, .24); --doux: #C9C4D6; --voile: rgba(246, 241, 231, .08); }', verrou: 'ivoire' },
};

/* LE PORTRAIT (A4, A3 : la même page, à l'échelle --k). Le QR est la vedette :
   un appareil photo suffit, le lien ouvre la page de paiement MND. */
const portrait = (k, page, theme = 'ivoire') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FONTES}${CHARTE}${THEMES[theme].css}
@page { size: ${page}; margin: 0; }
body { --k: ${k}; width: calc(var(--k) * 210mm); height: calc(var(--k) * 297mm); }
.page { position: relative; width: 100%; height: 100%; padding: calc(var(--k) * 17mm) calc(var(--k) * 18mm) calc(var(--k) * 15mm); display: flex; flex-direction: column; align-items: center; justify-content: space-between; text-align: center; }
.page::before { content: ''; position: absolute; inset: calc(var(--k) * 8mm); border: calc(var(--k) * .35mm) solid var(--filet); pointer-events: none; }
.verrou { width: calc(var(--k) * 62mm); }
.verrou svg { width: 100%; height: auto; display: block; }
.tete { display: grid; gap: calc(var(--k) * 4mm); justify-items: center; }
.carte-qr { width: calc(var(--k) * 92mm); height: calc(var(--k) * 92mm); }
.carte-qr svg { width: calc(var(--k) * 76mm); height: calc(var(--k) * 76mm); }
.bloc { display: grid; gap: calc(var(--k) * 3mm); justify-items: center; }
.qr { display: grid; gap: calc(var(--k) * 3.4mm); justify-items: center; }
</style></head><body><div class="page">
  <div class="verrou">${verrou('couche', THEMES[theme].verrou)}</div>
  <div class="tete"><p class="sur">Régler votre rituel</p><h1 class="titre">Par KkiaPay</h1><p class="reseaux">${reseauxHtml}</p></div>
  <div class="qr"><div class="carte-qr">${qrSvg(LIEN_CHAPCHAP)}</div><p class="etiquette">Scannez avec l’appareil photo</p><p class="note">La page de paiement s’ouvre au nom de ${NOM} :<br>saisissez le montant en francs, puis validez.</p></div>
  <div class="filet"></div>
  <div class="bloc"><p class="etiquette">Sans appareil photo, composez</p><p class="ussd">${ussdHtml}</p><p class="note">Remplacez « montant » par la somme en francs, puis validez.</p></div>
  <div class="bloc"><p class="garant">Paiement sécurisé par KkiaPay</p><p class="devise">${DEVISE}</p></div>
</div></body></html>`;

/* LE CHEVALET : une feuille A4 pliée en deux, deux faces A5 couchées, celle du haut à l'envers. */
const face = (theme) => `<div class="face">
  <div class="gauche"><div class="carte-qr">${qrSvg(LIEN_CHAPCHAP)}</div><p class="etiquette">Scannez avec l’appareil photo</p></div>
  <div class="droite">
    <div class="verrou">${verrou('couche', THEMES[theme].verrou)}</div>
    <h2 class="titre">Par KkiaPay</h2>
    <p class="reseaux">${reseauxHtml}</p>
    <div class="bloc"><p class="etiquette">Sans appareil photo</p><p class="ussd">${ussdHtml}</p></div>
    <p class="garant">Paiement sécurisé par KkiaPay</p>
  </div>
</div>`;
const chevalet = (theme = 'ivoire') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FONTES}${CHARTE}${THEMES[theme].css}
@page { size: A4; margin: 0; }
body { --k: .74; width: 210mm; height: 297mm; display: grid; grid-template-rows: 148.5mm 148.5mm; }
.moitie { position: relative; display: grid; place-items: center; }
.moitie--haut { transform: rotate(180deg); }
.moitie--haut::after { content: ''; position: absolute; left: 0; right: 0; top: 0; border-top: .3mm dashed var(--filet); }
.pli { position: absolute; left: 6mm; top: 145mm; font: 300 2.6mm 'Jost', sans-serif; color: var(--doux); letter-spacing: .2em; text-transform: uppercase; }
.face { width: 190mm; height: 128mm; border: .35mm solid var(--filet); display: grid; grid-template-columns: 82mm 1fr; align-items: center; gap: 10mm; padding: 10mm 12mm; }
.gauche { display: grid; gap: 3mm; justify-items: center; }
.carte-qr { width: 76mm; height: 76mm; }
.carte-qr svg { width: 64mm; height: 64mm; }
.droite { display: grid; gap: 5.4mm; justify-items: start; text-align: left; }
.verrou { width: 52mm; } .verrou svg { width: 100%; height: auto; display: block; }
.titre { font-size: 12.5mm; }
.reseaux { font-size: 3.1mm; letter-spacing: .14em; }
.reseaux i { padding: 0 .35em; }
.bloc { display: grid; gap: 2mm; justify-items: start; }
.ussd { font-size: 5.2mm; padding: 2.6mm 5.4mm; }
</style></head><body>
<div class="moitie moitie--haut">${face(theme)}</div>
<div class="moitie">${face(theme)}</div>
<p class="pli">Plier ici</p>
</body></html>`;

/* LE CARRÉ 1080 (WhatsApp, Instagram). */
const carre = (theme = 'ivoire') => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>${FONTES}${CHARTE}${THEMES[theme].css}
body { --k: 1; width: 1080px; height: 1080px; }
.page { position: relative; width: 1080px; height: 1080px; padding: 70px 80px 62px; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr auto; column-gap: 56px; }
.page::before { content: ''; position: absolute; inset: 30px; border: 1.5px solid var(--filet); }
.haut { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; }
.verrou { width: 250px; } .verrou svg { width: 100%; height: auto; display: block; }
.sur { font-size: 15px; }
.gauche { display: grid; align-content: center; justify-items: center; gap: 16px; }
.carte-qr { width: 430px; height: 430px; border-width: 1.5px; border-radius: 14px; }
.carte-qr svg { width: 360px; height: 360px; }
.etiquette { font-size: 13px; }
.droite { display: grid; align-content: center; gap: 30px; }
.titre { font-size: 70px; }
.reseaux { font-size: 15px; letter-spacing: .14em; }
.reseaux i { padding: 0 .35em; }
.bloc { display: grid; gap: 12px; }
.ussd { font-size: 27px; padding: 15px 28px; justify-self: start; }
.garant { font-size: 12px; }
.devise { grid-column: 1 / -1; text-align: center; font-size: 24px; align-self: end; }
</style></head><body><div class="page">
  <div class="haut"><div class="verrou">${verrou('couche', THEMES[theme].verrou)}</div><p class="sur">Régler votre rituel</p></div>
  <div class="gauche"><div class="carte-qr">${qrSvg(LIEN_CHAPCHAP)}</div><p class="etiquette">Scannez avec l’appareil photo</p></div>
  <div class="droite">
    <div class="bloc"><h1 class="titre">Par KkiaPay</h1><p class="reseaux">${reseauxHtml}</p></div>
    <div class="bloc"><p class="etiquette">Sans appareil photo, composez</p><p class="ussd">${ussdHtml}</p></div>
    <p class="garant">Paiement sécurisé par KkiaPay</p>
  </div>
  <p class="devise">${DEVISE}</p>
</div></body></html>`;

const PAGES = [
  /* L'écran du Trône montre l'ivoire. */
  { nom: 'A4-ecran', html: portrait(1, 'A4'), apercu: { l: 794, h: 1123 }, finesse: 2 },
];
for (const theme of Object.keys(THEMES)) {
  const suffixe = theme === 'ivoire' ? '' : `-${theme}`;
  PAGES.push(
    { nom: `A4${suffixe}`, html: portrait(1, 'A4', theme), pdf: { paperWidth: 8.27, paperHeight: 11.69 }, apercu: { l: 794, h: 1123 } },
    { nom: `A3${suffixe}`, html: portrait(Math.SQRT2, 'A3', theme), pdf: { paperWidth: 11.69, paperHeight: 16.54 }, apercu: { l: 1123, h: 1588 } },
    { nom: `A5-chevalet${suffixe}`, html: chevalet(theme), pdf: { paperWidth: 8.27, paperHeight: 11.69 }, apercu: { l: 794, h: 1123 } },
    { nom: `carre${suffixe}`, html: carre(theme), png: { l: 1080, h: 1080 } },
  );
}
for (const p of PAGES) writeFileSync(path.join(SORTIE, `${p.nom}.html`), p.html);

/* Chrome sans tête : PDF pour l'impression, PNG pour le carré et les aperçus. */
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'affiches-chrome-'));
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
  const url = pathToFileURL(path.join(SORTIE, `${p.nom}.html`)).href;
  const taille = p.png ?? p.apercu;
  await cdp('Emulation.setDeviceMetricsOverride', { width: taille.l, height: taille.h, deviceScaleFactor: p.finesse ?? 1, mobile: false });
  await cdp('Page.navigate', { url });
  await attend(1800);
  await cdp('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
  if (p.pdf) {
    const r = await cdp('Page.printToPDF', { ...p.pdf, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0, printBackground: true, preferCSSPageSize: true });
    writeFileSync(path.join(SORTIE, `${p.nom}.pdf`), Buffer.from(r.result.data, 'base64'));
  }
  const img = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: taille.l, height: taille.h, scale: 1 } });
  writeFileSync(path.join(SORTIE, `${p.nom}.png`), Buffer.from(img.result.data, 'base64'));
  console.log('fait', p.nom);
}
ws.close(); chrome.kill();
console.log('QR :', LIEN_CHAPCHAP);
