/* LES RENDEZ-VOUS CÔTE À CÔTE, À L'ÉCRAN — `node scripts/banc-des-rendez-vous-cote-a-cote.mjs [dossier construit] [--prouve]`.

   18 novembre 2026 : « Quand les rendez-vous sont à la même heure, il y a un
   rendez-vous qui se cache. Rends-moi tout visible » (Yéman, vue jour du
   Calendrier : deux rendez-vous à 10 h chez le même maître, le second caché
   sous le premier).

   Ce banc ouvre le VRAI Trône dans Chrome, connecté comme la direction,
   devant un faux Supabase (port 47125) ; le carnet du jour vient du cache du
   poste. Il mesure les cartes de la vue jour :
     - deux rendez-vous à 10 h chez le même maître : les deux se voient, côte
       à côte, sans se recouvrir, chacun avec son nom lisible ;
     - celui de 8 h 30, qui finit à 10 h, garde toute la largeur ;
     - trois à la même heure chez un autre maître : trois voies ;
     - un rendez-vous seul l'après-midi : toute la largeur ;
     - rien ne déborde de sa colonne ;
     - le cas de l'essai réel du 18 novembre (troisième colonne) : un long
       rendez-vous de 8 h 30 chevauche les deux de 10 h, dont un de 45 min.
       Trois cartes étroites, une très courte : chaque nom se lit EN ENTIER
       (sondé en plusieurs points de chacune de ses lignes), « Encaisser » ne
       couvre plus rien.
   Les clientes et les rendez-vous sont inventés.

   Sans dossier, le banc construit le Trône lui-même (sous Node : VITE_BASE
   reste « / »). `--prouve` attend un Trône construit AVANT ce correctif : le
   banc doit y crier (les cartes s'y recouvrent). */
import { createServer } from 'node:http';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const prouve = process.argv.includes('--prouve');
const PORT = 47125;
let construit = args[0];
let aEffacer = null;
if (!construit) {
  construit = mkdtempSync(path.join(tmpdir(), 'banc-cote-'));
  aEffacer = construit;
  console.log('Construction du Trône (faux Supabase sur le port du banc)…');
  execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
    cwd: racine, stdio: 'ignore',
    env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: `http://127.0.0.1:${PORT}`, VITE_SUPABASE_ANON_KEY: 'faux', VITE_ALLOW_OPEN: 'false', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
  });
}
if (!existsSync(path.join(construit, 'trone.html'))) { console.error(`Pas de Trône construit dans ${construit}.`); process.exit(2); }

/* ── LE FAUX SUPABASE : la porte et la tête ; le reste se tait (503), le
   carnet reste celui du cache du poste. ─────────────────────────────────── */
const UID = 'u-banc-cote';
const MAINTENANT = Date.now();
const JOUR = 86_400_000;
const isoA = (ms) => new Date(MAINTENANT + ms).toISOString();
/* Le jour du salon (UTC + 1) : c'est lui que la vue jour ouvre. */
const aujourdhui = new Date(MAINTENANT + 3_600_000).toISOString().slice(0, 10);
const repond = (res, code, corps) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' });
  res.end(corps === undefined ? '' : JSON.stringify(corps));
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (/^\/(auth|rest|functions|realtime|storage)\//.test(u.pathname)) {
    if (req.method === 'OPTIONS') return repond(res, 204);
    if (u.pathname === '/auth/v1/user') return repond(res, 200, { id: UID, aud: 'authenticated', role: 'authenticated', email: 'banc@exemple.bj', app_metadata: {}, user_metadata: {}, created_at: isoA(-JOUR) });
    if (u.pathname === '/rest/v1/staff' && req.method === 'GET') {
      const tete = { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] };
      return repond(res, 200, String(req.headers.accept ?? '').includes('vnd.pgrst.object') ? tete : [tete]);
    }
    return repond(res, 503, { message: 'banc : serveur fermé' });
  }
  let f = path.join(construit, decodeURIComponent(u.pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'trone.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
serveur.on('upgrade', (_req, socket) => socket.destroy());
await new Promise((r) => serveur.listen(PORT, '127.0.0.1', r));

/* ── CHROME ───────────────────────────────────────────────────────────── */
const dbg = 9800 + Math.floor(Math.random() * 150);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-cote-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let cible;
for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
if (!cible) { console.error('Chrome ne repond pas.'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const enVol = new Map(); const erreurs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && enVol.has(m.id)) { enVol.get(m.id)(m); enVol.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails.text);
});
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enVol.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
const jusqua = async (expr, ms) => { const t0 = Date.now(); for (;;) { const v = await evalue(expr); if (v) return Date.now() - t0; if (Date.now() - t0 > ms) return null; await attend(100); } };
await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };

