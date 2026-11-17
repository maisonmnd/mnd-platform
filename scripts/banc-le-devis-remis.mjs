import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LE DEVIS SE REMET AU RENDEZ-VOUS, À L'ÉCRAN — `node scripts/banc-le-devis-remis.mjs [capture]`.

   17 novembre 2026 : « Il ne faut pas permettre d'avoir des bilans sans prendre
   de RDV » (Yéman). La règle est éprouvée par `verifie-le-devis-remis` ; ce
   banc ouvre le VRAI Trône (construit comme le banc hors ligne : connexion
   obligatoire, serveur injoignable, une session de la direction gardée), pose
   des devis d'exemple, et regarde, dans un vrai Chrome, Factures › Devis :
   · le registre dit « à remettre au rendez-vous », « à remettre », « périmé » ;
     une commande de la Boutique ne dit rien ;
   · un devis qui attend : sa raison, « Remettre le devis » et tous ses envois
     fermés, « Confirmer » et « Convertir en facture » aussi ; la direction
     passe outre avec un motif, qui reste écrit ;
   · le rendez-vous tenu : « Remettre le devis » le marque remis, dit jusqu'à
     quand il vaut, et rouvre « Confirmer » ;
   · périmé : il se renouvelle par l'éditeur, daté du jour ;
   · un devis par consultation : « Préparer le devis » rouvre celui qui existe,
     et l'estimé devient le ferme, la consultation déduite une seule fois ;
   · une facture garde tous ses boutons.
   Les clientes, les prestations et les montants sont des exemples. */

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-devis-remis-'));

/* UN SERVEUR QUI NE RÉPOND JAMAIS, plutôt qu'un serveur injoignable. Une porte
   refusée répond plus ou moins vite selon la machine, et la tête de la
   direction se lisait alors tantôt gardée, tantôt vide (« Passer outre » ne
   paraissait qu'une fois sur deux). Ici chaque appel à la base reste en
   suspens : la Maison tient sa tête gardée, comme un Trône sans réseau. */
const enSuspens = new Set();

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const serveur = createServer((req, res) => {
  if (/^\/(auth|rest|functions|storage|realtime)\//.test(new URL(req.url, 'http://x').pathname)) { enSuspens.add(res); return; }
  let f = path.join(construit, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const origine = `http://127.0.0.1:${serveur.address().port}`;
console.log('Construction du Trône (la base ne répond jamais)…');
execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: origine, VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
});
renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-devis-remis-chrome-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: 1360, height: 1000, deviceScaleFactor: 1, mobile: false });

let ko = 0; let n = 0;
const dit = (nom, ok, detail) => { n++; if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined && !ok ? ' -> ' + JSON.stringify(detail) : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};

