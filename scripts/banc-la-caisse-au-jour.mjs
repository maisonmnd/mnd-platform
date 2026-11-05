/* LE BANC DE LA CAISSE AU JOUR LE JOUR — `node scripts/banc-la-caisse-au-jour.mjs [capture]`.

   5 novembre 2026, maquette « La caisse au jour le jour » validée. Le
   harnais `verifie-la-caisse-au-jour-le-jour` éprouve les règles ; ce banc
   ouvre le VRAI Trône comme la direction (serveur Supabase injoignable,
   session et tête gardées, comme le banc du tri des caisses) et fait les
   gestes d'une main, dans Finances › Les caisses :

     - « Remettre à 0 F » sur la carte du tiroir : le livre, ce que chaque
       mois a laissé, « À régulariser » calculé ;
     - un versement sans sa caisse ne s'écrit pas ; avec elle, si ;
     - la remise confirmée : le transfert et la sortie « À régulariser »
       s'écrivent, le tiroir tombe à 0 F ;
     - « Justifier une partie » : une dépense du bon mois, le reste baisse,
       le tiroir ne bouge pas une seconde fois ;
     - le relevé du tiroir, « Jour par jour » : le soir dit 0 F.

   Noms et montants inventés. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-cjj-'));
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-cjj-chrome-'));
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
const chiffres = (sel, dans = 'document') => evalue(`((${dans}).querySelector(${JSON.stringify(sel)})?.textContent || '').replace(/\\D/g, '')`);
/* React lit la valeur par son descripteur natif : on la pose comme une frappe. */
const tape = (sel, valeur) => evalue(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  return true;
})()`);
const MODALE = `document.querySelector('[role="dialog"]') || document.createElement('div')`;
const CONFIRME = `document.querySelector('[role="alertdialog"]') || document.createElement('div')`;
const carte = (nom) => `[...document.querySelectorAll('.trf-caisse')].find((c) => c.querySelector('.trf-caisse__name')?.textContent.trim() === ${JSON.stringify(nom)}) || document.createElement('div')`;

/* La direction, comme le banc du tri des caisses. */
const UID = 'u-banc-direction';
const CLE = 'sb-127-auth-token';
const le = new Date(Date.now() - 86_400_000).toISOString();
const jour = new Date();
const p2 = (n) => String(n).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const AUJ = isoDe(jour);
const moisAvant = (n, j) => isoDe(new Date(jour.getFullYear(), jour.getMonth() - n, j, 12));
const FIN_M1 = isoDe(new Date(jour.getFullYear(), jour.getMonth(), 0, 12));
/* La remise se propose au dernier soir du mois d'avant jusqu'au 10, au jour même ensuite. */
const REMISE = jour.getDate() <= 10 ? FIN_M1 : AUJ;

await cdp('Page.navigate', { url: `${origine}/` });
await attend(2500);
const B = (await evalue(`(() => { try { return (JSON.parse(localStorage.getItem('trone::mnd_branches') || '[]')[0] || {}).id || 'maison'; } catch { return 'maison'; } })()`)) || 'maison';
const cb = (cid, name, x = {}) => ({ id: cid, branchId: B, name, sub: 'Caisse', glyph: '◈', openingXof: 0, ...x });
const fac = (n, date, xof) => ({
  id: `inv-cjj-${n}`, branchId: B, kind: 'facture', number: `F-BANC-00${n}`, clientName: 'Passage', date,
  lines: [{ id: `l-${n}`, label: 'Rituel', qty: 1, unitXof: xof, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'payée', cashbox: 'Tiroir du banc',
  payments: [{ id: `ip-${n}`, date, amountXof: xof, method: 'Espèces', cashbox: 'Tiroir du banc' }],
});
const semence = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
    user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Direction', role: 'souverain', rubrics: [] } },
  mnd_reset_v5: '1',
  'trone::mnd_cashboxes': [cb('cb-tiroir', 'Tiroir du banc', { sub: 'Espèces du comptoir' }), cb('cb-banque', 'Banque du banc', { sub: 'Compte' })],
  'trone::mnd_invoices': [fac('01', moisAvant(2, 15), 100000), fac('02', moisAvant(1, 10), 50000)],
  'trone::mnd_expenses': [{ id: 'exp-cjj-1', branchId: B, label: 'Coursier', amountXof: 10000, date: moisAvant(1, 20), cashbox: 'Tiroir du banc', category: 'Logistique' }],
  'trone::mnd_entrees_hors_activite': [],
  'trone::mnd_transferts_caisse': [],
};
await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); return true; })()`);
await evalue('location.reload()');
await jusqua(`!!document.querySelector('.tr-top__sync, .tr-side, nav')`, 20000);
await evalue(`location.hash = '#/caisses'; true`);
const vu = await jusqua(`!!(${carte('Tiroir du banc')}).querySelector('.trf-caisse__bal')`, 20000);
dit('Les caisses, comme la direction : la carte du tiroir paraît', !!vu);
dit('le tiroir dit 140 000 F (150 000 F encaissés, 10 000 F dépensés)', (await chiffres('.trf-caisse__bal', carte('Tiroir du banc'))) === '140000', await chiffres('.trf-caisse__bal', carte('Tiroir du banc')));
dit('« Remettre à 0 F » se trouve sur la carte du tiroir', await clique('.trf-caisse__acte', 'Remettre à 0 F', carte('Tiroir du banc')));
const ouverte = await jusqua(`(${MODALE}).textContent.includes('Où est allé l’argent')`, 8000);
dit('la fenêtre de la remise s ouvre', !!ouverte);
await photo('1-remise');
dit('le livre au soir de la remise et « À régulariser » disent 140 000 F', (await chiffres('.cjj-grand b', MODALE)) === '140000' && (await chiffres('.cjj-calc', MODALE)) === '140000',
  `${await chiffres('.cjj-grand b', MODALE)} / ${await chiffres('.cjj-calc', MODALE)}`);
