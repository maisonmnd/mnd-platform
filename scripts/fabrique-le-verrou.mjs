/* LE VERROU DE LA MAISON, DESSINÉ UNE FOIS POUR TOUTES.

   `node scripts/fabrique-le-verrou.mjs`

   Il écrit `public/assets/verrous/verrou-couche-<encre>.png`, l'image que les
   PDF embarquent en en-tête. Le site, lui, ne prend pas cette image : il a
   Cormorant en local et pose le verrou en VRAI TEXTE. Les deux lisent les
   mêmes proportions, celles de `src/ds/verrou.ts`, et `verifie-le-verrou`
   refuse qu'elles se séparent.

   POURQUOI UNE IMAGE POUR LE PAPIER. jsPDF n'embarque que ses polices de
   base, Times et Helvetica. Composer « MAISON MND » en Times, ce serait
   redessiner la marque avec une autre plume. On pose donc le dessin.

   LE PICTOGRAMME EST DÉTOURÉ, PAS REDESSINÉ. Le fichier carré du dépôt porte
   29 % de vide transparent sous la couronne ; c'est ce vide, et non la mise en
   page, qui éloignait le nom. On retire les pixels TRANSPARENTS, rien d'autre,
   et le rapport du dessin est conservé.

   PAS DE RETRAIT SUR UN BLOC CALÉ À GAUCHE — 25 septembre 2026. Une ligne très
   écartée porte un blanc APRÈS sa dernière lettre ; sur une ligne CENTRÉE on le
   compense par un `text-indent` égal, sinon l'ink penche à gauche. Sur un bloc
   CALÉ À GAUCHE, ce même retrait ne compense rien : il POUSSE la ligne vers la
   droite, de son propre écartement. Comme MAISON et le sigle n'ont pas le même
   écartement, les deux lignes ne partaient pas du même bord : « MAISON »
   pendait de vingt-quatre pixels à gauche du sigle. Mesuré sur le rendu, pas
   supposé. Le couché n'a donc aucun retrait ; le debout, lui, est centré et
   garde les siens.

   LA PREUVE DE LA POLICE, AVANT LE DESSIN. Une police qui n'arrive pas ne dit
   rien : Chrome met un substitut et l'image sort belle, juste de mise en page,
   dans la mauvaise typographie. On rend donc le même verrou une seconde fois
   en demandant une famille qui n'existe pas : si les deux fichiers sont
   identiques au bit près, c'est que Cormorant n'est jamais arrivé, et on
   s'arrête au lieu de livrer une marque en Times. */
import { build } from 'esbuild';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const racine = path.resolve(import.meta.dirname, '..');
const SORTIE = path.join(racine, 'public', 'assets', 'verrous');

const NAVIGATEUR = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => existsSync(p));
if (!NAVIGATEUR) {
  console.error('Ni Chrome ni Edge : aucun des deux ne dessine le verrou.');
  process.exit(1);
}

/* ── Les proportions, lues à la source ────────────────────────────────── */
const tmpTs = mkdtempSync(path.join(tmpdir(), 'verrou-geo-'));
let geo;
try {
  const sortie = path.join(tmpTs, 'verrou.mjs');
  await build({
    entryPoints: [path.join(racine, 'src/ds/verrou.ts')],
    bundle: true, format: 'esm', platform: 'node', outfile: sortie, logLevel: 'error',
  });
  geo = await import(pathToFileURL(sortie).href);
} finally {
  rmSync(tmpTs, { recursive: true, force: true });
}
const { VERROU, HAUT_DU_BLOC, HAUT_DU_PICTO, PLANCHER_COUCHE } = geo;

/* Le corps du sigle au rendu. 132 px sur un écran, doublé ici : à 46 mm de
   large, l'image tient encore six cent quatre-vingts points par pouce, plus du
   double de ce qu'une imprimerie demande. On ne monte pas plus haut pour une
   raison de poids : jsPDF embarque les PIXELS, pas le fichier, et une facture
   trop lourde ne part pas par WhatsApp depuis Cotonou. Quadrupler le corps
   quadruplait le poids embarqué pour une finesse que personne ne voit. */
const CORPS = 132 * 2;

const ENCRES = {
  indigo: { teinte: '#1E2150', mono: 'mono-indigo.png' },
  cuivre: { teinte: '#B97A4A', mono: 'mono-copper.png' },
  ivoire: { teinte: '#F6F1E7', mono: 'mono-ivoire.png' },
};

const tmp = mkdtempSync(path.join(tmpdir(), 'verrou-'));
mkdirSync(SORTIE, { recursive: true });

