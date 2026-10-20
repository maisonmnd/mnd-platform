import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE TRONE ALIGNE SUR LE JUGE UNIQUE, EPROUVE (lot L7, 20 octobre 2026).

   Le juge vit dans src/shared/abonnee-pur.ts ; il est pur. Le banc le compare
   aussi a l'ancien juge (src/shared/abonnements.ts), qui lie ses magasins au
   chargement : meme montage que verifie-fin-de-paquet, un navigateur de
   carton pour que les magasins se creent sans se plaindre. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules/.cache/verifie-le-trone-abonnee');
const sortie = path.join(dossier, 'harnais.mjs');
mkdirSync(dossier, { recursive: true });

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-trone-abonnee.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    banner: {
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' }, setInterval() { return 0; }, clearInterval() {} };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
    },
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
