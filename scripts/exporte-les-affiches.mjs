/* LES VIGNETTES DES MAQUETTES DEVIENNENT DE VRAIES AFFICHES.

   `node scripts/exporte-les-affiches.mjs <maquette.html> <dossier de sortie>`

   POURQUOI CE SCRIPT EXISTE. Les plans de reseaux dessinent leurs visuels en
   vignettes, parce qu'il en faut trente sur une page : un post fait 190 px de
   large, une story 118. Ce sont pourtant de vrais dessins, entierement en CSS,
   poses sur les photos du site en pleine resolution. Il suffit donc de rendre
   chaque vignette a l'echelle qui la porte a 1080 px pour obtenir l'affiche,
   aux dimensions d'Instagram, sans redessiner quoi que ce soit.

   LA PAGE N'EST JAMAIS ANALYSEE A LA MAIN. On en fait une COPIE dans laquelle
   un script ne garde que le visuel demande, le pose en haut a gauche et
   l'agrandit ; Chrome rend la copie et l'on photographie la fenetre. Decouper
   du HTML a coups d'expressions regulieres sur une page de sept cents lignes,
   c'est se tromper de bouton tot ou tard.

   ATTENTION, LE PIEGE QUI A COUTE DIX-HUIT AFFICHES le 22 septembre 2026 : les
   polices de la Maison, Cormorant Garamond et Jost, se telechargent depuis
   Google Fonts. Sans reseau, Chrome met une police de remplacement et ne dit
   RIEN : les affiches sortent belles, justes de mise en page, et dans la
   mauvaise typographie. Le script le verifie donc lui-meme, en rendant la
   premiere vignette deux fois, avec et sans les liens de police : si les deux
   fichiers sont identiques, la police n'est jamais arrivee, et il s'arrete.

   CE QU'IL NE SAIT PAS FAIRE. Il exporte ce qui porte les classes `.v-post` et
   `.v-story`, sans juger du contenu. Or ces classes servent AUSSI aux
   scenarimages des videos (« 0 a 3 s, la porte s'ouvre ») et aux consignes de
   story (« une photo prise le jour meme »), qui ne se publient pas. Relire la
   sortie avant de la donner, et ranger a part ce qui n'est pas une affiche. */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p));

const racine = path.resolve(import.meta.dirname, '..');
const [maquette, sortie] = process.argv.slice(2);

if (!CHROME) { console.error('Chrome est introuvable, et il dessine les affiches.'); process.exit(1); }
if (!maquette || !sortie) {
  console.error('Usage : node scripts/exporte-les-affiches.mjs <maquette.html> <dossier de sortie>');
  process.exit(1);
}

/* Les formats d'Instagram, et la largeur a laquelle chaque vignette est
   dessinee dans les maquettes. Le facteur d'echelle s'en deduit. */
const FORMATS = {
  'v-post': { largeurCss: 190, largeur: 1080, hauteur: 1350, nom: 'publication' },
  'v-story': { largeurCss: 118, largeur: 1080, hauteur: 1920, nom: 'story' },
};

const chemin = path.isAbsolute(maquette) ? maquette : path.join(racine, maquette);
if (!existsSync(chemin)) { console.error(`Maquette introuvable : ${chemin}`); process.exit(1); }
const html = readFileSync(chemin, 'utf8');
const dossierPublic = path.join(racine, 'public').replace(/\\/g, '/');
const tmp = path.join(tmpdir(), `affiches-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
mkdirSync(sortie, { recursive: true });

const pageIsolee = (classe, index, facteur, sansPolice) => {
  const f = FORMATS[classe];
  void f;
  const base = `<base href="file:///${dossierPublic}/">`;
  const style = `<style>html,body{margin:0;padding:0;background:#15173A;overflow:hidden}`
    + `body>*:not(.seule){display:none!important}`
    + `.seule{position:absolute!important;left:0!important;top:0!important;margin:0!important;`
    + `transform:scale(${facteur});transform-origin:0 0}</style>`;
  const script = `<script>(function(){var t=document.querySelectorAll('.${classe}');`
    + `var e=t[${index}];if(!e){document.title='ABSENT';return;}`
    + `e.classList.add('seule');document.body.appendChild(e);}());<\/script>`;
  let page = html.replace('</head>', `${base}</head>`).replace('</body>', `${style}${script}</body>`);
  if (sansPolice) page = page.replace(/<link[^>]*fonts\.(googleapis|gstatic)\.com[^>]*>/g, '');
  return page;
};

const rend = (classe, index, fichier, sansPolice = false) => {
  const f = FORMATS[classe];
  const facteur = f.largeur / f.largeurCss;
  const page = path.join(tmp, `p-${classe}-${index}-${sansPolice ? 'sans' : 'avec'}.html`);
  writeFileSync(page, pageIsolee(classe, index, facteur, sansPolice), 'utf8');
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    `--window-size=${f.largeur},${f.hauteur}`,
    `--screenshot=${fichier.replace(/\//g, '\\')}`,
    `file:///${page.replace(/\\/g, '/')}`,
  ], { stdio: 'ignore' });
  return existsSync(fichier);
};

const empreinte = (f) => createHash('md5').update(readFileSync(f)).digest('hex');
const compte = (classe) => (html.match(new RegExp(`class="${classe}[" ]`, 'g')) || []).length;

/* ── LA PREUVE DE LA POLICE, AVANT TOUT LE RESTE ──────────────────── */
const classeTemoin = compte('v-post') > 0 ? 'v-post' : 'v-story';
if (compte(classeTemoin) === 0) { console.error('Aucune vignette a exporter dans cette maquette.'); process.exit(1); }
const avec = path.join(tmp, 'temoin-avec.png');
const sans = path.join(tmp, 'temoin-sans.png');
rend(classeTemoin, 0, avec, false);
rend(classeTemoin, 0, sans, true);
if (empreinte(avec) === empreinte(sans)) {
  console.error('\nLA POLICE DE LA MAISON N\'ARRIVE PAS.');
  console.error('Rendus avec et sans Google Fonts identiques au bit pres : Chrome a mis une');
  console.error('police de remplacement. Les affiches sortiraient dans la mauvaise typographie,');
  console.error('sans que rien ne le signale. Verifiez la connexion, puis recommencez.');
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
console.log('  police de la Maison : presente (les deux rendus temoins different)\n');

/* ── L'EXPORT ──────────────────────────────────────────────────────── */
let n = 0;
for (const classe of Object.keys(FORMATS)) {
  const total = compte(classe);
  for (let i = 0; i < total; i += 1) {
    n += 1;
    const nom = `${String(n).padStart(2, '0')}-${FORMATS[classe].nom}-${String(i + 1).padStart(2, '0')}.png`;
    const fichier = path.join(sortie, nom);
    console.log(`  ${rend(classe, i, fichier) ? nom : `ECHEC ${classe} ${i}`}`);
  }
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${n} images dans ${sortie}`);
console.log('Relisez-les : `.v-story` sert aussi aux scenarimages et aux consignes, qui ne se publient pas.');
