/* LE BANC DES FRAIS DE LA CARTE — `node scripts/banc-des-frais-de-carte.mjs [dossier construit] [dossier des captures]`.

   21 novembre 2026 : « Cliente Eliane, qui est là présentement, veut payer
   par carte, mais je dois rajouter les frais sur sa transaction, les frais de
   4 %. » (Yéman), puis « construis ». Le harnais `verifie-les-frais-de-carte`
   éprouve la règle ; ce banc ouvre le VRAI Trône, hors ligne, depuis le
   Carnet, et joue l'encaissement par carte au terminal :

     - A. la tuile « Carte » propose le terminal ; sous la part, la case des
       frais est cochée, avec + 644 F et 28 644 F à passer au terminal ; le
       bouton dit « Encaisser 28 000 F + frais de carte 644 F » ;
     - encaisser écrit UNE pièce de 28 644 F, soldée : la ligne des frais en
       dernier, deux versements Carte dans la même caisse (28 000 F, puis
       644 F avec sa note) ; le rendez-vous, lui, a reçu 28 000 F ;
     - B. la case décochée : la pièce vaut 28 000 F, sans ligne de frais ;
     - C. en espèces : aucune case, aucun frais ;
     - D. au téléphone, la case ne déborde pas ;
     - E. LE TPE KKIAPAY (21 novembre 2026, au soir : « FedaPay ne prend pas les
       cartes », « les frais de KkiaPay sont de 2,3 % ») : la tuile « Carte »
       propose le TPE ; aucune case de frais de la Maison, la ligne dit ce que
       KkiaPay ajoute pour elle (2,3 %) ; la pièce vaut le rituel, un seul
       versement « Carte · KkiaPay » dans la caisse KkiaPay. Les scènes A, B et
       D passent au terminal de la banque par « Autre moyen ».

   Il attend le Trône construit sans serveur (sous Bash) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir
   Toutes les données sont inventées : le dépôt est public. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, statSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const construit = args[0] || path.join(tmpdir(), 'banc-trone');
const captures = args[1] || '';

if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
/* Jamais un Trône branché sur la vraie base pendant un banc. */
const assets = path.join(construit, 'assets');
if (readdirSync(assets).some((f) => f.endsWith('.js') && /\.supabase\.co/.test(readFileSync(path.join(assets, f), 'utf8')))) {
  console.error('La construction porte une adresse Supabase : banc arrete.');
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-des-frais-de-carte-'));
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

let ko = 0; let n = 0;
/* La console Windows parle cp1252 : tout ce qui sort est ramené à l'ASCII. */
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom, ok, detail) => { n++; if (!ok) ko++; console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`)); };
const modale = `document.querySelector('.mnd-modal')`;
const clique = (selecteur, texte, dans = 'document') => evalue(`(() => {
  const b = [...(${dans})?.querySelectorAll(${JSON.stringify(selecteur)}) ?? []].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const capture = async (nom, l, h, mobile) => {
  if (!captures) return;
  await cdp('Emulation.setDeviceMetricsOverride', { width: l, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await attend(600);
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(captures, `${nom}.png`), Buffer.from(img.result.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await attend(400);
};
/* Un champ rempli comme une main le remplit (React lit l'événement input). */
const remplis = (selecteur, valeur) => evalue(`(() => {
  const i = ${modale}?.querySelector(${JSON.stringify(selecteur)});
  if (!i) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(valeur)});
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);

/* LA MAISON D'EXEMPLE — fictive : un fauteuil, un tiroir, deux gestes (28 000 F). */
const pad = (x) => String(x).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/* L'HEURE FIGÉE (22 novembre 2026) : un samedi de salon, 18 h à Cotonou, tous
   les rituels passés — le banc ne dépend plus du jour où il tourne. Piège du
   même jour : sans argument, il prend le Trône construit dans $TEMP/banc-trone,
   qu'une autre copie a pu laisser vieux (27 échecs, la règle intacte) ;
   construire le sien et le passer en premier argument. */
const INSTANT = Date.UTC(2026, 10, 21, 17, 0, 0);
const AUJ = isoDe(new Date(INSTANT));
await cdp('Emulation.setTimezoneOverride', { timezoneId: 'Africa/Lagos' });
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const Vraie = Date; const fige = ${INSTANT};
  class Figee extends Vraie { constructor(...a) { if (a.length === 0) super(fige); else super(...a); } static now() { return fige; } }
  globalThis.Date = Figee;
})();` });
const GESTES = ['sv-souffle', 'sv-reprise'];
const tete = (cid, nom, phone) => ({ id: cid, branchId: 'maison', name: nom, phone, city: '', persona: '', since: '2026-01-10', segments: [], sansPapiersWa: true });
const duJour = (cid, heure) => ({ id: `rdv-${cid}`, branchId: 'maison', clientId: cid, serviceIds: GESTES, date: AUJ, time: heure, status: 'confirmé', master: 'Expert' });
const TETES = [['cl-ea', 'Elise A.', '09:00', '0100000071'], ['cl-fb', 'Flora B.', '11:00', '0100000072'], ['cl-gc', 'Gisèle C.', '14:00', '0100000073'], ['cl-hd', 'Hortense D.', '16:00', '0100000074']];
const SEMENCE = {
  'trone::mnd_branches': [{ id: 'maison', name: 'Maison du banc', city: 'Cotonou', country: 'Bénin', dial: '+229', currency: 'XOF', address: '', seats: 2, masters: ['Expert', 'Team'], masterParDefaut: 'Expert', status: 'active', flagship: true }],
  'trone::mnd_current_branch': 'maison',
  'trone::mnd_cashboxes': [
    { id: 'cb-t', branchId: 'maison', name: 'Terrasse · Tiroir espèces', sub: 'Espèces du comptoir', glyph: '◈', openingXof: 0, role: 'terrasse', equipe: true },
  ],
  'trone::mnd_staff': [{ id: 'st-a', branchId: 'maison', name: 'Expert', role: 'Maître', partPourboire: 1, auFauteuil: true }],
  'trone::mnd_catalog_services': [
    { id: 'sv-souffle', categoryId: '', name: 'Souffle du banc', palier: 'Fondation', priceXof: 8000, durationMin: 30, hidePrice: false, sessions: 1, order: 1 },
    { id: 'sv-reprise', categoryId: '', name: 'Reprise du banc', palier: 'Fondation', priceXof: 20000, durationMin: 60, hidePrice: false, sessions: 1, order: 2 },
  ],
  'trone::mnd_clients': TETES.map(([cid, nom, , tel]) => tete(cid, nom, tel)),
  'trone::mnd_appointments': TETES.map(([cid, , h]) => duJour(cid, h)),
  'trone::mnd_invoices': [],
  'trone::mnd_payment_methods': ['MTN MoMo', 'Espèces', 'Carte', 'Chèque'],
};
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('banc_seme')) { sessionStorage.setItem('banc_seme', '1'); localStorage.setItem('mnd_reset_v5', '1'); for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); } } catch (e) {}` });

const ouvreLEncaissement = async (q, heure) => {
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/carnet?q=${encodeURIComponent(q)}` });
  await attend(1500);
  await cdp('Page.reload', { ignoreCache: false });
  await attend(7000);
  const points = await evalue(`(() => { const l = [...document.querySelectorAll('.trc-rdv')].find((r) => r.querySelector('.trc-time')?.textContent.trim() === ${JSON.stringify(heure)} && r.querySelector('.trc-statut')?.textContent.trim().startsWith('confirmé')); const b = l?.querySelector('.trc-statut'); if (b) b.click(); return !!b; })()`);
  await attend(400);
  const enc = await clique('.trc-menu button', 'Encaisser');
  await attend(900);
  return points && enc && !!(await evalue(`!!${modale}`));
};
const tuile = async (nom) => { const ok = await evalue(`(() => { const b = [...${modale}.querySelectorAll('button.trv-pay')].find((x) => x.querySelector('.n')?.textContent.trim() === ${JSON.stringify(nom)}); if (b) b.click(); return !!b; })()`); await attend(500); return ok; };
const bouton = () => evalue(`([...${modale}.querySelectorAll('button')].find((b) => /^Encaisser /.test(b.textContent.trim()))?.textContent || '').replace(/\\s+/g, ' ').trim()`);
const caseFrais = () => evalue(`(() => { const l = ${modale}?.querySelector('[data-frais-de-carte]'); return l ? { frais: Number(l.dataset.fraisDeCarte), coche: l.querySelector('input').checked, texte: l.textContent.replace(/\\s+/g, ' ').trim() } : null; })()`);
const blocage = () => evalue(`(${modale}?.querySelector('[role="alert"]')?.textContent || '').replace(/\\s+/g, ' ').trim()`);
/* Le ticket de la banque : le n° d'autorisation que la carte réclame. */
const autorisation = () => remplis('input[placeholder^="N° d"]', 'AB12CD');
const encaisse = async () => { const ok = await clique('button', 'Encaisser', modale); await attend(2500); return ok; };
/* « Autre moyen : Terminal de la banque » : la carte propose d'abord le TPE KkiaPay (21 novembre 2026). */
const auTerminal = async () => { const ok = await clique('.tre-link-btn', 'Terminal de la banque', modale); await attend(500); return ok; };
const choixDuMoyen = () => evalue(`${modale}.querySelector('[data-choix-du-moyen]')?.dataset.choixDuMoyen || ''`);
const pieceDe = async (rdvId) => ((await lis('trone::mnd_invoices')) ?? []).find((i) => i.apptId === rdvId);
const rdvDe = async (rdvId) => ((await lis('trone::mnd_appointments')) ?? []).find((a) => a.id === rdvId);
const net = (l) => Math.max(0, l.qty * l.unitXof * (1 - (l.discountPct || 0) / 100) - (l.discountXof || 0));
const totalDe = (p) => Math.max(0, (p?.lines ?? []).reduce((s, l) => s + net(l), 0) - (p?.globalDiscountXof || 0));

