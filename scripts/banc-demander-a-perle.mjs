/* LE BANC DE « DEMANDER À PERLE » — `node scripts/banc-demander-a-perle.mjs [dossier des captures]`.

   21 novembre 2026, maquette 7XvdzJ99bioQsv62r5cBrw, premier lot : la
   direction seule, les questions et « En direct ». `verifie-demander-a-perle`
   éprouve les règles ; ce banc construit le VRAI Trône (connexion
   obligatoire, serveur Supabase injoignable), l'ouvre dans un vrai Chrome
   avec une session gardée, et regarde l'écran :

     1. la direction : l'entrée « Demander à Perle » est la première de la
        barre, Alt + P l'ouvre depuis un autre écran ;
     2. le fil « En direct » dit la journée fictive : l'argent entré, ce qui
        reste à encaisser, le fauteuil, la suite du jour, la conversation qui
        attend, les places, la suggestion sans réponse ;
     3. l'heure est celle de Cotonou sur un poste à l'heure de Chine ;
     4. sans la fonction (serveur injoignable), Perle le dit et ne répond
        pas : aucune réponse inventée ;
     5. un geste du fil ouvre son écran, rien d'autre ;
     6. un maître ne voit ni l'entrée ni l'écran ; le gérant, si.

   L'horloge de la page est figée au samedi 21 novembre 2026, 15 h 13 à
   Cotonou : le banc dit la même chose à toute heure. Toutes les données sont
   inventées : le dépôt est public. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const captures = process.argv[2] || '';
if (captures) mkdirSync(captures, { recursive: true });
const construit = mkdtempSync(path.join(tmpdir(), 'banc-perle-'));
console.log('Construction du Trone (serveur injoignable)...');
execSync(`npx vite build --outDir "${construit}" --emptyOutDir --logLevel error`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_ALLOW_OPEN: 'false', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-perle-chrome-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
/* Le poste est à l'heure de Chine, comme l'ordinateur du bureau. */
await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });

let ko = 0;
/* La console Windows parle cp1252 : tout ce qui sort est ramené à l'ASCII. */
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`)); };
const photo = async (nom, l = 1360, h = 900, mobile = false) => {
  if (!captures) return;
  await cdp('Emulation.setDeviceMetricsOverride', { width: l, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await attend(700);
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(captures, `${nom}.png`), Buffer.from(img.result.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
};
/* Une espace insécable s'écrit dans les montants : le banc compare à l'espace près. */
const plat = (s) => String(s ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const texte = async (selecteur) => plat(await evalue(`(document.querySelector(${JSON.stringify(selecteur)})?.textContent || '')`));

/* ── L'HORLOGE FIGÉE : samedi 21 novembre 2026, 14 h 13 UTC = 15 h 13 à Cotonou = 22 h 13 en Chine ── */
const INSTANT = Date.UTC(2026, 10, 21, 14, 13, 0);
const JOUR = '2026-11-21';
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const Vraie = Date; const fige = ${INSTANT};
  class Figee extends Vraie { constructor(...a) { if (a.length === 0) super(fige); else super(...a); } static now() { return fige; } }
  globalThis.Date = Figee;
})();` });

