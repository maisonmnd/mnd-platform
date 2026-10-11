import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* L'ATELIER DES CONTENUS, EPROUVE (11 octobre 2026, phase 2).
   `node scripts/verifie-l-atelier-des-contenus.mjs [--prouve]` : gardien de
   la marque, statuts et validation, plans importes, rythme de l'usine,
   seance et script, article lu par le lecteur du site, portes de l'ecran et
   de la fonction, rien de nominatif, rien de publie tout seul. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-l-atelier-des-contenus-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-l-atelier-des-contenus.harnais.ts')],
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
