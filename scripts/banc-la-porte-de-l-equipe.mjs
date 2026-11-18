/* LE BANC DE LA PORTE DE L'EQUIPE — `node scripts/banc-la-porte-de-l-equipe.mjs [sans serveur] [avec serveur]`.

   17 novembre 2026, la consultation en affiches, arbitrage D. Le harnais
   `verifie-les-autres-portes` lit la regle et le code ; ce banc ouvre les
   VRAIES pages dans Chrome et regarde ce qu'on y voit :

     - sans serveur (un poste de developpement), les trois outils s'ouvrent
       comme le Trone : l'ancien tunnel, la papeterie du bilan, le certificat ;
       l'equipe y garde ses deux passages du peage ;
     - avec un serveur et personne de connecte, la visiteuse ne voit rien de
       l'outil : le tunnel la mene a /consultation/ sans que son code soit
       meme demande ; le bilan et le certificat disent une ligne et un chemin.

   Il attend deux constructions des memes entrees :
     VITE_APPS=consultation,certificat,bilan VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-porte-sans" --emptyOutDir
     VITE_APPS=consultation,certificat,bilan VITE_SUPABASE_URL=http://127.0.0.1:9 VITE_SUPABASE_ANON_KEY=banc VITE_ALLOW_OPEN=false \
       npx vite build --outDir "$TEMP/banc-porte-avec" --emptyOutDir
   (l'adresse du second serveur ne repond pas : il suffit qu'il y en ait une,
   la session se lit sur l'appareil). */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const sans = process.argv[2] || path.join(tmpdir(), 'banc-porte-sans');
