/* LE BANC DE « SON PROCHAIN RITUEL » À LA CAISSE — `node scripts/banc-du-prochain-rituel.mjs [dossier construit] [dossier des captures]`.

   2 novembre 2026, maquette « Remplir les fauteuils », Un · La Caisse ;
   recalé le 4 novembre 2026 sur la carte partagée (maquette du prochain
   rituel à l'encaissement, v2 : PROPOSÉ, VALIDÉ D'UN TOUCHER, une seule
   confirmation à la fermeture). Les harnais `verifie-le-prochain-rituel` et
   `verifie-la-carte-du-prochain-rituel` éprouvent les règles ; ce banc ouvre
   le VRAI Trône, hors ligne, et encaisse comme une main :

     - une habituée fictive (Paule A.) : un lavage toutes les deux semaines,
       à 13 h chez Team, et un soin venu une seule fois ; elle règle son
       lavage du jour ;
     - l'écran de réussite montre la carte « Son prochain rituel » : à
       valider, la date en grand (avec l'année), deux puces (le lavage choisi
       d'office), rien de posé ;
     - la place partie entre-temps (deux rendez-vous écrits au carnet après
       l'affichage) : « Valider » la relit, ne pose rien, et le dit ;
     - « Valider ce rendez-vous » pose UN rendez-vous confirmé, au Trône, au
       prix et à la durée de la fenêtre, SANS confirmation tant que l'écran
       est ouvert ; une autre place le déplace, sans en poser un second ;
     - « Ticket suivant » lève le drapeau : la confirmation part une fois ;
     - au ticket suivant, son rendez-vous déjà posé se montre ; rien de plus ;
     - une première venue (Inès B.) : rien d'office, trois places ;
       « Ticket suivant » ne pose rien ;
     - au téléphone, rien ne déborde.

   Il attend le Trône construit sans serveur (sous Bash : sous PowerShell, une
   variable vide est SUPPRIMÉE et Vite reprend le vrai .env) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir
   Sous Git Bash, les chemins Windows passent par `cygpath -w`. */
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
   Team, et un soin venu une seule fois il y a deux mois ; Inès B., jamais
   venue. */
const pad = (n) => String(n).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/* Le jour du banc se fige au départ : un passage qui franchit minuit ne fait pas glisser ses attendus. */
const DEPART = new Date();
const jourPlus = (n) => { const d = new Date(DEPART); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return isoDe(d); };
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
    { id: 'cl-ib', branchId: 'maison', name: 'Inès B.', phone: '0100000052', city: '', persona: '', since: jourPlus(0), segments: [] },
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

/* ── 1. LE TICKET : elle, son geste, en espèces ── */
const encaisse = async (qui, nom, geste, montant) => {
  await tape('.trc-clientpick input', qui);
  await attend(400);
  const prise = await clique('.trc-clientpick__opt', nom);
  await attend(600);
  const pris = await clique('.trv-pick', geste);
  await attend(600);
  await clique('.trv-etape__ligne', 'Comment elle paie');
  await attend(300);
  const especes = await clique('.trv-pay', 'Espèces');
  await attend(400);
  /* Le bouton du pied du ticket : l'onglet « Encaisser » porte le même mot. */
  const ok = await clique('.trv-ticket__pied button', `Encaisser ${montant}`);
  await attend(2500);
  return prise && pris && especes && ok;
};
const siens = async (c = 'cl-pa') => ((await lis('trone::mnd_appointments')) ?? []).filter((a) => a.clientId === c && a.date > jourPlus(0));
dit('la caisse s ouvre', await evalue(`!!document.querySelector('.trv-pick')`));
dit('Paule A. règle son lavage en espèces', await encaisse('Paule', 'Paule A.', 'Lavage du banc', '10'));
dit('l écran de réussite paraît', await evalue(`!!document.querySelector('.trv-reussite')`));

/* ── 2. LA CARTE, PROPOSÉE ── */
const pastille = () => texte('.trv-prochain__pastille');
const enGrand = () => texte('.trv-prochain__date');
dit('la carte « Son prochain rituel » est là, à valider', (await texte('.trv-prochain__etiquette')) === 'Son prochain rituel' && (await pastille()) === 'À valider', await pastille());
dit('la date en grand, avec son année', /^\S+ \d{1,2} \S+ \d{4}$/u.test(await enGrand()), await enGrand());
dit('à son heure, chez Team', /^13 h · 30 min · avec Team$/.test(await texte('.trv-prochain__heure')), await texte('.trv-prochain__heure'));
const puces = await evalue(`[...document.querySelectorAll('.trv-prochain__rituel')].map((b) => [b.querySelector('.trv-prochain__rituel-nom')?.textContent, b.getAttribute('aria-pressed')])`);
dit('deux puces, le lavage choisi d office (son rythme mesuré passe devant le soin venu une fois)',
  JSON.stringify(puces) === JSON.stringify([['Lavage du banc', 'true'], ['Soin du banc', 'false']]), JSON.stringify(puces));
