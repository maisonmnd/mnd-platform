/* LE BANC DU CHAT — `node scripts/banc-du-chat.mjs [capture]`.
   19 octobre 2026. Le harnais `verifie-le-chat-du-site` éprouve la règle et
   rejoue le serveur ; ce banc ouvre le VRAI site construit (dist-sites/
   revelateur, après `node scripts/build-sites.mjs`) dans un téléphone émulé
   par Chrome (390 × 844, doigt). Tout ce que la page demande à Supabase est
   intercepté et servi par un faux chat : rien ne part en production.
     - la bulle s'ouvre : monogramme, « Nous sommes là pour vous », quatre ronds ;
     - personne de permanence : elle le dit ;
     - « Discuter » monte le chat ; civilité, prénom, nom, numéro ; « Commencer »
       ne referme pas la bulle (le chemin du clic) ;
     - le bonjour appelle « Madame Clarisse » ; un message part, la réponse
       automatique revient et se dit automatique ;
     - rien ne dépasse de l'écran ;
     - « ‹ » ramène à l'accueil ; « Vocal » ouvre le message vocal ;
     - la page rechargée retrouve la discussion ;
     - la page Contact a « Discuter en direct », et pas de bulle.
   Les noms sont des exemples. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const site = path.join(racine, 'dist-sites', 'revelateur');
const capture = process.argv[2] || '';
if (!existsSync(path.join(site, 'index.html'))) { console.error('Pas de site construit : node scripts/build-sites.mjs'); process.exit(2); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(site, p);
  if (!f.startsWith(site) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] ?? 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const origine = `http://127.0.0.1:${serveur.address().port}`;

/* ── LE FAUX CHAT ── */
const recus = [];
const messages = [];
let n = 0;
function repondsAuChat(corps) {
  recus.push(corps);
  const t = () => new Date().toISOString();
  if (corps.action === 'etat') return { ok: true, enLigne: false };
  if (corps.action === 'ouvrir') return { ok: true, id: 'disc-00000000-0000-4000-8000-000000000001', jeton: 'jeton-du-banc-assez-long-0123456789', appel: 'Madame Clarisse', enLigne: false };
  if (corps.action === 'ecrire') {
    messages.push({ id: ++n, de: 'visiteuse', texte: corps.texte, cree_le: t() });
    messages.push({ id: ++n, de: 'auto', texte: 'Bonjour Madame Clarisse, ici la réponse automatique de la Maison MND. Vous pouvez choisir votre heure en ligne. Une personne de l’équipe vous répondra sur WhatsApp dès son retour.', cree_le: t() });
    return { ok: true, messages: messages.filter((m) => m.id > Number(corps.apres ?? 0)), enLigne: false };
  }
  if (corps.action === 'lire') {
    if (corps.jeton !== 'jeton-du-banc-assez-long-0123456789') return { error: 'discussion' };
    return { ok: true, messages: messages.filter((m) => m.id > Number(corps.apres ?? 0)), enLigne: false, etat: 'ouverte' };
  }
  return { error: 'action' };
}

