/* LE BANC DU PARCOURS DU FOYER — `node scripts/banc-du-parcours-du-foyer.mjs [dossier construit]`.

   4 novembre 2026, maquette `public/maquette-le-parcours-du-foyer.html`
   (« construis »). Le harnais `verifie-le-parcours-du-foyer` éprouve les
   règles ; ce banc ouvre le VRAI Trône, hors ligne, avec deux sœurs
   inventées (Joy Akpo, une grande ; Fifi Akpo, 9 ans) dont le compte porte
   « Elles viennent toujours ensemble », comme J. K. et F. K. :

     - « + RDV » pour Joy pose aussi Fifi, à la même heure, chez Team, aux
       gestes de son âge (KLƆKLƆ™ Kids + SÍNSIN™ Kids), sa remise famille
       en francs, et le même foyerId ; le panier dit ce que le foyer règle ;
     - changer l'heure de Joy déplace Fifi ; « Seulement Fifi » ne déplace
       qu'elle, et la détache ;
     - reposées à la même heure, « Elles viennent ensemble ? Les lier » ;
     - le Carnet demande « les deux, ou seulement Joy ? », et « Ne rien
       annuler » n'annule rien ; la fenêtre annule « Seulement Fifi » ;
     - la case se décoche et se recoche sur la carte du compte famille.

   Il attend le Trône construit sans serveur (sous Bash) :
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-foyer-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });

let ko = 0;
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
const choisis = (selecteur, valeur) => evalue(`(() => {
  const el = document.querySelector(${JSON.stringify(selecteur)});
  if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);
const coche = (selecteur) => evalue(`(() => { const el = document.querySelector(${JSON.stringify(selecteur)}); if (!el) return false; el.click(); return el.checked; })()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const texte = (selecteur) => evalue(`(document.querySelector(${JSON.stringify(selecteur)})?.textContent || '').replace(/\\s+/g, ' ').trim()`);
const rdvs = async () => ((await lis('trone::mnd_appointments')) ?? []).filter((a) => a.status !== 'honoré');
const de = async (clientId) => (await rdvs()).find((a) => a.clientId === clientId);
const ouvreDuCarnet = async (nom) => {
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/carnet` });
  await attend(1200);
  await cdp('Page.reload');
  await attend(6000);
  const ok = await evalue(`(() => { const r = [...document.querySelectorAll('.trc-sheet__row')].find((x) => x.textContent.includes(${JSON.stringify(nom)}) && !x.className.includes('annul')); if (r) r.click(); return !!r; })()`);
  await attend(900);
  return ok;
};

/* LA MAISON D'EXEMPLE — fictive : deux fauteuils, Team et Expert, deux sœurs
   d'un même compte (22 % de remise famille), une venue honorée de Joy pour
   que son rituel se pose de lui-même. */
