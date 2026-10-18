/* LE BANC DE L'ENCAISSEMENT EN TROIS TEMPS — `node scripts/banc-encaisser.mjs [dossier construit] [dossier des captures]`.

   17 octobre 2026, refonte de « Encaisser le rituel » (maquette 8kpQtpQh…).
   Le harnais `verifie-caisses-des-caissiers` éprouve la règle ; ce banc
   ouvre le VRAI Trône, hors ligne, depuis le Carnet, comme une main :

     - un rituel du jour à 30 000 F : trois temps, le deuxième ouvert, les
       tuiles (MTN MoMoPay, Chèque, jamais Moov) ;
     - 20 000 F en espèces, « + Un autre moyen » pour les 10 000 F qui restent
       en MTN MoMoPay, 2 000 F de pourboire : la barre dit où va chaque
       argent ; des parts trop hautes se disent et bloquent ;
     - la pièce porte deux versements, chacun dans SA caisse (le tiroir commun
       hors ligne, faute de caissier connu ; le compte MoMoPay de la Maison) ;
     - un rendez-vous de 2025 : le bandeau le reconnaît seul, l'argent va aux
       « Années passées » (la caisse naît), daté du jour du rituel.

   Hors ligne, personne n'est connecté : les espèces vont au tiroir commun,
   comme pour une main sans caisse à son nom.

   Il attend le Trône construit sans serveur (sous Bash) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-encaisser-'));
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
const clique = (selecteur, texte, dans = 'document') => evalue(`(() => {
  const b = [...${dans}.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const tape = (selecteur, valeur, rang = 0) => evalue(`(() => {
  const el = document.querySelectorAll(${JSON.stringify(selecteur)})[${rang}];
  if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const modale = `document.querySelector('.mnd-modal')`;
const texteModale = () => evalue(`(${modale}?.innerText || '').replace(/\\s+/g, ' ')`);
const capture = async (nom, l, h, mobile) => {
  if (!captures) return;
  await cdp('Emulation.setDeviceMetricsOverride', { width: l, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await attend(600);
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(captures, `${nom}.png`), Buffer.from(img.result.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await attend(400);
};

const jour = new Date();
const AUJ = `${jour.getFullYear()}-${String(jour.getMonth() + 1).padStart(2, '0')}-${String(jour.getDate()).padStart(2, '0')}`;
const ANNEE_AVANT = jour.getFullYear() - 1;
const JOUR_PASSE = `${ANNEE_AVANT}-06-12`;
const SEMENCE = {
  'trone::mnd_cashboxes': [
    { id: 'cb-t', branchId: 'maison', name: 'Terrasse · Tiroir espèces', sub: 'Espèces du comptoir', glyph: '◈', openingXof: 0, role: 'terrasse', equipe: true },
    { id: 'cb-m', branchId: 'maison', name: 'Terrasse · MoMoPay société', sub: 'MTN MoMoPay', glyph: '◉', openingXof: 0, role: 'terrasse', equipe: true },
    { id: 'cb-b', branchId: 'maison', name: 'La Banque', sub: 'Compte de la société', glyph: '▥', openingXof: 0, role: 'banque' },
  ],
  'trone::mnd_staff': [
    { id: 'st-a', branchId: 'maison', name: 'Aïcha Banc', role: 'Maître', partPourboire: 1, auFauteuil: true },
    { id: 'st-b', branchId: 'maison', name: 'Bénédicte Banc', role: 'Maître', partPourboire: 1, auFauteuil: true },
  ],
  'trone::mnd_catalog_services': [{ id: 'sv-banc', categoryId: '', name: 'Rituel du banc', palier: 'Fondation', priceXof: 30000, hidePrice: false, sessions: 1 }],
  'trone::mnd_clients': [
    { id: 'cl-awa', branchId: 'maison', name: 'Awa Banc', phone: '', city: '', persona: '', since: AUJ, segments: [] },
    { id: 'cl-fif', branchId: 'maison', name: 'Fifamè Banc', phone: '', city: '', persona: '', since: JOUR_PASSE, segments: [] },
    { id: 'cl-ann', branchId: 'maison', name: 'Annick Banc', phone: '', city: '', persona: '', since: AUJ, segments: [] },
    { id: 'cl-che', branchId: 'maison', name: 'Chloé Banc', phone: '', city: '', persona: '', since: AUJ, segments: [] },
  ],
  'trone::mnd_appointments': [
    { id: 'rdv-awa', branchId: 'maison', clientId: 'cl-awa', clientName: 'Awa Banc', serviceIds: ['sv-banc'], master: 'Aïcha Banc', date: AUJ, time: '10:00', status: 'confirmé' },
    { id: 'rdv-fif', branchId: 'maison', clientId: 'cl-fif', clientName: 'Fifamè Banc', serviceIds: ['sv-banc'], master: 'Aïcha Banc', date: JOUR_PASSE, time: '10:00', status: 'confirmé' },
    /* LE RITUEL D'ANNICK A. (18 octobre 2026) : son versement perdu au carnet, gardé par la facture. */
    { id: 'rdv-ann', branchId: 'maison', clientId: 'cl-ann', clientName: 'Annick Banc', serviceIds: ['sv-banc'], master: 'Aïcha Banc', date: AUJ, time: '11:00', status: 'confirmé' },
    /* LE CHÈQUE (18 octobre 2026, maquette « Chèque et carte ») */
    { id: 'rdv-che', branchId: 'maison', clientId: 'cl-che', clientName: 'Chloé Banc', serviceIds: ['sv-banc'], master: 'Aïcha Banc', date: AUJ, time: '12:00', status: 'confirmé' },
  ],
  'trone::mnd_invoices': [
    { id: 'inv-ann', branchId: 'maison', kind: 'facture', number: 'F-BANC-0732', clientId: 'cl-ann', clientName: 'Annick Banc', date: AUJ, apptId: 'rdv-ann',
      lines: [{ id: 'l-ann', label: 'Rituel du banc', qty: 1, unitXof: 30000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'envoyée',
      payments: [{ id: 'ip-ann', date: AUJ, amountXof: 10000, method: 'Espèces', cashbox: 'Terrasse · Tiroir espèces' }] },
  ],
  'trone::mnd_payment_methods': ['MTN MoMo', 'Moov', 'Celtis', 'Wave', 'Espèces', 'Carte', 'Virement bancaire', 'PayPal', 'Chèque', 'Lien WhatsApp'],
};
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('banc_seme')) { sessionStorage.setItem('banc_seme', '1'); localStorage.setItem('mnd_reset_v5', '1'); for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); } } catch (e) {}` });

const ouvreLEncaissement = async (q) => {
  /* La recherche du Carnet se lit à son ouverture : on recharge la page,
     sinon la recherche d'avant resterait. */
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/carnet?q=${encodeURIComponent(q)}` });
  await attend(1500);
  await cdp('Page.reload', { ignoreCache: false });
  await attend(7000);
  const points = await evalue(`(() => { const b = document.querySelector('.trc-dots'); if (b) b.click(); return !!b; })()`);
  await attend(400);
  const enc = await clique('.trc-menu button', 'Encaisser');
  await attend(900);
  return points && enc && !!(await evalue(`!!${modale}`));
};

