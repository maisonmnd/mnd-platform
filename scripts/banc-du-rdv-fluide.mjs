/* LE BANC DU « + RDV » (LA MAISON PROPOSE, 28 octobre 2026 ; avant : EN TROIS QUESTIONS) — `node scripts/banc-du-rdv-fluide.mjs [dossier construit]`.

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
const ouverte = () => evalue(`[...document.querySelectorAll('.trc-rdv4__volet')].filter((v) => !v.hidden).map((v) => v.getAttribute('aria-label')).join(',')`);
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

/* ── 1. LA PORTE : la case, les attendues, rien de posable ── */
dit('« + RDV » s ouvre', await clique('button', '+ RDV'));
await attend(900);
dit('plus de rangées Qui / Quoi / Quand', (await evalue(`document.querySelectorAll('.trc-rang').length`)) === 0);
dit('la case unique est là', await evalue(`!!document.querySelector('.trc-rdv3__case input')`));
const attendues = await evalue(`[...document.querySelectorAll('.trc-rdv4__attendue')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim())`);
dit('Mireille est attendue cette semaine (sa reprise approche)', attendues.some((x) => x.includes('Mireille A.') && /Sa reprise/.test(x)), attendues.join(' | '));
dit('aucun volet ouvert', (await ouverte()) === '', await ouverte());
dit('la barre dit ce qui reste', (await texte('.trc-rdv3__barre-texte')).includes('Reste : la cliente, les prestations, puis le moment.'), await texte('.trc-rdv3__barre-texte'));
dit('Poser et En attente attendent', (await desactive('Poser le rendez-vous')) === 'true' && (await desactive('En attente')) === 'true');
dit('la confirmation WhatsApp est cochée d office', await evalue(`!!document.querySelector('.trc-rdv4__wa input')?.checked`));

/* ── 2. UN TOUCHER : sa fiche, son rituel posé, trois propositions ── */
dit('Mireille se choisit parmi les attendues', await clique('.trc-rdv4__attendue', 'MA'));
await attend(800);
dit('sa fiche se montre, la case se retire', (await texte('.trc-rdv4__qui .trc-rdv3__nom')) === 'Mireille A.' && !(await evalue(`!!document.querySelector('.trc-rdv3__case')`)));
dit('son rituel habituel se pose de lui-même', /Retwist \+ Soin hydratant/.test(await texte('.trc-rdv3__barre-texte')), await texte('.trc-rdv3__barre-texte'));
const cartes = await evalue(`[...document.querySelectorAll('.trc-rdv4__carte')].map((b) => ({
  titre: b.querySelector('.trc-rdv4__carte-titre').textContent, date: b.querySelector('.trc-rdv4__carte-date').textContent,
  quand: b.querySelector('.trc-rdv4__carte-quand').textContent, pourquoi: b.querySelector('.trc-rdv4__carte-pourquoi').textContent }))`);
/* Ses venues tombent toutes le même jour de la semaine (six semaines d'écart) :
   « Son <jour> », sauf quand ce jour est le dimanche, fermé dans cette Maison
   d'exemple ; le jour suivant prend alors sa place. Le jour habituel lui-même
   s'éprouve à dates fixes dans verifie-le-rdv-fluide. */
const sonJourFerme = new Date(`${jourPlus(-38)}T12:00:00`).getDay() === 0;
dit('trois propositions : à sa date, le plus tôt, son jour', cartes.length === 3 && cartes[0].titre === 'À sa date' && cartes[1].titre === 'Le plus tôt'
  && (sonJourFerme ? cartes[2].titre === 'Un autre jour' : /^Son /.test(cartes[2].titre)), JSON.stringify(cartes.map((c) => c.titre)));