const pad = (n) => String(n).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const jourPlus = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return isoDe(d); };
const KLOKLO = 'sv-plt-05-ess-c'; const SINSIN = 'sv-atl-ii-e'; const KLOKLO_KIDS = 'sv-kids-kloklo'; const SINSIN_KIDS = 'sv-kids-sinsin';
const SEMENCE = {
  'trone::mnd_branches': [{ id: 'maison', name: 'Maison du banc', city: 'Cotonou', country: 'Bénin', dial: '+229', currency: 'XOF', address: '', seats: 2, masters: ['Team', 'Expert'], masterParDefaut: 'Team', status: 'active', flagship: true }],
  'trone::mnd_current_branch': 'maison',
  'trone::mnd_catalog_categories': [
    { id: 'cat-lavages', fon: 'KLƆKLƆ™', label: 'les lavages', enabled: true, order: 1 },
    { id: 'cat-reprise', fon: 'SÍNSIN™', label: 'la reprise', enabled: true, order: 2 },
    { id: 'cat-mnd-kids', fon: 'MND Kids', label: 'les petites tetes couronnees', enabled: true, order: 900 },
  ],
  'trone::mnd_catalog_services': [
    { id: KLOKLO, categoryId: 'cat-lavages', name: 'KLƆKLƆ™ Essentiel · Le Souffle', palier: 'Fondation', priceXof: 8000, durationMin: 30, priceMode: 'fixe', hidePrice: false, sessions: 1, order: 1 },
    { id: SINSIN, categoryId: 'cat-reprise', name: 'SÍNSIN™ Essentiel · La Reprise', palier: 'Fondation', priceXof: 20000, durationMin: 120, priceMode: 'fixe', hidePrice: false, sessions: 1, order: 2 },
    { id: KLOKLO_KIDS, categoryId: 'cat-mnd-kids', name: 'KLƆKLƆ™ Kids · Le Souffle', palier: 'Fondation', priceXof: 5000, durationMin: 30, priceMode: 'fixe', reserveEnfants: true, hidePrice: false, sessions: 1, order: 3 },
    { id: SINSIN_KIDS, categoryId: 'cat-mnd-kids', name: 'SÍNSIN™ Kids · La Reprise', palier: 'Fondation', priceXof: 15000, durationMin: 40, priceMode: 'fixe', reserveEnfants: true, hidePrice: false, sessions: 1, order: 4 },
  ],
  'trone::mnd_clients': [
    { id: 'cl-joy', branchId: 'maison', name: 'Joy Akpo', phone: '0100000042', birthday: '1998-03-03', familyId: 'fam-a', city: '', persona: '', since: '2026-01-10', segments: [] },
    { id: 'cl-fifi', branchId: 'maison', name: 'Fifi Akpo', phone: '0100000042', birthday: '2017-01-01', familyId: 'fam-a', city: '', persona: '', since: '2026-01-10', segments: [] },
  ],
  'trone::mnd_families': [{ id: 'fam-a', branchId: 'maison', name: 'Famille A.', payerClientId: 'cl-joy', remisePct: 22, toujoursEnsemble: true }],
  'trone::mnd_appointments': [
    { id: 'h-joy', branchId: 'maison', clientId: 'cl-joy', serviceIds: [KLOKLO, SINSIN], date: jourPlus(-40), time: '10:00', status: 'honoré', master: 'Team', priceXof: 28000 },
  ],
  'trone::mnd_invoices': [],
};
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('banc_seme')) { sessionStorage.setItem('banc_seme', '1'); localStorage.setItem('mnd_reset_v5', '1'); for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); } } catch (e) {}` });
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/caisse` });
await attend(8000);