const mois = await evalue(`[...(${MODALE}).querySelectorAll('.cjj-ligne')].map((l) => (l.lastElementChild?.textContent || '').replace(/\\D/g, ''))`);
const moisDits = await evalue(`[...(${MODALE}).querySelectorAll('.cjj-ligne')].map((l) => l.firstElementChild?.textContent || '')`);
dit('chaque mois se dit avec son année', (moisDits ?? []).length > 0 && (moisDits ?? []).every((t) => /\d{4}/.test(t) || t.startsWith('Laissé')), JSON.stringify(moisDits));
dit('ce que chaque mois a laissé : 100 000 F puis 40 000 F', JSON.stringify(mois?.slice(-2)) === JSON.stringify(['100000', '40000']), JSON.stringify(mois));
await tape('#rz-banque', '40000');
await attend(400);
const souci = await evalue(`(${MODALE}).querySelector('.cjj-souci')?.textContent || ''`);
const bouton = () => evalue(`(() => { const b = [...(${MODALE}).querySelectorAll('button')].find((x) => x.textContent.trim().startsWith('Remettre à')); return b ? b.disabled : null; })()`);
dit('un versement sans sa caisse ne s écrit pas', souci === 'Choisissez la caisse qui a reçu le versement.' && (await bouton()) === true, souci);
await tape('[aria-label="La caisse qui l’a reçu"]', 'Banque du banc');
await attend(400);
dit('avec sa caisse : « À régulariser » tombe à 100 000 F, le bouton s ouvre', (await chiffres('.cjj-calc', MODALE)) === '100000' && (await bouton()) === false, await chiffres('.cjj-calc', MODALE));
dit('« Remettre à 0 F » demande la confirmation', await clique('button', 'Remettre à 0 F', MODALE));
await jusqua(`!!document.querySelector('[role="alertdialog"]')`, 5000);
dit('... qui s accepte', await clique('button', 'Écrire la remise', CONFIRME));
await attend(1200);
const hav = ((await lis('trone::mnd_entrees_hors_activite')) ?? []).filter((m) => m.motif === 'À régulariser');
const trf = ((await lis('trone::mnd_transferts_caisse')) ?? []).map((t) => [t.de, t.vers, t.amountXof, t.date]);
dit('la sortie « À régulariser » s écrit : 100 000 F, au soir de la remise, le livre et les mois gardés',
  hav.length === 1 && hav[0].amountXof === 100000 && hav[0].sens === 'sortie' && hav[0].date === REMISE && hav[0].cashbox === 'Tiroir du banc'
    && hav[0].remise?.livreXof === 140000 && hav[0].remise.parMois.reduce((s, p) => s + p.xof, 0) === 140000,
  JSON.stringify(hav.map((m) => [m.amountXof, m.date, m.remise?.livreXof])));
