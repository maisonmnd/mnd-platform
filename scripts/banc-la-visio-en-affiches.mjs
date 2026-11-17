/* LA PAGE DE LA VISIO, À L'ÉCRAN — `node scripts/banc-la-visio-en-affiches.mjs [dossier construit]`.

   17 novembre 2026 (« La consultation en affiches ») : le billet, « Changer
   l'heure », le bilan ouvert et les affiches de la suite. Ce banc ouvre la
   VRAIE page de la visio de Ma Couronne dans Chrome, devant une fausse
   fonction `visio-salle` (port 47131), et fait les gestes d'une cliente :
     - LE BILLET montre l'heure et « Changer l'heure », jamais « Entrer dans
       la salle » : le lien d'entrée est sur son WhatsApp ;
     - « Changer l'heure » puis « Garder mon heure » : rien ne change, rien
       n'est demandé à la fonction, la page ne dit pas « Heure changée » ;
     - « Votre moment » : quatre jours, « Plus de dates » ouvre le calendrier ;
       une heure choisie puis « Changer l'heure » : un seul appel `deplacer`,
       et alors seulement « Heure changée » ;
     - APRÈS LA VISIO : le bilan remis par la Maison, puis « Votre rituel »
       (sa réservation déjà remplie) et « Consultation privée » ; sans locks
       encore, « devant vos cheveux » et « déduits de votre création » ;
     - de 320 à 412 px de large, les affiches tiennent dans l'écran, aucun
       mot ne déborde, aucun prix ne se coupe sur deux lignes ;
     - la page dit une fois qu'elle a vu la suite.
   Les prénoms, les prestations et les montants sont inventés.

   Sans dossier, le banc construit Ma Couronne lui-même (sous Node). */
import { createServer } from 'node:http';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const PORT = 47131;
let construit = process.argv.slice(2).find((a) => !a.startsWith('--'));
let aEffacer = null;
if (!construit) {
  construit = mkdtempSync(path.join(tmpdir(), 'banc-visio-'));
  aEffacer = construit;
  console.log('Construction de Ma Couronne (fausse fonction sur le port du banc)…');
  execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
    cwd: racine, stdio: 'ignore',
    env: { ...process.env, VITE_APPS: 'couronne', VITE_SUPABASE_URL: `http://127.0.0.1:${PORT}`, VITE_SUPABASE_ANON_KEY: 'faux', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
  });
}
if (!existsSync(path.join(construit, 'couronne.html'))) { console.error(`Pas de Ma Couronne construite dans ${construit}.`); process.exit(2); }

/* ── LA FAUSSE FONCTION ───────────────────────────────────────────────── */
const H = 3_600_000; const JOUR = 24 * H;
const quart = (ms) => new Date(Math.floor(ms / (15 * 60_000)) * 15 * 60_000).toISOString();
const J = 'A'.repeat(16) + 'b_c-'.repeat(4);
const RESUME = {
  niveau: 'douce', longueur: 'mi-longue', privee: true, estimationXof: 145000, mot: 'Vos racines sont saines : un rituel suffit pour reprendre.',
  rituel: { besoin: 'entretien', serviceIds: ['sv-a', 'sv-b'], noms: ['Le Shampoing rituel', 'L’Hydratation profonde'] },
};
const visios = {
  'vz-attente00001': { debut: quart(Date.now() + 3 * JOUR), statut: 'réservée', billet: true, reste: 2 },
  'vz-fermee000001': { debut: quart(Date.now() - 2 * H), statut: 'tenue', billet: false, reste: 2, resume: RESUME, sansLocks: false },
  'vz-sanslocks001': { debut: quart(Date.now() - 2 * H), statut: 'tenue', billet: true, reste: 2, resume: { niveau: 'aucune', privee: true }, sansLocks: true },
};
const fin = (debut) => new Date(Date.parse(debut) + 15 * 60_000).toISOString();
const creneaux = [];
for (let j = 1; j <= 12; j++) for (const h of [9, 9.25, 9.5]) { const d = quart(Math.floor(Date.now() / JOUR) * JOUR + j * JOUR + h * H); creneaux.push({ debut: d, fin: fin(d) }); }
const appels = [];
const serveur = createServer((req, res) => {
  const entetes = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, entetes); res.end(); return; }
  const chemin = new URL(req.url, 'http://x').pathname;
  if (chemin === '/functions/v1/visio-salle') {
    let brut = '';
    req.on('data', (c) => { brut += c; });
    req.on('end', () => {
      const c = JSON.parse(brut || '{}');
      appels.push(c);
      const v = visios[c.id];
      const rend = (code, corps) => { res.writeHead(code, { ...entetes, 'content-type': 'application/json' }); res.end(JSON.stringify({ maintenant: new Date().toISOString(), ...corps })); };
      if (c.geste === 'creneaux') return rend(200, { ok: true, actif: true, creneaux });
      if (!v || c.jeton !== J) return rend(404, { ok: false, motif: 'inconnue' });
      if (c.geste === 'etat') {
        return rend(200, {
          ok: true, debut: v.debut, fin: fin(v.debut), statut: v.statut, prenom: 'Awa', consultationId: 'cg-1', actif: true, billet: v.billet,
          resume: v.resume ?? null, sansLocks: v.sansLocks === true,
          changement: { permis: v.statut === 'réservée' && v.reste > 0, reste: v.reste, max: 2, avantMin: 120 },
        });
      }
      if (c.geste === 'deplacer') { v.debut = c.debut; v.reste -= 1; return rend(200, { ok: true, debut: v.debut, fin: fin(v.debut), deplacements: 2 - v.reste, reste: v.reste, parWhatsApp: true }); }
      if (c.geste === 'suite-vue') return rend(200, { ok: true, retires: 1 });
      return rend(400, { ok: false, motif: 'geste inconnu' });
    });
    return;
  }
  if (chemin.startsWith('/rest/') || chemin.startsWith('/auth/') || chemin.startsWith('/realtime/') || chemin.startsWith('/functions/')) {
    res.writeHead(200, { ...entetes, 'content-type': 'application/json' }); res.end('[]'); return;
  }
  let f = path.join(construit, decodeURIComponent(chemin));
  if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404, entetes); res.end(); return; }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(PORT, '127.0.0.1', r));

