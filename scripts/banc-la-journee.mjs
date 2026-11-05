/* LE BANC DE « LA JOURNÉE » — `node scripts/banc-la-journee.mjs [dossier construit] [capture]`.

   4 novembre 2026, maquette 9KCMgAb1… validée (« construis »). Le harnais
   `verifie-la-cloture-du-jour` éprouve la règle ; ce banc ouvre le VRAI
   Trône, hors ligne, avec une journée d'exemple (noms et montants inventés),
   et fait les gestes du comptoir comme une main les ferait :

     - Finances › La journée est dans la barre, et la page n'a pas de barre
       d'onglets : la clôture de Grenat en haut, la caisse du jour en bas ;
     - un rendez-vous fini sans état se dit « Sans état », avec « Honoré »,
       « Absente », « Annulée » ; un rendez-vous réglé et honoré est « Clos » ;
     - tant qu'il reste un rendez-vous à clore, « Clôturer la caisse » est
       éteint et la carte dit ce qui reste ;
     - « Absente » clôt le rendez-vous : la journée est close, « Clôturer la
       caisse » s'allume et ouvre le comptage habituel du tiroir ;
     - la Caisse n'a plus sa barre « Encaisser | Journal de caisse », et son
       lien mène à La journée.

   LES DÉPENSES DU JOUR (5 novembre 2026, « Oui, il les relit à 19 h ») :
     - la section se tient sous les rendez-vous et avant la caisse du jour ;
     - une dépense sans photo du reçu ni qui a payé se dit « À compléter »
       avec « Joindre la photo », « Dire qui a payé » ; un écart de tiroir
       sans dépense en face se dit « Écart » avec « C'était une dépense » ;
       une dépense d'un jour passé « À valider » ; la récurrente se tait ;
     - rien de cela ne retient la journée : après « Absente », elle est close ;
     - « Joindre la photo » ouvre la fiche de la dépense, « C'était une
       dépense » le formulaire avec l'écart ; le jour d'avant (s'il était
       ouvert), Grenat demande « Aucune dépense saisie » et « Saisir une
       dépense » ouvre le formulaire ;
     - SECOND JOUR D'EXEMPLE : une dépense à valider DU JOUR retient le
       comptage, même tous les rendez-vous clos.
   Le Trône hors ligne n'a pas de session : on y voit ce que voit le
   comptoir, sans « Valider », « Rien aujourd'hui » ni « Laisser l'écart »
   (la direction) ; le harnais éprouve ces gestes-là.

   Il attend le Trône construit sans serveur (SOUS BASH) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone-gr" --emptyOutDir
   `capture` (facultatif) : un préfixe, chaque étape donne <préfixe>-<étape>.png.

   PROUVÉ DANS LES DEUX SENS : `--prouve` rejoue le banc sur une journée où le
   rendez-vous sans état ne se clôt pas (on touche « Encaisser », qui ouvre
   une fenêtre, au lieu d'« Absente »), puis sur le second jour où la dépense
   du jour est déjà validée : le banc doit crier les deux fois. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const prouve = process.argv.includes('--prouve');
const construit = args[0] || path.join(tmpdir(), 'banc-trone-gr');
const capture = args[1] || '';
const LARGEUR = Number(process.env.BANC_LARGEUR || 1280);
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}

/* Un jour ISO local, et la veille. */
const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const veilleDe = (iso) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() - 1); return isoLocal(d); };

