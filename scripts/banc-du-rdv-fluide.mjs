/* LE BANC DU « + RDV » EN TROIS QUESTIONS — `node scripts/banc-du-rdv-fluide.mjs [dossier construit]`.

   24 octobre 2026, maquette X5FzkB4m… Le harnais `verifie-le-rdv-fluide`
   éprouve les règles ; ce banc ouvre le VRAI Trône, hors ligne, et prend un
   rendez-vous comme l'accueil le ferait :

     - la porte : quatre rangées, « Qui ? » seule ouverte, rien de posable ;
     - la case unique trouve Mireille, sa fiche dit son rituel habituel ;
     - « Reprendre son rituel » ouvre « Quand ? » sur AUJOURD'HUI (24 octobre
       2026) ; « Voir ce jour » mène à sa reprise, les places y sautent les
       fauteuils pleins ;
     - une heure aux fauteuils pleins arrête la pose jusqu'à « Poser quand
       même » ; une heure où Team reçoit déjà se pose avec sa raison ; le
       rendez-vous s'écrit ;
     - la case pose une prestation ; au téléphone, rien ne déborde ;
     - le Carnet le rouvre replié, et il s'enregistre sans bouger.

   `PHOTOS=<dossier>` garde deux captures, pour relire l'écran.

   Il attend le Trône construit sans serveur (sous Bash : sous PowerShell, une
   variable vide est SUPPRIMÉE et Vite reprend le vrai .env) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const construit = process.argv[2] || path.join(tmpdir(), 'banc-trone');
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-rdv-'));
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
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
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
const choisis = (selecteur, valeur) => evalue(`(() => {
  const el = document.querySelector(${JSON.stringify(selecteur)});
  if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const texte = (selecteur) => evalue(`(document.querySelector(${JSON.stringify(selecteur)})?.textContent || '').replace(/\\s+/g, ' ').trim()`);
const texteRang = (i, sel) => evalue(`([...document.querySelectorAll('.trc-rang')][${i}]?.querySelector(${JSON.stringify(sel)})?.textContent || '').replace(/\\s+/g, ' ').trim()`);
const ouverte = () => evalue(`[...document.querySelectorAll('.trc-rang')].map((r) => r.classList.contains('is-open') ? r.querySelector('.trc-rang__titre').textContent : null).filter(Boolean).join(',')`);
const desactive = (mot) => evalue(`[...document.querySelectorAll('.trc-rdv3__barre button')].filter((b) => b.textContent.trim().startsWith(${JSON.stringify(mot)})).map((b) => b.disabled).join(',')`);

/* LA MAISON D'EXEMPLE — fictive : deux fauteuils, deux calendriers (Team et
   Expert, comme la Maison), une habituée qui revient toutes les six semaines,
   et des journées où les deux fauteuils sont pris de 11:00 à 13:30. */
const pad = (n) => String(n).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const jourPlus = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return isoDe(d); };
const AUJ = jourPlus(0);
const rdv = (id, clientId, date, time, serviceIds, status = 'confirmé') => ({ id, branchId: 'maison', clientId, serviceIds, date, time, status, master: 'Team' });
const remplissage = [];
for (let d = 0; d < 28; d++) {
  remplissage.push(rdv(`plein-a-${d}`, 'cl-x1', jourPlus(d), '11:00', ['sv-retwist']));
  remplissage.push(rdv(`plein-b-${d}`, 'cl-x2', jourPlus(d), '11:00', ['sv-retwist']));
  remplissage.push(rdv(`soir-${d}`, 'cl-x1', jourPlus(d), '16:00', ['sv-retwist']));
}
const SEMENCE = {
  'trone::mnd_branches': [{ id: 'maison', name: 'Maison du banc', city: 'Cotonou', country: 'Bénin', dial: '+229', currency: 'XOF', address: '', seats: 2, masters: ['Team', 'Expert'], masterParDefaut: 'Team', status: 'active', flagship: true }],
  'trone::mnd_current_branch': 'maison',
  'trone::mnd_catalog_services': [
    { id: 'sv-retwist', categoryId: '', name: 'Retwist', palier: 'Fondation', priceXof: 45000, durationMin: 150, hidePrice: false, sessions: 1, order: 1 },
    { id: 'sv-soin', categoryId: '', name: 'Soin hydratant', palier: 'Fondation', priceXof: 10000, durationMin: 30, hidePrice: false, sessions: 1, order: 2 },
  ],
  'trone::mnd_clients': [
    { id: 'cl-mir', branchId: 'maison', name: 'Mireille A.', phone: '0100000042', city: '', persona: '', since: '2026-01-10', segments: [] },
    { id: 'cl-x1', branchId: 'maison', name: 'Awa K.', phone: '0100000043', city: '', persona: '', since: '2026-01-10', segments: [] },
    { id: 'cl-x2', branchId: 'maison', name: 'Nadège T.', phone: '0100000044', city: '', persona: '', since: '2026-01-10', segments: [] },
  ],
  'trone::mnd_appointments': [
    rdv('h1', 'cl-mir', jourPlus(-122), '10:00', ['sv-retwist', 'sv-soin'], 'honoré'),
    rdv('h2', 'cl-mir', jourPlus(-80), '10:00', ['sv-retwist', 'sv-soin'], 'honoré'),
    rdv('h3', 'cl-mir', jourPlus(-38), '10:00', ['sv-retwist', 'sv-soin'], 'honoré'),
    ...remplissage,
  ],
  'trone::mnd_invoices': [],
};
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('banc_seme')) { sessionStorage.setItem('banc_seme', '1'); localStorage.setItem('mnd_reset_v5', '1'); for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); } } catch (e) {}` });
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/caisse` });
await attend(8000);

