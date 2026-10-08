import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA LUMIERE ET LA FIN, EPROUVEES (8 octobre 2026).
   `node scripts/verifie-la-lumiere.mjs [--prouve]` : le dist du site public,
   la feuille, le generateur, main.ts et tons.ts, confrontes aux promesses du
   cahier du 8 octobre. Avec --prouve, chaque regle est rejouee sur une copie
   ou sa panne est injectee, et doit crier. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-lumiere-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-lumiere.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
  });
  process.chdir(racine);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
