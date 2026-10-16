/* LE BANC DE L'ATELIER DU PDF — `node scripts/banc-signer-un-pdf.mjs [capture]`.

   15 octobre 2026, « Signer un PDF ». Le banc verifie-signer-un-pdf éprouve
   les règles et l'écriture de la copie ; celui-ci ouvre l'atelier dans un
   VRAI Chrome, à la largeur d'un téléphone (390 px), sur le Trône construit
   comme pour la mise en ligne :

     1. « Signer un PDF » au Secrétariat, un PDF de trois pages choisi sur
        l'ordinateur : pdf.js affiche les trois pages (son travailleur se
        charge depuis la construction) ;
     2. rien ne déborde à 390 px ;
     3. on pose un texte d'un toucher, on le glisse au doigt, on pose la date
        du jour et on la répète sur toutes les pages ;
     4. on tourne la page 3 et l'on retire la page 2 ;
     5. « Télécharger la copie » : la copie a deux pages, la dernière tournée,
        le texte et les deux dates y sont.

   16 octobre 2026 : on tire le rond cuivre d'une pièce pour l'agrandir ; on
   pose « Une image » (une capture), on l'agrandit, et la copie la porte à
   cette taille. Puis un DOCUMENT du Secrétariat : on agrandit son tampon
   dans l'aperçu, et son PDF le sort à la même taille.

   Le Supabase est injoignable : rien ne part, rien n'est gardé. Le document
   est un exemple. */
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-spdf-'));
const recus = mkdtempSync(path.join(tmpdir(), 'banc-spdf-recus-'));
const profil = mkdtempSync(path.join(tmpdir(), 'banc-spdf-chrome-'));
console.log('Construction du Trône (serveur injoignable)…');
execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
});
renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));

/* Le document d'essai : trois pages A4, du texte imprimé sur chacune. */
const essai = path.join(recus, 'Contrat d essai.pdf');
{
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i += 1) {
    const p = d.addPage([595, 842]);
    p.drawText(`CONTRAT D ESSAI, PAGE ${i}`, { x: 60, y: 760, size: 18, font: f });
    for (let l = 0; l < 30; l += 1) p.drawText('Article ' + (l + 1) + ' : texte imprime du contrat, a ne pas effacer.', { x: 60, y: 720 - l * 20, size: 10, font: f });
  }
  writeFileSync(essai, await d.save());
}

