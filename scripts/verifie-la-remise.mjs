import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA REMISE QUI REVIENT, EPROUVEE (11 octobre 2026).
   `node scripts/verifie-la-remise.mjs [--prouve]` : la regle pure, la ligne
   du bandeau jouee jour par jour, et le dist du site public, confrontes a la
   maquette validee. Avec --prouve, chaque panne doit faire crier sa regle. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-remise-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-remise.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    /* remise-pure lit la porte des offres, qui lit la base du site. */
    define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) },
  });
  process.chdir(racine);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
