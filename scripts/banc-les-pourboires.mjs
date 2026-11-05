/* LE BANC DES POURBOIRES — `node scripts/banc-les-pourboires.mjs [dossier construit] [capture]`.

   5 novembre 2026, maquette 2e4ZNFxyREv6mxG4vakuh5 validée. Le harnais
   `verifie-les-pourboires-de-l-equipe` éprouve la règle ; ce banc ouvre le
   VRAI Trône, hors ligne, avec les vrais chiffres de la table des pourboires
   (l'équipe : 31 000 F il y a trois mois, 4 000 F il y a deux mois, 2 000 F
   le mois dernier, 7 000 F aujourd'hui ; parts 1, 1, 1, ½, ½, 0, 0), datés
   autour du jour où il tourne. Les noms des clientes sont inventés.

     - Équipe › Les pourboires : le tableau (Aimer 1 750 / 500 / 1 000 / 7 750,
       11 000 F en tout ; l'équipe 4 parts, 44 000 F), la ligne « pas de part »
       de Kabirou et Olivier, les barres mois par mois, le fil et son partage ;
       un toucher sur un mois ouvre ses pourboires, sur un nom son détail ;
     - Mon mois, en tête : le bloc d'Aimer (1 750 F ce mois, aujourd'hui,
       cette semaine, 500 F le mois d'avant), « +750 F de pourboire · Akouvi,
       à l'instant », la liste par prénom, jamais le nom entier ;
     - EN DIRECT : un autre document de la Maison inscrit un pourboire ; sans
       recharger, le bloc dit « +500 F de pourboire · Kafui, à l'instant » et
       le total monte à 2 250 F ;
     - le Tableau de bord porte le même bloc sous la salutation ;
     - la Caisse et Encaissements (filtre Pourboires) mènent au tableau ;
     - au téléphone (390 px), aucune page ne déborde.

   Sans serveur, il n'y a ni compte ni rôle : la page de la direction s'ouvre,
   et « qui je suis » se dit par `mnd_essai::moi` (MesPourboires.tsx).

   Il attend le Trône construit sans serveur (SOUS BASH) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone-pb" --emptyOutDir

   PROUVÉ DANS LES DEUX SENS : `--prouve` rejoue le banc deux fois en panne,
   le pourboire en direct jamais inscrit, puis l'écran ouvert par Kabirou
   (aucune part) au lieu d'Aimer : le banc doit crier aux deux. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const prouve = process.argv.includes('--prouve');
const construit = args[0] || path.join(tmpdir(), 'banc-trone-pb');
const capture = args[1] || '';
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}

/* Les jours du banc, autour d'aujourd'hui (heure de l'appareil). */
const ici = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const maintenant = new Date();
const AUJ = ici(maintenant);
const moisAvant = (n) => { const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - n, 10); return ici(d).slice(0, 7); };
const M0 = AUJ.slice(0, 7); const M1 = moisAvant(1); const M2 = moisAvant(2); const M3 = moisAvant(3);
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const titre = (m) => { const t = `${MOIS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`; return t.charAt(0).toUpperCase() + t.slice(1); };
const F = (s) => s.replace(/(\d) (\d)/g, '$1\u202f$2');

