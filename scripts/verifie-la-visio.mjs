import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { CIBLE, fichierAttendu } from './visio-salle-serveur.mjs';

/* LA VISIO DE QUINZE MINUTES, ÉPROUVÉE : `node scripts/verifie-la-visio.mjs`.

   Le harnais (verifie-la-visio.harnais.ts) importe la vraie couche de données ;
   on la bundle avec esbuild (déjà là via Vite) en simulant juste ce que le
   navigateur fournit : localStorage, window, document. Aucun framework de test
   n'entre au dépôt — un échec sort en code 1, comme n'importe quel script. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-visio-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-visio.harnais.ts')],
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

/* LE FICHIER DÉPLOYÉ SUIT LE DÉPÔT : la fonction est regroupée depuis
   scripts/serveur/visio-salle.ts et visio-pur ; un retard se dit ici. */
let present = '';
try { present = readFileSync(path.join(racine, CIBLE), 'utf8').replace(/\r\n/g, '\n'); } catch { /* absent */ }
if (present !== await fichierAttendu(racine)) {
  console.log(`ECHEC ${CIBLE} a pris du retard sur le depot : node scripts/visio-salle-serveur.mjs`);
  process.exitCode = 1;
} else console.log(`OK    ${CIBLE} suit le depot`);