const UID = 'u-banc-devis';
const CLE = 'sb-127-auth-token';
const hier = new Date(Date.now() - 86_400_000).toISOString();
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const jourPlus = (k) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + k); return isoDe(d); };
const AUJ = jourPlus(0);
const ligne = (label, unitXof) => ({ id: `l-${label}`, label, qty: 1, unitXof, discountPct: 0 });
const devis = (o) => ({ branchId: 'maison', kind: 'devis', date: AUJ, lines: [ligne('Rituel du banc', 100000)], globalDiscountPct: 0, theme: 'Aube', status: 'estimé', master: 'Team', ...o });
const semence = {
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
    user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: hier } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le: hier },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le: hier, tete: { user_id: UID, name: 'Direction', role: 'souverain', rubrics: [] } },
  'trone::mnd_catalog_services': [
    { id: 'sv-rituel', categoryId: '', name: 'Rituel du banc', palier: 'Fondation', priceXof: 100000, durationMin: 60, hidePrice: false, sessions: 1, order: 1 },
  ],
  'trone::mnd_clients': [
    { id: 'cl-neuve', branchId: 'maison', name: 'Neuve A.', phone: '0100000081', city: '', persona: '', since: AUJ, segments: [] },
    { id: 'cl-venue', branchId: 'maison', name: 'Venue B.', phone: '0100000082', city: '', persona: '', since: '2026-01-10', segments: [] },
    { id: 'cl-conso', branchId: 'maison', name: 'Conso C.', phone: '0100000083', city: '', persona: '', since: AUJ, segments: [] },
  ],
  'trone::mnd_appointments': [
    { id: 'v1', branchId: 'maison', clientId: 'cl-venue', serviceIds: ['sv-rituel'], date: jourPlus(-40), time: '10:00', status: 'honoré', master: 'Team', priceXof: 100000 },
    { id: 'v2', branchId: 'maison', clientId: 'cl-neuve', serviceIds: ['sv-rituel'], date: jourPlus(3), time: '10:00', status: 'confirmé', master: 'Team', priceXof: 100000 },
  ],
  'trone::mnd_consultations_queue': [
    { id: 'cg-banc', createdAt: new Date().toISOString(), parcours: 'sos', client: { name: 'Conso C.', phone: '0100000083', city: 'Cotonou', currency: 'XOF' }, answers: {}, paidXof: 15000, branchId: 'maison', status: 'nouvelle', modalite: 'auto',
      estimation: { lignes: [{ serviceId: 'sv-rituel', nom: 'Rituel du banc', min: 100000, max: 140000, retenue: true }], aConfirmer: [], min: 100000, max: 140000, aChiffrer: 0 } },
  ],
  'trone::mnd_invoices': [
    devis({ id: 'd-attend', number: 'MND-D-2026-9001', clientId: 'cl-neuve' }),
    devis({ id: 'd-pret', number: 'MND-D-2026-9002', clientId: 'cl-venue' }),
    devis({ id: 'd-vieux', number: 'MND-D-2026-9003', clientId: 'cl-venue', status: 'envoyée', date: jourPlus(-30), remisLe: new Date(Date.now() - 20 * 86_400_000).toISOString(), remisPar: 'Awa' }),
    devis({ id: 'd-cons', number: 'MND-D-2026-9004', clientId: 'cl-conso', consultationId: 'cg-banc' }),
    devis({ id: 'd-boutique', number: 'CMD-2026-9005', clientId: 'cl-neuve', status: 'envoyée', boutique: { origine: 'site', remise: 'retrait', etat: 'a-preparer', creeLe: new Date().toISOString() } }),
    { ...devis({ id: 'f-facture', number: 'MND-2026-9006', clientId: 'cl-neuve', status: 'envoyée' }), kind: 'facture' },
  ],
};

const rang = (numero) => `[...document.querySelectorAll('.trc-sheet__row')].find((r) => r.textContent.includes(${JSON.stringify(numero)}))`;
const pastilles = (numero) => evalue(`(() => { const r = ${rang(numero)}; return r ? [...r.querySelectorAll('.trv-status')].map((s) => s.textContent.trim()) : null; })()`);
const ouvre = async (numero) => {
  const deja = await evalue(`(() => { const r = ${rang(numero)}; return !!r && r.classList.contains('is-active'); })()`);
  if (!deja) await evalue(`(() => { const r = ${rang(numero)}; if (!r) return false; r.click(); return true; })()`);
  await attend(500);
};
const bouton = (texte) => evalue(`(() => {
  const b = [...document.querySelectorAll('.trv-doc-actions button, .trv-doc-actions a')].find((x) => x.textContent.trim().startsWith(${JSON.stringify(texte)}) && x.offsetParent !== null);
  return b ? { ferme: !!b.disabled, mot: b.getAttribute('title') || '' } : null;
})()`);
const clique = (texte, dans = '.trv-fac-grid') => evalue(`(() => {
  const b = [...document.querySelectorAll(${JSON.stringify(`${dans} button`)})].find((x) => x.textContent.trim().startsWith(${JSON.stringify(texte)}) && x.offsetParent !== null);
  if (!b || b.disabled) return false; b.click(); return true;
})()`);
const panneau = () => evalue(`document.querySelector('.trv-remise')?.innerText ?? ''`);
/* L'en-tête de l'éditeur (en capitales par la feuille de style : on lit le texte, pas l'affichage). */
const enTete = () => evalue(`[...document.querySelectorAll('.trv-sec-label--copper')].map((e) => e.textContent.trim()).join(' | ')`);
const editeurDe = () => evalue(`document.querySelector('.trv-sec-label--copper')?.parentElement?.textContent ?? ''`);
/* Les bandeaux passent en quelques secondes : un guetteur les note tous dès qu'ils paraissent. */
const guette = () => evalue(`(() => { if (window.__bandeaux) return true; window.__bandeaux = [];
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('mnd-toast')) window.__bandeaux.push(n.textContent.trim()); })
    .observe(document.body, { childList: true });
  return true; })()`);
