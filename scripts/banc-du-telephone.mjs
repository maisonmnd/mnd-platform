/* LE BANC DU TÉLÉPHONE — `node scripts/banc-du-telephone.mjs [dossier construit] [capture]`.

   2 octobre 2026 : « Make conversations responsive on mobile phone, cannot
   use it correctly » (Yéman), pour la TROISIÈME fois (21 et 28 septembre).
   Les deux premières fois, la page avait été retouchée sans être vue sur un
   téléphone ; elle cachait un fil de 838 px dans un écran de 390, et une
   saisie sous le bord de l'écran.

   Ce banc fait tourner le vrai Trône, hors ligne, dans un TÉLÉPHONE ÉMULÉ par
   le protocole de Chrome (390 × 844, doigt, sans survol), et non dans une
   fenêtre rétrécie : Chrome sans tête ne descend pas sous ~504 px de large.
   Il tient la PROMESSE faite à Yéman, pas ce que le code calcule :
     - rien ne dépasse à droite de l'écran (les rangées qui glissent exceptées) ;
     - le fil ouvert tient dans l'écran, sa saisie et « Envoyer » aussi ;
     - « Nouvelle conversation » est à portée de pouce dans la liste.

   Il attend le même Trône construit que le banc de la barre :
     VITE_APPS=trone VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
       npx vite build --outDir "$TEMP/banc-trone" --emptyOutDir
   `capture` (facultatif) : un préfixe, chaque écran donne <préfixe>-<n>.png. */
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const construit = process.argv[2] || path.join(tmpdir(), 'banc-trone');
const capture = process.argv[3] || '';
if (!existsSync(path.join(construit, 'trone.html'))) {
  console.error(`Pas de Trone construit dans ${construit}. Voir l'en-tete du script.`);
  process.exit(2);
}
const L = 390, H = 844;

/* Une Maison factice : des fiches, et des fils WhatsApp de chaque sorte. */
const ilYA = (min) => new Date(Date.now() - min * 60000).toISOString();
const pad = (n, l) => String(n).padStart(l, '0');
const fiches = Array.from({ length: 30 }, (_, i) => ({ id: 'c' + pad(i, 5), branchId: 'maison', name: ['Akouavi Hounkpe', 'Grace Ahouansou', 'Naffi Morou', 'Awa Kossou'][i % 4] + ' ' + i, phone: '+22901' + pad(51000000 + i, 8), city: 'Cotonou', since: '2026-01-05', segments: [], priceCoef: 1, loyaltyPoints: 0 }));
const fils = [
  /* Un long fil, fenêtre ouverte. */
  ...Array.from({ length: 14 }, (_, k) => ({ id: 'w1-' + k, sens: k % 2 ? 'sortant' : 'entrant', numero: '2290151000001', clientId: fiches[1].id,
    texte: k % 2 ? 'Bonjour Madame, votre rendez-vous de demain est bien noté. À très vite à la Maison.' : 'Bonsoir, est-ce que je peux décaler mon entretien de samedi à dimanche matin ? Merci beaucoup.',
    quand: ilYA(14 * 60 - k * 55), waId: 'wamid.' + k, ...(k % 2 ? { etat: 'lu', parQui: 'Yéman' } : {}) })),
  /* Un fil à la fenêtre fermée : les modèles à la place de la saisie. */
  { id: 'w2', sens: 'entrant', numero: '2290151000002', clientId: fiches[2].id, texte: 'Merci pour la carte !', quand: ilYA(60 * 30), waId: 'wamid.x2' },
  /* Un numéro sans fiche. */
  { id: 'w3', sens: 'entrant', numero: '22997000001', nomProfil: 'Numéro inconnu', texte: 'Vous faites les locks pour enfants ?', quand: ilYA(200), waId: 'wamid.x3' },
  ...Array.from({ length: 9 }, (_, k) => ({ id: 'w4-' + k, sens: 'sortant', numero: '22901510000' + (10 + k), clientId: fiches[10 + k].id, texte: 'Rappel de votre rendez-vous demain à 10 h.', quand: ilYA(3000 + k * 400), modele: 'rappel_rdv', parQui: 'Le Trône' })),
];
const SEME = `<script>localStorage.clear();localStorage.setItem('mnd_reset_v5','1');
localStorage.setItem('trone::mnd_clients', ${JSON.stringify(JSON.stringify(fiches))});
localStorage.setItem('trone::mnd_messages_wa', ${JSON.stringify(JSON.stringify(fils))});
</script>`;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
let seme = false;
const serveur = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const f = path.join(construit, decodeURIComponent(url.pathname));
  if (!f.startsWith(construit) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  let c = readFileSync(f);
  /* La Maison factice n'est semée qu'au premier chargement : les écrans
     suivants changent d'adresse sans recharger. */
  if (url.pathname === '/trone.html' && !seme) { seme = true; c = Buffer.from(c.toString('utf8').replace('<head>', '<head>' + SEME)); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(c);
});
await new Promise((r) => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port;
const dbg = 9300 + Math.floor(Math.random() * 500);
const profil = mkdtempSync(path.join(tmpdir(), 'banc-tel-'));
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
await cdp('Emulation.setDeviceMetricsOverride', { width: L, height: H, deviceScaleFactor: 2, mobile: true });
await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'hover', value: 'none' }, { name: 'pointer', value: 'coarse' }] });

