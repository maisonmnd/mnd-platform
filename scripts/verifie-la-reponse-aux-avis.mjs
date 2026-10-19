import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA REPONSE AUX AVIS GOOGLE, EPROUVEE — `node scripts/verifie-la-reponse-aux-avis.mjs`.

   Chantier 5 des huit chantiers Claude (19 octobre 2026) : la consigne, la
   relecture de ce que Claude rend, les brouillons (cinq par ouverture, un a
   la fois, jamais deux fois le meme), l'ecran (Copier seulement, rien ne part
   vers Google), la fonction avis-google-releve intacte.

   Le paquet s'ecrit sous node_modules/.cache ; le harnais n'appelle jamais
   la vraie fonction ia-maison. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-reponse-aux-avis');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-reponse-aux-avis.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    external: ['esbuild'],
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    banner: {
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
    },
  });
  process.chdir(racine);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
