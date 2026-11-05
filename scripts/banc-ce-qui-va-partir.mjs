/* LE BANC DE « CE QUI VA PARTIR » — `node scripts/banc-ce-qui-va-partir.mjs [dossier construit] [capture]`.

   5 novembre 2026, maquette « Ce qui va partir » (v3) validée. Le harnais
   `verifie-ce-qui-va-partir` éprouve la règle ; ce banc ouvre le VRAI Trône,
   hors ligne, connecté comme la direction (une session gardée, comme
   banc-de-gerard), avec des clientes et des rendez-vous inventés, et fait
   les gestes comme une main les ferait :

     - Conversations › Envois automatiques a ses quatre onglets : « En salle »,
       « À venir », « Partis », « Les modèles Meta » ;
     - « À venir » dit les sept jours, jour par jour, l'année sur chaque jour ;
       le rappel de la veille d'Awa part la veille à 18 h 10, son modèle et sa
       raison dits ; le foyer de Jade et Faith n'a qu'un message ;
     - « Voir le message » montre ce que la cliente lira ;
     - « Ne pas envoyer » l'arrête : la ligne se barre, dit qui l'a arrêtée,
       et l'arrêt s'écrit (`envois_arretes`) ; « Remettre » le rend ;
     - « Les modèles Meta » compte chaque modèle, et l'interrupteur met
       `rappel_rdv` en pause : « À venir » marque alors ses rappels ;
     - sur un téléphone, rien ne déborde.

   Il attend le Trône construit SOUS BASH, son serveur à l'adresse du banc
   (un faux Supabase sur le port 47123, qui ne répond qu'au compte et à sa
   fiche du personnel, la direction ; tout le reste est refusé, et la
   semence du poste fait foi) :
     VITE_APPS=trone VITE_SUPABASE_URL=http://127.0.0.1:47123 VITE_SUPABASE_ANON_KEY=faux \
       VITE_REQUIRE_AUTH=true VITE_BUILD_ID=banc npx vite build --outDir "<chemin absolu>" --emptyOutDir
   `capture` (facultatif) : un préfixe, chaque étape donne <préfixe>-<étape>.png.

   PROUVÉ DANS LES DEUX SENS : `--prouve` rejoue le banc sans le geste qui
   arrête (on touche un bouton qui n'existe pas) : le banc doit alors crier. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const prouve = process.argv.includes('--prouve');
const construit = args[0] || path.join(tmpdir(), 'banc-cqvp');
const capture = args[1] || '';
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trône construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}

/* Les jours de Cotonou (UTC + 1), à partir d'aujourd'hui. */
const jourDeCotonou = (n) => new Date(Date.now() + 3_600_000 + n * 86_400_000).toISOString().slice(0, 10);

