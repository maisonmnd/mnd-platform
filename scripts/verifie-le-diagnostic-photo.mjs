import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE DIAGNOSTIC PHOTO DES LOCKS, EPROUVE — `node scripts/verifie-le-diagnostic-photo.mjs`.

   19 octobre 2026. La regle (table, recommandation, peau, lecture,
   consigne), la fonction diagnostic-locks rejouee sur une fausse base (sa
   porte, son interrupteur, son seau, son coffre, ses 90 jours, son plafond),
   la migration 0137 et les ecrans de La Consultation, de Ma Couronne et du
   Trone.

   Le paquet s'ecrit sous node_modules/.cache : le harnais y retrouve esbuild
   pour transpiler ce qu'il extrait de la fonction Deno. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-le-diagnostic-photo');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-diagnostic-photo.harnais.ts')],
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
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
