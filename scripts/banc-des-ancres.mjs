/* LE BANC DU TABLEAU DE BORD EN QUATRE BANDES — 5 novembre 2026.
   `node scripts/banc-des-ancres.mjs [dossier construit] [capture] [--prouve]`.

   D'abord (5 novembre 2026, le matin) le banc des ancres : « Les pages ne
   s'ouvrent pas : Le mois, Aujourd'hui, À traiter, Le détail du mois ne
   marchent pas. J'ai un message unexpected » (Yéman) ; le Trône vit derrière
   le dièse, `href="#le-mois"` y était une page inconnue. Le même jour, la
   maquette « Tableau de bord » est validée (« c'est bon construis ») : plus
   de sommaire à ancres, quatre bandes. Le banc ouvre le VRAI Trône, hors
   ligne, sur une Maison d'exemple (initiales seulement), et tient :
     - le tableau de bord s'ouvre, sans page d'erreur ;
     - les quatre bandes, dans l'ordre : l'en-tête (la date en titre), le
       bandeau de SIX chiffres, Aujourd'hui et À traiter, Le mois ;
     - plus de sommaire à ancres, plus de grand bloc « Mes pourboires », plus
       de grand bloc de la prévision ;
     - un message WhatsApp sans réponse est la ligne rouge en tête de « À
       traiter » ; « Le détail » est fermé au départ ;
     - un chiffre s'ouvre sur son écran (« 7 jours » : le calendrier) ;
     - une adresse inconnue ramène au tableau de bord ;
     - à 400 px de large, rien ne déborde, le bandeau passe en deux colonnes
       (trois à 800 px) ;
     - aucune erreur dans la page.
   `capture` (facultatif) : un préfixe ; <préfixe>-1280.png et
   <préfixe>-400.png, la page entière.
   `--prouve` : le banc se retourne contre lui-même. Une faute posée exprès
   (un chiffre caché, le mois retiré, le bandeau élargi de force, une erreur
   jetée) doit faire tomber les contrôles qui la gardent.

   Il attend le Trône construit sans serveur (sous Bash) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npx vite build --outDir "$TEMP/banc-trone-ancres" --emptyOutDir */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => a !== '--prouve');
const prouve = process.argv.includes('--prouve');
const construit = path.resolve(args[0] || path.join(tmpdir(), 'banc-trone-ancres'));
const capture = args[1] || '';
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}