async function lanceLeBanc({ geste }) {
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  const UID = 'u-banc-cqvp';
  const serveur = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    /* LE FAUX SUPABASE : le compte, et sa fiche du personnel (la direction). */
    if (/^\/(auth|rest|functions|realtime|storage)\//.test(u.pathname)) {
      const repond = (code, corps) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(corps === undefined ? '' : JSON.stringify(corps)); };
      if (req.method === 'OPTIONS') return repond(204);
      if (u.pathname === '/auth/v1/user') return repond(200, { id: UID, aud: 'authenticated', role: 'authenticated', email: 'banc@exemple.bj', app_metadata: {}, user_metadata: {}, created_at: new Date(Date.now() - 86_400_000).toISOString() });
      if (u.pathname === '/rest/v1/staff' && req.method === 'GET') {
        const tete = { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] };
        return repond(200, String(req.headers.accept ?? '').includes('vnd.pgrst.object') ? tete : [tete]);
      }
      return repond(503, { message: 'banc : serveur fermé' });
    }
    let f = path.join(construit, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'trone.html');
    if (!f.startsWith(path.resolve(construit)) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(readFileSync(f));
  });
  await new Promise((r) => serveur.listen(47123, '127.0.0.1', r));
  const port = serveur.address().port;
  const dbg = 9300 + Math.floor(Math.random() * 500);
  const profil = mkdtempSync(path.join(tmpdir(), 'banc-cqvp-'));
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
  const jusqua = async (expr, ms = 20000) => { for (let t = 0; t < ms; t += 250) { const v = await evalue(expr); if (v) return v; await attend(250); } return null; };
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

  let ko = 0;
  const dit = (nom, ok, detail) => { if (!ok) ko++; if (!prouve || !geste.panne) console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail !== undefined ? ' -> ' + detail : ''}`); };
  const photo = async (etape) => {
    if (!capture || geste.panne) return;
    const img = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${capture}-${etape}.png`, Buffer.from(img.result.data, 'base64'));
  };

  /* LA SEMENCE : la direction connectée hors ligne, trois clientes et leurs rendez-vous (tout est inventé). */
  const CLE = 'sb-127-auth-token';
  const le = new Date(Date.now() - 86_400_000).toISOString();
  const fiche = (fid, name, phone, extra = {}) => ({ id: fid, branchId: 'maison', name, phone, city: '', persona: '', since: '2025-01-10', photo: null, segments: [], priceCoef: 1, loyaltyPoints: 0, diaspora: false, ...extra });
  const rdv = (rid, clientId, j, time, extra = {}) => ({ id: rid, branchId: 'maison', clientId, serviceIds: [], date: jourDeCotonou(j), time, status: 'confirmé', master: '', ...extra });
  const SEMENCE = {
    [CLE]: { access_token: 'faux', refresh_token: 'faux', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: UID, email: 'banc@exemple.bj', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: le } },
    [`mnd_hors_ligne::connexion::${CLE}`]: { uid: UID, le },
    [`mnd_hors_ligne::tete::${CLE}`]: { uid: UID, le, tete: { user_id: UID, name: 'Banc', role: 'souverain', rubrics: [] } },
    'trone::mnd_clients': [
      fiche('c-awa', 'Awa Koffi', '+229 01 97 00 00 01', { civilite: 'madame' }),
      fiche('c-jade', 'Jade Banc', '+229 01 97 00 00 02', { foyerId: 'f-banc' }),
      fiche('c-faith', 'Faith Banc', '+229 01 97 00 00 02', { foyerId: 'f-banc' }),
    ],
    'trone::mnd_appointments': [
      rdv('r-awa', 'c-awa', 2, '14:00'),
      rdv('r-jade', 'c-jade', 3, '10:00', { foyerId: 'f-banc' }),
      rdv('r-faith', 'c-faith', 3, '10:30', { foyerId: 'f-banc' }),
    ],
    'trone::mnd_messages_wa': [
      { id: 'wa-1', branchId: 'maison', sens: 'sortant', numero: '22997000001', modele: 'confirmation_rdv', etat: 'lu', quand: new Date(Date.now() - 2 * 86_400_000).toISOString(), texte: 'x' },
      { id: 'wa-2', branchId: 'maison', sens: 'sortant', numero: '22997000002', modele: 'confirmation_rdv', etat: 'non-remis', quand: new Date(Date.now() - 3 * 86_400_000).toISOString(), texte: 'x' },
      { id: 'wa-3', branchId: 'maison', sens: 'sortant', numero: '22997000001', modele: 'fin_de_paquet', etat: 'non-remis', quand: new Date(Date.now() - 4 * 86_400_000).toISOString(), texte: 'x' },
      { id: 'wa-4', branchId: 'maison', sens: 'sortant', numero: '22997000002', modele: 'fin_de_paquet', etat: 'non-remis', quand: new Date(Date.now() - 5 * 86_400_000).toISOString(), texte: 'x' },
    ],
  };

  await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html` });
  await attend(3000);
  await evalue(`(() => { for (const [k, v] of Object.entries(${JSON.stringify(SEMENCE)})) localStorage.setItem(k, JSON.stringify(v)); location.hash = '#/conversations?envois=1&onglet=a-venir'; location.reload(); return true; })()`);
  const vu = await jusqua(`!!document.querySelector('.trc-avenir')`, 40000);
  const texte = () => evalue('document.body.innerText');

  /* 1. Les quatre onglets, « À venir » ouvert. */
  dit('« A venir » s ouvre', !!vu, vu ? undefined : ((await texte()) ?? '').slice(0, 600).replace(/\n/g, ' '));
  const onglets = await evalue(`[...document.querySelectorAll('.trc-envois-onglets button')].map((b) => b.textContent.trim() + (b.getAttribute('aria-pressed') === 'true' ? '*' : ''))`);
  dit('les quatre onglets, « A venir » appuye', JSON.stringify(onglets) === JSON.stringify(['En salle (0)', 'À venir*', 'Partis', 'Les modèles Meta']), JSON.stringify(onglets));
  const jours = await evalue(`[...document.querySelectorAll('.trc-avenir__jour span:first-child')].map((s) => s.textContent)`);
  dit('sept jours, l annee sur chacun, aujourd hui puis demain', (jours ?? []).length === 7 && /^Aujourd’hui, .* 20\d\d$/.test(jours[0]) && /^Demain, .* 20\d\d$/.test(jours[1]) && jours.every((j) => / 20\d\d$/.test(j)), JSON.stringify(jours));
  const ligne = (cle) => `document.querySelector('[data-cle="${cle}"]')`;
  const direction = await jusqua(`document.querySelector('.trc-avenir')?.getAttribute('data-direction') === 'oui'`, 15000);
  dit('la direction est reconnue', !!direction, await evalue(`document.querySelector('.trc-avenir')?.getAttribute('data-direction') ?? 'aucun onglet'`));
  const awa = await evalue(`${ligne('rappel-j1:r-awa')}?.innerText ?? ''`);
  dit('le rappel d Awa : la veille a 18 h 10, son nom pour la direction, le modele et sa raison', /18 h 10/.test(awa) && /Awa Koffi/.test(awa) && /Rappel de la veille · rappel_rdv/.test(awa) && /Son rendez-vous du .* 20\d\d à 14 h\./.test(awa), awa.replace(/\n/g, ' | '));
  const jourAwa = await evalue(`(() => { const l = ${ligne('rappel-j1:r-awa')}; let p = l?.parentElement; return p?.querySelector('.trc-avenir__jour span')?.textContent ?? ''; })()`);
  dit('... range au jour de demain', /^Demain, /.test(jourAwa ?? ''), jourAwa);
  const foyer = await evalue(`[...document.querySelectorAll('[data-cle^="rappel-j1:r-jade"], [data-cle^="rappel-j1:r-faith"]')].map((l) => l.querySelector('.trc-avenir__qui')?.textContent)`);
  dit('le foyer de Jade et Faith : un seul message, qui les nomme', JSON.stringify(foyer) === JSON.stringify(['Jade Banc, Faith Banc']), JSON.stringify(foyer));
  dit('« Ne pas envoyer » sur chaque ligne, pour la direction', await evalue(`[...document.querySelectorAll('.trc-avenir__envoi')].every((l) => !!l.querySelector('.trc-avenir__stop'))`));
  await evalue(`${ligne('rappel-j1:r-awa')}?.querySelector('.trc-avenir__lire')?.click()`);
  await attend(400);
  const lu = await evalue(`${ligne('rappel-j1:r-awa')}?.querySelector('.trc-avenir__texte')?.textContent ?? ''`);
  dit('« Voir le message » : ce que la cliente lira, sa civilite', /^Bonjour Mme Awa, petit rappel de la maison : votre rendez-vous est prévu demain à 14 h\.$/.test(lu ?? ''), lu);
  await photo('1-a-venir');

  /* 2. Ne pas envoyer, puis Remettre. */
  await evalue(`[...(${ligne('rappel-j1:r-awa')}?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === ${JSON.stringify(geste.bouton)})?.click()`);
  await attend(700);
  const barree = await evalue(`(() => { const l = ${ligne('rappel-j1:r-awa')}; return l ? [l.classList.contains('trc-avenir__envoi--arrete'), l.querySelector('.trc-avenir__dit')?.textContent ?? '', !!l.querySelector('.trc-avenir__remettre')] : null; })()`);
  dit('arrete : la ligne se barre, dit qui l a arretee et quand, et propose « Remettre »', !!barree && barree[0] && /^Ne partira pas · arrêté par Banc, .* 20\d\d à \d+ h/.test(barree[1]) && barree[2], JSON.stringify(barree));
  const ecrit = await evalue(`(JSON.parse(localStorage.getItem('trone::mnd_envois_arretes') || '[]').find((a) => a.id === 'rappel-j1:r-awa') || {}).arretePar ?? null`);
  dit('... l arret s ecrit, a la cle du message, par la direction', ecrit === 'Banc', ecrit);
  const compte = await evalue(`document.querySelector('[data-banc="compte"]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
  dit('... l en-tete le compte, au singulier quand il le faut', /1 arrêté/.test(compte ?? '') && /1 partira /.test(compte ?? ''), compte);
  await photo('2-arrete');
  await evalue(`${ligne('rappel-j1:r-awa')}?.querySelector('.trc-avenir__remettre')?.click()`);
  await attend(700);
  const remise = await evalue(`(() => { const l = ${ligne('rappel-j1:r-awa')}; return l ? [l.classList.contains('trc-avenir__envoi--arrete'), !!l.querySelector('.trc-avenir__stop')] : null; })()`);
  dit('« Remettre » le rend : il partira', JSON.stringify(remise) === JSON.stringify([false, true]), JSON.stringify(remise));
  const remisLe = await evalue(`!!(JSON.parse(localStorage.getItem('trone::mnd_envois_arretes') || '[]').find((a) => a.id === 'rappel-j1:r-awa') || {}).remisLe`);
  dit('... l arret reste ecrit, leve par « remisLe » (rien ne s efface)', remisLe === true, remisLe);

  /* 3. Les modèles Meta, et la pause. */
  await evalue(`[...document.querySelectorAll('.trc-envois-onglets button')].find((b) => b.textContent.trim() === 'Les modèles Meta')?.click()`);
  const table = await jusqua(`document.querySelector('.trc-modeles tbody tr') ? [...document.querySelectorAll('.trc-modeles tbody tr')].map((r) => [r.getAttribute('data-modele'), ...[...r.querySelectorAll('td.num')].map((t) => t.textContent)]) : null`, 15000);
  const conf = (table ?? []).find((r) => r[0] === 'confirmation_rdv');
  dit('chaque modele, combien de fois : confirmation_rdv 2 envoyes, 1 lu, 1 non remis', JSON.stringify(conf?.slice(0, 2)) === JSON.stringify(['confirmation_rdv', '2']) && conf?.[3] === '1' && conf?.[4] === '1', JSON.stringify(conf));
  dit('les approuves jamais partis paraissent a zero (rappel_rdv)', JSON.stringify((table ?? []).find((r) => r[0] === 'rappel_rdv')?.slice(1, 2)) === JSON.stringify(['0']), JSON.stringify((table ?? []).find((r) => r[0] === 'rappel_rdv')));
  const finDePaquet = await evalue(`(() => { const r = document.querySelector('[data-modele="fin_de_paquet"]'); return r ? [r.classList.contains('trc-modeles--alerte'), r.innerText.includes('Opale : 2 non remis de suite')] : null; })()`);
  dit('Opale signale fin_de_paquet (2 non remis de suite)', JSON.stringify(finDePaquet) === JSON.stringify([true, true]), JSON.stringify(finDePaquet));
  await evalue(`document.querySelector('[data-modele="rappel_rdv"] .trc-modeles__bascule')?.click()`);
  await attend(600);
  const bascule = await evalue(`document.querySelector('[data-modele="rappel_rdv"] .trc-modeles__bascule')?.textContent ?? ''`);
  dit('l interrupteur met rappel_rdv en pause', bascule === 'En pause', bascule);
  await photo('3-modeles');
  await evalue(`[...document.querySelectorAll('.trc-envois-onglets button')].find((b) => b.textContent.trim() === 'À venir')?.click()`);
  await jusqua(`!!document.querySelector('.trc-avenir')`, 10000);
  const enPause = await evalue(`${ligne('rappel-j1:r-awa')}?.innerText ?? ''`);
  dit('« A venir » marque le rappel : modele en pause, il ne partira pas', /Modèle en pause : il ne partira pas tant qu’il n’est pas repris\./.test(enPause ?? '') && !(await evalue(`!!${ligne('rappel-j1:r-awa')}?.querySelector('.trc-avenir__stop')`)), (enPause ?? '').replace(/\n/g, ' | '));

  /* 4. Sur un téléphone, rien ne déborde. */
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await attend(900);
  const deborde = await evalue(`document.scrollingElement.scrollWidth - window.innerWidth`);
  dit('sur un telephone, la page ne deborde pas', typeof deborde === 'number' && deborde <= 1, deborde);
  await photo('4-telephone');
  dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

  ws.close(); chrome.kill(); serveur.close();
  setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
  return ko;
}

const ko = await lanceLeBanc({ geste: { bouton: 'Ne pas envoyer' } });
console.log(ko === 0 ? '\nCe qui va partir se voit, s arrete et se remet comme promis.' : `\n${ko} controle(s) en echec.`);
let code = ko === 0 ? 0 : 1;
if (prouve && ko === 0) {
  /* L'AUTRE SENS : sans le geste qui arrête, le banc doit crier. */
  const koPanne = await lanceLeBanc({ geste: { bouton: 'Ne pas envoyer-inexistant', panne: true } });
  console.log(koPanne > 0 ? `PROUVE : sans le geste qui arrete, le banc crie (${koPanne} controle(s) en echec).` : 'MUET : le banc ne voit pas un message reste en partance.');
  if (koPanne === 0) code = 1;
}
setTimeout(() => process.exit(code), 1800);