/* ── A. UN RITUEL DU JOUR, EN DEUX MOYENS ─────────────────────────── */
dit('le Carnet ouvre l encaissement d Awa', await ouvreLEncaissement('Awa'));
let t = await texteModale();
dit('trois temps : ce qu elle doit, comment elle paie, et ensuite', ['Ce qu’elle doit', 'Comment elle paie', 'Et ensuite'].every((x) => t.includes(x)));
const tuiles = await evalue(`[...${modale}.querySelectorAll('.trv-pay .n')].map((x) => x.textContent.trim())`);
dit('les tuiles : Espèces, MTN MoMoPay, Carte, Chèque, Autres, et pas de Moov', ['Espèces', 'MTN MoMoPay', 'Carte', 'Chèque', 'Autres'].every((x) => tuiles.includes(x)) && !tuiles.some((x) => /moov/i.test(x)), JSON.stringify(tuiles));
dit('« Ce qu elle doit » est replié, son résumé sur la ligne', t.includes('Total 30') && (await evalue(`[...${modale}.querySelectorAll('section > button[aria-expanded]')].map((b) => b.getAttribute('aria-expanded')).join(',')`)) === 'false,true,false');
dit('la barre dit où vont les 30 000 F', /30\s?000\s?F en espèces → Terrasse · Tiroir espèces/u.test(t), t.match(/[^.]*en espèces[^.]*/u)?.[0]);
await capture('encaisser-bureau', 1280, 900, false);
await capture('encaisser-telephone', 390, 844, true);

