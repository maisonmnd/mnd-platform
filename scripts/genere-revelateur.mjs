import { build } from 'esbuild';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE SITE RÉVÉLATEUR : DE VRAIES PAGES, ÉCRITES AVANT TOUT SCRIPT — 17 septembre 2026.

   « Construis » (Yéman). Google ne lit pas une application React : il lit des
   fichiers. Ce script prend le contenu en données (`src/apps/revelateur/contenu.ts`)
   et les dix articles du Journal (`docs/site-revelateur/journal/*.md`), et écrit
   une page HTML par adresse dans `revelateur/<chemin>/index.html` : titre,
   description, H1, textes, liens, balisage structuré, tout est dans le fichier.
   Les îlots React (triage, demande, avis, contact) ne se montent que dans
   leurs emplacements (`data-ilot`), et chaque emplacement porte un repli
   statique. Le dossier `revelateur/` est GÉNÉRÉ (ignoré par git) : Vite le lit
   comme entrées, en développement comme à la construction.

   AUCUN DOMAINE EN DUR : les adresses absolues (canonique, Open Graph, JSON-LD)
   portent le repère `__LIEN_DU_SITE__`, que `build-sites.mjs` remplace en
   lisant le compte GitHub sur le dépôt. Le préfixe des liens internes vient
   de VITE_BASE (`/revelateur/` à la construction ; en développement, le
   dossier lui-même sert de préfixe). */

const racine = path.resolve(import.meta.dirname, '..');
const SORTIE = path.join(racine, 'revelateur');
const BASE = (process.env.VITE_BASE || '/revelateur/').replace(/\/?$/, '/');
const SITE = '__LIEN_DU_SITE__'; // avec sa barre finale, posé par build-sites
const JOURNAL_MD = path.join(racine, 'docs', 'site-revelateur', 'journal');

/* ── Le contenu, lu par esbuild comme le font les harnais ────────────── */
const dossierTmp = mkdtempSync(path.join(tmpdir(), 'genere-revelateur-'));
const entree = path.join(dossierTmp, 'entree.ts');
writeFileSync(entree, `export * from '${path.join(racine, 'src/apps/revelateur/contenu.ts').replace(/\\/g, '/')}';
export { DEVISE_COMPLETE } from '${path.join(racine, 'src/shared/identite.ts').replace(/\\/g, '/')}';
`);
const module_ = path.join(dossierTmp, 'contenu.mjs');
let contenu;
try {
  await build({
    entryPoints: [entree], bundle: true, format: 'esm', platform: 'node', outfile: module_, logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: BASE }) },
    banner: { js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };` },
  });
  contenu = await import(pathToFileURL(module_).href);
} finally {
  rmSync(dossierTmp, { recursive: true, force: true });
}
const { COMMUN, ACCUEIL, PAGES, GALERIE, DEVISE_COMPLETE, COMMUNAUTE, PARRAINAGE, INGREDIENTS, INGREDIENTS_TETE, AVANT_APRES, ENGAGEMENTS } = contenu;

/* ── CE QUE LA CONSTRUCTION ÉCRIT DANS LA PAGE — 24 septembre 2026 ──────
   L'état des lieux l'a mesuré : la page des offres servait 175 mots, et les
   offres arrivaient par script depuis la base, invisibles aux aperçus de
   partage et sans garantie pour Google. La construction lit maintenant la
   base avec la MÊME clef publique que le navigateur, et rend le MÊME
   composant que l'îlot (`statique.tsx`) dans le HTML, données à côté. Sans
   clef ou sans réseau, les pages sortent sans elles, et on le dit. */
const dossierStatique = mkdtempSync(path.join(tmpdir(), 'genere-revelateur-statique-'));
let statique = null;
try {
  const sortieStatique = path.join(dossierStatique, 'statique.mjs');
  await build({
    entryPoints: [path.join(racine, 'src/apps/revelateur/statique.tsx')], bundle: true, format: 'esm', platform: 'node', outfile: sortieStatique, logLevel: 'error',
    loader: { '.css': 'empty' }, jsx: 'automatic',
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: BASE, DEV: false, PROD: true, MODE: 'production' }), 'process.env.NODE_ENV': '"production"' },
    /* react-dom/server est écrit en CommonJS et demande `util` par require :
       dans un paquet ESM, esbuild remplace require par un refus. On lui
       rend un vrai require, celui de Node. */
    banner: { js: `import { createRequire as __creeRequire } from 'node:module'; const require = __creeRequire(import.meta.url);
const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };` },
  });
  statique = await import(pathToFileURL(sortieStatique).href);
} catch (e) {
  console.warn(`  rendu statique indisponible (${e.message}) : les offres resteront au script`);
} finally {
  rmSync(dossierStatique, { recursive: true, force: true });
}

async function documentsPublics(cles) {
  const url = process.env.VITE_SUPABASE_URL, clef = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !clef) { console.log('  base non lue à la construction (pas de clef publique) : offres et horaires au script seulement'); return null; }
  try {
    const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/documents?select=key,data&key=in.(${cles.join(',')})`, {
      headers: { apikey: clef, Authorization: `Bearer ${clef}` }, signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return Object.fromEntries((await r.json()).map((l) => [l.key, l.data]));
  } catch (e) {
    console.warn(`  base non lue à la construction (${e.message}) : offres et horaires au script seulement`);
    return null;
  }
}
const documents = statique ? await documentsPublics(['mnd_offers', 'mnd_settings']) : null;
const OFFRES = documents ? statique.offresDuTrottoir(documents.mnd_offers) : null;
const HORAIRES = documents ? statique.horairesStructures(documents.mnd_settings?.hours) : [];
if (documents) console.log(`  écrites dans la page : ${OFFRES.length} offre(s), ${HORAIRES.length} règle(s) d'horaires`);
/* UN LIEN WHATSAPP PORTE UN NUMÉRO DÈS LA CONSTRUCTION — 22 septembre 2026.
   Il partait « wa.me/?text=… » et n'obtenait le numéro de la branche qu'une
   fois Supabase chargé (214 Ko) : sur réseau faible, un tap trop tôt ouvrait
   WhatsApp sans destinataire. Le numéro du registre y est écrit d'avance ;
   `relieWhatsApp` (main.ts) le remplace par celui de la branche quand elle
   répond. Jamais un chiffre en dur : il vient de COMMUN.editeur. */
const NUMERO_WA = COMMUN.editeur.telephone.replace(/\D/g, '');

/* ── Petits outils ───────────────────────────────────────────────────── */
const echappe = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = echappe;
/* Les sœurs vivent sur la même origine, hors de ce site : en ligne sous
   `/couronne/` et `/academie/` (build-sites les nomme), en développement
   sous leur page `.html`. Jamais un domaine. */
const SOEURS = {
  couronne: process.env.VITE_LINK_COURONNE || '/couronne.html',
  academie: process.env.VITE_LINK_ACADEMIE || '/academie.html',
};
const lien = (vers) => {
  if (vers.startsWith('whatsapp:')) return null;
  if (vers.startsWith('soeur:')) return SOEURS[vers.slice('soeur:'.length)] ?? BASE;
  if (vers.startsWith('#')) return `${BASE}${vers}`;
  if (vers.startsWith('/#')) return `${BASE}${vers.slice(1)}`;
  return `${BASE}${vers.replace(/^\//, '')}`;
};
const bouton = (l, classe = 'btn') => {
  if (l.vers.startsWith('whatsapp:')) {
    const besoin = l.vers.slice('whatsapp:'.length);
    return `<a class="${classe}" data-wa="${attr(besoin)}" href="https://wa.me/${NUMERO_WA}?text=${encodeURIComponent(COMMUN.messages[besoin] ?? COMMUN.messages.inconnu)}"><svg><use href="#i-wa"/></svg>${echappe(l.texte)}</a>`;
  }
  return `<a class="${classe}" href="${attr(lien(l.vers))}">${echappe(l.texte)}</a>`;
};
/* LES PHOTOS OFFRENT LEUR WEBP — 24 septembre 2026. Chaque JPEG du dossier a
   son jumeau `.webp` (scripts/photos-en-webp.mjs), un bon quart plus léger ;
   le <picture> le propose, et l'<img> garde le JPEG pour qui ne lit pas le
   WebP et pour les aperçus de partage. Les attributs de l'image sont écrits
   par l'appelant, dans l'ordre où le harnais les lit. */
const estPhoto = (nom) => /\.jpe?g$/i.test(nom);
const webp = (nom) => nom.replace(/\.jpe?g$/i, '.webp');
const photo = (nom, avant = '', apres = '') => {
  const img = `<img${avant ? ` ${avant}` : ''} src="/assets/photos/site/${attr(nom)}"${apres ? ` ${apres}` : ''}>`;
  return estPhoto(nom) ? `<picture><source type="image/webp" srcset="/assets/photos/site/${attr(webp(nom))}">${img}</picture>` : img;
};
/* ══ LE BANDEAU « À LA MAISON » NE RÉPÈTE PLUS LE MÊME TRIO ══════════
   « Je veux des variantes sur le site » (Yéman, 24 septembre 2026). Brice,
   Yéman et `regard.jpg` paraissaient sur SEPT pages, les mêmes trois, dans le
   même ordre : le site semblait n'avoir que trois photos, alors que le dossier
   en porte vingt-trois.

   UN VISAGE DE LA MAISON RESTE TOUJOURS EN PREMIER, parce que ce bandeau sert
   à montrer qui accueille ; ce sont les deux suivants qui tournent. Le tour se
   calcule sur le CHEMIN de la page, donc il ne bouge pas d'une construction à
   l'autre : la même page montre toujours le même trio, ce qui évite qu'une
   photo saute d'une publication à la suivante sans raison. */
const VISAGES_DE_LA_MAISON = [
  ['brice.jpg', 'Brice Ahouansou', 'Brice, maître loctician.'],
  ['yeman.jpg', 'Yéman Ahouansou', 'Yéman vous accueille.'],
];
const AUTRES_DE_LA_MAISON = [
  ['regard.jpg', '', 'Une couronne établie, suivie à la Maison.'],
  ['creation.jpg', '', 'Une couronne créée à la Maison.'],
  ['attention.jpg', '', "L'attention portée à chaque tête."],
  ['cliente-6.jpg', '', 'Une cliente de la Maison.'],
  ['cliente-7.jpg', '', 'Une cliente de la Maison.'],
  ['cliente-8.jpg', '', 'Une cliente de la Maison.'],
  ['trois-couronnes.jpg', '', 'Trois couronnes, trois histoires.'],
];
/** Le RANG de la page, et non un hachage de son chemin : un hachage faisait
    tomber deux pages sur le même trio (réparation et MND Kids, mesuré), ce qui
    est précisément le défaut qu'on répare. Le rang garantit que deux pages
    voisines diffèrent, et reste stable d'une construction à l'autre puisque
    l'ordre de PAGES est écrit dans le contenu. */
const tourDeLaPage = (chemin) => Math.max(0, PAGES.findIndex((x) => x.chemin === chemin));
/** Le trio d'une page : un visage de la Maison, puis deux autres qui tournent.
    Les deux suivants ne peuvent pas être le même, 3 n'étant pas un multiple de
    la longueur de la liste. */
function bandeauDeLaMaison(chemin) {
  const t = tourDeLaPage(chemin);
  return [
    VISAGES_DE_LA_MAISON[t % VISAGES_DE_LA_MAISON.length],
    AUTRES_DE_LA_MAISON[t % AUTRES_DE_LA_MAISON.length],
    AUTRES_DE_LA_MAISON[(t + 3) % AUTRES_DE_LA_MAISON.length],
  ];
}

const image = (nom, alt = '', extra = '') => photo(nom, '', `alt="${attr(alt)}" width="800" height="1000" loading="lazy"${extra}`);
const ICONES = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-wa" viewBox="0 0 24 24"><path d="M4 20l1.3-3.9A8 8 0 1 1 8.3 19L4 20z" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>
  <symbol id="i-coche" viewBox="0 0 24 24"><path d="M4 12l5 5L20 6" fill="none" stroke="currentColor" stroke-width="1.8"/></symbol>
  <symbol id="i-tel" viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" stroke-width="1.7"/></symbol>
  <symbol id="i-cal" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" stroke-width="1.7"/></symbol>
  <symbol id="i-fleche" viewBox="0 0 24 24"><path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.6"/></symbol>
