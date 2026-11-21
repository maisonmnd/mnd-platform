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
     - au téléphone, rien ne déborde ;
     - AUJOURD'HUI, REFAIT (21 novembre 2026, maquette Jrj9rfdYAYPDPDS1aT4EFs) :
       la pastille de Perle, trois cartes, la liste de ce qu'elle écrit
       (cinq lignes, le reste se déplie), « Pourquoi ce message » replié,
       « Déjà parti aujourd'hui » replié ; Pause ou Actif, le plafond et les
       modèles se lisent dans la vue « Réglages ».

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
    /* LE FOYER (27 octobre 2026) : une enfant sans numéro, son anniversaire aujourd'hui, et le parent qui paie. */
    fiche('c-parent', 'H. P.', { familyId: 'fam-p' }),
    fiche('c-enfant', 'A. P.', { familyId: 'fam-p', birthday: `2016-${date(0).slice(5)}`, phone: '', nouvelles: undefined }),
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
    'trone::mnd_families': [{ id: 'fam-p', branchId: 'maison', name: 'Famille P.', payerClientId: 'c-parent' }],
  };
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/gerard'; location.reload(); true`);
  const vu = await jusqua(`document.querySelectorAll('.trc-auj__rangee').length > 0`, 40000);
  /* AUJOURD'HUI, REFAIT (21 novembre 2026) : cinq lignes d'abord, le reste se déplie ; une ligne
     s'ouvre par son bouton, le nom dans `.trc-auj__qui`, la situation dans `.trc-auj__motif`. */
  const deplie = async () => { if (await evalue(String.raw`(() => { const p = document.querySelector('.trc-auj__plus[aria-expanded="false"]'); if (p) p.click(); return !!p; })()`)) await attend(300); };
  const ouvreLaLigneDe = (nom) => evalue(`(() => { const b = [...document.querySelectorAll('.trc-auj__ouvre')].find((x) => x.querySelector('.trc-auj__qui')?.textContent === ${JSON.stringify(nom)}); if (b && b.getAttribute('aria-expanded') !== 'true') b.click(); return !!b; })()`);
  const lesLignes = () => evalue(String.raw`[...document.querySelectorAll('.trc-auj__rangee')].map((b) => [b.querySelector('.trc-auj__qui')?.textContent, (b.querySelector('.trc-auj__motif')?.textContent || '').trim(), (b.querySelector('.trc-auj__fin')?.textContent || '').trim()])`);
  const lePanneau = () => evalue(String.raw`(document.querySelector('.trc-ger__panneau')?.innerText || '').replace(/\s+/g, ' ')`);
  const pastille = () => evalue(String.raw`(() => { const p = document.querySelector('.trc-auj__perle'); return p ? [p.querySelector('span')?.textContent, (p.querySelector('button')?.textContent || '').trim()] : null; })()`);
  const cartes = () => evalue(String.raw`[...document.querySelectorAll('.trc-auj__carte')].map((c) => [c.querySelector('b')?.textContent, c.querySelector('strong')?.textContent])`);

  /* 1. La rubrique. */
  dit('Gérard s ouvre, comme la direction', !!vu && !(await tombe()));
  const barre = await evalue(String.raw`[...document.querySelectorAll('.tr-nav__item')].map((a) => a.textContent.replace(/\s+/g, ' ').trim())`);
  const iClientes = (barre ?? []).findIndex((t) => t.startsWith('Clientes'));
  dit('la barre : « Conversations » juste sous « Clientes », allumé', iClientes >= 0 && String(barre[iClientes + 1]).startsWith('Conversations')
    && !!(await evalue(String.raw`[...document.querySelectorAll('.tr-nav__item.active')].some((a) => a.textContent.trim().startsWith('Conversations'))`)), JSON.stringify(barre?.slice(Math.max(0, iClientes), iClientes + 2)));
  dit('en pause, la pastille le dit, avec « Reprendre » pour la direction', JSON.stringify(await pastille()) === JSON.stringify(['Perle est en pause', 'Reprendre']), JSON.stringify(await pastille()));

  /* 2. Le plan du jour. */
  await deplie();
  const lignes = await lesLignes();
  const genreDe = (nom) => (lignes ?? []).find((l) => l[0] === nom)?.[1] ?? '';
  /* Du 15 novembre au 15 décembre (`NOEL_DU`, `NOEL_AU` de gerard-pur), le mot de Noël passe devant l'envie du fil. */
  const enFetes = date(0).slice(5) >= '11-15' && date(0).slice(5) <= '12-15';
  dit('le plan donne à chacune sa situation', /^Garder son RDV/.test(genreDe('G. A.')) && /^Anniversaire/.test(genreDe('N. B.')) && (enFetes ? /^Noël/ : /^Une envie du fil/).test(genreDe('P. O.'))
    && /^En retard/.test(genreDe('M. D.')) && /^Une seule venue/.test(genreDe('C. U.')) && /^Endormie/.test(genreDe('F. S.')), JSON.stringify(lignes));
  dit('... garder d abord, l anniversaire porte son code de 10 %', (lignes ?? [])[0]?.[0] === 'G. A.' && /−10 %/.test(genreDe('N. B.')), JSON.stringify((lignes ?? []).slice(0, 2)));
  const tete = await evalue(String.raw`(document.querySelector('.trc-auj__tete h3')?.textContent || '').trim()`);
  dit('la tête de la liste : sept messages prêts (six et la carte de l enfant) ; trois cartes, rien à envoyer en pause', tete === 'En pause · 7 messages prêts'
    && JSON.stringify(await cartes()) === JSON.stringify([['0', 'À répondre'], ['0', 'À envoyer'], ['0', 'À reprogrammer']]), JSON.stringify([tete, await cartes()]));
  dit('plus de chiffres en tête, de tuiles ni de pavé d état', (await evalue(`document.querySelectorAll('.trc-ger__chiffre, .trc-am__tuile, .trc-ger__etat').length`)) === 0);

  /* 3. Une ligne ouverte. */
  dit('la ligne de M. D. s ouvre', await ouvreLaLigneDe('M. D.'));
  await attend(400);
  const panneau = await lePanneau();
  dit('... le modèle « place » : il est temps, deux places, la signature et la devise, par WhatsApp', /Bonjour M\., il est temps de votre .+ : nous avons de la place .+\. Je vous en garde une \? Maison MND/.test(panneau) && /mi nyɔ́ ɖɛkpɛ, votre beauté est déjà là/.test(panneau) && /WhatsApp · /.test(panneau), panneau.slice(0, 260));
  dit('... « Pourquoi ce message » est replié', (await evalue(`document.querySelector('.trc-ger__panneau details.trc-auj__pourquoi')?.open`)) === false && !/Dernière venue/.test(panneau));
  await evalue(String.raw`(() => { const s = document.querySelector('.trc-ger__panneau details.trc-auj__pourquoi summary'); if (s) s.click(); return !!s; })()`);
  await attend(300);
  const pourquoi = await lePanneau();
  dit('... déplié : sa dernière venue, sa date attendue avec l année, son retard', /Dernière venue/.test(pourquoi) && /Date attendue \S+ \d{1,2}(er)? \S+ \d{4}/.test(pourquoi) && /Retard \d+ jours/.test(pourquoi), pourquoi.slice(-260));
  await photo('1-plan');
  dit('plus d essai à cinq : ni bouton, ni onglet', !(await evalue(String.raw`/essai/i.test(document.querySelector('.trc-ger')?.innerText || '')`)));
  dit('en pause, pas de bouton WhatsApp', !(await evalue(String.raw`[...document.querySelectorAll('a.trc-ger__btn')].some((a) => a.textContent.trim().startsWith('Envoyer sur WhatsApp'))`)));
  dit('... ni de « Envoyer » sur les lignes', (await evalue(`document.querySelectorAll('.trc-auj__fin .trc-auj__btn').length`)) === 0);

  /* 3 bis. LES RÉGLAGES (21 novembre 2026) : Pause ou Actif, le plafond, l'état, les modèles ont
     quitté Aujourd'hui pour leur vue. */
  dit('Aujourd hui ne porte plus ni les deux choix ni le plafond', (await evalue(`document.querySelectorAll('.trc-ger__modes, .trc-ger__plafond, .trc-ger__modeles').length`)) === 0);
  await evalue(`location.hash = '#/gerard?vue=reglages'; true`);
  dit('la vue « Réglages » s ouvre, à son adresse', !!(await jusqua(`document.querySelectorAll('.trc-ger__modes button').length === 2`, 8000)), await evalue('location.hash'));
  dit('deux choix seulement : Pause et Actif', JSON.stringify(await evalue(String.raw`[...document.querySelectorAll('.trc-ger__modes button b')].map((b) => b.textContent)`)) === JSON.stringify(['Pause', 'Actif']));
  dit('le passer en Actif', await clique('.trc-ger__modes button', 'Actif'));
  await attend(400);
  const apres = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_gerard') || 'null')`);
  dit('... écrit « ouvert » dans les réglages, avec le plafond par défaut', apres?.mode === 'ouvert' && apres?.remisesParSemaine === 8 && apres?.plafondFrancs === 60000, JSON.stringify(apres));
  dit('actif, la pastille le dit : « Perle écrit seule », et « Mettre en pause »', JSON.stringify(await pastille()) === JSON.stringify(['Perle écrit seule', 'Mettre en pause']), JSON.stringify(await pastille()));
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
  dit('... et « Ses règles » le disent', /remises et 45\s000\sF par semaine/.test(await texte()));
  const etat = ((await evalue(`document.querySelector('.trc-auj__etat')?.innerText || ''`)) ?? '').replace(/\s+/g, ' ');
  dit('... l état compte les anniversaires du jour, chacun avec sa carte', /Anniversaires du jour : 2/.test(etat) && !/sans carte/.test(etat), etat.slice(0, 200));

  /* 4. Les modèles Meta. */
  const modeles = await evalue(String.raw`[...(document.querySelector('.trc-ger__modeles')?.querySelectorAll('li b') ?? [])].map((b) => b.textContent)`);
  dit('sept plus un modèles à déposer chez Meta, et les deux cartes d anniversaire (27 octobre 2026)', JSON.stringify(modeles) === JSON.stringify(['assistant_maison_garder', 'assistant_maison_avant', 'assistant_maison_envie', 'assistant_maison_place', 'assistant_maison_anniversaire', 'assistant_maison_carte_anniversaire', 'assistant_maison_carte_foyer', 'assistant_maison_fetes', 'assistant_maison_endormie', 'nouvelles_de_la_maison']), JSON.stringify(modeles));

  /* Retour à Aujourd'hui, en Actif. */
  await evalue(`location.hash = '#/gerard'; true`);
  await jusqua(`document.querySelectorAll('.trc-auj__rangee').length > 0`, 20000);
  await deplie();
  const cartesActif = await cartes();
  dit('actif : la carte « À envoyer » compte les messages WhatsApp à un toucher', Number(cartesActif?.[1]?.[0]) > 0 && cartesActif?.[1]?.[1] === 'À envoyer', JSON.stringify(cartesActif));

  /* Un toucher : le message part sur WhatsApp, noté au journal. */
  await ouvreLaLigneDe('M. D.');
  await attend(300);
  const lien = await evalue(String.raw`[...document.querySelectorAll('a.trc-ger__btn')].find((a) => a.textContent.trim().startsWith('Envoyer sur WhatsApp'))?.href || ''`);
  dit('« Envoyer sur WhatsApp » ouvre le message déjà écrit, au bon numéro, signé et avec la devise', /^https:\/\/wa\.me\/229\d+\?text=/.test(lien)
    && /il est temps de votre/.test(decodeURIComponent(lien)) && /Maison MND\nmi nyɔ́ ɖɛkpɛ, votre beauté est déjà là$/.test(decodeURIComponent(lien.split('text=')[1] ?? '')), decodeURIComponent(lien).slice(0, 200));
  const lienDeLaLigne = await evalue(String.raw`[...document.querySelectorAll('.trc-auj__rangee')].find((li) => li.querySelector('.trc-auj__qui')?.textContent === 'M. D.')?.querySelector('.trc-auj__fin a.trc-auj__btn')?.href || ''`);
  dit('... et sa ligne porte le même « Envoyer », d un toucher', lien !== '' && lienDeLaLigne === lien, lienDeLaLigne.slice(0, 80));
  await evalue(String.raw`(() => { const a = [...document.querySelectorAll('a.trc-ger__btn')].find((x) => x.textContent.trim().startsWith('Envoyer sur WhatsApp')); if (a) { a.removeAttribute('target'); a.setAttribute('href', '#/gerard'); a.click(); } return !!a; })()`);
  await attend(600);
  const envoisGerard = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_envois') || '[]').filter((e) => e.type === 'gerard')`);
  dit('... noté au journal des envois : à la main, sa cliente, sa raison', (envoisGerard ?? []).length === 1 && envoisGerard[0].statut === 'à-la-main' && envoisGerard[0].clientId === 'c-retard' && envoisGerard[0].genre === 'retard',
    JSON.stringify(envoisGerard));
  await attend(400);
  const journal = await evalue(String.raw`(() => { const d = [...document.querySelectorAll('details.trc-ger__carte')].find((c) => c.querySelector('h3')?.textContent.startsWith('Déjà parti aujourd’hui')); if (!d) return ''; d.open = true; return d.innerText.replace(/\s+/g, ' '); })()`);
  dit('... « Déjà parti aujourd hui » le montre, et M. D. sort du plan (deux semaines avant le prochain)', /M\. D\./.test(journal) && /WhatsApp, à un toucher/.test(journal)
    && !(await evalue(String.raw`[...document.querySelectorAll('.trc-auj__qui')].some((q) => q.textContent === 'M. D.')`)), journal.slice(0, 200));

  /* « À ENVOYER › ENVOYER LA PREMIÈRE » (27 octobre 2026, « ne s'ouvre pas » ; refait le 21 novembre) :
     la ligne de la première cliente à un toucher s'ouvre ET vient à l'écran, la liste repliée ou non. */
  const attendue = await evalue(String.raw`[...document.querySelectorAll('.trc-auj__rangee')].find((li) => li.querySelector('.trc-auj__fin .trc-auj__btn'))?.querySelector('.trc-auj__qui')?.textContent ?? ''`);
  await evalue(String.raw`(() => { const o = document.querySelector('.trc-auj__ouvre[aria-expanded="true"]'); if (o) o.click(); const p = document.querySelector('.trc-auj__plus[aria-expanded="true"]'); if (p) p.click(); window.scrollTo(0, document.body.scrollHeight); return true; })()`);
  await attend(400);
  dit('« Envoyer la première » est là, sur la carte « À envoyer »', await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-auj__carte button')].find((x) => x.textContent.trim() === 'Envoyer la première'); if (!b) return false; b.click(); return true; })()`));
  await attend(1500);
  const premiere = await evalue(String.raw`(() => {
    const li = document.querySelector('.trc-auj__rangee.est-ouverte');
    const ligne = li?.querySelector('.trc-auj__ligne');
    if (!li || !ligne) return null;
    const r = ligne.getBoundingClientRect();
    return { qui: li.querySelector('.trc-auj__qui')?.textContent ?? '', haut: Math.round(r.top), bas: Math.round(r.bottom), h: window.innerHeight, panneau: !!li.querySelector('.trc-ger__panneau') };
  })()`);
  dit('... elle ouvre la ligne de la première cliente à un toucher, et la ligne est à l écran', !!premiere && attendue !== '' && premiere.qui === attendue && premiere.panneau
    && premiere.haut >= 0 && premiere.bas <= premiere.h, JSON.stringify({ attendue, premiere }));

  /* 4 bis. LA CARTE DE L'ENFANT AU PARENT PAYEUR (27 octobre 2026) : sa
     ligne dit à qui elle part, « Envoyer sa carte » ouvre la fenêtre de la
     carte au numéro du parent, et le geste se note à la main, avec la fiche
     qui reçoit. */
  await deplie();
  const ligneEnfant = ((await lesLignes()) ?? []).find((l) => l[0] === 'A. P.');
  dit('l enfant du foyer : son anniversaire est au plan, à son parent payeur', /^Anniversaire · à H\. P\./.test(ligneEnfant?.[1] ?? ''), JSON.stringify(ligneEnfant));
  dit('... sa ligne porte « Envoyer » : la carte part d un toucher', ligneEnfant?.[2] === 'Envoyer', JSON.stringify(ligneEnfant));
  await ouvreLaLigneDe('A. P.');
  await attend(400);
  const panneauEnfant = await lePanneau();
  dit('... le mot au parent, le prénom de l enfant', /Bonjour H\., joyeux anniversaire à A\. ! Toute la Maison lui souhaite une très belle journée/.test(panneauEnfant), panneauEnfant.slice(0, 220));
  dit('... « Envoyer sa carte » ouvre la fenêtre de la carte', await clique('.trc-ger__panneau button', 'Envoyer sa carte'));
  await attend(1500);
  const fenetre = await evalue(String.raw`(() => { const m = document.querySelector('.mnd-modal'); return m ? { canvas: !!m.querySelector('canvas'), texte: m.innerText.replace(/\s+/g, ' ') } : null; })()`);
  dit('... la carte dessinée, le mot de l Assistant, WhatsApp au numéro du parent', !!fenetre?.canvas && /joyeux anniversaire à A\./.test(fenetre?.texte ?? '')
    && /WhatsApp/.test(fenetre?.texte ?? ''), (fenetre?.texte ?? '').slice(0, 200));
  await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.mnd-modal button')].find((x) => x.textContent.trim() === 'WhatsApp'); if (b) b.click(); return !!b; })()`);
  await attend(800);
  const notee = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_envois') || '[]').filter((e) => e.type === 'gerard' && e.clientId === 'c-enfant')`);
  dit('... envoyée : notée à la main, une fois, avec le parent qui la reçoit', (notee ?? []).length === 1 && notee[0].statut === 'à-la-main' && notee[0].pourId === 'c-parent'
    && /^gerard-\d{4}-\d{2}-\d{2}-c-enfant-wa-main$/.test(notee[0].id) && notee[0].modele === 'carte-foyer', JSON.stringify(notee));
  dit('... et le fil WhatsApp ouvert est celui du parent', /conversations/.test(await evalue('location.hash')) && /2290151000018/.test(decodeURIComponent(await evalue('location.hash'))),
    decodeURIComponent(await evalue('location.hash')).slice(0, 120));
  await evalue(`location.hash = '#/gerard'; true`);
  await jusqua(`document.querySelectorAll('.trc-auj__rangee').length > 0`, 20000);

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
