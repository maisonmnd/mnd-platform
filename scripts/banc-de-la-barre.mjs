/* LE BANC DE LA BARRE — `node scripts/banc-de-la-barre.mjs [dossier construit]`.

   1er octobre 2026 : « quand je clique dans la barre de navigation du Trône,
   c'est lent » (Yéman), pour la troisième fois en deux jours. Les deux
   premières réponses avaient trouvé de vraies pannes (la tranche de mille
   lignes, la boucle des fiches) sans que la lenteur parte. Une lenteur ne se
   devine pas, elle se mesure : ce banc fait tourner le VRAI Trône, hors
   ligne, sur une Maison factice de la taille de la vraie, clique dans la
   barre, et compte ce que chaque clic coûte en lectures et en écritures de
   la mémoire du navigateur.

   Il attend un Trône construit SANS serveur ni connexion :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir
   Jamais dans dist-sites/ : ce Trône-là n'a pas de porte. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const construit = process.argv[2] || path.join(tmpdir(), 'banc-trone');
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trone construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
const FICHES = Number(process.env.BANC_FICHES || 520);
const RDV = Number(process.env.BANC_RDV || 1040);
const FACTURES = Number(process.env.BANC_FACTURES || 700);
/* Le poids d'une photo de fiche, en caractères : 7 000 pour une vignette,
   57 000 pour une photo d'avant le 29 août. */
const PHOTO = Number(process.env.BANC_PHOTO || 7000);
const AVEC_PHOTO = Number(process.env.BANC_AVEC_PHOTO || 60);
/* L'ecran a capturer, SANS barre initiale (`BANC_ROUTE=parametres`) : sous Git
   Bash, MSYS convertirait `/parametres` en chemin Windows. */
const ROUTE_DE_LA_CAPTURE = '/' + String(process.env.BANC_ROUTE || 'carnet').replace(/^\/+/, '');
/* La hauteur de la capture, pour voir le bas d'une longue liste. */
const HAUT = Number(process.env.BANC_HAUT || 1500);
const ROUTES = ['/carnet', '/customers', '/calendrier', '/caisse', '/factures', '/tableau', '/a-faire', '/synthese', '/', '/carnet', '/customers'];

/* Ce qui s'exécute AVANT l'application, dans sa fenêtre : on enveloppe la
   mémoire du navigateur pour compter, sans rien changer à ce qu'elle rend. */
const SONDE = `<script>(function(){
  var B = window.__banc = { lit: 0, carLus: 0, msLu: 0, ecrit: 0, carEcrits: 0, msEcrit: 0, longues: 0, parCle: {} };
  var g = Storage.prototype.getItem, s = Storage.prototype.setItem;
  var c = function (k) { return B.parCle[k] || (B.parCle[k] = { lit: 0, ecrit: 0 }); };
  Storage.prototype.getItem = function (k) { var t = performance.now(); var v = g.call(this, k); B.msLu += performance.now() - t; B.lit++; if (v) B.carLus += v.length; c(k).lit++; return v; };
  Storage.prototype.setItem = function (k, v) { var t = performance.now(); try { return s.call(this, k, v); } finally { B.msEcrit += performance.now() - t; B.ecrit++; B.carEcrits += String(v).length; c(k).ecrit++; } };
  try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { B.longues += e.duration; }); }).observe({ entryTypes: ['longtask'] }); } catch (e) {}
})();</script>`;