</svg>`;

/* ── Le balisage structuré ───────────────────────────────────────────── */
/* LES COMPTES DE LA MAISON, dans l'ordre où le pied les montre. Seuls ceux
   que le contenu connaît : on ne relie jamais une adresse qu'on n'a pas lue. */
const comptesPublics = () => [
  ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['tiktok', 'TikTok'], ['google', 'Fiche Google'],
].filter(([cle]) => COMMUN.comptes?.[cle]).map(([cle, nom]) => ({ nom, url: COMMUN.comptes[cle] }));
const noeudMaison = () => ({
  '@type': 'HairSalon', '@id': `${SITE}#maison`,
  name: COMMUN.nom, url: SITE, image: `${SITE}assets/photos/site/partage-accueil.jpg`, logo: `${SITE}assets/monograms/mono-indigo.png`,
  description: 'Maison boutique de soin et de création de dreadlocks afro à Cotonou.',
  legalName: COMMUN.editeur.nomCommercial,
  email: COMMUN.editeur.email,
  telephone: COMMUN.editeur.telephone.replace(/\s/g, ''),
  address: { '@type': 'PostalAddress', streetAddress: COMMUN.editeur.rue, postOfficeBoxNumber: COMMUN.editeur.boitePostale, addressLocality: COMMUN.ville, addressCountry: 'BJ' },
  areaServed: `${COMMUN.ville}, Bénin`, knowsLanguage: 'fr',
  founder: [{ '@type': 'Person', name: 'Brice Ahouansou' }, { '@type': 'Person', name: 'Yéman Ahouansou' }],
  /* CE QUE GOOGLE LIT POUR « SALON DE LOCKS COTONOU » — 24 septembre 2026 :
     les horaires du Trône (lus à la construction), la position (quand Yéman
     l'aura lue sur Google Maps), les comptes, la fiche. `priceRange` est un
     ordre de grandeur sans chiffre : aucun prix en public, règle de la Maison. */
  ...(HORAIRES.length ? { openingHoursSpecification: HORAIRES } : {}),
  ...(COMMUN.position ? { geo: { '@type': 'GeoCoordinates', latitude: COMMUN.position.latitude, longitude: COMMUN.position.longitude } } : {}),
  ...(comptesPublics().length ? { sameAs: comptesPublics().map((c) => c.url) } : {}),
  ...(COMMUN.comptes?.google ? { hasMap: COMMUN.comptes.google } : {}),
  priceRange: '$$', currenciesAccepted: 'XOF',
});
const noeudSite = () => ({ '@type': 'WebSite', '@id': `${SITE}#site`, name: COMMUN.nom, url: SITE, inLanguage: 'fr', publisher: { '@id': `${SITE}#maison` } });
const filAriane = (etapes) => ({
  '@type': 'BreadcrumbList',
  itemListElement: etapes.map(([nom, chemin], i) => ({ '@type': 'ListItem', position: i + 1, name: nom, item: `${SITE}${chemin.replace(/^\//, '')}` })),
});
const jsonld = (noeuds) => `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': noeuds })}</script>`;

/* ── Le gabarit ──────────────────────────────────────────────────────── */
/* La photo du premier écran de l'accueil, nommée une fois : le gabarit la
   précharge, l'accueil l'affiche, le harnais la vérifie. */
const PHOTO_ACCUEIL = 'cauris-accueil.jpg';

function page({ chemin, titre, description, corps, noeuds, image: og, classeBody = '', precharge = '' }) {
  const canon = `${SITE}${chemin.replace(/^\//, '')}`;
  const nav = COMMUN.nav.map((l) => `<a href="${attr(lien(l.vers))}">${echappe(l.texte)}</a>`).join('\n      ');
  const suivre = comptesPublics().length
    ? `\n    <div><h4>Nous suivre</h4><ul>${comptesPublics().map((c) => `<li><a href="${attr(c.url)}" target="_blank" rel="noopener">${echappe(c.nom)}</a></li>`).join('')}</ul></div>`
    : '';
  const colonnes = COMMUN.pied.colonnes.map((c) => `<div><h4>${echappe(c.titre)}</h4><ul>${c.liens.map((l) => `<li>${bouton(l, '')}</li>`).join('')}</ul></div>`).join('\n    ') + suivre;
  /* LES MENTIONS EN LISTE — 18 septembre 2026. « Il faut espacer les
     mentions, les CGU, le plan du site, trop condensé » (Yéman). Jointes par
     des points dans une seule ligne de texte, elles ne pouvaient pas
     s'aérer : une feuille de style n'espace pas du texte. En liste, chacune
     est un élément que la feuille place avec un vrai écart. */
  const legal = `<ul class="pied-mentions">${COMMUN.pied.legal.map((l) => `<li><a href="${attr(lien(l.vers))}">${echappe(l.texte)}</a></li>`).join('')}</ul>`;
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#1E2150" />
    <link rel="icon" type="image/png" sizes="32x32" href="/assets/icones/icone-32.png" />
    <link rel="icon" type="image/png" sizes="192x192" href="/assets/icones/icone-192.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/icones/icone-180.png" />
    <link rel="manifest" href="/assets/vitrine.webmanifest" />
    <title>${echappe(titre)}</title>
    <meta name="description" content="${attr(description)}" />
    <link rel="canonical" href="${canon}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${attr(COMMUN.nom)}" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:title" content="${attr(titre)}" />
    <meta property="og:description" content="${attr(description)}" />
    <meta property="og:url" content="${canon}" />
    <meta property="og:image" content="${SITE}assets/photos/site/${attr(og || 'partage-accueil.jpg')}" />
    ${og ? '' : '<meta property="og:image:width" content="800" />\n    <meta property="og:image:height" content="420" />'}
    <meta name="twitter:card" content="summary_large_image" />
    ${precharge ? (estPhoto(precharge) ? `<link rel="preload" as="image" href="${attr(webp(precharge))}" type="image/webp" fetchpriority="high" />` : `<link rel="preload" as="image" href="${attr(precharge)}" fetchpriority="high" />`) : ''}
    ${jsonld(noeuds)}
  </head>
  <body data-surface="revelateur"${classeBody ? ` class="${classeBody}"` : ''}>
    <a class="evitement" href="#contenu">Aller au contenu</a>
    ${ICONES}
    <header class="barre">
      <div class="conteneur">
        <input class="menu-etat cache" type="checkbox" id="menu-etat" aria-label="Menu" aria-controls="nav-principale">
        <label class="menu-bouton" for="menu-etat" aria-hidden="true"><span></span><span></span><span></span></label>
        <a class="logo verrou" href="${BASE}" aria-label="${attr(COMMUN.nom)}, accueil"><img src="/assets/photos/site/mono-indigo.png" alt="" width="240" height="198"><span class="verrou__mots"><span class="verrou__maison">MAISON</span><span class="verrou__sigle">MND</span></span></a>
        <nav class="nav" id="nav-principale" aria-label="Navigation">
      ${nav}
        </nav>
        <a class="tel" href="tel:${attr(COMMUN.editeur.telephone.replace(/\s/g, ''))}" aria-label="Appeler la Maison"><svg><use href="#i-tel"/></svg></a>
        <a class="btn btn--plein" href="${lien('/reserver/')}">Réserver</a>
      </div>
    </header>
    <main id="contenu" tabindex="-1">
${corps}
    </main>
    <footer>
      <div class="conteneur">
        <div>
          <a class="logo" href="${BASE}" aria-label="${attr(COMMUN.nom)}"><img src="/assets/photos/site/mono-ivoire.png" alt="MND" width="240" height="198"></a>
          <p style="margin-top:14px; max-width:32ch">${echappe(COMMUN.pied.phrase)}</p>
        </div>
    ${colonnes}
        <div class="pied-bas">
          <span class="devise">${echappe(DEVISE_COMPLETE)}</span>
          <span class="pied-copyright">&copy; Copyright ${new Date().getFullYear()}</span>
          ${legal}
        </div>
      </div>
    </footer>
${bulle(chemin)}    <script type="module" src="/src/apps/revelateur/main.ts"></script>
  </body>
</html>
`;
}

/* ── Les sections libres ─────────────────────────────────────────────── */
/* LES QUATRE PORTES, CHACUNE SA TEINTE — 17 septembre 2026. « Sur les icônes
   mets différentes couleurs du pictogramme de la maison, le cuivre,
   l'indigo » (Yéman). Les quatre cartes portaient le même monogramme ivoire
   sur le même bandeau indigo.

   LE BANDEAU SUIT LE PICTOGRAMME, il ne le précède pas : un monogramme
   indigo sur un bandeau indigo ne se verrait pas. Chaque teinte va donc avec
   le fond qui la fait lire, et les quatre alternent clair et sombre, ce qui
   donne son rythme à la rangée. L'obsidienne n'y est pas : règle de marque,
   l'indigo pour les surfaces sombres.

   La teinte suit le RANG de la carte. Réordonner les portes réordonne les
   couleurs, et c'est sans conséquence : elles ne portent aucun sens, elles
   distinguent. */
const TEINTES = [
  { classe: 'or', mono: 'mono-or.png' },          // sur bandeau indigo
  { classe: 'cuivre', mono: 'mono-copper.png' },  // sur bandeau crème
  { classe: 'ivoire', mono: 'mono-ivoire.png' },  // sur bandeau cuivre
  { classe: 'indigo', mono: 'mono-indigo.png' },  // sur bandeau crème claire
];

/* L'UNIVERS ET LES MARQUES — 27 septembre 2026, maquette validée. Deux
   blocs que l'accueil et la page de la Maison partagent : la gamme des huit
   maisons (nom, ligne, teinte, le sigle posé sur chaque teinte par la
   feuille) et le défilé des marques. Le défilé lit COMMUN.marques et écrit
   chaque marque DEUX FOIS : la seconde piste, muette pour les lecteurs
   d'écran, prend le relais quand la première sort du cadre, et la boucle se
   ferme sans couture. Un logo absent laisse le nom en lettres ; le harnais
   refuse un logo annoncé qui n'existe pas dans public/assets/marques/. */
function gamme(items) {
  return `<div class="gamme">${items.map((t) => `<div class="teinte"><i style="background:${attr(t.teinte)}" aria-hidden="true"></i><b>${echappe(t.nom)}</b><small>${echappe(t.ligne)}</small></div>`).join('')}</div>`;
}
function marques(s) {
  const logo = (m) => m.logo
    ? `<img class="marque__logo" src="/assets/marques/${attr(m.logo)}" alt="${attr(m.nom)}" loading="lazy" height="34">`
    : `<span class="marque__mot">${echappe(m.nom)}</span>`;
  const piste = (muette) => COMMUN.marques.map((m) => `<div class="marque"${muette ? ' aria-hidden="true"' : ''}>${logo(m)}</div>`).join('');
  const tete = `<div class="tete tete--centre"><img class="cire" src="/assets/motifs/cire-cuivre.png" alt="" width="240" height="240" loading="lazy">${s.sur ? `<p class="sur">${echappe(s.sur)}</p>` : ''}${s.titre ? `<h2>${echappe(s.titre)}</h2>` : ''}${s.ligne ? `<p class="ligne">${echappe(s.ligne)}</p>` : ''}</div>`;
  return `<section class="marques" id="marques"><div class="conteneur">${tete}</div>
        <div class="defile" aria-label="Les marques que la Maison utilise"><div class="defile__piste">${piste(false)}${piste(true)}</div></div>
      </section>`;
}
function rendSection(s) {
  const tete = (s.sur || s.titre) ? `<div class="tete">${s.sur ? `<p class="sur">${echappe(s.sur)}</p>` : ''}${s.titre ? `<h2>${echappe(s.titre)}</h2>` : ''}</div>` : '';
  switch (s.type) {
    case 'texte':
      return `<section class="serre"><div class="conteneur">${tete}${s.image ? `<div class="fondateurs"><div class="conteneur" style="padding:0">${image(s.image)}<div class="corps">${s.corps}</div></div></div>` : `<div class="corps">${s.corps}</div>`}</div></section>`;
    case 'grille': {
      if (s.style === 'portes') {
        /* La même bande de cartes qu'à l'accueil : la photo et le nom court
           viennent de la page de service que chaque item désigne. */
        const cartes = s.items.map((it) => {
          const p = PAGES.find((x) => x.chemin === it.vers);
          return `<a class="porte" href="${attr(lien(it.vers))}" data-mesure="parcours_choisi" data-parcours="${attr(p?.besoin ?? 'inconnu')}">
          ${p?.image ? image(p.image) : `<div class="tuile">${echappe(p?.court ?? it.titre)}<small>Photo de la séance à venir</small></div>`}
          <div class="porte-corps"><h3>${echappe(it.titre)}</h3><p>${echappe(it.texte)}</p><span class="suite">${echappe(it.suite ?? p?.court ?? 'Découvrir')} <svg><use href="#i-fleche"/></svg></span></div>
        </a>`;
        }).join('\n        ');
        return `<section class="serre"><div class="conteneur">${tete}<div class="portes">${cartes}</div></div></section>`;
      }
      if (s.style === 'cartes') {
        const cartes = s.items.map((it, i) => {
          const t = TEINTES[i % TEINTES.length];
          const corps = `<div class="carte-porte__tete"><span class="carte-porte__rang">${String(i + 1).padStart(2, '0')}</span><img src="/assets/photos/site/${t.mono}" alt="" width="240" height="198"><b>${echappe(it.titre)}</b></div><div class="carte-porte__corps"><p>${echappe(it.texte)}</p>${it.vers ? `<span class="suite">${echappe(it.suite ?? 'Découvrir')} <svg><use href="#i-fleche"/></svg></span>` : '<span class="suite suite--muette">Réservé à la Maison</span>'}</div>`;
          const classe = `carte-porte carte-porte--${t.classe}`;
          return it.vers ? `<a class="${classe}" href="${attr(lien(it.vers))}">${corps}</a>` : `<div class="${classe}">${corps}</div>`;
        }).join('\n        ');
        return `<section class="serre"><div class="conteneur">${tete}<div class="cartes">${cartes}</div></div></section>`;
      }
      return `<section class="serre"><div class="conteneur">${tete}<div class="grille">${s.items.map((it) => it.vers
        ? `<a class="grille-item" href="${attr(lien(it.vers))}"><b>${echappe(it.titre)}</b><p>${echappe(it.texte)}</p></a>`
        : `<div class="grille-item"><b>${echappe(it.titre)}</b><p>${echappe(it.texte)}</p></div>`).join('')}</div></div></section>`;
    }
    case 'confiance': {
      const c = ACCUEIL.confiance;
      return `<section class="confiance sombre"><div class="conteneur">
        <div><p class="sur">${echappe(c.sur)}</p><p class="citation" style="margin-top:12px">${echappe(c.citation)}</p></div>
        <div class="gages">${c.gages.map((g) => `<div class="gage"><b>${echappe(g.titre)}</b><p>${echappe(g.ligne)}</p></div>`).join('')}</div>
      </div></section>`;
    }
    case 'pas':
      return `<section class="serre"><div class="conteneur">${tete}<ol class="pas${s.liste ? ' pas--liste' : ''}">${s.items.map(([t, l]) => `<li><div><b>${echappe(t)}</b><span>${echappe(l)}</span></div></li>`).join('')}</ol></div></section>`;
    case 'faq':
      return `<section class="serre"><div class="conteneur">${tete}<div class="faq">${s.items.map(([q, r], i) => `<details${i === 0 ? ' open' : ''}><summary>${echappe(q)}</summary><p>${echappe(r)}</p></details>`).join('')}</div></div></section>`;
    case 'citation':
      return `<section class="serre"><div class="conteneur"><p class="citation citation--claire">${echappe(s.texte)}</p>${s.qui ? `<p class="legende" style="margin-top:10px">${echappe(s.qui)}</p>` : ''}</div></section>`;
    case 'piliers':
      return `<section class="serre"><div class="conteneur">${tete}${s.ligne ? `<p class="ligne">${echappe(s.ligne)}</p>` : ''}<div class="piliers">${s.items.map((it) => `<div><h3>${echappe(it.titre)}</h3><p>${echappe(it.ligne)}</p></div>`).join('')}</div></div></section>`;
    case 'gamme':
      return `<section class="univers"><div class="conteneur">${tete}${s.ligne ? `<p class="ligne" style="margin-top:-12px;margin-bottom:28px">${echappe(s.ligne)}</p>` : ''}${gamme(s.items)}</div></section>`;
    case 'marques':
      return marques(s);
    case 'appel':
      return `<section class="appel"><div class="conteneur"><div><h2>${echappe(s.titre)}</h2>${s.ligne ? `<p class="ligne" style="margin-top:8px">${echappe(s.ligne)}</p>` : ''}</div><div class="rangee">${s.boutons.map((b, i) => bouton(b, i === 0 ? 'btn btn--fort' : 'btn')).join('')}</div></div></section>`;
    default:
      return '';
  }
}

/* ── L'emplacement d'un îlot, avec son repli statique ────────────────── */
/* CE QUI SE RÉSERVE EN LIGNE — 17 septembre 2026. Une création et une
   réparation passent par une consultation, un entretien et des soins se
   prennent tels quels : les quatre mènent au calendrier. Un enfant commence
   par un échange avec ses parents, une formation est une candidature : ces
   deux-là mènent au rappel.

   MND KIDS A REJOINT LA LISTE le 17 septembre : « la consultation de MND Kids
   c'est Conseil et diagnostic » (Yéman). L'échange avec les parents reste le
   premier geste, il se prend simplement au calendrier. */
const RESERVABLES = new Set(['creation', 'reparation', 'entretien', 'enfant']);
const versLaReservation = (besoin) => `${lien('/reserver/')}?besoin=${besoin ?? 'inconnu'}`;
/* LE RAPPEL A SA PAGE (22 septembre 2026) : « Me faire rappeler » y mène,
   au lieu du calendrier qui n'offrait que des consultations à choisir. */
const versLeRappel = (besoin) => `${lien('/rappel/')}?besoin=${besoin ?? 'inconnu'}`;

/* ── LA BULLE « NOUS JOINDRE » — 22 septembre 2026 ──────────────────────
   « Que le bouton d'appel soit rapide et accessible » (Yéman), d'après la
   bulle « Need help ordering? » de T-Mobile. Sur toutes les pages sauf celles
   qui SONT déjà le geste (/reserver/, /contact/), en bas à droite, repliée par
   défaut, jamais ouverte seule. Trois gestes, de bas en haut parce que le
   pouce part du bas : Appeler (le numéro du registre, statique, rien à
   charger), WhatsApp avec le message DE LA PAGE, Réserver. Elle s'efface quand
   le pied paraît pour ne rien recouvrir. HTML statique, script inline : elle
   marche avant React et avant Supabase. Aucun numéro écrit à la main. */
function bulle(chemin) {
  if (chemin === '/reserver/' || chemin === '/contact/' || chemin === '/rappel/') return '';
  const besoin = PAGES.find((x) => x.chemin === chemin)?.besoin ?? 'inconnu';
  const tel = COMMUN.editeur.telephone;
  /* « JE VEUX… » — 28 septembre 2026. Sur une page qui a son parcours, le
     message de la page ; sur l'accueil et les autres, six envies, chacune
     son message déjà écrit : la cliente choisit ce qui lui convient. */
  const ligneWa = `<a class="joindre__ligne" data-wa="${attr(besoin)}" data-sortie="flottant" href="https://wa.me/${NUMERO_WA}?text=${encodeURIComponent(COMMUN.messages[besoin] ?? COMMUN.messages.inconnu)}" target="_blank" rel="noopener"><i aria-hidden="true"><svg><use href="#i-wa"/></svg></i><span>Écrire sur WhatsApp<small>Le message de cette page est déjà écrit.</small></span></a>`;
  const envies = `<div class="joindre__envies" role="group" aria-labelledby="joindre-envies"><p class="joindre__ligne joindre__ligne--titre" id="joindre-envies"><i aria-hidden="true"><svg><use href="#i-wa"/></svg></i><span>Écrire sur WhatsApp<small>Dites-nous ce que vous voulez, le message s’écrit tout seul.</small></span></p><div class="joindre__choix">${COMMUN.envies.map((e) => `<a class="joindre__envie" data-wa="${attr(e.besoin)}" data-sortie="flottant" data-mesure="whatsapp_clique" data-parcours="${attr(e.besoin)}" href="https://wa.me/${NUMERO_WA}?text=${encodeURIComponent(e.message)}" target="_blank" rel="noopener">${echappe(e.texte)}</a>`).join('')}</div></div>`;
  return `    <div class="joindre" id="joindre">
      <div class="joindre__volet" id="joindre-volet" role="group" aria-labelledby="joindre-titre" hidden>
        <div class="joindre__tete"><b id="joindre-titre">Nous joindre</b><button type="button" class="joindre__fermer" aria-label="Fermer">×</button></div>
        <a class="joindre__ligne" href="${attr(versLaReservation(besoin))}" data-mesure="parcours_choisi" data-parcours="${attr(besoin)}" data-sortie="flottant"><i aria-hidden="true"><svg><use href="#i-cal"/></svg></i><span>Réserver<small>Un entretien en trois pas, une consultation par rappel.</small></span></a>
        ${besoin === 'inconnu' ? envies : ligneWa}
        <a class="joindre__ligne" href="tel:${attr(tel.replace(/\s/g, ''))}" aria-label="Appeler la Maison au ${attr(tel)}" data-mesure="appel_clique" data-sortie="flottant"><i aria-hidden="true"><svg><use href="#i-tel"/></svg></i><span>Appeler<small>${echappe(tel)}</small></span></a>
        <p class="joindre__pied">Nous répondons pendant les heures d’ouverture de la Maison.</p>
      </div>
      <button type="button" class="joindre__bouton" id="joindre-bouton" aria-expanded="false" aria-controls="joindre-volet"><i aria-hidden="true"><svg><use href="#i-wa"/></svg></i><span>Nous joindre</span></button>
    </div>
    <script>
    (function () {
      var j = document.getElementById('joindre'), v = document.getElementById('joindre-volet'), b = document.getElementById('joindre-bouton');
      if (!j || !v || !b) return;
      var ouvre = function (o) { v.hidden = !o; b.setAttribute('aria-expanded', String(o)); if (o) { var l = v.querySelector('.joindre__ligne:last-of-type'); if (l) l.focus(); } else { b.focus(); } };
      b.addEventListener('click', function () { ouvre(v.hidden); });
      v.querySelector('.joindre__fermer').addEventListener('click', function () { ouvre(false); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !v.hidden) ouvre(false); });
      document.addEventListener('click', function (e) { if (!v.hidden && !j.contains(e.target)) ouvre(false); });
      var pied = document.querySelector('footer');
      if (pied && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { es.forEach(function (en) { j.classList.toggle('est-cachee', en.isIntersecting); }); }, { threshold: 0.05 }).observe(pied);
      }
    })();
    </script>
