import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LES FICHES DE PROCÉDURE, À L'ÉCRAN — `node scripts/banc-des-fiches-de-procedure.mjs [capture]`.

   25 novembre 2026 : « Crée une fiche de procédure par soin du catalogue, en
   commençant par le Rituel SOWA… ajoute un bouton Voir le protocole dans le
   rendez-vous. L'équipe doit pouvoir consulter la version validée sans
   quitter le rendez-vous » (Yéman). Le harnais
   `verifie-les-fiches-de-procedure` éprouve la règle ; ce banc construit le
   Trône comme le banc hors ligne (connexion obligatoire, serveur Supabase
   injoignable, une session gardée) et l'ouvre dans un vrai Chrome, deux fois :

   EN DIRECTION (souverain) :
   · le Catalogue ouvre « Les fiches de procédure » : le Rituel Sówà™ y est
     en brouillon, les autres soins sont « à écrire » ;
   · la fiche Sówà porte ses sept rubriques et ses points signalés ; un soin
     sans fiche s'ouvre rempli de ce que le catalogue dit, sans rien écrire ;
   · « Valider cette version » demande, puis signe la version 1 ;
   · au rendez-vous Sówà, « Voir le protocole » ouvre la fiche PAR-DESSUS :
     deux fenêtres, puis une seule, le rendez-vous intact.
   DANS L'ÉQUIPE (maître) :
   · tant que la fiche est en brouillon, le rendez-vous n'a PAS de bouton ;
   · une fois validée, le bouton paraît, la fiche se lit, signée, sans
     « Valider » ni brouillon ; un rendez-vous d'un soin sans fiche n'a rien ;
   · au téléphone (390 px), rien ne déborde.
   Les clientes sont des exemples. `capture` (facultatif) : un préfixe, chaque
   étape donne <préfixe>-<étape>.png. */

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-fiches-'));
console.log('Construction du Trône (serveur injoignable)…');
/* LE DÉFAUT DE CE POSTE (24 novembre 2026, voir REPRENDRE) : esbuild écrit un
   fichier temporaire pour toute entrée de plus de 1 Mo, et Windows refuse
   ensuite de le supprimer (« remove … : Access is denied ») : le morceau
   `trone` ne se construit plus. Quand cette écriture échoue, esbuild envoie
   l'entrée par son canal, sans fichier : on la fait donc échouer, dans la
   seule construction de ce banc (un préchargement Node posé dans le dossier
   temporaire). Ni le dépôt ni le `node_modules` partagé ne sont touchés ; la
   sortie est celle d'une construction ordinaire. */