/* ── A. LA CARTE AU TERMINAL, FRAIS COMPRIS ── */
dit('le Carnet ouvre l encaissement d Elise A.', await ouvreLEncaissement('Elise', '09:00'));
dit('la tuile Carte se touche', await tuile('Carte'));
dit('la Carte propose le TPE KkiaPay', (await choixDuMoyen()) === 'tpeKkiapay', await choixDuMoyen());
dit('« Autre moyen : Terminal de la banque » le prend', (await auTerminal()) && (await choixDuMoyen()) === 'terminal', await choixDuMoyen());
const c1 = await caseFrais();
dit('sous la part : la case des frais, cochee, + 644 F', !!c1 && c1.frais === 644 && c1.coche, JSON.stringify(c1));
dit('... et le montant a passer au terminal : 28 644 F', !!c1 && /au terminal : 28\s?644\s?F/u.test(c1.texte), c1?.texte);
await autorisation();
const b1 = await bouton();
dit('le bouton dit le rituel et les frais', /^Encaisser 28\s?000\s?F \+ frais de carte 644\s?F$/u.test(b1), b1);
await capture('frais-carte-1-la-case', 1280, 900, false);
/* Le libellé long passe à la ligne : sans cela il sortait de la colonne et la fenêtre défilait de côté. */
const tient = await evalue(`(() => { const b = [...${modale}.querySelectorAll('button')].find((x) => /^Encaisser /.test(x.textContent.trim())); const col = b?.parentElement; if (!b || !col) return 'absent'; const rb = b.getBoundingClientRect(), rc = col.getBoundingClientRect(); return rb.right <= rc.right + 1 && b.scrollWidth <= b.clientWidth + 1 ? 'ok' : Math.round(rb.right) + '/' + Math.round(rc.right) + ' ' + b.scrollWidth + '/' + b.clientWidth; })()`);
dit('le bouton tient dans sa colonne, le libelle passe a la ligne', tient === 'ok', tient);
dit('rien ne bloque', (await blocage()) === '', await blocage());
dit('elle regle par carte', await encaisse());
const pA = await pieceDe('rdv-cl-ea');
dit('une piece de 28 644 F, soldee', !!pA && totalDe(pA) === 28644 && pA.status === 'payée', pA ? `${totalDe(pA)} ${pA.status}` : 'aucune');
const derniere = pA?.lines?.[pA.lines.length - 1];
dit('la ligne des frais en dernier, marquee, 644 F', !!derniere && derniere.frais === 'carte' && derniere.unitXof === 644 && /^Frais de paiement par carte \(2,3/.test(derniere.label), JSON.stringify(derniere));
const vers = (pA?.payments ?? []).map((v) => `${v.amountXof}|${v.method}|${v.cashbox ?? ''}|${v.note ?? ''}`);
dit('deux versements Carte dans la meme caisse : le rituel, puis les frais avec leur note',
  vers.length === 2 && pA.payments[0].amountXof === 28000 && pA.payments[1].amountXof === 644 && pA.payments.every((v) => v.method === 'Carte')
    && pA.payments[0].cashbox === pA.payments[1].cashbox && /^Frais de carte/.test(pA.payments[1].note ?? ''), JSON.stringify(vers));
const rA = await rdvDe('rdv-cl-ea');
dit('le rendez-vous a recu 28 000 F, pas un franc de plus', rA?.paidXof === 28000 && (rA?.payments ?? []).reduce((s, v) => s + v.amountXof, 0) === 28000,
  `${rA?.paidXof} · ${JSON.stringify((rA?.payments ?? []).map((v) => v.amountXof))}`);
const ticket = await evalue(`(${modale}?.innerText || '').replace(/\\s+/g, ' ')`);
dit('« C est regle » dit les frais sur le ticket', /Frais de paiement par carte/.test(ticket) && /28\s?644\s?F/u.test(ticket), ticket.slice(0, 220));

/* ── B. LA CASE DÉCOCHÉE ── */
await cdp('Page.navigate', { url: 'about:blank' });
dit('le Carnet ouvre l encaissement de Flora B.', await ouvreLEncaissement('Flora', '11:00'));
await tuile('Carte');
await auTerminal();
await evalue(`${modale}.querySelector('[data-frais-de-carte] input')?.click()`);
await attend(300);
const c2 = await caseFrais();
dit('la case se decoche et le dit', !!c2 && !c2.coche && c2.frais === 0 && /non demand/.test(c2.texte), JSON.stringify(c2));
await autorisation();
const b2 = await bouton();
dit('le bouton ne dit plus de frais', /^Encaisser 28\s?000\s?F$/u.test(b2), b2);
await encaisse();
const pB = await pieceDe('rdv-cl-fb');
dit('la piece vaut 28 000 F, sans ligne de frais, un seul versement', !!pB && totalDe(pB) === 28000 && !pB.lines.some((l) => l.frais) && (pB.payments ?? []).length === 1,
  pB ? `${totalDe(pB)} · ${pB.lines.length} lignes · ${(pB.payments ?? []).length} versements` : 'aucune');

/* ── C. EN ESPÈCES, AUCUN FRAIS ── */
await cdp('Page.navigate', { url: 'about:blank' });
dit('le Carnet ouvre l encaissement de Gisele C.', await ouvreLEncaissement('Gis', '14:00'));
await tuile('Espèces');
dit('en especes : aucune case de frais', (await caseFrais()) === null);
const b3 = await bouton();
dit('... et le bouton dit 28 000 F', /^Encaisser 28\s?000\s?F$/u.test(b3), b3);

/* ── D. AU TÉLÉPHONE ── */
await tuile('Carte');
await auTerminal();
await cdp('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await attend(700);
const deborde = await evalue(`(() => { const l = ${modale}?.querySelector('[data-frais-de-carte]'); if (!l) return 'absente'; const r = l.getBoundingClientRect(); return r.right <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1 ? 'ok' : Math.round(r.right) + '/' + window.innerWidth; })()`);
dit('au telephone (360 px), la case tient dans l ecran', deborde === 'ok', deborde);
if (captures) {
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(captures, 'frais-carte-2-telephone.png'), Buffer.from(img.result.data, 'base64'));
}

/* ── E. LE TPE KKIAPAY : rien d'ajouté par la Maison, KkiaPay ajoute ses 2,3 % pour elle ── */
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: 'about:blank' });
dit('le Carnet ouvre l encaissement d Hortense D.', await ouvreLEncaissement('Hortense', '16:00'));
await tuile('Carte');
dit('la Carte propose le TPE KkiaPay, a pointer', (await choixDuMoyen()) === 'tpeKkiapay'
  && /Carte, par KkiaPay/.test(await evalue(`${modale}.querySelector('[data-choix-du-moyen]')?.textContent || ''`)), await choixDuMoyen());