`;
}

/* LES OFFRES DANS LA PAGE, OU LE REPLI. Quand la construction a lu la base,
   l'emplacement porte les données en JSON puis le rendu du composant ; l'îlot
   repart des deux au montage. Sinon, le repli d'avant : une phrase et un
   bouton, jamais un écran blanc. */
const offresDansLaPage = (genre) => {
  if (!OFFRES || !statique) {
    return `<p class="corps">Les offres de la Maison se chargent. Vous pouvez aussi nous écrire sur WhatsApp.</p><p style="margin-top:12px">${bouton({ texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' }, 'btn btn--plein')}</p>`;
  }
  return `<script type="application/json" data-initiales>${statique.jsonPourLaPage(OFFRES)}</script>${statique.rendsLesOffres(OFFRES, genre)}`;
};

/* ── LA COMMUNAUTÉ MND — 28 septembre 2026 ───────────────────────────
   Maquette validée, « construis avec les patterns réels de la marque »
   (Yéman) : aucun motif n'est dessiné ici, chaque fond est une tuile de
   `public/assets/motifs/`, tirée de la bibliothèque des motifs de la Maison
   (allover, médaillon, sceau, cire). Les ingrédients suivent la page
   « Fleur d'amandier » de Corinne de Farme : un bandeau et son encadré, puis
   trois temps qui alternent (d'où il vient, pourquoi il est bon, comment la
   Maison l'emploie). */
const MOTIF = (f) => `/assets/motifs/${f}`;
const cheminIngredient = (i) => `/ingredients/${i.slug}/`;

function carteIngredient(i) {
  const fond = i.photo ? `<span class="ingr__photo">${image(i.photo, '')}</span>` : '';
  return `<a class="ingr" href="${attr(lien(cheminIngredient(i)))}" style="--teinte:${attr(i.teinte)}">${fond}
          <span class="ingr__cadre"><b>${echappe(i.nom)}</b><small>${echappe(i.role)}</small></span>
        </a>`;
}

function railDesIngredients() {
  if (!INGREDIENTS?.length) return '';
  const t = INGREDIENTS_TETE;
  return `<section class="ingredients" id="ingredients"><div class="conteneur">
        <div class="tete tete--ligne"><div><p class="sur">${echappe(t.sur)}</p><h2>${echappe(t.titre)}</h2><p class="ligne">${echappe(t.ligne)}</p></div>
          <div class="rail-nav" data-rail-nav><button type="button" data-rail="-1" aria-label="Ingrédients précédents">&#8249;</button><button type="button" data-rail="1" aria-label="Ingrédients suivants">&#8250;</button></div></div>
        <div class="rail" data-rail-piste>${INGREDIENTS.map(carteIngredient).join('')}</div>
        <p style="margin-top:18px"><a class="btn btn--lien" href="${lien('/ingredients/')}">Tous nos ingrédients</a></p>
      </div></section>`;
}

function sectionCommunaute() {
  const c = COMMUNAUTE;
  return `<section class="communaute" id="communaute"><div class="conteneur">
        <div class="tete tete--centre"><p class="sur">${echappe(c.sur)}</p><h2>${echappe(c.titre)}</h2></div>
        <div class="cartes3">${c.cartes.map((k) => `<a class="carte3" href="${attr(lien(k.vers))}">
          <img src="${MOTIF(k.marque)}" alt="" width="84" height="84" loading="lazy">
          <h3>${echappe(k.titre)}</h3><p>${echappe(k.texte)}</p>
          <span class="carte3__suite">${echappe(k.suite)} <svg><use href="#i-fleche"/></svg></span>
        </a>`).join('')}</div>
      </div></section>`;
}

const pasDuParrainage = () => `<div class="pas-parrain">${PARRAINAGE.pas.map(([t, l], i) => `<div><span>${i + 1}</span><div><b>${echappe(t)}</b><p>${echappe(l)}</p></div></div>`).join('')}</div>`;
const ilotParrainer = () => `<div data-ilot="parrainer"><div class="bon sombre"><p class="sur">Votre code de marraine</p><h3>Parrainez une amie.</h3><p class="bon__petit">Le formulaire se charge. Vous pouvez aussi demander votre code sur WhatsApp.</p><p>${bouton({ texte: 'Demander mon code', vers: 'whatsapp:inconnu' }, 'btn btn--plein')}</p></div></div>`;

function sectionParrainage(accueil) {
  const p = PARRAINAGE;
  const tete = accueil
    ? `<p class="sur">${echappe(p.sur)}</p><h2>${echappe(p.titre)}</h2><p class="ligne">${echappe(p.ligne)}</p>`
    : '';
  return `<section class="parrain" id="parrainage"><div class="conteneur">
        <div>${tete}${pasDuParrainage()}<p class="parrain__regle">${echappe(p.regle)}</p>${accueil ? `<p style="margin-top:14px"><a class="btn btn--lien" href="${lien('/parrainage/')}">Tout sur le parrainage</a></p>` : ''}</div>
        ${ilotParrainer()}
      </div></section>`;
}

/* L'AVANT / APRÈS : ne sort que si la Maison a donné ses paires. La poignée
   est un curseur natif (clavier compris) ; sans script, les deux photos se
   voient côte à côte. */
function sectionAvantApres() {
  if (!AVANT_APRES?.length) return '';
  return `<section class="aa" id="avant-apres"><div class="conteneur">
        <div class="tete"><p class="sur">Avant / après</p><h2>Ce que la Maison répare.</h2><p class="ligne">Glissez la poignée : la même couronne, avant et après son passage à la Maison.</p></div>
        <div class="paires">${AVANT_APRES.map((a) => `<figure>
          <div class="comparer" data-comparer>
            <div class="comparer__avant">${image(a.avant, `Avant : ${a.geste}`)}</div>
            <div class="comparer__apres">${image(a.apres, `Après : ${a.geste}`)}</div>
            <span class="comparer__etiq comparer__etiq--g">Avant</span><span class="comparer__etiq comparer__etiq--d">Après</span>
            <input class="comparer__poignee" type="range" min="0" max="100" value="50" aria-label="Glisser entre avant et après">
          </div>
          <figcaption><b>${echappe(a.geste)}</b><span>${echappe(a.detail)}</span></figcaption>
        </figure>`).join('')}</div>
      </div></section>`;
}

/* Les trois petits comportements de la communauté, sans React : le rail des
   ingrédients (deux flèches) et la poignée de l'avant / après. */
const SCRIPT_COMMUNAUTE = `<script>
      (() => {
        document.querySelectorAll('[data-rail-nav]').forEach((nav) => {
          const piste = nav.closest('section')?.querySelector('[data-rail-piste]');
          if (!piste) return;
          nav.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
            piste.scrollBy({ left: Number(b.dataset.rail) * piste.clientWidth * 0.8, behavior: 'smooth' });
          }));
        });
        document.querySelectorAll('[data-comparer]').forEach((c) => {
          const r = c.querySelector('input');
          const pose = () => c.style.setProperty('--x', r.value + '%');
          r.addEventListener('input', pose); pose();
          c.classList.add('comparer--vif');
        });
      })();
      </script>`;

function grilleDesIngredients() {
  return `<section class="serre"><div class="conteneur"><div class="ingr-grille">${INGREDIENTS.map(carteIngredient).join('')}</div></div></section>`;
}

function grilleDesEngagements() {
  return `<section class="serre engagements"><div class="conteneur">
        <img class="engagements__sceau" src="${MOTIF('sceau-ivoire-indigo.png')}" alt="" width="180" height="180" loading="lazy">
        <ol class="engagements__liste">${ENGAGEMENTS.map(([t, l]) => `<li><b>${echappe(t)}</b><p>${echappe(l)}</p></li>`).join('')}</ol>
        <p style="margin-top:28px" class="rangee">${bouton({ texte: 'Nos ingrédients', vers: '/ingredients/' }, 'btn')} ${bouton({ texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' }, 'btn btn--plein')}</p>
      </div></section>`;
}

/* UNE PAGE D'INGRÉDIENT, comme leur « Fleur d'amandier ». */
const FLECHE_DESSINEE = '<svg class="fleche-dessinee" viewBox="0 0 40 90" aria-hidden="true"><path d="M20 2 C 14 30, 26 52, 20 84 M8 70 L20 86 L31 68" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
function rendIngredient(i) {
  const autres = INGREDIENTS.filter((x) => x.slug !== i.slug);
  const panneauOrigine = i.photo
    ? `<div class="ing-panneau ing-panneau--photo">${image(i.photo, i.nom)}</div>`
    : `<div class="ing-panneau ing-panneau--teinte" style="--teinte:${attr(i.teinte)}"><span class="ing-panneau__latin">${echappe(i.latin)}</span><span class="ing-panneau__lieu">${echappe(i.fiche.lieu)}</span></div>`;
  const bloc = (n, titre, texte, panneau, inverse) => `<section class="ing-bloc${inverse ? ' ing-bloc--inverse' : ''}"><div class="conteneur">
        ${panneau}
        <div class="ing-bloc__texte">${FLECHE_DESSINEE}<h2>${echappe(titre).replace(/(\S+-\S+)/g, '<span class="insecable">$1</span>')}</h2><span class="ing-filet"></span>${texte}</div>
      </div></section>`;
  return `
      <nav aria-label="Fil d’Ariane" class="conteneur"><ol class="fil"><li><a href="${BASE}">Accueil</a></li><li>·</li><li><a href="${attr(lien('/ingredients/'))}">Ingrédients</a></li><li>·</li><li>${echappe(i.nom)}</li></ol></nav>
      <section class="ing-hero" style="--teinte:${attr(i.teinte)}"><div class="conteneur">
        <div class="ing-hero__encadre">
          <p class="sur">Nos ingrédients</p>
          <h1>${echappe(i.nom)}</h1>
          <span class="ing-filet"></span>
          <p class="ing-hero__accroche">${echappe(i.accroche)}</p>
        </div>
        <img class="ing-hero__medaillon" src="${MOTIF('medaillon-seul-ivoire.png')}" alt="" width="600" height="600">
      </div></section>
      ${bloc(1, 'Mais d’où vient-il ?', `<p class="corps">${echappe(i.origine)}</p><p class="ing-latin"><i>${echappe(i.latin)}</i></p>`, panneauOrigine, false)}
      ${bloc(2, 'Et pourquoi est-il bon pour vos locks ?', `<p class="corps">${echappe(i.pourquoi)}</p>`,
        `<div class="ing-panneau ing-panneau--ivoire"><span class="ing-panneau__role">${echappe(i.role).replace(' · ', '<br>')}</span></div>`, true)}
      ${bloc(3, 'Et comment la Maison l’emploie ?', `<p class="corps">${echappe(i.maison)}</p><p style="margin-top:18px">${bouton({ texte: i.soin.texte, vers: i.soin.vers }, 'btn')}</p>`,
        `<div class="ing-panneau ing-panneau--indigo sombre"><dl class="ing-fiche"><div><dt>Formule</dt><dd>${echappe(i.fiche.formule)}</dd></div><div><dt>Origine</dt><dd>${echappe(i.fiche.lieu)}</dd></div><div><dt>Qualité</dt><dd>${echappe(i.fiche.qualite)}</dd></div></dl><p class="ing-note">« ${echappe(i.note)} »</p><p class="ing-note__qui">Le mot de l’atelier</p></div>`, false)}
      <section class="ingredients ingredients--autres"><div class="conteneur">
        <div class="tete tete--ligne"><div><p class="sur">Nos ingrédients</p><h2>Les autres plantes de la Maison.</h2></div>
          <div class="rail-nav" data-rail-nav><button type="button" data-rail="-1" aria-label="Ingrédients précédents">&#8249;</button><button type="button" data-rail="1" aria-label="Ingrédients suivants">&#8250;</button></div></div>
        <div class="rail" data-rail-piste>${autres.map(carteIngredient).join('')}</div>
      </div></section>
      ${SCRIPT_COMMUNAUTE}`;
}

function ilot(nom, p) {
  if (nom === 'triage') {
    const repli = PAGES.filter((x) => x.besoin && x.chemin !== p.chemin).slice(0, 5)
      .map((x) => `<li><a href="${attr(lien(x.chemin))}">${echappe(x.h1)}</a></li>`).join('');
    return `<section class="serre"><div class="conteneur"><div data-ilot="triage"><p class="ligne">Cinq questions, et votre routine.</p><ul class="corps" style="margin-top:12px">${repli}</ul></div></div></section>`;
  }
  if (nom === 'demande' || nom === 'reserver') {
    const f = COMMUN.formulaire;
    const titre = nom === 'reserver' ? 'Choisissez votre place.' : echappe(f.titre);
    const ligne = nom === 'reserver'
      ? 'Le geste, le jour, l\u2019heure. Votre numéro pour confirmer, et rien de plus.'
      : echappe(f.ligne);
    return `<section class="reserver serre"><div class="conteneur">
      <div><div class="tete"><p class="sur">Réserver</p><h2>${titre}</h2><p class="ligne">${ligne}</p></div>
        <div data-ilot="${nom}" data-genre="rdv"><p class="corps">Le calendrier se charge. Vous pouvez aussi nous écrire sur WhatsApp.</p><p style="margin-top:12px">${bouton({ texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' }, 'btn btn--plein')}</p></div>
      </div>
      <aside class="ensuite">
        <div><p class="sur">Ce qui se passe ensuite</p><ol>${f.suite.map(([t, l]) => `<li><div><b>${echappe(t)}</b><p>${echappe(l)}</p></div></li>`).join('')}</ol></div>
        <div data-ilot="contact"></div>
        <p class="compte">Aucun compte à créer, rien à payer aujourd’hui.</p>
      </aside>
    </div></section>`;
  }
  /* LA CARTE CADEAU se compose dans l'îlot ; sans lui, la page dit encore
     comment commander : WhatsApp, et la Maison la prépare avec vous. */
  if (nom === 'offrir') {
    return `<section class="serre"><div class="conteneur"><div data-ilot="offrir"><p class="corps">La carte se compose ici : un modèle, un geste ou un montant, un prénom, un mot. Si rien ne s’affiche, écrivez-nous, la Maison la prépare avec vous.</p><p style="margin-top:12px">${bouton({ texte: 'Commander sur WhatsApp', vers: 'whatsapp:inconnu' }, 'btn btn--plein')}</p></div></div></section>`;
  }
  if (nom === 'parrainer') return sectionParrainage(false);
  if (nom === 'ingredients') return grilleDesIngredients();
  if (nom === 'engagements') return grilleDesEngagements();
  /* LA TESTEUSE : le formulaire de la demande, profil posé d'avance. Elle
     arrive au Trône comme une demande « Testeuse ». */
  if (nom === 'testeuse') {
    return `<section class="reserver serre"><div class="conteneur">
      <div><div class="tete"><p class="sur">Inscription</p><h2>Je veux essayer.</h2><p class="ligne">Votre prénom, votre numéro, et vos locks en quelques mots : la Maison vous appelle quand un soin vous attend.</p></div>
        <div data-ilot="demande" data-genre="prospect" data-profil="Testeuse"><p class="corps">Le formulaire se charge. Vous pouvez aussi nous écrire sur WhatsApp.</p><p style="margin-top:12px">${bouton({ texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' }, 'btn btn--plein')}</p></div>
      </div>
      <aside class="ensuite"><img src="${MOTIF('cire-cuivre.png')}" alt="" width="160" height="160" loading="lazy" style="width:120px;margin-bottom:12px"><p class="sur">Ce que vous recevez</p><p class="corps">Nos soins nouveaux, avant tout le monde, et une place dans ce que la Maison prépare.</p></aside>
    </div></section>`;
  }
  if (nom === 'offres') {
    /* LES OFFRES DE LA MAISON — 18 septembre 2026. Le repli est une phrase et
       jamais un écran blanc : si l'îlot ne monte pas, la visiteuse sait encore
       où demander. Les offres elles-mêmes viennent de `mnd_offers`, et seules
       celles que la Maison a activées sortent jusqu'ici. */
    return `<section class="serre"><div class="conteneur"><div data-ilot="offres">${offresDansLaPage()}</div></div></section>`;
  }
  if (nom === 'contact') {
    return `<section class="serre"><div class="conteneur"><div data-ilot="contact" style="max-width:560px"><p class="corps">${bouton({ texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' }, 'btn btn--plein')}</p></div></div></section>`;
  }
  /* LES TROIS CARTES DE LA PAGE CONTACT — 21 septembre 2026. Le repli n'est
     pas une phrase d'attente : il porte l'adresse, le numéro et le courriel
     en HTML, cliquables. Si React ne monte pas, ou si la base ne répond pas,
     on peut encore joindre la Maison, et c'est aussi ce que lit un robot qui
     n'exécute rien. React efface ce contenu en montant à sa place. */
  if (nom === 'joindre') {
    const e = COMMUN.editeur;
    return `<section class="serre"><div class="conteneur"><div data-ilot="joindre">
      <div class="jo-repli">
        <p class="jo-adresse">${echappe(e.adresseComplete)}</p>
        <p class="corps"><a href="tel:${attr(e.telephone.replace(/\s/g, ''))}">${echappe(e.telephone)}</a> · <a href="mailto:${attr(e.email)}">${echappe(e.email)}</a></p>
        <p style="margin-top:14px">${bouton({ texte: 'Parler à MND sur WhatsApp', vers: 'whatsapp:inconnu' }, 'btn btn--plein')}</p>
      </div>
    </div></div></section>`;
  }
  return '';
}

/* ── Une page de service ─────────────────────────────────────────────── */
function rendService(p) {
  const reservable = RESERVABLES.has(p.besoin ?? '');
  const cta = p.cta
    ? (reservable
      ? `<a class="btn btn--plein" href="${attr(versLaReservation(p.besoin))}" data-mesure="parcours_choisi" data-parcours="${attr(p.besoin ?? 'inconnu')}">${echappe(p.cta.texte)}</a>`
      /* LA DESTINATION DU CTA L'EMPORTE — 18 septembre 2026. `bouton()` a
         toujours su suivre n'importe quelle adresse, `soeur:` comprise ;
         c'est ICI qu'on l'écrasait en codant WhatsApp en dur. Sans `vers`,
         la coalescence retombe mot pour mot sur l'ancien comportement.
         ⚠ La branche du dessus, celle des pages RÉSERVABLES, ne passe pas
         par `bouton()` et ignorerait un `cta.vers`. Si l'on rend un jour la
         formation réservable, son lien vers l'Académie disparaîtrait sans
         bruit : il faudra alors le porter là aussi. */
      : bouton({ texte: p.cta.texte, vers: p.cta.vers ?? `whatsapp:${p.besoin ?? 'inconnu'}` }, 'btn btn--plein'))
    : '';
  /* Le second geste : écrire à la Maison, toujours possible, jamais le premier. */
  const secondaire = bouton({ texte: 'Écrire sur WhatsApp', vers: `whatsapp:${p.besoin ?? 'inconnu'}` }, 'btn btn--lien');
  const visuel = p.image ? image(p.image, '', ' fetchpriority="high"').replace(' loading="lazy"', '') : `<div class="tuile">${echappe(p.court)}<small>Photo de la séance à venir</small></div>`;
  const pas = p.pas ? `<section class="serre"><div class="conteneur"><div class="tete"><p class="sur">${echappe(p.pas.sur)}</p><h2>${echappe(p.pas.titre)}</h2></div><ol class="pas${p.pas.liste ? ' pas--liste' : ''}">${p.pas.items.map(([t, l]) => `<li><div><b>${echappe(t)}</b><span>${echappe(l)}</span></div></li>`).join('')}</ol></div></section>` : '';
  const geste = p.geste ? `<section class="serre"><div class="conteneur"><div class="geste"><span>${p.geste}</span>${p.temps ? '<div class="temps"><span>Purifier</span><span>Nourrir</span><span>Sceller</span><span>Couronner</span></div>' : ''}</div></div></section>` : '';
  const rassure = p.rassure ? `<section class="serre"><div class="conteneur"><div class="rassure"><p>${echappe(p.rassure)}</p><div class="colonne">${cta}${p.cta?.note ? `<span class="legende">${echappe(p.cta.note)}</span>` : ''}</div></div></div></section>` : '';
  const faq = p.faq?.length ? `<section class="serre"><div class="conteneur"><div class="tete"><p class="sur">Vos questions</p></div><div class="faq">${p.faq.map(([q, r], i) => `<details${i === 0 ? ' open' : ''}><summary>${echappe(q)}</summary><p>${echappe(r)}</p></details>`).join('')}</div></div></section>` : '';
  const galerie = `<section class="serre"><div class="conteneur"><div class="tete"><p class="sur">À la Maison</p></div><div class="galerie">
    ${bandeauDeLaMaison(p.chemin).map(([f, alt, dit]) => `<figure>${image(f, alt)}<figcaption>${echappe(dit)}</figcaption></figure>`).join('\n    ')}
  </div></div></section>`;
  const sections = (p.sections ?? []).map(rendSection).join('\n');
  const appel = `<section class="appel"><div class="conteneur"><div><h2>${echappe(p.cta?.texte ?? p.h1)}</h2>${p.ligne ? `<p class="ligne" style="margin-top:8px">${echappe(p.cta?.note ?? '')}</p>` : ''}</div><div class="rangee">${cta}${reservable ? secondaire : ''}</div></div></section>`;
  const mobile = p.cta ? `<div class="barre-mobile">${cta}${reservable ? bouton({ texte: 'WhatsApp', vers: `whatsapp:${p.besoin ?? 'inconnu'}` }, 'btn') : `<a class="btn" href="${attr(versLeRappel(p.besoin))}">Me faire rappeler</a>`}</div>` : '';
  return `
      <nav aria-label="Fil d’Ariane" class="conteneur"><ol class="fil"><li><a href="${BASE}">Accueil</a></li><li>·</li><li><a href="${BASE}#portes">Services</a></li><li>·</li><li>${echappe(p.court)}</li></ol></nav>
      <section class="page-hero"><div class="conteneur">
        <div>${p.sur ? `<p class="sur">${echappe(p.sur)}</p>` : ''}<h1>${echappe(p.h1)}</h1>${p.ligne ? `<p class="ligne">${echappe(p.ligne)}</p>` : ''}
          ${p.cta ? `<div class="rangee" style="margin-top:22px">${cta}${reservable ? secondaire : `<a class="btn btn--lien" href="${attr(versLeRappel(p.besoin))}">Me faire rappeler</a>`}</div>` : ''}
          ${p.cta?.note ? `<p class="legende" style="margin-top:10px">${echappe(p.cta.note)}</p>` : ''}
        </div>
        <div>${visuel}</div>
      </div></section>
${geste}
${pas}
${rassure}
${sections}
${faq}
${galerie}
${appel}
${mobile}`;
}

/* ── Une page libre ──────────────────────────────────────────────────── */
function rendLibre(p, supplement = '') {
  const sections = (p.sections ?? []).map(rendSection).join('\n');
  const ilotHtml = p.ilot ? ilot(p.ilot, p) : '';
  /* DEUX ÎLOTS SE LISENT AVANT LE TEXTE, pas après : le triage, qui EST la
     page, et les trois cartes du contact, qui répondent aux questions qu'on
     vient poser. Les autres (formulaire, calendrier, offres) ferment la page. */
  const enTete = p.ilot === 'triage' || p.ilot === 'joindre' || p.ilot === 'offrir'
    || p.ilot === 'parrainer' || p.ilot === 'ingredients' || p.ilot === 'engagements';
  const visuel = p.image ? `<div>${image(p.image)}</div>` : '';
  return `
      <nav aria-label="Fil d’Ariane" class="conteneur"><ol class="fil"><li><a href="${BASE}">Accueil</a></li><li>·</li><li>${echappe(p.court)}</li></ol></nav>
      <section class="page-hero${visuel ? '' : ' page-hero--simple'}"><div class="conteneur">
        <div>${p.sur ? `<p class="sur">${echappe(p.sur)}</p>` : ''}<h1>${echappe(p.h1)}</h1>${p.ligne ? `<p class="ligne">${echappe(p.ligne)}</p>` : ''}
          ${p.cta ? `<div class="rangee" style="margin-top:22px">${bouton({ texte: p.cta.texte, vers: `whatsapp:${p.besoin ?? 'inconnu'}` }, 'btn btn--plein')}</div>` : ''}
        </div>${visuel}
      </div></section>
${enTete ? ilotHtml : ''}
${sections}
${p.ilot && !enTete ? ilotHtml : ''}
${supplement}`;
}

/* ── L'accueil ───────────────────────────────────────────────────────── */
function rendAccueil(articles) {
  const a = ACCUEIL;
  /* CINQ PARCOURS NUMÉROTÉS — 28 septembre 2026, d'après une page de clinique
     que Yéman a montrée : le numéro en filigrane, la situation de départ en
     tête, le titre, le déroulé en temps, et la photo en arche (la forme du
     pictogramme de la Maison) au pied. Le numéro ne classe pas : il compte,
     et fait lire cinq chemins distincts plutôt qu'une rangée de cartes. */
  const cartes = a.portes.cartes.map((c, i) => {
    const p = PAGES.find((x) => x.chemin === c.vers);
    const temps = c.comment.split('·').map((t) => t.trim()).filter(Boolean);
    /* LA SITUATION SORT DU CADRE — 28 septembre 2026 (Yéman) : « Je n'ai pas
       encore de locks » se lit AU-DESSUS de la carte, comme une étiquette sur
       la colonne, et la carte ne porte que le parcours. Les photos sont
       redevenues rectangulaires, le même jour. */
    return `<div class="parcours">
          <p class="porte__pour">${echappe(c.pour)}</p>
          <a class="porte" href="${attr(lien(c.vers))}" data-mesure="parcours_choisi" data-parcours="${attr(p?.besoin ?? 'inconnu')}">
          <span class="porte__rang" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
          <div class="porte-corps">
            <h3>${echappe(c.titre)}</h3>
            <p>${echappe(c.ligne)}</p>
            <ol class="porte__temps">${temps.map((t) => `<li>${echappe(t)}</li>`).join('')}</ol>
          </div>
          ${c.image ? image(c.image) : `<div class="tuile">${echappe(c.titre.length > 18 ? p?.court ?? c.titre : c.titre)}<small>Photo de la séance à venir</small></div>`}
          <span class="suite">${echappe(c.suite)} <svg><use href="#i-fleche"/></svg></span>
          </a>
        </div>`;
  }).join('\n        ');
  const journal = articles.slice(0, 3).map(carteDArticle).join('\n        ');
  return `
      <!-- L'ACCUEIL REVISITÉ — 27 septembre 2026, maquette validée par Yéman.
           « Épure-moi complètement le site et fais de la Maison MND une marque
           de luxe. » Dans l'ordre : le premier écran avec la devise en fon en
           signature au-dessus de l'accroche, l'objectif, les cinq portes, le
           diagnostic joué sur la page, les offres, l'histoire, l'univers, les
           marques qui défilent, la carte cadeau, quatre photos vers la
           galerie (celle d'hier, gardée telle quelle), les
           avis Google, le Journal, et la devise en grand pour finir. Les trois
           promesses sont parties avec l'épure. -->
      <section class="hero-plein">
        ${photo(PHOTO_ACCUEIL, 'class="hero-plein__photo"', 'alt="Une couronne de locks et un collier de cauris" width="800" height="1000" fetchpriority="high" decoding="async"')}
        <div class="hero-plein__voile" aria-hidden="true"></div>
        <div class="conteneur hero-plein__texte">
          <p class="devise devise--grande">${echappe(a.devise.fon)}<small>${echappe(a.devise.sens)}</small></p>
          <h1>${echappe(a.h1)}</h1>
          <div class="hero-plein__geste">
            <div class="rangee">${a.boutons.map((b, i) => bouton(b, i === 0 ? 'btn' : 'btn btn--plein')).join('')}</div>
          </div>
        </div>
        <!-- LA BANDE QUI DÉFILE au pied du premier écran : les morceaux de la
             phrase, séparés par le pictogramme, deux fois pour une boucle sans
             couture (la seconde muette), sur le motif de la Maison. -->
        <div class="hero-plein__bande" aria-label="${attr(a.bande.join('. '))}.">
          <div class="bande__piste">${[false, true].map((muette) => a.bande.map((m) => `<span class="bande__mot"${muette ? ' aria-hidden="true"' : ''}><img class="bande__picto" src="/assets/photos/site/mono-copper.png" alt="" width="240" height="198" loading="lazy">${echappe(m)}</span>`).join('')).join('')}</div>
        </div>
      </section>
      <section class="objectif" id="objectif"><div class="conteneur">
        <p class="sur">${echappe(a.objectif.sur)}</p>
        <h2>${echappe(a.objectif.titre)}</h2>
        <p class="ligne">${echappe(a.objectif.ligne)}</p>
        <div class="piliers">${a.objectif.piliers.map((p) => `<div><h3>${echappe(p.titre)}</h3><p>${echappe(p.ligne)}</p></div>`).join('')}</div>
      </div></section>
      <section id="portes"><div class="conteneur">
        <div class="tete"><p class="sur">${echappe(a.portes.sur)}</p><h2>${echappe(a.portes.titre)}</h2>${a.portes.ligne ? `<p class="ligne">${echappe(a.portes.ligne)}</p>` : ''}</div>
        <div class="portes">
        ${cartes}
        </div>
        <div class="repli"><p>${echappe(a.portes.repli)}</p>${bouton(a.portes.repliBouton, 'btn btn--fort')}${a.portes.repliNote ? `<small>${echappe(a.portes.repliNote)}</small>` : ''}</div>
      </div></section>
      <!-- LE DIAGNOSTIC SE JOUE SUR L'ACCUEIL : le même îlot que /mon-parcours/,
           dans une carte ivoire sur l'indigo. Sans script, la carte mène à la
           page du diagnostic. -->
      <section class="diag sombre" id="diagnostic"><div class="conteneur">
        <div class="tete"><p class="sur">${echappe(a.diagnostic.sur)}</p><h2>${echappe(a.diagnostic.titre)}</h2><p class="ligne">${echappe(a.diagnostic.ligne)}</p><p class="note">${echappe(a.diagnostic.note)}</p></div>
        <div class="diag__quiz" data-ilot="triage" data-genre="accueil"><p class="ligne">Cinq questions, et votre routine.</p><p style="margin-top:12px"><a class="btn btn--fort" href="${lien('/mon-parcours/')}">Faire mon diagnostic</a></p></div>
      </div></section>
      <section class="vt-offres" id="offres"><div class="conteneur">
        <div class="tete"><p class="sur">${echappe(a.offres.sur)}</p><h2>${echappe(a.offres.titre)}</h2></div>
        <div data-ilot="offres" data-genre="accueil">${offresDansLaPage('accueil')}</div>
      </div></section>
      <!-- LA CARTE CADEAU AVANT L'HISTOIRE — 28 septembre 2026 (Yéman). -->
      <section class="offrir-teaser sombre" id="offrir"><div class="conteneur">
        <div><p class="sur">${echappe(a.offrir.sur)}</p><h2>${echappe(a.offrir.titre)}</h2><p class="ligne">${echappe(a.offrir.ligne)}</p></div>
        <div class="rangee">${bouton(a.offrir.bouton, 'btn')}</div>
      </div></section>
      <!-- LE PARRAINAGE, À CÔTÉ DE LA CARTE CADEAU — 28 septembre 2026. -->
      ${sectionParrainage(true)}
      <section class="fondateurs" id="maison"><div class="conteneur">
        ${image(a.fondateurs.image, 'Brice et Yéman Ahouansou')}
        <div><p class="sur">${echappe(a.fondateurs.sur)}</p><h2 style="margin-top:10px">${echappe(a.fondateurs.titre)}</h2><p class="ligne" style="margin-top:12px">${echappe(a.fondateurs.ligne)}</p>
          <p class="message">${echappe(a.fondateurs.message)}</p>
          <div class="trois">${a.fondateurs.trois.map((t) => `<b>${echappe(t)}</b>`).join('')}</div>
          <p style="margin-top:18px"><a class="btn btn--lien" href="${lien('/brice-et-yeman/')}">Brice et Yéman</a></p>
        </div>
      </div></section>
      <section class="galerie-bande" id="galerie"><div class="conteneur">
        <div class="tete tete--ligne"><div><p class="sur">${echappe(a.galerie.sur)}</p><h2>${echappe(a.galerie.titre)}</h2></div>${bouton(a.galerie.bouton, 'btn btn--lien')}</div>
        <div class="bande">${a.galerie.images.map((img) => `<figure>${image(img, '')}</figure>`).join('')}</div>
      </div></section>
      <!-- LE SOIR DU 27 SEPTEMBRE 2026 : la ligne du métier, « Notre univers » et
           « Nos clientes » sont partis de l'accueil (Yéman). Les avis Google
           restent, importés depuis l'API de Google, avec son logo. -->
      <section class="avis" id="avis">
        <div data-ilot="avis"><div class="conteneur"><div><p class="sur">Avis Google</p><h2 style="margin-top:10px">Ce que disent nos clientes</h2><p class="legende" style="margin-top:12px">Les avis de la Maison se lisent sur sa fiche Google.</p></div></div></div>
      </section>
      <!-- LA COMMUNAUTÉ MND — 28 septembre 2026 : l'avant / après (s'il y a
           des paires), les ingrédients, les trois cartes, puis le Journal. -->
      ${sectionAvantApres()}
      ${railDesIngredients()}
      ${sectionCommunaute()}
      ${SCRIPT_COMMUNAUTE}
      <section class="journal" id="journal" style="background:var(--fond-2); border-block:1px solid var(--filet)"><div class="conteneur">
        <div class="tete"><p class="sur">${echappe(a.journal.sur)}</p><h2>${echappe(a.journal.titre)}</h2></div>
        <div class="articles">
        ${journal}
        </div>
        <p style="margin-top:18px"><a class="btn btn--lien" href="${lien('/journal/')}">Tous les articles</a></p>
      </div></section>
      <!-- LES MARQUES APRÈS LE JOURNAL — 28 septembre 2026 (Yéman). -->
      ${marques(a.marques)}
      <section class="devise-bande sombre" id="signature"><div class="conteneur">
        <img class="cire" src="/assets/motifs/cire-cuivre.png" alt="" width="240" height="240" loading="lazy">
        <p class="devise devise--bande">${echappe(a.appel.titre)}</p>
        <p class="sens">${echappe(a.appel.ligne)}</p>
        <div class="rangee">${a.appel.boutons.map((b, i) => bouton(b, i === 0 ? 'btn btn--plein' : 'btn')).join('')}</div>
      </div></section>`;
}
/* LE JOURNAL EN GRILLE — 28 septembre 2026 : « que le journal soit présenté
   comme ça » (Yéman, d'après un blog de barbiers parisiens) : une barre de
   catégories, une grille de cartes, chaque carte avec son image, sa
   catégorie, son titre, sa date. Les catégories SONT les parcours que les
   articles portent déjà ; le filtre tient sans script (des cases radio et la
   feuille), et sans filtre tout se lit. La date vient de l'en-tête de
   l'article (`date:`), posée le jour où il est entré. */
const NOMS_DU_JOURNAL = {
  'premiere-couronne': 'Première Couronne',
  reparation: 'Réparation',
  entretien: 'Entretien',
  'mnd-kids': 'MND Kids',
  formations: 'Formations',
};
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const dateDite = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return '';
  return `${Number(m[3])} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
};
function carteDArticle(art) {
  const cat = art.parcours ?? '';
  return `<a class="article" href="${attr(lien(`/journal/${art.slug}/`))}" data-cat="${attr(cat)}">${photo(art.image, '', 'alt="" loading="lazy" width="960" height="600"')}`
    + `<span class="article__cat">${echappe(NOMS_DU_JOURNAL[cat] ?? 'Le Journal')}</span><h3>${echappe(art.titre)}</h3>`
    + (art.date ? `<time datetime="${attr(art.date)}">${echappe(dateDite(art.date))}</time>` : '')
    + '</a>';
}
function grilleDuJournal(articles) {
  const cats = [...new Set(articles.map((a) => a.parcours).filter((c) => c && NOMS_DU_JOURNAL[c]))];
  const cases = ['toutes', ...cats].map((c) => `<input class="cache" type="radio" name="journal-cat" id="cat-${attr(c)}"${c === 'toutes' ? ' checked' : ''}>`).join('');
  const pilules = `<div class="filtre" role="group" aria-label="Par parcours"><label for="cat-toutes">Toutes</label>${cats.map((c) => `<label for="cat-${attr(c)}">${echappe(NOMS_DU_JOURNAL[c])}</label>`).join('')}</div>`;
  return `<div class="journal-filtre">${cases}<p class="sur">Par parcours</p>${pilules}<div class="articles articles--journal">${articles.map(carteDArticle).join('\n        ')}</div></div>`;
}

const PARCOURS_DU_JOURNAL = {
  'premiere-couronne': { chemin: '/premiere-couronne/', besoin: 'creation' },
  reparation: { chemin: '/reparation-locks/', besoin: 'reparation' },
  entretien: { chemin: '/entretien-locks/', besoin: 'entretien' },
  'mnd-kids': { chemin: '/mnd-kids/', besoin: 'enfant' },
  formations: { chemin: '/formations/', besoin: 'formation' },
};

function litArticle(fichier) {
  const brut = readFileSync(fichier, 'utf8').replace(/\r\n/g, '\n');
  const m = brut.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return null;
  const tete = {};
  let cle = null;
  for (const ligne of m[1].split('\n')) {
    const kv = ligne.match(/^(\w+):\s*(.*)$/);
    if (kv) { cle = kv[1]; tete[cle] = kv[2].replace(/^"(.*)"$/, '$1').trim(); if (tete[cle] === '') tete[cle] = []; continue; }
    const item = ligne.match(/^\s*-\s+(.*)$/);
    if (item && cle && Array.isArray(tete[cle])) tete[cle].push(item[1].trim());
  }
  return { ...tete, corps: m[2].trim() };
}

const enLigne = (t) => echappe(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

function markdownEnHtml(corps) {
  const lignes = corps.split('\n');
  const out = [];
  let para = [];
  let liste = null;
  let enMaison = false;
  const videParagraphe = () => { if (para.length) { out.push(`<p>${enLigne(para.join(' '))}</p>`); para = []; } };
  const videListe = () => { if (liste) { out.push(`<ul>${liste.map((l) => `<li>${enLigne(l)}</li>`).join('')}</ul>`); liste = null; } };
  const dernier = lignes.filter((l) => l.trim()).at(-1)?.trim() ?? '';
  for (let i = 0; i < lignes.length; i += 1) {
    const l = lignes[i];
    if (l.startsWith('# ')) continue; // le H1 vient du titre
    if (l.trim() === dernier && i === lignes.length - 1) break; // l'appel à l'action, rendu à part
    if (l.startsWith('## ')) {
      videParagraphe(); videListe();
      const titre = l.slice(3).trim();
      if (enMaison) { out.push('</div>'); enMaison = false; }
      if (/^Ce que la Maison en dit/i.test(titre)) { out.push('<div class="maison">'); enMaison = true; }
      out.push(`<h2>${enLigne(titre)}</h2>`);
      continue;
    }
    if (/^\s*-\s+/.test(l)) { videParagraphe(); liste = liste ?? []; liste.push(l.replace(/^\s*-\s+/, '')); continue; }
    if (l.trim() === '') { videParagraphe(); videListe(); continue; }
    para.push(l.trim());
  }
  videParagraphe(); videListe();
  if (enMaison) out.push('</div>');
  return { html: out.join('\n'), appel: dernier };
}

function litLeJournal() {
  if (!existsSync(JOURNAL_MD)) return [];
  return readdirSync(JOURNAL_MD).filter((f) => f.endsWith('.md') && f !== 'index.md')
    .map((f) => litArticle(path.join(JOURNAL_MD, f))).filter(Boolean);
}

function rendArticle(art) {
  const { html, appel } = markdownEnHtml(art.corps);
  const p = PARCOURS_DU_JOURNAL[art.parcours] ?? PARCOURS_DU_JOURNAL['premiere-couronne'];
  /* ⚠ LA DESTINATION EST CODÉE EN DUR ICI — 18 septembre 2026. Ce bouton
     part toujours sur WhatsApp, avec le message du besoin. Aujourd'hui aucun
     des dix articles du Journal ne vise le parcours « formations », donc le
     cas ne se présente pas ; le jour où l'un le visera, son bouton « Et
     maintenant » enverra sur WhatsApp alors que la page Formations, elle,
     conduit désormais à l'Académie. Il faudra alors lire la destination de
     la page visée au lieu de la reconstruire. */
  const cta = bouton({ texte: appel || 'Trouver mon parcours', vers: `whatsapp:${p.besoin}` }, 'btn btn--plein');
  return `
      <nav aria-label="Fil d’Ariane" class="conteneur"><ol class="fil"><li><a href="${BASE}">Accueil</a></li><li>·</li><li><a href="${lien('/journal/')}">Journal</a></li><li>·</li><li>${echappe(art.titre)}</li></ol></nav>
      <section class="page-hero page-hero--simple"><div class="conteneur"><div><p class="sur">Le Journal MND</p><h1>${echappe(art.titre)}</h1><p class="ligne">${echappe(art.description)}</p></div></div></section>
      <section class="serre"><div class="conteneur"><div class="prose">${html}</div></div></section>
      <section class="appel"><div class="conteneur"><div><h2>Et maintenant</h2><p class="ligne" style="margin-top:8px">Le parcours qui correspond à cet article vous attend.</p></div><div class="rangee">${cta}<a class="btn" href="${attr(lien(p.chemin))}">Voir le parcours</a></div></div></section>`;
}

/* ── Les pages légales, sobres et vraies ─────────────────────────────── */
const LEGALES = [
  { chemin: '/mentions-legales/', court: 'Mentions légales', titre: 'Mentions légales · Maison MND', description: 'Lisez qui édite ce site, qui l’héberge et comment joindre la Maison MND à Cotonou.', h1: 'Mentions légales', corps: `<p><b>Éditeur.</b> ${echappe(COMMUN.nom)} est la marque exploitée par ${echappe(COMMUN.editeur.nomCommercial)}, ${echappe(COMMUN.editeur.forme)} de ${echappe(COMMUN.editeur.exploitante)}, immatriculée au Registre du commerce et du crédit mobilier de ${echappe(COMMUN.editeur.greffe)} sous le n° ${echappe(COMMUN.editeur.rccm)}.</p><p><b>Établissement principal.</b> ${echappe(COMMUN.editeur.adresse)}. Téléphone et WhatsApp : ${echappe(COMMUN.editeur.telephone)}.</p><p><b>Direction de la publication.</b> Yéman Ahouansou.</p><p><b>Hébergement.</b> GitHub Pages (GitHub, Inc.).</p><p><b>Nous joindre.</b> Par WhatsApp, depuis n’importe quelle page du site, par courriel à ${echappe(COMMUN.editeur.email)}, ou en laissant vos coordonnées.</p><p><b>Photographies.</b> Les images de ce site appartiennent à la Maison MND ou lui ont été confiées avec l’accord des personnes qui y figurent.</p>` },
  /* LA POLITIQUE DIT CE QUE LE SITE FAIT VRAIMENT — 18 septembre 2026. Le
     texte precedent annoncait « parfois votre e-mail » : le formulaire n'en
     a jamais demande, et depuis la reservation en ligne il en demande encore
     moins. Une politique qui decrit une collecte qui n'a pas lieu est fausse
     dans le sens le moins grave mais reste fausse. Les champs listes ici sont
     exactement ceux que `demande-submit` enregistre. */
  { chemin: '/confidentialite/', court: 'Politique de données', titre: 'Politique de gestion des données personnelles · Maison MND', description: 'Découvrez ce que la Maison MND reçoit quand vous réservez en ligne, pourquoi, qui le lit, combien de temps et comment demander l’effacement.', h1: 'Politique de gestion des données personnelles', corps: `<p><b>Ce que nous recevons, exactement.</b> Quand vous réservez ou nous laissez vos coordonnées : votre prénom, votre numéro de téléphone, le parcours qui vous amène, le mot que vous nous laissez si vous en écrivez un, la page depuis laquelle vous nous écrivez, et la date à laquelle vous avez coché la case d’accord. Le site ne demande NI e-mail, NI adresse, NI date de naissance, et aucun paiement n’est demandé en ligne.</p><p><b>Pourquoi.</b> Pour vous rappeler, confirmer votre place et prendre soin de votre couronne. Rien d’autre : pas de revente, pas de liste partagée, pas de publicité ciblée.</p><p><b>Qui les lit.</b> Le personnel de la Maison, seul, depuis son outil interne. Une réservation prise sur le site n’ouvre aucun compte et n’est visible que par la Maison.</p><p><b>Votre numéro sert aussi à ne pas vous inscrire deux fois.</b> Quand une demande arrive, nous vérifions qu’une demande identique n’a pas déjà été posée avec le même numéro, pour ne pas vous appeler en double.</p><p><b>Combien de temps.</b> Le temps de vous répondre, puis, si vous devenez cliente, le temps de votre suivi. <em>La durée exacte est en cours de fixation par la Maison et sera inscrite ici.</em></p><p><b>Vos droits.</b> Vous pouvez demander à voir, à corriger ou à effacer ce que nous avons, à tout moment, par WhatsApp ou de vive voix au salon. Nous donnons suite sans avoir à vous en demander la raison.</p><p><b>La mesure d’audience.</b> Elle compte les pages vues et les parcours choisis, sans nom ni numéro.</p><p><b>Hébergement.</b> Les pages du site sont servies par GitHub Pages ; vos demandes sont enregistrées chez notre prestataire de base de données, à accès restreint.</p>` },
  /* LES CONDITIONS DISENT LA RESERVATION EN LIGNE — 18 septembre 2026. Le
     texte precedent datait d'avant : il decrivait une prise de rendez-vous
     par message. Depuis, une visiteuse choisit son geste, son jour et son
     heure sans compte et sans paiement, et le serveur revérifie la place
     avant d'écrire. Les conditions doivent dire ce qui se passe vraiment. */
  { chemin: '/conditions/', court: 'Conditions générales', titre: 'CGU · Conditions de prise de rendez-vous en ligne · Maison MND', description: 'Comprenez comment se prend, se confirme, se déplace et s’annule un rendez-vous réservé en ligne à la Maison MND.', h1: 'Conditions générales de prise de rendez-vous en ligne', corps: `<p><b>Ce que vous réservez.</b> Vous choisissez un ou plusieurs gestes, un jour et une heure. Aucun compte n’est créé, aucun paiement n’est demandé en ligne : le règlement se fait à la Maison.</p><p><b>Une demande, pas encore une place tenue.</b> Votre réservation arrive à la Maison à l’état « en attente ». Elle devient ferme quand la Maison vous le confirme, sur WhatsApp ou par téléphone, pendant ses heures d’ouverture.</p><p><b>La consultation d’abord.</b> Une création ou une réparation commence par une consultation ; un entretien et des soins se réservent directement.</p><p><b>Plusieurs gestes dans une même venue.</b> Vous pouvez en cocher jusqu’à six. La durée et le prix s’additionnent, et les heures proposées tiennent compte du total.</p><p><b>Les prix affichés.</b> Ils viennent du catalogue de la Maison. Un geste sans prix ferme se règle au salon, et le total est alors annoncé « à partir de ».</p><p><b>Le devis.</b> Pour une création ou une restauration, rien ne commence sans une proposition écrite que vous avez acceptée. Les prix sont donnés au cas par cas.</p><p><b>Si l’heure vient d’être prise.</b> La Maison vérifie la disponibilité au moment de l’enregistrement. Si le créneau part entre votre choix et votre envoi, l’écran vous le dit et vous en propose un autre.</p><p><b>Déplacer ou annuler.</b> Prévenez-nous dès que possible, par WhatsApp ou par téléphone ; nous déplaçons votre rendez-vous. L’annulation ne se fait pas encore depuis le site. <em>Les délais et les éventuels frais sont en cours de fixation par la Maison et seront inscrits ici.</em></p><p><b>Acompte.</b> Certains rendez-vous demandent un acompte ; il vous est indiqué avant, jamais après.</p>` },
];

/* ── On écrit ────────────────────────────────────────────────────────── */
rmSync(SORTIE, { recursive: true, force: true });
const ecrit = (chemin, html) => {
  const dossier = path.join(SORTIE, chemin.replace(/^\//, ''));
  mkdirSync(dossier, { recursive: true });
  writeFileSync(path.join(dossier, 'index.html'), html);
};

const articles = litLeJournal();

/* CHAQUE ARTICLE NOMME SA VIGNETTE — 23 septembre 2026, à la demande de Yéman
   (« rajoute le reste des photos dans le journal »).

   Avant, la vignette se tirait au sort : `journal-${(i % 3) + 1}.jpg`, où `i`
   était le rang du fichier dans l'ordre alphabétique du dossier. Trois images
   pour dix articles, et surtout : ajouter un article décalait les vignettes de
   tous les suivants sans que personne ne le voie.

   LA RÈGLE QUI COMPTE, et c'est pour elle que le tirage au sort devait partir :
   les cinq portraits de clientes n'illustrent JAMAIS un article qui nomme un
   défaut (locks abîmées, trop lourdes, fines, créées ailleurs). Une cliente a
   dit oui pour paraître sur le site ; personne ne lui a demandé si son visage
   pouvait répondre à « Peut-on réparer des dreadlocks abîmées ? ». Ces
   articles gardent les photos de la Maison. Un tirage au sort, lui, l'aurait
   fait tôt ou tard, et au prochain article ajouté.

   D'où l'arrêt sec ci-dessous plutôt qu'une valeur par défaut : un article qui
   ne nomme pas sa vignette ne se publie pas, et celui qui l'écrit choisit. */
const sansVignette = articles.filter((a) => !a.image);
if (sansVignette.length) {
  throw new Error(`Article sans vignette : ${sansVignette.map((a) => a.slug).join(', ')}. `
    + 'Ajoutez « image: journal-N.jpg » à son en-tête, et inscrivez la photo au registre '
    + 'docs/site-revelateur/photos.md. Une cliente ne se pose pas sur un article au hasard.');
}
const vignetteAbsente = articles.filter((a) => !existsSync(path.join(racine, 'public', 'assets', 'photos', 'site', a.image)));
if (vignetteAbsente.length) {
  throw new Error(`Vignette introuvable : ${vignetteAbsente.map((a) => `${a.slug} → ${a.image}`).join(', ')}`);
}
/* ══ LA GALERIE ═══════════════════════════════════════════════════════
   LES DIX PLACES DE LA CONSTELLATION, et elles sont un fait de dessin, pas
   du contenu : `--x/--y/--z` la place de départ, `--dx/--dy/--dz` la course,
   `--l` la taille, `--r/--dr` l'inclinaison, `--voile` la profondeur, `--o`
   la présence au départ. Deux grandes au premier plan, deux moyennes de part
   et d'autre, six petites qui s'éloignent : ce n'est pas un classement, c'est
   un étagement.

   Les places sont ÉCARTÉES DU CENTRE parce que le titre y tient six cents
   pixels : toute carte dont le bord entre dans cette bande lui passe dessus,
   et c'est ce qui arrivait à gauche au premier essai. */
const PLACES_DE_LA_GALERIE = [
  '--l:230px;--x:-560;--y:-140;--z:-340;--r:-7;--dx:-560;--dy:-190;--dz:520;--dr:-5;--voile:.20;--o:.96',
  '--l:200px;--x:-660;--y:190;--z:-520;--r:5;--dx:-720;--dy:280;--dz:660;--dr:7;--voile:.26;--o:.90',
  '--l:260px;--x:545;--y:-115;--z:-260;--r:6;--dx:600;--dy:-170;--dz:470;--dr:6;--voile:.16;--o:1',
  '--l:190px;--x:680;--y:215;--z:-560;--r:-6;--dx:740;--dy:300;--dz:700;--dr:-8;--voile:.28;--o:.88',
  '--l:170px;--x:-285;--y:-345;--z:-680;--r:8;--dx:-330;--dy:-470;--dz:800;--dr:10;--voile:.32;--o:.84',
  '--l:175px;--x:290;--y:345;--z:-700;--r:-8;--dx:340;--dy:470;--dz:820;--dr:-9;--voile:.33;--o:.84',
  '--l:150px;--x:-790;--y:-315;--z:-900;--r:10;--dx:-860;--dy:-430;--dz:980;--dr:12;--voile:.38;--o:.78',
  '--l:155px;--x:800;--y:-330;--z:-880;--r:-9;--dx:880;--dy:-440;--dz:960;--dr:-11;--voile:.38;--o:.78',
  '--l:145px;--x:-95;--y:395;--z:-980;--r:4;--dx:-120;--dy:560;--dz:1040;--dr:5;--voile:.42;--o:.74',
  '--l:150px;--x:140;--y:-425;--z:-1020;--r:-5;--dx:200;--dy:-600;--dz:1080;--dr:-6;--voile:.44;--o:.72',
];

/* L'ORBITE DE CHAQUE CARTE : son rayon, sa durée, son pivot. Les durées sont
   PREMIÈRES ENTRE ELLES, sinon dix cartes retombent périodiquement sur la
   même figure et l'on voit un mécanisme au lieu d'un mouvement. Les grandes
   cartes, devant, tournent plus large et plus lentement ; les petites, au
   fond, plus serré et plus vite : c'est ce que fait la perspective quand on
   avance dans une foule.

   L'ÉVENTAIL DES DURÉES EST ÉTROIT, ET C'EST MESURÉ. Un premier réglage
   allait de onze à quarante-trois secondes : la carte la plus lente ne
   parcourait que 17 pixels en sept secondes quand la plus vive en faisait 74.
   Une scène où la moitié des cartes semble arrêtée n'est pas un défilé. De
   treize à vingt-six secondes, toutes avancent. */
const ORBITES_DE_LA_GALERIE = [
  '--duree:3.5s;--rayon:268px;--pivot:2.6deg',
  '--duree:2.75s;--rayon:236px;--pivot:3.1deg',
  '--duree:3.75s;--rayon:277px;--pivot:2.4deg',
  '--duree:2.5s;--rayon:222px;--pivot:3.4deg',
  '--duree:2.25s;--rayon:209px;--pivot:3.8deg',
  '--duree:4s;--rayon:250px;--pivot:2.9deg',
  '--duree:2s;--rayon:195px;--pivot:4.2deg',
  '--duree:4.25s;--rayon:227px;--pivot:2.7deg',
  '--duree:2.6s;--rayon:200px;--pivot:4.6deg',
  '--duree:3s;--rayon:213px;--pivot:3.3deg',
];

function rendGalerie() {
  if (GALERIE.boite.length !== PLACES_DE_LA_GALERIE.length) {
    throw new Error(`La boîte de la galerie veut ${PLACES_DE_LA_GALERIE.length} photos, `
      + `le contenu en donne ${GALERIE.boite.length}. Une place vide ne se voit pas `
      + 'à la relecture du contenu : on refuse plutôt que de livrer un trou.');
  }
  /* Une vue pleine page par photo, et UNE SEULE même si la photo paraît deux
     fois : la constellation et la grille se partagent les mêmes fichiers.
     DANS L'ORDRE DE LA GRILLE : c'est l'ordre que suivent les flèches, et
     celui que la personne a sous les yeux quand elle ouvre une photo. */
  const toutes = [...new Set([...GALERIE.photos, ...GALERIE.boite])];
  const ancre = (nom) => `gal-${nom.replace(/\.[a-z]+$/i, '')}`;
  /* FERMER NE BOUGE PAS LA PAGE. Un lien vers « # » remonte la page en haut :
     on fermait une photo de la grille et l'on se retrouvait sur le titre. Un
     fragment qui ne nomme AUCUN élément retire la cible sans défiler nulle
     part ; le harnais veille à ce que rien ne porte jamais cet id. */
  const FERME = '#photo-fermee';
  const CHEVRON = (sens) => '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" '
    + 'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + `<path d="${sens === 'avant' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}"/></svg>`;
  const pas = (sens, nom, mot) =>
    `<a class="gal-plein__pas gal-plein__pas--${sens}" href="#${attr(ancre(nom))}" aria-label="${mot}">${CHEVRON(sens)}</a>`;
  const ouvre = (nom, dedans) =>
    `<a class="gal-ouvre" href="#${attr(ancre(nom))}" aria-label="Agrandir cette photo">${dedans}</a>`;

  const cartes = GALERIE.boite.map((nom, i) =>
    `<div class="gal-carte" style="${attr(PLACES_DE_LA_GALERIE[i])}">`
    + `<div class="gal-carte__flotte" style="${attr(ORBITES_DE_LA_GALERIE[i])}">`
    + '<div class="gal-carte__tourne">'
    + ouvre(nom, photo(nom, '', 'alt="" width="800" height="1000"'))
    + '</div></div></div>').join('\n        ');
  /* UNE FLÈCHE DE CHAQUE CÔTÉ, sans script : chaque vue est un lien vers la
     précédente et la suivante, et la dernière renvoie à la première. On fait
     le tour sans fermer ni revenir en arrière. */
  const pleines = toutes.map((nom, i) =>
    `<div class="gal-plein" id="${attr(ancre(nom))}" role="dialog" aria-label="Photo agrandie">`
    + `<a class="gal-plein__fond" href="${FERME}" aria-label="Fermer"></a>`
    + `<a class="gal-plein__fermer" href="${FERME}" aria-label="Fermer">&times;</a>`
    + pas('avant', toutes[(i - 1 + toutes.length) % toutes.length], 'Photo précédente')
    + pas('apres', toutes[(i + 1) % toutes.length], 'Photo suivante')
    + photo(nom, '', 'alt="" loading="lazy" width="800" height="1000"')
    + '</div>').join('\n        ');
  /* ALT VIDE, comme la rangée de l'accueil : rien dans ces images n'est
     nommable une par une sans nommer une femme, et le titre juste au-dessus
     porte déjà le sens du groupe. */
  const grille = GALERIE.photos.map((nom) =>
    `<figure>${ouvre(nom, photo(nom, '', 'alt="" loading="lazy" width="800" height="1000"'))}</figure>`)
    .join('\n          ');
  return `
      <div class="gal-rail" id="gal-rail">
        <div class="gal-scene" id="gal-scene" style="--p:0;--e:0">
          <div class="gal-mot"><div class="gal-mot__bloc">
            <p class="sur">${echappe(GALERIE.sur)}</p>
            <h1>${echappe(GALERIE.h1)}</h1>
            <p>${echappe(GALERIE.ligne)}</p>
            <a class="defile" href="#gal-grille">Voir les photos<span aria-hidden="true">↓</span></a>
          </div></div>
          ${cartes}
        </div>
      </div>
      <section class="serre" id="gal-grille"><div class="conteneur">
        <div class="gal-grille">
          ${grille}
        </div>
      </div></section>
      <div class="gal-pleines">
        ${pleines}
      </div>
      <script>
      /* UNE SEULE VALEUR ÉCRITE PAR IMAGE DE L'ÉCRAN. Sans requestAnimationFrame,
         un écouteur de défilement écrit plusieurs fois entre deux images, pour
         rien. Qui demande moins de mouvement n'a pas de script du tout : la
         feuille de style pose déjà les cartes. */
      (function () {
        var rail = document.getElementById('gal-rail'), scene = document.getElementById('gal-scene');
        if (!rail || !scene) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        var demande = false;
        function pose() {
          demande = false;
          var course = rail.offsetHeight - window.innerHeight;
          if (course <= 0) return;
          var p = (window.scrollY - rail.offsetTop) / course;
          p = p < 0 ? 0 : p > 1 ? 1 : p;
          scene.style.setProperty('--p', p.toFixed(4));
          scene.style.setProperty('--e', Math.pow(p, 1.75).toFixed(4));
        }
        function aDefile() { if (!demande) { demande = true; requestAnimationFrame(pose); } }
        window.addEventListener('scroll', aDefile, { passive: true });
        window.addEventListener('resize', aDefile);
        pose();
      })();
      </script>`;
}

const pagesEcrites = [];

ecrit('/', page({
  chemin: '/', titre: ACCUEIL.titre, description: ACCUEIL.description, corps: rendAccueil(articles),
  classeBody: 'accueil-plein', precharge: `/assets/photos/site/${PHOTO_ACCUEIL}`,
  noeuds: [noeudMaison(), noeudSite(), filAriane([['Accueil', '/']])],
}));
pagesEcrites.push('/');

ecrit('/galerie/', page({
  chemin: '/galerie/', titre: GALERIE.titre, description: GALERIE.description,
  corps: rendGalerie(), classeBody: 'galerie-plein',
  precharge: `/assets/photos/site/${GALERIE.boite[2]}`,
  noeuds: [noeudSite(), filAriane([['Accueil', '/'], ['Galerie', '/galerie/']]), {
    '@type': 'ImageGallery', name: GALERIE.h1, description: GALERIE.description,
    url: `${SITE}galerie/`,
  }],
}));
pagesEcrites.push('/galerie/');

for (const p of PAGES) {
  const estService = !!(p.cta || p.pas);
  let corps;
  if (p.chemin === '/journal/') {
    corps = rendLibre(p, `<section class="serre"><div class="conteneur">${grilleDuJournal(articles)}</div></section>`);
  } else corps = estService ? rendService(p) : rendLibre(p);
  const noeuds = [noeudSite(), filAriane([['Accueil', '/'], [p.court, p.chemin]])];
  if (p.jsonld === 'maison') noeuds.unshift(noeudMaison());
  if (p.jsonld === 'service') noeuds.push({ '@type': 'Service', name: p.h1, description: p.description, provider: { '@id': `${SITE}#maison` }, areaServed: `${COMMUN.ville}, Bénin`, url: `${SITE}${p.chemin.replace(/^\//, '')}` });
  if (p.jsonld === 'course') noeuds.push({ '@type': 'Course', name: p.h1, description: p.description, provider: { '@type': 'Organization', name: COMMUN.nom, '@id': `${SITE}#maison` } });
  const faqItems = p.jsonld === 'faq' ? (p.sections ?? []).filter((s) => s.type === 'faq').flatMap((s) => s.items) : [];
  if (faqItems.length) noeuds.push({ '@type': 'FAQPage', mainEntity: faqItems.map(([q, r]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: r } })) });
  ecrit(p.chemin, page({ chemin: p.chemin, titre: p.titre, description: p.description, corps, noeuds, image: p.image, classeBody: p.cta ? 'a-barre-mobile' : '' }));
  pagesEcrites.push(p.chemin);
}

