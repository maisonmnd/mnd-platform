/* LE BANC DES AVIS GOOGLE — `node scripts/banc-des-avis-google.mjs [capture]`.

   25 octobre 2026 : « je veux les sélectionner, les avis Google qui sont sur
   le site, mais je veux également répondre aux avis Google depuis ici »
   (Yéman). Le harnais `verifie-les-avis-choisis` éprouve le juge ; ce banc
   ouvre le VRAI Trône comme la direction, dans Vitrines › Les avis Google, et
   fait le choix d'une main :

     - chaque rangée porte sa case « Site » ;
     - deux cases cochées : l'ordre du clic, le document de la vitrine écrit ;
     - le filtre « Sur le site » range les avis dans l'ordre de la page ;
     - « Monter », dans le panneau, échange les deux ;
     - « Écrire moi-même » ouvre une réponse vide, qui devient le brouillon ;
     - « Le site public » montre le choix sans rien écrire.

   Le serveur du banc sert le Trône ET répond comme Supabase sur deux
   adresses seulement (le relevé des avis, la version de la fonction) ; tout
   le reste coupe la connexion, comme un serveur injoignable : la session
   gardée tient, comme au banc hors ligne. Les avis sont des exemples, signés
   d'initiales (le dépôt est public). */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-avis-'));

const RELEVE = {
  note: 4.9, nombre: 299, fiche: 'https://www.google.com/maps/place/?q=place_id:exemple',
  avis: [
    { auteur: 'G. J.', note: 5, texte: 'Il était temps que je fasse ma reprise de locks, et le soin a été long et précis.', quand: 'il y a 3 mois', publieLe: '2026-07-23T10:00:00Z' },
    { auteur: 'B. F.', note: 5, texte: 'Bluffé par la qualité du travail sur les nouveaux dreadlocks de mon fils.', quand: 'il y a 4 mois', publieLe: '2026-07-01T10:00:00Z' },
    { auteur: 'F. G.', note: 5, texte: 'Après avoir cherché longtemps des mains expertes pour mes locks, je ne suis pas déçue.', quand: 'il y a 3 mois', publieLe: '2026-07-13T10:00:00Z' },
    { auteur: 'A. K.', note: 5, texte: 'Très bon accueil, travail soigné et professionnel.', quand: 'il y a 3 mois', publieLe: '2026-07-28T10:00:00Z' },
    { auteur: 'S. D.', note: 5, texte: 'Une de mes meilleures expériences à Cotonou.', quand: 'il y a 3 mois', publieLe: '2026-07-16T10:00:00Z' },
  ],
};

/* La direction : une session valide, que le serveur du banc reconnaît. */
const UID = 'u-banc-direction';
const CLE = 'sb-127-auth-token';
const le = new Date(Date.now() - 86_400_000).toISOString();

console.log('Construction du Trône (Supabase = le serveur du banc)…');
let origine = '';
const serveur = createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (process.env.BANC_LOG && /^\/(rest|auth|functions)\//.test(u.pathname)) console.log('  [serveur]', req.method, u.pathname + u.search);
  if (u.pathname === '/rest/v1/documents' && u.searchParams.get('key') === 'eq.mnd_avis_google') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: RELEVE, updated_at: new Date().toISOString() }));
    return;
  }
  /* Le serveur répond : la tête se relit chez lui (l'utilisateur, puis sa
     ligne du personnel), sinon le Trône ouvrirait sans maître. */
  if (u.pathname === '/auth/v1/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{}'); return; }
  if (u.pathname === '/auth/v1/user') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le }));
    return;
  }
  if (u.pathname === '/rest/v1/staff') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ user_id: UID, name: 'Direction', role: 'souverain', rubrics: [] }));
    return;
  }
  if (u.pathname === '/functions/v1/ia-maison' && req.method === 'GET') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ version: '2026-10-24-a' }));
    return;
  }
  if (/^\/(rest|auth|functions|realtime|storage)\//.test(u.pathname)) { req.socket.destroy(); return; }
  let f = path.join(construit, decodeURIComponent(u.pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
origine = `http://127.0.0.1:${serveur.address().port}`;
execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: origine, VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
});
renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));

const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-avis-chrome-'));
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
/** Les auteurs des rangées, dans l'ordre de l'écran, avec l'étiquette de leur case. */
const rangees = () => evalue(String.raw`[...document.querySelectorAll('.trc-avisg__avis')].map((d) => [d.querySelector('.trc-avisg__qui b')?.textContent, d.querySelector('.trc-avisg__site span')?.textContent, d.querySelector('.trc-avisg__site input')?.checked])`);
const coche = (auteur) => evalue(`(() => {
  const d = [...document.querySelectorAll('.trc-avisg__avis')].find((x) => x.querySelector('.trc-avisg__qui b')?.textContent === ${JSON.stringify(auteur)});
  const c = d?.querySelector('.trc-avisg__site input');
  if (c) c.click();
  return !!c;
})()`);
const ouvre = (auteur) => evalue(`(() => {
  const d = [...document.querySelectorAll('.trc-avisg__avis')].find((x) => x.querySelector('.trc-avisg__qui b')?.textContent === ${JSON.stringify(auteur)});
  const b = d?.querySelector('.trc-avisg__ligne');
  if (b) b.click();
  return !!b;
})()`);