const SEMENCE = `
const P = ${JSON.stringify({ FICHES, RDV, FACTURES, PHOTO, AVEC_PHOTO, ROUTES })};
const pad = (n, l) => String(n).padStart(l, '0');
const jour = (k) => { const d = new Date(Date.UTC(2026, 0, 5) + k * 86400000); return d.toISOString().slice(0, 10); };
const fiches = Array.from({ length: P.FICHES }, (_, i) => ({
  id: 'c' + pad(i, 5), branchId: 'maison', name: 'Cliente ' + pad(i, 4), phone: '+22901' + pad(51000000 + i, 8), city: 'Cotonou',
  persona: 'p-initie', since: jour(i % 250), segments: [], priceCoef: 1, loyaltyPoints: i % 40,
  notes: 'Note de suivi. '.repeat(6), crownStyle: 'Locks fines', lockCount: 180 + (i % 90), joursPreferes: [i % 6],
  comptages: [{ date: jour(40 + (i % 100)), total: 180 + (i % 90) }],
  ...(i < P.AVEC_PHOTO ? { photo: 'data:image/jpeg;base64,' + 'A'.repeat(P.PHOTO) } : {}),
}));
const rdvs = Array.from({ length: P.RDV }, (_, i) => {
  const c = fiches[i % P.FICHES]; const k = i % 300; const passe = k < 272;
  return { id: 'a' + pad(i, 5), branchId: 'maison', clientId: c.id, clientName: c.name, serviceIds: [], date: jour(k), time: pad(8 + (i % 9), 2) + ':00',
    master: 'Brice', status: passe ? 'honoré' : 'confirmé', priceXof: 12000 + (i % 7) * 1000, paidXof: passe ? 12000 + (i % 7) * 1000 : 0,
    payments: passe ? [{ id: 'p' + i, amountXof: 12000 + (i % 7) * 1000, date: jour(k), method: 'Espèces' }] : [], source: 'trone', creeLe: jour(Math.max(0, k - 9)) };
});
const factures = Array.from({ length: P.FACTURES }, (_, i) => {
  const c = fiches[i % P.FICHES]; const k = i % 272;
  return { id: 'f' + pad(i, 5), branchId: 'maison', kind: 'facture', number: 'F-2026-' + pad(i, 4), clientId: c.id, clientName: c.name, date: jour(k),
    lines: [{ id: 'l' + i, label: 'Entretien des locks', qty: 1, unitXof: 12000 + (i % 7) * 1000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'payée',
    payments: [{ id: 'q' + i, amountXof: 12000 + (i % 7) * 1000, date: jour(k), method: 'Espèces' }] };
});
/* LA SALLE D'ATTENTE DES ENVOIS, pour la regarder : deux messages qui partent
   bientot, un qui attend la fin des heures calmes, un retenu, un parti. */
const dans = (min) => new Date(Date.now() + min * 60000).toISOString();
const envoi = (i, plus) => ({ id: 'conf-a' + pad(i, 5) + '-whatsapp', branchId: 'maison', type: 'confirmation', canal: 'whatsapp',
  apptId: 'a' + pad(i, 5), clientId: fiches[i].id, prenom: 'Cliente', dateRdv: jour(280 + i), heure: '10:00', quand: dans(-2), ...plus });
const envois = [
  envoi(1, { statut: 'en-attente', partA: dans(4), deposeLe: dans(-6) }),
  envoi(2, { statut: 'en-attente', partA: dans(7), deposeLe: dans(-3) }),
  envoi(3, { type: 'avis-google', statut: 'en-attente', partA: dans(540), calme: true, deposeLe: dans(-30) }),
  envoi(4, { statut: 'retenu', retenuPar: 'Yéman', retenuLe: dans(-12) }),
  envoi(5, { statut: 'envoyé', etat: 'remis' }),
];
localStorage.clear();
localStorage.setItem('mnd_reset_v5', '1');
const tailles = {};
for (const [cle, v] of [['mnd_clients', fiches], ['mnd_appointments', rdvs], ['mnd_invoices', factures], ['mnd_envois', envois]]) {
  const j = JSON.stringify(v); tailles[cle] = j.length; localStorage.setItem('trone::' + cle, j);
}`;

/* LA CAPTURE : la meme Maison factice, un seul ecran, pour le regarder. */
const VUE = (route) => `<!doctype html><meta charset="utf-8"><title>vue</title><style>html,body{margin:0}</style><iframe id="f" style="width:1400px;height:${HAUT}px;border:0"></iframe>
<script>${SEMENCE}
const f = document.getElementById('f');
f.src = '/trone.html#${route}';
/* \`BANC_CHERCHE=texte\` : la capture se cale sur le premier titre qui le porte. */
const cherche = ${JSON.stringify(process.env.BANC_CHERCHE || '')};
if (cherche) setTimeout(() => {
  const cible = [...f.contentDocument.querySelectorAll('h1, h2, h3, [class*="title"]')].find((e) => e.textContent.includes(cherche));
  if (cible) cible.scrollIntoView({ block: 'start' });
}, 5000);
</script>`;