/* ── Une Maison d'exemple : des initiales, des prix posés ── */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const auj = new Date();
const jour = (n) => iso(new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() + n));
const AUJ = jour(0);
const ilYA = (min) => new Date(Date.now() - min * 60000).toISOString();
const services = [
  { id: 's1', categoryId: 'c1', name: 'SÍNSIN™ Signature', palier: 'Fondation', priceXof: 40000, hidePrice: false, sessions: 1, durationMin: 240, order: 1 },
  { id: 's2', categoryId: 'c1', name: 'KLƆKLƆ™ Essentiel', palier: 'Fondation', priceXof: 10000, hidePrice: false, sessions: 1, durationMin: 60, order: 2 },
];
const INITIALES = ['V. A.', 'K. D.', 'A. K.', 'M. D.', 'F. S.', 'C. O.', 'N. B.', 'P. L.', 'T. E.', 'R. M.'];
const fiches = INITIALES.map((n, i) => ({ id: `c${i}`, branchId: 'maison', name: n, phone: `+22901510000${pad(i)}`, city: 'Cotonou', since: '2025-01-10', photo: null, segments: [], priceCoef: 1, loyaltyPoints: 0, diaspora: false }));
let k = 0;
const rdvs = []; const factures = [];
const rdv = (clientId, date, status, o = {}) => {
  const r = { id: `r${++k}`, branchId: 'maison', clientId, serviceIds: ['s1'], date, time: '10:00', status, master: 'Team', priceXof: 40000, creeLe: ilYA(30 * 24 * 60), ...o };
  rdvs.push(r);
  return r;
};
const facture = (r, payeLe, payeXof) => {
  const f = { id: `f${k}`, branchId: 'maison', kind: 'facture', number: `F-${pad(factures.length + 1)}`, clientId: r.clientId, clientName: INITIALES[Number(r.clientId.slice(1))], date: r.date,
    lines: [{ id: `l${k}`, label: 'Rituel', qty: 1, unitXof: r.priceXof, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose',
    status: payeXof >= r.priceXof ? 'payée' : 'envoyée', apptId: r.id,
    payments: payeXof > 0 ? [{ id: `p${k}`, date: payeLe, amountXof: payeXof, method: 'Espèces', cashbox: 'Accueil' }] : [] };
  r.invoiceId = f.id;
  /* Le rendez-vous porte son règlement, comme l'écrit l'encaissement. */
  if (payeXof > 0) { r.paidXof = payeXof; r.payments = [{ id: `p${k}`, date: payeLe, amountXof: payeXof, method: 'Espèces', invoiceId: f.id }]; }
  factures.push(f);
};
/* Trois mois d'honorés et d'encaissés (le graphique du mois), payés le jour même. */
for (let n = -75; n < 0; n += 2) {
  const d = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate() + n);
  if (d.getDay() === 0 || d.getDay() === 1) continue;
  const r = rdv(`c${(n + 80) % 8}`, iso(d), 'honoré', { serviceIds: [n % 3 ? 's1' : 's2'], priceXof: n % 3 ? 40000 : 10000 });
  facture(r, r.date, n % 7 === 0 ? 0 : r.priceXof);
}
/* Aujourd'hui : un rituel honoré et réglé ce matin, deux à venir. */
facture(rdv('c0', AUJ, 'honoré', { time: '08:30' }), AUJ, 40000);
rdv('c1', AUJ, 'confirmé', { time: '14:00', serviceIds: ['s2'], priceXof: 10000 });
rdv('c2', AUJ, 'en attente', { time: '16:30', serviceIds: ['s2'], priceXof: 10000 });
/* La semaine : quelques rendez-vous posés. */
for (const n of [1, 2, 4]) rdv(`c${n + 3}`, jour(n), 'confirmé', { time: '11:00' });
/* Un message WhatsApp sans réponse, dans la fenêtre de 24 h. */
const fils = [{ id: 'w1', sens: 'entrant', numero: '2290151000001', clientId: 'c1', texte: 'Bonjour, est-ce que je peux venir plus tôt ?', quand: ilYA(95), waId: 'wamid.banc1' }];
const SEME = `<script>localStorage.clear();localStorage.setItem('mnd_reset_v5','1');
localStorage.setItem('trone::mnd_clients', ${JSON.stringify(JSON.stringify(fiches))});
localStorage.setItem('trone::mnd_catalog_services', ${JSON.stringify(JSON.stringify(services))});
localStorage.setItem('trone::mnd_appointments', ${JSON.stringify(JSON.stringify(rdvs))});
localStorage.setItem('trone::mnd_invoices', ${JSON.stringify(JSON.stringify(factures))});
localStorage.setItem('trone::mnd_messages_wa', ${JSON.stringify(JSON.stringify(fils))});
</script>`;
/* La faute posée exprès (--prouve). */
const FAUTE = `<style>.tdb-kpis { min-width: 900px !important; } .tdb-kpi:nth-child(6) { display: none !important; } [data-tdb="mois"] { display: none !important; }</style>
<script>setTimeout(() => { throw new Error('faute posee par le banc'); }, 4000);</script>`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
let seme = false;
const serveur = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let f = path.join(construit, decodeURIComponent(url.pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(construit) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  let c = readFileSync(f);
  if (url.pathname === '/trone.html') {
    let t = c.toString('utf8');
    if (!seme) { seme = true; t = t.replace('<head>', '<head>' + SEME); }
    if (prouve) t = t.replace('</head>', FAUTE + '</head>');
    c = Buffer.from(t);
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(c);
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-tdb-'));
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
const taille = (largeur, hauteur = 900) => cdp('Emulation.setDeviceMetricsOverride', { width: largeur, height: hauteur, deviceScaleFactor: 1, mobile: largeur < 600 });
await cdp('Runtime.enable');
await cdp('Page.enable');
await taille(1280);

let ko = 0;
const tombes = [];
const dit = (nom, ok, detail) => { if (!ok) { ko++; tombes.push(nom); } console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + String(detail).slice(0, 220) : ''}`); };
const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
const erreurDuRouteur = () => evalue(`/Unexpected Application Error|404 Not Found|Cet écran ne s.est pas ouvert/.test(document.body.innerText)`);

/* Ce qui dépasse à droite sans être dans une rangée qui glisse (la règle du banc du téléphone). */
const RELEVE = `(() => {
  const glisse = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX === 'visible') continue;
      return p.getBoundingClientRect().right <= innerWidth + 1;
    }
    return false;
  };
  const visible = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const dehors = [...document.querySelectorAll('body *')].filter((e) => {
    if (e.closest('.tr-side') || !visible(e)) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > innerWidth + 1 && !glisse(e);
  });
  const racines = dehors.filter((e) => !dehors.includes(e.parentElement));
  return { largeur: document.documentElement.scrollWidth, dehors: racines.slice(0, 5).map((e) => String(typeof e.className === 'string' && e.className ? e.className.split(' ')[0] : e.tagName).slice(0, 40) + ' ' + Math.round(e.getBoundingClientRect().right) + 'px') };
})()`;
const colonnesDuBandeau = () => evalue(`(() => { const b = document.querySelector('[data-tdb="bandeau"]'); return b ? getComputedStyle(b).gridTemplateColumns.split(' ').filter(Boolean).length : 0; })()`);

/* La page entière : elle défile dans son conteneur, la fenêtre s'allonge le temps de la photo. */
const photo = async (largeur) => {
  if (!capture) return;
  const h = await evalue(`Math.max(...[document.documentElement, ...document.querySelectorAll('*')].map((e) => e.scrollHeight))`);
  await taille(largeur, Math.min(Math.max(h, 900), 6000));
  await attend(700);
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${largeur}.png`, Buffer.from(img.result.data, 'base64'));
  await taille(largeur);
  await attend(400);
};

