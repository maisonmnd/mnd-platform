/* LE BANC DE « LE POINT » — `node scripts/banc-le-point.mjs [dossier des captures]`.

   21 novembre 2026, maquette GqBogAWn…, « construis ». `verifie-le-point`
   éprouve les règles ; ce banc construit le VRAI Trône (serveur Supabase
   injoignable), l'ouvre dans un vrai Chrome avec une session gardée et une
   cliente fictive, et joue la page :
     1. le point : ce qu'elle doit, l'encaissé, l'à-venir, les lignes et leurs états ;
     2. un rituel passé sans argent : une remise de ligne fait bouger le rituel
        et le dû AVANT d'enregistrer ; ajouter une prestation, annuler ;
        enregistrer écrit le rendez-vous comme la fenêtre ;
     3. un rituel payé en partie : une remise sur ce qui reste, jamais plus ;
     4. cocher, programmer une relance : chaque pièce reçoit le même plan,
        un rituel sans facture reçoit la sienne, celui payé en partie la
        pièce de son reste ; la page dit d'avance ce qui ne partira pas ;
     5. le suivi : sauter la prochaine, arrêter ;
     6. la porte : un maître sans Vente & Caisse n'y entre pas, le gérant si.
   L'horloge est figée au samedi 21 novembre 2026, 15 h 13 à Cotonou, le
   poste à l'heure de Chine. Toutes les données sont inventées. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const captures = process.argv[2] || '';
if (captures) mkdirSync(captures, { recursive: true });
const dejaConstruit = process.env.BANC_CONSTRUIT || '';
const construit = dejaConstruit || mkdtempSync(path.join(tmpdir(), 'banc-point-'));
if (!dejaConstruit || !existsSync(path.join(construit, 'index.html'))) {
  console.log('Construction du Trone (serveur injoignable)...');
  execSync(`npx vite build --outDir "${construit}" --emptyOutDir --logLevel error`, {
    cwd: racine, stdio: 'ignore',
    env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_ALLOW_OPEN: 'false', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
  });
  renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));
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
const origine = `http://127.0.0.1:${serveur.address().port}`;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-point-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let cible;
for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
if (!cible) { console.error('Chrome ne repond pas.'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const enCours = new Map(); const erreurs = [];
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

/* ── L'HORLOGE FIGÉE ET LA SESSION ── */
const INSTANT = Date.UTC(2026, 10, 21, 14, 13, 0);
const UID = 'u-banc-point';
const CLE = 'sb-127-auth-token';
let roleDuBanc = 'souverain';
let accesDuBanc = {};
const session = (role) => {
  const le = new Date(INSTANT - 86_400_000).toISOString();
  return {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(INSTANT / 1000) - 7200,
      user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Direction du banc', role, rubrics: [] } },
  };
};
const ENTETES = [{ name: 'Access-Control-Allow-Origin', value: '*' }, { name: 'Access-Control-Allow-Headers', value: '*' }, { name: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' }, { name: 'Content-Type', value: 'application/json' }];
const rend = (requestId, code, corps) => cdp('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: ENTETES, body: Buffer.from(JSON.stringify(corps)).toString('base64') });
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') erreurs.push(m.params.exceptionDetails.exception?.description?.split('\n')[0] ?? m.params.exceptionDetails.text);
  if (m.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = m.params;
  /* La session, comme un serveur la rendrait (le reste du serveur demeure injoignable). */
  if (request.method === 'OPTIONS') { void rend(requestId, 200, {}); return; }
  if (/\/auth\/v1\/token/.test(request.url)) { void rend(requestId, 200, { ...session(roleDuBanc)[CLE], access_token: 'faux-renouvele', refresh_token: 'faux-renouvele', expires_at: Math.floor(INSTANT / 1000) + 3600 }); return; }
  if (/\/auth\/v1\/user/.test(request.url)) { void rend(requestId, 200, session(roleDuBanc)[CLE].user); return; }
  if (/\/rest\/v1\/staff/.test(request.url)) {
    const ligne = { user_id: UID, name: 'Direction du banc', role: roleDuBanc, rubrics: [] };
    const veut = Object.entries(request.headers ?? {}).find(([k]) => k.toLowerCase() === 'accept')?.[1] ?? '';
    void rend(requestId, 200, /vnd\.pgrst\.object/.test(veut) ? ligne : [ligne]); return;
  }
  if (/\/rest\/v1\/documents/.test(request.url) && /key=eq\.mnd_staff_access/.test(request.url)) {
    const veut = Object.entries(request.headers ?? {}).find(([k]) => k.toLowerCase() === 'accept')?.[1] ?? '';
    const ligne = { data: { [UID]: accesDuBanc }, updated_at: new Date(INSTANT).toISOString() };
    void rend(requestId, 200, /vnd\.pgrst\.object/.test(veut) ? ligne : [ligne]); return;
  }
  void cdp('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' });
});
await cdp('Runtime.enable');
await cdp('Page.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Asia/Shanghai' });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const Vraie = Date; const fige = ${INSTANT};
  class Figee extends Vraie { constructor(...a) { if (a.length === 0) super(fige); else super(...a); } static now() { return fige; } }
  globalThis.Date = Figee;
})();` });
await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/auth/v1/token*' }, { urlPattern: '*/auth/v1/user*' }, { urlPattern: '*/rest/v1/staff*' }, { urlPattern: '*/rest/v1/documents*key=eq.mnd_staff_access*' }] });

let ko = 0;
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`)); };
const plat = (s) => String(s ?? '').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
const texte = async (sel) => plat(await evalue(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '')`));
const photo = async (nom, l = 1360, h = 900, mobile = false) => {
  if (!captures) return;
  await cdp('Emulation.setDeviceMetricsOverride', { width: l, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await attend(700);
  const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  writeFileSync(path.join(captures, `${nom}.png`), Buffer.from(img.result.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1360, height: 900, deviceScaleFactor: 1, mobile: false });
};

/* ── LA CLIENTE FICTIVE ── */
const SV = (sid, nom, prix, duree) => ({ id: sid, categoryId: '', name: nom, palier: 'Fondation', priceXof: prix, durationMin: duree, hidePrice: false, sessions: 1, order: 1 });
const DONNEES = {
  'trone::mnd_branches': [{ id: 'maison', name: 'Maison du banc', city: 'Cotonou', country: 'Bénin', dial: '+229', currency: 'XOF', address: '', seats: 2, masters: ['Expert', 'Team'], masterParDefaut: 'Expert', status: 'active', flagship: true }],
  'trone::mnd_current_branch': 'maison',
  'trone::mnd_staff': [{ id: 'st-a', branchId: 'maison', name: 'Expert', role: 'Maître', partPourboire: 1, auFauteuil: true }],
  'trone::mnd_catalog_services': [SV('sv-resserrage', 'Resserrage du banc', 25000, 60), SV('sv-coiffure', 'Coiffure du banc', 10000, 30), SV('sv-reprise', 'Reprise du banc', 20000, 60), SV('sv-soin', 'Soin du banc', 12000, 30), SV('sv-shampoing', 'Shampoing du banc', 8000, 20)],
  'trone::mnd_clients': [{ id: 'cl-ak', branchId: 'maison', name: 'Awa Kossou', phone: '0100000061', city: '', persona: '', since: '2025-01-10', segments: [] }],
  'trone::mnd_appointments': [
    { id: 'rdv-a', branchId: 'maison', clientId: 'cl-ak', serviceIds: ['sv-resserrage', 'sv-coiffure'], date: '2026-10-17', time: '10:00', status: 'honoré', master: 'Expert', priceXof: 35000 },
    { id: 'rdv-b', branchId: 'maison', clientId: 'cl-ak', serviceIds: ['sv-reprise', 'sv-soin'], date: '2026-11-14', time: '11:00', status: 'honoré', master: 'Team', priceXof: 32000, paidXof: 20000, invoiceId: 'inv-b',
      payments: [{ id: 'pb1', amountXof: 20000, method: 'MTN MoMo', date: '2026-11-15', invoiceId: 'inv-b' }] },
    { id: 'rdv-c', branchId: 'maison', clientId: 'cl-ak', serviceIds: ['sv-resserrage', 'sv-shampoing'], date: '2026-11-28', time: '10:00', status: 'confirmé', master: 'Expert' },
    { id: 'rdv-d', branchId: 'maison', clientId: 'cl-ak', serviceIds: ['sv-resserrage'], date: '2026-09-05', time: '10:00', status: 'annulé', master: 'Expert' },
    { id: 'rdv-e', branchId: 'maison', clientId: 'cl-ak', serviceIds: ['sv-resserrage'], date: '2026-09-19', time: '09:00', status: 'honoré', master: 'Expert', priceXof: 25000, paidXof: 25000, invoiceId: 'inv-e',
      payments: [{ id: 'pe1', amountXof: 25000, method: 'Espèces', date: '2026-09-19', invoiceId: 'inv-e' }] },
  ],
  'trone::mnd_invoices': [
    { id: 'inv-b', branchId: 'maison', kind: 'facture', number: 'F-2026-0211', status: 'payée', date: '2026-11-14', clientId: 'cl-ak', clientName: 'Awa Kossou', apptId: 'rdv-b',
      lines: [{ id: 'l1', qty: 1, label: 'Règlement · Reprise du banc + Soin du banc', unitXof: 20000, discountPct: 0 }], payments: [{ id: 'pb1', amountXof: 20000, method: 'MTN MoMo', date: '2026-11-15' }], globalDiscountPct: 0 },
    { id: 'inv-e', branchId: 'maison', kind: 'facture', number: 'F-2026-0170', status: 'payée', date: '2026-09-19', clientId: 'cl-ak', clientName: 'Awa Kossou', apptId: 'rdv-e',
      lines: [{ id: 'l1', qty: 1, label: 'Resserrage du banc', unitXof: 25000, discountPct: 0 }], payments: [{ id: 'pe1', amountXof: 25000, method: 'Espèces', date: '2026-09-19' }], globalDiscountPct: 0 },
    { id: 'inv-v', branchId: 'maison', kind: 'facture', number: 'F-2026-0188', status: 'payée', date: '2026-10-02', clientId: 'cl-ak', clientName: 'Awa Kossou',
      lines: [{ id: 'l1', qty: 2, label: 'Huile du banc', unitXof: 4500, discountPct: 0 }], payments: [{ id: 'pv1', amountXof: 9000, method: 'Espèces', date: '2026-10-02' }], globalDiscountPct: 0 },
  ],
  'trone::mnd_payment_methods': ['MTN MoMo', 'Espèces', 'Carte'],
};
const seme = (role, avecDonnees) => { roleDuBanc = role; return evalue(`(() => {
  localStorage.setItem('mnd_reset_v5', '1');
  for (const [k, v] of Object.entries(${JSON.stringify(session(role))})) localStorage.setItem(k, JSON.stringify(v));
  ${avecDonnees ? `for (const [k, v] of Object.entries(${JSON.stringify(DONNEES)})) localStorage.setItem(k, JSON.stringify(v));` : ''}
  return true;
})()`); };
const ouvre = async (hash) => { await evalue(`location.hash = ${JSON.stringify(hash)}; true`); await attend(2200); };
const tape = (sel, valeur) => evalue(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(String(valeur))}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const choisit = (sel, valeur) => evalue(`(() => { const i = document.querySelector(${JSON.stringify(sel)}); if (!i) return false; Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(i, ${JSON.stringify(valeur)}); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
const clique = (sel, libelle) => evalue(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find((x) => x.textContent.trim() === ${JSON.stringify(libelle)} && !x.disabled); if (b) b.click(); return !!b; })()`);
const ouvreLaLigne = (morceau) => evalue(`(() => { const b = [...document.querySelectorAll('.trp-point__corps')].find((x) => x.textContent.includes(${JSON.stringify(morceau)})); if (b) b.click(); return !!b; })()`);
const lu = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(`trone::${cle}`)}) || 'null')`);
const si = () => evalue(`[...document.querySelectorAll('.trp-point__si b')].map((b) => b.textContent)`);

/* ── 1. LE POINT ── */
await cdp('Page.navigate', { url: `${origine}/` });
await attend(2500);
await seme('souverain', true);
await evalue('location.reload()');
await attend(9000);
await ouvre('#/point?id=cl-ak');
await attend(1500);
dit('la page s ouvre : le point d Awa', (await texte('.trp-point h2, .trp-point h1')).includes('Le point de Awa') || (await evalue(`document.body.innerText.includes('Le point de Awa')`)), await texte('.trp-point__grand'));
dit('ce qu elle doit : les deux rituels non soldes (35 000 + 12 000)', (await texte('.trp-point__grand')) === 'Awa doit 47 000 F à la Maison.', await texte('.trp-point__grand'));
const chiffres = (await evalue(`[...document.querySelectorAll('.trp-point__chiffres > div')].map((d) => d.querySelector('b').textContent)`)).map(plat);
dit('les chiffres : doit, encaisse (20 000 + 25 000 + 9 000), aucune relance, a venir (au tarif de sa tete)', JSON.stringify(chiffres) === JSON.stringify(['47 000 F', '54 000 F', 'Aucune', '33 000 F']), JSON.stringify(chiffres));
const lignes = (await evalue(`[...document.querySelectorAll('.trp-point__ligne')].map((l) => [l.querySelector('.trp-point__statut')?.textContent ?? '', [...(l.querySelectorAll('.trp-point__c')[3]?.children ?? [])].map((x) => x.textContent).join(' '), !!l.querySelector('.trp-point__case input')])`)).map((x) => x.map((y) => (typeof y === 'string' ? plat(y) : y)));
dit('six lignes, la plus recente d abord, chacune son etat ; seules celles qui doivent se cochent', JSON.stringify(lignes) === JSON.stringify([
  ['À venir', '— à venir', false], ['Honoré', 'F-2026-0211 réglée en partie', true], ['Honoré', 'Pas encore de pièce à régler', true],
  ['Vente', 'F-2026-0188 réglée', false], ['Honoré', 'F-2026-0170 réglée', false], ['Annulé', '— annulé', false]]), JSON.stringify(lignes));
const filtres = (await evalue(`[...document.querySelectorAll('.trp-point__filtres button')].map((b) => b.textContent)`)).map(plat);
dit('les filtres comptent avec le meme juge', filtres.join('|') === 'Tout · 6|À régler · 2|Réglés · 2|À venir · 1|Avec une facture · 3|Annulés · 1', filtres.join('|'));
await photo('point-bureau');

/* ── 2. UN RITUEL PASSÉ SANS ARGENT ── */
dit('ouvrir le rituel du 17 octobre', await ouvreLaLigne('Resserrage du banc + Coiffure du banc'));
await attend(600);
dit('... l editeur entier : titre, deux lignes, et rien n a bouge', (await texte('.trp-point__titre')).startsWith('Modifier ce rituel') && (await evalue(`document.querySelectorAll('.trp-point__l').length`)) === 2 && JSON.stringify((await si()).map(plat)) === JSON.stringify(['35 000 F', '47 000 F']), JSON.stringify((await si()).map(plat)));
await tape('.trp-point__remise input[aria-label="Remise sur Coiffure du banc"]', '20');
await attend(400);
dit('une remise de 20 % sur la coiffure : le rituel et le du bougent avant d enregistrer', JSON.stringify((await si()).map(plat)) === JSON.stringify(['33 000 F', '45 000 F']) && (await texte('.trp-point__apres')) === '45 000 F si vous enregistrez la modification en cours.', `${JSON.stringify((await si()).map(plat))} · ${await texte('.trp-point__apres')}`);
await choisit('.trp-point__ajouter select', 'sv-shampoing');
await clique('.trp-point__ajouter button', 'Ajouter');
await attend(400);
dit('ajouter un shampoing : trois lignes, le rituel monte', (await evalue(`document.querySelectorAll('.trp-point__l').length`)) === 3 && plat((await si())[0]) === '41 000 F', plat((await si())[0]));
await clique('.trp-point__editeur button', 'Annuler');
await attend(300);
dit('« Annuler » remet le rituel tel qu il est enregistre', (await evalue(`document.querySelectorAll('.trp-point__l').length`)) === 2 && plat((await si())[0]) === '35 000 F', plat((await si())[0]));
await tape('.trp-point__remise input[aria-label="Remise sur Coiffure du banc"]', '20');
await attend(300);
await clique('.trp-point__editeur button', 'Enregistrer');
await attend(900);
const a = (await lu('mnd_appointments')).find((x) => x.id === 'rdv-a');
dit('enregistrer : le rendez-vous porte sa remise de ligne et le prix relu au tarif de sa tete', a.priceXof === 33000 && JSON.stringify(a.remisesLignes) === JSON.stringify([null, { pct: 20 }]) && a.serviceIds.join() === 'sv-resserrage,sv-coiffure' && a.discountXof === undefined, JSON.stringify({ p: a.priceXof, r: a.remisesLignes, d: a.discountXof }));
dit('... et la page suit : elle doit 45 000 F', (await texte('.trp-point__grand')) === 'Awa doit 45 000 F à la Maison.', await texte('.trp-point__grand'));

/* ── 3. UN RITUEL PAYÉ EN PARTIE ── */
dit('ouvrir le rituel du 14 novembre, paye en partie', await ouvreLaLigne('Reprise du banc + Soin du banc'));
await attend(600);
dit('... une remise sur ce qui reste, les prestations restent telles qu elles ont ete payees', (await texte('.trp-point__titre')).startsWith('Une remise sur ce qui reste') && (await evalue(`document.querySelectorAll('.trp-point__remise input').length`)) === 0, await texte('.trp-point__titre'));
await tape('#trp-point-remise-rdv-b', '50000');
await attend(400);
dit('... jamais plus que le reste : 50 000 F demandes, 12 000 F poses', JSON.stringify((await si()).map(plat)) === JSON.stringify(['20 000 F', '33 000 F']), JSON.stringify((await si()).map(plat)));
await tape('#trp-point-remise-rdv-b', '2000');
await attend(300);
await clique('.trp-point__editeur button', 'Enregistrer');
await attend(900);
const b = (await lu('mnd_appointments')).find((x) => x.id === 'rdv-b');
const invB = (await lu('mnd_invoices')).find((x) => x.id === 'inv-b');
dit('enregistrer : 2 000 F de remise au rituel ; son prix et son reçu paye ne bougent pas', b.discountXof === 2000 && b.priceXof === 32000 && invB.lines[0].unitXof === 20000 && invB.payments.length === 1, JSON.stringify({ d: b.discountXof, p: b.priceXof, recu: invB.lines[0].unitXof }));
dit('... elle doit 43 000 F', (await texte('.trp-point__grand')) === 'Awa doit 43 000 F à la Maison.', await texte('.trp-point__grand'));
await ouvreLaLigne('Reprise du banc + Soin du banc');
await attend(300);

/* ── 4. COCHER, PROGRAMMER ── */
await evalue(`[...document.querySelectorAll('.trp-point__case input')].forEach((i) => i.click()); true`);
await attend(400);
dit('deux lignes cochees : leur total', (await texte('.trp-point__selection-haut b')) === '2 lignes choisies · 43 000 F', await texte('.trp-point__selection-haut b'));
await clique('.trp-point__selection button', 'Programmer une relance');
await attend(400);
dit('la page dit d avance ce qui ne partira pas : le modele du point (deux jours differents), Tap & Go eteint', (await evalue(`[...document.querySelectorAll('.trp-point__alerte')].map((p) => p.textContent).join(' | ')`)).includes('leur rappel groupé attend que Meta approuve le modèle du point')
  && (await evalue(`[...document.querySelectorAll('.trp-point__alerte')].some((p) => p.textContent.includes('Le paiement en ligne ou Tap'))`)), plat(await evalue(`[...document.querySelectorAll('.trp-point__alerte')].map((p) => p.textContent).join(' | ')`)).slice(0, 160));
await tape('#trp-point-jour', '2026-11-23');
await attend(200);
await clique('.trp-point__puces button', 'Tous les 7 jours');
await clique('.trp-point__programmer button', 'Programmer');
await attend(900);
const inv = await lu('mnd_invoices');
const nouvelles = inv.filter((x) => !['inv-b', 'inv-e', 'inv-v'].includes(x.id));
const pieceA = nouvelles.find((x) => x.apptId === 'rdv-a');
const pieceB = nouvelles.find((x) => x.apptId === 'rdv-b');
dit('un rituel sans facture recoit la sienne (le net, a regler) ; celui paye en partie, la piece de son reste', nouvelles.length === 2 && pieceA?.status === 'envoyée' && pieceA?.kind === 'facture' && pieceB?.lines?.length === 1 && pieceB.lines[0].label.startsWith('Règlement ·') && pieceB.lines[0].unitXof === 10000,
  JSON.stringify(nouvelles.map((x) => [x.apptId, x.status, x.lines?.map((l) => [l.label.slice(0, 20), l.qty, l.unitXof])])));
dit('... chaque piece porte le meme plan : quatre lundis a partir du 23 novembre', !!pieceA?.relanceProgrammee && pieceA.relanceProgrammee.plan === pieceB?.relanceProgrammee?.plan
  && pieceA.relanceProgrammee.jours.join() === '2026-11-23,2026-11-30,2026-12-07,2026-12-14' && pieceA.relanceProgrammee.le.startsWith('2026-11-21'), JSON.stringify(pieceA?.relanceProgrammee));
dit('... les cases se decochent, le compte ne bouge pas : 43 000 F', (await evalue(`document.querySelectorAll('.trp-point__case input:checked').length`)) === 0 && (await texte('.trp-point__grand')) === 'Awa doit 43 000 F à la Maison.', await texte('.trp-point__grand'));

/* ── 5. LE SUIVI ── */
const jours = async () => (await evalue(`[...document.querySelectorAll('.trp-point__plan .trp-point__jour')].map((j) => j.className.replace('trp-point__jour ', '') + ':' + j.textContent)`)).map(plat);
dit('le plan : ses quatre jours, le premier en prochaine ; la prochaine relance en tete', JSON.stringify(await jours()) === JSON.stringify(['is-prochaine:lun. 23 nov. · 10 h', 'is-a-venir:lun. 30 nov.', 'is-a-venir:lun. 7 déc.', 'is-a-venir:lun. 14 déc.'])
  && plat(await evalue(`[...document.querySelectorAll('.trp-point__chiffres > div')][2].querySelector('b').textContent`)) === 'lun. 23 nov.', JSON.stringify(await jours()));
dit('... la ligne dit sa relance programmee', (await evalue(`[...document.querySelectorAll('.trp-point__ligne')].filter((l) => l.textContent.includes('Relance programmée le lun. 23 nov.')).length`)) === 2);
await photo('point-plan');
await clique('.trp-point__plan button', 'Sauter la prochaine');
await attend(600);
const apresSaut = (await lu('mnd_invoices')).filter((x) => x.relanceProgrammee).map((x) => x.relanceProgrammee.sautes ?? []);
dit('sauter la prochaine : le 23 sauté sur chaque piece, la prochaine passe au 30', apresSaut.length === 2 && apresSaut.every((s) => s.join() === '2026-11-23') && (await jours())[0] === 'is-sautee:lun. 23 nov. · sautée' && (await jours())[1] === 'is-prochaine:lun. 30 nov. · 10 h', JSON.stringify(await jours()));
await clique('.trp-point__plan button', 'Arrêter les relances');
await attend(600);
const arretes = (await lu('mnd_invoices')).filter((x) => x.relanceProgrammee).map((x) => !!x.relanceProgrammee.arreteLe);
dit('arreter : chaque piece porte l arret, le plan quitte le suivi, plus de prochaine relance', arretes.length === 2 && arretes.every(Boolean) && (await evalue(`document.querySelectorAll('.trp-point__plan').length`)) === 0
  && plat(await evalue(`[...document.querySelectorAll('.trp-point__chiffres > div')][2].querySelector('b').textContent`)) === 'Aucune', JSON.stringify(arretes));
dit('rien n est parti : aucune requete vers une fonction d envoi', !(await evalue(`performance.getEntriesByType('resource').some((r) => /whatsapp-envoi|relances-factures/.test(r.name))`)));
await photo('point-telephone', 390, 844, true);

/* ── 6. LA PORTE ── */
const pour = async (role, acces) => {
  accesDuBanc = acces;
  await seme(role, false);
  await evalue('location.reload()');
  await attend(9000);
  await ouvre('#/point?id=cl-ak');
  await attend(1200);
  return { page: await evalue(`!!document.querySelector('.trp-point__grand')`), hash: await evalue('location.hash') };
};
const maitre = await pour('maitre', {});
dit('un maitre sans Vente & Caisse n y entre pas', !maitre.page, JSON.stringify(maitre));
const gerant = await pour('gerant', {});
dit('le gerant, si', gerant.page, JSON.stringify(gerant));
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.length ? erreurs.slice(0, 3).join(' | ') : 'aucune');
console.log(ko === 0 ? '\nLe point tient : le du juste, les remises qui bougent le total, les relances programmees, la porte.' : `\n${ko} controle(s) en echec.`);

ws.close();
chrome.kill();
await new Promise((r) => serveur.close(r));
await attend(500);
try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore un fichier */ }
if (!dejaConstruit) { try { rmSync(construit, { recursive: true, force: true }); } catch { /* idem */ } }
process.exit(ko === 0 ? 0 : 1);
