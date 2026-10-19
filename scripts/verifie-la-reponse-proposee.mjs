import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA REPONSE WHATSAPP PROPOSEE, EPROUVEE — `node scripts/verifie-la-reponse-proposee.mjs`.

   Chantier 4 des huit (19 octobre 2026) : l'anonymisation de ce qui part
   chez Claude, la consigne (ce qu'elle interdit), la lecture (ce qu'elle
   refuse), la porte (qui peut demander), la structure (le bouton dans le
   composeur, l'envoi par le chemin existant, l'automate intact).

   Le paquet s'ecrit sous node_modules/.cache : le harnais importe les
   modules purs du depot, qu'esbuild assemble ici. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-reponse-proposee');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-reponse-proposee.harnais.ts')],
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
