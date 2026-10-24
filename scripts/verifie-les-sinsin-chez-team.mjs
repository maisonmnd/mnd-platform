import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LES SINSIN CHEZ TEAM, EPROUVES.

   La regle vit dans src/shared/agenda-pur.ts (estUnSinsin, maitresPermis) ; elle est pure. Le banc lit
   aussi les quatre portes, le + RDV et les copies Edge (texte). */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules/.cache/verifie-les-sinsin-chez-team');
const sortie = path.join(dossier, 'harnais.mjs');
mkdirSync(dossier, { recursive: true });

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-les-sinsin-chez-team.harnais.ts')],
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
