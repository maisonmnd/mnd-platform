/* LE BANC DES AVIS GOOGLE · `node scripts/banc-des-avis-google.mjs [capture]`.

   26 octobre 2026 : la rubrique « Les avis Google » (maquette YaWfiqou…,
   « Tout me va »). 27 octobre 2026, lot 3 : les avis sont la vue « Les avis »
   de l'Assistant Maison (`#/gerard?vue=avis`, `LesAvis.tsx`) ; l'ancienne
   adresse `#/avis-google` y mène. Les harnais éprouvent les règles
   (`verifie-le-pont-des-avis`, `verifie-les-avis-choisis`) ; ce banc ouvre
   le VRAI Trône comme la direction et fait les gestes d'une main :

     - `#/avis-google` mène à la vue ; la barre allume « Assistant Maison »
       sous « Clientes », « Les avis Google » n'y est plus ;
     - UNE liste repliée de TOUS les avis de Make : ce qui attend un geste
       d'abord, 1 à 3 étoiles en tête, le répondu en dernier ; un seul
       panneau ouvert à la fois ; quatre tuiles au-dessus ;
     - la case « Montrer sur maisonmnd.com » du panneau COPIE l'avis dans le
       document de la vitrine ;
     - « Publier sur Google » pose la question, « Oui, publier » envoie le
       NOM de l'avis chez Google à la fonction ;
     - un avis répondu montre sa réponse et « Modifier la réponse » ;
     - l'onglet des Vitrines mène à la vue ; au téléphone, rien ne déborde.

   Le serveur du banc sert le Trône ET répond comme Supabase sur quelques
   adresses (la session, le personnel, le relevé, les avis de Make, l'état du
   pont, la publication) ; tout le reste coupe la connexion. Les avis sont des
   exemples, signés d'initiales (le dépôt est public). */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-avis-'));

const RELEVE = {
  note: 4.9, nombre: 299, fiche: 'https://www.google.com/maps/place/?q=place_id:exemple',
  avis: [
    { auteur: 'G. J.', note: 5, texte: 'Il était temps que je fasse ma reprise de locks, et le soin a été long et précis.', quand: 'il y a 3 mois', publieLe: '2026-07-23T10:00:00Z' },
    { auteur: 'B. F.', note: 5, texte: 'Bluffé par la qualité du travail sur les nouveaux dreadlocks de mon fils.', quand: 'il y a 4 mois', publieLe: '2026-07-01T10:00:00Z' },
  ],
};

/* La direction : une session valide, que le serveur du banc reconnaît. */
const UID = 'u-banc-direction';
const CLE = 'sb-127-auth-token';
const le = new Date(Date.now() - 86_400_000).toISOString();
const ilYa = (j) => new Date(Date.now() - j * 86_400_000).toISOString();

/* Les avis que Make a apportés : un d'hier traduit, un de 2 étoiles, deux
   que Places connaît aussi, un répondu, un ancien. */
const NOM = (r) => `accounts/1/locations/2/reviews/${r}`;
const MAKE = [
  { name: NOM('v1'), auteur: 'N. M.', note: 5, texte: 'Amazing experience, very welcoming.\n\n(Translated by Google)\nUne expérience formidable, très accueillante.', creeLe: ilYa(1) },
  { name: NOM('v2'), auteur: 'S. H.', note: 2, texte: 'Le résultat est beau, mais une heure d’attente avec un rendez-vous.', creeLe: ilYa(3) },
  { name: NOM('v3'), auteur: 'G. J.', note: 5, texte: RELEVE.avis[0].texte, creeLe: RELEVE.avis[0].publieLe },
  { name: NOM('v4'), auteur: 'B. F.', note: 5, texte: RELEVE.avis[1].texte, creeLe: RELEVE.avis[1].publieLe },
  { name: NOM('v5'), auteur: 'A. L.', note: 5, texte: 'Très bon accueil, travail soigné.', creeLe: '2026-07-28T10:00:00Z', reponse: 'Merci A. L., à bientôt à la Maison.', reponduLe: '2026-07-29T09:00:00Z' },
  { name: NOM('v6'), auteur: 'K. O.', note: 4, texte: 'Bien, je reviendrai.', creeLe: '2025-02-10T10:00:00Z' },
];
const DE_GOOGLE = { avis: Object.fromEntries(MAKE.map((g) => [g.name, { ...g, recuLe: ilYa(0) }])) };
const publications = [];

