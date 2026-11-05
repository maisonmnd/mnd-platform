/* LE BANC DE LA CAISSE DU JOUR — `node scripts/banc-la-caisse-du-jour.mjs <dossier construit ABSOLU> [préfixe de capture]`.

   5 novembre 2026, maquette « La caisse du jour » validée (« Validé,
   construis »). Le harnais `verifie-la-caisse-du-jour` éprouve la règle ;
   ce banc ouvre le VRAI Trône, hors ligne, sur le mercredi 4 novembre 2026
   rejoué en DONNÉES DE BANC (pièces et clientes inventées, initiales
   seulement) : Real Money 77 000 F au matin, sept versements pour
   218 000 F, 7 000 F de pourboires, 302 000 F disponibles ; MoMoPay
   140 000 F, KkiaPay 60 600 F. Il fait les gestes d'une main :

     - les six chiffres et le tableau disent ces chiffres-là ; le comptoir qui
       a un solde est coché, le reste non, les banques repliées ;
     - décocher, recocher : le total bouge, et ne somme que les cochées ;
     - saisir un compté : l'écart se calcule ; le bouton reste éteint tant
       qu'une caisse cochée n'est pas comptée, puis tant qu'un écart n'a pas
       son motif ;
     - une caisse à code ne dit rien ; le détail ouvre la facture ;
     - « Jour par jour » de Finances › Les caisses dit le même matin, les
       mêmes entrées et sorties, et un soir plus bas des seuls pourboires ;
     - rien ne déborde à 400 px : le tableau glisse dans sa boîte ;
     - « Clôturer les caisses cochées » écrit trois clôtures, et les caisses
       se montrent closes.

   Il attend le Trône construit sans serveur (SOUS BASH) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "<chemin absolu>" --emptyOutDir
   `préfixe` (facultatif) : chaque capture donne <préfixe>-<étape>.png.

   `--direction` : en plus, LA REMISE DES POURBOIRES, geste de la direction
   (la paie ne fait sortir aucune espèce : sans geste, les pourboires
   resteraient pour toujours dans le disponible). Le banc construit alors un
   second Trône, serveur injoignable, session et tête de la direction gardées
   (comme `banc-la-caisse-au-jour`), et éprouve : le 5 novembre, les
   pourboires du 4 sont au matin et à remettre ; « Remettre les pourboires »
   écrit une sortie hors activité, jamais une dépense ; le disponible tombe ;
   le 4 garde ses pourboires dans son disponible. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const direction = process.argv.includes('--direction');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const construit = args[0] || path.join(tmpdir(), 'banc-trone-cdj');
const capture = args[1] || '';
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
const paquet = readFileSync(path.join(construit, 'trone.html'), 'utf8');
if (/supabase\.co/.test(paquet)) { console.error('Ce Trône lit un serveur : construisez-le sous bash, VITE_SUPABASE_URL= vide.'); process.exit(2); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const sers = async (dossier) => {
  const s = createServer((req, res) => {
    let f = path.join(dossier, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!f.startsWith(path.resolve(dossier)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return s;
};
const serveur = await sers(construit);
const port = serveur.address().port;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-cdj-'));
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
let vueCourante = { w: 1280, h: 1000 };
const largeur = async (w, h = 1000) => { vueCourante = { w, h }; await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 }); await attend(900); };
await largeur(1280);

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
/* La section entière, au pixel près, même ce qui dépasse l'écran. */
/* Le Trône glisse dans sa propre boîte : la fenêtre se fait aussi haute que
   la section, le temps de la prendre, puis revient. */
