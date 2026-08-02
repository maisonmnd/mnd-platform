import { execSync } from 'node:child_process';
import { renameSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import path from 'node:path';

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

const SITES = [
  {
    name: 'trone',
    base: '/trone/',
    apps: 'trone,consultation,certificat,bilan,bulletin',
    rename: { 'trone.html': 'index.html' },
    // Connexion obligatoire pour l'ERP (le personnel se connecte par e-mail).
    env: { VITE_REQUIRE_AUTH: 'true' },
  },
  {
    name: 'couronne',
    base: '/couronne/',
    apps: 'couronne',
    rename: { 'couronne.html': 'index.html' },
    // Connexion cliente obligatoire (OTP e-mail).
    env: { VITE_REQUIRE_AUTH: 'true' },
  },
  { name: 'lokaa', base: '/lokaa/', apps: 'lokaa', rename: { 'lokaa.html': 'index.html' } },
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
  writeFileSync(path.join(dist, '.nojekyll'), '');
  writeFileSync(path.join(dist, 'version.json'), JSON.stringify({ build: BUILD_ID }));
  cpSync(dist, path.join(out, site.name), { recursive: true });
  rmSync(dist, { recursive: true, force: true });
}
console.log('\nSites construits dans dist-sites/.');
