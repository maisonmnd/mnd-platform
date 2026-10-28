/* LE BANC DES CIVILITÉS — `node scripts/banc-des-civilites.mjs [capture]`.

   28 octobre 2026 : « pour les messages, dire Mr ou Mme avant le prénom »
   (Yéman). Le banc ouvre le VRAI Trône, Supabase injoignable, sur une
   session gardée de la direction, sème quatre fiches (deux muettes avec un
   numéro, une sans numéro, une dite Madame) et touche les boutons :

     - le bandeau de l'Assistant Maison compte les muettes joignables ;
     - une ligne ouverte montre « Sa civilité » ; « Monsieur » pose la
       civilité sur la fiche et le message dit aussitôt « M. Jean-Luc » ;
     - la fenêtre de tri liste les muettes, un rendez-vous ou la venue la
       plus récente d'abord, et garde la ligne posée ;
     - au téléphone, rien ne déborde ; les Clientes ont le même accès.

   Les fiches sont des exemples, signées d'initiales. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-civ-'));
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-civ-chrome-'));
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
    const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };
  const texte = () => evalue('document.body.innerText');
  const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
  const clique = (selecteur, mot) => evalue(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.offsetParent !== null && x.innerText.trim().replace(/\\s+/g, ' ').toLowerCase().startsWith(${JSON.stringify(mot.toLowerCase())}));
    if (b) b.click();
    return !!b;
  })()`);
  const tombe = async () => /Unexpected Application Error|Cet écran ne s.est pas ouvert|Unexpected error/i.test(await texte());

  /* La session gardée, et le vécu d'exemple. */
  const UID = 'u-banc-civ';
  const CLE = 'sb-127-auth-token';
  const le = new Date(Date.now() - 86_400_000).toISOString();
  const date = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const instant = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
  const accord = { oui: true, le: date(-100), par: 'comptoir' };
  const fiche = (idc, name, tel, extra) => ({ id: idc, branchId: 'maison', name, phone: tel, city: '', persona: '', since: '2025-01-10', photo: null, segments: [], priceCoef: 1, loyaltyPoints: 0, diaspora: false, nouvelles: accord, ...extra });
  const clients = [
    fiche('c-jl', 'Jean-Luc K.', '+229 01 51 00 00 11'),
    fiche('c-se', 'Shadé E.', '+229 01 51 00 00 12'),
    fiche('c-bs', 'Bio S.', ''),
    fiche('c-aw', 'Awa B.', '+229 01 51 00 00 14', { civilite: 'madame' }),
  ];
  let n = 0;
  const rdv = (clientId, j, status, extra = {}) => ({ id: `rdv-${++n}`, branchId: 'maison', clientId, serviceIds: [], date: date(j), time: '10:00', status, master: '', ...extra });
  const rdvs = [
    rdv('c-jl', -120, 'honoré'), rdv('c-jl', -60, 'honoré'), rdv('c-jl', 2, 'confirmé', { creeLe: instant(-10) }),
    rdv('c-se', -40, 'honoré'),
    rdv('c-bs', -90, 'honoré'),
    rdv('c-aw', -30, 'honoré'),
  ];
  const semence = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] } },
    'trone::mnd_clients': clients,
    'trone::mnd_appointments': rdvs,
  };
  const ficheLue = (idc) => evalue(`JSON.parse(localStorage.getItem('trone::mnd_clients') || '[]').find((c) => c.id === ${JSON.stringify(idc)}) || null`);
  const bandeau = () => evalue(String.raw`(document.querySelector('.trc-civ__bandeau')?.innerText || '').replace(/\s+/g, ' ')`);
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/gerard'; location.reload(); true`);
  const vu = await jusqua(`document.querySelectorAll('.trc-ger__rangee').length > 0`, 40000);
  dit('l Assistant Maison s ouvre', !!vu && !(await tombe()));

  /* 1. Le bandeau : les fiches qu'un message peut joindre et qui ne disent rien. */
  dit('le bandeau compte les muettes avec un numéro (Jean-Luc, Shadé ; ni Bio sans numéro, ni Awa dite Madame)', /Civilités : 2 fiches avec un numéro sans civilité/.test(await bandeau()), await bandeau());

  /* 2. La ligne de Jean-Luc : ses boutons au-dessus du message, puis « M. Jean-Luc ». */
  dit('la ligne de Jean-Luc s ouvre', await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-ger__ligne')].find((x) => x.textContent.includes('Jean-Luc K.')); if (b) b.click(); return !!b; })()`));
  await attend(400);
  const lecture = () => evalue(String.raw`({ boutons: [...document.querySelectorAll('.trc-ger__panneau .trc-civ__surligne button')].map((b) => b.textContent.trim()), texte: document.querySelector('.trc-ger__panneau .trc-ger__texte')?.textContent || '' })`);
  const avant = await lecture();
  dit('... « Sa civilité » et ses trois boutons ; le message dit le prénom seul', JSON.stringify(avant?.boutons) === JSON.stringify(['Madame', 'Mademoiselle', 'Monsieur']) && /^Bonjour Jean-Luc,/.test(avant?.texte ?? ''), JSON.stringify(avant));
  await photo('1-ligne');
  dit('... toucher « Monsieur »', await clique('.trc-ger__panneau .trc-civ__surligne button', 'Monsieur'));
  await attend(600);
  const jl = await ficheLue('c-jl');
  dit('... la fiche porte Monsieur, et la marque des cartes', jl?.civilite === 'monsieur' && jl?.auMasculin === true, JSON.stringify({ civilite: jl?.civilite, auMasculin: jl?.auMasculin }));
  const apres = await lecture();
  dit('... le message dit aussitôt « Bonjour M. Jean-Luc » ; les boutons s effacent', (apres?.boutons ?? []).length === 0 && /^Bonjour M\. Jean-Luc,/.test(apres?.texte ?? ''), JSON.stringify(apres));
  dit('... le bandeau n en compte plus qu une', /Civilités : 1 fiche avec un numéro sans civilité/.test(await bandeau()), await bandeau());

  /* 3. La fenêtre de tri. */
  dit('« Poser les civilités » ouvre la fenêtre', await clique('.trc-civ__bandeau button', 'Poser les civilités'));
  await attend(600);
  const fenetre = () => evalue(String.raw`(() => { const m = document.querySelector('.mnd-modal'); return m ? { dit: (m.querySelector('.trc-civ__dit')?.innerText || '').replace(/\s+/g, ' '), noms: [...m.querySelectorAll('.trc-civ__qui b')].map((b) => b.textContent) } : null; })()`);
  const f1 = await fenetre();
  dit('... deux fiches muettes dont une avec un numéro ; Shadé seule à l ouverture', /2 fiches sans civilité, dont 1 avec un numéro/.test(f1?.dit ?? '') && JSON.stringify(f1?.noms) === JSON.stringify(['Shadé E.']), JSON.stringify(f1));
  dit('... « Toutes »', await clique('.mnd-modal .trc-civ__filtres button', 'Toutes'));
  await attend(300);
  const f2 = await fenetre();
  dit('... Shadé (venue la plus récente) puis Bio, sans numéro', JSON.stringify(f2?.noms) === JSON.stringify(['Shadé E.', 'Bio S.']), JSON.stringify(f2?.noms));
  await evalue(String.raw`(() => { const li = [...document.querySelectorAll('.mnd-modal .trc-civ__ligne')].find((x) => x.textContent.includes('Shadé')); const b = [...(li?.querySelectorAll('button') || [])].find((x) => x.textContent.trim() === 'Madame'); if (b) b.click(); return !!b; })()`);
  await attend(500);
  const se = await ficheLue('c-se');
  dit('... Madame pour Shadé : posée sur sa fiche', se?.civilite === 'madame' && !se?.auMasculin, JSON.stringify({ civilite: se?.civilite }));
  const f3 = await evalue(String.raw`(() => { const li = [...document.querySelectorAll('.mnd-modal .trc-civ__ligne')].find((x) => x.textContent.includes('Shadé')); return li ? { posee: li.classList.contains('est-posee'), active: li.querySelector('.trc-chip.is-active')?.textContent.trim() } : null; })()`);
  dit('... sa ligne reste, Madame allumé : un mauvais toucher se corrige', f3?.posee === true && f3?.active === 'Madame', JSON.stringify(f3));
  await photo('2-fenetre');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await attend(800);
  dit('au téléphone (390 px), ni la page ni la fenêtre ne débordent', (await evalue('document.documentElement.scrollWidth > window.innerWidth + 1')) === false
    && (await evalue(`(() => { const m = document.querySelector('.mnd-modal'); return !!m && m.scrollWidth <= m.clientWidth + 1; })()`)) === true, String(await evalue('document.documentElement.scrollWidth')));
  await photo('3-telephone');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
  await attend(300);
  await clique('.mnd-modal button', 'Fermer');
  await attend(300);

  /* 4. Les Clientes : le même accès. */
  await evalue(`location.hash = '#/customers'; true`);
  const bouton = await jusqua(String.raw`[...document.querySelectorAll('.tr-page-head__actions button')].map((b) => b.textContent.trim()).find((t) => t.startsWith('Civilités à poser')) || ''`, 20000);
  dit('Clientes : « Civilités à poser (1) », Bio, la dernière muette', bouton === 'Civilités à poser (1)', bouton);
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');
  ws.close();
} catch (e) {
  ko++;
  console.log('ECHEC', e?.message ?? e);
} finally {
  chrome.kill(); serveur.close();
  setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
}
console.log(ko === 0 ? '\nLes civilités se posent d un toucher.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