const photo = async (etape) => {
  if (!capture) return '';
  const haut = await evalue(`(() => { const s = document.querySelector('[data-journal="caisse-du-jour"]'); if (!s) return 0; s.scrollIntoView(); const b = s.getBoundingClientRect(); return Math.ceil(b.height + 80); })()`);
  if (!haut) return '';
  await cdp('Emulation.setDeviceMetricsOverride', { width: vueCourante.w, height: Math.max(vueCourante.h, haut), deviceScaleFactor: 1, mobile: vueCourante.w < 600 });
  await attend(900);
  const r = await evalue(`(() => { const s = document.querySelector('[data-journal="caisse-du-jour"]'); s.scrollIntoView(); const b = s.getBoundingClientRect(); const x = Math.max(0, b.left - 8); return { x, y: Math.max(0, b.top - 8), w: Math.min(innerWidth - x, b.width + 16), h: b.height + 16 }; })()`);
  const img = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } });
  const f = `${capture}-${etape}.png`;
  writeFileSync(f, Buffer.from(img.result.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: vueCourante.w, height: vueCourante.h, deviceScaleFactor: 1, mobile: vueCourante.w < 600 });
  await attend(600);
  return f;
};
/* React lit la valeur par son descripteur natif : on la pose comme une frappe. */
const tape = (sel, valeur) => evalue(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${JSON.stringify(valeur)});
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const clique = (sel) => evalue(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b) b.click(); return !!b; })()`);
/* Un montant lu : ses chiffres, avec son signe (« − » ou « + »). */
const montant = (sel, premier = false) => evalue(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); const t = (${premier} ? e?.childNodes[0]?.textContent : e?.textContent) ?? ''; const d = t.replace(/\\D/g, ''); if (!d) return null; return (/[−-]\\s*\\d/.test(t) ? -1 : 1) * Number(d); })()`);
/* Le montant d'une case : son premier nœud (la case des pourboires dit aussi ce qui reste à remettre). */
const cel = (nom, col) => montant(`[data-journal="caisse-du-jour"] tr[data-caisse="${nom}"] td[data-col="${col}"]`, true);
const tot = (col) => montant(`[data-journal="caisse-du-jour"] tr[data-cdj="total"] td[data-col="${col}"]`);
const kpi = (k) => montant(`[data-journal="caisse-du-jour"] [data-kpi="${k}"] .v`);
const kpiC = (k) => evalue(`document.querySelector('[data-journal="caisse-du-jour"] [data-kpi="${k}"] .c')?.textContent ?? ''`);
const coche = (nom) => evalue(`document.querySelector('[data-journal="caisse-du-jour"] input[data-coche="${nom}"]')?.checked ?? null`);
const bouton = () => evalue(`(() => { const b = document.querySelector('[data-cdj="cloturer"]'); return b ? (b.disabled ? 'eteint' : 'allume') : 'absent'; })()`);
const pourquoi = () => evalue(`document.querySelector('[data-journal="caisse-du-jour"] .cdj-pourquoi')?.textContent ?? ''`);
const etat = () => evalue(`document.querySelector('[data-cdj="etat"]')?.textContent ?? ''`);

/* ── LE 4 NOVEMBRE 2026, EN DONNÉES DE BANC ── */
const J = '2026-11-04';
const VEILLE = '2026-11-03';
const RM = 'Real Money';
const MOMO = 'MoMoPay Maison MND';
const KKIA = 'KkiaPay';
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html` });
await attend(4000);
const B = (await evalue(`(() => { try { return (JSON.parse(localStorage.getItem('trone::mnd_branches') || '[]')[0] || {}).id || 'maison'; } catch { return 'maison'; } })()`)) || 'maison';
const cb = (cid, name, x = {}) => ({ id: cid, branchId: B, name, sub: 'Caisse', glyph: '◈', openingXof: 0, ...x });
const piece = (n, date, heure, xof, x = {}) => ({
  id: `inv-cdj-${n}`, branchId: B, kind: 'facture', number: `F-BANC-${n}`, clientId: '', clientName: `C. ${n}.`, date, time: heure,
  lines: [{ id: `l-${n}`, label: 'Rituel', qty: 1, unitXof: xof, discountPct: 0 }], globalDiscountPct: 0, theme: 'Rose', status: 'payée',
  payment: 'Espèces', cashbox: RM, payments: [{ id: `p-${n}`, date, time: heure, amountXof: xof, method: 'Espèces', cashbox: RM }], ...x,
});
const SEMENCE = {
  'trone::mnd_cashboxes': [
    cb('ytb0sweqjt', RM, { sub: 'Espèces du comptoir', role: 'terrasse' }),
    cb('cb-momopay-banc', MOMO, { sub: 'MTN MoMoPay', role: 'terrasse', openingXof: 140000 }),
    cb(`cb-kkiapay-${B}`, KKIA, { sub: 'Paiements en ligne', role: 'terrasse', openingXof: 60600 }),
    cb(`cb-carte-${B}`, 'Carte', { sub: 'Carte bancaire', role: 'banque' }),
    cb(`cb-cheques-${B}`, 'Chèques à déposer', { sub: 'Chèques', role: 'banque' }),
    cb('cb-mndpay-banc', 'MND PAY', { sub: 'FedaPay' }),
    cb('cb-banque-banc', 'Banque du banc', { sub: 'Compte', role: 'banque', openingXof: 500000 }),
    cb('cb-code-banc', 'Caisse à code du banc', { sub: 'Discrète', openingXof: 1000, codeHash: 'banc' }),
  ],
  'trone::mnd_invoices': [
    piece('00', VEILLE, '18:00', 77000),
    piece('01', J, '07:51', 7000),
    piece('02', J, '21:48', 20000),
    piece('03', J, '21:48', 20000),
    piece('04', J, '21:49', 35000),
    piece('05', J, '21:50', 52000, { tipXof: 4000 }),
    piece('06', J, '21:54', 37000),
    piece('07', J, '22:30', 47000, { tipXof: 3000 }),
  ],
  'trone::mnd_expenses': [],
  'trone::mnd_clotures_caisse': [],
  'trone::mnd_entrees_hors_activite': [],
  'trone::mnd_transferts_caisse': [],
  'trone::mnd_appointments': [],
};
await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); location.hash = '#/la-journee'; location.reload(); return true; })()`);
await jusqua(`!!document.querySelector('[data-journal="caisse-du-jour"] [data-kpi="disponible"]')`, 25000);
dit('« La caisse du jour » s ouvre en bas de La journée', !!(await evalue(`!!document.querySelector('[data-journal="caisse-du-jour"] .cdj-kpis')`)));
/* Le jour du banc : le 4 novembre 2026, tapé dans le champ du jour. */
await tape('[data-journal="caisse-du-jour"] input[aria-label="Le jour du journal"]', '04/11/2026');
await jusqua(`/4 novembre 2026/.test(document.querySelector('.cdj-titre')?.textContent ?? '')`, 8000);
dit('le jour se choisit : mercredi 4 novembre 2026', /Mercredi 4 novembre 2026/.test((await evalue(`document.querySelector('.cdj-titre')?.textContent ?? ''`)) ?? ''), await evalue(`document.querySelector('.cdj-titre')?.textContent ?? ''`));
await attend(800);

