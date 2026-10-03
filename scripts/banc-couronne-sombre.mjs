/* LE BANC DE MA COURONNE LE SOIR — `node scripts/banc-couronne-sombre.mjs [dossier construit] [capture]`.

   3 octobre 2026, maquette « Ma Couronne, sombre et bilingue » validée. La
   promesse : le soir, Ma Couronne passe en indigo profond, et TOUT ce qui
   s'écrit reste lisible. Ce banc ne lit pas la feuille de style : il ouvre la
   vraie app, hors ligne, dans un téléphone émulé (390 × 844, doigt) réglé en
   sombre, parcourt les onglets, et MESURE pour chaque texte affiché le
   contraste entre sa couleur et le fond réellement peint derrière lui.

     - le fond de l'app est sombre (sinon le mode sombre n'est pas branché) ;
     - aucun texte sous 3:1 (le seuil des gros textes, et le plancher de tout) ;
     - le choix « Clair » de Profil l'emporte sur le téléphone sombre.

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
const L = 390, H = 844;
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
await cdp('Emulation.setDeviceMetricsOverride', { width: L, height: H, deviceScaleFactor: 2, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const sombre = (oui) => cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: oui ? 'dark' : 'light' }, { name: 'hover', value: 'none' }] });

/* LE RELEVÉ DES CONTRASTES : pour chaque élément qui porte du texte à lui,
   la couleur du texte contre le premier fond opaque peint derrière (les fonds
   en dégradé ou en image sont écartés : on ne sait pas les lire en un point). */
const RELEVE = `(() => {
  const rgb = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const melange = (h, b) => ({ r: h.r * h.a + b.r * (1 - h.a), g: h.g * h.a + b.g * (1 - h.a), b: h.b * h.a + b.b * (1 - h.a), a: 1 });
  const fond = (el) => {
    const couches = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = rgb(s.backgroundColor);
      if (c && c.a > 0) { couches.push(c); if (c.a >= 1) break; }
    }
    let f = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = couches.length - 1; i >= 0; i--) f = melange(couches[i], f);
    return f;
  };
  const faibles = [];
  let n = 0;
  for (const el of document.querySelectorAll('body *')) {
    const texte = [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.textContent.trim()).join(' ').trim();
    if (!texte) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > innerHeight) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || Number(s.opacity) < 0.6) continue;
    const c = rgb(s.color); const f = fond(el);
    if (!c || !f) continue;
    const t = melange(c, f);
    const a = lum(t), b = lum(f);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    n++;
    if (ratio < 3) faibles.push(Math.round(ratio * 10) / 10 + ' : ' + texte.slice(0, 40) + ' (' + String(el.className).slice(0, 30) + ')');
  }
  const app = fond(document.querySelector('.mc-viewport') || document.body);
  return { n, faibles, fondApp: app ? Math.round(lum(app) * 1000) / 1000 : null };
})()`;

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail ? ' -> ' + detail : ''}`); };

await sombre(true);
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/couronne.html` });
await attend(6000);
const ONGLETS = await evalue(`[...document.querySelectorAll('.mc-tab')].map((b) => b.textContent.trim())`) ?? [];
dit('l app s ouvre et montre ses onglets', ONGLETS.length >= 3, ONGLETS.join(', ') || 'aucun onglet');
for (const [i, nom] of ONGLETS.entries()) {
  await evalue(`document.querySelectorAll('.mc-tab')[${i}].click()`);
  await attend(1200);
  const r = await evalue(RELEVE);
  if (!r) { dit(`${nom} : releve`, false, 'rien'); continue; }
  if (i === 0) dit('le soir, le fond de l app est sombre', r.fondApp !== null && r.fondApp < 0.05, `luminance ${r.fondApp}`);
  dit(`${nom} : ${r.n} textes, aucun sous 3:1`, r.faibles.length === 0, r.faibles.slice(0, 6).join(' | ') || 'tous lisibles');
  if (capture) {
    const img = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${capture}-${String(i).padStart(2, '0')}-${nom.replace(/[^\w]+/g, '-')}.png`, Buffer.from(img.result.data, 'base64'));
  }
}
/* L'ÉCRAN DE RÉSERVATION, qui s'ouvre par-dessus les onglets. */
await evalue(`document.querySelectorAll('.mc-tab')[0].click()`);
await attend(800);
const ouvert = await evalue(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /r[ée]server un rituel|^book/i.test(x.textContent.trim())); if (b) b.click(); return !!b; })()`);
await attend(1500);
const resa = ouvert ? await evalue(RELEVE) : null;
dit('Reserver : l ecran s ouvre', !!ouvert, ouvert ? '' : 'bouton introuvable');
if (resa) dit(`Reserver : ${resa.n} textes, aucun sous 3:1`, resa.faibles.length === 0, resa.faibles.slice(0, 6).join(' | ') || 'tous lisibles');
if (resa && capture) {
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-90-Reserver.png`, Buffer.from(img.result.data, 'base64'));
}
/* LES BOUTONS PLEINS ET LES CHOIX SÉLECTIONNÉS, posés dans la vraie page avec
   la vraie feuille : hors ligne, le parcours de réservation ne va pas jusqu'au
   jour et à l'heure. Ce sont eux qui passent de l'indigo au cuivre le soir. */
await evalue(`(() => {
  const d = document.createElement('div');
  d.id = 'banc-pleins';
  d.style.cssText = 'position:fixed;inset:0;z-index:9999;padding:20px;display:grid;gap:10px;align-content:start;background:var(--paper)';
  d.innerHTML = '<button class="mc-cta mc-cta--indigo">Confirmer</button>'
    + '<button class="mc-smallcta mc-smallcta--indigo">Choisir</button>'
    + '<button class="mc-smallcta">Ajouter</button>'
    + '<div class="mc-calday is-sel">Sam 11</div>'
    + '<div class="mc-slotcard is-sel"><span class="mc-slotcard__time">10:00</span><span class="mc-slotcard__who">avec Brice</span><span class="mc-slotcard__free">libre</span></div>'
    + '<div class="mc-jour is-on">Lun</div>'
    + '<div class="mc-pourqui__chip is-on">Pour moi</div>'
    + '<div class="mc-qtystep"><button>+</button></div>'
    + '<span class="mc-idcard__initial">A</span>';
  document.body.appendChild(d);
  return true;
})()`);
await attend(400);
const pleins = await evalue(RELEVE);
dit(`Boutons pleins et choix : ${pleins?.n ?? 0} textes, aucun sous 3:1`, !!pleins && pleins.n >= 8 && pleins.faibles.length === 0, pleins?.faibles.slice(0, 6).join(' | ') || 'tous lisibles');
if (capture) {
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-91-Pleins.png`, Buffer.from(img.result.data, 'base64'));
}
await evalue(`document.getElementById('banc-pleins').remove()`);
/* Le choix de Profil l'emporte sur le téléphone. */
await evalue(`localStorage.setItem('mc_theme', 'clair'); location.reload()`);
await attend(5000);
const clair = await evalue(RELEVE);
dit('« Clair » choisi : clair meme sous un telephone sombre', !!clair && clair.fondApp > 0.6, `luminance ${clair?.fondApp}`);
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nMa Couronne se lit le soir.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