const CLE = 'sb-127-auth-token';
const le = isoA(-JOUR);
const fiche = (fid, name) => ({ id: fid, branchId: 'maison', name, phone: `+229 01 97 00 00 ${fid.slice(-2)}`, city: '', persona: '', since: '2025-01-10', photo: null, segments: [], priceCoef: 1, loyaltyPoints: 0, diaspora: false });
const rdv = (rid, clientId, time, dureeMin, master) => ({ id: rid, branchId: 'maison', clientId, serviceIds: [], date: aujourdhui, time, status: 'confirmé', master, dureeMin });
const RDV = [
  rdv('r-matin', 'c-01', '08:30', 90, 'Banc A'),
  rdv('r-dix-long', 'c-02', '10:00', 140, 'Banc A'),
  rdv('r-dix-court', 'c-03', '10:00', 60, 'Banc A'),
  rdv('r-apres', 'c-04', '15:00', 120, 'Banc A'),
  rdv('r-trois-1', 'c-05', '11:00', 60, 'Banc B'),
  rdv('r-trois-2', 'c-06', '11:00', 60, 'Banc B'),
  rdv('r-trois-3', 'c-07', '11:00', 60, 'Banc B'),
  /* L'essai réel du 18 novembre : le long de 8 h 30 chevauche les deux de 10 h. */
  rdv('r-reel-matin', 'c-08', '08:30', 160, 'Banc C'),
  rdv('r-reel-long', 'c-09', '10:00', 140, 'Banc C'),
  rdv('r-reel-court', 'c-10', '10:00', 45, 'Banc C'),
];
const SEMENCE = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(MAINTENANT / 1000) + 3600,
    user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] } },
  'trone::mnd_clients': [fiche('c-01', 'Ama Banc'), fiche('c-02', 'Bella Banc'), fiche('c-03', 'Cora Banc'), fiche('c-04', 'Dora Banc'),
    fiche('c-05', 'Ella Banc'), fiche('c-06', 'Fifa Banc'), fiche('c-07', 'Gina Banc'),
    fiche('c-08', 'Hana Banc'), fiche('c-09', 'Shadia Banc'), fiche('c-10', 'Joséphine Bancolo')],
  'trone::mnd_appointments': RDV,
};

/* Une carte se trouve par le nom de sa cliente : le Trône d'avant (`--prouve`)
   n'a pas d'autre repère, et c'est ce que l'œil cherche. */
const NOMS = Object.fromEntries(RDV.map((r) => [r.id, SEMENCE['trone::mnd_clients'].find((c) => c.id === r.clientId).name]));
const boite = (rid) => evalue(`(() => { const e = [...document.querySelectorAll('[data-daycol] .trc-cal__appt')].find((x) => x.querySelector('.trc-cal__who')?.textContent.trim() === ${JSON.stringify(NOMS[rid])}); if (!e) return null; const r = e.getBoundingClientRect(); const c = e.closest('[data-daycol]').getBoundingClientRect();
  /* Vu, vraiment : le point au milieu du nom appartient-il à SA carte, ou à
     une autre posée par-dessus ? La carte est amenée dans la fenêtre d'abord ;
     tout se mesure ENSUITE, d'un même instant, et par rapport à sa colonne :
     deux cartes mesurées à deux défilements différents se comparent juste. */
  const n = e.querySelector('.trc-cal__who');
  /* La CARTE dans la fenêtre, pas le nom : faire défiler le nom ferait défiler
     l'intérieur de la carte (overflow hidden) et masquerait une coupe. */
  e.scrollIntoView({ block: 'center' }); e.scrollTop = 0; e.scrollLeft = 0;
  const titre = e.querySelector('.trc-cal__appt-title'); if (titre) { titre.scrollTop = 0; titre.scrollLeft = 0; }
  const r2 = e.getBoundingClientRect(); const c2 = e.closest('[data-daycol]').getBoundingClientRect(); const rn = n ? n.getBoundingClientRect() : null;
  let vu = false;
  if (rn) { const p = document.elementFromPoint(rn.left + rn.width / 2, rn.top + rn.height / 2); vu = !!p && e.contains(p); }
  /* En entier : neuf points sur chaque ligne du nom (il peut passer à la
     ligne), chacun doit tomber sur le nom lui-même, ni sur un bouton posé
     par-dessus, ni hors de la carte coupée. */
  let entier = !!n; let premierAccroc = '';
  /* Chaque ligne du nom DANS la carte (rien de coupé en bas ni à droite), et
     dans son titre quand il coupe (« … »). */
  const boiteDuTitre = titre ? titre.getBoundingClientRect() : r2;
  const coupeAuTitre = titre && getComputedStyle(titre).overflow === 'hidden';
  if (n) for (const ligne of n.getClientRects()) {
    const dedans = (b) => ligne.left >= b.left - 1 && ligne.right <= b.right + 1 && ligne.top >= b.top - 1 && ligne.bottom <= b.bottom + 1;
    if (!dedans(r2) || (coupeAuTitre && !dedans(boiteDuTitre))) { entier = false; if (!premierAccroc) premierAccroc = 'coupé par sa carte'; }
  }
  if (n) for (const ligne of n.getClientRects()) for (let k = 1; k <= 9; k++) {
    const x = ligne.left + (ligne.width * k) / 10; const y = ligne.top + ligne.height / 2;
    const p = document.elementFromPoint(x, y);
    if (!p || !n.contains(p)) { entier = false; if (!premierAccroc) premierAccroc = p ? (p.className || p.tagName) : 'rien'; }
  }
  void r; void c;
  return { g: r2.left - c2.left, d: r2.right - c2.left, h: r2.top - c2.top, b: r2.bottom - c2.top, l: r2.width, cg: 0, cd: c2.width, cl: c2.width,
    nom: n ? n.textContent.trim() : '', nl: rn ? rn.width : 0, nd: rn ? rn.right - c2.left : 0, nb: rn ? rn.bottom - c2.top : 0, vu, entier, premierAccroc, col: e.closest('[data-daycol]').getAttribute('data-daycol') }; })()`);