await cdp('Page.navigate', { url: `${origine}/` });
await attend(2500);
const semence = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Direction', role: 'souverain', rubrics: [] } },
  mnd_reset_v5: '1',
};
await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; })()`);
await evalue('location.reload()');
await jusqua(`!!document.querySelector('.tr-top__sync, .tr-side, nav')`, 20000);
await evalue(`location.hash = '#/vitrine?onglet=avis'; true`);
const vu = await jusqua(`document.querySelectorAll('.trc-avisg__avis').length === 5`, 40000);
dit('Les avis Google, comme la direction : les cinq avis du relevé paraissent', !!vu);
if (!vu) { await photo('0-avis'); }

const r0 = await rangees();
dit('chaque rangée porte sa case « Site », rien de coché', Array.isArray(r0) && r0.length === 5 && r0.every((x) => x[1] === 'Site' && x[2] === false), JSON.stringify(r0));
dit('la bande dit que le site montre ceux de Google', /Sur le site : ceux de Google/.test(await texte('.trc-avisg') + await texte('main')));

await coche('F. G.');
await attend(300);
await coche('G. J.');
await attend(500);
const r1 = await rangees();
dit('deux cases cochées, dans l ordre du clic : F. G. premier, G. J. second', JSON.stringify(r1.filter((x) => x[2]).map((x) => [x[0], x[1]])) === JSON.stringify([['G. J.', 'Site · 2'], ['F. G.', 'Site · 1']]), JSON.stringify(r1));
const cfg1 = await lis('trone::mnd_vitrine_config');
dit('le document de la vitrine porte deux clés, sans aucun texte d avis', Array.isArray(cfg1?.avisChoisis) && cfg1.avisChoisis.length === 2 && cfg1.avisChoisis.every((k) => /^av-[0-9a-z]+$/.test(k)), JSON.stringify(cfg1?.avisChoisis));
dit('la bande dit « 2 avis choisis »', /Sur le site : 2 avis choisis/.test(await texte('main')));

dit('le filtre « Sur le site · 2 » se clique', await clique('.mnd-seg', 'Sur le site · 2'));
await attend(400);
const r2 = await rangees();
dit('... et range les avis dans l ordre de la page', JSON.stringify(r2.map((x) => x[0])) === JSON.stringify(['F. G.', 'G. J.']), JSON.stringify(r2));
await photo('1-sur-le-site');

dit('le panneau de G. J. s ouvre', await ouvre('G. J.'));
await attend(400);
const cadre = await texte('.trc-avisg__cadre--site');
dit('... il dit sa place sur le site', /2e avis montré sur maisonmnd\.com/.test(cadre), cadre);
dit('« Monter » se clique', await clique('.trc-avisg__cadre--site button', 'Monter'));
await attend(500);
const r3 = await rangees();
dit('... G. J. passe premier, partout', JSON.stringify(r3.map((x) => [x[0], x[1]])) === JSON.stringify([['G. J.', 'Site · 1'], ['F. G.', 'Site · 2']]), JSON.stringify(r3));
dit('... et le document suit', JSON.stringify((await lis('trone::mnd_vitrine_config'))?.avisChoisis) === JSON.stringify([...cfg1.avisChoisis].reverse()));

/* Répondre depuis ici, sans Claude. */
dit('« Écrire moi-même » s offre sous un avis sans proposition', await clique('.trc-avisg__dedans button', 'Écrire moi-même'));
await attend(400);
const zone = await evalue(`!!document.querySelector('.trc-avisg__dedans textarea')`);
dit('... une zone s ouvre, « Votre réponse »', zone && /Votre réponse/.test(await texte('.trc-avisg__dedans')));
await evalue(String.raw`(() => {
  const z = document.querySelector('.trc-avisg__dedans textarea');
  const poser = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
  poser.call(z, 'Merci pour votre confiance.');
  z.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await attend(500);
const br = await lis('trone::mnd_ia_avis_brouillons');
dit('... ce qu on tape devient le brouillon de l avis', Object.values(br ?? {}).some((b) => b?.reponse === 'Merci pour votre confiance.' && !b?.le), JSON.stringify(br));
await photo('2-panneau');

/* Au téléphone. */
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await attend(800);
const deborde = await evalue('document.documentElement.scrollWidth > window.innerWidth + 1');
dit('au téléphone (390 px), rien ne déborde', deborde === false, String(await evalue('document.documentElement.scrollWidth')));
await photo('3-telephone');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/* « Le site public » montre, n'écrit plus. */
dit('« Le site public » se clique', await clique('.mnd-seg', 'Le site public'));
await attend(800);
const resume = await evalue(String.raw`(() => {
  const b = [...document.querySelectorAll('div')].find((d) => d.firstElementChild?.textContent === 'Les avis Google du site');
  return b ? b.innerText.replace(/\s+/g, ' ') : '';
})()`);
dit('... son bloc montre les deux choisis, dans l ordre, et mène à l onglet', /1\.\s*★+\s*G\. J\.[\s\S]*2\.\s*★+\s*F\. G\./.test(resume) && /dans « Les avis Google »/.test(resume), resume.slice(0, 260));
dit('... sans case à cocher', (await evalue(String.raw`(() => {
  const b = [...document.querySelectorAll('div')].find((d) => d.firstElementChild?.textContent === 'Les avis Google du site');
  return b ? b.querySelectorAll('input[type=checkbox]').length : -1;
})()`)) === 0);
await photo('4-site-public');
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
console.log(ko === 0 ? '\nLes avis du site se choisissent depuis l onglet des avis.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