/* 1. Les chiffres du 4 novembre. */
dit('Real Money : matin 77 000, versements 218 000, pourboires 7 000, sorties 0, disponible 302 000',
  JSON.stringify([await cel(RM, 'matin'), await cel(RM, 'versements'), await cel(RM, 'pourboires'), await cel(RM, 'sorties'), await cel(RM, 'disponible')]) === JSON.stringify([77000, 218000, 7000, 0, 302000]),
  JSON.stringify([await cel(RM, 'matin'), await cel(RM, 'versements'), await cel(RM, 'pourboires'), await cel(RM, 'sorties'), await cel(RM, 'disponible')]));
dit('MoMoPay 140 000 F, KkiaPay 60 600 F au livre', (await cel(MOMO, 'disponible')) === 140000 && (await cel(KKIA, 'disponible')) === 60600, `${await cel(MOMO, 'disponible')} / ${await cel(KKIA, 'disponible')}`);
const coches = { rm: await coche(RM), momo: await coche(MOMO), kkia: await coche(KKIA), carte: await coche('Carte'), cheques: await coche('Chèques à déposer'), mnd: await coche('MND PAY') };
dit('cochées au départ : Real Money, MoMoPay, KkiaPay ; Carte, Chèques, MND PAY non (ni solde ni mouvement)',
  JSON.stringify(coches) === JSON.stringify({ rm: true, momo: true, kkia: true, carte: false, cheques: false, mnd: false }), JSON.stringify(coches));
dit('les banques et autres sont repliées', !(await evalue(`!!document.querySelector('[data-journal="caisse-du-jour"] tr[data-caisse="Banque du banc"]')`)));
const bandeau = async () => ({ n: await kpi('n'), matin: await kpi('matin'), entrees: await kpi('entrees'), sorties: await kpi('sorties'), dispo: await kpi('disponible') });
const b1 = await bandeau();
dit('le bandeau : 3 caisses, 277 600 au matin, 225 000 d entrées, 0 de sorties, 502 600 disponibles',
  JSON.stringify(b1) === JSON.stringify({ n: 3, matin: 277600, entrees: 225000, sorties: 0, dispo: 502600 }), JSON.stringify(b1));
dit('... les entrées disent « 218 000 F + 7 000 F pourboires »', /218[\s\u202f\u00a0]000[\s\u202f\u00a0]F \+ 7[\s\u202f\u00a0]000[\s\u202f\u00a0]F pourboires/.test(await kpiC('entrees') ?? ''), await kpiC('entrees'));
dit('le total coché : 502 600 F', (await tot('disponible')) === 502600, String(await tot('disponible')));
dit('l état : « Non clôturée · 0 / 3 comptée »', /Non clôturée · 0 \/ 3/.test(await etat() ?? ''), await etat());
const journee = await evalue(`document.querySelector('[data-lj="verdict"]')?.innerText ?? ''`);
dit('la journée du 4, sans rendez-vous à clore, est close', /La journée est close/.test(journee ?? ''), journee);
dit('le bouton reste éteint : rien n est compté', (await bouton()) === 'eteint' && /Reste à compter : Real Money, MoMoPay Maison MND, KkiaPay\./.test(await pourquoi() ?? ''), `${await bouton()} / ${await pourquoi()}`);
const large = await evalue(`(() => { const b = document.querySelector('[data-journal="caisse-du-jour"] .cdj-defile'); return { contenu: b.scrollWidth, boite: b.clientWidth, page: document.documentElement.scrollWidth, vue: innerWidth }; })()`);
dit('à 1280 px : le tableau des caisses tient dans sa boîte, la page ne glisse pas', !!large && large.contenu <= large.boite && large.page <= large.vue, JSON.stringify(large));
const largeur1280 = await photo('1280-avant');

