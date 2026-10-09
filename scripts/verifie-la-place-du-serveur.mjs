import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA PLACE, JUGEE PAR LE SERVEUR, EPROUVEE (9 octobre 2026).

   `node scripts/verifie-la-place-du-serveur.mjs`

   Le juge vit dans src/shared/place-du-serveur.ts : le site (demande-submit)
   et WhatsApp (whatsapp-automate) le recopient entre ses reperes. Le harnais
   (verifie-la-place-du-serveur.harnais.ts, empaquete ici par esbuild) joue
   ses cas sur l'original, sur chaque copie Edge, puis sur chaque panne.
   Les pannes s'injectent en memoire : aucun fichier du depot n'est reecrit.
 */

const racine = path.resolve(import.meta.dirname, '..');
process.chdir(racine);
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-place-du-serveur-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-place-du-serveur.harnais.ts')],
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
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
    },
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
