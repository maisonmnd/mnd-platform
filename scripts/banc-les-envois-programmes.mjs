/* LE BANC DES ENVOIS PROGRAMMÉS — `node scripts/banc-les-envois-programmes.mjs [dossier construit] [dossier des captures]`.

   13 novembre 2026, maquette « Les envois programmés » (validée,
   « construis »). Le harnais `verifie-les-envois-programmes` éprouve la
   règle et le facteur ; ce banc ouvre le VRAI Trône, hors ligne, comme une
   main :

     - les appels déjà notés : un « à rappeler » non fait devient un envoi
       « à valider d'un toucher » (À venir), le journal le dit ; un appel
       sans numéro reste au journal ;
     - « Partager › Le Trône » (un numéro) ouvre « Programmer un WhatsApp »,
       la fiche du numéro reconnue, « Suite à son appel » d'office ;
       « Programmer » pose UNE ligne `programme`, au prénom, signée par le
       code ;
     - le menu Créer : « Programmer un WhatsApp » à la place d'« Appel
       reçu » ; deux clientes, un message libre, par l'app : DEUX lignes,
       chacune à son prénom, chacune par l'app ;
     - la file : « Envoyer » sur l'ancien appel (le oui), « Retenir » ; au
       téléphone (390 px), rien ne dépasse.

   Hors ligne, il n'y a pas de facteur : on éprouve le formulaire, la file
   et les gestes, écrits au magasin. Personnes et numéros inventés.

   Il attend le Trône construit sans serveur (sous Bash) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const construit = path.resolve(process.argv[2] || path.join(tmpdir(), 'banc-trone'));
const captures = process.argv[3] || '';
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
if (captures) mkdirSync(captures, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = createServer((req, res) => {
  let f = path.join(construit, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!path.resolve(f).startsWith(construit) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-envois-programmes-'));
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
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${!ok && detail !== undefined ? ' -> ' + detail : ''}`); };
const clique = (selecteur, texte, dans = 'document') => evalue(`(() => {
  const b = [...${dans}.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const tape = (selecteur, valeur, rang = 0) => evalue(`(() => {
  const el = document.querySelectorAll(${JSON.stringify(selecteur)})[${rang}];
  if (!el) return false;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('focus', { bubbles: true }));
  return true;
})()`);
const onglet = (nom) => evalue(`(() => { const b = [...document.querySelectorAll('.trc-file__onglet')].find((x) => x.textContent.endsWith(${JSON.stringify(nom)})); if (b) b.click(); return !!b; })()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const texteModale = () => evalue(`(document.querySelector('.mnd-modal')?.innerText || '').replace(/\\s+/g, ' ')`);
const textePage = () => evalue(`(document.querySelector('.tr-content')?.innerText || document.body.innerText || '').replace(/\\s+/g, ' ')`);
const capture = async (nom, l, h, mobile) => {
  if (!captures) return;
  await cdp('Emulation.setDeviceMetricsOverride', { width: l, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await attend(600);
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(captures, `${nom}.png`), Buffer.from(img.result.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await attend(400);
};

const jour = new Date();
const AUJ = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`;
const SEMENCE = {
  'trone::mnd_clients': [
    { id: 'cl-awa', branchId: 'maison', name: 'Awa Banc', civilite: 'madame', phone: '+229 01 97 00 00 01', city: '', persona: '', since: AUJ, segments: [] },
    { id: 'cl-sika', branchId: 'maison', name: 'Sika Banc', civilite: 'madame', phone: '+229 01 97 00 00 02', city: '', persona: '', since: AUJ, segments: [] },
    { id: 'cl-ola', branchId: 'maison', name: 'Ola Banc', phone: '+229 01 97 00 00 03', city: '', persona: '', since: AUJ, segments: [] },
  ],
  'trone::mnd_appels': [
    { id: 'ap-banc', branchId: 'maison', clientId: 'cl-ola', nom: 'Ola Banc', phone: '+229 01 97 00 00 03', motif: 'son retwist', suite: 'rappel', quand: AUJ, fait: false, at: `${AUJ}T08:00:00.000Z` },
    { id: 'ap-sans', branchId: 'maison', nom: 'Sans Numero', motif: 'une question', suite: 'rappel', quand: AUJ, fait: false, at: `${AUJ}T08:00:00.000Z` },
  ],
};
const SEME = `<script>localStorage.clear();localStorage.setItem('mnd_reset_v5','1');${Object.entries(SEMENCE).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join('')}</script>`;
/* La semence passe par une page de la même origine, avant le Trône. */
const semeLa = path.join(construit, '__seme-envois.html');
writeFileSync(semeLa, `<!doctype html><meta charset="utf-8">${SEME}<p>seme</p>`);
const va = async (chemin, ms = 2500) => { await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/${chemin}` }); await attend(ms); };

try {
  await va('__seme-envois.html', 600);
  /* 1. Les appels déjà notés, convertis à l'ouverture. */
  await va('trone.html#/appels', 3500);
  const lignes1 = (await lis('trone::mnd_envois')) ?? [];
  const convertie = lignes1.find((e) => e.id === 'prog-appel-ap-banc-1');
  dit('les appels deja notes : l appel a rappeler devient un envoi a valider d un toucher, au texte de son appel, signe',
    !!convertie && convertie.statut === 'à-valider' && convertie.type === 'programme' && /^Bonjour Ola, la Maison MND a bien reçu votre appel au sujet de « son retwist »/.test(convertie.colis?.texte ?? '') && /ɖɛkpɛ/.test(convertie.colis?.texte ?? ''),
    JSON.stringify(convertie)?.slice(0, 300));
  dit('... un appel sans numero ne devient rien, il reste au journal', !lignes1.some((e) => String(e.id).includes('ap-sans')), '');
  const appels = (await lis('trone::mnd_appels')) ?? [];
  dit('... l appel porte la marque de son envoi', appels.find((a) => a.id === 'ap-banc')?.envoiId === 'prog-appel-ap-banc-1' && !appels.find((a) => a.id === 'ap-sans')?.envoiId, JSON.stringify(appels));
  const page1 = await textePage();
  dit('la page : « Les envois programmes », ses onglets, la ligne a valider', /Les envois programmés/.test(page1) && /À venir/.test(page1) && /Partis/.test(page1) && /À revoir/.test(page1) && /Les appels notés/.test(page1) && /ancien appel : à valider d’un toucher/.test(page1), page1.slice(0, 300));
  await capture('envois-file', 1280, 900, false);
  await onglet('Les appels notés');
  await attend(300);
  await clique('button', 'Tous');
  await attend(300);
  const journal = await textePage();
  dit('le journal des appels garde tout : l appel converti le dit, l appel sans numero reste a traiter', /devenu un envoi programmé/.test(journal) && /Sans Numero/.test(journal), journal.slice(0, 400));
  await onglet('À venir');
  await attend(300);

  /* 2. Le oui sur l'ancien appel. */
  dit('« Envoyer » sur l ancien appel : il redevient en attente, le oui note', await clique('.trc-file__envoi button', 'Envoyer'), '');
  await attend(500);
  const oui = ((await lis('trone::mnd_envois')) ?? []).find((e) => e.id === 'prog-appel-ap-banc-1');
  dit('... statut en attente, oui pose', oui?.statut === 'en-attente' && !!oui?.ouiLe, JSON.stringify(oui)?.slice(0, 200));

  /* 3. « Partager › Le Trône » : un numéro, le formulaire. */
  await va(`trone.html?text=${encodeURIComponent('+229 01 97 00 00 01')}#/`, 3500);
  const m1 = await texteModale();
  dit('« Partager › Le Trone » ouvre « Programmer un WhatsApp », la fiche du numero reconnue', /Programmer un WhatsApp\./.test(m1) && /Awa Banc/.test(m1) && /Suite à son appel/.test(m1), m1.slice(0, 300));
  await tape('.mnd-modal input[aria-label="Le motif de son appel"]', 'ses tresses');
  await attend(200);
  const m2 = await texteModale();
  dit('... l apercu dit le message, son prenom, le motif, signe ; et la voie (le modele d ouverture)', /Bonjour Awa, la Maison MND a bien reçu votre appel au sujet de « ses tresses »/.test(m2) && /ɖɛkpɛ/.test(m2) && /modèle d’ouverture/.test(m2), m2.slice(0, 500));
  await capture('envois-formulaire', 1280, 900, false);
  await capture('envois-formulaire-telephone', 390, 844, true);
  await clique('.mnd-modal button', 'Programmer');
  await attend(700);
  const apres = ((await lis('trone::mnd_envois')) ?? []).filter((e) => e.type === 'programme' && e.clientId === 'cl-awa');
  dit('« Programmer » : une ligne programme, en attente, dans 1 h, au nom de Perle, seule, signee',
    apres.length === 1 && apres[0].statut === 'en-attente' && apres[0].colis?.mode === 'seul' && apres[0].colis?.parQui === 'Perle'
    && Math.abs(Date.parse(apres[0].prevuA) - Date.now() - 3_600_000) < 5 * 60_000 && /ses tresses/.test(apres[0].colis?.texte ?? ''), JSON.stringify(apres).slice(0, 400));

  /* 4. Le menu Créer : deux clientes, par l'app. */
  await va('trone.html#/', 3000);
  await clique('.trc-creer__bouton', 'Créer');
  await attend(300);
  const menu = await evalue(`[...document.querySelectorAll('.trc-creer__item b')].map((b) => b.textContent)`);
  dit('le menu Creer : « Programmer un WhatsApp », plus « Appel reçu »', menu?.includes('Programmer un WhatsApp') && !menu?.includes('Appel reçu'), JSON.stringify(menu));
  await clique('.trc-creer__item', 'Programmer un WhatsApp');
  await attend(600);
  for (const nom of ['Sika', 'Ola']) {
    await tape('.mnd-modal .trc-clientpick input.mnd-input', nom);
    await attend(300);
    await clique('.mnd-modal .trc-clientpick__opt', `${nom} Banc`);
    await attend(300);
  }
  await clique('.mnd-modal .trc-prog__puce', 'Message libre');
  await tape('.mnd-modal textarea', 'Bonjour {prénom}, votre carte de fidélité vous attend.');
  await clique('.mnd-modal .trc-prog__puce', 'Par l’app');
  await attend(300);
  const m3 = await texteModale();
  dit('... deux clientes, par l app : l apercu le dit (une sonnerie chacune)', /Sika Banc et 1 autre/.test(m3) && /Plusieurs clientes : une sonnerie chacune/.test(m3) && /Pas de règle des 24 h/.test(m3), m3.slice(0, 500));
  await clique('.mnd-modal button', 'Programmer');
  await attend(700);
  const deux = ((await lis('trone::mnd_envois')) ?? []).filter((e) => e.type === 'programme' && (e.clientId === 'cl-sika' || e.clientId === 'cl-ola') && !String(e.id).startsWith('prog-appel'));
  dit('... deux lignes, une chacune, a son prenom, par l app', deux.length === 2 && deux.every((e) => e.colis?.mode === 'app')
    && deux.some((e) => /^Bonjour Sika, votre carte/.test(e.colis?.texte ?? '')) && deux.some((e) => /^Bonjour Ola, votre carte/.test(e.colis?.texte ?? '')), JSON.stringify(deux).slice(0, 400));

  /* 5. La file, au téléphone. */
  await va('trone.html#/appels', 3000);
  const file = await textePage();
  dit('la file montre les quatre envois a venir, par l app et Perle', (file.match(/Par l’app/g) ?? []).length >= 2 && /Perle/.test(file), file.slice(0, 500));
  await clique('.trc-file__envoi button', 'Retenir');
  await attend(500);
  const tenu = ((await lis('trone::mnd_envois')) ?? []).filter((e) => e.type === 'programme' && e.statut === 'retenu');
  dit('« Retenir » : la ligne se tient', tenu.length === 1, JSON.stringify(tenu).slice(0, 200));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await attend(700);
  const deborde = await evalue(`(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll('.trc-file__envoi, .trc-file__onglets')].filter((e) => e.getBoundingClientRect().right > w + 1).length + (document.documentElement.scrollWidth > w + 1 ? 100 : 0); })()`);
  dit('au telephone (390 px) : la file ne deborde pas', deborde === 0, deborde);
  await capture('envois-file-telephone', 390, 844, true);
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.join(' | '));
} finally {
  try { ws.close(); } catch { /* fermé */ }
  chrome.kill();
  serveur.close();
  try { (await import('node:fs')).rmSync(semeLa, { force: true }); } catch { /* rien */ }
}
console.log(ko ? `\n${ko} échec(s).` : '\nLe formulaire et la file tiennent, comme une main.');
process.exit(ko ? 1 : 0);