const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-chat-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let cible;
for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
if (!cible) { console.error('Chrome ne repond pas.'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const enCours = new Map(); const erreurs = [];
const CORS = [{ name: 'access-control-allow-origin', value: '*' }, { name: 'access-control-allow-headers', value: '*' }, { name: 'access-control-allow-methods', value: 'GET, POST, OPTIONS' }, { name: 'content-type', value: 'application/json' }];
const cdp = (method, params = {}) => new Promise((r) => { const k = ++id; enCours.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails.text);
  if (m.method === 'Fetch.requestPaused') {
    const { requestId, request } = m.params;
    let corps = {};
    let reponse = '[]';
    if (request.method === 'OPTIONS') reponse = '';
    else if (/\/functions\/v1\/discussion/.test(request.url)) {
      try { corps = JSON.parse(request.postData ?? '{}'); } catch { /* vide */ }
      reponse = JSON.stringify(repondsAuChat(corps));
    } else if (/\/functions\/v1\//.test(request.url)) reponse = '{}';
    void cdp('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: CORS, body: Buffer.from(reponse).toString('base64') });
  }
});
const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await cdp('Runtime.enable');
await cdp('Page.enable');
/* Tout ce qui va chez Supabase est servi ici : rien ne part en production. */
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*supabase.co*' }] });
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};
const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 200) { const v = await evalue(expr); if (v) return v; await attend(200); } return null; };
const va = async (chemin) => { await cdp('Page.navigate', { url: `${origine}${chemin}` }); await jusqua(`document.readyState === 'complete'`); await attend(600); };
const texte = (sel) => evalue(`(document.querySelector(${JSON.stringify(sel)})?.textContent ?? '').replace(/\\s+/g, ' ').trim()`);
const clique = (sel) => evalue(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.click(); return !!b; })()`);
const remplis = (sel, v) => evalue(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const dansLEcran = () => evalue(`(() => { const v = document.getElementById('joindre-volet'); if (!v || v.hidden) return 'fermé';
  const r = v.getBoundingClientRect(); const large = document.documentElement.scrollWidth;
  return r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5 && large <= innerWidth ? 'oui' : JSON.stringify({ l: r.left, r: r.right, t: r.top, b: r.bottom, large, w: innerWidth, h: innerHeight }); })()`);

/* 1. L'accueil. */
await va('/soins-locks/');
dit('la bulle est là, repliée', (await evalue(`!!document.getElementById('joindre-bouton') && document.getElementById('joindre-volet').hidden`)) === true);
await clique('#joindre-bouton');
await jusqua(`!document.getElementById('joindre-volet').hidden`);
const accueil = await texte('#joindre-accueil');
dit('l accueil : « Maison MND », « Nous sommes là pour vous », Discuter, Appeler, WhatsApp, Vocal, Réserver',
  /Maison MND/.test(accueil) && /Nous sommes là pour vous/.test(accueil) && ['Discuter', 'Appeler', 'WhatsApp', 'Vocal'].every((m) => accueil.includes(m)) && /Réserver|Me faire rappeler/.test(accueil), accueil.slice(0, 160));
dit('le monogramme s affiche', (await evalue(`(() => { const i = document.querySelector('.joindre__avatar img'); return !!i && i.complete && i.naturalWidth > 0; })()`)) === true);
const etat = await jusqua(`(() => { const e = document.getElementById('joindre-etat'); return e && !e.hidden ? e.textContent.trim() : ''; })()`, 6000);
dit('personne de permanence : la bulle le dit', etat === 'Réponse automatique, puis WhatsApp', etat);
dit('la bulle tient dans l écran', (await dansLEcran()) === 'oui', await dansLEcran());
await photo('1-accueil');

/* 2. Discuter. */
await clique('[data-joindre="chat"]');
dit('« Discuter » ouvre sa vue', (await jusqua(`!document.getElementById('joindre-vue').hidden && document.getElementById('joindre-vue-titre').textContent === 'Discuter avec la Maison'`, 4000)) === true);
dit('le chat se monte (civilité, prénom, nom, numéro)', !!(await jusqua(`!!document.querySelector('#joindre-ilot-chat .chat-qui input[autocomplete="tel"]')`, 10000)));
await photo('2-qui');
await evalue(`[...document.querySelectorAll('#joindre-ilot-chat .vocal-civ button')].find((b) => b.textContent === 'Madame')?.click()`);
await remplis('#joindre-ilot-chat input[autocomplete="given-name"]', 'Clarisse');
await remplis('#joindre-ilot-chat input[autocomplete="family-name"]', 'Dossou');
await remplis('#joindre-ilot-chat input[autocomplete="tel"]', '01 97 00 00 00');
await evalue(`[...document.querySelectorAll('#joindre-ilot-chat .chat-qui button')].find((b) => b.textContent.trim() === 'Commencer')?.click()`);
const bonjour = await jusqua(`(() => { const m = document.querySelector('#joindre-ilot-chat .chat-fil .chat-msg--maison'); return m ? m.textContent : ''; })()`, 8000);
const ouvert = recus.find((r) => r.action === 'ouvrir') ?? {};
dit('« Commencer » ouvre la discussion avec ses champs', ouvert.civilite === 'madame' && ouvert.prenom === 'Clarisse' && ouvert.nom === 'Dossou' && ouvert.telephone === '01 97 00 00 00' && ouvert.page === '/soins-locks/', JSON.stringify(ouvert));
dit('... sans refermer la bulle (l îlot s est redessiné sous le doigt)', (await evalue(`!document.getElementById('joindre-volet').hidden`)) === true);
dit('le bonjour appelle « Madame Clarisse » et dit qu une réponse automatique aide', /Bonjour Madame Clarisse/.test(bonjour ?? '') && /réponse automatique/.test(bonjour ?? ''), (bonjour ?? '').slice(0, 140));
await remplis('#joindre-ilot-chat .chat-saisie input', 'Bonjour, il vous reste de la place samedi ?');
await evalue(`document.querySelector('#joindre-ilot-chat .chat-envoi').click()`);
const auto = await jusqua(`(() => { const m = document.querySelector('#joindre-ilot-chat .chat-msg--auto'); return m ? m.textContent : ''; })()`, 8000);
dit('le message part, la réponse automatique revient et se dit automatique', /réponse automatique/.test(auto ?? '') && /Maison MND · réponse automatique/.test(auto ?? '')
  && (await texte('#joindre-ilot-chat .chat-msg--visiteuse')).startsWith('Bonjour, il vous reste de la place samedi ?'), (auto ?? '').slice(-60));
dit('... la saisie se vide', (await evalue(`document.querySelector('#joindre-ilot-chat .chat-saisie input').value`)) === '');
dit('le chat tient dans l écran, rien ne dépasse', (await dansLEcran()) === 'oui', await dansLEcran());
await photo('3-fil');

/* 3. Retour, puis Vocal. */
await clique('.joindre__retour');
dit('« ‹ » ramène à l accueil', (await evalue(`!document.getElementById('joindre-accueil').hidden && document.getElementById('joindre-vue').hidden`)) === true);
await clique('[data-joindre="vocal"]');
dit('« Vocal » ouvre le message vocal, déjà déplié', !!(await jusqua(`!!document.querySelector('#joindre-ilot-vocal .vocal-rond')`, 10000)));
await photo('4-vocal');

/* 4. La page rechargée retrouve la discussion. */
const avant = recus.filter((r) => r.action === 'lire').length;
await va('/soins-locks/');
await clique('#joindre-bouton');
await clique('[data-joindre="chat"]');
const repris = await jusqua(`(() => { const f = document.querySelector('#joindre-ilot-chat .chat-fil'); return f ? f.querySelectorAll('.chat-msg').length : 0; })()`, 10000);
dit('la page rechargée retrouve sa discussion (bonjour, son message, la réponse)', repris >= 3 && recus.filter((r) => r.action === 'lire').length > avant, `${repris} messages`);
dit('... sans redemander qui elle est', (await evalue(`!document.querySelector('#joindre-ilot-chat .chat-qui')`)) === true);

/* 5. La page Contact. */
await va('/contact/');
dit('la page Contact n a pas de bulle', (await evalue(`!document.getElementById('joindre')`)) === true);
const surContact = await jusqua(`[...document.querySelectorAll('.chat--contact button, .chat--contact .chat-fil')].length > 0`, 10000);
dit('... mais le chat dans « Nous écrire » (la discussion reprise, ou le bouton)', !!surContact);
await photo('5-contact');

dit('aucune erreur dans les pages', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libéré après */ } }, 1500);
console.log(ko === 0 ? '\nLe chat de la Maison s ouvre, parle et se retrouve comme promis.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