const heuresDesCartes = cartes.map((c) => c.quand.slice(0, 5));
dit('aucune ne tombe sur les fauteuils pleins (3 h de rituel, 11:00 à 13:30)', !heuresDesCartes.some((h) => ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00'].includes(h)), heuresDesCartes.join(' '));
dit('chacune dit son maître et pourquoi', cartes.every((c) => /avec Team/.test(c.quand) && c.pourquoi.length > 10), JSON.stringify(cartes.map((c) => `${c.quand} / ${c.pourquoi}`)));
dit('rien n est posé avant le toucher', (await desactive('Poser le rendez-vous')) === 'true');
dit('« À sa date » se touche', await clique('.trc-rdv4__carte', 'À sa date'));
await attend(400);
dit('la carte touchée est marquée', await evalue(`document.querySelector('.trc-rdv4__carte.is-on .trc-rdv4__carte-titre')?.textContent === 'À sa date'`));
const barre = await texte('.trc-rdv3__barre-texte');
dit('la barre dit le rendez-vous', barre.includes('Mireille A.') && barre.includes(heuresDesCartes[0]) && barre.includes('Team') && barre.includes('55 000'), barre);
dit('Poser s ouvre', (await desactive('Poser le rendez-vous')) === 'false');

/* ── 3. CHANGER LE MOMENT : le volet, les fauteuils pleins, une heure prise ── */
dit('« Changer le jour, l heure ou le maître » ouvre son volet', await clique('.trc-rdv4__bouton', 'Changer le jour'));
await attend(400);
dit('un seul volet ouvert', (await ouverte()) === 'Le jour, l’heure, le maître', await ouverte());
const jours = await evalue(`[...document.querySelectorAll('.trc-rdv3__jour')].map((b) => b.textContent.replace(/\\s+/g, ' ').trim())`);
dit('sept jours, le dimanche fermé', jours.length === 7 && jours.some((j) => /^dim\..*fermé/.test(j)), jours.join(' | '));
dit('« Une autre heure » : 11:00', await choisis('.trc-rdv3__autre select', '11:00'));
await attend(400);
const bloquee = await texte('.trc-rdv3__raison.is-bloque');
dit('les deux fauteuils pleins bloquent', bloquee.startsWith('Les 2 fauteuils sont occupés'), bloquee);
dit('Poser et En attente se ferment', (await desactive('Poser le rendez-vous')) === 'true' && (await desactive('En attente')) === 'true');
dit('« Poser quand même à 11:00 »', await clique('.trc-rdv3__forcer', 'Poser quand même à 11:00'));
await attend(400);
dit('... Poser s ouvre', (await desactive('Poser le rendez-vous')) === 'false' && !(await evalue(`!!document.querySelector('.trc-rdv3__raison.is-bloque')`)));
dit('« Une autre heure » : 16:00', await choisis('.trc-rdv3__autre select', '16:00'));
await attend(400);
const prise = await texte('.trc-rdv3__raison');
dit('Team déjà pris se dit en cuivre, sans bloquer', prise.startsWith('Team reçoit déjà Awa K. de 16:00 à 18:30') && !(await evalue(`!!document.querySelector('.trc-rdv3__raison.is-bloque')`)), prise);
dit('aucune carte ne reste marquée (le moment est le sien)', !(await evalue(`!!document.querySelector('.trc-rdv4__carte.is-on')`)));
dit('le volet se referme d un toucher', await clique('.trc-rdv4__bouton', 'Changer le jour'));
await attend(300);
dit('... et la raison reste sous les yeux', (await ouverte()) === '' && (await texte('.trc-rdv3__raison')).startsWith('Team reçoit déjà'));
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
await attend(300);
if (process.env.PHOTOS) {
  const { writeFileSync } = await import('node:fs');
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(process.env.PHOTOS, 'rdv-1-propose.png'), Buffer.from(r.result.data, 'base64'));
}
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/* ── 4. POSER : l'écran « posé », puis « Le modifier » ── */
dit('« Poser le rendez-vous »', await clique('.trc-rdv3__barre button', 'Poser le rendez-vous'));
await attend(900);
const pose = ((await lis('trone::mnd_appointments')) ?? []).filter((a) => a.clientId === 'cl-mir' && a.status !== 'honoré');
dit('un seul rendez-vous écrit, à 16:00, ses deux prestations, Team, confirmation gardée', pose.length === 1 && pose[0].time === '16:00' && pose[0].master === 'Team'
  && JSON.stringify(pose[0].serviceIds) === JSON.stringify(['sv-retwist', 'sv-soin']) && pose[0].status === 'confirmé' && !pose[0].sansConfirmation,
  JSON.stringify(pose.map((a) => [a.date, a.time, a.master, a.serviceIds.join('+'), a.status, a.sansConfirmation])));
const ecranPose = await texte('.trc-rdv4__pose');
dit('l écran « posé » dit le rendez-vous et ce qui part', ecranPose.includes('Le rendez-vous de Mireille A. est posé.') && ecranPose.includes('16:00') && ecranPose.includes('La confirmation part sur WhatsApp'), ecranPose);
if (process.env.PHOTOS) {
  const { writeFileSync } = await import('node:fs');
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(process.env.PHOTOS, 'rdv-2-pose.png'), Buffer.from(r.result.data, 'base64'));
}
dit('« Le modifier » rouvre le même rendez-vous', await clique('.trc-rdv4__pose button', 'Le modifier'));
await attend(700);
dit('... au même écran : sa fiche, sans propositions, Enregistrer prêt', (await texte('.trc-rdv4__qui .trc-rdv3__nom')) === 'Mireille A.'
  && (await evalue(`document.querySelectorAll('.trc-rdv4__carte').length`)) === 0 && /^false(,false)*$/.test(await desactive('Enregistrer')), await desactive('Enregistrer'));
dit('Enregistrer referme la fenêtre', await clique('.trc-rdv3__barre button', 'Enregistrer'));
await attend(700);
dit('... sans rien dédoubler', (await evalue(`document.querySelectorAll('.trc-rdv3').length`)) === 0
  && ((await lis('trone::mnd_appointments')) ?? []).filter((a) => a.clientId === 'cl-mir' && a.status !== 'honoré').length === 1);