async function lanceLeBanc({ geste, scenario = 'complet' }) {
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
  const profil = mkdtempSync(path.join(tmpdir(), 'banc-lj-'));
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
    writeFileSync(`${capture}-${scenario}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };

  /* LA JOURNÉE D'EXEMPLE — noms et montants inventés. Deux rendez-vous du
     jour, à minuit, d'une minute : finis dès que le banc tourne. */
  /* Le jour que la page propose (`jourPropose`) : avant 6 h, la veille. */
  const proposeLe = new Date(); if (proposeLe.getHours() < 6) proposeLe.setDate(proposeLe.getDate() - 1);
  const J = isoLocal(proposeLe);
  const AUJ = isoLocal(new Date());
  const HIER = veilleDe(AUJ);
  const ilYATroisJours = veilleDe(veilleDe(veilleDe(J)));
  const maintenant = new Date().toISOString();
  const ilYADeuxHeures = new Date(Date.now() - 2 * 3_600_000).toISOString();
  /* LES DÉPENSES DU PREMIER JOUR : rien qui retienne la journée. */
  const DEPENSES_COMPLET = [
    { id: 'dep-banc-meches', branchId: 'maison', label: 'Mèches', amountXof: 64600, date: J, cashbox: 'Real Money', category: 'Matières premières' },
    { id: 'dep-banc-loyer', branchId: 'maison', label: 'Loyer', amountXof: 300000, date: J, cashbox: 'Real Money', category: 'Local', recurring: 'mensuel' },
    { id: 'dep-banc-gaz', branchId: 'maison', label: 'Gaz', amountXof: 6000, date: ilYATroisJours, cashbox: 'Real Money', category: 'Local', porteur: 'Sandrine',
      validation: { etat: 'attente', soumisLe: `${ilYATroisJours}T10:00:00.000Z`, soumisPar: 'Opale' } },
  ];
  /* LE SECOND JOUR : une dépense du jour posée par Opale, à valider (validée, dans la panne). */
  const DEPENSES_RETENUE = [
    { id: 'dep-banc-transport', branchId: 'maison', label: 'Transport des produits', amountXof: 3000, date: J, cashbox: 'Real Money', category: 'Transport', porteur: 'Sandrine',
      validation: { etat: geste.validee ? 'validee' : 'attente', soumisLe: ilYADeuxHeures, soumisPar: 'Opale', ...(geste.validee ? { decidePar: 'Direction', decideLe: maintenant } : {}) } },
  ];
  const SEMENCE = {
    'trone::mnd_cashboxes': [{ id: 'cb-rm', branchId: 'maison', name: 'Real Money', sub: 'Tiroir des espèces', glyph: '◈', openingXof: 20000 }],
    'trone::mnd_clients': [
      { id: 'c-banc-1', branchId: 'maison', name: 'Awa Koffi Mensah', phone: '+229 01 97 00 00 01', sansPapiersWa: true, segments: [], tags: [] },
      { id: 'c-banc-2', branchId: 'maison', name: 'Victoire Agbo', phone: '+229 01 97 00 00 02', segments: [], tags: [] },
    ],
    'trone::mnd_appointments': [
      { id: 'r-banc-1', branchId: 'maison', clientId: 'c-banc-1', serviceIds: [], date: J, time: '00:00', dureeMin: 1, master: 'm', status: 'honoré',
        priceXof: 45000, invoiceId: 'inv-banc-1', payments: [{ id: 'p-banc-1', date: J, amountXof: 45000, method: 'Espèces', cashbox: 'Real Money', time: '00:01', invoiceId: 'inv-banc-1' }], pointsAwarded: true },
      { id: 'r-banc-2', branchId: 'maison', clientId: 'c-banc-2', serviceIds: [], date: J, time: '00:00', dureeMin: 1, master: 'm', status: 'confirmé', priceXof: 0 },
    ],
    'trone::mnd_invoices': [
      { id: 'inv-banc-1', branchId: 'maison', kind: 'facture', number: 'F-2026-0990', clientId: 'c-banc-1', date: J, apptId: 'r-banc-1',
        lines: [{ id: 'l-1', label: 'Rituel', qty: 1, unitXof: 45000, discountPct: 0 }], globalDiscountPct: 0, theme: 'Aube', status: 'payée',
        payments: [{ id: 'p-banc-1', date: J, amountXof: 45000, method: 'Espèces', cashbox: 'Real Money', time: '00:01', encaissePar: 'Accueil' }] },
    ],
    'trone::mnd_expenses': scenario === 'retenue' ? DEPENSES_RETENUE : DEPENSES_COMPLET,
    /* Un comptage de Real Money le même jour, 2 500 F de moins, sans dépense en face. */
    'trone::mnd_clotures_caisse': scenario === 'retenue' ? [] : [
      { id: 'clo-banc-1', branchId: 'maison', cashbox: 'Real Money', date: J, attenduXof: 47500, compteXof: 45000, ecartXof: -2500, note: 'Monnaie rendue',
        fondXof: 20000, verseAuCoffreXof: 0, laisseXof: 45000, livreXof: 47500, par: 'Accueil', le: maintenant },
    ],
  };

  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html` });
  await attend(4000);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); location.hash = '#/la-journee'; location.reload(); return true; })()`);
  await attend(7000);

  const texte = () => evalue('document.body.innerText');
  const etat = (rdv) => evalue(`document.querySelector('[data-lj-rdv="${rdv}"]')?.getAttribute('data-etat') ?? null`);
  const cloturer = () => evalue(`(() => { const b = [...document.querySelectorAll('[data-journal="caisse-du-jour"] button')].find((x) => x.textContent.trim() === 'Clôturer la caisse'); return b ? (b.disabled ? 'eteint' : 'allume') : 'absent'; })()`);
  const lignesDepenses = () => evalue(`[...document.querySelectorAll('[data-lj-depense]')].map((l) => ({ genre: l.getAttribute('data-genre'), bloque: l.getAttribute('data-bloque'), texte: l.innerText.replace(/\\s+/g, ' '), gestes: [...l.querySelectorAll('.lj-g')].map((b) => b.textContent.trim()) }))`);
  const touche = (selecteur, bouton) => evalue(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.textContent.trim() === ${JSON.stringify(bouton)}); if (b) b.click(); return !!b; })()`);
  const echap = async () => { await evalue(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await attend(600); };
  const verdict = () => evalue(`document.querySelector('[data-lj="verdict"]')?.innerText ?? ''`);

  if (scenario === 'retenue') {
    /* LE SECOND JOUR : la dépense à valider du jour retient le comptage. */
    const t = await texte();
    dit('« La journée » s ouvre (second jour)', /La journée\./.test(t ?? ''));
    const l = (await lignesDepenses()) ?? [];
    const transport = l.find((x) => /Transport des produits/.test(x.texte));
    dit('la dépense du jour posée par Opale se dit « À valider », et retient le comptage', !!transport && transport.genre === 'a-valider' && transport.bloque === 'oui' && /À valider/.test(transport.texte), JSON.stringify(transport ?? l));
    dit('... le comptoir ne la valide pas : la direction la valide ou la refuse', !!transport && transport.gestes.length === 0 && /La direction la valide ou la refuse/.test(transport.texte), JSON.stringify(transport?.gestes));
    dit('« Absente » se touche', await touche('[data-lj-rdv="r-banc-2"] .lj-g', geste.bouton));
    await attend(1200); await echap();
    dit('apres « Absente », le rendez-vous est clos', (await etat('r-banc-2')) === 'annule', await etat('r-banc-2'));
    const v = await verdict();
    dit('... mais la dépense à valider du jour retient la journée', /1 dépense à valider, la caisse ne se compte pas encore/.test(v ?? ''), v);
    dit('... « Clôturer la caisse » reste éteint', (await cloturer()) === 'eteint', await cloturer());
    dit('... et la carte dit pourquoi', /1 dépense à valider/.test(await evalue(`document.querySelector('.jdc-pas-encore')?.textContent ?? ''`) ?? ''));
    await photo('1-retenue');
    dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');
    ws.close(); chrome.kill(); serveur.close();
    setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
    return ko;
  }

  /* 1. La page, sa place, ses deux moitiés. */
  let t = await texte();
  const ouverte = /La journée\./.test(t ?? '');
  dit('« La journée » s ouvre', ouverte, ouverte ? undefined : (t ?? '').slice(0, 900).replace(/\n/g, ' '));
  dit('la barre range La journee dans Finances', await evalue(`(() => { const l = [...document.querySelectorAll('a, button')].find((x) => x.textContent.trim() === 'La journée'); return !!l; })()`));
  dit('la page n a pas de barre d onglets', await evalue(`!document.querySelector('.trv-tabs') && ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Journal de caisse')`));
  dit('la cloture de Grenat est en haut, la caisse du jour en bas', await evalue(`(() => { const c = document.querySelector('[data-lj="cloture"]'); const j = document.querySelector('[data-journal="caisse-du-jour"]'); return !!c && !!j && (c.compareDocumentPosition(j) & Node.DOCUMENT_POSITION_FOLLOWING) > 0; })()`));
  dit('le rendez-vous regle et honore est clos', (await etat('r-banc-1')) === 'clos', await etat('r-banc-1'));
  dit('le rendez-vous fini sans etat se dit « Sans etat »', (await etat('r-banc-2')) === 'sans-etat', await etat('r-banc-2'));
  const gestes = await evalue(`[...document.querySelectorAll('[data-lj-rdv="r-banc-2"] .lj-g')].map((b) => b.textContent.trim())`);
  dit('... avec ses gestes d un toucher', JSON.stringify(gestes) === JSON.stringify(['Honoré', 'Absente', 'Annulée']), JSON.stringify(gestes));
  dit('les initiales, jamais le nom', /V\. A\./.test(t ?? '') && !/Victoire Agbo/.test(await evalue(`document.querySelector('[data-lj="cloture"]')?.innerText ?? ''`) ?? ''));
  dit('le verdict dit ce qui reste', /1 rendez-vous à clore/.test((await verdict()) ?? ''), await verdict());
  dit('« Cloturer la caisse » est eteint tant que la journee n est pas close', (await cloturer()) === 'eteint', await cloturer());
  dit('... et la carte dit ce qui reste', /Grenat : la caisse ne se compte pas encore/.test(await evalue(`document.querySelector('.jdc-pas-encore')?.textContent ?? ''`) ?? ''));
  dit('la caisse du jour compte les 45 000 F du jour', /45[\s\u202f\u00a0]000/.test(await evalue(`document.querySelector('[data-journal="caisse-du-jour"]')?.innerText ?? ''`) ?? ''));

  /* 1 bis. Les dépenses du jour, sous les rendez-vous, avant la caisse. */
  dit('les dépenses du jour se tiennent sous les rendez-vous et avant la caisse du jour', await evalue(`(() => {
    const d = document.querySelector('[data-lj="depenses"]');
    const r = [...document.querySelectorAll('.lj-bloc')].find((b) => /Les rendez-vous du jour/.test(b.querySelector('.lj-bloc__tete')?.textContent ?? ''));
    const c = document.querySelector('[data-lj="caisse-resume"]'); const j = document.querySelector('[data-journal="caisse-du-jour"]');
    const apres = (x, y) => !!x && !!y && (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
    return !!d && apres(r, d) && apres(d, c) && apres(d, j);
  })()`));
  const lignes = (await lignesDepenses()) ?? [];
  dit('Grenat met sous les yeux : la dépense d un jour passé à valider, celle à compléter, l écart du tiroir', JSON.stringify(lignes.map((l) => l.genre)) === JSON.stringify(['a-valider', 'a-completer', 'ecart-sans-depense']), JSON.stringify(lignes.map((l) => l.genre)));
  const meches = lignes.find((l) => l.genre === 'a-completer');
  dit('... les mèches : sans photo du reçu, et sans qui a payé, avec leurs deux gestes', !!meches && /sans photo du reçu, et sans qui a payé/.test(meches.texte) && JSON.stringify(meches.gestes) === JSON.stringify(['Joindre la photo', 'Dire qui a payé']), JSON.stringify(meches));
  const ecart = lignes.find((l) => l.genre === 'ecart-sans-depense');
  dit('... l écart de Real Money, 2 500 F, avec sa note et « C’était une dépense »', !!ecart && /Tiroir Real Money · 2[\s\u202f\u00a0]500[\s\u202f\u00a0]F de moins que l’attendu/.test(ecart.texte) && /Monnaie rendue/.test(ecart.texte) && JSON.stringify(ecart.gestes) === JSON.stringify(['C’était une dépense']), JSON.stringify(ecart));
  dit('... « Laisser l’écart » est à la direction (le comptoir ne le voit pas)', !!ecart && /La direction peut laisser l’écart, avec sa note/.test(ecart.texte));
  const gaz = lignes.find((l) => l.genre === 'a-valider');
  dit('... la dépense d un jour passé à valider ne retient rien, sa date dite avec l année', !!gaz && gaz.bloque === 'non' && /^Gaz/.test(gaz.texte) && /Du \d{1,2}(er)? [a-zéû]+ \d{4}, posée par Opale/.test(gaz.texte), JSON.stringify(gaz));
  dit('... la récurrente se tait', !lignes.some((l) => /Loyer/.test(l.texte)));
  dit('... rien ne retient la journée', lignes.every((l) => l.bloque === 'non'));
  dit('... aucun tiret « — » dans la section', !/—/.test(await evalue(`document.querySelector('[data-lj="depenses"]')?.innerText ?? '—'`) ?? '—'));
  await photo('1-journee');

  /* 2. Le geste qui clôt. */
  const toucheLe = await touche('[data-lj-rdv="r-banc-2"] .lj-g', geste.bouton);
  dit(`« ${geste.bouton} » se touche`, toucheLe);
  await attend(1200); await echap();
  dit('apres « Absente », le rendez-vous est clos', (await etat('r-banc-2')) === 'annule', await etat('r-banc-2'));
  const v = await verdict();
  dit('... la journee est close, malgré la dépense à compléter et l écart', /La journée est close : la caisse peut se compter\./.test(v ?? ''), v);
  dit('... « Cloturer la caisse » s allume', (await cloturer()) === 'allume', await cloturer());
  await evalue(`[...document.querySelectorAll('[data-journal="caisse-du-jour"] button')].find((x) => x.textContent.trim() === 'Clôturer la caisse')?.click()`);
  await attend(1000);
  const modale = await evalue(`(document.querySelector('[role=dialog]') || {}).innerText ?? ''`);
  dit('... et ouvre le comptage habituel du tiroir', /La caisse du soir|Clôturer ·/.test(modale ?? ''), (modale ?? '').split('\n')[0]);
  await photo('2-close');
  await echap();

  /* 3. La Caisse, sans sa barre. */
  await evalue(`location.hash = '#/caisse'`);
  await attend(3000);
  dit('la Caisse n a plus la barre « Encaisser | Journal de caisse »', await evalue(`!document.querySelector('.trv-tabs') && ![...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Journal de caisse')`));
  const lien = await evalue(`(() => { const b = [...document.querySelectorAll('.trv-lien-journee button')][0]; if (b) b.click(); return !!b; })()`);
  await attend(1500);
  dit('... son lien mene a La journee', lien && /#\/la-journee/.test(await evalue('location.hash') ?? ''), await evalue('location.hash'));
  await photo('3-caisse');

  /* 4. Les gestes des dépenses ouvrent les chemins de toujours. */
  const champ = (valeur) => `[...(document.querySelector('[role=dialog]')?.querySelectorAll('input') ?? [])].some((i) => ${valeur})`;
  dit('« Joindre la photo » se touche', await touche('[data-lj-depense] .lj-g', 'Joindre la photo'));
  await attend(2500);
  dit('... et ouvre la fiche des mèches, dans les Dépenses', /#\/depenses/.test(await evalue('location.hash') ?? '') && await evalue(champ(`i.value === 'Mèches'`)), await evalue('location.hash'));
  await photo('4-fiche');
  await echap();
  await evalue(`location.hash = '#/la-journee'`);
  await attend(2500);
  dit('« C’était une dépense » se touche', await touche('[data-lj-depense] .lj-g', 'C’était une dépense'));
  await attend(2500);
  dit('... et ouvre le formulaire, l écart de 2 500 F posé', /Inscrire une dépense/.test(await evalue(`(document.querySelector('[role=dialog]') || {}).innerText ?? ''`) ?? '') && await evalue(champ(`i.value.replace(/\\D/g, '') === '2500'`)));
  await echap();

  /* 5. Le jour d'avant, sans aucune dépense : Grenat le demande, s'il était ouvert. */
  if (HIER === J) {
    console.log('(avant 6 h : le jour d avant est deja le jour du banc, la question du jour sans depense ne se joue pas ici)');
  } else {
    await evalue(`location.hash = '#/la-journee'`);
    await attend(2500);
    dit('« Hier » se touche', await touche('[data-journal="caisse-du-jour"] button', 'Hier'));
    await attend(1500);
    const hier = (await lignesDepenses()) ?? [];
    const sans = hier.find((l) => l.genre === 'jour-sans-depense');
    if (new Date(`${HIER}T12:00:00`).getDay() === 0) {
      dit('le dimanche (fermé), Grenat ne demande pas de dépense', !sans, JSON.stringify(hier.map((l) => l.genre)));
    } else {
      dit('le jour d avant, ouvert et sans dépense : « Aucune dépense saisie ce jour-là »', !!sans && /Aucune dépense saisie ce jour-là/.test(sans.texte) && sans.bloque === 'non', JSON.stringify(sans ?? hier));
      dit('... « Saisir une dépense » ; « Rien ce jour-là » est à la direction', !!sans && JSON.stringify(sans.gestes) === JSON.stringify(['Saisir une dépense']) && /La direction peut dire « Rien ce jour-là »/.test(sans.texte), JSON.stringify(sans?.gestes));
      dit('... « Saisir une dépense » ouvre le formulaire', await touche('[data-lj-depense] .lj-g', 'Saisir une dépense'));
      await attend(2500);
      dit('... qui s ouvre dans les Dépenses', /#\/depenses/.test(await evalue('location.hash') ?? '') && /Inscrire une dépense/.test(await evalue(`(document.querySelector('[role=dialog]') || {}).innerText ?? ''`) ?? ''));
      await photo('5-hier');
      await echap();
    }
  }
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

  ws.close(); chrome.kill(); serveur.close();
  setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
  return ko;
}

const ko1 = await lanceLeBanc({ geste: { bouton: 'Absente' } });
const ko2 = await lanceLeBanc({ geste: { bouton: 'Absente' }, scenario: 'retenue' });
const ko = ko1 + ko2;
console.log(ko === 0 ? '\nLa journee se ferme comme promis, les depenses se relisent sans la retenir, et la Caisse n a plus sa barre.' : `\n${ko} controle(s) en echec.`);
let code = ko === 0 ? 0 : 1;
if (prouve && ko === 0) {
  /* L'AUTRE SENS : sans le geste qui clôt, le banc doit crier. */
  const koPanne = await lanceLeBanc({ geste: { bouton: 'Honoré-inexistant', panne: true } });
  console.log(koPanne > 0 ? `PROUVE : sans le geste qui clot, le banc crie (${koPanne} controle(s) en echec).` : 'MUET : le banc ne voit pas une journee restee ouverte.');
  if (koPanne === 0) code = 1;
  /* ... et la dépense du jour déjà validée : plus rien ne retient, le banc doit crier. */
  const koValidee = await lanceLeBanc({ geste: { bouton: 'Absente', panne: true, validee: true }, scenario: 'retenue' });
  console.log(koValidee > 0 ? `PROUVE : sans depense a valider du jour, le banc du second jour crie (${koValidee} controle(s) en echec).` : 'MUET : le banc ne voit pas ce qui retient le comptage.');
  if (koValidee === 0) code = 1;
}
setTimeout(() => process.exit(code), 1800);
