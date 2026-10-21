/* LE BANC DU MARKETING — `node scripts/banc-du-marketing.mjs [capture]`.

   21 octobre 2026, « Marketing branché ». Il construit le Trône avec un
   serveur Supabase INJOIGNABLE, l'ouvre dans un vrai Chrome sur une session
   gardée (comme banc-trone-hors-ligne), sème des fiches, des venues et des
   envois d'exemple, puis fait les gestes de la Maison :

     1. les trois onglets s'ouvrent, sans erreur, avec les vrais envois du mois ;
     2. l'Audience compte le segment et les accords ; « Voir » ouvre le registre
        sur exactement ces têtes ;
     3. « Écrire » prépare une campagne adressée ; elle se dépose RETENUE (rien
        en attente), une tête un message, personne sans accord sur WhatsApp ;
     4. le feu vert la fait passer « en-attente » ; le facteur n'est pas lancé.

   Les noms sont inventés. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-mkt-'));
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-mkt-chrome-'));
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
  const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + String(detail).slice(0, 220) : ''}`); };
  const photo = async (etape) => {
    if (!capture) return;
    const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };
  const texte = () => evalue('document.body.innerText');
  const clique = (mot, premier = false) => evalue(`(() => {
    /* Les boutons s'écrivent en capitales à l'écran (« ÉCRIRE ») : on compare sans la casse. */
    const b = [...document.querySelectorAll('button, a')].filter((x) => x.offsetParent !== null && x.innerText.trim().replace(/\\s+/g, ' ').toLowerCase().startsWith(${JSON.stringify(mot.toLowerCase())}));
    if (!b.length) return false;
    b[${premier ? '0' : 'b.length - 1'}].click();
    return true;
  })()`);
  const remplis = (placeholder, valeur) => evalue(`(() => {
    const el = [...document.querySelectorAll('input, textarea')].find((x) => x.placeholder === ${JSON.stringify(placeholder)});
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(valeur)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  const tombe = async () => /Unexpected Application Error|Cet écran ne s.est pas ouvert|Unexpected error/i.test(await texte());

  /* La session gardée, et le vécu d'exemple. */
  const UID = 'u-banc-mkt';
  const CLE = 'sb-127-auth-token';
  const le = new Date(Date.now() - 86_400_000).toISOString();
  const jour = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const maintenant = new Date().toISOString();
  const fiche = (id, name, extra) => ({ id, branchId: 'maison', name, phone: '', city: '', persona: '', since: '2026-01-10', photo: null, segments: [], priceCoef: 1, loyaltyPoints: 0, diaspora: false, ...extra });
  const semence = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] } },
    'trone::mnd_clients': [
      fiche('cl-ada', 'Ada Exemple', { civilite: 'madame', segments: ['Régulier'], phone: '+229 01 51 00 00 01', nouvelles: { oui: true, le: '2026-10-01', par: 'comptoir' } }),
      fiche('cl-bea', 'Bea Exemple', { segments: ['Régulier'], phone: '+229 01 51 00 00 02' }),
      fiche('cl-cora', 'Cora Exemple', { segments: ['Régulier'], phone: '+229 01 51 00 00 03', nouvelles: { oui: false, le: '2026-10-02', par: 'stop' } }),
      fiche('cl-dina', 'Dina Exemple', { segments: ['Régulier'], phone: '+229 01 51 00 00 04', nouvelles: { oui: true, le: '2026-10-03', par: 'comptoir' } }),
      fiche('cl-eva', 'Eva Exemple', { segments: ['VIP'], phone: '+229 01 51 00 00 05' }),
    ],
    'trone::mnd_appointments': ['cl-ada', 'cl-bea', 'cl-cora', 'cl-dina', 'cl-eva'].map((c, i) => ({
      id: `rdv-${c}`, branchId: 'maison', clientId: c, serviceIds: [], date: jour(-(10 + i * 40)), time: '10:00', status: 'honoré', master: '',
    })),
    'trone::mnd_envois': [
      { id: 'env-x1-whatsapp', branchId: 'maison', type: 'rappel-j1', canal: 'whatsapp', apptId: 'x1', dateRdv: jour(0), statut: 'envoyé', etat: 'remis', quand: maintenant },
      { id: 'conf-x2-whatsapp', branchId: 'maison', type: 'confirmation', canal: 'whatsapp', apptId: 'x2', dateRdv: jour(1), statut: 'envoyé', etat: 'lu', quand: maintenant },
    ],
  };
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/marketing'; location.reload(); true`);
  await attend(9000);

  /* 1. Les trois onglets. */
  dit('1. le Marketing s ouvre', !(await tombe()) && /Campagnes/.test(await texte()));
  await photo('1-campagnes');
  await clique('Automatisations'); await attend(1200);
  const auto = await texte();
  dit('1. Automatisations : les envois reels, pas la semence', /Rappel WhatsApp/.test(auto) && /1 ce mois/.test(auto) && !/Loc · jour 365/.test(auto) && !(await tombe()), auto.match(/Partis ce mois\s*\n?\s*\d+/)?.[0]);
  dit('1. ... les idees sans interrupteur', /Idées pas encore construites/i.test(auto));
  await photo('2-automatisations');
  await clique('Audience'); await attend(1200);
  const aud = await texte();
  dit('2. Audience : Regulier, 4 tetes, 2 d accord', /Régulier\s+4\s+—\s+2\s+0/.test(aud.replace(/\t/g, ' ')) && !(await tombe()), aud.split('\n').find((l) => l.startsWith('Régulier')));
  dit('2. ... les audiences calculees', /Dormantes depuis 90 jours/.test(aud) && /Venues une seule fois/.test(aud));
  await photo('3-audience');

  /* 2. « Voir » ouvre le registre sur ces têtes. */
  await clique('Voir les 4'); await attend(2500);
  const reg = await texte();
  dit('2. Voir les 4 : le registre sur l audience, 4 tetes', /Audience « Régulier » · 4 têtes/.test(reg) && !(await tombe()), reg.match(/Audience[^\n]*/)?.[0]);
  await photo('4-registre');
  await evalue(`history.back(); true`); await attend(2000);
  await clique('Audience'); await attend(800);

  /* 3. « Écrire », la campagne, le dépôt. */
  /* Le premier « Écrire » est celui du segment le plus fourni : Régulier. */
  await clique('Écrire', true); await attend(1200);
  dit('3. Ecrire ouvre la nouvelle campagne', /Nouvelle campagne/i.test(await texte()));
  await remplis('L’entretien d’octobre', 'L’entretien du banc');
  await remplis('nouvelles_de_la_maison', 'nouvelles_de_la_maison');
  await remplis('Bonjour {{1}}, la Maison MND…', 'Bonjour {{1}}, la Maison MND vous ouvre ses fauteuils.');
  await remplis('Maison MND', 'Maison MND');
  await attend(600);
  const fen = await texte();
  dit('3. l apercu appelle par la civilite et le prenom', /Bonjour Madame Ada, la Maison MND vous ouvre ses fauteuils\./.test(fen));
  await photo('5-fenetre');
  /* La notification sans texte bloque encore : on retire Ma Couronne. */
  const bloque = /Il manque/.test(fen);
  await evalue(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /Ma Couronne · notification/i.test(x.innerText)); b?.click(); return !!b; })()`);
  await attend(500);
  dit('3. sans le texte de la notification, il manque quelque chose ; WhatsApp seul, plus rien', bloque && !/Il manque/.test(await texte()));
  dit('3. deposer : 2 messages (Ada, Dina), pas Bea ni Cora', /Déposer, retenue · 2 messages/i.test(await texte()), (await texte()).match(/Déposer, retenue[^\n]*/i)?.[0]);
  await clique('Déposer, retenue · 2'); await attend(800);
  await clique('Déposer, retenue'); await attend(1500);
  const envois1 = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_envois') || '[]').filter((e) => e.type === 'campagne')`);
  dit('3. deux lignes, toutes retenues', envois1.length === 2 && envois1.every((e) => e.statut === 'retenu'), JSON.stringify(envois1.map((e) => [e.clientId, e.canal, e.statut])));
  dit('3. ... le modele et la civilite dans le colis', envois1.some((e) => e.colis?.modele === 'nouvelles_de_la_maison' && e.colis?.composants?.[0]?.parameters?.[0]?.text === 'Madame Ada'));
  const liste = await texte();
  dit('3. la liste dit « Retenue · attend votre feu vert »', /Retenue · attend votre feu vert/i.test(liste));
  /* Vu sur la première capture : une campagne retenue se disait « partie le … ». */
  dit('3. ... et ne se dit pas partie', /partirait le/i.test(liste) && !/partie le/i.test(liste), liste.match(/(partie|partirait) le[^\n]*/i)?.[0]);
  await photo('6-retenue');

  /* 4. Le feu vert. */
  await clique('Donner le feu vert'); await attend(800);
  await clique('Donner le feu vert'); await attend(1500);
  const envois2 = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_envois') || '[]').filter((e) => e.type === 'campagne')`);
  dit('4. au feu vert, en attente du facteur', envois2.length === 2 && envois2.every((e) => e.statut === 'en-attente'), JSON.stringify(envois2.map((e) => e.statut)));
  dit('4. la liste dit « En route »', /En route/i.test(await texte()));
  await photo('7-en-route');

  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.join(' | '));
  ws.close();
} finally {
  chrome.kill();
  serveur.close();
  await attend(500);
  try { rmSync(construit, { recursive: true, force: true }); rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore son profil */ }
}
console.log(ko === 0 ? '\nLe banc du marketing tient.' : `\n${ko} attente(s) dechue(s).`);
process.exitCode = ko === 0 ? 0 : 1;
