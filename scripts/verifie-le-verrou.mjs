import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE VERROU DE LA MAISON, EPROUVE (25 septembre 2026).

   Ses proportions vivent dans src/ds/verrou.ts, son dessin dans
   public/assets/verrous, sa mise en page dans revelateur.css et ses appels
   dans src/shared/pdf.ts. Le harnais refuse qu ils se separent, et refuse
   toute pose sous le plancher mesure.
 */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-verrou-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-verrou.harnais.ts')],
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
