/* LE BANC DE L'EMPREINTE — `node scripts/banc-de-l-empreinte.mjs [capture]`.

   16 octobre 2026, « entrer par l'empreinte ». Le Trône construit comme pour
   la mise en ligne, ouvert dans un VRAI Chrome à la largeur d'un téléphone,
   avec un CAPTEUR D'EMPREINTE VIRTUEL (CDP WebAuthn : un authentificateur
   « interne » qui vérifie l'utilisateur, et une clé d'accès pour ce site).
   Le serveur de connexion est injoignable : c'est le chemin « sans réseau »,
   où le téléphone seul rouvre la session gardée.

     1. la proposition après le mot de passe, une fois : « Plus tard » ne la
        refait pas paraître ;
     2. l'empreinte activée : le Trône s'ouvre VERROUILLÉ, inerte dessous ;
     3. une empreinte refusée n'ouvre pas ; une empreinte reconnue ouvre ;
     4. quatre minutes hors du Trône : ouvert ; six : reverrouillé ;
     5. « Verrouiller maintenant », depuis l'en-tête ;
     6. déconnecté : le compte reconnu (prénom, e-mail masqué), le mot de
        passe toujours là, le bouton d'empreinte ; « Changer » l'oublie.

   Les noms sont des exemples. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-empreinte-'));
const profil = mkdtempSync(path.join(tmpdir(), 'banc-empreinte-chrome-'));
console.log('Construction du Trône (serveur injoignable)…');
execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
});
renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = createServer((req, res) => {
  let f = path.join(construit, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
/* « localhost » et non 127.0.0.1 : une clé d'accès ne se lie pas à une adresse IP. */
const origine = `http://localhost:${serveur.address().port}`;
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
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      const t = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').split('\n').slice(0, 3).join(' / ');
      if (/Error|rror:|Uncaught/i.test(t) && !/Failed to load resource|ERR_CONNECTION|fetch|127\.0\.0\.1:9|AuthRetryableFetchError|NetworkError/i.test(t)) erreurs.push(t.slice(0, 300));
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
  const clique = (sel) => evalue(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const bouton = (texte) => evalue(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(texte)})); if (!b) return false; b.click(); return true; })()`);
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  /* Le capteur d'empreinte virtuel, et la clé d'accès de ce site qu'il porte. */
  await cdp('WebAuthn.enable', { enableUI: false });
  const { result: { authenticatorId } } = await cdp('WebAuthn.addVirtualAuthenticator', { options: {
    protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
  } });
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  await cdp('WebAuthn.addCredential', { authenticatorId, credential: {
    credentialId: randomBytes(16).toString('base64'), isResidentCredential: true, rpId: 'localhost',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'), userHandle: Buffer.from('u-banc-direction').toString('base64'), signCount: 0,
  } });

  /* La session laissée par supabase-js et la tête gardée (comme le banc hors ligne). */
  const UID = 'u-banc-direction';
  const CLE = 'sb-127-auth-token';
  const le = new Date(Date.now() - 86_400_000).toISOString();
  const session = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Yéman Exemple', role: 'souverain', rubrics: [] } },
  };
  const seme = (o) => evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(o)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  const tronOuvert = `!!document.querySelector('.tr-top__sync, .tr-side, nav') && !document.querySelector('.tra-verrou')`;
  /* Le serveur de connexion est injoignable : ses réglages publics (« les clés d'accès sont-elles
     allumées ? ») sont rendus ici, allumées ou non selon le banc (banc_allumees). */
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const vrai = window.fetch.bind(window);
    window.fetch = (entree, init) => {
      const u = typeof entree === 'string' ? entree : (entree && entree.url) || '';
      if (u.includes('/auth/v1/settings')) {
        const oui = localStorage.getItem('banc_allumees') !== 'non';
        return Promise.resolve(new Response(JSON.stringify({ passkeys_enabled: oui }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return vrai(entree, init);
    };
  })();` });
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);

  /* 0. Tant que la Maison n'a pas allumé les clés d'accès (Supabase) : rien n'est proposé. */
  await seme(session);
  await evalue(`localStorage.setItem('banc_allumees', 'non'); location.reload(); true`);
  await jusqua(tronOuvert, 20000);
  await attend(3000);
  dit('0. cles d acces eteintes cote Maison : le Trone ne propose rien', !(await evalue(`document.body.innerText.includes('Entrer d’un doigt la prochaine fois ?')`)));

  /* 1. Allumées : la proposition, une fois. */
  await evalue(`localStorage.setItem('banc_allumees', 'oui'); true`);
  await evalue('location.reload()');
  const capable = await jusqua(`(async () => (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) ? 'oui' : null)()`, 6000);
  dit('le capteur virtuel est vu comme un capteur d empreinte de l appareil', capable === 'oui', capable);
  const proposition = await jusqua(`document.body.innerText.includes('Entrer d’un doigt la prochaine fois ?')`, 20000);
  dit('1. apres l entree, le Trone propose l empreinte', !!proposition);
  await photo('1-proposition');
  await bouton('Plus tard');
  await attend(500);
  await evalue('location.reload()');
  await jusqua(tronOuvert, 20000);
  await attend(2500);
  dit('... « Plus tard » : elle ne revient pas a l ouverture suivante', !(await evalue(`document.body.innerText.includes('Entrer d’un doigt la prochaine fois ?')`)));

  /* 2. L'empreinte activée sur cet appareil : le Trône s'ouvre verrouillé. */
  await seme({ [`mnd_empreinte::${UID}`]: { passkeyId: '6f9619ff-8b86-4011-b42d-00c04fc964ff', nom: 'Téléphone Android · Chrome', le } });
  await evalue('location.reload()');
  const verrou = await jusqua(`(() => { const v = document.querySelector('.tra-verrou'); return v ? v.innerText : null; })()`, 20000);
  dit('2. empreinte activee : le Trone s ouvre verrouille', !!verrou && /Le Trône est verrouillé/.test(verrou), verrou?.slice(0, 60));
  dit('... avec le compte reconnu : le prenom, l e-mail masque', !!verrou && /Yéman/.test(verrou) && /d•••••@exemple\.bj/.test(verrou) && !/direction@exemple\.bj/.test(verrou));
  dit('... et le Trone dessous est inerte', !!(await evalue(`document.querySelector('.tra-sous-le-verrou')?.hasAttribute('inert')`)));
  const deborde = await evalue(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  dit('... rien ne deborde a 390 px', deborde <= 0, deborde);
  await photo('2-verrou');

  /* 3. Refusée, puis reconnue. */
  await cdp('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: false });
  await clique('.tra-verrou .tra-empreinte');
  const refus = await jusqua(`(() => { const a = document.querySelector('.tra-verrou [role=alert]'); return a ? a.innerText : null; })()`, 15000);
  dit('3. une empreinte non reconnue n ouvre pas, et le dit', !!refus && /non reconnue/.test(refus) && !!(await evalue(`!!document.querySelector('.tra-verrou')`)), refus);
  await cdp('WebAuthn.setUserVerified', { authenticatorId, isUserVerified: true });
  await clique('.tra-verrou .tra-empreinte');
  const ouvert = await jusqua(tronOuvert, 15000);
  dit('... une empreinte reconnue ouvre le Trone (sans reseau : le telephone seul rouvre la session gardee)', !!ouvert);
  await photo('3-ouvert');

  /* 4. Hors du Trône : quatre minutes, puis six. (L'horloge de la page est avancée à la main.) */
  await evalue(`(() => {
    const vrai = Date.now.bind(Date); window.__decalage = 0; Date.now = () => vrai() + window.__decalage;
    window.__vis = 'visible'; Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis });
    window.__sort = (minutes) => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); window.__decalage += minutes * 60000; window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); };
    return true; })()`);
  await evalue('window.__sort(4)');
  await attend(600);
  dit('4. quatre minutes hors du Trone : il reste ouvert', !(await evalue(`!!document.querySelector('.tra-verrou')`)));
  await evalue('window.__sort(6)');
  const reverrou = await jusqua(`!!document.querySelector('.tra-verrou')`, 4000);
  dit('... six minutes : il se reverrouille', !!reverrou);
  await clique('.tra-verrou .tra-empreinte');
  await jusqua(tronOuvert, 15000);

  /* 5. « Verrouiller maintenant », depuis l'en-tête. */
  await clique('header [aria-label="Entrer par l’empreinte"]');
  /* textContent et non innerText : les boutons du Trône s'écrivent en capitales par le style. */
  const modale = await jusqua(`document.body.textContent.includes('Verrouiller maintenant') && document.body.textContent.includes('Activée') ? true : null`, 8000);
  dit('5. l en-tete ouvre « Entrer par l empreinte » : activee sur cet appareil', !!modale);
  await photo('5-cles');
  await bouton('Verrouiller maintenant');
  const parLaMain = await jusqua(`!!document.querySelector('.tra-verrou')`, 4000);
  dit('... « Verrouiller maintenant » verrouille', !!parLaMain);
  await clique('.tra-verrou .tra-empreinte');
  await jusqua(tronOuvert, 15000);

  /* 6. Déconnecté (la session n'est plus sur l'appareil) : l'écran de connexion se souvient. */
  await evalue(`localStorage.removeItem(${JSON.stringify(CLE)}); location.reload(); true`);
  const connexion = await jusqua(`(() => { const c = document.querySelector('.tra-card'); return c && c.textContent.includes('Se connecter') ? c.textContent : null; })()`, 20000);
  dit('6. deconnecte : « Bon retour », le compte reconnu (e-mail masque), sans champ e-mail', !!connexion && /Bon retour, Yéman/.test(connexion) && /d•••••@exemple\.bj/.test(connexion)
    && !(await evalue(`!!document.querySelector('.tra-card input[type=email]')`)), connexion?.slice(0, 80));
  dit('... le mot de passe reste, et le bouton d empreinte s y ajoute', !!(await evalue(`!!document.querySelector('.tra-card input[type=password]') && !!document.querySelector('.tra-card .tra-empreinte')`)));
  await photo('6-connexion');
  await bouton('Changer');
  const oublie = await jusqua(`!!document.querySelector('.tra-card input[type=email]') && !document.querySelector('.tra-card .tra-empreinte') && !localStorage.getItem('mnd_compte_memorise')`, 4000);
  dit('... « Changer » oublie le compte : l e-mail se retape, l empreinte de ce compte ne se propose plus', !!oublie);

  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
} catch (e) {
  dit('le banc va au bout', false, String(e?.message ?? e));
} finally {
  try { ws?.close(); } catch { /* deja ferme */ }
  chrome.kill();
  serveur.close();
  setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libere apres */ } } }, 1500);
}
console.log(ko ? `\n${ko} ECHEC(S)` : '\nL empreinte tient dans un vrai navigateur.');
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
