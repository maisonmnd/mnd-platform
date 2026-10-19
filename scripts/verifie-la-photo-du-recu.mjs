import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA PHOTO QUI REMPLIT LA DEPENSE, EPROUVEE — `node scripts/verifie-la-photo-du-recu.mjs`.

   Chantier `recu` des huit (19 octobre 2026) : la lecture d'un recu et d'un
   cheque revalidee, la consigne, et la structure des ecrans (le bouton garde
   par useSaitIaMaison et peutDemander ; la depense passe par le chemin de la
   saisie a la main ; rien d'inscrit sans « Enregistrer » ; la photo jointe).

   Le paquet s'ecrit sous node_modules/.cache, puis s'efface. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-photo-du-recu');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'harnais.mjs');

try {
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-photo-du-recu.harnais.ts')],
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
