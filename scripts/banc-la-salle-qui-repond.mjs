/* LA SALLE QUI RÉPOND, À L'ÉCRAN — `node scripts/banc-la-salle-qui-repond.mjs [dossier construit] [--prouve]`.

   15 novembre 2026 : « Quand j'appuie le bouton Retenir ou Envoyer quand
   même, rien ne se passe. Le bouton, même en appuyant plusieurs fois, ne
   s'exécute pas. Il finit par partir mais avec beaucoup de retard. Quand
   j'ai des messages que j'ai retenus, me donner la possibilité de les
   effacer pour ne plus les voir » (Yéman).

   Ce banc ouvre le VRAI Trône dans Chrome, connecté comme la direction,
   devant un faux Supabase (port 47124) qui porte la table `envois` : il
   répond aux lectures et aux écritures sous condition, comme PostgREST, et
   REFUSE le direct (le canal temps réel ne s'ouvre pas) : c'est le cas qui
   faisait croire la salle morte. Puis il fait les gestes d'une main :
     - « Retenir », « Relâcher », « Envoyer maintenant » se voient en moins
       de deux secondes et demie, sans le direct, une seule écriture chacun ;
     - pendant une écriture lente, la ligne dit « Un instant… » et les
       autres lignes restent touchables ;
     - un message parti entre-temps : l'écran le relit et dit « trop tard » ;
     - « Effacer » ôte un retenu de la salle, « Effacer les N retenus »
       demande d'abord, « Garder » renonce, puis tout s'efface ;
     - un retenu d'il y a trois semaines dit sa date, avec l'année ;
     - sur un téléphone (390 px), rien ne déborde.
   Les clientes, les messages et les montants sont inventés.

   Sans dossier, le banc construit le Trône lui-même (sous Node, sans Git
   Bash : VITE_BASE reste « / »). `--prouve` attend un Trône construit
   AVANT ce correctif (le dossier en argument) : le banc doit y crier, le
   geste ne s'y voyant qu'au retour du direct. */
import { createServer } from 'node:http';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const prouve = process.argv.includes('--prouve');
const PORT = 47124;
let construit = args[0];
let aEffacer = null;
if (!construit) {
  construit = mkdtempSync(path.join(tmpdir(), 'banc-salle-'));
  aEffacer = construit;
  console.log('Construction du Trône (faux Supabase sur le port du banc)…');
  execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
    cwd: racine, stdio: 'ignore',
    env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: `http://127.0.0.1:${PORT}`, VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
  });
}
if (!existsSync(path.join(construit, 'trone.html'))) { console.error(`Pas de Trône construit dans ${construit}.`); process.exit(2); }

/* ── LE FAUX SUPABASE ─────────────────────────────────────────────────── */
const UID = 'u-banc-salle';
const MAINTENANT = Date.now();
const isoA = (ms) => new Date(MAINTENANT + ms).toISOString();
const MIN = 60_000; const JOUR = 86_400_000;
const jourDeCotonou = (n) => new Date(MAINTENANT + 3_600_000 + n * JOUR).toISOString().slice(0, 10);
const ligne = (id, data) => ({ id, branch_id: 'maison', data: { id, branchId: 'maison', canal: 'whatsapp', quand: isoA(-2 * MIN), deposeLe: isoA(-2 * MIN), ...data }, updated_at: isoA(-2 * MIN) });
const table = new Map();
const pose = (l) => table.set(l.id, l);
pose(ligne('s-awa', { type: 'confirmation', statut: 'en-attente', clientId: 'c-awa', prenom: 'Awa', apptId: 'r-awa', dateRdv: jourDeCotonou(2), heure: '14:00', partA: isoA(8 * MIN), calme: false }));
pose(ligne('s-jade', { type: 'rappel-j1', canal: 'push', statut: 'en-attente', clientId: 'c-jade', prenom: 'Jade', partA: isoA(5 * MIN), calme: false }));
pose(ligne('s-faith', { type: 'avis-google', statut: 'en-attente', clientId: 'c-faith', prenom: 'Faith', partA: isoA(6 * MIN), calme: false }));
pose(ligne('t-vieux', { type: 'confirmation', statut: 'retenu', clientId: 'c-awa', prenom: 'Awa', retenuPar: 'Accueil', retenuLe: isoA(-21 * JOUR), partA: isoA(-21 * JOUR + 10 * MIN) }));
pose(ligne('t-hier', { type: 'point-apres', statut: 'retenu', clientId: 'c-jade', prenom: 'Jade', retenuPar: 'Banc', retenuLe: isoA(-JOUR), partA: isoA(-JOUR + 10 * MIN) }));
pose(ligne('t-matin', { type: 'avis-google', statut: 'retenu', clientId: 'c-faith', prenom: 'Faith', retenuPar: 'Banc', retenuLe: isoA(-60 * MIN), partA: isoA(-50 * MIN) }));
/* Le journal à l'échelle de la Maison : sept cents envois partis sur trente jours. */
for (let i = 0; i < 700; i++) {
  pose(ligne(`p-${String(i).padStart(4, '0')}`, { type: i % 3 ? 'confirmation' : 'rappel-j1', statut: 'envoyé', etat: i % 2 ? 'lu' : 'remis', clientId: 'c-awa', quand: isoA(-((i * 61) % (30 * 24 * 60)) * MIN) }));
}