dit('la raison : son rythme, lu sur ses venues', /^Son rythme : environ 2 semaines, lu sur ses 4 dernières venues\./.test(await texte('.trv-prochain__pourquoi')), await texte('.trv-prochain__pourquoi'));
dit('rien n est posé avant de valider', (await siens()).length === 0, (await siens()).length);
dit('« Ce qu elle reçoit » : rien tant que ce n est pas validé', (await texte('.trv-prochain__quand')).startsWith('Rien tant que le rendez-vous n’est pas validé.'));
await capture('caisse-carte-proposee', 1280, 1500, false);

/* ── 3. LA PLACE PARTIE ENTRE-TEMPS : deux rendez-vous écrits après l'affichage ── */
const laDate = await enGrand();
const isoDeLaCarte = jourPlus(14);
const ditLeJour = (iso) => evalue(`(() => { const s = new Date('${iso}T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); })()`);
dit('la date proposée est sa date : deux semaines après, son jour, son heure', laDate === await ditLeJour(isoDeLaCarte), `${laDate} / ${await ditLeJour(isoDeLaCarte)}`);
await evalue(`(() => {
  const k = 'trone::mnd_appointments';
  const l = JSON.parse(localStorage.getItem(k) || '[]');
  for (const [i, c] of [['x1', 'cl-x1'], ['x2', 'cl-x2']]) l.push({ id: 'pris-' + i, branchId: 'maison', clientId: c, serviceIds: ['sv-lavage'], date: ${JSON.stringify(isoDeLaCarte)}, time: '13:00', status: 'confirmé', master: i === 'x1' ? 'Team' : 'Expert' });
  localStorage.setItem(k, JSON.stringify(l));
  /* Comme une synchro qui arrive sans que l'écran ait été redessiné : les
     magasins apprennent qu'il faut relire le disque, la place reste affichée. */
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  return true;
})()`);
dit('la place partie est encore à l écran', (await enGrand()) === laDate, await enGrand());
dit('« Valider ce rendez-vous » se touche', await clique('.trv-prochain__valider', 'Valider ce rendez-vous'));
await attend(700);
const alerte = await texte('.trv-prochain-carte [role="alert"]');
dit('le toucher relit la place : elle est partie, rien n est posé, l écran le dit', /vient de partir/.test(alerte) && (await siens()).length === 0, alerte);

/* ── 4. VALIDER POSE, SANS CONFIRMATION ; CHANGER DÉPLACE ── */
const relue = await enGrand();
dit('la carte se relit sur une place libre', relue !== laDate || (await texte('.trv-prochain__heure')) !== '13 h · 30 min · avec Team', `${relue} · ${await texte('.trv-prochain__heure')}`);
dit('« Valider ce rendez-vous »', await clique('.trv-prochain__valider', 'Valider ce rendez-vous'));
await attend(900);
let poses = await siens();
let p = poses[0];
dit('un rendez-vous et un seul est posé', poses.length === 1, poses.length);
dit('posé confirmé, au Trône, chez Team, au prix et à la durée de la fenêtre', p?.status === 'confirmé' && p?.source === 'trone' && p?.master === 'Team' && p?.priceXof === 10000 && p?.dureeMin === 30,
  JSON.stringify({ s: p?.status, src: p?.source, m: p?.master, prix: p?.priceXof, d: p?.dureeMin }));