/* ── Le pictogramme, détouré ──────────────────────────────────────────── */
const RAPPORTS = {};
for (const { mono } of Object.values(ENCRES)) {
  const src = path.join(racine, 'public', 'assets', 'monograms', mono);
  if (!existsSync(src)) { console.error(`Pictogramme introuvable : ${src}`); process.exit(1); }
  await sharp(src).trim().toFile(path.join(tmp, mono));
  const m = await sharp(path.join(tmp, mono)).metadata();
  RAPPORTS[mono] = m.width / m.height;
}

/* ── La police de la Maison, servie à côté de la page ─────────────────── */
for (const f of ['cormorant-latin.woff2', 'cormorant-latin-ext.woff2']) {
  writeFileSync(path.join(tmp, f), readFileSync(path.join(racine, 'src/ds/fonts', f)));
}

const r4 = (n) => Number(n.toFixed(4));
const page = (encre, famille) => {
  const { teinte, mono } = ENCRES[encre];
  return `<!doctype html><html lang="fr"><meta charset="utf-8">
<style>
  @font-face { font-family: 'Cormorant Garamond'; font-style: normal; font-weight: 300 700;
    font-display: block; src: url('cormorant-latin.woff2') format('woff2-variations'),
    url('cormorant-latin.woff2') format('woff2'); }
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:transparent}
  /* Une marge généreuse : l'image est rognée à l'encre après le rendu. */
  .scene{padding:120px;display:inline-block}
  .verrou{display:flex;align-items:center;gap:${r4(VERROU.ecartPicto)}em;font-size:${CORPS}px}
  .verrou img{height:${r4(HAUT_DU_PICTO)}em;width:auto;display:block}
  .mots{display:flex;flex-direction:column;align-items:flex-start}
  .maison,.sigle{font-family:${famille};font-weight:400;color:${teinte};
                 line-height:1;white-space:nowrap}
  /* AUCUN text-indent : le bloc est calé à gauche, un retrait le pousserait. */
  .maison{font-size:${r4(VERROU.partMaison)}em;letter-spacing:${VERROU.ecartMaison}em;
          margin-bottom:${r4(VERROU.entreLignes / VERROU.partMaison)}em}
  .sigle{font-size:1em;letter-spacing:${VERROU.ecartSigle}em}
</style>
<div class="scene"><div class="verrou">
  <img src="${mono}" alt="">
  <div class="mots"><span class="maison">MAISON</span><span class="sigle">MND</span></div>
</div></div>
</html>`;
};

/* ── Un serveur le temps du rendu ─────────────────────────────────────── */
const TYPES = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.woff2': 'font/woff2' };
const serveur = createServer((req, res) => {
  const f = path.join(tmp, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, ''));
  if (!f.startsWith(tmp) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
const port = serveur.address().port;

/* DEUX PIÈGES ONT COÛTÉ UNE HEURE ICI, LE 25 SEPTEMBRE 2026.

   UN PROFIL À PART. Lancé pendant que la personne a son propre Chrome ouvert,
   un second Chrome sur le MÊME dossier de profil ne rend rien et n'échoue pas :
   il attend, en silence, tant que l'autre vit. Un profil jetable le rend
   indépendant, et le délai borne l'attente au lieu de la laisser infinie.

   LE NAVIGATEUR NE SE LANCE PAS EN BLOQUANT. `execFileSync` arrête la boucle
   d'événements de Node : le petit serveur ci-dessus ne peut alors PLUS
   répondre, et Chrome attend une page qui n'arrivera jamais. Le symptôme est
   trompeur, on accuse le navigateur alors que c'est notre propre serveur qu'on
   a mis en sommeil. On lance donc en asynchrone, et la boucle continue de
   servir pendant le rendu. */
const rend = (nom, html) => new Promise((resoudre, rejeter) => {
  writeFileSync(path.join(tmp, `${nom}.html`), html, 'utf8');
  const cible = path.join(tmp, `${nom}.png`);
  execFile(NAVIGATEUR, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    `--user-data-dir=${path.join(tmp, 'profil')}`,
    '--default-background-color=00000000',
    '--window-size=2600,1400', '--virtual-time-budget=20000',
    `--screenshot=${cible}`, `http://127.0.0.1:${port}/${nom}.html`,
  ], { timeout: 120_000 }, (e) => (e && !existsSync(cible) ? rejeter(e) : resoudre(cible)));
});
const empreinte = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

/* LA FENÊTRE ROGNE EN SILENCE — 25 septembre 2026. Rendu à un corps deux fois
   plus grand, le verrou dépassait les 2600 px de la fenêtre : Chrome a
   photographié ce qui tenait, sans un mot, et l'image est sortie amputée de sa
   droite. Rien ne le signalait, sinon un rapport largeur/hauteur qui n'était
   plus le même d'une définition à l'autre. On regarde donc le bord : si de
   l'encre touche un côté de la photographie, c'est qu'il en manque derrière. */
/* LE PICTOGRAMME N'EST JAMAIS DÉFORMÉ, ET CELA SE MESURE. La règle de la
   Maison est qu'il ne se redessine ni ne s'étire : le verrou le COMPOSE avec
   le nom, il ne le refait pas. La page le pose en hauteur seule, `width: auto`,
   ce qui garde son rapport ; mais une largeur ajoutée un jour l'écraserait sans
   bruit. On relit donc le rapport du dessin DANS le verrou rendu et on le
   compare à celui du fichier du dépôt. Un écart au-delà du centième vient d'une
   déformation, pas d'un arrondi de pixel. */
async function rapportDuPicto(fichier) {
  const { data, info } = await sharp(fichier).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { width: L, height: H, channels: c } = info;
  const encre = (x, y) => data[(y * L + x) * c + (c - 1)] > 40;
  const pleine = (x) => { for (let y = 0; y < H; y += 1) if (encre(x, y)) return true; return false; };
  let x0 = -1;
  let vu = false;
  for (let x = 0; x < L; x += 1) {
    if (pleine(x)) vu = true;
    else if (vu) { x0 = x; break; }
  }
  if (x0 < 1) return null;
  let haut = -1;
  let bas = -1;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < x0; x += 1) {
      if (encre(x, y)) { if (haut < 0) haut = y; bas = y; break; }
    }
  }
  return bas > haut ? x0 / (bas - haut + 1) : null;
}

