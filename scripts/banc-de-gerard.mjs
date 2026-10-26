/* LE BANC DE GÉRARD — `node scripts/banc-de-gerard.mjs [capture]`.

   26 octobre 2026 : la rubrique « Gérard » (maquette 4bPVFik1…, lot 1).
   Le harnais éprouve le cerveau (`verifie-gerard`) ; ce banc ouvre le VRAI
   Trône, Supabase injoignable, sur une session gardée de la direction, sème
   six clientes (une par situation) et lit l'écran :

     - la rubrique est en Clientèle, juste sous « Clientes » ;
     - le plan du jour donne à chacune sa situation : garder son RDV,
       l'anniversaire, une envie du fil, en retard, une seule venue, endormie ;
     - une ligne s'ouvre sur le message, sa signature et la devise, et le
       pourquoi ;
     - maquette v4 : Pause puis Actif (plus d'essai à cinq), le plafond de
       la semaine en nombre et en francs, sept plus un modèles Meta ;
     - au téléphone, rien ne déborde.

   Les fiches sont des exemples, signées d'initiales. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-ger-'));
console.log('Construction du Trone (serveur injoignable)...');
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-ger-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));

let ko = 0;
try {
  let cible;
  for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
  if (!cible) throw new Error('Chrome ne repond pas.');
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
  const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + String(detail).slice(0, 260) : ''}`); };
  const photo = async (etape) => {
    if (!capture) return;
    const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };
  const texte = () => evalue('document.body.innerText');
  const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
  const clique = (selecteur, mot) => evalue(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.offsetParent !== null && x.innerText.trim().replace(/\\s+/g, ' ').toLowerCase().startsWith(${JSON.stringify(mot.toLowerCase())}));
    if (b) b.click();
    return !!b;
  })()`);
  const tombe = async () => /Unexpected Application Error|Cet écran ne s.est pas ouvert|Unexpected error/i.test(await texte());
  /* Un nombre tel que l'écran l'écrit : « 12,4 », « +9 », « 1 040 ». */
  const nombre = (t) => Number(String(t ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'));
  /* Les tableaux : [titre, [[cellules]...]] ; la dernière ligne est le total. */
  const tableaux = () => evalue(String.raw`[...document.querySelectorAll('.trp-prev__calcul')].map((c) => [
    c.querySelector('h3')?.innerText.replace(/\s+/g, ' ').trim(),
    [...c.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.replace(/\s+/g, ' ').trim())),
  ])`);
  const chiffres = () => evalue(String.raw`[...document.querySelectorAll('.trp-prev__chiffre b')].map((b) => b.innerText.trim())`);
  const colonnes = () => evalue(String.raw`[...document.querySelectorAll('.trp-prev__graphe > g')].filter((g) => g.querySelector('rect')).map((g) => g.lastElementChild.textContent)`);

  /* La session gardée, et le vécu d'exemple. */
  const UID = 'u-banc-ger';
  const CLE = 'sb-127-auth-token';
  const le = new Date(Date.now() - 86_400_000).toISOString();
  const date = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const instant = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
  const accord = { oui: true, le: date(-100), par: 'comptoir' };
  const fiche = (id, name, extra) => ({ id, branchId: 'maison', name, phone: `+229 01 51 00 00 ${String(10 + id.length)}`, city: '', persona: '', since: '2025-01-10', photo: null, segments: [], priceCoef: 1, loyaltyPoints: 0, diaspora: false, nouvelles: accord, ...extra });
  const clients = [
    fiche('c-garder', 'G. A.'),
    fiche('c-anniv', 'N. B.', { birthday: `1990-${date(0).slice(5)}` }),
    fiche('c-fil', 'P. O.'),
    fiche('c-retard', 'M. D.'),
    fiche('c-une', 'C. U.'),
    fiche('c-dort', 'F. S.'),
  ];
  let n = 0;
  const rdv = (clientId, j, status, extra = {}) => ({ id: `rdv-${++n}`, branchId: 'maison', clientId, serviceIds: [], date: date(j), time: '10:00', status, master: '', ...extra });
  const rdvs = [
    rdv('c-garder', -120, 'honoré'), rdv('c-garder', -60, 'honoré'), rdv('c-garder', 2, 'confirmé', { creeLe: instant(-10) }),
    rdv('c-anniv', -200, 'honoré'), rdv('c-anniv', -150, 'honoré'), rdv('c-anniv', 9, 'confirmé', { creeLe: instant(-1) }),
    rdv('c-fil', -142, 'honoré'), rdv('c-fil', -86, 'honoré'), rdv('c-fil', -30, 'honoré'),
    rdv('c-retard', -125, 'honoré'), rdv('c-retard', -90, 'honoré'), rdv('c-retard', -55, 'honoré'),
    rdv('c-une', -70, 'honoré'),
    rdv('c-dort', -260, 'honoré'), rdv('c-dort', -200, 'honoré'),
  ];
  const semence = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] } },
    'trone::mnd_clients': clients,
    'trone::mnd_appointments': rdvs,
  };
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/gerard'; location.reload(); true`);
  const vu = await jusqua(`document.querySelectorAll('.trc-ger__rangee').length > 0`, 40000);

  /* 1. La rubrique. */
  dit('Gérard s ouvre, comme la direction', !!vu && !(await tombe()));
  const barre = await evalue(String.raw`[...document.querySelectorAll('.tr-nav__item')].map((a) => a.textContent.replace(/\s+/g, ' ').trim())`);
  const iClientes = (barre ?? []).findIndex((t) => t.startsWith('Clientes'));
  dit('la barre : « Assistant Maison » juste sous « Clientes », allumé', iClientes >= 0 && String(barre[iClientes + 1]).startsWith('Assistant Maison')
    && !!(await evalue(String.raw`[...document.querySelectorAll('.tr-nav__item.active')].some((a) => a.textContent.trim().startsWith('Assistant Maison'))`)), JSON.stringify(barre?.slice(Math.max(0, iClientes), iClientes + 2)));
  dit('en pause, il le dit : il prépare son plan, il n écrit à personne', /Pause\.\s*Il prépare son plan, il n’écrit à personne/.test(await texte()));

  /* 2. Le plan du jour. */
  const lignes = await evalue(String.raw`[...document.querySelectorAll('.trc-ger__ligne')].map((b) => [b.querySelector('.trc-ger__qui')?.firstChild?.textContent, b.querySelector('.trc-ger__genre')?.textContent, b.querySelector('.trc-ger__canal')?.textContent])`);
  const genreDe = (nom) => (lignes ?? []).find((l) => l[0] === nom)?.[1] ?? '';
  dit('le plan donne à chacune sa situation', /^Garder son RDV/.test(genreDe('G. A.')) && /^Anniversaire/.test(genreDe('N. B.')) && /^Une envie du fil/.test(genreDe('P. O.'))
    && /^En retard/.test(genreDe('M. D.')) && /^Une seule venue/.test(genreDe('C. U.')) && /^Endormie/.test(genreDe('F. S.')), JSON.stringify(lignes));
  dit('... garder d abord, l anniversaire porte son code de 10 %', (lignes ?? [])[0]?.[0] === 'G. A.' && /−10 % · anniversaire/.test((lignes ?? []).find((l) => l[0] === 'N. B.')?.[2] ?? ''), JSON.stringify((lignes ?? []).slice(0, 2)));
  const enTete = await evalue(String.raw`[...document.querySelectorAll('.trc-ger__chiffre b')].map((b) => b.innerText.trim())`);
  dit('l en-tête : six à écrire, rien de parti, un RDV à garder, 0 remise sur 8, 0 F', enTete?.[0] === '6' && enTete?.[1] === '0' && enTete?.[2] === '1'
    && enTete?.[3] === '0 / 8' && /^0\sF$/.test(enTete?.[4] ?? ''), JSON.stringify(enTete));

  /* 3. Une ligne ouverte. */
  dit('la ligne de M. D. s ouvre', await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-ger__ligne')].find((x) => x.textContent.includes('M. D.')); if (b) b.click(); return !!b; })()`));
  await attend(400);
  const panneau = await evalue(String.raw`(document.querySelector('.trc-ger__panneau')?.innerText || '').replace(/\s+/g, ' ')`);
  dit('... le modèle « place » : il est temps, deux places, la signature et la devise', /Bonjour M\., il est temps de votre .+ : nous avons de la place .+\. Je vous en garde une \? Maison MND/.test(panneau) && /mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là/.test(panneau) && /gerard_place/.test(panneau), panneau.slice(0, 260));
  dit('... et le pourquoi : sa dernière venue, sa date attendue avec l année, son retard', /Dernière venue/.test(panneau) && /Date attendue \S+ \d{1,2}(er)? \S+ \d{4}/.test(panneau) && /Retard \d+ jours/.test(panneau));
  await photo('1-plan');
  dit('plus d essai à cinq : ni bouton, ni onglet', !(await evalue(String.raw`/essai/i.test(document.querySelector('.trc-ger')?.innerText || '')`)));
  dit('en pause, pas de bouton WhatsApp', !(await evalue(String.raw`[...document.querySelectorAll('a.trc-ger__btn')].some((a) => a.textContent.trim().startsWith('Envoyer sur WhatsApp'))`)));
  dit('deux choix seulement : Pause et Actif', JSON.stringify(await evalue(String.raw`[...document.querySelectorAll('.trc-ger__modes button b')].map((b) => b.textContent)`)) === JSON.stringify(['Pause', 'Actif']));
  dit('le passer en Actif', await clique('.trc-ger__modes button', 'Actif'));
  await attend(400);
  const apres = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_gerard') || 'null')`);
  dit('... écrit « ouvert » dans les réglages, avec le plafond par défaut', apres?.mode === 'ouvert' && apres?.remisesParSemaine === 8 && apres?.plafondFrancs === 60000, JSON.stringify(apres));
  dit('actif, l état dit le passage du jour et le bouton WhatsApp', /Actif\.\s*Chaque jour/.test(await texte()) && /Gérard dépose les notifications Ma Couronne/.test(await texte()));
  /* Le plafond en francs : tapé, puis posé à la sortie du champ. */
  await evalue(String.raw`(() => {
    const champ = [...document.querySelectorAll('.trc-ger__plafond input')][1];
    const pose = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    pose.call(champ, '45 000'); champ.dispatchEvent(new Event('input', { bubbles: true }));
    /* React écoute « focusout » pour onBlur : une page sans focus ne l'émet pas d'elle-même. */
    champ.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    return true;
  })()`);
  await attend(500);
  const plafond = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_gerard') || 'null')`);
  dit('le plafond en francs se règle : 45 000 F, le nombre de remises garde ses 8', plafond?.plafondFrancs === 45000 && plafond?.remisesParSemaine === 8, JSON.stringify(plafond));
  dit('... et l en-tête le dit', /sur 45\s000\sF/.test(await texte()));

  /* Un toucher : le message part sur WhatsApp, noté au journal. */
  await evalue(String.raw`(() => { if (!document.querySelector('.trc-ger__panneau')) { const b = [...document.querySelectorAll('.trc-ger__ligne')].find((x) => x.textContent.includes('M. D.')); if (b) b.click(); } return true; })()`);
  await attend(300);
  const lien = await evalue(String.raw`[...document.querySelectorAll('a.trc-ger__btn')].find((a) => a.textContent.trim().startsWith('Envoyer sur WhatsApp'))?.href || ''`);
  dit('« Envoyer sur WhatsApp » ouvre le message déjà écrit, au bon numéro, signé et avec la devise', /^https:\/\/wa\.me\/229\d+\?text=/.test(lien)
    && /il est temps de votre/.test(decodeURIComponent(lien)) && /Maison MND\nmi nyɔ́ ɖɛkpɛ, votre beauté est déjà là$/.test(decodeURIComponent(lien.split('text=')[1] ?? '')), decodeURIComponent(lien).slice(0, 200));
  await evalue(String.raw`(() => { const a = [...document.querySelectorAll('a.trc-ger__btn')].find((x) => x.textContent.trim().startsWith('Envoyer sur WhatsApp')); if (a) { a.removeAttribute('target'); a.setAttribute('href', '#/gerard'); a.click(); } return !!a; })()`);
  await attend(600);
  const envoisGerard = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_envois') || '[]').filter((e) => e.type === 'gerard')`);
  dit('... noté au journal des envois : à la main, sa cliente, sa raison', (envoisGerard ?? []).length === 1 && envoisGerard[0].statut === 'à-la-main' && envoisGerard[0].clientId === 'c-retard' && envoisGerard[0].genre === 'retard',
    JSON.stringify(envoisGerard));
  await attend(400);
  const journal = await evalue(String.raw`[...document.querySelectorAll('.trc-ger__carte')].find((c) => c.querySelector('h3')?.textContent.startsWith('Aujourd’hui'))?.innerText.replace(/\s+/g, ' ') || ''`);
  dit('... « Aujourd hui » le montre, et M. D. sort du plan (deux semaines avant le prochain)', /M\. D\./.test(journal) && /WhatsApp, à la main/.test(journal)
    && !(await evalue(String.raw`[...document.querySelectorAll('.trc-ger__qui')].some((q) => q.firstChild?.textContent === 'M. D.')`)), journal.slice(0, 200));

  /* 4. Les modèles Meta. */
  const modeles = await evalue(String.raw`[...document.querySelectorAll('.trc-ger__modeles li b')].map((b) => b.textContent)`);
  dit('sept plus un modèles à déposer chez Meta', JSON.stringify(modeles) === JSON.stringify(['gerard_garder', 'gerard_avant', 'gerard_envie', 'gerard_place', 'gerard_anniversaire', 'gerard_fetes', 'gerard_endormie', 'nouvelles_de_la_maison']), JSON.stringify(modeles));

  /* 5. Au téléphone. */
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await attend(800);
  dit('au téléphone (390 px), rien ne déborde', (await evalue('document.documentElement.scrollWidth > window.innerWidth + 1')) === false, String(await evalue('document.documentElement.scrollWidth')));
  await photo('2-telephone');
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');
  ws.close();
} catch (e) {
  ko++;
  console.log('ECHEC', e?.message ?? e);
} finally {
  chrome.kill(); serveur.close();
  setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
}
console.log(ko === 0 ? '\nGérard prépare son plan du jour.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
