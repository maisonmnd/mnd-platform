import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LE LIVRE DES CRÉDITS, ÉPROUVÉ : `node scripts/verifie-le-livre-des-credits.mjs`.

   Le harnais (verifie-le-livre-des-credits.harnais.ts) importe le vrai module
   pur (src/shared/maison-intelligente-pur.ts) et lit l'écran « Les
   assistants » ; on le bundle avec esbuild (déjà là via Vite). Aucun
   framework de test n'entre au dépôt : un échec sort en code 1. Le banc se
   place à la racine du dépôt, d'où il lit les fichiers. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-le-livre-des-credits-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-le-livre-des-credits.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) },
  });
  process.chdir(racine);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
