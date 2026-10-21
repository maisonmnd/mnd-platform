import { build } from 'esbuild';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/* LA FETE DE COURONNE, EPROUVEE — `node scripts/verifie-la-fete-de-couronne.mjs`.

   Le Club des Petites Couronnes (21 octobre 2026), lot 5 : la regle de
   l'anniversaire de couronne, et la VRAIE tournee de fete-de-couronne,
   rejouee contre une base simulee. Quand `src/shared/club-pur.ts` existe,
   on l'empaquette a part pour juger la copie bornee contre lui.

   Le paquet s'ecrit sous node_modules/.cache : le harnais y retrouve esbuild
   pour transpiler ce qu'il extrait de la fonction Deno. */

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'node_modules', '.cache', 'verifie-la-fete-de-couronne');
mkdirSync(dossier, { recursive: true });
const sortie = path.join(dossier, 'harnais.mjs');
const clubPur = path.join(racine, 'src/shared/club-pur.ts');

try {
  if (existsSync(clubPur)) {
    const paquet = path.join(dossier, 'club-pur.mjs');
    await build({ entryPoints: [clubPur], bundle: true, format: 'esm', platform: 'node', outfile: paquet, logLevel: 'error',
      define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' }) } });
    process.env.CLUB_PUR_PAQUET = paquet;
  }
  await build({
    entryPoints: [path.join(racine, 'scripts/verifie-la-fete-de-couronne.harnais.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: sortie,
    logLevel: 'error',
    external: ['esbuild'],
  });
  await import(pathToFileURL(sortie).href);
} finally {
  rmSync(dossier, { recursive: true, force: true });
}