const avec = process.argv[3] || path.join(tmpdir(), 'banc-porte-avec');
for (const d of [sans, avec]) {
  if (!existsSync(path.join(d, 'consultation.html')) || !existsSync(path.join(d, 'bilan.html')) || !existsSync(path.join(d, 'certificat.html'))) {
    console.error(`Les trois pages ne sont pas construites dans ${d}. Voir l'en-tete du script.`);
    process.exit(2);
  }
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };
/** Un serveur par construction, qui note ce qu'on lui demande. /consultation/ y est une page temoin : la consultation du site. */
async function sert(dossier) {
  const demandes = [];
  const serveur = createServer((req, res) => {
    const chemin = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    demandes.push(chemin);
    if (chemin === '/consultation/') { res.writeHead(200, { 'content-type': TYPES['.html'] }); res.end('<!doctype html><title>temoin</title><p id="temoin">la consultation du site</p>'); return; }
    let f = path.join(dossier, chemin);
    if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!f.startsWith(path.resolve(dossier)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
  return { serveur, demandes, port: serveur.address().port };
}
/** Le morceau qui porte le tunnel : celui qui ecrit « La Consultation Souveraine ». */
const morceauDuTunnel = (dossier) => {
  const assets = path.join(dossier, 'assets');
  return readdirSync(assets).filter((f) => f.endsWith('.js')).find((f) => readFileSync(path.join(assets, f), 'utf8').includes('La Consultation Souveraine'));
};

const A = await sert(sans);
const B = await sert(avec);
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-porte-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail ? ' -> ' + detail : ''}`); };
const ouvre = async (s, page) => { await cdp('Page.navigate', { url: `http://127.0.0.1:${s.port}/${page}` }); await attend(4500); };
/* Le texte du document, pas celui de l'ecran : la papeterie du bilan appelle
   ses polices chez Google, et tant qu'elles n'ont pas repondu la page n'a
   pas de mise en page a lire (innerText rend vide). */
const texte = () => evalue(`document.body.textContent.replace(/\\s+/g, ' ').trim()`);
const ou = () => evalue('location.pathname');

/* LE TUNNEL LIT SON CATALOGUE SUR L'APPAREIL : sur un poste vierge il n'a
   aucune prestation a prescrire et ne se dessine pas (les semences sont
   vides depuis la remise a zero du 30 juillet 2026). Le banc lui pose trois
   prestations d'exemple, dans sa case a lui, avant que la page ne tourne. */
const CATALOGUE_D_EXEMPLE = ['sv-locks-moyennes', 'sv-locks-fines', 'sv-microlocks'].map((id) => ({ id, name: 'Une création', categoryId: 'atl-i', priceXof: 100000, durationMin: 240, priceMode: 'fixe', palier: 'Fondation' }));
await cdp('Page.enable');
await cdp('Page.addScriptToEvaluateOnNewDocument', {
  /* Le drapeau `mnd_reset_v5` d'abord : sans lui, la purge de reprise (store.ts) emporterait le catalogue pose. */
  source: `try { if (location.pathname === '/consultation.html') { localStorage.setItem('mnd_reset_v5', '1'); localStorage.setItem('consultation::mnd_catalog_services', ${JSON.stringify(JSON.stringify(CATALOGUE_D_EXEMPLE))}); } } catch (e) { /* sans memoire */ }`,
});

/* ── Sans serveur : l'equipe, comme au Trone ── */
await ouvre(A, 'consultation.html');
let t = await texte();
dit('sans serveur, le tunnel s ouvre', /Avant le rituel/.test(t ?? '') && (await ou()) === '/consultation.html', (t ?? '').slice(0, 60));
await evalue(`[...document.querySelectorAll('.lc-door')][0]?.click()`);
await attend(900);
t = await texte();
dit('... et l equipe garde ses deux passages du peage', /Poursuivre, je règle à la Maison/.test(t ?? '') && /J’ai réglé par Mobile Money moi-même, poursuivre/.test(t ?? ''), (t ?? '').match(/Poursuivre[^→]{0,40}/)?.[0] ?? 'absent');
await ouvre(A, 'bilan.html');
t = await texte();
dit('sans serveur, la papeterie du bilan s ouvre', /Prêt à remettre, expliquer, fidéliser\./.test(t ?? ''), (t ?? '').slice(0, 60));
await ouvre(A, 'certificat.html');
t = await texte();
dit('sans serveur, le certificat s ouvre', /Prêt à imprimer, envoyer, sceller\./.test(t ?? ''), (t ?? '').slice(0, 60));
const tunnelA = morceauDuTunnel(sans);
dit('... le code du tunnel a ete demande pour l equipe', !!tunnelA && A.demandes.includes(`/assets/${tunnelA}`), tunnelA ?? 'morceau introuvable');

/* ── Avec un serveur, personne de connecte : la visiteuse ── */
await ouvre(B, 'consultation.html');
t = await texte();
dit('une visiteuse qui a garde l adresse du tunnel est menee a /consultation/', (await ou()) === '/consultation/' && /la consultation du site/.test(t ?? ''), `${await ou()} · ${(t ?? '').slice(0, 40)}`);
const tunnelB = morceauDuTunnel(avec);
dit('... sans que le code du tunnel soit demande', !!tunnelB && !B.demandes.includes(`/assets/${tunnelB}`), tunnelB ?? 'morceau introuvable');
await ouvre(B, 'bilan.html');
t = await texte();
const versBilan = await evalue(`document.querySelector('[data-porte-de-l-equipe="dehors"] a')?.getAttribute('href')`);
dit('la papeterie du bilan ne se montre pas : une ligne, le chemin de Ma Couronne', /^Votre bilan se lit dans Ma Couronne\.\s?Ma Couronne\s?Équipe : le Trône$/.test(t ?? '') && versBilan === '/couronne/', `${(t ?? '').slice(0, 80)} · ${versBilan}`);
dit('... ni son reglage ni son papier', (await evalue(`document.querySelectorAll('.panel, .topbar, input, select').length`)) === 0, '');
await ouvre(B, 'certificat.html');
t = await texte();
const versCertificat = await evalue(`document.querySelector('[data-porte-de-l-equipe="dehors"] a')?.getAttribute('href')`);
dit('le certificat ne se dresse pas : une ligne, le chemin de l Academie', /^Un certificat se vérifie auprès de l’Académie MND\.\s?Académie MND\s?Équipe : le Trône$/.test(t ?? '') && versCertificat === '/academie/', `${(t ?? '').slice(0, 80)} · ${versCertificat}`);
dit('... ni son panneau ni son papier', (await evalue(`document.querySelectorAll('.ct-page, input, select').length`)) === 0, '');
dit('aucune erreur dans les pages', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); A.serveur.close(); B.serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nLa porte de l equipe tient, dans les vraies pages.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