/* ── 1. POSER POUR JOY POSE AUSSI FIFI ── */
dit('« + RDV » s ouvre', await clique('button', '+ RDV'));
await attend(900);
await tape('.trc-rdv3__case input', 'Joy');
await attend(500);
dit('Joy se choisit dans la case', await clique('.trc-clientpick__opt', 'Joy Akpo'));
await attend(900);
dit('son rituel habituel se pose', /KLƆKLƆ™ Essentiel \+ SÍNSIN™ Essentiel/.test(await texte('.trc-rdv3__barre-texte')), await texte('.trc-rdv3__barre-texte'));
const foyerNeuf = await texte('.trc-foyer[aria-label="Elles viennent toujours ensemble"]');
dit('« Elles viennent toujours ensemble » : Fifi, aux gestes de son âge', foyerNeuf.includes('Fifi Akpo') && foyerNeuf.includes('KLƆKLƆ™ Kids + SÍNSIN™ Kids') && foyerNeuf.includes('Team'), foyerNeuf);
dit('... la carte MND Kids se dit', foyerNeuf.includes('À son âge, la carte MND Kids'), foyerNeuf);
dit('... à son prix, la remise famille déduite (20 000 F moins 22 %)', foyerNeuf.includes('15 600'), foyerNeuf);
/* Un jour de la semaine prochaine, à 10:00 : tout le banc vit dans l'avenir. */
await clique('.trc-rdv4__bouton', 'Changer le jour');
await attend(300);
await clique('.trc-rdv3__nav button', 'Suivante');
await attend(300);
dit('un jour de la semaine prochaine se touche', await evalue(`(() => { const j = [...document.querySelectorAll('.trc-rdv3__jour')].find((b) => !b.disabled && /place/.test(b.textContent)); if (j) j.click(); return !!j; })()`));
await attend(300);
dit('... à 10:00', await clique('.trc-rdv3__heure', '10:00'));
await attend(500);
const panier = await texte('.trc-rdv5__foyer');
dit('le panier dit ce que le foyer règle', panier.includes('Fifi Akpo') && panier.includes('Le foyer règle'), panier);
dit('la barre dit « avec Fifi »', (await texte('.trc-rdv3__barre-texte')).includes('avec Fifi'), await texte('.trc-rdv3__barre-texte'));
dit('« Confirmer le RDV »', await clique('.trc-rdv3__barre button', 'Confirmer le RDV'));
await attend(1000);
const joy1 = await de('cl-joy');
const fifi1 = await de('cl-fifi');
dit('deux rendez-vous écrits, au même jour, à la même heure, au même foyer', !!joy1 && !!fifi1 && joy1.date === fifi1.date && joy1.time === fifi1.time
  && !!joy1.foyerId && joy1.foyerId === fifi1.foyerId, JSON.stringify([joy1, fifi1].map((a) => a && [a.date, a.time, a.master, a.foyerId])));
dit('Fifi : ses gestes Kids, chez Team, 20 000 F et 4 400 F de remise famille', !!fifi1 && JSON.stringify(fifi1.serviceIds) === JSON.stringify([KLOKLO_KIDS, SINSIN_KIDS])
  && fifi1.master === 'Team' && fifi1.priceXof === 20000 && fifi1.remiseFamilleXof === 4400 && fifi1.remiseFamille === true && fifi1.status === 'confirmé',
  JSON.stringify(fifi1 && [fifi1.serviceIds, fifi1.master, fifi1.priceXof, fifi1.remiseFamilleXof, fifi1.status]));
dit('Joy garde les siens', !!joy1 && JSON.stringify(joy1.serviceIds) === JSON.stringify([KLOKLO, SINSIN]) && joy1.master === 'Team', JSON.stringify(joy1 && [joy1.serviceIds, joy1.master]));
dit('l écran « posé » le dit', (await texte('.trc-rdv4__pose')).includes('Avec Fifi, à la même heure'), await texte('.trc-rdv4__pose'));

/* ── 2. CHANGER L'HEURE DE JOY DÉPLACE FIFI ── */
dit('« Le modifier » rouvre Joy', await clique('.trc-rdv4__pose button', 'Le modifier'));
await attend(800);
const foyerRelu = await texte('.trc-foyer[aria-label="Le foyer"]');
dit('relu : le foyer dit Fifi', foyerRelu.includes('Fifi Akpo') && foyerRelu.includes('Seulement Joy'), foyerRelu);
dit('le panier dit le foyer, ce jour-là', (await texte('.trc-rdv5__foyer')).includes('Le foyer règle'), await texte('.trc-rdv5__foyer'));
await clique('.trc-rdv4__bouton', 'Changer le jour');
await attend(300);
dit('une autre heure : 15:00', await choisis('.trc-rdv3__autre select', '15:00'));
await attend(400);
dit('... la fenêtre dit que Fifi suit', (await texte('.trc-foyer[aria-label="Le foyer"]')).includes('Fifi suit'), await texte('.trc-foyer[aria-label="Le foyer"]'));
dit('« Enregistrer »', await clique('.trc-rdv3__barre button', 'Enregistrer'));
await attend(900);
const joy2 = await de('cl-joy');
const fifi2 = await de('cl-fifi');
dit('les deux à 15:00, chacune chez son maître, toujours du même foyer', joy2?.time === '15:00' && fifi2?.time === '15:00' && fifi2?.date === joy2?.date
  && fifi2?.master === 'Team' && fifi2?.foyerId === joy2?.foyerId, JSON.stringify([joy2, fifi2].map((a) => a && [a.date, a.time, a.master, a.foyerId])));