const EQUIPE = [
  { id: 'st-aimer', branchId: 'maison', name: 'Aimer H.', role: 'Maître', partPourboire: 1, auFauteuil: true, since: '2025-01-01', email: 'aimer@exemple.bj' },
  { id: 'st-gerard', branchId: 'maison', name: 'Gérard T.', role: 'Maître', partPourboire: 1, auFauteuil: true, since: '2025-01-01' },
  { id: 'st-nassim', branchId: 'maison', name: 'Nassim M.', role: 'Maître', partPourboire: 1, auFauteuil: true, since: '2025-01-01' },
  { id: 'st-brice', branchId: 'maison', name: 'Brice A.', role: 'Maître fondateur', partPourboire: 0.5, auFauteuil: true, since: '2025-01-01' },
  { id: 'st-yeman', branchId: 'maison', name: 'Yéman B.', role: 'Maître fondateur', partPourboire: 0.5, auFauteuil: true, since: '2025-01-01' },
  { id: 'st-kabirou', branchId: 'maison', name: 'Kabirou', role: 'Agent d’entretien', partPourboire: 0, auFauteuil: false, since: '2025-01-01' },
  { id: 'st-olivier', branchId: 'maison', name: 'Olivier', role: 'Sécurité', partPourboire: 0, auFauteuil: false, since: '2025-01-01' },
];
let n = 0;
const pourboire = (date, montant, note, invoiceId, inscritLe) => [['st-aimer', 4], ['st-gerard', 4], ['st-nassim', 4], ['st-brice', 8], ['st-yeman', 8]]
  .map(([staffId, d]) => ({ id: `tp-banc-${++n}`, staffId, amountXof: montant / d, date, note, invoiceId, ...(inscritLe ? { inscritLe } : {}) }));
const PIECES = [];
const piece = (id, number, date, tipXof, clientName) => { PIECES.push({ id, branchId: 'maison', kind: 'facture', number, date, clientName, tipXof, lines: [], globalDiscountPct: 0, theme: 'Aube', status: 'payée' }); return id; };
const TIPS = [
  ...pourboire(`${M3}-14`, 2000, 'Afi Exemple', piece('inv-b1', 'F-BANC-0601', `${M3}-14`, 2000, 'Afi Exemple')),
  ...pourboire(`${M3}-20`, 10000, 'Mme Sika Exemple', piece('inv-b2', 'F-BANC-0612', `${M3}-20`, 10000, 'Mme Sika Exemple')),
  ...pourboire(`${M3}-22`, 8000, 'Edwige Exemple', piece('inv-b3', 'F-BANC-0620', `${M3}-22`, 8000, 'Edwige Exemple')),
  ...pourboire(`${M3}-25`, 5000, 'Nadège Exemple', piece('inv-b4', 'F-BANC-0633', `${M3}-25`, 5000, 'Nadège Exemple')),
  ...pourboire(`${M3}-26`, 4000, 'Carine Exemple', piece('inv-b5', 'F-BANC-0640', `${M3}-26`, 4000, 'Carine Exemple')),
  ...pourboire(`${M3}-27`, 2000, 'Lydia Exemple', piece('inv-b6', 'F-BANC-0655', `${M3}-27`, 2000, 'Lydia Exemple')),
  ...pourboire(`${M2}-12`, 2000, 'Rosine Exemple', piece('inv-b7', 'F-BANC-0688', `${M2}-12`, 2000, 'Rosine Exemple')),
  ...pourboire(`${M2}-26`, 2000, 'Inès Exemple', piece('inv-b8', 'F-BANC-0701', `${M2}-26`, 2000, 'Inès Exemple')),
  ...pourboire(`${M1}-23`, 2000, 'Nadia Exemple', piece('inv-b9', 'F-BANC-0748', `${M1}-23`, 2000, 'Nadia Exemple')),
  ...pourboire(AUJ, 4000, 'Ranti Exemple', piece('inv-b10', 'F-BANC-0773', AUJ, 4000, 'Ranti Exemple'), new Date(Date.now() - 50 * 60_000).toISOString()),
  ...pourboire(AUJ, 3000, 'Mme Akouvi Témoin', piece('inv-b11', 'F-BANC-0774', AUJ, 3000, 'Mme Akouvi Témoin'), new Date(Date.now() - 20_000).toISOString()),
];
/* Le pourboire qui arrive EN DIRECT : un Trône d'avant (sans instant), écrit par un autre document. */
const EN_DIRECT = pourboire(AUJ, 2000, 'Kafui Exemple', 'inv-b12');
for (const t of EN_DIRECT) delete t.inscritLe;

