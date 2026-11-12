/* LE BANC DE L'ARGENT DES COMPTES — `node scripts/banc-l-argent-des-comptes.mjs [capture]`.

   12 novembre 2026, « Le choix du moyen », choix ⑥. Le harnais
   `verifie-l-argent-des-comptes` éprouve la règle ; ce banc ouvre le VRAI
   Trône comme le souverain (serveur Supabase injoignable, session et tête
   gardées, comme le banc de la caisse au jour le jour), dans Finances › Les
   caisses :

     - la carte paraît, ses quatre comptes et leurs montants (la paie MTN
       gardée sur la collecte, le compte de paie MTN non lu hors ligne) ;
     - « C'est viré » en deux temps inscrit un virement par compte vers la
       banque, et la carte dit « Viré aujourd'hui » ;
     - un second passage n'inscrit rien de plus.

   Noms et montants inventés. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-adc-'));
console.log('Construction du Trône (serveur injoignable)…');
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-adc-chrome-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  await evalue(`document.querySelector('[data-argent-des-comptes]')?.scrollIntoView({ block: 'start' }); true`);
  await attend(400);
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};
const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
const CARTE = `document.querySelector('[data-argent-des-comptes]') || document.createElement('div')`;
const clique = (texte) => evalue(`(() => {
  const b = [...(${CARTE}).querySelectorAll('button')].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);

const UID = 'u-banc-souverain';
const CLE = 'sb-127-auth-token';
const le = new Date(Date.now() - 86_400_000).toISOString();
const jour = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const AUJ = `${jour.getFullYear()}-${p2(jour.getMonth() + 1)}-${p2(jour.getDate())}`;
const MOIS_AVANT = (() => { const d = new Date(jour.getFullYear(), jour.getMonth() - 1, 15); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; })();

await cdp('Page.navigate', { url: `${origine}/` });
await attend(2500);
const B = (await evalue(`(() => { try { return (JSON.parse(localStorage.getItem('trone::mnd_branches') || '[]')[0] || {}).id || 'maison'; } catch { return 'maison'; } })()`)) || 'maison';
const cb = (cid, name, x = {}) => ({ id: cid, branchId: B, name, sub: 'Caisse', glyph: '◈', openingXof: 0, ...x });
const fac = (n, xof, caisse, methode) => ({
  id: `inv-adc-${n}`, branchId: B, kind: 'facture', number: `F-ADC-00${n}`, clientName: 'Passage', date: AUJ,
  lines: [{ id: `l-${n}`, label: 'Rituel', qty: 1, unitXof: xof, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: caisse,
  payments: [{ id: `ip-adc-${n}`, date: AUJ, amountXof: xof, method: methode, cashbox: caisse }],
});
const ligne = (employeeId, name, net) => ({ employeeId, name, result: { brut: net, cnssSalariale: 0, its: 0, retenues: 0, net, cnssPatronale: 0, coutEmployeur: net } });
const semence = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
    user: { id: UID, email: 'souverain@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Souverain', role: 'souverain', rubrics: [] } },
  mnd_reset_v5: '1',
  'trone::mnd_cashboxes': [
    cb(`cb-mtn-collection-${B}`, 'MTN Collection', { sub: 'Payer par MTN', role: 'terrasse' }),
    cb(`cb-mndpay-${B}`, 'FedaPay', { sub: 'FedaPay · avant le reversement', role: 'terrasse' }),
    cb(`cb-kkiapay-${B}`, 'KkiaPay', { sub: 'Paiements en ligne', role: 'terrasse' }),
    cb(`cb-momopay-${B}`, 'MTN MoMoPay', { sub: 'MTN MoMoPay · code 909099', role: 'terrasse' }),
    cb('cb-banque-adc', 'La Banque', { sub: 'Compte de la société', role: 'banque' }),
  ],
  'trone::mnd_invoices': [
    fac('01', 300000, 'MTN Collection', 'MTN Collection'), fac('02', 80000, 'FedaPay', 'FedaPay'),
    fac('03', 50000, 'KkiaPay', 'KkiaPay'), fac('04', 20000, 'MTN MoMoPay', 'MTN MoMo'),
  ],
  'trone::mnd_expenses': [],
  'trone::mnd_transferts_caisse': [],
  'trone::mnd_staff': [
    { id: 'st-adc-a', branchId: B, name: 'Aïcha Banc', role: 'Maître', mobileMoney: { numero: '2290197000011', operateur: 'MTN', changeLe: '2026-01-01' } },
    { id: 'st-adc-b', branchId: B, name: 'Bénédicte Banc', role: 'Maître', mobileMoney: { numero: '2290195000022', operateur: 'Moov', changeLe: '2026-01-01' } },
  ],
  'trone::mnd_payroll_runs': [{ id: 'run-adc', period: MOIS_AVANT, status: 'valide', branchId: B, createdAt: le,
    lines: [ligne('st-adc-a', 'Aïcha Banc', 100000), ligne('st-adc-b', 'Bénédicte Banc', 40000)] }],
};
await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; })()`);
await evalue('location.reload()');
await jusqua(`!!document.querySelector('.tr-top__sync, .tr-side, nav')`, 20000);
await evalue(`location.hash = '#/caisses'; true`);
const vu = await jusqua(`!!document.querySelector('[data-argent-des-comptes]')`, 20000);
dit('Les caisses, comme le souverain : la carte « L argent des comptes » paraît', !!vu);
const lignes = await evalue(`[...(${CARTE}).querySelectorAll('tr[data-compte]')].map((r) => [r.getAttribute('data-compte'), ...[...r.cells].slice(1).map((c) => c.textContent.replace(/\\D/g, '') || c.textContent.trim())])`) ?? [];
dit('les quatre comptes : solde, gardé, à la banque (la paie MTN de 100 000 F gardée sur la collecte, MoMoPay à pointer)',
  JSON.stringify(lignes) === JSON.stringify([['mtnCollection', '300000', '100000', '200000'], ['fedapay', '80000', '0', '80000'], ['kkiapay', '50000', '0', '50000'], ['momopay', '20000', 'à pointer', '·']]),
  JSON.stringify(lignes));
dit('vers la banque : 330 000 F', (await evalue(`(${CARTE}).getAttribute('data-argent-des-comptes')`)) === '330000', await evalue(`(${CARTE}).getAttribute('data-argent-des-comptes')`));
const texte = await evalue(`(${CARTE}).innerText.replace(/\\s+/g, ' ')`);
dit('hors ligne, le compte de paie MTN n est pas lu ; la paie Moov se dit versée à la main', /compte de paie MTN non lu/.test(texte) && /La paie Moov \(40\s000 F\) se verse encore à la main/.test(texte), texte.slice(0, 160));
dit('ce qu il faut demander à MTN se dit', /À demander à MTN : 100\s000 F de la collecte vers le compte de paie/.test(texte));
await photo('carte');
dit('« C est viré » demande une confirmation', await clique('C’est viré'));
await attend(300);
dit('... « Inscrire 330 000 F vers « La Banque » »', await clique('Inscrire 330'));
await attend(800);
const trf = ((await lis('trone::mnd_transferts_caisse')) ?? []).map((t) => [t.de, t.vers, t.amountXof]);
dit('trois virements vers La Banque, jamais MoMoPay', JSON.stringify(trf) === JSON.stringify([['MTN Collection', 'La Banque', 200000], ['FedaPay', 'La Banque', 80000], ['KkiaPay', 'La Banque', 50000]]), JSON.stringify(trf));
dit('la carte dit « Viré aujourd hui »', /Viré aujourd’hui/.test(await evalue(`(${CARTE}).innerText`)));
await photo('vire');
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close();
chrome.kill();
serveur.close();
await attend(500);
try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore son dossier */ }
try { rmSync(construit, { recursive: true, force: true }); } catch { /* rien */ }
console.log(ko ? `\n${ko} ECHEC(S).` : '\nL argent des comptes tient.');
process.exit(ko ? 1 : 0);