/* Une capture d'essai : un PNG de 120 x 80, encre bleu nuit. */
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const morceau = (t, d) => { const tt = Buffer.from(t, 'ascii'); const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([tt, d]))); return Buffer.concat([l, tt, d, c]); };
const capture_ = path.join(recus, 'plan de situation.png');
{
  const L = 120, H = 80; const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(L, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const brut = Buffer.alloc((L * 3 + 1) * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < L; x += 1) brut.set((x + y) % 9 ? [235, 228, 210] : [30, 33, 80], y * (L * 3 + 1) + 1 + x * 3);
  writeFileSync(capture_, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), morceau('IHDR', ihdr), morceau('IDAT', deflateSync(brut)), morceau('IEND', Buffer.alloc(0))]));
}
/* Où une image est peinte sur une page relue par pdf.js (repère de l'écran). */
const fois = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const point = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
async function imagesPeintes(pdfjs, page) {
  const vue = page.getViewport({ scale: 1 });
  const ops = await page.getOperatorList();
  const pile = []; let ctm = [1, 0, 0, 1, 0, 0]; const out = [];
  for (let k = 0; k < ops.fnArray.length; k += 1) {
    const f = ops.fnArray[k], a = ops.argsArray[k];
    if (f === pdfjs.OPS.save) pile.push(ctm); else if (f === pdfjs.OPS.restore) ctm = pile.pop() ?? [1, 0, 0, 1, 0, 0];
    else if (f === pdfjs.OPS.transform) ctm = fois(ctm, a);
    else if (f === pdfjs.OPS.paintImageXObject) { const e = fois(vue.transform, ctm); const hg = point(e, 0, 1), bd = point(e, 1, 0); out.push({ x: hg.x, y: hg.y, l: bd.x - hg.x, h: bd.y - hg.y, W: vue.width }); }
  }
  return out;
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
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
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
let ws;
try {
  let cible;
  for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
  if (!cible) throw new Error('Chrome ne repond pas.');
  ws = new WebSocket(cible.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const enCours = new Map(); const erreurs = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails.text);
    /* Une erreur rattrapée par l'écran (« Cet écran ne s'est pas ouvert ») ne lève rien : React la dit en console. */
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const t = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').split('\n').slice(0, 3).join(' / ');
      if (/Error|rror:|Uncaught|ecran|écran/i.test(t) && !/Failed to load resource|ERR_CONNECTION|fetch|127\.0\.0\.1:9/i.test(t)) erreurs.push(t.slice(0, 300));
    }
  });
  const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const photo = async (etape) => {
    if (!capture) return;
    const img = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };
  const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
  const touche = async (x, y) => {
    for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  };
  const bouton = (texte) => evalue(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(texte)})); if (!b) return false; b.click(); return true; })()`);
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: recus });
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  /* La session laissée par supabase-js et la tête gardée (comme le banc hors ligne). */
  const UID = 'u-banc-direction';
  const CLE = 'sb-127-auth-token';
  const le = new Date(Date.now() - 86_400_000).toISOString();
  const semence = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Direction', role: 'souverain', rubrics: [] } },
  };
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue('location.reload()');
  await jusqua(`!!document.querySelector('.tr-top__sync, .tr-side, nav')`, 20000);
  await evalue(`location.hash = '#/secretariat'; true`);
  const ouvert = await jusqua(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Signer un PDF')`, 20000);
  dit('le Secretariat montre « Signer un PDF »', !!ouvert);
  if (!ouvert) { await photo('0-secretariat'); throw new Error('pas de bouton'); }

  /* 1. Le PDF de l'ordinateur. */
  const { root } = (await cdp('DOM.getDocument', { depth: -1, pierce: true })).result;
  const champ = (await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file][accept*="pdf"]' })).result?.nodeId;
  dit('un champ de fichier n accepte que les PDF', !!champ);
  await cdp('DOM.setFileInputFiles', { nodeId: champ, files: [essai] });
  const pages = await jusqua(`document.querySelectorAll('.spdf-feuille canvas').length === 3 && [...document.querySelectorAll('.spdf-feuille canvas')].every((c) => c.width > 0) ? 3 : 0`, 20000);
  dit('1. pdf.js affiche les trois pages', pages === 3, pages);
  await attend(1500);
  const encre = await evalue(`(() => {
    const c = document.querySelector('.spdf-feuille canvas'); const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, Math.floor(c.height / 3)).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] < 120) n++;
    return n;
  })()`);
  dit('... la page est vraiment dessinee (le texte imprime se voit)', encre > 200, `${encre} points d encre`);
  await photo('1-ouvert');

  /* 2. Rien ne déborde. */
  const deborde = await evalue(`(() => {
    const largeur = document.documentElement.clientWidth;
    const trop = [...document.querySelectorAll('.spdf *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > largeur + 1 || r.left < -1); }).map((e) => e.className || e.tagName).slice(0, 4);
    return { page: document.documentElement.scrollWidth - largeur, trop };
  })()`);
  dit('2. rien ne deborde a 390 px', deborde && deborde.page <= 0 && deborde.trop.length === 0, JSON.stringify(deborde));

  /* 3. Un texte d'un toucher, glissé au doigt ; la date sur toutes les pages. */
  const ou = async (sel, fx, fy, n = 0) => evalue(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${n}]; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width * ${fx}, y: r.top + r.height * ${fy}, l: r.width, h: r.height }; })()`);
  await bouton('Un texte');
  let p = await ou('.spdf-feuille', 0.3, 0.25);
  await touche(p.x, p.y);
  const texte = await jusqua(`(() => { const e = [...document.querySelectorAll('.spdf-pose--texte')].find((x) => x.textContent === 'Votre texte'); return e ? { l: parseFloat(e.style.left), t: parseFloat(e.style.top) } : null; })()`, 4000);
  dit('3. un toucher pose le texte la ou l on touche', !!texte && Math.abs(texte.l - 30) < 1.5 && Math.abs(texte.t - 25) < 1.5, JSON.stringify(texte));
  dit('... l outil se relache apres la pose (un second toucher ne pose rien)', await evalue(`!document.querySelector('.spdf-outil.est-actif')`));
  await touche(p.x + 40, p.y + 120);
  dit('... et en effet : toujours une seule piece', (await evalue(`document.querySelectorAll('.spdf-pose').length`)) === 1);
  const q = await ou('.spdf-pose--texte', 0.5, 0.5);
  await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: q.x, y: q.y, button: 'left', clickCount: 1 });
  for (let k = 1; k <= 5; k += 1) await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x + k * 10, y: q.y + k * 12, button: 'left', buttons: 1 });
  await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: q.x + 50, y: q.y + 60, button: 'left', clickCount: 1 });
  const glisse = await evalue(`(() => { const e = document.querySelector('.spdf-pose--texte'); return { l: parseFloat(e.style.left), t: parseFloat(e.style.top) }; })()`);
  dit('... on le glisse au doigt', glisse.l > texte.l + 5 && glisse.t > texte.t + 3, JSON.stringify(glisse));
  await bouton('La date du jour');
  p = await ou('.spdf-feuille', 0.6, 0.85);
  await touche(p.x, p.y);
  await jusqua(`document.querySelectorAll('.spdf-pose').length === 2`, 4000);
  await bouton('Sur toutes les pages');
  const nb = await jusqua(`document.querySelectorAll('.spdf-pose').length === 4 ? 4 : 0`, 4000);
  dit('... la date du jour repetee sur les trois pages (1 texte + 3 dates)', nb === 4, await evalue(`document.querySelectorAll('.spdf-pose').length`));
  await photo('3-pose');

  /* 3 bis. Le rond cuivre : la date choisie grandit quand on tire son coin. */
  const tireLeCoin = async (sel, dx, dy) => {
    const c = await evalue(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (!c) return false;
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    let pendant = null;
    for (let k = 1; k <= 6; k += 1) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x + (dx * k) / 6, y: c.y + (dy * k) / 6, button: 'left', buttons: 1 });
      if (k === 6) pendant = await evalue(`document.querySelector('.spdf-taille, .sec-taille')?.textContent ?? null`);
    }
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x + dx, y: c.y + dy, button: 'left', clickCount: 1 });
    return pendant ?? true;
  };
  const tailleAvant = await evalue(`parseFloat(document.querySelector('.spdf-pose.est-choisie').style.fontSize)`);
  const ditEnTirant = await tireLeCoin('.spdf-pose.est-choisie .spdf-poignee', 40, 12);
  const tailleApres = await evalue(`parseFloat(document.querySelector('.spdf-pose.est-choisie').style.fontSize)`);
  dit('3 bis. le rond cuivre de la piece choisie l agrandit quand on le tire', tailleApres > tailleAvant * 1.2, `${tailleAvant.toFixed(1)} px -> ${tailleApres.toFixed(1)} px`);
  dit('... et dit sa taille en tirant (en points)', typeof ditEnTirant === 'string' && / pt$/.test(ditEnTirant), ditEnTirant);

  /* 3 ter. Une image (une capture du plan de situation), posée puis agrandie. */
  const { root: racineImg } = (await cdp('DOM.getDocument', { depth: -1, pierce: true })).result;
  const champImg = (await cdp('DOM.querySelector', { nodeId: racineImg.nodeId, selector: 'input[type=file][accept*="image/png"]' })).result?.nodeId;
  dit('3 ter. « Une image » a son champ (photo, capture ou PDF)', !!champImg);
  await cdp('DOM.setFileInputFiles', { nodeId: champImg, files: [capture_] });
  const pret = await jusqua(`!!document.querySelector('.spdf-outil.est-actif') && document.querySelector('.spdf-outil.est-actif').textContent.startsWith('Une image')`, 8000);
  dit('... l image choisie, l outil attend qu on touche la page', !!pret);
  p = await ou('.spdf-feuille', 0.15, 0.55);
  await touche(p.x, p.y);
  const image = await jusqua(`(() => { const e = document.querySelector('.spdf-pose--image img'); return e && e.complete && e.naturalWidth ? parseFloat(e.parentElement.style.width) : null; })()`, 6000);
  dit('... un toucher la pose, a 40 % de la largeur de la page', image !== null && Math.abs(image - 40) < 0.5, image);
  const ditImage = await tireLeCoin('.spdf-pose--image .spdf-poignee', 60, 40);
  const largeurImage = await evalue(`parseFloat(document.querySelector('.spdf-pose--image').style.width)`);
  dit('... on tire son coin : elle grandit', largeurImage > 45, `${largeurImage.toFixed(1)} %`);
  dit('... et dit son pourcentage en tirant', typeof ditImage === 'string' && / %$/.test(ditImage), ditImage);
  await photo('3-image');

  /* 4. Tourner la page 3, retirer la page 2. */
  await evalue(`(() => { const pieds = document.querySelectorAll('.spdf-page-pied'); [...pieds[2].querySelectorAll('button')].find((b) => b.textContent === 'Tourner').click(); [...pieds[1].querySelectorAll('button')].find((b) => b.textContent === 'Retirer cette page').click(); return true; })()`);
  const bas = await jusqua(`(() => { const t = document.querySelector('.spdf-bas')?.textContent ?? ''; return /1 page tournée/.test(t) && /1 page retirée sur 3/.test(t) ? t : null; })()`, 6000);
  dit('4. le pied dit ce que la copie portera', !!bas, bas ?? await evalue(`document.querySelector('.spdf-bas')?.textContent`));
  const retiree = await jusqua(`document.querySelectorAll('.spdf-feuille[data-retiree]').length === 1`, 4000);
  dit('... la page retiree se voit comme telle', !!retiree);

  /* 5. La copie téléchargée. */
  await bouton('Télécharger la copie');
  let fichier = null;
  for (let t = 0; t < 40 && !fichier; t += 1) { await attend(250); fichier = readdirSync(recus).find((f) => /signé le .*\.pdf$/.test(f) && !f.endsWith('.crdownload')); }
  dit('5. la copie se telecharge, nommee « … · signe le <date avec l annee>.pdf »', !!fichier && /· signé le \d{1,2}(er)? \S+ \d{4}\.pdf$/.test(fichier), fichier);
  if (fichier) {
    const octets = readFileSync(path.join(recus, fichier));
    const relu = await PDFDocument.load(octets, { updateMetadata: false });
    dit('... deux pages (la 2 retiree), la derniere tournee d un quart', JSON.stringify([2, 0, 90]), JSON.stringify([relu.getPageCount(), ...relu.getPages().map((x) => x.getRotation().angle)]));
    const pdfjs = await import(pathToFileURL(path.join(racine, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(racine, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(octets), verbosity: 0 }).promise;
    const textes = [];
    for (let i = 1; i <= doc.numPages; i += 1) textes.push((await (await doc.getPage(i)).getTextContent()).items.map((it) => it.str).join(' | '));
    await doc.destroy();
    const annee = String(new Date().getFullYear());
    dit('... le texte pose est sur la page 1, l imprime aussi', /Votre texte/.test(textes[0]) && /CONTRAT D ESSAI, PAGE 1/.test(textes[0]), textes[0].slice(0, 90));
    dit('... la date du jour, avec l annee, sur les deux pages gardees', textes.every((t) => t.includes(annee)) && /PAGE 3/.test(textes[1]), textes.map((t) => t.slice(-30)).join(' // '));
    const doc2 = await pdfjs.getDocument({ data: new Uint8Array(octets), verbosity: 0 }).promise;
    const peintes = await imagesPeintes(pdfjs, await doc2.getPage(1));
    await doc2.destroy();
    const im0 = peintes[0];
    dit('... l image est sur la page 1, a la largeur tiree a l ecran', peintes.length === 1 && Math.abs(im0.l / im0.W * 100 - largeurImage) < 0.6 && Math.abs(im0.x / im0.W - 0.15) < 0.01,
      im0 ? `${(im0.l / im0.W * 100).toFixed(1)} % (ecran ${largeurImage.toFixed(1)} %)` : 'aucune');
  }

  /* 6. UN DOCUMENT DU SECRÉTARIAT : son tampon s'agrandit dans l'aperçu, et
     le PDF le sort à la même taille (34 mm à 100 %). */
  await evalue(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true`);
  await attend(600);
  if (await evalue(`!!document.querySelector('.spdf')`)) await bouton('Fermer');
  await evalue(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Les documents'); if (b) b.click(); return !!b; })()`);
  const nouveau = await jusqua(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '+ Nouveau document'); if (b) b.click(); return !!b; })()`, 8000);
  const modele = nouveau && await jusqua(`(() => { const b = document.querySelector('.sec-modele'); if (b) b.click(); return !!b; })()`, 8000);
  /* Un document neuf n'a pas de tampon : on choisit le sceau dentelé, comme elle le ferait. */
  const choisi = modele && await jusqua(`(() => {
    const s = [...document.querySelectorAll('select')].find((x) => [...x.options].some((o) => o.value === 'mnd-6-dentele'));
    if (!s) return false;
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'mnd-6-dentele');
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`, 15000);
  dit('6. un document neuf : on lui choisit le sceau dentele', !!choisi, modele ? undefined : 'pas de modele');
  const tamponDoc = choisi && await jusqua(`(() => { const e = document.querySelector('.sec-zone--active [aria-label="Le tampon"]'); return e && e.querySelector('.sec-poignee') ? e.getBoundingClientRect().width : null; })()`, 15000);
  dit('... son tampon porte le rond cuivre dans la zone', !!tamponDoc, tamponDoc ? `${tamponDoc.toFixed(0)} px` : (nouveau ? (modele ? 'pas de tampon pose' : 'pas de modele') : 'pas de bouton'));
  if (tamponDoc) {
    await photo('6-document');
    const ditDoc = await tireLeCoin('.sec-zone--active [aria-label="Le tampon"] .sec-poignee', -25, -25);
    const apres = await evalue(`(() => { const e = document.querySelector('.sec-zone--active [aria-label="Le tampon"]'); const z = document.querySelector('.sec-zone--active').getBoundingClientRect(); const r = e.getBoundingClientRect(); return { l: r.width, dedans: r.left >= z.left - 1 && r.right <= z.right + 1 && r.top >= z.top - 1 && r.bottom <= z.bottom + 1, pc: Number(e.querySelector('.sec-poignee').getAttribute('aria-valuenow')) }; })()`);
    dit('... on le tire vers l interieur : il rapetisse et reste dans la zone', apres.l < tamponDoc * 0.9 && apres.dedans, `${tamponDoc.toFixed(0)} -> ${apres.l.toFixed(0)} px, ${apres.pc} %`);
    dit('... et dit son pourcentage en tirant', typeof ditDoc === 'string' && / %$/.test(ditDoc), ditDoc);
    const avantDoc = new Set(readdirSync(recus));
    await bouton('Télécharger le PDF');
    let pdfDoc = null;
    for (let t = 0; t < 60 && !pdfDoc; t += 1) { await attend(250); pdfDoc = readdirSync(recus).find((f) => !avantDoc.has(f) && /\.pdf$/.test(f)); }
    dit('... le PDF du document se telecharge', !!pdfDoc, pdfDoc);
    if (pdfDoc) {
      const pdfjs = await import(pathToFileURL(path.join(racine, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(racine, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
      const d = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path.join(recus, pdfDoc))), verbosity: 0 }).promise;
      const toutes = [];
      for (let i = 1; i <= d.numPages; i += 1) toutes.push(...await imagesPeintes(pdfjs, await d.getPage(i)));
      await d.destroy();
      /* Le tampon : l'image la plus proche d'un carré de 34 mm x pourcentage (en points). */
      const attendu = (34 * apres.pc) / 100 * (72 / 25.4);
      const proche = toutes.filter((x) => Math.abs(x.l - x.h) < 2).sort((a, b) => Math.abs(a.l - attendu) - Math.abs(b.l - attendu))[0];
      dit('... le PDF sort le tampon a la taille de l apercu (34 mm x pourcentage)', !!proche && Math.abs(proche.l - attendu) < 1.5, proche ? `${proche.l.toFixed(1)} pt, attendu ${attendu.toFixed(1)} pt` : `aucune image carree (${toutes.length} images)`);
    }
  }
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
} catch (e) {
  dit('le banc va au bout', false, String(e?.message ?? e));
} finally {
  try { ws?.close(); } catch { /* deja ferme */ }
  chrome.kill();
  serveur.close();
  setTimeout(() => { for (const d of [profil, construit, recus]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libere apres */ } } }, 1500);
}
console.log(ko ? `\n${ko} ECHEC(S)` : '\nL atelier du PDF tient dans un vrai navigateur.');
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