/* ── 5. LA CASE UNIQUE : une prestation, une cliente sans venue, le téléphone ── */
await clique('button', '+ RDV');
await attend(800);
dit('Mireille n est plus attendue : son rendez-vous est pris', !(await evalue(`[...document.querySelectorAll('.trc-rdv4__attendue')].some((b) => b.textContent.includes('Mireille A.'))`)));
await tape('.trc-rdv3__case input', 'retw');
await attend(400);
dit('« retw » propose la prestation Retwist', await evalue(`[...document.querySelectorAll('.trc-svpick__grp')].some((g) => g.textContent === 'Prestations')`));
dit('Retwist se pose depuis la case', await clique('.trc-clientpick__opt', 'Retwist'));
await attend(500);
dit('la barre le porte', /Retwist/.test(await texte('.trc-rdv3__barre-texte')), await texte('.trc-rdv3__barre-texte'));
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 1400, deviceScaleFactor: 1, mobile: true });
await attend(600);
await tape('.trc-rdv3__case input', 'Nad');
await attend(300);
await clique('.trc-clientpick__opt', 'Nadège T.');
await attend(600);
const cartesN = await evalue(`[...document.querySelectorAll('.trc-rdv4__carte')].map((b) => b.querySelector('.trc-rdv4__carte-titre').textContent)`);
dit('Nadège, sans venue honorée : le plus tôt, puis les jours suivants', cartesN.length === 3 && cartesN[0] === 'Le plus tôt' && cartesN.slice(1).every((t) => t === 'Un autre jour'), cartesN.join(' | '));
dit('sa prestation déjà posée reste (aucune habitude ne l écrase)', /Retwist/.test(await texte('.trc-rdv3__barre-texte')) && !/Soin/.test(await texte('.trc-rdv3__barre-texte')), await texte('.trc-rdv3__barre-texte'));
const deborde = await evalue(`(() => { const b = document.querySelector('.mnd-modal__body'); return b ? b.scrollWidth - b.clientWidth : -1; })()`);
dit('au téléphone (390 px), rien ne déborde', deborde === 0, deborde);
dit('au téléphone, les propositions s empilent', await evalue(`(() => { const c = [...document.querySelectorAll('.trc-rdv4__carte')]; return c.length === 3 && new Set(c.map((b) => Math.round(b.getBoundingClientRect().left))).size === 1; })()`));
dit('« Le plus tôt » se touche', await clique('.trc-rdv4__carte', 'Le plus tôt'));
await evalue(`(() => { const c = document.querySelector('.trc-rdv4__wa input'); if (c && c.checked) c.click(); })()`);
await attend(300);
if (process.env.PHOTOS) {
  const { writeFileSync } = await import('node:fs');
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(process.env.PHOTOS, 'rdv-3-telephone.png'), Buffer.from(r.result.data, 'base64'));
}
dit('« Poser le rendez-vous », confirmation décochée', await clique('.trc-rdv3__barre button', 'Poser le rendez-vous'));
await attend(800);
const posN = ((await lis('trone::mnd_appointments')) ?? []).filter((a) => a.clientId === 'cl-x2' && !String(a.id).startsWith('plein'));
dit('écrit sans confirmation', posN.length === 1 && posN[0].sansConfirmation === true, JSON.stringify(posN.map((a) => [a.date, a.time, a.sansConfirmation])));
dit('l écran « posé » le dit', (await texte('.trc-rdv4__pose')).includes('Aucune confirmation ne part'), await texte('.trc-rdv4__pose'));
dit('« Un autre rendez-vous » repart à neuf', await clique('.trc-rdv4__pose button', 'Un autre rendez-vous'));
await attend(600);
dit('... la case, rien de posé', (await evalue(`!!document.querySelector('.trc-rdv3__case input')`)) && /Reste : la cliente/.test(await texte('.trc-rdv3__barre-texte')), await texte('.trc-rdv3__barre-texte'));
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

/* ── 6. MODIFIER DEPUIS LE CARNET : le même écran ── */
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/carnet` });
await attend(1500);
await cdp('Page.reload');
await attend(6000);
dit('une seule fenêtre avant de relire', (await evalue(`document.querySelectorAll('.trc-rdv3').length`)) === 0);
const ouvert = await evalue(`(() => { const r = [...document.querySelectorAll('.trc-sheet__row')].find((x) => x.textContent.includes('Mireille A.') && x.textContent.includes('16:00')); if (r) r.click(); return !!r; })()`);
dit('le Carnet rouvre le rendez-vous de Mireille', ouvert);
await attend(900);
dit('relu : sa fiche, aucun volet ouvert, la barre dit le rendez-vous', (await texte('.trc-rdv4__qui .trc-rdv3__nom')) === 'Mireille A.' && (await ouverte()) === ''
  && /16:00/.test(await texte('.trc-rdv3__barre-texte')), await texte('.trc-rdv3__barre-texte'));
dit('relu sans bouger, il s enregistre (Team pris ne bloque pas)', /^false(,false)*$/.test(await desactive('Enregistrer')), await desactive('Enregistrer'));
dit('« Prix, formule, note » porte son statut', await clique('.trc-rdv4__bouton', 'Prix, formule, note'));
await attend(300);
dit('... confirmé', await evalue(`[...document.querySelectorAll('.trc-rdv4__volet:not([hidden]) select')].some((s) => s.value === 'confirmé')`));
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nLe + RDV propose, et se pose en un toucher.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
