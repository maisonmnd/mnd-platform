/* LE BANC DE L'ASSISTANT MAISON · `node scripts/banc-de-l-assistant-maison.mjs [capture]`.

   27 octobre 2026, lot 3 : la rubrique devient cinq vues (spec
   `docs/spec-assistant-maison.md` §5, maquette `public/maquette-assistant-
   maison.html`). Le harnais eprouve les purs (`verifie-assistant-aujourdhui`,
   `verifie-gerard`) ; ce banc ouvre le VRAI Trone, Supabase injoignable, sur
   une session gardee de la direction, seme six clientes (une par situation),
   un souci Sante et un appel a rappeler, et lit l'ecran :

     - la barre des cinq vues (role=tablist), Aujourd'hui choisie par defaut,
       chaque `?vue=` ouvre la sienne et l'allume ;
     - les cinq tuiles, dans l'ordre de la maquette ; la ligne resume de
       « Part aujourd'hui » ; une seule ligne ouverte a la fois ;
     - « Attend un humain » : la Sante d'abord, avec « Appeler » en tel:,
       chaque ligne vers Les conversations ;
     - les quatre autres vues vivent (27 octobre 2026, lots des vues) : chacune
       ouvre sur ses tuiles chiffrees et sa liste ou son selecteur ;
     - au telephone (390 px), rien ne deborde, sur chacune des cinq vues.

   Les fiches sont des exemples, signees d'initiales. Sortie ASCII (console
   Windows). */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-am-'));
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-am-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));