console.log('Construction du Trône (Supabase = le serveur du banc)…');
let origine = '';
const json = (res, status, corps) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(corps)); };
const serveur = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (process.env.BANC_LOG && /^\/(rest|auth|functions)\//.test(u.pathname)) console.log('  [serveur]', req.method, u.pathname + u.search);
  const cle = u.searchParams.get('key');
  if (u.pathname === '/rest/v1/documents' && cle === 'eq.mnd_avis_google') return json(res, 200, { data: RELEVE, updated_at: new Date().toISOString() });
  if (u.pathname === '/rest/v1/documents' && cle === 'eq.mnd_avis_google_tous') return json(res, 200, { data: DE_GOOGLE });
  if (u.pathname === '/auth/v1/health') return json(res, 200, {});
  if (u.pathname === '/auth/v1/user') return json(res, 200, { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le });
  if (u.pathname === '/rest/v1/staff') return json(res, 200, { user_id: UID, name: 'Direction', role: 'souverain', rubrics: [] });
  if (u.pathname === '/functions/v1/avis-google-pont' && req.method === 'GET') return json(res, 405, { error: 'method', version: '2026-10-26-a', recoit: true, publie: true });
  if (u.pathname === '/functions/v1/avis-google-pont' && req.method === 'POST') {
    let corps = '';
    req.on('data', (c) => { corps += c; });
    req.on('end', () => { publications.push(JSON.parse(corps || '{}')); json(res, 200, { ok: true, le: new Date().toISOString(), version: '2026-10-26-a' }); });
    return undefined;
  }
  if (u.pathname === '/functions/v1/ia-maison' && req.method === 'GET') return json(res, 405, { version: '2026-10-24-a' });
  if (/^\/(rest|auth|functions|realtime|storage)\//.test(u.pathname)) { req.socket.destroy(); return undefined; }
  let f = path.join(construit, decodeURIComponent(u.pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return undefined; }
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
  return undefined;
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
origine = `http://127.0.0.1:${serveur.address().port}`;
execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: origine, VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
});
renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));

const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-avis-chrome-'));
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
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};
const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
const clique = (selecteur, texte, dans = 'document') => evalue(`(() => {
  const b = [...(${dans}).querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const texte = (sel) => evalue(String.raw`(document.querySelector(${JSON.stringify(sel)})?.innerText || '').replace(/\s+/g, ' ')`);
/* La liste repliée de la vue : une ligne `li.trc-am__avis`, le prénom dans `.trc-ger__qui b`, l'état dans `.trc-am__droite b`. */
const rangees = () => evalue(String.raw`[...document.querySelectorAll('li.trc-am__avis')].map((d) => [d.querySelector('.trc-ger__qui b')?.textContent, d.querySelector('.trc-am__droite b')?.textContent, d.getAttribute('class')])`);
const rangee = (auteur, sel) => evalue(`(() => {
  const d = [...document.querySelectorAll('li.trc-am__avis')].find((x) => x.querySelector('.trc-ger__qui b')?.textContent === ${JSON.stringify(auteur)});
  const e = d?.querySelector(${JSON.stringify(sel)});
  if (e) e.click();
  return !!e;
})()`);

await cdp('Page.navigate', { url: `${origine}/` });
await attend(2500);
const semence = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Direction', role: 'souverain', rubrics: [] } },
  mnd_reset_v5: '1',
};
await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; })()`);
await evalue('location.reload()');
await jusqua(`!!document.querySelector('.tr-top__sync, .tr-side, nav')`, 20000);
/* 27 octobre 2026 (lot 3) : l'ancienne adresse mène à la vue « Les avis » de l'Assistant Maison, qui garde l'avis demandé. */
await evalue(`location.hash = '#/avis-google'; true`);
const versLaVue = await jusqua(String.raw`location.hash.startsWith('#/gerard') && /vue=avis/.test(location.hash)`, 20000);
dit('#/avis-google mène à la vue « Les avis » de l Assistant Maison', !!versLaVue, await evalue('location.hash'));
const vu = await jusqua(`document.querySelectorAll('li.trc-am__avis').length > 0`, 40000);
dit('Les avis, comme la direction : la liste s ouvre', !!vu);

