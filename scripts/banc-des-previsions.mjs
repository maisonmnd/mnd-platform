/* LE BANC DES PRÉVISIONS — `node scripts/banc-des-previsions.mjs [capture]`.

   26 octobre 2026 : la rubrique « Les prévisions » (maquette 1opRHqoV…).
   Le harnais éprouve les règles (`verifie-les-previsions`) ; ce banc ouvre le
   VRAI Trône, Supabase injoignable, sur une session gardée de la direction,
   sème six mois de rendez-vous, des relances « reprise proposée » et des
   endormies, puis lit l'écran comme Yéman le lirait :

     - la rubrique est en Direction, juste sous le Centre de commande ;
     - les trois chiffres de l'en-tête sont les totaux des trois tableaux, et
       chaque tableau se recompose ligne à ligne ;
     - la relance est MESURÉE sur les envois semés (25 partis, 10 revenues :
       40 %), le réveil est « à mesurer » (aucune campagne) et compte zéro ;
     - les trois horizons redessinent les colonnes ; « 12 derniers mois »
       montre chaque mois entier, prévu au 1er et venu, l'écart recomposé ;
     - « Préparer la campagne des dormantes » ouvre le Marketing sur une
       campagne adressée, sans rien envoyer ;
     - au téléphone, rien ne déborde.

   Les fiches sont des exemples, signées d'initiales. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync, renameSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const racine = path.resolve(import.meta.dirname, '..');
const capture = process.argv[2] || '';
const construit = mkdtempSync(path.join(tmpdir(), 'banc-prev-'));
console.log('Construction du Trone (serveur injoignable)...');
execSync(`npx vite build --outDir "${construit}" --emptyOutDir`, {
  cwd: racine, stdio: 'ignore',
  env: { ...process.env, VITE_APPS: 'trone', VITE_SUPABASE_URL: 'http://127.0.0.1:9', VITE_SUPABASE_ANON_KEY: 'faux', VITE_REQUIRE_AUTH: 'true', VITE_BUILD_ID: 'banc', VITE_BASE: '/' },
});
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
const profil = mkdtempSync(path.join(tmpdir(), 'banc-prev-chrome-'));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${profil}`, `--remote-debugging-port=${dbg}`, 'about:blank'], { stdio: 'ignore' });
const attend = (ms) => new Promise((r) => setTimeout(r, ms));

let ko = 0;
try {
  let cible;
  for (let i = 0; i < 50 && !cible; i++) { await attend(300); try { cible = (await (await fetch(`http://127.0.0.1:${dbg}/json`)).json()).find((t) => t.type === 'page'); } catch { /* pas encore */ } }
  if (!cible) throw new Error('Chrome ne repond pas.');
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
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1000, deviceScaleFactor: 1, mobile: false });
  const dit = (nom, ok, detail) => { if (!ok) ko++; console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + String(detail).slice(0, 260) : ''}`); };
  const photo = async (etape) => {
    if (!capture) return;
    const img = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };
  const texte = () => evalue('document.body.innerText');
  const jusqua = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
  const clique = (selecteur, mot) => evalue(`(() => {
    const b = [...document.querySelectorAll(${JSON.stringify(selecteur)})].find((x) => x.offsetParent !== null && x.innerText.trim().replace(/\\s+/g, ' ').toLowerCase().startsWith(${JSON.stringify(mot.toLowerCase())}));
    if (b) b.click();
    return !!b;
  })()`);
  const tombe = async () => /Unexpected Application Error|Cet écran ne s.est pas ouvert|Unexpected error/i.test(await texte());
  /* Un nombre tel que l'écran l'écrit : « 12,4 », « +9 », « 1 040 ». */
  const nombre = (t) => Number(String(t ?? '').replace(/[^\d,.-]/g, '').replace(',', '.'));
  /* Les tableaux : [titre, [[cellules]...]] ; la dernière ligne est le total. */
  const tableaux = () => evalue(String.raw`[...document.querySelectorAll('.trp-prev__calcul')].map((c) => [
    c.querySelector('h3')?.innerText.replace(/\s+/g, ' ').trim(),
    [...c.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.replace(/\s+/g, ' ').trim())),
  ])`);
  const chiffres = () => evalue(String.raw`[...document.querySelectorAll('.trp-prev__chiffre b')].map((b) => b.innerText.trim())`);
  const colonnes = () => evalue(String.raw`[...document.querySelectorAll('.trp-prev__graphe > g')].filter((g) => g.querySelector('rect')).map((g) => g.lastElementChild.textContent)`);

  /* La session gardée, et le vécu d'exemple. */
  const UID = 'u-banc-prev';
  const CLE = 'sb-127-auth-token';
  const le = new Date(Date.now() - 86_400_000).toISOString();
  const date = (n) => { const d = new Date(Date.now() + n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const instant = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
  const jourDeSemaine = (n) => new Date(Date.now() + n * 86_400_000).getDay();
  const fiche = (id, name, extra) => ({ id, branchId: 'maison', name, phone: `+229 01 51 00 ${String(id.length).padStart(2, '0')} ${String(Math.abs(id.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7)) % 100).padStart(2, '0')}`, city: '', persona: '', since: '2025-01-10', photo: null, segments: [], priceCoef: 1, loyaltyPoints: 0, diaspora: false, ...extra });
  const clients = [];
  const rdvs = [];
  const envois = [];
  let n = 0;
  const rdv = (clientId, j, status, extra = {}) => rdvs.push({ id: `rdv-${++n}`, branchId: 'maison', clientId, serviceIds: [], date: date(j), time: '10:00', status, master: '', ...extra });
  /* Quarante habituées : six mois de jours ouverts, trois à six rendez-vous par jour. */
  for (let i = 0; i < 40; i++) clients.push(fiche(`h${i}`, `H. ${i}`));
  for (let j = -182; j <= -1; j++) {
    const s = jourDeSemaine(j);
    if (s < 2 || s > 6) continue;
    const combien = 3 + (Math.abs(j) % 4);
    for (let k = 0; k < combien; k++) rdv(`h${(Math.abs(j) * 3 + k) % 40}`, j, (Math.abs(j) + k) % 13 === 0 ? 'annulé' : 'honoré');
  }
  /* Vingt-cinq relancées : deux venues, la reprise proposée il y a trente
     jours ; dix ont pris rendez-vous deux jours après. */
  for (let i = 0; i < 25; i++) {
    clients.push(fiche(`r${i}`, `R. ${i}`));
    rdv(`r${i}`, -90, 'honoré'); rdv(`r${i}`, -60, 'honoré');
    envois.push({ id: `rep-r${i}`, branchId: 'maison', type: 'reprise-j3', canal: 'whatsapp', apptId: `x-r${i}`, clientId: `r${i}`, dateRdv: date(-27), statut: 'envoyé', etat: 'remis', quand: instant(-30) });
    if (i < 10) rdv(`r${i}`, -20, 'honoré', { creeLe: instant(-28) });
  }
  /* Dix endormies : deux venues, la dernière il y a plus de sept mois. */
  for (let i = 0; i < 10; i++) { clients.push(fiche(`d${i}`, `D. ${i}`)); rdv(`d${i}`, -260, 'honoré'); rdv(`d${i}`, -225, 'honoré'); }
  /* Ce qui est posé : huit rendez-vous dans les trois semaines, un annulé. */
  [2, 2, 3, 8, 9, 10, 15, 16].forEach((j, i) => rdv(`h${i}`, j, 'confirmé'));
  rdv('h9', 4, 'annulé');

  const semence = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) - 7200,
      user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] } },
    'trone::mnd_clients': clients,
    'trone::mnd_appointments': rdvs,
    'trone::mnd_envois': envois,
  };
  await cdp('Page.navigate', { url: `${origine}/` });
  await attend(2500);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(semence)})) localStorage.setItem(k, JSON.stringify(v)); return true; })()`);
  await evalue(`location.hash = '#/previsions'; location.reload(); true`);
  const vu = await jusqua(`document.querySelectorAll('.trp-prev__calcul tbody tr').length > 6`, 40000);

  /* 1. La rubrique. */
  dit('Les prévisions s ouvrent, comme la direction', !!vu && !(await tombe()));
  const barre = await evalue(String.raw`[...document.querySelectorAll('.tr-nav__item')].map((a) => a.textContent.replace(/\s+/g, ' ').trim())`);
  const iCentre = (barre ?? []).findIndex((t) => t.startsWith('Centre de commande'));
  dit('la barre : « Les prévisions » juste sous « Centre de commande », allumée',
    iCentre >= 0 && String(barre[iCentre + 1]).startsWith('Les prévisions')
    && !!(await evalue(String.raw`[...document.querySelectorAll('.tr-nav__item.active')].some((a) => a.textContent.includes('Les prévisions'))`)), JSON.stringify(barre?.slice(Math.max(0, iCentre), iCentre + 2)));
  await photo('1-quatre-semaines');

  /* 2. Les chiffres et les tableaux se recomposent. */
  const [prev, plaf, mk] = await tableaux();
  const [cPrev, cPlaf, cMk] = (await chiffres()).map(nombre);
  const total = (t) => nombre(t[1][t[1].length - 1].at(-1));
  dit('les trois tableaux : la prévision, le plafond, le marketing', /^La prévision/.test(prev?.[0]) && /^Le plafond/.test(plaf?.[0]) && /^Le marketing/.test(mk?.[0]), JSON.stringify([prev?.[0], plaf?.[0], mk?.[0]]));
  dit('l en-tête dit les totaux des trois tableaux', cPrev === total(prev) && cPlaf === total(plaf) && cMk === total(mk), JSON.stringify([cPrev, cPlaf, cMk, total(prev), total(plaf), total(mk)]));
  const lignesPrev = prev[1].slice(0, -1).map((l) => nombre(l.at(-1)));
  dit('la prévision = posés + reprises + nouvelles (à l arrondi près)', lignesPrev.length === 3 && Math.abs(lignesPrev.reduce((s, x) => s + x, 0) - total(prev)) <= 1, JSON.stringify(prev[1]));
  dit('... les posés : 8 non annulés dans les quatre semaines', /^8 × \d+ %/.test(prev[1][0][1]), prev[1][0][1]);
  const joursPlaf = plaf[1].filter((l) => /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)$/i.test(l[0]));
  dit('le plafond = la somme des jours ouverts, jour par jour (jours × plafond)', joursPlaf.length > 0 && joursPlaf.every((l) => { const [a, b] = l[1].split('×').map(nombre); return a * b === nombre(l[2]); })
    && joursPlaf.reduce((s, l) => s + nombre(l[2]), 0) === total(plaf), JSON.stringify(plaf[1]));
  dit('... ce que les fauteuils permettraient est dit pour mémoire', plaf[1].some((l) => /^Ce que les fauteuils permettraient/.test(l[0])));
  const ligne = (debut) => mk[1].find((l) => l[0].startsWith(debut)) ?? [];
  const relance = ligne('Relancer les reprises en retard');
  dit('la relance est MESURÉE sur les envois semés : 40 %, sur 25 reprises proposées', /× 40 %/.test(relance[1] ?? '') && /mesuré sur 25 reprises proposées/.test(relance[1] ?? ''), JSON.stringify(relance));
  const base = nombre((relance[1] ?? '').split('×')[0]);
  dit('... sa base est le nombre de clientes en retard qu elle dit, et son RDV la base × 40 %', new RegExp(`^${base} cliente`).test((relance[0] ?? '').replace('Relancer les reprises en retard ', '')) && Math.abs(nombre(relance[2]) - base * 0.4) < 0.06,
    JSON.stringify(relance));
  dit('le réveil : aucune campagne « Dormantes », il est à mesurer et compte zéro', /à mesurer : 0 tête jointe/.test(ligne('Réveiller les endormies')[1] ?? '') && nombre(ligne('Réveiller les endormies')[2]) === 0
    && /^10 clientes sans venue depuis cinq mois/.test(ligne('Réveiller les endormies')[0].replace('Réveiller les endormies ', '')), JSON.stringify(ligne('Réveiller les endormies')));
  dit('... le parrainage est inclus dans les nouvelles, l offre à mesurer', ligne('Le parrainage')[2] === 'inclus' && /à mesurer/.test(ligne('L’offre du moment')[1] ?? ''));
  const libres = nombre(/places libres : ([\d\s ,]+)/.exec(plaf[1].at(-1)[0])?.[1]);
  const brut = mk[1].slice(0, -1).reduce((s, l) => s + (l[2] === 'inclus' ? 0 : nombre(l[2])), 0);
  dit('à gagner = les leviers, bornés aux places libres', Math.abs(total(mk) - Math.min(brut, libres)) <= 1, JSON.stringify({ brut, libres, total: total(mk) }));

  /* 3. Les horizons. */
  dit('quatre semaines : quatre colonnes', (await colonnes())?.length === 4, JSON.stringify(await colonnes()));
  dit('« 3 mois » se clique', await clique('.trp-prev__horizon button', '3 mois'));
  await attend(500);
  const trois = await colonnes();
  dit('... trois colonnes, les mois nommés', trois?.length === 3 && trois.every((t) => /^[A-ZÉ][a-zéû]+$/.test(t)) && /Les trois prochains mois, mois par mois/.test(await texte()), JSON.stringify(trois));
  const bouton = await evalue(String.raw`document.querySelectorAll('.trp-prev__horizon button')[1]?.innerText.trim()`);
  dit(`« ${bouton} » se clique`, await clique('.trp-prev__horizon button', bouton ?? ''));
  await attend(500);
  dit('... le mois, semaine par semaine', new RegExp(`${bouton} \\d{4}, semaine par semaine`, 'i').test(await texte()) && ((await colonnes())?.length ?? 0) >= 3, JSON.stringify(await colonnes()));
  await photo('2-le-mois');
  /* Et les mois passés : la prévision rejouée au 1er, à côté du venu. */
  dit('« 12 derniers mois » se clique', await clique('.trp-prev__horizon button', '12 derniers mois'));
  await jusqua(`document.querySelectorAll('.trp-prev__passe tbody tr').length === 13`, 20000);
  const [passe] = await tableaux();
  const lignesPasse = passe?.[1] ?? [];
  dit('... douze mois entiers et leur total', lignesPasse.length === 13 && /^Douze mois/.test(lignesPasse[12][0]), JSON.stringify(lignesPasse.map((l) => l[0].split(' ').slice(0, 2).join(' '))));
  dit('... douze barres sous leur plafond, le dessin nommé de bout en bout', ((await colonnes())?.length === 12) && /^De [a-zéû]+ \d{4} à [a-zéû]+ \d{4}$/.test(await evalue(`document.querySelector('.trp-prev__vedette h3')?.innerText`)),
    await evalue(`document.querySelector('.trp-prev__vedette h3')?.innerText`));
  const [venusEnTete] = (await chiffres()).map(nombre);
  dit('... l en-tête dit les venus du tableau', venusEnTete === nombre(lignesPasse[12][2]), JSON.stringify([venusEnTete, lignesPasse[12][2]]));
  /* Un mois dont les posés du 1er ne se savaient pas (avant le 5 septembre
     2026) n'est pas jugé : « sans les posés », écart « non jugé ». */
  const juges = lignesPasse.slice(0, 12).filter((l) => !/non jugé/.test(l[3]));
  const nonJuges = lignesPasse.slice(0, 12).filter((l) => /non jugé/.test(l[3]));
  dit('... un mois d avant la date de prise n est pas jugé et le dit', nonJuges.every((l) => /sans les posés/.test(l[1]))
    && (juges.length > 0 || /aucun mois jugé encore : le premier se lit le 1er novembre 2026/.test(lignesPasse[12][0])), JSON.stringify([juges.length, nonJuges.length, lignesPasse[12][0]]));
  const ecarts = juges.map((l) => [nombre(l[1].split(' ')[0]), nombre(l[2]), nombre(l[3].split(' ')[0].replace('−', '-'))]);
  dit('... chaque écart jugé = venus moins prévu, à l arrondi près', ecarts.every(([pr, v, e]) => Math.abs(v - pr - e) <= 1), JSON.stringify(ecarts));
  dit('... la somme des venus des mois fait le total', lignesPasse.slice(0, 12).reduce((t, l) => t + nombre(l[2]), 0) === nombre(lignesPasse[12][2]));
  await photo('2b-le-passe');
  await clique('.trp-prev__horizon button', '4 semaines');
  await attend(300);

  /* 4. Préparer, sans rien envoyer. */
  const avant = await evalue(`JSON.parse(localStorage.getItem('trone::mnd_envois') || '[]').length`);
  dit('« Préparer la campagne des dormantes » se clique', await clique('.trp-prev__btn', 'Préparer la campagne des dormantes'));
  const ouvert = await jusqua(`location.hash.startsWith('#/marketing') && /Dormantes depuis 90 jours/.test(document.body.innerText)`, 15000);
  dit('... le Marketing s ouvre sur une campagne adressée aux Dormantes', !!ouvert, await evalue('location.hash'));
  dit('... l adresse est nettoyée, rien n est déposé ni envoyé', !(await evalue(`location.hash.includes('ecrire=')`))
    && (await evalue(`JSON.parse(localStorage.getItem('trone::mnd_envois') || '[]').length`)) === avant);
  await photo('3-campagne');

  /* 5. Au téléphone. */
  await evalue(`location.hash = '#/previsions'; true`);
  await jusqua(`document.querySelectorAll('.trp-prev__calcul tbody tr').length > 6`, 15000);
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await attend(800);
  dit('au téléphone (390 px), rien ne déborde', (await evalue('document.documentElement.scrollWidth > window.innerWidth + 1')) === false, String(await evalue('document.documentElement.scrollWidth')));
  await photo('4-telephone');
  await clique('.trp-prev__horizon button', '12 derniers mois');
  await jusqua(`document.querySelectorAll('.trp-prev__passe tbody tr').length === 13`, 20000);
  await attend(400);
  dit('... le passé non plus (le tableau défile dans sa carte)', (await evalue('document.documentElement.scrollWidth > window.innerWidth + 1')) === false, String(await evalue('document.documentElement.scrollWidth')));
  await photo('5-telephone-passe');
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');
  ws.close();
} catch (e) {
  ko++;
  console.log('ECHEC', e?.message ?? e);
} finally {
  chrome.kill(); serveur.close();
  setTimeout(() => { for (const d of [profil, construit]) { try { rmSync(d, { recursive: true, force: true }); } catch { /* libéré après */ } } }, 1500);
}
console.log(ko === 0 ? '\nLes prévisions se lisent et se recomposent.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1700);