/* Ce qu'on relève sur un écran. Les éléments qui DOIVENT déborder sont
   écartés : le tiroir du menu fermé (hors champ à gauche), et ce qui vit
   dans une rangée qui glisse (overflow-x auto). */
const RELEVE = `(() => {
  /* Excusé seulement si la rangée qui le fait glisser (ou le coupe) est
     elle-même dans l'écran : un fil de 838 px qui défile dans sa propre
     boîte de 838 px n'est pas une rangée qui glisse, c'est la panne. */
  const glisse = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX === 'visible') continue;
      return p.getBoundingClientRect().right <= innerWidth + 1;
    }
    return false;
  };
  const visible = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const dehors = [...document.querySelectorAll('body *')].filter((e) => {
    if (e.closest('.tr-side') || !visible(e)) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > innerWidth + 1 && !glisse(e);
  }).slice(0, 6).map((e) => String(e.className || e.tagName).slice(0, 50) + ' (' + Math.round(e.getBoundingClientRect().right) + ' px)');
  const boite = (s) => { const e = document.querySelector(s); if (!e || !visible(e)) return null; const r = e.getBoundingClientRect(); return { haut: Math.round(r.top), bas: Math.round(r.bottom), gauche: Math.round(r.left), droite: Math.round(r.right) }; };
  return { largeur: document.documentElement.scrollWidth, dehors,
    fil: boite('.trc-convs.a-fil .trc-convs__fil'), saisie: boite('.trc-convs.a-fil .trc-saisie'),
    envoyer: (() => { const b = [...document.querySelectorAll('.trc-saisie button')].find((x) => /envoyer|envoi/i.test(x.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return { haut: Math.round(r.top), bas: Math.round(r.bottom), gauche: Math.round(r.left), droite: Math.round(r.right) }; })(),
    nouveau: boite('.trc-nouveau') };
})()`;

let ko = 0;
const dit = (nom, ok, detail) => {
  if (!ok) ko++;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${nom}${detail ? ' -> ' + detail : ''}`);
};
const dedans = (b) => !!b && b.haut >= 0 && b.bas <= H && b.gauche >= 0 && b.droite <= L;
const dire = (b) => (b ? `${b.gauche}..${b.droite} x ${b.haut}..${b.bas}` : 'absent');

const ECRANS = [
  { route: 'conversations', nom: 'la liste' },
  { route: 'conversations?n=2290151000001', nom: 'un fil a la fenetre ouverte', fil: true, envoyer: true },
  { route: 'conversations?n=2290151000002', nom: 'un fil a la fenetre fermee', fil: true },
];
await cdp('Page.navigate', { url: `http://127.0.0.1:${port}/trone.html#/${ECRANS[0].route}` });
await attend(7000);
for (const [i, e] of ECRANS.entries()) {
  if (i > 0) { await evalue(`location.hash = '#/${e.route}'`); await attend(2500); }
  const r = await evalue(RELEVE);
  if (!r) { dit(`${e.nom} : l ecran se lit`, false, 'aucun releve'); continue; }
  dit(`${e.nom} : la page ne glisse pas de cote`, r.largeur <= L, `${r.largeur} px pour ${L}`);
  dit(`${e.nom} : rien ne depasse a droite`, r.dehors.length === 0, r.dehors.join(', ') || 'rien');
  if (e.fil) {
    dit(`${e.nom} : le fil tient dans l ecran`, dedans(r.fil), dire(r.fil));
    dit(`${e.nom} : la saisie aussi`, dedans(r.saisie), dire(r.saisie));
  } else {
    dit(`${e.nom} : « Nouvelle conversation » est a l ecran`, dedans(r.nouveau), dire(r.nouveau));
  }
  if (e.envoyer) dit(`${e.nom} : « Envoyer » est a l ecran`, dedans(r.envoyer), dire(r.envoyer));
  if (capture) {
    const img = await cdp('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${capture}-${i}.png`, Buffer.from(img.result.data, 'base64'));
  }
}
dit('aucune erreur dans la page', erreurs.length === 0, erreurs.slice(0, 3).join(' | ') || 'aucune');

ws.close(); chrome.kill(); serveur.close();
setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* libere apres */ } }, 1500);
console.log(ko === 0 ? '\nLes Conversations tiennent dans un telephone.' : `\n${ko} controle(s) en echec.`);
setTimeout(() => process.exit(ko === 0 ? 0 : 1), 1600);
