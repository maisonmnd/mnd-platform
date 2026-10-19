import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA FICHE DU JOUR, EPROUVEE — `node scripts/verifie-la-fiche-du-jour.mjs`.

   Chantier 7 des huit (19 octobre 2026) : la matiere anonymisee, la
   consigne, la relecture, la garde pour la journee, et la structure (le bloc
   dans la fiche du rendez-vous, garde par la porte, aucune tache de nuit).

   Le paquet s'ecrit sous node_modules/.cache, comme les autres bancs. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-fiche-du-jour');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-fiche-du-jour.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
