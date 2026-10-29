/* LE BANC DU TRI DES DÉMARCHEURS — `node scripts/banc-du-tri.mjs [capture]`.

   29 octobre 2026 (maquette Re299vtp… validée). Le banc ouvre le VRAI Trône
   sur une session gardée de la direction, Supabase injoignable sauf deux
   portes que le banc sert lui-même : le registre du tri (documents ·
   mnd_tri_des_messages) et la fonction `tri-des-messages`. Il sème quatre
   fils (un démarcheur bloqué, une proposition, un inconnu, une cliente) et
   touche les gestes :

     - « Propositions · 1 » et « Bloqués · 1 » ; ni l'un ni l'autre dans
       « À traiter » ;
     - un bloqué ouvert dit son motif, « Débloquer » appelle la fonction ;
     - la passe des 24 heures propose, coche le démarcheur, et « Bloquer les
       cochés » l'envoie ;
     - un fil sans fiche : « Bloquer ce numéro », puis la confirmation ;
     - au téléphone, rien ne déborde ; aucune erreur dans la page.

   Les numéros et les noms sont faux. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-tri-'));
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-tri-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));

/* Ce que le banc sert à la place du serveur : le registre, et la fonction. */
const ilYA = (min) => new Date(Date.now() - min * 60000).toISOString();
const D = '22960000011'; const P = '22960000012'; const I = '22960000013';
const registre = {
  bloques: { [D]: { numero: D, quand: ilYA(30), motif: 'services numériques : affiches, vidéos, sites web', extrait: 'Je crée affiches, vidéos et sites web', nom: 'B. digital', par: 'claude', meta: 'bloque' } },
  propositions: { [P]: { numero: P, quand: ilYA(20), motif: 'huiles pour locks', extrait: 'Nous fabriquons des huiles', nom: 'Huilerie K.', par: 'claude' } },
  blancs: {}, juges: {},
};
const appelsDuTri = [];
const CORS = [{ name: 'access-control-allow-origin', value: '*' }, { name: 'access-control-allow-headers', value: '*' }, { name: 'access-control-allow-methods', value: '*' }, { name: 'content-type', value: 'application/json' }];
const UID = 'u-banc-tri';
const UTILISATEUR = { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date(Date.now() - 86_400_000).toISOString() };
const servi = (url, methode, corps, accept) => {
  const u = new URL(url);
  /* La session et la fiche de la direction : le Trône sait que c'est elle (comme banc-des-discussions). */
  if (u.pathname === '/auth/v1/token') return [200, { access_token: 'faux-2', refresh_token: 'faux-2', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: UTILISATEUR }];
  if (u.pathname === '/auth/v1/user') return [200, UTILISATEUR];
  if (u.pathname === '/rest/v1/staff' && methode === 'GET') {
    const fiche = { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] };
    return [200, /object/.test(accept) ? fiche : [fiche]];
  }
  if (u.pathname === '/rest/v1/documents' && methode === 'GET' && (u.searchParams.get('key') ?? '') === 'eq.mnd_tri_des_messages') {
    const ligne = { data: registre };
    return [200, /object/.test(accept) ? ligne : [ligne]];
  }
  if (u.pathname === '/functions/v1/tri-des-messages' && methode === 'POST') {
    const d = JSON.parse(corps || '{}');
    appelsDuTri.push(d);
    if (d.geste === 'passe') return [200, { ok: true, lus: 2, proposes: [{ numero: '22960000031', nom: 'W. agence', extrait: 'Je crée des sites web pour les salons', verdict: 'demarchage', motif: 'services numériques' }], version: 'banc' }];
    if (d.geste === 'bloquer') return [200, { ok: true, bloques: (d.numeros ?? []).length, refuses: 0, version: 'banc' }];
    return [200, { ok: true, meta: true, version: 'banc' }];
  }
  return null;
};