dit('aucune case de frais de la Maison sous la part', (await caseFrais()) === null);
const kkia = await evalue(`(() => { const l = ${modale}?.querySelector('[data-frais-kkiapay]'); return l ? { frais: Number(l.dataset.fraisKkiapay), texte: l.textContent.replace(/\\s+/g, ' ').trim() } : null; })()`);
dit('la ligne dit le montant au TPE et ce que KkiaPay ajoute pour elle (2,3 % : 644 F)', !!kkia && kkia.frais === 644
  && /Au TPE KkiaPay : 28\s?000\s?F/u.test(kkia.texte) && /2,3\s?% pour elle : elle paiera 28\s?644\s?F/u.test(kkia.texte), JSON.stringify(kkia));
const b5 = await bouton();
dit('le bouton dit le rituel seul', /^Encaisser 28\s?000\s?F$/u.test(b5), b5);
await autorisation();
dit('rien ne bloque une fois la reference du recu notee', (await blocage()) === '', await blocage());
await encaisse();
const pE = await pieceDe('rdv-cl-hd');
const vE = (pE?.payments ?? []).map((v) => `${v.amountXof}|${v.method}|${v.cashbox ?? ''}`);
dit('une piece de 28 000 F, sans ligne de frais, un versement « Carte · KkiaPay » dans la caisse KkiaPay', !!pE && totalDe(pE) === 28000 && !pE.lines.some((l) => l.frais)
  && (pE.payments ?? []).length === 1 && pE.payments[0].method === 'Carte · KkiaPay' && pE.payments[0].cashbox === 'KkiaPay', JSON.stringify(vE));
dit('... avec la reference du recu sur le versement', pE?.payments?.[0]?.trace?.autorisation === 'AB12CD', JSON.stringify(pE?.payments?.[0]?.trace ?? null));

dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
console.log(ko === 0 ? `\n${n}/${n} epreuves : les frais de la carte, dans le vrai Trone.` : `\n${ko} echec(s) sur ${n}.`);
ws.close(); chrome.kill(); serveur.close();
process.exit(ko === 0 ? 0 : 1);