/* LES PAGES D'INGRÉDIENTS — 28 septembre 2026, une par plante. */
for (const i of INGREDIENTS) {
  const chemin = cheminIngredient(i);
  ecrit(chemin, page({
    chemin, titre: `${i.nom.replace(/^L’|^Le |^La /, (m) => m)} · Nos ingrédients · Maison MND`.slice(0, 60),
    description: `${i.accroche} D’où il vient, ce qu’il fait à vos locks, et comment la Maison MND l’emploie.`.slice(0, 155),
    corps: rendIngredient(i), classeBody: 'page-ingredient',
    noeuds: [noeudSite(), filAriane([['Accueil', '/'], ['Ingrédients', '/ingredients/'], [i.nom, chemin]])],
  }));
  pagesEcrites.push(chemin);
}

for (const art of articles) {
  const chemin = `/journal/${art.slug}/`;
  ecrit(chemin, page({
    chemin, titre: `${art.titre} · Maison MND`.slice(0, 60), description: art.description, corps: rendArticle(art),
    noeuds: [noeudSite(), filAriane([['Accueil', '/'], ['Journal', '/journal/'], [art.titre, chemin]]), {
      '@type': 'Article', headline: art.titre, description: art.description, inLanguage: 'fr',
      author: { '@type': 'Organization', name: COMMUN.nom }, publisher: { '@id': `${SITE}#maison` },
      mainEntityOfPage: `${SITE}${chemin.replace(/^\//, '')}`, keywords: (art.motsCles ?? []).join(', '),
    }],
  }));
  pagesEcrites.push(chemin);
}