/* La barre : la rubrique n'y est plus ; « Assistant Maison », sous « Clientes », est allumée. */
const barre = await evalue(String.raw`(() => { const l = [...document.querySelectorAll('.tr-nav__item')].map((a) => a.textContent.replace(/\s+/g, ' ').trim()); return l; })()`);
const iClientes = (barre ?? []).findIndex((t) => t.startsWith('Clientes'));
dit('la barre : « Assistant Maison » juste sous « Clientes », allumée ; « Les avis Google » n y est plus', iClientes >= 0 && String(barre[iClientes + 1]).startsWith('Assistant Maison')
  && !(barre ?? []).some((t) => t.startsWith('Les avis Google'))
  && !!(await evalue(String.raw`[...document.querySelectorAll('.tr-nav__item.active')].some((a) => a.textContent.includes('Assistant Maison'))`)), JSON.stringify(barre?.slice(iClientes, iClientes + 2)));
dit('... l onglet « Les avis » de la barre des vues est choisi', await evalue(String.raw`document.querySelector('.trc-am__vues [aria-selected="true"]')?.id === 'am-ong-avis'`));

/* Les tuiles et la liste. */
const tuiles = await evalue(String.raw`[...document.querySelectorAll('#am-vue-avis .trc-am__tuile b')].map((b) => b.innerText.replace(/\s+/g, ' ').trim())`);
dit('quatre tuiles : 5 reçus sans réponse, 0 prête, 0 publiée ce mois, la note 4,9', (tuiles ?? []).length === 4 && tuiles[0] === '5' && tuiles[1] === '0' && tuiles[2] === '0' && tuiles[3] === '4,9', JSON.stringify(tuiles));
dit('... la ligne résumé compte 6 avis, 5 sans réponse, 0 sur le site', /6 avis · sans réponse 5 · prêtes 0 · 0 sur le site/.test(await texte('#am-vue-avis .trc-am__resume')), await texte('#am-vue-avis .trc-am__resume'));
const sans = await rangees();
dit('l ordre : ce qui attend un geste d abord, 1 à 3 étoiles en tête, du plus récent au plus ancien ; le répondu en dernier',
  JSON.stringify(sans.map((x) => x[0])) === JSON.stringify(['S. H.', 'N. M.', 'G. J.', 'B. F.', 'K. O.', 'A. L.']) && sans[5][1] === 'Répondu' && sans[1][1] !== 'Répondu', JSON.stringify(sans.map((x) => [x[0], x[1]])));
dit('... aucun panneau ouvert à l arrivée', (await evalue(`document.querySelectorAll('#am-vue-avis .trc-ger__panneau').length`)) === 0);
dit('le panneau de A. L. (répondu) s ouvre', await rangee('A. L.', '.trc-ger__ligne'));
await attend(300);
const pub = await texte('#am-vue-avis .trc-ger__panneau');
dit('... il montre la réponse publiée sur Google, et « Modifier la réponse »', /Publiée sur Google/.test(pub) && /Merci A\. L\., à bientôt à la Maison\./.test(pub) && /Modifier la réponse/i.test(pub), pub.slice(0, 220));
dit('... un seul panneau ouvert', (await evalue(`document.querySelectorAll('#am-vue-avis .trc-ger__panneau').length`)) === 1);
await photo('1-repondu');

/* Le site : la case du panneau copie l'avis. */
dit('le panneau de N. M. s ouvre', await rangee('N. M.', '.trc-ger__ligne'));
await attend(300);
dit('... et celui de A. L. s est fermé : un seul panneau', (await evalue(`document.querySelectorAll('#am-vue-avis .trc-ger__panneau').length`)) === 1);
dit('la case « Montrer sur maisonmnd.com » de N. M. se coche', await rangee('N. M.', '.trc-avr__case input'));
await attend(500);
const cfg = await lis('trone::mnd_vitrine_config');
const copie = (cfg?.avisDuSite ?? [])[0];
dit('... l avis est COPIÉ dans le document de la vitrine, l ancien choix par clés vidé',
  cfg?.avisDuSite?.length === 1 && copie?.auteur === 'N. M.' && /^Amazing experience/.test(copie?.texte ?? '') && !/Translated/.test(copie?.texte ?? '') && Array.isArray(cfg?.avisChoisis) && cfg.avisChoisis.length === 0,
  JSON.stringify(cfg?.avisDuSite));
