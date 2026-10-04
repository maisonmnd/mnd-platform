/* LE BANC DE LA CAISSE DU SOIR — `node scripts/banc-caisse-du-soir.mjs [dossier construit] [capture]`.

   3 octobre 2026, maquette « Le pointage du jour » validée. Le harnais
   `verifie-caisse-du-soir` éprouve les règles ; ce banc ouvre le VRAI Trône,
   hors ligne, avec une journée d'exemple (noms et montants inventés), et fait
   les gestes du soir comme une main les ferait :

     - la barre du jour ouvre le revenu pointé : 120 000 F reçus, les espèces
       « au comptage », le MoMo « à pointer » ; « Pointer » fait monter le pointé ;
     - « Clôturer la caisse » ouvre le comptage ; le tiroir attend fond +
       espèces − dépense ; un écart sans mot ne se clôture pas ;
     - « C'était une dépense » refait l'attendu et l'écart tombe ;
     - après la clôture, les espèces du jour sont « pointé · comptage ».

   Il attend le Trône construit sans serveur :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir
   `capture` (facultatif) : un préfixe, chaque étape donne <préfixe>-<étape>.png. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const construit = process.argv[2] || path.join(tmpdir(), 'banc-trone');
const capture = process.argv[3] || '';
const LARGEUR = Number(process.env.BANC_LARGEUR || 1280);
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-cds-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: LARGEUR, height: 900, deviceScaleFactor: 1, mobile: LARGEUR < 600 });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};
/* Un clic sur le bouton dont le texte commence par… (dans la modale si elle est ouverte). */
const clique = (texte) => evalue(`(() => {
  const portee = document.querySelector('[role=dialog]') || document;
  const b = [...portee.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const texteModale = () => evalue(`(document.querySelector('[role=dialog]') || document.body).innerText`);
const tuile = (nom) => evalue(`(() => { const t = [...document.querySelectorAll('[role=dialog] .cds-tuile')].find((x) => x.querySelector('small')?.textContent.trim() === ${JSON.stringify(nom)}); return t ? t.querySelector('b').textContent.replace(/\\D/g, '') : null; })()`);
const puces = () => evalue(`[...document.querySelectorAll('[role=dialog] .cds-puce')].map((x) => x.childNodes[0]?.textContent.trim())`);
/* React lit la valeur par son descripteur natif : on la pose comme une frappe. */
const tape = (selecteur, valeur, rang = 0) => evalue(`(() => {
  const el = (document.querySelector('[role=dialog]') || document).querySelectorAll(${JSON.stringify(selecteur)})[${rang}];
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);

/* LA JOURNÉE D'EXEMPLE — noms et montants inventés. */
const J = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const ligne = (label, prix) => ({ id: `l-${label}`, label, qty: 1, unitXof: prix, discountPct: 0 });
const facture = (n, nom, prix, moyen, caisse, heure) => ({
  id: `inv-banc-${n}`, branchId: 'maison', kind: 'facture', number: `F-2026-09${n}`, clientId: '', clientName: nom,
  date: J, lines: [ligne('Rituel', prix)], globalDiscountPct: 0, theme: 'Aube', status: 'payée',
  payments: [{ id: `p-${n}`, date: J, amountXof: prix, method: moyen, cashbox: caisse, time: heure, encaissePar: 'Accueil' }],
});
const SEMENCE = {
  'trone::mnd_cashboxes': [
    { id: 'cb-acc', branchId: 'maison', name: 'Accueil espèces', sub: 'Tiroir du comptoir', glyph: '◈', openingXof: 20000 },
    { id: 'cb-momo', branchId: 'maison', name: 'Téléphone MoMo', sub: 'Compte marchand', glyph: '◈', openingXof: 0 },
  ],
  'trone::mnd_invoices': [
    facture('01', 'Awa K.', 65000, 'Espèces', 'Accueil espèces', '10:42'),
    facture('02', 'Mireille A.', 38000, 'MTN MoMo', 'Téléphone MoMo', '11:20'),
    facture('03', 'Fatou M.', 17000, 'MTN MoMo', 'Téléphone MoMo', '15:48'),
  ],
  'trone::mnd_expenses': [
    { id: 'exp-banc-1', branchId: 'maison', label: 'Coursier', amountXof: 3500, date: J, cashbox: 'Accueil espèces', category: 'Logistique' },
  ],
};

await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html` });
await attend(4000);
await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); location.hash = '#/'; location.reload(); return true; })()`);
await attend(7000);

/* 1. Le revenu du jour, pointé. */
const ouvert = await evalue(`(() => { const b = document.querySelector('.trp-rev__foot--btn'); if (b) b.click(); return !!b; })()`);
await attend(1200);
let t = await texteModale();
dit('la barre ouvre le revenu du jour', ouvert && /Revenu ·/.test(t ?? ''), ouvert ? '' : 'bouton du meilleur jour introuvable');
dit('le revenu : 120 000 F recus', (await tuile('Reçu')) === '120000', await tuile('Reçu'));
dit('les especes attendent le comptage', (await puces()).includes('au comptage du soir'), JSON.stringify(await puces()));
const aPointer = await evalue(`[...document.querySelectorAll('[role=dialog] button')].filter((b) => b.textContent.trim() === 'Pointer').length`);
dit('le MoMo est a pointer (2 lignes)', aPointer === 2, aPointer);
dit('chaque ligne dit qui a encaisse', /encaissé par Accueil/.test(t ?? ''));
await photo('1-revenu');
await clique('Pointer');
await attend(500);
t = await texteModale();
dit('« Pointer » fait monter le pointe a 38 000 F', (await tuile('Pointé')) === '38000', await tuile('Pointé'));
await evalue(`document.querySelector('[role=dialog] button[aria-label="Fermer"], [role=dialog] .mnd-modal__close')?.click()`);
await evalue(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await attend(600);

/* 2. La caisse du soir. */
await evalue(`location.hash = '#/caisse'`);
await attend(3000);
await evalue(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Journal de caisse')?.click()`);
await attend(800);
const cloture = await clique('Clôturer la caisse');
await attend(1000);
t = await texteModale();
dit('« Cloturer la caisse » ouvre le comptage des tiroirs', cloture && /La caisse du soir/.test(t ?? ''), cloture ? '' : 'bouton introuvable');
/* LE JOUR SE CHOISIT (4 octobre) : la veille n'a rien vu bouger, le jour même si. */
await clique('Hier');
await attend(500);
t = await texteModale();
dit('« Hier » : le tiroir n a rien vu bouger', /Accueil espèces[\s\S]*?Rien n’a bougé hier/.test(t ?? ''));
await clique('Aujourd’hui');
await attend(500);
t = await texteModale();
dit('le tiroir des especes est a cloturer', /Accueil espèces[\s\S]*?À clôturer : il a bougé aujourd’hui/.test(t ?? ''));
await photo('2-tiroirs');
await evalue(`(() => { const l = [...document.querySelectorAll('[role=dialog] .cds-tiroir')].find((x) => x.textContent.includes('Accueil espèces')); l?.querySelector('button')?.click(); return !!l; })()`);
await attend(900);
t = await texteModale();
dit('l attendu : fond 20 000 + 65 000 − 3 500 = 81 500 F', /Attendu dans le tiroir\s*81[\s\u202f\u00a0]500/.test(t ?? ''), (t ?? '').match(/Attendu dans le tiroir\s*[^\n]*/)?.[0]);
await tape('input[inputmode=numeric]', '79500');
await attend(500);
t = await texteModale();
dit('compte 79 500 : ecart − 2 000 F', /écart\s*−\s*2[\s\u202f\u00a0]000/.test(t ?? ''), (t ?? '').match(/écart[^\n]*/)?.[0]);
const bloque = await evalue(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Clôturer le tiroir')?.disabled`);
dit('un ecart sans mot ne se cloture pas', bloque === true, bloque);
await photo('3-ecart');
await clique('C’était une dépense');
await attend(400);
await tape('.cds-depense input', 'Eau pour l’atelier', 0);
await clique('Écrire la dépense');
await attend(700);
t = await texteModale();
dit('« C etait une depense » refait l attendu : 79 500 F', /Attendu dans le tiroir\s*79[\s\u202f\u00a0]500/.test(t ?? ''), (t ?? '').match(/Attendu dans le tiroir\s*[^\n]*/)?.[0]);
dit('... et le compte est juste', /le compte est juste/.test(t ?? ''));
dit('... le surplus est propose au coffre (59 500 F)', /surplus au coffre\s*:\s*59[\s\u202f\u00a0]500/.test(t ?? ''), (t ?? '').match(/surplus au coffre[^\n]*/)?.[0]);
await photo('4-juste');
await clique('Clôturer le tiroir');
await attend(800);
t = await texteModale();
dit('la cloture est faite, juste', /Clôturé à[\s\S]*juste/.test(t ?? ''), (t ?? '').split('\n')[1]);
const garde = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_clotures_caisse') || '[]').map((c) => ({ a: c.attenduXof, c: c.compteXof, e: c.ecartXof, v: c.verseAuCoffreXof, l: c.laisseXof }))`);
dit('la cloture est gardee : attendu, compte, ecart, coffre, laisse', JSON.stringify(garde) === JSON.stringify([{ a: 79500, c: 79500, e: 0, v: 59500, l: 20000 }]), JSON.stringify(garde));
await photo('5-cloture');

/* 3. Le revenu, après la clôture. */
await evalue(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
await evalue(`location.hash = '#/'`);
await attend(2500);
await evalue(`document.querySelector('.trp-rev__foot--btn')?.click()`);
await attend(1000);
t = await texteModale();
dit('apres la cloture, les especes sont pointees par le comptage', (await puces()).includes('pointé · comptage') && !(await puces()).includes('au comptage du soir'), JSON.stringify(await puces()));
dit('... et le pointe monte a 103 000 F', (await tuile('Pointé')) === '103000', await tuile('Pointé'));
await photo('6-revenu-apres');
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nLa caisse du soir se ferme comme promis.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