/* ── LA SESSION GARDÉE, ET LA JOURNÉE FICTIVE ── */
const UID = 'u-banc-perle';
const CLE = 'sb-127-auth-token';
const session = (role) => {
  const le = new Date(INSTANT - 86_400_000).toISOString();
  return {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(INSTANT / 1000) - 7200,
      user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Direction du banc', role, rubrics: [] } },
  };
};
const GESTES = ['sv-souffle', 'sv-reprise'];
const tete = (cid, nom, phone) => ({ id: cid, branchId: 'maison', name: nom, phone, city: '', persona: '', since: '2026-01-10', segments: [] });
const rdv = (rid, cid, heure, status, plus = {}) => ({ id: rid, branchId: 'maison', clientId: cid, serviceIds: GESTES, date: JOUR, time: heure, status, master: 'Expert', ...plus });
const JOURNEE = {
  'trone::mnd_branches': [{ id: 'maison', name: 'Maison du banc', city: 'Cotonou', country: 'Bénin', dial: '+229', currency: 'XOF', address: '', seats: 2, masters: ['Expert', 'Team'], masterParDefaut: 'Expert', status: 'active', flagship: true }],
  'trone::mnd_current_branch': 'maison',
  'trone::mnd_cashboxes': [{ id: 'cb-t', branchId: 'maison', name: 'Terrasse · Tiroir espèces', sub: 'Espèces du comptoir', glyph: '◈', openingXof: 0, role: 'terrasse', equipe: true }],
  'trone::mnd_staff': [{ id: 'st-a', branchId: 'maison', name: 'Expert', role: 'Maître', partPourboire: 1, auFauteuil: true }],
  'trone::mnd_catalog_services': [
    { id: 'sv-souffle', categoryId: '', name: 'Souffle du banc', palier: 'Fondation', priceXof: 8000, durationMin: 30, hidePrice: false, sessions: 1, order: 1 },
    { id: 'sv-reprise', categoryId: '', name: 'Reprise du banc', palier: 'Fondation', priceXof: 20000, durationMin: 60, hidePrice: false, sessions: 1, order: 2 },
  ],
  'trone::mnd_clients': [tete('cl-ak', 'Awa Kossou', '0100000061'), tete('cl-cf', 'Chloé Fagbémi', '0100000062'), tete('cl-de', 'Danielle Eké', '0100000064'), tete('cl-eg', 'Eva Gomez', '0100000065'), tete('cl-fh', 'Fanta Houngbo', '0100000066')],
  'trone::mnd_appointments': [
    /* Au fauteuil depuis 14 h 45 (1 h 30), et donc à encaisser. */
    rdv('rdv-ak', 'cl-ak', '14:45', 'confirmé'),
    /* Honoré ce matin, sans pièce : à encaisser. */
    rdv('rdv-cf', 'cl-cf', '10:00', 'honoré'),
    /* Encore attendue. */
    rdv('rdv-de', 'cl-de', '17:00', 'confirmé'),
    /* Honoré et réglé : 28 000 F en espèces, 2 000 F de pourboire. */
    rdv('rdv-eg', 'cl-eg', '09:00', 'honoré', { invoiceId: 'inv-eg' }),
    /* Une suggestion de la Maison, sans réponse d'elle. */
    { id: 'rdv-fh', branchId: 'maison', clientId: 'cl-fh', serviceIds: GESTES, date: '2026-12-19', time: '10:00', status: 'confirmé', master: 'Expert', suggereLe: '2026-11-21T09:00:00.000Z', repriseDe: 'rdv-ancien' },
  ],
  'trone::mnd_invoices': [{
    id: 'inv-eg', branchId: 'maison', kind: 'facture', number: 'F-2026-0001', status: 'payée', date: JOUR, clientId: 'cl-eg', clientName: 'Eva Gomez', apptId: 'rdv-eg',
    lines: [{ id: 'l1', qty: 1, label: 'Souffle du banc', unitXof: 8000 }, { id: 'l2', qty: 1, label: 'Reprise du banc', unitXof: 20000 }],
    payments: [{ id: 'p1', amountXof: 28000, method: 'Espèces', date: JOUR, cashbox: 'Terrasse · Tiroir espèces' }], tipXof: 2000, globalDiscountPct: 0,
  }],
  'trone::mnd_payment_methods': ['MTN MoMo', 'Espèces', 'Carte', 'Chèque'],
  /* Elle a écrit il y a vingt minutes, personne n'a répondu. */
  'trone::mnd_messages_wa': [{ id: 'wa-banc-1', branchId: 'maison', sens: 'entrant', numero: '2290100000061', clientId: 'cl-ak', texte: 'Bonjour, avez-vous une place jeudi matin ?', type: 'text', quand: new Date(INSTANT - 20 * 60_000).toISOString() }],
};
const seme = (role, avecLaJournee) => evalue(`(() => {
  localStorage.setItem('mnd_reset_v5', '1');
  for (const [k, v] of Object.entries(${JSON.stringify(session(role))})) localStorage.setItem(k, JSON.stringify(v));
  ${avecLaJournee ? `for (const [k, v] of Object.entries(${JSON.stringify(JOURNEE)})) localStorage.setItem(k, JSON.stringify(v));` : ''}
  return true;
})()`);
const ouvre = async (hash) => { await evalue(`location.hash = ${JSON.stringify(hash)}; true`); await attend(1800); };
const lignes = () => evalue(`[...document.querySelectorAll('.trp-perle__direct .trp-perle__ligne')].map((l) => [l.querySelector('b')?.textContent ?? '', l.querySelector('span')?.textContent ?? '', l.querySelector('button')?.textContent ?? ''])`);