/* ── 3. « SEULEMENT FIFI » ── */
dit('le Carnet ouvre Fifi', await ouvreDuCarnet('Fifi Akpo'));
await clique('.trc-rdv4__bouton', 'Changer le jour');
await attend(300);
await choisis('.trc-rdv3__autre select', '16:30');
await attend(300);
dit('« Seulement Fifi » se coche', await coche('.trc-foyer__seule input'));
await attend(300);
dit('... la fenêtre dit que Joy reste', (await texte('.trc-foyer[aria-label="Le foyer"]')).includes('Fifi se déplace seule'), await texte('.trc-foyer[aria-label="Le foyer"]'));
await clique('.trc-rdv3__barre button', 'Enregistrer');
await attend(900);
const joy3 = await de('cl-joy');
const fifi3 = await de('cl-fifi');
dit('Fifi seule à 16:30, sans foyer ; Joy reste à 15:00, au sien', fifi3?.time === '16:30' && !fifi3?.foyerId && joy3?.time === '15:00' && !!joy3?.foyerId,
  JSON.stringify([joy3, fifi3].map((a) => a && [a.time, a.foyerId ?? null])));

/* ── 4. REPOSÉES À LA MÊME HEURE : « LES LIER » ── */
await ouvreDuCarnet('Fifi Akpo');
await clique('.trc-rdv4__bouton', 'Changer le jour');
await attend(300);
await choisis('.trc-rdv3__autre select', '15:00');
await attend(300);
await clique('.trc-rdv3__barre button', 'Enregistrer');
await attend(900);
dit('Fifi revient à 15:00, sans emmener personne', (await de('cl-fifi'))?.time === '15:00' && (await de('cl-joy'))?.time === '15:00');
dit('le Carnet rouvre Fifi', await ouvreDuCarnet('Fifi Akpo'));
const lier = await texte('.trc-foyer--lier');
dit('« Elles viennent ensemble ? » se propose', lier.includes('Elles viennent ensemble ?') && lier.includes('Joy'), lier);
dit('« Les lier »', await clique('.trc-foyer--lier button', 'Les lier'));
await attend(600);
const joy4 = await de('cl-joy');
const fifi4 = await de('cl-fifi');
dit('un foyer commun, celui que Joy portait', !!fifi4?.foyerId && fifi4.foyerId === joy4?.foyerId, JSON.stringify([joy4?.foyerId, fifi4?.foyerId]));
dit('... et la fenêtre montre le foyer', (await texte('.trc-foyer[aria-label="Le foyer"]')).includes('Joy Akpo'), await texte('.trc-foyer[aria-label="Le foyer"]'));

/* ── 5. ANNULER : « LES DEUX, OU SEULEMENT FIFI ? » ── */
dit('« Annuler le rendez-vous »', await clique('.trc-rdv3__gestes button', 'Annuler le rendez-vous'));
await attend(500);
dit('la question nomme Fifi', (await texte('.mnd-dem__titre')) === 'Annuler les deux, ou seulement Fifi ?', await texte('.mnd-dem__titre'));
const boutons = await evalue(`[...document.querySelectorAll('.mnd-dem__pieds button')].map((b) => b.textContent.trim())`);
dit('... trois issues, le repos d abord', JSON.stringify(boutons) === JSON.stringify(['Ne rien annuler', 'Seulement Fifi', 'Les deux']), JSON.stringify(boutons));
dit('... le repos prend le foyer', await evalue(`document.activeElement?.textContent?.trim() === 'Ne rien annuler'`));
dit('« Ne rien annuler »', await clique('.mnd-dem__pieds button', 'Ne rien annuler'));
await attend(500);
dit('... rien n est annulé', (await rdvs()).filter((a) => a.status === 'annulé').length === 0);
dit('« Annuler le rendez-vous », encore', await clique('.trc-rdv3__gestes button', 'Annuler le rendez-vous'));
await attend(500);
dit('« Seulement Fifi »', await clique('.mnd-dem__pieds button', 'Seulement Fifi'));
await attend(800);
dit('Fifi est annulée, Joy reste confirmée', (await de('cl-fifi'))?.status === 'annulé' && (await de('cl-joy'))?.status === 'confirmé',
  JSON.stringify([(await de('cl-joy'))?.status, (await de('cl-fifi'))?.status]));

