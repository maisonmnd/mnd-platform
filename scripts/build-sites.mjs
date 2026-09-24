import { execSync } from 'node:child_process';
import { renameSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { origineDuCompte } from './origine-des-pages.mjs';
import { adressesARenvoyer, cibleDe, pageDeRenvoi, page404DeRenvoi } from './renvoi.mjs';

/* Construit les 4 sites séparés de la Maison MND (déploiement GitHub Pages) :

     mnd-platform  → portail (hub) — liens externes vers les trois sœurs
     trone         → Le Trône + La Consultation + le Certificat (embarqués)
     couronne      → Ma Couronne
     lokaa         → LOKAA

   Toutes les surfaces restent sur la MÊME origine (le compte GitHub Pages), donc
   les ponts localStorage et la synchronisation Supabase continuent de fonctionner
   entre elles. Sorties dans dist-sites/<nom>/.

   Les liens entre sœurs sont des CHEMINS relatifs à l'origine (`/trone/`,
   `/couronne/`…) : ils ne contiennent AUCUN nom de domaine, donc changer de
   compte GitHub (yemanb.github.io → maisonmnd.github.io…) ne casse rien et ne
   demande aucune modification de code — juste un redéploiement vers les nouveaux
   dépôts. Ne jamais réintroduire un domaine en dur ici.

   Usage : node scripts/build-sites.mjs
   Requiert : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans l'environnement
   (ou .env.local, lu par Vite). */

const root = path.resolve(import.meta.dirname, '..');
const HOST = ''; // chemins relatifs à l'origine — indépendants du nom de domaine

/* ══ LA CARTE DE LIEN A BESOIN D'UNE ADRESSE ABSOLUE — 7 septembre 2026 ═
   og:image et og:url ne tolèrent pas un chemin relatif : WhatsApp les lit
   depuis SES serveurs, sans savoir d'où vient la page. Le domaine se LIT
   depuis l'origine du dépôt, comme le fait déjà `publie.mjs` — jamais écrit
   en dur, changer de compte GitHub ne casse rien. Sans remote (archive,
   poste neuf), les repères restent : la carte se dégrade, le site marche. */
function origineDesPages() {
  try {
    const url = execSync('git remote get-url origin', { cwd: root, encoding: 'utf8' }).trim();
    const m = url.match(/[/:]([^/:]+)\/[^/]+?(?:\.git)?$/);
    /* Le domaine propre du compte s'il en a un (19 septembre 2026), lu chez
       GitHub : voir `origine-des-pages.mjs`. */
    return m ? origineDuCompte(m[1]) : '';
  } catch {
    return '';
  }
}
const ORIGINE_PAGES = origineDesPages();

/* QUI SE LAISSE EXPLORER PAR GOOGLE, ET QUI NON — 17 septembre 2026.
   « On y va pour le moteur » (Yéman). La vitrine de l'Académie, le portail et
   LOKAA sont faits pour être trouvés. Le Trône est un ERP et Ma Couronne
   demande un compte : les laisser indexer offrirait aux moteurs des écrans
   que personne ne doit lire, et des adresses de connexion. */
const INDEXABLES = new Set(['academie', 'lokaa', 'mnd-platform', 'revelateur']);

/* À LA RACINE DU DOMAINE, SEULEMENT CE QUI EST À LA VITRINE — 24 septembre 2026.
   `public/` est recopié tel quel dans CHAQUE site. Tant que la vitrine vivait
   sous /revelateur/, le service worker du Trône, les manifestes des
   applications, la page de paiement du Trône (que le Trône lie sur SON
   adresse, /trone/payer.html), l'affiche MoMo et les deux anciennes pages
   légales de Ma Couronne (celles que Meta connaît sous /couronne/) y étaient
   recopiés sans conséquence. Le jour où la vitrine est allée à la racine, ils
   sont devenus maisonmnd.com/payer.html, maisonmnd.com/confidentialite.html :
   la portée d'une page de la vitrine, sans qu'aucune page ne les lie.
   Le site qui vit à la racine ne garde de `public/` que ce qui lui appartient :
   les jetons de vérification Google (jamais effacés), la consigne `.nojekyll`
   que Pages lit, et le dossier assets/.
   Tout autre fichier posé à la racine de `public/` appartient aux applications
   et reste sous leur chemin. Le harnais verifie-les-adresses tient la règle
   dans les deux sens : un fichier cité par une page de la vitrine et absent
   crie aussi. */
const JETON_GOOGLE = /^google[0-9a-f]+\.html$/i;

const SITES = [
  {
    name: 'trone',
    base: '/trone/',
    apps: 'trone,consultation,certificat,bilan,bulletin,carte',
    rename: { 'trone.html': 'index.html' },
    // Connexion obligatoire pour l'ERP (le personnel se connecte par e-mail).
    env: { VITE_REQUIRE_AUTH: 'true' },
  },
  {
    name: 'couronne',
    base: '/couronne/',
    apps: 'couronne',
    rename: { 'couronne.html': 'index.html' },
    // Connexion cliente obligatoire — et SESSION À PART (même origine que le
    // Trône : sans tiroir séparé, l'admin connecté au Trône bloquait Ma
    // Couronne dans le même navigateur).
    env: { VITE_REQUIRE_AUTH: 'true', VITE_AUTH_SCOPE: 'couronne' },
  },
  { name: 'lokaa', base: '/lokaa/', apps: 'lokaa', rename: { 'lokaa.html': 'index.html' } },
  /* MND ACADÉMIE — 17 septembre 2026. La vitrine publique des neuf parcours.
     Aucune connexion : elle se lit, elle ne s'ouvre pas. */
  { name: 'academie', base: '/academie/', apps: 'academie', rename: { 'academie.html': 'index.html' } },
  /* LE SITE RÉVÉLATEUR — 17 septembre 2026. La porte d'entrée publique : de
     vraies pages, une adresse par dossier, générées par
     `scripts/genere-revelateur.mjs` avant la construction (vite.config.ts
     s'en charge). Vite les écrit sous `dist/revelateur/…` : `racine` les
     remonte à la racine du site, où GitHub Pages les sert. */
  /* À LA RACINE DU DOMAINE — 24 septembre 2026. L'état des lieux du site
     l'a mesuré : la racine servait une page vide marquée noindex qui
     renvoyait par script vers /revelateur/, si bien que l'adresse imprimée
     partout n'était pas celle que Google connaissait. La vitrine se
     construit donc avec la base « / » ; `publie.mjs` la dépose sur le dépôt
     principal du compte (voir `destinationDuSite`), et l'ancien chemin
     /revelateur/ devient un site de RENVOIS, construit juste après celui-ci.
     L'ancien préfixe reste écrit ici, à un seul endroit. */
  {
    name: 'revelateur', base: '/', apps: 'revelateur', rename: {}, racine: 'revelateur',
    ancienPrefixe: '/revelateur',
    env: { VITE_LINK_COURONNE: `${HOST}/couronne/`, VITE_LINK_ACADEMIE: `${HOST}/academie/` },
  },
  {
    name: 'mnd-platform',
    base: '/mnd-platform/',
    apps: 'portail',
    rename: {},
    env: {
      VITE_LINK_TRONE: `${HOST}/trone/`,
      VITE_LINK_COURONNE: `${HOST}/couronne/`,
      VITE_LINK_LOKAA: `${HOST}/lokaa/`,
      VITE_LINK_CONSULTATION: `${HOST}/trone/consultation.html`,
      VITE_LINK_CERTIFICAT: `${HOST}/trone/certificat.html`,
    },
  },
];

/* EMPREINTE DE CONSTRUCTION — injectee dans le bundle ET deposee a cote de lui.
   L'app compare les deux et se recharge quand elles divergent : c'est ce qui
   fait qu'un deploiement atteint enfin le comptoir sans purge manuelle. */
/** Toutes les pages HTML d'un dossier, chemins relatifs avec des barres obliques. */
function pagesHtml(dossier, rel = '') {
  const out = [];
  for (const f of readdirSync(dossier)) {
    const chemin = path.join(dossier, f);
    const ici = rel ? `${rel}/${f}` : f;
    if (statSync(chemin).isDirectory()) out.push(...pagesHtml(chemin, ici));
    else if (f.endsWith('.html')) out.push(ici);
  }
  return out;
}

const BUILD_ID = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

const out = path.join(root, 'dist-sites');
rmSync(out, { recursive: true, force: true });

for (const site of SITES) {
  console.log(`\n═══ ${site.name} (base ${site.base}) ═══`);
  execSync('npx vite build', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE: site.base, VITE_APPS: site.apps, VITE_BUILD_ID: BUILD_ID, ...(site.env ?? {}) },
  });
  const dist = path.join(root, 'dist');
  for (const [from, to] of Object.entries(site.rename)) {
    if (existsSync(path.join(dist, from))) renameSync(path.join(dist, from), path.join(dist, to));
  }
  if (site.racine) {
    const nid = path.join(dist, site.racine);
    if (existsSync(nid)) {
      for (const f of readdirSync(nid)) renameSync(path.join(nid, f), path.join(dist, f));
      rmSync(nid, { recursive: true, force: true });
    }
  }
  writeFileSync(path.join(dist, '.nojekyll'), '');
  writeFileSync(path.join(dist, 'version.json'), JSON.stringify({ build: BUILD_ID }));

  /* LES MAQUETTES NE PARTENT PAS AVEC LE SITE — 18 août 2026.

     Vite recopie `public/` tel quel : une maquette posée là se retrouvait SERVIE
     sur les quatre sites, et son contenu entrait dans l'historique des dépôts
     `gh-pages`, qui sont publics. Or une maquette parle de VRAIES pièces pour
     être crédible — « la facture d'Hermine », « les 93 locks de Jade » — et ce
     qui est publié une fois ne se reprend jamais tout à fait.

     Elles restent lisibles en développement (localhost:5173/maquette-*.html),
     là où elles servent. Elles ne sortent pas. */
  const restees = readdirSync(dist).filter((f) => /^maquette-.*\.html$/i.test(f));
  for (const f of restees) rmSync(path.join(dist, f));
  if (restees.length) console.log(`  maquettes retirées du site : ${restees.join(', ')}`);
  if (site.base === '/') {
    const dossierPublic = path.join(root, 'public');
    const auxApplications = readdirSync(dossierPublic)
      .filter((f) => !statSync(path.join(dossierPublic, f)).isDirectory() && !JETON_GOOGLE.test(f) && f !== '.nojekyll' && existsSync(path.join(dist, f)));
    for (const f of auxApplications) rmSync(path.join(dist, f));
    if (auxApplications.length) console.log(`  rendus aux applications, hors de la racine du domaine : ${auxApplications.join(', ')}`);
  }
  cpSync(dist, path.join(out, site.name), { recursive: true });
  rmSync(dist, { recursive: true, force: true });

  /* Les repères de la carte de lien deviennent les adresses réelles du site.
     Chaque page porte la sienne ; l'image, elle, vit à la racine du site. */
  if (ORIGINE_PAGES) {
    const dossierSite = path.join(out, site.name);
    const lienSite = `${ORIGINE_PAGES}${site.base}`;
    /* Récursif depuis le 17 septembre : le site révélateur range une page
       par dossier, et chacune porte sa canonique et sa carte de lien. */
    for (const rel of pagesHtml(dossierSite)) {
      const chemin = path.join(dossierSite, rel);
      const avant = readFileSync(chemin, 'utf8');
      if (!avant.includes('__LIEN_DU_SITE__')) continue;
      const lienPage = rel === 'index.html' ? lienSite : `${lienSite}${rel.replace(/index\.html$/, '')}`;
      writeFileSync(chemin, avant
        .replaceAll('__LIEN_DE_LA_PAGE__', lienPage)
        .replaceAll('__LIEN_DU_SITE__', lienSite));
    }
  }

  /* ── ROBOTS ET SITEMAP — 17 septembre 2026 ────────────────────────
     Sans eux, un moteur explore au hasard et peut indexer ce qui ne le
     regarde pas. Ils sont ÉCRITS ICI, site par site, parce que `public/` est
     recopié tel quel dans TOUS les sites : un seul fichier partagé aurait
     ouvert le Trône aux moteurs pour ouvrir la vitrine.

     AUCUN DOMAINE EN DUR : l'adresse vient de `ORIGINE_PAGES`, lue sur le
     dépôt. En développement elle est vide, et le sitemap ne s'écrit pas,
     faute d'adresse absolue : un sitemap relatif ne vaut rien. */
  const dossierPublie = path.join(out, site.name);
  const indexable = INDEXABLES.has(site.name);
  /* PAS DE « Disallow: /trone/ » DANS LE ROBOTS.TXT DE LA RACINE, et c'est
     voulu (24 septembre 2026). Le Trône et Ma Couronne sont DÉJÀ dans
     Google. Un Disallow empêcherait Google de revenir lire la balise
     noindex qu'ils portent désormais, et les figerait en « indexés, mais
     bloqués », indéfiniment. La balise seule les fait sortir ; le Disallow
     ne vient qu'APRÈS leur disparition des résultats, et le harnais
     verifie-les-adresses refuse qu'on le pose avant. Ne « réparez » pas
     cet oubli : ce n'en est pas un. */
  const adresseDuSite = ORIGINE_PAGES ? `${ORIGINE_PAGES}${site.base}` : '';
  const robots = !indexable
    ? `User-agent: *
Disallow: /
`
    : adresseDuSite
      ? `User-agent: *
Allow: /

Sitemap: ${adresseDuSite}sitemap.xml
`
      : `User-agent: *
Allow: /
`;
  writeFileSync(path.join(dossierPublie, 'robots.txt'), robots);
  if (indexable && adresseDuSite) {
    const jour = new Date().toISOString().slice(0, 10);
    /* Un site à une page ne liste que sa racine ; le site révélateur liste
       chacune de ses adresses canoniques (la forme avec barre finale), la
       page 404 exceptée. */
    const adresses = site.racine
      ? pagesHtml(dossierPublie)
        .filter((rel) => rel.endsWith('index.html'))
        .map((rel) => `${adresseDuSite}${rel.replace(/index\.html$/, '')}`)
      : [adresseDuSite];
    writeFileSync(path.join(dossierPublie, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${adresses.map((loc) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${jour}</lastmod>
    <changefreq>weekly</changefreq>
  </url>`).join('\n')}
</urlset>
`);
    if (site.racine) console.log(`  sitemap : ${adresses.length} adresses`);
  }
  console.log(`  ${indexable ? 'explorable' : 'ferme aux moteurs'} : robots.txt${indexable && adresseDuSite ? ' + sitemap.xml' : ''}`);

  /* ── LE SITE QUI VIT À LA RACINE PORTE LE DOMAINE ────────────────
     GitHub Pages lit le fichier CNAME du dépôt principal ; sans lui, une
     publication REFONDUE effacerait le domaine, et le site retomberait sur
     l'adresse github.io. Le nom vient de la configuration Pages lue chez
     GitHub (`origineDesPages`), jamais de ce dépôt, qui est public. Sans
     domaine propre, pas de CNAME : l'adresse github.io se sert d'elle-même. */
  if (site.base === '/' && ORIGINE_PAGES) {
    const hote = new URL(ORIGINE_PAGES).host;
    if (!hote.endsWith('.github.io')) writeFileSync(path.join(dossierPublie, 'CNAME'), `${hote}\n`);
  }

  /* ── LES ANCIENNES ADRESSES RENVOIENT VERS LES NOUVELLES ─────────
     Une page par adresse de la vitrine, plus un 404 qui garde le chemin :
     voir `renvoi.mjs`. Construit dans un site à part, parce que c'est un
     AUTRE dépôt qui le sert (l'ancien site-projet), et que `publie.mjs` sait
     l'y déposer. Sans adresse publique (développement), rien ne s'écrit. */
  if (site.ancienPrefixe && adresseDuSite) {
    const renvoi = path.join(out, `${site.name}-renvoi`);
    rmSync(renvoi, { recursive: true, force: true });
    const pages = adressesARenvoyer(pagesHtml(dossierPublie));
    for (const rel of pages) {
      const chemin = path.join(renvoi, rel);
      mkdirSync(path.dirname(chemin), { recursive: true });
      writeFileSync(chemin, pageDeRenvoi(cibleDe(adresseDuSite, rel)));
    }
    writeFileSync(path.join(renvoi, '404.html'), page404DeRenvoi(adresseDuSite, site.ancienPrefixe));
    writeFileSync(path.join(renvoi, '.nojekyll'), '');
    writeFileSync(path.join(renvoi, 'version.json'), JSON.stringify({ build: BUILD_ID }));
    writeFileSync(path.join(renvoi, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
    console.log(`  renvois : ${pages.length} anciennes adresses sous ${site.ancienPrefixe}/ renvoient vers ${adresseDuSite}`);
  }
}
console.log('\nSites construits dans dist-sites/.');