/* ── 1. LA DIRECTION ── */
await cdp('Page.navigate', { url: `${origine}/` });
await attend(2500);
await seme('souverain', true);
await evalue('location.reload()');
await attend(9000);
dit('le Trone s ouvre sur ses ecrans, session gardee', await evalue(`!!document.querySelector('.tr-top__sync, .tr-side')`));
const premier = await evalue(`(() => { const n = document.querySelector('.tr-nav'); const a = n?.firstElementChild; return a ? { classe: a.className, texte: a.textContent.replace(/\\s+/g, ' ').trim(), href: a.getAttribute('href') } : null; })()`);
dit('« Demander à Perle » est la premiere entree de la barre', !!premier && premier.classe.includes('tr-nav__perle') && premier.texte.startsWith('Demander à Perle') && String(premier.href).endsWith('/demander'), JSON.stringify(premier));
await ouvre('#/carnet');
dit('Alt + P ouvre Perle depuis le Carnet', await evalue(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: 'KeyP', key: 'p', bubbles: true })); return true; })()`));
await attend(2500);
dit('... l ecran « Demander à Perle » est la', (await evalue('location.hash')) === '#/demander' && (await texte('.trp-perle h2')) === 'Demander à Perle', `${await evalue('location.hash')} · ${await texte('.trp-perle h2')}`);

/* ── 2 et 3. EN DIRECT, À L'HEURE DE COTONOU ── */
dit('le moment est celui de Cotonou, sur un poste a l heure de Chine (22 h 13)', (await texte('.trp-perle__moment')) === 'En direct · samedi 21 novembre 2026, 15 h 13 à Cotonou' && (await evalue('new Date().getHours()')) === 22,
  `${await texte('.trp-perle__moment')} · poste ${await evalue('new Date().getHours()')} h`);
const fil = (await lignes()).map((l) => l.map(plat));
const ligne = (debut) => fil.find((l) => l[0].startsWith(debut)) ?? ['', '', ''];
dit('l argent entre aujourd hui, pourboires a part', ligne('Encaissé')[0] === 'Encaissé aujourd’hui : 28 000 F' && ligne('Encaissé')[1] === 'Pourboires à part : 2 000 F', ligne('Encaissé').join(' | '));
dit('ce qui reste a encaisser : le rituel au fauteuil et celui honore sans piece', ligne('À encaisser')[0] === 'À encaisser : 56 000 F' && ligne('À encaisser')[1] === '2 rituels commencés ou terminés, sans règlement', ligne('À encaisser').join(' | '));
dit('le fauteuil', ligne('Au fauteuil')[0] === 'Au fauteuil : 1' && ligne('Au fauteuil')[1] === 'Expert depuis 14 h 45', ligne('Au fauteuil').join(' | '));
dit('la suite du jour', ligne('Encore attendue')[0] === 'Encore attendue aujourd’hui : 1' && ligne('Encore attendue')[1] === '17 h', ligne('Encore attendue').join(' | '));
dit('la conversation qui attend, depuis vingt minutes', ligne('1 conversation')[0] === '1 conversation sans réponse' && ligne('1 conversation')[1] === 'La plus ancienne attend depuis 20 min', ligne('1 conversation').join(' | '));
dit('les places d aujourd hui, apres l heure qu il est a Cotonou', ligne('Places libres')[0] === 'Places libres aujourd’hui' && /^(15 h 30|16 h)/.test(ligne('Places libres')[1]) && ligne('Places libres')[1].endsWith('pour une heure'), ligne('Places libres').join(' | '));
dit('la suggestion sans reponse', ligne('1 rendez-vous')[0] === '1 rendez-vous suggéré sans réponse', ligne('1 rendez-vous').join(' | '));
dit('chaque fait a son geste, qui nomme un ecran', fil.map((l) => l[2]).join('|') === 'Voir La journée|Encaisser|Voir au Carnet|Voir au Carnet|Répondre|Voir au Carnet|Voir au Carnet', fil.map((l) => l[2]).join('|'));
await photo('perle-bureau');

/* ── 4. SANS LA FONCTION, ELLE NE RÉPOND PAS ── */
await attend(2500);
const refus = await texte('.trp-perle__refus');
dit('sans la fonction, Perle le dit', refus.startsWith('La fonction ia-maison n’est pas posée ou pas à jour'), refus.slice(0, 120));
dit('... le champ et les questions proposees se taisent, aucune reponse a l ecran',
  await evalue(`document.querySelector('#trp-perle-question')?.disabled === true && [...document.querySelectorAll('.trp-perle__puce')].length === 4 && [...document.querySelectorAll('.trp-perle__puce')].every((b) => b.disabled) && document.querySelectorAll('.trp-perle__elle').length === 0`));
dit('l accueil dit ce qu on peut demander', (await texte('.trp-perle__accueil h3')) === 'Que voulez-vous savoir ?');

/* ── 5. UN GESTE OUVRE SON ÉCRAN ── */
dit('« Encaisser » mene a la Caisse', await evalue(`(() => { const b = [...document.querySelectorAll('.trp-perle__ligne button')].find((x) => x.textContent.trim() === 'Encaisser'); if (b) b.click(); return !!b; })()`));
await attend(2500);
dit('... et a rien d autre : aucun rendez-vous ni piece n a change', (await evalue('location.hash')) === '#/caisse'
  && (await evalue(`JSON.stringify(JSON.parse(localStorage.getItem('trone::mnd_appointments')).map((a) => [a.id, a.status, a.date, a.time]))`)) === JSON.stringify(JOURNEE['trone::mnd_appointments'].map((a) => [a.id, a.status, a.date, a.time]))
  && (await evalue(`JSON.parse(localStorage.getItem('trone::mnd_invoices')).length`)) === 1, await evalue('location.hash'));
await ouvre('#/demander');
await photo('perle-telephone', 390, 844, true);

/* ── 6. LA PORTE ── */
const pour = async (role) => {
  await seme(role, false);
  await evalue('location.reload()');
  await attend(9000);
  const entree = await evalue(`!!document.querySelector('.tr-nav__perle')`);
  await ouvre('#/demander');
  await attend(1200);
  return { entree, ecran: await evalue(`!!document.querySelector('.trp-perle__direct')`), hash: await evalue('location.hash') };
};
const maitre = await pour('maitre');
dit('un maitre ne voit ni l entree ni l ecran', !maitre.entree && !maitre.ecran, JSON.stringify(maitre));
dit('... et Alt + P ne l y mene pas', await evalue(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: 'KeyP', key: 'p', bubbles: true })); return true; })()`) && (await attend(1500), !(await evalue(`!!document.querySelector('.trp-perle__direct')`))));
const gerant = await pour('gerant');
dit('le gerant, si : la direction', gerant.entree && gerant.ecran && gerant.hash === '#/demander', JSON.stringify(gerant));

dit('aucune erreur dans la page', erreurs.length === 0, erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
console.log(ko === 0 ? '\nDemander a Perle tient : la direction seule, En direct juste, a l heure de Cotonou.' : `\n${ko} controle(s) en echec.`);

ws.close();
chrome.kill();
await new Promise((r) => serveur.close(r));
await attend(500);
try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore un fichier */ }
try { rmSync(construit, { recursive: true, force: true }); } catch { /* idem */ }
process.exit(ko === 0 ? 0 : 1);
