import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA CAPTURE QUI S'ENCAISSE, EPROUVEE — `node scripts/verifie-la-capture-qui-s-encaisse.mjs`.

   Le chantier `capture` (19 octobre 2026) : la regle, la lecture, la
   consigne, le passage de lecture rejoue avec un FAUX Claude, et la
   structure des ecrans.

   LE VRAI CLAUDE N'EST JAMAIS APPELE. Le module `shared/ia-maison` (la porte
   vers la fonction) est remplace, au moment du paquet, par un faux que le
   harnais programme : `globalThis.__fauxClaude(demande)`. Rien d'autre n'est
   remplace : la regle pure, le magasin et le passage sont les vrais.

   Le paquet s'ecrit sous node_modules/.cache, efface en sortant. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-capture-qui-s-encaisse');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'harnais.mjs');

const fauxClaude = {
  name: 'faux-claude',
  setup(b) {
    /* `./ia-maison` seul, jamais `./ia-maison-pur` (le contrat reste le vrai). */
    b.onResolve({ filter: /(^|\/)ia-maison$/ }, () => ({ path: 'faux-ia-maison', namespace: 'faux' }));
    b.onLoad({ filter: /.*/, namespace: 'faux' }, () => ({
      loader: 'js',
      contents: `
export const demandeAClaude = (d) => globalThis.__fauxClaude(d);
export const photoPourClaude = async () => ({ base64: 'A'.repeat(400), mime: 'image/jpeg' });
export const useSaitIaMaison = () => true;
export const versionDeIaMaison = async () => '2026-10-19-a';
`,
    }));
  },
};

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-capture-qui-s-encaisse.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    external: ['esbuild', 'typescript'],
    loader: { '.css': 'empty' },
    plugins: [fauxClaude],
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
    banner: {
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, location: { href: '', hash: '' }, setTimeout, clearTimeout, setInterval, clearInterval };
globalThis.document = { body: { dataset: {} }, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
    },
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
