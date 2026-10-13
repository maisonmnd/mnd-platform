import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA RECHERCHE DEPUIS LE TRONE, EPROUVEE (13 octobre 2026).
   `node scripts/verifie-la-recherche.mjs [--prouve]` : aucun appel aux
   modeles, barrieres sur ce qui part, lien qui tient, historique de trente
   jours, bouton aux fondateurs. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-recherche-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-recherche.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    /* Rien ici ne lit la base du site, mais on garde la meme definition. */
    define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) },
  });
  process.chdir(racine);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
