import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA RÉSERVATION DU SITE, ÉPROUVÉE : `node scripts/verifie-la-reservation-du-site.mjs`.

   Les sept changements du 3 novembre 2026 sur maisonmnd.com, côté page : la
   barre du total, la présélection, la référence, le chargeur et son repli,
   le retour d'une cliente, la page du rendez-vous. Le harnais
   (verifie-la-reservation-du-site.harnais.ts) éprouve les règles pures, lit
   les sources à des ancres précises, puis plante des pannes dans les textes,
   EN MÉMOIRE, et vérifie que chacune est criée. Aucun framework de test :
   un échec sort en code 1. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = mkdtempSync(path.join(tmpdir(), 'verifie-la-reservation-du-site-'));
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-reservation-du-site.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    loader: { '.css': 'empty' },
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', BASE_URL: '/' }) },
  });
  process.chdir(racine);
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
