import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

/* LA REVUE DU 10 OCTOBRE 2026, LOT « EQUIPE ET DOCUMENTS », EPROUVEE —
   `node scripts/verifie-revue-equipe-docs.mjs`.

   Le banc vit dans `verifie-revue-equipe-docs.harnais.ts` : les noms de la
   famille hors du depot public (82, 28), l'acompte de l'Academie tenu par la
   base (83), le dossier remis qui refuse une page illisible (87), le
   bulletin imprime qui dit le net du run (91), le module renomme qui garde
   ses seances (92), la demande du site relue au clic (93).

   Les mots de la famille ne sont PAS dans le depot : le banc les lit dans
   un fichier prive, sur le bureau (deux dossiers au-dessus du depot) ou au
   chemin donne par MND_MOTS_PRIVES ; sans lui, il echoue (reprise du 10
   octobre 2026). Le fils herite de l environnement.

   Le banc tourne dans un PROCESSUS FILS (il finit par `process.exit`) : le
   dossier temporaire s'efface toujours, dans le `finally`. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-revue-equipe-docs-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-revue-equipe-docs.harnais.ts')],
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
  const r = spawnSync(process.execPath, [sortie], { cwd: racine, stdio: 'inherit' });
  process.exitCode = r.status ?? 1;
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