/* ── 6. LE CARNET DEMANDE AUSSI ── */
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/carnet` });
await attend(1200);
await cdp('Page.reload');
await attend(6000);
/* Fifi rétablie au même foyer, puis l'annulation de Joy par le menu. */
dit('le menu de Fifi la rétablit', await evalue(`(() => { const r = [...document.querySelectorAll('.trc-sheet__row')].find((x) => x.textContent.includes('Fifi Akpo')); const b = r?.querySelector('.trc-statut'); if (b) b.click(); return !!b; })()`)
  && (await attend(300), await clique('button', 'Rétablir le rendez-vous')));
await attend(500);
dit('le menu de Joy s ouvre', await evalue(`(() => { const r = [...document.querySelectorAll('.trc-sheet__row')].find((x) => x.textContent.includes('Joy Akpo')); const b = r?.querySelector('.trc-statut'); if (b) b.click(); return !!b; })()`));
await attend(300);
dit('« Annuler le rendez-vous » au menu', await clique('button', 'Annuler le rendez-vous'));
await attend(500);
dit('la question nomme Joy', (await texte('.mnd-dem__titre')) === 'Annuler les deux, ou seulement Joy ?', await texte('.mnd-dem__titre'));
dit('« Les deux »', await clique('.mnd-dem__pieds button', 'Les deux'));
await attend(600);
dit('le foyer est annulé, les deux', (await de('cl-fifi'))?.status === 'annulé' && (await de('cl-joy'))?.status === 'annulé',
  JSON.stringify([(await de('cl-joy'))?.status, (await de('cl-fifi'))?.status]));

/* ── 7. LA CASE, SUR LA CARTE DU COMPTE FAMILLE ── */
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/comptes` });
await attend(2500);
const caseVue = await evalue(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === 'Elles viennent toujours ensemble'); return l ? l.querySelector('input').checked : null; })()`);
dit('la carte porte la case, cochée', caseVue === true, caseVue);
await evalue(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === 'Elles viennent toujours ensemble'); l?.querySelector('input').click(); })()`);
await attend(400);
dit('... décochée, le compte l écrit', !((await lis('trone::mnd_families')) ?? [])[0]?.toujoursEnsemble);
await evalue(`(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === 'Elles viennent toujours ensemble'); l?.querySelector('input').click(); })()`);
await attend(400);
dit('... recochée', ((await lis('trone::mnd_families')) ?? [])[0]?.toujoursEnsemble === true);
dit('« Ouvrir le foyer »', await clique('button', 'Ouvrir le foyer'));
await attend(600);
dit('l éditeur montre la case cochée', await evalue(`(() => { const l = [...document.querySelectorAll('.mnd-modal label')].find((x) => x.textContent.includes('Elles viennent toujours ensemble')); return !!l?.querySelector('input')?.checked; })()`));
dit('« Enregistrer » le compte', await clique('.mnd-modal button', 'Enregistrer'));
await attend(500);
const fam = ((await lis('trone::mnd_families')) ?? [])[0];
dit('... la case et la remise restent', fam?.toujoursEnsemble === true && fam?.remisePct === 22, JSON.stringify(fam));
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nLe foyer se pose, se déplace et s annule ensemble.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