const prechargement = path.join(tmpdir(), `banc-fiches-sans-fichier-${process.pid}.mjs`);
writeFileSync(prechargement, `import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const temp = path.resolve(os.tmpdir());
const vraie = fs.writeFile;
fs.writeFile = function (fichier, ...reste) {
  const rappel = reste[reste.length - 1];
  if (typeof fichier === 'string' && typeof rappel === 'function' && path.basename(fichier).startsWith('esbuild-') && path.resolve(path.dirname(fichier)) === temp) {
    queueMicrotask(() => rappel(new Error('pas de fichier temporaire sur ce poste')));
    return;
  }
  return vraie.call(this, fichier, ...reste);
};
`);
try {
  execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
    cwd: racine, stdio: 'ignore',
    env: {
      ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_ALLOW_OPEN: 'false', VITE_BUILD_ID: 'banc', VITE_BASE: '/',
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --import ${pathToFileURL(prechargement).href}`.trim(),
    },
  });
} finally {
  rmSync(prechargement, { force: true });
}
renameSync(path.join(construit, 'trone.html'), path.join(construit, 'index.html'));

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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-fiches-chrome-'));
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
const taille = (width, height, mobile = false) => cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
await taille(1280, 900);

let ko = 0;
const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
const photo = async (etape) => {
  if (!capture) return;
  const img = await cdp('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
};

const UID = 'u-banc-fiches';
const CLE = 'sb-127-auth-token';
const le = new Date(Date.now() - 86_400_000).toISOString();
const pad = (n) => String(n).padStart(2, '0');
const AUJ = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
const SOWA = '1740l5ysxj';
const CLE_DES_FICHES = 'trone::mnd_fiches_de_procedure';
/* LE BROUILLON D'EXEMPLE. Le code ne porte plus aucune fiche (elles vivent en
   base) : le banc pose la sienne, courte, avec ses origines, une seconde case
   chiffrée venue d'une notice, et trois points signalés. */
const ligneDuBanc = (id, texte, plus = {}) => ({ id, texte, source: 'maison', ...plus });
const BROUILLON_DU_BANC = {
  serviceId: SOWA, titre: 'Rituel Sówà™ · Rituel anti-poux Maison MND', brouillonLe: le, brouillonPar: 'Recherche du banc',
  brouillon: {
    objectif: [ligneDuBanc('ob-1', 'Éliminer les poux des locks.', { source: 'catalogue' })],
    public: [ligneDuBanc('pu-1', 'À partir de 6 mois.', { source: 'notice', ref: 'Fabricant · exemple.test/notice' })],
    produits: [
      ligneDuBanc('pr-1', 'Pouxit XF, lotion. Pouxit seul.', { source: 'notice', detail: 'Pouxit XF lotion', ref: 'Fabricant · exemple.test/notice' }),
      ligneDuBanc('pr-2', 'Produit du lavage.', { aValider: 'À inscrire.' }),
    ],
    arrivee: [ligneDuBanc('ar-1', 'Examiner le cuir chevelu.', { source: 'catalogue' })],
    etapes: [
      ligneDuBanc('et-1', 'Appliquer lock par lock.', { source: 'notice' }),
      ligneDuBanc('et-2', 'Laisser agir.', { source: 'notice', detail: '15 minutes' }),
      ligneDuBanc('et-3', 'Pour un enfant : la Couronne Cocon.', { aValider: 'Sa forme : à décrire.' }),
    ],
    conseils: [
      ligneDuBanc('co-1', 'Revenir à J+7 ; le soin DÀNDÀN™ est recommandé.'),
      ligneDuBanc('co-2', 'Conseils à la maison.', { aValider: 'À écrire.' }),
    ],
    suivi: [ligneDuBanc('su-1', 'Offert : le contrôle à J+7.')],
  },
};
const session = (role, nom) => ({
  [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
    user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
  [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
  [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: nom, role, rubrics: [] } },
});
const MAISON = {
  'trone::mnd_catalog_categories': [
    { id: 'cat-soins', code: 'ATL·II·SOI', fon: 'LES SOINS', label: 'Hydrater, purifier, reconstruire', maison: 'atelier', enabled: true, order: 5 },
  ],
  'trone::mnd_catalog_services': [
    { id: SOWA, categoryId: 'cat-soins', name: 'Rituel Sówà™', palier: 'Fondation', priceXof: 17000, durationMin: 60, hidePrice: false, priceMode: 'fixe', sessions: 1, order: 1, sansRemise: true, master: 'Team',
      description: 'Rituel Sówà™ : en finir avec les poux.\nUn soin pensé pour éliminer les poux de vos locks, avec discrétion et sans jugement.\n\nVous en retirez : un cuir chevelu traité.\n\nÀ choisir quand : vous avez des démangeaisons.' },
    { id: 'sv-plt-10-m', code: 'PLT·10·M', categoryId: 'cat-soins', name: 'DÀNDÀN™ · L’hydratation aux sept huiles', palier: 'Fondation', priceXof: 22000, durationMin: 60, hidePrice: false, priceMode: 'fixe', sessions: 1, order: 2, master: 'Team',
      description: 'DÀNDÀN™ : l’hydratation aux sept huiles.\nUn soin pensé pour nourrir vos locks en profondeur.\n\nVous en retirez : des locks souples, hydratées et nourries.\n\nÀ choisir quand : vos cheveux sont secs.' },
  ],
  'trone::mnd_clients': [
    { id: 'cl-banc-1', branchId: 'maison', name: 'Sènami E.', phone: '0100000071', city: '', persona: '', since: '2026-01-10', segments: [] },
    { id: 'cl-banc-2', branchId: 'maison', name: 'Awa K.', phone: '0100000072', city: '', persona: '', since: '2026-01-10', segments: [] },
  ],
  'trone::mnd_appointments': [
    { id: 'r-sowa', branchId: 'maison', clientId: 'cl-banc-1', serviceIds: [SOWA], date: AUJ, time: '10:00', status: 'confirmé', master: 'Team', priceXof: 17000 },
    { id: 'r-dandan', branchId: 'maison', clientId: 'cl-banc-2', serviceIds: ['sv-plt-10-m'], date: AUJ, time: '14:00', status: 'confirmé', master: 'Team', priceXof: 22000 },
  ],
};

const seme = (objets, retire = []) => evalue(`(() => {
  localStorage.setItem('mnd_reset_v5', '1');
  for (const k of ${JSON.stringify(retire)}) localStorage.removeItem(k);
  for (const [k, v] of Object.entries(${JSON.stringify(objets)})) localStorage.setItem(k, JSON.stringify(v));
  return true;
})()`);
const va = async (hash) => { await evalue(`location.hash = ${JSON.stringify(hash)}; location.reload(); true`); await attend(8000); };
const lis = (cle) => evalue(`JSON.parse(localStorage.getItem(${JSON.stringify(cle)}) || 'null')`);
const compte = (sel) => evalue(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const texte = (sel) => evalue(`(document.querySelector(${JSON.stringify(sel)})?.textContent || '').replace(/\\s+/g, ' ').trim()`);
const textes = (sel) => evalue(`[...document.querySelectorAll(${JSON.stringify(sel)})].map((x) => x.textContent.replace(/\\s+/g, ' ').trim())`);
/** Clique le DERNIER bouton visible qui commence par ce texte (la fenêtre du dessus est posée après). */
const clique = (sel, debut) => evalue(`(() => {
  const b = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((x) => x.textContent.replace(/\\s+/g, ' ').trim().startsWith(${JSON.stringify(debut)}) && !x.disabled && x.offsetParent !== null).pop();
  if (!b) return false; b.click(); return true;
})()`);
const ouvreLeRdv = async (nom) => {
  const ok = await evalue(`(() => { const r = [...document.querySelectorAll('.trc-cal__appt, .trc-agenda__row')].find((x) => x.textContent.includes(${JSON.stringify(nom)})); if (r) r.click(); return !!r; })()`);
  await attend(1200);
  return ok;
};
const TITRES = ['Objectif', 'Public', 'Produits et références', 'Vérifications à l’arrivée', 'Étapes et temps de pose validés', 'Conseils après le soin', 'Inclusions et suivi'];
const titresDeLaFiche = () => evalue(`[...[...document.querySelectorAll('.mnd-modal')].pop().querySelectorAll('.tfp-rubrique__titre')].map((h) => (h.childNodes[0]?.textContent || '').trim())`);

let ficheValidee = null;
try {
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);

  /* ══ EN DIRECTION ══════════════════════════════════════════════════ */
  await seme({ ...session('souverain', 'Direction du banc'), ...MAISON, [CLE_DES_FICHES]: { [SOWA]: BROUILLON_DU_BANC } });
  await va('#/catalogue');
  dit('direction : le Catalogue offre « Les fiches de procédure »', await clique('button', 'Les fiches de procédure'));
  await attend(900);
  dit('… la fenêtre s’ouvre', (await texte('.mnd-modal__title')) === 'Les fiches de procédure.', await texte('.mnd-modal__title'));
  const liste = await textes('.tfp-soin');
  dit('le Rituel Sówà™ y est en brouillon', liste.some((l) => l.startsWith('Rituel Sówà™') && l.endsWith('brouillon')), liste.join(' | '));
  dit('un soin sans fiche est « à écrire »', liste.some((l) => l.startsWith('DÀNDÀN™') && l.endsWith('à écrire')), liste.join(' | '));
  await photo('1-la-liste');
  dit('la fiche Sówà s’ouvre', await clique('.tfp-soin', 'Rituel Sówà™'));
  await attend(700);
  dit('sept rubriques, dans l’ordre', JSON.stringify(await titresDeLaFiche()) === JSON.stringify(TITRES), JSON.stringify(await titresDeLaFiche()));
  dit('reliée à la prestation du catalogue', (await texte('.tfp-entete__lien')).startsWith('Reliée à la prestation : Rituel Sówà™'), await texte('.tfp-entete__lien'));
  dit('en brouillon : l’équipe ne la voit pas encore', (await texte('.tfp-entete__version')) === 'Brouillon : l’équipe ne le voit pas encore.', await texte('.tfp-entete__version'));
  const signalees = await compte('.tfp-saisie.est-a-valider');
  dit('ses trois points à valider sont signalés', signalees === 3, signalees);
  dit('chaque ligne dit d’où elle vient', (await evalue(`[...document.querySelectorAll('.tfp-origine')].map((x) => x.textContent)`)).includes('notice du fabricant')
    && (await compte('.tfp-origine')) === 11, await compte('.tfp-origine'));
  dit('le temps de pose de la notice se lit dans sa case', await evalue(`[...document.querySelectorAll('.tfp-saisie__detail')].some((i) => i.value === '15 minutes')`));
  await photo('2-la-fiche-sowa-a-corriger');
  dit('« Lire le brouillon » montre la fiche comme l’équipe la lira', await clique('.mnd-seg', 'Lire le brouillon'));
  await attend(400);
  dit('… ses points « à valider » y sont écrits', (await compte('.tfp-avalider')) === signalees, await compte('.tfp-avalider'));
  await photo('3-la-fiche-sowa-a-lire');

  dit('« Valider cette version » pose la question', await clique('.tfp-pied button', 'Valider cette version'));
  await attend(600);
  dit('… qui dit ce que cela change', /Valider la fiche « Rituel Sówà™ · Rituel anti-poux Maison MND » \?/.test(await texte('.mnd-dem__titre'))
    && /version 1/.test(await texte('.mnd-dem__dit')) && /à valider/.test(await texte('.mnd-dem__suite')), `${await texte('.mnd-dem__titre')} / ${await texte('.mnd-dem__suite')}`);
  await photo('4-la-question');
  dit('… on valide', await clique('.mnd-dem__b--fait', 'Valider cette version'));
  await attend(900);
  const doc = await lis(CLE_DES_FICHES);
  ficheValidee = doc?.[SOWA] ?? null;
  /* Chaque poste garde ce document en mémoire : une fiche validée, brouillon inchangé, se garde une seule fois. */
  dit('la fiche validée se garde sans brouillon', !!ficheValidee && !('brouillon' in ficheValidee) && ficheValidee.validee?.contenu?.etapes?.length === 3,
    ficheValidee ? Object.keys(ficheValidee).join(',') : 'absente');
  dit('la version 1 est signée du nom de la direction', ficheValidee?.validee?.numero === 1 && ficheValidee?.validee?.par === 'Direction du banc' && !!ficheValidee?.validee?.le,
    JSON.stringify({ numero: ficheValidee?.validee?.numero, par: ficheValidee?.validee?.par }));
  dit('la liste la dit validée', (await textes('.tfp-soin')).some((l) => l.startsWith('Rituel Sówà™') && l.endsWith('validée')), (await textes('.tfp-soin')).join(' | '));
  dit('l’en-tête dit qui a validé', /^Version 1, validée le .* par Direction du banc\. C’est elle que lit l’équipe\.$/.test(await texte('.tfp-entete__version')), await texte('.tfp-entete__version'));

  dit('un soin sans fiche s’ouvre', await clique('.tfp-soin', 'DÀNDÀN™'));
  await attend(700);
  dit('… au même format', JSON.stringify(await titresDeLaFiche()) === JSON.stringify(TITRES), JSON.stringify(await titresDeLaFiche()));
  dit('… rempli de ce que le catalogue dit, tout signalé', (await evalue(`[...document.querySelectorAll('.tfp-saisie textarea')].some((t) => t.value === 'Des locks souples, hydratées et nourries.')`))
    && (await compte('.tfp-saisie.est-a-valider')) >= 7, await compte('.tfp-saisie.est-a-valider'));
  dit('… et rien ne s’écrit tant qu’on n’enregistre pas', !(await lis(CLE_DES_FICHES))?.['sv-plt-10-m']);
  await photo('5-un-soin-a-ecrire');

  await va('#/calendrier');
  dit('direction : le rendez-vous Sówà s’ouvre', await ouvreLeRdv('Sènami'));
  dit('il porte « Voir le protocole »', (await texte('.tfp-voir b')) === 'Voir le protocole', await texte('.tfp-voir'));
  await photo('6-le-rendez-vous');
  const barreAvant = await texte('.trc-rdv3__barre-texte');
  dit('le bouton ouvre la fiche', await clique('.tfp-voir', 'Voir le protocole'));
  await attend(700);
  dit('… PAR-DESSUS le rendez-vous : deux fenêtres', (await compte('.mnd-modal')) === 2 && (await compte('.trc-rdv3__barre')) === 1, await compte('.mnd-modal'));
  dit('… « Le protocole. », ses sept rubriques', (await textes('.mnd-modal__title')).pop() === 'Le protocole.' && JSON.stringify(await titresDeLaFiche()) === JSON.stringify(TITRES));
  dit('… signée', /^Version 1, validée le .* par Direction du banc$/.test(await texte('.mnd-modal .tfp-entete__version')), await texte('.mnd-modal .tfp-entete__version'));
  await photo('7-le-protocole');
  dit('« Revenir au rendez-vous » ne ferme que la fiche', await clique('.tfp-pied button', 'Revenir au rendez-vous'));
  await attend(500);
  dit('… le rendez-vous est toujours là, tel quel', (await compte('.mnd-modal')) === 1 && (await texte('.trc-rdv3__barre-texte')) === barreAvant, await texte('.trc-rdv3__barre-texte'));

  /* ══ DANS L'ÉQUIPE ═════════════════════════════════════════════════ */
  /* Tant que la fiche est en brouillon : aucun bouton. */
  await seme({ ...session('maitre', 'Maître du banc'), [CLE_DES_FICHES]: { [SOWA]: BROUILLON_DU_BANC } });
  await va('#/calendrier');
  dit('équipe : le rendez-vous Sówà s’ouvre', await ouvreLeRdv('Sènami'));
  dit('fiche en brouillon : pas de bouton, l’équipe ne lit pas un brouillon', (await compte('.tfp-voir')) === 0 && (await compte('.trc-rdv3__barre')) === 1);

  /* Une fois validée (la version que la direction vient de signer). */
  await seme({ [CLE_DES_FICHES]: { [SOWA]: ficheValidee } });
  await va('#/calendrier');
  dit('équipe : le rendez-vous d’un soin sans fiche s’ouvre', await ouvreLeRdv('Awa'));
  dit('… sans bouton', (await compte('.tfp-voir')) === 0 && (await compte('.trc-rdv3__barre')) === 1);
  await va('#/calendrier');
  dit('équipe : le rendez-vous Sówà s’ouvre', await ouvreLeRdv('Sènami'));
  dit('fiche validée : « Voir le protocole » paraît', /^Voir le protocole/.test(await texte('.tfp-voir')), await texte('.tfp-voir'));
  dit('… et dit ce qui reste à valider', /Rituel Sówà™ · \d+ points à valider$/.test(await texte('.tfp-voir small')), await texte('.tfp-voir small'));
  dit('la fiche s’ouvre par-dessus', (await clique('.tfp-voir', 'Voir le protocole')) && (await attend(700), true) && (await compte('.mnd-modal')) === 2);
  dit('… signée, sans brouillon ni « Valider »', /^Version 1, validée le /.test(await texte('.mnd-modal .tfp-entete__version'))
    && (await compte('.tfp-bandeau--brouillon')) === 0 && !(await evalue(`[...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Valider cette version')`)));
  dit('… le produit, son temps de pose et la suite se lisent', await evalue(`(() => { const t = [...document.querySelectorAll('.mnd-modal')].pop().innerText; return t.includes('Pouxit seul') && t.includes('15 minutes') && t.includes('J+7') && t.includes('Couronne Cocon') && t.includes('DÀNDÀN™'); })()`));
  await photo('8-equipe-le-protocole');

  /* Au téléphone. */
  await taille(390, 844, true);
  await attend(700);
  const deborde = await evalue(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  const debordeLaFiche = await evalue(`(() => { const m = [...document.querySelectorAll('.mnd-modal')].pop(); return m ? m.scrollWidth - m.clientWidth : 0; })()`);
  dit('au téléphone, rien ne déborde', deborde <= 0 && debordeLaFiche <= 0, `${deborde} / ${debordeLaFiche}`);
  await photo('9-equipe-au-telephone');

  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');
} finally {
  ws.close();
  chrome.kill();
  serveur.close();
  await attend(400);
  rmSync(construit, { recursive: true, force: true });
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore son profil */ }
}
console.log(ko ? `\n${ko} échec(s).` : '\nLes fiches de procédure tiennent à l’écran.');
process.exit(ko ? 1 : 0);
