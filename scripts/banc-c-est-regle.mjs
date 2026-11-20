/* LE BANC DE « C'EST RÉGLÉ » — `node scripts/banc-c-est-regle.mjs [dossier construit] [dossier des captures] [--prouve]`.

   4 novembre 2026, maquette `public/maquette-prochain-rituel-a-l-encaissement.html`
   (v2), tranchée au sélecteur : « quand on finit d'encaisser le paiement,
   j'aimerais voir la date du prochain rendez-vous à l'écran, qu'il soit
   validé, et pouvoir le modifier au besoin » (Yéman). Les harnais
   `verifie-la-carte-du-prochain-rituel` et `verifie-le-prochain-rituel`
   éprouvent les règles ; ce banc ouvre le VRAI Trône, hors ligne, depuis le
   Carnet, et joue le parcours dans la fenêtre « Encaisser le rituel » :

     - A. une habituée fictive (Awa K., toutes les quatre semaines, le même
       jour, à 10 h chez Expert) : encaisser fait voir « C'est réglé », la
       carte « À valider », la date en grand avec son année, le ticket réglé ;
       « Valider ce rendez-vous » pose UN rendez-vous confirmé SANS
       confirmation ; « Une autre date » le déplace, sans en poser un second ;
       « Terminer » lève le drapeau : la confirmation part une fois ;
     - B. terminer sans valider fait demander ; « Terminer sans rendez-vous »
       ne pose rien ;
     - C. un rendez-vous déjà là (pris dans Ma Couronne) se montre, rien de
       plus n'est créé ni reconfirmé ;
     - D. son heure prise (les deux fauteuils) : l'heure libre la plus proche
       le même jour, et l'écran le dit ; « Le valider et terminer » pose et
       confirme d'un geste ;
     - E. « Pas de prochain rendez-vous » se confirme dans le pied et retire ;
     - G. au Carnet, « Honoré » sans encaisser ouvre la même carte, proposée,
       validée d'un toucher, confirmée à « Terminer » ;
     - F. au téléphone, rien ne déborde.

   15 NOVEMBRE 2026, LE RENDEZ-VOUS SUGGÉRÉ (maquette PeiD4o4yfCY4GajdGJ52Ez) :
   « C'est réglé » a deux étapes nommées. L'étape 1 ferme la séance (le
   ticket, « Ensuite : son prochain rendez-vous », « Fermer sans prochain
   rendez-vous ») ; l'étape 2, « Nouveau rendez-vous », porte la carte, les
   puces 3 à 12 semaines, « Qui a choisi cette date » et « Poser la
   suggestion ». Le rendez-vous posé « Suggéré par la Maison » porte
   `suggereLe` ; « Elle l'a choisi avec nous » n'en porte pas. H : au Carnet,
   le badge « Suggéré », et « Elle a dit oui ».

   `--prouve` : chaque faute est remise une à une dans le vrai fichier (copie
   gardée, restaurée dans un finally, empreintes comparées), le Trône est
   reconstruit hors ligne, et le banc doit crier à chacune.

   Il attend le Trône construit sans serveur (sous Bash : sous PowerShell, une
   variable vide est SUPPRIMÉE et Vite reprend le vrai .env) :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir
   Sous Git Bash, les chemins Windows passent par `cygpath -w`. Toutes les
   données sont inventées : le dépôt est public. */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2).filter((a) => a !== '--prouve');
const prouve = process.argv.includes('--prouve');
const construit = args[0] || path.join(tmpdir(), 'banc-trone');
const captures = args[1] || '';

