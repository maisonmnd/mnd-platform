/* LE BANC DE « DEMANDER À PERLE » — `node scripts/banc-demander-a-perle.mjs [dossier des captures]`.

   21 novembre 2026, maquette 7XvdzJ99bioQsv62r5cBrw, premier lot : la
   direction seule, les questions et « En direct ». `verifie-demander-a-perle`
   éprouve les règles ; ce banc construit le VRAI Trône (connexion
   obligatoire, serveur Supabase injoignable), l'ouvre dans un vrai Chrome
   avec une session gardée, et regarde l'écran :

     1. la direction : l'entrée « Demander à Perle » est la première de la
        barre, Alt + P l'ouvre depuis un autre écran ;
     2. le fil « En direct » dit la journée fictive : l'argent entré, ce qui
        reste à encaisser, le fauteuil, la suite du jour, la conversation qui
        attend, les places, la suggestion sans réponse ;
     3. l'heure est celle de Cotonou sur un poste à l'heure de Chine ;
     4. sans la fonction (serveur injoignable), Perle le dit et ne répond
        pas : aucune réponse inventée ;
     5. un geste du fil ouvre son écran, rien d'autre ;
     6. un maître ne voit ni l'entrée ni l'écran ; le gérant, si.

   L'horloge de la page est figée au samedi 21 novembre 2026, 15 h 13 à
   Cotonou : le banc dit la même chose à toute heure. Toutes les données sont
   inventées : le dépôt est public. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const captures = process.argv[2] || '';
if (captures) mkdirSync(captures, { recursive: true });
/* `BANC_CONSTRUIT=<dossier>` : rejoue le banc sur un Trone deja construit (pour
   regler le banc lui-meme sans reconstruire a chaque essai) ; le dossier reste. */
const dejaConstruit = process.env.BANC_CONSTRUIT || '';
const construit = dejaConstruit || mkdtempSync(path.join(tmpdir(), 'banc-perle-'));
if (!dejaConstruit || !existsSync(path.join(construit, 'index.html'))) {
  console.log('Construction du Trone (serveur injoignable)...');
  execSync(`npx vite build --outDir "${construit}" --emptyOutDir --logLevel error`, {
    cwd: racine, stdio: 'ignore',
    env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_ALLOW_OPEN: 'false', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
  });
  renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));
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
const origine = `http://127.0.0.1:${serveur.address().port}`;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-perle-chrome-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
/* Le poste est à l'heure de Chine, comme l'ordinateur du bureau. */
await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });

let ko = 0;
/* La console Windows parle cp1252 : tout ce qui sort est ramené à l'ASCII. */
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`)); };
const photo = async (nom, l = 1360, h = 900, mobile = false, avant = '') => {
  if (!captures) return;
  await cdp('Emulation.setDeviceMetricsOverride', { width: l, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await attend(700);
  /* `avant` : amener un morceau de l'écran sous l'objectif, une fois la taille posée. */
  if (avant) { await evalue(avant); await attend(500); }
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(captures, `${nom}.png`), Buffer.from(img.result.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
};
/* Une espace insécable s'écrit dans les montants : le banc compare à l'espace près. */
const plat = (s) => String(s ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const texte = async (selecteur) => plat(await evalue(`(document.querySelector(${JSON.stringify(selecteur)})?.textContent || '')`));

/* ── L'HORLOGE FIGÉE : samedi 21 novembre 2026, 14 h 13 UTC = 15 h 13 à Cotonou = 22 h 13 en Chine ── */
const INSTANT = Date.UTC(2026, 10, 21, 14, 13, 0);
const JOUR = '2026-11-21';
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const Vraie = Date; const fige = ${INSTANT};
  class Figee extends Vraie { constructor(...a) { if (a.length === 0) super(fige); else super(...a); } static now() { return fige; } }
  globalThis.Date = Figee;
})();` });

