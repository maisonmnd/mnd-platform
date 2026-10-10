import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* UN AUTOMATISME QUI S'EMBALLE SE TAIT, EPROUVE — `node scripts/verifie-la-reprise-nue.mjs`.

   Deux postes, ou deux regles, qui se renvoient la meme fiche sans fin rendent
   l'ecran sourd. Au-dela de six passages par minute, l'automatisme se tait. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-reprise-nue-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-reprise-nue.harnais.ts')],
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
  /* DANS UN PROCESSUS FILS (10 octobre 2026). Importe ici, le banc finissait
     par `process.exit` et tuait le lanceur avant son `finally` : le dossier
     temporaire restait dans %TEMP% a chaque passage (89 dossiers comptes).
     Meme remede que verifie-le-carnet-dit-la-fenetre. */
  const r = spawnSync(process.execPath, [sortie], { cwd: racine, stdio: 'inherit' });
  process.exitCode = r.status ?? 1;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
