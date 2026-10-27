/* LE BANC DE LA PRÉVISION QUI DÉCIDE — `node scripts/banc-de-la-prevision-du-mois.mjs [capture]`.

   27 octobre 2026 : la carte du tableau de bord refaite (maquette
   Q9Nkir2cdF4jSP6QDTH3cG). Le harnais éprouve le calcul
   (`verifie-la-prevision-du-mois`) ; ce banc ouvre le VRAI Trône, Supabase
   injoignable, sur une session gardée de la direction, sème un mois
   d'exemple et lit l'écran :

     - la carte s'ouvre, un bouton par jour du mois, la courbe du cumul ;
     - un jour à venir touché ouvre son détail (RDV posés, gestes) ;
     - « Le calendrier de ce jour » mène au calendrier, sur ce jour ;
     - une ligne du calcul s'ouvre sur son explication ;
     - l'objectif s'enregistre et l'écart s'affiche ;
     - au téléphone (390 px), rien ne déborde ; aucune erreur.

   Les fiches sont des exemples, signées d'initiales. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-prev-'));
console.log('Construction du Trone (serveur injoignable)...');
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-prev-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));

let ko = 0;
try {
  let cible;
  for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
  if (!cible) throw new Error('Chrome ne repond pas.');
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
  const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + String(detail).slice(0, 260) : ''}`); };
  const photo = async (etape) => {
    if (!capture) return;
    if (etape === '5-page') {
      /* La page défile dans son conteneur : la fenêtre s'allonge le temps de la photo. */
      const h = await evalue(`Math.max(...[document.documentElement, ...document.querySelectorAll('*')].map((e) => e.scrollHeight))`);
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: Math.min(h, 12000), deviceScaleFactor: 1, mobile: false });
      await attend(400);
      const img = await cdp('Page.captureScreenshot', { format: 'png' });
      writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
      await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
      return;
    }
    const r = await evalue(`(() => { const s = document.querySelector('.trd-mois'); if (!s) return null; const b = s.getBoundingClientRect(); return { x: b.left + window.scrollX, y: b.top + window.scrollY, w: b.width, h: b.height }; })()`);
    const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(r ? { clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } } : {}) });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };
  const texte = () => evalue('document.body.innerText');
  const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
  const tombe = async () => /Unexpected Application Error|Cet écran ne s.est pas ouvert|Unexpected error/i.test(await texte());

  /* La session gardée, et un mois d'exemple. */
  const UID = 'u-banc-prev';
  const CLE = 'sb-127-auth-token';
  const le = new Date(Date.now() - 86_400_000).toISOString();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const auj = new Date();
  const date = (n) => iso(new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() + n));
  const premier = new Date(auj.getFullYear(), auj.getMonth(), 1);
  const dernier = new Date(auj.getFullYear(), auj.getMonth() + 1, 0);
  const instant = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
  const services = [
    { id: 's1', categoryId: 'c1', name: 'SÍNSIN™ Essentiel · La Reprise', palier: 'Fondation', priceXof: 40000, hidePrice: false, sessions: 1, durationMin: 120, order: 1 },
    { id: 's2', categoryId: 'c1', name: 'DÀNDÀN™ · Le Soin Hydratant', palier: 'Fondation', priceXof: 30000, hidePrice: false, sessions: 1, durationMin: 60, order: 2 },
  ];
  const fiche = (id, name) => ({ id, branchId: 'maison', name, phone: '+229 01 51 00 00 11', city: '', persona: '', since: '2025-01-10', photo: null, segments: [], priceCoef: 1, loyaltyPoints: 0, diaspora: false });
  const clients = ['A. K.', 'M. D.', 'F. S.', 'C. O.', 'N. B.', 'P. L.', 'T. E.', 'R. M.', 'S. Y.', 'L. H.'].map((n, i) => fiche(`c${i}`, n));
  let k = 0;
  const rdv = (clientId, d, status, extra = {}) => ({ id: `r${++k}`, branchId: 'maison', clientId, serviceIds: ['s1'], date: d, time: '10:00', status, master: 'Team', creeLe: instant(-20), ...extra });
  const rdvs = [];
  /* Le passé du mois : des rituels honorés les jours ouverts. */
  for (let d = new Date(premier); iso(d) < date(0); d.setDate(d.getDate() + 1)) {
    const j = d.getDay();
    if (j === 0 || j === 1) continue;
    rdvs.push(rdv(`c${d.getDate() % 6}`, iso(d), 'honoré', { time: '10:00' }));
    if (d.getDate() % 3 === 0) rdvs.push(rdv(`c${(d.getDate() + 1) % 6}`, iso(d), 'honoré', { time: '14:00', serviceIds: ['s2'] }));
  }
  /* À venir : deux RDV posés dans trois jours ouverts. */
  let futur = null;
  for (let n = 1; n <= 10 && !futur; n++) {
    const d = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() + n);
    if (d > dernier) break;
    if (d.getDay() !== 0 && d.getDay() !== 1) futur = iso(d);
  }
  if (futur) { rdvs.push(rdv('c6', futur, 'confirmé', { time: '11:00' })); rdvs.push(rdv('c7', futur, 'confirmé', { time: '15:00', serviceIds: ['s2'] })); }
  /* Des reprises : deux visites espacées de 42 jours, la dernière il y a ~38 jours. */
  for (const c of ['c8', 'c9']) { rdvs.push(rdv(c, date(-80), 'honoré')); rdvs.push(rdv(c, date(-38), 'honoré')); }
  const semence = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] } },
    'trone::mnd_clients': clients,
    'trone::mnd_appointments': rdvs,
    'trone::mnd_catalog_services': services,
  };
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/'; location.reload(); true`);
  const vu = await jusqua(`document.querySelectorAll('.trd-mois__jour').length > 0`, 40000);

  /* 1. La carte. */
  dit('la carte de la prévision s ouvre au tableau de bord', !!vu && !(await tombe()));
  const nbJours = await evalue(`document.querySelectorAll('.trd-mois__jour').length`);
  dit('un bouton par jour du mois', nbJours === dernier.getDate(), nbJours);
  const points = await evalue(`(document.querySelector('.trd-mois__cumul')?.getAttribute('points') || '').split(' ').length`);
  dit('la courbe du cumul entré a ses points', points >= 2, points);
  dit('le gros chiffre et la fourchette', /Entre .+ \(bas\) et .+ \(haut\)/.test(await evalue(`document.querySelector('.trd-mois__dit')?.innerText || ''`)));
  await photo('1-carte');

  /* 2. Un jour à venir touché. */
  if (futur) {
    const touche = await evalue(`(() => { const b = [...document.querySelectorAll('.trd-mois__jour')][${Number(futur.slice(8, 10)) - 1}]; if (b) b.click(); return !!b; })()`);
    dit('un jour à venir se touche', touche);
    await attend(400);
    const panneau = await evalue(`(document.querySelector('.trd-mois__jour-detail')?.innerText || '').replace(/\\s+/g, ' ')`);
    dit('... son détail : les 2 RDV posés, attendu, places libres', /Les RDV posés · 2/i.test(panneau) && /Attendu ce jour/i.test(panneau) && /Places libres/i.test(panneau), panneau.slice(0, 220));
    dit('... le bouton pressé est celui du jour', (await evalue(`[...document.querySelectorAll('.trd-mois__jour')].findIndex((b) => b.getAttribute('aria-pressed') === 'true')`)) === Number(futur.slice(8, 10)) - 1);
    await photo('2-jour');
    await evalue(`(() => { const b = [...document.querySelectorAll('.trd-mois__jour-detail button')].find((x) => x.innerText.trim() === 'Le calendrier de ce jour'); if (b) b.click(); return !!b; })()`);
    await attend(1200);
    dit('« Le calendrier de ce jour » mène au calendrier sur ce jour', (await evalue('location.hash')) === `#/calendrier?jour=${futur}`, await evalue('location.hash'));
    await evalue(`history.back(); true`);
    await jusqua(`document.querySelectorAll('.trd-mois__jour').length > 0`, 15000);
  }

  /* 3. Une ligne du calcul. */
  const ouvert = await evalue(`(() => { const b = [...document.querySelectorAll('.trd-calc__bascule')].find((x) => /reprises/.test(x.innerText)); if (b) b.click(); return !!b; })()`);
  await attend(300);
  dit('la ligne des reprises s ouvre sur son explication', ouvert && /dont le rythme tombe/.test(await evalue(`document.querySelector('.trd-calc__detail')?.innerText || ''`)));
  dit('bas et haut sont expliqués, et l écart décomposé', /Bas et haut, en clair/.test(await texte()) && /D’où vient l’écart de/.test(await texte()));

  /* 4. L'objectif. */
  await evalue(String.raw`(() => {
    const champ = document.getElementById('trd-mois-objectif');
    const pose = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    pose.call(champ, '3000000'); champ.dispatchEvent(new Event('input', { bubbles: true }));
    champ.form.requestSubmit(); return true;
  })()`);
  await attend(500);
  const objectifs = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_objectifs_du_mois') || 'null')`);
  dit('l objectif s enregistre pour le mois', objectifs && objectifs[iso(auj).slice(0, 7)] === 3000000, JSON.stringify(objectifs));
  dit('... l écart à combler s affiche, et la ligne d objectif sur la courbe', /Il manque/.test(await evalue(`document.querySelector('.trd-mois__ecart')?.innerText || ''`)) && !!(await evalue(`!!document.querySelector('.trd-mois__ligne-objectif')`)));
  await photo('3-objectif');

  /* 5. La page en ordre : des ancres, trois groupes de lignes repliées, un seul panneau ouvert. */
  dit('les ancres de la page et ses trois groupes', JSON.stringify(await evalue(`[...document.querySelectorAll('.trd-nav a')].map((a) => a.getAttribute('href'))`)) === JSON.stringify(['#le-mois', '#aujourdhui', '#a-traiter', '#le-detail-du-mois'])
    && !!(await evalue(`!!document.getElementById('aujourdhui') && !!document.getElementById('a-traiter') && !!document.getElementById('le-detail-du-mois') && !!document.getElementById('le-mois')`)));
  const ouverts = (groupe) => evalue(`[...document.querySelectorAll('#${groupe} .trd-repli__bascule')].filter((b) => b.getAttribute('aria-expanded') === 'true').map((b) => b.querySelector('.trd-repli__titre').innerText)`);
  dit('Aujourd hui s ouvre sur le carnet du jour, avec son résumé chiffré', JSON.stringify(await ouverts('aujourdhui')) === JSON.stringify(['Le carnet du jour'])
    && /rendez-vous|libre/.test(await evalue(`document.querySelector('#aujourdhui .trd-repli__resume')?.innerText || ''`)), JSON.stringify(await ouverts('aujourdhui')));
  await evalue(`(() => { const b = [...document.querySelectorAll('#aujourdhui .trd-repli__bascule')].find((x) => /Demandes du site/.test(x.innerText)); if (b) b.click(); return !!b; })()`);
  await attend(250);
  dit('un seul panneau ouvert à la fois : les demandes ouvertes, le carnet replié', JSON.stringify(await ouverts('aujourdhui')) === JSON.stringify(['Demandes du site']), JSON.stringify(await ouverts('aujourdhui')));
  await evalue(`(() => { const b = [...document.querySelectorAll('#a-traiter .trd-repli__bascule')].find((x) => /Ce qui presse/.test(x.innerText)); if (b) b.click(); return !!b; })()`);
  await attend(250);
  const voir = await evalue(`(() => { const p = document.querySelector('#a-traiter .trd-repli.est-ouvert'); const b = p && [...p.querySelectorAll('button')].find((x) => /^voir$/i.test(x.innerText.trim()) && /impay/i.test(x.parentElement?.innerText || '')); if (b) b.click(); return !!b; })()`);
  await attend(500);
  dit('« Voir » sur les impayés échus ouvre leur ligne repliée', voir && JSON.stringify(await ouverts('a-traiter')) === JSON.stringify(['Rendez-vous impayés']), JSON.stringify(await ouverts('a-traiter')));
  await photo('5-page');

  /* 6. Au téléphone. */
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await attend(900);
  dit('au téléphone (390 px), rien ne déborde', (await evalue('document.documentElement.scrollWidth > window.innerWidth + 1')) === false, String(await evalue('document.documentElement.scrollWidth')));
  await photo('4-telephone');
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');
  ws.close();
} catch (e) {
  ko++;
  console.log('ECHEC', e?.message ?? e);
} finally {
  chrome.kill(); serveur.close();
  setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
}
console.log(ko === 0 ? '\nLa prévision décide.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