/* ── LA SESSION GARDÉE, ET LA JOURNÉE FICTIVE ── */
const UID = 'u-banc-perle';
const CLE = 'sb-127-auth-token';
const session = (role) => {
  const le = new Date(INSTANT - 86_400_000).toISOString();
  return {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(INSTANT / 1000) - 7200,
      user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Direction du banc', role, rubrics: [] } },
  };
};
const GESTES = ['sv-souffle', 'sv-reprise'];
const tete = (cid, nom, phone) => ({ id: cid, branchId: 'maison', name: nom, phone, city: '', persona: '', since: '2026-01-10', segments: [] });
const rdv = (rid, cid, heure, status, plus = {}) => ({ id: rid, branchId: 'maison', clientId: cid, serviceIds: GESTES, date: JOUR, time: heure, status, master: 'Expert', ...plus });
const JOURNEE = {
  'trone::mnd_branches': [{ id: 'maison', name: 'Maison du banc', city: 'Cotonou', country: 'Bénin', dial: '+229', currency: 'XOF', address: '', seats: 2, masters: ['Expert', 'Team'], masterParDefaut: 'Expert', status: 'active', flagship: true }],
  'trone::mnd_current_branch': 'maison',
  'trone::mnd_cashboxes': [{ id: 'cb-t', branchId: 'maison', name: 'Terrasse · Tiroir espèces', sub: 'Espèces du comptoir', glyph: '◈', openingXof: 0, role: 'terrasse', equipe: true }],
  'trone::mnd_staff': [{ id: 'st-a', branchId: 'maison', name: 'Expert', role: 'Maître', partPourboire: 1, auFauteuil: true }],
  'trone::mnd_catalog_services': [
    { id: 'sv-souffle', categoryId: '', name: 'Souffle du banc', palier: 'Fondation', priceXof: 8000, durationMin: 30, hidePrice: false, sessions: 1, order: 1 },
    { id: 'sv-reprise', categoryId: '', name: 'Reprise du banc', palier: 'Fondation', priceXof: 20000, durationMin: 60, hidePrice: false, sessions: 1, order: 2 },
  ],
  'trone::mnd_clients': [tete('cl-ak', 'Awa Kossou', '0100000061'), tete('cl-cf', 'Chloé Fagbémi', '0100000062'), tete('cl-de', 'Danielle Eké', '0100000064'), tete('cl-eg', 'Eva Gomez', '0100000065'), tete('cl-fh', 'Fanta Houngbo', '0100000066')],
  'trone::mnd_appointments': [
    /* Au fauteuil depuis 14 h 45 (1 h 30), et donc à encaisser. */
    rdv('rdv-ak', 'cl-ak', '14:45', 'confirmé'),
    /* Honoré ce matin, sans pièce : à encaisser. */
    rdv('rdv-cf', 'cl-cf', '10:00', 'honoré'),
    /* Encore attendue. */
    rdv('rdv-de', 'cl-de', '17:00', 'confirmé'),
    /* Honoré et réglé : 28 000 F en espèces, 2 000 F de pourboire. */
    rdv('rdv-eg', 'cl-eg', '09:00', 'honoré', { invoiceId: 'inv-eg' }),
    /* Une suggestion de la Maison, sans réponse d'elle. */
    { id: 'rdv-fh', branchId: 'maison', clientId: 'cl-fh', serviceIds: GESTES, date: '2026-12-19', time: '10:00', status: 'confirmé', master: 'Expert', suggereLe: '2026-11-21T09:00:00.000Z', repriseDe: 'rdv-ancien' },
  ],
  'trone::mnd_invoices': [{
    id: 'inv-eg', branchId: 'maison', kind: 'facture', number: 'F-2026-0001', status: 'payée', date: JOUR, clientId: 'cl-eg', clientName: 'Eva Gomez', apptId: 'rdv-eg',
    lines: [{ id: 'l1', qty: 1, label: 'Souffle du banc', unitXof: 8000 }, { id: 'l2', qty: 1, label: 'Reprise du banc', unitXof: 20000 }],
    payments: [{ id: 'p1', amountXof: 28000, method: 'Espèces', date: JOUR, cashbox: 'Terrasse · Tiroir espèces' }], tipXof: 2000, globalDiscountPct: 0,
  }],
  'trone::mnd_payment_methods': ['MTN MoMo', 'Espèces', 'Carte', 'Chèque'],
  /* Elle a écrit il y a vingt minutes, personne n'a répondu. */
  'trone::mnd_messages_wa': [{ id: 'wa-banc-1', branchId: 'maison', sens: 'entrant', numero: '2290100000061', clientId: 'cl-ak', texte: 'Bonjour, avez-vous une place jeudi matin ?', type: 'text', quand: new Date(INSTANT - 20 * 60_000).toISOString() }],
};
/* Le rôle semé : la fausse session du banc (5 bis) rend la même ligne d'équipe. */
let roleDuBanc = 'souverain';
const seme = (role, avecLaJournee) => (roleDuBanc = role, evalue(`(() => {
  localStorage.setItem('mnd_reset_v5', '1');
  for (const [k, v] of Object.entries(${JSON.stringify(session(role))})) localStorage.setItem(k, JSON.stringify(v));
  ${avecLaJournee ? `for (const [k, v] of Object.entries(${JSON.stringify(JOURNEE)})) localStorage.setItem(k, JSON.stringify(v));` : ''}
  return true;
})()`));
const ouvre = async (hash) => { await evalue(`location.hash = ${JSON.stringify(hash)}; true`); await attend(1800); };
const lignes = () => evalue(`[...document.querySelectorAll('.trp-perle__direct .trp-perle__ligne')].map((l) => [l.querySelector('b')?.textContent ?? '', l.querySelector('span')?.textContent ?? '', l.querySelector('button')?.textContent ?? ''])`);