/* 2. Décocher, recocher. */
await clique(`[data-journal="caisse-du-jour"] input[data-coche="${MOMO}"]`);
await attend(400);
dit('MoMoPay décochée : 2 caisses, 362 600 F, la ligne s éteint', (await kpi('n')) === 2 && (await tot('disponible')) === 362600 && (await kpi('disponible')) === 362600
  && !!(await evalue(`document.querySelector('[data-journal="caisse-du-jour"] tr[data-caisse="${MOMO}"]')?.classList.contains('est-off')`)), `${await kpi('n')} / ${await tot('disponible')}`);
dit('... le bouton ne demande plus que Real Money et KkiaPay', /Reste à compter : Real Money, KkiaPay\./.test(await pourquoi() ?? ''), await pourquoi());
await clique(`[data-journal="caisse-du-jour"] input[data-coche="${MOMO}"]`);
await attend(400);
dit('recochée : 502 600 F', (await tot('disponible')) === 502600 && (await kpi('n')) === 3, String(await tot('disponible')));

/* 3. Les autres caisses, repliées puis cochées. */
dit('« Voir » ouvre les banques et autres', await clique('[data-cdj="autres"]'));
await attend(400);
dit('... la banque paraît, non cochée, avec son solde au livre', (await coche('Banque du banc')) === false && (await cel('Banque du banc', 'disponible')) === 500000, `${await coche('Banque du banc')} / ${await cel('Banque du banc', 'disponible')}`);
const codeVu = await evalue(`(() => { const r = document.querySelector('[data-journal="caisse-du-jour"] tr[data-caisse="Caisse à code du banc"]'); return r ? { coche: r.querySelector('input[type=checkbox]').disabled, texte: r.innerText } : null; })()`);
dit('... la caisse à code ne se coche pas et ne dit aucun montant', !!codeVu && codeVu.coche === true && /•••/.test(codeVu.texte) && !/1[\s\u202f\u00a0]000/.test(codeVu.texte), JSON.stringify(codeVu));
await clique('[data-journal="caisse-du-jour"] input[data-coche="Banque du banc"]');
await attend(400);
dit('la banque cochée : 4 caisses, 1 002 600 F, et elle reste à compter', (await tot('disponible')) === 1002600 && (await kpi('n')) === 4 && /Banque du banc/.test(await pourquoi() ?? ''), `${await tot('disponible')} / ${await pourquoi()}`);
await clique('[data-journal="caisse-du-jour"] input[data-coche="Banque du banc"]');
await clique('[data-cdj="autres"]');
await attend(400);
dit('décochée et repliée : 502 600 F', (await tot('disponible')) === 502600 && !(await evalue(`!!document.querySelector('[data-journal="caisse-du-jour"] tr[data-caisse="Banque du banc"]')`)));

/* 4. Compter. */
await tape(`[data-journal="caisse-du-jour"] input[data-compte="${RM}"]`, '302 000');
await attend(400);
dit('Real Money compté 302 000 F : écart 0 F, juste', (await cel(RM, 'ecart')) === 0 && !!(await evalue(`document.querySelector('[data-journal="caisse-du-jour"] tr[data-caisse="${RM}"] td[data-col="ecart"]')?.classList.contains('est-juste')`)), String(await cel(RM, 'ecart')));
dit('... le bandeau : 302 000 F comptés, 1 / 3', (await kpi('compte')) === 302000 && /1 \/ 3/.test(await kpiC('compte') ?? ''), `${await kpi('compte')} / ${await kpiC('compte')}`);
dit('... le bouton reste éteint tant que MoMoPay et KkiaPay ne sont pas comptées', (await bouton()) === 'eteint' && /Reste à compter : MoMoPay Maison MND, KkiaPay\./.test(await pourquoi() ?? ''), await pourquoi());
await tape(`[data-journal="caisse-du-jour"] input[data-compte="${MOMO}"]`, '140000');
await tape(`[data-journal="caisse-du-jour"] input[data-compte="${KKIA}"]`, '60 000');
await attend(400);
dit('KkiaPay compté 60 000 F : écart −600 F', (await cel(KKIA, 'ecart')) === -600 && !!(await evalue(`document.querySelector('[data-journal="caisse-du-jour"] tr[data-caisse="${KKIA}"] td[data-col="ecart"]')?.classList.contains('est-ecart')`)), String(await cel(KKIA, 'ecart')));
dit('... le total : 502 000 F comptés, écart −600 F', (await tot('compte')) === 502000 && (await tot('ecart')) === -600, `${await tot('compte')} / ${await tot('ecart')}`);
dit('... l écart demande un motif : la ligne du motif paraît, le bouton reste éteint',
  !!(await evalue(`!!document.querySelector('[data-journal="caisse-du-jour"] input[data-motif="${KKIA}"]')`)) && (await bouton()) === 'eteint' && /Motif de l’écart : KkiaPay\./.test(await pourquoi() ?? ''), await pourquoi());
