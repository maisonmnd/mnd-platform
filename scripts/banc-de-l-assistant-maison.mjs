/* LE BANC DE L'ASSISTANT MAISON · `node scripts/banc-de-l-assistant-maison.mjs [capture]`.

   27 octobre 2026, lot 3 : la rubrique devient cinq vues (spec
   `docs/spec-assistant-maison.md` §5, maquette `public/maquette-assistant-
   maison.html`). Le harnais eprouve les purs (`verifie-assistant-aujourdhui`,
   `verifie-gerard`) ; ce banc ouvre le VRAI Trone, Supabase injoignable, sur
   une session gardee de la direction, seme six clientes (une par situation),
   un souci Sante et un appel a rappeler, et lit l'ecran :

     - la barre des six vues (role=tablist), Aujourd'hui choisie par defaut,
       chaque `?vue=` ouvre la sienne et l'allume ;
     - AUJOURD'HUI, REFAIT (21 novembre 2026, maquette Jrj9rfdYAYPDPDS1aT4EFs) :
       la pastille de Perle (Pause ou Actif d'un toucher), trois cartes « A
       faire maintenant », « Ensuite », la liste de ce que Perle ecrit (cinq
       lignes, le reste se deplie ; une seule ouverte a la fois), « Deja
       parti » replie ; plus de chiffres en tete, de tuiles ni de pave d'etat ;
     - « Repondre » ouvre le tiroir : la Sante d'abord, avec « Appeler » en
       tel:, chaque ligne vers Les conversations ;
     - les Reglages : Pause ou Actif, le plafond, quatre replis ;
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-am-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));

const VUES = ['aujourdhui', 'conversations', 'avis', 'offres', 'rapporte', 'reglages'];
const TITRES = ['Aujourd’hui', 'Conversations', 'Avis', 'Offres', 'Résultats', 'Réglages'];

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
  const vu = await jusqua(`document.querySelectorAll('.trc-auj__rangee').length > 0`, 40000);

  /* 1. Le cadre : la tete, la pastille de Perle, la barre des six vues. */
  dit('Conversations s ouvre sur Aujourd hui, comme la direction', !!vu && !(await tombe()));
  const barre = await evalue(String.raw`[...document.querySelectorAll('.tr-nav__item')].map((a) => a.textContent.replace(/\s+/g, ' ').trim())`);
  const iClientes = (barre ?? []).findIndex((t) => t.startsWith('Clientes'));
  dit('la barre : « Conversations » juste sous « Clientes »', iClientes >= 0 && String(barre[iClientes + 1]).startsWith('Conversations'), JSON.stringify(barre?.slice(Math.max(0, iClientes), iClientes + 2)));
  /* L'eyebrow est en petites capitales par CSS : `innerText` la rendrait en capitales, `textContent` donne la lettre. */
  const tete = await evalue(String.raw`document.querySelector('.tr-page-head__head')?.textContent.replace(/\s+/g, ' ').trim() || ''`);
  dit('l en-tete dit « Conversations », puis « Aujourd hui. »', /^Conversations/.test(tete) && /Aujourd’hui\./.test(tete), tete);
  const pastille = () => evalue(String.raw`(() => { const p = document.querySelector('.trc-auj__perle'); return p ? [p.querySelector('span')?.textContent, p.querySelector('button')?.textContent.trim() ?? null] : null; })()`);
  dit('la pastille de Perle : « Perle est en pause », et « Reprendre » pour la direction', JSON.stringify(await pastille()) === JSON.stringify(['Perle est en pause', 'Reprendre']), JSON.stringify(await pastille()));
  dit('les cinq chiffres du haut, les cinq tuiles et le pave d etat ne sont plus la', (await evalue(`document.querySelectorAll('.trc-ger__chiffre, .trc-am__tuile, .trc-ger__etat').length`)) === 0);
  const tabs = await onglets();
  dit('la barre des vues : six onglets aux noms courts, Aujourd hui choisie', JSON.stringify((tabs ?? []).map((t) => t[0])) === JSON.stringify(TITRES) && tabs?.[0]?.[1] === true && tabs.filter((t) => t[1]).length === 1, JSON.stringify(tabs));
  dit('... « Programmes » y mene aux envois programmes', (await evalue(String.raw`(() => { const a = document.querySelector('.trc-am__vues a.trc-am__vues-lien'); return a ? [a.textContent.trim(), a.getAttribute('href')] : null; })()`))?.join('|') === 'Programmés|#/appels');
  dit('... collante : role=tablist, position sticky', (await evalue(String.raw`getComputedStyle(document.querySelector('.trc-am__vues[role="tablist"]')).position`)) === 'sticky');
  dit('... et un panneau role=tabpanel relie a l onglet choisi', await evalue(String.raw`(() => { const p = document.querySelector('.trc-am__vue[role="tabpanel"]'); return !!p && p.getAttribute('aria-labelledby') === document.querySelector('.trc-am__vues [aria-selected="true"]')?.id; })()`));

  /* 2. A faire maintenant : trois cartes ; Ensuite : les bilans et les civilites. */
  const lesCartes = () => evalue(String.raw`[...document.querySelectorAll('.trc-auj__carte')].map((c) => [c.querySelector('b')?.textContent, c.querySelector('strong')?.textContent, c.querySelector('span')?.textContent.trim(), c.querySelector('button')?.textContent.trim() ?? null])`);
  const cartes = await lesCartes();
  dit('trois cartes : 2 a repondre (dont 1 sante), 0 a envoyer (Perle est en pause), 0 a reprogrammer',
    JSON.stringify(cartes) === JSON.stringify([['2', 'À répondre', 'dont 1 santé', 'Répondre'], ['0', 'À envoyer', 'Perle est en pause', null], ['0', 'À reprogrammer', 'Aucune', null]]), JSON.stringify(cartes));
  /* Deux seances honorees de moins de 30 jours sans bilan (P. O. a J-30 inclus, K. T. a J-3) ; aucun avis a relire. */
  const suite = await evalue(String.raw`[...document.querySelectorAll('.trc-auj__petite')].map((c) => [c.querySelector('b')?.textContent, c.querySelector('span')?.textContent, (c.querySelector('a, button')?.textContent ?? '').trim(), c.querySelector('a')?.getAttribute('href') || ''])`);
  dit('Ensuite : 2 bilans a remettre (vers les seances), les civilites a poser ; aucun avis a relire', (suite ?? []).length === 2
    && suite[0][0] === '2' && suite[0][1] === 'Bilans à remettre' && suite[0][2] === 'Voir' && /#\/customers\?focus=bilans/.test(suite[0][3])
    && suite[1][1] === 'Civilités à poser' && suite[1][2] === 'Poser', JSON.stringify(suite));

  /* 3. Ce que Perle ecrit : cinq lignes d'abord, le reste se deplie ; un seul panneau ouvert. */
  const titre = await evalue(String.raw`document.querySelector('.trc-auj__tete h3')?.textContent.replace(/\s+/g, ' ').trim() || ''`);
  dit('le titre de la liste : « En pause · 6 messages prets »', titre === 'En pause · 6 messages prêts', titre);
  dit('cinq lignes d abord, et « Voir la derniere »', (await evalue(`document.querySelectorAll('.trc-auj__rangee').length`)) === 5
    && (await evalue(String.raw`document.querySelector('.trc-auj__plus')?.textContent.trim()`)) === 'Voir la dernière');
  const deplie = async () => { if (await evalue(String.raw`(() => { const p = document.querySelector('.trc-auj__plus[aria-expanded="false"]'); if (p) p.click(); return !!p; })()`)) await attend(300); };
  await deplie();
  const lignes = await evalue(String.raw`[...document.querySelectorAll('.trc-auj__ligne')].map((b) => [b.querySelector('.trc-auj__qui')?.textContent, b.querySelector('.trc-am__avatar')?.textContent, b.querySelector('.trc-auj__fin small')?.textContent])`);
  dit('depliee : six lignes, l avatar a initiales, le depart « En pause »', (lignes ?? []).length === 6 && lignes.every((l) => /^[A-Z]{2}$/.test(l[1] ?? '') && l[2] === 'En pause')
    && lignes.find((l) => l[0] === 'M. D.')?.[1] === 'MD', JSON.stringify(lignes));
  const ouvre = async (nom) => { await deplie(); return evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-auj__ouvre')].find((x) => x.querySelector('.trc-auj__qui')?.textContent === ${JSON.stringify(nom)}); if (b) b.click(); return !!b; })()`); };
  dit('la ligne de M. D. s ouvre', await ouvre('M. D.'));
  await attend(400);
  dit('... un panneau ouvert : la bulle signee Maison MND, le pourquoi replie avec ses puces', (await evalue(`document.querySelectorAll('.trc-ger__panneau').length`)) === 1
    && /Maison MND/.test(await evalue(String.raw`document.querySelector('.trc-ger__panneau .trc-ger__bulle')?.innerText || ''`))
    && (await evalue(`document.querySelector('.trc-ger__panneau details.trc-auj__pourquoi')?.open`)) === false
    && (await evalue(`document.querySelectorAll('.trc-ger__panneau .trc-am__puces li').length`)) >= 3
    && /Dernière venue/.test(await evalue(String.raw`document.querySelector('.trc-ger__panneau .trc-am__puces')?.textContent || ''`)));
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
    && (await evalue(String.raw`document.querySelector('.trc-auj__rangee.est-ouverte .trc-auj__qui')?.textContent`)) === 'N. B.');
  await photo('1-aujourdhui');
  /* « Jamais pour elle » sur N. B. (anniversaire) : ecrit `jamais['c-anniv'] = ['anniversaire']` dans mnd_gerard, et elle sort du plan. */
  dit('« Jamais pour elle » se touche', await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-ger__panneau .trc-am__gestes button')].find((x) => x.textContent.trim() === 'Jamais pour elle'); if (b) b.click(); return !!b; })()`));
  await attend(500);
  const reglagesApres = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_gerard') || 'null')`);
  dit('... ecrit dans ses reglages : jamais « anniversaire » pour c-anniv, signe de la direction', JSON.stringify(reglagesApres?.jamais?.['c-anniv']) === JSON.stringify(['anniversaire']) && typeof reglagesApres?.parQui === 'string', JSON.stringify(reglagesApres?.jamais));
  /* Son anniversaire ne s'ecrit plus ; hors saison elle sort du plan, pendant les fetes (du 15 novembre au 15 decembre) il lui
     reste le message de Noel : dans les deux cas, plus aucune ligne « Anniversaire » a son nom. */
  dit('... et l anniversaire de N. B. sort du plan du jour', (await jusqua(String.raw`![...document.querySelectorAll('.trc-auj__ligne')].some((l) => l.querySelector('.trc-auj__qui')?.textContent === 'N. B.' && /^Anniversaire/.test(l.querySelector('.trc-auj__motif')?.textContent.trim() ?? ''))`, 4000)) === true,
    JSON.stringify(await evalue(String.raw`[...document.querySelectorAll('.trc-auj__ligne')].map((l) => [l.querySelector('.trc-auj__qui')?.textContent, l.querySelector('.trc-auj__motif')?.textContent.trim()])`)));

  /* 4. « Repondre » ouvre le tiroir : la Sante d'abord, Appeler, chaque ligne vers Les conversations. */
  dit('aucune liste d attente tant que la carte n est pas touchee', (await evalue(`document.querySelectorAll('.trc-am__attente').length`)) === 0);
  dit('« Repondre » ouvre le tiroir sous les cartes', await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-auj__carte button')].find((x) => x.textContent.trim() === 'Répondre'); if (b) b.click(); return !!b; })()`));
  await attend(400);
  const humain = await evalue(String.raw`[...document.querySelectorAll('.trc-am__attente')].map((l) => [l.querySelector('.trc-am__qui b')?.firstChild?.textContent?.trim(), l.querySelector('.trc-am__puce')?.textContent, [...l.querySelectorAll('.trc-am__gestes a')].map((a) => [a.textContent, a.getAttribute('href')])])`);
  dit('le tiroir : K. T. en Sante d abord (Appeler en tel:, Repondre vers /conversations), puis l appel de B. N.', (humain ?? []).length === 2
    && humain[0][0] === 'K. T.' && humain[0][1] === 'Santé' && humain[0][2].some(([t, h]) => t === 'Appeler' && /^tel:\+229/.test(h)) && humain[0][2].some(([t, h]) => t === 'Répondre' && /#\/conversations\?n=229/.test(h))
    && humain[1][0] === 'B. N.' && humain[1][1] === 'Appel', JSON.stringify(humain));
  dit('... et « Toutes les conversations » y mene', await evalue(String.raw`[...document.querySelectorAll('.trc-auj__tiroir button')].some((b) => b.textContent.trim() === 'Toutes les conversations')`));
  /* Un seul repli sur Aujourd'hui : ce qui est parti, ferme ; rien de parti. */
  dit('« Deja parti aujourd hui » est le seul repli, ferme', (await evalue(`document.querySelectorAll('details.trc-am__repli').length`)) === 1
    && (await evalue(`document.querySelectorAll('details.trc-am__repli[open]').length`)) === 0
    && (await evalue(String.raw`document.querySelector('details.trc-am__repli h3')?.textContent`)) === 'Déjà parti aujourd’hui'
    && /Rien encore aujourd’hui/.test(await evalue(String.raw`document.querySelector('details.trc-am__repli')?.textContent || ''`)));

  /* « PAS MAINTENANT » (27 octobre 2026, restes du lot 3) : en Actif, sur M. D. (retard, WhatsApp a un toucher). La ligne du jour
     nait ecartee, avec la reponse « non » (le lot 2 la compte dans les traces) ; M. D. sort du plan ; retour en Pause. Depuis le
     21 novembre 2026, Pause et Actif se touchent dans la pastille de la tete. */
  const perleBouton = (mot) => evalue(String.raw`(() => { const b = document.querySelector('.trc-auj__perle button'); if (b && b.textContent.trim() === ${JSON.stringify(mot)}) { b.click(); return true; } return false; })()`);
  dit('« Reprendre » : Perle passe en Actif', await perleBouton('Reprendre'));
  await attend(700);
  dit('... la pastille dit « Perle ecrit seule », et offre « Mettre en pause »', JSON.stringify(await pastille()) === JSON.stringify(['Perle écrit seule', 'Mettre en pause']), JSON.stringify(await pastille()));
  const actives = await lesCartes();
  dit('... en Actif, « A envoyer » compte les WhatsApp a un toucher, avec « Envoyer la premiere »', Number(actives?.[1]?.[0]) >= 1 && actives[1][2] === 'Messages prêts sur WhatsApp' && actives[1][3] === 'Envoyer la première', JSON.stringify(actives?.[1]));
  await deplie();
  const envoyer = await evalue(String.raw`(() => { const l = [...document.querySelectorAll('.trc-auj__ligne')].find((x) => x.querySelector('.trc-auj__qui')?.textContent === 'M. D.'); const a = l?.querySelector('.trc-auj__fin a'); return a ? [a.textContent.trim(), a.getAttribute('href') || ''] : null; })()`);
  dit('... la ligne de M. D. porte « Envoyer », vers WhatsApp, son message deja ecrit', envoyer?.[0] === 'Envoyer' && /wa\.me\/229\d+\?text=/.test(envoyer?.[1] ?? ''), JSON.stringify(envoyer));
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
  dit('... et M. D. sort du plan du jour', (await jusqua(String.raw`![...document.querySelectorAll('.trc-auj__qui')].some((q) => q.textContent === 'M. D.')`, 4000)) === true);
  dit('... retour en Pause', await perleBouton('Mettre en pause'));
  await attend(700);

  /* 4 bis. Les Reglages de Perle (21 novembre 2026) : Pause ou Actif deplies, le plafond, quatre replis, un seul ouvert a la fois. */
  await evalue(`location.hash = '#/gerard?vue=reglages'; true`);
  await attend(700);
  dit('?vue=reglages : « Reglages de Perle. », Pause et Actif deplies, le plafond, les modeles', /Réglages de Perle\./.test(await evalue(String.raw`document.querySelector('.tr-page-head__head')?.textContent || ''`))
    && JSON.stringify(await evalue(String.raw`[...document.querySelectorAll('.trc-ger__modes button b')].map((b) => b.textContent)`)) === JSON.stringify(['Pause', 'Actif'])
    && (await evalue(String.raw`[...document.querySelectorAll('.trc-ger__modes button')].every((b) => b.offsetParent !== null)`)) === true
    && (await evalue(`document.querySelectorAll('.trc-ger__plafond input').length`)) === 2 && (await evalue(`document.querySelectorAll('.trc-ger__modeles li').length`)) >= 10);
  const replis = await evalue(String.raw`[...document.querySelectorAll('details.trc-am__repli')].map((d) => [d.querySelector('h3')?.textContent, d.open])`);
  dit('... quatre replis fermes : Jours creux, Entre deux seances, Ses regles, Modeles WhatsApp',
    JSON.stringify(replis) === JSON.stringify([['Jours creux', false], ['Entre deux séances', false], ['Ses règles', false], ['Modèles WhatsApp', false]]), JSON.stringify(replis));
  dit('... un seul repli ouvert a la fois : Ses regles ouvert, puis Modeles WhatsApp ouvert referme Ses regles', await evalue(String.raw`(() => {
    const d = [...document.querySelectorAll('details.trc-am__repli')];
    const regles = d.find((x) => x.querySelector('h3')?.textContent.startsWith('Ses règles'));
    const modeles = d.find((x) => x.querySelector('h3')?.textContent.startsWith('Modèles WhatsApp'));
    if (!regles || !modeles) return false;
    regles.querySelector('summary').click();
    return new Promise((r) => setTimeout(() => {
      const a = regles.open && !modeles.open;
      modeles.querySelector('summary').click();
      setTimeout(() => r(a && modeles.open && !regles.open), 250);
    }, 250));
  })()`));
  await evalue(`location.hash = '#/gerard'; true`);
  await attend(600);

  /* 5. Chaque vue par son adresse ; la barre l'allume ; la vue vit (ses tuiles, sa liste ou son selecteur) ; au telephone rien ne deborde.
     `textContent`, pas `innerText` : les `h3 span` sont en petites capitales par CSS. */
  const VIVANTE = {
    /* Comme WhatsApp, pleine page (18 novembre 2026) : « Discussions » et son menu, les cinq puces (Toutes, Non lues, A traiter,
       Salle d attente, En attente), la liste a gauche et la conversation a droite ; K. T. (souci Sante ouvert) porte « Sante »
       sur sa ligne, et « Ce qu il faut faire » se lit dans la conversation ouverte. */
    conversations: String.raw`(() => {
      const v = document.querySelector('.trc-am__vue'); if (!v) return 'pas de vue';
      const entete = !!v.querySelector('.trc-bx__entete .trc-bx__plus');
      const segments = v.querySelectorAll('.trc-bx__segments button').length;
      const kt = [...v.querySelectorAll('.trc-bx__liste .trc-bx__ligne')].find((l) => l.querySelector('.trc-bx__haut b')?.textContent?.trim() === 'K. T.');
      const sante = !!kt?.querySelector('.trc-bx__tag--sante');
      const faire = !!v.querySelector('.trc-bx__conv .trc-bx__faire');
      return entete && segments === 5 && !!kt && sante && faire ? true : JSON.stringify({ entete, segments, kt: !!kt, sante, faire });
    })()`,
    /* Dans le cadre des Conversations (18 novembre 2026) : « Avis Google », cinq puces, la note et ses compteurs a droite ;
       la liste des avis Google (vide, Supabase injoignable : elle le dit). */
    avis: String.raw`(() => {
      const v = document.querySelector('.trc-am__vue'); if (!v) return 'pas de vue';
      const titre = v.querySelector('.trc-bx__titre')?.textContent?.trim() === 'Avis Google';
      const puces = v.querySelectorAll('.trc-bx__segments button').length;
      const chiffres = v.querySelectorAll('.trc-av__chiffres b').length;
      const vide = /Les avis ne sont pas encore arrivés|Aucun avis/.test(v.textContent) || v.querySelectorAll('li.trc-am__avis').length > 0;
      return titre && puces === 5 && chiffres === 3 && vide ? true : JSON.stringify({ titre, puces, chiffres, vide });
    })()`,
    /* Dans le cadre des Conversations (18 novembre 2026) : « Offres et remises », le plafond de la semaine en deux jauges,
       cinq puces, et sans rien d'ouvert la vue d'ensemble et ses quatre cartes ; l'editeur des offres s'ouvre en volet. */
    offres: String.raw`(() => {
      const v = document.querySelector('.trc-am__vue'); if (!v) return 'pas de vue';
      const titre = v.querySelector('.trc-bx__titre')?.textContent?.trim() === 'Offres et remises';
      const jauges = v.querySelectorAll('.trc-of__plafond .trc-of__jauge').length;
      const puces = v.querySelectorAll('.trc-bx__segments button').length;
      const cartes = v.querySelectorAll('.trc-am__carte').length;
      return titre && jauges === 2 && puces === 5 && cartes === 4 ? true : JSON.stringify({ titre, jauges, puces, cartes });
    })()`,
    /* Les tuiles du compte, le selecteur Semaine / Mois / Depuis, « Qui ecrit seul ». */
    rapporte: String.raw`(() => {
      const v = document.querySelector('.trc-am__vue'); if (!v) return 'pas de vue';
      const tuiles = v.querySelectorAll('.trc-am__tuile').length;
      const segs = [...v.querySelectorAll('.mnd-segs button')].map((b) => b.textContent.trim());
      const quiEcrit = [...v.querySelectorAll('h3')].some((h) => h.textContent.startsWith('Qui écrit seul'));
      return tuiles >= 4 && segs.length === 3 && /^Semaine/.test(segs[0]) && /^Mois/.test(segs[1]) && /^Depuis/.test(segs[2]) && quiEcrit ? true : JSON.stringify({ tuiles, segs, quiEcrit });
    })()`,
    /* Les Reglages de Perle : Pause et Actif, le plafond. */
    reglages: String.raw`(() => {
      const v = document.querySelector('.trc-am__vue'); if (!v) return 'pas de vue';
      const modes = v.querySelectorAll('.trc-ger__modes button').length;
      const plafond = v.querySelectorAll('.trc-ger__plafond input').length;
      return modes === 2 && plafond === 2 ? true : JSON.stringify({ modes, plafond });
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
    && (await jusqua(String.raw`document.querySelectorAll('.trc-auj__carte').length === 3`, 4000)) === true && !/vue=/.test(await evalue('location.hash')), await evalue('location.hash'));

  /* 6. La banque de scenarios (30 octobre 2026) : `?scenarios=1` l'ouvre sous la boite ; le menu la propose ;
     deux cas semes (des exemples), un a valider, un valide ; « C'est juste » le valide, la direction le peut. */
  const BANQUE = { cas: [
    { id: 'cas-banc0001', texte: 'Je suis en route pour le shampooing', quand: instant(-1), source: 'maison', etat: 'propose', creeLe: instant(-1) },
    { id: 'cas-banc0002', texte: 'Envoie moi la localisation', quand: instant(-1), source: 'export', etat: 'valide', attendu: { qui: 'assistant', signes: ['chemin'] }, creeLe: instant(-1) },
  ] };
  await evalue(`localStorage.setItem('trone::mnd_scenarios_wa', ${JSON.stringify(JSON.stringify(BANQUE))}); location.hash = '#/gerard?vue=conversations&scenarios=1'; location.reload(); true`);
  const bq = await jusqua(String.raw`!!document.querySelector('.trc-bq .trc-bq__liste')`, 40000);
  dit('la banque de scenarios s ouvre par ?scenarios=1, a droite de la liste', !!bq && !(await tombe()));
  const filtresBq = await evalue(String.raw`[...document.querySelectorAll('.trc-bq__filtres button')].map((b) => [b.textContent.trim(), b.getAttribute('aria-selected') === 'true'])`);
  dit('... quatre filtres, « A valider · 1 » choisi', JSON.stringify((filtresBq ?? []).map((f) => f[0])) === JSON.stringify(['À valider · 1', 'À reprendre · 0', 'Validés · 1', 'Tous · 2']) && filtresBq?.[0]?.[1] === true, JSON.stringify(filtresBq));
  dit('... le resume dit que le cas valide tient', /1 validé · 0 à reprendre · 1 à valider · le cas validé tient/.test(await evalue(String.raw`document.querySelector('.trc-bq__resume')?.textContent.replace(/\s+/g, ' ') ?? ''`)), await evalue(String.raw`document.querySelector('.trc-bq__resume')?.textContent ?? ''`));
  await evalue(String.raw`document.querySelector('.trc-bq__cas .trc-bq__tete')?.click(); true`);
  await attend(400);
  const puces = await evalue(String.raw`[...document.querySelectorAll('.trc-bq__cas.est-ouvert .trc-bq__panneau .trc-bq__puce')].map((p) => p.textContent.trim())`);
  dit('... le cas ouvert dit ce qu il comprend : en route, le lavage', (puces ?? []).includes('en route') && (puces ?? []).includes('Lavage'), JSON.stringify(puces));
  await evalue(String.raw`document.querySelector('.trc-bq')?.scrollIntoView({ block: 'start' }); true`);
  await attend(300);
  if (capture) {
    const zone = await evalue(String.raw`(() => { const r = document.querySelector('.trc-bx__outil-pane')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y + scrollY, w: r.width, h: r.height } : null; })()`);
    if (zone) {
      const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: zone.x, y: zone.y, width: zone.w, height: Math.min(zone.h, 1400), scale: 1 } });
      writeFileSync(`${capture}-3-banque-ordi.png`, Buffer.from(img.result.data, 'base64'));
    }
  }
  dit('... « C est juste » se touche (la direction)', await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-bq__cas.est-ouvert .trc-bq__gestes button')].find((x) => x.textContent.trim() === 'C’est juste'); if (b) b.click(); return !!b; })()`));
  dit('... et le cas passe en Valides', (await jusqua(String.raw`[...document.querySelectorAll('.trc-bq__filtres button')].map((b) => b.textContent.trim()).join('|') === 'À valider · 0|À reprendre · 0|Validés · 2|Tous · 2'`, 4000)) === true,
    await evalue(String.raw`[...document.querySelectorAll('.trc-bq__filtres button')].map((b) => b.textContent.trim()).join('|')`));
  await evalue(String.raw`(() => { const t = [...document.querySelectorAll('.trc-bq__filtres button')].find((b) => b.textContent.startsWith('Validés')); t?.click(); return true; })()`);
  await attend(300);
  await evalue(String.raw`document.querySelector('#cas-cas-banc0001 .trc-bq__tete')?.click(); true`);
  await attend(300);
  dit('... un cas valide offre « Ecrire 20 variantes » a la direction', await evalue(String.raw`[...document.querySelectorAll('.trc-bq__cas.est-ouvert .trc-bq__variantes button')].some((b) => b.textContent.trim() === 'Écrire 20 variantes')`));
  const ecrit = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_scenarios_wa') || '{}')`);
  const valideBq = (ecrit?.cas ?? []).find((c) => c.id === 'cas-banc0001');
  dit('... ecrit : valide, son attendu, qui l a valide', valideBq?.etat === 'valide' && valideBq?.attendu?.qui === 'assistant' && (valideBq?.attendu?.signes ?? []).includes('en-route') && !!valideBq?.valideLe, JSON.stringify(valideBq));
  await evalue(String.raw`document.querySelector('.trc-bx__plus')?.click(); true`);
  await attend(300);
  dit('le menu des outils propose la banque', await evalue(String.raw`[...document.querySelectorAll('.trc-bx__menu-liste button b')].some((b) => b.textContent.trim() === 'Banque de scénarios')`));
  await evalue(String.raw`document.querySelector('.trc-bx__plus')?.click(); true`);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await attend(500);
  dit('au telephone (390 px), la banque ne deborde pas', !(await deborde()), String(await evalue('document.documentElement.scrollWidth')));
  await photo('3-banque');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });

  /* 7. Valider en cochant (30 octobre 2026) : `?reponses=1`, les treize brouillons de depart, une case par reponse ;
     « Duree d une creation » (sans prix) se coche et se valide ; « Ma longueur suffit ? » (vide) propose son texte. */
  await evalue(`location.hash = '#/gerard?vue=conversations&reponses=1'; location.reload(); true`);
  const cocher = await jusqua(String.raw`document.querySelectorAll('.trc-cocher__ligne').length`, 40000);
  dit('valider en cochant : les treize brouillons, une case chacun', cocher === 13 && !(await tombe()), String(cocher));
  dit('... « Ma longueur suffit ? », vide, propose son texte', await evalue(String.raw`[...document.querySelectorAll('.trc-cocher__ligne')].some((l) => l.querySelector('.trc-cocher__titre')?.textContent === 'Ma longueur suffit ?' && [...l.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Accepter la correction'))`));
  dit('... « Duree d une creation » se coche', await evalue(String.raw`(() => { const l = [...document.querySelectorAll('.trc-cocher__ligne')].find((x) => x.querySelector('.trc-cocher__titre')?.textContent === 'Durée d’une création'); const c = l?.querySelector('input[type="checkbox"]'); if (!c || c.disabled) return false; c.click(); return true; })()`));
  await attend(200);
  dit('... et « Valider la reponse cochee » la valide', await evalue(String.raw`(() => { const b = [...document.querySelectorAll('.trc-cocher button')].find((x) => x.textContent.trim() === 'Valider la réponse cochée'); if (!b) return false; b.click(); return true; })()`));
  await attend(500);
  const conseilEcrit = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_reponses_maison') || '{}')`);
  dit('... ecrit : validee, par la direction, les autres restent en brouillon', (conseilEcrit?.reponses ?? []).find((r) => r.id === 'r-duree')?.etat === 'validee'
    && (conseilEcrit?.reponses ?? []).filter((r) => r.etat === 'validee').length === 1, JSON.stringify((conseilEcrit?.reponses ?? []).map((r) => [r.id, r.etat])));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await attend(400);
  dit('au telephone (390 px), valider en cochant ne deborde pas', !(await deborde()), String(await evalue('document.documentElement.scrollWidth')));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });

  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  for (let i = 0; i < VUES.length; i++) {
    await evalue(`location.hash = '#/gerard${i ? `?vue=${VUES[i]}` : ''}'; true`);
    await attend(600);
    if (i === 0) { await ouvre('G. A.'); await attend(300); }
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
console.log(ko === 0 ? '\nL Assistant Maison tient ses six vues.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