async function lanceLeBanc({ panne }) {
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
  const profil = mkdtempSync(path.join(tmpdir(), 'banc-pb-'));
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
  const cdp = (method, params = {}) => new Promise((r) => { const k = ++id; enCours.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
  const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  await cdp('Runtime.enable');
  const largeur = async (w) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 600 });
  await largeur(1280);

  let ko = 0;
  const dit = (nom, ok, detail) => { if (!ok) ko++; if (!panne) console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + String(detail).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`) : ''}`); };
  const photo = async (etape, voir) => {
    if (!capture || panne) return;
    if (voir) { await evalue(`document.querySelector(${JSON.stringify(voir)})?.scrollIntoView({ block: 'start' })`); await attend(300); }
    const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };
  const texteDe = (sel) => evalue(`document.querySelector(${JSON.stringify(sel)})?.innerText ?? ''`);

  const SEMENCE = {
    'trone::mnd_staff': EQUIPE,
    'trone::mnd_tips_v2': TIPS,
    'trone::mnd_invoices': PIECES,
    'mnd_essai::moi': panne === 'kabirou' ? 'st-kabirou' : 'st-aimer',
  };
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html` });
  await attend(4000);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); location.hash = '#/pourboires'; location.reload(); return true; })()`);
  await attend(7000);

  /* ── 1. ÉQUIPE › LES POURBOIRES ── */
  let t = await evalue('document.body.innerText');
  dit('« Les pourboires » s ouvre', /Les pourboires\./.test(t ?? '') && !!(await evalue(`!!document.querySelector('[data-pourboires="equipe"]')`)), (t ?? '').slice(0, 300).replace(/\n/g, ' '));
  const cellules = (membre) => evalue(`(() => { const b = document.querySelector('[data-membre="${membre}"]'); const tr = b?.closest('tr'); return tr ? [...tr.querySelectorAll('td')].map((td) => td.innerText.trim()) : null; })()`);
  const enTete = await evalue(`[...document.querySelectorAll('[data-pourboires="tableau"] thead th')].map((th) => th.innerText.trim())`);
  dit('les colonnes : Membre, Part, Aujourd hui, les quatre mois, Depuis', JSON.stringify(enTete) === JSON.stringify(['MEMBRE', 'PART', 'AUJOURD’HUI', titre(M0).toUpperCase(), titre(M1).toUpperCase(), titre(M2).toUpperCase(), titre(M3).toUpperCase(), `DEPUIS ${MOIS[Number(M3.slice(5, 7)) - 1].toUpperCase()} ${M3.slice(0, 4)}`])
    || JSON.stringify(enTete) === JSON.stringify(['Membre', 'Part', 'Aujourd’hui', titre(M0), titre(M1), titre(M2), titre(M3), `Depuis ${MOIS[Number(M3.slice(5, 7)) - 1]} ${M3.slice(0, 4)}`]), JSON.stringify(enTete));
  const aimer = await cellules('st-aimer');
  dit('Aimer : 1, 1 750 F aujourd hui, 1 750 / 500 / 1 000 / 7 750, 11 000 F', JSON.stringify(aimer) === JSON.stringify(['Aimer H.', '1', F('1 750 F'), F('1 750 F'), '500 F', F('1 000 F'), F('7 750 F'), F('11 000 F')]), JSON.stringify(aimer));
  const brice = await cellules('st-brice');
  dit('Brice : ½, 875 / 875 / 250 / 500 / 3 875, 5 500 F', JSON.stringify(brice) === JSON.stringify(['Brice A.', '\u00bd', '875 F', '875 F', '250 F', '500 F', F('3 875 F'), F('5 500 F')]), JSON.stringify(brice));
  const total = await evalue(`[...(document.querySelector('[data-pourboires="total"]')?.querySelectorAll('td') ?? [])].map((td) => td.innerText.trim())`);
  dit('l equipe : 4 parts, 7 000 F, 7 000 / 2 000 / 4 000 / 31 000, 44 000 F', JSON.stringify(total) === JSON.stringify(['L’équipe', '4', F('7 000 F'), F('7 000 F'), F('2 000 F'), F('4 000 F'), F('31 000 F'), F('44 000 F')]), JSON.stringify(total));
  dit('Kabirou et Olivier : une ligne « pas de part », vers les Ressources humaines', /Kabirou, Olivier[\s\S]*Pas de part : à régler dans[\s\S]*Ressources humaines/.test(await texteDe('[data-pourboires="sans-part"]') ?? ''), await texteDe('[data-pourboires="sans-part"]'));
  const barres = await evalue(`[...document.querySelectorAll('[data-pourboires="barres"] [data-mois]')].map((g) => [g.getAttribute('data-mois'), g.querySelector('.tpp-barres__val')?.textContent, g.classList.contains('is-en-cours'), !!g.querySelector('path')])`);
  dit('les barres : quatre mois, 31 000 / 4 000 / 2 000 / 7 000 F, le mois en cours dit « en cours »',
    JSON.stringify(barres) === JSON.stringify([[M3, F('31 000 F'), false, true], [M2, F('4 000 F'), false, true], [M1, F('2 000 F'), false, true], [M0, F('7 000 F'), true, true]]), JSON.stringify(barres));
  dit('... chaque barre se lit sans la couleur (son nom accessible dit le mois et le montant)', /: 31\s000 F, 6 pourboires/.test(await evalue(`document.querySelector('[data-pourboires="barres"] [data-mois="${M3}"]')?.getAttribute('aria-label') ?? ''`) ?? ''),
    await evalue(`document.querySelector('[data-pourboires="barres"] [data-mois="${M3}"]')?.getAttribute('aria-label')`));
  const fil = await texteDe('[data-pourboires="fil"]');
  dit('le fil : la cliente en entier pour la direction, la pièce, le partage', /Ranti Exemple · F-BANC-0773/.test(fil) && fil.includes(F('Aimer, Gérard, Nassim 1 000 F chacun · Brice, Yéman 500 F chacun')), fil.split('\n').slice(0, 4).join(' | '));
  const cadre = await evalue(`(() => { const tr = document.querySelector('[data-membre="st-aimer"]')?.closest('tr'); const d = tr?.lastElementChild?.getBoundingClientRect(); const c = document.querySelector('.tpp-tableau')?.getBoundingClientRect(); return d && c ? [Math.round(d.left), Math.round(d.right), Math.round(c.right), getComputedStyle(tr.lastElementChild).color] : null; })()`);
  dit('a 1280 px, la colonne « Depuis » tient dans le cadre du tableau', !!cadre && cadre[1] <= cadre[2] + 1 && cadre[0] < cadre[2], JSON.stringify(cadre));
  const enTeteLisible = await evalue(`(() => { const th = document.querySelectorAll('[data-pourboires="tableau"] thead th')[2]; const s = getComputedStyle(th); return [s.color, s.backgroundColor]; })()`);
  dit('les en-tetes chiffres se lisent sur l indigo (pas indigo sur indigo)', !!enTeteLisible && enTeteLisible[0] !== enTeteLisible[1], JSON.stringify(enTeteLisible));
  await photo('1-equipe', '[data-pourboires="equipe"]');
  await photo('1b-barres', '[data-pourboires="barres"]');

  /* Un toucher sur un mois : ses pourboires. */
  await evalue(`document.querySelector('[data-pourboires="barres"] [data-mois="${M2}"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  await attend(500);
  const lignesM2 = await evalue(`[...document.querySelectorAll('[data-pourboires="fil"] .tpp-fil__ligne')].map((l) => l.getAttribute('data-piece'))`);
  dit(`un toucher sur ${titre(M2)} : ses deux pourboires`, JSON.stringify(lignesM2) === JSON.stringify(['F-BANC-0701', 'F-BANC-0688']) && new RegExp(`Les pourboires de ${MOIS[Number(M2.slice(5, 7)) - 1]} ${M2.slice(0, 4)}`).test(await evalue('document.body.innerText') ?? ''), JSON.stringify(lignesM2));
  await evalue(`document.querySelector('[data-mois="${M3}"].tpp-mois')?.click()`);
  await attend(400);
  dit(`... un toucher sur l en-tete ${titre(M3)} : ses six pourboires`, (await evalue(`document.querySelectorAll('[data-pourboires="fil"] .tpp-fil__ligne').length`)) === 6);
  /* Un toucher sur un nom : son détail. */
  await evalue(`document.querySelector('[data-membre="st-nassim"]')?.click()`);
  await attend(400);
  const detail = await texteDe('[data-pourboires="detail"]');
  dit('un toucher sur Nassim : son detail, 11 000 F depuis le debut, sa part', /Nassim M\./.test(detail) && detail.includes(F('11 000 F')) && /Sa part : une part\./.test(detail), detail.split('\n').slice(0, 6).join(' | '));
  await photo('2-detail', '[data-pourboires="detail"]');

  /* ── 2. MON MOIS, EN TÊTE ── */
  await evalue(`location.hash = '#/mon-mois'`);
  await attend(2500);
  const bloc = await texteDe('[data-pourboires="moi"]');
  const enTeteDuMois = await evalue(`(() => { const b = document.querySelector('[data-pourboires="moi"]'); const p = document.getElementById('mm-pointage'); return !!b && !!p && (b.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; })()`);
  dit('Mon mois : le bloc d Aimer, en tete (avant le pointage)', !!bloc && enTeteDuMois, bloc.split('\n').slice(0, 3).join(' | '));
  const chiffres = await evalue(`['mois', 'aujourdhui', 'semaine', 'mois-precedent'].map((k) => document.querySelector('[data-pourboires="moi"] [data-pourboires="' + k + '"]')?.innerText.split('\\n')[0].trim())`);
  dit('... 1 750 F ce mois, 1 750 F aujourd hui et cette semaine, 500 F le mois d avant', JSON.stringify(chiffres) === JSON.stringify([F('1 750 F'), F('1 750 F'), F('1 750 F'), '500 F']), JSON.stringify(chiffres));
  dit('... « +750 F de pourboire · Akouvi, a l instant »', (await texteDe('[data-pourboires="arrive"]')) === '+750 F de pourboire · Akouvi, à l’instant', await texteDe('[data-pourboires="arrive"]'));
  const liste = await texteDe('[data-pourboires="liste"]');
  dit('... la liste par prenom (Akouvi, Ranti), jamais le nom entier', /Akouvi/.test(liste) && /Ranti/.test(liste) && !/Exemple|Témoin/.test(await evalue('document.body.innerText') ?? ''), liste.replace(/\n/g, ' | '));
  dit('... et l ancienne liste au nom entier n est plus en bas de la page', !/De la part de/.test(await evalue('document.body.innerText') ?? ''));
  await photo('3-mon-mois', '[data-pourboires="moi"]');

  /* ── 3. EN DIRECT : un autre document inscrit un pourboire ── */
  await evalue('window.__pasRecharge = 1');
  if (panne !== 'muet') {
    await evalue(`(() => { const f = document.createElement('iframe'); f.style.display = 'none'; document.body.appendChild(f); const k = 'trone::mnd_tips_v2'; const v = JSON.parse(f.contentWindow.localStorage.getItem(k) || '[]'); f.contentWindow.localStorage.setItem(k, JSON.stringify([...v, ...${JSON.stringify(EN_DIRECT)}])); return true; })()`);
  }
  await attend(1500);
  dit('en direct, sans recharger : « +500 F de pourboire · Kafui, a l instant »', (await texteDe('[data-pourboires="arrive"]')) === '+500 F de pourboire · Kafui, à l’instant' && (await evalue('window.__pasRecharge')) === 1, await texteDe('[data-pourboires="arrive"]'));
  dit('... le total du mois monte a 2 250 F', (await texteDe('[data-pourboires="moi"] [data-pourboires="mois"]')) === F('2 250 F'), await texteDe('[data-pourboires="moi"] [data-pourboires="mois"]'));
  await photo('4-en-direct', '[data-pourboires="moi"]');

  /* ── 4. LE TABLEAU DE BORD ── */
  await evalue(`location.hash = '#/'`);
  await attend(2500);
  const sousLaSalutation = await evalue(`(() => { const h = [...document.querySelectorAll('h2')].find((x) => /^(Bonjour|Bonsoir)/.test(x.textContent.trim())); const b = document.querySelector('[data-pourboires="moi"]'); return !!h && !!b && h.nextElementSibling === b; })()`);
  dit('le Tableau de bord porte le bloc sous la salutation', sousLaSalutation);
  await photo('4b-tableau-de-bord');

  /* ── 5. LES LIENS ── */
  await evalue(`location.hash = '#/caisse'`);
  await attend(3000);
  const ordre = await evalue(`[...document.querySelectorAll('.trv-lien-journee button')].map((b) => b.getAttribute('data-lien') ?? 'journee')`);
  dit('la Caisse : le lien de La journee d abord, puis celui des pourboires', JSON.stringify(ordre) === JSON.stringify(['journee', 'pourboires']), JSON.stringify(ordre));
  await evalue(`document.querySelector('.trv-lien-journee [data-lien="pourboires"]')?.click()`);
  await attend(1200);
  dit('... il mene a Equipe › Les pourboires', /#\/pourboires/.test(await evalue('location.hash') ?? ''), await evalue('location.hash'));
  await evalue(`location.hash = '#/encaissements'`);
  await attend(3000);
  await evalue(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Pourboires')?.click()`);
  await attend(800);
  await evalue(`document.querySelector('[data-lien="pourboires"]')?.click()`);
  await attend(1200);
  dit('Encaissements, filtre Pourboires : « Le tableau de l equipe » y mene', /#\/pourboires/.test(await evalue('location.hash') ?? ''), await evalue('location.hash'));

  /* ── 6. AU TÉLÉPHONE ── */
  await largeur(390);
  for (const [ecran, nom] of [['#/mon-mois', 'Mon mois'], ['#/pourboires', 'Les pourboires']]) {
    await evalue(`location.hash = '${ecran}'`);
    await attend(2000);
    const deborde = await evalue('document.documentElement.scrollWidth - window.innerWidth');
    dit(`au telephone, ${nom} ne deborde pas`, deborde <= 1, `${deborde} px`);
    await photo(`5-telephone-${nom.replace(/\s+/g, '-').toLowerCase()}`, ecran === '#/mon-mois' ? '[data-pourboires="moi"]' : '[data-pourboires="barres"]');
  }
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

  ws.close(); chrome.kill(); serveur.close();
  setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
  return ko;
}

const ko = await lanceLeBanc({ panne: null });
console.log(ko === 0 ? '\nLes pourboires se lisent au fur et a mesure, pour la direction et pour chacun.' : `\n${ko} controle(s) en echec.`);
let code = ko === 0 ? 0 : 1;
if (prouve && ko === 0) {
  for (const [panne, quoi] of [['muet', 'le pourboire en direct jamais inscrit'], ['kabirou', 'l ecran ouvert par Kabirou (aucune part)']]) {
    const koPanne = await lanceLeBanc({ panne });
    console.log(koPanne > 0 ? `PROUVE : ${quoi}, le banc crie (${koPanne} controle(s) en echec).` : `MUET : ${quoi}, le banc ne voit rien.`);
    if (koPanne === 0) code = 1;
  }
}
setTimeout(() => process.exit(code), 1800);