for (const l of LEGALES) {
  ecrit(l.chemin, page({
    chemin: l.chemin, titre: l.titre, description: l.description,
    corps: `
      <nav aria-label="Fil d’Ariane" class="conteneur"><ol class="fil"><li><a href="${BASE}">Accueil</a></li><li>·</li><li>${echappe(l.court)}</li></ol></nav>
      <section class="page-hero page-hero--simple"><div class="conteneur"><div><h1>${echappe(l.h1)}</h1></div></div></section>
      <section class="serre"><div class="conteneur"><div class="corps">${l.corps}</div></div></section>`,
    noeuds: [noeudSite(), filAriane([['Accueil', '/'], [l.court, l.chemin]])],
  }));
  pagesEcrites.push(l.chemin);
}

/* La page 404 n'est qu'une page d'erreur : jamais un routeur. */
writeFileSync(path.join(SORTIE, '404.html'), page({
  chemin: '/404.html', titre: 'Page introuvable · Maison MND', description: 'Cette page n’existe pas ou plus. Retrouvez votre parcours depuis l’accueil de la Maison MND.',
  corps: `<section class="page-hero page-hero--simple"><div class="conteneur"><div><p class="sur">Page introuvable</p><h1>Cette page n’existe pas.</h1><p class="ligne">Reprenez depuis l’accueil, ou trouvez votre parcours en trois questions.</p><div class="rangee" style="margin-top:22px"><a class="btn btn--plein" href="${BASE}">Retour à l’accueil</a><a class="btn" href="${lien('/mon-parcours/')}">Trouver mon parcours</a></div></div></div></section>`,
  noeuds: [noeudSite()],
}).replace('<link rel="canonical"', '<meta name="robots" content="noindex" /><link rel="canonical"'));

