import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* DANS TROIS SEMAINES, À L'ÉCRAN — `node scripts/banc-dans-trois-semaines.mjs [capture]`.

   14 novembre 2026 : « Jump to a date from today et se retrouver facilement
   pour la cliente qui a besoin de programmer son prochain RDV rapidement »
   (Yéman). Ce banc construit le Trône comme le banc hors ligne (connexion
   obligatoire, serveur Supabase injoignable, une session gardée), pose une
   cliente d'exemple et ses trois venues, puis, dans un vrai Chrome :
   · le Calendrier dit sa distance, « Aujourd'hui » paraît dès qu'on s'en
     éloigne, « Aller à… » lit « dans 3 semaines » et y va ;
   · Trouver lit « 12/12 » et ouvre le Calendrier sur ce jour, mais laisse
     « mar » à Mariette ;
   · le « + RDV » de la cliente montre la barre, sa date en cuivre, le fil des
     seize semaines ; un saut, une semaine du fil et « Aujourd'hui » déplacent
     la semaine des places ; Entrée ne soumet pas la fenêtre ;
   · au téléphone (390 px), rien ne déborde.
   La cliente, le rituel et les montants sont des exemples. */

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-saut-'));
console.log('Construction du Trône (serveur injoignable)…');
execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_ALLOW_OPEN: 'false', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-saut-chrome-'));
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
const taille = (width, height, mobile = false) => cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
await taille(1280, 900);

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};

const UID = 'u-banc-saut';
const CLE = 'sb-127-auth-token';
const le = new Date(Date.now() - 86_400_000).toISOString();
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const jourPlus = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return isoDe(d); };
const AUJ = jourPlus(0);
const venue = (rid, date, status = 'honoré', time = '10:00') => ({ id: rid, branchId: 'maison', clientId: 'cl-sena', serviceIds: ['sv-rituel'], date, time, status, master: 'Team', priceXof: 10000 });
const semence = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
    user: { id: UID, email: 'accueil@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Accueil', role: 'souverain', rubrics: [] } },
  'trone::mnd_catalog_services': [
    { id: 'sv-rituel', categoryId: '', name: 'Rituel du banc', palier: 'Fondation', priceXof: 10000, durationMin: 60, hidePrice: false, sessions: 1, order: 1 },
  ],
  'trone::mnd_clients': [
    { id: 'cl-sena', branchId: 'maison', name: 'Sènami E.', phone: '0100000071', city: '', persona: '', since: '2026-01-10', segments: [] },
  ],
  /* Trois venues tous les vingt-huit jours : sa date tombe dans quatre semaines environ. */
  'trone::mnd_appointments': [venue('v1', jourPlus(-58)), venue('v2', jourPlus(-30)), venue('v3', jourPlus(-2)), venue('auj', AUJ, 'confirmé', '11:00')],
};

