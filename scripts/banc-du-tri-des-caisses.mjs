/* LE BANC DU TRI DES CAISSES — `node scripts/banc-du-tri-des-caisses.mjs [capture]`.

   19 octobre 2026. Le harnais `verifie-le-tri-des-caisses` éprouve la règle
   et les magasins ; ce banc ouvre le VRAI Trône comme la direction (serveur
   Supabase injoignable, session et tête gardées, comme le banc hors ligne) et
   fait le tri d'une main, dans Finances › Les caisses :

     - le panneau dit ce qui change, sous les noms de la Maison ;
     - « Appliquer » attend la sauvegarde ;
     - un geste : le tiroir, le MoMoPay, l'épargne hors comptoir, MND NEW et
       son solde passés (par Caisse Principale) au tiroir ;
     - « Défaire », confirmé : tout revient.

   Les caisses portent ses identifiants ; leurs noms et montants sont des exemples. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-tri-'));
const recus = mkdtempSync(path.join(tmpdir(), 'banc-tri-recus-'));
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-tri-chrome-'));
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
await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: recus });
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};
const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
const clique = (selecteur, texte, dans = 'document') => evalue(`(() => {
  const b = [...(${dans}).querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const texte = (sel) => evalue(String.raw`(document.querySelector(${JSON.stringify(sel)})?.innerText || '').replace(/\s+/g, ' ')`);

/* La direction, comme le banc hors ligne. */
const UID = 'u-banc-direction';
const CLE = 'sb-127-auth-token';
const le = new Date(Date.now() - 86_400_000).toISOString();
const jour = new Date();
const AUJ = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`;

await cdp('Page.navigate', { url: `${origine}/` });
await attend(2500);
const B = (await evalue(`(() => { try { return (JSON.parse(localStorage.getItem('trone::mnd_branches') || '[]')[0] || {}).id || 'maison'; } catch { return 'maison'; } })()`)) || 'maison';
const cb = (id, name, x = {}) => ({ id, branchId: B, name, sub: 'Caisse', glyph: '◈', openingXof: 0, ...x });
const semence = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
    user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Direction', role: 'souverain', rubrics: [] } },
  mnd_reset_v5: '1',
  'trone::mnd_cashboxes': [
    cb('ytb0sweqjt', 'Real Money', { sub: 'Caisse journalier' }),
    cb('2b0gyen3wq', 'ACIA1', { sub: 'Momopay' }),
    cb('uhhu3j8pbz', 'Caisse Principale', { sub: 'Caisse manuelle' }),
    cb('3gecxx1oyf', 'MND NEW'),
    cb('b8rgpuq4zm', 'BIIC', { horsBilan: true }),
    cb('dkg7qprz84', 'Épargne A', { horsBilan: true }),
    cb('cb-kkiapay', 'KkiaPay', { sub: 'Paiements en ligne' }),
  ],
  'trone::mnd_invoices': [
    { id: 'inv-new', branchId: B, kind: 'facture', number: 'F-BANC-0001', clientName: 'Passage', date: AUJ,
      lines: [{ id: 'l-new', label: 'Vente', qty: 1, unitXof: 76000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'MND NEW',
      payments: [{ id: 'ip-new', date: AUJ, amountXof: 76000, method: 'Espèces', cashbox: 'MND NEW' }] },
    { id: 'inv-rm', branchId: B, kind: 'facture', number: 'F-BANC-0002', clientName: 'Passage', date: AUJ,
      lines: [{ id: 'l-rm', label: 'Vente', qty: 1, unitXof: 20000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Real Money',
      payments: [{ id: 'ip-rm', date: AUJ, amountXof: 20000, method: 'Espèces', cashbox: 'Real Money' }] },
  ],
};
await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; })()`);
await evalue('location.reload()');
await jusqua(`!!document.querySelector('.tr-top__sync, .tr-side, nav')`, 20000);
await evalue(`location.hash = '#/caisses'; true`);
const vu = await jusqua(`!!document.querySelector('[data-tri="a-faire"]')`, 20000);
dit('Les caisses, comme la direction : le panneau du tri paraît', !!vu);
if (!vu) await photo('0-caisses');

