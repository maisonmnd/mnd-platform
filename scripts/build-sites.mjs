import { execSync } from 'node:child_process';
import { renameSync, writeFileSync, rmSync, cpSync, existsSync } from 'node:fs';
import path from 'node:path';

/* Construit les 4 sites séparés de la Maison MND (déploiement GitHub Pages) :

     mnd-platform  → portail (hub) — liens externes vers les trois sœurs
     trone         → Le Trône + La Consultation + le Certificat (embarqués)
     couronne      → Ma Couronne
     lokaa         → LOKAA

   Toutes les surfaces restent sur la même origine (yemanb.github.io), donc les
   ponts localStorage et la synchronisation Supabase continuent de fonctionner
   entre elles. Sorties dans dist-sites/<nom>/.

   Usage : node scripts/build-sites.mjs
   Requiert : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans l'environnement
   (ou .env.local, lu par Vite). */

const root = path.resolve(import.meta.dirname, '..');
const HOST = 'https://yemanb.github.io';

const SITES = [
  {
    name: 'trone',
    base: '/trone/',
    apps: 'trone,consultation,certificat',
    rename: { 'trone.html': 'index.html' },
  },
  { name: 'couronne', base: '/couronne/', apps: 'couronne', rename: { 'couronne.html': 'index.html' } },
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

const out = path.join(root, 'dist-sites');
rmSync(out, { recursive: true, force: true });

for (const site of SITES) {
  console.log(`\n═══ ${site.name} (base ${site.base}) ═══`);
  execSync('npx vite build', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_BASE: site.base, VITE_APPS: site.apps, ...(site.env ?? {}) },
  });
  const dist = path.join(root, 'dist');
  for (const [from, to] of Object.entries(site.rename)) {
    if (existsSync(path.join(dist, from))) renameSync(path.join(dist, from), path.join(dist, to));
  }
  writeFileSync(path.join(dist, '.nojekyll'), '');
  cpSync(dist, path.join(out, site.name), { recursive: true });
  rmSync(dist, { recursive: true, force: true });
}
console.log('\nSites construits dans dist-sites/.');