/* ══ LA PREUVE : une faute, une construction, un banc qui crie ══ */
const PANNES = [
  ['la fenetre se ferme a l encaissement', 'src/apps/trone/routes/clients/actions.tsx',
    '    } else if (montreLeRegle) {', '    } else if (false && montreLeRegle) {'],
  ['la date se pose d office', 'src/shared/carte-du-prochain-rituel-pur.ts',
    'return { depart: o.depart, place: o.depart, rdvId: null, dejaLa: false, valide: false,', 'return { depart: o.depart, place: o.depart, rdvId: null, dejaLa: false, valide: true,'],
  ['la confirmation part des la pose', 'src/apps/trone/routes/vente/SonProchainRituel.tsx',
    '      sansConfirmation: true,\n      ...marqueDeLaPose(', '      ...marqueDeLaPose('],
  /* Le rendez-vous suggéré (15 novembre 2026). */
  ['la seance et la suite se melangent', 'src/apps/trone/routes/clients/actions.tsx',
    'const [etape, setEtape] = useState<1 | 2>(1);', 'const [etape, setEtape] = useState<1 | 2>(2);'],
  ['la suggestion ne se marque pas', 'src/apps/trone/routes/vente/SonProchainRituel.tsx',
    '      ...marqueDeLaPose(quiRef.current, new Date().toISOString()),\n      remiseFamilleXof:', '      remiseFamilleXof:'],
  ['la puce pose le rendez-vous', 'src/shared/carte-du-prochain-rituel-pur.ts',
    "if (!e.valide) return { etat: { ...e, place: g.place, modif: false, pied: 'rien' }, effets: [] };", "if (!e.valide) return { etat: { ...e, place: g.place, valide: true, rdvId: 'p', modif: false, pied: 'rien' }, effets: [{ genre: 'poser', id: 'p', place: g.place }] };"],
  ['changer de place pose un second rendez-vous', 'src/shared/carte-du-prochain-rituel-pur.ts',
    "return { etat: { ...e, place: g.place, modif: false }, effets: [{ genre: 'deplacer', rdvId: e.rdvId, place: g.place }] };",
    "return { etat: { ...e, place: g.place, modif: false, rdvId: g.id }, effets: [{ genre: 'poser', id: g.id, place: g.place }] };"],
  ['terminer ne leve pas la confirmation', 'src/apps/trone/routes/vente/SonProchainRituel.tsx',
    "    } else if (f.genre === 'confirmer') {\n      leveLaConfirmation(f.rdvId);\n", "    } else if (f.genre === 'confirmer') {\n"],
  ['terminer sans valider ferme sans demander', 'src/shared/carte-du-prochain-rituel-pur.ts',
    "if (!e.valide && e.place && !e.retire) return { etat: { ...e, pied: 'demande-fin' }, effets: [] };", ''],
  ['le rendez-vous deja la ne se montre pas', 'src/apps/trone/routes/vente/SonProchainRituel.tsx',
    '    deja: dejaPose ? { id: dejaPose.id, iso: dejaPose.date, heure: dejaPose.time } : null,\n', '    deja: null,\n'],
  /* La date choisie est celle qui se pose (20 novembre 2026). */
  ['la bande ne fait qu allumer le jour', 'src/apps/trone/routes/vente/SonProchainRituel.tsx',
    'onClick={() => { setJourChoisi(iso); choisitLeJour(iso, { resteOuvert: true }); }}', 'onClick={() => setJourChoisi(iso)}'],
  ['le jour choisi ferme passe au suivant sans le dire', 'src/shared/rendez-vous-suggere-pur.ts',
    "  if (p.ferme) return { iso: o.iso, manque: 'ferme' };\n",
    "  if (p.ferme) { const s = laPlaceDeLaPuce({ vise: o.iso, aujourdhui: o.aujourdhui, placesDe: o.placesDe, heureHabituelle: o.heureHabituelle }); if (s) return s; }\n"],
  ['le geste plein tait sa date', 'src/apps/trone/routes/vente/SonProchainRituel.tsx', " · ${placeCourte(carte.place)}`;", '`;'],
];