/* ── 1. LA DIRECTION ── */
await cdp('Page.navigate', { url: `${origine}/` });
await attend(2500);
await seme('souverain', true);
await evalue('location.reload()');
await attend(9000);
dit('le Trone s ouvre sur ses ecrans, session gardee', await evalue(`!!document.querySelector('.tr-top__sync, .tr-side')`));
const premier = await evalue(`(() => { const n = document.querySelector('.tr-nav'); const a = n?.firstElementChild; return a ? { classe: a.className, texte: a.textContent.replace(/\\s+/g, ' ').trim(), href: a.getAttribute('href') } : null; })()`);
dit('« Demander à Perle » est la premiere entree de la barre', !!premier && premier.classe.includes('tr-nav__perle') && premier.texte.startsWith('Demander à Perle') && String(premier.href).endsWith('/demander'), JSON.stringify(premier));
await ouvre('#/carnet');
dit('Alt + P ouvre Perle depuis le Carnet', await evalue(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: 'KeyP', key: 'p', bubbles: true })); return true; })()`));
await attend(2500);
dit('... l ecran « Demander à Perle » est la', (await evalue('location.hash')) === '#/demander' && (await texte('.trp-perle h2')) === 'Demander à Perle', `${await evalue('location.hash')} · ${await texte('.trp-perle h2')}`);

/* ── 2 et 3. EN DIRECT, À L'HEURE DE COTONOU ── */
dit('le moment est celui de Cotonou, sur un poste a l heure de Chine (22 h 13)', (await texte('.trp-perle__moment')) === 'En direct · samedi 21 novembre 2026, 15 h 13 à Cotonou' && (await evalue('new Date().getHours()')) === 22,
  `${await texte('.trp-perle__moment')} · poste ${await evalue('new Date().getHours()')} h`);
const fil = (await lignes()).map((l) => l.map(plat));
const ligne = (debut) => fil.find((l) => l[0].startsWith(debut)) ?? ['', '', ''];
dit('l argent entre aujourd hui, pourboires a part', ligne('Encaissé')[0] === 'Encaissé aujourd’hui : 28 000 F' && ligne('Encaissé')[1] === 'Pourboires à part : 2 000 F', ligne('Encaissé').join(' | '));
dit('ce qui reste a encaisser : le rituel au fauteuil et celui honore sans piece', ligne('À encaisser')[0] === 'À encaisser : 56 000 F' && ligne('À encaisser')[1] === '2 rituels commencés ou terminés, sans règlement', ligne('À encaisser').join(' | '));
dit('le fauteuil', ligne('Au fauteuil')[0] === 'Au fauteuil : 1' && ligne('Au fauteuil')[1] === 'Expert depuis 14 h 45', ligne('Au fauteuil').join(' | '));
dit('la suite du jour', ligne('Encore attendue')[0] === 'Encore attendue aujourd’hui : 1' && ligne('Encore attendue')[1] === '17 h', ligne('Encore attendue').join(' | '));
dit('la conversation qui attend, depuis vingt minutes', ligne('1 conversation')[0] === '1 conversation sans réponse' && ligne('1 conversation')[1] === 'La plus ancienne attend depuis 20 min', ligne('1 conversation').join(' | '));
dit('les places d aujourd hui, apres l heure qu il est a Cotonou', ligne('Places libres')[0] === 'Places libres aujourd’hui' && /^(15 h 30|16 h)/.test(ligne('Places libres')[1]) && ligne('Places libres')[1].endsWith('pour une heure'), ligne('Places libres').join(' | '));
dit('la suggestion sans reponse', ligne('1 rendez-vous')[0] === '1 rendez-vous suggéré sans réponse', ligne('1 rendez-vous').join(' | '));
dit('chaque fait a son geste, qui nomme un ecran', fil.map((l) => l[2]).join('|') === 'Voir La journée|Encaisser|Voir au Carnet|Voir au Carnet|Répondre|Voir au Carnet|Voir au Carnet', fil.map((l) => l[2]).join('|'));
await photo('perle-bureau');

/* ── 4. SANS LA FONCTION, ELLE NE RÉPOND PAS ── */
await attend(2500);
const refus = await texte('.trp-perle__refus');
dit('sans la fonction, Perle le dit', refus.startsWith('La fonction ia-maison n’est pas posée ou pas à jour'), refus.slice(0, 120));
dit('... le champ et les questions proposees se taisent, aucune reponse a l ecran',
  await evalue(`document.querySelector('#trp-perle-question')?.disabled === true && [...document.querySelectorAll('.trp-perle__puce')].length === 4 && [...document.querySelectorAll('.trp-perle__puce')].every((b) => b.disabled) && document.querySelectorAll('.trp-perle__elle').length === 0`));
dit('l accueil dit ce qu on peut demander', (await texte('.trp-perle__accueil h3')) === 'Que voulez-vous savoir ?');

/* ── 5. UN GESTE OUVRE SON ÉCRAN ── */
dit('« Encaisser » mene a la Caisse', await evalue(`(() => { const b = [...document.querySelectorAll('.trp-perle__ligne button')].find((x) => x.textContent.trim() === 'Encaisser'); if (b) b.click(); return !!b; })()`));
await attend(2500);
dit('... et a rien d autre : aucun rendez-vous ni piece n a change', (await evalue('location.hash')) === '#/caisse'
  && (await evalue(`JSON.stringify(JSON.parse(localStorage.getItem('trone::mnd_appointments')).map((a) => [a.id, a.status, a.date, a.time]))`)) === JSON.stringify(JOURNEE['trone::mnd_appointments'].map((a) => [a.id, a.status, a.date, a.time]))
  && (await evalue(`JSON.parse(localStorage.getItem('trone::mnd_invoices')).length`)) === 1, await evalue('location.hash'));
await ouvre('#/demander');
await photo('perle-telephone', 390, 844, true);

/* ── 5 bis. LA RÉPONSE PRÉPARÉE (second lot, 21 novembre 2026) ──────────
   Le banc joue la fonction `ia-maison` (il intercepte ses appels : la version
   au GET, le plan et le brouillon au POST) et regarde TOUTE la chaîne : le fil
   « En direct » qui propose de préparer, la question dite, la place vérifiée
   au Carnet, le brouillon, « Une autre », puis « Ouvrir dans la conversation »
   qui pose le texte signé dans la zone de saisie. Rien ne part : aucun appel
   à l'envoi, le fil des messages ne bouge pas. */
const DEVISE = /export const DEVISE_COMPLETE = '([^']+)'/.exec(readFileSync(path.join(racine, 'src/shared/identite.ts'), 'utf8'))?.[1] ?? '';
const appels = [];
const requetes = [];
let fauxPlan = { reponse: 'Rien à dire.', lectures: [] };
const BROUILLONS = [
  'Bonjour Madame Awa, la Maison a bien reçu votre message. Pourriez-vous nous dire quel soin vous souhaitez ?',
  'Bonjour Madame Awa, oui : le jeudi 26 novembre 2026 à 10 h est libre. Souhaitez-vous que la Maison vous garde cette place ?',
  'Avec plaisir, Madame Awa. La Maison peut vous recevoir le jeudi 26 novembre 2026 à 10 h. Cette heure vous convient-elle ?',
];
let rangDuBrouillon = 0;
/* Les avis Google du banc (5 ter), tous inventés : deux sans réponse, dont un de deux étoiles, et un déjà répondu. */
const ilYA = (jours) => new Date(INSTANT - jours * 86_400_000).toISOString();
const AVIS_DE_MAKE = { avis: Object.fromEntries([
  ['r-fatou', 'Fatou Dossou', 5, 'Un accueil parfait, mes locks n’ont jamais été aussi belles.', 2, ''],
  ['r-marc', 'Marc Hounsou', 2, 'Une heure d’attente malgré mon rendez-vous.', 5, ''],
  ['r-ines', 'Inès Akpo', 5, 'Merci à toute l’équipe.', 10, 'Merci, Inès, pour ces mots.'],
].map(([id, auteur, note, texte, jours, reponse]) => {
  const name = `accounts/1/locations/1/reviews/${id}`;
  return [name, { name, auteur, note, texte, creeLe: ilYA(jours), recuLe: ilYA(0), ...(reponse ? { reponse, reponduLe: ilYA(jours - 1) } : {}) }];
})) };
const RELEVE_DES_AVIS = { note: 4.9, nombre: 312, fiche: 'https://www.google.com/maps/place/?q=place_id:banc', avis: [] };
const REPONSES_AUX_AVIS = [
  'Merci infiniment, Fatou, pour ces mots. Prendre soin de vos locks est une joie pour la Maison. À très bientôt.',
  'Marc, nous regrettons cette attente, qui n’est pas à la hauteur de ce que la Maison vous doit. Nous serions heureux de vous recevoir de nouveau, à l’heure dite.',
  'Merci, Fatou. Vos mots touchent toute la Maison, et nous avons hâte de vous retrouver.',
];
let rangDeLAvis = 0;
const ENTETES = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' }, { name: 'Content-Type', value: 'application/json' }];
const rend = (requestId, code, corps) => cdp('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: ENTETES, body: Buffer.from(JSON.stringify(corps)).toString('base64') });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.method === 'Network.requestWillBeSent') requetes.push(`${m.params.request.method} ${m.params.request.url}`);
  if (m.method !== 'Fetch.requestPaused') return;
  void (async () => {
    const { requestId, request, networkId } = m.params;
    if (request.method === 'OPTIONS') return rend(requestId, 200, {});
    /* LA SESSION, COMME UN SERVEUR LA RENDRAIT. Avant d'appeler une fonction,
       le client Supabase renouvelle le jeton expiré de la session gardée ;
       sans réponse il réessaie « trente secondes » (une minute sous l'horloge
       figée du banc) et l'appel n'arrive jamais. Le banc répond donc au
       renouvellement, à « qui suis-je » et à la ligne d'équipe : le reste du
       serveur demeure injoignable, et les données restent celles de l'appareil. */
    if (/\/auth\/v1\/token/.test(request.url)) return rend(requestId, 200, { ...session(roleDuBanc)[CLE], access_token: 'faux-renouvele', refresh_token: 'faux-renouvele', expires_at: Math.floor(INSTANT / 1000) + 3600 });
    if (/\/auth\/v1\/user/.test(request.url)) return rend(requestId, 200, session(roleDuBanc)[CLE].user);
    /* Une ligne seule (`maybeSingle`) : l'objet si le client le demande ainsi, sinon la liste d'une ligne. */
    const uneLigne = (ligne) => rend(requestId, 200, /vnd\.pgrst\.object/.test(Object.entries(request.headers ?? {}).find(([k]) => k.toLowerCase() === 'accept')?.[1] ?? '') ? ligne : [ligne]);
    if (/\/rest\/v1\/staff/.test(request.url)) return uneLigne({ user_id: UID, name: 'Direction du banc', role: roleDuBanc, rubrics: [] });
    /* LES AVIS GOOGLE (5 ter) : le relevé de Places et les avis que Make apporte, deux documents. */
    if (/\/rest\/v1\/documents/.test(request.url)) {
      const cle = /key=eq\.([\w-]+)/.exec(request.url)?.[1];
      if (request.method === 'GET' && cle === 'mnd_avis_google_tous') return uneLigne({ data: AVIS_DE_MAKE });
      if (request.method === 'GET' && cle === 'mnd_avis_google') return uneLigne({ data: RELEVE_DES_AVIS, updated_at: new Date(INSTANT).toISOString() });
      return cdp('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' });
    }
    if (request.method !== 'POST') return rend(requestId, 405, { error: 'method', version: '2026-11-21-b' });
    let brut = request.postData;
    if (brut === undefined && networkId) brut = (await cdp('Network.getRequestPostData', { requestId: networkId })).result?.postData;
    let d = {}; try { d = JSON.parse(brut ?? '{}'); } catch { /* illisible : le banc le verra à ses appels */ }
    appels.push(d);
    if (d.chantier === 'avis') return rend(requestId, 200, { ok: true, data: { langue: 'fr', reponse: REPONSES_AUX_AVIS[Math.min(rangDeLAvis++, REPONSES_AUX_AVIS.length - 1)] }, texte: '', modele: 'claude-haiku-5-5', coutUsd: 0.005, resteUsd: 100 });
    if (d.chantier === 'reponse-wa') return rend(requestId, 200, { ok: true, data: { reponse: BROUILLONS[Math.min(rangDuBrouillon++, BROUILLONS.length - 1)] }, texte: '', modele: 'claude-haiku-5-5', coutUsd: 0.004, resteUsd: 100 });
    return rend(requestId, 200, { ok: true, data: fauxPlan, texte: '', modele: 'claude-haiku-5-5', coutUsd: 0.003, resteUsd: 100 });
  })();
});
await cdp('Network.enable');
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/functions/v1/ia-maison*' }, { urlPattern: '*/auth/v1/token*' }, { urlPattern: '*/auth/v1/user*' }, { urlPattern: '*/rest/v1/staff*' }] });
await evalue('location.reload()');
await attend(9000);
await ouvre('#/demander');
await attend(2500);
const clique = (selecteur, libelle) => evalue(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.trim() === ${JSON.stringify(libelle)}); if (b) b.click(); return !!b; })()`);
const carte = () => evalue(`(() => { const e = [...document.querySelectorAll('.trp-perle__echange')].pop(); const c = e?.querySelector('.trp-perle__brouillon'); const t = (s) => (c?.querySelector(s)?.textContent ?? '');
  return { question: e?.querySelector('.trp-perle__moi')?.textContent ?? '', dit: e?.querySelector('.trp-perle__elle > p')?.textContent ?? '', etat: c?.getAttribute('data-brouillon') ?? null,
    etiquette: t('.trp-perle__etiquette'), note: t('.trp-perle__source'), cite: t('.trp-perle__cite'), verif: t('.trp-perle__verif'), alerte: !!c?.querySelector('.trp-perle__verif.is-alerte'), texte: t('.trp-perle__texte'), devise: t('.trp-perle__devise'),
    boutons: [...(c?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim()), pied: [...(e?.querySelectorAll('.trp-perle__elle > .trp-perle__source') ?? [])].map((p) => p.textContent).join(' | ') }; })()`);
