/* LE BANC DE « SON PROCHAIN RITUEL » — `node scripts/banc-du-prochain-rituel.mjs [dossier construit] [dossier des captures]`.

   2 novembre 2026, maquette « Remplir les fauteuils », Un · La Caisse. Le
   harnais `verifie-le-prochain-rituel` éprouve les règles ; ce banc ouvre le
   VRAI Trône, hors ligne, et encaisse comme une main :

     - une habituée fictive (Paule A.) : un lavage toutes les deux semaines,
       un soin venu une seule fois ; elle règle son lavage du jour ;
     - l'écran de réussite montre « Son prochain rituel » : deux puces, le
       lavage choisi d'office (son rythme mesuré), trois places ;
     - une place prise entre-temps (deux rendez-vous écrits au carnet après
       l'affichage) : le toucher la relit, ne pose rien, et le dit ;
     - un toucher sur une place libre pose le rendez-vous CONFIRMÉ, au Trône,
       estampillé, sans « sans confirmation », et dit la phrase entière ;
     - au ticket suivant, son rendez-vous déjà posé se dit ; « Pas
       maintenant » ne pose rien ;
     - au téléphone, rien ne déborde.

   Il attend le Trône construit sans serveur (sous Bash : sous PowerShell, une
   variable vide est SUPPRIMÉE et Vite reprend le vrai .env) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const construit = process.argv[2] || path.join(tmpdir(), 'banc-trone');
const captures = process.argv[3] || '';
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
if (captures) mkdirSync(captures, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = createServer((req, res) => {
  let f = path.join(construit, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-prochain-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

let ko = 0;
/* La console Windows parle cp1252 : tout ce qui sort est ramené à l'ASCII. */
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`)); };
const clique = (selecteur, texte) => evalue(`(() => {
  const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const tape = (selecteur, valeur) => evalue(`(() => {
  const el = document.querySelector(${JSON.stringify(selecteur)});
  if (!el) return false;
  el.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const texte = (selecteur) => evalue(`(document.querySelector(${JSON.stringify(selecteur)})?.textContent || '').replace(/\\s+/g, ' ').trim()`);
const capture = async (nom, l, h, mobile) => {
  if (!captures) return;
  await cdp('Emulation.setDeviceMetricsOverride', { width: l, height: h, deviceScaleFactor: 1, mobile });
  await attend(500);
  const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(path.join(captures, `${nom}.png`), Buffer.from(img.result.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
};

/* LA MAISON D'EXEMPLE — fictive : deux fauteuils, Team et Expert, un tiroir,
   deux prestations ; Paule A. lavée toutes les deux semaines, à 13 h chez
   Team, et un soin venu une seule fois il y a deux mois. */
const pad = (n) => String(n).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const jourPlus = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return isoDe(d); };
const rdv = (rid, date, serviceIds, status = 'honoré') => ({ id: rid, branchId: 'maison', clientId: 'cl-pa', serviceIds, date, time: '13:00', status, master: 'Team', priceXof: 10000 });
const SEMENCE = {
  'trone::mnd_branches': [{ id: 'maison', name: 'Maison du banc', city: 'Cotonou', country: 'Bénin', dial: '+229', currency: 'XOF', address: '', seats: 2, masters: ['Team', 'Expert'], masterParDefaut: 'Team', status: 'active', flagship: true }],
  'trone::mnd_current_branch': 'maison',
  'trone::mnd_cashboxes': [{ id: 'cb-acc', branchId: 'maison', name: 'Accueil espèces', sub: 'Tiroir du comptoir', glyph: '◈', openingXof: 0 }],
  'trone::mnd_catalog_services': [
    { id: 'sv-lavage', categoryId: '', name: 'Lavage du banc · Le Souffle', palier: 'Fondation', priceXof: 10000, durationMin: 30, hidePrice: false, sessions: 1, order: 1 },
    { id: 'sv-soin', categoryId: '', name: 'Soin du banc', palier: 'Fondation', priceXof: 20000, durationMin: 60, hidePrice: false, sessions: 1, order: 2 },
  ],
  'trone::mnd_clients': [
    { id: 'cl-pa', branchId: 'maison', name: 'Paule A.', phone: '0100000051', city: '', persona: '', since: '2026-01-10', segments: [] },
  ],
  'trone::mnd_appointments': [
    rdv('h0', jourPlus(-60), ['sv-soin']),
    rdv('h1', jourPlus(-42), ['sv-lavage']),
    rdv('h2', jourPlus(-28), ['sv-lavage']),
    rdv('h3', jourPlus(-14), ['sv-lavage']),
  ],
  'trone::mnd_invoices': [],
};
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('banc_seme')) { sessionStorage.setItem('banc_seme', '1'); localStorage.setItem('mnd_reset_v5', '1'); for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); } } catch (e) {}` });
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/caisse` });
await attend(8000);

/* ── 1. LE TICKET : elle, son lavage, en espèces ── */
const encaisseSonLavage = async () => {
  await tape('.trc-clientpick input', 'Paule');
  await attend(400);
  const prise = await clique('.trc-clientpick__opt', 'Paule A.');
  await attend(600);
  const lavage = await clique('.trv-pick', 'Lavage du banc');
  await attend(600);
  await clique('.trv-etape__ligne', 'Comment elle paie');
  await attend(300);
  const especes = await clique('.trv-pay', 'Espèces');
  await attend(400);
  /* Le bouton du pied du ticket : l'onglet « Encaisser » porte le même mot. */
  const encaisse = await clique('.trv-ticket__pied button', 'Encaisser 10');
  await attend(2500);
  return prise && lavage && especes && encaisse;
};
dit('la caisse s ouvre', await evalue(`!!document.querySelector('.trv-pick')`));
dit('Paule A. règle son lavage en espèces', await encaisseSonLavage());
dit('l écran de réussite paraît', await evalue(`!!document.querySelector('.trv-reussite')`));

/* ── 2. SON PROCHAIN RITUEL ── */
dit('le bloc « Son prochain rituel » est là', (await texte('.trv-prochain__etiquette')) === 'Son prochain rituel', await texte('.trv-prochain__etiquette'));
const puces = await evalue(`[...document.querySelectorAll('.trv-prochain__rituel')].map((b) => [b.querySelector('.trv-prochain__rituel-nom')?.textContent, b.getAttribute('aria-pressed')])`);
dit('deux puces, le lavage choisi d office (son rythme mesuré passe devant le soin venu une fois)',
  JSON.stringify(puces) === JSON.stringify([['Lavage du banc', 'true'], ['Soin du banc', 'false']]), JSON.stringify(puces));
const vers = await evalue(`[...document.querySelectorAll('.trv-prochain__doux')].map((p) => p.textContent).join(' | ')`);
dit('son rythme se dit, et la date visée avec son année', /toutes les 2 semaines/.test(vers) && /Vers le .+ \d{4}, 2 semaines après aujourd’hui/.test(vers), vers);
const places = async () => evalue(`[...document.querySelectorAll('.trv-prochain__place')].map((b) => ({ iso: b.dataset.iso, heure: b.dataset.heure, t: b.textContent.replace(/\\s+/g, ' ').trim() }))`);
const avant = await places();
dit('trois places, toutes après aujourd hui, rangées dans le temps', avant.length === 3 && avant.every((p) => p.iso > jourPlus(0))
  && avant.every((p, i) => i === 0 || `${avant[i - 1].iso} ${avant[i - 1].heure}` <= `${p.iso} ${p.heure}`), JSON.stringify(avant.map((p) => `${p.iso} ${p.heure}`)));
dit('chaque place dit son prix et Team', avant.every((p) => /10\s?000\s?F/u.test(p.t) && p.t.includes('Avec Team.')), avant[0]?.t);
await capture('prochain-rituel-bureau', 1280, 1400, false);
await capture('prochain-rituel-telephone', 390, 1600, true);

/* ── 3. LA PLACE PARTIE ENTRE-TEMPS : deux rendez-vous écrits après l'affichage ──
   Comme une synchro qui arrive sans que l'écran ait été redessiné : le disque
   change, les magasins apprennent qu'il faut le relire (un « storage » sans
   clé ne prévient personne), la place affichée reste à l'écran. */
const premiere = avant[0];
await evalue(`(() => {
  const k = 'trone::mnd_appointments';
  const l = JSON.parse(localStorage.getItem(k) || '[]');
  for (const [i, c] of [['x1', 'cl-x1'], ['x2', 'cl-x2']]) l.push({ id: 'pris-' + i, branchId: 'maison', clientId: c, serviceIds: ['sv-lavage'], date: ${JSON.stringify(premiere?.iso)}, time: ${JSON.stringify(premiere?.heure)}, status: 'confirmé', master: i === 'x1' ? 'Team' : 'Expert' });
  localStorage.setItem(k, JSON.stringify(l));
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  return true;
})()`);
dit('la place partie est encore à l écran', !!(await evalue(`!!document.querySelector('.trv-prochain__place[data-iso="${premiere?.iso}"][data-heure="${premiere?.heure}"]')`)));
await evalue(`document.querySelector('.trv-prochain__place[data-iso="${premiere?.iso}"][data-heure="${premiere?.heure}"]')?.click()`);
await attend(700);
const alerte = await texte('.trv-prochain__note[role="alert"]');
dit('le toucher relit la place : elle est partie, rien n est posé', /vient de partir/.test(alerte), alerte);
const siensApres1 = ((await lis('trone::mnd_appointments')) ?? []).filter((a) => a.clientId === 'cl-pa' && a.date > jourPlus(0));
dit('... et le carnet n a reçu aucun rendez-vous pour elle', siensApres1.length === 0, siensApres1.length);

/* ── 4. UN TOUCHER POSE, CONFIRMÉ ── */
const relues = await places();
dit('les places sont relues : la place partie n est plus proposée', relues.length > 0 && !relues.some((p) => p.iso === premiere?.iso && p.heure === premiere?.heure), JSON.stringify(relues.map((p) => `${p.iso} ${p.heure}`)));
const choisie = relues[0];
await evalue(`document.querySelector('.trv-prochain__place[data-iso="${choisie?.iso}"][data-heure="${choisie?.heure}"]')?.click()`);
await attend(900);
const issue = await texte('.trv-prochain__issue b');
dit('l écran dit la phrase entière, avec l année', /^Posé, confirmé : \S+ \d{1,2} \S+ \d{4} à \d{1,2} h( \d{2})?\.$/u.test(issue) && !issue.includes('—'), issue);
dit('... et ce qui part vers elle', (await texte('.trv-prochain__issue')).includes('La confirmation part sur WhatsApp ; la veille, son rappel suit.'));
const pose = ((await lis('trone::mnd_appointments')) ?? []).filter((a) => a.clientId === 'cl-pa' && a.date > jourPlus(0));
const p = pose[0];
dit('un rendez-vous et un seul est posé, à la place touchée', pose.length === 1 && p.date === choisie?.iso && p.time === choisie?.heure, JSON.stringify(pose.map((a) => `${a.date} ${a.time}`)));
dit('posé confirmé, au Trône, chez Team, au prix et à la durée de la fenêtre', p?.status === 'confirmé' && p?.source === 'trone' && p?.master === 'Team' && p?.priceXof === 10000 && p?.dureeMin === 30,
  JSON.stringify({ s: p?.status, src: p?.source, m: p?.master, prix: p?.priceXof, d: p?.dureeMin }));
dit('estampillé, sans « sans confirmation » : la confirmation-rdv le balaiera', !!p?.creeLe && !('sansConfirmation' in (p ?? {})), JSON.stringify({ creeLe: p?.creeLe, sans: p?.sansConfirmation }));

/* ── 5. LE TICKET SUIVANT : son rendez-vous se dit ; « Pas maintenant » ne pose rien ── */
dit('« Ticket suivant » repart', await clique('button', 'Ticket suivant'));
await attend(700);
dit('un second lavage se règle', await encaisseSonLavage());
const deja = await evalue(`[...document.querySelectorAll('.trv-prochain__doux')].map((x) => x.textContent).join(' | ')`);
dit('son prochain rendez-vous déjà posé se dit d abord', deja.includes('Elle a déjà son prochain rendez-vous') && /\d{4} à/.test(deja), deja);
dit('« En poser un autre » rouvre ses rituels', await clique('.trv-prochain button', 'En poser un autre'));
await attend(400);
dit('« Pas maintenant » ferme', await clique('.trv-prochain button', 'Pas maintenant'));
await attend(400);
dit('... et dit que rien n est posé', (await texte('.trv-prochain__doux')).startsWith('Rien de posé.'), await texte('.trv-prochain__doux'));
const apres = ((await lis('trone::mnd_appointments')) ?? []).filter((a) => a.clientId === 'cl-pa' && a.date > jourPlus(0));
dit('... sans rien ajouter au carnet', apres.length === 1, apres.length);

/* ── 6. AU TÉLÉPHONE, RIEN NE DÉBORDE ── */
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await attend(600);
const largeur = await evalue(`document.documentElement.scrollWidth`);
dit('à 390 px, pas de défilement de côté', largeur <= 390, largeur);

dit('aucune erreur dans la page', erreurs.length === 0, erreurs.join(' | '));
ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore son profil */ } }, 500);
if (ko) { console.log(`\n${ko} ECHEC(S).`); process.exit(1); }
console.log('\nTout est juste.');
