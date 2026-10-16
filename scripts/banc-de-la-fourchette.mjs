/* LE BANC DE LA FOURCHETTE — `node scripts/banc-de-la-fourchette.mjs [dossier construit]`.

   16 octobre 2026, « je ne veux plus que les clients voient leur nombre précis
   de locks, juste la marge du modèle » (Yéman). Le harnais
   `verifie-la-fourchette` lit le code ; ce banc ouvre la VRAIE Ma Couronne,
   hors ligne, dans un téléphone émulé (390 × 844), pour une cliente que la
   Maison a comptée à 337 locks, et relève chaque onglet :

     - « 337 » n'apparaît nulle part, ni en français ni en anglais ;
     - la fourchette de son modèle se lit (« de 251 à 350 locks », Micro) ;
     - en anglais (appareil d'essai `?anglais=1`), « 251 to 350 locks ».

   Il attend Ma Couronne construite sans serveur :
     VITE_APPS=couronne VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-couronne" --emptyOutDir */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const construit = process.argv[2] || path.join(tmpdir(), 'banc-couronne');
if (!existsSync(path.join(construit, 'couronne.html'))) {
  console.error(`Pas de Ma Couronne construite dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = createServer((req, res) => {
  let f = path.join(construit, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-fourchette-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail ? ' -> ' + detail : ''}`); };
const ouvre = async (q = '') => { await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/couronne.html${q}` }); await attend(6000); };

/* LA CLIENTE DU BANC : comptée à 337 locks par la Maison (Micro, 251 à 350). */
const COMPTE = 337;
const CLIENTE = { id: 'c-local', branchId: 'maison', name: 'Awa Banc', lockCount: COMPTE, since: '2024-03-02', segments: ['Ma Couronne'] };
/* Semée AVANT que l'app ne démarre, à chaque chargement : semée après coup,
   l'app réécrivait sa liste en mémoire (vide) par-dessus. */
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('mnd_reset_v5', '1'); localStorage.setItem('couronne::mnd_clients', ${JSON.stringify(JSON.stringify([CLIENTE]))}); } catch (e) {}` });

/* Tout le texte VISIBLE de l'écran (nœuds de texte affichés, indications des champs). */
const TEXTE = String.raw`(() => {
  const out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const txt = n.textContent.replace(/\s+/g, ' ').trim(); if (!txt) continue;
    const el = n.parentElement; if (!el) continue;
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || s.visibility === 'hidden' || s.display === 'none') continue;
    out.push(txt);
  }
  for (const el of document.querySelectorAll('input, textarea')) if (el.value || el.placeholder) out.push(el.value || el.placeholder);
  return out.join(' | ');
})()`;

const releve = async (q, langue) => {
  await ouvre(q);
  const noms = await evalue(`[...document.querySelectorAll('.mc-tab .mc-tab__label')].map((b) => b.textContent.trim())`) ?? [];
  dit(`${langue} : l app s ouvre et montre ses onglets`, noms.length >= 3, noms.join(', ') || 'aucun onglet');
  const parOnglet = [];
  for (const [i, nom] of noms.entries()) {
    await evalue(`document.querySelectorAll('.mc-tab')[${i}].click()`);
    await attend(1300);
    parOnglet.push([nom, (await evalue(TEXTE)) ?? '']);
  }
  return parOnglet;
};

/* 1. En français. */
const fr = await releve('', 'francais');
const prenom = fr.some(([, t]) => t.includes('Awa'));
dit('francais : c est bien la cliente du banc qui est ouverte', prenom);
const fuitesFr = fr.filter(([, t]) => new RegExp(String.raw`(^|\D)${COMPTE}(\D|$)`).test(t)).map(([n]) => n);
dit(`francais : « ${COMPTE} » n apparait sur aucun onglet`, fuitesFr.length === 0, fuitesFr.join(', ') || 'aucun');
const ouFr = fr.filter(([, t]) => t.includes('de 251 à 350 locks')).map(([n]) => n);
dit('francais : la fourchette de son modele se lit', ouFr.length >= 2, ouFr.join(', ') || 'nulle part');
dit('francais : le calibre est nomme (Micro)', fr.some(([, t]) => /Couronne Micro · de 251 à 350 locks/.test(t)));

/* 2. En anglais, sur un appareil d'essai. */
await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36', acceptLanguage: 'en-GB,en' });
const en = await releve('?anglais=1', 'anglais');
const fuitesEn = en.filter(([, t]) => new RegExp(String.raw`(^|\D)${COMPTE}(\D|$)`).test(t)).map(([n]) => n);
dit(`anglais : « ${COMPTE} » n apparait sur aucun onglet`, fuitesEn.length === 0, fuitesEn.join(', ') || 'aucun');
const ouEn = en.filter(([, t]) => t.includes('251 to 350 locks')).map(([n]) => n);
dit('anglais : la fourchette se lit en anglais', ouEn.length >= 2, ouEn.join(', ') || 'nulle part');
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nMa Couronne dit la fourchette, jamais le compte.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
