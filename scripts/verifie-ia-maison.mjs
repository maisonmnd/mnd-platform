import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA PORTE VERS CLAUDE, EPROUVEE — `node scripts/verifie-ia-maison.mjs`.

   La fonction `ia-maison` (19 octobre 2026) : la regle, le vrai code du
   serveur rejoue sur de faux outils (jamais la vraie fonction, jamais
   Anthropic), les copies, la structure.

   Le paquet s'ecrit sous node_modules/.cache : le harnais y retrouve esbuild
   pour transpiler ce qu'il extrait de la fonction Deno. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-ia-maison');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-ia-maison.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    external: ['esbuild'],
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
