/* LE BANC DES ÉCRANS AU TÉLÉPHONE — `node scripts/banc-des-ecrans-au-telephone.mjs [dossier construit] [capture] [--prouve]`.

   5 novembre 2026, Yéman : « Make conversations and assistant phone
   responsive. Not working well. The app must be entirely phone responsive. »

   Le banc du téléphone (banc-du-telephone.mjs) ne regarde que les
   Conversations. Celui-ci ouvre CHAQUE écran du menu (index.tsx), et les vues
   de Perle, dans un téléphone DEBOUT émulé par le protocole de Chrome
   (390 × 844, doigt, sans survol) et tient une seule promesse, écran par
   écran : la page ne glisse pas de côté, et rien ne dépasse à droite de
   l'écran, hors des rangées qui glissent exprès (overflow-x auto) et du
   tiroir du menu fermé.

   Il attend le même Trône construit que le banc du téléphone :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir
   Le dossier se donne en chemin Windows (C:\...) : le serveur compare des
   chemins à barres obliques inverses.
   `capture` (facultatif) : un préfixe, chaque écran donne <préfixe>-<route>.png.
   `--prouve` : le banc se retourne contre lui-même, une page élargie de force
   doit le faire tomber. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--prouve');
const prouve = process.argv.includes('--prouve');
const construit = path.resolve(args[0] || path.join(tmpdir(), 'banc-trone'));
const capture = args[1] || '';
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trone construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
const L = 390, H = 844;

/* Les écrans : lus dans le menu même, pour qu'un écran ajouté demain soit
   éprouvé sans qu'on pense à l'inscrire ici. */
const index = readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'src', 'apps', 'trone', 'routes', 'index.tsx'), 'utf8');
const chemins = [...new Set([...index.matchAll(/path: '(\/[^']*)'/g)].map((m) => m[1]))].sort();
const VUES_DE_PERLE = ['gerard?vue=aujourdhui', 'gerard?vue=conversations&filtre=tout', 'gerard?vue=avis', 'gerard?vue=offres', 'gerard?vue=rapporte'];
const ECRANS = [...chemins.map((c) => c.slice(1)), ...VUES_DE_PERLE];

/* Une Maison factice : des fiches et des fils, comme le banc du téléphone. */
const ilYA = (min) => new Date(Date.now() - min * 60000).toISOString();
const pad = (n, l) => String(n).padStart(l, '0');
const fiches = Array.from({ length: 30 }, (_, i) => ({ id: 'c' + pad(i, 5), branchId: 'maison', name: ['Akouavi Hounkpe', 'Grace Ahouansou', 'Naffi Morou', 'Awa Kossou'][i % 4] + ' ' + i, phone: '+22901' + pad(51000000 + i, 8), city: 'Cotonou', since: '2026-01-05', segments: [], priceCoef: 1, loyaltyPoints: 0 }));
const fils = Array.from({ length: 10 }, (_, k) => ({ id: 'w1-' + k, sens: k % 2 ? 'sortant' : 'entrant', numero: '2290151000001', clientId: fiches[1].id,
  texte: k % 2 ? 'Bonjour Madame, votre rendez-vous de demain est bien noté.' : 'Bonsoir, est-ce que je peux décaler mon entretien de samedi ?', quand: ilYA(14 * 60 - k * 55), waId: 'wamid.' + k }));
const SEME = `<script>localStorage.clear();localStorage.setItem('mnd_reset_v5','1');
localStorage.setItem('trone::mnd_clients', ${JSON.stringify(JSON.stringify(fiches))});
localStorage.setItem('trone::mnd_messages_wa', ${JSON.stringify(JSON.stringify(fils))});
</script>`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
let seme = false;
const serveur = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const f = path.join(construit, decodeURIComponent(url.pathname));
  if (!f.startsWith(construit) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  let c = readFileSync(f);
  if (url.pathname === '/trone.html' && !seme) { seme = true; c = Buffer.from(c.toString('utf8').replace('<head>', '<head>' + SEME)); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(c);
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-ecrans-'));
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
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });
await cdp('Emulation.setDeviceMetricsOverride', { width: L, height: H, deviceScaleFactor: 2, mobile: true });

/* Ce qu'on relève : la largeur de la page, et ce qui dépasse à droite sans
   être dans une rangée qui glisse (la règle du banc du téléphone). */
const RELEVE = `(() => {
  const glisse = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX === 'visible') continue;
      return p.getBoundingClientRect().right <= innerWidth + 1;
    }
    return false;
  };
  const visible = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const dehors = [...document.querySelectorAll('body *')].filter((e) => {
    if (e.closest('.tr-side') || !visible(e)) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > innerWidth + 1 && !glisse(e);
  });
  /* Le plus haut seulement : ses enfants dépassent avec lui. */
  const racines = dehors.filter((e) => !dehors.includes(e.parentElement));
  return { largeur: document.documentElement.scrollWidth, titre: (document.querySelector('.tr-page-head h1, .tr-page-head h2')?.textContent || '').trim().slice(0, 40),
    dehors: racines.slice(0, 5).map((e) => String(typeof e.className === 'string' && e.className ? e.className.split(' ')[0] : e.tagName).slice(0, 40) + ' ' + Math.round(e.getBoundingClientRect().right) + 'px') };
})()`;

let ko = 0;
const echecs = [];
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/` });
await attend(7000);
if (prouve) await evalue(`(() => { const s = document.createElement('style'); s.textContent = '.tr-content__inner { min-width: 900px !important; }'; document.head.appendChild(s); })()`);
for (const route of ECRANS) {
  await evalue(`location.hash = '#/${route}'`);
  await attend(1800);
  const r = await evalue(RELEVE);
  if (!r) { ko++; echecs.push(`${route} : aucun releve`); console.log(`ECHEC /${route} : aucun releve`); continue; }
  const ok = r.largeur <= L && r.dehors.length === 0;
  if (!ok) { ko++; echecs.push(`/${route}`); }
  console.log(`${ok ? 'OK   ' : 'ECHEC'} /${route}${r.titre ? ' (' + r.titre + ')' : ''}${ok ? '' : ` -> page ${r.largeur} px ; dehors : ${r.dehors.join(', ') || 'rien'}`}`);
  if (capture) {
    const img = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${capture}-${route.replace(/[^a-z0-9]+/gi, '_')}.png`, Buffer.from(img.result.data, 'base64'));
  }
}
const erreursUniques = [...new Set(erreurs)];
console.log(`\nErreurs de page : ${erreursUniques.length ? erreursUniques.slice(0, 5).join(' | ') : 'aucune'}`);

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
if (prouve) {
  console.log(ko > 0 ? `\nPREUVE : la page elargie de force fait tomber ${ko} ecran(s) sur ${ECRANS.length}.` : '\nPREUVE MANQUEE : une page elargie de force passe le banc.');
  setTimeout(() => process.exit(ko > 0 ? 0 : 1), 1600);
} else {
  console.log(ko === 0 ? `\nLes ${ECRANS.length} ecrans tiennent dans un telephone debout.` : `\n${ko} ecran(s) sur ${ECRANS.length} depassent : ${echecs.join(' ')}`);
  setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
}
