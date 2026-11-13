import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* PARTAGER UN PAIEMENT, À L'ÉCRAN — `node scripts/banc-partager-un-paiement.mjs [capture]`.

   13 novembre 2026 : « Dans Dépenses, permets-moi de split a payment »
   (Yéman). Ce banc construit le Trône comme le banc hors ligne (connexion
   obligatoire, serveur Supabase injoignable, une session gardée), pose UNE
   dépense d'exemple de 120 000 F, ouvre Dépenses dans un vrai Chrome, touche
   « Partager », saisit une part de 30 000 F hors de la Maison, enregistre, et
   exige : deux parts liées au même paiement, la caisse qui bouge toujours de
   120 000 F, les charges du mois à 90 000 F, l'en-tête « Partagé » et la
   pastille « Hors Maison ». Puis « Réunir » rend une seule dépense.
   Les montants et les libellés sont des exemples. */

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-partage-'));
console.log('Construction du Trône (serveur injoignable)…');
execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
});
renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = createServer((req, res) => {
  let f = path.join(construit, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const origine = `http://127.0.0.1:${serveur.address().port}`;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-partage-chrome-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};

const UID = 'u-banc-partage';
const CLE = 'sb-127-auth-token';
const le = new Date(Date.now() - 86_400_000).toISOString();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const AUJOURDHUI = iso(new Date());
const semence = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
    user: { id: UID, email: 'accueil@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Accueil', role: 'souverain', rubrics: [] } },
  /* Les magasins portent le nom de leur surface (store.ts, nsKey). */
  'trone::mnd_expenses': [{ id: 'exp-banc-1', branchId: 'maison', label: 'Supermarché', amountXof: 120000, date: AUJOURDHUI, cashbox: 'Caisse Principale', category: 'Local' }],
};
const depenses = () => evalue(`JSON.parse(localStorage.getItem('trone::mnd_expenses') || '[]')`);

/* Un clic sur le bouton dont le texte est donné (le premier visible). */
const cliqueSur = (texte, dans = 'document') => evalue(`(() => {
  const b = [...${dans}.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(texte)} && x.offsetParent !== null);
  if (!b) return false; b.click(); return true;
})()`);
/* Remplir un champ React : la valeur posée par le setter natif, puis l'événement. */
const remplis = (selecteur, index, valeur) => evalue(`(() => {
  const el = document.querySelectorAll(${JSON.stringify(selecteur)})[${index}];
  if (!el) return false;
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(valeur))});
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);

try {
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/depenses'; location.reload(); true`);
  await attend(9000);
  dit('Dépenses s’ouvre avec la dépense d’exemple', !!(await evalue(`document.body.innerText.includes('Supermarché')`)));
  await photo('1-avant');

  dit('la ligne propose « Partager »', await cliqueSur('Partager'));
  await attend(600);
  dit('la fenêtre « Partager ce paiement. » s’ouvre', !!(await evalue(`(document.querySelector('.mnd-modal')?.innerText ?? '').includes('Partager ce paiement.')`)));
  /* Deux parts : la première porte d'office le total ; la seconde reçoit 30 000 F hors de la Maison. */
  await remplis('.trf-partage__part input:not([type="checkbox"])', 2, 'Achat de la famille');
  await remplis('.trf-partage__part input:not([type="checkbox"])', 3, '30000');
  await evalue(`document.querySelectorAll('.trf-partage__hors input')[1].click(); true`);
  await attend(200);
  dit('il reste à répartir : « Enregistrer » attend', !!(await evalue(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Enregistrer les 2 parts'))?.disabled`)));
  dit('« Le reste dans la 1re part » le range', await cliqueSur('Le reste dans la 1re part'));
  await attend(200);
  dit('tout est réparti', !!(await evalue(`document.querySelector('.trf-partage__reste')?.innerText.includes('Tout est réparti')`)));
  await photo('2-fenetre');
  dit('« Enregistrer les 2 parts »', await cliqueSur('Enregistrer les 2 parts'));
  await attend(800);

  const apres = await depenses();
  const parts = apres.filter((e) => e.paiement?.id);
  dit('deux parts, liées au même paiement', parts.length === 2 && new Set(parts.map((p) => p.paiement.id)).size === 1, JSON.stringify(parts.map((p) => [p.id, p.label, p.amountXof, !!p.horsMaison])));
  dit('la première part garde l’identifiant de la dépense', parts[0]?.id === 'exp-banc-1');
  dit('90 000 F au salon, 30 000 F hors de la Maison, 120 000 F au total', JSON.stringify(parts.map((p) => [p.amountXof, !!p.horsMaison])) === JSON.stringify([[90000, false], [30000, true]]));
  dit('la caisse bouge toujours de 120 000 F', parts.reduce((s, p) => s + p.amountXof, 0) === 120000 && parts.every((p) => p.cashbox === 'Caisse Principale'));
  const ecran = await evalue(`document.body.innerText`);
  dit('la liste montre le paiement « Partagé » et la part « Hors Maison »', /PARTAGÉ|Partagé/.test(ecran) && /HORS MAISON|Hors Maison/i.test(ecran) && ecran.includes('Un paiement en 2 parts'));
  dit('les charges du mois disent 90 000 F, pas 120 000 F', /90\s000/.test(await evalue(`[...document.querySelectorAll('.trf-chip__n')].map((x) => x.textContent).join(' | ')`)), await evalue(`[...document.querySelectorAll('.trf-chip__n')].map((x) => x.textContent).join(' | ')`));
  await photo('3-partage');

  dit('« Réunir »', await cliqueSur('Réunir'));
  await attend(600);
  /* La confirmation de la Maison (une fenêtre, jamais celle du navigateur). */
  /* Le dernier « Réunir » de la page : celui de la confirmation de la Maison. */
  dit('… se confirme', await evalue(`(() => { const b = [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === 'Réunir' && x.offsetParent !== null).at(-1); if (!b) return false; b.click(); return true; })()`));
  await attend(800);
  const reunie = await depenses();
  dit('une seule dépense de 120 000 F revient, sous son identifiant', reunie.length === 1 && reunie[0].id === 'exp-banc-1' && reunie[0].amountXof === 120000 && !reunie[0].paiement && !reunie[0].horsMaison, JSON.stringify(reunie));
  await photo('4-reunie');
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
} finally {
  ws.close(); chrome.kill(); serveur.close();
  await attend(500);
  rmSync(construit, { recursive: true, force: true });
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore le profil */ }
}
console.log(ko ? `\n${ko} échec(s).` : '\nPartager un paiement marche à l’écran.');
process.exit(ko ? 1 : 0);
