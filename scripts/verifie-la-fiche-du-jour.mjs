import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA FICHE DU JOUR, EPROUVEE — `node scripts/verifie-la-fiche-du-jour.mjs`.

   Chantier 7 des huit (19 octobre 2026) : la matiere anonymisee, la
   consigne, la relecture, la garde pour la journee, le magasin et son
   verrou, et la structure (le bloc dans la fiche du rendez-vous, garde par
   la porte, aucune tache de nuit).

   LE MAGASIN TOURNE POUR DE VRAI, SUR UN FAUX CLAUDE. Le harnais l'importe
   tel quel ; seules deux portes sont remplacees, pour lui seul : `./ia-maison`
   (la fonction serveur, JAMAIS appelee dans un banc) par un compteur que le
   harnais pilote (`globalThis.__fauxClaude`), et `./sync` par une synchro
   muette. Le magasin (`./store`) est le vrai, sur un faux stockage.

   Le paquet s'ecrit sous node_modules/.cache, comme les autres bancs. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-fiche-du-jour');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'harnais.mjs');
const MAGASIN = path.join(racine, 'src', 'shared', 'ia-fiche-du-jour.ts');

const FAUX = {
  './ia-maison': 'export const demandeAClaude = (d) => globalThis.__fauxClaude(d);\nexport const useSaitIaMaison = () => null;\n',
  './sync': 'export function bindDocument() {}\nexport function bindCollection() {}\n',
};

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-fiche-du-jour.harnais.ts')],
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
    plugins: [{
      name: 'faux-claude',
      setup(b) {
        b.onResolve({ filter: /^\.\/(ia-maison|sync)$/ }, (a) => (path.resolve(a.importer) === MAGASIN ? { path: a.path, namespace: 'faux' } : undefined));
        b.onLoad({ filter: /.*/, namespace: 'faux' }, (a) => ({ contents: FAUX[a.path], loader: 'js' }));
      },
    }],
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