dit('... la case dit sa place, la ligne résumé compte 1 sur le site', /Sur maisonmnd\.com, 1er avis/.test(await texte('#am-vue-avis .trc-avr__case')) && /1 sur le site/.test(await texte('#am-vue-avis .trc-am__resume')),
  await texte('#am-vue-avis .trc-avr__case'));

/* Répondre et publier. */
dit('le panneau de S. H. (2 étoiles) s ouvre', await rangee('S. H.', '.trc-ger__ligne'));
await attend(400);
dit('... il prévient : la réponse attend votre lecture', /Avis de 2 étoiles/.test(await texte('#am-vue-avis .trc-ger__panneau')));
dit('« Écrire moi-même »', await clique('#am-vue-avis .trc-ger__panneau button', 'Écrire moi-même'));
await attend(300);
await evalue(String.raw`(() => {
  const z = document.querySelector('#am-vue-avis .trc-ger__panneau textarea');
  const poser = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  poser.call(z, 'Merci de nous l’avoir dit ; pardon pour cette attente.');
  z.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await attend(400);
dit('« Publier sur Google » pose la question, qui nomme l autrice, sans rien envoyer', await clique('#am-vue-avis .trc-ger__panneau button', 'Publier sur Google')
  && publications.length === 0 && /Publier cette réponse sous l’avis de S\. H\. \?/.test(await texte('#am-vue-avis .trc-ger__panneau [role="group"]')));
await photo('2-question');
dit('« Oui, publier »', await clique('#am-vue-avis .trc-ger__panneau [role="group"] button', 'Oui, publier'));
await jusqua(`/Publié sur Google depuis le Trône/.test(document.querySelector('#am-vue-avis .trc-ger__panneau')?.innerText || '')`, 8000);
dit('... la fonction reçoit le NOM de l avis chez Google et la réponse, une fois',
  publications.length === 1 && publications[0].avis?.name === NOM('v2') && publications[0].reponse === 'Merci de nous l’avoir dit ; pardon pour cette attente.', JSON.stringify(publications));
dit('... et l écran dit « Publié sur Google depuis le Trône »', /Publié sur Google depuis le Trône/.test(await texte('#am-vue-avis .trc-ger__panneau')));
await photo('3-publie');

/* Les Vitrines mènent à la vue (par l'ancienne adresse, qui redirige). */
await evalue(`location.hash = '#/vitrine?onglet=avis'; true`);
const redirige = await jusqua(String.raw`location.hash.startsWith('#/gerard') && /vue=avis/.test(location.hash)`, 8000);
dit('l onglet des Vitrines (et ses liens d avant) mène à la vue « Les avis »', !!redirige, await evalue('location.hash'));

/* L'ancienne adresse avec un avis demandé ouvre son panneau (le lien de la fiche cliente). */
await evalue(`location.hash = '#/avis-google?avis=${encodeURIComponent('g-v6')}'; true`);
const ouvertParLeLien = await jusqua(String.raw`/vue=avis/.test(location.hash) && [...document.querySelectorAll('li.trc-am__avis.est-ouverte .trc-ger__qui b')].map((b) => b.textContent).join('|') === 'K. O.'`, 8000);
dit('#/avis-google?avis=<clé> ouvre cet avis dans la vue, lui seul', !!ouvertParLeLien && (await evalue(`document.querySelectorAll('#am-vue-avis .trc-ger__panneau').length`)) === 1, await evalue('location.hash'));

/* Au téléphone. */
await evalue(`location.hash = '#/gerard?vue=avis'; true`);
await jusqua(`document.querySelectorAll('li.trc-am__avis').length > 0`, 15000);
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await attend(800);
dit('au téléphone (390 px), rien ne déborde', (await evalue('document.documentElement.scrollWidth > window.innerWidth + 1')) === false, String(await evalue('document.documentElement.scrollWidth')));
await rangee('G. J.', '.trc-ger__ligne');
await attend(400);
dit('... un avis ouvert déplie son panneau sous la ligne, seul, et rien ne déborde', (await evalue(`document.querySelectorAll('#am-vue-avis .trc-ger__panneau').length`)) === 1
  && (await evalue('document.documentElement.scrollWidth > window.innerWidth + 1')) === false, String(await evalue('document.documentElement.scrollWidth')));
await photo('4-telephone');
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
console.log(ko === 0 ? '\nLa rubrique des avis recoit, apprete et publie.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