const VUES = ['aujourdhui', 'conversations', 'avis', 'offres', 'rapporte'];
const TITRES = ['Aujourd’hui', 'Les conversations', 'Les avis', 'Offres et remises', 'Ce que ça rapporte'];

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
  const tombe = async () => /Unexpected Application Error|Cet écran ne s.est pas ouvert|Unexpected error/i.test(await texte());
  const onglets = () => evalue(String.raw`[...document.querySelectorAll('.trc-am__vues [role="tab"]')].map((b) => [b.firstChild?.textContent?.trim() ?? b.textContent.trim(), b.getAttribute('aria-selected') === 'true'])`);
  const deborde = async () => (await evalue('document.documentElement.scrollWidth > window.innerWidth + 1')) === true;

  /* La session gardee, et le vecu d'exemple. */
  const UID = 'u-banc-am';
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
    fiche('c-sante', 'K. T.'),
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
    /* K. T. est venue il y a trois jours : son souci Sante la fait taire, elle n'entre pas dans le plan. */
    rdv('c-sante', -60, 'honoré'), rdv('c-sante', -3, 'honoré'),
  ];
  const ilYA = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
  const signalements = [
    { id: 'sig-1', branchId: 'maison', clientId: 'c-sante', soucis: ['gratte'], texte: 'ça gratte depuis deux jours', canal: 'couronne', quand: ilYA(2), etat: 'ouvert' },
  ];
  const appels = [
    { id: 'ap-1', branchId: 'maison', nom: 'B. N.', phone: '+229 01 51 00 00 99', motif: 'rappeler pour une coloration', suite: 'rappel', fait: false, at: ilYA(26) },
  ];
  const semence = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] } },
    'trone::mnd_clients': clients,
    'trone::mnd_appointments': rdvs,
    'trone::mnd_signalements': signalements,
    'trone::mnd_appels': appels,
  };
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/gerard'; location.reload(); true`);
  const vu = await jusqua(`document.querySelectorAll('.trc-ger__rangee').length > 0`, 40000);

  /* 1. Le cadre : la barre des cinq vues. */
  dit('l Assistant Maison s ouvre, comme la direction', !!vu && !(await tombe()));
  const barre = await evalue(String.raw`[...document.querySelectorAll('.tr-nav__item')].map((a) => a.textContent.replace(/\s+/g, ' ').trim())`);
  const iClientes = (barre ?? []).findIndex((t) => t.startsWith('Clientes'));
  dit('la barre : « Assistant Maison » juste sous « Clientes », allume', iClientes >= 0 && String(barre[iClientes + 1]).startsWith('Assistant Maison'), JSON.stringify(barre?.slice(Math.max(0, iClientes), iClientes + 2)));
  /* L'eyebrow est en petites capitales par CSS : `innerText` la rendrait en capitales, `textContent` donne la lettre. */
  const tete = await evalue(String.raw`document.querySelector('.tr-page-head__head')?.textContent.replace(/\s+/g, ' ').trim() || ''`);
  dit('l en-tete dit « Clientèle · Assistant Maison », plus « Gérard, l assistant »', /Clientèle · Assistant Maison/.test(tete) && /Assistant Maison\./.test(tete) && !/Gérard, l’assistant/.test(tete), tete);
  const tabs = await onglets();
  dit('la barre des vues : cinq onglets, dans l ordre de la maquette, Aujourd hui choisie', JSON.stringify((tabs ?? []).map((t) => t[0])) === JSON.stringify(TITRES) && tabs?.[0]?.[1] === true && tabs.filter((t) => t[1]).length === 1, JSON.stringify(tabs));
  dit('... collante : role=tablist, position sticky', (await evalue(String.raw`getComputedStyle(document.querySelector('.trc-am__vues[role="tablist"]')).position`)) === 'sticky');
  dit('... et un panneau role=tabpanel relie a l onglet choisi', await evalue(String.raw`(() => { const p = document.querySelector('.trc-am__vue[role="tabpanel"]'); return !!p && p.getAttribute('aria-labelledby') === document.querySelector('.trc-am__vues [aria-selected="true"]')?.id; })()`));

  /* 2. Les cinq tuiles. */
  const tuiles = await evalue(String.raw`[...document.querySelectorAll('.trc-am__tuile')].map((t) => [t.querySelector('b')?.innerText.replace(/\s+/g, ' ').trim(), t.querySelector('span')?.innerText.replace(/\s+/g, ' ').trim()])`);
  /* Deux seances honorees de moins de 30 jours sans bilan (P. O. a J-30 inclus, K. T. a J-3) : « 2 bilans a remettre » attendent un oui. */
  dit('cinq tuiles : prets (en pause), oui attendus (2 bilans a remettre), humain dont Sante, remises n / 8, francs en jeu', (tuiles ?? []).length === 5
    && tuiles[0][0] === '6' && /en pause/.test(tuiles[0][1]) && tuiles[1][0] === '2' && /2 bilans à remettre/.test(tuiles[1][1]) && tuiles[2][0] === '2' && /Santé 1/.test(tuiles[2][1])
    && /^0 \/ 8$/.test(tuiles[3][0]) && /remises cette semaine/.test(tuiles[3][1]) && /F$/.test(tuiles[4][0]) && /en jeu aujourd’hui/.test(tuiles[4][1]), JSON.stringify(tuiles));
  dit('... les francs en jeu : un calibre et une fourchette, jamais le compte exact (sans RDV prix, aucun chiffre sur)', /aucun chiffre sûr|de \d[\d ]* F à \d[\d ]* F/.test(tuiles?.[4]?.[1] ?? ''), tuiles?.[4]?.[1]);
  dit('la ligne d etat dit la portee du jour : 7 clientes joignables', /Portée du jour : 7 clientes joignables/.test(await texte()));

  /* 3. « Part aujourd'hui » : la ligne resume, un seul panneau ouvert. */
  const resume = await evalue(String.raw`document.querySelector('.trc-am__resume')?.innerText.replace(/\s+/g, ' ').trim() || ''`);
  dit('la ligne resume : 6 lignes, Ma Couronne 0, WhatsApp 6, 1 remise (0 / 8 cette semaine)', /^6 lignes · Ma Couronne 0 · WhatsApp 6 · 1 remise \(0 \/ 8 cette semaine\)/.test(resume), resume);
  const lignes = await evalue(String.raw`[...document.querySelectorAll('.trc-ger__ligne')].map((b) => [b.querySelector('.trc-ger__qui')?.firstChild?.textContent, b.querySelector('.trc-am__avatar')?.textContent, b.querySelector('.trc-am__droite small')?.textContent])`);
  dit('chaque ligne : l avatar a initiales, le depart « en pause »', (lignes ?? []).length === 6 && lignes.every((l) => /^[A-Z]{2}$/.test(l[1] ?? '') && l[2] === 'en pause')
    && lignes.find((l) => l[0] === 'M. D.')?.[1] === 'MD', JSON.stringify(lignes));
  const ouvre = (nom) => evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-ger__ligne')].find((x) => x.querySelector('.trc-ger__qui')?.firstChild?.textContent === ${JSON.stringify(nom)}); if (b) b.click(); return !!b; })()`);
  dit('la ligne de M. D. s ouvre', await ouvre('M. D.'));
  await attend(400);
  dit('... un panneau ouvert : la bulle signee Maison MND, le pourquoi en puces, les gestes', (await evalue(`document.querySelectorAll('.trc-ger__panneau').length`)) === 1
    && /Maison MND/.test(await evalue(String.raw`document.querySelector('.trc-ger__panneau .trc-ger__bulle')?.innerText || ''`))
    && (await evalue(`document.querySelectorAll('.trc-ger__panneau .trc-am__puces li').length`)) >= 3
    && /Dernière venue/.test(await evalue(String.raw`document.querySelector('.trc-ger__panneau .trc-am__puces')?.innerText || ''`)));
  /* En pause, « Pas maintenant » se tait (rien ne part de toute facon : il vit en Actif, voir plus bas) ; « Jamais pour elle »
     ecrit dans les reglages (`jamais[clientId]`, lot 2) et vit, pour la direction (27 octobre 2026). */
  const gestes = await evalue(String.raw`[...document.querySelectorAll('.trc-ger__panneau .trc-am__gestes > *')].map((b) => [b.textContent.trim(), b.hasAttribute('disabled'), b.getAttribute('href') || ''])`);
  dit('... les gestes : Poser le RDV, Appeler (tel:), Jamais pour elle (vivant, direction) ; ni Pas maintenant ni bouton mort ; en pause, pas d envoi WhatsApp',
    JSON.stringify((gestes ?? []).map((g) => g[0])) === JSON.stringify(['Poser le RDV', 'Appeler', 'Jamais pour elle'])
    && gestes[1][2].startsWith('tel:+229') && gestes[2][1] === false
    && (await evalue(`document.querySelectorAll('.trc-ger__panneau button[disabled]').length`)) === 0, JSON.stringify(gestes));
  dit('la ligne de N. B. s ouvre a son tour', await ouvre('N. B.'));
  await attend(400);
  dit('... et un seul panneau reste ouvert, le sien', (await evalue(`document.querySelectorAll('.trc-ger__panneau').length`)) === 1
    && (await evalue(String.raw`document.querySelector('.trc-ger__rangee.est-ouverte .trc-ger__qui')?.firstChild?.textContent`)) === 'N. B.');
  await photo('1-aujourdhui');
  /* « Jamais pour elle » sur N. B. (anniversaire) : ecrit `jamais['c-anniv'] = ['anniversaire']` dans mnd_gerard, et elle sort du plan. */
  dit('« Jamais pour elle » se touche', await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-ger__panneau .trc-am__gestes button')].find((x) => x.textContent.trim() === 'Jamais pour elle'); if (b) b.click(); return !!b; })()`));
  await attend(500);
  const reglagesApres = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_gerard') || 'null')`);
  dit('... ecrit dans ses reglages : jamais « anniversaire » pour c-anniv, signe de la direction', JSON.stringify(reglagesApres?.jamais?.['c-anniv']) === JSON.stringify(['anniversaire']) && typeof reglagesApres?.parQui === 'string', JSON.stringify(reglagesApres?.jamais));
  dit('... et N. B. sort du plan du jour : cinq lignes', (await jusqua(String.raw`document.querySelectorAll('.trc-ger__ligne').length === 5 && ![...document.querySelectorAll('.trc-ger__qui')].some((q) => q.firstChild?.textContent === 'N. B.')`, 4000)) === true,
    String(await evalue(`document.querySelectorAll('.trc-ger__ligne').length`)));


  /* 4. Attend un humain : la Sante d'abord, Appeler, chaque ligne vers Les conversations. */
  const humain = await evalue(String.raw`[...document.querySelectorAll('.trc-am__attente')].map((l) => [l.querySelector('.trc-am__qui b')?.firstChild?.textContent?.trim(), l.querySelector('.trc-am__puce')?.textContent, [...l.querySelectorAll('.trc-am__gestes a')].map((a) => [a.textContent, a.getAttribute('href')])])`);
  dit('« Attend un humain » : K. T. en Sante d abord (Appeler en tel:, Repondre vers /conversations), puis l appel de B. N.', (humain ?? []).length === 2
    && humain[0][0] === 'K. T.' && humain[0][1] === 'Santé' && humain[0][2].some(([t, h]) => t === 'Appeler' && /^tel:\+229/.test(h)) && humain[0][2].some(([t, h]) => t === 'Répondre' && /#\/conversations\?n=229/.test(h))
    && humain[1][0] === 'B. N.' && humain[1][1] === 'Appel', JSON.stringify(humain));
  /* Une seule carte, celle des bilans, vers les seances ; jamais une carte factice d'offre flash (aucune mecanique ne la propose). */
  const cartes = await evalue(String.raw`[...document.querySelectorAll('.trc-am__carte')].map((c) => [c.querySelector('.trc-am__sur')?.textContent, c.querySelector('b')?.textContent, c.querySelector('a')?.getAttribute('href') || ''])`);
  dit('« Attend un oui » : une carte, les 2 bilans a remettre (vers les seances) ; aucune carte factice d offre flash', (cartes ?? []).length === 1
    && cartes[0][0] === 'Bilans à remettre' && cartes[0][1] === '2' && /#\/customers\?focus=bilans/.test(cartes[0][2])
    && /Offre flash : aucune proposition/.test(await texte()), JSON.stringify(cartes));
  /* Cinq replis : ce qui est parti, les jours creux, Entre deux seances, Ses regles, Ses modeles ; rien de parti, aucun ouvert d'office. */
  dit('« Aujourd hui, ce qui est parti », « Les jours creux », « Entre deux seances », « Ses regles », « Ses modeles » sont des replis, fermes', (await evalue(`document.querySelectorAll('details.trc-am__repli').length`)) === 5
    && (await evalue(`document.querySelectorAll('details.trc-am__repli[open]').length`)) === 0
    && /Rien encore aujourd’hui|0 ligne/.test(await evalue(String.raw`[...document.querySelectorAll('details.trc-am__repli')].find((d) => d.querySelector('h3')?.textContent.startsWith('Aujourd’hui'))?.textContent || ''`)),
  String(await evalue(`document.querySelectorAll('details.trc-am__repli').length`)));
  dit('... un seul repli du bas ouvert a la fois : Ses regles ouvert, puis Ses modeles ouvert referme Ses regles', await evalue(String.raw`(() => {
    const d = [...document.querySelectorAll('details.trc-am__repli')];
    const regles = d.find((x) => x.querySelector('h3')?.textContent.startsWith('Ses règles'));
    const modeles = d.find((x) => x.querySelector('h3')?.textContent.startsWith('Ses modèles'));
    if (!regles || !modeles) return false;
    regles.querySelector('summary').click();
    return new Promise((r) => setTimeout(() => {
      const a = regles.open && !modeles.open;
      modeles.querySelector('summary').click();
      setTimeout(() => r(a && modeles.open && !regles.open), 250);
    }, 250));
  })()`));
  dit('les reglages restent sur Aujourd hui : Pause et Actif deplies, le plafond, les huit modeles', JSON.stringify(await evalue(String.raw`[...document.querySelectorAll('.trc-ger__modes button b')].map((b) => b.textContent)`)) === JSON.stringify(['Pause', 'Actif'])
    && (await evalue(String.raw`[...document.querySelectorAll('.trc-ger__modes button')].every((b) => b.offsetParent !== null)`)) === true
    && (await evalue(`document.querySelectorAll('.trc-ger__plafond input').length`)) === 2 && (await evalue(`document.querySelectorAll('.trc-ger__modeles li').length`)) === 8);

  /* « PAS MAINTENANT » (27 octobre 2026, restes du lot 3), apres les replis (sa ligne ecartee entre au journal du jour) : en Actif, sur M. D. (retard, WhatsApp a un toucher). La ligne
     du jour nait ecartee, avec la reponse « non » (le lot 2 la compte dans les traces) ; M. D. sort du plan ; retour en Pause. */
  const mode = (mot) => evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-ger__modes button')].find((x) => x.textContent.includes(${JSON.stringify(mot)})); if (b) b.click(); return !!b; })()`);
  dit('« Pas maintenant » : passer en Actif', await mode('Actif'));
  await attend(700);
  dit('... la ligne de M. D. s ouvre', await ouvre('M. D.'));
  await attend(400);
  const gestesActifs = await evalue(String.raw`[...document.querySelectorAll('.trc-ger__panneau .trc-am__gestes > *')].map((b) => b.textContent.trim())`);
  dit('... en Actif, « Pas maintenant » est parmi ses gestes', (gestesActifs ?? []).includes('Pas maintenant'), JSON.stringify(gestesActifs));
  dit('... et se touche', await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-ger__panneau .trc-am__gestes button')].find((x) => x.textContent.trim() === 'Pas maintenant'); if (b) b.click(); return !!b; })()`));
  await attend(700);
  const envoisApres = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_envois') || '[]')`);
  const ligneNon = (envoisApres ?? []).find((e) => /^gerard-\d{4}-\d{2}-\d{2}-c-retard-wa-main$/.test(e.id));
  dit('... ecrit la ligne du jour : ecartee, reponse « non », pas maintenant, son genre', !!ligneNon && ligneNon.statut === 'écarté' && ligneNon.reponse === 'non'
    && ligneNon.pasMaintenant === true && ligneNon.genre === 'retard' && ligneNon.type === 'gerard', JSON.stringify(ligneNon));
  dit('... et M. D. sort du plan du jour', (await jusqua(String.raw`![...document.querySelectorAll('.trc-ger__qui')].some((q) => q.firstChild?.textContent === 'M. D.')`, 4000)) === true);
  dit('... retour en Pause', await mode('Pause'));
  await attend(700);

  /* 5. Chaque vue par son adresse ; la barre l'allume ; la vue vit (ses tuiles, sa liste ou son selecteur) ; au telephone rien ne deborde.
     `textContent`, pas `innerText` : les `h3 span` sont en petites capitales par CSS. */
  const VIVANTE = {
    /* La ligne chiffree, « A traiter / Toutes », la liste a gauche et la conversation a droite (27 octobre 2026, le soir) :
       K. T. (souci Sante ouvert) en tete du groupe « Maintenant », sa pastille Sante, et « Ce qu il faut faire » dans la conversation ouverte. */
    conversations: String.raw`(() => {
      const v = document.querySelector('.trc-am__vue'); if (!v) return 'pas de vue';
      const resume = !!v.querySelector('.trc-bx__resume');
      const segments = v.querySelectorAll('.trc-bx__segments button').length;
      const premiere = v.querySelector('.trc-bx__liste .trc-bx__ligne');
      const nom = premiere?.querySelector('.trc-bx__haut b')?.textContent?.trim();
      const pastille = premiere?.querySelector('.trc-bx__pastille')?.textContent ?? '';
      const faire = !!v.querySelector('.trc-bx__conv .trc-bx__faire');
      return resume && segments === 2 && nom === 'K. T.' && /^Santé/.test(pastille) && faire ? true : JSON.stringify({ resume, segments, nom, pastille, faire });
    })()`,
    /* Quatre tuiles ; la liste des avis Google (vide, Supabase injoignable : elle le dit). */
    avis: String.raw`(() => {
      const v = document.querySelector('.trc-am__vue'); if (!v) return 'pas de vue';
      const tuiles = v.querySelectorAll('.trc-am__tuile').length;
      const titre = [...v.querySelectorAll('h3')].some((h) => h.textContent.startsWith('Les avis Google'));
      const vide = /Les avis ne sont pas encore arrivés|Aucun avis/.test(v.textContent) || v.querySelectorAll('li.trc-am__avis').length > 0;
      return tuiles === 4 && titre && vide ? true : JSON.stringify({ tuiles, titre, vide });
    })()`,
    /* Quatre tuiles, « Par code », quatre cartes, l'editeur des offres replie. */
    offres: String.raw`(() => {
      const v = document.querySelector('.trc-am__vue'); if (!v) return 'pas de vue';
      const tuiles = v.querySelectorAll('.trc-am__tuile').length;
      const parCode = [...v.querySelectorAll('h3')].some((h) => h.textContent.startsWith('Par code'));
      const cartes = v.querySelectorAll('.trc-am__carte').length;
      const editeur = !!v.querySelector('details#am-offres-editeur');
      return tuiles === 4 && parCode && cartes === 4 && editeur ? true : JSON.stringify({ tuiles, parCode, cartes, editeur });
    })()`,
    /* Les tuiles du compte, le selecteur Semaine / Mois / Depuis, « Qui ecrit seul ». */
    rapporte: String.raw`(() => {
      const v = document.querySelector('.trc-am__vue'); if (!v) return 'pas de vue';
      const tuiles = v.querySelectorAll('.trc-am__tuile').length;
      const segs = [...v.querySelectorAll('.mnd-segs button')].map((b) => b.textContent.trim());
      const quiEcrit = [...v.querySelectorAll('h3')].some((h) => h.textContent.startsWith('Qui écrit seul'));
      return tuiles >= 4 && segs.length === 3 && /^Semaine/.test(segs[0]) && /^Mois/.test(segs[1]) && /^Depuis/.test(segs[2]) && quiEcrit ? true : JSON.stringify({ tuiles, segs, quiEcrit });
    })()`,
  };
  for (let i = 1; i < VUES.length; i++) {
    await evalue(`location.hash = '#/gerard?vue=${VUES[i]}'; true`);
    await attend(500);
    const t = await onglets();
    const choisi = (t ?? []).findIndex((x) => x[1]);
    const vivante = await jusqua(`${VIVANTE[VUES[i]]} === true`, 6000);
    dit(`?vue=${VUES[i]} ouvre « ${TITRES[i]} », l onglet allume, la vue vit (tuiles, liste ou selecteur)`, choisi === i && (t ?? []).filter((x) => x[1]).length === 1
      && vivante === true && !(await tombe()), `${JSON.stringify(t)} ${vivante === true ? '' : String(await evalue(VIVANTE[VUES[i]]))}`);
  }
  dit('un clic sur l onglet Aujourd hui revient a la vue d entree, sans ?vue=', await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-am__vues [role="tab"]')][0]; b.click(); return true; })()`)
    && (await jusqua(String.raw`document.querySelectorAll('.trc-am__tuile').length === 5`, 4000)) === true && !/vue=/.test(await evalue('location.hash')), await evalue('location.hash'));

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  for (let i = 0; i < VUES.length; i++) {
    await evalue(`location.hash = '#/gerard${i ? `?vue=${VUES[i]}` : ''}'; true`);
    await attend(600);
    if (i === 0) { await ouvre('M. D.'); await attend(300); }
    dit(`au telephone (390 px), « ${TITRES[i]} » ne deborde pas`, !(await deborde()), String(await evalue('document.documentElement.scrollWidth')));
    if (i === 0) await photo('2-telephone');
  }
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');
  ws.close();
} catch (e) {
  ko++;
  console.log('ECHEC', e?.message ?? e);
} finally {
  chrome.kill(); serveur.close();
  setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libere apres */ } } }, 1500);
}
console.log(ko === 0 ? '\nL Assistant Maison tient ses cinq vues.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
