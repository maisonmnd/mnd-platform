/* LE BANC DES DÉPENSES PRÉPARÉES — `node scripts/banc-les-depenses-preparees.mjs [dossier construit] [capture]`.

   5 novembre 2026, maquette FyXznPQfTLKnL5MQgbn4C1 validée (« construis,
   dans cet ordre »). Le harnais `verifie-les-depenses-preparees` éprouve la
   règle ; ce banc ouvre le VRAI Trône, hors ligne, avec des dépenses
   d'exemple (noms et montants inventés), et fait les gestes d'une main :

     - en tête de Finances › Dépenses, la case « Enregistrer une dépense, en
       une phrase », avant la liste des dépenses préparées ;
     - « eau et savon 2500 hier » : « Grenat lit : … » AVANT de poser, puis
       « Préparer » pose la dépense à valider (le Trône hors ligne n'a pas de
       session : c'est le comptoir), qui rejoint la liste, « Message au Trône » ;
     - sans montant, Grenat demande « Combien ? » et rien ne se pose ;
     - le doublon du jour (même montant, même jour, même bénéficiaire) : il
       le dit, et rien ne se pose ;
     - la dépense d'un engagement, préparée par Grenat, est dans la liste
       (« Engagement ») avec « Corriger », qui ouvre sa fiche ;
     - « Direction seule » (0160, 5 novembre 2026) : le comptoir, même avec
       une copie d'hier des engagements sur le poste, ne voit ni la section
       des engagements ni « Aucun engagement actif », et aucune erreur ;
     - la Caisse porte la même case, en tête, avant le ticket.

   Il attend le Trône construit sans serveur (SOUS BASH) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "<chemin absolu>" --emptyOutDir
   `capture` (facultatif) : un préfixe, chaque étape donne <préfixe>-<étape>.png.

   PROUVÉ DANS LES DEUX SENS : `--prouve` rejoue le banc en écrivant une
   phrase sans montant à l'étape où la dépense doit se poser : le banc doit
   alors crier. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const prouve = process.argv.includes('--prouve');
const construit = args[0] || path.join(tmpdir(), 'banc-trone-dp');
const capture = args[1] || '';
const LARGEUR = Number(process.env.BANC_LARGEUR || 1280);
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}

async function lanceLeBanc({ geste }) {
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
  const profil = mkdtempSync(path.join(tmpdir(), 'banc-dp-'));
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: LARGEUR, height: 900, deviceScaleFactor: 1, mobile: LARGEUR < 600 });

  let ko = 0;
  const dit = (nom, ok, detail) => { if (!ok) ko++; if (!prouve || !geste.panne) console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
  const photo = async (etape) => {
    if (!capture || geste.panne) return;
    const img = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };

  /* LES DÉPENSES D'EXEMPLE — noms et montants inventés. */
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const J = iso(new Date());
  const hier = iso(new Date(Date.now() - 86_400_000));
  const MOIS = J.slice(0, 7);
  const SEMENCE = {
    'trone::mnd_cashboxes': [
      { id: 'cb-cp', branchId: 'maison', name: 'Caisse Principale', sub: 'Caisse manuelle', glyph: '◈', openingXof: 50000 },
      { id: 'cb-momopay-maison', branchId: 'maison', name: 'MoMoPay Maison MND', sub: 'MTN MoMoPay', glyph: '◉', openingXof: 0, role: 'terrasse' },
    ],
    'trone::mnd_expense_categories': [
      { id: 'ec-logistique', name: 'Logistique', subs: ['Livraisons', 'Transport équipe', 'Coursiers', 'Stockage'] },
      { id: 'ec-local', name: 'Local', subs: ['Loyer', 'Énergie', 'Internet & téléphone', 'Entretien des lieux'] },
      { id: 'ec-matieres', name: 'Matières premières', subs: [] },
      { id: 'ec-sous-traitance', name: 'Sous-traitance', subs: [] },
      { id: 'ec-divers', name: 'Divers', subs: ['Imprévu'] },
    ],
    'trone::mnd_porteurs': ['Brice Banc', 'Sandrine Banc'],
    'trone::mnd_prestataires': [{ id: 'pr-banc', name: 'Hermine Banc' }],
    'trone::mnd_expenses': [
      { id: 'd-banc-1', branchId: 'maison', label: 'Transport produits', amountXof: 3000, date: J, cashbox: 'Caisse Principale', category: 'Logistique', porteur: 'Brice Banc' },
      { id: `eng-ebanc-${MOIS}`, branchId: 'maison', label: `Internet de la Maison, du mois`, amountXof: 27000, date: `${MOIS}-01`, cashbox: 'MoMoPay Maison MND', category: 'Local', laMaisonAPaye: true, recurring: null,
        validation: { etat: 'attente', soumisLe: new Date().toISOString(), soumisPar: 'Grenat' },
        preparee: { par: 'Grenat', source: 'engagement', cle: `engagement:ebanc:${MOIS}`, engagementId: 'ebanc' } },
    ],
    /* Une copie d'hier des engagements, restée sur le poste du comptoir. */
    'trone::mnd_engagements_du_mois': [{ id: 'ebanc', branchId: 'maison', libelle: 'Internet de la Maison', montantXof: 27000, categorie: 'Local', caisse: 'MoMoPay Maison MND',
      jour: 1, actif: true, depuis: MOIS, faits: [MOIS], creeLe: new Date().toISOString(), creePar: 'Direction' }],
  };

  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html` });
  await attend(4000);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); location.hash = '#/depenses'; location.reload(); return true; })()`);
  await attend(7000);

  const ecris = (texte) => evalue(`(() => { const i = document.querySelector('[data-phrase="case"] input'); if (!i) return false;
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(i, ${JSON.stringify(texte)});
    i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  const lu = () => evalue(`document.querySelector('[data-phrase="lu"]')?.innerText ?? ''`);
  const poser = () => evalue(`(() => { const b = document.querySelector('[data-phrase="poser"]'); return b ? (b.disabled ? 'eteint' : 'allume') : 'absent'; })()`);
  const depenses = () => evalue(`JSON.parse(localStorage.getItem('trone::mnd_expenses') || '[]')`);

  /* 1. La case, en tête. */
  const t = await evalue('document.body.innerText');
  dit('Finances › Dépenses s ouvre', /Les dépenses\./.test(t ?? ''), /Les dépenses\./.test(t ?? '') ? undefined : (t ?? '').slice(0, 500).replace(/\n/g, ' '));
  dit('la case « Enregistrer une dépense, en une phrase » est en tête, avant la liste préparée', await evalue(`(() => { const c = document.querySelector('[data-phrase="case"]'); const l = document.querySelector('[data-preparees="liste"]'); return !!c && !!l && /Enregistrer une dépense, en une phrase/i.test(c.textContent) && (c.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; })()`));
  dit('le bouton « Dicter » (l oreille de la Dictée MND)', await evalue(`!!document.querySelector('[data-phrase="dicter"]') === (typeof (window.SpeechRecognition || window.webkitSpeechRecognition) === 'function')`));
  dit('la dépense de l engagement, préparée par Grenat, est dans la liste, « Engagement »', await evalue(`(() => { const c = document.querySelector('[data-preparee="eng-ebanc-${MOIS}"]'); return !!c && /Engagement/i.test(c.textContent) && /Saisie par Grenat/.test(c.textContent) && /La direction la valide ou la refuse|Corriger/.test(c.textContent); })()`));
  const titre1 = await evalue(`document.querySelector('[data-preparees="liste"] .trf-valider__titre')?.innerText ?? ''`);
  dit('la liste dit « 1 dépense préparée, à valider »', /^1 dépense préparée, à valider$/.test(titre1 ?? ''), titre1);
  dit('le comptoir ne voit pas « Valider tout » (la direction seule)', await evalue(`!document.querySelector('[data-preparees="valider-tout"]')`));
  dit('« Direction seule » : le comptoir ne voit pas les engagements de chaque mois, ni une liste vide (« Aucun engagement actif »)',
    await evalue(`!document.querySelector('[data-engagements="section"]') && !/Les engagements de chaque mois|Aucun engagement actif|\\+ Engagement/.test(document.body.innerText)`));

  /* 2. Sans montant, Grenat demande. */
  await ecris('gaz pour la cuisine');
  await attend(400);
  const l2 = await lu();
  dit('sans montant, Grenat demande « Combien ? »', /Grenat demande : Combien \?/.test(l2 ?? ''), l2);
  dit('... et rien ne peut se poser', (await poser()) === 'eteint', await poser());

  /* 3. Le doublon du jour. */
  await ecris('transport des produits 3 000 F espèces, payé par Brice');
  await attend(400);
  const l3 = await lu();
  dit('Grenat lit le montant, la catégorie, la caisse, qui a payé, le jour', /Grenat lit : Transport des produits · 3 000 F · Logistique · Caisse Principale \(espèces\) · payé par Brice Banc · aujourd’hui\./.test(l3 ?? ''), l3);
  dit('... le doublon du jour se dit, et rien ne se pose', /Déjà saisie : « Transport produits », 3 000 F/.test(l3 ?? '') && (await poser()) === 'eteint', (l3 ?? '').split('\n').slice(1).join(' '));
  await photo('1-doublon');

  /* 4. Une vraie dépense, lue puis posée. */
  const avant = (await depenses()).length;
  await ecris(geste.phrase);
  await attend(400);
  const l4 = await lu();
  dit('« eau et savon 2500 hier » : Grenat lit AVANT de poser', /Grenat lit : Eau et savon · 2 500 F · Divers · Caisse Principale, la caisse par défaut · payé par la Maison · hier, /.test(l4 ?? ''), l4);
  dit('... rien n est encore posé', (await depenses()).length === avant);
  await photo('2-lu');
  const touche = await evalue(`(() => { const b = document.querySelector('[data-phrase="poser"]'); if (!b || b.disabled) return false; b.click(); return b.textContent.trim(); })()`);
  dit('« Préparer » se touche (le comptoir prépare, la direction enregistre)', touche === 'Préparer', touche);
  await attend(1200);
  const apres = await depenses();
  const neuve = apres.find((e) => e.preparee?.source === 'phrase');
  dit('la dépense est posée par le magasin des dépenses, à valider', !!neuve && neuve.validation?.etat === 'attente' && neuve.amountXof === 2500 && neuve.date === hier && neuve.cashbox === 'Caisse Principale' && neuve.category === 'Divers' && neuve.label === 'Eau et savon',
    JSON.stringify(neuve ?? null)?.slice(0, 260));
  const titre2 = await evalue(`document.querySelector('[data-preparees="liste"] .trf-valider__titre')?.innerText ?? ''`);
  dit('... elle rejoint la liste : « 2 dépenses préparées, à valider »', /^2 dépenses préparées, à valider$/.test(titre2 ?? ''), titre2);
  dit('... avec son origine, « Message au Trône »', !!neuve && await evalue(`/Message au Trône/i.test(document.querySelector('[data-preparee="${neuve?.id}"]')?.textContent ?? '')`));
  dit('... la case se vide', await evalue(`document.querySelector('[data-phrase="case"] input')?.value === ''`));
  await photo('3-posee');

  /* 5. « Corriger » ouvre la fiche. */
  const corrige = await evalue(`(() => { const b = [...document.querySelectorAll('[data-preparee="eng-ebanc-${MOIS}"] button')].find((x) => x.textContent.trim() === 'Corriger'); if (b) b.click(); return !!b; })()`);
  await attend(900);
  const fiche = await evalue(`(document.querySelector('[role=dialog]') || {}).innerText ?? ''`);
  dit('« Corriger » ouvre la fiche de la dépense préparée', corrige ? /Internet de la Maison/.test(await evalue(`[...document.querySelectorAll('[role=dialog] input')].map((i) => i.value).join(' | ')`) ?? '') || /Internet/.test(fiche ?? '') : true, corrige ? 'ouverte' : 'le comptoir voit « La direction la valide ou la refuse »');
  await evalue(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await attend(500);

  /* 6. La Caisse : la même case, en tête, avant le ticket. */
  await evalue(`location.hash = '#/caisse'`);
  await attend(3500);
  dit('la Caisse porte la case en tête, avant le ticket', await evalue(`(() => { const c = document.querySelector('[data-phrase="case"]'); const t = document.querySelector('.trv-poshead'); const l = document.querySelector('.trv-lien-journee'); return !!c && !!t && !!l && (l.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) > 0 && (c.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; })()`));
  await photo('4-caisse');
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

  ws.close(); chrome.kill(); serveur.close();
  setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
  return ko;
}

const ko = await lanceLeBanc({ geste: { phrase: 'eau et savon 2500 hier' } });
console.log(ko === 0 ? '\nLa phrase se lit, se pose a valider, et la liste des depenses preparees la montre.' : `\n${ko} controle(s) en echec.`);
let code = ko === 0 ? 0 : 1;
if (prouve && ko === 0) {
  /* L'AUTRE SENS : une phrase sans montant ne se pose pas, et le banc doit crier. */
  const koPanne = await lanceLeBanc({ geste: { phrase: 'eau et savon hier', panne: true } });
  console.log(koPanne > 0 ? `PROUVE : sans montant, rien ne se pose et le banc crie (${koPanne} controle(s) en echec).` : 'MUET : le banc ne voit pas une depense qui ne se pose pas.');
  if (koPanne === 0) code = 1;
}
setTimeout(() => process.exit(code), 1800);