/* ── 1. LA PORTE : trois questions, rien de posable ── */
dit('« + RDV » s ouvre', await clique('button', '+ RDV'));
await attend(900);
dit('quatre rangées : Qui, Quoi, Quand, Plus d options', (await evalue(`[...document.querySelectorAll('.trc-rang__titre')].map((x) => x.textContent).join('|')`)) === 'Qui ?|Quoi ?|Quand ?|Plus d’options');
dit('seule « Qui ? » est ouverte', (await ouverte()) === 'Qui ?', await ouverte());
dit('la barre dit ce qui reste', (await texte('.trc-rdv3__barre-texte')).includes('Reste : la cliente, les prestations, puis le moment.'), await texte('.trc-rdv3__barre-texte'));
dit('Confirmer et En attente attendent', (await desactive('Confirmer')) === 'true' && (await desactive('En attente')) === 'true');
dit('plus de bandeau indigo en tête', (await evalue(`[...document.querySelectorAll('.mnd-modal__body div')].some((d) => d.style.position === 'sticky' && d.style.top === '-1px')`)) === false);

/* ── 2. LA CASE UNIQUE : un nom ── */
dit('la case reçoit « Mir »', await tape('.trc-rdv3__case input', 'Mir'));
await attend(400);
dit('Mireille se choisit dans la case', await clique('.trc-clientpick__opt', 'Mireille A.'));
await attend(700);
dit('la case se vide après le choix', (await evalue(`document.querySelector('.trc-rdv3__case input').value`)) === '');
dit('« Qui ? » montre son rituel habituel', (await texte('.trc-rdv3__habitude')).includes('Retwist + Soin hydratant avec Team'), await texte('.trc-rdv3__habitude'));
dit('son rythme se dit', /toutes les ~6 semaines/.test(await texte('.trc-rdv3__habitude')), await texte('.trc-rdv3__habitude'));

/* ── 3. REPRENDRE SON RITUEL : la semaine de sa reprise, ses places ── */
dit('« Reprendre son rituel »', await clique('.trc-rdv3__habitude button', 'Reprendre son rituel'));
await attend(700);
dit('« Quand ? » s ouvre seule', (await ouverte()) === 'Quand ?', await ouverte());
dit('« Quoi ? » résume ses deux prestations et leur durée', /Retwist \+ Soin hydratant · 3 h/.test(await texteRang(1, '.trc-rang__resume')), await texteRang(1, '.trc-rang__resume'));
/* AUJOURD'HUI D'ABORD — 24 octobre 2026 : « la date d'aujourd'hui doit être
   proposée automatiquement quand on ouvre Quand ? » (Yéman). */
const aujourdHui = new Date().getDate();
dit('aujourd hui est choisi d avance', await evalue(`(() => { const b = document.querySelector('.trc-rdv3__jour.is-on'); return !!b && Number(b.querySelector('b').textContent) === ${aujourdHui}; })()`),
  await evalue(`(document.querySelector('.trc-rdv3__jour.is-on') || {}).textContent || 'aucun'`));
