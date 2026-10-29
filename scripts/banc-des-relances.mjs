/* LE BANC DES RELANCES — `node scripts/banc-des-relances.mjs [dossier construit]`.

   Le vrai Trône, construit hors ligne, dans un vrai navigateur (18 octobre
   2026, maquette « Les relances ») :
     · la facture montre ses relances, et toute personne qui encaisse pose la
       pause et la lève (elle s'écrit sur la facture) ;
     · Paramètres › Relances dit le lancement et liste le rattrapage des trente
       jours d'avant, ses gestes fermés à qui n'est pas la direction ;
     · À faire s'ouvre sans erreur (la liste « À appeler » est à la direction,
       que le hors-ligne n'a pas : elle n'y paraît pas).

   Construire d'abord, sous Bash :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const racine = path.resolve(import.meta.dirname, '..');
const construit = process.argv[2] || path.join(tmpdir(), 'banc-trone');
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}

/* Les réglages par défaut de la Maison, lus du dépôt : le banc ne les recopie pas. */
const cache = path.join(racine, 'node_modules', '.cache', 'banc-des-relances');
mkdirSync(cache, { recursive: true });
const entree = path.join(cache, 'entree.ts');
const { writeFileSync } = await import('node:fs');
writeFileSync(entree, `export { DEFAULT_SETTINGS } from '${path.join(racine, 'src/shared/settings').replace(/\\/g, '/')}';`);
await build({
  entryPoints: [entree], bundle: true, format: 'esm', platform: 'node', outfile: path.join(cache, 'r.mjs'), logLevel: 'error',
  define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
  banner: { js: `const __m = new Map(); globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) }; globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } }; globalThis.document = { body: { dataset: {} }, addEventListener() {} }; globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };` },
});
const { DEFAULT_SETTINGS } = await import(pathToFileURL(path.join(cache, 'r.mjs')).href);
rmSync(cache, { recursive: true, force: true });

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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-relances-'));
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
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const texte = () => evalue(`document.body.innerText.replace(/\\s+/g, ' ')`);
const clique = (selecteur, debut) => evalue(`(() => {
  const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(debut)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);

const j = (d) => { const x = new Date(); x.setDate(x.getDate() + d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
const AUJ = j(0);
const DEPUIS = j(-5);
const hier = new Date(Date.now() - 86_400_000).toISOString();
const facture = (id, date, clientId, extra = {}) => ({
  id, branchId: 'maison', kind: 'facture', status: 'envoyée', number: `MND-BANC-${id}`, date, creeeLe: `${date}T10:00:00`, clientId, clientName: '',
  lines: [{ id: `l-${id}`, label: 'Rituel du banc', qty: 1, unitXof: 2000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Aube', payments: [], ...extra,
});
const SEMENCE = {
  'trone::mnd_settings': { ...DEFAULT_SETTINGS, mndPay: { actif: true }, relances: { actives: true, depuis: DEPUIS } },
  'trone::mnd_clients': [
    { id: 'cl-a', branchId: 'maison', name: 'Awa Banc', phone: '0197000001', city: '', persona: '', since: AUJ, segments: [] },
    { id: 'cl-c', branchId: 'maison', name: 'Carine Banc', phone: '0197000003', city: '', persona: '', since: AUJ, segments: [] },
    { id: 'cl-z', branchId: 'maison', name: 'Zoé Banc', phone: '0197000009', city: '', persona: '', since: AUJ, segments: [] },
  ],
  'trone::mnd_invoices': [
    facture('inv-a', j(-1), 'cl-a'),
    facture('inv-c', j(-8), 'cl-c'),
    facture('inv-z', j(-40), 'cl-z'),
    facture('inv-d', DEPUIS, 'cl-z'),
  ],
  'trone::mnd_envois': [1, 2, 3, 4].map((n) => ({ id: `rl-inv-d-${n}-whatsapp`, type: 'relance-facture', canal: 'whatsapp', apptId: '', dateRdv: '', statut: 'envoyé', quand: hier })),
};
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('banc_seme')) { sessionStorage.setItem('banc_seme', '1'); localStorage.setItem('mnd_reset_v5', '1'); for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); } } catch (e) {}` });

const ouvre = async (hash, ms = 6000) => {
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#${hash}` });
  await attend(1200);
  await cdp('Page.reload', { ignoreCache: false });
  await attend(ms);
};

/* ── A. LA FACTURE ET SES RELANCES ── */
await ouvre('/factures?id=inv-a', 7000);
let t = await texte();
dit('la facture du lancement montre ses relances : aucune partie, la prochaine à 10 h (demain si 10 h est passé)', t.includes('RELANCES SUR WHATSAPP') || t.includes('Relances sur WhatsApp'), t.match(/Aucune relance partie[^.]*\./)?.[0]);
dit('… avec l année sur la date', /Aucune relance partie · prochaine le \S+ \d{1,2} \S+ \d{4} à 10 h\./.test(t));
dit('toute personne qui encaisse peut mettre en pause', await clique('button', 'Mettre en pause'));
await attend(800);
const pausee = ((await lis('trone::mnd_invoices')) ?? []).find((f) => f.id === 'inv-a');
t = await texte();
dit('la pause s écrit sur la facture, et l écran la dit', !!pausee?.relancesPause?.le && /En pause depuis le/.test(t));
dit('elle se lève d un geste', await clique('button', 'Reprendre les relances'));
await attend(800);
const reprise = ((await lis('trone::mnd_invoices')) ?? []).find((f) => f.id === 'inv-a');
dit('… et la facture n a plus de pause', !reprise?.relancesPause);
await ouvre('/factures?id=inv-z', 6000);
t = await texte();
dit('une facture d avant le lancement, non rattrapée, ne montre rien', !/Relances sur WhatsApp|RELANCES SUR WHATSAPP/.test(t));

/* ── B. PARAMÈTRES › RELANCES ── */
await ouvre('/parametres?ouvre=paiements', 7000);
t = await texte();
dit('la carte dit le lancement', /Allumées depuis le \S+ \d{1,2} \S+ \d{4}/.test(t), t.match(/Allumées depuis le [^:]*/)?.[0]);
dit('le rattrapage liste la facture des trente jours d avant, pas celle d il y a quarante jours, pas celle du lancement',
  t.includes('Carine Banc · facture du') && !t.includes('Zoé Banc · facture du') && !t.includes('Awa Banc · facture du'));
const ferme = await evalue(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Relancer ces')); return b ? b.disabled : null; })()`);
dit('hors de la direction, le rattrapage ne se valide pas', ferme === true, String(ferme));

/* ── C. À FAIRE ── */
await ouvre('/a-faire', 6000);
t = await texte();
dit('À faire s ouvre, et « À appeler » reste à la direction', !t.includes('À appeler') && t.length > 200);

dit('aucune erreur dans la page', erreurs.length === 0, erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
ws.close(); chrome.kill(); serveur.close();
try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore le dossier */ }
console.log(ko === 0 ? '\nLes relances tiennent au comptoir.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