const texte = (sel) => evalue(`document.querySelector(${JSON.stringify(sel)})?.textContent?.trim() ?? ''`);
const visible = (sel) => evalue(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return !!e && e.offsetParent !== null; })()`);
const cliqueSur = (texteDuBouton, dans = 'document') => evalue(`(() => {
  const b = [...${dans}.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(texteDuBouton)} && x.offsetParent !== null);
  if (!b) return false; b.click(); return true;
})()`);
const clique = (sel) => evalue(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
const remplis = (sel, valeur) => evalue(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const touche = (sel, key, extra = {}) => evalue(`(() => {
  const el = ${sel ? `document.querySelector(${JSON.stringify(sel)})` : 'window'};
  if (!el) return false;
  el.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true, ...${JSON.stringify(extra)} }));
  return true;
})()`);
const dateDite = (iso) => evalue(`(() => { const J = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche']; const M = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const d = new Date('${iso}T12:00:00'); return J[(d.getDay() + 6) % 7] + ' ' + (d.getDate() === 1 ? '1er' : d.getDate()) + ' ' + M[d.getMonth()] + ' ' + d.getFullYear(); })()`);

try {
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/calendrier'; location.reload(); true`);
  await attend(9000);

  /* ── 1. LE CALENDRIER : la distance, « Aujourd'hui », « Aller à… » ── */
  dit('le Calendrier dit sa distance : aujourd’hui', (await texte('.tr-distance')) === 'aujourd’hui', await texte('.tr-distance'));
  dit('« Aujourd’hui » ne paraît pas quand on y est', !(await evalue(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Aujourd’hui' && b.offsetParent !== null)`)));
  await clique('button[aria-label="Suivant"]');
  await attend(300);
  dit('un jour plus loin : demain', (await texte('.tr-distance')) === 'demain', await texte('.tr-distance'));
  dit('« Aujourd’hui » paraît dès qu’on s’en éloigne', await cliqueSur('Aujourd’hui'));
  await attend(300);
  dit('… et ramène à aujourd’hui', (await texte('.tr-distance')) === 'aujourd’hui', await texte('.tr-distance'));

  dit('« Aller à… » ouvre la barre', (await cliqueSur('Aller à…')) && (await visible('.tr-aller-pop')));
  await attend(200);
  dit('le champ a la main', await evalue(`document.activeElement?.id === 'calendrier-aller-a'`));
  await remplis('#calendrier-aller-a', 'blabla');
  await attend(150);
  dit('une phrase illisible se dit, sans aller nulle part', (await evalue(`document.querySelector('.tr-saut__lecture')?.classList.contains('is-ko')`)) === true, await texte('.tr-saut__lecture'));
  await remplis('#calendrier-aller-a', 'dans 3 semaines');
  await attend(150);
  const dans3 = jourPlus(21);
  const lecture = await texte('.tr-saut__lecture');
  dit('« dans 3 semaines » se relit en toutes lettres', lecture.toLowerCase().includes(await dateDite(dans3)) && lecture.includes('dans 3 semaines'), lecture);
  await photo('1-aller-a');
  await touche('#calendrier-aller-a', 'Enter');
  await attend(400);
  dit('Entrée y va et referme la barre', !(await visible('.tr-aller-pop')) && (await texte('.tr-distance')) === 'dans 3 semaines', await texte('.tr-distance'));
  await photo('2-calendrier-dans-3-semaines');

  /* ── 2. TROUVER COMPREND LES DATES ── */
  await touche(null, 'k', { ctrlKey: true });
  await attend(300);
  await remplis('.trf-box input', 'mar');
  await attend(250);
  dit('Trouver laisse « mar » à Mariette', !(await evalue(`[...document.querySelectorAll('.trf-group__name')].some((g) => g.textContent === 'Calendrier')`)));
  await remplis('.trf-box input', '12/12');
  await attend(250);
  const ligne = await evalue(`[...document.querySelectorAll('.trf-row__label')].map((x) => x.textContent).find((t) => t.startsWith('Ouvrir le Calendrier')) ?? ''`);
  dit('Trouver lit « 12/12 »', /^Ouvrir le Calendrier au \S+ 12 décembre \d{4}$/.test(ligne), ligne);
  await photo('3-trouver');
  await touche('.trf-box input', 'Enter');
  await attend(600);
  const hash = await evalue('location.hash');
  dit('Entrée ouvre le Calendrier sur ce jour', /#\/calendrier\?jour=\d{4}-12-12$/.test(hash), hash);
  const douze = hash.slice(-10);
  dit('… même déjà ouvert : l’écran suit l’adresse', (await texte('.tr-distance')) !== 'dans 3 semaines' && (await evalue(`document.body.innerText.includes('12')`)), await texte('.tr-distance'));

  /* ── 3. LE « + RDV » DE LA CLIENTE ── */
  await evalue(`location.hash = '#/customers'; true`);
  await attend(1500);
  dit('« + RDV » sur la ligne de la cliente', await cliqueSur('+ RDV'));
  await attend(900);
  if (!(await visible('.trc-rdv3__saut'))) { await cliqueSur('Changer le jour, l’heure ou le maître'); await attend(500); }
  dit('la barre « Aller à » vit dans Quand', await visible('#rdv-aller-a'));
  const sienne = await texte('.tr-saut__puce--sienne');
  dit('sa date, en cuivre, à une touche', /^Sa date · \S+ \d+ \S+$/.test(sienne), sienne);
  const nSem = await evalue(`document.querySelectorAll('.tr-fil__sem').length`);
  dit('le fil voit seize semaines', nSem === 16, nSem);
  dit('cette semaine est marquée et choisie', await evalue(`(() => { const s = document.querySelector('.tr-fil__sem'); return !!s?.querySelector('.tr-fil__barre.is-auj') && s.getAttribute('aria-pressed') === 'true'; })()`));
  dit('le rendez-vous du jour remplit la barre de cette semaine', await evalue(`parseFloat(document.querySelector('.tr-fil__sem .tr-fil__barre i')?.style.height ?? '0') > 0`), await evalue(`document.querySelector('.tr-fil__sem .tr-fil__barre i')?.style.height ?? 'aucune'`));
  dit('sa date est encadrée sur sa semaine', (await evalue(`document.querySelectorAll('.tr-fil__note.is-sienne').length`)) === 1);
  const enTete = () => evalue(`document.querySelector('.trc-rdv3__semaine-tete .tr-distance')?.textContent ?? ''`);
  dit('la semaine des places dit sa distance', (await enTete()) === 'cette semaine', await enTete());
  await evalue(`document.querySelector('.trc-rdv3__saut')?.scrollIntoView({ block: 'start' }); true`);
  await photo('4-rdv-quand');

  dit('« +3 sem »', await cliqueSur('+3 sem', `document.querySelector('.trc-rdv3__saut')`));
  await attend(400);
  dit('… ouvre la semaine dans 3 semaines, la touche enfoncée', (await enTete()) === 'dans 3 semaines'
    && (await evalue(`[...document.querySelectorAll('.tr-saut__puce')].find((b) => b.textContent === '+3 sem')?.getAttribute('aria-pressed')`)) === 'true', await enTete());
  dit('… et le fil suit', (await evalue(`[...document.querySelectorAll('.tr-fil__sem')].findIndex((b) => b.getAttribute('aria-pressed') === 'true')`)) === 3);
  await evalue(`document.querySelectorAll('.tr-fil__sem')[6].click(); true`);
  await attend(400);
  dit('une semaine du fil ouvre ses places', (await enTete()) === 'dans 6 semaines', await enTete());
  dit('« Aujourd’hui » ramène la semaine', await cliqueSur('Aujourd’hui', `document.querySelector('.trc-rdv3__nav')`));
  await attend(400);
  dit('… à cette semaine', (await enTete()) === 'cette semaine', await enTete());
  await remplis('#rdv-aller-a', 'samedi en huit');
  await attend(150);
  await touche('#rdv-aller-a', 'Enter');
  await attend(400);
  dit('Entrée dans la barre ne ferme ni ne pose le rendez-vous', (await visible('#rdv-aller-a'))
    && ((await evalue(`JSON.parse(localStorage.getItem('trone::mnd_appointments') || '[]').length`)) === 4));
  dit('« samedi en huit » ouvre sa semaine', ['dans 1 semaines', 'la semaine prochaine', 'dans 2 semaines'].includes(await enTete()), await enTete());
  dit('la cliente garde son nom à l’écran', await evalue(`document.body.innerText.includes('Sènami')`));

  /* ── 4. AU TÉLÉPHONE ── */
  await taille(390, 844, true);
  await attend(700);
  const deborde = await evalue(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  dit('au téléphone, rien ne déborde', deborde <= 0, deborde);
  dit('le fil défile dans son cadre', await evalue(`(() => { const c = document.querySelector('.tr-fil__cadre'); return !!c && c.scrollWidth > c.clientWidth; })()`));
  await evalue(`document.querySelector('.trc-rdv3__saut')?.scrollIntoView({ block: 'start' }); true`);
  await photo('5-telephone');

  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.join(' | '));
  void douze;
} finally {
  ws.close();
  chrome.kill();
  serveur.close();
  await attend(400);
  rmSync(construit, { recursive: true, force: true });
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore son profil */ }
}
console.log(ko ? `\n${ko} échec(s).` : '\nDans trois semaines tient à l’écran.');
process.exit(ko ? 1 : 0);