await tape(`[data-journal="caisse-du-jour"] input[data-motif="${KKIA}"]`, 'Frais KkiaPay du jour');
await attend(400);
dit('le motif écrit : le bouton s allume', (await bouton()) === 'allume', await bouton());
dit('... le pied dit 3 caisses, 502 600 disponibles, 502 000 comptés', /3 caisses · disponible 502[\s\u202f\u00a0]600[\s\u202f\u00a0]F · compté 502[\s\u202f\u00a0]000[\s\u202f\u00a0]F · écart −600[\s\u202f\u00a0]F/.test(await evalue(`document.querySelector('.cdj-pied__dit')?.textContent ?? ''`) ?? ''),
  await evalue(`document.querySelector('.cdj-pied__dit')?.textContent ?? ''`));
const largeur1280b = await photo('1280-compte');

/* 5. Le détail de Real Money. */
const detail = await evalue(`(() => { const d = document.querySelector('[data-cdj="detail"]'); if (!d) return null; return { titre: d.querySelector('h4')?.textContent, lignes: d.querySelectorAll('tr[data-entree]').length, total: [...d.querySelectorAll('tfoot td')].map((c) => c.textContent.replace(/\\D/g, '')) }; })()`);
dit('le détail de Real Money : sept entrées, 218 000 + 7 000 = 225 000', !!detail && /Real Money/.test(detail.titre) && detail.lignes === 7 && JSON.stringify(detail.total.slice(-3)) === JSON.stringify(['218000', '7000', '225000']), JSON.stringify(detail));
const pont = await evalue(`[...document.querySelectorAll('[data-cdj="pont"] .cdj-ligne:not(.cdj-ligne--dont) b')].map((b) => b.textContent.replace(/\\D/g, ''))`);
dit('... le pont : 77 000 + 218 000 + 7 000 − 0 = 302 000', JSON.stringify(pont) === JSON.stringify(['77000', '218000', '7000', '0', '302000']), JSON.stringify(pont));
dit('... dont pourboires à remettre : 7 000 F, au pont, sur la ligne et au bandeau',
  (await montant('[data-cdj="a-remettre"] b')) === 7000 && /à remettre 7[\s  ]000/.test(await evalue(`document.querySelector('[data-a-remettre="${RM}"]')?.textContent ?? ''`) ?? '')
  && /dont pourboires à remettre : 7[\s  ]000[\s  ]F/.test(await kpiC('disponible') ?? ''), await kpiC('disponible'));
dit('... « Remettre les pourboires » est à la direction : le comptoir ne le voit pas', !(await evalue(`!!document.querySelector('[data-remettre]')`)));
dit('... aucune sortie, dite', /Aucune sortie ce jour-là/.test(await evalue(`document.querySelector('[data-cdj="sorties"]')?.innerText ?? ''`) ?? ''));
dit('aucun tiret « — » dans la caisse du jour', !/—/.test(await evalue(`document.querySelector('[data-journal="caisse-du-jour"]')?.innerText ?? '—'`) ?? '—'));
dit('pas de billetage', !/billet/i.test(await evalue(`document.querySelector('[data-journal="caisse-du-jour"]')?.innerText ?? ''`) ?? ''));

/* 5 bis. Tous les montants de la caisse (5 novembre 2026, « quand je clique sur une caisse, je veux voir tous les montants »). */
const livre = () => evalue(`(() => {
  const l = document.querySelector('[data-cdj="livre"]'); if (!l) return null;
  const n = (t) => Number((t ?? '').replace(/[^\\d]/g, ''));
  return {
    de: l.dataset.livreDe,
    jours: [...l.querySelectorAll('tr[data-livre-jour]')].map((r) => [r.dataset.livreJour, r.getAttribute('aria-expanded'), n(r.cells[4].textContent)]),
    montants: [...l.querySelectorAll('tr[data-montant]')].map((r) => r.dataset.montant),
    matin: [...l.querySelectorAll('tr[data-livre-matin]')].map((r) => [r.dataset.livreMatin, n(r.cells[1].textContent)]),
    depart: n(l.querySelector('[data-cdj="depart"] td:last-child')?.textContent), departDit: l.querySelector('[data-cdj="depart"] td')?.textContent ?? '',
    total: n(l.querySelector('[data-cdj="livre-total"] td:last-child')?.textContent),
    vu: l.getBoundingClientRect().top < innerHeight && l.getBoundingClientRect().bottom > 0,
  };
})()`);
const lr = await livre();
dit('le livre de Real Money : le 4 ouvert (302 000 F au soir), le 3 replié (77 000 F), parti de 0 F, 302 000 F disponibles',
  !!lr && lr.de === RM && JSON.stringify(lr.jours) === JSON.stringify([[J, 'true', 302000], [VEILLE, 'false', 77000]])
    && lr.depart === 0 && /Ouverture de la caisse|Début des comptes/.test(lr.departDit) && lr.total === 302000, JSON.stringify(lr));
