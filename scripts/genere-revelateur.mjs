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
const { COMMUN, ACCUEIL, PAGES, DEVISE_COMPLETE } = contenu;

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
        <a class="btn btn--plein" href="${lien('/reserver/')}"><span class="btn__long">Prendre rendez-vous</span><span class="btn__court">Réserver</span></a>
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
  return `    <div class="joindre" id="joindre">
      <div class="joindre__volet" id="joindre-volet" role="group" aria-labelledby="joindre-titre" hidden>
        <div class="joindre__tete"><b id="joindre-titre">Nous joindre</b><button type="button" class="joindre__fermer" aria-label="Fermer">×</button></div>
        <a class="joindre__ligne" href="${attr(versLaReservation(besoin))}" data-mesure="parcours_choisi" data-parcours="${attr(besoin)}" data-sortie="flottant"><i aria-hidden="true"><svg><use href="#i-cal"/></svg></i><span>Réserver<small>Un entretien en trois pas, une consultation par rappel.</small></span></a>
        <a class="joindre__ligne" data-wa="${attr(besoin)}" data-sortie="flottant" href="https://wa.me/${NUMERO_WA}?text=${encodeURIComponent(COMMUN.messages[besoin] ?? COMMUN.messages.inconnu)}" target="_blank" rel="noopener"><i aria-hidden="true"><svg><use href="#i-wa"/></svg></i><span>Écrire sur WhatsApp<small>Le message de cette page est déjà écrit.</small></span></a>
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

function ilot(nom, p) {
  if (nom === 'triage') {
    const repli = PAGES.filter((x) => x.besoin && x.chemin !== p.chemin).slice(0, 5)
      .map((x) => `<li><a href="${attr(lien(x.chemin))}">${echappe(x.h1)}</a></li>`).join('');
    return `<section class="serre"><div class="conteneur"><div data-ilot="triage"><p class="ligne">Trois questions, et la bonne porte.</p><ul class="corps" style="margin-top:12px">${repli}</ul></div></div></section>`;
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
  const enTete = p.ilot === 'triage' || p.ilot === 'joindre';
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
  const cartes = a.portes.cartes.map((c) => {
    const p = PAGES.find((x) => x.chemin === c.vers);
    return `<a class="porte" href="${attr(lien(c.vers))}" data-mesure="parcours_choisi" data-parcours="${attr(p?.besoin ?? 'inconnu')}">
          ${c.image ? image(c.image) : `<div class="tuile">${echappe(c.titre.length > 18 ? p?.court ?? c.titre : c.titre)}<small>Photo de la séance à venir</small></div>`}
          <div class="porte-corps"><h3>${echappe(c.titre)}</h3><p>${echappe(c.ligne)}</p><span class="suite">${echappe(c.suite)} <svg><use href="#i-fleche"/></svg></span></div>
        </a>`;
  }).join('\n        ');
  const journal = articles.slice(0, 3).map((art) => `<a class="article" href="${attr(lien(`/journal/${art.slug}/`))}">${photo(art.image, '', 'alt="" loading="lazy" width="960" height="600"')}<h3>${echappe(art.titre)}</h3><p>${echappe(art.description)}</p></a>`).join('\n        ');
  return `
      <!-- LE PREMIER ÉCRAN PLEINE LARGEUR — 23 septembre 2026, maquette validée.
           La photo sous le texte, l'entête posée dessus (la barre, transparente
           sur l'accueil), la ligne du métier en pastille, le titre en bas à
           gauche. Cette image est la plus grosse de la page : jamais paresseuse,
           et préchargée depuis l'entête du document. Le paragraphe ne vit plus
           ici, les cinq portes le disent juste dessous. -->
      <section class="hero-plein">
        ${photo(PHOTO_ACCUEIL, 'class="hero-plein__photo"', 'alt="Une couronne de locks et un collier de cauris" width="800" height="1000" fetchpriority="high" decoding="async"')}
        <div class="hero-plein__voile" aria-hidden="true"></div>
        <div class="conteneur hero-plein__texte">
          <p class="pastille metier">${echappe(a.metier)}</p>
          <h1>${echappe(a.h1)}</h1>
          <p class="devise">${echappe(a.devise.fon)}<small>${echappe(a.devise.sens)}</small></p>
          <div class="rangee">${a.boutons.map((b, i) => bouton(b, i === 0 ? 'btn btn--plein' : 'btn')).join('')}</div>
        </div>
      </section>

      <!-- TROIS PROMESSES SOUS LE GRAND ÉCRAN — 22 septembre 2026. L'équivalent
           du « Switch in 15 minutes » de T-Mobile : la réassurance vivait trois
           écrans plus bas. Chacune est tenue par le site, vérifiée avant d'être
           écrite (contenu.ts, ACCUEIL.promesses). Depuis le 23, dans le bandeau
           indigo profond sous la photo. -->
      <div class="promesses promesses--sombre"><div class="conteneur">
        ${a.promesses.map((g) => `<div class="promesse"><i aria-hidden="true"><svg><use href="#i-coche"/></svg></i><div><b>${echappe(g.titre)}</b><small>${echappe(g.ligne)}</small></div></div>`).join('\n        ')}
      </div></div>

      <!-- LE BANDEAU DE L'OFFRE EN COURS NE VIT PLUS ICI — 22 septembre 2026.
           Posé le 18, il annonçait l'offre du moment entre le grand écran et
           les portes. Depuis que les offres ont leur section sur l'accueil, il
           disait la même offre deux fois sur la même page. « Épure-moi cette
           page, beaucoup trop chargée » (Yéman) : la carte suffit. L'îlot
           reste dans le code, prêt à revenir sur une autre page. -->

      <section id="portes"><div class="conteneur">
        <div class="tete"><p class="sur">${echappe(a.portes.sur)}</p><h2>${echappe(a.portes.titre)}</h2></div>
        <div class="portes">
        ${cartes}
        </div>
        <div class="repli"><p>${echappe(a.portes.repli)}</p>${bouton(a.portes.repliBouton, 'btn btn--fort')}</div>
      </div></section>

      <!-- LES OFFRES SUR L'ACCUEIL — 22 septembre 2026, à la manière des
           « Deals ». L'îlot est le même que sur /les-offres/, en genre
           « accueil » : sans onglets, les offres en cours seulement. Le repli
           dit où demander si rien ne se charge. -->
      <section class="vt-offres" id="offres"><div class="conteneur">
        <div class="tete"><p class="sur">${echappe(a.offres.sur)}</p><h2>${echappe(a.offres.titre)}</h2></div>
        <div data-ilot="offres" data-genre="accueil">${offresDansLaPage('accueil')}</div>
      </div></section>

      <!-- LA BANDE DE CONFIANCE NE VIT PLUS SUR L'ACCUEIL — 22 septembre 2026.
           Les trois promesses sous le grand écran portent la réassurance ;
           une seconde bande sombre disait la même chose plus bas. La section
           « confiance » reste disponible aux pages libres (rendSection). -->

      <!-- LES COURONNES DE LA MAISON — 23 septembre 2026, sept visages depuis
           le 26. Des clientes de la Maison, posées AU-DESSUS des avis : les
           visages et les mots de leurs semblables ensemble, c'est la preuve
           entière. Hors de l'îlot, qui ne redessine que sa propre boîte.
           Aucun prénom. Alt vide sur toutes (le-trone-35, 23 septembre) : rien
           dans ces images n'est nommable une par une sans nommer une femme, et
           des alt identiques ne seraient que du bruit.
           LA LIGNE QUI ANNONÇAIT L'ACCORD A ÉTÉ RETIRÉE LE 26 SEPTEMBRE, à la
           demande de Yéman. L'accord lui-même n'a pas changé : chaque photo
           reste inscrite au registre docs/site-revelateur/photos.md avant
           d'être servie, et le harnais le vérifie. C'est l'annonce qui s'est
           tue, pas la règle. Le texte de remplacement des images s'appuyait
           sur cette ligne pour porter le sens du groupe ; il ne le peut plus,
           et c'est le titre « Celles qui nous font confiance » qui le porte
           désormais, juste au-dessus. -->
      <section class="avis" id="avis">
        <div class="conteneur couronnes">
          <div class="tete"><p class="sur">${echappe(a.couronnes.sur)}</p><h2>${echappe(a.couronnes.titre)}</h2>${a.couronnes.ligne ? `<p class="ligne">${echappe(a.couronnes.ligne)}</p>` : ''}</div>
          <div class="couronnes__bande">
            ${a.couronnes.images.map((img) => `<figure>${image(img, '')}</figure>`).join('\n            ')}
          </div>
        </div>
        <div data-ilot="avis"><div class="conteneur"><div><p class="sur">Avis Google</p><h2 style="margin-top:10px">Ce que disent nos clientes</h2><p class="legende" style="margin-top:12px">Les avis de la Maison se lisent sur sa fiche Google.</p></div></div></div>
      </section>

      <section class="fondateurs" id="maison"><div class="conteneur">
        ${image(a.fondateurs.image, 'Brice et Yéman Ahouansou')}
        <div><p class="sur">${echappe(a.fondateurs.sur)}</p><h2 style="margin-top:10px">${echappe(a.fondateurs.titre)}</h2><p class="ligne" style="margin-top:12px">${echappe(a.fondateurs.ligne)}</p>
          <p class="message">${echappe(a.fondateurs.message)}</p>
          <div class="trois">${a.fondateurs.trois.map((t) => `<b>${echappe(t)}</b>`).join('')}</div>
        </div>
      </div></section>

      <section class="journal" id="journal" style="background:var(--fond-2); border-block:1px solid var(--filet)"><div class="conteneur">
        <div class="tete"><p class="sur">${echappe(a.journal.sur)}</p><h2>${echappe(a.journal.titre)}</h2></div>
        <div class="articles">
        ${journal}
        </div>
        <p style="margin-top:18px"><a class="btn btn--lien" href="${lien('/journal/')}">Tous les articles</a></p>
      </div></section>

      <section class="appel"><div class="conteneur">
        <div><h2>${echappe(a.appel.titre)}</h2><p class="ligne" style="margin-top:8px">${echappe(a.appel.ligne)}</p></div>
        <div class="rangee">${a.appel.boutons.map((b, i) => bouton(b, i === 0 ? 'btn btn--fort' : 'btn')).join('')}</div>
      </div></section>`;
}

/* ── Le Journal, depuis les fichiers Markdown ────────────────────────── */
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
const pagesEcrites = [];

ecrit('/', page({
  chemin: '/', titre: ACCUEIL.titre, description: ACCUEIL.description, corps: rendAccueil(articles),
  classeBody: 'accueil-plein', precharge: `/assets/photos/site/${PHOTO_ACCUEIL}`,
  noeuds: [noeudMaison(), noeudSite(), filAriane([['Accueil', '/']])],
}));
pagesEcrites.push('/');

for (const p of PAGES) {
  const estService = !!(p.cta || p.pas);
  let corps;
  if (p.chemin === '/journal/') {
    const liste = articles.map((art) => `<a class="article" href="${attr(lien(`/journal/${art.slug}/`))}">${photo(art.image, '', 'alt="" loading="lazy" width="960" height="600"')}<h3>${echappe(art.titre)}</h3><p>${echappe(art.description)}</p></a>`).join('\n        ');
    corps = rendLibre(p, `<section class="serre"><div class="conteneur"><div class="articles">${liste}</div></div></section>`);
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
        ${articles.length ? lignesDuPlan('Le Journal', articles.map((a) => [a.titre, `/journal/${a.slug}/`])) : ''}
        ${lignesDuPlan('Les mentions', [...LEGALES.map((l) => [l.court, l.chemin]), ['Plan du site', PLAN]])}
      </div></div></section>`,
  noeuds: [noeudSite(), filAriane([['Accueil', '/'], ['Plan du site', PLAN]])],
}));
pagesEcrites.push(PLAN);

writeFileSync(path.join(SORTIE, 'pages.json'), JSON.stringify(pagesEcrites, null, 2));
console.log(`Site révélateur : ${pagesEcrites.length} pages écrites dans revelateur/ (base ${BASE}).`);
