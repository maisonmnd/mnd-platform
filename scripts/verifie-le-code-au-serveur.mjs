import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE CODE AU SERVEUR, EPROUVE (24 septembre 2026).

   La copie du code de l offre dans la fonction Edge demande-submit est
   confrontee a l original (offres-pur.ts) sur les memes cas, au franc pres.
   La copie est lue entre ses reperes puis transpilee avec esbuild ; le
   fichier Edge lui-meme n est jamais importe (npm: et Deno.serve).
 */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-code-au-serveur-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-code-au-serveur.harnais.ts')],
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