let ecritures = []; let lenteur = 0;
const repond = (res, code, corps, entetes = {}) => {
  res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', ...entetes });
  res.end(corps === undefined ? '' : JSON.stringify(corps));
};
const champs = (sel, l) => {
  const voulus = String(sel ?? 'id,data').split(',').map((s) => s.trim());
  return Object.fromEntries(voulus.filter((k) => k in l).map((k) => [k, l[k]]));
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
    if (u.pathname === '/rest/v1/envois') {
      const p = u.searchParams;
      const eqId = (p.get('id') ?? '').match(/^eq\.(.+)$/)?.[1];
      const gtId = (p.get('id') ?? '').match(/^gt\.(.+)$/)?.[1];
      const inIds = (p.get('id') ?? '').match(/^in\.\((.*)\)$/)?.[1]?.split(',').map((s) => s.replace(/^"|"$/g, ''));
      const statutVoulu = (p.get('data->>statut') ?? '').match(/^eq\.(.+)$/)?.[1];
      if (req.method === 'GET') {
        let rows = [...table.values()].sort((a, b) => a.id.localeCompare(b.id));
        if (eqId) rows = rows.filter((l) => l.id === eqId);
        if (gtId) rows = rows.filter((l) => l.id > gtId);
        if (inIds) rows = rows.filter((l) => inIds.includes(l.id));
        if (statutVoulu) rows = rows.filter((l) => l.data.statut === statutVoulu);
        const limite = Number(p.get('limit') ?? 1000);
        return repond(res, 200, rows.slice(0, limite).map((l) => champs(p.get('select'), l)));
      }
      if (req.method === 'PATCH') {
        const morceaux = [];
        req.on('data', (c) => morceaux.push(c));
        req.on('end', () => {
          const corps = JSON.parse(Buffer.concat(morceaux).toString('utf8') || '{}');
          setTimeout(() => {
            const l = eqId ? table.get(eqId) : undefined;
            const passe = !!l && (!statutVoulu || l.data.statut === statutVoulu);
            ecritures.push({ id: eqId, passe, statut: corps.data?.statut });
            if (!passe) return repond(res, 200, []);
            const neuve = { ...l, data: corps.data, updated_at: new Date().toISOString() };
            table.set(l.id, neuve);
            return repond(res, 200, [champs(p.get('select'), neuve)]);
          }, lenteur);
        });
        return undefined;
      }
    }
    return repond(res, 503, { message: 'banc : serveur fermé' });
  }
  let f = path.join(construit, decodeURIComponent(u.pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'trone.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
/* LE DIRECT REFUSÉ : la demande de canal temps réel est coupée net. */
serveur.on('upgrade', (_req, socket) => socket.destroy());
await new Promise((r) => serveur.listen(PORT, '127.0.0.1', r));

/* ── CHROME ───────────────────────────────────────────────────────────── */
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-salle-chrome-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const rangee = (rid) => `document.querySelector('[data-envoi="${rid}"]')`;
const texteDe = (rid) => evalue(`${rangee(rid)}?.innerText ?? ''`);
const presente = (rid) => evalue(`!!${rangee(rid)}`);
const touche = (rid, mot) => evalue(`(() => { const b = [...(${rangee(rid)}?.querySelectorAll('button') ?? [])].find((x) => x.textContent.trim() === ${JSON.stringify(mot)}); if (!b || b.disabled) return false; b.click(); return true; })()`);
const toucheDansLaSalle = (mot) => evalue(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(mot)} && x.offsetParent !== null); if (!b || b.disabled) return false; b.click(); return true; })()`);
const ecrituresDe = (rid) => ecritures.filter((e) => e.id === rid);
const RAPIDE = 2500;

const CLE = 'sb-127-auth-token';
const le = isoA(-JOUR);
const fiche = (fid, name, phone) => ({ id: fid, branchId: 'maison', name, phone, city: '', persona: '', since: '2025-01-10', photo: null, segments: [], priceCoef: 1, loyaltyPoints: 0, diaspora: false });
const SEMENCE = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(MAINTENANT / 1000) + 3600,
    user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] } },
  'trone::mnd_clients': [fiche('c-awa', 'Awa Koffi', '+229 01 97 00 00 01'), fiche('c-jade', 'Jade Banc', '+229 01 97 00 00 02'), fiche('c-faith', 'Faith Banc', '+229 01 97 00 00 03')],
  'trone::mnd_appointments': [{ id: 'r-awa', branchId: 'maison', clientId: 'c-awa', serviceIds: [], date: jourDeCotonou(2), time: '14:00', status: 'confirmé', master: '' }],
};

try {
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/trone.html` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); location.hash = '#/conversations?envois=1&onglet=salle'; location.reload(); return true; })()`);
  const ouverte = await jusqua(`!!document.querySelector('[data-envoi="s-awa"]') && !!document.querySelector('[data-envoi="t-matin"]')`, 45000);
  dit('la salle s’ouvre, ses six lignes lues au serveur', ouverte !== null && (await evalue(`document.querySelectorAll('[data-envoi]').length`)) === 6,
    ouverte === null ? (await evalue('document.body.innerText'))?.slice(0, 400).replace(/\n/g, ' ') : undefined);
  dit('le direct est bien refusé (le cas qui figeait la salle)', ecritures.length === 0);

  /* ── 1. Un retenu d'il y a trois semaines dit sa date, avec l'année ── */
  const vieux = await texteDe('t-vieux');
  dit('un retenu ancien dit son jour et son année', /par Accueil, \d{1,2} \S+ \d{4}, \d{1,2} h/.test(vieux), vieux.split('\n').slice(0, 3).join(' | '));
  const matin = await texteDe('t-matin');
  dit('un retenu du jour ne dit que son heure', /par Banc, \d{1,2} h/.test(matin) && !/\d{4}/.test(matin.split('\n').slice(0, 2).join(' ')), matin.split('\n').slice(0, 2).join(' | '));

  /* ── 2. Retenir, Relâcher, Envoyer maintenant : vus tout de suite ── */
  dit('« Retenir » se touche', await touche('s-awa', 'Retenir'));
  let t = await jusqua(`/retenu/i.test(${rangee('s-awa')}?.innerText ?? '') && [...${rangee('s-awa')}.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Relâcher')`, RAPIDE);
  dit('… le message paraît retenu sans attendre le direct', t !== null, t === null ? 'pas dans les 2,5 s' : `${t} ms`);
  dit('… une seule écriture, passée', ecrituresDe('s-awa').length === 1 && ecrituresDe('s-awa')[0].passe && table.get('s-awa').data.statut === 'retenu', JSON.stringify(ecrituresDe('s-awa')));
  dit('« Relâcher » se touche', await touche('s-awa', 'Relâcher'));
  t = await jusqua(`[...(${rangee('s-awa')}?.querySelectorAll('button') ?? [])].some((b) => b.textContent.trim() === 'Retenir')`, RAPIDE);
  dit('… il attend de nouveau, tout de suite', t !== null && table.get('s-awa').data.statut === 'en-attente', t === null ? 'pas dans les 2,5 s' : `${t} ms`);
  dit('« Envoyer maintenant » se touche', await touche('s-awa', 'Envoyer maintenant'));
  t = await jusqua(`/demandé à la main/.test(${rangee('s-awa')}?.innerText ?? '') && ![...${rangee('s-awa')}.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Envoyer maintenant')`, RAPIDE);
  dit('… l’écran dit qu’il part dans la minute, le bouton s’efface', t !== null && table.get('s-awa').data.parLaMain === true, t === null ? (await texteDe('s-awa')).replace(/\n/g, ' | ') : `${t} ms`);
  dit('trois gestes, trois écritures, aucune répétée', ecrituresDe('s-awa').length === 3, String(ecrituresDe('s-awa').length));

  /* ── 3. Une écriture lente : seule la ligne touchée attend ── */
  lenteur = 1500;
  dit('« Retenir » de Jade, serveur lent', await touche('s-jade', 'Retenir'));
  await attend(250);
  const pendant = await texteDe('s-jade');
  dit('… sa ligne dit « Un instant… »', /Un instant…/.test(pendant), pendant.replace(/\n/g, ' | '));
  dit('… la ligne de Faith reste touchable', await evalue(`[...(${rangee('s-faith')}?.querySelectorAll('button') ?? [])].some((b) => b.textContent.trim() === 'Retenir' && !b.disabled)`));
  t = await jusqua(`/retenu/i.test(${rangee('s-jade')}?.innerText ?? '') && !/Un instant/.test(${rangee('s-jade')}.innerText)`, 4000);
  dit('… puis Jade paraît retenue', t !== null, t === null ? 'jamais' : `${t} ms après`);
  lenteur = 0;

  /* ── 4. Parti entre-temps : l'écran relit et le dit ── */
  table.set('s-faith', { ...table.get('s-faith'), data: { ...table.get('s-faith').data, statut: 'envoyé' }, updated_at: new Date().toISOString() });
  dit('« Retenir » d’un message que le facteur vient de porter', await touche('s-faith', 'Retenir'));
  t = await jusqua(`!${rangee('s-faith')} && /Trop tard : ce message vient de partir/.test(document.body.innerText)`, RAPIDE);
  dit('… il quitte la salle et l’écran dit « trop tard »', t !== null, t === null ? ((await presente('s-faith')) ? 'toujours là' : 'parti, sans le mot') : `${t} ms`);

  /* ── 5. Effacer un retenu ── */
  dit('« Effacer » se touche sur un retenu', await touche('t-hier', 'Effacer'));
  t = await jusqua(`!${rangee('t-hier')}`, RAPIDE);
  dit('… il quitte la salle tout de suite', t !== null && table.get('t-hier').data.statut === 'écarté' && table.get('t-hier').data.ecartePar === 'Banc', t === null ? 'toujours là' : `${t} ms`);

  /* ── 6. Effacer les retenus : demander, renoncer, effacer ── */
  const restants = await evalue(`[...document.querySelectorAll('[data-envoi]')].filter((r) => /retenu/i.test(r.innerText.split('\\n')[0])).length`);
  const mot = `Effacer les ${restants} retenus`;
  dit(`« ${mot} » se touche`, restants >= 2 && await toucheDansLaSalle(mot), `${restants} retenus`);
  const question = await evalue(`document.querySelector('[role="alertdialog"]')?.innerText ?? ''`);
  dit('… il demande d’abord, et dit que rien ne partira', new RegExp(`Les ${restants} messages retenus ne partiront jamais`).test(question), question.replace(/\n/g, ' | '));
  dit('« Garder » renonce', await toucheDansLaSalle('Garder') && !(await evalue(`!!document.querySelector('[role="alertdialog"]')`)) && (await presente('t-vieux')));
  await toucheDansLaSalle(mot);
  dit(`« Effacer les ${restants} » efface`, await toucheDansLaSalle(`Effacer les ${restants}`));
  t = await jusqua(`![...document.querySelectorAll('[data-envoi]')].some((r) => /retenu/i.test(r.innerText.split('\\n')[0]))`, 4000);
  const ecartes = [...table.values()].filter((l) => l.data.statut === 'écarté').map((l) => l.id).sort();
  /* Écartés : celui d'« Effacer » (t-hier), puis les `restants` d'un coup. */
  dit('… tous les retenus quittent la salle, écartés au serveur', t !== null && ecartes.length === 1 + restants, `${t ?? 'jamais'} ms, écartés : ${ecartes.join(', ')}`);
  const onglet = await evalue(`[...document.querySelectorAll('.trc-envois-onglets button')].map((b) => b.textContent.trim())[0] ?? ''`);
  dit('l’onglet compte ce qui reste en salle', onglet === 'En salle (1)', onglet);

  /* ── 7. Au téléphone ── */
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await attend(600);
  const deborde = await evalue('document.documentElement.scrollWidth - document.documentElement.clientWidth');
  dit('au téléphone, rien ne déborde', deborde <= 0, `${deborde} px`);

  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
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
console.log(ko ? `${ko} échec(s).` : 'La salle répond : chaque geste se voit tout de suite, même sans le direct, et les retenus s’effacent.');
process.exit(ko ? 1 : 0);
