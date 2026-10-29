/* LE BANC DES PARAMÈTRES — `node scripts/banc-des-parametres.mjs [dossier construit] [dossier des captures]`.

   Le vrai Trône, construit hors ligne, dans un vrai navigateur (29 octobre
   2026, maquette 5aXKK3Eu… « Paramètres ») :
     · huit tuiles qui disent leur état, cinq gestes rapides, rien « à venir » ;
     · une tuile ouvre son panneau (l'adresse le dit), la recherche filtre et
       Entrée ouvre la seule tuile trouvée, « wifi » dit où aller ;
     · « Fermer la Maison un jour » écrit une journée exceptionnelle fermée ;
     · une notification s'éteint vraiment ;
     · ce qui efface ne paraît qu'au mot EFFACER ;
     · à 390 px, rien ne déborde ; aucune erreur dans la page.

   Construire d'abord, sous Bash :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const racine = path.resolve(import.meta.dirname, '..');
const construit = process.argv[2] || path.join(tmpdir(), 'banc-trone');
const captures = process.argv[3] || '';
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}

/* Les réglages par défaut de la Maison, lus du dépôt : le banc ne les recopie pas. */
const cache = path.join(racine, 'node_modules', '.cache', 'banc-des-parametres');
mkdirSync(cache, { recursive: true });
const entree = path.join(cache, 'entree.ts');
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-parametres-'));
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
const largeur = async (w, h) => cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
await largeur(1280, 900);