await tape('input[aria-label="Montant de la part 1"]', '40000');
await attend(300);
t = await texteModale();
const bloque = await evalue(`[...${modale}.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith('Encaisser 40'))?.disabled`);
dit('des parts trop hautes se disent, et le bouton attend', /Les parts font 40\s?000\s?F pour 30\s?000\s?F dû/u.test(t) && bloque === true);
await tape('input[aria-label="Montant de la part 1"]', '20000');
await attend(300);
dit('« + Un autre moyen » propose les 10 000 F qui restent', await clique('button', '+ Un autre moyen pour les 10'));
await attend(400);
await tape('input[aria-label="Pourboire"]', '2000');
await attend(300);
t = await texteModale();
dit('la deuxième part part en MTN MoMoPay, vers le compte MoMoPay de la Maison', /10\s?000\s?F en MTN MoMoPay → Terrasse · MoMoPay société/u.test(t));
dit('la barre dit « Tout est réglé. »', t.includes('Tout est réglé.'));
await capture('encaisser-deux-moyens', 1280, 900, false);
dit('le bouton encaisse 30 000 F', await clique('button', 'Encaisser 30', modale));
await attend(2500);
const pieces = (await lis('trone::mnd_invoices')) ?? [];
const p = pieces.find((x) => x.apptId === 'rdv-awa');
const v = (p?.payments ?? []).map((x) => [x.method, x.amountXof, x.cashbox]);
dit('deux versements, chacun dans sa caisse', JSON.stringify(v) === JSON.stringify([['Espèces', 20000, 'Terrasse · Tiroir espèces'], ['MTN MoMo', 10000, 'Terrasse · MoMoPay société']]), JSON.stringify(v));
dit('la pièce est payée, le pourboire à part', p?.status === 'payée' && p?.tipXof === 2000, `${p?.status} · ${p?.tipXof}`);
const rdv = ((await lis('trone::mnd_appointments')) ?? []).find((a) => a.id === 'rdv-awa');
dit('le carnet porte une ligne par part, la somme juste', JSON.stringify((rdv?.payments ?? []).map((x) => [x.method, x.amountXof, x.cashbox])) === JSON.stringify([['Espèces', 20000, 'Terrasse · Tiroir espèces'], ['MTN MoMo', 10000, 'Terrasse · MoMoPay société']]) && rdv?.paidXof === 30000, JSON.stringify(rdv?.payments?.map((x) => x.amountXof)));
const tips = ((await lis('trone::mnd_tips_v2')) ?? []).filter((x) => x.invoiceId === p?.id);
dit('l équipe reçoit ses parts du pourboire', tips.length === 2 && tips.reduce((n, x) => n + x.amountXof, 0) === 2000, JSON.stringify(tips.map((x) => x.amountXof)));

/* ── B. UN RENDEZ-VOUS D'UNE ANNÉE ANTÉRIEURE ─────────────────────── */
dit(`le Carnet ouvre l encaissement de Fifamè (${ANNEE_AVANT})`, await ouvreLEncaissement('Fifam'));
t = await texteModale();
dit('le bandeau reconnaît l année antérieure, seul', t.includes(`rendez-vous de ${ANNEE_AVANT}, année antérieure`));
dit('la barre envoie l argent aux années passées', /30\s?000\s?F en espèces → Années passées/u.test(t));
await capture('encaisser-annee-passee', 1280, 900, false);
dit('le bouton encaisse', await clique('button', 'Encaisser 30', modale));
await attend(2500);
const boites = ((await lis('trone::mnd_cashboxes')) ?? []).map((c) => c.name);
dit('la caisse « Années passées » est née', boites.includes('Années passées'), JSON.stringify(boites));
const pf = ((await lis('trone::mnd_invoices')) ?? []).find((x) => x.apptId === 'rdv-fif');
const vf = (pf?.payments ?? []).map((x) => [x.amountXof, x.cashbox, x.date]);
dit('le versement est aux années passées, daté du jour du rituel', JSON.stringify(vf) === JSON.stringify([[30000, 'Années passées', JOUR_PASSE]]), JSON.stringify(vf));