const tri = await texte('[data-tri="a-faire"]');
dit('il dit ce qui change, sous les noms de la Maison', /« Real Money » devient « Tiroir espèces »/.test(tri) && /« ACIA1 » devient « MTN MoMoPay »/.test(tri)
  && /« MND NEW » passe son solde \(76/.test(tri) && /« Caisse Principale » se fond dans « Tiroir espèces »/.test(tri) && /« BIIC »/.test(tri) && /« Épargne A »/.test(tri), tri.slice(0, 300));
const boutonTri = () => evalue(`(() => { const b = [...document.querySelectorAll('[data-tri] button')].find((x) => x.textContent.includes('Appliquer le tri')); return b ? b.disabled : null; })()`);
dit('« Appliquer » attend la sauvegarde', (await boutonTri()) === true);
dit('la sauvegarde se télécharge', await clique('[data-tri] button', '1. Télécharger la sauvegarde'));
await attend(800);
dit('« Appliquer » s ouvre', (await boutonTri()) === false);
await photo('1-avant');
dit('le tri s applique d un geste', await clique('[data-tri] button', '2. Appliquer le tri'));
await attend(1500);
const cbTri = (await lis('trone::mnd_cashboxes')) ?? [];
const de = (id) => cbTri.find((x) => x.id === id) ?? {};
dit('après : Tiroir espèces (Terrasse, équipe), MTN MoMoPay, BIIC et l épargne hors comptoir, MND NEW rangée, Principale fondue dans le tiroir',
  JSON.stringify([de('ytb0sweqjt').name, de('ytb0sweqjt').role, de('ytb0sweqjt').equipe, de('2b0gyen3wq').name, de('b8rgpuq4zm').horsEncaissement, de('dkg7qprz84').horsEncaissement,
    !!de('3gecxx1oyf').archiveeLe, de('uhhu3j8pbz').fondueDans])
    === JSON.stringify(['Tiroir espèces', 'terrasse', true, 'MTN MoMoPay', true, true, true, 'Tiroir espèces']),
  JSON.stringify(cbTri.map((x) => [x.name, x.horsEncaissement ?? '', x.archiveeLe ? 'rangée' : '', x.fondueDans ?? ''])));
const virTri = ((await lis('trone::mnd_transferts_caisse')) ?? []).filter((x) => String(x.id).startsWith('trf-tri-')).map((x) => [x.de, x.vers, x.amountXof]);
dit('les 76 000 F de MND NEW passent (par Principale) au tiroir', JSON.stringify(virTri) === JSON.stringify([['MND NEW', 'Tiroir espèces', 76000]]), JSON.stringify(virTri));
const pRm = ((await lis('trone::mnd_invoices')) ?? []).find((x) => x.id === 'inv-rm');
dit('la vente de Real Money se lit désormais dans « Tiroir espèces »', pRm?.payments?.[0]?.cashbox === 'Tiroir espèces' && pRm?.cashbox === 'Tiroir espèces', JSON.stringify(pRm?.payments));
await attend(9500);
const fait = await texte('[data-tri="fait"]');
dit('le panneau dit « fait » et offre le retour', /est fait/.test(fait) && /Défaire/.test(fait), fait.slice(0, 200));
await photo('2-fait');
dit('« Défaire » se clique', await clique('[data-tri="fait"] button', 'Défaire'));
await attend(800);
dit('... et se confirme', await clique('button', 'Défaire', `document.querySelector('[role="alertdialog"]') || document.createElement('div')`));
await attend(1500);
const cbRetour = (await lis('trone::mnd_cashboxes')) ?? [];
const r = (id) => cbRetour.find((x) => x.id === id) ?? {};
dit('défait : les noms et les caisses d avant reviennent, l épargne aussi, le virement du tri s efface',
  JSON.stringify([r('ytb0sweqjt').name, r('ytb0sweqjt').role ?? null, r('2b0gyen3wq').name, r('dkg7qprz84').horsEncaissement ?? null, !!r('3gecxx1oyf').archiveeLe, !!r('uhhu3j8pbz').archiveeLe,
    ((await lis('trone::mnd_transferts_caisse')) ?? []).filter((x) => String(x.id).startsWith('trf-tri-')).length])
    === JSON.stringify(['Real Money', null, 'ACIA1', null, false, false, 0]),
  JSON.stringify(cbRetour.map((x) => [x.name, x.role ?? '', x.horsEncaissement ?? '', x.archiveeLe ? 'rangée' : ''])));
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { for (const d of [profil, construit, recus]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
console.log(ko === 0 ? '\nLe tri des caisses se fait et se défait d une main.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