const contexte = (n) => String(appels[n]?.messages?.[0]?.content ?? '');
const NOMS_ENTIERS = /Kossou|0100000061|2290100000061/;
dit('avec la fonction, le champ de Perle s ouvre', await evalue(`document.querySelector('#trp-perle-question')?.disabled === false`),
  `${await evalue('location.hash')} · ${plat(await evalue(`JSON.stringify({ perle: !!document.querySelector('.trp-perle'), champ: document.querySelector('#trp-perle-question')?.disabled ?? null, refus: document.querySelector('.trp-perle__refus')?.textContent ?? '', corps: (document.querySelector('.trp-perle') ?? document.querySelector('main') ?? document.body).innerText.slice(0, 300) })`))} · ia-maison : ${requetes.filter((u) => /ia-maison|auth\/v1/.test(u)).map((u) => u.replace(/^(\w+) https?:\/\/[^/]+/, '$1 ')).join(', ')}`);

/* Une lettre accentuée posée SANS touche (une dictée, un clavier de téléphone,
   l'outil de Chrome à l'essai réel du 21 novembre) : le curseur reste à sa place. */
await evalue(`document.querySelector('#trp-perle-question').focus(); true`);
const touche = async (ch) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ch }); };
for (const ch of 'abc d') await touche(ch);
await cdp('Input.insertText', { text: 'é' });
for (const ch of 'f ghi') await touche(ch);
await attend(300);
const tape = await evalue(`(() => { const i = document.querySelector('#trp-perle-question'); return { v: i.value, c: i.selectionStart }; })()`);
dit('une lettre accentuee posee sans touche garde le curseur a sa place', tape?.v === 'abc déf ghi' && tape?.c === 11, JSON.stringify(tape));
const ecris = (t) => evalue(`(() => { const i = document.querySelector('#trp-perle-question'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(t)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await ecris('');

/* a. Depuis « En direct » : la conversation qui attend, sans consigne. */
dit('le fil En direct propose de preparer la reponse a la conversation qui attend', await clique('.trp-perle__ligne button', 'Préparer une réponse'));
await attend(3000);
let c = await carte();
dit('... un seul appel, par la porte des reponses ; ni plan, ni envoi', appels.length === 1 && appels[0].chantier === 'reponse-wa' && appels[0].usage === 'texte' && !!appels[0].schema,
  `${JSON.stringify(appels.map((a) => a.chantier))} · refus : ${await texte('.trp-perle__refus')} · attente : ${await texte('.trp-perle__attente')} · ${JSON.stringify(c).slice(0, 300)}`);
dit('... le contexte : la cliente en prenom et initiale, son message, l agenda non consulte, aucune consigne',
  contexte(0).includes('La cliente : Awa K.') && contexte(0).includes('Elle : Bonjour, avez-vous une place jeudi matin ?') && contexte(0).includes('Agenda : non consulté') && !contexte(0).includes('LA DIRECTION'), contexte(0).slice(0, 160));
dit('... ni son nom entier ni son numero ne partent', !NOMS_ENTIERS.test(JSON.stringify(appels[0])));
dit('... les reperes de temps : quand elle a ecrit, l heure qu il est a Cotonou (un moment passe ne s annonce pas comme a venir)',
  contexte(0).includes('REPÈRES DE TEMPS : son dernier message date du samedi 21 novembre 2026 à 14 h 53 ; nous sommes le samedi 21 novembre 2026, 15 h 13 à Cotonou.') && contexte(0).includes('ne s’annonce jamais comme à venir'), contexte(0).slice(-420));
dit('la carte : son dernier message a l heure de Cotonou, le brouillon, la devise du code', plat(c.etiquette) === 'Awa Kossou · son dernier message · 14 h 53' && plat(c.cite) === '« Bonjour, avez-vous une place jeudi matin ? »' && c.texte === BROUILLONS[0] && c.devise.endsWith(DEVISE) && c.devise.includes('Maison MND') && DEVISE.length > 10,
  JSON.stringify([c.etiquette, c.cite, c.texte.slice(0, 40), c.devise]));
dit('... sans place citee, rien a verifier ; trois gestes, aucun « Envoyer »', c.verif === '' && c.boutons.join('|') === 'Ouvrir dans la conversation|Une autre|Écarter', `${c.verif} · ${c.boutons.join('|')}`);
dit('... ce que Perle garde de l echange nomme la cliente en prenom et initiale', c.question === 'Prépare la réponse à la conversation qui attend.' && c.dit === 'J’ai préparé une réponse pour Awa K. : elle se relit et s’envoie depuis sa conversation.', `${c.question} · ${c.dit}`);
dit('« Écarter » : le brouillon s efface, rien n est parti', await clique('.trp-perle__brouillon button', 'Écarter') && (await attend(600), (await carte()).etat === null) && (await carte()).pied.includes('Brouillon écarté. Rien n’est parti.'), (await carte()).pied);
dit('... et le fil En direct la propose de nouveau : un brouillon ecarte ne retire pas la conversation', (await evalue(`[...document.querySelectorAll('.trp-perle__ligne button')].some((b) => b.textContent.trim() === 'Préparer une réponse')`)));

/* b. La question dite : « Réponds à … que jeudi 10 h est libre ». */
fauxPlan = { reponse: '', lectures: [], message: { cliente: 'Awa K.', consigne: 'jeudi 10 h est libre', jour: '2026-11-26', heure: '10:00' } };
await ecris('Réponds à Awa Kossou que jeudi 10 h est libre');
await attend(300);
await evalue(`document.querySelector('.trp-perle__champ').requestSubmit(); true`);
await attend(3500);
c = await carte();
dit('la question part au plan anonymisee, avec la regle des messages et les tours d avant', appels.length === 3 && appels[1].chantier === 'question' && appels[1].messages.at(-1).content === 'Réponds à Awa K. que jeudi 10 h est libre'
  && String(appels[1].systeme).includes('RÉPONDRE À UNE CLIENTE') && !!appels[1].schema?.properties?.message && appels[1].messages.length === 3 && !NOMS_ENTIERS.test(JSON.stringify(appels[1])),
JSON.stringify(appels.map((a) => a.chantier)) + ' · ' + JSON.stringify(appels[1]?.messages?.map((m) => m.content.slice(0, 50))));
dit('le brouillon : la place verifiee au Carnet part dans le contexte, la consigne de la direction a la suite', appels[2]?.chantier === 'reponse-wa'
  && contexte(2).includes('Prochaines places libres (les seules que tu peux proposer) : jeudi 26 novembre 2026 à 10:00.')
  && contexte(2).includes('LA DIRECTION, qui relira ce message et l’enverra elle-même, demande que la réponse dise ceci : « jeudi 10 h est libre ».') && !NOMS_ENTIERS.test(JSON.stringify(appels[2])), contexte(2).slice(-330));
dit('la carte dit ce que le Carnet montre', plat(c.verif) === 'Vérifié au Carnet : jeudi 26 novembre 2026, 10 h 00 est libre pour un rituel d’une heure.' && !c.alerte && c.texte === BROUILLONS[1], `${c.verif} · ${c.texte.slice(0, 50)}`);
dit('... et ce que les deux appels ont coute', plat(c.pied).includes('Cette réponse : 0,7 ¢.'), c.pied);
dit('... et d ou elle vient : sa conversation, pas le fil En direct', plat(c.pied).includes('Lu dans : sa conversation, sa fiche et le catalogue.'), c.pied);
const versLaCarte = `[...document.querySelectorAll('.trp-perle__brouillon')].pop()?.scrollIntoView({ block: 'center' }); true`;
await photo('perle-brouillon', 1360, 900, false, versLaCarte);
await photo('perle-brouillon-telephone', 390, 844, true, versLaCarte);

/* c. « Une autre » : le même fil, la même consigne, la proposition d'avant dite à Claude. */
dit('« Une autre » redemande', await clique('.trp-perle__brouillon button', 'Une autre'));
await attend(3000);
c = await carte();
dit('... sur le meme fil, avec la consigne, la place, et la proposition ecartee', appels.length === 4 && appels[3].chantier === 'reponse-wa' && contexte(3).includes(`Une proposition a déjà été écartée, écris-en une autre, différente : « ${BROUILLONS[1]} ».`)
  && contexte(3).includes('« jeudi 10 h est libre »') && contexte(3).includes('jeudi 26 novembre 2026 à 10:00') && c.texte === BROUILLONS[2] && plat(c.pied).includes('Cette réponse : 1,1 ¢.'), `${appels.length} · ${c.texte.slice(0, 40)} · ${c.pied}`);
dit('... la carte reste une seule carte, dans le meme echange', (await evalue(`document.querySelectorAll('.trp-perle__brouillon').length`)) === 1 && (await evalue(`document.querySelectorAll('.trp-perle__echange').length`)) === 2);

/* d. LE SEUL CHEMIN : la zone de saisie de la conversation, signée par le code. */
dit('« Ouvrir dans la conversation »', await clique('.trp-perle__brouillon button', 'Ouvrir dans la conversation'));
await attend(4000);
const saisie = await evalue(`document.querySelector('.trc-saisie__texte')?.value ?? null`);
/* « /conversations » mène à l'écran des conversations d'aujourd'hui (« /gerard?…&vue=conversations ») : le fil est celui de son numéro. */
dit('... ouvre SA conversation, le brouillon dans la zone de saisie, signe par le code (la signature que la carte montrait)',
  /^#\/(conversations|gerard)\?/.test(String(await evalue('location.hash'))) && String(await evalue('location.hash')).includes('n=2290100000061') && saisie === `${BROUILLONS[2]}\n\n${c.devise}` && String(saisie).endsWith(DEVISE),
  `${await evalue('location.hash')} · ${JSON.stringify(saisie)?.slice(0, 200)}`);
dit('... et RIEN N EST PARTI : aucun appel a l envoi, le fil garde son seul message', !requetes.some((u) => /whatsapp-envoi/.test(u)) && (await evalue(`JSON.parse(localStorage.getItem('trone::mnd_messages_wa')).length`)) === 1,
  requetes.filter((u) => /functions\/v1/.test(u)).map((u) => u.split('/functions/v1/')[1]).join(', '));
await photo('perle-conversation-ouverte');
await ouvre('#/demander');
await attend(1500);
c = await carte();
dit('de retour chez Perle, la carte dit qu elle est ouverte dans la conversation', c.etat === 'ouvert' && c.boutons[0] === 'Rouvrir dans la conversation' && c.note.includes('Ouverte dans la conversation'), `${c.etat} · ${c.boutons.join('|')}`);

/* ── 5 ter. LA RÉPONSE À UN AVIS GOOGLE (second lot) ────────────────────
   Le banc sert maintenant les deux documents des avis. « En direct » dit
   ceux qui attendent ; « Préparer une réponse » range un brouillon dans le
   document des brouillons (le geste de l'écran des avis) ; la carte mène à
   CET avis. Rien n'est publié, écarté ni collé depuis l'écran de Perle. */
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/functions/v1/ia-maison*' }, { urlPattern: '*/auth/v1/token*' }, { urlPattern: '*/auth/v1/user*' }, { urlPattern: '*/rest/v1/staff*' }, { urlPattern: '*/rest/v1/documents*key=eq.mnd_avis_google*' }] });
await evalue('location.reload()');
await attend(9000);
await ouvre('#/demander');
await attend(4000);
const ligneDesAvis = () => evalue(`(() => { const l = [...document.querySelectorAll('.trp-perle__ligne')].find((x) => /avis Google/.test(x.querySelector('b')?.textContent ?? '')); return l ? [l.querySelector('b').textContent, l.querySelector('span').textContent, ...[...l.querySelectorAll('button')].map((b) => b.textContent.trim())] : null; })()`);
const carteDAvis = () => evalue(`(() => { const e = [...document.querySelectorAll('.trp-perle__echange')].pop(); const c = e?.querySelector('.trp-perle__brouillon[data-avis]'); const t = (s) => (c?.querySelector(s)?.textContent ?? '');
  return { question: e?.querySelector('.trp-perle__moi')?.textContent ?? '', dit: e?.querySelector('.trp-perle__elle > p')?.textContent ?? '', etat: c?.getAttribute('data-avis') ?? null,
    etiquettes: [...(c?.querySelectorAll('.trp-perle__etiquette') ?? [])].map((p) => p.textContent), cite: t('.trp-perle__cite'), alerte: t('.trp-perle__verif.is-alerte'), texte: t('.trp-perle__texte'), note: t('.trp-perle__source'),
    boutons: [...(c?.querySelectorAll('button') ?? [])].map((b) => b.textContent.trim()), pied: [...(e?.querySelectorAll('.trp-perle__elle > .trp-perle__source') ?? [])].map((p) => p.textContent).join(' | ') }; })()`);
const brouillonsRanges = () => evalue(`JSON.parse(localStorage.getItem('trone::mnd_ia_avis_brouillons') || '{}')`);
const SIGNATURE = 'L’équipe de la Maison MND';
let l = await ligneDesAvis();
dit('En direct dit les avis recents sans reponse (l avis deja repondu n y compte pas), et propose de preparer', JSON.stringify(l) === JSON.stringify(['2 avis Google sans réponse', 'Arrivés dans les trente derniers jours', 'Voir les avis', 'Préparer une réponse']), JSON.stringify(l));
const avant5ter = appels.length;
dit('« Préparer une réponse », sur la ligne des avis', await evalue(`(() => { const l = [...document.querySelectorAll('.trp-perle__ligne')].find((x) => /avis Google/.test(x.querySelector('b')?.textContent ?? '')); const b = l?.querySelector('.trp-perle__preparer'); if (b) b.click(); return !!b; })()`));
await attend(3500);
let ca = await carteDAvis();
dit('... un seul appel, par le chantier des avis ; le prenom seul part, pas le nom', appels.length === avant5ter + 1 && appels.at(-1).chantier === 'avis' && !/Dossou/.test(JSON.stringify(appels.at(-1))) && JSON.stringify(appels.at(-1)).includes('Fatou'),
  `${JSON.stringify(appels.slice(avant5ter).map((a) => a.chantier))} · refus : ${await texte('.trp-perle__refus')} · ${String(appels.at(-1)?.messages?.[0]?.content ?? '').slice(0, 200)}`);
dit('la carte : le plus recent des avis qui attendent, son texte, la reponse signee de la Maison', ca.etat === 'prete' && plat(ca.etiquettes[0]) === 'Avis de Fatou Dossou · 5 étoiles · 19 novembre 2026' && plat(ca.cite) === '« Un accueil parfait, mes locks n’ont jamais été aussi belles. »'
  && ca.texte === `${REPONSES_AUX_AVIS[0]}\n\n${SIGNATURE}` && ca.alerte === '' && ca.etiquettes[1] === 'La réponse préparée', JSON.stringify([ca.etat, ca.etiquettes, ca.cite, ca.texte.slice(-60)]));
dit('... rangee dans Les avis Google ; ses gestes : ouvrir, une autre, le suivant ; aucun « Publier »', ca.note.startsWith('Rangée dans Les avis Google') && ca.boutons.join('|') === 'Ouvrir dans les avis Google|Une autre|Le suivant (1 sans réponse)', `${ca.note} · ${ca.boutons.join('|')}`);
dit('... ce que Perle garde de l echange : le prenom, l ecran, le cout', ca.question === 'Prépare la réponse à l’avis qui attend.' && ca.dit === 'J’ai préparé une réponse pour l’avis de Fatou : elle se relit et se publie depuis Les avis Google.' && plat(ca.pied) === 'Lu dans : Les avis Google. Cette réponse : 0,5 ¢.', `${ca.dit} · ${ca.pied}`);
let rg = await brouillonsRanges();
dit('le brouillon est range dans le document des brouillons, ni publie ni ecarte', rg['g-r-fatou']?.reponse === `${REPONSES_AUX_AVIS[0]}\n\n${SIGNATURE}` && !rg['g-r-fatou'].publieeLe && !rg['g-r-fatou'].ecarte && !rg['g-r-fatou'].enCours && Object.keys(rg).length === 1, JSON.stringify(rg).slice(0, 260));
l = await ligneDesAvis();
dit('En direct suit : une reponse a relire, deux avis attendent encore', JSON.stringify(l?.slice(0, 3)) === JSON.stringify(['1 réponse aux avis Google à relire', '2 avis des trente derniers jours attendent une réponse', 'Relire les réponses']), JSON.stringify(l));
await photo('perle-avis', 1360, 900, false, `[...document.querySelectorAll('.trp-perle__brouillon')].pop()?.scrollIntoView({ block: 'center' }); true`);

dit('« Le suivant » : l avis de deux etoiles', await clique('.trp-perle__brouillon[data-avis] button', 'Le suivant (1 sans réponse)'));
await attend(3500);
ca = await carteDAvis();
dit('... sa carte dit de le relire de pres, et plus rien n attend derriere', plat(ca.etiquettes[0]) === 'Avis de Marc Hounsou · 2 étoiles · 16 novembre 2026' && ca.alerte.startsWith('Avis de 2 étoiles : la réponse reconnaît sans se justifier.')
  && ca.texte === `${REPONSES_AUX_AVIS[1]}\n\n${SIGNATURE}` && ca.boutons.join('|') === 'Ouvrir dans les avis Google|Une autre', JSON.stringify([ca.etiquettes[0], ca.alerte, ca.boutons]));
/* Dans le DERNIER échange : la carte de Fatou, plus haut, porte aussi « Une autre ». */
const cliqueDansLeDernier = (libelle) => evalue(`(() => { const e = [...document.querySelectorAll('.trp-perle__echange')].pop(); const b = [...(e?.querySelectorAll('.trp-perle__brouillon button') ?? [])].find((x) => x.textContent.trim() === ${JSON.stringify(libelle)}); if (b) b.click(); return !!b; })()`);
dit('« Une autre » remplace le brouillon de CET avis, dans la meme carte, sans toucher celui d a cote', await cliqueDansLeDernier('Une autre') && (await attend(3500), true)
  && (ca = await carteDAvis()).texte === `${REPONSES_AUX_AVIS[2]}\n\n${SIGNATURE}` && plat(ca.pied).includes('Cette réponse : 1,0 ¢.') && (rg = await brouillonsRanges())['g-r-marc']?.reponse === `${REPONSES_AUX_AVIS[2]}\n\n${SIGNATURE}`
  && rg['g-r-fatou']?.reponse === `${REPONSES_AUX_AVIS[0]}\n\n${SIGNATURE}`, `${ca.texte.slice(0, 50)} · ${ca.pied} · refus : ${await texte('.trp-perle__refus')}`);

/* La question dite : un avis qui a déjà sa réponse ne se prépare pas. */
fauxPlan = { reponse: '', lectures: [], avis: { auteur: 'Inès' } };
const avantInes = appels.length;
await ecris('Réponds à l’avis d’Inès');
await attend(300);
await evalue(`document.querySelector('.trp-perle__champ').requestSubmit(); true`);
await attend(3000);
ca = await carteDAvis();
dit('un avis deja repondu : Perle le dit, n ecrit rien, et mene a l avis', appels.length === avantInes + 1 && appels.at(-1).chantier === 'question' && String(appels.at(-1).systeme).includes('RÉPONDRE À UN AVIS GOOGLE')
  && ca.etat === null && ca.dit === 'L’avis d’Inès a déjà sa réponse sur Google.' && (await evalue(`[...document.querySelectorAll('.trp-perle__echange')].pop().querySelector('.trp-perle__gestes button')?.textContent`)) === 'Ouvrir cet avis', `${ca.dit} · ${appels.slice(avantInes).map((a) => a.chantier).join(',')}`);

/* Une réponse retouchée dans Les avis Google ne se remplace pas d'ici. */
await evalue(`(() => { const k = 'trone::mnd_ia_avis_brouillons'; const d = JSON.parse(localStorage.getItem(k)); d['g-r-fatou'].reponse = 'Merci Fatou, à bientôt.'; localStorage.setItem(k, JSON.stringify(d)); return true; })()`);
await evalue('location.reload()');
await attend(9000);
await ouvre('#/demander');
await attend(4000);
const retouchee = await evalue(`(() => { const c = [...document.querySelectorAll('.trp-perle__brouillon[data-avis]')].find((x) => /Fatou/.test(x.textContent)); return c ? { etat: c.getAttribute('data-avis'), texte: c.querySelector('.trp-perle__texte').textContent, boutons: [...c.querySelectorAll('button')].map((b) => b.textContent.trim()) } : null; })()`);
dit('une reponse retouchee dans Les avis Google se montre telle quelle, et « Une autre » disparait', retouchee?.etat === 'retouchee' && retouchee.texte === 'Merci Fatou, à bientôt.' && retouchee.boutons.join('|') === 'Ouvrir dans les avis Google', JSON.stringify(retouchee));

dit('« Ouvrir dans les avis Google » mene a CET avis', await evalue(`(() => { const c = [...document.querySelectorAll('.trp-perle__brouillon[data-avis]')].find((x) => /Marc/.test(x.textContent)); const b = [...(c?.querySelectorAll('button') ?? [])].find((x) => x.textContent.trim() === 'Ouvrir dans les avis Google'); if (b) b.click(); return !!b; })()`)
  && (await attend(3500), true) && /vue=avis/.test(String(await evalue('location.hash'))) && String(await evalue('location.hash')).includes('avis=g-r-marc'), await evalue('location.hash'));
rg = await brouillonsRanges();
dit('... et RIEN N EST PUBLIE : aucun brouillon marque publie, colle ou ecarte', Object.values(rg).every((b) => !b.publieeLe && !b.ecarte && !b.parLeTrone) && Object.keys(rg).sort().join(',') === 'g-r-fatou,g-r-marc', JSON.stringify(Object.keys(rg)));
await ouvre('#/demander');
await attend(1500);

/* ── 6. LA PORTE ── */
const pour = async (role) => {
  await seme(role, false);
  await evalue('location.reload()');
  await attend(9000);
  const entree = await evalue(`!!document.querySelector('.tr-nav__perle')`);
  await ouvre('#/demander');
  await attend(1200);
  return { entree, ecran: await evalue(`!!document.querySelector('.trp-perle__direct')`), hash: await evalue('location.hash') };
};
const maitre = await pour('maitre');
dit('un maitre ne voit ni l entree ni l ecran', !maitre.entree && !maitre.ecran, JSON.stringify(maitre));
dit('... et Alt + P ne l y mene pas', await evalue(`(() => { window.dispatchEvent(new KeyboardEvent('keydown', { altKey: true, code: 'KeyP', key: 'p', bubbles: true })); return true; })()`) && (await attend(1500), !(await evalue(`!!document.querySelector('.trp-perle__direct')`))));
const gerant = await pour('gerant');
dit('le gerant, si : la direction', gerant.entree && gerant.ecran && gerant.hash === '#/demander', JSON.stringify(gerant));

dit('aucune erreur dans la page', erreurs.length === 0, erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
console.log(ko === 0 ? '\nDemander a Perle tient : la direction seule, En direct juste, a l heure de Cotonou.' : `\n${ko} controle(s) en echec.`);

ws.close();
chrome.kill();
await new Promise((r) => serveur.close(r));
await attend(500);
try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore un fichier */ }
if (!dejaConstruit) { try { rmSync(construit, { recursive: true, force: true }); } catch { /* idem */ } }
process.exit(ko === 0 ? 0 : 1);