/* ── C. LE CAS D'ANNICK : LA FACTURE PORTE UN VERSEMENT QUE LE CARNET A PERDU ── */
dit('le Carnet ouvre l encaissement d Annick', await ouvreLEncaissement('Annick'));
t = await texteModale();
dit('la fenêtre dit que la facture porte déjà 10 000 F que le carnet ne connaît pas', /F-BANC-0732 porte déjà 10\s000\sF que le carnet ne connaît pas/.test(t), t.match(/La facture[^.]*\./)?.[0]);
const bloqueAnn = await evalue(`(() => { const b = [...document.querySelectorAll('.mnd-modal button')].find((x) => /^Encaisser [0-9]/.test(x.textContent.trim())); return b ? b.disabled : null; })()`);
dit('… et le bouton d encaissement attend', bloqueAnn === true, String(bloqueAnn));
dit('« Inscrire au carnet » existe', await clique('button', 'Inscrire au carnet', modale));
await attend(900);
t = await texteModale();
const rdvAnn = ((await lis('trone::mnd_appointments')) ?? []).find((x) => x.id === 'rdv-ann');
dit('le carnet porte le versement de la facture, sous son identifiant', JSON.stringify((rdvAnn?.payments ?? []).map((x) => [x.id, x.amountXof])) === JSON.stringify([['ip-ann', 10000]]) && rdvAnn?.paidXof === 10000,
  JSON.stringify(rdvAnn?.payments));
dit('le reste dû devient le vrai reste, et l alerte se tait', !/que le carnet ne connaît pas/.test(t) && /20\s000\sF/.test(t));
await cdp('Page.reload', { ignoreCache: false });
await attend(3000);

/* ── D. UN CHÈQUE NE S'ENCAISSE PAS SANS SA TRACE ── */
dit('le Carnet ouvre l encaissement de Chloé', await ouvreLEncaissement('Chloé'));
dit('la tuile Chèque se choisit', await clique('.mnd-modal button', 'Chèque'));
await attend(500);
const boutonChe = () => evalue(`(() => { const b = [...document.querySelectorAll('.mnd-modal button')].find((x) => /^Encaisser [0-9]/.test(x.textContent.trim())); return b ? b.disabled : null; })()`);
t = await texteModale();
dit('sans banque ni numéro ni photo, le bouton attend et l écran dit pourquoi', (await boutonChe()) === true && /Renseignez la banque et le numéro du chèque, ou prenez-le en photo/.test(t));
await evalue(`(() => { const s = document.querySelector('.mnd-modal select[aria-label^="Banque du chèque"]'); if (!s) return false;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(s, 'BOA Bénin'); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
await attend(300);
dit('la banque seule ne suffit pas', (await boutonChe()) === true);
await evalue(`(() => { const i = document.querySelector('.mnd-modal input[aria-label^="Numéro du chèque"]'); if (!i) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '1234567'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
await attend(400);
dit('la banque et le numéro ouvrent le bouton', (await boutonChe()) === false);
dit('le chèque s encaisse', await clique('.mnd-modal button', 'Encaisser 30'));
await attend(2500);
const pche = ((await lis('trone::mnd_invoices')) ?? []).find((x) => x.apptId === 'rdv-che');
const vche = (pche?.payments ?? []).map((x) => [x.method, x.amountXof, x.cashbox, x.trace?.banque, x.trace?.numero]);
dit('le versement porte sa trace : chèque, BOA Bénin, n° 1234567, à la banque', JSON.stringify(vche) === JSON.stringify([['Chèque', 30000, 'La Banque', 'BOA Bénin', '1234567']]), JSON.stringify(vche));

await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/caisses` });
await attend(4500);
const depot = await evalue(String.raw`(document.querySelector('[data-cheques-a-deposer]')?.innerText || '').replace(/\s+/g, ' ')`);
dit('Caisses : le chèque attend son dépôt, avec sa banque et son numéro', /Chèques à déposer/.test(depot) && /Chloé Banc · BOA Bénin · n° 1234567/.test(depot), depot.slice(0, 120));

/* Le rituel du jour ne voit jamais les années passées, même la caisse née. */
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/carnet?q=Awa` });
await attend(5000);
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nL encaissement en trois temps tient.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
