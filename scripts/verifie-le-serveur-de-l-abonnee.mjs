import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE SERVEUR DE L'ABONNEE, EPROUVE.

   Le banc lit la migration 0138 et les quatre fonctions Edge de l'argent,
   et les compare au juge (src/shared/abonnee-pur.ts). Le vrai SQL se joue
   dans PGlite quand BANC_PGLITE nomme un dossier qui le porte
   (node_modules/@electric-sql/pglite) ; sans lui, cette partie se saute et
   le dit. Meme montage que verifie-le-releve-de-l-abonnee : un navigateur de
   carton pour que les magasins d'abonnements.ts se creent sans se plaindre. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules/.cache/verifie-le-serveur-de-l-abonnee');
const sortie = path.join(dossier, 'harnais.mjs');
mkdirSync(dossier, { recursive: true });

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-serveur-de-l-abonnee.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    external: ['esbuild', '@electric-sql/pglite'],
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    banner: {
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' }, setInterval() { return 0; }, clearInterval() {} };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
    },
  });
  process.chdir(racine);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
