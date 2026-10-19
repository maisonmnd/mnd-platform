/* LE BANC DU MESSAGE VOCAL — `node scripts/banc-du-message-vocal.mjs [capture]`.

   19 octobre 2026. Le harnais `verifie-le-message-vocal` éprouve la règle et
   rejoue le serveur ; ce banc ouvre le VRAI îlot du site dans un vrai Chrome,
   avec un micro simulé (Chrome sait en fournir un), et un faux serveur
   Supabase qui reçoit la voix comme la fonction la recevrait :

     - le bouton ouvre le panneau ; civilité, prénom, nom, numéro ;
     - « Parler » enregistre vraiment, le compteur avance, « Arrêter » ;
     - sans la case cochée, rien ne part ;
     - la case cochée, la voix part en multipart avec ses champs ;
     - le merci appelle « Madame Clarisse » ;
     - la carte de /rappel/ dit « Plutôt parler ? ».

   Les noms sont des exemples. */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const dossier = mkdtempSync(path.join(tmpdir(), 'banc-vocal-'));
const recus = [];

const serveur = createServer(async (req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(200, cors); res.end(); return; }
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/functions/v1/demande-submit' && req.method === 'POST') {
    const morceaux = [];
    for await (const m of req) morceaux.push(m);
    const corps = Buffer.concat(morceaux);
    try {
      const f = await new Request('http://x', { method: 'POST', headers: { 'content-type': req.headers['content-type'] ?? '' }, body: corps }).formData();
      const champs = {};
      for (const [k, v] of f.entries()) champs[k] = typeof v === 'string' ? v : { type: v.type, taille: v.size, nom: v.name };
      recus.push(champs);
    } catch (e) { recus.push({ erreur: String(e) }); }
    res.writeHead(200, { ...cors, 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, id: 'dem-banc', accuse: 'envoyé' }));
    return;
  }
  if (u.pathname.startsWith('/rest/v1/') || u.pathname.startsWith('/auth/v1/')) {
    res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end('[]'); return;
  }
  if (u.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/site.css"></head>
<body style="padding:20px"><div class="jo-carte" style="max-width:420px"><h3>Nous écrire</h3><div id="ici"></div></div><aside class="ensuite" style="max-width:420px;margin-top:24px"><div id="carte"></div></aside><script type="module" src="/banc.js"></script></body></html>`);
    return;
  }
  if (u.pathname === '/site.css') { res.writeHead(200, { 'content-type': 'text/css' }); res.end(readFileSync(path.join(racine, 'src/apps/revelateur/revelateur.css'))); return; }
  if (u.pathname === '/banc.js') { res.writeHead(200, { 'content-type': 'text/javascript' }); res.end(readFileSync(path.join(dossier, 'banc.js'))); return; }
  res.writeHead(404); res.end();
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const origine = `http://127.0.0.1:${serveur.address().port}`;

/* L'îlot tel quel, et la carte de /rappel/. */
writeFileSync(path.join(dossier, 'entree.tsx'), `import { createRoot } from 'react-dom/client';
import MessageVocal from ${JSON.stringify(path.join(racine, 'src/apps/revelateur/ilots/MessageVocal').replace(/\\/g, '/'))};
createRoot(document.getElementById('ici')!).render(<MessageVocal />);
createRoot(document.getElementById('carte')!).render(<MessageVocal genre="carte" />);
`);
await build({
  entryPoints: [path.join(dossier, 'entree.tsx')], bundle: true, format: 'esm', platform: 'browser', outfile: path.join(dossier, 'banc.js'),
  jsx: 'automatic', logLevel: 'error', loader: { '.css': 'empty', '.png': 'empty', '.jpg': 'empty', '.woff2': 'empty' },
  define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: origine, VITE_SUPABASE_ANON_KEY: 'faux', BASE_URL: '/', DEV: false, PROD: true }) },
  nodePaths: [path.join(racine, 'node_modules')],
});