const bandeaux = () => evalue(`window.__bandeaux ?? []`);
const piece = (pid) => evalue(`JSON.parse(localStorage.getItem('trone::mnd_invoices') || '[]').find((i) => i.id === ${JSON.stringify(pid)}) ?? null`);
const nbPieces = () => evalue(`JSON.parse(localStorage.getItem('trone::mnd_invoices') || '[]').length`);
const va = async (hash) => { await evalue(`location.hash = ${JSON.stringify(hash)}; true`); await attend(1200); };
/* Arriver aux Factures depuis l'accueil peut prendre quelques secondes sans réseau : on attend l'éditeur de la pièce. */
const vaJusquALEditeur = async (hash, numero) => {
  await va(hash);
  for (let i = 0; i < 30 && !(await editeurDe()).includes(numero); i++) await attend(500);
};

try {
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/factures?onglet=devis'; location.reload(); true`);
  /* La Maison s'éveille sans réseau : on attend le registre, une minute et demie au plus. */
  for (let i = 0; i < 90; i++) {
    await attend(1000);
    if ((await evalue(`document.querySelectorAll('.trc-sheet__row').length`)) >= 5) break;
  }
  await attend(800);
  await guette();

  /* ── 1. LE REGISTRE ── */
  dit('le registre des devis est ouvert', (await evalue(`document.querySelectorAll('.trc-sheet__row').length`)) >= 5, await evalue(`document.body.innerText.slice(0, 300)`));
  dit('un devis qui attend se voit au registre : « à remettre au rendez-vous »', JSON.stringify(await pastilles('MND-D-2026-9001')) === JSON.stringify(['à remettre au rendez-vous', 'estimé']), await pastilles('MND-D-2026-9001'));
  dit('le rendez-vous tenu : « à remettre »', JSON.stringify(await pastilles('MND-D-2026-9002')) === JSON.stringify(['à remettre', 'estimé']), await pastilles('MND-D-2026-9002'));
  dit('passé ses quinze jours : « périmé »', JSON.stringify(await pastilles('MND-D-2026-9003')) === JSON.stringify(['périmé', 'envoyée']), await pastilles('MND-D-2026-9003'));
  dit('une commande de la Boutique ne porte aucune pastille de remise', JSON.stringify(await pastilles('CMD-2026-9005')) === JSON.stringify(['envoyée']), await pastilles('CMD-2026-9005'));
  await photo('1-registre');

  /* ── 2. UN DEVIS QUI ATTEND ── */
  await ouvre('MND-D-2026-9001');
  const p1 = await panneau();
  dit('son panneau dit « à remettre au rendez-vous » et la raison', /À REMETTRE AU RENDEZ-VOUS/i.test(p1) && p1.includes('Elle n’a pas encore eu de rendez-vous honoré à la Maison.'), p1);
  const fermes = {};
  for (const b of ['Remettre le devis', 'Adresser par WhatsApp', 'Imprimer', 'PDF', 'Confirmer et créer le rendez-vous', 'Convertir en facture']) fermes[b] = await bouton(b);
  dit('« Remettre le devis » et tous ses envois sont fermés, « Confirmer » et « Convertir en facture » aussi', Object.values(fermes).every((b) => b && b.ferme === true), fermes);
  dit('chaque bouton fermé dit pourquoi', fermes['Adresser par WhatsApp']?.mot.startsWith('À remettre au rendez-vous.') && fermes.Imprimer?.mot.startsWith('À remettre au rendez-vous.')
    && fermes['Confirmer et créer le rendez-vous']?.mot.startsWith('Remettez d’abord le devis'), fermes);
  dit('la porte « App » de WhatsApp ne paraît pas', (await evalue(`!document.querySelector('.trv-doc-actions .trv-wa-btn--app')`)) === true);
  dit('rien n’est écrit sur la pièce', !(await piece('d-attend'))?.remisLe);
  await photo('2-attend');

  /* ── 3. LE RENDEZ-VOUS TENU : REMETTRE ── */
  await ouvre('MND-D-2026-9002');
  const p2 = await panneau();
  dit('une cliente déjà venue : « le rendez-vous est tenu », le devis peut être remis', /LE RENDEZ-VOUS EST TENU/i.test(p2), p2);
  dit('« Confirmer » attend encore la remise', (await bouton('Confirmer et créer le rendez-vous'))?.ferme === true);
  dit('« Remettre le devis » se touche', await clique('Remettre le devis'));
  await attend(600);
  const remis = await piece('d-pret');
  const p3 = await panneau();
  dit('la pièce est marquée remise, par qui', typeof remis?.remisLe === 'string' && remis.remisLe.slice(0, 10) >= jourPlus(-1) && remis.status === 'estimé', remis);
  dit('le panneau dit « devis remis » et jusqu’à quand il vaut', /DEVIS REMIS/i.test(p3) && p3.includes('Valable jusqu’au'), p3);
  dit('le document porte sa validité', await evalue(`document.querySelector('.trv-doc')?.innerText.includes('Valable jusqu’au')`));
  const ouverts = {};
  for (const b of ['Adresser par WhatsApp', 'Imprimer', 'PDF', 'Confirmer et créer le rendez-vous', 'Convertir en facture']) ouverts[b] = await bouton(b);
  dit('remis, ses envois, « Confirmer » et « Convertir en facture » sont ouverts', Object.values(ouverts).every((b) => b && b.ferme === false), ouverts);
  dit('sa pastille du registre s’efface', JSON.stringify(await pastilles('MND-D-2026-9002')) === JSON.stringify(['estimé']), await pastilles('MND-D-2026-9002'));
  await photo('3-remis');

  /* ── 4. PÉRIMÉ : RENOUVELER ── */
  await ouvre('MND-D-2026-9003');
  const p4 = await panneau();
  dit('périmé : le panneau le dit, il ne s’envoie plus et ne se confirme plus tel quel', /DEVIS PÉRIMÉ/i.test(p4) && p4.includes('ne se confirme plus tel quel')
    && (await bouton('Adresser par WhatsApp'))?.ferme === true && (await bouton('Confirmer et créer le rendez-vous'))?.ferme === true, p4);
  dit('« Renouveler le devis » ouvre l’éditeur', (await clique('Renouveler le devis')) && (await attend(600), (await enTete()).includes('Modifier le document')), await enTete());
  dit('… et l’enregistrer le fait repartir, daté du jour', await clique('Enregistrer les modifications'));
  await attend(700);
  const renouvele = await piece('d-vieux');
  dit('le devis renouvelé est daté d’aujourd’hui, remis d’aujourd’hui', renouvele?.date === AUJ && String(renouvele?.remisLe ?? '').slice(0, 10) >= jourPlus(-1), renouvele);
  dit('il n’est plus périmé, et se confirme', !/périmé/i.test(await panneau()) && (await bouton('Confirmer et créer le rendez-vous'))?.ferme === false, await panneau());

  /* ── 5. LA DIRECTION PASSE OUTRE ── */
  await ouvre('MND-D-2026-9001');
  dit('« Passer outre, avec un motif » paraît à la direction', await clique('Passer outre, avec un motif'));
  await attend(500);
  dit('la question se pose, et attend un motif', await evalue(`(() => { const d = document.querySelector('.mnd-dem'); const b = d?.querySelector('.mnd-dem__b--fait'); return !!d && !!b && b.disabled === true; })()`));
  await evalue(`(() => {
    const el = document.querySelector('.mnd-dem__champ input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 'Cliente de longue date, vue en octobre');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await attend(200);
  await evalue(`document.querySelector('.mnd-dem__b--fait')?.click(); true`);
  await attend(700);
  const outre = await piece('d-attend');
  dit('le devis est remis, et le motif reste écrit sur la pièce', !!outre?.remisLe && outre?.remisHorsRegle === 'Cliente de longue date, vue en octobre', outre);
  dit('le panneau le dit : hors règle, par la direction', (await panneau()).includes('Hors règle, par la direction : Cliente de longue date, vue en octobre'), await panneau());

  /* ── 6. UN DEVIS PAR CONSULTATION ── */
  const avant = await nbPieces();
  /* Comme depuis Consultations : l'écran des Factures se monte à neuf à chaque arrivée. */
  await va('#/');
  await vaJusquALEditeur('#/factures?nouveau=devis&consultation=cg-banc', 'MND-D-2026-9004');
  dit('« Préparer le devis estimé » rouvre le devis de la consultation, pas un second', (await editeurDe()).includes('Modifier le document') && (await editeurDe()).includes('MND-D-2026-9004'), await editeurDe());
  dit('… et le dit', (await bandeaux()).some((t) => t.includes('a déjà son devis MND-D-2026-9004')), await bandeaux());
  dit('l’éditeur dit que ce devis attend son rendez-vous', await evalue(`[...document.querySelectorAll('.trv-pdf-hint')].some((h) => h.innerText.includes('À remettre au rendez-vous. La consultation privée n’est pas encore faite.'))`),
    await evalue(`[...document.querySelectorAll('.trv-pdf-hint')].map((h) => h.innerText)`));
  await clique('Annuler');
  await va('#/');
  await vaJusquALEditeur('#/factures?nouveau=devis&consultation=cg-banc&ferme=1', 'MND-D-2026-9004');
  dit('« Préparer le devis ferme » rouvre le même devis', (await editeurDe()).includes('Modifier le document') && (await editeurDe()).includes('MND-D-2026-9004'), await editeurDe());
  dit('… l’enregistrer en fait le devis ferme', await clique('Enregistrer les modifications'));
  await attend(700);
  const fermeDevis = await piece('d-cons');
  dit('l’estimé est devenu le ferme : à valider par elle, la consultation déduite une fois', fermeDevis?.status === 'à valider' && fermeDevis?.aValiderPar === 'cliente'
    && fermeDevis?.globalDiscountXof === 15000 && fermeDevis?.discountLabel === 'Consultation privée, déduite', fermeDevis);
  await va('#/');
  await vaJusquALEditeur('#/factures?nouveau=devis&consultation=cg-banc&ferme=1', 'MND-D-2026-9004');
  await clique('Enregistrer les modifications');
  await attend(700);
  dit('une seconde fois, rien ne se redéduit', (await piece('d-cons'))?.globalDiscountXof === 15000, await piece('d-cons'));
  dit('aucun devis de plus au registre', (await nbPieces()) === avant, [avant, await nbPieces()]);
  await photo('6-une-consultation');

  /* ── 7. UNE FACTURE GARDE SES BOUTONS ── */
  await va('#/factures?id=f-facture');
  await attend(600);
  dit('une facture n’a pas de panneau de remise, et garde ses envois', (await panneau()) === '' && (await bouton('Adresser par WhatsApp'))?.ferme === false && (await bouton('Imprimer'))?.ferme === false, [await panneau(), await bouton('Imprimer')]);

  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.join(' | '));
} finally {
  ws.close();
  chrome.kill();
  for (const r of enSuspens) { try { r.destroy(); } catch { /* déjà fermé */ } }
  serveur.closeAllConnections?.();
  serveur.close();
  await attend(400);
  rmSync(construit, { recursive: true, force: true });
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore son profil */ }
}
console.log(ko ? `\n${ko} échec(s) sur ${n}.` : `\nLe devis se remet au rendez-vous, à l’écran (${n} vérifications).`);
process.exit(ko ? 1 : 0);
