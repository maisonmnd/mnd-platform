/* LE BANC DE « LA JOURNÉE » — `node scripts/banc-la-journee.mjs [dossier construit] [capture]`.

   4 novembre 2026, maquette 9KCMgAb1… validée (« construis »). Le harnais
   `verifie-la-cloture-du-jour` éprouve la règle ; ce banc ouvre le VRAI
   Trône, hors ligne, avec une journée d'exemple (noms et montants inventés),
   et fait les gestes du comptoir comme une main les ferait :

     - Finances › La journée est dans la barre, et la page n'a pas de barre
       d'onglets : la clôture de Grenat en haut, la caisse du jour en bas ;
     - un rendez-vous fini sans état se dit « Sans état », avec « Honoré »,
       « Absente », « Annulée » ; un rendez-vous réglé et honoré est « Clos » ;
     - tant qu'il reste un rendez-vous à clore, « Clôturer la caisse » est
       éteint et la carte dit ce qui reste ;
     - « Absente » clôt le rendez-vous : la journée est close, « Clôturer la
       caisse » s'allume et ouvre le comptage habituel du tiroir ;
     - la Caisse n'a plus sa barre « Encaisser | Journal de caisse », et son
       lien mène à La journée.

   Il attend le Trône construit sans serveur (SOUS BASH) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone-gr" --emptyOutDir
   `capture` (facultatif) : un préfixe, chaque étape donne <préfixe>-<étape>.png.

   PROUVÉ DANS LES DEUX SENS : `--prouve` rejoue le banc sur une journée où le
   rendez-vous sans état ne se clôt pas (on touche « Encaisser », qui ouvre
   une fenêtre, au lieu d'« Absente ») : le banc doit alors crier. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const prouve = process.argv.includes('--prouve');
const construit = args[0] || path.join(tmpdir(), 'banc-trone-gr');
const capture = args[1] || '';
const LARGEUR = Number(process.env.BANC_LARGEUR || 1280);
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}

async function lanceLeBanc({ geste }) {
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
  const profil = mkdtempSync(path.join(tmpdir(), 'banc-lj-'));
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
  const dit = (nom, ok, detail) => { if (!ok) ko++; if (!prouve || !geste.panne) console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
  const photo = async (etape) => {
    if (!capture || geste.panne) return;
    const img = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };

  /* LA JOURNÉE D'EXEMPLE — noms et montants inventés. Deux rendez-vous du
     jour, à minuit, d'une minute : finis dès que le banc tourne. */
  /* Le jour que la page propose (`jourPropose`) : avant 6 h, la veille. */
  const proposeLe = new Date(); if (proposeLe.getHours() < 6) proposeLe.setDate(proposeLe.getDate() - 1);
  const J = new Date(proposeLe.getTime() - proposeLe.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const SEMENCE = {
    'trone::mnd_cashboxes': [{ id: 'cb-rm', branchId: 'maison', name: 'Real Money', sub: 'Tiroir des espèces', glyph: '◈', openingXof: 20000 }],
    'trone::mnd_clients': [
      { id: 'c-banc-1', branchId: 'maison', name: 'Awa Koffi Mensah', phone: '+229 01 97 00 00 01', sansPapiersWa: true, segments: [], tags: [] },
      { id: 'c-banc-2', branchId: 'maison', name: 'Victoire Agbo', phone: '+229 01 97 00 00 02', segments: [], tags: [] },
    ],
    'trone::mnd_appointments': [
      { id: 'r-banc-1', branchId: 'maison', clientId: 'c-banc-1', serviceIds: [], date: J, time: '00:00', dureeMin: 1, master: 'm', status: 'honoré',
        priceXof: 45000, invoiceId: 'inv-banc-1', payments: [{ id: 'p-banc-1', date: J, amountXof: 45000, method: 'Espèces', cashbox: 'Real Money', time: '00:01', invoiceId: 'inv-banc-1' }], pointsAwarded: true },
      { id: 'r-banc-2', branchId: 'maison', clientId: 'c-banc-2', serviceIds: [], date: J, time: '00:00', dureeMin: 1, master: 'm', status: 'confirmé', priceXof: 0 },
    ],
    'trone::mnd_invoices': [
      { id: 'inv-banc-1', branchId: 'maison', kind: 'facture', number: 'F-2026-0990', clientId: 'c-banc-1', date: J, apptId: 'r-banc-1',
        lines: [{ id: 'l-1', label: 'Rituel', qty: 1, unitXof: 45000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Aube', status: 'payée',
        payments: [{ id: 'p-banc-1', date: J, amountXof: 45000, method: 'Espèces', cashbox: 'Real Money', time: '00:01', encaissePar: 'Accueil' }] },
    ],
  };

  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html` });
  await attend(4000);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); location.hash = '#/la-journee'; location.reload(); return true; })()`);
  await attend(7000);

  /* 1. La page, sa place, ses deux moitiés. */
  const texte = () => evalue('document.body.innerText');
  let t = await texte();
  const ouverte = /La journée\./.test(t ?? '');
  dit('« La journée » s ouvre', ouverte, ouverte ? undefined : (t ?? '').slice(0, 900).replace(/\n/g, ' '));
  dit('la barre range La journee dans Finances', await evalue(`(() => { const l = [...document.querySelectorAll('a, button')].find((x) => x.textContent.trim() === 'La journée'); return !!l; })()`));
  dit('la page n a pas de barre d onglets', await evalue(`!document.querySelector('.trv-tabs') && ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Journal de caisse')`));
  dit('la cloture de Grenat est en haut, la caisse du jour en bas', await evalue(`(() => { const c = document.querySelector('[data-lj="cloture"]'); const j = document.querySelector('[data-journal="caisse-du-jour"]'); return !!c && !!j && (c.compareDocumentPosition(j) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; })()`));
  const etat = (rdv) => evalue(`document.querySelector('[data-lj-rdv="${rdv}"]')?.getAttribute('data-etat') ?? null`);
  dit('le rendez-vous regle et honore est clos', (await etat('r-banc-1')) === 'clos', await etat('r-banc-1'));
  dit('le rendez-vous fini sans etat se dit « Sans etat »', (await etat('r-banc-2')) === 'sans-etat', await etat('r-banc-2'));
  const gestes = await evalue(`[...document.querySelectorAll('[data-lj-rdv="r-banc-2"] .lj-g')].map((b) => b.textContent.trim())`);
  dit('... avec ses gestes d un toucher', JSON.stringify(gestes) === JSON.stringify(['Honoré', 'Absente', 'Annulée']), JSON.stringify(gestes));
  dit('les initiales, jamais le nom', /V\. A\./.test(t ?? '') && !/Victoire Agbo/.test(await evalue(`document.querySelector('[data-lj="cloture"]')?.innerText ?? ''`) ?? ''));
  dit('le verdict dit ce qui reste', /1 rendez-vous à clore/.test(await evalue(`document.querySelector('[data-lj="verdict"]')?.innerText ?? ''`) ?? ''), await evalue(`document.querySelector('[data-lj="verdict"]')?.innerText`));
  const cloturer = () => evalue(`(() => { const b = [...document.querySelectorAll('[data-journal="caisse-du-jour"] button')].find((x) => x.textContent.trim() === 'Clôturer la caisse'); return b ? (b.disabled ? 'eteint' : 'allume') : 'absent'; })()`);
  dit('« Cloturer la caisse » est eteint tant que la journee n est pas close', (await cloturer()) === 'eteint', await cloturer());
  dit('... et la carte dit ce qui reste', /Grenat : la caisse ne se compte pas encore/.test(await evalue(`document.querySelector('.jdc-pas-encore')?.textContent ?? ''`) ?? ''));
  dit('la caisse du jour compte les 45 000 F du jour', /45[\s\u202f\u00a0]000/.test(await evalue(`document.querySelector('[data-journal="caisse-du-jour"]')?.innerText ?? ''`) ?? ''));
  await photo('1-journee');

  /* 2. Le geste qui clôt. */
  const touche = await evalue(`(() => { const b = [...document.querySelectorAll('[data-lj-rdv="r-banc-2"] .lj-g')].find((x) => x.textContent.trim() === ${JSON.stringify(geste.bouton)}); if (b) b.click(); return !!b; })()`);
  dit(`« ${geste.bouton} » se touche`, touche);
  await attend(1200);
  await evalue(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await attend(600);
  dit('apres « Absente », le rendez-vous est clos', (await etat('r-banc-2')) === 'annule', await etat('r-banc-2'));
  const verdict = await evalue(`document.querySelector('[data-lj="verdict"]')?.innerText ?? ''`);
  dit('... la journee est close', /La journée est close : la caisse peut se compter\./.test(verdict ?? ''), verdict);
  dit('... « Cloturer la caisse » s allume', (await cloturer()) === 'allume', await cloturer());
  await evalue(`[...document.querySelectorAll('[data-journal="caisse-du-jour"] button')].find((x) => x.textContent.trim() === 'Clôturer la caisse')?.click()`);
  await attend(1000);
  const modale = await evalue(`(document.querySelector('[role=dialog]') || {}).innerText ?? ''`);
  dit('... et ouvre le comptage habituel du tiroir', /La caisse du soir|Clôturer ·/.test(modale ?? ''), (modale ?? '').split('\n')[0]);
  await photo('2-close');
  await evalue(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await attend(500);

  /* 3. La Caisse, sans sa barre. */
  await evalue(`location.hash = '#/caisse'`);
  await attend(3000);
  dit('la Caisse n a plus la barre « Encaisser | Journal de caisse »', await evalue(`!document.querySelector('.trv-tabs') && ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Journal de caisse')`));
  const lien = await evalue(`(() => { const b = [...document.querySelectorAll('.trv-lien-journee button')][0]; if (b) b.click(); return !!b; })()`);
  await attend(1500);
  dit('... son lien mene a La journee', lien && /#\/la-journee/.test(await evalue('location.hash') ?? ''), await evalue('location.hash'));
  await photo('3-caisse');
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

  ws.close(); chrome.kill(); serveur.close();
  setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
  return ko;
}

const ko = await lanceLeBanc({ geste: { bouton: 'Absente' } });
console.log(ko === 0 ? '\nLa journee se ferme comme promis, et la Caisse n a plus sa barre.' : `\n${ko} controle(s) en echec.`);
let code = ko === 0 ? 0 : 1;
if (prouve && ko === 0) {
  /* L'AUTRE SENS : sans le geste qui clôt, le banc doit crier. */
  const koPanne = await lanceLeBanc({ geste: { bouton: 'Honoré-inexistant', panne: true } });
  console.log(koPanne > 0 ? `PROUVE : sans le geste qui clot, le banc crie (${koPanne} controle(s) en echec).` : 'MUET : le banc ne voit pas une journee restee ouverte.');
  if (koPanne === 0) code = 1;
}
setTimeout(() => process.exit(code), 1800);