/* LE PLAN DU SITE — 18 septembre 2026, demandé par Yéman au pied de page.

   Il s'écrit APRÈS toutes les boucles, et c'est la seule place possible : il
   liste ce qui a été écrit, donc il ne peut pas naître au milieu de
   l'écriture. Il est bâti depuis les MÊMES sources que les pages (PAGES,
   LEGALES, articles) plutôt que depuis la liste des chemins, parce qu'une
   liste de chemins n'a pas de noms à afficher.

   Il entre dans `pagesEcrites` avant que `pages.json` ne soit écrit : il
   paraît donc de lui-même dans le plan pour les moteurs, sans rien ajouter
   ailleurs. */
const lignesDuPlan = (titre, entrees) => `<h2 class="plan-titre">${echappe(titre)}</h2><ul class="plan-liste">${entrees
  .map(([nom, chemin]) => `<li><a href="${attr(lien(chemin))}">${echappe(nom)}</a></li>`).join('')}</ul>`;

const PLAN = '/plan-du-site/';
ecrit(PLAN, page({
  chemin: PLAN,
  titre: 'Plan du site · Maison MND',
  description: 'Toutes les pages de la Maison MND en un coup d’œil : les parcours, la Maison, le Journal et les mentions.',
  corps: `
      <nav aria-label="Fil d’Ariane" class="conteneur"><ol class="fil"><li><a href="${BASE}">Accueil</a></li><li>·</li><li>Plan du site</li></ol></nav>
      <section class="page-hero page-hero--simple"><div class="conteneur"><div><h1>Plan du site</h1><p class="ligne">Toutes les pages de la Maison, rassemblées.</p></div></div></section>
      <section class="serre"><div class="conteneur"><div class="plan">
        ${lignesDuPlan('Les parcours et la Maison', [['Accueil', '/'], ...PAGES.map((p) => [p.court, p.chemin])])}
        ${INGREDIENTS.length ? lignesDuPlan('Nos ingrédients', INGREDIENTS.map((i) => [i.nom, cheminIngredient(i)])) : ''}
        ${articles.length ? lignesDuPlan('Le Journal', articles.map((a) => [a.titre, `/journal/${a.slug}/`])) : ''}
        ${lignesDuPlan('Les mentions', [...LEGALES.map((l) => [l.court, l.chemin]), ['Plan du site', PLAN]])}
      </div></div></section>`,
  noeuds: [noeudSite(), filAriane([['Accueil', '/'], ['Plan du site', PLAN]])],
}));
pagesEcrites.push(PLAN);

writeFileSync(path.join(SORTIE, 'pages.json'), JSON.stringify(pagesEcrites, null, 2));
console.log(`Site révélateur : ${pagesEcrites.length} pages écrites dans revelateur/ (base ${BASE}).`);