async function toucheLeBord(fichier) {
  const { data, info } = await sharp(fichier).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true });
  const { width: L, height: H, channels: c } = info;
  const opaque = (x, y) => data[(y * L + x) * c + (c - 1)] > 8;
  for (let x = 0; x < L; x += 1) if (opaque(x, 0) || opaque(x, H - 1)) return true;
  for (let y = 0; y < H; y += 1) if (opaque(0, y) || opaque(L - 1, y)) return true;
  return false;
}

try {
  /* LA PREUVE, D'ABORD. */
  const avec = await rend('preuve-avec', page('indigo', "'Cormorant Garamond',serif"));
  const sans = await rend('preuve-sans', page('indigo', "'Police Qui N Existe Pas',serif"));
  if (!existsSync(avec) || !existsSync(sans)) {
    console.error('Le navigateur n\'a rien rendu.'); process.exit(1);
  }
  if (empreinte(avec) === empreinte(sans)) {
    console.error('\nCORMORANT N\'ARRIVE PAS.');
    console.error('Le verrou rendu avec la police de la Maison et le verrou rendu avec une');
    console.error('famille inexistante sont identiques au bit près : le navigateur a mis un');
    console.error('substitut. Le verrou sortirait dans la mauvaise typographie sans rien dire.');
    process.exit(1);
  }
  console.log('police : Cormorant arrive bien (les deux rendus diffèrent)');

  for (const encre of Object.keys(ENCRES)) {
    const brut = await rend(`verrou-${encre}`, page(encre, "'Cormorant Garamond',serif"));
    if (await toucheLeBord(brut)) {
      console.error(`
LE DESSIN TOUCHE LE BORD DE LA FENÊTRE (${encre}).`);
      console.error('Chrome a rogné ce qui dépassait sans le dire : agrandir --window-size,');
      console.error('ou réduire CORPS. On ne livre pas un verrou amputé.');
      process.exit(1);
    }
    const cible = path.join(SORTIE, `verrou-couche-${encre}.png`);
    await sharp(brut).trim().png({ compressionLevel: 9 }).toFile(cible);
    const attendu = RAPPORTS[ENCRES[encre].mono];
    const obtenu = await rapportDuPicto(cible);
    if (obtenu === null || Math.abs(obtenu - attendu) / attendu > 0.01) {
      console.error(`
LE PICTOGRAMME EST DÉFORMÉ (${encre}).`);
      console.error(`Rapport du fichier du dépôt : ${attendu.toFixed(4)}.`);
      console.error(`Rapport dans le verrou rendu : ${obtenu === null ? 'illisible' : obtenu.toFixed(4)}.`);
      console.error('Le verrou COMPOSE le vrai dessin, il ne le refait pas : on ne livre pas.');
      process.exit(1);
    }
    const m = await sharp(cible).metadata();
    const poids = readFileSync(cible).length;
    console.log(`  verrou-couche-${encre}.png  ${m.width}x${m.height}  rapport ${(m.width / m.height).toFixed(3)}  ${Math.round(poids / 1024)} ko  (pictogramme a ${(Math.abs(obtenu - attendu) / attendu * 100).toFixed(3)} % de son rapport d'origine)`);
    if (m.width < PLANCHER_COUCHE) {
      console.error(`  le dessin sort plus étroit que le plancher (${PLANCHER_COUCHE} px)`);
      process.exit(1);
    }
  }
} finally {
  serveur.close();
  rmSync(tmp, { recursive: true, force: true });
}