if (prouve) {
  const md5 = (f) => createHash('md5').update(readFileSync(path.join(racine, f))).digest('hex');
  const lance = (dossier) => spawnSync(process.execPath, [path.join(racine, 'scripts', 'banc-c-est-regle.mjs'), dossier], { cwd: racine, encoding: 'utf8', timeout: 600000 });
  const construis = (dossier) => {
    const r = spawnSync(process.execPath, [path.join(racine, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', dossier, '--emptyOutDir', '--logLevel', 'error'], {
      cwd: racine, encoding: 'utf8', timeout: 600000, env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    });
    if (r.status !== 0) throw new Error(`construction ratee : ${(r.stderr || r.stdout || '').slice(0, 400)}`);
    /* Jamais un Trône branché sur la vraie base pendant un banc. */
    const assets = path.join(dossier, 'assets');
    const branche = readdirSync(assets).some((f) => f.endsWith('.js') && /\.supabase\.co/.test(readFileSync(path.join(assets, f), 'utf8')));
    if (branche) throw new Error('la construction porte une adresse Supabase : banc arrete');
  };
  const propre = lance(construit);
  if (propre.status !== 0) { console.log('Le banc ne passe pas sur le code propre :'); console.log(propre.stdout); process.exit(1); }
  console.log('Code propre : le banc passe.');
  const fichiers = [...new Set(PANNES.map((p) => p[1]))];
  const avant = Object.fromEntries(fichiers.map((f) => [f, md5(f)]));
  const gardes = Object.fromEntries(fichiers.map((f) => [f, readFileSync(path.join(racine, f))]));
  const dossier = mkdtempSync(path.join(tmpdir(), 'banc-c-est-regle-panne-'));
  let muettes = 0;
  try {
    for (const [nom, fichier, a, b] of PANNES) {
      const brut = gardes[fichier].toString('utf8');
      const crlf = brut.includes('\r\n');
      const texte = brut.replace(/\r\n/g, '\n');
      if (texte.split(a).length !== 2) { console.log(`INTROUVABLE ${nom}`); muettes++; continue; }
      const casse = texte.replace(a, b);
      writeFileSync(path.join(racine, fichier), crlf ? casse.replace(/\n/g, '\r\n') : casse);
      try {
        construis(dossier);
      } finally {
        writeFileSync(path.join(racine, fichier), gardes[fichier]);
      }
      const r = lance(dossier);
      const cris = (r.stdout || '').split(/\r?\n/).filter((l) => l.startsWith('ECHEC')).length;
      if (r.status === 0) { console.log(`MUETTE ${nom}`); muettes++; } else console.log(`CRIE  ${nom} (${cris} controle${cris > 1 ? 's' : ''} en echec)`);
    }
  } finally {
    for (const f of fichiers) writeFileSync(path.join(racine, f), gardes[f]);
    rmSync(dossier, { recursive: true, force: true });
  }
  const intacts = fichiers.every((f) => md5(f) === avant[f]);
  console.log(intacts ? 'Fichiers rendus a l identique.' : 'ATTENTION : un fichier n est pas revenu a l identique.');
  console.log(muettes === 0 && intacts ? `\nLa preuve tient : ${PANNES.length} fautes, le banc crie a chacune.` : `\n${muettes} faute(s) sans cri.`);
  process.exit(muettes === 0 && intacts ? 0 : 1);
}

/* ══ LE BANC ══ */
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-c-est-regle-'));
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
/* La console Windows parle cp1252 : tout ce qui sort est ramené à l'ASCII. */
const ascii = (s) => String(s).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(ascii(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`)); };
const modale = `document.querySelector('.mnd-modal')`;
const clique = (selecteur, texte, dans = 'document') => evalue(`(() => {
  const b = [...(${dans})?.querySelectorAll(${JSON.stringify(selecteur)}) ?? []].find((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(texte)}) && !x.disabled);
  if (b) b.click();
  return !!b;
})()`);
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const texte = (selecteur) => evalue(`(document.querySelector(${JSON.stringify(selecteur)})?.textContent || '').replace(/\\s+/g, ' ').trim()`);
const capture = async (nom, l, h, mobile) => {
  if (!captures) return;
  await cdp('Emulation.setDeviceMetricsOverride', { width: l, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await attend(600);
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(path.join(captures, `${nom}.png`), Buffer.from(img.result.data, 'base64'));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await attend(400);
};

/* LA MAISON D'EXEMPLE — fictive : deux fauteuils, Expert et Team, un tiroir,
   deux gestes (28 000 F, 1 h 30). Chaque tête vient toutes les quatre
   semaines, le même jour de la semaine qu'aujourd'hui, à son heure. */
const pad = (n) => String(n).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/* Le jour du banc se fige au départ : un passage qui franchit minuit ne fait pas glisser ses attendus. */
const DEPART = new Date();
const jourPlus = (n) => { const d = new Date(DEPART); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return isoDe(d); };
const AUJ = jourPlus(0);
/* UN DIMANCHE, LA MAISON EST FERMÉE (heures par défaut) : passé un dimanche
   (15 novembre 2026), quatre semaines tombent un dimanche et la carte propose
   le lundi. Les attendus suivent le premier jour ouvert. */
const ouvertDes = (n) => { const iso = jourPlus(n); return new Date(`${iso}T12:00:00`).getDay() === 0 ? jourPlus(n + 1) : iso; };
const GESTES = ['sv-souffle', 'sv-reprise'];
const tete = (cid, nom, civilite, phone) => ({ id: cid, branchId: 'maison', name: nom, phone, city: '', persona: '', since: '2026-01-10', segments: [], ...(civilite ? { civilite } : {}) });
const sesVenues = (cid, heure) => [84, 56, 28].map((n) => ({ id: `${cid}-h${n}`, branchId: 'maison', clientId: cid, serviceIds: GESTES, date: jourPlus(-n), time: heure, status: 'honoré', master: 'Expert', priceXof: 28000 }));
const duJour = (cid, heure) => ({ id: `rdv-${cid}`, branchId: 'maison', clientId: cid, serviceIds: GESTES, date: AUJ, time: heure, status: 'confirmé', master: 'Expert' });
const TETES = [
  ['cl-ak', 'Awa K.', 'madame', '10:00', '0100000061'],
  ['cl-cf', 'Chloé F.', null, '10:00', '0100000062'],
  ['cl-bd', 'Bénédicte D.', null, '09:00', '0100000063'],
  ['cl-de', 'Danielle E.', null, '15:00', '0100000064'],
  ['cl-eg', 'Eva G.', null, '12:00', '0100000065'],
  ['cl-fh', 'Fanta H.', null, '16:30', '0100000066'],
  ['cl-gi', 'Grâce I.', null, '14:00', '0100000067'],
];
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
  'trone::mnd_clients': TETES.map(([cid, nom, civ, , tel]) => tete(cid, nom, civ, tel)),
  'trone::mnd_appointments': [
    ...TETES.flatMap(([cid, , , h]) => [...sesVenues(cid, h), duJour(cid, h)]),
    /* C. Son prochain rendez-vous, pris dans Ma Couronne le 20 octobre 2026. */
    { id: 'bd-deja', branchId: 'maison', clientId: 'cl-bd', serviceIds: GESTES, date: jourPlus(20), time: '11:00', status: 'confirmé', master: 'Expert', source: 'couronne', creeLe: '2026-10-20T09:00:00.000Z', priceXof: 28000 },
    /* D. Les deux fauteuils pris à son heure, le jour de son rythme. */
    { id: 'pris-1', branchId: 'maison', clientId: 'cl-x1', serviceIds: GESTES, date: ouvertDes(28), time: '15:00', status: 'confirmé', master: 'Expert' },
    { id: 'pris-2', branchId: 'maison', clientId: 'cl-x2', serviceIds: GESTES, date: ouvertDes(28), time: '15:00', status: 'confirmé', master: 'Team' },
  ],
  'trone::mnd_invoices': [],
  'trone::mnd_payment_methods': ['MTN MoMo', 'Espèces', 'Carte', 'Chèque'],
};
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (!sessionStorage.getItem('banc_seme')) { sessionStorage.setItem('banc_seme', '1'); localStorage.setItem('mnd_reset_v5', '1'); for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); } } catch (e) {}` });