const PAGE = `<!doctype html><meta charset="utf-8"><title>banc</title><iframe id="f" style="width:1400px;height:900px;border:0"></iframe>
<script>${SEMENCE}
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
const f = document.getElementById('f');
f.src = '/trone.html';
f.onload = async () => {
  const w = f.contentWindow;
  const deuxImages = () => new Promise((r) => w.requestAnimationFrame(() => w.requestAnimationFrame(r)));
  const photo = () => { const b = w.__banc; return { lit: b.lit, carLus: b.carLus, msLu: b.msLu, ecrit: b.ecrit, carEcrits: b.carEcrits, msEcrit: b.msEcrit, longues: b.longues, parCle: JSON.parse(JSON.stringify(b.parCle)) }; };
  await attend(9000);
  const ouverture = photo();
  const clics = [];
  for (const route of P.ROUTES) {
    const a = photo(); const t0 = performance.now();
    w.location.hash = '#' + route;
    await deuxImages(); const affiche = performance.now() - t0;
    await attend(2500);
    const b = photo();
    const cles = Object.keys(b.parCle).map((k) => ({ k, lit: b.parCle[k].lit - ((a.parCle[k] || {}).lit || 0), ecrit: b.parCle[k].ecrit - ((a.parCle[k] || {}).ecrit || 0) }))
      .filter((x) => x.lit + x.ecrit > 0).sort((x, y) => y.lit - x.lit).slice(0, 4);
    clics.push({ route, afficheMs: Math.round(affiche), lectures: b.lit - a.lit, MoLus: +((b.carLus - a.carLus) / 1048576).toFixed(1), msLecture: Math.round(b.msLu - a.msLu),
      ecritures: b.ecrit - a.ecrit, MoEcrits: +((b.carEcrits - a.carEcrits) / 1048576).toFixed(1), msEcriture: Math.round(b.msEcrit - a.msEcrit), bloqueMs: Math.round(b.longues - a.longues), cles,
      titre: (w.document.querySelector('h1, .mnd-page__title, [class*="title"]') || {}).textContent || '' });
  }
  const vues = { fiches: (JSON.parse(localStorage.getItem('trone::mnd_clients') || '[]')).length, rdv: (JSON.parse(localStorage.getItem('trone::mnd_appointments') || '[]')).length };
  await fetch('/resultat', { method: 'POST', body: JSON.stringify({ tailles, ouverture: { lectures: ouverture.lit, MoLus: +(ouverture.carLus / 1048576).toFixed(1), msLecture: Math.round(ouverture.msLu), ecritures: ouverture.ecrit, MoEcrits: +(ouverture.carEcrits / 1048576).toFixed(1), msEcriture: Math.round(ouverture.msEcrit), bloqueMs: Math.round(ouverture.longues) }, clics, vues, erreur: w.document.body.innerText.slice(0, 0) }) });
};
</script>`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.svg': 'image/svg+xml' };
let rend;
const fini = new Promise((r) => { rend = r; });
const serveur = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/resultat') {
    let corps = '';
    req.on('data', (d) => { corps += d; });
    req.on('end', () => { res.end('ok'); rend(JSON.parse(corps)); });
    return;
  }
  if (url.pathname === '/banc.html') { res.writeHead(200, { 'content-type': TYPES['.html'] }); res.end(PAGE); return; }
  if (url.pathname === '/vue.html') { res.writeHead(200, { 'content-type': TYPES['.html'] }); res.end(VUE(url.searchParams.get('route') || '/carnet')); return; }
  const fichier = path.join(construit, decodeURIComponent(url.pathname));
  if (!fichier.startsWith(construit) || !existsSync(fichier)) { res.writeHead(404); res.end(); return; }
  let contenu = readFileSync(fichier);
  if (url.pathname === '/trone.html') contenu = Buffer.from(contenu.toString('utf8').replace('<head>', '<head>' + SONDE));
  res.writeHead(200, { 'content-type': TYPES[path.extname(fichier)] || 'application/octet-stream' });
  res.end(contenu);
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;
const profil = mkdtempSync(path.join(tmpdir(), 'banc-profil-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',
  ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profil}`, '--window-size=1500,1000', `http://127.0.0.1:${port}/banc.html`], { stdio: 'ignore' });
const delai = setTimeout(() => rend({ panne: 'aucun resultat en 120 s' }), 120000);
const r = await fini;
clearTimeout(delai);
chrome.kill();
/* `BANC_CAPTURE=fichier.png [BANC_ROUTE=carnet]` : une image de l'ecran, apres la mesure. */
if (process.env.BANC_CAPTURE) {
  /* En asynchrone : un appel bloquant figerait ce serveur, et le navigateur
     attendrait sans fin la page qu'on ne peut plus lui servir. */
  const profilVue = mkdtempSync(path.join(tmpdir(), 'banc-vue-'));
  const vue = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${profilVue}`,
    `--window-size=1400,${HAUT}`, '--virtual-time-budget=9000', `--screenshot=${process.env.BANC_CAPTURE}`,
    `http://127.0.0.1:${port}/vue.html?route=${encodeURIComponent(ROUTE_DE_LA_CAPTURE)}`], { stdio: 'ignore' });
  await new Promise((r) => { const t = setTimeout(() => { vue.kill(); r(); }, 60000); vue.on('exit', () => { clearTimeout(t); r(); }); });
  setTimeout(() => { try { rmSync(profilVue, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
}
serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* le profil se libere apres */ } }, 1500);

if (r.panne) { console.error(r.panne); process.exit(1); }
const Ko = (n) => `${Math.round(n / 1024)} Ko`;
console.log(`Maison factice : ${FICHES} fiches (${Ko(r.tailles.mnd_clients)}), ${RDV} rendez-vous (${Ko(r.tailles.mnd_appointments)}), ${FACTURES} factures (${Ko(r.tailles.mnd_invoices)}). Vues par l'appli a la fin : ${r.vues.fiches} fiches, ${r.vues.rdv} rendez-vous.`);
const o = r.ouverture;
console.log(`Ouverture (9 s) : ${o.lectures} lectures, ${o.MoLus} Mo relus en ${o.msLecture} ms ; ${o.ecritures} ecritures, ${o.MoEcrits} Mo ecrits en ${o.msEcriture} ms ; ecran bloque ${o.bloqueMs} ms.`);
console.log('clic            | affichage | lectures | Mo relus | ms a relire | ecritures | Mo ecrits | ms a ecrire | ecran bloque');
for (const c of r.clics) {
  console.log(`${c.route.padEnd(15)} | ${String(c.afficheMs).padStart(6)} ms | ${String(c.lectures).padStart(8)} | ${String(c.MoLus).padStart(8)} | ${String(c.msLecture).padStart(11)} | ${String(c.ecritures).padStart(9)} | ${String(c.MoEcrits).padStart(9)} | ${String(c.msEcriture).padStart(11)} | ${String(c.bloqueMs).padStart(9)} ms`);
}
const total = r.clics.reduce((s, c) => ({ lectures: s.lectures + c.lectures, Mo: s.Mo + c.MoLus, ms: s.ms + c.msLecture, aff: s.aff + c.afficheMs }), { lectures: 0, Mo: 0, ms: 0, aff: 0 });
console.log(`Moyenne par clic : ${Math.round(total.lectures / r.clics.length)} lectures, ${(total.Mo / r.clics.length).toFixed(1)} Mo relus, ${Math.round(total.ms / r.clics.length)} ms a relire, ${Math.round(total.aff / r.clics.length)} ms avant l'affichage.`);
console.log('Les cles les plus relues au premier clic : ' + r.clics[0].cles.map((x) => `${x.k} x${x.lit}`).join(', '));
if (process.env.BANC_JSON) console.log(JSON.stringify(r));