const recouvre = (a, b) => Math.max(0, Math.min(a.d, b.d) - Math.max(a.g, b.g)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.h, b.h));
const r1 = (x) => Math.round(x);

try {
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/trone.html` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); location.hash = '#/calendrier'; location.reload(); return true; })()`);
  const ouvert = await jusqua(`document.querySelectorAll('[data-daycol] .trc-cal__appt').length === ${RDV.length}`, 45000);
  dit(`la vue jour s’ouvre, ses ${RDV.length} rendez-vous posés`, ouvert !== null,
    ouvert === null ? `${await evalue(`document.querySelectorAll('[data-daycol] .trc-cal__appt').length`)} carte(s) · ${(await evalue('document.body.innerText'))?.slice(0, 300).replace(/\n/g, ' ')}` : undefined);

  /* ── 1. Deux à 10 h chez le même maître ── */
  const L = await boite('r-dix-long'); const C = await boite('r-dix-court');
  dit('les deux rendez-vous de 10 h se voient', !!L && !!C);
  if (L && C) {
    dit('… sans se recouvrir', recouvre(L, C) === 0, `recouvrement ${r1(recouvre(L, C))} px²`);
    dit('… côte à côte, à la même hauteur', Math.abs(L.h - C.h) < 1 && L.d <= C.g + 1, `long ${r1(L.g)}–${r1(L.d)}, court ${r1(C.g)}–${r1(C.d)}`);
    dit('… chacun près de la moitié de la colonne', L.l > C.cl * 0.4 && C.l > C.cl * 0.4, `${r1(L.l)} et ${r1(C.l)} sur ${r1(C.cl)} px`);
    dit('… chacun avec son nom lisible dans sa carte', L.nom === 'Bella Banc' && C.nom === 'Cora Banc' && L.nl > 20 && C.nl > 20 && L.nd <= L.d + 0.5 && C.nd <= C.d + 0.5,
      `« ${L.nom} » ${r1(L.nl)} px, « ${C.nom} » ${r1(C.nl)} px`);
  }
  /* ── 2. Celui de 8 h 30, qui finit à 10 h, et celui de l'après-midi : pleins ── */
  const M = await boite('r-matin'); const A = await boite('r-apres');
  dit('le rendez-vous de 8 h 30 (fini à 10 h) garde toute la largeur', !!M && M.l > M.cl - 14, M ? `${r1(M.l)} sur ${r1(M.cl)} px` : 'absent');
  dit('celui de 15 h, seul, garde toute la largeur', !!A && A.l > A.cl - 14, A ? `${r1(A.l)} sur ${r1(A.cl)} px` : 'absent');
  if (M && C) dit('8 h 30 ne recouvre pas 10 h', recouvre(M, C) === 0 && recouvre(M, L) === 0);
  /* ── 3. Trois à 11 h chez un autre maître ── */
  const T = [await boite('r-trois-1'), await boite('r-trois-2'), await boite('r-trois-3')];
  dit('trois à la même heure : trois cartes visibles', T.every(Boolean));
  if (T.every(Boolean)) {
    const paires = [[0, 1], [0, 2], [1, 2]].map(([i, j]) => recouvre(T[i], T[j]));
    dit('… aucune ne recouvre une autre', paires.every((p) => p === 0), paires.map(r1).join(', '));
    dit('… chacune près du tiers de la colonne', T.every((t) => t.l > t.cl * 0.25), T.map((t) => r1(t.l)).join(', '));
  }
  /* ── 4. Chaque nom se voit, et rien ne déborde de sa colonne ── */
  const toutes = [];
  for (const r of RDV) toutes.push(await boite(r.id));
  const caches = RDV.filter((r, i) => !toutes[i]?.vu).map((r) => NOMS[r.id]);
  dit('chaque cliente du jour se voit : aucun nom sous une autre carte', caches.length === 0, caches.length ? `cachés : ${caches.join(', ')}` : `${RDV.length} noms vus`);
  const coupes = RDV.map((r, i) => [r, toutes[i]]).filter(([, b]) => !b?.entier).map(([r, b]) => `${NOMS[r.id]} (sous ${b?.premierAccroc || '?'})`);
  dit('chaque nom se lit en entier : rien ne le couvre, pas même « Encaisser »', coupes.length === 0, coupes.length ? coupes.join(', ') : `${RDV.length} noms entiers`);
  /* Le cas de l'essai réel : trois voies, la plus courte comprise. */
  const reel = ['r-reel-matin', 'r-reel-long', 'r-reel-court'].map((rid) => toutes[RDV.findIndex((r) => r.id === rid)]);
  dit('le cas de l’essai réel : trois cartes côte à côte, sans recouvrement', reel.every(Boolean)
    && [[0, 1], [0, 2], [1, 2]].every(([i, j]) => recouvre(reel[i], reel[j]) === 0) && reel.every((b) => b.l < b.cl * 0.4),
    reel.every(Boolean) ? reel.map((b) => `${Math.round(b.g)}–${Math.round(b.d)}`).join(', ') : 'carte absente');
  const encaisserSurNom = await evalue(`[...document.querySelectorAll('[data-daycol] .trc-cal__appt')].filter((c) => {
    const b = c.querySelector('.trc-cal__encaisser'); const n = c.querySelector('.trc-cal__who'); if (!b || !n) return false;
    const rb = b.getBoundingClientRect(); return [...n.getClientRects()].some((r) => Math.min(r.right, rb.right) > Math.max(r.left, rb.left) && Math.min(r.bottom, rb.bottom) > Math.max(r.top, rb.top));
  }).map((c) => c.querySelector('.trc-cal__who').textContent.trim())`);
  dit('« Encaisser » ne recouvre aucun nom', encaisserSurNom.length === 0, encaisserSurNom.join(', '));
  dit('aucune carte ne déborde de sa colonne', toutes.every((b) => b && b.g >= b.cg - 0.5 && b.d <= b.cd + 0.5));
  const deborde = await evalue('document.documentElement.scrollWidth - document.documentElement.clientWidth');
  dit('la page ne déborde pas', deborde <= 0, `${deborde} px`);
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  /* `--photo <fichier.png>` : la vue jour, pour l'œil (rien n'est vérifié). */
  const photo = process.argv[process.argv.indexOf('--photo') + 1];
  if (process.argv.includes('--photo') && photo) {
    await evalue(`(document.querySelector('[data-daycol]')?.scrollIntoView({ block: 'start' }), true)`);
    await attend(300);
    const { result } = await cdp('Page.captureScreenshot', { format: 'png' });
    (await import('node:fs')).writeFileSync(photo, Buffer.from(result.data, 'base64'));
    console.log(`Photo : ${photo}`);
  }
} finally {
  ws.close();
  chrome.kill();
  serveur.close();
  await attend(400);
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore le profil */ }
  if (aEffacer) try { rmSync(aEffacer, { recursive: true, force: true }); } catch { /* idem */ }
}

if (prouve) {
  console.log(ko > 0 ? `PROUVÉ : le banc crie sur ce Trône (${ko} échec(s)).` : 'NON PROUVÉ : ce Trône passe le banc.');
  process.exit(ko > 0 ? 0 : 1);
}
console.log(ko ? `${ko} échec(s).` : 'Côte à côte : chaque rendez-vous du jour se voit, aucun ne se cache sous un autre.');
process.exit(ko ? 1 : 0);