let ko = 0;
try {
  const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
  const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
  /* LE TEXTE ÉCRIT, pas celui qu'on voit : les boutons du Trône passent en
     capitales par la feuille de style, et `innerText` les rend en capitales. */
  const texte = () => evalue(`document.body.textContent.replace(/\\s+/g, ' ')`);
  const clique = (selecteur, debut) => evalue(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(debut)}) && !x.disabled);
    if (b) b.click();
    return !!b;
  })()`);
  const ecris = (selecteur, valeur) => evalue(`(() => {
    const el = document.querySelector(${JSON.stringify(selecteur)});
    if (!el) return false;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(valeur)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  const touche = (selecteur, cle) => evalue(`(() => { const el = document.querySelector(${JSON.stringify(selecteur)}); if (!el) return false; el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(cle)}, bubbles: true })); return true; })()`);
  const capture = async (nom) => {
    if (!captures) return;
    mkdirSync(captures, { recursive: true });
    const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    if (img.result?.data) writeFileSync(path.join(captures, nom), Buffer.from(img.result.data, 'base64'));
  };

  /* Les heures de la Maison, telles que la sauvegarde du 26 octobre 2026 les porte. */
  const HEURES = [
    { key: 'lun', label: 'Lundi', open: '08h00', close: '19h00', closed: true }, { key: 'mar', label: 'Mardi', open: '08h00', close: '20h30', closed: false },
    { key: 'mer', label: 'Mercredi', open: '08h00', close: '20h30', closed: false }, { key: 'jeu', label: 'Jeudi', open: '08h00', close: '20h30', closed: false },
    { key: 'ven', label: 'Vendredi', open: '08h00', close: '20h30', closed: false }, { key: 'sam', label: 'Samedi', open: '09h00', close: '20h00', closed: false },
    { key: 'dim', label: 'Dimanche', open: '10h00', close: '16h00', closed: true },
  ];
  const SEMENCE = {
    'trone::mnd_settings': { ...DEFAULT_SETTINGS, hours: HEURES, mndPay: { actif: true }, relances: { actives: true, depuis: '2026-10-18' } },
    'trone::mnd_payment_methods': ['Espèces', 'MTN MoMo', 'Momopay', 'Moov', 'Celtis', 'Carte', 'Virement bancaire', 'Chèque'],
    'trone::mnd_horaires_exceptions': [],
  };
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('banc_seme')) { sessionStorage.setItem('banc_seme', '1'); localStorage.setItem('mnd_reset_v5', '1'); for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); } } catch (e) {}` });
  const ouvre = async (hash, ms = 6000) => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#${hash}` });
    await attend(1200);
    await cdp('Page.reload', { ignoreCache: false });
    await attend(ms);
  };

  /* ── A. L'ÉCRAN AU REPOS ── */
  await ouvre('/parametres', 7000);
  let t = await texte();
  dit('huit tuiles', (await evalue(`document.querySelectorAll('.prm-tuile').length`)) === 8, await evalue(`document.querySelectorAll('.prm-tuile').length`));
  dit('cinq gestes rapides', (await evalue(`document.querySelectorAll('.prm-geste').length`)) === 5);
  dit('la tuile des heures dit la semaine', t.includes('mar. au ven. 8 h à 20 h 30 · sam. 9 h à 20 h · fermée lundi et dimanche'), t.match(/Heures et jours[^·]*·[^·]*/)?.[0]);
  dit('la tuile des paiements compte les modes', t.includes('8 modes · MND PAY allumé · relances allumées'));
  dit('rien « à venir », ni les contrôles retirés', !/À venir|À VENIR|Double authentification|Durée standard|Accès ERP du personnel/.test(t));
  dit('ce qui efface ne se voit pas', !/Tout réinitialiser|Annuler \d+ factures|Vider \d+ rendez-vous|Remplacer toute la Maison/.test(t));
  await capture('parametres-1280-repos.png');

  /* ── B. UNE TUILE, UN PANNEAU ── */
  dit('la tuile Paiements s ouvre', await clique('.prm-tuile', 'Paiements'));
  await attend(900);
  t = await texte();
  dit('… son panneau porte les modes, MND PAY et les relances', /Les modes de paiement/.test(t) && /Allumer MND PAY/.test(t) && /Allumées depuis le/.test(t));
  dit('… et l adresse le dit', (await evalue('location.hash')).includes('ouvre=paiements'), await evalue('location.hash'));
  await capture('parametres-1280-paiements.png');
  dit('elle se referme d un toucher', await clique('.prm-tuile', 'Paiements'));
  await attend(700);
  dit('… et le panneau part', !(await evalue(`!!document.querySelector('#prm-panneau')`)));

  /* ── C. LA RECHERCHE ── */
  await ecris('.prm-cherche input', 'acompte');
  await attend(500);
  dit('« acompte » ne laisse qu une tuile', (await evalue(`document.querySelectorAll('.prm-tuile').length`)) === 1, await evalue(`[...document.querySelectorAll('.prm-tuile .prm-tuile__nom')].map((x) => x.textContent).join(' | ')`));
  await touche('.prm-cherche input', 'Enter');
  await attend(900);
  t = await texte();
  dit('Entrée ouvre la réservation', /Acompte exigé en ligne/.test(t) && (await evalue('location.hash')).includes('ouvre=reservation'));
  await ecris('.prm-cherche input', 'wifi');
  await attend(500);
  t = await texte();
  dit('« wifi » dit où aller', /QR de la Maison/.test(t) && (await evalue(`[...document.querySelectorAll('.prm-trouve a')].some((a) => a.getAttribute('href').includes('qr-codes'))`)));
  await ecris('.prm-cherche input', '');
  await attend(400);

  /* ── D. FERMER LA MAISON UN JOUR ── */
  dit('le geste ouvre son formulaire', await clique('.prm-geste', 'Fermer la Maison un jour'));
  await attend(900);
  t = await texte();
  dit('… dans le panneau des heures', /Fermer ce jour/.test(t) && (await evalue('location.hash')).includes('ouvre=heures'), `${/Fermer ce jour/.test(t)} ${await evalue('location.hash')}`);
  dit('« Fermer ce jour »', await clique('button', 'Fermer ce jour'));
  await attend(900);
  const exceptions = (await lis('trone::mnd_horaires_exceptions')) ?? [];
  dit('une journée exceptionnelle fermée est écrite, pour demain', exceptions.length === 1 && exceptions[0].closed === true && exceptions[0].date > new Date().toISOString().slice(0, 10), JSON.stringify(exceptions[0] ?? null));

  /* ── E. UNE NOTIFICATION S'ÉTEINT VRAIMENT ── */
  await ouvre('/parametres?ouvre=notifications', 6000);
  t = await texte();
  dit('les trois sujets de la cloche, sous leur vrai nom', /Nouveau rendez-vous/.test(t) && /Stock bas/.test(t) && /Factures en attente/.test(t) && !/Clôture de paie/.test(t));
  const bascule = await evalue(`(() => { const r = [...document.querySelectorAll('#prm-panneau .sys-row')].find((x) => x.textContent.includes('Stock bas')); const b = r && r.querySelector('button'); if (b) b.click(); return !!b; })()`);
  await attend(700);
  dit('« Stock bas » s éteint dans les réglages', bascule && (await lis('trone::mnd_settings'))?.toggles?.notifStock === false);

  /* ── F. RAREMENT, ET LE VERROU ── */
  await ouvre('/parametres?ouvre=identite', 6000);
  t = await texte();
  dit('?ouvre=identite déplie « Rarement »', /Identité de la Maison/.test(t) && /Raison sociale/.test(t));
  dit('la sauvegarde s ouvre', await clique('.prm-repli__tete', 'Sauvegarde et zones sensibles'));
  await attend(700);
  t = await texte();
  dit('… l export est là, ce qui écrase non', /Exporter toute la Maison/.test(t) && !/Mettre à jour depuis un fichier|Remplacer toute la Maison par un fichier|Tout réinitialiser/.test(t), JSON.stringify([/Exporter toute la Maison/.test(t), t.match(/Mettre à jour depuis un fichier|Remplacer toute la Maison par un fichier|Tout réinitialiser/)?.[0], t.slice(t.indexOf('Sauvegarde de la Maison'), t.indexOf('Sauvegarde de la Maison') + 200)]));
  await ecris('.prm-verrou input', 'effac');
  await attend(400);
  dit('un mot incomplet ne montre rien', !/Tout réinitialiser/.test(await texte()));
  await ecris('.prm-verrou input', 'EFFACER');
  await attend(600);
  t = await texte();
  dit('EFFACER montre ce qui efface', /Tout réinitialiser/.test(t) && /Remplacer toute la Maison par un fichier/.test(t) && /rendez-vous de la Maison, toutes branches/.test(t), JSON.stringify([/Tout réinitialiser/.test(t), /Remplacer toute la Maison par un fichier/.test(t), /rendez-vous de la Maison, toutes branches/.test(t)]));
  dit('« Reverrouiller » le cache de nouveau', await clique('button', 'Reverrouiller'));
  await attend(500);
  dit('… caché', !/Tout réinitialiser/.test(await texte()));

  /* ── G. AU TÉLÉPHONE ── */
  await largeur(390, 844);
  await ouvre('/parametres?ouvre=paiements', 6000);
  const deborde = await evalue(`document.documentElement.scrollWidth - window.innerWidth`);
  dit('à 390 px, la page ne déborde pas', deborde <= 0, `${deborde} px`);
  dit('… deux tuiles par rangée', (await evalue(`getComputedStyle(document.querySelector('.prm-tuiles')).gridTemplateColumns.split(' ').length`)) === 2);
  await capture('parametres-390-paiements.png');
  await ouvre('/parametres', 6000);
  await capture('parametres-390-repos.png');

  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
} finally {
  ws.close(); chrome.kill(); serveur.close();
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore le dossier */ }
}
console.log(ko === 0 ? '\nLes Paramètres tiennent au comptoir.' : `\n${ko} controle(s) en echec.`);
process.exit(ko === 0 ? 0 : 1);