dit('le versement s écrit en transfert vers la banque', JSON.stringify(trf) === JSON.stringify([['Tiroir du banc', 'Banque du banc', 40000, REMISE]]), JSON.stringify(trf));
dit('la fenêtre le dit', /remis à 0 F/.test(await evalue(`(${MODALE}).querySelector('.cjj-fait')?.textContent || ''`)));
await photo('2-faite');
await clique('button', 'Fermer', MODALE);
await attend(800);
dit('le tiroir tombe à 0 F, la banque reçoit 40 000 F', (await chiffres('.trf-caisse__bal', carte('Tiroir du banc'))) === '0' && (await chiffres('.trf-caisse__bal', carte('Banque du banc'))) === '40000',
  `${await chiffres('.trf-caisse__bal', carte('Tiroir du banc'))} / ${await chiffres('.trf-caisse__bal', carte('Banque du banc'))}`);
dit('le registre « À régulariser » paraît : 100 000 F', (await chiffres('.cjj-registre__tete b')) === '100000', await chiffres('.cjj-registre__tete b'));
dit('« Défaire la remise » est offert tant que rien n est régularisé', !!(await evalue(`[...document.querySelectorAll('.cjj-registre button')].some((b) => b.textContent.includes('Défaire la remise'))`)));

/* Une part retrouvée. */
dit('« Justifier une partie » s ouvre', await clique('.cjj-registre button', 'Justifier une partie'));
await attend(400);
const idL = hav[0]?.id ?? '';
await tape(`#rg-quoi-${idL}`, 'Produits de soin, facture retrouvée');
await tape(`#rg-xof-${idL}`, '30000');
dit('« Régulariser » se clique', await clique('.cjj-registre button', 'Régulariser'));
await attend(1000);
const dep = ((await lis('trone::mnd_expenses')) ?? []).filter((e) => e.label === 'Produits de soin, facture retrouvée');
const hav2 = ((await lis('trone::mnd_entrees_hors_activite')) ?? []).filter((m) => m.motif === 'À régulariser');
dit('la part devient une dépense du même tiroir, au plus tard le soir de la remise',
  dep.length === 1 && dep[0].amountXof === 30000 && dep[0].cashbox === 'Tiroir du banc' && dep[0].date <= REMISE, JSON.stringify(dep.map((e) => [e.amountXof, e.cashbox, e.date])));
dit('« À régulariser » baisse à 70 000 F et garde la part', hav2[0]?.amountXof === 70000 && hav2[0]?.remise?.regularisations?.length === 1 && (await chiffres('.cjj-registre__tete b')) === '70000',
  `${hav2[0]?.amountXof} / ${await chiffres('.cjj-registre__tete b')}`);
dit('le tiroir ne bouge pas une seconde fois : 0 F', (await chiffres('.trf-caisse__bal', carte('Tiroir du banc'))) === '0', await chiffres('.trf-caisse__bal', carte('Tiroir du banc')));
dit('une remise régularisée ne se défait plus', !(await evalue(`[...document.querySelectorAll('.cjj-registre button')].some((b) => b.textContent.includes('Défaire la remise'))`)));
await photo('3-registre');

/* Le tiroir jour par jour. */
await evalue(`(() => { const b = (${carte('Tiroir du banc')}).querySelector('.trf-caisse__open'); if (b) b.click(); return !!b; })()`);
await jusqua(`!!document.querySelector('[role="dialog"] .trf-pret-puce')`, 6000);
dit('le relevé offre « Jour par jour »', await clique('.trf-pret-puce', 'Jour par jour', MODALE));
await jusqua(`!!document.querySelector('[role="dialog"] .cjj-table')`, 6000);
const lignes = await evalue(`[...document.querySelectorAll('[role="dialog"] .cjj-table tbody tr')].map((r) => [...r.cells].map((c) => c.textContent.replace(/\\s+/g, ' ').trim()))`) ?? [];
dit('une ligne par jour du mois, jusqu à aujourd hui', lignes.length === jour.getDate(), String(lignes.length));
dit('le soir d aujourd hui dit 0 F, et l en-tête aussi', (lignes.at(-1)?.[4] ?? '').replace(/\D/g, '') === '0' && (await chiffres('.cjj-tete b', MODALE)) === '0',
  JSON.stringify(lignes.at(-1)));
if (REMISE === AUJ) dit('la remise se voit sur son jour', !!(await evalue(`!!document.querySelector('[role="dialog"] .cjj-table tr.is-remise')`)));
else dit('le mois commence à 0 F, au lendemain de la remise', (lignes[0]?.[1] ?? '').replace(/\D/g, '') === '0', JSON.stringify(lignes[0]));
await photo('4-jour-par-jour');
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
console.log(ko === 0 ? '\nLa caisse au jour le jour se fait d une main : remise, registre, jour par jour.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
