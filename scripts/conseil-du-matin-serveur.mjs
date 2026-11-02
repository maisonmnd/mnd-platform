/* LE FICHIER DE LA FONCTION « conseil-du-matin » - 2 novembre 2026,
   sur le modele exact de assistants-maison-serveur.mjs.

     node scripts/conseil-du-matin-serveur.mjs            reecrit le fichier
     node scripts/conseil-du-matin-serveur.mjs --verifie  dit seulement s il est a jour

   `verifie-le-conseil-du-matin` appelle `fichierAttendu` et crie si le fichier
   deploye a pris du retard sur le depot. */
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = 'scripts/serveur/conseil-du-matin.ts';
export const CIBLE = 'supabase/functions/conseil-du-matin/index.ts';

const ENTETE = `// @ts-nocheck : fichier REGROUPÉ, ne pas modifier à la main.
/* ═══════════════════════════════════════════════════════════════════
   CONSEIL-DU-MATIN : Saphir, version simple. Chaque matin à 7 h (Cotonou),
   la page de la direction : ce qui presse, hier, aujourd'hui, les dix
   professionnels, les crédits, et le lundi le chiffre du lundi.

   Fichier fabriqué par \`node scripts/conseil-du-matin-serveur.mjs\` depuis
   \`scripts/serveur/conseil-du-matin.ts\` et les modules purs du dépôt
   (conseil-du-matin-pur, maison-intelligente-pur, assistants-pur) : on ne
   le corrige jamais ici, on corrige le dépôt et on refait le fichier.

   Appelée par le cron \`conseil-du-matin\` (0151) avec la clé service, et
   par l'écran « Les assistants » du Trône avec la session d'un souverain.
   Aucun appel à Claude.

   AUCUN SECRET ICI : SUPABASE_URL, CLE_SERVICE (ou SUPABASE_SERVICE_ROLE_KEY)
   viennent de l'environnement (déjà posés).

   Déploiement : \`node scripts/mise-en-ligne.mjs fonction conseil-du-matin
   --commit <sha> --jwt non\` (la porte est jugée ici : la clé service, ou le
   JWT d'un souverain). Vérifier : son adresse répond sa version.
   ═══════════════════════════════════════════════════════════════════ */
`;

/** Le fichier tel qu'il doit être, regroupé depuis le dépôt. */
export async function fichierAttendu(r = racine) {
  const res = await build({
    entryPoints: [path.join(r, SOURCE)],
    bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', write: false,
    external: ['npm:*'], charset: 'utf8', legalComments: 'none', logLevel: 'silent',
    mainFields: ['module', 'main'],
  });
  const code = res.outputFiles[0].text.replace(/\r\n/g, '\n');
  return `${ENTETE}${code}`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const voulu = await fichierAttendu();
  const cible = path.join(racine, CIBLE);
  let present = '';
  try { present = readFileSync(cible, 'utf8').replace(/\r\n/g, '\n'); } catch { /* pas encore fabriqué */ }
  if (process.argv.includes('--verifie')) {
    console.log(present === voulu ? 'Le fichier de la fonction est a jour.' : 'A REFAIRE : node scripts/conseil-du-matin-serveur.mjs');
    process.exit(present === voulu ? 0 : 1);
  }
  mkdirSync(path.dirname(cible), { recursive: true });
  writeFileSync(cible, voulu);
  console.log(`${CIBLE} : ${voulu.split('\n').length} lignes${present === voulu ? ' (deja a jour)' : ''}`);
}