dit('... le 4, montant par montant, le plus récent en haut : chaque pourboire au-dessus de son versement ; au matin 77 000 F',
  !!lr && JSON.stringify(lr.montants) === JSON.stringify(['pourboire', 'versement', 'versement', 'pourboire', 'versement', 'versement', 'versement', 'versement', 'versement'])
    && JSON.stringify(lr.matin) === JSON.stringify([[J, 77000]]), JSON.stringify(lr && { m: lr.montants, matin: lr.matin }));
await evalue(`document.querySelector('[data-cdj="livre"] tr[data-livre-jour="${VEILLE}"]')?.click()`);
await attend(300);
const lr3 = await livre();
dit('... un clic déplie le 3 : son versement de 77 000 F, son matin à 0 F', !!lr3 && lr3.montants.length === 10 && JSON.stringify(lr3.matin) === JSON.stringify([[J, 77000], [VEILLE, 0]]), JSON.stringify(lr3));
const largeurLivre = await photo('1280-livre');
await evalue(`document.querySelector('[data-journal="caisse-du-jour"] tr[data-caisse="${KKIA}"] td[data-col="matin"]')?.click()`);
await attend(900);
const lk = await livre();
dit('un clic sur la ligne de KkiaPay ouvre ses montants : 60 600 F depuis l ouverture, rien le 4, 60 600 F ce soir, et y mène',
  !!lk && lk.de === KKIA && lk.depart === 60600 && JSON.stringify(lk.jours) === JSON.stringify([[J, 'true', 60600]]) && lk.montants.length === 0 && lk.total === 60600 && lk.vu, JSON.stringify(lk));
await evalue(`document.querySelector('[data-journal="caisse-du-jour"] input[data-compte="${MOMO}"]')?.click()`);
await attend(300);
dit('... un clic dans un champ de la ligne MoMoPay ne change pas de caisse', (await livre())?.de === KKIA, (await livre())?.de);
await evalue(`document.querySelector('[data-journal="caisse-du-jour"] button[data-voir="${RM}"]')?.click()`);
await attend(600);
dit('... le nom de Real Money y ramène', (await livre())?.de === RM, (await livre())?.de);

/* 6. À 400 px, rien ne déborde. */
await largeur(400, 900);
const mesure = await evalue(`(() => {
  const s = document.querySelector('[data-journal="caisse-du-jour"]');
  const boite = s.querySelector('.cdj-defile');
  const k = getComputedStyle(s.querySelector('.cdj-kpis')).gridTemplateColumns.split(' ').length;
  const hors = [...s.querySelectorAll('*')].filter((e) => !e.closest('.cdj-defile') && e.getBoundingClientRect().right > innerWidth + 1).map((e) => e.className || e.tagName).slice(0, 4);
  return { page: document.documentElement.scrollWidth, vue: innerWidth, boite: boite.scrollWidth > boite.clientWidth, colonnes: k, hors };
})()`);
dit('à 400 px : la page ne glisse pas, le tableau glisse dans sa boîte, le bandeau en 2 colonnes',
  !!mesure && mesure.page <= mesure.vue && mesure.boite && mesure.colonnes === 2 && mesure.hors.length === 0, JSON.stringify(mesure));
const etroit = await photo('400');
await largeur(1280);

