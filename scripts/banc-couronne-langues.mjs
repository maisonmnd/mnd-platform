/* LE BANC DE MA COURONNE EN ANGLAIS — `node scripts/banc-couronne-langues.mjs [dossier construit] [capture]`.

   3 octobre 2026, maquette « Ma Couronne, sombre et bilingue » validée. Le
   harnais `verifie-couronne-langues` lit le code ; ce banc ouvre la VRAIE app,
   hors ligne, dans un téléphone émulé (390 × 844) dont la langue est l'anglais,
   et regarde ce qu'une cliente lirait :

     - tant que l'anglais n'est pas ouvert (ANGLAIS_OUVERT), un téléphone
       anglais lit Ma Couronne EN FRANÇAIS et Profil ne propose rien ;
     - sur un appareil d'essai (`?anglais=1`), les onglets disent Home,
       Journey… et chaque onglet est relevé : toute phrase française encore
       visible est listée (le catalogue de la Maison, encore en français
       jusqu'à l'étape 3, est mis à part) ;
     - dans Profil, « Français » remet le français, et le choix tient au
       rechargement.

   Il attend Ma Couronne construite sans serveur :
     VITE_APPS=couronne VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-couronne" --emptyOutDir
   `capture` (facultatif) : un préfixe, chaque écran donne <préfixe>-<onglet>.png. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const construit = process.argv[2] || path.join(tmpdir(), 'banc-couronne');
const capture = process.argv[3] || '';
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-mc-'));
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
/* UN TÉLÉPHONE ANGLAIS : navigator.language = en-GB. */
await cdp('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Mobile Safari/537.36', acceptLanguage: 'en-GB,en' });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail ? ' -> ' + detail : ''}`); };
const onglets = () => evalue(`[...document.querySelectorAll('.mc-tab .mc-tab__label')].map((b) => b.textContent.trim())`);
const ouvre = async (q = '') => { await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/couronne.html${q}` }); await attend(6000); };

/* LE FRANÇAIS ENCORE VISIBLE : chaque nœud de texte affiché qui porte un mot
   outil français. Les noms propres de la Maison et la devise passent. */
const RELEVE = String.raw`(() => {
  const MOTS = /(^|[\s'’(«])(le|la|les|vous|votre|vos|une|des|du|pour|avec|est|sur|dans|pas|mon|mes|et|au|aux|ou|qui|que|ce|cette|séance|séances|rendez-vous|prestation|prestations)(?=[\s,.:;!?’')»]|$)/i;
  const PASSE = /Ma Couronne|Maison MND|mi nyɔ́ ɖɛkpɛ|L’Atelier MND|Studio MND|MND Académie|à la carte/g;
  const vus = new Set(); const fr = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const txt = n.textContent.replace(/\s+/g, ' ').trim();
    if (txt.length < 3 || vus.has(txt)) continue;
    const el = n.parentElement; if (!el) continue;
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (r.width < 1 || r.height < 1 || s.visibility === 'hidden' || s.display === 'none') continue;
    vus.add(txt);
    if (MOTS.test(txt.replace(PASSE, ''))) fr.push(txt.slice(0, 90) + '  [' + String(el.className).slice(0, 24) + ']');
  }
  /* Ce que les nœuds de texte ne disent pas (3 octobre : « jour · mois ·
     année » du champ de naissance avait échappé au relevé) : les indications
     des champs et l'option affichée de chaque liste. */
  const FR_COURT = /^(jour|mois|année|annee|nom|prénom|ville|téléphone|rechercher|choisir)$/i;
  for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder], select')) {
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    const txt = (el.tagName === 'SELECT' ? (el.selectedOptions[0]?.textContent ?? '') : el.placeholder).trim();
    if (!txt || vus.has(txt)) continue;
    vus.add(txt);
    if (FR_COURT.test(txt) || MOTS.test(txt.replace(PASSE, ''))) fr.push(txt.slice(0, 90) + '  [' + el.tagName.toLowerCase() + ']');
  }
  return { n: vus.size, fr, lang: document.documentElement.lang };
})()`;

/* 1. L'anglais n'est pas encore ouvert : un téléphone anglais lit le français. */
await ouvre();
const avant = await onglets();
dit('l app s ouvre et montre ses onglets', (avant ?? []).length >= 3, (avant ?? []).join(', ') || 'aucun onglet');
dit('anglais fermé : un telephone anglais lit Ma Couronne en francais', (avant ?? []).includes('Accueil'), (avant ?? []).join(', '));
await evalue(`[...document.querySelectorAll('.mc-tab')].at(-1).click()`);
await attend(1200);
const choixAvant = await evalue(`!!document.querySelector('.mc-seg [lang="en"]')`);
dit('... et Profil ne propose pas encore la langue', choixAvant === false);

/* 2. Un appareil d'essai : l'anglais, onglet par onglet. */
await ouvre('?anglais=1');
const apres = await onglets();
dit('appareil d essai : les onglets parlent anglais', ['Home', 'Journey', 'Profile'].every((x) => (apres ?? []).includes(x)), (apres ?? []).join(', '));
let total = 0; const restes = new Map();
for (const [i, nom] of (apres ?? []).entries()) {
  await evalue(`document.querySelectorAll('.mc-tab')[${i}].click()`);
  await attend(1300);
  const r = await evalue(RELEVE);
  if (i === 0) dit('la page se declare en anglais (lang="en")', r?.lang === 'en', r?.lang);
  total += r?.n ?? 0;
  for (const x of r?.fr ?? []) restes.set(x, nom);
  if (capture) {
    const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(`${capture}-${String(i).padStart(2, '0')}-${nom.replace(/[^\w]+/g, '-')}.png`, Buffer.from(img.result.data, 'base64'));
  }
}
console.log(`\n${total} textes releves en anglais. Francais encore visible (${restes.size}) :`);
for (const [x, nom] of restes) console.log(`   ${nom.padEnd(8)} ${x}`);
dit('en anglais, aucune phrase francaise visible', restes.size === 0, `${restes.size} reste(s)`);
console.log('');

/* 3. Profil : le choix, le retour au français, et sa tenue au rechargement. */
await evalue(`[...document.querySelectorAll('.mc-tab')].at(-1).click()`);
await attend(1200);
const choix = await evalue(`[...document.querySelectorAll('.mc-seg [lang]')].map((b) => b.textContent.trim() + (b.getAttribute('aria-checked') === 'true' ? '*' : ''))`);
dit('Profil propose Francais / English, English coche', JSON.stringify(choix) === JSON.stringify(['Français', 'English*']), JSON.stringify(choix));
await evalue(`document.querySelector('.mc-seg [lang="fr"]').click()`);
await attend(900);
const enFr = await onglets();
dit('« Francais » remet les onglets en francais sur-le-champ', (enFr ?? []).includes('Accueil') && (enFr ?? []).includes('Profil'), (enFr ?? []).join(', '));
await evalue(`location.reload()`);
await attend(6000);
const tenu = await onglets();
dit('... et le choix tient au rechargement', (tenu ?? []).includes('Accueil'), (tenu ?? []).join(', '));
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nMa Couronne change de langue.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
