import { build, transform } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* REGLER SA SEANCE, EPROUVE (25 octobre 2026).

   La regle vit dans src/shared/regler-la-seance-pur.ts ; elle est pure. Le banc
   rejoue aussi la VRAIE fonction regler-la-seance contre une base et un KkiaPay
   simules : le lanceur la transpile ici (sans son import d'esm.sh) et passe le
   texte au harnais. Meme montage que les autres bancs. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules/.cache/verifie-regler-la-seance');
const sortie = path.join(dossier, 'harnais.mjs');
const fonction = path.join(dossier, 'fonction.cjs');
mkdirSync(dossier, { recursive: true });

try {
  const source = readFileSync(path.join(racine, 'supabase/functions/regler-la-seance/index.ts'), 'utf8')
    .replace(/^import \{ createClient \} from 'https:\/\/esm\.sh\/@supabase\/supabase-js@2';$/m, '');
  const { code } = await transform(source, { loader: 'ts', format: 'cjs', target: 'es2022' });
  writeFileSync(fonction, code);
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-regler-la-seance.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
    banner: {
      js: `const __m = new Map();
globalThis.localStorage = { getItem: (k) => (__m.has(k) ? __m.get(k) : null), setItem: (k, v) => __m.set(k, String(v)), removeItem: (k) => __m.delete(k) };
globalThis.window = { addEventListener() {}, dispatchEvent() {}, location: { href: '' }, setInterval() { return 0; }, clearInterval() {} };
globalThis.document = { body: { dataset: {} }, addEventListener() {} };
globalThis.CustomEvent = class { constructor(t, o) { this.type = t; Object.assign(this, o); } };`,
    },
  });
  process.env.REGLER_FONCTION = fonction;
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