/* 7. Le même chiffre que « Jour par jour ». */
const ici = { matin: await cel(RM, 'matin'), versements: await cel(RM, 'versements'), autres: 0, sorties: await cel(RM, 'sorties'), dispo: await cel(RM, 'disponible'), pourboires: await cel(RM, 'pourboires') };
const AUJ = new Date();
if (AUJ.getFullYear() !== 2026 || AUJ.getMonth() !== 10) {
  console.log('(hors de novembre 2026 : le relevé du mois ne montre pas le 4 novembre, la comparaison au « Jour par jour » se fait dans le harnais)');
} else {
  await evalue(`location.hash = '#/caisses'; true`);
  const carte = `[...document.querySelectorAll('.trf-caisse')].find((c) => c.querySelector('.trf-caisse__name')?.textContent.trim() === ${JSON.stringify(RM)})`;
  await jusqua(`!!(${carte})?.querySelector('.trf-caisse__open')`, 15000);
  await evalue(`(${carte})?.querySelector('.trf-caisse__open')?.click()`);
  await jusqua(`!!document.querySelector('[role="dialog"] .trf-pret-puce')`, 6000);
  await evalue(`[...document.querySelectorAll('[role="dialog"] .trf-pret-puce')].find((b) => b.textContent.trim() === 'Jour par jour')?.click()`);
  await jusqua(`!!document.querySelector('[role="dialog"] .cjj-table')`, 6000);
  const jpj = await evalue(`(() => { const r = [...document.querySelectorAll('[role="dialog"] .cjj-table tbody tr')].find((x) => /4 nov/.test(x.cells[0]?.textContent ?? '')); return r ? [...r.cells].slice(1, 5).map((c) => Number(c.textContent.split('dont')[0].replace(/\\D/g, ''))) : null; })()`);
  dit('« Jour par jour » du 4 novembre : matin 77 000, entrées 218 000, sorties 0, soir 295 000', JSON.stringify(jpj) === JSON.stringify([77000, 218000, 0, 295000]), JSON.stringify(jpj));
  dit('... la caisse du jour dit le même matin, les mêmes entrées et sorties, et le soir plus les seuls pourboires',
    !!jpj && ici.matin === jpj[0] && ici.versements + ici.autres === jpj[1] && ici.sorties === jpj[2] && ici.dispo - ici.pourboires === jpj[3], JSON.stringify({ ici, jpj }));
  await evalue(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await attend(500);
  await evalue(`location.hash = '#/la-journee'; true`);
  await jusqua(`!!document.querySelector('[data-journal="caisse-du-jour"] [data-kpi="disponible"]')`, 15000);
  await tape('[data-journal="caisse-du-jour"] input[aria-label="Le jour du journal"]', '04/11/2026');
  await jusqua(`/4 novembre 2026/.test(document.querySelector('.cdj-titre')?.textContent ?? '')`, 8000);
  await attend(600);
  /* L'état de la vue repart du jour : on recompte. */
  await tape(`[data-journal="caisse-du-jour"] input[data-compte="${RM}"]`, '302 000');
  await tape(`[data-journal="caisse-du-jour"] input[data-compte="${MOMO}"]`, '140000');
  await tape(`[data-journal="caisse-du-jour"] input[data-compte="${KKIA}"]`, '60 000');
  await attend(300);
  await tape(`[data-journal="caisse-du-jour"] input[data-motif="${KKIA}"]`, 'Frais KkiaPay du jour');
  await attend(300);
}

/* 8. Clôturer. */
dit('« Clôturer les caisses cochées » se touche', (await bouton()) === 'allume' && await clique('[data-cdj="cloturer"]'));
await attend(1200);
const ecrites = ((await evalue(`JSON.parse(localStorage.getItem('trone::mnd_clotures_caisse') || '[]')`)) ?? []).map((c) => [c.cashbox, c.date, c.attenduXof, c.compteXof, c.ecartXof, c.note ?? null, c.laisseXof, c.livreXof, c.verseAuCoffreXof]);
dit('trois clôtures écrites : attendu = disponible, compté, écart, motif de KkiaPay, livre du soir, rien au coffre',
  JSON.stringify(ecrites) === JSON.stringify([
    [RM, J, 302000, 302000, 0, null, 302000, 295000, 0],
    [MOMO, J, 140000, 140000, 0, null, 140000, 140000, 0],
    [KKIA, J, 60600, 60000, -600, 'Frais KkiaPay du jour', 60000, 60600, 0],
  ]), JSON.stringify(ecrites));
dit('les caisses se montrent closes, avec leur compté', /Close à/.test(await evalue(`document.querySelector('[data-journal="caisse-du-jour"] tr[data-caisse="${RM}"]')?.innerText ?? ''`) ?? '')
  && !(await evalue(`!!document.querySelector('[data-journal="caisse-du-jour"] input[data-compte="${RM}"]')`)) && (await cel(KKIA, 'compte')) === 60000 && (await cel(KKIA, 'ecart')) === -600);
dit('l état : « Clôturée · 3 / 3 » ; le bouton éteint, rien à reclôturer', /Clôturée · 3 \/ 3/.test(await etat() ?? '') && (await bouton()) === 'eteint' && /Les caisses cochées sont closes\./.test(await pourquoi() ?? ''), `${await etat()} / ${await pourquoi()}`);
const close1280 = await photo('1280-close');
/* 9. LA REMISE DES POURBOIRES, par la direction. */
let serveurD = null;
let construitD = '';
let remise1280 = '';
if (direction) {
  console.log('Construction du Trône de la direction (serveur injoignable)…');
  construitD = mkdtempSync(path.join(tmpdir(), 'banc-cdj-dir-'));
  execSync(`npx vite build --outDir "${construitD}" --emptyOutDir`, {
    cwd: racine, stdio: 'ignore',
    env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
  });
  renameSync(path.join(construitD, 'trone.html'), path.join(construitD, 'index.html'));
  serveurD = await sers(construitD);
  await cdp('Page.navigate', { url: `http://127.0.0.1:${serveurD.address().port}/` });
  await attend(3000);
  const UID = 'u-banc-direction';
  const CLE = 'sb-127-auth-token';
  const ilYAUnJour = new Date(Date.now() - 86_400_000).toISOString();
  const session = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'direction@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: ilYAUnJour } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le: ilYAUnJour },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le: ilYAUnJour, tete: { user_id: UID, name: 'Direction', role: 'souverain', rubrics: [] } },
    mnd_reset_v5: '1',
  };
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify({ ...SEMENCE, ...session })})) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); location.hash = '#/la-journee'; location.reload(); return true; })()`);
  await jusqua(`!!document.querySelector('[data-journal="caisse-du-jour"] [data-kpi="disponible"]')`, 25000);
  /* Le 5 novembre 2026 : le lendemain, sans rien de neuf au livre. */
  await tape('[data-journal="caisse-du-jour"] input[aria-label="Le jour du journal"]', '05/11/2026');
  await jusqua(`/5 novembre 2026/.test(document.querySelector('.cdj-titre')?.textContent ?? '')`, 8000);
  await attend(800);
  dit('direction, le 5 : les pourboires du 4 sont au matin (295 000 + 7 000) et à remettre',
    (await cel(RM, 'matin')) === 302000 && (await cel(RM, 'disponible')) === 302000 && /à remettre 7[\s  ]000/.test(await evalue(`document.querySelector('[data-a-remettre="${RM}"]')?.textContent ?? ''`) ?? ''),
    `${await cel(RM, 'matin')} / ${await cel(RM, 'disponible')}`);
  dit('« Remettre les pourboires » paraît sur la ligne de Real Money', await clique(`[data-remettre="${RM}"]`));
  await attend(400);
  dit('... le montant proposé : les 7 000 F à remettre', (await evalue(`document.querySelector('[data-remise-montant="${RM}"]')?.value ?? ''`)) === '7000');
  await tape(`[data-journal="caisse-du-jour"] input[data-remise-montant="${RM}"]`, '8000');
  await clique('[data-cdj="remettre"]');
  await attend(400);
  dit('... plus que les pourboires ne passe pas', /Plus que les pourboires à remettre \(7 000 F\)\./.test(await evalue(`document.querySelector('.cdj-remise .cdj-souci')?.textContent ?? ''`) ?? ''),
    await evalue(`document.querySelector('.cdj-remise .cdj-souci')?.textContent ?? ''`));
  await tape(`[data-journal="caisse-du-jour"] input[data-remise-montant="${RM}"]`, '7 000');
  await clique('[data-cdj="remettre"]');
  await attend(900);
  const sorties = ((await evalue(`JSON.parse(localStorage.getItem('trone::mnd_entrees_hors_activite') || '[]')`)) ?? []).map((m) => [m.date, m.sens, m.motif, m.amountXof, m.cashbox]);
  dit('la remise s écrit en sortie hors activité, le 5, de Real Money : 7 000 F', JSON.stringify(sorties) === JSON.stringify([['2026-11-05', 'sortie', 'Pourboires remis à l’équipe', 7000, RM]]), JSON.stringify(sorties));
  dit('... jamais une dépense : les dépenses restent vides', JSON.stringify((await evalue(`JSON.parse(localStorage.getItem('trone::mnd_expenses') || '[]')`)) ?? null) === '[]');
  dit('... elle paraît dans « − Sorties » ce jour-là ; le disponible tombe à 295 000 F ; plus rien à remettre',
    (await cel(RM, 'sorties')) === 7000 && (await cel(RM, 'disponible')) === 295000 && !(await evalue(`!!document.querySelector('[data-a-remettre="${RM}"]')`)) && !(await evalue(`!!document.querySelector('[data-remettre="${RM}"]')`)),
    `${await cel(RM, 'sorties')} / ${await cel(RM, 'disponible')}`);
  remise1280 = await photo('1280-remise');
  await tape('[data-journal="caisse-du-jour"] input[aria-label="Le jour du journal"]', '04/11/2026');
  await jusqua(`/4 novembre 2026/.test(document.querySelector('.cdj-titre')?.textContent ?? '')`, 8000);
  await attend(800);
  dit('le 4 garde ses pourboires dans son disponible : 302 000 F', (await cel(RM, 'disponible')) === 302000 && (await cel(RM, 'pourboires')) === 7000, String(await cel(RM, 'disponible')));
}

dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');
for (const f of [largeur1280, largeur1280b, etroit, close1280, remise1280]) if (f) console.log(`capture : ${f}`);

ws.close(); chrome.kill(); serveur.close(); serveurD?.close();
if (construitD) setTimeout(() => { try { rmSync(construitD, { recursive: true, force: true }); } catch { /* libéré après */ } }, 1500);
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libéré après */ } }, 1500);
console.log(ko === 0 ? '\nLa caisse du jour se coche, se compte et se clôture comme promis.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1800);
