import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA PUBLICATION, EPROUVEE (23 septembre 2026).

   publie.mjs refuse un dist plus vieux que sa source ; le harnais le prouve
   sur des dossiers fabriques, sans rien cloner ni publier. publie.mjs n est
   pas empaquete : le harnais l importe a l execution depuis la racine, pour
   que ses chemins restent ceux du depot.
 */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-publication-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-publication.harnais.ts')],
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