/* ── CHROME ───────────────────────────────────────────────────────────── */
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-vz-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));
let cible;
for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
if (!cible) { console.error('Chrome ne repond pas.'); chrome.kill(); process.exit(2); }
const ws = new WebSocket(cible.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const enCours = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && enCours.has(m.id)) { enCours.get(m.id)(m); enCours.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; enCours.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evalue = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;
await cdp('Runtime.enable');
const ecran = (largeur) => cdp('Emulation.setDeviceMetricsOverride', { width: largeur, height: 844, deviceScaleFactor: 2, mobile: true });
const ouvre = async (visio) => {
  await cdp('Page.navigate', { url: 'about:blank' });
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/couronne.html#/visio/${visio}.${J}` });
  for (let i = 0; i < 40; i++) { await attend(250); if (await evalue(`!!document.querySelector('.mv-titre') && !document.body.innerText.includes('se prépare')`)) break; }
  await evalue('document.fonts.ready.then(() => true)');
  await attend(300);
};
const texte = () => evalue('document.body.innerText');
const clique = (mot) => evalue(`(() => { const b = [...document.querySelectorAll('button, a')].find((x) => x.textContent.trim() === ${JSON.stringify(mot)}); if (!b) return false; b.click(); return true; })()`);

let ko = 0; let n = 0;
const dit = (nom, ok, detail) => { n++; if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${!ok && detail !== undefined ? ' -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };

try {
  /* 1. Le billet. */
  await ecran(390);
  await ouvre('vz-attente00001');
  let t = await texte();
  dit('le billet montre l heure de la visio', /\d{4} · \d\d:\d\d/.test(t), t.slice(0, 200));
  dit('... il ne propose pas d entrer dans la salle : le lien est sur son WhatsApp', !t.includes('Entrer dans la salle') && t.includes('Votre lien d’entrée est sur votre WhatsApp.'), t.slice(0, 300));
  dit('... il propose « Changer l’heure », et dit la regle', t.includes('Changer l’heure') && t.includes('Jusqu’à 2 h avant, 2 fois au plus.'), t.slice(0, 400));
  const heureAvant = await evalue(`document.querySelector('.mv-titre').textContent`);

  /* 2. Revenir sans valider ne change rien. */
  await clique('Changer l’heure');
  await attend(900);
  t = await texte();
  dit('« Votre moment » : quatre jours et « Plus de dates »', t.includes('Votre moment') && (await evalue(`document.querySelectorAll('.mv-puces')[0].querySelectorAll('.mv-puce:not(.mv-puce--plus)').length`)) === 4 && t.includes('Plus de dates'), t.slice(0, 300));
  await evalue(`document.querySelectorAll('.mv-puces')[0].querySelector('.mv-puce').click()`);
  await attend(200);
  await evalue(`document.querySelectorAll('.mv-puces')[1].querySelector('.mv-puce').click()`);
  await attend(200);
  await clique('Garder mon heure');
  await attend(500);
  t = await texte();
  dit('« Garder mon heure » : la meme heure, pas de « Heure changée », aucun appel a deplacer',
    (await evalue(`document.querySelector('.mv-titre').textContent`)) === heureAvant && !t.includes('Heure changée') && !appels.some((a) => a.geste === 'deplacer'), t.slice(0, 200));

  /* 3. Le calendrier, puis le changement confirmé. */
  await clique('Changer l’heure');
  await attend(900);
  await clique('Plus de dates');
  await attend(300);
  dit('« Plus de dates » ouvre le calendrier du mois', (await evalue(`!!document.querySelector('.mv-cal') && document.querySelectorAll('.mv-cal__c:not(:disabled)').length > 0`)) === true);
  await evalue(`[...document.querySelectorAll('.mv-cal__c:not(:disabled)')].at(-1).click()`);
  await attend(300);
  dit('un jour du calendrier devient une puce de plus, ses heures dessous', (await evalue(`document.querySelectorAll('.mv-puces')[0].querySelectorAll('.mv-puce[aria-pressed="true"]').length === 1 && document.querySelectorAll('.mv-puces')[1].querySelectorAll('.mv-puce').length === 3`)) === true);
  await evalue(`document.querySelectorAll('.mv-puces')[1].querySelectorAll('.mv-puce')[1].click()`);
  await attend(200);
  await evalue(`[...document.querySelectorAll('.mv-rangee .mv-bouton')].find((b) => b.textContent.trim() === 'Changer l’heure').click()`);
  await attend(1500);
  t = await texte();
  const deplaces = appels.filter((a) => a.geste === 'deplacer');
  dit('« Changer l’heure » confirme : un seul appel, la nouvelle heure, et alors seulement « Heure changée »',
    deplaces.length === 1 && t.includes('Heure changée. Elle arrive sur votre WhatsApp.') && (await evalue(`document.querySelector('.mv-titre').textContent`)) !== heureAvant, { deplaces: deplaces.length, t: t.slice(0, 200) });

  /* 4. Après la visio : le bilan, les affiches. */
  await ouvre('vz-fermee000001');
  t = await texte();
  dit('la visio terminee : « Votre bilan », remis par la Maison', t.includes('Votre bilan') && /remis par la maison/i.test(t) && t.includes('Réparation douce'), t.slice(0, 300));
  const liens = await evalue(`[...document.querySelectorAll('.mv-aff')].map((a) => a.getAttribute('href'))`);
  dit('deux affiches : « Votre rituel » deja rempli, « Consultation privée »', JSON.stringify(liens) === JSON.stringify(['/reserver/?r=entretien.sv-a~sv-b', '/consultation/?privee=cg-1']), liens);
  dit('... avec des locks : « devant vos locks », « déduits de votre rituel »', /devant vos locks/i.test(t) && /déduits de votre rituel/i.test(t) && !/cheveux|création/i.test(t), t.slice(0, 600));
  dit('... le rituel porte ses prestations et le nombre que le maitre a ecrit', t.includes('Le Shampoing rituel + L’Hydratation profonde') && /145.000/.test(t), t.slice(0, 600));
  dit('la page dit une fois qu elle a vu la suite', appels.filter((a) => a.geste === 'suite-vue' && a.id === 'vz-fermee000001').length === 1);

  /* 5. De 320 à 412 px : rien ne déborde, aucun prix coupé. */
  const MESURE = `(() => {
    const vw = document.documentElement.clientWidth;
    const lignes = (e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight));
    return {
      vw, deborde: document.documentElement.scrollWidth > vw + 1,
      affiches: [...document.querySelectorAll('.mv-aff')].map((a) => { const r = a.getBoundingClientRect(); return r.left >= 0 && r.right <= vw + 0.5; }),
      mots: [...document.querySelectorAll('.mv-aff__nom, .mv-aff__ligne, .mv-aff__chiffre, .mv-resume dd')].map((e) => e.scrollWidth - e.clientWidth),
      noms: [...document.querySelectorAll('.mv-aff__nom')].map((e) => lignes(e) <= e.textContent.trim().split(/\\s+/).length),
      prix: [...document.querySelectorAll('.mv-prix')].map((e) => e.getClientRects().length),
    };
  })()`;
  for (const largeur of [320, 360, 390, 412]) {
    await ecran(largeur);
    for (const visio of ['vz-fermee000001', 'vz-sanslocks001']) {
      await ouvre(visio);
      const m = await evalue(MESURE);
      dit(`a ${largeur} px (${visio === 'vz-fermee000001' ? 'deux affiches' : 'sans locks'}) : les affiches tiennent, aucun mot ne deborde ni ne se coupe, aucun prix sur deux lignes`,
        !!m && !m.deborde && m.affiches.length >= 1 && m.affiches.every(Boolean) && m.mots.every((x) => x <= 1) && m.noms.every(Boolean) && m.prix.length >= 1 && m.prix.every((x) => x === 1), m);
    }
  }

  /* 6. Sans locks encore. */
  t = await texte();
  dit('sans locks encore : « devant vos cheveux », « déduits de votre création », la privee seule', /devant vos cheveux/i.test(t) && /déduits de votre création/i.test(t) && !/devant vos locks|de votre rituel/i.test(t)
    && (await evalue(`document.querySelectorAll('.mv-aff').length`)) === 1, t.slice(0, 500));
} finally {
  chrome.kill();
  serveur.close();
  await attend(400);
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* Chrome tient encore son profil */ }
  if (aEffacer) try { rmSync(aEffacer, { recursive: true, force: true }); } catch { /* rien */ }
}
console.log(`\n${n - ko} sur ${n}.`);
console.log(ko ? 'ECHEC : la page de la visio ne tient pas.' : 'TOUT VA BIEN : la page de la visio tient, du billet aux affiches.');
process.exit(ko ? 1 : 0);