let ko = 0;
try {
  let cible;
  for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
  if (!cible) throw new Error('Chrome ne repond pas.');
  const ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const enCours = new Map(); const erreurs = [];
  const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails.text);
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      if (request.method === 'OPTIONS') { void cdp('Fetch.fulfillRequest', { requestId, responseCode: 204, responseHeaders: CORS }); return; }
      const r = servi(request.url, request.method, request.postData, request.headers?.Accept ?? request.headers?.accept ?? '');
      if (!r) { void cdp('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' }); return; }
      const corps = typeof r[1] === 'string' ? r[1] : JSON.stringify(r[1]);
      void cdp('Fetch.fulfillRequest', { requestId, responseCode: r[0], responseHeaders: CORS, body: Buffer.from(corps).toString('base64') });
    }
  });
  const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await cdp('Runtime.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:9/*' }] });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + String(detail).slice(0, 260) : ''}`); };
  const photo = async (etape) => {
    if (!capture) return;
    const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };
  const texte = () => evalue('document.body.innerText');
  const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
  const clique = (selecteur, mot) => evalue(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.offsetParent !== null && x.innerText.trim().replace(/\\s+/g, ' ').toLowerCase().startsWith(${JSON.stringify(mot.toLowerCase())}));
    if (b) b.click();
    return !!b;
  })()`);
  const segments = () => evalue(String.raw`[...document.querySelectorAll('.trc-bx__segments button, .trc-bx__puces button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim())`);

  const CLE = 'sb-127-auth-token';
  const le = new Date(Date.now() - 86_400_000).toISOString();
  const fiche = { id: 'c-aw', branchId: 'maison', name: 'Awa B.', phone: '+229 01 60 00 00 14', city: '', persona: '', since: '2025-01-10', photo: null, segments: [], priceCoef: 1, loyaltyPoints: 0, diaspora: false };
  const fils = [
    { id: 'wa-d1', waId: 'wamid.d1', sens: 'entrant', numero: D, nomProfil: 'B. digital', texte: 'Bonjour, je crée affiches, vidéos et sites web pour les salons.', quand: ilYA(31) },
    { id: 'wa-p1', waId: 'wamid.p1', sens: 'entrant', numero: P, nomProfil: 'Huilerie K.', texte: 'Nous fabriquons des huiles naturelles pour locks.', quand: ilYA(21) },
    { id: 'wa-i1', waId: 'wamid.i1', sens: 'entrant', numero: I, nomProfil: 'Inconnu Z.', texte: 'Bonjour, vous vendez des formations en ligne ?', quand: ilYA(11) },
    { id: 'wa-c1', waId: 'wamid.c1', sens: 'entrant', numero: '2290160000014', clientId: 'c-aw', texte: 'Je voudrais un rendez-vous samedi.', quand: ilYA(5) },
  ];
  const semence = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] } },
    'trone::mnd_clients': [fiche],
    'trone::mnd_messages_wa': fils,
  };
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/gerard?vue=conversations'; location.reload(); true`);
  const vu = await jusqua(`[...document.querySelectorAll('.trc-bx__puces button')].some((b) => /Bloqués · 1/.test(b.textContent))`, 40000);
  dit('les conversations s ouvrent, le registre est lu : « Propositions · 1 » et « Bloqués · 1 »', !!vu && JSON.stringify(await segments()).includes('Propositions · 1') && JSON.stringify(await segments()).includes('Bloqués · 1'), JSON.stringify(await segments()));
  const aTraiter = await evalue(String.raw`[...document.querySelectorAll('.trc-bx__ligne, .trc-bx__lignes li')].map((l) => l.innerText.replace(/\s+/g, ' ').slice(0, 60))`);
  dit('« À traiter » : ni le demarcheur ni la proposition ; l inconnu et la cliente y sont', !JSON.stringify(aTraiter).includes('B. digital') && !JSON.stringify(aTraiter).includes('Huilerie K.') && JSON.stringify(aTraiter).includes('Awa B.'), JSON.stringify(aTraiter));

  /* Le bloqué, ouvert. */
  dit('« Bloqués » s ouvre', await clique('.trc-bx__puces button', 'Bloqués'));
  await attend(500);
  const listeB = await evalue(String.raw`(document.querySelector('.trc-bx__defile')?.innerText || '').replace(/\s+/g, ' ')`);
  dit('... il montre le demarcheur, et la passe des 24 h', /B\. digital/.test(listeB) && /Relire les dernières 24 h/i.test(listeB), listeB.slice(0, 200));
  await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-bx__lignes button, .trc-bx__lignes li')].find((x) => x.innerText.includes('B. digital')); (b?.querySelector('button') ?? b)?.click(); return !!b; })()`);
  await attend(800);
  const ficheB = await evalue(String.raw`(document.querySelector('.trc-bx__fiche, .trc-bx__tri')?.innerText || document.body.innerText).replace(/\s+/g, ' ')`);
  dit('... ouvert : « Bloqué », son motif et son jour avec l annee, et « Débloquer »', /Bloqué/.test(ficheB) && /Démarchage : services numériques/.test(ficheB) && /\d{4}/.test(ficheB) && /Débloquer/i.test(ficheB), ficheB.slice(0, 240));
  await photo('1-bloque');
  const n0 = appelsDuTri.length;
  dit('... « Débloquer »', await clique('.trc-bx__tri button', 'Débloquer'));
  await attend(800);
  dit('... appelle la fonction avec le geste et le numero', JSON.stringify(appelsDuTri.slice(n0)) === JSON.stringify([{ geste: 'debloquer', numero: D }]), JSON.stringify(appelsDuTri.slice(n0)));

  /* La passe des 24 heures. */
  await clique('.trc-bx__puces button', 'Bloqués');
  await attend(300);
  if (!(await evalue(`[...document.querySelectorAll('.trc-bx__puces button')].some((b) => b.getAttribute('aria-pressed') === 'true' && /Bloqués/.test(b.textContent))`))) await clique('.trc-bx__puces button', 'Bloqués');
  await attend(300);
  dit('« Relire les dernières 24 h »', await clique('button', 'Relire les dernières 24 h'));
  const modal = await jusqua(String.raw`(() => { const m = document.querySelector('.mnd-modal'); return m && /W\. agence/.test(m.innerText) ? m.innerText.replace(/\s+/g, ' ') : ''; })()`, 8000);
  dit('... la fenetre propose le demarcheur, deja coche ; rien n est bloque sans vous', !!modal && /rien n’est bloqué sans vous/.test(modal) && (await evalue(`document.querySelector('.mnd-modal input[type=checkbox]')?.checked === true`)) === true, String(modal).slice(0, 220));
  await photo('2-passe');
  const n1 = appelsDuTri.length;
  dit('... « Bloquer les cochés (1) »', await clique('.mnd-modal button', 'Bloquer les cochés'));
  await attend(800);
  dit('... envoie le numero coche', JSON.stringify(appelsDuTri.slice(n1)) === JSON.stringify([{ geste: 'bloquer', numeros: ['22960000031'] }]), JSON.stringify(appelsDuTri.slice(n1)));

  /* Un fil sans fiche, à la main. */
  await clique('.trc-bx__segments button', 'À traiter');
  await attend(500);
  await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-bx__lignes button, .trc-bx__lignes li')].find((x) => x.innerText.includes('Inconnu Z.')); (b?.querySelector('button') ?? b)?.click(); return !!b; })()`);
  await attend(800);
  dit('un fil sans fiche : « Bloquer ce numéro »', await clique('.trc-bx__fiche button, .trc-bx__autres button', 'Bloquer ce numéro'));
  await attend(300);
  const confirme = await evalue(String.raw`(document.querySelector('.trc-bx__tri')?.innerText || '').replace(/\s+/g, ' ')`);
  dit('... demande confirmation, et dit ce que ca fait', /il ne pourra plus écrire à la Maison/.test(confirme), confirme.slice(0, 160));
  const n2 = appelsDuTri.length;
  await clique('.trc-bx__tri button', 'Bloquer');
  await attend(800);
  dit('... « Bloquer » envoie ce numero', JSON.stringify(appelsDuTri.slice(n2)) === JSON.stringify([{ geste: 'bloquer', numeros: [I] }]), JSON.stringify(appelsDuTri.slice(n2)));

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await attend(800);
  dit('au telephone (390 px), rien ne deborde', (await evalue('document.documentElement.scrollWidth > window.innerWidth + 1')) === false, String(await evalue('document.documentElement.scrollWidth')));
  await photo('3-telephone');
  dit('aucune erreur dans la page', erreurs.length === 0 && !/Unexpected Application Error|Cet écran ne s.est pas ouvert/i.test(await texte()), erreurs.slice(0, 3).join(' | ') || 'aucune');
  ws.close();
} catch (e) {
  ko++;
  console.log('ECHEC', e?.message ?? e);
} finally {
  chrome.kill(); serveur.close();
  setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
}
console.log(ko === 0 ? '\nLe tri se voit et se touche.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