/* Puis sa reprise : marquée dans la semaine montrée, ou « Voir ce jour ». */
if (await evalue(`!!document.querySelector('.trc-rdv3__jour.is-reprise')`)) {
  await evalue(`document.querySelector('.trc-rdv3__jour.is-reprise').click()`);
} else {
  dit('« Voir ce jour » mène à sa reprise', await clique('.trc-rdv3__note button', 'Voir ce jour'));
}
await attend(500);
const jours = await evalue(`[...document.querySelectorAll('.trc-rdv3__jour')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim())`);
dit('sept jours', jours.length === 7, jours.join(' | '));
dit('son jour est marqué, et se choisit', await evalue(`!!document.querySelector('.trc-rdv3__jour.is-reprise.is-on')`), jours.join(' | '));
dit('le dimanche dit qu il est fermé', jours.some((j) => /^dim\..*fermé/.test(j)), jours.join(' | '));
const heures = await evalue(`[...document.querySelectorAll('.trc-rdv3__heure')].map((b) => b.textContent.trim())`);
const estSamedi = await evalue(`(document.querySelector('.trc-rdv3__jour.is-on small')?.textContent || '').startsWith('sam')`);
dit('les places sautent les fauteuils pleins de 11:00 à 13:30 (3 h de rituel)',
  heures[0] === (estSamedi ? '08:00' : '13:30') && !heures.some((h) => ['09:00', '10:00', '11:00', '12:00', '13:00'].includes(h)), heures.join(' '));
dit('16:00 reste offert : Team y reçoit déjà, mais un fauteuil reste', heures.includes('16:00'), heures.join(' '));

/* ── 4. UNE PLACE, PUIS DES FAUTEUILS PLEINS, PUIS UNE HEURE PRISE ── */
dit('une place se choisit', await clique('.trc-rdv3__heure', heures[0]));
await attend(400);
const barre = await texte('.trc-rdv3__barre-texte');
dit('la barre dit le rendez-vous', barre.includes('Mireille A.') && barre.includes(heures[0]) && barre.includes('Team') && barre.includes('55 000'), barre);
dit('Confirmer s ouvre', (await desactive('Confirmer')) === 'false');
dit('« Une autre heure » : 11:00', await choisis('.trc-rdv3__autre select', '11:00'));
await attend(400);
const bloquee = await texte('.trc-rdv3__raison.is-bloque');
dit('les deux fauteuils pleins bloquent, la première place est proposée', bloquee.startsWith('Les 2 fauteuils sont occupés') && bloquee.includes(`Première place libre ce jour-là : ${heures[0]}`), bloquee);
dit('Confirmer et En attente se ferment', (await desactive('Confirmer')) === 'true' && (await desactive('En attente')) === 'true');
dit('« Quand ? » dit qu il faut changer', (await texteRang(2, '.trc-rang__etat')) === 'à changer');
/* LA MAIN DU TRÔNE PASSE OUTRE (24 octobre 2026). */
dit('« Poser quand même à 11:00 »', await clique('.trc-rdv3__forcer', 'Poser quand même à 11:00'));
await attend(400);
dit('... Confirmer s ouvre, la raison ne bloque plus', (await desactive('Confirmer')) === 'false' && !(await evalue(`!!document.querySelector('.trc-rdv3__raison.is-bloque')`)));
dit('... « Quand ? » le résume', /11:00 · Team · fauteuils pleins, posé quand même/.test(await texteRang(2, '.trc-rang__resume')), await texteRang(2, '.trc-rang__resume'));
dit('« Une autre heure » : 16:00', await choisis('.trc-rdv3__autre select', '16:00'));
await attend(400);
const prise = await texte('.trc-rdv3__raison');
dit('Team déjà pris se dit en cuivre, sans bloquer', prise.startsWith('Team reçoit déjà Awa K. de 16:00 à 18:30') && !(await evalue(`!!document.querySelector('.trc-rdv3__raison.is-bloque')`)), prise);
dit('« Quand ? » le résume', /16:00 · Team · posé quand même/.test(await texteRang(2, '.trc-rang__resume')), await texteRang(2, '.trc-rang__resume'));
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1600, deviceScaleFactor: 1, mobile: false });
await attend(300);
if (process.env.PHOTOS) {
  const { writeFileSync } = await import('node:fs');
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(process.env.PHOTOS, 'rdv-1-quand.png'), Buffer.from(r.result.data, 'base64'));
}
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
const jourPose = await evalue(`(() => { const b = document.querySelector('.trc-rdv3__jour.is-on'); return b ? b.querySelector('b').textContent : ''; })()`);
dit('Confirmer pose le rendez-vous', await clique('.trc-rdv3__barre button', 'Confirmer'));
await attend(900);
const pose = ((await lis('trone::mnd_appointments')) ?? []).filter((a) => a.clientId === 'cl-mir' && a.status !== 'honoré');
dit('un seul rendez-vous écrit, à 16:00, ses deux prestations, Team', pose.length === 1 && pose[0].time === '16:00' && pose[0].master === 'Team'
  && JSON.stringify(pose[0].serviceIds) === JSON.stringify(['sv-retwist', 'sv-soin']) && pose[0].status === 'confirmé' && Number(pose[0].date.slice(8, 10)) === Number(jourPose),
  JSON.stringify(pose.map((a) => [a.date, a.time, a.master, a.serviceIds.join('+'), a.status])));