dit('estampillé, et SANS confirmation tant que l écran est ouvert', !!p?.creeLe && p?.sansConfirmation === true, JSON.stringify({ creeLe: !!p?.creeLe, sans: p?.sansConfirmation }));
dit('la pastille dit « Confirmé »', (await pastille()) === 'Confirmé', await pastille());
dit('« Ce qu elle reçoit » montre le message, avec la date et la référence', /^Bonjour Paule, c'est confirmé : votre rendez-vous est retenu \S+ \d{1,2} \S+ \d{4} à \d{1,2} h( \d{2})?\. Votre référence : MND-[A-Z0-9]{4}\./u.test(await texte('.trv-prochain__bulle')), await texte('.trv-prochain__bulle'));
dit('« Changer la date ou l heure » ouvre trois places', await clique('.trv-prochain__bouton', 'Changer la date ou l’heure'));
await attend(500);
const places = await evalue(`[...document.querySelectorAll('.trv-prochain__modif .trv-prochain__place')].map((b) => ({ iso: b.dataset.iso, heure: b.dataset.heure, on: b.getAttribute('aria-pressed') }))`);
dit('trois places au plus, après aujourd hui', places.length > 0 && places.length <= 3 && places.every((x) => x.iso > jourPlus(0)), JSON.stringify(places));
const autre = places.find((x) => x.on !== 'true');
await evalue(`document.querySelector('.trv-prochain__modif .trv-prochain__place[data-iso="${autre?.iso}"][data-heure="${autre?.heure}"]')?.click()`);
await attend(900);
poses = await siens();
p = poses[0];
dit('une autre place déplace le même rendez-vous, sans en poser un second', poses.length === 1 && p?.date === autre?.iso && p?.time === autre?.heure && p?.sansConfirmation === true,
  JSON.stringify(poses.map((a) => `${a.date} ${a.time} ${a.sansConfirmation}`)));
dit('la pastille dit « Confirmé · changé »', (await pastille()) === 'Confirmé · changé', await pastille());

/* ── 5. « TICKET SUIVANT » : LA CONFIRMATION PART, UNE FOIS ── */
dit('« Ticket suivant » passe par la carte', await clique('.trv-reussite__boutons button', 'Ticket suivant'));
await attend(900);
p = (await siens())[0];
dit('le drapeau tombe : la confirmation-rdv le balaiera, une fois', !!p && !('sansConfirmation' in p), JSON.stringify({ sans: p?.sansConfirmation }));
dit('le ticket suivant repart', !(await evalue(`!!document.querySelector('.trv-reussite')`)));

/* ── 6. SON RENDEZ-VOUS DÉJÀ POSÉ SE MONTRE ── */
dit('un second lavage se règle', await encaisse('Paule', 'Paule A.', 'Lavage du banc', '10'));
dit('son rendez-vous déjà posé se montre, confirmé', (await pastille()) === 'Confirmé' && (await texte('.trv-prochain__pourquoi')).startsWith('Un rituel, un seul prochain rendez-vous'), `${await pastille()} · ${await texte('.trv-prochain__pourquoi')}`);
dit('« Ce qu elle reçoit » : rien de plus', (await texte('.trv-prochain__quand')).startsWith('Rien de plus'), await texte('.trv-prochain__quand'));
dit('« Ticket suivant »', await clique('.trv-reussite__boutons button', 'Ticket suivant'));
await attend(800);
dit('... sans rien ajouter au carnet', (await siens()).length === 1, (await siens()).length);

/* ── 7. UNE PREMIÈRE VENUE : RIEN D'OFFICE ── */
dit('Inès B. règle un soin', await encaisse('Inès', 'Inès B.', 'Soin du banc', '20'));
dit('pas de date en grand : rien n est posé d office', (await enGrand()) === 'Rien n’est posé d’office' && (await pastille()) === 'À poser', `${await enGrand()} · ${await pastille()}`);
const sesPlaces = await evalue(`document.querySelectorAll('.trv-prochain__carte .trv-prochain__place').length`);
dit('... trois places à toucher', sesPlaces > 0 && sesPlaces <= 3, sesPlaces);
await capture('caisse-premiere-venue', 1280, 1400, false);
dit('« Ticket suivant » ferme sans rien poser', await clique('.trv-reussite__boutons button', 'Ticket suivant'));
await attend(800);
dit('... aucun rendez-vous pour elle', (await siens('cl-ib')).length === 0, (await siens('cl-ib')).length);

/* ── 8. AU TÉLÉPHONE, RIEN NE DÉBORDE ── */
dit('Paule repasse', await encaisse('Paule', 'Paule A.', 'Lavage du banc', '10'));
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await attend(600);
const largeur = await evalue(`document.documentElement.scrollWidth`);
dit('à 390 px, pas de défilement de côté', largeur <= 390, largeur);
await capture('caisse-telephone', 390, 1800, true);

dit('aucune erreur dans la page', erreurs.length === 0, erreurs.join(' | '));
ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore son profil */ } }, 500);
if (ko) { console.log(`\n${ko} ECHEC(S).`); process.exit(1); }
console.log('\nTout est juste.');