const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-vocal-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required',
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 1400, deviceScaleFactor: 2, mobile: true });
/* Le micro pour cette page, comme si la visiteuse avait dit oui. */
await cdp('Browser.grantPermissions', { origin: origine, permissions: ['audioCapture'] }).catch(() => undefined);

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};
const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 200) { const v = await evalue(expr); if (v) return v; await attend(200); } return null; };
const clique = (selecteur, texte) => evalue(`(() => {
  const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const tape = (sel, valeur) => evalue(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const texte = (sel) => evalue(`(document.querySelector(${JSON.stringify(sel)})?.innerText || '').replace(/\\s+/g, ' ')`);

await cdp('Page.navigate', { url: `${origine}/` });
dit('l îlot monte, le bouton paraît', !!(await jusqua(`!!document.querySelector('#ici button')`)));
/* L'étiquette « sur » s'écrit en capitales par le style du site : on lit sans la casse. */
const carte = await texte('#carte');
dit('la carte de /rappel/ dit « Plutôt parler ? »', /Plutôt parler \?/i.test(carte) && /Laissez-nous un message vocal/i.test(carte), carte.slice(0, 120));
dit('« Laisser un message vocal » ouvre le panneau', await clique('#ici button', 'Laisser un message vocal'));
await attend(300);
dit('le panneau : civilité, prénom, nom, numéro, le gros bouton, la case', !!(await evalue(`!!(document.querySelector('#ici .vocal-civ') && document.querySelector('#vocal-prenom') && document.querySelector('#vocal-nom') && document.querySelector('#vocal-numero') && document.querySelector('#ici .vocal-rond') && document.querySelector('#vocal-consent'))`)));
await clique('#ici .vocal-civ button', 'Madame');
await tape('#ici #vocal-prenom', 'Clarisse');
await tape('#ici #vocal-nom', 'Dossou');
await tape('#ici #vocal-numero', '01 97 00 00 00');
const envoyerFerme = () => evalue(`(() => { const b = [...document.querySelectorAll('#ici .vocal-trio button')].find((x) => x.textContent.trim().startsWith('Envoyer')); return b ? b.disabled : null; })()`);
dit('« Envoyer » attend un message', (await envoyerFerme()) === true);
dit('« Parler » lance l enregistrement', await clique('#ici .vocal-rond', 'Parler'));
const parle = await jusqua(`!!document.querySelector('#ici .vocal-micro--parle')`, 5000);
dit('le micro s ouvre (la page dit « On vous écoute »)', !!parle && /On vous écoute/.test(await texte('#ici .vocal-micro')));
await attend(3200);
const pendant = await texte('#ici .vocal-temps');
dit('le compteur avance', /0:0[2-4]/.test(pendant), pendant);
await photo('1-parle');
dit('« Arrêter »', await clique('#ici .vocal-rond', 'Arrêter'));
dit('« Envoyer » s ouvre une fois le message fini', !!(await jusqua(`(() => { const b = [...document.querySelectorAll('#ici .vocal-trio button')].find((x) => x.textContent.trim().startsWith('Envoyer')); return b && !b.disabled; })()`, 5000)));
dit('« Réécouter » et « Recommencer » s ouvrent aussi', (await evalue(`[...document.querySelectorAll('#ici .vocal-trio button')].filter((x) => !x.disabled).length`)) === 3);
await clique('#ici .vocal-trio button', 'Envoyer');
await attend(500);
dit('sans la case cochée, rien ne part et l écran le dit', recus.length === 0 && /Cochez la case/.test(await texte('#ici .erreur')), `${recus.length} envoi(s)`);
await evalue(`(() => { const c = document.querySelector('#ici #vocal-consent'); c.click(); return c.checked; })()`);
await clique('#ici .vocal-trio button', 'Envoyer');
await jusqua(`!!document.querySelector('#ici .vocal-merci')`, 10000);
const r = recus[0] ?? {};
dit('la voix part en multipart à demande-submit, avec ses champs', r.civilite === 'madame' && r.prenom === 'Clarisse' && r.nom === 'Dossou' && r.telephone === '01 97 00 00 00' && r.consentement === 'oui' && r.page === '/',
  JSON.stringify({ ...r, voix: undefined }));
dit('la voix est un vrai son de quelques secondes', !!r.voix && /^audio\/(webm|ogg|mp4)/.test(r.voix.type) && r.voix.taille > 1000 && Number(r.duree) >= 2 && Number(r.duree) <= 5, JSON.stringify(r.voix) + ' ' + r.duree);
const merci = await texte('#ici .vocal-merci');
dit('le merci appelle « Madame Clarisse » et dit quand on rappelle', /Merci Madame Clarisse\./.test(merci) && /nous vous rappelons (dans la journée|dès l’ouverture)/.test(merci), merci.slice(0, 160));
await photo('2-merci');
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { for (const d of [profil, dossier]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
console.log(ko === 0 ? '\nLe message vocal s enregistre et part comme promis.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