const ouvreLEncaissement = async (q, heure) => {
  /* La recherche du Carnet se lit à son ouverture : on recharge la page. */
  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/carnet?q=${encodeURIComponent(q)}` });
  await attend(1500);
  await cdp('Page.reload', { ignoreCache: false });
  await attend(7000);
  /* La pastille du statut ouvre le menu du rendez-vous : celui du jour, à son heure, « confirmé ». */
  const points = await evalue(`(() => { const l = [...document.querySelectorAll('.trc-rdv')].find((r) => r.querySelector('.trc-time')?.textContent.trim() === ${JSON.stringify(heure)} &&r.querySelector('.trc-statut')?.textContent.trim().startsWith('confirmé')); const b = l?.querySelector('.trc-statut'); if (b) b.click(); return !!b; })()`);
  await attend(400);
  const enc = await clique('.trc-menu button', 'Encaisser');
  await attend(900);
  return points && enc && !!(await evalue(`!!${modale}`));
};
const encaisse = async () => { const ok = await clique('button', 'Encaisser 28', modale); await attend(2500); return ok; };
const sesRdv = async (cid) => ((await lis('trone::mnd_appointments')) ?? []).filter((a) => a.clientId === cid && a.date > AUJ);
const titre = () => texte('.mnd-modal__title');
const pastille = () => texte('.mnd-modal .trv-prochain__pastille');
const enGrand = () => texte('.mnd-modal .trv-prochain__date');
const pied = () => texte('.mnd-modal .trv-regle__pied-gauche');
const toastDit = () => evalue(`([...document.querySelectorAll('.mnd-toast')].pop()?.textContent || '').replace(/\\s+/g, ' ').trim()`);
const ditLeJour = (iso) => evalue(`(() => { const s = new Date('${iso}T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); })()`);
const termine = async () => { const ok = await clique('.mnd-modal .trv-regle__terminer', 'Terminer'); await attend(900); return ok; };
/* « mar. 22 déc. 2026 », « mardi 22 décembre 2026 » : comme la carte les écrit. */
const ditCourt = (iso) => evalue(`(() => { const s = new Date('${iso}T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); return s.charAt(0).toLowerCase() + s.slice(1); })()`);
const ditLong = async (iso) => { const s = await ditLeJour(iso); return s.charAt(0).toLowerCase() + s.slice(1); };
/* Le champ « Ou choisir une date », rempli comme le calendrier du téléphone le remplit. */
const choisitLaDate = (iso) => evalue(`(() => {
  const i = document.querySelector('.mnd-modal .trv-prochain__date-libre input[type="date"]');
  if (!i) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '${iso}');
  i.dispatchEvent(new Event('input', { bubbles: true }));
  i.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`);

const etape = () => evalue(`document.querySelector('.mnd-modal .trv-regle')?.dataset.etape || ''`);
const geste = async (libelle) => { const ok = await clique('.mnd-modal .trv-regle__terminer', libelle); await attend(900); return ok; };
const lien = async (libelle) => { const ok = await clique('.mnd-modal .trv-regle__pied-gauche button', libelle); await attend(900); return ok; };
const versLaSuite = async () => { const ok = await geste('Son prochain rendez-vous'); return ok && (await etape()) === '2'; };

/* ── A. ENCAISSER, PUIS LA SUITE À PART (15 novembre 2026, le rendez-vous suggéré) ── */
dit('le Carnet ouvre l encaissement d Awa K.', await ouvreLEncaissement('Awa', '10:00'));
dit('elle règle ses 28 000 F', await encaisse());
dit('la fenêtre reste ouverte et passe à « C’est réglé », première étape', (await titre()) === 'C’est réglé' && (await etape()) === '1', `${await titre()} · ${await etape()}`);
const rail = await evalue(`[...document.querySelectorAll('.mnd-modal .trv-regle__etape')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim())`);
dit('deux étapes nommées : la séance, puis son prochain rendez-vous', rail.length === 2 && rail[0].startsWith('1La séance du ') && rail[1].startsWith('2Son prochain rendez-vous'), JSON.stringify(rail));
const ticket = await evalue(`(${modale}?.querySelector('.trv-regle__droite')?.innerText || '').replace(/\\s+/g, ' ')`);
dit('l étape 1 : le ticket réglé', /Réglé en totalité/i.test(ticket) && /28\s?000\s?F/u.test(ticket) && ticket.includes('Rituel honoré'), ticket.slice(0, 160));
dit('... et la suite annoncée à part, rien de posé', (await texte('.mnd-modal .trv-regle__annonce')).startsWith('Ensuite : son prochain rendez-vous') && !(await evalue(`!!document.querySelector('.mnd-modal .trv-prochain__carte')`)) && (await sesRdv('cl-ak')).length === 0, await texte('.mnd-modal .trv-regle__annonce'));
await capture('c-est-regle-etape-1', 1280, 900, false);
dit('« Son prochain rendez-vous » ouvre la seconde étape', await versLaSuite());
dit('... la séance réduite à une ligne, « Nouveau rendez-vous »', (await texte('.mnd-modal .trv-regle__close')).startsWith('Séance du ') && (await texte('.mnd-modal .trv-regle__close')).includes('fermée') && (await texte('.mnd-modal .trv-regle__nouveau')) === 'Nouveau rendez-vous' && (await titre()) === 'Son prochain rendez-vous', await texte('.mnd-modal .trv-regle__close'));
dit('la carte est à valider, rien de posé', (await pastille()) === 'À valider' && (await sesRdv('cl-ak')).length === 0, await pastille());
const saDate = await ditLeJour(ouvertDes(28));
dit('la date en grand, avec son année : quatre semaines, son jour', (await enGrand()) === saDate, `${await enGrand()} / ${saDate}`);
dit('l heure, la durée, son maître', (await texte('.mnd-modal .trv-prochain__heure')) === '10 h · 1 h 30 · avec Expert', await texte('.mnd-modal .trv-prochain__heure'));
const puces = await evalue(`[...document.querySelectorAll('.mnd-modal .trv-prochain__puce')].map((b) => ({ n: b.dataset.semaines, on: b.getAttribute('aria-pressed'), rythme: !!b.querySelector('.est-rythme') }))`);
dit('six puces 3, 4, 5, 6, 8, 12 semaines, la sienne marquée et enfoncée', JSON.stringify(puces.map((x) => x.n)) === '["3","4","5","6","8","12"]' && puces.find((x) => x.n === '4')?.rythme && puces.find((x) => x.n === '4')?.on === 'true', JSON.stringify(puces));
dit('« Ou choisir une date » est là', await evalue(`!!document.querySelector('.mnd-modal .trv-prochain__date-libre input[type="date"]')`));
const qui = await evalue(`[...document.querySelectorAll('.mnd-modal .trv-prochain__choix')].map((l) => ({ t: l.querySelector('b')?.textContent, on: l.querySelector('input')?.checked }))`);
dit('« Suggéré par la Maison » d office, « Elle l’a choisi avec nous » à côté', JSON.stringify(qui) === JSON.stringify([{ t: 'Suggéré par la Maison', on: true }, { t: 'Elle l’a choisi avec nous', on: false }]), JSON.stringify(qui));
const bulle0 = await texte('.mnd-modal .trv-prochain__bulle');
dit('ce qu elle reçoit en fermant : la proposition, et ses deux boutons', bulle0.startsWith(`Bonjour Mme Awa, merci pour votre visite. Pour garder le rythme de vos locks, nous vous proposons votre prochain rituel le ${saDate.charAt(0).toLowerCase()}${saDate.slice(1)} à 10 h : Souffle du banc et Reprise du banc.`) && bulle0.includes('Je confirme') && bulle0.includes('Un autre moment'), bulle0.slice(0, 200));
dit('le geste plein dit « Poser la suggestion » et la date qu il pose', (await texte('.mnd-modal .trv-regle__terminer')) === `Poser la suggestion · ${await ditCourt(ouvertDes(28))} à 10 h`, await texte('.mnd-modal .trv-regle__terminer'));
await capture('c-est-regle-etape-2', 1280, 900, false);

dit('la puce « 6 sem. » change la date montrée', await clique('.mnd-modal .trv-prochain__puce', '6 sem.'));
await attend(600);
dit('... six semaines, et toujours rien de posé', (await enGrand()) === await ditLeJour(ouvertDes(42)) && (await sesRdv('cl-ak')).length === 0, `${await enGrand()} · ${(await sesRdv('cl-ak')).length}`);
dit('« Valider ce rendez-vous »', await clique('.mnd-modal .trv-prochain__valider', 'Valider ce rendez-vous'));
await attend(800);
let poses = await sesRdv('cl-ak');
let p = poses[0];
dit('un rendez-vous et un seul est posé, à la date montrée', poses.length === 1 && p?.date === ouvertDes(42) && p?.time === '10:00', JSON.stringify(poses.map((a) => `${a.date} ${a.time}`)));
dit('posé confirmé, SUGGÉRÉ, relié à son rituel, sans confirmation tant que l écran est ouvert', p?.status === 'confirmé' && !!p?.suggereLe && p?.repriseDe === 'rdv-cl-ak' && p?.sansConfirmation === true && p?.priceXof === 28000,
  JSON.stringify({ s: p?.status, sug: !!p?.suggereLe, de: p?.repriseDe, sans: p?.sansConfirmation }));
dit('la pastille dit « Suggéré · changé »', (await pastille()) === 'Suggéré · changé', await pastille());
dit('« Elle l’a choisi avec nous » retire la marque', await evalue(`(() => { const i = [...document.querySelectorAll('.mnd-modal .trv-prochain__choix input')][1]; if (i) i.click(); return !!i; })()`));
await attend(700);
p = (await sesRdv('cl-ak'))[0];
dit('... plus de suggestion, la pastille dit « Confirmé · changé », l aperçu dit la confirmation', !p?.suggereLe && (await pastille()) === 'Confirmé · changé' && (await texte('.mnd-modal .trv-prochain__bulle')).startsWith('Bonjour Mme Awa, c\'est confirmé'), `${!!p?.suggereLe} · ${await pastille()}`);
dit('« Suggéré par la Maison » la remet', await evalue(`(() => { const i = [...document.querySelectorAll('.mnd-modal .trv-prochain__choix input')][0]; if (i) i.click(); return !!i; })()`));
await attend(700);
dit('... la marque revient', !!(await sesRdv('cl-ak'))[0]?.suggereLe);
dit('la puce « 4 sem. » déplace le même rendez-vous', await clique('.mnd-modal .trv-prochain__puce', '4 sem.'));
await attend(900);
poses = await sesRdv('cl-ak');
p = poses[0];
dit('... un seul, à quatre semaines, toujours sans confirmation', poses.length === 1 && p?.date === ouvertDes(28) && p?.sansConfirmation === true && (await pastille()) === 'Suggéré', JSON.stringify(poses.map((a) => `${a.date} ${a.sansConfirmation}`)));
dit('le geste plein dit « Terminer »', (await texte('.mnd-modal .trv-regle__terminer')) === 'Terminer', await texte('.mnd-modal .trv-regle__terminer'));
dit('« Terminer »', await geste('Terminer'));
p = (await sesRdv('cl-ak'))[0];
dit('« Terminer » lève le drapeau : la proposition part une fois, suggérée', !!p && !('sansConfirmation' in p) && !!p.suggereLe && p.date === ouvertDes(28), JSON.stringify({ sans: p?.sansConfirmation, sug: !!p?.suggereLe, date: p?.date }));
dit('la fenêtre se ferme, et dit la proposition', !(await evalue(`!!${modale}`)) && (await toastDit()).startsWith('Fenêtre fermée. La proposition part vers Awa K. :'), await toastDit());

/* ── B. « FERMER SANS PROCHAIN RENDEZ-VOUS », DÈS L'ÉTAPE 1 ── */
dit('le Carnet ouvre l encaissement de Chloé F.', await ouvreLEncaissement('Chloé', '10:00'));
dit('elle règle', await encaisse());
dit('« Fermer sans prochain rendez-vous »', await lien('Fermer sans prochain rendez-vous'));
dit('... la fenêtre se ferme, aucun rendez-vous, aucun message', !(await evalue(`!!${modale}`)) && (await sesRdv('cl-cf')).length === 0 && (await toastDit()).startsWith('Fenêtre fermée sans prochain rendez-vous, aucun message.'), await toastDit());

/* ── C. UN RENDEZ-VOUS DÉJÀ LÀ SE MONTRE ── */
dit('le Carnet ouvre l encaissement de Bénédicte D.', await ouvreLEncaissement('Bénédicte', '09:00'));
dit('elle règle', await encaisse());
dit('l étape 1 dit que son prochain rendez-vous est déjà posé', (await texte('.mnd-modal .trv-regle__annonce')).startsWith('Son prochain rendez-vous est déjà posé'), await texte('.mnd-modal .trv-regle__annonce'));
dit('« Voir son prochain rendez-vous »', (await geste('Voir son prochain rendez-vous')) && (await etape()) === '2');
dit('son rendez-vous déjà posé se montre, confirmé, en grand', (await pastille()) === 'Confirmé' && (await enGrand()) === await ditLeJour(jourPlus(20)), `${await pastille()} · ${await enGrand()}`);
dit('... il dit d où il vient', (await texte('.mnd-modal .trv-prochain__verifie')).includes('Posé le 20 octobre 2026 depuis Ma Couronne, confirmé.'), await texte('.mnd-modal .trv-prochain__verifie'));
dit('... ni puces, ni « Qui a choisi », ni « Valider »', !(await evalue(`!!document.querySelector('.mnd-modal .trv-prochain__puce, .mnd-modal .trv-prochain__choix, .mnd-modal .trv-prochain__valider')`)));
dit('... « Ce qu elle reçoit » : rien de plus', (await texte('.mnd-modal .trv-prochain__quand')).startsWith('Rien de plus'));
dit('« Fermer »', await geste('Fermer'));
const bd = await sesRdv('cl-bd');
dit('... rien de plus créé, rien de reconfirmé', bd.length === 1 && bd[0].id === 'bd-deja' && !('sansConfirmation' in bd[0]) && !bd[0].suggereLe && !(await evalue(`!!${modale}`)), JSON.stringify(bd.map((a) => a.id)));

/* ── D. SON HEURE PRISE ; « ELLE L'A CHOISI AVEC NOUS » ; « POSER LE RENDEZ-VOUS » ── */
dit('le Carnet ouvre l encaissement de Danielle E.', await ouvreLEncaissement('Danielle', '15:00'));
dit('elle règle, puis la seconde étape', (await encaisse()) && (await versLaSuite()));
const heureD = await texte('.mnd-modal .trv-prochain__heure');
dit('son heure prise : le même jour, l heure libre la plus proche', (await enGrand()) === await ditLeJour(ouvertDes(28)) && !heureD.startsWith('15 h ·'), `${await enGrand()} · ${heureD}`);
dit('... et l écran le dit', /^!s?15 h est déjà prise chez Expert ce \S+-là : proposé à \d{1,2} h( \d{2})?, l’heure libre la plus proche\.$/u.test(await texte('.mnd-modal .trv-prochain__verifie')), await texte('.mnd-modal .trv-prochain__verifie'));

/* ── I. LA DATE CHOISIE EST CELLE QUI SE POSE (20 novembre 2026) ──
   « J'ai pris rendez-vous pour lui le 22 décembre, je vois le 25. » Dans
   « Une autre date », le jour touché ne faisait que s'allumer : le geste
   plein posait la date restée en grand, celle d'office. Et « Ou choisir une
   date » passait sans le dire au jour suivant quand le jour choisi n'avait
   pas de place. */
const dateD = await enGrand();
const heureD0 = await texte('.mnd-modal .trv-prochain__heure');
dit('« Changer la date ou l’heure »', await clique('.mnd-modal .trv-prochain__bouton', 'Changer la date ou l’heure'));
await attend(400);
dit('« Une autre date » ouvre la bande des jours', await clique('.mnd-modal .trv-prochain__lien', 'Une autre date'));
await attend(500);
const autreJour = await evalue(`(() => { const b = [...document.querySelectorAll('.mnd-modal .trv-prochain__jour')].find((x) => x.getAttribute('aria-pressed') !== 'true'); if (!b) return null; b.click(); return b.dataset.iso; })()`);
await attend(700);
dit('un jour touché dans la bande devient la date en grand, rien de posé', !!autreJour && (await enGrand()) === await ditLeJour(autreJour) && (await sesRdv('cl-de')).length === 0, `${autreJour} -> ${await enGrand()}`);
dit('... le jour touché reste allumé', await evalue(`document.querySelector('.mnd-modal .trv-prochain__jour[data-iso="${autreJour}"]')?.getAttribute('aria-pressed') === 'true'`));
dit('... et le geste plein nomme ce jour', (await texte('.mnd-modal .trv-regle__terminer')).startsWith('Poser la suggestion · ') && (await texte('.mnd-modal .trv-regle__terminer')).includes(await ditCourt(autreJour)), await texte('.mnd-modal .trv-regle__terminer'));
dit('« Garder ce rendez-vous » referme la bande', await clique('.mnd-modal .trv-prochain__bouton', 'Garder ce rendez-vous'));
await attend(400);
dit('« Revenir à la proposition »', await clique('.mnd-modal .trv-prochain__lien', 'Revenir à la proposition'));
await attend(500);
dit('... la date et l heure d office reviennent', (await enGrand()) === dateD && (await texte('.mnd-modal .trv-prochain__heure')) === heureD0, `${await enGrand()} · ${await texte('.mnd-modal .trv-prochain__heure')}`);
let nDim = 29;
while (new Date(`${jourPlus(nDim)}T12:00:00`).getDay() !== 0) nDim += 1;
const dimanche = jourPlus(nDim);
const mardiApres = jourPlus(nDim + 2);
dit('« Ou choisir une date » : un dimanche, jour fermé', await choisitLaDate(dimanche));
await attend(700);
dit('... la date en grand ne bouge pas, rien de posé', (await enGrand()) === dateD && (await sesRdv('cl-de')).length === 0, await enGrand());
const alerteD = await texte('.mnd-modal .trv-prochain__jour-sans-place');
dit('... l écran dit que ce jour est fermé, et où la carte reste', alerteD.startsWith(`La Maison est fermée le ${await ditLong(dimanche)}`) && alerteD.includes('la date n’a pas changé'), alerteD.slice(0, 160));
dit('... il offre le jour suivant et la pose quand même, sans rien choisir seul', (await evalue(`[...document.querySelectorAll('.mnd-modal .trv-prochain__jour-sans-place button')].map((b) => b.textContent.trim().split(' ')[0]).join('|')`)) === 'Prendre|Le', await evalue(`[...document.querySelectorAll('.mnd-modal .trv-prochain__jour-sans-place button')].map((b) => b.textContent.trim()).join(' | ')`));
dit('... et le champ ne montre pas un jour que la carte ne porte pas', (await evalue(`document.querySelector('.mnd-modal .trv-prochain__date-libre input')?.value`)) === '', await evalue(`document.querySelector('.mnd-modal .trv-prochain__date-libre input')?.value`));
dit('« Ou choisir une date » : un mardi ouvert', await choisitLaDate(mardiApres));
await attend(700);
dit('... c est ce jour-là, exactement, qui passe en grand', (await enGrand()) === await ditLeJour(mardiApres) && !(await evalue(`!!document.querySelector('.mnd-modal .trv-prochain__jour-sans-place')`)), await enGrand());
dit('... et le champ le montre', (await evalue(`document.querySelector('.mnd-modal .trv-prochain__date-libre input')?.value`)) === mardiApres, await evalue(`document.querySelector('.mnd-modal .trv-prochain__date-libre input')?.value`));
dit('« Revenir à la proposition » encore', await clique('.mnd-modal .trv-prochain__lien', 'Revenir à la proposition'));
await attend(500);
dit('... la date d office revient', (await enGrand()) === dateD, await enGrand());
dit('« Elle l’a choisi avec nous »', await evalue(`(() => { const i = [...document.querySelectorAll('.mnd-modal .trv-prochain__choix input')][1]; if (i) i.click(); return !!i; })()`));
await attend(500);
dit('... le geste plein dit « Poser le rendez-vous » et sa date, l aperçu la confirmation', (await texte('.mnd-modal .trv-regle__terminer')).startsWith(`Poser le rendez-vous · ${await ditCourt(ouvertDes(28))} à `) &&(await texte('.mnd-modal .trv-prochain__quand')).startsWith('Rien tant que'), await texte('.mnd-modal .trv-regle__terminer'));
dit('« Poser le rendez-vous »', await geste('Poser le rendez-vous'));
const de = await sesRdv('cl-de');
dit('... posé et confirmé d un geste, sans marque de suggestion, la fenêtre fermée', de.length === 1 && !('sansConfirmation' in de[0]) && !de[0].suggereLe && de[0].date === ouvertDes(28) && !(await evalue(`!!${modale}`)), JSON.stringify(de.map((a) => `${a.date} ${a.time} ${a.sansConfirmation} ${a.suggereLe}`)));
dit('... la fenêtre dit la confirmation', (await toastDit()).startsWith('Fenêtre fermée. La confirmation part vers Danielle E. :'), await toastDit());

/* ── E. « PAS DE PROCHAIN RENDEZ-VOUS » ── */
dit('le Carnet ouvre l encaissement d Eva G.', await ouvreLEncaissement('Eva', '12:00'));
dit('elle règle, la seconde étape, et la carte se valide', (await encaisse()) && (await versLaSuite()) && (await clique('.mnd-modal .trv-prochain__valider', 'Valider ce rendez-vous')));
await attend(700);
dit('... posé, suggéré', (await sesRdv('cl-eg')).length === 1 && !!(await sesRdv('cl-eg'))[0]?.suggereLe);
dit('« Pas de prochain rendez-vous » se demande dans le pied', (await lien('Pas de prochain rendez-vous')) && (await pied()).startsWith('Retirer le rendez-vous du '), await pied());
dit('« Retirer »', await lien('Retirer'));
dit('... le rendez-vous s efface, rien ne part ; la carte le dit', (await sesRdv('cl-eg')).length === 0 && (await enGrand()) === 'Pas de prochain rendez-vous' && (await pastille()) === 'Aucun', `${(await sesRdv('cl-eg')).length} · ${await enGrand()}`);
const eva = ((await lis('trone::mnd_appointments')) ?? []).find((a) => a.id === 'rdv-cl-eg');
dit('... son rituel garde la marque d une suite retirée', eva?.repriseRetiree === true);
dit('« Fermer » ferme sans rien poser', (await geste('Fermer')) && !(await evalue(`!!${modale}`)) && (await sesRdv('cl-eg')).length === 0);

/* ── G. « HONORÉ » AU CARNET, SANS ENCAISSER ── */
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/carnet?q=${encodeURIComponent('Grâce')}` });
await attend(1500);
await cdp('Page.reload', { ignoreCache: false });
await attend(7000);
dit('au Carnet, « Honoré » d un toucher sur son rituel du jour', await evalue(`(() => { const l = [...document.querySelectorAll('.trc-rdv')].find((r) => r.querySelector('.trc-time')?.textContent.trim() === '14:00'); const b = l?.querySelector('.trc-vite--oui'); if (b) b.click(); return !!b; })()`));
await attend(1200);
dit('... la même carte s ouvre, proposée, rien de posé', (await titre()) === 'Son prochain rituel' && (await pastille()) === 'À valider' && (await sesRdv('cl-gi')).length === 0, `${await titre()} · ${await pastille()}`);
dit('... sa date en grand, et les puces', (await enGrand()) === await ditLeJour(ouvertDes(28)) && (await evalue(`document.querySelectorAll('.mnd-modal .trv-prochain__puce').length`)) === 6, await enGrand());
await capture('carnet-honore-carte', 1280, 900, false);
dit('« Valider ce rendez-vous »', await clique('.mnd-modal .trv-prochain__valider', 'Valider ce rendez-vous'));
await attend(800);
const gi = await sesRdv('cl-gi');
dit('... posé sans confirmation, suggéré, relié à son rituel', gi.length === 1 && gi[0].sansConfirmation === true && !!gi[0].suggereLe && gi[0].repriseDe === 'rdv-cl-gi' && (await pastille()) === 'Suggéré', JSON.stringify(gi.map((a) => `${a.date} ${a.sansConfirmation} ${a.repriseDe}`)));
dit('« Terminer » : la proposition une fois, la fenêtre fermée', (await termine()) && !('sansConfirmation' in ((await sesRdv('cl-gi'))[0] ?? { sansConfirmation: 1 })) && !(await evalue(`!!${modale}`)));

/* ── H. AU CARNET, LA SUGGESTION SE VOIT ET SE CONFIRME ── */
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/carnet?q=${encodeURIComponent('Awa')}` });
await attend(1500);
await cdp('Page.reload', { ignoreCache: false });
await attend(7000);
const ligneAwa = `[...document.querySelectorAll('.trc-rdv')].find((r) => r.textContent.includes('Suggéré'))`;
dit('au Carnet, sa suggestion porte le badge « Suggéré »', await evalue(`!!${ligneAwa}`));
dit('« Elle a dit oui » au menu du statut', await evalue(`(() => { const b = ${ligneAwa}?.querySelector('.trc-statut'); if (b) b.click(); return !!b; })()`) && (await clique('.trc-menu button', 'Elle a dit oui')));
await attend(900);
p = (await sesRdv('cl-ak'))[0];
dit('... son oui est noté par le comptoir, le badge s en va', !!p?.confirmeeParLaClienteLe && p?.ouiNoteParLeComptoir === true && !(await evalue(`!!${ligneAwa}`)), JSON.stringify({ oui: !!p?.confirmeeParLaClienteLe, comptoir: p?.ouiNoteParLeComptoir }));

/* ── F. AU TÉLÉPHONE ── */
dit('le Carnet ouvre l encaissement de Fanta H.', await ouvreLEncaissement('Fanta', '16:30'));
dit('elle règle', await encaisse());
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await attend(700);
const deborde1 = await evalue(`(() => { const m = document.querySelector('.mnd-modal'); return { page: document.documentElement.scrollWidth, fenetre: m ? m.scrollWidth - m.clientWidth : -1 }; })()`);
dit('à 390 px, l étape 1 ne déborde pas', deborde1.page <= 390 && deborde1.fenetre <= 1, JSON.stringify(deborde1));
await capture('c-est-regle-telephone-1', 390, 844, true);
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await attend(400);
await versLaSuite();
const deborde = await evalue(`(() => { const m = document.querySelector('.mnd-modal'); return { page: document.documentElement.scrollWidth, fenetre: m ? m.scrollWidth - m.clientWidth : -1 }; })()`);
dit('à 390 px, l étape 2 ne déborde pas', deborde.page <= 390 && deborde.fenetre <= 1, JSON.stringify(deborde));
await capture('c-est-regle-telephone', 390, 844, true);
await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await lien('Pas de prochain rendez-vous');

dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');
ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\n« C’est réglé » tient : la séance se ferme, la suite est une étape à part, suggérée, une seule proposition à la fermeture.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