await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/` });
await jusqua(`!!document.querySelector('[data-tdb="bandeau"]')`, 20000);
await attend(2500);

/* 1. L'écran s'ouvre. */
dit('le tableau de bord s ouvre, aucune page d erreur', !(await erreurDuRouteur()) && (await evalue('location.hash')) === '#/', await evalue('location.hash'));

/* 2. Les quatre bandes, visibles, dans l'ordre. */
const bandes = await evalue(`(() => {
  const ordre = ['tete', 'bandeau', 'aujourdhui', 'a-traiter', 'mois'].map((k) => document.querySelector('.tdb [data-tdb="' + k + '"]'));
  const vues = ordre.map((e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== 'none');
  const dansLOrdre = ordre.every((e, i) => !e || i === 0 || !ordre[i - 1] || (ordre[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
  return { vues, dansLOrdre };
})()`);
dit('les quatre bandes : en-tete, bandeau, Aujourd hui et A traiter, Le mois, dans l ordre', bandes?.vues.every(Boolean) && bandes.dansLOrdre, JSON.stringify(bandes));

/* 3. Six chiffres au bandeau. */
const chiffres = await evalue(`[...document.querySelectorAll('[data-tdb="bandeau"] .tdb-kpi')].filter((e) => e.getClientRects().length > 0).map((e) => e.querySelector('.tdb-kpi__v')?.textContent?.trim() ?? '')`);
dit('six chiffres au bandeau, chacun un nombre', Array.isArray(chiffres) && chiffres.length === 6 && chiffres.every((v) => /\d/.test(v)), JSON.stringify(chiffres));

/* 4. La date en titre, plus de « Bonjour ». */
const attendu = (() => {
  const t = auj.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^(\S+) 1 /, '$1 1er ');
  return t.charAt(0).toUpperCase() + t.slice(1);
})();
const titre = await evalue(`document.querySelector('[data-tdb="tete"] h1')?.textContent?.trim() ?? ''`);
dit('la date du jour en titre, sans « Bonjour »', titre === attendu && !(await evalue(`/\\bBonjour\\b|\\bBonsoir\\b/.test(document.querySelector('.tdb')?.innerText ?? '')`)), `${titre} / ${attendu}`);

/* 5. Ce qui a quitté l'écran. */
const partis = await evalue(`({ sommaire: !!document.querySelector('.trd-nav'), pourboires: !!document.querySelector('.tpb'), prevision: !!document.querySelector('.trd-mois') })`);
dit('plus de sommaire a ancres, ni de grand bloc des pourboires, ni de la prevision', partis && !partis.sommaire && !partis.pourboires && !partis.prevision, JSON.stringify(partis));

/* 6. À traiter : le message sans réponse, rouge, en tête ; Le détail fermé. */
const premiere = await evalue(`(() => { const t = document.querySelector('[data-tdb="a-traiter"] .tdb-tache'); return t ? { k: t.dataset.tache, ko: t.classList.contains('est-ko'), n: t.querySelector('.tdb-tache__n')?.textContent } : null; })()`);
dit('le message WhatsApp sans reponse est la ligne rouge en tete de A traiter', premiere?.k === 'whatsapp' && premiere.ko === true && premiere.n === '1', JSON.stringify(premiere));
dit('Le detail est ferme au depart', (await evalue(`!!document.querySelector('[data-tdb="detail"]') && document.querySelectorAll('[data-tdb="detail"] .trd-repli.est-ouvert').length === 0`)) === true);

/* 7. Un chiffre s'ouvre sur son écran. */
await evalue(`document.querySelector('[data-kpi="sept"]')?.click(); true`);
await attend(1500);
dit('« 7 jours » s ouvre sur le calendrier', (await evalue('location.hash')) === '#/calendrier' && !(await erreurDuRouteur()), await evalue('location.hash'));
await evalue(`location.hash = '#/'; true`);
await jusqua(`!!document.querySelector('[data-tdb="bandeau"]')`, 15000);
await attend(800);
await photo(1280);

/* 8. Une adresse inconnue. */
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/le-mois` });
await attend(3500);
dit('une adresse inconnue ramene au tableau de bord, sans page d erreur', (await evalue('location.hash')) === '#/' && !(await erreurDuRouteur()) && !!(await jusqua(`!!document.querySelector('[data-tdb="bandeau"]')`, 10000)), await evalue('location.hash'));

/* 9. Les largeurs : trois colonnes à 800 px, deux à 400 px, rien ne déborde. */
await taille(800);
await attend(700);
const a800 = await colonnesDuBandeau();
/* Le téléphone se juge ouvert à sa largeur, comme le banc du téléphone :
   l'émulation mobile garde sinon la fenêtre large du bureau. */
await taille(400, 860);
await cdp('Page.reload', {});
await jusqua(`!!document.querySelector('[data-tdb="bandeau"]')`, 20000);
await attend(2500);
const a400 = await colonnesDuBandeau();
const r400 = await evalue(RELEVE);
dit('le bandeau passe en trois colonnes (800 px) puis deux (400 px)', a800 === 3 && a400 === 2, `${a800} puis ${a400}`);
dit('a 400 px de large, rien ne deborde', !!r400 && r400.largeur <= 400 && r400.dehors.length === 0, r400 ? `page ${r400.largeur} px ; dehors : ${r400.dehors.join(', ') || 'rien'}` : 'aucun releve');
await photo(400);

await attend(prouve ? 1500 : 0);
dit('aucune erreur dans la page', erreurs.length === 0, [...new Set(erreurs)].slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
if (prouve) {
  /* Chaque faute posée doit faire tomber le contrôle qui la garde. */
  const gardiens = ['les quatre bandes', 'six chiffres au bandeau', 'a 400 px de large, rien ne deborde', 'aucune erreur dans la page'];
  const muets = gardiens.filter((g) => !tombes.some((t) => t.startsWith(g)));
  console.log(muets.length === 0 ? `\nPREUVE : la faute posee fait tomber les ${gardiens.length} controles qui la gardent.` : `\nPREUVE MANQUEE : muets ${muets.join(' | ')}`);
  setTimeout(() => process.exit(muets.length === 0 ? 0 : 1), 1600);
} else {
  console.log(ko === 0 ? '\nLe tableau de bord tient en quatre bandes.' : `\n${ko} controle(s) en echec.`);
  setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
}
