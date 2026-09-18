import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA SAUVEGARDE ET « REMPLACER LA MAISON », EPROUVEES.

   Le code vit dans src/apps/trone/backup.ts, houseReset.ts et
   src/shared/store.ts (purgeDeReprise). S'il se trompe, « Remplacer la
   Maison » vide le serveur et ne remet rien.

   Un localStorage qui se comporte comme le vrai : `Object.keys` rend les
   cles rangees, et non les noms des methodes.
 */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-sauvegarde-maison-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-sauvegarde-maison.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    banner: {
      js: `const __m = new Map();
class __Stock {
  getItem(k) { return Object.prototype.hasOwnProperty.call(this, k) ? this[k] : null; }
  setItem(k, v) { this[k] = String(v); }
  removeItem(k) { delete this[k]; }
  key(i) { return Object.keys(this)[i] ?? null; }
  get length() { return Object.keys(this).length; }
}
globalThis.localStorage = new __Stock();
void __m;
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '', reload() {} } };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
    },
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