dit('la fenêtre se ferme', (await evalue(`!!document.querySelector('.trc-rdv3')`)) === false);

/* ── 5. LA CASE UNIQUE : une prestation, et le téléphone ── */
await clique('button', '+ RDV');
await attend(800);
await tape('.trc-rdv3__case input', 'retw');
await attend(400);
dit('« retw » propose la prestation Retwist', await evalue(`[...document.querySelectorAll('.trc-svpick__grp')].some((g) => g.textContent === 'Prestations')`));
dit('et l inscription d une nouvelle cliente vient après', (await evalue(`(() => { const o = [...document.querySelectorAll('.trc-clientpick__opt')].map((b) => b.textContent); return o.length > 1 && o[o.length - 1].startsWith('＋ Nouvelle cliente « retw »'); })()`)));
dit('Retwist se pose depuis la case', await clique('.trc-clientpick__opt', 'Retwist'));
await attend(500);
dit('« Quoi ? » le porte, « Qui ? » s ouvre (pas de cliente)', /Retwist/.test(await texteRang(1, '.trc-rang__resume')) && (await ouverte()) === 'Qui ?', `${await texteRang(1, '.trc-rang__resume')} / ${await ouverte()}`);
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 1400, deviceScaleFactor: 1, mobile: true });
await attend(600);
await tape('.trc-rdv3__case input', 'Nad');
await attend(300);
await clique('.trc-clientpick__opt', 'Nadège T.');
await attend(500);
dit('Nadège choisie après sa prestation : « Quand ? » s ouvre seule', (await ouverte()) === 'Quand ?', await ouverte());
dit('sans jour de reprise, aujourd hui se propose', await evalue(`(() => { const on = document.querySelector('.trc-rdv3__jour.is-on'); return !!on && Number(on.querySelector('b').textContent) === ${aujourdHui}; })()`));
const deborde = await evalue(`(() => { const b = document.querySelector('.mnd-modal__body'); return b ? b.scrollWidth - b.clientWidth : -1; })()`);
dit('au téléphone (390 px), rien ne déborde', deborde === 0, deborde);
dit('au téléphone, la semaine tient sur une ligne', await evalue(`(() => { const j = [...document.querySelectorAll('.trc-rdv3__jour')]; return j.length === 7 && new Set(j.map((b) => b.getBoundingClientRect().top)).size === 1; })()`));
if (process.env.PHOTOS) {
  const { writeFileSync } = await import('node:fs');
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(process.env.PHOTOS, 'rdv-2-telephone.png'), Buffer.from(r.result.data, 'base64'));
}
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/* ── 6. MODIFIER : le même écran, replié ── */
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/carnet` });
await attend(1500);
/* La fenêtre de l'étape 5 resterait ouverte sous celle du Carnet : on recharge. */
await cdp('Page.reload');
await attend(6000);
dit('une seule fenêtre avant de relire', (await evalue(`document.querySelectorAll('.trc-rdv3').length`)) === 0);
const ouvert = await evalue(`(() => { const r = [...document.querySelectorAll('.trc-sheet__row')].find((x) => x.textContent.includes('Mireille A.') && x.textContent.includes('16:00')); if (r) r.click(); return !!r; })()`);
dit('le Carnet rouvre le rendez-vous de Mireille', ouvert);
await attend(900);
dit('relu, tout est replié', (await ouverte()) === '', await ouverte());
dit('les résumés disent le rendez-vous', /Mireille A\./.test(await texteRang(0, '.trc-rang__resume')) && /16:00 · Team/.test(await texteRang(2, '.trc-rang__resume')),
  `${await texteRang(0, '.trc-rang__resume')} / ${await texteRang(2, '.trc-rang__resume')}`);
dit('relu sans bouger, il s enregistre (Team pris ne bloque pas)', /^false(,false)*$/.test(await desactive('Enregistrer')), await desactive('Enregistrer'));
dit('« Plus d options » dit son statut', /confirmé/.test(await texteRang(3, '.trc-rang__resume')), await texteRang(3, '.trc-rang__resume'));
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nLe + RDV prend un rendez-vous en trois questions.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
