/* LE BANC DE LA CAISSE EN PLUSIEURS MOYENS — `node scripts/banc-mnd-pay-caisse.mjs [dossier construit]`.

   16 octobre 2026, MND PAY (maquette UigU1Rr5…). Le harnais `verifie-mnd-pay`
   éprouve les règles ; ce banc ouvre le VRAI Trône, hors ligne, et fait un
   ticket comme une main le ferait :

     - un produit à 47 000 F, un pourboire libre de 2 000 F ;
     - une part de 20 000 F en espèces, puis le reste (27 000 F) en MTN MoMo ;
     - la pièce porte DEUX versements (chacun son moyen), le pourboire hors
       du total, et l'équipe reçoit ses parts du pourboire ;
     - hors ligne, la tuile MND PAY ne paraît pas (pas de connexion, pas de
       demande), et le pied de la caisse ne promet plus de réconciliation
       automatique.

   Il attend le Trône construit sans serveur (sous Bash : sous PowerShell, une
   variable vide est SUPPRIMÉE et Vite reprend le vrai .env) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const construit = process.argv[2] || path.join(tmpdir(), 'banc-trone');
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-mndpay-'));
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
const clique = (selecteur, texte) => evalue(`(() => {
  const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const tape = (selecteur, valeur) => evalue(`(() => {
  const el = document.querySelector(${JSON.stringify(selecteur)});
  if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);

/* LA MAISON D'EXEMPLE — un tiroir, deux membres de l'équipe, un produit. */
const SEMENCE = {
  'trone::mnd_cashboxes': [{ id: 'cb-acc', branchId: 'maison', name: 'Accueil espèces', sub: 'Tiroir du comptoir', glyph: '◈', openingXof: 0 }],
  'trone::mnd_staff': [
    { id: 'st-a', branchId: 'maison', name: 'Aïcha Banc', role: 'Maître', partPourboire: 1 },
    { id: 'st-b', branchId: 'maison', name: 'Bénédicte Banc', role: 'Maître', partPourboire: 1 },
  ],
  'trone::mnd_catalog_products': [{ id: 'pr-banc', name: 'Brume d’aloès du banc', priceXof: 47000, stock: 10, order: 1 }],
  'trone::mnd_invoices': [],
};
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('banc_seme')) { sessionStorage.setItem('banc_seme', '1'); localStorage.setItem('mnd_reset_v5', '1'); for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); } } catch (e) {}` });
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/caisse` });
await attend(8000);

dit('la caisse s ouvre', await evalue(`!!document.querySelector('.trv-pick')`));
dit('hors ligne, pas de tuile MND PAY (pas de connexion, pas de demande)', (await evalue(`[...document.querySelectorAll('.trv-pay .n')].some((x) => x.textContent.trim() === 'MND PAY')`)) === false);
dit('le produit entre au ticket', await clique('.trv-pick', 'Brume d’aloès du banc'));
await attend(700);
dit('le pourboire se tape librement', await tape('#caisse-pourboire', '2000'));
await attend(300);
dit('Espèces se choisit', await clique('.trv-pay', 'Espèces'));
await attend(300);
dit('une part de 20 000 F se tape', await tape('input[aria-label^="Montant d’une part"]', '20000'));
await attend(300);
dit('« Ajouter en Espèces » pose la part', await clique('button', 'Ajouter en Espèces'));
await attend(500);
const reste = await evalue(`document.body.innerText.includes('reste 27')`);
dit('le reste se dit : 27 000 F', reste);
dit('MTN MoMo se choisit pour le reste', await clique('.trv-pay', 'MTN MoMo'));
await attend(400);
const libelle = await evalue(`[...document.querySelectorAll('button')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim()).find((t) => t.startsWith('Encaisser 27')) || ''`);
dit('le bouton encaisse le reste, pourboire en plus', /Encaisser 27\s?000\s?F \+ pourboire 2\s?000\s?F/u.test(libelle), libelle);
dit('le pied ne promet plus une réconciliation automatique', (await evalue(`document.body.innerText.includes('réconciliation MoMo automatique')`)) === false);
await clique('button', 'Encaisser 27');
await attend(2500);

const pieces = (await lis('trone::mnd_invoices')) ?? [];
const p = pieces[0];
dit('une pièce est née', !!p, pieces.length);
const v = (p?.payments ?? []).map((x) => [x.method, x.amountXof]);
dit('deux versements : 20 000 F en espèces, 27 000 F en MTN MoMo', JSON.stringify(v) === JSON.stringify([['Espèces', 20000], ['MTN MoMo', 27000]]), JSON.stringify(v));
dit('la pièce est payée, le pourboire à part (hors du total)', p?.status === 'payée' && p?.tipXof === 2000, `${p?.status} · ${p?.tipXof}`);
const tips = ((await lis('trone::mnd_tips_v2')) ?? []).filter((x) => x.invoiceId === p?.id);
dit('l équipe reçoit ses parts du pourboire (2 × 1 000 F)', tips.length === 2 && tips.reduce((n, x) => n + x.amountXof, 0) === 2000, JSON.stringify(tips.map((x) => x.amountXof)));
dit('le ticket suivant repart vide de parts et de pourboire', (await evalue(`document.querySelector('#caisse-pourboire') === null || document.querySelector('#caisse-pourboire').value === '0'`)));
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nLa caisse encaisse en plusieurs moyens.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
