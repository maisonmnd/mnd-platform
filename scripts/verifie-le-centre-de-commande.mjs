import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE CENTRE DE COMMANDE, EPROUVE (11 octobre 2026).
   `node scripts/verifie-le-centre-de-commande.mjs [--prouve]` : validation,
   anonymisation, plafond, memoire tenue a ses sources, copies exactes dans
   la fonction, portes de la fonction et de l'ecran, consignes versionnees. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-centre-de-commande-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-centre-de-commande.harnais.ts')],
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
