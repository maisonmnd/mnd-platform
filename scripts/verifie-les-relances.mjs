import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LES RELANCES DES FACTURES, EPROUVEES — `node scripts/verifie-les-relances.mjs`.

   La maquette « Les relances » (18 octobre 2026) : les regles pures et la
   VRAIE tournee du serveur (relances-factures), rejouee contre une base simulee.

   Le paquet s'ecrit sous node_modules/.cache : le harnais y retrouve esbuild
   pour transpiler ce qu'il extrait des fonctions Deno. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-les-relances');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-les-relances.harnais.ts')],
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
